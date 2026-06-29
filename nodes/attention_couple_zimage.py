from __future__ import annotations

import json

import torch
import torch.nn.functional as F

import comfy.patcher_extension as pe
from comfy.ldm.modules.attention import attention_pytorch
from comfy_api.latest import io

from ..core.compiler import region_figure_indices, region_orphans
from .attention_couple import _dilate


# ── Clean-room MIT regional attention couple for single-stream DiTs ────────────
# Z-Image / Lumina2 (NextDiT) has no UNet cross-attention to patch — caption and
# image are ONE joint self-attention sequence [caption | image]. So the SDXL
# attention_couple (set_model_attn2_patch) does not apply. Instead we use
# ComfyUI's public `optimized_attention_override` hook (attention.py wrap_attn):
# every region's prompt is concatenated into ONE caption, and a soft additive
# attention-bias makes each image token attend to the GLOBAL caption + ONLY its
# own region's caption tokens (image<->image left full, so the scene stays one
# coherent image). One forward pass, no per-character LoRA, no GPL source reused.
#
# Bias-mask technique ported clean-room from the public regional-attention method
# (additive pre-softmax mask over the joint sequence) used by FreeFuse / Flux
# regional nodes; the math here is written from scratch against ComfyUI's public
# NextDiT + attention API.

# A near-infinite negative added to a (pixel, caption-token) pair removes that
# attention entirely (e^-1e4 == 0 after softmax). Used to HARD-block a figure's
# pixels from reading the OTHER character's prompt, so each figure can only attend
# to its own character (+ the shared global). A soft penalty let the model assign
# the wrong character to a figure (outfits swapping between mannequins).
HARD_BLOCK = 1.0e4


def _pad_to_multiple(n: int, mult) -> int:
    """NextDiT pads caption AND image tokens to a multiple of pad_tokens_multiple
    (pad_zimage). Mirror that so the runtime caption/image split is exact."""
    if not mult:
        return n
    return n + ((-n) % mult)


def _raster_soft(mask: torch.Tensor, grid_h: int, grid_w: int, device) -> torch.Tensor:
    """Rasterize a full-res silhouette to the patch grid as SOFT membership [img_len]
    (row-major, 0..1). Bilinear + a small blur feathers the region boundary so the
    attention bias transitions smoothly instead of leaving a jagged per-token edge."""
    mm = mask.to(device=device, dtype=torch.float32)[None, None]
    mm = F.interpolate(mm, (grid_h, grid_w), mode="bilinear", align_corners=False)
    mm = F.avg_pool2d(mm, kernel_size=3, stride=1, padding=1)
    return mm.reshape(-1).clamp(0.0, 1.0)


