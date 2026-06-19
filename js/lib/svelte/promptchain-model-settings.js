import { d as delegate, p as push, a as prop, s as state, c as proxy, u as user_effect, e as set, f as sibling, o as bind_this, t as template_effect, g as get, x as set_attribute, q as set_value, j as delegated, k as append, l as pop, m as user_derived, n as child, A as from_html, w as each, z as index, i as if_block, G as set_checked, y as set_text, h as set_class, v as first_child, D as comment, I as to_array, a1 as set_selected, R as text, E as untrack, M as unmount, L as mount } from "./disclose-version-uq4tn5Y6.js";
import { s as set_style } from "./style-Boi27oOu.js";
import { F as FAMILIES, A as ARCHITECTURES } from "./model-constants-WRFJ51jF.js";
import { S as SettingsSlider } from "./SettingsSlider-CKF_XmgB.js";
import { b as bind_value } from "./input-DFQhebEz.js";
import { b as bind_select_value } from "./select-Dp4ExMMc.js";
import { a as action } from "./actions-WPfqiWYB.js";
var root$7 = from_html(`<div class="pcr-slider-container svelte-1pxowmh"><div class="pcr-slider-track svelte-1pxowmh"><div class="pcr-slider-zone pcr-slider-zone-editable svelte-1pxowmh"></div> <div class="pcr-slider-thumb pcr-thumb-blue svelte-1pxowmh"></div> <div class="pcr-slider-thumb pcr-thumb-blue svelte-1pxowmh"></div></div> <input type="number" class="pcr-slider-input pcr-slider-input-half svelte-1pxowmh"/> <span class="pcr-slider-range-sep svelte-1pxowmh">&ndash;</span> <input type="number" class="pcr-slider-input pcr-slider-input-half svelte-1pxowmh"/></div>`);
function RangeSlider($$anchor, $$props) {
  push($$props, true);
  let onChange = prop($$props, "onChange", 3, () => {
  });
  let lo = state(proxy($$props.rangeMin ?? $$props.min));
  let hi = state(proxy($$props.rangeMax ?? $$props.max));
  let activeThumb = state(null);
  let trackEl;
  user_effect(() => {
    set(lo, $$props.rangeMin ?? $$props.min, true);
    set(hi, $$props.rangeMax ?? $$props.max, true);
  });
  function toPercent(val) {
    return Math.max(0, Math.min(100, (val - $$props.min) / ($$props.max - $$props.min) * 100));
  }
  function snapToStep(val) {
    return Math.round((val - $$props.min) / $$props.step) * $$props.step + $$props.min;
  }
  function clamp(v, lo2, hi2) {
    return Math.max(lo2, Math.min(hi2, v));
  }
  function formatVal(v) {
    var _a;
    return $$props.step >= 1 ? String(v) : v.toFixed(((_a = String($$props.step).split(".")[1]) == null ? void 0 : _a.length) || 2);
  }
  let pctLo = user_derived(() => toPercent(get(lo)));
  let pctHi = user_derived(() => toPercent(get(hi)));
  function posToValue(clientX) {
    const rect = trackEl.getBoundingClientRect();
    const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
    return snapToStep($$props.min + pct * ($$props.max - $$props.min));
  }
  function update() {
    onChange()(get(lo), get(hi));
  }
  function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    trackEl.setPointerCapture(e.pointerId);
    const v = posToValue(e.clientX);
    set(activeThumb, Math.abs(v - get(lo)) <= Math.abs(v - get(hi)) ? "lo" : "hi", true);
    if (get(activeThumb) === "lo") set(lo, clamp(snapToStep(v), $$props.min, get(hi)), true);
    else set(hi, clamp(snapToStep(v), get(lo), $$props.max), true);
    update();
  }
  function onPointerMove(e) {
    if (!get(activeThumb)) return;
    const v = posToValue(e.clientX);
    if (get(activeThumb) === "lo") set(lo, clamp(snapToStep(v), $$props.min, get(hi)), true);
    else set(hi, clamp(snapToStep(v), get(lo), $$props.max), true);
    update();
  }
  function onPointerUp() {
    set(activeThumb, null);
  }
  function getRange() {
    return [get(lo), get(hi)];
  }
  var $$exports = { getRange };
  var div = root$7();
  var div_1 = child(div);
  var div_2 = child(div_1);
  let styles;
  var div_3 = sibling(div_2, 2);
  let styles_1;
  var div_4 = sibling(div_3, 2);
  let styles_2;
  bind_this(div_1, ($$value) => trackEl = $$value, () => trackEl);
  var input = sibling(div_1, 2);
  var input_1 = sibling(input, 4);
  template_effect(
    ($0, $1) => {
      styles = set_style(div_2, "", styles, {
        left: `${get(pctLo) ?? ""}%`,
        width: `${get(pctHi) - get(pctLo)}%`
      });
      styles_1 = set_style(div_3, "", styles_1, { left: `${get(pctLo) ?? ""}%` });
      styles_2 = set_style(div_4, "", styles_2, { left: `${get(pctHi) ?? ""}%` });
      set_attribute(input, "min", $$props.min);
      set_attribute(input, "max", $$props.max);
      set_attribute(input, "step", $$props.step);
      set_value(input, $0);
      set_attribute(input_1, "min", $$props.min);
      set_attribute(input_1, "max", $$props.max);
      set_attribute(input_1, "step", $$props.step);
      set_value(input_1, $1);
    },
    [() => formatVal(get(lo)), () => formatVal(get(hi))]
  );
  delegated("pointerdown", div_1, onPointerDown);
  delegated("pointermove", div_1, onPointerMove);
  delegated("pointerup", div_1, onPointerUp);
  delegated("change", input, (e) => {
    set(lo, clamp(snapToStep(parseFloat(e.target.value) || $$props.min), $$props.min, get(hi)), true);
    update();
  });
  delegated("change", input_1, (e) => {
    set(hi, clamp(snapToStep(parseFloat(e.target.value) || $$props.max), get(lo), $$props.max), true);
    update();
  });
  append($$anchor, div);
  return pop($$exports);
}
delegate(["pointerdown", "pointermove", "pointerup", "change"]);
var root_2$6 = from_html(`<span> </span>`);
var root_1$5 = from_html(`<label class="pcr-multiselect-row svelte-aohk7q"><input type="checkbox" class="svelte-aohk7q"/> <span class="pcr-multiselect-name svelte-aohk7q"> </span> <!></label>`);
var root$6 = from_html(`<div class="pcr-multiselect-container svelte-aohk7q"></div>`);
function MultiSelectCombo($$anchor, $$props) {
  push($$props, true);
  let options = prop($$props, "options", 19, () => []), initialSelected = prop($$props, "selected", 3, null), initialDefault = prop($$props, "defaultVal", 3, null), onChange = prop($$props, "onChange", 3, () => {
  });
  let sel = state(proxy(new Set(initialSelected() || options())));
  let def = state(proxy(initialDefault() || options()[0]));
  function toggle(opt, checked) {
    const next = new Set(get(sel));
    if (checked) next.add(opt);
    else next.delete(opt);
    set(sel, next, true);
    if (!get(sel).has(get(def))) set(def, [...get(sel)][0] || options()[0], true);
    onChange()(get(def), [...get(sel)]);
  }
  function setDefault(opt) {
    set(def, opt, true);
    onChange()(get(def), [...get(sel)]);
  }
  function getDefault() {
    return get(def);
  }
  function getSelected() {
    return [...get(sel)];
  }
  var $$exports = { getDefault, getSelected };
  var div = root$6();
  each(div, 21, options, index, ($$anchor2, opt) => {
    var label = root_1$5();
    var input = child(label);
    var span = sibling(input, 2);
    var text2 = child(span);
    var node = sibling(span, 2);
    {
      var consequent = ($$anchor3) => {
        var span_1 = root_2$6();
        let classes;
        var text_1 = child(span_1);
        template_effect(() => {
          classes = set_class(span_1, 1, "pcr-multiselect-default svelte-aohk7q", null, classes, { "pcr-multiselect-default-active": get(opt) === get(def) });
          set_attribute(span_1, "title", get(opt) === get(def) ? "Default" : "Set as default");
          set_text(text_1, get(opt) === get(def) ? "★" : "☆");
        });
        delegated("click", span_1, (e) => {
          e.preventDefault();
          e.stopPropagation();
          setDefault(get(opt));
        });
        append($$anchor3, span_1);
      };
      var d = user_derived(() => get(sel).has(get(opt)));
      if_block(node, ($$render) => {
        if (get(d)) $$render(consequent);
      });
    }
    template_effect(
      ($0) => {
        set_checked(input, $0);
        set_text(text2, get(opt));
      },
      [() => get(sel).has(get(opt))]
    );
    delegated("change", input, (e) => toggle(get(opt), e.target.checked));
    append($$anchor2, label);
  });
  append($$anchor, div);
  return pop($$exports);
}
delegate(["change", "click"]);
var root_1$4 = from_html(`<div class="pcr-model-panel-empty">No supported nodes detected.</div>`);
var root_3$4 = from_html(`<span class="pcr-section-expand-toggle svelte-82atyh"> </span>`);
var root_7$2 = from_html(`<option> </option>`);
var root_6$3 = from_html(`<select class="pcr-seed-control-select svelte-82atyh"></select>`);
var root_5$2 = from_html(`<div class="pcr-model-panel-row svelte-82atyh"><span class="pcr-model-panel-label svelte-82atyh">seed</span> <div class="pcr-seed-controls svelte-82atyh"><!> <input type="number" class="pcr-seed-input svelte-82atyh"/> <button class="pcr-seed-dice svelte-82atyh" title="Randomize seed">🎲</button></div></div>`);
var root_14$2 = from_html(`<div><span class="pcr-resolution-preset-item-label svelte-82atyh"> </span> <span class="pcr-resolution-preset-remove svelte-82atyh">×</span></div>`);
var root_13$3 = from_html(`<div class="pcr-resolution-preset-cat svelte-82atyh"> </div> <!>`, 1);
var root_11$2 = from_html(`<div class="pcr-resolution-preset-menu svelte-82atyh" style="display:block"><!> <div> </div></div>`);
var root_10$2 = from_html(`<div class="pcr-model-panel-row pcr-resolution-row svelte-82atyh"><span class="pcr-model-panel-label svelte-82atyh">resolution</span> <div class="pcr-resolution-controls svelte-82atyh"><div class="pcr-resolution-preset-wrap svelte-82atyh"><button> </button> <!></div> <input type="number"/> <span class="pcr-resolution-sep svelte-82atyh">×</span> <input type="number"/></div></div>`);
var root_25$1 = from_html(`<span class="pcr-model-panel-saved-hint svelte-82atyh"> </span>`);
var root_26$1 = from_html(`<option> </option>`);
var root_29 = from_html(`<option> </option>`);
var root_28 = from_html(`<span style="color:#555;margin:0 2px">/</span> <div class="pcr-model-panel-combo-wrap svelte-82atyh"><select></select></div>`, 1);
var root_24$1 = from_html(`<div class="pcr-model-panel-combo-wrap svelte-82atyh"><!> <select></select></div> <!>`, 1);
var root_18$1 = from_html(`<div><span class="pcr-model-panel-label svelte-82atyh"> </span> <!></div>`);
var root_2$5 = from_html(`<div class="pcr-model-panel-section svelte-82atyh"><div class="pcr-model-panel-section-title svelte-82atyh"> <!></div> <!> <!> <!></div>`);
var root_30 = from_html(`<div class="pcr-settings-save-error svelte-82atyh"> </div>`);
var root_31 = from_html(`<button class="pcr-model-panel-apply">Cancel</button> <button class="pcr-model-panel-save">Save Ranges</button>`, 1);
var root_36 = from_html(`<div class="pcr-footer-dropdown-item svelte-82atyh"> </div>`);
var root_35 = from_html(`<div class="pcr-footer-dropdown-item pcr-footer-dropdown-back svelte-82atyh"> </div> <!>`, 1);
var root_39 = from_html(`<div class="pcr-footer-dropdown-item svelte-82atyh"> </div>`);
var root_40 = from_html(`<div class="pcr-footer-dropdown-item svelte-82atyh"> </div>`);
var root_41 = from_html(`<div class="pcr-footer-dropdown-item svelte-82atyh"> </div>`);
var root_34 = from_html(`<div class="pcr-footer-dropdown-menu svelte-82atyh" style="display:block;position:absolute;bottom:100%;left:0;min-width:100%"><!></div>`);
var root_33 = from_html(`<div style="position:relative"><button class="pcr-model-panel-apply">Add ▾</button> <!></div>`);
var root_43 = from_html(`<div class="pcr-footer-dropdown-item svelte-82atyh">Restore Defaults</div>`);
var root_44 = from_html(`<div class="pcr-footer-dropdown-item svelte-82atyh">Reset to System Defaults</div>`);
var root_42 = from_html(`<div class="pcr-footer-dropdown-menu svelte-82atyh" style="display:block;position:absolute;bottom:100%;left:0;min-width:100%"><div class="pcr-footer-dropdown-item svelte-82atyh">Set Ranges</div> <!> <!></div>`);
var root_32 = from_html(`<!> <div style="position:relative"><button class="pcr-model-panel-apply">Edit ▾</button> <!></div> <button class="pcr-model-panel-save">Save as Default</button>`, 1);
var root$5 = from_html(`<div class="pcr-model-panel-body"><!> <!></div> <!> <div class="pcr-model-panel-footer svelte-82atyh"><!></div>`, 1);
function SettingsTab($$anchor, $$props) {
  var _a, _b, _c;
  push($$props, true);
  let detected = prop($$props, "detected", 19, () => []), savedConfig = prop($$props, "savedConfig", 3, null), rangeMode = prop($$props, "rangeMode", 3, false), expandedSections = prop($$props, "expandedSections", 23, () => ({}));
  const DISPLAY_NAMES = {
    sampler_name: "Sampler",
    stop_at_clip_layer: "Last Layer",
    upscale_by: "Upscale"
  };
  const savedNodes = ((_a = savedConfig()) == null ? void 0 : _a.nodes) || {};
  const userSaved = ((_b = savedConfig()) == null ? void 0 : _b._user_saved) || false;
  const hasSystem = ((_c = savedConfig()) == null ? void 0 : _c._has_system) || false;
  const CONTROLNET_DEFAULTS = {
    depth: {
      strength: 0.7,
      strength_range: [0.5, 0.9],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 0.8,
      end_percent_range: [0.5, 1]
    },
    canny: {
      strength: 0.9,
      strength_range: [0.7, 1],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 1,
      end_percent_range: [0.7, 1]
    },
    pose: {
      strength: 1,
      strength_range: [0.8, 1],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 0.7,
      end_percent_range: [0.5, 1]
    },
    lineart: {
      strength: 0.8,
      strength_range: [0.6, 1],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 1,
      end_percent_range: [0.7, 1]
    },
    softedge: {
      strength: 0.6,
      strength_range: [0.4, 0.9],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 0.8,
      end_percent_range: [0.5, 1]
    },
    scribble: {
      strength: 0.6,
      strength_range: [0.4, 0.8],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 0.8,
      end_percent_range: [0.5, 1]
    },
    // Flux (Union-Pro-2.0) — recommended values from the model card; kept under
    // "flux-" keys so they don't override the SDXL markers for shared modes.
    "flux-depth": {
      strength: 0.8,
      strength_range: [0.7, 0.9],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 0.8,
      end_percent_range: [0.7, 0.9]
    },
    "flux-canny": {
      strength: 0.7,
      strength_range: [0.6, 0.8],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 0.8,
      end_percent_range: [0.7, 0.9]
    },
    "flux-pose": {
      strength: 0.9,
      strength_range: [0.8, 1],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 0.65,
      end_percent_range: [0.6, 0.75]
    },
    "flux-softedge": {
      strength: 0.7,
      strength_range: [0.6, 0.8],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 0.8,
      end_percent_range: [0.7, 0.9]
    },
    "flux-gray": {
      strength: 0.9,
      strength_range: [0.8, 1],
      start_percent: 0,
      start_percent_range: [0, 0.3],
      end_percent: 0.8,
      end_percent_range: [0.7, 0.9]
    },
    // Z-Image (model-patch) exposes strength only; recommended values match the
    // inject, range stays in the model's 0.65–1.0 band.
    "zimage-depth": { strength: 0.8, strength_range: [0.65, 1] },
    "zimage-canny": { strength: 0.7, strength_range: [0.65, 1] },
    "zimage-pose": { strength: 0.9, strength_range: [0.7, 1] },
    "zimage-softedge": { strength: 0.9, strength_range: [0.65, 1] },
    "zimage-scribble": { strength: 0.9, strength_range: [0.65, 1] },
    "zimage-gray": { strength: 0.9, strength_range: [0.7, 1] }
  };
  function savedWidgetsFor(type) {
    if (savedNodes[type]) return savedNodes[type];
    if (type.startsWith("ControlNet:")) return CONTROLNET_DEFAULTS[type.slice(11)] || {};
    return {};
  }
  let editors = state(proxy(
    {}
    // { [nodeType]: { [widgetName]: value } }
  ));
  let rangeValues = proxy({});
  function valuesMatch(a, b, step) {
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < (step || 1e-3) * 0.5;
    return a === b;
  }
  let hasDeviation = user_derived(() => {
    var _a2, _b2, _c2;
    if (rangeMode()) return true;
    for (const [nodeType, widgetVals] of Object.entries(get(editors))) {
      const saved = savedNodes[nodeType] || {};
      for (const [name, val] of Object.entries(widgetVals)) {
        if (name.startsWith("_")) continue;
        const sv = saved[name];
        if (sv === void 0) continue;
        const widgetDefs = ((_b2 = (_a2 = detected().find((d) => d.type === nodeType)) == null ? void 0 : _a2.config) == null ? void 0 : _b2.widgets) || {};
        if (!valuesMatch(val, sv, (_c2 = widgetDefs[name]) == null ? void 0 : _c2.step)) return true;
      }
    }
    return false;
  });
  let saveDisabled = user_derived(() => !rangeMode() && !get(hasDeviation) && !!savedConfig());
  function initEditors() {
    var _a2;
    const ed = {};
    for (const { node, config, type } of detected()) {
      ed[type] = {};
      for (const [widgetName, def] of Object.entries(config.widgets)) {
        if (def.type === "resolution") {
          const w = $$props.readWidgetValue(node, "width");
          const h = $$props.readWidgetValue(node, "height");
          if (w !== void 0) ed[type]["width"] = w;
          if (h !== void 0) ed[type]["height"] = h;
          ed[type]["_resolutions"] = ((_a2 = savedNodes[type]) == null ? void 0 : _a2["_resolutions"]) || [];
        } else if (!def.paired) {
          const val = $$props.readWidgetValue(node, widgetName);
          if (val !== void 0) {
            ed[type][widgetName] = def.type === "slider" ? parseFloat(val) : val;
          }
          if (def.pair) {
            const pairVal = $$props.readWidgetValue(node, def.pair);
            if (pairVal !== void 0) ed[type][def.pair] = pairVal;
          }
        }
      }
    }
    set(editors, ed, true);
  }
  initEditors();
  function setEditorValue(nodeType, widgetName, val) {
    if (!get(editors)[nodeType]) get(editors)[nodeType] = {};
    get(editors)[nodeType][widgetName] = val;
  }
  function setRangeValue(nodeType, widgetName, lo, hi) {
    if (!rangeValues[nodeType]) rangeValues[nodeType] = {};
    rangeValues[nodeType][`${widgetName}_range`] = [lo, hi];
  }
  function setRangeComboValue(nodeType, widgetName, defaultVal, selected) {
    if (!rangeValues[nodeType]) rangeValues[nodeType] = {};
    rangeValues[nodeType][widgetName] = defaultVal;
    rangeValues[nodeType][`${widgetName}_options`] = selected;
  }
  let presetMenuOpen = proxy({});
  function togglePresetMenu(nodeType) {
    presetMenuOpen[nodeType] = !presetMenuOpen[nodeType];
  }
  let expandedState = proxy({ ...expandedSections() });
  function toggleSection(type) {
    expandedState[type] = !expandedState[type];
    expandedSections()[type] = expandedState[type];
  }
  let saveError = state(null);
  async function handleSave() {
    const config = { ...savedConfig() || {} };
    config.display_name = config.display_name || "";
    if (!config.nodes) config.nodes = {};
    if (rangeMode()) {
      for (const [type, vals] of Object.entries(rangeValues)) {
        if (!config.nodes[type]) config.nodes[type] = {};
        Object.assign(config.nodes[type], vals);
      }
    } else {
      for (const [type, vals] of Object.entries(get(editors))) {
        if (!config.nodes[type]) config.nodes[type] = {};
        Object.assign(config.nodes[type], vals);
      }
    }
    set(saveError, null);
    try {
      await $$props.onSave(config);
    } catch (e) {
      console.error("[PromptChain] settings save failed:", e);
      set(saveError, (e == null ? void 0 : e.message) || "Save failed", true);
    }
  }
  function handleApply() {
    for (const { node, config: nodeConfig, type } of detected()) {
      const saved = savedNodes[type] || {};
      for (const [widgetName, def] of Object.entries(nodeConfig.widgets)) {
        if (def.paired) continue;
        const savedVal = saved[widgetName];
        if (savedVal === void 0) continue;
        $$props.writeWidgetValue(node, widgetName, def.type === "slider" ? parseFloat(savedVal) : savedVal);
        if (def.pair) {
          const pairSaved = saved[def.pair];
          if (pairSaved !== void 0) $$props.writeWidgetValue(node, def.pair, pairSaved);
        }
      }
    }
    $$props.onReopen({});
  }
  let addMenuOpen = state(false);
  let addSubmenu = state(
    null
    // the group (e.g. ControlNet) drilled into
  );
  let editMenuOpen = state(false);
  let injectable = user_derived(() => $$props.injectableNodes());
  var fragment = root$5();
  var div = first_child(fragment);
  var node_1 = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1$4();
      append($$anchor2, div_1);
    };
    if_block(node_1, ($$render) => {
      if (!detected().length) $$render(consequent);
    });
  }
  var node_2 = sibling(node_1, 2);
  each(node_2, 17, detected, index, ($$anchor2, $$item) => {
    let node = () => get($$item).node;
    let config = () => get($$item).config;
    let type = () => get($$item).type;
    const savedWidgets = user_derived(() => savedWidgetsFor(type()));
    const isExpanded = user_derived(() => rangeMode() || !!expandedState[type()]);
    var div_2 = root_2$5();
    var div_3 = child(div_2);
    var text2 = child(div_3);
    var node_3 = sibling(text2);
    {
      var consequent_1 = ($$anchor3) => {
        var span = root_3$4();
        var text_1 = child(span);
        template_effect(() => set_text(text_1, get(isExpanded) ? "▾ less" : "▸ more"));
        delegated("click", span, (e) => {
          e.stopPropagation();
          toggleSection(type());
        });
        append($$anchor3, span);
      };
      if_block(node_3, ($$render) => {
        if (config().collapsible && !rangeMode()) $$render(consequent_1);
      });
    }
    var node_4 = sibling(div_3, 2);
    {
      var consequent_4 = ($$anchor3) => {
        const seedName = user_derived(() => {
          var _a2;
          return ((_a2 = node().widgets) == null ? void 0 : _a2.find((w) => w.name === "noise_seed")) ? "noise_seed" : "seed";
        });
        const seedVal = user_derived(() => $$props.readWidgetValue(node(), get(seedName)));
        const controlVal = user_derived(() => $$props.readWidgetValue(node(), "control_after_generate"));
        const seedIsRandom = user_derived(() => get(controlVal) === "randomize");
        var fragment_1 = comment();
        var node_5 = first_child(fragment_1);
        {
          var consequent_3 = ($$anchor4) => {
            var div_4 = root_5$2();
            var div_5 = sibling(child(div_4), 2);
            var node_6 = child(div_5);
            {
              var consequent_2 = ($$anchor5) => {
                var select = root_6$3();
                each(select, 21, () => $$props.readWidgetOptions(node(), "control_after_generate"), index, ($$anchor6, opt) => {
                  var option = root_7$2();
                  var text_2 = child(option);
                  var option_value = {};
                  template_effect(() => {
                    set_selected(option, get(opt) === get(controlVal));
                    set_text(text_2, get(opt));
                    if (option_value !== (option_value = get(opt))) {
                      option.value = (option.__value = get(opt)) ?? "";
                    }
                  });
                  append($$anchor6, option);
                });
                delegated("change", select, (e) => $$props.writeWidgetValue(node(), "control_after_generate", e.target.value));
                append($$anchor5, select);
              };
              if_block(node_6, ($$render) => {
                if (get(controlVal) !== void 0) $$render(consequent_2);
              });
            }
            var input = sibling(node_6, 2);
            var button = sibling(input, 2);
            template_effect(() => set_value(input, get(seedVal)));
            delegated("change", input, (e) => $$props.writeWidgetValue(node(), get(seedName), parseInt(e.target.value) || 0));
            delegated("click", button, (e) => {
              e.stopPropagation();
              const newSeed = Math.floor(Math.random() * 1125899906842624);
              $$props.writeWidgetValue(node(), get(seedName), newSeed);
              $$props.onReopen({});
            });
            append($$anchor4, div_4);
          };
          if_block(node_5, ($$render) => {
            if (get(seedVal) !== void 0 && (!get(seedIsRandom) || get(isExpanded))) $$render(consequent_3);
          });
        }
        append($$anchor3, fragment_1);
      };
      if_block(node_4, ($$render) => {
        if (!rangeMode()) $$render(consequent_4);
      });
    }
    var node_7 = sibling(node_4, 2);
    {
      var consequent_9 = ($$anchor3) => {
        const hasResolution = user_derived(() => Object.values(config().widgets).some((d) => d.type === "resolution"));
        var fragment_2 = comment();
        var node_8 = first_child(fragment_2);
        {
          var consequent_8 = ($$anchor4) => {
            const w = user_derived(() => $$props.readWidgetValue(node(), "width"));
            const h = user_derived(() => $$props.readWidgetValue(node(), "height"));
            var fragment_3 = comment();
            var node_9 = first_child(fragment_3);
            {
              var consequent_7 = ($$anchor5) => {
                const presets = user_derived(() => get(savedWidgets)["_resolutions"] || []);
                var div_6 = root_10$2();
                var div_7 = sibling(child(div_6), 2);
                var div_8 = child(div_7);
                var button_1 = child(div_8);
                let classes;
                var text_3 = child(button_1);
                var node_10 = sibling(button_1, 2);
                {
                  var consequent_6 = ($$anchor6) => {
                    var div_9 = root_11$2();
                    var node_11 = child(div_9);
                    each(node_11, 16, () => ["portrait", "landscape", "square"], index, ($$anchor7, cat) => {
                      const items = user_derived(() => get(presets).filter((p) => cat === "square" ? p.width === p.height : cat === "portrait" ? p.width < p.height : p.width > p.height));
                      var fragment_4 = comment();
                      var node_12 = first_child(fragment_4);
                      {
                        var consequent_5 = ($$anchor8) => {
                          var fragment_5 = root_13$3();
                          var div_10 = first_child(fragment_5);
                          var text_4 = child(div_10);
                          var node_13 = sibling(div_10, 2);
                          each(node_13, 17, () => get(items), index, ($$anchor9, p) => {
                            var div_11 = root_14$2();
                            let classes_1;
                            var span_1 = child(div_11);
                            var text_5 = child(span_1);
                            var span_2 = sibling(span_1, 2);
                            template_effect(() => {
                              classes_1 = set_class(div_11, 1, "pcr-resolution-preset-item svelte-82atyh", null, classes_1, {
                                "pcr-resolution-preset-selected": get(p).width === get(w) && get(p).height === get(h)
                              });
                              set_text(text_5, `${get(p).width ?? ""}×${get(p).height ?? ""}`);
                            });
                            delegated("click", div_11, () => {
                              $$props.writeWidgetValue(node(), "width", get(p).width);
                              $$props.writeWidgetValue(node(), "height", get(p).height);
                              setEditorValue(type(), "width", get(p).width);
                              setEditorValue(type(), "height", get(p).height);
                              presetMenuOpen[type()] = false;
                            });
                            delegated("click", span_2, (e) => {
                              e.stopPropagation();
                              get(editors)[type()]["_resolutions"] = get(presets).filter((x) => !(x.width === get(p).width && x.height === get(p).height));
                            });
                            append($$anchor9, div_11);
                          });
                          template_effect(() => set_text(text_4, cat));
                          append($$anchor8, fragment_5);
                        };
                        if_block(node_12, ($$render) => {
                          if (get(items).length) $$render(consequent_5);
                        });
                      }
                      append($$anchor7, fragment_4);
                    });
                    var div_12 = sibling(node_11, 2);
                    let classes_2;
                    var text_6 = child(div_12);
                    template_effect(
                      ($0, $1) => {
                        classes_2 = set_class(div_12, 1, "pcr-resolution-preset-add svelte-82atyh", null, classes_2, $0);
                        set_text(text_6, $1);
                      },
                      [
                        () => ({
                          "pcr-resolution-preset-add-disabled": get(presets).some((p) => p.width === get(w) && p.height === get(h))
                        }),
                        () => get(presets).some((p) => p.width === get(w) && p.height === get(h)) ? `${get(w)}×${get(h)} already saved` : "+ Add Current"
                      ]
                    );
                    delegated("click", div_12, () => {
                      if (!get(presets).some((p) => p.width === get(w) && p.height === get(h))) {
                        get(presets).push({ width: get(w), height: get(h) });
                        get(editors)[type()]["_resolutions"] = [...get(presets)];
                      }
                      presetMenuOpen[type()] = false;
                    });
                    append($$anchor6, div_9);
                  };
                  if_block(node_10, ($$render) => {
                    if (presetMenuOpen[type()]) $$render(consequent_6);
                  });
                }
                var input_1 = sibling(div_8, 2);
                let classes_3;
                set_attribute(input_1, "step", 8);
                var input_2 = sibling(input_1, 4);
                let classes_4;
                set_attribute(input_2, "step", 8);
                template_effect(
                  ($0, $1, $2, $3) => {
                    classes = set_class(button_1, 1, "pcr-resolution-preset-btn svelte-82atyh", null, classes, $0);
                    set_text(text_3, $1);
                    classes_3 = set_class(input_1, 1, "pcr-resolution-input svelte-82atyh", null, classes_3, $2);
                    set_value(input_1, get(w));
                    classes_4 = set_class(input_2, 1, "pcr-resolution-input svelte-82atyh", null, classes_4, $3);
                    set_value(input_2, get(h));
                  },
                  [
                    () => ({
                      "pcr-resolution-preset-active": get(presets).some((p) => p.width === get(w) && p.height === get(h))
                    }),
                    () => get(presets).some((p) => p.width === get(w) && p.height === get(h)) ? `${get(w)}×${get(h)}` : "Presets",
                    () => ({
                      "pcr-resolution-input-dimmed": get(presets).some((p) => p.width === get(w) && p.height === get(h))
                    }),
                    () => ({
                      "pcr-resolution-input-dimmed": get(presets).some((p) => p.width === get(w) && p.height === get(h))
                    })
                  ]
                );
                delegated("click", button_1, (e) => {
                  e.stopPropagation();
                  togglePresetMenu(type());
                });
                delegated("change", input_1, (e) => {
                  const v = parseInt(e.target.value) || 512;
                  setEditorValue(type(), "width", v);
                  $$props.writeWidgetValue(node(), "width", v);
                });
                delegated("change", input_2, (e) => {
                  const v = parseInt(e.target.value) || 512;
                  setEditorValue(type(), "height", v);
                  $$props.writeWidgetValue(node(), "height", v);
                });
                append($$anchor5, div_6);
              };
              if_block(node_9, ($$render) => {
                if (get(w) !== void 0 && get(h) !== void 0) $$render(consequent_7);
              });
            }
            append($$anchor4, fragment_3);
          };
          if_block(node_8, ($$render) => {
            if (get(hasResolution)) $$render(consequent_8);
          });
        }
        append($$anchor3, fragment_2);
      };
      if_block(node_7, ($$render) => {
        if (!rangeMode()) $$render(consequent_9);
      });
    }
    var node_14 = sibling(node_7, 2);
    each(node_14, 17, () => Object.entries(config().widgets), index, ($$anchor3, $$item2) => {
      var $$array = user_derived(() => to_array(get($$item2), 2));
      let widgetName = () => get($$array)[0];
      let def = () => get($$array)[1];
      var fragment_6 = comment();
      var node_15 = first_child(fragment_6);
      {
        var consequent_19 = ($$anchor4) => {
          const val = user_derived(() => $$props.readWidgetValue(node(), widgetName()));
          var fragment_7 = comment();
          var node_16 = first_child(fragment_7);
          {
            var consequent_18 = ($$anchor5) => {
              const savedVal = user_derived(() => get(savedWidgets)[widgetName()]);
              const savedRange = user_derived(() => get(savedWidgets)[`${widgetName()}_range`]);
              const savedOptions = user_derived(() => get(savedWidgets)[`${widgetName()}_options`]);
              const isCollapsed = user_derived(() => def().collapsed && config().collapsible && !get(isExpanded));
              var fragment_8 = comment();
              var node_17 = first_child(fragment_8);
              {
                var consequent_17 = ($$anchor6) => {
                  var div_13 = root_18$1();
                  let classes_5;
                  var span_3 = child(div_13);
                  var text_7 = child(span_3);
                  var node_18 = sibling(span_3, 2);
                  {
                    var consequent_11 = ($$anchor7) => {
                      var fragment_9 = comment();
                      var node_19 = first_child(fragment_9);
                      {
                        var consequent_10 = ($$anchor8) => {
                          {
                            let $0 = user_derived(() => {
                              var _a2;
                              return Math.min(def().min, ((_a2 = get(savedRange)) == null ? void 0 : _a2[0]) ?? def().min, parseFloat(get(val)));
                            });
                            let $1 = user_derived(() => {
                              var _a2;
                              return Math.max(def().max, ((_a2 = get(savedRange)) == null ? void 0 : _a2[1]) ?? def().max, parseFloat(get(val)));
                            });
                            let $2 = user_derived(() => {
                              var _a2;
                              return ((_a2 = get(savedRange)) == null ? void 0 : _a2[0]) ?? def().min;
                            });
                            let $3 = user_derived(() => {
                              var _a2;
                              return ((_a2 = get(savedRange)) == null ? void 0 : _a2[1]) ?? def().max;
                            });
                            RangeSlider($$anchor8, {
                              get min() {
                                return get($0);
                              },
                              get max() {
                                return get($1);
                              },
                              get step() {
                                return def().step;
                              },
                              get rangeMin() {
                                return get($2);
                              },
                              get rangeMax() {
                                return get($3);
                              },
                              onChange: (lo, hi) => setRangeValue(type(), widgetName(), lo, hi)
                            });
                          }
                        };
                        var alternate = ($$anchor8) => {
                          const tickData = user_derived(() => def().ticks === "resolution" ? $$props.resolveResolutionTicks() : null);
                          const effectiveMin = user_derived(() => {
                            var _a2;
                            return Math.min(def().min, ((_a2 = get(savedRange)) == null ? void 0 : _a2[0]) ?? def().min, parseFloat(get(val)), get(tickData) ? get(tickData).minBound : def().min);
                          });
                          const effectiveMax = user_derived(() => {
                            var _a2;
                            return Math.max(def().max, ((_a2 = get(savedRange)) == null ? void 0 : _a2[1]) ?? def().max, parseFloat(get(val)), get(tickData) ? get(tickData).maxBound : def().max);
                          });
                          {
                            let $0 = user_derived(() => parseFloat(get(val)));
                            let $1 = user_derived(() => get(savedVal) !== void 0 ? parseFloat(get(savedVal)) : void 0);
                            let $2 = user_derived(() => {
                              var _a2;
                              return (_a2 = get(savedRange)) == null ? void 0 : _a2[0];
                            });
                            let $3 = user_derived(() => {
                              var _a2;
                              return (_a2 = get(savedRange)) == null ? void 0 : _a2[1];
                            });
                            let $4 = user_derived(() => {
                              var _a2;
                              return ((_a2 = get(tickData)) == null ? void 0 : _a2.ticks) ?? null;
                            });
                            SettingsSlider($$anchor8, {
                              get min() {
                                return get(effectiveMin);
                              },
                              get max() {
                                return get(effectiveMax);
                              },
                              get step() {
                                return def().step;
                              },
                              get value() {
                                return get($0);
                              },
                              get savedValue() {
                                return get($1);
                              },
                              get rangeMin() {
                                return get($2);
                              },
                              get rangeMax() {
                                return get($3);
                              },
                              get userSaved() {
                                return userSaved;
                              },
                              get ticks() {
                                return get($4);
                              },
                              onChange: (v) => {
                                setEditorValue(type(), widgetName(), v);
                                $$props.writeWidgetValue(node(), widgetName(), v);
                              }
                            });
                          }
                        };
                        if_block(node_19, ($$render) => {
                          if (rangeMode()) $$render(consequent_10);
                          else $$render(alternate, -1);
                        });
                      }
                      append($$anchor7, fragment_9);
                    };
                    var consequent_16 = ($$anchor7) => {
                      var fragment_12 = comment();
                      var node_20 = first_child(fragment_12);
                      {
                        var consequent_12 = ($$anchor8) => {
                          {
                            let $0 = user_derived(() => $$props.readWidgetOptions(node(), widgetName()));
                            let $1 = user_derived(() => get(savedOptions) || [get(val)]);
                            let $2 = user_derived(() => get(savedVal) || get(val));
                            MultiSelectCombo($$anchor8, {
                              get options() {
                                return get($0);
                              },
                              get selected() {
                                return get($1);
                              },
                              get defaultVal() {
                                return get($2);
                              },
                              onChange: (def2, sel) => setRangeComboValue(type(), widgetName(), def2, sel)
                            });
                          }
                        };
                        var alternate_1 = ($$anchor8) => {
                          const hasSaved = user_derived(() => get(savedVal) !== void 0);
                          const isAtDefault = user_derived(() => get(hasSaved) && get(val) === get(savedVal));
                          const inOptions = user_derived(() => get(savedOptions) && get(savedOptions).includes(get(val)));
                          var fragment_14 = root_24$1();
                          var div_14 = first_child(fragment_14);
                          var node_21 = child(div_14);
                          {
                            var consequent_13 = ($$anchor9) => {
                              var span_4 = root_25$1();
                              var text_8 = child(span_4);
                              template_effect(() => set_text(text_8, `saved: ${get(savedVal) ?? ""}`));
                              append($$anchor9, span_4);
                            };
                            if_block(node_21, ($$render) => {
                              if (userSaved && get(hasSaved) && !get(isAtDefault)) $$render(consequent_13);
                            });
                          }
                          var select_1 = sibling(node_21, 2);
                          let classes_6;
                          each(select_1, 21, () => $$props.readWidgetOptions(node(), widgetName()), index, ($$anchor9, opt) => {
                            var option_1 = root_26$1();
                            let styles;
                            var text_9 = child(option_1);
                            var option_1_value = {};
                            template_effect(
                              ($0) => {
                                set_selected(option_1, get(opt) === get(val));
                                styles = set_style(option_1, "", styles, $0);
                                set_text(text_9, get(opt));
                                if (option_1_value !== (option_1_value = get(opt))) {
                                  option_1.value = (option_1.__value = get(opt)) ?? "";
                                }
                              },
                              [
                                () => {
                                  var _a2;
                                  return {
                                    color: get(hasSaved) && get(opt) === get(savedVal) ? "#5ed357" : ((_a2 = get(savedOptions)) == null ? void 0 : _a2.includes(get(opt))) ? "#5dcaff" : "#999"
                                  };
                                }
                              ]
                            );
                            append($$anchor9, option_1);
                          });
                          var node_22 = sibling(div_14, 2);
                          {
                            var consequent_15 = ($$anchor9) => {
                              const pairName = user_derived(() => def().pair);
                              const pairDef = user_derived(() => config().widgets[get(pairName)]);
                              const pairVal = user_derived(() => $$props.readWidgetValue(node(), get(pairName)));
                              var fragment_15 = comment();
                              var node_23 = first_child(fragment_15);
                              {
                                var consequent_14 = ($$anchor10) => {
                                  const pairSavedVal = user_derived(() => get(savedWidgets)[get(pairName)]);
                                  const pairSavedOpts = user_derived(() => get(savedWidgets)[`${get(pairName)}_options`]);
                                  const pairHasSaved = user_derived(() => get(pairSavedVal) !== void 0);
                                  var fragment_16 = root_28();
                                  var div_15 = sibling(first_child(fragment_16), 2);
                                  var select_2 = child(div_15);
                                  let classes_7;
                                  each(select_2, 21, () => $$props.readWidgetOptions(node(), get(pairName)), index, ($$anchor11, opt) => {
                                    var option_2 = root_29();
                                    let styles_1;
                                    var text_10 = child(option_2);
                                    var option_2_value = {};
                                    template_effect(
                                      ($0) => {
                                        set_selected(option_2, get(opt) === get(pairVal));
                                        styles_1 = set_style(option_2, "", styles_1, $0);
                                        set_text(text_10, get(opt));
                                        if (option_2_value !== (option_2_value = get(opt))) {
                                          option_2.value = (option_2.__value = get(opt)) ?? "";
                                        }
                                      },
                                      [
                                        () => {
                                          var _a2;
                                          return {
                                            color: get(pairHasSaved) && get(opt) === get(pairSavedVal) ? "#5ed357" : ((_a2 = get(pairSavedOpts)) == null ? void 0 : _a2.includes(get(opt))) ? "#5dcaff" : "#999"
                                          };
                                        }
                                      ]
                                    );
                                    append($$anchor11, option_2);
                                  });
                                  template_effect(($0) => classes_7 = set_class(select_2, 1, "pcr-model-panel-select svelte-82atyh", null, classes_7, $0), [
                                    () => {
                                      var _a2;
                                      return {
                                        "pcr-combo-at-default": get(pairHasSaved) && get(pairVal) === get(pairSavedVal),
                                        "pcr-combo-at-saved": (_a2 = get(pairSavedOpts)) == null ? void 0 : _a2.includes(get(pairVal))
                                      };
                                    }
                                  ]);
                                  delegated("change", select_2, (e) => {
                                    setEditorValue(type(), get(pairName), e.target.value);
                                    $$props.writeWidgetValue(node(), get(pairName), e.target.value);
                                  });
                                  append($$anchor10, fragment_16);
                                };
                                if_block(node_23, ($$render) => {
                                  if (get(pairDef) && get(pairVal) !== void 0) $$render(consequent_14);
                                });
                              }
                              append($$anchor9, fragment_15);
                            };
                            if_block(node_22, ($$render) => {
                              if (def().pair) $$render(consequent_15);
                            });
                          }
                          template_effect(() => classes_6 = set_class(select_1, 1, "pcr-model-panel-select svelte-82atyh", null, classes_6, {
                            "pcr-combo-at-default": get(isAtDefault),
                            "pcr-combo-at-saved": !get(isAtDefault) && get(inOptions)
                          }));
                          delegated("change", select_1, (e) => {
                            setEditorValue(type(), widgetName(), e.target.value);
                            $$props.writeWidgetValue(node(), widgetName(), e.target.value);
                          });
                          append($$anchor8, fragment_14);
                        };
                        if_block(node_20, ($$render) => {
                          if (rangeMode()) $$render(consequent_12);
                          else $$render(alternate_1, -1);
                        });
                      }
                      append($$anchor7, fragment_12);
                    };
                    if_block(node_18, ($$render) => {
                      if (def().type === "slider") $$render(consequent_11);
                      else if (def().type === "combo") $$render(consequent_16, 1);
                    });
                  }
                  template_effect(
                    ($0) => {
                      classes_5 = set_class(div_13, 1, "pcr-model-panel-row svelte-82atyh", null, classes_5, {
                        "pcr-model-panel-row-ticks": def().ticks === "resolution" && !rangeMode()
                      });
                      set_text(text_7, $0);
                    },
                    [
                      () => DISPLAY_NAMES[widgetName()] || widgetName().replace(/_/g, " ")
                    ]
                  );
                  append($$anchor6, div_13);
                };
                if_block(node_17, ($$render) => {
                  if (!get(isCollapsed)) $$render(consequent_17);
                });
              }
              append($$anchor5, fragment_8);
            };
            if_block(node_16, ($$render) => {
              if (get(val) !== void 0) $$render(consequent_18);
            });
          }
          append($$anchor4, fragment_7);
        };
        if_block(node_15, ($$render) => {
          if (def().type !== "resolution" && !def().paired) $$render(consequent_19);
        });
      }
      append($$anchor3, fragment_6);
    });
    template_effect(() => set_text(text2, `${(config().label || type()) ?? ""} `));
    append($$anchor2, div_2);
  });
  var node_24 = sibling(div, 2);
  {
    var consequent_20 = ($$anchor2) => {
      var div_16 = root_30();
      var text_11 = child(div_16);
      template_effect(() => set_text(text_11, `Save failed: ${get(saveError) ?? ""}`));
      append($$anchor2, div_16);
    };
    if_block(node_24, ($$render) => {
      if (get(saveError)) $$render(consequent_20);
    });
  }
  var div_17 = sibling(node_24, 2);
  var node_25 = child(div_17);
  {
    var consequent_21 = ($$anchor2) => {
      var fragment_17 = root_31();
      var button_2 = first_child(fragment_17);
      var button_3 = sibling(button_2, 2);
      delegated("click", button_2, (e) => {
        e.stopPropagation();
        $$props.onReopen({ rangeMode: false });
      });
      delegated("click", button_3, handleSave);
      append($$anchor2, fragment_17);
    };
    var alternate_4 = ($$anchor2) => {
      var fragment_18 = root_32();
      var node_26 = first_child(fragment_18);
      {
        var consequent_26 = ($$anchor3) => {
          var div_18 = root_33();
          var button_4 = child(div_18);
          var node_27 = sibling(button_4, 2);
          {
            var consequent_25 = ($$anchor4) => {
              var div_19 = root_34();
              var node_28 = child(div_19);
              {
                var consequent_22 = ($$anchor5) => {
                  var fragment_19 = root_35();
                  var div_20 = first_child(fragment_19);
                  var text_12 = child(div_20);
                  var node_29 = sibling(div_20, 2);
                  each(node_29, 17, () => get(addSubmenu).children, index, ($$anchor6, child$1) => {
                    var div_21 = root_36();
                    var text_13 = child(div_21);
                    template_effect(() => set_text(text_13, get(child$1).label));
                    delegated("click", div_21, (e) => {
                      e.stopPropagation();
                      set(addMenuOpen, false);
                      set(addSubmenu, null);
                      $$props.onInjectNode(get(child$1).value);
                    });
                    append($$anchor6, div_21);
                  });
                  template_effect(() => set_text(text_12, `‹ ${get(addSubmenu).label ?? ""}`));
                  delegated("click", div_20, (e) => {
                    e.stopPropagation();
                    set(addSubmenu, null);
                  });
                  append($$anchor5, fragment_19);
                };
                var alternate_3 = ($$anchor5) => {
                  var fragment_20 = comment();
                  var node_30 = first_child(fragment_20);
                  each(node_30, 17, () => get(injectable), index, ($$anchor6, item) => {
                    var fragment_21 = comment();
                    var node_31 = first_child(fragment_21);
                    {
                      var consequent_23 = ($$anchor7) => {
                        var div_22 = root_39();
                        var text_14 = child(div_22);
                        template_effect(() => set_text(text_14, get(item)));
                        delegated("click", div_22, (e) => {
                          e.stopPropagation();
                          set(addMenuOpen, false);
                          $$props.onInjectNode(get(item));
                        });
                        append($$anchor7, div_22);
                      };
                      var consequent_24 = ($$anchor7) => {
                        var div_23 = root_40();
                        var text_15 = child(div_23);
                        template_effect(() => set_text(text_15, `${get(item).label ?? ""} ▸`));
                        delegated("click", div_23, (e) => {
                          e.stopPropagation();
                          set(addSubmenu, get(item), true);
                        });
                        append($$anchor7, div_23);
                      };
                      var alternate_2 = ($$anchor7) => {
                        var div_24 = root_41();
                        var text_16 = child(div_24);
                        template_effect(() => set_text(text_16, get(item).label));
                        delegated("click", div_24, (e) => {
                          e.stopPropagation();
                          set(addMenuOpen, false);
                          $$props.onInjectNode(get(item).value);
                        });
                        append($$anchor7, div_24);
                      };
                      if_block(node_31, ($$render) => {
                        if (typeof get(item) === "string") $$render(consequent_23);
                        else if (get(item).children) $$render(consequent_24, 1);
                        else $$render(alternate_2, -1);
                      });
                    }
                    append($$anchor6, fragment_21);
                  });
                  append($$anchor5, fragment_20);
                };
                if_block(node_28, ($$render) => {
                  if (get(addSubmenu)) $$render(consequent_22);
                  else $$render(alternate_3, -1);
                });
              }
              append($$anchor4, div_19);
            };
            if_block(node_27, ($$render) => {
              if (get(addMenuOpen)) $$render(consequent_25);
            });
          }
          delegated("click", button_4, (e) => {
            e.stopPropagation();
            set(addMenuOpen, !get(addMenuOpen));
            set(addSubmenu, null);
            set(editMenuOpen, false);
          });
          append($$anchor3, div_18);
        };
        if_block(node_26, ($$render) => {
          if (get(injectable).length) $$render(consequent_26);
        });
      }
      var div_25 = sibling(node_26, 2);
      var button_5 = child(div_25);
      var node_32 = sibling(button_5, 2);
      {
        var consequent_29 = ($$anchor3) => {
          var div_26 = root_42();
          var div_27 = child(div_26);
          var node_33 = sibling(div_27, 2);
          {
            var consequent_27 = ($$anchor4) => {
              var div_28 = root_43();
              delegated("click", div_28, (e) => {
                e.stopPropagation();
                set(editMenuOpen, false);
                handleApply();
              });
              append($$anchor4, div_28);
            };
            if_block(node_33, ($$render) => {
              if (savedConfig()) $$render(consequent_27);
            });
          }
          var node_34 = sibling(node_33, 2);
          {
            var consequent_28 = ($$anchor4) => {
              var div_29 = root_44();
              delegated("click", div_29, async (e) => {
                var _a2;
                e.stopPropagation();
                set(editMenuOpen, false);
                await fetch(`/promptchain/models/settings/${((_a2 = savedConfig()) == null ? void 0 : _a2._hash) || ""}`, { method: "DELETE" });
                $$props.onReopen({});
              });
              append($$anchor4, div_29);
            };
            if_block(node_34, ($$render) => {
              if (userSaved && hasSystem) $$render(consequent_28);
            });
          }
          delegated("click", div_27, (e) => {
            e.stopPropagation();
            set(editMenuOpen, false);
            $$props.onReopen({ rangeMode: true });
          });
          append($$anchor3, div_26);
        };
        if_block(node_32, ($$render) => {
          if (get(editMenuOpen)) $$render(consequent_29);
        });
      }
      var button_6 = sibling(div_25, 2);
      template_effect(() => button_6.disabled = get(saveDisabled));
      delegated("click", button_5, (e) => {
        e.stopPropagation();
        set(editMenuOpen, !get(editMenuOpen));
        set(addMenuOpen, false);
      });
      delegated("click", button_6, handleSave);
      append($$anchor2, fragment_18);
    };
    if_block(node_25, ($$render) => {
      if (rangeMode()) $$render(consequent_21);
      else $$render(alternate_4, -1);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate(["click", "change"]);
var root_1$3 = from_html(`<div class="pcr-model-panel-empty">Loading...</div>`);
var root_2$4 = from_html(`<div class="pcr-model-panel-empty">No templates saved yet</div>`);
var root_5$1 = from_html(`<span class="pcr-tpl-drag-handle svelte-1o5g4cr">≡</span>`);
var root_6$2 = from_html(`<button class="pcr-tpl-apply-btn svelte-1o5g4cr">Restore</button>`);
var root_8$2 = from_html(`<button class="pcr-tpl-reset-btn svelte-1o5g4cr">Reset</button>`);
var root_9$2 = from_html(`<button class="pcr-tpl-delete-btn svelte-1o5g4cr">×</button>`);
var root_10$1 = from_html(`<button class="pcr-tpl-hide-btn svelte-1o5g4cr">×</button>`);
var root_7$1 = from_html(`<!> <!>`, 1);
var root_11$1 = from_html(`<button class="pcr-tpl-apply-btn svelte-1o5g4cr">Apply</button>`);
var root_4$3 = from_html(`<div><!> <div class="pcr-tpl-item-info svelte-1o5g4cr"><span class="pcr-tpl-item-name svelte-1o5g4cr"> </span> <span class="pcr-tpl-item-meta svelte-1o5g4cr"> <span class="pcr-tpl-source-badge svelte-1o5g4cr"> </span></span></div> <div class="pcr-tpl-item-actions svelte-1o5g4cr"><!></div></div>`);
var root_14$1 = from_html(`<span class="pcr-tpl-group-grip svelte-1o5g4cr">⠿</span>`);
var root_15$1 = from_html(`<span class="pcr-tpl-group-dissolve svelte-1o5g4cr">×</span>`);
var root_17 = from_html(`<span class="pcr-tpl-drag-handle svelte-1o5g4cr">≡</span>`);
var root_18 = from_html(`<button class="pcr-tpl-apply-btn svelte-1o5g4cr">Restore</button>`);
var root_20 = from_html(`<button class="pcr-tpl-reset-btn svelte-1o5g4cr">Reset</button>`);
var root_21 = from_html(`<button class="pcr-tpl-delete-btn svelte-1o5g4cr">×</button>`);
var root_22 = from_html(`<button class="pcr-tpl-hide-btn svelte-1o5g4cr">×</button>`);
var root_19 = from_html(`<!> <!>`, 1);
var root_23 = from_html(`<button class="pcr-tpl-apply-btn svelte-1o5g4cr">Apply</button>`);
var root_16$1 = from_html(`<div><!> <div class="pcr-tpl-item-info svelte-1o5g4cr"><span class="pcr-tpl-item-name svelte-1o5g4cr"> </span> <span class="pcr-tpl-item-meta svelte-1o5g4cr"> <span class="pcr-tpl-source-badge svelte-1o5g4cr"> </span></span></div> <div class="pcr-tpl-item-actions svelte-1o5g4cr"><!></div></div>`);
var root_13$2 = from_html(`<div class="pcr-tpl-group-header svelte-1o5g4cr"><!> <span class="pcr-tpl-group-toggle svelte-1o5g4cr">▾</span> <span> </span> <!></div> <div class="pcr-tpl-group-body svelte-1o5g4cr"></div>`, 1);
var root_3$3 = from_html(`<div class="pcr-tpl-list svelte-1o5g4cr"><!> <!></div>`);
var root_25 = from_html(`<option> </option>`);
var root_26 = from_html(`<option> </option>`);
var root_24 = from_html(`<div class="pcr-tpl-save-section svelte-1o5g4cr"><div class="pcr-tpl-save-row svelte-1o5g4cr"><input type="text" class="pcr-tpl-save-name svelte-1o5g4cr" placeholder="Template name..."/> <select class="pcr-tpl-save-scope svelte-1o5g4cr"><option>No Group</option><!><option>+ New Group...</option></select> <select class="pcr-tpl-save-scope svelte-1o5g4cr"></select></div> <button class="pcr-model-panel-save">Save Current</button></div>`);
var root_27 = from_html(`<button class="pcr-model-panel-apply">Reset All</button>`);
var root$4 = from_html(`<div class="pcr-model-panel-body"><!> <!> <div style="border-top:1px solid #333;margin-top:8px;padding-top:8px;display:flex;gap:8px;"><button class="pcr-model-panel-apply"> </button> <!> <button class="pcr-model-panel-apply"> </button></div></div>`);
function TemplatesTab($$anchor, $$props) {
  var _a, _b, _c, _d;
  push($$props, true);
  let modelInfo = prop($$props, "modelInfo", 19, () => ({})), savedConfig = prop($$props, "savedConfig", 3, null);
  const arch = ((_a = savedConfig()) == null ? void 0 : _a.architecture) || modelInfo().architecture || "";
  const family = ((_b = savedConfig()) == null ? void 0 : _b.family) || "";
  const modelName = ((_c = savedConfig()) == null ? void 0 : _c.model_name) || modelInfo().filename || "";
  const version = ((_d = savedConfig()) == null ? void 0 : _d.version) || "";
  let templates = state(proxy([]));
  let categoryOrder = state(proxy([]));
  let loading = state(true);
  let editMode = state(false);
  let showHidden = state(false);
  let newName = state("");
  let newScope = state("architecture");
  let newGroup = state("");
  let existingCategories = state(proxy([]));
  function loadTemplates() {
    set(loading, true);
    const params = new URLSearchParams();
    if (arch) params.set("arch", arch);
    if (family) params.set("family", family);
    if (modelName) params.set("name", modelName);
    if (modelInfo().hash) params.set("hash", modelInfo().hash);
    if (get(showHidden)) params.set("include_hidden", "1");
    fetch(`/promptchain/templates/list?${params}`).then((r) => r.json()).then((data) => {
      set(templates, data.templates || [], true);
      set(categoryOrder, data.category_order || [], true);
      set(loading, false);
    }).catch(() => {
      set(templates, [], true);
      set(loading, false);
    });
    fetch(`/promptchain/templates/list?${new URLSearchParams(arch ? { arch } : {})}`).then((r) => r.json()).then(({ templates: all }) => {
      const cats = /* @__PURE__ */ new Set();
      for (const t of all) if (t.category) cats.add(t.category);
      set(existingCategories, [...cats].sort(), true);
    }).catch(() => {
    });
  }
  loadTemplates();
  let grouped = user_derived(() => {
    const groups = {};
    for (const tpl of get(templates)) {
      const cat = tpl.category || "";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tpl);
    }
    const known = get(categoryOrder).filter((c) => groups[c]);
    const unknown = Object.keys(groups).filter((c) => c && !get(categoryOrder).includes(c)).sort();
    return {
      uncategorized: groups[""] || [],
      ordered: [...known, ...unknown],
      groups
    };
  });
  let scopeOptions = user_derived(() => {
    const opts = [
      {
        value: "architecture",
        label: `Architecture (${arch || "any"})`
      }
    ];
    if (family) opts.push({ value: "family", label: `Family (${family})` });
    if (modelName) opts.push({ value: "model", label: `Model (${modelName})` });
    opts.push({
      value: "version",
      label: version ? `Version (${version})` : "This version"
    });
    return opts;
  });
  function scopeLabel(tpl) {
    var _a2, _b2, _c2, _d2;
    return ((_a2 = tpl.scope) == null ? void 0 : _a2.type) === "version" ? version || "this version" : ((_b2 = tpl.scope) == null ? void 0 : _b2.type) === "model" ? tpl.scope.model_name || "model" : ((_c2 = tpl.scope) == null ? void 0 : _c2.type) === "family" ? tpl.scope.family || "family" : ((_d2 = tpl.scope) == null ? void 0 : _d2.architecture) || "arch";
  }
  function sourceLabel(tpl) {
    return tpl._hidden ? "hidden" : tpl._source === "overlay" ? "modified" : tpl._source === "user" ? "custom" : "system";
  }
  function handleApply(tpl) {
    if (!confirm("Replace current downstream nodes with this template?")) return;
    $$props.onApplyTemplate(tpl);
  }
  function handleRestore(tpl) {
    fetch(`/promptchain/templates/${tpl.id}/reset`, { method: "POST" }).then(() => loadTemplates());
  }
  function handleReset(tpl) {
    if (!confirm(`Reset "${tpl.name}" to system defaults?`)) return;
    fetch(`/promptchain/templates/${tpl.id}/reset`, { method: "POST" }).then(() => loadTemplates());
  }
  function handleDelete(tpl) {
    if (tpl._source === "user") {
      if (!confirm(`Delete "${tpl.name}"?`)) return;
    }
    fetch(`/promptchain/templates/${tpl.id}`, { method: "DELETE" }).then(() => loadTemplates());
  }
  function handleDissolveGroup(category, items) {
    Promise.allSettled(items.map((t) => fetch(`/promptchain/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "" })
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }))).then((results) => {
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) console.error("[PromptChain] dissolve-group partial failure:", failed);
      loadTemplates();
    });
  }
  function handleResetAll() {
    if (!confirm("Reset all templates to system defaults? This removes all custom templates, hidden states, and ordering.")) return;
    fetch("/promptchain/templates/reset-all", { method: "POST" }).then(() => loadTemplates());
  }
  async function handleSaveNew() {
    if (!get(newName).trim()) return;
    let tplCategory = get(newGroup);
    if (tplCategory === "__new__") {
      tplCategory = prompt("New group name:");
      if (!(tplCategory == null ? void 0 : tplCategory.trim())) return;
      tplCategory = tplCategory.trim();
    }
    const graphData = $$props.captureWorkflowGraph();
    if (!graphData) {
      alert("No downstream nodes to capture");
      return;
    }
    const scope = { type: get(newScope), architecture: arch };
    if (get(newScope) === "family") scope.family = family;
    if (get(newScope) === "model") scope.model_name = modelName;
    if (get(newScope) === "version") scope.model_hash = modelInfo().hash;
    const template = {
      name: get(newName).trim(),
      scope,
      created_at: Math.floor(Date.now() / 1e3),
      ...tplCategory ? { category: tplCategory } : {},
      ...graphData
    };
    await fetch("/promptchain/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template)
    });
    set(newName, "");
    loadTemplates();
  }
  var div = root$4();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1$3();
      append($$anchor2, div_1);
    };
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_2$4();
      append($$anchor2, div_2);
    };
    var alternate_4 = ($$anchor2) => {
      var div_3 = root_3$3();
      var node_1 = child(div_3);
      each(node_1, 17, () => get(grouped).uncategorized, (tpl) => tpl.id, ($$anchor3, tpl) => {
        var div_4 = root_4$3();
        let classes;
        var node_2 = child(div_4);
        {
          var consequent_2 = ($$anchor4) => {
            var span = root_5$1();
            append($$anchor4, span);
          };
          if_block(node_2, ($$render) => {
            if (get(editMode)) $$render(consequent_2);
          });
        }
        var div_5 = sibling(node_2, 2);
        var span_1 = child(div_5);
        var text2 = child(span_1);
        var span_2 = sibling(span_1, 2);
        var text_1 = child(span_2);
        var span_3 = sibling(text_1);
        var text_2 = child(span_3);
        var div_6 = sibling(div_5, 2);
        var node_3 = child(div_6);
        {
          var consequent_3 = ($$anchor4) => {
            var button = root_6$2();
            delegated("click", button, () => handleRestore(get(tpl)));
            append($$anchor4, button);
          };
          var consequent_6 = ($$anchor4) => {
            var fragment = root_7$1();
            var node_4 = first_child(fragment);
            {
              var consequent_4 = ($$anchor5) => {
                var button_1 = root_8$2();
                delegated("click", button_1, () => handleReset(get(tpl)));
                append($$anchor5, button_1);
              };
              if_block(node_4, ($$render) => {
                if (get(tpl)._source === "overlay") $$render(consequent_4);
              });
            }
            var node_5 = sibling(node_4, 2);
            {
              var consequent_5 = ($$anchor5) => {
                var button_2 = root_9$2();
                delegated("click", button_2, () => handleDelete(get(tpl)));
                append($$anchor5, button_2);
              };
              var alternate = ($$anchor5) => {
                var button_3 = root_10$1();
                delegated("click", button_3, () => handleDelete(get(tpl)));
                append($$anchor5, button_3);
              };
              if_block(node_5, ($$render) => {
                if (get(tpl)._source === "user") $$render(consequent_5);
                else $$render(alternate, -1);
              });
            }
            append($$anchor4, fragment);
          };
          var alternate_1 = ($$anchor4) => {
            var button_4 = root_11$1();
            delegated("click", button_4, () => handleApply(get(tpl)));
            append($$anchor4, button_4);
          };
          if_block(node_3, ($$render) => {
            if (get(tpl)._hidden) $$render(consequent_3);
            else if (get(editMode)) $$render(consequent_6, 1);
            else $$render(alternate_1, -1);
          });
        }
        template_effect(
          ($0, $1) => {
            var _a2;
            classes = set_class(div_4, 1, "pcr-tpl-item svelte-1o5g4cr", null, classes, { "pcr-tpl-hidden": get(tpl)._hidden });
            set_attribute(div_4, "data-template-id", get(tpl).id);
            set_text(text2, get(tpl).name);
            set_text(text_1, `${$0 ?? ""} · ${(((_a2 = get(tpl).nodes) == null ? void 0 : _a2.length) || 0) ?? ""} nodes `);
            set_text(text_2, `· ${$1 ?? ""}`);
          },
          [() => scopeLabel(get(tpl)), () => sourceLabel(get(tpl))]
        );
        append($$anchor3, div_4);
      });
      var node_6 = sibling(node_1, 2);
      each(node_6, 17, () => get(grouped).ordered, index, ($$anchor3, category) => {
        const items = user_derived(() => get(grouped).groups[get(category)] || []);
        var fragment_1 = comment();
        var node_7 = first_child(fragment_1);
        {
          var consequent_14 = ($$anchor4) => {
            var fragment_2 = root_13$2();
            var div_7 = first_child(fragment_2);
            var node_8 = child(div_7);
            {
              var consequent_7 = ($$anchor5) => {
                var span_4 = root_14$1();
                append($$anchor5, span_4);
              };
              if_block(node_8, ($$render) => {
                if (get(editMode)) $$render(consequent_7);
              });
            }
            var span_5 = sibling(node_8, 4);
            var text_3 = child(span_5);
            var node_9 = sibling(span_5, 2);
            {
              var consequent_8 = ($$anchor5) => {
                var span_6 = root_15$1();
                delegated("click", span_6, (e) => {
                  e.stopPropagation();
                  handleDissolveGroup(get(category), get(items));
                });
                append($$anchor5, span_6);
              };
              if_block(node_9, ($$render) => {
                if (get(editMode)) $$render(consequent_8);
              });
            }
            var div_8 = sibling(div_7, 2);
            each(div_8, 21, () => get(items), (tpl) => tpl.id, ($$anchor5, tpl) => {
              var div_9 = root_16$1();
              let classes_1;
              var node_10 = child(div_9);
              {
                var consequent_9 = ($$anchor6) => {
                  var span_7 = root_17();
                  append($$anchor6, span_7);
                };
                if_block(node_10, ($$render) => {
                  if (get(editMode)) $$render(consequent_9);
                });
              }
              var div_10 = sibling(node_10, 2);
              var span_8 = child(div_10);
              var text_4 = child(span_8);
              var span_9 = sibling(span_8, 2);
              var text_5 = child(span_9);
              var span_10 = sibling(text_5);
              var text_6 = child(span_10);
              var div_11 = sibling(div_10, 2);
              var node_11 = child(div_11);
              {
                var consequent_10 = ($$anchor6) => {
                  var button_5 = root_18();
                  delegated("click", button_5, () => handleRestore(get(tpl)));
                  append($$anchor6, button_5);
                };
                var consequent_13 = ($$anchor6) => {
                  var fragment_3 = root_19();
                  var node_12 = first_child(fragment_3);
                  {
                    var consequent_11 = ($$anchor7) => {
                      var button_6 = root_20();
                      delegated("click", button_6, () => handleReset(get(tpl)));
                      append($$anchor7, button_6);
                    };
                    if_block(node_12, ($$render) => {
                      if (get(tpl)._source === "overlay") $$render(consequent_11);
                    });
                  }
                  var node_13 = sibling(node_12, 2);
                  {
                    var consequent_12 = ($$anchor7) => {
                      var button_7 = root_21();
                      delegated("click", button_7, () => handleDelete(get(tpl)));
                      append($$anchor7, button_7);
                    };
                    var alternate_2 = ($$anchor7) => {
                      var button_8 = root_22();
                      delegated("click", button_8, () => handleDelete(get(tpl)));
                      append($$anchor7, button_8);
                    };
                    if_block(node_13, ($$render) => {
                      if (get(tpl)._source === "user") $$render(consequent_12);
                      else $$render(alternate_2, -1);
                    });
                  }
                  append($$anchor6, fragment_3);
                };
                var alternate_3 = ($$anchor6) => {
                  var button_9 = root_23();
                  delegated("click", button_9, () => handleApply(get(tpl)));
                  append($$anchor6, button_9);
                };
                if_block(node_11, ($$render) => {
                  if (get(tpl)._hidden) $$render(consequent_10);
                  else if (get(editMode)) $$render(consequent_13, 1);
                  else $$render(alternate_3, -1);
                });
              }
              template_effect(
                ($0, $1) => {
                  var _a2;
                  classes_1 = set_class(div_9, 1, "pcr-tpl-item svelte-1o5g4cr", null, classes_1, { "pcr-tpl-hidden": get(tpl)._hidden });
                  set_attribute(div_9, "data-template-id", get(tpl).id);
                  set_text(text_4, get(tpl).name);
                  set_text(text_5, `${$0 ?? ""} · ${(((_a2 = get(tpl).nodes) == null ? void 0 : _a2.length) || 0) ?? ""} nodes `);
                  set_text(text_6, `· ${$1 ?? ""}`);
                },
                [() => scopeLabel(get(tpl)), () => sourceLabel(get(tpl))]
              );
              append($$anchor5, div_9);
            });
            template_effect(() => {
              set_attribute(div_7, "data-category", get(category));
              set_text(text_3, get(category));
              set_attribute(div_8, "data-category", get(category));
            });
            append($$anchor4, fragment_2);
          };
          if_block(node_7, ($$render) => {
            if (get(items).length) $$render(consequent_14);
          });
        }
        append($$anchor3, fragment_1);
      });
      append($$anchor2, div_3);
    };
    if_block(node, ($$render) => {
      if (get(loading)) $$render(consequent);
      else if (!get(templates).length && !get(editMode)) $$render(consequent_1, 1);
      else $$render(alternate_4, -1);
    });
  }
  var node_14 = sibling(node, 2);
  {
    var consequent_15 = ($$anchor2) => {
      var div_12 = root_24();
      var div_13 = child(div_12);
      var input = child(div_13);
      var select = sibling(input, 2);
      var option = child(select);
      option.value = option.__value = "";
      var node_15 = sibling(option);
      each(node_15, 17, () => get(existingCategories), index, ($$anchor3, cat) => {
        var option_1 = root_25();
        var text_7 = child(option_1);
        var option_1_value = {};
        template_effect(() => {
          set_text(text_7, get(cat));
          if (option_1_value !== (option_1_value = get(cat))) {
            option_1.value = (option_1.__value = get(cat)) ?? "";
          }
        });
        append($$anchor3, option_1);
      });
      var option_2 = sibling(node_15);
      option_2.value = option_2.__value = "__new__";
      var select_1 = sibling(select, 2);
      each(select_1, 21, () => get(scopeOptions), index, ($$anchor3, opt) => {
        var option_3 = root_26();
        var text_8 = child(option_3);
        var option_3_value = {};
        template_effect(() => {
          set_text(text_8, get(opt).label);
          if (option_3_value !== (option_3_value = get(opt).value)) {
            option_3.value = (option_3.__value = get(opt).value) ?? "";
          }
        });
        append($$anchor3, option_3);
      });
      var button_10 = sibling(div_13, 2);
      bind_value(input, () => get(newName), ($$value) => set(newName, $$value));
      bind_select_value(select, () => get(newGroup), ($$value) => set(newGroup, $$value));
      bind_select_value(select_1, () => get(newScope), ($$value) => set(newScope, $$value));
      delegated("click", button_10, handleSaveNew);
      append($$anchor2, div_12);
    };
    if_block(node_14, ($$render) => {
      if (get(editMode)) $$render(consequent_15);
    });
  }
  var div_14 = sibling(node_14, 2);
  var button_11 = child(div_14);
  var text_9 = child(button_11);
  var node_16 = sibling(button_11, 2);
  {
    var consequent_16 = ($$anchor2) => {
      var button_12 = root_27();
      delegated("click", button_12, handleResetAll);
      append($$anchor2, button_12);
    };
    if_block(node_16, ($$render) => {
      if (get(editMode)) $$render(consequent_16);
    });
  }
  var button_13 = sibling(node_16, 2);
  var text_10 = child(button_13);
  template_effect(() => {
    set_text(text_9, get(showHidden) ? "Hide Hidden" : "Show Hidden");
    set_text(text_10, get(editMode) ? "Done" : "Edit");
  });
  delegated("click", button_11, (e) => {
    e.stopPropagation();
    set(showHidden, !get(showHidden));
    loadTemplates();
  });
  delegated("click", button_13, (e) => {
    e.stopPropagation();
    set(editMode, !get(editMode));
    if (!get(editMode)) set(showHidden, false);
    loadTemplates();
  });
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_1$2 = from_html(`<div class="pcr-model-panel-empty">Loading...</div>`);
var root_2$3 = from_html(`<div class="pcr-model-panel-empty">No prompt presets yet</div>`);
var root_4$2 = from_html(`<div class="pcr-model-panel-section-title svelte-g1mbc7">Prompt Templates</div>`);
var root_9$1 = from_html(`<span> </span> <span class="pcr-prompt-dropdown-item-del svelte-g1mbc7">×</span>`, 1);
var root_8$1 = from_html(`<div class="pcr-prompt-dropdown-item svelte-g1mbc7"><!></div>`);
var root_7 = from_html(`<div class="pcr-prompt-dropdown-menu svelte-g1mbc7" popover="manual"></div>`);
var root_6$1 = from_html(`<div class="pcr-template-dropdown-container"><button> <span class="pcr-prompt-dropdown-arrow svelte-g1mbc7">▼</span></button> <!></div>`);
var root_13$1 = from_html(` <span class="pcr-prompt-del-badge svelte-g1mbc7">×</span>`, 1);
var root_12$1 = from_html(`<button class="pcr-prompt-btn svelte-g1mbc7"><!></button>`);
var root_3$2 = from_html(`<!> <div class="pcr-prompt-grid svelte-g1mbc7"></div>`, 1);
var root_16 = from_html(`<option> </option>`);
var root_15 = from_html(`<div class="pcr-tpl-save-section svelte-g1mbc7"><div class="pcr-tpl-save-row svelte-g1mbc7"><input type="text" class="pcr-tpl-save-name svelte-g1mbc7" placeholder="Name..."/> <input type="text" class="pcr-tpl-save-name svelte-g1mbc7" placeholder="Category..." style="max-width:120px"/></div> <div class="pcr-tpl-save-row svelte-g1mbc7"><select class="pcr-tpl-save-scope svelte-g1mbc7"></select> <select class="pcr-tpl-save-scope svelte-g1mbc7"><option>Any slot</option><option>Positive</option><option>Negative</option></select></div> <textarea class="pcr-tpl-save-name svelte-g1mbc7" style="min-height:48px;resize:vertical;font-family:monospace;"></textarea> <button class="pcr-model-panel-save">Add Prompt</button></div>`);
var root$3 = from_html(`<div class="pcr-model-panel-body"><!> <!> <div style="border-top:1px solid #333;margin-top:8px;padding-top:8px;"><button class="pcr-model-panel-apply"> </button></div></div>`);
function PromptsTab($$anchor, $$props) {
  var _a, _b, _c, _d;
  push($$props, true);
  let modelInfo = prop($$props, "modelInfo", 19, () => ({})), savedConfig = prop($$props, "savedConfig", 3, null);
  const arch = ((_a = savedConfig()) == null ? void 0 : _a.architecture) || modelInfo().architecture || "";
  const family = ((_b = savedConfig()) == null ? void 0 : _b.family) || "";
  const modelName = ((_c = savedConfig()) == null ? void 0 : _c.model_name) || modelInfo().filename || "";
  const version = ((_d = savedConfig()) == null ? void 0 : _d.version) || "";
  let prompts = state(proxy([]));
  let loading = state(true);
  let editMode = state(false);
  let newName = state("");
  let newCategory = state("");
  let newText = state("");
  let newScope = state("global");
  let newSlot = state("");
  let openDropdown = state(null);
  function loadPrompts() {
    set(loading, true);
    const params = new URLSearchParams();
    if (arch) params.set("arch", arch);
    if (family) params.set("family", family);
    if (modelName) params.set("name", modelName);
    if (modelInfo().hash) params.set("hash", modelInfo().hash);
    fetch(`/promptchain/prompts/list?${params}`).then((r) => r.json()).then(({ prompts: p }) => {
      set(prompts, p || [], true);
      set(loading, false);
    }).catch(() => {
      set(prompts, [], true);
      set(loading, false);
    });
  }
  loadPrompts();
  let grouped = user_derived(() => {
    const groups = {};
    for (const p of get(prompts)) {
      const cat = p.category || "";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    return groups;
  });
  function insertPromptText(text2) {
    const editor = $$props.getEditor();
    if (!editor) return;
    const { from, to } = editor.state.selection.main;
    const docText = editor.state.doc.toString();
    const cursorIdx = text2.indexOf("{cursor}");
    let insertText, anchor;
    if (!docText.trim()) {
      insertText = text2.replace("{cursor}", "");
      anchor = cursorIdx >= 0 ? from + cursorIdx : from + insertText.length;
    } else {
      const after = cursorIdx >= 0 ? text2.slice(cursorIdx + "{cursor}".length) : text2;
      const trimmedAfter = after.replace(/^\s+/, "");
      const negMatch = trimmedAfter.match(/\n+Negative Prompt:/i);
      let cursorWithinAfter;
      if (negMatch) {
        let idx = negMatch.index;
        while (idx > 0 && /\s/.test(trimmedAfter[idx - 1])) idx--;
        cursorWithinAfter = idx;
      } else {
        cursorWithinAfter = trimmedAfter.length;
      }
      const before = docText.slice(0, from);
      const trailNewlines = (before.match(/\n*$/) || [""])[0].length;
      const separator = before.trim() ? "\n".repeat(Math.max(0, 2 - trailNewlines)) : "";
      insertText = separator + trimmedAfter;
      anchor = from + separator.length + cursorWithinAfter;
    }
    editor.dispatch({
      changes: { from, to, insert: insertText },
      selection: { anchor }
    });
    editor.focus();
    $$props.onClose();
  }
  function handleDelete(p) {
    fetch(`/promptchain/prompts/${p.id}`, { method: "DELETE" }).then(() => loadPrompts());
  }
  async function handleAdd() {
    if (!get(newName).trim() || !get(newText).trim()) return;
    const scope = { type: get(newScope) };
    if (get(newScope) === "architecture") scope.architecture = arch;
    if (get(newScope) === "family") {
      scope.architecture = arch;
      scope.family = family;
    }
    if (get(newScope) === "model") scope.model_name = modelName;
    if (get(newScope) === "version") scope.model_hash = modelInfo().hash;
    await fetch("/promptchain/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: get(newName).trim(),
        text: get(newText).trim(),
        scope,
        category: get(newCategory).trim() || void 0,
        slot: get(newSlot) || void 0
      })
    });
    set(newName, "");
    set(newText, "");
    set(newCategory, "");
    loadPrompts();
  }
  function anchorToButton(menu, onClose) {
    var _a2;
    const btn = menu.previousElementSibling;
    if (!btn) return;
    (_a2 = menu.showPopover) == null ? void 0 : _a2.call(menu);
    const gap = 4;
    const update = () => {
      const rect = btn.getBoundingClientRect();
      const menuH = menu.offsetHeight;
      const menuW = menu.offsetWidth;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuH + gap && rect.top > spaceBelow;
      if (openUp) {
        menu.style.top = "auto";
        menu.style.bottom = window.innerHeight - rect.top + gap + "px";
      } else {
        menu.style.bottom = "auto";
        menu.style.top = rect.bottom + gap + "px";
      }
      const maxLeft = window.innerWidth - menuW - 4;
      menu.style.left = Math.max(4, Math.min(rect.left, maxLeft)) + "px";
    };
    const onDocClick = (e) => {
      var _a3, _b2;
      if (menu.contains(e.target)) return;
      if ((_b2 = (_a3 = e.target).closest) == null ? void 0 : _b2.call(_a3, ".pcr-prompt-dropdown-btn")) return;
      onClose == null ? void 0 : onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose == null ? void 0 : onClose();
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return {
      destroy() {
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKey);
      }
    };
  }
  let scopeOptions = user_derived(() => {
    const opts = [
      { value: "global", label: "Global" },
      { value: "architecture", label: `Arch (${arch || "any"})` }
    ];
    if (family) opts.push({ value: "family", label: `Family (${family})` });
    if (modelName) opts.push({ value: "model", label: `Model (${modelName})` });
    opts.push({
      value: "version",
      label: version ? `Ver (${version})` : "This version"
    });
    return opts;
  });
  var div = root$3();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1$2();
      append($$anchor2, div_1);
    };
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_2$3();
      append($$anchor2, div_2);
    };
    var alternate_3 = ($$anchor2) => {
      var fragment = root_3$2();
      var node_1 = first_child(fragment);
      {
        var consequent_2 = ($$anchor3) => {
          var div_3 = root_4$2();
          append($$anchor3, div_3);
        };
        if_block(node_1, ($$render) => {
          if (get(prompts).length) $$render(consequent_2);
        });
      }
      var div_4 = sibling(node_1, 2);
      each(div_4, 21, () => Object.entries(get(grouped)), index, ($$anchor3, $$item) => {
        var $$array = user_derived(() => to_array(get($$item), 2));
        let category = () => get($$array)[0];
        let items = () => get($$array)[1];
        var fragment_1 = comment();
        var node_2 = first_child(fragment_1);
        {
          var consequent_5 = ($$anchor4) => {
            var div_5 = root_6$1();
            var button = child(div_5);
            let classes;
            var text_1 = child(button);
            var node_3 = sibling(button, 2);
            {
              var consequent_4 = ($$anchor5) => {
                var div_6 = root_7();
                each(div_6, 21, items, index, ($$anchor6, p) => {
                  var div_7 = root_8$1();
                  var node_4 = child(div_7);
                  {
                    var consequent_3 = ($$anchor7) => {
                      var fragment_2 = root_9$1();
                      var span = first_child(fragment_2);
                      var text_2 = child(span);
                      var span_1 = sibling(span, 2);
                      template_effect(() => set_text(text_2, get(p).name));
                      delegated("click", span_1, (e) => {
                        e.stopPropagation();
                        handleDelete(get(p));
                      });
                      append($$anchor7, fragment_2);
                    };
                    var alternate = ($$anchor7) => {
                      var text_3 = text();
                      template_effect(() => set_text(text_3, get(p).name));
                      append($$anchor7, text_3);
                    };
                    if_block(node_4, ($$render) => {
                      if (get(editMode)) $$render(consequent_3);
                      else $$render(alternate, -1);
                    });
                  }
                  template_effect(() => {
                    set_attribute(div_7, "title", get(p).text || "");
                    set_style(div_7, get(editMode) ? "display:flex;justify-content:space-between;align-items:center" : "");
                  });
                  delegated("click", div_7, (e) => {
                    if (!get(editMode)) {
                      e.stopPropagation();
                      set(openDropdown, null);
                      insertPromptText(get(p).text || "");
                    }
                  });
                  append($$anchor6, div_7);
                });
                action(div_6, ($$node, $$action_arg) => anchorToButton == null ? void 0 : anchorToButton($$node, $$action_arg), () => () => {
                  set(openDropdown, null);
                });
                append($$anchor5, div_6);
              };
              if_block(node_3, ($$render) => {
                if (get(openDropdown) === category()) $$render(consequent_4);
              });
            }
            template_effect(() => {
              classes = set_class(button, 1, "pcr-prompt-btn pcr-prompt-dropdown-btn svelte-g1mbc7", null, classes, { "pcr-open": get(openDropdown) === category() });
              set_text(text_1, `${category() ?? ""} `);
            });
            delegated("click", button, (e) => {
              e.stopPropagation();
              set(openDropdown, get(openDropdown) === category() ? null : category(), true);
            });
            append($$anchor4, div_5);
          };
          var alternate_2 = ($$anchor4) => {
            var fragment_4 = comment();
            var node_5 = first_child(fragment_4);
            each(node_5, 17, items, index, ($$anchor5, p) => {
              var button_1 = root_12$1();
              var node_6 = child(button_1);
              {
                var consequent_6 = ($$anchor6) => {
                  var fragment_5 = root_13$1();
                  var text_4 = first_child(fragment_5);
                  template_effect(() => set_text(text_4, `${get(p).name ?? ""} `));
                  append($$anchor6, fragment_5);
                };
                var alternate_1 = ($$anchor6) => {
                  var text_5 = text();
                  template_effect(() => set_text(text_5, get(p).name));
                  append($$anchor6, text_5);
                };
                if_block(node_6, ($$render) => {
                  if (get(editMode)) $$render(consequent_6);
                  else $$render(alternate_1, -1);
                });
              }
              template_effect(() => set_attribute(button_1, "title", get(p).text || ""));
              delegated("click", button_1, (e) => {
                e.stopPropagation();
                if (get(editMode)) {
                  handleDelete(get(p));
                } else {
                  insertPromptText(get(p).text || "");
                }
              });
              append($$anchor5, button_1);
            });
            append($$anchor4, fragment_4);
          };
          if_block(node_2, ($$render) => {
            if (category() && items().length > 1) $$render(consequent_5);
            else $$render(alternate_2, -1);
          });
        }
        append($$anchor3, fragment_1);
      });
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(loading)) $$render(consequent);
      else if (!get(prompts).length && !get(editMode)) $$render(consequent_1, 1);
      else $$render(alternate_3, -1);
    });
  }
  var node_7 = sibling(node, 2);
  {
    var consequent_7 = ($$anchor2) => {
      var div_8 = root_15();
      var div_9 = child(div_8);
      var input = child(div_9);
      var input_1 = sibling(input, 2);
      var div_10 = sibling(div_9, 2);
      var select = child(div_10);
      each(select, 21, () => get(scopeOptions), index, ($$anchor3, opt) => {
        var option = root_16();
        var text_6 = child(option);
        var option_value = {};
        template_effect(() => {
          set_text(text_6, get(opt).label);
          if (option_value !== (option_value = get(opt).value)) {
            option.value = (option.__value = get(opt).value) ?? "";
          }
        });
        append($$anchor3, option);
      });
      var select_1 = sibling(select, 2);
      var option_1 = child(select_1);
      option_1.value = option_1.__value = "";
      var option_2 = sibling(option_1);
      option_2.value = option_2.__value = "positive";
      var option_3 = sibling(option_2);
      option_3.value = option_3.__value = "negative";
      var textarea = sibling(div_10, 2);
      set_attribute(textarea, "placeholder", "Prompt text... {cursor} marks cursor position");
      var button_2 = sibling(textarea, 2);
      bind_value(input, () => get(newName), ($$value) => set(newName, $$value));
      bind_value(input_1, () => get(newCategory), ($$value) => set(newCategory, $$value));
      bind_select_value(select, () => get(newScope), ($$value) => set(newScope, $$value));
      bind_select_value(select_1, () => get(newSlot), ($$value) => set(newSlot, $$value));
      bind_value(textarea, () => get(newText), ($$value) => set(newText, $$value));
      delegated("click", button_2, handleAdd);
      append($$anchor2, div_8);
    };
    if_block(node_7, ($$render) => {
      if (get(editMode)) $$render(consequent_7);
    });
  }
  var div_11 = sibling(node_7, 2);
  var button_3 = child(div_11);
  var text_7 = child(button_3);
  template_effect(() => set_text(text_7, get(editMode) ? "Done" : "Edit Prompts"));
  delegated("click", button_3, (e) => {
    e.stopPropagation();
    set(editMode, !get(editMode));
    set(openDropdown, null);
    loadPrompts();
  });
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_3$1 = from_html(`<div> </div>`);
var root_2$2 = from_html(`<div class="pcr-mode-menu" style="position:absolute;z-index:10000;min-width:120px"><div class="pcr-mode-menu-search-container"><input class="pcr-mode-menu-search" type="text" placeholder="Search..."/></div> <div class="pcr-mode-menu-separator"></div> <div class="pcr-mode-menu-list" style="max-height:200px;overflow-y:auto"></div></div>`);
var root_4$1 = from_html(`<div class="pcr-mode-menu" style="position:absolute;z-index:10000;min-width:120px;padding:4px"><input class="pcr-mode-menu-search" type="text"/></div>`);
var root$2 = from_html(`<span class="pcr-model-panel-field svelte-1u2z018"><span class="pcr-model-panel-field-label svelte-1u2z018"> </span> <span> </span> <!></span>`);
function ClickToEditField($$anchor, $$props) {
  push($$props, true);
  let label = prop($$props, "label", 3, ""), value = prop($$props, "value", 3, ""), type = prop($$props, "type", 3, "text"), options = prop($$props, "options", 19, () => []), placeholder = prop($$props, "placeholder", 3, ""), onChange = prop($$props, "onChange", 3, () => {
  });
  let currentVal = state(proxy(value()));
  let editing = state(false);
  let searchQuery = state("");
  let inputEl;
  user_effect(() => {
    if (!get(editing)) set(currentVal, value());
  });
  function displayLabel(v) {
    if (type() === "select" && options()) {
      const match = options().find((o) => o.id === v);
      return match ? match.label : v || "";
    }
    return v || "";
  }
  let display = user_derived(() => displayLabel(get(currentVal)));
  let isUnset = user_derived(() => !get(display) && !!placeholder());
  let filteredOptions = user_derived(() => {
    if (type() !== "select" || !options()) return [];
    const q = get(searchQuery).toLowerCase();
    if (!q) return options();
    return options().filter((o) => o.label.toLowerCase().includes(q));
  });
  function startEdit() {
    if (type() === "select") {
      set(editing, !get(editing));
      set(searchQuery, "");
    } else {
      set(editing, true);
      set(searchQuery, get(currentVal), true);
    }
  }
  function pick(val) {
    const prev = get(currentVal);
    set(currentVal, val, true);
    set(editing, false);
    if (get(currentVal) !== prev) onChange()(get(currentVal));
  }
  function handleInputKeydown(e) {
    if (e.key === "Enter") {
      pick(get(searchQuery).trim());
    } else if (e.key === "Escape") {
      set(editing, false);
    }
  }
  var span = root$2();
  var span_1 = child(span);
  var text2 = child(span_1);
  var span_2 = sibling(span_1, 2);
  let classes;
  var text_1 = child(span_2);
  var node = sibling(span_2, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var fragment = comment();
      var node_1 = first_child(fragment);
      {
        var consequent = ($$anchor3) => {
          var div = root_2$2();
          var div_1 = child(div);
          var input = child(div_1);
          bind_this(input, ($$value) => inputEl = $$value, () => inputEl);
          var div_2 = sibling(div_1, 4);
          each(div_2, 21, () => get(filteredOptions), index, ($$anchor4, opt) => {
            var div_3 = root_3$1();
            let classes_1;
            var text_2 = child(div_3);
            template_effect(() => {
              classes_1 = set_class(div_3, 1, "pcr-mode-menu-item", null, classes_1, {
                "pcr-mode-menu-item-current": get(opt).id === get(currentVal)
              });
              set_text(text_2, get(opt).label);
            });
            delegated("click", div_3, (e) => {
              e.stopPropagation();
              pick(get(opt).id);
            });
            append($$anchor4, div_3);
          });
          delegated("keydown", input, (e) => {
            if (e.key === "Escape") set(editing, false);
          });
          bind_value(input, () => get(searchQuery), ($$value) => set(searchQuery, $$value));
          append($$anchor3, div);
        };
        var alternate = ($$anchor3) => {
          var div_4 = root_4$1();
          var input_1 = child(div_4);
          bind_this(input_1, ($$value) => inputEl = $$value, () => inputEl);
          template_effect(($0) => set_attribute(input_1, "placeholder", $0), [() => placeholder() || `Type ${label().toLowerCase()}...`]);
          delegated("keydown", input_1, handleInputKeydown);
          bind_value(input_1, () => get(searchQuery), ($$value) => set(searchQuery, $$value));
          append($$anchor3, div_4);
        };
        if_block(node_1, ($$render) => {
          if (type() === "select") $$render(consequent);
          else $$render(alternate, -1);
        });
      }
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(editing)) $$render(consequent_1);
    });
  }
  template_effect(() => {
    set_text(text2, `${label() ?? ""}:`);
    classes = set_class(span_2, 1, "pcr-model-panel-field-value svelte-1u2z018", null, classes, { "pcr-field-unset": get(isUnset) });
    set_text(text_1, get(isUnset) ? placeholder() : get(display));
  });
  delegated("click", span_2, (e) => {
    e.stopPropagation();
    startEdit();
  });
  append($$anchor, span);
  pop();
}
delegate(["click", "keydown"]);
var root_1$1 = from_html(`<a target="_blank" rel="noopener" style="font-size:11px;color:#4fc3f7;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;margin-top:2px"> </a>`);
var root_2$1 = from_html(`<a target="_blank" rel="noopener" style="font-size:11px;color:#4fc3f7;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;margin-top:2px"> </a>`);
var root$1 = from_html(`<div class="pcr-model-panel-body"><div class="pcr-info-form svelte-e2dkce"><div class="pcr-info-classification svelte-e2dkce"><div class="pcr-model-panel-field-row svelte-e2dkce"><!> <!></div> <div class="pcr-model-panel-field-row svelte-e2dkce"><!> <!></div></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Author</div> <input type="text" class="svelte-e2dkce"/></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Description</div> <textarea class="svelte-e2dkce"></textarea></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">License</div> <input type="text" class="svelte-e2dkce"/></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Tags</div> <input type="text" class="svelte-e2dkce"/></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Model URL</div> <input type="text" class="svelte-e2dkce"/> <!></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Download URL</div> <input type="text" class="svelte-e2dkce"/> <!></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">CivitAI Model ID</div> <input type="text" class="svelte-e2dkce"/></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Trigger Words</div> <textarea class="svelte-e2dkce"></textarea></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Default Negative</div> <textarea class="svelte-e2dkce"></textarea></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Quality Tag Position</div> <input type="text" class="svelte-e2dkce"/></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Release Date</div> <input type="text" class="svelte-e2dkce"/></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Notes</div> <textarea class="svelte-e2dkce"></textarea></div> <div class="pcr-info-field svelte-e2dkce"><div class="pcr-info-field-label svelte-e2dkce">Fingerprint</div> <div class="pcr-info-field-readonly svelte-e2dkce"> </div></div> <button class="pcr-model-panel-save"> </button></div></div>`);
function InfoTab($$anchor, $$props) {
  push($$props, true);
  let modelInfo = prop($$props, "modelInfo", 19, () => ({})), savedConfig = prop($$props, "savedConfig", 3, null), architectures = prop($$props, "architectures", 19, () => []), families = prop($$props, "families", 19, () => ({}));
  let config = state(proxy({ ...savedConfig() || {} }));
  let saveStatus = state("");
  let saveTimer = null;
  user_effect(() => () => {
    clearTimeout(saveTimer);
  });
  let currentArch = state(proxy(get(config).architecture || modelInfo().architecture || ""));
  let currentFamily = state(proxy(get(config).family || ""));
  let currentModelName = state(proxy(get(config).model_name || modelInfo().filename || ""));
  let currentVersion = state(proxy(get(config).version || ""));
  let author = state(proxy(get(config).author || ""));
  let description = state(proxy(get(config).description || ""));
  let license = state(proxy(get(config).license || ""));
  let tags = state(proxy((get(config).tags || []).join(", ")));
  let url = state(proxy(get(config).url || ""));
  let downloadUrl = state(proxy(get(config).download_url || ""));
  let civitaiId = state(proxy(get(config).civitai_model_id || ""));
  let trigger = state(proxy(get(config).trigger || ""));
  let negative = state(proxy(get(config).negative || ""));
  let qualityPosition = state(proxy(get(config).quality_position || ""));
  let releaseDate = state(proxy(get(config).release_date || ""));
  let notes = state(proxy(get(config).notes || ""));
  function familiesForArch(arch) {
    return families()[arch] || [];
  }
  function saveClassification() {
    const mName = get(currentModelName).trim() || modelInfo().filename;
    const ver = get(currentVersion).trim();
    const composed = ver ? `${mName} - ${ver}` : mName;
    set(
      config,
      {
        ...get(config),
        architecture: get(currentArch),
        family: get(currentFamily) || void 0,
        model_name: mName,
        version: ver || void 0,
        display_name: composed
      },
      true
    );
    if (!get(config).nodes) get(config).nodes = {};
    doSave(get(config), true);
  }
  async function doSave(cfg, isClassification = false) {
    var _a;
    set(saveStatus, "Saving...");
    try {
      await fetch(`/promptchain/models/settings/${modelInfo().hash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg)
      });
      set(saveStatus, isClassification ? "" : "Saved", true);
      (_a = $$props.onConfigUpdate) == null ? void 0 : _a.call($$props, cfg);
      if (isClassification) {
        const composed = cfg.display_name || cfg.model_name || modelInfo().filename;
        window.dispatchEvent(new CustomEvent("pcr-model-renamed", { detail: { hash: modelInfo().hash, name: composed } }));
      }
      if (!isClassification) {
        saveTimer = setTimeout(
          () => {
            set(saveStatus, "");
          },
          1e3
        );
      }
    } catch {
      set(saveStatus, "Error");
    }
  }
  async function handleSaveInfo() {
    const cfg = { ...get(config) };
    cfg.author = get(author).trim() || void 0;
    cfg.description = get(description).trim() || void 0;
    cfg.license = get(license).trim() || void 0;
    const tagsVal = get(tags).trim();
    cfg.tags = tagsVal ? tagsVal.split(",").map((t) => t.trim()).filter(Boolean) : void 0;
    cfg.url = get(url).trim() || void 0;
    cfg.download_url = get(downloadUrl).trim() || void 0;
    const cid = get(civitaiId).toString().trim();
    cfg.civitai_model_id = cid ? parseInt(cid, 10) || void 0 : void 0;
    cfg.trigger = get(trigger).trim() || void 0;
    cfg.negative = get(negative).trim() || void 0;
    cfg.quality_position = get(qualityPosition).trim() || void 0;
    cfg.release_date = get(releaseDate).trim() || void 0;
    cfg.notes = get(notes).trim() || void 0;
    if (!cfg.nodes) cfg.nodes = {};
    set(config, cfg, true);
    doSave(cfg);
  }
  let archOptions = user_derived(() => {
    const opts = [...architectures()];
    if (get(currentArch) && !architectures().some((a) => a.id === get(currentArch))) {
      opts.push({ id: get(currentArch), label: get(currentArch) });
    }
    return opts;
  });
  var div = root$1();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var div_3 = child(div_2);
  var node = child(div_3);
  ClickToEditField(node, {
    label: "Architecture",
    get value() {
      return get(currentArch);
    },
    type: "select",
    get options() {
      return get(archOptions);
    },
    onChange: (val) => {
      set(currentArch, val, true);
      set(currentFamily, "");
      saveClassification();
    }
  });
  var node_1 = sibling(node, 2);
  {
    let $0 = user_derived(() => familiesForArch(get(currentArch)));
    ClickToEditField(node_1, {
      label: "Family",
      get value() {
        return get(currentFamily);
      },
      type: "select",
      get options() {
        return get($0);
      },
      onChange: (val) => {
        set(currentFamily, val, true);
        saveClassification();
      }
    });
  }
  var div_4 = sibling(div_3, 2);
  var node_2 = child(div_4);
  ClickToEditField(node_2, {
    label: "Model",
    get value() {
      return get(currentModelName);
    },
    type: "text",
    onChange: (val) => {
      set(currentModelName, val, true);
      saveClassification();
    }
  });
  var node_3 = sibling(node_2, 2);
  ClickToEditField(node_3, {
    label: "Version",
    get value() {
      return get(currentVersion);
    },
    type: "text",
    onChange: (val) => {
      set(currentVersion, val, true);
      saveClassification();
    }
  });
  var div_5 = sibling(div_2, 2);
  var input = sibling(child(div_5), 2);
  var div_6 = sibling(div_5, 2);
  var textarea = sibling(child(div_6), 2);
  var div_7 = sibling(div_6, 2);
  var input_1 = sibling(child(div_7), 2);
  var div_8 = sibling(div_7, 2);
  var input_2 = sibling(child(div_8), 2);
  var div_9 = sibling(div_8, 2);
  var input_3 = sibling(child(div_9), 2);
  var node_4 = sibling(input_3, 2);
  {
    var consequent = ($$anchor2) => {
      var a_1 = root_1$1();
      var text2 = child(a_1);
      template_effect(() => {
        set_attribute(a_1, "href", get(url));
        set_text(text2, get(url));
      });
      append($$anchor2, a_1);
    };
    if_block(node_4, ($$render) => {
      if (get(url)) $$render(consequent);
    });
  }
  var div_10 = sibling(div_9, 2);
  var input_4 = sibling(child(div_10), 2);
  var node_5 = sibling(input_4, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var a_2 = root_2$1();
      var text_1 = child(a_2);
      template_effect(() => {
        set_attribute(a_2, "href", get(downloadUrl));
        set_text(text_1, get(downloadUrl));
      });
      append($$anchor2, a_2);
    };
    if_block(node_5, ($$render) => {
      if (get(downloadUrl)) $$render(consequent_1);
    });
  }
  var div_11 = sibling(div_10, 2);
  var input_5 = sibling(child(div_11), 2);
  var div_12 = sibling(div_11, 2);
  var textarea_1 = sibling(child(div_12), 2);
  var div_13 = sibling(div_12, 2);
  var textarea_2 = sibling(child(div_13), 2);
  var div_14 = sibling(div_13, 2);
  var input_6 = sibling(child(div_14), 2);
  var div_15 = sibling(div_14, 2);
  var input_7 = sibling(child(div_15), 2);
  var div_16 = sibling(div_15, 2);
  var textarea_3 = sibling(child(div_16), 2);
  var div_17 = sibling(div_16, 2);
  var div_18 = sibling(child(div_17), 2);
  var text_2 = child(div_18);
  var button = sibling(div_17, 2);
  var text_3 = child(button);
  template_effect(() => {
    set_text(text_2, modelInfo().hash);
    button.disabled = get(saveStatus) === "Saving...";
    set_text(text_3, get(saveStatus) || "Save Info");
  });
  bind_value(input, () => get(author), ($$value) => set(author, $$value));
  bind_value(textarea, () => get(description), ($$value) => set(description, $$value));
  bind_value(input_1, () => get(license), ($$value) => set(license, $$value));
  bind_value(input_2, () => get(tags), ($$value) => set(tags, $$value));
  bind_value(input_3, () => get(url), ($$value) => set(url, $$value));
  bind_value(input_4, () => get(downloadUrl), ($$value) => set(downloadUrl, $$value));
  bind_value(input_5, () => get(civitaiId), ($$value) => set(civitaiId, $$value));
  bind_value(textarea_1, () => get(trigger), ($$value) => set(trigger, $$value));
  bind_value(textarea_2, () => get(negative), ($$value) => set(negative, $$value));
  bind_value(input_6, () => get(qualityPosition), ($$value) => set(qualityPosition, $$value));
  bind_value(input_7, () => get(releaseDate), ($$value) => set(releaseDate, $$value));
  bind_value(textarea_3, () => get(notes), ($$value) => set(notes, $$value));
  delegated("click", button, handleSaveInfo);
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_2 = from_html(`<span class="pcr-model-panel-meta-sep svelte-pdbgd6">&middot;</span>`);
var root_1 = from_html(`<!> <span> </span>`, 1);
var root_4 = from_html(`<span class="pcr-model-panel-meta-sep svelte-pdbgd6">&middot;</span>`);
var root_3 = from_html(`<!> <a target="_blank" rel="noopener" class="svelte-pdbgd6"> </a>`, 1);
var root_5 = from_html(`<span class="pcr-model-panel-meta-sep svelte-pdbgd6">&middot;</span>`);
var root_8 = from_html(`<button> </button>`);
var root_9 = from_html(`<button class="pcr-model-panel-version-btn pcr-version-download svelte-pdbgd6"> </button>`);
var root_10 = from_html(`<button>⟳</button>`);
var root_6 = from_html(`<div class="pcr-model-panel-versions-grid svelte-pdbgd6"><!> <!></div>`);
var root_13 = from_html(`<div class="pcr-older-versions-row svelte-pdbgd6"><span> </span> <span class="pcr-older-versions-arch svelte-pdbgd6"> </span></div>`);
var root_12 = from_html(`<div class="pcr-older-versions-list svelte-pdbgd6"></div>`);
var root_11 = from_html(`<div class="pcr-older-versions-wrap svelte-pdbgd6"><button class="pcr-older-versions-toggle svelte-pdbgd6"> <span class="pcr-older-versions-arrow svelte-pdbgd6"> </span></button> <!></div>`);
var root_14 = from_html(`<div> </div>`);
var root = from_html(`<div class="pcr-model-dropdown-panel svelte-pdbgd6"><div class="pcr-model-panel-header svelte-pdbgd6"><div class="pcr-model-panel-title-row svelte-pdbgd6"><div class="pcr-model-panel-title svelte-pdbgd6"> </div> <button class="pcr-model-panel-switch-btn svelte-pdbgd6">Models <span class="pcr-model-panel-switch-arrow svelte-pdbgd6">▼</span></button></div> <div class="pcr-model-panel-meta svelte-pdbgd6"><!> <!> <!> <span class="pcr-model-panel-meta-hash svelte-pdbgd6"> </span></div> <!> <!></div> <div class="pcr-model-tab-pane svelte-pdbgd6"><!></div> <div class="pcr-model-tab-pane svelte-pdbgd6"><!></div> <div class="pcr-model-tab-pane svelte-pdbgd6"><!></div> <div class="pcr-model-tab-pane svelte-pdbgd6"><!></div> <div class="pcr-model-panel-tabs svelte-pdbgd6"></div></div>`);
function ModelSettingsModal($$anchor, $$props) {
  push($$props, true);
  let detected = prop($$props, "detected", 19, () => []), savedConfig = prop($$props, "savedConfig", 3, null), initialTab = prop($$props, "activeTab", 3, "settings"), rangeMode = prop($$props, "rangeMode", 3, false), expandedSections = prop($$props, "expandedSections", 19, () => ({}));
  const TABS = [
    { id: "settings", label: "Settings" },
    { id: "prompts", label: "Prompts" },
    { id: "templates", label: "Templates" },
    { id: "info", label: "Info" }
  ];
  let activeTab = state(proxy(initialTab()));
  let config = state(proxy(savedConfig()));
  let versions = state(proxy([]));
  let olderVersions = state(proxy([]));
  let showOlderVersions = state(false);
  let panelEl;
  const currentModelName = user_derived(() => {
    var _a;
    return ((_a = get(config)) == null ? void 0 : _a.model_name) || $$props.modelInfo.filename || "Unknown Model";
  });
  const currentVersion = user_derived(() => {
    var _a;
    return ((_a = get(config)) == null ? void 0 : _a.version) || "";
  });
  const detectedArch = user_derived(() => {
    var _a;
    return ((_a = get(config)) == null ? void 0 : _a.architecture) || $$props.modelInfo.architecture || "";
  });
  const currentArch = user_derived(() => get(detectedArch) === "unknown" ? "" : get(detectedArch));
  const currentFamily = user_derived(() => {
    var _a;
    return ((_a = get(config)) == null ? void 0 : _a.family) || "";
  });
  let titleText = user_derived(() => get(currentVersion) ? `${get(currentModelName)} - ${get(currentVersion)}` : get(currentModelName));
  let metaParts = user_derived(() => {
    var _a, _b, _c, _d;
    const parts = [];
    if (get(currentArch)) {
      const archLabel = ((_a = ARCHITECTURES.find((a) => a.id === get(currentArch))) == null ? void 0 : _a.label) || get(currentArch);
      const familyLabel = get(currentFamily) ? ((_c = (_b = FAMILIES[get(currentArch)]) == null ? void 0 : _b.find((f) => f.id === get(currentFamily))) == null ? void 0 : _c.label) || get(currentFamily) : "";
      parts.push(familyLabel ? `${archLabel} / ${familyLabel}` : archLabel);
    }
    if ((_d = get(config)) == null ? void 0 : _d.author) parts.push(get(config).author);
    return parts;
  });
  let panelStyle = state("");
  function positionPanel() {
    if (!panelEl || !$$props.anchorEl) return;
    const rect = $$props.anchorEl.getBoundingClientRect();
    const panelHeight = panelEl.offsetHeight;
    const gap = 4;
    const padding = 8;
    const spaceAbove = rect.top - padding;
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    let style = `left:${rect.left}px;`;
    if (spaceBelow >= panelHeight + gap || spaceBelow >= spaceAbove) {
      style += `top:${rect.bottom + gap}px;bottom:auto;max-height:${spaceBelow - gap}px;`;
    } else {
      style += `bottom:${window.innerHeight - rect.top}px;top:auto;max-height:${spaceAbove - gap}px;`;
    }
    set(panelStyle, style, true);
  }
  user_effect(() => {
    untrack(() => {
      requestAnimationFrame(() => positionPanel());
    });
  });
  user_effect(() => {
    function onOutsideClick(e) {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      if (panelEl && !panelEl.contains(e.target)) {
        if ((_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".pcr-model-indicator")) return;
        if ((_d = (_c = e.target).closest) == null ? void 0 : _d.call(_c, ".pcr-resolution-preset-menu")) return;
        if ((_f = (_e = e.target).closest) == null ? void 0 : _f.call(_e, ".pcr-mode-menu")) return;
        if ((_h = (_g = e.target).closest) == null ? void 0 : _h.call(_g, ".pcr-footer-dropdown-menu")) return;
        $$props.onClose();
      }
    }
    document.addEventListener("pointerdown", onOutsideClick, true);
    return () => document.removeEventListener("pointerdown", onOutsideClick, true);
  });
  let versionFetchAbort = null;
  user_effect(() => {
    const versionModelName = untrack(() => {
      var _a;
      return ((_a = get(config)) == null ? void 0 : _a.model_name) || $$props.modelInfo.filename || "";
    });
    if (!versionModelName) return;
    versionFetchAbort == null ? void 0 : versionFetchAbort.abort();
    versionFetchAbort = new AbortController();
    const signal = versionFetchAbort.signal;
    fetch(`/promptchain/models/version-details?name=${encodeURIComponent(versionModelName)}`, { signal }).then((r) => r.ok ? r.json() : { versions: [] }).then(({ versions: v }) => {
      if (!signal.aborted) set(versions, v || [], true);
    }).catch((e) => {
      if (e.name !== "AbortError") console.error("[PromptChain] version-details failed:", e);
    });
    fetch(`/promptchain/models/older-versions?name=${encodeURIComponent(versionModelName)}`, { signal }).then((r) => r.ok ? r.json() : { versions: [] }).then(({ versions: v }) => {
      if (!signal.aborted) set(olderVersions, v, true);
    }).catch((e) => {
      if (e.name !== "AbortError") console.error("[PromptChain] older-versions failed:", e);
    });
  });
  let civitaiPayload = state(proxy({ versions: [], installed_version_ids: [], fetched_at: null }));
  let civitaiRefreshing = state(false);
  let civitaiVersionsAbort = null;
  const _autoDetectedHashes = window.__pcrAutoDetectedHashes || (window.__pcrAutoDetectedHashes = /* @__PURE__ */ new Set());
  async function maybeAutoDetect() {
    var _a, _b;
    const hash = (_a = $$props.modelInfo) == null ? void 0 : _a.hash;
    if (!hash) return;
    if ((_b = get(config)) == null ? void 0 : _b.civitai_model_id) return;
    if (_autoDetectedHashes.has(hash)) return;
    _autoDetectedHashes.add(hash);
    try {
      const res = await fetch("/promptchain/models/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quick_hash: hash })
      });
      if (!res.ok) return;
      const data = await res.json();
      if ((data == null ? void 0 : data.status) === "found" && (data == null ? void 0 : data.settings)) {
        set(config, { ...get(config) || {}, ...data.settings }, true);
      }
    } catch {
    }
  }
  async function fetchCivitaiVersions(modelId, { force = false } = {}) {
    civitaiVersionsAbort == null ? void 0 : civitaiVersionsAbort.abort();
    civitaiVersionsAbort = new AbortController();
    const signal = civitaiVersionsAbort.signal;
    const url = `/promptchain/civitai/model-versions?model_id=${modelId}${force ? "&force=1" : ""}`;
    try {
      const r = await fetch(url, { signal });
      if (!r.ok) return;
      const data = await r.json();
      if (!signal.aborted) set(civitaiPayload, data, true);
    } catch (e) {
      if (e.name !== "AbortError") console.error("[PromptChain] civitai model-versions failed:", e);
    }
  }
  user_effect(() => {
    var _a;
    const modelId = (_a = get(config)) == null ? void 0 : _a.civitai_model_id;
    if (!modelId) {
      set(civitaiPayload, { versions: [], installed_version_ids: [], fetched_at: null }, true);
      untrack(() => maybeAutoDetect());
      return;
    }
    fetchCivitaiVersions(modelId);
  });
  async function refreshCivitaiVersions() {
    var _a;
    const modelId = (_a = get(config)) == null ? void 0 : _a.civitai_model_id;
    if (!modelId || get(civitaiRefreshing)) return;
    set(civitaiRefreshing, true);
    await fetchCivitaiVersions(modelId, { force: true });
    set(civitaiRefreshing, false);
  }
  function normalizeVersion(s) {
    return (s || "").toLowerCase().replace(/^v\s*/, "").replace(/[^a-z0-9. ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function formatAgo(epochSeconds) {
    if (!epochSeconds) return "just now";
    const diffSec = Math.max(0, Math.floor(Date.now() / 1e3 - epochSeconds));
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }
  let mergedVersions = user_derived(() => {
    var _a, _b;
    const installedIds = new Set(get(civitaiPayload).installed_version_ids || []);
    const installedNames = new Set(get(versions).map((v) => normalizeVersion(v.version)).filter(Boolean));
    const currentLocalName = normalizeVersion(((_a = get(config)) == null ? void 0 : _a.version) || "");
    if (currentLocalName) installedNames.add(currentLocalName);
    let localMaxDate = "";
    for (const v of get(civitaiPayload).versions || []) {
      const matchById = installedIds.has(v.civitai_version_id);
      const matchByName = installedNames.has(normalizeVersion(v.version_name));
      if ((matchById || matchByName) && (v.published_at || "") > localMaxDate) {
        localMaxDate = v.published_at || "";
      }
    }
    if (!localMaxDate && ((_b = get(config)) == null ? void 0 : _b.release_date)) localMaxDate = get(config).release_date;
    const out = [];
    for (const v of get(versions)) {
      out.push({ kind: "installed", date: v.release_date || "", ver: v });
    }
    const localMaxDay = localMaxDate.slice(0, 10);
    for (const v of get(civitaiPayload).versions || []) {
      if (!v.file) continue;
      if (installedIds.has(v.civitai_version_id)) continue;
      if (installedNames.has(normalizeVersion(v.version_name))) continue;
      if (localMaxDay && (v.published_at || "").slice(0, 10) <= localMaxDay) continue;
      out.push({ kind: "civitai", date: v.published_at || "", ver: v });
    }
    out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return out;
  });
  function safeHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
  async function handleSave(newConfig) {
    const resp = await fetch(`/promptchain/models/settings/${$$props.modelInfo.hash}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newConfig)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    set(config, newConfig, true);
  }
  function handleConfigUpdate(newConfig) {
    set(config, newConfig, true);
  }
  function handleShowCatalogDownload(ver) {
    $$props.onShowCatalogDownload(ver);
  }
  var div = root();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var div_3 = child(div_2);
  var text2 = child(div_3);
  var button = sibling(div_3, 2);
  var div_4 = sibling(div_2, 2);
  var node = child(div_4);
  each(node, 17, () => get(metaParts), index, ($$anchor2, part, i) => {
    var fragment = root_1();
    var node_1 = first_child(fragment);
    {
      var consequent = ($$anchor3) => {
        var span = root_2();
        append($$anchor3, span);
      };
      if_block(node_1, ($$render) => {
        if (i > 0) $$render(consequent);
      });
    }
    var span_1 = sibling(node_1, 2);
    var text_1 = child(span_1);
    template_effect(() => set_text(text_1, get(part)));
    append($$anchor2, fragment);
  });
  var node_2 = sibling(node, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var fragment_1 = root_3();
      var node_3 = first_child(fragment_1);
      {
        var consequent_1 = ($$anchor3) => {
          var span_2 = root_4();
          append($$anchor3, span_2);
        };
        if_block(node_3, ($$render) => {
          if (get(metaParts).length) $$render(consequent_1);
        });
      }
      var a_1 = sibling(node_3, 2);
      var text_2 = child(a_1);
      template_effect(
        ($0) => {
          set_attribute(a_1, "href", get(config).url);
          set_attribute(a_1, "title", get(config).url);
          set_text(text_2, $0);
        },
        [() => safeHostname(get(config).url)]
      );
      append($$anchor2, fragment_1);
    };
    if_block(node_2, ($$render) => {
      var _a;
      if ((_a = get(config)) == null ? void 0 : _a.url) $$render(consequent_2);
    });
  }
  var node_4 = sibling(node_2, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var span_3 = root_5();
      append($$anchor2, span_3);
    };
    if_block(node_4, ($$render) => {
      var _a;
      if (get(metaParts).length || ((_a = get(config)) == null ? void 0 : _a.url)) $$render(consequent_3);
    });
  }
  var span_4 = sibling(node_4, 2);
  var text_3 = child(span_4);
  var node_5 = sibling(div_4, 2);
  {
    var consequent_6 = ($$anchor2) => {
      var div_5 = root_6();
      var node_6 = child(div_5);
      each(node_6, 17, () => get(mergedVersions), index, ($$anchor3, entry) => {
        var fragment_2 = comment();
        var node_7 = first_child(fragment_2);
        {
          var consequent_4 = ($$anchor4) => {
            var button_1 = root_8();
            let classes;
            var text_4 = child(button_1);
            template_effect(() => {
              classes = set_class(button_1, 1, "pcr-model-panel-version-btn svelte-pdbgd6", null, classes, {
                "pcr-version-active": get(entry).ver.hash === $$props.modelInfo.hash
              });
              set_attribute(button_1, "title", get(entry).ver.filename || get(entry).ver.hash);
              set_text(text_4, get(entry).ver.version);
            });
            delegated("click", button_1, (e) => {
              e.stopPropagation();
              if (get(entry).ver.hash !== $$props.modelInfo.hash) $$props.onSwitchVersion(get(entry).ver);
            });
            append($$anchor4, button_1);
          };
          var alternate = ($$anchor4) => {
            var button_2 = root_9();
            var text_5 = child(button_2);
            template_effect(() => {
              set_attribute(button_2, "title", `Download ${get(entry).ver.version_name} from CivitAI`);
              set_text(text_5, `${get(entry).ver.version_name ?? ""} ↓`);
            });
            delegated("click", button_2, (e) => {
              var _a;
              e.stopPropagation();
              (_a = $$props.onShowDownload) == null ? void 0 : _a.call($$props, get(entry).ver);
            });
            append($$anchor4, button_2);
          };
          if_block(node_7, ($$render) => {
            if (get(entry).kind === "installed") $$render(consequent_4);
            else $$render(alternate, -1);
          });
        }
        append($$anchor3, fragment_2);
      });
      var node_8 = sibling(node_6, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var button_3 = root_10();
          let classes_1;
          template_effect(
            ($0) => {
              classes_1 = set_class(button_3, 1, "pcr-model-panel-refresh-btn svelte-pdbgd6", null, classes_1, { "pcr-refreshing": get(civitaiRefreshing) });
              set_attribute(button_3, "title", $0);
              button_3.disabled = get(civitaiRefreshing);
            },
            [
              () => get(civitaiPayload).fetched_at ? `Fetched ${formatAgo(get(civitaiPayload).fetched_at)} — click to refresh from CivitAI` : "Refresh from CivitAI"
            ]
          );
          delegated("click", button_3, (e) => {
            e.stopPropagation();
            refreshCivitaiVersions();
          });
          append($$anchor3, button_3);
        };
        if_block(node_8, ($$render) => {
          var _a;
          if ((_a = get(config)) == null ? void 0 : _a.civitai_model_id) $$render(consequent_5);
        });
      }
      append($$anchor2, div_5);
    };
    if_block(node_5, ($$render) => {
      var _a;
      if (get(mergedVersions).length > 1 || ((_a = get(config)) == null ? void 0 : _a.civitai_model_id)) $$render(consequent_6);
    });
  }
  var node_9 = sibling(node_5, 2);
  {
    var consequent_8 = ($$anchor2) => {
      var div_6 = root_11();
      var button_4 = child(div_6);
      var text_6 = child(button_4);
      var span_5 = sibling(text_6);
      var text_7 = child(span_5);
      var node_10 = sibling(button_4, 2);
      {
        var consequent_7 = ($$anchor3) => {
          var div_7 = root_12();
          each(div_7, 21, () => get(olderVersions), index, ($$anchor4, ver) => {
            var div_8 = root_13();
            var span_6 = child(div_8);
            var text_8 = child(span_6);
            var span_7 = sibling(span_6, 2);
            var text_9 = child(span_7);
            template_effect(
              ($0) => {
                set_text(text_8, get(ver).display_name || `${get(ver).model_name} ${get(ver).version}`);
                set_text(text_9, $0);
              },
              [
                () => [get(ver).architecture, get(ver).family].filter(Boolean).join(" · ")
              ]
            );
            delegated("click", div_8, (e) => {
              e.stopPropagation();
              handleShowCatalogDownload(get(ver));
            });
            append($$anchor4, div_8);
          });
          append($$anchor3, div_7);
        };
        if_block(node_10, ($$render) => {
          if (get(showOlderVersions)) $$render(consequent_7);
        });
      }
      template_effect(() => {
        set_text(text_6, `Older Versions (${get(olderVersions).length ?? ""}) `);
        set_text(text_7, get(showOlderVersions) ? " ▲" : " ▼");
      });
      delegated("click", button_4, (e) => {
        e.stopPropagation();
        set(showOlderVersions, !get(showOlderVersions));
      });
      append($$anchor2, div_6);
    };
    if_block(node_9, ($$render) => {
      if (get(olderVersions).length) $$render(consequent_8);
    });
  }
  var div_9 = sibling(div_1, 2);
  let styles;
  var node_11 = child(div_9);
  SettingsTab(node_11, {
    get detected() {
      return detected();
    },
    get savedConfig() {
      return get(config);
    },
    get rangeMode() {
      return rangeMode();
    },
    get expandedSections() {
      return expandedSections();
    },
    get readWidgetValue() {
      return $$props.readWidgetValue;
    },
    get readWidgetOptions() {
      return $$props.readWidgetOptions;
    },
    get writeWidgetValue() {
      return $$props.writeWidgetValue;
    },
    get resolveResolutionTicks() {
      return $$props.resolveResolutionTicks;
    },
    get injectableNodes() {
      return $$props.injectableNodes;
    },
    onSave: handleSave,
    get onReopen() {
      return $$props.onReopen;
    },
    get onInjectNode() {
      return $$props.onInjectNode;
    },
    get onClose() {
      return $$props.onClose;
    }
  });
  var div_10 = sibling(div_9, 2);
  let styles_1;
  var node_12 = child(div_10);
  TemplatesTab(node_12, {
    get modelInfo() {
      return $$props.modelInfo;
    },
    get savedConfig() {
      return get(config);
    },
    get onApplyTemplate() {
      return $$props.onApplyTemplate;
    },
    get captureWorkflowGraph() {
      return $$props.captureWorkflowGraph;
    }
  });
  var div_11 = sibling(div_10, 2);
  let styles_2;
  var node_13 = child(div_11);
  PromptsTab(node_13, {
    get modelInfo() {
      return $$props.modelInfo;
    },
    get savedConfig() {
      return get(config);
    },
    get getEditor() {
      return $$props.getEditor;
    },
    get onClose() {
      return $$props.onClose;
    }
  });
  var div_12 = sibling(div_11, 2);
  let styles_3;
  var node_14 = child(div_12);
  InfoTab(node_14, {
    get modelInfo() {
      return $$props.modelInfo;
    },
    get savedConfig() {
      return get(config);
    },
    get architectures() {
      return ARCHITECTURES;
    },
    get families() {
      return FAMILIES;
    },
    onConfigUpdate: handleConfigUpdate
  });
  var div_13 = sibling(div_12, 2);
  each(div_13, 21, () => TABS, index, ($$anchor2, tab) => {
    var div_14 = root_14();
    let classes_2;
    var text_10 = child(div_14);
    template_effect(() => {
      classes_2 = set_class(div_14, 1, "pcr-model-panel-tab svelte-pdbgd6", null, classes_2, {
        "pcr-model-panel-tab-active": get(activeTab) === get(tab).id
      });
      set_text(text_10, get(tab).label);
    });
    delegated("click", div_14, (e) => {
      e.stopPropagation();
      if (rangeMode() && get(tab).id !== "settings") {
        $$props.onReopen({ rangeMode: false, tab: get(tab).id });
        return;
      }
      set(activeTab, get(tab).id, true);
    });
    append($$anchor2, div_14);
  });
  bind_this(div, ($$value) => panelEl = $$value, () => panelEl);
  template_effect(() => {
    set_style(div, get(panelStyle));
    set_text(text2, get(titleText));
    set_text(text_3, $$props.modelInfo.hash);
    styles = set_style(div_9, "", styles, { display: get(activeTab) === "settings" ? "" : "none" });
    styles_1 = set_style(div_10, "", styles_1, { display: get(activeTab) === "templates" ? "" : "none" });
    styles_2 = set_style(div_11, "", styles_2, { display: get(activeTab) === "prompts" ? "" : "none" });
    styles_3 = set_style(div_12, "", styles_3, { display: get(activeTab) === "info" ? "" : "none" });
  });
  delegated("click", button, (e) => {
    e.stopPropagation();
    $$props.onOpenPicker();
  });
  append($$anchor, div);
  pop();
}
delegate(["click"]);
function mountModelSettings(target, props) {
  return mount(ModelSettingsModal, { target, props });
}
function destroyModelSettings(instance) {
  if (instance) unmount(instance);
}
export {
  destroyModelSettings,
  mountModelSettings
};
//# sourceMappingURL=promptchain-model-settings.js.map
