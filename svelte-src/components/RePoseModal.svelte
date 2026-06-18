<script>
  // Re-pose modal — three panes: a detached 3D poser (left), the source image /
  // live render (middle), and the recipe/model/prompt config (right). Pose a
  // throwaway mannequin; pick a recipe whose pose LoRA/CLIP/VAE are installed +
  // a base model; Run renders in the BACKGROUND (the user's workflow is never
  // touched) and the result lands as a lineage child. Uses the shared modal
  // theme (modal-shared.css) + the upscale modal's sizing so it reads identically.
  import { untrack } from "svelte";
  import { portal } from "../lib/portal.js";
  import { loadModalSetup, saveModalSetup } from "../lib/modal-setup.js";
  import "./sidebar/modal-shared.css";

  let {
    open = false,
    sourceUrl = "",
    width = 0,
    height = 0,
    imageKey = "",              // displayedHash — the image being re-posed (save key)
    lineageKeys = [],           // [current, ...ancestors] hashes — restore walks these
    fetchApi = null,
    caps = null,                // { recipes: [...] } from fetchReposeCaps
    progress = null,            // background tracker state
    onMountPoser = null,        // (el, {width,height,outputMode}) => Promise<handle>
    mountPromptEditor = null,   // (container, initialValue, onChange, modelInfoFn) => Promise<EditorView> — shared rich editor (inpaint/upscale)
    onRun = null,               // (opts) => void
    onUseInEdit = null,         // (doneState) => void — add the result into the editor as a layer (inpaint/upscale pattern)
    onCancel = () => {},
  } = $props();

  const recipes = $derived(caps?.recipes || []);
  let selectedRecipeId = $state("");
  const recipe = $derived(recipes.find((r) => r.id === selectedRecipeId) || null);

  let modelFilename = $state("");
  // One rich editor holds the whole prompt as a PromptChain doc (`//` sections,
  // optional `Negative Prompt:` split, tags) — sent RAW to the background runner,
  // which feeds it to a PromptChain_PromptChain node for server-side compile (the
  // same single source of truth as the inpaint/upscale editors). No client parse.
  let promptDoc = $state("");
  let seed = $state(0);
  let randomizeSeed = $state(true);
  let steps = $state(20);
  let cfg = $state(5);
  let loraStrength = $state(0.7);   // pose-LoRA weight (the "pattern" strength)
  let megapixels = $state(1.0);     // Qwen input-image scale target (AnyPose only)

  let poserEl = $state(null);      // $state so the mount effect re-runs when the element rebinds on reopen
  let poserHandle = $state(null);  // $state so the scene-load effect reacts when it mounts

  // Default the recipe to the first installable one when the modal opens.
  $effect(() => {
    if (!open) return;
    if (!selectedRecipeId || !recipes.some((r) => r.id === selectedRecipeId)) {
      const first = recipes.find((r) => r.ok) || recipes[0];
      if (first) untrack(() => applyRecipeDefaults(first));
    }
  });

  function recipeDoc(r) {
    return r?.promptDoc || "";
  }

  function applyRecipeDefaults(r) {
    selectedRecipeId = r.id;
    promptDoc = recipeDoc(r);
    steps = r.sampler?.steps ?? 20;
    cfg = r.sampler?.cfg ?? 5;
    loraStrength = r.loraStrength ?? 0.7;
    megapixels = r.megapixels ?? 1.0;
    modelFilename = r.models?.[0]?.filename || "";
  }

  function onRecipeChange(e) {
    const r = recipes.find((x) => x.id === e.target.value);
    if (r) applyRecipeDefaults(r);
  }

  // The picked base model identifies the editor's autocomplete/templates (read
  // live when the menu opens, like the upscale modal).
  function editorModelInfo() {
    const m = (recipe?.models || []).find((x) => x.filename === modelFilename);
    return m ? { hash: m.hash, architecture: m.architecture } : null;
  }

  // Mount the shared rich editor (tag highlighting + autocomplete). Seeded once;
  // the {#key selectedRecipeId} wrapper remounts it on a recipe switch so the new
  // recipe's doc loads (mirrors the upscale modal's editor lifecycle).
  function promptEditor(node) {
    let disposed = false, view = null;
    (async () => {
      if (!mountPromptEditor) return;
      const v = await mountPromptEditor(node, untrack(() => promptDoc), (text) => { promptDoc = text; }, editorModelInfo);
      if (disposed) v?.destroy?.(); else view = v;
    })();
    return { destroy() { disposed = true; view?.destroy?.(); } };
  }

  // Mount the detached poser once per open, SEEDED with any restored scene so it
  // boots straight into it. Gated on restoreReady so the seed is known first;
  // never re-mounts on recipe change (output mode is switched in place below).
  $effect(() => {
    if (!open || !poserEl || !onMountPoser || !restoreReady) return;
    let disposed = false, handle = null;
    const w = untrack(() => width) || 832;
    const h = untrack(() => height) || 1216;
    const mode = untrack(() => recipe?.poserMode) || "default";
    const seed = untrack(() => restorePoseState) || "";
    Promise.resolve(onMountPoser(poserEl, { width: w, height: h, outputMode: mode, poseState: seed }))
      .then((hd) => { if (disposed) hd?.dispose?.(); else { handle = hd; poserHandle = hd; } })
      .catch((err) => console.error("[Re-pose] poser mount failed", err));
    return () => { disposed = true; handle?.dispose?.(); if (poserHandle === handle) poserHandle = null; };
  });

  // Recipe switch → flip the poser's control-map mode (clay vs depth) in place.
  $effect(() => {
    const mode = recipe?.poserMode;
    if (poserHandle && mode) untrack(() => poserHandle.setOutputMode?.(mode));
  });

  const running = $derived(progress && ["building", "queueing", "running"].includes(progress.phase));
  const canRun = $derived(!!recipe?.ok && !!modelFilename && !running);
  const progressPct = $derived(
    progress?.max ? Math.min(100, Math.round((progress.value / progress.max) * 100))
      : progress?.phase === "done" ? 100 : 0);

  async function run() {
    if (!canRun || !onRun) return;
    // Force a capture in THIS recipe's mode right now (depth for RefControl, white
    // for AnyPose) — never rely on whatever mode the live viewport was left in.
    const cm = (await poserHandle?.captureNow?.(recipe.poserMode)) || poserHandle?.getControlMap?.() || { filename: "" };
    if (!cm.filename) { console.warn("[Re-pose] no control map yet"); return; }
    onRun({
      recipe,                       // caps entry: lora/clip/vae/templateId
      modelFilename,
      promptDoc,                    // raw PromptChain doc — compiled server-side (single source of truth)
      loraStrength,                 // pose-LoRA weight override
      megapixels: recipe.megapixels ? megapixels : null, // Qwen input scale (AnyPose only)
      sampler: {
        seed: randomizeSeed ? 0 : seed,  // 0 → runner randomizes
        steps, cfg,
        sampler: recipe.sampler?.sampler || "euler",
        scheduler: recipe.sampler?.scheduler || "simple",
        denoise: recipe.sampler?.denoise ?? 1.0,
      },
      controlMapFilename: cm.filename,
    });
    // Durable per-image setup (sidecar). Dials only — promptDoc rides the recipe
    // restore; the 3D scene blob is Phase 2 (task #6). Fire-and-forget.
    saveModalSetup(fetchApi, imageKey, "repose", {
      recipeId: selectedRecipeId,
      modelFilename, promptDoc, steps, cfg, loraStrength, megapixels,
      randomizeSeed, seed,
      poseState: cm.poseState || "",  // the full 3D scene, seeded into the poser on restore
    }, { w: width, h: height });
  }

  // ── AUTO-restore the last re-pose setup for this image (or its lineage) ──
  // On open we walk the lineage keys (current image first, then its ancestors/
  // relatives) and AUTOMATICALLY apply the first saved re-pose setup found —
  // recipe, model, prompt, strength, and the full 3D scene. No chip, no dims
  // guard: a pose is size-independent, so a re-posed RESULT (often a different
  // size) still resumes its source's setup.
  let promptRestoreNonce = $state(0);   // bump to force the prompt editor to reseed
  let restoreReady = $state(false);     // restore attempt done — GATES the poser mount
  let restorePoseState = $state("");    // saved scene to SEED the poser with at mount
  let attempted = false;                // one restore pass per open

  function restoreKeys() {
    const ks = (lineageKeys && lineageKeys.length) ? lineageKeys : (imageKey ? [imageKey] : []);
    return ks.filter(Boolean);
  }

  // Walk the lineage keys (current image first, then its family), AUTO-apply the
  // first saved re-pose setup, and stash its scene to SEED the poser. The mount
  // effect above waits on restoreReady, so the poser boots straight into the
  // saved scene every open — no post-mount load, no disposed-handle race.
  $effect(() => {
    if (!open) { attempted = false; restoreReady = false; restorePoseState = ""; return; }
    if (!fetchApi || attempted) return;
    const keys = restoreKeys();
    if (!keys.length) return;   // wait until at least the current image's key is known
    attempted = true;
    let cancelled = false;
    (async () => {
      for (const k of keys) {
        const doc = await loadModalSetup(fetchApi, k);
        if (cancelled) return;
        const rp = doc?.kinds?.repose;
        if (rp) {
          applySetup(rp);                          // recipe / model / prompt / dials
          restorePoseState = rp.poseState || "";   // seed the poser (mount effect)
          restoreReady = true;
          return;
        }
      }
      if (!cancelled) { restorePoseState = ""; restoreReady = true; }
    })();
    return () => { cancelled = true; };
  });

  function applySetup(s) {
    if (!s) return;
    if (typeof s.recipeId === "string") {
      const r = recipes.find((x) => x.id === s.recipeId);
      if (r) applyRecipeDefaults(r);  // sets recipe + its default prompt/dials/model
    }
    if (typeof s.modelFilename === "string" && (recipe?.models || []).some((m) => m.filename === s.modelFilename)) {
      modelFilename = s.modelFilename;
    }
    if (typeof s.steps === "number") steps = s.steps;
    if (typeof s.cfg === "number") cfg = s.cfg;
    if (typeof s.loraStrength === "number") loraStrength = s.loraStrength;
    if (typeof s.megapixels === "number") megapixels = s.megapixels;
    if (typeof s.randomizeSeed === "boolean") randomizeSeed = s.randomizeSeed;
    if (typeof s.seed === "number") seed = s.seed;
    // Custom prompt — override the recipe default + reseed the editor (a bare
    // promptDoc assignment won't repaint the mounted CM6 view; the nonce does).
    if (typeof s.promptDoc === "string" && s.promptDoc.trim()) { promptDoc = s.promptDoc; promptRestoreNonce++; }
  }

  function progressText(p) {
    if (!p) return "";
    if (p.phase === "building") return "Building graph…";
    if (p.phase === "queueing") return "Queueing…";
    if (p.phase === "running") return p.max ? `Rendering… ${p.value}/${p.max} (${progressPct}%)` : "Rendering…";
    if (p.phase === "done") return "Done.";
    if (p.phase === "error") return `Error: ${p.message || "failed"}`;
    if (p.phase === "cancelled") return "Cancelled.";
    return "";
  }

  // ── preview pan/zoom + before/after compare ───────────────────────
  // The source (before a run) and the finished result are stable images you
  // inspect with drag-to-pan + wheel-to-zoom; the live render preview is a
  // moving frame, so it stays centered (same split the upscale modal makes).
  // Compare wipes the source (Before) over the result (After) — both layers
  // share the pan/zoom transform so they stay registered.
  let liveTile = $derived(running && progress?.previewUrl ? progress.previewUrl : null);
  let inspectSrc = $derived(
    progress?.phase === "done" && progress?.resultUrl ? progress.resultUrl
      : running ? null
      : (sourceUrl || null)
  );
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

  let compareSplit = $state(false);
  let splitX = $state(0);
  let splitDragging = false;
  let canCompare = $derived(!running && !!sourceUrl && progress?.phase === "done" && !!progress?.resultUrl);
  // Drop the wipe the instant there's nothing valid behind it (a new run, the
  // modal reopens) — it re-arms only on a click.
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
</script>

