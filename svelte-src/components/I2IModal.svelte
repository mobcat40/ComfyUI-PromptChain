<script>
  // I2IModal — full-frame image-to-image. A [Source] | [Output] viewport over
  // the editor composite (no mask, no painting), a PromptChain-style prompt, an
  // engine + denoise. Apply renders off-screen (auto-switching to Output,
  // repeatable); Add to Edit hands the result back as a new layer.
  //
  // A no-mask sibling of InpaintModal: same engine picker / prompt editor /
  // settings, minus the mask painter, the Regional/Depth modes, and the
  // conditions panel (all mask-spatial).

  import { untrack } from "svelte";
  import { portal } from "../lib/portal.js";
  import { recallModalMemory, storeModalMemory } from "../lib/modal-memory.js";
  import SettingsSlider from "./model/SettingsSlider.svelte";
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
    apiURL = (p) => p,
    onRun = null,        // (options) => tracker
    onUseInEdit = null,  // (doneState) => void — hand the render back to Edit as a layer
    elevated = false,    // raise z-index above the Edit modal
    mountPromptEditor = null, // (container, initialValue, onChange, modelInfo) => Promise<EditorView>
    imageKey = "",       // stable id of the image (per-image session memory)
    onCancel,
  } = $props();

  let activeTab = $state("source");
  let prompt = $state("");
  let denoise = $state(0.55);
  let sampler = $state("");
  let scheduler = $state("");
  let steps = $state(0); // engine recipe on open; 0 = inherit (source model)
  let cfg = $state(0);   // engine recipe on open; 0 = inherit (source model)
  let advancedOpen = $state(false);
  let promptEditorView = null;

  // Engine: "source" = re-diffuse with the image's own model; a picked hash =
  // a standalone graph on that checkpoint/UNET. P0 roster: source + SDXL /
  // FLUX.1 / Krea 2 (prepareI2I drops Qwen Edit).
  let engineSel = $state("source");
  let engineEntry = $derived(caps?.engineModels?.find((m) => m.hash === engineSel) || null);
  let engineKind = $derived(engineEntry
    ? (engineEntry.architecture === "flux" ? "flux1" : engineEntry.architecture === "krea2" ? "krea2" : "sdxl")
    : "source");
  // Realism mode: a krea2_turbo-only recipe (abliterated encoder + wan_2.1 VAE +
  // realism/bypass LoRAs + ClownsharKSampler_Beta — full-frame i2i).
  let realism = $state(false);
  // Realism assets present? (abliterated encoder + realism + projector LoRAs).
  // Computed once — installed lists don't change without a restart. Hides the
  // toggle until the Krea 2 Realism pack is installed (Settings → Install).
  const realismAssetsInstalled = (() => {
    try {
      const LG = window.LiteGraph;
      const clip = LG?.createNode?.("CLIPLoader")?.widgets?.find((w) => w.name === "clip_name")?.options?.values || [];
      const loras = LG?.createNode?.("LoraLoaderModelOnly")?.widgets?.find((w) => w.name === "lora_name")?.options?.values || [];
      return clip.some((o) => /qwen3.?vl.*4b.*abliterated/i.test(o))
        && loras.some((o) => /krea2-realism/i.test(o))
        && loras.some((o) => /krea2_turbo_projector_scale/i.test(o))
        // i2i realism re-renders full-frame with the author's ClownsharKSampler_Beta
        // (RES4LYF) — gate on the node being registered too.
        && !!LG?.registered_node_types?.["ClownsharKSampler_Beta"];
    } catch { return false; }
  })();
  let realismAvailable = $derived(engineKind === "krea2" && /turbo/i.test(engineEntry?.filename || "") && realismAssetsInstalled);
  let engineGroups = $derived({
    sdxl: (caps?.engineModels || []).filter((m) => m.architecture === "sdxl"),
    flux1: (caps?.engineModels || []).filter((m) => m.architecture === "flux"),
    krea2: (caps?.engineModels || []).filter((m) => m.architecture === "krea2"),
  });
  let engineSelectGroups = $derived([
    ...(caps?.sourceUsable !== false
      ? [{ label: "", options: [{ value: "source", label: "Source model — this image's own workflow (default)" }] }]
      : []),
    ...(engineGroups.sdxl.length
      ? [{ label: "SDXL — re-diffuse with this checkpoint", options: engineGroups.sdxl.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    ...(engineGroups.flux1.length
      ? [{ label: "FLUX.1 — re-diffuse with this model", options: engineGroups.flux1.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
    ...(engineGroups.krea2.length
      ? [{ label: "Krea 2 — re-diffuse with this model", options: engineGroups.krea2.map((m) => ({ value: m.hash, label: m.displayName })) }]
      : []),
  ]);

  // Per-engine recipe — read off caps (stamped by prepareI2I from the single
  // i2iRecipe source of truth). No table lives here. The source model has no
  // fixed recipe: 0/"" inherit the image's own gen (apply() passes undefined so
  // the builder falls through to the source's embedded steps/cfg/sampler).
  function engineRecipe(entry) {
    if (!entry) return { steps: 0, cfg: 0, denoise: caps?.sourceI2iRecipe?.denoise ?? caps?.defaultDenoise ?? 0.55, sampler: "", scheduler: "" };
    const r = entry.i2i || {};
    return { steps: r.steps ?? 0, cfg: r.cfg ?? 0, denoise: r.denoise ?? caps?.defaultDenoise ?? 0.55, sampler: r.sampler || "", scheduler: r.scheduler || "" };
  }
  let recSampler = $derived(realism ? "ClownsharKSampler_Beta" : (engineEntry ? engineRecipe(engineEntry).sampler : caps?.recommendedSampler));
  let recScheduler = $derived(engineEntry ? engineRecipe(engineEntry).scheduler : caps?.recommendedScheduler);
  let recSteps = $derived(engineRecipe(engineEntry).steps);
  let recCfg = $derived(engineRecipe(engineEntry).cfg);
  // Realism adds the author's ClownsharKSampler as a sampler option (its default);
  // pick any normal sampler to override it ("guide it away").
  let samplerOptions = $derived(realism ? ["ClownsharKSampler_Beta", ...(caps?.samplerOptions || [])] : (caps?.samplerOptions || []));

  function pickEngine(value) {
    engineSel = value;
    realism = false; // an engine switch resets the Realism preset (re-tick after)
    const entry = caps?.engineModels?.find((m) => m.hash === value) || null;
    const r = engineRecipe(entry);
    if (entry) { sampler = r.sampler; scheduler = r.scheduler; }
    else { sampler = caps?.defaultSampler || ""; scheduler = caps?.defaultScheduler || ""; }
    steps = r.steps; cfg = r.cfg; denoise = r.denoise;
  }

  // Realism is a preset — exactly like picking an engine: ticking it drops the
  // recipe into the dials (adjust after); unticking restores the engine's recipe.
  function setRealism(on) {
    realism = on;
    if (on) { sampler = "ClownsharKSampler_Beta"; steps = 8; cfg = 1; denoise = 0.6; }
    else pickEngine(engineSel);
  }

  // Model identity for the prompt editor's templates/autocomplete: the picked
  // engine model, else the image's own source model.
  function editorModelInfo() {
    if (engineEntry) return { hash: engineEntry.hash, architecture: engineEntry.architecture };
    return caps?.sourceModelInfo || null;
  }

  let memoryPrompt = null;
  function prefillFor() {
    if (typeof memoryPrompt === "string" && memoryPrompt.trim()) return memoryPrompt;
    return prefillPrompt || "";
  }

  let progress = $state(null);
  let doneState = $state(null);
  let errorMsg = $state("");
  let tracker = null;
  let unsub = null;

  let wasOpen = false;
  $effect(() => {
    if (open && caps && !wasOpen) {
      wasOpen = true;
      untrack(() => {
        activeTab = "source";
        const mem = recallModalMemory("i2i", imageKey);
        const memEngineValid = mem?.engine === "source"
          ? caps.sourceUsable !== false
          : !!mem?.engine && !!caps.engineModels?.some((m) => m.hash === mem.engine);
        engineSel = memEngineValid ? mem.engine
          : caps.sourceUsable === false ? (caps.engineModels?.[0]?.hash || "source") : "source";
        memoryPrompt = (mem && typeof mem.prompt === "string" && mem.prompt.trim()) ? mem.prompt : null;
        prompt = prefillFor();
        const entry = caps.engineModels?.find((m) => m.hash === engineSel) || null;
        const r = engineRecipe(entry);
        if (entry) { sampler = r.sampler; scheduler = r.scheduler; }
        else { sampler = caps.defaultSampler || ""; scheduler = caps.defaultScheduler || ""; }
        steps = r.steps; cfg = r.cfg; denoise = r.denoise;
        if (memEngineValid && typeof mem.denoise === "number") denoise = mem.denoise;
        advancedOpen = false;
        progress = null;
        doneState = null;
        errorMsg = "";
        requestAnimationFrame(() => { resetView(); });
      });
    } else if (!open) {
      wasOpen = false;
    }
  });

  // Ctrl+Enter applies; never let it bubble to ComfyUI's Queue Prompt.
  $effect(() => {
    if (!open) return;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        apply();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  let running = $derived(!!progress && progress.phase !== "done" && progress.phase !== "error" && progress.phase !== "cancelled");
  // Nothing to render with: the image has no graftable source AND no engine
  // model is installed. Disable Apply with a reason instead of letting it throw.
  let noEngine = $derived(caps?.sourceUsable === false && !(caps?.engineModels?.length));
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

  // ── viewport (pan/zoom, no painting) ──
  let viewportEl;
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let panning = false;
  let lastPt = null;
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
  function onPointerDown(e) {
    if (e.button > 2) return;
    panning = true;
    lastPt = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    viewportEl.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!panning) return;
    panX += e.clientX - lastPt.x;
    panY += e.clientY - lastPt.y;
    lastPt = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() { panning = false; lastPt = null; }
  function onWheel(e) {
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.05, Math.min(12, zoom * factor));
    panX = cx - ((cx - panX) / zoom) * newZoom;
    panY = cy - ((cy - panY) / zoom) * newZoom;
    zoom = newZoom;
  }
  function toggleCompare() {
    if (!outputUrl || running) return;
    compareSplit = !compareSplit;
    if (compareSplit) {
      const rect = viewportEl?.getBoundingClientRect();
      splitX = rect ? rect.width / 2 : 0;
    }
  }
  function onSplitDown(e) {
    e.stopPropagation(); e.preventDefault();
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

  // Prompt editor — remounts on engine flip so the seed re-applies.
  let promptSeedKey = $derived(engineKind);
  function promptEditor(node) {
    let disposed = false;
    let view = null;
    (async () => {
      if (!mountPromptEditor) return;
      const v = await mountPromptEditor(node, untrack(() => prefillFor()), (text) => { prompt = text; }, editorModelInfo);
      if (disposed) { v?.destroy?.(); return; }
      view = v;
      promptEditorView = v;
    })().catch((e) => console.error("[i2i] prompt editor mount failed", e));
    return {
      destroy() {
        disposed = true;
        view?.destroy?.();
        if (promptEditorView === view) promptEditorView = null;
      },
    };
  }

  // ── actions ──
  function apply() {
    if (!onRun || running) return;
    doneState = null;
    errorMsg = "";
    activeTab = "output";
    tracker = onRun({
      prompt, denoise,
      sampler: sampler || null, scheduler: scheduler || null,
      steps: steps > 0 ? steps : undefined,
      cfg: cfg > 0 ? cfg : undefined,
      engine: engineKind === "sdxl" ? "sdxl-ckpt"
        : engineKind === "flux1" ? "flux1-unet"
        : engineKind === "krea2" ? "krea2-unet" : "source",
      engineModel: engineEntry ? { hash: engineEntry.hash, filename: engineEntry.filename } : undefined,
      engineGen: engineEntry?.gen || undefined,
      realism: realismAvailable ? realism : undefined,
    });
    storeModalMemory("i2i", imageKey, {
      prompt,
      engine: engineKind === "source" ? "source" : engineSel,
      denoise,
    });
    unsub?.();
    unsub = tracker.subscribe((state) => {
      progress = state;
      if (state.phase === "done") {
        doneState = { ...state, rand: Math.random() };
        progress = null;
      } else if (state.phase === "cancelled") {
        progress = null;
        activeTab = "source";
      } else if (state.phase === "error") {
        errorMsg = state.message || "i2i failed";
        progress = null;
        activeTab = "source";
      }
    });
  }
  function stopRun() { tracker?.cancel?.(); }
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
      if (running) return;
      close();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div use:portal class="pcr-modal-backdrop" style:z-index={elevated ? 10006 : null} onkeydown={handleKeydown}>
    <div class="pcr-modal pcr-ip-modal" role="dialog" aria-modal="true">
      <div class="pcr-modal-header">
        <span class="pcr-modal-title">{running ? "i2i Blend…" : "i2i Blend"}{filename ? ` — ${filename}` : ""}{width && height ? ` · ${width}×${height}` : ""}</span>
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
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
              <div class="pcr-ip-tab" class:active={activeTab === "source"} onclick={() => { if (!running) activeTab = "source"; }}>Source</div>
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
              <div class="pcr-ip-tab" class:active={activeTab === "output"} onclick={() => { activeTab = "output"; }}>Output</div>
            </div>
            <div class="pcr-ip-tools">
              <button class="pcr-ip-tool-btn" onclick={resetView}>Fit</button>
              {#if activeTab === "output"}
                <button class="pcr-ip-tool-btn" class:on={compareSplit}
                  disabled={!outputUrl || running} onclick={toggleCompare}
                  title="Drag the divider to wipe the source over the result">Compare</button>
              {/if}
            </div>
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="pcr-ip-viewport out-mode"
            bind:this={viewportEl}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointercancel={onPointerUp}
            onwheel={onWheel}
            oncontextmenu={(e) => e.preventDefault()}
            ondragstart={(e) => e.preventDefault()}
          >
            {#if activeTab === "source"}
              <div class="pcr-ip-stage" style="transform: translate({panX}px, {panY}px) scale({zoom});">
                <img src={sourceUrl} alt="" draggable="false" width={width} height={height} />
              </div>
            {:else}
              {#if running && progress?.previewUrl}
                <div class="pcr-ip-center">
                  <img class="pcr-ip-live-preview" src={progress.previewUrl} alt="" draggable="false" />
                </div>
              {:else if outputUrl}
                <div class="pcr-ip-stage" style="transform: translate({panX}px, {panY}px) scale({zoom});">
                  <img src={outputUrl} alt="" draggable="false" width={width} height={height} />
                </div>
                {#if compareSplit}
                  <div class="pcr-ip-split-before" style="clip-path: inset(0 calc(100% - {splitX}px) 0 0);">
                    <div class="pcr-ip-stage" style="transform: translate({panX}px, {panY}px) scale({zoom});">
                      <img src={sourceUrl} alt="" draggable="false" width={width} height={height} />
                    </div>
                  </div>
                  <div class="pcr-ip-split-label before">Source</div>
                  <div class="pcr-ip-split-label after">Result</div>
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
                  <div class="pcr-ip-waiting">{running ? "Waiting for the sampler…" : "No output yet — set a denoise and Apply."}</div>
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
          {#if caps?.engineModels?.length}
            <div class="pcr-mcard">
              <div class="pcr-mcard-title">Engine</div>
              <SearchableSelect
                id="pcr-i2i-engine"
                value={engineSel}
                groups={engineSelectGroups}
                popupKey="i2i-engine"
                disabled={running}
                onpick={(v) => pickEngine(v)}
              />
              {#if engineKind === "source"}
                <div class="pcr-ip-hint">re-diffuses the whole image with its own model at the denoise below</div>
              {:else if engineKind === "sdxl"}
                <div class="pcr-ip-hint">re-diffuses the whole image with this SDXL checkpoint — describe the scene</div>
              {:else if engineKind === "flux1"}
                <div class="pcr-ip-hint">re-diffuses the whole image with this FLUX.1 model — strong on faces and eyes</div>
              {:else if engineKind === "krea2"}
                <div class="pcr-ip-hint">re-diffuses the whole image with this Krea 2 model — sharp detail, clean structure</div>
              {/if}
              {#if realismAvailable}
                <label class="pcr-ip-hint" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:6px;">
                  <input type="checkbox" checked={realism} onchange={(e) => setRealism(e.currentTarget.checked)} />
                  Realism — abliterated encoder + wan VAE + realism/bypass LoRAs (NSFW-capable)
                </label>
              {/if}
            </div>
          {/if}
          <div class="pcr-mcard">
            <div class="pcr-mcard-title">Prompt</div>
            {#key promptSeedKey}
              {#if mountPromptEditor}
                <div class="pcr-ip-prompt pcr-ip-prompt-editor" use:promptEditor></div>
              {:else}
                <textarea
                  class="pcr-ip-prompt"
                  bind:value={prompt}
                  spellcheck="false"
                  placeholder={"what the whole image should become\n\nNegative Prompt:\noptional"}
                ></textarea>
              {/if}
            {/key}
            {#if referencePrompt}
              <span class="pcr-ip-label">Workflow prompt (reference)</span>
              <textarea class="pcr-ip-refprompt" readonly spellcheck="false">{referencePrompt}</textarea>
            {/if}
          </div>
          <div class="pcr-mcard">
            <div class="pcr-mcard-title">Settings</div>
            <div class="pcr-ip-denoise">
              <span class="pcr-ip-label">Denoise</span>
              <SettingsSlider min={0.05} max={1} step={0.01} value={denoise}
                savedValue={engineRecipe(engineEntry).denoise} onChange={(v) => { denoise = v; }} />
            </div>
            {#if samplerOptions.length}
              <div class="pcr-ip-combos">
                <div class="pcr-ip-combo">
                  <label class="pcr-ip-label" for="pcr-i2i-sampler">Sampler</label>
                  <select id="pcr-i2i-sampler" class="pcr-ip-select" class:at-rec={sampler === recSampler} bind:value={sampler}>
                    {#each samplerOptions as opt}
                      <option value={opt} style:color={opt === recSampler ? "#5ed357" : "#999"}>{opt}{opt === recSampler ? "  ●" : ""}</option>
                    {/each}
                  </select>
                </div>
                <div class="pcr-ip-combo">
                  <label class="pcr-ip-label" for="pcr-i2i-scheduler">Scheduler</label>
                  <select id="pcr-i2i-scheduler" class="pcr-ip-select" class:at-rec={scheduler === recScheduler} bind:value={scheduler}>
                    {#each caps.schedulerOptions as opt}
                      <option value={opt} style:color={opt === recScheduler ? "#5ed357" : "#999"}>{opt}{opt === recScheduler ? "  ●" : ""}</option>
                    {/each}
                  </select>
                </div>
              </div>
            {/if}
            <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
            <div class="pcr-ip-adv-head" onclick={() => { advancedOpen = !advancedOpen; }}>
              {advancedOpen ? "▾" : "▸"} Advanced
            </div>
            {#if advancedOpen}
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
              <div style="opacity:0.55;font-size:11px;padding:2px 0 0 2px">On the source model, 0 = inherit the image's own steps/cfg.</div>
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
            disabled={noEngine}
            title={noEngine ? "This image has no render data to re-diffuse and no compatible engine model is installed." : ""}>
            {doneState ? "Re-Apply" : "Apply"}
          </button>
          {#if onUseInEdit}
            <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={() => onUseInEdit(doneState)} disabled={!doneState}>
              Add to Edit
            </button>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .pcr-ip-modal {
    width: 96vw; height: 94vh;
    min-width: 900px; max-width: 96vw;
    display: flex; flex-direction: column;
  }
  .pcr-ip-body { display: flex; gap: 16px; flex: 1; min-height: 0; }
  .pcr-ip-left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .pcr-ip-right { flex: 0 0 320px; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; padding-right: 4px; }
  .pcr-ip-tabs { display: flex; align-items: center; margin-bottom: 8px; }
  .pcr-ip-seg { display: flex; border: 1px solid #3a3a3a; border-radius: 5px; overflow: hidden; }
  .pcr-ip-tab { padding: 4px 18px; font-size: 12px; color: #aaa; cursor: pointer; background: transparent; }
  .pcr-ip-tab + .pcr-ip-tab { border-left: 1px solid #3a3a3a; }
  .pcr-ip-tab:hover:not(.active) { color: #ddd; }
  .pcr-ip-tab.active { background: #c85909; color: #fff; }
  .pcr-ip-tools { display: flex; align-items: center; gap: 8px; margin-left: auto; align-self: center; }
  .pcr-ip-tool-btn {
    padding: 3px 10px; font-size: 11.5px; color: #aaa;
    background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; cursor: pointer;
  }
  .pcr-ip-tool-btn:hover { color: #fff; border-color: #555; }
  .pcr-ip-tool-btn.on { color: #fff; border-color: #c85909; background: rgba(200, 89, 9, 0.2); }
  .pcr-ip-tool-btn:disabled { opacity: 0.4; cursor: default; }
  .pcr-ip-viewport {
    position: relative; overflow: hidden;
    flex: 1; min-height: 0; background: #141414;
    border: 1px solid #3a3a3a; border-radius: 6px;
    touch-action: none; cursor: grab;
  }
  .pcr-ip-viewport:active { cursor: grabbing; }
  .pcr-ip-stage { position: absolute; transform-origin: 0 0; }
  .pcr-ip-stage img { display: block; user-select: none; pointer-events: none; }
  .pcr-ip-split-before { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
  .pcr-ip-split-divider {
    position: absolute; top: 0; bottom: 0;
    width: 18px; margin-left: -9px;
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
  .pcr-ip-center { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .pcr-ip-live-preview { max-width: 100%; max-height: 100%; object-fit: contain; }
  .pcr-ip-waiting { font-size: 12.5px; color: #777; }
  .pcr-ip-combos { display: flex; gap: 10px; }
  .pcr-ip-combo { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .pcr-ip-select {
    width: 100%; box-sizing: border-box;
    padding: 5px 8px; font-size: 12px; color: #999;
    background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 5px;
    outline: none; cursor: pointer;
  }
  .pcr-ip-select.at-rec { color: #5ed357; border-color: rgba(94, 211, 87, 0.45); }
  .pcr-ip-progress { position: absolute; left: 16px; right: 16px; bottom: 12px; display: flex; align-items: center; gap: 10px; }
  .pcr-ip-bar { flex: 1; height: 6px; border-radius: 3px; background: rgba(0, 0, 0, 0.55); border: 1px solid #3a3a3a; overflow: hidden; }
  .pcr-ip-bar-fill { height: 100%; background: #c85909; transition: width 0.2s ease; }
  .pcr-ip-bar-fill.indeterminate { width: 35%; animation: pcr-i2i-slide 1.2s ease-in-out infinite alternate; }
  @keyframes pcr-i2i-slide { from { margin-left: 0; } to { margin-left: 65%; } }
  .pcr-ip-bar-label { font-size: 10.5px; color: #bbb; }
  .pcr-ip-label { font-size: 11px; color: #888; margin-top: 6px; }
  .pcr-ip-adv-head { margin-top: 8px; font-size: 11px; color: #888; cursor: pointer; user-select: none; }
  .pcr-ip-adv-head:hover { color: #ccc; }
  .pcr-ip-hint { font-size: 11px; color: #777; }
  .pcr-ip-prompt {
    min-height: 200px; resize: vertical;
    padding: 8px 10px; font-size: 12.5px; line-height: 1.45; color: #ddd;
    background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 5px;
    outline: none; font-family: inherit;
  }
  .pcr-ip-prompt:focus { border-color: #c85909; }
  .pcr-ip-prompt-editor {
    height: 220px; padding: 0; resize: none; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .pcr-ip-prompt-editor:focus-within { border-color: #c85909; }
  .pcr-ip-prompt-editor :global(.cm-editor) { flex: 1; min-height: 0; height: 100%; }
  .pcr-ip-prompt-editor :global(.cm-scroller) { overflow: auto; }
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
