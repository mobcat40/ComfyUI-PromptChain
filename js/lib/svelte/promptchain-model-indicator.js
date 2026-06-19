import { p as push, a as prop, D as comment, v as first_child, i as if_block, g as get, k as append, l as pop, s as state, e as set, f as sibling, t as template_effect, r as event, A as from_html, n as child, y as set_text, x as set_attribute, d as delegate, c as proxy, u as user_effect, E as untrack, o as bind_this, j as delegated, C as tick, m as user_derived, w as each, z as index, h as set_class, F as update, M as unmount, L as mount } from "./disclose-version-uq4tn5Y6.js";
import { s as set_style } from "./style-Boi27oOu.js";
import { b as bind_value } from "./input-DFQhebEz.js";
import { e as extractPrecisions, r as resolveFilesForPrecision } from "./model-constants-WRFJ51jF.js";
import { api } from "/scripts/api.js";
import { s as safeJson, H as HttpError } from "./api-context-BFKo1mCD.js";
var root_2$4 = from_html(`<div class="pcr-hover-card-version svelte-oulz7g"> </div>`);
var root_3$4 = from_html(`<div class="pcr-hover-card-meta svelte-oulz7g"> </div>`);
var root_4$3 = from_html(`<div class="pcr-hover-card-tags svelte-oulz7g"> </div>`);
var root_1$4 = from_html(`<div class="pcr-hover-card svelte-oulz7g"><img class="pcr-hover-card-img svelte-oulz7g" alt=""/> <div class="pcr-hover-card-body svelte-oulz7g"><div class="pcr-hover-card-name svelte-oulz7g"> </div> <!> <!> <!></div></div>`);
function HoverCard($$anchor, $$props) {
  push($$props, true);
  let data = prop($$props, "data", 7, null), pickerEl = prop($$props, "pickerEl", 3, null);
  let visible = state(false);
  let style = state("");
  function show(anchorEl, info) {
    data(info);
    if (!(info == null ? void 0 : info.thumbnail) || !pickerEl()) return;
    set(visible, true);
    requestAnimationFrame(() => {
      const pickerRect = pickerEl().getBoundingClientRect();
      const cardWidth = 220;
      const rightSpace = window.innerWidth - pickerRect.right;
      const left = rightSpace > cardWidth + 10 ? pickerRect.right + 6 : pickerRect.left - cardWidth - 6;
      set(style, `left:${left}px;top:${pickerRect.top}px;width:${cardWidth}px`);
    });
  }
  function hide() {
    set(visible, false);
    data(null);
  }
  var $$exports = { show, hide };
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent_3 = ($$anchor2) => {
      var div = root_1$4();
      var img = child(div);
      var div_1 = sibling(img, 2);
      var div_2 = child(div_1);
      var text = child(div_2);
      var node_1 = sibling(div_2, 2);
      {
        var consequent = ($$anchor3) => {
          var div_3 = root_2$4();
          var text_1 = child(div_3);
          template_effect(() => set_text(text_1, data().version));
          append($$anchor3, div_3);
        };
        if_block(node_1, ($$render) => {
          if (data().version) $$render(consequent);
        });
      }
      var node_2 = sibling(node_1, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var div_4 = root_3$4();
          var text_2 = child(div_4);
          template_effect(($0) => set_text(text_2, $0), [
            () => [
              data().base_model,
              data().thumbs_up ? `👍 ${data().thumbs_up}` : "",
              data().downloads ? `↓ ${data().downloads}` : ""
            ].filter(Boolean).join(" · ")
          ]);
          append($$anchor3, div_4);
        };
        if_block(node_2, ($$render) => {
          if (data().base_model || data().thumbs_up || data().downloads) $$render(consequent_1);
        });
      }
      var node_3 = sibling(node_2, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_5 = root_4$3();
          var text_3 = child(div_5);
          template_effect(($0) => set_text(text_3, $0), [() => data().tags.slice(0, 5).join(", ")]);
          append($$anchor3, div_5);
        };
        if_block(node_3, ($$render) => {
          var _a;
          if ((_a = data().tags) == null ? void 0 : _a.length) $$render(consequent_2);
        });
      }
      template_effect(() => {
        set_style(div, get(style));
        set_attribute(img, "src", data().thumbnail);
        set_text(text, data().name || "");
      });
      event("error", img, (e) => {
        e.currentTarget.style.display = "none";
      });
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      var _a;
      if (get(visible) && ((_a = data()) == null ? void 0 : _a.thumbnail)) $$render(consequent_3);
    });
  }
  append($$anchor, fragment);
  return pop($$exports);
}
var root_1$3 = from_html(`<div class="pcr-model-panel-empty">Loading...</div>`);
var root_3$3 = from_html(`<div class="pcr-picker-recognition svelte-ycwcax"> </div>`);
var root_5$3 = from_html(`<span class="pcr-model-version-badge svelte-ycwcax"> </span>`);
var root_6$3 = from_html(`<span class="pcr-picker-item-meta svelte-ycwcax"> </span>`);
var root_4$2 = from_html(`<div><div class="pcr-picker-item-info svelte-ycwcax"><span class="pcr-picker-item-name svelte-ycwcax"> <!></span> <!></div> <span class="pcr-picker-item-arrow svelte-ycwcax">▸</span></div>`);
var root_8$2 = from_html(`<span> </span>`);
var root_7$2 = from_html(`<div class="pcr-picker-item pcr-picker-catalog-item svelte-ycwcax"><div class="pcr-picker-item-info svelte-ycwcax"><span class="pcr-picker-item-name svelte-ycwcax"> </span> <div class="pcr-picker-precision-row svelte-ycwcax"></div></div> <span class="pcr-picker-item-arrow svelte-ycwcax">›</span></div>`);
var root_11$1 = from_html(`<span class="pcr-model-version-badge svelte-ycwcax"> </span>`);
var root_12 = from_html(`<span class="pcr-picker-item-meta svelte-ycwcax"> </span>`);
var root_10$2 = from_html(`<div><div class="pcr-picker-item-info svelte-ycwcax"><span class="pcr-picker-item-name svelte-ycwcax"> <!></span> <!></div> <span class="pcr-picker-item-arrow svelte-ycwcax"> </span></div>`);
var root_9$2 = from_html(`<div class="pcr-picker-civitai-header svelte-ycwcax">AVAILABLE FOR DOWNLOAD</div> <!>`, 1);
var root_14 = from_html(`<div class="pcr-picker-item pcr-picker-civitai-item svelte-ycwcax"><div class="pcr-picker-item-info svelte-ycwcax"><span class="pcr-picker-item-name svelte-ycwcax"> </span> <span class="pcr-picker-item-meta svelte-ycwcax"> </span></div> <span class="pcr-picker-item-arrow svelte-ycwcax">↓</span></div>`);
var root_15 = from_html(`<div class="pcr-picker-civitai-loading svelte-ycwcax">Searching CivitAI…</div>`);
var root_16 = from_html(`<div class="pcr-picker-civitai-loading svelte-ycwcax">Loading more…</div>`);
var root_17 = from_html(`<div class="pcr-picker-civitai-empty svelte-ycwcax">No results on CivitAI</div>`);
var root_13 = from_html(`<div class="pcr-picker-civitai-header svelte-ycwcax">CIVITAI</div> <div class="pcr-picker-civitai-section svelte-ycwcax"><!> <!></div>`, 1);
var root_18 = from_html(`<div class="pcr-model-panel-empty">No matches</div>`);
var root_2$3 = from_html(`<div class="pcr-picker-header svelte-ycwcax"><input class="pcr-picker-search svelte-ycwcax" type="text" placeholder="Search models..."/> <!></div> <div><!> <!> <!> <!> <!></div>`, 1);
var root_20 = from_html(`<div><span> </span> <span class="pcr-picker-version-arrow svelte-ycwcax">▶</span></div>`);
var root_19 = from_html(`<div class="pcr-picker-submenu svelte-ycwcax"><div class="pcr-picker-submenu-header svelte-ycwcax">SELECT VERSION</div> <!></div>`);
var root_22 = from_html(`<div class="pcr-picker-version-item svelte-ycwcax"><span> </span> <span class="pcr-picker-version-arrow svelte-ycwcax">↓</span></div>`);
var root_21 = from_html(`<div class="pcr-picker-submenu svelte-ycwcax"><div class="pcr-picker-submenu-header svelte-ycwcax">SELECT VERSION</div> <!></div>`);
var root_25 = from_html(`<div class="pcr-picker-category-header svelte-ycwcax">TEMPLATES</div>`);
var root_24 = from_html(`<div class="pcr-picker-submenu-item pcr-picker-current-workflow svelte-ycwcax" title="Swap this checkpoint into your current graph and reapply its settings — keeps your wiring (regional couple, etc.)">(Current Workflow)</div> <!>`, 1);
var root_29 = from_html(`<div class="pcr-picker-category-header svelte-ycwcax"> </div>`);
var root_30 = from_html(`<div class="pcr-picker-submenu-item svelte-ycwcax"> </div>`);
var root_28 = from_html(`<!> <!>`, 1);
var root_31 = from_html(`<div class="pcr-picker-submenu-item pcr-picker-submenu-hint svelte-ycwcax">No templates available</div>`);
var root_23 = from_html(`<div class="pcr-picker-submenu svelte-ycwcax"><div class="pcr-picker-submenu-header svelte-ycwcax"> </div> <!> <!></div>`);
var root$3 = from_html(`<div class="pcr-model-picker svelte-ycwcax"><!></div> <!> <!> <!> <!>`, 1);
function ModelPicker($$anchor, $$props) {
  push($$props, true);
  let recognition = prop($$props, "recognition", 19, () => ({})), onSwapInPlace = prop($$props, "onSwapInPlace", 3, null), hasCheckpointGraph = prop($$props, "hasCheckpointGraph", 3, false), focusModelFile = prop($$props, "focusModelFile", 3, null);
  const NON_CHECKPOINT_ARCHS = /* @__PURE__ */ new Set([
    "flux",
    "flux_fill",
    "flux_schnell",
    "flux2",
    "zimage",
    "zimage_base"
  ]);
  function canSwapInPlace(model) {
    var _a;
    if (!hasCheckpointGraph() || !onSwapInPlace() || !model) return false;
    const arch = (((_a = get(modelSettings)[model.hash]) == null ? void 0 : _a.architecture) || "").toLowerCase();
    return !NON_CHECKPOINT_ARCHS.has(arch);
  }
  let models = state(proxy([]));
  let templates = state(proxy([]));
  let categoryOrder = state(proxy([]));
  let catalog = state(proxy([]));
  let modelSettings = state(proxy({}));
  let loading = state(true);
  let searchQuery = state("");
  let civitaiResults = state(proxy([]));
  let civitaiCursor = state(null);
  let civitaiLoading = state(false);
  let civitaiSearchTimer = null;
  let activeSubmenu = state(
    null
    // { type: "version"|"template", groupKey, anchorRect }
  );
  let activeNestedSubmenu = state(
    null
    // { model, versionLabel, anchorRect }
  );
  let highlightGroupName = state(null);
  let hoverCard;
  let hoverTimeout = null;
  user_effect(() => () => {
    clearTimeout(civitaiSearchTimer);
    clearTimeout(hoverTimeout);
  });
  let pickerEl;
  let listEl;
  let searchEl;
  let panelStyle = state("");
  let catalogPrecisionStatus = state(proxy({}));
  async function loadData() {
    try {
      const [modelsRes, templatesRes, catalogRes] = await Promise.all([
        fetch("/promptchain/models/list").then((r) => r.json()),
        fetch("/promptchain/templates/list").then((r) => r.json()),
        fetch("/promptchain/models/catalog").then((r) => r.json())
      ]);
      set(models, modelsRes.models || [], true);
      set(templates, templatesRes.templates || [], true);
      set(categoryOrder, templatesRes.category_order || [], true);
      set(catalog, catalogRes.catalog || [], true);
      const hashes = get(models).map((m) => m.hash).filter(Boolean);
      if (hashes.length) {
        const settingsRes = await fetch("/promptchain/models/settings/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hashes })
        }).then((r) => r.json());
        set(modelSettings, settingsRes.settings || {}, true);
      }
      await checkCatalogPrecisions();
      set(loading, false);
      requestAnimationFrame(() => searchEl == null ? void 0 : searchEl.focus());
      focusDownloadedModel();
    } catch {
      set(loading, false);
    }
  }
  async function focusDownloadedModel() {
    var _a, _b;
    if (!focusModelFile()) return;
    await tick();
    const group = get(groupedModels).find((g) => g.versions.some((v) => v.filename === focusModelFile()));
    if (!group) return;
    const model = group.versions.find((v) => v.filename === focusModelFile()) || group.versions[0];
    set(highlightGroupName, group.name, true);
    const tpls = templatesForModel(model);
    if (tpls.length === 1) {
      handleTemplateClick(tpls[0], model);
      return;
    }
    if (tpls.length > 1) {
      set(
        activeSubmenu,
        {
          type: "template",
          model,
          displayName: ((_a = get(modelSettings)[model.hash]) == null ? void 0 : _a.display_name) || model.filename
        },
        true
      );
      set(activeNestedSubmenu, null);
    }
    await tick();
    (_b = listEl == null ? void 0 : listEl.querySelector(".pcr-picker-item-highlight")) == null ? void 0 : _b.scrollIntoView({ block: "center" });
  }
  async function checkCatalogPrecisions() {
    if (!get(catalog).length) return;
    const filesToCheck = [];
    const fileMap = [];
    const status = {};
    for (const entry of get(catalog)) {
      status[entry.hash] = {};
      for (const f of entry.files || []) {
        if (!f.variants) continue;
        for (const v of f.variants) {
          if (f.folder === "diffusion_models" || f.folder === "unet") {
            filesToCheck.push({ filename: v.filename, folder: f.folder });
            fileMap.push({ entryHash: entry.hash, precision: v.precision });
          }
        }
      }
    }
    if (!filesToCheck.length) {
      set(catalogPrecisionStatus, status, true);
      return;
    }
    try {
      const checkRes = await fetch("/promptchain/models/check-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filesToCheck })
      });
      const checkData = await checkRes.json();
      for (let i = 0; i < (checkData.results || []).length; i++) {
        if (checkData.results[i].exists) {
          status[fileMap[i].entryHash][fileMap[i].precision] = true;
        }
      }
    } catch {
    }
    set(catalogPrecisionStatus, status, true);
  }
  let groupedModels = user_derived(() => {
    const sorted = get(models).slice().sort((a, b) => {
      var _a, _b;
      const nameA = ((_a = get(modelSettings)[a.hash]) == null ? void 0 : _a.display_name) || a.filename;
      const nameB = ((_b = get(modelSettings)[b.hash]) == null ? void 0 : _b.display_name) || b.filename;
      return nameA.localeCompare(nameB);
    });
    const groups = /* @__PURE__ */ new Map();
    for (const m of sorted) {
      const s = get(modelSettings)[m.hash];
      const key = (s == null ? void 0 : s.civitai_model_id) ? `civitai:${s.civitai_model_id}` : (s == null ? void 0 : s.model_name) || (s == null ? void 0 : s.display_name) || m.filename;
      if (!groups.has(key)) {
        groups.set(key, {
          name: (s == null ? void 0 : s.model_name) || (s == null ? void 0 : s.display_name) || m.filename,
          architecture: (s == null ? void 0 : s.architecture) || m.architecture || "",
          family: (s == null ? void 0 : s.family) || "",
          versions: []
        });
      }
      groups.get(key).versions.push(m);
    }
    for (const g of groups.values()) {
      g.versions.sort((a, b) => {
        const sa = get(modelSettings)[a.hash] || {};
        const sb = get(modelSettings)[b.hash] || {};
        const da = sa.release_date || "";
        const db = sb.release_date || "";
        if (da || db) return (db || "").localeCompare(da || "");
        return (sb.version || "").localeCompare(sa.version || "");
      });
      const oldestSettings = get(modelSettings)[g.versions[g.versions.length - 1].hash];
      if (oldestSettings == null ? void 0 : oldestSettings.model_name) g.name = oldestSettings.model_name;
      else if (oldestSettings == null ? void 0 : oldestSettings.display_name) g.name = oldestSettings.display_name;
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  let filteredGroups = user_derived(() => {
    const q = get(searchQuery).toLowerCase().trim();
    if (!q) return get(groupedModels);
    const terms = q.split(/\s+/);
    return get(groupedModels).filter((g) => {
      const searchText = [
        g.name,
        ...g.versions.map((v) => {
          const s = get(modelSettings)[v.hash];
          return [v.filename, s == null ? void 0 : s.architecture, s == null ? void 0 : s.family, s == null ? void 0 : s.version].filter(Boolean).join(" ");
        })
      ].join(" ").toLowerCase();
      return terms.every((t) => searchText.includes(t));
    });
  });
  let catalogInstalled = user_derived(() => {
    const q = get(searchQuery).toLowerCase().trim();
    const terms = q ? q.split(/\s+/) : [];
    return get(catalog).filter((c) => {
      const status = get(catalogPrecisionStatus)[c.hash] || {};
      if (!Object.values(status).some((v) => v)) return false;
      if (!terms.length) return true;
      const text = [
        c.display_name,
        c.model_name,
        c.architecture,
        c.family,
        c.version
      ].join(" ").toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  });
  let catalogUninstalled = user_derived(() => {
    const q = get(searchQuery).toLowerCase().trim();
    let items = get(catalog).filter((c) => {
      const status = get(catalogPrecisionStatus)[c.hash] || {};
      return !Object.values(status).some((v) => v);
    });
    if (q) {
      const terms = q.split(/\s+/);
      items = items.filter((c) => {
        const text = [c.model_name, c.architecture, c.family].filter(Boolean).join(" ").toLowerCase();
        return terms.every((t) => text.includes(t));
      });
    }
    return items;
  });
  let catalogGroups = user_derived(() => {
    const groups = /* @__PURE__ */ new Map();
    for (const entry of get(catalogUninstalled)) {
      const key = entry.civitai_model_id ? `civitai:${entry.civitai_model_id}` : entry.model_name || entry.display_name || entry.hash;
      if (!groups.has(key)) {
        groups.set(key, {
          name: entry.model_name || entry.display_name || "",
          architecture: entry.architecture || "",
          family: entry.family || "",
          versions: []
        });
      }
      groups.get(key).versions.push(entry);
    }
    for (const g of groups.values()) {
      g.versions.sort((a, b) => (b.version || "").localeCompare(a.version || "", void 0, { numeric: true }));
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  function positionPicker() {
    if (!pickerEl || !$$props.anchorEl) return;
    const rect = $$props.anchorEl.getBoundingClientRect();
    const gap = 4;
    const padding = 8;
    const spaceAbove = rect.top - padding;
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    let s = `left:${rect.left}px;`;
    if (spaceBelow >= spaceAbove) {
      s += `top:${rect.bottom + gap}px;bottom:auto;max-height:${spaceBelow - gap}px;`;
    } else {
      s += `bottom:${window.innerHeight - rect.top}px;top:auto;max-height:${spaceAbove}px;`;
    }
    set(panelStyle, s, true);
  }
  function onOutsideClick(e) {
    var _a, _b, _c, _d;
    if (pickerEl && !pickerEl.contains(e.target)) {
      if ((_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".pcr-model-indicator")) return;
      if ((_d = (_c = e.target).closest) == null ? void 0 : _d.call(_c, ".pcr-picker-submenu")) return;
      $$props.onClose();
    }
  }
  function _normalizeModelName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).sort().join(" ");
  }
  function civitaiResultIsKnown(r) {
    for (const s of Object.values(get(modelSettings))) {
      if (s.civitai_model_id && s.civitai_model_id === r.civitai_model_id) return true;
    }
    for (const c of get(catalog)) {
      if (c.civitai_model_id && c.civitai_model_id === r.civitai_model_id) return true;
    }
    const key = _normalizeModelName(r.model_name || "");
    const knownKeys = /* @__PURE__ */ new Set();
    for (const s of Object.values(get(modelSettings))) {
      const mn = s.model_name || s.display_name || "";
      if (mn) knownKeys.add(_normalizeModelName(mn));
    }
    for (const c of get(catalog)) {
      const mn = c.model_name || c.display_name || "";
      if (mn) knownKeys.add(_normalizeModelName(mn));
    }
    if (knownKeys.has(key)) return true;
    for (const known of knownKeys) {
      const knownWords = known.split(" ").filter((w) => w.length >= 3);
      const resultWords = key.split(" ").filter((w) => w.length >= 3);
      if (knownWords.length >= 2 && knownWords.every((w) => key.includes(w))) return true;
      if (resultWords.length >= 2 && resultWords.every((w) => known.includes(w))) return true;
    }
    return false;
  }
  let civitaiSearchAbort = null;
  let civitaiHasSearched = state(false);
  function doCivitaiSearch(query, append2 = false) {
    if (!query.trim()) {
      set(civitaiResults, [], true);
      return;
    }
    civitaiSearchAbort == null ? void 0 : civitaiSearchAbort.abort();
    civitaiSearchAbort = new AbortController();
    const signal = civitaiSearchAbort.signal;
    set(civitaiLoading, true);
    const params = new URLSearchParams({ q: query, limit: "10" });
    if (append2 && get(civitaiCursor)) params.set("cursor", get(civitaiCursor));
    fetch(`/promptchain/civitai/search?${params}`, { signal }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((data) => {
      if (signal.aborted) return;
      const results = data.results || [];
      const filtered = results.filter((r) => !civitaiResultIsKnown(r));
      set(civitaiResults, append2 ? [...get(civitaiResults), ...filtered] : filtered, true);
      set(civitaiCursor, data.next_cursor || null, true);
      set(civitaiLoading, false);
      set(civitaiHasSearched, true);
    }).catch((e) => {
      if (e.name === "AbortError") return;
      console.error("[PromptChain] CivitAI search failed:", e);
      set(civitaiLoading, false);
      set(civitaiHasSearched, true);
    });
  }
  function onSearchInput() {
    clearTimeout(civitaiSearchTimer);
    civitaiSearchAbort == null ? void 0 : civitaiSearchAbort.abort();
    set(civitaiResults, [], true);
    set(civitaiCursor, null);
    set(civitaiHasSearched, false);
    if (get(searchQuery).trim()) {
      set(civitaiLoading, true);
      civitaiSearchTimer = setTimeout(() => doCivitaiSearch(get(searchQuery)), 400);
    } else {
      set(civitaiLoading, false);
    }
  }
  function templatesForModel(model) {
    var _a, _b, _c, _d;
    const arch = ((_a = get(modelSettings)[model.hash]) == null ? void 0 : _a.architecture) || model.architecture;
    const family = ((_b = get(modelSettings)[model.hash]) == null ? void 0 : _b.family) || "";
    const mName = ((_c = get(modelSettings)[model.hash]) == null ? void 0 : _c.model_name) || ((_d = get(modelSettings)[model.hash]) == null ? void 0 : _d.display_name) || model.filename || "";
    return get(templates).filter((tpl) => {
      var _a2;
      if (tpl._hidden) return false;
      const scope = tpl.scope || {};
      if (scope.type === "version") return scope.model_hash === model.hash;
      if (scope.type === "model") return (scope.model_name || scope.display_name) === mName && mName;
      if (scope.type === "family") return scope.architecture === arch && scope.family === family && (!scope.version || scope.version === (((_a2 = get(modelSettings)[model.hash]) == null ? void 0 : _a2.version) || ""));
      return scope.architecture === arch;
    });
  }
  async function handleCatalogPrecisionClick(entry, prec, installed) {
    var _a;
    if (!installed) {
      $$props.onShowCatalogDownload(entry);
      return;
    }
    const resolved = resolveFilesForPrecision(entry.files, prec);
    const diffFile = resolved.find((f) => f.folder === "diffusion_models" || f.folder === "unet");
    if (!diffFile) return;
    const localModel = get(models).find((m) => m.filename === diffFile.filename);
    if (localModel && templatesForModel(localModel).length > 0) {
      set(
        activeSubmenu,
        {
          type: "template",
          model: localModel,
          displayName: ((_a = get(modelSettings)[localModel.hash]) == null ? void 0 : _a.display_name) || localModel.filename
        },
        true
      );
      set(activeNestedSubmenu, null);
    } else {
      $$props.onClose();
    }
  }
  function sortCategories(cats) {
    const known = (get(categoryOrder) || []).filter((c) => cats.includes(c));
    const unknown = cats.filter((c) => {
      var _a;
      return !((_a = get(categoryOrder)) == null ? void 0 : _a.includes(c));
    }).sort();
    return [...known, ...unknown];
  }
  function buildVersionLabel(model) {
    const settings = get(modelSettings)[model.hash];
    if (settings == null ? void 0 : settings.version_label) return settings.version_label;
    const version = (settings == null ? void 0 : settings.version) || "";
    const filename = (model.filename || "").toLowerCase();
    const precisionPatterns = [
      [/bf16/i, "BF16"],
      [/fp16/i, "FP16"],
      [/fp8/i, "FP8"],
      [/fp32/i, "FP32"],
      [/nvfp4/i, "NVFP4"],
      [/fp4/i, "FP4"],
      [/\.gguf$/i, "GGUF"]
    ];
    let precision = null;
    for (const [pattern, label] of precisionPatterns) {
      if (pattern.test(filename)) {
        precision = label;
        break;
      }
    }
    if (precision && version) {
      if (version.toLowerCase().includes(precision.toLowerCase())) {
        return version.replace(new RegExp(`\\s*${precision}`, "i"), ` (${precision})`);
      }
      return `${version} (${precision})`;
    }
    return version || model.filename || "";
  }
  function buildCatalogVersionLabel(entry) {
    var _a, _b;
    const version = entry.version || "";
    const filename = (((_b = (_a = entry.files) == null ? void 0 : _a[0]) == null ? void 0 : _b.filename) || "").toLowerCase();
    const precisionPatterns = [
      [/bf16/i, "BF16"],
      [/fp16/i, "FP16"],
      [/fp8/i, "FP8"],
      [/fp32/i, "FP32"],
      [/nvfp4/i, "NVFP4"],
      [/fp4/i, "FP4"],
      [/\.gguf$/i, "GGUF"]
    ];
    let precision = null;
    for (const [pattern, label] of precisionPatterns) {
      if (pattern.test(filename)) {
        precision = label;
        break;
      }
    }
    if (precision && version) {
      if (version.toLowerCase().includes(precision.toLowerCase())) {
        return version.replace(new RegExp(`\\s*${precision}`, "i"), ` (${precision})`);
      }
      return `${version} (${precision})`;
    }
    return version || entry.display_name || entry.model_name || "";
  }
  function handleCatalogGroupClick(group) {
    var _a, _b;
    if (((_a = get(activeSubmenu)) == null ? void 0 : _a.type) === "catalogVersion" && ((_b = get(activeSubmenu)) == null ? void 0 : _b.group) === group) {
      set(activeSubmenu, null);
      set(activeNestedSubmenu, null);
      return;
    }
    set(activeNestedSubmenu, null);
    if (group.versions.length === 1) {
      set(activeSubmenu, null);
      $$props.onShowCatalogDownload(group.versions[0]);
    } else {
      set(activeSubmenu, { type: "catalogVersion", group }, true);
    }
  }
  function handleCatalogVersionClick(entry) {
    set(activeSubmenu, null);
    set(activeNestedSubmenu, null);
    $$props.onShowCatalogDownload(entry);
  }
  function handleGroupClick(group) {
    var _a, _b, _c, _d, _e, _f, _g;
    const model = group.versions[0];
    if (((_a = get(activeSubmenu)) == null ? void 0 : _a.type) === "version" && ((_c = (_b = get(activeSubmenu)) == null ? void 0 : _b.group) == null ? void 0 : _c.name) === group.name || ((_d = get(activeSubmenu)) == null ? void 0 : _d.type) === "template" && ((_f = (_e = get(activeSubmenu)) == null ? void 0 : _e.model) == null ? void 0 : _f.hash) === model.hash) {
      set(activeSubmenu, null);
      set(activeNestedSubmenu, null);
      return;
    }
    set(activeNestedSubmenu, null);
    if (group.versions.length === 1) {
      set(
        activeSubmenu,
        {
          type: "template",
          model,
          displayName: ((_g = get(modelSettings)[model.hash]) == null ? void 0 : _g.display_name) || model.filename
        },
        true
      );
    } else {
      set(activeSubmenu, { type: "version", group }, true);
    }
  }
  function handleVersionClick(model, versionLabel) {
    var _a, _b;
    if (((_b = (_a = get(activeNestedSubmenu)) == null ? void 0 : _a.model) == null ? void 0 : _b.hash) === model.hash) {
      set(activeNestedSubmenu, null);
      return;
    }
    set(activeNestedSubmenu, { model, versionLabel }, true);
  }
  function handleTemplateClick(tpl, model) {
    var _a;
    $$props.applyTemplate(tpl, model.filename, ((_a = get(modelSettings)[model.hash]) == null ? void 0 : _a.nodes) || {});
  }
  let submenuStyle = state("");
  let nestedSubmenuStyle = state("");
  function positionSubmenu() {
    if (!pickerEl) return;
    const rect = pickerEl.getBoundingClientRect();
    const width = 220;
    const rightSpace = window.innerWidth - rect.right;
    const left = rightSpace > width + 10 ? rect.right + 2 : rect.left - width - 2;
    set(submenuStyle, `position:fixed;z-index:10001;left:${left}px;top:${rect.top}px;width:${width}px;max-height:${rect.height}px;overflow-y:auto`);
  }
  function positionNestedSubmenu() {
    if (!pickerEl) return;
    const rect = pickerEl.getBoundingClientRect();
    const width = 220;
    const submenuWidth = 220;
    const rightSpace = window.innerWidth - rect.right;
    const left = rightSpace > submenuWidth + width + 20 ? rect.right + submenuWidth + 4 : rect.left - width - submenuWidth - 4;
    set(nestedSubmenuStyle, `position:fixed;z-index:10002;left:${left}px;top:${rect.top}px;width:${width}px;max-height:${rect.height}px;overflow-y:auto`);
  }
  user_effect(() => {
    if (get(activeSubmenu)) positionSubmenu();
  });
  user_effect(() => {
    var _a;
    if (get(activeNestedSubmenu) || ((_a = get(activeSubmenu)) == null ? void 0 : _a.type) === "template") positionNestedSubmenu();
  });
  function onItemEnter(e, data) {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => hoverCard == null ? void 0 : hoverCard.show(e.currentTarget, data), 200);
  }
  function onItemLeave() {
    clearTimeout(hoverTimeout);
    hoverCard == null ? void 0 : hoverCard.hide();
  }
  function onListScroll(e) {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40 && get(civitaiCursor) && !get(civitaiLoading)) {
      doCivitaiSearch(get(searchQuery), true);
    }
  }
  function onPickerPointerDown(e) {
    if (!e.target.closest(".pcr-picker-item")) {
      set(activeSubmenu, null);
      set(activeNestedSubmenu, null);
    }
  }
  function onRecognitionUpdate() {
    loadData();
  }
  user_effect(() => {
    untrack(() => {
      loadData();
      requestAnimationFrame(() => positionPicker());
    });
    document.addEventListener("pointerdown", onOutsideClick, true);
    window.addEventListener("pcr-recognition-update", onRecognitionUpdate);
    return () => {
      document.removeEventListener("pointerdown", onOutsideClick, true);
      window.removeEventListener("pcr-recognition-update", onRecognitionUpdate);
      clearTimeout(civitaiSearchTimer);
      clearTimeout(hoverTimeout);
    };
  });
  var fragment = root$3();
  var div = first_child(fragment);
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1$3();
      append($$anchor2, div_1);
    };
    var alternate = ($$anchor2) => {
      var fragment_1 = root_2$3();
      var div_2 = first_child(fragment_1);
      var input = child(div_2);
      bind_this(input, ($$value) => searchEl = $$value, () => searchEl);
      var node_1 = sibling(input, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var div_3 = root_3$3();
          var text_1 = child(div_3);
          template_effect(() => set_text(text_1, `Recognizing models... ${recognition().done ?? ""}/${recognition().total ?? ""}`));
          append($$anchor3, div_3);
        };
        if_block(node_1, ($$render) => {
          if (recognition().running) $$render(consequent_1);
        });
      }
      var div_4 = sibling(div_2, 2);
      let classes;
      var node_2 = child(div_4);
      each(node_2, 17, () => get(filteredGroups), (group) => group.name, ($$anchor3, group) => {
        const model = user_derived(() => get(group).versions[0]);
        const displayName = user_derived(() => get(group).name);
        const meta = user_derived(() => [get(group).architecture, get(group).family].filter(Boolean).join(" · "));
        var div_5 = root_4$2();
        let classes_1;
        var div_6 = child(div_5);
        var span = child(div_6);
        var text_2 = child(span);
        var node_3 = sibling(text_2);
        {
          var consequent_2 = ($$anchor4) => {
            var span_1 = root_5$3();
            var text_3 = child(span_1);
            template_effect(() => set_text(text_3, get(group).versions.length));
            append($$anchor4, span_1);
          };
          if_block(node_3, ($$render) => {
            if (get(group).versions.length > 1) $$render(consequent_2);
          });
        }
        var node_4 = sibling(span, 2);
        {
          var consequent_3 = ($$anchor4) => {
            var span_2 = root_6$3();
            var text_4 = child(span_2);
            template_effect(() => set_text(text_4, get(meta)));
            append($$anchor4, span_2);
          };
          if_block(node_4, ($$render) => {
            if (get(meta)) $$render(consequent_3);
          });
        }
        template_effect(() => {
          var _a, _b, _c, _d, _e, _f;
          classes_1 = set_class(div_5, 1, "pcr-picker-item svelte-ycwcax", null, classes_1, {
            "pcr-picker-item-active": ((_a = get(activeSubmenu)) == null ? void 0 : _a.type) === "version" && ((_c = (_b = get(activeSubmenu)) == null ? void 0 : _b.group) == null ? void 0 : _c.name) === get(group).name || ((_d = get(activeSubmenu)) == null ? void 0 : _d.type) === "template" && ((_f = (_e = get(activeSubmenu)) == null ? void 0 : _e.model) == null ? void 0 : _f.hash) === get(model).hash,
            "pcr-picker-item-highlight": get(highlightGroupName) === get(group).name
          });
          set_text(text_2, `${get(displayName) ?? ""} `);
        });
        delegated("click", div_5, (e) => {
          e.stopPropagation();
          handleGroupClick(get(group));
        });
        event("pointerenter", div_5, (e) => {
          var _a;
          return onItemEnter(e, {
            thumbnail: (_a = get(modelSettings)[get(model).hash]) == null ? void 0 : _a.thumbnail,
            name: get(displayName)
          });
        });
        event("pointerleave", div_5, onItemLeave);
        append($$anchor3, div_5);
      });
      var node_5 = sibling(node_2, 2);
      each(node_5, 17, () => get(catalogInstalled), index, ($$anchor3, entry) => {
        const precisions = user_derived(() => extractPrecisions(get(entry).files || []));
        const status = user_derived(() => get(catalogPrecisionStatus)[get(entry).hash] || {});
        var div_7 = root_7$2();
        var div_8 = child(div_7);
        var span_3 = child(div_8);
        var text_5 = child(span_3);
        var div_9 = sibling(span_3, 2);
        each(div_9, 21, () => get(precisions), index, ($$anchor4, prec) => {
          const installed = user_derived(() => !!get(status)[get(prec)]);
          var span_4 = root_8$2();
          let classes_2;
          var text_6 = child(span_4);
          template_effect(
            ($0, $1) => {
              classes_2 = set_class(span_4, 1, "pcr-picker-precision-tag svelte-ycwcax", null, classes_2, {
                "pcr-precision-installed": get(installed),
                "pcr-precision-missing": !get(installed)
              });
              set_attribute(span_4, "title", $0);
              set_text(text_6, `${$1 ?? ""}${get(installed) ? "" : " ↓"}`);
            },
            [
              () => get(installed) ? `${get(prec).toUpperCase()} installed` : `Download ${get(prec).toUpperCase()}`,
              () => get(prec).toUpperCase()
            ]
          );
          delegated("click", span_4, (e) => {
            e.stopPropagation();
            handleCatalogPrecisionClick(get(entry), get(prec), get(installed));
          });
          append($$anchor4, span_4);
        });
        template_effect(() => set_text(text_5, get(entry).display_name || get(entry).model_name));
        delegated("click", div_7, (e) => {
          e.stopPropagation();
          const installedPrec = get(precisions).find((p) => get(status)[p]);
          if (installedPrec) handleCatalogPrecisionClick(get(entry), installedPrec, true);
        });
        append($$anchor3, div_7);
      });
      var node_6 = sibling(node_5, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var fragment_2 = root_9$2();
          var node_7 = sibling(first_child(fragment_2), 2);
          each(node_7, 17, () => get(catalogGroups), (group) => group.name, ($$anchor4, group) => {
            const meta = user_derived(() => [get(group).architecture, get(group).family].filter(Boolean).join(" · "));
            var div_10 = root_10$2();
            let classes_3;
            var div_11 = child(div_10);
            var span_5 = child(div_11);
            var text_7 = child(span_5);
            var node_8 = sibling(text_7);
            {
              var consequent_4 = ($$anchor5) => {
                var span_6 = root_11$1();
                var text_8 = child(span_6);
                template_effect(() => set_text(text_8, get(group).versions.length));
                append($$anchor5, span_6);
              };
              if_block(node_8, ($$render) => {
                if (get(group).versions.length > 1) $$render(consequent_4);
              });
            }
            var node_9 = sibling(span_5, 2);
            {
              var consequent_5 = ($$anchor5) => {
                var span_7 = root_12();
                var text_9 = child(span_7);
                template_effect(() => set_text(text_9, get(meta)));
                append($$anchor5, span_7);
              };
              if_block(node_9, ($$render) => {
                if (get(meta)) $$render(consequent_5);
              });
            }
            var span_8 = sibling(div_11, 2);
            var text_10 = child(span_8);
            template_effect(() => {
              var _a, _b;
              classes_3 = set_class(div_10, 1, "pcr-picker-item pcr-picker-catalog-item svelte-ycwcax", null, classes_3, {
                "pcr-picker-item-active": ((_a = get(activeSubmenu)) == null ? void 0 : _a.type) === "catalogVersion" && ((_b = get(activeSubmenu)) == null ? void 0 : _b.group) === get(group)
              });
              set_text(text_7, `${get(group).name ?? ""} `);
              set_text(text_10, get(group).versions.length > 1 ? "▸" : "↓");
            });
            delegated("click", div_10, (e) => {
              e.stopPropagation();
              handleCatalogGroupClick(get(group));
            });
            append($$anchor4, div_10);
          });
          append($$anchor3, fragment_2);
        };
        if_block(node_6, ($$render) => {
          if (get(catalogGroups).length) $$render(consequent_6);
        });
      }
      var node_10 = sibling(node_6, 2);
      {
        var consequent_10 = ($$anchor3) => {
          var fragment_3 = root_13();
          var div_12 = sibling(first_child(fragment_3), 2);
          var node_11 = child(div_12);
          each(node_11, 17, () => get(civitaiResults), index, ($$anchor4, result) => {
            var div_13 = root_14();
            var div_14 = child(div_13);
            var span_9 = child(div_14);
            var text_11 = child(span_9);
            var span_10 = sibling(span_9, 2);
            var text_12 = child(span_10);
            template_effect(
              ($0) => {
                set_text(text_11, get(result).model_name);
                set_text(text_12, $0);
              },
              [
                () => {
                  var _a;
                  return [
                    get(result).architecture,
                    get(result).family,
                    ((_a = get(result).file) == null ? void 0 : _a.size_gb) ? `${get(result).file.size_gb} GB` : "",
                    get(result).downloads ? `${(get(result).downloads / 1e3).toFixed(0)}k ↓` : ""
                  ].filter(Boolean).join(" · ");
                }
              ]
            );
            delegated("click", div_13, () => $$props.onShowDownload(get(result)));
            event("pointerenter", div_13, (e) => onItemEnter(e, {
              thumbnail: get(result).thumbnail,
              name: get(result).model_name,
              version: get(result).version,
              base_model: get(result).base_model,
              thumbs_up: get(result).thumbs_up,
              downloads: get(result).downloads,
              tags: get(result).tags
            }));
            event("pointerleave", div_13, onItemLeave);
            append($$anchor4, div_13);
          });
          var node_12 = sibling(node_11, 2);
          {
            var consequent_7 = ($$anchor4) => {
              var div_15 = root_15();
              append($$anchor4, div_15);
            };
            var consequent_8 = ($$anchor4) => {
              var div_16 = root_16();
              append($$anchor4, div_16);
            };
            var consequent_9 = ($$anchor4) => {
              var div_17 = root_17();
              append($$anchor4, div_17);
            };
            if_block(node_12, ($$render) => {
              if (get(civitaiLoading) && !get(civitaiResults).length) $$render(consequent_7);
              else if (get(civitaiLoading)) $$render(consequent_8, 1);
              else if (get(civitaiHasSearched) && !get(civitaiResults).length) $$render(consequent_9, 2);
            });
          }
          append($$anchor3, fragment_3);
        };
        var d = user_derived(() => get(searchQuery).trim() && (get(civitaiResults).length || get(civitaiLoading) || get(civitaiHasSearched)));
        if_block(node_10, ($$render) => {
          if (get(d)) $$render(consequent_10);
        });
      }
      var node_13 = sibling(node_10, 2);
      {
        var consequent_11 = ($$anchor3) => {
          var div_18 = root_18();
          append($$anchor3, div_18);
        };
        if_block(node_13, ($$render) => {
          if (!get(filteredGroups).length && !get(catalogInstalled).length && !get(catalogUninstalled).length && !get(civitaiResults).length && !get(civitaiLoading) && !get(civitaiHasSearched) && !get(loading)) $$render(consequent_11);
        });
      }
      bind_this(div_4, ($$value) => listEl = $$value, () => listEl);
      template_effect(($0) => classes = set_class(div_4, 1, "pcr-picker-list svelte-ycwcax", null, classes, $0), [
        () => ({
          "pcr-picker-list-reserved": get(searchQuery).trim().length > 0
        })
      ]);
      delegated("input", input, onSearchInput);
      bind_value(input, () => get(searchQuery), ($$value) => set(searchQuery, $$value));
      event("scroll", div_4, onListScroll);
      append($$anchor2, fragment_1);
    };
    if_block(node, ($$render) => {
      if (get(loading)) $$render(consequent);
      else $$render(alternate, -1);
    });
  }
  bind_this(div, ($$value) => pickerEl = $$value, () => pickerEl);
  var node_14 = sibling(div, 2);
  {
    var consequent_12 = ($$anchor2) => {
      const group = user_derived(() => get(activeSubmenu).group);
      var div_19 = root_19();
      var node_15 = sibling(child(div_19), 2);
      each(node_15, 17, () => get(group).versions, index, ($$anchor3, model) => {
        const label = user_derived(() => buildVersionLabel(get(model)));
        var div_20 = root_20();
        let classes_4;
        var span_11 = child(div_20);
        var text_13 = child(span_11);
        template_effect(() => {
          var _a, _b;
          classes_4 = set_class(div_20, 1, "pcr-picker-version-item svelte-ycwcax", null, classes_4, {
            "pcr-submenu-open": ((_b = (_a = get(activeNestedSubmenu)) == null ? void 0 : _a.model) == null ? void 0 : _b.hash) === get(model).hash
          });
          set_text(text_13, get(label));
        });
        delegated("click", div_20, () => handleVersionClick(get(model), get(label)));
        append($$anchor3, div_20);
      });
      template_effect(() => set_style(div_19, get(submenuStyle)));
      append($$anchor2, div_19);
    };
    if_block(node_14, ($$render) => {
      var _a;
      if (((_a = get(activeSubmenu)) == null ? void 0 : _a.type) === "version") $$render(consequent_12);
    });
  }
  var node_16 = sibling(node_14, 2);
  {
    var consequent_13 = ($$anchor2) => {
      const group = user_derived(() => get(activeSubmenu).group);
      var div_21 = root_21();
      var node_17 = sibling(child(div_21), 2);
      each(node_17, 17, () => get(group).versions, index, ($$anchor3, entry) => {
        var div_22 = root_22();
        var span_12 = child(div_22);
        var text_14 = child(span_12);
        template_effect(($0) => set_text(text_14, $0), [() => buildCatalogVersionLabel(get(entry))]);
        delegated("click", div_22, () => handleCatalogVersionClick(get(entry)));
        append($$anchor3, div_22);
      });
      template_effect(() => set_style(div_21, get(submenuStyle)));
      append($$anchor2, div_21);
    };
    if_block(node_16, ($$render) => {
      var _a;
      if (((_a = get(activeSubmenu)) == null ? void 0 : _a.type) === "catalogVersion") $$render(consequent_13);
    });
  }
  var node_18 = sibling(node_16, 2);
  {
    var consequent_19 = ($$anchor2) => {
      const model = user_derived(() => {
        var _a, _b;
        return ((_a = get(activeNestedSubmenu)) == null ? void 0 : _a.model) || ((_b = get(activeSubmenu)) == null ? void 0 : _b.model);
      });
      const tpls = user_derived(() => get(model) ? templatesForModel(get(model)) : []);
      const displayName = user_derived(() => {
        var _a, _b;
        return ((_a = get(activeNestedSubmenu)) == null ? void 0 : _a.versionLabel) || ((_b = get(activeSubmenu)) == null ? void 0 : _b.displayName) || "";
      });
      var div_23 = root_23();
      var div_24 = child(div_23);
      var text_15 = child(div_24);
      var node_19 = sibling(div_24, 2);
      {
        var consequent_15 = ($$anchor3) => {
          var fragment_4 = root_24();
          var div_25 = first_child(fragment_4);
          var node_20 = sibling(div_25, 2);
          {
            var consequent_14 = ($$anchor4) => {
              var div_26 = root_25();
              append($$anchor4, div_26);
            };
            if_block(node_20, ($$render) => {
              if (get(tpls).length) $$render(consequent_14);
            });
          }
          delegated("click", div_25, () => {
            var _a;
            onSwapInPlace()(get(model).filename, get(model).hash);
            (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
          });
          append($$anchor3, fragment_4);
        };
        var d_1 = user_derived(() => canSwapInPlace(get(model)));
        if_block(node_19, ($$render) => {
          if (get(d_1)) $$render(consequent_15);
        });
      }
      var node_21 = sibling(node_19, 2);
      {
        var consequent_18 = ($$anchor3) => {
          const cats = user_derived(() => [...new Set(get(tpls).map((t) => t.category || "General"))]);
          const sortedCats = user_derived(() => sortCategories(get(cats)));
          var fragment_5 = comment();
          var node_22 = first_child(fragment_5);
          each(node_22, 17, () => get(sortedCats), index, ($$anchor4, cat) => {
            const catTpls = user_derived(() => get(tpls).filter((t) => (t.category || "General") === get(cat)));
            var fragment_6 = comment();
            var node_23 = first_child(fragment_6);
            {
              var consequent_17 = ($$anchor5) => {
                var fragment_7 = root_28();
                var node_24 = first_child(fragment_7);
                {
                  var consequent_16 = ($$anchor6) => {
                    var div_27 = root_29();
                    var text_16 = child(div_27);
                    template_effect(($0) => set_text(text_16, $0), [() => get(cat).toUpperCase()]);
                    append($$anchor6, div_27);
                  };
                  if_block(node_24, ($$render) => {
                    if (get(sortedCats).length > 1) $$render(consequent_16);
                  });
                }
                var node_25 = sibling(node_24, 2);
                each(node_25, 17, () => get(catTpls), index, ($$anchor6, tpl) => {
                  var div_28 = root_30();
                  var text_17 = child(div_28);
                  template_effect(() => {
                    set_attribute(div_28, "title", get(tpl).description || "");
                    set_text(text_17, get(tpl).name);
                  });
                  delegated("click", div_28, () => handleTemplateClick(get(tpl), get(model)));
                  append($$anchor6, div_28);
                });
                append($$anchor5, fragment_7);
              };
              if_block(node_23, ($$render) => {
                if (get(catTpls).length) $$render(consequent_17);
              });
            }
            append($$anchor4, fragment_6);
          });
          append($$anchor3, fragment_5);
        };
        var alternate_1 = ($$anchor3) => {
          var div_29 = root_31();
          append($$anchor3, div_29);
        };
        if_block(node_21, ($$render) => {
          if (get(tpls).length) $$render(consequent_18);
          else $$render(alternate_1, -1);
        });
      }
      template_effect(() => {
        set_style(div_23, get(activeNestedSubmenu) ? get(nestedSubmenuStyle) : get(submenuStyle));
        set_text(text_15, get(displayName));
      });
      append($$anchor2, div_23);
    };
    if_block(node_18, ($$render) => {
      var _a;
      if (((_a = get(activeSubmenu)) == null ? void 0 : _a.type) === "template" || get(activeNestedSubmenu)) $$render(consequent_19);
    });
  }
  var node_26 = sibling(node_18, 2);
  bind_this(
    HoverCard(node_26, {
      get pickerEl() {
        return pickerEl;
      }
    }),
    ($$value) => hoverCard = $$value,
    () => hoverCard
  );
  template_effect(() => set_style(div, get(panelStyle)));
  delegated("pointerdown", div, onPickerPointerDown);
  append($$anchor, fragment);
  pop();
}
delegate(["pointerdown", "input", "click"]);
var root_1$2 = from_html(`<div class="pcr-download-progress-wrap svelte-157n7ij"><div class="pcr-download-progress-bar svelte-157n7ij"><div class="pcr-download-progress-fill svelte-157n7ij"></div></div> <div class="pcr-download-progress-text svelte-157n7ij"> </div></div>`);
var root_2$2 = from_html(`<div class="pcr-download-key-wrap svelte-157n7ij"><div class="pcr-download-key-label svelte-157n7ij">API key for auto-download &middot; <a href="https://civitai.com/user/account" target="_blank" rel="noopener" class="pcr-download-key-link svelte-157n7ij">get key</a></div> <input type="password" class="pcr-picker-search" placeholder="Paste API key..."/> <button class="pcr-download-btn pcr-download-btn-primary svelte-157n7ij">Save Key</button></div>`);
var root_3$2 = from_html(`<button class="pcr-download-btn pcr-download-btn-primary svelte-157n7ij">Restart ComfyUI</button>`);
var root_4$1 = from_html(`<button class="pcr-download-btn pcr-download-btn-primary svelte-157n7ij"> </button>`);
var root_5$2 = from_html(`<button class="pcr-download-btn svelte-157n7ij" disabled="">Restarting\\u2026</button>`);
var root_6$2 = from_html(`<button class="pcr-download-btn svelte-157n7ij">Cancel</button>`);
var root$2 = from_html(`<div class="pcr-download-overlay svelte-157n7ij"><div class="pcr-download-modal svelte-157n7ij"><div class="pcr-download-header svelte-157n7ij"><div class="pcr-download-title svelte-157n7ij"> </div> <div class="pcr-download-meta svelte-157n7ij"> <a target="_blank" rel="noopener">CivitAI</a></div></div> <div class="pcr-download-body svelte-157n7ij"><div class="pcr-download-section svelte-157n7ij"><div class="pcr-download-section-label svelte-157n7ij">Download from CivitAI:</div> <a target="_blank" rel="noopener" class="pcr-download-link svelte-157n7ij"> </a></div> <div class="pcr-download-section svelte-157n7ij"><div class="pcr-download-section-label svelte-157n7ij">Expected filename:</div> <code class="pcr-download-filename svelte-157n7ij"> </code></div> <div class="pcr-download-section svelte-157n7ij"><div class="pcr-download-section-label svelte-157n7ij"> </div> <div class="pcr-download-folder-row svelte-157n7ij"><code class="pcr-download-folder-path svelte-157n7ij"> </code> <button class="pcr-download-btn svelte-157n7ij">Open Folder</button></div></div></div> <!> <!> <div class="pcr-download-footer svelte-157n7ij"><div class="pcr-download-status svelte-157n7ij"> </div> <div class="pcr-download-buttons svelte-157n7ij"><!> <!></div></div></div></div>`);
function DownloadModal($$anchor, $$props) {
  push($$props, true);
  const { model_name, architecture, family, civitai_model_id, file } = $$props.civitaiResult;
  const civitaiUrl = `https://civitai.com/models/${civitai_model_id}`;
  let downloading = state(false);
  let progress = state(0);
  let downloadedMB = state(0);
  let totalMB = state(0);
  let statusText = state("");
  let apiKey = state("");
  let showApiKey = state(false);
  let hasApiKey = state(true);
  let fileDetected = state(false);
  let restarting = state(false);
  let showRestart = user_derived(() => get(fileDetected) && !get(restarting));
  let restartAc = null;
  user_effect(() => () => {
    restartAc == null ? void 0 : restartAc.abort();
  });
  user_effect(() => {
    untrack(() => {
      fetch("/promptchain/civitai/api-key").then((r) => r.json()).then((data) => {
        set(hasApiKey, data.has_key, true);
      }).catch(() => {
      });
    });
  });
  user_effect(() => {
    function onProgress({ detail }) {
      if (detail.filename !== file.filename) return;
      set(downloading, true);
      set(progress, detail.progress, true);
      set(downloadedMB, Math.round(detail.downloaded / 1048576), true);
      set(totalMB, Math.round(detail.total / 1048576), true);
      set(statusText, "Downloading…");
    }
    function onDone({ detail }) {
      var _a, _b;
      if (detail.filename !== file.filename) return;
      if (detail.status === "completed") {
        set(progress, 100);
        set(fileDetected, true);
        set(statusText, "✔ Download complete!");
      } else {
        set(statusText, `Failed: ${detail.error || "unknown error"}`);
        set(downloading, false);
        if (((_a = detail.error) == null ? void 0 : _a.includes("401")) || ((_b = detail.error) == null ? void 0 : _b.includes("unauthorized"))) {
          set(showApiKey, true);
        }
      }
    }
    api.addEventListener("promptchain_download_progress", onProgress);
    api.addEventListener("promptchain_download_done", onDone);
    return () => {
      api.removeEventListener("promptchain_download_progress", onProgress);
      api.removeEventListener("promptchain_download_done", onDone);
    };
  });
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) $$props.onClose();
  }
  async function startDownload() {
    set(downloading, true);
    set(progress, 0);
    set(statusText, "Starting download…");
    try {
      const res = await fetch("/promptchain/civitai/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: file.download_url,
          filename: file.filename,
          folder: file.folder,
          api_key: get(apiKey) || void 0,
          // Passed through so the backend invalidates the versions
          // cache on successful download — stops the just-installed
          // version from re-appearing as a download bubble.
          civitai_model_id
        })
      });
      const data = await safeJson(res);
      if (data.error) {
        set(statusText, data.error, true);
        set(downloading, false);
      }
    } catch (err) {
      if (err instanceof HttpError) {
        const body = err.body ? (() => {
          try {
            return JSON.parse(err.body);
          } catch {
            return null;
          }
        })() : null;
        set(statusText, (body == null ? void 0 : body.error) || `Server error: ${err.status} ${err.statusText}`, true);
      } else {
        console.error("[PromptChain] download start failed:", err);
        set(statusText, err.message || "Network error", true);
      }
      set(downloading, false);
    }
  }
  async function saveApiKey() {
    const key = get(apiKey).trim();
    if (!key) return;
    await fetch("/promptchain/civitai/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });
    set(hasApiKey, true);
    set(showApiKey, false);
    set(statusText, "Key saved.");
  }
  let folderPath = state("");
  user_effect(() => {
    untrack(() => {
      if (!(file == null ? void 0 : file.folder)) return;
      fetch(`/promptchain/system/folder-path?folder=${encodeURIComponent(file.folder)}`).then((r) => r.ok ? r.json() : null).then((data) => {
        set(folderPath, (data == null ? void 0 : data.path) || "", true);
      }).catch(() => {
      });
    });
  });
  function openFolder() {
    fetch("/promptchain/system/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: (file == null ? void 0 : file.folder) || "checkpoints" })
    });
  }
  async function restartAndResolve() {
    var _a;
    try {
      (_a = $$props.onBeforeRestart) == null ? void 0 : _a.call($$props, file.filename);
    } catch (e) {
      console.error("[PromptChain] onBeforeRestart failed:", e);
    }
    set(restarting, true);
    set(statusText, "Restarting server…");
    restartAc = new AbortController();
    const { signal } = restartAc;
    fetch("/promptchain/system/restart", { method: "POST" }).catch(() => {
    });
    const probe = async (url, timeoutMs) => {
      const outer = new AbortController();
      const timer = setTimeout(() => outer.abort(), timeoutMs);
      const cancelListener = () => outer.abort();
      signal.addEventListener("abort", cancelListener);
      try {
        return await fetch(url, { signal: outer.signal });
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancelListener);
      }
    };
    for (let i = 0; i < 120; i++) {
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, 500));
      try {
        const r = await probe("/api/system_stats", 1500);
        if (r.ok) break;
      } catch {
        if (signal.aborted) return;
      }
    }
    set(statusText, "Scanning model…");
    for (let i = 0; i < 20; i++) {
      if (signal.aborted) return;
      try {
        const r = await probe(`/promptchain/models/identity?file=${encodeURIComponent(file.filename)}`, 2e3);
        if (r.ok) {
          $$props.onModelReady(file.filename);
          return;
        }
      } catch {
        if (signal.aborted) return;
      }
      await new Promise((r) => setTimeout(r, 1e3));
    }
    set(statusText, "Model not detected after restart.");
    set(restarting, false);
  }
  function cancel() {
    if (get(downloading) && !get(fileDetected)) {
      fetch("/promptchain/civitai/download-cancel", { method: "POST" }).catch(() => {
      });
    }
    $$props.onClose();
  }
  var div = root$2();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var div_3 = child(div_2);
  var text = child(div_3);
  var div_4 = sibling(div_3, 2);
  var text_1 = child(div_4);
  var a = sibling(text_1);
  var div_5 = sibling(div_2, 2);
  var div_6 = child(div_5);
  var a_1 = sibling(child(div_6), 2);
  var text_2 = child(a_1);
  var div_7 = sibling(div_6, 2);
  var code = sibling(child(div_7), 2);
  var text_3 = child(code);
  var div_8 = sibling(div_7, 2);
  var div_9 = child(div_8);
  var text_4 = child(div_9);
  var div_10 = sibling(div_9, 2);
  var code_1 = child(div_10);
  var text_5 = child(code_1);
  var button = sibling(code_1, 2);
  var node = sibling(div_5, 2);
  {
    var consequent = ($$anchor2) => {
      var div_11 = root_1$2();
      var div_12 = child(div_11);
      var div_13 = child(div_12);
      var div_14 = sibling(div_12, 2);
      var text_6 = child(div_14);
      template_effect(
        ($0) => {
          set_style(div_13, `width: ${get(progress) ?? ""}%`);
          set_text(text_6, `${get(downloadedMB) ?? ""} / ${get(totalMB) ?? ""} MB (${$0 ?? ""}%)`);
        },
        [() => Math.round(get(progress))]
      );
      append($$anchor2, div_11);
    };
    if_block(node, ($$render) => {
      if (get(downloading) || get(progress) > 0) $$render(consequent);
    });
  }
  var node_1 = sibling(node, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_15 = root_2$2();
      var input = sibling(child(div_15), 2);
      var button_1 = sibling(input, 2);
      bind_value(input, () => get(apiKey), ($$value) => set(apiKey, $$value));
      delegated("click", button_1, saveApiKey);
      append($$anchor2, div_15);
    };
    if_block(node_1, ($$render) => {
      if (!get(hasApiKey) || get(showApiKey)) $$render(consequent_1);
    });
  }
  var div_16 = sibling(node_1, 2);
  var div_17 = child(div_16);
  var text_7 = child(div_17);
  var div_18 = sibling(div_17, 2);
  var node_2 = child(div_18);
  {
    var consequent_2 = ($$anchor2) => {
      var button_2 = root_3$2();
      delegated("click", button_2, restartAndResolve);
      append($$anchor2, button_2);
    };
    var consequent_3 = ($$anchor2) => {
      var button_3 = root_4$1();
      var text_8 = child(button_3);
      template_effect(
        ($0) => {
          button_3.disabled = $0;
          set_text(text_8, get(downloading) ? "Downloading…" : "Auto Download");
        },
        [
          () => get(downloading) || !get(hasApiKey) && !get(apiKey).trim()
        ]
      );
      delegated("click", button_3, startDownload);
      append($$anchor2, button_3);
    };
    if_block(node_2, ($$render) => {
      if (get(showRestart)) $$render(consequent_2);
      else if (!get(restarting)) $$render(consequent_3, 1);
    });
  }
  var node_3 = sibling(node_2, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var button_4 = root_5$2();
      append($$anchor2, button_4);
    };
    var alternate = ($$anchor2) => {
      var button_5 = root_6$2();
      delegated("click", button_5, cancel);
      append($$anchor2, button_5);
    };
    if_block(node_3, ($$render) => {
      if (get(restarting)) $$render(consequent_4);
      else $$render(alternate, -1);
    });
  }
  template_effect(() => {
    set_text(text, `Get Model: ${model_name ?? ""}`);
    set_text(text_1, `${architecture ?? ""} · ${family ?? ""} · ${file.size_gb ?? ""} GB · `);
    set_attribute(a, "href", civitaiUrl);
    set_attribute(a_1, "href", file.download_url);
    set_text(text_2, file.download_url);
    set_text(text_3, file.filename);
    set_text(text_4, `Destination folder (${file.folder ?? ""}):`);
    set_attribute(code_1, "title", get(folderPath) || file.folder);
    set_text(text_5, get(folderPath) || file.folder);
    set_text(text_7, get(statusText));
  });
  delegated("click", div, handleOverlayClick);
  delegated("click", button, openFolder);
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_1$1 = from_html(`<div style="margin-top:4px;font-size:11px;opacity:0.7"> </div>`);
var root_3$1 = from_html(`<button> </button>`);
var root_2$1 = from_html(`<div class="pcr-precision-picker svelte-n0tzlo"><div class="pcr-precision-buttons svelte-n0tzlo"></div></div>`);
var root_4 = from_html(`<div class="pcr-catalog-file-row svelte-n0tzlo"><span class="pcr-catalog-file-status svelte-n0tzlo"> </span> <div class="pcr-catalog-file-info svelte-n0tzlo"><div class="pcr-catalog-file-label svelte-n0tzlo"> </div> <div class="pcr-catalog-file-detail svelte-n0tzlo"> </div></div></div>`);
var root_5$1 = from_html(`<div class="pcr-download-progress-wrap svelte-n0tzlo"><div class="pcr-download-progress-bar svelte-n0tzlo"><div class="pcr-download-progress-fill svelte-n0tzlo"></div></div></div>`);
var root_6$1 = from_html(`<button class="pcr-download-btn pcr-download-btn-primary svelte-n0tzlo">Restart ComfyUI</button>`);
var root_7$1 = from_html(`<button class="pcr-download-btn pcr-download-btn-primary svelte-n0tzlo">Retry</button>`);
var root_8$1 = from_html(`<button class="pcr-download-btn pcr-download-btn-primary svelte-n0tzlo"> </button>`);
var root_9$1 = from_html(`<button class="pcr-download-btn svelte-n0tzlo" disabled="">Restarting&hellip;</button>`);
var root_10$1 = from_html(`<button class="pcr-download-btn svelte-n0tzlo"> </button>`);
var root$1 = from_html(`<div class="pcr-download-overlay svelte-n0tzlo"><div class="pcr-download-modal svelte-n0tzlo"><div class="pcr-download-header svelte-n0tzlo"><div class="pcr-download-title svelte-n0tzlo"> </div> <div class="pcr-download-meta svelte-n0tzlo"> </div> <!></div> <!> <div class="pcr-download-body svelte-n0tzlo"></div> <!> <div class="pcr-download-footer svelte-n0tzlo"><div class="pcr-download-status svelte-n0tzlo"> </div> <div class="pcr-download-buttons svelte-n0tzlo"><!> <!></div></div></div></div>`);
function CatalogDownloadModal($$anchor, $$props) {
  push($$props, true);
  function resolveFileDownloadUrl(file) {
    if (file.download_url) return file.download_url;
    const source = file.source;
    if (!source) return "";
    if (source.provider === "huggingface") return `https://huggingface.co/${source.repo}/resolve/main/${source.path}`;
    if (source.provider === "civitai") return source.download_url || "";
    return source.url || "";
  }
  function totalSizeForPrecision(files, precision) {
    return resolveFilesForPrecision(files, precision).reduce((sum, f) => sum + (f.size_bytes || 0), 0);
  }
  function formatGB(bytes) {
    return (bytes / 1024 ** 3).toFixed(1);
  }
  let fileSizes = state(proxy({}));
  function sizeOf(f) {
    return f.size_bytes || get(fileSizes)[f.filename] || 0;
  }
  async function resolveSizes(files) {
    for (const f of files) {
      if (sizeOf(f)) continue;
      const url = resolveFileDownloadUrl(f);
      if (!url) continue;
      try {
        const r = await fetch("/promptchain/civitai/file-size", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
        const { size_bytes } = await r.json();
        if (size_bytes > 0) set(fileSizes, { ...get(fileSizes), [f.filename]: size_bytes }, true);
      } catch {
      }
    }
  }
  const rawFiles = $$props.catalogEntry.files || [];
  const precisions = extractPrecisions(rawFiles);
  let selectedPrecision = state(proxy(precisions[0] || null));
  let resolvedFiles = user_derived(() => get(selectedPrecision) ? resolveFilesForPrecision(rawFiles, get(selectedPrecision)) : rawFiles);
  let fileStatuses = state(proxy({}));
  let downloading = state(false);
  let currentFileIdx = state(-1);
  let progress = state(0);
  let statusText = state("");
  let restarting = state(false);
  let filesToDownload = state(proxy([]));
  let checkFailed = state(false);
  let restartAc = null;
  user_effect(() => () => {
    restartAc == null ? void 0 : restartAc.abort();
  });
  let allDone = user_derived(() => get(resolvedFiles).length > 0 && get(resolvedFiles).every((f) => get(fileStatuses)[f.filename] === "done"));
  let showRestart = user_derived(() => get(allDone) && !get(restarting));
  let totalBytes = user_derived(() => get(resolvedFiles).reduce((sum, f) => sum + sizeOf(f), 0));
  let metaLine = user_derived(() => {
    const parts = [
      $$props.catalogEntry.architecture,
      $$props.catalogEntry.family
    ].filter(Boolean);
    if (get(totalBytes) > 0) parts.push(`${formatGB(get(totalBytes))} GB total`);
    return parts.join(" · ");
  });
  let downloadBtnLabel = user_derived(() => {
    if (get(downloading)) return "Downloading…";
    const missing = get(resolvedFiles).filter((f) => get(fileStatuses)[f.filename] !== "done");
    if (missing.length === get(resolvedFiles).length) return "Download All";
    return `Download ${missing.length} Missing`;
  });
  user_effect(() => {
    const files = get(resolvedFiles);
    set(statusText, "Checking…");
    (async () => {
      await resolveSizes(files);
      await checkFiles(files);
    })();
  });
  async function checkFiles(files) {
    set(statusText, "Checking local files…");
    set(fileStatuses, {}, true);
    set(filesToDownload, [], true);
    set(checkFailed, false);
    try {
      const res = await fetch("/promptchain/models/check-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({
            filename: f.filename,
            folder: f.folder,
            size_bytes: f.size_bytes || 0
          }))
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = data.results || [];
      const newStatuses = {};
      const missing = [];
      for (let i = 0; i < results.length; i++) {
        newStatuses[results[i].filename || files[i].filename] = results[i].exists ? "done" : "pending";
        if (!results[i].exists) missing.push(i);
      }
      set(fileStatuses, newStatuses, true);
      set(filesToDownload, missing, true);
      if (missing.length === 0) {
        set(statusText, "Registering model…");
        await registerDownloadedModel(files);
        set(statusText, "All files present!");
      } else {
        const dlBytes = missing.reduce((sum, i) => sum + sizeOf(files[i]), 0);
        set(statusText, `${missing.length} file${missing.length > 1 ? "s" : ""} to download${dlBytes > 0 ? ` (${formatGB(dlBytes)} GB)` : ""}`);
      }
    } catch (e) {
      console.error("[PromptChain] file check failed:", e);
      set(filesToDownload, [], true);
      set(checkFailed, true);
      set(statusText, "Could not check files — click Retry");
    }
  }
  user_effect(() => {
    function onProgress({ detail }) {
      if (get(currentFileIdx) < 0 || get(currentFileIdx) >= get(filesToDownload).length) return;
      const currentFile = get(resolvedFiles)[get(filesToDownload)[get(currentFileIdx)]];
      if (detail.filename !== currentFile.filename) return;
      set(progress, detail.progress, true);
      const mb = (detail.downloaded / 1048576).toFixed(0);
      const totalMb = (detail.total / 1048576).toFixed(0);
      set(statusText, `${currentFile.label || currentFile.filename}: ${mb} / ${totalMb} MB (${detail.progress}%)`);
    }
    function onDone({ detail }) {
      if (get(currentFileIdx) < 0 || get(currentFileIdx) >= get(filesToDownload).length) return;
      const fi = get(filesToDownload)[get(currentFileIdx)];
      if (detail.filename !== get(resolvedFiles)[fi].filename) return;
      if (detail.status === "completed") {
        get(fileStatuses)[get(resolvedFiles)[fi].filename] = "done";
        downloadNext();
      } else {
        get(fileStatuses)[get(resolvedFiles)[fi].filename] = "failed";
        set(statusText, `Failed: ${detail.error || "unknown error"}`);
        set(downloading, false);
      }
    }
    api.addEventListener("promptchain_download_progress", onProgress);
    api.addEventListener("promptchain_download_done", onDone);
    return () => {
      api.removeEventListener("promptchain_download_progress", onProgress);
      api.removeEventListener("promptchain_download_done", onDone);
    };
  });
  async function startDownload() {
    set(downloading, true);
    set(filesToDownload, get(resolvedFiles).map((f, i) => get(fileStatuses)[f.filename] !== "done" ? i : -1).filter((i) => i >= 0), true);
    set(currentFileIdx, -1);
    downloadNext();
  }
  async function downloadNext() {
    update(currentFileIdx);
    if (get(currentFileIdx) >= get(filesToDownload).length) {
      set(progress, 100);
      set(downloading, false);
      set(statusText, "Registering model…");
      await registerDownloadedModel(get(resolvedFiles));
      set(statusText, "✔ All files downloaded!");
      return;
    }
    const fi = get(filesToDownload)[get(currentFileIdx)];
    const file = get(resolvedFiles)[fi];
    get(fileStatuses)[file.filename] = "downloading";
    set(progress, 0);
    set(statusText, `Downloading ${get(currentFileIdx) + 1}/${get(filesToDownload).length}: ${file.label || file.filename}`);
    const url = resolveFileDownloadUrl(file);
    try {
      const res = await fetch("/promptchain/civitai/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, filename: file.filename, folder: file.folder })
      });
      const data = await res.json();
      if (data.error) {
        get(fileStatuses)[file.filename] = "failed";
        set(statusText, data.error, true);
        set(downloading, false);
      }
    } catch (err) {
      get(fileStatuses)[file.filename] = "failed";
      set(statusText, err.message, true);
      set(downloading, false);
    }
  }
  async function registerDownloadedModel(files) {
    const diffusionFile = files.find((f) => f.folder === "diffusion_models") || files[0];
    try {
      await fetch("/promptchain/models/scan", { method: "POST" });
      const idRes = await fetch(`/promptchain/models/identity?file=${encodeURIComponent(diffusionFile.filename)}`);
      if (!idRes.ok) return;
      const identity = await idRes.json();
      if (!(identity == null ? void 0 : identity.hash)) return;
      const companionNodes = {};
      for (const f of files) {
        if (f.folder === "text_encoders") {
          companionNodes["CLIPLoader"] = { clip_name: f.filename };
          companionNodes["DualCLIPLoader"] = { clip_name: f.filename };
        } else if (f.folder === "vae") {
          companionNodes["VAELoader"] = { vae_name: f.filename };
        } else if (f.folder === "diffusion_models" || f.folder === "unet") {
          companionNodes["UNETLoader"] = { unet_name: f.filename };
        }
      }
      if (Object.keys(companionNodes).length) {
        await fetch(`/promptchain/models/settings/${identity.hash}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes: companionNodes })
        });
      }
    } catch {
    }
  }
  async function restartAndResolve() {
    set(restarting, true);
    set(statusText, "Restarting server…");
    restartAc = new AbortController();
    const { signal } = restartAc;
    fetch("/promptchain/system/restart", { method: "POST" }).catch(() => {
    });
    for (let i = 0; i < 120; i++) {
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, 500));
      try {
        const r = await fetch("/api/system_stats", { signal });
        if (r.ok) break;
      } catch {
        if (signal.aborted) return;
      }
    }
    set(statusText, "Scanning model…");
    const diffusionFile = get(resolvedFiles).find((f) => f.folder === "diffusion_models") || get(resolvedFiles)[0];
    for (let i = 0; i < 20; i++) {
      if (signal.aborted) return;
      try {
        const r = await fetch(`/promptchain/models/identity?file=${encodeURIComponent(diffusionFile.filename)}`, { signal });
        if (r.ok) {
          $$props.onModelReady(diffusionFile.filename);
          return;
        }
      } catch {
        if (signal.aborted) return;
      }
      await new Promise((r) => setTimeout(r, 1e3));
    }
    set(statusText, "Model not detected after restart.");
    set(restarting, false);
  }
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) cancel();
  }
  function cancel() {
    if (get(downloading)) {
      fetch("/promptchain/civitai/download-cancel", { method: "POST" }).catch(() => {
      });
    }
    $$props.onClose();
  }
  function statusIcon(filename) {
    const s = get(fileStatuses)[filename];
    if (s === "done") return "✔";
    if (s === "failed") return "✘";
    if (s === "downloading") return "⟳";
    return "○";
  }
  function statusColor(filename) {
    const s = get(fileStatuses)[filename];
    if (s === "done") return "#4caf50";
    if (s === "failed") return "#f44336";
    if (s === "downloading") return "#4fc3f7";
    return "";
  }
  var div = root$1();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var div_3 = child(div_2);
  var text = child(div_3);
  var div_4 = sibling(div_3, 2);
  var text_1 = child(div_4);
  var node = sibling(div_4, 2);
  {
    var consequent = ($$anchor2) => {
      var div_5 = root_1$1();
      var text_2 = child(div_5);
      template_effect(() => set_text(text_2, $$props.catalogEntry.description));
      append($$anchor2, div_5);
    };
    if_block(node, ($$render) => {
      if ($$props.catalogEntry.description) $$render(consequent);
    });
  }
  var node_1 = sibling(div_2, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_6 = root_2$1();
      var div_7 = child(div_6);
      each(div_7, 21, () => precisions, index, ($$anchor3, prec) => {
        var button = root_3$1();
        var text_3 = child(button);
        template_effect(
          ($0, $1) => {
            set_class(button, 1, `pcr-precision-btn ${get(prec) === get(selectedPrecision) ? "pcr-precision-active" : ""}`, "svelte-n0tzlo");
            button.disabled = get(downloading);
            set_text(text_3, `${$0 ?? ""} (${$1 ?? ""} GB)`);
          },
          [
            () => get(prec).toUpperCase(),
            () => formatGB(totalSizeForPrecision(rawFiles, get(prec)))
          ]
        );
        delegated("click", button, () => {
          set(selectedPrecision, get(prec), true);
        });
        append($$anchor3, button);
      });
      append($$anchor2, div_6);
    };
    if_block(node_1, ($$render) => {
      if (precisions.length > 1) $$render(consequent_1);
    });
  }
  var div_8 = sibling(node_1, 2);
  each(div_8, 21, () => get(resolvedFiles), index, ($$anchor2, file) => {
    var div_9 = root_4();
    let styles;
    var span = child(div_9);
    let styles_1;
    var text_4 = child(span);
    var div_10 = sibling(span, 2);
    var div_11 = child(div_10);
    var text_5 = child(div_11);
    var div_12 = sibling(div_11, 2);
    var text_6 = child(div_12);
    template_effect(
      ($0, $1, $2) => {
        styles = set_style(div_9, "", styles, {
          opacity: get(fileStatuses)[get(file).filename] === "done" ? 0.5 : 1
        });
        styles_1 = set_style(span, "", styles_1, $0);
        set_text(text_4, $1);
        set_text(text_5, get(file).label || get(file).filename);
        set_text(text_6, `${get(file).filename ?? ""}${$2 ?? ""} · ${get(file).folder ?? ""}/`);
      },
      [
        () => ({ color: statusColor(get(file).filename) }),
        () => statusIcon(get(file).filename),
        () => sizeOf(get(file)) ? ` · ${formatGB(sizeOf(get(file)))} GB` : ""
      ]
    );
    append($$anchor2, div_9);
  });
  var node_2 = sibling(div_8, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div_13 = root_5$1();
      var div_14 = child(div_13);
      var div_15 = child(div_14);
      template_effect(() => set_style(div_15, `width: ${get(progress) ?? ""}%`));
      append($$anchor2, div_13);
    };
    if_block(node_2, ($$render) => {
      if (get(downloading) || get(progress) > 0) $$render(consequent_2);
    });
  }
  var div_16 = sibling(node_2, 2);
  var div_17 = child(div_16);
  var text_7 = child(div_17);
  var div_18 = sibling(div_17, 2);
  var node_3 = child(div_18);
  {
    var consequent_3 = ($$anchor2) => {
      var button_1 = root_6$1();
      delegated("click", button_1, restartAndResolve);
      append($$anchor2, button_1);
    };
    var consequent_4 = ($$anchor2) => {
      var button_2 = root_7$1();
      delegated("click", button_2, () => checkFiles(get(resolvedFiles)));
      append($$anchor2, button_2);
    };
    var consequent_5 = ($$anchor2) => {
      var button_3 = root_8$1();
      var text_8 = child(button_3);
      template_effect(() => {
        button_3.disabled = get(downloading) || get(filesToDownload).length === 0;
        set_text(text_8, get(downloadBtnLabel));
      });
      delegated("click", button_3, startDownload);
      append($$anchor2, button_3);
    };
    if_block(node_3, ($$render) => {
      if (get(showRestart)) $$render(consequent_3);
      else if (get(checkFailed)) $$render(consequent_4, 1);
      else if (!get(restarting) && !get(allDone)) $$render(consequent_5, 2);
    });
  }
  var node_4 = sibling(node_3, 2);
  {
    var consequent_6 = ($$anchor2) => {
      var button_4 = root_9$1();
      append($$anchor2, button_4);
    };
    var alternate = ($$anchor2) => {
      var button_5 = root_10$1();
      var text_9 = child(button_5);
      template_effect(() => set_text(text_9, get(allDone) ? "Later" : "Cancel"));
      delegated("click", button_5, cancel);
      append($$anchor2, button_5);
    };
    if_block(node_4, ($$render) => {
      if (get(restarting)) $$render(consequent_6);
      else $$render(alternate, -1);
    });
  }
  template_effect(() => {
    set_text(text, `Get Model: ${($$props.catalogEntry.display_name || $$props.catalogEntry.model_name) ?? ""}`);
    set_text(text_1, get(metaLine));
    set_text(text_7, get(statusText));
  });
  delegated("click", div, handleOverlayClick);
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_1 = from_html(`<div class="pcr-np-repo-row svelte-1xv7wcx"><span class="pcr-np-repo-status svelte-1xv7wcx"> </span> <div class="pcr-np-repo-info svelte-1xv7wcx"><div class="pcr-np-repo-name svelte-1xv7wcx"> </div> <div class="pcr-np-repo-url svelte-1xv7wcx"> </div></div></div>`);
var root_3 = from_html(`<div class="pcr-np-log-line svelte-1xv7wcx"> </div>`);
var root_2 = from_html(`<div class="pcr-np-log svelte-1xv7wcx"></div>`);
var root_5 = from_html(`<button class="pcr-np-btn pcr-np-btn-primary svelte-1xv7wcx">Install</button>`);
var root_6 = from_html(`<button class="pcr-np-btn pcr-np-btn-primary svelte-1xv7wcx">Restart ComfyUI</button>`);
var root_7 = from_html(`<button class="pcr-np-btn svelte-1xv7wcx" disabled="">Installing&hellip;</button>`);
var root_8 = from_html(`<button class="pcr-np-btn pcr-np-btn-primary svelte-1xv7wcx">Restart ComfyUI</button>`);
var root_9 = from_html(`<button class="pcr-np-btn svelte-1xv7wcx" disabled="">Restarting&hellip;</button>`);
var root_10 = from_html(`<button class="pcr-np-btn pcr-np-btn-primary svelte-1xv7wcx">Retry</button>`);
var root_11 = from_html(`<button class="pcr-np-btn svelte-1xv7wcx"> </button>`);
var root = from_html(`<div class="pcr-np-overlay svelte-1xv7wcx"><div class="pcr-np-modal svelte-1xv7wcx"><div class="pcr-np-header svelte-1xv7wcx"><div class="pcr-np-title svelte-1xv7wcx"> </div> <div class="pcr-np-meta svelte-1xv7wcx"> </div></div> <div class="pcr-np-body svelte-1xv7wcx"></div> <!> <div class="pcr-np-footer"><div> </div> <div class="pcr-np-buttons svelte-1xv7wcx"><!> <!></div></div></div></div>`);
function NodePackInstallModal($$anchor, $$props) {
  push($$props, true);
  let label = state(proxy($$props.injectable));
  let repos = state(proxy(
    []
    // [{url, dir, cloned}]
  ));
  let missingNodes = state(proxy([]));
  let missingModels = state(proxy([]));
  let present = state(false);
  let section = state(
    null
    // section id this injectable belongs to
  );
  let phase = state(
    "loading"
    // loading | ready | installing | installed | restarting | done | error
  );
  let statusText = state("Checking what's needed…");
  let logLines = state(proxy([]));
  let errorText = state("");
  let restartAc = null;
  let logEl;
  user_effect(() => () => {
    restartAc == null ? void 0 : restartAc.abort();
  });
  user_effect(() => {
    get(logLines).length;
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  });
  user_effect(() => {
    refreshStatus();
  });
  async function refreshStatus() {
    var _a, _b;
    try {
      const res = await fetch(`/promptchain/nodepacks/status?injectable=${encodeURIComponent($$props.injectable)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set(label, data.label || $$props.injectable, true);
      set(repos, data.repos || [], true);
      set(missingNodes, data.missing_nodes || [], true);
      set(missingModels, data.missing_models || [], true);
      set(present, !!data.present);
      set(section, data.section || null, true);
      if (get(present)) {
        set(phase, "done");
        set(statusText, "All set — adding it now…");
        (_a = $$props.onReady) == null ? void 0 : _a.call($$props);
        (_b = $$props.onClose) == null ? void 0 : _b.call($$props);
      } else if (get(phase) === "loading") {
        set(phase, "ready");
        const missingRepos = get(repos).filter((r) => !r.cloned).length;
        if (missingRepos) {
          set(statusText, `${get(label)} needs ${missingRepos} custom-node pack${missingRepos > 1 ? "s" : ""}` + (get(missingModels).length ? ` and ${get(missingModels).length} model file${get(missingModels).length > 1 ? "s" : ""}.` : "."));
        } else if (get(missingModels).length) {
          set(statusText, `${get(label)}'s nodes are installed but ${get(missingModels).length} model file${get(missingModels).length > 1 ? "s are" : " is"} missing — download to finish.`);
        } else {
          set(statusText, `${get(label)}'s files are present but its nodes aren't loaded yet — restart to finish.`);
        }
      }
    } catch (e) {
      set(phase, "error");
      set(errorText, `Couldn't check status: ${e.message}`);
    }
  }
  function log(line) {
    set(logLines, [...get(logLines), line], true);
  }
  async function install() {
    set(phase, "installing");
    set(statusText, "Installing…");
    set(logLines, [], true);
    set(errorText, "");
    try {
      const useSection = !!get(section);
      const res = await fetch(
        useSection ? "/promptchain/install/install" : "/promptchain/nodepacks/install",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(useSection ? { section: get(section), members: [$$props.injectable] } : { injectable: $$props.injectable })
        }
      );
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (; ; ) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 2);
          if (!chunk.startsWith("data:")) continue;
          let evt;
          try {
            evt = JSON.parse(chunk.slice(5).trim());
          } catch {
            continue;
          }
          handleEvent(evt);
        }
      }
    } catch (e) {
      set(phase, "error");
      set(errorText, `Install failed: ${e.message}`);
    }
  }
  function handleEvent(evt) {
    if (evt.error) {
      set(phase, "error");
      set(errorText, evt.error, true);
      log("✘ " + evt.error);
      return;
    }
    if (evt.line) {
      log(evt.line);
      return;
    }
    if (evt.stage === "download") {
      set(statusText, `Downloading ${evt.file}… ${evt.pct ?? 0}%`);
      return;
    }
    if (evt.stage === "prefetch") {
      set(statusText, `Pre-fetching ${evt.file || "extra weights"}…`);
      return;
    }
    if (evt.stage) {
      const labels = {
        clone: `Cloning ${evt.repo}…`,
        pip: `Installing requirements for ${evt.repo}…`,
        install_script: `Running ${evt.repo} install script…`,
        fix_deps: "Verifying core dependencies…",
        models: `Downloading ${evt.count} model file${evt.count > 1 ? "s" : ""}…`
      };
      set(statusText, labels[evt.stage] || evt.stage, true);
      return;
    }
    if (evt.done) {
      set(phase, "installed");
      set(statusText, "Installed. Restart ComfyUI to load the new nodes.");
    }
  }
  async function restartAndResolve() {
    var _a, _b;
    set(phase, "restarting");
    set(statusText, "Restarting server…");
    restartAc = new AbortController();
    const { signal } = restartAc;
    fetch("/promptchain/system/restart", { method: "POST" }).catch(() => {
    });
    for (let i = 0; i < 180; i++) {
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, 500));
      try {
        const r = await fetch("/api/system_stats", { signal });
        if (r.ok) break;
      } catch {
        if (signal.aborted) return;
      }
    }
    set(statusText, "Checking the new nodes…");
    for (let i = 0; i < 20; i++) {
      if (signal.aborted) return;
      try {
        const r = await fetch(`/promptchain/nodepacks/status?injectable=${encodeURIComponent($$props.injectable)}`, { signal });
        if (r.ok) {
          const data = await r.json();
          if (data.present) {
            set(phase, "done");
            set(statusText, "Done — adding it now…");
            (_a = $$props.onReady) == null ? void 0 : _a.call($$props);
            (_b = $$props.onClose) == null ? void 0 : _b.call($$props);
            return;
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      await new Promise((r) => setTimeout(r, 1e3));
    }
    set(phase, "error");
    set(errorText, "Nodes still aren't registered after restart. Check the server log for load errors.");
  }
  var div = root();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var div_3 = child(div_2);
  var text = child(div_3);
  var div_4 = sibling(div_3, 2);
  var text_1 = child(div_4);
  var div_5 = sibling(div_2, 2);
  each(div_5, 21, () => get(repos), index, ($$anchor2, repo) => {
    var div_6 = root_1();
    var span = child(div_6);
    let styles;
    var text_2 = child(span);
    var div_7 = sibling(span, 2);
    var div_8 = child(div_7);
    var text_3 = child(div_8);
    var div_9 = sibling(div_8, 2);
    var text_4 = child(div_9);
    template_effect(() => {
      styles = set_style(span, "", styles, { color: get(repo).cloned ? "#4caf50" : "#888" });
      set_text(text_2, get(repo).cloned ? "✔" : "○");
      set_text(text_3, get(repo).dir);
      set_text(text_4, get(repo).url);
    });
    append($$anchor2, div_6);
  });
  var node = sibling(div_5, 2);
  {
    var consequent = ($$anchor2) => {
      var div_10 = root_2();
      each(div_10, 21, () => get(logLines), index, ($$anchor3, line) => {
        var div_11 = root_3();
        var text_5 = child(div_11);
        template_effect(() => set_text(text_5, get(line)));
        append($$anchor3, div_11);
      });
      bind_this(div_10, ($$value) => logEl = $$value, () => logEl);
      append($$anchor2, div_10);
    };
    if_block(node, ($$render) => {
      if (get(logLines).length) $$render(consequent);
    });
  }
  var div_12 = sibling(node, 2);
  var div_13 = child(div_12);
  let classes;
  var text_6 = child(div_13);
  var div_14 = sibling(div_13, 2);
  var node_1 = child(div_14);
  {
    var consequent_2 = ($$anchor2) => {
      var fragment = comment();
      var node_2 = first_child(fragment);
      {
        var consequent_1 = ($$anchor3) => {
          var button = root_5();
          delegated("click", button, install);
          append($$anchor3, button);
        };
        var d = user_derived(() => get(repos).some((r) => !r.cloned) || get(missingModels).length);
        var alternate = ($$anchor3) => {
          var button_1 = root_6();
          delegated("click", button_1, restartAndResolve);
          append($$anchor3, button_1);
        };
        if_block(node_2, ($$render) => {
          if (get(d)) $$render(consequent_1);
          else $$render(alternate, -1);
        });
      }
      append($$anchor2, fragment);
    };
    var consequent_3 = ($$anchor2) => {
      var button_2 = root_7();
      append($$anchor2, button_2);
    };
    var consequent_4 = ($$anchor2) => {
      var button_3 = root_8();
      delegated("click", button_3, restartAndResolve);
      append($$anchor2, button_3);
    };
    var consequent_5 = ($$anchor2) => {
      var button_4 = root_9();
      append($$anchor2, button_4);
    };
    var consequent_6 = ($$anchor2) => {
      var button_5 = root_10();
      delegated("click", button_5, install);
      append($$anchor2, button_5);
    };
    if_block(node_1, ($$render) => {
      if (get(phase) === "ready") $$render(consequent_2);
      else if (get(phase) === "installing") $$render(consequent_3, 1);
      else if (get(phase) === "installed") $$render(consequent_4, 2);
      else if (get(phase) === "restarting") $$render(consequent_5, 3);
      else if (get(phase) === "error") $$render(consequent_6, 4);
    });
  }
  var node_3 = sibling(node_1, 2);
  {
    var consequent_7 = ($$anchor2) => {
      var button_6 = root_11();
      var text_7 = child(button_6);
      template_effect(() => set_text(text_7, get(phase) === "installed" ? "Later" : "Cancel"));
      delegated("click", button_6, () => {
        var _a;
        return (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
      });
      append($$anchor2, button_6);
    };
    if_block(node_3, ($$render) => {
      if (get(phase) !== "installing" && get(phase) !== "restarting") $$render(consequent_7);
    });
  }
  template_effect(() => {
    set_text(text, `Add ${get(label) ?? ""}`);
    set_text(text_1, `${get(label) ?? ""} relies on a community custom-node pack that isn't installed yet.`);
    classes = set_class(div_13, 1, "pcr-np-status svelte-1xv7wcx", null, classes, { "pcr-np-status-error": get(phase) === "error" });
    set_text(text_6, get(phase) === "error" ? get(errorText) : get(statusText));
  });
  append($$anchor, div);
  pop();
}
delegate(["click"]);
function mountModelPicker(target, props) {
  return mount(ModelPicker, { target, props });
}
function destroyModelPicker(instance) {
  if (instance) unmount(instance);
}
function mountDownloadModal(target, props) {
  return mount(DownloadModal, { target, props });
}
function destroyDownloadModal(instance) {
  if (instance) unmount(instance);
}
function mountCatalogDownloadModal(target, props) {
  return mount(CatalogDownloadModal, { target, props });
}
function destroyCatalogDownloadModal(instance) {
  if (instance) unmount(instance);
}
function mountNodePackInstallModal(target, props) {
  return mount(NodePackInstallModal, { target, props });
}
function destroyNodePackInstallModal(instance) {
  if (instance) unmount(instance);
}
export {
  destroyCatalogDownloadModal,
  destroyDownloadModal,
  destroyModelPicker,
  destroyNodePackInstallModal,
  mountCatalogDownloadModal,
  mountDownloadModal,
  mountModelPicker,
  mountNodePackInstallModal
};
//# sourceMappingURL=promptchain-model-indicator.js.map
