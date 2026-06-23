<script>
  // Menubar — toolbar above the editor with mode dropdown and action buttons.
  // Mode dropdown is now a Svelte ModeMenu component (no imperative popup dependency).

  import { onDestroy } from "svelte";
  import { app } from "/scripts/app.js";
  import ModeMenu from "../shared/ModeMenu.svelte";


  const MODE_COLORS = { combine: "#e99e2d", roll: "#da3e65", switch: "#73d952", iterate: "#33bdff" };
  const DISPLAY_LABELS = { combine: "Combine Inputs", roll: "Randomize Inputs" };

  let {
    node,
    shared,
    // When true, hide the "Fullscreen" and "Collapse" buttons — they
    // don't make sense when the Menubar is already rendered inside the
    // fullscreen overlay.
    inFullscreen = false,
    onSetMode = () => {},
    onToggleLock = () => {},
    onToggleDisable = () => {},
    onToggleCollapse = () => {},
    onToggleOutput = () => {},
    onToggleImage = () => {},
    onToggleAssistant = () => {},
    onTogglePose = () => {},
    onToggleRegion = () => {},
    onOpenFullscreen = () => {},
    onResetIterate = null,
    docDropdownEl = null,
  } = $props();

  let docSlot;
  let modeAreaEl;
  let showModeMenu = $state(false);
  let modeMenuRect = $state(null);
  // Track the currently-adopted dropdown element and the parent we took it
  // from. When docDropdownEl changes (switching active nodes in fullscreen),
  // the effect releases the previous element to its home and adopts the new
  // one. Without per-element tracking, the first-adoption guard would block
  // subsequent nodes' dropdowns and leave stale elements in docSlot.
  let adoptedEl = null;
  let adoptedHome = null;

  $effect(() => {
    if (adoptedEl === docDropdownEl) return;

    if (adoptedEl) {
      if (adoptedHome && adoptedHome.isConnected) {
        adoptedHome.appendChild(adoptedEl);
      } else {
        adoptedEl.remove();
      }
    }
    adoptedEl = null;
    adoptedHome = null;

    if (!docDropdownEl || !docSlot) return;
    if (docSlot.contains(docDropdownEl)) { adoptedEl = docDropdownEl; return; }
    if (inFullscreen) {
      adoptedHome = docDropdownEl.parentElement;
    }
    docSlot.appendChild(docDropdownEl);
    adoptedEl = docDropdownEl;
  });

  onDestroy(() => {
    if (adoptedEl && adoptedHome && adoptedHome.isConnected) {
      adoptedHome.appendChild(adoptedEl);
    }
  });

  // AI Assistant is experimental and hidden unless the user opted in via
  // Settings > PromptChain > AI. The settings onChange broadcasts the event
  // so already-mounted menubars react without a reload.
  let aiAssistantEnabled = $state(
    app.ui?.settings?.getSettingValue?.("PromptChain.AIAssistantEnabled") === true
  );
  const aiEnabledChanged = (e) => { aiAssistantEnabled = e.detail?.value === true; };
  window.addEventListener("promptchain:ai-assistant-enabled-changed", aiEnabledChanged);
  onDestroy(() => window.removeEventListener("promptchain:ai-assistant-enabled-changed", aiEnabledChanged));

  let showMode = $derived(shared.connectedCount > 0 || shared.hasLabels);

  let modeLabelText = $derived.by(() => {
    if (!showMode) return "";
    if (shared.mode === "switch") {
      return shared.switchIndex === 0 ? "None" : (shared.switchLabel || "Switch");
    }
    if (shared.mode === "iterate") {
      const total = shared.iterateTotal;
      if (total > 0) {
        const display = `(${shared.iterateCurrent + 1}/${total})`;
        return shared.iterateCycle > 1 ? `Iterate Inputs ${display} x${shared.iterateCycle}` : `Iterate Inputs ${display}`;
      }
      return "Iterate Inputs";
    }
    return DISPLAY_LABELS[shared.mode] || shared.mode;
  });

  let modeLabelColor = $derived.by(() => {
    if (shared.mode === "switch" && shared.switchIndex === 0) return "#b0b0b0";
    return MODE_COLORS[shared.mode] || "";
  });

  function handleModeClick(e) {
    e.stopPropagation();
    if (showModeMenu) {
      showModeMenu = false;
      return;
    }
    modeMenuRect = e.currentTarget.getBoundingClientRect();
    showModeMenu = true;
  }

  function handleModeSelect(mode) {
    onSetMode(mode);
    showModeMenu = false;
  }

  function handleSwitchSelect(opt) {
    onSetMode("switch", opt.index);
    showModeMenu = false;
  }

  function handleAction(action, e) {
    e.stopPropagation();
    if (action === "lock") onToggleLock();
    else if (action === "disable") onToggleDisable();
    else if (action === "image") onToggleImage();
    else if (action === "output") onToggleOutput();
    else if (action === "assistant") { if (aiAssistantEnabled) onToggleAssistant(); }
    else if (action === "pose") { if (shared.hasPoseStudio) onTogglePose(); }
    else if (action === "region") { if (shared.hasRegionBox) onToggleRegion(); }
    else if (action === "collapse") onToggleCollapse();
    else if (action === "maximize") onOpenFullscreen();
  }

  // direct DOM click listener — bypasses Svelte event delegation which can
  // miss clicks on {@html} SVG content inside <span> elements
  function actionClick(node, action) {
    function handler(e) { handleAction(action, e); }
    node.addEventListener("click", handler);
    return { destroy() { node.removeEventListener("click", handler); } };
  }
