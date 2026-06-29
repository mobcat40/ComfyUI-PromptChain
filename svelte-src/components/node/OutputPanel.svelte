<script>
  // Output panel — VSCode-style split panel below the editor.
  // Prompt Output tab + Generated tab with gallery.

  import { onMount, onDestroy } from "svelte";
  import { useApi } from "../../lib/api-context.js";
  import PromptOutput from "./PromptOutput.svelte";
  import ConsoleLog from "./ConsoleLog.svelte";
  import GeneratedGallery from "../gallery/GeneratedGallery.svelte";
  import { zoomGalleryRowHeight, clampGalleryRowHeight } from "../../lib/gallery-zoom.js";

  const DEFAULT_HEIGHT = 120;
  const MIN_HEIGHT = 60;
  const SNAP_MARGIN = 50;
  const MAXIMIZE_DRAG_THRESHOLD = -10;

  let {
    node,
    shared,
    // toggle callback
    onToggle = () => {},
    // registration callback — passes API object to parent
    onRegister = null,
  } = $props();

  const { apiURL, fetchApi, toast, getWorkflowId, fetchWorkflowImages,
    fetchWorkflowCount, subscribeHistory, invalidateCache, openViewer,
    getCanvasScale } = useApi();

  let panelEl;
  let handleEl;
  let isOpen = $state(!!node.properties?.pcrOutputPanel);
  // Which node.property the active tab writes to. Swapped by the fullscreen
  // bridge to "pcrFsOutputTab" while the overlay is open so node-mode and
  // fullscreen-mode tab selections stay independent, then back to
  // "pcrOutputTab" on exit.
  let persistKey = $state("pcrOutputTab");
  let activeTab = $state(node.properties?.[persistKey] || "prompt");
  let isMaximized = $state(false);
  let panelHeight = $state(node.properties?.pcrPanelHeight || DEFAULT_HEIGHT);
  let savedMaxHeight = null;

  // gallery state
  let generatedLoaded = $state(false);
  let generatedCount = $state(0);
  let galleryImages = $state([]);
  let galleryRowHeight = $state(clampGalleryRowHeight(node.properties?.pcrGalleryRowHeight || 100));
  let galleryViewMode = $state(node.properties?.pcrGalleryViewMode || "justified");

  // External subscribers (e.g. fullscreen bridge's topbar-icon sync).
  // Fires on every open/close, including the panel's own close control
  // which calls close() in component scope and would otherwise bypass
  // any wrapper on the registered API.
  let toggleListener = null;
  function emitToggle(open) {
    onToggle(open);
    toggleListener?.(open);
  }
  function setToggleListener(cb) { toggleListener = cb; }

  // register API with parent
  onMount(() => {
    onRegister?.({
      toggle, open, close, openPrompt, getIsOpen, setToggleListener, cleanup,
      switchTab, setPersistKey, loadGenerated, reloadGenerated,
      updateGalleryZoom,
      updateGeneratedCount: (n) => { generatedCount = n; },
    });
  });

  // history subscription
  let unsubHistory;
  onMount(() => {
    unsubHistory = subscribeHistory((workflowId) => {
      const wid = getWorkflowId();
      if (workflowId !== wid) return;
      generatedLoaded = false;
      loadGenerated();
    });
    // restore open state
    if (node.properties?.pcrOutputPanel) {
      requestAnimationFrame(() => open());
    }
  });
  onDestroy(() => unsubHistory?.());

  // file deletion + workflow change event listeners
  function onFileDeleted(e) {
    const { scope, paths } = e.detail || {};
    if (scope !== "output" || !paths?.length) return;
    const pathSet = new Set(paths);
    const before = galleryImages.length;
    galleryImages = galleryImages.filter(i => {
      const p = i.subfolder ? `${i.subfolder}/${i.filename}` : i.filename;
      return !pathSet.has(p);
    });
    if (galleryImages.length !== before) {
      invalidateCache(getWorkflowId());
    }
  }

  function onWorkflowChanged() {
    generatedLoaded = false;
    loadGenerated();
  }

  onMount(() => {
    window.addEventListener("promptchain:file-deleted", onFileDeleted);
    window.addEventListener("promptchain:workflow-uuid-changed", onWorkflowChanged);
    return () => {
      window.removeEventListener("promptchain:file-deleted", onFileDeleted);
      window.removeEventListener("promptchain:workflow-uuid-changed", onWorkflowChanged);
    };
  });

  async function loadGenerated() {
    if (generatedLoaded) return;
    generatedLoaded = true;
    const wid = getWorkflowId();
    if (!wid) return;
    galleryImages = await fetchWorkflowImages(wid);
    generatedCount = galleryImages.length;
  }

  async function reloadGenerated() {
    generatedLoaded = false;
    await loadGenerated();
  }

  function switchTab(tab) {
    activeTab = tab;
    if (node.properties) node.properties[persistKey] = tab;
    if (tab === "generated") {
      // Fire-and-forget but with error logging so a failed fetch doesn't
      // propagate as an uncaught rejection (which kills the extension).
      loadGenerated().catch(e => console.error("[PromptChain] loadGenerated failed:", e));
    }
  }

  // Swap the node.property key that tab clicks write to, and sync the
  // visible tab from the new key's stored value. Used by fullscreen-bridge
  // on overlay enter/exit to give node mode and fullscreen mode their own
  // independent tab memory.
  function setPersistKey(key) {
    persistKey = key;
    const stored = node.properties?.[key] || "prompt";
    if (stored !== activeTab) {
      activeTab = stored;
      if (stored === "generated") {
        loadGenerated().catch(e => console.error("[PromptChain] loadGenerated failed:", e));
      }
    }
  }

  export function open() {
    isOpen = true;
    if (node.properties) node.properties.pcrOutputPanel = true;
    if (node.properties?.pcrPanelMaximized && !isMaximized) {
      setMaximized(true);
    }
    emitToggle(true);
    if (activeTab === "generated") loadGenerated();
    else if (!generatedLoaded) {
      const wid = getWorkflowId();
      if (wid) fetchWorkflowCount(wid).then(c => { generatedCount = c; });
    }
  }

  export function close() {
    if (isMaximized) setMaximized(false);
    isOpen = false;
    if (node.properties) node.properties.pcrOutputPanel = false;
    emitToggle(false);
  }

  export function toggle() { isOpen ? close() : open(); }

  export function openPrompt() {
    if (isOpen && activeTab === "prompt") {
      close();
    } else {
      open();
      switchTab("prompt");
    }
  }

  export function getIsOpen() { return isOpen; }

  function cleanup() {
    resizeAc?.abort();
    unsubHistory?.();
  }

  function updateGalleryZoom(delta) {
    // delta arrives as ±1 from the window-capture wheel handler in
    // isolation.js (node mode) and FullscreenEditor's overlay handler;
    // fullscreen-bridge passes 0 as a clamp-only nudge on overlay exit.
    galleryRowHeight = zoomGalleryRowHeight(galleryRowHeight, delta);
    if (node.properties) node.properties.pcrGalleryRowHeight = galleryRowHeight;
  }

  function setMaximized(maximize, restoreHeight) {
    if (maximize) {
      savedMaxHeight = panelHeight;
      isMaximized = true;
    } else {
      panelHeight = restoreHeight || savedMaxHeight || DEFAULT_HEIGHT;
      isMaximized = false;
    }
    if (node.properties) node.properties.pcrPanelMaximized = isMaximized;
  }

  function handleMaximizeClick() {
    if (isMaximized) {
      setMaximized(false, Math.round((panelEl?.parentElement?.clientHeight || 400) * 0.3));
    } else {
      setMaximized(true);
    }
  }

  // resize drag — uses document-level capture events
  let resizeAc;
  onMount(() => {
    resizeAc = new AbortController();
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    document.addEventListener("pointerdown", (e) => {
      if (!handleEl || (e.target !== handleEl && !handleEl.contains(e.target))) return;
      isResizing = true;
      startY = e.clientY;
      startHeight = panelEl?.offsetHeight || panelHeight;
      handleEl.style.background = "rgba(79, 195, 247, 0.8)";
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const canvas = document.querySelector("canvas.lgraphcanvas");
      if (canvas && typeof e.pointerId === "number") {
        try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch {}
      }
    }, { capture: true, signal: resizeAc.signal });

    document.addEventListener("pointermove", (e) => {
      if (!isResizing) return;
      e.preventDefault();
      e.stopPropagation();
      const inFs = !!document.querySelector(".pcr-fs-overlay");
      const scale = inFs ? 1 : getCanvasScale();
      const delta = (startY - e.clientY) / scale;
      const newHeight = Math.max(MIN_HEIGHT, startHeight + delta);
      const parentHeight = (panelEl?.parentElement)?.clientHeight || 600;

      if (isMaximized && delta < MAXIMIZE_DRAG_THRESHOLD) {
        const exitHeight = parentHeight - SNAP_MARGIN;
        setMaximized(false, exitHeight);
        startY = e.clientY;
        startHeight = exitHeight;
      } else if (!isMaximized) {
        if (newHeight >= parentHeight - SNAP_MARGIN) {
          setMaximized(true);
          startY = e.clientY;
          startHeight = parentHeight;
        } else {
          panelHeight = newHeight;
        }
      }
    }, { capture: true, signal: resizeAc.signal });

    document.addEventListener("pointerup", () => {
      if (!isResizing) return;
      isResizing = false;
      if (handleEl) handleEl.style.background = "";
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (node.properties && !isMaximized) {
        node.properties.pcrPanelHeight = panelHeight;
      }
    }, { capture: true, signal: resizeAc.signal });
  });
  onDestroy(() => resizeAc?.abort());
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={handleEl}
  class="pcr-output-panel-resize"
  class:pcr-resize-hidden={isMaximized}
  style:display={isOpen ? "block" : "none"}
