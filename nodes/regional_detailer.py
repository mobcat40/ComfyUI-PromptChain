from __future__ import annotations

import json
import logging
import math
import os
import re

import torch
import torch.nn.functional as F

import comfy.samplers
import comfy.utils
import folder_paths
import nodes as comfy_nodes
from comfy_api.latest import io

from ..core.compiler import (figure_entity_names, region_figure_count,
                             region_figure_indices, region_orphans)

log = logging.getLogger("promptchain.regional_detailer")


# ── Clean-room MIT regional face detailing ─────────────────────────────────
# A single face-detail pass re-renders every face with ONE conditioning,
# stripping per-character identity in regional scenes. This node detects faces
# itself (ultralytics YOLO, no Impact code), matches each face to a region by
# MASK OVERLAP (not detection order), and runs the standard detail technique —
# crop, upscale to a guide size, partial-denoise sample with that region's
# conditioning, feather-composite back — implemented from scratch.

FACE_MODEL = "face_yolov8n.pt"
_yolo_cache: dict[str, object] = {}


def _face_model_path() -> str:
    # Impact's subpack registers "ultralytics" with folder_paths, but don't
    # depend on it being installed — fall back to the conventional location.
    try:
        path = folder_paths.get_full_path("ultralytics", f"bbox/{FACE_MODEL}")
        if path:
            return path
    except KeyError:
        pass
    path = os.path.join(folder_paths.models_dir, "ultralytics", "bbox", FACE_MODEL)
    if os.path.exists(path):
        return path
    raise FileNotFoundError(
        f"[RegionalDetailer] face detector not found: models/ultralytics/bbox/{FACE_MODEL} "
        "— download face_yolov8n.pt into that folder.")


def _detect_faces(image_hwc: torch.Tensor, threshold: float) -> list[tuple[int, int, int, int]]:
    """Run YOLO face detection on one [H,W,C] 0..1 image; return pixel bboxes."""
    try:
        from ultralytics import YOLO
    except ImportError as e:
        raise ImportError(
            "[RegionalDetailer] requires the 'ultralytics' package "
            "(pip install ultralytics).") from e

    path = _face_model_path()
    if path not in _yolo_cache:
        _yolo_cache[path] = YOLO(path)
    np_img = (image_hwc.cpu().numpy() * 255.0).clip(0, 255).astype("uint8")
    results = _yolo_cache[path](np_img, conf=threshold, verbose=False)
    boxes = []
    for x1, y1, x2, y2 in results[0].boxes.xyxy.cpu().numpy():
        boxes.append((int(x1), int(y1), int(x2), int(y2)))
    return boxes


def _mannequin_faces(pose_json: str, img_w: int, img_h: int,
                     max_angle_deg: float) -> list[tuple[tuple[int, int, int, int], int]]:
    """[(pixel bbox, figure index)] from the Poser's exported head boxes,
    keeping only heads whose face normal is within `max_angle_deg` of the
    camera. Deterministic recall: the rig knows a head exists (and which way it
    looks) even when a face detector can't see eyes/nose in a tilted profile.
    Boxes arrive normalized 0..1 in the capture frame, hair-inflated by the
    exporter, and carry exact figure identity — no overlap matching needed."""
    try:
        heads = json.loads(pose_json).get("heads") or []
    except (json.JSONDecodeError, TypeError, AttributeError):
        return None  # no head data at all (unwired / pre-export pose state)
    if not heads:
        return None
    log.info("pose head data: %d head(s), frame %dx%d", len(heads), img_w, img_h)
    min_dot = math.cos(math.radians(max_angle_deg))
    faces = []
    for i, h in enumerate(heads):
        box = h.get("box") if isinstance(h, dict) else None
        facing = h.get("facing", -1.0) if isinstance(h, dict) else -1.0
        angle = math.degrees(math.acos(max(-1.0, min(1.0, facing))))
        if not box:
            log.info("head %d: no box (behind camera) — skipped", i)
            continue
        if facing < min_dot:
            log.info("head %d: facing %.2f (%.0f° off camera) > %d° limit — skipped",
                     i, facing, angle, max_angle_deg)
            continue
        x1, y1 = int(box[0] * img_w), int(box[1] * img_h)
        x2, y2 = int(box[2] * img_w), int(box[3] * img_h)
        if x2 > x1 and y2 > y1:
            log.info("head %d: facing %.2f (%.0f° off camera) box (%d,%d,%d,%d) — detailing",
                     i, facing, angle, x1, y1, x2, y2)
            faces.append(((x1, y1, x2, y2), i))
        else:
            log.info("head %d: facing %.2f but box %s degenerate at %dx%d — skipped",
                     i, facing, box, img_w, img_h)
    return faces


