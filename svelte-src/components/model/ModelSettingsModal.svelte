<script>
  // ModelSettingsModal — main modal: header with title, classification fields,
  // meta line, version bar, tab bar, and positioned panel.

  import { untrack } from "svelte";
  import { ARCHITECTURES, FAMILIES } from "../../lib/model-constants.js";
  import SettingsTab from "./SettingsTab.svelte";
  import TemplatesTab from "./TemplatesTab.svelte";
  import PromptsTab from "./PromptsTab.svelte";
  import InfoTab from "./InfoTab.svelte";

  let {
    pcNode,
    modelInfo,
    anchorEl,
    detected = [],
    savedConfig = null,
    activeTab: initialTab = "settings",
    rangeMode = false,
    expandedSections = {},
    onClose,
    onReopen,
    onSwitchVersion,
    onOpenPicker,
    onInjectNode,
    onApplyStyleLora,
    onApplyTemplate,
    captureWorkflowGraph,
    readWidgetValue,
    readWidgetOptions,
    writeWidgetValue,
    resolveResolutionTicks,
    injectableNodes,
    onShowCatalogDownload,
    onShowDownload,
    getEditor,
  } = $props();

  const TABS = [
    { id: "settings", label: "Settings" },
    { id: "prompts", label: "Prompts" },
    { id: "templates", label: "Templates" },
    { id: "info", label: "Info" },
  ];

  let activeTab = $state(initialTab);
  let config = $state(savedConfig);
  let versions = $state([]);
  let olderVersions = $state([]);
  let showOlderVersions = $state(false);
  let panelEl;
  // reopenTimer was part of an obsolete "save then reopen" flow — now
  // handleSave applies config in place.  Kept as `null` to avoid
  // touching callers that reference it; remove once confirmed unused.
  let reopenTimer = null;

  const currentModelName = $derived(config?.model_name || modelInfo.filename || "Unknown Model");
  const currentVersion = $derived(config?.version || "");
  const detectedArch = $derived(config?.architecture || modelInfo.architecture || "");
  const currentArch = $derived(detectedArch === "unknown" ? "" : detectedArch);
  const currentFamily = $derived(config?.family || "");
  const userSaved = $derived(config?._user_saved || false);

  let titleText = $derived(currentVersion ? `${currentModelName} - ${currentVersion}` : currentModelName);

  // Meta line parts
  let metaParts = $derived.by(() => {
    const parts = [];
    if (currentArch) {
      const archLabel = ARCHITECTURES.find(a => a.id === currentArch)?.label || currentArch;
      const familyLabel = currentFamily
        ? (FAMILIES[currentArch]?.find(f => f.id === currentFamily)?.label || currentFamily)
        : "";
      parts.push(familyLabel ? `${archLabel} / ${familyLabel}` : archLabel);
    }
    if (config?.author) parts.push(config.author);
    return parts;
  });

  // Position panel relative to anchor
  let panelStyle = $state("");

  function positionPanel() {
    if (!panelEl || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const panelHeight = panelEl.offsetHeight;
    const gap = 4;
    const padding = 8;
    const spaceAbove = rect.top - padding;
    const spaceBelow = window.innerHeight - rect.bottom - padding;

    let style = `left:${rect.left}px;`;
    if (spaceBelow >= panelHeight + gap || spaceBelow >= spaceAbove) {
      style += `top:${rect.bottom + gap}px;bottom:auto;max-height:${spaceBelow - gap}px;`;
    } else {
      style += `bottom:${window.innerHeight - rect.top}px;top:auto;max-height:${spaceAbove - gap}px;`;
    }
    panelStyle = style;
  }

  // Position on mount — rAF ensures bind:this has set panelEl before we read it
  $effect(() => {
    untrack(() => {
      requestAnimationFrame(() => positionPanel());
    });
  });

  // Outside click handler — $effect runs after the opening click has propagated,
  // so registering synchronously is safe and ensures cleanup always pairs.
  $effect(() => {
    function onOutsideClick(e) {
      if (panelEl && !panelEl.contains(e.target)) {
        if (e.target.closest?.(".pcr-model-indicator")) return;
        if (e.target.closest?.(".pcr-resolution-preset-menu")) return;
        if (e.target.closest?.(".pcr-mode-menu")) return;
        if (e.target.closest?.(".pcr-footer-dropdown-menu")) return;
        onClose();
      }
    }
    document.addEventListener("pointerdown", onOutsideClick, true);
    return () => document.removeEventListener("pointerdown", onOutsideClick, true);
  });

  // Fetch versions.  Both calls share an AbortController so a fast
  // versionModelName change can't let a stale response clobber the
  // current model's version list.
  let versionFetchAbort = null;
  $effect(() => {
    const versionModelName = untrack(() => config?.model_name || modelInfo.filename || "");
    if (!versionModelName) return;
    versionFetchAbort?.abort();
    versionFetchAbort = new AbortController();
    const signal = versionFetchAbort.signal;

    fetch(`/promptchain/models/version-details?name=${encodeURIComponent(versionModelName)}`, { signal })
      .then(r => r.ok ? r.json() : { versions: [] })
      .then(({ versions: v }) => { if (!signal.aborted) versions = v || []; })
      .catch(e => { if (e.name !== "AbortError") console.error("[PromptChain] version-details failed:", e); });

    fetch(`/promptchain/models/older-versions?name=${encodeURIComponent(versionModelName)}`, { signal })
      .then(r => r.ok ? r.json() : { versions: [] })
      .then(({ versions: v }) => { if (!signal.aborted) olderVersions = v; })
      .catch(e => { if (e.name !== "AbortError") console.error("[PromptChain] older-versions failed:", e); });
  });

  // Raw CivitAI payload — merging / dedup happens in `mergedVersions`
  // below so we have access to the installed `versions` list too.
  let civitaiPayload = $state({ versions: [], installed_version_ids: [], fetched_at: null });
  let civitaiRefreshing = $state(false);
  let civitaiVersionsAbort = null;

  // Module-scope-equivalent: track which hashes we've already auto-
  // detected this session so we don't re-hit /detect on every panel
  // open for a model that truly has no CivitAI origin.
  const _autoDetectedHashes = (window.__pcrAutoDetectedHashes ||= new Set());

  async function maybeAutoDetect() {
    const hash = modelInfo?.hash;
    if (!hash) return;
    if (config?.civitai_model_id) return;
    if (_autoDetectedHashes.has(hash)) return;
    _autoDetectedHashes.add(hash);
    try {
      const res = await fetch("/promptchain/models/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quick_hash: hash }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.status === "found" && data?.settings) {
        // Merge the detected settings into the local config so the
        // versions effect reruns with the freshly-known model_id.
        config = { ...(config || {}), ...data.settings };
      }
    } catch {}
  }

  async function fetchCivitaiVersions(modelId, { force = false } = {}) {
    civitaiVersionsAbort?.abort();
    civitaiVersionsAbort = new AbortController();
    const signal = civitaiVersionsAbort.signal;
    const url = `/promptchain/civitai/model-versions?model_id=${modelId}${force ? "&force=1" : ""}`;
    try {
      const r = await fetch(url, { signal });
      if (!r.ok) return;
      const data = await r.json();
      if (!signal.aborted) civitaiPayload = data;
    } catch (e) {
      if (e.name !== "AbortError") console.error("[PromptChain] civitai model-versions failed:", e);
    }
  }

  $effect(() => {
    const modelId = config?.civitai_model_id;
    if (!modelId) {
      civitaiPayload = { versions: [], installed_version_ids: [], fetched_at: null };
      untrack(() => maybeAutoDetect());
      return;
    }
    fetchCivitaiVersions(modelId);
  });

  async function refreshCivitaiVersions() {
    const modelId = config?.civitai_model_id;
    if (!modelId || civitaiRefreshing) return;
    civitaiRefreshing = true;
    await fetchCivitaiVersions(modelId, { force: true });
    civitaiRefreshing = false;
  }

  // Keep "v" optional, strip emojis/punctuation as separator rather
  // than glue — "v1.0 - Style A" → "1.0 style a" (preserves the Style
  // suffix that distinguishes it from "1.0 - Style B").  "v7.77🆕"
  // still collapses to "7.77".
  function normalizeVersion(s) {
    return (s || "")
      .toLowerCase()
      .replace(/^v\s*/, "")
      .replace(/[^a-z0-9. ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Pretty-print "fetched N ago" for the refresh-button tooltip.
  function formatAgo(epochSeconds) {
    if (!epochSeconds) return "just now";
    const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }

  // One grid, sorted by publish date desc.  Installed versions come
  // from the local catalog; CivitAI versions are filtered to ones we
  // don't already have.  Primary dedup = civitai_version_id; name-
  // based fallback only fires when the CivitAI entry has NO id match
  // anywhere in the installed set, so "1.0 - Style A" vs "1.0 - Style
  // B" can't collide as long as at least one side carries an id.
  let mergedVersions = $derived.by(() => {
    const installedIds = new Set(civitaiPayload.installed_version_ids || []);
    const installedNames = new Set(versions.map(v => normalizeVersion(v.version)).filter(Boolean));
    const currentLocalName = normalizeVersion(config?.version || "");
    if (currentLocalName) installedNames.add(currentLocalName);

    // Newest local publish date: prefer dates from CivitAI entries
    // that match an installed id (authoritative), fall back to name
    // match against installed local versions, fall back to
    // config.release_date.  Only applied as a filter if non-empty.
    let localMaxDate = "";
    for (const v of civitaiPayload.versions || []) {
      const matchById = installedIds.has(v.civitai_version_id);
      const matchByName = installedNames.has(normalizeVersion(v.version_name));
      if ((matchById || matchByName) && (v.published_at || "") > localMaxDate) {
        localMaxDate = v.published_at || "";
      }
    }
    if (!localMaxDate && config?.release_date) localMaxDate = config.release_date;

    const out = [];
    for (const v of versions) {
      out.push({ kind: "installed", date: v.release_date || "", ver: v });
    }
    // Date compare on the YYYY-MM-DD prefix only.  published_at is a
    // full ISO timestamp while config.release_date is stored as just
    // the date portion — raw string compare "2026-02-27T10:00:00Z"
    // vs "2026-02-27" returns true erroneously on the longer-string
    // tie-break.  Truncating keeps both sides on the same granularity.
    const localMaxDay = localMaxDate.slice(0, 10);
    for (const v of civitaiPayload.versions || []) {
      if (!v.file) continue;
      // Primary dedup: civitai_version_id match against installed set.
      if (installedIds.has(v.civitai_version_id)) continue;
      // Fallback: normalized version-name match, for older local
      // configs that don't carry civitai_version_id.  The normalizer
      // preserves word boundaries so "1.0 Style A" and "1.0 Style B"
      // stay distinct; only cosmetic noise like emojis gets stripped.
      if (installedNames.has(normalizeVersion(v.version_name))) continue;
      if (localMaxDay && (v.published_at || "").slice(0, 10) <= localMaxDay) continue;
      out.push({ kind: "civitai", date: v.published_at || "", ver: v });
    }
    out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return out;
  });

  function safeHostname(url) {
    try { return new URL(url).hostname; } catch { return url; }
  }

  async function handleSave(newConfig) {
    const resp = await fetch(`/promptchain/models/settings/${modelInfo.hash}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newConfig),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    // Apply the just-saved config to local state instead of reopening
    // the whole modal — the old 600ms reopen timer would wipe any
    // edits made in the meantime.
    config = newConfig;
  }

  function handleConfigUpdate(newConfig) {
    config = newConfig;
  }

  function handleShowCatalogDownload(ver) {
    onShowCatalogDownload(ver);
  }
</script>

<div class="pcr-model-dropdown-panel" bind:this={panelEl} style={panelStyle}>
  <!-- Header -->
  <div class="pcr-model-panel-header">
    <div class="pcr-model-panel-title-row">
      <div class="pcr-model-panel-title">{titleText}</div>
      <button class="pcr-model-panel-switch-btn"
        onclick={(e) => { e.stopPropagation(); onOpenPicker(); }}>
        Models <span class="pcr-model-panel-switch-arrow">▼</span>
      </button>
    </div>

    <!-- Meta line -->
    <div class="pcr-model-panel-meta">
      {#each metaParts as part, i}
        {#if i > 0}
          <span class="pcr-model-panel-meta-sep">&middot;</span>
        {/if}
        <span>{part}</span>
      {/each}
      {#if config?.url}
        {#if metaParts.length}
          <span class="pcr-model-panel-meta-sep">&middot;</span>
        {/if}
        <a href={config.url} target="_blank" rel="noopener" title={config.url}>
          {safeHostname(config.url)}
        </a>
      {/if}
      {#if metaParts.length || config?.url}
        <span class="pcr-model-panel-meta-sep">&middot;</span>
      {/if}
      <span class="pcr-model-panel-meta-hash">{modelInfo.hash}</span>
    </div>

    <!-- Version bar — installed + newer CivitAI entries, sorted by
         publish date desc.  The ⟳ button busts the versions cache
         and refetches. -->
    {#if mergedVersions.length > 1 || config?.civitai_model_id}
      <div class="pcr-model-panel-versions-grid">
        {#each mergedVersions as entry}
          {#if entry.kind === "installed"}
            <button class="pcr-model-panel-version-btn"
              class:pcr-version-active={entry.ver.hash === modelInfo.hash}
              title={entry.ver.filename || entry.ver.hash}
              onclick={(e) => {
                e.stopPropagation();
                if (entry.ver.hash !== modelInfo.hash) onSwitchVersion(entry.ver);
              }}>
              {entry.ver.version}
            </button>
          {:else}
            <button class="pcr-model-panel-version-btn pcr-version-download"
              title={`Download ${entry.ver.version_name} from CivitAI`}
              onclick={(e) => { e.stopPropagation(); onShowDownload?.(entry.ver); }}>
              {entry.ver.version_name} ↓
            </button>
          {/if}
        {/each}
        {#if config?.civitai_model_id}
          <button class="pcr-model-panel-refresh-btn"
            class:pcr-refreshing={civitaiRefreshing}
            title={civitaiPayload.fetched_at
              ? `Fetched ${formatAgo(civitaiPayload.fetched_at)} — click to refresh from CivitAI`
              : "Refresh from CivitAI"}
            disabled={civitaiRefreshing}
            onclick={(e) => { e.stopPropagation(); refreshCivitaiVersions(); }}>
            ⟳
          </button>
        {/if}
      </div>
    {/if}

    <!-- Older versions -->
    {#if olderVersions.length}
      <div class="pcr-older-versions-wrap">
        <button class="pcr-older-versions-toggle"
          onclick={(e) => { e.stopPropagation(); showOlderVersions = !showOlderVersions; }}>
          Older Versions ({olderVersions.length})
          <span class="pcr-older-versions-arrow">{showOlderVersions ? " ▲" : " ▼"}</span>
        </button>
        {#if showOlderVersions}
          <div class="pcr-older-versions-list">
            {#each olderVersions as ver}
              <div class="pcr-older-versions-row"
                onclick={(e) => { e.stopPropagation(); handleShowCatalogDownload(ver); }}>
                <span>{ver.display_name || `${ver.model_name} ${ver.version}`}</span>
                <span class="pcr-older-versions-arch">
                  {[ver.architecture, ver.family].filter(Boolean).join(" · ")}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Tab content panels (rendered but hidden for non-active tabs).
       Each pane is a min-height:0 flex column so the panel's max-height
       constraint reaches .pcr-model-panel-body and it scrolls instead of
       spilling past the panel border. -->
  <div class="pcr-model-tab-pane" style:display={activeTab === "settings" ? "" : "none"}>
    <SettingsTab
      {detected}
      savedConfig={config}
      {rangeMode}
      {expandedSections}
      {readWidgetValue}
      {readWidgetOptions}
      {writeWidgetValue}
      {resolveResolutionTicks}
      {injectableNodes}
      onSave={handleSave}
      {onReopen}
      {onInjectNode}
      {pcNode}
      architecture={detectedArch}
      family={currentFamily}
      {onApplyStyleLora}
      {onClose} />
  </div>

  <div class="pcr-model-tab-pane" style:display={activeTab === "templates" ? "" : "none"}>
    <TemplatesTab
      {modelInfo}
      savedConfig={config}
      {onApplyTemplate}
      {captureWorkflowGraph} />
  </div>

  <div class="pcr-model-tab-pane" style:display={activeTab === "prompts" ? "" : "none"}>
    <PromptsTab
      {modelInfo}
      savedConfig={config}
      {getEditor}
      {onClose} />
  </div>

  <div class="pcr-model-tab-pane" style:display={activeTab === "info" ? "" : "none"}>
    <InfoTab
      {modelInfo}
      savedConfig={config}
      architectures={ARCHITECTURES}
      families={FAMILIES}
      onConfigUpdate={handleConfigUpdate} />
  </div>

  <!-- Tab bar (rendered at the bottom, after tab content panels) -->
  <div class="pcr-model-panel-tabs">
    {#each TABS as tab}
      <div class="pcr-model-panel-tab"
        class:pcr-model-panel-tab-active={activeTab === tab.id}
        onclick={(e) => {
          e.stopPropagation();
          if (rangeMode && tab.id !== "settings") {
            onReopen({ rangeMode: false, tab: tab.id });
            return;
          }
          activeTab = tab.id;
        }}>
        {tab.label}
      </div>
    {/each}
  </div>
</div>

<style>
  .pcr-model-dropdown-panel {
    position: fixed;
    background: rgba(30, 30, 30, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.6);
    width: 400px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    z-index: 100000;
    color: #ddd;
  }
  .pcr-model-panel-header {
    padding: 12px 16px 12px;
    border-bottom: 1px solid #333;
  }
  /* min-height:0 lets the pane shrink below its content inside the
     max-height-capped panel, so the tab body scrolls instead of the
     whole pane overflowing the panel border. */
  .pcr-model-tab-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .pcr-model-panel-title {
    font-size: 15px;
    font-weight: 600;
    color: #59b8fb;
    flex: 1;
    min-width: 0;
    margin-top: -7px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pcr-model-panel-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  /* metadata summary line */
  .pcr-model-panel-meta { font-size: 10px; color: #666; display: flex; align-items: center; flex-wrap: wrap; }
  .pcr-model-panel-meta-sep { margin: 0 5px; color: #444; }
  .pcr-model-panel-meta a { color: #4fc3f7; text-decoration: none; }
  .pcr-model-panel-meta a:hover { text-decoration: underline; }
  .pcr-model-panel-meta-hash { font-family: monospace; color: #555; }

  /* version switcher chips */
  .pcr-model-panel-versions-grid { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
  .pcr-model-panel-version-btn {
    padding: 2px 6px; font-size: 11px;
    background: rgba(255, 255, 255, 0.06); border: 1px solid #444;
    border-radius: 4px; color: #999; cursor: pointer;
  }
  .pcr-model-panel-version-btn:hover { background: rgba(255, 255, 255, 0.1); border-color: #666; color: #ddd; }
  .pcr-version-active { background: rgb(54 242 60 / 15%); border-color: #336a21; color: #50d04e; cursor: default; }
  .pcr-version-active:hover { background: rgb(54 242 60 / 22%); border-color: #3d7d28; color: #5eda5c; }
  .pcr-version-download { background: rgba(79, 195, 247, 0.1); border-color: rgba(79, 195, 247, 0.4); color: #4fc3f7; }
  .pcr-version-download:hover { background: rgba(79, 195, 247, 0.2); border-color: #4fc3f7; color: #7fd4fa; }

  /* refresh button — same pill silhouette as version bubbles so the
     whole row reads as a single toolbar. */
  .pcr-model-panel-refresh-btn {
    margin-left: auto;
    padding: 2px 7px;
    font-size: 12px;
    line-height: 1;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #666;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }
  .pcr-model-panel-refresh-btn:hover { color: #4fc3f7; border-color: rgba(79, 195, 247, 0.3); }
  .pcr-model-panel-refresh-btn:disabled { cursor: default; }
  .pcr-refreshing { color: #4fc3f7; animation: pcr-spin 0.9s linear infinite; }
  @keyframes pcr-spin { to { transform: rotate(360deg); } }

  /* older versions dropdown */
  .pcr-older-versions-wrap { margin-top: 6px; }
  .pcr-older-versions-toggle {
    background: none; border: none; color: #666; font-size: 10px;
    cursor: pointer; padding: 0; display: flex; align-items: center; gap: 2px;
  }
  .pcr-older-versions-toggle:hover { color: #999; }
  .pcr-older-versions-arrow { font-size: 8px; }
  .pcr-older-versions-list {
    margin-top: 4px; border: 1px solid #333; border-radius: 4px;
    background: rgba(0, 0, 0, 0.3); max-height: 150px; overflow-y: auto;
  }
  .pcr-older-versions-row {
    padding: 5px 8px; cursor: pointer; display: flex; justify-content: space-between;
    align-items: center; font-size: 11px; color: #999; border-bottom: 1px solid #222;
  }
  .pcr-older-versions-row:last-child { border-bottom: none; }
  .pcr-older-versions-row:hover { background: rgba(255, 255, 255, 0.06); color: #ddd; }
  .pcr-older-versions-arch { font-size: 10px; color: #555; }

  /* version count badge in picker */
  .pcr-model-version-badge {
    display: inline-block; font-size: 10px; padding: 0 4px; margin-left: 6px;
    background: rgba(79, 195, 247, 0.15); color: #4fc3f7;
    border-radius: 8px; vertical-align: middle;
  }
  /* version submenu header */
  .pcr-picker-submenu-header { padding: 6px 12px 4px; font-size: 10px; color: #666; letter-spacing: 0.5px; }

  /* switch model button */
  .pcr-model-panel-switch-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    margin-right: -6px;
    background: transparent;
    border: none;
    color: #808080;
    font-size: 13px;
    cursor: pointer;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .pcr-model-panel-switch-btn:hover {
    color: #ccc;
    background: rgba(255, 255, 255, 0.1);
  }
  .pcr-model-panel-switch-arrow {
    font-size: 10px;
  }
  .pcr-model-panel-range-toggle {
    padding: 3px 10px;
    background: #333;
    color: #aaa;
    border: 1px solid #555;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .pcr-model-panel-range-toggle:hover { background: #444; color: #ddd; }
  .pcr-model-panel-range-toggle.pcr-range-active {
    background: #0e639c;
    border-color: #0e639c;
    color: #fff;
  }

  /* tab bar */
  .pcr-model-panel-tabs {
    display: flex;
    flex-shrink: 0;
  }
  .pcr-model-panel-tab {
    flex: 1;
    text-align: center;
    padding: 12px 0;
    font-size: 12px;
    color: #959595;
    cursor: pointer;
    background: #242424;
    border-top: 2px solid #333;
    transition: color 0.15s, background 0.15s;
  }
  .pcr-model-panel-tab:not(:last-child) {
    border-right: 1px solid #333;
  }
  .pcr-model-panel-tab:first-child {
    border-bottom-left-radius: 7px;
  }
  .pcr-model-panel-tab:last-child {
    border-bottom-right-radius: 7px;
  }
  .pcr-model-panel-tab:not(.pcr-model-panel-tab-active):hover { color: #aaa; background: #282828; }
  .pcr-model-panel-tab-active {
    color: #4fc3f7;
    background: rgb(22 45 79 / 98%);
    border-top-color: #4fc3f7;
  }
</style>
