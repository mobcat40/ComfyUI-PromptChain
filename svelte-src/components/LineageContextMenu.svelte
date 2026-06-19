<script>
  import { portal } from "../lib/portal.js";

  let {
    x, y,
    canExpand = false,
    canEdit = false,
    canDelete = false,
    isLocal = false,
    isWindows = false,
    orphaned = false,
    onAction, onClose,
  } = $props();

  let menuEl;

  function act(action) {
    onAction?.(action);
    onClose?.();
  }

  let pos = $derived((() => {
    const mw = 180, mh = 280;
    const vw = window.innerWidth, vh = window.innerHeight;
    return {
      left: Math.min(x, vw - mw - 8),
      top: Math.min(y, vh - mh - 8),
    };
  })());

  $effect(() => {
    function onClick(e) {
      if (menuEl && !menuEl.contains(e.target)) onClose?.();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

<div use:portal class="pcr-ctx" bind:this={menuEl} style="left:{pos.left}px;top:{pos.top}px;">
  {#if canExpand}
    <button class="pcr-ctx-item" onclick={() => act("expand-branches")}>Expand branches</button>
    {#if canEdit || canDelete || isLocal}<div class="pcr-ctx-sep"></div>{/if}
  {/if}
  {#if canEdit}
    <button class="pcr-ctx-item" onclick={() => act("edit")}>Edit</button>
  {/if}
  {#if canDelete}
    <button class="pcr-ctx-item pcr-ctx-danger" onclick={() => act("delete")}>Delete</button>
  {/if}
  {#if isLocal}
    {#if canEdit || canDelete}<div class="pcr-ctx-sep"></div>{/if}
    <button class="pcr-ctx-item" disabled={orphaned} onclick={() => act("copy-path")}>Copy Path</button>
    <button class="pcr-ctx-item" disabled={orphaned} onclick={() => act("open-file")}>Open File</button>
    <button class="pcr-ctx-item" disabled={orphaned} onclick={() => act("open-folder")}>Open Folder</button>
    {#if isWindows}
      <button class="pcr-ctx-item" disabled={orphaned} onclick={() => act("properties")}>Properties</button>
    {/if}
  {/if}
</div>

<style>
  .pcr-ctx {
    /* Above the viewer overlay (.pcr-viewer is z-index 10001 with an opaque
       background) — portal moves this menu to <body> as the overlay's sibling,
       so a lower z-index renders it hidden behind the overlay. */
    position: fixed; z-index: 10011;
    min-width: 160px;
    background: rgba(38, 38, 38, 0.85);
    backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(52, 52, 52, 0.6);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    padding: 4px 0;
  }
  .pcr-ctx-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 8px 12px;
    border: none; background: transparent;
    color: var(--input-text, #fff); font-size: 13px;
    text-align: left; cursor: pointer;
    transition: background-color 0.15s;
  }
  .pcr-ctx-item:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
  .pcr-ctx-item:disabled { opacity: 0.4; cursor: default; }
  .pcr-ctx-danger { color: #e74c3c; }
  .pcr-ctx-danger:hover:not(:disabled) { background: rgba(231, 76, 60, 0.15); }
  .pcr-ctx-sep {
    height: 1px; margin: 4px 0;
    background: rgba(255, 255, 255, 0.08);
  }
</style>
