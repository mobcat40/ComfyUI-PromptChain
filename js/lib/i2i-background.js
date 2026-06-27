// Editor "i2i": full-frame image-to-image. The Edit modal hands its flattened
// composite (already snapped to a /16 canvas by openI2iHandoff, so the VAE's
// own center-crop is a no-op and the result composites back aligned) to a clean
//   LoadImage → VAEEncode → KSampler(denoise) → VAEDecode → PreviewImage
// graph — no mask, no tiling, no crop. The render runs off-screen (PreviewImage
// → temp dir, the user's tabs untouched) and returns to Edit as a new layer.
//
// This is the no-mask sibling of the inpaint subsystem: it reuses prepareInpaint
// (wrapped) for caps + the engine list, the same content-addressed upload, the
// same loader clusters per engine, and the same background-tracker lifecycle.
// The one net-new piece is the clean graph TAIL — the inpaint builders all end
// in PromptChain_MaskedDetail (crop-and-detail), which would downscale a full
// frame to its max_size; i2i samples the whole frame instead.

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { externallyTrackedPrompts, armExternalQueue, disarmExternalQueue } from "./history.js";
import { prepareInpaint, sourcePromptText, createTracker, freshWorkflowId } from "./inpaint-background.js";
import { offscreenIdBase } from "./offscreen-graph.js";

function toast(severity, detail) {
  app.extensionManager?.toast?.add({ severity, summary: "i2i", detail, life: 7000 });
}

const numOr = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

// Per-engine i2i recipe (denoise/steps/cfg/sampler/scheduler), read off the live
// data/templates/*-i2i.json this session. The modal seeds its dials from this;
// the builders only fall back to it when an option is missing. Keyed by an
// architecture family; krea2/zimage split raw-vs-turbo by filename.
export const I2I_RECIPE_DEFAULTS = {
  sdxl:         { denoise: 0.55, steps: 35, cfg: 4.0, sampler: "dpmpp_2m_sde", scheduler: "karras" },
  flux1:        { denoise: 0.55, steps: 25, cfg: 1.0, sampler: "euler",         scheduler: "simple", guidance: 3.5 },
  flux2:        { denoise: 0.55, steps: 25, cfg: 1.0, sampler: "euler",         scheduler: "simple", guidance: 3.5 },
  krea2_raw:    { denoise: 0.35, steps: 40, cfg: 3.5, sampler: "er_sde",        scheduler: "beta" },
  krea2_turbo:  { denoise: 0.35, steps: 8,  cfg: 1.0, sampler: "euler",         scheduler: "simple" },
  zimage_base:  { denoise: 0.55, steps: 50, cfg: 4.0, sampler: "dpmpp_sde",     scheduler: "beta" },
  zimage_turbo: { denoise: 0.55, steps: 9,  cfg: 1.3, sampler: "res_multistep", scheduler: "beta" },
  generic:      { denoise: 0.50, steps: 30, cfg: 4.0, sampler: "euler",         scheduler: "normal" },
};

