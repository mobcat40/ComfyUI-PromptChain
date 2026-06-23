<script>
  import { onDestroy } from "svelte";
  import UpscaleOptionsModal from "./UpscaleOptionsModal.svelte";
  import InpaintModal from "./InpaintModal.svelte";
  import EditModal from "./EditModal.svelte";
  import RePoseModal from "./RePoseModal.svelte";
  import ExtendModal from "./ExtendModal.svelte";
  import SmoothModal from "./SmoothModal.svelte";
  import ConfirmModal from "./sidebar/ConfirmModal.svelte";
  import LineageContextMenu from "./LineageContextMenu.svelte";
  import { buildRender, ancestry, CHILDREN_PER_ROW_CAP, CHILDREN_REVEAL_STEP } from "../lib/lineage-lanes.js";
  import { buildFigureRegions, matchRegionByOverlap } from "../lib/region-binding.js";

  let {
    images = [],
    startIndex = 0,
    workflowId = "",
    apiURL = (p) => p,
    fetchApi = null,
    onClose = () => {},
    onDelete = null,
    onUpscale = null,
    onUpscalePrepare = null,
    onUpscaleBackground = null,
    onUpscaleEnlarge = null,
    onInpaintPrepare = null,
    onInpaintRun = null,
    onInpaintSave = null,
    onInpaintUploadReference = null,
    onInpaintInstallPack = null,
    onMountPromptEditor = null,
    onEditPrepare = null,
    onEditSave = null,
    onInpaintRegion = null,
    onReposeCaps = null,     // () => Promise<{recipes}> — installable pose-transfer recipes
    onReposeRun = null,      // (opts) => tracker — background pose-transfer render
    onMountPoser = null,     // (el, {width,height,outputMode}) => Promise<handle> — detached 3D poser
    onExtendPrepare = null,  // (hash) => Promise<{lastFrameFilename,sourceRef,fps,frameCount,templateId,...}>
    onExtendRun = null,      // (opts) => tracker — background video continuation render
    onSmoothCheck = null,    // () => bool — RIFE pack + core video nodes registered
    onSmoothInstall = null,  // () => Promise — offer to install the RIFE pack
    onSmoothPrepare = null,  // (hash) => Promise<{sourceRef,fps,frameCount,...}>
    onSmoothRun = null,      // (opts) => tracker — background RIFE interpolation
    autoEdit = false,
  } = $props();

  // Two independent axes:
  // - currentIndex: timeline position (left/right arrows, scrubber, thumb clicks)
  // - displayedHash: which image is shown (may differ during lineage navigation)
  // When timeline navigation happens, displayedHash syncs to the timeline image.
  // When lineage navigation happens (up/down), only displayedHash changes.

  let currentIndex = $state(startIndex);
  let displayedHash = $state(images[startIndex]?.hash || null);
  let imageInfo = $state(null);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = $state(false);
  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };
  let imageLoaded = $state(false);
  let imageError = $state(false);
  let containerEl;
  let viewerEl;

  // gesture state (Ctrl+drag)
  let isGesturing = $state(false);
  let gestureStart = { x: 0, y: 0, time: 0 };
  let viewerTransformY = $state(0);
  let viewerOpacity = $state(1);
  const H_SWIPE_RATIO = 0.12;
  const H_VELOCITY = 0.6;
  const V_CLOSE_DIST = 160;
  const V_CLOSE_VELOCITY = 1.25;
  const V_NEXT_DIST = 90;
  const V_NEXT_VELOCITY = 0.9;
  const BOUNCE_MS = 300;

  // history strip state
  let historyExpanded = $state(false);
  let isDraggingScrubber = $state(false);
  let scrubberDragStartX = 0;
  let scrubberDragStartPercent = 0;
  let historyGridEl = $state(null);

  const STRIP_VISIBLE = 6;
  const GRID_COLUMNS = 4;
  const GRID_THUMB_SIZE = 56.5;
  const GRID_GAP = 4;
  const GRID_MAX_HEIGHT = 280;

  // compare mode state
  let compareMode = $state(false);
  let compareSliderPos = $state(50);
  let compareClipPercent = $state(50);
  let isDraggingSlider = $state(false);
  let compareDropdownOpen = $state(false);
  let upscaling = $state(false);
  let upscalePreparing = $state(false);
  let upscaleModalOpen = $state(false);
  let upscalePrepared = $state(null);
  let upscalePreviewUrl = $state("");
  let upscaleProgress = $state(null);
  let upscaleUnsub = null;
  let upscaleTracker = null;
  let compareTargetHash = $state(null);
  let compareTargetLabel = $state("");
  let mainImageEl = $state(null);

  let isOrphaned = $derived(imageInfo?.orphaned === 1);

  // ── orphan re-attachment ──
  // A DB-tracked image whose file went missing can be re-attached by picking
  // the file wherever it lives now; the server accepts it only when its
  // sha256 equals the record's hash, so the wrong file can't be attached.
  let reattachInputEl = $state(null);
  let reattaching = $state(false);
  let reattachMsg = $state("");
  let imageReloadNonce = $state(0);
  let canReattach = $derived(
    !!fetchApi && /^[0-9a-f]{64}$/.test(displayedHash || "")
    && !images.find(i => i.hash === displayedHash)?._directUrl
  );

  // the /promptchain/image URL 404'd before a re-attach — bust past any
  // cached failure once the record is healed
  function mainImageSrc(hash) {
    const url = imageUrl(hash);
    if (!imageReloadNonce) return url;
    return url + (url.includes("?") ? "&" : "?") + "r=" + imageReloadNonce;
  }

  async function handleReattachPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !fetchApi || !displayedHash) return;
    reattaching = true;
    reattachMsg = "";
    try {
      const fd = new FormData();
      fd.append("hash", displayedHash);
      fd.append("image", file);
      const res = await fetchApi("/promptchain/reattach", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        reattachMsg = res.status === 409
          ? "That file's content doesn't match this image."
          : `Re-attach failed: ${err?.error || res.status}`;
        return;
      }
      imageInfo = await res.json();
      imageReloadNonce += 1;
      imageError = false;
      imageLoaded = false;
      fetchApi(`/promptchain/lineage/${displayedHash}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => { if (data) lineageData = data; })
        .catch(() => {});
    } catch (err) {
      reattachMsg = `Re-attach failed: ${err.message}`;
    } finally {
      reattaching = false;
    }
  }

  // animation/UX timers — tracked for cleanup on unmount.
  // `$effect(() => () => cleanup)` doesn't work: the outer function has
  // no tracked dependencies, so Svelte never invokes the returned
  // teardown.  onDestroy is the correct primitive for one-shot cleanup.
  let closeTimer = null;
  let bounceTimer = null;
  let linkCopiedTimer = null;

  onDestroy(() => {
    clearTimeout(closeTimer);
    clearTimeout(bounceTimer);
    clearTimeout(linkCopiedTimer);
    clearTimeout(newGenTimer);
    upscaleUnsub?.(); // run continues server-side; we just stop listening
  });

  // toolbar state
  let zoomDropdownOpen = $state(false);
  let linkCopied = $state(false);
  const ZOOM_PRESETS = [50, 100, 200, 300, 400];
  let zoomDisplayText = $derived(`${Math.round(zoom * 100)}%`);
  let zoomSliderValue = $derived(Math.max(0, Math.min(100, 25 * Math.log2(zoom / 0.25))));

  // which hashes have a saved layer stack (sidecar) → a "layers" badge in the
  // strip. hash → layer count. Fetched once and refreshed after an edit-save.
  let editDocLayers = $state({});
  function refreshEditDocs() {
    if (!fetchApi) return;
    fetchApi("/promptchain/edit-docs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { editDocLayers = d?.docs || {}; })
      .catch(() => {});
  }
  $effect(() => { if (fetchApi) refreshEditDocs(); });

  // lineage state
  let lineageData = $state(null);
  let lineageList = $derived((() => {
    if (!lineageData) return [];
    // family = the FULL provenance tree (root-first DFS, siblings included),
    // so up/down reaches e.g. two upscales of the same source from each other.
    // Fallback to the vertical ancestor line for servers without the field.
    if (lineageData.family?.length) return lineageData.family;
    return [...(lineageData.ancestors || []), lineageData.image, ...(lineageData.descendants || [])].filter(Boolean);
  })());
  let lineageCurrentIdx = $derived(
    lineageList.findIndex(item => item?.hash === displayedHash)
  );
  // Re-pose restore walks these — the current image first, then its whole family
  // — so a re-posed result (or a later edit of it) resumes the setup that was
  // saved on its source image, not just the exact hash it ran on.
  let reposeLineageKeys = $derived(
    [displayedHash, ...lineageList.map((i) => i?.hash)].filter((h, i, a) => h && a.indexOf(h) === i)
  );

  // ── lineage strip bundling ──
  // Content-keyed lineage attaches EVERY reuse of the same source bytes to one
  // family, so a much-reused image buries this run's chain in sibling branches.
  // The strip shows the SPINE (root → … → current) plus the current image's
  // own descendants; every other branch collapses into an expandable bundle
  // chip hanging off the spine node it forks from.
  let expandedBundles = $state(new Set());

  function toggleBundle(at) {
    const next = new Set(expandedBundles);
    if (next.has(at)) next.delete(at); else next.add(at);
    expandedBundles = next;
  }

  // The strip is scoped to an ANCHOR — the image whose run the user is
  // inspecting — not to whatever node they're currently looking at. Without
  // this, stepping up to the root would recompute the spine from the root and
  // unbundle every sibling branch. Lineage-internal moves (arrows, strip
  // clicks) keep the anchor; any other way the displayed image changes
  // (timeline, gallery jump, save handoffs) re-anchors to the new image.
  let lineageFocusHash = $state(null);
  // Holds the hash a lineageJump is about to land on, so the re-anchor effect
  // skips exactly that transition and can't swallow an unrelated re-anchor if
  // writes ever coalesce. Untracked plain-let: writing it never re-runs the
  // effect (which would defeat the skip).
  let keepLineageFocusFor = null;
  $effect(() => {
    const h = displayedHash;
    if (keepLineageFocusFor === h) { keepLineageFocusFor = null; return; }
    keepLineageFocusFor = null;
    lineageFocusHash = h;
  });

  function lineageJump(hash) {
    keepLineageFocusFor = hash;
    displayedHash = hash;
  }

  // Topology primitives for the family tree, hoisted out of lineageDisplay so the
  // strip, the context-menu "expand branches" gate, and the subway lane builder
  // all read ONE source. byHash/childrenOf rebuild parent→children edges from each
  // node's parent_hash (a content sha256, so acyclic by construction). roots is the
  // true root plus any node orphaned by a deleted-and-absent parent, so the lane
  // builder can surface it as its own root rather than dropping it.
  let lineageTree = $derived((() => {
    const list = lineageList;
    const byHash = new Map(list.map(f => [f.hash, f]));
    const childrenOf = new Map();
    for (const f of list) {
      if (!f.parent_hash || !byHash.has(f.parent_hash)) continue;
      if (!childrenOf.has(f.parent_hash)) childrenOf.set(f.parent_hash, []);
      childrenOf.get(f.parent_hash).push(f);
    }
    for (const kids of childrenOf.values()) {
      kids.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    }
    const roots = list.filter(f => !f.parent_hash || !byHash.has(f.parent_hash)).map(f => f.hash);
    return { byHash, childrenOf, roots };
  })());

  // What operation produced a node, inferred ONLY from data we hold per family node
  // (dimensions vs its parent). Upscale is the one transform we can call with high
  // confidence here; re-roll/variation/repose would need a per-node op field from the
  // server (no seed/prompt on lineage records) — left unlabeled rather than guessed.
  // Edits are already surfaced separately via the editDocLayers (▦) badge.
  let lineageOps = $derived.by(() => {
    const { byHash } = lineageTree;
    const ops = new Map();
    for (const item of lineageList) {
      const p = item?.parent_hash ? byHash.get(item.parent_hash) : null;
      if (!p || !item.width || !item.height || !p.width || !p.height) continue;
      if (item.width > p.width * 1.2 && item.height > p.height * 1.2) {
        const wf = item.width / p.width, hf = item.height / p.height;
        // only assert a single multiplier when both axes scaled together; otherwise
        // it's a non-uniform grow — show the badge without an overstated factor
        const uniform = Math.abs(wf - hf) < 0.05;
        ops.set(item.hash, { kind: "upscale", factor: wf, uniform, from: { w: p.width, h: p.height } });
      }
    }
    return ops;
  });
  const fmtFactor = (f) => (Math.abs(f - Math.round(f)) < 0.05 ? `${Math.round(f)}×` : `${f.toFixed(1)}×`);

  let lineageDisplay = $derived((() => {
    const asNodes = (list) => list.map(item => ({ kind: "node", item }));
    if (lineageList.length < 2) return asNodes(lineageList);
    const { byHash, childrenOf } = lineageTree;
    if (!byHash.has(displayedHash)) return asNodes(lineageList);

    // parent_hash is a content sha256, so the family is acyclic by
    // construction — the visited set is cheap defense against malformed data
    // looping the browser.
    const subtreeNodes = (rootHash) => {
      const out = [];
      const seen = new Set();
      const stack = [rootHash];
      while (stack.length) {
        const h = stack.pop();
        if (seen.has(h)) continue;
        seen.add(h);
        const f = byHash.get(h);
        if (!f) continue;
        out.push(f);
        const kids = (childrenOf.get(h) || []).slice().reverse();
        for (const k of kids) stack.push(k.hash);
      }
      return out;
    };

    const buildFrom = (anchorHash) => {
      const spine = [];
      let cur = anchorHash;
      const climbed = new Set();
      while (cur && byHash.has(cur) && !climbed.has(cur)) {
        climbed.add(cur);
        spine.push(cur);
        cur = byHash.get(cur).parent_hash;
      }
      spine.reverse();
      const spineSet = new Set(spine);

      // the anchor run's results stay individually visible
      const ownSubtree = new Set();
      const seedStack = [anchorHash];
      while (seedStack.length) {
        const h = seedStack.pop();
        if (ownSubtree.has(h)) continue;
        ownSubtree.add(h);
        for (const k of childrenOf.get(h) || []) seedStack.push(k.hash);
      }

      const display = [];
      for (const h of spine) {
        display.push({ kind: "node", item: byHash.get(h) });
        const offSpine = (childrenOf.get(h) || [])
          .filter(k => !spineSet.has(k.hash) && !ownSubtree.has(k.hash));
        if (!offSpine.length) continue;
        const branchNodes = offSpine.flatMap(k => subtreeNodes(k.hash));
        if (expandedBundles.has(h)) {
          display.push({ kind: "collapse", at: h, count: branchNodes.length, preview: [] });
          for (const f of branchNodes) display.push({ kind: "node", item: f, branch: true });
        } else {
          display.push({ kind: "bundle", at: h, count: branchNodes.length, preview: branchNodes.slice(0, 2) });
        }
      }
      for (const f of subtreeNodes(anchorHash)) {
        if (f.hash !== anchorHash) display.push({ kind: "node", item: f });
      }
      return display;
    };

    const anchor = lineageFocusHash && byHash.has(lineageFocusHash) ? lineageFocusHash : displayedHash;
    let display = buildFrom(anchor);
    // the displayed image must always be on-strip — if it ended up inside a
    // collapsed bundle (e.g. a timeline jump onto a sibling branch), rebuild
    // the strip around it instead
    if (anchor !== displayedHash && !display.some(d => d.kind === "node" && d.item.hash === displayedHash)) {
      display = buildFrom(displayedHash);
    }
    return display;
  })());
  let lineageVisible = $derived(lineageDisplay.filter(d => d.kind === "node").map(d => d.item));
  let lineageDisplayCurrentIdx = $derived(
    lineageDisplay.findIndex(d => d.kind === "node" && d.item.hash === displayedHash)
  );
  let lineageHiddenCount = $derived(lineageList.length - lineageVisible.length);

  // ── subway lanes (right-click "Expand branches") ──
  // brokenOut holds CHILD-SUBTREE ROOT hashes the user has peeled into their own
  // vertical column. The rail switches from the compact strip to the lane view
  // whenever anything is broken out. subwayAnchor reuses the stable lineageFocusHash
  // so navigating between nodes never re-partitions the lanes, and the displayed
  // image is always on column 0 (anchored on the anchor's root→tip spine).
  let brokenOut = $state(new Set());
  // Per-parent override of how many siblings render individually before the rest
  // fold into a "+N" bundle chip; bumped by CHILDREN_REVEAL_STEP on a chip click.
  let lineageRevealed = $state(new Map());
  // Hashes the user pinned: a pinned sibling never folds into a +N bundle. Persisted
  // per family alongside the expansion overlay.
  let pinnedHashes = $state(new Set());
  function togglePin(hash) {
    const next = new Set(pinnedHashes);
    if (next.has(hash)) next.delete(hash); else next.add(hash);
    pinnedHashes = next;
  }
  let subwayAnchor = $derived(
    lineageFocusHash && lineageTree.byHash.has(lineageFocusHash) ? lineageFocusHash : displayedHash
  );
  // "Focus this branch": a VIEW-ONLY re-root. buildRender renders only this hash's
  // subtree (no parent_hash mutation, no effect on which image is displayed/loaded).
  let focusRootHash = $state(null);
  let laneRender = $derived(buildRender(lineageTree, subwayAnchor, brokenOut,
    { displayedHash, revealed: lineageRevealed, rootHash: focusRootHash, pinned: pinnedHashes }));
  let lanesActive = $derived((brokenOut.size > 0 || !!focusRootHash) && lineageList.length > 1);
  // is `desc` the focus root or a descendant of it? (guarded parent_hash climb)
  function isInSubtree(desc, rootHash) {
    const { byHash } = lineageTree;
    const seen = new Set();
    let cur = desc;
    while (cur && byHash.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      if (cur === rootHash) return true;
      cur = byHash.get(cur).parent_hash;
    }
    return false;
  }
  // Drop a stale focus when it leaves the family OR when navigation (arrows / strip /
  // timeline) moves the displayed image out of the focused subtree — otherwise the
  // current image would have no node in the focus-only tree and nothing would mark
  // "you are here". Writes focusRootHash only in the clear branch, so it can't loop.
  $effect(() => {
    if (!focusRootHash) return;
    if (!lineageTree.byHash.has(focusRootHash) || !isInSubtree(displayedHash, focusRootHash)) focusRootHash = null;
  });
  function focusBranch(hash) {
    if (!hash || !lineageTree.byHash.has(hash)) return;
    // land on the branch root first if the displayed image is outside the subtree,
    // so the invalidation effect doesn't immediately clear the focus we just set.
    if (!isInSubtree(displayedHash, hash)) lineageJump(hash);
    focusRootHash = hash;
  }
  function clearFocus() { focusRootHash = null; }

  // ── per-family expansion persistence ──
  // Remembers which branches the user expanded, keyed by the IMMUTABLE family root
  // (a content sha256), so reopening a family restores its tree shape. This is a
  // pure UI overlay: it stores ONLY brokenOut/revealed and never writes
  // displayedHash or touches how/which image loads — the family you land on is
  // always decided by the invoke point, and the materialize effect still guarantees
  // the displayed image is shown regardless of what was restored.
  const LANE_PREFS_KEY = "pcr.viewer.lanePrefs.v1";
  let familyRootHash = $derived(
    lineageTree.byHash.has(displayedHash) ? ancestry(lineageTree, displayedHash).root : null
  );
  let hydratedRoot = null; // plain let: writing it must not re-trigger the hydrate effect
  function readLanePrefs() {
    try { return JSON.parse(localStorage.getItem(LANE_PREFS_KEY) || "{}") || {}; } catch { return {}; }
  }
  // hydrate once when we enter a family; restore only branches that still exist
  $effect(() => {
    const root = familyRootHash;
    if (!root || root === hydratedRoot) return;
    hydratedRoot = root;
    const prefs = readLanePrefs()[root];
    brokenOut = new Set((prefs?.brokenOut || []).filter(h => lineageTree.byHash.has(h)));
    lineageRevealed = new Map((prefs?.revealed || []).filter(([k]) => lineageTree.byHash.has(k)));
    pinnedHashes = new Set((prefs?.pinned || []).filter(h => lineageTree.byHash.has(h)));
  });
  // persist after hydration; an empty overlay drops the entry rather than storing {}
  $effect(() => {
    const root = familyRootHash;
    const bo = [...brokenOut], rv = [...lineageRevealed], pn = [...pinnedHashes];
    if (!root || root !== hydratedRoot) return;
    try {
      const all = readLanePrefs();
      if (bo.length || rv.length || pn.length) all[root] = { brokenOut: bo, revealed: rv, pinned: pn };
      else delete all[root];
      localStorage.setItem(LANE_PREFS_KEY, JSON.stringify(all));
    } catch {}
  });

  // The child that CONTINUES a node's lane — "expand branches" peels the SIBLINGS,
  // never this. Matches buildLane's primary rule (spine-ward child, else oldest).
  function primaryChildHash(item) {
    const kids = lineageTree.childrenOf.get(item?.hash) || [];
    if (!kids.length) return null;
    const a = ancestry(lineageTree, subwayAnchor);
    return (kids.find(k => a.set.has(k.hash)) || kids[0]).hash;
  }
  function canExpand(item) {
    const primary = primaryChildHash(item);
    return (lineageTree.childrenOf.get(item?.hash) || [])
      .some(k => k.hash !== primary && !brokenOut.has(k.hash));
  }
  function expandBranches(item) {
    const primary = primaryChildHash(item);
    const next = new Set(brokenOut);
    for (const k of lineageTree.childrenOf.get(item?.hash) || [])
      if (k.hash !== primary) next.add(k.hash);
    brokenOut = next;
  }
  function foldLane(childRoot) {
    // folding a column folds its whole broken-out subtree with it
    const next = new Set(brokenOut);
    const stack = [childRoot];
    while (stack.length) {
      const h = stack.pop();
      next.delete(h);
      for (const k of lineageTree.childrenOf.get(h) || []) stack.push(k.hash);
    }
    brokenOut = next;
  }
  function collapseAllLanes() { brokenOut = new Set(); lineageRevealed = new Map(); focusRootHash = null; }

  // ── multi-select (ctrl/⌘/shift-click thumbs) → batch delete ──
  let selectedHashes = $state(new Set());
  // Selection is scoped to the visible family: drop any selected hash that isn't in
  // the current family tree (navigating to another family via arrows/timeline/gallery
  // must never leave a stale selection that a later [Del] would silently tombstone).
  // Reads selectedHashes but only writes a strictly smaller set, so it can't loop.
  $effect(() => {
    if (!selectedHashes.size) return;
    const { byHash } = lineageTree;
    const kept = [...selectedHashes].filter(h => byHash.has(h));
    if (kept.length !== selectedHashes.size) selectedHashes = new Set(kept);
  });
  function toggleSelect(hash) {
    const next = new Set(selectedHashes);
    if (next.has(hash)) next.delete(hash); else next.add(hash);
    selectedHashes = next;
  }
  function clearSelection() { if (selectedHashes.size) selectedHashes = new Set(); }
  // Shared click for every lineage thumb (strip + tree): modifier-click multi-selects;
  // a plain click clears any selection and navigates.
  function handleNodeClick(e, item) {
    if (compareDropdownOpen) {
      // mirror the dropdown's video filter — a video can't be the clip-path
      // "after" frame, so picking one would paint raw bytes into an <img>
      if (item.hash !== displayedHash && !isVideoItem(item)) enterCompareWith(item.hash, item.filename || item.hash.slice(0, 8));
      return;
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey) { toggleSelect(item.hash); return; }
    clearSelection();
    lineageJump(item.hash); exitCompare();
  }
  // Page more of a folded row's oldest siblings back into individual columns.
  function revealMore(parentHash) {
    const next = new Map(lineageRevealed);
    next.set(parentHash, (next.get(parentHash) ?? CHILDREN_PER_ROW_CAP - 1) + CHILDREN_REVEAL_STEP);
    lineageRevealed = next;
  }
  // the family has at least one fork worth fanning out
  let hasBranches = $derived((() => {
    for (const kids of lineageTree.childrenOf.values()) if (kids.length > 1) return true;
    return false;
  })());
  // header "expand" affordance — fan EVERY branch out at once (the full subway):
  // add every off-primary child across the whole family to brokenOut.
  function expandAll() {
    const a = ancestry(lineageTree, subwayAnchor);
    const next = new Set(brokenOut);
    for (const kids of lineageTree.childrenOf.values()) {
      if (kids.length < 2) continue;
      const primary = (kids.find(k => a.set.has(k.hash)) || kids[0]).hash;
      for (const k of kids) if (k.hash !== primary) next.add(k.hash);
    }
    brokenOut = next;
  }

  // Keep the displayed image materialized if it sits inside a folded branch: peel
  // the chain of off-primary roots from the anchor spine down to it. Guarded so it
  // only ever ADDS new roots (never loops).
  $effect(() => {
    if (!lanesActive) return;
    if (laneRender.nodes.some(n => n.hash === displayedHash)) return;
    const { byHash, childrenOf } = lineageTree;
    const a = ancestry(lineageTree, subwayAnchor);
    const toBreak = [];
    let cur = displayedHash;
    const guard = new Set();
    while (cur && byHash.has(cur) && !guard.has(cur) && !a.set.has(cur)) {
      guard.add(cur);
      const parent = byHash.get(cur).parent_hash;
      if (!parent || !byHash.has(parent)) break;
      const kids = childrenOf.get(parent) || [];
      const primary = (kids.find(k => a.set.has(k.hash)) || kids[0])?.hash;
      if (cur !== primary) toBreak.push(cur);
      cur = parent;
    }
    const additions = toBreak.filter(h => !brokenOut.has(h));
    if (additions.length) {
      const next = new Set(brokenOut);
      for (const h of additions) next.add(h);
      brokenOut = next;
    }
  });

  // SVG connector geometry — edges are DATA from laneRender; the rAF only MEASURES
  // pixel positions of known nodes (never infers topology from the DOM). The SVG
  // lives inside the scrolling wrapper so it translates with scroll for free; we
  // recompute only on expand/fold/resize/thumbnail-load — never on scroll, never on
  // a timer (event/observer-driven per CLAUDE.md).
  let lanesWrapEl = $state(null);
  let treeScrollEl = $state(null);
  let connectorGeom = $state([]);
  let connectorBox = $state({ w: 0, h: 0 });
  // The displayed image's root→self lineage — the active branch. One guarded walk
  // yields both the edge keys (`parent>child`, for the blue connector highlight)
  // and the node set (for dimming everything off the active branch). Derived (not
  // measured) so it re-resolves on navigation without recomputing geometry.
  let activePath = $derived.by(() => {
    const nodes = new Set(), edges = new Set();
    const { byHash } = lineageTree;
    const seen = new Set(); // cheap defense against malformed data looping the browser
    let cur = displayedHash;
    while (cur && byHash.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      nodes.add(cur);
      const p = byHash.get(cur).parent_hash;
      if (p && byHash.has(p)) edges.add(`${p}>${cur}`);
      cur = p;
    }
    return { nodes, edges };
  });
  // split so the highlighted paths paint over the dim ones
  let connectorsBase = $derived(connectorGeom.filter(g => !activePath.edges.has(g.key)));
  let connectorsActive = $derived(connectorGeom.filter(g => activePath.edges.has(g.key)));
  let measureScheduled = false;
  // Tree layout pitch: a row is one generation (node 64px + 22px gap), a column
  // one sibling slot (node 64px + 24px gap). Each lineage node is placed at
  // left = x*LANE_COL_W, top = depth*LANE_ROW_H.
  const LANE_ROW_H = 86;
  const LANE_COL_W = 88;
  // Layout coords relative to a content root — independent of scroll AND of CSS
  // transform, so the same measurement serves the P3 zoom panel unchanged.
  function contentXY(el, root) {
    let x = 0, y = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function measureConnectors() {
    const wrap = lanesWrapEl;
    if (!wrap) return;
    const geom = [];
    for (const e of laneRender.edges) {
      const a = wrap.querySelector(`[data-hash="${e.from}"]`);
      const b = wrap.querySelector(`[data-hash="${e.to}"]`);
      if (!a || !b) continue;
      const ra = contentXY(a, wrap), rb = contentXY(b, wrap);
      const px = ra.x + ra.w / 2, pb = ra.y + ra.h;   // parent bottom-center
      const cx = rb.x + rb.w / 2, ct = rb.y;           // child top-center
      // key by edge identity, not array index — when the edge set changes, a
      // keyed {#each} won't reuse a stale path d-string under a shifted index
      // (that was the one-frame connector "points at the old node" jitter).
      const key = `${e.from}>${e.to}`;
      if (Math.abs(px - cx) < 1) {
        geom.push({ key, d: `M ${px} ${pb} L ${cx} ${ct}` });                     // spine: straight down
      } else {
        const my = (pb + ct) / 2;                                                  // branch: smooth S-curve
        geom.push({ key, d: `M ${px} ${pb} C ${px} ${my}, ${cx} ${my}, ${cx} ${ct}` });
      }
    }
    connectorGeom = geom;
    connectorBox = { w: wrap.scrollWidth, h: wrap.scrollHeight };
  }
  function scheduleMeasure() {
    if (measureScheduled) return;
    measureScheduled = true;
    requestAnimationFrame(() => { measureScheduled = false; measureConnectors(); });
  }
  $effect(() => {
    if (!lanesActive) return;
    const ns = laneRender.nodes;   // read → track expand/fold/family changes
    if (ns) scheduleMeasure();
  });
  $effect(() => {
    if (!lanesWrapEl) return;
    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(lanesWrapEl);
    return () => ro.disconnect();
  });
  // "You are here": after expand/fold/navigation, bring the displayed image into
  // view — but only if it has drifted out of (or near the edge of) the viewport, so
  // we never yank a node the user can already see. Reads displayedHash + nodes so it
  // re-runs on every relevant change; the rAF lets layout settle first (no timer).
  function centerCurrentNode() {
    const scroller = treeScrollEl, wrap = lanesWrapEl;
    if (!scroller || !wrap) return;
    const el = wrap.querySelector(`[data-hash="${displayedHash}"]`);
    if (!el) return;
    const p = contentXY(el, scroller);
    // Edge margin clamped per-axis so the "already in view" range stays satisfiable
    // even on a narrow/linear panel — otherwise a perfectly centered node reads as
    // out-of-view and re-fires scrollTo on every navigation (jitter).
    const mX = Math.min(LANE_COL_W, Math.max(8, (scroller.clientWidth - p.w) / 2 - 1));
    const mY = Math.min(LANE_COL_W, Math.max(8, (scroller.clientHeight - p.h) / 2 - 1));
    const offL = p.x - scroller.scrollLeft, offT = p.y - scroller.scrollTop;
    const outH = offL < mX || offL + p.w > scroller.clientWidth - mX;
    const outV = offT < mY || offT + p.h > scroller.clientHeight - mY;
    if (!outH && !outV) return;
    scroller.scrollTo({
      left: Math.max(0, p.x + p.w / 2 - scroller.clientWidth / 2),
      top: Math.max(0, p.y + p.h / 2 - scroller.clientHeight / 2),
      behavior: "smooth",
    });
  }
  $effect(() => {
    if (!lanesActive) return;
    displayedHash; laneRender.nodes;   // track → recenter on navigation/expand
    requestAnimationFrame(centerCurrentNode);
  });

  let compareTargets = $derived(
    // wipe-compare only makes sense between two stills — a video can't be the
    // clip-path "after" frame, so it never appears as a compare target
    lineageList.filter(item => item?.hash !== displayedHash && !isVideoItem(item))
  );
  let hasCompareTargets = $derived(compareTargets.length > 0);
  let compareImageUrl = $derived(compareTargetHash ? imageUrl(compareTargetHash) : null);
  let compareTargetItem = $derived(
    compareTargetHash ? lineageList.find((item) => item?.hash === compareTargetHash) || null : null
  );

  let currentImage = $derived(images[currentIndex] || null);
  let scrubberPercent = $derived(
    images.length > 1 ? (currentIndex / (images.length - 1)) * 100 : 0
  );
  let visibleThumbs = $derived((() => {
    const start = Math.max(0, Math.min(currentIndex, images.length - STRIP_VISIBLE));
    return images.slice(start, start + STRIP_VISIBLE).map((img, i) => ({
      ...img,
      globalIndex: start + i,
    }));
  })());

  // fetch metadata + lineage when displayed hash changes.
  // Intentionally do NOT reset imageLoaded here — keeping the previous
  // frame visible while the browser decodes the new src eliminates the
  // flicker-to-spinner on every navigation. onerror resets it so a
  // broken image doesn't leave a stale frame under the error overlay.
  $effect(() => {
    if (!displayedHash || !fetchApi) return;
    imageError = false;
    reattachMsg = "";
    const img = images.find(i => i.hash === displayedHash);
    const onMetaError = (label) => (e) => {
      imageInfo = null;
      console.error(`[PromptChain] ${label} fetch failed for ${displayedHash}:`, e);
    };
    if (img?._directUrl) {
      // Browse-opened image. browse/meta hashes the file and returns its full
      // DB record when the file is tracked, so surface the family and align
      // displayedHash to that content hash — lineage, the current-node
      // highlight, and the edit/inpaint/upscale handoffs then all resolve like
      // a gallery open. A path-keyed entry (input scope) never reached the hash
      // endpoints, so the image's whole family was invisible.
      const scope = img._browseScope || "output";
      const path = img._browsePath || displayedHash;
      const openedHash = displayedHash;
      lineageData = null;
      fetchApi(`/promptchain/browse/meta?scope=${scope}&path=${encodeURIComponent(path)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          imageInfo = data;
          if (!data?.hash || displayedHash !== openedHash) return;
          // input scope is path-keyed: re-key so the effect re-runs down the
          // hash branch (which fetches lineage). output already carries its
          // hash, so re-key is a no-op there — fetch the family directly.
          if (displayedHash !== data.hash) { displayedHash = data.hash; return; }
          fetchApi(`/promptchain/lineage/${data.hash}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (displayedHash === data.hash) lineageData = d; })
            .catch((e) => console.error(`[PromptChain] lineage fetch failed for ${data.hash}:`, e));
        })
        .catch(onMetaError("browse meta"));
    } else {
      // DB-tracked image — use hash-based endpoints
      fetchApi(`/promptchain/image-meta/${displayedHash}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { imageInfo = data; })
        .catch(onMetaError("image meta"));
      // Capture the hash this fetch was issued for: displayedHash can change
      // (fast navigation / save-then-navigate) before the response lands, and a
      // late loser must NOT overwrite the current family — same staleness guard
      // the browse branch above uses. Deliberately not nulling lineageData first:
      // in-family navigation keeps the same family, so blanking it would flicker
      // the tree on every step.
      const reqHash = displayedHash;
      fetchApi(`/promptchain/lineage/${reqHash}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (displayedHash !== reqHash) return; // stale response — a newer hash is shown
          lineageData = data;
          reportLineageAnomaly(reqHash, data);
        })
        .catch((e) => {
          if (displayedHash !== reqHash) return;
          lineageData = null;
          console.error(`[PromptChain] lineage fetch failed for ${reqHash}:`, e);
        });
    }
  });

  // Re-anchor the timeline to wherever lineage navigation landed: when the
  // displayed image is a member of this workflow's timeline, left/right and
  // the scrubber should continue from ITS slot, not the last timeline spot.
  // Images outside the timeline (other workflows' outputs) leave the index
  // alone so left/right resumes where the user left off.
  $effect(() => {
    const idx = images.findIndex((i) => i.hash === displayedHash);
    if (idx >= 0 && idx !== currentIndex) currentIndex = idx;
  });

  // update hash URI when displayed image changes
  $effect(() => {
    if (!displayedHash) return;
    const wid = workflowId || "";
    const params = new URLSearchParams();
    // browse-opened images carry their file PATH as a pseudo-hash — write it
    // as scope+path params so a refresh can rebuild the same entry (a path is
    // meaningless to the hash-based restore endpoints)
    const img = images.find((i) => i.hash === displayedHash);
    if (img?._browsePath) {
      params.set("s", img._browseScope || "output");
      params.set("p", img._browsePath);
    } else {
      params.set("h", displayedHash);
      if (wid) params.set("w", wid);
    }
    try {
      history.replaceState(null, "", `#pcr/view?${params}`);
    } catch (e) {
      // Strict CSP or some embedded contexts block history API — not
      // fatal, just skip the URI sync.
      console.warn("[PromptChain] history update blocked:", e);
    }
  });

  // TEMP (inpaint-target diagnosis): trace every displayedHash transition so a
  // stray post-save revert to the source is caught with its trigger stack
  // instead of inferred. Remove once the splice fix is confirmed in the wild.
  $effect(() => {
    console.trace("[PCR][viewer] displayedHash ->", displayedHash, "currentIndex", currentIndex);
  });

  // hash → gallery entry, so per-thumb url lookups are O(1) instead of scanning the
  // whole gallery array on every reactive render (every lane thumb + bundle preview
  // hit images.find() before this).
  let imageByHash = $derived(new Map((images || []).map(i => [i.hash, i])));
  function imageUrl(hash) {
    // support direct URLs for images without DB hash (browse preview)
    const img = imageByHash.get(hash);
    if (img?._directUrl) return img._directUrl;
    return apiURL(`/promptchain/image/${hash}`);
  }
  function thumbUrl(hash) {
    const img = imageByHash.get(hash);
    if (img?._directUrl) return img._directUrl;
    return apiURL(`/promptchain/thumb/${hash}`);
  }
  // A thumbnail <img> can latch onto a 404 from a request that raced the
  // server-side record (the thumb is written as part of recording); a broken
  // <img> never retries itself, so a transient miss leaves a lineage node blank
  // forever. Cache-bust and re-fetch on each error — the 404 is served no-store,
  // so the thumb is on disk by now. Bounded, mirrors the gallery's retry; no polling.
  function retryThumb(e) {
    const img = e.currentTarget;
    const n = +img.dataset.pcrRetry || 0;
    if (n >= 3) return;
    img.dataset.pcrRetry = String(n + 1);
    const u = new URL(img.src, location.href);
    u.searchParams.set("r", String(n + 1));
    img.src = u.toString();
  }

  // Video outputs (Wan/AnimateDiff/…) are served by /promptchain/image/<hash>
  // with their real mime type, but the hash-keyed URL carries no extension to
  // detect them by. The displayed item's filename — from the gallery entry, its
  // family node, or the fetched meta — is what tells us to render a <video>
  // instead of an <img>. Thumbnails already poster-frame videos server-side, so
  // the only signal a thumb is a clip is the ▶ badge keyed off this.
  // superset of every backend video set so detection can't drift below them:
  // browse_api _VIDEO_EXTS (…avi) and thumbs VIDEO_SUFFIXES (…mkv) both classify
  // formats this regex must also accept, or a browse-opened clip falls through to
  // a broken <img>.
  const VIDEO_EXT_RE = /\.(mp4|webm|m4v|mkv|mov|avi)(\?|$)/i;
  function isVideoItem(item) {
    return VIDEO_EXT_RE.test(item?.filename || "");
  }
  function isVideoHash(hash) {
    if (!hash) return false;
    const entry = imageByHash.get(hash);
    if (entry?.filename) return isVideoItem(entry);
    const fam = lineageList.find((i) => i?.hash === hash);
    if (fam?.filename) return isVideoItem(fam);
    if (imageInfo?.hash === hash) return isVideoItem(imageInfo);
    return false;
  }
  let displayedIsVideo = $derived(isVideoHash(displayedHash));

  // timeline navigation — moves scrubber position and syncs displayed image
  // zoom/pan is preserved across navigation (only resets on double-click or first open)
  function jumpTo(idx) {
    if (idx >= 0 && idx < images.length && idx !== currentIndex) {
      currentIndex = idx;
      displayedHash = images[idx].hash;
      exitCompare();
    }
  }

  function navigate(delta) { jumpTo(currentIndex + delta); }
  function resetZoom() { zoom = 1; panX = 0; panY = 0; }

  // lineage navigation — only changes displayed image, not timeline position
  function navigateLineage(delta) {
    // In the expanded tree, Up/Down move by GENERATION among the RENDERED nodes
    // (parent / primary child), not the flat strip order — which can contain nodes
    // the tree doesn't show.
    if (lanesActive) {
      const renderedReal = (h) => laneRender.nodes.some(n => n.kind === "node" && n.hash === h);
      if (delta < 0) {
        const p = lineageTree.byHash.get(displayedHash)?.parent_hash;
        if (p && renderedReal(p)) { lineageJump(p); exitCompare(); }
      } else {
        const kids = (lineageTree.childrenOf.get(displayedHash) || []).map(k => k.hash).filter(renderedReal);
        if (kids.length) {
          const a = ancestry(lineageTree, subwayAnchor);
          lineageJump(kids.find(h => a.set.has(h)) || kids[0]);
          exitCompare();
        }
      }
      return;
    }
    // strip mode: walk the VISIBLE strip only — collapsed bundles are skipped;
    // expanding one brings its branch into the walk
    const idx = lineageVisible.findIndex(item => item.hash === displayedHash);
    if (idx < 0) return;
    const next = idx + delta;
    if (next >= 0 && next < lineageVisible.length) {
      lineageJump(lineageVisible[next].hash);
      exitCompare();
    }
  }

  // Left/Right in the expanded tree hop between siblings at the same depth (by column).
  function navigateTreeSibling(delta) {
    const reals = laneRender.nodes.filter(n => n.kind === "node");
    const cur = reals.find(n => n.hash === displayedHash);
    if (!cur) return;
    const row = reals.filter(n => n.depth === cur.depth).sort((a, b) => a.x - b.x);
    const i = row.findIndex(n => n.hash === displayedHash);
    const next = row[i + delta];
    if (next) { lineageJump(next.hash); exitCompare(); }
  }

  // compare mode
  function enterCompareWith(targetHash, label) {
    if (isVideoHash(targetHash)) return; // a video can't be the wipe "after" frame
    if (compareMode && compareTargetHash === targetHash) { exitCompare(); return; }
    const fresh = !compareMode;
    compareTargetHash = targetHash;
    compareTargetLabel = label;
    compareMode = true;
    compareDropdownOpen = false;
    if (fresh) {
      compareSliderPos = 50;
      compareClipPercent = 50;
      // recalculate clip to account for current pan offset
      requestAnimationFrame(updateCompareClip);
    }
  }

  function exitCompare() {
    if (!compareMode) return;
    compareMode = false;
    compareTargetHash = null;
    compareTargetLabel = "";
    compareDropdownOpen = false;
  }

  // Navigating onto a video (e.g. up/down the family) drops out of compare —
  // the wipe overlay paints an <img> that can't show a clip. Writes only when
  // already comparing, so it can't loop.
  $effect(() => {
    if (displayedIsVideo && (compareMode || compareDropdownOpen)) exitCompare();
  });

  function handleSliderDown(e) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingSlider = true;
  }

  function handleSliderMove(e) {
    if (!isDraggingSlider || !containerEl || !mainImageEl) return;
    const cRect = containerEl.getBoundingClientRect();
    const iRect = mainImageEl.getBoundingClientRect();
    compareSliderPos = Math.max(0, Math.min(100, ((e.clientX - cRect.left) / cRect.width) * 100));
    compareClipPercent = Math.max(0, Math.min(100, ((e.clientX - iRect.left) / iRect.width) * 100));
  }

  function handleSliderUp() { isDraggingSlider = false; }

  // recalculate clip-path when zoom/pan changes while in compare mode
  function updateCompareClip() {
    if (!compareMode || !containerEl || !mainImageEl) return;
    const cRect = containerEl.getBoundingClientRect();
    const iRect = mainImageEl.getBoundingClientRect();
    const clientX = cRect.left + (compareSliderPos / 100) * cRect.width;
    compareClipPercent = Math.max(0, Math.min(100, ((clientX - iRect.left) / iRect.width) * 100));
  }

  // image zoom/pan
  function handleWheel(e) {
    e.preventDefault();
    const step = e.deltaY > 0 ? -0.15 : 0.15;
    const newZoom = Math.max(0.5, Math.min(8, zoom + step));
    if (newZoom === zoom) return;
    const rect = containerEl.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    const ratio = newZoom / zoom;
    panX = mx - (mx - panX) * ratio;
    panY = my - (my - panY) * ratio;
    zoom = newZoom;
    requestAnimationFrame(updateCompareClip);
  }

  function handlePointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest(".pcr-viewer-compare-slider")) return;
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // gesture mode
      isGesturing = true;
      gestureStart = { x: e.clientX, y: e.clientY, time: Date.now() };
      if (viewerEl) viewerEl.style.transition = "none";
    } else {
      // pan mode
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY, panX, panY };
    }
    containerEl.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (isPanning) {
      panX = panStart.panX + (e.clientX - panStart.x);
      panY = panStart.panY + (e.clientY - panStart.y);
      updateCompareClip();
      return;
    }
    if (isGesturing) {
      const dy = e.clientY - gestureStart.y;
      // only vertical down shows visual feedback (dismiss gesture)
      if (dy > 0 && Math.abs(dy) > Math.abs(e.clientX - gestureStart.x)) {
        const progress = Math.min(dy / window.innerHeight, 1);
        viewerTransformY = dy;
        viewerOpacity = 1 - (1 - Math.pow(1 - progress, 1.6));
      }
    }
  }

  function handlePointerUp(e) {
    if (isPanning) {
      isPanning = false;
      containerEl.releasePointerCapture(e.pointerId);
      return;
    }
    if (isGesturing) {
      isGesturing = false;
      containerEl.releasePointerCapture(e.pointerId);

      const dx = e.clientX - gestureStart.x;
      const dy = e.clientY - gestureStart.y;
      const dt = Math.max(1, Date.now() - gestureStart.time);
      const vx = dx / dt;
      const vy = dy / dt;

      // horizontal swipe → navigate timeline
      if (Math.abs(dx) > Math.abs(dy) &&
          (Math.abs(dx) > window.innerWidth * H_SWIPE_RATIO || Math.abs(vx) > H_VELOCITY)) {
        resetGesture();
        navigate(dx < 0 ? 1 : -1);
        return;
      }
      // vertical down → dismiss
      if (Math.abs(dy) > Math.abs(dx) && (dy > V_CLOSE_DIST || vy > V_CLOSE_VELOCITY)) {
        if (viewerEl) viewerEl.style.transition = `transform 0.3s ease, opacity 0.3s ease`;
        viewerTransformY = window.innerHeight;
        viewerOpacity = 0;
        closeTimer = setTimeout(() => onClose(), 180);
        return;
      }
      // vertical up → lineage child
      if (Math.abs(dy) > Math.abs(dx) && (dy < -V_NEXT_DIST || vy < -V_NEXT_VELOCITY)) {
        resetGesture();
        navigateLineage(1);
        return;
      }
      // no gesture triggered → bounce back
      if (viewerEl) viewerEl.style.transition = `transform ${BOUNCE_MS}ms ease, opacity ${BOUNCE_MS}ms ease`;
      viewerTransformY = 0;
      viewerOpacity = 1;
      bounceTimer = setTimeout(() => { if (viewerEl) viewerEl.style.transition = ""; }, BOUNCE_MS);
    }
  }

  function resetGesture() {
    viewerTransformY = 0;
    viewerOpacity = 1;
    if (viewerEl) viewerEl.style.transition = "";
  }

  function handleDblClick() { resetZoom(); }

  // Two-step flow: read the image's embedded workflow first so the options
  // modal can offer (and default) only the modes that workflow supports, then
  // build on confirm.
  async function openUpscaleOptions() {
    if (upscaling || upscalePreparing || !onUpscale || !onUpscalePrepare) return;
    // Lineage navigation can land on an image outside the timeline array —
    // those are always DB-tracked, so a bare hash entry is enough.
    const entry = images.find((i) => i.hash === displayedHash) || { hash: displayedHash };
    upscalePreparing = true;
    try {
      const prepared = await onUpscalePrepare(entry);
      if (prepared) {
        upscalePrepared = prepared;
        upscalePreviewUrl = imageUrl(displayedHash);
        upscaleProgress = null;
        upscaleModalOpen = true;
      }
    } finally {
      upscalePreparing = false;
    }
  }

  async function confirmUpscale(options) {
    if (upscaling || !upscalePrepared) return;
    if (upscaleFromEdit && upscaleEditCtx) {
      options = { ...options, previewOnly: true }; // handoff renders are temp-only; Edit's Save persists
      upscaleEditCtx.canvasMode = options.canvasMode || "keep";
      if (upscaleEditCtx.canvasMode === "grow" && onUpscaleEnlarge) {
        // Queue the Background enlargement first — it's a quick pure-model
        // pass, done long before the region's diffusion render.
        const tw = Math.round(upscaleEditCtx.docWidth * options.upscaleBy);
        const th = Math.round(upscaleEditCtx.docHeight * options.upscaleBy);
        upscaleEditCtx.bgPromise = onUpscaleEnlarge(upscaleEditCtx.bgName, tw, th, options.plainEngine || "ultrasharp");
        upscaleEditCtx.bgPromise.catch(() => {}); // surfaced at Add to Edit
      } else if (options.ultrasharpUnder && onUpscaleEnlarge) {
        // Keep/native path: a pure-model pass of the same crop at footprint
        // dims (ESRGAN up, lanczos back) — the faithful-sharp under-layer the
        // handback slips beneath the diffusion render.
        upscaleEditCtx.usPromise = onUpscaleEnlarge(
          upscaleEditCtx.cropName, upscaleEditCtx.rect.w, upscaleEditCtx.rect.h, options.plainEngine || "ultrasharp");
        upscaleEditCtx.usPromise.catch(() => {}); // best-effort — surfaced at Add to Edit
      }
    }
    if (options?.target === "background" && onUpscaleBackground) {
      // Modal stays up as the progress surface; closing it lets the run
      // finish in the background (the bridge toasts on completion).
      const tracker = onUpscaleBackground(upscalePrepared, options);
      upscaleTracker = tracker;
      upscaleUnsub?.();
      upscaleUnsub = tracker.subscribe((state) => {
        upscaleProgress = state;
        // Completion jumps straight to the result and announces it — the
        // user shouldn't have to click through a Done screen. Edit handoffs
        // instead wait on the Done screen's "Add to Edit".
        if (state.phase === "done" && state.resultHash && !upscaleFromEdit) {
          showNewGenBanner(state.elapsedSec);
          viewUpscaleResult(state.resultHash);
        } else if (state.phase === "cancelled") {
          cancelUpscale(); // back to the viewer exactly as it was
        }
      });
      return;
    }
    upscaling = true;
    upscaleModalOpen = false;
    try {
      const ok = await onUpscale(upscalePrepared, options);
      if (ok) onClose(); // reveal the freshly opened workflow tab
    } finally {
      upscaling = false;
      upscalePrepared = null;
    }
  }

  function cancelUpscale() {
    upscaleModalOpen = false;
    upscalePrepared = null;
    upscaleProgress = null;
    upscaleFromEdit = false;
    upscaleEditCtx = null;
    if (upscalePreviewUrl.startsWith("blob:")) { URL.revokeObjectURL(upscalePreviewUrl); upscalePreviewUrl = ""; }
    upscaleUnsub?.();
    upscaleUnsub = null;
    upscaleTracker = null;
  }

  function cancelUpscaleRun() {
    upscaleTracker?.cancel?.(); // tracker emits "cancelled" → modal closes
  }

  // ── re-pose (3D-poser pose transfer, from Edit) ──
  let reposeModalOpen = $state(false);
  let reposePrepared = $state(null); // { sourceUrl, referenceFilename, parentFilename, width, height, caps }
  let reposeProgress = $state(null);
  let reposeTracker = null, reposeUnsub = null;

  // Edit → Re-pose: upload the flattened composite as the appearance reference,
  // probe which recipes are installable, and open the three-pane Re-pose modal.
  // Nothing touches the parent workflow — the poser is detached and the render is
  // queued in the background (the result records as a lineage child).
  async function openReposeFromEdit({ compositeBlob }) {
    if (!onReposeCaps || !onReposeRun || !onMountPoser || !onInpaintUploadReference) return;
    try {
      const referenceFilename = await onInpaintUploadReference(
        new File([compositeBlob], "repose-source.png", { type: "image/png" }));
      if (!referenceFilename) return;
      const caps = await onReposeCaps();
      reposePrepared = {
        sourceUrl: URL.createObjectURL(compositeBlob),
        referenceFilename,
        parentFilename: editEntry?.filename || "",
        width: editPrepared?.data?.width || 0,
        height: editPrepared?.data?.height || 0,
        caps,
      };
      reposeProgress = null;
      reposeModalOpen = true;
    } catch (e) {
      console.error("[PromptChain] repose-from-edit failed", e);
    }
  }

  function confirmRepose(opts) {
    if (!onReposeRun || !reposePrepared) return;
    const tracker = onReposeRun({
      ...opts,
      referenceFilename: reposePrepared.referenceFilename,
      parentFilename: reposePrepared.parentFilename,
    });
    reposeTracker = tracker;
    reposeUnsub?.();
    reposeUnsub = tracker.subscribe((state) => {
      // Cancel STOPS the render but keeps the modal open at the config (poser +
      // prompt + settings intact) so the user can tweak and re-run — only the X /
      // backdrop (enabled once not running) tears it down. Stay open on done too,
      // so the result + actions (Add to Edit / Close) remain.
      if (state.phase === "cancelled") { reposeProgress = null; return; }
      reposeProgress = state;
    });
  }

  // "Add to Edit": bring the re-posed result back into the editor as a new layer
  // — same as the inpaint/upscale handoff. The editor stays open with the layer;
  // the user saves/flattens from there.
  async function handleReposeToEdit(doneState) {
    if (editModalRef?.addLayerFromResult && doneState?.resultUrl) {
      const url = doneState.resultUrl + (doneState.resultUrl.includes("?") ? "&" : "?") + "rand=" + Math.random();
      try { await editModalRef.addLayerFromResult(url, null); }
      catch (e) { console.error("[PromptChain] add repose layer failed", e); }
    }
    closeRepose();
  }

  function closeRepose() {
    reposeModalOpen = false;
    if (reposePrepared?.sourceUrl?.startsWith?.("blob:")) URL.revokeObjectURL(reposePrepared.sourceUrl);
    reposePrepared = null;
    reposeProgress = null;
    reposeUnsub?.();
    reposeUnsub = null;
    reposeTracker = null;
  }

  // ── extend (video continuation — viewer post-process for video clips) ──
  let extendModalOpen = $state(false);
  let extendPrepared = $state(null); // { lastFrameFilename, lastFrameUrl, sourceRef, fps, frameCount, templateId, defaults, recipeDefaults, lightningAvailable }
  let extendProgress = $state(null);
  let extendPreparing = $state(false);
  let extendLastEntry = $state(null); // result of the latest run, for the "Done" jump
  let extendTracker = null, extendUnsub = null;

  // Splice a freshly-rendered result into the timeline and navigate to it, so the
  // user lands on the new clip when processing finishes and a follow-up action
  // (Extend/Smooth) runs on it — not the source. Mirrors inpaintSaved.
  function landOnResult(entry) {
    if (!entry?.hash) return;
    const existingIdx = images.findIndex((i) => i.hash === entry.hash);
    if (existingIdx >= 0) {
      currentIndex = existingIdx;
    } else {
      const srcIdx = images.findIndex((i) => i.hash === displayedHash);
      const insertAt = srcIdx >= 0 ? srcIdx + 1 : images.length;
      images = [...images.slice(0, insertAt), entry, ...images.slice(insertAt)];
      currentIndex = insertAt;
    }
    displayedHash = entry.hash;
  }

  async function openExtend() {
    if (extendPreparing || !onExtendPrepare || !onExtendRun || !displayedHash) return;
    extendPreparing = true;
    try {
      const prepared = await onExtendPrepare(displayedHash);
      if (prepared?.lastFrameFilename) {
        extendPrepared = prepared;
        extendProgress = null;
        extendModalOpen = true;
      }
    } catch (e) {
      console.error("[PromptChain] extend prepare failed", e);
    }
    extendPreparing = false;
  }

  function confirmExtend(opts) {
    if (!onExtendRun || !extendPrepared) return;
    // Recipe = which template renders the continuation. "lightning" swaps to the
    // "-fast" sibling (4-step distill LoRAs, baked correctly); "normal" keeps the
    // vanilla base. All the other fields are optional overrides buildExtendGraph
    // applies on top of the template (omitted => template default).
    const base = extendPrepared.templateId;
    const templateId = opts.recipe === "lightning" ? `${base}-fast` : base;
    const tracker = onExtendRun({
      templateId,
      lastFrameFilename: extendPrepared.lastFrameFilename,
      parentFilename: extendPrepared.sourceRef,
      length: Math.min(161, opts.length || extendPrepared.frameCount || 81), // ceiling: one continuation clip, never a long source's full frame count
      width: opts.width || undefined,
      height: opts.height || undefined,
      outFps: opts.outFps || undefined,
      steps: opts.steps, cfg: opts.cfg, shift: opts.shift,
      sampler: opts.sampler, scheduler: opts.scheduler,
      seed: opts.seed, // undefined unless the user pinned one
      promptDoc: opts.promptDoc,
      stitch: opts.stitch,
      sourceVideoFilename: extendPrepared.sourceRef,
      fps: extendPrepared.fps,
    });
    extendTracker = tracker;
    extendUnsub?.();
    extendUnsub = tracker.subscribe((state) => {
      if (state.phase === "cancelled") { extendProgress = null; return; }
      extendProgress = state;
      // Keep the modal open on done so the user can compare, tweak settings, and
      // Run Again; remember the result so "Done" can jump to it (finishExtend).
      if (state.phase === "done" && state.entry?.hash) extendLastEntry = state.entry;
    });
  }

  function finishExtend() {
    if (extendLastEntry) { landOnResult(extendLastEntry); showNewGenBanner(null); }
    closeExtend();
  }

  function closeExtend() {
    extendModalOpen = false;
    extendPrepared = null;
    extendProgress = null;
    extendLastEntry = null;
    extendUnsub?.();
    extendUnsub = null;
    extendTracker = null;
  }

  // ── smooth (RIFE interpolation — viewer post-process for video clips) ──
  let smoothModalOpen = $state(false);
  let smoothPrepared = $state(null); // { sourceRef, fps, frameCount }
  let smoothProgress = $state(null);
  let smoothPreparing = $state(false);
  let smoothLastEntry = $state(null); // result of the latest run, for the "Done" jump
  let smoothTracker = null, smoothUnsub = null;

  async function openSmooth() {
    if (smoothPreparing || !onSmoothPrepare || !onSmoothRun || !displayedHash) return;
    // Gate on the RIFE pack: offer to install it on first use, then bail (the
    // user re-opens once it's registered). Same contract as the inpaint packs.
    if (onSmoothCheck && !onSmoothCheck()) { onSmoothInstall?.(); return; }
    smoothPreparing = true;
    try {
      const prepared = await onSmoothPrepare(displayedHash);
      if (prepared?.sourceRef) {
        smoothPrepared = prepared;
        smoothProgress = null;
        smoothModalOpen = true;
      }
    } catch (e) {
      console.error("[PromptChain] smooth prepare failed", e);
    }
    smoothPreparing = false;
  }

  function confirmSmooth(opts) {
    if (!onSmoothRun || !smoothPrepared) return;
    // CreateVideo caps fps at 120, and ComfyUI REJECTS (not clamps) over-max — so
    // smoothing an already-high-fps clip (32×4=128) would hard-fail the queue.
    // Cap the multiplier so source_fps × mult never exceeds 120; keeps fps and
    // frame count in sync (vs clamping outFps alone, which desyncs playback speed).
    const srcFps = smoothPrepared.fps || 16;
    const maxMult = Math.max(2, Math.floor(120 / srcFps));
    const mult = Math.min(opts.multiplier || 2, maxMult);
    const tracker = onSmoothRun({
      sourceVideoFilename: smoothPrepared.sourceRef,
      multiplier: mult,
      outFps: Math.round(srcFps * mult),
      ckptName: opts.ckptName,
      scaleFactor: opts.scaleFactor,
      ensemble: opts.ensemble,
      fastMode: opts.fastMode,
      parentFilename: smoothPrepared.sourceRef,
    });
    smoothTracker = tracker;
    smoothUnsub?.();
    smoothUnsub = tracker.subscribe((state) => {
      if (state.phase === "cancelled") { smoothProgress = null; return; }
      smoothProgress = state;
      // Stay open on done for compare / Run Again; remember the result for "Done".
      if (state.phase === "done" && state.entry?.hash) smoothLastEntry = state.entry;
    });
  }

  function finishSmooth() {
    if (smoothLastEntry) { landOnResult(smoothLastEntry); showNewGenBanner(null); }
    closeSmooth();
  }

  function closeSmooth() {
    smoothModalOpen = false;
    smoothPrepared = null;
    smoothProgress = null;
    smoothLastEntry = null;
    smoothUnsub?.();
    smoothUnsub = null;
    smoothTracker = null;
  }

  // ── inpaint ──
  let inpaintModalOpen = $state(false);
  let inpaintPrepared = $state(null);
  let inpaintPreparing = $state(false);

  async function openInpaint() {
    if (inpaintPreparing || !onInpaintPrepare || !onInpaintRun) return;
    const entry = images.find((i) => i.hash === displayedHash) || { hash: displayedHash };
    inpaintPreparing = true;
    try {
      const prepared = await onInpaintPrepare(entry);
      if (prepared) {
        inpaintPrepared = { ...prepared, sourceUrl: imageUrl(displayedHash) };
        inpaintModalOpen = true;
      }
    } finally {
      inpaintPreparing = false;
    }
  }

  function inpaintSaved(entry) {
    showNewGenBanner(null);
    if (!entry?.hash) return;
    // The result is recorded under its own fresh workflow id, so it is NOT in
    // this viewer's timeline snapshot. Splice it in right after the source it
    // derived from and anchor BOTH the timeline index and the displayed hash to
    // it — otherwise displayedHash points at an image the filmstrip/scrubber
    // don't know about, and a single stray navigation snaps back to the source,
    // silently re-inpainting the original on the next pass.
    const existingIdx = images.findIndex((i) => i.hash === entry.hash);
    if (existingIdx >= 0) {
      currentIndex = existingIdx;
    } else {
      const srcIdx = images.findIndex((i) => i.hash === displayedHash);
      const insertAt = srcIdx >= 0 ? srcIdx + 1 : images.length;
      images = [...images.slice(0, insertAt), entry, ...images.slice(insertAt)];
      currentIndex = insertAt;
    }
    displayedHash = entry.hash; // lineage links it to the source
    refreshEditDocs(); // the save may have written or cleared a layer sidecar
    window.dispatchEvent(new CustomEvent("promptchain:edit-docs-changed")); // sync the gallery badge
  }

  // ── edit (airbrush touch-up) ──
  let editModalOpen = $state(false);
  let editPrepared = $state(null);
  // Figure regions for the Edit isolate workflow: one row per region entity
  // of the displayed image's pose scene (name + prompt text + silhouette mask
  // URL). Feeds Edit's "select figure" buttons and Inpaint's region-prompt
  // chips. imageInfo lands async, so this re-derives when the DB row arrives.
  let editFigureRegions = $derived(editPrepared?.data?.workflow
    ? buildFigureRegions({
        workflow: editPrepared.data.workflow,
        regionsRaw: imageInfo?.regions,
        poseFilesOk: editPrepared.data.pose_files_ok,
        apiURL,
      })
    : []);
  let editPreparing = $state(false);

  let editEntry = null;            // the image entry Edit was opened on (reused for inpaint handoff)
  let editModalRef = $state(null); // EditModal instance, for addLayerFromResult
  let inpaintEditMask = $state(null); // the region mask handed from Edit
  let inpaintFromEdit = $state(false);

  async function openEdit(targetHash = displayedHash) {
    if (editPreparing || !onEditPrepare || !onEditSave) return;
    if (isVideoHash(targetHash)) return; // the editor can't open a video clip
    const entry = images.find((i) => i.hash === targetHash) || { hash: targetHash };
    editPreparing = true;
    try {
      const prepared = await onEditPrepare(entry);
      if (prepared) {
        editEntry = entry;
        editPrepared = { ...prepared, sourceUrl: imageUrl(targetHash) };
        editModalOpen = true;
      }
    } finally {
      editPreparing = false;
    }
  }

  // Sidebar "Edit" lands the user straight in the editor for the clicked image.
  let autoEditFired = false;
  $effect(() => {
    if (autoEdit && !autoEditFired && displayedHash) {
      autoEditFired = true;
      openEdit();
    }
  });

  // Edit → Inpaint handoff: open the full Inpaint modal on the edited composite
  // with the region pre-masked; its result returns to Edit as a layer.
  let inpaintRegionPrefill = $state(null); // auto-resolved region prompt (regioned workflow)
  let inpaintRegionName = $state("");      // which figure it resolved to, for the modal note
  let inpaintMovedContent = $state(false); // the painted content was moved off its scene position
  let inpaintCondOffset = $state(null);    // {x,y} move delta → shifts region masks to the content's origin
  async function openInpaintFromEdit({ compositeBlob, maskCanvas, sceneRect = null, condOffset = null }) {
    if (!onInpaintPrepare || !onInpaintRun || !editEntry) return;
    try {
      const prepared = await onInpaintPrepare(editEntry);
      if (!prepared) return;
      const name = onInpaintUploadReference
        ? await onInpaintUploadReference(new File([compositeBlob], "edit-composite.png", { type: "image/png" }))
        : null;
      inpaintEditMask = maskCanvas;
      inpaintFromEdit = true;
      inpaintPrepared = {
        ...prepared,
        data: { ...prepared.data, input_ref: name || prepared.data?.input_ref },
        sourceUrl: URL.createObjectURL(compositeBlob),
      };
      // Moved content keeps the FULL $block source (no flattening): the cond
      // masks are read at the content's ORIGIN via condOffset on the backend,
      // so the moved figure follows its own region prompt to where it landed.
      // The client-side flat resolve is only the fallback when the backend
      // can't do regional at all (no pose / non-regional source).
      inpaintMovedContent = !!condOffset;
      inpaintCondOffset = condOffset;
      if (!condOffset && !prepared.caps?.regionalAvailable) {
        await resolveInpaintRegionPrefill(maskCanvas, sceneRect);
      }
      inpaintModalOpen = true;
    } catch (e) {
      console.error("[PromptChain] inpaint-from-edit failed", e);
    }
  }
  async function resolveInpaintRegionPrefill(maskCanvas, sceneRect) {
    inpaintRegionPrefill = null;
    inpaintRegionName = "";
    const regions = editFigureRegions;
    const dw = editPrepared?.data?.width || 0, dh = editPrepared?.data?.height || 0;
    if (!regions.length || !(dw > 0) || !(dh > 0)) return;
    // For a moved copy, probe a filled rect at the ORIGIN; else the painted
    // mask itself sits over the figure it covers.
    let probe = maskCanvas;
    if (sceneRect) {
      probe = document.createElement("canvas");
      probe.width = dw; probe.height = dh;
      const ctx = probe.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(sceneRect.x, sceneRect.y, sceneRect.w, sceneRect.h);
    }
    const match = await matchRegionByOverlap(probe, regions, dw, dh);
    if (!match) return;
    const parsed = parseRegions(imageInfo?.regions);
    const global = (parsed?.global || "").trim();
    const negative = (parsed?.negative || "").trim();
    inpaintRegionName = match.name;
    inpaintRegionPrefill = [global, match.text].filter(Boolean).join(", ")
      + (negative ? `\n\nNegative Prompt:\n${negative}` : "");
  }
  function closeInpaintFromEdit() {
    inpaintModalOpen = false; inpaintFromEdit = false; inpaintPrepared = null; inpaintEditMask = null;
    inpaintRegionPrefill = null; inpaintRegionName = ""; inpaintMovedContent = false; inpaintCondOffset = null;
  }
  async function handleInpaintToEdit(doneState) {
    const t = doneState?.temp;
    if (t && editModalRef?.addLayerFromResult) {
      const url = apiURL(`/view?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || "")}&type=${t.type || "temp"}&rand=${Math.random()}`);
      try { await editModalRef.addLayerFromResult(url, doneState.appliedMask || null); } catch (e) { console.error("[PromptChain] add inpaint layer failed", e); }
    }
    closeInpaintFromEdit();
  }

  // Edit → Upscale handoff: the upscale pipeline runs on the region crop, and
  // the render returns to Edit either 1:1 in a GROWN canvas (the document
  // scales to the quality the user picked) or squeezed back into the region —
  // the user decides in the modal, asked only when the render outgrows the
  // region's footprint.
  let upscaleFromEdit = $state(false);
  let upscaleEditCtx = $state(null); // { rect, bgName, docWidth, docHeight, canvasMode?, bgPromise? }

  // Reshape a whole-image upscale prep for an Edit region crop: the uploaded
  // crop becomes the input. Scene-level modes (regional masks, 3D-pose depth)
  // survive ANY rect on the source frame — a partial rect rides as
  // data.editRect and the graph build crops the pose masks + depth render to
  // it. Only a grown/resized document loses the scene-frame correspondence,
  // so scene modes are disabled there.
  function regionUpscalePrepared(prepared, inputRef, rect, dw, dh, sceneRect = null) {
    const caps = { ...prepared.caps };
    const sourceFrame = dw === prepared.data.width && dh === prepared.data.height;
    const fullCanvas = sourceFrame && rect.x === 0 && rect.y === 0 && rect.w === dw && rect.h === dh;
    if (caps.graftable && !sourceFrame) {
      caps.modes = {
        ...caps.modes,
        regional: { ok: false, reason: "The document was resized or grown past the source image's frame — the per-figure masks and 3D pose depth can't line up with it anymore. Describe just this figure in the Prompt below instead (the reference shows the workflow's character blocks)." },
      };
      caps.sources = { ...caps.sources, pose: { ok: false } };
      caps.defaultDepthSource = "image";
      if (caps.defaultMode === "regional") caps.defaultMode = caps.modes.depth?.ok ? "depth" : "prompt";
    }
    // Ticks/defaults anchor to the CANVAS (user spec: the quality tick is
    // what the document ends up at). Canvas already past 2K → default 1.0 =
    // re-detail the region in place, no growth offered by default.
    const docLongest = Math.max(dw || 0, dh || 0);
    caps.defaultUpscaleBy = docLongest > 0 ? Math.min(8, Math.max(1, Math.round((2048 / docLongest) * 100) / 100)) : 2;
    return {
      ...prepared,
      data: {
        ...prepared.data,
        input_ref: inputRef,
        width: rect.w,
        height: rect.h,
        filename: fullCanvas ? prepared.data.filename : "edit region",
        // Scene modes can run on any source-frame rect now, so those keep the
        // REAL flag (the runner's gate is mode-aware — prompt-only crops never
        // wait on pose files). Off-frame documents can't pose-hint at all.
        pose_files_ok: sourceFrame ? prepared.data.pose_files_ok : true,
        // sceneRect = layer-provenance override: a moved copy's pixels sit at
        // `rect`, but its scene location (where the pose masks/depth should be
        // cropped) is where it was cut/copied from. Same dims by construction.
        ...(sourceFrame && !fullCanvas
          ? { editRect: { x: (sceneRect || rect).x, y: (sceneRect || rect).y, w: rect.w, h: rect.h, docW: dw, docH: dh } }
          : {}),
      },
      caps,
    };
  }

  async function openUpscaleFromEdit({ cropBlob, bgBlob, rect, sceneRect = null, docWidth, docHeight }) {
    if (!onUpscalePrepare || !onUpscaleBackground || !onInpaintUploadReference || !editEntry) return;
    try {
      const prepared = await onUpscalePrepare(editEntry);
      if (!prepared) return;
      const upload = (blob, name) => onInpaintUploadReference(new File([blob], name, { type: "image/png" }));
      const [cropName, bgName] = await Promise.all([
        upload(cropBlob, "edit-region.png"),
        upload(bgBlob, "edit-background.png"),
      ]);
      if (!cropName || !bgName) return;
      upscaleEditCtx = { rect, bgName, cropName, docWidth, docHeight };
      upscaleFromEdit = true;
      upscalePrepared = regionUpscalePrepared(prepared, cropName, rect, docWidth, docHeight, sceneRect);
      upscalePreviewUrl = URL.createObjectURL(cropBlob);
      upscaleProgress = null;
      upscaleModalOpen = true;
    } catch (e) {
      console.error("[PromptChain] upscale-from-edit failed", e);
    }
  }

  // Server-log relay (CLIENT ERROR lines in comfyui.log) — the grow-vs-fallback
  // decision below is otherwise invisible outside the browser console.
  function reportHandback(where, message) {
    try {
      fetchApi("/promptchain/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ where, message, stack: "" }),
      }).catch(() => {});
    } catch { /* diagnostics must never break the handback */ }
  }

  // A healthy lineage response contains the queried node WITH its parent present
  // in the same family. If the node is absent, or its parent_hash points outside
  // the returned family (so the tree renders it as a stray root), log it via
  // comfyui.log — that is the data signature behind a node appearing
  // "mis-attributed" until a refresh. Event-driven (fires only on a landed
  // response), no timers. We couldn't capture the live case, so this catches the
  // next one. A true root (parent_hash null) is healthy and never logs.
  function reportLineageAnomaly(reqHash, data) {
    const fam = data?.family;
    if (!Array.isArray(fam) || fam.length === 0) return;
    const me = fam.find(f => f?.hash === reqHash);
    const parentOrphaned = !!(me?.parent_hash && !fam.some(f => f?.hash === me.parent_hash));
    if (me && !parentOrphaned) return; // healthy
    const fams = fam.map(f => (f?.hash || "").slice(0, 8)).join(",");
    reportHandback(
      "lineage-tree-anomaly",
      `node ${(reqHash || "").slice(0, 8)} ${me ? "orphaned: parent " + (me.parent_hash || "").slice(0, 8) + " absent" : "ABSENT"} from its own family [${fams}]`
    );
  }

  async function handleUpscaleToEdit(doneState) {
    const ctx = upscaleEditCtx;
    const viewUrl = (img) => apiURL(`/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${img.type || "output"}&rand=${Math.random()}`);
    reportHandback("upscale-handback", `branch check: filename=${doneState?.filename || "NONE"} canvasMode=${ctx?.canvasMode || "NONE"} bgPromise=${!!ctx?.bgPromise} applyFn=${!!editModalRef?.applyCanvasUpscale}`);
    try {
      if (doneState?.filename && ctx?.canvasMode === "grow" && ctx.bgPromise && editModalRef?.applyCanvasUpscale) {
        let bg = null;
        try {
          bg = await ctx.bgPromise; // usually already done — it queued first and ESRGAN is quick
        } catch (e) {
          console.error("[PromptChain] background enlarge failed — falling back to in-place", e);
          reportHandback("upscale-handback", `bg enlarge REJECTED → in-place fallback: ${e?.message || e}`);
        }
        if (bg) {
          await editModalRef.applyCanvasUpscale({ bgUrl: viewUrl(bg), regionUrl: viewUrl(doneState) });
          reportHandback("upscale-handback", `GROW applied: bg=${bg.filename} (${bg.type || "output"})`);
        } else {
          await editModalRef.addUpscaledLayerFromResult(viewUrl(doneState));
        }
      } else if (doneState?.filename && editModalRef?.addUpscaledLayerFromResult) {
        let under = null;
        if (ctx?.usPromise) {
          try {
            under = await ctx.usPromise; // pure-model pass, long done by the time tiles finish
          } catch (e) {
            reportHandback("upscale-handback", `UltraSharp under-layer REJECTED — inserting without it: ${e?.message || e}`);
          }
        }
        await editModalRef.addUpscaledLayerFromResult(viewUrl(doneState), under ? viewUrl(under) : null);
        reportHandback("upscale-handback", `KEEP path: squeezed into footprint${under ? " + UltraSharp under-layer" : ""}`);
      }
    } catch (e) {
      console.error("[PromptChain] add upscale layer failed", e);
      reportHandback("upscale-handback", `handback threw: ${e?.message || e}`);
    }
    cancelUpscale();
  }

  function viewUpscaleResult(hash) {
    cancelUpscale();
    displayedHash = hash; // lineage already links it to the source
  }

  let newGenBanner = $state(null);
  let newGenTimer = null;
  function showNewGenBanner(elapsedSec) {
    clearTimeout(newGenTimer);
    newGenBanner = elapsedSec ? `New generation! Generated in ${elapsedSec}s` : "New generation!";
    newGenTimer = setTimeout(() => { newGenBanner = null; }, 6000);
  }

  function handleKeydown(e) {
    if (upscaleModalOpen || inpaintModalOpen || editModalOpen || confirmDeleteOpen) return; // a modal owns the keyboard while open
    if (e.key === "Escape") {
      if (compareDropdownOpen) { compareDropdownOpen = false; return; }
      if (selectedHashes.size) { clearSelection(); return; }
      if (historyExpanded) { historyExpanded = false; return; }
      if (compareMode) { exitCompare(); return; }
      onClose();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedHashes.size && onDelete) {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return; // let editors keep Backspace
      e.preventDefault();
      requestDeleteBatch();
      return;
    }
    if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && hasCompareTargets && !displayedIsVideo) {
      e.preventDefault();
      if (compareMode) exitCompare();
      else compareDropdownOpen = !compareDropdownOpen;
      return;
    }
    // In the expanded tree the arrows navigate the 2D family (Up/Down = generation,
    // Left/Right = siblings); in the strip, Left/Right stay on the timeline.
    if (e.key === "ArrowLeft") { if (lanesActive) { e.preventDefault(); navigateTreeSibling(-1); } else navigate(-1); return; }
    if (e.key === "ArrowRight") { if (lanesActive) { e.preventDefault(); navigateTreeSibling(1); } else navigate(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); navigateLineage(-1); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); navigateLineage(1); return; }
  }

  // scrubber
  function scrubberIndexFromX(clientX, trackEl) {
    const rect = trackEl.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    return Math.round((percent / 100) * (images.length - 1));
  }

  function handleScrubberTrackDown(e) {
    e.preventDefault();
    const idx = scrubberIndexFromX(e.clientX, e.currentTarget);
    jumpTo(idx);
    isDraggingScrubber = true;
    scrubberDragStartX = e.clientX;
    scrubberDragStartPercent = (idx / (images.length - 1)) * 100;
  }

  function handleScrubberHandleDown(e) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingScrubber = true;
    scrubberDragStartX = e.clientX;
    scrubberDragStartPercent = scrubberPercent;
  }

  function handleWindowMouseMove(e) {
    if (isDraggingSlider) { handleSliderMove(e); return; }
    if (!isDraggingScrubber) return;
    const track = document.querySelector('.pcr-viewer-scrubber-track');
    if (!track) return;
    const idx = scrubberIndexFromX(e.clientX, track);
    jumpTo(idx);
  }

  function handleWindowMouseUp() {
    isDraggingScrubber = false;
    isDraggingSlider = false;
  }

  // expanded grid
  function toggleGrid() {
    historyExpanded = !historyExpanded;
    if (historyExpanded) {
      requestAnimationFrame(() => scrollGridToCurrent());
    }
  }

  function scrollGridToCurrent() {
    if (!historyGridEl) return;
    const rowHeight = GRID_THUMB_SIZE + GRID_GAP;
    const row = Math.floor(currentIndex / GRID_COLUMNS);
    const target = row * rowHeight - GRID_MAX_HEIGHT / 2 + rowHeight / 2;
    historyGridEl.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }
  // The grid follows the selection, not just the open-toggle — navigation,
  // the scrubber, and handoff returns (which insert + select the new latest
  // image) all land mid-list while the grid sits wherever it last scrolled.
  $effect(() => {
    void currentIndex;
    void images.length;
    if (historyExpanded) requestAnimationFrame(() => scrollGridToCurrent());
  });

  function setZoomLevel(percent) {
    zoom = percent / 100;
    panX = 0;
    panY = 0;
    zoomDropdownOpen = false;
    requestAnimationFrame(updateCompareClip);
  }

  function handleZoomSlider(e) {
    zoom = 0.25 * Math.pow(2, parseInt(e.currentTarget.value) / 25);
    panX = 0;
    panY = 0;
    requestAnimationFrame(updateCompareClip);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      linkCopied = true;
      linkCopiedTimer = setTimeout(() => { linkCopied = false; }, 2000);
    } catch {}
  }

  // Reveal opens Explorer on the SERVER's desktop — only offer it when this
  // browser IS the server machine (loopback origin). A host browsing its own
  // LAN IP also hides it: safe failure.
  const isLocalClient = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname);

  function openFolder() {
    if (!fetchApi) return;
    const entry = images.find((i) => i.hash === displayedHash) || { hash: displayedHash };
    const params = entry._browsePath != null
      ? `scope=${encodeURIComponent(entry._browseScope || "output")}&path=${encodeURIComponent(entry._browsePath)}`
      : `hash=${encodeURIComponent(entry.hash)}`;
    fetchApi(`/promptchain/reveal-file?${params}`).catch(() => {});
  }

  let deleting = $state(false);
  let confirmDeleteOpen = $state(false);
  // null = delete the displayed image (toolbar button); a hash = delete that
  // specific lineage node (right-click menu), which may not be the one on screen.
  let deleteTargetHash = $state(null);

  // null = single delete; an array = a multi-select batch (drives the modal copy).
  let deleteBatch = $state(null);

  function requestDelete() {
    if (!onDelete || deleting) return;
    deleteTargetHash = null;
    deleteBatch = null;
    confirmDeleteOpen = true;
  }

  function requestDeleteBatch() {
    if (!onDelete || deleting || !selectedHashes.size) return;
    deleteBatch = [...selectedHashes];
    confirmDeleteOpen = true;
  }

  function cancelDelete() {
    confirmDeleteOpen = false;
    deleteTargetHash = null;
    deleteBatch = null;
  }

  // ── lineage strip right-click menu ──
  // Server-desktop file actions (open file/folder, properties) only mean
  // anything when this browser IS the server machine — same gate as the toolbar
  // Open Folder button. isWindows is safe to read from the client here: a
  // loopback origin guarantees client and server are one machine.
  const isWindows = /windows/i.test(navigator.userAgent);
  let lineageMenu = $state(null); // { x, y, item } | null

  function openLineageMenu(e, item) {
    e.preventDefault();
    e.stopPropagation();
    lineageMenu = { x: e.clientX, y: e.clientY, item };
  }

  let copyPathTimer = null;
  let copyPathToast = $state(false);
  async function copyTextToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    // The async clipboard API can refuse after an awaited fetch (transient
    // activation expires); a hidden textarea + execCommand still copies.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
  async function copyPath(hash) {
    try {
      const r = await fetchApi?.(`/promptchain/file-path?hash=${encodeURIComponent(hash)}`);
      const d = r && r.ok ? await r.json() : null;
      if (!d?.path) return;
      if (await copyTextToClipboard(d.path)) {
        copyPathToast = true;
        clearTimeout(copyPathTimer);
        copyPathTimer = setTimeout(() => { copyPathToast = false; }, 1800);
      }
    } catch {}
  }

  function lineageMenuAction(action, item) {
    const hash = item?.hash;
    if (!hash) return;
    if (action === "expand-branches") {
      expandBranches(item);
    } else if (action === "focus-branch") {
      focusBranch(hash);
    } else if (action === "pin") {
      togglePin(hash);
    } else if (action === "copy-path") {
      copyPath(hash);
    } else if (action === "edit") {
      lineageJump(hash); // bring it on screen so editDocHash matches what we edit
      openEdit(hash);
    } else if (action === "delete") {
      deleteTargetHash = hash;
      confirmDeleteOpen = true;
    } else if (action === "open-file") {
      fetchApi?.(`/promptchain/open-file?hash=${encodeURIComponent(hash)}`).catch(() => {});
    } else if (action === "open-folder") {
      fetchApi?.(`/promptchain/reveal-file?hash=${encodeURIComponent(hash)}`).catch(() => {});
    } else if (action === "properties") {
      fetchApi?.(`/promptchain/file-properties?hash=${encodeURIComponent(hash)}`).catch(() => {});
    }
  }

  async function handleDeleteBatch(hashes) {
    deleteBatch = null;
    deleting = true;
    // Only remove what truly deleted: onDelete throws by contract on failure (file
    // locked, non-OK, reattach mismatch). Dropping the whole batch optimistically
    // would hide a still-on-disk image until the next refetch — match the single
    // delete, which filters only after a successful await.
    const gone = new Set();
    try {
      for (const h of hashes) {
        try { await onDelete(h); gone.add(h); } catch (err) { console.error("[PromptChain] batch delete failed for", h, err); }
      }
      if (gone.size) {
        selectedHashes = new Set([...selectedHashes].filter(h => !gone.has(h))); // keep any that failed
        const survivorsOrdered = lineageVisible.map(i => i?.hash).filter(h => h && !gone.has(h));
        const landHash = (displayedHash && !gone.has(displayedHash)) ? displayedHash : (survivorsOrdered[0] || null);
        images = images.filter(i => !gone.has(i.hash));
        const survivors = lineageList.filter(item => item?.hash && !gone.has(item.hash));
        if (!images.length) {
          if (survivors.length) {
            const next = survivors.find(s => s.hash === landHash) || survivors[0];
            images = survivors;
            currentIndex = Math.max(0, survivors.findIndex(s => s.hash === next.hash));
            displayedHash = next.hash;
          } else {
            onClose();
          }
        } else if (landHash && images.some(i => i.hash === landHash)) {
          currentIndex = images.findIndex(i => i.hash === landHash);
          displayedHash = landHash;
        } else {
          const idx = Math.min(currentIndex, images.length - 1);
          currentIndex = idx;
          displayedHash = images[idx].hash;
        }
      }
    } catch (e) {
      console.error("[PromptChain] viewer batch delete failed", e);
    }
    deleting = false;
  }

  async function handleDelete() {
    confirmDeleteOpen = false;
    if (!onDelete || deleting) return;
    if (deleteBatch?.length) { await handleDeleteBatch(deleteBatch); return; }
    const hash = deleteTargetHash || displayedHash;
    deleteTargetHash = null;
    // Land on the PREVIOUS member of the same lineage chain (its parent/ancestor)
    // if one exists, else the next member — only fall back to the flat timeline
    // when the image has no lineage relatives. lineageVisible is the same ordered
    // strip Up/Down navigation walks; capture the target BEFORE the delete mutates
    // displayedHash and the lineage refetches.
    const linIdx = lineageVisible.findIndex(item => item?.hash === hash);
    let landHash = null;
    if (linIdx >= 0) {
      const prev = lineageVisible[linIdx - 1]?.hash;
      const next = lineageVisible[linIdx + 1]?.hash;
      landHash = (prev && prev !== hash) ? prev : ((next && next !== hash) ? next : null);
    }
    deleting = true;
    try {
      await onDelete(hash);
      const idx = images.findIndex(i => i.hash === hash);
      images = images.filter(i => i.hash !== hash);
      if (images.length === 0) {
        // Single-image opens (sidebar / deep-link) carry a 1-element timeline,
        // but the strip still holds the rest of the family — land on a surviving
        // relative instead of tearing the whole viewer down. Only close when
        // nothing else remains (e.g. a standalone browsed file with no lineage).
        const survivors = lineageList.filter(item => item?.hash && item.hash !== hash);
        if (survivors.length) {
          const removedAt = lineageList.findIndex(item => item?.hash === hash);
          const next = survivors.find(s => s.hash === landHash)
            || survivors[Math.min(Math.max(0, removedAt), survivors.length - 1)];
          images = survivors;
          currentIndex = Math.max(0, survivors.findIndex(s => s.hash === next.hash));
          displayedHash = next.hash;
        } else {
          onClose();
        }
        return;
      }
      // Prefer the lineage neighbor (it survives — only `hash` was deleted). Point
      // currentIndex at it when it's in the timeline; otherwise keep a valid
      // timeline anchor and let the view follow displayedHash (lineage refetches).
      if (landHash) {
        const li = images.findIndex(i => i.hash === landHash);
        currentIndex = li >= 0 ? li : Math.min(idx >= 0 ? idx : currentIndex, images.length - 1);
        displayedHash = landHash;
      } else if (idx >= 0) {
        const nextIdx = Math.min(idx, images.length - 1);
        currentIndex = nextIdx;
        displayedHash = images[nextIdx].hash;
      } else {
        // no lineage relative and the deleted version wasn't in the timeline —
        // stay anchored on the current timeline image
        displayedHash = images[Math.min(currentIndex, images.length - 1)].hash;
      }
    } catch (e) {
      console.error("[PromptChain] viewer delete failed", e);
    }
    deleting = false;
  }

  function formatSeed(seed) { return seed != null ? String(seed) : null; }

  // Regional gens record {global, regions:[{id,name,text}], negative} so the
  // prompt panel can show the $block structure, not just the flattened text.
  function parseRegions(raw) {
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      return Array.isArray(obj?.regions) && obj.regions.length ? obj : null;
    } catch {
      return null;
    }
  }

  function timeAgo(epochSec) {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - epochSec));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  // Custom hover flyout for the lineage thumbnails — a left-pointing card that
  // appears instantly (the native title lagged ~1s) with richer info.
  let hoverTip = $state(null); // { item, top, left }
  function showTip(e, item) {
    const r = e.currentTarget.getBoundingClientRect();
    const top = Math.max(56, Math.min(window.innerHeight - 56, r.top + r.height / 2));
    hoverTip = { item, top, left: r.right + 9 };
  }
  function hideTip() { hoverTip = null; }

  function copySeed() {
    if (imageInfo?.seed != null) {
      navigator.clipboard.writeText(String(imageInfo.seed)).catch(() => {});
    }
  }
