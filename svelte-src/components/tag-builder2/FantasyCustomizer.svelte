<script>
  // FantasyCustomizer — shape / color / type modifiers for a fantasy
  // appearance chip (ears, tail, wings, horns, etc.). Mirrors the v1
  // FantasyCustomizer.svelte from tag-builder/. Filters out modifier
  // options whose tag already appears in the feature tag — picking the
  // "cat" type for "cat_ears" would emit redundant "cat cat_ears", so
  // those rows hide themselves.

  let {
    item,                // { item_tag, display_name, base_tags, base_natlang, item_group }
    data = null,         // { shapes, colors, types } — when null, self-fetches
    initial = null,      // { shape, color, type } when re-editing
    isNaturalMode = false, // current output mode (declared so the parent can pass it through)
    onConfirm = () => {},
    onCancel = () => {},
  } = $props();

  // Local self-fetched copy if parent didn't supply one. Either way, the
  // render path reads from `vocab`.
  let fetched = $state(null);
  let loading = $state(!data);
  let vocab = $derived(data || fetched);

  $effect(() => {
    if (data || fetched) return;
    (async () => {
      try {
        const res = await fetch("/promptchain/fantasy/customizer-data");
        fetched = res.ok ? await res.json() : { shapes: [], colors: [], types: [] };
      } catch {
        fetched = { shapes: [], colors: [], types: [] };
      }
      loading = false;
    })();
  });

  let shape = $state(initial?.shape || "");
  let color = $state(initial?.color || "");
  let type  = $state(initial?.type  || "");
  let openRow = $state(null);

  let featureTag = $derived((item?.item_tag || "").toLowerCase());

  // Drop options whose tag is already embedded in the feature tag.
  // "cat_ears" already encodes type=cat; offering "cat" again would
  // produce "cat cat_ears" on emit.
  let filteredShapes = $derived(
    (vocab?.shapes || []).filter(s => !featureTag.includes(s.tag.toLowerCase()))
  );
  let filteredColors = $derived(
    (vocab?.colors || []).filter(c => !featureTag.includes(c.tag.toLowerCase()))
  );
  let filteredTypes = $derived(
    (vocab?.types  || []).filter(t => !featureTag.includes(t.tag.toLowerCase()))
  );

  let shapeOpt = $derived((vocab?.shapes || []).find(s => s.tag === shape) || null);
  let colorOpt = $derived((vocab?.colors || []).find(c => c.tag === color) || null);
  let typeOpt  = $derived((vocab?.types  || []).find(t => t.tag === type)  || null);

  const COLOR_HEX = {
    burgundy: "#800020", wine: "#722f37", rose: "#ff66cc", blush: "#de5d83",
    coral: "#ff7f50", salmon: "#fa8072", peach: "#ffcba4", mustard: "#ffdb58",
    olive: "#808000", sage: "#9caf88", forest: "#228b22", mint: "#98ff98",
    teal: "#008080", turquoise: "#40e0d0", navy: "#000080", royal: "#4169e1",
    cobalt: "#0047ab", indigo: "#4b0082", plum: "#8e4585", lavender: "#e6e6fa",
    lilac: "#c8a2c8", cream: "#ffe69f", beige: "#f5f5dc", tan: "#d2b48c",
    khaki: "#c3b091", bronze: "#cd7f32", copper: "#b87333", rust: "#b7410e",
    chocolate: "#7b3f00", charcoal: "#36454f", brown: "#5d2d19",
    grey: "#636363", gray: "#636363",
    multicolored: "linear-gradient(90deg,#ff5,#5f5,#5ff,#55f,#f5f)",
    gradient: "linear-gradient(90deg,#7c3aed,#22d3ee)",
    "two-tone": "linear-gradient(90deg,#000 50%,#fff 50%)",
    striped: "repeating-linear-gradient(45deg,#444 0 4px,#888 4px 8px)",
  };
  function colorSwatch(tag) {
    if (!tag) return "transparent";
    return COLOR_HEX[tag] || tag;
  }

  // Preview: "<shape> <color> <type> <feature>" with empty parts skipped.
  let preview = $derived.by(() => {
    const parts = [];
    if (shapeOpt?.base_tags) parts.push(shapeOpt.base_tags.split(",")[0].trim());
    if (colorOpt?.base_tags) parts.push(colorOpt.base_tags.split(",")[0].trim());
    if (typeOpt?.base_tags)  parts.push(typeOpt.base_tags.split(",")[0].trim());
    parts.push((item?.display_name || item?.item_tag || "").toLowerCase());
    return parts.join(" ");
  });

  let isCustomized = $derived(!!shape || !!color || !!type);

  function pickRow(row, value) {
    if (row === "shape") shape = value;
    else if (row === "color") color = value;
    else if (row === "type") type = value;
    openRow = null;
  }

  function clearRow(row) {
    if (row === "shape") shape = "";
    else if (row === "color") color = "";
    else if (row === "type") type = "";
  }

  function handleConfirm() {
    onConfirm({
      modifiers: isCustomized ? {
        shape: shape || null,
        color: color || null,
        type:  type  || null,
      } : null,
    });
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel();
  }
  function handleKeydown(e) {
    if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
    else if (e.key === "Enter" && openRow === null) { e.stopPropagation(); handleConfirm(); }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="pcr-atb2-fc-overlay" onclick={handleOverlayClick} onkeydown={handleKeydown}>
  <div class="pcr-atb2-fc-modal" onclick={(e) => e.stopPropagation()}>
    <div class="pcr-atb2-fc-header">
      <span class="pcr-atb2-fc-title">Customize <strong>{item.display_name || item.item_tag}</strong></span>
      <button class="pcr-atb2-fc-close" onclick={onCancel} aria-label="Close">&times;</button>
    </div>

    <div class="pcr-atb2-fc-body">

      {#if loading && !vocab}
        <div class="pcr-atb2-fc-empty">Loading…</div>
      {:else}

      {#if filteredShapes.length}
        <!-- SHAPE -->
        <div class="pcr-atb2-fc-row" class:open={openRow === "shape"}>
          <button type="button" class="pcr-atb2-fc-rowbtn" onclick={() => openRow = openRow === "shape" ? null : "shape"}>
            <span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-shape" aria-hidden="true">◇</span>
            <span class="pcr-atb2-fc-rowlabel">{shapeOpt?.display || "Shape"}</span>
            {#if shape}
              <button class="pcr-atb2-fc-rowclear" onclick={(e) => { e.stopPropagation(); clearRow("shape"); }} title="Clear">&times;</button>
            {/if}
            <span class="pcr-atb2-fc-chev">▾</span>
          </button>
          {#if openRow === "shape"}
            <div class="pcr-atb2-fc-popover">
              <div class="pcr-atb2-fc-popitem" class:active={!shape} onclick={() => pickRow("shape", "")}>
                <span class="pcr-atb2-fc-icon-bullet"></span>
                <span>None</span>
              </div>
              {#each filteredShapes as s}
                <div class="pcr-atb2-fc-popitem" class:active={s.tag === shape} onclick={() => pickRow("shape", s.tag)}>
                  <span class="pcr-atb2-fc-icon-bullet"></span>
                  <span>{s.display}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if filteredColors.length}
        <!-- COLOR -->
        <div class="pcr-atb2-fc-row" class:open={openRow === "color"}>
          <button type="button" class="pcr-atb2-fc-rowbtn" onclick={() => openRow = openRow === "color" ? null : "color"}>
            <span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-color" style="background:{colorSwatch(color)}"></span>
            <span class="pcr-atb2-fc-rowlabel">{colorOpt?.display || "Color"}</span>
            {#if color}
              <button class="pcr-atb2-fc-rowclear" onclick={(e) => { e.stopPropagation(); clearRow("color"); }} title="Clear">&times;</button>
            {/if}
            <span class="pcr-atb2-fc-chev">▾</span>
          </button>
          {#if openRow === "color"}
            <div class="pcr-atb2-fc-popover">
              <div class="pcr-atb2-fc-popitem" class:active={!color} onclick={() => pickRow("color", "")}>
                <span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-color" style="background:transparent;border:1px dashed var(--pcr-border)"></span>
                <span>None</span>
              </div>
              {#each filteredColors as c}
                <div class="pcr-atb2-fc-popitem" class:active={c.tag === color} onclick={() => pickRow("color", c.tag)}>
                  <span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-color" style="background:{colorSwatch(c.tag)}"></span>
                  <span>{c.display}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if filteredTypes.length}
        <!-- TYPE -->
        <div class="pcr-atb2-fc-row" class:open={openRow === "type"}>
          <button type="button" class="pcr-atb2-fc-rowbtn" onclick={() => openRow = openRow === "type" ? null : "type"}>
            <span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-type" aria-hidden="true">✦</span>
            <span class="pcr-atb2-fc-rowlabel">{typeOpt?.display || "Type"}</span>
            {#if type}
              <button class="pcr-atb2-fc-rowclear" onclick={(e) => { e.stopPropagation(); clearRow("type"); }} title="Clear">&times;</button>
            {/if}
            <span class="pcr-atb2-fc-chev">▾</span>
          </button>
          {#if openRow === "type"}
            <div class="pcr-atb2-fc-popover">
              <div class="pcr-atb2-fc-popitem" class:active={!type} onclick={() => pickRow("type", "")}>
                <span class="pcr-atb2-fc-icon-bullet"></span>
                <span>None</span>
              </div>
              {#each filteredTypes as t}
                <div class="pcr-atb2-fc-popitem" class:active={t.tag === type} onclick={() => pickRow("type", t.tag)}>
                  <span class="pcr-atb2-fc-icon-bullet"></span>
                  <span>{t.display}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if !filteredShapes.length && !filteredColors.length && !filteredTypes.length}
        <div class="pcr-atb2-fc-empty">No modifiers available for this feature.</div>
      {/if}

      <div class="pcr-atb2-fc-preview">
        <div class="pcr-atb2-fc-preview-label">Preview</div>
        <div class="pcr-atb2-fc-preview-text">{preview}</div>
      </div>

      {/if}

    </div>

    <div class="pcr-atb2-fc-footer">
      <button class="pcr-atb2-fc-btn pcr-atb2-fc-cancel" onclick={onCancel}>Cancel</button>
      <button class="pcr-atb2-fc-btn pcr-atb2-fc-ok" onclick={handleConfirm}>Apply</button>
    </div>
  </div>
</div>

<style>
  .pcr-atb2-fc-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 100070; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .pcr-atb2-fc-modal { background: var(--pcr-panel, #1a1a1f); color: var(--pcr-text, #e6e6e6); border: 1px solid var(--pcr-border, #2a2a32); border-radius: 10px; width: 360px; max-width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5); }
  .pcr-atb2-fc-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--pcr-border, #2a2a32); }
  .pcr-atb2-fc-title { font-size: 14px; }
  .pcr-atb2-fc-title strong { color: #b59cff; font-weight: 600; }
  .pcr-atb2-fc-close { background: transparent; border: 0; color: inherit; font-size: 22px; line-height: 1; cursor: pointer; padding: 0 6px; }
  .pcr-atb2-fc-body { padding: 14px; display: flex; flex-direction: column; gap: 8px; overflow: visible; }
  .pcr-atb2-fc-empty { padding: 18px 4px; text-align: center; color: #888; font-size: 12px; }
  .pcr-atb2-fc-row { position: relative; }
  .pcr-atb2-fc-rowbtn { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--pcr-border, #2a2a32); border-radius: 8px; color: inherit; cursor: pointer; text-align: left; transition: background 0.1s; }
  .pcr-atb2-fc-rowbtn:hover { background: rgba(255,255,255,0.05); }
  .pcr-atb2-fc-row.open .pcr-atb2-fc-rowbtn { border-color: #7c3aed; }
  .pcr-atb2-fc-rowlabel { flex: 1 1 auto; font-size: 13px; }
  .pcr-atb2-fc-rowclear { background: transparent; border: 0; color: #888; font-size: 16px; line-height: 1; cursor: pointer; padding: 0 4px; }
  .pcr-atb2-fc-rowclear:hover { color: #e6e6e6; }
  .pcr-atb2-fc-chev { color: #888; font-size: 12px; }
  .pcr-atb2-fc-icon { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; font-size: 13px; }
  .pcr-atb2-fc-icon-color { border: 1px solid rgba(255,255,255,0.15); }
  .pcr-atb2-fc-icon-shape { color: #facc15; }
  .pcr-atb2-fc-icon-type { color: #7dd3fc; }
  .pcr-atb2-fc-icon-bullet { width: 6px; height: 6px; border-radius: 50%; background: #555; flex: 0 0 auto; margin-left: 8px; }
  .pcr-atb2-fc-popover { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--pcr-panel, #1a1a1f); border: 1px solid var(--pcr-border, #2a2a32); border-radius: 8px; max-height: 280px; overflow-y: auto; z-index: 5; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); }
  .pcr-atb2-fc-popitem { display: flex; align-items: center; gap: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
  .pcr-atb2-fc-popitem:hover { background: rgba(124, 58, 237, 0.15); }
  .pcr-atb2-fc-popitem.active { background: rgba(124, 58, 237, 0.25); color: #c4b5fd; }
  .pcr-atb2-fc-preview { margin-top: 10px; padding: 10px 12px; background: rgba(124, 58, 237, 0.08); border: 1px solid rgba(124, 58, 237, 0.2); border-radius: 8px; }
  .pcr-atb2-fc-preview-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #888; margin-bottom: 4px; }
  .pcr-atb2-fc-preview-text { font-size: 13px; line-height: 1.4; }
  .pcr-atb2-fc-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--pcr-border, #2a2a32); }
  .pcr-atb2-fc-btn { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--pcr-border, #2a2a32); background: rgba(255,255,255,0.04); color: inherit; cursor: pointer; font-size: 13px; }
  .pcr-atb2-fc-cancel:hover { background: rgba(255,255,255,0.08); }
  .pcr-atb2-fc-ok { background: #7c3aed; border-color: #7c3aed; color: white; }
  .pcr-atb2-fc-ok:hover { background: #8b5cf6; }
</style>