// The single source of truth for i2i defaults: resolve the recipe for an
// architecture/filename, layering the model's own saved gen recipe where it's
// meaningful. Returns a FRESH object (never a shared I2I_RECIPE_DEFAULTS ref).
// `gen` = the model config's t2i KSampler settings (from fetchEngineModels).
// SDXL honors its stored steps/cfg/sampler/scheduler; distilled DiTs
// (flux/krea2/zimage) have arch-fixed recipes a stored t2i gen shouldn't
// override, except flux's step count. The modal reads this via caps — it has no
// table of its own (no drift).
export function i2iRecipe(architecture, filename = "", gen = null) {
  const a = String(architecture || "").toLowerCase();
  const turbo = /turbo/i.test(filename);
  const raw = /raw/i.test(filename) && !turbo;
  let base;
  if (a === "krea2") base = raw ? I2I_RECIPE_DEFAULTS.krea2_raw : I2I_RECIPE_DEFAULTS.krea2_turbo;
  else if (a === "sdxl") base = I2I_RECIPE_DEFAULTS.sdxl;
  else if (a === "flux" || a === "flux1") base = I2I_RECIPE_DEFAULTS.flux1;
  else if (a === "flux2") base = I2I_RECIPE_DEFAULTS.flux2;
  else if (a === "zimage" || a === "z-image") base = turbo ? I2I_RECIPE_DEFAULTS.zimage_turbo : I2I_RECIPE_DEFAULTS.zimage_base;
  else base = I2I_RECIPE_DEFAULTS.generic;
  const r = { ...base };
  if (gen) {
    if (a === "sdxl") {
      if (Number.isFinite(gen.steps)) r.steps = gen.steps;
      if (Number.isFinite(gen.cfg)) r.cfg = gen.cfg;
      if (gen.sampler) r.sampler = gen.sampler;
      if (gen.scheduler) r.scheduler = gen.scheduler;
    } else if ((a === "flux" || a === "flux1") && Number.isFinite(gen.steps)) {
      r.steps = gen.steps;
    }
  }
  return r;
}

// Caps for the i2i modal: the inpaint caps minus everything mask-spatial. Full
// frame has no region to resolve, so regional/depth modes and the conditions
// panel (which patch the UNET around a mask) don't apply.
export async function prepareI2I(entry) {
  const prepared = await prepareInpaint(entry);
  if (!prepared) return null;
  prepared.caps.regionalAvailable = false;
  prepared.caps.depthAvailable = false;
  // P0 engine roster: Source + SDXL / FLUX.1 / Krea 2 (true denoise i2i). Qwen
  // Edit is an instruction edit at denoise 1.0 — a different feature, deferred.
  // Stamp each engine with its resolved i2i recipe (the modal reads .i2i — no
  // recipe table lives in the component).
  prepared.caps.engineModels = (prepared.caps.engineModels || [])
    .filter((m) => m.architecture !== "qwen_edit")
    .map((m) => ({ ...m, i2i: i2iRecipe(m.architecture, m.filename, m.gen) }));
  // The Source engine's recipe (only its denoise is used — steps/cfg/sampler are
  // inherited from the image's own embedded render). Drives the default denoise,
  // so a krea2 source opens at krea2's i2i denoise.
  prepared.caps.sourceI2iRecipe = i2iRecipe(prepared.caps.sourceModelInfo?.architecture || "", "", null);
  prepared.caps.defaultDenoise = prepared.caps.sourceI2iRecipe.denoise ?? 0.55;
  return prepared;
}

// ── graph builders ────────────────────────────────────────────────────────

function probeCombo(type, widget) {
  try {
    const node = window.LiteGraph?.createNode?.(type);
    return node?.widgets?.find((w) => w.name === widget)?.options?.values || [];
  } catch { return []; }
}

const PC_NODE = () => ({
  prompt: "", mode: "combine", switch_index: 1,
  locked: false, disabled: false, cached_output: "", cached_neg_output: "",
  iterate_index: 0, iterate_cycle: 1, collapsed: false,
  wildcard_modes: "", cached_regions: "",
});

function makeAdder(graph) {
  // Render-node ids start far above every live-canvas id so ComfyUI's id-keyed
  // output painter never lands this background render on a visible node (see
  // offscreen-graph.js). Mirrors the inpaint builders.
  let nextId = offscreenIdBase();
  return (class_type, inputs) => {
    const id = String(nextId++);
    graph[id] = { class_type, inputs };
    return id;
  };
}

