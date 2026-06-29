from __future__ import annotations

import glob
import hashlib
import os
import re

import numpy as np
import torch
from PIL import Image

import folder_paths
import node_helpers
from comfy_api.latest import io

_HASHED_BASE_RE = re.compile(r"^promptchain_pose_[0-9a-f]{12}$")


class PoseStudioNode(io.ComfyNode):
    """Posable 3D figure -> control map (clay render / white pose-anchor / depth).

    The figure is posed in a Three.js viewport rendered in the node body.
    On every pose change the viewport renders the chosen control map, uploads
    the PNG to ComfyUI's input dir, and writes the filename into `control_map`
    plus the serialized pose into `pose_state`. Execution just reloads that PNG
    and emits it as IMAGE, so the heavy work stays client-side and the graph
    only ever sees a finished control image.

    fingerprint_inputs hashes the uploaded PNG so re-posing invalidates the
    sampler cache — the bug that makes every other 3D-pose node render stale.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="PromptChain_PoseStudio",
            display_name="PromptChain 3D Poser",
            category="promptchain",
            inputs=[
                # Filename of the rendered control map in the input dir, set by
                # the viewport after it uploads via /upload/image. The frontend
                # hides this widget (the node body is the viewport, not a text
                # field) but keeps it serializable so the filename reaches here.
                io.String.Input("control_map", default="", socketless=True),
                # Serialized pose/morph state (JSON) — round-trips the pose into
                # the workflow and feeds the fingerprint so identical poses cache.
                io.String.Input("pose_state", default="", socketless=True),
                # Control-map resolution. The viewport letterboxes to this aspect
                # so what you pose is the output frame; set it to match the
                # generation latent (e.g. SDXL 832×1216 portrait).
                io.Int.Input("width", default=832, min=64, max=4096, step=8),
                io.Int.Input("height", default=1216, min=64, max=4096, step=8),
            ],
            outputs=[
                io.Image.Output("IMAGE"),
                io.String.Output("POSE_JSON"),
                # Per-entity silhouette masks (figures in figure order, then
                # NAMED props), rendered client-side by captureRegionMasks and
                # reloaded here. Feeds regional conditioning. Empty (single
                # full-canvas mask) when fewer than two region entities, so
                # wiring stays valid.
                io.Mask.Output("MASKS"),
            ],
        )

    @classmethod
    def _load_figure_masks(cls, width: int, height: int, control_map_path: str = None) -> torch.Tensor:
        """Reload the per-figure mask PNGs the viewport uploaded with the map.

        Mirrors how the control map is reloaded: the heavy render is client-side,
        Python just reads the files. Masks live beside the map as
        <map-base>_mask<i>.png (<i> = figure index, capture order), so the
        content-addressed map filename pins exactly its own scene's masks.
        """
        paths = []
        if control_map_path:
            base_noext = os.path.splitext(control_map_path)[0]
            paths = glob.glob(glob.escape(base_noext) + "_mask*.png")

        # Staleness gate for LEGACY node-id-named sets (promptchain_pose_<id>):
        # those overwrite in place and collide across workflows, so masks
        # meaningfully older than the control map describe a DIFFERENT scene (a
        # single-figure scene after a multi-figure one, or another workflow with
        # the same node id) and would zero out the regional detailer's
        # silhouette intersection. Content-addressed sets upload masks right
        # after their map and can't go stale, so they pass this untouched.
        if paths and control_map_path and os.path.exists(control_map_path):
            try:
                map_mtime = os.path.getmtime(control_map_path)
                if max(os.path.getmtime(p) for p in paths) < map_mtime - 5:
                    print(f"[PoseStudio] ignoring {len(paths)} stale mask file(s) "
                          "(older than the control map — different scene)")
                    paths = []
            except OSError:
                # A concurrent delete/overwrite (legacy in-place set) between the
                # glob and these stats — skip the staleness check rather than 500;
                # the per-file read loop below already tolerates missing files.
                pass

        def mask_index(p):
            m = re.search(r"_mask(\d+)\.png$", p)
            return int(m.group(1)) if m else 0

        paths.sort(key=mask_index)
        masks = []
        for p in paths:
            try:
                img = node_helpers.pillow(Image.open, p).convert("L")
                if img.size != (width, height):
                    img = img.resize((width, height), Image.NEAREST)
                # Binarize: masks captured by older builds carry the figure's
                # SHADING (~0.6 gray body) from lit materials, and a capture
                # race could leave later figures' backgrounds at the viewport
                # gray (#24242B ≈ 37) instead of black. Threshold above that
                # pollution: figure pixels are ≥ ~140 in every capture era
                # (flat white now, lit body before), background is 0 or ≤ 43.
                # Without this, mask-multiplying consumers (regional detailer)
                # are strength-capped or, worse, see a full-canvas region.
                masks.append(torch.from_numpy((np.array(img) > 64).astype(np.float32)))
            except (OSError, ValueError) as e:
                print(f"[PoseStudio] mask unreadable ({p}): {e}; skipping")

        if not masks:
            # No regional masks (single figure / nothing captured) — one full-canvas
            # mask keeps a downstream regional node valid (whole frame = one region).
            return torch.ones((1, height, width), dtype=torch.float32)
        return torch.stack(masks, dim=0)

    @classmethod
    def _pin_capture_set(cls, control_map_path: str) -> None:
        """Mark a rendered content-addressed capture set permanent.

        A pose set an actual render consumed must outlive any later re-pose: the
        viewport deletes the *previous* set on every re-pose, and a 30-day sweep
        collects stragglers. But a set already baked into a generated image must
        never be GC'd — that image's per-figure regional masks live ONLY here,
        so losing them makes the image impossible to re-pose or regionally
        upscale. The sibling `.keep` marker is what the delete route and the
        sweep check before removing anything. Legacy node-id sets are shared
        across workflows and hand-managed, so they are never auto-pinned.
        """
        base = os.path.splitext(os.path.basename(control_map_path))[0]
        if not _HASHED_BASE_RE.match(base) or base.rsplit("_", 1)[-1].isdigit():
            return
        marker = os.path.join(os.path.dirname(control_map_path), base + ".keep")
        if not os.path.exists(marker):
            try:
                open(marker, "w").close()
            except OSError:
                pass

    @classmethod
    def execute(cls, control_map: str = "", pose_state: str = "",
                width: int = 832, height: int = 1216) -> io.NodeOutput:
        path = folder_paths.get_annotated_filepath(control_map) if (control_map and control_map.strip()) else None
        # Guard the load: a workflow can carry a control_map filename whose file was since
        # cleared from the input dir (or is unreadable). Without this, Image.open raises and
        # the node 500s; instead fall through to the black image, matching fingerprint_inputs.
        if path and os.path.exists(path):
            cls._pin_capture_set(path)  # this render consumes the set — pin it so no later re-pose deletes it
            try:
                img = node_helpers.pillow(Image.open, path)
                img = img.convert("RGB")
                # The viewport renders at width×height already; resize is just a
                # guard against a stale upload at the previous resolution.
                if img.size != (width, height):
                    img = img.resize((width, height), Image.LANCZOS)
                arr = np.array(img).astype(np.float32) / 255.0
                out_image = torch.from_numpy(arr).unsqueeze(0)
            except (OSError, ValueError) as e:
                print(f"[PoseStudio] control map unreadable ({path}): {e}; emitting black")
                out_image = torch.zeros((1, height, width, 3), dtype=torch.float32)
        else:
            # No render yet, or the referenced file is gone (cleared input dir /
            # GC'd capture set) — emit black at the target size so downstream
            # wiring stays valid, but say so: a silently-black control map looks
            # like a model problem, not a missing file.
            if path:
                print(f"[PoseStudio] control map missing ({control_map}) — "
                      "reopen the workflow in the frontend to re-render it; emitting black")
            out_image = torch.zeros((1, height, width, 3), dtype=torch.float32)

        # No UI preview — the 3D viewport already shows the pose, and the rendered
        # control map equals what's framed there, so a second thumbnail is redundant.
        masks = cls._load_figure_masks(width, height, path)
        return io.NodeOutput(out_image, pose_state, masks)

    @classmethod
    def fingerprint_inputs(cls, control_map: str = "", pose_state: str = "",
                           width: int = 832, height: int = 1216):
        dims = f"{width}x{height}"
        if control_map and control_map.strip():
            path = folder_paths.get_annotated_filepath(control_map)
            if os.path.exists(path):
                try:
                    m = hashlib.sha256()
                    with open(path, "rb") as f:
                        m.update(f.read())
                    m.update(pose_state.encode("utf-8"))
                    m.update(dims.encode("utf-8"))
                    return m.digest().hex()
                except OSError:
                    # File vanished between exists() and open (re-pose / GC race) —
                    # fall through to the no-file fingerprint rather than crashing.
                    pass
        return pose_state + dims