</script>

<svelte:window
  onkeydown={handleKeydown}
  onmousemove={handleWindowMouseMove}
  onmouseup={handleWindowMouseUp}
  onclick={(e) => {
    if (compareDropdownOpen && !e.target.closest(".pcr-viewer-compare-container")) compareDropdownOpen = false;
    if (zoomDropdownOpen && !e.target.closest(".pcr-viewer-zoom-control")) zoomDropdownOpen = false;
  }}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pcr-viewer" bind:this={viewerEl} style="transform: translateY({viewerTransformY}px); opacity: {viewerOpacity}">
  <!-- left: lineage panel -->
  {#snippet lineageNode(item, meta)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="pcr-viewer-lineage-node"
      data-hash={item.hash}
      class:current={item.hash === displayedHash}
      class:selected={selectedHashes.has(item.hash)}
      class:pinned={pinnedHashes.has(item.hash)}
      class:orphaned={item.orphaned === 1}
      class:compare-candidate={compareDropdownOpen && item.hash !== displayedHash && !isVideoItem(item)}
      class:compare-left={compareMode && item.hash === displayedHash}
      class:compare-right={compareMode && item.hash === compareTargetHash}
      onclick={(e) => handleNodeClick(e, item)}
      onmouseenter={(e) => showTip(e, item)}
      onmouseleave={hideTip}
      oncontextmenu={(e) => { hideTip(); openLineageMenu(e, item); }}
    >
      <img src={thumbUrl(item.hash)} alt="" draggable="false" loading="lazy" onerror={retryThumb} />
      {#if isVideoItem(item)}<div class="pcr-viewer-vidbadge" aria-hidden="true">▶</div>{/if}
      {#if selectedHashes.has(item.hash)}<div class="pcr-lin-selcheck">✓</div>{/if}
      {#if pinnedHashes.has(item.hash)}<div class="pcr-lin-pinbadge" title="Pinned — kept out of bundles">★</div>{/if}
      <div class="pcr-viewer-lineage-dot"
        class:dot-root={item.hash === laneRender.rootHash}
        class:dot-current={item.hash === displayedHash}
        class:dot-tip={meta?.isTip && item.hash !== displayedHash}
      ></div>
      {#if editDocLayers[item.hash]}
        <div class="pcr-viewer-lineage-layers">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
            <path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" />
          </svg>
        </div>
      {/if}
      {#if lineageOps.get(item.hash)?.kind === "upscale"}
        {@const op = lineageOps.get(item.hash)}
        <div class="pcr-lin-opbadge" title="Upscaled {op.uniform ? fmtFactor(op.factor) + ' ' : ''}from {op.from.w}×{op.from.h}">▲{op.uniform ? fmtFactor(op.factor) : ""}</div>
      {/if}
      {#if laneRender.junctionsByNode.get(item.hash)?.hidden.length}
        {@const n = laneRender.junctionsByNode.get(item.hash).hidden.length}
        <!-- at-rest marker that this node hides branches; the hover ⊞ button below acts on it -->
        <div class="pcr-lin-forkpip" aria-hidden="true">⋔{n}</div>
        <button class="pcr-lin-expander" title="Show this node's {n} other branch(es)"
          onclick={(e) => { e.stopPropagation(); expandBranches(item); }}
        >⊞{n}</button>
      {/if}
      {#if brokenOut.has(item.hash)}
        <button class="pcr-lin-fold" title="Collapse this branch back in"
          onclick={(e) => { e.stopPropagation(); foldLane(item.hash); }}
        >⊟</button>
      {/if}
    </div>
  {/snippet}

  {#if lineageList.length > 1}
    <div class="pcr-viewer-lineage pcr-viewer-lineage-visible" class:lanes={lanesActive}
      style={lanesActive ? `width: ${laneRender.width * LANE_COL_W + 24}px` : ""}>
      <div class="pcr-viewer-lineage-header">
        <span class="pcr-lin-count">{lineageCurrentIdx + 1} / {lineageList.length}</span>
        {#if hasBranches}
          <button
            class="pcr-lin-toggle"
            class:on={lanesActive}
            onclick={() => (lanesActive ? collapseAllLanes() : expandAll())}
            title={lanesActive ? "Collapse the subway back to the strip" : "Expand every branch into a subway map"}
          >{lanesActive ? "⊟" : "⊞"}</button>
        {/if}
      </div>
      {#if focusRootHash}
        <button class="pcr-lin-focuscrumb" onclick={clearFocus} title="Showing only this branch — click to show the whole family">
          ⊙ Focused <span class="pcr-lin-focusx">✕</span>
        </button>
      {/if}
      {#if selectedHashes.size}
        <div class="pcr-lin-selbar">
          {selectedHashes.size} selected
          <button class="pcr-lin-seldel" onclick={requestDeleteBatch} title="Delete selected (Del)">Delete</button>
          <button class="pcr-lin-selclear" onclick={clearSelection} title="Clear selection (Esc)">✕</button>
        </div>
      {/if}
      {#if lanesActive}
        <div class="pcr-lin-treescroll" bind:this={treeScrollEl}>
          <div class="pcr-lin-tree" bind:this={lanesWrapEl}
            style="width: {laneRender.width * LANE_COL_W}px; height: {laneRender.height * LANE_ROW_H}px">
            <svg class="pcr-lin-connectors" width={connectorBox.w} height={connectorBox.h} aria-hidden="true">
              {#each connectorsBase as g (g.key)}<path d={g.d} />{/each}
              {#each connectorsActive as g (g.key)}<path class="active" d={g.d} />{/each}
            </svg>
            {#each laneRender.nodes as node (node.hash)}
              <div class="pcr-lin-treenode" class:dimmed={!activePath.nodes.has(node.hash)}
                style="left: {node.x * LANE_COL_W}px; top: {node.depth * LANE_ROW_H}px">
                {#if node.kind === "bundle"}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <button class="pcr-viewer-lineage-bundle pcr-lin-treebundle" data-hash={node.hash}
                    title="{node.count} older generation{node.count > 1 ? 's' : ''} — click to show more"
                    onclick={() => revealMore(node.parent)}>
                    <div class="pcr-viewer-lineage-bundle-stack">
                      {#each node.preview as p (p)}
                        <img src={thumbUrl(p)} alt="" draggable="false" loading="lazy" onerror={retryThumb} />
                      {/each}
                    </div>
                    <span class="pcr-viewer-lineage-bundle-count">+{node.count}</span>
                  </button>
                {:else}
                  {@render lineageNode(node.item, node)}
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="pcr-viewer-lineage-strip">
          {#each lineageDisplay as d, i (d.kind === "node" ? d.item.hash : `${d.kind}:${d.at}`)}
            {#if d.kind === "node"}
              {@const item = d.item}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="pcr-viewer-lineage-node"
                class:current={i === lineageDisplayCurrentIdx}
                class:ancestor={i < lineageDisplayCurrentIdx}
                class:descendant={i > lineageDisplayCurrentIdx}
                class:branch={d.branch}
                class:selected={selectedHashes.has(item.hash)}
                class:pinned={pinnedHashes.has(item.hash)}
                class:orphaned={item.orphaned === 1}
                class:compare-candidate={compareDropdownOpen && item.hash !== displayedHash && !isVideoItem(item)}
                class:compare-left={compareMode && item.hash === displayedHash}
                class:compare-right={compareMode && item.hash === compareTargetHash}
                onclick={(e) => handleNodeClick(e, item)}
                onmouseenter={(e) => showTip(e, item)}
                onmouseleave={hideTip}
                oncontextmenu={(e) => { hideTip(); openLineageMenu(e, item); }}
              >
                <img src={thumbUrl(item.hash)} alt="" draggable="false" loading="lazy" onerror={retryThumb} />
                {#if isVideoItem(item)}<div class="pcr-viewer-vidbadge" aria-hidden="true">▶</div>{/if}
                {#if selectedHashes.has(item.hash)}<div class="pcr-lin-selcheck">✓</div>{/if}
                {#if pinnedHashes.has(item.hash)}<div class="pcr-lin-pinbadge" title="Pinned — kept out of bundles">★</div>{/if}
                <div class="pcr-viewer-lineage-dot"
                  class:dot-root={item.hash === lineageList[0]?.hash}
                  class:dot-current={i === lineageDisplayCurrentIdx}
                  class:dot-tip={i === lineageDisplay.length - 1 && i !== lineageDisplayCurrentIdx}
                ></div>
                {#if editDocLayers[item.hash]}
                  <div class="pcr-viewer-lineage-layers">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
                      <path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" />
                    </svg>
                  </div>
                {/if}
              </div>
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="pcr-viewer-lineage-bundle"
                class:expanded={d.kind === "collapse"}
                onclick={() => toggleBundle(d.at)}
                title={d.kind === "collapse"
                  ? "Collapse this branch"
                  : `${d.count} other generation${d.count > 1 ? "s" : ""} branch off here — click to expand`}
              >
                {#if d.kind === "bundle"}
                  <div class="pcr-viewer-lineage-bundle-stack">
                    {#each d.preview as p (p.hash)}
                      <img src={thumbUrl(p.hash)} alt="" draggable="false" loading="lazy" onerror={retryThumb} />
                    {/each}
                  </div>
                  <span class="pcr-viewer-lineage-bundle-count">+{d.count}</span>
                {:else}
                  <span class="pcr-viewer-lineage-bundle-count">▴</span>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
        {#if lineageHiddenCount > 0}
          <div class="pcr-viewer-lineage-hidden">{lineageHiddenCount} hidden</div>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="pcr-viewer-lineage"></div>
  {/if}

  {#if hoverTip}
    <div class="pcr-viewer-tip" style="top:{hoverTip.top}px; left:{hoverTip.left}px;">
      <div class="pcr-viewer-tip-name">{hoverTip.item.filename || hoverTip.item.hash?.slice(0, 12)}</div>
      {#if hoverTip.item.created_at}<div>{timeAgo(hoverTip.item.created_at)}</div>{/if}
      {#if hoverTip.item.width && hoverTip.item.height}<div>{hoverTip.item.width}×{hoverTip.item.height}</div>{/if}
      {#if lineageOps.get(hoverTip.item.hash)?.kind === "upscale"}
        {@const op = lineageOps.get(hoverTip.item.hash)}
        <div class="pcr-viewer-tip-op">▲ upscaled {op.uniform ? fmtFactor(op.factor) + " " : ""}from {op.from.w}×{op.from.h}</div>
      {/if}
      {#if editDocLayers[hoverTip.item.hash]}<div class="pcr-viewer-tip-layers">▦ {editDocLayers[hoverTip.item.hash]} layers — opens layered in Edit</div>{/if}
    </div>
  {/if}

  <!-- center: image -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pcr-viewer-center"
    bind:this={containerEl}
    onwheel={handleWheel}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    ondblclick={handleDblClick}
    style="cursor: {isPanning ? 'grabbing' : 'grab'}"
  >
    <!-- Transient notices live over the image, not the corners: top-left is the
    lineage header and top-right is the close/counter. The native ComfyUI toast
    can't be used here — it caps at z-index 10000, one below this viewer. -->
    {#if newGenBanner}
      <div class="pcr-viewer-newgen-banner">✨ {newGenBanner}</div>
    {/if}
    {#if copyPathToast}
      <div class="pcr-viewer-newgen-banner">📋 Path copied to clipboard</div>
    {/if}
    {#if displayedHash}
      {#if !imageLoaded && !imageError}
        <div class="pcr-viewer-spinner"></div>
      {/if}
      {#if displayedIsVideo}
        <!-- svelte-ignore a11y_media_has_caption -->
        <!-- stopPropagation keeps the container's pan/gesture handler (which
             preventDefaults) from swallowing the native transport controls;
             wheel still bubbles up for zoom. poster shows the server frame
             while the clip buffers. -->
        <video
          bind:this={mainImageEl}
          src={mainImageSrc(displayedHash)}
          poster={imageByHash.get(displayedHash)?._directUrl ? null : thumbUrl(displayedHash)}
          class="pcr-viewer-image"
          class:hidden={!imageLoaded}
          style="transform: translate({panX}px, {panY}px) scale({zoom})"
          onloadeddata={() => { imageLoaded = true; }}
          onerror={() => { imageError = true; imageLoaded = false; }}
          onpointerdown={(e) => e.stopPropagation()}
          ondblclick={(e) => e.stopPropagation()}
          autoplay
          loop
          muted
          playsinline
          controls
        ></video>
      {:else}
        <img
          bind:this={mainImageEl}
          src={mainImageSrc(displayedHash)}
          alt=""
          draggable="false"
          class="pcr-viewer-image"
          class:hidden={!imageLoaded}
          style="transform: translate({panX}px, {panY}px) scale({zoom})"
          onload={() => { imageLoaded = true; }}
          onerror={() => { imageError = true; imageLoaded = false; }}
        />
      {/if}
      {#if compareMode && compareImageUrl}
        <img
          src={compareImageUrl}
          alt="Compare"
          draggable="false"
          class="pcr-viewer-image pcr-viewer-after-image"
          style="transform: translate({panX}px, {panY}px) scale({zoom}); clip-path: inset(0 0 0 {compareClipPercent}%);"
        />
      {/if}
      {#if imageError}
        <div class="pcr-viewer-error">
          <div>{isOrphaned ? 'Source file deleted' : 'Image not found'}</div>
          {#if canReattach}
            <div class="pcr-viewer-error-hint">
              This image's record points to a file that no longer exists. If the
              file was moved or renamed, locate it — it's verified against the
              image's content hash, so the wrong file can't be attached.
            </div>
            <button class="pcr-viewer-reattach-btn" disabled={reattaching} onclick={() => reattachInputEl?.click()}>
              {reattaching ? "Verifying…" : "Locate file…"}
            </button>
            {#if reattachMsg}<div class="pcr-viewer-error-msg">{reattachMsg}</div>{/if}
            <input bind:this={reattachInputEl} type="file" accept="image/*" style="display:none" onchange={handleReattachPick} />
          {/if}
        </div>
      {/if}

      {#if compareMode}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pcr-viewer-compare-slider" style="left: {compareSliderPos}%;" onmousedown={handleSliderDown}>
          <div class="pcr-viewer-compare-handle">
            <div class="pcr-viewer-compare-line"></div>
            <div class="pcr-viewer-compare-circle">
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
                <path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h160v80H200v480h160v80H200Zm240 80v-800h80v80h240q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H520v80h-80Zm80-160h240v-480H520v480Zm-320 0v-480 480Zm560 0v-480 480Z"/>
              </svg>
            </div>
            <div class="pcr-viewer-compare-line"></div>
          </div>
        </div>
        <div class="pcr-viewer-compare-label pcr-viewer-compare-label-before">
          {imageInfo?.filename || 'Current'}
          {#if imageInfo?.created_at}<div class="pcr-viewer-compare-label-age">{timeAgo(imageInfo.created_at)}</div>{/if}
        </div>
        <div class="pcr-viewer-compare-label pcr-viewer-compare-label-after">
          {compareTargetLabel || 'Compare'}
          {#if compareTargetItem?.created_at}<div class="pcr-viewer-compare-label-age">{timeAgo(compareTargetItem.created_at)}</div>{/if}
        </div>
      {/if}
    {/if}

    {#if currentIndex > 0}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="pcr-viewer-nav pcr-viewer-nav-left"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => { e.stopPropagation(); navigate(-1); }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </div>
    {/if}
    {#if currentIndex < images.length - 1}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="pcr-viewer-nav pcr-viewer-nav-right"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => { e.stopPropagation(); navigate(1); }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
      </div>
    {/if}
  </div>

  <!-- right: metadata -->
  <div class="pcr-viewer-meta">
    <div class="pcr-viewer-meta-header">
      <span class="pcr-viewer-counter">{currentIndex + 1} / {images.length}</span>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="pcr-viewer-close" onclick={onClose}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </div>
    </div>

    <!-- history strip -->
    {#if images.length > 1}
      <div class="pcr-viewer-history" class:expanded={historyExpanded}>
        <div class="pcr-viewer-history-header">
          <div class="pcr-viewer-history-thumbs">
            {#each visibleThumbs as thumb (thumb.hash)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="pcr-viewer-history-thumb"
                class:current={thumb.globalIndex === currentIndex}
                onclick={() => jumpTo(thumb.globalIndex)}
              >
                <img src={thumbUrl(thumb.hash)} alt="" draggable="false" loading="lazy" onerror={retryThumb} />
                {#if isVideoItem(thumb)}<div class="pcr-viewer-vidbadge" aria-hidden="true">▶</div>{/if}
              </div>
            {/each}
            <div class="pcr-viewer-history-fade"></div>
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="pcr-viewer-history-expand" onclick={toggleGrid} title={historyExpanded ? "Collapse" : "Expand"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              {#if historyExpanded}
                <path d="M7 14l5-5 5 5z"/>
              {:else}
                <path d="M7 10l5 5 5-5z"/>
              {/if}
            </svg>
          </div>
        </div>

        <!-- scrubber -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pcr-viewer-scrubber-track" onmousedown={handleScrubberTrackDown}>
          <div class="pcr-viewer-scrubber-fill" style="width: {scrubberPercent}%"></div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="pcr-viewer-scrubber-handle"
            style="left: {scrubberPercent}%"
            onmousedown={handleScrubberHandleDown}
          ></div>
        </div>

        <!-- expanded grid -->
        {#if historyExpanded}
          <div class="pcr-viewer-history-grid" bind:this={historyGridEl}>
            {#each images as img, idx (img.hash)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="pcr-viewer-grid-thumb"
                class:current={idx === currentIndex}
                onclick={() => jumpTo(idx)}
              >
                <img src={thumbUrl(img.hash)} alt="" draggable="false" loading="lazy" onerror={retryThumb} />
                {#if isVideoItem(img)}<div class="pcr-viewer-vidbadge" aria-hidden="true">▶</div>{/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- toolbar -->
    <div class="pcr-viewer-toolbar">
      <!-- zoom row -->
      <div class="pcr-viewer-toolbar-row">
        <div class="pcr-viewer-zoom-control">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="pcr-viewer-zoom-btn" onclick={() => { zoomDropdownOpen = !zoomDropdownOpen; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            <span>{zoomDisplayText}</span>
          </div>
          {#if zoomDropdownOpen}
            <div class="pcr-viewer-zoom-dropdown">
              {#each ZOOM_PRESETS as level}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="pcr-viewer-zoom-preset" onclick={() => setZoomLevel(level)}>{level}%</div>
              {/each}
            </div>
          {/if}
        </div>
        <input type="range" class="pcr-viewer-zoom-slider" min="0" max="100" value={zoomSliderValue} oninput={handleZoomSlider} />
      </div>

      <!-- compare row -->
      {#if hasCompareTargets && !displayedIsVideo}
        <div class="pcr-viewer-toolbar-row pcr-viewer-compare-container">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="pcr-viewer-toolbar-btn"
            class:active={compareMode || compareDropdownOpen}
            onclick={() => { compareDropdownOpen = !compareDropdownOpen; }}
            title="Compare (C)"
          >
            <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h160v80H200v480h160v80H200Zm240 80v-800h80v80h240q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H520v80h-80Zm80-160h240v-480H520v480Z"/>
            </svg>
            <span>Compare</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.7;"><path d="M7 10l5 5 5-5z"/></svg>
          </div>
          {#if compareDropdownOpen}
            <div class="pcr-viewer-compare-dropdown">
              {#each compareTargets as target}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  class="pcr-viewer-compare-dropdown-item"
                  class:active={compareTargetHash === target.hash}
                  onclick={() => enterCompareWith(target.hash, target.filename || target.hash.slice(0, 8))}
                >
                  {target.filename || target.hash.slice(0, 8)}
                </div>
              {/each}
              {#if compareMode}
                <div class="pcr-viewer-compare-dropdown-divider"></div>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="pcr-viewer-compare-dropdown-item pcr-viewer-compare-clear" onclick={exitCompare}>Clear</div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- upscale row — HIDDEN (consolidation test): Edit is the single entry
           point for inpaint/upscale; flip `false` back to restore the button -->
      {#if false && onUpscale}
        <div class="pcr-viewer-toolbar-row">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="pcr-viewer-toolbar-btn"
            onclick={() => { if (!upscaling && !upscalePreparing) openUpscaleOptions(); }}
            title="Upscale this image"
          >
            <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M120-120v-320h80v184l504-504H520v-80h320v320h-80v-184L256-200h184v80H120Z"/>
            </svg>
            <span>{upscalePreparing ? "Reading..." : upscaling ? "Building..." : "Upscale"}</span>
          </div>
        </div>
      {/if}

      <!-- inpaint row — HIDDEN (consolidation test): Edit is the single entry
           point for inpaint/upscale; flip `false` back to restore the button -->
      {#if false && onInpaintRun}
        <div class="pcr-viewer-toolbar-row">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="pcr-viewer-toolbar-btn"
            onclick={() => { if (!inpaintPreparing) openInpaint(); }}
            title="Paint a region and regenerate it"
          >
            <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 32.5-156t88-127Q256-817 330-848.5T487-880q79 0 150 26.5T761-781q53 46 86 108.5T880-538q0 103-64 160.5T660-320h-75q-18 0-31.5 14T540-275q0 20 14.5 38t14.5 43q0 26-24.5 60T480-80Z"/>
            </svg>
            <span>{inpaintPreparing ? "Reading..." : "Inpaint"}</span>
          </div>
        </div>
      {/if}

      <!-- edit row — image-only: Edit/inpaint/upscale run on a still raster, so
           it's hidden for video clips (no meaningful editor handoff exists) -->
      {#if onEditSave && !displayedIsVideo}
        <div class="pcr-viewer-toolbar-row">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="pcr-viewer-toolbar-btn"
            onclick={() => { if (!editPreparing) openEdit(); }}
            title="Edit, inpaint or upscale this image"
          >
            <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L530-360H360Zm481-424-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z"/>
            </svg>
            <span>{editPreparing ? "Reading..." : "Edit"}</span>
            {#if editDocLayers[displayedHash]}
              <span class="pcr-viewer-edit-layers" title="This image has {editDocLayers[displayedHash]} saved layers — Edit opens it layered, un-flattened">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
                {editDocLayers[displayedHash]}
              </span>
            {/if}
          </div>
        </div>
      {/if}

      <!-- extend row — video clips only: render the next clip from the last frame -->
      {#if onExtendRun && displayedIsVideo}
        <div class="pcr-viewer-toolbar-row">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="pcr-viewer-toolbar-btn"
            onclick={() => { if (!extendPreparing) openExtend(); }}
            title="Render the next clip, continuing from this video's last frame"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 16 12 5 21 5 3"/><line x1="20" y1="4" x2="20" y2="20"/>
            </svg>
            <span>{extendPreparing ? "Reading..." : "Extend"}</span>
          </div>
        </div>
      {/if}

      <!-- smooth row — video clips only: RIFE frame interpolation -->
      {#if onSmoothRun && displayedIsVideo}
        <div class="pcr-viewer-toolbar-row">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="pcr-viewer-toolbar-btn"
            onclick={() => { if (!smoothPreparing) openSmooth(); }}
            title="Interpolate extra frames (RIFE) for smoother, higher-fps motion"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12h4l3-9 4 18 3-9h4"/>
            </svg>
            <span>{smoothPreparing ? "Reading..." : "Smooth"}</span>
          </div>
        </div>
      {/if}

      <!-- copy link row -->
      <div class="pcr-viewer-toolbar-row pcr-viewer-toolbar-row-equal">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        {#if onDelete}
          <div class="pcr-viewer-toolbar-btn pcr-viewer-delete" onclick={requestDelete} title="Delete file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
            <span>{deleting ? 'Deleting...' : 'Delete'}</span>
          </div>
        {/if}
        {#if isLocalClient}
          <div class="pcr-viewer-toolbar-btn" onclick={openFolder} title="Reveal file in Explorer">
            <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z"/>
            </svg>
            <span>Open Folder</span>
          </div>
        {/if}
        <div class="pcr-viewer-toolbar-btn" class:active={linkCopied} onclick={copyLink} title="Copy shareable link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span>{linkCopied ? 'Copied!' : 'Copy Link'}</span>
        </div>
      </div>
    </div>

    <!-- metadata content -->
    <div class="pcr-viewer-meta-content">
      {#if imageInfo}
        <!-- image info -->
        <div class="pcr-meta-heading">Image Info</div>
        <div class="pcr-meta-card">
          <div class="pcr-meta-grid-2">
            {#if imageInfo.width && imageInfo.height}
              <div class="pcr-meta-field">
                <span class="pcr-meta-label">Dimensions</span>
                <span class="pcr-meta-val">{imageInfo.width} × {imageInfo.height}</span>
              </div>
            {/if}
            {#if imageInfo.file_size}
              <div class="pcr-meta-field">
                <span class="pcr-meta-label">Size</span>
                <span class="pcr-meta-val">{imageInfo.file_size > 1048576 ? (imageInfo.file_size / 1048576).toFixed(1) + ' MB' : Math.round(imageInfo.file_size / 1024) + ' KB'}</span>
              </div>
            {/if}
          </div>
          {#if imageInfo.created_at}
            <div class="pcr-meta-field">
              <span class="pcr-meta-label">Generated</span>
              <span class="pcr-meta-val">{new Date(imageInfo.created_at * 1000).toLocaleDateString()}</span>
            </div>
          {/if}
          {#if imageInfo.filename}
            <div class="pcr-meta-field">
              <span class="pcr-meta-label">Filename</span>
              <span class="pcr-meta-val pcr-meta-break">{imageInfo.filename}</span>
            </div>
          {/if}
          {#if isOrphaned}
            <div class="pcr-meta-field">
              <span class="pcr-meta-label pcr-label-orphan">Status</span>
              <span class="pcr-meta-val pcr-meta-orphan">Source deleted</span>
            </div>
          {/if}
        </div>

        <!-- prompt -->
        {#if imageInfo.prompt || imageInfo.negative}
          {@const regionData = parseRegions(imageInfo.regions)}
          <div class="pcr-meta-heading">Prompt</div>
          <div class="pcr-meta-card">
            {#if regionData}
              <!-- regional gen: per-$block breakdown instead of the flattened compile -->
              {#each regionData.regions as region (region.id)}
                <div class="pcr-meta-field">
                  <span class="pcr-meta-label pcr-label-region">${region.name}</span>
                  <p class="pcr-meta-prompt">{region.text}</p>
                </div>
              {/each}
              {#if regionData.global}
                <div class="pcr-meta-field">
                  <span class="pcr-meta-label pcr-label-pos">Global:</span>
                  <p class="pcr-meta-prompt">{regionData.global}</p>
                </div>
              {/if}
            {:else if imageInfo.prompt}
              <div class="pcr-meta-field">
                <span class="pcr-meta-label pcr-label-pos">Positive Prompt:</span>
                <p class="pcr-meta-prompt">{imageInfo.prompt}</p>
              </div>
            {/if}
            {#if imageInfo.negative}
              <div class="pcr-meta-field">
                <span class="pcr-meta-label pcr-label-neg">Negative Prompt:</span>
                <p class="pcr-meta-prompt pcr-text-neg">{imageInfo.negative}</p>
              </div>
            {/if}
          </div>
        {/if}

        <!-- generation settings -->
        {#if imageInfo.model || imageInfo.seed != null || imageInfo.steps}
          <div class="pcr-meta-heading">Generation Settings</div>
          <div class="pcr-meta-card">
            {#if imageInfo.model}
              <div class="pcr-meta-field">
                <span class="pcr-meta-label">Model</span>
                <span class="pcr-meta-val pcr-meta-break">{imageInfo.model}</span>
              </div>
            {/if}
            {#if imageInfo.seed != null}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="pcr-meta-field pcr-clickable" onclick={copySeed} title="Click to copy">
                <span class="pcr-meta-label">Seed</span>
                <span class="pcr-meta-val">{formatSeed(imageInfo.seed)}</span>
              </div>
            {/if}
            <div class="pcr-meta-grid-2">
              {#if imageInfo.steps}
                <div class="pcr-meta-field">
                  <span class="pcr-meta-label">Steps</span>
                  <span class="pcr-meta-val">{imageInfo.steps}</span>
                </div>
              {/if}
              {#if imageInfo.cfg}
                <div class="pcr-meta-field">
                  <span class="pcr-meta-label">CFG</span>
                  <span class="pcr-meta-val">{imageInfo.cfg}</span>
                </div>
              {/if}
              {#if imageInfo.sampler}
                <div class="pcr-meta-field">
                  <span class="pcr-meta-label">Sampler</span>
                  <span class="pcr-meta-val">{imageInfo.sampler}</span>
                </div>
              {/if}
              {#if imageInfo.denoise != null}
                <div class="pcr-meta-field">
                  <span class="pcr-meta-label">Denoise</span>
                  <span class="pcr-meta-val">{imageInfo.denoise}</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {:else if currentImage}
        <div class="pcr-viewer-meta-empty">Loading metadata...</div>
      {/if}
    </div>
  </div>
</div>

<UpscaleOptionsModal
  open={upscaleModalOpen}
  imageKey={displayedHash || ""}
  caps={upscalePrepared?.caps}
  {fetchApi}
  filename={upscalePrepared?.data?.filename || ""}
  width={upscalePrepared?.data?.width || 0}
  height={upscalePrepared?.data?.height || 0}
  previewUrl={upscalePreviewUrl}
  progress={upscaleProgress}
  onConfirm={confirmUpscale}
  onCancel={cancelUpscale}
  onCancelRun={cancelUpscaleRun}
  onViewResult={viewUpscaleResult}
  onUseInEdit={upscaleFromEdit ? handleUpscaleToEdit : null}
  elevated={upscaleFromEdit}
  docWidth={upscaleFromEdit ? upscaleEditCtx?.docWidth || 0 : 0}
  docHeight={upscaleFromEdit ? upscaleEditCtx?.docHeight || 0 : 0}
  onInstallPack={onInpaintInstallPack}
  mountPromptEditor={onMountPromptEditor}
/>

<InpaintModal
  open={inpaintModalOpen}
  imageKey={displayedHash || ""}
  sourceUrl={inpaintPrepared?.sourceUrl || ""}
  width={inpaintPrepared?.data?.width || 0}
  height={inpaintPrepared?.data?.height || 0}
  filename={inpaintPrepared?.data?.filename || ""}
  caps={inpaintPrepared?.caps}
  prefillPrompt={inpaintPrepared?.caps?.prefillPrompt
    || (imageInfo?.prompt ? imageInfo.prompt + (imageInfo.negative ? `\n\nNegative Prompt:\n${imageInfo.negative}` : "") : "")}
  referencePrompt={inpaintPrepared?.caps?.referencePrompt
    || (imageInfo?.prompt ? imageInfo.prompt + (imageInfo.negative ? `\n\nNegative Prompt:\n${imageInfo.negative}` : "") : "")}
  {fetchApi}
  {apiURL}
  onRun={(options) => onInpaintRun(inpaintPrepared, { ...options, condOffset: inpaintFromEdit ? inpaintCondOffset : null })}
  onSave={(doneState, prefix) => onInpaintSave(doneState, prefix)}
  onUploadReference={onInpaintUploadReference}
  onInstallPack={onInpaintInstallPack}
  mountPromptEditor={onMountPromptEditor}
  onSaved={inpaintSaved}
  regionPrompts={editFigureRegions}
  forcedPrefill={inpaintFromEdit ? inpaintRegionPrefill : null}
  forcedPrefillLabel={inpaintRegionName}
  movedContent={inpaintFromEdit ? inpaintMovedContent : false}
  initialMask={inpaintFromEdit ? inpaintEditMask : null}
  onUseInEdit={inpaintFromEdit ? handleInpaintToEdit : null}
  elevated={inpaintFromEdit}
  onCancel={() => { if (inpaintFromEdit) closeInpaintFromEdit(); else { inpaintModalOpen = false; inpaintPrepared = null; } }}
/>

<EditModal
  bind:this={editModalRef}
  open={editModalOpen}
  sourceUrl={editPrepared?.sourceUrl || ""}
  width={editPrepared?.data?.width || 0}
  height={editPrepared?.data?.height || 0}
  filename={editPrepared?.data?.filename || ""}
  caps={editPrepared?.caps}
  editDocHash={editPrepared ? (displayedHash || "") : ""}
  {fetchApi}
  {apiURL}
  onSave={(blob, prefix) => onEditSave(editPrepared, blob, prefix)}
  onSaved={inpaintSaved}
  onOpenInpaint={onInpaintRegion ? openInpaintFromEdit : null}
  onOpenUpscale={onUpscalePrepare && onUpscaleBackground && onInpaintUploadReference ? openUpscaleFromEdit : null}
  onOpenRepose={onReposeCaps && onReposeRun && onMountPoser && onInpaintUploadReference ? openReposeFromEdit : null}
  figureRegions={editFigureRegions}
  suspended={(inpaintFromEdit && inpaintModalOpen) || (upscaleFromEdit && upscaleModalOpen) || reposeModalOpen}
  onCancel={() => { editModalOpen = false; editPrepared = null; editEntry = null; }}
/>

<RePoseModal
  open={reposeModalOpen}
  imageKey={displayedHash || ""}
  lineageKeys={reposeLineageKeys}
  {fetchApi}
  sourceUrl={reposePrepared?.sourceUrl || ""}
  width={reposePrepared?.width || 0}
  height={reposePrepared?.height || 0}
  caps={reposePrepared?.caps}
  progress={reposeProgress}
  onMountPoser={onMountPoser}
  mountPromptEditor={onMountPromptEditor}
  onRun={confirmRepose}
  onUseInEdit={handleReposeToEdit}
  onCancel={() => { if (reposeProgress && ["building","queueing","running"].includes(reposeProgress.phase)) reposeTracker?.cancel?.(); else closeRepose(); }}
/>

<ExtendModal
  open={extendModalOpen}
  lastFrameUrl={extendPrepared?.lastFrameUrl || ""}
  fps={extendPrepared?.fps || 16}
  frameCount={extendPrepared?.frameCount || 0}
  lightningAvailable={extendPrepared?.lightningAvailable ?? true}
  defaults={extendPrepared?.defaults || null}
  recipeDefaults={extendPrepared?.recipeDefaults || null}
  mountPromptEditor={onMountPromptEditor}
  progress={extendProgress}
  onRun={confirmExtend}
  onDone={finishExtend}
  onCancel={() => { if (extendProgress && ["building","queueing","running"].includes(extendProgress.phase)) extendTracker?.cancel?.(); else closeExtend(); }}
/>

<SmoothModal
  open={smoothModalOpen}
  fps={smoothPrepared?.fps || 16}
  frameCount={smoothPrepared?.frameCount || 0}
  progress={smoothProgress}
  onRun={confirmSmooth}
  onDone={finishSmooth}
  onCancel={() => { if (smoothProgress && ["building","queueing","running"].includes(smoothProgress.phase)) smoothTracker?.cancel?.(); else closeSmooth(); }}
/>

<ConfirmModal
  open={confirmDeleteOpen}
  title={deleteBatch?.length ? `Delete ${deleteBatch.length} images` : "Delete image"}
  message={deleteBatch?.length
    ? `Permanently delete these ${deleteBatch.length} selected images? This removes the files from disk and can't be undone.`
    : "Permanently delete this image? This removes the file from disk and can't be undone."}
  confirmLabel={deleteBatch?.length ? `Delete ${deleteBatch.length}` : "Delete"}
  onConfirm={handleDelete}
  onCancel={cancelDelete}
/>

{#if lineageMenu}
  <LineageContextMenu
    x={lineageMenu.x}
    y={lineageMenu.y}
    canExpand={lineageMenu.item ? canExpand(lineageMenu.item) : false}
    canFocus={lineageMenu.item ? (lineageTree.childrenOf.get(lineageMenu.item.hash)?.length > 0 && lineageMenu.item.hash !== focusRootHash) : false}
    pinned={lineageMenu.item ? pinnedHashes.has(lineageMenu.item.hash) : false}
    canEdit={!!onEditSave}
    canDelete={!!onDelete}
    isLocal={isLocalClient}
    {isWindows}
    orphaned={lineageMenu.item?.orphaned === 1}
    onAction={(action) => lineageMenuAction(action, lineageMenu.item)}
    onClose={() => { lineageMenu = null; }}
  />
{/if}

<style>
  .pcr-viewer {
    position: fixed;
    inset: 0;
    z-index: 10001;
    background: #0a0a0a;
    display: flex;
    font-family: system-ui, -apple-system, sans-serif;
    color: #ccc;
  }

  .pcr-viewer-lineage {
    width: 0;
    background: #111;
    border-right: 1px solid #222;
    overflow-y: auto;
    flex-shrink: 0;
  }
  .pcr-viewer-lineage-visible {
    width: 88px;
    display: flex;
    flex-direction: column;
  }
  .pcr-viewer-lineage-header {
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 0 8px;
    box-sizing: border-box;
    font-size: 11px;
    color: #888;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
  }
  .pcr-lin-count { white-space: nowrap; }
  .pcr-viewer-lineage-strip {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .pcr-viewer-lineage-strip::-webkit-scrollbar { width: 4px; }
  .pcr-viewer-lineage-strip::-webkit-scrollbar-track { background: transparent; }
  .pcr-viewer-lineage-strip::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

  .pcr-viewer-lineage-node {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    flex-shrink: 0;
    transition: border-color 0.15s, background 0.15s;
  }
  .pcr-viewer-lineage-node.current {
    border-color: #4fc3f7;
    background: rgba(79, 195, 247, 0.15);
    box-shadow: 0 0 0 1px rgba(79, 195, 247, 0.5), 0 0 10px 1px rgba(79, 195, 247, 0.45);
  }
  .pcr-viewer-lineage-node:hover:not(.current) {
    background: rgba(255, 255, 255, 0.1);
    border-color: #555;
  }
  /* multi-select for batch delete */
  .pcr-viewer-lineage-node.selected {
    border-color: #ffb84d;
    box-shadow: 0 0 0 1px rgba(255, 184, 77, 0.6);
  }
  /* centered over the thumb so it never collides with the corner badges (dot,
     layers, fork pip / expander, opbadge) — the .selected ring already frames it */
  /* pin marker — top-left; shares the corner with the layers badge, which shifts right when both show */
  .pcr-lin-pinbadge {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 15px;
    height: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    line-height: 1;
    border-radius: 4px;
    background: rgba(20, 20, 20, 0.82);
    color: #ffd24a;
    box-shadow: 0 0 0 1px rgba(255, 200, 60, 0.6);
    pointer-events: none;
    z-index: 3;
  }
  .pcr-viewer-lineage-node.pinned .pcr-viewer-lineage-layers {
    left: 21px;
  }
  .pcr-lin-selcheck {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    border-radius: 50%;
    background: rgba(255, 184, 77, 0.92);
    color: #1a1208;
    pointer-events: none;
    z-index: 3;
  }
  .pcr-lin-focuscrumb {
    margin: 0 6px 4px;
    padding: 3px 6px;
    font-size: 10px;
    border-radius: 4px;
    border: 1px solid rgba(120, 200, 255, 0.4);
    background: rgba(40, 70, 95, 0.5);
    color: #bfe3ff;
    cursor: pointer;
    white-space: nowrap;
  }
  .pcr-lin-focuscrumb:hover { background: rgba(50, 90, 120, 0.7); }
  .pcr-lin-focusx { opacity: 0.7; margin-left: 2px; }
  .pcr-lin-selbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    margin: 0 6px 4px;
    padding: 3px 6px;
    font-size: 10px;
    border-radius: 4px;
    background: rgba(95, 65, 20, 0.5);
    color: #ffd9a3;
  }
  .pcr-lin-seldel {
    padding: 2px 6px;
    border-radius: 3px;
    border: none;
    background: #e0863a;
    color: #1a1208;
    font-weight: 700;
    cursor: pointer;
  }
  .pcr-lin-seldel:hover { background: #f09a4d; }
  .pcr-lin-selclear {
    padding: 2px 5px;
    border-radius: 3px;
    border: none;
    background: transparent;
    color: #ffd9a3;
    cursor: pointer;
  }
  .pcr-lin-selclear:hover { color: #fff; }
  .pcr-viewer-lineage-node img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }
  /* "has a saved layer stack" badge — top-left so it clears the bottom-right dot */
  .pcr-viewer-lineage-layers {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    padding: 2px;
    box-sizing: border-box;
    border-radius: 4px;
    background: rgba(20, 20, 20, 0.82);
    color: #ffb27d;
    display: flex;
    pointer-events: none;
    box-shadow: 0 0 0 1px rgba(200, 89, 9, 0.6);
  }
  .pcr-viewer-lineage-layers svg { width: 100%; height: 100%; }
  .pcr-viewer-lineage-dot {
    position: absolute;
    bottom: 3px;
    right: 3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid #0a0a0a;
  }
  .dot-root { background: #66bb6a; }
  .dot-current { background: #4fc3f7; }
  .dot-tip { background: #ffa726; }
  .pcr-viewer-lineage-node.orphaned {
    opacity: 0.4;
    border: 2px dashed #c42020;
  }
  /* off-spine branch nodes revealed by expanding a bundle */
  .pcr-viewer-lineage-node.branch {
    width: 54px;
    height: 54px;
    margin-left: 14px;
    opacity: 0.9;
  }
  .pcr-viewer-lineage-bundle {
    position: relative;
    width: 64px;
    height: 38px;
    border-radius: 4px;
    border: 2px dashed #444;
    background: #181818;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition: border-color 0.15s, background 0.15s;
  }
  .pcr-viewer-lineage-bundle:hover {
    border-color: #777;
    background: #222;
  }
  .pcr-viewer-lineage-bundle.expanded {
    height: 16px;
    border-style: solid;
  }
  .pcr-viewer-lineage-bundle-stack {
    position: absolute;
    inset: 0;
  }
  .pcr-viewer-lineage-bundle-stack img {
    position: absolute;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.35;
    pointer-events: none;
  }
  .pcr-viewer-lineage-bundle-stack img:nth-child(2) {
    transform: translate(5px, 5px);
    opacity: 0.18;
  }
  .pcr-viewer-lineage-bundle-count {
    position: relative;
    z-index: 1;
    font-size: 12px;
    font-weight: 700;
    color: #ddd;
    text-shadow: 0 1px 2px #000;
    line-height: 1;
  }
  .pcr-viewer-lineage-hidden {
    padding: 4px 0 8px;
    text-align: center;
    font-size: 10px;
    color: #666;
    flex-shrink: 0;
  }

  /* ── subway lanes: the rail grows horizontally into parallel vertical lanes ── */
  .pcr-viewer-lineage-visible.lanes {
    width: auto;
    max-width: 45vw;
  }
  /* scroll viewport — fills the rail; the sized tree inside scrolls both axes */
  .pcr-lin-treescroll {
    flex: 1;
    overflow: auto;
    padding: 8px 12px;
    position: relative; /* offset origin for centering the current node (contentXY) */
  }
  .pcr-lin-treescroll::-webkit-scrollbar { width: 7px; height: 7px; }
  .pcr-lin-treescroll::-webkit-scrollbar-track { background: transparent; }
  .pcr-lin-treescroll::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
  /* both axes scroll here, so kill the default white corner where they meet */
  .pcr-lin-treescroll::-webkit-scrollbar-corner { background: transparent; }
  /* sized to the tree's extent; nodes are absolutely positioned within it and the
     SVG connector layer measures geometry relative to this element */
  .pcr-lin-tree {
    position: relative;
  }
  .pcr-lin-treenode {
    position: absolute;
    transition: opacity 0.12s ease;
  }
  /* fade everything off the displayed image's branch so the active lineage reads
     at a glance; hovering a faded node brings it back to inspect it */
  .pcr-lin-treenode.dimmed {
    opacity: 0.7;
  }
  .pcr-lin-treenode.dimmed:hover {
    opacity: 1;
  }
  /* SVG overlay lives inside the scroll content, so it translates with scroll for
     free — geometry is only recomputed on expand/fold/resize/img-load. */
  .pcr-lin-connectors {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    overflow: visible;
  }
  .pcr-lin-connectors path {
    stroke: #4a4a4a;
    stroke-width: 2;
    fill: none;
  }
  /* the displayed image's lineage path — drawn last so it sits over dim edges */
  .pcr-lin-connectors path.active {
    stroke: #3b9eff;
    stroke-width: 3;
  }
  /* overflow bundle sitting in a tree row (oldest siblings folded away) */
  .pcr-lin-treebundle {
    width: 64px;
    height: 44px;
  }
  /* faint blue tie between active-branch thumbs and the bright path connecting them */
  .pcr-lin-treenode:not(.dimmed) .pcr-viewer-lineage-node:not(.current) {
    border-color: rgba(59, 158, 255, 0.45);
  }
  /* upscale provenance badge — bottom-left, clears the layers badge (top-left) and dot (bottom-right) */
  .pcr-lin-opbadge {
    position: absolute;
    bottom: 3px;
    left: 3px;
    padding: 0 3px;
    height: 14px;
    display: flex;
    align-items: center;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    border-radius: 3px;
    background: rgba(20, 20, 20, 0.82);
    color: #8fd0ff;
    box-shadow: 0 0 0 1px rgba(59, 158, 255, 0.5);
    pointer-events: none;
  }
  /* at-rest "this node hides N branches" marker; swapped for the ⊞ button on hover */
  .pcr-lin-forkpip {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    border-radius: 4px;
    background: rgba(20, 20, 20, 0.7);
    color: #c0a3ff;
    box-shadow: 0 0 0 1px rgba(150, 120, 255, 0.5);
    pointer-events: none;
  }
  .pcr-viewer-lineage-node:hover .pcr-lin-forkpip,
  .pcr-viewer-lineage-node:hover .pcr-lin-opbadge {
    display: none;
  }
  .pcr-viewer-tip-op {
    color: #8fd0ff;
  }
  .pcr-lin-expander {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    box-sizing: border-box;
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    border-radius: 4px;
    border: 1px solid rgba(120, 120, 120, 0.6);
    background: rgba(20, 20, 20, 0.82);
    color: #cdd6e0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }
  .pcr-lin-expander:hover {
    background: rgba(60, 60, 60, 0.95);
    border-color: #888;
  }
  .pcr-lin-fold {
    position: absolute;
    bottom: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    padding: 0;
    font-size: 11px;
    line-height: 1;
    border-radius: 4px;
    border: 1px solid rgba(120, 120, 120, 0.6);
    background: rgba(20, 20, 20, 0.82);
    color: #cdd6e0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }
  .pcr-lin-fold:hover {
    background: rgba(60, 60, 60, 0.95);
    border-color: #888;
  }
  /* ⊞/⊟ are actions, not status — keep them off the thumb until the node is
     hovered so the strip isn't cluttered at rest (dot + layers badge stay). */
  .pcr-lin-expander,
  .pcr-lin-fold {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s;
  }
  .pcr-viewer-lineage-node:hover .pcr-lin-expander,
  .pcr-viewer-lineage-node:hover .pcr-lin-fold {
    opacity: 1;
    pointer-events: auto;
  }
  .pcr-lin-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    flex-shrink: 0;
    border: 1px solid #333;
    border-radius: 4px;
    background: #1a1a1a;
    color: #9bb4c7;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .pcr-lin-toggle:hover { background: #262626; border-color: #555; color: #cfe2f0; }
  .pcr-lin-toggle.on { background: rgba(79, 195, 247, 0.15); border-color: #4fc3f7; color: #4fc3f7; }

  /* compare-picking: dropdown open → strip thumbnails are click targets */
  .pcr-viewer-lineage-node.compare-candidate {
    border-color: rgba(255, 221, 114, 0.6);
    box-shadow: 0 0 6px rgba(255, 221, 114, 0.3);
  }
  .pcr-viewer-lineage-node.compare-candidate:hover {
    border-color: rgb(255, 221, 114);
    box-shadow: 0 0 8px rgba(255, 221, 114, 0.55);
  }
  /* in compare mode: colors match the on-image before/after labels */
  .pcr-viewer-lineage-node.compare-left {
    border-color: rgb(96, 206, 255);
    box-shadow: 0 0 8px rgba(96, 206, 255, 0.5);
  }
  .pcr-viewer-lineage-node.compare-right {
    border-color: rgb(255, 221, 114);
    box-shadow: 0 0 8px rgba(255, 221, 114, 0.5);
  }
  .pcr-viewer-lineage-node.compare-left::after,
  .pcr-viewer-lineage-node.compare-right::after {
    position: absolute;
    top: 2px;
    left: 2px;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.75);
  }
  .pcr-viewer-lineage-node.compare-left::after { content: "L"; color: rgb(96, 206, 255); }
  .pcr-viewer-lineage-node.compare-right::after { content: "R"; color: rgb(255, 221, 114); }

  .pcr-viewer-newgen-banner {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    padding: 7px 13px;
    font-size: 12.5px;
    font-weight: 600;
    color: #7ec97e;
    background: rgba(20, 30, 20, 0.9);
    border: 1px solid rgba(126, 201, 126, 0.45);
    border-radius: 6px;
    animation: pcr-newgen-in 0.25s ease-out, pcr-newgen-out 0.6s ease-in 5.4s forwards;
    pointer-events: none;
  }
  @keyframes pcr-newgen-in {
    from { opacity: 0; transform: translate(-50%, -8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  @keyframes pcr-newgen-out {
    to { opacity: 0; }
  }
  .pcr-label-orphan { color: #c42020; }
  .pcr-meta-orphan { color: #c42020; font-weight: 600; }

  /* center: image */
  .pcr-viewer-center {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    user-select: none;
  }
  .pcr-viewer-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transform-origin: center center;
  }
  .pcr-viewer-image.hidden { display: none; }

  .pcr-viewer-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: #4fc3f7;
    border-radius: 50%;
    animation: pcr-viewer-spin 0.8s linear infinite;
  }
  @keyframes pcr-viewer-spin { to { transform: rotate(360deg); } }
  .pcr-viewer-error {
    color: #888;
    font-style: italic;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    max-width: 360px;
    text-align: center;
  }
  .pcr-viewer-error-hint {
    font-size: 12px;
    font-style: normal;
    color: #777;
    line-height: 1.5;
  }
  .pcr-viewer-reattach-btn {
    font-style: normal;
    font-size: 12.5px;
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid #555;
    background: #2a2a2a;
    color: #ddd;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .pcr-viewer-reattach-btn:hover:not(:disabled) {
    background: #333;
    border-color: #777;
  }
  .pcr-viewer-reattach-btn:disabled { opacity: 0.5; cursor: default; }
  .pcr-viewer-error-msg {
    font-size: 12px;
    font-style: normal;
    color: #e08080;
  }

  /* nav arrows */
  .pcr-viewer-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    border-radius: 4px;
    z-index: 5;
  }
  .pcr-viewer-nav:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
  .pcr-viewer-nav-left { left: 12px; }
  .pcr-viewer-nav-right { right: 12px; }

  /* right: metadata panel */
  .pcr-viewer-meta {
    width: 280px;
    background: #111;
    border-left: 1px solid #222;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
  }
  .pcr-viewer-meta-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid #222;
  }
  .pcr-viewer-counter { font-size: 12px; color: #888; }
  .pcr-viewer-close {
    cursor: pointer;
    color: #888;
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }
  .pcr-viewer-close:hover { color: #ff6b6b; background: #331111; }

  /* history strip */
  .pcr-viewer-history {
    padding: 8px 12px;
    border-bottom: 1px solid #222;
    background: #0d0d0d;
  }
  .pcr-viewer-history-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pcr-viewer-history-thumbs {
    display: flex;
    gap: 6px;
    position: relative;
    overflow: hidden;
    flex: 1;
  }
  .pcr-viewer-history-thumb {
    position: relative;
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border: 2px solid transparent;
    border-radius: 4px;
    background: #222;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.15s, transform 0.15s;
  }
  .pcr-viewer-history-thumb.current { border-color: #4fc3f7; }
  .pcr-viewer-history-thumb:hover:not(.current) { border-color: #666; transform: scale(1.05); }
  .pcr-viewer-history-thumb img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .pcr-viewer-history-fade {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 40px;
    background: linear-gradient(to right, transparent, #0d0d0d);
    pointer-events: none;
  }

  /* expand button */
  .pcr-viewer-history-expand {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pcr-viewer-history-expand:hover { background: #252525; color: #ccc; border-color: #444; }
  .pcr-viewer-history.expanded .pcr-viewer-history-expand { background: #252525; color: #4fc3f7; border-color: #4fc3f7; }

  /* scrubber */
  .pcr-viewer-scrubber-track {
    position: relative;
    height: 6px;
    margin-top: 8px;
    background: #333;
    border-radius: 3px;
    cursor: pointer;
  }
  .pcr-viewer-scrubber-fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: #4fc3f7;
    border-radius: 3px;
    pointer-events: none;
  }
  .pcr-viewer-scrubber-handle {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    background: #4fc3f7;
    border-radius: 50%;
    cursor: grab;
    transition: background 0.15s;
  }
  .pcr-viewer-scrubber-handle:hover { background: #80d4f9; }
  .pcr-viewer-scrubber-handle:active { cursor: grabbing; background: #29b6f6; }

  /* expanded grid */
  .pcr-viewer-history-grid {
    display: grid;
    grid-template-columns: repeat(4, 56.5px);
    grid-auto-rows: 56.5px;
    gap: 4px;
    margin-top: 10px;
    padding: 4px;
    max-height: 280px;
    overflow-y: auto;
    overflow-x: hidden;
    background: #111;
    border-radius: 4px;
    border: 1px solid #222;
  }
  .pcr-viewer-history-grid::-webkit-scrollbar { width: 6px; }
  .pcr-viewer-history-grid::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 3px; }
  .pcr-viewer-history-grid::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
  .pcr-viewer-history-grid::-webkit-scrollbar-thumb:hover { background: #555; }

  .pcr-viewer-grid-thumb {
    position: relative;
    width: 56.5px;
    height: 56.5px;
    border: 2px solid transparent;
    border-radius: 4px;
    background: #222;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.15s, transform 0.1s;
  }
  .pcr-viewer-grid-thumb.current { border-color: #4fc3f7; box-shadow: 0 0 8px rgba(79, 195, 247, 0.4); }
  .pcr-viewer-grid-thumb:hover:not(.current) { border-color: #666; transform: scale(1.05); z-index: 1; }
  .pcr-viewer-grid-thumb img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }

  /* ▶ overlay marking a poster-framed thumbnail as a playable video clip */
  .pcr-viewer-vidbadge {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding-left: 1px;
    font-size: 9px;
    line-height: 1;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 50%;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }

  /* metadata content */
  .pcr-viewer-meta-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px 12px;
  }
  .pcr-viewer-meta-content::-webkit-scrollbar { width: 4px; }
  .pcr-viewer-meta-content::-webkit-scrollbar-track { background: transparent; }
  .pcr-viewer-meta-content::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

  .pcr-meta-heading {
    font-size: 11px;
    text-transform: uppercase;
    color: #4fc3f7;
    letter-spacing: 0.5px;
    padding: 14px 0 6px;
  }
  .pcr-meta-card {
    background: #1a1a1a;
    border-radius: 6px;
    padding: 10px 12px;
  }
  .pcr-meta-field {
    padding: 4px 0;
  }
  .pcr-meta-label {
    font-size: 10px;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: 2px;
  }
  .pcr-meta-val {
    font-size: 14px;
    color: #e0e0e0;
    font-weight: 500;
    display: block;
  }
  .pcr-meta-break { word-break: break-all; }
  .pcr-meta-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 16px;
  }
  .pcr-clickable {
    cursor: pointer;
    border-radius: 4px;
    padding: 4px;
    margin: 0 -4px;
    transition: background 0.15s;
  }
  .pcr-clickable:hover { background: rgba(255, 255, 255, 0.05); }

  .pcr-label-pos { color: #4fc3f7; }
  .pcr-label-neg { color: #ff5252; }
  .pcr-label-region { color: #ffa726; }
  .pcr-meta-prompt {
    margin: 4px 0 8px;
    font-size: 13px;
    line-height: 1.5;
    color: #d3d3d3;
    max-height: 200px;
    overflow-y: auto;
    word-wrap: break-word;
  }
  .pcr-text-neg { color: #888; }
  .pcr-viewer-meta-empty {
    color: #666;
    font-style: italic;
    font-size: 12px;
    padding: 20px 0;
    text-align: center;
  }

  /* toolbar */
  .pcr-viewer-toolbar {
    padding: 12px;
    border-bottom: 1px solid #222;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pcr-viewer-toolbar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  /* equal-height variant for button-only rows: labels that wrap to two lines
     (Open Folder / Copy Link) must not leave one-line siblings (Delete)
     shorter. Not on the base row class — stretching the zoom row top-aligns
     the range input's track. */
  .pcr-viewer-toolbar-row-equal { align-items: stretch; }
  .pcr-viewer-toolbar-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #222;
    border: 1px solid #333;
    border-radius: 4px;
    color: #ccc;
    font-size: 12px;
    cursor: pointer;
    flex: 1;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }
  .pcr-viewer-toolbar-btn:hover { background: #2a2a2a; }
  .pcr-viewer-toolbar-btn.active { background: rgba(79, 195, 247, 0.2); border-color: #4fc3f7; color: #4fc3f7; }
  /* current image carries a saved layer stack — a badge inside the Edit button */
  .pcr-viewer-edit-layers {
    display: inline-flex; align-items: center; gap: 3px;
    margin-left: 9px; padding: 2px 7px; border-radius: 10px;
    background: rgba(200, 89, 9, 0.2); color: #ffb27d;
    font-size: 11px; line-height: 1; font-weight: 600;
  }
  .pcr-viewer-edit-layers svg { flex: none; }
  /* lineage thumbnail hover flyout — fixed (escapes the strip's overflow),
     left-pointing arrow at the thumbnail, instant */
  .pcr-viewer-tip {
    position: fixed; transform: translateY(-50%);
    z-index: 10010; pointer-events: none;
    background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 6px;
    padding: 8px 11px; font-size: 12px; color: #b8b8b8; line-height: 1.5;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55); white-space: nowrap;
    animation: pcr-tip-in 0.09s ease-out;
  }
  @keyframes pcr-tip-in { from { opacity: 0; transform: translate(-4px, -50%); } to { opacity: 1; transform: translate(0, -50%); } }
  .pcr-viewer-tip::before {
    content: ""; position: absolute; left: -6px; top: 50%; margin-top: -6px;
    border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-right: 6px solid #3a3a3a;
  }
  .pcr-viewer-tip::after {
    content: ""; position: absolute; left: -5px; top: 50%; margin-top: -5px;
    border-top: 5px solid transparent; border-bottom: 5px solid transparent; border-right: 5px solid #1c1c1c;
  }
  .pcr-viewer-tip-name { color: #fff; font-weight: 500; }
  .pcr-viewer-tip-layers { color: #ffb27d; margin-top: 2px; }
  .pcr-viewer-delete { color: #e74c3c; border-color: rgba(231, 76, 60, 0.3); }
  .pcr-viewer-delete:hover { background: rgba(231, 76, 60, 0.15); }
  .pcr-viewer-upscale-disabled { opacity: 0.4; cursor: default; }
  .pcr-viewer-upscale-disabled:hover { background: transparent; }

  /* zoom controls */
  .pcr-viewer-zoom-control { position: relative; }
  .pcr-viewer-zoom-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: #222;
    border: 1px solid #333;
    border-radius: 4px;
    color: #ccc;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .pcr-viewer-zoom-btn:hover { background: #2a2a2a; }
  .pcr-viewer-zoom-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: #222;
    border: 1px solid #333;
    border-radius: 4px;
    overflow: hidden;
    z-index: 100;
  }
  .pcr-viewer-zoom-preset {
    padding: 6px 12px;
    font-size: 12px;
    color: #ccc;
    cursor: pointer;
    transition: background 0.1s;
  }
  .pcr-viewer-zoom-preset:hover { background: #333; }
  .pcr-viewer-zoom-slider {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    background: #333;
    border-radius: 2px;
    cursor: pointer;
  }
  .pcr-viewer-zoom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #4fc3f7;
    cursor: pointer;
  }

  /* compare dropdown */
  .pcr-viewer-compare-container { position: relative; }
  .pcr-viewer-compare-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    max-height: 300px;
    overflow-y: auto;
    background: #252525;
    border: 1px solid #404040;
    border-radius: 6px;
    padding: 4px;
    z-index: 100;
  }
  .pcr-viewer-compare-dropdown-item {
    padding: 6px 10px;
    font-size: 12px;
    color: #ccc;
    cursor: pointer;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.1s;
  }
  .pcr-viewer-compare-dropdown-item:hover { background: rgba(255, 255, 255, 0.1); }
  .pcr-viewer-compare-dropdown-item.active { color: #4fc3f7; background: rgba(79, 195, 247, 0.15); }
  .pcr-viewer-compare-clear { color: #f48fb1; }
  .pcr-viewer-compare-dropdown-divider {
    height: 1px;
    background: #333;
    margin: 4px 0;
  }

  /* compare overlay: after image */
  .pcr-viewer-after-image {
    position: absolute;
    z-index: 1;
  }

  /* compare slider */
  .pcr-viewer-compare-slider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    background: transparent;
    cursor: ew-resize;
    z-index: 20;
    transform: translateX(-50%);
  }
  .pcr-viewer-compare-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .pcr-viewer-compare-line {
    width: 2px;
    flex: 1;
    background: white;
    opacity: 0.8;
  }
  .pcr-viewer-compare-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #333;
    flex-shrink: 0;
  }

  /* compare labels */
  .pcr-viewer-compare-label {
    position: absolute;
    top: 16px;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.7);
    font-size: 12px;
    border-radius: 4px;
    z-index: 25;
  }
  .pcr-viewer-compare-label-before { left: 16px; color: rgb(96, 206, 255); }
  .pcr-viewer-compare-label-after { right: 16px; color: rgb(255, 221, 114); text-align: right; }
  .pcr-viewer-compare-label-age {
    font-size: 10px;
    opacity: 0.75;
    margin-top: 2px;
  }
</style>
