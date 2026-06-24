<script>
  // TemplatesTab — template list with drag-reorder, category grouping,
  // save-as-new form, edit/hide/restore/delete actions.

  import "./model-panel-shared.css";

  let {
    modelInfo = {},
    savedConfig = null,
    onApplyTemplate,
    captureWorkflowGraph,
  } = $props();

  const arch = savedConfig?.architecture || modelInfo.architecture || "";
  const family = savedConfig?.family || "";
  const modelName = savedConfig?.model_name || modelInfo.filename || "";
  const version = savedConfig?.version || "";

  let templates = $state([]);
  let categoryOrder = $state([]);
  let loading = $state(true);
  let editMode = $state(false);
  let showHidden = $state(false);

  // Save-new form state
  let newName = $state("");
  let newScope = $state("architecture");
  let newGroup = $state("");
  let existingCategories = $state([]);

  function loadTemplates() {
    loading = true;
    const params = new URLSearchParams();
    if (arch) params.set("arch", arch);
    if (family) params.set("family", family);
    if (modelName) params.set("name", modelName);
    if (modelInfo.hash) params.set("hash", modelInfo.hash);
    if (showHidden) params.set("include_hidden", "1");

    fetch(`/promptchain/templates/list?${params}`)
      .then(r => r.json())
      .then(data => {
        templates = data.templates || [];
        categoryOrder = data.category_order || [];
        loading = false;
      })
      .catch(() => { templates = []; loading = false; });

    // Load all categories for the save form
    fetch(`/promptchain/templates/list?${new URLSearchParams(arch ? { arch } : {})}`)
      .then(r => r.json())
      .then(({ templates: all }) => {
        const cats = new Set();
        for (const t of all) if (t.category) cats.add(t.category);
        existingCategories = [...cats].sort();
      })
      .catch(() => {});
  }

  loadTemplates();

  // Grouped templates
  let grouped = $derived.by(() => {
    const groups = {};
    for (const tpl of templates) {
      const cat = tpl.category || "";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tpl);
    }
    const known = categoryOrder.filter(c => groups[c]);
    const unknown = Object.keys(groups).filter(c => c && !categoryOrder.includes(c)).sort();
    return { uncategorized: groups[""] || [], ordered: [...known, ...unknown], groups };
  });

  let scopeOptions = $derived.by(() => {
    const opts = [{ value: "architecture", label: `Architecture (${arch || "any"})` }];
    if (family) opts.push({ value: "family", label: `Family (${family})` });
    if (modelName) opts.push({ value: "model", label: `Model (${modelName})` });
    opts.push({ value: "version", label: version ? `Version (${version})` : "This version" });
    return opts;
  });

  function scopeLabel(tpl) {
    return tpl.scope?.type === "version" ? (version || "this version")
      : tpl.scope?.type === "model" ? (tpl.scope.model_name || "model")
      : tpl.scope?.type === "family" ? (tpl.scope.family || "family")
      : (tpl.scope?.architecture || "arch");
  }

  function sourceLabel(tpl) {
    return tpl._hidden ? "hidden"
      : tpl._source === "overlay" ? "modified"
      : tpl._source === "user" ? "custom" : "system";
  }

  function handleApply(tpl) {
    if (!confirm("Replace current downstream nodes with this template?")) return;
    onApplyTemplate(tpl);
  }

  function handleRestore(tpl) {
    fetch(`/promptchain/templates/${tpl.id}/reset`, { method: "POST" })
      .then(() => loadTemplates());
  }

  function handleReset(tpl) {
    if (!confirm(`Reset "${tpl.name}" to system defaults?`)) return;
    fetch(`/promptchain/templates/${tpl.id}/reset`, { method: "POST" })
      .then(() => loadTemplates());
  }

  function handleDelete(tpl) {
    if (tpl._source === "user") {
      if (!confirm(`Delete "${tpl.name}"?`)) return;
    }
    fetch(`/promptchain/templates/${tpl.id}`, { method: "DELETE" })
      .then(() => loadTemplates());
  }

  function handleDissolveGroup(category, items) {
    // allSettled: one failed PATCH shouldn't abort the rest.  Log any
    // rejections so a silent half-done state is still visible.
    Promise.allSettled(items.map(t =>
      fetch(`/promptchain/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "" }),
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
    )).then(results => {
      const failed = results.filter(r => r.status === "rejected");
      if (failed.length) console.error("[PromptChain] dissolve-group partial failure:", failed);
      loadTemplates();
    });
  }

  function handleResetAll() {
    if (!confirm("Reset all templates to system defaults? This removes all custom templates, hidden states, and ordering.")) return;
    fetch("/promptchain/templates/reset-all", { method: "POST" })
      .then(() => loadTemplates());
  }

  async function handleSaveNew() {
    if (!newName.trim()) return;

    let tplCategory = newGroup;
    if (tplCategory === "__new__") {
      tplCategory = prompt("New group name:");
      if (!tplCategory?.trim()) return;
      tplCategory = tplCategory.trim();
    }

    const graphData = captureWorkflowGraph();
    if (!graphData) {
      alert("No downstream nodes to capture");
      return;
    }

    const scope = { type: newScope, architecture: arch };
    if (newScope === "family") scope.family = family;
    if (newScope === "model") scope.model_name = modelName;
    if (newScope === "version") scope.model_hash = modelInfo.hash;

    const template = {
      name: newName.trim(),
      scope,
      created_at: Math.floor(Date.now() / 1000),
      // A user-saved template's widget values are deliberate, so its settings win
      // over the model config's generic presets (applyTemplate honors lockSettings).
      // This is NOT lockModels — model-swap-in-place still applies to user templates.
      lockSettings: true,
      ...(tplCategory ? { category: tplCategory } : {}),
      ...graphData,
    };

    await fetch("/promptchain/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    });
    newName = "";
    loadTemplates();
  }
</script>

<div class="pcr-model-panel-body">
  {#if loading}
    <div class="pcr-model-panel-empty">Loading...</div>
  {:else if !templates.length && !editMode}
    <div class="pcr-model-panel-empty">No templates saved yet</div>
  {:else}
    <div class="pcr-tpl-list">
      {#each grouped.uncategorized as tpl (tpl.id)}
        <div class="pcr-tpl-item" class:pcr-tpl-hidden={tpl._hidden} data-template-id={tpl.id}>
          {#if editMode}
            <span class="pcr-tpl-drag-handle">≡</span>
          {/if}
          <div class="pcr-tpl-item-info">
            <span class="pcr-tpl-item-name">{tpl.name}</span>
            <span class="pcr-tpl-item-meta">
              {scopeLabel(tpl)} · {tpl.nodes?.length || 0} nodes
              <span class="pcr-tpl-source-badge"> · {sourceLabel(tpl)}</span>
            </span>
          </div>
          <div class="pcr-tpl-item-actions">
            {#if tpl._hidden}
              <button class="pcr-tpl-apply-btn" onclick={() => handleRestore(tpl)}>Restore</button>
            {:else if editMode}
              {#if tpl._source === "overlay"}
                <button class="pcr-tpl-reset-btn" onclick={() => handleReset(tpl)}>Reset</button>
              {/if}
              {#if tpl._source === "user"}
                <button class="pcr-tpl-delete-btn" onclick={() => handleDelete(tpl)}>×</button>
              {:else}
                <button class="pcr-tpl-hide-btn" onclick={() => handleDelete(tpl)}>×</button>
              {/if}
            {:else}
              <button class="pcr-tpl-apply-btn" onclick={() => handleApply(tpl)}>Apply</button>
            {/if}
          </div>
        </div>
      {/each}

      {#each grouped.ordered as category}
        {@const items = grouped.groups[category] || []}
        {#if items.length}
          <div class="pcr-tpl-group-header" data-category={category}>
            {#if editMode}
              <span class="pcr-tpl-group-grip">⠿</span>
            {/if}
            <span class="pcr-tpl-group-toggle">▾</span>
            <span>{category}</span>
            {#if editMode}
              <span class="pcr-tpl-group-dissolve"
                onclick={(e) => { e.stopPropagation(); handleDissolveGroup(category, items); }}>×</span>
            {/if}
          </div>
          <div class="pcr-tpl-group-body" data-category={category}>
            {#each items as tpl (tpl.id)}
              <div class="pcr-tpl-item" class:pcr-tpl-hidden={tpl._hidden} data-template-id={tpl.id}>
                {#if editMode}
                  <span class="pcr-tpl-drag-handle">≡</span>
                {/if}
                <div class="pcr-tpl-item-info">
                  <span class="pcr-tpl-item-name">{tpl.name}</span>
                  <span class="pcr-tpl-item-meta">
                    {scopeLabel(tpl)} · {tpl.nodes?.length || 0} nodes
                    <span class="pcr-tpl-source-badge"> · {sourceLabel(tpl)}</span>
                  </span>
                </div>
                <div class="pcr-tpl-item-actions">
                  {#if tpl._hidden}
                    <button class="pcr-tpl-apply-btn" onclick={() => handleRestore(tpl)}>Restore</button>
                  {:else if editMode}
                    {#if tpl._source === "overlay"}
                      <button class="pcr-tpl-reset-btn" onclick={() => handleReset(tpl)}>Reset</button>
                    {/if}
                    {#if tpl._source === "user"}
                      <button class="pcr-tpl-delete-btn" onclick={() => handleDelete(tpl)}>×</button>
                    {:else}
                      <button class="pcr-tpl-hide-btn" onclick={() => handleDelete(tpl)}>×</button>
                    {/if}
                  {:else}
                    <button class="pcr-tpl-apply-btn" onclick={() => handleApply(tpl)}>Apply</button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if editMode}
    <div class="pcr-tpl-save-section">
      <div class="pcr-tpl-save-row">
        <input type="text" class="pcr-tpl-save-name" placeholder="Template name..."
          bind:value={newName} />
        <select class="pcr-tpl-save-scope" bind:value={newGroup}>
          <option value="">No Group</option>
          {#each existingCategories as cat}
            <option value={cat}>{cat}</option>
          {/each}
          <option value="__new__">+ New Group...</option>
        </select>
        <select class="pcr-tpl-save-scope" bind:value={newScope}>
          {#each scopeOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
      <button class="pcr-model-panel-save" onclick={handleSaveNew}>Save Current</button>
    </div>
  {/if}

  <div style="border-top:1px solid #333;margin-top:8px;padding-top:8px;display:flex;gap:8px;">
    <button class="pcr-model-panel-apply"
      onclick={(e) => { e.stopPropagation(); showHidden = !showHidden; loadTemplates(); }}>
      {showHidden ? "Hide Hidden" : "Show Hidden"}
    </button>
    {#if editMode}
      <button class="pcr-model-panel-apply" onclick={handleResetAll}>Reset All</button>
    {/if}
    <button class="pcr-model-panel-apply"
      onclick={(e) => { e.stopPropagation(); editMode = !editMode; if (!editMode) showHidden = false; loadTemplates(); }}>
      {editMode ? "Done" : "Edit"}
    </button>
  </div>
</div>

<style>
  /* template list */
  .pcr-tpl-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pcr-tpl-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: default;
  }
  .pcr-tpl-item:hover { background: rgba(255, 255, 255, 0.05); }
  .pcr-tpl-item-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .pcr-tpl-item-name {
    font-size: 12px;
    color: #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pcr-tpl-item-meta {
    font-size: 10px;
    color: #777;
  }
  .pcr-tpl-item-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    margin-left: 8px;
  }
  .pcr-tpl-apply-btn {
    font-size: 11px;
    padding: 2px 8px;
    background: #1a6b9c;
    color: #ddd;
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }
  .pcr-tpl-apply-btn:hover { background: #1177bb; }
  .pcr-tpl-delete-btn {
    font-size: 14px;
    line-height: 1;
    padding: 1px 5px;
    background: transparent;
    color: #666;
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }
  .pcr-tpl-delete-btn:hover { color: #e44; background: rgba(255, 50, 50, 0.1); }

  /* save section */
  .pcr-tpl-save-section {
    border-top: 1px solid #333;
    padding-top: 8px;
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pcr-tpl-save-row {
    display: flex;
    gap: 6px;
    min-width: 0;
  }
  .pcr-tpl-save-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid #444;
    border-radius: 4px;
    color: #ddd;
    outline: none;
  }
  .pcr-tpl-save-name:focus { border-color: #4fc3f7; }
  .pcr-tpl-save-name::placeholder { color: #666; }
  .pcr-tpl-save-scope {
    font-size: 11px;
    padding: 3px 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid #444;
    border-radius: 4px;
    color: #aaa;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    min-width: 0;
  }
  .pcr-tpl-save-scope:focus { border-color: #4fc3f7; outline: none; }

  /* drag reorder */
  .pcr-tpl-drag-handle { color: #555; cursor: grab; font-size: 14px; padding: 0 4px; }
  .pcr-tpl-item.dragging { opacity: 0.4; }
  .pcr-tpl-item.drag-over-top { border-top: 2px solid #4fc3f7; }
  .pcr-tpl-item.drag-over-bottom { border-bottom: 2px solid #4fc3f7; }

  /* category groups */
  .pcr-tpl-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px 2px;
    font-size: 10px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    user-select: none;
  }
  .pcr-tpl-group-header:hover { color: #aaa; }
  .pcr-tpl-group-toggle { font-size: 9px; transition: transform 0.15s; }
  .pcr-tpl-group-toggle.collapsed { transform: rotate(-90deg); }
  .pcr-tpl-group-body { display: flex; flex-direction: column; gap: 2px; }
  .pcr-tpl-group-body.collapsed { display: none; }
  .pcr-tpl-group-dissolve {
    margin-left: auto;
    font-size: 12px;
    color: #555;
    cursor: pointer;
    padding: 0 4px;
  }
  .pcr-tpl-group-dissolve:hover { color: #e44; }
  .pcr-tpl-group-grip {
    font-size: 10px;
    cursor: grab;
    color: #555;
    padding: 0 2px;
  }
  .pcr-tpl-group-grip:hover { color: #aaa; }
  .pcr-tpl-group-header.dragging { opacity: 0.4; }

  /* source + reset */
  .pcr-tpl-source-badge {
    font-size: 9px;
    color: #555;
    font-style: italic;
  }
  .pcr-tpl-reset-btn {
    font-size: 11px;
    padding: 2px 8px;
    background: #6b5a1a;
    color: #ddd;
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }
  .pcr-tpl-reset-btn:hover { background: #8a7422; }
  .pcr-tpl-hide-btn {
    font-size: 14px;
    line-height: 1;
    padding: 1px 5px;
    background: transparent;
    color: #666;
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }
  .pcr-tpl-hide-btn:hover { color: #e44; background: rgba(255, 50, 50, 0.1); }
  .pcr-tpl-hidden { opacity: 0.4; }
  .pcr-tpl-hidden .pcr-tpl-item-name { text-decoration: line-through; }
</style>
