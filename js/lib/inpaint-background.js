// Viewer "Inpaint": paint a mask over the image, type a prompt, Apply renders
// in the background (PreviewImage → temp dir, so attempts never touch the
// output tree), Save finalizes the chosen render via /promptchain/save-temp-
// image (copy + history record with parent lineage — no re-render).
//
// Build strategy: pure JSON surgery on the image's EMBEDDED API PROMPT (the
// exact node graph it was rendered with, returned by /promptchain/image-
// workflow). The model line (checkpoint, LoRAs, clip skip, VAE) carries over
// verbatim; image + mask + conditioning go to PromptChain_MaskedDetail —
// crop-and-upscale rendering (A1111 'only masked'), so a small painted region
// samples at full model resolution instead of the few latent pixels it
// occupies on canvas. The prompt rides a fresh PromptChain node (wildcards,
// // comments and the Negative Prompt: section compile server-side as usual).
// The user's open workflow, tabs, canvas and undo history are never touched.

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { externallyTrackedPrompts, refreshEntryWorkflows, armExternalQueue, disarmExternalQueue } from "./history.js";
import { sourceSavePrefixInfo, fetchSavedUsduSettings, fetchEngineModels, engineAssetSupport, QWEN_ENHANCE_INSTRUCTION, FLUX1_TILE_GUIDANCE } from "./upscale-from-image.js";
import { resolvePre, hasPre } from "./model-settings-bridge.js";
import { offscreenIdBase } from "./offscreen-graph.js";

function toast(severity, detail) {
  app.extensionManager?.toast?.add({ severity, summary: "Inpaint", detail, life: 7000 });
}

export function freshWorkflowId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createTracker() {
  const listeners = new Set();
  const tracker = {
    state: { phase: "building" },
    subscribe(fn) {
      listeners.add(fn);
      fn(tracker.state);
      return () => listeners.delete(fn);
    },
    emit(state) {
      tracker.state = state;
      for (const fn of listeners) {
        try { fn(state); } catch {}
      }
    },
  };
  return tracker;
}

// Live enum lists off an off-graph probe node — node defs carry them.
function ksamplerComboOptions() {
  try {
    const probe = window.LiteGraph?.createNode?.("KSampler");
    const opts = (name) => probe?.widgets?.find((w) => w.name === name)?.options?.values || [];
    return { samplers: opts("sampler_name"), schedulers: opts("scheduler") };
  } catch {
    return { samplers: [], schedulers: [] };
  }
}

// Nodes that can anchor the graft: they carry steps/cfg/sampler settings and
// a model input to trace. MaskedDetail makes inpaint results re-inpaintable
// (their pruned prompt has no KSampler), USDU covers upscale results.
const SAMPLER_CLASSES = ["KSampler", "KSamplerAdvanced", "PromptChain_MaskedDetail", "UltimateSDUpscale"];

function findAnchor(apiPrompt) {
  const entries = Object.entries(apiPrompt || {});
  for (const cls of SAMPLER_CLASSES) {
    const hit = entries.find(([, n]) => n?.class_type === cls);
    if (hit) return { id: hit[0], entry: hit[1] };
  }
  return null;
}

// The prompt the image was actually made from — the source PromptChain
// entry's own text (// comments and the Negative Prompt: section intact).
// $name{...} region blocks are stripped: the inpaint conditioning is a plain
// text encode with no regional masking, so per-figure blocks would smear
// both characters' traits into the painted crop. The global text is the
// right starting point; the user types what the region should become.
// Chained PC networks: best-effort longest text.
export function sourcePromptText(apiPrompt) {
  let best = "";
  for (const entry of Object.values(apiPrompt || {})) {
    if (entry?.class_type !== "PromptChain_PromptChain") continue;
    const text = typeof entry.inputs?.prompt === "string" ? entry.inputs.prompt : "";
    if (text.trim().length > best.trim().length) best = text;
  }
  return best
    .replace(/\$\w+\s*\{[^}]*\}/g, "")   // char classes match newlines — whole blocks go
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Longest PromptChain node prompt verbatim — char blocks intact, for the
// read-only reference box (unlike sourcePromptText, which strips them for the
// editable prefill).
export function sourcePromptTextFull(apiPrompt) {
  let best = "";
  for (const entry of Object.values(apiPrompt || {})) {
    if (entry?.class_type !== "PromptChain_PromptChain") continue;
    const text = typeof entry.inputs?.prompt === "string" ? entry.inputs.prompt : "";
    if (text.trim().length > best.trim().length) best = text;
  }
  return best.trim();
}

// The original workflow prompt (raw $char blocks and all) only survives on the
// LIVE graph node — an image's EMBEDDED prompt is the compiled/pruned graph, and
// a re-inpaint result embeds only the prior inpaint's prompt, not the workflow's.
// When the viewer was opened from the workflow, the current PromptChain node
// prompt is the right reference.
export function liveWorkflowPrompt() {
  const nodes = app?.graph?._nodes || [];
  let best = "";
  for (const n of nodes) {
    if (n?.comfyClass !== "PromptChain_PromptChain") continue;
    const text = n.widgets?.find((w) => w.name === "prompt")?.value;
    if (typeof text === "string" && text.trim().length > best.trim().length) best = text;
  }
  return best.trim();
}

// What the image was actually sampled with — read straight off the embedded
// API prompt's anchor entry (values are baked literals there).
function sourceSamplerChoice(apiPrompt) {
  const entry = findAnchor(apiPrompt)?.entry;
  return {
    sampler: typeof entry?.inputs?.sampler_name === "string" ? entry.inputs.sampler_name : null,
    scheduler: typeof entry?.inputs?.scheduler === "string" ? entry.inputs.scheduler : null,
  };
}

// Follow an Apply node's `image` input through the embedded API prompt to the
// LoadImage it came from, returning that reference's filename (already in
// input/). Returns null if the image was never made with this condition.
function detectConditionReference(apiPrompt, applyClasses) {
  const apply = Object.values(apiPrompt || {}).find((n) => applyClasses.includes(n?.class_type));
  if (!apply) return null;
  let ref = apply.inputs?.image;
  const seen = new Set();
  while (Array.isArray(ref) && ref.length === 2) {
    const srcId = String(ref[0]);
    if (seen.has(srcId)) break;
    seen.add(srcId);
    const node = apiPrompt[srcId];
    if (!node) break;
    if (node.class_type === "LoadImage" && typeof node.inputs?.image === "string") return node.inputs.image;
    ref = node.inputs?.image;
  }
  return typeof ref === "string" ? ref : null;
}

// Region → Inpaint handoff from the Edit modal: inpaint the (edited) composite
// over the painted region, reusing the image's embedded workflow for the model.
// Uploads the composite to input/ and overrides input_ref so LoadImage reads it.
// Returns the same tracker as runInpaint; the caller adds the result as a layer.
export async function inpaintRegion(data, { imageBlob, maskBlob, prompt, denoise }) {
  if (!data) throw new Error("no workflow data for inpaint");
  const compositeName = await uploadInputImage(new File([imageBlob], "promptchain_edit.png", { type: "image/png" }));
  const prepared = { data: { ...data, input_ref: compositeName } };
  return runInpaint(prepared, { maskBlob, prompt: prompt || "", denoise: denoise ?? 0.5, condition: "none" });
}

async function packPresent(injectable) {
  try {
    const res = await api.fetchApi(`/promptchain/nodepacks/status?injectable=${encodeURIComponent(injectable)}`);
    if (res.ok) { const s = await res.json(); return typeof s.present === "boolean" ? s.present : false; }
  } catch {}
  return false;
}

