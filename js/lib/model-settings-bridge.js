// Model Settings bridge — lazy-loads the Svelte model settings modal
// and manages its lifecycle. Contains graph scanning, node injection,
// template capture, and all constants that the Svelte side consumes.

import { app } from "../../../scripts/app.js";
import { getLink, getLinkInfo } from "./slot-utils.js";
import { showCatalogDownloadModal, showDownloadModal, registerModelModal, applyTemplate, MODEL_WIDGET_NAMES, showNodePackInstallModal } from "./model-bridge.js";
import { ensureSvelteCSS, createModuleLoader } from "./lazy-load.js";

// ── architecture + family definitions ──────────────────────────────
// Duplicated here because this file runs as a raw ES module (not bundled by Vite),
// while the Svelte components import from svelte-src/lib/model-constants.js.

export const ARCHITECTURES = [
  { id: "sdxl", label: "SDXL" }, { id: "sd15", label: "SD 1.5" },
  { id: "flux", label: "Flux" }, { id: "flux2", label: "Flux 2" },
  { id: "sd3", label: "SD3" }, { id: "zimage", label: "Z-Image" },
  { id: "qwen_image", label: "Qwen Image" }, { id: "qwen_edit", label: "Qwen Edit" },
  { id: "wan22", label: "Wan 2.2" }, { id: "ltx", label: "LTX Video" },
  { id: "hunyuan_video", label: "HunyuanVideo" }, { id: "hidream", label: "HiDream" },
  { id: "ernie", label: "ERNIE Image" },
  { id: "ideogram", label: "Ideogram" },
];

export const FAMILIES = {
  sdxl: [{ id: "base_sdxl", label: "Base SDXL" }, { id: "pony", label: "Pony" }, { id: "illustrious", label: "Illustrious" }, { id: "noobai", label: "NoobAI" }],
  sd15: [{ id: "base_sd15", label: "Base SD 1.5" }, { id: "nai", label: "NAI" }],
  flux: [{ id: "flux_dev", label: "Flux Dev" }, { id: "flux_schnell", label: "Flux Schnell" }, { id: "flux_fill", label: "Flux Fill" }],
  flux2: [{ id: "flux2", label: "Flux 2" }, { id: "flux2_gguf", label: "Flux 2 GGUF" }, { id: "flux2_klein", label: "Flux 2 Klein" }],
  sd3: [{ id: "sd3", label: "SD3" }, { id: "sd3.5", label: "SD 3.5" }],
  zimage: [{ id: "zimage_base", label: "Z-Image Base" }, { id: "zimage_turbo", label: "Z-Image Turbo" }],
  qwen_image: [{ id: "qwen_image", label: "Qwen Image" }],
  qwen_edit: [{ id: "qwen_edit", label: "Qwen Edit" }, { id: "qwen_aio", label: "Qwen AIO" }],
  wan22: [{ id: "wan22_i2v", label: "Wan I2V 14B" }, { id: "wan22_i2v_gguf", label: "Wan I2V 14B (GGUF)" }, { id: "wan22_t2v", label: "Wan T2V 14B" }, { id: "wan22_t2v_gguf", label: "Wan T2V 14B (GGUF)" }, { id: "wan22_5b", label: "Wan TI2V 5B" }, { id: "wan22_5b_gguf", label: "Wan TI2V 5B (GGUF)" }],
  ltx: [{ id: "ltx23", label: "LTX 2.3" }],
  hunyuan_video: [{ id: "hunyuan_video_15", label: "HunyuanVideo 1.5" }],
  hidream: [{ id: "hidream", label: "HiDream-I1" }],
  ernie: [{ id: "ernie_base", label: "ERNIE Image" }, { id: "ernie_turbo", label: "ERNIE Image Turbo" }],
  ideogram: [{ id: "ideogram4", label: "Ideogram 4" }],
};

// ── supported node types + widgets ─────────────────────────────────