></div>
<div
  bind:this={panelEl}
  class="pcr-output-panel"
  style:height={isMaximized ? "100%" : `${panelHeight}px`}
  style:display={isOpen ? "flex" : "none"}
  onpointerdown={(e) => e.stopPropagation()}
  onmousedown={(e) => e.stopPropagation()}
>
    <!-- header -->
    <div class="pcr-output-panel-header">
      <div class="pcr-output-panel-tabs">
        <button
          class="pcr-output-panel-tab"
          class:pcr-output-panel-tab-active={activeTab === "prompt"}
          onclick={() => switchTab("prompt")}
        >Prompt Output</button>
        <button
          class="pcr-output-panel-tab"
          class:pcr-output-panel-tab-active={activeTab === "generated"}
          onclick={() => switchTab("generated")}
        >{generatedCount > 0 ? `${generatedCount} Generated` : "Generated"}</button>
        <button
          class="pcr-output-panel-tab"
          class:pcr-output-panel-tab-active={activeTab === "console"}
          onclick={() => switchTab("console")}
        >Console</button>
      </div>
      <div class="pcr-output-panel-controls">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pcr-output-panel-maximize" onclick={handleMaximizeClick}
          title={isMaximized ? "Restore Panel" : "Maximize Panel"}>{"\u26F6"}</div>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pcr-output-panel-close" onclick={() => close()} title="Close Panel">{"\u2715"}</div>
      </div>
    </div>

    <!-- prompt output tab -->
    {#if activeTab === "prompt"}
      <PromptOutput compiledOutput={shared.compiledOutput} compiledNegOutput={shared.compiledNegOutput} compiledRegions={shared.compiledRegions} />
    {/if}

    <!-- console log tab — kept mounted to preserve log history across tab switches -->
    <div style:display={activeTab === "console" ? "flex" : "none"} style="flex:1 1 0;min-height:0;overflow:hidden;">
      <ConsoleLog active={activeTab === "console"} />
    </div>

    <!-- generated gallery tab -->
    {#if activeTab === "generated"}
      <div class="pcr-output-panel-generated pcr-scrollable" style="display:block">
        {#if generatedLoaded}
          <GeneratedGallery
            images={galleryImages}
            workflowId={getWorkflowId() || ""}
            viewMode={galleryViewMode}
            rowHeight={galleryRowHeight}
            {apiURL}
            fetchApi={fetchApi}
            {toast}
            onOpenViewer={(imgs, idx, wid) => openViewer(imgs, idx, wid)}
            onViewModeChange={(mode) => {
              galleryViewMode = mode;
              if (node.properties) node.properties.pcrGalleryViewMode = mode;
            }}
            onRowHeightChange={(h) => {
              galleryRowHeight = h;
              if (node.properties) node.properties.pcrGalleryRowHeight = h;
            }}
            onCountChange={(c) => { generatedCount = c; }}
            onDeleteImages={async (hashes) => {
              const wid = getWorkflowId();
              if (!wid) return;
              try {
                await fetchApi(`/promptchain/workflow/${wid}/clear`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ hashes }),
                });
                invalidateCache(wid);
                galleryImages = await fetchWorkflowImages(wid);
              } catch {}
            }}
            onDeleteFiles={async (hashes) => {
              const wid = getWorkflowId();
              if (!wid) return;
              try {
                const toDelete = galleryImages.filter(i => hashes.includes(i.hash));
                const paths = toDelete.map(i => i.subfolder ? `${i.subfolder}/${i.filename}` : i.filename);
                if (paths.length) {
                  await fetchApi("/promptchain/browse/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scope: "output", paths }),
                  });
                }
                await fetchApi(`/promptchain/workflow/${wid}/clear`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ hashes }),
                });
                invalidateCache(wid);
                galleryImages = await fetchWorkflowImages(wid);
                if (paths.length) {
                  window.dispatchEvent(new CustomEvent("promptchain:file-deleted", {
                    detail: { scope: "output", paths },
                  }));
                }
              } catch {}
            }}
            onClearHistory={async (action) => {
              const wid = getWorkflowId();
              if (!wid) return;
              if (action === "clear") {
                try {
                  await fetchApi(`/promptchain/workflow/${wid}/clear`, { method: "POST" });
                  invalidateCache(wid);
                  galleryImages = [];
                } catch {}
              } else {
                await reloadGenerated();
              }
            }}
          />
        {/if}
      </div>
    {/if}
  </div>