# A face crop re-sampled with composition or non-head-anatomy directives tries
# to satisfy them INSIDE the crop — "foot focus" paints toes across a cheek.
# Strip tags that direct the camera, body pose, or below-the-neck anatomy;
# identity, hair, expression, and outfit tags pass through untouched.
_NON_FACE_TAG_WORDS = {
    "focus", "foot", "feet", "toe", "toes", "toenails", "sole", "soles",
    "barefoot", "leg", "legs", "thigh", "thighs", "knee", "knees", "kneeling",
    "ankle", "ankles", "hip", "hips", "ass", "butt", "crotch", "navel",
    "midriff", "breast", "breasts", "cleavage", "nipple", "nipples",
    "armpit", "armpits", "underboob", "sideboob",
    "standing", "sitting", "lying", "squatting", "crouching",
    "straddling", "walking", "running", "jumping",
}
_NON_FACE_TAGS = {
    "full body", "lower body", "upper body", "cowboy shot", "wide shot",
    "very wide shot", "dutch angle", "from above", "from below", "from behind",
    "from side", "pov", "close-up", "on back", "on stomach", "on side",
    "all fours", "bent over", "leaning forward", "leaning back", "arm up",
    "arms up", "hand up", "hands up", "arms behind back", "arms behind head",
}


def _tag_core(tag: str) -> str:
    """Comparison form of one prompt tag: weight/emphasis markup off,
    lowercase, underscores as spaces — "(Foot_Focus:1.3)" -> "foot focus"."""
    t = tag.strip().strip("()[]").strip()
    t = re.sub(r":\d+(?:\.\d+)?$", "", t).strip()
    return t.lower().replace("_", " ")


def _strip_non_face_tags(text: str) -> str:
    kept, dropped = [], []
    for tag in text.split(","):
        tag = tag.strip()
        if not tag:
            continue
        core = _tag_core(tag)
        if core in _NON_FACE_TAGS or set(core.split()) & _NON_FACE_TAG_WORDS:
            dropped.append(core)
        else:
            kept.append(tag)
    if dropped:
        log.info("face prompt: dropped non-face tags [%s]", ", ".join(dropped))
    return ", ".join(kept)


def _match_region(bbox, region_masks: torch.Tensor, min_coverage: float = 0.1) -> int:
    """Index of the region whose mask best covers the face bbox, or -1 for
    global (no region clears `min_coverage` mean mask value inside the box)."""
    x1, y1, x2, y2 = bbox
    patch = region_masks[:, y1:y2, x1:x2]  # [N, bh, bw]
    if patch.numel() == 0:
        return -1
    coverage = patch.mean(dim=(1, 2))
    best = int(coverage.argmax())
    return best if float(coverage[best]) >= min_coverage else -1


def _face_weight_mask(h: int, w: int, face_rect, feather: int) -> torch.Tensor:
    """[H,W] weight: 1 inside the face rect, falling linearly to 0 over
    `feather` px outside it (Chebyshev distance → rounded-box falloff). Used as
    both the sampling noise mask and the composite blend, so only the face is
    re-rendered and the crop's context pixels never change."""
    fx1, fy1, fx2, fy2 = face_rect
    ys = torch.arange(h).view(-1, 1).float()
    xs = torch.arange(w).view(1, -1).float()
    dy = (fy1 - ys).clamp(min=0) + (ys - (fy2 - 1)).clamp(min=0)
    dx = (fx1 - xs).clamp(min=0) + (xs - (fx2 - 1)).clamp(min=0)
    dist = torch.maximum(dx, dy)
    if feather <= 0:
        return (dist == 0).float()
    return (1.0 - dist / feather).clamp(0.0, 1.0)


