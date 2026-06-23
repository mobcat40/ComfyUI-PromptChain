// "Smooth" background runner — RIFE interpolation off-screen, queued, recorded as
// a lineage CHILD of the source video. Mirrors extend-background.js.

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { recordGeneration, externallyTrackedPrompts, armExternalQueue, disarmExternalQueue } from "./history.js";
import { buildSmoothGraph } from "./smooth-from-image.js";

function toast(severity, detail, life = 8000) {
  app.extensionManager?.toast?.add({ severity, summary: "Smooth", detail, life });
}

function createTracker() {
  const listeners = new Set();
  const tracker = {
    state: { phase: "building" },
    subscribe(fn) { listeners.add(fn); fn(tracker.state); return () => listeners.delete(fn); },
    emit(state) { tracker.state = state; for (const fn of listeners) { try { fn(state); } catch {} } },
  };
  return tracker;
}

function viewUrl(img) {
  if (!img?.filename) return "";
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || "", type: img.type || "output" });
  return api.apiURL ? api.apiURL(`/view?${q}`) : `/view?${q}`;
}

// opts: { sourceVideoFilename, multiplier, outFps, parentFilename }
export function runSmoothInBackground(opts) {
  const tracker = createTracker();
  const run = { cancelled: false, promptId: null, executionStarted: false, cleanup: null };

  tracker.cancel = async () => {
    if (run.cancelled) return;
    run.cancelled = true;
    tracker.emit({ phase: "cancelled" });
    toast("info", "Smooth cancelled.");
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
    } catch (e) { console.warn("[Smooth] cancel request failed", e); }
  };

  (async () => {
    tracker.emit({ phase: "building" });
    // Whole opts through — an allowlist here dropped the Advanced knobs
    // (ckpt/scale_factor/ensemble/fast_mode) the modal sends.
    const built = buildSmoothGraph({ ...opts });
    if (!built) { tracker.emit({ phase: "error", message: "couldn't build the smooth graph (is the RIFE pack installed?)" }); return; }
    const { graph, workflowId } = built;
    if (run.cancelled) return;

    tracker.emit({ phase: "queueing" });
    const serialized = await app.graphToPrompt(graph);
    armExternalQueue();
    let promptId = null;
    try {
      const previewMethod = app.extensionManager?.setting?.get?.("Comfy.Execution.PreviewMethod")
        ?? app.ui?.settings?.getSettingValue?.("Comfy.Execution.PreviewMethod") ?? "default";
      const res = await api.queuePrompt(0, { output: serialized.output, workflow: serialized.workflow }, { previewMethod });
      promptId = res?.prompt_id || null;
    } catch (e) {
      disarmExternalQueue();
      const message = e?.response?.error?.message || e?.message || "queue rejected the prompt";
      tracker.emit({ phase: "error", message });
      toast("error", `Smooth failed to queue: ${message}`);
      return;
    }
    if (promptId) externallyTrackedPrompts.add(promptId);
    disarmExternalQueue();
    run.promptId = promptId;
    if (!promptId) { tracker.emit({ phase: "error", message: "queue returned no prompt id" }); return; }
    if (run.cancelled) {
      try {
        await api.fetchApi("/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delete: [promptId] }) });
      } catch {}
      externallyTrackedPrompts.delete(promptId);
      return;
    }

    let lastImage = null, lastPreview = null;
    const onStart = ({ detail }) => { if (detail?.prompt_id === promptId) run.executionStarted = true; };
    const onProgress = ({ detail }) => {
      if (detail?.prompt_id !== promptId || run.cancelled) return;
      run.executionStarted = true;
      tracker.emit({ ...tracker.state, phase: "running", value: detail?.value || 0, max: detail?.max || 0 });
    };
    const onPreview = ({ detail }) => {
      if (run.cancelled || !run.executionStarted || !(detail instanceof Blob)) return;
      if (lastPreview) URL.revokeObjectURL(lastPreview);
      lastPreview = URL.createObjectURL(detail);
      tracker.emit({ ...tracker.state, phase: "running", previewUrl: lastPreview });
    };
    const onExecuted = ({ detail }) => {
      if (detail?.prompt_id !== promptId || !detail?.output?.images?.length) return;
      lastImage = detail.output.images[detail.output.images.length - 1];
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
    };
    run.cleanup = cleanup;
    const onSuccess = async ({ detail }) => {
      if (detail?.prompt_id !== promptId) return;
      cleanup();
      if (!lastImage) { tracker.emit({ phase: "error", message: "smooth produced no video" }); return; }
      const entry = await recordGeneration(workflowId, lastImage.filename, lastImage.subfolder, "output", {
        parent_filename: opts.parentFilename || "",
      });
      tracker.emit({ phase: "done", resultUrl: viewUrl(lastImage), resultHash: entry?.hash || null, entry });
    };
    const onError = ({ detail }) => {
      if (detail?.prompt_id !== promptId) return;
      cleanup();
      tracker.emit({ phase: "error", message: detail?.exception_message || "smooth render failed" });
    };
    api.addEventListener("execution_start", onStart);
    api.addEventListener("progress", onProgress);
    api.addEventListener("b_preview", onPreview);
    api.addEventListener("executed", onExecuted);
    api.addEventListener("execution_success", onSuccess);
    api.addEventListener("execution_error", onError);
    api.addEventListener("execution_interrupted", onError);
    tracker.emit({ phase: "running" });
  })().catch((e) => {
    console.error("[Smooth] background run failed", e);
    tracker.emit({ phase: "error", message: e?.message || "unexpected failure" });
    toast("error", `Smooth failed: ${e?.message || e}`);
  });

  return tracker;
}
