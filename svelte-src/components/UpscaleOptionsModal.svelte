<script>
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
    caps = null,
    fetchApi = null,
    filename = "",
    width = 0,
    height = 0,
    previewUrl = "",
    progress = null,
    onConfirm,
    onCancel,
    onCancelRun = null,
    onViewResult = null,
    onUseInEdit = null,  // (doneState) => void — hand the render back to Edit as a layer
    elevated = false,    // raise z-index above the Edit modal
    docWidth = 0,        // Edit handoff: full document dims, for the grow-canvas choice
    docHeight = 0,
    mountPromptEditor = null, // (container, initialValue, onChange) => Promise<EditorView>
    imageKey = "",       // stable id of the image (per-image session memory)
    onInstallPack = null, // (injectable) => Promise<installed> — offer-to-install a character-lock condition
  } = $props();

  const PACK_FOR = { ipadapter: "StyleReference", pulid: "PuLID" };
  const isCondInstalled = (key) => !!caps?.conditions?.[key]?.ok;

  let mode = $state("prompt");
  let depthSource = $state("pose");
  let savePrefix = $state("");
  let upscaleBy = $state(2);
  let canvasMode = $state("grow"); // Edit handoff: grow the canvas vs squeeze the render back
  let ultrasharpUnder = $state(false); // Edit keep-path: pair the AI layer with a plain-ESRGAN layer beneath
  let condition = $state("none");  // identity/style lock for the re-detail pass (reference = the image itself)
  let prompt = $state("");         // mirrors the editor; sent only when edited away from the prefill
  let refEl = null;                // the read-only reference textarea
  let denoise = $state(0.3);
  let sampler = $state("");
  let scheduler = $state("");
  let engineSel = $state("source");  // "source" | "plain" | engine-model hash
  let plainEngine = $state("ultrasharp"); // Edit handoff: engine of the plain side passes (under-layer / grow Background)
  // SeedVR2 installed = the user already decided they can afford its cost
  // (user spec) — it's the plain-pass default whenever available; the
  // per-model memory below is the override channel.
  let recommendedPlainEngine = $derived(caps?.seedvr2Available ? "seedvr2" : "ultrasharp");
  // Restore is a SOURCE-level decision (repair degradation before the climb),
  // independent of which engine re-details — it survives engine switches.
  let climbStage = $state("ultrasharp"); // "ultrasharp" = no restore | "seedvr2"
  let climbModel = $state("");           // which installed ESRGAN model climbs to target
  let preserveDefocus = $state(true); // flux2 refine: soft-region composite keeps bokeh un-textured
  let advanced = $state({});
  let advancedOpen = $state(false);
  let confirmBtn;

  // Engine picker: which model re-details. "source" = the image's own
  // workflow (all classic behavior); a picked sdxl/flux1/qwen model builds a
  // standalone engine graph; "ultrasharp"/"seedvr2" = plain pass.
  let engineEntry = $derived(caps?.engineModels?.find((m) => m.hash === engineSel) || null);
  let engineKind = $derived(engineEntry
    ? (engineEntry.architecture === "qwen_edit" ? "qwen"
      : engineEntry.architecture === "zimage" ? "zimage"
      : engineEntry.architecture === "krea2" ? "krea2"
      : engineEntry.architecture === "flux" ? "flux1" : "sdxl")
    : (engineSel === "source" ? "source" : "plain"));
  let sourceGraftable = $derived(engineKind === "source" && !!caps?.graftable);
  // Tile engines share the USDU recipe surface (denoise/climb/tile knobs);
  // qwen is the whole-frame re-render with its own reduced surface.
  let tileEngine = $derived(engineKind === "sdxl" || engineKind === "flux1" || engineKind === "zimage" || engineKind === "krea2");
  let engineGroups = $derived({
    sdxl: (caps?.engineModels || []).filter((m) => m.architecture === "sdxl"),
    flux1: (caps?.engineModels || []).filter((m) => m.architecture === "flux"),
    zimage: (caps?.engineModels || []).filter((m) => m.architecture === "zimage"),
    krea2: (caps?.engineModels || []).filter((m) => m.architecture === "krea2"),
    qwen: (caps?.engineModels || []).filter((m) => m.architecture === "qwen_edit"),
  });
  // Degenerate picker (no models, nothing to choose) stays hidden.
  let engineChoices = $derived((caps?.graftable ? 1 : 0) + (caps?.engineModels?.length || 0) + 1);
  // SearchableSelect feed — same rows/groups the native <select> carried.
  let engineSelectGroups = $derived([
    ...(caps?.graftable
      ? [{ label: "", options: [{ value: "source", label: "Source model — this image's own workflow (default)" }] }]
      : []),
    ...(engineGroups.sdxl.length
      ? [{ label: "SDXL — tiled re-detail", options: engineGroups.sdxl.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    ...(engineGroups.flux1.length
      ? [{ label: "FLUX.1 — tiled re-detail", options: engineGroups.flux1.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    ...(engineGroups.zimage.length
      ? [{ label: "Z-Image — tiled re-detail", options: engineGroups.zimage.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    ...(engineGroups.krea2.length
      ? [{ label: "Krea 2 — tiled re-detail", options: engineGroups.krea2.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    ...(engineGroups.qwen.length
      ? [{ label: "Qwen Edit — instruction enhance", options: engineGroups.qwen.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    { label: "Plain upscale", options: [{ value: "plain", label: "Model climb only — no re-detail pass" }] },
  ]);
  let recSampler = $derived(engineKind === "sdxl" ? "dpmpp_2m" : engineKind === "zimage" ? "res_multistep" : engineKind === "krea2" ? "euler" : engineKind === "flux1" || engineKind === "qwen" ? "euler" : caps?.recommendedSampler);
  let recScheduler = $derived(engineKind === "sdxl" ? "karras" : engineKind === "zimage" ? "beta" : engineKind === "flux1" || engineKind === "qwen" || engineKind === "krea2" ? "simple" : caps?.recommendedScheduler);
  let advDefaults = $derived(engineEntry ? (engineEntry.defaults?.advanced || {}) : (caps?.advancedDefaults || {}));
  let denoiseMax = $derived(tileEngine
    ? (engineEntry?.defaults?.denoiseMax || 0.4)
    : (caps?.denoiseMax || 0.7));
  let denoiseDefault = $derived(tileEngine
    ? (engineEntry?.defaults?.denoise ?? (engineKind === "flux1" ? 0.2 : engineKind === "krea2" ? 0.45 : 0.15))
    : caps?.defaultDenoise);

  // Re-default per open: each image's workflow supports different modes.
  // Focusing the confirm button routes Enter/Escape to this modal's handler.
  // The body is untracked: it re-runs on open/caps ONLY. It both writes and
  // (via prefillFor → mode) reads modal state — tracked, every mode-row click
  // would re-trigger it and snap the whole modal back to defaults.
  $effect(() => {
    if (open && caps) untrack(() => {
      mode = caps.defaultMode || "prompt";
      depthSource = caps.defaultDepthSource || "pose";
      savePrefix = caps.defaultSavePrefix || "upscale/upscale";
      upscaleBy = caps.defaultUpscaleBy || 2;
      denoise = caps.defaultDenoise ?? 0.3;
      // Defaults inherit the image's own sampler/scheduler; the green marker
      // stays on the recommendation so a deviation is visible at a glance.
      sampler = caps.defaultSampler || caps.recommendedSampler || "";
      scheduler = caps.defaultScheduler || caps.recommendedScheduler || "";
      canvasMode = "grow";
      // Whole-image squeezes benefit most from the UltraSharp safety net
      // (lots of surface for tile drift); tiny regions rarely need it. The
      // user's last explicit choice wins, remembered per context.
      try {
        const saved = localStorage.getItem(ultrasharpStorageKey());
        ultrasharpUnder = saved == null ? wholeImageRegion : saved === "1";
      } catch { ultrasharpUnder = wholeImageRegion; }
      // Edit region handoffs default to the style lock (crops drift identity
      // at re-detail denoise); viewer upscales keep their classic behavior.
      condition = onUseInEdit && caps.conditions?.ipadapter?.ok ? "ipadapter" : "none";
      // Every open defaults back to the classic engine for the image: source
      // graft when graftable, plain UltraSharp otherwise (user spec). Memory
      // resets BEFORE the seed so prefillFor can't echo a stale prompt; the
      // seed itself is mode-aware (a regional defaultMode opens on $blocks).
      memoryPrompt = null;
      // A Krea 2 RAW *source* (image rendered with the undistilled base) upscales
      // cleanest through the RAW tile engine, so default to it. Scoped to a RAW
      // source ONLY: a Turbo (or any other) source keeps its own model as the
      // default engine — preserving "default engine = the image's own model" —
      // with RAW still one pick away in the dropdown. pickEngine applies RAW's
      // tile-tuned denoise/sampler below.
      const rawEngine = caps.sourceModelInfo?.family === "krea2_raw"
        ? (caps.engineModels || []).find((m) => m.architecture === "krea2"
            && /raw/i.test(m.filename || "") && !/turbo/i.test(m.filename || ""))
        : null;
      const rawHash = rawEngine?.hash || null;
      engineSel = caps.graftable ? "source" : "plain";
      prompt = prefillFor(caps.graftable ? "source" : "plain");
      // Plain pass defaults to SeedVR2 whenever it's installed (installed =
      // the user accepted its cost); Restore keeps the per-image
      // recommendation (degraded source → SeedVR2 pre-selected, clean
      // render → None). Memory still wins on both.
      plainEngine = caps.seedvr2Available ? "seedvr2" : "ultrasharp";
      climbStage = caps.recommendedRestore === "seedvr2" ? "seedvr2" : "ultrasharp";
      climbModel = caps.recommendedUpscaleModel || "";
      preserveDefocus = true;
      advanced = {};
      advancedOpen = false;
      // Model-scope memory next: the last plain pass + (source) denoise the
      // user APPLIED for this checkpoint — dials that track the model, not
      // the image. The per-image record below still overrides.
      const modelKey = caps.sourceModelInfo?.hash || "";
      const modelMem = modelKey ? recallModalMemory("upscale-model", modelKey) : null;
      if (modelMem?.plainEngine === "ultrasharp"
        || (modelMem?.plainEngine === "seedvr2" && caps.seedvr2Available)) {
        plainEngine = modelMem.plainEngine;
      }
      if (typeof modelMem?.denoise === "number") denoise = modelMem.denoise;
      // …then this image's session memory wins, when its engine still exists
      // (last APPLIED engine/prompt/dials — iterating shouldn't re-type).
      // Old records stored the plain engines as "ultrasharp"/"seedvr2";
      // they map onto the consolidated "plain" + Restore split.
      const mem = recallModalMemory("upscale", imageKey);
      const memEngine = mem?.engine === "ultrasharp" || mem?.engine === "seedvr2" ? "plain" : mem?.engine;
      const memEngineValid = memEngine === "source" ? !!caps.graftable
        : memEngine === "plain" ? true
        : !!memEngine && !!caps.engineModels?.some((m) => m.hash === memEngine);
      if (memEngineValid) {
        memoryPrompt = typeof mem.prompt === "string" && mem.prompt.trim() ? mem.prompt : null;
        pickEngine(memEngine);
        // pickEngine reset denoise to the engine default — the model-scope
        // last-used still beats that for the source graft.
        if (memEngine === "source" && typeof modelMem?.denoise === "number") denoise = modelMem.denoise;
        if (typeof mem.denoise === "number") denoise = mem.denoise;
        if ((mem.climbStage === "seedvr2" || mem.engine === "seedvr2") && caps.seedvr2Available) climbStage = "seedvr2";
        if (mem.climbModel && caps.upscaleModelOptions?.includes(mem.climbModel)) climbModel = mem.climbModel;
        if (mem.plainEngine === "ultrasharp" || (mem.plainEngine === "seedvr2" && caps.seedvr2Available)) plainEngine = mem.plainEngine;
      }
      // RAW source only (rawHash is null for every other source): prefer the RAW
      // tile engine over the source graft, which would carry the from-scratch
      // render recipe (52 steps) — wrong for a low-denoise tile pass. FINAL word,
      // so it survives the memory restore above; fires when nothing was explicitly
      // chosen for this image or the remembered choice was "source". An explicit
      // pick (incl. RAW on a Turbo image) is respected. pickEngine sets RAW's dials.
      if (rawHash && (!memEngineValid || memEngine === "source")) pickEngine(rawHash);
      requestAnimationFrame(() => confirmBtn?.focus());
    });
  });

  // One-shot session-memory restore: set at open (when the remembered engine
  // is restorable), consumed by every prefill read until the user manually
  // switches engines — manual switches keep the deterministic re-prefill.
  let memoryPrompt = null;

  // Per-architecture prompt-push policy: tile engines (sdxl/flux1) re-detail
  // with the image's own prompt (user spec), qwen engines carry a fixed
  // enhance instruction; source keeps the classic prefill — except regional
  // mode, which carries the FULL $block source: edits flow into the grafted
  // PromptChain node and recompile server-side, so a stripped prefill would
  // silently drop every region the moment the user touched the text.
  function basePrefillFor(kind) {
    if (kind === "qwen") return caps?.enginePromptDefaults?.qwen || "";
    if (kind === "sdxl" || kind === "flux1" || kind === "zimage" || kind === "krea2") {
      // An edit-model source's prompt is an INSTRUCTION ("make the person in
      // image 1 do a pose…"), not a scene description — pushing it into a
      // tile pass conditions the tiles on the instruction's words. Neutral
      // fallback instead; the source engine keeps it (it IS its conditioning).
      const srcArch = caps?.architecture || caps?.sourceModelInfo?.architecture || "";
      const descriptive = srcArch === "qwen_edit" ? "" : caps?.prefillPrompt;
      return descriptive || caps?.enginePromptDefaults?.sdxlFallback || "";
    }
    if (kind === "source" && mode === "regional" && caps?.graftable) {
      const ref = caps?.referencePrompt || "";
      if (/\$\w+\s*\{/.test(ref)) return ref;
    }
    return caps?.prefillPrompt || "";
  }
  function prefillFor(kind) {
    if (typeof memoryPrompt === "string" && memoryPrompt.trim()) return memoryPrompt;
    return basePrefillFor(kind);
  }

  // Engine switches re-prefill prompt + recipe defaults deterministically
  // (edits are deliberately discarded — each engine's defaults are its own).
  function pickEngine(value) {
    engineSel = value;
    const entry = caps?.engineModels?.find((m) => m.hash === value) || null;
    const kind = entry ? (entry.architecture === "qwen_edit" ? "qwen" : entry.architecture === "zimage" ? "zimage" : entry.architecture === "krea2" ? "krea2" : entry.architecture === "flux" ? "flux1" : "sdxl")
      : (value === "source" ? "source" : "plain");
    advanced = {};
    // Restore/climbModel deliberately survive: they describe the SOURCE and
    // the climb, not the re-detail engine.
    const d = entry?.defaults;
    denoise = d?.denoise ?? caps?.defaultDenoise ?? 0.3;
    sampler = d?.sampler ?? (caps?.defaultSampler || caps?.recommendedSampler || "");
    scheduler = d?.scheduler ?? (caps?.defaultScheduler || caps?.recommendedScheduler || "");
    prompt = prefillFor(kind);
  }

  // Rich prompt editor (tag highlighting + autocomplete), same lifecycle as the
  // inpaint modal's: {#if open} unmounts the container on close, destroy() tears
  // the editor down, every open seeds fresh from the prefill. The {#key
  // engineKind} wrapper remounts it on engine switches — the editor is seeded
  // once, an assignment to `prompt` alone never reaches it.
  // Model identity for the prompt editor's templates/autocomplete: the picked
  // engine model, else the image's own source model. Read live at menu-open
  // time, so an engine switch retargets the remounted editor.
  function editorModelInfo() {
    if (engineEntry) return { hash: engineEntry.hash, architecture: engineEntry.architecture };
    return caps?.sourceModelInfo || null;
  }

  // The {#key} wrapper remounts the editor whenever the seed DOMAIN changes:
  // engine switches, and source-mode regional flips (full $block source vs
  // stripped global are different documents, not different values).
  let promptSeedKey = $derived(engineKind + (engineKind === "source" && mode === "regional" ? ":regional" : ""));

  function promptEditor(node) {
    let disposed = false;
    let view = null;
    (async () => {
      if (!mountPromptEditor) return;
      const v = await mountPromptEditor(node, untrack(() => prefillFor(engineKind)), (text) => { prompt = text; }, editorModelInfo);
      if (disposed) v?.destroy?.();
      else view = v;
    })().catch((e) => console.error("[Upscale] prompt editor mount failed", e));
    return { destroy() { disposed = true; view?.destroy?.(); } };
  }

  // Copy from the reference box ourselves — the same global ComfyUI capture
  // keydown that ate the inpaint reference box's Ctrl+C applies here.
  $effect(() => {
    if (!open) return;
    const onKey = (e) => {
      // Ctrl+Enter = Apply — and NEVER ComfyUI's Queue Prompt (see InpaintModal).
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        confirm("background"); // guards itself: no-op while a run is live
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

  // Advanced: the same knob set the model panel's Upscaler section exposes.
  // `advanced` carries only user-touched fields — untouched ones keep
  // whatever the build/source workflow already has.
  const ADV_SLIDERS = [
    { name: "steps", label: "Steps", min: 1, max: 60, step: 1 },
    { name: "cfg", label: "CFG", min: 1, max: 15, step: 0.1 },
    { name: "tile_width", label: "Tile W", min: 256, max: 2048, step: 64 },
    { name: "tile_height", label: "Tile H", min: 256, max: 2048, step: 64 },
    { name: "mask_blur", label: "Mask blur", min: 0, max: 64, step: 1 },
    { name: "tile_padding", label: "Padding", min: 0, max: 128, step: 8 },
    { name: "seam_fix_denoise", label: "Seam den.", min: 0, max: 1, step: 0.01 },
  ];
  const ADV_COMBOS = [
    { name: "mode_type", label: "Tiling", optionsKey: "modeOptions" },
    { name: "seam_fix_mode", label: "Seam fix", optionsKey: "seamFixOptions" },
  ];
  function advValue(name) {
    return advanced[name] ?? advDefaults?.[name];
  }
  function setAdv(name, value) {
    advanced = { ...advanced, [name]: value };
  }

  // Resolution ticks: same 1K…8K targets the model panel's upscale slider
  // shows. Edit handoffs anchor them to the CANVAS, not the region (user
  // spec: "3K" means the document ends up 3K) — so on an already-3K canvas
  // the 3K tick disappears and scale 1.0 = re-detail the region in place;
  // only 4K+ grows further. Viewer upscales: the image IS the canvas.
  const RES_TARGETS = [
    { pixels: 1024, label: "1K" }, { pixels: 2048, label: "2K" },
    { pixels: 3072, label: "3K" }, { pixels: 4096, label: "4K" },
    { pixels: 5120, label: "5K" }, { pixels: 6144, label: "6K" },
    { pixels: 7168, label: "7K" }, { pixels: 8192, label: "8K" },
  ];
  let scaleSlider = $derived((() => {
    const longest = onUseInEdit && docWidth > 0
      ? Math.max(docWidth, docHeight)
      : Math.max(width || 0, height || 0);
    if (!longest) return { min: 1, max: 8, ticks: null };
    const ticks = RES_TARGETS
      .map((t) => ({ value: Math.round((t.pixels / longest) * 100) / 100, label: t.label }))
      .filter((t) => t.value >= 1 && t.value <= 8);
    const top = ticks.length ? ticks[ticks.length - 1].value : 8;
    return { min: 1, max: Math.min(8, Math.round(top * 1.08 * 100) / 100), ticks: ticks.length ? ticks : null };
  })());

  const MODE_ROWS = [
    { key: "prompt", label: "Prompt only", desc: "Re-detail each tile with the image's prompt." },
    { key: "depth", label: "Prompt + depth", desc: "Adds a depth ControlNet so structure can't drift." },
    { key: "regional", label: "Regional + 3D depth", desc: "Per-figure prompts plus pose depth for multi-character scenes." },
  ];

  const PROGRESS_TEXT = {
    building: "Building the upscale graph…",
    "rendering-pose": "Re-rendering the 3D pose maps…",
    queueing: "Queueing…",
    running: "Upscaling…",
  };

  let targetRes = $derived(
    width && height ? `${Math.round(width * upscaleBy)}×${Math.round(height * upscaleBy)}` : ""
  );
  // Edit handoff: the render outgrows the region's footprint whenever the
  // scale is meaningfully above 1 — that's the only time the grow-vs-squeeze
  // decision exists, so the choice only appears then.
  let needsGrow = $derived(!!onUseInEdit && docWidth > 0 && upscaleBy > 1.02);
  let grownW = $derived(Math.round(docWidth * upscaleBy));
  let grownH = $derived(Math.round(docHeight * upscaleBy));
  // The UltraSharp under-layer applies whenever the render lands back IN the
  // region's footprint (keep / native ≤1×) — on grow, the ESRGAN-enlarged
  // Background already plays that role.
  let wholeImageRegion = $derived(!!onUseInEdit && docWidth > 0 && width * height >= 0.9 * docWidth * docHeight);
  let landsInFootprint = $derived(!!onUseInEdit && (!needsGrow || canvasMode === "keep"));
  function ultrasharpStorageKey() {
    return wholeImageRegion ? "pcr-edit-ultrasharp-under-whole" : "pcr-edit-ultrasharp-under-region";
  }
  function setUltrasharpUnder(v) {
    ultrasharpUnder = v;
    try { localStorage.setItem(ultrasharpStorageKey(), v ? "1" : "0"); } catch { /* private mode */ }
  }
  // Overall progress folds the per-tile sampler bars into one run-wide bar:
  // (completed tiles + current tile's step fraction) / total tiles.
  let progressPercent = $derived((() => {
    if (progress?.phase !== "running") return null;
    if (progress.tile && progress.totalTiles && progress.max) {
      return Math.min(100, Math.round((((progress.tile - 1) + progress.value / progress.max) / progress.totalTiles) * 100));
    }
    if (progress.prep && progress.max) return Math.round((progress.value / progress.max) * 100);
    return null;
  })());
  // Three lines, three jobs: title = what the modal is, status = which STAGE
  // is running, label = the precise counter. No word repeats between them.
  let progressStatus = $derived((() => {
    if (progress?.phase !== "running") return PROGRESS_TEXT[progress?.phase] || "Working…";
    if (progress.tile) return `Re-detailing tiles · ${progressPercent}%`;
    if (progress.prep) return progress.model ? `Enlarging with ${progress.model}…` : "Enlarging image…";
    return "Waiting for the sampler…";
  })());
  function fmtEta(s) {
    if (s == null) return "";
    if (s < 60) return `~${s}s left`;
    return `~${Math.floor(s / 60)}m ${s % 60}s left`;
  }
  let progressLabel = $derived((() => {
    if (progress?.phase !== "running") return "";
    if (progress.tile && progress.totalTiles) {
      const eta = fmtEta(progress.etaSec);
      return `Tile ${progress.tile} / ${progress.totalTiles} · step ${progress.value}/${progress.max}${eta ? ` · ${eta}` : ""}`;
    }
    if (progress.prep && progress.max) return `${progress.value} / ${progress.max}`;
    return "";
  })());

  let currentModeRow = $derived(MODE_ROWS.find((r) => r.key === mode) || MODE_ROWS[0]);
  function pickModeKey(key) { const r = MODE_ROWS.find((x) => x.key === key); if (r) pick(r); }
  function pick(row) {
    if (!caps?.modes?.[row.key]?.ok) return;
    const wasRegional = mode === "regional";
    mode = row.key;
    if (row.key === "depth" && !caps.sources?.[depthSource]?.ok) {
      depthSource = depthSource === "pose" ? "image" : "pose";
    }
    // Crossing the regional boundary swaps what the prompt MEANS (full $block
    // source vs stripped global text) — deterministic re-prefill, same policy
    // as engine switches. prompt/depth flips keep any edits.
    if (wasRegional !== (mode === "regional")) {
      memoryPrompt = null;
      prompt = prefillFor(engineKind);
    }
  }

  // action: "background" (Apply — run it here) or "workflow" (open as a tab).
  async function confirm(action) {
    if (runActive) return; // a run is live; done/error/cancelled can re-run
    // Character-lock picked but its pack isn't installed: offer to install it
    // (mirrors InpaintModal). The install flow restarts the server, so we don't
    // continue this run — the user re-applies once it reloads.
    if (condition !== "none" && !isCondInstalled(condition) && onInstallPack) {
      await onInstallPack(PACK_FOR[condition]);
      return;
    }
    // SeedVR2 restore/plain-pass picked but the pack isn't installed: offer to
    // install it (the only on-demand install path for SeedVR2). Same restart
    // caveat as the character lock.
    if ((climbStage === "seedvr2" || plainEngine === "seedvr2") && !caps?.seedvr2Available && onInstallPack) {
      await onInstallPack("SeedVR2");
      return;
    }
    const base = {
      savePrefix: savePrefix.trim(),
      sampler, scheduler,
      upscaleBy, denoise,
      target: action,
    };
    if (onUseInEdit) {
      base.canvasMode = needsGrow ? canvasMode : "keep"; // ≤1×: render fits the region natively, nothing to grow
      base.ultrasharpUnder = base.canvasMode === "keep" && ultrasharpUnder;
      base.plainEngine = plainEngine;
    }
    base.condition = condition;
    base.engine = engineKind === "source" ? "source"
      // Consolidated plain entry: Restore decides which floor builds.
      : engineKind === "plain" ? (climbStage === "seedvr2" && caps?.seedvr2Available ? "seedvr2" : "ultrasharp")
      : engineKind === "qwen" ? "qwen-edit"
      : engineKind === "zimage" ? "zimage-unet"
      : engineKind === "krea2" ? "krea2-unet"
      : engineKind === "flux1" ? "flux1-unet" : "sdxl-ckpt";
    if (engineEntry) base.engineModel = { hash: engineEntry.hash, filename: engineEntry.filename };
    if (tileEngine && climbStage !== "ultrasharp") base.climbStage = climbStage;
    if (engineKind !== "source" && climbModel) base.climbModel = climbModel;
    if (engineKind === "source" && caps?.architecture === "flux2") base.preserveDefocus = preserveDefocus;
    if (tileEngine || engineKind === "qwen") {
      // Engine graphs have no source conditioning to fall back on — always
      // send the current text (empty → the builder's per-arch constant).
      base.prompt = prompt;
    } else if (prompt.trim() && prompt.trim() !== basePrefillFor(engineKind).trim()) {
      // Untouched prompt → no override: the graft keeps its own conditioning.
      // Compared against the VIRGIN prefill (memory ignored): a restored
      // memory prompt counts as edited, an untouched regional $block seed
      // doesn't — the graft's own source already says exactly that.
      base.prompt = prompt;
    }
    // Tile/engine builds read cfg/steps/tile from options.advanced and fall back
    // to TURBO-shaped constants if absent — so a picked engine's OWN defaults
    // (e.g. RAW's cfg 3.5 / 24 steps) must be sent, not just user overrides, or
    // RAW silently runs on Turbo's 8/1.0. The source graft sets its own node
    // defaults, so it only needs the user's overrides.
    if (engineEntry) base.advanced = { ...advDefaults, ...advanced };
    else if (Object.keys(advanced).length) base.advanced = { ...advanced };
    storeModalMemory("upscale", imageKey, {
      engine: engineKind === "source" ? "source" : engineSel,
      prompt,
      denoise,
      climbStage: engineKind !== "source" ? climbStage : undefined,
      climbModel: engineKind !== "source" ? climbModel : undefined,
      plainEngine: onUseInEdit ? plainEngine : undefined,
    });
    // Durable, restart-surviving twin of the above, in the per-image sidecar.
    // Fire-and-forget — a failed save must never block Apply. (Prompt restore
    // is deferred: it needs the {#key} editor remount, not a bare assignment.)
    saveModalSetup(fetchApi, imageKey, "upscale", {
      mode, depthSource, upscaleBy, denoise, sampler, scheduler,
      condition, preserveDefocus, engine: engineSel, climbStage, climbModel,
      prompt, advanced: { ...advanced },
    }, { w: docWidth || width, h: docHeight || height });
    // Model-scope memory: dials that track the CHECKPOINT, not the image —
    // the last plain pass and (source-graft) denoise applied for this model
    // become its defaults everywhere (user spec). Merged, not replaced, so
    // an engine run doesn't wipe the model's remembered denoise.
    const memModelKey = caps?.sourceModelInfo?.hash || "";
    if (memModelKey) {
      storeModalMemory("upscale-model", memModelKey, {
        ...(recallModalMemory("upscale-model", memModelKey) || {}),
        ...(onUseInEdit ? { plainEngine } : {}),
        ...(engineKind === "source" ? { denoise } : {}),
      });
    }
    onConfirm?.(sourceGraftable ? { mode, depthSource, ...base } : base);
  }

  // While the run is live the modal is NOT dismissable — the only way out is
  // Cancel, which actually stops the op. Done/error states unlock it again.
  let runActive = $derived(
    !!progress && progress.phase !== "done" && progress.phase !== "error" && progress.phase !== "cancelled"
  );

  // ── saved-setup restore (server sidecar, keyed by imageKey == displayedHash) ──
  // Loaded async on open into savedSetup; applied ONLY when the user clicks the
  // chip — so it never runs inside the open reset and can't fight the memory /
  // regional gating there.
  let savedSetup = $state(null);
  let promptRestoreNonce = $state(0);  // bump to force the prompt editor to reseed
  $effect(() => {
    if (!open || !fetchApi || !imageKey) { savedSetup = null; return; }
    let cancelled = false;
    loadModalSetup(fetchApi, imageKey).then((doc) => {
      if (cancelled || !doc) return;
      const up = doc.kinds?.upscale;
      // Guard on the DOCUMENT dims (stable per hash), not the transient region
      // crop — an Edit-region upscale passes region-sized width/height but keys
      // by the whole-doc hash, so a region guard would hide the chip.
      const keyW = docWidth || width, keyH = docHeight || height;
      const dimsOk = !doc.dims || (doc.dims.w === keyW && doc.dims.h === keyH);
      savedSetup = up && dimsOk ? up : null;
    });
    return () => { cancelled = true; };
  });

  function applySavedSetup() {
    const s = savedSetup;
    if (!s) return;
    if (typeof s.mode === "string" && caps?.modes?.[s.mode]?.ok) mode = s.mode;
    if (typeof s.depthSource === "string" && caps?.sources?.[s.depthSource]?.ok) depthSource = s.depthSource;
    if (typeof s.upscaleBy === "number") upscaleBy = Math.max(scaleSlider.min, Math.min(scaleSlider.max, s.upscaleBy));
    if (typeof s.condition === "string") condition = s.condition;
    if (typeof s.preserveDefocus === "boolean") preserveDefocus = s.preserveDefocus;
    if (s.advanced && typeof s.advanced === "object") advanced = { ...s.advanced };
    // Switching engine resets denoise/sampler/scheduler to its defaults, so
    // validate + pick the engine FIRST, then lay the saved dials over the top
    // (same ordering as the open-effect's memory restore).
    if (typeof s.engine === "string") {
      const ok = s.engine === "source" ? !!caps?.graftable
        : s.engine === "plain" ? true
        : !!caps?.engineModels?.some((m) => m.hash === s.engine);
      if (ok) { memoryPrompt = null; pickEngine(s.engine); }
    }
    if (typeof s.denoise === "number") denoise = s.denoise;
    if (typeof s.sampler === "string") sampler = s.sampler;
    if (typeof s.scheduler === "string") scheduler = s.scheduler;
    if (s.climbStage === "ultrasharp") climbStage = "ultrasharp";
    else if (s.climbStage === "seedvr2" && caps?.seedvr2Available) climbStage = "seedvr2";
    if (typeof s.climbModel === "string" && caps?.upscaleModelOptions?.includes(s.climbModel)) climbModel = s.climbModel;
    // Prompt — reseed the rich editor via the remount nonce; prefillFor() reads
    // memoryPrompt, so set it before bumping (after pickEngine cleared it).
    if (typeof s.prompt === "string" && s.prompt.trim()) {
      memoryPrompt = s.prompt;
      prompt = s.prompt;
      promptRestoreNonce++;
    }
    savedSetup = null;  // dismiss the chip once applied
  }

  // ── preview pan/zoom ──────────────────────────────────────────────
  // The source (before a run) and the finished result are stable images you
  // inspect with drag-to-pan + wheel-to-zoom. The per-tile sampler preview
  // during a run is a moving crop, so it stays centered (not pan/zoom), the
  // same split the inpaint modal makes.
  let liveTile = $derived(runActive && progress?.previewUrl ? progress.previewUrl : null);
  let inspectSrc = $derived(progress?.resultUrl ? progress.resultUrl : (runActive ? null : (previewUrl || null)));
  let stageEl;
  let imgNatW = $state(0), imgNatH = $state(0);
  let zoom = $state(1), panX = $state(0), panY = $state(0);
  let panning = false, panLast = null;

  function fitView() {
    if (!stageEl || !imgNatW || !imgNatH) { zoom = 1; panX = 0; panY = 0; return; }
    const r = stageEl.getBoundingClientRect();
    zoom = Math.min(r.width / imgNatW, r.height / imgNatH, 1) || 1;
    panX = (r.width - imgNatW * zoom) / 2;
    panY = (r.height - imgNatH * zoom) / 2;
  }
  function onPreviewLoad(e) {
    imgNatW = e.currentTarget.naturalWidth || 0;
    imgNatH = e.currentTarget.naturalHeight || 0;
    fitView();
  }
  function onStageDown(e) {
    if (e.button > 2 || !inspectSrc) return;
    // The zoom controls sit over the stage; starting a pan here would capture
    // the pointer and the synthesized click would never reach the button.
    if (e.target.closest?.(".pcr-up-zoomctl")) return;
    panning = true; panLast = { x: e.clientX, y: e.clientY };
    e.preventDefault(); stageEl.setPointerCapture(e.pointerId);
  }
  function onStageMove(e) {
    if (!panning) return;
    panX += e.clientX - panLast.x; panY += e.clientY - panLast.y;
    panLast = { x: e.clientX, y: e.clientY };
  }
  function onStageUp(e) {
    if (!panning) return;
    panning = false; panLast = null;
    try { stageEl.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }
  function onStageWheel(e) {
    if (!inspectSrc || !imgNatW) return;
    e.preventDefault();
    const r = stageEl.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nz = Math.max(0.05, Math.min(12, zoom * f));
    panX = cx - ((cx - panX) / zoom) * nz;
    panY = cy - ((cy - panY) / zoom) * nz;
    zoom = nz;
  }

  // ── before/after compare ──────────────────────────────────────────
  // A screen-space divider wipes the original source (Before, left) over the
  // finished result (After, right). Both layers share the pan/zoom transform
  // so they stay registered; the source is drawn at the result's natural box,
  // so the only visible difference is the upscale's added detail. Available
  // only once there's a result to compare against.
  let compareSplit = $state(false);
  let splitX = $state(0);
  let splitDragging = false;
  let canCompare = $derived(!runActive && !!previewUrl && !!progress?.resultUrl);
  // Drop the wipe the instant there's nothing valid behind it — a re-run
  // starts, or the modal reopens on a fresh image. It re-arms only on a click.
  $effect(() => { if (!canCompare && compareSplit) compareSplit = false; });

  function toggleCompare() {
    if (!canCompare) return;
    compareSplit = !compareSplit;
    if (compareSplit) {
      const r = stageEl?.getBoundingClientRect();
      splitX = r ? r.width / 2 : 0;  // open centered so both halves show
    }
  }
  function onSplitDown(e) {
    e.stopPropagation();   // the stage would otherwise start a pan
    e.preventDefault();
    splitDragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onSplitMove(e) {
    if (!splitDragging) return;
    e.stopPropagation();
    const r = stageEl.getBoundingClientRect();
    splitX = Math.max(0, Math.min(r.width, e.clientX - r.left));
  }
  function onSplitUp(e) {
    splitDragging = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }

  function handleKeydown(e) {
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
    if (e.key === "Enter" && !typing) { e.preventDefault(); e.stopPropagation(); confirm("background"); }
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      if (!runActive) onCancel?.();
    }
  }

</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- No outside-click close: a text-selection drag that releases on the backdrop
       must not nuke the modal. Close via the ✕, Cancel, or Esc. -->
  <div use:portal class="pcr-modal-backdrop" style:z-index={elevated ? 10006 : null} onkeydown={handleKeydown}>
    <div class="pcr-modal pcr-up-modal" role="dialog" aria-modal="true">
      <div class="pcr-modal-header">
        <span class="pcr-modal-title">
          {progress
            ? (runActive ? "Upscaling Image" : progress.phase === "done" ? "Upscale Complete" : progress.phase === "error" ? "Upscale Failed" : "Upscale Cancelled")
            : "Image Upscale"}{filename ? ` — ${filename}` : ""}{width && height ? ` · ${width}×${height}` : ""}
        </span>
        {#if !runActive}
          <button class="pcr-modal-close" onclick={onCancel} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        {/if}
      </div>
      <div class="pcr-modal-body pcr-up-body">
        <div class="pcr-up-left">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="pcr-up-stage" class:zoomable={!!inspectSrc} bind:this={stageEl}
            onpointerdown={onStageDown} onpointermove={onStageMove}
            onpointerup={onStageUp} onpointercancel={onStageUp} onwheel={onStageWheel}
            ondblclick={fitView}
            oncontextmenu={(e) => e.preventDefault()}>
            {#if liveTile}
              <!-- transient per-tile sampler preview: a moving crop, just center it -->
              <img class="pcr-up-live" src={liveTile} alt="" draggable="false" />
            {:else if inspectSrc}
              <div class="pcr-up-zoomwrap" style="transform: translate({panX}px, {panY}px) scale({zoom});">
                <img class="pcr-up-preview" src={inspectSrc} alt="" draggable="false" onload={onPreviewLoad} />
              </div>
              {#if compareSplit && canCompare}
                <!-- Original (Before) clipped to the LEFT of the divider in
                     screen space (calc(100% - splitX) = the right inset). The
                     inner wrap reuses the exact transform so it stays pixel-
                     aligned with the result behind it; sized to the result's
                     natural box, so only the added detail differs. -->
                <div class="pcr-up-split-before" style="clip-path: inset(0 calc(100% - {splitX}px) 0 0);">
                  <div class="pcr-up-zoomwrap" style="transform: translate({panX}px, {panY}px) scale({zoom});">
                    <img class="pcr-up-preview" src={progress?.enlargedUrl || previewUrl} alt="" draggable="false" width={imgNatW} height={imgNatH} />
                  </div>
                </div>
                <div class="pcr-up-split-label before">{progress?.enlargedUrl ? "Enlarged" : "Before"}</div>
                <div class="pcr-up-split-label after">After</div>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="pcr-up-split-divider" style="left: {splitX}px;"
                  onpointerdown={onSplitDown} onpointermove={onSplitMove}
                  onpointerup={onSplitUp} onpointercancel={onSplitUp}>
                  <div class="pcr-up-split-knob">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="9.5 8 5.5 12 9.5 16"/><polyline points="14.5 8 18.5 12 14.5 16"/>
                    </svg>
                  </div>
                </div>
              {/if}
              {#if imgNatW}
                <div class="pcr-up-zoomctl">
                  <span class="pcr-up-zoompct">{Math.round(zoom * 100)}%</span>
                  {#if canCompare}
                    <button class="pcr-up-fit-btn" class:on={compareSplit} onclick={toggleCompare}
                      title="Drag the divider to wipe the original over the result">Compare</button>
                  {/if}
                  <button class="pcr-up-fit-btn" onclick={fitView}>Fit</button>
                </div>
              {/if}
            {/if}
          </div>
          {#if progress}
            <div class="pcr-up-progress">
              {#if progress.phase === "done"}
                <div class="pcr-up-progress-text pcr-up-done">Done{progress.filename ? ` — ${progress.filename}` : ""}</div>
              {:else if progress.phase === "error"}
                <div class="pcr-up-progress-text pcr-up-error">{progress.message || "Failed"}</div>
              {:else}
                <div class="pcr-up-progress-text">{progressStatus}</div>
                <div class="pcr-up-bar">
                  <div
                    class="pcr-up-bar-fill"
                    class:indeterminate={progressPercent == null}
                    style={progressPercent != null ? `width: ${progressPercent}%` : ""}
                  ></div>
                </div>
                {#if progressLabel}
                  <div class="pcr-up-bar-label">{progressLabel}</div>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
        <div class="pcr-up-right" class:running={runActive}>
          {#if savedSetup && !progress}
            <button class="pcr-up-restore-chip" onclick={applySavedSetup}
              title="Re-apply the dials from your last upscale of this image">↩ Restore last setup</button>
          {/if}
          {#if !caps?.graftable && engineKind === "plain" && engineChoices <= 1}
            <p class="pcr-up-floor-msg">
              No re-detail engine is available for this image — a plain model upscale (ESRGAN) will be used.
            </p>
          {/if}
          {#if engineChoices > 1}
            <div class="pcr-mcard">
            <div class="pcr-mcard-title">Engine</div>
            <div class="pcr-up-cond pcr-up-engine-block">
              <SearchableSelect
                id="pcr-up-engine"
                value={engineSel}
                groups={engineSelectGroups}
                popupKey="upscale-engine"
                onpick={(v) => { memoryPrompt = null; pickEngine(v); }}
              />
              {#if tileEngine}
                <span class="pcr-up-cond-hint">
                  {engineKind === "flux1"
                    ? "the climb model below pushes to the target, then this FLUX.1 model re-details every tile with the prompt below — low denoise holds structure without a ControlNet"
                    : engineKind === "zimage"
                    ? "the climb model below pushes to the target, then this Z-Image model re-details every tile with the prompt below — Base holds structure at low denoise; Turbo (distilled) needs ~0.7 or it blotches"
                    : engineKind === "krea2"
                    ? "the climb model below pushes to the target, then this Krea 2 model re-details every tile with the prompt below — distilled turbo re-detail at moderate denoise, no ControlNet"
                    : "the climb model below pushes to the target, then this checkpoint re-details every tile (structure locked by a tile ControlNet) with the prompt below"}
                </span>
              {:else if engineKind === "qwen"}
                <span class="pcr-up-cond-hint">re-renders the whole frame at ~2MP from your instruction — composition can shift slightly; the climb model below pushes to the target size</span>
              {:else if engineKind === "plain"}
                <span class="pcr-up-cond-hint">deterministic enlargement with the climb model below — add a Restore step for degraded sources (webcam, jpeg, blur)</span>
              {/if}
            </div>
            </div>
          {/if}
          {#if caps?.graftable && engineKind === "source"}
            <div class="pcr-mcard">
            <div class="pcr-mcard-title">Mode</div>
            <select class="pcr-up-select" data-mode-select value={mode}
              onchange={(e) => pickModeKey(e.currentTarget.value)}>
              {#each MODE_ROWS as row}
                <option value={row.key} disabled={!caps.modes[row.key]?.ok} title={caps.modes[row.key]?.reason || ""}>{row.label}</option>
              {/each}
            </select>
            <div class="pcr-up-cond-hint">{caps.modes[mode]?.ok ? currentModeRow.desc : (caps.modes[mode]?.reason || currentModeRow.desc)}</div>
            {#if mode === "depth"}
              <div class="pcr-up-sources">
                <span class="pcr-up-sources-label">Depth from</span>
                <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                <div class="pcr-up-seg">
                  <div class="pcr-up-seg-opt" class:active={depthSource === "pose"} class:disabled={!caps.sources.pose.ok}
                    title={caps.sources.pose.ok ? "" : "No 3D pose in this image's workflow"}
                    onclick={() => { if (caps.sources.pose.ok) depthSource = "pose"; }}>3D pose</div>
                  <div class="pcr-up-seg-opt" class:active={depthSource === "image"} class:disabled={!caps.sources.image.ok}
                    onclick={() => { if (caps.sources.image.ok) depthSource = "image"; }}>This image</div>
                </div>
              </div>
            {/if}
            </div>
          {/if}
          {#if sourceGraftable && (caps.conditions?.ipadapter?.ok || caps.conditions?.ipadapter?.installable || caps.conditions?.pulid?.ok || caps.conditions?.pulid?.installable)}
            <div class="pcr-mcard">
            <div class="pcr-mcard-title">Character lock</div>
            <div class="pcr-up-cond">
              <select id="pcr-up-condition" class="pcr-up-select" bind:value={condition}>
                <option value="none">None</option>
                {#if caps.conditions.ipadapter?.ok || caps.conditions.ipadapter?.installable}<option value="ipadapter">Style Reference — lock look to this image{caps.conditions.ipadapter?.ok ? "" : " (installs on apply)"}</option>{/if}
                {#if caps.conditions.pulid?.ok || caps.conditions.pulid?.installable}<option value="pulid">PuLID — lock the face to this image{caps.conditions.pulid?.ok ? "" : " (installs on apply)"}</option>{/if}
              </select>
              <span class="pcr-up-cond-hint">keeps the character from drifting while tiles re-detail — the image itself is the reference</span>
            </div>
            </div>
          {/if}
          {#if (sourceGraftable && caps.prefillPrompt != null) || tileEngine || engineKind === "qwen"}
            <div class="pcr-mcard">
            <div class="pcr-mcard-title">{engineKind === "qwen" ? "Instruction" : "Prompt"}</div>
            <div class="pcr-up-prompt-block">
              <span class="pcr-up-save-label">{engineKind === "qwen" ? "how Qwen Edit should enhance" : "what the tiles re-detail with"}</span>
              {#key promptSeedKey + ":" + promptRestoreNonce}
                {#if mountPromptEditor}
                  <div class="pcr-up-prompt pcr-up-prompt-editor" use:promptEditor></div>
                {:else}
                  <textarea class="pcr-up-prompt" bind:value={prompt} spellcheck="false"></textarea>
                {/if}
              {/key}
              {#if caps.referencePrompt && engineKind !== "qwen"}
                <span class="pcr-up-save-label">Workflow prompt (reference)</span>
                <textarea class="pcr-up-refprompt" bind:this={refEl} readonly spellcheck="false">{caps.referencePrompt}</textarea>
              {/if}
            </div>
            </div>
          {/if}
          <div class="pcr-mcard">
          <div class="pcr-mcard-title">Settings</div>
          {#if sourceGraftable || tileEngine || engineKind === "qwen" || engineKind === "plain"}
            <div class="pcr-up-sliders">
              <div class="pcr-up-slider-row" class:pcr-up-slider-row-ticks={!!scaleSlider.ticks}>
                <span class="pcr-up-slider-label">Scale</span>
                <SettingsSlider
                  min={scaleSlider.min}
                  max={scaleSlider.max}
                  step={0.05}
                  value={upscaleBy}
                  savedValue={caps?.defaultUpscaleBy}
                  ticks={scaleSlider.ticks}
                  onChange={(v) => { upscaleBy = v; }} />
              </div>
              <div class="pcr-up-slider-target">{targetRes ? `→ ${targetRes}` : ""}</div>
              {#if needsGrow}
                <div class="pcr-up-canvas">
                  <div class="pcr-up-canvas-title">This quality is bigger than the region's footprint — how should it land?</div>
                  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                  <div class="pcr-up-mode" class:selected={canvasMode === "grow"} onclick={() => { canvasMode = "grow"; }}>
                    <div class="pcr-up-mode-radio"><div class="pcr-up-mode-dot"></div></div>
                    <div class="pcr-up-mode-text">
                      <div class="pcr-up-mode-label">Grow canvas to {grownW}×{grownH}</div>
                      <div class="pcr-up-mode-desc">The whole document scales up and the region lands pixel-for-pixel — full quality kept. The UltraSharp-enlarged image becomes the new Background, so erasing the upscale layer reveals it.</div>
                    </div>
                  </div>
                  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                  <div class="pcr-up-mode" class:selected={canvasMode === "keep"} onclick={() => { canvasMode = "keep"; }}>
                    <div class="pcr-up-mode-radio"><div class="pcr-up-mode-dot"></div></div>
                    <div class="pcr-up-mode-text">
                      <div class="pcr-up-mode-label">Keep canvas at {docWidth}×{docHeight}</div>
                      <div class="pcr-up-mode-desc">The render is rescaled back into the region — re-detailed, but softer than 1:1.</div>
                    </div>
                  </div>
                </div>
              {/if}
              {#if landsInFootprint}
                <label class="pcr-up-ultrasharp">
                  <input type="checkbox" checked={ultrasharpUnder} onchange={(e) => setUltrasharpUnder(e.currentTarget.checked)} />
                  <span class="pcr-up-ultrasharp-text">
                    Keep a plain UltraSharp layer underneath
                    <span class="pcr-up-ultrasharp-hint">erase the AI layer anywhere to reveal a faithfully sharpened original instead of the soft source</span>
                  </span>
                </label>
              {/if}
              {#if sourceGraftable || tileEngine}
                <!-- qwen has no denoise knob: 1.0 is structural (the
                     conditioning image is the anchor, not the latent). -->
                <div class="pcr-up-slider-row">
                  <span class="pcr-up-slider-label">Denoise</span>
                  <SettingsSlider
                    min={0.05}
                    max={denoiseMax}
                    step={0.01}
                    value={denoise}
                    savedValue={denoiseDefault}
                    onChange={(v) => { denoise = v; }} />
                </div>
              {/if}
            </div>
          {/if}
          {#if onUseInEdit && engineKind !== "plain"}
            <!-- Engine for THIS run's plain passes (under-layer / grow
                 Background) — only relevant when the MAIN engine is an AI
                 re-detail (it produces the layer to sit under / the canvas to
                 grow). Hidden for "Model climb only", where there's no side
                 pass and it just duplicated the Restore selector. It
                 changes the whole rest of the canvas, so it lives with the
                 main dials; green ● follows the per-image Restore signal,
                 and the last APPLIED choice is remembered per model. -->
            <div class="pcr-up-combos">
              <div class="pcr-up-combo">
                <label class="pcr-up-combo-label" for="pcr-up-plainpass">Plain pass — Background / under-layer</label>
                <select id="pcr-up-plainpass" class="pcr-up-select"
                  class:at-rec={plainEngine === recommendedPlainEngine}
                  bind:value={plainEngine}>
                  <option value="ultrasharp" style:color={recommendedPlainEngine === "ultrasharp" ? "#5ed357" : "#999"}>
                    UltraSharp{recommendedPlainEngine === "ultrasharp" ? "  ●" : ""}
                  </option>
                  <option value="seedvr2" style:color={recommendedPlainEngine === "seedvr2" ? "#5ed357" : "#999"}>
                    SeedVR2 + UltraSharp (slow){caps?.seedvr2Available ? (recommendedPlainEngine === "seedvr2" ? "  ●" : "") : " (installs on apply)"}
                  </option>
                </select>
              </div>
            </div>
          {/if}
          {#if engineKind !== "source" && caps?.upscaleModelOptions?.length}
            <!-- Pipeline order: [Restore @ low res] → [climb to target] →
                 [engine re-detail]. Restore describes the SOURCE (green ● is
                 a per-image recommendation: jpeg/small input → SeedVR2);
                 climb model = which installed ESRGAN does the enlargement.
                 Both survive engine switches. Qwen re-renders the frame, so
                 a restore step buys nothing there. -->
            <div class="pcr-up-combos">
              {#if engineKind !== "qwen"}
                <div class="pcr-up-combo">
                  <label class="pcr-up-combo-label" for="pcr-up-restore">Restore</label>
                  <select id="pcr-up-restore" class="pcr-up-select"
                    class:at-rec={(climbStage === "seedvr2" ? "seedvr2" : "none") === (caps.recommendedRestore || "none")}
                    bind:value={climbStage}>
                    <option value="ultrasharp" style:color={(caps.recommendedRestore || "none") === "none" ? "#5ed357" : "#999"}>
                      None{(caps.recommendedRestore || "none") === "none" ? "  ●" : ""}
                    </option>
                    <option value="seedvr2" style:color={caps.recommendedRestore === "seedvr2" ? "#5ed357" : "#999"}>
                      SeedVR2 — repair degraded source{caps?.seedvr2Available ? (caps.recommendedRestore === "seedvr2" ? "  ●" : "") : " (installs on apply)"}
                    </option>
                  </select>
                </div>
              {/if}
              <div class="pcr-up-combo">
                <label class="pcr-up-combo-label" for="pcr-up-climb">Climb model</label>
                <select id="pcr-up-climb" class="pcr-up-select" class:at-rec={climbModel === caps.recommendedUpscaleModel} bind:value={climbModel}>
                  {#each caps.upscaleModelOptions as opt}
                    <option value={opt} style:color={opt === caps.recommendedUpscaleModel ? "#5ed357" : "#999"}>
                      {opt}{opt === caps.recommendedUpscaleModel ? "  ●" : ""}
                    </option>
                  {/each}
                </select>
              </div>
            </div>
          {/if}
          {#if (sourceGraftable || tileEngine || engineKind === "qwen") && caps.samplerOptions?.length}
            <div class="pcr-up-combos">
              <div class="pcr-up-combo">
                <label class="pcr-up-combo-label" for="pcr-up-sampler">Sampler</label>
                <select id="pcr-up-sampler" class="pcr-up-select" class:at-rec={sampler === recSampler} bind:value={sampler}>
                  {#each caps.samplerOptions as opt}
                    <option value={opt} style:color={opt === recSampler ? "#5ed357" : engineKind === "source" && caps.samplerAlternates?.includes(opt) ? "#5dcaff" : "#999"}>
                      {opt}{opt === recSampler ? "  ●" : ""}
                    </option>
                  {/each}
                </select>
              </div>
              <div class="pcr-up-combo">
                <label class="pcr-up-combo-label" for="pcr-up-scheduler">Scheduler</label>
                <select id="pcr-up-scheduler" class="pcr-up-select" class:at-rec={scheduler === recScheduler} bind:value={scheduler}>
                  {#each caps.schedulerOptions as opt}
                    <option value={opt} style:color={opt === recScheduler ? "#5ed357" : engineKind === "source" && caps.schedulerAlternates?.includes(opt) ? "#5dcaff" : "#999"}>
                      {opt}{opt === recScheduler ? "  ●" : ""}
                    </option>
                  {/each}
                </select>
              </div>
            </div>
          {/if}
          {#if (sourceGraftable && caps.advancedDefaults) || tileEngine || engineKind === "qwen"}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="pcr-up-adv-toggle" onclick={() => { advancedOpen = !advancedOpen; }}>
              <span class="pcr-up-adv-arrow" class:open={advancedOpen}>▶</span>
              Advanced
              {#if Object.keys(advanced).length}<span class="pcr-up-adv-dirty">{Object.keys(advanced).length} changed</span>{/if}
            </div>
            {#if advancedOpen}
              <div class="pcr-up-adv-body">
                {#if engineKind === "source" && caps?.architecture === "flux2"}
                  <label class="pcr-up-ultrasharp">
                    <input type="checkbox" bind:checked={preserveDefocus} />
                    <span class="pcr-up-ultrasharp-text">
                      Preserve soft background
                      <span class="pcr-up-ultrasharp-hint">defocused regions keep the original's smoothness instead of growing invented texture</span>
                    </span>
                  </label>
                {/if}
                {#each engineKind === "qwen" ? [] : ADV_COMBOS as combo}
                  {#if caps[combo.optionsKey]?.length}
                    <div class="pcr-up-slider-row">
                      <span class="pcr-up-slider-label">{combo.label}</span>
                      <select
                        class="pcr-up-select pcr-up-adv-select"
                        value={advValue(combo.name)}
                        onchange={(e) => setAdv(combo.name, e.target.value)}
                      >
                        {#each caps[combo.optionsKey] as opt}
                          <option value={opt} style:color={opt === advDefaults[combo.name] ? "#5ed357" : "#999"}>
                            {opt}{opt === advDefaults[combo.name] ? "  ●" : ""}
                          </option>
                        {/each}
                      </select>
                    </div>
                  {/if}
                {/each}
                {#each engineKind === "qwen" ? ADV_SLIDERS.filter((r) => r.name === "steps" || r.name === "cfg") : ADV_SLIDERS as row}
                  <div class="pcr-up-slider-row">
                    <span class="pcr-up-slider-label">{row.label}</span>
                    <SettingsSlider
                      min={row.min}
                      max={row.max}
                      step={row.step}
                      value={Number(advValue(row.name) ?? row.min)}
                      savedValue={advDefaults[row.name]}
                      onChange={(v) => setAdv(row.name, v)} />
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
          {#if !onUseInEdit}
            <!-- Edit handoffs render to temp and return as a layer — Edit's own Save persists. -->
            <div class="pcr-up-save">
              <span class="pcr-up-save-label">Save to</span>
              <SavePathInput value={savePrefix} onChange={(v) => { savePrefix = v; }} {fetchApi} />
            </div>
          {/if}
          </div>
        </div>
      </div>
      <div class="pcr-modal-footer">
        {#if progress}
          {#if runActive}
            <button class="pcr-modal-btn pcr-modal-btn-danger" onclick={onCancelRun}>Cancel</button>
          {:else}
            <!-- Run finished — the config (incl. the prompt) is editable again, so
                 always offer a re-run. Done adds the result actions on top. -->
            <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={onCancel}>Close</button>
            <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={() => confirm("background")}>{progress.phase === "done" ? "Run Again" : "Apply"}</button>
            {#if progress.phase === "done" && onUseInEdit}
              <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={() => onUseInEdit(progress)} disabled={!progress.filename}>Add to Edit</button>
            {:else if progress.phase === "done" && progress.resultHash && onViewResult}
              <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={() => onViewResult(progress.resultHash)}>View result</button>
            {/if}
          {/if}
        {:else}
          <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={onCancel}>Cancel</button>
          {#if !onUseInEdit}
            <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={() => confirm("workflow")}>Create Workflow</button>
          {/if}
          <button class="pcr-modal-btn pcr-modal-btn-primary" bind:this={confirmBtn} onclick={() => confirm("background")}>Apply</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* near-fullscreen two-pane layout, same shape as the Inpaint modal:
     image on the left, prompt + settings stacked on the right */
  .pcr-up-modal {
    width: 96vw; height: 94vh;
    min-width: 900px; max-width: 96vw;
    display: flex; flex-direction: column;
  }
  .pcr-up-body { display: flex; gap: 16px; flex: 1; min-height: 0; }
  .pcr-up-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .pcr-up-stage {
    position: relative;
    flex: 1; min-height: 0;
    display: flex; align-items: center; justify-content: center;
    background: #101010; border: 1px solid #2a2a2a; border-radius: 6px;
    overflow: hidden;
  }
  .pcr-up-stage.zoomable { cursor: grab; touch-action: none; }
  .pcr-up-stage.zoomable:active { cursor: grabbing; }
  /* absolute so the stage's flex centering (used by the live tile preview)
     doesn't fight the pan/zoom transform */
  .pcr-up-zoomwrap { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
  .pcr-up-zoomctl {
    position: absolute; right: 8px; bottom: 8px; z-index: 3;
    display: flex; align-items: center; gap: 6px;
    background: rgba(18, 18, 18, 0.72); border: 1px solid #3a3a3a;
    border-radius: 6px; padding: 3px 4px 3px 9px;
  }
  .pcr-up-zoompct { font-size: 11px; color: #bbb; font-variant-numeric: tabular-nums; min-width: 36px; text-align: right; }
  .pcr-up-fit-btn {
    padding: 3px 10px; font-size: 11.5px; color: #aaa;
    background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; cursor: pointer;
  }
  .pcr-up-fit-btn:hover { color: #fff; border-color: #555; }
  .pcr-up-fit-btn.on { color: #fff; background: #c85909; border-color: #c85909; }
  /* Before/after split. The wrapper fills the stage so its clip-path inset is
     screen-space; pointer-events:none lets a pan pass through to the stage —
     only the divider grabs the pointer. */
  .pcr-up-split-before { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
  .pcr-up-split-divider {
    position: absolute; top: 0; bottom: 0;
    width: 18px; margin-left: -9px;   /* wide invisible grab zone, line centered */
    z-index: 7; cursor: ew-resize; touch-action: none;
  }
  .pcr-up-split-divider::before {
    content: ""; position: absolute; top: 0; bottom: 0; left: 50%;
    width: 2px; margin-left: -1px;
    background: rgba(255, 255, 255, 0.9); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
  }
  .pcr-up-split-knob {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 30px; height: 30px; border-radius: 50%;
    background: rgba(20, 20, 20, 0.85); border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center; color: #fff;
  }
  .pcr-up-split-knob svg { width: 18px; height: 18px; }
  .pcr-up-split-label {
    position: absolute; top: 8px; z-index: 6;
    padding: 2px 7px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
    color: #fff; background: rgba(20, 20, 20, 0.7); border-radius: 4px;
    pointer-events: none;
  }
  .pcr-up-split-label.before { left: 8px; }
  .pcr-up-split-label.after { right: 8px; }
  .pcr-up-right {
    flex: 0 0 340px; min-height: 0;
    display: flex; flex-direction: column;
    overflow-y: auto; padding-right: 4px;
  }
  /* settings stay visible but inert while the run owns the modal */
  .pcr-up-right.running { pointer-events: none; opacity: 0.55; }
  .pcr-up-restore-chip {
    align-self: flex-start; margin-bottom: 10px;
    padding: 5px 11px; font-size: 12px; color: #d8c08a;
    background: rgba(200, 89, 9, 0.12); border: 1px solid rgba(200, 89, 9, 0.5);
    border-radius: 6px; cursor: pointer;
  }
  .pcr-up-restore-chip:hover { color: #fff; background: rgba(200, 89, 9, 0.25); border-color: #c85909; }
  .pcr-up-floor-msg { margin: 0; font-size: 13px; color: #ccc; line-height: 1.4; }
  .pcr-up-modes { display: flex; flex-direction: column; gap: 8px; }
  .pcr-up-mode {
    display: flex; gap: 10px; align-items: flex-start;
    padding: 10px 12px; border: 1px solid #3a3a3a; border-radius: 6px;
    cursor: pointer; transition: border-color 0.12s, background 0.12s;
  }
  .pcr-up-mode:hover:not(.disabled) { border-color: #555; }
  .pcr-up-mode.selected { border-color: #c85909; background: rgba(200, 89, 9, 0.08); }
  .pcr-up-mode.disabled { opacity: 0.45; cursor: default; }
  .pcr-up-mode-radio {
    flex: none; width: 16px; height: 16px; margin-top: 1px;
    border: 2px solid #555; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .pcr-up-mode.selected .pcr-up-mode-radio { border-color: #c85909; }
  .pcr-up-mode-dot { width: 8px; height: 8px; border-radius: 50%; background: transparent; }
  .pcr-up-mode.selected .pcr-up-mode-dot { background: #c85909; }
  .pcr-up-mode-text { min-width: 0; }
  .pcr-up-mode-label { font-size: 13px; font-weight: 600; color: #eee; }
  .pcr-up-mode-desc { font-size: 11.5px; color: #999; line-height: 1.35; margin-top: 2px; }
  .pcr-up-sources { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .pcr-up-sources-label { font-size: 11px; color: #888; }
  .pcr-up-seg {
    display: flex; border: 1px solid #3a3a3a; border-radius: 5px; overflow: hidden;
  }
  .pcr-up-seg-opt {
    padding: 3px 10px; font-size: 11.5px; color: #aaa; cursor: pointer;
    background: transparent;
  }
  .pcr-up-seg-opt + .pcr-up-seg-opt { border-left: 1px solid #3a3a3a; }
  .pcr-up-seg-opt:hover:not(.disabled) { color: #ddd; }
  .pcr-up-seg-opt.active { background: #c85909; color: #fff; }
  .pcr-up-seg-opt.disabled { opacity: 0.4; cursor: default; }
  .pcr-up-save { display: flex; flex-direction: column; gap: 4px; margin-top: 14px; }
  .pcr-up-canvas { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .pcr-up-canvas-title { font-size: 11.5px; color: #d8a046; }
  .pcr-up-ultrasharp { display: flex; align-items: flex-start; gap: 8px; margin-top: 6px; cursor: pointer; }
  .pcr-up-ultrasharp input { margin-top: 2px; accent-color: #5dcaff; cursor: pointer; }
  .pcr-up-ultrasharp-text { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: #ccc; }
  .pcr-up-ultrasharp-hint { font-size: 11px; color: #888; line-height: 1.35; }
  .pcr-up-cond { display: flex; flex-direction: column; gap: 4px; margin-top: 14px; }
  .pcr-up-cond-hint { font-size: 10.5px; color: #777; line-height: 1.35; }
  .pcr-up-prompt-block { display: flex; flex-direction: column; gap: 4px; margin-top: 14px; }
  .pcr-up-prompt {
    min-height: 150px;
    padding: 7px 10px; font-size: 12px; line-height: 1.4; color: #ddd;
    background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 5px;
    outline: none; font-family: inherit; resize: vertical;
  }
  .pcr-up-prompt-editor { height: 190px; padding: 0; resize: none; overflow: hidden; display: flex; flex-direction: column; }
  .pcr-up-prompt-editor:focus-within { border-color: #c85909; }
  .pcr-up-prompt-editor :global(.cm-editor) { flex: 1; min-height: 0; height: 100%; }
  .pcr-up-prompt-editor :global(.cm-scroller) { overflow: auto; }
  .pcr-up-refprompt {
    min-height: 110px; resize: vertical;
    padding: 7px 10px; font-size: 11.5px; line-height: 1.4; color: #9a9a9a;
    background: #161616; border: 1px solid #313131; border-radius: 5px;
    outline: none; font-family: inherit; cursor: text; user-select: text;
  }
  .pcr-up-save-label { font-size: 11px; color: #888; }
  .pcr-up-sliders { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
  .pcr-up-slider-row { display: flex; align-items: center; gap: 10px; }
  .pcr-up-slider-row-ticks { align-items: flex-start; margin-bottom: 10px; }
  .pcr-up-slider-row-ticks .pcr-up-slider-label { margin-top: 4px; }
  .pcr-up-slider-label { flex: none; width: 52px; font-size: 11px; color: #888; }
  .pcr-up-slider-target { font-size: 10.5px; color: #888; text-align: right; }
  .pcr-up-combos { display: flex; gap: 10px; margin-top: 14px; }
  .pcr-up-combo { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .pcr-up-combo-label { font-size: 11px; color: #888; }
  .pcr-up-select {
    width: 100%; box-sizing: border-box;
    padding: 5px 8px; font-size: 12px; color: #999;
    background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 5px;
    outline: none; cursor: pointer;
  }
  /* matches the model panel's at-default green: you're on the recommended pick */
  .pcr-up-select.at-rec { color: #5ed357; border-color: rgba(94, 211, 87, 0.45); }
  .pcr-up-adv-toggle {
    display: flex; align-items: center; gap: 6px;
    margin-top: 14px; font-size: 11.5px; color: #999;
    cursor: pointer; user-select: none;
  }
  .pcr-up-adv-toggle:hover { color: #ccc; }
  .pcr-up-adv-arrow {
    font-size: 8px; transition: transform 0.15s;
  }
  .pcr-up-adv-arrow.open { transform: rotate(90deg); }
  .pcr-up-adv-dirty {
    font-size: 10px; color: #c85909;
    border: 1px solid rgba(200, 89, 9, 0.4); border-radius: 3px;
    padding: 1px 5px;
  }
  .pcr-up-adv-body {
    display: flex; flex-direction: column; gap: 7px;
    margin-top: 10px; padding: 10px 10px 10px 12px;
    border-left: 2px solid #3a3a3a;
  }
  .pcr-up-adv-select { flex: 1; }
  .pcr-up-progress { flex: none; display: flex; flex-direction: column; gap: 8px; align-items: center; }
  .pcr-up-preview { display: block; user-select: none; pointer-events: none; }
  .pcr-up-live { max-width: 100%; max-height: 100%; object-fit: contain; }
  .pcr-up-progress-text { font-size: 12.5px; color: #ccc; }
  .pcr-up-done { color: #7ec97e; }
  .pcr-up-error { color: #e57373; }
  .pcr-up-bar {
    width: 100%; height: 6px; border-radius: 3px;
    background: #1c1c1c; border: 1px solid #3a3a3a; overflow: hidden;
  }
  .pcr-up-bar-fill {
    height: 100%; background: #c85909; border-radius: 3px;
    transition: width 0.25s ease;
  }
  .pcr-up-bar-fill.indeterminate {
    width: 35%;
    animation: pcr-up-slide 1.2s ease-in-out infinite alternate;
  }
  @keyframes pcr-up-slide {
    from { margin-left: 0; }
    to { margin-left: 65%; }
  }
  .pcr-up-bar-label { font-size: 10.5px; color: #888; }
</style>
