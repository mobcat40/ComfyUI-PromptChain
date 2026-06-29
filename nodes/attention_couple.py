from __future__ import annotations

import json
import math

import torch
import torch.nn.functional as F

from comfy_api.latest import io

from ..core.compiler import region_figure_indices, region_orphans


# ── Clean-room MIT regional cross-attention ───────────────────────────────
# Masked cross-attention ("attention couple") is a public technique: at each
# attn2 layer every spatial query attends to the global prompt AND to each
# region prompt, and the per-layer outputs are blended by the region masks so a
# character's tokens only paint inside their own mask. Implemented here from the
# public method on ComfyUI's public model API (set_model_attn2_patch /
# set_model_attn2_output_patch) — no GPL source is reused.


def _dilate(mask: torch.Tensor, px: int) -> torch.Tensor:
    """Grow a [1,H,W] mask by `px` pixels so flowing elements (ribbons, hair,
    held props) that spill past the body silhouette stay inside the region."""
    if px <= 0:
        return mask
    m = mask.unsqueeze(0)  # [1,1,H,W]
    m = F.max_pool2d(m, kernel_size=px * 2 + 1, stride=1, padding=px)
    return m.squeeze(0)


def _token_grid(latent_h: int, latent_w: int, num_tokens: int) -> tuple[int, int]:
    """Spatial (h, w) grid for an attention layer that emitted `num_tokens`
    tokens. UNet attention runs on feature maps halved from the latent some
    number of times; recover that count so a full-res mask can be pooled down to
    exactly the layer's token grid."""
    downsamples = math.ceil(math.log2(math.sqrt(latent_h * latent_w / num_tokens)))
    h, w = latent_h, latent_w
    for _ in range(max(downsamples, 0)):
        h = math.ceil(h / 2)
        w = math.ceil(w / 2)
    return h, w