// Shared clean tail: encode the loaded image, partially denoise it, decode,
// preview. `modelRef`/`clipRef`/`vaeRef` are [id, slot] links into `graph`.
function attachI2ITail(graph, add, { inputRef, modelRef, clipRef, vaeRef, options, guidance, steps, cfg, sampler, scheduler, clown }) {
  const loadId = add("LoadImage", { image: inputRef });
  const encId = add("VAEEncode", { pixels: [loadId, 0], vae: vaeRef });
  const pc = PC_NODE(); pc.prompt = options.prompt || "";
  const pcId = add("PromptChain_PromptChain", pc);
  let posRef = [add("CLIPTextEncode", { text: [pcId, 1], clip: clipRef }), 0];
  const negRef = [add("CLIPTextEncode", { text: [pcId, 2], clip: clipRef }), 0];
  if (typeof guidance === "number") {
    posRef = [add("FluxGuidance", { conditioning: posRef, guidance }), 0];
  }
  const denoise = typeof options.denoise === "number" ? options.denoise : 0.55;
  // Realism full-frame i2i: the same RES4LYF ClownsharKSampler_Beta the realism
  // t2i template uses. Full-frame output (not a composited patch), so a sampler
  // NODE is allowed here. cfg pinned 1 like Turbo; denoise from the dial.
  const ksId = clown
    ? add("ClownsharKSampler_Beta", {
        model: modelRef, positive: posRef, negative: negRef, latent_image: [encId, 0],
        eta: 0.5, sampler_name: "exponential/ddim", scheduler: "beta57",
        steps: steps ?? 8, steps_to_run: -1, denoise, cfg: cfg ?? 1.0,
        seed: Math.floor(Math.random() * 0xffffffffff), sampler_mode: "standard", bongmath: false,
      })
    : add("KSampler", {
        model: modelRef, positive: posRef, negative: negRef, latent_image: [encId, 0],
        seed: Math.floor(Math.random() * 0xffffffffff),
        steps, cfg, sampler_name: sampler, scheduler, denoise,
      });
  const decId = add("VAEDecode", { samples: [ksId, 0], vae: vaeRef });
  const previewId = add("PreviewImage", { images: [decId, 0] });
  return { ksId, previewId };
}

// SDXL picker engine: a fresh checkpoint i2i — no embedded render data needed,
// so plain photos / imported images work too. Mirrors buildInpaintEnginePrompt
// upstream (checkpoint + two encodes), clean tail.
export function buildI2IEngineSdxl(data, options) {
  const filename = options.engineModel?.filename;
  if (!filename) throw new Error("no engine model picked");
  const graph = {};
  const add = makeAdder(graph);
  const ckptId = add("CheckpointLoaderSimple", { ckpt_name: filename });
  const gen = options.engineGen || {};
  const { ksId } = attachI2ITail(graph, add, {
    inputRef: data.input_ref, modelRef: [ckptId, 0], clipRef: [ckptId, 1], vaeRef: [ckptId, 2], options,
    steps: numOr(options.steps, numOr(gen.steps, 35)),
    cfg: numOr(options.cfg, numOr(gen.cfg, 4)),
    sampler: options.sampler || gen.sampler || "dpmpp_2m_sde",
    scheduler: options.scheduler || gen.scheduler || "karras",
  });
  return { graph, detailId: ksId };
}