def _crop_noise_mask(crop_h: int, crop_w: int, face_rect, feather: int,
                     region_crop: torch.Tensor | None, mask_dilation: int) -> torch.Tensor:
    """[H,W] sampling/composite weight for one face crop: the feathered face
    box, intersected with the figure's silhouette when one is available — a
    head-shaped mask anchors skin tone to the unchanged body and keeps the
    background inside the box from being repainted (the box alone re-renders
    background corners → visible tone seam)."""
    box = _face_weight_mask(crop_h, crop_w, face_rect, feather)
    if region_crop is None:
        return box
    m = region_crop.view(1, 1, crop_h, crop_w).float()
    if mask_dilation > 0:  # rendered hair/headgear overshoots the mannequin silhouette
        m = F.max_pool2d(m, kernel_size=mask_dilation * 2 + 1, stride=1, padding=mask_dilation)
    if feather > 0:  # soften the silhouette's hard edge to match the box falloff
        k = feather | 1
        m = F.avg_pool2d(m, kernel_size=k, stride=1, padding=k // 2)
    return box * m.view(crop_h, crop_w)


def _crop_hint_to_window(t, win, img_h, img_w, sh, sw):
    """Resize a (...,H,W) hint to canvas, crop the detail window, resize to the
    sampled crop dims — the per-crop remap the tiled upscaler does."""
    cx1, cy1, cx2, cy2 = win
    t = t.float()
    if t.shape[-2:] != (img_h, img_w):
        t = F.interpolate(t, size=(img_h, img_w), mode="bilinear", align_corners=False)
    t = t[..., cy1:cy2, cx1:cx2]
    return F.interpolate(t, size=(sh, sw), mode="bilinear", align_corners=False)


def _crop_cond_to_window(cond, mask_win, ctrl_win, img_h: int, img_w: int, sh: int, sw: int):
    """Crop every region mask AND ControlNet hint in a conditioning to the
    detail window and rescale to the sampled crop dims, so RegionalConditioning's
    full-canvas masks and a depth ControlNet's full-canvas hint line up with the
    cropped+upscaled latent (the same remap the tiled upscaler does per tile —
    without it the whole scene stretches over the crop). Conds with neither
    (plain text encodes, face-detail passes) pass through untouched, so this is
    a no-op for every non-regional, non-depth caller.

    mask_win and ctrl_win usually equal the image crop window. They DIFFER for
    moved-content inpaint: the painted pixels sit away from their scene spot, so
    the region MASKS are read at the origin (mask_win shifted to where the
    content came from) while the depth hint, which is of the moved pixels
    themselves, stays at the image window (ctrl_win). That makes a moved figure
    keep its OWN region prompt wherever it landed."""
    if not cond:
        return cond
    out = []
    for item in cond:
        emb = item[0]
        meta = item[1] if len(item) > 1 and isinstance(item[1], dict) else {}
        m = meta.get("mask")
        ctrl = meta.get("control")
        if m is None and ctrl is None:
            out.append(item)
            continue
        new_meta = dict(meta)
        if m is not None:
            mm = m.float()
            if mm.dim() == 2:
                mm = mm.unsqueeze(0)
            new_meta["mask"] = _crop_hint_to_window(mm.unsqueeze(1), mask_win, img_h, img_w, sh, sw).squeeze(1)
        if ctrl is not None:
            # Walk the ControlNet chain, cropping each hint — mirrors the
            # tiled upscaler's crop_controlnet. Best-effort: a control object
            # whose internals differ just keeps its (misaligned) hint rather
            # than 500ing the whole inpaint, so depth degrades, never breaks.
            try:
                new_ctrl = ctrl.copy()
                new_meta["control"] = new_ctrl
                c, nc = ctrl, new_ctrl
                while c is not None:
                    nc.cond_hint_original = _crop_hint_to_window(
                        nc.cond_hint_original, ctrl_win, img_h, img_w, sh, sw)
                    c = c.previous_controlnet
                    nc.set_previous_controlnet(c.copy() if c is not None else None)
                    nc = nc.previous_controlnet
            except Exception as e:  # noqa: BLE001 — diagnostic, never fatal
                log.warning("control-hint crop failed (%s); leaving hint uncropped", e)
                new_meta["control"] = ctrl
        out.append([emb, new_meta])
    return out


def _detail_crop(image_hwc: torch.Tensor, bbox, model, vae, positive, negative,
                 seed, steps, cfg, sampler_name, scheduler, denoise,
                 crop_factor, guide_size, max_size, feather,
                 region_mask: torch.Tensor | None, mask_dilation: int,
                 cond_offset_x: int = 0, cond_offset_y: int = 0) -> None:
    """Detail one face in-place on `image_hwc` ([H,W,C] 0..1)."""
    img_h, img_w = image_hwc.shape[:2]
    x1, y1, x2, y2 = bbox
    face_w, face_h = x2 - x1, y2 - y1
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2

    crop_w = min(int(face_w * crop_factor), img_w)
    crop_h = min(int(face_h * crop_factor), img_h)
    cx1 = max(0, min(int(cx - crop_w / 2), img_w - crop_w))
    cy1 = max(0, min(int(cy - crop_h / 2), img_h - crop_h))
    cx2, cy2 = cx1 + crop_w, cy1 + crop_h

    # Upscale so the face spans ~guide_size px (never downscale), capped so the
    # whole crop stays within max_size. Sample dims must be multiples of 8.
    scale = max(1.0, guide_size / max(face_w, face_h))
    scale = min(scale, max_size / max(crop_w, crop_h))
    sw = max(8, round(crop_w * scale / 8) * 8)
    sh = max(8, round(crop_h * scale / 8) * 8)

    crop = image_hwc[cy1:cy2, cx1:cx2, :].unsqueeze(0)  # [1,h,w,C]
    sampled_in = comfy.utils.common_upscale(
        crop.movedim(-1, 1), sw, sh, "lanczos", "disabled").movedim(1, -1)

    face_rect = (x1 - cx1, y1 - cy1, x2 - cx1, y2 - cy1)
    region_crop = region_mask[cy1:cy2, cx1:cx2] if region_mask is not None else None
    blend = _crop_noise_mask(crop_h, crop_w, face_rect, feather, region_crop, mask_dilation)
    noise_mask = F.interpolate(blend.view(1, 1, crop_h, crop_w), size=(sh, sw),
                               mode="bilinear")

    fr = blend[face_rect[1]:face_rect[3], face_rect[0]:face_rect[2]]
    log.info("crop %dx%d -> sample %dx%d | mask in face-rect: mean %.2f max %.2f | crop coverage %.0f%%",
             crop_w, crop_h, sw, sh, fr.mean(), fr.max(),
             100.0 * (blend > 0.5).float().mean())

    latent_in = vae.encode(sampled_in)
    latent = {"samples": latent_in, "noise_mask": noise_mask}
    # Remap any regional cond masks / depth hint onto this crop before sampling.
    # Image+control window = (cx1,cy1,cx2,cy2) in canvas px. For moved content
    # the region masks are read at the ORIGIN — the same window shifted by
    # (cond_offset_x, cond_offset_y) and clamped on-canvas — so a figure dragged
    # off its scene spot still samples with its OWN region prompt.
    win = (cx1, cy1, cx2, cy2)
    if cond_offset_x or cond_offset_y:
        mx1 = max(0, min(img_w - crop_w, cx1 + cond_offset_x))
        my1 = max(0, min(img_h - crop_h, cy1 + cond_offset_y))
        mask_win = (mx1, my1, mx1 + crop_w, my1 + crop_h)
    else:
        mask_win = win
    pos_c = _crop_cond_to_window(positive, mask_win, win, img_h, img_w, sh, sw)
    neg_c = _crop_cond_to_window(negative, mask_win, win, img_h, img_w, sh, sw)
    latent = comfy_nodes.common_ksampler(
        model, seed, steps, cfg, sampler_name, scheduler,
        pos_c, neg_c, latent, denoise=denoise)[0]
    log.info("latent mean abs change after sample: %.4f", (latent["samples"] - latent_in).abs().mean())
    detailed = vae.decode(latent["samples"])  # [1,sh,sw,C]

    # Lanczos, not bilinear: the sampled crop comes back DOWN up to ~4x and
    # bilinear doesn't anti-alias at that reduction — the pasted region reads
    # as aliased/pixelated against the untouched surroundings.
    detailed = comfy.utils.common_upscale(
        detailed.movedim(-1, 1), crop_w, crop_h, "lanczos", "disabled").movedim(1, -1)
    detailed = detailed[0].to(image_hwc)

    blend = blend.to(image_hwc).unsqueeze(-1)
    image_hwc[cy1:cy2, cx1:cx2, :] = (
        image_hwc[cy1:cy2, cx1:cx2, :] * (1.0 - blend) + detailed * blend)


class RegionalDetailerNode(io.ComfyNode):
    """Detail each face with its own character's prompt (regional scenes).

    Takes the regions JSON from Prompt Chain + the per-figure masks from the
    3D Poser, detects faces, matches each face to a region by mask overlap, and
    re-renders that face with the matched region's conditioning — so a detail
    pass sharpens identity instead of erasing it.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PromptChain_RegionalDetailer",
            display_name="Prompt Chain Regional Detailer",
            category="promptchain",
            inputs=[
                io.Model.Input("model",
                               tooltip="Base model preferred — the crop is a single region, "
                                       "so plain regional conditioning is cleaner than the "
                                       "couple-patched model."),
                io.Clip.Input("clip"),
                io.Vae.Input("vae"),
                io.Image.Input("image"),
                io.String.Input("regions", default="", force_input=True,
                                tooltip="Wire to Prompt Chain's 'regions' output (4th)."),
                io.Mask.Input("masks", optional=True,
                              tooltip="Per-figure masks from the 3D Poser MASKS output."),
                io.String.Input("pose", default="", optional=True, force_input=True,
                                tooltip="Wire to the 3D Poser's POSE_JSON output — provides "
                                        "exported head boxes for 'mannequin heads' mode."),
                io.Conditioning.Input("negative", optional=True,
                                      tooltip="Shared negative; defaults to the regions JSON negative."),
                io.Int.Input("seed", default=0, min=0, max=0xFFFFFFFFFFFFFFFF,
                             control_after_generate=True),
                io.Int.Input("steps", default=20, min=1, max=100),
                io.Float.Input("cfg", default=7.0, min=0.0, max=30.0, step=0.5),
                io.Combo.Input("sampler_name", options=comfy.samplers.KSampler.SAMPLERS),
                io.Combo.Input("scheduler", options=comfy.samplers.KSampler.SCHEDULERS),
                io.Float.Input("denoise", default=0.4, min=0.0, max=1.0, step=0.05,
                               tooltip="How much of the face is re-rendered."),
                io.Int.Input("guide_size", default=512, min=64, max=2048, step=8,
                             tooltip="Upscale the crop so the face spans about this many pixels."),
                io.Int.Input("max_size", default=1024, min=64, max=4096, step=8,
                             tooltip="Cap on the sampled crop's long side."),
                io.Float.Input("crop_factor", default=2.0, min=1.0, max=8.0, step=0.1,
                               tooltip="Context padding around the face bbox."),
                io.Int.Input("feather", default=24, min=0, max=128, step=1,
                             tooltip="Falloff width (px) outside the face box — bounds both the "
                                     "re-rendered area and the composite blend."),
                io.Float.Input("bbox_threshold", default=0.5, min=0.0, max=1.0, step=0.05,
                               tooltip="Face detection confidence threshold."),
                io.Int.Input("bbox_dilation", default=8, min=0, max=128, step=1,
                             tooltip="Grow each detected face box by this many pixels."),
                io.Int.Input("mask_dilation", default=22, min=0, max=128, step=1,
                             tooltip="Grow the figure silhouette before it bounds the re-rendered "
                                     "area, so hair/headgear past the mannequin isn't clipped."),
                io.Int.Input("drop_size", default=16, min=0, max=512, step=1,
                             tooltip="Skip faces smaller than this many pixels."),
                # New widgets append at the END: widgets_values deserializes by
                # index, so inserting mid-list scrambles every saved workflow.
                io.Combo.Input("face_source", options=["detect (yolo)", "mannequin heads"],
                               default="detect (yolo)",
                               tooltip="detect: find rendered faces with YOLO (can miss tilted/"
                                       "profile heads). mannequin heads: use the Poser's exact "
                                       "head positions for any head facing the camera — never "
                                       "misses, needs the 'pose' input wired."),
                io.Int.Input("max_face_angle", default=110, min=0, max=180, step=5,
                             tooltip="Mannequin mode: skip heads turned more than this many degrees "
                                     "away from the camera. The default (110) keeps every visible "
                                     "face — frontal, three-quarter, and full profile — and only "
                                     "culls heads facing away. Lower it to restrict to frontal faces."),
            ],
            outputs=[
                io.Image.Output("IMAGE"),
            ],
        )

    @classmethod
    def execute(cls, model, clip, vae, image: torch.Tensor, regions: str = "",
                masks: torch.Tensor = None, pose: str = "", negative=None,
                face_source: str = "detect (yolo)", max_face_angle: int = 110,
                seed: int = 0, steps: int = 20, cfg: float = 7.0,
                sampler_name: str = "euler", scheduler: str = "normal",
                denoise: float = 0.4, guide_size: int = 512, max_size: int = 1024,
                crop_factor: float = 2.0, feather: int = 24,
                bbox_threshold: float = 0.5, bbox_dilation: int = 8,
                mask_dilation: int = 22, drop_size: int = 16) -> io.NodeOutput:

        data = {}
        if regions and regions.strip():
            try:
                data = json.loads(regions)
            except (json.JSONDecodeError, TypeError) as e:
                raise ValueError(
                    "[RegionalDetailer] 'regions' must be PromptChain's regions JSON "
                    "(4th output). Got " + repr(regions[:160])) from e
        global_text = data.get("global", "")
        region_list = data.get("regions", [])
        negative_text = data.get("negative", "")

        def encode(text):
            tokens = clip.tokenize(text or "")
            return clip.encode_from_tokens_scheduled(tokens)

        if negative is None:
            negative = encode(negative_text)

        # Per-region positive = the character's block + the global quality tags,
        # matching what a hand-written per-face prompt would carry.
        def region_positive_text(text):
            return f"{text}, {global_text}" if text and global_text else (text or global_text)

        cond_cache: dict[int, object] = {}

        def positive_for(region_idx: int):
            if region_idx not in cond_cache:
                text = (region_positive_text(region_list[region_idx].get("text", ""))
                        if region_idx >= 0 else global_text)
                cond_cache[region_idx] = encode(_strip_non_face_tags(text))
            return cond_cache[region_idx]

        out_batch = image.clone()
        img_h, img_w = out_batch.shape[1:3]

        # Region -> figure binding: by figure NAME from the pose JSON when wired
        # (custom-named $blocks), else id / block order — same resolver as the couple.
        region_to_fig = region_figure_indices(region_list, pose)

        # Region masks at image resolution, ordered like region_list.
        region_masks = None
        if region_list and masks is not None and masks.shape[0] > 0:
            full = F.interpolate(masks.unsqueeze(1).float(), size=(img_h, img_w),
                                 mode="nearest-exact").squeeze(1)
            idxs = [min(max(idx, 0), full.shape[0] - 1) for idx in region_to_fig]
            region_masks = full[idxs]

        # Mannequin mode: faces come from the Poser's projected head boxes —
        # exact position AND identity (head i belongs to figure i ↔ region id
        # i+1), already hair-inflated, filtered by facing angle. No detector,
        # no ultralytics dependency, no misses on tilted/profile heads.
        use_mannequin = face_source.startswith("mannequin")
        mannequin_faces = _mannequin_faces(pose, img_w, img_h, max_face_angle) if use_mannequin else None
        if use_mannequin and mannequin_faces is None:
            log.warning("face_source='mannequin heads' but no head data on 'pose' — "
                        "wire the Poser's POSE_JSON output and touch the pose to refresh it; "
                        "falling back to detection")
            use_mannequin = False
            mannequin_faces = []
        elif use_mannequin and not mannequin_faces:
            # Head data exists and every head failed the angle gate — that's the
            # mode's deliberate answer (per-head verdicts logged above), not an
            # error. Falling back to YOLO here would override the user's gate.
            log.info("all heads outside the %d° limit — nothing to detail", max_face_angle)
        # Heads belong to FIGURES only (entity rows are figures-first, so a figure's
        # entity index == its head index). A prop-bound region must never claim a
        # head — filter prop rows out before inverting.
        #
        # Drop ORPHAN $blocks (mannequin deleted, block left in the prompt): they
        # bind to no figure, so they must not detail a present figure with the
        # deleted character's prompt. Among the rest, invert region->figure with
        # NAME priority — a region whose name matches its figure's entity outranks
        # one that merely fell on the same figure index (first claimant otherwise).
        n_figs = region_figure_count(pose)
        entity_names = figure_entity_names(pose)
        orphans = region_orphans(region_list, pose)

        def _name_matched(region_idx: int) -> bool:
            return str(region_list[region_idx].get("name", "")).lower() in entity_names

        fig_to_region: dict[int, int] = {}
        for n, idx in enumerate(region_to_fig):
            if orphans[n] or (n_figs is not None and idx >= n_figs):
                continue
            incumbent = fig_to_region.get(idx)
            if incumbent is None or (_name_matched(n) and not _name_matched(incumbent)):
                fig_to_region[idx] = n

        for b in range(out_batch.shape[0]):
            img = out_batch[b]
            if use_mannequin:
                faces_bound = [(bbox, fig_to_region.get(fig_idx, -1)) for bbox, fig_idx in mannequin_faces]
                log.info("image %d: %d mannequin head(s) facing camera (≤%d°)",
                         b, len(faces_bound), max_face_angle)
            else:
                detected = _detect_faces(img, bbox_threshold)
                log.info("image %d: %d face(s) detected", b, len(detected))
                faces_bound = []
                for x1, y1, x2, y2 in detected:
                    x1 = max(0, x1 - bbox_dilation)
                    y1 = max(0, y1 - bbox_dilation)
                    x2 = min(img_w, x2 + bbox_dilation)
                    y2 = min(img_h, y2 + bbox_dilation)
                    ridx = _match_region((x1, y1, x2, y2), region_masks) if region_masks is not None else -1
                    faces_bound.append(((x1, y1, x2, y2), ridx))
            for (x1, y1, x2, y2), ridx in faces_bound:
                if max(x2 - x1, y2 - y1) < drop_size:
                    continue
                name = region_list[ridx].get("name", f"region{ridx + 1}") if 0 <= ridx < len(region_list) else "global"
                log.info("face (%d,%d,%d,%d) -> %s", x1, y1, x2, y2, name)
                _detail_crop(img, (x1, y1, x2, y2), model, vae,
                             positive_for(ridx), negative,
                             seed, steps, cfg, sampler_name, scheduler, denoise,
                             crop_factor, guide_size, max_size, feather,
                             region_masks[ridx] if region_masks is not None and ridx >= 0 else None,
                             mask_dilation)

        return io.NodeOutput(out_batch)


class MaskedDetailNode(io.ComfyNode):
    """Crop-and-upscale inpainting for an arbitrary mask (A1111's 'only
    masked' mode, the same trick that makes FaceDetailer work): the mask's
    bbox is cropped with context padding, upscaled so the region samples at
    full model resolution, rendered with the painted shape as the noise
    mask, and feather-blended back. A whole-canvas SetLatentNoiseMask pass
    gives a small region only the latent pixels it occupies on canvas —
    too few to draw eyes or hands coherently.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PromptChain_MaskedDetail",
            display_name="Prompt Chain Masked Detail",
            category="promptchain",
            inputs=[
                io.Model.Input("model"),
                io.Vae.Input("vae"),
                io.Image.Input("image"),
                io.Mask.Input("mask", tooltip="The painted region to re-render."),
                io.Conditioning.Input("positive"),
                io.Conditioning.Input("negative"),
                io.Int.Input("seed", default=0, min=0, max=0xFFFFFFFFFFFFFFFF,
                             control_after_generate=True),
                io.Int.Input("steps", default=20, min=1, max=100),
                io.Float.Input("cfg", default=7.0, min=0.0, max=30.0, step=0.5),
                io.Combo.Input("sampler_name", options=comfy.samplers.KSampler.SAMPLERS),
                io.Combo.Input("scheduler", options=comfy.samplers.KSampler.SCHEDULERS),
                io.Float.Input("denoise", default=0.5, min=0.0, max=1.0, step=0.05,
                               tooltip="How much of the masked region is re-rendered."),
                io.Int.Input("guide_size", default=512, min=64, max=2048, step=8,
                             tooltip="Upscale the crop so the masked region spans about "
                                     "this many pixels while sampling."),
                io.Int.Input("max_size", default=1024, min=64, max=4096, step=8,
                             tooltip="Cap on the sampled crop's long side."),
                io.Float.Input("crop_factor", default=2.0, min=1.0, max=8.0, step=0.1,
                               tooltip="Context padding around the mask bbox."),
                io.Int.Input("feather", default=24, min=0, max=128, step=1,
                             tooltip="Falloff width (px) outside the painted shape — bounds "
                                     "both the re-rendered area and the composite blend."),
                io.Int.Input("grow", default=0, min=0, max=128, step=1,
                             tooltip="Expand the painted mask outward by this many px before "
                                     "sampling, so the re-render bleeds slightly past the painted edge."),
                # Moved-content regional inpaint: the painted pixels were dragged
                # off their scene spot, so the region masks are read at the ORIGIN
                # — this offset (canvas px) shifts the cond-mask crop back to where
                # the content came from, so its OWN region prompt follows it. The
                # depth hint stays at the painted location. 0 = in-place (no shift).
                io.Int.Input("cond_offset_x", default=0, min=-8192, max=8192, optional=True),
                io.Int.Input("cond_offset_y", default=0, min=-8192, max=8192, optional=True),
            ],
            outputs=[
                io.Image.Output("IMAGE"),
            ],
        )

    @classmethod
    def execute(cls, model, vae, image: torch.Tensor, mask: torch.Tensor,
                positive=None, negative=None,
                seed: int = 0, steps: int = 20, cfg: float = 7.0,
                sampler_name: str = "euler", scheduler: str = "normal",
                denoise: float = 0.5, guide_size: int = 512, max_size: int = 1024,
                crop_factor: float = 2.0, feather: int = 24, grow: int = 0,
                cond_offset_x: int = 0, cond_offset_y: int = 0) -> io.NodeOutput:
        out_batch = image.clone()
        img_h, img_w = out_batch.shape[1:3]

        m = mask.float()
        if m.dim() == 2:
            m = m.unsqueeze(0)
        if m.shape[-2:] != (img_h, img_w):
            m = F.interpolate(m.unsqueeze(1), size=(img_h, img_w),
                              mode="bilinear").squeeze(1)

        for b in range(out_batch.shape[0]):
            mb = m[min(b, m.shape[0] - 1)].contiguous()
            ys, xs = torch.nonzero(mb > 0.5, as_tuple=True)
            if ys.numel() == 0:
                log.info("image %d: empty mask — unchanged", b)
                continue
            bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
            log.info("image %d: mask bbox (%d,%d,%d,%d) in %dx%d",
                     b, *bbox, img_w, img_h)
            # The painted mask doubles as the silhouette bound, so sampling is
            # confined to the painted shape, not its whole bbox.
            _detail_crop(out_batch[b], bbox, model, vae, positive, negative,
                         seed, steps, cfg, sampler_name, scheduler, denoise,
                         crop_factor, guide_size, max_size, feather,
                         mb, grow, cond_offset_x, cond_offset_y)

        return io.NodeOutput(out_batch)
