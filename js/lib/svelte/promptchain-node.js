var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var _mode, _switchIndex, _locked, _disabled, _collapsed, _connectedCount, _hasLabels, _switchLabel, _iterateCurrent, _iterateTotal, _iterateCycle, _switchOptions, _outputPanelOpen, _imagePanelVisible, _aiAssistantOpen, _posePanelVisible, _regionPanelVisible, _hasPoseStudio, _hasRegionBox, _compiledOutput, _compiledNegOutput, _compiledRegions, _imageUrl, _previewUrl, _progress, _isGenerating, _rollSelected;
import { p as push, o as bind_this, k as append, l as pop, A as from_html, d as delegate, a as prop, g as get, j as delegated, m as user_derived, s as state, c as proxy, u as user_effect, i as if_block, f as sibling, r as event, e as set, C as tick, n as child, D as comment, v as first_child, w as each, t as template_effect, y as set_text, h as set_class, x as set_attribute, Q as clsx, z as index, R as text, E as untrack, M as unmount, L as mount } from "./disclose-version-et9wt-4m.js";
import { u as useApi, p as provideApi } from "./api-context-BNqvELYR.js";
import { M as Menubar } from "./Menubar-CMm15KuK.js";
import { o as onDestroy, a as onMount } from "./index-client-6amB1qrM.js";
import { s as set_style } from "./style-B3hsaAru.js";
import { h as html, P as PopupAnchor } from "./PopupAnchor-D5Lvfjom.js";
import { api } from "/scripts/api.js";
import { c as clampGalleryRowHeight, z as zoomGalleryRowHeight, G as GeneratedGallery } from "./GeneratedGallery-DgtlJz3l.js";
import { b as bind_value } from "./input-B9kD0bWJ.js";
import { app } from "/scripts/app.js";
import { r as readNodePrompt, c as cryptoId, e as extractNGrams, m as matchCharactersInDb, i as isStandaloneMainPromptChain, a as applyPromptText } from "./ai-patch-helpers-Bayqv0oF.js";
var root$d = from_html(`<div class="pcr-editor-frame"></div>`);
function EditorPane($$anchor, $$props) {
  push($$props, true);
  let editorContainer;
  function getContainer() {
    return editorContainer;
  }
  function setEditorView(view) {
  }
  var $$exports = { getContainer, setEditorView };
  var div = root$d();
  bind_this(div, ($$value) => editorContainer = $$value, () => editorContainer);
  append($$anchor, div);
  return pop($$exports);
}
var root$c = from_html(`<div class="pcr-output-panel-content pcr-scrollable svelte-qbaa69" tabindex="0"></div>`);
function PromptOutput($$anchor, $$props) {
  push($$props, true);
  let compiledOutput = prop($$props, "compiledOutput", 3, ""), compiledNegOutput = prop($$props, "compiledNegOutput", 3, ""), compiledRegions = prop(
    $$props,
    "compiledRegions",
    3,
    ""
    // JSON {global, regions:[{name,text}], negative} sent with the compile
  );
  const _HTML_ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  function escapeHtml(text2) {
    return String(text2).replace(/[&<>"']/g, (c) => _HTML_ESCAPES[c]);
  }
  let regional = user_derived(() => {
    if (!compiledRegions()) return null;
    try {
      const o = JSON.parse(compiledRegions());
      return o && Array.isArray(o.regions) && o.regions.length ? o : null;
    } catch {
      return null;
    }
  });
  let html$1 = user_derived(() => {
    if (!compiledOutput() && !compiledNegOutput() && !get(regional)) {
      return '<span class="pcr-output-panel-placeholder">Queue workflow to see prompt output</span>';
    }
    if (get(regional)) {
      const regEmpty = '<span class="pcr-output-panel-placeholder">(empty → uses global)</span>';
      let result2 = "";
      for (const reg of get(regional).regions) {
        const body = (reg.text || "").trim();
        result2 += `<span class="pcr-output-panel-label-region">$${escapeHtml(reg.name || "")}</span>
${body ? escapeHtml(body) : regEmpty}

`;
      }
      const g = (get(regional).global || "").trim();
      result2 += `<span class="pcr-output-panel-label-pos">Global:</span>
${g ? escapeHtml(g) : '<span class="pcr-output-panel-placeholder">(none)</span>'}`;
      const neg = get(regional).negative || compiledNegOutput();
      if (neg) result2 += `

<span class="pcr-output-panel-label-neg">Negative:</span>
${escapeHtml(neg)}`;
      return result2;
    }
    let result = `<span class="pcr-output-panel-label-pos">Positive:</span>
${escapeHtml(compiledOutput())}`;
    if (compiledNegOutput()) {
      result += `

<span class="pcr-output-panel-label-neg">Negative:</span>
${escapeHtml(compiledNegOutput())}`;
    }
    return result;
  });
  var div = root$c();
  html(div, () => get(html$1), true);
  delegated("pointerdown", div, (e) => e.stopPropagation());
  delegated("mousedown", div, (e) => e.stopPropagation());
  append($$anchor, div);
  pop();
}
delegate(["pointerdown", "mousedown"]);
var root_1$6 = from_html(`<span class="pcr-console-placeholder svelte-1ouufnb">No log entries</span>`);
var root_3$5 = from_html(`<div class="pcr-console-line svelte-1ouufnb"><span class="pcr-console-time svelte-1ouufnb"> </span> <span class="pcr-console-msg svelte-1ouufnb"> </span></div>`);
var root_4$6 = from_html(`<div class="pcr-console-scroll-btn svelte-1ouufnb"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"></path></svg></div>`);
var root$b = from_html(`<div class="pcr-console-log pcr-scrollable svelte-1ouufnb" tabindex="0"><!> <!></div>`);
function ConsoleLog($$anchor, $$props) {
  push($$props, true);
  let active = prop($$props, "active", 3, false);
  let containerEl;
  let entries = state(proxy([]));
  let pinToBottom = state(true);
  let subscribed = false;
  let _nextEntryId = 0;
  function formatTime(iso) {
    try {
      const d = new Date(iso);
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      const s = String(d.getSeconds()).padStart(2, "0");
      return `${h}:${m}:${s}`;
    } catch {
      return "";
    }
  }
  function stripAnsi(text2) {
    return text2.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  }
  function _tag(e) {
    return { ...e, _id: _nextEntryId++ };
  }
  async function fetchHistory() {
    var _a;
    try {
      const data = await api.getRawLogs();
      if ((_a = data.entries) == null ? void 0 : _a.length) {
        set(entries, data.entries.map(_tag), true);
        await tick();
        scrollToBottom();
      }
    } catch (e) {
      console.error("[PromptChain] log history fetch failed:", e);
    }
  }
  function onLogEvent(event2) {
    var _a;
    const incoming = (_a = event2.detail) == null ? void 0 : _a.entries;
    if (!(incoming == null ? void 0 : incoming.length)) return;
    set(entries, [...get(entries), ...incoming.map(_tag)], true);
    if (get(pinToBottom)) {
      tick().then(scrollToBottom);
    }
  }
  async function subscribe() {
    if (subscribed) return;
    subscribed = true;
    api.addEventListener("logs", onLogEvent);
    try {
      await api.subscribeLogs(true);
    } catch {
    }
  }
  async function unsubscribe() {
    if (!subscribed) return;
    subscribed = false;
    api.removeEventListener("logs", onLogEvent);
    try {
      await api.subscribeLogs(false);
    } catch {
    }
  }
  function scrollToBottom() {
    if (!containerEl) return;
    containerEl.scrollTop = containerEl.scrollHeight;
  }
  function handleScroll() {
    if (!containerEl) return;
    const atBottom = containerEl.scrollHeight - containerEl.scrollTop - containerEl.clientHeight < 30;
    set(pinToBottom, atBottom);
  }
  let initialized = false;
  user_effect(() => {
    if (active() && !initialized) {
      initialized = true;
      fetchHistory().then(subscribe);
    }
  });
  onDestroy(() => {
    unsubscribe();
  });
  var div = root$b();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var span = root_1$6();
      append($$anchor2, span);
    };
    var alternate = ($$anchor2) => {
      var fragment = comment();
      var node_1 = first_child(fragment);
      each(node_1, 17, () => get(entries), (entry) => entry._id, ($$anchor3, entry) => {
        var div_1 = root_3$5();
        var span_1 = child(div_1);
        var text_1 = child(span_1);
        var span_2 = sibling(span_1, 2);
        var text_2 = child(span_2);
        template_effect(
          ($0, $1) => {
            set_text(text_1, $0);
            set_text(text_2, $1);
          },
          [
            () => formatTime(get(entry).t),
            () => stripAnsi(get(entry).m)
          ]
        );
        append($$anchor3, div_1);
      });
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(entries).length === 0) $$render(consequent);
      else $$render(alternate, -1);
    });
  }
  var node_2 = sibling(node, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_4$6();
      delegated("click", div_2, () => {
        set(pinToBottom, true);
        scrollToBottom();
      });
      append($$anchor2, div_2);
    };
    if_block(node_2, ($$render) => {
      if (!get(pinToBottom) && get(entries).length > 0) $$render(consequent_1);
    });
  }
  bind_this(div, ($$value) => containerEl = $$value, () => containerEl);
  event("scroll", div, handleScroll);
  delegated("pointerdown", div, (e) => e.stopPropagation());
  delegated("mousedown", div, (e) => e.stopPropagation());
  append($$anchor, div);
  pop();
}
delegate(["pointerdown", "mousedown", "click"]);
var root_2$9 = from_html(`<div class="pcr-output-panel-generated pcr-scrollable svelte-1kzsw09" style="display:block"><!></div>`);
var root$a = from_html(`<div></div> <div class="pcr-output-panel svelte-1kzsw09"><div class="pcr-output-panel-header svelte-1kzsw09"><div class="pcr-output-panel-tabs svelte-1kzsw09"><button>Prompt Output</button> <button> </button> <button>Console</button></div> <div class="pcr-output-panel-controls svelte-1kzsw09"><div class="pcr-output-panel-maximize svelte-1kzsw09"></div>  <div class="pcr-output-panel-close svelte-1kzsw09" title="Close Panel"></div></div></div> <!> <div><!></div> <!></div>`, 1);
function OutputPanel($$anchor, $$props) {
  var _a, _b, _c, _d, _e;
  push($$props, true);
  const DEFAULT_HEIGHT = 120;
  const MIN_HEIGHT = 60;
  const SNAP_MARGIN = 50;
  const MAXIMIZE_DRAG_THRESHOLD = -10;
  let node = prop($$props, "node", 7), onToggle = prop($$props, "onToggle", 3, () => {
  }), onRegister = prop($$props, "onRegister", 3, null);
  const {
    apiURL,
    fetchApi,
    toast,
    getWorkflowId,
    fetchWorkflowImages,
    fetchWorkflowCount,
    subscribeHistory,
    invalidateCache,
    openViewer,
    getCanvasScale
  } = useApi();
  let panelEl;
  let handleEl;
  let isOpen = state(!!((_a = node().properties) == null ? void 0 : _a.pcrOutputPanel));
  let persistKey = state("pcrOutputTab");
  let activeTab = state(proxy(((_b = node().properties) == null ? void 0 : _b[get(persistKey)]) || "prompt"));
  let isMaximized = state(false);
  let panelHeight = state(proxy(((_c = node().properties) == null ? void 0 : _c.pcrPanelHeight) || DEFAULT_HEIGHT));
  let savedMaxHeight = null;
  let generatedLoaded = state(false);
  let generatedCount = state(0);
  let galleryImages = state(proxy([]));
  let galleryRowHeight = state(proxy(clampGalleryRowHeight(((_d = node().properties) == null ? void 0 : _d.pcrGalleryRowHeight) || 100)));
  let galleryViewMode = state(proxy(((_e = node().properties) == null ? void 0 : _e.pcrGalleryViewMode) || "justified"));
  let toggleListener = null;
  function emitToggle(open2) {
    onToggle()(open2);
    toggleListener == null ? void 0 : toggleListener(open2);
  }
  function setToggleListener(cb) {
    toggleListener = cb;
  }
  onMount(() => {
    var _a2;
    (_a2 = onRegister()) == null ? void 0 : _a2({
      toggle,
      open,
      close,
      openPrompt,
      getIsOpen,
      setToggleListener,
      cleanup,
      switchTab,
      setPersistKey,
      loadGenerated,
      reloadGenerated,
      updateGalleryZoom,
      updateGeneratedCount: (n) => {
        set(generatedCount, n, true);
      }
    });
  });
  let unsubHistory;
  onMount(() => {
    var _a2;
    unsubHistory = subscribeHistory((workflowId) => {
      const wid = getWorkflowId();
      if (workflowId !== wid) return;
      set(generatedLoaded, false);
      loadGenerated();
    });
    if ((_a2 = node().properties) == null ? void 0 : _a2.pcrOutputPanel) {
      requestAnimationFrame(() => open());
    }
  });
  onDestroy(() => unsubHistory == null ? void 0 : unsubHistory());
  function onFileDeleted(e) {
    const { scope, paths } = e.detail || {};
    if (scope !== "output" || !(paths == null ? void 0 : paths.length)) return;
    const pathSet = new Set(paths);
    const before = get(galleryImages).length;
    set(
      galleryImages,
      get(galleryImages).filter((i) => {
        const p = i.subfolder ? `${i.subfolder}/${i.filename}` : i.filename;
        return !pathSet.has(p);
      }),
      true
    );
    if (get(galleryImages).length !== before) {
      invalidateCache(getWorkflowId());
    }
  }
  function onWorkflowChanged() {
    set(generatedLoaded, false);
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
    if (get(generatedLoaded)) return;
    set(generatedLoaded, true);
    const wid = getWorkflowId();
    if (!wid) return;
    set(galleryImages, await fetchWorkflowImages(wid), true);
    set(generatedCount, get(galleryImages).length, true);
  }
  async function reloadGenerated() {
    set(generatedLoaded, false);
    await loadGenerated();
  }
  function switchTab(tab) {
    set(activeTab, tab, true);
    if (node().properties) node().properties[get(persistKey)] = tab;
    if (tab === "generated") {
      loadGenerated().catch((e) => console.error("[PromptChain] loadGenerated failed:", e));
    }
  }
  function setPersistKey(key) {
    var _a2;
    set(persistKey, key, true);
    const stored = ((_a2 = node().properties) == null ? void 0 : _a2[key]) || "prompt";
    if (stored !== get(activeTab)) {
      set(activeTab, stored, true);
      if (stored === "generated") {
        loadGenerated().catch((e) => console.error("[PromptChain] loadGenerated failed:", e));
      }
    }
  }
  function open() {
    var _a2;
    set(isOpen, true);
    if (node().properties) node().properties.pcrOutputPanel = true;
    if (((_a2 = node().properties) == null ? void 0 : _a2.pcrPanelMaximized) && !get(isMaximized)) {
      setMaximized(true);
    }
    emitToggle(true);
    if (get(activeTab) === "generated") loadGenerated();
    else if (!get(generatedLoaded)) {
      const wid = getWorkflowId();
      if (wid) fetchWorkflowCount(wid).then((c) => {
        set(generatedCount, c, true);
      });
    }
  }
  function close() {
    if (get(isMaximized)) setMaximized(false);
    set(isOpen, false);
    if (node().properties) node().properties.pcrOutputPanel = false;
    emitToggle(false);
  }
  function toggle() {
    get(isOpen) ? close() : open();
  }
  function openPrompt() {
    if (get(isOpen) && get(activeTab) === "prompt") {
      close();
    } else {
      open();
      switchTab("prompt");
    }
  }
  function getIsOpen() {
    return get(isOpen);
  }
  function cleanup() {
    resizeAc == null ? void 0 : resizeAc.abort();
    unsubHistory == null ? void 0 : unsubHistory();
  }
  function updateGalleryZoom(delta) {
    set(galleryRowHeight, zoomGalleryRowHeight(get(galleryRowHeight), delta), true);
    if (node().properties) node().properties.pcrGalleryRowHeight = get(galleryRowHeight);
  }
  function setMaximized(maximize, restoreHeight) {
    if (maximize) {
      savedMaxHeight = get(panelHeight);
      set(isMaximized, true);
    } else {
      set(panelHeight, restoreHeight || savedMaxHeight || DEFAULT_HEIGHT, true);
      set(isMaximized, false);
    }
    if (node().properties) node().properties.pcrPanelMaximized = get(isMaximized);
  }
  function handleMaximizeClick() {
    var _a2;
    if (get(isMaximized)) {
      setMaximized(false, Math.round((((_a2 = panelEl == null ? void 0 : panelEl.parentElement) == null ? void 0 : _a2.clientHeight) || 400) * 0.3));
    } else {
      setMaximized(true);
    }
  }
  let resizeAc;
  onMount(() => {
    resizeAc = new AbortController();
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!handleEl || e.target !== handleEl && !handleEl.contains(e.target)) return;
        isResizing = true;
        startY = e.clientY;
        startHeight = (panelEl == null ? void 0 : panelEl.offsetHeight) || get(panelHeight);
        handleEl.style.background = "rgba(79, 195, 247, 0.8)";
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const canvas = document.querySelector("canvas.lgraphcanvas");
        if (canvas && typeof e.pointerId === "number") {
          try {
            if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
          } catch {
          }
        }
      },
      { capture: true, signal: resizeAc.signal }
    );
    document.addEventListener(
      "pointermove",
      (e) => {
        var _a2;
        if (!isResizing) return;
        e.preventDefault();
        e.stopPropagation();
        const inFs = !!document.querySelector(".pcr-fs-overlay");
        const scale = inFs ? 1 : getCanvasScale();
        const delta = (startY - e.clientY) / scale;
        const newHeight = Math.max(MIN_HEIGHT, startHeight + delta);
        const parentHeight = ((_a2 = panelEl == null ? void 0 : panelEl.parentElement) == null ? void 0 : _a2.clientHeight) || 600;
        if (get(isMaximized) && delta < MAXIMIZE_DRAG_THRESHOLD) {
          const exitHeight = parentHeight - SNAP_MARGIN;
          setMaximized(false, exitHeight);
          startY = e.clientY;
          startHeight = exitHeight;
        } else if (!get(isMaximized)) {
          if (newHeight >= parentHeight - SNAP_MARGIN) {
            setMaximized(true);
            startY = e.clientY;
            startHeight = parentHeight;
          } else {
            set(panelHeight, newHeight, true);
          }
        }
      },
      { capture: true, signal: resizeAc.signal }
    );
    document.addEventListener(
      "pointerup",
      () => {
        if (!isResizing) return;
        isResizing = false;
        if (handleEl) handleEl.style.background = "";
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (node().properties && !get(isMaximized)) {
          node().properties.pcrPanelHeight = get(panelHeight);
        }
      },
      { capture: true, signal: resizeAc.signal }
    );
  });
  onDestroy(() => resizeAc == null ? void 0 : resizeAc.abort());
  var $$exports = { open, close, toggle, openPrompt, getIsOpen };
  var fragment = root$a();
  var div = first_child(fragment);
  let classes;
  let styles;
  bind_this(div, ($$value) => handleEl = $$value, () => handleEl);
  var div_1 = sibling(div, 2);
  let styles_1;
  var div_2 = child(div_1);
  var div_3 = child(div_2);
  var button = child(div_3);
  let classes_1;
  var button_1 = sibling(button, 2);
  let classes_2;
  var text2 = child(button_1);
  var button_2 = sibling(button_1, 2);
  let classes_3;
  var div_4 = sibling(div_3, 2);
  var div_5 = child(div_4);
  div_5.textContent = "⛶";
  var div_6 = sibling(div_5, 2);
  div_6.textContent = "✕";
  var node_1 = sibling(div_2, 2);
  {
    var consequent = ($$anchor2) => {
      PromptOutput($$anchor2, {
        get compiledOutput() {
          return $$props.shared.compiledOutput;
        },
        get compiledNegOutput() {
          return $$props.shared.compiledNegOutput;
        },
        get compiledRegions() {
          return $$props.shared.compiledRegions;
        }
      });
    };
    if_block(node_1, ($$render) => {
      if (get(activeTab) === "prompt") $$render(consequent);
    });
  }
  var div_7 = sibling(node_1, 2);
  let styles_2;
  var node_2 = child(div_7);
  {
    let $0 = user_derived(() => get(activeTab) === "console");
    ConsoleLog(node_2, {
      get active() {
        return get($0);
      }
    });
  }
  var node_3 = sibling(div_7, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div_8 = root_2$9();
      var node_4 = child(div_8);
      {
        var consequent_1 = ($$anchor3) => {
          {
            let $0 = user_derived(() => getWorkflowId() || "");
            GeneratedGallery($$anchor3, {
              get images() {
                return get(galleryImages);
              },
              get workflowId() {
                return get($0);
              },
              get viewMode() {
                return get(galleryViewMode);
              },
              get rowHeight() {
                return get(galleryRowHeight);
              },
              get apiURL() {
                return apiURL;
              },
              get fetchApi() {
                return fetchApi;
              },
              get toast() {
                return toast;
              },
              onOpenViewer: (imgs, idx, wid) => openViewer(imgs, idx, wid),
              onViewModeChange: (mode) => {
                set(galleryViewMode, mode, true);
                if (node().properties) node().properties.pcrGalleryViewMode = mode;
              },
              onRowHeightChange: (h) => {
                set(galleryRowHeight, h, true);
                if (node().properties) node().properties.pcrGalleryRowHeight = h;
              },
              onCountChange: (c) => {
                set(generatedCount, c, true);
              },
              onDeleteImages: async (hashes) => {
                const wid = getWorkflowId();
                if (!wid) return;
                try {
                  await fetchApi(`/promptchain/workflow/${wid}/clear`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ hashes })
                  });
                  invalidateCache(wid);
                  set(galleryImages, await fetchWorkflowImages(wid), true);
                } catch {
                }
              },
              onDeleteFiles: async (hashes) => {
                const wid = getWorkflowId();
                if (!wid) return;
                try {
                  const toDelete = get(galleryImages).filter((i) => hashes.includes(i.hash));
                  const paths = toDelete.map((i) => i.subfolder ? `${i.subfolder}/${i.filename}` : i.filename);
                  if (paths.length) {
                    await fetchApi("/promptchain/browse/delete", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ scope: "output", paths })
                    });
                  }
                  await fetchApi(`/promptchain/workflow/${wid}/clear`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ hashes })
                  });
                  invalidateCache(wid);
                  set(galleryImages, await fetchWorkflowImages(wid), true);
                  if (paths.length) {
                    window.dispatchEvent(new CustomEvent("promptchain:file-deleted", { detail: { scope: "output", paths } }));
                  }
                } catch {
                }
              },
              onClearHistory: async (action) => {
                const wid = getWorkflowId();
                if (!wid) return;
                if (action === "clear") {
                  try {
                    await fetchApi(`/promptchain/workflow/${wid}/clear`, { method: "POST" });
                    invalidateCache(wid);
                    set(galleryImages, [], true);
                  } catch {
                  }
                } else {
                  await reloadGenerated();
                }
              }
            });
          }
        };
        if_block(node_4, ($$render) => {
          if (get(generatedLoaded)) $$render(consequent_1);
        });
      }
      append($$anchor2, div_8);
    };
    if_block(node_3, ($$render) => {
      if (get(activeTab) === "generated") $$render(consequent_2);
    });
  }
  bind_this(div_1, ($$value) => panelEl = $$value, () => panelEl);
  template_effect(() => {
    classes = set_class(div, 1, "pcr-output-panel-resize svelte-1kzsw09", null, classes, { "pcr-resize-hidden": get(isMaximized) });
    styles = set_style(div, "", styles, { display: get(isOpen) ? "block" : "none" });
    styles_1 = set_style(div_1, "", styles_1, {
      height: get(isMaximized) ? "100%" : `${get(panelHeight)}px`,
      display: get(isOpen) ? "flex" : "none"
    });
    classes_1 = set_class(button, 1, "pcr-output-panel-tab svelte-1kzsw09", null, classes_1, { "pcr-output-panel-tab-active": get(activeTab) === "prompt" });
    classes_2 = set_class(button_1, 1, "pcr-output-panel-tab svelte-1kzsw09", null, classes_2, {
      "pcr-output-panel-tab-active": get(activeTab) === "generated"
    });
    set_text(text2, get(generatedCount) > 0 ? `${get(generatedCount)} Generated` : "Generated");
    classes_3 = set_class(button_2, 1, "pcr-output-panel-tab svelte-1kzsw09", null, classes_3, {
      "pcr-output-panel-tab-active": get(activeTab) === "console"
    });
    set_attribute(div_5, "title", get(isMaximized) ? "Restore Panel" : "Maximize Panel");
    styles_2 = set_style(div_7, "flex:1 1 0;min-height:0;overflow:hidden;", styles_2, { display: get(activeTab) === "console" ? "flex" : "none" });
  });
  delegated("pointerdown", div_1, (e) => e.stopPropagation());
  delegated("mousedown", div_1, (e) => e.stopPropagation());
  delegated("click", button, () => switchTab("prompt"));
  delegated("click", button_1, () => switchTab("generated"));
  delegated("click", button_2, () => switchTab("console"));
  delegated("click", div_5, handleMaximizeClick);
  delegated("click", div_6, () => close());
  append($$anchor, fragment);
  return pop($$exports);
}
delegate(["pointerdown", "mousedown", "click"]);
var root_1$5 = from_html(`<video autoplay="" loop="" playsinline="" controls="" class="svelte-ro1n43"></video>`, 2);
var root_2$8 = from_html(`<img draggable="false" alt="" class="svelte-ro1n43"/>`);
var root_3$4 = from_html(`<div class="pcr-image-placeholder svelte-ro1n43"> </div>`);
var root_5$4 = from_html(`<span class="pcr-image-panel-progress-text svelte-ro1n43"> </span>`);
var root_4$5 = from_html(`<div><div class="pcr-image-panel-progress-track svelte-ro1n43"><div class="pcr-image-panel-progress-bar svelte-ro1n43"></div></div> <!></div>`);
var root_6$3 = from_html(`<span class="pcr-image-panel-info-text svelte-ro1n43"> </span>`);
var root$9 = from_html(`<div class="pcr-image-divider svelte-ro1n43"></div> <div class="pcr-image-panel svelte-ro1n43"><div class="pcr-image-panel-header svelte-ro1n43"><span> </span> <button class="pcr-image-panel-close-btn svelte-ro1n43" title="Close image panel"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-ro1n43"><line x1="18" y1="6" x2="6" y2="18" class="svelte-ro1n43"></line><line x1="6" y1="6" x2="18" y2="18" class="svelte-ro1n43"></line></svg></button></div> <div class="pcr-image-container svelte-ro1n43"><!> <!></div> <div><!></div></div>`, 1);
function ImagePanel($$anchor, $$props) {
  var _a, _b;
  push($$props, true);
  const DEFAULT_WIDTH = 150;
  const MIN_WIDTH = 80;
  const MAX_ZOOM = 8;
  let node = prop($$props, "node", 7), shared = prop($$props, "shared", 7), onToggle = prop($$props, "onToggle", 3, () => {
  }), onRegister = prop($$props, "onRegister", 3, null);
  const {
    getWorkflowId,
    fetchWorkflowImages,
    getCachedImages,
    openViewer,
    apiURL,
    getCanvasScale
  } = useApi();
  let panelEl;
  let dividerEl;
  let imgEl;
  let videoEl;
  let imgContainerEl;
  let isVisible = state(!!((_a = node().properties) == null ? void 0 : _a.pcrImagePreview));
  let panelWidth = state(proxy(((_b = node().properties) == null ? void 0 : _b.pcrImagePanelWidth) || DEFAULT_WIDTH));
  let currentImageUrl = state(null);
  let latestHashPromise = null;
  let isPreviewMode = state(false);
  let zoom = state(1);
  let panX = state(0);
  let panY = state(0);
  let imageLoaded = state(false);
  let imageError = state(false);
  let naturalWidth = state(0);
  let naturalHeight = state(0);
  let showProgress = state(false);
  let progressIndeterminate = state(false);
  let progressValue = state(0);
  let progressMax = state(1);
  let lastProgressTime = 0;
  let progressDuration = 1;
  user_effect(() => {
    if (shared().imageUrl && shared().imageUrl !== get(currentImageUrl) && !get(isPreviewMode)) {
      set(currentImageUrl, shared().imageUrl, true);
      set(isPreviewMode, false);
      if (get(isVisible) && imgEl) imgEl.style.opacity = "";
    }
  });
  user_effect(() => {
    if (shared().previewUrl && get(isVisible)) {
      set(isPreviewMode, true);
      set(currentImageUrl, shared().previewUrl, true);
      if (imgEl) imgEl.style.opacity = "";
    }
  });
  user_effect(() => {
    const progress = shared().progress;
    const generating = shared().isGenerating;
    if (progress) {
      set(showProgress, true);
      set(progressIndeterminate, false);
      const now = performance.now();
      if (lastProgressTime > 0) {
        const delta = (now - lastProgressTime) / 1e3;
        progressDuration = progressDuration === 1 ? delta : progressDuration * 0.7 + delta * 0.3;
      }
      lastProgressTime = now;
      set(progressValue, progress.value, true);
      set(progressMax, progress.max, true);
    } else if (generating) {
      if (get(isVisible)) {
        set(isPreviewMode, true);
        if (imgEl) imgEl.style.opacity = "0.3";
      }
      set(showProgress, true);
      set(progressIndeterminate, true);
    } else {
      set(showProgress, false);
      lastProgressTime = 0;
      progressDuration = 1;
      if (imgEl) imgEl.style.opacity = "";
    }
  });
  function parseImageUrl(url) {
    try {
      const u = new URL(url, location.origin);
      return {
        filename: u.searchParams.get("filename") || "",
        subfolder: u.searchParams.get("subfolder") || ""
      };
    } catch {
      return { filename: "", subfolder: "" };
    }
  }
  let isVideoUrl = user_derived(() => {
    if (!get(currentImageUrl)) return false;
    return /\.(mp4|webm|m4v|mov)(\?|$)/i.test(parseImageUrl(get(currentImageUrl)).filename);
  });
  let filenameDisplay = user_derived(() => {
    if (shared().isGenerating) return "Generating…";
    if (!get(currentImageUrl)) return "";
    const { filename, subfolder } = parseImageUrl(get(currentImageUrl));
    return subfolder ? `${subfolder}/${filename}` : filename;
  });
  let infoText = user_derived(() => {
    if (get(showProgress) || !get(naturalWidth)) return "";
    const parts = [];
    try {
      const url = new URL(get(currentImageUrl), location.origin);
      const ext = url.pathname.slice(url.pathname.lastIndexOf(".") + 1).toUpperCase();
      if (ext && ext.length <= 4) parts.push(ext);
    } catch {
    }
    parts.push(`${get(naturalWidth)}×${get(naturalHeight)}`);
    parts.push(`${Math.round(get(zoom) * 100)}%`);
    return parts.join("   ");
  });
  let progressPercent = user_derived(() => Math.round(get(progressValue) / get(progressMax) * 100));
  function getMaxPanelWidth() {
    var _a2, _b2;
    const row = panelEl == null ? void 0 : panelEl.parentElement;
    const rowWidth = (row == null ? void 0 : row.offsetWidth) || 0;
    if (!rowWidth) return Number.POSITIVE_INFINITY;
    const aiPanelW = ((_a2 = row.querySelector(".pcr-ai-panel")) == null ? void 0 : _a2.offsetWidth) || 0;
    const aiDividerW = ((_b2 = row.querySelector(".pcr-ai-divider")) == null ? void 0 : _b2.offsetWidth) || 0;
    const dividerW = (dividerEl == null ? void 0 : dividerEl.offsetWidth) || 0;
    return Math.max(MIN_WIDTH, rowWidth - aiPanelW - aiDividerW - dividerW);
  }
  function clampPanelWidth(value) {
    return Math.min(Math.max(MIN_WIDTH, value), getMaxPanelWidth());
  }
  function applyTransform() {
    if (!imgEl) return;
    imgEl.style.transform = `translate(${get(panX)}px, ${get(panY)}px) scale(${get(zoom)})`;
    imgEl.style.cursor = get(zoom) > 1 ? "grab" : "";
  }
  function resetZoom(animate = false) {
    set(zoom, 1);
    set(panX, 0);
    set(panY, 0);
    if (animate && imgEl) {
      imgEl.style.transition = "transform 0.2s ease-out";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (imgEl) imgEl.style.transition = "none";
      }));
    }
    applyTransform();
  }
  function handleImageLoad() {
    set(imageLoaded, true);
    set(imageError, false);
    set(naturalWidth, (imgEl == null ? void 0 : imgEl.naturalWidth) || 0, true);
    set(naturalHeight, (imgEl == null ? void 0 : imgEl.naturalHeight) || 0, true);
    if (!get(isPreviewMode)) resetZoom();
  }
  function handleVideoLoaded() {
    set(imageLoaded, true);
    set(imageError, false);
    set(naturalWidth, (videoEl == null ? void 0 : videoEl.videoWidth) || 0, true);
    set(naturalHeight, (videoEl == null ? void 0 : videoEl.videoHeight) || 0, true);
  }
  function handleImageError() {
    set(imageLoaded, false);
    set(imageError, true);
    set(currentImageUrl, null);
    fetchLatestImage();
  }
  async function fetchLatestImage() {
    var _a2;
    const wid = getWorkflowId();
    if (!wid) return;
    const images = await fetchWorkflowImages(wid);
    if (!images.length) return;
    let target = images[0];
    const compiled = (_a2 = node().properties) == null ? void 0 : _a2.pcrCompiledOutput;
    if (compiled) {
      const match = images.find((img) => img.prompt === compiled);
      if (match) target = match;
    }
    const params = new URLSearchParams({
      filename: target.filename,
      subfolder: target.subfolder || "",
      type: target.source_type || "output"
    });
    set(currentImageUrl, apiURL(`/view?${params}`), true);
    set(isPreviewMode, false);
    latestHashPromise = target.hash ? Promise.resolve(target.hash) : null;
  }
  async function handleFilenameClick(e) {
    e.stopPropagation();
    if (shared().isGenerating) return;
    if (!get(currentImageUrl)) return;
    const wid = getWorkflowId() || "";
    const hash = latestHashPromise ? await latestHashPromise : null;
    const images = getCachedImages(wid);
    if (hash) {
      const idx2 = images.findIndex((img) => img.hash === hash);
      if (idx2 >= 0) {
        openViewer(images, idx2, wid);
        return;
      }
    }
    const { filename, subfolder } = parseImageUrl(get(currentImageUrl));
    const idx = images.findIndex((img) => img.filename === filename && (img.subfolder || "") === subfolder);
    if (idx >= 0) openViewer(images, idx, wid);
    else if (images.length) openViewer(images, 0, wid);
  }
  let toggleListener = null;
  function emitToggle(visible) {
    onToggle()(visible);
    toggleListener == null ? void 0 : toggleListener(visible);
  }
  function show() {
    set(isVisible, true);
    if (node().properties) node().properties.pcrImagePreview = true;
    emitToggle(true);
    if (get(currentImageUrl) && imgEl) imgEl.src = get(currentImageUrl);
    if (!get(isPreviewMode)) fetchLatestImage();
  }
  function hide() {
    set(isVisible, false);
    if (node().properties) node().properties.pcrImagePreview = false;
    emitToggle(false);
  }
  function setToggleListener(cb) {
    toggleListener = cb;
  }
  function toggle() {
    get(isVisible) ? hide() : show();
  }
  function getIsVisible() {
    return get(isVisible);
  }
  function updateImage(imageUrl, hashPromise = null) {
    set(currentImageUrl, imageUrl, true);
    set(isPreviewMode, false);
    set(showProgress, false);
    shared().isGenerating = false;
    latestHashPromise = hashPromise ? Promise.resolve(hashPromise).then((entry) => (entry == null ? void 0 : entry.hash) ?? null).catch(() => null) : null;
  }
  function updatePreview(previewUrl) {
    set(isPreviewMode, true);
    set(currentImageUrl, previewUrl, true);
    if (imgEl) imgEl.style.opacity = "";
  }
  function revertPreview() {
    if (!get(isPreviewMode)) return;
    set(isPreviewMode, false);
    set(showProgress, false);
    shared().isGenerating = false;
    if (shared().imageUrl) set(currentImageUrl, shared().imageUrl, true);
  }
  function startGenerating() {
    set(isPreviewMode, true);
    set(showProgress, true);
    set(progressIndeterminate, true);
    shared().isGenerating = true;
    latestHashPromise = null;
  }
  function showIndeterminate() {
    set(showProgress, true);
    set(progressIndeterminate, true);
  }
  function showProgressBar(v, max) {
    set(showProgress, true);
    set(progressIndeterminate, false);
    set(progressValue, v, true);
    set(progressMax, max, true);
  }
  function hideProgress() {
    set(showProgress, false);
    shared().isGenerating = false;
  }
  function handleZoom(e) {
    const { deltaY, mouseX, mouseY, containerWidth, containerHeight } = e.detail;
    const step = deltaY > 0 ? -0.2 : 0.2;
    const newZoom = Math.max(1, Math.min(MAX_ZOOM, get(zoom) + step));
    if (newZoom === get(zoom)) return;
    const cx = containerWidth / 2;
    const cy = containerHeight / 2;
    const ratio = newZoom / get(zoom);
    set(panX, mouseX - cx - (mouseX - cx - get(panX)) * ratio);
    set(panY, mouseY - cy - (mouseY - cy - get(panY)) * ratio);
    set(zoom, newZoom, true);
    applyTransform();
  }
  let isPanning = false;
  let panStartX;
  let panStartY;
  let panStartPanX;
  let panStartPanY;
  function handlePanStart(e) {
    if (!get(imageLoaded)) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = document.querySelector("canvas.lgraphcanvas");
    if (canvas && typeof e.pointerId === "number") {
      try {
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      } catch {
      }
    }
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartPanX = get(panX);
    panStartPanY = get(panY);
    imgContainerEl == null ? void 0 : imgContainerEl.setPointerCapture(e.pointerId);
  }
  function handlePanMove(e) {
    if (!isPanning) return;
    const inFs = !!document.querySelector(".pcr-fs-overlay");
    const scale = inFs ? 1 : getCanvasScale();
    set(panX, panStartPanX + (e.clientX - panStartX) / scale);
    set(panY, panStartPanY + (e.clientY - panStartY) / scale);
    applyTransform();
  }
  function handlePanEnd(e) {
    if (!isPanning) return;
    isPanning = false;
    try {
      imgContainerEl == null ? void 0 : imgContainerEl.releasePointerCapture(e.pointerId);
    } catch {
    }
  }
  onMount(() => {
    var _a2;
    (_a2 = onRegister()) == null ? void 0 : _a2({
      toggle,
      show,
      hide,
      getIsVisible,
      setToggleListener,
      updateImage,
      updatePreview,
      revertPreview,
      startGenerating,
      showIndeterminate,
      showProgress: showProgressBar,
      hideProgress,
      cleanup
    });
    panelEl == null ? void 0 : panelEl.addEventListener("pcr-zoom", handleZoom);
    return () => panelEl == null ? void 0 : panelEl.removeEventListener("pcr-zoom", handleZoom);
  });
  let dividerAc;
  onMount(() => {
    dividerAc = new AbortController();
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!dividerEl || e.target !== dividerEl && !dividerEl.contains(e.target)) return;
        isDragging = true;
        startX = e.clientX;
        startWidth = (panelEl == null ? void 0 : panelEl.offsetWidth) || get(panelWidth);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const canvas = document.querySelector("canvas.lgraphcanvas");
        if (canvas && typeof e.pointerId === "number") {
          try {
            if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
          } catch {
          }
        }
      },
      { capture: true, signal: dividerAc.signal }
    );
    document.addEventListener(
      "pointermove",
      (e) => {
        if (!isDragging) return;
        e.preventDefault();
        e.stopPropagation();
        const inFs = !!document.querySelector(".pcr-fs-overlay");
        const scale = inFs ? 1 : getCanvasScale();
        const delta = (startX - e.clientX) / scale;
        set(panelWidth, clampPanelWidth(startWidth + delta), true);
      },
      { capture: true, signal: dividerAc.signal }
    );
    document.addEventListener(
      "pointerup",
      () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (node().properties) node().properties.pcrImagePanelWidth = get(panelWidth);
      },
      { capture: true, signal: dividerAc.signal }
    );
  });
  onDestroy(() => dividerAc == null ? void 0 : dividerAc.abort());
  function cleanup() {
    dividerAc == null ? void 0 : dividerAc.abort();
  }
  onMount(() => {
    var _a2;
    if ((_a2 = node().properties) == null ? void 0 : _a2.pcrImagePreview) requestAnimationFrame(() => show());
    requestAnimationFrame(() => {
      set(panelWidth, clampPanelWidth(get(panelWidth)), true);
    });
  });
  user_effect(() => {
    applyTransform();
  });
  var $$exports = {
    show,
    hide,
    setToggleListener,
    toggle,
    getIsVisible,
    updateImage,
    updatePreview,
    revertPreview,
    startGenerating,
    showIndeterminate,
    showProgressBar,
    hideProgress
  };
  var fragment = root$9();
  var div = first_child(fragment);
  let styles;
  bind_this(div, ($$value) => dividerEl = $$value, () => dividerEl);
  var div_1 = sibling(div, 2);
  let styles_1;
  var div_2 = child(div_1);
  var span = child(div_2);
  let classes;
  var text2 = child(span);
  var button = sibling(span, 2);
  var div_3 = sibling(div_2, 2);
  var node_1 = child(div_3);
  {
    var consequent = ($$anchor2) => {
      var video = root_1$5();
      video.muted = true;
      let styles_2;
      bind_this(video, ($$value) => videoEl = $$value, () => videoEl);
      template_effect(() => {
        set_attribute(video, "src", get(currentImageUrl));
        styles_2 = set_style(video, "", styles_2, { display: get(imageLoaded) ? "block" : "none" });
      });
      event("loadeddata", video, handleVideoLoaded);
      event("error", video, handleImageError);
      append($$anchor2, video);
    };
    var consequent_1 = ($$anchor2) => {
      var img_1 = root_2$8();
      let styles_3;
      bind_this(img_1, ($$value) => imgEl = $$value, () => imgEl);
      template_effect(() => {
        set_attribute(img_1, "src", get(currentImageUrl));
        styles_3 = set_style(img_1, "", styles_3, { display: get(imageLoaded) ? "block" : "none" });
      });
      event("load", img_1, handleImageLoad);
      event("error", img_1, handleImageError);
      append($$anchor2, img_1);
    };
    if_block(node_1, ($$render) => {
      if (get(currentImageUrl) && get(isVideoUrl)) $$render(consequent);
      else if (get(currentImageUrl)) $$render(consequent_1, 1);
    });
  }
  var node_2 = sibling(node_1, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div_4 = root_3$4();
      var text_1 = child(div_4);
      template_effect(() => set_text(text_1, get(imageError) ? "Image not found" : "No image"));
      append($$anchor2, div_4);
    };
    if_block(node_2, ($$render) => {
      if (!get(imageLoaded) || !get(currentImageUrl)) $$render(consequent_2);
    });
  }
  bind_this(div_3, ($$value) => imgContainerEl = $$value, () => imgContainerEl);
  var div_5 = sibling(div_3, 2);
  let classes_1;
  let styles_4;
  var node_3 = child(div_5);
  {
    var consequent_4 = ($$anchor2) => {
      var div_6 = root_4$5();
      let classes_2;
      var div_7 = child(div_6);
      var div_8 = child(div_7);
      let styles_5;
      var node_4 = sibling(div_7, 2);
      {
        var consequent_3 = ($$anchor3) => {
          var span_1 = root_5$4();
          var text_2 = child(span_1);
          template_effect(() => set_text(text_2, `${get(progressValue) ?? ""}/${get(progressMax) ?? ""}`));
          append($$anchor3, span_1);
        };
        if_block(node_4, ($$render) => {
          if (!get(progressIndeterminate)) $$render(consequent_3);
        });
      }
      template_effect(() => {
        classes_2 = set_class(div_6, 1, "pcr-image-panel-progress svelte-ro1n43", null, classes_2, {
          "pcr-image-panel-progress-indeterminate": get(progressIndeterminate)
        });
        styles_5 = set_style(div_8, "", styles_5, {
          width: `${get(progressPercent) ?? ""}%`,
          transition: `width ${progressDuration * 1.3}s linear`
        });
      });
      append($$anchor2, div_6);
    };
    var alternate = ($$anchor2) => {
      var span_2 = root_6$3();
      var text_3 = child(span_2);
      template_effect(() => set_text(text_3, get(infoText)));
      append($$anchor2, span_2);
    };
    if_block(node_3, ($$render) => {
      if (get(showProgress)) $$render(consequent_4);
      else $$render(alternate, -1);
    });
  }
  bind_this(div_1, ($$value) => panelEl = $$value, () => panelEl);
  template_effect(() => {
    styles = set_style(div, "", styles, { display: get(isVisible) ? "flex" : "none" });
    styles_1 = set_style(div_1, "", styles_1, {
      width: `${get(panelWidth) ?? ""}px`,
      display: get(isVisible) ? "flex" : "none"
    });
    classes = set_class(span, 1, "pcr-image-panel-filename svelte-ro1n43", null, classes, { "pcr-image-panel-filename-generating": shared().isGenerating });
    set_attribute(span, "title", get(filenameDisplay));
    set_text(text2, get(filenameDisplay));
    classes_1 = set_class(div_5, 1, "pcr-image-panel-info svelte-ro1n43", null, classes_1, { "pcr-image-panel-info-always": get(showProgress) });
    styles_4 = set_style(div_5, "", styles_4, {
      display: get(showProgress) || get(imageLoaded) && get(currentImageUrl) ? "flex" : "none"
    });
  });
  delegated("dblclick", div, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (get(naturalWidth) && get(naturalHeight)) {
      const container = panelEl == null ? void 0 : panelEl.querySelector(".pcr-image-container");
      const h = (container == null ? void 0 : container.offsetHeight) || (panelEl == null ? void 0 : panelEl.offsetHeight) || 300;
      set(panelWidth, clampPanelWidth(Math.round(h * (get(naturalWidth) / get(naturalHeight)))), true);
      if (node().properties) node().properties.pcrImagePanelWidth = get(panelWidth);
    }
  });
  delegated("pointerdown", div_1, (e) => e.stopPropagation());
  delegated("mousedown", div_1, (e) => e.stopPropagation());
  delegated("click", div_1, (e) => e.stopPropagation());
  delegated("dblclick", div_1, (e) => e.stopPropagation());
  delegated("click", span, handleFilenameClick);
  delegated("click", button, (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });
  delegated("pointerdown", div_3, handlePanStart);
  delegated("pointermove", div_3, handlePanMove);
  delegated("pointerup", div_3, handlePanEnd);
  delegated("dblclick", div_3, (e) => {
    e.stopPropagation();
    resetZoom(true);
  });
  append($$anchor, fragment);
  return pop($$exports);
}
delegate([
  "dblclick",
  "pointerdown",
  "mousedown",
  "click",
  "pointermove",
  "pointerup"
]);
var root_2$7 = from_html(`<div class="pcr-pose-panel-placeholder svelte-1xr40xl">No 3D Poser node in the graph</div>`);
var root$8 = from_html(`<div class="pcr-pose-panel svelte-1xr40xl"><!> <div class="pcr-pose-panel-body svelte-1xr40xl"><!></div></div> <div class="pcr-pose-divider svelte-1xr40xl"></div>`, 1);
function PosePanel($$anchor, $$props) {
  var _a, _b;
  push($$props, true);
  const DEFAULT_WIDTH = 320;
  const MIN_WIDTH = 200;
  let node = prop($$props, "node", 7), onToggle = prop($$props, "onToggle", 3, () => {
  }), onRegister = prop($$props, "onRegister", 3, null), getActivePoser = prop($$props, "getActivePoser", 3, () => null);
  const { getCanvasScale } = useApi();
  let panelEl;
  let dividerEl;
  let bodyEl;
  let isVisible = state(!!((_a = node().properties) == null ? void 0 : _a.pcrPosePanel));
  let panelWidth = state(proxy(((_b = node().properties) == null ? void 0 : _b.pcrPosePanelWidth) || DEFAULT_WIDTH));
  let dockedNode = null;
  let hasDock = state(false);
  let toggleListener = null;
  function emitToggle(visible) {
    onToggle()(visible);
    toggleListener == null ? void 0 : toggleListener(visible);
  }
  function setToggleListener(cb) {
    toggleListener = cb;
  }
  function dock(poser) {
    var _a2;
    if (!poser || !bodyEl || !((_a2 = poser._pcrPose) == null ? void 0 : _a2.enterDock)) return;
    poser._pcrPose.enterDock(bodyEl);
    dockedNode = poser;
    set(hasDock, true);
  }
  function undock() {
    var _a2;
    if (dockedNode && ((_a2 = dockedNode._pcrPose) == null ? void 0 : _a2.exitDock)) {
      try {
        dockedNode._pcrPose.exitDock();
      } catch (e) {
        console.error("[PromptChain] pose undock error", e);
      }
    }
    dockedNode = null;
    set(hasDock, false);
  }
  function refreshDock() {
    if (!get(isVisible)) return;
    if (dockedNode && dockedNode._pcrAlive) return;
    if (dockedNode) undock();
    const active = getActivePoser()();
    if (active) dock(active);
  }
  function show() {
    set(isVisible, true);
    if (node().properties) node().properties.pcrPosePanel = true;
    emitToggle(true);
    requestAnimationFrame(() => {
      if (get(isVisible)) dock(getActivePoser()());
    });
  }
  function hide() {
    undock();
    set(isVisible, false);
    if (node().properties) node().properties.pcrPosePanel = false;
    emitToggle(false);
  }
  function toggle() {
    get(isVisible) ? hide() : show();
  }
  function getIsVisible() {
    return get(isVisible);
  }
  function getMaxPanelWidth() {
    const row = panelEl == null ? void 0 : panelEl.parentElement;
    const rowWidth = (row == null ? void 0 : row.offsetWidth) || 0;
    if (!rowWidth) return Number.POSITIVE_INFINITY;
    return Math.max(MIN_WIDTH, rowWidth - 120);
  }
  function clampPanelWidth(value) {
    return Math.min(Math.max(MIN_WIDTH, value), getMaxPanelWidth());
  }
  onMount(() => {
    var _a2, _b2;
    (_a2 = onRegister()) == null ? void 0 : _a2({
      toggle,
      show,
      hide,
      getIsVisible,
      refreshDock,
      setToggleListener,
      cleanup
    });
    if ((_b2 = node().properties) == null ? void 0 : _b2.pcrPosePanel) requestAnimationFrame(() => show());
    requestAnimationFrame(() => {
      set(panelWidth, clampPanelWidth(get(panelWidth)), true);
    });
  });
  let dividerAc;
  onMount(() => {
    dividerAc = new AbortController();
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    const getScale = () => {
      const inFs = !!document.querySelector(".pcr-fs-overlay");
      return inFs ? 1 : getCanvasScale();
    };
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!dividerEl || e.target !== dividerEl && !dividerEl.contains(e.target)) return;
        isDragging = true;
        startX = e.clientX;
        startWidth = (panelEl == null ? void 0 : panelEl.offsetWidth) || get(panelWidth);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const canvas = document.querySelector("canvas.lgraphcanvas");
        if (canvas && typeof e.pointerId === "number") {
          try {
            if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
          } catch {
          }
        }
      },
      { capture: true, signal: dividerAc.signal }
    );
    document.addEventListener(
      "pointermove",
      (e) => {
        if (!isDragging) return;
        e.preventDefault();
        e.stopPropagation();
        const delta = (e.clientX - startX) / getScale();
        set(panelWidth, clampPanelWidth(startWidth + delta), true);
      },
      { capture: true, signal: dividerAc.signal }
    );
    document.addEventListener(
      "pointerup",
      () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (node().properties) node().properties.pcrPosePanelWidth = get(panelWidth);
      },
      { capture: true, signal: dividerAc.signal }
    );
  });
  let closeState = state(
    "hidden"
    // hidden | dim | full
  );
  function onPanelMove(e) {
    if (!panelEl) return;
    const r = panelEl.getBoundingClientRect();
    const inTop = e.clientY - r.top < Math.max(32, r.height * 0.1);
    const inRight = r.right - e.clientX < Math.max(32, r.width * 0.1);
    set(closeState, inTop && inRight ? "full" : "dim", true);
  }
  function onPanelLeave() {
    set(closeState, "hidden");
  }
  function cleanup() {
    dividerAc == null ? void 0 : dividerAc.abort();
    undock();
  }
  onDestroy(() => {
    dividerAc == null ? void 0 : dividerAc.abort();
    undock();
  });
  var $$exports = {
    setToggleListener,
    refreshDock,
    show,
    hide,
    toggle,
    getIsVisible
  };
  var fragment = root$8();
  var div = first_child(fragment);
  let styles;
  var node_1 = child(div);
  {
    if_block(node_1, ($$render) => {
    });
  }
  var div_1 = sibling(node_1, 2);
  var node_2 = child(div_1);
  {
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_2$7();
      append($$anchor2, div_2);
    };
    if_block(node_2, ($$render) => {
      if (!get(hasDock)) $$render(consequent_1);
    });
  }
  bind_this(div_1, ($$value) => bodyEl = $$value, () => bodyEl);
  bind_this(div, ($$value) => panelEl = $$value, () => panelEl);
  var div_3 = sibling(div, 2);
  let styles_1;
  bind_this(div_3, ($$value) => dividerEl = $$value, () => dividerEl);
  template_effect(() => {
    styles = set_style(div, "", styles, {
      width: `${get(panelWidth) ?? ""}px`,
      display: get(isVisible) ? "flex" : "none"
    });
    styles_1 = set_style(div_3, "", styles_1, { display: get(isVisible) ? "flex" : "none" });
  });
  delegated("pointerdown", div, (e) => e.stopPropagation());
  delegated("mousedown", div, (e) => e.stopPropagation());
  delegated("click", div, (e) => e.stopPropagation());
  delegated("dblclick", div, (e) => e.stopPropagation());
  event("pointerleave", div, onPanelLeave);
  event("pointermove", div, onPanelMove, true);
  delegated("dblclick", div_3, (e) => {
    var _a2, _b2, _c, _d;
    e.preventDefault();
    e.stopPropagation();
    const poser = dockedNode || getActivePoser()();
    const w = (_b2 = (_a2 = poser == null ? void 0 : poser.widgets) == null ? void 0 : _a2.find((x) => x.name === "width")) == null ? void 0 : _b2.value;
    const h = (_d = (_c = poser == null ? void 0 : poser.widgets) == null ? void 0 : _c.find((x) => x.name === "height")) == null ? void 0 : _d.value;
    if (!w || !h) return;
    const bodyH = (bodyEl == null ? void 0 : bodyEl.offsetHeight) || (panelEl == null ? void 0 : panelEl.offsetHeight) || 300;
    set(panelWidth, clampPanelWidth(Math.round(bodyH * (w / h))), true);
    if (node().properties) node().properties.pcrPosePanelWidth = get(panelWidth);
  });
  append($$anchor, fragment);
  return pop($$exports);
}
delegate(["pointerdown", "mousedown", "click", "dblclick"]);
var root_2$6 = from_html(`<div class="pcr-region-panel-placeholder svelte-wos87s">No Region Box node in the graph</div>`);
var root$7 = from_html(`<div class="pcr-region-panel svelte-wos87s"><!> <div class="pcr-region-panel-body svelte-wos87s"><!></div></div> <div class="pcr-region-divider svelte-wos87s"></div>`, 1);
function RegionPanel($$anchor, $$props) {
  var _a, _b;
  push($$props, true);
  const DEFAULT_WIDTH = 440;
  const MIN_WIDTH = 240;
  let node = prop($$props, "node", 7), onToggle = prop($$props, "onToggle", 3, () => {
  }), onRegister = prop($$props, "onRegister", 3, null), getActiveRegionBox = prop($$props, "getActiveRegionBox", 3, () => null);
  const { getCanvasScale } = useApi();
  let panelEl;
  let dividerEl;
  let bodyEl;
  let isVisible = state(!!((_a = node().properties) == null ? void 0 : _a.pcrRegionPanel));
  let panelWidth = state(proxy(((_b = node().properties) == null ? void 0 : _b.pcrRegionPanelWidth) || DEFAULT_WIDTH));
  let dockedNode = null;
  let hasDock = state(false);
  let toggleListener = null;
  function emitToggle(visible) {
    onToggle()(visible);
    toggleListener == null ? void 0 : toggleListener(visible);
  }
  function setToggleListener(cb) {
    toggleListener = cb;
  }
  function dock(rb) {
    var _a2;
    if (!rb || !bodyEl || !((_a2 = rb._pcrRegion) == null ? void 0 : _a2.enterDock)) return;
    rb._pcrRegion.enterDock(bodyEl);
    dockedNode = rb;
    set(hasDock, true);
  }
  function undock() {
    var _a2;
    if (dockedNode && ((_a2 = dockedNode._pcrRegion) == null ? void 0 : _a2.exitDock)) {
      try {
        dockedNode._pcrRegion.exitDock();
      } catch (e) {
        console.error("[PromptChain] region undock error", e);
      }
    }
    dockedNode = null;
    set(hasDock, false);
  }
  function refreshDock() {
    if (!get(isVisible)) return;
    if (dockedNode && dockedNode._pcrAlive) return;
    if (dockedNode) undock();
    const active = getActiveRegionBox()();
    if (active) dock(active);
  }
  function show() {
    set(isVisible, true);
    if (node().properties) node().properties.pcrRegionPanel = true;
    emitToggle(true);
    requestAnimationFrame(() => {
      if (get(isVisible)) dock(getActiveRegionBox()());
    });
  }
  function hide() {
    undock();
    set(isVisible, false);
    if (node().properties) node().properties.pcrRegionPanel = false;
    emitToggle(false);
  }
  function toggle() {
    get(isVisible) ? hide() : show();
  }
  function getIsVisible() {
    return get(isVisible);
  }
  function getMaxPanelWidth() {
    const row = panelEl == null ? void 0 : panelEl.parentElement;
    const rowWidth = (row == null ? void 0 : row.offsetWidth) || 0;
    if (!rowWidth) return Number.POSITIVE_INFINITY;
    return Math.max(MIN_WIDTH, rowWidth - 120);
  }
  function clampPanelWidth(value) {
    return Math.min(Math.max(MIN_WIDTH, value), getMaxPanelWidth());
  }
  onMount(() => {
    var _a2, _b2;
    (_a2 = onRegister()) == null ? void 0 : _a2({
      toggle,
      show,
      hide,
      getIsVisible,
      refreshDock,
      setToggleListener,
      cleanup
    });
    if ((_b2 = node().properties) == null ? void 0 : _b2.pcrRegionPanel) requestAnimationFrame(() => show());
    requestAnimationFrame(() => {
      set(panelWidth, clampPanelWidth(get(panelWidth)), true);
    });
  });
  let dividerAc;
  onMount(() => {
    dividerAc = new AbortController();
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    const getScale = () => {
      const inFs = !!document.querySelector(".pcr-fs-overlay");
      return inFs ? 1 : getCanvasScale();
    };
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!dividerEl || e.target !== dividerEl && !dividerEl.contains(e.target)) return;
        isDragging = true;
        startX = e.clientX;
        startWidth = (panelEl == null ? void 0 : panelEl.offsetWidth) || get(panelWidth);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const canvas = document.querySelector("canvas.lgraphcanvas");
        if (canvas && typeof e.pointerId === "number") {
          try {
            if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
          } catch {
          }
        }
      },
      { capture: true, signal: dividerAc.signal }
    );
    document.addEventListener(
      "pointermove",
      (e) => {
        if (!isDragging) return;
        e.preventDefault();
        e.stopPropagation();
        const delta = (e.clientX - startX) / getScale();
        set(panelWidth, clampPanelWidth(startWidth + delta), true);
      },
      { capture: true, signal: dividerAc.signal }
    );
    document.addEventListener(
      "pointerup",
      () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (node().properties) node().properties.pcrRegionPanelWidth = get(panelWidth);
      },
      { capture: true, signal: dividerAc.signal }
    );
  });
  let closeState = state(
    "hidden"
    // hidden | dim | full
  );
  function onPanelMove(e) {
    if (!panelEl) return;
    const r = panelEl.getBoundingClientRect();
    const inTop = e.clientY - r.top < Math.max(32, r.height * 0.1);
    const inRight = r.right - e.clientX < Math.max(32, r.width * 0.1);
    set(closeState, inTop && inRight ? "full" : "dim", true);
  }
  function onPanelLeave() {
    set(closeState, "hidden");
  }
  function cleanup() {
    dividerAc == null ? void 0 : dividerAc.abort();
    undock();
  }
  onDestroy(() => {
    dividerAc == null ? void 0 : dividerAc.abort();
    undock();
  });
  var $$exports = {
    setToggleListener,
    refreshDock,
    show,
    hide,
    toggle,
    getIsVisible
  };
  var fragment = root$7();
  var div = first_child(fragment);
  let styles;
  var node_1 = child(div);
  {
    if_block(node_1, ($$render) => {
    });
  }
  var div_1 = sibling(node_1, 2);
  var node_2 = child(div_1);
  {
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_2$6();
      append($$anchor2, div_2);
    };
    if_block(node_2, ($$render) => {
      if (!get(hasDock)) $$render(consequent_1);
    });
  }
  bind_this(div_1, ($$value) => bodyEl = $$value, () => bodyEl);
  bind_this(div, ($$value) => panelEl = $$value, () => panelEl);
  var div_3 = sibling(div, 2);
  let styles_1;
  bind_this(div_3, ($$value) => dividerEl = $$value, () => dividerEl);
  template_effect(() => {
    styles = set_style(div, "", styles, {
      width: `${get(panelWidth) ?? ""}px`,
      display: get(isVisible) ? "flex" : "none"
    });
    styles_1 = set_style(div_3, "", styles_1, { display: get(isVisible) ? "flex" : "none" });
  });
  delegated("pointerdown", div, (e) => e.stopPropagation());
  delegated("mousedown", div, (e) => e.stopPropagation());
  delegated("click", div, (e) => e.stopPropagation());
  delegated("dblclick", div, (e) => e.stopPropagation());
  event("pointerleave", div, onPanelLeave);
  event("pointermove", div, onPanelMove, true);
  delegated("dblclick", div_3, (e) => {
    var _a2, _b2, _c, _d;
    e.preventDefault();
    e.stopPropagation();
    const rb = dockedNode || getActiveRegionBox()();
    const w = (_b2 = (_a2 = rb == null ? void 0 : rb.widgets) == null ? void 0 : _a2.find((x) => x.name === "width")) == null ? void 0 : _b2.value;
    const h = (_d = (_c = rb == null ? void 0 : rb.widgets) == null ? void 0 : _c.find((x) => x.name === "height")) == null ? void 0 : _d.value;
    if (!w || !h) return;
    const bodyH = (bodyEl == null ? void 0 : bodyEl.offsetHeight) || (panelEl == null ? void 0 : panelEl.offsetHeight) || 300;
    set(panelWidth, clampPanelWidth(Math.round(bodyH * (w / h))), true);
    if (node().properties) node().properties.pcrRegionPanelWidth = get(panelWidth);
  });
  append($$anchor, fragment);
  return pop($$exports);
}
delegate(["pointerdown", "mousedown", "click", "dblclick"]);
var root_1$4 = from_html(`<span class="pcr-footer-errors svelte-172i5st" style="display:inline-flex"><span class="pcr-footer-error-icon svelte-172i5st"></span> <span class="pcr-footer-error-count svelte-172i5st"> </span></span>`);
var root$6 = from_html(`<div class="pcr-footer svelte-172i5st"><div class="pcr-footer-left svelte-172i5st"><!></div> <div class="pcr-footer-right svelte-172i5st"><span class="pcr-footer-posneg svelte-172i5st"><span title="Jump to end of positive section">Pos</span> <span title="Jump to negative section (creates if missing)">Neg</span></span> <span class="pcr-footer-wordcount svelte-172i5st"> </span></div></div>`);
function Footer($$anchor, $$props) {
  push($$props, true);
  const NEGATIVE_MARKER = "Negative Prompt:";
  prop($$props, "shared", 19, () => ({}));
  let modelIndicatorEl = prop($$props, "modelIndicatorEl", 3, null), tagsDropdownEl = prop($$props, "tagsDropdownEl", 3, null), getEditorView = prop($$props, "getEditorView", 3, () => null), onRegister = prop($$props, "onRegister", 3, null);
  let leftSlot;
  let rightSlot;
  onMount(() => {
    var _a;
    (_a = onRegister()) == null ? void 0 : _a({ updateWordCount, updatePosNeg, updateErrors, setFocused });
  });
  let editorFocused = state(false);
  let wordCount = state(0);
  let errorCount = state(0);
  let inNegative = state(false);
  user_effect(() => {
    if (modelIndicatorEl() && leftSlot && !leftSlot.contains(modelIndicatorEl())) {
      leftSlot.prepend(modelIndicatorEl());
    }
  });
  user_effect(() => {
    if (tagsDropdownEl() && rightSlot && !rightSlot.contains(tagsDropdownEl())) {
      rightSlot.prepend(tagsDropdownEl());
    }
  });
  function countWords(text2) {
    let cleaned = text2;
    cleaned = cleaned.replace(/Negative Prompt:[\s\S]*$/i, "");
    cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
    cleaned = cleaned.replace(/^\s*\/\/.*$/gm, "");
    cleaned = cleaned.replace(/\s+\/\/.*$/gm, "");
    cleaned = cleaned.replace(/^\s*#.*$/gm, "");
    const words = cleaned.trim().split(/\s+/).filter((w) => w.length > 0);
    return words.length;
  }
  function findOptionContext(text2, cursorPos) {
    const labelRe = /^::[^:\n]+::/gm;
    const starts = [];
    let m;
    while ((m = labelRe.exec(text2)) !== null) starts.push(m.index);
    let optionStart = 0;
    let optionEnd = text2.length;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] <= cursorPos) {
        optionStart = starts[i];
        optionEnd = i + 1 < starts.length ? starts[i + 1] : text2.length;
      }
    }
    if (starts.length > 0 && cursorPos < starts[0]) {
      optionStart = 0;
      optionEnd = starts[0];
    }
    const negIdx = text2.toLowerCase().indexOf(NEGATIVE_MARKER.toLowerCase(), optionStart);
    const negMarker = negIdx !== -1 && negIdx < optionEnd ? negIdx : -1;
    return {
      optionStart,
      optionEnd,
      negMarker,
      hasLabels: starts.length > 0
    };
  }
  function updateWordCount() {
    const view = getEditorView()();
    if (!view) return;
    set(wordCount, countWords(view.state.doc.toString()), true);
  }
  function updatePosNeg() {
    const view = getEditorView()();
    if (!view || !get(editorFocused)) {
      set(inNegative, false);
      return;
    }
    const pos = view.state.selection.main.head;
    const text2 = view.state.doc.toString();
    const { negMarker } = findOptionContext(text2, pos);
    set(inNegative, negMarker !== -1 && pos >= negMarker, true);
  }
  function updateErrors() {
    const view = getEditorView()();
    if (!view) {
      set(errorCount, 0);
      return;
    }
    set(errorCount, view.dom.querySelectorAll(".cm-lintRange-error").length, true);
  }
  function setFocused(focused) {
    set(editorFocused, focused, true);
    updatePosNeg();
  }
  function jumpToPos(e) {
    e.stopPropagation();
    const view = getEditorView()();
    if (!view) return;
    const text2 = view.state.doc.toString();
    const cursorPos = view.state.selection.main.head;
    const { optionStart, optionEnd, negMarker } = findOptionContext(text2, cursorPos);
    let jumpPos = optionStart;
    const scanEnd = negMarker !== -1 ? negMarker : optionEnd;
    for (let i = scanEnd - 1; i >= optionStart; i--) {
      if (!/\s/.test(text2[i])) {
        jumpPos = i + 1;
        break;
      }
    }
    view.dispatch({ selection: { anchor: jumpPos } });
    view.focus();
    updatePosNeg();
  }
  function jumpToNeg(e) {
    e.stopPropagation();
    const view = getEditorView()();
    if (!view) return;
    const text2 = view.state.doc.toString();
    const cursorPos = view.state.selection.main.head;
    const { optionStart, optionEnd, negMarker, hasLabels } = findOptionContext(text2, cursorPos);
    if (negMarker === -1) {
      let lastContent = optionEnd;
      for (let i = optionEnd - 1; i >= optionStart; i--) {
        if (!/\s/.test(text2[i])) {
          lastContent = i + 1;
          break;
        }
        if (i === optionStart) lastContent = optionStart;
      }
      const insert = hasLabels ? " " + NEGATIVE_MARKER + " " : "\n\n" + NEGATIVE_MARKER + "\n";
      view.dispatch({
        changes: { from: lastContent, to: optionEnd, insert },
        selection: { anchor: lastContent + insert.length }
      });
    } else {
      let jumpPos = optionEnd;
      for (let i = optionEnd - 1; i >= negMarker; i--) {
        if (!/\s/.test(text2[i])) {
          jumpPos = i + 1;
          break;
        }
      }
      view.dispatch({ selection: { anchor: jumpPos } });
    }
    view.focus();
    updatePosNeg();
  }
  var $$exports = { updateWordCount, updatePosNeg, updateErrors, setFocused };
  var div = root$6();
  var div_1 = child(div);
  var node_1 = child(div_1);
  {
    var consequent = ($$anchor2) => {
      var span = root_1$4();
      var span_1 = child(span);
      span_1.textContent = "⚠";
      var span_2 = sibling(span_1, 2);
      var text_1 = child(span_2);
      template_effect(() => set_text(text_1, get(errorCount)));
      append($$anchor2, span);
    };
    if_block(node_1, ($$render) => {
      if (get(errorCount) > 0) $$render(consequent);
    });
  }
  bind_this(div_1, ($$value) => leftSlot = $$value, () => leftSlot);
  var div_2 = sibling(div_1, 2);
  var span_3 = child(div_2);
  var span_4 = child(span_3);
  var span_5 = sibling(span_4, 2);
  var span_6 = sibling(span_3, 2);
  var text_2 = child(span_6);
  bind_this(div_2, ($$value) => rightSlot = $$value, () => rightSlot);
  template_effect(() => {
    set_class(span_4, 1, clsx(get(editorFocused) && !get(inNegative) ? "pcr-footer-pos-active" : "pcr-footer-pos-inactive"), "svelte-172i5st");
    set_class(span_5, 1, clsx(get(editorFocused) && get(inNegative) ? "pcr-footer-neg-active" : "pcr-footer-neg-inactive"), "svelte-172i5st");
    set_text(text_2, `Words ${get(wordCount) ?? ""}`);
  });
  delegated("click", span_4, jumpToPos);
  delegated("click", span_5, jumpToNeg);
  append($$anchor, div);
  return pop($$exports);
}
delegate(["click"]);
var root_1$3 = from_html(`<span class="pcr-ai-proposal-request"> </span>`);
var root_2$5 = from_html(`<div class="pcr-ai-proposal-error"> </div>`);
var root_3$3 = from_html(`<div class="pcr-ai-proposal-empty">No diff sections returned.</div>`);
var root_6$2 = from_html(`<div> </div>`);
var root_8$2 = from_html(`<span> </span>`);
var root_7$2 = from_html(`<div class="pcr-ai-panel-diff-chips"></div>`);
var root_5$3 = from_html(`<div class="pcr-ai-panel-diff-section"><div class="pcr-ai-panel-diff-label"> </div> <!></div>`);
var root_4$4 = from_html(`<div class="pcr-ai-proposal-body"></div>`);
var root_9$2 = from_html(`<div class="pcr-ai-panel-actions"><button class="pcr-ai-panel-action pcr-ai-panel-action--apply" type="button">Accept</button> <button class="pcr-ai-panel-action pcr-ai-panel-action--reject" type="button">Reject</button></div>`);
var root$5 = from_html(`<div class="pcr-ai-proposal-card"><div class="pcr-ai-proposal-header"><span> </span> <!> <span class="pcr-ai-proposal-time"> </span></div> <!> <!></div>`);
function ProposalCard($$anchor, $$props) {
  push($$props, true);
  let onAccept = prop($$props, "onAccept", 3, () => {
  }), onReject = prop($$props, "onReject", 3, () => {
  });
  let status = user_derived(() => {
    var _a;
    return ((_a = $$props.proposal) == null ? void 0 : _a.status) || "pending";
  });
  let sections = user_derived(() => {
    var _a, _b;
    return ((_b = (_a = $$props.proposal) == null ? void 0 : _a.tool_result) == null ? void 0 : _b.sections) || [];
  });
  let timestamp = user_derived(() => {
    var _a, _b;
    return ((_a = $$props.proposal) == null ? void 0 : _a.appliedAt) || ((_b = $$props.proposal) == null ? void 0 : _b.createdAt) || Date.now();
  });
  let toolRequest = user_derived(() => {
    var _a, _b;
    return ((_b = (_a = $$props.proposal) == null ? void 0 : _a.tool_input) == null ? void 0 : _b.request) || "";
  });
  let canAct = user_derived(() => get(status) === "pending");
  let statusLabel = user_derived(() => {
    if (get(status) === "applied") return "APPLIED";
    if (get(status) === "rejected") return "REJECTED";
    if (get(status) === "failed") return "FAILED";
    return "PROPOSAL";
  });
  let now = state(proxy(Date.now()));
  user_effect(() => {
    const id = setInterval(
      () => {
        set(now, Date.now(), true);
      },
      3e4
    );
    return () => clearInterval(id);
  });
  let relTime = user_derived(() => {
    const diff = Math.max(0, Math.floor((get(now) - get(timestamp)) / 1e3));
    if (diff < 60) return "";
    const m = Math.floor(diff / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  });
  var div = root$5();
  var div_1 = child(div);
  var span = child(div_1);
  var text2 = child(span);
  var node = sibling(span, 2);
  {
    var consequent = ($$anchor2) => {
      var span_1 = root_1$3();
      var text_1 = child(span_1);
      template_effect(() => {
        set_attribute(span_1, "title", get(toolRequest));
        set_text(text_1, get(toolRequest));
      });
      append($$anchor2, span_1);
    };
    if_block(node, ($$render) => {
      if (get(toolRequest)) $$render(consequent);
    });
  }
  var span_2 = sibling(node, 2);
  var text_2 = child(span_2);
  var node_1 = sibling(div_1, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_2$5();
      var text_3 = child(div_2);
      template_effect(() => {
        var _a, _b;
        return set_text(text_3, ((_b = (_a = $$props.proposal) == null ? void 0 : _a.tool_result) == null ? void 0 : _b.error) || "Patch failed");
      });
      append($$anchor2, div_2);
    };
    var consequent_2 = ($$anchor2) => {
      var div_3 = root_3$3();
      append($$anchor2, div_3);
    };
    var alternate_1 = ($$anchor2) => {
      var div_4 = root_4$4();
      each(div_4, 21, () => get(sections), index, ($$anchor3, s) => {
        var div_5 = root_5$3();
        var div_6 = child(div_5);
        var text_4 = child(div_6);
        var node_2 = sibling(div_6, 2);
        {
          var consequent_3 = ($$anchor4) => {
            var div_7 = root_6$2();
            var text_5 = child(div_7);
            template_effect(() => {
              set_class(div_7, 1, `pcr-ai-panel-diff-prose pcr-ai-panel-diff-prose--polarity-${get(s).is_negative ? "neg" : "pos"} pcr-ai-panel-diff-prose--action-${get(s).is_removal ? "remove" : "add"}`);
              set_text(text_5, get(s).body_text);
            });
            append($$anchor4, div_7);
          };
          var alternate = ($$anchor4) => {
            var div_8 = root_7$2();
            each(div_8, 21, () => get(s).tokens || [], index, ($$anchor5, t) => {
              var span_3 = root_8$2();
              var text_6 = child(span_3);
              template_effect(() => {
                set_class(span_3, 1, `pcr-ai-panel-diff-chip pcr-ai-panel-diff-chip--polarity-${get(s).is_negative ? "neg" : "pos"} pcr-ai-panel-diff-chip--action-${get(s).is_removal ? "remove" : "add"}`);
                set_text(text_6, get(t));
              });
              append($$anchor5, span_3);
            });
            append($$anchor4, div_8);
          };
          if_block(node_2, ($$render) => {
            if (get(s).body_text && !get(s).is_negative) $$render(consequent_3);
            else $$render(alternate, -1);
          });
        }
        template_effect(() => set_text(text_4, get(s).header));
        append($$anchor3, div_5);
      });
      append($$anchor2, div_4);
    };
    if_block(node_1, ($$render) => {
      if (get(status) === "failed") $$render(consequent_1);
      else if (get(sections).length === 0) $$render(consequent_2, 1);
      else $$render(alternate_1, -1);
    });
  }
  var node_3 = sibling(node_1, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var div_9 = root_9$2();
      var button = child(div_9);
      var button_1 = sibling(button, 2);
      delegated("click", button, () => onAccept()($$props.proposalId));
      delegated("click", button_1, () => onReject()($$props.proposalId));
      append($$anchor2, div_9);
    };
    if_block(node_3, ($$render) => {
      if (get(canAct)) $$render(consequent_4);
    });
  }
  template_effect(() => {
    set_class(span, 1, `pcr-ai-proposal-pill pcr-ai-proposal-pill--${get(status) ?? ""}`);
    set_text(text2, get(statusLabel));
    set_text(text_2, get(relTime));
  });
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_2$4 = from_html(`<div class="pcr-ai-chat-edit"><textarea class="pcr-ai-chat-edit-input" rows="1"></textarea> <div class="pcr-ai-chat-edit-actions"><button type="button" class="pcr-ai-turn-action">Cancel</button> <button type="button" class="pcr-ai-turn-action pcr-ai-turn-action--primary">Resend</button></div></div>`);
var root_5$2 = from_html(`<img class="pcr-ai-chat-turn-thumb" alt="attached image"/>`);
var root_4$3 = from_html(`<div class="pcr-ai-chat-turn-images"></div>`);
var root_6$1 = from_html(`<div class="pcr-ai-chat-user-bubble"> </div>`);
var root_8$1 = from_html(`<button type="button" class="pcr-ai-turn-action" title="Regenerate">Regenerate</button>`);
var root_7$1 = from_html(`<div class="pcr-ai-turn-actions"><button type="button" class="pcr-ai-turn-action" title="Edit and resend">Edit</button> <!></div>`);
var root_3$2 = from_html(`<!> <!> <!>`, 1);
var root_1$2 = from_html(`<div><div>YOU</div> <!></div>`);
var root_10$1 = from_html(`<div class="pcr-ai-chat-assistant-prose"></div>`);
var root_13 = from_html(`<button type="button" class="pcr-ai-turn-action" title="Copy to clipboard"> </button>`);
var root_14 = from_html(`<button type="button" class="pcr-ai-turn-action" title="Regenerate">Regenerate</button>`);
var root_12 = from_html(`<div class="pcr-ai-turn-actions"><!> <!></div>`);
var root_9$1 = from_html(`<div><div>AI</div> <!> <!> <!></div>`);
function ChatTurn($$anchor, $$props) {
  push($$props, true);
  let index2 = prop($$props, "index", 19, () => -1), isLast = prop($$props, "isLast", 3, false), busy = prop($$props, "busy", 3, false), proposal = prop($$props, "proposal", 3, null), onAccept = prop($$props, "onAccept", 3, () => {
  }), onReject = prop($$props, "onReject", 3, () => {
  }), onRegenerate = prop($$props, "onRegenerate", 3, () => {
  }), onEditResend = prop($$props, "onEditResend", 3, () => {
  });
  function renderAssistantMarkdown(text2) {
    if (!text2) return "";
    let html2 = String(text2).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    html2 = html2.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    const lines = html2.split("\n");
    const out = [];
    let inList = false;
    for (const line of lines) {
      const trimmed = line.replace(/^\s+/, "");
      const isBullet = /^[-*]\s+/.test(trimmed);
      if (isBullet) {
        if (!inList) {
          out.push('<ul class="pcr-ai-chat-list">');
          inList = true;
        }
        out.push("<li>" + trimmed.replace(/^[-*]\s+/, "") + "</li>");
      } else {
        if (inList) {
          out.push("</ul>");
          inList = false;
        }
        out.push(line);
      }
    }
    if (inList) out.push("</ul>");
    return out.join("\n");
  }
  let assistantHasContent = user_derived(() => $$props.turn.role !== "assistant" || $$props.turn.text && $$props.turn.text.trim() || $$props.turn.proposalId && proposal());
  let copied = state(false);
  let copyResetTimer = null;
  async function copyText() {
    try {
      await navigator.clipboard.writeText($$props.turn.text || "");
      set(copied, true);
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(
        () => {
          set(copied, false);
        },
        1500
      );
    } catch {
    }
  }
  let editing = state(false);
  let editText = state("");
  let editEl = state(null);
  async function startEdit() {
    var _a;
    if (busy()) return;
    set(editText, $$props.turn.text || "", true);
    set(editing, true);
    await tick();
    (_a = get(editEl)) == null ? void 0 : _a.focus();
    if (get(editEl)) {
      get(editEl).style.height = "auto";
      get(editEl).style.height = `${get(editEl).scrollHeight}px`;
      get(editEl).selectionStart = get(editEl).selectionEnd = get(editText).length;
    }
  }
  function cancelEdit() {
    set(editing, false);
    set(editText, "");
  }
  function saveEdit() {
    const next = get(editText).trim();
    if (!next) return;
    set(editing, false);
    onEditResend()(index2(), next);
  }
  function onEditKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }
  function autoGrowEdit() {
    if (!get(editEl)) return;
    get(editEl).style.height = "auto";
    get(editEl).style.height = `${get(editEl).scrollHeight}px`;
  }
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent_5 = ($$anchor2) => {
      var div = root_1$2();
      var div_1 = child(div);
      var node_1 = sibling(div_1, 2);
      {
        var consequent = ($$anchor3) => {
          var div_2 = root_2$4();
          var textarea = child(div_2);
          bind_this(textarea, ($$value) => set(editEl, $$value), () => get(editEl));
          var div_3 = sibling(textarea, 2);
          var button = child(div_3);
          var button_1 = sibling(button, 2);
          template_effect(($0) => button_1.disabled = $0, [() => !get(editText).trim()]);
          delegated("input", textarea, autoGrowEdit);
          delegated("keydown", textarea, onEditKeydown);
          bind_value(textarea, () => get(editText), ($$value) => set(editText, $$value));
          delegated("click", button, cancelEdit);
          delegated("click", button_1, saveEdit);
          append($$anchor3, div_2);
        };
        var alternate = ($$anchor3) => {
          var fragment_1 = root_3$2();
          var node_2 = first_child(fragment_1);
          {
            var consequent_1 = ($$anchor4) => {
              var div_4 = root_4$3();
              each(div_4, 21, () => $$props.turn.images, (img) => img.hash, ($$anchor5, img) => {
                var img_1 = root_5$2();
                template_effect(() => set_attribute(img_1, "src", get(img).url));
                append($$anchor5, img_1);
              });
              append($$anchor4, div_4);
            };
            if_block(node_2, ($$render) => {
              var _a;
              if ((_a = $$props.turn.images) == null ? void 0 : _a.length) $$render(consequent_1);
            });
          }
          var node_3 = sibling(node_2, 2);
          {
            var consequent_2 = ($$anchor4) => {
              var div_5 = root_6$1();
              var text_1 = child(div_5);
              template_effect(() => set_text(text_1, $$props.turn.text));
              append($$anchor4, div_5);
            };
            if_block(node_3, ($$render) => {
              if ($$props.turn.text) $$render(consequent_2);
            });
          }
          var node_4 = sibling(node_3, 2);
          {
            var consequent_4 = ($$anchor4) => {
              var div_6 = root_7$1();
              var button_2 = child(div_6);
              var node_5 = sibling(button_2, 2);
              {
                var consequent_3 = ($$anchor5) => {
                  var button_3 = root_8$1();
                  delegated("click", button_3, () => onRegenerate()());
                  append($$anchor5, button_3);
                };
                if_block(node_5, ($$render) => {
                  if (isLast()) $$render(consequent_3);
                });
              }
              delegated("click", button_2, startEdit);
              append($$anchor4, div_6);
            };
            if_block(node_4, ($$render) => {
              if (!busy() && $$props.turn.text) $$render(consequent_4);
            });
          }
          append($$anchor3, fragment_1);
        };
        if_block(node_1, ($$render) => {
          if (get(editing)) $$render(consequent);
          else $$render(alternate, -1);
        });
      }
      template_effect(() => {
        set_class(div, 1, `pcr-ai-chat-turn pcr-ai-chat-turn--${$$props.turn.role ?? ""}`);
        set_class(div_1, 1, `pcr-ai-chat-role-label pcr-ai-chat-role-label--${$$props.turn.role ?? ""}`);
      });
      append($$anchor2, div);
    };
    var consequent_11 = ($$anchor2) => {
      var div_7 = root_9$1();
      var div_8 = child(div_7);
      var node_6 = sibling(div_8, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var div_9 = root_10$1();
          html(div_9, () => renderAssistantMarkdown($$props.turn.text), true);
          append($$anchor3, div_9);
        };
        if_block(node_6, ($$render) => {
          if ($$props.turn.text) $$render(consequent_6);
        });
      }
      var node_7 = sibling(node_6, 2);
      {
        var consequent_7 = ($$anchor3) => {
          ProposalCard($$anchor3, {
            get proposalId() {
              return $$props.turn.proposalId;
            },
            get proposal() {
              return proposal();
            },
            get onAccept() {
              return onAccept();
            },
            get onReject() {
              return onReject();
            }
          });
        };
        if_block(node_7, ($$render) => {
          if ($$props.turn.proposalId && proposal()) $$render(consequent_7);
        });
      }
      var node_8 = sibling(node_7, 2);
      {
        var consequent_10 = ($$anchor3) => {
          var div_10 = root_12();
          var node_9 = child(div_10);
          {
            var consequent_8 = ($$anchor4) => {
              var button_4 = root_13();
              var text_2 = child(button_4);
              template_effect(() => set_text(text_2, get(copied) ? "Copied" : "Copy"));
              delegated("click", button_4, copyText);
              append($$anchor4, button_4);
            };
            if_block(node_9, ($$render) => {
              if ($$props.turn.text) $$render(consequent_8);
            });
          }
          var node_10 = sibling(node_9, 2);
          {
            var consequent_9 = ($$anchor4) => {
              var button_5 = root_14();
              delegated("click", button_5, () => onRegenerate()());
              append($$anchor4, button_5);
            };
            if_block(node_10, ($$render) => {
              if (isLast()) $$render(consequent_9);
            });
          }
          append($$anchor3, div_10);
        };
        if_block(node_8, ($$render) => {
          if (!busy() && ($$props.turn.text || isLast())) $$render(consequent_10);
        });
      }
      template_effect(() => {
        set_class(div_7, 1, `pcr-ai-chat-turn pcr-ai-chat-turn--${$$props.turn.role ?? ""}`);
        set_class(div_8, 1, `pcr-ai-chat-role-label pcr-ai-chat-role-label--${$$props.turn.role ?? ""}`);
      });
      append($$anchor2, div_7);
    };
    if_block(node, ($$render) => {
      if ($$props.turn.role === "user") $$render(consequent_5);
      else if (get(assistantHasContent)) $$render(consequent_11, 1);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate(["input", "keydown", "click"]);
var root_1$1 = from_html(`<div class="pcr-ai-chat-empty-hint"> </div>`);
var root_2$3 = from_html(`<div class="pcr-ai-chat-condensed" title="To stay within the model's context window, older turns have been summarized for the assistant. The full conversation is still shown here.">⋯ earlier turns condensed for the assistant's memory</div>`);
var root_5$1 = from_html(`<span class="pcr-ai-panel-elapsed"><!> <!> <!></span>`);
var root_4$2 = from_html(`<div class="pcr-ai-chat-thinking"><span class="pcr-ai-panel-status"> <span class="pcr-ai-panel-dots"><span>.</span><span>.</span><span>.</span></span></span> <!></div>`);
var root$4 = from_html(`<div class="pcr-ai-chat-timeline"><!> <!> <!> <!></div>`);
function ChatTimeline($$anchor, $$props) {
  push($$props, true);
  let turns = prop($$props, "turns", 19, () => []), proposals = prop($$props, "proposals", 19, () => ({})), busy = prop($$props, "busy", 3, false), thinkingState = prop($$props, "thinkingState", 3, null), emptyHint = prop($$props, "emptyHint", 3, ""), suppressEmptyHint = prop($$props, "suppressEmptyHint", 3, false), condensed = prop($$props, "condensed", 3, false), onAccept = prop($$props, "onAccept", 3, () => {
  }), onReject = prop($$props, "onReject", 3, () => {
  }), onRegenerate = prop($$props, "onRegenerate", 3, () => {
  }), onEditResend = prop($$props, "onEditResend", 3, () => {
  });
  let elapsedLabel = user_derived(() => {
    var _a;
    const e = ((_a = thinkingState()) == null ? void 0 : _a.elapsed) || 0;
    if (e <= 0) return "";
    if (e < 60) return `${e}s`;
    const m = Math.floor(e / 60);
    return m < 60 ? `${m}m ${e % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
  });
  let tokensLabel = user_derived(() => {
    var _a;
    const t = ((_a = thinkingState()) == null ? void 0 : _a.tokens) || 0;
    if (t <= 0) return "";
    if (t < 1e3) return `↓ ${t} tokens`;
    const k = t / 1e3;
    return k < 10 ? `↓ ${k.toFixed(1)}k tokens` : `↓ ${Math.round(k)}k tokens`;
  });
  var div = root$4();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1$1();
      var text2 = child(div_1);
      template_effect(() => set_text(text2, emptyHint()));
      append($$anchor2, div_1);
    };
    if_block(node, ($$render) => {
      if (turns().length === 0 && !busy() && emptyHint() && !suppressEmptyHint()) $$render(consequent);
    });
  }
  var node_1 = sibling(node, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_2$3();
      append($$anchor2, div_2);
    };
    if_block(node_1, ($$render) => {
      if (condensed() && turns().length > 0) $$render(consequent_1);
    });
  }
  var node_2 = sibling(node_1, 2);
  each(node_2, 17, turns, index, ($$anchor2, turn, i) => {
    {
      let $0 = user_derived(() => i === turns().length - 1);
      let $1 = user_derived(() => get(turn).proposalId ? proposals()[get(turn).proposalId] : null);
      ChatTurn($$anchor2, {
        get turn() {
          return get(turn);
        },
        index: i,
        get isLast() {
          return get($0);
        },
        get busy() {
          return busy();
        },
        get proposal() {
          return get($1);
        },
        get onAccept() {
          return onAccept();
        },
        get onReject() {
          return onReject();
        },
        get onRegenerate() {
          return onRegenerate();
        },
        get onEditResend() {
          return onEditResend();
        }
      });
    }
  });
  var node_3 = sibling(node_2, 2);
  {
    var consequent_6 = ($$anchor2) => {
      var div_3 = root_4$2();
      var span = child(div_3);
      var text_1 = child(span);
      var node_4 = sibling(span, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var span_1 = root_5$1();
          var node_5 = child(span_1);
          {
            var consequent_2 = ($$anchor4) => {
              var text_2 = text();
              template_effect(() => set_text(text_2, get(elapsedLabel)));
              append($$anchor4, text_2);
            };
            if_block(node_5, ($$render) => {
              if (get(elapsedLabel)) $$render(consequent_2);
            });
          }
          var node_6 = sibling(node_5, 2);
          {
            var consequent_3 = ($$anchor4) => {
              var text_3 = text("·");
              append($$anchor4, text_3);
            };
            if_block(node_6, ($$render) => {
              if (get(elapsedLabel) && get(tokensLabel)) $$render(consequent_3);
            });
          }
          var node_7 = sibling(node_6, 2);
          {
            var consequent_4 = ($$anchor4) => {
              var text_4 = text();
              template_effect(() => set_text(text_4, get(tokensLabel)));
              append($$anchor4, text_4);
            };
            if_block(node_7, ($$render) => {
              if (get(tokensLabel)) $$render(consequent_4);
            });
          }
          append($$anchor3, span_1);
        };
        if_block(node_4, ($$render) => {
          if (get(elapsedLabel) || get(tokensLabel)) $$render(consequent_5);
        });
      }
      template_effect(() => {
        var _a;
        return set_text(text_1, ((_a = thinkingState()) == null ? void 0 : _a.status) || "Thinking");
      });
      append($$anchor2, div_3);
    };
    if_block(node_3, ($$render) => {
      if (busy()) $$render(consequent_6);
    });
  }
  append($$anchor, div);
  pop();
}
var root_4$1 = from_html(`<span class="pcr-mode-menu-check"></span>`);
var root_3$1 = from_html(`<div><div class="pcr-ai-mode-menu-row-text"><span class="pcr-ai-mode-menu-row-label"> </span> <span class="pcr-ai-mode-menu-row-sub"> </span></div> <!></div>`);
var root_2$2 = from_html(`<div class="pcr-ai-mode-menu"></div>`);
var root$3 = from_html(`<button type="button" class="pcr-ai-mode-dropdown-btn" title="Edit-confirm mode"><span class="pcr-ai-mode-dropdown-btn-label"> </span> <span class="pcr-ai-mode-dropdown-btn-caret"></span></button> <!>`, 1);
function ModeDropdown($$anchor, $$props) {
  push($$props, true);
  let value = prop($$props, "value", 3, "ask"), onChange = prop($$props, "onChange", 3, () => {
  });
  const OPTIONS = [
    {
      value: "ask",
      label: "Ask before edits",
      subtitle: "Show changes for review"
    },
    {
      value: "auto",
      label: "Edit Automatically",
      subtitle: "Apply changes immediately"
    },
    {
      value: "auto-run",
      label: "Auto Mode",
      subtitle: "Apply + queue prompt"
    }
  ];
  let triggerEl = state(null);
  let triggerRect = state(null);
  let isOpen = state(false);
  let activeOption = user_derived(() => OPTIONS.find((o) => o.value === value()) || OPTIONS[0]);
  function toggle(e) {
    var _a;
    e.preventDefault();
    e.stopPropagation();
    if (get(isOpen)) {
      set(isOpen, false);
      return;
    }
    set(triggerRect, ((_a = get(triggerEl)) == null ? void 0 : _a.getBoundingClientRect()) || null, true);
    set(isOpen, true);
  }
  function pick(e, opt) {
    e.stopPropagation();
    if (opt.value !== value()) onChange()(opt.value);
    set(isOpen, false);
  }
  function close() {
    set(isOpen, false);
  }
  var fragment = root$3();
  var button = first_child(fragment);
  var span = child(button);
  var text2 = child(span);
  var span_1 = sibling(span, 2);
  span_1.textContent = "▾";
  bind_this(button, ($$value) => set(triggerEl, $$value), () => get(triggerEl));
  var node = sibling(button, 2);
  {
    var consequent_1 = ($$anchor2) => {
      PopupAnchor($$anchor2, {
        get triggerRect() {
          return get(triggerRect);
        },
        get triggerEl() {
          return get(triggerEl);
        },
        popupKey: "ai-mode",
        onClose: close,
        children: ($$anchor3, $$slotProps) => {
          var div = root_2$2();
          each(div, 21, () => OPTIONS, index, ($$anchor4, opt) => {
            var div_1 = root_3$1();
            let classes;
            var div_2 = child(div_1);
            var span_2 = child(div_2);
            var text_1 = child(span_2);
            var span_3 = sibling(span_2, 2);
            var text_2 = child(span_3);
            var node_1 = sibling(div_2, 2);
            {
              var consequent = ($$anchor5) => {
                var span_4 = root_4$1();
                span_4.textContent = "✓";
                append($$anchor5, span_4);
              };
              if_block(node_1, ($$render) => {
                if (get(opt).value === value()) $$render(consequent);
              });
            }
            template_effect(() => {
              classes = set_class(div_1, 1, "pcr-mode-menu-item pcr-ai-mode-menu-row", null, classes, { "pcr-mode-menu-selected": get(opt).value === value() });
              set_text(text_1, get(opt).label);
              set_text(text_2, get(opt).subtitle);
            });
            delegated("click", div_1, (e) => pick(e, get(opt)));
            append($$anchor4, div_1);
          });
          append($$anchor3, div);
        },
        $$slots: { default: true }
      });
    };
    if_block(node, ($$render) => {
      if (get(isOpen) && get(triggerRect)) $$render(consequent_1);
    });
  }
  template_effect(() => set_text(text2, get(activeOption).label));
  delegated("click", button, toggle);
  append($$anchor, fragment);
  pop();
}
delegate(["click"]);
var root_2$1 = from_html(`<div class="pcr-ai-commands-menu"><div class="pcr-ai-commands-section-label">Options</div>  <div class="pcr-mode-menu-item pcr-ai-commands-toggle"><div class="pcr-ai-commands-toggle-text"><span class="pcr-ai-commands-toggle-label">Extra verbs</span> <span class="pcr-ai-commands-toggle-sub">Expand / Vary / Condense / Reword / Enrich</span></div> <span> </span></div></div>`);
var root$2 = from_html(`<button type="button" title="Commands &amp; options"></button> <!>`, 1);
function CommandsMenu($$anchor, $$props) {
  push($$props, true);
  let extraVerbs = prop($$props, "extraVerbs", 3, false), onChangeExtraVerbs = prop($$props, "onChangeExtraVerbs", 3, () => {
  });
  let triggerEl = state(null);
  let triggerRect = state(null);
  let isOpen = state(false);
  function toggle(e) {
    var _a;
    e.preventDefault();
    e.stopPropagation();
    if (get(isOpen)) {
      set(isOpen, false);
      return;
    }
    set(triggerRect, ((_a = get(triggerEl)) == null ? void 0 : _a.getBoundingClientRect()) || null, true);
    set(isOpen, true);
  }
  function close() {
    set(isOpen, false);
  }
  function toggleExtraVerbs(e) {
    e.stopPropagation();
    onChangeExtraVerbs()(!extraVerbs());
  }
  var fragment = root$2();
  var button = first_child(fragment);
  let classes;
  html(button, () => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="3"/><line x1="9" y1="15" x2="15" y2="9"/></svg>', true);
  bind_this(button, ($$value) => set(triggerEl, $$value), () => get(triggerEl));
  var node = sibling(button, 2);
  {
    var consequent = ($$anchor2) => {
      PopupAnchor($$anchor2, {
        get triggerRect() {
          return get(triggerRect);
        },
        get triggerEl() {
          return get(triggerEl);
        },
        popupKey: "ai-commands",
        onClose: close,
        children: ($$anchor3, $$slotProps) => {
          var div = root_2$1();
          var div_1 = sibling(child(div), 2);
          var span = sibling(child(div_1), 2);
          let classes_1;
          var text2 = child(span);
          template_effect(() => {
            classes_1 = set_class(span, 1, "pcr-ai-commands-toggle-state", null, classes_1, { "pcr-on": extraVerbs() });
            set_text(text2, extraVerbs() ? "on" : "off");
          });
          delegated("click", div_1, toggleExtraVerbs);
          append($$anchor3, div);
        },
        $$slots: { default: true }
      });
    };
    if_block(node, ($$render) => {
      if (get(isOpen) && get(triggerRect)) $$render(consequent);
    });
  }
  template_effect(() => classes = set_class(button, 1, "pcr-ai-panel-tool-btn", null, classes, { "pcr-ai-panel-tool-btn--active": extraVerbs() }));
  delegated("click", button, toggle);
  append($$anchor, fragment);
  pop();
}
delegate(["click"]);
var root_1 = from_html(`<div class="pcr-ai-drop-overlay"><div class="pcr-ai-drop-overlay-msg">Drop image to attach</div></div>`);
var root_2 = from_html(`<span class="pcr-ai-panel-close pcr-ai-panel-clearchat" title="Clear chat"></span>`);
var root_3 = from_html(`<div class="pcr-ai-panel-info"> </div>`);
var root_4 = from_html(`<div class="pcr-ai-panel-error"><strong>Error</strong> <div> </div> <button class="pcr-ai-panel-link" type="button">Dismiss</button></div>`);
var root_5 = from_html(`<div class="pcr-ai-queued" title="Will send when current generation finishes"><span class="pcr-ai-queued-label">Queued</span> <span class="pcr-ai-queued-text"> </span> <button type="button" class="pcr-ai-queued-cancel" title="Cancel queued message">×</button></div>`);
var root_7 = from_html(`<div class="pcr-ai-attach-chip"><img/> <button type="button" class="pcr-ai-attach-remove" title="Remove image">×</button></div>`);
var root_8 = from_html(`<div class="pcr-ai-attach-chip pcr-ai-attach-loading">…</div>`);
var root_6 = from_html(`<div class="pcr-ai-attach-row"><!> <!></div>`);
var root_9 = from_html(`<span class="pcr-ai-vision-warn" title="The configured model may not read images. Switch to a vision model (e.g. qwen3-vl) in AI settings.">⚠</span>`);
var root_10 = from_html(`<button class="pcr-ai-panel-submit is-stop" title="Stop generation" type="button"></button>`);
var root_11 = from_html(`<button class="pcr-ai-panel-submit" title="Send" type="button"></button>`);
var root$1 = from_html(`<div class="pcr-ai-panel"><!> <div class="pcr-ai-panel-header"><span class="pcr-ai-panel-icon"></span> <span class="pcr-ai-panel-title">AI Assistant</span> <span class="pcr-ai-panel-spacer"></span> <!> <span class="pcr-ai-panel-close" title="Close panel"></span></div> <div class="pcr-ai-panel-body"><!> <!> <!></div> <div class="pcr-ai-panel-composer"><!> <div class="pcr-ai-panel-input-card"><!> <textarea class="pcr-ai-panel-input" placeholder="Ask a follow-up, refine, or attach an image..." rows="1"></textarea> <div class="pcr-ai-panel-composer-toolbar"><div class="pcr-ai-panel-composer-group"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple="" style="display:none"/> <button type="button" class="pcr-ai-attach-btn"></button> <!> <!> <!></div> <div class="pcr-ai-panel-composer-group"><!></div></div></div></div></div> <div class="pcr-ai-divider" title="Drag to resize · double-click to reset"></div>`, 1);
function AIAssistant($$anchor, $$props) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  push($$props, true);
  const DEFAULT_WIDTH = 320;
  const MIN_WIDTH = 200;
  let node = prop($$props, "node", 7), onToggle = prop($$props, "onToggle", 3, () => {
  }), onRegister = prop($$props, "onRegister", 3, null);
  const { getCanvasScale } = useApi();
  let panelEl;
  let dividerEl;
  let inputEl;
  let bodyEl;
  let pinnedToBottom = state(true);
  function recordPinState() {
    if (!bodyEl) return;
    const remaining = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight;
    set(pinnedToBottom, remaining < 32);
  }
  function aiAssistantEnabled() {
    var _a2, _b2, _c2;
    return ((_c2 = (_b2 = (_a2 = app.ui) == null ? void 0 : _a2.settings) == null ? void 0 : _b2.getSettingValue) == null ? void 0 : _c2.call(_b2, "PromptChain.AIAssistantEnabled")) === true;
  }
  let isVisible = state(proxy(!!((_a = node().properties) == null ? void 0 : _a.pcrAiAssistant) && aiAssistantEnabled()));
  let panelWidth = state(proxy(((_b = node().properties) == null ? void 0 : _b.pcrAiPanelWidth) ?? DEFAULT_WIDTH));
  let inputText = state("");
  let attachedImages = state(proxy([]));
  let queuedImages = state(proxy([]));
  let uploadingImage = state(false);
  let visionCapable = state(true);
  let chat = state(proxy(((_c = node().properties) == null ? void 0 : _c.pcrAiChat) ?? []));
  let proposals = state(proxy(((_d = node().properties) == null ? void 0 : _d.pcrAiProposals) ?? {}));
  let historyRaw = state(proxy(((_e = node().properties) == null ? void 0 : _e.pcrAiChatRaw) ?? []));
  let chatSummary = state(proxy(((_f = node().properties) == null ? void 0 : _f.pcrAiChatSummary) ?? ""));
  let mode = state(proxy(((_g = node().properties) == null ? void 0 : _g.pcrAiAutoMode) ?? "ask"));
  let extraVerbs = state(proxy(((_h = node().properties) == null ? void 0 : _h.pcrAiExtraVerbs) ?? true));
  let busy = state(false);
  let activeRequestId = state("");
  let queuedMessage = state("");
  let stoppedByUser = false;
  let activeMessageText = "";
  let llmCallInFlight = false;
  let errorBanner = state("");
  let infoBanner = state("");
  let probing = state(false);
  let thinkingState = state(null);
  let elapsedTimer = null;
  let elapsedStart = 0;
  let wsUnsub = null;
  let canSubmit = user_derived(() => (get(inputText).trim().length > 0 || get(attachedImages).length > 0) && !get(busy));
  user_effect(() => {
    if (!node().properties) return;
    node().properties.pcrAiChat = get(chat);
  });
  user_effect(() => {
    if (!node().properties) return;
    node().properties.pcrAiProposals = get(proposals);
  });
  user_effect(() => {
    if (!node().properties) return;
    node().properties.pcrAiChatRaw = get(historyRaw);
  });
  user_effect(() => {
    if (!node().properties) return;
    node().properties.pcrAiChatSummary = get(chatSummary);
  });
  user_effect(() => {
    if (!node().properties) return;
    node().properties.pcrAiAutoMode = get(mode);
  });
  user_effect(() => {
    if (!node().properties) return;
    node().properties.pcrAiExtraVerbs = get(extraVerbs);
  });
  user_effect(() => {
    void get(chat).length;
    void get(busy);
    void get(thinkingState);
    void get(proposals);
    if (!bodyEl) return;
    if (!untrack(() => get(pinnedToBottom))) return;
    tick().then(() => {
      if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
    });
  });
  const INPUT_MAX_H = 160;
  function autoGrowInput() {
    if (!inputEl) return;
    inputEl.style.height = "auto";
    inputEl.style.overflowY = "hidden";
    const borderY = inputEl.offsetHeight - inputEl.clientHeight;
    const target = inputEl.scrollHeight + borderY;
    if (target >= INPUT_MAX_H) {
      inputEl.style.height = `${INPUT_MAX_H}px`;
      inputEl.style.overflowY = "auto";
    } else {
      inputEl.style.height = `${target}px`;
    }
  }
  async function isQueueBusy() {
    var _a2, _b2;
    try {
      const q = await api.getQueue();
      const running = ((_a2 = q == null ? void 0 : q.Running) == null ? void 0 : _a2.length) || 0;
      const pending = ((_b2 = q == null ? void 0 : q.Pending) == null ? void 0 : _b2.length) || 0;
      return running + pending > 0;
    } catch {
      return false;
    }
  }
  function showToast(severity, summary, detail) {
    var _a2, _b2, _c2;
    if ((_c2 = (_b2 = (_a2 = app) == null ? void 0 : _a2.extensionManager) == null ? void 0 : _b2.toast) == null ? void 0 : _c2.add) {
      app.extensionManager.toast.add({ severity, summary, detail, life: 4e3 });
    } else {
      console.warn(`[PromptChain AI] ${summary}: ${detail}`);
    }
  }
  function subscribeStream(reqId) {
    elapsedStart = Date.now();
    set(thinkingState, { status: "Thinking", elapsed: 0, tokens: 0 }, true);
    const handler = (e) => {
      var _a2, _b2;
      const data = e.detail || {};
      const did = data.request_id || "";
      if (did !== reqId && !did.startsWith(`${reqId}-patch-`)) return;
      switch (data.event) {
        case "thinking":
          set(
            thinkingState,
            {
              ...get(thinkingState),
              tokens: typeof data.tokens === "number" ? data.tokens : (((_a2 = get(thinkingState)) == null ? void 0 : _a2.tokens) || 0) + 1
            },
            true
          );
          break;
        case "status":
          set(thinkingState, { ...get(thinkingState), status: data.content || "Thinking" }, true);
          if (data.content && data.content !== "Loading model" && ((_b2 = get(thinkingState)) == null ? void 0 : _b2._loading)) {
            elapsedStart = Date.now();
            get(thinkingState).elapsed = 0;
          }
          get(thinkingState)._loading = data.content === "Loading model";
          break;
        case "tool_call":
          set(
            thinkingState,
            {
              ...get(thinkingState),
              status: `Calling ${data.content || "tool"}`
            },
            true
          );
          break;
        case "agent_tool_call":
          set(thinkingState, { ...get(thinkingState), status: "Patching prompt" }, true);
          break;
        case "agent_tool_result":
          set(thinkingState, { ...get(thinkingState), status: "Finishing up" }, true);
          break;
      }
    };
    api.addEventListener("promptchain_ai_stream", handler);
    wsUnsub = () => api.removeEventListener("promptchain_ai_stream", handler);
    elapsedTimer = setInterval(
      () => {
        var _a2;
        if ((_a2 = get(thinkingState)) == null ? void 0 : _a2._loading) return;
        set(
          thinkingState,
          {
            ...get(thinkingState),
            elapsed: Math.floor((Date.now() - elapsedStart) / 1e3)
          },
          true
        );
      },
      1e3
    );
  }
  function teardownStream() {
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    wsUnsub == null ? void 0 : wsUnsub();
    wsUnsub = null;
    set(thinkingState, null);
  }
  async function handleSubmitOrQueue() {
    const userText = get(inputText).trim();
    if (!userText && get(attachedImages).length === 0) return;
    if (get(busy) || await isQueueBusy()) {
      set(queuedMessage, userText, true);
      set(queuedImages, get(attachedImages), true);
      set(attachedImages, [], true);
      set(inputText, "");
      queueMicrotask(autoGrowInput);
      return;
    }
    await handleSubmit();
  }
  async function handleStop() {
    if (!get(activeRequestId)) return;
    stoppedByUser = true;
    try {
      await fetch("/promptchain/ai/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: get(activeRequestId) })
      });
    } catch {
    }
  }
  function handleComfyExecutionStart() {
    if (!llmCallInFlight) return;
    if (!get(activeRequestId)) return;
    if (activeMessageText) {
      set(queuedMessage, activeMessageText, true);
    }
    stoppedByUser = true;
    const idForCancel = get(activeRequestId);
    fetch("/promptchain/ai/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: idForCancel })
    }).catch(() => {
    });
  }
  async function handleSubmit() {
    var _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h2;
    if (!get(canSubmit)) return;
    const userText = get(inputText).trim();
    const turnImages = get(attachedImages);
    set(attachedImages, [], true);
    if (!userText && turnImages.length === 0) return;
    const nodePrompt = readNodePrompt(node());
    const reqId = cryptoId();
    set(activeRequestId, reqId, true);
    activeMessageText = userText;
    llmCallInFlight = true;
    set(busy, true);
    set(errorBanner, "");
    const now = Date.now();
    const turnId = cryptoId();
    const userTurn = {
      role: "user",
      text: userText,
      timestamp: now,
      _turnId: turnId
    };
    if (turnImages.length) {
      userTurn.images = turnImages.map((i) => ({ hash: i.hash, url: i.url }));
    }
    set(chat, [...get(chat), userTurn], true);
    set(inputText, "");
    queueMicrotask(autoGrowInput);
    subscribeStream(reqId);
    try {
      const nodePromptHeaders = (nodePrompt || "").split("\n").filter((l) => l.trim().startsWith("//")).join("\n");
      const ngrams = Array.from(/* @__PURE__ */ new Set([
        ...extractNGrams(userText),
        ...extractNGrams(nodePromptHeaders)
      ]));
      const bios = await matchCharactersInDb(ngrams, userText, nodePrompt);
      const modelInfo = ((_b2 = (_a2 = node()) == null ? void 0 : _a2._pcrGetModelInfo) == null ? void 0 : _b2.call(_a2)) || null;
      const isStandaloneMain = isStandaloneMainPromptChain(node());
      const priorPromptState = ((_d2 = (_c2 = node()) == null ? void 0 : _c2.properties) == null ? void 0 : _d2.pcrPromptState) || null;
      const node_ctx = {
        node_prompt: nodePrompt,
        bios,
        tag_format: ((_f2 = (_e2 = node()) == null ? void 0 : _e2.properties) == null ? void 0 : _f2.pcrTagFormat) || "spaces",
        model_hash: (modelInfo == null ? void 0 : modelInfo.hash) || "",
        prompt_style: ((_h2 = (_g2 = node()) == null ? void 0 : _g2.properties) == null ? void 0 : _h2.pcrPromptStyle) || "tags",
        is_standalone_main: isStandaloneMain,
        prompt_state: priorPromptState,
        extra_verbs: get(extraVerbs)
      };
      const historyForRequest = [
        ...get(historyRaw),
        { role: "user", content: [{ type: "text", text: userText }] }
      ];
      const r = await fetch("/promptchain/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: reqId,
          mode: get(mode),
          node_ctx,
          history: historyForRequest,
          history_summary: get(chatSummary),
          images: turnImages.map((i) => ({ hash: i.hash }))
        })
      });
      const data = await r.json().catch(() => ({}));
      llmCallInFlight = false;
      if (!r.ok) {
        if (!stoppedByUser) {
          set(errorBanner, (data == null ? void 0 : data.error) || `HTTP ${r.status}`, true);
        }
        set(chat, get(chat).filter((t) => t._turnId !== turnId), true);
        if (turnImages.length) set(
          attachedImages,
          turnImages,
          // let the user retry
          true
        );
        return;
      }
      const newTurns = Array.isArray(data.new_turns) ? data.new_turns : [];
      const newProposals = data.new_proposals || {};
      set(chat, [...get(chat), ...newTurns], true);
      set(proposals, { ...get(proposals), ...newProposals }, true);
      set(historyRaw, Array.isArray(data.history_for_persistence) ? data.history_for_persistence : historyForRequest, true);
      if (typeof data.history_summary === "string") {
        set(chatSummary, data.history_summary, true);
      }
      for (const [pid, p] of Object.entries(newProposals)) {
        if (p.status !== "applied") continue;
        applyProposalLocal(
          pid,
          p,
          /*persistApplied=*/
          false
        );
      }
      if (get(mode) === "auto-run") {
        const anyApplied = Object.values(newProposals).some((p) => p.status === "applied");
        if (anyApplied) {
          try {
            await app.queuePrompt(0, 1);
          } catch (e) {
            const msg = (e == null ? void 0 : e.message) || String(e);
            showToast("warn", "PromptChain AI", `Queue failed: ${msg}`);
          }
        }
      }
    } catch (e) {
      if (stoppedByUser) {
        set(chat, get(chat).filter((t) => t._turnId !== turnId), true);
      } else {
        set(errorBanner, (e == null ? void 0 : e.message) || "Request failed", true);
        set(chat, get(chat).filter((t) => t._turnId !== turnId), true);
      }
      if (turnImages.length) set(
        attachedImages,
        turnImages,
        // let the user retry
        true
      );
    } finally {
      set(busy, false);
      set(activeRequestId, "");
      activeMessageText = "";
      llmCallInFlight = false;
      stoppedByUser = false;
      teardownStream();
      drainQueueIfReady();
    }
  }
  async function drainQueueIfReady() {
    if (!get(queuedMessage) && get(queuedImages).length === 0) return;
    if (get(busy)) return;
    if (await isQueueBusy()) return;
    const pending = get(queuedMessage);
    set(queuedMessage, "");
    if (get(queuedImages).length) {
      set(attachedImages, get(queuedImages), true);
      set(queuedImages, [], true);
    }
    set(inputText, pending, true);
    queueMicrotask(autoGrowInput);
    handleSubmit();
  }
  function handleKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitOrQueue();
    }
  }
  let fileInputEl;
  let dragOver = state(false);
  async function uploadFile(file) {
    var _a2;
    if (!file || !((_a2 = file.type) == null ? void 0 : _a2.startsWith("image/"))) return;
    set(uploadingImage, true);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      const data = await postJson("/promptchain/ai/upload-image", { data: dataUrl, media_type: file.type });
      if (!(data == null ? void 0 : data.hash)) {
        showToast("warn", "PromptChain AI", (data == null ? void 0 : data.error) || "Image upload failed");
        return;
      }
      set(
        attachedImages,
        [
          ...get(attachedImages),
          { hash: data.hash, url: data.url, name: file.name || "image" }
        ],
        true
      );
      focusInput();
    } catch (e) {
      showToast("warn", "PromptChain AI", `Image upload failed: ${(e == null ? void 0 : e.message) || e}`);
    } finally {
      set(uploadingImage, false);
    }
  }
  function removeAttachedImage(hash) {
    set(attachedImages, get(attachedImages).filter((i) => i.hash !== hash), true);
  }
  function pickFile() {
    fileInputEl == null ? void 0 : fileInputEl.click();
  }
  function onFileChange(e) {
    for (const f of e.target.files || []) uploadFile(f);
    e.target.value = "";
  }
  function onComposerPaste(e) {
    var _a2, _b2;
    for (const it of ((_a2 = e.clipboardData) == null ? void 0 : _a2.items) || []) {
      if ((_b2 = it.type) == null ? void 0 : _b2.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          uploadFile(f);
        }
      }
    }
  }
  function onComposerDrop(e) {
    var _a2;
    e.preventDefault();
    set(dragOver, false);
    for (const f of ((_a2 = e.dataTransfer) == null ? void 0 : _a2.files) || []) uploadFile(f);
  }
  function onComposerDragOver(e) {
    var _a2, _b2;
    if ((_b2 = (_a2 = e.dataTransfer) == null ? void 0 : _a2.types) == null ? void 0 : _b2.includes("Files")) {
      e.preventDefault();
      set(dragOver, true);
    }
  }
  function onPanelDragLeave(e) {
    if (!panelEl) return;
    if (!e.relatedTarget || !panelEl.contains(e.relatedTarget)) set(dragOver, false);
  }
  function inferVision(cfg) {
    var _a2, _b2, _c2;
    if ((cfg == null ? void 0 : cfg.provider) === "cloud") {
      const svc = ((_a2 = cfg.cloud) == null ? void 0 : _a2.service) || "claude";
      if (svc === "claude") return true;
      return /gpt-4o|gpt-4\.1|o\d|vision|gemini/.test((((_b2 = cfg.cloud) == null ? void 0 : _b2.model) || "").toLowerCase());
    }
    return /vl|vision|llava|moondream|minicpm-?v|glm-?4\.?\d*v|gemma3|qwen2?\.?5?-?vl|pixtral|internvl/.test((((_c2 = cfg == null ? void 0 : cfg.local) == null ? void 0 : _c2.model) || "").toLowerCase());
  }
  function applyProposalLocal(proposalId, proposal, persistApplied = true) {
    var _a2, _b2, _c2;
    const view = (_a2 = node()) == null ? void 0 : _a2._pcrEditor;
    const outputText = ((_b2 = proposal == null ? void 0 : proposal.tool_result) == null ? void 0 : _b2.output_text) || "";
    const promptState = (_c2 = proposal == null ? void 0 : proposal.tool_result) == null ? void 0 : _c2.prompt_state;
    if (view && outputText) {
      applyPromptText(view, outputText, node(), promptState);
    }
    if (persistApplied) {
      const next = { ...get(proposals) };
      next[proposalId] = { ...proposal, status: "applied", appliedAt: Date.now() };
      set(proposals, next, true);
    }
  }
  async function applyProposal(proposalId) {
    const p = get(proposals)[proposalId];
    if (!p) return;
    applyProposalLocal(
      proposalId,
      p,
      /*persistApplied=*/
      true
    );
    if (get(mode) === "auto-run") {
      try {
        await app.queuePrompt(0, 1);
      } catch (e) {
        showToast("warn", "PromptChain AI", `Queue failed: ${(e == null ? void 0 : e.message) || e}`);
      }
    }
  }
  function rejectProposal(proposalId) {
    const p = get(proposals)[proposalId];
    if (!p) return;
    const next = { ...get(proposals) };
    next[proposalId] = { ...p, status: "rejected" };
    set(proposals, next, true);
  }
  function clearChat() {
    set(chat, [], true);
    set(proposals, {}, true);
    set(historyRaw, [], true);
    set(chatSummary, "");
    set(errorBanner, "");
  }
  function userTextRawIndices() {
    const idxs = [];
    get(historyRaw).forEach((m, i) => {
      if (((m == null ? void 0 : m.role) || "") !== "user") return;
      const c = m.content;
      const hasText = typeof c === "string" || Array.isArray(c) && c.some((b) => (b == null ? void 0 : b.type) === "text");
      if (hasText) idxs.push(i);
    });
    return idxs;
  }
  function resendFromUserTurn(chatIndex, newText) {
    var _a2;
    if (get(busy)) return;
    const text2 = (newText ?? "").trim();
    if (!text2) return;
    let ordinal = -1;
    for (let i = 0; i <= chatIndex && i < get(chat).length; i++) {
      if (((_a2 = get(chat)[i]) == null ? void 0 : _a2.role) === "user") ordinal++;
    }
    if (ordinal < 0) return;
    const rawIdxs = userTextRawIndices();
    if (ordinal < rawIdxs.length) {
      set(historyRaw, get(historyRaw).slice(0, rawIdxs[ordinal]), true);
    }
    set(chat, get(chat).slice(0, chatIndex), true);
    set(inputText, text2, true);
    queueMicrotask(autoGrowInput);
    handleSubmit();
  }
  function regenerateLast() {
    var _a2;
    if (get(busy)) return;
    for (let i = get(chat).length - 1; i >= 0; i--) {
      if (((_a2 = get(chat)[i]) == null ? void 0 : _a2.role) === "user") {
        resendFromUserTurn(i, get(chat)[i].text);
        return;
      }
    }
  }
  let toggleListener = null;
  function emitToggle(visible) {
    onToggle()(visible);
    toggleListener == null ? void 0 : toggleListener(visible);
  }
  function focusInput() {
    tick().then(() => inputEl == null ? void 0 : inputEl.focus());
  }
  async function maybeAutoOpen() {
    var _a2, _b2, _c2, _d2;
    if (!aiAssistantEnabled()) return;
    const pref = (_a2 = node().properties) == null ? void 0 : _a2.pcrAiAssistant;
    const setting = (_d2 = (_c2 = (_b2 = app.ui) == null ? void 0 : _b2.settings) == null ? void 0 : _c2.getSettingValue) == null ? void 0 : _d2.call(_c2, "PromptChain.AutoOpenAIAssistant");
    if (pref !== void 0) return;
    if (setting === false) return;
    try {
      await fetch("/promptchain/ai/auto-configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      }).catch(() => {
      });
      const cfg = await (await fetch("/promptchain/ai/config")).json();
      if (cfg.provider) show();
    } catch {
    }
  }
  function show() {
    if (!aiAssistantEnabled()) return;
    set(isVisible, true);
    if (node().properties) node().properties.pcrAiAssistant = true;
    emitToggle(true);
    probeLocalProvider();
    focusInput();
  }
  async function probeLocalProvider() {
    var _a2;
    set(probing, true);
    try {
      const cfgR = await fetch("/promptchain/ai/config");
      const cfg = await cfgR.json().catch(() => ({}));
      set(visionCapable, inferVision(cfg), true);
      if (!cfg.provider) {
        const auto = await postJson("/promptchain/ai/auto-configure", {});
        if (auto.configured) {
          set(
            visionCapable,
            true
            // recommended model (qwen3-vl) is vision-capable
          );
          return;
        }
        try {
          const d = await (await fetch("/promptchain/ai-setup/dismissed")).json();
          if (!d.dismissed) window.dispatchEvent(new CustomEvent("promptchain:show-ai-setup"));
        } catch {
        }
        return;
      }
      if (cfg.provider !== "local") return;
      set(infoBanner, "Checking AI provider...");
      const test = await postJson("/promptchain/ai/test", { provider: "local" });
      if (test.ok) {
        set(infoBanner, "");
        return;
      }
      const base = ((_a2 = cfg.local) == null ? void 0 : _a2.base_url) || "localhost:11434";
      set(infoBanner, `Ollama down at ${base}, attempting start...`);
      const wake = await postJson("/promptchain/ai/wake-local", {});
      set(infoBanner, "");
      if (wake.ok) {
        showToast("success", "PromptChain AI", "Started Ollama.");
      } else {
        set(
          errorBanner,
          wake.error ? `Couldn't start Ollama at ${base}. ${wake.error}` : `Ollama offline at ${base}. Start it and try again.`,
          true
        );
      }
    } catch {
    } finally {
      set(probing, false);
    }
  }
  async function postJson(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return r.json().catch(() => ({}));
  }
  function hide() {
    set(isVisible, false);
    if (node().properties) node().properties.pcrAiAssistant = false;
    emitToggle(false);
  }
  function toggle() {
    get(isVisible) ? hide() : show();
  }
  function getIsVisible() {
    return get(isVisible);
  }
  function setToggleListener(cb) {
    toggleListener = cb;
  }
  function getMaxPanelWidth() {
    var _a2, _b2;
    const row = panelEl == null ? void 0 : panelEl.parentElement;
    const rowWidth = (row == null ? void 0 : row.offsetWidth) || 0;
    if (!rowWidth) return Number.POSITIVE_INFINITY;
    const imagePanelW = ((_a2 = row.querySelector(".pcr-image-panel")) == null ? void 0 : _a2.offsetWidth) || 0;
    const imageDividerW = ((_b2 = row.querySelector(".pcr-image-divider")) == null ? void 0 : _b2.offsetWidth) || 0;
    const dividerW = (dividerEl == null ? void 0 : dividerEl.offsetWidth) || 0;
    return Math.max(MIN_WIDTH, rowWidth - imagePanelW - imageDividerW - dividerW);
  }
  function clampPanelWidth(value) {
    return Math.min(Math.max(MIN_WIDTH, value), getMaxPanelWidth());
  }
  let dividerAc;
  onMount(() => {
    var _a2;
    (_a2 = onRegister()) == null ? void 0 : _a2({ show, hide, toggle, getIsVisible, setToggleListener, cleanup });
    if (get(isVisible)) probeLocalProvider();
    else maybeAutoOpen();
    aiConfiguredHandler = () => {
      if (!get(isVisible)) maybeAutoOpen();
    };
    window.addEventListener("promptchain:ai-configured", aiConfiguredHandler);
    aiEnabledChangedHandler = (e) => {
      var _a3;
      if (((_a3 = e.detail) == null ? void 0 : _a3.value) !== true && get(isVisible)) hide();
    };
    window.addEventListener("promptchain:ai-assistant-enabled-changed", aiEnabledChangedHandler);
    dividerAc = new AbortController();
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!dividerEl || e.target !== dividerEl && !dividerEl.contains(e.target)) return;
        isDragging = true;
        startX = e.clientX;
        startWidth = (panelEl == null ? void 0 : panelEl.offsetWidth) || get(panelWidth);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const canvas = document.querySelector("canvas.lgraphcanvas");
        if (canvas && typeof e.pointerId === "number") {
          try {
            if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
          } catch {
          }
        }
      },
      { capture: true, signal: dividerAc.signal }
    );
    document.addEventListener(
      "pointermove",
      (e) => {
        if (!isDragging) return;
        e.preventDefault();
        e.stopPropagation();
        const inFs = !!document.querySelector(".pcr-fs-overlay");
        const scale = inFs ? 1 : getCanvasScale();
        const delta = (e.clientX - startX) / scale;
        set(panelWidth, clampPanelWidth(startWidth + delta), true);
      },
      { capture: true, signal: dividerAc.signal }
    );
    document.addEventListener(
      "pointerup",
      () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (node().properties) node().properties.pcrAiPanelWidth = get(panelWidth);
      },
      { capture: true, signal: dividerAc.signal }
    );
    requestAnimationFrame(() => {
      set(panelWidth, clampPanelWidth(get(panelWidth)), true);
    });
    comfyStatusHandler = (e) => {
      var _a3, _b2;
      const remaining = (_b2 = (_a3 = e == null ? void 0 : e.detail) == null ? void 0 : _a3.exec_info) == null ? void 0 : _b2.queue_remaining;
      if (typeof remaining !== "number") return;
      if (remaining !== 0) return;
      drainQueueIfReady();
    };
    api.addEventListener("status", comfyStatusHandler);
    comfyExecStartHandler = () => handleComfyExecutionStart();
    api.addEventListener("execution_start", comfyExecStartHandler);
  });
  let comfyStatusHandler = null;
  let comfyExecStartHandler = null;
  let aiConfiguredHandler = null;
  let aiEnabledChangedHandler = null;
  function cleanup() {
    dividerAc == null ? void 0 : dividerAc.abort();
  }
  onDestroy(() => {
    dividerAc == null ? void 0 : dividerAc.abort();
    if (aiConfiguredHandler) window.removeEventListener("promptchain:ai-configured", aiConfiguredHandler);
    if (aiEnabledChangedHandler) window.removeEventListener("promptchain:ai-assistant-enabled-changed", aiEnabledChangedHandler);
    if (elapsedTimer) clearInterval(elapsedTimer);
    wsUnsub == null ? void 0 : wsUnsub();
    if (comfyStatusHandler) {
      api.removeEventListener("status", comfyStatusHandler);
      comfyStatusHandler = null;
    }
    if (comfyExecStartHandler) {
      api.removeEventListener("execution_start", comfyExecStartHandler);
      comfyExecStartHandler = null;
    }
  });
  function resetWidth(e) {
    e.preventDefault();
    e.stopPropagation();
    set(panelWidth, DEFAULT_WIDTH);
    if (node().properties) node().properties.pcrAiPanelWidth = get(panelWidth);
  }
  const EMPTY_HINT = 'Describe a change to your prompt — "add red socks", "swap to anime style", "increase weight on red_socks". The assistant will propose an edit you can accept, edit automatically, or auto-run.';
  var $$exports = { show, hide, toggle, getIsVisible, setToggleListener };
  var fragment = root$1();
  var div = first_child(fragment);
  let styles;
  var node_1 = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1();
      append($$anchor2, div_1);
    };
    if_block(node_1, ($$render) => {
      if (get(dragOver)) $$render(consequent);
    });
  }
  var div_2 = sibling(node_1, 2);
  var span = child(div_2);
  span.textContent = "✨";
  var node_2 = sibling(span, 6);
  {
    var consequent_1 = ($$anchor2) => {
      var span_1 = root_2();
      span_1.textContent = "⟲";
      delegated("click", span_1, clearChat);
      append($$anchor2, span_1);
    };
    if_block(node_2, ($$render) => {
      if (get(chat).length > 0) $$render(consequent_1);
    });
  }
  var span_2 = sibling(node_2, 2);
  span_2.textContent = "✕";
  var div_3 = sibling(div_2, 2);
  var node_3 = child(div_3);
  {
    var consequent_2 = ($$anchor2) => {
      var div_4 = root_3();
      var text_1 = child(div_4);
      template_effect(() => set_text(text_1, get(infoBanner)));
      append($$anchor2, div_4);
    };
    if_block(node_3, ($$render) => {
      if (get(infoBanner)) $$render(consequent_2);
    });
  }
  var node_4 = sibling(node_3, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var div_5 = root_4();
      var div_6 = sibling(child(div_5), 2);
      var text_2 = child(div_6);
      var button = sibling(div_6, 2);
      template_effect(() => set_text(text_2, get(errorBanner)));
      delegated("click", button, () => set(errorBanner, ""));
      append($$anchor2, div_5);
    };
    if_block(node_4, ($$render) => {
      if (get(errorBanner)) $$render(consequent_3);
    });
  }
  var node_5 = sibling(node_4, 2);
  {
    let $0 = user_derived(() => !!get(chatSummary));
    ChatTimeline(node_5, {
      get turns() {
        return get(chat);
      },
      get proposals() {
        return get(proposals);
      },
      get busy() {
        return get(busy);
      },
      get thinkingState() {
        return get(thinkingState);
      },
      get condensed() {
        return get($0);
      },
      emptyHint: EMPTY_HINT,
      get suppressEmptyHint() {
        return get(probing);
      },
      onAccept: applyProposal,
      onReject: rejectProposal,
      onRegenerate: regenerateLast,
      onEditResend: resendFromUserTurn
    });
  }
  bind_this(div_3, ($$value) => bodyEl = $$value, () => bodyEl);
  var div_7 = sibling(div_3, 2);
  var node_6 = child(div_7);
  {
    var consequent_4 = ($$anchor2) => {
      var div_8 = root_5();
      var span_3 = sibling(child(div_8), 2);
      var text_3 = child(span_3);
      var button_1 = sibling(span_3, 2);
      template_effect(() => set_text(text_3, get(queuedMessage)));
      delegated("click", button_1, () => {
        set(queuedMessage, "");
      });
      append($$anchor2, div_8);
    };
    if_block(node_6, ($$render) => {
      if (get(queuedMessage)) $$render(consequent_4);
    });
  }
  var div_9 = sibling(node_6, 2);
  var node_7 = child(div_9);
  {
    var consequent_6 = ($$anchor2) => {
      var div_10 = root_6();
      var node_8 = child(div_10);
      each(node_8, 17, () => get(attachedImages), (img) => img.hash, ($$anchor3, img) => {
        var div_11 = root_7();
        var img_1 = child(div_11);
        var button_2 = sibling(img_1, 2);
        template_effect(() => {
          set_attribute(div_11, "title", get(img).name);
          set_attribute(img_1, "src", get(img).url);
          set_attribute(img_1, "alt", get(img).name);
        });
        delegated("click", button_2, () => removeAttachedImage(get(img).hash));
        append($$anchor3, div_11);
      });
      var node_9 = sibling(node_8, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var div_12 = root_8();
          append($$anchor3, div_12);
        };
        if_block(node_9, ($$render) => {
          if (get(uploadingImage)) $$render(consequent_5);
        });
      }
      append($$anchor2, div_10);
    };
    if_block(node_7, ($$render) => {
      if (get(attachedImages).length) $$render(consequent_6);
    });
  }
  var textarea = sibling(node_7, 2);
  bind_this(textarea, ($$value) => inputEl = $$value, () => inputEl);
  var div_13 = sibling(textarea, 2);
  var div_14 = child(div_13);
  var input = child(div_14);
  bind_this(input, ($$value) => fileInputEl = $$value, () => fileInputEl);
  var button_3 = sibling(input, 2);
  html(button_3, () => '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>', true);
  var node_10 = sibling(button_3, 2);
  {
    var consequent_7 = ($$anchor2) => {
      var span_4 = root_9();
      append($$anchor2, span_4);
    };
    if_block(node_10, ($$render) => {
      if (!get(visionCapable)) $$render(consequent_7);
    });
  }
  var node_11 = sibling(node_10, 2);
  CommandsMenu(node_11, {
    get extraVerbs() {
      return get(extraVerbs);
    },
    onChangeExtraVerbs: (v) => {
      set(extraVerbs, v, true);
    }
  });
  var node_12 = sibling(node_11, 2);
  ModeDropdown(node_12, {
    get value() {
      return get(mode);
    },
    onChange: (v) => {
      set(mode, v, true);
    }
  });
  var div_15 = sibling(div_14, 2);
  var node_13 = child(div_15);
  {
    var consequent_8 = ($$anchor2) => {
      var button_4 = root_10();
      html(button_4, () => '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>', true);
      delegated("click", button_4, handleStop);
      append($$anchor2, button_4);
    };
    var alternate = ($$anchor2) => {
      var button_5 = root_11();
      html(button_5, () => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>', true);
      template_effect(() => button_5.disabled = !get(canSubmit));
      delegated("click", button_5, handleSubmitOrQueue);
      append($$anchor2, button_5);
    };
    if_block(node_13, ($$render) => {
      if (get(busy)) $$render(consequent_8);
      else $$render(alternate, -1);
    });
  }
  bind_this(div, ($$value) => panelEl = $$value, () => panelEl);
  var div_16 = sibling(div, 2);
  let styles_1;
  bind_this(div_16, ($$value) => dividerEl = $$value, () => dividerEl);
  template_effect(() => {
    styles = set_style(div, "", styles, {
      width: `${get(panelWidth) ?? ""}px`,
      display: get(isVisible) ? "flex" : "none"
    });
    set_attribute(button_3, "title", get(visionCapable) ? "Attach image" : "Configured model may not support images");
    button_3.disabled = get(uploadingImage);
    styles_1 = set_style(div_16, "", styles_1, { display: get(isVisible) ? "flex" : "none" });
  });
  delegated("pointerdown", div, (e) => e.stopPropagation());
  delegated("mousedown", div, (e) => e.stopPropagation());
  delegated("click", div, (e) => e.stopPropagation());
  delegated("dblclick", div, (e) => e.stopPropagation());
  event("drop", div, onComposerDrop);
  event("dragover", div, onComposerDragOver);
  event("dragleave", div, onPanelDragLeave);
  delegated("click", span_2, hide);
  event("scroll", div_3, recordPinState);
  delegated("input", textarea, autoGrowInput);
  delegated("keydown", textarea, handleKeydown);
  event("paste", textarea, onComposerPaste);
  bind_value(textarea, () => get(inputText), ($$value) => set(inputText, $$value));
  delegated("change", input, onFileChange);
  delegated("click", button_3, pickFile);
  delegated("dblclick", div_16, resetWidth);
  append($$anchor, fragment);
  return pop($$exports);
}
delegate([
  "pointerdown",
  "mousedown",
  "click",
  "dblclick",
  "input",
  "keydown",
  "change"
]);
var root = from_html(`<!> <div class="pcr-node-content"><div class="pcr-editor-row"><!> <!> <!> <div class="pcr-editor-stack"><!> <!></div> <!></div> <!></div>`, 1);
function NodeWidget($$anchor, $$props) {
  push($$props, true);
  let shared = prop($$props, "shared", 7), onSetMode = prop($$props, "onSetMode", 3, () => {
  }), onResetIterate = prop($$props, "onResetIterate", 3, null), onToggleLock = prop($$props, "onToggleLock", 3, () => {
  }), onToggleDisable = prop($$props, "onToggleDisable", 3, () => {
  }), onToggleCollapse = prop($$props, "onToggleCollapse", 3, () => {
  }), onToggleOutput = prop($$props, "onToggleOutput", 3, () => {
  }), onToggleImage = prop($$props, "onToggleImage", 3, () => {
  }), onToggleAssistant = prop($$props, "onToggleAssistant", 3, () => {
  }), onTogglePose = prop($$props, "onTogglePose", 3, () => {
  }), onToggleRegion = prop($$props, "onToggleRegion", 3, () => {
  }), onOpenFullscreen = prop($$props, "onOpenFullscreen", 3, () => {
  }), docDropdownEl = prop($$props, "docDropdownEl", 3, null), modelIndicatorEl = prop($$props, "modelIndicatorEl", 3, null), tagsDropdownEl = prop($$props, "tagsDropdownEl", 3, null), getEditorView = prop($$props, "getEditorView", 3, () => null), onEditorPaneReady = prop($$props, "onEditorPaneReady", 3, null), onOutputPanelRegister = prop($$props, "onOutputPanelRegister", 3, null), onImagePanelRegister = prop($$props, "onImagePanelRegister", 3, null), onPosePanelRegister = prop($$props, "onPosePanelRegister", 3, null), onRegionPanelRegister = prop($$props, "onRegionPanelRegister", 3, null), onAIAssistantRegister = prop($$props, "onAIAssistantRegister", 3, null), onFooterRegister = prop($$props, "onFooterRegister", 3, null), getActivePoser = prop($$props, "getActivePoser", 3, () => null), getActiveRegionBox = prop($$props, "getActiveRegionBox", 3, () => null), apiURL = prop($$props, "apiURL", 3, (p) => p), fetchApi = prop($$props, "fetchApi", 3, (p, o) => fetch(p, o)), toast = prop($$props, "toast", 3, () => {
  }), getWorkflowId = prop($$props, "getWorkflowId", 3, () => ""), fetchWorkflowImages = prop($$props, "fetchWorkflowImages", 3, async () => []), fetchWorkflowCount = prop($$props, "fetchWorkflowCount", 3, async () => 0), subscribeHistory = prop($$props, "subscribeHistory", 3, () => () => {
  }), invalidateCache = prop($$props, "invalidateCache", 3, () => {
  }), openViewer = prop($$props, "openViewer", 3, () => {
  }), getCanvasScale = prop($$props, "getCanvasScale", 3, () => 1), getCachedImages = prop($$props, "getCachedImages", 3, () => []);
  provideApi({
    apiURL: apiURL(),
    fetchApi: fetchApi(),
    toast: toast(),
    getWorkflowId: getWorkflowId(),
    fetchWorkflowImages: fetchWorkflowImages(),
    fetchWorkflowCount: fetchWorkflowCount(),
    subscribeHistory: subscribeHistory(),
    invalidateCache: invalidateCache(),
    openViewer: openViewer(),
    getCanvasScale: getCanvasScale(),
    getCachedImages: getCachedImages()
  });
  let editorPane;
  user_effect(() => {
    var _a;
    if (editorPane) {
      (_a = onEditorPaneReady()) == null ? void 0 : _a(editorPane.getContainer());
    }
  });
  var fragment = root();
  var node_1 = first_child(fragment);
  Menubar(node_1, {
    get node() {
      return $$props.node;
    },
    get shared() {
      return shared();
    },
    get onSetMode() {
      return onSetMode();
    },
    get onResetIterate() {
      return onResetIterate();
    },
    onToggleLock: () => onToggleLock()(),
    onToggleDisable: () => onToggleDisable()(),
    onToggleCollapse: () => onToggleCollapse()(),
    onToggleOutput: () => onToggleOutput()(),
    onToggleImage: () => onToggleImage()(),
    onToggleAssistant: () => onToggleAssistant()(),
    onTogglePose: () => onTogglePose()(),
    onToggleRegion: () => onToggleRegion()(),
    get onOpenFullscreen() {
      return onOpenFullscreen();
    },
    get docDropdownEl() {
      return docDropdownEl();
    }
  });
  var div = sibling(node_1, 2);
  var div_1 = child(div);
  var node_2 = child(div_1);
  PosePanel(node_2, {
    get node() {
      return $$props.node;
    },
    get shared() {
      return shared();
    },
    get getActivePoser() {
      return getActivePoser();
    },
    onToggle: (visible) => {
      shared().posePanelVisible = visible;
    },
    get onRegister() {
      return onPosePanelRegister();
    }
  });
  var node_3 = sibling(node_2, 2);
  RegionPanel(node_3, {
    get node() {
      return $$props.node;
    },
    get shared() {
      return shared();
    },
    get getActiveRegionBox() {
      return getActiveRegionBox();
    },
    onToggle: (visible) => {
      shared().regionPanelVisible = visible;
    },
    get onRegister() {
      return onRegionPanelRegister();
    }
  });
  var node_4 = sibling(node_3, 2);
  AIAssistant(node_4, {
    get node() {
      return $$props.node;
    },
    get shared() {
      return shared();
    },
    onToggle: (visible) => {
      shared().aiAssistantOpen = visible;
    },
    get onRegister() {
      return onAIAssistantRegister();
    }
  });
  var div_2 = sibling(node_4, 2);
  var node_5 = child(div_2);
  bind_this(
    EditorPane(node_5, {
      get node() {
        return $$props.node;
      },
      get shared() {
        return shared();
      }
    }),
    ($$value) => editorPane = $$value,
    () => editorPane
  );
  var node_6 = sibling(node_5, 2);
  OutputPanel(node_6, {
    get node() {
      return $$props.node;
    },
    get shared() {
      return shared();
    },
    onToggle: (isOpen) => {
      shared().outputPanelOpen = isOpen;
    },
    get onRegister() {
      return onOutputPanelRegister();
    }
  });
  var node_7 = sibling(div_2, 2);
  ImagePanel(node_7, {
    get node() {
      return $$props.node;
    },
    get shared() {
      return shared();
    },
    onToggle: (visible) => {
      shared().imagePanelVisible = visible;
    },
    get onRegister() {
      return onImagePanelRegister();
    }
  });
  var node_8 = sibling(div_1, 2);
  Footer(node_8, {
    get node() {
      return $$props.node;
    },
    get shared() {
      return shared();
    },
    get modelIndicatorEl() {
      return modelIndicatorEl();
    },
    get tagsDropdownEl() {
      return tagsDropdownEl();
    },
    get getEditorView() {
      return getEditorView();
    },
    get onRegister() {
      return onFooterRegister();
    }
  });
  append($$anchor, fragment);
  pop();
}
class SharedState {
  constructor(node) {
    __privateAdd(
      this,
      _mode,
      // mode display — main.js keeps these in sync with node.properties
      state("switch")
    );
    __privateAdd(this, _switchIndex, state(1));
    __privateAdd(this, _locked, state(false));
    __privateAdd(this, _disabled, state(false));
    __privateAdd(this, _collapsed, state(false));
    __privateAdd(this, _connectedCount, state(0));
    __privateAdd(this, _hasLabels, state(false));
    __privateAdd(this, _switchLabel, state(""));
    __privateAdd(this, _iterateCurrent, state(0));
    __privateAdd(this, _iterateTotal, state(0));
    __privateAdd(this, _iterateCycle, state(1));
    __privateAdd(this, _switchOptions, state(proxy([])));
    __privateAdd(this, _outputPanelOpen, state(false));
    __privateAdd(this, _imagePanelVisible, state(false));
    __privateAdd(this, _aiAssistantOpen, state(false));
    __privateAdd(this, _posePanelVisible, state(false));
    __privateAdd(this, _regionPanelVisible, state(false));
    __privateAdd(this, _hasPoseStudio, state(false));
    __privateAdd(this, _hasRegionBox, state(false));
    __privateAdd(this, _compiledOutput, state(""));
    __privateAdd(this, _compiledNegOutput, state(""));
    __privateAdd(this, _compiledRegions, state(""));
    __privateAdd(this, _imageUrl, state(null));
    __privateAdd(this, _previewUrl, state(null));
    __privateAdd(this, _progress, state(null));
    __privateAdd(this, _isGenerating, state(false));
    __privateAdd(this, _rollSelected, state(null));
    if (!node) return;
    const p = node.properties || {};
    this.mode = p.pcrMode || "switch";
    this.switchIndex = p.pcrSwitchIndex ?? 1;
    this.locked = !!p.pcrLocked;
    this.disabled = !!p.pcrDisabled;
    this.collapsed = !!p.pcrCollapsed;
    this.iterateCurrent = p.pcrIterateCurrent ?? 0;
    this.iterateTotal = p.pcrIterateTotal ?? 0;
    this.iterateCycle = p.pcrIterateCycle ?? 1;
    this.outputPanelOpen = !!p.pcrOutputPanel;
    this.imagePanelVisible = !!p.pcrImagePreview;
    this.aiAssistantOpen = !!p.pcrAiAssistant;
    this.posePanelVisible = !!p.pcrPosePanel;
    this.regionPanelVisible = !!p.pcrRegionPanel;
    this.compiledOutput = p.pcrCompiledOutput || "";
    this.compiledNegOutput = p.pcrCompiledNegOutput || "";
    this.compiledRegions = p.pcrCompiledRegions || "";
  }
  get mode() {
    return get(__privateGet(this, _mode));
  }
  set mode(value) {
    set(__privateGet(this, _mode), value, true);
  }
  get switchIndex() {
    return get(__privateGet(this, _switchIndex));
  }
  set switchIndex(value) {
    set(__privateGet(this, _switchIndex), value, true);
  }
  get locked() {
    return get(__privateGet(this, _locked));
  }
  set locked(value) {
    set(__privateGet(this, _locked), value, true);
  }
  get disabled() {
    return get(__privateGet(this, _disabled));
  }
  set disabled(value) {
    set(__privateGet(this, _disabled), value, true);
  }
  get collapsed() {
    return get(__privateGet(this, _collapsed));
  }
  set collapsed(value) {
    set(__privateGet(this, _collapsed), value, true);
  }
  get connectedCount() {
    return get(__privateGet(this, _connectedCount));
  }
  set connectedCount(value) {
    set(__privateGet(this, _connectedCount), value, true);
  }
  get hasLabels() {
    return get(__privateGet(this, _hasLabels));
  }
  set hasLabels(value) {
    set(__privateGet(this, _hasLabels), value, true);
  }
  get switchLabel() {
    return get(__privateGet(this, _switchLabel));
  }
  set switchLabel(value) {
    set(__privateGet(this, _switchLabel), value, true);
  }
  get iterateCurrent() {
    return get(__privateGet(this, _iterateCurrent));
  }
  set iterateCurrent(value) {
    set(__privateGet(this, _iterateCurrent), value, true);
  }
  get iterateTotal() {
    return get(__privateGet(this, _iterateTotal));
  }
  set iterateTotal(value) {
    set(__privateGet(this, _iterateTotal), value, true);
  }
  get iterateCycle() {
    return get(__privateGet(this, _iterateCycle));
  }
  set iterateCycle(value) {
    set(__privateGet(this, _iterateCycle), value, true);
  }
  get switchOptions() {
    return get(__privateGet(this, _switchOptions));
  }
  set switchOptions(value) {
    set(__privateGet(this, _switchOptions), value, true);
  }
  get outputPanelOpen() {
    return get(__privateGet(this, _outputPanelOpen));
  }
  set outputPanelOpen(value) {
    set(__privateGet(this, _outputPanelOpen), value, true);
  }
  get imagePanelVisible() {
    return get(__privateGet(this, _imagePanelVisible));
  }
  set imagePanelVisible(value) {
    set(__privateGet(this, _imagePanelVisible), value, true);
  }
  get aiAssistantOpen() {
    return get(__privateGet(this, _aiAssistantOpen));
  }
  set aiAssistantOpen(value) {
    set(__privateGet(this, _aiAssistantOpen), value, true);
  }
  get posePanelVisible() {
    return get(__privateGet(this, _posePanelVisible));
  }
  set posePanelVisible(value) {
    set(__privateGet(this, _posePanelVisible), value, true);
  }
  get regionPanelVisible() {
    return get(__privateGet(this, _regionPanelVisible));
  }
  set regionPanelVisible(value) {
    set(__privateGet(this, _regionPanelVisible), value, true);
  }
  get hasPoseStudio() {
    return get(__privateGet(this, _hasPoseStudio));
  }
  set hasPoseStudio(value) {
    set(__privateGet(this, _hasPoseStudio), value, true);
  }
  get hasRegionBox() {
    return get(__privateGet(this, _hasRegionBox));
  }
  set hasRegionBox(value) {
    set(__privateGet(this, _hasRegionBox), value, true);
  }
  get compiledOutput() {
    return get(__privateGet(this, _compiledOutput));
  }
  set compiledOutput(value) {
    set(__privateGet(this, _compiledOutput), value, true);
  }
  get compiledNegOutput() {
    return get(__privateGet(this, _compiledNegOutput));
  }
  set compiledNegOutput(value) {
    set(__privateGet(this, _compiledNegOutput), value, true);
  }
  get compiledRegions() {
    return get(__privateGet(this, _compiledRegions));
  }
  set compiledRegions(value) {
    set(__privateGet(this, _compiledRegions), value, true);
  }
  get imageUrl() {
    return get(__privateGet(this, _imageUrl));
  }
  set imageUrl(value) {
    set(__privateGet(this, _imageUrl), value, true);
  }
  get previewUrl() {
    return get(__privateGet(this, _previewUrl));
  }
  set previewUrl(value) {
    set(__privateGet(this, _previewUrl), value, true);
  }
  get progress() {
    return get(__privateGet(this, _progress));
  }
  set progress(value) {
    set(__privateGet(this, _progress), value, true);
  }
  get isGenerating() {
    return get(__privateGet(this, _isGenerating));
  }
  set isGenerating(value) {
    set(__privateGet(this, _isGenerating), value, true);
  }
  get rollSelected() {
    return get(__privateGet(this, _rollSelected));
  }
  set rollSelected(value) {
    set(__privateGet(this, _rollSelected), value, true);
  }
}
_mode = new WeakMap();
_switchIndex = new WeakMap();
_locked = new WeakMap();
_disabled = new WeakMap();
_collapsed = new WeakMap();
_connectedCount = new WeakMap();
_hasLabels = new WeakMap();
_switchLabel = new WeakMap();
_iterateCurrent = new WeakMap();
_iterateTotal = new WeakMap();
_iterateCycle = new WeakMap();
_switchOptions = new WeakMap();
_outputPanelOpen = new WeakMap();
_imagePanelVisible = new WeakMap();
_aiAssistantOpen = new WeakMap();
_posePanelVisible = new WeakMap();
_regionPanelVisible = new WeakMap();
_hasPoseStudio = new WeakMap();
_hasRegionBox = new WeakMap();
_compiledOutput = new WeakMap();
_compiledNegOutput = new WeakMap();
_compiledRegions = new WeakMap();
_imageUrl = new WeakMap();
_previewUrl = new WeakMap();
_progress = new WeakMap();
_isGenerating = new WeakMap();
_rollSelected = new WeakMap();
function mountNodeWidget(target, props) {
  return mount(NodeWidget, { target, props });
}
function destroyNodeWidget(instance) {
  if (instance) unmount(instance);
}
export {
  SharedState,
  destroyNodeWidget,
  mountNodeWidget
};
//# sourceMappingURL=promptchain-node.js.map
