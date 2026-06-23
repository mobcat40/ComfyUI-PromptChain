from __future__ import annotations

import hashlib
import json

import torch
import torch.nn.functional as F

from comfy_api.latest import io


def _parse_boxes(box_state: str) -> list[dict]:
    """Read the canvas's serialized boxes: [{name, x, y, w, h}] normalized 0-1,
    top-left origin. Tolerant of a bare list or a {boxes:[...]} wrapper, and
    skips malformed entries rather than 500-ing the node."""
    try:
        data = json.loads(box_state) if (box_state and box_state.strip()) else []
    except (json.JSONDecodeError, TypeError):
        return []
    raw = data.get("boxes", []) if isinstance(data, dict) else data
    out = []
    if isinstance(raw, list):
        for b in raw:
            if not isinstance(b, dict):
                continue
            try:
                x, y, w, h = float(b["x"]), float(b["y"]), float(b["w"]), float(b["h"])
            except (KeyError, TypeError, ValueError):
                continue
            out.append({"name": str(b.get("name", "")).strip(), "x": x, "y": y, "w": w, "h": h})
    return out


def _feather(mask: torch.Tensor, px: int) -> torch.Tensor:
    """Soft falloff on a [1,H,W] mask via a separable gaussian.

    Hard rectangle masks seam on Flux regional conditioning (its mask blend has
    no implicit smoothing); a few px of feather removes the visible region edge.
    px<=0 keeps the mask hard — SDXL attention-couple tolerates hard edges, and
    the consumers' own mask_dilation already grows the region outward.
    """
    if px <= 0:
        return mask
    radius = int(px)
    sigma = max(px / 2.0, 0.5)
    xs = torch.arange(-radius, radius + 1, dtype=torch.float32)
    k = torch.exp(-(xs ** 2) / (2.0 * sigma * sigma))
    k = k / k.sum()
    m = mask.unsqueeze(0)  # [1,1,H,W]
    m = F.conv2d(m, k.view(1, 1, -1, 1), padding=(radius, 0))
    m = F.conv2d(m, k.view(1, 1, 1, -1), padding=(0, radius))
    return m.squeeze(0).clamp(0.0, 1.0)


class RegionBoxNode(io.ComfyNode):
    """Drawn region rectangles -> per-region masks (+ entity order).

    A canvas in the node body lets you draw and name rectangles; each becomes a
    rectangular mask at the generation resolution. The MASKS + POSE_JSON outputs
    drop into PromptChain_AttentionCouple (SDXL) or PromptChain_RegionalConditioning
    (Flux) exactly like the 3D Poser's outputs, so each `$name{}` block in the
    prompt paints only inside its box. The heavy work is just rasterizing
    rectangles, so it happens here from the serialized box list — the canvas does
    no rendering.

    Mask rows AND regionEntities are built in ONE pass so their order is
    identical (the consumers bind a `$name{}` block to a mask row by entity
    order/name). fingerprint_inputs hashes the box layout so editing a box
    invalidates the sampler cache.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="PromptChain_RegionBox",
            display_name="PromptChain Region Boxes",
            category="promptchain",
            inputs=[
                # Serialized boxes (JSON), written by the canvas. The frontend
                # hides this widget (the canvas is the editor, not a text field)
                # but keeps it serializable so the layout round-trips into the
                # workflow and feeds the fingerprint.
                io.String.Input("box_state", default="", socketless=True),
                # Mask resolution. The canvas letterboxes to this aspect so what
                # you draw is the output frame; auto-synced to the generation
                # latent (e.g. SDXL 832×1216 portrait).
                io.Int.Input("width", default=832, min=64, max=4096, step=8),
                io.Int.Input("height", default=1216, min=64, max=4096, step=8),
                io.Int.Input("feather", default=0, min=0, max=128, step=1,
                             tooltip="Soft edge in px. 0 = hard rectangles (fine for SDXL "
                                     "attention couple); raise to ~24-48 to remove region "
                                     "seams on Flux regional conditioning."),
            ],
            outputs=[
                # Per-region rectangular masks in box order. Empty layout -> one
                # full-canvas mask so a downstream regional node stays valid.
                io.Mask.Output("MASKS"),
                # Region entities in mask-row order (the binding contract the
                # consumers read via their `pose` input).
                io.String.Output("POSE_JSON"),
            ],
        )

    @classmethod
    def execute(cls, box_state: str = "", width: int = 832, height: int = 1216,
                feather: int = 0) -> io.NodeOutput:
        boxes = _parse_boxes(box_state)
        rows: list[torch.Tensor] = []
        entities: list[dict] = []
        for i, b in enumerate(boxes):
            m = torch.zeros((1, height, width), dtype=torch.float32)
            x0 = int(round(min(max(b["x"], 0.0), 1.0) * width))
            y0 = int(round(min(max(b["y"], 0.0), 1.0) * height))
            x1 = int(round(min(max(b["x"] + b["w"], 0.0), 1.0) * width))
            y1 = int(round(min(max(b["y"] + b["h"], 0.0), 1.0) * height))
            x0, x1 = sorted((x0, x1))
            y0, y1 = sorted((y0, y1))
            if x1 > x0 and y1 > y0:
                m[0, y0:y1, x0:x1] = 1.0
            rows.append(_feather(m, feather))
            # kind=figure: the binding/orphan logic counts figures and clamps
            # unmatched blocks into figure space — a drawn region is a figure-role
            # entity (a named prop is a poser-only concept).
            # bbox: the same rect in Ideogram's caption form [y_min,x_min,y_max,x_max]
            # on a 0-1000 grid (top-left origin). Mask consumers ignore it; the
            # Ideogram caption node uses it to place each region's element.
            iy0 = int(round(min(max(b["y"], 0.0), 1.0) * 1000))
            ix0 = int(round(min(max(b["x"], 0.0), 1.0) * 1000))
            iy1 = int(round(min(max(b["y"] + b["h"], 0.0), 1.0) * 1000))
            ix1 = int(round(min(max(b["x"] + b["w"], 0.0), 1.0) * 1000))
            iy0, iy1 = sorted((iy0, iy1))
            ix0, ix1 = sorted((ix0, ix1))
            entities.append({
                "name": (b["name"] or f"region{i + 1}").lower(),
                "kind": "figure",
                "bbox": [iy0, ix0, iy1, ix1],
            })

        if not rows:
            masks = torch.ones((1, height, width), dtype=torch.float32)
        else:
            masks = torch.cat(rows, dim=0)

        pose_json = json.dumps({"version": 3, "regionEntities": entities})
        return io.NodeOutput(masks, pose_json)

    @classmethod
    def fingerprint_inputs(cls, box_state: str = "", width: int = 832,
                           height: int = 1216, feather: int = 0):
        m = hashlib.sha256()
        m.update((box_state or "").encode("utf-8"))
        m.update(f"{width}x{height}x{feather}".encode("utf-8"))
        return m.digest().hex()
