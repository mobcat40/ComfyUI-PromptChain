<script>
  import { onMount, setContext, tick } from "svelte";
  import Toolbar from "./Toolbar.svelte";
  import GridView from "./GridView.svelte";
  import ListView from "./ListView.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import PromptModal from "./PromptModal.svelte";
  import ConflictModal from "./ConflictModal.svelte";
  import ConfirmModal from "./ConfirmModal.svelte";
  import PropertiesModal from "./PropertiesModal.svelte";
  import NewWorkflowMenu from "./NewWorkflowMenu.svelte";
  import DuplicatesModal from "./DuplicatesModal.svelte";
  import { insertSorted, patchItemInList, dropItemsByPath, buildGroups } from "./browse-utils.js";
  import { safeJson, HttpError } from "../../lib/api-context.js";
  import {
    nav, selection, prefs, viewMode, thumbSize, setThumbSize,
    clearSelection, selectItem, toggleItem, selectRange, selectAll, setSelection,
    clipboard, clipCut, clipCopy, clipClear,
    cursor, setCursor, clearCursor,
    groupMode, setGroupMode,
    feedMode, setFeedMode,
    favFilter, setFavFilter,
  } from "./stores.svelte.js";

  let { apiURL, fetchApi, toast, onOpenViewer, onLoadWorkflow, onAddNode, onCreateWorkflow, onOpenSettings, logoUrl, onSubscribeRefresh, onSubscribeDedup } = $props();

  setContext("pcr-apiURL", (path) => apiURL(path));
  setContext("pcr-toast", (...args) => toast?.(...args));

  // --- Local state ---
  let items = $state([]);
  let loading = $state(false);
  let error = $state(null);
  let searchQuery = $state("");
  let lastMtime = {};
  let scopeRoots = {};

  // recent-feed pagination
  let nextCursor = $state(null);
  let feedTotal = $state(0);
  let loadingMore = $state(false);

  // context menu
  let ctxMenu = $state(null); // { x, y, item } or null
  // breadcrumb drop target
  let bcDropTarget = $state(null);
  // inline rename
  // kebab dropdown
  let kebabOpen = $state(false);
  let kebabEl;
  // prompt modal (used for "New Folder" and "Rename")
  let modalOpen = $state(false);
  let modalTitle = $state("");
  let modalPlaceholder = $state("");
  let modalDefault = $state("");
  let modalConfirmLabel = $state("Create");
  let modalSelectEnd = $state(-1);
  let modalMode = $state("mkdir"); // "mkdir" | "rename"
  let renameItem = $state(null);
  // new-workflow cascade menu
  let nwmOpen = $state(false);
  let nwmAnchor = $state({ x: 0, y: 0 });
  // conflict modal
  let conflictOpen = $state(false);
  let conflictData = $state(null);
  // confirm (delete) modal
  let confirmOpen = $state(false);
  let confirmMsg = $state("");
  let confirmPaths = $state([]);
  // properties modal
  let propsOpen = $state(false);
  let propsItem = $state(null);
  // duplicates modal
  let dupOpen = $state(false);

  const SCOPES = [
    { id: "workflows", label: "Workflows" },
    { id: "input", label: "Input" },
    { id: "output", label: "Output" },
  ];

  let scope = $derived(nav.scope);
  let path = $derived(nav.paths[nav.scope] || []);
  let currentViewMode = $derived(viewMode());
  let isFeed = $derived(feedMode());
  let isFavFilter = $derived(favFilter());

  // navigation history
  let navBack = [];
  let navFwd = [];

  function pushNav() {
    navBack.push({ scope: nav.scope, path: [...nav.paths[nav.scope]], feed: feedMode() });
    navFwd = [];
  }

  function navigateBack() {
    if (!navBack.length) return;
    navFwd.push({ scope: nav.scope, path: [...nav.paths[nav.scope]], feed: feedMode() });
    const prev = navBack.pop();
    nav.scope = prev.scope;
    nav.paths[prev.scope] = prev.path;
    setFeedMode(prev.feed ?? false);
    clearSelection();
    fetchFolder(prev.path);
  }

  function navigateForward() {
    if (!navFwd.length) return;
    navBack.push({ scope: nav.scope, path: [...nav.paths[nav.scope]], feed: feedMode() });
    const next = navFwd.pop();
    nav.scope = next.scope;
    nav.paths[next.scope] = next.path;
    setFeedMode(next.feed ?? false);
    clearSelection();
    fetchFolder(next.path);
  }

  let fetchId = 0;
  let fetchAc = null;

  async function fetchFolder(newPath) {
    if (feedMode()) return fetchFeed(newPath);
    const id = ++fetchId;
    fetchAc?.abort();
    fetchAc = new AbortController();
    const signal = fetchAc.signal;
    loading = true;
    loadingMore = false;
    error = null;
    try {
      const params = new URLSearchParams({
        scope: nav.scope,
        path: newPath.join("/"),
        sort: prefs.sortField,
        direction: prefs.sortDirection,
      });
      const resp = await fetchApi(`/promptchain/browse?${params}`, { signal });
      if (id !== fetchId) return;
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      if (id !== fetchId) return;
      items = data.items;
      nav.paths[nav.scope] = data.path;
      if (data.root) scopeRoots[nav.scope] = data.root;
      // seed mtime cache for visibility observer
      fetchApi(`/promptchain/browse/mtime?${new URLSearchParams({ scope: nav.scope, path: newPath.join("/") })}`, { signal })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) lastMtime[`${nav.scope}:${newPath.join("/")}`] = d.mtime; })
        .catch(() => {});
    } catch (e) {
      if (e?.name === "AbortError") return;
      if (id !== fetchId) return;
      error = e.message;
      items = [];
    }
    loading = false;
  }

  const FEED_PAGE_SIZE = 60;

  async function fetchFeed(newPath, append = false, quiet = false) {
    const id = ++fetchId;
    fetchAc?.abort();
    fetchAc = new AbortController();
    const signal = fetchAc.signal;
    if (append) {
      loadingMore = true;
    } else {
      // quiet replace (search-as-you-type) keeps current items on screen
      // instead of flashing the Loading placeholder per keystroke
      if (!quiet) loading = true;
      loadingMore = false;
    }
    error = null;
    try {
      const params = new URLSearchParams({
        scope: nav.scope,
        path: newPath.join("/"),
        limit: String(FEED_PAGE_SIZE),
      });
      if (searchQuery) params.set("q", searchQuery);
      if (favFilter()) params.set("starred", "1");
      if (append && nextCursor) {
        params.set("cursor_m", String(nextCursor.m));
        params.set("cursor_p", nextCursor.p);
      }
      const resp = await fetchApi(`/promptchain/browse/recent?${params}`, { signal });
      if (id !== fetchId) return;
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      if (id !== fetchId) return;
      items = append ? [...items, ...data.items] : data.items;
      nextCursor = data.nextCursor;
      feedTotal = data.total;
      nav.paths[nav.scope] = data.path;
      if (data.root) scopeRoots[nav.scope] = data.root;
    } catch (e) {
      if (e?.name === "AbortError") return;
      if (id !== fetchId) return;
      error = e.message;
      if (!append) items = [];
    }
    loading = false;
    loadingMore = false;
  }

  function loadMoreFeed() {
    if (loading || loadingMore || !nextCursor || !feedMode()) return;
    fetchFeed(path, true);
  }

  function toggleFeed() {
    pushNav();
    const enable = !feedMode();
    setFeedMode(enable);
    // time headers are the feed's scannability anchor; only override an
    // unset preference, never an explicit user choice
    if (enable && groupMode() === "none") setGroupMode("time");
    clearSelection();
    nextCursor = null;
    fetchFolder(path);
  }

  function toggleFavFilter() {
    setFavFilter(!favFilter());
    clearSelection();
    // folder mode filters the loaded list client-side; the feed filters
    // server-side so pagination spans every starred file in the subtree
    if (feedMode()) fetchFeed(path);
  }

  async function toggleFavorite(item) {
    const next = !item.favorite;
    try {
      const resp = await fetchApi("/promptchain/browse/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, path: item.path, on: next }),
      });
      if (!resp.ok) {
        toast?.("error", "Failed to update favorite");
        return;
      }
      patchItem(item.path, { favorite: next });
      // server-side starred feed won't refilter on a patch — remove directly
      if (!next && feedMode() && favFilter()) dropItems([item.path]);
    } catch {
      toast?.("error", "Failed to update favorite (network error)");
    }
  }

  // --- Targeted item mutations (avoid full-folder refetch) ---

  // feed order is fixed newest-first regardless of the folder-mode sort pref
  function currentSortKey() {
    return feedMode()
      ? { field: "modified", direction: "desc" }
      : { field: prefs.sortField, direction: prefs.sortDirection };
  }

  function insertItem(item) {
    const k = currentSortKey();
    items = insertSorted(items, item, k.field, k.direction);
  }

  function patchItem(oldPath, data) {
    const k = currentSortKey();
    items = patchItemInList(items, oldPath, data, k.field, k.direction);
  }

  function dropItems(paths) {
    items = dropItemsByPath(items, paths);
  }

  async function fetchItem(itemScope, itemPath) {
    const params = new URLSearchParams({ scope: itemScope, path: itemPath });
    const resp = await fetchApi(`/promptchain/browse/item?${params}`);
    if (!resp.ok) return null;
    return resp.json();
  }

  // --- Navigation ---
  function switchScope(newScope) {
    if (newScope === nav.scope) {
      // already on this scope — reset to root
      if (path.length > 0) {
        pushNav();
        clearSelection();
        fetchFolder([]);
      }
      return;
    }
    pushNav();
    nav.scope = newScope;
    searchQuery = "";
    clearSelection();
    fetchFolder(nav.paths[newScope] || []);
  }

  function navigateTo(name) {
    pushNav();
    clearSelection();
    fetchFolder([...path, name]);
  }

  function navigateToBreadcrumb(index) {
    pushNav();
    clearSelection();
    fetchFolder(path.slice(0, index + 1));
  }

  function navigateToRoot() {
    pushNav();
    clearSelection();
    fetchFolder([]);
  }

  function handleSortChange() {
    fetchFolder(path);
  }

  // badge / "Open file location" round-trip out of feed mode
  async function exitFeedAndLocate(item) {
    pushNav();
    setFeedMode(false);
    const parentSegs = item.path.split("/").slice(0, -1);
    clearSelection();
    await fetchFolder(parentSegs);
    selectItem(item.path);
    setCursor(item.path);
    await tick();
    scrollItemIntoView(item.path);
  }

  function handleSearchChange(q) {
    searchQuery = q;
    // feed search is server-side (whole subtree, not just loaded pages);
    // the shared abort controller makes per-keystroke refetch safe
    if (feedMode()) fetchFeed(path, false, true);
  }

  // --- Filtered & grouped display ---
  // feed mode: server already filtered search (by rel path, so folder names
  // match too) and starred — client filtering here would fight pagination
  let filteredItems = $derived.by(() => {
    if (isFeed) return items;
    let out = items;
    if (searchQuery) out = out.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (isFavFilter) out = out.filter(i => i.favorite);
    return out;
  });

  let currentGroupMode = $derived(groupMode());

  let groups = $derived(buildGroups(filteredItems, currentGroupMode));

  let displayItems = $derived(groups.flatMap(g => g.items));
  let allPaths = $derived(displayItems.map(i => i.path));
  let mediaItems = $derived(displayItems.filter(i => i.type === "image" || i.type === "video"));

  // --- Item interaction ---
  function handleItemClick(item, event) {
    setCursor(item.path);
    if (event.ctrlKey || event.metaKey) {
      toggleItem(item.path);
      return;
    }
    if (event.shiftKey) {
      selectRange(item.path, allPaths);
      return;
    }
    selectItem(item.path);
    if (item.type === "folder") {
      navigateTo(item.name);
    } else if (item.type === "image" || item.type === "video") {
      const idx = mediaItems.findIndex(i => i.path === item.path);
      onOpenViewer?.(item, scope, path, mediaItems, idx);
    } else if (item.type === "workflow") {
      onLoadWorkflow?.(item, scope, path);
    }
  }

  function handleItemDblClick(item) {
    if (item.type === "folder") navigateTo(item.name);
    else if (item.type === "image" || item.type === "video") onOpenViewer?.(item, scope, path);
    else if (item.type === "workflow") onLoadWorkflow?.(item, scope, path);
  }

  // --- Context menu ---
  function handleContextMenu(item, event) {
    event.preventDefault();
    // if right-clicking an unselected item, select it
    if (item && !selection.items.has(item.path)) {
      selectItem(item.path);
    }
    ctxMenu = { x: event.clientX, y: event.clientY, item };
  }

  // --- Internal drag-drop (move into folder) ---
  async function handleItemDrop(srcPaths, srcScope, folderPath) {
    // skip if dropping items into their own parent folder (no-op).  In feed
    // mode items live at arbitrary depths, so compare each item's parent
    // instead of the view dir.
    const currentDir = path.join("/");
    if (srcScope === scope && (feedMode()
      ? srcPaths.every(p => p.split("/").slice(0, -1).join("/") === folderPath)
      : folderPath === currentDir)) return;
    // skip if dropping a folder into itself
    if (srcPaths.length === 1 && srcPaths[0] === folderPath) return;
    const dropScope = scope;
    await executePaste({
      srcScope: srcScope,
      dstScope: dropScope,
      dstPath: folderPath,
      paths: srcPaths,
      op: "cut",
    }, (result) => {
      clearSelection();
      // a moved item stays inside the feed's subtree under a new path —
      // refetch rather than patching paths item by item
      if (feedMode()) {
        fetchFeed(path);
        return;
      }
      // Source-side removal only happens after the server confirms which
      // paths were moved.  `pastedSources` is source-relative (skipped and
      // errored items excluded) — `pasted` holds destination paths, which
      // never match the items in the source view.
      if (srcScope === dropScope && result.pastedSources?.length) {
        dropItems(result.pastedSources);
      }
    });
  }

  function handleBgContextMenu(event) {
    event.preventDefault();
    clearSelection();
    ctxMenu = { x: event.clientX, y: event.clientY, item: null };
  }

  async function handleCtxAction(action) {
    if (action === "refresh") {
      fetchFolder(path);
    } else if (action === "edit") {
      const item = ctxMenu?.item;
      if (item?.type === "image") {
        const idx = mediaItems.findIndex(i => i.path === item.path);
        onOpenViewer?.(item, scope, path, mediaItems, idx, { autoEdit: true });
      }
    } else if (action === "cut") {
      handleCut();
    } else if (action === "copy") {
      handleCopy();
    } else if (action === "copy-path") {
      const item = ctxMenu?.item;
      if (item) {
        const root = scopeRoots[nav.scope] || "";
        let full = root ? `${root}/${item.path}` : item.path;
        // The backend normalizes root/paths to forward slashes for web use; restore
        // native separators when the path is Windows-rooted (drive letter or UNC) so
        // it pastes correctly into Explorer and Windows apps.
        if (/^[a-zA-Z]:[/\\]/.test(full) || full.startsWith("//")) {
          full = full.replace(/\//g, "\\");
        }
        await navigator.clipboard.writeText(full);
        toast?.("info", "Path copied to clipboard");
      }
    } else if (action === "paste") {
      await handlePaste();
    } else if (action === "properties") {
      const item = ctxMenu?.item;
      // item properties or current folder properties
      propsItem = item || { path: path.join("/") || "", name: path[path.length - 1] || scope, type: "folder" };
      propsOpen = true;
    } else if (action === "mkdir") {
      modalMode = "mkdir";
      modalTitle = "New Folder";
      modalPlaceholder = "Folder name";
      modalDefault = "";
      modalSelectEnd = -1;
      modalConfirmLabel = "Create";
      modalOpen = true;
    } else if (action === "rename") {
      const item = ctxMenu?.item;
      if (!item) return;
      const dotIdx = item.type !== "folder" && item.name.includes(".") ? item.name.lastIndexOf(".") : -1;
      renameItem = item;
      modalMode = "rename";
      modalTitle = "Rename";
      modalPlaceholder = "New name";
      modalDefault = item.name;
      modalSelectEnd = dotIdx >= 0 ? dotIdx : -1;
      modalConfirmLabel = "Rename";
      modalOpen = true;
    } else if (action === "new-workflow") {
      nwmAnchor = ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : { x: 100, y: 100 };
      nwmOpen = true;
    } else if (action === "locate") {
      const item = ctxMenu?.item;
      if (item) exitFeedAndLocate(item);
    } else if (action === "favorite") {
      const item = ctxMenu?.item;
      if (item) toggleFavorite(item);
    } else if (action === "duplicates") {
      dupOpen = true;
    } else if (action === "delete") {
      const paths = selection.items.size > 0
        ? [...selection.items]
        : ctxMenu?.item ? [ctxMenu.item.path] : [];
      if (!paths.length) return;
      confirmPaths = paths;
      confirmMsg = paths.length === 1
        ? `Delete "${paths[0].split("/").pop()}"?`
        : `Delete ${paths.length} items?`;
      confirmOpen = true;
    }
  }

  async function executeDelete() {
    confirmOpen = false;
    browserEl?.focus();
    const paths = confirmPaths;
    confirmPaths = [];
    try {
      const resp = await fetchApi("/promptchain/browse/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, paths }),
      });
      const result = await safeJson(resp);
      if (result.deleted?.length) {
        dropItems(result.deleted);
        window.dispatchEvent(new CustomEvent("promptchain:file-deleted", {
          detail: { scope, paths: result.deleted },
        }));
      }
      clearSelection();
      if (result.errors?.length) toast?.("warn", `Failed to delete ${result.errors.length} item(s)`);
    } catch (e) {
      if (e instanceof HttpError) {
        const body = e.body ? (() => { try { return JSON.parse(e.body); } catch { return null; } })() : null;
        toast?.("error", body?.error || `Failed to delete (${e.status})`);
      } else {
        console.error("[PromptChain] delete failed:", e);
        toast?.("error", "Failed to delete (network error)");
      }
    }
  }

  // --- Rubber-band selection ---
  let rbActive = $state(false);
  let rbStartX = $state(0), rbStartY = $state(0);
  let rbEndX = $state(0), rbEndY = $state(0);
  let rbLeft = $derived(Math.min(rbStartX, rbEndX));
  let rbTop = $derived(Math.min(rbStartY, rbEndY));
  let rbWidth = $derived(Math.abs(rbEndX - rbStartX));
  let rbHeight = $derived(Math.abs(rbEndY - rbStartY));
  let justFinishedRb = false;

  function isRbTarget(el) {
    if (el === contentEl) return true;
    // allow starting on grid/list containers and empty placeholders
    const cl = el.classList;
    if (!cl) return false;
    return cl.contains("pcr-gv") || cl.contains("pcr-gg") ||
           cl.contains("pcr-jg") || cl.contains("pcr-lv") || cl.contains("pcr-ph");
  }

  function handleRbDown(e) {
    if (e.button !== 0 || !isRbTarget(e.target)) return;
    rbActive = true;
    rbStartX = rbEndX = e.clientX;
    rbStartY = rbEndY = e.clientY;
    if (!e.ctrlKey && !e.metaKey) clearSelection();
  }

  function handleRbMove(e) {
    if (!rbActive) return;
    if (!(e.buttons & 1)) { rbActive = false; return; }
    rbEndX = e.clientX;
    rbEndY = e.clientY;
    if (!contentEl) return;
    // compute rect locally (derived values may not be flushed yet)
    const left = Math.min(rbStartX, rbEndX);
    const top = Math.min(rbStartY, rbEndY);
    const right = Math.max(rbStartX, rbEndX);
    const bottom = Math.max(rbStartY, rbEndY);
    const els = contentEl.querySelectorAll("[data-item-path]");
    const selected = [];
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > left && r.left < right && r.bottom > top && r.top < bottom) {
        const p = el.getAttribute("data-item-path");
        if (p) selected.push(p);
      }
    });
    setSelection(selected);
  }

  function handleRbUp() {
    if (rbActive) justFinishedRb = true;
    rbActive = false;
  }

  // --- Clipboard ---
  function handleCut() {
    if (selection.items.size === 0) return;
    const sel = items.filter(i => selection.items.has(i.path));
    clipCut(scope, sel);
  }

  function handleCopy() {
    if (selection.items.size === 0) return;
    const sel = items.filter(i => selection.items.has(i.path));
    clipCopy(scope, sel);
  }

  async function executePaste(payload, onSuccess) {
    try {
      const resp = await fetchApi("/promptchain/browse/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast?.("error", err.error || "Paste failed");
        return;
      }
      const result = await resp.json();
      if (result.conflicts) {
        conflictData = { ...result, pendingPayload: payload, onSuccess };
        conflictOpen = true;
        return;
      }
      if (result.pasted?.length) toast?.("success", `Pasted ${result.pasted.length} item(s)`);
      onSuccess?.(result);
    } catch { /* network error — UI already shows no change */ }
  }

  async function handleConflictResolution(resolution) {
    conflictOpen = false;
    browserEl?.focus();
    if (!conflictData?.pendingPayload) return;
    const { onSuccess } = conflictData;
    await executePaste({ ...conflictData.pendingPayload, conflictResolution: resolution }, onSuccess);
    conflictData = null;
  }

  async function handlePaste() {
    if (!clipboard.items.length || !clipboard.op) return;
    const pasteOp = clipboard.op;
    // Capture the destination at paste-initiation time.  If the user
    // navigates during the async paste, we must still place items into
    // the folder the server actually wrote them to — not wherever the
    // user happens to be now.
    const pasteScope = scope;
    const pastePath = [...path];
    const dstPathStr = pastePath.join("/");
    await executePaste({
      srcScope: clipboard.scope,
      dstScope: pasteScope,
      dstPath: dstPathStr,
      paths: clipboard.items.map(i => i.path),
      op: pasteOp,
    }, async (result) => {
      clearSelection();
      if (!result.pasted?.length) return;
      try {
        const fetched = await Promise.all(result.pasted.map(p => fetchItem(pasteScope, p)));
        // Only mutate the visible list if the user is still viewing the
        // destination folder; otherwise the paste succeeded server-side
        // but the current view isn't it.
        const stillOnDest = scope === pasteScope && path.join("/") === dstPathStr;
        if (stillOnDest) {
          for (const it of fetched) { if (it) insertItem(it); }
        }
        // Clear clipboard only after inserts complete successfully —
        // a failed fetch with a cut clipboard would otherwise orphan
        // the source files from the user's perspective.
        if (pasteOp === "cut") clipClear();
      } catch (e) {
        console.error("[PromptChain] paste followup failed:", e);
        toast?.("error", "Paste completed but refresh failed");
      }
    });
  }

  // --- Keyboard ---
  let browserEl;

  // type-to-select (Explorer-style): printable keys jump to the next item
  // whose name starts with the typed prefix; the buffer resets after a 1s
  // typing pause — checked by timestamp at the next keypress, no timer
  let typeBuf = "";
  let typeBufAt = 0;

  function handleTypeAhead(key) {
    const now = Date.now();
    if (now - typeBufAt > 1000) typeBuf = "";
    typeBufAt = now;
    const ch = key.toLowerCase();
    typeBuf += ch;

    const list = displayItems;
    if (!list.length) return;
    const names = list.map(i => i.name.toLowerCase());
    const curIdx = cursor.path ? list.findIndex(i => i.path === cursor.path) : -1;
    // a fresh buffer starts at the item AFTER the cursor (so pressing the
    // same letter walks matches); an extended buffer includes the cursor
    // (so "q" then "w" stays on the "qw..." item just selected)
    const fresh = typeBuf.length === 1;
    const begin = curIdx < 0 ? 0 : fresh ? (curIdx + 1) % list.length : curIdx;

    let matchIdx = -1;
    for (let off = 0; off < list.length; off++) {
      const i = (begin + off) % list.length;
      if (names[i].startsWith(typeBuf)) { matchIdx = i; break; }
    }
    // Explorer cycle: a repeated key with no literal "qq..." match means
    // "next item starting with that letter"
    if (matchIdx < 0 && typeBuf.length > 1 && [...typeBuf].every(c => c === ch)) {
      typeBuf = ch;
      for (let off = 1; off <= list.length; off++) {
        const i = (begin + off) % list.length;
        if (names[i].startsWith(ch)) { matchIdx = i; break; }
      }
    }
    if (matchIdx < 0) return;
    const p = list[matchIdx].path;
    setCursor(p);
    selectItem(p);
    scrollItemIntoView(p);
  }

  function handleKeydown(event) {
    // don't intercept keys when a modal is open — let the modal handle them
    if (modalOpen || conflictOpen || confirmOpen || propsOpen || nwmOpen || dupOpen) return;
    // only handle shortcuts when focus is inside the sidebar
    if (!browserEl?.contains(document.activeElement) && !browserEl?.contains(event.target)) return;
    if (event.target.tagName === "INPUT") return;
    if (event.ctrlKey && event.key === "a") {
      event.preventDefault();
      selectAll(allPaths);
    }
    if (event.key === "Escape") {
      if (ctxMenu) { ctxMenu = null; }
      else if (selection.items.size > 0) { clearSelection(); }
      else if (clipboard.items.length > 0) { clipClear(); }
    }
    if (event.ctrlKey && event.key === "x") { event.preventDefault(); handleCut(); }
    if (event.ctrlKey && event.key === "c") { event.preventDefault(); handleCopy(); }
    if (event.ctrlKey && event.key === "v") { event.preventDefault(); handlePaste(); }
    if (event.key === "Delete" && selection.items.size > 0) {
      handleCtxAction("delete");
    }
    if (event.key === "F2" && selection.items.size === 1) {
      const itemPath = [...selection.items][0];
      const item = items.find(i => i.path === itemPath);
      if (item) {
        const dotIdx = item.type !== "folder" && item.name.includes(".") ? item.name.lastIndexOf(".") : -1;
        renameItem = item;
        modalMode = "rename";
        modalTitle = "Rename";
        modalPlaceholder = "New name";
        modalDefault = item.name;
        modalSelectEnd = dotIdx >= 0 ? dotIdx : -1;
        modalConfirmLabel = "Rename";
        modalOpen = true;
      }
    }
    if (event.altKey && event.key === "Enter" && selection.items.size === 1) {
      event.preventDefault();
      const itemPath = [...selection.items][0];
      const item = items.find(i => i.path === itemPath);
      if (item) { propsItem = item; propsOpen = true; }
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && displayItems.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      const paths = allPaths;
      let curIdx = cursor.path ? paths.indexOf(cursor.path) : -1;
      // if cursor is stale/missing, start from first selected item or 0
      if (curIdx < 0 && selection.anchor) curIdx = paths.indexOf(selection.anchor);
      if (curIdx < 0 && selection.items.size > 0) {
        const first = [...selection.items][0];
        curIdx = paths.indexOf(first);
      }
      if (curIdx < 0) curIdx = -1;

      const isGrid = currentViewMode !== "list";
      const cols = isGrid ? getGridColumns() : 1;
      let next;
      if (curIdx === -1) {
        next = 0;
      } else {
        if (event.key === "ArrowDown") next = curIdx + cols;
        else if (event.key === "ArrowUp") next = curIdx - cols;
        else if (event.key === "ArrowRight") next = curIdx + 1;
        else next = curIdx - 1;
      }
      next = Math.max(0, Math.min(next, paths.length - 1));

      setCursor(paths[next]);

      if (event.ctrlKey || event.metaKey) {
        // Ctrl+Arrow: move cursor only, don't change selection
      } else if (event.shiftKey) {
        if (!selection.anchor || paths.indexOf(selection.anchor) < 0) {
          selection.anchor = curIdx >= 0 ? paths[curIdx] : paths[next];
        }
        const ai = paths.indexOf(selection.anchor);
        const lo = Math.min(ai, next), hi = Math.max(ai, next);
        selection.items = new Set(paths.slice(lo, hi + 1));
      } else {
        selectItem(paths[next]);
      }
      scrollItemIntoView(paths[next]);
    }
    if (event.key === " " && cursor.path) {
      event.preventDefault();
      toggleItem(cursor.path);
    }
    if (event.key === "Enter" && cursor.path) {
      const item = displayItems.find(i => i.path === cursor.path);
      if (item) {
        if (item.type === "folder") navigateTo(item.name);
        else if (item.type === "image" || item.type === "video") {
          const idx = mediaItems.findIndex(i => i.path === item.path);
          onOpenViewer?.(item, scope, path, mediaItems, idx);
        } else if (item.type === "workflow") onLoadWorkflow?.(item, scope, path);
      }
    }
    if (event.key === "Backspace" && path.length > 0) {
      pushNav();
      clearSelection();
      fetchFolder(path.slice(0, -1));
    }
  }

  // Printable keys must be intercepted in the WINDOW CAPTURE phase: ComfyUI's
  // own keydown handler registered earlier on the bubble path, so it runs
  // before svelte:window handlers — it steals focus to the litegraph canvas
  // and the sidebar never sees the next key.  Capture runs first; stopping
  // propagation here keeps the key entirely inside the sidebar.
  $effect(() => {
    function onKeydownCapture(e) {
      if (modalOpen || conflictOpen || confirmOpen || propsOpen || nwmOpen || dupOpen) return;
      if (!browserEl?.contains(document.activeElement) && !browserEl?.contains(e.target)) return;
      if (e.target.tagName === "INPUT") return;
      if (e.key.length !== 1 || e.key === " " || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      handleTypeAhead(e.key);
    }
    window.addEventListener("keydown", onKeydownCapture, true);
    return () => window.removeEventListener("keydown", onKeydownCapture, true);
  });

  function getGridColumns() {
    if (!contentEl) return 1;
    // regular grid: read CSS grid columns
    const grid = contentEl.querySelector(".pcr-gg");
    if (grid) {
      return getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    }
    // justified layout: count items sharing the same top position in the first row
    const items = contentEl.querySelectorAll("[data-item-path]");
    if (items.length < 2) return 1;
    const firstTop = items[0].getBoundingClientRect().top;
    let cols = 1;
    for (let i = 1; i < items.length; i++) {
      if (Math.abs(items[i].getBoundingClientRect().top - firstTop) < 5) cols++;
      else break;
    }
    return cols;
  }

  function scrollItemIntoView(itemPath) {
    if (!contentEl) return;
    const el = contentEl.querySelector(`[data-item-path="${CSS.escape(itemPath)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }

  function handleMouseNav(event) {
    if (event.button === 3) { event.preventDefault(); navigateBack(); }
    if (event.button === 4) { event.preventDefault(); navigateForward(); }
  }

  // ctrl+wheel zoom
  let contentEl;
  $effect(() => {
    if (!contentEl) return;
    function onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setThumbSize(thumbSize() + (e.deltaY > 0 ? -15 : 15));
    }
    contentEl.addEventListener("wheel", onWheel, { passive: false });
    return () => contentEl.removeEventListener("wheel", onWheel);
  });

  // --- Infinite scroll (feed mode) ---
  // $state because the sentinel mounts inside {#if} — a plain let bound via
  // bind:this never re-triggers this effect
  let sentinelEl = $state(null);
  $effect(() => {
    items.length; // re-observe each page so a still-visible sentinel keeps loading
    if (!sentinelEl || !contentEl) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMoreFeed();
    }, { root: contentEl, rootMargin: "200px" });
    io.observe(sentinelEl);
    return () => io.disconnect();
  });

  // --- External file drop upload ---
  let externalDropActive = $state(false);
  let dragCounter = 0;

  function isExternalFileDrop(e) {
    return e.dataTransfer?.types?.includes("Files") &&
           !e.dataTransfer.types.includes("application/x-promptchain-move");
  }

  function handleExternalDragEnter(e) {
    if (!isExternalFileDrop(e)) return;
    e.preventDefault();
    dragCounter++;
    externalDropActive = true;
  }

  function handleExternalDragOver(e) {
    if (!isExternalFileDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleExternalDragLeave(e) {
    if (!isExternalFileDrop(e)) return;
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; externalDropActive = false; }
  }

  async function handleExternalDrop(e) {
    externalDropActive = false;
    dragCounter = 0;
    if (!isExternalFileDrop(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const files = await collectDroppedFiles(e.dataTransfer);
    if (!files.length) return;
    const formData = new FormData();
    formData.append("scope", scope);
    formData.append("path", path.join("/"));
    for (const f of files) formData.append("files", f, f._relativePath || f.name);
    try {
      const resp = await fetchApi("/promptchain/browse/upload", { method: "POST", body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast?.("error", err.error || "Upload failed");
        return;
      }
      const result = await resp.json();
      toast?.("success", `Uploaded ${result.uploaded.length} file(s)`);
      fetchFolder(path);
    } catch (err) {
      toast?.("error", "Upload failed");
    }
  }

  async function collectDroppedFiles(dt) {
    const files = [];
    if (dt.items) {
      const entries = [];
      for (const item of dt.items) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
        else { const f = item.getAsFile(); if (f) files.push(f); }
      }
      if (entries.length) {
        await Promise.all(entries.map(e => readEntry(e, files, "")));
        return files;
      }
    }
    for (const f of dt.files) files.push(f);
    return files;
  }

  function readEntry(entry, files, prefix) {
    return new Promise(resolve => {
      if (entry.isFile) {
        entry.file(f => {
          f._relativePath = prefix ? `${prefix}/${f.name}` : f.name;
          files.push(f);
          resolve();
        }, resolve);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const allEntries = [];
        const readBatch = () => {
          reader.readEntries(entries => {
            if (entries.length) {
              allEntries.push(...entries);
              readBatch();
            } else {
              const dirName = prefix ? `${prefix}/${entry.name}` : entry.name;
              Promise.all(allEntries.map(e => readEntry(e, files, dirName))).then(resolve);
            }
          }, resolve);
        };
        readBatch();
      } else {
        resolve();
      }
    });
  }

  // --- Targeted refresh helpers ---

  function isInSubtree(subfolder, dir) {
    return dir === "" || subfolder === dir || subfolder.startsWith(dir + "/");
  }

  async function checkMtimeAndRefresh(currentPath) {
    if (feedMode()) {
      // folder mtime doesn't reflect descendant changes — refetch page 1
      fetchFeed(currentPath);
      return;
    }
    const key = `${nav.scope}:${currentPath.join("/")}`;
    try {
      const params = new URLSearchParams({ scope: nav.scope, path: currentPath.join("/") });
      const resp = await fetchApi(`/promptchain/browse/mtime?${params}`);
      if (!resp.ok) { fetchFolder(currentPath); return; }
      const data = await resp.json();
      if (lastMtime[key] !== data.mtime) {
        lastMtime[key] = data.mtime;
        fetchFolder(currentPath);
      }
    } catch { fetchFolder(currentPath); }
  }

  async function fetchNewOutputFiles(files, currentPath) {
    const currentDir = currentPath.join("/");
    const relevant = files.filter(f => feedMode()
      ? isInSubtree(f.subfolder || "", currentDir)
      : (f.subfolder || "") === currentDir);
    if (!relevant.length) return;
    for (const f of relevant) {
      const p = f.subfolder ? `${f.subfolder}/${f.filename}` : f.filename;
      const item = await fetchItem("output", p);
      if (!item) continue;
      item._flash = true;
      const idx = items.findIndex(i => i.path === item.path);
      if (idx >= 0) patchItem(item.path, item);
      else insertItem(item);
    }
  }

  async function fetchWorkflowThumbnail(workflowId, currentPath) {
    const params = new URLSearchParams({ id: workflowId, path: currentPath.join("/") });
    const resp = await fetchApi(`/promptchain/browse/workflow-by-id?${params}`);
    if (!resp.ok) return;
    const item = await resp.json();
    const idx = items.findIndex(i => i.path === item.path);
    if (idx >= 0) patchItem(item.path, item);
    else insertItem(item);
  }

  async function fetchSingleNewItem(itemScope, detail, currentPath) {
    const currentDir = currentPath.join("/");
    const fileDir = detail.subfolder ?? detail.path?.split("/").slice(0, -1).join("/") ?? "";
    if (feedMode() ? !isInSubtree(fileDir, currentDir) : fileDir !== currentDir) return;
    const itemPath = detail.path ?? (detail.subfolder ? `${detail.subfolder}/${detail.name}` : detail.name);
    const item = await fetchItem(itemScope, itemPath);
    if (!item) return;
    item._flash = true;
    const idx = items.findIndex(i => i.path === item.path);
    if (idx >= 0) patchItem(item.path, item);
    else insertItem(item);
  }

  onMount(() => {
    fetchFolder(nav.paths[nav.scope] || []);

    const unsub = onSubscribeRefresh?.((changedScope, detail) => {
      if (changedScope !== null && changedScope !== nav.scope) return;
      const currentPath = nav.paths[nav.scope] || [];

      // targeted removal: specific files deleted externally
      if (detail?.removedPaths?.length) {
        dropItems(detail.removedPaths);
        return;
      }

      // visibility: cheap mtime check before full fetch
      if (detail?.visibility) {
        checkMtimeAndRefresh(currentPath);
        return;
      }

      // output: insert individual new files
      if (changedScope === "output" && detail?.files?.length && nav.scope === "output") {
        fetchNewOutputFiles(detail.files, currentPath);
        return;
      }

      // input: insert uploaded file
      if (changedScope === "input" && detail?.name && nav.scope === "input") {
        fetchSingleNewItem("input", detail, currentPath);
        return;
      }

      // workflows: targeted update if path known
      if (changedScope === "workflows" && nav.scope === "workflows") {
        if (detail?.path) {
          fetchSingleNewItem("workflows", detail, currentPath);
          return;
        }
        if (detail?.thumbnailUpdate && detail?.workflowId) {
          if (feedMode()) {
            // workflow-by-id only searches one dir; the workflow can sit
            // anywhere in the feed's subtree.  Refetch page 1 — but not
            // when scrolled into later pages, where a replace would yank
            // the scroll position for a cosmetic thumbnail refresh.
            if (items.length <= FEED_PAGE_SIZE) fetchFeed(currentPath);
            return;
          }
          fetchWorkflowThumbnail(detail.workflowId, currentPath);
          return;
        }
        if (detail?.thumbnailUpdate) return;
        fetchFolder(currentPath);
        return;
      }

      // fallback: full fetch
      fetchFolder(currentPath);
    });
    return () => unsub?.();
  });

  // --- Kebab menu ---
  function toggleKebab(e) {
    e.stopPropagation();
    kebabOpen = !kebabOpen;
  }

  $effect(() => {
    if (!kebabOpen) return;
    function onClick(e) {
      if (kebabEl && !kebabEl.contains(e.target)) kebabOpen = false;
    }
    function onKey(e) {
      if (e.key === "Escape") kebabOpen = false;
    }
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  });

  function kebabNewWorkflow() {
    kebabOpen = false;
    const rect = kebabEl?.getBoundingClientRect();
    nwmAnchor = rect ? { x: rect.right - 280, y: rect.bottom + 4 } : { x: 100, y: 100 };
    nwmOpen = true;
  }

  function kebabNewFolder() {
    kebabOpen = false;
    modalMode = "mkdir";
    modalTitle = "New Folder";
    modalPlaceholder = "Folder name";
    modalDefault = "";
    modalConfirmLabel = "Create";
    modalOpen = true;
  }

  // names come from cascade picks, not a naming dialog — suffix until unique
  // in the destination folder so repeat picks don't 409 on save
  async function uniqueWorkflowName(base, subfolder) {
    try {
      const params = new URLSearchParams({ scope: "workflows", path: subfolder });
      const resp = await fetchApi(`/promptchain/browse?${params}`);
      if (!resp.ok) return base;
      const data = await resp.json();
      const taken = new Set(
        (data.items || [])
          .filter(i => i.type === "workflow")
          .map(i => i.name.replace(/\.json$/i, "").toLowerCase())
      );
      if (!taken.has(base)) return base;
      let n = 2;
      while (taken.has(`${base} (${n})`)) n++;
      return `${base} (${n})`;
    } catch { return base; }
  }

  async function handleCascadePick(pick) {
    nwmOpen = false;
    browserEl?.focus();
    const subfolder = scope === "workflows" ? path.join("/") : "";
    const base = pick.blank ? "untitled" : pick.suggestedName;
    const workflowName = await uniqueWorkflowName(base, subfolder);
    await handleWorkflowCreated(workflowName, pick.template ?? null, pick.modelFilename ?? "");
  }

  async function handleWorkflowCreated(workflowName, template, modelFilename) {
    nwmOpen = false;
    const subfolder = scope === "workflows" ? path.join("/") : "";
    await onCreateWorkflow?.(workflowName, template, modelFilename, subfolder);
  }

  async function handleModalConfirm(name) {
    modalOpen = false;
    browserEl?.focus();
    if (modalMode === "rename") {
      await executeRename(name);
    } else {
      await executeMkdir(name);
    }
  }

  async function executeMkdir(name) {
    try {
      const resp = await fetchApi("/promptchain/browse/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, path: path.join("/"), name }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast?.("error", err.error || "Failed to create folder");
        return;
      }
      const result = await resp.json();
      // folders aren't part of the feed; the new dir shows up on exit
      if (!feedMode()) {
        insertItem({
          path: result.path,
          name,
          type: "folder",
          size: 0,
          modified: Math.floor(Date.now() / 1000),
          childCount: 0,
        });
      }
    } catch { /* network error — UI already shows no change */ }
  }

  async function executeRename(newName) {
    const item = renameItem;
    renameItem = null;
    if (!item) return;
    if (newName === item.name) return;
    const finalName = newName;
    try {
      const resp = await fetchApi("/promptchain/browse/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, path: item.path, name: finalName }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast?.("error", err.error || "Failed to rename");
        return;
      }
      const result = await resp.json();
      const oldPath = item.path;
      patchItem(oldPath, { path: result.path, name: finalName });
      if (selection.items.has(oldPath)) {
        const next = new Set(selection.items);
        next.delete(oldPath);
        next.add(result.path);
        selection.items = next;
        if (selection.anchor === oldPath) selection.anchor = result.path;
      }
    } catch { /* network error — UI already shows no change */ }
  }

  function handleModalCancel() {
    modalOpen = false;
    renameItem = null;
    browserEl?.focus();
  }

  function kebabFindDuplicates() {
    kebabOpen = false;
    dupOpen = true;
  }

  function kebabSettings() {
    kebabOpen = false;
    onOpenSettings?.();
  }

  // About modal lives in the vanilla onboarding bundle; dispatch an event so we
  // don't import across the bundle boundary (same pattern as the AI-setup modal).
  function kebabAbout() {
    kebabOpen = false;
    window.dispatchEvent(new CustomEvent("promptchain:show-about"));
  }

  function kebabHelp() {
    kebabOpen = false;
    window.open("https://github.com/mobcat40/ComfyUI-PromptChain#readme", "_blank", "noopener");
  }
</script>

<svelte:window onkeydown={handleKeydown} onmouseup={(e) => { handleMouseNav(e); handleRbUp(); }} onmousemove={handleRbMove} />

<div class="pcr-browser" bind:this={browserEl} tabindex="-1">
  <!-- header -->
  <div class="pcr-hdr">
    <a href="https://github.com/mobcat40/ComfyUI-PromptChain" target="_blank" rel="noopener noreferrer" title="PromptChain on GitHub">
      {#if logoUrl}
        <img src={logoUrl} alt="PromptChain" class="pcr-hdr-logo" />
      {/if}
    </a>
    <div class="pcr-hdr-btns">
      <button class="pcr-hdr-btn" title="Add PromptChain Node" onclick={() => onAddNode?.()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </button>
      <div class="pcr-kebab-wrap" bind:this={kebabEl}>
        <button class="pcr-hdr-btn" title="More options" onclick={toggleKebab}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
        {#if kebabOpen}
          <div class="pcr-kebab-dd">
            <button class="pcr-kebab-item" onclick={kebabNewWorkflow}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              New Workflow
            </button>
            <button class="pcr-kebab-item" onclick={kebabNewFolder}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              New Folder
            </button>
            {#if scope !== "workflows"}
              <button class="pcr-kebab-item" onclick={kebabFindDuplicates}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="8" y="8" width="12" height="12" rx="2"/>
                  <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
                </svg>
                Find Duplicates
              </button>
            {/if}
            <div class="pcr-kebab-sep"></div>
            <button class="pcr-kebab-item" onclick={kebabSettings}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
            </button>
            <div class="pcr-kebab-sep"></div>
            <button class="pcr-kebab-item" onclick={kebabAbout}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              About PromptChain
            </button>
            <button class="pcr-kebab-item" onclick={kebabHelp}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Help
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <Toolbar
    {scope} scopes={SCOPES}
    {searchQuery}
    onScopeChange={switchScope}
    onSearchChange={handleSearchChange}
    onSortChange={handleSortChange}
    onFeedToggle={toggleFeed}
    onFavFilterToggle={toggleFavFilter}
  />

  <!-- breadcrumb + item count -->
  <div class="pcr-bc">
    <button
      class="pcr-bc-seg"
      class:pcr-bc-drop={bcDropTarget === ""}
      onclick={navigateToRoot}
      ondragover={(e) => {
        if (!e.dataTransfer.types.includes("application/x-promptchain-move")) return;
        e.preventDefault(); e.dataTransfer.dropEffect = "move"; bcDropTarget = "";
      }}
      ondragleave={() => { if (bcDropTarget === "") bcDropTarget = null; }}
      ondrop={(e) => {
        bcDropTarget = null;
        const raw = e.dataTransfer.getData("application/x-promptchain-move");
        if (!raw) return; e.preventDefault();
        try {
          const d = JSON.parse(raw);
          if (Array.isArray(d.paths)) handleItemDrop(d.paths, d.scope, "");
        } catch (err) { console.warn("[PromptChain] invalid drop payload:", err); }
      }}
    >/</button>
    {#each path as seg, i}
      {@const segPath = path.slice(0, i + 1).join("/")}
      {#if i > 0}<span class="pcr-bc-sep">/</span>{/if}
      <button
        class="pcr-bc-seg"
        class:pcr-bc-drop={bcDropTarget === segPath}
        onclick={() => navigateToBreadcrumb(i)}
        ondragover={(e) => {
          if (!e.dataTransfer.types.includes("application/x-promptchain-move")) return;
          e.preventDefault(); e.dataTransfer.dropEffect = "move"; bcDropTarget = segPath;
        }}
        ondragleave={() => { if (bcDropTarget === segPath) bcDropTarget = null; }}
        ondrop={(e) => {
          bcDropTarget = null;
          const raw = e.dataTransfer.getData("application/x-promptchain-move");
          if (!raw) return; e.preventDefault();
          try {
            const d = JSON.parse(raw);
            if (Array.isArray(d.paths)) handleItemDrop(d.paths, d.scope, segPath);
          } catch (err) { console.warn("[PromptChain] invalid drop payload:", err); }
        }}
      >{seg}</button>
    {/each}
    {#if isFeed}
      <button class="pcr-bc-feedchip" title="Showing all subfolders, newest first — click to return to folder view" onclick={toggleFeed}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9"/>
          <polyline points="12 7 12 12 15.5 14"/>
        </svg>
        recent
      </button>
    {/if}
    {#if clipboard.items.length > 0}
      <span class="pcr-bc-info" class:pcr-bc-cut={clipboard.op === "cut"} class:pcr-bc-copy={clipboard.op === "copy"}>
        {clipboard.op === "cut" ? "Cut" : "Copied"} {clipboard.items.length} item{clipboard.items.length === 1 ? "" : "s"}
        <button class="pcr-bc-clear" onclick={clipClear} title="Clear clipboard">&times;</button>
      </span>
    {:else if selection.items.size > 0}
      <span class="pcr-bc-info pcr-bc-sel">{selection.items.size} selected</span>
    {:else}
      <span class="pcr-bc-info">{isFeed && feedTotal > displayItems.length ? `${displayItems.length} of ${feedTotal}` : displayItems.length}</span>
    {/if}
  </div>

  <!-- content -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pcr-content"
    bind:this={contentEl}
    onclick={(e) => {
      if (justFinishedRb) { justFinishedRb = false; return; }
      if (e.target === e.currentTarget) { clearSelection(); browserEl?.focus(); }
    }}
    onmousedown={handleRbDown}
    oncontextmenu={handleBgContextMenu}
    ondragenter={handleExternalDragEnter}
    ondragover={handleExternalDragOver}
    ondragleave={handleExternalDragLeave}
    ondrop={handleExternalDrop}
  >
    {#if loading}
      <div class="pcr-ph">Loading...</div>
    {:else if error}
      <div class="pcr-ph pcr-ph-err">{error}</div>
    {:else if displayItems.length === 0}
      {#if scope === "workflows" && !searchQuery && !isFeed && !isFavFilter && path.length === 0}
        <!-- first-run quick start: the only state every new user begins in -->
        <div class="pcr-qs">
          <svg class="pcr-qs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            <path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4"/>
          </svg>
          <div class="pcr-qs-title">No workflows yet</div>
          <div class="pcr-qs-sub">Pick a template wired up for your model and start rendering right away.</div>
          <button class="pcr-qs-btn" onclick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            nwmAnchor = { x: r.left, y: r.bottom + 6 };
            nwmOpen = true;
          }}>
            Create your first workflow
          </button>
        </div>
      {:else}
        <div class="pcr-ph">{searchQuery ? "No matches" : isFeed ? "No files" : "Empty folder"}</div>
      {/if}
    {:else}
      {#each groups as group}
        {#if group.label}
          <div class="pcr-group-hdr">{group.label}<span class="pcr-group-count">{group.items.length}</span></div>
        {/if}
        {#if currentViewMode === "list"}
          <ListView
            items={group.items} {scope}
            feed={isFeed}
            currentDir={path.join("/")}
            onlocate={exitFeedAndLocate}
            onfav={toggleFavorite}
            onitemclick={handleItemClick}
            onitemdblclick={handleItemDblClick}
            onitemcontextmenu={handleContextMenu}
            onitemdrop={handleItemDrop}
          />
        {:else}
          <GridView
            items={group.items} {scope}
            feed={isFeed}
            currentDir={path.join("/")}
            onlocate={exitFeedAndLocate}
            onfav={toggleFavorite}
            onitemclick={handleItemClick}
            onitemdblclick={handleItemDblClick}
            onitemcontextmenu={handleContextMenu}
            onitemdrop={handleItemDrop}
          />
        {/if}
      {/each}
      {#if isFeed && nextCursor}
        <div class="pcr-feed-sentinel" bind:this={sentinelEl}>
          {loadingMore ? "Loading more..." : ""}
        </div>
      {/if}
    {/if}
    {#if externalDropActive}
      <div class="pcr-drop-overlay">
        <div class="pcr-drop-label">Drop files to upload</div>
      </div>
    {/if}
  </div>

  {#if rbActive && rbWidth + rbHeight > 5}
    <div class="pcr-rb" style="left:{rbLeft}px;top:{rbTop}px;width:{rbWidth}px;height:{rbHeight}px;"></div>
  {/if}

  {#if ctxMenu}
    <ContextMenu
      x={ctxMenu.x} y={ctxMenu.y}
      {scope}
      feed={isFeed}
      targetItem={ctxMenu.item}
      onAction={handleCtxAction}
      onClose={() => ctxMenu = null}
    />
  {/if}
</div>

<PromptModal
  open={modalOpen}
  title={modalTitle}
  placeholder={modalPlaceholder}
  defaultValue={modalDefault}
  selectEnd={modalSelectEnd}
  confirmLabel={modalConfirmLabel}
  onConfirm={handleModalConfirm}
  onCancel={handleModalCancel}
/>

<NewWorkflowMenu
  open={nwmOpen}
  anchor={nwmAnchor}
  {fetchApi}
  onPick={handleCascadePick}
  onClose={() => { nwmOpen = false; browserEl?.focus(); }}
/>

<ConfirmModal
  open={confirmOpen}
  title="Delete"
  message={confirmMsg}
  confirmLabel="Delete"
  onConfirm={executeDelete}
  onCancel={() => { confirmOpen = false; confirmPaths = []; browserEl?.focus(); }}
/>

<ConflictModal
  open={conflictOpen}
  conflicts={conflictData?.conflicts ?? []}
  total={conflictData?.total ?? 0}
  onConfirm={handleConflictResolution}
  onCancel={() => { conflictOpen = false; conflictData = null; browserEl?.focus(); }}
/>

<PropertiesModal
  open={propsOpen}
  {scope}
  itemPath={propsItem?.path}
  onClose={() => { propsOpen = false; propsItem = null; browserEl?.focus(); }}
/>

<DuplicatesModal
  open={dupOpen}
  {scope}
  path={path.join("/")}
  {fetchApi}
  {onSubscribeDedup}
  onClose={() => { dupOpen = false; browserEl?.focus(); }}
  onDeleted={(paths) => dropItems(paths)}
/>

<style>
  .pcr-browser {
    display: flex; flex-direction: column; height: 100%;
    font-family: inherit; font-size: 12px;
    color: var(--input-text, #ddd);
    background: var(--comfy-menu-bg, #1a1a1a);
    outline: none;
  }

  .pcr-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 4px 10px 8px; flex-shrink: 0;
  }
  .pcr-hdr-logo { height: 28px; display: block; }
  .pcr-hdr-btns { display: flex; gap: 4px; }
  .pcr-hdr-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; padding: 0;
    border: none; border-radius: 4px; background: transparent;
    color: #888; cursor: pointer;
  }
  .pcr-hdr-btn svg { width: 18px; height: 18px; }
  .pcr-hdr-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--input-text, #fff);
  }

  .pcr-kebab-wrap { position: relative; }
  .pcr-kebab-dd {
    position: absolute; top: 100%; right: 0; z-index: 10000;
    min-width: 160px; margin-top: 4px;
    background: rgba(38, 38, 38, 0.92);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    padding: 4px 0;
  }
  .pcr-kebab-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 6px 12px;
    border: none; background: transparent;
    color: var(--input-text, #ccc); font-size: 12px;
    text-align: left; cursor: pointer; white-space: nowrap;
  }
  .pcr-kebab-item:hover { background: rgba(255, 255, 255, 0.08); }
  .pcr-kebab-item svg { width: 14px; height: 14px; flex-shrink: 0; }
  .pcr-kebab-sep {
    height: 1px; margin: 4px 0;
    background: rgba(255, 255, 255, 0.08);
  }

  .pcr-bc {
    display: flex; align-items: center; padding: 3px 8px; gap: 2px;
    flex-shrink: 0; overflow-x: auto; white-space: nowrap;
    border-bottom: 1px solid var(--border-color, #333);
  }
  .pcr-bc-seg {
    border: none; background: transparent;
    color: var(--input-text, #aaa); cursor: pointer;
    padding: 2px 4px; border-radius: 3px; font-size: 11px;
  }
  .pcr-bc-seg:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--input-text, #fff);
  }
  .pcr-bc-sep { color: var(--input-text, #555); font-size: 10px; }
  .pcr-bc-info {
    margin-left: auto; font-size: 10px;
    color: var(--input-text, #555); flex-shrink: 0;
  }
  .pcr-bc-sel { color: var(--p-button-text-primary-color, #4fc3f7); }
  .pcr-bc-cut { color: #e8bf5e; }
  .pcr-bc-copy { color: #84c2ff; }
  .pcr-bc-clear {
    border: none; background: transparent; color: inherit;
    cursor: pointer; font-size: 13px; padding: 0 0 0 4px;
    opacity: 0.6; line-height: 1;
  }
  .pcr-bc-clear:hover { opacity: 1; }
  .pcr-bc-drop {
    background: rgba(79, 195, 247, 0.25);
    color: var(--input-text, #fff);
    outline: 1px solid rgba(79, 195, 247, 0.6);
  }

  .pcr-bc-feedchip {
    display: inline-flex; align-items: center; gap: 3px;
    margin-left: 4px; padding: 1px 6px;
    border: 1px solid rgba(243, 107, 0, 0.45); border-radius: 8px;
    background: rgba(243, 107, 0, 0.12);
    color: #ff8a25; font-size: 10px; cursor: pointer; flex-shrink: 0;
  }
  .pcr-bc-feedchip:hover { background: rgba(243, 107, 0, 0.22); }
  .pcr-bc-feedchip svg { width: 10px; height: 10px; }

  .pcr-feed-sentinel {
    min-height: 24px; padding: 4px;
    text-align: center; font-size: 10px;
    color: var(--input-text, #666);
  }

  .pcr-content {
    flex: 1; overflow-x: hidden; user-select: none; position: relative;
    overflow-y: auto;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
  }

  .pcr-group-hdr {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 8px 4px; font-size: 11px; font-weight: 600;
    color: var(--input-text, #888); text-transform: uppercase; letter-spacing: 0.3px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    position: sticky; top: 0; z-index: 2;
    background: var(--comfy-menu-bg, #1a1a1a);
  }
  .pcr-group-count {
    font-weight: 400; font-size: 10px; color: var(--input-text, #555);
  }

  .pcr-drop-overlay {
    position: absolute; inset: 0; z-index: 100;
    background: rgba(79, 195, 247, 0.08);
    border: 2px dashed rgba(79, 195, 247, 0.5);
    border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
  }
  .pcr-drop-label {
    font-size: 13px; color: rgba(79, 195, 247, 0.9);
    padding: 8px 16px; background: rgba(0, 0, 0, 0.5);
    border-radius: 6px;
  }

  .pcr-ph {
    padding: 20px; text-align: center;
    color: var(--input-text, #666);
  }
  .pcr-ph-err { color: #c42020; }

  .pcr-qs {
    display: flex; flex-direction: column; align-items: center;
    gap: 8px; padding: 48px 24px; text-align: center;
  }
  .pcr-qs-icon { width: 40px; height: 40px; color: #555; }
  .pcr-qs-title { font-size: 14px; font-weight: 600; color: var(--input-text, #ccc); }
  .pcr-qs-sub { font-size: 12px; color: var(--input-text, #888); max-width: 240px; line-height: 1.45; }
  .pcr-qs-btn {
    margin-top: 10px; padding: 9px 18px;
    border: none; border-radius: 6px;
    background: #973f00; color: #fff;
    font-size: 13px; font-weight: 500; cursor: pointer;
  }
  .pcr-qs-btn:hover { background: #c85909; }

  :global(.pcr-rb) {
    position: fixed; z-index: 9999; pointer-events: none;
    background: rgba(79, 195, 247, 0.1);
    border: 1px solid var(--p-button-text-primary-color, #4fc3f7);
  }
</style>