export const SUPPORTED_NODES = {
  KSampler: {
    label: "KSampler",
    collapsible: true,
    widgets: {
      steps:        { type: "slider", min: 1, max: 60, step: 1 },
      cfg:          { type: "slider", min: 1, max: 15, step: 0.1 },
      sampler_name: { type: "combo", pair: "scheduler" },
      scheduler:    { type: "combo", paired: true },
      denoise:      { type: "slider", min: 0, max: 1, step: 0.01 },
    },
  },
  KSamplerAdvanced: {
    label: "KSampler (Advanced)",
    widgets: {
      steps:        { type: "slider", min: 1, max: 60, step: 1 },
      cfg:          { type: "slider", min: 1, max: 15, step: 0.1 },
      sampler_name: { type: "combo", pair: "scheduler" },
      scheduler:    { type: "combo", paired: true },
      start_at_step: { type: "slider", min: 0, max: 60, step: 1 },
      end_at_step:  { type: "slider", min: 0, max: 60, step: 1 },
    },
  },
  PromptChain_RegionalDetailer: {
    label: "FaceDetailer (Regional)",
    collapsible: true,
    widgets: {
      cfg:            { type: "slider", min: 1, max: 15, step: 0.1 },
      denoise:        { type: "slider", min: 0, max: 1, step: 0.01 },
      face_source:    { type: "combo" },
      max_face_angle: { type: "slider", min: 0, max: 180, step: 5, collapsed: true },
      steps:          { type: "slider", min: 1, max: 60, step: 1, collapsed: true },
      sampler_name:   { type: "combo", collapsed: true, pair: "scheduler" },
      scheduler:      { type: "combo", collapsed: true, paired: true },
      guide_size:     { type: "slider", min: 64, max: 1024, step: 8, collapsed: true },
      max_size:       { type: "slider", min: 256, max: 2048, step: 64, collapsed: true },
      crop_factor:    { type: "slider", min: 1, max: 8, step: 0.1, collapsed: true },
      feather:        { type: "slider", min: 0, max: 128, step: 1, collapsed: true },
      bbox_threshold: { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
      bbox_dilation:  { type: "slider", min: 0, max: 128, step: 1, collapsed: true },
      mask_dilation:  { type: "slider", min: 0, max: 128, step: 1, collapsed: true },
      drop_size:      { type: "slider", min: 1, max: 512, step: 1, collapsed: true },
    },
  },
  ApplyPulidAdvanced: {
    label: "PuLID",
    collapsible: true,
    widgets: {
      weight:     { type: "slider", min: 0, max: 1, step: 0.05 },
      fidelity:   { type: "slider", min: 0, max: 20, step: 1, collapsed: true },
      noise:      { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
      start_at:   { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
      end_at:     { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
      projection: { type: "combo", collapsed: true },
    },
  },
  IPAdapterAdvanced: {
    label: "Style Reference",
    collapsible: true,
    widgets: {
      weight:         { type: "slider", min: 0, max: 2, step: 0.05 },
      weight_type:    { type: "combo", collapsed: true },
      start_at:       { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
      end_at:         { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
      combine_embeds: { type: "combo", collapsed: true },
      embeds_scaling: { type: "combo", collapsed: true },
    },
  },
  ApplyPulidFlux: {
    label: "PuLID (Flux)",
    collapsible: true,
    widgets: {
      weight:   { type: "slider", min: 0, max: 2, step: 0.05 },
      start_at: { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
      end_at:   { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
    },
  },
  // iFayens ComfyUI-PuLID-Flux2: strength is the only tuning knob (no
  // start_at/end_at — the patch wraps the unet for the whole denoise).
  ApplyPuLIDFlux2: {
    label: "PuLID (Flux 2)",
    collapsible: true,
    widgets: {
      strength:   { type: "slider", min: 0, max: 2, step: 0.05 },
      face_index: { type: "slider", min: 0, max: 9, step: 1, collapsed: true },
    },
  },
  UltimateSDUpscale: {
    label: "Upscaler",
    collapsible: true,
    widgets: {
      upscale_by:       { type: "slider", min: 1, max: 4, step: 0.01, ticks: "resolution" },
      denoise:          { type: "slider", min: 0, max: 1, step: 0.01 },
      steps:            { type: "slider", min: 1, max: 60, step: 1, collapsed: true },
      cfg:              { type: "slider", min: 1, max: 15, step: 0.1, collapsed: true },
      sampler_name:     { type: "combo", collapsed: true, pair: "scheduler" },
      scheduler:        { type: "combo", collapsed: true, paired: true },
      tile_width:       { type: "slider", min: 256, max: 2048, step: 64, collapsed: true },
      tile_height:      { type: "slider", min: 256, max: 2048, step: 64, collapsed: true },
      mask_blur:        { type: "slider", min: 0, max: 64, step: 1, collapsed: true },
      tile_padding:     { type: "slider", min: 0, max: 128, step: 1, collapsed: true },
      mode_type:        { type: "combo", collapsed: true },
      seam_fix_mode:    { type: "combo", collapsed: true },
      seam_fix_denoise: { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
    },
  },
};

export const CLIP_NODES = {
  CLIPSetLastLayer: {
    label: "Clip Skip",
    widgets: {
      stop_at_clip_layer: { type: "slider", min: -4, max: -1, step: 1 },
    },
  },
};

export const LATENT_NODES = {
  EmptyLatentImage: {
    label: "Latent Image",
    widgets: {
      width:  { type: "resolution" },
      height: { type: "resolution" },
    },
  },
  EmptySD3LatentImage: {
    label: "Latent Image",
    widgets: {
      width:  { type: "resolution" },
      height: { type: "resolution" },
    },
  },
  EmptyFlux2LatentImage: {
    label: "Latent Image",
    widgets: {
      width:  { type: "resolution" },
      height: { type: "resolution" },
    },
  },
};

export const FLUX_NODES = {
  FluxGuidance: {
    label: "Guidance",
    widgets: {
      guidance: { type: "slider", min: 0, max: 100, step: 0.1 },
    },
  },
  KSamplerSelect: {
    label: "Sampler",
    widgets: {
      sampler_name: { type: "combo" },
    },
  },
  BasicScheduler: {
    label: "Scheduler",
    widgets: {
      scheduler: { type: "combo" },
      steps:     { type: "slider", min: 1, max: 10000, step: 1 },
      denoise:   { type: "slider", min: 0, max: 1, step: 0.01 },
    },
  },
  Flux2Scheduler: {
    label: "Scheduler",
    widgets: {
      steps: { type: "slider", min: 1, max: 4096, step: 1 },
    },
  },
  RandomNoise: {
    label: "Noise",
    widgets: {},
  },
};

// Ideogram 4 tuning nodes. Its t2i graph samples through PromptChain_IdeogramSampler
// (a SamplerCustomAdvanced+VAEDecode drop-in), fed by these. Surfaced in the model
// Settings panel like FLUX_NODES so an Ideogram model has real controls instead of
// an empty pane. Resolution stays on the EmptyFlux2LatentImage row (LATENT_NODES);
// the scheduler's own width/height are intentionally not exposed here to avoid a
// second resolution row.
export const IDEOGRAM_NODES = {
  Ideogram4Scheduler: {
    label: "Scheduler",
    widgets: {
      steps: { type: "slider", min: 1, max: 200, step: 1 },
    },
  },
  DualModelGuider: {
    label: "Guidance",
    widgets: {
      cfg: { type: "slider", min: 0, max: 30, step: 0.1 },
    },
  },
  CFGOverride: {
    label: "CFG Override",
    widgets: {
      cfg:           { type: "slider", min: 0, max: 30, step: 0.1 },
      start_percent: { type: "slider", min: 0, max: 1, step: 0.01 },
      end_percent:   { type: "slider", min: 0, max: 1, step: 0.01 },
    },
  },
};

const FLUX_NODE_TYPES = new Set(Object.keys(FLUX_NODES));
const IDEOGRAM_NODE_TYPES = new Set(Object.keys(IDEOGRAM_NODES));
const SAMPLER_INCLUDES = ["KSampler"];
const LATENT_NODE_TYPES = new Set(Object.keys(LATENT_NODES));
const CLIP_NODE_TYPES = new Set(Object.keys(CLIP_NODES));
const DEFERRED_NODES = new Set(["PromptChain_RegionalDetailer", "ApplyPulidAdvanced", "ApplyPulidFlux", "ApplyPuLIDFlux2", "IPAdapterAdvanced", "UltimateSDUpscale"]);

// Node types each injectable needs to be registered before it can be built.
// If any are missing we offer to install the
// pack(s) — the node_install_api allowlist maps the injectable to its repos.
const INJECT_REQUIREMENTS = {
  // Our RegionalDetailer node is always registered; the install gate fetches the
  // ultralytics runtime + face_yolov8n.pt (server keys `present` off the model).
  RegionalDetailer: { nodes: ["PromptChain_RegionalDetailer"] },
  PuLID: { nodes: ["ApplyPulidAdvanced"] },
  PuLIDFlux: { nodes: ["ApplyPulidFlux", "FluxForwardOverrider"] },
  // Standalone patch — no forward-overrider companion (unlike the Flux.1 fork).
  PuLIDFlux2: { nodes: ["ApplyPuLIDFlux2"] },
  StyleReference: { nodes: ["IPAdapterUnifiedLoader", "IPAdapterAdvanced"] },
  Upscaler: { nodes: ["UltimateSDUpscale"] },
  // Native preprocessors (always registered) satisfy these; ControlNetLoader/
  // ApplyAdvanced/SetUnionControlNetType are ComfyUI core (assumed present). The
  // gate is server-driven (/nodepacks/status) and now fetches only models + pip.
  ControlNet: { nodes: ["PromptChain_DepthAnything", "PromptChain_OpenPose"] },
  FluxControlNet: { nodes: ["PromptChain_DepthAnything", "PromptChain_OpenPose"] },
  // coreNodes can't be installed by a pack — they ship with ComfyUI. If absent
  // the inject tells the user to update ComfyUI instead of offering an install.
  ZImageControlNet: { nodes: ["PromptChain_DepthAnything", "PromptChain_OpenPose"], coreNodes: ["ZImageFunControlnet", "ModelPatchLoader"] },
  ZImageControlNetBase: { nodes: ["PromptChain_DepthAnything", "PromptChain_OpenPose"], coreNodes: ["ZImageFunControlnet", "ModelPatchLoader"] },
};

// Per control type: which model to load (union promax / dedicated tile /
// dedicated MistoLine), the matching comfyui_controlnet_aux preprocessor node,
// the SetUnionControlNetType id (null = dedicated model, no union node), and
// default ControlNetApplyAdvanced strength/end. Verified against node source.
export const CONTROLNET_TYPES = {
  depth:    { model: "union", pre: "DepthAnythingV2Preprocessor",  unionType: "depth", strength: 0.7, end: 0.8 },
  canny:    { model: "union", pre: "CannyEdgePreprocessor",        unionType: "canny/lineart/anime_lineart/mlsd", strength: 0.9, end: 1.0 },
  pose:     { model: "union", pre: "DWPreprocessor",               unionType: "openpose", strength: 1.0, end: 0.7 },
  softedge: { model: "union", pre: "HEDPreprocessor",              unionType: "hed/pidi/scribble/ted", strength: 0.6, end: 0.8 },
  scribble: { model: "union", pre: "ScribblePreprocessor",         unionType: "hed/pidi/scribble/ted", strength: 0.6, end: 0.8 },
  lineart:  { model: "mistoline", pre: "AnyLineArtPreprocessor_aux", unionType: null, strength: 0.8, end: 1.0 },
  tile:     { model: "tile", pre: "TilePreprocessor",             unionType: null, strength: 0.6, end: 1.0 },
};

// Flux ControlNet (Shakker FLUX.1-dev-ControlNet-Union-Pro-2.0). Differs from
// SDXL: v2 dropped the mode embedding so there is NO SetUnionControlNetType
// (unionType always null), and the ControlNetApplyAdvanced node MUST receive a
// VAE (Flux ControlNets encode the hint into latent space). Per-mode
// strength/end are the model card's recommended values. gray = recolor mode,
// fed a luminance map. Modes verified against the v2 card (canny/softedge/
// depth/pose/gray; v2 dropped tile + lineart/scribble).
const FLUX_CONTROLNET_TYPES = {
  // card recommends 0.8/0.8, but that grips the mannequin silhouette too hard
  // and jaggies the edges; 0.6/0.6 renders cleaner (user-tuned vs Krea).
  depth:    { pre: "DepthAnythingV2Preprocessor", strength: 0.6, end: 0.6 },
  canny:    { pre: "CannyEdgePreprocessor",       strength: 0.7, end: 0.8 },
  pose:     { pre: "DWPreprocessor",              strength: 0.9, end: 0.65 },
  softedge: { pre: "HEDPreprocessor",             strength: 0.7, end: 0.8 },
  gray:     { pre: "ImageLuminanceDetector",      strength: 0.9, end: 0.8 },
};

// Z-Image ControlNet (alibaba-pai Fun-Controlnet-Union-2.1). Uses the DiffSynth
// model-patch path: ZImageFunControlnet patches the MODEL (no conditioning
// re-emit), so the cluster splices onto the model line like PuLID, not the
// conditioning line. Same comfyui_controlnet_aux preprocessors as SDXL/Flux.
// Turbo runs ~8 steps / cfg 1.3 (set by the model preset, not here); per-mode
// strength stays in the 0.65–1.0 band.
const ZIMAGE_CONTROLNET_TYPES = {
  depth:    { pre: "DepthAnythingV2Preprocessor", strength: 0.8 },
  canny:    { pre: "CannyEdgePreprocessor",       strength: 0.7 },
  pose:     { pre: "DWPreprocessor",              strength: 0.9 },
  softedge: { pre: "HEDPreprocessor",             strength: 0.9 },
  scribble: { pre: "ScribblePreprocessor",        strength: 0.9 },
  gray:     { pre: "ImageLuminanceDetector",      strength: 0.9 },
};

// PromptChain ships native, license-clean replacements for every preprocessor
// the [add] clusters use, so a fresh install never needs comfyui_controlnet_aux.
// resolvePre keeps a real controlnet_aux node first when present (coexistence —
// never overwrite/duplicate a pack the user already runs), falls back to our
// native, and finally leaves the original id so the inject's null-guard surfaces
// the missing node exactly as before.
const NATIVE_PRE = {
  DepthAnythingV2Preprocessor: "PromptChain_DepthAnything",
  CannyEdgePreprocessor:       "PromptChain_Canny",
  DWPreprocessor:              "PromptChain_OpenPose",
  HEDPreprocessor:             "PromptChain_SoftEdge",
  AnyLineArtPreprocessor_aux:  "PromptChain_LineArt",
  ScribblePreprocessor:        "PromptChain_Scribble",
  TilePreprocessor:            "PromptChain_Tile",
  ImageLuminanceDetector:      "PromptChain_Luminance",
};
export function resolvePre(preId) {
  const LG = window.LiteGraph;
  if (LG?.registered_node_types?.[preId]) return preId;
  const native = NATIVE_PRE[preId];
  if (native && LG?.registered_node_types?.[native]) return native;
  return preId;
}
// True when a preprocessor is available at all — the real controlnet_aux node OR
// our native fallback. For availability gates that used to check only the
// controlnet_aux id directly (so depth features light up on a native-only install).
export function hasPre(preId) {
  const reg = window.LiteGraph?.registered_node_types;
  return !!(reg?.[preId] || (NATIVE_PRE[preId] && reg?.[NATIVE_PRE[preId]]));
}

// Z-Image control models are family-specific (NOT cross-compatible): Turbo's
// carry "turbo"/"8steps" (step-distilled), base's don't. Match by family and
// pre-seed the installer's canonical filename for the fresh-download combo lag.
const ZIMAGE_CN_TURBO_FILE = "z-image-turbo-fun-union-2.1.safetensors";
const ZIMAGE_CN_BASE_FILE = "z-image-base-fun-union-2.1.safetensors";
function pickZImageModelPatch(loaderNode, isBase) {
  const w = loaderNode.widgets?.find(x => x.name === "name");
  const opts = w?.options?.values || [];
  const isTurboFile = o => /turbo|8steps/i.test(o);
  const isUnionFile = o => /z-?image.*union/i.test(o);
  const hit = isBase
    ? opts.find(o => isUnionFile(o) && !isTurboFile(o))
    : (opts.find(o => isUnionFile(o) && isTurboFile(o)) || opts.find(o => isTurboFile(o)));
  return { hit, canonical: isBase ? ZIMAGE_CN_BASE_FILE : ZIMAGE_CN_TURBO_FILE };
}

// Filename patterns to resolve the right checkpoint in the ControlNetLoader
// combo — never hardcode a filename (machines name them differently).
const CN_MODEL_MATCH = {
  union: [/union.*promax/i, /union/i],
  tile: [/xinsir.*tile|tile.*sdxl/i, /tile/i],
  mistoline: [/mistoline/i],
  fluxunion: [/flux.*union.*pro.*2/i, /flux.*union/i, /union.*pro.*2/i],
};

// The exact filename the installer writes for each model key (basename of the
// NODE_PACKS dest). Used as a fallback when the combo doesn't yet list the
// just-downloaded file — ComfyUI's controlnet folder scan is cached, so a fresh
// download isn't in ControlNetLoader's options until a rescan. We pre-seed this
// name so the loader selects the right model instead of falling back to a
// wrong one (e.g. an SDXL net loaded into a Flux graph). Keep in sync with
// node_install_api.py NODE_PACKS dests.
const CN_CANONICAL_FILE = {
  union: "xinsir-union-promax-sdxl.safetensors",
  tile: "xinsir-tile-sdxl.safetensors",
  mistoline: "mistoLine_rank256.safetensors",
  fluxunion: "flux-union-pro2.safetensors",
};

const CN_LABELS = {
  depth: "Depth", canny: "Canny", pose: "Pose", lineart: "Lineart",
  softedge: "Soft Edge", scribble: "Scribble", tile: "Tile", gray: "Gray",
  // Flux branches carry a "flux-" prefixed control type so their settings
  // sections + recommended markers don't collide with the SDXL defaults.
  "flux-depth": "Depth", "flux-canny": "Canny", "flux-pose": "Pose",
  "flux-softedge": "Soft Edge", "flux-gray": "Gray",
  "zimage-depth": "Depth", "zimage-canny": "Canny", "zimage-pose": "Pose",
  "zimage-softedge": "Soft Edge", "zimage-scribble": "Scribble", "zimage-gray": "Gray",
};

// Slider section for a ControlNet branch's ControlNetApplyAdvanced node.
// Reused per branch via a per-control-type `type` key so the existing
// section/range/recommended/save machinery isolates each control.
const CONTROLNET_APPLY_CONFIG = {
  label: "ControlNet",
  collapsible: true,
  widgets: {
    strength:      { type: "slider", min: 0, max: 2, step: 0.05 },
    end_percent:   { type: "slider", min: 0, max: 1, step: 0.01 },
    start_percent: { type: "slider", min: 0, max: 1, step: 0.01, collapsed: true },
  },
};

// Z-Image's ZImageFunControlnet exposes only a strength knob (it patches the
// model rather than applying timed conditioning, so there's no start/end).
const ZIMAGE_CN_CONFIG = {
  label: "ControlNet",
  collapsible: true,
  widgets: {
    strength: { type: "slider", min: 0, max: 2, step: 0.05 },
  },
};

// ── graph scanning ─────────────────────────────────────────────────

function findDownstreamNodes(pcNode) {
  const graph = pcNode.graph || app.graph; // honor off-screen graphs (upscale graft builds)
  if (!graph) return [];
  const found = [];
  const visited = new Set();
  const queue = [pcNode];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    for (const output of n.outputs || []) {
      if (!output.links?.length) continue;
      for (const lid of output.links) {
        const link = getLink(graph, lid);
        if (!link) continue;
        const target = graph.getNodeById(link.target_id);
        if (target) { found.push(target); queue.push(target); }
      }
    }
  }
  return found;
}

export function readWidgetValue(node, name) {
  return node.widgets?.find(w => w.name === name)?.value;
}

export function readWidgetOptions(node, name) {
  const opts = node.widgets?.find(w => w.name === name)?.options?.values || [];
  // RegionalDetailer's "mannequin heads" face source reads the Poser's exported
  // head boxes off the `pose` input; with nothing wired there it's a dead choice
  // (the node just falls back to YOLO), so hide it from the dropdown.
  if (name === "face_source") {
    const poseWired = node.inputs?.some(i => i.name === "pose" && i.link != null);
    if (!poseWired) return opts.filter(o => !/mannequin/i.test(o));
  }
  return opts;
}

export function writeWidgetValue(node, name, value) {
  const w = node.widgets?.find(w => w.name === name);
  if (!w) return;
  w.value = value;
  w.callback?.(value);
  // A model-patch injectable (Style Reference / PuLID) has a twin on the
  // RegionalDetailer's model line (the "face detail" leg), hidden from the panel
  // as a duplicate section. Mirror the sampler-section edit onto the leg so the
  // detailed face keeps the same style/identity strength as the base render.
  if (MODEL_PATCH_LEG_TYPES.has(node.comfyClass) && !feedsRegionalDetailerModel(app.graph, node)) {
    for (const other of app.graph?._nodes || []) {
      if (other === node || other.comfyClass !== node.comfyClass) continue;
      if (!feedsRegionalDetailerModel(app.graph, other)) continue;
      const ow = other.widgets?.find(x => x.name === name);
      if (ow) { ow.value = value; ow.callback?.(value); }
    }
  }
  app.graph?.setDirtyCanvas?.(true, true);
}

function findUpstreamByType(startNode, targetTypes) {
  const graph = startNode.graph || app.graph; // honor off-screen graphs (upscale graft builds)
  if (!graph) return null;
  const visited = new Set();
  const queue = [startNode];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    for (const input of n.inputs || []) {
      if (input.link == null) continue;
      const link = getLink(graph, input.link);
      if (!link) continue;
      const source = graph.getNodeById(link.origin_id);
      if (!source) continue;
      if (targetTypes.has(source.comfyClass)) return source;
      queue.push(source);
    }
  }
  return null;
}

// A ModelSamplingFlux belongs to a Krea 2 RAW graph when its model line traces up
// to a krea2_raw UNET. Keeps the resolution→shift mirror scoped to RAW (Turbo bakes
// a fixed mu; Flux owns its own shift), so only RAW's shift node is slaved.
function isKrea2RawShift(shiftNode) {
  const unet = findUpstreamByType(shiftNode, new Set(["UNETLoader"]));
  if (!unet) return false;
  const name = readWidgetValue(unet, "unet_name");
  return typeof name === "string" && /krea2_raw/i.test(name);
}

// The face-detail leg of a model-patch injectable (PuLID / Style Reference) is a
// second Apply node feeding the RegionalDetailer's couple-free model line. It's
// an implementation detail, not its own tunable — the settings panel shows one
// section for the sampler-line node, so detection skips the leg. In a regional
// graph the whole patch cluster is forward-reachable (the couple's model output
// is downstream), so without this both nodes would render duplicate sections.
const MODEL_PATCH_LEG_TYPES = new Set(["IPAdapterAdvanced", "ApplyPulidAdvanced", "ApplyPulid", "ApplyPulidFlux"]);

function feedsRegionalDetailerModel(graph, node) {
  for (const output of node.outputs || []) {
    for (const lid of output.links || []) {
      const link = getLink(graph, lid);
      if (!link) continue;
      const target = graph.getNodeById(link.target_id);
      if (target?.comfyClass !== "PromptChain_RegionalDetailer") continue;
      if (target.inputs?.[link.target_slot]?.name === "model") return true;
    }
  }
  return false;
}

const LOADER_TYPES = new Set([
  "CheckpointLoaderSimple", "CheckpointLoader",
  "UNETLoader", "DiffusersLoader",
]);

// Swap the upstream loader's model widget to `filename` in place.  Used
// for both manual version switching and post-download auto-apply — in
// the latter case the new file may not exist in the combo options yet
// (ComfyUI hasn't rescanned), but writeWidgetValue pushes the value
// through anyway and it matches once the server restarts.
function swapNodeCheckpointToFilename(pcNode, filename) {
  if (!filename) return false;
  const downstream = findDownstreamNodes(pcNode);
  const ksNode = downstream.find(n =>
    n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced"
  );
  if (!ksNode) return false;
  const loaderNode = findUpstreamByType(ksNode, LOADER_TYPES);
  if (!loaderNode) return false;
  for (const wName of MODEL_WIDGET_NAMES) {
    const w = loaderNode.widgets?.find(w => w.name === wName);
    if (!w) continue;
    // Pre-seed the combo option so the widget renders the new value
    // now — without this, freshly-downloaded filenames aren't in the
    // combo list until ComfyUI rescans on restart.
    if (w.options?.values && !w.options.values.includes(filename)) {
      w.options.values.push(filename);
    }
    writeWidgetValue(loaderNode, wName, filename);
    return true;
  }
  return false;
}

export function detectSupportedNodes(pcNode) {
  const downstream = findDownstreamNodes(pcNode);
  const detected = [];
  const deferred = [];
  const seenIds = new Set();
  let ksamplerNode = null;
  let fluxSamplerNode = null;
  let ideogramSamplerNode = null;

  for (const node of downstream) {
    if (seenIds.has(node.id)) continue;
    const cls = node.comfyClass || "";

    if (cls === "SamplerCustomAdvanced") {
      seenIds.add(node.id);
      fluxSamplerNode = node;
      continue;
    }

    // Ideogram samples through PromptChain_IdeogramSampler (a SamplerCustomAdvanced
    // drop-in). Reuse the Flux pivot machinery (latent/sampler/noise upstream walk)
    // and additionally walk the Ideogram-only tuning nodes below.
    if (cls === "PromptChain_IdeogramSampler") {
      seenIds.add(node.id);
      ideogramSamplerNode = node;
      fluxSamplerNode = node;
      continue;
    }

    // ControlNet branches: one deferred section per branch, keyed by control
    // type (depth/canny/…) so ranges + recommended don't collide when stacked.
    if (cls === "ControlNetApplyAdvanced") {
      seenIds.add(node.id);
      const ct = node.properties?.pcrControlType || "controlnet";
      deferred.push({
        node,
        config: { ...CONTROLNET_APPLY_CONFIG, label: `ControlNet — ${CN_LABELS[ct] || ct}` },
        type: `ControlNet:${ct}`,
      });
      continue;
    }


    if (SUPPORTED_NODES[cls]) {
      seenIds.add(node.id);
      // The detail-leg Apply node mirrors the sampler section; don't list it twice.
      if (MODEL_PATCH_LEG_TYPES.has(cls) && feedsRegionalDetailerModel(app.graph, node)) continue;
      const entry = { node, config: SUPPORTED_NODES[cls], type: cls };
      if (DEFERRED_NODES.has(cls)) { deferred.push(entry); }
      else { detected.push(entry); ksamplerNode = node; }
      continue;
    }
    for (const pattern of SAMPLER_INCLUDES) {
      // KSamplerSelect just PICKS a sampler (outputs SAMPLER); it's not a real
      // sampler pivot — exclude it so it never gets adopted as the latent anchor.
      if (cls.includes(pattern) && cls !== "KSamplerSelect") {
        seenIds.add(node.id);
        detected.push({ node, config: SUPPORTED_NODES.KSampler, type: cls });
        ksamplerNode = node;
        break;
      }
    }
  }

  if (fluxSamplerNode) {
    for (const cls of FLUX_NODE_TYPES) {
      const fluxNode = findUpstreamByType(fluxSamplerNode, new Set([cls]));
      if (fluxNode && !seenIds.has(fluxNode.id)) {
        seenIds.add(fluxNode.id);
        detected.push({ node: fluxNode, config: FLUX_NODES[cls], type: cls });
      }
    }
  }

  // Ideogram-only tuning nodes upstream of the Ideogram sampler (steps / guidance /
  // cfg-override). Resolution + sampler + noise are already picked up via the Flux
  // walk above and the latent walk below.
  if (ideogramSamplerNode) {
    for (const cls of IDEOGRAM_NODE_TYPES) {
      const n = findUpstreamByType(ideogramSamplerNode, new Set([cls]));
      if (n && !seenIds.has(n.id)) {
        seenIds.add(n.id);
        detected.push({ node: n, config: IDEOGRAM_NODES[cls], type: cls });
      }
    }
  }

  const pivotNode = ksamplerNode || fluxSamplerNode;
  if (pivotNode) {
    if (!fluxSamplerNode) {
      const clipNode = findUpstreamByType(pivotNode, CLIP_NODE_TYPES);
      if (clipNode && !seenIds.has(clipNode.id)) {
        const cls = clipNode.comfyClass;
        seenIds.add(clipNode.id);
        detected.push({ node: clipNode, config: CLIP_NODES[cls], type: cls });
      }
    }

    const latentNode = findUpstreamByType(pivotNode, LATENT_NODE_TYPES);
    if (latentNode && !seenIds.has(latentNode.id)) {
      const cls = latentNode.comfyClass;
      seenIds.add(latentNode.id);
      detected.push({ node: latentNode, config: LATENT_NODES[cls], type: cls });
    }

    // Krea 2 RAW's ModelSamplingFlux sets the resolution-dynamic flow-shift (mu),
    // whose width/height MUST track the render size. Detected only so the resolution
    // row can slave its width/height to the latent — mirrorOnly: no visible section
    // and never written into editors, so it is never baked back into the saved
    // config (the shift must stay dynamic). Gated to RAW (see isKrea2RawShift).
    const shiftNode = findUpstreamByType(pivotNode, new Set(["ModelSamplingFlux"]));
    if (shiftNode && !seenIds.has(shiftNode.id) && isKrea2RawShift(shiftNode)) {
      seenIds.add(shiftNode.id);
      detected.push({ node: shiftNode, config: { label: "Shift", widgets: {}, mirrorOnly: true }, type: "ModelSamplingFlux" });
    }

    const pulidTypes = new Set(["ApplyPulidAdvanced", "ApplyPulid", "ApplyPulidFlux", "ApplyPuLIDFlux2"]);
    const pulidNode = findUpstreamByType(pivotNode, pulidTypes);
    if (pulidNode && !seenIds.has(pulidNode.id)) {
      const cls = pulidNode.comfyClass;
      if (SUPPORTED_NODES[cls]) {
        seenIds.add(pulidNode.id);
        deferred.push({ node: pulidNode, config: SUPPORTED_NODES[cls], type: cls });
      }
    }

    const ipAdapterNode = findUpstreamByType(pivotNode, new Set(["IPAdapterAdvanced"]));
    if (ipAdapterNode && !seenIds.has(ipAdapterNode.id)) {
      seenIds.add(ipAdapterNode.id);
      deferred.push({ node: ipAdapterNode, config: SUPPORTED_NODES.IPAdapterAdvanced, type: "IPAdapterAdvanced" });
    }

    // Z-Image ControlNet patches the model, so its nodes sit on the model line
    // upstream of the sampler (not downstream of the PromptChain node). Walk the
    // model-input chain, one settings section per stacked branch.
    const zGraph = app.graph;
    let mNode = pivotNode;
    while (mNode) {
      const mIn = mNode.inputs?.find(i => i.name === "model");
      if (mIn?.link == null) break;
      const mLink = getLink(zGraph, mIn.link);
      const src = mLink ? zGraph.getNodeById(mLink.origin_id) : null;
      if (src?.comfyClass === "ZImageFunControlnet" && !seenIds.has(src.id)) {
        seenIds.add(src.id);
        const ct = src.properties?.pcrControlType || "controlnet";
        deferred.push({
          node: src,
          config: { ...ZIMAGE_CN_CONFIG, label: `ControlNet — ${CN_LABELS[ct] || ct}` },
          type: `ControlNet:${ct}`,
        });
        mNode = src;
      } else {
        break;
      }
    }
  }

  detected.push(...deferred);
  return detected;
}

// ── node injection ────────────────────────────────────────────────

// Override an inject's internal-sampler defaults to match the architecture's
// native sampler — the shared SDXL-oriented defaults (cfg 5, dpmpp_2m_sde/
// karras) burn or artifact on distilled archs. Values mirror PromptChain's own
// t2i templates: Flux = euler/simple at cfg 1 (guidance-distilled, no real
// negative); Z-Image Turbo = res_multistep/beta at cfg 1.3 / ~8 steps. Mutates
// DEFAULTS in place; SDXL/SD1.5 keep their curated values.
function applyArchSamplerDefaults(defaults, architecture, family) {
  const arch = architecture || "";
  if (arch === "flux" || arch === "flux2") {
    defaults.cfg = 1.0;
    defaults.sampler_name = "euler";
    defaults.scheduler = "simple";
  } else if (arch === "zimage") {
    // Sampler is FAMILY-AWARE: res_multistep is Turbo's deterministic few-step sampler;
    // on non-distilled BASE it sterilizes skin (no micro-texture). Base wants a
    // stochastic sampler (dpmpp_sde) for realistic skin; Turbo keeps res_multistep.
    defaults.scheduler = "beta";
    if (family === "zimage_base") {
      defaults.sampler_name = "dpmpp_sde";
      defaults.cfg = 3.0;
      // Non-distilled: a low-denoise tile pass resolves the truncated tail cleanly.
      if ("denoise" in defaults) defaults.denoise = 0.15;
    } else {
      defaults.sampler_name = "res_multistep";
      defaults.cfg = 1.3;
      if ("steps" in defaults) defaults.steps = 8;
      // Distilled: at low denoise ComfyUI runs only the schedule's low-σ tail, which
      // the few-step field never resolves -> blotchy skin. 0.7 re-enters its trained
      // high-σ regime where tiles come out clean (heavier repaint is the trade).
      if ("denoise" in defaults) defaults.denoise = 0.7;
    }
  } else if (arch === "krea2") {
    // Krea 2 Turbo: distilled 8-step, guidance baked (cfg 1), euler/simple. Qwen-family
    // is quant/prompt-sensitive, so a tile re-render wants a higher denoise floor than
    // Z-Image-Base to avoid underbaking the few-step tail (GPU-tunable).
    defaults.cfg = 1.0;
    defaults.sampler_name = "euler";
    defaults.scheduler = "simple";
    if ("steps" in defaults) defaults.steps = 8;
    if ("denoise" in defaults) defaults.denoise = 0.45;
  }
}

const PULID_APPLY_TYPES = new Set(["ApplyPulidAdvanced", "ApplyPulid"]);

function tracePulidApplySources(graph, applyNode) {
  const sources = {};
  for (const name of ["pulid", "eva_clip", "face_analysis", "image"]) {
    const input = applyNode.inputs?.find(i => i.name === name);
    if (!input?.link) return null;
    const link = getLink(graph, input.link);
    const node = link && graph.getNodeById(link.origin_id);
    if (!node) return null;
    sources[name] = { node, slot: link.origin_slot };
  }
  return sources;
}

// The RegionalDetailer re-denoises exactly the faces PuLID anchors, so it needs
// its own identity patch — but the sampler-line ApplyPulid sits AFTER the
// Attention Couple, whose region-mask patch is wrong for single-face crops
// (the reason the detailer takes the couple-free base model). So: a second
// ApplyPulidAdvanced spliced onto the detailer's own model line, sharing the
// sampler cluster's loaders + face reference image.
function splicePulidOnDetailerModelLine(graph, LG, detailNode, sources, widgetValues) {
  const modelIdx = detailNode.inputs?.findIndex(i => i.name === "model");
  if (modelIdx == null || modelIdx < 0) return false;
  const modelInput = detailNode.inputs[modelIdx];
  if (!modelInput?.link) return false;
  const modelLink = getLink(graph, modelInput.link);
  if (!modelLink) return false;
  const modelSource = graph.getNodeById(modelLink.origin_id);
  if (!modelSource) return false;
  if (PULID_APPLY_TYPES.has(modelSource.comfyClass)) return false;
  const originSlot = modelLink.origin_slot;

  const applyPulid = LG.createNode("ApplyPulidAdvanced");
  if (!applyPulid) return false;
  applyPulid.pos = [detailNode.pos[0] - 330, detailNode.pos[1]];
  graph.add(applyPulid);
  applyPulid.title = "Apply PuLID (face detail)";

  for (const w of applyPulid.widgets || []) {
    if (w.name in widgetValues && widgetValues[w.name] != null) {
      w.value = widgetValues[w.name];
      w.callback?.(widgetValues[w.name]);
    }
  }

  detailNode.disconnectInput(modelIdx);
  modelSource.connect(originSlot, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "model") ?? 0);
  sources.pulid.node.connect(sources.pulid.slot, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "pulid") ?? 1);
  sources.eva_clip.node.connect(sources.eva_clip.slot, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "eva_clip") ?? 2);
  sources.face_analysis.node.connect(sources.face_analysis.slot, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "face_analysis") ?? 3);
  sources.image.node.connect(sources.image.slot, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "image") ?? 4);
  applyPulid.connect(0, detailNode, modelIdx);
  return true;
}

function injectPuLID(pcNode) {
  const graph = app.graph;
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;

  const downstream = findDownstreamNodes(pcNode);
  const fdNode = downstream.find(n => n.comfyClass === "FaceDetailer");
  const ksNode = downstream.find(n =>
    n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced"
  );
  const targetNode = fdNode || ksNode;
  if (!targetNode) return false;

  const modelInput = targetNode.inputs?.find(i => i.name === "model");
  if (!modelInput?.link) return false;
  const modelLink = getLink(graph, modelInput.link);
  if (!modelLink) return false;
  const sourceNode = graph.getNodeById(modelLink.origin_id);
  if (!sourceNode) return false;

  if (sourceNode.comfyClass === "ApplyPulidAdvanced" || sourceNode.comfyClass === "ApplyPulid") return false;

  const pulidLoader = LG.createNode("PulidModelLoader");
  const insightFace = LG.createNode("PulidInsightFaceLoader");
  const evaClip = LG.createNode("PulidEvaClipLoader");
  const loadImage = LG.createNode("LoadImage");
  const applyPulid = LG.createNode("ApplyPulidAdvanced");
  if (!pulidLoader || !insightFace || !evaClip || !loadImage || !applyPulid) return false;

  const baseX = pcNode.pos[0];
  const baseY = pcNode.pos[1];

  loadImage.pos = [baseX + 840, baseY + 665];
  pulidLoader.pos = [baseX + 1178, baseY + 671];
  insightFace.pos = [baseX + 1178, baseY + 801];
  evaClip.pos = [baseX + 1178, baseY + 931];
  applyPulid.pos = [baseX + 1508, baseY + 666];

  graph.add(pulidLoader);
  graph.add(insightFace);
  graph.add(evaClip);
  graph.add(loadImage);
  graph.add(applyPulid);

  loadImage.title = "Face Reference Image";

  for (const w of insightFace.widgets || []) {
    if (w.name === "provider") { w.value = "CUDA"; w.callback?.("CUDA"); break; }
  }

  // Prefer the SDXL PuLID weights (what the installer fetches and what these
  // SDXL graphs need) rather than leaning on the combo's default ordering —
  // a stray Flux weight would otherwise win and produce a dead node.
  for (const w of pulidLoader.widgets || []) {
    if (w.name === "pulid_file" || w.name === "model_name") {
      const opts = w.options?.values || [];
      const val =
        opts.find(o => /sdxl/i.test(o)) ||
        opts.find(o => /pulid/i.test(o)) ||
        opts[0];
      if (val) { w.value = val; w.callback?.(val); }
      break;
    }
  }

  const pulidDefaults = { weight: 0.45, projection: "ortho_v2", fidelity: 4, noise: 0, start_at: 0, end_at: 1 };
  for (const w of applyPulid.widgets || []) {
    if (w.name in pulidDefaults) { w.value = pulidDefaults[w.name]; w.callback?.(pulidDefaults[w.name]); }
  }

  const modelInputIdx = targetNode.inputs?.findIndex(i => i.name === "model") ?? 0;
  targetNode.disconnectInput(modelInputIdx);

  const sourceModelSlot = sourceNode.outputs?.findIndex(o => o.type === "MODEL") ?? 0;
  const apModelIdx = applyPulid.inputs?.findIndex(i => i.name === "model") ?? 0;
  sourceNode.connect(sourceModelSlot, applyPulid, apModelIdx);

  pulidLoader.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "pulid") ?? 1);
  evaClip.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "eva_clip") ?? 2);
  insightFace.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "face_analysis") ?? 3);
  loadImage.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "image") ?? 4);
  applyPulid.connect(0, targetNode, modelInputIdx);

  // Regional: the RegionalDetailer runs on the couple-free base model, so the
  // sampler-line splice never reaches it — it needs its OWN patch or the face
  // re-pass paints the PuLID identity right back out. Non-regional: it can share
  // the sampler's patched model — branch this node's output, no second node.
  const detailNode = downstream.find(n => n.comfyClass === "PromptChain_RegionalDetailer");
  if (detailNode) {
    const hasCouple = downstream.some(n => n.comfyClass === "PromptChain_AttentionCouple");
    if (hasCouple) {
      splicePulidOnDetailerModelLine(graph, LG, detailNode, {
        pulid: { node: pulidLoader, slot: 0 },
        eva_clip: { node: evaClip, slot: 0 },
        face_analysis: { node: insightFace, slot: 0 },
        image: { node: loadImage, slot: 0 },
      }, pulidDefaults);
    } else {
      const mIdx = detailNode.inputs?.findIndex(i => i.name === "model");
      if (mIdx != null && mIdx >= 0) { detailNode.disconnectInput(mIdx); applyPulid.connect(0, detailNode, mIdx); }
    }
  }

  graph.setDirtyCanvas(true, true);
  return true;
}

