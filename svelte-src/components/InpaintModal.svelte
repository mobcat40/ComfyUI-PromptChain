<script>
  // InpaintModal — [Mask] | [Output] tabs over one image space. Paint the
  // region, type a PromptChain-style prompt, Apply renders in the background
  // (auto-switching to Output, repeatable), Save finalizes the shown render
  // into the output path with lineage.

  import { untrack } from "svelte";
  import { portal } from "../lib/portal.js";
  import { recallModalMemory, storeModalMemory } from "../lib/modal-memory.js";
  import { loadModalSetup, saveModalSetup } from "../lib/modal-setup.js";
  import SettingsSlider from "./model/SettingsSlider.svelte";
  import SavePathInput from "./SavePathInput.svelte";
  import SearchableSelect from "./shared/SearchableSelect.svelte";
  import "./sidebar/modal-shared.css";

  let {
    open,
    sourceUrl = "",
    width = 0,
    height = 0,
    filename = "",
    caps = null,
    prefillPrompt = "",
    referencePrompt = "",
    fetchApi = null,
    apiURL = (p) => p,
    onRun = null,        // (options) => tracker
    onSave = null,       // (doneState, prefix) => entry | null
    onSaved = null,      // (entry) => void — viewer jumps to the result
    initialMask = null,  // canvas/ImageData to pre-paint (Edit handoff)
    imageKey = "",       // stable id of the image (per-image session memory)
    onUseInEdit = null,  // (doneState) => void — hand the render back to Edit as a layer
    elevated = false,    // raise z-index above the Edit modal
    onUploadReference = null, // (File) => Promise<filename in input/>
    onInstallPack = null,     // (injectable) => Promise<boolean installed>
    mountPromptEditor = null, // (container, initialValue, onChange) => Promise<EditorView>
    regionPrompts = [],       // [{name, text}] — the image's per-$block region prompts, for one-click prefill
    forcedPrefill = null,     // auto-resolved region prompt (the mask's figure) — wins over generic prefill
    forcedPrefillLabel = "",  // which figure forcedPrefill resolved to, for the note
    movedContent = false,     // the content was dragged off its scene position — regional resolves wrong
    onCancel,
  } = $props();

  let activeTab = $state("mask");
  let prompt = $state("");
  let denoise = $state(0.5);
  let sampler = $state("");
  let scheduler = $state("");
  let steps = $state(0); // pre-filled to the engine's recipe on open (engineRecipe); 0 = inherit (source)
  let cfg = $state(0);   // pre-filled to the engine's recipe on open; 0 = inherit (source)
  // Mask shaping (Advanced): grow dilates the painted mask, feather softens its
  // edge — both forwarded to PromptChain_MaskedDetail.
  let grow = $state(0);
  let feather = $state(24);
  let maskAdvancedOpen = $state(false);
  let promptEditorView = null; // CM6 EditorView once mounted; prompt mirrors its content
  let savePrefix = $state("");
  // Condition: "none" | "pulid" | "ipadapter". referenceImage = filename in input/.
  let condition = $state("none");
  let referenceImage = $state("");
  let conditionWeight = $state(0.6); // identity (pulid) / style (ipadapter) strength → node `weight`
  let ipaWeightType = $state("style transfer");
  let conditionAdvancedOpen = $state(false);
  let ipaStartAt = $state(0);
  let ipaEndAt = $state(0.7);
  let pulidFidelity = $state(4);
  let pulidStartAt = $state(0);
  let pulidEndAt = $state(1);
  let installing = $state(false);
  let installedOverride = $state({}); // condition -> true after an inline install
  let refInputEl;
  let needsReference = $derived(condition === "pulid" || condition === "ipadapter");
  // Engine: "source" = surgery on the image's own embedded prompt (all
  // classic behavior); a picked SDXL checkpoint hash = standalone
  // MaskedDetail graph — works without render metadata and unlocks the
  // SDXL-only conditions on any source architecture; a picked Qwen Edit
  // model = instruction-driven masked edit (SetLatentNoiseMask pinning).
  let engineSel = $state("source");
  let engineEntry = $derived(caps?.engineModels?.find((m) => m.hash === engineSel) || null);
  let engineKind = $derived(engineEntry
    ? (engineEntry.architecture === "qwen_edit" ? "qwen" : engineEntry.architecture === "flux" ? "flux1" : engineEntry.architecture === "krea2" ? "krea2" : "sdxl")
    : "source");
  // Realism mode: a krea2_turbo-only recipe (abliterated encoder + realism/bypass
  // LoRAs). Inpaint keeps qwen_image_vae (seam-safe) and MaskedDetail's sampler.
  let realism = $state(false);
  let realismAvailable = $derived(engineKind === "krea2" && /turbo/i.test(engineEntry?.filename || ""));
  let engineGroups = $derived({
    sdxl: (caps?.engineModels || []).filter((m) => m.architecture === "sdxl"),
    flux1: (caps?.engineModels || []).filter((m) => m.architecture === "flux"),
    krea2: (caps?.engineModels || []).filter((m) => m.architecture === "krea2"),
    qwen: (caps?.engineModels || []).filter((m) => m.architecture === "qwen_edit"),
  });
  // SearchableSelect feed — same rows/groups the native <select> carried.
  let engineSelectGroups = $derived([
    ...(caps?.sourceUsable !== false
      ? [{ label: "", options: [{ value: "source", label: "Source model — this image's own workflow (default)" }] }]
      : []),
    ...(engineGroups.sdxl.length
      ? [{ label: "SDXL — re-render the masked region", options: engineGroups.sdxl.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    ...(engineGroups.flux1.length
      ? [{ label: "FLUX.1 — re-render the masked region", options: engineGroups.flux1.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    ...(engineGroups.krea2.length
      ? [{ label: "Krea 2 — re-render the masked region", options: engineGroups.krea2.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    ...(engineGroups.qwen.length
      ? [{ label: "Qwen Edit — instruction edit (masked)", options: engineGroups.qwen.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
  ]);
  let recSampler = $derived(engineKind === "qwen" || engineKind === "flux1" || engineKind === "krea2"
    ? (engineEntry?.gen?.sampler || "euler")
    : (engineEntry?.gen?.sampler || caps?.recommendedSampler));
  let recScheduler = $derived(engineKind === "qwen" || engineKind === "flux1" || engineKind === "krea2"
    ? (engineEntry?.gen?.scheduler || "simple")
    : (engineEntry?.gen?.scheduler || caps?.recommendedScheduler));
  // Steps/CFG the modal pre-fills per engine, mirroring the inpaint builders'
  // own defaults (RAW 30/3.5 · Turbo 8/1.0 · SDXL 25/5 · Qwen 40/4 · Flux 25/1)
  // so the sliders show real values instead of a bare 0. The source model has
  // no fixed recipe — 0 tells the builder to inherit the image's own steps/cfg.
  function engineRecipe(entry) {
    const kind = entry
      ? (entry.architecture === "qwen_edit" ? "qwen" : entry.architecture === "flux" ? "flux1" : entry.architecture === "krea2" ? "krea2" : "sdxl")
      : "source";
    const isRaw = kind === "krea2" && /raw/i.test(entry?.filename || "") && !/turbo/i.test(entry?.filename || "");
    if (kind === "krea2") return { steps: isRaw ? 30 : 8, cfg: isRaw ? 3.5 : 1.0 };
    if (kind === "sdxl") return { steps: entry?.gen?.steps || 25, cfg: entry?.gen?.cfg ?? 5 };
    if (kind === "qwen") return { steps: entry?.gen?.steps || 40, cfg: entry?.gen?.cfg ?? 4 };
    if (kind === "flux1") return { steps: entry?.gen?.steps || 25, cfg: 1.0 };
    return { steps: 0, cfg: 0 };
  }
  let recSteps = $derived(engineRecipe(engineEntry).steps);
  let recCfg = $derived(engineRecipe(engineEntry).cfg);
  function conditionOk(key) {
    // PuLID/IPAdapter patch an SDXL checkpoint UNET — the qwen/flux1/krea2
    // builders have no splice point.
    if (engineKind === "qwen" || engineKind === "flux1" || engineKind === "krea2") return false;
    return engineKind === "sdxl" || !!caps?.conditions?.[key]?.ok;
  }

  // Inpaint mode, mirroring the upscale modal's rows. Source engine only — an
  // engine model is a standalone re-render with no scene to resolve.
  let mode = $state("regional");
  let memoryPrompt = null; // per-image remembered prompt; honored only when its mode matches
  const MODE_ROWS = [
    { key: "basic", label: "Basic", desc: "Re-render the masked region with one prompt.", needs: null },
    { key: "depth", label: "Depth", desc: "One prompt + a depth ControlNet so structure can't drift.", needs: "depth" },
    { key: "regional", label: "Regional", desc: "The scene masks resolve each figure's prompt automatically.", needs: "regional" },
    { key: "regional-depth", label: "Regional + depth", desc: "Per-figure prompts plus depth structure-lock.", needs: "both" },
  ];
  let isRegionalMode = $derived(mode === "regional" || mode === "regional-depth");
  let currentModeRow = $derived(MODE_ROWS.find((r) => r.key === mode) || MODE_ROWS[0]);
  function pickModeKey(key) { const r = MODE_ROWS.find((x) => x.key === key); if (r) pick(r); }
  let showModeRows = $derived(engineKind === "source" && (!!caps?.regionalAvailable || !!caps?.depthAvailable));
  let isRegionalRow = (row) => row.needs === "regional" || row.needs === "both";
  function modeOk(row) {
    if (row.needs === "regional") return !!caps?.regionalAvailable;
    if (row.needs === "depth") return !!caps?.depthAvailable;
    if (row.needs === "both") return !!caps?.regionalAvailable && !!caps?.depthAvailable;
    return true;
  }
  function modeReason(row) {
    if (modeOk(row)) return "";
    if (row.needs === "depth" || row.needs === "both") {
      if (!caps?.depthAvailable) return "Needs the ControlNet preprocessor pack and an SDXL union ControlNet model.";
    }
    return "This image's workflow carries no 3D pose scene to resolve regions from.";
  }
  // Per-mode deterministic prefill (source engine). Regional modes seed the
  // FULL $block source — for IN-PLACE content the masks resolve each figure by
  // position; for MOVED content the backend reads the masks at the content's
  // origin (cond_offset), so the same full source still follows the moved
  // figure. basic/depth seed a freshly-isolated figure prompt or the flat global.
  function basePrefillFor() {
    if (engineKind === "source") {
      if (caps?.sourceModelInfo?.architecture === "qwen_edit") return "";
      if (isRegionalMode && caps?.regionalAvailable
          && typeof referencePrompt === "string" && referencePrompt.trim()) return referencePrompt;
      if (typeof forcedPrefill === "string" && forcedPrefill.trim()) return forcedPrefill;
      return prefillPrompt || "";
    }
    if (engineKind === "qwen") return "";
    return prefillPrompt || "";
  }
  function prefillFor() {
    // Memory seeds the editor, but never across a mode change — it's set in the
    // open-effect only when the stored mode matches, and cleared on a flip.
    if (typeof memoryPrompt === "string" && memoryPrompt.trim()) return memoryPrompt;
    return basePrefillFor();
  }
  function pick(row) {
    if (!modeOk(row)) return;
    const wasRegional = isRegionalMode;
    mode = row.key;
    // Crossing the regional boundary swaps what the prompt MEANS (full $block
    // source vs flat) — re-seed deterministically, like the upscale modal.
    if (wasRegional !== isRegionalMode) {
      memoryPrompt = null;
      prompt = prefillFor();
    }
  }
  function pickEngine(value) {
    engineSel = value;
    const entry = caps?.engineModels?.find((m) => m.hash === value) || null;
    const kind = entry
      ? (entry.architecture === "qwen_edit" ? "qwen" : entry.architecture === "flux" ? "flux1" : entry.architecture === "krea2" ? "krea2" : "sdxl")
      : "source";
    if (entry) {
      // The picked model's own gen-time sampler pick beats the source's.
      const fluxLike = kind === "qwen" || kind === "flux1" || kind === "krea2";
      sampler = entry.gen?.sampler || (fluxLike ? "euler" : sampler);
      scheduler = entry.gen?.scheduler || (fluxLike ? "simple" : scheduler);
      if (fluxLike && condition !== "none") condition = "none";
    } else {
      sampler = caps?.defaultSampler || "";
      scheduler = caps?.defaultScheduler || "";
      // Back on source: a condition the source architecture can't carry resets.
      if (condition !== "none" && !caps?.conditions?.[condition]?.ok) condition = "none";
    }
    const r = engineRecipe(entry);
    steps = r.steps; cfg = r.cfg;
    // The mode rows only apply to the source engine; switching engine changes
    // what the prompt MEANS, so re-seed deterministically (edits discarded).
    memoryPrompt = null;
    prompt = prefillFor();
  }
  // Per-condition default strength (matches the node defaults the graft used to
  // hardcode) and the IPAdapter weight-type enum (ComfyUI_IPAdapter_plus).
  const DEFAULT_WEIGHT = { pulid: 0.45, ipadapter: 0.7 };
  const IPA_WEIGHT_TYPES = [
    "linear", "ease in", "ease out", "ease in-out", "reverse in-out",
    "weak input", "weak output", "weak middle", "strong middle",
    "style transfer", "composition", "strong style transfer",
    "style and composition", "style transfer precise", "composition precise",
  ];
  let refThumbUrl = $derived(referenceImage
    ? apiURL(`/view?filename=${encodeURIComponent(referenceImage)}&subfolder=&type=input`)
    : "");
  let refEl; // the read-only reference textarea
  // Copy from the reference box ourselves: a global ComfyUI keydown intercepts
  // Ctrl+C in CAPTURE phase (node copy) and kills the textarea's native copy.
  // A window capture listener fires before it; handle Ctrl+C when the ref box is
  // focused and stop the event so ComfyUI never sees it.
  $effect(() => {
    if (!open) return;
    const onKey = (e) => {
      // Ctrl+Enter = Apply — and NEVER ComfyUI's Queue Prompt (its keybinding
      // isn't reserved-by-text-input, so it fires even from the prompt editor
      // and re-runs the user's whole workflow underneath the modal).
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        apply(); // guards itself: no-op while running or maskless
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && refEl && document.activeElement === refEl) {
        const text = refEl.selectionStart !== refEl.selectionEnd
          ? refEl.value.slice(refEl.selectionStart, refEl.selectionEnd) : refEl.value;
        navigator.clipboard?.writeText(text);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  let progress = $state(null);
  let doneState = $state(null);
  let saving = $state(false);
  let errorMsg = $state("");
  let tracker = null;
  let unsub = null;

  // Fire the open-time reset ONCE per open transition. The body is wrapped in
  // untrack() so reading caps/prefillPrompt/condition here doesn't make them
  // dependencies — otherwise any prop change while the modal is open (a late
  // prefillPrompt, a Condition pick) re-runs the whole reset, calling
  // clearMask()/hasMask=false and wiping the user's freshly painted mask.
  let wasOpen = false;
  $effect(() => {
    if (open && caps && !wasOpen) {
      wasOpen = true;
      untrack(() => {
        const initialCondition = caps.defaultCondition || "none";
        activeTab = "mask";
        // No usable source workflow → the first engine model is the only way
        // to render; otherwise every open defaults back to the classic graft —
        // unless this image has session memory (last applied engine wins when
        // it's still available).
        const mem = recallModalMemory("inpaint", imageKey);
        const memEngineValid = mem?.engine === "source"
          ? caps.sourceUsable !== false
          : !!mem?.engine && !!caps.engineModels?.some((m) => m.hash === mem.engine);
        engineSel = memEngineValid ? mem.engine
          : caps.sourceUsable === false ? (caps.engineModels?.[0]?.hash || "source") : "source";
        // Mode: remembered when valid for this image, else regional when the
        // scene supports it. memoryPrompt is honored only when the stored mode
        // matches the resolved mode — a stale flat prompt can't shadow the
        // regional full source (and old memory with no mode field falls through
        // to the deterministic seed).
        const onSource = engineSel === "source";
        const defaultMode = (onSource && caps.regionalAvailable) ? "regional" : "basic";
        const memModeOk = onSource && (
          mem?.mode === "basic" ? true
          : mem?.mode === "depth" ? caps.depthAvailable
          : mem?.mode === "regional" ? caps.regionalAvailable
          : mem?.mode === "regional-depth" ? (caps.regionalAvailable && caps.depthAvailable)
          : false);
        mode = memModeOk ? mem.mode : defaultMode;
        memoryPrompt = (mem && mem.mode === mode && typeof mem.prompt === "string" && mem.prompt.trim())
          ? mem.prompt : null;
        prompt = prefillFor();
        denoise = caps.defaultDenoise ?? 0.5;
        sampler = caps.defaultSampler || "";
        scheduler = caps.defaultScheduler || "";
        // A pre-selected engine seeds its model's own gen sampler, same as a
        // manual pickEngine — caps.defaultSampler is the source's, not its.
        const preEntry = caps.engineModels?.find((m) => m.hash === engineSel);
        if (preEntry?.gen?.sampler) sampler = preEntry.gen.sampler;
        if (preEntry?.gen?.scheduler) scheduler = preEntry.gen.scheduler;
        const r0 = engineRecipe(preEntry);
        steps = r0.steps; cfg = r0.cfg;
        if (memEngineValid && typeof mem.denoise === "number") denoise = mem.denoise;
        grow = 0;
        feather = 24;
        maskOpacity = 0.55;
        maskAdvancedOpen = false;
        savePrefix = caps.defaultSavePrefix || "inpaint/inpaint";
        condition = initialCondition;
        referenceImage = caps.conditions?.[initialCondition]?.reference || "";
        conditionWeight = DEFAULT_WEIGHT[initialCondition] ?? 0.6;
        ipaWeightType = "style transfer";
        conditionAdvancedOpen = false;
        ipaStartAt = 0; ipaEndAt = 0.7;
        pulidFidelity = 4; pulidStartAt = 0; pulidEndAt = 1;
        installing = false;
        progress = null;
        doneState = null;
        saving = false;
        errorMsg = "";
        hasMask = false;
        requestAnimationFrame(() => { resetView(); clearMask(); applyInitialMask(); });
      });
    } else if (!open) {
      wasOpen = false;
    }
  });

  // ── saved-setup restore (server sidecar, keyed by imageKey == displayedHash) ──
  // Loaded async on open into savedSetup; applied ONLY on the user's chip click,
  // so it stays out of the untrack() reset above and can't wipe a painted mask.
  // The PuLID / Style-Reference cluster is the headline gap — the reset wipes it
  // back to defaults every open.
  let savedSetup = $state(null);
  let promptRestoreNonce = $state(0);  // bump to force the prompt editor to reseed
  $effect(() => {
    if (!open || !fetchApi || !imageKey) { savedSetup = null; return; }
    let cancelled = false;
    loadModalSetup(fetchApi, imageKey).then((doc) => {
      if (cancelled || !doc) return;
      const ip = doc.kinds?.inpaint;
      const dimsOk = !doc.dims || (doc.dims.w === width && doc.dims.h === height);
      savedSetup = ip && dimsOk ? ip : null;
    });
    return () => { cancelled = true; };
  });

  function applySavedSetup() {
    const s = savedSetup;
    if (!s) return;
    // Engine first — pickEngine reseeds sampler/scheduler and drops conditions
    // for flux-like engines (same ordering as the open-effect's memory restore).
    if (typeof s.engine === "string") {
      const ok = s.engine === "source" ? (caps?.sourceUsable !== false)
        : !!caps?.engineModels?.some((m) => m.hash === s.engine);
      if (ok) pickEngine(s.engine);
    }
    if (engineKind === "source" && typeof s.mode === "string") {
      const modeOk = s.mode === "basic" ? true
        : s.mode === "depth" ? caps?.depthAvailable
        : s.mode === "regional" ? caps?.regionalAvailable
        : s.mode === "regional-depth" ? (caps?.regionalAvailable && caps?.depthAvailable)
        : false;
      if (modeOk) mode = s.mode;
    }
    if (typeof s.denoise === "number") denoise = s.denoise;
    if (typeof s.sampler === "string") sampler = s.sampler;
    if (typeof s.scheduler === "string") scheduler = s.scheduler;
    if (typeof s.grow === "number") grow = s.grow;
    if (typeof s.feather === "number") feather = s.feather;
    if (typeof s.maskOpacity === "number") maskOpacity = s.maskOpacity;
    // Condition cluster — only when the resolved engine can carry it and the
    // condition is actually installed (flux/qwen engines can't).
    const fluxLike = engineKind === "flux1" || engineKind === "qwen" || engineKind === "krea2";
    // conditionOk (not the raw caps flag) so an SDXL-engine pick re-enables the
    // condition the same way the live dropdown does — else it's silently dropped.
    if (typeof s.condition === "string" && !(fluxLike && s.condition !== "none")
        && (s.condition === "none" || conditionOk(s.condition))) {
      condition = s.condition;
      if (typeof s.referenceImage === "string") referenceImage = s.referenceImage;
      if (typeof s.conditionWeight === "number") conditionWeight = s.conditionWeight;
      if (typeof s.ipaWeightType === "string") ipaWeightType = s.ipaWeightType;
      if (typeof s.ipaStartAt === "number") ipaStartAt = s.ipaStartAt;
      if (typeof s.ipaEndAt === "number") ipaEndAt = s.ipaEndAt;
      if (typeof s.pulidFidelity === "number") pulidFidelity = s.pulidFidelity;
      if (typeof s.pulidStartAt === "number") pulidStartAt = s.pulidStartAt;
      if (typeof s.pulidEndAt === "number") pulidEndAt = s.pulidEndAt;
    }
    // Prompt — reseed the rich editor via the remount nonce (a bare assignment
    // doesn't repaint the mounted CM6 view); prefillFor() reads memoryPrompt.
    if (typeof s.prompt === "string" && s.prompt.trim()) {
      memoryPrompt = s.prompt;
      prompt = s.prompt;
      promptRestoreNonce++;
    }
    // Painted mask — the saved alpha plane, recolored to the painter's red
    // (source-in uses only its alpha, matching applyInitialMask's contract).
    if (s.hasMask && imageKey && maskCanvas) {
      const img = new Image();
      img.onload = () => {
        const ctx = maskCanvas.getContext("2d");
        const tmp = document.createElement("canvas");
        tmp.width = width; tmp.height = height;
        const tctx = tmp.getContext("2d");
        tctx.drawImage(img, 0, 0, width, height);
        tctx.globalCompositeOperation = "source-in";
        tctx.fillStyle = "rgb(255, 60, 60)";
        tctx.fillRect(0, 0, width, height);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(tmp, 0, 0);
        hasMask = true;
      };
      img.src = apiURL(`/promptchain/modal-setup/${imageKey}/inpaint__mask.png?t=${Date.now()}`);
    }
    savedSetup = null;  // dismiss the chip once applied
  }

  let running = $derived(!!progress && progress.phase !== "done" && progress.phase !== "error" && progress.phase !== "cancelled");
  let outputUrl = $derived((() => {
    if (progress?.phase === "running" && progress.previewUrl) return progress.previewUrl;
    if (doneState?.temp) {
      const t = doneState.temp;
      return apiURL(`/view?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || "")}&type=${t.type || "temp"}&rand=${doneState.rand}`);
    }
    return null;
  })());
  let progressPercent = $derived(
    progress?.phase === "running" && progress.max ? Math.round((progress.value / progress.max) * 100) : null
  );

  // ── painter state ──────────────────────────────────────────────
  let viewportEl;
  let maskCanvas;       // overlay at natural image size
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  // Brush size persists across opens (the modal remounts each open, so plain
  // $state would reset to the default every time).
  const BRUSH_SIZE_KEY = "pcr.inpaint.brushSize";
  function loadBrushSize() {
    try {
      const v = Number(localStorage.getItem(BRUSH_SIZE_KEY));
      if (Number.isFinite(v) && v >= 4 && v <= 256) return v;
    } catch { /* localStorage blocked */ }
    return 48;
  }
  let brushSize = $state(loadBrushSize());
  $effect(() => {
    try { localStorage.setItem(BRUSH_SIZE_KEY, String(brushSize)); } catch { /* ignore */ }
  });
  let eraser = $state(false);
  // Display-only opacity of the mask overlay — lets you see the image behind a
  // brushed area. The stored canvas is painted solid; this is CSS opacity, so
  // exportMask (which reads canvas pixels) is unaffected.
  let maskOpacity = $state(0.55);
  let hasMask = $state(false);
  let painting = false;
  let panning = false;
  let lastPt = null;
  // Brush-size ring that tracks the cursor over the mask. Coords are viewport-
  // local px; the ring diameter is brushSize scaled by zoom (brushSize is the
  // stroke diameter in image px).
  let cursorX = $state(0);
  let cursorY = $state(0);
  let cursorOver = $state(false);
  // Output-tab before/after: a screen-space vertical divider wipes the original
  // (left of it) over the result (right). splitX is viewport-local px; the
  // images behind it share the mask tab's pan/zoom so they stay registered.
  let compareSplit = $state(false);
  let splitX = $state(0);
  let splitDragging = false;

  function resetView() {
    if (!viewportEl || !width || !height) { zoom = 1; panX = 0; panY = 0; return; }
    const rect = viewportEl.getBoundingClientRect();
    zoom = Math.min(rect.width / width, rect.height / height, 1) || 1;
    panX = (rect.width - width * zoom) / 2;
    panY = (rect.height - height * zoom) / 2;
  }

  function toggleCompare() {
    if (!outputUrl || running) return;
    compareSplit = !compareSplit;
    // open the divider centered so both halves are visible
    if (compareSplit) {
      const rect = viewportEl?.getBoundingClientRect();
      splitX = rect ? rect.width / 2 : 0;
    }
  }
  function onSplitDown(e) {
    e.stopPropagation();   // the viewport would otherwise start a pan
    e.preventDefault();
    splitDragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onSplitMove(e) {
    if (!splitDragging) return;
    e.stopPropagation();
    const rect = viewportEl.getBoundingClientRect();
    splitX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  }
  function onSplitUp(e) {
    splitDragging = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }

  function clearMask() {
    const ctx = maskCanvas?.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, width, height);
    hasMask = false;
  }

  // Pre-paint a handed-in mask (Edit → Inpaint). Drawn as the red paint so the
  // existing painter/eraser/export all work on it.
  function applyInitialMask() {
    if (!initialMask || !maskCanvas) return;
    const ctx = maskCanvas.getContext("2d");
    const tmp = document.createElement("canvas");
    tmp.width = width; tmp.height = height;
    const tctx = tmp.getContext("2d");
    if (initialMask instanceof ImageData) tctx.putImageData(initialMask, 0, 0);
    else tctx.drawImage(initialMask, 0, 0);
    // recolor any non-transparent mask pixels to the painter's red
    tctx.globalCompositeOperation = "source-in";
    tctx.fillStyle = "rgb(255, 60, 60)";
    tctx.fillRect(0, 0, width, height);
    ctx.drawImage(tmp, 0, 0);
    hasMask = true;
  }

  function toImageCoords(e) {
    const rect = viewportEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panX) / zoom,
      y: (e.clientY - rect.top - panY) / zoom,
    };
  }

  function strokeTo(pt) {
    const ctx = maskCanvas.getContext("2d");
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = "rgb(255, 60, 60)";
    ctx.fillStyle = "rgb(255, 60, 60)";
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (lastPt) {
      ctx.beginPath();
      ctx.moveTo(lastPt.x, lastPt.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPt = pt;
    if (!eraser) hasMask = true;
  }

  function onPointerDown(e) {
    if (e.button > 2) return;
    // Output tab: any drag pans (nothing to paint there). Mask tab keeps
    // left = paint, Shift/middle/right = pan.
    if (activeTab === "output" || e.button === 1 || e.button === 2 || e.shiftKey) {
      panning = true;
      lastPt = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (activeTab !== "mask" || running || e.button !== 0) {
      // TEMP (can't-paint-after-reopen diagnosis): log why a left-click didn't
      // paint so a stuck activeTab/running state is caught, not inferred.
      if (e.button === 0) console.warn("[PCR][ip] paint click ignored:", { activeTab, running, hasMask });
      return;
    }
    // preventDefault or the browser starts a native image drag mid-stroke and
    // the source image gets dragged out instead of painting the mask.
    e.preventDefault();
    painting = true;
    lastPt = null;
    strokeTo(toImageCoords(e));
    viewportEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const rect = viewportEl.getBoundingClientRect();
    cursorX = e.clientX - rect.left;
    cursorY = e.clientY - rect.top;
    if (panning) {
      panX += e.clientX - lastPt.x;
      panY += e.clientY - lastPt.y;
      lastPt = { x: e.clientX, y: e.clientY };
      return;
    }
    if (painting) strokeTo(toImageCoords(e));
  }

  function onPointerUp() {
    painting = false;
    panning = false;
    lastPt = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.05, Math.min(12, zoom * factor));
    panX = cx - ((cx - panX) / zoom) * newZoom;
    panY = cy - ((cy - panY) / zoom) * newZoom;
    zoom = newZoom;
  }

  // Bounding box of the painted pixels in image coords (same alpha threshold
  // as exportMask) — the qwen engine crops around it client-side.
  function maskBboxFromCanvas() {
    const ctx = maskCanvas?.getContext("2d");
    if (!ctx) return undefined;
    const d = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (d[(y * width + x) * 4 + 3] > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return undefined;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  // Mask export: black canvas, painted pixels → white (binary by alpha).
  async function exportMask() {
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    ctx.drawImage(maskCanvas, 0, 0);
    const img = ctx.getImageData(0, 0, width, height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const on = d[i + 3] > 16 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = on;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return new Promise((resolve) => out.toBlob(resolve, "image/png"));
  }

  // Model identity for the prompt editor's templates/autocomplete: the picked
  // engine model, else the image's own source model. Read live at menu-open
  // time, so an engine switch retargets the same mounted editor.
  function editorModelInfo() {
    if (engineEntry) return { hash: engineEntry.hash, architecture: engineEntry.architecture };
    return caps?.sourceModelInfo || null;
  }

  // Editor remounts on this key so a regional/engine flip re-seeds the prompt
  // (assignment alone won't repaint the mounted CM6 view). Basic↔Depth share a
  // key — both flat — so toggling depth keeps the user's prompt edits.
  let promptSeedKey = $derived(engineKind + ":" + (engineKind === "source" ? (isRegionalMode ? "regional" : "flat") : "engine"));

  // Mounts the rich prompt editor (tag highlighting + autocomplete) into its
  // container while the modal is open. {#if open}/{#key} unmount the container,
  // so destroy() tears the editor down — every (re)mount seeds from prefillFor
  // (mode-deterministic), with onChange mirroring its text into `prompt`.
  function promptEditor(node) {
    let disposed = false;
    let view = null;
    (async () => {
      if (!mountPromptEditor) return;
      const v = await mountPromptEditor(node, untrack(() => prefillFor()), (text) => { prompt = text; }, editorModelInfo);
      if (disposed) { v?.destroy?.(); return; }
      view = v;
      promptEditorView = v;
    })().catch((e) => console.error("[Inpaint] prompt editor mount failed", e));
    return {
      destroy() {
        disposed = true;
        view?.destroy?.();
        if (promptEditorView === view) promptEditorView = null;
      },
    };
  }

  // One-click region prefill: replace the prompt with the picked $block's
  // text (both the CM6 editor and the plain-textarea fallback mirror it).
  function applyRegionPrompt(r) {
    const text = (r?.text || "").trim();
    if (!text) return;
    prompt = text;
    if (promptEditorView) {
      promptEditorView.dispatch({
        changes: { from: 0, to: promptEditorView.state.doc.length, insert: text },
      });
    }
  }

  // ── conditions ─────────────────────────────────────────────────
  const PACK_FOR = { pulid: "PuLID", ipadapter: "StyleReference" };
  function isInstalled(key) {
    return !!installedOverride[key] || !!caps?.conditions?.[key]?.installed;
  }
  async function pickCondition(value) {
    condition = value;
    errorMsg = "";
    if (value === "none") return;
    conditionWeight = DEFAULT_WEIGHT[value] ?? 0.6; // reseed strength to the picked condition's default
    const cap = caps?.conditions?.[value];
    referenceImage = cap?.reference || referenceImage || "";
    // Inline install: an SDXL-ok but not-yet-installed pack is offered for
    // install on pick; cancel reverts to plain Inpaint. conditionOk (not
    // cap.ok): an SDXL engine pick unlocks conditions on any source.
    if (conditionOk(value) && !isInstalled(value) && onInstallPack) {
      installing = true;
      try {
        const ok = await onInstallPack(PACK_FOR[value]);
        if (ok) installedOverride = { ...installedOverride, [value]: true };
        else condition = "none";
      } catch (e) {
        condition = "none";
        errorMsg = `Couldn't set up ${value === "pulid" ? "PuLID" : "Style Reference"}: ${e?.message || e}`;
      } finally {
        installing = false;
      }
    }
  }
  async function chooseReference(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onUploadReference) return;
    try {
      const name = await onUploadReference(file);
      if (name) referenceImage = name;
    } catch {
      errorMsg = "reference upload failed";
    }
  }

  // ── actions ────────────────────────────────────────────────────
  async function apply() {
    if (!onRun || running || !hasMask) return;
    if (condition !== "none" && !isInstalled(condition)) { errorMsg = "Install this condition's pack first."; return; }
    const maskBlob = await exportMask();
    // Snapshot the mask THIS run rendered with — "Add to Edit" clips the
    // returned layer to it, so repainting the mask in here (growing it past
    // the original Edit selection) isn't chopped off at the old boundary.
    let appliedMask = null;
    if (onUseInEdit) {
      appliedMask = document.createElement("canvas");
      appliedMask.width = width; appliedMask.height = height;
      appliedMask.getContext("2d").drawImage(maskCanvas, 0, 0);
    }
    doneState = null;
    errorMsg = "";
    activeTab = "output";
    tracker = onRun({
      maskBlob, prompt, denoise, grow, feather, sampler: sampler || null, scheduler: scheduler || null,
      steps: steps > 0 ? steps : undefined, cfg: cfg > 0 ? cfg : undefined,
      // Source engine carries the mode so a Basic pick forces a flat encode
      // even if the prompt still has $blocks; engine models ignore it. (Moved
      // content rides regional + the ImageViewer-injected condOffset, which
      // shifts the region masks to the content's origin.)
      mode: engineKind === "source" ? mode : undefined,
      engine: engineKind === "sdxl" ? "sdxl-ckpt"
        : engineKind === "flux1" ? "flux1-unet"
        : engineKind === "krea2" ? "krea2-unet"
        : engineKind === "qwen" ? "qwen-edit" : "source",
      engineModel: engineEntry ? { hash: engineEntry.hash, filename: engineEntry.filename } : undefined,
      engineGen: engineEntry?.gen || undefined,
      realism: realismAvailable ? realism : undefined,
      // The qwen builder crops around the mask client-side — the bbox is
      // known here (the painted canvas), not on the server.
      maskBbox: engineKind === "qwen" ? maskBboxFromCanvas() : undefined,
      // No picked reference → lock to the image being inpainted itself (the
      // upscale modal's zero-config Character-lock anchor).
      condition, referenceImage: condition === "none" ? null : (referenceImage || "__self__"),
      conditionWeight, ipaWeightType, ipaStartAt, ipaEndAt,
      pulidFidelity, pulidStartAt, pulidEndAt,
    });
    storeModalMemory("inpaint", imageKey, {
      prompt,
      mode: engineKind === "source" ? mode : undefined,
      engine: engineKind === "source" ? "source" : engineSel,
      denoise,
    });
    // Durable per-image twin (sidecar): dials (PuLID/Style-Ref cluster is the
    // headline) + prompt + the painted mask as an ALPHA plane — the raw
    // maskCanvas (opaque-red where painted, transparent elsewhere), NOT
    // exportMask's white-on-black, so applySavedSetup's source-in recolor
    // round-trips it. Fire-and-forget.
    const maskPlaneBlob = await new Promise((res) => maskCanvas.toBlob(res, "image/png"));
    saveModalSetup(fetchApi, imageKey, "inpaint", {
      engine: engineSel,
      mode: engineKind === "source" ? mode : undefined,
      denoise, sampler, scheduler, grow, feather, maskOpacity,
      condition, referenceImage,
      conditionWeight, ipaWeightType, ipaStartAt, ipaEndAt,
      pulidFidelity, pulidStartAt, pulidEndAt,
      prompt, hasMask: true,
    }, { w: width, h: height }, maskPlaneBlob ? { "inpaint__mask.png": maskPlaneBlob } : {});
    unsub?.();
    unsub = tracker.subscribe((state) => {
      progress = state;
      if (state.phase === "done") {
        doneState = { ...state, appliedMask, rand: Math.random() };
        progress = null;
      } else if (state.phase === "cancelled") {
        progress = null;
        activeTab = "mask";
      } else if (state.phase === "error") {
        // Toasts render under the fullscreen viewer — surface the failure in
        // the modal itself or a failed run reads as a silent flicker.
        errorMsg = state.message || "inpaint failed";
        progress = null;
        activeTab = "mask";
      }
    });
  }

  function stopRun() {
    tracker?.cancel?.();
  }

  async function save() {
    if (!onSave || !doneState || saving) return;
    saving = true;
    try {
      const entry = await onSave(doneState, savePrefix.trim());
      if (entry) {
        // The viewer jumps to the result — copy this session's settings to
        // its hash so a re-inpaint of the result picks up where this left off.
        if (entry.hash) {
          storeModalMemory("inpaint", entry.hash, {
            prompt,
            mode: engineKind === "source" ? mode : undefined,
            engine: engineKind === "source" ? "source" : engineSel,
            denoise,
          });
        }
        close();
        onSaved?.(entry);
      }
    } finally {
      saving = false;
    }
  }

  function close() {
    unsub?.();
    unsub = null;
    tracker = null;
    onCancel?.();
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (running) return; // Stop is the only way out mid-run
      close();
    }
  }

</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- No outside-click close: a text-selection drag that releases on the backdrop
       must not nuke the modal. Close via the ✕, Cancel, or Esc. -->
  <div use:portal class="pcr-modal-backdrop" style:z-index={elevated ? 10006 : null} onkeydown={handleKeydown}>
    <div class="pcr-modal pcr-ip-modal" role="dialog" aria-modal="true">
      <div class="pcr-modal-header">
        <span class="pcr-modal-title">{running ? "Inpainting…" : "Inpaint"}{filename ? ` — ${filename}` : ""}{width && height ? ` · ${width}×${height}` : ""}</span>
        {#if !running}
          <button class="pcr-modal-close" onclick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        {/if}
      </div>
      <div class="pcr-modal-body pcr-ip-body">
        <div class="pcr-ip-left">
          <div class="pcr-ip-tabs">
            <div class="pcr-ip-seg">
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="pcr-ip-tab" class:active={activeTab === "mask"} onclick={() => { if (!running) activeTab = "mask"; }}>Mask</div>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="pcr-ip-tab" class:active={activeTab === "output"} onclick={() => { activeTab = "output"; }}>Output</div>
            </div>
            {#if activeTab === "mask"}
              <label class="pcr-ip-tool pcr-ip-opacity">Opacity
                <input type="range" min="0" max="1" step="0.05" bind:value={maskOpacity} />
              </label>
              <div class="pcr-ip-tools">
                <label class="pcr-ip-tool">Brush
                  <input type="range" min="4" max="1024" step="4" bind:value={brushSize} />
                </label>
                <div class="pcr-ip-iconbtns">
                  <button class="pcr-ip-iconbtn" class:active={!eraser} title="Brush" aria-label="Brush" onclick={() => { eraser = false; }}>
                    <svg viewBox="0 0 24 24"><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/></svg>
                  </button>
                  <button class="pcr-ip-iconbtn" class:active={eraser} title="Eraser" aria-label="Eraser" onclick={() => { eraser = true; }}>
                    <svg viewBox="0 0 24 24"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
                  </button>
                </div>
                <button class="pcr-ip-tool-btn" onclick={clearMask}>Clear</button>
                <button class="pcr-ip-tool-btn" onclick={resetView}>Fit</button>
              </div>
            {:else}
              <div class="pcr-ip-tools">
                <button class="pcr-ip-tool-btn" onclick={resetView}>Fit</button>
                <button class="pcr-ip-tool-btn" class:on={compareSplit}
                  disabled={!outputUrl || running} onclick={toggleCompare}
                  title="Drag the divider to wipe the original over the result">Compare</button>
              </div>
            {/if}
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="pcr-ip-viewport"
            class:out-mode={activeTab === "output"}
            bind:this={viewportEl}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointercancel={onPointerUp}
            onpointerenter={() => { cursorOver = true; }}
            onpointerleave={() => { cursorOver = false; }}
            onwheel={onWheel}
            oncontextmenu={(e) => e.preventDefault()}
            ondragstart={(e) => e.preventDefault()}
            onselectstart={(e) => e.preventDefault()}
          >
            <!-- The painter stage stays mounted on both tabs (display toggle, not
                 {#if}) — unmounting would recreate the canvas and lose the mask. -->
            <div class="pcr-ip-stage" style="transform: translate({panX}px, {panY}px) scale({zoom});"
              style:display={activeTab === "mask" ? null : "none"}>
              <img src={sourceUrl} alt="" draggable="false" width={width} height={height} />
              <canvas bind:this={maskCanvas} width={width} height={height} style:opacity={maskOpacity}></canvas>
            </div>
            {#if activeTab === "mask" && cursorOver}
              <div class="pcr-ip-brush-ring" class:eraser
                style="left:{cursorX}px; top:{cursorY}px; width:{brushSize * zoom}px; height:{brushSize * zoom}px;"></div>
            {/if}
            {#if activeTab === "output"}
              {#if running && progress?.previewUrl}
                <!-- The live sampler preview is the CROP being re-rendered, not
                     the full image — forcing it to doc dims (or applying the
                     mask tab's zoom/pan) blows a small region up to the whole
                     stage. Fit it centered; the doc-sized transform applies
                     only to the finished composite below. -->
                <div class="pcr-ip-center">
                  <img class="pcr-ip-live-preview" src={progress.previewUrl} alt="" draggable="false" />
                </div>
              {:else if outputUrl}
                <!-- Same stage transform as the mask tab — zoom/pan carry over
                     so you inspect the exact region you painted. -->
                <div class="pcr-ip-stage" style="transform: translate({panX}px, {panY}px) scale({zoom});">
                  <img src={outputUrl} alt="" draggable="false" width={width} height={height} />
                </div>
                {#if compareSplit}
                  <!-- The original, clipped to the LEFT of the divider in screen
                       space (calc(100% - splitX) = the right inset). The inner
                       stage uses the identical transform, so it stays pixel-
                       aligned with the result behind it. -->
                  <div class="pcr-ip-split-before" style="clip-path: inset(0 calc(100% - {splitX}px) 0 0);">
                    <div class="pcr-ip-stage" style="transform: translate({panX}px, {panY}px) scale({zoom});">
                      <img src={sourceUrl} alt="" draggable="false" width={width} height={height} />
                    </div>
                  </div>
                  <div class="pcr-ip-split-label before">Before</div>
                  <div class="pcr-ip-split-label after">After</div>
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="pcr-ip-split-divider" style="left: {splitX}px;"
                    onpointerdown={onSplitDown} onpointermove={onSplitMove}
                    onpointerup={onSplitUp} onpointercancel={onSplitUp}>
                    <div class="pcr-ip-split-knob">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9.5 8 5.5 12 9.5 16"/><polyline points="14.5 8 18.5 12 14.5 16"/>
                      </svg>
                    </div>
                  </div>
                {/if}
              {:else}
                <div class="pcr-ip-center">
                  <div class="pcr-ip-waiting">{running ? "Waiting for the sampler…" : "No output yet — paint a mask and Apply."}</div>
                </div>
              {/if}
              {#if running}
                <div class="pcr-ip-progress">
                  <div class="pcr-ip-bar">
                    <div class="pcr-ip-bar-fill" class:indeterminate={progressPercent == null}
                      style={progressPercent != null ? `width: ${progressPercent}%` : ""}></div>
                  </div>
                  {#if progressPercent != null}
                    <span class="pcr-ip-bar-label">step {progress.value}/{progress.max}</span>
                  {/if}
                </div>
              {/if}
            {/if}
          </div>
        </div>
        <div class="pcr-ip-right">
          {#if savedSetup && !running}
            <button class="pcr-ip-restore-chip" onclick={applySavedSetup}
              title="Re-apply the engine / reference / dials from your last inpaint of this image">↩ Restore last setup</button>
          {/if}
          {#if caps?.engineModels?.length}
            <div class="pcr-mcard">
            <div class="pcr-mcard-title">Engine</div>
            <SearchableSelect
              id="pcr-ip-engine"
              value={engineSel}
              groups={engineSelectGroups}
              popupKey="inpaint-engine"
              disabled={installing || running}
              onpick={(v) => pickEngine(v)}
            />
            {#if engineKind === "sdxl"}
              <div class="pcr-ip-hint">renders the painted region with this checkpoint — no render metadata needed, and PuLID / Style Reference work on any source</div>
            {:else if engineKind === "flux1"}
              <div class="pcr-ip-hint">re-renders the painted region with this FLUX.1 model at the denoise below — describe the content, strong on faces and eyes</div>
            {:else if engineKind === "krea2"}
              <div class="pcr-ip-hint">re-renders the painted region with this Krea 2 model at the denoise below — describe the content, sharp detail and clean structure</div>
            {:else if engineKind === "qwen"}
              <div class="pcr-ip-hint">follows your instruction inside the mask only — unmasked pixels stay untouched; the region renders at full model resolution</div>
            {/if}
            {#if realismAvailable}
              <label class="pcr-ip-hint" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:6px;">
                <input type="checkbox" bind:checked={realism} />
                Realism — abliterated encoder + realism/bypass LoRAs (NSFW-capable)
              </label>
            {/if}
            </div>
          {/if}
          {#if caps?.conditions && engineKind !== "qwen" && engineKind !== "flux1" && engineKind !== "krea2"}
            <!-- conditions patch an SDXL checkpoint UNET — the qwen/flux1/krea2
                 engines have no splice point, so the whole block disappears
                 rather than offering dead options -->
            <div class="pcr-mcard">
            <div class="pcr-mcard-title">Condition</div>
            <select id="pcr-ip-cond" class="pcr-ip-select" value={condition}
              onchange={(e) => pickCondition(e.currentTarget.value)} disabled={installing || running}>
              <option value="none">Inpaint</option>
              <option value="pulid" disabled={!conditionOk("pulid")} title={conditionOk("pulid") ? "" : caps.conditions.pulid?.reason || ""}>Inpaint + PuLID</option>
              <option value="ipadapter" disabled={!conditionOk("ipadapter")} title={conditionOk("ipadapter") ? "" : caps.conditions.ipadapter?.reason || ""}>Inpaint + Style Reference</option>
            </select>
            {#if installing}
              <div class="pcr-ip-hint">Installing pack…</div>
            {:else if needsReference}
              <div class="pcr-ip-ref">
                <button class="pcr-ip-tool-btn" onclick={() => refInputEl?.click()}>Choose image</button>
                {#if refThumbUrl}
                  <img class="pcr-ip-ref-thumb" src={refThumbUrl} alt="reference" />
                {:else}
                  <img class="pcr-ip-ref-thumb" src={sourceUrl} alt="this image" />
                  <span class="pcr-ip-hint">this image (default)</span>
                {/if}
                <input type="file" accept="image/*" bind:this={refInputEl} onchange={chooseReference} style="display:none" />
              </div>
              <div class="pcr-ip-denoise">
                <span class="pcr-ip-label">Strength</span>
                <SettingsSlider min={0} max={1.5} step={0.05} value={conditionWeight}
                  savedValue={DEFAULT_WEIGHT[condition] ?? 0.6} onChange={(v) => { conditionWeight = v; }} />
              </div>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="pcr-ip-adv-head" onclick={() => { conditionAdvancedOpen = !conditionAdvancedOpen; }}>
                {conditionAdvancedOpen ? "▾" : "▸"} Advanced
              </div>
              {#if conditionAdvancedOpen}
                {#if condition === "ipadapter"}
                  <label class="pcr-ip-label" for="pcr-ip-wtype">Weight type</label>
                  <select id="pcr-ip-wtype" class="pcr-ip-select" bind:value={ipaWeightType}>
                    {#each IPA_WEIGHT_TYPES as wt}
                      <option value={wt}>{wt}</option>
                    {/each}
                  </select>
                  <div class="pcr-ip-denoise">
                    <span class="pcr-ip-label">Start</span>
                    <SettingsSlider min={0} max={1} step={0.01} value={ipaStartAt}
                      savedValue={0} onChange={(v) => { ipaStartAt = v; }} />
                  </div>
                  <div class="pcr-ip-denoise">
                    <span class="pcr-ip-label">End</span>
                    <SettingsSlider min={0} max={1} step={0.01} value={ipaEndAt}
                      savedValue={0.7} onChange={(v) => { ipaEndAt = v; }} />
                  </div>
                {:else}
                  <div class="pcr-ip-denoise">
                    <span class="pcr-ip-label">Fidelity</span>
                    <SettingsSlider min={0} max={10} step={1} value={pulidFidelity}
                      savedValue={4} onChange={(v) => { pulidFidelity = v; }} />
                  </div>
                  <div class="pcr-ip-denoise">
                    <span class="pcr-ip-label">Start</span>
                    <SettingsSlider min={0} max={1} step={0.01} value={pulidStartAt}
                      savedValue={0} onChange={(v) => { pulidStartAt = v; }} />
                  </div>
                  <div class="pcr-ip-denoise">
                    <span class="pcr-ip-label">End</span>
                    <SettingsSlider min={0} max={1} step={0.01} value={pulidEndAt}
                      savedValue={1} onChange={(v) => { pulidEndAt = v; }} />
                  </div>
                {/if}
              {/if}
            {/if}
            </div>
          {/if}
          {#if showModeRows}
            <div class="pcr-mcard">
            <div class="pcr-mcard-title">Mode</div>
            <select class="pcr-ip-select" data-mode-select value={mode}
              onchange={(e) => pickModeKey(e.currentTarget.value)}>
              {#each MODE_ROWS as row}
                <option value={row.key} disabled={!modeOk(row)} title={modeReason(row)}>{row.label}</option>
              {/each}
            </select>
            <div class="pcr-ip-hint">{modeOk(currentModeRow) ? currentModeRow.desc : modeReason(currentModeRow)}</div>
            </div>
          {/if}
          <div class="pcr-mcard">
          <div class="pcr-mcard-title">{engineKind === "qwen" ? "Instruction" : "Prompt"}</div>
          {#if regionPrompts.length && engineKind !== "qwen" && !movedContent && (!showModeRows || !isRegionalMode)}
            <!-- chips = quick single-figure loader (basic/depth modes); regional
                 modes resolve figures by mask so they need no chips -->
            {#if forcedPrefill && forcedPrefillLabel && !showModeRows}
              <span class="pcr-ip-region-auto">🧍 auto-loaded {forcedPrefillLabel}'s prompt — switch below or edit</span>
            {/if}
            <div class="pcr-ip-regionrow">
              {#each regionPrompts.filter((r) => r.text) as r (r.name)}
                <button class="pcr-ip-region-chip" class:active={r.name === forcedPrefillLabel}
                  onclick={() => applyRegionPrompt(r)}
                  title={r.text.slice(0, 400)}>🧍 {r.name}</button>
              {/each}
            </div>
          {/if}
          {#key promptSeedKey + ":" + promptRestoreNonce}
            {#if mountPromptEditor}
              <div class="pcr-ip-prompt pcr-ip-prompt-editor" use:promptEditor></div>
            {:else}
              <textarea
                class="pcr-ip-prompt"
                bind:value={prompt}
                spellcheck="false"
                placeholder={"what should appear in the painted region\n\nNegative Prompt:\noptional"}
              ></textarea>
            {/if}
          {/key}
          {#if referencePrompt && engineKind !== "qwen"}
            <!-- always shown (matches the upscale modal): the ORIGINAL full
                 source for reference, even after you edit the prompt above. -->
            <span class="pcr-ip-label">Workflow prompt (reference)</span>
            <textarea class="pcr-ip-refprompt" bind:this={refEl} readonly spellcheck="false">{referencePrompt}</textarea>
          {/if}
          </div>
          <div class="pcr-mcard">
          <div class="pcr-mcard-title">Settings</div>
          {#if engineKind !== "qwen"}
            <!-- qwen has no denoise knob: 1.0 is structural — the noise mask
                 does the confining, partial denoise just blends a shifted
                 re-render -->
            <div class="pcr-ip-denoise">
              <span class="pcr-ip-label">Denoise</span>
              <SettingsSlider min={0.05} max={1} step={0.01} value={denoise}
                savedValue={caps?.defaultDenoise ?? 0.5} onChange={(v) => { denoise = v; }} />
            </div>
          {/if}
          {#if caps?.samplerOptions?.length}
            <div class="pcr-ip-combos">
              <div class="pcr-ip-combo">
                <label class="pcr-ip-label" for="pcr-ip-sampler">Sampler</label>
                <select id="pcr-ip-sampler" class="pcr-ip-select" class:at-rec={sampler === recSampler} bind:value={sampler}>
                  {#each caps.samplerOptions as opt}
                    <option value={opt} style:color={opt === recSampler ? "#5ed357" : engineKind === "source" && caps.samplerAlternates?.includes(opt) ? "#5dcaff" : "#999"}>
                      {opt}{opt === recSampler ? "  ●" : ""}
                    </option>
                  {/each}
                </select>
              </div>
              <div class="pcr-ip-combo">
                <label class="pcr-ip-label" for="pcr-ip-scheduler">Scheduler</label>
                <select id="pcr-ip-scheduler" class="pcr-ip-select" class:at-rec={scheduler === recScheduler} bind:value={scheduler}>
                  {#each caps.schedulerOptions as opt}
                    <option value={opt} style:color={opt === recScheduler ? "#5ed357" : engineKind === "source" && caps.schedulerAlternates?.includes(opt) ? "#5dcaff" : "#999"}>
                      {opt}{opt === recScheduler ? "  ●" : ""}
                    </option>
                  {/each}
                </select>
              </div>
            </div>
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="pcr-ip-adv-head" onclick={() => { maskAdvancedOpen = !maskAdvancedOpen; }}>
            {maskAdvancedOpen ? "▾" : "▸"} Advanced
          </div>
          {#if maskAdvancedOpen}
            <div class="pcr-ip-denoise">
              <span class="pcr-ip-label">Grow</span>
              <SettingsSlider min={0} max={64} step={1} value={grow}
                savedValue={0} onChange={(v) => { grow = v; }} />
            </div>
            <div class="pcr-ip-denoise">
              <span class="pcr-ip-label">Feather</span>
              <SettingsSlider min={0} max={128} step={1} value={feather}
                savedValue={24} onChange={(v) => { feather = v; }} />
            </div>
            <div class="pcr-ip-denoise">
              <span class="pcr-ip-label">Steps</span>
              <SettingsSlider min={0} max={60} step={1} value={steps}
                savedValue={recSteps} onChange={(v) => { steps = v; }} />
            </div>
            <div class="pcr-ip-denoise">
              <span class="pcr-ip-label">CFG</span>
              <SettingsSlider min={0} max={10} step={0.1} value={cfg}
                savedValue={recCfg} onChange={(v) => { cfg = v; }} />
            </div>
            <div style="opacity:0.55;font-size:11px;padding:2px 0 0 2px">Pre-filled with this engine's recipe (Turbo 8/1.0 · RAW 30/3.5 · SDXL 25/5). On the source model, 0 = inherit the image's own.</div>
          {/if}
          {#if !onUseInEdit}
            <!-- Edit handoffs return the render as a layer — Edit's own Save persists. -->
            <span class="pcr-ip-label">Save to</span>
            <SavePathInput value={savePrefix} onChange={(v) => { savePrefix = v; }} {fetchApi} />
          {/if}
          </div>
        </div>
      </div>
      {#if errorMsg}
        <div class="pcr-ip-error">⚠ {errorMsg}</div>
      {/if}
      <div class="pcr-modal-footer">
        {#if running}
          <button class="pcr-modal-btn pcr-modal-btn-danger" onclick={stopRun}>Stop</button>
        {:else}
          <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={close}>Cancel</button>
          <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={apply}
            disabled={!hasMask || installing}
            title={!hasMask ? "Paint a mask first" : ""}>
            {doneState ? "Re-Apply" : "Apply"}
          </button>
          {#if onUseInEdit}
            <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={() => onUseInEdit(doneState)} disabled={!doneState}>
              Add to Edit
            </button>
          {:else}
            <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={save} disabled={!doneState || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* near-fullscreen, same as the Edit modal — painting surfaces get the
     whole monitor */
  .pcr-ip-modal {
    width: 96vw; height: 94vh;
    min-width: 900px; max-width: 96vw;
    display: flex; flex-direction: column;
  }
  .pcr-ip-body { display: flex; gap: 16px; flex: 1; min-height: 0; }
  .pcr-ip-left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .pcr-ip-right { flex: 0 0 320px; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; padding-right: 4px; }
  .pcr-ip-restore-chip {
    align-self: flex-start; margin-bottom: 10px;
    padding: 5px 11px; font-size: 12px; color: #d8c08a;
    background: rgba(200, 89, 9, 0.12); border: 1px solid rgba(200, 89, 9, 0.5);
    border-radius: 6px; cursor: pointer;
  }
  .pcr-ip-restore-chip:hover { color: #fff; background: rgba(200, 89, 9, 0.25); border-color: #c85909; }
  .pcr-ip-tabs { display: flex; align-items: center; margin-bottom: 8px; }
  /* Segmented control, same pattern as the upscale modal's .pcr-up-seg */
  .pcr-ip-seg {
    display: flex; border: 1px solid #3a3a3a; border-radius: 5px; overflow: hidden;
  }
  .pcr-ip-tab {
    padding: 4px 18px; font-size: 12px; color: #aaa; cursor: pointer;
    background: transparent;
  }
  .pcr-ip-tab + .pcr-ip-tab { border-left: 1px solid #3a3a3a; }
  .pcr-ip-tab:hover:not(.active) { color: #ddd; }
  .pcr-ip-tab.active { background: #c85909; color: #fff; }
  .pcr-ip-tools { display: flex; align-items: center; gap: 8px; margin-left: auto; align-self: center; }
  .pcr-ip-tool { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #888; }
  .pcr-ip-tool input[type="range"] { width: 110px; accent-color: #c85909; }
  /* Mask opacity — left-aligned right after the Mask/Output tabs (the brush
     tools stay pushed to the right by .pcr-ip-tools margin-left:auto). */
  .pcr-ip-opacity { margin-left: 14px; }
  .pcr-ip-tool-btn {
    padding: 3px 10px; font-size: 11.5px; color: #aaa;
    background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; cursor: pointer;
  }
  .pcr-ip-tool-btn:hover { color: #fff; border-color: #555; }
  .pcr-ip-tool-btn.on { color: #fff; border-color: #c85909; background: rgba(200, 89, 9, 0.2); }
  .pcr-ip-tool-btn:disabled { opacity: 0.4; cursor: default; }
  .pcr-ip-tool-btn:disabled:hover { color: #aaa; border-color: #3a3a3a; }
  /* Brush / eraser segmented icon pair — same icon-button look as the Edit modal. */
  .pcr-ip-iconbtns {
    display: flex; gap: 2px; padding: 1px;
    background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 5px;
  }
  .pcr-ip-iconbtn {
    width: 28px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; border-radius: 4px;
    color: #aaa; cursor: pointer;
  }
  .pcr-ip-iconbtn svg {
    width: 16px; height: 16px; fill: none; stroke: currentColor;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
  .pcr-ip-iconbtn:hover:not(.active) { color: #fff; background: #353535; }
  .pcr-ip-iconbtn.active { background: #c85909; color: #fff; }
  .pcr-ip-viewport {
    position: relative; overflow: hidden;
    flex: 1; min-height: 0; background: #141414;
    border: 1px solid #3a3a3a; border-radius: 6px;
    touch-action: none; cursor: crosshair;
  }
  .pcr-ip-viewport.out-mode { cursor: grab; }
  .pcr-ip-viewport.out-mode:active { cursor: grabbing; }
  .pcr-ip-stage { position: absolute; transform-origin: 0 0; }
  .pcr-ip-stage img { display: block; user-select: none; pointer-events: none; }
  .pcr-ip-stage canvas { position: absolute; inset: 0; pointer-events: none; }
  /* Before/after split (Output tab). The wrapper fills the viewport so its
     clip-path inset is screen-space; pointer-events:none lets a pan pass
     through to the viewport — only the divider grabs the pointer. */
  .pcr-ip-split-before { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
  .pcr-ip-split-divider {
    position: absolute; top: 0; bottom: 0;
    width: 18px; margin-left: -9px;   /* wide invisible grab zone, line centered */
    z-index: 7; cursor: ew-resize; touch-action: none;
  }
  .pcr-ip-split-divider::before {
    content: ""; position: absolute; top: 0; bottom: 0; left: 50%;
    width: 2px; margin-left: -1px;
    background: rgba(255, 255, 255, 0.9); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
  }
  .pcr-ip-split-knob {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 30px; height: 30px; border-radius: 50%;
    background: rgba(20, 20, 20, 0.85); border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center; color: #fff;
  }
  .pcr-ip-split-knob svg { width: 18px; height: 18px; }
  .pcr-ip-split-label {
    position: absolute; top: 8px; z-index: 6;
    padding: 2px 7px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
    color: #fff; background: rgba(20, 20, 20, 0.7); border-radius: 4px;
    pointer-events: none;
  }
  .pcr-ip-split-label.before { left: 8px; }
  .pcr-ip-split-label.after { right: 8px; }
  /* Brush-size preview ring — follows the cursor, sized to the live brush.
     Double outline (border + box-shadow) keeps it visible on any image. */
  .pcr-ip-brush-ring {
    position: absolute; z-index: 6;
    border-radius: 50%; transform: translate(-50%, -50%);
    pointer-events: none;
    border: 1.5px solid rgba(255, 80, 80, 0.95);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
  }
  .pcr-ip-brush-ring.eraser {
    border-style: dashed; border-color: rgba(255, 255, 255, 0.95);
  }
  .pcr-ip-center {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
  }
  .pcr-ip-live-preview {
    max-width: 100%; max-height: 100%;
    object-fit: contain;
  }
  .pcr-ip-waiting { font-size: 12.5px; color: #777; }
  .pcr-ip-combos { display: flex; gap: 10px; }
  .pcr-ip-combo { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .pcr-ip-select {
    width: 100%; box-sizing: border-box;
    padding: 5px 8px; font-size: 12px; color: #999;
    background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 5px;
    outline: none; cursor: pointer;
  }
  .pcr-ip-modes { display: flex; flex-direction: column; gap: 4px; margin: 2px 0 6px; }
  .pcr-ip-mode {
    display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px;
    background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 5px; cursor: pointer;
  }
  .pcr-ip-mode:hover:not(.disabled) { border-color: #555; }
  .pcr-ip-mode.selected { border-color: rgba(94, 211, 87, 0.55); background: #1d241c; }
  .pcr-ip-mode.disabled { opacity: 0.45; cursor: not-allowed; }
  .pcr-ip-mode-radio {
    flex: none; width: 14px; height: 14px; margin-top: 1px; border-radius: 50%;
    border: 1px solid #555; display: flex; align-items: center; justify-content: center;
  }
  .pcr-ip-mode.selected .pcr-ip-mode-dot { width: 7px; height: 7px; border-radius: 50%; background: #5ed357; }
  .pcr-ip-mode-label { font-size: 12px; color: #ddd; }
  .pcr-ip-mode.selected .pcr-ip-mode-label { color: #5ed357; }
  .pcr-ip-mode-desc { font-size: 11px; color: #888; margin-top: 1px; }
  .pcr-ip-regionrow { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 6px; }
  .pcr-ip-region-auto { display: block; font-size: 11px; color: #5ed357; margin: 2px 0; }
  .pcr-ip-region-chip {
    padding: 3px 10px; font-size: 11px; color: #bbb;
    background: #242424; border: 1px solid #3a3a3a; border-radius: 11px;
    cursor: pointer; font-family: inherit;
  }
  .pcr-ip-region-chip:hover { color: #fff; border-color: #c85909; }
  .pcr-ip-region-chip.active { color: #5ed357; border-color: rgba(94, 211, 87, 0.45); }
  /* matches the upscale modal's at-recommended green */
  .pcr-ip-select.at-rec { color: #5ed357; border-color: rgba(94, 211, 87, 0.45); }
  .pcr-ip-progress {
    position: absolute; left: 16px; right: 16px; bottom: 12px;
    display: flex; align-items: center; gap: 10px;
  }
  .pcr-ip-bar {
    flex: 1; height: 6px; border-radius: 3px;
    background: rgba(0, 0, 0, 0.55); border: 1px solid #3a3a3a; overflow: hidden;
  }
  .pcr-ip-bar-fill { height: 100%; background: #c85909; transition: width 0.2s ease; }
  .pcr-ip-bar-fill.indeterminate { width: 35%; animation: pcr-ip-slide 1.2s ease-in-out infinite alternate; }
  @keyframes pcr-ip-slide { from { margin-left: 0; } to { margin-left: 65%; } }
  .pcr-ip-bar-label { font-size: 10.5px; color: #bbb; }
  .pcr-ip-label { font-size: 11px; color: #888; margin-top: 6px; }
  .pcr-ip-adv-head {
    margin-top: 8px; font-size: 11px; color: #888;
    cursor: pointer; user-select: none;
  }
  .pcr-ip-adv-head:hover { color: #ccc; }
  .pcr-ip-ref { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .pcr-ip-ref-thumb {
    width: 40px; height: 40px; object-fit: cover;
    border: 1px solid #3a3a3a; border-radius: 4px; background: #141414;
  }
  .pcr-ip-hint { font-size: 11px; color: #777; }
  /* Fixed heights now that each lives inside a card (the old flex-grow filled
     the whole right panel; inside a card it can't, so the panel scrolls). */
  .pcr-ip-prompt {
    min-height: 180px; resize: vertical;
    padding: 8px 10px; font-size: 12.5px; line-height: 1.45; color: #ddd;
    background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 5px;
    outline: none; font-family: inherit;
  }
  .pcr-ip-prompt:focus { border-color: #c85909; }
  /* CM6 editor host — clear the textarea padding/resize (CM scrolls itself)
     and let the editor fill the box; promptTheme paints its own surface. */
  .pcr-ip-prompt-editor {
    height: 200px; padding: 0; resize: none; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .pcr-ip-prompt-editor:focus-within { border-color: #c85909; }
  .pcr-ip-prompt-editor :global(.cm-editor) { flex: 1; min-height: 0; height: 100%; }
  .pcr-ip-prompt-editor :global(.cm-scroller) { overflow: auto; }
  /* Read-only mirror of the source workflow's prompt — reference while editing. */
  .pcr-ip-refprompt {
    height: 110px; resize: vertical;
    padding: 7px 10px; font-size: 11.5px; line-height: 1.4; color: #9a9a9a;
    background: #161616; border: 1px solid #313131; border-radius: 5px;
    outline: none; font-family: inherit; cursor: text; user-select: text;
  }
  .pcr-ip-denoise { display: flex; align-items: center; gap: 10px; }
  .pcr-ip-denoise .pcr-ip-label { flex: none; width: 52px; margin-top: 0; }
  .pcr-modal-btn:disabled { opacity: 0.45; cursor: default; }
  .pcr-ip-error {
    margin: 0 2px 2px; padding: 7px 12px;
    font-size: 12px; color: #ff8a80; line-height: 1.4;
    background: rgba(229, 57, 53, 0.12); border: 1px solid rgba(229, 57, 53, 0.4);
    border-radius: 5px; word-break: break-word;
  }
</style>
