// Viewer "Upscale → Apply": build the same grafted upscale graph the
// "Create Workflow" path produces, but on an OFF-SCREEN LGraph, queue it, and
// track execution — the user's workflow tabs are NEVER touched. (The old
// temp-tab build once replaced the user's open workflow with the graft.)

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { getLink } from "./slot-utils.js";
import {
  buildUpscaleGraph,
  logUpscaleRun,
  pickSeedvr2DitModel,
  SEEDVR2_STAGE_MAX_SHORT_EDGE,
  SEEDVR2_INPUT_NOISE,
} from "./upscale-from-image.js";
import { recordGeneration, externallyTrackedPrompts, armExternalQueue, disarmExternalQueue } from "./history.js";

function toast(severity, detail, life = 8000) {
  app.extensionManager?.toast?.add({ severity, summary: "Upscale", detail, life });
}

// Minimal observable the viewer modal subscribes to for live progress.
function createTracker() {
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

// How many sampled tiles this run will execute, mirroring the USDU script's
// own job counting (ultimate-upscale.py): main pass rows*cols, plus the seam
// pass per seam_fix_mode. Lets the modal show OVERALL progress — the ws
// progress events are per-tile sampler bars that reset every tile.
function computeTilePlan(graph, data, options = {}) {
  const usNode = graph._nodes.find((n) => n.comfyClass === "UltimateSDUpscale" || n.comfyClass === "UltimateSDUpscaleNoUpscale");
  if (!usNode) return { steps: 0, totalTiles: 0 };
  const w = (name) => usNode.widgets?.find((x) => x.name === name)?.value;
  const scale = Number(w("upscale_by")) || 2;
  const tileW = Number(w("tile_width")) || 1024;
  const tileH = Number(w("tile_height")) || 1024;
  let outW = (data.width || 0) * scale;
  let outH = (data.height || 0) * scale;
  if (usNode.comfyClass === "UltimateSDUpscaleNoUpscale") {
    if (options.preEnlargedW && options.preEnlargedH) {
      // Cache hit: upscaled_image is a LoadImage of the cached base (no width/
      // height widgets to read), so take the resolved target dims from the cache.
      outW = options.preEnlargedW; outH = options.preEnlargedH;
    } else {
      // NoUpscale tiles whatever arrives on upscaled_image — the final dims
      // live on the exact-fit ImageScale feeding it.
      const input = usNode.inputs?.find((i) => i.name === "upscaled_image");
      const link = input?.link != null ? getLink(graph, input.link) : null;
      const origin = link && graph.getNodeById(link.origin_id);
      outW = Number(origin?.widgets?.find((x) => x.name === "width")?.value) || (data.width || 0);
      outH = Number(origin?.widgets?.find((x) => x.name === "height")?.value) || (data.height || 0);
    }
  }
  const rows = Math.ceil(outH / tileH) || 1;
  const cols = Math.ceil(outW / tileW) || 1;
  let tiles = rows * cols;
  const mode = String(w("seam_fix_mode") || "None");
  if (mode === "Band Pass") tiles += rows + cols - 2;
  else if (mode === "Half Tile") tiles += rows * (cols - 1) + (rows - 1) * cols;
  else if (mode === "Half Tile + Intersections") tiles += rows * (cols - 1) + (rows - 1) * cols + (rows - 1) * (cols - 1);
  const loader = graph._nodes.find((n) => n.comfyClass === "UpscaleModelLoader");
  const upscaleModel = String(loader?.widgets?.find((x) => x.name === "model_name")?.value || "")
    .replace(/\.(pth|safetensors)$/i, "");
  return { steps: Number(w("steps")) || 0, totalTiles: Math.max(1, tiles), upscaleModel };
}

// Generation metadata for the history record, read off the live temp graph
// before it closes. Matches what main.js records for foreground runs.
function collectRecordMeta(graph, data) {
  const widget = (node, name) => node?.widgets?.find((w) => w.name === name)?.value;
  const usNode = graph._nodes.find((n) => n.comfyClass === "UltimateSDUpscale" || n.comfyClass === "UltimateSDUpscaleNoUpscale");
  // Picker-engine graphs sample through a plain KSampler (qwen) instead.
  const sNode = usNode || graph._nodes.find((n) => n.comfyClass === "KSampler");
  const loader = graph._nodes.find((n) => n.comfyClass === "CheckpointLoaderSimple" || n.comfyClass === "CheckpointLoader")
    || graph._nodes.find((n) => n.comfyClass === "UNETLoader");
  const pcNode = graph._nodes.find((n) => n.comfyClass === "PromptChain_PromptChain");
  let prompt = pcNode?.properties?.pcrCompiledOutput || "";
  let negative = pcNode?.properties?.pcrCompiledNegOutput || "";
  if (!pcNode && sNode) {
    // Engine graphs carry raw text encodes — walk the conditioning chain
    // (CN apply / reference-latent hops) back to the node with the text.
    const textOf = (n) => {
      const t = n?.widgets?.find((x) => x.name === "text" || x.name === "prompt")?.value;
      return typeof t === "string" ? t : null;
    };
    const trace = (inputName) => {
      let node = sNode;
      let name = inputName;
      for (let hop = 0; hop < 4 && node; hop++) {
        const input = node.inputs?.find((x) => x.name === name);
        const link = input?.link != null ? getLink(graph, input.link) : null;
        node = link && graph.getNodeById(link.origin_id);
        const text = textOf(node);
        if (text != null) return text;
        if (node?.inputs?.some((x) => x.name === "conditioning")) name = "conditioning";
      }
      return "";
    };
    prompt = trace("positive");
    negative = trace("negative");
  }
  return {
    parent_filename: data.input_ref,
    model: widget(loader, "ckpt_name") || widget(loader, "unet_name") || null,
    seed: widget(sNode, "seed") ?? null,
    steps: widget(sNode, "steps") ?? null,
    cfg: widget(sNode, "cfg") ?? null,
    sampler: widget(sNode, "sampler_name") || null,
    scheduler: widget(sNode, "scheduler") || null,
    denoise: widget(sNode, "denoise") ?? null,
    prompt,
    negative,
  };
}

function watchExecution({ promptId, workflowId, meta, plan, startedAt, tracker, run, enlargedUrl }) {
  let lastImage = null;
  // Tile bookkeeping: each sampled tile runs its own progress bar (1..steps),
  // so a value reset = next tile. Bars with a different max are the model
  // (ESRGAN) pass, reported separately. Sibling-bar maxes can coincidentally
  // equal steps only if the source is tiny — acceptable.
  let tileIdx = 0;
  let lastValue = Infinity;
  let sampling = false;
  let samplingStartedAt = 0;
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
  if (run) run.cleanup = cleanup; // cancel of a still-pending prompt gets no ws event
  const onStart = ({ detail }) => {
    if (detail?.prompt_id === promptId && run) run.executionStarted = true;
  };
  const onProgress = ({ detail }) => {
    if (detail?.prompt_id !== promptId || run?.cancelled) return; // a late step event must not re-emit "running" after Stop
    if (run) run.executionStarted = true;
    if (plan.steps > 0 && detail.max === plan.steps) {
      if (!sampling) samplingStartedAt = Date.now();
      sampling = true;
      if (detail.value <= lastValue) tileIdx = Math.min(tileIdx + 1, plan.totalTiles);
      lastValue = detail.value;
      // ETA from observed throughput: elapsed sampling time scaled by the
      // remaining fraction. Self-correcting; suppressed until enough of the
      // run has happened to be meaningful.
      const fraction = ((tileIdx - 1) + detail.value / detail.max) / plan.totalTiles;
      let etaSec = null;
      if (fraction > 0.02) {
        etaSec = Math.round(((Date.now() - samplingStartedAt) / 1000) * (1 - fraction) / fraction);
      }
      tracker.emit({
        phase: "running", value: detail.value, max: detail.max,
        tile: tileIdx, totalTiles: plan.totalTiles, etaSec, previewUrl,
      });
    } else {
      // model-upscale pass (or any non-sampler bar)
      tracker.emit({ phase: "running", prep: true, model: plan.upscaleModel, value: detail.value, max: detail.max, previewUrl });
    }
  };
  const onPreview = ({ detail }) => {
    // b_preview carries no prompt_id, but the server executes one prompt at a
    // time — previews arriving while OUR tiles sample are ours.
    if (run?.cancelled || !sampling || !(detail instanceof Blob)) return;
    const url = setPreview(detail);
    const s = tracker.state;
    if (s.phase === "running") tracker.emit({ ...s, previewUrl: url });
  };
  const onExecuted = ({ detail }) => {
    if (detail?.prompt_id !== promptId || !detail?.output?.images?.length) return;
    // Edit-handoff runs render to PreviewImage (temp) — keep whatever arrives;
    // only output-type images get a history record below.
    lastImage = detail.output.images[detail.output.images.length - 1];
  };
  const onSuccess = async ({ detail }) => {
    if (detail?.prompt_id !== promptId) return;
    if (run?.cancelled) { cleanup(); return; } // finished after Stop — don't record or resurrect "done"
    let entry = null;
    if (lastImage && workflowId && (lastImage.type || "output") === "output") {
      entry = await recordGeneration(workflowId, lastImage.filename, lastImage.subfolder || "", lastImage.type || "output", meta);
    }
    cleanup();
    const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    tracker.emit({
      phase: "done",
      resultHash: entry?.hash || null,
      filename: lastImage?.filename || null,
      subfolder: lastImage?.subfolder || "",
      type: lastImage?.type || "output",
      // The finished render, for the modal's done screen — the live preview
      // blob is gone (revoked in cleanup) and the pre-run preview is the OLD
      // image, which read as "it showed me the wrong result".
      resultUrl: lastImage
        ? api.apiURL(`/view?filename=${encodeURIComponent(lastImage.filename)}&subfolder=${encodeURIComponent(lastImage.subfolder || "")}&type=${lastImage.type || "output"}&rand=${Math.random()}`)
        : null,
      // The enlarged base the tiles re-detailed — the compare's "Before" (so you see
      // the tile pass's contribution over the sharpened base, not vs the raw source).
      enlargedUrl: enlargedUrl || null,
      elapsedSec,
    });
    toast("success", `Upscale finished in ${elapsedSec}s${lastImage ? `: ${lastImage.filename}` : ""}.`);
  };
  const onError = ({ detail }) => {
    if (detail?.prompt_id !== promptId) return;
    cleanup();
    if (run?.cancelled) return; // user-initiated interrupt — already announced
    const message = detail?.exception_message || "execution failed";
    tracker.emit({ phase: "error", message });
    toast("error", `Upscale failed: ${message}`);
  };
  api.addEventListener("execution_start", onStart);
  api.addEventListener("progress", onProgress);
  api.addEventListener("b_preview", onPreview);
  api.addEventListener("executed", onExecuted);
  api.addEventListener("execution_success", onSuccess);
  api.addEventListener("execution_error", onError);
  api.addEventListener("execution_interrupted", onError);
}

function comboValues(nodeType, widgetName) {
  const probe = window.LiteGraph?.createNode?.(nodeType);
  return probe?.widgets?.find((w) => w.name === widgetName)?.options?.values || [];
}

// API-format enlarge prompt: ESRGAN up → lanczos fit to exact dims. With
// engine "seedvr2" a restoration stage runs first at the model's trained
// scale (≤1440 short edge, paper caps eval at 1080p) with a little injected
// noise (clean renders carry no degradation for it to invert), and the ESRGAN
// climb only happens when the target is still further out. Exported for the
// headless build-only harness.
export function buildEnlargePrompt(inputRef, targetW, targetH, engine = "ultrasharp", climbModel = null) {
  const models = comboValues("UpscaleModelLoader", "model_name");
  // Mirror upscale-from-image.js defaultUpscaleModelPick: exclude UltraSharpV2 (its
  // micro-speckle becomes tile-CN cross-hatch) so the cached base matches the fused build.
  const modelName = (climbModel && models.includes(climbModel) ? climbModel : null)
    || models.find((o) => /ultrasharp(?!v2)/i.test(o)) || models.find((o) => /ultrasharp/i.test(o))
    || models.find((o) => /^4x/i.test(o)) || models[0];
  if (!modelName) throw new Error("no upscale model installed");

  if (engine === "seedvr2") {
    const ditModels = comboValues("SeedVR2LoadDiTModel", "model");
    const vaeModels = comboValues("SeedVR2LoadVAEModel", "model");
    if (ditModels.length && vaeModels.length) {
      const ditName = pickSeedvr2DitModel(ditModels);
      const vaeName = vaeModels.find((o) => /fp16/i.test(o)) || vaeModels[0];
      const targetShort = Math.min(targetW, targetH);
      const stageShort = Math.min(SEEDVR2_STAGE_MAX_SHORT_EDGE, targetShort);
      const output = {
        1: { class_type: "LoadImage", inputs: { image: inputRef } },
        2: { class_type: "SeedVR2LoadDiTModel", inputs: { model: ditName, device: "cuda:0" } },
        3: { class_type: "SeedVR2LoadVAEModel", inputs: { model: vaeName, device: "cuda:0" } },
        4: {
          class_type: "SeedVR2VideoUpscaler",
          inputs: {
            image: ["1", 0], dit: ["2", 0], vae: ["3", 0],
            seed: 42, resolution: stageShort, max_resolution: 0,
            batch_size: 1, uniform_batch_size: false, color_correction: "lab",
            input_noise_scale: SEEDVR2_INPUT_NOISE,
          },
        },
      };
      let imageRef = ["4", 0];
      if (targetShort > stageShort) {
        output[5] = { class_type: "UpscaleModelLoader", inputs: { model_name: modelName } };
        output[6] = { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["5", 0], image: imageRef } };
        imageRef = ["6", 0];
      }
      output[7] = { class_type: "ImageScale", inputs: { image: imageRef, upscale_method: "lanczos", width: targetW, height: targetH, crop: "disabled" } };
      output[8] = { class_type: "PreviewImage", inputs: { images: ["7", 0] } };
      return output;
    }
  }

  return {
    1: { class_type: "LoadImage", inputs: { image: inputRef } },
    2: { class_type: "UpscaleModelLoader", inputs: { model_name: modelName } },
    3: { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] } },
    4: { class_type: "ImageScale", inputs: { image: ["3", 0], upscale_method: "lanczos", width: targetW, height: targetH, crop: "disabled" } },
    5: { class_type: "PreviewImage", inputs: { images: ["4", 0] } },
  };
}