// Mirror of analyzeUpscaleCaps for the inpaint conditions. ok = the condition is
// applicable to this image (SDXL only for now); installed = its node pack is
// present; reference = the image's own reference (auto-seed) when it was made
// with that condition.
// Architecture of the image's own render graph (the "source" engine). Determines
// which PuLID adapter the condition graft uses. flux1 (e.g. Krea/dev) vs flux2
// (Klein) matters: they need different PuLID nodes.
function inpaintArch(entries) {
  const has = (...cls) => entries.some((n) => cls.includes(n?.class_type));
  if (has("CheckpointLoaderSimple", "CheckpointLoader")) return "sdxl";
  const clipType = String(entries.find((n) => n?.class_type === "CLIPLoader")?.inputs?.type || "").toLowerCase();
  if (clipType === "flux2") return "flux2";
  if (clipType === "krea2") return "krea2"; // Krea 2 DiT: UNETLoader+CLIPLoader(type krea2) — must not fall through to flux1 (would mis-wire PuLID)
  if (has("DualCLIPLoader") || clipType === "flux" || has("UNETLoader", "UnetLoaderGGUF")) return "flux1";
  return "other";
}

async function analyzeInpaintConditions(apiPrompt) {
  const entries = Object.values(apiPrompt || {});
  const arch = inpaintArch(entries);
  const isSdxl = arch === "sdxl";
  const isFlux1 = arch === "flux1";
  const reg = window.LiteGraph?.registered_node_types || {};
  const fluxPulid = !!reg["ApplyPulidFlux"]; // ComfyUI_PuLID_Flux_ll (Flux.1 identity)
  const [pulidInstalled, ipaInstalled] = await Promise.all([packPresent("PuLID"), packPresent("StyleReference")]);
  const pulidRef = detectConditionReference(apiPrompt, ["ApplyPulidAdvanced", "ApplyPulid", "ApplyPulidFlux"]);
  const ipaRef = detectConditionReference(apiPrompt, ["IPAdapterAdvanced"]);
  // PuLID works on the SOURCE model: SDXL (ApplyPulidAdvanced) or Flux.1
  // (ApplyPulidFlux). flux2/qwen sources have no wired PuLID path yet.
  const pulidOk = isSdxl || (isFlux1 && fluxPulid);
  const pulidReason = pulidOk ? undefined
    : isFlux1 ? "Flux PuLID node not installed (ComfyUI_PuLID_Flux_ll)."
    : "PuLID needs an SDXL or Flux.1 source image.";
  const conditions = {
    pulid: { ok: pulidOk, reason: pulidReason, installed: isFlux1 ? fluxPulid : pulidInstalled, reference: pulidRef || "" },
    ipadapter: { ok: isSdxl, reason: isSdxl ? undefined : "IP-Adapter is SDXL-only for now.", installed: ipaInstalled, reference: ipaRef || "" },
  };
  const defaultCondition = ipaRef ? "ipadapter" : pulidRef ? "pulid" : "none";
  return { conditions, defaultCondition };
}

// Content-addressed upload of a reference / composite image, scoped to the
// input/promptchain_inpaint subfolder (same rule as the mask upload). The
// grafted LoadImage resolves the subfolder-prefixed value at execution; when the
// return becomes input_ref/parent_filename the python lineage records its real
// subfolder. Returns "promptchain_inpaint/<name>".
export async function uploadInputImage(file) {
  const buf = await file.arrayBuffer();
  let digest;
  try {
    const hash = await crypto.subtle.digest("SHA-256", buf);
    digest = [...new Uint8Array(hash)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    digest = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 6)}`.slice(0, 12);
  }
  const ext = (file.name?.match(/\.\w+$/)?.[0] || ".png").toLowerCase();
  const name = `promptchain_ref_${digest}${ext}`;
  const form = new FormData();
  form.append("image", new File([file], name, { type: file.type || "image/png" }));
  form.append("subfolder", "promptchain_inpaint");
  form.append("type", "input");
  form.append("overwrite", "true");
  const resp = await api.fetchApi("/upload/image", { method: "POST", body: form });
  if (!resp.ok) throw new Error("reference upload failed");
  const j = await resp.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : (j.name || name);
}

// Depth ControlNet assets: the preprocessor + apply node registered and an
// SDXL union CN in the loader's combo (the same probe the upscale modal gates
// its depth row on).
function inpaintDepthAssets() {
  try {
    const LG = window.LiteGraph;
    if (!hasPre("DepthAnythingV2Preprocessor")) return false;
    if (!LG?.registered_node_types?.["ControlNetApplyAdvanced"]) return false;
    const probe = LG.createNode("ControlNetLoader");
    const opts = probe?.widgets?.find((w) => w.name === "control_net_name")?.options?.values || [];
    return opts.some((o) => /union/i.test(o));
  } catch { return false; }
}
// Resolve a combo widget's value from an off-graph node instance (no graph
// touched), preferring a match — how the build picks a real installed file.
function probeComboValue(nodeClass, widgetName, prefer) {
  try {
    const n = window.LiteGraph?.createNode(nodeClass);
    const opts = n?.widgets?.find((w) => w.name === widgetName)?.options?.values || [];
    if (prefer) { const hit = opts.find(prefer); if (hit) return hit; }
    return opts[0] || null;
  } catch { return null; }
}

export async function prepareInpaint(entry) {
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
  // No sampler in the image's own render data — an imported image, or a pure
  // model-upscale (ESRGAN enlarge embeds LoadImage→Upscale only). Fall back to
  // the LIVE workflow graph as the render recipe: the graft only needs a
  // sampler/model cluster to anchor on; the image still rides in as input_ref.
  if (!findAnchor(data.prompt)) {
    try {
      const live = await app.graphToPrompt();
      if (live?.output && findAnchor(live.output)) {
        data.prompt = JSON.parse(JSON.stringify(live.output));
        if (live.workflow) data.workflow = JSON.parse(JSON.stringify(live.workflow));
      }
    } catch (e) {
      console.warn("[PromptChain] live-graph fallback failed", e);
    }
  }
  const entries = Object.values(data.prompt || {});
  // Mirrors what buildInpaintPrompt can actually trace: an anchor, a model
  // loader, AND a clip line for the fresh text encodes (CLIPTextEncode, a
  // regional node, or a checkpoint's clip slot). Qwen-edit graphs pass the
  // anchor check (KSampler) but condition via TextEncodeQwenImageEditPlus —
  // no traceable clip — and MaskedDetail can't sample an edit model anyway;
  // they route to the engine picker instead of erroring at Apply.
  const sourceUsable = !!findAnchor(data.prompt)
    && entries.some((n) => ["CheckpointLoaderSimple", "CheckpointLoader", "UNETLoader"].includes(n?.class_type))
    && entries.some((n) => ["CLIPTextEncode", "CLIPLoader", "PromptChain_AttentionCouple", "PromptChain_RegionalConditioning",
      "CheckpointLoaderSimple", "CheckpointLoader"].includes(n?.class_type));
  // Engine models make any image inpaintable — a picked SDXL checkpoint
  // builds a standalone MaskedDetail graph, no render metadata needed (side-
  // panel imports, plain photos).
  let engineModels = [];
  try {
    const support = engineAssetSupport();
    // support.flux1 is the upscale-engine probe (includes USDU/ESRGAN the
    // inpaint path doesn't need) — close enough; the loaders it does need
    // (dual clip + flux VAE) are part of that check.
    engineModels = (await fetchEngineModels()).filter((m) => m.architecture === "sdxl"
      || (m.architecture === "qwen_edit" && support.qwen)
      || (m.architecture === "flux" && support.flux1)
      // Krea 2 DiT: UNETLoader + CLIPLoader(type krea2) + qwen_image VAE, all
      // self-contained in buildKrea2InpaintPrompt — admit unless the support
      // probe explicitly reports the krea2 assets absent.
      || (m.architecture === "krea2" && support.krea2 !== false));
  } catch { /* engine list is optional — source surgery still works */ }
  if (!sourceUsable && !engineModels.length) {
    // Apply would die in buildInpaintPrompt — refuse with the reason up front.
    toast("error", "This image carries no render data to inpaint with, no compatible engine model is installed, and the open workflow has no sampler to borrow.");
    return null;
  }
  const { prefix } = sourceSavePrefixInfo(data.workflow);
  const defaultSavePrefix = prefix
    ? (prefix.endsWith("_inpaint") ? prefix : `${prefix}_inpaint`)
    : "inpaint/inpaint";

  // Sampler/scheduler: selected default = the image's own choice (the graft
  // reuses its sampler), green ● = the model config's recommendation, blue =
  // config alternates — same scheme as the upscale modal.
  const combos = ksamplerComboOptions();
  const choice = sourceSamplerChoice(data.prompt);
  const { ksampler, hash: sourceHash, architecture: sourceArch } = await fetchSavedUsduSettings(data.workflow);
  const { conditions, defaultCondition } = await analyzeInpaintConditions(data.prompt);
  // Reference = the live workflow's prompt when opened from the workflow
  // (tracked image, no browse path), else the image's own full embedded prompt.
  const fromWorkflow = entry._browsePath == null;
  const referencePrompt = (fromWorkflow && liveWorkflowPrompt()) || sourcePromptTextFull(data.prompt);
  // Regional inpaint is on the table when the source scene carries a 3D Poser
  // (per-figure masks + pose) and the prompt still has $name{} blocks — then
  // the modal seeds the full source and the build wires RegionalConditioning.
  const hasPose = entries.some((n) => n?.class_type === "PromptChain_PoseStudio");
  const regionalAvailable = sourceUsable && hasPose && /\$\w+\s*\{/.test(referencePrompt || "");
  // Depth = an SDXL union ControlNet over a DepthAnything hint of the input,
  // cropped to the detail window. SDXL source only (the union net is SDXL).
  const isSdxl = entries.some((n) => ["CheckpointLoaderSimple", "CheckpointLoader"].includes(n?.class_type));
  const depthAvailable = sourceUsable && isSdxl && inpaintDepthAssets();
  return {
    data,
    caps: {
      inpaintable: true, sourceUsable, engineModels, regionalAvailable, depthAvailable,
      // The modal's prompt editor scopes templates/autocomplete to this when
      // the source engine is selected (a picked engine model overrides it).
      sourceModelInfo: sourceHash ? { hash: sourceHash, architecture: sourceArch } : null,
      defaultSavePrefix, defaultDenoise: 0.5,
      conditions, defaultCondition,
      prefillPrompt: sourcePromptText(data.prompt),
      referencePrompt,
      samplerOptions: combos.samplers,
      schedulerOptions: combos.schedulers,
      // Nothing to inherit (metadata-less image, no model config) → the SDXL
      // photoreal pair, not whatever enum happens to come first.
      defaultSampler: choice.sampler || ksampler?.sampler_name
        || combos.samplers.find((s) => s === "dpmpp_2m") || combos.samplers[0] || null,
      defaultScheduler: choice.scheduler || ksampler?.scheduler
        || combos.schedulers.find((s) => s === "karras") || combos.schedulers[0] || null,
      recommendedSampler: ksampler?.sampler_name || null,
      recommendedScheduler: ksampler?.scheduler || null,
      samplerAlternates: ksampler?.sampler_name_options || [],
      schedulerAlternates: ksampler?.scheduler_options || [],
    },
  };
}

// Content-addressed mask upload, scoped to the input/promptchain_inpaint
// subfolder (not the input ROOT) so it never pollutes LoadImage's combo and is
// age-swept as a group. LoadImageMask still resolves the subfolder-prefixed
// value via get_annotated_filepath (VALIDATE_INPUTS skips combo-membership) —
// the same path PoseStudio's control_map already takes. Returns the scoped
// "promptchain_inpaint/<name>" the LoadImageMask.image widget should carry.
async function uploadMask(blob) {
  let digest;
  try {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    digest = [...new Uint8Array(hash)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    digest = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 6)}`.slice(0, 12);
  }
  const name = `promptchain_mask_${digest}.png`;
  const form = new FormData();
  form.append("image", new File([blob], name, { type: "image/png" }));
  form.append("subfolder", "promptchain_inpaint");
  form.append("type", "input");
  form.append("overwrite", "true");
  const resp = await api.fetchApi("/upload/image", { method: "POST", body: form });
  if (!resp.ok) throw new Error("mask upload failed");
  const j = await resp.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : (j.name || name);
}

