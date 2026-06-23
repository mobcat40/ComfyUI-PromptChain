import { c as proxy, N as effect_root, u as user_effect, d as delegate, p as push, r as event, $ as $window, v as first_child, w as each, f as sibling, i as if_block, g as get, o as bind_this, t as template_effect, j as delegated, k as append, l as pop, s as state, e as set, m as user_derived, n as child, A as from_html, J as from_svg, h as set_class, y as set_text, z as index, q as set_value, x as set_attribute, a as prop, O as getContext, C as tick, D as comment, P as setContext, L as mount, M as unmount } from "./disclose-version-uq4tn5Y6.js";
import { a as onMount } from "./index-client-iMRCrpBY.js";
import { s as set_style } from "./style-Boi27oOu.js";
import { j as justifiedLayout } from "./justified-layout-cyVM7i96.js";
import { a as action } from "./actions-WPfqiWYB.js";
import { b as bind_value, c as bind_group } from "./input-DFQhebEz.js";
import { p as portal, C as ConfirmModal } from "./ConfirmModal-BGcVYndw.js";
import { s as safeJson, H as HttpError } from "./api-context-BFKo1mCD.js";
const VIEW_MODES = [
  { id: "grid", label: "Grid" },
  { id: "justified", label: "Justified" },
  { id: "list", label: "List" }
];
const SORT_FIELDS = [
  { field: "name", label: "Name" },
  { field: "modified", label: "Date" },
  { field: "size", label: "Size" },
  { field: "type", label: "Type" }
];
const GROUP_MODES = [
  { id: "none", label: "None" },
  { id: "time", label: "Time" },
  { id: "type", label: "Type" },
  { id: "size", label: "Size" }
];
const PREFIX = "pcr-sidebar-";
function load(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, val) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(val));
  } catch {
  }
}
const selection = proxy({ items: /* @__PURE__ */ new Set(), anchor: null });
function selectItem(path) {
  selection.items = /* @__PURE__ */ new Set([path]);
  selection.anchor = path;
}
function toggleItem(path) {
  const next = new Set(selection.items);
  next.has(path) ? next.delete(path) : next.add(path);
  selection.items = next;
  if (next.has(path)) selection.anchor = path;
}
function selectRange(path, allPaths) {
  if (!selection.anchor) return selectItem(path);
  const ai = allPaths.indexOf(selection.anchor);
  const ti = allPaths.indexOf(path);
  if (ai < 0 || ti < 0) return selectItem(path);
  selection.items = new Set(allPaths.slice(Math.min(ai, ti), Math.max(ai, ti) + 1));
}
function clearSelection() {
  selection.items = /* @__PURE__ */ new Set();
  selection.anchor = null;
}
function selectAll(allPaths) {
  selection.items = new Set(allPaths);
  selection.anchor = allPaths[0] ?? null;
}
function setSelection(paths) {
  selection.items = new Set(paths);
  selection.anchor = paths[0] ?? null;
}
const nav = proxy({
  scope: load("navScope", "workflows"),
  paths: load("navPaths", { workflows: [], input: [], output: [] })
});
effect_root(() => {
  user_effect(() => {
    save("navScope", nav.scope);
  });
  user_effect(() => {
    save("navPaths", { ...nav.paths });
  });
});
function loadViewModes() {
  const raw = load("viewModes", null);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  const old = load("viewMode", null);
  const modes = old ? { workflows: old, input: old, output: old } : { workflows: "list", input: "grid", output: "justified" };
  save("viewModes", modes);
  return modes;
}
function loadThumbSizes() {
  const raw = load("thumbSizes", null);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  const old = load("thumbSize", 140);
  const sizes = { workflows: old, input: old, output: old };
  save("thumbSizes", sizes);
  return sizes;
}
const prefs = proxy({
  viewModes: loadViewModes(),
  thumbSizes: loadThumbSizes(),
  sortField: load("sortField", "modified"),
  sortDirection: load("sortDir", "desc"),
  groupModes: load("groupModes", { workflows: "none", input: "none", output: "none" }),
  feedModes: load("feedModes", { workflows: false, input: false, output: false }),
  favFilters: load("favFilters", { workflows: false, input: false, output: false })
});
function viewMode() {
  return prefs.viewModes[nav.scope] || "grid";
}
function thumbSize() {
  return prefs.thumbSizes[nav.scope] || 140;
}
function setViewMode(m) {
  prefs.viewModes[nav.scope] = m;
  save("viewModes", { ...prefs.viewModes });
}
function setThumbSize(size) {
  prefs.thumbSizes[nav.scope] = Math.max(80, Math.min(300, Math.round(size)));
  save("thumbSizes", { ...prefs.thumbSizes });
}
function setSort(field, direction) {
  prefs.sortField = field;
  prefs.sortDirection = direction;
  save("sortField", field);
  save("sortDir", direction);
}
const cursor = proxy({ path: null });
function setCursor(path) {
  cursor.path = path;
}
function groupMode() {
  var _a;
  return ((_a = prefs.groupModes) == null ? void 0 : _a[nav.scope]) || "none";
}
function setGroupMode(mode) {
  if (!prefs.groupModes) prefs.groupModes = { workflows: "none", input: "none", output: "none" };
  prefs.groupModes[nav.scope] = mode;
  save("groupModes", { ...prefs.groupModes });
}
function feedMode() {
  var _a;
  return !!((_a = prefs.feedModes) == null ? void 0 : _a[nav.scope]);
}
function setFeedMode(on) {
  if (!prefs.feedModes) prefs.feedModes = { workflows: false, input: false, output: false };
  prefs.feedModes[nav.scope] = !!on;
  save("feedModes", { ...prefs.feedModes });
}
function favFilter() {
  var _a;
  return !!((_a = prefs.favFilters) == null ? void 0 : _a[nav.scope]);
}
function setFavFilter(on) {
  if (!prefs.favFilters) prefs.favFilters = { workflows: false, input: false, output: false };
  prefs.favFilters[nav.scope] = !!on;
  save("favFilters", { ...prefs.favFilters });
}
const clipboard = proxy({
  items: [],
  // [{ path, name, type }]
  scope: null,
  // source scope
  op: null
  // "cut" | "copy"
});
function clipCut(scope, items) {
  clipboard.items = items.map((i) => ({ path: i.path, name: i.name, type: i.type }));
  clipboard.scope = scope;
  clipboard.op = "cut";
}
function clipCopy(scope, items) {
  clipboard.items = items.map((i) => ({ path: i.path, name: i.name, type: i.type }));
  clipboard.scope = scope;
  clipboard.op = "copy";
}
function clipClear() {
  clipboard.items = [];
  clipboard.scope = null;
  clipboard.op = null;
}
var root_1$a = from_html(`<button> </button>`);
var root_4$8 = from_html(`<span class="pcr-tb-dd-dir svelte-1arkur3"> </span>`);
var root_3$8 = from_html(`<button> <!></button>`);
var root_2$7 = from_html(`<div class="pcr-tb-dd svelte-1arkur3"></div>`);
var root_5$8 = from_svg(`<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>`);
var root_6$7 = from_svg(`<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="2" y="3" width="9" height="6" rx="1"></rect><rect x="13" y="3" width="9" height="8" rx="1"></rect><rect x="2" y="11" width="9" height="10" rx="1"></rect><rect x="13" y="13" width="9" height="8" rx="1"></rect></svg>`);
var root_7$7 = from_svg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><circle cx="4" cy="6" r="1" fill="currentColor"></circle><circle cx="4" cy="12" r="1" fill="currentColor"></circle><circle cx="4" cy="18" r="1" fill="currentColor"></circle></svg>`);
var root_10$5 = from_html(`<span class="pcr-tb-dd-check svelte-1arkur3">&#10003;</span>`);
var root_9$6 = from_html(`<button> <!></button>`);
var root_8$6 = from_html(`<div class="pcr-tb-dd svelte-1arkur3"></div>`);
var root_13$2 = from_html(`<span class="pcr-tb-dd-check svelte-1arkur3">&#10003;</span>`);
var root_12$4 = from_html(`<button> <!></button>`);
var root_11$5 = from_html(`<div class="pcr-tb-dd svelte-1arkur3"></div>`);
var root$4 = from_html(`<div class="pcr-tb-scopes svelte-1arkur3"></div> <div class="pcr-tb-bar svelte-1arkur3"><input class="pcr-tb-search svelte-1arkur3" type="text" placeholder="Search..."/> <div class="pcr-tb-dd-wrap svelte-1arkur3"><button class="pcr-tb-btn svelte-1arkur3"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="4" y1="6" x2="16" y2="6"></line><line x1="4" y1="12" x2="12" y2="12"></line><line x1="4" y1="18" x2="8" y2="18"></line><polyline points="15 15 18 18 21 15"></polyline><line x1="18" y1="12" x2="18" y2="18"></line></svg></button> <!></div> <div class="pcr-tb-dd-wrap svelte-1arkur3"><button class="pcr-tb-btn svelte-1arkur3"><!></button> <!></div> <div class="pcr-tb-dd-wrap svelte-1arkur3"><button><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M5 3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm0 12a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H5Zm12 0a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2Zm0-12a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2Z"></path><path fill-rule="evenodd" d="M10 6.5a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1ZM10 18a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1Zm-4-4a1 1 0 0 1-1-1v-2a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1Zm12 0a1 1 0 0 1-1-1v-2a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1Z" clip-rule="evenodd"></path></svg></button> <!></div> <button><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linejoin="round" width="14" height="14"><polygon points="12 2.6 15 8.8 21.8 9.7 16.9 14.4 18.1 21.2 12 18 5.9 21.2 7.1 14.4 2.2 9.7 9 8.8"></polygon></svg></button> <button title="Recent feed — all subfolders, newest first"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg></button></div>`, 1);
function Toolbar($$anchor, $$props) {
  push($$props, true);
  let openDd = state(
    null
    // "sort" | "view" | "group" | null
  );
  let ddWrapEls = {};
  function toggleDd(name, e) {
    e.stopPropagation();
    set(openDd, get(openDd) === name ? null : name, true);
  }
  function handleSortField(field) {
    var _a;
    const dir = field === prefs.sortField ? prefs.sortDirection === "asc" ? "desc" : "asc" : field === "modified" || field === "size" ? "desc" : "asc";
    setSort(field, dir);
    set(openDd, null);
    (_a = $$props.onSortChange) == null ? void 0 : _a.call($$props);
  }
  function handleViewMode(mode) {
    setViewMode(mode);
    set(openDd, null);
  }
  function handleGroupMode(mode) {
    var _a;
    setGroupMode(mode);
    set(openDd, null);
    (_a = $$props.onSortChange) == null ? void 0 : _a.call($$props);
  }
  let currentView = user_derived(viewMode);
  let currentGroup = user_derived(groupMode);
  let currentFeed = user_derived(feedMode);
  let currentFav = user_derived(favFilter);
  var fragment = root$4();
  event("click", $window, (e) => {
    if (get(openDd)) {
      const wrap = ddWrapEls[get(openDd)];
      if (wrap && !wrap.contains(e.target)) set(openDd, null);
    }
  });
  var div = first_child(fragment);
  each(div, 21, () => $$props.scopes, index, ($$anchor2, s) => {
    var button = root_1$a();
    let classes;
    var text = child(button);
    template_effect(() => {
      classes = set_class(button, 1, "pcr-tb-scope svelte-1arkur3", null, classes, { active: $$props.scope === get(s).id });
      set_text(text, get(s).label);
    });
    delegated("click", button, () => $$props.onScopeChange(get(s).id));
    append($$anchor2, button);
  });
  var div_1 = sibling(div, 2);
  var input = child(div_1);
  var div_2 = sibling(input, 2);
  var button_1 = child(div_2);
  var node = sibling(button_1, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_3 = root_2$7();
      each(div_3, 21, () => SORT_FIELDS, index, ($$anchor3, s) => {
        var button_2 = root_3$8();
        let classes_1;
        var text_1 = child(button_2);
        var node_1 = sibling(text_1);
        {
          var consequent = ($$anchor4) => {
            var span = root_4$8();
            var text_2 = child(span);
            template_effect(() => set_text(text_2, prefs.sortDirection === "asc" ? "↑" : "↓"));
            append($$anchor4, span);
          };
          if_block(node_1, ($$render) => {
            if (prefs.sortField === get(s).field) $$render(consequent);
          });
        }
        template_effect(() => {
          classes_1 = set_class(button_2, 1, "pcr-tb-dd-item svelte-1arkur3", null, classes_1, { active: prefs.sortField === get(s).field });
          set_text(text_1, `${get(s).label ?? ""} `);
        });
        delegated("click", button_2, () => handleSortField(get(s).field));
        append($$anchor3, button_2);
      });
      append($$anchor2, div_3);
    };
    if_block(node, ($$render) => {
      if (get(openDd) === "sort") $$render(consequent_1);
    });
  }
  bind_this(div_2, ($$value) => ddWrapEls.sort = $$value, () => ddWrapEls == null ? void 0 : ddWrapEls.sort);
  var div_4 = sibling(div_2, 2);
  var button_3 = child(div_4);
  var node_2 = child(button_3);
  {
    var consequent_2 = ($$anchor2) => {
      var svg = root_5$8();
      append($$anchor2, svg);
    };
    var consequent_3 = ($$anchor2) => {
      var svg_1 = root_6$7();
      append($$anchor2, svg_1);
    };
    var alternate = ($$anchor2) => {
      var svg_2 = root_7$7();
      append($$anchor2, svg_2);
    };
    if_block(node_2, ($$render) => {
      if (get(currentView) === "grid") $$render(consequent_2);
      else if (get(currentView) === "justified") $$render(consequent_3, 1);
      else $$render(alternate, -1);
    });
  }
  var node_3 = sibling(button_3, 2);
  {
    var consequent_5 = ($$anchor2) => {
      var div_5 = root_8$6();
      each(div_5, 21, () => VIEW_MODES, index, ($$anchor3, vm) => {
        var button_4 = root_9$6();
        let classes_2;
        var text_3 = child(button_4);
        var node_4 = sibling(text_3);
        {
          var consequent_4 = ($$anchor4) => {
            var span_1 = root_10$5();
            append($$anchor4, span_1);
          };
          if_block(node_4, ($$render) => {
            if (get(currentView) === get(vm).id) $$render(consequent_4);
          });
        }
        template_effect(() => {
          classes_2 = set_class(button_4, 1, "pcr-tb-dd-item svelte-1arkur3", null, classes_2, { active: get(currentView) === get(vm).id });
          set_text(text_3, `${get(vm).label ?? ""} `);
        });
        delegated("click", button_4, () => handleViewMode(get(vm).id));
        append($$anchor3, button_4);
      });
      append($$anchor2, div_5);
    };
    if_block(node_3, ($$render) => {
      if (get(openDd) === "view") $$render(consequent_5);
    });
  }
  bind_this(div_4, ($$value) => ddWrapEls.view = $$value, () => ddWrapEls == null ? void 0 : ddWrapEls.view);
  var div_6 = sibling(div_4, 2);
  var button_5 = child(div_6);
  let classes_3;
  var node_5 = sibling(button_5, 2);
  {
    var consequent_7 = ($$anchor2) => {
      var div_7 = root_11$5();
      each(div_7, 21, () => GROUP_MODES, index, ($$anchor3, g) => {
        var button_6 = root_12$4();
        let classes_4;
        var text_4 = child(button_6);
        var node_6 = sibling(text_4);
        {
          var consequent_6 = ($$anchor4) => {
            var span_2 = root_13$2();
            append($$anchor4, span_2);
          };
          if_block(node_6, ($$render) => {
            if (get(currentGroup) === get(g).id) $$render(consequent_6);
          });
        }
        template_effect(() => {
          classes_4 = set_class(button_6, 1, "pcr-tb-dd-item svelte-1arkur3", null, classes_4, { active: get(currentGroup) === get(g).id });
          set_text(text_4, `${get(g).label ?? ""} `);
        });
        delegated("click", button_6, () => handleGroupMode(get(g).id));
        append($$anchor3, button_6);
      });
      append($$anchor2, div_7);
    };
    if_block(node_5, ($$render) => {
      if (get(openDd) === "group") $$render(consequent_7);
    });
  }
  bind_this(div_6, ($$value) => ddWrapEls.group = $$value, () => ddWrapEls == null ? void 0 : ddWrapEls.group);
  var button_7 = sibling(div_6, 2);
  let classes_5;
  var svg_3 = child(button_7);
  var button_8 = sibling(button_7, 2);
  let classes_6;
  template_effect(() => {
    set_value(input, $$props.searchQuery);
    button_1.disabled = get(currentFeed);
    set_attribute(button_1, "title", get(currentFeed) ? "Sorted by newest (feed)" : `Sort by ${prefs.sortField}`);
    set_attribute(button_3, "title", `${get(currentView) ?? ""} view`);
    classes_3 = set_class(button_5, 1, "pcr-tb-btn svelte-1arkur3", null, classes_3, { active: get(currentGroup) !== "none" });
    set_attribute(button_5, "title", `Group by ${get(currentGroup) ?? ""}`);
    classes_5 = set_class(button_7, 1, "pcr-tb-btn svelte-1arkur3", null, classes_5, { active: get(currentFav) });
    set_attribute(button_7, "title", get(currentFav) ? "Showing starred only" : "Show starred only");
    set_attribute(svg_3, "fill", get(currentFav) ? "currentColor" : "none");
    classes_6 = set_class(button_8, 1, "pcr-tb-btn svelte-1arkur3", null, classes_6, { active: get(currentFeed) });
  });
  delegated("input", input, (e) => $$props.onSearchChange(e.target.value));
  delegated("click", button_1, (e) => toggleDd("sort", e));
  delegated("click", button_3, (e) => toggleDd("view", e));
  delegated("click", button_5, (e) => toggleDd("group", e));
  delegated("click", button_7, () => {
    var _a;
    return (_a = $$props.onFavFilterToggle) == null ? void 0 : _a.call($$props);
  });
  delegated("click", button_8, () => {
    var _a;
    return (_a = $$props.onFeedToggle) == null ? void 0 : _a.call($$props);
  });
  append($$anchor, fragment);
  pop();
}
delegate(["click", "input"]);
var root_2$6 = from_html(`<div class="pcr-gi-flash svelte-qguykh"></div>`);
var root_1$9 = from_html(`<img loading="lazy" decoding="async" draggable="false" class="svelte-qguykh"/> <!>`, 1);
var root_4$7 = from_html(`<div class="pcr-gi-flash svelte-qguykh"></div>`);
var root_3$7 = from_html(`<img loading="lazy" draggable="false" class="svelte-qguykh"/> <!>`, 1);
var root_5$7 = from_svg(`<svg class="pcr-gi-icon pcr-gi-folder svelte-qguykh" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" class="svelte-qguykh"></path></svg>`);
var root_6$6 = from_svg(`<svg class="pcr-gi-icon svelte-qguykh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1" class="svelte-qguykh"></rect><rect x="14" y="3" width="7" height="7" rx="1" class="svelte-qguykh"></rect><rect x="3" y="14" width="7" height="7" rx="1" class="svelte-qguykh"></rect><rect x="14" y="14" width="7" height="7" rx="1" class="svelte-qguykh"></rect></svg>`);
var root_7$6 = from_svg(`<svg class="pcr-gi-icon svelte-qguykh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" class="svelte-qguykh"></path><polyline points="14 2 14 8 20 8" class="svelte-qguykh"></polyline></svg>`);
var root_8$5 = from_html(`<span class="pcr-gi-dir svelte-qguykh" role="button" tabindex="-1" title="Open file location"> </span>`);
var root_9$5 = from_html(`<div class="pcr-gi-check svelte-qguykh"></div>`);
var root$3 = from_html(`<div role="button" tabindex="0"><div class="pcr-gi-img svelte-qguykh"><!> <!> <span role="button" tabindex="-1">&#9733;</span></div> <div class="pcr-gi-name svelte-qguykh"> </div> <!></div>`);
function ItemThumbnail($$anchor, $$props) {
  push($$props, true);
  let item = prop($$props, "item", 7), feed = prop($$props, "feed", 3, false), currentDir = prop($$props, "currentDir", 3, "");
  const apiURL = getContext("pcr-apiURL");
  let itemDir = user_derived(() => {
    const dir = item().path.split("/").slice(0, -1).join("/");
    if (!dir || dir === currentDir()) return "";
    return currentDir() && dir.startsWith(currentDir() + "/") ? dir.slice(currentDir().length + 1) : dir;
  });
  let selected = user_derived(() => selection.items.has(item().path));
  let focused = user_derived(() => cursor.path === item().path);
  let isCut = user_derived(() => clipboard.op === "cut" && clipboard.scope === $$props.scope && clipboard.items.some((i) => i.path === item().path));
  let dropOver = state(false);
  let thumbLoaded = false;
  let showFlash = state(false);
  function onThumbUpdate() {
    if (thumbLoaded) set(showFlash, true);
    thumbLoaded = true;
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
  function handleDragOver(e) {
    if (item().type !== "folder") return;
    if (!e.dataTransfer.types.includes("application/x-promptchain-move")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    set(dropOver, true);
  }
  function handleDrop(e) {
    var _a;
    set(dropOver, false);
    if (item().type !== "folder") return;
    const raw = e.dataTransfer.getData("application/x-promptchain-move");
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const data = JSON.parse(raw);
      if (data.paths.includes(item().path)) return;
      (_a = $$props.ondropitem) == null ? void 0 : _a.call($$props, data.paths, data.scope, item().path);
    } catch {
    }
  }
  var div = root$3();
  let classes;
  set_attribute(div, "draggable", true);
  var div_1 = child(div);
  var node = child(div_1);
  {
    var consequent_1 = ($$anchor2) => {
      var fragment = root_1$9();
      var img_1 = first_child(fragment);
      var node_1 = sibling(img_1, 2);
      {
        var consequent = ($$anchor3) => {
          var div_2 = root_2$6();
          event("animationend", div_2, () => item()._flash = false);
          append($$anchor3, div_2);
        };
        if_block(node_1, ($$render) => {
          if (item()._flash) $$render(consequent);
        });
      }
      template_effect(
        ($0) => {
          set_attribute(img_1, "src", $0);
          set_attribute(img_1, "alt", item().name);
        },
        [
          () => apiURL(`/promptchain/browse/preview?scope=${$$props.scope}&path=${encodeURIComponent(item().path)}&thumb=1`)
        ]
      );
      append($$anchor2, fragment);
    };
    var consequent_3 = ($$anchor2) => {
      var fragment_1 = root_3$7();
      var img_2 = first_child(fragment_1);
      var node_2 = sibling(img_2, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_3 = root_4$7();
          event("animationend", div_3, () => set(showFlash, false));
          append($$anchor3, div_3);
        };
        if_block(node_2, ($$render) => {
          if (get(showFlash)) $$render(consequent_2);
        });
      }
      template_effect(
        ($0) => {
          set_attribute(img_2, "src", $0);
          set_attribute(img_2, "alt", item().name);
        },
        [() => apiURL(`/promptchain/thumb/${item().thumbnailHash}`)]
      );
      event("load", img_2, onThumbUpdate);
      event("error", img_2, retryThumb);
      append($$anchor2, fragment_1);
    };
    var consequent_4 = ($$anchor2) => {
      var svg = root_5$7();
      append($$anchor2, svg);
    };
    var consequent_5 = ($$anchor2) => {
      var svg_1 = root_6$6();
      append($$anchor2, svg_1);
    };
    var alternate = ($$anchor2) => {
      var svg_2 = root_7$6();
      append($$anchor2, svg_2);
    };
    if_block(node, ($$render) => {
      if (item().type === "image" || item().type === "video") $$render(consequent_1);
      else if (item().type === "workflow" && item().thumbnailHash) $$render(consequent_3, 1);
      else if (item().type === "folder") $$render(consequent_4, 2);
      else if (item().type === "workflow") $$render(consequent_5, 3);
      else $$render(alternate, -1);
    });
  }
  var node_3 = sibling(node, 2);
  {
    var consequent_6 = ($$anchor2) => {
      var span = root_8$5();
      var text = child(span);
      template_effect(() => set_text(text, get(itemDir)));
      delegated("click", span, (e) => {
        var _a;
        e.stopPropagation();
        (_a = $$props.onlocate) == null ? void 0 : _a.call($$props, item());
      });
      append($$anchor2, span);
    };
    if_block(node_3, ($$render) => {
      if (feed() && get(itemDir)) $$render(consequent_6);
    });
  }
  var span_1 = sibling(node_3, 2);
  let classes_1;
  var div_4 = sibling(div_1, 2);
  var text_1 = child(div_4);
  var node_4 = sibling(div_4, 2);
  {
    var consequent_7 = ($$anchor2) => {
      var div_5 = root_9$5();
      append($$anchor2, div_5);
    };
    if_block(node_4, ($$render) => {
      if (get(selected)) $$render(consequent_7);
    });
  }
  template_effect(() => {
    classes = set_class(div, 1, "pcr-gi svelte-qguykh", null, classes, {
      selected: get(selected),
      focused: get(focused),
      cut: get(isCut),
      "drop-target": get(dropOver)
    });
    set_attribute(div, "data-item-path", item().path);
    set_attribute(div, "title", item().name);
    classes_1 = set_class(span_1, 1, "pcr-gi-fav svelte-qguykh", null, classes_1, { faved: item().favorite });
    set_attribute(span_1, "title", item().favorite ? "Unstar" : "Star");
    set_text(text_1, item().name);
  });
  event("dragstart", div, function(...$$args) {
    var _a;
    (_a = $$props.ondragstartitem) == null ? void 0 : _a.apply(this, $$args);
  });
  event("dragover", div, handleDragOver);
  event("dragleave", div, () => set(dropOver, false));
  event("drop", div, handleDrop);
  delegated("click", div, function(...$$args) {
    var _a;
    (_a = $$props.onclick) == null ? void 0 : _a.apply(this, $$args);
  });
  delegated("dblclick", div, function(...$$args) {
    var _a;
    (_a = $$props.ondblclick) == null ? void 0 : _a.apply(this, $$args);
  });
  delegated("contextmenu", div, function(...$$args) {
    var _a;
    (_a = $$props.oncontextmenu) == null ? void 0 : _a.apply(this, $$args);
  });
  delegated("click", span_1, (e) => {
    var _a;
    e.stopPropagation();
    (_a = $$props.onfav) == null ? void 0 : _a.call($$props, item());
  });
  append($$anchor, div);
  pop();
}
delegate(["click", "dblclick", "contextmenu"]);
var root_5$6 = from_html(`<div class="pcr-ji-flash svelte-1hwjzf"></div>`);
var root_4$6 = from_html(`<img loading="lazy" decoding="async" draggable="false" class="svelte-1hwjzf"/> <!>`, 1);
var root_7$5 = from_html(`<div class="pcr-ji-flash svelte-1hwjzf"></div>`);
var root_6$5 = from_html(`<img loading="lazy" draggable="false" class="svelte-1hwjzf"/> <!>`, 1);
var root_8$4 = from_html(`<div class="pcr-ji-icon svelte-1hwjzf"><svg class="pcr-ji-folder svelte-1hwjzf" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" class="svelte-1hwjzf"></path></svg> <span class="pcr-ji-label svelte-1hwjzf"> </span></div>`);
var root_9$4 = from_html(`<div class="pcr-ji-icon svelte-1hwjzf"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="svelte-1hwjzf"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" class="svelte-1hwjzf"></path><polyline points="14 2 14 8 20 8" class="svelte-1hwjzf"></polyline></svg> <span class="pcr-ji-label svelte-1hwjzf"> </span></div>`);
var root_10$4 = from_html(`<span class="pcr-ji-dir svelte-1hwjzf" role="button" tabindex="-1" title="Open file location"> </span>`);
var root_11$4 = from_html(`<div class="pcr-ji-check svelte-1hwjzf"></div>`);
var root_3$6 = from_html(`<button><!> <!> <span role="button" tabindex="-1">&#9733;</span> <!></button>`);
var root_1$8 = from_html(`<div class="pcr-jg svelte-1hwjzf"></div>`);
var root_12$3 = from_html(`<div class="pcr-gg svelte-1hwjzf"></div>`);
var root$2 = from_html(`<div class="pcr-gv svelte-1hwjzf"><!></div>`);
function GridView($$anchor, $$props) {
  push($$props, true);
  let feed = prop($$props, "feed", 3, false), currentDir = prop($$props, "currentDir", 3, "");
  function itemDir(item) {
    const dir = item.path.split("/").slice(0, -1).join("/");
    if (!dir || dir === currentDir()) return "";
    return currentDir() && dir.startsWith(currentDir() + "/") ? dir.slice(currentDir().length + 1) : dir;
  }
  function makeDragStart(item) {
    return (e) => {
      e.dataTransfer.effectAllowed = "copyMove";
      const movePaths = selection.items.has(item.path) && selection.items.size > 1 ? [...selection.items] : [item.path];
      e.dataTransfer.setData("application/x-promptchain-move", JSON.stringify({ scope: $$props.scope, paths: movePaths }));
      if (item.type === "image" || item.type === "video") {
        e.dataTransfer.setData("application/x-promptchain-asset", JSON.stringify({
          type: "asset",
          scope: $$props.scope,
          path: item.path,
          name: item.name
        }));
      }
      e.dataTransfer.setData("text/plain", item.path);
    };
  }
  const apiURL = getContext("pcr-apiURL");
  let isJustified = user_derived(() => viewMode() === "justified");
  let wrapEl;
  let layoutBoxes = state(proxy([]));
  let layoutHeight = state(0);
  let naturalDims = {};
  function reLayout() {
    if (!get(isJustified) || !wrapEl) {
      set(layoutBoxes, [], true);
      set(layoutHeight, 0);
      return;
    }
    const containerWidth = wrapEl.clientWidth;
    if (containerWidth <= 0) return;
    const aspects = $$props.items.map((i) => {
      if (i.width && i.height && i.height > 0) return i.width / i.height;
      const nat = naturalDims[i.path];
      if (nat) return nat.w / nat.h;
      return 1;
    });
    const result = justifiedLayout(aspects, {
      containerWidth,
      targetRowHeight: thumbSize(),
      boxSpacing: 4,
      containerPadding: 4
    });
    set(layoutBoxes, result.boxes || [], true);
    set(layoutHeight, result.containerHeight || 0, true);
  }
  function onImgLoad(item, e) {
    const img = e.target;
    if (img.naturalWidth && img.naturalHeight && !item.width) {
      naturalDims[item.path] = { w: img.naturalWidth, h: img.naturalHeight };
      reLayout();
    }
  }
  user_effect(() => {
    [get(isJustified), thumbSize(), $$props.items.length];
    naturalDims = {};
    tick().then(reLayout);
  });
  let lastLayoutWidth = 0;
  user_effect(() => {
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
  function previewSrc(item) {
    return apiURL(`/promptchain/browse/preview?scope=${$$props.scope}&path=${encodeURIComponent(item.path)}&thumb=1`);
  }
  function thumbSrc(item) {
    return item.thumbnailHash ? apiURL(`/promptchain/thumb/${item.thumbnailHash}`) : null;
  }
  let loadedThumbs = /* @__PURE__ */ new Set();
  let flashingThumbs = state(proxy(/* @__PURE__ */ new Set()));
  user_effect(() => {
    $$props.items.length;
    const visible = new Set($$props.items.map((i) => i.path));
    for (const p of loadedThumbs) if (!visible.has(p)) loadedThumbs.delete(p);
    if (get(flashingThumbs).size) {
      const next = /* @__PURE__ */ new Set();
      for (const p of get(flashingThumbs)) if (visible.has(p)) next.add(p);
      if (next.size !== get(flashingThumbs).size) set(flashingThumbs, next, true);
    }
  });
  function onThumbUpdate(item) {
    if (loadedThumbs.has(item.path)) {
      set(flashingThumbs, /* @__PURE__ */ new Set([...get(flashingThumbs), item.path]), true);
    }
    loadedThumbs.add(item.path);
  }
  function onFlashEnd(itemPath) {
    const next = new Set(get(flashingThumbs));
    next.delete(itemPath);
    set(flashingThumbs, next, true);
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
  var div = root$2();
  var node = child(div);
  {
    var consequent_8 = ($$anchor2) => {
      var div_1 = root_1$8();
      each(div_1, 23, () => $$props.items, (item) => item.path, ($$anchor3, item, i) => {
        var fragment = comment();
        var node_1 = first_child(fragment);
        {
          var consequent_7 = ($$anchor4) => {
            const box = user_derived(() => get(layoutBoxes)[get(i)]);
            const selected = user_derived(() => selection.items.has(get(item).path));
            const isCut = user_derived(() => clipboard.op === "cut" && clipboard.scope === $$props.scope && clipboard.items.some((i2) => i2.path === get(item).path));
            const isFocused = user_derived(() => cursor.path === get(item).path);
            const isFolder = user_derived(() => get(item).type === "folder");
            var button = root_3$6();
            let classes;
            set_attribute(button, "draggable", true);
            var event_handler = user_derived(() => makeDragStart(get(item)));
            var node_2 = child(button);
            {
              var consequent_1 = ($$anchor5) => {
                var fragment_1 = root_4$6();
                var img_1 = first_child(fragment_1);
                var node_3 = sibling(img_1, 2);
                {
                  var consequent = ($$anchor6) => {
                    var div_2 = root_5$6();
                    event("animationend", div_2, () => get(item)._flash = false);
                    append($$anchor6, div_2);
                  };
                  if_block(node_3, ($$render) => {
                    if (get(item)._flash) $$render(consequent);
                  });
                }
                template_effect(
                  ($0) => {
                    set_attribute(img_1, "src", $0);
                    set_attribute(img_1, "alt", get(item).name);
                  },
                  [() => previewSrc(get(item))]
                );
                event("load", img_1, (e) => onImgLoad(get(item), e));
                append($$anchor5, fragment_1);
              };
              var consequent_3 = ($$anchor5) => {
                var fragment_2 = root_6$5();
                var img_2 = first_child(fragment_2);
                var node_4 = sibling(img_2, 2);
                {
                  var consequent_2 = ($$anchor6) => {
                    var div_3 = root_7$5();
                    event("animationend", div_3, () => onFlashEnd(get(item).path));
                    append($$anchor6, div_3);
                  };
                  var d_1 = user_derived(() => get(flashingThumbs).has(get(item).path));
                  if_block(node_4, ($$render) => {
                    if (get(d_1)) $$render(consequent_2);
                  });
                }
                template_effect(
                  ($0) => {
                    set_attribute(img_2, "src", $0);
                    set_attribute(img_2, "alt", get(item).name);
                  },
                  [() => thumbSrc(get(item))]
                );
                event("load", img_2, () => onThumbUpdate(get(item)));
                event("error", img_2, retryThumb);
                append($$anchor5, fragment_2);
              };
              var consequent_4 = ($$anchor5) => {
                var div_4 = root_8$4();
                var span = sibling(child(div_4), 2);
                var text = child(span);
                template_effect(() => set_text(text, get(item).name));
                append($$anchor5, div_4);
              };
              var alternate = ($$anchor5) => {
                var div_5 = root_9$4();
                var span_1 = sibling(child(div_5), 2);
                var text_1 = child(span_1);
                template_effect(() => set_text(text_1, get(item).name));
                append($$anchor5, div_5);
              };
              if_block(node_2, ($$render) => {
                if (get(item).type === "image" || get(item).type === "video") $$render(consequent_1);
                else if (get(item).type === "workflow" && get(item).thumbnailHash) $$render(consequent_3, 1);
                else if (get(item).type === "folder") $$render(consequent_4, 2);
                else $$render(alternate, -1);
              });
            }
            var node_5 = sibling(node_2, 2);
            {
              var consequent_5 = ($$anchor5) => {
                var span_2 = root_10$4();
                var text_2 = child(span_2);
                template_effect(($0) => set_text(text_2, $0), [() => itemDir(get(item))]);
                delegated("click", span_2, (e) => {
                  var _a;
                  e.stopPropagation();
                  (_a = $$props.onlocate) == null ? void 0 : _a.call($$props, get(item));
                });
                append($$anchor5, span_2);
              };
              var d_2 = user_derived(() => feed() && itemDir(get(item)));
              if_block(node_5, ($$render) => {
                if (get(d_2)) $$render(consequent_5);
              });
            }
            var span_3 = sibling(node_5, 2);
            let classes_1;
            var node_6 = sibling(span_3, 2);
            {
              var consequent_6 = ($$anchor5) => {
                var div_6 = root_11$4();
                append($$anchor5, div_6);
              };
              if_block(node_6, ($$render) => {
                if (get(selected)) $$render(consequent_6);
              });
            }
            template_effect(() => {
              classes = set_class(button, 1, "pcr-ji svelte-1hwjzf", null, classes, {
                selected: get(selected),
                focused: get(isFocused),
                cut: get(isCut)
              });
              set_attribute(button, "data-item-path", get(item).path);
              set_style(button, `left:${get(box).left ?? ""}px;top:${get(box).top ?? ""}px;width:${get(box).width ?? ""}px;height:${get(box).height ?? ""}px;`);
              set_attribute(button, "title", get(item).name);
              classes_1 = set_class(span_3, 1, "pcr-ji-fav svelte-1hwjzf", null, classes_1, { faved: get(item).favorite });
              set_attribute(span_3, "title", get(item).favorite ? "Unstar" : "Star");
            });
            event("dragstart", button, function(...$$args) {
              var _a;
              (_a = get(event_handler)) == null ? void 0 : _a.apply(this, $$args);
            });
            event("dragover", button, (e) => {
              if (!get(isFolder) || !e.dataTransfer.types.includes("application/x-promptchain-move")) return;
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
            });
            event("drop", button, (e) => {
              var _a;
              if (!get(isFolder)) return;
              const raw = e.dataTransfer.getData("application/x-promptchain-move");
              if (!raw) return;
              e.preventDefault();
              e.stopPropagation();
              try {
                const d = JSON.parse(raw);
                if (Array.isArray(d.paths) && !d.paths.includes(get(item).path)) {
                  (_a = $$props.onitemdrop) == null ? void 0 : _a.call($$props, d.paths, d.scope, get(item).path);
                }
              } catch (err) {
                console.warn("[PromptChain] invalid drop payload:", err);
              }
            });
            delegated("click", button, (e) => {
              var _a;
              return (_a = $$props.onitemclick) == null ? void 0 : _a.call($$props, get(item), e);
            });
            delegated("dblclick", button, (e) => {
              var _a;
              return (_a = $$props.onitemdblclick) == null ? void 0 : _a.call($$props, get(item), e);
            });
            delegated("contextmenu", button, (e) => {
              var _a;
              e.preventDefault();
              e.stopPropagation();
              (_a = $$props.onitemcontextmenu) == null ? void 0 : _a.call($$props, get(item), e);
            });
            delegated("click", span_3, (e) => {
              var _a;
              e.stopPropagation();
              (_a = $$props.onfav) == null ? void 0 : _a.call($$props, get(item));
            });
            append($$anchor4, button);
          };
          if_block(node_1, ($$render) => {
            if (get(layoutBoxes)[get(i)]) $$render(consequent_7);
          });
        }
        append($$anchor3, fragment);
      });
      template_effect(() => set_style(div_1, `height:${get(layoutHeight) ?? ""}px;`));
      append($$anchor2, div_1);
    };
    var alternate_1 = ($$anchor2) => {
      var div_7 = root_12$3();
      each(div_7, 21, () => $$props.items, (item) => item.path, ($$anchor3, item) => {
        {
          let $0 = user_derived(() => makeDragStart(get(item)));
          ItemThumbnail($$anchor3, {
            get item() {
              return get(item);
            },
            get scope() {
              return $$props.scope;
            },
            get feed() {
              return feed();
            },
            get currentDir() {
              return currentDir();
            },
            get onlocate() {
              return $$props.onlocate;
            },
            get onfav() {
              return $$props.onfav;
            },
            get ondragstartitem() {
              return get($0);
            },
            ondropitem: (paths, srcScope, folderPath) => {
              var _a;
              return (_a = $$props.onitemdrop) == null ? void 0 : _a.call($$props, paths, srcScope, folderPath);
            },
            onclick: (e) => {
              var _a;
              return (_a = $$props.onitemclick) == null ? void 0 : _a.call($$props, get(item), e);
            },
            ondblclick: (e) => {
              var _a;
              return (_a = $$props.onitemdblclick) == null ? void 0 : _a.call($$props, get(item), e);
            },
            oncontextmenu: (e) => {
              var _a;
              e.preventDefault();
              e.stopPropagation();
              (_a = $$props.onitemcontextmenu) == null ? void 0 : _a.call($$props, get(item), e);
            }
          });
        }
      });
      template_effect(($0) => set_style(div_7, `--pcr-item-size:${$0 ?? ""}px;`), [() => thumbSize()]);
      append($$anchor2, div_7);
    };
    if_block(node, ($$render) => {
      if (get(isJustified)) $$render(consequent_8);
      else $$render(alternate_1, -1);
    });
  }
  bind_this(div, ($$value) => wrapEl = $$value, () => wrapEl);
  append($$anchor, div);
  pop();
}
delegate(["click", "dblclick", "contextmenu"]);
var root_2$5 = from_html(`<img class="pcr-lv-mini svelte-lcbli7" alt="" loading="lazy" decoding="async"/>`);
var root_3$5 = from_svg(`<svg class="pcr-lv-icon pcr-lv-folder svelte-lcbli7" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" class="svelte-lcbli7"></path></svg>`);
var root_4$5 = from_html(`<img class="pcr-lv-mini svelte-lcbli7" alt="" loading="lazy"/>`);
var root_5$5 = from_svg(`<svg class="pcr-lv-icon svelte-lcbli7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1" class="svelte-lcbli7"></rect><rect x="14" y="3" width="7" height="7" rx="1" class="svelte-lcbli7"></rect><rect x="3" y="14" width="7" height="7" rx="1" class="svelte-lcbli7"></rect><rect x="14" y="14" width="7" height="7" rx="1" class="svelte-lcbli7"></rect></svg>`);
var root_6$4 = from_svg(`<svg class="pcr-lv-icon svelte-lcbli7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" class="svelte-lcbli7"></path><polyline points="14 2 14 8 20 8" class="svelte-lcbli7"></polyline></svg>`);
var root_7$4 = from_html(`<span class="pcr-lv-dir svelte-lcbli7" role="button" tabindex="-1" title="Open file location"> </span>`);
var root_1$7 = from_html(`<button><span class="pcr-lv-c-name svelte-lcbli7"><!> <span class="pcr-lv-name svelte-lcbli7"> </span> <!> <span role="button" tabindex="-1">&#9733;</span></span> <span class="pcr-lv-c-size svelte-lcbli7"> </span> <span class="pcr-lv-c-date svelte-lcbli7"> </span></button>`);
var root$1 = from_html(`<div class="pcr-lv svelte-lcbli7"><div class="pcr-lv-hdr svelte-lcbli7"><span class="pcr-lv-c-name svelte-lcbli7">Name</span> <span class="pcr-lv-c-size svelte-lcbli7">Size</span> <span class="pcr-lv-c-date svelte-lcbli7">Date</span></div> <!></div>`);
function ListView($$anchor, $$props) {
  push($$props, true);
  let feed = prop($$props, "feed", 3, false), currentDir = prop($$props, "currentDir", 3, "");
  const apiURL = getContext("pcr-apiURL");
  function itemDir(item) {
    const dir = item.path.split("/").slice(0, -1).join("/");
    if (!dir || dir === currentDir()) return "";
    return currentDir() && dir.startsWith(currentDir() + "/") ? dir.slice(currentDir().length + 1) : dir;
  }
  const LIST_THUMB_SCALE = 0.18;
  const LIST_THUMB_PAD = 6;
  let rowThumb = user_derived(() => Math.round(thumbSize() * LIST_THUMB_SCALE + LIST_THUMB_PAD));
  let rowPad = user_derived(() => Math.max(2, Math.round(get(rowThumb) * 0.15)));
  let dropTarget = state(null);
  function fmtSize(b) {
    if (!b) return "-";
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
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
  function fmtDate(ts) {
    if (!ts) return "-";
    return new Date(ts * 1e3).toLocaleDateString(void 0, { month: "short", day: "numeric" });
  }
  function handleDragStart(item, e) {
    e.dataTransfer.effectAllowed = "copyMove";
    const movePaths = selection.items.has(item.path) && selection.items.size > 1 ? [...selection.items] : [item.path];
    e.dataTransfer.setData("application/x-promptchain-move", JSON.stringify({ scope: $$props.scope, paths: movePaths }));
    if (item.type === "image" || item.type === "video") {
      e.dataTransfer.setData("application/x-promptchain-asset", JSON.stringify({
        type: "asset",
        scope: $$props.scope,
        path: item.path,
        name: item.name
      }));
    }
    e.dataTransfer.setData("text/plain", item.path);
  }
  function handleFolderDragOver(item, e) {
    if (item.type !== "folder") return;
    if (!e.dataTransfer.types.includes("application/x-promptchain-move")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    set(dropTarget, item.path, true);
  }
  function handleFolderDragLeave(item) {
    if (get(dropTarget) === item.path) set(dropTarget, null);
  }
  function handleFolderDrop(item, e) {
    var _a;
    set(dropTarget, null);
    if (item.type !== "folder") return;
    const raw = e.dataTransfer.getData("application/x-promptchain-move");
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const data = JSON.parse(raw);
      if (data.paths.includes(item.path)) return;
      (_a = $$props.onitemdrop) == null ? void 0 : _a.call($$props, data.paths, data.scope, item.path);
    } catch {
    }
  }
  var div = root$1();
  var node = sibling(child(div), 2);
  each(node, 17, () => $$props.items, (item) => item.path, ($$anchor2, item, $$index) => {
    const selected = user_derived(() => selection.items.has(get(item).path));
    const isCut = user_derived(() => clipboard.op === "cut" && clipboard.scope === $$props.scope && clipboard.items.some((i) => i.path === get(item).path));
    const isCopied = user_derived(() => clipboard.op === "copy" && clipboard.scope === $$props.scope && clipboard.items.some((i) => i.path === get(item).path));
    const isFocused = user_derived(() => cursor.path === get(item).path);
    const isDropTarget = user_derived(() => get(dropTarget) === get(item).path);
    var button = root_1$7();
    let classes;
    set_attribute(button, "draggable", true);
    var span = child(button);
    var node_1 = child(span);
    {
      var consequent = ($$anchor3) => {
        var img_1 = root_2$5();
        template_effect(($0) => set_attribute(img_1, "src", $0), [
          () => apiURL(`/promptchain/browse/preview?scope=${$$props.scope}&path=${encodeURIComponent(get(item).path)}&thumb=1`)
        ]);
        append($$anchor3, img_1);
      };
      var consequent_1 = ($$anchor3) => {
        var svg = root_3$5();
        append($$anchor3, svg);
      };
      var consequent_2 = ($$anchor3) => {
        var img_2 = root_4$5();
        template_effect(($0) => set_attribute(img_2, "src", $0), [
          () => apiURL(`/promptchain/thumb/${get(item).thumbnailHash}`)
        ]);
        event("error", img_2, retryThumb);
        append($$anchor3, img_2);
      };
      var consequent_3 = ($$anchor3) => {
        var svg_1 = root_5$5();
        append($$anchor3, svg_1);
      };
      var alternate = ($$anchor3) => {
        var svg_2 = root_6$4();
        append($$anchor3, svg_2);
      };
      if_block(node_1, ($$render) => {
        if (get(item).type === "image" || get(item).type === "video") $$render(consequent);
        else if (get(item).type === "folder") $$render(consequent_1, 1);
        else if (get(item).type === "workflow" && get(item).thumbnailHash) $$render(consequent_2, 2);
        else if (get(item).type === "workflow") $$render(consequent_3, 3);
        else $$render(alternate, -1);
      });
    }
    var span_1 = sibling(node_1, 2);
    var text = child(span_1);
    var node_2 = sibling(span_1, 2);
    {
      var consequent_4 = ($$anchor3) => {
        var span_2 = root_7$4();
        var text_1 = child(span_2);
        template_effect(($0) => set_text(text_1, `${$0 ?? ""}/`), [() => itemDir(get(item))]);
        delegated("click", span_2, (e) => {
          var _a;
          e.stopPropagation();
          (_a = $$props.onlocate) == null ? void 0 : _a.call($$props, get(item));
        });
        append($$anchor3, span_2);
      };
      var d = user_derived(() => feed() && itemDir(get(item)));
      if_block(node_2, ($$render) => {
        if (get(d)) $$render(consequent_4);
      });
    }
    var span_3 = sibling(node_2, 2);
    let classes_1;
    var span_4 = sibling(span, 2);
    var text_2 = child(span_4);
    var span_5 = sibling(span_4, 2);
    var text_3 = child(span_5);
    template_effect(
      ($0, $1) => {
        classes = set_class(button, 1, "pcr-lv-row svelte-lcbli7", null, classes, {
          selected: get(selected),
          focused: get(isFocused),
          cut: get(isCut),
          copied: get(isCopied),
          "drop-target": get(isDropTarget),
          "pcr-lv-flash": get(item)._flash
        });
        set_attribute(button, "data-item-path", get(item).path);
        set_attribute(span_1, "title", get(item).name);
        set_text(text, get(item).name);
        classes_1 = set_class(span_3, 1, "pcr-lv-fav svelte-lcbli7", null, classes_1, { faved: get(item).favorite });
        set_attribute(span_3, "title", get(item).favorite ? "Unstar" : "Star");
        set_text(text_2, $0);
        set_text(text_3, $1);
      },
      [
        () => fmtSize(get(item).size),
        () => fmtDate(get(item).modified)
      ]
    );
    event("animationend", button, () => {
      if (get(item)._flash) get(item)._flash = false;
    });
    event("dragstart", button, (e) => handleDragStart(get(item), e));
    event("dragover", button, (e) => handleFolderDragOver(get(item), e));
    event("dragleave", button, () => handleFolderDragLeave(get(item)));
    event("drop", button, (e) => handleFolderDrop(get(item), e));
    delegated("click", button, (e) => {
      var _a;
      return (_a = $$props.onitemclick) == null ? void 0 : _a.call($$props, get(item), e);
    });
    delegated("dblclick", button, (e) => {
      var _a;
      return (_a = $$props.onitemdblclick) == null ? void 0 : _a.call($$props, get(item), e);
    });
    delegated("contextmenu", button, (e) => {
      var _a;
      e.preventDefault();
      e.stopPropagation();
      (_a = $$props.onitemcontextmenu) == null ? void 0 : _a.call($$props, get(item), e);
    });
    delegated("click", span_3, (e) => {
      var _a;
      e.stopPropagation();
      (_a = $$props.onfav) == null ? void 0 : _a.call($$props, get(item));
    });
    append($$anchor2, button);
  });
  template_effect(() => set_style(div, `--row-thumb:${get(rowThumb) ?? ""}px;--row-pad:${get(rowPad) ?? ""}px;`));
  append($$anchor, div);
  pop();
}
delegate(["click", "dblclick", "contextmenu"]);
var root_2$4 = from_html(`<button class="pcr-ctx-item svelte-q0gc30">Edit</button> <div class="pcr-ctx-sep svelte-q0gc30"></div>`, 1);
var root_3$4 = from_html(`<button class="pcr-ctx-item svelte-q0gc30">Open file location</button> <div class="pcr-ctx-sep svelte-q0gc30"></div>`, 1);
var root_4$4 = from_html(`<button class="pcr-ctx-item svelte-q0gc30">Paste</button>`);
var root_5$4 = from_html(`<button class="pcr-ctx-item svelte-q0gc30"> </button>`);
var root_6$3 = from_html(`<button class="pcr-ctx-item svelte-q0gc30">Rename</button> <button class="pcr-ctx-item svelte-q0gc30">Delete</button>`, 1);
var root_7$3 = from_html(`<button class="pcr-ctx-item svelte-q0gc30">Properties</button>`);
var root_1$6 = from_html(`<!> <!> <button class="pcr-ctx-item svelte-q0gc30"> </button> <button class="pcr-ctx-item svelte-q0gc30">Cut</button> <button class="pcr-ctx-item svelte-q0gc30">Copy</button> <button class="pcr-ctx-item svelte-q0gc30">Copy as path</button> <!> <div class="pcr-ctx-sep svelte-q0gc30"></div> <!> <div class="pcr-ctx-sep svelte-q0gc30"></div> <button class="pcr-ctx-item svelte-q0gc30">Refresh</button> <!>`, 1);
var root_9$3 = from_html(`<button class="pcr-ctx-item svelte-q0gc30"> </button> <div class="pcr-ctx-sep svelte-q0gc30"></div>`, 1);
var root_12$2 = from_html(`<span class="pcr-ctx-check svelte-q0gc30">&#10003;</span>`);
var root_11$3 = from_html(`<button> <!></button>`);
var root_10$3 = from_html(`<div class="pcr-ctx-sub svelte-q0gc30"></div>`);
var root_16$2 = from_html(`<span class="pcr-ctx-dir svelte-q0gc30"> </span>`);
var root_15$2 = from_html(`<button> <!></button>`);
var root_14$2 = from_html(`<div class="pcr-ctx-sub svelte-q0gc30"></div>`);
var root_13$1 = from_html(`<div class="pcr-ctx-sub-wrap svelte-q0gc30"><button class="pcr-ctx-item pcr-ctx-has-sub svelte-q0gc30"><svg class="pcr-ctx-icon svelte-q0gc30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="16" y2="6"></line><line x1="4" y1="12" x2="12" y2="12"></line><line x1="4" y1="18" x2="8" y2="18"></line><polyline points="15 15 18 18 21 15"></polyline><line x1="18" y1="12" x2="18" y2="18"></line></svg> Sort by <span class="pcr-ctx-chevron svelte-q0gc30">&#9656;</span></button> <!></div>`);
var root_19 = from_html(`<span class="pcr-ctx-check svelte-q0gc30">&#10003;</span>`);
var root_18$1 = from_html(`<button> <!></button>`);
var root_17$2 = from_html(`<div class="pcr-ctx-sub svelte-q0gc30"></div>`);
var root_21$1 = from_html(`<button class="pcr-ctx-item svelte-q0gc30">Folder</button>`);
var root_20 = from_html(`<div class="pcr-ctx-sub svelte-q0gc30"><!> <button class="pcr-ctx-item svelte-q0gc30">Workflow</button></div>`);
var root_22$1 = from_html(`<button class="pcr-ctx-item svelte-q0gc30">Find duplicates</button>`);
var root_8$3 = from_html(`<!> <div class="pcr-ctx-sub-wrap svelte-q0gc30"><button class="pcr-ctx-item pcr-ctx-has-sub svelte-q0gc30"><svg class="pcr-ctx-icon svelte-q0gc30" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg> View <span class="pcr-ctx-chevron svelte-q0gc30">&#9656;</span></button> <!></div> <!> <div class="pcr-ctx-sub-wrap svelte-q0gc30"><button class="pcr-ctx-item pcr-ctx-has-sub svelte-q0gc30"><svg class="pcr-ctx-icon svelte-q0gc30" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm0 12a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H5Zm12 0a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2Zm0-12a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2Z"></path><path fill-rule="evenodd" d="M10 6.5a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1ZM10 18a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1Zm-4-4a1 1 0 0 1-1-1v-2a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1Zm12 0a1 1 0 0 1-1-1v-2a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1Z" clip-rule="evenodd"></path></svg> Group by <span class="pcr-ctx-chevron svelte-q0gc30">&#9656;</span></button> <!></div> <div class="pcr-ctx-sep svelte-q0gc30"></div> <div class="pcr-ctx-sub-wrap svelte-q0gc30"><button class="pcr-ctx-item pcr-ctx-has-sub svelte-q0gc30"><svg class="pcr-ctx-icon svelte-q0gc30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> New <span class="pcr-ctx-chevron svelte-q0gc30">&#9656;</span></button> <!></div> <div class="pcr-ctx-sep svelte-q0gc30"></div> <!> <button class="pcr-ctx-item svelte-q0gc30">Refresh</button> <button class="pcr-ctx-item svelte-q0gc30">Properties</button>`, 1);
var root = from_html(`<div class="pcr-ctx svelte-q0gc30"><!></div>`);
function ContextMenu($$anchor, $$props) {
  push($$props, true);
  let feed = prop($$props, "feed", 3, false);
  let menuEl;
  let openSub = state(null);
  let selCount = user_derived(() => selection.items.size);
  let isItemMenu = user_derived(() => !!$$props.targetItem);
  let currentView = user_derived(viewMode);
  let currentGroup = user_derived(groupMode);
  function act(action2) {
    var _a, _b;
    (_a = $$props.onAction) == null ? void 0 : _a.call($$props, action2);
    (_b = $$props.onClose) == null ? void 0 : _b.call($$props);
  }
  function handleSort(field) {
    var _a, _b;
    const dir = field === prefs.sortField ? prefs.sortDirection === "asc" ? "desc" : "asc" : field === "modified" || field === "size" ? "desc" : "asc";
    setSort(field, dir);
    (_a = $$props.onAction) == null ? void 0 : _a.call($$props, "refresh");
    (_b = $$props.onClose) == null ? void 0 : _b.call($$props);
  }
  let pos = user_derived(() => (() => {
    const mw = 180, mh = 400;
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
  var div = root();
  var node = child(div);
  {
    var consequent_5 = ($$anchor2) => {
      var fragment = root_1$6();
      var node_1 = first_child(fragment);
      {
        var consequent = ($$anchor3) => {
          var fragment_1 = root_2$4();
          var button = first_child(fragment_1);
          delegated("click", button, () => act("edit"));
          append($$anchor3, fragment_1);
        };
        if_block(node_1, ($$render) => {
          if ($$props.targetItem.type === "image") $$render(consequent);
        });
      }
      var node_2 = sibling(node_1, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var fragment_2 = root_3$4();
          var button_1 = first_child(fragment_2);
          delegated("click", button_1, () => act("locate"));
          append($$anchor3, fragment_2);
        };
        if_block(node_2, ($$render) => {
          if (feed()) $$render(consequent_1);
        });
      }
      var button_2 = sibling(node_2, 2);
      var text = child(button_2);
      var button_3 = sibling(button_2, 2);
      var button_4 = sibling(button_3, 2);
      var button_5 = sibling(button_4, 2);
      var node_3 = sibling(button_5, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var button_6 = root_4$4();
          delegated("click", button_6, () => act("paste"));
          append($$anchor3, button_6);
        };
        if_block(node_3, ($$render) => {
          if (clipboard.items.length > 0) $$render(consequent_2);
        });
      }
      var node_4 = sibling(node_3, 4);
      {
        var consequent_3 = ($$anchor3) => {
          var button_7 = root_5$4();
          var text_1 = child(button_7);
          template_effect(() => set_text(text_1, `Delete ${get(selCount) ?? ""} items`));
          delegated("click", button_7, () => act("delete"));
          append($$anchor3, button_7);
        };
        var alternate = ($$anchor3) => {
          var fragment_3 = root_6$3();
          var button_8 = first_child(fragment_3);
          var button_9 = sibling(button_8, 2);
          delegated("click", button_8, () => act("rename"));
          delegated("click", button_9, () => act("delete"));
          append($$anchor3, fragment_3);
        };
        if_block(node_4, ($$render) => {
          if (get(selCount) > 1) $$render(consequent_3);
          else $$render(alternate, -1);
        });
      }
      var button_10 = sibling(node_4, 4);
      var node_5 = sibling(button_10, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var button_11 = root_7$3();
          delegated("click", button_11, () => act("properties"));
          append($$anchor3, button_11);
        };
        if_block(node_5, ($$render) => {
          if (get(selCount) <= 1) $$render(consequent_4);
        });
      }
      template_effect(() => set_text(text, $$props.targetItem.favorite ? "Remove from favorites" : "Add to favorites"));
      delegated("click", button_2, () => act("favorite"));
      delegated("click", button_3, () => act("cut"));
      delegated("click", button_4, () => act("copy"));
      delegated("click", button_5, () => act("copy-path"));
      delegated("click", button_10, () => act("refresh"));
      append($$anchor2, fragment);
    };
    var alternate_1 = ($$anchor2) => {
      var fragment_4 = root_8$3();
      var node_6 = first_child(fragment_4);
      {
        var consequent_6 = ($$anchor3) => {
          var fragment_5 = root_9$3();
          var button_12 = first_child(fragment_5);
          var text_2 = child(button_12);
          template_effect(() => set_text(text_2, `Paste ${clipboard.items.length ?? ""} item${clipboard.items.length > 1 ? "s" : ""}`));
          event("mouseenter", button_12, () => set(openSub, null));
          delegated("click", button_12, () => act("paste"));
          append($$anchor3, fragment_5);
        };
        if_block(node_6, ($$render) => {
          if (clipboard.items.length > 0) $$render(consequent_6);
        });
      }
      var div_1 = sibling(node_6, 2);
      var node_7 = sibling(child(div_1), 2);
      {
        var consequent_8 = ($$anchor3) => {
          var div_2 = root_10$3();
          each(div_2, 21, () => VIEW_MODES, index, ($$anchor4, vm) => {
            var button_13 = root_11$3();
            let classes;
            var text_3 = child(button_13);
            var node_8 = sibling(text_3);
            {
              var consequent_7 = ($$anchor5) => {
                var span = root_12$2();
                append($$anchor5, span);
              };
              if_block(node_8, ($$render) => {
                if (get(currentView) === get(vm).id) $$render(consequent_7);
              });
            }
            template_effect(() => {
              classes = set_class(button_13, 1, "pcr-ctx-item svelte-q0gc30", null, classes, { active: get(currentView) === get(vm).id });
              set_text(text_3, `${get(vm).label ?? ""} `);
            });
            delegated("click", button_13, () => {
              var _a;
              setViewMode(get(vm).id);
              (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
            });
            append($$anchor4, button_13);
          });
          append($$anchor3, div_2);
        };
        if_block(node_7, ($$render) => {
          if (get(openSub) === "view") $$render(consequent_8);
        });
      }
      var node_9 = sibling(div_1, 2);
      {
        var consequent_11 = ($$anchor3) => {
          var div_3 = root_13$1();
          var node_10 = sibling(child(div_3), 2);
          {
            var consequent_10 = ($$anchor4) => {
              var div_4 = root_14$2();
              each(div_4, 21, () => SORT_FIELDS, index, ($$anchor5, s) => {
                var button_14 = root_15$2();
                let classes_1;
                var text_4 = child(button_14);
                var node_11 = sibling(text_4);
                {
                  var consequent_9 = ($$anchor6) => {
                    var span_1 = root_16$2();
                    var text_5 = child(span_1);
                    template_effect(() => set_text(text_5, prefs.sortDirection === "asc" ? "↑" : "↓"));
                    append($$anchor6, span_1);
                  };
                  if_block(node_11, ($$render) => {
                    if (prefs.sortField === get(s).field) $$render(consequent_9);
                  });
                }
                template_effect(() => {
                  classes_1 = set_class(button_14, 1, "pcr-ctx-item svelte-q0gc30", null, classes_1, { active: prefs.sortField === get(s).field });
                  set_text(text_4, `${get(s).label ?? ""} `);
                });
                delegated("click", button_14, () => handleSort(get(s).field));
                append($$anchor5, button_14);
              });
              append($$anchor4, div_4);
            };
            if_block(node_10, ($$render) => {
              if (get(openSub) === "sort") $$render(consequent_10);
            });
          }
          event("mouseenter", div_3, () => set(openSub, "sort"));
          append($$anchor3, div_3);
        };
        if_block(node_9, ($$render) => {
          if (!feed()) $$render(consequent_11);
        });
      }
      var div_5 = sibling(node_9, 2);
      var node_12 = sibling(child(div_5), 2);
      {
        var consequent_13 = ($$anchor3) => {
          var div_6 = root_17$2();
          each(div_6, 21, () => GROUP_MODES, index, ($$anchor4, g) => {
            var button_15 = root_18$1();
            let classes_2;
            var text_6 = child(button_15);
            var node_13 = sibling(text_6);
            {
              var consequent_12 = ($$anchor5) => {
                var span_2 = root_19();
                append($$anchor5, span_2);
              };
              if_block(node_13, ($$render) => {
                if (get(currentGroup) === get(g).id) $$render(consequent_12);
              });
            }
            template_effect(() => {
              classes_2 = set_class(button_15, 1, "pcr-ctx-item svelte-q0gc30", null, classes_2, { active: get(currentGroup) === get(g).id });
              set_text(text_6, `${get(g).label ?? ""} `);
            });
            delegated("click", button_15, () => {
              var _a, _b;
              setGroupMode(get(g).id);
              (_a = $$props.onAction) == null ? void 0 : _a.call($$props, "refresh");
              (_b = $$props.onClose) == null ? void 0 : _b.call($$props);
            });
            append($$anchor4, button_15);
          });
          append($$anchor3, div_6);
        };
        if_block(node_12, ($$render) => {
          if (get(openSub) === "group") $$render(consequent_13);
        });
      }
      var div_7 = sibling(div_5, 4);
      var node_14 = sibling(child(div_7), 2);
      {
        var consequent_15 = ($$anchor3) => {
          var div_8 = root_20();
          var node_15 = child(div_8);
          {
            var consequent_14 = ($$anchor4) => {
              var button_16 = root_21$1();
              delegated("click", button_16, () => act("mkdir"));
              append($$anchor4, button_16);
            };
            if_block(node_15, ($$render) => {
              if (!feed()) $$render(consequent_14);
            });
          }
          var button_17 = sibling(node_15, 2);
          delegated("click", button_17, () => act("new-workflow"));
          append($$anchor3, div_8);
        };
        if_block(node_14, ($$render) => {
          if (get(openSub) === "new") $$render(consequent_15);
        });
      }
      var node_16 = sibling(div_7, 4);
      {
        var consequent_16 = ($$anchor3) => {
          var button_18 = root_22$1();
          event("mouseenter", button_18, () => set(openSub, null));
          delegated("click", button_18, () => act("duplicates"));
          append($$anchor3, button_18);
        };
        if_block(node_16, ($$render) => {
          if ($$props.scope !== "workflows") $$render(consequent_16);
        });
      }
      var button_19 = sibling(node_16, 2);
      var button_20 = sibling(button_19, 2);
      event("mouseenter", div_1, () => set(openSub, "view"));
      event("mouseenter", div_5, () => set(openSub, "group"));
      event("mouseenter", div_7, () => set(openSub, "new"));
      event("mouseenter", button_19, () => set(openSub, null));
      delegated("click", button_19, () => act("refresh"));
      event("mouseenter", button_20, () => set(openSub, null));
      delegated("click", button_20, () => act("properties"));
      append($$anchor2, fragment_4);
    };
    if_block(node, ($$render) => {
      if (get(isItemMenu)) $$render(consequent_5);
      else $$render(alternate_1, -1);
    });
  }
  bind_this(div, ($$value) => menuEl = $$value, () => menuEl);
  template_effect(() => set_style(div, `left:${get(pos).left ?? ""}px;top:${get(pos).top ?? ""}px;`));
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_1$5 = from_html(`<div class="pcr-modal-backdrop"><div class="pcr-modal" role="dialog" aria-modal="true"><div class="pcr-modal-header"><span class="pcr-modal-title"> </span> <button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div> <div class="pcr-modal-body"><input type="text" class="pcr-modal-input svelte-15sun3z"/></div> <div class="pcr-modal-footer"><button class="pcr-modal-btn pcr-modal-btn-secondary">Cancel</button> <button class="pcr-modal-btn pcr-modal-btn-primary"> </button></div></div></div>`);
function PromptModal($$anchor, $$props) {
  push($$props, true);
  let defaultValue = prop($$props, "defaultValue", 3, ""), selectEnd = prop($$props, "selectEnd", 19, () => -1), confirmLabel = prop($$props, "confirmLabel", 3, "Create");
  let value = state("");
  let inputEl = state(null);
  user_effect(() => {
    if ($$props.open) {
      set(value, defaultValue());
      requestAnimationFrame(() => {
        var _a, _b, _c;
        (_a = get(inputEl)) == null ? void 0 : _a.focus();
        if (selectEnd() >= 0) (_b = get(inputEl)) == null ? void 0 : _b.setSelectionRange(0, selectEnd());
        else (_c = get(inputEl)) == null ? void 0 : _c.select();
      });
    }
  });
  function handleConfirm() {
    var _a;
    if (get(value).trim()) {
      (_a = $$props.onConfirm) == null ? void 0 : _a.call($$props, get(value).trim());
      set(value, "");
    }
  }
  function handleCancel() {
    var _a;
    set(value, "");
    (_a = $$props.onCancel) == null ? void 0 : _a.call($$props);
  }
  function handleKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleConfirm();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    }
  }
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) handleCancel();
  }
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var div = root_1$5();
      var div_1 = child(div);
      var div_2 = child(div_1);
      var span = child(div_2);
      var text = child(span);
      var button = sibling(span, 2);
      var div_3 = sibling(div_2, 2);
      var input = child(div_3);
      bind_this(input, ($$value) => set(inputEl, $$value), () => get(inputEl));
      var div_4 = sibling(div_3, 2);
      var button_1 = child(div_4);
      var button_2 = sibling(button_1, 2);
      var text_1 = child(button_2);
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      template_effect(
        ($0) => {
          set_text(text, $$props.title);
          set_attribute(input, "placeholder", $$props.placeholder);
          button_2.disabled = $0;
          set_text(text_1, confirmLabel());
        },
        [() => !get(value).trim()]
      );
      delegated("click", div, handleBackdrop);
      delegated("keydown", div, handleKeydown);
      delegated("click", button, handleCancel);
      delegated("keydown", input, handleKeydown);
      bind_value(input, () => get(value), ($$value) => set(value, $$value));
      delegated("click", button_1, handleCancel);
      delegated("click", button_2, handleConfirm);
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      if ($$props.open) $$render(consequent);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate(["click", "keydown"]);
var root_1$4 = from_html(`<div class="pcr-modal-backdrop"><div class="pcr-modal" role="dialog" aria-modal="true"><div class="pcr-modal-header"><span class="pcr-modal-title">File Conflict</span> <button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div> <div class="pcr-modal-body"><p class="pcr-cf-msg svelte-1h31ohb"> </p> <div class="pcr-cf-options svelte-1h31ohb"><label><input type="radio" name="conflict" class="svelte-1h31ohb"/> <div><div class="pcr-cf-opt-title svelte-1h31ohb">Replace</div> <div class="pcr-cf-opt-desc svelte-1h31ohb">Overwrite existing files</div></div></label> <label><input type="radio" name="conflict" class="svelte-1h31ohb"/> <div><div class="pcr-cf-opt-title svelte-1h31ohb">Skip</div> <div class="pcr-cf-opt-desc svelte-1h31ohb">Keep existing, skip conflicts</div></div></label> <label><input type="radio" name="conflict" class="svelte-1h31ohb"/> <div><div class="pcr-cf-opt-title svelte-1h31ohb">Keep Both</div> <div class="pcr-cf-opt-desc svelte-1h31ohb">Rename new files automatically</div></div></label></div></div> <div class="pcr-modal-footer"><button class="pcr-modal-btn pcr-modal-btn-secondary">Cancel</button> <button class="pcr-modal-btn pcr-modal-btn-primary">Continue</button></div></div></div>`);
function ConflictModal($$anchor, $$props) {
  push($$props, true);
  const binding_group = [];
  let conflicts = prop($$props, "conflicts", 19, () => []), total = prop($$props, "total", 3, 0);
  let resolution = state("rename");
  let confirmBtn = state(null);
  user_effect(() => {
    if ($$props.open) {
      set(resolution, "rename");
      requestAnimationFrame(() => {
        var _a;
        return (_a = get(confirmBtn)) == null ? void 0 : _a.focus();
      });
    }
  });
  function handleConfirm() {
    var _a;
    (_a = $$props.onConfirm) == null ? void 0 : _a.call($$props, get(resolution));
  }
  function handleCancel() {
    var _a;
    (_a = $$props.onCancel) == null ? void 0 : _a.call($$props);
  }
  function handleKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleConfirm();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    }
  }
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) handleCancel();
  }
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var div = root_1$4();
      var div_1 = child(div);
      var div_2 = child(div_1);
      var button = sibling(child(div_2), 2);
      var div_3 = sibling(div_2, 2);
      var p = child(div_3);
      var text = child(p);
      var div_4 = sibling(p, 2);
      var label = child(div_4);
      let classes;
      var input = child(label);
      input.value = input.__value = "replace";
      var label_1 = sibling(label, 2);
      let classes_1;
      var input_1 = child(label_1);
      input_1.value = input_1.__value = "skip";
      var label_2 = sibling(label_1, 2);
      let classes_2;
      var input_2 = child(label_2);
      input_2.value = input_2.__value = "rename";
      var div_5 = sibling(div_3, 2);
      var button_1 = child(div_5);
      var button_2 = sibling(button_1, 2);
      bind_this(button_2, ($$value) => set(confirmBtn, $$value), () => get(confirmBtn));
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      template_effect(() => {
        set_text(text, `${conflicts().length ?? ""} of ${total() ?? ""} item${total() === 1 ? "" : "s"} already exist in the destination.`);
        classes = set_class(label, 1, "pcr-cf-opt svelte-1h31ohb", null, classes, { active: get(resolution) === "replace" });
        classes_1 = set_class(label_1, 1, "pcr-cf-opt svelte-1h31ohb", null, classes_1, { active: get(resolution) === "skip" });
        classes_2 = set_class(label_2, 1, "pcr-cf-opt svelte-1h31ohb", null, classes_2, { active: get(resolution) === "rename" });
      });
      delegated("click", div, handleBackdrop);
      delegated("keydown", div, handleKeydown);
      delegated("click", button, handleCancel);
      bind_group(binding_group, [], input, () => get(resolution), ($$value) => set(resolution, $$value));
      bind_group(binding_group, [], input_1, () => get(resolution), ($$value) => set(resolution, $$value));
      bind_group(binding_group, [], input_2, () => get(resolution), ($$value) => set(resolution, $$value));
      delegated("click", button_1, handleCancel);
      delegated("click", button_2, handleConfirm);
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      if ($$props.open) $$render(consequent);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate(["click", "keydown"]);
var root_2$3 = from_html(`<div class="pcr-prop-loading svelte-afcx76">Loading...</div>`);
var root_4$3 = from_html(`<div class="pcr-prop-row svelte-afcx76"><span class="pcr-prop-label svelte-afcx76">Size</span> <span class="pcr-prop-value svelte-afcx76"> </span></div>`);
var root_5$3 = from_html(`<div class="pcr-prop-row svelte-afcx76"><span class="pcr-prop-label svelte-afcx76">Dimensions</span> <span class="pcr-prop-value svelte-afcx76"> </span></div>`);
var root_6$2 = from_html(`<div class="pcr-prop-row svelte-afcx76"><span class="pcr-prop-label svelte-afcx76">Items</span> <span class="pcr-prop-value svelte-afcx76"> </span></div>`);
var root_3$3 = from_html(`<div class="pcr-prop-rows svelte-afcx76"><div class="pcr-prop-row svelte-afcx76"><span class="pcr-prop-label svelte-afcx76">Name</span> <span class="pcr-prop-value svelte-afcx76"> </span></div> <div class="pcr-prop-row svelte-afcx76"><span class="pcr-prop-label svelte-afcx76">Type</span> <span class="pcr-prop-value svelte-afcx76"> </span></div> <div class="pcr-prop-row svelte-afcx76"><span class="pcr-prop-label svelte-afcx76">Path</span> <span class="pcr-prop-value svelte-afcx76"> </span></div> <div class="pcr-prop-row svelte-afcx76"><span class="pcr-prop-label svelte-afcx76">Full Path</span> <span class="pcr-prop-value pcr-prop-selectable svelte-afcx76"> </span></div> <!> <!> <!> <div class="pcr-prop-row svelte-afcx76"><span class="pcr-prop-label svelte-afcx76">Created</span> <span class="pcr-prop-value svelte-afcx76"> </span></div> <div class="pcr-prop-row svelte-afcx76"><span class="pcr-prop-label svelte-afcx76">Modified</span> <span class="pcr-prop-value svelte-afcx76"> </span></div></div>`);
var root_1$3 = from_html(`<div class="pcr-modal-backdrop"><div class="pcr-modal" role="dialog" aria-modal="true"><div class="pcr-modal-header"><span class="pcr-modal-title">Properties</span> <button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div> <div class="pcr-modal-body"><!></div> <div class="pcr-modal-footer"><button class="pcr-modal-btn pcr-modal-btn-secondary">Close</button></div></div></div>`);
function PropertiesModal($$anchor, $$props) {
  push($$props, true);
  const apiURL = getContext("pcr-apiURL");
  const toast = getContext("pcr-toast");
  let props = state(null);
  let loading = state(false);
  user_effect(() => {
    if ($$props.open && $$props.itemPath) {
      set(loading, true);
      set(props, null);
      const params = new URLSearchParams({ scope: $$props.scope, path: $$props.itemPath });
      fetch(apiURL(`/promptchain/browse/properties?${params}`)).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then((data) => {
        set(props, data, true);
        set(loading, false);
      }).catch((e) => {
        var _a;
        console.error("[PromptChain] properties load failed:", e);
        toast == null ? void 0 : toast("error", "Failed to load properties");
        set(loading, false);
        (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
      });
    }
  });
  function fmtDate(ts) {
    if (!ts) return "-";
    return new Date(ts * 1e3).toLocaleString();
  }
  function handleBackdrop(e) {
    var _a;
    if (e.target === e.currentTarget) (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
  }
  function handleKeydown(e) {
    var _a;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
    }
  }
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent_5 = ($$anchor2) => {
      var div = root_1$3();
      var div_1 = child(div);
      var div_2 = child(div_1);
      var button = sibling(child(div_2), 2);
      var div_3 = sibling(div_2, 2);
      var node_1 = child(div_3);
      {
        var consequent = ($$anchor3) => {
          var div_4 = root_2$3();
          append($$anchor3, div_4);
        };
        var consequent_4 = ($$anchor3) => {
          var div_5 = root_3$3();
          var div_6 = child(div_5);
          var span = sibling(child(div_6), 2);
          var text = child(span);
          var div_7 = sibling(div_6, 2);
          var span_1 = sibling(child(div_7), 2);
          var text_1 = child(span_1);
          var div_8 = sibling(div_7, 2);
          var span_2 = sibling(child(div_8), 2);
          var text_2 = child(span_2);
          var div_9 = sibling(div_8, 2);
          var span_3 = sibling(child(div_9), 2);
          var text_3 = child(span_3);
          var node_2 = sibling(div_9, 2);
          {
            var consequent_1 = ($$anchor4) => {
              var div_10 = root_4$3();
              var span_4 = sibling(child(div_10), 2);
              var text_4 = child(span_4);
              template_effect(() => set_text(text_4, get(props).sizeFormatted));
              append($$anchor4, div_10);
            };
            if_block(node_2, ($$render) => {
              if (get(props).size !== void 0) $$render(consequent_1);
            });
          }
          var node_3 = sibling(node_2, 2);
          {
            var consequent_2 = ($$anchor4) => {
              var div_11 = root_5$3();
              var span_5 = sibling(child(div_11), 2);
              var text_5 = child(span_5);
              template_effect(() => set_text(text_5, `${get(props).width ?? ""} × ${get(props).height ?? ""}`));
              append($$anchor4, div_11);
            };
            if_block(node_3, ($$render) => {
              if (get(props).width && get(props).height) $$render(consequent_2);
            });
          }
          var node_4 = sibling(node_3, 2);
          {
            var consequent_3 = ($$anchor4) => {
              var div_12 = root_6$2();
              var span_6 = sibling(child(div_12), 2);
              var text_6 = child(span_6);
              template_effect(() => set_text(text_6, get(props).childCount));
              append($$anchor4, div_12);
            };
            if_block(node_4, ($$render) => {
              if (get(props).childCount !== void 0) $$render(consequent_3);
            });
          }
          var div_13 = sibling(node_4, 2);
          var span_7 = sibling(child(div_13), 2);
          var text_7 = child(span_7);
          var div_14 = sibling(div_13, 2);
          var span_8 = sibling(child(div_14), 2);
          var text_8 = child(span_8);
          template_effect(
            ($0, $1) => {
              set_text(text, get(props).name);
              set_text(text_1, get(props).type);
              set_text(text_2, get(props).path || "/");
              set_text(text_3, get(props).fullPath);
              set_text(text_7, $0);
              set_text(text_8, $1);
            },
            [
              () => fmtDate(get(props).created),
              () => fmtDate(get(props).modified)
            ]
          );
          append($$anchor3, div_5);
        };
        if_block(node_1, ($$render) => {
          if (get(loading)) $$render(consequent);
          else if (get(props)) $$render(consequent_4, 1);
        });
      }
      var div_15 = sibling(div_3, 2);
      var button_1 = child(div_15);
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      delegated("click", div, handleBackdrop);
      delegated("keydown", div, handleKeydown);
      delegated("click", button, function(...$$args) {
        var _a;
        (_a = $$props.onClose) == null ? void 0 : _a.apply(this, $$args);
      });
      delegated("click", button_1, function(...$$args) {
        var _a;
        (_a = $$props.onClose) == null ? void 0 : _a.apply(this, $$args);
      });
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      if ($$props.open) $$render(consequent_5);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate(["click", "keydown"]);
var root_2$2 = from_html(`<div class="pcr-nwm-hint svelte-aa4cnk">Loading models...</div>`);
var root_3$2 = from_html(`<div class="pcr-nwm-hint pcr-nwm-err svelte-aa4cnk"> </div>`);
var root_4$2 = from_html(`<div class="pcr-nwm-hint svelte-aa4cnk">No models found — add a checkpoint to ComfyUI/models/checkpoints and restart ComfyUI.</div>`);
var root_5$2 = from_html(`<div class="pcr-nwm-hint svelte-aa4cnk">No matches</div>`);
var root_8$2 = from_html(`<button><span class="pcr-nwm-mname svelte-aa4cnk"> </span> <span class="pcr-nwm-chevron svelte-aa4cnk">&#9656;</span></button>`);
var root_7$2 = from_html(`<div class="pcr-nwm-group svelte-aa4cnk"> </div> <!>`, 1);
var root_10$2 = from_html(`<div class="pcr-nwm-hint svelte-aa4cnk">Loading templates...</div>`);
var root_11$2 = from_html(`<div class="pcr-nwm-hint svelte-aa4cnk">No templates for this model</div>`);
var root_14$1 = from_svg(`<svg class="pcr-nwm-tpl-icon svelte-aa4cnk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M2 8h20M2 16h20M7 4v16M17 4v16"></path></svg>`);
var root_15$1 = from_svg(`<svg class="pcr-nwm-tpl-icon svelte-aa4cnk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"></path></svg>`);
var root_16$1 = from_svg(`<svg class="pcr-nwm-tpl-icon svelte-aa4cnk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>`);
var root_17$1 = from_svg(`<svg class="pcr-nwm-tpl-icon svelte-aa4cnk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>`);
var root_13 = from_html(`<button class="pcr-nwm-tpl svelte-aa4cnk"><!> <span class="pcr-nwm-tpl-text svelte-aa4cnk"><span class="pcr-nwm-tpl-name svelte-aa4cnk"> </span> <span class="pcr-nwm-tpl-desc svelte-aa4cnk"> </span></span></button>`);
var root_9$2 = from_html(`<div class="pcr-nwm-col pcr-nwm-sub svelte-aa4cnk"><!></div>`);
var root_1$2 = from_html(`<div class="pcr-nwm svelte-aa4cnk"><div class="pcr-nwm-col svelte-aa4cnk"><button class="pcr-nwm-item pcr-nwm-blank svelte-aa4cnk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svelte-aa4cnk"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> Blank workflow</button> <div class="pcr-nwm-sep svelte-aa4cnk"></div> <input type="text" class="pcr-nwm-search svelte-aa4cnk" placeholder="Search models..."/> <div class="pcr-nwm-list svelte-aa4cnk"><!></div></div> <!></div>`);
function NewWorkflowMenu($$anchor, $$props) {
  push($$props, true);
  let anchor = prop($$props, "anchor", 19, () => ({ x: 0, y: 0 }));
  let models = state(proxy([]));
  let allConfigs = state(proxy({}));
  let loadingModels = state(false);
  let loadError = state(null);
  let search = state("");
  let selectedModelHash = state("");
  let templates = state(proxy([]));
  let loadingTemplates = state(false);
  let searchEl = state(null);
  let menuEl = state(null);
  const templateCache = /* @__PURE__ */ new Map();
  user_effect(() => {
    if (!$$props.open) return;
    set(search, "");
    set(selectedModelHash, "");
    set(templates, [], true);
    if (get(models).length === 0 && !get(loadingModels)) loadModels();
    requestAnimationFrame(() => {
      var _a;
      return (_a = get(searchEl)) == null ? void 0 : _a.focus();
    });
  });
  async function loadModels() {
    set(loadingModels, true);
    set(loadError, null);
    try {
      const resp = await $$props.fetchApi("/promptchain/models/list");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const raw = data.models || [];
      const hashes = raw.map((m) => m.hash).filter(Boolean);
      if (hashes.length) {
        try {
          const cfgResp = await $$props.fetchApi("/promptchain/models/settings/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashes })
          });
          if (cfgResp.ok) set(allConfigs, (await cfgResp.json()).settings || {}, true);
        } catch (e) {
          console.error("[PromptChain] bulk settings fetch failed:", e);
        }
      }
      set(models, raw.sort((a, b) => displayName(a).localeCompare(displayName(b))), true);
    } catch (e) {
      console.error("[PromptChain] model list load failed:", e);
      set(models, [], true);
      set(loadError, "Could not load models");
    }
    set(loadingModels, false);
  }
  function displayName(m) {
    const cfg = get(allConfigs)[m.hash];
    const dn = (cfg == null ? void 0 : cfg.display_name) || (cfg == null ? void 0 : cfg.model_name) || "";
    return dn || (m.filename || "").replace(/\.(safetensors|ckpt|gguf)$/i, "");
  }
  let archGroups = user_derived(() => {
    var _a;
    const q = get(search).trim().toLowerCase();
    const groups = /* @__PURE__ */ new Map();
    for (const m of get(models)) {
      if (q && !displayName(m).toLowerCase().includes(q)) continue;
      const arch = ((_a = get(allConfigs)[m.hash]) == null ? void 0 : _a.architecture) || "other";
      if (!groups.has(arch)) groups.set(arch, []);
      groups.get(arch).push(m);
    }
    return [...groups.entries()].sort((a, b) => (a[0] === "other") - (b[0] === "other") || a[0].localeCompare(b[0])).map(([arch, list]) => ({
      label: arch === "other" ? "unrecognized" : arch,
      models: list
    }));
  });
  let selectedModel = user_derived(() => get(models).find((m) => m.hash === get(selectedModelHash)));
  async function pickModel(m) {
    set(selectedModelHash, m.hash, true);
    set(templates, [], true);
    const cfg = get(allConfigs)[m.hash];
    if (!cfg) return;
    const key = `${cfg.architecture || ""}|${cfg.family || ""}`;
    if (templateCache.has(key)) {
      set(templates, templateCache.get(key), true);
      return;
    }
    set(loadingTemplates, true);
    const params = new URLSearchParams();
    if (cfg.architecture) params.set("arch", cfg.architecture);
    if (cfg.family) params.set("family", cfg.family);
    try {
      const resp = await $$props.fetchApi(`/promptchain/templates/list?${params}`);
      const data = resp.ok ? await resp.json() : { templates: [] };
      const list = (data.templates || []).filter((t) => !t._hidden);
      templateCache.set(key, list);
      if (get(selectedModelHash) === m.hash) set(templates, list, true);
    } catch {
      if (get(selectedModelHash) === m.hash) set(templates, [], true);
    }
    set(loadingTemplates, false);
  }
  function pickTemplate(tpl) {
    var _a;
    const m = get(selectedModel);
    if (!m) return;
    (_a = $$props.onPick) == null ? void 0 : _a.call($$props, {
      template: tpl,
      modelFilename: m.filename || "",
      suggestedName: `${tpl.name} - ${displayName(m)}`.toLowerCase()
    });
  }
  const TEMPLATE_BLURBS = {
    "Text-to-Image": "Render images from a written prompt",
    "Text-to-Image 3D": "Prompt plus 3D Poser pose control",
    "Text-to-Image 3D Regional": "3D Poser with per-character regional prompts",
    "Text-to-Image + FaceDetailer": "Prompt render with automatic face cleanup",
    "Image-to-Image": "Re-render an existing image with a prompt",
    "Image Edit": "Change an existing image with edit instructions",
    "Inpaint": "Repaint a masked region of an image",
    "Combine 2 References": "Blend two reference images into one",
    "Combine 3 References": "Blend three reference images into one",
    "Multi-Ref Edit (2)": "Edit using two reference images",
    "Multi-Ref Edit (3)": "Edit using three reference images",
    "Pose Transfer (AnyPose)": "Apply a reference pose to your character",
    "Pose Transfer (RefControl)": "Apply a reference pose to your character",
    "Text-to-Video": "Generate a video clip from a prompt",
    "Image-to-Video": "Animate a still image into a video clip"
  };
  const CATEGORY_BLURBS = {
    Generation: "Generate new images",
    Editing: "Edit existing images",
    Video: "Generate video",
    Custom: "Specialized workflow"
  };
  function tplBlurb(t) {
    return TEMPLATE_BLURBS[t.name] || CATEGORY_BLURBS[t.category] || "";
  }
  let pos = user_derived(() => {
    const mw = get(selectedModelHash) ? 540 : 280, mh = 440;
    const vw = window.innerWidth, vh = window.innerHeight;
    return {
      left: Math.max(8, Math.min(anchor().x, vw - mw - 8)),
      top: Math.max(8, Math.min(anchor().y, vh - mh - 8))
    };
  });
  user_effect(() => {
    if (!$$props.open) return;
    function onClick(e) {
      var _a;
      if (get(menuEl) && !get(menuEl).contains(e.target)) (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
    }
    function onKey(e) {
      var _a;
      if (e.key === "Escape") {
        e.stopPropagation();
        (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
      }
    }
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  });
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent_10 = ($$anchor2) => {
      var div = root_1$2();
      var div_1 = child(div);
      var button = child(div_1);
      var input = sibling(button, 4);
      bind_this(input, ($$value) => set(searchEl, $$value), () => get(searchEl));
      var div_2 = sibling(input, 2);
      var node_1 = child(div_2);
      {
        var consequent = ($$anchor3) => {
          var div_3 = root_2$2();
          append($$anchor3, div_3);
        };
        var consequent_1 = ($$anchor3) => {
          var div_4 = root_3$2();
          var text = child(div_4);
          template_effect(() => set_text(text, get(loadError)));
          append($$anchor3, div_4);
        };
        var consequent_2 = ($$anchor3) => {
          var div_5 = root_4$2();
          append($$anchor3, div_5);
        };
        var consequent_3 = ($$anchor3) => {
          var div_6 = root_5$2();
          append($$anchor3, div_6);
        };
        var alternate = ($$anchor3) => {
          var fragment_1 = comment();
          var node_2 = first_child(fragment_1);
          each(node_2, 17, () => get(archGroups), (g) => g.label, ($$anchor4, g) => {
            var fragment_2 = root_7$2();
            var div_7 = first_child(fragment_2);
            var text_1 = child(div_7);
            var node_3 = sibling(div_7, 2);
            each(node_3, 17, () => get(g).models, (m) => m.hash, ($$anchor5, m) => {
              var button_1 = root_8$2();
              let classes;
              var span = child(button_1);
              var text_2 = child(span);
              template_effect(
                ($0) => {
                  classes = set_class(button_1, 1, "pcr-nwm-item svelte-aa4cnk", null, classes, { selected: get(selectedModelHash) === get(m).hash });
                  set_text(text_2, $0);
                },
                [() => displayName(get(m))]
              );
              delegated("click", button_1, () => pickModel(get(m)));
              append($$anchor5, button_1);
            });
            template_effect(() => set_text(text_1, get(g).label));
            append($$anchor4, fragment_2);
          });
          append($$anchor3, fragment_1);
        };
        if_block(node_1, ($$render) => {
          if (get(loadingModels)) $$render(consequent);
          else if (get(loadError)) $$render(consequent_1, 1);
          else if (get(models).length === 0) $$render(consequent_2, 2);
          else if (get(archGroups).length === 0) $$render(consequent_3, 3);
          else $$render(alternate, -1);
        });
      }
      var node_4 = sibling(div_1, 2);
      {
        var consequent_9 = ($$anchor3) => {
          var div_8 = root_9$2();
          var node_5 = child(div_8);
          {
            var consequent_4 = ($$anchor4) => {
              var div_9 = root_10$2();
              append($$anchor4, div_9);
            };
            var consequent_5 = ($$anchor4) => {
              var div_10 = root_11$2();
              append($$anchor4, div_10);
            };
            var alternate_2 = ($$anchor4) => {
              var fragment_3 = comment();
              var node_6 = first_child(fragment_3);
              each(node_6, 17, () => get(templates), (tpl) => tpl.id, ($$anchor5, tpl) => {
                var button_2 = root_13();
                var node_7 = child(button_2);
                {
                  var consequent_6 = ($$anchor6) => {
                    var svg = root_14$1();
                    append($$anchor6, svg);
                  };
                  var consequent_7 = ($$anchor6) => {
                    var svg_1 = root_15$1();
                    append($$anchor6, svg_1);
                  };
                  var consequent_8 = ($$anchor6) => {
                    var svg_2 = root_16$1();
                    append($$anchor6, svg_2);
                  };
                  var alternate_1 = ($$anchor6) => {
                    var svg_3 = root_17$1();
                    append($$anchor6, svg_3);
                  };
                  if_block(node_7, ($$render) => {
                    if (get(tpl).category === "Video") $$render(consequent_6);
                    else if (get(tpl).category === "Editing") $$render(consequent_7, 1);
                    else if (get(tpl).category === "Custom") $$render(consequent_8, 2);
                    else $$render(alternate_1, -1);
                  });
                }
                var span_1 = sibling(node_7, 2);
                var span_2 = child(span_1);
                var text_3 = child(span_2);
                var span_3 = sibling(span_2, 2);
                var text_4 = child(span_3);
                template_effect(
                  ($0) => {
                    set_text(text_3, get(tpl).name);
                    set_text(text_4, $0);
                  },
                  [() => tplBlurb(get(tpl))]
                );
                delegated("click", button_2, () => pickTemplate(get(tpl)));
                append($$anchor5, button_2);
              });
              append($$anchor4, fragment_3);
            };
            if_block(node_5, ($$render) => {
              if (get(loadingTemplates)) $$render(consequent_4);
              else if (get(templates).length === 0) $$render(consequent_5, 1);
              else $$render(alternate_2, -1);
            });
          }
          append($$anchor3, div_8);
        };
        if_block(node_4, ($$render) => {
          if (get(selectedModelHash)) $$render(consequent_9);
        });
      }
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      bind_this(div, ($$value) => set(menuEl, $$value), () => get(menuEl));
      template_effect(() => set_style(div, `left:${get(pos).left ?? ""}px;top:${get(pos).top ?? ""}px;`));
      delegated("click", button, () => {
        var _a;
        return (_a = $$props.onPick) == null ? void 0 : _a.call($$props, { blank: true });
      });
      bind_value(input, () => get(search), ($$value) => set(search, $$value));
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      if ($$props.open) $$render(consequent_10);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate(["click"]);
var root_2$1 = from_html(`<button> </button>`);
var root_4$1 = from_html(`<span>Deleting…</span>`);
var root_5$1 = from_html(`<span> </span> <div class="pcr-dup-bar svelte-1kn2677"><div class="pcr-dup-bar-fill svelte-1kn2677"></div></div>`, 1);
var root_6$1 = from_html(`<span>Scanning…</span>`);
var root_3$1 = from_html(`<div class="pcr-dup-progress svelte-1kn2677"><!></div>`);
var root_7$1 = from_html(`<div class="pcr-dup-progress pcr-dup-error svelte-1kn2677"> </div>`);
var root_8$1 = from_html(`<div class="pcr-dup-progress svelte-1kn2677"> </div>`);
var root_12$1 = from_html(`<span class="pcr-dup-keep svelte-1kn2677">keep</span>`);
var root_11$1 = from_html(`<div><div class="pcr-dup-imgwrap svelte-1kn2677"><img loading="lazy" decoding="async" class="svelte-1kn2677"/> <!> <span></span></div> <div class="pcr-dup-meta svelte-1kn2677"><span class="pcr-dup-name svelte-1kn2677"> </span> <span class="pcr-dup-info svelte-1kn2677"> </span></div></div>`);
var root_10$1 = from_html(`<div class="pcr-dup-cluster svelte-1kn2677"></div>`);
var root_9$1 = from_html(`<div class="pcr-dup-summary svelte-1kn2677"> </div> <div class="pcr-dup-list svelte-1kn2677"></div>`, 1);
var root_1$1 = from_html(`<div class="pcr-modal-backdrop"><div class="pcr-modal pcr-dup-modal" role="dialog" aria-modal="true"><div class="pcr-modal-header"><span class="pcr-modal-title"> </span> <div class="pcr-dup-thresholds svelte-1kn2677"></div> <button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div> <div class="pcr-modal-body pcr-dup-body svelte-1kn2677"><!></div> <div class="pcr-modal-footer"><button class="pcr-modal-btn pcr-modal-btn-secondary">Close</button> <button class="pcr-modal-btn pcr-modal-btn-danger"> </button></div></div></div>`);
function DuplicatesModal($$anchor, $$props) {
  push($$props, true);
  let path = prop($$props, "path", 3, "");
  const apiURL = getContext("pcr-apiURL");
  let phase = state(
    "idle"
    // idle | scanning | results | deleting | error
  );
  let progress = state(
    null
    // { done, total }
  );
  let clusters = state(proxy([]));
  let totalImages = state(0);
  let checked = state(proxy(/* @__PURE__ */ new Set()));
  let threshold = state(5);
  let errorMsg = state("");
  let scanId = 0;
  const THRESHOLDS = [
    { v: 0, label: "Identical only" },
    { v: 2, label: "Strict" },
    { v: 5, label: "Normal" },
    { v: 7, label: "Loose" }
  ];
  user_effect(() => {
    if ($$props.open) {
      scan();
    } else {
      scanId++;
      set(phase, "idle");
      set(clusters, [], true);
      set(checked, /* @__PURE__ */ new Set(), true);
      set(progress, null);
    }
  });
  async function scan() {
    var _a;
    const id = ++scanId;
    set(phase, "scanning");
    set(progress, null);
    set(errorMsg, "");
    const unsub = (_a = $$props.onSubscribeDedup) == null ? void 0 : _a.call($$props, (d) => {
      if (id === scanId) set(progress, d, true);
    });
    try {
      const params = new URLSearchParams({
        scope: $$props.scope,
        path: path(),
        threshold: String(get(threshold))
      });
      const resp = await $$props.fetchApi(`/promptchain/browse/duplicates?${params}`);
      if (id !== scanId) return;
      if (!resp.ok) throw new Error(`scan failed (${resp.status})`);
      const data = await resp.json();
      if (id !== scanId) return;
      set(clusters, data.clusters, true);
      set(totalImages, data.totalImages, true);
      set(checked, new Set(get(clusters).flatMap((c) => c.items.filter((i) => !i.keep).map((i) => i.path))), true);
      set(phase, "results");
    } catch (e) {
      if (id !== scanId) return;
      set(errorMsg, (e == null ? void 0 : e.message) || "scan failed", true);
      set(phase, "error");
    } finally {
      unsub == null ? void 0 : unsub();
    }
  }
  function setThreshold(v) {
    set(threshold, v, true);
    if (get(phase) !== "scanning") scan();
  }
  function toggleChecked(p) {
    const next = new Set(get(checked));
    next.has(p) ? next.delete(p) : next.add(p);
    set(checked, next, true);
  }
  function thumbSrc(item) {
    return apiURL(`/promptchain/browse/preview?scope=${$$props.scope}&path=${encodeURIComponent(item.path)}&thumb=1`);
  }
  function fmtSize(b) {
    if (!b) return "-";
    if (b < 1048576) return (b / 1024).toFixed(0) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }
  let dupCount = user_derived(() => get(clusters).reduce((a, c) => a + c.items.length - 1, 0));
  async function deleteChecked() {
    var _a;
    if (!get(checked).size || get(phase) === "deleting") return;
    set(phase, "deleting");
    try {
      const resp = await $$props.fetchApi("/promptchain/browse/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: $$props.scope, paths: [...get(checked)] })
      });
      const result = await resp.json();
      const deleted = new Set(result.deleted || []);
      if (deleted.size) {
        window.dispatchEvent(new CustomEvent("promptchain:file-deleted", { detail: { scope: $$props.scope, paths: [...deleted] } }));
        (_a = $$props.onDeleted) == null ? void 0 : _a.call($$props, [...deleted]);
      }
      set(clusters, get(clusters).map((c) => ({ items: c.items.filter((i) => !deleted.has(i.path)) })).filter((c) => c.items.length >= 2), true);
      set(checked, new Set([...get(checked)].filter((p) => !deleted.has(p))), true);
    } catch {
    }
    set(phase, "results");
  }
  function handleKeydown(e) {
    var _a;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
    }
  }
  function handleBackdrop(e) {
    var _a;
    if (e.target === e.currentTarget) (_a = $$props.onClose) == null ? void 0 : _a.call($$props);
  }
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent_7 = ($$anchor2) => {
      var div = root_1$1();
      var div_1 = child(div);
      var div_2 = child(div_1);
      var span = child(div_2);
      var text = child(span);
      var div_3 = sibling(span, 2);
      each(div_3, 21, () => THRESHOLDS, index, ($$anchor3, t) => {
        var button = root_2$1();
        let classes;
        var text_1 = child(button);
        template_effect(() => {
          classes = set_class(button, 1, "pcr-dup-th svelte-1kn2677", null, classes, { active: get(threshold) === get(t).v });
          button.disabled = get(phase) === "scanning";
          set_text(text_1, get(t).label);
        });
        delegated("click", button, () => setThreshold(get(t).v));
        append($$anchor3, button);
      });
      var button_1 = sibling(div_3, 2);
      var div_4 = sibling(div_2, 2);
      var node_1 = child(div_4);
      {
        var consequent_2 = ($$anchor3) => {
          var div_5 = root_3$1();
          var node_2 = child(div_5);
          {
            var consequent = ($$anchor4) => {
              var span_1 = root_4$1();
              append($$anchor4, span_1);
            };
            var consequent_1 = ($$anchor4) => {
              var fragment_1 = root_5$1();
              var span_2 = first_child(fragment_1);
              var text_2 = child(span_2);
              var div_6 = sibling(span_2, 2);
              var div_7 = child(div_6);
              template_effect(
                ($0) => {
                  set_text(text_2, `Hashing images… ${get(progress).done ?? ""} / ${get(progress).total ?? ""}`);
                  set_style(div_7, `width:${$0 ?? ""}%`);
                },
                [
                  () => get(progress).done / Math.max(1, get(progress).total) * 100
                ]
              );
              append($$anchor4, fragment_1);
            };
            var alternate = ($$anchor4) => {
              var span_3 = root_6$1();
              append($$anchor4, span_3);
            };
            if_block(node_2, ($$render) => {
              if (get(phase) === "deleting") $$render(consequent);
              else if (get(progress)) $$render(consequent_1, 1);
              else $$render(alternate, -1);
            });
          }
          append($$anchor3, div_5);
        };
        var consequent_3 = ($$anchor3) => {
          var div_8 = root_7$1();
          var text_3 = child(div_8);
          template_effect(() => set_text(text_3, get(errorMsg)));
          append($$anchor3, div_8);
        };
        var consequent_4 = ($$anchor3) => {
          var div_9 = root_8$1();
          var text_4 = child(div_9);
          template_effect(() => set_text(text_4, `No duplicates found across ${get(totalImages) ?? ""} images.`));
          append($$anchor3, div_9);
        };
        var consequent_6 = ($$anchor3) => {
          var fragment_2 = root_9$1();
          var div_10 = first_child(fragment_2);
          var text_5 = child(div_10);
          var div_11 = sibling(div_10, 2);
          each(div_11, 23, () => get(clusters), (cluster, ci) => {
            var _a;
            return ((_a = cluster.items[0]) == null ? void 0 : _a.path) ?? ci;
          }, ($$anchor4, cluster) => {
            var div_12 = root_10$1();
            each(div_12, 21, () => get(cluster).items, (item) => item.path, ($$anchor5, item) => {
              const isChecked = user_derived(() => get(checked).has(get(item).path));
              var div_13 = root_11$1();
              let classes_1;
              var div_14 = child(div_13);
              var img = child(div_14);
              var node_3 = sibling(img, 2);
              {
                var consequent_5 = ($$anchor6) => {
                  var span_4 = root_12$1();
                  append($$anchor6, span_4);
                };
                if_block(node_3, ($$render) => {
                  if (get(item).keep) $$render(consequent_5);
                });
              }
              var span_5 = sibling(node_3, 2);
              let classes_2;
              var div_15 = sibling(div_14, 2);
              var span_6 = child(div_15);
              var text_6 = child(span_6);
              var span_7 = sibling(span_6, 2);
              var text_7 = child(span_7);
              template_effect(
                ($0, $1) => {
                  classes_1 = set_class(div_13, 1, "pcr-dup-card svelte-1kn2677", null, classes_1, { marked: get(isChecked) });
                  set_attribute(img, "src", $0);
                  set_attribute(img, "alt", get(item).name);
                  classes_2 = set_class(span_5, 1, "pcr-dup-check svelte-1kn2677", null, classes_2, { on: get(isChecked) });
                  set_attribute(div_15, "title", get(item).path);
                  set_text(text_6, get(item).name);
                  set_text(text_7, `${get(item).width && get(item).height ? `${get(item).width}×${get(item).height} · ` : ""}${$1 ?? ""}`);
                },
                [() => thumbSrc(get(item)), () => fmtSize(get(item).size)]
              );
              delegated("click", div_13, () => toggleChecked(get(item).path));
              append($$anchor5, div_13);
            });
            append($$anchor4, div_12);
          });
          template_effect(() => set_text(text_5, `${get(clusters).length ?? ""} group${get(clusters).length === 1 ? "" : "s"} · ${get(dupCount) ?? ""} duplicate${get(dupCount) === 1 ? "" : "s"} across ${get(totalImages) ?? ""} images — largest file in each group is kept by default`));
          append($$anchor3, fragment_2);
        };
        if_block(node_1, ($$render) => {
          if (get(phase) === "scanning" || get(phase) === "deleting") $$render(consequent_2);
          else if (get(phase) === "error") $$render(consequent_3, 1);
          else if (get(phase) === "results" && get(clusters).length === 0) $$render(consequent_4, 2);
          else if (get(phase) === "results") $$render(consequent_6, 3);
        });
      }
      var div_16 = sibling(div_4, 2);
      var button_2 = child(div_16);
      var button_3 = sibling(button_2, 2);
      var text_8 = child(button_3);
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      template_effect(() => {
        set_text(text, `Find Duplicates${path() ? ` — ${path()}` : ""}`);
        button_3.disabled = !get(checked).size || get(phase) !== "results";
        set_text(text_8, `Delete ${get(checked).size ?? ""} file${get(checked).size === 1 ? "" : "s"}`);
      });
      delegated("click", div, handleBackdrop);
      delegated("keydown", div, handleKeydown);
      delegated("click", button_1, function(...$$args) {
        var _a;
        (_a = $$props.onClose) == null ? void 0 : _a.apply(this, $$args);
      });
      delegated("click", button_2, function(...$$args) {
        var _a;
        (_a = $$props.onClose) == null ? void 0 : _a.apply(this, $$args);
      });
      delegated("click", button_3, deleteChecked);
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      if ($$props.open) $$render(consequent_7);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate(["click", "keydown"]);
function sortCompare(a, b, sortField, sortDirection) {
  const af = a.type === "folder" ? 0 : 1;
  const bf = b.type === "folder" ? 0 : 1;
  if (af !== bf) return af - bf;
  const desc = sortDirection === "desc";
  let cmp = 0;
  if (sortField === "name") cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  else if (sortField === "modified") cmp = (a.modified || 0) - (b.modified || 0);
  else if (sortField === "size") cmp = (a.size || 0) - (b.size || 0);
  else if (sortField === "type") cmp = (a.extension || a.type).localeCompare(b.extension || b.type);
  return desc ? -cmp : cmp;
}
function insertSorted(items, item, sortField, sortDirection) {
  const a = [...items];
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (sortCompare(item, a[mid], sortField, sortDirection) > 0) lo = mid + 1;
    else hi = mid;
  }
  a.splice(lo, 0, item);
  return a;
}
function patchItemInList(items, oldPath, data, sortField, sortDirection) {
  const idx = items.findIndex((i) => i.path === oldPath);
  if (idx < 0) return items;
  const updated = { ...items[idx], ...data };
  if (data.name !== void 0 || data.modified !== void 0 || data.size !== void 0) {
    const filtered = items.filter((_, i) => i !== idx);
    return insertSorted(filtered, updated, sortField, sortDirection);
  }
  const a = [...items];
  a[idx] = updated;
  return a;
}
function dropItemsByPath(items, paths) {
  const s = new Set(paths);
  return items.filter((i) => !s.has(i.path));
}
function buildGroups(items, mode) {
  if (mode === "none" || !mode) return [{ label: null, items }];
  const d = /* @__PURE__ */ new Date();
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1e3;
  const buckets = /* @__PURE__ */ new Map();
  const order = [];
  for (const item of items) {
    let key;
    if (mode === "time") {
      const t = item.modified || 0;
      if (t >= dayStart) key = "Today";
      else if (t >= dayStart - 86400) key = "Yesterday";
      else if (t >= dayStart - 7 * 86400) key = "This Week";
      else if (t >= dayStart - 30 * 86400) key = "This Month";
      else key = "Older";
    } else if (mode === "type") {
      key = item.type === "folder" ? "Folders" : item.type === "image" ? "Images" : item.type === "video" ? "Videos" : item.type === "workflow" ? "Workflows" : "Other";
    } else if (mode === "size") {
      const s = item.size || 0;
      if (item.type === "folder") key = "Folders";
      else if (s >= 50 * 1048576) key = "Huge (50+ MB)";
      else if (s >= 5 * 1048576) key = "Large (5-50 MB)";
      else if (s >= 307200) key = "Medium (300 KB-5 MB)";
      else key = "Small (< 300 KB)";
    }
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key).push(item);
  }
  return order.map((key) => ({ label: key, items: buckets.get(key) }));
}
var root_2 = from_html(`<img alt="PromptChain" class="pcr-hdr-logo svelte-wtd4vk"/>`);
var root_4 = from_html(`<button class="pcr-kebab-item svelte-wtd4vk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-wtd4vk"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg> Find Duplicates</button>`);
var root_3 = from_html(`<div class="pcr-kebab-dd svelte-wtd4vk"><button class="pcr-kebab-item svelte-wtd4vk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-wtd4vk"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg> New Workflow</button> <button class="pcr-kebab-item svelte-wtd4vk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-wtd4vk"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg> New Folder</button> <!> <div class="pcr-kebab-sep svelte-wtd4vk"></div> <button class="pcr-kebab-item svelte-wtd4vk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-wtd4vk"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> Settings</button> <div class="pcr-kebab-sep svelte-wtd4vk"></div> <button class="pcr-kebab-item svelte-wtd4vk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-wtd4vk"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> About PromptChain</button> <button class="pcr-kebab-item svelte-wtd4vk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-wtd4vk"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Help</button></div>`);
var root_6 = from_html(`<span class="pcr-bc-sep svelte-wtd4vk">/</span>`);
var root_5 = from_html(`<!> <button> </button>`, 1);
var root_7 = from_html(`<button class="pcr-bc-feedchip svelte-wtd4vk" title="Showing all subfolders, newest first — click to return to folder view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svelte-wtd4vk"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg> recent</button>`);
var root_8 = from_html(`<span> <button class="pcr-bc-clear svelte-wtd4vk" title="Clear clipboard">&times;</button></span>`);
var root_9 = from_html(`<span class="pcr-bc-info pcr-bc-sel svelte-wtd4vk"> </span>`);
var root_10 = from_html(`<span class="pcr-bc-info svelte-wtd4vk"> </span>`);
var root_11 = from_html(`<div class="pcr-ph svelte-wtd4vk">Loading...</div>`);
var root_12 = from_html(`<div class="pcr-ph pcr-ph-err svelte-wtd4vk"> </div>`);
var root_14 = from_html(`<div class="pcr-qs svelte-wtd4vk"><svg class="pcr-qs-icon svelte-wtd4vk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4"></path></svg> <div class="pcr-qs-title svelte-wtd4vk">No workflows yet</div> <div class="pcr-qs-sub svelte-wtd4vk">Pick a template wired up for your model and start rendering right away.</div> <button class="pcr-qs-btn svelte-wtd4vk">Create your first workflow</button></div>`);
var root_15 = from_html(`<div class="pcr-ph svelte-wtd4vk"> </div>`);
var root_18 = from_html(`<div class="pcr-group-hdr svelte-wtd4vk"> <span class="pcr-group-count svelte-wtd4vk"> </span></div>`);
var root_17 = from_html(`<!> <!>`, 1);
var root_21 = from_html(`<div class="pcr-feed-sentinel svelte-wtd4vk"> </div>`);
var root_16 = from_html(`<!> <!>`, 1);
var root_22 = from_html(`<div class="pcr-drop-overlay svelte-wtd4vk"><div class="pcr-drop-label svelte-wtd4vk">Drop files to upload</div></div>`);
var root_23 = from_html(`<div class="pcr-rb"></div>`);
var root_1 = from_html(`<div class="pcr-browser svelte-wtd4vk" tabindex="-1"><div class="pcr-hdr svelte-wtd4vk"><a href="https://github.com/mobcat40/ComfyUI-PromptChain" target="_blank" rel="noopener noreferrer" title="PromptChain on GitHub"><!></a> <div class="pcr-hdr-btns svelte-wtd4vk"><button class="pcr-hdr-btn svelte-wtd4vk" title="Add PromptChain Node"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-wtd4vk"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg></button> <div class="pcr-kebab-wrap svelte-wtd4vk"><button class="pcr-hdr-btn svelte-wtd4vk" title="More options"><svg viewBox="0 0 24 24" fill="currentColor" class="svelte-wtd4vk"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg></button> <!></div></div></div> <!> <div class="pcr-bc svelte-wtd4vk"><button>/</button> <!> <!> <!></div>  <div class="pcr-content svelte-wtd4vk"><!> <!></div> <!> <!></div> <!> <!> <!> <!> <!> <!>`, 1);
function AssetBrowser($$anchor, $$props) {
  push($$props, true);
  setContext("pcr-apiURL", (path2) => $$props.apiURL(path2));
  setContext("pcr-toast", (...args) => {
    var _a;
    return (_a = $$props.toast) == null ? void 0 : _a.call($$props, ...args);
  });
  let items = state(proxy([]));
  let loading = state(false);
  let error = state(null);
  let searchQuery = state("");
  let lastMtime = {};
  let scopeRoots = {};
  let nextCursor = state(null);
  let feedTotal = state(0);
  let loadingMore = state(false);
  let ctxMenu = state(
    null
    // { x, y, item } or null
  );
  let bcDropTarget = state(null);
  let kebabOpen = state(false);
  let kebabEl;
  let modalOpen = state(false);
  let modalTitle = state("");
  let modalPlaceholder = state("");
  let modalDefault = state("");
  let modalConfirmLabel = state("Create");
  let modalSelectEnd = state(-1);
  let modalMode = state(
    "mkdir"
    // "mkdir" | "rename"
  );
  let renameItem = state(null);
  let nwmOpen = state(false);
  let nwmAnchor = state(proxy({ x: 0, y: 0 }));
  let conflictOpen = state(false);
  let conflictData = state(null);
  let confirmOpen = state(false);
  let confirmMsg = state("");
  let confirmPaths = state(proxy([]));
  let propsOpen = state(false);
  let propsItem = state(null);
  let dupOpen = state(false);
  const SCOPES = [
    { id: "workflows", label: "Workflows" },
    { id: "input", label: "Input" },
    { id: "output", label: "Output" }
  ];
  let scope = user_derived(() => nav.scope);
  let path = user_derived(() => nav.paths[nav.scope] || []);
  let currentViewMode = user_derived(viewMode);
  let isFeed = user_derived(feedMode);
  let isFavFilter = user_derived(favFilter);
  let navBack = [];
  let navFwd = [];
  function pushNav() {
    navBack.push({
      scope: nav.scope,
      path: [...nav.paths[nav.scope]],
      feed: feedMode()
    });
    navFwd = [];
  }
  function navigateBack() {
    if (!navBack.length) return;
    navFwd.push({
      scope: nav.scope,
      path: [...nav.paths[nav.scope]],
      feed: feedMode()
    });
    const prev = navBack.pop();
    nav.scope = prev.scope;
    nav.paths[prev.scope] = prev.path;
    setFeedMode(prev.feed ?? false);
    clearSelection();
    fetchFolder(prev.path);
  }
  function navigateForward() {
    if (!navFwd.length) return;
    navBack.push({
      scope: nav.scope,
      path: [...nav.paths[nav.scope]],
      feed: feedMode()
    });
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
    fetchAc == null ? void 0 : fetchAc.abort();
    fetchAc = new AbortController();
    const signal = fetchAc.signal;
    set(loading, true);
    set(loadingMore, false);
    set(error, null);
    try {
      const params = new URLSearchParams({
        scope: nav.scope,
        path: newPath.join("/"),
        sort: prefs.sortField,
        direction: prefs.sortDirection
      });
      const resp = await $$props.fetchApi(`/promptchain/browse?${params}`, { signal });
      if (id !== fetchId) return;
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      if (id !== fetchId) return;
      set(items, data.items, true);
      nav.paths[nav.scope] = data.path;
      if (data.root) scopeRoots[nav.scope] = data.root;
      $$props.fetchApi(`/promptchain/browse/mtime?${new URLSearchParams({ scope: nav.scope, path: newPath.join("/") })}`, { signal }).then((r) => r.ok ? r.json() : null).then((d) => {
        if (d) lastMtime[`${nav.scope}:${newPath.join("/")}`] = d.mtime;
      }).catch(() => {
      });
    } catch (e) {
      if ((e == null ? void 0 : e.name) === "AbortError") return;
      if (id !== fetchId) return;
      set(error, e.message, true);
      set(items, [], true);
    }
    set(loading, false);
  }
  const FEED_PAGE_SIZE = 60;
  async function fetchFeed(newPath, append2 = false, quiet = false) {
    const id = ++fetchId;
    fetchAc == null ? void 0 : fetchAc.abort();
    fetchAc = new AbortController();
    const signal = fetchAc.signal;
    if (append2) {
      set(loadingMore, true);
    } else {
      if (!quiet) set(loading, true);
      set(loadingMore, false);
    }
    set(error, null);
    try {
      const params = new URLSearchParams({
        scope: nav.scope,
        path: newPath.join("/"),
        limit: String(FEED_PAGE_SIZE)
      });
      if (get(searchQuery)) params.set("q", get(searchQuery));
      if (favFilter()) params.set("starred", "1");
      if (append2 && get(nextCursor)) {
        params.set("cursor_m", String(get(nextCursor).m));
        params.set("cursor_p", get(nextCursor).p);
      }
      const resp = await $$props.fetchApi(`/promptchain/browse/recent?${params}`, { signal });
      if (id !== fetchId) return;
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      if (id !== fetchId) return;
      set(items, append2 ? [...get(items), ...data.items] : data.items, true);
      set(nextCursor, data.nextCursor, true);
      set(feedTotal, data.total, true);
      nav.paths[nav.scope] = data.path;
      if (data.root) scopeRoots[nav.scope] = data.root;
    } catch (e) {
      if ((e == null ? void 0 : e.name) === "AbortError") return;
      if (id !== fetchId) return;
      set(error, e.message, true);
      if (!append2) set(items, [], true);
    }
    set(loading, false);
    set(loadingMore, false);
  }
  function loadMoreFeed() {
    if (get(loading) || get(loadingMore) || !get(nextCursor) || !feedMode()) return;
    fetchFeed(get(path), true);
  }
  function toggleFeed() {
    pushNav();
    const enable = !feedMode();
    setFeedMode(enable);
    if (enable && groupMode() === "none") setGroupMode("time");
    clearSelection();
    set(nextCursor, null);
    fetchFolder(get(path));
  }
  function toggleFavFilter() {
    setFavFilter(!favFilter());
    clearSelection();
    if (feedMode()) fetchFeed(get(path));
  }
  async function toggleFavorite(item) {
    var _a, _b;
    const next = !item.favorite;
    try {
      const resp = await $$props.fetchApi("/promptchain/browse/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: get(scope), path: item.path, on: next })
      });
      if (!resp.ok) {
        (_a = $$props.toast) == null ? void 0 : _a.call($$props, "error", "Failed to update favorite");
        return;
      }
      patchItem(item.path, { favorite: next });
      if (!next && feedMode() && favFilter()) dropItems([item.path]);
    } catch {
      (_b = $$props.toast) == null ? void 0 : _b.call($$props, "error", "Failed to update favorite (network error)");
    }
  }
  function currentSortKey() {
    return feedMode() ? { field: "modified", direction: "desc" } : { field: prefs.sortField, direction: prefs.sortDirection };
  }
  function insertItem(item) {
    const k = currentSortKey();
    set(items, insertSorted(get(items), item, k.field, k.direction), true);
  }
  function patchItem(oldPath, data) {
    const k = currentSortKey();
    set(items, patchItemInList(get(items), oldPath, data, k.field, k.direction), true);
  }
  function dropItems(paths) {
    set(items, dropItemsByPath(get(items), paths), true);
  }
  async function fetchItem(itemScope, itemPath) {
    const params = new URLSearchParams({ scope: itemScope, path: itemPath });
    const resp = await $$props.fetchApi(`/promptchain/browse/item?${params}`);
    if (!resp.ok) return null;
    return resp.json();
  }
  function switchScope(newScope) {
    if (newScope === nav.scope) {
      if (get(path).length > 0) {
        pushNav();
        clearSelection();
        fetchFolder([]);
      }
      return;
    }
    pushNav();
    nav.scope = newScope;
    set(searchQuery, "");
    clearSelection();
    fetchFolder(nav.paths[newScope] || []);
  }
  function navigateTo(name) {
    pushNav();
    clearSelection();
    fetchFolder([...get(path), name]);
  }
  function navigateToBreadcrumb(index2) {
    pushNav();
    clearSelection();
    fetchFolder(get(path).slice(0, index2 + 1));
  }
  function navigateToRoot() {
    pushNav();
    clearSelection();
    fetchFolder([]);
  }
  function handleSortChange() {
    fetchFolder(get(path));
  }
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
    set(searchQuery, q, true);
    if (feedMode()) fetchFeed(get(path), false, true);
  }
  let filteredItems = user_derived(() => {
    if (get(isFeed)) return get(items);
    let out = get(items);
    if (get(searchQuery)) out = out.filter((i) => i.name.toLowerCase().includes(get(searchQuery).toLowerCase()));
    if (get(isFavFilter)) out = out.filter((i) => i.favorite);
    return out;
  });
  let currentGroupMode = user_derived(groupMode);
  let groups = user_derived(() => buildGroups(get(filteredItems), get(currentGroupMode)));
  let displayItems = user_derived(() => get(groups).flatMap((g) => g.items));
  let allPaths = user_derived(() => get(displayItems).map((i) => i.path));
  let mediaItems = user_derived(() => get(displayItems).filter((i) => i.type === "image" || i.type === "video"));
  function handleItemClick(item, event2) {
    var _a, _b;
    setCursor(item.path);
    if (event2.ctrlKey || event2.metaKey) {
      toggleItem(item.path);
      return;
    }
    if (event2.shiftKey) {
      selectRange(item.path, get(allPaths));
      return;
    }
    selectItem(item.path);
    if (item.type === "folder") {
      navigateTo(item.name);
    } else if (item.type === "image" || item.type === "video") {
      const idx = get(mediaItems).findIndex((i) => i.path === item.path);
      (_a = $$props.onOpenViewer) == null ? void 0 : _a.call($$props, item, get(scope), get(path), get(mediaItems), idx);
    } else if (item.type === "workflow") {
      (_b = $$props.onLoadWorkflow) == null ? void 0 : _b.call($$props, item, get(scope), get(path));
    }
  }
  function handleItemDblClick(item) {
    var _a, _b;
    if (item.type === "folder") navigateTo(item.name);
    else if (item.type === "image" || item.type === "video") (_a = $$props.onOpenViewer) == null ? void 0 : _a.call($$props, item, get(scope), get(path));
    else if (item.type === "workflow") (_b = $$props.onLoadWorkflow) == null ? void 0 : _b.call($$props, item, get(scope), get(path));
  }
  function handleContextMenu(item, event2) {
    event2.preventDefault();
    if (item && !selection.items.has(item.path)) {
      selectItem(item.path);
    }
    set(ctxMenu, { x: event2.clientX, y: event2.clientY, item }, true);
  }
  async function handleItemDrop(srcPaths, srcScope, folderPath) {
    const currentDir = get(path).join("/");
    if (srcScope === get(scope) && (feedMode() ? srcPaths.every((p) => p.split("/").slice(0, -1).join("/") === folderPath) : folderPath === currentDir)) return;
    if (srcPaths.length === 1 && srcPaths[0] === folderPath) return;
    const dropScope = get(scope);
    await executePaste(
      {
        srcScope,
        dstScope: dropScope,
        dstPath: folderPath,
        paths: srcPaths,
        op: "cut"
      },
      (result) => {
        var _a;
        clearSelection();
        if (feedMode()) {
          fetchFeed(get(path));
          return;
        }
        if (srcScope === dropScope && ((_a = result.pastedSources) == null ? void 0 : _a.length)) {
          dropItems(result.pastedSources);
        }
      }
    );
  }
  function handleBgContextMenu(event2) {
    event2.preventDefault();
    clearSelection();
    set(ctxMenu, { x: event2.clientX, y: event2.clientY, item: null }, true);
  }
  async function handleCtxAction(action2) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    if (action2 === "refresh") {
      fetchFolder(get(path));
    } else if (action2 === "edit") {
      const item = (_a = get(ctxMenu)) == null ? void 0 : _a.item;
      if ((item == null ? void 0 : item.type) === "image") {
        const idx = get(mediaItems).findIndex((i) => i.path === item.path);
        (_b = $$props.onOpenViewer) == null ? void 0 : _b.call($$props, item, get(scope), get(path), get(mediaItems), idx, { autoEdit: true });
      }
    } else if (action2 === "cut") {
      handleCut();
    } else if (action2 === "copy") {
      handleCopy();
    } else if (action2 === "copy-path") {
      const item = (_c = get(ctxMenu)) == null ? void 0 : _c.item;
      if (item) {
        const root2 = scopeRoots[nav.scope] || "";
        const full = root2 ? `${root2}/${item.path}` : item.path;
        await navigator.clipboard.writeText(full);
        (_d = $$props.toast) == null ? void 0 : _d.call($$props, "info", "Path copied to clipboard");
      }
    } else if (action2 === "paste") {
      await handlePaste();
    } else if (action2 === "properties") {
      const item = (_e = get(ctxMenu)) == null ? void 0 : _e.item;
      set(
        propsItem,
        item || {
          path: get(path).join("/") || "",
          name: get(path)[get(path).length - 1] || get(scope),
          type: "folder"
        },
        true
      );
      set(propsOpen, true);
    } else if (action2 === "mkdir") {
      set(modalMode, "mkdir");
      set(modalTitle, "New Folder");
      set(modalPlaceholder, "Folder name");
      set(modalDefault, "");
      set(modalSelectEnd, -1);
      set(modalConfirmLabel, "Create");
      set(modalOpen, true);
    } else if (action2 === "rename") {
      const item = (_f = get(ctxMenu)) == null ? void 0 : _f.item;
      if (!item) return;
      const dotIdx = item.type !== "folder" && item.name.includes(".") ? item.name.lastIndexOf(".") : -1;
      set(renameItem, item, true);
      set(modalMode, "rename");
      set(modalTitle, "Rename");
      set(modalPlaceholder, "New name");
      set(modalDefault, item.name, true);
      set(modalSelectEnd, dotIdx >= 0 ? dotIdx : -1, true);
      set(modalConfirmLabel, "Rename");
      set(modalOpen, true);
    } else if (action2 === "new-workflow") {
      set(
        nwmAnchor,
        get(ctxMenu) ? { x: get(ctxMenu).x, y: get(ctxMenu).y } : { x: 100, y: 100 },
        true
      );
      set(nwmOpen, true);
    } else if (action2 === "locate") {
      const item = (_g = get(ctxMenu)) == null ? void 0 : _g.item;
      if (item) exitFeedAndLocate(item);
    } else if (action2 === "favorite") {
      const item = (_h = get(ctxMenu)) == null ? void 0 : _h.item;
      if (item) toggleFavorite(item);
    } else if (action2 === "duplicates") {
      set(dupOpen, true);
    } else if (action2 === "delete") {
      const paths = selection.items.size > 0 ? [...selection.items] : ((_i = get(ctxMenu)) == null ? void 0 : _i.item) ? [get(ctxMenu).item.path] : [];
      if (!paths.length) return;
      set(confirmPaths, paths, true);
      set(
        confirmMsg,
        paths.length === 1 ? `Delete "${paths[0].split("/").pop()}"?` : `Delete ${paths.length} items?`,
        true
      );
      set(confirmOpen, true);
    }
  }
  async function executeDelete() {
    var _a, _b, _c, _d, _e;
    set(confirmOpen, false);
    browserEl == null ? void 0 : browserEl.focus();
    const paths = get(confirmPaths);
    set(confirmPaths, [], true);
    try {
      const resp = await $$props.fetchApi("/promptchain/browse/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: get(scope), paths })
      });
      const result = await safeJson(resp);
      if ((_a = result.deleted) == null ? void 0 : _a.length) {
        dropItems(result.deleted);
        window.dispatchEvent(new CustomEvent("promptchain:file-deleted", { detail: { scope: get(scope), paths: result.deleted } }));
      }
      clearSelection();
      if ((_b = result.errors) == null ? void 0 : _b.length) (_c = $$props.toast) == null ? void 0 : _c.call($$props, "warn", `Failed to delete ${result.errors.length} item(s)`);
    } catch (e) {
      if (e instanceof HttpError) {
        const body = e.body ? (() => {
          try {
            return JSON.parse(e.body);
          } catch {
            return null;
          }
        })() : null;
        (_d = $$props.toast) == null ? void 0 : _d.call($$props, "error", (body == null ? void 0 : body.error) || `Failed to delete (${e.status})`);
      } else {
        console.error("[PromptChain] delete failed:", e);
        (_e = $$props.toast) == null ? void 0 : _e.call($$props, "error", "Failed to delete (network error)");
      }
    }
  }
  let rbActive = state(false);
  let rbStartX = state(0);
  let rbStartY = state(0);
  let rbEndX = state(0);
  let rbEndY = state(0);
  let rbLeft = user_derived(() => Math.min(get(rbStartX), get(rbEndX)));
  let rbTop = user_derived(() => Math.min(get(rbStartY), get(rbEndY)));
  let rbWidth = user_derived(() => Math.abs(get(rbEndX) - get(rbStartX)));
  let rbHeight = user_derived(() => Math.abs(get(rbEndY) - get(rbStartY)));
  let justFinishedRb = false;
  function isRbTarget(el) {
    if (el === contentEl) return true;
    const cl = el.classList;
    if (!cl) return false;
    return cl.contains("pcr-gv") || cl.contains("pcr-gg") || cl.contains("pcr-jg") || cl.contains("pcr-lv") || cl.contains("pcr-ph");
  }
  function handleRbDown(e) {
    if (e.button !== 0 || !isRbTarget(e.target)) return;
    set(rbActive, true);
    set(rbStartX, set(rbEndX, e.clientX, true), true);
    set(rbStartY, set(rbEndY, e.clientY, true), true);
    if (!e.ctrlKey && !e.metaKey) clearSelection();
  }
  function handleRbMove(e) {
    if (!get(rbActive)) return;
    if (!(e.buttons & 1)) {
      set(rbActive, false);
      return;
    }
    set(rbEndX, e.clientX, true);
    set(rbEndY, e.clientY, true);
    if (!contentEl) return;
    const left = Math.min(get(rbStartX), get(rbEndX));
    const top = Math.min(get(rbStartY), get(rbEndY));
    const right = Math.max(get(rbStartX), get(rbEndX));
    const bottom = Math.max(get(rbStartY), get(rbEndY));
    const els = contentEl.querySelectorAll("[data-item-path]");
    const selected = [];
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > left && r.left < right && r.bottom > top && r.top < bottom) {
        const p = el.getAttribute("data-item-path");
        if (p) selected.push(p);
      }
    });
    setSelection(selected);
  }
  function handleRbUp() {
    if (get(rbActive)) justFinishedRb = true;
    set(rbActive, false);
  }
  function handleCut() {
    if (selection.items.size === 0) return;
    const sel = get(items).filter((i) => selection.items.has(i.path));
    clipCut(get(scope), sel);
  }
  function handleCopy() {
    if (selection.items.size === 0) return;
    const sel = get(items).filter((i) => selection.items.has(i.path));
    clipCopy(get(scope), sel);
  }
  async function executePaste(payload, onSuccess) {
    var _a, _b, _c;
    try {
      const resp = await $$props.fetchApi("/promptchain/browse/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        (_a = $$props.toast) == null ? void 0 : _a.call($$props, "error", err.error || "Paste failed");
        return;
      }
      const result = await resp.json();
      if (result.conflicts) {
        set(conflictData, { ...result, pendingPayload: payload, onSuccess }, true);
        set(conflictOpen, true);
        return;
      }
      if ((_b = result.pasted) == null ? void 0 : _b.length) (_c = $$props.toast) == null ? void 0 : _c.call($$props, "success", `Pasted ${result.pasted.length} item(s)`);
      onSuccess == null ? void 0 : onSuccess(result);
    } catch {
    }
  }
  async function handleConflictResolution(resolution) {
    var _a;
    set(conflictOpen, false);
    browserEl == null ? void 0 : browserEl.focus();
    if (!((_a = get(conflictData)) == null ? void 0 : _a.pendingPayload)) return;
    const { onSuccess } = get(conflictData);
    await executePaste(
      {
        ...get(conflictData).pendingPayload,
        conflictResolution: resolution
      },
      onSuccess
    );
    set(conflictData, null);
  }
  async function handlePaste() {
    if (!clipboard.items.length || !clipboard.op) return;
    const pasteOp = clipboard.op;
    const pasteScope = get(scope);
    const pastePath = [...get(path)];
    const dstPathStr = pastePath.join("/");
    await executePaste(
      {
        srcScope: clipboard.scope,
        dstScope: pasteScope,
        dstPath: dstPathStr,
        paths: clipboard.items.map((i) => i.path),
        op: pasteOp
      },
      async (result) => {
        var _a, _b;
        clearSelection();
        if (!((_a = result.pasted) == null ? void 0 : _a.length)) return;
        try {
          const fetched = await Promise.all(result.pasted.map((p) => fetchItem(pasteScope, p)));
          const stillOnDest = get(scope) === pasteScope && get(path).join("/") === dstPathStr;
          if (stillOnDest) {
            for (const it of fetched) {
              if (it) insertItem(it);
            }
          }
          if (pasteOp === "cut") clipClear();
        } catch (e) {
          console.error("[PromptChain] paste followup failed:", e);
          (_b = $$props.toast) == null ? void 0 : _b.call($$props, "error", "Paste completed but refresh failed");
        }
      }
    );
  }
  let browserEl;
  let typeBuf = "";
  let typeBufAt = 0;
  function handleTypeAhead(key) {
    const now = Date.now();
    if (now - typeBufAt > 1e3) typeBuf = "";
    typeBufAt = now;
    const ch = key.toLowerCase();
    typeBuf += ch;
    const list = get(displayItems);
    if (!list.length) return;
    const names = list.map((i) => i.name.toLowerCase());
    const curIdx = cursor.path ? list.findIndex((i) => i.path === cursor.path) : -1;
    const fresh = typeBuf.length === 1;
    const begin = curIdx < 0 ? 0 : fresh ? (curIdx + 1) % list.length : curIdx;
    let matchIdx = -1;
    for (let off = 0; off < list.length; off++) {
      const i = (begin + off) % list.length;
      if (names[i].startsWith(typeBuf)) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx < 0 && typeBuf.length > 1 && [...typeBuf].every((c) => c === ch)) {
      typeBuf = ch;
      for (let off = 1; off <= list.length; off++) {
        const i = (begin + off) % list.length;
        if (names[i].startsWith(ch)) {
          matchIdx = i;
          break;
        }
      }
    }
    if (matchIdx < 0) return;
    const p = list[matchIdx].path;
    setCursor(p);
    selectItem(p);
    scrollItemIntoView(p);
  }
  function handleKeydown(event2) {
    var _a, _b;
    if (get(modalOpen) || get(conflictOpen) || get(confirmOpen) || get(propsOpen) || get(nwmOpen) || get(dupOpen)) return;
    if (!(browserEl == null ? void 0 : browserEl.contains(document.activeElement)) && !(browserEl == null ? void 0 : browserEl.contains(event2.target))) return;
    if (event2.target.tagName === "INPUT") return;
    if (event2.ctrlKey && event2.key === "a") {
      event2.preventDefault();
      selectAll(get(allPaths));
    }
    if (event2.key === "Escape") {
      if (get(ctxMenu)) {
        set(ctxMenu, null);
      } else if (selection.items.size > 0) {
        clearSelection();
      } else if (clipboard.items.length > 0) {
        clipClear();
      }
    }
    if (event2.ctrlKey && event2.key === "x") {
      event2.preventDefault();
      handleCut();
    }
    if (event2.ctrlKey && event2.key === "c") {
      event2.preventDefault();
      handleCopy();
    }
    if (event2.ctrlKey && event2.key === "v") {
      event2.preventDefault();
      handlePaste();
    }
    if (event2.key === "Delete" && selection.items.size > 0) {
      handleCtxAction("delete");
    }
    if (event2.key === "F2" && selection.items.size === 1) {
      const itemPath = [...selection.items][0];
      const item = get(items).find((i) => i.path === itemPath);
      if (item) {
        const dotIdx = item.type !== "folder" && item.name.includes(".") ? item.name.lastIndexOf(".") : -1;
        set(renameItem, item, true);
        set(modalMode, "rename");
        set(modalTitle, "Rename");
        set(modalPlaceholder, "New name");
        set(modalDefault, item.name, true);
        set(modalSelectEnd, dotIdx >= 0 ? dotIdx : -1, true);
        set(modalConfirmLabel, "Rename");
        set(modalOpen, true);
      }
    }
    if (event2.altKey && event2.key === "Enter" && selection.items.size === 1) {
      event2.preventDefault();
      const itemPath = [...selection.items][0];
      const item = get(items).find((i) => i.path === itemPath);
      if (item) {
        set(propsItem, item, true);
        set(propsOpen, true);
      }
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event2.key) && get(displayItems).length > 0) {
      event2.preventDefault();
      event2.stopPropagation();
      const paths = get(allPaths);
      let curIdx = cursor.path ? paths.indexOf(cursor.path) : -1;
      if (curIdx < 0 && selection.anchor) curIdx = paths.indexOf(selection.anchor);
      if (curIdx < 0 && selection.items.size > 0) {
        const first = [...selection.items][0];
        curIdx = paths.indexOf(first);
      }
      if (curIdx < 0) curIdx = -1;
      const isGrid = get(currentViewMode) !== "list";
      const cols = isGrid ? getGridColumns() : 1;
      let next;
      if (curIdx === -1) {
        next = 0;
      } else {
        if (event2.key === "ArrowDown") next = curIdx + cols;
        else if (event2.key === "ArrowUp") next = curIdx - cols;
        else if (event2.key === "ArrowRight") next = curIdx + 1;
        else next = curIdx - 1;
      }
      next = Math.max(0, Math.min(next, paths.length - 1));
      setCursor(paths[next]);
      if (event2.ctrlKey || event2.metaKey) ;
      else if (event2.shiftKey) {
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
    if (event2.key === " " && cursor.path) {
      event2.preventDefault();
      toggleItem(cursor.path);
    }
    if (event2.key === "Enter" && cursor.path) {
      const item = get(displayItems).find((i) => i.path === cursor.path);
      if (item) {
        if (item.type === "folder") navigateTo(item.name);
        else if (item.type === "image" || item.type === "video") {
          const idx = get(mediaItems).findIndex((i) => i.path === item.path);
          (_a = $$props.onOpenViewer) == null ? void 0 : _a.call($$props, item, get(scope), get(path), get(mediaItems), idx);
        } else if (item.type === "workflow") (_b = $$props.onLoadWorkflow) == null ? void 0 : _b.call($$props, item, get(scope), get(path));
      }
    }
    if (event2.key === "Backspace" && get(path).length > 0) {
      pushNav();
      clearSelection();
      fetchFolder(get(path).slice(0, -1));
    }
  }
  user_effect(() => {
    function onKeydownCapture(e) {
      if (get(modalOpen) || get(conflictOpen) || get(confirmOpen) || get(propsOpen) || get(nwmOpen) || get(dupOpen)) return;
      if (!(browserEl == null ? void 0 : browserEl.contains(document.activeElement)) && !(browserEl == null ? void 0 : browserEl.contains(e.target))) return;
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
    const grid = contentEl.querySelector(".pcr-gg");
    if (grid) {
      return getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    }
    const items2 = contentEl.querySelectorAll("[data-item-path]");
    if (items2.length < 2) return 1;
    const firstTop = items2[0].getBoundingClientRect().top;
    let cols = 1;
    for (let i = 1; i < items2.length; i++) {
      if (Math.abs(items2[i].getBoundingClientRect().top - firstTop) < 5) cols++;
      else break;
    }
    return cols;
  }
  function scrollItemIntoView(itemPath) {
    if (!contentEl) return;
    const el = contentEl.querySelector(`[data-item-path="${CSS.escape(itemPath)}"]`);
    el == null ? void 0 : el.scrollIntoView({ block: "nearest" });
  }
  function handleMouseNav(event2) {
    if (event2.button === 3) {
      event2.preventDefault();
      navigateBack();
    }
    if (event2.button === 4) {
      event2.preventDefault();
      navigateForward();
    }
  }
  let contentEl;
  user_effect(() => {
    if (!contentEl) return;
    function onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setThumbSize(thumbSize() + (e.deltaY > 0 ? -15 : 15));
    }
    contentEl.addEventListener("wheel", onWheel, { passive: false });
    return () => contentEl.removeEventListener("wheel", onWheel);
  });
  let sentinelEl = state(null);
  user_effect(() => {
    get(
      items
      // re-observe each page so a still-visible sentinel keeps loading
    ).length;
    if (!get(sentinelEl) || !contentEl) return;
    const io = new IntersectionObserver(
      (entries) => {
        var _a;
        if ((_a = entries[0]) == null ? void 0 : _a.isIntersecting) loadMoreFeed();
      },
      { root: contentEl, rootMargin: "200px" }
    );
    io.observe(get(sentinelEl));
    return () => io.disconnect();
  });
  let externalDropActive = state(false);
  let dragCounter = 0;
  function isExternalFileDrop(e) {
    var _a, _b;
    return ((_b = (_a = e.dataTransfer) == null ? void 0 : _a.types) == null ? void 0 : _b.includes("Files")) && !e.dataTransfer.types.includes("application/x-promptchain-move");
  }
  function handleExternalDragEnter(e) {
    if (!isExternalFileDrop(e)) return;
    e.preventDefault();
    dragCounter++;
    set(externalDropActive, true);
  }
  function handleExternalDragOver(e) {
    if (!isExternalFileDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function handleExternalDragLeave(e) {
    if (!isExternalFileDrop(e)) return;
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      set(externalDropActive, false);
    }
  }
  async function handleExternalDrop(e) {
    var _a, _b, _c;
    set(externalDropActive, false);
    dragCounter = 0;
    if (!isExternalFileDrop(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const files = await collectDroppedFiles(e.dataTransfer);
    if (!files.length) return;
    const formData = new FormData();
    formData.append("scope", get(scope));
    formData.append("path", get(path).join("/"));
    for (const f of files) formData.append("files", f, f._relativePath || f.name);
    try {
      const resp = await $$props.fetchApi("/promptchain/browse/upload", { method: "POST", body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        (_a = $$props.toast) == null ? void 0 : _a.call($$props, "error", err.error || "Upload failed");
        return;
      }
      const result = await resp.json();
      (_b = $$props.toast) == null ? void 0 : _b.call($$props, "success", `Uploaded ${result.uploaded.length} file(s)`);
      fetchFolder(get(path));
    } catch (err) {
      (_c = $$props.toast) == null ? void 0 : _c.call($$props, "error", "Upload failed");
    }
  }
  async function collectDroppedFiles(dt) {
    var _a;
    const files = [];
    if (dt.items) {
      const entries = [];
      for (const item of dt.items) {
        if (item.kind !== "file") continue;
        const entry = (_a = item.webkitGetAsEntry) == null ? void 0 : _a.call(item);
        if (entry) entries.push(entry);
        else {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (entries.length) {
        await Promise.all(entries.map((e) => readEntry(e, files, "")));
        return files;
      }
    }
    for (const f of dt.files) files.push(f);
    return files;
  }
  function readEntry(entry, files, prefix) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(
          (f) => {
            f._relativePath = prefix ? `${prefix}/${f.name}` : f.name;
            files.push(f);
            resolve();
          },
          resolve
        );
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const allEntries = [];
        const readBatch = () => {
          reader.readEntries(
            (entries) => {
              if (entries.length) {
                allEntries.push(...entries);
                readBatch();
              } else {
                const dirName = prefix ? `${prefix}/${entry.name}` : entry.name;
                Promise.all(allEntries.map((e) => readEntry(e, files, dirName))).then(resolve);
              }
            },
            resolve
          );
        };
        readBatch();
      } else {
        resolve();
      }
    });
  }
  function isInSubtree(subfolder, dir) {
    return dir === "" || subfolder === dir || subfolder.startsWith(dir + "/");
  }
  async function checkMtimeAndRefresh(currentPath) {
    if (feedMode()) {
      fetchFeed(currentPath);
      return;
    }
    const key = `${nav.scope}:${currentPath.join("/")}`;
    try {
      const params = new URLSearchParams({ scope: nav.scope, path: currentPath.join("/") });
      const resp = await $$props.fetchApi(`/promptchain/browse/mtime?${params}`);
      if (!resp.ok) {
        fetchFolder(currentPath);
        return;
      }
      const data = await resp.json();
      if (lastMtime[key] !== data.mtime) {
        lastMtime[key] = data.mtime;
        fetchFolder(currentPath);
      }
    } catch {
      fetchFolder(currentPath);
    }
  }
  async function fetchNewOutputFiles(files, currentPath) {
    const currentDir = currentPath.join("/");
    const relevant = files.filter((f) => feedMode() ? isInSubtree(f.subfolder || "", currentDir) : (f.subfolder || "") === currentDir);
    if (!relevant.length) return;
    for (const f of relevant) {
      const p = f.subfolder ? `${f.subfolder}/${f.filename}` : f.filename;
      const item = await fetchItem("output", p);
      if (!item) continue;
      item._flash = true;
      const idx = get(items).findIndex((i) => i.path === item.path);
      if (idx >= 0) patchItem(item.path, item);
      else insertItem(item);
    }
  }
  async function fetchWorkflowThumbnail(workflowId, currentPath) {
    const params = new URLSearchParams({ id: workflowId, path: currentPath.join("/") });
    const resp = await $$props.fetchApi(`/promptchain/browse/workflow-by-id?${params}`);
    if (!resp.ok) return;
    const item = await resp.json();
    const idx = get(items).findIndex((i) => i.path === item.path);
    if (idx >= 0) patchItem(item.path, item);
    else insertItem(item);
  }
  async function fetchSingleNewItem(itemScope, detail, currentPath) {
    var _a;
    const currentDir = currentPath.join("/");
    const fileDir = detail.subfolder ?? ((_a = detail.path) == null ? void 0 : _a.split("/").slice(0, -1).join("/")) ?? "";
    if (feedMode() ? !isInSubtree(fileDir, currentDir) : fileDir !== currentDir) return;
    const itemPath = detail.path ?? (detail.subfolder ? `${detail.subfolder}/${detail.name}` : detail.name);
    const item = await fetchItem(itemScope, itemPath);
    if (!item) return;
    item._flash = true;
    const idx = get(items).findIndex((i) => i.path === item.path);
    if (idx >= 0) patchItem(item.path, item);
    else insertItem(item);
  }
  onMount(() => {
    var _a;
    fetchFolder(nav.paths[nav.scope] || []);
    const unsub = (_a = $$props.onSubscribeRefresh) == null ? void 0 : _a.call($$props, (changedScope, detail) => {
      var _a2, _b;
      if (changedScope !== null && changedScope !== nav.scope) return;
      const currentPath = nav.paths[nav.scope] || [];
      if ((_a2 = detail == null ? void 0 : detail.removedPaths) == null ? void 0 : _a2.length) {
        dropItems(detail.removedPaths);
        return;
      }
      if (detail == null ? void 0 : detail.visibility) {
        checkMtimeAndRefresh(currentPath);
        return;
      }
      if (changedScope === "output" && ((_b = detail == null ? void 0 : detail.files) == null ? void 0 : _b.length) && nav.scope === "output") {
        fetchNewOutputFiles(detail.files, currentPath);
        return;
      }
      if (changedScope === "input" && (detail == null ? void 0 : detail.name) && nav.scope === "input") {
        fetchSingleNewItem("input", detail, currentPath);
        return;
      }
      if (changedScope === "workflows" && nav.scope === "workflows") {
        if (detail == null ? void 0 : detail.path) {
          fetchSingleNewItem("workflows", detail, currentPath);
          return;
        }
        if ((detail == null ? void 0 : detail.thumbnailUpdate) && (detail == null ? void 0 : detail.workflowId)) {
          if (feedMode()) {
            if (get(items).length <= FEED_PAGE_SIZE) fetchFeed(currentPath);
            return;
          }
          fetchWorkflowThumbnail(detail.workflowId, currentPath);
          return;
        }
        if (detail == null ? void 0 : detail.thumbnailUpdate) return;
        fetchFolder(currentPath);
        return;
      }
      fetchFolder(currentPath);
    });
    return () => unsub == null ? void 0 : unsub();
  });
  function toggleKebab(e) {
    e.stopPropagation();
    set(kebabOpen, !get(kebabOpen));
  }
  user_effect(() => {
    if (!get(kebabOpen)) return;
    function onClick(e) {
      if (kebabEl && !kebabEl.contains(e.target)) set(kebabOpen, false);
    }
    function onKey(e) {
      if (e.key === "Escape") set(kebabOpen, false);
    }
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  });
  function kebabNewWorkflow() {
    set(kebabOpen, false);
    const rect = kebabEl == null ? void 0 : kebabEl.getBoundingClientRect();
    set(
      nwmAnchor,
      rect ? { x: rect.right - 280, y: rect.bottom + 4 } : { x: 100, y: 100 },
      true
    );
    set(nwmOpen, true);
  }
  function kebabNewFolder() {
    set(kebabOpen, false);
    set(modalMode, "mkdir");
    set(modalTitle, "New Folder");
    set(modalPlaceholder, "Folder name");
    set(modalDefault, "");
    set(modalConfirmLabel, "Create");
    set(modalOpen, true);
  }
  async function uniqueWorkflowName(base, subfolder) {
    try {
      const params = new URLSearchParams({ scope: "workflows", path: subfolder });
      const resp = await $$props.fetchApi(`/promptchain/browse?${params}`);
      if (!resp.ok) return base;
      const data = await resp.json();
      const taken = new Set((data.items || []).filter((i) => i.type === "workflow").map((i) => i.name.replace(/\.json$/i, "").toLowerCase()));
      if (!taken.has(base)) return base;
      let n = 2;
      while (taken.has(`${base} (${n})`)) n++;
      return `${base} (${n})`;
    } catch {
      return base;
    }
  }
  async function handleCascadePick(pick) {
    set(nwmOpen, false);
    browserEl == null ? void 0 : browserEl.focus();
    const subfolder = get(scope) === "workflows" ? get(path).join("/") : "";
    const base = pick.blank ? "untitled" : pick.suggestedName;
    const workflowName = await uniqueWorkflowName(base, subfolder);
    await handleWorkflowCreated(workflowName, pick.template ?? null, pick.modelFilename ?? "");
  }
  async function handleWorkflowCreated(workflowName, template, modelFilename) {
    var _a;
    set(nwmOpen, false);
    const subfolder = get(scope) === "workflows" ? get(path).join("/") : "";
    await ((_a = $$props.onCreateWorkflow) == null ? void 0 : _a.call($$props, workflowName, template, modelFilename, subfolder));
  }
  async function handleModalConfirm(name) {
    set(modalOpen, false);
    browserEl == null ? void 0 : browserEl.focus();
    if (get(modalMode) === "rename") {
      await executeRename(name);
    } else {
      await executeMkdir(name);
    }
  }
  async function executeMkdir(name) {
    var _a;
    try {
      const resp = await $$props.fetchApi("/promptchain/browse/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: get(scope), path: get(path).join("/"), name })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        (_a = $$props.toast) == null ? void 0 : _a.call($$props, "error", err.error || "Failed to create folder");
        return;
      }
      const result = await resp.json();
      if (!feedMode()) {
        insertItem({
          path: result.path,
          name,
          type: "folder",
          size: 0,
          modified: Math.floor(Date.now() / 1e3),
          childCount: 0
        });
      }
    } catch {
    }
  }
  async function executeRename(newName) {
    var _a;
    const item = get(renameItem);
    set(renameItem, null);
    if (!item) return;
    if (newName === item.name) return;
    const finalName = newName;
    try {
      const resp = await $$props.fetchApi("/promptchain/browse/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: get(scope), path: item.path, name: finalName })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        (_a = $$props.toast) == null ? void 0 : _a.call($$props, "error", err.error || "Failed to rename");
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
    } catch {
    }
  }
  function handleModalCancel() {
    set(modalOpen, false);
    set(renameItem, null);
    browserEl == null ? void 0 : browserEl.focus();
  }
  function kebabFindDuplicates() {
    set(kebabOpen, false);
    set(dupOpen, true);
  }
  function kebabSettings() {
    var _a;
    set(kebabOpen, false);
    (_a = $$props.onOpenSettings) == null ? void 0 : _a.call($$props);
  }
  function kebabAbout() {
    set(kebabOpen, false);
    window.dispatchEvent(new CustomEvent("promptchain:show-about"));
  }
  function kebabHelp() {
    set(kebabOpen, false);
    window.open("https://github.com/mobcat40/ComfyUI-PromptChain#readme", "_blank", "noopener");
  }
  var fragment = root_1();
  event("keydown", $window, handleKeydown);
  event("mouseup", $window, (e) => {
    handleMouseNav(e);
    handleRbUp();
  });
  event("mousemove", $window, handleRbMove);
  var div = first_child(fragment);
  var div_1 = child(div);
  var a = child(div_1);
  var node = child(a);
  {
    var consequent = ($$anchor2) => {
      var img = root_2();
      template_effect(() => set_attribute(img, "src", $$props.logoUrl));
      append($$anchor2, img);
    };
    if_block(node, ($$render) => {
      if ($$props.logoUrl) $$render(consequent);
    });
  }
  var div_2 = sibling(a, 2);
  var button = child(div_2);
  var div_3 = sibling(button, 2);
  var button_1 = child(div_3);
  var node_1 = sibling(button_1, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div_4 = root_3();
      var button_2 = child(div_4);
      var button_3 = sibling(button_2, 2);
      var node_2 = sibling(button_3, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var button_4 = root_4();
          delegated("click", button_4, kebabFindDuplicates);
          append($$anchor3, button_4);
        };
        if_block(node_2, ($$render) => {
          if (get(scope) !== "workflows") $$render(consequent_1);
        });
      }
      var button_5 = sibling(node_2, 4);
      var button_6 = sibling(button_5, 4);
      var button_7 = sibling(button_6, 2);
      delegated("click", button_2, kebabNewWorkflow);
      delegated("click", button_3, kebabNewFolder);
      delegated("click", button_5, kebabSettings);
      delegated("click", button_6, kebabAbout);
      delegated("click", button_7, kebabHelp);
      append($$anchor2, div_4);
    };
    if_block(node_1, ($$render) => {
      if (get(kebabOpen)) $$render(consequent_2);
    });
  }
  bind_this(div_3, ($$value) => kebabEl = $$value, () => kebabEl);
  var node_3 = sibling(div_1, 2);
  Toolbar(node_3, {
    get scope() {
      return get(scope);
    },
    get scopes() {
      return SCOPES;
    },
    get searchQuery() {
      return get(searchQuery);
    },
    onScopeChange: switchScope,
    onSearchChange: handleSearchChange,
    onSortChange: handleSortChange,
    onFeedToggle: toggleFeed,
    onFavFilterToggle: toggleFavFilter
  });
  var div_5 = sibling(node_3, 2);
  var button_8 = child(div_5);
  let classes;
  var node_4 = sibling(button_8, 2);
  each(node_4, 17, () => get(path), index, ($$anchor2, seg, i) => {
    const segPath = user_derived(() => get(path).slice(0, i + 1).join("/"));
    var fragment_1 = root_5();
    var node_5 = first_child(fragment_1);
    {
      var consequent_3 = ($$anchor3) => {
        var span = root_6();
        append($$anchor3, span);
      };
      if_block(node_5, ($$render) => {
        if (i > 0) $$render(consequent_3);
      });
    }
    var button_9 = sibling(node_5, 2);
    let classes_1;
    var text = child(button_9);
    template_effect(() => {
      classes_1 = set_class(button_9, 1, "pcr-bc-seg svelte-wtd4vk", null, classes_1, { "pcr-bc-drop": get(bcDropTarget) === get(segPath) });
      set_text(text, get(seg));
    });
    delegated("click", button_9, () => navigateToBreadcrumb(i));
    event("dragover", button_9, (e) => {
      if (!e.dataTransfer.types.includes("application/x-promptchain-move")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      set(bcDropTarget, get(segPath), true);
    });
    event("dragleave", button_9, () => {
      if (get(bcDropTarget) === get(segPath)) set(bcDropTarget, null);
    });
    event("drop", button_9, (e) => {
      set(bcDropTarget, null);
      const raw = e.dataTransfer.getData("application/x-promptchain-move");
      if (!raw) return;
      e.preventDefault();
      try {
        const d = JSON.parse(raw);
        if (Array.isArray(d.paths)) handleItemDrop(d.paths, d.scope, get(segPath));
      } catch (err) {
        console.warn("[PromptChain] invalid drop payload:", err);
      }
    });
    append($$anchor2, fragment_1);
  });
  var node_6 = sibling(node_4, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var button_10 = root_7();
      delegated("click", button_10, toggleFeed);
      append($$anchor2, button_10);
    };
    if_block(node_6, ($$render) => {
      if (get(isFeed)) $$render(consequent_4);
    });
  }
  var node_7 = sibling(node_6, 2);
  {
    var consequent_5 = ($$anchor2) => {
      var span_1 = root_8();
      let classes_2;
      var text_1 = child(span_1);
      var button_11 = sibling(text_1);
      template_effect(() => {
        classes_2 = set_class(span_1, 1, "pcr-bc-info svelte-wtd4vk", null, classes_2, {
          "pcr-bc-cut": clipboard.op === "cut",
          "pcr-bc-copy": clipboard.op === "copy"
        });
        set_text(text_1, `${clipboard.op === "cut" ? "Cut" : "Copied"} ${clipboard.items.length ?? ""} item${clipboard.items.length === 1 ? "" : "s"} `);
      });
      delegated("click", button_11, function(...$$args) {
        clipClear == null ? void 0 : clipClear.apply(this, $$args);
      });
      append($$anchor2, span_1);
    };
    var consequent_6 = ($$anchor2) => {
      var span_2 = root_9();
      var text_2 = child(span_2);
      template_effect(() => set_text(text_2, `${selection.items.size ?? ""} selected`));
      append($$anchor2, span_2);
    };
    var alternate = ($$anchor2) => {
      var span_3 = root_10();
      var text_3 = child(span_3);
      template_effect(() => set_text(text_3, get(isFeed) && get(feedTotal) > get(displayItems).length ? `${get(displayItems).length} of ${get(feedTotal)}` : get(displayItems).length));
      append($$anchor2, span_3);
    };
    if_block(node_7, ($$render) => {
      if (clipboard.items.length > 0) $$render(consequent_5);
      else if (selection.items.size > 0) $$render(consequent_6, 1);
      else $$render(alternate, -1);
    });
  }
  var div_6 = sibling(div_5, 2);
  var node_8 = child(div_6);
  {
    var consequent_7 = ($$anchor2) => {
      var div_7 = root_11();
      append($$anchor2, div_7);
    };
    var consequent_8 = ($$anchor2) => {
      var div_8 = root_12();
      var text_4 = child(div_8);
      template_effect(() => set_text(text_4, get(error)));
      append($$anchor2, div_8);
    };
    var consequent_10 = ($$anchor2) => {
      var fragment_2 = comment();
      var node_9 = first_child(fragment_2);
      {
        var consequent_9 = ($$anchor3) => {
          var div_9 = root_14();
          var button_12 = sibling(child(div_9), 6);
          delegated("click", button_12, (e) => {
            const r = e.currentTarget.getBoundingClientRect();
            set(nwmAnchor, { x: r.left, y: r.bottom + 6 }, true);
            set(nwmOpen, true);
          });
          append($$anchor3, div_9);
        };
        var alternate_1 = ($$anchor3) => {
          var div_10 = root_15();
          var text_5 = child(div_10);
          template_effect(() => set_text(text_5, get(searchQuery) ? "No matches" : get(isFeed) ? "No files" : "Empty folder"));
          append($$anchor3, div_10);
        };
        if_block(node_9, ($$render) => {
          if (get(scope) === "workflows" && !get(searchQuery) && !get(isFeed) && !get(isFavFilter) && get(path).length === 0) $$render(consequent_9);
          else $$render(alternate_1, -1);
        });
      }
      append($$anchor2, fragment_2);
    };
    var alternate_3 = ($$anchor2) => {
      var fragment_3 = root_16();
      var node_10 = first_child(fragment_3);
      each(node_10, 17, () => get(groups), index, ($$anchor3, group) => {
        var fragment_4 = root_17();
        var node_11 = first_child(fragment_4);
        {
          var consequent_11 = ($$anchor4) => {
            var div_11 = root_18();
            var text_6 = child(div_11);
            var span_4 = sibling(text_6);
            var text_7 = child(span_4);
            template_effect(() => {
              set_text(text_6, get(group).label);
              set_text(text_7, get(group).items.length);
            });
            append($$anchor4, div_11);
          };
          if_block(node_11, ($$render) => {
            if (get(group).label) $$render(consequent_11);
          });
        }
        var node_12 = sibling(node_11, 2);
        {
          var consequent_12 = ($$anchor4) => {
            {
              let $0 = user_derived(() => get(path).join("/"));
              ListView($$anchor4, {
                get items() {
                  return get(group).items;
                },
                get scope() {
                  return get(scope);
                },
                get feed() {
                  return get(isFeed);
                },
                get currentDir() {
                  return get($0);
                },
                onlocate: exitFeedAndLocate,
                onfav: toggleFavorite,
                onitemclick: handleItemClick,
                onitemdblclick: handleItemDblClick,
                onitemcontextmenu: handleContextMenu,
                onitemdrop: handleItemDrop
              });
            }
          };
          var alternate_2 = ($$anchor4) => {
            {
              let $0 = user_derived(() => get(path).join("/"));
              GridView($$anchor4, {
                get items() {
                  return get(group).items;
                },
                get scope() {
                  return get(scope);
                },
                get feed() {
                  return get(isFeed);
                },
                get currentDir() {
                  return get($0);
                },
                onlocate: exitFeedAndLocate,
                onfav: toggleFavorite,
                onitemclick: handleItemClick,
                onitemdblclick: handleItemDblClick,
                onitemcontextmenu: handleContextMenu,
                onitemdrop: handleItemDrop
              });
            }
          };
          if_block(node_12, ($$render) => {
            if (get(currentViewMode) === "list") $$render(consequent_12);
            else $$render(alternate_2, -1);
          });
        }
        append($$anchor3, fragment_4);
      });
      var node_13 = sibling(node_10, 2);
      {
        var consequent_13 = ($$anchor3) => {
          var div_12 = root_21();
          var text_8 = child(div_12);
          bind_this(div_12, ($$value) => set(sentinelEl, $$value), () => get(sentinelEl));
          template_effect(() => set_text(text_8, get(loadingMore) ? "Loading more..." : ""));
          append($$anchor3, div_12);
        };
        if_block(node_13, ($$render) => {
          if (get(isFeed) && get(nextCursor)) $$render(consequent_13);
        });
      }
      append($$anchor2, fragment_3);
    };
    if_block(node_8, ($$render) => {
      if (get(loading)) $$render(consequent_7);
      else if (get(error)) $$render(consequent_8, 1);
      else if (get(displayItems).length === 0) $$render(consequent_10, 2);
      else $$render(alternate_3, -1);
    });
  }
  var node_14 = sibling(node_8, 2);
  {
    var consequent_14 = ($$anchor2) => {
      var div_13 = root_22();
      append($$anchor2, div_13);
    };
    if_block(node_14, ($$render) => {
      if (get(externalDropActive)) $$render(consequent_14);
    });
  }
  bind_this(div_6, ($$value) => contentEl = $$value, () => contentEl);
  var node_15 = sibling(div_6, 2);
  {
    var consequent_15 = ($$anchor2) => {
      var div_14 = root_23();
      template_effect(() => set_style(div_14, `left:${get(rbLeft) ?? ""}px;top:${get(rbTop) ?? ""}px;width:${get(rbWidth) ?? ""}px;height:${get(rbHeight) ?? ""}px;`));
      append($$anchor2, div_14);
    };
    if_block(node_15, ($$render) => {
      if (get(rbActive) && get(rbWidth) + get(rbHeight) > 5) $$render(consequent_15);
    });
  }
  var node_16 = sibling(node_15, 2);
  {
    var consequent_16 = ($$anchor2) => {
      ContextMenu($$anchor2, {
        get x() {
          return get(ctxMenu).x;
        },
        get y() {
          return get(ctxMenu).y;
        },
        get scope() {
          return get(scope);
        },
        get feed() {
          return get(isFeed);
        },
        get targetItem() {
          return get(ctxMenu).item;
        },
        onAction: handleCtxAction,
        onClose: () => set(ctxMenu, null)
      });
    };
    if_block(node_16, ($$render) => {
      if (get(ctxMenu)) $$render(consequent_16);
    });
  }
  bind_this(div, ($$value) => browserEl = $$value, () => browserEl);
  var node_17 = sibling(div, 2);
  PromptModal(node_17, {
    get open() {
      return get(modalOpen);
    },
    get title() {
      return get(modalTitle);
    },
    get placeholder() {
      return get(modalPlaceholder);
    },
    get defaultValue() {
      return get(modalDefault);
    },
    get selectEnd() {
      return get(modalSelectEnd);
    },
    get confirmLabel() {
      return get(modalConfirmLabel);
    },
    onConfirm: handleModalConfirm,
    onCancel: handleModalCancel
  });
  var node_18 = sibling(node_17, 2);
  NewWorkflowMenu(node_18, {
    get open() {
      return get(nwmOpen);
    },
    get anchor() {
      return get(nwmAnchor);
    },
    get fetchApi() {
      return $$props.fetchApi;
    },
    onPick: handleCascadePick,
    onClose: () => {
      set(nwmOpen, false);
      browserEl == null ? void 0 : browserEl.focus();
    }
  });
  var node_19 = sibling(node_18, 2);
  ConfirmModal(node_19, {
    get open() {
      return get(confirmOpen);
    },
    title: "Delete",
    get message() {
      return get(confirmMsg);
    },
    confirmLabel: "Delete",
    onConfirm: executeDelete,
    onCancel: () => {
      set(confirmOpen, false);
      set(confirmPaths, [], true);
      browserEl == null ? void 0 : browserEl.focus();
    }
  });
  var node_20 = sibling(node_19, 2);
  {
    let $0 = user_derived(() => {
      var _a;
      return ((_a = get(conflictData)) == null ? void 0 : _a.conflicts) ?? [];
    });
    let $1 = user_derived(() => {
      var _a;
      return ((_a = get(conflictData)) == null ? void 0 : _a.total) ?? 0;
    });
    ConflictModal(node_20, {
      get open() {
        return get(conflictOpen);
      },
      get conflicts() {
        return get($0);
      },
      get total() {
        return get($1);
      },
      onConfirm: handleConflictResolution,
      onCancel: () => {
        set(conflictOpen, false);
        set(conflictData, null);
        browserEl == null ? void 0 : browserEl.focus();
      }
    });
  }
  var node_21 = sibling(node_20, 2);
  {
    let $0 = user_derived(() => {
      var _a;
      return (_a = get(propsItem)) == null ? void 0 : _a.path;
    });
    PropertiesModal(node_21, {
      get open() {
        return get(propsOpen);
      },
      get scope() {
        return get(scope);
      },
      get itemPath() {
        return get($0);
      },
      onClose: () => {
        set(propsOpen, false);
        set(propsItem, null);
        browserEl == null ? void 0 : browserEl.focus();
      }
    });
  }
  var node_22 = sibling(node_21, 2);
  {
    let $0 = user_derived(() => get(path).join("/"));
    DuplicatesModal(node_22, {
      get open() {
        return get(dupOpen);
      },
      get scope() {
        return get(scope);
      },
      get path() {
        return get($0);
      },
      get fetchApi() {
        return $$props.fetchApi;
      },
      get onSubscribeDedup() {
        return $$props.onSubscribeDedup;
      },
      onClose: () => {
        set(dupOpen, false);
        browserEl == null ? void 0 : browserEl.focus();
      },
      onDeleted: (paths) => dropItems(paths)
    });
  }
  template_effect(() => classes = set_class(button_8, 1, "pcr-bc-seg svelte-wtd4vk", null, classes, { "pcr-bc-drop": get(bcDropTarget) === "" }));
  delegated("click", button, () => {
    var _a;
    return (_a = $$props.onAddNode) == null ? void 0 : _a.call($$props);
  });
  delegated("click", button_1, toggleKebab);
  delegated("click", button_8, navigateToRoot);
  event("dragover", button_8, (e) => {
    if (!e.dataTransfer.types.includes("application/x-promptchain-move")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    set(bcDropTarget, "");
  });
  event("dragleave", button_8, () => {
    if (get(bcDropTarget) === "") set(bcDropTarget, null);
  });
  event("drop", button_8, (e) => {
    set(bcDropTarget, null);
    const raw = e.dataTransfer.getData("application/x-promptchain-move");
    if (!raw) return;
    e.preventDefault();
    try {
      const d = JSON.parse(raw);
      if (Array.isArray(d.paths)) handleItemDrop(d.paths, d.scope, "");
    } catch (err) {
      console.warn("[PromptChain] invalid drop payload:", err);
    }
  });
  delegated("click", div_6, (e) => {
    if (justFinishedRb) {
      justFinishedRb = false;
      return;
    }
    if (e.target === e.currentTarget) {
      clearSelection();
      browserEl == null ? void 0 : browserEl.focus();
    }
  });
  delegated("mousedown", div_6, handleRbDown);
  delegated("contextmenu", div_6, handleBgContextMenu);
  event("dragenter", div_6, handleExternalDragEnter);
  event("dragover", div_6, handleExternalDragOver);
  event("dragleave", div_6, handleExternalDragLeave);
  event("drop", div_6, handleExternalDrop);
  append($$anchor, fragment);
  pop();
}
delegate(["click", "mousedown", "contextmenu"]);
let instance = null;
function mountSidebar(target, props) {
  destroySidebar();
  instance = mount(AssetBrowser, { target, props });
  return instance;
}
function destroySidebar() {
  if (instance) {
    unmount(instance);
    instance = null;
  }
}
export {
  destroySidebar,
  mountSidebar
};
//# sourceMappingURL=promptchain-sidebar.js.map
