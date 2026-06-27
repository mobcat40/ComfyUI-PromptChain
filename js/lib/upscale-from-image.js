// Viewer "Upscale": rebuild a ready-to-queue upscale graph from a finished
// image's embedded workflow metadata.
//
// Strategy is graft, not re-derive: load the embedded workflow into a new tab,
// let the existing injectUpscaler do the case handling it already knows
// (regional conditioning, ControlNet slot-tracing, split Flux loaders, saved
// per-model USDU settings), then shape the conditioning to the mode the user
// picked in the upscale modal, prune the graph down to the upscale core, and
// feed it a content-addressed input-dir copy of the viewed image. Images
// without usable metadata fall back to a plain ESRGAN pass, which works on
// anything.
//
// Modes (picked in the viewer's upscale modal, defaulted from what the source
// workflow actually used):
//   prompt   — USDU re-details tiles with the image's prompt only.
//   depth    — prompt + one depth ControlNet keeping structure pinned. Hint
//              source is the workflow's 3D pose render or the image itself.
//   regional — per-figure regional conditioning + 3D pose depth, for
//              multi-character scenes.

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { getLink } from "./slot-utils.js";
import { offscreenIdBase } from "./offscreen-graph.js";
import {
  injectUpscaler,
  buildRegionalUpscaleCond,
  setControlNetModel,
  CONTROLNET_TYPES,
  resolvePre,
  hasPre,
} from "./model-settings-bridge.js";

const EMPTY_WORKFLOW = { last_node_id: 0, last_link_id: 0, nodes: [], links: [], groups: [], config: {}, extra: {}, version: 0.4 };

function toast(severity, detail) {
  app.extensionManager?.toast?.add({ severity, summary: "Upscale", detail, life: 6000 });
}

// Build failures die in the browser console where remote debugging can't see
// them — relay to the server log (best-effort; the route may not exist until
// the server restarts after deploy).
export function reportClientError(where, e, context = null) {
  try {
    const ctx = context ? ` ${JSON.stringify(context)}` : "";
    api.fetchApi("/promptchain/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        where,
        message: `${e?.message || String(e)}${ctx}`,
        stack: e?.stack || "",
      }),
    }).catch(() => {});
  } catch { /* reporting must never break the flow it reports on */ }
}

// Diagnostic: log exactly what an upscale Apply submitted, into comfyui.log
// (as "[upscale-run]") so a run's model/denoise/recipe is recoverable without
// reverse-engineering the output PNG. apiPrompt is app.graphToPrompt().output.
export function logUpscaleRun(apiPrompt, engine) {
  try {
    if (!apiPrompt || typeof apiPrompt !== "object") return;
    const vals = Object.values(apiPrompt);
    const find = (pred) => vals.find(pred) || null;
    const unet = find((n) => n.class_type === "UNETLoader")?.inputs?.unet_name
      || find((n) => n.class_type === "CheckpointLoaderSimple" || n.class_type === "CheckpointLoader")?.inputs?.ckpt_name
      || null;
    const us = find((n) => (n.class_type || "").includes("UltimateSDUpscale"))?.inputs
      || find((n) => n.class_type === "KSampler" || n.class_type === "PromptChain_MaskedDetail")?.inputs
      || {};
    const climb = find((n) => n.class_type === "UpscaleModelLoader")?.inputs?.model_name || null;
    const vae = find((n) => n.class_type === "VAELoader")?.inputs?.vae_name
      || find((n) => n.class_type === "VAEUtils_CustomVAELoader")?.inputs?.vae_name || null;
    const tile = us.tile_width != null ? `${us.tile_width}x${us.tile_height}` : null;
    const summary = {
      engine: engine || "?", model: unet, vae, climb,
      denoise: us.denoise, cfg: us.cfg, steps: us.steps,
      sampler: us.sampler_name, scheduler: us.scheduler,
      tile, upscale_by: us.upscale_by, seam: us.seam_fix_mode, mode: us.mode_type,
    };
    reportClientError("upscale-run",
      { message: `engine=${engine} model=${unet} vae=${vae} denoise=${us.denoise} cfg=${us.cfg} steps=${us.steps} sampler=${us.sampler_name}/${us.scheduler} tile=${tile} upscale_by=${us.upscale_by} seam=${us.seam_fix_mode} climb=${climb}` },
      summary);
  } catch { /* never break the run */ }
}

function freshWorkflowId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function traceInput(graph, node, inputName) {
  const input = node.inputs?.find((i) => i.name === inputName);
  if (!input?.link) return null;
  const link = getLink(graph, input.link);
  const origin = link && graph.getNodeById(link.origin_id);
  return origin ? { node: origin, slot: link.origin_slot } : null;
}

function inputIdx(node, name, fallback) {
  const idx = node.inputs?.findIndex((i) => i.name === name) ?? -1;
  return idx >= 0 ? idx : fallback;
}

// ---------------------------------------------------------------------------
// Capability analysis — what the embedded workflow can support, computed from
// the serialized JSON (before any graph is loaded) so the modal can offer and
// default the right modes.

// New depth branches need the DepthAnything preprocessor registered and an
// SDXL union ControlNet in the loader's combo. Probing an off-graph loader
// instance is how the injects read combo options too.
function depthAssetsAvailable() {
  try {
    const LG = window.LiteGraph;
    if (!hasPre("DepthAnythingV2Preprocessor")) return false;
    const probe = LG.createNode("ControlNetLoader");
    const opts = probe?.widgets?.find((w) => w.name === "control_net_name")?.options?.values || [];
    return opts.some((o) => /union/i.test(o));
  } catch {
    return false;
  }
}

// Default destination = the source workflow's own save prefix with _upscale
// appended, so upscales land right beside the gens they came from. Guarded so
// re-upscaling an upscale doesn't stack suffixes.
function deriveUpscalePrefix(base) {
  if (!base) return "upscale/upscale";
  return base.endsWith("_upscale") ? base : `${base}_upscale`;
}

// Where the source workflow saves: the SaveImage fed by the USDU when one
// exists (its prefix is already a final destination), else the one on the
// detailer/decode output — the same anchor injectUpscaler inherits from.
// Exported for the inpaint graft, which derives its own _inpaint suffix.
export function sourceSavePrefixInfo(workflow) {
  const nodes = workflow?.nodes || [];
  const links = workflow?.links || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const saveFedBy = (node) => {
    if (!node) return null;
    for (const l of links) {
      const origin = Array.isArray(l) ? l[1] : l?.origin_id;
      const target = Array.isArray(l) ? l[3] : l?.target_id;
      if (origin !== node.id) continue;
      const t = byId.get(target);
      if (t?.type === "SaveImage" && typeof t.widgets_values?.[0] === "string") return t.widgets_values[0];
    }
    return null;
  };
  const usdu = nodes.find((n) => n.type === "UltimateSDUpscale");
  if (usdu) {
    const p = saveFedBy(usdu);
    if (p) return { prefix: p, fromUpscaler: true };
  }
  const src = nodes.find((n) => n.type === "PromptChain_RegionalDetailer")
    || nodes.find((n) => n.type === "FaceDetailer")
    || nodes.find((n) => n.type === "VAEDecode");
  return { prefix: saveFedBy(src), fromUpscaler: false };
}

function sourceSavePrefix(workflow) {
  const { prefix, fromUpscaler } = sourceSavePrefixInfo(workflow);
  if (fromUpscaler && prefix) return prefix;
  return deriveUpscalePrefix(prefix);
}

export function analyzeUpscaleCaps(data) {
  const nodes = data.workflow?.nodes || [];
  const has = (t) => nodes.some((n) => n.type === t);

  // The plain-pass engine choice (UltraSharp vs SeedVR2 restore-first) only
  // renders when the SeedVR2 pack is actually installed.
  const seedvr2Available = !!window.LiteGraph?.registered_node_types?.["SeedVR2VideoUpscaler"];

  // High-Detail krea2 renders decode through VAEUtils_VAEDecodeTiled (spacepxl),
  // not the stock VAEDecode — still a graftable sampler->decode pipeline, so
  // accept the tiled decoders too or those renders fall to plain ESRGAN only.
  const graftable = has("UltimateSDUpscale") || (
    has("PromptChain_PromptChain")
    && (has("KSampler") || has("KSamplerAdvanced") || has("SamplerCustomAdvanced"))
    && (has("VAEDecode") || has("VAEUtils_VAEDecodeTiled") || has("VAEDecodeTiled"))
  );
  if (!graftable) {
    return {
      graftable: false,
      modes: { prompt: { ok: false }, depth: { ok: false }, regional: { ok: false } },
      sources: { pose: { ok: false }, image: { ok: false } },
      conditions: { ipadapter: { ok: false, installable: false }, pulid: { ok: false, installable: false } },
      defaultMode: "prompt", defaultDepthSource: "image",
      defaultSavePrefix: "upscale/upscale",
      seedvr2Available,
    };
  }

  // pose_state is the PoseStudio node's second widget (control_map, pose_state,
  // width, height) — non-empty means the frontend can re-render the maps.
  const poseNode = nodes.find((n) => n.type === "PromptChain_PoseStudio");
  const poseState = typeof poseNode?.widgets_values?.[1] === "string" ? poseNode.widgets_values[1] : "";
  const hasPose = poseState.trim().length > 2;

  const hasCouple = has("PromptChain_AttentionCouple") || has("PromptChain_ZImageRegionalCouple");
  const hasRegionalNodes = hasCouple || has("PromptChain_RegionalConditioning");
  // Depth mode builds an SDXL union ControlNet (ensureDepthBranch) — only valid when
  // the source already HAS a classic depth apply, OR we can build one on SDXL. Do NOT
  // light it up just because the DepthAnything preprocessor is installed (that would
  // offer depth for Z-Image/Flux, whose models reject an SDXL ControlNet → "y is None").
  const hasDepthCN = nodes.some((n) => n.type === "ControlNetApplyAdvanced" && n.properties?.pcrControlType === "depth");
  // Split loaders (UNETLoader) mean Flux/other — the SDXL union depth cluster
  // would load the wrong net there, so only keep-existing depth is allowed.
  const isSdxl = has("CheckpointLoaderSimple") || has("CheckpointLoader");
  // Plain prompt conditioning exists as text encodes (any CLIPTextEncode
  // variant) OR an Attention Couple: regional builds have no encode nodes —
  // the couple encodes clip+regions itself, and its positive/negative outputs
  // are the global prompt (the per-figure logic rides the patched MODEL,
  // which the upscaler never takes).
  const hasTextEncode = nodes.some((n) => typeof n.type === "string" && n.type.startsWith("CLIPTextEncode")) || hasCouple;
  const assets = depthAssetsAvailable();

  const canBuildDepth = isSdxl && assets;
  const modes = {
    prompt: hasTextEncode
      ? { ok: true }
      : { ok: false, reason: "This image's workflow only carries regional conditioning — no plain prompt to upscale with." },
    depth: (hasDepthCN || canBuildDepth)
      ? { ok: true }
      : { ok: false, reason: isSdxl
          ? "Needs the ControlNet preprocessor pack and an SDXL union ControlNet model."
          : "Depth injection isn't wired for this model family yet." },
    // Regional upscale grafts the SDXL union depth ControlNet (ensureDepthBranch),
    // so it's SDXL-only; non-SDXL regional sources fall back to the prompt pass.
    regional: (hasRegionalNodes && hasPose && isSdxl)
      ? { ok: true }
      : { ok: false, reason: !isSdxl
          ? "Regional-aware upscale isn't wired for this model family yet — use the prompt pass."
          : hasRegionalNodes
          ? "No 3D pose in this image's workflow."
          : "The image wasn't generated with regional conditioning." },
  };
  const sources = {
    pose: { ok: hasPose },
    image: { ok: canBuildDepth || hasDepthCN },
  };

  const defaultMode =
    (modes.regional.ok && hasRegionalNodes) ? "regional"
    : (modes.depth.ok && hasDepthCN) ? "depth"
    : modes.prompt.ok ? "prompt"
    : modes.depth.ok ? "depth" : "regional";
  const defaultDepthSource = hasPose ? "pose" : "image";

  // Identity/style lock for the re-detail pass (SDXL only — same gate as the
  // inpaint conditions; Flux PuLID is a different node family, not wired here).
  const reg = window.LiteGraph?.registered_node_types || {};
  const condReason = !isSdxl
    ? "SDXL checkpoints only for now."
    : "Install the pack first (model panel → add).";
  // ok = usable now (engine supports it AND its pack is registered).
  // installable = engine supports it but the pack isn't installed yet, so the
  // modal can OFFER it and install on apply (instead of hiding it).
  const conditions = {
    ipadapter: { ok: isSdxl && !!reg["IPAdapterAdvanced"] && !!reg["IPAdapterUnifiedLoader"], installable: isSdxl, reason: condReason },
    pulid: { ok: isSdxl && !!reg["ApplyPulidAdvanced"], installable: isSdxl, reason: condReason },
  };

  return {
    graftable: true, modes, sources, conditions, defaultMode, defaultDepthSource,
    defaultSavePrefix: sourceSavePrefix(data.workflow),
    seedvr2Available,
  };
}

// ---------------------------------------------------------------------------
// Engine picker — the modal can re-detail with a model the user picks instead
// of the image's source model. Per-architecture prompt-push policy: sdxl
// engines prefill the image's own prompt (user spec), qwen_edit engines
// prefill a fixed enhance instruction.

// Tile prompts are PAINT: any texture noun gets synthesized onto every tile
// ("fabric weave" once cross-hatched a whole face; negating "smooth" does the
// same from the other side). The anti-grid terms ride the negative instead.
export const SDXL_TILE_NEUTRAL_POSITIVE = "photograph, photorealistic, sharp focus, high detail, natural skin";
export const SDXL_TILE_NEGATIVE = "fabric texture, canvas texture, cross-hatch, moire, grid pattern, blurry, lowres, jpeg artifacts, watermark";
export const QWEN_ENHANCE_INSTRUCTION = "Enhance this image: increase quality, sharpness and fine detail. Keep the composition, subjects, colors and lighting exactly the same.";
// The reference template runs 2.5MP, but Qwen Edit grows plastic skin past
// ~1920px on the long edge — 2MP keeps common aspect ratios under that line.
export const QWEN_EDIT_STAGE_MP = 2.0;
// FLUX.1 tile regime (GPU-proven on Krea): guidance rides FluxGuidance, cfg
// stays 1.0, NO tile ControlNet — flux1's schedule shift is mild enough that
// low-denoise tiles hold structure on their own (only FLUX.2's shift-as-mu
// breaks tiling).
export const FLUX1_TILE_GUIDANCE = 3.0;

function comboProbe(nodeType, widgetName) {
  try {
    const probe = window.LiteGraph?.createNode?.(nodeType);
    return probe?.widgets?.find((w) => w.name === widgetName)?.options?.values || [];
  } catch {
    return [];
  }
}

// What the non-source engines can actually build on this install — probed off
// registered node defs and loader combos (never /object_info status: unknown
// classes return 200 {}).
export function engineAssetSupport() {
  const reg = window.LiteGraph?.registered_node_types || {};
  const esrgan = comboProbe("UpscaleModelLoader", "model_name").length > 0;
  const tileCn = comboProbe("ControlNetLoader", "control_net_name")
    .some((o) => /tile/i.test(o) && /sdxl/i.test(o) && !/flux/i.test(o));
  const sdxl = !!reg["UltimateSDUpscaleNoUpscale"] && !!reg["ControlNetApplyAdvanced"] && tileCn && esrgan;
  const qwen = !!reg["TextEncodeQwenImageEditPlus"] && !!reg["FluxKontextMultiReferenceLatentMethod"]
    && !!reg["ModelSamplingAuraFlow"] && !!reg["CFGNorm"] && esrgan
    && comboProbe("CLIPLoader", "clip_name").some((o) => /qwen.*2[._]5.*vl/i.test(o))
    && comboProbe("VAELoader", "vae_name").some((o) => /qwen.*image.*vae/i.test(o));
  const dualClips = comboProbe("DualCLIPLoader", "clip_name1");
  const flux1 = !!reg["UltimateSDUpscaleNoUpscale"] && !!reg["FluxGuidance"] && esrgan
    && dualClips.some((o) => /clip_l/i.test(o))
    && dualClips.some((o) => /t5xxl/i.test(o))
    && comboProbe("VAELoader", "vae_name").some((o) => /(^|[\\/])ae\.(safetensors|sft)$/i.test(o));
  const zimage = !!reg["UltimateSDUpscaleNoUpscale"] && !!reg["ModelSamplingAuraFlow"] && esrgan
    && comboProbe("UNETLoader", "unet_name").some((o) => /z.?image/i.test(o))
    && comboProbe("CLIPLoader", "clip_name").some((o) => /qwen.*3[._]4b|lumina2/i.test(o))
    && comboProbe("VAELoader", "vae_name").some((o) => /(^|[\\/])ae\.(safetensors|sft)$/i.test(o));
  // Krea 2 (DiT, mirrors zimage but no ModelSamplingAuraFlow — shift is baked
  // into the model class): krea2 UNET + qwen3vl_4b text encoder + qwen_image_vae.
  const krea2 = !!reg["UltimateSDUpscaleNoUpscale"] && esrgan
    && comboProbe("UNETLoader", "unet_name").some((o) => /krea2/i.test(o))
    && comboProbe("CLIPLoader", "clip_name").some((o) => /qwen3vl.*4b|qwen3.?vl.*4b/i.test(o))
    && comboProbe("VAELoader", "vae_name").some((o) => /qwen.*image.*vae/i.test(o));
  return { sdxl, qwen, flux1, zimage, krea2 };
}

