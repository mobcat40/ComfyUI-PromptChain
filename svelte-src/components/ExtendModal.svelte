<script>
  // "Extend Video" modal — renders the next clip continuing from the source
  // video's last frame (an I2V continuation). The graph is built + queued in the
  // background (extend-background.js); the result records as a lineage child.
  // Sophisticated controls (recipe, embedded prompt code editor, sampler knobs)
  // mirror the upscale/inpaint editor modals; everything is default-preserving —
  // the seeds come from the source clip + the chosen recipe's template.

  import SettingsSlider from "./model/SettingsSlider.svelte";

  let {
    open = false,
    lastFrameUrl = "",
    fps = 16,
    frameCount = 0,
    lightningAvailable = true,   // false = the LightX2V speed LoRAs aren't on disk
    defaults = null,             // {width,height,length,fps} seeded from the source clip
    recipeDefaults = null,       // {normal:{steps,cfg,shift,sampler,scheduler}, lightning:{…}}
    mountPromptEditor = null,    // (container, initialValue, onChange, getModelInfo) => EditorView
    modelInfo = null,            // {hash, architecture} for the editor's @prompt autocomplete
    progress = null,
    onRun,
    onDone,                      // () => land on the result + close (the "jump")
    onCancel,
  } = $props();

  // Wan's official negative — folded into the editor as an editable section so an
  // empty negative at CFG>1 can't let the clip drift to a static "live wallpaper".
  const WAN_NEG = "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";
  const SAMPLERS = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_3m_sde", "uni_pc", "lcm"];
  const SCHEDULERS = ["simple", "normal", "beta", "karras", "sgm_uniform", "ddim_uniform"];

  let recipe = $state("normal");      // "normal" = vanilla 20-step | "lightning" = 4-step distill
  let stitch = $state(true);          // join source + continuation into one continuous file
  let advancedOpen = $state(false);

  // Adjustable params — seeded from `defaults` (clip) + `recipeDefaults` (sampler).
  let width = $state(640);
  let height = $state(640);
  let length = $state(81);
  let outFps = $state(16);
  let steps = $state(20);
  let cfg = $state(3.5);
  let shift = $state(5);
  let sampler = $state("euler");
  let scheduler = $state("simple");
  let seed = $state(0);
  let seedFixed = $state(false);

  let promptText = $state("");        // mirror of the editor (fallback when no editor)
  let promptEditorView = null;        // CM6 EditorView; authoritative prompt source once mounted

  function seedSharedDefaults() {
    if (!defaults) return;
    width = defaults.width; height = defaults.height;
    length = defaults.length;
    outFps = 16; // the continuation is always i2v-native 16fps; stitch matches the source automatically
  }
  function seedRecipeDefaults(r) {
    const rd = recipeDefaults?.[r];
    if (!rd) return;
    steps = rd.steps; cfg = rd.cfg; shift = rd.shift;
    sampler = rd.sampler; scheduler = rd.scheduler;
  }

  let primed = false;
  let lastRecipe = "normal";
  $effect(() => {
    if (open && !primed) {
      recipe = "normal"; lastRecipe = "normal"; stitch = true; advancedOpen = false;
      seed = 0; seedFixed = false; promptText = "";
      seedSharedDefaults(); seedRecipeDefaults("normal");
      primed = true;
    }
    if (!open) primed = false;
  });
  // Never leave Lightning selected once its LoRAs are known absent.
  $effect(() => { if (!lightningAvailable && recipe === "lightning") recipe = "normal"; });
  // Re-seed the sampler knobs when the recipe changes (lightning = 4-step / cfg 1).
  $effect(() => {
    if (recipe !== lastRecipe) { lastRecipe = recipe; seedRecipeDefaults(recipe); }
  });

  let rd = $derived(recipeDefaults?.[recipe] || {});

  let phase = $derived(progress?.phase || null);
  let running = $derived(phase === "building" || phase === "queueing" || phase === "running");
  let done = $derived(phase === "done");
  let pct = $derived(progress?.max ? Math.round((progress.value / progress.max) * 100) : 0);

  const editorModelInfo = () => modelInfo || null;
  function prefill() { return `\nNegative Prompt: ${WAN_NEG}`; }

  // Same use:action pattern as InpaintModal — mounts the CM6 editor while the
  // modal is open, mirrors its text into promptText, and tears down on close.
  function promptEditor(node) {
    let disposed = false, view = null;
    (async () => {
      if (!mountPromptEditor) return;
      const v = await mountPromptEditor(node, prefill(), (text) => { promptText = text; }, editorModelInfo);
      if (disposed) { v?.destroy?.(); return; }
      view = v; promptEditorView = v;
    })().catch((e) => console.error("[Extend] prompt editor mount failed", e));
    return { destroy() { disposed = true; view?.destroy?.(); if (promptEditorView === view) promptEditorView = null; } };
  }

  function currentPromptDoc() {
    if (promptEditorView) return promptEditorView.state.doc.toString();
    const neg = `Negative Prompt: ${WAN_NEG}`;
    return promptText.trim() ? `${promptText.trim()}\n\n${neg}` : neg;
  }

  function run() {
    if (running) return;
    onRun?.({
      promptDoc: currentPromptDoc(),
      stitch, recipe,
      width, height, length, outFps,
      steps, cfg, shift, sampler, scheduler,
      seed: seedFixed ? seed : undefined, // omit unless pinned — keeps template noise behaviour
    });
  }

  // Closing always lands on the latest result if one was rendered.
  function close() { if (done) onDone?.(); else onCancel?.(); }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="pcr-ext-overlay" onclick={(e) => { if (e.target === e.currentTarget && !running) close(); }}>
    <div class="pcr-ext-modal">
      <div class="pcr-ext-title">Extend Video</div>
      <div class="pcr-ext-sub">
        Renders the next clip continuing from this video's last frame{frameCount ? ` · ${frameCount} frames @ ${fps}fps` : ""}. Saved as a lineage child.
      </div>

      {#if lastFrameUrl}
        <div class="pcr-ext-frame">
          <img src={lastFrameUrl} alt="last frame" />
          <span>continues from here →</span>
        </div>
      {/if}

      <div class="pcr-ext-label">Speed</div>
      <div class="pcr-ext-recipe">
        <button
          class="pcr-ext-recipe-btn"
          class:active={recipe === "normal"}
          disabled={running}
          onclick={() => { recipe = "normal"; }}
        >
          <span class="pcr-ext-recipe-name">Normal <span class="pcr-ext-rec-dot" title="Recommended">●</span></span>
          <span class="pcr-ext-recipe-sub">20-step · best quality</span>
        </button>
        <button
          class="pcr-ext-recipe-btn"
          class:active={recipe === "lightning"}
          class:unavail={!lightningAvailable}
          disabled={running || !lightningAvailable}
          title={lightningAvailable ? "" : "Install the LightX2V speed LoRAs (~1.3 GB) to use Lightning"}
          onclick={() => { if (lightningAvailable) recipe = "lightning"; }}
        >
          <span class="pcr-ext-recipe-name">Lightning</span>
          <span class="pcr-ext-recipe-sub">{lightningAvailable ? "4-step · fast draft" : "speed LoRAs not installed"}</span>
        </button>
      </div>

      <label class="pcr-ext-label" for="pcr-ext-prompt">What happens next (motion / action)</label>
      {#if mountPromptEditor}
        <div class="pcr-ext-prompt pcr-ext-prompt-editor" use:promptEditor></div>
      {:else}
        <textarea
          id="pcr-ext-prompt"
          class="pcr-ext-prompt"
          bind:value={promptText}
          placeholder="e.g. the camera slowly pushes in as she turns her head and smiles"
          disabled={running}
        ></textarea>
      {/if}

      <label class="pcr-ext-stitch">
        <input type="checkbox" bind:checked={stitch} disabled={running} />
        Stitch into one continuous video (source + continuation)
      </label>

      <!-- Advanced: sophisticated knobs, collapsed by default (template-correct
           defaults; the green ● marks the recipe's recommended value). -->
      <button class="pcr-ext-adv-toggle" onclick={() => advancedOpen = !advancedOpen}>
        {advancedOpen ? "▾" : "▸"} Advanced
      </button>
      {#if advancedOpen}
        <div class="pcr-ext-adv">
          <div class="pcr-ext-row">
            <span class="pcr-ext-row-label">Length <small>{length} frames</small></span>
            <SettingsSlider min={5} max={161} step={4} value={length} savedValue={defaults?.length}
              onChange={(v) => length = v} />
          </div>
          <div class="pcr-ext-row">
            <span class="pcr-ext-row-label">Output FPS <small>{outFps}</small></span>
            <SettingsSlider min={8} max={60} step={1} value={outFps} savedValue={16}
              onChange={(v) => outFps = v} />
          </div>
          <div class="pcr-ext-row">
            <span class="pcr-ext-row-label">Steps <small>{steps}</small></span>
            <SettingsSlider min={1} max={40} step={1} value={steps} savedValue={rd.steps}
              onChange={(v) => steps = v} />
          </div>
          <div class="pcr-ext-row">
            <span class="pcr-ext-row-label">CFG <small>{cfg}</small></span>
            <SettingsSlider min={1} max={8} step={0.1} value={cfg} savedValue={rd.cfg}
              onChange={(v) => cfg = v} />
          </div>
          <div class="pcr-ext-row">
            <span class="pcr-ext-row-label">Shift <small>{shift}</small></span>
            <SettingsSlider min={1} max={12} step={0.5} value={shift} savedValue={rd.shift}
              onChange={(v) => shift = v} />
          </div>
          <div class="pcr-ext-grid2">
            <label class="pcr-ext-field">
              <span>Sampler</span>
              <select bind:value={sampler} disabled={running}>
                {#each SAMPLERS as s}<option value={s}>{s}</option>{/each}
              </select>
            </label>
            <label class="pcr-ext-field">
              <span>Scheduler</span>
              <select bind:value={scheduler} disabled={running}>
                {#each SCHEDULERS as s}<option value={s}>{s}</option>{/each}
              </select>
            </label>
          </div>
          <div class="pcr-ext-grid2">
            <label class="pcr-ext-field">
              <span>Seed</span>
              <input type="number" bind:value={seed} disabled={running || !seedFixed} />
            </label>
            <label class="pcr-ext-field pcr-ext-field-check">
              <input type="checkbox" bind:checked={seedFixed} disabled={running} />
              <span>Fix seed</span>
            </label>
          </div>
        </div>
      {/if}

      {#if progress}
        <div class="pcr-ext-progress">
          {#if phase === "error"}
            <div class="pcr-ext-err">⚠ {progress.message || "render failed"}</div>
          {:else if done}
            <div class="pcr-ext-done">✓ Continuation rendered. Adjust and Run Again, or Done to view it.</div>
            {#if progress.resultUrl}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video class="pcr-ext-result" src={progress.resultUrl} controls autoplay loop muted></video>
            {/if}
          {:else}
            <div class="pcr-ext-bar"><div class="pcr-ext-fill" style="width:{pct}%"></div></div>
            <div class="pcr-ext-phase">{phase}{progress.max ? ` · ${pct}%` : "…"}</div>
            {#if progress.previewUrl}
              <img class="pcr-ext-preview" src={progress.previewUrl} alt="preview" />
            {/if}
          {/if}
        </div>
      {/if}

      <div class="pcr-ext-actions">
        {#if running}
          <button class="pcr-ext-btn" onclick={() => onCancel?.()}>Cancel</button>
        {:else if done}
          <button class="pcr-ext-btn" onclick={() => onDone?.()}>Done</button>
          <button class="pcr-ext-btn pcr-ext-primary" onclick={run}>Run Again</button>
        {:else}
          <button class="pcr-ext-btn" onclick={() => onCancel?.()}>Close</button>
          <button class="pcr-ext-btn pcr-ext-primary" onclick={run}>Extend</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .pcr-ext-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center; z-index: 10011;
  }
  .pcr-ext-modal {
    background: #1e1e1e; border: 1px solid #444; border-radius: 8px;
    padding: 20px 24px; min-width: 380px; max-width: 480px;
    max-height: 88vh; overflow-y: auto;
  }
  .pcr-ext-title { font-size: 15px; font-weight: 600; color: #eee; margin-bottom: 4px; }
  .pcr-ext-sub { font-size: 11px; color: #888; margin-bottom: 14px; line-height: 1.4; }
  .pcr-ext-frame { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .pcr-ext-frame img { width: 96px; height: 96px; object-fit: cover; border-radius: 4px; border: 1px solid #333; }
  .pcr-ext-frame span { font-size: 11px; color: #777; }
  .pcr-ext-label { display: block; font-size: 11px; color: #aaa; margin-bottom: 5px; }
  .pcr-ext-recipe { display: flex; gap: 8px; margin-bottom: 14px; }
  .pcr-ext-recipe-btn {
    flex: 1; display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
    padding: 8px 10px; background: #161616; border: 1px solid #444; border-radius: 4px;
    color: #ddd; cursor: pointer; text-align: left; transition: border-color 0.15s, background 0.15s;
  }
  .pcr-ext-recipe-btn:hover:not(:disabled) { border-color: #666; }
  .pcr-ext-recipe-btn.active { border-color: #4fc3f7; background: #15242b; }
  .pcr-ext-recipe-btn.unavail { opacity: 0.5; cursor: not-allowed; }
  .pcr-ext-recipe-btn:disabled { cursor: default; }
  .pcr-ext-recipe-name { font-size: 12px; font-weight: 600; }
  .pcr-ext-recipe-sub { font-size: 10px; color: #888; }
  .pcr-ext-rec-dot { color: #4caf50; font-size: 9px; vertical-align: middle; }
  .pcr-ext-prompt {
    width: 100%; box-sizing: border-box; min-height: 70px; resize: vertical;
    background: #161616; border: 1px solid #444; border-radius: 4px; color: #ddd;
    font-size: 12px; padding: 8px; font-family: inherit;
  }
  .pcr-ext-prompt:focus { outline: none; border-color: #4fc3f7; }
  .pcr-ext-prompt-editor { padding: 0; overflow: hidden; min-height: 84px; resize: none; }
  .pcr-ext-stitch { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #aaa; margin-top: 10px; cursor: pointer; }
  .pcr-ext-adv-toggle {
    margin-top: 12px; background: none; border: none; color: #8bd5f5; font-size: 11px;
    cursor: pointer; padding: 2px 0;
  }
  .pcr-ext-adv { margin-top: 8px; display: flex; flex-direction: column; gap: 10px; }
  .pcr-ext-row { display: flex; flex-direction: column; gap: 4px; }
  .pcr-ext-row-label { font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
  .pcr-ext-row-label small { color: #6cc; }
  .pcr-ext-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .pcr-ext-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #aaa; }
  .pcr-ext-field select, .pcr-ext-field input[type="number"] {
    background: #161616; border: 1px solid #444; border-radius: 4px; color: #ddd;
    font-size: 12px; padding: 5px 6px; font-family: inherit;
  }
  .pcr-ext-field-check { flex-direction: row; align-items: center; gap: 6px; align-self: end; padding-bottom: 6px; }
  .pcr-ext-progress { margin-top: 12px; }
  .pcr-ext-bar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
  .pcr-ext-fill { height: 100%; background: #4fc3f7; border-radius: 3px; transition: width 0.3s; }
  .pcr-ext-phase { font-size: 11px; color: #aaa; margin-top: 6px; text-transform: capitalize; }
  .pcr-ext-preview, .pcr-ext-result { width: 100%; margin-top: 8px; border-radius: 4px; max-height: 240px; }
  .pcr-ext-err { font-size: 12px; color: #f44336; }
  .pcr-ext-done { font-size: 12px; color: #4caf50; margin-bottom: 6px; }
  .pcr-ext-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .pcr-ext-btn {
    padding: 6px 16px; font-size: 12px; border: 1px solid #555; border-radius: 4px;
    background: transparent; color: #ccc; cursor: pointer;
  }
  .pcr-ext-btn:hover { background: rgba(255,255,255,0.08); }
  .pcr-ext-btn:disabled { opacity: 0.5; cursor: default; }
  .pcr-ext-primary { background: #4fc3f7; color: #111; border-color: #4fc3f7; }
  .pcr-ext-primary:hover { background: #39b0e4; }
  .pcr-ext-primary:disabled { background: #2a7a9e; }
</style>
