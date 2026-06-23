import { d as delegate, p as push, a as prop, u as user_effect, i as if_block, g as get, o as bind_this, t as template_effect, k as append, l as pop, m as user_derived, n as child, v as first_child, f as sibling, j as delegated, r as event, A as from_html, s as state, y as set_text, w as each, h as set_class, z as index, e as set, c as proxy, C as tick, x as set_attribute, D as comment } from "./disclose-version-uq4tn5Y6.js";
import { s as set_style } from "./style-Boi27oOu.js";
import { app } from "/scripts/app.js";
import { j as justifiedLayout } from "./justified-layout-cyVM7i96.js";
import { a as action } from "./actions-WPfqiWYB.js";
import { p as portal, C as ConfirmModal } from "./ConfirmModal-BGcVYndw.js";
const GALLERY_ROW_HEIGHT_MIN = 40;
const GALLERY_ROW_HEIGHT_MAX = 400;
const ZOOM_FACTOR = 1.15;
function clampGalleryRowHeight(value) {
  return Math.max(GALLERY_ROW_HEIGHT_MIN, Math.min(GALLERY_ROW_HEIGHT_MAX, value));
}
function zoomGalleryRowHeight(current, direction) {
  if (!direction) return clampGalleryRowHeight(current);
  const next = direction > 0 ? current * ZOOM_FACTOR : current / ZOOM_FACTOR;
  return clampGalleryRowHeight(Math.round(next));
}
var root_2$1 = from_html(`<button class="pcr-ctx-item svelte-1ycwk4w"> </button> <button class="pcr-ctx-item pcr-ctx-danger svelte-1ycwk4w"> </button>`, 1);
var root_3$1 = from_html(`<button class="pcr-ctx-item svelte-1ycwk4w">Remove from History</button> <button class="pcr-ctx-item pcr-ctx-danger svelte-1ycwk4w">Delete File</button>`, 1);
var root_1$1 = from_html(`<button class="pcr-ctx-item svelte-1ycwk4w">Open in Viewer</button> <div class="pcr-ctx-sep svelte-1ycwk4w"></div> <!>`, 1);
var root_7$1 = from_html(`<span class="pcr-ctx-check svelte-1ycwk4w">&#10003;</span>`);
var root_6$1 = from_html(`<button> <!></button>`);
var root_5$1 = from_html(`<div class="pcr-ctx-sub svelte-1ycwk4w"></div>`);
var root_4$1 = from_html(`<div class="pcr-ctx-sub-wrap svelte-1ycwk4w"><button class="pcr-ctx-item pcr-ctx-has-sub svelte-1ycwk4w"><svg class="pcr-ctx-icon svelte-1ycwk4w" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg> View <span class="pcr-ctx-chevron svelte-1ycwk4w">&#9656;</span></button> <!></div> <div class="pcr-ctx-sep svelte-1ycwk4w"></div> <button class="pcr-ctx-item svelte-1ycwk4w">Refresh</button> <button class="pcr-ctx-item pcr-ctx-danger svelte-1ycwk4w">Clear History</button>`, 1);
var root$1 = from_html(`<div class="pcr-ctx svelte-1ycwk4w"><!></div>`);
function GalleryContextMenu($$anchor, $$props) {
  push($$props, true);
  let selectionCount = prop($$props, "selectionCount", 3, 0);
  let menuEl;
  let openSub = state(null);
  let isItemMenu = user_derived(() => !!$$props.targetItem);
  const VIEW_MODES = [
    { id: "justified", label: "Justified" },
    { id: "grid", label: "Grid" },
    { id: "list", label: "List" }
  ];
  function act(action2) {
    var _a, _b;
    (_a = $$props.onAction) == null ? void 0 : _a.call($$props, action2);
    (_b = $$props.onClose) == null ? void 0 : _b.call($$props);
  }
  let pos = user_derived(() => (() => {
    const mw = 180, mh = 300;
    const vw = window.innerWidth, vh = window.innerHeight;
    return {
      left: Math.min($$props.x, vw - mw - 8),
      top: Math.min($$props.y, vh - mh - 8)
    };
  })());
  user_effect(() => {
    function onClick(e) {
      var _a;
      if (menuEl && !menuEl.contains(e.target)) (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
    }
    function onKey(e) {
      var _a;
      if (e.key === "Escape") (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
    }
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  });
  var div = root$1();
  var node = child(div);
  {
    var consequent_1 = ($$anchor2) => {
      var fragment = root_1$1();
      var button = first_child(fragment);
      var node_1 = sibling(button, 4);
      {
        var consequent = ($$anchor3) => {
          var fragment_1 = root_2$1();
          var button_1 = first_child(fragment_1);
          var text = child(button_1);
          var button_2 = sibling(button_1, 2);
          var text_1 = child(button_2);
          template_effect(() => {
            set_text(text, `Remove ${selectionCount() ?? ""} from History`);
            set_text(text_1, `Delete ${selectionCount() ?? ""} Files`);
          });
          delegated("click", button_1, () => act("detach"));
          delegated("click", button_2, () => act("delete"));
          append($$anchor3, fragment_1);
        };
        var alternate = ($$anchor3) => {
          var fragment_2 = root_3$1();
          var button_3 = first_child(fragment_2);
          var button_4 = sibling(button_3, 2);
          delegated("click", button_3, () => act("detach"));
          delegated("click", button_4, () => act("delete"));
          append($$anchor3, fragment_2);
        };
        if_block(node_1, ($$render) => {
          if (selectionCount() > 1) $$render(consequent);
          else $$render(alternate, -1);
        });
      }
      delegated("click", button, () => act("open"));
      append($$anchor2, fragment);
    };
    var alternate_1 = ($$anchor2) => {
      var fragment_3 = root_4$1();
      var div_1 = first_child(fragment_3);
      var node_2 = sibling(child(div_1), 2);
      {
        var consequent_3 = ($$anchor3) => {
          var div_2 = root_5$1();
          each(div_2, 21, () => VIEW_MODES, index, ($$anchor4, vm) => {
            var button_5 = root_6$1();
            let classes;
            var text_2 = child(button_5);
            var node_3 = sibling(text_2);
            {
              var consequent_2 = ($$anchor5) => {
                var span = root_7$1();
                append($$anchor5, span);
              };
              if_block(node_3, ($$render) => {
                if ($$props.viewMode === get(vm).id) $$render(consequent_2);
              });
            }
            template_effect(() => {
              classes = set_class(button_5, 1, "pcr-ctx-item svelte-1ycwk4w", null, classes, { active: $$props.viewMode === get(vm).id });
              set_text(text_2, `${get(vm).label ?? ""} `);
            });
            delegated("click", button_5, () => act("view:" + get(vm).id));
            append($$anchor4, button_5);
          });
          append($$anchor3, div_2);
        };
        if_block(node_2, ($$render) => {
          if (get(openSub) === "view") $$render(consequent_3);
        });
      }
      var button_6 = sibling(div_1, 4);
      var button_7 = sibling(button_6, 2);
      event("mouseenter", div_1, () => set(openSub, "view"));
      event("mouseleave", div_1, () => {
        if (get(openSub) === "view") set(openSub, null);
      });
      delegated("click", button_6, () => act("refresh"));
      delegated("click", button_7, () => act("clear"));
      append($$anchor2, fragment_3);
    };
    if_block(node, ($$render) => {
      if (get(isItemMenu)) $$render(consequent_1);
      else $$render(alternate_1, -1);
    });
  }
  action(div, ($$node) => {
    var _a;
    return (_a = portal) == null ? void 0 : _a($$node);
  });
  bind_this(div, ($$value) => menuEl = $$value, () => menuEl);
  template_effect(() => set_style(div, `left:${get(pos).left ?? ""}px;top:${get(pos).top ?? ""}px;`));
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_1 = from_html(`<div class="pcr-gal-empty svelte-dvv32x">No images yet</div>`);
var root_4 = from_html(`<span class="pcr-gal-lvers svelte-dvv32x" title="opens layered in Edit"> </span>`);
var root_5 = from_html(`<span class="pcr-gal-lvers svelte-dvv32x"> </span>`);
var root_3 = from_html(`<button><img class="pcr-gal-lthumb svelte-dvv32x" alt="" loading="lazy"/> <span class="pcr-gal-lname svelte-dvv32x"> </span> <!> <!> <span class="pcr-gal-lmeta svelte-dvv32x"> </span></button>`);
var root_2 = from_html(`<div class="pcr-gal-list svelte-dvv32x"></div>`);
var root_8 = from_html(`<div class="pcr-gal-vers svelte-dvv32x"> </div>`);
var root_9 = from_html(`<div class="pcr-gal-layers svelte-dvv32x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="svelte-dvv32x"><path d="M12 2 2 7l10 5 10-5-10-5Z"></path><path d="m2 17 10 5 10-5"></path><path d="m2 12 10 5 10-5"></path></svg></div>`);
var root_10 = from_html(`<div class="pcr-gal-check svelte-dvv32x"></div>`);
var root_7 = from_html(`<div role="button" tabindex="0"><img loading="lazy" draggable="false" class="svelte-dvv32x"/> <!> <!> <!></div>`);
var root_6 = from_html(`<div class="pcr-gal-grid svelte-dvv32x"></div>`);
var root_14 = from_html(`<div class="pcr-gal-vers svelte-dvv32x"> </div>`);
var root_15 = from_html(`<div class="pcr-gal-layers svelte-dvv32x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="svelte-dvv32x"><path d="M12 2 2 7l10 5 10-5-10-5Z"></path><path d="m2 17 10 5 10-5"></path><path d="m2 12 10 5 10-5"></path></svg></div>`);
var root_16 = from_html(`<div class="pcr-gal-check svelte-dvv32x"></div>`);
var root_13 = from_html(`<div role="button" tabindex="0"><img loading="lazy" draggable="false" class="svelte-dvv32x"/> <!> <!> <!></div>`);
var root_11 = from_html(`<div class="pcr-gal-justified svelte-dvv32x"></div>`);
var root = from_html(`<div class="pcr-gal svelte-dvv32x" tabindex="-1"><!> <!></div> <!>`, 1);
function GeneratedGallery($$anchor, $$props) {
  var _a, _b, _c, _d;
  push($$props, true);
  let images = prop($$props, "images", 19, () => []), workflowId = prop($$props, "workflowId", 3, ""), viewMode = prop($$props, "viewMode", 3, "justified"), rowHeight = prop($$props, "rowHeight", 3, 120), apiURL = prop($$props, "apiURL", 3, (p) => p), fetchApi = prop($$props, "fetchApi", 3, null);
  prop($$props, "toast", 3, null);
  let selected = state(proxy(/* @__PURE__ */ new Set()));
  let anchor = state(null);
  let editDocLayers = state(proxy({}));
  function refreshEditDocs() {
    if (!fetchApi()) return;
    fetchApi()("/promptchain/edit-docs").then((r) => r.ok ? r.json() : null).then((d) => {
      set(editDocLayers, (d == null ? void 0 : d.docs) || {}, true);
    }).catch(() => {
    });
  }
  user_effect(() => {
    if (fetchApi()) refreshEditDocs();
    const onSaved = () => refreshEditDocs();
    window.addEventListener("promptchain:edit-docs-changed", onSaved);
    return () => window.removeEventListener("promptchain:edit-docs-changed", onSaved);
  });
  let allVisible = user_derived(() => images().filter((i) => !i.orphaned));
  let lineageView = state(proxy(((_d = (_c = (_b = (_a = app) == null ? void 0 : _a.ui) == null ? void 0 : _b.settings) == null ? void 0 : _c.getSettingValue) == null ? void 0 : _d.call(_c, "PromptChain.LineageView")) ?? true));
  user_effect(() => {
    const onToggle = (e) => {
      var _a2;
      set(lineageView, ((_a2 = e.detail) == null ? void 0 : _a2.value) !== false);
    };
    window.addEventListener("promptchain:lineage-view-changed", onToggle);
    return () => window.removeEventListener("promptchain:lineage-view-changed", onToggle);
  });
  let lineageFamilies = user_derived(() => (() => {
    if (!get(lineageView)) return null;
    const parentOf = new Map(images().map((i) => [i.hash, i.parent_hash || null]));
    const ancestorsOf = (hash) => {
      const chain = [];
      const seen = /* @__PURE__ */ new Set([hash]);
      let cur = parentOf.get(hash);
      while (cur && !seen.has(cur)) {
        chain.push(cur);
        seen.add(cur);
        cur = parentOf.get(cur);
      }
      return chain;
    };
    const absorbed = /* @__PURE__ */ new Set();
    for (const img of get(allVisible)) {
      for (const h of ancestorsOf(img.hash)) absorbed.add(h);
    }
    const visible = new Set(get(allVisible).map((i) => i.hash));
    const reps = [];
    const counts = /* @__PURE__ */ new Map();
    for (const img of get(allVisible)) {
      if (absorbed.has(img.hash)) continue;
      reps.push(img);
      counts.set(img.hash, 1 + ancestorsOf(img.hash).filter((h) => visible.has(h)).length);
    }
    return { reps, counts };
  })());
  let visibleImages = user_derived(() => get(lineageFamilies) ? get(lineageFamilies).reps : get(allVisible));
  let versionCounts = user_derived(() => {
    var _a2;
    return ((_a2 = get(lineageFamilies)) == null ? void 0 : _a2.counts) ?? null;
  });
  function versionsOf(img) {
    var _a2;
    return ((_a2 = get(versionCounts)) == null ? void 0 : _a2.get(img.hash)) ?? 0;
  }
  let cursorHash = state(null);
  let cursorIdx = user_derived(() => get(cursorHash) ? get(visibleImages).findIndex((i) => i.hash === get(cursorHash)) : -1);
  function selectItem(hash) {
    set(selected, /* @__PURE__ */ new Set([hash]), true);
    set(anchor, hash, true);
  }
  function toggleItem(hash) {
    const next = new Set(get(selected));
    next.has(hash) ? next.delete(hash) : next.add(hash);
    set(selected, next, true);
    if (next.has(hash)) set(anchor, hash, true);
  }
  function clearSelection() {
    set(selected, /* @__PURE__ */ new Set(), true);
    set(anchor, null);
    set(cursorHash, null);
  }
  user_effect(() => {
    var _a2;
    const n = get(visibleImages).length;
    (_a2 = $$props.onCountChange) == null ? void 0 : _a2.call($$props, n);
  });
  let ctxMenu = state(null);
  let confirmOpen = state(false);
  let confirmMsg = state("");
  let confirmHashes = [];
  function requestDelete(hashes) {
    if (!hashes.length) return;
    confirmHashes = hashes;
    if (hashes.length === 1) {
      const img = get(visibleImages).find((i) => i.hash === hashes[0]);
      const name = (img == null ? void 0 : img.filename) ?? "image";
      set(confirmMsg, `Delete "${name}"?`);
    } else {
      set(confirmMsg, `Delete ${hashes.length} items?`);
    }
    set(confirmOpen, true);
  }
  function executeDelete() {
    var _a2;
    set(confirmOpen, false);
    const hashes = confirmHashes;
    confirmHashes = [];
    if (hashes.length) {
      (_a2 = $$props.onDeleteFiles) == null ? void 0 : _a2.call($$props, hashes);
      clearSelection();
    }
    galleryEl == null ? void 0 : galleryEl.focus();
  }
  function cancelDelete() {
    set(confirmOpen, false);
    confirmHashes = [];
    galleryEl == null ? void 0 : galleryEl.focus();
  }
  let suppressClick = false;
  function handleItemClick(img, idx, event2) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    galleryEl == null ? void 0 : galleryEl.focus();
    set(cursorHash, img.hash, true);
    if (event2.ctrlKey || event2.metaKey) {
      toggleItem(img.hash);
      return;
    }
    if (event2.shiftKey && get(anchor)) {
      const ai = get(visibleImages).findIndex((i) => i.hash === get(anchor));
      if (ai >= 0) {
        const lo = Math.min(ai, idx), hi = Math.max(ai, idx);
        set(selected, new Set(get(visibleImages).slice(lo, hi + 1).map((i) => i.hash)), true);
        return;
      }
    }
    clearSelection();
    openInViewer(img);
  }
  function handleItemDblClick(img) {
    openInViewer(img);
  }
  function openInViewer(img) {
    var _a2;
    const list = get(lineageFamilies) ? get(visibleImages) : images();
    const idx = list.indexOf(img);
    (_a2 = $$props.onOpenViewer) == null ? void 0 : _a2.call($$props, list, idx >= 0 ? idx : 0, workflowId());
  }
  function handleItemContext(img, idx, event2) {
    event2.preventDefault();
    event2.stopPropagation();
    galleryEl == null ? void 0 : galleryEl.focus();
    set(cursorHash, img.hash, true);
    if (!get(selected).has(img.hash)) selectItem(img.hash);
    set(ctxMenu, { x: event2.clientX, y: event2.clientY, item: img }, true);
  }
  function handleBgContext(event2) {
    event2.preventDefault();
    clearSelection();
    set(ctxMenu, { x: event2.clientX, y: event2.clientY, item: null }, true);
  }
  function handleBgClick(event2) {
    if (!event2.target.closest("[data-hash]")) clearSelection();
    galleryEl == null ? void 0 : galleryEl.focus();
  }
  function getSelectedHashes() {
    var _a2;
    const hashes = [...get(selected)];
    if (!hashes.length && ((_a2 = get(ctxMenu)) == null ? void 0 : _a2.item)) hashes.push(get(ctxMenu).item.hash);
    return hashes;
  }
  async function handleCtxAction(action2) {
    var _a2, _b2, _c2, _d2, _e, _f;
    if (action2 === "open") {
      const img = (_a2 = get(ctxMenu)) == null ? void 0 : _a2.item;
      if (img) openInViewer(img);
    } else if (action2 === "detach") {
      const hashes = getSelectedHashes();
      if (hashes.length) {
        (_b2 = $$props.onDeleteImages) == null ? void 0 : _b2.call($$props, hashes);
        clearSelection();
      }
    } else if (action2 === "delete") {
      const hashes = getSelectedHashes();
      if (hashes.length) {
        (_c2 = $$props.onDeleteFiles) == null ? void 0 : _c2.call($$props, hashes);
        clearSelection();
      }
    } else if (action2 === "refresh") {
      (_d2 = $$props.onClearHistory) == null ? void 0 : _d2.call($$props, "refresh");
    } else if (action2 === "clear") {
      (_e = $$props.onClearHistory) == null ? void 0 : _e.call($$props, "clear");
    } else if (action2.startsWith("view:")) {
      (_f = $$props.onViewModeChange) == null ? void 0 : _f.call($$props, action2.slice(5));
    }
  }
  let galleryEl;
  function handleKeydown(event2) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event2.key) && get(visibleImages).length > 0) {
      event2.preventDefault();
      event2.stopPropagation();
      const cols = viewMode() === "list" ? 1 : getColumns();
      const curIdx = get(cursorIdx);
      let next = curIdx;
      if (curIdx < 0) {
        next = 0;
      } else if (event2.key === "ArrowDown") next = curIdx + cols;
      else if (event2.key === "ArrowUp") next = curIdx - cols;
      else if (event2.key === "ArrowRight") next = curIdx + 1;
      else next = curIdx - 1;
      next = Math.max(0, Math.min(next, get(visibleImages).length - 1));
      const img = get(visibleImages)[next];
      set(cursorHash, img.hash, true);
      if (event2.shiftKey) {
        if (!get(anchor)) set(anchor, img.hash, true);
        const ai = get(visibleImages).findIndex((i) => i.hash === get(anchor));
        const lo = Math.min(ai, next), hi = Math.max(ai, next);
        set(selected, new Set(get(visibleImages).slice(lo, hi + 1).map((i) => i.hash)), true);
      } else if (!event2.ctrlKey) {
        selectItem(img.hash);
      }
      scrollIntoView(img.hash);
    }
    if (event2.key === " " && get(cursorIdx) >= 0) {
      event2.preventDefault();
      toggleItem(get(visibleImages)[get(cursorIdx)].hash);
    }
    if (event2.key === "Enter" && get(cursorIdx) >= 0) {
      openInViewer(get(visibleImages)[get(cursorIdx)]);
    }
    if (event2.key === "Escape") {
      if (get(ctxMenu)) set(ctxMenu, null);
      else clearSelection();
    }
    if (event2.key === "Delete" && get(selected).size > 0) {
      event2.preventDefault();
      requestDelete([...get(selected)]);
    }
    if ((event2.ctrlKey || event2.metaKey) && event2.key === "a") {
      event2.preventDefault();
      set(selected, new Set(get(visibleImages).map((i) => i.hash)), true);
    }
  }
  function getColumns() {
    if (!galleryEl) return 1;
    if (viewMode() === "grid") {
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
    var _a2;
    (_a2 = galleryEl == null ? void 0 : galleryEl.querySelector(`[data-hash="${CSS.escape(hash)}"]`)) == null ? void 0 : _a2.scrollIntoView({ block: "nearest" });
  }
  user_effect(() => {
    if (!galleryEl) return;
    function onWheel(e) {
      var _a2;
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const newH = zoomGalleryRowHeight(rowHeight(), e.deltaY > 0 ? -1 : 1);
      if (newH !== rowHeight()) (_a2 = $$props.onRowHeightChange) == null ? void 0 : _a2.call($$props, newH);
    }
    galleryEl.addEventListener("wheel", onWheel, { passive: false });
    return () => galleryEl.removeEventListener("wheel", onWheel);
  });
  let wrapEl = state(null);
  let layoutBoxes = state(proxy([]));
  let layoutHeight = state(0);
  function reLayout() {
    if (viewMode() !== "justified" || !get(wrapEl)) {
      set(layoutBoxes, [], true);
      set(layoutHeight, 0);
      return;
    }
    const containerWidth = get(wrapEl).clientWidth;
    if (containerWidth <= 0) return;
    const aspects = get(visibleImages).map((i) => i.width && i.height ? i.width / i.height : 1);
    const result = justifiedLayout(aspects, {
      containerWidth,
      targetRowHeight: rowHeight(),
      // Row heights only move when the row partitioning changes, so the
      // default 0.25 tolerance swallows several zoom steps in a row at
      // larger sizes. 0.1 keeps every ~15% rowHeight step visible.
      targetRowHeightTolerance: 0.1,
      boxSpacing: 4,
      containerPadding: 4
    });
    set(layoutBoxes, result.boxes || [], true);
    set(layoutHeight, result.containerHeight || 0, true);
  }
  user_effect(() => {
    [viewMode(), rowHeight(), get(visibleImages), get(wrapEl)];
    tick().then(() => {
      if (get(wrapEl)) reLayout();
    });
  });
  user_effect(() => {
    if (!get(wrapEl)) return;
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      const w = get(wrapEl).offsetWidth;
      if (w > 0 && w !== lastW) {
        lastW = w;
        reLayout();
      }
    });
    ro.observe(get(wrapEl));
    return () => ro.disconnect();
  });
  function thumbUrl(hash) {
    return apiURL()(`/promptchain/thumb/${hash}`);
  }
  function retryThumb(e) {
    const img = e.currentTarget;
    const n = +img.dataset.pcrRetry || 0;
    if (n >= 3) return;
    img.dataset.pcrRetry = String(n + 1);
    const u = new URL(img.src, location.href);
    u.searchParams.set("r", String(n + 1));
    img.src = u.toString();
  }
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
  user_effect(() => {
    const onRecorded = () => healBrokenThumbs();
    window.addEventListener("promptchain:generation-recorded", onRecorded);
    return () => window.removeEventListener("promptchain:generation-recorded", onRecorded);
  });
  var fragment = root();
  var div = first_child(fragment);
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1();
      append($$anchor2, div_1);
    };
    var consequent_3 = ($$anchor2) => {
      var div_2 = root_2();
      each(div_2, 23, () => get(visibleImages), (img) => img.hash, ($$anchor3, img, idx) => {
        const sel = user_derived(() => get(selected).has(get(img).hash));
        const cur = user_derived(() => get(cursorIdx) === get(idx));
        var button = root_3();
        let classes;
        var img_1 = child(button);
        var span = sibling(img_1, 2);
        var text = child(span);
        var node_1 = sibling(span, 2);
        {
          var consequent_1 = ($$anchor4) => {
            var span_1 = root_4();
            var text_1 = child(span_1);
            template_effect(() => set_text(text_1, `▦ ${get(editDocLayers)[get(img).hash] ?? ""} layers`));
            append($$anchor4, span_1);
          };
          if_block(node_1, ($$render) => {
            if (get(editDocLayers)[get(img).hash]) $$render(consequent_1);
          });
        }
        var node_2 = sibling(node_1, 2);
        {
          var consequent_2 = ($$anchor4) => {
            var span_2 = root_5();
            var text_2 = child(span_2);
            template_effect(($0) => set_text(text_2, `${$0 ?? ""} versions`), [() => versionsOf(get(img))]);
            append($$anchor4, span_2);
          };
          var d_1 = user_derived(() => versionsOf(get(img)) > 1);
          if_block(node_2, ($$render) => {
            if (get(d_1)) $$render(consequent_2);
          });
        }
        var span_3 = sibling(node_2, 2);
        var text_3 = child(span_3);
        template_effect(
          ($0) => {
            classes = set_class(button, 1, "pcr-gal-lrow svelte-dvv32x", null, classes, { selected: get(sel), focused: get(cur) });
            set_attribute(button, "data-hash", get(img).hash);
            set_attribute(img_1, "src", $0);
            set_text(text, get(img).filename);
            set_text(text_3, `${get(img).width ?? ""}×${get(img).height ?? ""}`);
          },
          [() => thumbUrl(get(img).hash)]
        );
        delegated("click", button, (e) => handleItemClick(get(img), get(idx), e));
        delegated("dblclick", button, () => handleItemDblClick(get(img)));
        delegated("contextmenu", button, (e) => handleItemContext(get(img), get(idx), e));
        event("error", img_1, retryThumb);
        append($$anchor3, button);
      });
      append($$anchor2, div_2);
    };
    var consequent_7 = ($$anchor2) => {
      var div_3 = root_6();
      each(div_3, 23, () => get(visibleImages), (img) => img.hash, ($$anchor3, img, idx) => {
        const sel = user_derived(() => get(selected).has(get(img).hash));
        const cur = user_derived(() => get(cursorIdx) === get(idx));
        var div_4 = root_7();
        let classes_1;
        var img_2 = child(div_4);
        var node_3 = sibling(img_2, 2);
        {
          var consequent_4 = ($$anchor4) => {
            var div_5 = root_8();
            var text_4 = child(div_5);
            template_effect(
              ($0, $1) => {
                set_attribute(div_5, "title", `${$0 ?? ""} versions`);
                set_text(text_4, $1);
              },
              [() => versionsOf(get(img)), () => versionsOf(get(img))]
            );
            append($$anchor4, div_5);
          };
          var d_2 = user_derived(() => versionsOf(get(img)) > 1);
          if_block(node_3, ($$render) => {
            if (get(d_2)) $$render(consequent_4);
          });
        }
        var node_4 = sibling(node_3, 2);
        {
          var consequent_5 = ($$anchor4) => {
            var div_6 = root_9();
            template_effect(() => set_attribute(div_6, "title", `${get(editDocLayers)[get(img).hash] ?? ""} layers — opens layered in Edit`));
            append($$anchor4, div_6);
          };
          if_block(node_4, ($$render) => {
            if (get(editDocLayers)[get(img).hash]) $$render(consequent_5);
          });
        }
        var node_5 = sibling(node_4, 2);
        {
          var consequent_6 = ($$anchor4) => {
            var div_7 = root_10();
            append($$anchor4, div_7);
          };
          if_block(node_5, ($$render) => {
            if (get(sel)) $$render(consequent_6);
          });
        }
        template_effect(
          ($0) => {
            classes_1 = set_class(div_4, 1, "pcr-gal-gitem svelte-dvv32x", null, classes_1, { selected: get(sel), focused: get(cur) });
            set_attribute(div_4, "data-hash", get(img).hash);
            set_attribute(img_2, "src", $0);
            set_attribute(img_2, "alt", get(img).filename);
          },
          [() => thumbUrl(get(img).hash)]
        );
        delegated("click", div_4, (e) => handleItemClick(get(img), get(idx), e));
        delegated("dblclick", div_4, () => handleItemDblClick(get(img)));
        delegated("contextmenu", div_4, (e) => handleItemContext(get(img), get(idx), e));
        event("error", img_2, retryThumb);
        append($$anchor3, div_4);
      });
      template_effect(() => set_style(div_3, `--gal-size:${rowHeight() ?? ""}px;`));
      append($$anchor2, div_3);
    };
    var alternate = ($$anchor2) => {
      var div_8 = root_11();
      each(div_8, 23, () => get(visibleImages), (img) => img.hash, ($$anchor3, img, idx) => {
        var fragment_1 = comment();
        var node_6 = first_child(fragment_1);
        {
          var consequent_11 = ($$anchor4) => {
            const box = user_derived(() => get(layoutBoxes)[get(idx)]);
            const sel = user_derived(() => get(selected).has(get(img).hash));
            const cur = user_derived(() => get(cursorIdx) === get(idx));
            var div_9 = root_13();
            let classes_2;
            var img_3 = child(div_9);
            var node_7 = sibling(img_3, 2);
            {
              var consequent_8 = ($$anchor5) => {
                var div_10 = root_14();
                var text_5 = child(div_10);
                template_effect(
                  ($0, $1) => {
                    set_attribute(div_10, "title", `${$0 ?? ""} versions`);
                    set_text(text_5, $1);
                  },
                  [() => versionsOf(get(img)), () => versionsOf(get(img))]
                );
                append($$anchor5, div_10);
              };
              var d_3 = user_derived(() => versionsOf(get(img)) > 1);
              if_block(node_7, ($$render) => {
                if (get(d_3)) $$render(consequent_8);
              });
            }
            var node_8 = sibling(node_7, 2);
            {
              var consequent_9 = ($$anchor5) => {
                var div_11 = root_15();
                template_effect(() => set_attribute(div_11, "title", `${get(editDocLayers)[get(img).hash] ?? ""} layers — opens layered in Edit`));
                append($$anchor5, div_11);
              };
              if_block(node_8, ($$render) => {
                if (get(editDocLayers)[get(img).hash]) $$render(consequent_9);
              });
            }
            var node_9 = sibling(node_8, 2);
            {
              var consequent_10 = ($$anchor5) => {
                var div_12 = root_16();
                append($$anchor5, div_12);
              };
              if_block(node_9, ($$render) => {
                if (get(sel)) $$render(consequent_10);
              });
            }
            template_effect(
              ($0) => {
                classes_2 = set_class(div_9, 1, "pcr-gal-jitem svelte-dvv32x", null, classes_2, { selected: get(sel), focused: get(cur) });
                set_attribute(div_9, "data-hash", get(img).hash);
                set_style(div_9, `left:${get(box).left ?? ""}px;top:${get(box).top ?? ""}px;width:${get(box).width ?? ""}px;height:${get(box).height ?? ""}px;`);
                set_attribute(img_3, "src", $0);
                set_attribute(img_3, "alt", get(img).filename);
              },
              [() => thumbUrl(get(img).hash)]
            );
            delegated("click", div_9, (e) => handleItemClick(get(img), get(idx), e));
            delegated("dblclick", div_9, () => handleItemDblClick(get(img)));
            delegated("contextmenu", div_9, (e) => handleItemContext(get(img), get(idx), e));
            event("error", img_3, retryThumb);
            append($$anchor4, div_9);
          };
          if_block(node_6, ($$render) => {
            if (get(layoutBoxes)[get(idx)]) $$render(consequent_11);
          });
        }
        append($$anchor3, fragment_1);
      });
      bind_this(div_8, ($$value) => set(wrapEl, $$value), () => get(wrapEl));
      template_effect(() => set_style(div_8, `height:${get(layoutHeight) ?? ""}px;`));
      append($$anchor2, div_8);
    };
    if_block(node, ($$render) => {
      if (get(visibleImages).length === 0) $$render(consequent);
      else if (viewMode() === "list") $$render(consequent_3, 1);
      else if (viewMode() === "grid") $$render(consequent_7, 2);
      else $$render(alternate, -1);
    });
  }
  var node_10 = sibling(node, 2);
  {
    var consequent_12 = ($$anchor2) => {
      GalleryContextMenu($$anchor2, {
        get x() {
          return get(ctxMenu).x;
        },
        get y() {
          return get(ctxMenu).y;
        },
        get targetItem() {
          return get(ctxMenu).item;
        },
        get viewMode() {
          return viewMode();
        },
        get selectionCount() {
          return get(selected).size;
        },
        onAction: handleCtxAction,
        onClose: () => {
          set(ctxMenu, null);
          suppressClick = true;
        }
      });
    };
    if_block(node_10, ($$render) => {
      if (get(ctxMenu)) $$render(consequent_12);
    });
  }
  bind_this(div, ($$value) => galleryEl = $$value, () => galleryEl);
  var node_11 = sibling(div, 2);
  ConfirmModal(node_11, {
    get open() {
      return get(confirmOpen);
    },
    title: "Delete",
    get message() {
      return get(confirmMsg);
    },
    confirmLabel: "Delete",
    onConfirm: executeDelete,
    onCancel: cancelDelete
  });
  delegated("click", div, handleBgClick);
  delegated("contextmenu", div, handleBgContext);
  delegated("keydown", div, handleKeydown);
  append($$anchor, fragment);
  pop();
}
delegate(["click", "contextmenu", "keydown", "dblclick"]);
export {
  GeneratedGallery as G,
  clampGalleryRowHeight as c,
  zoomGalleryRowHeight as z
};
//# sourceMappingURL=GeneratedGallery-D5XbkMk7.js.map