{#if open}
  <!-- No outside-click close: a text-selection drag that releases on the backdrop
       must not nuke the modal. Close via the ✕ or Cancel/Close button. -->
  <div use:portal class="pcr-modal-backdrop" style:z-index={10006}>
    <div class="pcr-modal pcr-rp-modal" role="dialog" aria-modal="true" aria-label="Re-pose">
      <div class="pcr-modal-header">
        <span class="pcr-modal-title">{running ? "Re-posing…" : progress?.phase === "done" ? "Re-pose Complete" : "Re-pose"}</span>
        <button class="pcr-modal-close" onclick={() => !running && onCancel()} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="pcr-modal-body pcr-rp-body">
        <!-- LEFT: detached 3D poser -->
        <div class="pcr-rp-stage">
          <div class="pcr-rp-stage-head"><span class="pcr-rp-stage-label">Pose</span></div>
          <div class="pcr-rp-poser-mount" bind:this={poserEl}></div>
        </div>

        <!-- MIDDLE: source, then live preview / result during a run -->
        <div class="pcr-rp-stage">
          <div class="pcr-rp-stage-head">
            <span class="pcr-rp-stage-label">{running ? "Rendering" : progress?.phase === "done" ? "Result" : "Source"}</span>
            {#if inspectSrc && imgNatW}
              <!-- Fit/Compare live here (not over the image) so the stage's
                   pointer capture can't swallow their clicks. -->
              <div class="pcr-rp-stage-tools">
                {#if canCompare}
                  <button class="pcr-rp-fit-btn" class:on={compareSplit} onclick={toggleCompare}
                    title="Drag the divider to wipe the source over the result">Compare</button>
                {/if}
                <button class="pcr-rp-fit-btn" onclick={fitView}>Fit</button>
              </div>
            {/if}
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="pcr-rp-stage-img" class:zoomable={!!inspectSrc} bind:this={stageEl}
            onpointerdown={onStageDown} onpointermove={onStageMove}
            onpointerup={onStageUp} onpointercancel={onStageUp} onwheel={onStageWheel}
            ondblclick={fitView}
            oncontextmenu={(e) => e.preventDefault()}>
            {#if liveTile}
              <!-- transient live render preview: a moving frame, just center it -->
              <img class="pcr-rp-live" src={liveTile} alt="preview" draggable="false" />
            {:else if inspectSrc}
              <div class="pcr-rp-zoomwrap" style="transform: translate({panX}px, {panY}px) scale({zoom});">
                <img class="pcr-rp-preview" src={inspectSrc} alt="" draggable="false" onload={onPreviewLoad} />
              </div>
              {#if compareSplit && canCompare}
                <!-- Source (Before) clipped to the LEFT of the divider in screen
                     space; the inner wrap reuses the exact transform so it stays
                     pixel-aligned with the result behind it; sized to the
                     result's natural box so only the re-pose differs. -->
                <div class="pcr-rp-split-before" style="clip-path: inset(0 calc(100% - {splitX}px) 0 0);">
                  <div class="pcr-rp-zoomwrap" style="transform: translate({panX}px, {panY}px) scale({zoom});">
                    <img class="pcr-rp-preview" src={sourceUrl} alt="" draggable="false" width={imgNatW} height={imgNatH} />
                  </div>
                </div>
                <div class="pcr-rp-split-label before">Before</div>
                <div class="pcr-rp-split-label after">After</div>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="pcr-rp-split-divider" style="left: {splitX}px;"
                  onpointerdown={onSplitDown} onpointermove={onSplitMove}
                  onpointerup={onSplitUp} onpointercancel={onSplitUp}>
                  <div class="pcr-rp-split-knob">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="9.5 8 5.5 12 9.5 16"/><polyline points="14.5 8 18.5 12 14.5 16"/>
                    </svg>
                  </div>
                </div>
              {/if}
            {/if}
          </div>
          {#if progress && progress.phase !== "building"}
            <div class="pcr-rp-bar-wrap">
              <div class="pcr-rp-bar"><div class="pcr-rp-bar-fill" style:width={progressPct + "%"}></div></div>
              <span class="pcr-rp-bar-text" class:err={progress.phase === "error"}>{progressText(progress)}</span>
            </div>
          {/if}
        </div>

        <!-- RIGHT: recipe / model / prompt / settings -->
        <div class="pcr-rp-config" class:running={running}>
          <div class="pcr-mcard">
            <div class="pcr-mcard-title">Recipe</div>
            <select class="pcr-rp-select" value={selectedRecipeId} onchange={onRecipeChange}>
              {#each recipes as r}
                <option value={r.id} disabled={!r.ok}>{r.label}{r.ok ? "" : ` — ${r.reason}`}</option>
              {/each}
            </select>
            {#if recipe}<div class="pcr-rp-hint">{recipe.blurb}</div>{/if}
          </div>

          <div class="pcr-mcard">
            <div class="pcr-mcard-title">Base model</div>
            <select class="pcr-rp-select" bind:value={modelFilename} disabled={!recipe?.models?.length}>
              {#each recipe?.models || [] as m}
                <option value={m.filename}>{m.displayName}</option>
              {/each}
            </select>
          </div>

          <div class="pcr-mcard">
            <div class="pcr-mcard-title">Prompt</div>
            {#key selectedRecipeId + ":" + promptRestoreNonce}
              {#if mountPromptEditor}
                <div class="pcr-rp-text pcr-rp-editor" use:promptEditor></div>
              {:else}
                <textarea class="pcr-rp-text" rows="9" bind:value={promptDoc} spellcheck="false"></textarea>
              {/if}
            {/key}
          </div>

          <div class="pcr-mcard">
            <div class="pcr-mcard-title">Settings</div>
            <div class="pcr-rp-row">
              <label class="pcr-rp-field"><span>Steps</span><input type="number" min="1" max="100" bind:value={steps} /></label>
              <label class="pcr-rp-field"><span>CFG</span><input type="number" min="1" max="20" step="0.5" bind:value={cfg} /></label>
            </div>
            <div class="pcr-rp-row">
              <label class="pcr-rp-field"><span>Pose LoRA strength</span><input type="number" min="0" max="2" step="0.05" bind:value={loraStrength} /></label>
              {#if recipe?.megapixels}
                <label class="pcr-rp-field"><span>Input scale (MP)</span><input type="number" min="0.25" max="4" step="0.25" bind:value={megapixels} /></label>
              {/if}
            </div>
            <label class="pcr-rp-check"><input type="checkbox" bind:checked={randomizeSeed} /> Randomize seed</label>
            {#if !randomizeSeed}
              <label class="pcr-rp-field"><span>Seed</span><input type="number" bind:value={seed} /></label>
            {/if}
            {#if recipe?.poserMode === "depth"}
              <div class="pcr-rp-hint">Depth-locked: the poser outputs a depth map; output follows the pose frame.</div>
            {/if}
          </div>
        </div>
      </div>

      <div class="pcr-modal-footer">
        {#if running}
          <button class="pcr-modal-btn pcr-modal-btn-danger" onclick={() => onCancel()}>Cancel</button>
        {:else if progress?.phase === "done"}
          <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={() => onCancel()}>Close</button>
          <!-- Re-run with the (now-editable) recipe/model/pose without closing — mirrors Upscale's "Run Again" / Inpaint's "Re-Apply". -->
          <button class="pcr-modal-btn pcr-modal-btn-secondary" disabled={!canRun} onclick={run}>Re-Apply</button>
          <button class="pcr-modal-btn pcr-modal-btn-primary" disabled={!onUseInEdit || !progress.resultUrl} onclick={() => onUseInEdit?.(progress)}>Add to Edit</button>
        {:else if progress?.phase === "error"}
          <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={() => onCancel()}>Close</button>
          <button class="pcr-modal-btn pcr-modal-btn-primary" disabled={!canRun} onclick={run}>Retry</button>
        {:else}
          <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={() => onCancel()}>Cancel</button>
          <button class="pcr-modal-btn pcr-modal-btn-primary" disabled={!canRun} onclick={run}>Run</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Same sizing as the upscale/inpaint modals (modal-shared.css gives the chrome). */
  .pcr-rp-modal {
    width: 96vw; height: 94vh;
    min-width: 900px; max-width: 96vw;
    display: flex; flex-direction: column;
  }
  .pcr-rp-body { display: flex; gap: 16px; flex: 1; min-height: 0; }
  .pcr-rp-stage {
    flex: 1; min-width: 0; min-height: 0;
    display: flex; flex-direction: column; gap: 8px;
  }
  .pcr-rp-stage-head {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    min-height: 24px;
  }
  .pcr-rp-stage-label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.7px; text-transform: uppercase; color: #7c7c7c; }
  .pcr-rp-stage-tools { display: flex; align-items: center; gap: 6px; }
  .pcr-rp-poser-mount {
    flex: 1; min-height: 0;
    background: #101010; border: 1px solid #2a2a2a; border-radius: 6px; overflow: hidden;
  }
  .pcr-rp-stage-img {
    position: relative;
    flex: 1; min-height: 0;
    display: flex; align-items: center; justify-content: center;
    background: #101010; border: 1px solid #2a2a2a; border-radius: 6px; overflow: hidden;
    touch-action: none;
  }
  .pcr-rp-stage-img.zoomable { cursor: grab; }
  .pcr-rp-stage-img.zoomable:active { cursor: grabbing; }
  /* live render preview: a moving frame, centered by the stage's flex */
  .pcr-rp-live { max-width: 100%; max-height: 100%; object-fit: contain; }
  /* absolute so the stage's flex centering doesn't fight the pan/zoom transform */
  .pcr-rp-zoomwrap { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
  .pcr-rp-preview { display: block; user-select: none; pointer-events: none; }
  .pcr-rp-fit-btn {
    padding: 3px 10px; font-size: 11.5px; color: #aaa;
    background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; cursor: pointer;
  }
  .pcr-rp-fit-btn:hover { color: #fff; border-color: #555; }
  .pcr-rp-fit-btn.on { color: #fff; background: #c85909; border-color: #c85909; }
  /* Before/after split. The wrapper fills the stage so its clip-path inset is
     screen-space; pointer-events:none lets a pan pass through — only the
     divider grabs the pointer. */
  .pcr-rp-split-before { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
  .pcr-rp-split-divider {
    position: absolute; top: 0; bottom: 0;
    width: 18px; margin-left: -9px;   /* wide invisible grab zone, line centered */
    z-index: 7; cursor: ew-resize; touch-action: none;
  }
  .pcr-rp-split-divider::before {
    content: ""; position: absolute; top: 0; bottom: 0; left: 50%;
    width: 2px; margin-left: -1px;
    background: rgba(255, 255, 255, 0.9); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
  }
  .pcr-rp-split-knob {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 30px; height: 30px; border-radius: 50%;
    background: rgba(20, 20, 20, 0.85); border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center; color: #fff;
  }
  .pcr-rp-split-knob svg { width: 18px; height: 18px; }
  .pcr-rp-split-label {
    position: absolute; top: 8px; z-index: 6;
    padding: 2px 7px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
    color: #fff; background: rgba(20, 20, 20, 0.7); border-radius: 4px;
    pointer-events: none;
  }
  .pcr-rp-split-label.before { left: 8px; }
  .pcr-rp-split-label.after { right: 8px; }
  .pcr-rp-bar-wrap { display: flex; flex-direction: column; gap: 5px; }
  .pcr-rp-bar { height: 6px; border-radius: 3px; background: #2c2c33; overflow: hidden; }
  .pcr-rp-bar-fill { height: 100%; background: #c85909; transition: width 0.15s linear; }
  .pcr-rp-bar-text { font-size: 11px; color: #c9a87d; }
  .pcr-rp-bar-text.err { color: #e07a7a; }

  .pcr-rp-config { flex: 0 0 360px; min-height: 0; overflow-y: auto; padding-right: 4px; }
  .pcr-rp-config.running { pointer-events: none; opacity: 0.55; }
  .pcr-rp-restore-chip {
    margin-bottom: 10px;
    padding: 5px 11px; font-size: 12px; color: #d8c08a;
    background: rgba(200, 89, 9, 0.12); border: 1px solid rgba(200, 89, 9, 0.5);
    border-radius: 6px; cursor: pointer;
  }
  .pcr-rp-restore-chip:hover { color: #fff; background: rgba(200, 89, 9, 0.25); border-color: #c85909; }
  .pcr-rp-select, .pcr-rp-text {
    width: 100%; box-sizing: border-box;
    background: #0f0f12; border: 1px solid #3a3a3a; border-radius: 6px;
    color: #e6e6e6; padding: 7px 9px; font-size: 13px;
  }
  .pcr-rp-text { resize: vertical; font-family: inherit; line-height: 1.4; }
  /* Rich editor mount — same lifecycle/sizing as the upscale modal's. */
  .pcr-rp-editor { height: 210px; padding: 0; resize: none; overflow: hidden; display: flex; flex-direction: column; }
  .pcr-rp-editor:focus-within { border-color: #c85909; }
  .pcr-rp-editor :global(.cm-editor) { flex: 1; min-height: 0; height: 100%; }
  .pcr-rp-editor :global(.cm-scroller) { overflow: auto; }
  .pcr-rp-hint { font-size: 11.5px; color: #8a8a92; line-height: 1.4; }
  .pcr-rp-row { display: flex; gap: 8px; }
  .pcr-rp-field { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .pcr-rp-field > span { color: #b6b6be; }
  .pcr-rp-field input {
    background: #0f0f12; border: 1px solid #3a3a3a; border-radius: 6px;
    color: #e6e6e6; padding: 6px 8px; font-size: 13px; width: 100%; box-sizing: border-box;
  }
  .pcr-rp-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #b6b6be; }
</style>