// FLUX.1 picker engine: guidance rides FluxGuidance on the positive, KSampler
// cfg pinned 1.0 (a real cfg would double sampling). Mirrors buildFlux1InpaintPrompt.
export function buildI2IEngineFlux1(data, options) {
  const filename = options.engineModel?.filename;
  if (!filename) throw new Error("no engine model picked");
  const clipOpts = probeCombo("DualCLIPLoader", "clip_name1");
  const clipL = clipOpts.find((o) => /(^|[\\/])clip_l\./i.test(o)) || clipOpts.find((o) => /clip_l/i.test(o));
  const t5 = clipOpts.find((o) => /t5xxl.*fp16/i.test(o)) || clipOpts.find((o) => /t5xxl/i.test(o));
  const vaeFile = probeCombo("VAELoader", "vae_name").find((o) => /(^|[\\/])ae\.(safetensors|sft)$/i.test(o));
  if (!clipL || !t5 || !vaeFile) throw new Error("the FLUX text encoders / VAE aren't installed");
  const graph = {};
  const add = makeAdder(graph);
  const unetId = add("UNETLoader", { unet_name: filename, weight_dtype: "default" });
  const clipId = add("DualCLIPLoader", { clip_name1: clipL, clip_name2: t5, type: "flux", device: "default" });
  const vaeId = add("VAELoader", { vae_name: vaeFile });
  const gen = options.engineGen || {};
  const { ksId } = attachI2ITail(graph, add, {
    inputRef: data.input_ref, modelRef: [unetId, 0], clipRef: [clipId, 0], vaeRef: [vaeId, 0], options,
    guidance: I2I_RECIPE_DEFAULTS.flux1.guidance,
    steps: numOr(options.steps, numOr(gen.steps, 25)),
    cfg: 1.0,
    sampler: options.sampler || gen.sampler || "euler",
    scheduler: options.scheduler || gen.scheduler || "simple",
  });
  return { graph, detailId: ksId };
}

// Krea 2 picker engine: a DiT that wires like FLUX.1 minus the guidance regime
// (cfg-native, no FluxGuidance). RAW needs the resolution shift + full steps +
// real cfg; Turbo is the pinned 8-step/cfg-1 recipe. Mirrors buildKrea2InpaintPrompt.
export function buildI2IEngineKrea2(data, options) {
  const filename = options.engineModel?.filename;
  if (!filename) throw new Error("no engine model picked");
  // Realism mode (krea2_turbo): abliterated Qwen3-VL encoder + wan_2.1 VAE +
  // projector/realism LoRAs + the ClownsharKSampler tail. i2i is full-frame (a
  // whole new layer, not a composited patch), so wan VAE is safe and the Clown
  // sampler node can run — matching the realism t2i template exactly.
  const realism = !!options.realism;
  const clipOpts = probeCombo("CLIPLoader", "clip_name");
  const loraOpts = probeCombo("LoraLoaderModelOnly", "lora_name");
  const clipFile = realism
    ? clipOpts.find((o) => /huihui.*qwen3.?vl.*4b.*abliterated|qwen3.?vl.*4b.*abliterated/i.test(o))
    : (clipOpts.find((o) => /qwen3vl.*4b/i.test(o)) || clipOpts.find((o) => /qwen3.?vl.*4b/i.test(o)));
  const vaeFile = realism
    ? probeCombo("VAELoader", "vae_name").find((o) => /wan.*2[._]?1.*vae/i.test(o) && !/upscale|2x/i.test(o))
    : probeCombo("VAELoader", "vae_name").find((o) => /qwen.*image.*vae/i.test(o));
  const projLora = realism && loraOpts.find((o) => /krea2_turbo_projector_scale/i.test(o));
  const realLora = realism && loraOpts.find((o) => /krea2-realism/i.test(o));
  if (!clipFile || !vaeFile) throw new Error(realism
    ? "Realism mode needs the abliterated Qwen3-VL encoder + wan_2.1 VAE installed"
    : "the Krea 2 text encoder / VAE aren't installed");
  if (realism && (!projLora || !realLora)) throw new Error("Realism mode needs the Krea2-realism-V1 + krea2_turbo_projector_scale LoRAs installed");
  const graph = {};
  const add = makeAdder(graph);
  const unetId = add("UNETLoader", { unet_name: filename, weight_dtype: "default" });
  const clipId = add("CLIPLoader", { clip_name: clipFile, type: "krea2", device: "default" });
  const vaeId = add("VAELoader", { vae_name: vaeFile });
  const raw = /raw/i.test(filename) && !/turbo/i.test(filename);
  let modelRef = [unetId, 0];
  if (raw) {
    // RAW over-shifts on the baked 1.15 mu — replace it with a resolution-aware
    // shift (the same node the raw t2i/i2i templates insert). i2i has no
    // MaskedDetail crop, so the sampled latent IS the input size — feed those
    // real dims, not a stale 1024², or the mu schedule is wrong for non-square /
    // non-1024 inputs.
    const msfId = add("ModelSamplingFlux", {
      model: [unetId, 0], max_shift: 0.90625, base_shift: 0.5,
      width: data.width || 1024, height: data.height || 1024,
    });
    modelRef = [msfId, 0];
  }
  if (realism) {
    const proj = add("LoraLoaderModelOnly", { model: modelRef, lora_name: projLora, strength_model: 0.5 });
    const real = add("LoraLoaderModelOnly", { model: [proj, 0], lora_name: realLora, strength_model: 0.6 });
    modelRef = [real, 0];
  }
  const { ksId } = attachI2ITail(graph, add, {
    inputRef: data.input_ref, modelRef, clipRef: [clipId, 0], vaeRef: [vaeId, 0], options,
    clown: realism,
    steps: numOr(options.steps, raw ? 40 : 8),
    cfg: numOr(options.cfg, raw ? 3.5 : 1.0),
    sampler: options.sampler || (raw ? "er_sde" : "euler"),
    scheduler: options.scheduler || (raw ? "beta" : "simple"),
  });
  return { graph, detailId: ksId };
}

