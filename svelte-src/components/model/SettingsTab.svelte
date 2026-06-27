<script>
  // SettingsTab — per-node sections with sliders/combos, seed row,
  // resolution presets, range mode, save/apply/add/edit footer.

  import "./model-panel-shared.css";
  import SettingsSlider from "./SettingsSlider.svelte";
  import RangeSlider from "./RangeSlider.svelte";
  import MultiSelectCombo from "./MultiSelectCombo.svelte";

  let {
    detected = [],
    savedConfig = null,
    rangeMode = false,
    expandedSections = {},
    readWidgetValue,
    readWidgetOptions,
    writeWidgetValue,
    resolveResolutionTicks,
    injectableNodes,
    onSave,
    onReopen,
    onInjectNode,
    onClose,
  } = $props();

  const DISPLAY_NAMES = {
    sampler_name: "Sampler",
    stop_at_clip_layer: "Last Layer",
    upscale_by: "Upscale",
  };

  const savedNodes = savedConfig?.nodes || {};
  const userSaved = savedConfig?._user_saved || false;
  const hasSystem = savedConfig?._has_system || false;

  // Built-in recommended value + range per ControlNet control type (global,
  // not per-checkpoint). Feeds the slider's recommended marker + range band
  // when the model config has no override. Centered on the inject defaults.
  const CONTROLNET_DEFAULTS = {
    depth:    { strength: 0.7, strength_range: [0.5, 0.9], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 0.8, end_percent_range: [0.5, 1.0] },
    canny:    { strength: 0.9, strength_range: [0.7, 1.0], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 1.0, end_percent_range: [0.7, 1.0] },
    pose:     { strength: 1.0, strength_range: [0.8, 1.0], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 0.7, end_percent_range: [0.5, 1.0] },
    lineart:  { strength: 0.8, strength_range: [0.6, 1.0], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 1.0, end_percent_range: [0.7, 1.0] },
    softedge: { strength: 0.6, strength_range: [0.4, 0.9], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 0.8, end_percent_range: [0.5, 1.0] },
    scribble: { strength: 0.6, strength_range: [0.4, 0.8], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 0.8, end_percent_range: [0.5, 1.0] },
    // Flux (Union-Pro-2.0) — recommended values from the model card; kept under
    // "flux-" keys so they don't override the SDXL markers for shared modes.
    "flux-depth":    { strength: 0.8, strength_range: [0.7, 0.9], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 0.8,  end_percent_range: [0.7, 0.9] },
    "flux-canny":    { strength: 0.7, strength_range: [0.6, 0.8], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 0.8,  end_percent_range: [0.7, 0.9] },
    "flux-pose":     { strength: 0.9, strength_range: [0.8, 1.0], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 0.65, end_percent_range: [0.6, 0.75] },
    "flux-softedge": { strength: 0.7, strength_range: [0.6, 0.8], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 0.8,  end_percent_range: [0.7, 0.9] },
    "flux-gray":     { strength: 0.9, strength_range: [0.8, 1.0], start_percent: 0.0, start_percent_range: [0, 0.3], end_percent: 0.8,  end_percent_range: [0.7, 0.9] },
    // Z-Image (model-patch) exposes strength only; recommended values match the
    // inject, range stays in the model's 0.65–1.0 band.
    "zimage-depth":    { strength: 0.8, strength_range: [0.65, 1.0] },
    "zimage-canny":    { strength: 0.7, strength_range: [0.65, 1.0] },
    "zimage-pose":     { strength: 0.9, strength_range: [0.7, 1.0] },
    "zimage-softedge": { strength: 0.9, strength_range: [0.65, 1.0] },
    "zimage-scribble": { strength: 0.9, strength_range: [0.65, 1.0] },
    "zimage-gray":     { strength: 0.9, strength_range: [0.7, 1.0] },
  };
  function savedWidgetsFor(type) {
    if (savedNodes[type]) return savedNodes[type];
    if (type.startsWith("ControlNet:")) return CONTROLNET_DEFAULTS[type.slice(11)] || {};
    return {};
  }

  // Track editors per section for deviation detection
  let editors = $state({});   // { [nodeType]: { [widgetName]: value } }
  // Range mode: { [nodeType]: { [widgetName_range]: [lo,hi], [widgetName_options]: [...], [widgetName]: default } }
  let rangeValues = $state({});

  function valuesMatch(a, b, step) {
    if (typeof a === "number" && typeof b === "number")
      return Math.abs(a - b) < (step || 0.001) * 0.5;
    return a === b;
  }

  let hasDeviation = $derived.by(() => {
    if (rangeMode) return true;
    for (const [nodeType, widgetVals] of Object.entries(editors)) {
      const saved = savedNodes[nodeType] || {};
      for (const [name, val] of Object.entries(widgetVals)) {
        if (name.startsWith("_")) continue;
        const sv = saved[name];
        if (sv === undefined) continue;
        const widgetDefs = detected.find(d => d.type === nodeType)?.config?.widgets || {};
        if (!valuesMatch(val, sv, widgetDefs[name]?.step)) return true;
      }
    }
    return false;
  });

  let saveDisabled = $derived(!rangeMode && !hasDeviation && !!savedConfig);
  let applyDisabled = $derived(!hasDeviation || !savedConfig);

  // Initialize editors map from detected nodes
  function initEditors() {
    const ed = {};
    for (const { node, config, type } of detected) {
      ed[type] = {};
      for (const [widgetName, def] of Object.entries(config.widgets)) {
        if (def.type === "resolution") {
          const w = readWidgetValue(node, "width");
          const h = readWidgetValue(node, "height");
          if (w !== undefined) ed[type]["width"] = w;
          if (h !== undefined) ed[type]["height"] = h;
          ed[type]["_resolutions"] = savedNodes[type]?.["_resolutions"] || [];
        } else if (!def.paired) {
          const val = readWidgetValue(node, widgetName);
          if (val !== undefined) {
            ed[type][widgetName] = def.type === "slider" ? parseFloat(val) : val;
          }
          // Paired combos
          if (def.pair) {
            const pairVal = readWidgetValue(node, def.pair);
            if (pairVal !== undefined) ed[type][def.pair] = pairVal;
          }
        }
      }
    }
    editors = ed;
  }
  initEditors();

  function setEditorValue(nodeType, widgetName, val) {
    if (!editors[nodeType]) editors[nodeType] = {};
    editors[nodeType][widgetName] = val;
  }

  // Some nodes carry their OWN width/height that must match the latent or their
  // schedule/shift disagrees with the image size. The resolution row writes only the
  // latent node, so slave those dependents to it here (they are intentionally not
  // shown as a second resolution row). Ideogram4Scheduler (noise schedule) persists
  // its width/height with the saved model config; Krea 2 RAW's ModelSamplingFlux
  // (resolution-dynamic flow-shift) is mirror-only — written to the live node but
  // never into editors, so handleSave can never re-bake a static shift (it must stay
  // dynamic). No-op on any graph without these sections.
  const RES_DEPENDENTS = [
    { type: "Ideogram4Scheduler", persist: true },
    { type: "ModelSamplingFlux", persist: false },
  ];
  function mirrorResolutionDependents(latentNode) {
    for (const { type: depType, persist } of RES_DEPENDENTS) {
      const dep = detected.find((d) => d.type === depType);
      if (!dep) continue;
      for (const dim of ["width", "height"]) {
        const v = readWidgetValue(latentNode, dim);
        if (v === undefined) continue;
        writeWidgetValue(dep.node, dim, v);
        if (persist) setEditorValue(depType, dim, v);
      }
    }
  }

  function setRangeValue(nodeType, widgetName, lo, hi) {
    if (!rangeValues[nodeType]) rangeValues[nodeType] = {};
    rangeValues[nodeType][`${widgetName}_range`] = [lo, hi];
  }

  function setRangeComboValue(nodeType, widgetName, defaultVal, selected) {
    if (!rangeValues[nodeType]) rangeValues[nodeType] = {};
    rangeValues[nodeType][widgetName] = defaultVal;
    rangeValues[nodeType][`${widgetName}_options`] = selected;
  }

  // Resolution presets: mutable arrays stored in editors
  function getPresets(nodeType) {
    return editors[nodeType]?.["_resolutions"] || [];
  }

  // Preset menu state per section
  let presetMenuOpen = $state({});

  function togglePresetMenu(nodeType) {
    presetMenuOpen[nodeType] = !presetMenuOpen[nodeType];
  }

  // Close an open preset menu when the pointer goes down anywhere outside its
  // wrap. Capture phase so it runs before the toggle button's own handler; the
  // wrap holds both the button and the menu, so toggling/selecting still works.
  // (The modal's own outside-click ignores clicks inside the menu, so this is
  // the only thing that dismisses it on an unrelated click.) Event-driven.
  $effect(() => {
    function onDocDown(e) {
      if (e.target?.closest?.(".pcr-resolution-preset-wrap")) return;
      for (const k of Object.keys(presetMenuOpen)) {
        if (presetMenuOpen[k]) presetMenuOpen[k] = false;
      }
    }
    document.addEventListener("pointerdown", onDocDown, true);
    return () => document.removeEventListener("pointerdown", onDocDown, true);
  });

  // Collapsible section state. The incoming prop is a plain object (not
  // $state), so mutating it directly doesn't re-render. Drive a local $state
  // and mirror back to the prop so expand state still persists across reopens.
  let expandedState = $state({ ...expandedSections });
  function toggleSection(type) {
    expandedState[type] = !expandedState[type];
    expandedSections[type] = expandedState[type];
  }

  // Save
  let saveError = $state(null);
  async function handleSave() {
    const config = { ...(savedConfig || {}) };
    config.display_name = config.display_name || "";
    if (!config.nodes) config.nodes = {};

    if (rangeMode) {
      for (const [type, vals] of Object.entries(rangeValues)) {
        if (!config.nodes[type]) config.nodes[type] = {};
        Object.assign(config.nodes[type], vals);
      }
    } else {
      for (const [type, vals] of Object.entries(editors)) {
        if (!config.nodes[type]) config.nodes[type] = {};
        Object.assign(config.nodes[type], vals);
      }
    }

    saveError = null;
    try {
      await onSave(config);
    } catch (e) {
      console.error("[PromptChain] settings save failed:", e);
      saveError = e?.message || "Save failed";
    }
  }

  // Restore defaults — write saved values to graph widgets, then reopen
  function handleApply() {
    for (const { node, config: nodeConfig, type } of detected) {
      const saved = savedNodes[type] || {};
      for (const [widgetName, def] of Object.entries(nodeConfig.widgets)) {
        if (def.paired) continue;
        const savedVal = saved[widgetName];
        if (savedVal === undefined) continue;
        writeWidgetValue(node, widgetName, def.type === "slider" ? parseFloat(savedVal) : savedVal);
        if (def.pair) {
          const pairSaved = saved[def.pair];
          if (pairSaved !== undefined) writeWidgetValue(node, def.pair, pairSaved);
        }
      }
    }
    onReopen({});
  }

  // Injection menu
  let addMenuOpen = $state(false);
  let addSubmenu = $state(null);   // the group (e.g. ControlNet) drilled into
  let editMenuOpen = $state(false);
  let injectable = $derived(injectableNodes());