// The modal's defaults for a picked engine model. SDXL: the CN-locked tile
// recipe — saved per-model USDU denoise/sampler/seam values are deliberately
// NOT inherited (they were tuned for prompt-driven USDU without a tile CN;
// 0.25 + SDE in this regime stipples fake pores), only shape knobs carry
// over. Qwen: the template recipe; denoise stays 1.0 — the conditioning image
// is the anchor, partial denoise just blends the sub-pixel-shifted re-render
// with the original.
function engineModelDefaults(architecture, config) {
  const nodes = config?.nodes || {};
  if (architecture === "qwen_edit") {
    const ks = nodes.KSampler || {};
    return {
      denoise: 1.0,
      sampler: "euler",
      scheduler: "simple",
      advanced: { steps: ks.steps ?? 40, cfg: ks.cfg ?? 4 },
    };
  }
  if (architecture === "zimage") {
    // Family from the filename: Turbo is step-distilled (cfg 1.3, ~8 steps,
    // 0.7 denoise — low denoise truncates its sigma schedule to a tail the
    // few-step field can't resolve, so it blotches); Base is non-distilled
    // (cfg 3.0, more steps) and re-details cleanly at a low-denoise tail.
    const turbo = /turbo|8steps/i.test(config?.filename || "");
    const usdu = nodes.UltimateSDUpscale || {};
    return {
      denoise: turbo ? 0.7 : 0.15,
      denoiseMax: turbo ? 0.8 : 0.4,
      // Base (non-distilled) wants a stochastic sampler for real skin texture;
      // res_multistep (Turbo's few-step sampler) sterilizes base skin.
      sampler: turbo ? "res_multistep" : "dpmpp_sde",
      scheduler: "beta",
      advanced: {
        steps: usdu.steps ?? (turbo ? 8 : 20),
        cfg: turbo ? 1.3 : 3.0,
        tile_width: usdu.tile_width ?? 1024,
        tile_height: usdu.tile_height ?? 1024,
        mask_blur: 32,
        tile_padding: 64,
        seam_fix_mode: "None",
      },
    };
  }
  if (architecture === "flux") {
    const usdu = nodes.UltimateSDUpscale || {};
    // cfg is pinned at 1.0 (never inherited): flux1 guidance rides
    // FluxGuidance — a saved gen cfg would double sampling time and burn.
    return {
      denoise: 0.2,
      denoiseMax: 0.4,
      sampler: "euler",
      scheduler: "simple",
      advanced: {
        steps: usdu.steps ?? 20,
        cfg: 1.0,
        tile_width: usdu.tile_width ?? 1024,
        tile_height: usdu.tile_height ?? 1024,
        mask_blur: 32,
        tile_padding: 64,
        seam_fix_mode: "None",
      },
    };
  }
  if (architecture === "krea2") {
    // Krea 2 Turbo is step-distilled (cfg 1.0, 8 steps), cfg native (no
    // FluxGuidance/ModelSampling). TILE denoise stays LOW: a tile routine needs
    // each tile anchored to the source or adjacent tiles regenerate different
    // content and won't stitch (visible seams). The catch — at low denoise the
    // distilled few-step field under-resolves the tile (some residual voronoi/
    // blotch on smooth skin; NOT a VAE artifact, persists through a clean
    // wan_2.1_vae decode). Turbo can't fully win either way in a tile pass; the
    // non-distilled RAW krea2 is the proper clean+coherent tile upscaler.
    // Turbo defaults to euler+simple (the official Krea recipe; suits the smooth
    // matte-PVC figurine finish). RAW keeps er_sde (grain-preserving for photoreal).
    const usdu = nodes.UltimateSDUpscale || {};
    // RAW = the undistilled base checkpoint. Non-distilled, so it resolves a LOW
    // denoise tile cleanly (no blotch) while staying anchored to the source (no
    // seams) — the proper clean+coherent tiled upscaler. It runs a REAL cfg +
    // full steps; Turbo stays the soft-but-coherent 0.45 / cfg 1.0 / 8-step
    // compromise. (Same wan_2.1_vae decode + qwen3vl CLIP either way.)
    const fn = config?.filename || "";
    const raw = /raw/i.test(fn) && !/turbo/i.test(fn);
    return {
      denoise: raw ? 0.35 : 0.45,
      // No tile ControlNet exists for Krea 2 (standalone DiT, not Flux), so each tile
      // is anchored only by the img2img floor — push denoise too far and a tile that
      // contains the whole subject regenerates it (doubling). Cap to the CN-less safe
      // band; Turbo can't go much below 0.45 without blotching, so 0.45/0.5 is its
      // narrow usable window. (Stronger re-detail without doubling needs smaller tiles.)
      denoiseMax: raw ? 0.45 : 0.5,
      sampler: raw ? "er_sde" : "euler",
      scheduler: "simple",
      advanced: {
        steps: usdu.steps ?? (raw ? 30 : 8),
        cfg: raw ? 3.5 : 1.0,
        tile_width: usdu.tile_width ?? 1024,
        tile_height: usdu.tile_height ?? 1024,
        mask_blur: 32,
        tile_padding: 64,
        mode_type: "Chess", // checkerboard order — neighbours redraw before a tile's seam (cleaner than Linear)
        seam_fix_mode: raw ? "Half Tile" : "None",
        // RAW's Half-Tile seam pass must NOT full-repaint (the node default is 1.0, which
        // makes seam bands hallucinate content that won't match the lightly-detailed tiles).
        seam_fix_denoise: raw ? 0.3 : undefined,
      },
    };
  }
  const usdu = nodes.UltimateSDUpscale || {};
  return {
    denoise: 0.15,
    denoiseMax: 0.4,
    sampler: "dpmpp_2m",
    scheduler: "karras",
    advanced: {
      steps: usdu.steps ?? 20,
      cfg: usdu.cfg ?? 5,
      tile_width: usdu.tile_width ?? 1024,
      tile_height: usdu.tile_height ?? 1024,
      mask_blur: 32,
      tile_padding: 64,
      seam_fix_mode: "None",
    },
  };
}

// Different files of the same model (fp8 vs bf16 vs GGUF quants) share one
// saved display name — the precision token off the filename tells them apart
// in the picker.
function precisionTag(filename) {
  const base = String(filename || "").toLowerCase();
  const m = base.match(/(fp8[a-z0-9]*(?:_scaled)?|bf16|fp16|fp32|nf4|int8|q[0-9]_[k0](?:_[sml])?|q[0-9])/);
  if (m) return m[1];
  if (/\.gguf$/.test(base)) return "gguf";
  return "";
}

// Engine-model candidates for the pickers (upscale modal + inpaint modal):
// every installed sdxl / flux1 / qwen_edit model, with display names,
// per-model tile defaults, and the model's own gen-time KSampler settings
// folded in.
export async function fetchEngineModels() {
  try {
    const listRes = await api.fetchApi("/promptchain/models/list");
    if (!listRes.ok) return [];
    const models = ((await listRes.json())?.models || [])
      .filter((m) => m.architecture === "sdxl" || m.architecture === "qwen_edit"
        || m.architecture === "zimage" || m.architecture === "krea2"
        // flux = the whole FLUX.1 family; edit/control/util variants don't
        // belong in a faithful tile pass (kontext re-renders, schnell is
        // step-distilled, fill/canny/depth/redux are tool models).
        || (m.architecture === "flux" && !/kontext|schnell|fill|canny|depth|redux/i.test(m.filename)));
    if (!models.length) return [];
    let settings = {};
    try {
      const bulkRes = await api.fetchApi("/promptchain/models/settings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashes: models.map((m) => m.hash) }),
      });
      if (bulkRes.ok) settings = (await bulkRes.json())?.settings || {};
    } catch { /* display names + saved tweaks are optional */ }
    const list = models.map((m) => {
      const config = settings[m.hash] || {};
      const ks = config?.nodes?.KSampler || {};
      const tag = config.display_name ? precisionTag(m.filename) : "";
      return {
        hash: m.hash,
        filename: m.filename,
        architecture: m.architecture,
        displayName: config.display_name
          ? (tag ? `${config.display_name} (${tag})` : config.display_name)
          : m.filename,
        defaults: engineModelDefaults(m.architecture, { ...config, filename: m.filename }),
        gen: {
          sampler: ks.sampler_name || null,
          scheduler: ks.scheduler || null,
          steps: ks.steps ?? null,
          cfg: ks.cfg ?? null,
        },
      };
    });
    // Still-colliding labels (same name, same precision) fall back to the
    // filename — the picker must never show two indistinguishable entries.
    const labelCounts = new Map();
    for (const e of list) labelCounts.set(e.displayName, (labelCounts.get(e.displayName) || 0) + 1);
    for (const e of list) {
      if (labelCounts.get(e.displayName) > 1) e.displayName = `${e.displayName} — ${e.filename}`;
    }
    return list;
  } catch {
    return [];
  }
}

// Saved per-model USDU settings + architecture, resolved from the workflow
// JSON's loader filename — gives the modal the same defaults the build itself
// will use.
export async function fetchSavedUsduSettings(workflow) {
  const nodes = workflow?.nodes || [];
  const loader = nodes.find((n) => n.type === "CheckpointLoaderSimple" || n.type === "CheckpointLoader")
    || nodes.find((n) => n.type === "UNETLoader" || n.type === "UnetLoaderGGUF");
  const file = typeof loader?.widgets_values?.[0] === "string" ? loader.widgets_values[0] : "";
  if (!file) return { settings: {}, architecture: "" };
  try {
    const idRes = await api.fetchApi(`/promptchain/models/identity?file=${encodeURIComponent(file)}`);
    if (!idRes.ok) return { settings: {}, architecture: "" };
    const identity = await idRes.json();
    let config = {};
    if (identity?.hash) {
      const sRes = await api.fetchApi(`/promptchain/models/settings/${identity.hash}`);
      if (sRes.ok) config = (await sRes.json()) || {};
    }
    return {
      settings: config?.nodes?.UltimateSDUpscale || {},
      // The model's own recommended gen sampler — the upscale recommendation
      // when no USDU-specific override exists.
      ksampler: config?.nodes?.KSampler || {},
      architecture: config?.architecture || identity?.architecture || "",
      family: config?.family || "",
      hash: identity?.hash || null,
    };
  } catch {
    return { settings: {}, ksampler: {}, architecture: "", family: "", hash: null };
  }
}

// Mirror of the inject's applyArchSamplerDefaults — the recommendation the
// modal highlights must equal what the build would pick on its own.
function recommendedSamplerFor(architecture) {
  const arch = architecture || "";
  if (arch === "flux" || arch === "flux2") return { sampler: "euler", scheduler: "simple" };
  if (arch === "zimage") return { sampler: "res_multistep", scheduler: "beta" };
  if (arch === "krea2") return { sampler: "euler", scheduler: "simple" };
  return { sampler: "dpmpp_2m_sde", scheduler: "karras" };
}

// Combo options off an off-graph probe node, same trick as the depth-assets
// check — node defs carry the live enum lists.
function usduComboOptions() {
  try {
    const probe = window.LiteGraph?.createNode?.("UltimateSDUpscale");
    const opts = (name) => probe?.widgets?.find((w) => w.name === name)?.options?.values || [];
    return {
      samplers: opts("sampler_name"),
      schedulers: opts("scheduler"),
      modes: opts("mode_type"),
      seamFixModes: opts("seam_fix_mode"),
    };
  } catch {
    return { samplers: [], schedulers: [], modes: [], seamFixModes: [] };
  }
}

// What sampler/scheduler the image was actually made with — if someone
// deviated from the defaults at gen time, the upscale continues in their
// choice. Scanned by value (widgets_values carry no names, and KSampler
// variants order them differently): the first string that's a known sampler /
// scheduler is the one. An existing USDU outranks the gen sampler.
function workflowSamplerChoice(workflow, samplers, schedulers) {
  const nodes = workflow?.nodes || [];
  const pick = (node) => {
    const vals = (node?.widgets_values || []).filter((v) => typeof v === "string");
    const s = vals.find((v) => samplers.includes(v)) || null;
    const sch = vals.find((v) => schedulers.includes(v)) || null;
    return s || sch ? { sampler: s, scheduler: sch } : null;
  };
  return pick(nodes.find((n) => n.type === "UltimateSDUpscale"))
    || pick(nodes.find((n) => n.type === "KSampler" || n.type === "KSamplerAdvanced"))
    || pick(nodes.find((n) => n.type === "KSamplerSelect"))
    || null;
}

// The effective USDU values the build would land on (inject DEFAULTS + arch
// adjustments + saved per-model settings) — the modal's Advanced section
// shows these so untouched fields equal what actually runs.
function usduBuildDefaults(architecture, saved) {
  const d = {
    steps: 15, cfg: 5, mode_type: "Chess",
    tile_width: 1024, tile_height: 1024,
    mask_blur: 12, tile_padding: 32,
    seam_fix_mode: "Half Tile", seam_fix_denoise: 0.25,
  };
  const arch = architecture || "";
  if (arch === "flux" || arch === "flux2") d.cfg = 1.0;
  else if (arch === "zimage") d.cfg = 1.3;
  // Krea 2 carries cfg natively at 1.0 (no FluxGuidance); euler/simple/0.45
  // denoise are applied in buildKrea2TileStage's defaults, not here (this dict
  // only holds USDU shape knobs).
  else if (arch === "krea2") d.cfg = 1.0;
  for (const key of Object.keys(d)) {
    if (saved && saved[key] !== undefined) d[key] = saved[key];
  }
  return d;
}

