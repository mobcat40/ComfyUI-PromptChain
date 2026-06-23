<script>
  import { getContext } from "svelte";
  import { selection, thumbSize, clipboard, cursor } from "./stores.svelte.js";

  let { items, scope, feed = false, currentDir = "", onlocate, onfav, onitemclick, onitemdblclick, onitemcontextmenu, onitemdrop } = $props();
  const apiURL = getContext("pcr-apiURL");

  // dir relative to the browsed subtree — empty for direct children (no badge)
  function itemDir(item) {
    const dir = item.path.split("/").slice(0, -1).join("/");
    if (!dir || dir === currentDir) return "";
    return currentDir && dir.startsWith(currentDir + "/") ? dir.slice(currentDir.length + 1) : dir;
  }

  // Scale the list-row thumbnail to a fraction of the current grid
  // thumbnail, plus a fixed pad to keep rows legible at small sizes.
  const LIST_THUMB_SCALE = 0.18;
  const LIST_THUMB_PAD = 6;
  let rowThumb = $derived(Math.round(thumbSize() * LIST_THUMB_SCALE + LIST_THUMB_PAD));
  let rowPad = $derived(Math.max(2, Math.round(rowThumb * 0.15)));
  let dropTarget = $state(null);

  function fmtSize(b) {
    if (!b) return "-";
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
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

  function fmtDate(ts) {
    if (!ts) return "-";
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function handleDragStart(item, e) {
    e.dataTransfer.effectAllowed = "copyMove";
    // internal move data
    const movePaths = selection.items.has(item.path) && selection.items.size > 1
      ? [...selection.items]
      : [item.path];
    e.dataTransfer.setData("application/x-promptchain-move", JSON.stringify({ scope, paths: movePaths }));
    // canvas drop data (images/videos only)
    if (item.type === "image" || item.type === "video") {
      e.dataTransfer.setData("application/x-promptchain-asset", JSON.stringify({ type: "asset", scope, path: item.path, name: item.name }));
    }
    e.dataTransfer.setData("text/plain", item.path);
  }

  function handleFolderDragOver(item, e) {
    if (item.type !== "folder") return;
    if (!e.dataTransfer.types.includes("application/x-promptchain-move")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    dropTarget = item.path;
  }

  function handleFolderDragLeave(item) {
    if (dropTarget === item.path) dropTarget = null;
  }

  function handleFolderDrop(item, e) {
    dropTarget = null;
    if (item.type !== "folder") return;
    const raw = e.dataTransfer.getData("application/x-promptchain-move");
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const data = JSON.parse(raw);
      // don't drop folder into itself
      if (data.paths.includes(item.path)) return;
      onitemdrop?.(data.paths, data.scope, item.path);
    } catch {}
  }
</script>

<div class="pcr-lv" style="--row-thumb:{rowThumb}px;--row-pad:{rowPad}px;">
  <div class="pcr-lv-hdr">
    <span class="pcr-lv-c-name">Name</span>
    <span class="pcr-lv-c-size">Size</span>
    <span class="pcr-lv-c-date">Date</span>
  </div>
  {#each items as item (item.path)}
    {@const selected = selection.items.has(item.path)}
    {@const isCut = clipboard.op === "cut" && clipboard.scope === scope && clipboard.items.some(i => i.path === item.path)}
    {@const isCopied = clipboard.op === "copy" && clipboard.scope === scope && clipboard.items.some(i => i.path === item.path)}
    {@const isFocused = cursor.path === item.path}
    {@const isDropTarget = dropTarget === item.path}
    <button
      class="pcr-lv-row"
      class:selected
      class:focused={isFocused}
      class:cut={isCut}
      class:copied={isCopied}
      class:drop-target={isDropTarget}
      class:pcr-lv-flash={item._flash}
      onanimationend={() => { if (item._flash) item._flash = false; }}
      data-item-path={item.path}
      draggable={true}
      ondragstart={(e) => handleDragStart(item, e)}
      ondragover={(e) => handleFolderDragOver(item, e)}
      ondragleave={() => handleFolderDragLeave(item)}
      ondrop={(e) => handleFolderDrop(item, e)}
      onclick={(e) => onitemclick?.(item, e)}
      ondblclick={(e) => onitemdblclick?.(item, e)}
      oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); onitemcontextmenu?.(item, e); }}
    >
      <span class="pcr-lv-c-name">
        {#if item.type === "image" || item.type === "video"}
          <img
            class="pcr-lv-mini"
            src={apiURL(`/promptchain/browse/preview?scope=${scope}&path=${encodeURIComponent(item.path)}&thumb=1`)}
            alt="" loading="lazy" decoding="async"
          />
        {:else if item.type === "folder"}
          <svg class="pcr-lv-icon pcr-lv-folder" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
          </svg>
        {:else if item.type === "workflow" && item.thumbnailHash}
          <img
            class="pcr-lv-mini"
            src={apiURL(`/promptchain/thumb/${item.thumbnailHash}`)}
            alt="" loading="lazy"
            onerror={retryThumb}
          />
        {:else if item.type === "workflow"}
          <svg class="pcr-lv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        {:else}
          <svg class="pcr-lv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        {/if}
        <span class="pcr-lv-name" title={item.name}>{item.name}</span>
        {#if feed && itemDir(item)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <span
            class="pcr-lv-dir" role="button" tabindex="-1"
            title="Open file location"
            onclick={(e) => { e.stopPropagation(); onlocate?.(item); }}
          >{itemDir(item)}/</span>
        {/if}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <span
          class="pcr-lv-fav" class:faved={item.favorite} role="button" tabindex="-1"
          title={item.favorite ? "Unstar" : "Star"}
          onclick={(e) => { e.stopPropagation(); onfav?.(item); }}
        >&#9733;</span>
      </span>
      <span class="pcr-lv-c-size">{fmtSize(item.size)}</span>
      <span class="pcr-lv-c-date">{fmtDate(item.modified)}</span>
    </button>
  {/each}
</div>

<style>
  .pcr-lv { display: flex; flex-direction: column; }

  .pcr-lv-hdr {
    display: flex; padding: 4px 8px; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--input-text, #666);
    border-bottom: 1px solid var(--border-color, #333);
  }

  .pcr-lv-row {
    display: flex; align-items: center;
    padding: var(--row-pad, 3px) 8px;
    border: none; background: transparent;
    color: var(--input-text, #ccc); cursor: pointer; text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
  .pcr-lv-row:hover { background: rgba(255, 255, 255, 0.04); }
  .pcr-lv-row.focused { outline: 1px solid rgba(255, 255, 255, 0.3); outline-offset: -1px; }
  .pcr-lv-row.selected { background: rgba(79, 195, 247, 0.12); }
  .pcr-lv-row.cut { box-shadow: inset 3px 0 0 #e8bf5e; }
  .pcr-lv-row.copied { color: #84c2ff; }
  .pcr-lv-row.drop-target { background: rgba(79, 195, 247, 0.25); outline: 2px solid rgba(79, 195, 247, 0.6); outline-offset: -2px; }

  .pcr-lv-c-name {
    flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0;
  }
  .pcr-lv-c-size {
    width: 55px; text-align: right; font-size: 10px;
    color: var(--input-text, #888); flex-shrink: 0;
  }
  .pcr-lv-c-date {
    width: 55px; text-align: right; font-size: 10px;
    color: var(--input-text, #888); flex-shrink: 0;
  }

  .pcr-lv-icon {
    width: var(--row-thumb, 16px); height: var(--row-thumb, 16px);
    flex-shrink: 0; color: var(--input-text, #666);
  }
  .pcr-lv-folder { color: #ffd54f; }

  .pcr-lv-mini {
    width: var(--row-thumb, 16px); height: var(--row-thumb, 16px);
    object-fit: cover; border-radius: 2px; flex-shrink: 0;
    border: 1px solid #000000a6;
    /* crop to upper-center ~37% for sharp display at small sizes */
    object-view-box: inset(8% 31% 49% 31%);
  }

  .pcr-lv-name {
    font-size: 12px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }

  .pcr-lv-dir {
    font-size: 10px; color: var(--input-text, #777);
    max-width: 40%; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
    flex-shrink: 0; cursor: pointer;
  }
  .pcr-lv-dir:hover { color: #ff8a25; }

  .pcr-lv-fav {
    margin-left: auto; padding: 0 2px;
    font-size: 12px; line-height: 1;
    color: rgba(255, 255, 255, 0.85); cursor: pointer;
    opacity: 0; flex-shrink: 0;
  }
  .pcr-lv-row:hover .pcr-lv-fav { opacity: 0.5; }
  .pcr-lv-fav:hover { opacity: 1; }
  .pcr-lv-fav.faved { opacity: 1; color: #ffd54f; }

  @keyframes pcr-row-flash {
    0% { background: rgba(255, 255, 255, 0.3); }
    100% { background: transparent; }
  }
  .pcr-lv-flash {
    animation: pcr-row-flash 0.4s ease-out forwards;
  }
</style>
