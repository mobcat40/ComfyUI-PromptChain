<script>
  import { tick } from "svelte";
  import justifiedLayout from "../../lib/justified-layout.js";
  import ItemThumbnail from "./ItemThumbnail.svelte";
  import { thumbSize, viewMode, clipboard, cursor } from "./stores.svelte.js";
  import { getContext } from "svelte";
  import { selection } from "./stores.svelte.js";

  let { items, scope, feed = false, currentDir = "", onlocate, onfav, onitemclick, onitemdblclick, onitemcontextmenu, onitemdrop } = $props();

  // dir relative to the browsed subtree — empty for direct children (no badge)
  function itemDir(item) {
    const dir = item.path.split("/").slice(0, -1).join("/");
    if (!dir || dir === currentDir) return "";
    return currentDir && dir.startsWith(currentDir + "/") ? dir.slice(currentDir.length + 1) : dir;
  }

  function makeDragStart(item) {
    return (e) => {
      e.dataTransfer.effectAllowed = "copyMove";
      const movePaths = selection.items.has(item.path) && selection.items.size > 1
        ? [...selection.items] : [item.path];
      e.dataTransfer.setData("application/x-promptchain-move", JSON.stringify({ scope, paths: movePaths }));
      if (item.type === "image" || item.type === "video") {
        e.dataTransfer.setData("application/x-promptchain-asset", JSON.stringify({ type: "asset", scope, path: item.path, name: item.name }));
      }
      e.dataTransfer.setData("text/plain", item.path);
    };
  }
  const apiURL = getContext("pcr-apiURL");

  let isJustified = $derived(viewMode() === "justified");

  let wrapEl;
  let layoutBoxes = $state([]);
  let layoutHeight = $state(0);
  let naturalDims = {};

  function reLayout() {
    if (!isJustified || !wrapEl) {
      layoutBoxes = [];
      layoutHeight = 0;
      return;
    }
    const containerWidth = wrapEl.clientWidth;
    if (containerWidth <= 0) return;

    const aspects = items.map(i => {
      if (i.width && i.height && i.height > 0) return i.width / i.height;
      const nat = naturalDims[i.path];
      if (nat) return nat.w / nat.h;
      return 1;
    });

    const result = justifiedLayout(aspects, {
      containerWidth,
      targetRowHeight: thumbSize(),
      boxSpacing: 4,
      containerPadding: 4,
    });
    layoutBoxes = result.boxes || [];
    layoutHeight = result.containerHeight || 0;
  }

  function onImgLoad(item, e) {
    const img = e.target;
    if (img.naturalWidth && img.naturalHeight && !item.width) {
      naturalDims[item.path] = { w: img.naturalWidth, h: img.naturalHeight };
      reLayout();
    }
  }

  $effect(() => {
    // re-layout on mode, size, or items change
    const _ = [isJustified, thumbSize(), items.length];
    naturalDims = {};
    tick().then(reLayout);
  });

  let lastLayoutWidth = 0;
  $effect(() => {
    if (!wrapEl) return;
    const ro = new ResizeObserver(() => {
      const w = wrapEl.offsetWidth;
      if (w > 0 && w !== lastLayoutWidth) {
        lastLayoutWidth = w;
        reLayout();
      }
    });
    ro.observe(wrapEl);
    return () => ro.disconnect();
  });

  // ctrl+wheel zoom handled by parent (AssetBrowser) on .pcr-content

  function previewSrc(item) {
    return apiURL(`/promptchain/browse/preview?scope=${scope}&path=${encodeURIComponent(item.path)}&thumb=1`);
  }

  function thumbSrc(item) {
    return item.thumbnailHash ? apiURL(`/promptchain/thumb/${item.thumbnailHash}`) : null;
  }

  let loadedThumbs = new Set();
  let flashingThumbs = $state(new Set());

  // Drop stale entries whenever the underlying item list changes so we
  // don't grow these Sets unbounded over a long sidebar session.  Touching
  // items.length is sufficient to re-run on navigation/refresh.
  $effect(() => {
    items.length;
    const visible = new Set(items.map(i => i.path));
    for (const p of loadedThumbs) if (!visible.has(p)) loadedThumbs.delete(p);
    if (flashingThumbs.size) {
      const next = new Set();
      for (const p of flashingThumbs) if (visible.has(p)) next.add(p);
      if (next.size !== flashingThumbs.size) flashingThumbs = next;
    }
  });

  function onThumbUpdate(item) {
    if (loadedThumbs.has(item.path)) {
      flashingThumbs = new Set([...flashingThumbs, item.path]);
    }
    loadedThumbs.add(item.path);
  }

  function onFlashEnd(itemPath) {
    const next = new Set(flashingThumbs);
    next.delete(itemPath);
    flashingThumbs = next;
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
</script>

<div class="pcr-gv" bind:this={wrapEl}>
  {#if isJustified}
    <div class="pcr-jg" style="height:{layoutHeight}px;">
      {#each items as item, i (item.path)}
        {#if layoutBoxes[i]}
          {@const box = layoutBoxes[i]}
          {@const selected = selection.items.has(item.path)}
          {@const isCut = clipboard.op === "cut" && clipboard.scope === scope && clipboard.items.some(i => i.path === item.path)}
          {@const isFocused = cursor.path === item.path}
          {@const isFolder = item.type === "folder"}
          <button
            class="pcr-ji"
            class:selected
            class:focused={isFocused}
            class:cut={isCut}
            data-item-path={item.path}
            style="left:{box.left}px;top:{box.top}px;width:{box.width}px;height:{box.height}px;"
            draggable={true}
            ondragstart={makeDragStart(item)}
            ondragover={(e) => {
              if (!isFolder || !e.dataTransfer.types.includes("application/x-promptchain-move")) return;
              e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move";
            }}
            ondrop={(e) => {
              if (!isFolder) return;
              const raw = e.dataTransfer.getData("application/x-promptchain-move");
              if (!raw) return;
              e.preventDefault(); e.stopPropagation();
              try {
                const d = JSON.parse(raw);
                if (Array.isArray(d.paths) && !d.paths.includes(item.path)) {
                  onitemdrop?.(d.paths, d.scope, item.path);
                }
              } catch (err) { console.warn("[PromptChain] invalid drop payload:", err); }
            }}
            onclick={(e) => onitemclick?.(item, e)}
            ondblclick={(e) => onitemdblclick?.(item, e)}
            oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); onitemcontextmenu?.(item, e); }}
            title={item.name}
          >
            {#if item.type === "image" || item.type === "video"}
              <img
                src={previewSrc(item)} alt={item.name}
                loading="lazy" decoding="async" draggable="false"
                onload={(e) => onImgLoad(item, e)}
              />
              {#if item._flash}
                <div class="pcr-ji-flash" onanimationend={() => item._flash = false}></div>
              {/if}
            {:else if item.type === "workflow" && item.thumbnailHash}
              <img src={thumbSrc(item)} alt={item.name} loading="lazy" draggable="false"
                onload={() => onThumbUpdate(item)} onerror={retryThumb} />
              {#if flashingThumbs.has(item.path)}
                <div class="pcr-ji-flash" onanimationend={() => onFlashEnd(item.path)}></div>
              {/if}
            {:else if item.type === "folder"}
              <div class="pcr-ji-icon">
                <svg class="pcr-ji-folder" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
                </svg>
                <span class="pcr-ji-label">{item.name}</span>
              </div>
            {:else}
              <div class="pcr-ji-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span class="pcr-ji-label">{item.name}</span>
              </div>
            {/if}
            {#if feed && itemDir(item)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <span
                class="pcr-ji-dir" role="button" tabindex="-1"
                title="Open file location"
                onclick={(e) => { e.stopPropagation(); onlocate?.(item); }}
              >{itemDir(item)}</span>
            {/if}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <span
              class="pcr-ji-fav" class:faved={item.favorite} role="button" tabindex="-1"
              title={item.favorite ? "Unstar" : "Star"}
              onclick={(e) => { e.stopPropagation(); onfav?.(item); }}
            >&#9733;</span>
            {#if selected}<div class="pcr-ji-check"></div>{/if}
          </button>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="pcr-gg" style="--pcr-item-size:{thumbSize()}px;">
      {#each items as item (item.path)}
        <ItemThumbnail
          {item} {scope} {feed} {currentDir} {onlocate} {onfav}
          ondragstartitem={makeDragStart(item)}
          ondropitem={(paths, srcScope, folderPath) => onitemdrop?.(paths, srcScope, folderPath)}
          onclick={(e) => onitemclick?.(item, e)}
          ondblclick={(e) => onitemdblclick?.(item, e)}
          oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); onitemcontextmenu?.(item, e); }}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .pcr-gv { width: 100%; }

  .pcr-gg {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--pcr-item-size, 140px), 1fr));
    gap: 4px; padding: 4px;
  }

  .pcr-jg { position: relative; }

  .pcr-ji {
    position: absolute; overflow: hidden;
    border: 2px solid transparent; border-radius: 3px;
    padding: 0; background: rgba(0, 0, 0, 0.2);
    cursor: pointer; box-sizing: border-box;
    /* boxes have explicit sizes, so offscreen tiles can skip paint entirely —
       matters once the feed has accumulated many pages */
    content-visibility: auto;
  }
  .pcr-ji:hover { border-color: var(--border-color, #444); }
  .pcr-ji.focused { border-color: rgba(255, 255, 255, 0.4); }
  .pcr-ji.selected { border-color: rgba(79, 195, 247, 0.6); }
  .pcr-ji.cut { border-color: rgba(232, 191, 94, 0.6); }
  .pcr-ji img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .pcr-ji-icon {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    width: 100%; height: 100%; gap: 4px;
    color: var(--input-text, #666);
  }
  .pcr-ji-icon svg { width: 32px; height: 32px; }
  .pcr-ji-folder { color: #ffd54f; }
  .pcr-ji-label {
    font-size: 10px; max-width: 90%; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
    color: var(--input-text, #aaa);
  }
  @keyframes pcr-thumb-flash {
    0% { background: rgba(255, 255, 255, 0.85); }
    100% { background: transparent; }
  }
  .pcr-ji-flash {
    position: absolute; inset: 0;
    animation: pcr-thumb-flash 0.4s ease-out forwards;
    pointer-events: none;
  }

  .pcr-ji-dir {
    position: absolute; left: 4px; bottom: 4px;
    max-width: calc(100% - 8px);
    padding: 1px 5px; border-radius: 7px;
    background: rgba(0, 0, 0, 0.65);
    color: #ddd; font-size: 9px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    cursor: pointer;
  }
  .pcr-ji-dir:hover { background: rgba(0, 0, 0, 0.85); color: #ff8a25; }

  .pcr-ji-fav {
    position: absolute; top: 2px; right: 4px;
    font-size: 13px; line-height: 1; padding: 2px;
    color: rgba(255, 255, 255, 0.85); cursor: pointer;
    opacity: 0; text-shadow: 0 0 3px rgba(0, 0, 0, 0.9);
  }
  .pcr-ji:hover .pcr-ji-fav { opacity: 0.6; }
  .pcr-ji-fav:hover { opacity: 1; }
  .pcr-ji-fav.faved { opacity: 1; color: #ffd54f; }

  .pcr-ji-check {
    position: absolute; top: 4px; left: 4px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--p-button-text-primary-color, #4fc3f7);
    display: flex; align-items: center; justify-content: center;
  }
  .pcr-ji-check::after {
    content: ""; width: 6px; height: 3px;
    border-left: 1.5px solid #000; border-bottom: 1.5px solid #000;
    transform: rotate(-45deg); margin-top: -1px;
  }
</style>