</script>

<div
  class="pcr-menubar"
  class:pcr-menubar--fullscreen={inFullscreen}
  class:pcr-menubar--locked={inFullscreen && shared?.locked && !shared?.disabled}
  class:pcr-menubar--disabled={inFullscreen && shared?.disabled}
>
  <div class="pcr-menubar-actions-left" bind:this={docSlot}></div>

  <div style="display:flex;align-items:center;min-width:0;">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={modeAreaEl}
      class="pcr-menubar-mode"
      style:display={showMode ? "" : "none"}
      style:pointer-events={showMode ? "" : "none"}
      onclick={handleModeClick}
    >
      <span class="pcr-menubar-mode-label" style:color={modeLabelColor}>{modeLabelText}</span>
      {#if showMode}
        <span class="pcr-menubar-mode-arrow">{"\u25BE"}</span>
      {/if}
    </div>

    <div class="pcr-menubar-actions">
      {#if aiAssistantEnabled}
        <span
          class="pcr-menubar-btn"
          class:pcr-menubar-btn-active={shared.aiAssistantOpen}
          style:color={shared.aiAssistantOpen ? "#a855f7" : ""}
          title="AI Assistant (experimental)"
          data-action="assistant"
          use:actionClick={"assistant"}
        >
          {@html '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 5.6 10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.9959.9959 0 0 0-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"/></svg>'}
        </span>
      {/if}

      <span
        class="pcr-menubar-btn"
        class:pcr-menubar-btn-active={shared.locked}
        style:color={shared.locked ? "#d2b115" : ""}
        title="Lock output"
        data-action="lock"
        use:actionClick={"lock"}
      >
        {@html shared.locked
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2s-2 .9-2 2s.9 2 2 2z"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2s-2 .9-2 2s.9 2 2 2z"/></svg>'}
      </span>

      <span
        class="pcr-menubar-btn"
        class:pcr-menubar-btn-active={shared.disabled}
        style:color={shared.disabled ? "#c42020" : ""}
        title="Disable node"
        data-action="disable"
        use:actionClick={"disable"}
      >
        {@html '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8c1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0 1 20 12c0 4.42-3.58 8-8 8z"/></svg>'}
      </span>

      {#if !inFullscreen}
        <span
          class="pcr-menubar-btn"
          class:pcr-menubar-btn-active={shared.posePanelVisible}
          class:pcr-menubar-btn-disabled={!shared.hasPoseStudio}
          style:color={shared.posePanelVisible ? "#ff8c1a" : ""}
          title={shared.hasPoseStudio ? "Toggle 3D Poser panel" : "Add a 3D Poser node to use this"}
          data-action="pose"
          use:actionClick={"pose"}
        >
          {@html '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 6c-2.61.7-5.67 1-8.5 1s-5.89-.3-8.5-1L3 8c1.86.5 4 .83 6 1v13h2v-6h2v6h2V9c2-.17 4.14-.5 6-1l-.5-2zM12 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>'}
        </span>

        <span
          class="pcr-menubar-btn"
          class:pcr-menubar-btn-active={shared.regionPanelVisible}
          class:pcr-menubar-btn-disabled={!shared.hasRegionBox}
          style:color={shared.regionPanelVisible ? "#42b9c4" : ""}
          title={shared.hasRegionBox ? "Toggle Region Box panel" : "Add a Region Box node to use this"}
          data-action="region"
          use:actionClick={"region"}
        >
          {@html '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2zM7 7v10h10V7H7zm8 8H9V9h6v6z"/></svg>'}
        </span>

        <span
          class="pcr-menubar-btn"
          class:pcr-menubar-btn-active={shared.imagePanelVisible}
          style:color={shared.imagePanelVisible ? "#4bb949" : ""}
          title="Toggle image preview"
          data-action="image"
          use:actionClick={"image"}
        >
          {@html '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>'}
        </span>

        <span
          class="pcr-menubar-btn"
          class:pcr-menubar-btn-active={shared.outputPanelOpen}
          style:color={shared.outputPanelOpen ? "#4fc3f7" : ""}
          title="Toggle output panel (Ctrl+`)"
          data-action="output"
          use:actionClick={"output"}
        >
          {@html '<svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor"><path d="M400-280h160v-80H400v80Zm0-160h280v-80H400v80ZM280-600h400v-80H280v80Zm200 120ZM80-80v-80h102q-48-23-77.5-68T75-330q0-79 55.5-134.5T265-520v80q-45 0-77.5 32T155-330q0 39 24 69t61 38v-97h80v240H80Zm320-40v-80h360v-560H200v160h-80v-160q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H400Z"/></svg>'}
        </span>
      {/if}

      {#if !inFullscreen}
        <span
          class="pcr-menubar-btn"
          title="Fullscreen editor"
          data-action="maximize"
          use:actionClick={"maximize"}
        >
          {@html '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm18 0v7h-7v-2h5v-5h2z"/></svg>'}
        </span>

        <span
          class="pcr-menubar-btn"
          class:pcr-menubar-btn-active={shared.collapsed}
          style:color={shared.collapsed ? "#5e79ff" : ""}
          title="Collapse editor"
          data-action="collapse"
          use:actionClick={"collapse"}
        >
          {@html '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.83 4H20a2 2 0 0 1 2 2v12c0 .34-.09.66-.23.94L20 17.17V8h-9.17l-4-4zm13.66 19.31L17.17 20H4a2 2 0 0 1-2-2V6c0-.34.08-.66.23-.94L.69 3.51L2.1 2.1l19.8 19.8l-1.41 1.41zM15.17 18l-10-10H4v10h11.17z"/></svg>'}
        </span>
      {/if}
    </div>
  </div>
</div>

{#if showModeMenu && modeMenuRect}
  <ModeMenu
    triggerRect={modeMenuRect}
    popupKey="menubar_{node?.id}"
    currentMode={shared.mode}
    currentSwitchIndex={shared.switchIndex}
    switchOptions={shared.switchOptions}
    hasMultipleOptions={shared.switchOptions.length > 1}
    onSelectMode={(mode) => handleModeSelect(mode)}
    onSelectSwitch={(opt) => handleSwitchSelect(opt)}
    onResetIterate={onResetIterate}
    onClose={() => { showModeMenu = false; }}
  />
{/if}

<style>
  .pcr-menubar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 3px 0 2px;
    height: 32px;
    background: rgb(0 0 0 / 60%);
    border-radius: 4px 4px 0 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    user-select: none;
    flex-shrink: 0;
    overflow: hidden;
  }
  :global(.lg-node-widgets) .pcr-menubar {
    background: rgb(0 0 0 / 55%);
  }
  /* In fullscreen mode the menubar sits directly under the tab bar on
     an editor-surface background — match that surface so it reads as
     "part of the editor" rather than a separate overlaid strip. */
  .pcr-menubar--fullscreen {
    background: var(--pcr-fs-editor-surface);
    border-radius: 0;
    border-bottom: none;
  }
  /* Solid tinted surface for locked/disabled panes — same tint as the
     editor body so they read as one continuous surface. */
  .pcr-menubar--locked { background: #251e0c; }
  .pcr-menubar--disabled { background: #271111; }
  .pcr-menubar-mode {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: background 0.15s;
    min-width: 0;
  }
  .pcr-menubar-mode:hover { background: rgba(255, 255, 255, 0.08); }
  .pcr-menubar-mode:hover .pcr-menubar-mode-label { color: rgba(255, 255, 255, 0.9); }
  .pcr-menubar-mode:hover .pcr-menubar-mode-arrow { color: rgba(255, 255, 255, 0.6); }
  .pcr-menubar-mode-label {
    color: rgba(255, 255, 255, 0.75);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pcr-menubar-mode-arrow {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
    flex-shrink: 0;
  }
  .pcr-menubar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .pcr-menubar-btn {
    cursor: pointer;
    padding: 4px 3px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.4);
    transition: background 0.15s, color 0.15s;
  }
  .pcr-menubar-btn:hover { background: rgba(255, 255, 255, 0.1); }
  .pcr-menubar-btn-active { color: inherit; }
  /* Disabled = no Poser node in the graph: dim + no hover affordance, but still
     hoverable so the "add a Poser node" tooltip shows. The click is no-op'd in
     handleAction, not via pointer-events (which would kill the tooltip). */
  .pcr-menubar-btn-disabled {
    opacity: 0.3;
    cursor: default;
  }
  .pcr-menubar-btn-disabled:hover { background: transparent; }
</style>
