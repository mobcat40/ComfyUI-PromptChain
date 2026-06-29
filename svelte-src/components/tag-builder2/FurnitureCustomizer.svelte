<script>
  // PropsCustomizer (filename historically `FurnitureCustomizer`) —
  // material/pattern/color (+ optional action verb) for a prop chip.
  // Routes contextually: with an active subject, the verb dropdown
  // produces a compound interaction chip ("sitting on a wooden chair",
  // "wielding a steel sword"). Without one, the chip is a standalone
  // scene element ("a wooden chair", "a steel sword").
  //
  // Materials/patterns/colors only show when item.is_customizable. In the
  // current data that means furniture items only — other props (food,
  // weapons, tech, etc.) just pick a verb.
  //
  // The server is the source of truth for assembly (color+pattern+material
  // prefix-chain + action verb), so confirm fires a /promptchain/props/assemble
  // request and the returned tags/natlang are baked into the chip. That keeps
  // the emit path on the parent unchanged — chips just carry pre-built strings.

  let {
    item,                  // { item_tag, display_name, item_group(=category), base_tags, base_natlang, is_customizable, subCategory }
    materials,             // furniture_materials rows
    patterns,              // furniture_patterns rows
    colors,                // furniture_colors rows
    actions,               // full prop_actions list; filtered per item.category here
    actionOverrides = {},  // { prop_tag: [action_tag, ...] } — narrows verbs when present
    contextSubject = null, // null = scene scope; truthy = subject interaction
    initial = null,        // { material, pattern, color, action } when editing
    isNaturalMode = false, // current output mode — preview shows tag vs natlang form to match emit
    onConfirm = () => {},
    onCancel = () => {},
  } = $props();

  let material = $state(initial?.material || "");
  let pattern = $state(initial?.pattern || "");
  let color = $state(initial?.color || "");
  let action = $state(initial?.action || "");
  let openRow = $state(null);
  let previewTag = $state("");
  let previewNat = $state("");
  // Starts true so the OK button stays disabled until the first /assemble
  // round-trip settles — otherwise the user could confirm before
  // previewTag/previewNat are populated and the chip would commit with
  // empty base_tags / base_natlang.
  let assembling = $state(true);

  // Modifier rows only render for is_customizable props (currently
  // furniture-only). Material rows that need a fabric vocab don't make
  // sense for a sword or an apple.
  let isCustomizable = $derived(!!item?.is_customizable);

  // Per-prop action override beats category-level matching. If the prop's
  // override list is non-empty, only those action_tags are offered.
  let validActions = $derived.by(() => {
    if (!item) return [];
    const override = actionOverrides?.[item.item_tag];
    const cat = item.item_group || "";
    return (actions || []).filter(a => {
      if (Array.isArray(override) && override.length) return override.includes(a.action_tag);
      const cc = a.compatible_categories;
      return Array.isArray(cc) ? cc.includes(cat) : false;
    });
  });

  // Materials only valid for this item's furniture sub-category (seating/
  // sleeping/etc.). Non-customizable props skip the row entirely.
  let validMaterials = $derived.by(() => {
    if (!isCustomizable) return [];
    const sub = item?.subCategory || "";
    if (!sub) return [];
    return (materials || []).filter(m => {
      const cc = (m.compatible_categories || "").split(",").map(s => s.trim());
      return cc.includes(sub);
    });
  });

  let materialOpt = $derived((validMaterials || []).find(m => m.tag === material) || null);
  let patternEnabled = $derived(!!materialOpt && (materialOpt.supports_patterns === 1 || materialOpt.supports_patterns === true));
  let patternOpt = $derived((patterns || []).find(p => p.tag === pattern) || null);
  let colorOpt = $derived((colors || []).find(c => c.tag === color) || null);
  let actionOpt = $derived((validActions || []).find(a => a.action_tag === action) || null);

  let colorGroups = $derived.by(() => {
    const groups = {};
    for (const c of colors || []) {
      if (!groups[c.color_group]) groups[c.color_group] = [];
      groups[c.color_group].push(c);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a.toLowerCase() === "neutral") return -1;
      if (b.toLowerCase() === "neutral") return 1;
      return a.localeCompare(b);
    });
  });

  // When material loses pattern support, clear the pattern.
  $effect(() => {
    if (!patternEnabled && pattern && pattern !== "solid") pattern = "";
  });

  $effect(() => {
    const _m = material; const _p = pattern; const _c = color; const _a = action;
    refreshPreview();
  });

  async function refreshPreview() {
    if (!item) return;
    assembling = true;
    try {
      const body = { prop: item.item_tag };
      if (material) body.material = material;
      if (pattern && pattern !== "solid") body.pattern = pattern;
      if (color) body.color = color;
      if (contextSubject && action) body.action = action;
      const res = await fetch("/promptchain/props/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        previewTag = data.tags || "";
        previewNat = data.natlang || "";
      }
    } catch (e) {
      console.error("[FurnitureCustomizer] preview error", e);
    } finally {
      assembling = false;
    }
  }

  function pickRow(row, value) {
    if (row === "material") material = value;
    else if (row === "pattern") pattern = value;
    else if (row === "color") color = value;
    else if (row === "action") action = value;
    openRow = null;
  }

  function clearRow(row) {
    if (row === "material") material = "";
    else if (row === "pattern") pattern = "";
    else if (row === "color") color = "";
    else if (row === "action") action = "";
  }

  const COLOR_HEX = {
    burgundy: "#800020", wine: "#722f37", rose: "#ff66cc", blush: "#de5d83",
    coral: "#ff7f50", salmon: "#fa8072", peach: "#ffcba4", mustard: "#ffdb58",
    olive: "#808000", sage: "#9caf88", forest: "#228b22", mint: "#98ff98",
    teal: "#008080", turquoise: "#40e0d0", navy: "#000080", royal_blue: "#4169e1",
    cobalt: "#0047ab", indigo: "#4b0082", plum: "#8e4585", lavender: "#e6e6fa",
    lilac: "#c8a2c8", cream: "#ffe69f", beige: "#f5f5dc", tan: "#d2b48c",
    khaki: "#c3b091", bronze: "#cd7f32", copper: "#b87333", rust: "#b7410e",
    chocolate: "#7b3f00", charcoal: "#36454f", brown: "#5d2d19", grey: "#636363",
    gray: "#636363", crimson: "#dc143c",
  };
  function colorSwatch(tag) {
    if (!tag) return "transparent";
    return COLOR_HEX[tag] || tag;
  }

  function handleConfirm() {
    onConfirm({
      material: material || null,
      pattern: pattern && pattern !== "solid" ? pattern : null,
      color: color || null,
      action: contextSubject ? (action || null) : null,
      assembled: { tags: previewTag, natlang: previewNat },
      parts: {
        materialOpt, patternOpt, colorOpt, actionOpt,
      },
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
      <span class="pcr-atb2-cust-title">
        {contextSubject ? `${contextSubject.name} interacts with` : "Scene"}
        <strong>{item.display_name || item.item_tag}</strong>
      </span>
      <button class="pcr-atb2-cust-close" onclick={onCancel} aria-label="Close">&times;</button>
    </div>

    <div class="pcr-atb2-cust-body">

      {#if contextSubject}
        <!-- ACTION VERB (subject context only) -->
        <div class="pcr-atb2-cust-row" class:open={openRow === "action"}>
          <button type="button" class="pcr-atb2-cust-rowbtn" onclick={() => openRow = openRow === "action" ? null : "action"}>
            <span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-action" aria-hidden="true">⤷</span>
            <span class="pcr-atb2-cust-rowlabel">{actionOpt?.display_name || "Verb (e.g. sitting on…)"}</span>
            {#if action}
              <button class="pcr-atb2-cust-rowclear" onclick={(e) => { e.stopPropagation(); clearRow("action"); }} title="Clear">&times;</button>
            {/if}
            <span class="pcr-atb2-cust-chev">▾</span>
          </button>
          {#if openRow === "action"}
            <div class="pcr-atb2-cust-popover">
              <div class="pcr-atb2-cust-popitem" class:active={!action} onclick={() => pickRow("action", "")}>
                <span class="pcr-atb2-cust-icon-bullet"></span>
                <span>None</span>
              </div>
              {#each validActions as a}
                <div class="pcr-atb2-cust-popitem" class:active={a.action_tag === action} onclick={() => pickRow("action", a.action_tag)}>
                  <span class="pcr-atb2-cust-icon-bullet"></span>
                  <span>{a.display_name}</span>
                </div>
              {/each}
              {#if !validActions.length}
                <div class="pcr-atb2-cust-popgroup">No verbs for this item</div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      {#if isCustomizable}
      <!-- MATERIAL -->
      <div class="pcr-atb2-cust-row" class:open={openRow === "material"}>
        <button type="button" class="pcr-atb2-cust-rowbtn" onclick={() => openRow = openRow === "material" ? null : "material"}>
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
            {#each validMaterials as m}
              <div class="pcr-atb2-cust-popitem" class:active={m.tag === material} onclick={() => pickRow("material", m.tag)}>
                <span class="pcr-atb2-cust-icon-bullet"></span>
                <span>{m.display}</span>
              </div>
            {/each}
            {#if !validMaterials.length}
              <div class="pcr-atb2-cust-popgroup">No materials for this item</div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- PATTERN -->
      <div class="pcr-atb2-cust-row" class:open={openRow === "pattern"}>
        <button type="button" class="pcr-atb2-cust-rowbtn" disabled={!patternEnabled} onclick={() => { if (patternEnabled) openRow = openRow === "pattern" ? null : "pattern"; }}>
          <span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-pattern" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="16" height="16"><rect x="0" y="0" width="4" height="4" fill="currentColor"/><rect x="8" y="0" width="4" height="4" fill="currentColor"/><rect x="4" y="4" width="4" height="4" fill="currentColor"/><rect x="12" y="4" width="4" height="4" fill="currentColor"/><rect x="0" y="8" width="4" height="4" fill="currentColor"/><rect x="8" y="8" width="4" height="4" fill="currentColor"/><rect x="4" y="12" width="4" height="4" fill="currentColor"/><rect x="12" y="12" width="4" height="4" fill="currentColor"/></svg>
          </span>
          <span class="pcr-atb2-cust-rowlabel">{patternOpt?.display || (patternEnabled ? "Solid / None" : "Pick a material first")}</span>
          {#if pattern && pattern !== "solid"}
            <button class="pcr-atb2-cust-rowclear" onclick={(e) => { e.stopPropagation(); clearRow("pattern"); }} title="Clear">&times;</button>
          {/if}
          <span class="pcr-atb2-cust-chev">▾</span>
        </button>
        {#if openRow === "pattern"}
          <div class="pcr-atb2-cust-popover">
            <div class="pcr-atb2-cust-popitem" class:active={!pattern || pattern === "solid"} onclick={() => pickRow("pattern", "solid")}>
              <span class="pcr-atb2-cust-icon-bullet"></span>
              <span>Solid / None</span>
            </div>
            {#each (patterns || []).filter(p => p.tag !== "solid") as p}
              <div class="pcr-atb2-cust-popitem" class:active={p.tag === pattern} onclick={() => pickRow("pattern", p.tag)}>
                <span class="pcr-atb2-cust-icon-bullet"></span>
                <span>{p.display}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- COLOR -->
      <div class="pcr-atb2-cust-row" class:open={openRow === "color"}>
        <button type="button" class="pcr-atb2-cust-rowbtn" onclick={() => openRow = openRow === "color" ? null : "color"}>
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
            {#each colorGroups as [grp, list]}
              <div class="pcr-atb2-cust-popgroup">{grp}</div>
              {#each list as c}
                <div class="pcr-atb2-cust-popitem" class:active={c.tag === color} onclick={() => pickRow("color", c.tag)}>
                  <span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color" style="background:{colorSwatch(c.tag)}"></span>
                  <span>{c.display}</span>
                </div>
              {/each}
            {/each}
          </div>
        {/if}
      </div>
      {/if}

      <div class="pcr-atb2-cust-preview">
        <div class="pcr-atb2-cust-preview-label">Preview</div>
        <div class="pcr-atb2-cust-preview-text">{isNaturalMode ? (previewNat || previewTag || (item.display_name || item.item_tag).toLowerCase()) : (previewTag || previewNat || (item.display_name || item.item_tag).toLowerCase())}</div>
      </div>

    </div>

    <div class="pcr-atb2-cust-footer">
      <button class="pcr-atb2-cust-btn pcr-atb2-cust-cancel" onclick={onCancel}>Cancel</button>
      <button class="pcr-atb2-cust-btn pcr-atb2-cust-ok" disabled={assembling} onclick={handleConfirm}>{contextSubject && action ? "Add Interaction" : "Add to Scene"}</button>
    </div>
  </div>
</div>

<style>
  .pcr-atb2-cust-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 100070; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .pcr-atb2-cust-modal { background: var(--pcr-panel, #1a1a1f); color: var(--pcr-text, #e6e6e6); border: 1px solid var(--pcr-border, #2a2a32); border-radius: 10px; width: 380px; max-width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5); }
  .pcr-atb2-cust-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--pcr-border, #2a2a32); }
  .pcr-atb2-cust-title { font-size: 13px; }
  .pcr-atb2-cust-title strong { color: #b59cff; font-weight: 600; margin-left: 4px; }
  .pcr-atb2-cust-close { background: transparent; border: 0; color: inherit; font-size: 22px; line-height: 1; cursor: pointer; padding: 0 6px; }
  /* No overflow on the body — `overflow: auto` clips absolutely-positioned
     popovers at the body's edge. The modal's max-height keeps overall size
     in check; popover content extends above the footer via z-index. */
  .pcr-atb2-cust-body { padding: 14px; display: flex; flex-direction: column; gap: 8px; overflow: visible; }
  .pcr-atb2-cust-row { position: relative; }
  .pcr-atb2-cust-rowbtn { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--pcr-border, #2a2a32); border-radius: 8px; color: inherit; cursor: pointer; text-align: left; transition: background 0.1s; }
  .pcr-atb2-cust-rowbtn:hover:not(:disabled) { background: rgba(255,255,255,0.05); }
  .pcr-atb2-cust-rowbtn:disabled { opacity: 0.4; cursor: not-allowed; }
  .pcr-atb2-cust-row.open .pcr-atb2-cust-rowbtn { border-color: #7c3aed; }
  .pcr-atb2-cust-rowlabel { flex: 1 1 auto; font-size: 13px; }
  .pcr-atb2-cust-rowclear { background: transparent; border: 0; color: #888; font-size: 16px; line-height: 1; cursor: pointer; padding: 0 4px; }
  .pcr-atb2-cust-rowclear:hover { color: #e6e6e6; }
  .pcr-atb2-cust-chev { color: #888; font-size: 12px; }
  .pcr-atb2-cust-icon { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
  .pcr-atb2-cust-icon-color { border: 1px solid rgba(255,255,255,0.15); }
  .pcr-atb2-cust-icon-pattern { color: #cfd2d6; }
  .pcr-atb2-cust-icon-material { color: #7dd3fc; }
  .pcr-atb2-cust-icon-action { color: #facc15; font-size: 15px; line-height: 1; }
  .pcr-atb2-cust-icon-bullet { width: 6px; height: 6px; border-radius: 50%; background: #555; flex: 0 0 auto; margin-left: 8px; }
  .pcr-atb2-cust-popover { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--pcr-panel, #1a1a1f); border: 1px solid var(--pcr-border, #2a2a32); border-radius: 8px; max-height: 280px; overflow-y: auto; z-index: 5; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); }
  .pcr-atb2-cust-popgroup { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #888; padding: 8px 12px 4px; }
  .pcr-atb2-cust-popitem { display: flex; align-items: center; gap: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
  .pcr-atb2-cust-popitem:hover { background: rgba(124, 58, 237, 0.15); }
  .pcr-atb2-cust-popitem.active { background: rgba(124, 58, 237, 0.25); color: #c4b5fd; }
  .pcr-atb2-cust-preview { margin-top: 10px; padding: 10px 12px; background: rgba(124, 58, 237, 0.08); border: 1px solid rgba(124, 58, 237, 0.2); border-radius: 8px; }
  .pcr-atb2-cust-preview-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #888; margin-bottom: 4px; }
  .pcr-atb2-cust-preview-text { font-size: 13px; line-height: 1.4; }
  .pcr-atb2-cust-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--pcr-border, #2a2a32); }
  .pcr-atb2-cust-btn { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--pcr-border, #2a2a32); background: rgba(255,255,255,0.04); color: inherit; cursor: pointer; font-size: 13px; }
  .pcr-atb2-cust-cancel:hover { background: rgba(255,255,255,0.08); }
  .pcr-atb2-cust-ok { background: #7c3aed; border-color: #7c3aed; color: white; }
  .pcr-atb2-cust-ok:hover:not(:disabled) { background: #8b5cf6; }
  .pcr-atb2-cust-ok:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