export async function prepareUpscale(entry) {
  const params = entry._browsePath != null
    ? `scope=${encodeURIComponent(entry._browseScope || "output")}&path=${encodeURIComponent(entry._browsePath)}`
    : `hash=${encodeURIComponent(entry.hash)}`;
  let data = null;
  try {
    const res = await api.fetchApi(`/promptchain/image-workflow?${params}`);
    if (res.ok) data = await res.json();
  } catch (e) {
    console.error("[PromptChain] image-workflow fetch failed", e);
  }
  if (!data?.input_ref) {
    toast("error", "Couldn't read the image on the server.");
    return null;
  }
  const caps = analyzeUpscaleCaps(data);
  const longest = Math.max(data.width || 0, data.height || 0);
  caps.defaultUpscaleBy = longest > 0 ? Math.min(8, Math.max(1, Math.round((4096 / longest) * 100) / 100)) : 2;
  // Engine-model list + combo enums populate regardless of graftability — the
  // picker's sdxl/qwen engines build standalone graphs that work on any image.
  const engineModelsPromise = fetchEngineModels();
  const combos = usduComboOptions();
  caps.samplerOptions = combos.samplers;
  caps.schedulerOptions = combos.schedulers;
  caps.modeOptions = combos.modes;
  caps.seamFixOptions = combos.seamFixModes;
  if (caps.graftable) {
    const { settings, ksampler, architecture, family, hash } = await fetchSavedUsduSettings(data.workflow);
    const recommended = recommendedSamplerFor(architecture);
    // The modal's prompt editor scopes templates/autocomplete to this when
    // the source engine is selected (a picked engine model overrides it).
    caps.sourceModelInfo = hash ? { hash, architecture, family } : null;
    // Krea 2 Turbo source-graft is a TILE pass: denoise stays LOW so each tile
    // anchors to the source and they stitch (high denoise = each tile a full
    // re-render = seams). The distillation means low-denoise tiles still carry
    // some residual blotch on smooth skin — that's a Turbo limitation a tile
    // routine can't escape; the non-distilled RAW model is the real clean+
    // coherent upscaler.
    caps.defaultDenoise = typeof settings.denoise === "number" ? settings.denoise
    : (architecture === "zimage" ? (family === "zimage_base" ? 0.15 : 0.7)
       : architecture === "krea2" ? 0.45 : 0.3);
    // Recommendation chain: a USDU-specific saved value > the MODEL's own
    // recommended gen sampler (its config's KSampler section) > generic arch
    // default. The model knows itself better than our tiling default does.
    caps.recommendedSampler = settings.sampler_name || ksampler.sampler_name || recommended.sampler;
    caps.recommendedScheduler = settings.scheduler || ksampler.scheduler || recommended.scheduler;
    // The config's in-range alternates get the model panel's blue treatment.
    caps.samplerAlternates = ksampler.sampler_name_options || [];
    caps.schedulerAlternates = ksampler.scheduler_options || [];
    // …but the SELECTED default is what the image was generated with, so a
    // deliberate deviation carries through to the upscale — EXCEPT Krea 2, whose
    // re-detail recipe is its own (euler is the house default). Inheriting a
    // stale gen sampler from an older er_sde render would silently override that
    // default; same deliberate skip as the flux2 refine below.
    const inherited = workflowSamplerChoice(data.workflow, combos.samplers, combos.schedulers);
    caps.defaultSampler = architecture === "krea2"
      ? caps.recommendedSampler
      : (inherited?.sampler || caps.recommendedSampler);
    caps.defaultScheduler = inherited?.scheduler || caps.recommendedScheduler;
    caps.advancedDefaults = usduBuildDefaults(architecture, settings);
    caps.architecture = architecture;
    if (architecture === "flux2") {
      // Flux2 builds the full-frame reference-anchored refine, not USDU — the
      // modal's defaults mirror its recipe: high denoise regenerates texture
      // while the ReferenceLatent anchors composition; gen-time sampler
      // inheritance is deliberately skipped (the refine recipe is its own).
      caps.denoiseMax = 1.0;
      caps.defaultDenoise = typeof settings.denoise === "number" ? settings.denoise : 0.6;
      caps.recommendedSampler = "euler_ancestral_cfg_pp";
      caps.recommendedScheduler = "sgm_uniform";
      caps.defaultSampler = caps.recommendedSampler;
      caps.defaultScheduler = caps.recommendedScheduler;
      if (family !== "flux2_klein") {
        // Non-Klein sources refine on pinned Klein base — its official recipe.
        if (settings.cfg === undefined) caps.advancedDefaults.cfg = 5;
        if (settings.steps === undefined) caps.advancedDefaults.steps = 20;
      } else {
        const guider = (data.workflow?.nodes || []).find((n) => n.type === "CFGGuider");
        const genCfg = Number(guider?.widgets_values?.[0]);
        if (settings.cfg === undefined && genCfg > 0) caps.advancedDefaults.cfg = genCfg;
        if (settings.steps === undefined) caps.advancedDefaults.steps = 24;
      }
    }
  }
  const support = engineAssetSupport();
  caps.engineModels = (await engineModelsPromise).filter((m) =>
    (m.architecture === "sdxl" && support.sdxl)
    || (m.architecture === "qwen_edit" && support.qwen)
    || (m.architecture === "flux" && support.flux1)
    || (m.architecture === "zimage" && support.zimage)
    || (m.architecture === "krea2" && support.krea2));
  caps.enginePromptDefaults = { qwen: QWEN_ENHANCE_INSTRUCTION, sdxlFallback: SDXL_TILE_NEUTRAL_POSITIVE };
  // Climb-model picker: the whole installed ESRGAN-family list, with the
  // empirically-settled v1 pick as the recommendation. Degradation-trained
  // models (RealESRGAN/Nomos) are a free middle tier on rough sources.
  caps.upscaleModelOptions = comboProbe("UpscaleModelLoader", "model_name");
  caps.recommendedUpscaleModel = defaultUpscaleModelPick(caps.upscaleModelOptions);
  // Restore recommendation, by SOURCE: a jpeg or small input likely carries
  // degradation a plain GAN climb would smear (the 736px webcam eye-smear);
  // clean renders gain nothing from the restore round-trip. A GENERATED render
  // (embedded sampler) is clean by construction — a small/square one (1024²) is
  // NOT degraded, so don't let the size rule false-trigger SeedVR2 on it; only
  // raw imported photos (no generation workflow) get the restore recommendation.
  // Matches the prior A/B: UltraSharp beats SeedVR2 on clean renders.
  const srcNodes = data.workflow?.nodes || [];
  const isRender = srcNodes.some((n) => n.type === "KSampler" || n.type === "KSamplerAdvanced"
    || n.type === "SamplerCustom" || n.type === "SamplerCustomAdvanced");
  caps.recommendedRestore = caps.seedvr2Available && !isRender
    && (/\.jpe?g$/i.test(data.filename || "") || Math.max(data.width || 0, data.height || 0) < 1100)
    ? "seedvr2" : "none";
  // DIAGNOSTIC: why the engine picker may show only "Model climb only". If
  // engineModels is 0 here, the re-detail engines were filtered out — either the
  // asset probe (support) came back false or /models/list returned nothing (e.g.
  // model index not finished scanning yet). Read this in the browser console.
  console.log("[PromptChain] upscale caps:", JSON.stringify({
    graftable: caps.graftable, engineModels: caps.engineModels.length, support,
    byArch: caps.engineModels.reduce((a, m) => ((a[m.architecture] = (a[m.architecture] || 0) + 1), a), {}),
  }));
  return { data, caps };
}

// ---------------------------------------------------------------------------
// Conditioning shaping — runs on the loaded graph before pruning, so anything
// a mode drops from the USDU's conditioning chain falls out of the keep set.

// Walk a USDU conditioning input upstream past ControlNetApplyAdvanced nodes
// (following the same-named input keeps positive/negative slots straight).
// Flux 2 reference chains get the same treatment as the inject: USDU can't
// digest ReferenceLatent conds (ssitu#163), so when one is present, drop to
// the raw text encode beneath it (and beneath any FluxGuidance wrapper);
// reference-free conditioning passes through untouched.
function walkPastApplies(graph, node, inputName) {
  let src = traceInput(graph, node, inputName);
  while (src?.node?.comfyClass === "ControlNetApplyAdvanced") {
    src = traceInput(graph, src.node, inputName);
  }
  let probe = src, sawReference = false;
  while (probe?.node && (probe.node.comfyClass === "ReferenceLatent" || probe.node.comfyClass === "FluxGuidance")) {
    if (probe.node.comfyClass === "ReferenceLatent") sawReference = true;
    probe = traceInput(graph, probe.node, "conditioning");
  }
  return sawReference ? probe : src;
}

