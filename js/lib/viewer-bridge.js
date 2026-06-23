// Viewer bridge — lazy-loads the Svelte image viewer and manages its lifecycle.
// Supports hash URI deep-linking: #pcr/view?h={hash}&w={workflowId}

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { fetchWorkflowImages, invalidateCache } from "./history.js";
import { ensureSvelteCSS, createModuleLoader } from "./lazy-load.js";
import { prepareUpscale, buildUpscaleWorkflow } from "./upscale-from-image.js";
import { upscaleImageInBackground, enlargeImageInBackground } from "./upscale-background.js";
import { prepareInpaint, runInpaint, saveInpaintResult, uploadInputImage, inpaintRegion, sourcePromptText, sourcePromptTextFull, liveWorkflowPrompt } from "./inpaint-background.js";
import { prepareEdit, saveEditedImage } from "./edit-image.js";
import { fetchReposeCaps } from "./repose-from-image.js";
import { runReposeInBackground } from "./repose-background.js";
import { runExtendInBackground } from "./extend-background.js";
import { runSmoothInBackground } from "./smooth-background.js";
import { smoothNodesAvailable } from "./smooth-from-image.js";
import { mountDetachedPoser } from "../pose-studio.js";
import { showNodePackInstallModal } from "./model-bridge.js";
import { loadCodeMirror, createEditor } from "./editor.js";
import { activateTagAutocomplete } from "./autocomplete.js";

// "Extend video": which I2V template to continue with. A continuation is always
// image->video, so it uses an I2V recipe regardless of how the source was made.
// Pick the family whose models are installed (GGUF vs safetensors); the quant
// resolver in buildExtendGraph then maps the template's baked variant to the
// exact file on disk.
async function pickI2VTemplate() {
  try {
    const res = await api.fetchApi("/promptchain/models/list");
    const models = res.ok ? ((await res.json())?.models || []) : [];
    const names = models.map((m) => (m.filename || "").toLowerCase());
    if (names.some((n) => n.endsWith(".gguf") && n.includes("i2v") && (n.includes("a14b") || n.includes("wan2.2")))) return "wan22-i2v-gguf";
    if (names.some((n) => /wan2\.2_i2v_.*(fp8_scaled|fp16)\.safetensors/.test(n))) return "wan22-i2v";
  } catch { /* fall through to default */ }
  return "wan22-i2v-gguf"; // the resolver remaps to whatever quant is actually installed
}