def build_region_bias(state, cap_len: int, img_len_real: int, grid_h: int, grid_w: int,
                      dtype, device, image_iso: bool = True) -> torch.Tensor | None:
    """Additive [1,1,S,S] attention bias over the joint [caption | image] sequence.

    Layout: [0:cap_len] = caption (real region/global tokens left-aligned then cap_pad),
    [cap_len:cap_len+img_len_real] = the real image grid (row-major), rest = image pad.
    0 = full attention, negative = suppressed.

    Two suppressions stop cross-character bleed while keeping the scene coherent:
      • image -> OTHER region's CAPTION  (each figure ignores the others' text)
      • image -> OTHER region's IMAGE    (each figure's pixels don't attend to the
        other figure's pixels — the actual fix for visual identity bleed). Every
        figure still attends FULLY to the shared background + global caption, so the
        scene stays one image.
    """
    spans = state["spans"]                 # [(s,e)] per region, into the combined caption
    region_weights = state["region_weights"]
    scale = float(state["region_strength"])
    fig_iso = float(state.get("figure_isolation", 0.0))
    base_weight = float(state["base_weight"])
    g0 = state["global_span"][1]           # global caption occupies [0:g0)
    n_regions = len(spans)
    if n_regions == 0 or (scale <= 0.0 and fig_iso <= 0.0):
        return None

    img0 = cap_len                         # first image-token index in the sequence
    seq = cap_len + state["img_len_padded"]
    bias = torch.zeros((seq, seq), dtype=torch.float32, device=device)
    soft = [_raster_soft(m, grid_h, grid_w, device) for m in state["region_masks"]]  # each [img_len]

    img_block = slice(img0, img0 + img_len_real)
    for i, (s, e) in enumerate(spans):
        mi = soft[i].unsqueeze(1)          # [img_len, 1]  soft membership in figure i
        # HARD: a pixel OUTSIDE figure i (1-mi) is blocked from reading figure i's
        # caption, so each figure attends only to its OWN character (+ global). scale
        # (region_strength) eases this off below 1.0 if a hard cut over-segments.
        bias[img_block, s:e] += -(1.0 - mi) * HARD_BLOCK * scale

    # image -> OTHER region's image: graded outer product (mi_query * mj_key), so a
    # token clearly in figure i is blocked from a token clearly in figure j; the
    # background (membership 0) and same-region pixels stay full. This spatial block
    # is the coarse/jagged part — applied only EARLY (image_iso) — while the text
    # identity-lock below stays on through face refinement.
    if image_iso and fig_iso > 0.0 and n_regions >= 2:
        block = bias[img_block, img_block]
        for i in range(n_regions):
            for j in range(n_regions):
                if i != j:
                    block += -fig_iso * (soft[i].unsqueeze(1) * soft[j].unsqueeze(0))

    # base_weight < 1.0: let each figure's prompt dominate its silhouette by softly
    # suppressing the GLOBAL caption for in-region image tokens (1.0 = full cohesion).
    if base_weight < 1.0 and g0 > 0:
        union = soft[0].clone()
        for s_ in soft[1:]:
            union = torch.maximum(union, s_)
        bias[img_block, 0:g0] += (-((1.0 - base_weight) * scale) * union).unsqueeze(1)

    # A region's caption tokens shouldn't read another region's caption tokens.
    for i, (s, e) in enumerate(spans):
        for j, (s2, e2) in enumerate(spans):
            if i != j:
                bias[s:e, s2:e2] += -HARD_BLOCK * scale

    bias.fill_diagonal_(0.0)
    return bias.to(dtype=dtype).unsqueeze(0).unsqueeze(0)  # [1,1,S,S] broadcasts over B, heads


def make_zimage_region_override(state):
    """An optimized_attention_override (attention.py wrap_attn) that injects the
    regional bias on the COMBINED-positive pass only and forces PyTorch SDPA (the
    only backend guaranteed to honour an arbitrary additive float mask)."""

    def override(func, q, k, v, heads, mask=None, *args, transformer_options=None, **kwargs):
        def vanilla():
            return func(q, k, v, heads, mask, *args, transformer_options=transformer_options, **kwargs)

        hw = state.get("latent_hw")
        if hw is None or q.ndim != 4:
            return vanilla()
        patch = state["patch_size"]
        if hw[0] < patch or hw[1] < patch:
            return vanilla()
        S = q.shape[2]
        grid_h, grid_w = hw[0] // patch, hw[1] // patch
        img_len_real = grid_h * grid_w
        img_len_padded = _pad_to_multiple(img_len_real, state["pad_mult"])
        cap_len = S - img_len_padded
        # Diagnostics: log each distinct caption length once so the first render
        # confirms whether the regional gate is matching (cond) or passing (uncond).
        seen = state.setdefault("_seen_caplen", set())
        if cap_len not in seen:
            seen.add(cap_len)
            print(f"[ZImageRegionalCouple] attn pass seq={S} cap_len={cap_len} "
                  f"expected={state['expected_cap_len']} grid={grid_h}x{grid_w} "
                  f"img_len={img_len_real} match={cap_len == state['expected_cap_len']}")
        # Gate: only the concatenated-region positive caption matches this length.
        # The negative (a separate single caption) and any omni/ref pass fall through.
        if cap_len != state["expected_cap_len"] or img_len_real <= 0 or cap_len <= 0:
            return vanilla()

        # Apply the FULL regional bias (text lock + image isolation, which TOGETHER keep
        # each figure distinct) until end_percent, then off so late steps refine freely.
        # (Splitting them — running image isolation only early — scrambles identities,
        # so they stay coupled.)
        thr = state.get("threshold_sigma")
        sig = state.get("sigma")
        if thr is not None and sig is not None and sig < thr:
            if not state.get("_late_logged"):
                state["_late_logged"] = True
                print(f"[ZImageRegionalCouple] regional bias OFF below sigma={thr:.3f} "
                      f"(end_percent={state.get('end_percent')}) — late steps refine freely")
            return vanilla()

        try:
            cache_key = (S, grid_h, grid_w, q.dtype, str(q.device))
            bias = state["cache"].get(cache_key)
            if cache_key not in state["cache"]:
                state["img_len_padded"] = img_len_padded
                bias = build_region_bias(state, cap_len, img_len_real, grid_h, grid_w, q.dtype, q.device)
                state["cache"][cache_key] = bias
            if bias is None:
                return vanilla()
            attn_mask = bias if mask is None else (mask + bias)
            state["applied"] = state.get("applied", 0) + 1
            if state["applied"] == 1:
                print(f"[ZImageRegionalCouple] applied regional attention bias "
                      f"({len(state['spans'])} regions, region_strength={state['region_strength']}, "
                      f"figure_isolation={state['figure_isolation']}, base_weight={state['base_weight']})")
            return attention_pytorch(
                q, k, v, heads, mask=attn_mask,
                skip_reshape=kwargs.get("skip_reshape", False),
                skip_output_reshape=kwargs.get("skip_output_reshape", False),
            )
        except Exception as exc:  # never break a render — fall back to vanilla attention
            if not state.get("_warned"):
                state["_warned"] = True
                print(f"[ZImageRegionalCouple] bias apply failed ({exc}); using vanilla attention")
            return vanilla()

    return override