</script>

<div class="pcr-model-panel-body">
  {#if !detected.length}
    <div class="pcr-model-panel-empty">No supported nodes detected.</div>
  {/if}

  {#each detected.filter((d) => !d.config?.mirrorOnly) as { node, config, type }}
    {@const savedWidgets = savedWidgetsFor(type)}
    {@const isExpanded = rangeMode || !!expandedState[type]}
    <div class="pcr-model-panel-section">
      <div class="pcr-model-panel-section-title">
        {config.label || type}
        {#if config.collapsible && !rangeMode}
          <span class="pcr-section-expand-toggle"
            onclick={(e) => { e.stopPropagation(); toggleSection(type); }}>
            {isExpanded ? "▾ less" : "▸ more"}
          </span>
        {/if}
      </div>

      <!-- Seed row (not in range mode) -->
      {#if !rangeMode}
        {@const seedName = node.widgets?.find(w => w.name === "noise_seed") ? "noise_seed" : "seed"}
        {@const seedVal = readWidgetValue(node, seedName)}
        {@const controlVal = readWidgetValue(node, "control_after_generate")}
        {@const seedIsRandom = controlVal === "randomize"}
        {#if seedVal !== undefined && (!seedIsRandom || isExpanded)}
          <div class="pcr-model-panel-row">
            <span class="pcr-model-panel-label">seed</span>
            <div class="pcr-seed-controls">
              {#if controlVal !== undefined}
                <select class="pcr-seed-control-select"
                  onchange={(e) => writeWidgetValue(node, "control_after_generate", e.target.value)}>
                  {#each readWidgetOptions(node, "control_after_generate") as opt}
                    <option value={opt} selected={opt === controlVal}>{opt}</option>
                  {/each}
                </select>
              {/if}
              <input type="number" class="pcr-seed-input"
                value={seedVal}
                onchange={(e) => writeWidgetValue(node, seedName, parseInt(e.target.value) || 0)} />
              <button class="pcr-seed-dice" title="Randomize seed"
                onclick={(e) => {
                  e.stopPropagation();
                  const newSeed = Math.floor(Math.random() * 1125899906842624);
                  writeWidgetValue(node, seedName, newSeed);
                  onReopen({});
                }}>🎲</button>
            </div>
          </div>
        {/if}
      {/if}

      <!-- Resolution row (not in range mode) -->
      {#if !rangeMode}
        {@const hasResolution = Object.values(config.widgets).some(d => d.type === "resolution")}
        {#if hasResolution}
          {@const w = editors[type]?.width}
          {@const h = editors[type]?.height}
          {#if w !== undefined && h !== undefined}
            {@const savedW = savedWidgets["width"]}
            {@const savedH = savedWidgets["height"]}
            {@const presets = editors[type]?.["_resolutions"] || []}
            {@const isPreset = presets.some(p => p.width === w && p.height === h)}
            <div class="pcr-model-panel-row pcr-resolution-row">
              <span class="pcr-model-panel-label">resolution</span>
              <div class="pcr-resolution-controls">
                <div class="pcr-resolution-preset-wrap">
                  <button class="pcr-resolution-preset-btn"
                    class:pcr-resolution-preset-active={isPreset}
                    class:pcr-resolution-preset-dimmed={!isPreset}
                    onclick={(e) => { e.stopPropagation(); togglePresetMenu(type); }}>
                    {isPreset ? `${w}×${h}` : "Presets"}
                  </button>
                  {#if presetMenuOpen[type]}
                    <div class="pcr-resolution-preset-menu" style="display:block">
                      {#each ["portrait", "landscape", "square"] as cat}
                        {@const items = presets.filter(p =>
                          cat === "square" ? p.width === p.height
                          : cat === "portrait" ? p.width < p.height
                          : p.width > p.height
                        )}
                        {#if items.length}
                          <div class="pcr-resolution-preset-cat">{cat}</div>
                          {#each items as p}
                            <div class="pcr-resolution-preset-item"
                              class:pcr-resolution-preset-selected={p.width === w && p.height === h}
                              onclick={() => {
                                writeWidgetValue(node, "width", p.width);
                                writeWidgetValue(node, "height", p.height);
                                setEditorValue(type, "width", p.width);
                                setEditorValue(type, "height", p.height);
                                mirrorResolutionDependents(node);
                                presetMenuOpen[type] = false;
                              }}>
                              <span class="pcr-resolution-preset-item-label">{p.width}×{p.height}</span>
                              <span class="pcr-resolution-preset-remove"
                                onclick={(e) => {
                                  e.stopPropagation();
                                  editors[type]["_resolutions"] = presets.filter(
                                    x => !(x.width === p.width && x.height === p.height)
                                  );
                                }}>×</span>
                            </div>
                          {/each}
                        {/if}
                      {/each}
                      <div class="pcr-resolution-preset-add"
                        class:pcr-resolution-preset-add-disabled={isPreset}
                        onclick={() => {
                          if (!isPreset) {
                            editors[type]["_resolutions"] = [...presets, { width: w, height: h }];
                          }
                          presetMenuOpen[type] = false;
                        }}>
                        {isPreset ? `${w}×${h} already saved` : "+ Add Current"}
                      </div>
                    </div>
                  {/if}
                </div>
                <input type="number" class="pcr-resolution-input"
                  class:pcr-resolution-input-dimmed={isPreset}
                  class:pcr-resolution-input-active={!isPreset}
                  value={w} step={8}
                  onchange={(e) => {
                    const v = parseInt(e.target.value) || 512;
                    setEditorValue(type, "width", v);
                    writeWidgetValue(node, "width", v);
                    mirrorResolutionDependents(node);
                  }} />
                <span class="pcr-resolution-sep">×</span>
                <input type="number" class="pcr-resolution-input"
                  class:pcr-resolution-input-dimmed={isPreset}
                  class:pcr-resolution-input-active={!isPreset}
                  value={h} step={8}
                  onchange={(e) => {
                    const v = parseInt(e.target.value) || 512;
                    setEditorValue(type, "height", v);
                    writeWidgetValue(node, "height", v);
                    mirrorResolutionDependents(node);
                  }} />
              </div>
            </div>
          {/if}
        {/if}
      {/if}

      <!-- Widget rows -->
      {#each Object.entries(config.widgets) as [widgetName, def]}
        {#if def.type !== "resolution" && !def.paired}
          {@const val = readWidgetValue(node, widgetName)}
          {#if val !== undefined}
            {@const savedVal = savedWidgets[widgetName]}
            {@const savedRange = savedWidgets[`${widgetName}_range`]}
            {@const savedOptions = savedWidgets[`${widgetName}_options`]}
            {@const isCollapsed = def.collapsed && config.collapsible && !isExpanded}
            {#if !isCollapsed}
              <div class="pcr-model-panel-row"
                class:pcr-model-panel-row-ticks={def.ticks === "resolution" && !rangeMode}>
                <span class="pcr-model-panel-label">
                  {DISPLAY_NAMES[widgetName] || widgetName.replace(/_/g, " ")}
                </span>

                {#if def.type === "slider"}
                  {#if rangeMode}
                    <RangeSlider
                      min={Math.min(def.min, savedRange?.[0] ?? def.min, parseFloat(val))}
                      max={Math.max(def.max, savedRange?.[1] ?? def.max, parseFloat(val))}
                      step={def.step}
                      rangeMin={savedRange?.[0] ?? def.min}
                      rangeMax={savedRange?.[1] ?? def.max}
                      onChange={(lo, hi) => setRangeValue(type, widgetName, lo, hi)} />
                  {:else}
                    {@const tickData = def.ticks === "resolution" ? resolveResolutionTicks() : null}
                    {@const effectiveMin = Math.min(def.min, savedRange?.[0] ?? def.min, parseFloat(val),
                      tickData ? tickData.minBound : def.min)}
                    {@const effectiveMax = Math.max(def.max, savedRange?.[1] ?? def.max, parseFloat(val),
                      tickData ? tickData.maxBound : def.max)}
                    <SettingsSlider
                      min={effectiveMin}
                      max={effectiveMax}
                      step={def.step}
                      value={parseFloat(val)}
                      savedValue={savedVal !== undefined ? parseFloat(savedVal) : undefined}
                      rangeMin={savedRange?.[0]}
                      rangeMax={savedRange?.[1]}
                      {userSaved}
                      ticks={tickData?.ticks ?? null}
                      onChange={(v) => {
                        setEditorValue(type, widgetName, v);
                        writeWidgetValue(node, widgetName, v);
                      }} />
                  {/if}

                {:else if def.type === "combo"}
                  {#if rangeMode}
                    <MultiSelectCombo
                      options={readWidgetOptions(node, widgetName)}
                      selected={savedOptions || [val]}
                      defaultVal={savedVal || val}
                      onChange={(def, sel) => setRangeComboValue(type, widgetName, def, sel)} />
                  {:else}
                    {@const hasSaved = savedVal !== undefined}
                    {@const isAtDefault = hasSaved && val === savedVal}
                    {@const inOptions = savedOptions && savedOptions.includes(val)}
                    <div class="pcr-model-panel-combo-wrap">
                      {#if userSaved && hasSaved && !isAtDefault}
                        <span class="pcr-model-panel-saved-hint">saved: {savedVal}</span>
                      {/if}
                      <select class="pcr-model-panel-select"
                        class:pcr-combo-at-default={isAtDefault}
                        class:pcr-combo-at-saved={!isAtDefault && inOptions}
                        onchange={(e) => {
                          setEditorValue(type, widgetName, e.target.value);
                          writeWidgetValue(node, widgetName, e.target.value);
                        }}>
                        {#each readWidgetOptions(node, widgetName) as opt}
                          <option value={opt} selected={opt === val}
                            style:color={hasSaved && opt === savedVal ? "#5ed357"
                              : savedOptions?.includes(opt) ? "#5dcaff" : "#999"}>
                            {opt}
                          </option>
                        {/each}
                      </select>
                    </div>

                    {#if def.pair}
                      {@const pairName = def.pair}
                      {@const pairDef = config.widgets[pairName]}
                      {@const pairVal = readWidgetValue(node, pairName)}
                      {#if pairDef && pairVal !== undefined}
                        {@const pairSavedVal = savedWidgets[pairName]}
                        {@const pairSavedOpts = savedWidgets[`${pairName}_options`]}
                        {@const pairHasSaved = pairSavedVal !== undefined}
                        <span style="color:#555;margin:0 2px">/</span>
                        <div class="pcr-model-panel-combo-wrap">
                          <select class="pcr-model-panel-select"
                            class:pcr-combo-at-default={pairHasSaved && pairVal === pairSavedVal}
                            class:pcr-combo-at-saved={pairSavedOpts?.includes(pairVal)}
                            onchange={(e) => {
                              setEditorValue(type, pairName, e.target.value);
                              writeWidgetValue(node, pairName, e.target.value);
                            }}>
                            {#each readWidgetOptions(node, pairName) as opt}
                              <option value={opt} selected={opt === pairVal}
                                style:color={pairHasSaved && opt === pairSavedVal ? "#5ed357"
                                  : pairSavedOpts?.includes(opt) ? "#5dcaff" : "#999"}>
                                {opt}
                              </option>
                            {/each}
                          </select>
                        </div>
                      {/if}
                    {/if}
                  {/if}
                {/if}
              </div>
            {/if}
          {/if}
        {/if}
      {/each}
    </div>
  {/each}
</div>

{#if saveError}
  <div class="pcr-settings-save-error">Save failed: {saveError}</div>
{/if}

<!-- Footer — sibling of the scroll body so it stays pinned while sections scroll -->
<div class="pcr-model-panel-footer">
    {#if rangeMode}
      <button class="pcr-model-panel-apply"
        onclick={(e) => { e.stopPropagation(); onReopen({ rangeMode: false }); }}>Cancel</button>
      <button class="pcr-model-panel-save"
        onclick={handleSave}>Save Ranges</button>
    {:else}
      {#if injectable.length}
        <div style="position:relative">
          <button class="pcr-model-panel-apply"
            onclick={(e) => { e.stopPropagation(); addMenuOpen = !addMenuOpen; addSubmenu = null; editMenuOpen = false; }}>
            Add ▾
          </button>
          {#if addMenuOpen}
            <div class="pcr-footer-dropdown-menu" style="display:block;position:absolute;bottom:100%;left:0;min-width:100%">
              {#if addSubmenu}
                <div class="pcr-footer-dropdown-item pcr-footer-dropdown-back"
                  onclick={(e) => { e.stopPropagation(); addSubmenu = null; }}>
                  ‹ {addSubmenu.label}
                </div>
                {#each addSubmenu.children as child}
                  <div class="pcr-footer-dropdown-item"
                    onclick={(e) => { e.stopPropagation(); addMenuOpen = false; addSubmenu = null; onInjectNode(child.value); }}>
                    {child.label}
                  </div>
                {/each}
              {:else}
                {#each injectable as item}
                  {#if typeof item === "string"}
                    <div class="pcr-footer-dropdown-item"
                      onclick={(e) => { e.stopPropagation(); addMenuOpen = false; onInjectNode(item); }}>
                      {item}
                    </div>
                  {:else if item.children}
                    <div class="pcr-footer-dropdown-item"
                      onclick={(e) => { e.stopPropagation(); addSubmenu = item; }}>
                      {item.label} ▸
                    </div>
                  {:else}
                    <div class="pcr-footer-dropdown-item"
                      onclick={(e) => { e.stopPropagation(); addMenuOpen = false; onInjectNode(item.value); }}>
                      {item.label}
                    </div>
                  {/if}
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <div style="position:relative">
        <button class="pcr-model-panel-apply"
          onclick={(e) => { e.stopPropagation(); editMenuOpen = !editMenuOpen; addMenuOpen = false; }}>
          Edit ▾
        </button>
        {#if editMenuOpen}
          <div class="pcr-footer-dropdown-menu" style="display:block;position:absolute;bottom:100%;left:0;min-width:100%">
            <div class="pcr-footer-dropdown-item"
              onclick={(e) => { e.stopPropagation(); editMenuOpen = false; onReopen({ rangeMode: true }); }}>
              Set Ranges
            </div>
            {#if savedConfig}
              <div class="pcr-footer-dropdown-item"
                onclick={(e) => { e.stopPropagation(); editMenuOpen = false; handleApply(); }}>
                Restore Defaults
              </div>
            {/if}
            {#if userSaved && hasSystem}
              <div class="pcr-footer-dropdown-item"
                onclick={async (e) => {
                  e.stopPropagation();
                  editMenuOpen = false;
                  await fetch(`/promptchain/models/settings/${savedConfig?._hash || ""}`, { method: "DELETE" });
                  onReopen({});
                }}>
                Reset to System Defaults
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <button class="pcr-model-panel-save"
        disabled={saveDisabled}
        onclick={handleSave}>
        Save as Default
      </button>
    {/if}
</div>

<style>
  /* collapsible sections */
  .pcr-model-panel-section {
    margin-bottom: 12px;
  }
  .pcr-model-panel-section-title {
    font-size: 11px;
    font-weight: 600;
    color: #4f97cf;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pcr-section-expand-toggle {
    font-size: 10px;
    color: #4fa1d1de;
    cursor: pointer;
    text-transform: none;
    font-weight: 400;
    letter-spacing: 0;
  }
  .pcr-section-expand-toggle:hover { color: #999; }

  /* widget rows */
  .pcr-model-panel-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    padding: 0 4px;
  }
  .pcr-model-panel-label {
    font-size: 12px;
    color: #999;
    width: 70px;
    flex: 0 0 70px;
    text-transform: capitalize;
    overflow-wrap: break-word;
  }
  .pcr-model-panel-row-ticks {
    align-items: flex-start;
    margin-bottom: 15px;
  }
  .pcr-model-panel-row-ticks .pcr-model-panel-label {
    margin-top: 4px;
  }

  /* combo select */
  .pcr-model-panel-select {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ddd;
    padding: 3px 20px 3px 6px;
    font-size: 12px;
    cursor: pointer;
    appearance: none;
    width: 100%;
    min-width: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23999'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
  }
  .pcr-model-panel-select:focus {
    border-color: #4fc3f7;
    outline: none;
  }

  /* footer */
  .pcr-model-panel-footer {
    padding: 14px 8px 8px 8px;
    border-top: 1px solid #333;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .pcr-footer-dropdown-menu {
    background: rgba(30, 30, 30, 0.98);
    border: 1px solid #555;
    border-radius: 6px;
    padding: 4px 0;
    z-index: 100001;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
    /* Cap height + scroll so a long submenu can't crop against the
       overflow-clipped panel body it lives inside. */
    max-height: 50vh;
    overflow-y: auto;
  }
  .pcr-footer-dropdown-back {
    color: #4fc3f7;
    border-bottom: 1px solid #333;
    font-weight: 500;
  }
  .pcr-footer-dropdown-item {
    padding: 8px 14px;
    font-size: 12px;
    color: #bbb;
    cursor: pointer;
    white-space: nowrap;
  }
  .pcr-footer-dropdown-item:hover {
    background: rgba(79, 195, 247, 0.2);
    color: #4fc3f7;
  }

  /* resolution row */
  .pcr-resolution-row { flex-wrap: wrap; }
  .pcr-resolution-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }
  .pcr-resolution-input {
    width: 56px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ddd;
    padding: 3px 6px;
    font-size: 12px;
    font-family: monospace;
    text-align: right;
  }
  .pcr-resolution-input:focus { border-color: #4fc3f7; outline: none; }
  .pcr-resolution-sep {
    color: #666;
    font-size: 12px;
    flex-shrink: 0;
  }
  .pcr-resolution-preset-wrap {
    position: relative;
    width: 100%;
    margin-right: 10px;
  }
  .pcr-resolution-preset-btn {
    width: 100%;
    background: #383838;
    border: 1px solid #555;
    border-radius: 4px;
    color: #ddd;
    padding: 3px 20px 3px 6px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23999'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
  }
  .pcr-resolution-preset-btn:focus { outline: none; border-color: #888; }
  .pcr-resolution-preset-active {
    color: #5dcaff;
    min-width: 90px;
  }
  /* custom (non-preset) resolution: dim the dropdown, light up the W×H boxes */
  .pcr-resolution-preset-dimmed {
    opacity: 0.45;
  }
  .pcr-resolution-input-dimmed {
    opacity: 0.4;
  }
  .pcr-resolution-input-active {
    border-color: #5dcaff;
    color: #fff;
    background: #222b33;
  }
  .pcr-resolution-preset-menu {
    position: fixed;
    background: rgba(30, 30, 30, 0.98);
    backdrop-filter: blur(8px);
    border: 1px solid #555;
    border-radius: 6px;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
    min-width: 140px;
    max-height: 500px;
    overflow-y: auto;
    z-index: 100001;
    font-size: 12px;
  }
  .pcr-resolution-preset-cat {
    padding: 8px 12px 4px;
    font-size: 10px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: rgba(50, 50, 50, 0.9);
  }
  .pcr-resolution-preset-cat:not(:first-child) {
    margin-top: 2px;
    border-top: 1px solid #444;
  }
  .pcr-resolution-preset-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 12px;
    color: #bbb;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s;
    gap: 12px;
  }
  .pcr-resolution-preset-item:hover { background: rgba(255, 255, 255, 0.08); }
  .pcr-resolution-preset-selected {
    color: #4fc3f7;
    background: rgba(79, 195, 247, 0.1);
  }
  .pcr-resolution-preset-selected:hover { background: rgba(79, 195, 247, 0.15); }
  .pcr-resolution-preset-item-label { flex: 1; font-weight: 400; font-size: 11px; }
  .pcr-resolution-preset-remove {
    color: #666;
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    transition: color 0.15s;
  }
  .pcr-resolution-preset-remove:hover { color: #e74c3c; }
  .pcr-resolution-preset-add {
    padding: 6px 10px;
    color: #4fc3f7;
    cursor: pointer;
    border-top: 1px solid #333;
    margin-top: 2px;
    font-size: 11px;
    transition: background 0.1s;
  }
  .pcr-resolution-preset-add:hover { background: rgba(255, 255, 255, 0.05); }
  .pcr-resolution-preset-add-disabled {
    color: #555;
    cursor: default;
  }
  .pcr-resolution-preset-add-disabled:hover { background: none; }

  /* seed row */
  .pcr-seed-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  .pcr-seed-control-select {
    background: #383838;
    border: 1px solid #555;
    border-radius: 4px;
    color: #ddd;
    padding: 3px 20px 3px 6px;
    font-size: 12px;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23999'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
  }
  .pcr-seed-control-select:focus { outline: none; border-color: #888; }
  .pcr-seed-input {
    flex: 1;
    min-width: 0;
    text-align: center;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #ddd;
    padding: 3px 6px;
    font-size: 12px;
    font-family: monospace;
    text-align: right;
  }
  .pcr-seed-input:focus { border-color: #4fc3f7; outline: none; }
  .pcr-seed-dice {
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    padding: 2px;
    opacity: 0.7;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    line-height: 1;
  }
  .pcr-seed-dice:hover { opacity: 1; }

  /* combo/dropdown saved state */
  .pcr-combo-at-default {
    color: #5ed357;
  }
  .pcr-combo-at-saved {
    color: #5dcaff;
  }
  .pcr-model-panel-combo-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  .pcr-model-panel-saved-hint {
    font-size: 10px;
    color: rgba(94, 211, 87, 0.6);
    white-space: nowrap;
  }
  .pcr-settings-save-error {
    padding: 8px 12px;
    color: #e55;
    font-size: 12px;
    background: rgba(229, 85, 85, 0.08);
    border-top: 1px solid rgba(229, 85, 85, 0.2);
  }
</style>