async function fetchTemplateJson(id) {
  try {
    const res = await api.fetchApi(`/promptchain/templates/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.template || data;
  } catch { return null; }
}

// Lightning (4-step) renders through the "-fast" template, which bakes the
// LightX2V distill LoRAs. Picking it without those files on disk would build an
// empty LoraLoaderModelOnly and render garbage with no error (the same failure
// that rejected sf-video-test). Gate the option on the LoRAs actually being
// installed. Fail-open on any probe error — server-side validation still
// catches a genuinely missing file.
async function lightningLorasInstalled(fastTemplate) {
  try {
    if (!fastTemplate?.nodes) return true;
    const infoRes = await api.fetchApi("/object_info/LoraLoaderModelOnly");
    if (!infoRes.ok) return true;
    const info = await infoRes.json();
    const installed = info?.LoraLoaderModelOnly?.input?.required?.lora_name?.[0] || [];
    const installedSet = new Set(installed.map((n) => String(n).toLowerCase()));
    const needed = fastTemplate.nodes
      .filter((n) => (n.type || n.comfyClass) === "LoraLoaderModelOnly")
      .map((n) => String(n.widgets_values?.[0] || "").toLowerCase())
      .filter(Boolean);
    if (!needed.length) return true;
    return needed.every((f) => installedSet.has(f));
  } catch { return true; }
}

// Per-recipe sampler defaults read from the SELECTED template's baked widgets —
// NOT a config, because config presets only describe the normal recipe and are
// wrong for the 4-step lightning one. KSamplerAdvanced widget order:
// add_noise, noise_seed, control_after_generate, steps, cfg, sampler_name,
// scheduler, start_at_step, end_at_step, return_with_leftover_noise.
function extractRecipeDefaults(template) {
  if (!template?.nodes) return null;
  const find = (t) => template.nodes.find((n) => (n.type || n.comfyClass) === t);
  const all = (t) => template.nodes.filter((n) => (n.type || n.comfyClass) === t);
  const ks = all("KSamplerAdvanced");
  const high = ks.find((n) => (n.widgets_values || [])[0] === "enable") || ks[0];
  const hv = high?.widgets_values || [];
  const ms = find("ModelSamplingSD3");
  return {
    steps: Number(hv[3]) || 20,
    cfg: hv[4] != null ? Number(hv[4]) : 3.5,
    sampler: hv[5] || "euler",
    scheduler: hv[6] || "simple",
    shift: Number((ms?.widgets_values || [])[0]) || 5,
  };
}

async function prepareExtend(hash) {
  if (!hash) return null;
  const res = await api.fetchApi(`/promptchain/extend/prepare?hash=${encodeURIComponent(hash)}`);
  if (!res.ok) return null;
  const d = await res.json();
  if (!d?.last_frame) return null;
  const q = new URLSearchParams({ filename: d.last_frame, subfolder: "", type: "input" });
  const templateId = await pickI2VTemplate();
  const [normalTpl, fastTpl] = await Promise.all([
    fetchTemplateJson(templateId),
    fetchTemplateJson(`${templateId}-fast`),
  ]);
  return {
    lastFrameFilename: d.last_frame,
    lastFrameUrl: api.apiURL(`/view?${q}`),
    sourceRef: d.source_ref || "",
    fps: d.fps || 16,
    frameCount: d.frame_count || 0,
    width: d.width || 0,
    height: d.height || 0,
    templateId, // vanilla base; confirmExtend appends "-fast" for the Lightning recipe
    lightningAvailable: await lightningLorasInstalled(fastTpl),
    // Slider seeds: clip dims follow the SOURCE (drops the 640×640 hardcode).
    // Length defaults to the source's DURATION in native-16fps frames (snapped to
    // Wan's 4n+1) — so a smoothed 161f@32fps clip (5s) asks for ~81, not 161
    // (which would be a too-long 10s render). fps default is the i2v native (16).
    defaults: {
      // Snap dims to /16 (Wan's latent grid) and clamp to a trained ceiling, so a
      // foreign import's odd 1080p dims can't crash the patchify reshape.
      width: Math.min(1280, Math.round((d.width || 640) / 16) * 16),
      height: Math.min(1280, Math.round((d.height || 640) / 16) * 16),
      length: (() => {
        const dur = (d.frame_count || 81) / (d.fps || 16);
        const native = Math.round(dur * 16);
        // Ceiling 161 (~10s): length is ONE continuation clip, never the whole
        // (possibly long / already-extended) source duration — else it OOMs.
        return Math.min(161, Math.max(5, Math.round((native - 1) / 4) * 4 + 1));
      })(),
      fps: d.fps || 16,
    },
    recipeDefaults: {
      normal: extractRecipeDefaults(normalTpl),
      lightning: extractRecipeDefaults(fastTpl),
    },
  };
}

// "Smooth": offer to install the RIFE pack (Frame-Interpolation) on first use,
// then re-register node defs so RIFE VFI becomes available without a full reload.
function installFrameInterpPack() {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
    showNodePackInstallModal(
      "FrameInterpolation",
      async () => {
        try { const defs = await app.getNodeDefs(); await app.registerNodesFromDefs(defs); } catch {}
        settle(true);
      },
      () => settle(false),
    );
  });
}

// The reference box must show the prompt that actually made THIS image.
// The embedded prompt is authoritative whenever it still carries $region
// blocks — those never survive grafted re-renders, so their presence means
// it IS the original source. Only then fall back to the live node, and only
// when the ACTIVE workflow is the image's own: the longest-prompt scan would
// otherwise read whatever tab happens to be open (temp graft tabs included),
// and the live node can drift after the render (seen garbled once).
function resolveReferencePrompt(apiPrompt, viewerWorkflowId) {
  const embedded = sourcePromptTextFull(apiPrompt);
  if (/\$\w+\s*\{/.test(embedded)) return embedded;
  const activeId = (app.rootGraph ?? app.graph)?.id || null;
  const live = viewerWorkflowId && activeId === viewerWorkflowId ? liveWorkflowPrompt() : "";
  return live || embedded;
}

// Mount the PromptChain CM6 editor (tag highlighting + autocomplete) into a
// modal's container. Same path the node uses — kept out of the viewer's Svelte
// bundle because editor.js imports scripts/api.js, unresolvable at build time.
// Returns the EditorView (caller destroys it on close).
//
// getModelInfo: () => {hash, architecture} | null — modal editors have no
// graph node, so the context menu's Prompts submenu and the @prompt
// autocomplete read model identity through these hooks instead (the modal
// resolves it live: picked engine model, else the image's source model).
async function mountPromptEditor(container, initialValue, onChange, getModelInfo) {
  await loadCodeMirror();
  const view = createEditor(container, initialValue || "", onChange, null, [], null, null);
  if (view) {
    if (getModelInfo) {
      const resolve = () => { try { return getModelInfo() || null; } catch { return null; } };
      // Node stand-in for the context menu (editor.js reads container._pcrNode).
      // inputs/outputs/properties keep the node-walking helpers on their
      // empty-graph paths; no .graph keeps fullscreen/network items off.
      container._pcrNode = { _pcrGetModelInfo: resolve, inputs: [], outputs: [], properties: {} };
      view._pcrGetModelInfo = resolve;
    }
    try { activateTagAutocomplete(window.PromptChainCM, view); }
    catch (e) { console.error("[PromptChain] inpaint autocomplete activation failed:", e); }
  }
  return view;
}

// Inline pack install for an inpaint condition: open the shared install modal and
// resolve true on success (after re-registering node defs), false on cancel.
function installInpaintPack(injectable) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
    showNodePackInstallModal(
      injectable,
      async () => {
        try { const defs = await app.getNodeDefs(); await app.registerNodesFromDefs(defs); } catch {}
        settle(true);
      },
      () => settle(false),
    );
  });
}

const ensureCSS = ensureSvelteCSS;
const loadModule = createModuleLoader(() => import("./svelte/promptchain-viewer.js"));

function clearHash() {
  history.replaceState(null, "", location.pathname + location.search);
}

// Default delete for DB-tracked images (gallery/deep-link opens pass no
// onDelete of their own). Mirrors the gallery's right-click → Delete: remove
// the file, detach the workflow record, and broadcast so open galleries and
// the sidebar drop the entry.
async function deleteTrackedImage(images, workflowId, hash) {
  // Delete the FILE by content hash. The server resolves the real location via
  // resolve_image_path (output / input / temp / cached / reattached), so a
  // wrong-scope guess can't leave it on disk — the old path hardcoded "output"
  // and silently failed to delete input/temp-sourced images. Throw on failure
  // so the viewer's handleDelete surfaces it instead of dropping the entry.
  const resp = await api.fetchApi("/promptchain/image-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hash }),
  });
  let info = null;
  try { info = await resp.json(); } catch {}
  if (!resp.ok || !info?.deleted) {
    throw new Error(info?.reason || `delete failed (${resp.status})`);
  }
  if (workflowId) {
    await api.fetchApi(`/promptchain/workflow/${encodeURIComponent(workflowId)}/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: [hash] }),
    });
    invalidateCache(workflowId);
  }
  window.dispatchEvent(new CustomEvent("promptchain:file-deleted", {
    detail: { scope: info.scope || "output", paths: info.path ? [info.path] : [] },
  }));
}