// IPAdapter style transfer ("Style Reference", cubiq's ComfyUI_IPAdapter_plus).
// The UnifiedLoader bundles the ipadapter weights + CLIP-Vision encoder into
// one IPADAPTER pipe; IPAdapterAdvanced with weight_type "style transfer"
// injects only the style-carrying attention layers of the reference image —
// look without composition/content. Same model-line splice as PuLID, and the
// same RegionalDetailer leg so the face re-pass keeps the style.
// weight/end_at 0.7: full weight over the whole denoise washes out contrast
// (style layers pushed the entire way); 0.7 + early stop lets the model finish
// clean. README's own advice is weight <= 0.8.
const STYLE_REF_DEFAULTS = { weight: 0.7, weight_type: "style transfer", combine_embeds: "concat", start_at: 0, end_at: 0.7, embeds_scaling: "V only" };

function spliceStyleOnDetailerModelLine(graph, LG, detailNode, sources, widgetValues) {
  const modelIdx = detailNode.inputs?.findIndex(i => i.name === "model");
  if (modelIdx == null || modelIdx < 0) return false;
  const modelInput = detailNode.inputs[modelIdx];
  if (!modelInput?.link) return false;
  const modelLink = getLink(graph, modelInput.link);
  if (!modelLink) return false;
  const modelSource = graph.getNodeById(modelLink.origin_id);
  if (!modelSource) return false;
  if (modelSource.comfyClass === "IPAdapterAdvanced") return false;
  const originSlot = modelLink.origin_slot;

  const ipAdapter = LG.createNode("IPAdapterAdvanced");
  if (!ipAdapter) return false;
  ipAdapter.pos = [detailNode.pos[0] - 330, detailNode.pos[1] + 360];
  graph.add(ipAdapter);
  ipAdapter.title = "Style Reference (face detail)";

  for (const w of ipAdapter.widgets || []) {
    if (w.name in widgetValues && widgetValues[w.name] != null) {
      w.value = widgetValues[w.name];
      w.callback?.(widgetValues[w.name]);
    }
  }

  detailNode.disconnectInput(modelIdx);
  modelSource.connect(originSlot, ipAdapter, ipAdapter.inputs?.findIndex(i => i.name === "model") ?? 0);
  sources.ipadapter.node.connect(sources.ipadapter.slot, ipAdapter, ipAdapter.inputs?.findIndex(i => i.name === "ipadapter") ?? 1);
  sources.image.node.connect(sources.image.slot, ipAdapter, ipAdapter.inputs?.findIndex(i => i.name === "image") ?? 2);
  ipAdapter.connect(0, detailNode, modelIdx);
  return true;
}

function injectStyleReference(pcNode) {
  const graph = app.graph;
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;

  const downstream = findDownstreamNodes(pcNode);
  const ksNode = downstream.find(n =>
    n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced"
  );
  if (!ksNode) return false;

  const modelInput = ksNode.inputs?.find(i => i.name === "model");
  if (!modelInput?.link) return false;
  const modelLink = getLink(graph, modelInput.link);
  if (!modelLink) return false;
  const sourceNode = graph.getNodeById(modelLink.origin_id);
  if (!sourceNode) return false;
  if (sourceNode.comfyClass === "IPAdapterAdvanced") return false;

  const unifiedLoader = LG.createNode("IPAdapterUnifiedLoader");
  const loadImage = LG.createNode("LoadImage");
  const ipAdapter = LG.createNode("IPAdapterAdvanced");
  if (!unifiedLoader || !loadImage || !ipAdapter) return false;

  // Below the PuLID cluster's slots (baseY+665..931) so both fit side by side.
  const baseX = pcNode.pos[0];
  const baseY = pcNode.pos[1];
  loadImage.pos = [baseX + 840, baseY + 1090];
  unifiedLoader.pos = [baseX + 1178, baseY + 1096];
  ipAdapter.pos = [baseX + 1508, baseY + 1090];

  graph.add(unifiedLoader);
  graph.add(loadImage);
  graph.add(ipAdapter);

  loadImage.title = "Style Reference Image";

  // PLUS = the high-strength vit-h adapter the installer fetches.
  for (const w of unifiedLoader.widgets || []) {
    if (w.name === "preset") { w.value = "PLUS (high strength)"; w.callback?.(w.value); break; }
  }
  for (const w of ipAdapter.widgets || []) {
    if (w.name in STYLE_REF_DEFAULTS) { w.value = STYLE_REF_DEFAULTS[w.name]; w.callback?.(STYLE_REF_DEFAULTS[w.name]); }
  }

  const modelInputIdx = ksNode.inputs?.findIndex(i => i.name === "model") ?? 0;
  ksNode.disconnectInput(modelInputIdx);

  // The UnifiedLoader inspects the model to pick matching weights, then passes
  // it through — source → loader → IPAdapterAdvanced → sampler.
  sourceNode.connect(modelLink.origin_slot, unifiedLoader, unifiedLoader.inputs?.findIndex(i => i.name === "model") ?? 0);
  const loaderModelOut = unifiedLoader.outputs?.findIndex(o => o.type === "MODEL") ?? 0;
  const loaderIpaOut = unifiedLoader.outputs?.findIndex(o => o.type === "IPADAPTER") ?? 1;
  unifiedLoader.connect(loaderModelOut, ipAdapter, ipAdapter.inputs?.findIndex(i => i.name === "model") ?? 0);
  unifiedLoader.connect(loaderIpaOut, ipAdapter, ipAdapter.inputs?.findIndex(i => i.name === "ipadapter") ?? 1);
  loadImage.connect(0, ipAdapter, ipAdapter.inputs?.findIndex(i => i.name === "image") ?? 2);
  ipAdapter.connect(0, ksNode, modelInputIdx);

  const detailNode = downstream.find(n => n.comfyClass === "PromptChain_RegionalDetailer");
  if (detailNode) {
    // Regional: the detailer runs on the couple-free base model, so it needs its
    // OWN IPAdapter on that line. Non-regional: the detailer can share the
    // sampler's patched model — branch this node's output, no second node.
    const hasCouple = downstream.some(n => n.comfyClass === "PromptChain_AttentionCouple");
    if (hasCouple) {
      spliceStyleOnDetailerModelLine(graph, LG, detailNode, {
        ipadapter: { node: unifiedLoader, slot: loaderIpaOut },
        image: { node: loadImage, slot: 0 },
      }, STYLE_REF_DEFAULTS);
    } else {
      const mIdx = detailNode.inputs?.findIndex(i => i.name === "model");
      if (mIdx != null && mIdx >= 0) { detailNode.disconnectInput(mIdx); ipAdapter.connect(0, detailNode, mIdx); }
    }
  }

  graph.setDirtyCanvas(true, true);
  return true;
}

// Flux PuLID (balazik nodes). Same model-line splice as injectPuLID but with the
// PulidFlux* loaders + ApplyPulidFlux, which patches the Flux MODEL between the
// diffusion-model loader and the sampler. Schema verified against the repo.
function injectPuLIDFlux(pcNode) {
  const graph = app.graph;
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;

  const downstream = findDownstreamNodes(pcNode);
  const fdNode = downstream.find(n => n.comfyClass === "FaceDetailer");
  const ksNode = downstream.find(n =>
    n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced"
  );
  const targetNode = fdNode || ksNode;
  if (!targetNode) return false;

  const modelInput = targetNode.inputs?.find(i => i.name === "model");
  if (!modelInput?.link) return false;
  const modelLink = getLink(graph, modelInput.link);
  if (!modelLink) return false;
  const sourceNode = graph.getNodeById(modelLink.origin_id);
  if (!sourceNode) return false;
  if (sourceNode.comfyClass === "ApplyPulidFlux") return false;

  const pulidLoader = LG.createNode("PulidFluxModelLoader");
  const insightFace = LG.createNode("PulidFluxInsightFaceLoader");
  const evaClip = LG.createNode("PulidFluxEvaClipLoader");
  const loadImage = LG.createNode("LoadImage");
  const applyPulid = LG.createNode("ApplyPulidFlux");
  // The lldacing fork needs Patches_ll's FluxForwardOverrider on the model line
  // (after ApplyPulidFlux) — it installs the **kwargs forward override that
  // tolerates current ComfyUI's timestep_zero_index arg. Without it the sampler
  // throws "forward_orig() got an unexpected keyword argument".
  const fwdOverride = LG.createNode("FluxForwardOverrider");
  if (!pulidLoader || !insightFace || !evaClip || !loadImage || !applyPulid || !fwdOverride) return false;

  // Layout matches the hand-arranged flux-dev-controlnet-pulid workflow: cluster
  // sits to the LEFT of the PromptChain node — face image far left, the three
  // loaders + the forward overrider stacked in a middle column, ApplyPulidFlux
  // nearest the node.
  const baseX = pcNode.pos[0];
  const baseY = pcNode.pos[1];
  loadImage.pos   = [baseX - 990, baseY + 8];
  pulidLoader.pos = [baseX - 650, baseY + 8];
  insightFace.pos = [baseX - 650, baseY + 138];
  evaClip.pos     = [baseX - 650, baseY + 278];
  fwdOverride.pos = [baseX - 650, baseY + 388];
  applyPulid.pos  = [baseX - 320, baseY + 8];

  graph.add(pulidLoader);
  graph.add(insightFace);
  graph.add(evaClip);
  graph.add(loadImage);
  graph.add(applyPulid);
  graph.add(fwdOverride);
  // Sizes set after add (litegraph size setter needs a registered node).
  loadImage.size = [283, 340];
  pulidLoader.size = [270, 82];
  insightFace.size = [298, 82];
  evaClip.size = [225, 48];
  applyPulid.size = [270, 288];
  fwdOverride.size = [225, 48];

  loadImage.title = "Face Reference Image";

  for (const w of insightFace.widgets || []) {
    if (w.name === "provider") { w.value = "CUDA"; w.callback?.("CUDA"); break; }
  }

  // PulidFluxModelLoader combo reads models/pulid. Prefer a flux pulid file;
  // else pre-seed the installer's filename (the freshly-downloaded weight may
  // not be in the combo yet — same rescan lag as the ControlNet loader).
  for (const w of pulidLoader.widgets || []) {
    if (w.name === "pulid_file") {
      const opts = w.options?.values || [];
      let val = opts.find(o => /flux/i.test(o)) || opts.find(o => /pulid/i.test(o));
      if (!val) {
        val = "pulid_flux_v0.9.1.safetensors";
        if (w.options?.values && !w.options.values.includes(val)) w.options.values.push(val);
      }
      if (val) { w.value = val; w.callback?.(val); }
      break;
    }
  }

  const pulidDefaults = { weight: 1.0, start_at: 0, end_at: 1 };
  for (const w of applyPulid.widgets || []) {
    if (w.name in pulidDefaults) { w.value = pulidDefaults[w.name]; w.callback?.(pulidDefaults[w.name]); }
  }

  const modelInputIdx = targetNode.inputs?.findIndex(i => i.name === "model") ?? 0;
  targetNode.disconnectInput(modelInputIdx);

  const sourceModelSlot = sourceNode.outputs?.findIndex(o => o.type === "MODEL") ?? 0;
  sourceNode.connect(sourceModelSlot, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "model") ?? 0);
  pulidLoader.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "pulid_flux") ?? 1);
  evaClip.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "eva_clip") ?? 2);
  insightFace.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "face_analysis") ?? 3);
  loadImage.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "image") ?? 4);
  // Model line: source → ApplyPulidFlux → FluxForwardOverrider → sampler.
  applyPulid.connect(0, fwdOverride, fwdOverride.inputs?.findIndex(i => i.name === "model") ?? 0);
  fwdOverride.connect(0, targetNode, modelInputIdx);

  graph.setDirtyCanvas(true, true);
  return true;
}

