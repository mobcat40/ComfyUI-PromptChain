<script>
  import { getContext } from "svelte";
  import { selection, clipboard, cursor } from "./stores.svelte.js";

  let { item, scope, feed = false, currentDir = "", onlocate, onfav, onclick, ondblclick, oncontextmenu, ondragstartitem, ondropitem } = $props();
  const apiURL = getContext("pcr-apiURL");

  // dir relative to the browsed subtree — empty for direct children (no badge)
  let itemDir = $derived.by(() => {
    const dir = item.path.split("/").slice(0, -1).join("/");
    if (!dir || dir === currentDir) return "";
    return currentDir && dir.startsWith(currentDir + "/") ? dir.slice(currentDir.length + 1) : dir;
  });

  let selected = $derived(selection.items.has(item.path));
  let focused = $derived(cursor.path === item.path);
  let isCut = $derived(clipboard.op === "cut" && clipboard.scope === scope && clipboard.items.some(i => i.path === item.path));
  let dropOver = $state(false);
  let thumbLoaded = false;
  let showFlash = $state(false);

  function onThumbUpdate() {
    if (thumbLoaded) showFlash = true;
    thumbLoaded = true;
  }

  // A cover whose /thumb request raced the record commit latches broken with no
  // recovery. Cache-bust and re-fetch on the error event — bounded, no polling.
  function retryThumb(e) {
    const img = e.currentTarget;
    const n = +img.dataset.pcrRetry || 0;
    if (n >= 3) return;
    img.dataset.pcrRetry = String(n + 1);
    const u = new URL(img.src, location.href);
    u.searchParams.set("r", String(n + 1));
    img.src = u.toString();
  }

  function handleDragOver(e) {
    if (item.type !== "folder") return;
    if (!e.dataTransfer.types.includes("application/x-promptchain-move")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    dropOver = true;
  }

  function handleDrop(e) {
    dropOver = false;
    if (item.type !== "folder") return;
    const raw = e.dataTransfer.getData("application/x-promptchain-move");
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const data = JSON.parse(raw);
      if (data.paths.includes(item.path)) return;
      ondropitem?.(data.paths, data.scope, item.path);
    } catch {}
  }
</script>

<div
  class="pcr-gi"
  class:selected
  class:focused
  class:cut={isCut}
  class:drop-target={dropOver}
  data-item-path={item.path}
  draggable={true}
  ondragstart={ondragstartitem}
  ondragover={handleDragOver}
  ondragleave={() => dropOver = false}
  ondrop={handleDrop}
  role="button"
  tabindex="0"
  {onclick}
  {ondblclick}
  {oncontextmenu}
  title={item.name}
>
  <div class="pcr-gi-img">
    {#if item.type === "image" || item.type === "video"}
      <img
        src={apiURL(`/promptchain/browse/preview?scope=${scope}&path=${encodeURIComponent(item.path)}&thumb=1`)}
        alt={item.name} loading="lazy" decoding="async" draggable="false"
      />
      {#if item._flash}
        <div class="pcr-gi-flash" onanimationend={() => item._flash = false}></div>
      {/if}
    {:else if item.type === "workflow" && item.thumbnailHash}
      <img
        src={apiURL(`/promptchain/thumb/${item.thumbnailHash}`)}
        alt={item.name} loading="lazy" draggable="false"
        onload={onThumbUpdate}
        onerror={retryThumb}
      />
      {#if showFlash}
        <div class="pcr-gi-flash" onanimationend={() => showFlash = false}></div>
      {/if}
    {:else if item.type === "folder"}
      <svg class="pcr-gi-icon pcr-gi-folder" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
      </svg>
    {:else if item.type === "workflow"}
      <svg class="pcr-gi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    {:else}
      <svg class="pcr-gi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    {/if}
    {#if feed && itemDir}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <span
        class="pcr-gi-dir" role="button" tabindex="-1"
        title="Open file location"
        onclick={(e) => { e.stopPropagation(); onlocate?.(item); }}
      >{itemDir}</span>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <span
      class="pcr-gi-fav" class:faved={item.favorite} role="button" tabindex="-1"
      title={item.favorite ? "Unstar" : "Star"}
      onclick={(e) => { e.stopPropagation(); onfav?.(item); }}
    >&#9733;</span>
  </div>
  <div class="pcr-gi-name">{item.name}</div>
  {#if selected}<div class="pcr-gi-check"></div>{/if}
</div>

<style>
  .pcr-gi {
    display: flex; flex-direction: column; align-items: center;
    padding: 4px; border: 2px solid transparent; border-radius: 4px;
    background: transparent; color: var(--input-text, #ccc);
    cursor: pointer; position: relative; overflow: hidden;
    /* offscreen tiles skip paint; intrinsic size keeps scroll height stable */
    content-visibility: auto;
    contain-intrinsic-size: auto 160px;
  }
  .pcr-gi:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--border-color, #444);
  }
  .pcr-gi.selected {
    background: rgba(79, 195, 247, 0.15);
    border-color: rgba(79, 195, 247, 0.5);
  }
  .pcr-gi.focused { border-color: rgba(255, 255, 255, 0.4); }
  .pcr-gi.cut { border-color: rgba(232, 191, 94, 0.6); }
  .pcr-gi.drop-target {
    background: rgba(79, 195, 247, 0.25);
    border-color: rgba(79, 195, 247, 0.6);
  }

  .pcr-gi-img {
    width: 100%; aspect-ratio: 1; position: relative;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; border-radius: 3px; background: rgba(0, 0, 0, 0.2);
  }

  @keyframes pcr-thumb-flash {
    0% { background: rgba(255, 255, 255, 0.85); }
    100% { background: transparent; }
  }
  .pcr-gi-flash {
    position: absolute; inset: 0;
    animation: pcr-thumb-flash 0.4s ease-out forwards;
    pointer-events: none;
  }
  .pcr-gi-img img { width: 100%; height: 100%; object-fit: cover; }

  .pcr-gi-icon {
    width: 32px; height: 32px;
    color: var(--input-text, #666); opacity: 0.7;
  }
  .pcr-gi-folder { color: #ffd54f; opacity: 0.9; }

  .pcr-gi-name {
    width: 100%; margin-top: 4px; font-size: 10px;
    text-align: center; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }

  .pcr-gi-dir {
    position: absolute; left: 4px; bottom: 4px;
    max-width: calc(100% - 8px);
    padding: 1px 5px; border-radius: 7px;
    background: rgba(0, 0, 0, 0.65);
    color: #ddd; font-size: 9px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    cursor: pointer;
  }
  .pcr-gi-dir:hover { background: rgba(0, 0, 0, 0.85); color: #ff8a25; }

  .pcr-gi-fav {
    position: absolute; top: 2px; right: 4px;
    font-size: 13px; line-height: 1; padding: 2px;
    color: rgba(255, 255, 255, 0.85); cursor: pointer;
    opacity: 0; text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }
  .pcr-gi:hover .pcr-gi-fav { opacity: 0.6; }
  .pcr-gi-fav:hover { opacity: 1; }
  .pcr-gi-fav.faved { opacity: 1; color: #ffd54f; }

  .pcr-gi-check {
    position: absolute; top: 4px; left: 4px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--p-button-text-primary-color, #4fc3f7);
    display: flex; align-items: center; justify-content: center;
  }
  .pcr-gi-check::after {
    content: ""; width: 6px; height: 3px;
    border-left: 1.5px solid #000; border-bottom: 1.5px solid #000;
    transform: rotate(-45deg); margin-top: -1px;
  }
</style>
