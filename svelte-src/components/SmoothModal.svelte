<script>
  // "Smooth Video" modal — RIFE frame interpolation (2x/3x/4x fps) on the source
  // clip. Background graph (smooth-background.js); result records as a lineage
  // child. Multiplier is primary; model/scale/quality knobs live under Advanced.

  let {
    open = false,
    fps = 16,
    frameCount = 0,
    progress = null,
    onRun,
    onDone,        // () => land on the result + close (the "jump")
    onCancel,
  } = $props();

  // Newer arches first; rife49 is the proven default and the one bundled. A ckpt
  // that isn't on disk auto-downloads on first render.
  const CKPTS = ["rife49.pth", "rife426.pth", "rife417.pth", "rife47.pth"];
  const SCALES = [0.25, 0.5, 1.0, 2.0, 4.0];

  let mult = $state(2);
  let advancedOpen = $state(false);
  let ckptName = $state("rife49.pth");
  let scaleFactor = $state(1.0);   // <1 for high-res (less VRAM); 1.0 default
  let ensemble = $state(true);     // higher quality, slower
  let fastMode = $state(true);     // faster, slight quality trade-off

  let primed = false;
  $effect(() => {
    if (open && !primed) {
      mult = 2; advancedOpen = false; ckptName = "rife49.pth";
      scaleFactor = 1.0; ensemble = true; fastMode = true; primed = true;
    }
    if (!open) primed = false;
  });

  let phase = $derived(progress?.phase || null);
  let running = $derived(phase === "building" || phase === "queueing" || phase === "running");
  let done = $derived(phase === "done");
  let pct = $derived(progress?.max ? Math.round((progress.value / progress.max) * 100) : 0);
  // RIFE outputs (frames-1)*mult + 1 frames; close enough to show the gist.
  let outFrames = $derived(frameCount ? (frameCount - 1) * mult + 1 : 0);

  function run() {
    if (running) return;
    onRun?.({ multiplier: mult, ckptName, scaleFactor, ensemble, fastMode });
  }
  function close() { if (done) onDone?.(); else onCancel?.(); }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="pcr-sm-overlay" onclick={(e) => { if (e.target === e.currentTarget && !running) close(); }}>
    <div class="pcr-sm-modal">
      <div class="pcr-sm-title">Smooth Video</div>
      <div class="pcr-sm-sub">
        Adds in-between frames with RIFE for smoother motion. {fps} → {fps * mult} fps{frameCount ? ` · ${frameCount} → ${outFrames} frames` : ""}. Saved as a lineage child.
      </div>

      <div class="pcr-sm-label">Interpolation</div>
      <div class="pcr-sm-mults">
        {#each [2, 3, 4] as m}
          <button class="pcr-sm-mult" class:pcr-sm-active={mult === m} disabled={running} onclick={() => { mult = m; }}>{m}×</button>
        {/each}
      </div>

      <button class="pcr-sm-adv-toggle" onclick={() => advancedOpen = !advancedOpen}>
        {advancedOpen ? "▾" : "▸"} Advanced
      </button>
      {#if advancedOpen}
        <div class="pcr-sm-adv">
          <label class="pcr-sm-field">
            <span>RIFE model</span>
            <select bind:value={ckptName} disabled={running}>
              {#each CKPTS as c}<option value={c}>{c.replace(".pth", "")}</option>{/each}
            </select>
          </label>
          <label class="pcr-sm-field">
            <span>Scale <small>lower = less VRAM (high-res)</small></span>
            <select bind:value={scaleFactor} disabled={running}>
              {#each SCALES as s}<option value={s}>{s}×</option>{/each}
            </select>
          </label>
          <label class="pcr-sm-check">
            <input type="checkbox" bind:checked={ensemble} disabled={running} />
            <span>Ensemble <small>higher quality, slower</small></span>
          </label>
          <label class="pcr-sm-check">
            <input type="checkbox" bind:checked={fastMode} disabled={running} />
            <span>Fast mode <small>faster, slight quality trade-off</small></span>
          </label>
        </div>
      {/if}

      {#if progress}
        <div class="pcr-sm-progress">
          {#if phase === "error"}
            <div class="pcr-sm-err">⚠ {progress.message || "render failed"}</div>
          {:else if done}
            <div class="pcr-sm-done">✓ Smoothed. Adjust and Run Again, or Done to view it.</div>
            {#if progress.resultUrl}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video class="pcr-sm-result" src={progress.resultUrl} controls autoplay loop muted></video>
            {/if}
          {:else}
            <div class="pcr-sm-bar"><div class="pcr-sm-fill" style="width:{pct}%"></div></div>
            <div class="pcr-sm-phase">{phase}{progress.max ? ` · ${pct}%` : "…"}</div>
            {#if progress.previewUrl}
              <img class="pcr-sm-preview" src={progress.previewUrl} alt="preview" />
            {/if}
          {/if}
        </div>
      {/if}

      <div class="pcr-sm-actions">
        {#if running}
          <button class="pcr-sm-btn" onclick={() => onCancel?.()}>Cancel</button>
        {:else if done}
          <button class="pcr-sm-btn" onclick={() => onDone?.()}>Done</button>
          <button class="pcr-sm-btn pcr-sm-primary" onclick={run}>Run Again</button>
        {:else}
          <button class="pcr-sm-btn" onclick={() => onCancel?.()}>Close</button>
          <button class="pcr-sm-btn pcr-sm-primary" onclick={run}>Smooth</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .pcr-sm-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center; z-index: 10011;
  }
  .pcr-sm-modal { background: #1e1e1e; border: 1px solid #444; border-radius: 8px; padding: 20px 24px; min-width: 360px; max-width: 460px; max-height: 88vh; overflow-y: auto; }
  .pcr-sm-title { font-size: 15px; font-weight: 600; color: #eee; margin-bottom: 4px; }
  .pcr-sm-sub { font-size: 11px; color: #888; margin-bottom: 14px; line-height: 1.4; }
  .pcr-sm-label { font-size: 11px; color: #aaa; margin-bottom: 6px; }
  .pcr-sm-mults { display: flex; gap: 8px; }
  .pcr-sm-mult {
    flex: 1; padding: 8px 0; border: 1px solid #555; border-radius: 4px; background: transparent;
    color: #ccc; font-size: 13px; cursor: pointer; transition: all 0.15s;
  }
  .pcr-sm-mult:hover { border-color: #888; color: #fff; }
  .pcr-sm-mult.pcr-sm-active { border-color: #4fc3f7; color: #4fc3f7; background: rgba(79,195,247,0.1); }
  .pcr-sm-adv-toggle { margin-top: 12px; background: none; border: none; color: #8bd5f5; font-size: 11px; cursor: pointer; padding: 2px 0; }
  .pcr-sm-adv { margin-top: 8px; display: flex; flex-direction: column; gap: 10px; }
  .pcr-sm-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #aaa; }
  .pcr-sm-field small, .pcr-sm-check small { color: #777; }
  .pcr-sm-field select {
    background: #161616; border: 1px solid #444; border-radius: 4px; color: #ddd;
    font-size: 12px; padding: 5px 6px; font-family: inherit;
  }
  .pcr-sm-check { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #aaa; cursor: pointer; }
  .pcr-sm-progress { margin-top: 14px; }
  .pcr-sm-bar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
  .pcr-sm-fill { height: 100%; background: #4fc3f7; border-radius: 3px; transition: width 0.3s; }
  .pcr-sm-phase { font-size: 11px; color: #aaa; margin-top: 6px; text-transform: capitalize; }
  .pcr-sm-preview, .pcr-sm-result { width: 100%; margin-top: 8px; border-radius: 4px; max-height: 240px; }
  .pcr-sm-err { font-size: 12px; color: #f44336; }
  .pcr-sm-done { font-size: 12px; color: #4caf50; margin-bottom: 6px; }
  .pcr-sm-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .pcr-sm-btn { padding: 6px 16px; font-size: 12px; border: 1px solid #555; border-radius: 4px; background: transparent; color: #ccc; cursor: pointer; }
  .pcr-sm-btn:hover { background: rgba(255,255,255,0.08); }
  .pcr-sm-btn:disabled { opacity: 0.5; cursor: default; }
  .pcr-sm-primary { background: #4fc3f7; color: #111; border-color: #4fc3f7; }
  .pcr-sm-primary:hover { background: #39b0e4; }
  .pcr-sm-primary:disabled { background: #2a7a9e; }
</style>