const numOr = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

// Condition graft: optionally splice a PuLID / Style Reference (IPAdapter)
// cluster between the base model and MaskedDetail.model, so the masked re-
// render carries a face-identity or style reference. Same node clusters as the
// canvas injects (injectPuLID / injectStyleReference), as API-prompt JSON. The
// crop is global to the model patch, so no region-mask remapping is needed.
// "__self__" = lock to the image being inpainted (no upload needed) — same
// zero-config anchor the upscale modal's Character lock uses.
function spliceConditionCluster(add, options, modelRef, selfRef, arch = "sdxl") {
  const weightOr = (fallback) => (typeof options.conditionWeight === "number" ? options.conditionWeight : fallback);
  const refImage = options.referenceImage === "__self__" ? selfRef : options.referenceImage;
  if (options.condition === "pulid" && refImage && arch === "flux1") {
    // Flux.1 PuLID (ComfyUI_PuLID_Flux_ll) — ApplyPulidFlux patches the Flux UNET
    // with face identity. No projection/fidelity knobs (those are the SDXL node's).
    const pmlId = add("PulidFluxModelLoader", { pulid_file: "pulid_flux_v0.9.1.safetensors" });
    const iflId = add("PulidFluxInsightFaceLoader", { provider: "CUDA" });
    const evaId = add("PulidFluxEvaClipLoader", {});
    const refId = add("LoadImage", { image: refImage });
    const aplId = add("ApplyPulidFlux", {
      model: modelRef, pulid_flux: [pmlId, 0], eva_clip: [evaId, 0], face_analysis: [iflId, 0], image: [refId, 0],
      weight: weightOr(0.9), start_at: numOr(options.pulidStartAt, 0), end_at: numOr(options.pulidEndAt, 1),
    });
    return [aplId, 0];
  }
  if (options.condition === "ipadapter" && refImage) {
    const loaderId = add("IPAdapterUnifiedLoader", { model: modelRef, preset: "PLUS (high strength)" });
    const refId = add("LoadImage", { image: refImage });
    const ipaId = add("IPAdapterAdvanced", {
      model: [loaderId, 0], ipadapter: [loaderId, 1], image: [refId, 0],
      weight: weightOr(0.7), weight_type: options.ipaWeightType || "style transfer", combine_embeds: "concat",
      start_at: numOr(options.ipaStartAt, 0), end_at: numOr(options.ipaEndAt, 0.7), embeds_scaling: "V only",
    });
    return [ipaId, 0];
  }
  if (options.condition === "pulid" && refImage) {
    const pmlId = add("PulidModelLoader", { pulid_file: "ip-adapter_pulid_sdxl_fp16.safetensors" });
    const iflId = add("PulidInsightFaceLoader", { provider: "CUDA" });
    const evaId = add("PulidEvaClipLoader", {});
    const refId = add("LoadImage", { image: refImage });
    const aplId = add("ApplyPulidAdvanced", {
      model: modelRef, pulid: [pmlId, 0], eva_clip: [evaId, 0], face_analysis: [iflId, 0], image: [refId, 0],
      weight: weightOr(0.45), projection: "ortho_v2",
      fidelity: numOr(options.pulidFidelity, 4), noise: 0,
      start_at: numOr(options.pulidStartAt, 0), end_at: numOr(options.pulidEndAt, 1),
    });
    return [aplId, 0];
  }
  return modelRef;
}