export async function openViewer(images, startIndex = 0, workflowId = "", onDelete = null, opts = {}) {
  ensureCSS();
  const svelte = await loadModule();

  const container = document.createElement("div");
  document.body.appendChild(container);

  svelte.openImageViewer(container, {
    images,
    startIndex,
    workflowId,
    autoEdit: !!opts.autoEdit,
    apiURL: (path) => api.apiURL(path),
    fetchApi: (path, opts) => api.fetchApi(path, opts),
    onClose: () => {
      svelte.closeImageViewer();
      clearHash();
    },
    onDelete: onDelete || ((hash) => deleteTrackedImage(images, workflowId, hash)),
    onUpscalePrepare: async (entry) => {
      const prepared = await prepareUpscale(entry);
      // Same prompt surfaces the inpaint modal gets: editable prefill (char
      // blocks stripped) + the workflow source as reference.
      if (prepared?.caps?.graftable && prepared.data?.prompt) {
        prepared.caps.prefillPrompt = sourcePromptText(prepared.data.prompt);
        prepared.caps.referencePrompt = resolveReferencePrompt(prepared.data.prompt, workflowId);
      }
      return prepared;
    },
    onUpscale: (prepared, options) => buildUpscaleWorkflow(prepared, options),
    onUpscaleBackground: (prepared, options) => upscaleImageInBackground(prepared, options),
    onUpscaleEnlarge: (inputRef, targetW, targetH, engine) => enlargeImageInBackground(inputRef, targetW, targetH, engine),
    onInpaintPrepare: async (entry) => {
      const prepared = await prepareInpaint(entry);
      if (prepared?.caps && prepared.data?.prompt) {
        prepared.caps.referencePrompt = resolveReferencePrompt(prepared.data.prompt, workflowId);
      }
      return prepared;
    },
    onInpaintRun: (prepared, options) => runInpaint(prepared, options),
    onInpaintSave: (doneState, prefix) => saveInpaintResult(doneState, prefix),
    onInpaintUploadReference: (file) => uploadInputImage(file),
    onInpaintInstallPack: (injectable) => installInpaintPack(injectable),
    onMountPromptEditor: mountPromptEditor,
    onEditPrepare: (entry) => prepareEdit(entry),
    onEditSave: (prepared, blob, prefix) => saveEditedImage(prepared, blob, prefix),
    onInpaintRegion: (data, args) => inpaintRegion(data, args),
    onReposeCaps: () => fetchReposeCaps(),
    onReposeRun: (opts) => runReposeInBackground(opts),
    onMountPoser: (el, opts) => mountDetachedPoser(el, opts),
    onExtendPrepare: (hash) => prepareExtend(hash),
    onExtendRun: (opts) => runExtendInBackground(opts),
    onSmoothCheck: () => smoothNodesAvailable(),
    onSmoothInstall: () => installFrameInterpPack(),
    onSmoothPrepare: (hash) => prepareExtend(hash), // reuse: stages the source video + fps
    onSmoothRun: (opts) => runSmoothInBackground(opts),
  });
}