<style>
  .pcr-output-panel-resize {
    position: relative;
    height: 1px;
    background: #2a2a2a;
    cursor: ns-resize;
    flex-shrink: 0;
    overflow: visible;
    transition: background 0.15s;
    display: none;
  }
  .pcr-output-panel-resize::before {
    content: "";
    position: absolute;
    left: 0; right: 0;
    height: 8px; top: -4px;
    cursor: ns-resize;
    background: transparent;
  }
  .pcr-output-panel-resize.pcr-resize-hidden {
    background: rgb(0 0 0 / 51%);
  }
  .pcr-output-panel-resize:hover {
    background: rgba(79, 195, 247, 0.8);
  }
  .pcr-output-panel {
    display: none;
    flex-direction: column;
    background: rgb(0 0 0 / 40%);
    overflow: hidden;
    flex: 0 1 auto;
    min-height: 60px;
  }
  :global(.lg-node-widgets) .pcr-output-panel-header {
    background: rgb(0 0 0 / 22%);
  }
  .pcr-output-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0;
    background: rgb(0 0 0 / 32%);
    border-bottom: 1px solid rgba(233, 238, 255, 0.05);
    height: 32px;
    flex-shrink: 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
  }
  .pcr-output-panel-tabs {
    display: flex;
    align-items: center;
    gap: 0;
    height: 100%;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }
  .pcr-output-panel-tab {
    padding: 0 12px;
    height: 100%;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pcr-output-panel-tab:hover {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.05);
  }
  .pcr-output-panel-tab-active {
    color: rgba(255, 255, 255, 0.9);
    border-bottom-color: #4fc3f7;
  }
  .pcr-output-panel-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 4px;
  }
  .pcr-output-panel-maximize,
  .pcr-output-panel-close {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    padding: 4px 6px;
    line-height: 1;
    opacity: 0.8;
    transition: color 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }
  .pcr-output-panel-maximize:hover,
  .pcr-output-panel-close:hover { color: #fff; }
  .pcr-output-panel-generated {
    flex: 1 1 0;
    overflow-y: auto !important;
    overflow-x: hidden;
    min-height: 0;
    position: relative;
    background: repeating-linear-gradient(45deg, transparent, transparent 10px, #cccccc03 10px, #cccccc03 20px);
    display: none;
  }
</style>