// Flux.2 PuLID (iFayens ComfyUI-PuLID-Flux2). Same model-line splice as
// injectPuLIDFlux, but the patch is standalone (no FluxForwardOverrider) and
// Flux.2 graphs sample via SamplerCustomAdvanced, so the model input to splice
// lives on the guider (CFGGuider on base templates, BasicGuider on distilled).
function injectPuLIDFlux2(pcNode) {
  const graph = app.graph;
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;

  const downstream = findDownstreamNodes(pcNode);
  const targetNode = downstream.find(n =>
    n.comfyClass === "CFGGuider" || n.comfyClass === "BasicGuider"
  ) || downstream.find(n =>
    n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced"
  );
  if (!targetNode) return false;

  const modelInput = targetNode.inputs?.find(i => i.name === "model");
  if (!modelInput?.link) return false;
  const modelLink = getLink(graph, modelInput.link);
  if (!modelLink) return false;
  const sourceNode = graph.getNodeById(modelLink.origin_id);
  if (!sourceNode) return false;
  if (sourceNode.comfyClass === "ApplyPuLIDFlux2") return false;

  const pulidLoader = LG.createNode("PuLIDModelLoader");
  const insightFace = LG.createNode("PuLIDInsightFaceLoader");
  const evaClip = LG.createNode("PuLIDEVACLIPLoader");
  const loadImage = LG.createNode("LoadImage");
  const applyPulid = LG.createNode("ApplyPuLIDFlux2");
  if (!pulidLoader || !insightFace || !evaClip || !loadImage || !applyPulid) return false;

  const baseX = pcNode.pos[0];
  const baseY = pcNode.pos[1];
  loadImage.pos   = [baseX - 990, baseY + 8];
  pulidLoader.pos = [baseX - 650, baseY + 8];
  insightFace.pos = [baseX - 650, baseY + 138];
  evaClip.pos     = [baseX - 650, baseY + 278];
  applyPulid.pos  = [baseX - 320, baseY + 8];

  graph.add(pulidLoader);
  graph.add(insightFace);
  graph.add(evaClip);
  graph.add(loadImage);
  graph.add(applyPulid);
  loadImage.size = [283, 340];
  pulidLoader.size = [270, 82];
  insightFace.size = [298, 82];
  evaClip.size = [225, 48];
  applyPulid.size = [270, 220];

  loadImage.title = "Face Reference Image";

  for (const w of insightFace.widgets || []) {
    if (w.name === "provider") { w.value = "CUDA"; w.callback?.("CUDA"); break; }
  }

  // PuLIDModelLoader combo reads models/pulid. Only a flux2-trained file is
  // valid — the loader hard-crashes on Flux.1 pulid_flux_v0.9.1 (no id_former
  // keys), so never fall back to a generic /pulid/ match. Pre-seed the
  // installer's filename when the fresh download isn't in the combo yet.
  for (const w of pulidLoader.widgets || []) {
    if (w.name === "pulid_file") {
      const opts = w.options?.values || [];
      let val = opts.find(o => /flux2/i.test(o));
      if (!val) {
        val = "pulid_flux2_klein_v2.safetensors";
        if (w.options?.values && !w.options.values.includes(val)) w.options.values.push(val);
      }
      w.value = val;
      w.callback?.(val);
      break;
    }
  }

  // The native weights are calibrated on the 4-step distilled model (author
  // ships strength 1.3). On base (CFGGuider, full step counts) the per-block
  // correction applies every step and burns — the repo's issue-#11 heuristic
  // scales strength by the step ratio, ≈0.3 at 20-30 steps.
  const isBase = targetNode.comfyClass === "CFGGuider";
  const pulidDefaults = { strength: isBase ? 0.3 : 1.3 };
  for (const w of applyPulid.widgets || []) {
    if (w.name in pulidDefaults) { w.value = pulidDefaults[w.name]; w.callback?.(pulidDefaults[w.name]); }
  }

  const modelInputIdx = targetNode.inputs?.findIndex(i => i.name === "model") ?? 0;
  targetNode.disconnectInput(modelInputIdx);

  const sourceModelSlot = sourceNode.outputs?.findIndex(o => o.type === "MODEL") ?? 0;
  sourceNode.connect(sourceModelSlot, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "model") ?? 0);
  pulidLoader.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "pulid_model") ?? 1);
  evaClip.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "eva_clip") ?? 2);
  insightFace.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "face_analysis") ?? 3);
  loadImage.connect(0, applyPulid, applyPulid.inputs?.findIndex(i => i.name === "image") ?? 4);
  applyPulid.connect(0, targetNode, modelInputIdx);

  graph.setDirtyCanvas(true, true);
  return true;
}

// opts.regional === false skips the regional-conditioning branch even when an
// Attention Couple is present — the viewer's upscale modal uses it for the
// "prompt only" / "prompt + depth" modes on regional workflows.
export function injectUpscaler(pcNode, modelConfig, opts = {}) {
  const graph = pcNode.graph || app.graph; // honor off-screen graphs (upscale graft builds)
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;

  const downstream = findDownstreamNodes(pcNode);
  // Upscale the most-finished image: after the face-detail pass when one
  // exists (regional or classic), else straight off the decode.
  const detailNode = downstream.find(n => n.comfyClass === "PromptChain_RegionalDetailer")
    || downstream.find(n => n.comfyClass === "FaceDetailer");
  const vaeDecodeNode = downstream.find(n => n.comfyClass === "VAEDecode"
    || n.comfyClass === "VAEUtils_VAEDecodeTiled" || n.comfyClass === "VAEDecodeTiled");
  const imageSource = detailNode || vaeDecodeNode;
  if (!imageSource) {
    console.warn(`[PromptChain][graft] FAIL: no decode/detail image source. downstream=[${downstream.map((n) => n.comfyClass).join(",")}]`);
    return false;
  }

  // Sampler anchor: classic KSampler graphs, or the Flux 2 split where
  // SamplerCustomAdvanced samples and a guider (CFGGuider on Klein base,
  // BasicGuider on guidance-distilled Dev) carries model + conditioning.
  const ksNode = downstream.find(n =>
    n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced"
  );
  const customSampler = ksNode ? null
    : downstream.find(n => n.comfyClass === "SamplerCustomAdvanced");
  if (!ksNode && !customSampler) return false;

  // Keep the origin SLOT, not just the node: in depth/regional graphs the
  // sampler's positive AND negative both come from one ControlNetApplyAdvanced
  // (outputs 0 and 1) — connecting from a hardcoded slot 0 fed the POSITIVE
  // conditioning into the upscaler's negative.
  const traceInput = (node, inputName) => {
    const input = node.inputs?.find(i => i.name === inputName);
    if (!input?.link) return null;
    const link = getLink(graph, input.link);
    const origin = link && graph.getNodeById(link.origin_id);
    return origin ? { node: origin, slot: link.origin_slot } : null;
  };

  const samplerNode = ksNode || customSampler;
  const guiderNode = ksNode ? null : traceInput(customSampler, "guider")?.node;
  if (!ksNode && !guiderNode) return false;
  const condAnchor = guiderNode || ksNode;

  // USDU can't digest ReferenceLatent conditioning (ssitu#163) — when a
  // reference chain feeds the guider, tap the raw text encode beneath it (and
  // beneath any FluxGuidance wrapper; the model falls back to its default
  // guidance embed). Reference-free conditioning passes through untouched.
  const pastReferenceLatents = (src) => {
    let probe = src, sawReference = false;
    while (probe?.node && (probe.node.comfyClass === "ReferenceLatent" || probe.node.comfyClass === "FluxGuidance")) {
      if (probe.node.comfyClass === "ReferenceLatent") sawReference = true;
      probe = traceInput(probe.node, "conditioning");
    }
    return sawReference ? probe : src;
  };

  const isBasicGuider = guiderNode?.comfyClass === "BasicGuider";
  const positiveSource = pastReferenceLatents(
    traceInput(condAnchor, isBasicGuider ? "conditioning" : "positive")
  );
  // BasicGuider has no negative branch — a zeroed-out positive stands in
  // when wiring below (inert at the distilled cfg 1.0 default anyway).
  const negativeSource = isBasicGuider ? null
    : pastReferenceLatents(traceInput(condAnchor, "negative"));

  let ckptNode = null;
  for (const n of downstream) {
    if (n.comfyClass === "CheckpointLoaderSimple" || n.comfyClass === "CheckpointLoader") {
      ckptNode = n; break;
    }
  }
  if (!ckptNode) {
    const modelSource = traceInput(condAnchor, "model")?.node;
    if (modelSource) {
      const visited = new Set();
      const queue = [modelSource];
      while (queue.length) {
        const n = queue.shift();
        if (visited.has(n.id)) continue;
        visited.add(n.id);
        if (n.comfyClass === "CheckpointLoaderSimple" || n.comfyClass === "CheckpointLoader") {
          ckptNode = n; break;
        }
        for (const inp of n.inputs || []) {
          if (inp.link == null) continue;
          const lnk = getLink(graph, inp.link);
          if (lnk) { const src = graph.getNodeById(lnk.origin_id); if (src) queue.push(src); }
        }
      }
    }
  }

  let splitModelNode = null, splitVaeNode = null;
  if (!ckptNode) {
    let ms = traceInput(condAnchor, "model")?.node;
    // Trace past PuLID AND the pose-control / regional-couple model patches: the
    // tile pass must re-detail through the CLEAN model. Leaving ZImageFunControlnet
    // in re-applies the source's full-frame pose DEPTH to every tile, baking the
    // mannequin silhouette into the upscale; the couple re-applies full-canvas
    // regional masks that are wrong per-tile. (SDXL avoids this by finding its
    // CheckpointLoader above; Z-Image's UNETLoader chain has no such anchor.) Stop
    // at ModelSamplingAuraFlow — Z-Image still needs its sigma shift.
    const STRIP_FOR_TILE = new Set(["ApplyPulidAdvanced", "ApplyPulid", "ApplyPuLIDFlux2",
      "ZImageFunControlnet", "PromptChain_ZImageRegionalCouple", "PromptChain_AttentionCouple"]);
    while (ms && STRIP_FOR_TILE.has(ms.comfyClass)) {
      ms = traceInput(ms, "model")?.node;
    }
    splitModelNode = ms;
    splitVaeNode = findUpstreamByType(vaeDecodeNode, new Set(["VAELoader"]));
    if (!splitVaeNode) {
      // The source decodes through a custom/tiled VAE (e.g. the spacepxl
      // VAEUtils decoder on High-Detail krea2 renders) whose 2x/12-ch output
      // can't drive USDU's encode->sample->decode tiling. Graft a fresh stock
      // VAELoader on the shared krea2/qwen latent — prefer the clean wan_2.1_vae
      // (no grid artifact), else qwen_image_vae, else whatever is installed.
      const freshVae = LG.createNode("VAELoader");
      const vaeW = freshVae?.widgets?.find(w => w.name === "vae_name");
      const vaeOpts = vaeW?.options?.values || [];
      const pick = vaeOpts.find(o => /wan.*2[._]?1.*vae/i.test(o) && !/upscale|2x/i.test(o))
        || vaeOpts.find(o => /qwen.*image.*vae/i.test(o)) || vaeOpts[0];
      if (freshVae && vaeW && pick) {
        vaeW.value = pick; vaeW.callback?.(pick);
        freshVae.pos = [vaeDecodeNode.pos[0], vaeDecodeNode.pos[1] + 220];
        graph.add(freshVae);
        splitVaeNode = freshVae;
      }
    }
  }

  const loaderNode = LG.createNode("UpscaleModelLoader");
  const upscaleNode = LG.createNode("UltimateSDUpscale");
  if (!loaderNode || !upscaleNode) return false;

  // The save node the upscaler sits beside (and inherits the prefix from):
  // whatever consumes the image we're upscaling, falling back to the decode's.
  let anchorSave = null;
  for (const src of [imageSource, vaeDecodeNode]) {
    if (anchorSave || !src) continue;
    for (const lid of src.outputs?.[0]?.links || []) {
      const link = getLink(graph, lid);
      if (!link) continue;
      const target = graph.getNodeById(link.target_id);
      if (target?.comfyClass === "SaveImage" || target?.comfyClass === "PreviewImage") {
        anchorSave = target; break;
      }
    }
  }

  const anchor = anchorSave || imageSource;
  const anchorX = anchor.pos[0];
  const anchorY = anchor.pos[1];

  upscaleNode.pos = [anchorX + 384, anchorY];
  loaderNode.pos  = [anchorX + 716, anchorY];

  graph.add(loaderNode);
  graph.add(upscaleNode);

  // Flux 2 tile-model pin (viewer grafts only, via opts.pinFlux2TileModel):
  // non-Klein flux2 sources re-render their tiles on Klein 9B base instead of
  // the source model — nobody tiles through the 32B Dev (every tile is a full
  // render through a streamed 22 GB model), and cross-model refine is the
  // family's established practice. Dev and Klein use DIFFERENT text encoders
  // (Mistral vs Qwen3-8B) whose embeddings are not interchangeable, so the pin
  // must also retarget the CLIPLoader feeding the upscaler's encodes — which
  // is only safe on an off-screen graph whose gen path gets pruned afterward,
  // never on a live Add-menu graph. Both picks come from the install's combos;
  // if either the Klein UNET or the Qwen encoder is missing, the whole pin is
  // abandoned (a mismatched TE+UNET pair is worse than a slow source model).
  let pinnedModelNode = null;
  if (opts.pinFlux2TileModel && modelConfig?.architecture === "flux2" && modelConfig?.family !== "flux2_klein") {
    const pickFromCombo = (widget, patterns) => {
      const values = widget?.options?.values || [];
      for (const re of patterns) {
        const hit = values.find(v => re.test(v));
        if (hit) return hit;
      }
      return null;
    };
    const unetPin = LG.createNode("UNETLoader");
    const unetW = unetPin?.widgets?.find(w => w.name === "unet_name");
    const kleinFile = pickFromCombo(unetW, [/klein.*base.*9b|klein.*9b.*base/i, /klein.*9b/i, /klein/i]);
    const clipLoader = positiveSource && findUpstreamByType(positiveSource.node, new Set(["CLIPLoader"]));
    const clipW = clipLoader?.widgets?.find(w => w.name === "clip_name");
    const kleinTE = clipW && (/qwen[_-]?3[_-]?8b/i.test(String(clipW.value))
      ? String(clipW.value)
      : pickFromCombo(clipW, [/qwen[_-]?3[_-]?8b/i, /qwen.*8b/i]));
    if (unetPin && kleinFile && kleinTE) {
      unetW.value = kleinFile; unetW.callback?.(kleinFile);
      if (clipW.value !== kleinTE) { clipW.value = kleinTE; clipW.callback?.(kleinTE); }
      unetPin.pos = [anchorX + 384, anchorY - 160];
      graph.add(unetPin);
      pinnedModelNode = unetPin;
    }
  }

  let computedScale = 2;
  const latentSource = traceInput(samplerNode, "latent_image")?.node;
  if (latentSource) {
    const wW = latentSource.widgets?.find(w => w.name === "width");
    const wH = latentSource.widgets?.find(w => w.name === "height");
    if (wW && wH) {
      const longestSide = Math.max(Number(wW.value) || 1024, Number(wH.value) || 1024);
      computedScale = Math.round((4096 / longestSide) * 100) / 100;
    }
  }

  const usSettings = modelConfig?.nodes?.UltimateSDUpscale || {};
  const DEFAULTS = {
    upscale_by: computedScale, steps: 15, cfg: 5,
    sampler_name: "dpmpp_2m_sde", scheduler: "karras",
    denoise: 0.3, mode_type: "Chess",
    tile_width: 1024, tile_height: 1024,
    mask_blur: 12, tile_padding: 32,
    seam_fix_mode: "Half Tile", seam_fix_denoise: 0.25,
    seam_fix_width: 64, seam_fix_mask_blur: 8, seam_fix_padding: 16,
    force_uniform_tiles: true, tiled_decode: false,
  };
  applyArchSamplerDefaults(DEFAULTS, modelConfig?.architecture, modelConfig?.family);
  if (pinnedModelNode) {
    // Tiles run Klein base, not the distilled source — its official recipe
    // (Comfy-Org templates) is 20 steps / CFG 5; the arch default cfg 1.0
    // would mute the negative entirely on a base model.
    DEFAULTS.steps = 20;
    DEFAULTS.cfg = 5;
  } else if (guiderNode?.comfyClass === "CFGGuider") {
    // Klein base samples with real CFG — continue in the gen-time choice
    // rather than the distilled-flux 1.0 arch default.
    const genCfg = Number(guiderNode.widgets?.find(w => w.name === "cfg")?.value);
    if (genCfg > 0) DEFAULTS.cfg = genCfg;
  }
  for (const w of upscaleNode.widgets || []) {
    if (w.name in usSettings) { w.value = usSettings[w.name]; w.callback?.(usSettings[w.name]); }
    else if (w.name in DEFAULTS) { w.value = DEFAULTS[w.name]; w.callback?.(DEFAULTS[w.name]); }
  }

  for (const w of loaderNode.widgets || []) {
    if (w.name === "model_name") {
      // Pick a model that actually exists in this install's combo — never
      // hardcode a filename (the installer fetches 4x-UltraSharp, but a
      // fixed default errors on any machine that has a different set).
      const opts = w.options?.values || [];
      const preferred = usSettings.upscale_model;
      const val =
        (preferred && opts.includes(preferred) && preferred) ||
        opts.find(o => /ultrasharp/i.test(o)) ||
        opts.find(o => /^4x/i.test(o)) ||
        opts[0] ||
        preferred || "4x-UltraSharp.pth";
      w.value = val; w.callback?.(val); break;
    }
  }

  // Regional graphs: upscale tiles must sample with each figure's own prompt.
  // The couple's attn patch can't survive tiling (its full-canvas masks
  // re-interpolate into every tile), but native cond masks travel inside the
  // conditioning and USDU's crop_cond slices them per tile — so build the
  // upscaler's conditioning from PromptChain_RegionalConditioning. Every guard
  // falls back to the plain wiring below, so non-regional workflows (and
  // regional ones on a backend that predates the node) are untouched.
  let regionalCond = null;
  const couple = opts.regional === false ? null
    : downstream.find(n => n.comfyClass === "PromptChain_AttentionCouple");
  if (couple) {
    regionalCond = buildRegionalUpscaleCond(graph, LG, pcNode, couple, anchorX, anchorY);
  }

  const imageSlot = imageSource.outputs?.findIndex(o => o.type === "IMAGE") ?? 0;
  imageSource.connect(imageSlot, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "image") ?? 0);

  if (ckptNode) {
    const modelSlot = ckptNode.outputs?.findIndex(o => o.type === "MODEL") ?? 0;
    const vaeSlot = ckptNode.outputs?.findIndex(o => o.type === "VAE") ?? 2;
    ckptNode.connect(modelSlot, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "model") ?? 1);
    ckptNode.connect(vaeSlot, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "vae") ?? 4);
  } else {
    const tileModelNode = pinnedModelNode || splitModelNode;
    if (tileModelNode) {
      const ms = tileModelNode.outputs?.findIndex(o => o.type === "MODEL") ?? 0;
      tileModelNode.connect(ms, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "model") ?? 1);
    }
    if (splitVaeNode) {
      const vs = splitVaeNode.outputs?.findIndex(o => o.type === "VAE") ?? 0;
      splitVaeNode.connect(vs, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "vae") ?? 4);
    }
  }

  if (regionalCond) {
    regionalCond.connect(0, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "positive") ?? 2);
    regionalCond.connect(1, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "negative") ?? 3);
  } else {
    if (positiveSource) positiveSource.node.connect(positiveSource.slot, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "positive") ?? 2);
    if (negativeSource) {
      negativeSource.node.connect(negativeSource.slot, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "negative") ?? 3);
    } else if (positiveSource && isBasicGuider) {
      const zeroNeg = LG.createNode("ConditioningZeroOut");
      if (zeroNeg) {
        zeroNeg.pos = [anchorX + 384, anchorY + 330];
        graph.add(zeroNeg);
        positiveSource.node.connect(positiveSource.slot, zeroNeg, 0);
        zeroNeg.connect(0, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "negative") ?? 3);
      }
    }
  }
  loaderNode.connect(0, upscaleNode, upscaleNode.inputs?.findIndex(i => i.name === "upscale_model") ?? 5);

  const usSaveNode = LG.createNode("SaveImage");
  if (usSaveNode) {
    usSaveNode.pos = [anchorX + 716, anchorY + 160];
    graph.add(usSaveNode);
    if (anchorSave) {
      const prefixWidget = anchorSave.widgets?.find(w => w.name === "filename_prefix");
      const usPrefix = usSaveNode.widgets?.find(w => w.name === "filename_prefix");
      if (prefixWidget && usPrefix) {
        const base = prefixWidget.value;
        const dateIdx = base.indexOf("%date");
        if (dateIdx > 0) {
          const before = base.substring(0, dateIdx).replace(/\/?$/, "/upscale/");
          usPrefix.value = before + base.substring(dateIdx);
        } else {
          usPrefix.value = base.replace(/\/?$/, "/upscale");
        }
        usPrefix.callback?.(usPrefix.value);
      }
    }
    upscaleNode.connect(0, usSaveNode, 0);
  }

  graph.setDirtyCanvas(true, true);
  return true;
}