// Restore a sidebar/browse-opened image (s=scope, p=path) — these have no DB
// hash, so rebuild the same _directUrl entry the sidebar constructs.
async function restoreBrowseImage(scope, path) {
  const meta = await api.fetchApi(
    `/promptchain/browse/meta?scope=${encodeURIComponent(scope)}&path=${encodeURIComponent(path)}`
  );
  if (!meta.ok) return;
  const url = api.apiURL(`/promptchain/browse/preview?scope=${encodeURIComponent(scope)}&path=${encodeURIComponent(path)}`);
  const images = [{
    hash: path,
    filename: path.split("/").pop(),
    subfolder: "",
    _directUrl: url,
    _browseScope: scope,
    _browsePath: path,
  }];
  await openViewer(images, 0, "", async () => {
    await api.fetchApi("/promptchain/browse/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, paths: [path] }),
    });
    window.dispatchEvent(new CustomEvent("promptchain:file-deleted", {
      detail: { scope, paths: [path] },
    }));
  });
}

// Restore viewer from hash URI
async function tryRestoreFromHash() {
  const hash = location.hash;
  if (!hash.startsWith("#pcr/view")) return;

  const params = new URLSearchParams(hash.slice(hash.indexOf("?") + 1));
  const browsePath = params.get("p");
  if (browsePath) {
    await restoreBrowseImage(params.get("s") || "output", browsePath);
    return;
  }
  const imageHash = params.get("h");
  const workflowId = params.get("w");
  if (!imageHash) return;

  if (workflowId) {
    const images = await fetchWorkflowImages(workflowId);
    const startIndex = images.findIndex(img => img.hash === imageHash);
    if (startIndex >= 0) {
      await openViewer(images, startIndex, workflowId);
      return;
    }
    // workflow list gone or the image detached from it — fall through and
    // restore the linked image itself rather than an unrelated list
  }

  // h-only link (sidebar opens carry no workflow id) — restore the single
  // image; the lineage strip supplies family navigation from there.
  const resp = await api.fetchApi(`/promptchain/image-meta/${encodeURIComponent(imageHash)}`);
  if (!resp.ok) return;
  const meta = await resp.json();
  if (!meta?.hash) return;
  await openViewer([{ hash: meta.hash, filename: meta.filename || "", subfolder: meta.subfolder || "" }], 0, "");
}

// Run on initial load + listen for hash changes (pasted URLs, shared links)
export function restoreFromHash() {
  tryRestoreFromHash().catch(e => console.error("[PromptChain] hash restore failed:", e));
  window.addEventListener("hashchange", () => {
    tryRestoreFromHash().catch(e => console.error("[PromptChain] hash restore failed:", e));
  });
}
