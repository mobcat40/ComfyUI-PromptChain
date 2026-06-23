<script>
  import { tick } from "svelte";
  import { app } from "/scripts/app.js";
  import justifiedLayout from "../../lib/justified-layout.js";
  import { zoomGalleryRowHeight } from "../../lib/gallery-zoom.js";
  import GalleryContextMenu from "./GalleryContextMenu.svelte";
  import ConfirmModal from "../sidebar/ConfirmModal.svelte";

  let {
    images = [], workflowId = "",
    viewMode = "justified", rowHeight = 120,
    apiURL = (p) => p, fetchApi = null, toast = null,
    onOpenViewer, onViewModeChange, onRowHeightChange,
    onClearHistory, onCountChange, onDeleteImages, onDeleteFiles,
  } = $props();

  // --- selection ---
  let selected = $state(new Set());
  let anchor = $state(null);

  // which hashes carry a saved layer stack (sidecar) → a "layers" badge on the
  // card. hash → layer count. Cheap one-shot fetch, refreshed on the same event
  // the viewer fires after an edit-save.
  let editDocLayers = $state({});
  function refreshEditDocs() {
    if (!fetchApi) return;
    fetchApi("/promptchain/edit-docs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { editDocLayers = d?.docs || {}; })
      .catch(() => {});
  }
  $effect(() => {
    if (fetchApi) refreshEditDocs();
    const onSaved = () => refreshEditDocs();
    window.addEventListener("promptchain:edit-docs-changed", onSaved);
    return () => window.removeEventListener("promptchain:edit-docs-changed", onSaved);
  });

  let allVisible = $derived(images.filter(i => !i.orphaned));

  // --- lineage view ---
  // One card per chain TIP: upscales/inpaints/edits collapse into the latest
  // version of THEIR branch. Different generations off the same source are
  // separate works — they split into separate cards instead of burying each
  // other under one root-keyed family. Toggled in ComfyUI settings →
  // PromptChain → Gallery; the setting's onChange broadcasts the event below.
  let lineageView = $state(app?.ui?.settings?.getSettingValue?.("PromptChain.LineageView") ?? true);

  $effect(() => {
    const onToggle = (e) => { lineageView = e.detail?.value !== false; };
    window.addEventListener("promptchain:lineage-view-changed", onToggle);
    return () => window.removeEventListener("promptchain:lineage-view-changed", onToggle);
  });

  // An image is absorbed only when something VISIBLE descends from it — the
  // climb runs through filtered-out/deleted intermediates (parentOf covers
  // the full workflow list), so a linear chain still collapses to one card
  // while branches off a shared source each keep their own tip. parent_hash
  // itself stays the full truthful tree; this is purely view grouping.
  let lineageFamilies = $derived((() => {
    if (!lineageView) return null;
    const parentOf = new Map(images.map(i => [i.hash, i.parent_hash || null]));
    const ancestorsOf = (hash) => {
      const chain = [];
      const seen = new Set([hash]); // cycle guard
      let cur = parentOf.get(hash);
      while (cur && !seen.has(cur)) {
        chain.push(cur);
        seen.add(cur);
        cur = parentOf.get(cur);
      }
      return chain;
    };
    const absorbed = new Set();
    for (const img of allVisible) {
      for (const h of ancestorsOf(img.hash)) absorbed.add(h);
    }

    // images arrive created_at DESC, so the surviving tips are already in
    // order — a new generation fronts ITS branch only. The count badge reads
    // "versions in this chain"; a shared ancestor counts in every branch
    // that descends from it.
    const visible = new Set(allVisible.map((i) => i.hash));
    const reps = [];
    const counts = new Map(); // rep hash → chain member count
    for (const img of allVisible) {
      if (absorbed.has(img.hash)) continue;
      reps.push(img);
      counts.set(img.hash, 1 + ancestorsOf(img.hash).filter((h) => visible.has(h)).length);
    }
    return { reps, counts };
  })());

  // Reps keep their identity from `images`, so openInViewer's indexOf and all
  // selection/keyboard logic work identically in both modes.
  let visibleImages = $derived(lineageFamilies ? lineageFamilies.reps : allVisible);
  let versionCounts = $derived(lineageFamilies?.counts ?? null);

  function versionsOf(img) {
    return versionCounts?.get(img.hash) ?? 0;
  }

  // Track the cursor by hash, not index, so filtering/orphan-removal
  // can't leave it pointing past the end of visibleImages.  cursorIdx
  // is derived and becomes -1 when the cursor's image disappears.
  let cursorHash = $state(null);
  let cursorIdx = $derived(cursorHash ? visibleImages.findIndex(i => i.hash === cursorHash) : -1);

  function selectItem(hash) { selected = new Set([hash]); anchor = hash; }
  function toggleItem(hash) {
    const next = new Set(selected);
    next.has(hash) ? next.delete(hash) : next.add(hash);
    selected = next;
    if (next.has(hash)) anchor = hash;
  }
  function clearSelection() { selected = new Set(); anchor = null; cursorHash = null; }

  // Read only .length so onCountChange doesn't fire on every item
  // identity change — only when the visible count actually moves.
  $effect(() => {
    const n = visibleImages.length;
    onCountChange?.(n);
  });

  // --- context menu ---
  let ctxMenu = $state(null);

  // --- delete confirmation ---
  let confirmOpen = $state(false);
  let confirmMsg = $state("");
  let confirmHashes = [];

  function requestDelete(hashes) {
    if (!hashes.length) return;
    confirmHashes = hashes;
    if (hashes.length === 1) {
      const img = visibleImages.find(i => i.hash === hashes[0]);
      const name = img?.filename ?? "image";
      confirmMsg = `Delete "${name}"?`;
    } else {
      confirmMsg = `Delete ${hashes.length} items?`;
    }
    confirmOpen = true;
  }

  function executeDelete() {
    confirmOpen = false;
    const hashes = confirmHashes;
    confirmHashes = [];
    if (hashes.length) {
      onDeleteFiles?.(hashes);
      clearSelection();
    }
    galleryEl?.focus();
  }

  function cancelDelete() {
    confirmOpen = false;
    confirmHashes = [];
    galleryEl?.focus();
  }

  let suppressClick = false;

  function handleItemClick(img, idx, event) {
    if (suppressClick) { suppressClick = false; return; }
    galleryEl?.focus();
    cursorHash = img.hash;
    if (event.ctrlKey || event.metaKey) { toggleItem(img.hash); return; }
    if (event.shiftKey && anchor) {
      const ai = visibleImages.findIndex(i => i.hash === anchor);
      if (ai >= 0) {
        const lo = Math.min(ai, idx), hi = Math.max(ai, idx);
        selected = new Set(visibleImages.slice(lo, hi + 1).map(i => i.hash));
        return;
      }
    }
    clearSelection();
    openInViewer(img);
  }

  function handleItemDblClick(img) {
    openInViewer(img);
  }

  // The viewer's timeline (left/right) walks whatever array it receives, so
  // hand it the same list the gallery shows: family reps in lineage view
  // (older versions stay reachable via up/down), the full images array
  // otherwise. Either way the start index must come from the array passed —
  // gallery indexes diverge from it whenever orphaned records exist.
  function openInViewer(img) {
    const list = lineageFamilies ? visibleImages : images;
    const idx = list.indexOf(img);
    onOpenViewer?.(list, idx >= 0 ? idx : 0, workflowId);
  }

  function handleItemContext(img, idx, event) {
    event.preventDefault();
    event.stopPropagation();
    galleryEl?.focus();
    cursorHash = img.hash;
    if (!selected.has(img.hash)) selectItem(img.hash);
    ctxMenu = { x: event.clientX, y: event.clientY, item: img };
  }

  function handleBgContext(event) {
    event.preventDefault();
    clearSelection();
    ctxMenu = { x: event.clientX, y: event.clientY, item: null };
  }

  function handleBgClick(event) {
    if (!event.target.closest("[data-hash]")) clearSelection();
    galleryEl?.focus();
  }

  function getSelectedHashes() {
    const hashes = [...selected];
    if (!hashes.length && ctxMenu?.item) hashes.push(ctxMenu.item.hash);
    return hashes;
  }

  async function handleCtxAction(action) {
    if (action === "open") {
      const img = ctxMenu?.item;
      if (img) openInViewer(img);
    } else if (action === "detach") {
      const hashes = getSelectedHashes();
      if (hashes.length) { onDeleteImages?.(hashes); clearSelection(); }
    } else if (action === "delete") {
      const hashes = getSelectedHashes();
      if (hashes.length) { onDeleteFiles?.(hashes); clearSelection(); }
    } else if (action === "refresh") {
      onClearHistory?.("refresh");
    } else if (action === "clear") {
      onClearHistory?.("clear");
    } else if (action.startsWith("view:")) {
      onViewModeChange?.(action.slice(5));
    }
  }

  // --- keyboard ---
  let galleryEl;

  function handleKeydown(event) {

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && visibleImages.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      const cols = viewMode === "list" ? 1 : getColumns();
      const curIdx = cursorIdx;
      let next = curIdx;
      if (curIdx < 0) { next = 0; }
      else if (event.key === "ArrowDown") next = curIdx + cols;
      else if (event.key === "ArrowUp") next = curIdx - cols;
      else if (event.key === "ArrowRight") next = curIdx + 1;
      else next = curIdx - 1;
      next = Math.max(0, Math.min(next, visibleImages.length - 1));
      const img = visibleImages[next];
      cursorHash = img.hash;
      if (event.shiftKey) {
        if (!anchor) anchor = img.hash;
        const ai = visibleImages.findIndex(i => i.hash === anchor);
        const lo = Math.min(ai, next), hi = Math.max(ai, next);
        selected = new Set(visibleImages.slice(lo, hi + 1).map(i => i.hash));
      } else if (!event.ctrlKey) {
        selectItem(img.hash);
      }
      scrollIntoView(img.hash);
    }
    if (event.key === " " && cursorIdx >= 0) {
      event.preventDefault();
      toggleItem(visibleImages[cursorIdx].hash);
    }
    if (event.key === "Enter" && cursorIdx >= 0) {
      openInViewer(visibleImages[cursorIdx]);
    }
    if (event.key === "Escape") {
      if (ctxMenu) ctxMenu = null;
      else clearSelection();
    }
    if (event.key === "Delete" && selected.size > 0) {
      event.preventDefault();
      requestDelete([...selected]);
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "a") {
      event.preventDefault();
      selected = new Set(visibleImages.map(i => i.hash));
    }
  }

  function getColumns() {
    if (!galleryEl) return 1;
    if (viewMode === "grid") {
      const grid = galleryEl.querySelector(".pcr-gal-grid");
      if (grid) return getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    }
    const items = galleryEl.querySelectorAll("[data-hash]");
    if (items.length < 2) return 1;
    const firstTop = items[0].getBoundingClientRect().top;
    let cols = 1;
    for (let i = 1; i < items.length; i++) {
      if (Math.abs(items[i].getBoundingClientRect().top - firstTop) < 5) cols++;
      else break;
    }
    return cols;
  }

  function scrollIntoView(hash) {
    galleryEl?.querySelector(`[data-hash="${CSS.escape(hash)}"]`)?.scrollIntoView({ block: "nearest" });
  }

  // --- zoom ---
  $effect(() => {
    if (!galleryEl) return;
    function onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // In node mode the gallery sits inside a LiteGraph node — without
      // stopPropagation, ComfyUI's canvas-level Ctrl+wheel zoom also
      // fires, swallowing our step and making it feel like clicks don't
      // take. Fullscreen mode doesn't hit this because nothing's above us.
      e.stopPropagation();
      const newH = zoomGalleryRowHeight(rowHeight, e.deltaY > 0 ? -1 : 1);
      if (newH !== rowHeight) onRowHeightChange?.(newH);
    }
    galleryEl.addEventListener("wheel", onWheel, { passive: false });
    return () => galleryEl.removeEventListener("wheel", onWheel);
  });

  // --- justified layout ---
  // $state so effects re-run when the justified branch (re)binds it. The
  // gallery mounts with images=[] on first open (fetch pending), so the
  // branch — and this binding — only appear after the effects' first run;
  // a plain let left them permanently without a ResizeObserver.
  let wrapEl = $state(null);
  let layoutBoxes = $state([]);
  let layoutHeight = $state(0);

  function reLayout() {
    if (viewMode !== "justified" || !wrapEl) { layoutBoxes = []; layoutHeight = 0; return; }
    const containerWidth = wrapEl.clientWidth;
    if (containerWidth <= 0) return;
    const aspects = visibleImages.map(i =>
      (i.width && i.height) ? i.width / i.height : 1
    );
    const result = justifiedLayout(aspects, {
      containerWidth,
      targetRowHeight: rowHeight,
      // Row heights only move when the row partitioning changes, so the
      // default 0.25 tolerance swallows several zoom steps in a row at
      // larger sizes. 0.1 keeps every ~15% rowHeight step visible.
      targetRowHeightTolerance: 0.1,
      boxSpacing: 4,
      containerPadding: 4,
    });
    layoutBoxes = result.boxes || [];
    layoutHeight = result.containerHeight || 0;
  }

  $effect(() => {
    // visibleImages by identity, not length — a refresh can swap images
    // (new aspect ratios) without changing the count.
    const _ = [viewMode, rowHeight, visibleImages, wrapEl];
    // Guard against the component unmounting between tick() and reLayout —
    // wrapEl would be null and accessing .clientWidth inside reLayout would
    // throw on a detached node.
    tick().then(() => { if (wrapEl) reLayout(); });
  });

  $effect(() => {
    if (!wrapEl) return;
    // Heals the load-time race where reLayout ran against a mid-settle
    // container width (LiteGraph node DOM is still sizing): the observer
    // fires as the width settles and re-layouts with the real value.
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      const w = wrapEl.offsetWidth;
      if (w > 0 && w !== lastW) { lastW = w; reLayout(); }
    });
    ro.observe(wrapEl);
    return () => ro.disconnect();
  });

  function thumbUrl(hash) { return apiURL(`/promptchain/thumb/${hash}`); }
  // A thumbnail <img> can latch broken if its request raced the record (the
  // thumb is generated server-side as part of recording). A broken <img> never
  // retries itself, so cache-bust and re-fetch on the natural error event —
  // bounded, event-driven, no polling.
  function retryThumb(e) {
    const img = e.currentTarget;
    const n = +img.dataset.pcrRetry || 0;
    if (n >= 3) return;
    img.dataset.pcrRetry = String(n + 1);
    const u = new URL(img.src, location.href);
    u.searchParams.set("r", String(n + 1));
    img.src = u.toString();
  }

  // A thumb that exhausted its retries while the record was still committing
  // stays broken forever. The authoritative "record committed" signal is the
  // generation-recorded event (fired AFTER recordGeneration's awaited POST, so
  // the thumb is provably on disk by now) — re-fetch any latched-broken <img>
  // when it lands. Event-driven recovery, no timers.
  function healBrokenThumbs() {
    if (!galleryEl) return;
    for (const img of galleryEl.querySelectorAll("img")) {
      if (img.complete && img.naturalWidth === 0) {
        img.dataset.pcrRetry = "0";
        const u = new URL(img.src, location.href);
        u.searchParams.set("r", "heal");
        img.src = u.toString();
      }
    }
  }
  $effect(() => {
    const onRecorded = () => healBrokenThumbs();
    window.addEventListener("promptchain:generation-recorded", onRecorded);
    return () => window.removeEventListener("promptchain:generation-recorded", onRecorded);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pcr-gal" bind:this={galleryEl} tabindex="-1"
  onclick={handleBgClick}
  oncontextmenu={handleBgContext}
  onkeydown={handleKeydown}
>
  {#if visibleImages.length === 0}
    <div class="pcr-gal-empty">No images yet</div>
  {:else if viewMode === "list"}
    <div class="pcr-gal-list">
      {#each visibleImages as img, idx (img.hash)}
        {@const sel = selected.has(img.hash)}
        {@const cur = cursorIdx === idx}
        <button
          class="pcr-gal-lrow"
          class:selected={sel}
          class:focused={cur}
          data-hash={img.hash}
          onclick={(e) => handleItemClick(img, idx, e)}
          ondblclick={() => handleItemDblClick(img)}
          oncontextmenu={(e) => handleItemContext(img, idx, e)}
        >
          <img class="pcr-gal-lthumb" src={thumbUrl(img.hash)} alt="" loading="lazy" onerror={retryThumb} />
          <span class="pcr-gal-lname">{img.filename}</span>
          {#if editDocLayers[img.hash]}
            <span class="pcr-gal-lvers" title="opens layered in Edit">▦ {editDocLayers[img.hash]} layers</span>
          {/if}
          {#if versionsOf(img) > 1}
            <span class="pcr-gal-lvers">{versionsOf(img)} versions</span>
          {/if}
          <span class="pcr-gal-lmeta">{img.width}&times;{img.height}</span>
        </button>
      {/each}
    </div>
  {:else if viewMode === "grid"}
    <div class="pcr-gal-grid" style="--gal-size:{rowHeight}px;">
      {#each visibleImages as img, idx (img.hash)}
        {@const sel = selected.has(img.hash)}
        {@const cur = cursorIdx === idx}
        <div
          class="pcr-gal-gitem"
          class:selected={sel}
          class:focused={cur}
          data-hash={img.hash}
          role="button" tabindex="0"
          onclick={(e) => handleItemClick(img, idx, e)}
          ondblclick={() => handleItemDblClick(img)}
          oncontextmenu={(e) => handleItemContext(img, idx, e)}
        >
          <img src={thumbUrl(img.hash)} alt={img.filename} loading="lazy" draggable="false" onerror={retryThumb} />
          {#if versionsOf(img) > 1}
            <div class="pcr-gal-vers" title="{versionsOf(img)} versions">{versionsOf(img)}</div>
          {/if}
          {#if editDocLayers[img.hash]}
            <div class="pcr-gal-layers" title="{editDocLayers[img.hash]} layers — opens layered in Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
            </div>
          {/if}
          {#if sel}<div class="pcr-gal-check"></div>{/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="pcr-gal-justified" bind:this={wrapEl} style="height:{layoutHeight}px;">
      {#each visibleImages as img, idx (img.hash)}
        {#if layoutBoxes[idx]}
          {@const box = layoutBoxes[idx]}
          {@const sel = selected.has(img.hash)}
          {@const cur = cursorIdx === idx}
          <div
            class="pcr-gal-jitem"
            class:selected={sel}
            class:focused={cur}
            data-hash={img.hash}
            style="left:{box.left}px;top:{box.top}px;width:{box.width}px;height:{box.height}px;"
            role="button" tabindex="0"
            onclick={(e) => handleItemClick(img, idx, e)}
            ondblclick={() => handleItemDblClick(img)}
            oncontextmenu={(e) => handleItemContext(img, idx, e)}
          >
            <img src={thumbUrl(img.hash)} alt={img.filename} loading="lazy" draggable="false" onerror={retryThumb} />
            {#if versionsOf(img) > 1}
              <div class="pcr-gal-vers" title="{versionsOf(img)} versions">{versionsOf(img)}</div>
            {/if}
            {#if editDocLayers[img.hash]}
              <div class="pcr-gal-layers" title="{editDocLayers[img.hash]} layers — opens layered in Edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
              </div>
            {/if}
            {#if sel}<div class="pcr-gal-check"></div>{/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if ctxMenu}
    <GalleryContextMenu
      x={ctxMenu.x} y={ctxMenu.y}
      targetItem={ctxMenu.item}
      {viewMode}
      selectionCount={selected.size}
      onAction={handleCtxAction}
      onClose={() => { ctxMenu = null; suppressClick = true; }}
    />
  {/if}
</div>

<ConfirmModal
  open={confirmOpen}
  title="Delete"
  message={confirmMsg}
  confirmLabel="Delete"
  onConfirm={executeDelete}
  onCancel={cancelDelete}
/>

<style>
  .pcr-gal {
    width: 100%; min-height: 100%;
    user-select: none; outline: none;
    position: relative;
  }
  .pcr-gal-empty {
    padding: 20px; text-align: center;
    color: rgba(255, 255, 255, 0.4); font-style: italic;
  }

  /* justified */
  .pcr-gal-justified { position: relative; width: 100%; }
  .pcr-gal-jitem {
    position: absolute; overflow: hidden;
    border: 2px solid transparent; border-radius: 4px;
    cursor: pointer; box-sizing: border-box;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .pcr-gal-jitem:hover { transform: scale(1.03); box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 10; }
  .pcr-gal-jitem.focused { border-color: rgba(255, 255, 255, 0.4); }
  .pcr-gal-jitem.selected { border-color: rgba(79, 195, 247, 0.6); box-shadow: inset 0 0 0 1px rgba(79, 195, 247, 0.3); }
  .pcr-gal-jitem img { display: block; width: 100%; height: 100%; object-fit: cover; }

  /* grid */
  .pcr-gal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--gal-size, 120px), 1fr));
    gap: 4px; padding: 4px;
  }
  .pcr-gal-gitem {
    aspect-ratio: 1; overflow: hidden;
    border: 2px solid transparent; border-radius: 4px;
    cursor: pointer; position: relative;
    transition: transform 0.15s;
  }
  .pcr-gal-gitem:hover { border-color: var(--border-color, #444); }
  .pcr-gal-gitem.focused { border-color: rgba(255, 255, 255, 0.4); }
  .pcr-gal-gitem.selected { border-color: rgba(79, 195, 247, 0.6); background: rgba(79, 195, 247, 0.15); }
  .pcr-gal-gitem img { width: 100%; height: 100%; object-fit: cover; }

  /* list */
  .pcr-gal-list { display: flex; flex-direction: column; }
  .pcr-gal-lrow {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 8px; border: none; background: transparent;
    color: var(--input-text, #ccc); cursor: pointer; text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
  .pcr-gal-lrow:hover { background: rgba(255, 255, 255, 0.04); }
  .pcr-gal-lrow.selected { background: rgba(79, 195, 247, 0.12); }
  .pcr-gal-lrow.focused { outline: 1px solid rgba(255, 255, 255, 0.3); outline-offset: -1px; }
  .pcr-gal-lthumb {
    width: 32px; height: 32px; object-fit: cover;
    border-radius: 3px; flex-shrink: 0;
    border: 1px solid #000000a6;
    object-view-box: inset(8% 31% 49% 31%);
  }
  /* checkmark */
  .pcr-gal-check {
    position: absolute; top: 4px; left: 4px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--p-button-text-primary-color, #4fc3f7);
    display: flex; align-items: center; justify-content: center;
  }
  .pcr-gal-check::after {
    content: ""; width: 6px; height: 3px;
    border-left: 1.5px solid #000; border-bottom: 1.5px solid #000;
    transform: rotate(-45deg); margin-top: -1px;
  }

  .pcr-gal-lname {
    flex: 1; font-size: 11px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  /* lineage version count */
  .pcr-gal-vers {
    position: absolute; bottom: 4px; right: 4px;
    min-width: 16px; padding: 1px 5px;
    border-radius: 9px; box-sizing: border-box;
    background: rgba(0, 0, 0, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #ddd; font-size: 10px; line-height: 13px;
    text-align: center; pointer-events: none;
  }
  /* "has a saved layer stack" badge — top-right (vers is bottom-right, the
     selection check is top-left) */
  .pcr-gal-layers {
    position: absolute; top: 4px; right: 4px;
    width: 18px; height: 18px; padding: 3px;
    box-sizing: border-box; border-radius: 5px;
    background: rgba(20, 20, 20, 0.78);
    box-shadow: 0 0 0 1px rgba(200, 89, 9, 0.6);
    color: #ffb27d; display: flex; pointer-events: none;
  }
  .pcr-gal-layers svg { width: 100%; height: 100%; }
  .pcr-gal-lvers {
    font-size: 10px; color: var(--p-button-text-primary-color, #4fc3f7);
    flex-shrink: 0;
  }
  .pcr-gal-lmeta {
    font-size: 10px; color: var(--input-text, #888); flex-shrink: 0;
  }

</style>