// Build the per-tile regional conditioning an UltimateSDUpscale needs in a
// regional graph: the couple's attn patch can't survive tiling (its full-canvas
// masks re-interpolate into every tile), but native cond masks travel inside
// the conditioning and USDU's crop_cond slices them per tile. Traces the
// couple's clip/masks sources and wires a PromptChain_RegionalConditioning.
// Returns the rc node, or null when the couple's wiring doesn't qualify.
// Exported for the viewer upscale graft, which re-targets an existing USDU.
export function buildRegionalUpscaleCond(graph, LG, pcNode, couple, anchorX, anchorY) {
  const traceInput = (node, inputName) => {
    const input = node.inputs?.find(i => i.name === inputName);
    if (!input?.link) return null;
    const link = getLink(graph, input.link);
    const origin = link && graph.getNodeById(link.origin_id);
    return origin ? { node: origin, slot: link.origin_slot } : null;
  };
  const poseNode = traceInput(couple, "masks")?.node;
  const clipSrc = traceInput(couple, "clip");
  const regOut = pcNode.outputs?.findIndex(o => o.name === "regions") ?? -1;
  const maskOut = poseNode?.outputs?.findIndex(o => o.name === "MASKS") ?? -1;
  if (poseNode?.comfyClass !== "PromptChain_PoseStudio" || !clipSrc || regOut < 0 || maskOut < 0) return null;
  const rc = LG.createNode("PromptChain_RegionalConditioning");
  if (!rc) return null;
  rc.pos = [anchorX + 384, anchorY + 330];
  graph.add(rc);
  clipSrc.node.connect(clipSrc.slot, rc, rc.inputs?.findIndex(i => i.name === "clip") ?? 0);
  pcNode.connect(regOut, rc, rc.inputs?.findIndex(i => i.name === "regions") ?? 1);
  poseNode.connect(maskOut, rc, rc.inputs?.findIndex(i => i.name === "masks") ?? 2);
  const poseOut = poseNode.outputs?.findIndex(o => o.name === "POSE_JSON") ?? -1;
  const poseIn = rc.inputs?.findIndex(i => i.name === "pose") ?? -1;
  if (poseOut >= 0 && poseIn >= 0) poseNode.connect(poseOut, rc, poseIn);
  return rc;
}

// Resolve the right checkpoint from the loader's combo by pattern. Returns null
// when nothing matches — callers must NOT silently fall back to opts[0] (that's
// how an SDXL net got loaded into a Flux graph).
function pickControlNetModel(loaderNode, modelKey) {
  const w = loaderNode.widgets?.find(x => x.name === "control_net_name");
  const opts = w?.options?.values || [];
  for (const re of CN_MODEL_MATCH[modelKey] || []) {
    const hit = opts.find(o => re.test(o));
    if (hit) return hit;
  }
  return null;
}

// Set the ControlNetLoader to the model for `modelKey`: prefer a pattern match
// against the combo (lets a user's own differently-named file win), else
// pre-seed the canonical installer filename so a just-downloaded model that the
// folder scan hasn't picked up yet is still selectable. Mirrors
// swapNodeCheckpointToFilename's pre-seed for the same rescan lag.
export function setControlNetModel(loaderNode, modelKey) {
  const w = loaderNode.widgets?.find(x => x.name === "control_net_name");
  if (!w) return;
  let file = pickControlNetModel(loaderNode, modelKey);
  if (!file) {
    file = CN_CANONICAL_FILE[modelKey];
    if (file && w.options?.values && !w.options.values.includes(file)) {
      w.options.values.push(file);
    }
  }
  if (file) { w.value = file; w.callback?.(file); }
}

