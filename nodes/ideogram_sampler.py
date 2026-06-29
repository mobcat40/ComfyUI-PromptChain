from __future__ import annotations

import logging

import torch

import comfy.sample
import comfy.model_management
import comfy.utils
import latent_preview
from comfy_api.latest import io

logger = logging.getLogger("promptchain.ideogram_sampler")


def _refusal_stats(image):
    """(std, dominant-color fraction, per-channel means) of the first decoded frame.

    A refusal is a near-uniform gray screen with the words 'Image blocked by safety
    filter' painted on it. A std-only test misses it — the rendered text lifts the
    pixel std past a flat-frame threshold — but such a frame is still ONE near-
    identical color over almost the whole canvas, so the fraction of pixels within
    a tight epsilon of the median color stays very high. A real image has a low
    dominant fraction, so the pair separates refusals from content."""
    img = image[0] if image.dim() == 4 else image
    flat = img.reshape(-1, img.shape[-1]).float()
    std = float(flat.std().item())
    median = flat.median(dim=0).values
    dom = float(((flat - median).abs().amax(dim=-1) < 0.04).float().mean().item())
    means = [round(float(m), 3) for m in flat.mean(dim=0)]
    return std, dom, means


class IdeogramSamplerNode(io.ComfyNode):
    """Ideogram 4 sampler with automatic retry past the model's stochastic
    'Image blocked by safety filter' refusal.

    Ideogram 4's open weights emit a near-uniform gray refusal frame on a
    fraction of seeds — an officially-acknowledged false-positive (higher for
    non-JSON prompts), baked into the weights and not disableable. It's
    seed-dependent, so re-rolling the noise seed escapes it. This node samples,
    VAE-decodes, and re-samples with the next seed up to `max_retries` times when
    the decoded frame reads as a refusal: either a near-flat frame (pixel std below
    `block_std`; refusal ~0.04 std vs real images ~0.15-0.33 on a 0-1 scale) OR a
    gray screen with the refusal TEXT painted on — the text lifts std past the flat
    threshold, so that variant is caught by a high dominant-color fraction instead.

    Drop-in replacement for SamplerCustomAdvanced + VAEDecode (returns IMAGE).
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="PromptChain_IdeogramSampler",
            display_name="Prompt Chain Ideogram Sampler (auto-retry)",
            category="promptchain",
            inputs=[
                io.Noise.Input("noise"),
                io.Guider.Input("guider"),
                io.Sampler.Input("sampler"),
                io.Sigmas.Input("sigmas"),
                io.Latent.Input("latent_image"),
                io.Vae.Input("vae"),
                io.Int.Input("max_retries", default=4, min=0, max=16,
                             tooltip="Extra re-rolls if the model returns its gray "
                                     "'Image blocked by safety filter' frame."),
                io.Float.Input("block_std", default=0.08, min=0.0, max=1.0, step=0.005,
                               tooltip="Pixel-std threshold below which a decoded image is "
                                       "treated as a blocked/refusal frame (0-1 scale)."),
            ],
            outputs=[
                io.Image.Output("IMAGE"),
            ],
        )

    @classmethod
    def execute(cls, noise, guider, sampler, sigmas, latent_image,
                vae, max_retries: int = 4, block_std: float = 0.08) -> io.NodeOutput:
        base = latent_image
        samples_in = comfy.sample.fix_empty_latent_channels(
            guider.model_patcher, base["samples"],
            base.get("downscale_ratio_spacial", None),
            base.get("downscale_ratio_temporal", None))
        noise_mask = base.get("noise_mask", None)
        batch_inds = base.get("batch_index", None)
        base_seed = int(getattr(noise, "seed", 0))
        disable_pbar = not comfy.utils.PROGRESS_BAR_ENABLED

        last_image = None
        for attempt in range(max_retries + 1):
            seed = base_seed + attempt  # attempt 0 keeps the user's seed
            noise_tensor = comfy.sample.prepare_noise(samples_in, seed, batch_inds)
            x0_output = {}
            callback = latent_preview.prepare_callback(
                guider.model_patcher, sigmas.shape[-1] - 1, x0_output)
            samples = guider.sample(noise_tensor, samples_in, sampler, sigmas,
                                    denoise_mask=noise_mask, callback=callback,
                                    disable_pbar=disable_pbar, seed=seed)
            samples = samples.to(comfy.model_management.intermediate_device())

            image = vae.decode(samples)
            if len(image.shape) == 5:  # video VAE — flatten batches
                image = image.reshape(-1, image.shape[-3], image.shape[-2], image.shape[-1])
            last_image = image

            std, dom, means = _refusal_stats(image)
            # The flat-gray case (std < block_std) plus the gray-screen-WITH-text
            # case (a very high dominant-color fraction), the latter gated on low-ish
            # std so a busy real image is never flagged.
            blocked = std < block_std or (std < 0.13 and dom > 0.70)
            logger.info("[IdeogramSampler] attempt %d/%d seed=%d std=%.4f dom=%.2f rgb_mean=%s -> %s",
                        attempt, max_retries, seed, std, dom, means,
                        "BLOCKED (retry)" if blocked else "ok")
            if not blocked:
                return io.NodeOutput(image)

        logger.warning("[IdeogramSampler] still blocked after %d attempts; "
                       "returning last frame", max_retries + 1)
        return io.NodeOutput(last_image)
