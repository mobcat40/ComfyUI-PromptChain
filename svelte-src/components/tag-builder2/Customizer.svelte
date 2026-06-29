<script>
  // Customizer — modal for stacking modifiers (color/pattern/material/condition/focus)
  // on a clothing chip. Reuses the v1 endpoint /promptchain/clothing/customizer-data
  // so the modifier vocabulary stays in one place. Returns the picked modifier
  // tags + a derived display label so the caller can attach them to the slot
  // chip without rebuilding the phrase here.

  let {
    item,                // chip the user is customizing: { item_tag, display_name, base_tags, base_natlang, item_group }
    initial = null,      // { color, pattern, material, condition, focus } — pre-fill when editing
    isNaturalMode = false, // current output mode, so the preview + focus match what the parent emits
    onConfirm = () => {},
    onCancel = () => {},
  } = $props();

  let loading = $state(true);
  let data = $state(null);
  let color = $state(initial?.color || "");
  let pattern = $state(initial?.pattern || "solid");
  let material = $state(initial?.material || "");
  let condition = $state(initial?.condition || "default");
  let focus = $state(!!initial?.focus);

  let openRow = $state(null); // "color" | "pattern" | "material" | "condition" | null

  $effect(() => {
    fetchData();
  });

  async function fetchData() {
    try {
      const res = await fetch(`/promptchain/clothing/customizer-data?group=${encodeURIComponent(item.item_group || "")}`);
      data = res.ok ? await res.json() : { colors: [], patterns: [], materials: [], conditions: [] };
    } catch {
      data = { colors: [], patterns: [], materials: [], conditions: [] };
    }
    loading = false;
  }

  // CSS named-color fallback table for tags whose names aren't valid CSS color
  // identifiers. Add only when the tag name doesn't already render correctly.
  const COLOR_HEX = {
    burgundy: "#800020",
    wine: "#722f37",
    rose: "#ff66cc",
    blush: "#de5d83",
    coral: "#ff7f50",
    salmon: "#fa8072",
    peach: "#ffcba4",
    mustard: "#ffdb58",
    olive: "#808000",
    sage: "#9caf88",
    forest: "#228b22",
    mint: "#98ff98",
    teal: "#008080",
    turquoise: "#40e0d0",
    navy: "#000080",
    royal: "#4169e1",
    cobalt: "#0047ab",
    indigo: "#4b0082",
    plum: "#8e4585",
    lavender: "#e6e6fa",
    lilac: "#c8a2c8",
    cream: "#ffe69f",
    beige: "#f5f5dc",
    tan: "#d2b48c",
    khaki: "#c3b091",
    bronze: "#cd7f32",
    copper: "#b87333",
    rust: "#b7410e",
    chocolate: "#7b3f00",
    charcoal: "#36454f",
    brown: "#5d2d19",
    grey: "#636363",
    gray: "#636363",
  };

  function colorSwatch(tag) {
    if (!tag) return "transparent";
    return COLOR_HEX[tag] || tag;
  }

  function findOption(list, tag) {
    return (list || []).find(o => o.tag === tag);
  }

  let colorOpt    = $derived(findOption(data?.colors, color));
  let patternOpt  = $derived(findOption(data?.patterns, pattern));
  let materialOpt = $derived(findOption(data?.materials, material));
  let conditionOpt = $derived(findOption(data?.conditions, condition));

  let colorGroups = $derived.by(() => {
    if (!data?.colors) return [];
    const groups = {};
    for (const c of data.colors) {
      if (!groups[c.color_group]) groups[c.color_group] = [];
      groups[c.color_group].push(c);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a.toLowerCase() === "neutral") return -1;
      if (b.toLowerCase() === "neutral") return 1;
      return a.localeCompare(b);
    });
  });

  let patternGroups = $derived.by(() => {
    if (!data?.patterns) return [];
    const groups = {};
    for (const p of data.patterns) {
      if (!groups[p.pattern_group]) groups[p.pattern_group] = [];
      groups[p.pattern_group].push(p);
    }
    return Object.entries(groups);
  });

  let conditionGroups = $derived.by(() => {
    if (!data?.conditions) return [];
    const groups = {};
    for (const c of data.conditions) {
      if (!groups[c.condition_group]) groups[c.condition_group] = [];
      groups[c.condition_group].push(c);
    }
    return Object.entries(groups);
  });

  let preview = $derived.by(() => {
    if (!data) return (item.display_name || item.item_tag).toLowerCase();
    // Mirror the parent's buildModifiedPhrase so the preview matches what is
    // actually emitted: condition, color, pattern, material, then the item.
    const prefixes = [conditionOpt?.prefix, colorOpt?.prefix, patternOpt?.prefix, materialOpt?.prefix].filter(Boolean);
    if (!isNaturalMode) {
      // Tag mode: underscore-joined prefix slugs + item_tag. The focus
      // phrase is natural-language only and isn't part of the tag emit.
      const slug = (s) => s.replace(/\s+/g, "_");
      return [...prefixes.map(slug), item.item_tag || ""].filter(Boolean).join("_");
    }
    const phrase = [...prefixes, (item.display_name || item.item_tag).toLowerCase()].join(" ");
    return focus ? `${phrase}, presenting ${phrase} to viewer, ${phrase} focus` : phrase;
  });

  let isCustomized = $derived(
    !!color || (pattern && pattern !== "solid") || !!material || (condition && condition !== "default") || focus
  );

  function pickRow(row, value) {
    if (row === "color") color = value;
    else if (row === "pattern") pattern = value;
    else if (row === "material") material = value;
    else if (row === "condition") condition = value;
    openRow = null;
  }

  function clearRow(row) {
    if (row === "color") color = "";
    else if (row === "pattern") pattern = "solid";
    else if (row === "material") material = "";
    else if (row === "condition") condition = "default";
  }

  function handleConfirm() {
    onConfirm({
      modifiers: isCustomized ? {
        color: color || null,
        pattern: pattern && pattern !== "solid" ? pattern : null,
        material: material || null,
        condition: condition && condition !== "default" ? condition : null,
        focus: !!focus,
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
<div class="pcr-atb2-cust-overlay" onclick={handleOverlayClick} onkeydown={handleKeydown}>
  <div class="pcr-atb2-cust-modal" onclick={(e) => e.stopPropagation()}>
    <div class="pcr-atb2-cust-header">
      <span class="pcr-atb2-cust-title">Customize <strong>{item.display_name || item.item_tag}</strong></span>
      <button class="pcr-atb2-cust-close" onclick={onCancel} aria-label="Close">&times;</button>
    </div>

    {#if loading}
      <div class="pcr-atb2-cust-loading">Loading…</div>
    {:else}
      <div class="pcr-atb2-cust-body">

        <!-- COLOR -->
        <div class="pcr-atb2-cust-row" class:open={openRow === "color"}>
          <button
            class="pcr-atb2-cust-rowbtn"
            type="button"
            onclick={() => openRow = openRow === "color" ? null : "color"}
          >
            <span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color" style="background:{colorSwatch(color)}"></span>
            <span class="pcr-atb2-cust-rowlabel">{colorOpt?.display || "Color"}</span>
            {#if color}
              <button class="pcr-atb2-cust-rowclear" onclick={(e) => { e.stopPropagation(); clearRow("color"); }} title="Clear">&times;</button>
            {/if}
            <span class="pcr-atb2-cust-chev">▾</span>
          </button>
          {#if openRow === "color"}
            <div class="pcr-atb2-cust-popover">
              <div class="pcr-atb2-cust-popitem" class:active={!color} onclick={() => pickRow("color", "")}>
                <span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color" style="background:transparent;border:1px dashed var(--pcr-border)"></span>
                <span>None</span>
              </div>
              {#each colorGroups as [grp, colors]}
                <div class="pcr-atb2-cust-popgroup">{grp}</div>
                {#each colors as c}
                  <div class="pcr-atb2-cust-popitem" class:active={c.tag === color} onclick={() => pickRow("color", c.tag)}>
                    <span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color" style="background:{colorSwatch(c.tag)}"></span>
                    <span>{c.display}</span>
                  </div>
                {/each}
              {/each}
            </div>
          {/if}
        </div>

        <!-- PATTERN -->
        <div class="pcr-atb2-cust-row" class:open={openRow === "pattern"}>
          <button
            class="pcr-atb2-cust-rowbtn"
            type="button"
            onclick={() => openRow = openRow === "pattern" ? null : "pattern"}
          >
            <span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-pattern" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="16" height="16"><rect x="0" y="0" width="4" height="4" fill="currentColor"/><rect x="8" y="0" width="4" height="4" fill="currentColor"/><rect x="4" y="4" width="4" height="4" fill="currentColor"/><rect x="12" y="4" width="4" height="4" fill="currentColor"/><rect x="0" y="8" width="4" height="4" fill="currentColor"/><rect x="8" y="8" width="4" height="4" fill="currentColor"/><rect x="4" y="12" width="4" height="4" fill="currentColor"/><rect x="12" y="12" width="4" height="4" fill="currentColor"/></svg>
            </span>
            <span class="pcr-atb2-cust-rowlabel">{patternOpt?.display || "Solid / None"}</span>
            {#if pattern && pattern !== "solid"}
              <button class="pcr-atb2-cust-rowclear" onclick={(e) => { e.stopPropagation(); clearRow("pattern"); }} title="Reset">&times;</button>
            {/if}
            <span class="pcr-atb2-cust-chev">▾</span>
          </button>
          {#if openRow === "pattern"}
            <div class="pcr-atb2-cust-popover">
              {#each patternGroups as [grp, patterns]}
                <div class="pcr-atb2-cust-popgroup">{grp}</div>
                {#each patterns as p}
                  <div class="pcr-atb2-cust-popitem" class:active={p.tag === pattern} onclick={() => pickRow("pattern", p.tag)}>
                    <span class="pcr-atb2-cust-icon-bullet"></span>
                    <span>{p.display}</span>
                  </div>
                {/each}
              {/each}
            </div>
          {/if}
        </div>

        <!-- MATERIAL -->
        <div class="pcr-atb2-cust-row" class:open={openRow === "material"}>
          <button
            class="pcr-atb2-cust-rowbtn"
            type="button"
            onclick={() => openRow = openRow === "material" ? null : "material"}
          >
            <span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-material" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="M1 5 Q 4 2, 8 5 T 15 5"/>
                <path d="M1 11 Q 4 8, 8 11 T 15 11"/>
              </svg>
            </span>
            <span class="pcr-atb2-cust-rowlabel">{materialOpt?.display || "Material"}</span>
            {#if material}
              <button class="pcr-atb2-cust-rowclear" onclick={(e) => { e.stopPropagation(); clearRow("material"); }} title="Clear">&times;</button>
            {/if}
            <span class="pcr-atb2-cust-chev">▾</span>
          </button>
          {#if openRow === "material"}
            <div class="pcr-atb2-cust-popover">
              <div class="pcr-atb2-cust-popitem" class:active={!material} onclick={() => pickRow("material", "")}>
                <span class="pcr-atb2-cust-icon-bullet"></span>
                <span>None</span>
              </div>
              {#each (data?.materials || []) as m}
                <div class="pcr-atb2-cust-popitem" class:active={m.tag === material} onclick={() => pickRow("material", m.tag)}>
                  <span class="pcr-atb2-cust-icon-bullet"></span>
                  <span>{m.display}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- CONDITION -->
        <div class="pcr-atb2-cust-row" class:open={openRow === "condition"}>
          <button
            class="pcr-atb2-cust-rowbtn"
            type="button"
            onclick={() => openRow = openRow === "condition" ? null : "condition"}
          >
            <span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-condition" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                <polyline points="2,4 5,7 3,9 6,12 4,14"/>
                <polyline points="10,2 13,5 11,8 14,11 12,14"/>
              </svg>
            </span>
            <span class="pcr-atb2-cust-rowlabel">{conditionOpt?.display || "Default"}</span>
            {#if condition && condition !== "default"}
              <button class="pcr-atb2-cust-rowclear" onclick={(e) => { e.stopPropagation(); clearRow("condition"); }} title="Reset">&times;</button>
            {/if}
            <span class="pcr-atb2-cust-chev">▾</span>
          </button>
          {#if openRow === "condition"}
            <div class="pcr-atb2-cust-popover">
              {#each conditionGroups as [grp, conditions]}
                <div class="pcr-atb2-cust-popgroup">{grp}</div>
                {#each conditions as c}
                  <div class="pcr-atb2-cust-popitem" class:active={c.tag === condition} onclick={() => pickRow("condition", c.tag)}>
                    <span class="pcr-atb2-cust-icon-bullet"></span>
                    <span>{c.display}</span>
                  </div>
                {/each}
              {/each}
            </div>
          {/if}
        </div>

        <!-- FOCUS — natural-language only; the tag-mode emit has no focus phrase -->
        <label class="pcr-atb2-cust-focus" class:pcr-atb2-cust-focus-disabled={!isNaturalMode}>
          <input type="checkbox" bind:checked={focus} disabled={!isNaturalMode} />
          <span>Add focus tags</span>
          <span class="pcr-atb2-cust-focus-hint">{isNaturalMode ? "Camera focuses on this item" : "Natural-language mode only"}</span>
        </label>

        <div class="pcr-atb2-cust-preview">
          <div class="pcr-atb2-cust-preview-label">Preview</div>
          <div class="pcr-atb2-cust-preview-text">{preview}</div>
        </div>

      </div>

      <div class="pcr-atb2-cust-footer">
        <button class="pcr-atb2-cust-btn pcr-atb2-cust-cancel" onclick={onCancel}>Cancel</button>
        <button class="pcr-atb2-cust-btn pcr-atb2-cust-ok" onclick={handleConfirm}>Apply</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .pcr-atb2-cust-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 100070;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .pcr-atb2-cust-modal {
    background: var(--pcr-panel, #1a1a1f);
    color: var(--pcr-text, #e6e6e6);
    border: 1px solid var(--pcr-border, #2a2a32);
    border-radius: 10px;
    width: 360px;
    max-width: 100%;
    max-height: 90vh;
    display: flex; flex-direction: column;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  }
  .pcr-atb2-cust-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--pcr-border, #2a2a32);
  }
  .pcr-atb2-cust-title { font-size: 14px; }
  .pcr-atb2-cust-title strong { color: #b59cff; font-weight: 600; }
  .pcr-atb2-cust-close {
    background: transparent; border: 0; color: inherit;
    font-size: 22px; line-height: 1; cursor: pointer; padding: 0 6px;
  }
  .pcr-atb2-cust-loading { padding: 32px; text-align: center; color: #888; }
  .pcr-atb2-cust-body {
    padding: 14px;
    display: flex; flex-direction: column; gap: 8px;
    overflow-y: auto;
  }
  .pcr-atb2-cust-row { position: relative; }
  .pcr-atb2-cust-rowbtn {
    width: 100%;
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--pcr-border, #2a2a32);
    border-radius: 8px;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }
  .pcr-atb2-cust-rowbtn:hover { background: rgba(255,255,255,0.05); }
  .pcr-atb2-cust-row.open .pcr-atb2-cust-rowbtn {
    border-color: #7c3aed;
  }
  .pcr-atb2-cust-rowlabel {
    flex: 1 1 auto;
    font-size: 13px;
  }
  .pcr-atb2-cust-rowclear {
    background: transparent; border: 0; color: #888;
    font-size: 16px; line-height: 1; cursor: pointer; padding: 0 4px;
  }
  .pcr-atb2-cust-rowclear:hover { color: #e6e6e6; }
  .pcr-atb2-cust-chev { color: #888; font-size: 12px; }
  .pcr-atb2-cust-icon {
    width: 22px; height: 22px;
    border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 auto;
  }
  .pcr-atb2-cust-icon-color {
    border: 1px solid rgba(255,255,255,0.15);
  }
  .pcr-atb2-cust-icon-pattern { color: #cfd2d6; }
  .pcr-atb2-cust-icon-material { color: #7dd3fc; }
  .pcr-atb2-cust-icon-condition { color: #facc15; }
  .pcr-atb2-cust-icon-bullet {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #555;
    flex: 0 0 auto;
    margin-left: 8px;
  }
  .pcr-atb2-cust-popover {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    background: var(--pcr-panel, #1a1a1f);
    border: 1px solid var(--pcr-border, #2a2a32);
    border-radius: 8px;
    max-height: 280px;
    overflow-y: auto;
    z-index: 5;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .pcr-atb2-cust-popgroup {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #888;
    padding: 8px 12px 4px;
  }
  .pcr-atb2-cust-popitem {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
  }
  .pcr-atb2-cust-popitem:hover { background: rgba(124, 58, 237, 0.15); }
  .pcr-atb2-cust-popitem.active { background: rgba(124, 58, 237, 0.25); color: #c4b5fd; }
  .pcr-atb2-cust-focus {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 4px 0;
    font-size: 13px;
    cursor: pointer;
  }
  .pcr-atb2-cust-focus input { accent-color: #7c3aed; }
  .pcr-atb2-cust-focus-disabled { opacity: 0.5; cursor: default; }
  .pcr-atb2-cust-focus-hint {
    font-size: 11px; color: #888; margin-left: auto;
  }
  .pcr-atb2-cust-preview {
    margin-top: 10px;
    padding: 10px 12px;
    background: rgba(124, 58, 237, 0.08);
    border: 1px solid rgba(124, 58, 237, 0.2);
    border-radius: 8px;
  }
  .pcr-atb2-cust-preview-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px;
    color: #888; margin-bottom: 4px;
  }
  .pcr-atb2-cust-preview-text { font-size: 13px; line-height: 1.4; }
  .pcr-atb2-cust-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 14px;
    border-top: 1px solid var(--pcr-border, #2a2a32);
  }
  .pcr-atb2-cust-btn {
    padding: 8px 14px;
    border-radius: 6px;
    border: 1px solid var(--pcr-border, #2a2a32);
    background: rgba(255,255,255,0.04);
    color: inherit;
    cursor: pointer;
    font-size: 13px;
  }
  .pcr-atb2-cust-cancel:hover { background: rgba(255,255,255,0.08); }
  .pcr-atb2-cust-ok {
    background: #7c3aed; border-color: #7c3aed; color: white;
  }
  .pcr-atb2-cust-ok:hover { background: #8b5cf6; }
</style>