// Build the inpaint prompt from the image's embedded API prompt. Returns the
// new prompt graph, or throws with a user-facing message. Exported for the
// offline ESM harness — pure JSON in/out, no app/canvas dependence.
export function buildInpaintPrompt(apiPrompt, data, options, maskName) {
  // Strip to {class_type, inputs} — embedded prompts carry execution leftovers
  // (is_changed etc.) we don't want to resubmit. JSON round-trip, NOT
  // structuredClone: the prepared data sits in a Svelte $state, whose deep
  // reactive Proxy structuredClone refuses to clone.
  const graph = {};
  for (const [id, entry] of Object.entries(apiPrompt || {})) {
    if (!entry || typeof entry.class_type !== "string") continue;
    graph[id] = { class_type: entry.class_type, inputs: JSON.parse(JSON.stringify(entry.inputs || {})) };
  }
  const idByClass = (...cls) => Object.keys(graph).find((id) => cls.includes(graph[id].class_type));
  const isLink = (v) => Array.isArray(v) && v.length === 2 && !!graph[String(v[0])];

  const anchor = findAnchor(graph);
  if (!anchor) throw new Error("no sampler in this image's render data");
  const src = anchor.entry;

  // The attention couple PATCHES the model with the source gen's per-region
  // conditioning — keep it and the original prompts override the inpaint
  // prompt inside every figure mask. Trace to the unpatched model (LoRA
  // loaders etc. stay; only the couple bakes prompt content).
  let modelRef = src.inputs.model;
  while (isLink(modelRef) && graph[String(modelRef[0])].class_type === "PromptChain_AttentionCouple") {
    modelRef = graph[String(modelRef[0])].inputs.model;
  }
  if (!isLink(modelRef)) throw new Error("the sampler has no model wired");

  const ckptId = idByClass("CheckpointLoaderSimple", "CheckpointLoader");
  // CLIP: an existing text encode's source, else a regional node's (couple or
  // conditioning — both carry the clip-skip line), else the checkpoint.
  const encId = idByClass("CLIPTextEncode");
  const regionalId = idByClass("PromptChain_AttentionCouple", "PromptChain_RegionalConditioning");
  // Z-Image / split graphs have no CLIPTextEncode and no checkpoint clip slot — fall
  // back to a standalone CLIPLoader (the lumina2/qwen encoder) so the source path can
  // encode the inpaint prompt against the image's own model.
  const clipLoaderId = idByClass("CLIPLoader");
  const clipRef = (encId && isLink(graph[encId].inputs.clip) && graph[encId].inputs.clip)
    || (regionalId && isLink(graph[regionalId].inputs.clip) && graph[regionalId].inputs.clip)
    || (clipLoaderId && [clipLoaderId, 0])
    || (ckptId && [ckptId, 1]);
  // VAE: whatever decodes today, else the anchor's own vae input (MaskedDetail
  // and USDU carry one; a pruned inpaint graph has no VAEDecode), else the
  // checkpoint's.
  const decId = idByClass("VAEDecode", "VAEUtils_VAEDecodeTiled", "VAEDecodeTiled");
  let vaeRef = (decId && isLink(graph[decId].inputs.vae) && graph[decId].inputs.vae)
    || (isLink(src.inputs.vae) && src.inputs.vae)
    || (ckptId && [ckptId, 2]);
  if (!clipRef) throw new Error("couldn't trace the clip/vae lines");

  // Grafted nodes go far above both the source graph's ids and the live canvas's,
  // so the background run's execution images never paint onto a live node.
  let nextId = offscreenIdBase();
  const add = (class_type, inputs) => {
    const id = String(nextId++);
    graph[id] = { class_type, inputs };
    return id;
  };

  // The traced VAE may be a decode-only/2x custom loader (the spacepxl VAEUtils
  // decoder on High-Detail krea2 renders) that CAN'T encode — inpaint needs both
  // encode and decode. If the trace failed or landed on that custom loader,
  // graft a fresh stock VAELoader on the shared krea2/qwen latent (prefer
  // qwen_image_vae, else the clean wan_2.1_vae).
  const tracedVae = isLink(vaeRef) ? graph[String(vaeRef[0])] : null;
  if (!vaeRef || (tracedVae && tracedVae.class_type === "VAEUtils_CustomVAELoader")) {
    const vaeName = probeComboValue("VAELoader", "vae_name", (o) => /qwen.*image.*vae/i.test(o))
      || probeComboValue("VAELoader", "vae_name", (o) => /wan.*2[._]?1.*vae/i.test(o) && !/upscale|2x/i.test(o));
    if (!vaeName) throw new Error("couldn't trace the clip/vae lines");
    vaeRef = [add("VAELoader", { vae_name: vaeName }), 0];
  }

  const loadId = add("LoadImage", { image: data.input_ref });
  const maskId = add("LoadImageMask", { image: maskName, channel: "red" });
  const pcId = add("PromptChain_PromptChain", {
    prompt: options.prompt || "", mode: "combine", switch_index: 1,
    locked: false, disabled: false, cached_output: "", cached_neg_output: "",
    iterate_index: 0, iterate_cycle: 1, collapsed: false,
    wildcard_modes: "", cached_regions: "",
  });
  // Regional inpaint: when the prompt carries $name{} blocks AND the source
  // scene has a 3D Poser (per-figure masks + pose), feed MaskedDetail from
  // RegionalConditioning instead of a flat encode. MaskedDetail crops each
  // region's cond mask onto the painted crop (_crop_cond_to_window), so a
  // crop over one figure samples with that figure's own prompt — no manual
  // region pick, and a crop spanning two figures splits spatially. Falls back
  // to the flat encode (which strips $blocks) for non-regional images.
  const poseId = idByClass("PromptChain_PoseStudio");
  // Mode drives the conditioning: regional modes feed RegionalConditioning,
  // basic/depth feed a flat encode. "basic"/"depth" force flat even if $blocks
  // survived; undefined uses the $block + pose heuristic.
  const regionalMode = options.mode == null || options.mode === "regional" || options.mode === "regional-depth";
  // Moved content stays REGIONAL: the full $block source rides, and the cond
  // masks are read at the content's ORIGIN via cond_offset on MaskedDetail
  // (below), so the moved figure keeps its OWN region prompt wherever it landed.
  const wantRegional = regionalMode && !!poseId && /\$\w+\s*\{/.test(options.prompt || "");
  let posRef, negRef;
  if (wantRegional) {
    // PromptChain regions output = slot 3; PoseStudio MASKS = 2, POSE_JSON = 1.
    const rcId = add("PromptChain_RegionalConditioning", {
      clip: clipRef, regions: [pcId, 3],
      masks: [poseId, 2], pose: [poseId, 1], mask_dilation: 22,
    });
    posRef = [rcId, 0]; negRef = [rcId, 1];
  } else {
    // PC output slots: out=0, positive=1, negative=2.
    const posId = add("CLIPTextEncode", { text: [pcId, 1], clip: clipRef });
    const negId = add("CLIPTextEncode", { text: [pcId, 2], clip: clipRef });
    posRef = [posId, 0]; negRef = [negId, 0];
  }

  // Depth mode ("depth" / "regional-depth"): an SDXL union ControlNet over a
  // DepthAnything hint of the input. MaskedDetail crops the full-canvas hint to
  // the detail window (_crop_cond_to_window), so structure holds without the
  // whole scene's depth stretching over the crop.
  if (options.mode === "depth" || options.mode === "regional-depth") {
    const cnFile = probeComboValue("ControlNetLoader", "control_net_name", (o) => /union.*promax/i.test(o))
      || probeComboValue("ControlNetLoader", "control_net_name", (o) => /union/i.test(o))
      || "xinsir-union-promax-sdxl.safetensors";
    const depthPre = resolvePre("DepthAnythingV2Preprocessor");
    const depthCkpt = probeComboValue(depthPre, "ckpt_name", (o) => /vitl/i.test(o))
      || probeComboValue(depthPre, "ckpt_name", () => true)
      || "depth_anything_v2_vitl.pth";
    const preId = add(depthPre, { image: [loadId, 0], ckpt_name: depthCkpt, resolution: 1024 });
    const cnLoadId = add("ControlNetLoader", { control_net_name: cnFile });
    const unionId = add("SetUnionControlNetType", { control_net: [cnLoadId, 0], type: "depth" });
    const applyId = add("ControlNetApplyAdvanced", {
      positive: posRef, negative: negRef, control_net: [unionId, 0], image: [preId, 0],
      strength: 0.7, start_percent: 0.0, end_percent: 0.8,
    });
    posRef = [applyId, 0]; negRef = [applyId, 1];
  }

  const modelForDetail = spliceConditionCluster(add, options, modelRef, data.input_ref, inpaintArch(Object.values(graph)));

  // Sampling settings: inherit the source gen's steps/cfg (and its sampler
  // pick when the modal didn't override), randomize the seed. EVERY non-
  // optional input must be present — API-format validation requires the keys
  // even though the schema carries defaults (crop/feather values below mirror
  // the node's own).
  const lit = (v) => (Array.isArray(v) || v === undefined ? null : v);
  const detailId = add("PromptChain_MaskedDetail", {
    model: modelForDetail, vae: vaeRef,
    image: [loadId, 0], mask: [maskId, 0],
    positive: posRef, negative: negRef,
    seed: Math.floor(Math.random() * 0xffffffffff),
    steps: numOr(options.steps, lit(src.inputs.steps) ?? 20),
    cfg: numOr(options.cfg, lit(src.inputs.cfg) ?? 7),
    sampler_name: options.sampler || lit(src.inputs.sampler_name) || "euler",
    scheduler: options.scheduler || lit(src.inputs.scheduler) || "normal",
    denoise: typeof options.denoise === "number" ? options.denoise : 0.5,
    guide_size: 512, max_size: 1024, crop_factor: 2.0,
    feather: numOr(options.feather, 24), grow: numOr(options.grow, 0),
    // Moved-content regional: read the region masks at the content's ORIGIN so
    // the moved figure keeps its own prompt (0/0 = in-place, no shift).
    cond_offset_x: Math.round(numOr(options.condOffset?.x, 0)),
    cond_offset_y: Math.round(numOr(options.condOffset?.y, 0)),
  });
  const previewId = add("PreviewImage", { images: [detailId, 0] });

  // Prune to the preview's upstream closure — the source gen (sampler, pose,
  // couple, old prompt/encodes, saves) all falls away.
  const keep = new Set();
  const stack = [previewId];
  while (stack.length) {
    const id = stack.pop();
    if (keep.has(id)) continue;
    keep.add(id);
    for (const v of Object.values(graph[id].inputs || {})) {
      if (isLink(v)) stack.push(String(v[0]));
    }
  }
  for (const id of Object.keys(graph)) {
    if (!keep.has(id)) delete graph[id];
  }

  console.log("[PromptChain][inpaint] built prompt:", JSON.stringify(graph, null, 2));
  return { graph, detailId };
}

// Standalone engine inpaint: a fresh MaskedDetail graph on a PICKED SDXL
// checkpoint — no embedded prompt needed, so side-panel imports and plain
// photos inpaint too, and flux2 sources gain the SDXL-only conditions
// (PuLID / Style Reference). Cross-model i2i at masked denoise is routine;
// the crop samples at full model resolution like the surgery path.
export function buildInpaintEnginePrompt(data, options, maskName) {
  const filename = options.engineModel?.filename;
  if (!filename) throw new Error("no engine model picked");
  const graph = {};
  let nextId = offscreenIdBase(); // render-node ids must stay off the live canvas — else execution images paint onto a live node sharing the id (see offscreen-graph.js)
  const add = (class_type, inputs) => {
    const id = String(nextId++);
    graph[id] = { class_type, inputs };
    return id;
  };
  const ckptId = add("CheckpointLoaderSimple", { ckpt_name: filename });
  const loadId = add("LoadImage", { image: data.input_ref });
  const maskId = add("LoadImageMask", { image: maskName, channel: "red" });
  const pcId = add("PromptChain_PromptChain", {
    prompt: options.prompt || "", mode: "combine", switch_index: 1,
    locked: false, disabled: false, cached_output: "", cached_neg_output: "",
    iterate_index: 0, iterate_cycle: 1, collapsed: false,
    wildcard_modes: "", cached_regions: "",
  });
  // PC output slots: out=0, positive=1, negative=2.
  const posId = add("CLIPTextEncode", { text: [pcId, 1], clip: [ckptId, 1] });
  const negId = add("CLIPTextEncode", { text: [pcId, 2], clip: [ckptId, 1] });
  const modelForDetail = spliceConditionCluster(add, options, [ckptId, 0], data.input_ref, "sdxl");
  // Sampling: the picked model's own gen-time KSampler settings (folded into
  // the engine entry) replace the source-gen inheritance the surgery path
  // has. Unconfigured models get the project's settled SDXL photoreal
  // recipe — dpmpp_2m/karras, cfg 5 (7 burns modern finetunes), 25 steps
  // (denoise 0.5 only runs ~half of them).
  const gen = options.engineGen || {};
  const detailId = add("PromptChain_MaskedDetail", {
    model: modelForDetail, vae: [ckptId, 2],
    image: [loadId, 0], mask: [maskId, 0],
    positive: [posId, 0], negative: [negId, 0],
    seed: Math.floor(Math.random() * 0xffffffffff),
    steps: numOr(options.steps, numOr(gen.steps, 25)),
    cfg: numOr(options.cfg, numOr(gen.cfg, 5)),
    sampler_name: options.sampler || gen.sampler || "dpmpp_2m",
    scheduler: options.scheduler || gen.scheduler || "karras",
    denoise: typeof options.denoise === "number" ? options.denoise : 0.5,
    guide_size: 512, max_size: 1024, crop_factor: 2.0,
    feather: numOr(options.feather, 24), grow: numOr(options.grow, 0),
  });
  add("PreviewImage", { images: [detailId, 0] });
  console.log("[PromptChain][inpaint] built engine prompt:", JSON.stringify(graph, null, 2));
  return { graph, detailId };
}

// FLUX.1 engine inpaint: classic masked partial denoise through the same
// MaskedDetail crop path as the SDXL engine, with the flux conditioning
// regime — guidance rides FluxGuidance on the positive, cfg pinned 1.0 (the
// empty negative is just the required input). guide_size 1024: flux's
// native working res; the crop should sample there, not at SDXL's 512.
export function buildFlux1InpaintPrompt(data, options, maskName) {
  const filename = options.engineModel?.filename;
  if (!filename) throw new Error("no engine model picked");
  const probe = (type, widget) => {
    try {
      const node = window.LiteGraph?.createNode?.(type);
      return node?.widgets?.find((w) => w.name === widget)?.options?.values || [];
    } catch { return []; }
  };
  const clipOpts = probe("DualCLIPLoader", "clip_name1");
  const clipL = clipOpts.find((o) => /(^|[\\/])clip_l\./i.test(o)) || clipOpts.find((o) => /clip_l/i.test(o));
  const t5 = clipOpts.find((o) => /t5xxl.*fp16/i.test(o)) || clipOpts.find((o) => /t5xxl/i.test(o));
  const vaeFile = probe("VAELoader", "vae_name").find((o) => /(^|[\\/])ae\.(safetensors|sft)$/i.test(o));
  if (!clipL || !t5 || !vaeFile) throw new Error("the FLUX text encoders / VAE aren't installed");

  const graph = {};
  let nextId = offscreenIdBase(); // render-node ids must stay off the live canvas — else execution images paint onto a live node sharing the id (see offscreen-graph.js)
  const add = (class_type, inputs) => {
    const id = String(nextId++);
    graph[id] = { class_type, inputs };
    return id;
  };
  const unetId = add("UNETLoader", { unet_name: filename, weight_dtype: "default" });
  const clipId = add("DualCLIPLoader", { clip_name1: clipL, clip_name2: t5, type: "flux", device: "default" });
  const vaeId = add("VAELoader", { vae_name: vaeFile });
  const loadId = add("LoadImage", { image: data.input_ref });
  const maskId = add("LoadImageMask", { image: maskName, channel: "red" });
  const pcId = add("PromptChain_PromptChain", {
    prompt: options.prompt || "", mode: "combine", switch_index: 1,
    locked: false, disabled: false, cached_output: "", cached_neg_output: "",
    iterate_index: 0, iterate_cycle: 1, collapsed: false,
    wildcard_modes: "", cached_regions: "",
  });
  const posId = add("CLIPTextEncode", { text: [pcId, 1], clip: [clipId, 0] });
  const negId = add("CLIPTextEncode", { text: [pcId, 2], clip: [clipId, 0] });
  const guidId = add("FluxGuidance", { conditioning: [posId, 0], guidance: FLUX1_TILE_GUIDANCE });
  const gen = options.engineGen || {};
  const detailId = add("PromptChain_MaskedDetail", {
    model: [unetId, 0], vae: [vaeId, 0],
    image: [loadId, 0], mask: [maskId, 0],
    positive: [guidId, 0], negative: [negId, 0],
    seed: Math.floor(Math.random() * 0xffffffffff),
    steps: numOr(options.steps, numOr(gen.steps, 25)),
    // cfg pinned, never inherited — a gen cfg would double sampling and burn.
    cfg: 1.0,
    sampler_name: options.sampler || gen.sampler || "euler",
    scheduler: options.scheduler || gen.scheduler || "simple",
    denoise: typeof options.denoise === "number" ? options.denoise : 0.5,
    guide_size: 1024, max_size: 1536, crop_factor: 2.0,
    feather: numOr(options.feather, 24), grow: numOr(options.grow, 0),
  });
  add("PreviewImage", { images: [detailId, 0] });
  console.log("[PromptChain][inpaint] built flux1 engine prompt:", JSON.stringify(graph, null, 2));
  return { graph, detailId };
}

// KREA 2 engine inpaint: a DiT that wires like FLUX.1 through the same
// MaskedDetail crop path, minus FLUX's guidance regime. Shift is baked into the
// model class (no ModelSampling) and it's cfg-native (no FluxGuidance), so the
// UNET feeds the sampler straight and the empty negative is just the required
// input — cfg is pinned 1.0, the same inert-negative posture as flux1/zimage.
// Self-contained loaders (UNET + single CLIPLoader(type krea2) + qwen_image VAE)
// mean an imported/arbitrary image needs no embedded render data. guide_size
// 1024 / max_size 1536: krea2's native working res, matching the flux1 crop.
export function buildKrea2InpaintPrompt(data, options, maskName) {
  const filename = options.engineModel?.filename;
  if (!filename) throw new Error("no engine model picked");
  // Resolve the actual installed encoder/VAE (mirrors the flux1 builder + the krea2
  // tile stage) so a differently-named file still binds and a missing one fails early.
  const probe = (type, widget) => {
    try {
      const node = window.LiteGraph?.createNode?.(type);
      return node?.widgets?.find((w) => w.name === widget)?.options?.values || [];
    } catch { return []; }
  };
  // Realism mode (krea2_turbo): abliterated Qwen3-VL encoder + projector/realism
  // LoRAs. VAE stays qwen_image_vae on purpose — MaskedDetail composites the
  // re-detailed patch back into the qwen-decoded frame, so decoding it through
  // wan_2.1 would shift colour/texture and leave a seam (same reason the krea2
  // tile upscale keeps qwen_image_vae).
  const realism = !!options.realism;
  const clipOpts = probe("CLIPLoader", "clip_name");
  const loraOpts = probe("LoraLoaderModelOnly", "lora_name");
  const clipFile = realism
    ? clipOpts.find((o) => /huihui.*qwen3.?vl.*4b.*abliterated|qwen3.?vl.*4b.*abliterated/i.test(o))
    : (clipOpts.find((o) => /qwen3vl.*4b/i.test(o)) || clipOpts.find((o) => /qwen3.?vl.*4b/i.test(o)));
  const vaeFile = probe("VAELoader", "vae_name").find((o) => /qwen.*image.*vae/i.test(o));
  const projLora = realism && loraOpts.find((o) => /krea2_turbo_projector_scale/i.test(o));
  const realLora = realism && loraOpts.find((o) => /krea2-realism/i.test(o));
  if (!clipFile || !vaeFile) throw new Error(realism
    ? "Realism mode needs the abliterated Qwen3-VL encoder installed (Huihui-Qwen3-VL-4B-Instruct-abliterated)"
    : "the Krea 2 text encoder / VAE aren't installed");
  if (realism && (!projLora || !realLora)) throw new Error("Realism mode needs the Krea2-realism-V1 + krea2_turbo_projector_scale LoRAs installed");

  const graph = {};
  let nextId = offscreenIdBase(); // render-node ids must stay off the live canvas — else execution images paint onto a live node sharing the id (see offscreen-graph.js)
  const add = (class_type, inputs) => {
    const id = String(nextId++);
    graph[id] = { class_type, inputs };
    return id;
  };
  const unetId = add("UNETLoader", { unet_name: filename, weight_dtype: "default" });
  const clipId = add("CLIPLoader", { clip_name: clipFile, type: "krea2", device: "default" });
  const vaeId = add("VAELoader", { vae_name: vaeFile });
  const loadId = add("LoadImage", { image: data.input_ref });
  const maskId = add("LoadImageMask", { image: maskName, channel: "red" });
  const pcId = add("PromptChain_PromptChain", {
    prompt: options.prompt || "", mode: "combine", switch_index: 1,
    locked: false, disabled: false, cached_output: "", cached_neg_output: "",
    iterate_index: 0, iterate_cycle: 1, collapsed: false,
    wildcard_modes: "", cached_regions: "",
  });
  const posId = add("CLIPTextEncode", { text: [pcId, 1], clip: [clipId, 0] });
  // Dummy negative: cfg is pinned 1.0 so it never influences sampling, but
  // MaskedDetail requires the input — the UNET feeds the sampler straight
  // (no ModelSampling, no FluxGuidance).
  const negId = add("CLIPTextEncode", { text: [pcId, 2], clip: [clipId, 0] });
  // RAW is the undistilled base: it needs full steps + a real cfg + the resolution
  // shift, NOT Turbo's 8-step / cfg-1 / no-shift recipe (which under-resolves it and
  // over-shifts → melted faces). The crop samples at guide_size 1024, so a static
  // 1024 ModelSamplingFlux is correct here. Turbo keeps its pinned fast recipe.
  const raw = /krea2_raw/i.test(filename);
  let modelRef = [unetId, 0];
  if (raw) {
    const msfId = add("ModelSamplingFlux", { model: [unetId, 0], max_shift: 0.90625, base_shift: 0.5, width: 1024, height: 1024 });
    modelRef = [msfId, 0];
  }
  if (realism) {
    const proj = add("LoraLoaderModelOnly", { model: modelRef, lora_name: projLora, strength_model: 0.5 });
    const real = add("LoraLoaderModelOnly", { model: [proj, 0], lora_name: realLora, strength_model: 0.6 });
    modelRef = [real, 0];
  }
  const detailId = add("PromptChain_MaskedDetail", {
    model: modelRef, vae: [vaeId, 0],
    image: [loadId, 0], mask: [maskId, 0],
    positive: [posId, 0], negative: [negId, 0],
    seed: Math.floor(Math.random() * 0xffffffffff),
    // Defaults are RAW/Turbo-aware but overridable from the modal (steps/cfg/sampler).
    steps: numOr(options.steps, raw ? 30 : 8),
    cfg: numOr(options.cfg, raw ? 3.5 : 1.0),
    sampler_name: options.sampler || (raw ? "er_sde" : "euler"),
    scheduler: options.scheduler || (raw ? "beta" : "simple"),
    denoise: typeof options.denoise === "number" ? options.denoise : 0.5,
    guide_size: 1024, max_size: 1536, crop_factor: 2.0,
    feather: numOr(options.feather, 24), grow: numOr(options.grow, 0),
  });
  add("PreviewImage", { images: [detailId, 0] });
  console.log("[PromptChain][inpaint] built krea2 engine prompt:", JSON.stringify(graph, null, 2));
  return { graph, detailId };
}

const round8 = (v) => Math.max(8, Math.round(v / 8) * 8);

// Crop window around the painted mask: bbox grown 2× (MaskedDetail's
// crop_factor analog), min 512 a side, clamped to the image, 8-aligned for
// the VAE. No bbox → whole frame.
export function qwenCropWindow(bbox, imgW, imgH) {
  if (!bbox || !(bbox.w > 0) || !(bbox.h > 0) || !imgW || !imgH) {
    return { x: 0, y: 0, w: imgW || 8, h: imgH || 8 };
  }
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const w = Math.min(imgW, Math.max(512, bbox.w * 2));
  const h = Math.min(imgH, Math.max(512, bbox.h * 2));
  const x = Math.max(0, Math.min(imgW - w, Math.round(cx - w / 2)));
  const y = Math.max(0, Math.min(imgH - h, Math.round(cy - h / 2)));
  const x0 = Math.floor(x / 8) * 8;
  const y0 = Math.floor(y / 8) * 8;
  const cw = Math.min(Math.ceil((x + w - x0) / 8) * 8, Math.floor((imgW - x0) / 8) * 8 || 8);
  const ch = Math.min(Math.ceil((y + h - y0) / 8) * 8, Math.floor((imgH - y0) / 8) * 8 || 8);
  return { x: x0, y: y0, w: cw, h: ch };
}

// Sampling size for the crop: ≥1MP so a small region (an eye) regenerates at
// full model resolution, ≤2MP (Qwen Edit grows plastic skin past ~2MP).
function qwenWorkingSize(w, h) {
  const total = w * h;
  const scale = Math.sqrt(Math.min(2.0e6, Math.max(1.0e6, total)) / total);
  return { w: round8(w * scale), h: round8(h * scale) };
}

// Qwen-Edit engine inpaint: instruction-driven MASKED edit. The model has no
// native mask channel — the confinement is sampler-level latent pinning:
// SetLatentNoiseMask at denoise 1.0 makes KSamplerX0Inpaint overwrite the
// model's output with the original latent outside the mask EVERY step, so
// the whole-frame re-render is discarded there (community-proven recipe; see
// dev-promptchain/docs/reference/qwen-edit-2511-inpaint.md). Crop-and-
// composite around the client-computed mask bbox gives the region full model
// resolution and keeps unmasked pixels bit-identical (no VAE round-trip).
export function buildQwenEditInpaintPrompt(data, options, maskName) {
  const filename = options.engineModel?.filename;
  if (!filename) throw new Error("no engine model picked");
  const probe = (type, widget) => {
    try {
      const node = window.LiteGraph?.createNode?.(type);
      return node?.widgets?.find((w) => w.name === widget)?.options?.values || [];
    } catch { return []; }
  };
  const clipFile = probe("CLIPLoader", "clip_name").find((o) => /qwen.*2[._]5.*vl/i.test(o));
  const vaeFile = probe("VAELoader", "vae_name").find((o) => /qwen.*image.*vae/i.test(o));
  if (!clipFile || !vaeFile) throw new Error("the Qwen text encoder / VAE isn't installed");

  const crop = qwenCropWindow(options.maskBbox, data.width || 0, data.height || 0);
  const scaled = qwenWorkingSize(crop.w, crop.h);

  const graph = {};
  let nextId = offscreenIdBase(); // render-node ids must stay off the live canvas — else execution images paint onto a live node sharing the id (see offscreen-graph.js)
  const add = (class_type, inputs) => {
    const id = String(nextId++);
    graph[id] = { class_type, inputs };
    return id;
  };
  const loadId = add("LoadImage", { image: data.input_ref });
  const maskId = add("LoadImageMask", { image: maskName, channel: "red" });
  const cropImgId = add("ImageCrop", { image: [loadId, 0], width: crop.w, height: crop.h, x: crop.x, y: crop.y });
  const cropMaskId = add("CropMask", { mask: [maskId, 0], x: crop.x, y: crop.y, width: crop.w, height: crop.h });
  let maskRef = [cropMaskId, 0];
  const grow = numOr(options.grow, 0);
  if (grow > 0) maskRef = [add("GrowMask", { mask: maskRef, expand: grow, tapered_corners: true }), 0];
  // Soft mask edges are load-bearing here: qwen edit has residual in-mask
  // drift at the boundary; the feather hides the in/out seam. Core-node
  // feather = mask → image → blur → mask.
  const feather = numOr(options.feather, 24);
  if (feather > 0) {
    const maskImgId = add("MaskToImage", { mask: maskRef });
    const blurId = add("ImageBlur", {
      image: [maskImgId, 0],
      blur_radius: Math.min(31, Math.max(1, Math.round(feather / 2))),
      sigma: Math.max(0.5, feather / 4),
    });
    maskRef = [add("ImageToMask", { image: [blurId, 0], channel: "red" }), 0];
  }
  const stageId = add("ImageScale", { image: [cropImgId, 0], upscale_method: "lanczos", width: scaled.w, height: scaled.h, crop: "disabled" });
  const unetId = add("UNETLoader", { unet_name: filename, weight_dtype: "default" });
  const auraId = add("ModelSamplingAuraFlow", { model: [unetId, 0], shift: 3 });
  const normId = add("CFGNorm", { model: [auraId, 0], strength: 1 });
  const clipId = add("CLIPLoader", { clip_name: clipFile, type: "qwen_image", device: "default" });
  const vaeId = add("VAELoader", { vae_name: vaeFile });
  const posId = add("TextEncodeQwenImageEditPlus", {
    clip: [clipId, 0], vae: [vaeId, 0], image1: [stageId, 0],
    prompt: (options.prompt || "").trim() || QWEN_ENHANCE_INSTRUCTION,
  });
  const negId = add("TextEncodeQwenImageEditPlus", {
    clip: [clipId, 0], vae: [vaeId, 0], image1: [stageId, 0], prompt: "",
  });
  const refPosId = add("FluxKontextMultiReferenceLatentMethod", { conditioning: [posId, 0], reference_latents_method: "index_timestep_zero" });
  const refNegId = add("FluxKontextMultiReferenceLatentMethod", { conditioning: [negId, 0], reference_latents_method: "index_timestep_zero" });
  const encodeId = add("VAEEncode", { pixels: [stageId, 0], vae: [vaeId, 0] });
  // The mask rides at crop resolution — the sampler interpolates the noise
  // mask to latent dims, so relative coverage holds through the upscale.
  const noisedId = add("SetLatentNoiseMask", { samples: [encodeId, 0], mask: maskRef });
  const gen = options.engineGen || {};
  const samplerId = add("KSampler", {
    model: [normId, 0], positive: [refPosId, 0], negative: [refNegId, 0], latent_image: [noisedId, 0],
    seed: Math.floor(Math.random() * 0xffffffffff),
    steps: numOr(options.steps, numOr(gen.steps, 40)),
    cfg: numOr(options.cfg, numOr(gen.cfg, 4)),
    sampler_name: options.sampler || gen.sampler || "euler",
    scheduler: options.scheduler || gen.scheduler || "simple",
    // 1.0 is structural: partial denoise blends the shifted re-render; full
    // denoise + the noise mask is what pins the unmasked region.
    denoise: 1.0,
  });
  const decodeId = add("VAEDecode", { samples: [samplerId, 0], vae: [vaeId, 0] });
  const fitId = add("ImageScale", { image: [decodeId, 0], upscale_method: "lanczos", width: crop.w, height: crop.h, crop: "disabled" });
  const compositeId = add("ImageCompositeMasked", {
    destination: [loadId, 0], source: [fitId, 0], x: crop.x, y: crop.y, resize_source: false, mask: maskRef,
  });
  add("PreviewImage", { images: [compositeId, 0] });
  console.log("[PromptChain][inpaint] built qwen-edit engine prompt:", JSON.stringify(graph, null, 2));
  return { graph, detailId: samplerId };
}

function collectMeta(graph, detailId, data, options, maskName) {
  const byClass = (...cls) => Object.values(graph).find((n) => cls.includes(n.class_type));
  const loader = byClass("CheckpointLoaderSimple", "CheckpointLoader") || byClass("UNETLoader");
  const lit = (v) => (Array.isArray(v) || v === undefined ? null : v);
  const detail = graph[detailId].inputs;
  return {
    parent_filename: data.input_ref,
    // Not a DB column — carried so save_temp_image can pin the consumed mask
    // against the age sweep (re-apply needs it to survive).
    mask_filename: maskName || null,
    model: lit(loader?.inputs?.ckpt_name) || lit(loader?.inputs?.unet_name) || null,
    seed: lit(detail.seed),
    steps: lit(detail.steps),
    cfg: lit(detail.cfg),
    sampler: lit(detail.sampler_name),
    scheduler: lit(detail.scheduler),
    denoise: options.denoise ?? null,
    prompt: options.prompt || "",
    negative: "",
  };
}

export function runInpaint(prepared, options = {}) {
  const tracker = createTracker();
  const run = { cancelled: false, promptId: null, executionStarted: false, cleanup: null };
  tracker.cancel = async () => {
    if (run.cancelled) return;
    run.cancelled = true;
    // Free the UI first, then interrupt server-side. A slow or hung interrupt
    // must not strand the modal in "Inpainting…" — and since run.cancelled is
    // now set, a stranded await would also make every retry Stop a no-op.
    tracker.emit({ phase: "cancelled" });
    try {
      if (run.promptId) {
        if (run.executionStarted) await api.interrupt();
        else {
          await api.fetchApi("/queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ delete: [run.promptId] }),
          });
          run.cleanup?.();
        }
      }
    } catch (e) {
      console.warn("[PromptChain] inpaint cancel failed", e);
    }
  };

  (async () => {
    const { data } = prepared;
    tracker.emit({ phase: "building" });
    const maskName = await uploadMask(options.maskBlob);

    let built;
    try {
      built = options.engine === "qwen-edit" && options.engineModel
        ? buildQwenEditInpaintPrompt(data, options, maskName)
        : options.engine === "flux1-unet" && options.engineModel
          ? buildFlux1InpaintPrompt(data, options, maskName)
          : options.engine === "krea2-unet" && options.engineModel
            ? buildKrea2InpaintPrompt(data, options, maskName)
            : options.engine === "sdxl-ckpt" && options.engineModel
              ? buildInpaintEnginePrompt(data, options, maskName)
              : buildInpaintPrompt(data.prompt, data, options, maskName);
    } catch (e) {
      console.error("[PromptChain][inpaint] build failed (rev abc3dbbd+):", e);
      tracker.emit({ phase: "error", message: `build failed: ${e.message}` });
      toast("error", `Inpaint build failed: ${e.message}`);
      return;
    }
    if (run.cancelled) return;

    tracker.emit({ phase: "queueing" });
    // Fresh workflow id: the result records into its own timeline, never the
    // source workflow's. The source UI workflow rides along as pnginfo so the
    // temp preview stays inspectable.
    const workflowId = freshWorkflowId();
    const workflowExtra = data.workflow ? { ...data.workflow, id: workflowId } : undefined;
    let promptId = null;
    // Arm the external-prompt window across the queue round-trip so the main
    // graph's execution_start gate recognizes this run even if its event beats
    // the post-resolve registration below.
    armExternalQueue();
    try {
      const previewMethod = app.extensionManager?.setting?.get?.("Comfy.Execution.PreviewMethod")
        ?? app.ui?.settings?.getSettingValue?.("Comfy.Execution.PreviewMethod")
        ?? "default";
      const res = await api.queuePrompt(0, { output: built.graph, workflow: workflowExtra }, { previewMethod });
      promptId = res?.prompt_id || null;
    } catch (e) {
      disarmExternalQueue();
      const message = e?.response?.error?.message || e?.message || "queue rejected the prompt";
      tracker.emit({ phase: "error", message });
      toast("error", `Inpaint failed to queue: ${message}`);
      return;
    }
    if (!promptId) {
      disarmExternalQueue();
      tracker.emit({ phase: "error", message: "queue returned no prompt id" });
      return;
    }
    externallyTrackedPrompts.add(promptId);
    disarmExternalQueue();
    run.promptId = promptId;
    const meta = collectMeta(built.graph, built.detailId, data, options, maskName);
    if (run.cancelled) {
      try {
        await api.fetchApi("/queue", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete: [promptId] }),
        });
      } catch {}
      externallyTrackedPrompts.delete(promptId);
      return;
    }
    tracker.emit({ phase: "running" });

    let lastTemp = null;
    let previewUrl = null;
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
      externallyTrackedPrompts.delete(promptId);
      setPreview(null);
    };
    run.cleanup = cleanup;
    const onStart = ({ detail }) => { if (detail?.prompt_id === promptId) run.executionStarted = true; };
    const onProgress = ({ detail }) => {
      if (detail?.prompt_id !== promptId || run.cancelled) return; // a late step event must not re-emit "running" after Stop
      run.executionStarted = true;
      tracker.emit({ phase: "running", value: detail.value, max: detail.max, previewUrl });
    };
    const onPreview = ({ detail }) => {
      if (run.cancelled || !run.executionStarted || !(detail instanceof Blob)) return;
      const url = setPreview(detail);
      const s = tracker.state;
      if (s.phase === "running") tracker.emit({ ...s, previewUrl: url });
    };
    const onExecuted = ({ detail }) => {
      if (detail?.prompt_id !== promptId || !detail?.output?.images?.length) return;
      lastTemp = detail.output.images[detail.output.images.length - 1];
    };
    const onSuccess = ({ detail }) => {
      if (detail?.prompt_id !== promptId) return;
      cleanup();
      if (run.cancelled) return; // a render that finished after Stop must not resurrect "done"
      if (!lastTemp) {
        tracker.emit({ phase: "error", message: "run produced no image" });
        return;
      }
      tracker.emit({ phase: "done", temp: lastTemp, meta, workflowId });
    };
    const onError = ({ detail }) => {
      if (detail?.prompt_id !== promptId) return;
      cleanup();
      if (run.cancelled) return;
      const message = detail?.exception_message || "execution failed";
      tracker.emit({ phase: "error", message });
      toast("error", `Inpaint failed: ${message}`);
    };
    api.addEventListener("execution_start", onStart);
    api.addEventListener("progress", onProgress);
    api.addEventListener("b_preview", onPreview);
    api.addEventListener("executed", onExecuted);
    api.addEventListener("execution_success", onSuccess);
    api.addEventListener("execution_error", onError);
    api.addEventListener("execution_interrupted", onError);
  })().catch((e) => {
    console.error("[PromptChain] inpaint run failed", e);
    tracker.emit({ phase: "error", message: e?.message || "unexpected failure" });
    toast("error", `Inpaint failed: ${e?.message || e}`);
  });
  return tracker;
}

export async function saveInpaintResult(doneState, prefix) {
  try {
    const res = await api.fetchApi("/promptchain/save-temp-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: doneState.temp.filename,
        subfolder: doneState.temp.subfolder || "",
        prefix,
        workflow_id: doneState.workflowId,
        ...doneState.meta,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast("error", `Save failed: ${err?.error || res.status}`);
      return null;
    }
    const entry = await res.json();
    refreshEntryWorkflows(entry);
    return entry;
  } catch (e) {
    toast("error", `Save failed: ${e.message}`);
    return null;
  }
}