// Inject one ControlNet branch and splice it into the conditioning. Stacks:
// reading the sampler's CURRENT positive/negative source means a second add
// chains onto the first apply node's output automatically.
function injectControlNet(pcNode, controlType) {
  const graph = app.graph;
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;
  // "depth-pose" is the depth branch with a Pose Studio figure as the image
  // source instead of a LoadImage — the rendered figure goes THROUGH
  // DepthAnything just like an uploaded photo would.
  const usePose = controlType === "depth-pose";
  const cfg = CONTROLNET_TYPES[usePose ? "depth" : controlType];
  if (!cfg) return false;

  const downstream = findDownstreamNodes(pcNode);
  const ksNode = downstream.find(n => n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced");
  if (!ksNode) return false;

  const traceInput = (node, inputName) => {
    const input = node.inputs?.find(i => i.name === inputName);
    if (!input?.link) return null;
    const link = getLink(graph, input.link);
    return link ? { node: graph.getNodeById(link.origin_id), slot: link.origin_slot } : null;
  };
  const posSrc = traceInput(ksNode, "positive");
  const negSrc = traceInput(ksNode, "negative");
  if (!posSrc?.node || !negSrc?.node) return false;

  // Image source: a shared LoadImage (uploaded reference) reused across stacked
  // branches — or, for "depth + 3D pose", a Pose Studio node whose rendered figure
  // feeds the depth preprocessor. Pose nodes aren't shared (one figure per branch).
  let loadImage = null, newLoadImage = false, poseNode = null;
  if (usePose) {
    poseNode = LG.createNode("PromptChain_PoseStudio");
    if (!poseNode) return false;
  } else {
    loadImage = graph._nodes?.find(n => n.comfyClass === "LoadImage" && n.title === "ControlNet Reference");
    newLoadImage = !loadImage;
    if (!loadImage) loadImage = LG.createNode("LoadImage");
  }
  const sourceNode = poseNode || loadImage;

  const preNode = LG.createNode(resolvePre(cfg.pre));
  const loaderNode = LG.createNode("ControlNetLoader");
  const applyNode = LG.createNode("ControlNetApplyAdvanced");
  const setUnion = cfg.unionType ? LG.createNode("SetUnionControlNetType") : null;
  const preview = LG.createNode("PreviewImage");
  if (!preNode || !loaderNode || !applyNode) return false;
  if (cfg.unionType && !setUnion) return false;

  // Layout mirrors the hand-arranged reference (janku-depth-3): the cluster
  // sits to the LEFT of the PromptChain node. Stacked branches step down one
  // cluster height; the reference LoadImage is shared (created once).
  const existingApplies = downstream.filter(n => n.comfyClass === "ControlNetApplyAdvanced").length;
  const baseX = pcNode.pos?.[0] ?? 0;
  const baseY = pcNode.pos?.[1] ?? 0;
  const dy = existingApplies * 660;  // step past the tallest cluster (pose)
  // Loader sits just below the preprocessor, whose height varies a lot by type
  // (pose tallest, scribble shortest) — derive from the live node height so one
  // rule fits all controls. SetUnion is 150 below the loader.
  const preH = preNode.size?.[1] || 130;
  const loaderY = preH + 65;
  const setUnionY = loaderY + 150;
  if (poseNode) {
    poseNode.pos = [baseX - 1383, baseY + dy];
    graph.add(poseNode);
    poseNode.size = [360, 470];
  } else if (newLoadImage) {
    loadImage.title = "ControlNet Reference";
    loadImage.pos = [baseX - 1223, baseY];
    graph.add(loadImage);
    loadImage.size = [250, 340];
  }
  preNode.pos = [baseX - 643, baseY + dy];
  loaderNode.pos = [baseX - 633, baseY + loaderY + dy];
  if (setUnion) setUnion.pos = [baseX - 633, baseY + setUnionY + dy];
  applyNode.pos = [baseX - 313, baseY + dy];
  if (preview) preview.pos = [baseX - 933, baseY + dy];
  graph.add(preNode);
  graph.add(loaderNode);
  if (setUnion) graph.add(setUnion);
  graph.add(applyNode);
  if (preview) graph.add(preview);
  // Sizes set after add so the litegraph size setter runs on a registered node.
  // Preprocessor: fix width, keep its auto height (varies by widget count —
  // canny has more rows than depth).
  preNode.size = [291, preNode.size?.[1] ?? 130];
  loaderNode.size = [270, 83];
  if (setUnion) setUnion.size = [270, 83];
  applyNode.size = [270, 240];
  if (preview) preview.size = [250, 360];

  // Tag the apply node so the settings panel can show a per-control section
  // (keyed by control type, not node class — survives in the workflow JSON).
  const tagType = usePose ? "depth" : controlType; // pose branch tunes like depth
  applyNode.title = `ControlNet — ${usePose ? "Depth (pose)" : (CN_LABELS[controlType] || controlType)}`;
  applyNode.properties = { ...(applyNode.properties || {}), pcrControlType: tagType };

  setControlNetModel(loaderNode, cfg.model);
  if (setUnion) {
    const w = setUnion.widgets?.find(x => x.name === "type");
    if (w) { w.value = cfg.unionType; w.callback?.(cfg.unionType); }
  }
  for (const w of applyNode.widgets || []) {
    if (w.name === "strength") { w.value = cfg.strength; w.callback?.(cfg.strength); }
    else if (w.name === "start_percent") { w.value = 0.0; w.callback?.(0.0); }
    else if (w.name === "end_percent") { w.value = cfg.end; w.callback?.(cfg.end); }
  }
  for (const w of preNode.widgets || []) {
    if (w.name === "resolution") { w.value = 1024; w.callback?.(1024); }
    // DWPose ships a toggle specifically for xinsir ControlNet stick scaling.
    else if (w.name === "scale_stick_for_xinsr_cn") { w.value = "enable"; w.callback?.("enable"); }
  }

  sourceNode.connect(0, preNode, preNode.inputs?.findIndex(i => i.name === "image") ?? 0);
  preNode.connect(0, applyNode, applyNode.inputs?.findIndex(i => i.name === "image") ?? 3);
  if (preview) preNode.connect(0, preview, 0);  // show the preprocessed map
  if (setUnion) {
    loaderNode.connect(0, setUnion, 0);
    setUnion.connect(0, applyNode, applyNode.inputs?.findIndex(i => i.name === "control_net") ?? 2);
  } else {
    loaderNode.connect(0, applyNode, applyNode.inputs?.findIndex(i => i.name === "control_net") ?? 2);
  }
  posSrc.node.connect(posSrc.slot, applyNode, applyNode.inputs?.findIndex(i => i.name === "positive") ?? 0);
  negSrc.node.connect(negSrc.slot, applyNode, applyNode.inputs?.findIndex(i => i.name === "negative") ?? 1);
  // Splice: the apply node's conditioning outputs now feed the sampler
  // (connecting to an input replaces its existing link).
  applyNode.connect(0, ksNode, ksNode.inputs?.findIndex(i => i.name === "positive") ?? 1);
  applyNode.connect(1, ksNode, ksNode.inputs?.findIndex(i => i.name === "negative") ?? 2);

  graph.setDirtyCanvas(true, true);
  return true;
}

// Regional conditioning: splice a PromptChain Attention Couple onto the MODEL line so
// each $mannequin{} block paints only on its figure. REUSES the existing 3D Poser (the
// user's actual posed scene) for the masks — never spawns a duplicate — and reroutes the
// conditioning that currently feeds the sampler THROUGH the couple, preserving any depth
// ControlNet already in the chain (no second depth branch, so the model isn't over-cooked).
function injectRegional(pcNode, modelConfig) {
  const graph = app.graph;
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;

  const downstream = findDownstreamNodes(pcNode);
  const ksNode = downstream.find(n => n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced");
  if (!ksNode) return false;

  const poseNode = (graph._nodes || []).find(n => n.comfyClass === "PromptChain_PoseStudio");
  if (!poseNode) {
    app.extensionManager?.toast?.add({
      severity: "warn", summary: "Add a 3D pose first",
      detail: "Regional needs a PromptChain 3D Poser in the graph — add 'Depth + 3D pose', pose your figures, then add Regional.",
      life: 7000,
    });
    return false;
  }

  const traceInput = (node, inputName) => {
    const input = node.inputs?.find(i => i.name === inputName);
    if (!input?.link) return null;
    const link = getLink(graph, input.link);
    return link ? { node: graph.getNodeById(link.origin_id), slot: link.origin_slot } : null;
  };
  const outIdx = (n, name) => { const i = n.outputs?.findIndex(o => o.name === name); return i == null ? -1 : i; };
  const ensureOut = (node, name) => {
    let i = outIdx(node, name);
    if (i < 0) {
      const ref = LG.createNode(node.comfyClass || node.type);
      if (ref?.outputs) for (let k = node.outputs?.length || 0; k < ref.outputs.length; k++) node.addOutput(ref.outputs[k].name, ref.outputs[k].type);
      i = outIdx(node, name);
    }
    return i;
  };

  const modelSrc = traceInput(ksNode, "model");
  const posSrc = traceInput(ksNode, "positive");
  const negSrc = traceInput(ksNode, "negative");
  if (!modelSrc?.node || !posSrc?.node || !negSrc?.node) return false;

  // CLIP source: reuse whatever fed the positive encode (respects clip-skip);
  // else the clip feeding any CLIPTextEncode; else any CLIP output. Shared by
  // both regional terminals below.
  const traceClip = () => {
    let s = traceInput(posSrc.node, "clip");
    if (!s?.node) {
      const enc = (graph._nodes || []).find(n => n.comfyClass === "CLIPTextEncode" && n.inputs?.some(i => i.name === "clip" && i.link != null));
      if (enc) s = traceInput(enc, "clip");
    }
    if (!s?.node) {
      for (const n of graph._nodes || []) { const o = outIdx(n, "CLIP"); if (o >= 0) { s = { node: n, slot: o }; break; } }
    }
    return s;
  };
  // Repair stale/misnamed PromptChain outputs so 'regions' lands at its true slot.
  const repairPcOutputs = () => {
    const refPc = LG.createNode(pcNode.comfyClass || pcNode.type);
    if (refPc?.outputs) {
      for (let i = 0; i < refPc.outputs.length; i++) {
        if (!pcNode.outputs?.[i]) pcNode.addOutput(refPc.outputs[i].name, refPc.outputs[i].type);
        else if (pcNode.outputs[i].name !== refPc.outputs[i].name) pcNode.outputs[i].name = refPc.outputs[i].name;
      }
      while ((pcNode.outputs?.length || 0) > refPc.outputs.length) pcNode.removeOutput(pcNode.outputs.length - 1);
    }
  };

  // DiT / joint-attention models (Flux, Z-Image, SD3, …) have NO UNet attn2 for
  // the Attention Couple to patch, so the couple would silently do nothing. They
  // use ComfyUI-native masked conditioning instead (PromptChain_RegionalConditioning)
  // — the exact terminal the Flux/Z-Image 3D-regional templates ship. It emits the
  // global prompt plus each $mannequin{} masked to its figure and REPLACES the
  // conditioning feeding the sampler; the depth ControlNet on these archs rides the
  // MODEL line (e.g. ZImageFunControlnet), so there's no conditioning-side apply to
  // route through, and the model line is left untouched.
  // Z-Image (single-stream DiT) gets a TRUE attention couple via the shared model-line
  // splice below (PromptChain_ZImageRegionalCouple patches NextDiT's joint attention so
  // $blocks cohere into ONE scene). Other DiTs (Flux/SD3/…) have no ported couple yet, so
  // they fall back to ComfyUI-native masked conditioning here.
  const arch = modelConfig?.architecture || "";
  const NATIVE_REGIONAL_ARCH = new Set(["flux", "flux2", "sd3", "hidream", "qwen_image", "qwen_edit", "krea2"]);
  if (NATIVE_REGIONAL_ARCH.has(arch)) {
    const rc = LG.createNode("PromptChain_RegionalConditioning");
    if (!rc) return false;
    rc.pos = [(pcNode.pos?.[0] || 0) - 360, (pcNode.pos?.[1] || 0) + 360];
    graph.add(rc);
    rc.size = [300, 230];

    const clipSrc = traceClip();
    if (clipSrc?.node) clipSrc.node.connect(clipSrc.slot, rc, "clip");

    repairPcOutputs();
    const regOut = outIdx(pcNode, "regions");
    if (regOut >= 0) pcNode.connect(regOut, rc, "regions");

    // masks ← the existing Poser scene (force-add MASKS if its def is stale).
    let maskOut = outIdx(poseNode, "MASKS");
    if (maskOut < 0) { poseNode.addOutput("MASKS", "MASK"); maskOut = outIdx(poseNode, "MASKS"); }
    if (maskOut >= 0) poseNode.connect(maskOut, rc, "masks");
    // pose ← POSE_JSON: figure names so renamed $blocks bind to the right mask.
    const poseJsonOut = outIdx(poseNode, "POSE_JSON");
    const poseInIdx = rc.inputs?.findIndex(i => i.name === "pose");
    if (poseJsonOut >= 0 && poseInIdx != null && poseInIdx >= 0) poseNode.connect(poseJsonOut, rc, poseInIdx);

    // Replace the conditioning feeding the sampler with the regional outputs,
    // KEEPING any ControlNet apply in between (none on the DiT model-patch path).
    const reroute = (rcOut, src, ksInput) => {
      if (src.node?.comfyClass === "ControlNetApplyAdvanced") rc.connect(outIdx(rc, rcOut), src.node, ksInput);
      else rc.connect(outIdx(rc, rcOut), ksNode, ksInput);
    };
    reroute("positive", posSrc, "positive");
    reroute("negative", negSrc, "negative");

    poseNode._pcrReconcileRegions?.();
    graph.setDirtyCanvas(true, true);
    return true;
  }

  // Z-Image patches the DiT's joint attention; SDXL/SD1.5 patch UNet attn2. Both
  // sit on the MODEL line and output (MODEL, positive, negative), so the wiring below
  // is shared — only the node class differs.
  const coupleType = arch === "zimage" ? "PromptChain_ZImageRegionalCouple" : "PromptChain_AttentionCouple";
  const couple = LG.createNode(coupleType);
  if (!couple) return false;
  couple.pos = [(pcNode.pos?.[0] || 0) - 340, (pcNode.pos?.[1] || 0) + 360];
  graph.add(couple);
  couple.size = [300, 230];

  // MODEL line: source -> couple -> sampler (couple inserts after any depth ControlNet
  // already feeding the sampler's model, so depth + regional compose).
  modelSrc.node.connect(modelSrc.slot, couple, "model");
  couple.connect(outIdx(couple, "MODEL"), ksNode, "model");

  // CLIP: reuse whatever fed the positive encode; else any CLIPTextEncode's clip
  // (respects clip-skip); else any CLIP output.
  const clipSrc = traceClip();
  if (clipSrc?.node) clipSrc.node.connect(clipSrc.slot, couple, "clip");

  // Repair stale/corrupted PromptChain outputs so 'regions' lands at its true slot
  // (older builds could leave a duplicated or misnamed output at slot 1).
  repairPcOutputs();

  // regions ← PromptChain; masks ← the existing Poser scene.
  const regOut = outIdx(pcNode, "regions");
  if (regOut >= 0) pcNode.connect(regOut, couple, "regions");
  // Force-add the MASKS output if the Poser's def is stale (page loaded before the
  // backend gained MASKS) — the backend returns MASKS at slot 2 (after IMAGE,
  // POSE_JSON), so appending it lands at the right slot. This is the bug that left
  // masks orphaned: a stale def meant there was no MASKS output to wire.
  let maskOut = outIdx(poseNode, "MASKS");
  if (maskOut < 0) { poseNode.addOutput("MASKS", "MASK"); maskOut = outIdx(poseNode, "MASKS"); }
  if (maskOut >= 0) poseNode.connect(maskOut, couple, "masks");
  // POSE_JSON → couple.pose: carries the figure names so renamed $blocks bind to
  // the right mask (skipped on stale couple defs that predate the pose input;
  // default mannequinN names still bind positionally without it).
  const poseJsonOut = outIdx(poseNode, "POSE_JSON");
  const poseInIdx = couple.inputs?.findIndex(i => i.name === "pose");
  if (poseJsonOut >= 0 && poseInIdx != null && poseInIdx >= 0) poseNode.connect(poseJsonOut, couple, poseInIdx);

  // Reroute conditioning through the couple, KEEPING any ControlNet apply in between:
  // feed the couple's global cond into the same consumer that currently feeds the
  // sampler (the depth apply's positive/negative), else straight into the sampler.
  const reroute = (coupleOut, src, ksInput) => {
    const isApply = src.node?.comfyClass === "ControlNetApplyAdvanced";
    if (isApply) couple.connect(outIdx(couple, coupleOut), src.node, ksInput);
    else couple.connect(outIdx(couple, coupleOut), ksNode, ksInput);
  };
  reroute("positive", posSrc, "positive");
  reroute("negative", negSrc, "negative");

  // Seed the prompt now: wiring fires no capture, so ask the Poser to sync its
  // $mannequinN{} blocks into the bound PromptChain immediately.
  poseNode._pcrReconcileRegions?.();

  // If the graph already detail-passes faces, that FaceDetailer would re-render
  // every face the couple just painted with ONE global prompt, stripping the
  // per-character identity back out — swap it for the regional one. A graph
  // with no detailer gets none; face detailing stays its own [add] choice.
  // SKIP on Z-Image: the RegionalDetailer runs an SDXL-shaped cfg sampler (no
  // AuraFlow model-sampling) that fries DiT faces — same reason it's omitted from
  // the Flux/Z-Image regional templates.
  if (arch !== "zimage") injectRegionalDetailer(pcNode, true, modelConfig);

  graph.setDirtyCanvas(true, true);
  return true;
}

// Splice a PromptChain_RegionalDetailer onto the image path after VAEDecode. It
// detects faces itself, matches each to its figure by mask overlap, and details
// it with that region's own conditioning — so it REPLACES any FaceDetailer,
// which is mask-blind (one global prompt for every face). Verified A/B on the
// Ryu/Sagat rig: identical detail quality, identity kept instead of erased.
// This is what [add] > FaceDetailer injects when the graph is regional;
// `replaceOnly` is the Regional-inject path, which only swaps an existing
// FaceDetailer and never adds an unrequested detail pass.
function injectRegionalDetailer(pcNode, replaceOnly = false, modelConfig = null) {
  const graph = app.graph;
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;

  const downstream = findDownstreamNodes(pcNode);
  if (downstream.some(n => n.comfyClass === "PromptChain_RegionalDetailer")) return true;
  const fd = downstream.find(n => n.comfyClass === "FaceDetailer");
  if (replaceOnly && !fd) return true;

  const vaeDecode = downstream.find(n => n.comfyClass === "VAEDecode");
  // Couple + Poser are the REGIONAL inputs (per-figure masks, couple-free base
  // model). Both optional: on a non-regional graph the node still works — it
  // details every detected face with the prompt's `global` block (PromptChain's
  // regions JSON always carries it), exactly like a plain FaceDetailer.
  const couple = downstream.find(n => n.comfyClass === "PromptChain_AttentionCouple");
  const poseNode = (graph._nodes || []).find(n => n.comfyClass === "PromptChain_PoseStudio");
  const ksNode = downstream.find(n => n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced");
  if (!vaeDecode || (!couple && !ksNode)) return false;

  const traceInput = (node, inputName) => {
    const input = node?.inputs?.find(i => i.name === inputName);
    if (!input?.link) return null;
    const link = getLink(graph, input.link);
    return link ? { node: graph.getNodeById(link.origin_id), slot: link.origin_slot } : null;
  };
  const inIdx = (n, name) => { const i = n.inputs?.findIndex(x => x.name === name); return i == null || i < 0 ? null : i; };
  const outIdx = (n, name) => { const i = n.outputs?.findIndex(o => o.name === name); return i == null ? -1 : i; };

  // Regional: the couple's own inputs are authoritative — its model input is the
  // BASE (couple-free) model, its clip carries the rig's clip-skip. The crop is a
  // single region, so couple-free + region cond alone is cleaner.
  // Non-regional: source from the sampler instead — its model line carries any
  // IPAdapter/PuLID patch, so the face re-pass keeps that style/identity, and the
  // clip is whatever encoded the prompt (clip-skip included).
  let modelSrc, clipSrc;
  if (couple) {
    modelSrc = traceInput(couple, "model");
    clipSrc = traceInput(couple, "clip");
  } else {
    modelSrc = traceInput(ksNode, "model");
    const enc = findUpstreamByType(ksNode, new Set(["CLIPTextEncode"]));
    clipSrc = enc ? traceInput(enc, "clip") : null;
    if (!clipSrc) {
      const ck = downstream.find(n => n.comfyClass === "CheckpointLoaderSimple" || n.comfyClass === "CheckpointLoader");
      if (ck) clipSrc = { node: ck, slot: ck.outputs?.findIndex(o => o.type === "CLIP") ?? 1 };
    }
  }
  const regOut = outIdx(pcNode, "regions");
  const maskOut = poseNode ? outIdx(poseNode, "MASKS") : -1;

  // An existing FaceDetailer hands over its image consumers, then leaves along
  // with any detector/SAM loaders that fed only it.
  const fdConsumers = [];
  let fdHelpers = [];
  if (fd) {
    for (const lid of fd.outputs?.[0]?.links || []) {
      const link = getLink(graph, lid);
      if (link) fdConsumers.push({ id: link.target_id, slot: link.target_slot });
    }
    fdHelpers = (fd.inputs || [])
      .map(i => traceInput(fd, i.name)?.node)
      .filter(n => n && (n.comfyClass === "UltralyticsDetectorProvider" || n.comfyClass === "SAMLoader"));
  }

  let saveImageNode = null;
  for (const lid of vaeDecode.outputs?.[0]?.links || []) {
    const link = getLink(graph, lid);
    const target = link && graph.getNodeById(link.target_id);
    if (target?.comfyClass === "SaveImage" || target?.comfyClass === "PreviewImage") { saveImageNode = target; break; }
  }

  const rd = LG.createNode("PromptChain_RegionalDetailer");
  if (!rd) return;
  const anchor = fd || saveImageNode || vaeDecode;
  rd.pos = [anchor.pos[0] + (fd ? 0 : 331), anchor.pos[1] - (fd ? 0 : 157)];
  graph.add(rd);

  // Match the rig's sampler dials (the template/preset already set those per
  // model, so cfg/sampler track the architecture); denoise 0.6 is the verified
  // detail strength. The model's SAVED detailer settings win over both — its
  // own RegionalDetailer preset first, else its FaceDetailer preset: curated
  // model configs carry face-detail tuning (e.g. PVC figurine denoise 0.25)
  // under FaceDetailer, and the dials share names by design.
  const ksWidget = (name) => ksNode?.widgets?.find(w => w.name === name)?.value;
  const SETTINGS = {
    steps: ksWidget("steps"), cfg: ksWidget("cfg"),
    sampler_name: ksWidget("sampler_name"), scheduler: ksWidget("scheduler"),
    // Fallback for uncurated models only — every curated model carries its own
    // FaceDetailer/RegionalDetailer denoise (0.25 photoreal … 0.4 stylized).
    // 0.4 is a safe middle; 0.6 over-detailed and shifted faces on photoreal.
    denoise: 0.4, guide_size: 384, max_size: 768,
  };
  const saved = modelConfig?.nodes?.PromptChain_RegionalDetailer
    || modelConfig?.nodes?.FaceDetailer || {};
  for (const w of rd.widgets || []) {
    if (w.name in saved) { w.value = saved[w.name]; w.callback?.(saved[w.name]); }
    else if (w.name in SETTINGS && SETTINGS[w.name] != null) { w.value = SETTINGS[w.name]; w.callback?.(SETTINGS[w.name]); }
  }

  vaeDecode.connect(0, rd, inIdx(rd, "image") ?? 3);
  // Base model, not the couple-patched one: the crop is a single region, so the
  // region conditioning alone is cleaner (the couple's full-canvas masks would
  // misalign on the crop anyway — the original bug).
  modelSrc?.node?.connect(modelSrc.slot, rd, inIdx(rd, "model") ?? 0);
  clipSrc?.node?.connect(clipSrc.slot, rd, inIdx(rd, "clip") ?? 1);
  const vaeSrc = traceInput(vaeDecode, "vae");
  vaeSrc?.node?.connect(vaeSrc.slot, rd, inIdx(rd, "vae") ?? 2);
  if (regOut >= 0) pcNode.connect(regOut, rd, inIdx(rd, "regions") ?? 4);
  // Masks + pose only exist on a regional graph; non-regional leaves them
  // unwired (both optional) and the node falls back to detector + global prompt.
  if (poseNode && maskOut >= 0) poseNode.connect(maskOut, rd, inIdx(rd, "masks") ?? 5);
  // POSE_JSON carries the Poser's exported head boxes — enables the
  // 'mannequin heads' face source (exact head positions, no detector misses).
  const poseOut = poseNode ? outIdx(poseNode, "POSE_JSON") : -1;
  if (poseNode && poseOut >= 0) {
    const poseIn = inIdx(rd, "pose");
    if (poseIn != null) poseNode.connect(poseOut, rd, poseIn);
  }
  // negative stays unwired — the node encodes the regions JSON negative itself.

  // PuLID'd graph (injected before the detailer): the sampler-line ApplyPulid
  // sits after the couple, so the base model wired above is identity-free —
  // give the detailer its own patch, reusing the existing cluster's loaders
  // and matching its dials.
  const samplerPulid = downstream.find(n => PULID_APPLY_TYPES.has(n.comfyClass));
  if (samplerPulid) {
    const pulidSources = tracePulidApplySources(graph, samplerPulid);
    if (pulidSources) {
      const pulidDials = {};
      for (const w of samplerPulid.widgets || []) pulidDials[w.name] = w.value;
      splicePulidOnDetailerModelLine(graph, LG, rd, pulidSources, pulidDials);
    }
  }

  // Same for a Style Reference (IPAdapter) graph — the face re-pass should
  // keep the style, not repaint faces in the bare checkpoint's look.
  const samplerStyle = downstream.find(n => n.comfyClass === "IPAdapterAdvanced");
  if (samplerStyle) {
    const styleSources = {};
    for (const name of ["ipadapter", "image"]) {
      const src = traceInput(samplerStyle, name);
      if (src?.node) styleSources[name] = src;
    }
    if (styleSources.ipadapter && styleSources.image) {
      const styleDials = {};
      for (const w of samplerStyle.widgets || []) styleDials[w.name] = w.value;
      spliceStyleOnDetailerModelLine(graph, LG, rd, styleSources, styleDials);
    }
  }

  if (fd) {
    graph.remove(fd);
    for (const h of fdHelpers) {
      if (!(h.outputs || []).some(o => o.links?.length)) graph.remove(h);
    }
  }
  if (fdConsumers.length) {
    for (const c of fdConsumers) {
      const tgt = graph.getNodeById(c.id);
      if (tgt) rd.connect(0, tgt, c.slot);
    }
  } else {
    // Add a SECONDARY SaveImage for the detailed output, leaving VAEDecode's
    // existing SaveImage to keep saving the base render — matches Impact's
    // FaceDetailer add (before/after pair, never replaces the clean save).
    const rdSave = LG.createNode("SaveImage");
    if (rdSave) {
      rdSave.pos = [rd.pos[0] + 450, rd.pos[1]];
      graph.add(rdSave);
      const prefix = saveImageNode?.widgets?.find(w => w.name === "filename_prefix");
      const rdPrefix = rdSave.widgets?.find(w => w.name === "filename_prefix");
      if (prefix && rdPrefix) { rdPrefix.value = prefix.value; rdPrefix.callback?.(prefix.value); }
      rd.connect(0, rdSave, 0);
    }
  }

  if (fd) {
    app.extensionManager?.toast?.add({
      severity: "info", summary: "FaceDetailer → Regional Detailer",
      detail: "Faces now detail with their own character's prompt (matched by figure mask).",
      life: 6000,
    });
  }
  graph.setDirtyCanvas(true, true);
  return true;
}

// Flux ControlNet branch (Shakker Union-Pro-2.0). Same KSampler-pivot splice as
// the SDXL inject — PromptChain's Flux template wires a single CLIPTextEncode
// into both KSampler.positive and .negative (cfg=1, no real negative), so the
// trace/splice is identical. Differences: no SetUnionControlNetType (v2 dropped
// it) and the VAE feeding VAEDecode is wired into ControlNetApplyAdvanced (Flux
// ControlNets encode the hint into latent space and need the VAE).
function injectFluxControlNet(pcNode, controlType) {
  const graph = app.graph;
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;
  const cfg = FLUX_CONTROLNET_TYPES[controlType];
  if (!cfg) return false;

  const downstream = findDownstreamNodes(pcNode);
  const ksNode = downstream.find(n => n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced");
  if (!ksNode) return false;

  const traceInput = (node, inputName) => {
    const input = node.inputs?.find(i => i.name === inputName);
    if (!input?.link) return null;
    const link = getLink(graph, input.link);
    return link ? { node: graph.getNodeById(link.origin_id), slot: link.origin_slot } : null;
  };
  const posSrc = traceInput(ksNode, "positive");
  const negSrc = traceInput(ksNode, "negative");
  if (!posSrc?.node || !negSrc?.node) return false;

  // VAE source: prefer the one feeding the workflow's VAEDecode; fall back to
  // any node exposing a VAE output (VAELoader / checkpoint).
  let vaeSrc = null;
  const vaeDecode = downstream.find(n => n.comfyClass === "VAEDecode");
  if (vaeDecode) vaeSrc = traceInput(vaeDecode, "vae");
  if (!vaeSrc?.node) {
    for (const n of graph._nodes || []) {
      const slot = n.outputs?.findIndex(o => o.type === "VAE") ?? -1;
      if (slot >= 0) { vaeSrc = { node: n, slot }; break; }
    }
  }

  // Reuse one shared reference image across stacked branches.
  let loadImage = graph._nodes?.find(n => n.comfyClass === "LoadImage" && n.title === "ControlNet Reference");
  const newLoadImage = !loadImage;
  if (!loadImage) loadImage = LG.createNode("LoadImage");

  const preNode = LG.createNode(resolvePre(cfg.pre));
  const loaderNode = LG.createNode("ControlNetLoader");
  const applyNode = LG.createNode("ControlNetApplyAdvanced");
  const preview = LG.createNode("PreviewImage");
  if (!preNode || !loaderNode || !applyNode) return false;

  // Same left-of-node layout as the SDXL cluster, minus the SetUnion node.
  const existingApplies = downstream.filter(n => n.comfyClass === "ControlNetApplyAdvanced").length;
  const baseX = pcNode.pos?.[0] ?? 0;
  const baseY = pcNode.pos?.[1] ?? 0;
  const dy = existingApplies * 660;
  const preH = preNode.size?.[1] || 130;
  const loaderY = preH + 65;
  if (newLoadImage) {
    loadImage.title = "ControlNet Reference";
    loadImage.pos = [baseX - 1223, baseY];
    graph.add(loadImage);
    loadImage.size = [250, 340];
  }
  preNode.pos = [baseX - 643, baseY + dy];
  loaderNode.pos = [baseX - 633, baseY + loaderY + dy];
  applyNode.pos = [baseX - 313, baseY + dy];
  if (preview) preview.pos = [baseX - 933, baseY + dy];
  graph.add(preNode);
  graph.add(loaderNode);
  graph.add(applyNode);
  if (preview) graph.add(preview);
  preNode.size = [291, preNode.size?.[1] ?? 130];
  loaderNode.size = [270, 83];
  applyNode.size = [270, 240];
  if (preview) preview.size = [250, 360];

  // Flux branches carry a "flux-" prefixed control type so their settings
  // sections + recommended markers stay distinct from the SDXL defaults.
  const settingsType = `flux-${controlType}`;
  applyNode.title = `ControlNet — ${CN_LABELS[settingsType] || controlType}`;
  applyNode.properties = { ...(applyNode.properties || {}), pcrControlType: settingsType };

  setControlNetModel(loaderNode, "fluxunion");
  for (const w of applyNode.widgets || []) {
    if (w.name === "strength") { w.value = cfg.strength; w.callback?.(cfg.strength); }
    else if (w.name === "start_percent") { w.value = 0.0; w.callback?.(0.0); }
    else if (w.name === "end_percent") { w.value = cfg.end; w.callback?.(cfg.end); }
  }
  for (const w of preNode.widgets || []) {
    if (w.name === "resolution") { w.value = 1024; w.callback?.(1024); }
  }

  loadImage.connect(0, preNode, preNode.inputs?.findIndex(i => i.name === "image") ?? 0);
  preNode.connect(0, applyNode, applyNode.inputs?.findIndex(i => i.name === "image") ?? 3);
  if (preview) preNode.connect(0, preview, 0);
  loaderNode.connect(0, applyNode, applyNode.inputs?.findIndex(i => i.name === "control_net") ?? 2);
  if (vaeSrc?.node) {
    const vaeIdx = applyNode.inputs?.findIndex(i => i.name === "vae") ?? -1;
    if (vaeIdx >= 0) vaeSrc.node.connect(vaeSrc.slot, applyNode, vaeIdx);
  }
  posSrc.node.connect(posSrc.slot, applyNode, applyNode.inputs?.findIndex(i => i.name === "positive") ?? 0);
  negSrc.node.connect(negSrc.slot, applyNode, applyNode.inputs?.findIndex(i => i.name === "negative") ?? 1);
  applyNode.connect(0, ksNode, ksNode.inputs?.findIndex(i => i.name === "positive") ?? 1);
  applyNode.connect(1, ksNode, ksNode.inputs?.findIndex(i => i.name === "negative") ?? 2);

  graph.setDirtyCanvas(true, true);
  return true;
}

// Z-Image ControlNet branch (alibaba-pai Fun-Controlnet-Union). Unlike SDXL/Flux,
// ZImageFunControlnet PATCHES the model (DiffSynth model-patch) and outputs only
// MODEL — so this splices onto the model line (like PuLID), not the conditioning.
// Stacks: reading the sampler's CURRENT model source chains a 2nd branch on.
function injectZImageControlNet(pcNode, controlType, isBase = false) {
  const graph = app.graph;
  if (!graph) return false;
  const LG = window.LiteGraph || graph.constructor?.LiteGraph;
  if (!LG) return false;
  // "depth-pose" = the depth branch driven by a 3D Poser figure instead of a
  // LoadImage — the rendered figure goes THROUGH the depth preprocessor, and its
  // MASKS/POSE outputs are what a follow-up Regional inject binds to.
  const usePose = controlType === "depth-pose";
  const baseControl = usePose ? "depth" : controlType;
  const cfg = ZIMAGE_CONTROLNET_TYPES[baseControl];
  if (!cfg) return false;

  const downstream = findDownstreamNodes(pcNode);
  const ksNode = downstream.find(n => n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced");
  if (!ksNode) return false;

  const traceInput = (node, inputName) => {
    const input = node.inputs?.find(i => i.name === inputName);
    if (!input?.link) return null;
    const link = getLink(graph, input.link);
    return link ? { node: graph.getNodeById(link.origin_id), slot: link.origin_slot } : null;
  };
  const modelSrc = traceInput(ksNode, "model");
  if (!modelSrc?.node) return false;

  let vaeSrc = null;
  const vaeDecode = downstream.find(n => n.comfyClass === "VAEDecode");
  if (vaeDecode) vaeSrc = traceInput(vaeDecode, "vae");
  if (!vaeSrc?.node) {
    for (const n of graph._nodes || []) {
      const slot = n.outputs?.findIndex(o => o.type === "VAE") ?? -1;
      if (slot >= 0) { vaeSrc = { node: n, slot }; break; }
    }
  }

  let loadImage = null, newLoadImage = false, poseNode = null;
  if (usePose) {
    poseNode = LG.createNode("PromptChain_PoseStudio");
    if (!poseNode) return false;
  } else {
    loadImage = graph._nodes?.find(n => n.comfyClass === "LoadImage" && n.title === "ControlNet Reference");
    newLoadImage = !loadImage;
    if (!loadImage) loadImage = LG.createNode("LoadImage");
  }
  const sourceNode = poseNode || loadImage;

  const preNode = LG.createNode(resolvePre(cfg.pre));
  const patchLoader = LG.createNode("ModelPatchLoader");
  const zcnNode = LG.createNode("ZImageFunControlnet");
  const preview = LG.createNode("PreviewImage");
  if (!preNode || !patchLoader || !zcnNode) return false;

  const existing = downstream.filter(n => n.comfyClass === "ZImageFunControlnet").length;
  const baseX = pcNode.pos?.[0] ?? 0;
  const baseY = pcNode.pos?.[1] ?? 0;
  const dy = existing * 660;
  const preH = preNode.size?.[1] || 130;
  const loaderY = preH + 65;
  if (poseNode) {
    poseNode.pos = [baseX - 1383, baseY + dy];
    graph.add(poseNode);
    poseNode.size = [360, 470];
  } else if (newLoadImage) {
    loadImage.title = "ControlNet Reference";
    loadImage.pos = [baseX - 1223, baseY];
    graph.add(loadImage);
    loadImage.size = [250, 340];
  }
  preNode.pos = [baseX - 643, baseY + dy];
  patchLoader.pos = [baseX - 633, baseY + loaderY + dy];
  zcnNode.pos = [baseX - 313, baseY + dy];
  if (preview) preview.pos = [baseX - 933, baseY + dy];
  graph.add(preNode);
  graph.add(patchLoader);
  graph.add(zcnNode);
  if (preview) graph.add(preview);
  preNode.size = [291, preNode.size?.[1] ?? 130];
  patchLoader.size = [270, 58];
  zcnNode.size = [270, 130];
  if (preview) preview.size = [250, 360];

  const settingsType = `zimage-${baseControl}`;
  zcnNode.title = `ControlNet — ${usePose ? "Depth (pose)" : (CN_LABELS[settingsType] || controlType)}`;
  zcnNode.properties = { ...(zcnNode.properties || {}), pcrControlType: settingsType };

  // ModelPatchLoader.name combo reads models/model_patches. Pick the patch for
  // the model family (Turbo vs base aren't cross-compatible); else pre-seed the
  // installer filename (fresh-download combo lag).
  const nameW = patchLoader.widgets?.find(x => x.name === "name");
  if (nameW) {
    const { hit, canonical } = pickZImageModelPatch(patchLoader, isBase);
    let val = hit;
    if (!val) {
      val = canonical;
      if (nameW.options?.values && !nameW.options.values.includes(val)) nameW.options.values.push(val);
    }
    if (val) { nameW.value = val; nameW.callback?.(val); }
  }
  for (const w of zcnNode.widgets || []) {
    if (w.name === "strength") { w.value = cfg.strength; w.callback?.(cfg.strength); }
  }
  for (const w of preNode.widgets || []) {
    if (w.name === "resolution") { w.value = 1024; w.callback?.(1024); }
  }

  sourceNode.connect(0, preNode, preNode.inputs?.findIndex(i => i.name === "image") ?? 0);
  preNode.connect(0, zcnNode, zcnNode.inputs?.findIndex(i => i.name === "image") ?? -1);
  if (preview) preNode.connect(0, preview, 0);
  patchLoader.connect(0, zcnNode, zcnNode.inputs?.findIndex(i => i.name === "model_patch") ?? 1);
  if (vaeSrc?.node) vaeSrc.node.connect(vaeSrc.slot, zcnNode, zcnNode.inputs?.findIndex(i => i.name === "vae") ?? 2);
  // Model line: source → ZImageFunControlnet → sampler.
  modelSrc.node.connect(modelSrc.slot, zcnNode, zcnNode.inputs?.findIndex(i => i.name === "model") ?? 0);
  zcnNode.connect(0, ksNode, ksNode.inputs?.findIndex(i => i.name === "model") ?? 0);

  graph.setDirtyCanvas(true, true);
  return true;
}

// ── template capture ──────────────────────────────────────────────

export function captureWorkflowGraph(pcNode) {
  const graph = app.graph;
  if (!graph) return null;

  const pcType = pcNode.comfyClass || "PromptChain";
  const capturedIds = new Set();
  const captured = [];

  const downQueue = [pcNode];
  const downVisited = new Set([pcNode.id]);
  while (downQueue.length) {
    const n = downQueue.shift();
    for (const output of n.outputs || []) {
      if (!output.links?.length) continue;
      for (const lid of output.links) {
        const link = getLink(graph, lid);
        if (!link) continue;
        const target = graph.getNodeById(link.target_id);
        if (!target || downVisited.has(target.id)) continue;
        downVisited.add(target.id);
        if (target.comfyClass === pcType) continue;
        capturedIds.add(target.id);
        captured.push(target);
        downQueue.push(target);
      }
    }
  }

  const upQueue = [...captured];
  while (upQueue.length) {
    const n = upQueue.shift();
    for (const input of n.inputs || []) {
      if (input.link == null) continue;
      const link = getLink(graph, input.link);
      if (!link) continue;
      const source = graph.getNodeById(link.origin_id);
      if (!source || capturedIds.has(source.id) || source.id === pcNode.id) continue;
      if (source.comfyClass === pcType) continue;
      capturedIds.add(source.id);
      captured.push(source);
      upQueue.push(source);
    }
  }

  if (!captured.length) return null;

  const idToIdx = new Map();
  captured.forEach((n, i) => idToIdx.set(n.id, i));

  const nodes = captured.map(n => ({
    type: n.comfyClass || n.type,
    offset: [n.pos[0] - pcNode.pos[0], n.pos[1] - pcNode.pos[1]],
    size: [n.size[0], n.size[1]],
    widgets_values: n.widgets_values ?? n.widgets?.map(w => w.value) ?? [],
    properties: { ...(n.properties || {}) },
  }));

  const connections = [];
  for (const n of captured) {
    for (const output of n.outputs || []) {
      if (!output.links?.length) continue;
      for (const lid of output.links) {
        const link = getLink(graph, lid);
        if (!link) continue;
        if (!capturedIds.has(link.target_id)) continue;
        connections.push({
          from_node_idx: idToIdx.get(n.id),
          from_slot: link.origin_slot,
          to_node_idx: idToIdx.get(link.target_id),
          to_slot: link.target_slot,
        });
      }
    }
  }

  const anchorConnections = [];
  for (const output of pcNode.outputs || []) {
    if (!output.links?.length) continue;
    for (const lid of output.links) {
      const link = getLink(graph, lid);
      if (!link || !capturedIds.has(link.target_id)) continue;
      anchorConnections.push({
        from_slot: link.origin_slot,
        to_node_idx: idToIdx.get(link.target_id),
        to_slot: link.target_slot,
      });
    }
  }

  return { nodes, connections, anchorConnections };
}

// ── resolve resolution ticks for upscale_by slider ────────────────

export function resolveResolutionTicks(detected) {
  const RES_TARGETS = [
    { pixels: 1024, label: "1K" }, { pixels: 2048, label: "2K" },
    { pixels: 3072, label: "3K" }, { pixels: 4096, label: "4K" },
    { pixels: 5120, label: "5K" }, { pixels: 6144, label: "6K" },
    { pixels: 7168, label: "7K" }, { pixels: 8192, label: "8K" },
  ];

  let inputLongest = 0;
  const ksEntry = detected.find(d =>
    d.type === "KSampler" || d.type === "KSamplerAdvanced" || d.type?.includes?.("Sampler")
  );
  if (ksEntry) {
    const latentInput = ksEntry.node.inputs?.find(i => i.name === "latent_image");
    if (latentInput?.link) {
      const lnk = getLinkInfo(latentInput.link);
      const latentNode = lnk ? app.graph.getNodeById(lnk.origin_id) : null;
      if (latentNode) {
        const wW = latentNode.widgets?.find(w => w.name === "width");
        const wH = latentNode.widgets?.find(w => w.name === "height");
        if (wW && wH) inputLongest = Math.max(Number(wW.value) || 0, Number(wH.value) || 0);
      }
    }
  }
  if (!inputLongest) {
    const latEntry = detected.find(d =>
      d.type === "EmptyLatentImage" || d.type === "EmptySD3LatentImage" || d.type === "EmptyFlux2LatentImage"
    );
    if (latEntry) {
      const wW = readWidgetValue(latEntry.node, "width");
      const wH = readWidgetValue(latEntry.node, "height");
      if (wW && wH) inputLongest = Math.max(Number(wW), Number(wH));
    }
  }
  // Upscale-only graphs (LoadImage -> USDU) carry no latent — the upscaler's
  // input IMAGE defines the base resolution. The source node's loaded preview
  // (node.imgs) is the client-side ground truth for its pixel dimensions.
  if (!inputLongest) {
    const usEntry = detected.find(d => d.type === "UltimateSDUpscale");
    const imgInput = usEntry?.node.inputs?.find(i => i.name === "image");
    if (imgInput?.link) {
      const lnk = getLinkInfo(imgInput.link);
      const src = lnk ? app.graph.getNodeById(lnk.origin_id) : null;
      const img = src?.imgs?.[0];
      if (img?.naturalWidth) inputLongest = Math.max(img.naturalWidth, img.naturalHeight);
    }
  }

  if (inputLongest <= 0) return null;

  const ticks = RES_TARGETS.map(t => ({ value: t.pixels / inputLongest, label: t.label }));
  const scale1K = RES_TARGETS[0].pixels / inputLongest;
  const scale8K = RES_TARGETS[RES_TARGETS.length - 1].pixels / inputLongest;
  const range = scale8K - scale1K;
  const padding = range * 0.08;
  return { ticks, minBound: Math.max(0.01, scale1K - padding), maxBound: scale8K + padding };
}

// ── Svelte lazy-load + lifecycle ──────────────────────────────────

const ensureCSS = ensureSvelteCSS;
let svelteModule = null;
const loadModule = createModuleLoader(async () => {
  svelteModule = await import("./svelte/promptchain-model-settings.js");
  return svelteModule;
});

let currentInstance = null;
let currentContainer = null;

// Module-level state preserved across open/close cycles
let _rangeMode = false;
let _activeTab = "settings";
const _expandedSections = {};
let _switchTimer = null;

export function closeModelModal() {
  clearTimeout(_switchTimer);
  if (currentInstance) {
    svelteModule?.destroyModelSettings(currentInstance);
    currentInstance = null;
  }
  if (currentContainer) {
    currentContainer.remove();
    currentContainer = null;
  }
  _rangeMode = false;
  document.querySelector(".pcr-model-indicator-open")?.classList.remove("pcr-model-indicator-open");
}

export async function showModelModal(pcNode, modelInfo, anchorEl, { tab = null } = {}) {
  if (currentInstance) { closeModelModal(); return; }
  if (tab) _activeTab = tab;

  ensureCSS();
  const detected = detectSupportedNodes(pcNode);

  let savedConfig = null;
  try {
    const res = await fetch(`/promptchain/models/settings/${modelInfo.hash}`);
    if (res.ok) savedConfig = await res.json();
  } catch {}

  // Resolve the Z-Image family (base vs turbo) for ControlNet model routing +
  // arch-aware cfg. The saved family is often unset (auto-discovered configs
  // don't populate it), so fall back to inferring from the filename — Turbo
  // checkpoints carry "turbo", base ones don't. null for non-Z-Image models.
  const zimageVariant = (() => {
    const arch = savedConfig?.architecture || modelInfo.architecture || "";
    if (arch !== "zimage") return null;
    const fam = savedConfig?.family || "";
    if (fam === "zimage_base" || fam === "zimage_turbo") return fam;
    const hay = [modelInfo.filename, modelInfo.model_name, savedConfig?.model_name]
      .filter(Boolean).join(" ").toLowerCase();
    return /turbo/.test(hay) ? "zimage_turbo" : "zimage_base";
  })();

  const mod = await loadModule();

  currentContainer = document.createElement("div");
  document.body.appendChild(currentContainer);

  currentInstance = mod.mountModelSettings(currentContainer, {
    pcNode,
    modelInfo,
    anchorEl,
    detected,
    savedConfig,
    activeTab: _activeTab,
    rangeMode: _rangeMode,
    expandedSections: _expandedSections,
    onClose: () => closeModelModal(),
    onReopen: (opts = {}) => {
      // Reopen with optional mode/tab changes
      if (opts.rangeMode !== undefined) _rangeMode = opts.rangeMode;
      if (opts.tab) _activeTab = opts.tab;
      closeModelModal();
      showModelModal(pcNode, modelInfo, anchorEl);
    },
    onSwitchVersion: (ver) => {
      if (!ver.filename) return;
      swapNodeCheckpointToFilename(pcNode, ver.filename);
      closeModelModal();
      const newModelInfo = { ...modelInfo, hash: ver.hash, filename: ver.filename };
      _switchTimer = setTimeout(() => showModelModal(pcNode, newModelInfo, anchorEl), 50);
    },
    onShowDownload: (ver) => {
      // Newer-version download from the settings panel.  The ckpt-widget
      // swap is deferred to onBeforeRestart — it fires the moment the
      // user commits to restart, not the moment the file lands.  That
      // way dismissing the modal before restarting leaves the node
      // untouched (file is on disk but not active yet).
      if (!ver?.file?.filename) return;
      const civitaiResult = {
        model_name: savedConfig?.model_name || modelInfo.filename || "",
        architecture: savedConfig?.architecture || modelInfo.architecture || "",
        family: savedConfig?.family || "",
        civitai_model_id: savedConfig?.civitai_model_id,
        file: ver.file,
      };
      closeModelModal();
      showDownloadModal(civitaiResult, pcNode, anchorEl, {
        onBeforeRestart: (filename) => {
          swapNodeCheckpointToFilename(pcNode, filename);
        },
      });
    },
    onOpenPicker: () => {
      closeModelModal();
      window.dispatchEvent(new CustomEvent("pcr-open-model-picker", { detail: { nodeId: pcNode.id } }));
    },
    onInjectNode: async (type) => {
      // ControlNet items arrive as "ControlNet:<controlType>" (depth/canny/…);
      // the base type drives requirements + the install modal.
      const isZImageBaseCN = type.startsWith("ZImageControlNetBase:");
      const isZImageCN = type.startsWith("ZImageControlNet:");
      const isFluxCN = type.startsWith("FluxControlNet:");
      const isCN = type.startsWith("ControlNet:");
      const controlType = isZImageBaseCN ? type.slice("ZImageControlNetBase:".length)
        : isZImageCN ? type.slice("ZImageControlNet:".length)
        : isFluxCN ? type.slice("FluxControlNet:".length)
        : isCN ? type.slice("ControlNet:".length) : null;
      const baseType = isZImageBaseCN ? "ZImageControlNetBase"
        : isZImageCN ? "ZImageControlNet"
        : isFluxCN ? "FluxControlNet" : isCN ? "ControlNet" : type;
      // The injects read modelConfig.architecture to set internal-sampler cfg/
      // steps per arch; resolve it the same way the menu gate does so the value
      // is present even when the model has no saved settings yet.
      const injectConfig = {
        ...(savedConfig || {}),
        architecture: savedConfig?.architecture || modelInfo.architecture || "",
        family: savedConfig?.family || zimageVariant || "",
      };
      const runInject = () => {
        const ok = baseType === "RegionalDetailer" ? injectRegionalDetailer(pcNode, false, injectConfig)
          : baseType === "PuLID" ? injectPuLID(pcNode)
          : baseType === "PuLIDFlux" ? injectPuLIDFlux(pcNode)
          : baseType === "PuLIDFlux2" ? injectPuLIDFlux2(pcNode)
          : baseType === "StyleReference" ? injectStyleReference(pcNode)
          : baseType === "Upscaler" ? injectUpscaler(pcNode, injectConfig)
          : baseType === "FluxControlNet" ? injectFluxControlNet(pcNode, controlType)
          : baseType === "ZImageControlNet" ? injectZImageControlNet(pcNode, controlType, false)
          : baseType === "ZImageControlNetBase" ? injectZImageControlNet(pcNode, controlType, true)
          : baseType === "ControlNet" ? (controlType === "regional" ? injectRegional(pcNode, injectConfig) : injectControlNet(pcNode, controlType))
          : false;
        if (ok) {
          closeModelModal();
          showModelModal(pcNode, modelInfo, anchorEl);
        } else {
          app.extensionManager?.toast?.add({
            severity: "warn",
            summary: `Couldn't add ${baseType}`,
            detail: "No compatible attachment point was found in the current workflow (it needs a sampler / VAE Decode to hook into).",
            life: 6000,
          });
        }
      };

      // Regional needs NO downloaded model or third-party pack — only our own
      // AttentionCouple/RegionalConditioning (always registered) plus a 3D Poser
      // in the graph (checked inside the inject). Skip the install gate: its
      // baseType is "ControlNet", whose models are the xinsir SDXL nets, so a
      // Flux/Z-Image user would otherwise be prompted to fetch SDXL checkpoints
      // the regional terminal never loads.
      if (controlType === "regional") { runInject(); return; }

      // Is the required pack fully installed before we build? Ask the server,
      // which knows BOTH whether the proof nodes are registered AND whether the
      // model weights are on disk. The client can only see registered node
      // types, so a present-nodes / missing-model pack (e.g. a fresh Flux
      // ControlNet whose preprocessors are already installed) would otherwise
      // inject with a wrong fallback model. After install + restart we
      // re-register node defs so LiteGraph knows new types without a reload.
      // Some injectables need ComfyUI-core nodes a pack can't provide (Z-Image's
      // ModelPatchLoader/ZImageFunControlnet). If those are absent the only fix
      // is updating ComfyUI — say so instead of offering a pack install.
      const coreNodes = INJECT_REQUIREMENTS[baseType]?.coreNodes;
      if (coreNodes) {
        const LG = window.LiteGraph;
        const missingCore = coreNodes.filter(n => !LG?.registered_node_types?.[n]);
        if (missingCore.length) {
          closeModelModal();
          app.extensionManager?.toast?.add({
            severity: "warn",
            summary: "Update ComfyUI to enable Z-Image ControlNet",
            detail: `Missing built-in nodes: ${missingCore.join(", ")}. Update ComfyUI to a recent version.`,
            life: 8000,
          });
          return;
        }
      }
      if (INJECT_REQUIREMENTS[baseType]) {
        let status = null;
        try {
          const res = await fetch(`/promptchain/nodepacks/status?injectable=${encodeURIComponent(baseType)}`);
          if (res.ok) status = await res.json();
        } catch (e) {
          console.error("[PromptChain] pack status check failed", e);
        }
        // Server doesn't recognise this pack — almost always a new pack added
        // to node_install_api.py with the server not yet restarted. Injecting
        // now would load a wrong/fallback model, so stop and say so instead of
        // building a broken graph.
        if (!status || typeof status.present !== "boolean") {
          closeModelModal();
          app.extensionManager?.toast?.add({
            severity: "warn",
            summary: `Restart ComfyUI to enable ${baseType}`,
            detail: "This injectable was just added — restart the ComfyUI server so it can install and load.",
            life: 7000,
          });
          return;
        }
        if (!status.present) {
          closeModelModal();
          showNodePackInstallModal(baseType, async () => {
            try {
              const defs = await app.getNodeDefs();
              await app.registerNodesFromDefs(defs);
            } catch (e) {
              console.error("[PromptChain] node def refresh failed", e);
            }
            runInject();
          });
          return;
        }
      }
      runInject();
    },
    onApplyTemplate: (tpl) => {
      tpl._presetNodes = savedConfig?.nodes || {};
      applyTemplate(pcNode, tpl, modelInfo.filename);
      closeModelModal();
    },
    captureWorkflowGraph: () => captureWorkflowGraph(pcNode),
    // Graph interaction callbacks
    readWidgetValue: (node, name) => readWidgetValue(node, name),
    readWidgetOptions: (node, name) => readWidgetOptions(node, name),
    writeWidgetValue: (node, name, value) => writeWidgetValue(node, name, value),
    resolveResolutionTicks: () => resolveResolutionTicks(detected),
    // Check what injectable nodes are missing
    injectableNodes: () => {
      const downstream = findDownstreamNodes(pcNode);
      const hasPuLID = downstream.some(n =>
        n.comfyClass === "ApplyPulidAdvanced" || n.comfyClass === "ApplyPulid"
      ) || app.graph?._nodes?.some(n =>
        (n.comfyClass === "ApplyPulidAdvanced" || n.comfyClass === "ApplyPulid")
      );
      const hasPuLIDFlux = downstream.some(n => n.comfyClass === "ApplyPulidFlux")
        || app.graph?._nodes?.some(n => n.comfyClass === "ApplyPulidFlux");
      const hasPuLIDFlux2 = downstream.some(n => n.comfyClass === "ApplyPuLIDFlux2")
        || app.graph?._nodes?.some(n => n.comfyClass === "ApplyPuLIDFlux2");
      const hasUpscaler = detected.some(d => d.type === "UltimateSDUpscale")
        || downstream.some(n => n.comfyClass === "UltimateSDUpscale");
      const items = [];
      const arch = savedConfig?.architecture || modelInfo.architecture || "";
      const family = savedConfig?.family || "";
      // FaceDetailer/Upscaler splice into a KSampler chain, so offer them only
      // when the workflow actually has a KSampler to hook — graph truth rather
      // than an arch guess. This correctly enables them on Flux (Dev/Krea and
      // Z-Image templates are KSampler-based; the injects already handle split
      // DualCLIP/VAE loaders) while hiding them on KSampler-less pivots like
      // Flux 2 (SamplerCustomAdvanced + BasicGuider). Internal sampler cfg/steps
      // are set per-architecture inside the injects. PuLID here is the SDXL/SD1.5
      // cubiq variant; Flux needs the separate balazik ApplyPulidFlux (Task 2).
      const hasKSampler = downstream.some(n =>
        n.comfyClass === "KSampler" || n.comfyClass === "KSamplerAdvanced"
      );
      // The Upscaler inject also anchors on Flux 2's SamplerCustomAdvanced +
      // guider split; the other one-shots still need a real KSampler.
      const hasCustomSampler = downstream.some(n => n.comfyClass === "SamplerCustomAdvanced");
      // On a regional graph (attention couple present), FaceDetailer means the
      // RegionalDetailer: same one-click detail pass, but each face gets its own
      // character's prompt instead of the one global — a plain FaceDetailer
      // would strip the identities the couple paints. No Impact pack needed.
      // Face detailing is always our RegionalDetailer: own YOLO detector +
      // global-prompt fallback = plain FaceDetailer behaviour without the Impact
      // pack, and on a regional graph it matches each face to its figure mask.
      // Offered until one exists; injecting it also swaps out any Impact
      // FaceDetailer already in the graph (the inject removes it).
      const hasRegional = downstream.some(n => n.comfyClass === "PromptChain_RegionalDetailer");
      if (!hasRegional && hasKSampler) items.push({ label: "FaceDetailer", value: "RegionalDetailer" });
      if (!hasPuLID && (arch === "sdxl" || arch === "sd15")) items.push("PuLID");
      // Flux PuLID (balazik) is FLUX.1-dev-trained — offer on Dev/Krea, not the
      // separate Fill UNET or distilled Schnell. Mirrors the Flux ControlNet gate.
      if (!hasPuLIDFlux && arch === "flux" && family !== "flux_fill" && family !== "flux_schnell") items.push({ label: "PuLID", value: "PuLIDFlux" });
      // Flux.2 PuLID (iFayens). The native weights are Klein-trained — on Dev
      // the dim mismatch swaps in a randomly-initialized projection (noise),
      // so offer it on the Klein family only.
      if (!hasPuLIDFlux2 && arch === "flux2" && family === "flux2_klein") items.push({ label: "PuLID", value: "PuLIDFlux2" });
      // Style Reference = IPAdapter style transfer. SDXL only — the installer
      // fetches the vit-h PLUS adapter, which the UnifiedLoader only matches
      // against SDXL checkpoints.
      const hasStyleRef = downstream.some(n => n.comfyClass === "IPAdapterAdvanced")
        || app.graph?._nodes?.some(n => n.comfyClass === "IPAdapterAdvanced");
      if (!hasStyleRef && arch === "sdxl" && hasKSampler) items.push({ label: "Style Reference", value: "StyleReference" });
      if (!hasUpscaler && (hasKSampler || hasCustomSampler)) items.push("Upscaler");
      // ControlNet (SDXL only for now; Flux/Z-Image use different model families).
      // Always offered — unlike the one-shots, branches stack (depth+canny+pose).
      if (arch === "sdxl") {
        items.push({
          label: "ControlNet",
          children: [
            { label: "Depth", value: "ControlNet:depth" },
            { label: "Depth + 3D pose", value: "ControlNet:depth-pose" },
            { label: "Regional (Attention Couple)", value: "ControlNet:regional" },
            { label: "Canny", value: "ControlNet:canny" },
            { label: "Pose", value: "ControlNet:pose" },
            { label: "Lineart", value: "ControlNet:lineart" },
            { label: "Soft Edge", value: "ControlNet:softedge" },
            { label: "Scribble", value: "ControlNet:scribble" },
            // Tile intentionally omitted: it only does something useful inside
            // an upscale re-render (which the Upscaler injectable already tiles),
            // not as a standalone control on the base generation. Future home is
            // a toggle in the Upscaler inject. CONTROLNET_TYPES.tile kept for that.
          ],
        });
      }
      // Flux ControlNet (Shakker Union-Pro-2.0). FLUX.1-dev-trained, so offered
      // on Dev/Krea only — excluded on flux_fill (separate inpaint UNET) and
      // flux_schnell (distilled, degraded), and flux2 is a different arch.
      if (arch === "flux" && family !== "flux_fill" && family !== "flux_schnell") {
        items.push({
          label: "ControlNet",
          children: [
            { label: "Depth", value: "FluxControlNet:depth" },
            { label: "Canny", value: "FluxControlNet:canny" },
            { label: "Pose", value: "FluxControlNet:pose" },
            { label: "Soft Edge", value: "FluxControlNet:softedge" },
            { label: "Gray", value: "FluxControlNet:gray" },
          ],
        });
      }
      // Krea 2 has no published ControlNet (and ComfyUI's krea2 model class exposes
      // no control hook), but native cond-mask regional works — PromptChain_RegionalConditioning
      // is model-agnostic. Offer Regional only.
      if (arch === "krea2") {
        items.push({
          label: "ControlNet",
          children: [
            { label: "Regional", value: "ControlNet:regional" },
          ],
        });
      }
      // Z-Image ControlNet (DiffSynth model-patch path; core nodes + aux
      // preprocessors). The control model is family-specific: Turbo's is
      // step-distilled, base's isn't, and they're NOT cross-compatible — so a
      // base node routes to the ZImageControlNetBase pack/model, everything else
      // (turbo, or family unset) to the Turbo one.
      if (arch === "zimage") {
        const cnPrefix = zimageVariant === "zimage_base" ? "ZImageControlNetBase" : "ZImageControlNet";
        items.push({
          label: "ControlNet",
          children: [
            { label: "Depth", value: `${cnPrefix}:depth` },
            { label: "Depth + 3D pose", value: `${cnPrefix}:depth-pose` },
            { label: "Regional", value: "ControlNet:regional" },
            { label: "Canny", value: `${cnPrefix}:canny` },
            { label: "Pose", value: `${cnPrefix}:pose` },
            { label: "Soft Edge", value: `${cnPrefix}:softedge` },
            { label: "Scribble", value: `${cnPrefix}:scribble` },
            { label: "Gray", value: `${cnPrefix}:gray` },
          ],
        });
      }
      return items;
    },
    onShowCatalogDownload: (entry, initialPrecision) => {
      closeModelModal();
      showCatalogDownloadModal(entry, pcNode, anchorEl, initialPrecision);
    },
    // Editor reference for prompts tab
    getEditor: () => pcNode._pcrEditor,
  });
}

registerModelModal(showModelModal, closeModelModal);