// Pure-model enlargement of an input-dir image to exact target dims, rendered
// to temp. Used by the Edit grow-canvas path to produce the new Background
// while the region render diffuses, and for the under-layer pass. Plain JSON
// prompt — no workflow tab involved.
export function enlargeImageInBackground(inputRef, targetW, targetH, engine = "ultrasharp", climbModel = null) {
  let output;
  try {
    output = buildEnlargePrompt(inputRef, targetW, targetH, engine, climbModel);
  } catch (e) {
    return Promise.reject(e);
  }
  const workflowId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-bg`;
  return new Promise((resolve, reject) => {
    let promptId = null;
    let lastImage = null;
    const cleanup = () => {
      api.removeEventListener("executed", onExecuted);
      api.removeEventListener("execution_success", onSuccess);
      api.removeEventListener("execution_error", onError);
      api.removeEventListener("execution_interrupted", onError);
      if (promptId) externallyTrackedPrompts.delete(promptId);
    };
    const onExecuted = ({ detail }) => {
      if (detail?.prompt_id !== promptId || !detail?.output?.images?.length) return;
      lastImage = detail.output.images[detail.output.images.length - 1];
    };
    const onSuccess = ({ detail }) => {
      if (detail?.prompt_id !== promptId) return;
      cleanup();
      if (lastImage) resolve(lastImage);
      else reject(new Error("background enlarge produced no image"));
    };
    const onError = ({ detail }) => {
      if (detail?.prompt_id !== promptId) return;
      cleanup();
      reject(new Error(detail?.exception_message || "background enlarge failed"));
    };
    api.addEventListener("executed", onExecuted);
    api.addEventListener("execution_success", onSuccess);
    api.addEventListener("execution_error", onError);
    api.addEventListener("execution_interrupted", onError);
    armExternalQueue();
    api.queuePrompt(0, { output, workflow: { id: workflowId, nodes: [], links: [] } })
      .then((res) => {
        promptId = res?.prompt_id || null;
        if (promptId) externallyTrackedPrompts.add(promptId);
        disarmExternalQueue();
        if (!promptId) { cleanup(); reject(new Error("queue returned no prompt id")); }
      })
      .catch((e) => {
        disarmExternalQueue();
        cleanup();
        reject(new Error(e?.response?.error?.message || e?.message || "queue rejected the enlarge prompt"));
      });
  });
}

// ── enlarged-base cache (NoUpscale tile engines) ───────────────────────────
// The UltraSharp/SeedVR2 enlarge ("pre-process") is deterministic, so a retry
// that only changes tile dials reuses the saved base instead of re-running it.
// Keyed on the RESOLVED enlarge identity (input + engine + climb model + target
// dims) — tile dials are excluded by construction. Only the four NoUpscale tile
// engines are eligible; fused/diffusion engines (source/qwen/flux2/plain) build
// the enlarge inseparably and stay on the normal fused path. The whole pre-pass
// is best-effort: any failure falls through to the fused build (never breaks).
const TILE_ENGINES = new Set(["sdxl-ckpt", "flux1-unet", "zimage-unet", "krea2-unet"]);
const _enlargeCache = new Map(); // key -> input-dir ref ("subfolder/name.png")

function resolveEnlargeTarget(options, data) {
  const w = data.width || 0, h = data.height || 0;
  const longest = Math.max(w, h);
  const scale = typeof options.upscaleBy === "number" && options.upscaleBy >= 1
    ? options.upscaleBy
    : longest > 0 ? Math.min(8, Math.max(1, Math.round((4096 / longest) * 100) / 100)) : 2;
  return { targetW: Math.round(w * scale) || 2048, targetH: Math.round(h * scale) || 2048, scale };
}

function enlargeCacheKey(options, data, targetW, targetH) {
  const engine = options.climbStage === "seedvr2" ? "seedvr2" : "ultrasharp";
  return [data.input_ref || "", engine, options.climbModel || "default", targetW, targetH].join("|");
}

// Short deterministic hash of the cache key → a stable cache filename, so re-MISSes
// for the same enlarge identity OVERWRITE one file instead of piling new ones up.
function hashKey(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// A LoadImage reads only the input dir, so copy the freshly-enlarged temp image into
// input/ (under a key-stable name) so the tile graph can load it on a cache hit.
async function copyEnlargedToInput(img, nameBase) {
  const url = api.apiURL(`/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${img.type || "temp"}`);
  const blob = await (await fetch(url)).blob();
  const form = new FormData();
  form.append("image", new File([blob], `upcache_${nameBase}.png`, { type: "image/png" }));
  form.append("subfolder", "promptchain_upscale_cache");
  form.append("overwrite", "true");
  const res = await api.fetchApi("/upload/image", { method: "POST", body: form });
  const j = await res.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

// /view URL for a cached enlarged base (input-dir ref) — the compare's "Before".
function enlargedRefUrl(ref) {
  const slash = ref.lastIndexOf("/");
  const sub = slash >= 0 ? ref.slice(0, slash) : "";
  const name = slash >= 0 ? ref.slice(slash + 1) : ref;
  return api.apiURL(`/view?filename=${encodeURIComponent(name)}&subfolder=${encodeURIComponent(sub)}&type=input&rand=${Math.random()}`);
}

export function upscaleImageInBackground(prepared, options = {}) {
  const tracker = createTracker();
  // Cancellation context, shared between the pipeline and tracker.cancel().
  const run = { cancelled: false, promptId: null, executionStarted: false };
  tracker.cancel = async () => {
    if (run.cancelled) return;
    run.cancelled = true;
    // Free the UI first, then interrupt server-side. A slow or hung interrupt
    // must not strand the modal — and since run.cancelled is now set, a stranded
    // await would also make every retry Stop a no-op.
    tracker.emit({ phase: "cancelled" });
    toast("info", "Upscale cancelled.");
    try {
      if (run.promptId) {
        if (run.executionStarted) {
          // Ours is the prompt the server is executing — interrupt it.
          // The execution_interrupted event handles listener cleanup.
          await api.interrupt();
        } else {
          // Still pending: pull it out of the queue. NEVER blind-interrupt
          // here — that would kill whatever the server is running for
          // someone else. No ws event follows a queue delete, so clean up
          // the listeners ourselves.
          await api.fetchApi("/queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ delete: [run.promptId] }),
          });
          run.cleanup?.();
        }
      }
    } catch (e) {
      console.warn("[PromptChain] upscale cancel request failed", e);
    }
  };

  (async () => {
    // Off-screen builds can't re-render missing pose maps (no viewport ever
    // mounts) — when a pose-hinted mode needs them and they're gone, say so
    // instead of touching the user's tabs.
    const mode = options.mode || prepared.caps?.defaultMode || "prompt";
    // Only the source-model graft can need pose maps — picker/plain engines
    // never hint from them.
    const poseHinted = (options.engine || "source") === "source" && (mode === "regional"
      || (mode === "depth" && (options.depthSource || prepared.caps?.defaultDepthSource || "pose") === "pose"));
    if (prepared.data.pose_files_ok === false && poseHinted) {
      tracker.emit({ phase: "error", message: "this image's 3D pose maps were deleted — drag the image onto the ComfyUI canvas to load its OWN workflow (not a saved .json), let the 3D Poser re-render, then retry. New renders are now pinned so this won't recur." });
      return;
    }

    // Enlarge cache (NoUpscale tile engines): pre-enlarge once, reuse on retry so
    // only the tiles re-run. Wrapped so ANY failure falls through to the normal
    // fused build — this can never break the upscale, only skip the optimization.
    try {
      // Skip <=1.02: there the fused build does a plain lanczos (no ESRGAN climb), so
      // there's nothing expensive to cache AND a cached ESRGAN base would diverge from
      // the fused output. Above 1.02 the cached base equals the fused climb (same
      // climbModel, same lanczos fit), so the result is unchanged — just cached.
      const { targetW, targetH, scale } = TILE_ENGINES.has(options.engine || "source") && !options.preEnlargedRef
        ? resolveEnlargeTarget(options, prepared.data)
        : { scale: 0 };
      if (scale > 1.02) {
        const key = enlargeCacheKey(options, prepared.data, targetW, targetH);
        let baseRef = _enlargeCache.get(key);
        if (baseRef) {
          console.log(`[upscale-cache] HIT — reusing enlarged base, skipping pre-process (${targetW}x${targetH})`);
        } else {
          tracker.emit({ phase: "running", prep: true });
          const enlEngine = options.climbStage === "seedvr2" ? "seedvr2" : "ultrasharp";
          const temp = await enlargeImageInBackground(prepared.data.input_ref, targetW, targetH, enlEngine, options.climbModel);
          if (run.cancelled) return;
          baseRef = await copyEnlargedToInput(temp, hashKey(key));
          _enlargeCache.set(key, baseRef);
          console.log(`[upscale-cache] MISS — enlarged + cached base (${targetW}x${targetH})`);
        }
        options = { ...options, preEnlargedRef: baseRef, preEnlargedW: targetW, preEnlargedH: targetH };
      }
    } catch (e) {
      console.warn("[PromptChain] enlarge cache pre-pass skipped — using fused build:", e);
      options = { ...options, preEnlargedRef: null };
    }

    tracker.emit({ phase: "building" });
    const built = await buildUpscaleGraph(prepared, options);
    if (!built) {
      tracker.emit({ phase: "error", message: "couldn't build the upscale graph" });
      return;
    }
    const { graph, workflowId } = built;
    if (run.cancelled) return;

    tracker.emit({ phase: "queueing" });
    const serialized = await app.graphToPrompt(graph);
    logUpscaleRun(serialized.output, options.engine);
    let promptId = null;
    // Arm the external-prompt window across the queue round-trip so the main
    // graph's execution_start gate recognizes this run even if its event beats
    // the post-resolve registration below.
    armExternalQueue();
    try {
      // Mirror the UI queue path: it injects the user's preview-method setting
      // as a per-prompt override (extra_data.preview_method) — without it the
      // server falls back to the CLI default (usually no previews) and the
      // modal's live preview never gets a frame.
      const previewMethod = app.extensionManager?.setting?.get?.("Comfy.Execution.PreviewMethod")
        ?? app.ui?.settings?.getSettingValue?.("Comfy.Execution.PreviewMethod")
        ?? "default";
      const res = await api.queuePrompt(0, { output: serialized.output, workflow: serialized.workflow }, { previewMethod });
      promptId = res?.prompt_id || null;
    } catch (e) {
      disarmExternalQueue();
      const message = e?.response?.error?.message || e?.message || "queue rejected the prompt";
      tracker.emit({ phase: "error", message });
      toast("error", `Upscale failed to queue: ${message}`);
      return;
    }
    if (promptId) externallyTrackedPrompts.add(promptId);
    disarmExternalQueue();
    run.promptId = promptId;
    const startedAt = Date.now();
    const meta = collectRecordMeta(graph, prepared.data);
    const plan = computeTilePlan(graph, prepared.data, options);

    if (!promptId) {
      tracker.emit({ phase: "error", message: "queue returned no prompt id" });
      return;
    }
    if (run.cancelled) {
      // Cancel raced the queue call — pull the prompt back out.
      try {
        await api.fetchApi("/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete: [promptId] }),
        });
      } catch {}
      externallyTrackedPrompts.delete(promptId);
      return;
    }
    tracker.emit({ phase: "running" });
    const enlargedUrl = options.preEnlargedRef ? enlargedRefUrl(options.preEnlargedRef) : null;
    watchExecution({ promptId, workflowId, meta, plan, startedAt, tracker, run, enlargedUrl });
  })().catch((e) => {
    console.error("[PromptChain] background upscale failed", e);
    tracker.emit({ phase: "error", message: e?.message || "unexpected failure" });
    toast("error", `Upscale failed: ${e?.message || e}`);
  });
  return tracker;
}