// Architecture of the image's own render graph — picks the conditioning regime
// for the source graft (which model stream / guidance the fresh encodes feed).
// Mirrors inpaint-background's inpaintArch.
function sourceArch(entries) {
  const has = (...cls) => entries.some((n) => cls.includes(n?.class_type));
  if (has("CheckpointLoaderSimple", "CheckpointLoader")) return "sdxl";
  const clipType = String(entries.find((n) => n?.class_type === "CLIPLoader")?.inputs?.type || "").toLowerCase();
  if (clipType === "flux2") return "flux2";
  if (clipType === "krea2") return "krea2";
  if (clipType === "lumina2") return "zimage";
  if (has("DualCLIPLoader") || clipType === "flux" || has("UNETLoader", "UnetLoaderGGUF")) return "flux1";
  return "other";
}

// Source graft: re-diffuse the image with ITS OWN model. Traces the model / clip
// / vae out of the embedded API prompt (the truest "this image, more diffused")
// and attaches the clean i2i tail, applying the arch's conditioning regime.
// Mirrors buildInpaintPrompt's tracing; swaps the MaskedDetail tail for the
// plain encode/sample/decode. Throws (engine picker is the fallback) if the
// graph can't be traced.
export function buildI2ISource(apiPrompt, data, options) {
  const graph = {};
  for (const [id, entry] of Object.entries(apiPrompt || {})) {
    if (!entry || typeof entry.class_type !== "string") continue;
    graph[id] = { class_type: entry.class_type, inputs: JSON.parse(JSON.stringify(entry.inputs || {})) };
  }
  const idByClass = (...cls) => Object.keys(graph).find((id) => cls.includes(graph[id].class_type));
  const isLink = (v) => Array.isArray(v) && v.length === 2 && !!graph[String(v[0])];

  const SAMPLER_CLASSES = ["KSampler", "KSamplerAdvanced", "PromptChain_MaskedDetail", "UltimateSDUpscale"];
  const anchorId = Object.keys(graph).find((id) => SAMPLER_CLASSES.includes(graph[id].class_type));
  if (!anchorId) throw new Error("no sampler in this image's render data");
  const src = graph[anchorId];

  // Trace to the unpatched model (keep LoRA loaders / ModelSampling shims; drop
  // only the AttentionCouple, which bakes the source gen's regional prompts).
  let modelRef = src.inputs.model;
  while (isLink(modelRef) && graph[String(modelRef[0])].class_type === "PromptChain_AttentionCouple") {
    modelRef = graph[String(modelRef[0])].inputs.model;
  }
  if (!isLink(modelRef)) throw new Error("the sampler has no model wired");

  const ckptId = idByClass("CheckpointLoaderSimple", "CheckpointLoader");
  const encNodeId = idByClass("CLIPTextEncode");
  const regionalId = idByClass("PromptChain_AttentionCouple", "PromptChain_RegionalConditioning");
  const clipLoaderId = idByClass("CLIPLoader");
  const clipRef = (encNodeId && isLink(graph[encNodeId].inputs.clip) && graph[encNodeId].inputs.clip)
    || (regionalId && isLink(graph[regionalId].inputs.clip) && graph[regionalId].inputs.clip)
    || (clipLoaderId && [clipLoaderId, 0])
    || (ckptId && [ckptId, 1]);
  const decId = idByClass("VAEDecode", "VAEUtils_VAEDecodeTiled", "VAEDecodeTiled");
  let vaeRef = (decId && isLink(graph[decId].inputs.vae) && graph[decId].inputs.vae)
    || (isLink(src.inputs.vae) && src.inputs.vae)
    || (ckptId && [ckptId, 2]);
  if (!clipRef) throw new Error("couldn't trace the clip/vae lines");

  const add = makeAdder(graph);

  // A decode-only / 2x custom VAE loader can't ENCODE — i2i needs both. Graft a
  // stock VAELoader on the shared latent if the trace failed or hit that loader.
  const tracedVae = isLink(vaeRef) ? graph[String(vaeRef[0])] : null;
  if (!vaeRef || (tracedVae && tracedVae.class_type === "VAEUtils_CustomVAELoader")) {
    const vaeName = probeCombo("VAELoader", "vae_name").find((o) => /qwen.*image.*vae/i.test(o))
      || probeCombo("VAELoader", "vae_name").find((o) => /wan.*2[._]?1.*vae/i.test(o) && !/upscale|2x/i.test(o));
    if (!vaeName) throw new Error("couldn't trace the clip/vae lines");
    vaeRef = [add("VAELoader", { vae_name: vaeName }), 0];
  }

  const arch = sourceArch(Object.values(graph));
  const fluxLike = arch === "flux1" || arch === "flux2";
  const { ksId, previewId } = attachI2ITail(graph, add, {
    inputRef: data.input_ref, modelRef, clipRef, vaeRef, options,
    guidance: fluxLike ? I2I_RECIPE_DEFAULTS.flux1.guidance : undefined,
    steps: numOr(options.steps, numOr(src.inputs.steps, 30)),
    // flux pins cfg 1.0 (guidance carries it); other arches inherit the dial.
    cfg: fluxLike ? 1.0 : numOr(options.cfg, numOr(src.inputs.cfg, 5)),
    sampler: options.sampler || (typeof src.inputs.sampler_name === "string" ? src.inputs.sampler_name : "euler"),
    scheduler: options.scheduler || (typeof src.inputs.scheduler === "string" ? src.inputs.scheduler : "normal"),
  });

  // Prune to the new PreviewImage's upstream closure — the source gen (its
  // sampler, pose, couple, old encodes, saves, and ITS own PreviewImage/saves)
  // all falls away. Walk from the terminal preview so VAEDecode/KSampler/loaders
  // are all retained.
  const keep = new Set();
  const stack = [previewId];
  while (stack.length) {
    const id = stack.pop();
    if (!id || keep.has(id)) continue;
    keep.add(id);
    for (const v of Object.values(graph[id].inputs || {})) {
      if (isLink(v)) stack.push(String(v[0]));
    }
  }
  for (const id of Object.keys(graph)) if (!keep.has(id)) delete graph[id];

  return { graph, detailId: ksId };
}