def patch_model_zimage_regional(model, state):
    """Clone the model and install (a) an APPLY_MODEL wrapper that captures the live
    latent H,W + current sigma (so the override can recover the patch grid and gate
    on denoising progress) and (b) the attention override. Both ride
    model_options['transformer_options']."""
    m = model.clone()
    to = {**m.model_options.get("transformer_options", {})}
    m.model_options["transformer_options"] = to
    to["optimized_attention_override"] = make_zimage_region_override(state)

    def _capture_latent_shape(executor, x, *args, **kwargs):
        # _apply_model(x, t, ...) — args[0] is t (the sigma for this denoise step).
        state["latent_hw"] = (int(x.shape[-2]), int(x.shape[-1]))
        if args:
            try:
                state["sigma"] = float(args[0].flatten()[0])
            except (AttributeError, IndexError, RuntimeError, TypeError):
                state["sigma"] = None
        return executor(x, *args, **kwargs)

    pe.add_wrapper_with_key(pe.WrappersMP.APPLY_MODEL, "pc_zimage_regional_shape",
                            _capture_latent_shape, to)
    return m


class ZImageRegionalCoupleNode(io.ComfyNode):
    """Per-region attention coupling for Z-Image / Lumina2 (single-stream DiT).

    The DiT analog of Prompt Chain Regional (Attention Couple): pins each
    $mannequin{} block to its figure's mask so the characters stay distinct AND
    share ONE coherent scene (background described outside the blocks). Reuses the
    3D Poser masks + Prompt Chain regions JSON exactly like the SDXL node.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PromptChain_ZImageRegionalCouple",
            display_name="Prompt Chain Regional Z-Image (Attention Couple)",
            category="promptchain",
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip"),
                io.String.Input("regions", default="", force_input=True,
                                tooltip="Wire to Prompt Chain's 'regions' output (4th)."),
                io.Mask.Input("masks", optional=True,
                              tooltip="Per-figure masks from the 3D Poser MASKS output."),
                io.Float.Input("base_weight", default=1.0, min=0.0, max=1.0, step=0.05,
                               tooltip="How much the shared background competes INSIDE a figure. "
                                       "1.0 = background everywhere (max scene cohesion); lower lets "
                                       "each figure's own prompt dominate its silhouette."),
                io.Int.Input("mask_dilation", default=22, min=0, max=128, step=1,
                             tooltip="Grow each region mask so ribbons/hair/props aren't clipped."),
                io.Float.Input("region_strength", default=1.0, min=0.0, max=8.0, step=0.25,
                               tooltip="Hardness of the per-character text lock. 1.0 = a hard cut "
                                       "(each figure reads ONLY its own character's prompt — stops "
                                       "outfits swapping between figures). Below 1.0 softens it; 0 = off."),
                io.Float.Input("figure_isolation", default=4.0, min=0.0, max=20.0, step=0.5,
                               tooltip="How hard each figure's PIXELS are stopped from attending to "
                                       "the other figure's pixels — the real fix for identity bleed "
                                       "(e.g. one character's hair on both). Each figure still attends "
                                       "fully to the shared background, so the scene stays coherent. "
                                       "0 = off (figures may blend)."),
                io.Float.Input("end_percent", default=0.7, min=0.05, max=1.0, step=0.05,
                               tooltip="Fraction of denoising the regional bias stays on, then off so "
                                       "late steps refine freely. Higher = stronger separation (incl. "
                                       "faces) but the coarse 16px grid can jag fine detail; lower = "
                                       "smoother but identities may blend late. 1.0 = always on."),
                io.String.Input("pose", default="", optional=True, force_input=True,
                                tooltip="Wire to the 3D Poser's POSE_JSON output — carries the "
                                        "figure names so renamed $blocks bind to the right mask."),
            ],
            outputs=[
                io.Model.Output("MODEL"),
                io.Conditioning.Output("positive"),
                io.Conditioning.Output("negative"),
            ],
        )

    @classmethod
    def execute(cls, model, clip, regions: str = "", masks: torch.Tensor = None,
                base_weight: float = 1.0, mask_dilation: int = 22,
                region_strength: float = 1.0, figure_isolation: float = 4.0,
                end_percent: float = 0.7, pose: str = "") -> io.NodeOutput:

        def encode_raw(text):
            tokens = clip.tokenize(text or "")
            out = clip.encode_from_tokens(tokens, return_pooled=True)
            if isinstance(out, tuple):
                return out[0], out[1]
            return out, None

        def as_conditioning(cond, pooled):
            meta = {}
            if pooled is not None:
                meta["pooled_output"] = pooled
            return [[cond, meta]]

        data = {}
        if regions and regions.strip():
            try:
                data = json.loads(regions)
            except (json.JSONDecodeError, TypeError) as e:
                raise ValueError(
                    "[ZImageRegionalCouple] 'regions' must be PromptChain's regions JSON "
                    "(4th output). Got " + repr(regions[:160])) from e
        global_text = data.get("global", "")
        region_list = data.get("regions", [])
        negative_text = data.get("negative", "")

        global_cond, global_pooled = encode_raw(global_text)
        neg_cond, neg_pooled = encode_raw(negative_text)
        positive_passthrough = as_conditioning(global_cond, global_pooled)
        negative = as_conditioning(neg_cond, neg_pooled)

        # No regions / no masks → passthrough: just the global conditioning, model untouched.
        if not region_list or masks is None or masks.shape[0] == 0:
            return io.NodeOutput(model, positive_passthrough, negative)

        num_masks = masks.shape[0]
        orphans = region_orphans(region_list, pose)
        kept = []  # (region_text, mask[Hm,Wm], weight)
        for n, (r, idx) in enumerate(zip(region_list, region_figure_indices(region_list, pose))):
            if orphans[n]:
                continue
            text = (r.get("text") or "").strip()
            if not text:
                continue
            idx = min(max(idx, 0), num_masks - 1)
            mask = _dilate(masks[idx:idx + 1], mask_dilation)  # [1,Hm,Wm]
            kept.append((text, mask[0], 1.0))

        if not kept:
            return io.NodeOutput(model, positive_passthrough, negative)

        # Concatenate global + each region into ONE caption; record token spans.
        region_conds = [encode_raw(text)[0] for text, _, _ in kept]
        combined = torch.cat([global_cond] + region_conds, dim=1)
        g0 = global_cond.shape[1]
        spans = []
        cursor = g0
        for rc in region_conds:
            spans.append((cursor, cursor + rc.shape[1]))
            cursor += rc.shape[1]
        t_total = cursor

        diff_model = model.model.diffusion_model
        patch_size = int(getattr(diff_model, "patch_size", 2) or 2)
        pad_mult = getattr(diff_model, "pad_tokens_multiple", None)

        # Sigma below which the regional bias switches off (late detail steps). None
        # when end_percent >= 1.0 (always on) or model_sampling can't be read.
        threshold_sigma = None
        if end_percent < 1.0:
            try:
                threshold_sigma = float(model.model.model_sampling.percent_to_sigma(end_percent))
            except (AttributeError, TypeError, ValueError):
                threshold_sigma = None

        state = {
            "spans": spans,
            "global_span": (0, g0),
            "region_masks": [m.cpu() for _, m, _ in kept],
            "region_weights": [w for _, _, w in kept],
            "base_weight": base_weight,
            "region_strength": region_strength,
            "figure_isolation": figure_isolation,
            "end_percent": end_percent,
            "threshold_sigma": threshold_sigma,
            "sigma": None,
            "patch_size": patch_size,
            "pad_mult": pad_mult,
            "expected_cap_len": _pad_to_multiple(t_total, pad_mult),
            "img_len_padded": 0,
            "cache": {},
            "latent_hw": None,
        }
        patched_model = patch_model_zimage_regional(model, state)
        positive = as_conditioning(combined, global_pooled)
        return io.NodeOutput(patched_model, positive, negative)