def patch_model_regional(model, base_cond, regions, base_weight: float):
    """Return a clone of `model` whose cross-attention blends a global prompt
    with per-region prompts under their masks.

    base_cond — ComfyUI conditioning for the shared/global prompt.
    regions   — list of {"cond": conditioning, "mask": [1,H,W], "weight": float}.
    base_weight — how strongly the global prompt competes everywhere (the global
                  mask is `base_weight` at every pixel, so a region pixel splits
                  base_weight : region_weight between global and region prompt).
    """
    # Token-level embeddings only; the pooled/global vector stays the base one
    # (per-region pooled conditioning isn't expressible through attn2 alone).
    cond_embeds = [base_cond[0][0]] + [r["cond"][0][0] for r in regions]
    num_conds = len(cond_embeds)
    token_counts = [c.shape[1] for c in cond_embeds]
    token_lcm = token_counts[0]
    for t in token_counts[1:]:
        token_lcm = token_lcm * t // math.gcd(token_lcm, t)

    mask_h, mask_w = regions[0]["mask"].shape[-2:]
    weight_maps = [torch.full((1, mask_h, mask_w), float(base_weight))]
    for r in regions:
        m = F.interpolate(r["mask"].unsqueeze(0), size=(mask_h, mask_w),
                          mode="nearest-exact").squeeze(0)
        weight_maps.append(m * float(r["weight"]))
    weights = torch.stack(weight_maps, dim=0)        # [num_conds, 1, H, W]
    weights = weights / weights.sum(dim=0, keepdim=True)  # per-pixel sum == 1

    state = {"device": None, "dtype": None}

    def _to(device, dtype):
        if state["device"] == device and state["dtype"] == dtype:
            return
        state["conds"] = [c.to(device, dtype=dtype) for c in cond_embeds]
        # collapse the singleton channel so the mask is [num_conds, H, W]
        state["weights"] = weights.squeeze(1).to(device, dtype=dtype)
        state["device"] = device
        state["dtype"] = dtype
        state["region_kv_lcm"] = None  # invalidate cached region K/V (rebuilt below)

    def attn2_patch(q, k, v, extra_options):
        _to(q.device, q.dtype)
        conds = state["conds"]
        chunk_kinds = extra_options["cond_or_uncond"]  # 0 cond, 1 uncond
        num_chunks = len(chunk_kinds)
        batch = q.shape[0] // num_chunks
        state["batch"] = batch

        q_chunks = q.chunk(num_chunks, dim=0)
        k_chunks = k.chunk(num_chunks, dim=0)

        # All chunks must share one token length for the batched cat — and the
        # uncond (negative) is encoded elsewhere, so its CLIP chunk count can
        # differ from every region's (e.g. 77 vs 154). Fold it into the LCM and
        # token-repeat it like the conds; repeating a full K/V set is
        # output-neutral (softmax splits weight equally across copies of the
        # same token, and V is identical).
        full_lcm = token_lcm
        for i, kind in enumerate(chunk_kinds):
            if kind == 1:
                t = k_chunks[i].shape[1]
                full_lcm = full_lcm * t // math.gcd(full_lcm, t)

        # text-embedding stack for one image: each region prompt repeated along
        # the token axis to the common LCM length. Constant across every
        # attention layer and step of a render, so build once per (device, dtype,
        # lcm) and reuse — only the per-batch interleave below varies.
        if state.get("region_kv_lcm") != full_lcm:
            state["region_kv"] = torch.cat(
                [c.repeat(1, full_lcm // token_counts[i], 1) for i, c in enumerate(conds)],
                dim=0,
            )  # [num_conds, full_lcm, ctx]
            state["region_kv_lcm"] = full_lcm
        region_kv = state["region_kv"]

        out_q, out_kv = [], []
        for i, kind in enumerate(chunk_kinds):
            if kind == 1:  # uncond — single global negative, no regional split
                out_q.append(q_chunks[i])
                out_kv.append(k_chunks[i].repeat(1, full_lcm // k_chunks[i].shape[1], 1))
            else:
                out_q.append(q_chunks[i].repeat(num_conds, 1, 1))
                out_kv.append(region_kv.repeat_interleave(batch, dim=0).to(k))

        qs = torch.cat(out_q, dim=0)
        kvs = torch.cat(out_kv, dim=0)

        # Some attention backends require an even batch.
        if qs.shape[0] % 2 == 1:
            qs = torch.cat([qs, torch.zeros_like(qs[:1])], dim=0)
            kvs = torch.cat([kvs, torch.zeros_like(kvs[:1])], dim=0)

        return qs, kvs, kvs

    def attn2_output_patch(out, extra_options):
        chunk_kinds = extra_options["cond_or_uncond"]
        batch = state["batch"]
        latent_h, latent_w = extra_options["original_shape"][2:4]
        grid_h, grid_w = _token_grid(latent_h, latent_w, out.shape[1])

        mask = F.interpolate(state["weights"].unsqueeze(1), size=(grid_h, grid_w),
                             mode="nearest")  # [num_conds, 1, grid_h, grid_w]
        mask = mask.reshape(num_conds, 1, grid_h * grid_w, 1)

        merged = []
        pos = 0
        for kind in chunk_kinds:
            if kind == 1:  # uncond passthrough
                merged.append(out[pos:pos + batch])
                pos += batch
            else:
                block = out[pos:pos + num_conds * batch]
                block = block.view(num_conds, batch, out.shape[1], out.shape[2])
                merged.append((block * mask).sum(dim=0))
                pos += num_conds * batch
        return torch.cat(merged, dim=0)

    patched = model.clone()
    patched.set_model_attn2_patch(attn2_patch)
    patched.set_model_attn2_output_patch(attn2_output_patch)
    return patched


class AttentionCoupleNode(io.ComfyNode):
    """Pin each $mannequin{} block to its figure's mask (regional conditioning).

    Takes the regions JSON from Prompt Chain + the per-figure masks from the
    3D Poser, encodes each block, and patches the model so each character only
    paints on their own mannequin — stopping identity/outfit bleed. Outputs the
    patched model plus the global (base) positive/negative conditioning, which
    drop straight into a ControlNet apply / KSampler.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PromptChain_AttentionCouple",
            display_name="Prompt Chain Regional (Attention Couple)",
            category="promptchain",
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip"),
                io.String.Input("regions", default="", force_input=True,
                                tooltip="Wire to Prompt Chain's 'regions' output (4th)."),
                io.Mask.Input("masks", optional=True,
                              tooltip="Per-figure masks from the 3D Poser MASKS output."),
                io.Float.Input("base_weight", default=0.5, min=0.01, max=1.0, step=0.05,
                               tooltip="Strength of the shared/global prompt everywhere."),
                io.Int.Input("mask_dilation", default=22, min=0, max=128, step=1,
                             tooltip="Grow each region mask so ribbons/hair/props aren't clipped."),
                # Appended at the END so existing saved graphs keep their slot order.
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
                base_weight: float = 0.5, mask_dilation: int = 22,
                pose: str = "") -> io.NodeOutput:

        def encode(text):
            tokens = clip.tokenize(text or "")
            return clip.encode_from_tokens_scheduled(tokens)

        data = {}
        if regions and regions.strip():
            try:
                data = json.loads(regions)
            except (json.JSONDecodeError, TypeError) as e:
                # Diagnostic: surface exactly what arrived so a mis-wire is obvious
                # (should be PromptChain's 'regions' output, the 4th — JSON, not the
                # bundle/flat text).
                raise ValueError(
                    "[AttentionCouple] 'regions' must be PromptChain's regions JSON "
                    "(4th output). Got " + repr(regions[:160])) from e
        global_text = data.get("global", "")
        region_list = data.get("regions", [])
        negative_text = data.get("negative", "")

        base_cond = encode(global_text)
        neg_cond = encode(negative_text)

        # No regions → passthrough: just the global conditioning, model untouched.
        if not region_list or masks is None or masks.shape[0] == 0:
            return io.NodeOutput(model, base_cond, neg_cond)

        num_masks = masks.shape[0]  # mask rows = region entities (figures, then named props)
        regions_for_patch = []
        # Name binding via the pose JSON's entity names when wired; falls back
        # to the id (the name's trailing integer, $mannequin1 -> figure 0),
        # then block order — so unwired/old graphs behave exactly as before.
        # Orphan $blocks (mannequin deleted, block left in the prompt) bind to
        # no figure — drop them so the deleted character's tags don't bleed
        # onto a present figure's mask.
        orphans = region_orphans(region_list, pose)
        for n, (r, idx) in enumerate(zip(region_list, region_figure_indices(region_list, pose))):
            if orphans[n]:
                continue
            # Empty $block → fall back to the global prompt inside that figure
            # (matches RegionalConditioning / ZImageRegionalCouple). Otherwise the
            # empty CLIP encode competes with the global at weight 1.0 and starves
            # the figure of ~2/3 of its guidance.
            text = (r.get("text") or "").strip()
            if not text:
                continue
            idx = min(max(idx, 0), num_masks - 1)
            mask = _dilate(masks[idx:idx + 1], mask_dilation)
            regions_for_patch.append(
                {"cond": encode(text), "mask": mask, "weight": 1.0})

        # Every region was an orphan -> no regional split; just the global cond.
        if not regions_for_patch:
            return io.NodeOutput(model, base_cond, neg_cond)

        patched_model = patch_model_regional(model, base_cond, regions_for_patch, base_weight)
        return io.NodeOutput(patched_model, base_cond, neg_cond)