function buildI2IGraph(data, options) {
  if (options.engine === "sdxl-ckpt" && options.engineModel) return buildI2IEngineSdxl(data, options);
  if (options.engine === "flux1-unet" && options.engineModel) return buildI2IEngineFlux1(data, options);
  if (options.engine === "krea2-unet" && options.engineModel) return buildI2IEngineKrea2(data, options);
  return buildI2ISource(data.prompt, data, options);
}

function collectI2IMeta(graph, detailId, data, options) {
  const byClass = (...cls) => Object.values(graph).find((n) => cls.includes(n.class_type));
  const loader = byClass("CheckpointLoaderSimple", "CheckpointLoader") || byClass("UNETLoader");
  const lit = (v) => (Array.isArray(v) || v === undefined ? null : v);
  const ks = graph[detailId].inputs;
  return {
    parent_filename: data.input_ref,
    model: lit(loader?.inputs?.ckpt_name) || lit(loader?.inputs?.unet_name) || null,
    seed: lit(ks.seed), steps: lit(ks.steps), cfg: lit(ks.cfg),
    sampler: lit(ks.sampler_name), scheduler: lit(ks.scheduler),
    denoise: options.denoise ?? null, prompt: options.prompt || "", negative: "",
  };
}

// Background i2i render. Mirrors runInpaint's lifecycle, with two differences:
// no mask upload, and listeners are registered BEFORE the queue with a pending
// buffer that replays once prompt_id is known — a full-frame i2i can be served
// from cache (~0s), and an execution_success arriving before queuePrompt's
// response sets prompt_id would otherwise be dropped and the promise would hang
// (the bug just fixed in enlargeImageInBackground). runInpaint registers after
// the queue and lacks this guard; i2i must not inherit that race.
export function runI2IInBackground(prepared, options = {}) {
  const tracker = createTracker();
  const run = { cancelled: false, promptId: null, executionStarted: false, cleanup: null };
  tracker.cancel = async () => {
    if (run.cancelled) return;
    run.cancelled = true;
    tracker.emit({ phase: "cancelled" });
    try {
      if (run.promptId) {
        if (run.executionStarted) await api.interrupt();
        else {
          await api.fetchApi("/queue", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ delete: [run.promptId] }),
          });
          run.cleanup?.();
        }
      }
    } catch (e) {
      console.warn("[PromptChain] i2i cancel failed", e);
    }
  };

  (async () => {
    const { data } = prepared;
    tracker.emit({ phase: "building" });
    let built;
    try {
      built = buildI2IGraph(data, options);
    } catch (e) {
      console.error("[PromptChain][i2i] build failed:", e);
      tracker.emit({ phase: "error", message: `build failed: ${e.message}` });
      toast("error", `i2i build failed: ${e.message}`);
      return;
    }
    if (run.cancelled) return;

    tracker.emit({ phase: "queueing" });
    const workflowId = freshWorkflowId();
    const workflowExtra = data.workflow ? { ...data.workflow, id: workflowId } : undefined;

    let promptId = null;
    let idKnown = false;
    let meta = null;
    let lastTemp = null;
    let previewUrl = null;
    const pending = [];
    const setPreview = (blob) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = blob ? URL.createObjectURL(blob) : null;
      return previewUrl;
    };
    const cleanup = () => {
      api.removeEventListener("execution_start", onStart);
      api.removeEventListener("progress", onProgress);
      api.removeEventListener("b_preview", onPreview);
      api.removeEventListener("executed", onExecuted);
      api.removeEventListener("execution_success", onSuccess);
      api.removeEventListener("execution_error", onError);
      api.removeEventListener("execution_interrupted", onError);
      if (promptId) externallyTrackedPrompts.delete(promptId);
      setPreview(null);
    };
    run.cleanup = cleanup;

    const takeStart = (d) => { if (d?.prompt_id === promptId) run.executionStarted = true; };
    const takeProgress = (d) => {
      if (d?.prompt_id !== promptId || run.cancelled) return;
      run.executionStarted = true;
      tracker.emit({ phase: "running", value: d.value, max: d.max, previewUrl });
    };
    const takeExecuted = (d) => {
      if (d?.prompt_id !== promptId || !d?.output?.images?.length) return;
      lastTemp = d.output.images[d.output.images.length - 1];
    };
    const takeSuccess = (d) => {
      if (d?.prompt_id !== promptId) return;
      cleanup();
      if (run.cancelled) return;
      if (!lastTemp) { tracker.emit({ phase: "error", message: "run produced no image" }); return; }
      tracker.emit({ phase: "done", temp: lastTemp, meta, workflowId });
    };
    const takeError = (d) => {
      if (d?.prompt_id !== promptId) return;
      cleanup();
      if (run.cancelled) return;
      const message = d?.exception_message || "execution failed";
      tracker.emit({ phase: "error", message });
      toast("error", `i2i failed: ${message}`);
    };

    // b_preview carries no prompt_id and self-gates on run.executionStarted, so
    // it's safe to handle live. The prompt_id-matching events buffer until the id
    // is known, then replay.
    const onStart = ({ detail }) => idKnown ? takeStart(detail) : pending.push(["start", detail]);
    const onProgress = ({ detail }) => idKnown ? takeProgress(detail) : pending.push(["progress", detail]);
    const onExecuted = ({ detail }) => idKnown ? takeExecuted(detail) : pending.push(["executed", detail]);
    const onSuccess = ({ detail }) => idKnown ? takeSuccess(detail) : pending.push(["success", detail]);
    const onError = ({ detail }) => idKnown ? takeError(detail) : pending.push(["error", detail]);
    const onPreview = ({ detail }) => {
      if (run.cancelled || !run.executionStarted || !(detail instanceof Blob)) return;
      const url = setPreview(detail);
      const s = tracker.state;
      if (s.phase === "running") tracker.emit({ ...s, previewUrl: url });
    };
    api.addEventListener("execution_start", onStart);
    api.addEventListener("progress", onProgress);
    api.addEventListener("b_preview", onPreview);
    api.addEventListener("executed", onExecuted);
    api.addEventListener("execution_success", onSuccess);
    api.addEventListener("execution_error", onError);
    api.addEventListener("execution_interrupted", onError);

    armExternalQueue();
    try {
      const previewMethod = app.extensionManager?.setting?.get?.("Comfy.Execution.PreviewMethod")
        ?? app.ui?.settings?.getSettingValue?.("Comfy.Execution.PreviewMethod")
        ?? "default";
      const res = await api.queuePrompt(0, { output: built.graph, workflow: workflowExtra }, { previewMethod });
      promptId = res?.prompt_id || null;
    } catch (e) {
      disarmExternalQueue();
      cleanup();
      const message = e?.response?.error?.message || e?.message || "queue rejected the prompt";
      tracker.emit({ phase: "error", message });
      toast("error", `i2i failed to queue: ${message}`);
      return;
    }
    if (!promptId) {
      disarmExternalQueue();
      cleanup();
      tracker.emit({ phase: "error", message: "queue returned no prompt id" });
      return;
    }
    externallyTrackedPrompts.add(promptId);
    disarmExternalQueue();
    run.promptId = promptId;
    meta = collectI2IMeta(built.graph, built.detailId, data, options);
    if (run.cancelled) {
      try {
        await api.fetchApi("/queue", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete: [promptId] }),
        });
      } catch {}
      cleanup();
      return;
    }
    tracker.emit({ phase: "running" });

    // The id is known — drain anything that arrived first (a cached run can have
    // already fired success). executed before success so lastTemp is set.
    idKnown = true;
    for (const [k, d] of pending) if (k === "start") takeStart(d);
    for (const [k, d] of pending) if (k === "progress") takeProgress(d);
    for (const [k, d] of pending) if (k === "executed") takeExecuted(d);
    for (const [k, d] of pending) { if (k === "success") takeSuccess(d); else if (k === "error") takeError(d); }
    pending.length = 0;
  })().catch((e) => {
    console.error("[PromptChain] i2i run failed", e);
    tracker.emit({ phase: "error", message: e?.message || "unexpected failure" });
    toast("error", `i2i failed: ${e?.message || e}`);
  });
  return tracker;
}