// Prompt-only: reconnect USDU conditioning to the base text encodes, dropping
// ControlNet applies and regional conditioning from the chain.
function rewireToBaseConditioning(graph, usNode) {
  for (const name of ["positive", "negative"]) {
    let src = walkPastApplies(graph, usNode, name);
    if (src?.node?.comfyClass === "PromptChain_RegionalConditioning") {
      // Regional grafts feed USDU from RegionalConditioning; the plain encodes
      // still exist on the sampler side of the source workflow — trace there.
      const ks = graph._nodes.find((n) => n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced");
      const fromSampler = ks && walkPastApplies(graph, ks, name);
      if (fromSampler?.node) src = fromSampler;
    }
    if (src?.node) {
      src.node.connect(src.slot, usNode, inputIdx(usNode, name, name === "positive" ? 2 : 3));
    }
  }
}

// Find a depth ControlNet apply already in the USDU's positive chain, plus its
// preprocessor when the hint goes through DepthAnything.
function findDepthApply(graph, usNode) {
  let src = traceInput(graph, usNode, "positive");
  while (src?.node?.comfyClass === "ControlNetApplyAdvanced") {
    const apply = src.node;
    const hintSrc = traceInput(graph, apply, "image");
    const pre = (hintSrc?.node?.comfyClass === "DepthAnythingV2Preprocessor"
      || hintSrc?.node?.comfyClass === "PromptChain_DepthAnything") ? hintSrc.node : null;
    if (pre || apply.properties?.pcrControlType === "depth") return { apply, pre };
    src = traceInput(graph, apply, "positive");
  }
  return null;
}

// Make sure one depth ControlNet sits between the USDU's current conditioning
// sources and the USDU, hinted from the requested source (3D pose render or
// the upscale input image). An existing depth apply is kept — tuned strength
// survives — and only its hint is re-pointed when the source differs.
function ensureDepthBranch(graph, LG, usNode, depthSource, loadNode) {
  const poser = graph._nodes.find((n) => n.comfyClass === "PromptChain_PoseStudio");
  const sourceNode = depthSource === "pose" && poser ? poser : loadNode;
  const sourceSlot = sourceNode === poser ? (poser.outputs?.findIndex((o) => o.name === "IMAGE") ?? 0) : 0;

  const existing = findDepthApply(graph, usNode);
  if (existing) {
    if (existing.pre) {
      const cur = traceInput(graph, existing.pre, "image");
      if (cur?.node !== sourceNode) {
        sourceNode.connect(sourceSlot, existing.pre, inputIdx(existing.pre, "image", 0));
      }
    }
    return true;
  }

  const cfg = CONTROLNET_TYPES.depth;
  const pre = LG.createNode(resolvePre(cfg.pre));
  const loader = LG.createNode("ControlNetLoader");
  const setUnion = LG.createNode("SetUnionControlNetType");
  const applyNode = LG.createNode("ControlNetApplyAdvanced");
  if (!pre || !loader || !setUnion || !applyNode) return false;

  const ax = usNode.pos[0];
  const ay = usNode.pos[1];
  pre.pos = [ax - 700, ay + 420];
  loader.pos = [ax - 700, ay + 640];
  setUnion.pos = [ax - 700, ay + 780];
  applyNode.pos = [ax - 360, ay + 420];
  graph.add(pre); graph.add(loader); graph.add(setUnion); graph.add(applyNode);

  applyNode.title = `ControlNet — Depth${sourceNode === poser ? " (pose)" : ""}`;
  applyNode.properties = { ...(applyNode.properties || {}), pcrControlType: "depth" };
  setControlNetModel(loader, cfg.model);
  const unionW = setUnion.widgets?.find((w) => w.name === "type");
  if (unionW) { unionW.value = cfg.unionType; unionW.callback?.(cfg.unionType); }
  for (const w of applyNode.widgets || []) {
    if (w.name === "strength") { w.value = cfg.strength; w.callback?.(cfg.strength); }
    else if (w.name === "start_percent") { w.value = 0.0; w.callback?.(0.0); }
    else if (w.name === "end_percent") { w.value = cfg.end; w.callback?.(cfg.end); }
  }
  const resW = pre.widgets?.find((w) => w.name === "resolution");
  if (resW) { resW.value = 1024; resW.callback?.(1024); }

  const posSrc = traceInput(graph, usNode, "positive");
  const negSrc = traceInput(graph, usNode, "negative");
  if (!posSrc?.node || !negSrc?.node) return false;

  sourceNode.connect(sourceSlot, pre, inputIdx(pre, "image", 0));
  pre.connect(0, applyNode, inputIdx(applyNode, "image", 3));
  loader.connect(0, setUnion, 0);
  setUnion.connect(0, applyNode, inputIdx(applyNode, "control_net", 2));
  posSrc.node.connect(posSrc.slot, applyNode, inputIdx(applyNode, "positive", 0));
  negSrc.node.connect(negSrc.slot, applyNode, inputIdx(applyNode, "negative", 1));
  applyNode.connect(0, usNode, inputIdx(usNode, "positive", 2));
  applyNode.connect(1, usNode, inputIdx(usNode, "negative", 3));
  return true;
}

// Regional mode on a workflow that already carried a USDU: make sure its
// conditioning comes from a PromptChain_RegionalConditioning. Workflows built
// by Add > Upscaler already have one wired; a couple without one gets the same
// rc the inject would build.
function ensureRegionalConditioning(graph, LG, usNode) {
  const src = walkPastApplies(graph, usNode, "positive");
  if (src?.node?.comfyClass === "PromptChain_RegionalConditioning") return true;
  const pcNode = graph._nodes.find((n) => n.comfyClass === "PromptChain_PromptChain");
  const couple = graph._nodes.find((n) => n.comfyClass === "PromptChain_AttentionCouple");
  if (!pcNode || !couple) return false;
  const rc = buildRegionalUpscaleCond(graph, LG, pcNode, couple, usNode.pos[0] - 384, usNode.pos[1]);
  if (!rc) return false;
  rc.connect(0, usNode, inputIdx(usNode, "positive", 2));
  rc.connect(1, usNode, inputIdx(usNode, "negative", 3));
  return true;
}

// An Edit crop selection rides as data.editRect (document coordinates). The
// pose scene's masks and depth render cover the SOURCE frame, so feeding them
// to a cropped USDU input would paint the whole scene onto the crop — splice
// crops scaled to the poser's own render dims to restore the mask↔pixel
// correspondence. Regions falling outside the rect crop to empty masks and
// contribute nothing (the unmasked global cond still covers every pixel).
function cropSceneToEditRect(graph, LG, usNode, editRect) {
  const poser = graph._nodes.find((n) => n.comfyClass === "PromptChain_PoseStudio");
  if (!poser || !(editRect?.docW > 0) || !(editRect?.docH > 0)) return;
  const poseW = poser.widgets?.find((w) => w.name === "width")?.value || editRect.docW;
  const poseH = poser.widgets?.find((w) => w.name === "height")?.value || editRect.docH;
  const x = Math.max(0, Math.min(poseW - 1, Math.round((editRect.x / editRect.docW) * poseW)));
  const y = Math.max(0, Math.min(poseH - 1, Math.round((editRect.y / editRect.docH) * poseH)));
  const w = Math.max(1, Math.min(poseW - x, Math.round((editRect.w / editRect.docW) * poseW)));
  const h = Math.max(1, Math.min(poseH - y, Math.round((editRect.h / editRect.docH) * poseH)));

  const splice = (target, inputName, cropClass, poserSlot) => {
    const src = traceInput(graph, target, inputName);
    if (src?.node !== poser || src.slot !== poserSlot) return;
    const crop = LG.createNode(cropClass);
    if (!crop) return;
    crop.pos = [poser.pos[0] + 250, target.pos[1] + 160];
    graph.add(crop);
    for (const [name, value] of [["x", x], ["y", y], ["width", w], ["height", h]]) {
      setNamedWidget(crop, name, value);
    }
    poser.connect(poserSlot, crop, inputIdx(crop, cropClass === "CropMask" ? "mask" : "image", 0));
    crop.connect(0, target, inputIdx(target, inputName, 0));
  };

  const condSrc = walkPastApplies(graph, usNode, "positive");
  if (condSrc?.node?.comfyClass === "PromptChain_RegionalConditioning") {
    const maskSlot = poser.outputs?.findIndex((o) => o.name === "MASKS") ?? -1;
    if (maskSlot >= 0) splice(condSrc.node, "masks", "CropMask", maskSlot);
  }
  const depth = findDepthApply(graph, usNode);
  if (depth) {
    const imgSlot = poser.outputs?.findIndex((o) => o.name === "IMAGE") ?? 0;
    splice(depth.pre || depth.apply, "image", "ImageCrop", imgSlot);
  }
}

// ---------------------------------------------------------------------------
// Prune + assembly

// Keep the upscale core: the USDU node, everything downstream of it (its
// SaveImage chain), the upstream closure of every input EXCEPT image — the
// image source (decode/detailer chain) is what the LoadImage replaces — and
// any explicitly protected nodes (the LoadImage itself, wired before pruning
// so depth branches can hint from it).
function pruneToUpscaleCore(graph, usNode, protectedIds = []) {
  const keep = new Set([usNode.id, ...protectedIds]);
  const followDown = (node) => {
    for (const out of node.outputs || []) {
      for (const lid of out.links || []) {
        const link = getLink(graph, lid);
        const target = link && graph.getNodeById(link.target_id);
        if (target && !keep.has(target.id)) { keep.add(target.id); followDown(target); }
      }
    }
  };
  followDown(usNode);

  const queue = [];
  for (const input of usNode.inputs || []) {
    if (input.name === "image" || input.link == null) continue;
    const link = getLink(graph, input.link);
    const origin = link && graph.getNodeById(link.origin_id);
    if (origin) queue.push(origin);
  }
  while (queue.length) {
    const node = queue.shift();
    if (keep.has(node.id)) continue;
    keep.add(node.id);
    for (const input of node.inputs || []) {
      if (input.link == null) continue;
      const link = getLink(graph, input.link);
      const origin = link && graph.getNodeById(link.origin_id);
      if (origin) queue.push(origin);
    }
  }

  for (const node of [...graph._nodes]) {
    if (!keep.has(node.id)) graph.remove(node);
  }
}

// The injects key sampler defaults (cfg/steps) off modelConfig.architecture and
// honor saved per-model UltimateSDUpscale settings — resolve both the same way
// the settings modal does: loader filename → identity → saved settings.
async function fetchModelConfig(graph) {
  const loader = graph._nodes.find((n) => n.comfyClass === "CheckpointLoaderSimple" || n.comfyClass === "CheckpointLoader")
    || graph._nodes.find((n) => n.comfyClass === "UNETLoader" || n.comfyClass === "UnetLoaderGGUF");
  const file = loader?.widgets?.find((w) => w.name === "ckpt_name" || w.name === "unet_name")?.value;
  if (!file) return {};
  try {
    const idRes = await api.fetchApi(`/promptchain/models/identity?file=${encodeURIComponent(file)}`);
    if (!idRes.ok) return {};
    const identity = await idRes.json();
    let config = {};
    if (identity?.hash) {
      const sRes = await api.fetchApi(`/promptchain/models/settings/${identity.hash}`);
      if (sRes.ok) config = (await sRes.json()) || {};
    }
    return { ...config, architecture: config.architecture || identity?.architecture || "" };
  } catch {
    return {};
  }
}

// Stamp the modal's destination onto the first SaveImage downstream of the
// USDU (post-prune, that's the only save chain left).
function setSavePrefix(graph, usNode, prefix) {
  if (!prefix) return;
  const seen = new Set();
  const visit = [usNode];
  while (visit.length) {
    const n = visit.shift();
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    for (const out of n.outputs || []) {
      for (const lid of out.links || []) {
        const link = getLink(graph, lid);
        const target = link && graph.getNodeById(link.target_id);
        if (!target) continue;
        if (target.comfyClass === "SaveImage") {
          const w = target.widgets?.find((x) => x.name === "filename_prefix");
          if (w) { w.value = prefix; w.callback?.(prefix); }
          return;
        }
        visit.push(target);
      }
    }
  }
}

// Identity/style lock for the re-detail pass: splice the condition cluster
// between whatever feeds the USDU's model input and the USDU itself, with the
// reference image wired to the SAME LoadImage that feeds the upscale — the
// image locks to itself, so tiles can't drift the character/style. Node
// values mirror the inpaint graft's (verified by _inpaintcheck.mjs).
function injectUpscaleCondition(graph, LG, usNode, loadNode, condition) {
  const src = traceInput(graph, usNode, "model");
  if (!src?.node || !loadNode) return false;
  const modelIdx = inputIdx(usNode, "model", 0);
  const setW = (node, name, value) => {
    const w = node.widgets?.find((x) => x.name === name);
    if (w) { w.value = value; w.callback?.(value); }
  };
  const ax = usNode.pos[0];
  const ay = usNode.pos[1];

  if (condition === "ipadapter") {
    const loader = LG.createNode("IPAdapterUnifiedLoader");
    const apply = LG.createNode("IPAdapterAdvanced");
    if (!loader || !apply) return false;
    loader.pos = [ax - 700, ay - 480];
    apply.pos = [ax - 360, ay - 480];
    graph.add(loader); graph.add(apply);
    apply.title = "Style Reference — this image";
    setW(loader, "preset", "PLUS (high strength)");
    setW(apply, "weight", 0.7);
    setW(apply, "weight_type", "style transfer");
    setW(apply, "combine_embeds", "concat");
    setW(apply, "start_at", 0);
    setW(apply, "end_at", 0.7);
    setW(apply, "embeds_scaling", "V only");
    usNode.disconnectInput(modelIdx);
    src.node.connect(src.slot, loader, inputIdx(loader, "model", 0));
    loader.connect(loader.outputs?.findIndex((o) => o.type === "MODEL") ?? 0, apply, inputIdx(apply, "model", 0));
    loader.connect(loader.outputs?.findIndex((o) => o.type === "IPADAPTER") ?? 1, apply, inputIdx(apply, "ipadapter", 1));
    loadNode.connect(0, apply, inputIdx(apply, "image", 2));
    apply.connect(0, usNode, modelIdx);
    return true;
  }

  if (condition === "pulid") {
    const pulidModel = LG.createNode("PulidModelLoader");
    const insight = LG.createNode("PulidInsightFaceLoader");
    const evaClip = LG.createNode("PulidEvaClipLoader");
    const apply = LG.createNode("ApplyPulidAdvanced");
    if (!pulidModel || !insight || !evaClip || !apply) return false;
    pulidModel.pos = [ax - 700, ay - 700];
    insight.pos = [ax - 700, ay - 560];
    evaClip.pos = [ax - 700, ay - 440];
    apply.pos = [ax - 360, ay - 560];
    graph.add(pulidModel); graph.add(insight); graph.add(evaClip); graph.add(apply);
    apply.title = "PuLID — face from this image";
    const fileW = pulidModel.widgets?.find((x) => x.name === "pulid_file");
    const fileOpt = (fileW?.options?.values || []).find((o) => /pulid.*sdxl/i.test(o));
    if (fileW && fileOpt) { fileW.value = fileOpt; fileW.callback?.(fileOpt); }
    setW(insight, "provider", "CUDA");
    setW(apply, "weight", 0.45);
    setW(apply, "projection", "ortho_v2");
    setW(apply, "fidelity", 4);
    setW(apply, "noise", 0);
    setW(apply, "start_at", 0);
    setW(apply, "end_at", 1);
    usNode.disconnectInput(modelIdx);
    src.node.connect(src.slot, apply, inputIdx(apply, "model", 0));
    pulidModel.connect(0, apply, inputIdx(apply, "pulid", 1));
    evaClip.connect(0, apply, inputIdx(apply, "eva_clip", 2));
    insight.connect(0, apply, inputIdx(apply, "face_analysis", 3));
    loadNode.connect(0, apply, inputIdx(apply, "image", 4));
    apply.connect(0, usNode, modelIdx);
    return true;
  }

  return false;
}

// The modal's edited prompt replaces the source PromptChain text — the node
// recompiles it server-side, so positive AND negative (and any // sections)
// flow to the encodes the USDU conditioning already traces to. Cached outputs
// are blanked so a stale compile can't serve; the longest-prompt node is the
// source entry in chained networks (same heuristic the inpaint graft uses).
function overrideGraphPrompt(graph, text) {
  const pcs = graph._nodes.filter((n) => n.comfyClass === "PromptChain_PromptChain");
  if (!pcs.length) return;
  const promptOf = (n) => String(n.widgets?.find((w) => w.name === "prompt")?.value || "");
  const pc = pcs.sort((a, b) => promptOf(b).length - promptOf(a).length)[0];
  const set = (name, value) => {
    const w = pc.widgets?.find((x) => x.name === name);
    if (w) { w.value = value; w.callback?.(value); }
  };
  set("prompt", text);
  set("locked", false);
  set("cached_output", "");
  set("cached_neg_output", "");
  set("cached_regions", "");
}

// Edit-handoff runs must not leave files or gallery records — the render only
// exists to come back as a layer, and Edit's own Save is the persistence point.
function swapSaveForPreview(graph, usNode, LG) {
  const seen = new Set();
  const visit = [usNode];
  while (visit.length) {
    const n = visit.shift();
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    for (const out of n.outputs || []) {
      for (const lid of out.links || []) {
        const link = getLink(graph, lid);
        const target = link && graph.getNodeById(link.target_id);
        if (!target) continue;
        if (target.comfyClass === "SaveImage") {
          const src = traceInput(graph, target, "images");
          const preview = LG.createNode("PreviewImage");
          if (!src?.node || !preview) return;
          preview.pos = [...target.pos];
          graph.add(preview);
          src.node.connect(src.slot, preview, 0);
          graph.remove(target);
          return;
        }
        visit.push(target);
      }
    }
  }
}

function setImageWidget(loadNode, inputRef) {
  const w = loadNode.widgets?.find((x) => x.name === "image");
  if (!w) return;
  // The combo's values were listed before our server-side copy existed.
  if (Array.isArray(w.options?.values) && !w.options.values.includes(inputRef)) {
    w.options.values.push(inputRef);
  }
  w.value = inputRef;
  w.callback?.(inputRef);
}

// v1 stays the recommendation: V2 (DAT2) was isolated-tested on a clean
// render and deposits faint micro-speckle on smooth skin where v1 is clean —
// and that speckle fed through a tile CN regularizes into visible cross-hatch.
export function defaultUpscaleModelPick(opts) {
  return opts.find((o) => /ultrasharp(?!v2)/i.test(o))
    || opts.find((o) => /ultrasharp/i.test(o))
    || opts.find((o) => /^4x/i.test(o)) || opts[0] || null;
}

function pickUpscaleModel(loaderNode, preferred) {
  const w = loaderNode.widgets?.find((x) => x.name === "model_name");
  if (!w) return;
  const opts = w.options?.values || [];
  // Explicit pick (the modal's Climb model select) wins when installed;
  // degradation-trained models (RealESRGAN/Nomos) are a legitimate middle
  // tier between UltraSharp and a SeedVR2 restore on mildly degraded sources.
  const val = (preferred && opts.includes(preferred) ? preferred : null)
    || defaultUpscaleModelPick(opts);
  if (val) { w.value = val; w.callback?.(val); }
}

// SeedVR2's restoration stage must stay near its training window — the paper
// caps its own evaluation at 1080p output and >2K is a documented artifact
// regime — so it runs at ≤1440 short edge and UltraSharp climbs the rest.
export const SEEDVR2_STAGE_MAX_SHORT_EDGE = 1440;
// A clean render carries no degradation signature, and the restorer copies its
// condition when there's nothing to invert — a little injected noise is the
// pack's own remedy (README: 0.1–0.3).
export const SEEDVR2_INPUT_NOISE = 0.15;
// Quality pick on a 24 GB card; the sharp variants over-sharpen faces. The
// fp8 guard matters: "7b_fp8_..._mixed_block35_fp16" also contains "fp16",
// and picking it would auto-download a second multi-GB model.
const SEEDVR2_DIT_PATTERNS = [
  (o) => /7b/i.test(o) && /fp16/i.test(o) && !/fp8|sharp/i.test(o),
  (o) => /7b/i.test(o) && !/sharp/i.test(o),
  (o) => /fp16/i.test(o) && !/fp8|sharp/i.test(o),
];

export function pickSeedvr2DitModel(options) {
  for (const match of SEEDVR2_DIT_PATTERNS) {
    const hit = options.find(match);
    if (hit) return hit;
  }
  return options[0];
}

function setNamedWidget(node, name, value) {
  const w = node?.widgets?.find((x) => x.name === name);
  if (!w) return;
  w.value = value;
  w.callback?.(value);
}

// SeedVR2 floor: restore at trained scale, then the classic ESRGAN climb to
// the same 4× target the UltraSharp floor produces, lanczos-fit to exact dims.
function buildSeedvr2FloorGraph(data, savePrefix = "", previewOnly = false, climbModel = null, scale = 0) {
  const LG = window.LiteGraph;
  const workflowId = freshWorkflowId();
  const graph = new LG.LGraph(structuredClone({ ...EMPTY_WORKFLOW, id: workflowId }));
  graph.last_node_id = offscreenIdBase(); // render-node ids must stay off the live canvas — see offscreen-graph.js
  const load = LG.createNode("LoadImage");
  const dit = LG.createNode("SeedVR2LoadDiTModel");
  const vae = LG.createNode("SeedVR2LoadVAEModel");
  const up = LG.createNode("SeedVR2VideoUpscaler");
  const save = LG.createNode(previewOnly ? "PreviewImage" : "SaveImage");
  if (!load || !dit || !vae || !up || !save) return null;

  const eff = scale > 0 ? scale : 4; // honor the Scale slider; default to 4x when none given
  const targetW = (data.width || 0) * eff;
  const targetH = (data.height || 0) * eff;
  const targetShort = Math.min(targetW, targetH);
  const stageShort = targetShort > 0
    ? Math.min(SEEDVR2_STAGE_MAX_SHORT_EDGE, targetShort)
    : 1080;
  const needsFinish = targetShort > stageShort;

  if (data.filename) load.title = data.filename;
  load.pos = [80, 200];
  dit.pos = [80, 560];
  vae.pos = [80, 900];
  up.pos = [520, 240];
  graph.add(load); graph.add(dit); graph.add(vae); graph.add(up);
  setImageWidget(load, data.input_ref);

  const ditModels = dit.widgets?.find((w) => w.name === "model")?.options?.values || [];
  if (ditModels.length) setNamedWidget(dit, "model", pickSeedvr2DitModel(ditModels));
  setNamedWidget(up, "resolution", stageShort);
  setNamedWidget(up, "batch_size", 1); // stills — the 4n+1 video rule allows 1
  setNamedWidget(up, "input_noise_scale", SEEDVR2_INPUT_NOISE);

  load.connect(0, up, inputIdx(up, "image", 0));
  dit.connect(0, up, inputIdx(up, "dit", 1));
  vae.connect(0, up, inputIdx(up, "vae", 2));

  let imageSource = up;
  if (needsFinish) {
    const loader = LG.createNode("UpscaleModelLoader");
    const apply = LG.createNode("ImageUpscaleWithModel");
    const scale = LG.createNode("ImageScale");
    if (!loader || !apply || !scale) return null;
    loader.pos = [520, 620];
    apply.pos = [940, 240];
    scale.pos = [1220, 240];
    graph.add(loader); graph.add(apply); graph.add(scale);
    pickUpscaleModel(loader, climbModel);
    up.connect(0, apply, inputIdx(apply, "image", 1));
    loader.connect(0, apply, inputIdx(apply, "upscale_model", 0));
    setNamedWidget(scale, "upscale_method", "lanczos");
    setNamedWidget(scale, "width", targetW);
    setNamedWidget(scale, "height", targetH);
    apply.connect(0, scale, inputIdx(scale, "image", 0));
    imageSource = scale;
  }

  save.pos = [imageSource.pos[0] + 300, 240];
  graph.add(save);
  const prefix = save.widgets?.find((w) => w.name === "filename_prefix");
  if (prefix) { prefix.value = savePrefix || "upscale/upscale"; prefix.callback?.(prefix.value); }
  imageSource.connect(0, save, 0);
  return { graph, workflowId };
}

// ---------------------------------------------------------------------------
// Flux2 refine: USDU tiling is a structural dead end on flux2 — no tile
// ControlNet exists, and the default schedule shift (stored 2.02 = mu, an
// EFFECTIVE e^2.02 ≈ 7.5×) turns "denoise 0.3" into a ~70% per-tile repaint,
// which is why grafted USDU output came back softer than its own ESRGAN
// floor. The community-proven recipe is full-frame img2img at ~2K with the
// original image as BOTH the latent and a ReferenceLatent anchor (so high
// denoise regenerates texture without drifting composition), then a plain
// ESRGAN climb to the requested size.
const FLUX2_REFINE_LONG_EDGE = 2048;

function roundTo16(v) {
  return Math.max(16, Math.round(v / 16) * 16);
}

function buildFlux2RefineGraph(graph, workflowId, data, options, config) {
  const LG = window.LiteGraph;

  // Anchors in the source graph — same cases the USDU inject handles.
  const customSampler = graph._nodes.find((n) => n.comfyClass === "SamplerCustomAdvanced");
  const ksampler = graph._nodes.find((n) => n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced");
  const condAnchorNode = customSampler
    ? traceInput(graph, customSampler, "guider")?.node
    : ksampler;
  if (!condAnchorNode) return null;
  const isBasicGuider = condAnchorNode.comfyClass === "BasicGuider";
  const positive = walkPastApplies(graph, condAnchorNode, isBasicGuider ? "conditioning" : "positive");
  const negative = isBasicGuider ? null : walkPastApplies(graph, condAnchorNode, "negative");
  if (!positive?.node) return null;

  let unet = graph._nodes.find((n) => n.comfyClass === "UNETLoader" || n.comfyClass === "UnetLoaderGGUF");
  const clipLoader = graph._nodes.find((n) => n.comfyClass === "CLIPLoader");
  const vaeLoader = graph._nodes.find((n) => n.comfyClass === "VAELoader");
  if (!unet || !vaeLoader) return null;

  // Non-Klein flux2 (Dev fp8/GGUF): full-frame 2K img2img through a streamed
  // 32B model is not viable — pin the refine to Klein base, retargeting the
  // text encoder with it (Dev=Mistral vs Klein=Qwen3; embeddings differ).
  // Both swaps abandon together if either file is missing.
  let pinned = false;
  if (config?.family && config.family !== "flux2_klein" && clipLoader) {
    const pinLoader = LG.createNode("UNETLoader");
    const unetW = pinLoader?.widgets?.find((w) => w.name === "unet_name");
    const unetOpts = unetW?.options?.values || [];
    const kleinFile = unetOpts.find((o) => /klein.*base.*9b|klein.*9b.*base/i.test(o))
      || unetOpts.find((o) => /klein.*9b/i.test(o)) || unetOpts.find((o) => /klein/i.test(o));
    const clipW = clipLoader.widgets?.find((w) => w.name === "clip_name");
    const qwenFile = (clipW?.options?.values || []).find((o) => /qwen[_-]?3[_-]?8b/i.test(o));
    if (pinLoader && kleinFile && qwenFile) {
      unetW.value = kleinFile; unetW.callback?.(kleinFile);
      clipW.value = qwenFile; clipW.callback?.(qwenFile);
      pinLoader.pos = [unet.pos[0], unet.pos[1] - 160];
      graph.add(pinLoader);
      unet = pinLoader;
      pinned = true;
    } else if (pinLoader) {
      graph.remove(pinLoader);
    }
  }

  const ax = (customSampler || condAnchorNode).pos[0];
  const ay = (customSampler || condAnchorNode).pos[1];
  const place = (node, dx, dy) => { node.pos = [ax + dx, ay + dy]; graph.add(node); };

  const load = LG.createNode("LoadImage");
  const refineScale = LG.createNode("ImageScale");
  const encodeRefine = LG.createNode("VAEEncode");
  const refPos = LG.createNode("ReferenceLatent");
  const refNeg = negative?.node ? LG.createNode("ReferenceLatent") : null;
  const zeroNeg = negative?.node ? null : LG.createNode("ConditioningZeroOut");
  const guider = LG.createNode("CFGGuider");
  const scheduler = LG.createNode("BasicScheduler");
  const noise = LG.createNode("RandomNoise");
  const sampler = LG.createNode("SamplerCustomAdvanced");
  const decode = LG.createNode("VAEDecode");
  const save = LG.createNode(options.previewOnly ? "PreviewImage" : "SaveImage");
  // Recipe sampler: EulerAncestral CFG++. s_noise stays at 1.0 — extra
  // injected noise was A/B'd and chews surfaces into hallucinated texture.
  let samplerSelect = null;
  if (!options.sampler || options.sampler === "euler_ancestral_cfg_pp") {
    samplerSelect = LG.createNode("SamplerEulerAncestralCFGPP");
    if (samplerSelect) {
      setNamedWidget(samplerSelect, "eta", 1.0);
      setNamedWidget(samplerSelect, "s_noise", 1.0);
    }
  }
  if (!samplerSelect) {
    samplerSelect = LG.createNode("KSamplerSelect");
    if (samplerSelect) setNamedWidget(samplerSelect, "sampler_name", options.sampler || "euler_ancestral");
  }
  if (!load || !refineScale || !encodeRefine || !refPos || (!refNeg && !zeroNeg)
    || !guider || !scheduler || !noise || !sampler || !decode || !save || !samplerSelect) return null;

  if (data.filename) load.title = data.filename;
  place(load, -1500, 0);
  place(refineScale, -1160, 0);
  place(encodeRefine, -880, 0);
  place(refPos, -620, -160);
  if (refNeg) place(refNeg, -620, 20);
  if (zeroNeg) place(zeroNeg, -620, 20);
  place(guider, -340, -120);
  place(scheduler, -340, 120);
  place(samplerSelect, -340, 300);
  place(noise, -340, 440);
  place(sampler, 0, 0);
  place(decode, 280, 0);
  setImageWidget(load, data.input_ref);

  // Refine at the model's comfortable resolution; the GAN handles size.
  const w = data.width || 0;
  const h = data.height || 0;
  const refineFactor = w && h ? FLUX2_REFINE_LONG_EDGE / Math.max(w, h) : 2;
  const refineW = roundTo16(w ? w * refineFactor : FLUX2_REFINE_LONG_EDGE);
  const refineH = roundTo16(h ? h * refineFactor : FLUX2_REFINE_LONG_EDGE);
  setNamedWidget(refineScale, "upscale_method", "lanczos");
  setNamedWidget(refineScale, "width", refineW);
  setNamedWidget(refineScale, "height", refineH);

  const genCfg = Number(condAnchorNode.comfyClass === "CFGGuider" ? condAnchorNode.widgets?.find((x) => x.name === "cfg")?.value : 0);
  setNamedWidget(guider, "cfg", options.advanced?.cfg ?? (pinned ? 5 : (genCfg > 0 ? genCfg : 5)));
  setNamedWidget(scheduler, "scheduler", options.scheduler || "sgm_uniform");
  setNamedWidget(scheduler, "steps", options.advanced?.steps ?? (pinned ? 20 : 24));
  setNamedWidget(scheduler, "denoise", typeof options.denoise === "number" ? options.denoise : 0.6);
  setNamedWidget(noise, "noise_seed", Math.floor(Math.random() * 2 ** 32));

  load.connect(0, refineScale, inputIdx(refineScale, "image", 0));
  refineScale.connect(0, encodeRefine, inputIdx(encodeRefine, "pixels", 0));
  vaeLoader.connect(0, encodeRefine, inputIdx(encodeRefine, "vae", 1));
  // The reference is the SAME latent the sampler starts from — A/B'd against
  // a native-res reference encode: the same-latent anchor is what keeps
  // fabric/skin/background honest at refine denoise; the native-res variant
  // mottled at denoise 0.5 while this stayed clean at 0.6.
  positive.node.connect(positive.slot, refPos, inputIdx(refPos, "conditioning", 0));
  encodeRefine.connect(0, refPos, inputIdx(refPos, "latent", 1));
  if (refNeg) {
    negative.node.connect(negative.slot, refNeg, inputIdx(refNeg, "conditioning", 0));
    encodeRefine.connect(0, refNeg, inputIdx(refNeg, "latent", 1));
  } else {
    positive.node.connect(positive.slot, zeroNeg, 0);
  }
  unet.connect(0, guider, inputIdx(guider, "model", 0));
  refPos.connect(0, guider, inputIdx(guider, "positive", 1));
  (refNeg || zeroNeg).connect(0, guider, inputIdx(guider, "negative", 2));
  unet.connect(0, scheduler, inputIdx(scheduler, "model", 0));
  noise.connect(0, sampler, inputIdx(sampler, "noise", 0));
  guider.connect(0, sampler, inputIdx(sampler, "guider", 1));
  samplerSelect.connect(0, sampler, inputIdx(sampler, "sampler", 2));
  scheduler.connect(0, sampler, inputIdx(sampler, "sigmas", 3));
  encodeRefine.connect(0, sampler, inputIdx(sampler, "latent_image", 4));
  sampler.connect(0, decode, inputIdx(decode, "samples", 0));
  vaeLoader.connect(0, decode, inputIdx(decode, "vae", 1));

  // ESRGAN climb to the requested size; skipped when the refine already
  // covers it. Lanczos-fit to exact dims either way.
  const longest = Math.max(w, h);
  const chosenScale = typeof options.upscaleBy === "number" && options.upscaleBy >= 1
    ? options.upscaleBy
    : longest > 0 ? Math.min(8, Math.max(1, Math.round((4096 / longest) * 100) / 100)) : 2;
  const targetW = Math.round(w * chosenScale) || refineW;
  const targetH = Math.round(h * chosenScale) || refineH;
  // The prune keeps the sampler's upstream closure and its downstream chain,
  // but NOT side-inputs of downstream nodes — protect those explicitly.
  const protectedIds = [load.id];
  let imageSource = decode;
  if (Math.max(targetW, targetH) > Math.max(refineW, refineH)) {
    const upLoader = LG.createNode("UpscaleModelLoader");
    const upApply = LG.createNode("ImageUpscaleWithModel");
    if (!upLoader || !upApply) return null;
    place(upLoader, 280, 200);
    place(upApply, 560, 0);
    pickUpscaleModel(upLoader);
    decode.connect(0, upApply, inputIdx(upApply, "image", 1));
    upLoader.connect(0, upApply, inputIdx(upApply, "upscale_model", 0));
    protectedIds.push(upLoader.id);
    imageSource = upApply;
  }
  const fit = LG.createNode("ImageScale");
  if (!fit) return null;
  place(fit, 840, 0);
  setNamedWidget(fit, "upscale_method", "lanczos");
  setNamedWidget(fit, "width", targetW);
  setNamedWidget(fit, "height", targetH);
  imageSource.connect(0, fit, inputIdx(fit, "image", 0));

  // 4K finishing pass: the refine's detail ceiling is its 2K canvas — the
  // last 2× is GAN interpolation, which reads soft at 100%. The field's
  // converged answer is one low-denoise tiled diffusion pass AT final
  // resolution, structure-locked by a tile ControlNet. FLUX.2 has no tile
  // CN, so this stage runs on SDXL (mature xinsir tile stack): texture is
  // re-synthesized in real 4K pixels while the CN pins every tile to the
  // refine output. The composite afterwards keeps the background faithful
  // regardless of what the tiles do.
  let detailImage = fit;
  const reg = LG.registered_node_types || {};
  // Opt-IN: three tuning rounds (0.25+SDE = fake pores, 0.15 = softened eyes
  // + residual weave) showed the SDXL prior imposes its own surface character
  // on smooth Klein skin at any denoise. Available for textured content.
  if (options.finish4k === true) {
    const stage = buildSdxlTileStage(graph, LG,
      (node, dx, dy) => place(node, 840 + dx, -480 + dy),
      { imageNode: fit });
    if (stage) {
      protectedIds.push(...stage.sideInputIds);
      detailImage = stage.usdu;
    }
  }

  // Background-preserving composite: the refine measurably amplifies the
  // generator's sub-acuity mottle in defocused regions (and can hallucinate
  // objects there) — background pixels come from the ESRGAN climb of the
  // SOURCE instead: a faithful enlargement, nothing repainted, nothing
  // smoothed (user spec: an upscale that upscales). The mask is DEPTH-driven
  // (Otsu split on DepthAnythingV2): frequency-based defocus metrics were
  // calibrated on real outputs and rejected — the mottle out-energies smooth
  // in-focus surfaces.
  let finalImage = detailImage;
  if (options.preserveDefocus !== false
    && reg["PromptChain_DefocusMask"] && hasPre("DepthAnythingV2Preprocessor")) {
    const srcLoader = LG.createNode("UpscaleModelLoader");
    const srcUp = LG.createNode("ImageUpscaleWithModel");
    const srcFit = LG.createNode("ImageScale");
    const depth = LG.createNode(resolvePre("DepthAnythingV2Preprocessor"));
    const dmask = LG.createNode("PromptChain_DefocusMask");
    const maskImg = LG.createNode("MaskToImage");
    const maskScale = LG.createNode("ImageScale");
    const maskBack = LG.createNode("ImageToMask");
    const comp = LG.createNode("ImageCompositeMasked");
    if (srcLoader && srcUp && srcFit && depth && dmask && maskImg && maskScale && maskBack && comp) {
      place(srcLoader, 840, 220);
      place(srcUp, 1100, 220);
      place(srcFit, 1360, 220);
      place(depth, 840, 460);
      place(dmask, 1100, 460);
      place(maskImg, 1340, 460);
      place(maskScale, 1580, 460);
      place(maskBack, 1820, 460);
      place(comp, 1380, 0);
      pickUpscaleModel(srcLoader);
      setNamedWidget(srcFit, "upscale_method", "lanczos");
      setNamedWidget(srcFit, "width", targetW);
      setNamedWidget(srcFit, "height", targetH);
      setNamedWidget(depth, "resolution", 1024);
      // feather at depth-map res (~1024) ≈ 24px → ~96px after the upscale
      setNamedWidget(dmask, "feather", 24);
      setNamedWidget(maskScale, "upscale_method", "bilinear");
      setNamedWidget(maskScale, "width", targetW);
      setNamedWidget(maskScale, "height", targetH);
      setNamedWidget(maskBack, "channel", "red");
      load.connect(0, srcUp, inputIdx(srcUp, "image", 1));
      srcLoader.connect(0, srcUp, inputIdx(srcUp, "upscale_model", 0));
      srcUp.connect(0, srcFit, inputIdx(srcFit, "image", 0));
      load.connect(0, depth, inputIdx(depth, "image", 0));
      depth.connect(0, dmask, inputIdx(dmask, "image", 0));
      dmask.connect(0, maskImg, inputIdx(maskImg, "mask", 0));
      maskImg.connect(0, maskScale, inputIdx(maskScale, "image", 0));
      maskScale.connect(0, maskBack, inputIdx(maskBack, "image", 0));
      detailImage.connect(0, comp, inputIdx(comp, "destination", 0));
      srcFit.connect(0, comp, inputIdx(comp, "source", 1));
      maskBack.connect(0, comp, inputIdx(comp, "mask", 4));
      setNamedWidget(comp, "resize_source", false);
      protectedIds.push(srcLoader.id, srcUp.id, srcFit.id, depth.id, dmask.id,
        maskImg.id, maskScale.id, maskBack.id);
      finalImage = comp;
    }
  }
  place(save, finalImage.pos[0] + 280, 0);
  finalImage.connect(0, save, 0);

  pruneToUpscaleCore(graph, sampler, protectedIds);
  if (!options.previewOnly) {
    const prefixW = save.widgets?.find((x) => x.name === "filename_prefix");
    const prefix = (options.savePrefix || "").trim() || "upscale/upscale";
    if (prefixW) { prefixW.value = prefix; prefixW.callback?.(prefix); }
  }
  // A cleared prompt (empty string) is an explicit choice — override with it so
  // the upscale drops the source render's character conditioning instead of
  // silently re-detailing every tile with it (the "Ryu's face on a cropped arm"
  // bug). Only skip when the modal passed no prompt at all (undefined).
  if (typeof options.prompt === "string") {
    overrideGraphPrompt(graph, options.prompt);
  }
  return { graph, workflowId };
}

// Universal floor: pure ESRGAN pass, no conditioning, no checkpoint — works on
// images with no usable metadata (external files, non-PromptChain workflows).
// engine "seedvr2" puts a restoration stage in front; it falls back to the
// plain pair if the cluster can't build (pack uninstalled mid-session).
function buildEsrganFloorGraph(data, savePrefix = "", previewOnly = false, engine = "ultrasharp", climbModel = null, scale = 0) {
  if (engine === "seedvr2") {
    const built = buildSeedvr2FloorGraph(data, savePrefix, previewOnly, climbModel, scale);
    if (built) return built;
  }
  const LG = window.LiteGraph;
  const workflowId = freshWorkflowId();
  const graph = new LG.LGraph(structuredClone({ ...EMPTY_WORKFLOW, id: workflowId }));
  graph.last_node_id = offscreenIdBase(); // render-node ids must stay off the live canvas — see offscreen-graph.js
  const load = LG.createNode("LoadImage");
  const loader = LG.createNode("UpscaleModelLoader");
  const apply = LG.createNode("ImageUpscaleWithModel");
  const save = LG.createNode(previewOnly ? "PreviewImage" : "SaveImage");
  if (!load || !loader || !apply || !save) {
    toast("error", "Couldn't create the upscale nodes.");
    reportClientError("buildEsrganFloorGraph", new Error("createNode returned null"), {
      load: !!load, loader: !!loader, apply: !!apply, save: !!save,
    });
    return null;
  }
  if (data.filename) load.title = data.filename;
  load.pos = [80, 200];
  loader.pos = [80, 540];
  apply.pos = [500, 240];
  graph.add(load); graph.add(loader); graph.add(apply);
  setImageWidget(load, data.input_ref);
  pickUpscaleModel(loader, climbModel);
  load.connect(0, apply, inputIdx(apply, "image", 1));
  loader.connect(0, apply, inputIdx(apply, "upscale_model", 0));

  // The model upscales by its own fixed factor (e.g. 4x); a lanczos fit lets the
  // Scale slider actually target a size (ESRGAN climbs to its factor, then fits
  // up/down to source*scale). No scale given → keep the raw model-factor output.
  let out = apply;
  const w = data.width || 0, h = data.height || 0;
  if (scale > 0 && w && h) {
    const fit = LG.createNode("ImageScale");
    if (fit) {
      fit.pos = [780, 240];
      graph.add(fit);
      setNamedWidget(fit, "upscale_method", "lanczos");
      setNamedWidget(fit, "width", Math.round(w * scale));
      setNamedWidget(fit, "height", Math.round(h * scale));
      apply.connect(0, fit, inputIdx(fit, "image", 0));
      out = fit;
    }
  }
  save.pos = [out.pos[0] + 280, 240];
  graph.add(save);
  const prefix = save.widgets?.find((w) => w.name === "filename_prefix");
  if (prefix) { prefix.value = savePrefix || "upscale/upscale"; prefix.callback?.(prefix.value); }
  out.connect(0, save, 0);
  return { graph, workflowId };
}

// ---------------------------------------------------------------------------
// SDXL tiled re-detail cluster: checkpoint + xinsir tile ControlNet with a
// BLURRED hint + USDU-NoUpscale at final resolution. Shared by the flux2
// finish4k stage and the standalone SDXL-checkpoint engine — the tile rules
// encoded here were paid for in GPU time (see inline comments).
// `place(node, dx, dy)` positions relative to the caller's anchor.
function buildSdxlTileStage(graph, LG, place, opts) {
  const reg = LG.registered_node_types || {};
  if (!reg["UltimateSDUpscaleNoUpscale"] || !reg["ControlNetApplyAdvanced"]) return null;
  const ckpt = LG.createNode("CheckpointLoaderSimple");
  const ckptW = ckpt?.widgets?.find((x) => x.name === "ckpt_name");
  const ckptOpts = ckptW?.options?.values || [];
  // Explicit pick (the engine modal) wins; otherwise the photoreal chain the
  // finish pass was tuned on.
  let ckptFile = opts.ckptName || null;
  if (ckptFile && Array.isArray(ckptOpts) && !ckptOpts.includes(ckptFile)) ckptOpts.push(ckptFile);
  if (!ckptFile) {
    ckptFile = ckptOpts.find((o) => /juggernaut/i.test(o))
      || ckptOpts.find((o) => /realvis/i.test(o))
      || ckptOpts.find((o) => /epicrealism/i.test(o))
      || ckptOpts.find((o) => /jibmix|skinsupreme/i.test(o));
  }
  const cnLoader = LG.createNode("ControlNetLoader");
  const cnW = cnLoader?.widgets?.find((x) => x.name === "control_net_name");
  const cnFile = (cnW?.options?.values || [])
    .find((o) => /tile/i.test(o) && /sdxl/i.test(o) && !/flux/i.test(o));
  const posEnc = LG.createNode("CLIPTextEncode");
  const negEnc = LG.createNode("CLIPTextEncode");
  const cnApply = LG.createNode("ControlNetApplyAdvanced");
  const hintBlur = LG.createNode("ImageBlur");
  const usdu = LG.createNode("UltimateSDUpscaleNoUpscale");
  if (!(ckpt && ckptFile && cnLoader && cnFile && posEnc && negEnc && cnApply && hintBlur && usdu)) return null;
  place(ckpt, 0, 0);
  place(posEnc, 300, -80);
  place(negEnc, 300, 100);
  place(cnLoader, 300, 280);
  place(cnApply, 580, 0);
  place(usdu, 860, 280);
  ckptW.value = ckptFile; ckptW.callback?.(ckptFile);
  cnW.value = cnFile; cnW.callback?.(cnFile);
  // Style-only conditioning by default — scene description per tile invites
  // hallucination, and TEXTURE NOUNS get painted onto every tile ("fabric
  // weave" in this prompt once cross-hatched a whole face). Negating
  // "smooth" has the same effect from the other side, so the anti-grid terms
  // ride the negative; the tile CN carries the content.
  setNamedWidget(posEnc, "text", opts.positiveText || SDXL_TILE_NEUTRAL_POSITIVE);
  setNamedWidget(negEnc, "text", opts.negativeText || SDXL_TILE_NEGATIVE);
  ckpt.connect(1, posEnc, inputIdx(posEnc, "clip", 0));
  ckpt.connect(1, negEnc, inputIdx(negEnc, "clip", 0));
  posEnc.connect(0, cnApply, inputIdx(cnApply, "positive", 0));
  negEnc.connect(0, cnApply, inputIdx(cnApply, "negative", 1));
  cnLoader.connect(0, cnApply, inputIdx(cnApply, "control_net", 2));
  // Tile CNs are trained on LOW-FREQUENCY hints — fed a sharp hint they
  // enforce its micro-pattern and the sampler paints it crisp (this
  // cross-hatched a face). Canonical preprocessing: blur the hint.
  place(hintBlur, 580, -200);
  setNamedWidget(hintBlur, "blur_radius", 10);
  setNamedWidget(hintBlur, "sigma", 4.0);
  opts.imageNode.connect(opts.imageSlot || 0, hintBlur, inputIdx(hintBlur, "image", 0));
  hintBlur.connect(0, cnApply, inputIdx(cnApply, "image", 3));
  setNamedWidget(cnApply, "strength", 0.9);
  setNamedWidget(cnApply, "start_percent", 0.0);
  setNamedWidget(cnApply, "end_percent", 1.0);
  opts.imageNode.connect(opts.imageSlot || 0, usdu, inputIdx(usdu, "upscaled_image", 0));
  ckpt.connect(0, usdu, inputIdx(usdu, "model", 1));
  cnApply.connect(0, usdu, inputIdx(usdu, "positive", 2));
  cnApply.connect(1, usdu, inputIdx(usdu, "negative", 3));
  ckpt.connect(2, usdu, inputIdx(usdu, "vae", 4));
  // Canonical photoreal-USDU values: 0.25 + SDE on Juggernaut stippled heavy
  // fake pores onto smooth skin; 0.15 with a deterministic sampler adds
  // texture without repainting the surface character.
  setNamedWidget(usdu, "seed", Math.floor(Math.random() * 2 ** 32));
  setNamedWidget(usdu, "steps", opts.steps ?? 20);
  setNamedWidget(usdu, "cfg", opts.cfg ?? 5);
  setNamedWidget(usdu, "sampler_name", opts.sampler || "dpmpp_2m");
  setNamedWidget(usdu, "scheduler", opts.scheduler || "karras");
  setNamedWidget(usdu, "denoise", typeof opts.denoise === "number" ? opts.denoise : 0.15);
  setNamedWidget(usdu, "tile_width", opts.tileWidth ?? 1024);
  setNamedWidget(usdu, "tile_height", opts.tileHeight ?? 1024);
  setNamedWidget(usdu, "mask_blur", opts.maskBlur ?? 32);
  setNamedWidget(usdu, "tile_padding", opts.tilePadding ?? 64);
  setNamedWidget(usdu, "seam_fix_mode", opts.seamFixMode || "None");
  if (opts.modeType) setNamedWidget(usdu, "mode_type", opts.modeType);
  if (typeof opts.seamFixDenoise === "number") setNamedWidget(usdu, "seam_fix_denoise", opts.seamFixDenoise);
  setNamedWidget(usdu, "force_uniform_tiles", true);
  setNamedWidget(usdu, "tiled_decode", false);
  // The ids a pruning caller must protect (side-inputs of the kept chain).
  return { usdu, sideInputIds: [ckpt.id, posEnc.id, negEnc.id, cnLoader.id] };
}

// FLUX.1 tile cluster (GPU-proven on Krea): UNET + dual-clip + flux VAE feed
// the USDU directly — no tile ControlNet and no hint blur. Guidance rides
// FluxGuidance on the positive; cfg stays 1.0 so the empty negative is just
// the input the USDU requires.
function buildFlux1TileStage(graph, LG, place, opts) {
  const reg = LG.registered_node_types || {};
  if (!reg["UltimateSDUpscaleNoUpscale"] || !reg["FluxGuidance"]) return null;
  const unet = LG.createNode("UNETLoader");
  const unetW = unet?.widgets?.find((x) => x.name === "unet_name");
  const unetOpts = unetW?.options?.values || [];
  let unetFile = opts.unetName || null;
  if (unetFile && Array.isArray(unetOpts) && !unetOpts.includes(unetFile)) unetOpts.push(unetFile);
  if (!unetFile) {
    // /krea(?!2)/ matches the FLUX.1 "flux1-krea-dev" UNET but must NOT grab
    // the separate "krea2_turbo_*" DiT (its own engine, different VAE/CLIP).
    unetFile = unetOpts.find((o) => /krea(?!2)/i.test(o))
      || unetOpts.find((o) => /flux1/i.test(o) && !/kontext|schnell|fill|canny|depth|redux/i.test(o));
  }
  const clip = LG.createNode("DualCLIPLoader");
  const clipOpts = clip?.widgets?.find((x) => x.name === "clip_name1")?.options?.values || [];
  const clipL = clipOpts.find((o) => /(^|[\\/])clip_l\./i.test(o)) || clipOpts.find((o) => /clip_l/i.test(o));
  const t5 = clipOpts.find((o) => /t5xxl.*fp16/i.test(o)) || clipOpts.find((o) => /t5xxl/i.test(o));
  const vae = LG.createNode("VAELoader");
  const vaeFile = (vae?.widgets?.find((x) => x.name === "vae_name")?.options?.values || [])
    .find((o) => /(^|[\\/])ae\.(safetensors|sft)$/i.test(o));
  const posEnc = LG.createNode("CLIPTextEncode");
  const negEnc = LG.createNode("CLIPTextEncode");
  const guidance = LG.createNode("FluxGuidance");
  const usdu = LG.createNode("UltimateSDUpscaleNoUpscale");
  if (!(unet && unetFile && clip && clipL && t5 && vae && vaeFile && posEnc && negEnc && guidance && usdu)) return null;
  place(unet, 0, 0);
  place(clip, 0, 180);
  place(vae, 0, 360);
  place(posEnc, 300, -80);
  place(negEnc, 300, 100);
  place(guidance, 580, -80);
  place(usdu, 860, 280);
  setNamedWidget(unet, "unet_name", unetFile);
  setNamedWidget(unet, "weight_dtype", "default");
  setNamedWidget(clip, "clip_name1", clipL);
  setNamedWidget(clip, "clip_name2", t5);
  setNamedWidget(clip, "type", "flux");
  setNamedWidget(vae, "vae_name", vaeFile);
  setNamedWidget(posEnc, "text", opts.positiveText || SDXL_TILE_NEUTRAL_POSITIVE);
  setNamedWidget(negEnc, "text", "");
  setNamedWidget(guidance, "guidance", FLUX1_TILE_GUIDANCE);
  clip.connect(0, posEnc, inputIdx(posEnc, "clip", 0));
  clip.connect(0, negEnc, inputIdx(negEnc, "clip", 0));
  posEnc.connect(0, guidance, inputIdx(guidance, "conditioning", 0));
  opts.imageNode.connect(opts.imageSlot || 0, usdu, inputIdx(usdu, "upscaled_image", 0));
  unet.connect(0, usdu, inputIdx(usdu, "model", 1));
  guidance.connect(0, usdu, inputIdx(usdu, "positive", 2));
  negEnc.connect(0, usdu, inputIdx(usdu, "negative", 3));
  vae.connect(0, usdu, inputIdx(usdu, "vae", 4));
  setNamedWidget(usdu, "seed", Math.floor(Math.random() * 2 ** 32));
  setNamedWidget(usdu, "steps", opts.steps ?? 20);
  setNamedWidget(usdu, "cfg", opts.cfg ?? 1.0);
  setNamedWidget(usdu, "sampler_name", opts.sampler || "euler");
  setNamedWidget(usdu, "scheduler", opts.scheduler || "simple");
  setNamedWidget(usdu, "denoise", typeof opts.denoise === "number" ? opts.denoise : 0.2);
  setNamedWidget(usdu, "tile_width", opts.tileWidth ?? 1024);
  setNamedWidget(usdu, "tile_height", opts.tileHeight ?? 1024);
  setNamedWidget(usdu, "mask_blur", opts.maskBlur ?? 32);
  setNamedWidget(usdu, "tile_padding", opts.tilePadding ?? 64);
  setNamedWidget(usdu, "seam_fix_mode", opts.seamFixMode || "None");
  if (opts.modeType) setNamedWidget(usdu, "mode_type", opts.modeType);
  if (typeof opts.seamFixDenoise === "number") setNamedWidget(usdu, "seam_fix_denoise", opts.seamFixDenoise);
  setNamedWidget(usdu, "force_uniform_tiles", true);
  setNamedWidget(usdu, "tiled_decode", false);
  return { usdu, sideInputIds: [unet.id, clip.id, vae.id, posEnc.id, negEnc.id, guidance.id] };
}

// Z-Image tile cluster (DiT, mirrors flux1): UNET -> ModelSamplingAuraFlow(3)
// feeds the USDU model directly; CLIP (lumina2) drives a neutral positive +
// empty negative; shared ae VAE. No tile ControlNet and no FluxGuidance —
// Z-Image carries cfg natively. Turbo vs Base differ only in the cfg/steps/
// denoise the modal hands in (per-family defaults from engineModelDefaults).
function buildZImageTileStage(graph, LG, place, opts) {
  const reg = LG.registered_node_types || {};
  if (!reg["UltimateSDUpscaleNoUpscale"] || !reg["ModelSamplingAuraFlow"]) return null;
  const unet = LG.createNode("UNETLoader");
  const unetW = unet?.widgets?.find((x) => x.name === "unet_name");
  const unetOpts = unetW?.options?.values || [];
  let unetFile = opts.unetName || null;
  if (unetFile && Array.isArray(unetOpts) && !unetOpts.includes(unetFile)) unetOpts.push(unetFile);
  if (!unetFile) {
    unetFile = unetOpts.find((o) => /z.?image.*turbo/i.test(o))
      || unetOpts.find((o) => /z.?image/i.test(o));
  }
  const clip = LG.createNode("CLIPLoader");
  const clipFile = (clip?.widgets?.find((x) => x.name === "clip_name")?.options?.values || [])
    .find((o) => /qwen.*3[._]4b|lumina2/i.test(o));
  const vae = LG.createNode("VAELoader");
  const vaeFile = (vae?.widgets?.find((x) => x.name === "vae_name")?.options?.values || [])
    .find((o) => /(^|[\\/])ae\.(safetensors|sft)$/i.test(o));
  const aura = LG.createNode("ModelSamplingAuraFlow");
  const posEnc = LG.createNode("CLIPTextEncode");
  const negEnc = LG.createNode("CLIPTextEncode");
  const usdu = LG.createNode("UltimateSDUpscaleNoUpscale");
  if (!(unet && unetFile && clip && clipFile && vae && vaeFile && aura && posEnc && negEnc && usdu)) return null;
  place(unet, 0, 0);
  place(clip, 0, 180);
  place(vae, 0, 360);
  place(aura, 300, 0);
  place(posEnc, 580, -80);
  place(negEnc, 580, 100);
  place(usdu, 860, 280);
  setNamedWidget(unet, "unet_name", unetFile);
  setNamedWidget(unet, "weight_dtype", "default");
  setNamedWidget(clip, "clip_name", clipFile);
  setNamedWidget(clip, "type", "lumina2");
  setNamedWidget(vae, "vae_name", vaeFile);
  setNamedWidget(aura, "shift", 3);
  setNamedWidget(posEnc, "text", opts.positiveText || SDXL_TILE_NEUTRAL_POSITIVE);
  setNamedWidget(negEnc, "text", "");
  unet.connect(0, aura, inputIdx(aura, "model", 0));
  clip.connect(0, posEnc, inputIdx(posEnc, "clip", 0));
  clip.connect(0, negEnc, inputIdx(negEnc, "clip", 0));
  opts.imageNode.connect(opts.imageSlot || 0, usdu, inputIdx(usdu, "upscaled_image", 0));
  aura.connect(0, usdu, inputIdx(usdu, "model", 1));
  posEnc.connect(0, usdu, inputIdx(usdu, "positive", 2));
  negEnc.connect(0, usdu, inputIdx(usdu, "negative", 3));
  vae.connect(0, usdu, inputIdx(usdu, "vae", 4));
  setNamedWidget(usdu, "seed", Math.floor(Math.random() * 2 ** 32));
  setNamedWidget(usdu, "steps", opts.steps ?? 8);
  setNamedWidget(usdu, "cfg", opts.cfg ?? 1.3);
  setNamedWidget(usdu, "sampler_name", opts.sampler || "res_multistep");
  setNamedWidget(usdu, "scheduler", opts.scheduler || "beta");
  setNamedWidget(usdu, "denoise", typeof opts.denoise === "number" ? opts.denoise : 0.7);
  setNamedWidget(usdu, "tile_width", opts.tileWidth ?? 1024);
  setNamedWidget(usdu, "tile_height", opts.tileHeight ?? 1024);
  setNamedWidget(usdu, "mask_blur", opts.maskBlur ?? 32);
  setNamedWidget(usdu, "tile_padding", opts.tilePadding ?? 64);
  setNamedWidget(usdu, "seam_fix_mode", opts.seamFixMode || "None");
  if (opts.modeType) setNamedWidget(usdu, "mode_type", opts.modeType);
  if (typeof opts.seamFixDenoise === "number") setNamedWidget(usdu, "seam_fix_denoise", opts.seamFixDenoise);
  setNamedWidget(usdu, "force_uniform_tiles", true);
  setNamedWidget(usdu, "tiled_decode", false);
  return { usdu, sideInputIds: [unet.id, clip.id, vae.id, aura.id, posEnc.id, negEnc.id] };
}

// Krea 2 tile cluster (DiT, closest to Z-Image): UNET feeds the USDU model
// DIRECTLY — Krea 2's schedule shift is baked into the model class, so there's
// NO ModelSamplingAuraFlow. CLIP (qwen3vl_4b, type "krea2") drives a neutral
// positive + empty negative; krea2 carries cfg natively (cfg 1.0), so NO
// FluxGuidance and NO tile ControlNet. Turbo-distilled: euler/simple/8 steps.
function buildKrea2TileStage(graph, LG, place, opts) {
  const reg = LG.registered_node_types || {};
  if (!reg["UltimateSDUpscaleNoUpscale"]) return null;
  const unet = LG.createNode("UNETLoader");
  const unetW = unet?.widgets?.find((x) => x.name === "unet_name");
  const unetOpts = unetW?.options?.values || [];
  let unetFile = opts.unetName || null;
  if (unetFile && Array.isArray(unetOpts) && !unetOpts.includes(unetFile)) unetOpts.push(unetFile);
  if (!unetFile) unetFile = unetOpts.find((o) => /krea2/i.test(o));
  const clip = LG.createNode("CLIPLoader");
  const clipFile = (clip?.widgets?.find((x) => x.name === "clip_name")?.options?.values || [])
    .find((o) => /qwen3vl.*4b|qwen3.?vl.*4b/i.test(o));
  const vae = LG.createNode("VAELoader");
  // Use Krea 2's native VAE (qwen_image_vae) for the tile encode AND decode. A
  // re-detailed section is composited back into pixels that were generated and
  // decoded with qwen_image_vae; decoding the section through any other VAE
  // (e.g. wan_2.1_vae) shifts its colour/texture rendition and leaves an
  // unblendable seam — and encoding through it lands the tile in a latent the
  // Krea 2 UNET reads slightly wrong. A ground-truth plain i2i on the same crop
  // is clean with this VAE. Fall back to a Wan 2.1 VAE only if it isn't present.
  const vaeOpts = vae?.widgets?.find((x) => x.name === "vae_name")?.options?.values || [];
  const vaeFile = vaeOpts.find((o) => /qwen.*image.*vae/i.test(o))
    || vaeOpts.find((o) => /wan.*2[._]?1.*vae/i.test(o) && !/upscale|2x/i.test(o));
  const posEnc = LG.createNode("CLIPTextEncode");
  const negEnc = LG.createNode("CLIPTextEncode");
  const usdu = LG.createNode("UltimateSDUpscaleNoUpscale");
  if (!(unet && unetFile && clip && clipFile && vae && vaeFile && posEnc && negEnc && usdu)) return null;
  place(unet, 0, 0);
  place(clip, 0, 180);
  place(vae, 0, 360);
  place(posEnc, 300, -80);
  place(negEnc, 300, 100);
  place(usdu, 860, 280);
  setNamedWidget(unet, "unet_name", unetFile);
  setNamedWidget(unet, "weight_dtype", "default");
  setNamedWidget(clip, "clip_name", clipFile);
  setNamedWidget(clip, "type", "krea2");
  setNamedWidget(vae, "vae_name", vaeFile);
  setNamedWidget(posEnc, "text", opts.positiveText || SDXL_TILE_NEUTRAL_POSITIVE);
  setNamedWidget(negEnc, "text", "");
  clip.connect(0, posEnc, inputIdx(posEnc, "clip", 0));
  clip.connect(0, negEnc, inputIdx(negEnc, "clip", 0));
  opts.imageNode.connect(opts.imageSlot || 0, usdu, inputIdx(usdu, "upscaled_image", 0));
  unet.connect(0, usdu, inputIdx(usdu, "model", 1));
  posEnc.connect(0, usdu, inputIdx(usdu, "positive", 2));
  negEnc.connect(0, usdu, inputIdx(usdu, "negative", 3));
  vae.connect(0, usdu, inputIdx(usdu, "vae", 4));
  setNamedWidget(usdu, "seed", Math.floor(Math.random() * 2 ** 32));
  setNamedWidget(usdu, "steps", opts.steps ?? 8);
  setNamedWidget(usdu, "cfg", opts.cfg ?? 1.0);
  setNamedWidget(usdu, "sampler_name", opts.sampler || "er_sde");
  setNamedWidget(usdu, "scheduler", opts.scheduler || "simple");
  setNamedWidget(usdu, "denoise", typeof opts.denoise === "number" ? opts.denoise : 0.45);
  setNamedWidget(usdu, "tile_width", opts.tileWidth ?? 1024);
  setNamedWidget(usdu, "tile_height", opts.tileHeight ?? 1024);
  setNamedWidget(usdu, "mask_blur", opts.maskBlur ?? 32);
  setNamedWidget(usdu, "tile_padding", opts.tilePadding ?? 64);
  setNamedWidget(usdu, "seam_fix_mode", opts.seamFixMode || "None");
  if (opts.modeType) setNamedWidget(usdu, "mode_type", opts.modeType);
  if (typeof opts.seamFixDenoise === "number") setNamedWidget(usdu, "seam_fix_denoise", opts.seamFixDenoise);
  setNamedWidget(usdu, "force_uniform_tiles", true);
  setNamedWidget(usdu, "tiled_decode", false);
  return { usdu, sideInputIds: [unet.id, clip.id, vae.id, posEnc.id, negEnc.id] };
}

// The modal's tuning knobs in tile-stage shape — shared by every tile engine.
function tileStageOpts(options) {
  return {
    denoise: options.denoise,
    sampler: options.sampler,
    scheduler: options.scheduler,
    steps: options.advanced?.steps,
    cfg: options.advanced?.cfg,
    tileWidth: options.advanced?.tile_width,
    tileHeight: options.advanced?.tile_height,
    maskBlur: options.advanced?.mask_blur,
    tilePadding: options.advanced?.tile_padding,
    seamFixMode: options.advanced?.seam_fix_mode,
    modeType: options.advanced?.mode_type,
    seamFixDenoise: options.advanced?.seam_fix_denoise,
  };
}

// Standalone tile-engine core: the picker's "re-detail with a picked model"
// path. An optional SeedVR2 restore, then UltraSharp, climb the source to the
// target; the engine-specific stage re-details every tile at final
// resolution. Fresh graph, no pruning — works on any image, metadata or not,
// and flux2 content never touches flux2 USDU tiling (the engine model has an
// unshifted/mild schedule).
function buildTiledEngineGraph(data, options = {}, buildStage) {
  const LG = window.LiteGraph;
  const workflowId = freshWorkflowId();
  const graph = new LG.LGraph(structuredClone({ ...EMPTY_WORKFLOW, id: workflowId }));
  graph.last_node_id = offscreenIdBase(); // render-node ids must stay off the live canvas — see offscreen-graph.js
  const placeAt = (node, x, y) => { node.pos = [x, y]; graph.add(node); };
  const save = LG.createNode(options.previewOnly ? "PreviewImage" : "SaveImage");
  if (!save) return null;

  const w = data.width || 0;
  const h = data.height || 0;
  const longest = Math.max(w, h);
  const chosenScale = typeof options.upscaleBy === "number" && options.upscaleBy >= 1
    ? options.upscaleBy
    : longest > 0 ? Math.min(8, Math.max(1, Math.round((4096 / longest) * 100) / 100)) : 2;
  const targetW = Math.round(w * chosenScale) || 2048;
  const targetH = Math.round(h * chosenScale) || 2048;

  // `fit` is the image (already at final/target dims) the engine stage tiles.
  // Normally we climb the source here (optional SeedVR2 restore → UltraSharp →
  // exact-fit lanczos). On a cache hit the enlarge already ran in a prior
  // pre-pass, so load that saved base directly and skip the whole climb.
  let fit;
  if (options.preEnlargedRef) {
    fit = LG.createNode("LoadImage");
    if (!fit) return null;
    fit.title = "enlarged base (cached)";
    placeAt(fit, 740, 200);
    setImageWidget(fit, options.preEnlargedRef);
  } else {
    const load = LG.createNode("LoadImage");
    if (!load) return null;
    if (data.filename) load.title = data.filename;
    placeAt(load, 80, 200);
    setImageWidget(load, data.input_ref);

    let imageSource = load;
    let needsModelClimb = chosenScale > 1.02;
    // Optional SeedVR2 restoration in front of the climb: degraded sources
    // (webcam blur, jpeg) smear through a plain GAN climb — A/B'd on a 736px
    // jpeg, the eye region smeared via UltraSharp but came back clean when
    // SeedVR2 rebuilt structure at its trained scale first. The tile CN then
    // pins restored structure instead of pinning the smear.
    if (options.climbStage === "seedvr2" && LG.registered_node_types?.["SeedVR2VideoUpscaler"]) {
      const dit = LG.createNode("SeedVR2LoadDiTModel");
      const seedvrVae = LG.createNode("SeedVR2LoadVAEModel");
      const restore = LG.createNode("SeedVR2VideoUpscaler");
      if (dit && seedvrVae && restore) {
        placeAt(dit, 80, 460);
        placeAt(seedvrVae, 80, 660);
        placeAt(restore, 400, 200);
        const ditModels = dit.widgets?.find((x) => x.name === "model")?.options?.values || [];
        if (ditModels.length) setNamedWidget(dit, "model", pickSeedvr2DitModel(ditModels));
        const targetShort = Math.min(targetW, targetH);
        const stageShort = Math.min(SEEDVR2_STAGE_MAX_SHORT_EDGE, targetShort);
        setNamedWidget(restore, "resolution", stageShort);
        setNamedWidget(restore, "batch_size", 1);
        setNamedWidget(restore, "input_noise_scale", SEEDVR2_INPUT_NOISE);
        setNamedWidget(restore, "seed", 42); // match buildEnlargePrompt so the cached base == this fused base
        load.connect(0, restore, inputIdx(restore, "image", 0));
        dit.connect(0, restore, inputIdx(restore, "dit", 1));
        seedvrVae.connect(0, restore, inputIdx(restore, "vae", 2));
        imageSource = restore;
        needsModelClimb = targetShort > stageShort;
      }
    }
    if (needsModelClimb) {
      const upLoader = LG.createNode("UpscaleModelLoader");
      const upApply = LG.createNode("ImageUpscaleWithModel");
      if (!upLoader || !upApply) return null;
      placeAt(upLoader, 80, 880);
      placeAt(upApply, 460, 460);
      pickUpscaleModel(upLoader, options.climbModel);
      imageSource.connect(0, upApply, inputIdx(upApply, "image", 1));
      upLoader.connect(0, upApply, inputIdx(upApply, "upscale_model", 0));
      imageSource = upApply;
    }
    // The tile pass runs AT final resolution — exact-fit first, then re-detail.
    fit = LG.createNode("ImageScale");
    if (!fit) return null;
    placeAt(fit, 740, 200);
    setNamedWidget(fit, "upscale_method", "lanczos");
    setNamedWidget(fit, "width", targetW);
    setNamedWidget(fit, "height", targetH);
    imageSource.connect(0, fit, inputIdx(fit, "image", 0));
  }

  const stage = buildStage(graph, LG,
    (node, dx, dy) => placeAt(node, 1040 + dx, 480 + dy), fit);
  if (!stage) return null;

  placeAt(save, stage.usdu.pos[0] + 320, stage.usdu.pos[1]);
  stage.usdu.connect(0, save, 0);
  if (!options.previewOnly) {
    const prefixW = save.widgets?.find((x) => x.name === "filename_prefix");
    const prefix = (options.savePrefix || "").trim() || "upscale/upscale";
    if (prefixW) { prefixW.value = prefix; prefixW.callback?.(prefix); }
  }
  return { graph, workflowId };
}

// "Re-detail with Juggernaut": picked SDXL checkpoint, structure-locked by
// the tile CN, with the user's prompt.
function buildSdxlCkptEngineGraph(data, options = {}) {
  return buildTiledEngineGraph(data, options, (graph, LG, place, fit) =>
    buildSdxlTileStage(graph, LG, place, {
      imageNode: fit,
      ckptName: options.engineModel?.filename || null,
      positiveText: (options.prompt || "").trim() || SDXL_TILE_NEUTRAL_POSITIVE,
      negativeText: SDXL_TILE_NEGATIVE,
      ...tileStageOpts(options),
    }));
}

// "Re-detail with Krea": picked FLUX.1 UNET in the cfg-1 FluxGuidance regime,
// no structure lock needed.
function buildFlux1EngineGraph(data, options = {}) {
  return buildTiledEngineGraph(data, options, (graph, LG, place, fit) =>
    buildFlux1TileStage(graph, LG, place, {
      imageNode: fit,
      unetName: options.engineModel?.filename || null,
      positiveText: (options.prompt || "").trim() || SDXL_TILE_NEUTRAL_POSITIVE,
      ...tileStageOpts(options),
    }));
}

// "Re-detail with Z-Image Base/Turbo": picked Z-Image UNET in the
// res_multistep/beta regime. Base (cfg 3, 0.15 denoise) holds structure
// cleanly at low denoise; Turbo (cfg 1.3, 0.7) repaints harder. No tile CN.
function buildZImageEngineGraph(data, options = {}) {
  return buildTiledEngineGraph(data, options, (graph, LG, place, fit) =>
    buildZImageTileStage(graph, LG, place, {
      imageNode: fit,
      unetName: options.engineModel?.filename || null,
      positiveText: (options.prompt || "").trim() || SDXL_TILE_NEUTRAL_POSITIVE,
      ...tileStageOpts(options),
    }));
}

// "Re-detail with Krea 2": picked Krea 2 Turbo UNET in the cfg-1/euler/simple
// 8-step regime, model wired straight to the USDU (no ModelSampling, no
// FluxGuidance, no tile CN). 0.45 denoise re-details while holding structure.
function buildKrea2EngineGraph(data, options = {}) {
  return buildTiledEngineGraph(data, options, (graph, LG, place, fit) =>
    buildKrea2TileStage(graph, LG, place, {
      imageNode: fit,
      unetName: options.engineModel?.filename || null,
      positiveText: (options.prompt || "").trim() || SDXL_TILE_NEUTRAL_POSITIVE,
      ...tileStageOpts(options),
    }));
}

// Standalone Qwen-Image-Edit engine: instruction-driven whole-frame re-render
// at ~2MP (the model's working size — bigger grows plastic skin, and the
// stock encoder downsamples its conditioning copy regardless), then the
// UltraSharp climb + exact fit to the requested target. Pixel fidelity is
// NOT guaranteed — Qwen Edit has a known sub-pixel shift; the modal says so.
function buildQwenEditEngineGraph(data, options = {}) {
  const LG = window.LiteGraph;
  const reg = LG.registered_node_types || {};
  if (!reg["TextEncodeQwenImageEditPlus"] || !reg["FluxKontextMultiReferenceLatentMethod"]
    || !reg["ModelSamplingAuraFlow"] || !reg["CFGNorm"]) return null;
  const workflowId = freshWorkflowId();
  const graph = new LG.LGraph(structuredClone({ ...EMPTY_WORKFLOW, id: workflowId }));
  graph.last_node_id = offscreenIdBase(); // render-node ids must stay off the live canvas — see offscreen-graph.js
  const placeAt = (node, x, y) => { node.pos = [x, y]; graph.add(node); };

  const load = LG.createNode("LoadImage");
  const stageScale = LG.createNode("ImageScaleToTotalPixels");
  const unet = LG.createNode("UNETLoader");
  const clip = LG.createNode("CLIPLoader");
  const vae = LG.createNode("VAELoader");
  const aura = LG.createNode("ModelSamplingAuraFlow");
  const norm = LG.createNode("CFGNorm");
  const posEnc = LG.createNode("TextEncodeQwenImageEditPlus");
  const negEnc = LG.createNode("TextEncodeQwenImageEditPlus");
  const refPos = LG.createNode("FluxKontextMultiReferenceLatentMethod");
  const refNeg = LG.createNode("FluxKontextMultiReferenceLatentMethod");
  const encode = LG.createNode("VAEEncode");
  const sampler = LG.createNode("KSampler");
  const decode = LG.createNode("VAEDecode");
  const save = LG.createNode(options.previewOnly ? "PreviewImage" : "SaveImage");
  if (!load || !stageScale || !unet || !clip || !vae || !aura || !norm || !posEnc || !negEnc
    || !refPos || !refNeg || !encode || !sampler || !decode || !save) return null;

  const unetW = unet.widgets?.find((x) => x.name === "unet_name");
  const unetFile = options.engineModel?.filename
    || (unetW?.options?.values || []).find((o) => /qwen.*image.*edit/i.test(o));
  const clipW = clip.widgets?.find((x) => x.name === "clip_name");
  const clipFile = (clipW?.options?.values || []).find((o) => /qwen.*2[._]5.*vl/i.test(o));
  const vaeW = vae.widgets?.find((x) => x.name === "vae_name");
  const vaeFile = (vaeW?.options?.values || []).find((o) => /qwen.*image.*vae/i.test(o));
  if (!unetW || !unetFile || !clipW || !clipFile || !vaeW || !vaeFile) return null;
  if (Array.isArray(unetW.options?.values) && !unetW.options.values.includes(unetFile)) {
    unetW.options.values.push(unetFile);
  }
  unetW.value = unetFile; unetW.callback?.(unetFile);
  clipW.value = clipFile; clipW.callback?.(clipFile);
  setNamedWidget(clip, "type", "qwen_image");
  vaeW.value = vaeFile; vaeW.callback?.(vaeFile);

  if (data.filename) load.title = data.filename;
  placeAt(load, 80, 200);
  placeAt(stageScale, 420, 200);
  placeAt(unet, 80, 700);
  placeAt(clip, 80, 860);
  placeAt(vae, 80, 1020);
  placeAt(aura, 420, 700);
  placeAt(norm, 420, 860);
  placeAt(posEnc, 760, 420);
  placeAt(negEnc, 760, 680);
  placeAt(refPos, 1080, 420);
  placeAt(refNeg, 1080, 680);
  placeAt(encode, 760, 200);
  placeAt(sampler, 1400, 420);
  placeAt(decode, 1720, 200);
  setImageWidget(load, data.input_ref);
  setNamedWidget(stageScale, "upscale_method", "lanczos");
  setNamedWidget(stageScale, "megapixels", QWEN_EDIT_STAGE_MP);
  setNamedWidget(aura, "shift", 3);
  setNamedWidget(norm, "strength", 1);
  setNamedWidget(posEnc, "prompt", (options.prompt || "").trim() || QWEN_ENHANCE_INSTRUCTION);
  setNamedWidget(negEnc, "prompt", "");
  for (const ref of [refPos, refNeg]) {
    const methodW = ref.widgets?.[0];
    if (methodW) { methodW.value = "index_timestep_zero"; methodW.callback?.(methodW.value); }
  }
  setNamedWidget(sampler, "seed", Math.floor(Math.random() * 2 ** 32));
  setNamedWidget(sampler, "steps", options.advanced?.steps ?? 40);
  setNamedWidget(sampler, "cfg", options.advanced?.cfg ?? 4);
  setNamedWidget(sampler, "sampler_name", options.sampler || "euler");
  setNamedWidget(sampler, "scheduler", options.scheduler || "simple");
  // Denoise stays 1.0: the conditioning image anchors the content; partial
  // denoise just blends the sub-pixel-shifted re-render with the original.
  setNamedWidget(sampler, "denoise", 1.0);

  load.connect(0, stageScale, inputIdx(stageScale, "image", 0));
  clip.connect(0, posEnc, inputIdx(posEnc, "clip", 0));
  clip.connect(0, negEnc, inputIdx(negEnc, "clip", 0));
  vae.connect(0, posEnc, inputIdx(posEnc, "vae", 1));
  vae.connect(0, negEnc, inputIdx(negEnc, "vae", 1));
  stageScale.connect(0, posEnc, inputIdx(posEnc, "image1", 2));
  stageScale.connect(0, negEnc, inputIdx(negEnc, "image1", 2));
  stageScale.connect(0, encode, inputIdx(encode, "pixels", 0));
  vae.connect(0, encode, inputIdx(encode, "vae", 1));
  posEnc.connect(0, refPos, inputIdx(refPos, "conditioning", 0));
  negEnc.connect(0, refNeg, inputIdx(refNeg, "conditioning", 0));
  unet.connect(0, aura, inputIdx(aura, "model", 0));
  aura.connect(0, norm, inputIdx(norm, "model", 0));
  norm.connect(0, sampler, inputIdx(sampler, "model", 0));
  refPos.connect(0, sampler, inputIdx(sampler, "positive", 1));
  refNeg.connect(0, sampler, inputIdx(sampler, "negative", 2));
  encode.connect(0, sampler, inputIdx(sampler, "latent_image", 3));
  sampler.connect(0, decode, inputIdx(decode, "samples", 0));
  vae.connect(0, decode, inputIdx(decode, "vae", 1));

  const w = data.width || 0;
  const h = data.height || 0;
  const longest = Math.max(w, h);
  const chosenScale = typeof options.upscaleBy === "number" && options.upscaleBy >= 1
    ? options.upscaleBy
    : longest > 0 ? Math.min(8, Math.max(1, Math.round((4096 / longest) * 100) / 100)) : 2;
  const targetW = Math.round(w * chosenScale) || 2048;
  const targetH = Math.round(h * chosenScale) || 2048;
  let imageSource = decode;
  if (targetW * targetH > QWEN_EDIT_STAGE_MP * 1e6 * 1.05) {
    const upLoader = LG.createNode("UpscaleModelLoader");
    const upApply = LG.createNode("ImageUpscaleWithModel");
    if (!upLoader || !upApply) return null;
    placeAt(upLoader, 1720, 420);
    placeAt(upApply, 2040, 200);
    pickUpscaleModel(upLoader, options.climbModel);
    decode.connect(0, upApply, inputIdx(upApply, "image", 1));
    upLoader.connect(0, upApply, inputIdx(upApply, "upscale_model", 0));
    imageSource = upApply;
  }
  // Exact-fit either way — the qwen stage rescales by total pixels, so its
  // dims never equal the requested target on their own.
  const fit = LG.createNode("ImageScale");
  if (!fit) return null;
  placeAt(fit, imageSource.pos[0] + 320, 200);
  setNamedWidget(fit, "upscale_method", "lanczos");
  setNamedWidget(fit, "width", targetW);
  setNamedWidget(fit, "height", targetH);
  imageSource.connect(0, fit, inputIdx(fit, "image", 0));

  placeAt(save, fit.pos[0] + 300, 200);
  fit.connect(0, save, 0);
  if (!options.previewOnly) {
    const prefixW = save.widgets?.find((x) => x.name === "filename_prefix");
    const prefix = (options.savePrefix || "").trim() || "upscale/upscale";
    if (prefixW) { prefixW.value = prefix; prefixW.callback?.(prefix); }
  }
  return { graph, workflowId };
}

// Build the complete upscale graft on an OFF-SCREEN LGraph — the user's tabs
// are NEVER involved. The old temp-tab dance once replaced the user's open
// workflow with the graft (frontend tab-reuse semantics shifted underneath
// it), so isolation is now structural: this graph has no canvas, no tab, no
// path, and is discarded after serialization. Returns { graph, workflowId }.
export async function buildUpscaleGraph(prepared, options = {}) {
  const { data, caps } = prepared;
  try {
    const savePrefix = (options.savePrefix || "").trim();
    const engine = options.engine || "source";
    // Picker engines build standalone graphs — any source image works,
    // graftable or not.
    if (engine === "sdxl-ckpt" || engine === "qwen-edit" || engine === "flux1-unet"
      || engine === "zimage-unet" || engine === "krea2-unet") {
      const built = engine === "sdxl-ckpt"
        ? buildSdxlCkptEngineGraph(data, { ...options, savePrefix })
        : engine === "flux1-unet"
          ? buildFlux1EngineGraph(data, { ...options, savePrefix })
          : engine === "zimage-unet"
            ? buildZImageEngineGraph(data, { ...options, savePrefix })
            : engine === "krea2-unet"
              ? buildKrea2EngineGraph(data, { ...options, savePrefix })
              : buildQwenEditEngineGraph(data, { ...options, savePrefix });
      if (built) return built;
      toast("warn", "Couldn't build that upscale engine — using a plain model upscale instead.");
      return buildEsrganFloorGraph(data, savePrefix, options.previewOnly, "ultrasharp", options.climbModel);
    }
    // Plain engines are explicit main-engine choices now; non-graftable
    // images keep them as their only option.
    if (!caps.graftable || engine === "ultrasharp" || engine === "seedvr2") {
      const longest = Math.max(data.width || 0, data.height || 0);
      const scale = typeof options.upscaleBy === "number" && options.upscaleBy >= 1
        ? options.upscaleBy
        : longest > 0 ? Math.min(8, Math.max(1, Math.round((4096 / longest) * 100) / 100)) : 2;
      return buildEsrganFloorGraph(data, savePrefix, options.previewOnly, engine, options.climbModel, scale);
    }

    const mode = options.mode || caps.defaultMode || "prompt";
    const depthSource = options.depthSource || caps.defaultDepthSource || "pose";

    // The embedded JSON still carries the SOURCE workflow's id — keep the
    // graft a separate workflow, or its outputs get recorded into the source
    // workflow's timeline (left/right must stay locked to its own outputs).
    // JSON round-trip: prepared lives in Svelte $state by the time the modal
    // confirms, which deep-proxies it — and litegraph's _configureBase
    // structuredClones workflow.extra, which THROWS DataCloneError on
    // proxies. The workflow originated as server JSON, so this is lossless.
    const workflowId = freshWorkflowId();
    const workflowJson = JSON.parse(JSON.stringify({ ...data.workflow, id: workflowId }));
    const LG = window.LiteGraph;
    const graph = new LG.LGraph();
    graph.configure(workflowJson);

    let usNode = graph._nodes.find((n) => n.comfyClass === "UltimateSDUpscale");
    if (!usNode) {
      const pcNode = graph._nodes.find((n) => n.comfyClass === "PromptChain_PromptChain");
      const config = await fetchModelConfig(graph);
      // Flux2 never goes through USDU — tiling it is structurally broken
      // (see buildFlux2RefineGraph). Full-frame reference-anchored refine.
      if ((config?.architecture || caps.architecture) === "flux2") {
        const refined = buildFlux2RefineGraph(graph, workflowId, data, { ...options, savePrefix }, config);
        if (refined) return refined;
        toast("warn", "Couldn't build the Flux 2 refine — using a plain model upscale instead.");
        return buildEsrganFloorGraph(data, savePrefix, options.previewOnly, options.engine, options.climbModel);
      }
      if (!pcNode || !injectUpscaler(pcNode, config, { regional: mode === "regional", pinFlux2TileModel: true })) {
        console.warn(`[PromptChain][upscale] source graft -> PLAIN fallback: pcNode=${pcNode?.id ?? "NONE"} arch=${config?.architecture || caps.architecture} graphTypes=[${graph._nodes.map((n) => n.comfyClass).join(",")}]`);
        toast("warn", "No attachment point in this image's workflow — using a plain model upscale instead.");
        return buildEsrganFloorGraph(data, savePrefix, options.previewOnly, options.engine, options.climbModel);
      }
      usNode = graph._nodes.find((n) => n.comfyClass === "UltimateSDUpscale");
    } else if (mode === "regional") {
      ensureRegionalConditioning(graph, LG, usNode);
    }
    // Krea 2 renders carry the Qwen-Image VAE, whose decoder bakes a periodic
    // grid/scale artifact into every tile USDU re-decodes. The Wan 2.1 VAE
    // shares the SAME frozen encoder (tiles encode to an identical Krea2-
    // compatible latent) but its decoder has no grid artifact — repoint the
    // grafted decode to it so the source-model upscale comes out clean, same as
    // the standalone Krea2 tile engine. Excludes the 2x variant (12-ch/2x output
    // would break tiling); only fires for a Krea 2 source on the Qwen VAE.
    const isKrea2Source = caps.architecture === "krea2"
      || graph._nodes.some((n) => n.comfyClass === "CLIPLoader"
        && n.widgets?.find((w) => w.name === "type")?.value === "krea2");
    if (isKrea2Source) {
      for (const vl of graph._nodes.filter((n) => n.comfyClass === "VAELoader")) {
        const vaeW = vl.widgets?.find((w) => w.name === "vae_name");
        if (!vaeW || !/qwen.*image.*vae/i.test(vaeW.value || "")) continue;
        const wan = (vaeW.options?.values || [])
          .find((o) => /wan.*2[._]?1.*vae/i.test(o) && !/upscale|2x/i.test(o));
        if (wan) { vaeW.value = wan; vaeW.callback?.(wan); }
      }
    }
    if (mode === "regional" && usNode) {
      // The installed USDU port's crop_mask only remaps the FIRST crop region
      // of a batch — batched tiles would smear every region mask across the
      // whole batch. One tile per sample keeps the per-tile mask crops exact.
      setNamedWidget(usNode, "batch_size", 1);
    }

    // The LoadImage goes in before shaping/pruning: depth-from-image hints off
    // the same node that feeds the USDU, and the prune protects it explicitly
    // (the image input is otherwise excluded from the keep closure).
    const imageIdx = inputIdx(usNode, "image", 0);
    usNode.disconnectInput(imageIdx);
    const loadNode = LG.createNode("LoadImage");
    if (loadNode) {
      // The input copy's content-hash name is opaque — title the node with the
      // source filename so it's obvious which image this workflow upscales.
      if (data.filename) loadNode.title = data.filename;
      loadNode.pos = [usNode.pos[0] - 380, usNode.pos[1]];
      graph.add(loadNode);
      setImageWidget(loadNode, data.input_ref);
      loadNode.connect(0, usNode, imageIdx);
    }

    if (mode === "prompt") {
      rewireToBaseConditioning(graph, usNode);
    } else if (loadNode) {
      // depth mode hints from the chosen source; regional always pins to the
      // 3D pose render (its regions come from the same scene).
      ensureDepthBranch(graph, LG, usNode, mode === "regional" ? "pose" : depthSource, loadNode);
    }

    // After the cond/depth wiring settles: an Edit crop selection needs the
    // pose masks + depth render cropped to its rect. No-op unless the poser
    // actually feeds this graft (prompt mode rewires past it).
    if (data.editRect) {
      cropSceneToEditRect(graph, LG, usNode, data.editRect);
    }

    if (loadNode && options.condition && options.condition !== "none") {
      injectUpscaleCondition(graph, LG, usNode, loadNode, options.condition);
    }

    pruneToUpscaleCore(graph, usNode, loadNode ? [loadNode.id] : []);
    if (options.previewOnly) swapSaveForPreview(graph, usNode, LG);
    else setSavePrefix(graph, usNode, savePrefix);
    if (typeof options.prompt === "string" && options.prompt.trim()) {
      overrideGraphPrompt(graph, options.prompt);
    }

    // Scale from the ACTUAL image dimensions, not the workflow's latent — an
    // already-upscaled input would otherwise re-multiply toward 16K tiles.
    // Modal sliders (background mode) override both knobs when provided.
    const longest = Math.max(data.width || 0, data.height || 0);
    const scaleW = usNode.widgets?.find((x) => x.name === "upscale_by");
    const chosenScale = typeof options.upscaleBy === "number" && options.upscaleBy >= 1
      ? options.upscaleBy
      : longest > 0 ? Math.min(8, Math.max(1, Math.round((4096 / longest) * 100) / 100)) : null;
    if (scaleW && chosenScale != null) {
      scaleW.value = chosenScale;
      scaleW.callback?.(chosenScale);
    }
    const denoiseW = usNode.widgets?.find((x) => x.name === "denoise");
    if (denoiseW && typeof options.denoise === "number") {
      denoiseW.value = options.denoise;
      denoiseW.callback?.(options.denoise);
    }
    for (const [optKey, widgetName] of [["sampler", "sampler_name"], ["scheduler", "scheduler"]]) {
      const choice = options[optKey];
      const w = usNode.widgets?.find((x) => x.name === widgetName);
      if (w && typeof choice === "string" && choice) {
        w.value = choice;
        w.callback?.(choice);
      }
    }
    // Advanced overrides carry only the fields the user actually touched in
    // the modal — untouched ones keep whatever the build/source already set.
    if (options.advanced && typeof options.advanced === "object") {
      const ALLOWED = new Set([
        "steps", "cfg", "tile_width", "tile_height", "mask_blur",
        "tile_padding", "mode_type", "seam_fix_mode", "seam_fix_denoise",
      ]);
      for (const [name, value] of Object.entries(options.advanced)) {
        if (!ALLOWED.has(name) || value == null) continue;
        const w = usNode.widgets?.find((x) => x.name === name);
        if (w) { w.value = value; w.callback?.(value); }
      }
    }

    return { graph, workflowId };
  } catch (e) {
    // The prepare step can't see build failures — surface them, or the modal's
    // confirm just silently does nothing.
    console.error("[PromptChain] upscale graph build failed", e);
    toast("error", `Couldn't build the upscale workflow: ${e.message}`);
    reportClientError("buildUpscaleGraph", e, {
      mode: options.mode || prepared.caps?.defaultMode || "prompt",
      condition: options.condition || "none",
      previewOnly: !!options.previewOnly,
      filename: prepared.data?.filename || "",
      input_ref: prepared.data?.input_ref || "",
    });
    return null;
  }
}

// "Create Workflow": the one DELIBERATE tab — built off-screen first, then
// displayed. The user explicitly asked for a tab here; Apply and the Edit
// handoff never come through this path.
export async function buildUpscaleWorkflow(prepared, options = {}) {
  const built = await buildUpscaleGraph(prepared, options);
  if (!built) return false;
  const tabName = `upscale ${prepared.data.filename || ""}`.trim();
  await app.loadGraphData(built.graph.serialize(), true, true, tabName);
  return true;
}
