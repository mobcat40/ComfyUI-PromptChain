import { d as delegate, p as push, a as prop, s as state, c as proxy, u as user_effect, e as set, f as sibling, n as child, i as if_block, g as get, t as template_effect, j as delegated, k as append, l as pop, v as first_child, h as set_class, y as set_text, A as from_html, m as user_derived, w as each, z as index, H as to_array, C as tick, o as bind_this, D as comment, x as set_attribute, q as set_value, R as text, M as unmount, L as mount } from "./disclose-version-et9wt-4m.js";
import { a as onMount } from "./index-client-6amB1qrM.js";
import { a as action } from "./actions-zjmT0mOr.js";
import { s as set_style } from "./style-B3hsaAru.js";
import { a as bind_checked, b as bind_value } from "./input-B9kD0bWJ.js";
import { b as isStructuralLine, d as isInNegativeBlock } from "./ai-patch-helpers-Bayqv0oF.js";
import { f as formatTagsForModel } from "./tag-builder-utils-ng134QDV.js";
var root_1$3 = from_html(`<div class="pcr-atb2-cust-loading svelte-1mwxie1">Loading…</div>`);
var root_3$2 = from_html(`<button class="pcr-atb2-cust-rowclear svelte-1mwxie1" title="Clear">&times;</button>`);
var root_6$3 = from_html(`<div><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color svelte-1mwxie1"></span> <span> </span></div>`);
var root_5$3 = from_html(`<div class="pcr-atb2-cust-popgroup svelte-1mwxie1"> </div> <!>`, 1);
var root_4$3 = from_html(`<div class="pcr-atb2-cust-popover svelte-1mwxie1"><div><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color svelte-1mwxie1" style="background:transparent;border:1px dashed var(--pcr-border)"></span> <span>None</span></div> <!></div>`);
var root_7$3 = from_html(`<button class="pcr-atb2-cust-rowclear svelte-1mwxie1" title="Reset">&times;</button>`);
var root_10$3 = from_html(`<div><span class="pcr-atb2-cust-icon-bullet svelte-1mwxie1"></span> <span> </span></div>`);
var root_9$3 = from_html(`<div class="pcr-atb2-cust-popgroup svelte-1mwxie1"> </div> <!>`, 1);
var root_8$3 = from_html(`<div class="pcr-atb2-cust-popover svelte-1mwxie1"></div>`);
var root_11$3 = from_html(`<button class="pcr-atb2-cust-rowclear svelte-1mwxie1" title="Clear">&times;</button>`);
var root_13$3 = from_html(`<div><span class="pcr-atb2-cust-icon-bullet svelte-1mwxie1"></span> <span> </span></div>`);
var root_12$3 = from_html(`<div class="pcr-atb2-cust-popover svelte-1mwxie1"><div><span class="pcr-atb2-cust-icon-bullet svelte-1mwxie1"></span> <span>None</span></div> <!></div>`);
var root_14$3 = from_html(`<button class="pcr-atb2-cust-rowclear svelte-1mwxie1" title="Reset">&times;</button>`);
var root_17$2 = from_html(`<div><span class="pcr-atb2-cust-icon-bullet svelte-1mwxie1"></span> <span> </span></div>`);
var root_16$2 = from_html(`<div class="pcr-atb2-cust-popgroup svelte-1mwxie1"> </div> <!>`, 1);
var root_15$3 = from_html(`<div class="pcr-atb2-cust-popover svelte-1mwxie1"></div>`);
var root_2$3 = from_html(`<div class="pcr-atb2-cust-body svelte-1mwxie1"><div><button class="pcr-atb2-cust-rowbtn svelte-1mwxie1" type="button"><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color svelte-1mwxie1"></span> <span class="pcr-atb2-cust-rowlabel svelte-1mwxie1"> </span> <!> <span class="pcr-atb2-cust-chev svelte-1mwxie1">▾</span></button> <!></div> <div><button class="pcr-atb2-cust-rowbtn svelte-1mwxie1" type="button"><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-pattern svelte-1mwxie1" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><rect x="0" y="0" width="4" height="4" fill="currentColor"></rect><rect x="8" y="0" width="4" height="4" fill="currentColor"></rect><rect x="4" y="4" width="4" height="4" fill="currentColor"></rect><rect x="12" y="4" width="4" height="4" fill="currentColor"></rect><rect x="0" y="8" width="4" height="4" fill="currentColor"></rect><rect x="8" y="8" width="4" height="4" fill="currentColor"></rect><rect x="4" y="12" width="4" height="4" fill="currentColor"></rect><rect x="12" y="12" width="4" height="4" fill="currentColor"></rect></svg></span> <span class="pcr-atb2-cust-rowlabel svelte-1mwxie1"> </span> <!> <span class="pcr-atb2-cust-chev svelte-1mwxie1">▾</span></button> <!></div> <div><button class="pcr-atb2-cust-rowbtn svelte-1mwxie1" type="button"><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-material svelte-1mwxie1" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1 5 Q 4 2, 8 5 T 15 5"></path><path d="M1 11 Q 4 8, 8 11 T 15 11"></path></svg></span> <span class="pcr-atb2-cust-rowlabel svelte-1mwxie1"> </span> <!> <span class="pcr-atb2-cust-chev svelte-1mwxie1">▾</span></button> <!></div> <div><button class="pcr-atb2-cust-rowbtn svelte-1mwxie1" type="button"><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-condition svelte-1mwxie1" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><polyline points="2,4 5,7 3,9 6,12 4,14"></polyline><polyline points="10,2 13,5 11,8 14,11 12,14"></polyline></svg></span> <span class="pcr-atb2-cust-rowlabel svelte-1mwxie1"> </span> <!> <span class="pcr-atb2-cust-chev svelte-1mwxie1">▾</span></button> <!></div> <label><input type="checkbox" class="svelte-1mwxie1"/> <span>Add focus tags</span> <span class="pcr-atb2-cust-focus-hint svelte-1mwxie1"> </span></label> <div class="pcr-atb2-cust-preview svelte-1mwxie1"><div class="pcr-atb2-cust-preview-label svelte-1mwxie1">Preview</div> <div class="pcr-atb2-cust-preview-text svelte-1mwxie1"> </div></div></div> <div class="pcr-atb2-cust-footer svelte-1mwxie1"><button class="pcr-atb2-cust-btn pcr-atb2-cust-cancel svelte-1mwxie1">Cancel</button> <button class="pcr-atb2-cust-btn pcr-atb2-cust-ok svelte-1mwxie1">Apply</button></div>`, 1);
var root$2 = from_html(`<div class="pcr-atb2-cust-overlay svelte-1mwxie1"><div class="pcr-atb2-cust-modal svelte-1mwxie1"><div class="pcr-atb2-cust-header svelte-1mwxie1"><span class="pcr-atb2-cust-title svelte-1mwxie1">Customize <strong class="svelte-1mwxie1"> </strong></span> <button class="pcr-atb2-cust-close svelte-1mwxie1" aria-label="Close">&times;</button></div> <!></div></div>`);
function Customizer($$anchor, $$props) {
  var _a, _b, _c, _d, _e;
  push($$props, true);
  let initial = prop(
    $$props,
    "initial",
    3,
    null
    // { color, pattern, material, condition, focus } — pre-fill when editing
  ), isNaturalMode = prop(
    $$props,
    "isNaturalMode",
    3,
    false
    // current output mode, so the preview + focus match what the parent emits
  ), onConfirm = prop($$props, "onConfirm", 3, () => {
  }), onCancel = prop($$props, "onCancel", 3, () => {
  });
  let loading = state(true);
  let data = state(null);
  let color = state(proxy(((_a = initial()) == null ? void 0 : _a.color) || ""));
  let pattern = state(proxy(((_b = initial()) == null ? void 0 : _b.pattern) || "solid"));
  let material = state(proxy(((_c = initial()) == null ? void 0 : _c.material) || ""));
  let condition = state(proxy(((_d = initial()) == null ? void 0 : _d.condition) || "default"));
  let focus = state(!!((_e = initial()) == null ? void 0 : _e.focus));
  let openRow = state(
    null
    // "color" | "pattern" | "material" | "condition" | null
  );
  user_effect(() => {
    fetchData();
  });
  async function fetchData() {
    try {
      const res = await fetch(`/promptchain/clothing/customizer-data?group=${encodeURIComponent($$props.item.item_group || "")}`);
      set(
        data,
        res.ok ? await res.json() : { colors: [], patterns: [], materials: [], conditions: [] },
        true
      );
    } catch {
      set(data, { colors: [], patterns: [], materials: [], conditions: [] }, true);
    }
    set(loading, false);
  }
  const COLOR_HEX = {
    burgundy: "#800020",
    wine: "#722f37",
    rose: "#ff66cc",
    blush: "#de5d83",
    coral: "#ff7f50",
    salmon: "#fa8072",
    peach: "#ffcba4",
    mustard: "#ffdb58",
    olive: "#808000",
    sage: "#9caf88",
    forest: "#228b22",
    mint: "#98ff98",
    teal: "#008080",
    turquoise: "#40e0d0",
    navy: "#000080",
    royal: "#4169e1",
    cobalt: "#0047ab",
    indigo: "#4b0082",
    plum: "#8e4585",
    lavender: "#e6e6fa",
    lilac: "#c8a2c8",
    cream: "#ffe69f",
    beige: "#f5f5dc",
    tan: "#d2b48c",
    khaki: "#c3b091",
    bronze: "#cd7f32",
    copper: "#b87333",
    rust: "#b7410e",
    chocolate: "#7b3f00",
    charcoal: "#36454f",
    brown: "#5d2d19",
    grey: "#636363",
    gray: "#636363"
  };
  function colorSwatch(tag) {
    if (!tag) return "transparent";
    return COLOR_HEX[tag] || tag;
  }
  function findOption(list, tag) {
    return (list || []).find((o) => o.tag === tag);
  }
  let colorOpt = user_derived(() => {
    var _a2;
    return findOption((_a2 = get(data)) == null ? void 0 : _a2.colors, get(color));
  });
  let patternOpt = user_derived(() => {
    var _a2;
    return findOption((_a2 = get(data)) == null ? void 0 : _a2.patterns, get(pattern));
  });
  let materialOpt = user_derived(() => {
    var _a2;
    return findOption((_a2 = get(data)) == null ? void 0 : _a2.materials, get(material));
  });
  let conditionOpt = user_derived(() => {
    var _a2;
    return findOption((_a2 = get(data)) == null ? void 0 : _a2.conditions, get(condition));
  });
  let colorGroups = user_derived(() => {
    var _a2;
    if (!((_a2 = get(data)) == null ? void 0 : _a2.colors)) return [];
    const groups = {};
    for (const c of get(data).colors) {
      if (!groups[c.color_group]) groups[c.color_group] = [];
      groups[c.color_group].push(c);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a.toLowerCase() === "neutral") return -1;
      if (b.toLowerCase() === "neutral") return 1;
      return a.localeCompare(b);
    });
  });
  let patternGroups = user_derived(() => {
    var _a2;
    if (!((_a2 = get(data)) == null ? void 0 : _a2.patterns)) return [];
    const groups = {};
    for (const p of get(data).patterns) {
      if (!groups[p.pattern_group]) groups[p.pattern_group] = [];
      groups[p.pattern_group].push(p);
    }
    return Object.entries(groups);
  });
  let conditionGroups = user_derived(() => {
    var _a2;
    if (!((_a2 = get(data)) == null ? void 0 : _a2.conditions)) return [];
    const groups = {};
    for (const c of get(data).conditions) {
      if (!groups[c.condition_group]) groups[c.condition_group] = [];
      groups[c.condition_group].push(c);
    }
    return Object.entries(groups);
  });
  let preview = user_derived(() => {
    var _a2, _b2, _c2, _d2;
    if (!get(data)) return ($$props.item.display_name || $$props.item.item_tag).toLowerCase();
    const prefixes = [
      (_a2 = get(conditionOpt)) == null ? void 0 : _a2.prefix,
      (_b2 = get(colorOpt)) == null ? void 0 : _b2.prefix,
      (_c2 = get(patternOpt)) == null ? void 0 : _c2.prefix,
      (_d2 = get(materialOpt)) == null ? void 0 : _d2.prefix
    ].filter(Boolean);
    if (!isNaturalMode()) {
      const slug = (s) => s.replace(/\s+/g, "_");
      return [...prefixes.map(slug), $$props.item.item_tag || ""].filter(Boolean).join("_");
    }
    const phrase = [
      ...prefixes,
      ($$props.item.display_name || $$props.item.item_tag).toLowerCase()
    ].join(" ");
    return get(focus) ? `${phrase}, presenting ${phrase} to viewer, ${phrase} focus` : phrase;
  });
  let isCustomized = user_derived(() => !!get(color) || get(pattern) && get(pattern) !== "solid" || !!get(material) || get(condition) && get(condition) !== "default" || get(focus));
  function pickRow(row, value) {
    if (row === "color") set(color, value, true);
    else if (row === "pattern") set(pattern, value, true);
    else if (row === "material") set(material, value, true);
    else if (row === "condition") set(condition, value, true);
    set(openRow, null);
  }
  function clearRow(row) {
    if (row === "color") set(color, "");
    else if (row === "pattern") set(pattern, "solid");
    else if (row === "material") set(material, "");
    else if (row === "condition") set(condition, "default");
  }
  function handleConfirm() {
    onConfirm()({
      modifiers: get(isCustomized) ? {
        color: get(color) || null,
        pattern: get(pattern) && get(pattern) !== "solid" ? get(pattern) : null,
        material: get(material) || null,
        condition: get(condition) && get(condition) !== "default" ? get(condition) : null,
        focus: !!get(focus)
      } : null
    });
  }
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel()();
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel()();
    } else if (e.key === "Enter" && get(openRow) === null) {
      e.stopPropagation();
      handleConfirm();
    }
  }
  var div = root$2();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var span = child(div_2);
  var strong = sibling(child(span));
  var text2 = child(strong);
  var button = sibling(span, 2);
  var node = sibling(div_2, 2);
  {
    var consequent = ($$anchor2) => {
      var div_3 = root_1$3();
      append($$anchor2, div_3);
    };
    var alternate = ($$anchor2) => {
      var fragment = root_2$3();
      var div_4 = first_child(fragment);
      var div_5 = child(div_4);
      let classes;
      var button_1 = child(div_5);
      var span_1 = child(button_1);
      var span_2 = sibling(span_1, 2);
      var text_1 = child(span_2);
      var node_1 = sibling(span_2, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var button_2 = root_3$2();
          delegated("click", button_2, (e) => {
            e.stopPropagation();
            clearRow("color");
          });
          append($$anchor3, button_2);
        };
        if_block(node_1, ($$render) => {
          if (get(color)) $$render(consequent_1);
        });
      }
      var node_2 = sibling(button_1, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_6 = root_4$3();
          var div_7 = child(div_6);
          let classes_1;
          var node_3 = sibling(div_7, 2);
          each(node_3, 17, () => get(colorGroups), index, ($$anchor4, $$item) => {
            var $$array = user_derived(() => to_array(get($$item), 2));
            let grp = () => get($$array)[0];
            let colors = () => get($$array)[1];
            var fragment_1 = root_5$3();
            var div_8 = first_child(fragment_1);
            var text_2 = child(div_8);
            var node_4 = sibling(div_8, 2);
            each(node_4, 17, colors, index, ($$anchor5, c) => {
              var div_9 = root_6$3();
              let classes_2;
              var span_3 = child(div_9);
              var span_4 = sibling(span_3, 2);
              var text_3 = child(span_4);
              template_effect(
                ($0) => {
                  classes_2 = set_class(div_9, 1, "pcr-atb2-cust-popitem svelte-1mwxie1", null, classes_2, { active: get(c).tag === get(color) });
                  set_style(span_3, `background:${$0 ?? ""}`);
                  set_text(text_3, get(c).display);
                },
                [() => colorSwatch(get(c).tag)]
              );
              delegated("click", div_9, () => pickRow("color", get(c).tag));
              append($$anchor5, div_9);
            });
            template_effect(() => set_text(text_2, grp()));
            append($$anchor4, fragment_1);
          });
          template_effect(() => classes_1 = set_class(div_7, 1, "pcr-atb2-cust-popitem svelte-1mwxie1", null, classes_1, { active: !get(color) }));
          delegated("click", div_7, () => pickRow("color", ""));
          append($$anchor3, div_6);
        };
        if_block(node_2, ($$render) => {
          if (get(openRow) === "color") $$render(consequent_2);
        });
      }
      var div_10 = sibling(div_5, 2);
      let classes_3;
      var button_3 = child(div_10);
      var span_5 = sibling(child(button_3), 2);
      var text_4 = child(span_5);
      var node_5 = sibling(span_5, 2);
      {
        var consequent_3 = ($$anchor3) => {
          var button_4 = root_7$3();
          delegated("click", button_4, (e) => {
            e.stopPropagation();
            clearRow("pattern");
          });
          append($$anchor3, button_4);
        };
        if_block(node_5, ($$render) => {
          if (get(pattern) && get(pattern) !== "solid") $$render(consequent_3);
        });
      }
      var node_6 = sibling(button_3, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var div_11 = root_8$3();
          each(div_11, 21, () => get(patternGroups), index, ($$anchor4, $$item) => {
            var $$array_1 = user_derived(() => to_array(get($$item), 2));
            let grp = () => get($$array_1)[0];
            let patterns = () => get($$array_1)[1];
            var fragment_2 = root_9$3();
            var div_12 = first_child(fragment_2);
            var text_5 = child(div_12);
            var node_7 = sibling(div_12, 2);
            each(node_7, 17, patterns, index, ($$anchor5, p) => {
              var div_13 = root_10$3();
              let classes_4;
              var span_6 = sibling(child(div_13), 2);
              var text_6 = child(span_6);
              template_effect(() => {
                classes_4 = set_class(div_13, 1, "pcr-atb2-cust-popitem svelte-1mwxie1", null, classes_4, { active: get(p).tag === get(pattern) });
                set_text(text_6, get(p).display);
              });
              delegated("click", div_13, () => pickRow("pattern", get(p).tag));
              append($$anchor5, div_13);
            });
            template_effect(() => set_text(text_5, grp()));
            append($$anchor4, fragment_2);
          });
          append($$anchor3, div_11);
        };
        if_block(node_6, ($$render) => {
          if (get(openRow) === "pattern") $$render(consequent_4);
        });
      }
      var div_14 = sibling(div_10, 2);
      let classes_5;
      var button_5 = child(div_14);
      var span_7 = sibling(child(button_5), 2);
      var text_7 = child(span_7);
      var node_8 = sibling(span_7, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var button_6 = root_11$3();
          delegated("click", button_6, (e) => {
            e.stopPropagation();
            clearRow("material");
          });
          append($$anchor3, button_6);
        };
        if_block(node_8, ($$render) => {
          if (get(material)) $$render(consequent_5);
        });
      }
      var node_9 = sibling(button_5, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var div_15 = root_12$3();
          var div_16 = child(div_15);
          let classes_6;
          var node_10 = sibling(div_16, 2);
          each(node_10, 17, () => {
            var _a2;
            return ((_a2 = get(data)) == null ? void 0 : _a2.materials) || [];
          }, index, ($$anchor4, m) => {
            var div_17 = root_13$3();
            let classes_7;
            var span_8 = sibling(child(div_17), 2);
            var text_8 = child(span_8);
            template_effect(() => {
              classes_7 = set_class(div_17, 1, "pcr-atb2-cust-popitem svelte-1mwxie1", null, classes_7, { active: get(m).tag === get(material) });
              set_text(text_8, get(m).display);
            });
            delegated("click", div_17, () => pickRow("material", get(m).tag));
            append($$anchor4, div_17);
          });
          template_effect(() => classes_6 = set_class(div_16, 1, "pcr-atb2-cust-popitem svelte-1mwxie1", null, classes_6, { active: !get(material) }));
          delegated("click", div_16, () => pickRow("material", ""));
          append($$anchor3, div_15);
        };
        if_block(node_9, ($$render) => {
          if (get(openRow) === "material") $$render(consequent_6);
        });
      }
      var div_18 = sibling(div_14, 2);
      let classes_8;
      var button_7 = child(div_18);
      var span_9 = sibling(child(button_7), 2);
      var text_9 = child(span_9);
      var node_11 = sibling(span_9, 2);
      {
        var consequent_7 = ($$anchor3) => {
          var button_8 = root_14$3();
          delegated("click", button_8, (e) => {
            e.stopPropagation();
            clearRow("condition");
          });
          append($$anchor3, button_8);
        };
        if_block(node_11, ($$render) => {
          if (get(condition) && get(condition) !== "default") $$render(consequent_7);
        });
      }
      var node_12 = sibling(button_7, 2);
      {
        var consequent_8 = ($$anchor3) => {
          var div_19 = root_15$3();
          each(div_19, 21, () => get(conditionGroups), index, ($$anchor4, $$item) => {
            var $$array_2 = user_derived(() => to_array(get($$item), 2));
            let grp = () => get($$array_2)[0];
            let conditions = () => get($$array_2)[1];
            var fragment_3 = root_16$2();
            var div_20 = first_child(fragment_3);
            var text_10 = child(div_20);
            var node_13 = sibling(div_20, 2);
            each(node_13, 17, conditions, index, ($$anchor5, c) => {
              var div_21 = root_17$2();
              let classes_9;
              var span_10 = sibling(child(div_21), 2);
              var text_11 = child(span_10);
              template_effect(() => {
                classes_9 = set_class(div_21, 1, "pcr-atb2-cust-popitem svelte-1mwxie1", null, classes_9, { active: get(c).tag === get(condition) });
                set_text(text_11, get(c).display);
              });
              delegated("click", div_21, () => pickRow("condition", get(c).tag));
              append($$anchor5, div_21);
            });
            template_effect(() => set_text(text_10, grp()));
            append($$anchor4, fragment_3);
          });
          append($$anchor3, div_19);
        };
        if_block(node_12, ($$render) => {
          if (get(openRow) === "condition") $$render(consequent_8);
        });
      }
      var label = sibling(div_18, 2);
      let classes_10;
      var input = child(label);
      var span_11 = sibling(input, 4);
      var text_12 = child(span_11);
      var div_22 = sibling(label, 2);
      var div_23 = sibling(child(div_22), 2);
      var text_13 = child(div_23);
      var div_24 = sibling(div_4, 2);
      var button_9 = child(div_24);
      var button_10 = sibling(button_9, 2);
      template_effect(
        ($0) => {
          var _a2, _b2, _c2, _d2;
          classes = set_class(div_5, 1, "pcr-atb2-cust-row svelte-1mwxie1", null, classes, { open: get(openRow) === "color" });
          set_style(span_1, `background:${$0 ?? ""}`);
          set_text(text_1, ((_a2 = get(colorOpt)) == null ? void 0 : _a2.display) || "Color");
          classes_3 = set_class(div_10, 1, "pcr-atb2-cust-row svelte-1mwxie1", null, classes_3, { open: get(openRow) === "pattern" });
          set_text(text_4, ((_b2 = get(patternOpt)) == null ? void 0 : _b2.display) || "Solid / None");
          classes_5 = set_class(div_14, 1, "pcr-atb2-cust-row svelte-1mwxie1", null, classes_5, { open: get(openRow) === "material" });
          set_text(text_7, ((_c2 = get(materialOpt)) == null ? void 0 : _c2.display) || "Material");
          classes_8 = set_class(div_18, 1, "pcr-atb2-cust-row svelte-1mwxie1", null, classes_8, { open: get(openRow) === "condition" });
          set_text(text_9, ((_d2 = get(conditionOpt)) == null ? void 0 : _d2.display) || "Default");
          classes_10 = set_class(label, 1, "pcr-atb2-cust-focus svelte-1mwxie1", null, classes_10, { "pcr-atb2-cust-focus-disabled": !isNaturalMode() });
          input.disabled = !isNaturalMode();
          set_text(text_12, isNaturalMode() ? "Camera focuses on this item" : "Natural-language mode only");
          set_text(text_13, get(preview));
        },
        [() => colorSwatch(get(color))]
      );
      delegated("click", button_1, () => set(openRow, get(openRow) === "color" ? null : "color", true));
      delegated("click", button_3, () => set(openRow, get(openRow) === "pattern" ? null : "pattern", true));
      delegated("click", button_5, () => set(openRow, get(openRow) === "material" ? null : "material", true));
      delegated("click", button_7, () => set(openRow, get(openRow) === "condition" ? null : "condition", true));
      bind_checked(input, () => get(focus), ($$value) => set(focus, $$value));
      delegated("click", button_9, function(...$$args) {
        var _a2;
        (_a2 = onCancel()) == null ? void 0 : _a2.apply(this, $$args);
      });
      delegated("click", button_10, handleConfirm);
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(loading)) $$render(consequent);
      else $$render(alternate, -1);
    });
  }
  template_effect(() => set_text(text2, $$props.item.display_name || $$props.item.item_tag));
  delegated("click", div, handleOverlayClick);
  delegated("keydown", div, handleKeydown);
  delegated("click", div_1, (e) => e.stopPropagation());
  delegated("click", button, function(...$$args) {
    var _a2;
    (_a2 = onCancel()) == null ? void 0 : _a2.apply(this, $$args);
  });
  append($$anchor, div);
  pop();
}
delegate(["click", "keydown"]);
var root_2$2 = from_html(`<button class="pcr-atb2-cust-rowclear svelte-ts6bpp" title="Clear">&times;</button>`);
var root_4$2 = from_html(`<div><span class="pcr-atb2-cust-icon-bullet svelte-ts6bpp"></span> <span> </span></div>`);
var root_5$2 = from_html(`<div class="pcr-atb2-cust-popgroup svelte-ts6bpp">No verbs for this item</div>`);
var root_3$1 = from_html(`<div class="pcr-atb2-cust-popover svelte-ts6bpp"><div><span class="pcr-atb2-cust-icon-bullet svelte-ts6bpp"></span> <span>None</span></div> <!> <!></div>`);
var root_1$2 = from_html(`<div><button type="button" class="pcr-atb2-cust-rowbtn svelte-ts6bpp"><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-action svelte-ts6bpp" aria-hidden="true">⤷</span> <span class="pcr-atb2-cust-rowlabel svelte-ts6bpp"> </span> <!> <span class="pcr-atb2-cust-chev svelte-ts6bpp">▾</span></button> <!></div>`);
var root_7$2 = from_html(`<button class="pcr-atb2-cust-rowclear svelte-ts6bpp" title="Clear">&times;</button>`);
var root_9$2 = from_html(`<div><span class="pcr-atb2-cust-icon-bullet svelte-ts6bpp"></span> <span> </span></div>`);
var root_10$2 = from_html(`<div class="pcr-atb2-cust-popgroup svelte-ts6bpp">No materials for this item</div>`);
var root_8$2 = from_html(`<div class="pcr-atb2-cust-popover svelte-ts6bpp"><div><span class="pcr-atb2-cust-icon-bullet svelte-ts6bpp"></span> <span>None</span></div> <!> <!></div>`);
var root_11$2 = from_html(`<button class="pcr-atb2-cust-rowclear svelte-ts6bpp" title="Clear">&times;</button>`);
var root_13$2 = from_html(`<div><span class="pcr-atb2-cust-icon-bullet svelte-ts6bpp"></span> <span> </span></div>`);
var root_12$2 = from_html(`<div class="pcr-atb2-cust-popover svelte-ts6bpp"><div><span class="pcr-atb2-cust-icon-bullet svelte-ts6bpp"></span> <span>Solid / None</span></div> <!></div>`);
var root_14$2 = from_html(`<button class="pcr-atb2-cust-rowclear svelte-ts6bpp" title="Clear">&times;</button>`);
var root_17$1 = from_html(`<div><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color svelte-ts6bpp"></span> <span> </span></div>`);
var root_16$1 = from_html(`<div class="pcr-atb2-cust-popgroup svelte-ts6bpp"> </div> <!>`, 1);
var root_15$2 = from_html(`<div class="pcr-atb2-cust-popover svelte-ts6bpp"><div><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color svelte-ts6bpp" style="background:transparent;border:1px dashed var(--pcr-border)"></span> <span>None</span></div> <!></div>`);
var root_6$2 = from_html(`<div><button type="button" class="pcr-atb2-cust-rowbtn svelte-ts6bpp"><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-material svelte-ts6bpp" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1 5 Q 4 2, 8 5 T 15 5"></path><path d="M1 11 Q 4 8, 8 11 T 15 11"></path></svg></span> <span class="pcr-atb2-cust-rowlabel svelte-ts6bpp"> </span> <!> <span class="pcr-atb2-cust-chev svelte-ts6bpp">▾</span></button> <!></div> <div><button type="button" class="pcr-atb2-cust-rowbtn svelte-ts6bpp"><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-pattern svelte-ts6bpp" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><rect x="0" y="0" width="4" height="4" fill="currentColor"></rect><rect x="8" y="0" width="4" height="4" fill="currentColor"></rect><rect x="4" y="4" width="4" height="4" fill="currentColor"></rect><rect x="12" y="4" width="4" height="4" fill="currentColor"></rect><rect x="0" y="8" width="4" height="4" fill="currentColor"></rect><rect x="8" y="8" width="4" height="4" fill="currentColor"></rect><rect x="4" y="12" width="4" height="4" fill="currentColor"></rect><rect x="12" y="12" width="4" height="4" fill="currentColor"></rect></svg></span> <span class="pcr-atb2-cust-rowlabel svelte-ts6bpp"> </span> <!> <span class="pcr-atb2-cust-chev svelte-ts6bpp">▾</span></button> <!></div> <div><button type="button" class="pcr-atb2-cust-rowbtn svelte-ts6bpp"><span class="pcr-atb2-cust-icon pcr-atb2-cust-icon-color svelte-ts6bpp"></span> <span class="pcr-atb2-cust-rowlabel svelte-ts6bpp"> </span> <!> <span class="pcr-atb2-cust-chev svelte-ts6bpp">▾</span></button> <!></div>`, 1);
var root$1 = from_html(`<div class="pcr-atb2-cust-overlay svelte-ts6bpp"><div class="pcr-atb2-cust-modal svelte-ts6bpp"><div class="pcr-atb2-cust-header svelte-ts6bpp"><span class="pcr-atb2-cust-title svelte-ts6bpp"> <strong class="svelte-ts6bpp"> </strong></span> <button class="pcr-atb2-cust-close svelte-ts6bpp" aria-label="Close">&times;</button></div> <div class="pcr-atb2-cust-body svelte-ts6bpp"><!> <!> <div class="pcr-atb2-cust-preview svelte-ts6bpp"><div class="pcr-atb2-cust-preview-label svelte-ts6bpp">Preview</div> <div class="pcr-atb2-cust-preview-text svelte-ts6bpp"> </div></div></div> <div class="pcr-atb2-cust-footer svelte-ts6bpp"><button class="pcr-atb2-cust-btn pcr-atb2-cust-cancel svelte-ts6bpp">Cancel</button> <button class="pcr-atb2-cust-btn pcr-atb2-cust-ok svelte-ts6bpp"> </button></div></div></div>`);
function FurnitureCustomizer($$anchor, $$props) {
  var _a, _b, _c, _d;
  push($$props, true);
  let actionOverrides = prop($$props, "actionOverrides", 19, () => ({})), contextSubject = prop(
    $$props,
    "contextSubject",
    3,
    null
    // null = scene scope; truthy = subject interaction
  ), initial = prop(
    $$props,
    "initial",
    3,
    null
    // { material, pattern, color, action } when editing
  ), isNaturalMode = prop(
    $$props,
    "isNaturalMode",
    3,
    false
    // current output mode — preview shows tag vs natlang form to match emit
  ), onConfirm = prop($$props, "onConfirm", 3, () => {
  }), onCancel = prop($$props, "onCancel", 3, () => {
  });
  let material = state(proxy(((_a = initial()) == null ? void 0 : _a.material) || ""));
  let pattern = state(proxy(((_b = initial()) == null ? void 0 : _b.pattern) || ""));
  let color = state(proxy(((_c = initial()) == null ? void 0 : _c.color) || ""));
  let action2 = state(proxy(((_d = initial()) == null ? void 0 : _d.action) || ""));
  let openRow = state(null);
  let previewTag = state("");
  let previewNat = state("");
  let assembling = state(true);
  let isCustomizable = user_derived(() => {
    var _a2;
    return !!((_a2 = $$props.item) == null ? void 0 : _a2.is_customizable);
  });
  let validActions = user_derived(() => {
    var _a2;
    if (!$$props.item) return [];
    const override = (_a2 = actionOverrides()) == null ? void 0 : _a2[$$props.item.item_tag];
    const cat = $$props.item.item_group || "";
    return ($$props.actions || []).filter((a) => {
      if (Array.isArray(override) && override.length) return override.includes(a.action_tag);
      const cc = a.compatible_categories;
      return Array.isArray(cc) ? cc.includes(cat) : false;
    });
  });
  let validMaterials = user_derived(() => {
    var _a2;
    if (!get(isCustomizable)) return [];
    const sub = ((_a2 = $$props.item) == null ? void 0 : _a2.subCategory) || "";
    if (!sub) return [];
    return ($$props.materials || []).filter((m) => {
      const cc = (m.compatible_categories || "").split(",").map((s) => s.trim());
      return cc.includes(sub);
    });
  });
  let materialOpt = user_derived(() => (get(validMaterials) || []).find((m) => m.tag === get(material)) || null);
  let patternEnabled = user_derived(() => !!get(materialOpt) && (get(materialOpt).supports_patterns === 1 || get(materialOpt).supports_patterns === true));
  let patternOpt = user_derived(() => ($$props.patterns || []).find((p) => p.tag === get(pattern)) || null);
  let colorOpt = user_derived(() => ($$props.colors || []).find((c) => c.tag === get(color)) || null);
  let actionOpt = user_derived(() => (get(validActions) || []).find((a) => a.action_tag === get(action2)) || null);
  let colorGroups = user_derived(() => {
    const groups = {};
    for (const c of $$props.colors || []) {
      if (!groups[c.color_group]) groups[c.color_group] = [];
      groups[c.color_group].push(c);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a.toLowerCase() === "neutral") return -1;
      if (b.toLowerCase() === "neutral") return 1;
      return a.localeCompare(b);
    });
  });
  user_effect(() => {
    if (!get(patternEnabled) && get(pattern) && get(pattern) !== "solid") set(pattern, "");
  });
  user_effect(() => {
    get(material);
    get(pattern);
    get(color);
    get(action2);
    refreshPreview();
  });
  async function refreshPreview() {
    if (!$$props.item) return;
    set(assembling, true);
    try {
      const body = { prop: $$props.item.item_tag };
      if (get(material)) body.material = get(material);
      if (get(pattern) && get(pattern) !== "solid") body.pattern = get(pattern);
      if (get(color)) body.color = get(color);
      if (contextSubject() && get(action2)) body.action = get(action2);
      const res = await fetch("/promptchain/props/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        set(previewTag, data.tags || "", true);
        set(previewNat, data.natlang || "", true);
      }
    } catch (e) {
      console.error("[FurnitureCustomizer] preview error", e);
    } finally {
      set(assembling, false);
    }
  }
  function pickRow(row, value) {
    if (row === "material") set(material, value, true);
    else if (row === "pattern") set(pattern, value, true);
    else if (row === "color") set(color, value, true);
    else if (row === "action") set(action2, value, true);
    set(openRow, null);
  }
  function clearRow(row) {
    if (row === "material") set(material, "");
    else if (row === "pattern") set(pattern, "");
    else if (row === "color") set(color, "");
    else if (row === "action") set(action2, "");
  }
  const COLOR_HEX = {
    burgundy: "#800020",
    wine: "#722f37",
    rose: "#ff66cc",
    blush: "#de5d83",
    coral: "#ff7f50",
    salmon: "#fa8072",
    peach: "#ffcba4",
    mustard: "#ffdb58",
    olive: "#808000",
    sage: "#9caf88",
    forest: "#228b22",
    mint: "#98ff98",
    teal: "#008080",
    turquoise: "#40e0d0",
    navy: "#000080",
    royal_blue: "#4169e1",
    cobalt: "#0047ab",
    indigo: "#4b0082",
    plum: "#8e4585",
    lavender: "#e6e6fa",
    lilac: "#c8a2c8",
    cream: "#ffe69f",
    beige: "#f5f5dc",
    tan: "#d2b48c",
    khaki: "#c3b091",
    bronze: "#cd7f32",
    copper: "#b87333",
    rust: "#b7410e",
    chocolate: "#7b3f00",
    charcoal: "#36454f",
    brown: "#5d2d19",
    grey: "#636363",
    gray: "#636363",
    crimson: "#dc143c"
  };
  function colorSwatch(tag) {
    if (!tag) return "transparent";
    return COLOR_HEX[tag] || tag;
  }
  function handleConfirm() {
    onConfirm()({
      material: get(material) || null,
      pattern: get(pattern) && get(pattern) !== "solid" ? get(pattern) : null,
      color: get(color) || null,
      action: contextSubject() ? get(action2) || null : null,
      assembled: { tags: get(previewTag), natlang: get(previewNat) },
      parts: {
        materialOpt: get(materialOpt),
        patternOpt: get(patternOpt),
        colorOpt: get(colorOpt),
        actionOpt: get(actionOpt)
      }
    });
  }
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel()();
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel()();
    } else if (e.key === "Enter" && get(openRow) === null) {
      e.stopPropagation();
      handleConfirm();
    }
  }
  var div = root$1();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var span = child(div_2);
  var text2 = child(span);
  var strong = sibling(text2);
  var text_1 = child(strong);
  var button = sibling(span, 2);
  var div_3 = sibling(div_2, 2);
  var node = child(div_3);
  {
    var consequent_3 = ($$anchor2) => {
      var div_4 = root_1$2();
      let classes;
      var button_1 = child(div_4);
      var span_1 = sibling(child(button_1), 2);
      var text_2 = child(span_1);
      var node_1 = sibling(span_1, 2);
      {
        var consequent = ($$anchor3) => {
          var button_2 = root_2$2();
          delegated("click", button_2, (e) => {
            e.stopPropagation();
            clearRow("action");
          });
          append($$anchor3, button_2);
        };
        if_block(node_1, ($$render) => {
          if (get(action2)) $$render(consequent);
        });
      }
      var node_2 = sibling(button_1, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_5 = root_3$1();
          var div_6 = child(div_5);
          let classes_1;
          var node_3 = sibling(div_6, 2);
          each(node_3, 17, () => get(validActions), index, ($$anchor4, a) => {
            var div_7 = root_4$2();
            let classes_2;
            var span_2 = sibling(child(div_7), 2);
            var text_3 = child(span_2);
            template_effect(() => {
              classes_2 = set_class(div_7, 1, "pcr-atb2-cust-popitem svelte-ts6bpp", null, classes_2, { active: get(a).action_tag === get(action2) });
              set_text(text_3, get(a).display_name);
            });
            delegated("click", div_7, () => pickRow("action", get(a).action_tag));
            append($$anchor4, div_7);
          });
          var node_4 = sibling(node_3, 2);
          {
            var consequent_1 = ($$anchor4) => {
              var div_8 = root_5$2();
              append($$anchor4, div_8);
            };
            if_block(node_4, ($$render) => {
              if (!get(validActions).length) $$render(consequent_1);
            });
          }
          template_effect(() => classes_1 = set_class(div_6, 1, "pcr-atb2-cust-popitem svelte-ts6bpp", null, classes_1, { active: !get(action2) }));
          delegated("click", div_6, () => pickRow("action", ""));
          append($$anchor3, div_5);
        };
        if_block(node_2, ($$render) => {
          if (get(openRow) === "action") $$render(consequent_2);
        });
      }
      template_effect(() => {
        var _a2;
        classes = set_class(div_4, 1, "pcr-atb2-cust-row svelte-ts6bpp", null, classes, { open: get(openRow) === "action" });
        set_text(text_2, ((_a2 = get(actionOpt)) == null ? void 0 : _a2.display_name) || "Verb (e.g. sitting on…)");
      });
      delegated("click", button_1, () => set(openRow, get(openRow) === "action" ? null : "action", true));
      append($$anchor2, div_4);
    };
    if_block(node, ($$render) => {
      if (contextSubject()) $$render(consequent_3);
    });
  }
  var node_5 = sibling(node, 2);
  {
    var consequent_11 = ($$anchor2) => {
      var fragment = root_6$2();
      var div_9 = first_child(fragment);
      let classes_3;
      var button_3 = child(div_9);
      var span_3 = sibling(child(button_3), 2);
      var text_4 = child(span_3);
      var node_6 = sibling(span_3, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var button_4 = root_7$2();
          delegated("click", button_4, (e) => {
            e.stopPropagation();
            clearRow("material");
          });
          append($$anchor3, button_4);
        };
        if_block(node_6, ($$render) => {
          if (get(material)) $$render(consequent_4);
        });
      }
      var node_7 = sibling(button_3, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var div_10 = root_8$2();
          var div_11 = child(div_10);
          let classes_4;
          var node_8 = sibling(div_11, 2);
          each(node_8, 17, () => get(validMaterials), index, ($$anchor4, m) => {
            var div_12 = root_9$2();
            let classes_5;
            var span_4 = sibling(child(div_12), 2);
            var text_5 = child(span_4);
            template_effect(() => {
              classes_5 = set_class(div_12, 1, "pcr-atb2-cust-popitem svelte-ts6bpp", null, classes_5, { active: get(m).tag === get(material) });
              set_text(text_5, get(m).display);
            });
            delegated("click", div_12, () => pickRow("material", get(m).tag));
            append($$anchor4, div_12);
          });
          var node_9 = sibling(node_8, 2);
          {
            var consequent_5 = ($$anchor4) => {
              var div_13 = root_10$2();
              append($$anchor4, div_13);
            };
            if_block(node_9, ($$render) => {
              if (!get(validMaterials).length) $$render(consequent_5);
            });
          }
          template_effect(() => classes_4 = set_class(div_11, 1, "pcr-atb2-cust-popitem svelte-ts6bpp", null, classes_4, { active: !get(material) }));
          delegated("click", div_11, () => pickRow("material", ""));
          append($$anchor3, div_10);
        };
        if_block(node_7, ($$render) => {
          if (get(openRow) === "material") $$render(consequent_6);
        });
      }
      var div_14 = sibling(div_9, 2);
      let classes_6;
      var button_5 = child(div_14);
      var span_5 = sibling(child(button_5), 2);
      var text_6 = child(span_5);
      var node_10 = sibling(span_5, 2);
      {
        var consequent_7 = ($$anchor3) => {
          var button_6 = root_11$2();
          delegated("click", button_6, (e) => {
            e.stopPropagation();
            clearRow("pattern");
          });
          append($$anchor3, button_6);
        };
        if_block(node_10, ($$render) => {
          if (get(pattern) && get(pattern) !== "solid") $$render(consequent_7);
        });
      }
      var node_11 = sibling(button_5, 2);
      {
        var consequent_8 = ($$anchor3) => {
          var div_15 = root_12$2();
          var div_16 = child(div_15);
          let classes_7;
          var node_12 = sibling(div_16, 2);
          each(node_12, 17, () => ($$props.patterns || []).filter((p) => p.tag !== "solid"), index, ($$anchor4, p) => {
            var div_17 = root_13$2();
            let classes_8;
            var span_6 = sibling(child(div_17), 2);
            var text_7 = child(span_6);
            template_effect(() => {
              classes_8 = set_class(div_17, 1, "pcr-atb2-cust-popitem svelte-ts6bpp", null, classes_8, { active: get(p).tag === get(pattern) });
              set_text(text_7, get(p).display);
            });
            delegated("click", div_17, () => pickRow("pattern", get(p).tag));
            append($$anchor4, div_17);
          });
          template_effect(() => classes_7 = set_class(div_16, 1, "pcr-atb2-cust-popitem svelte-ts6bpp", null, classes_7, { active: !get(pattern) || get(pattern) === "solid" }));
          delegated("click", div_16, () => pickRow("pattern", "solid"));
          append($$anchor3, div_15);
        };
        if_block(node_11, ($$render) => {
          if (get(openRow) === "pattern") $$render(consequent_8);
        });
      }
      var div_18 = sibling(div_14, 2);
      let classes_9;
      var button_7 = child(div_18);
      var span_7 = child(button_7);
      var span_8 = sibling(span_7, 2);
      var text_8 = child(span_8);
      var node_13 = sibling(span_8, 2);
      {
        var consequent_9 = ($$anchor3) => {
          var button_8 = root_14$2();
          delegated("click", button_8, (e) => {
            e.stopPropagation();
            clearRow("color");
          });
          append($$anchor3, button_8);
        };
        if_block(node_13, ($$render) => {
          if (get(color)) $$render(consequent_9);
        });
      }
      var node_14 = sibling(button_7, 2);
      {
        var consequent_10 = ($$anchor3) => {
          var div_19 = root_15$2();
          var div_20 = child(div_19);
          let classes_10;
          var node_15 = sibling(div_20, 2);
          each(node_15, 17, () => get(colorGroups), index, ($$anchor4, $$item) => {
            var $$array = user_derived(() => to_array(get($$item), 2));
            let grp = () => get($$array)[0];
            let list = () => get($$array)[1];
            var fragment_1 = root_16$1();
            var div_21 = first_child(fragment_1);
            var text_9 = child(div_21);
            var node_16 = sibling(div_21, 2);
            each(node_16, 17, list, index, ($$anchor5, c) => {
              var div_22 = root_17$1();
              let classes_11;
              var span_9 = child(div_22);
              var span_10 = sibling(span_9, 2);
              var text_10 = child(span_10);
              template_effect(
                ($0) => {
                  classes_11 = set_class(div_22, 1, "pcr-atb2-cust-popitem svelte-ts6bpp", null, classes_11, { active: get(c).tag === get(color) });
                  set_style(span_9, `background:${$0 ?? ""}`);
                  set_text(text_10, get(c).display);
                },
                [() => colorSwatch(get(c).tag)]
              );
              delegated("click", div_22, () => pickRow("color", get(c).tag));
              append($$anchor5, div_22);
            });
            template_effect(() => set_text(text_9, grp()));
            append($$anchor4, fragment_1);
          });
          template_effect(() => classes_10 = set_class(div_20, 1, "pcr-atb2-cust-popitem svelte-ts6bpp", null, classes_10, { active: !get(color) }));
          delegated("click", div_20, () => pickRow("color", ""));
          append($$anchor3, div_19);
        };
        if_block(node_14, ($$render) => {
          if (get(openRow) === "color") $$render(consequent_10);
        });
      }
      template_effect(
        ($0) => {
          var _a2, _b2, _c2;
          classes_3 = set_class(div_9, 1, "pcr-atb2-cust-row svelte-ts6bpp", null, classes_3, { open: get(openRow) === "material" });
          set_text(text_4, ((_a2 = get(materialOpt)) == null ? void 0 : _a2.display) || "Material");
          classes_6 = set_class(div_14, 1, "pcr-atb2-cust-row svelte-ts6bpp", null, classes_6, { open: get(openRow) === "pattern" });
          button_5.disabled = !get(patternEnabled);
          set_text(text_6, ((_b2 = get(patternOpt)) == null ? void 0 : _b2.display) || (get(patternEnabled) ? "Solid / None" : "Pick a material first"));
          classes_9 = set_class(div_18, 1, "pcr-atb2-cust-row svelte-ts6bpp", null, classes_9, { open: get(openRow) === "color" });
          set_style(span_7, `background:${$0 ?? ""}`);
          set_text(text_8, ((_c2 = get(colorOpt)) == null ? void 0 : _c2.display) || "Color");
        },
        [() => colorSwatch(get(color))]
      );
      delegated("click", button_3, () => set(openRow, get(openRow) === "material" ? null : "material", true));
      delegated("click", button_5, () => {
        if (get(patternEnabled)) set(openRow, get(openRow) === "pattern" ? null : "pattern", true);
      });
      delegated("click", button_7, () => set(openRow, get(openRow) === "color" ? null : "color", true));
      append($$anchor2, fragment);
    };
    if_block(node_5, ($$render) => {
      if (get(isCustomizable)) $$render(consequent_11);
    });
  }
  var div_23 = sibling(node_5, 2);
  var div_24 = sibling(child(div_23), 2);
  var text_11 = child(div_24);
  var div_25 = sibling(div_3, 2);
  var button_9 = child(div_25);
  var button_10 = sibling(button_9, 2);
  var text_12 = child(button_10);
  template_effect(
    ($0) => {
      set_text(text2, `${contextSubject() ? `${contextSubject().name} interacts with` : "Scene"} `);
      set_text(text_1, $$props.item.display_name || $$props.item.item_tag);
      set_text(text_11, $0);
      button_10.disabled = get(assembling);
      set_text(text_12, contextSubject() && get(action2) ? "Add Interaction" : "Add to Scene");
    },
    [
      () => isNaturalMode() ? get(previewNat) || get(previewTag) || ($$props.item.display_name || $$props.item.item_tag).toLowerCase() : get(previewTag) || get(previewNat) || ($$props.item.display_name || $$props.item.item_tag).toLowerCase()
    ]
  );
  delegated("click", div, handleOverlayClick);
  delegated("keydown", div, handleKeydown);
  delegated("click", div_1, (e) => e.stopPropagation());
  delegated("click", button, function(...$$args) {
    var _a2;
    (_a2 = onCancel()) == null ? void 0 : _a2.apply(this, $$args);
  });
  delegated("click", button_9, function(...$$args) {
    var _a2;
    (_a2 = onCancel()) == null ? void 0 : _a2.apply(this, $$args);
  });
  delegated("click", button_10, handleConfirm);
  append($$anchor, div);
  pop();
}
delegate(["click", "keydown"]);
var root_1$1 = from_html(`<div class="pcr-atb2-fc-empty svelte-20btvh">Loading…</div>`);
var root_4$1 = from_html(`<button class="pcr-atb2-fc-rowclear svelte-20btvh" title="Clear">&times;</button>`);
var root_6$1 = from_html(`<div><span class="pcr-atb2-fc-icon-bullet svelte-20btvh"></span> <span> </span></div>`);
var root_5$1 = from_html(`<div class="pcr-atb2-fc-popover svelte-20btvh"><div><span class="pcr-atb2-fc-icon-bullet svelte-20btvh"></span> <span>None</span></div> <!></div>`);
var root_3 = from_html(`<div><button type="button" class="pcr-atb2-fc-rowbtn svelte-20btvh"><span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-shape svelte-20btvh" aria-hidden="true">◇</span> <span class="pcr-atb2-fc-rowlabel svelte-20btvh"> </span> <!> <span class="pcr-atb2-fc-chev svelte-20btvh">▾</span></button> <!></div>`);
var root_8$1 = from_html(`<button class="pcr-atb2-fc-rowclear svelte-20btvh" title="Clear">&times;</button>`);
var root_10$1 = from_html(`<div><span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-color svelte-20btvh"></span> <span> </span></div>`);
var root_9$1 = from_html(`<div class="pcr-atb2-fc-popover svelte-20btvh"><div><span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-color svelte-20btvh" style="background:transparent;border:1px dashed var(--pcr-border)"></span> <span>None</span></div> <!></div>`);
var root_7$1 = from_html(`<div><button type="button" class="pcr-atb2-fc-rowbtn svelte-20btvh"><span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-color svelte-20btvh"></span> <span class="pcr-atb2-fc-rowlabel svelte-20btvh"> </span> <!> <span class="pcr-atb2-fc-chev svelte-20btvh">▾</span></button> <!></div>`);
var root_12$1 = from_html(`<button class="pcr-atb2-fc-rowclear svelte-20btvh" title="Clear">&times;</button>`);
var root_14$1 = from_html(`<div><span class="pcr-atb2-fc-icon-bullet svelte-20btvh"></span> <span> </span></div>`);
var root_13$1 = from_html(`<div class="pcr-atb2-fc-popover svelte-20btvh"><div><span class="pcr-atb2-fc-icon-bullet svelte-20btvh"></span> <span>None</span></div> <!></div>`);
var root_11$1 = from_html(`<div><button type="button" class="pcr-atb2-fc-rowbtn svelte-20btvh"><span class="pcr-atb2-fc-icon pcr-atb2-fc-icon-type svelte-20btvh" aria-hidden="true">✦</span> <span class="pcr-atb2-fc-rowlabel svelte-20btvh"> </span> <!> <span class="pcr-atb2-fc-chev svelte-20btvh">▾</span></button> <!></div>`);
var root_15$1 = from_html(`<div class="pcr-atb2-fc-empty svelte-20btvh">No modifiers available for this feature.</div>`);
var root_2$1 = from_html(`<!> <!> <!> <!> <div class="pcr-atb2-fc-preview svelte-20btvh"><div class="pcr-atb2-fc-preview-label svelte-20btvh">Preview</div> <div class="pcr-atb2-fc-preview-text svelte-20btvh"> </div></div>`, 1);
var root = from_html(`<div class="pcr-atb2-fc-overlay svelte-20btvh"><div class="pcr-atb2-fc-modal svelte-20btvh"><div class="pcr-atb2-fc-header svelte-20btvh"><span class="pcr-atb2-fc-title svelte-20btvh">Customize <strong class="svelte-20btvh"> </strong></span> <button class="pcr-atb2-fc-close svelte-20btvh" aria-label="Close">&times;</button></div> <div class="pcr-atb2-fc-body svelte-20btvh"><!></div> <div class="pcr-atb2-fc-footer svelte-20btvh"><button class="pcr-atb2-fc-btn pcr-atb2-fc-cancel svelte-20btvh">Cancel</button> <button class="pcr-atb2-fc-btn pcr-atb2-fc-ok svelte-20btvh">Apply</button></div></div></div>`);
function FantasyCustomizer($$anchor, $$props) {
  var _a, _b, _c;
  push($$props, true);
  let data = prop(
    $$props,
    "data",
    3,
    null
    // { shapes, colors, types } — when null, self-fetches
  ), initial = prop(
    $$props,
    "initial",
    3,
    null
    // { shape, color, type } when re-editing
  );
  prop(
    $$props,
    "isNaturalMode",
    3,
    false
    // current output mode (declared so the parent can pass it through)
  );
  let onConfirm = prop($$props, "onConfirm", 3, () => {
  }), onCancel = prop($$props, "onCancel", 3, () => {
  });
  let fetched = state(null);
  let loading = state(!data());
  let vocab = user_derived(() => data() || get(fetched));
  user_effect(() => {
    if (data() || get(fetched)) return;
    (async () => {
      try {
        const res = await fetch("/promptchain/fantasy/customizer-data");
        set(
          fetched,
          res.ok ? await res.json() : { shapes: [], colors: [], types: [] },
          true
        );
      } catch {
        set(fetched, { shapes: [], colors: [], types: [] }, true);
      }
      set(loading, false);
    })();
  });
  let shape = state(proxy(((_a = initial()) == null ? void 0 : _a.shape) || ""));
  let color = state(proxy(((_b = initial()) == null ? void 0 : _b.color) || ""));
  let type = state(proxy(((_c = initial()) == null ? void 0 : _c.type) || ""));
  let openRow = state(null);
  let featureTag = user_derived(() => {
    var _a2;
    return (((_a2 = $$props.item) == null ? void 0 : _a2.item_tag) || "").toLowerCase();
  });
  let filteredShapes = user_derived(() => {
    var _a2;
    return (((_a2 = get(vocab)) == null ? void 0 : _a2.shapes) || []).filter((s) => !get(featureTag).includes(s.tag.toLowerCase()));
  });
  let filteredColors = user_derived(() => {
    var _a2;
    return (((_a2 = get(vocab)) == null ? void 0 : _a2.colors) || []).filter((c) => !get(featureTag).includes(c.tag.toLowerCase()));
  });
  let filteredTypes = user_derived(() => {
    var _a2;
    return (((_a2 = get(vocab)) == null ? void 0 : _a2.types) || []).filter((t) => !get(featureTag).includes(t.tag.toLowerCase()));
  });
  let shapeOpt = user_derived(() => {
    var _a2;
    return (((_a2 = get(vocab)) == null ? void 0 : _a2.shapes) || []).find((s) => s.tag === get(shape)) || null;
  });
  let colorOpt = user_derived(() => {
    var _a2;
    return (((_a2 = get(vocab)) == null ? void 0 : _a2.colors) || []).find((c) => c.tag === get(color)) || null;
  });
  let typeOpt = user_derived(() => {
    var _a2;
    return (((_a2 = get(vocab)) == null ? void 0 : _a2.types) || []).find((t) => t.tag === get(type)) || null;
  });
  const COLOR_HEX = {
    burgundy: "#800020",
    wine: "#722f37",
    rose: "#ff66cc",
    blush: "#de5d83",
    coral: "#ff7f50",
    salmon: "#fa8072",
    peach: "#ffcba4",
    mustard: "#ffdb58",
    olive: "#808000",
    sage: "#9caf88",
    forest: "#228b22",
    mint: "#98ff98",
    teal: "#008080",
    turquoise: "#40e0d0",
    navy: "#000080",
    royal: "#4169e1",
    cobalt: "#0047ab",
    indigo: "#4b0082",
    plum: "#8e4585",
    lavender: "#e6e6fa",
    lilac: "#c8a2c8",
    cream: "#ffe69f",
    beige: "#f5f5dc",
    tan: "#d2b48c",
    khaki: "#c3b091",
    bronze: "#cd7f32",
    copper: "#b87333",
    rust: "#b7410e",
    chocolate: "#7b3f00",
    charcoal: "#36454f",
    brown: "#5d2d19",
    grey: "#636363",
    gray: "#636363",
    multicolored: "linear-gradient(90deg,#ff5,#5f5,#5ff,#55f,#f5f)",
    gradient: "linear-gradient(90deg,#7c3aed,#22d3ee)",
    "two-tone": "linear-gradient(90deg,#000 50%,#fff 50%)",
    striped: "repeating-linear-gradient(45deg,#444 0 4px,#888 4px 8px)"
  };
  function colorSwatch(tag) {
    if (!tag) return "transparent";
    return COLOR_HEX[tag] || tag;
  }
  let preview = user_derived(() => {
    var _a2, _b2, _c2, _d, _e;
    const parts = [];
    if ((_a2 = get(shapeOpt)) == null ? void 0 : _a2.base_tags) parts.push(get(shapeOpt).base_tags.split(",")[0].trim());
    if ((_b2 = get(colorOpt)) == null ? void 0 : _b2.base_tags) parts.push(get(colorOpt).base_tags.split(",")[0].trim());
    if ((_c2 = get(typeOpt)) == null ? void 0 : _c2.base_tags) parts.push(get(typeOpt).base_tags.split(",")[0].trim());
    parts.push((((_d = $$props.item) == null ? void 0 : _d.display_name) || ((_e = $$props.item) == null ? void 0 : _e.item_tag) || "").toLowerCase());
    return parts.join(" ");
  });
  let isCustomized = user_derived(() => !!get(shape) || !!get(color) || !!get(type));
  function pickRow(row, value) {
    if (row === "shape") set(shape, value, true);
    else if (row === "color") set(color, value, true);
    else if (row === "type") set(type, value, true);
    set(openRow, null);
  }
  function clearRow(row) {
    if (row === "shape") set(shape, "");
    else if (row === "color") set(color, "");
    else if (row === "type") set(type, "");
  }
  function handleConfirm() {
    onConfirm()({
      modifiers: get(isCustomized) ? {
        shape: get(shape) || null,
        color: get(color) || null,
        type: get(type) || null
      } : null
    });
  }
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel()();
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel()();
    } else if (e.key === "Enter" && get(openRow) === null) {
      e.stopPropagation();
      handleConfirm();
    }
  }
  var div = root();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var span = child(div_2);
  var strong = sibling(child(span));
  var text2 = child(strong);
  var button = sibling(span, 2);
  var div_3 = sibling(div_2, 2);
  var node = child(div_3);
  {
    var consequent = ($$anchor2) => {
      var div_4 = root_1$1();
      append($$anchor2, div_4);
    };
    var alternate = ($$anchor2) => {
      var fragment = root_2$1();
      var node_1 = first_child(fragment);
      {
        var consequent_3 = ($$anchor3) => {
          var div_5 = root_3();
          let classes;
          var button_1 = child(div_5);
          var span_1 = sibling(child(button_1), 2);
          var text_1 = child(span_1);
          var node_2 = sibling(span_1, 2);
          {
            var consequent_1 = ($$anchor4) => {
              var button_2 = root_4$1();
              delegated("click", button_2, (e) => {
                e.stopPropagation();
                clearRow("shape");
              });
              append($$anchor4, button_2);
            };
            if_block(node_2, ($$render) => {
              if (get(shape)) $$render(consequent_1);
            });
          }
          var node_3 = sibling(button_1, 2);
          {
            var consequent_2 = ($$anchor4) => {
              var div_6 = root_5$1();
              var div_7 = child(div_6);
              let classes_1;
              var node_4 = sibling(div_7, 2);
              each(node_4, 17, () => get(filteredShapes), index, ($$anchor5, s) => {
                var div_8 = root_6$1();
                let classes_2;
                var span_2 = sibling(child(div_8), 2);
                var text_2 = child(span_2);
                template_effect(() => {
                  classes_2 = set_class(div_8, 1, "pcr-atb2-fc-popitem svelte-20btvh", null, classes_2, { active: get(s).tag === get(shape) });
                  set_text(text_2, get(s).display);
                });
                delegated("click", div_8, () => pickRow("shape", get(s).tag));
                append($$anchor5, div_8);
              });
              template_effect(() => classes_1 = set_class(div_7, 1, "pcr-atb2-fc-popitem svelte-20btvh", null, classes_1, { active: !get(shape) }));
              delegated("click", div_7, () => pickRow("shape", ""));
              append($$anchor4, div_6);
            };
            if_block(node_3, ($$render) => {
              if (get(openRow) === "shape") $$render(consequent_2);
            });
          }
          template_effect(() => {
            var _a2;
            classes = set_class(div_5, 1, "pcr-atb2-fc-row svelte-20btvh", null, classes, { open: get(openRow) === "shape" });
            set_text(text_1, ((_a2 = get(shapeOpt)) == null ? void 0 : _a2.display) || "Shape");
          });
          delegated("click", button_1, () => set(openRow, get(openRow) === "shape" ? null : "shape", true));
          append($$anchor3, div_5);
        };
        if_block(node_1, ($$render) => {
          if (get(filteredShapes).length) $$render(consequent_3);
        });
      }
      var node_5 = sibling(node_1, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var div_9 = root_7$1();
          let classes_3;
          var button_3 = child(div_9);
          var span_3 = child(button_3);
          var span_4 = sibling(span_3, 2);
          var text_3 = child(span_4);
          var node_6 = sibling(span_4, 2);
          {
            var consequent_4 = ($$anchor4) => {
              var button_4 = root_8$1();
              delegated("click", button_4, (e) => {
                e.stopPropagation();
                clearRow("color");
              });
              append($$anchor4, button_4);
            };
            if_block(node_6, ($$render) => {
              if (get(color)) $$render(consequent_4);
            });
          }
          var node_7 = sibling(button_3, 2);
          {
            var consequent_5 = ($$anchor4) => {
              var div_10 = root_9$1();
              var div_11 = child(div_10);
              let classes_4;
              var node_8 = sibling(div_11, 2);
              each(node_8, 17, () => get(filteredColors), index, ($$anchor5, c) => {
                var div_12 = root_10$1();
                let classes_5;
                var span_5 = child(div_12);
                var span_6 = sibling(span_5, 2);
                var text_4 = child(span_6);
                template_effect(
                  ($0) => {
                    classes_5 = set_class(div_12, 1, "pcr-atb2-fc-popitem svelte-20btvh", null, classes_5, { active: get(c).tag === get(color) });
                    set_style(span_5, `background:${$0 ?? ""}`);
                    set_text(text_4, get(c).display);
                  },
                  [() => colorSwatch(get(c).tag)]
                );
                delegated("click", div_12, () => pickRow("color", get(c).tag));
                append($$anchor5, div_12);
              });
              template_effect(() => classes_4 = set_class(div_11, 1, "pcr-atb2-fc-popitem svelte-20btvh", null, classes_4, { active: !get(color) }));
              delegated("click", div_11, () => pickRow("color", ""));
              append($$anchor4, div_10);
            };
            if_block(node_7, ($$render) => {
              if (get(openRow) === "color") $$render(consequent_5);
            });
          }
          template_effect(
            ($0) => {
              var _a2;
              classes_3 = set_class(div_9, 1, "pcr-atb2-fc-row svelte-20btvh", null, classes_3, { open: get(openRow) === "color" });
              set_style(span_3, `background:${$0 ?? ""}`);
              set_text(text_3, ((_a2 = get(colorOpt)) == null ? void 0 : _a2.display) || "Color");
            },
            [() => colorSwatch(get(color))]
          );
          delegated("click", button_3, () => set(openRow, get(openRow) === "color" ? null : "color", true));
          append($$anchor3, div_9);
        };
        if_block(node_5, ($$render) => {
          if (get(filteredColors).length) $$render(consequent_6);
        });
      }
      var node_9 = sibling(node_5, 2);
      {
        var consequent_9 = ($$anchor3) => {
          var div_13 = root_11$1();
          let classes_6;
          var button_5 = child(div_13);
          var span_7 = sibling(child(button_5), 2);
          var text_5 = child(span_7);
          var node_10 = sibling(span_7, 2);
          {
            var consequent_7 = ($$anchor4) => {
              var button_6 = root_12$1();
              delegated("click", button_6, (e) => {
                e.stopPropagation();
                clearRow("type");
              });
              append($$anchor4, button_6);
            };
            if_block(node_10, ($$render) => {
              if (get(type)) $$render(consequent_7);
            });
          }
          var node_11 = sibling(button_5, 2);
          {
            var consequent_8 = ($$anchor4) => {
              var div_14 = root_13$1();
              var div_15 = child(div_14);
              let classes_7;
              var node_12 = sibling(div_15, 2);
              each(node_12, 17, () => get(filteredTypes), index, ($$anchor5, t) => {
                var div_16 = root_14$1();
                let classes_8;
                var span_8 = sibling(child(div_16), 2);
                var text_6 = child(span_8);
                template_effect(() => {
                  classes_8 = set_class(div_16, 1, "pcr-atb2-fc-popitem svelte-20btvh", null, classes_8, { active: get(t).tag === get(type) });
                  set_text(text_6, get(t).display);
                });
                delegated("click", div_16, () => pickRow("type", get(t).tag));
                append($$anchor5, div_16);
              });
              template_effect(() => classes_7 = set_class(div_15, 1, "pcr-atb2-fc-popitem svelte-20btvh", null, classes_7, { active: !get(type) }));
              delegated("click", div_15, () => pickRow("type", ""));
              append($$anchor4, div_14);
            };
            if_block(node_11, ($$render) => {
              if (get(openRow) === "type") $$render(consequent_8);
            });
          }
          template_effect(() => {
            var _a2;
            classes_6 = set_class(div_13, 1, "pcr-atb2-fc-row svelte-20btvh", null, classes_6, { open: get(openRow) === "type" });
            set_text(text_5, ((_a2 = get(typeOpt)) == null ? void 0 : _a2.display) || "Type");
          });
          delegated("click", button_5, () => set(openRow, get(openRow) === "type" ? null : "type", true));
          append($$anchor3, div_13);
        };
        if_block(node_9, ($$render) => {
          if (get(filteredTypes).length) $$render(consequent_9);
        });
      }
      var node_13 = sibling(node_9, 2);
      {
        var consequent_10 = ($$anchor3) => {
          var div_17 = root_15$1();
          append($$anchor3, div_17);
        };
        if_block(node_13, ($$render) => {
          if (!get(filteredShapes).length && !get(filteredColors).length && !get(filteredTypes).length) $$render(consequent_10);
        });
      }
      var div_18 = sibling(node_13, 2);
      var div_19 = sibling(child(div_18), 2);
      var text_7 = child(div_19);
      template_effect(() => set_text(text_7, get(preview)));
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(loading) && !get(vocab)) $$render(consequent);
      else $$render(alternate, -1);
    });
  }
  var div_20 = sibling(div_3, 2);
  var button_7 = child(div_20);
  var button_8 = sibling(button_7, 2);
  template_effect(() => set_text(text2, $$props.item.display_name || $$props.item.item_tag));
  delegated("click", div, handleOverlayClick);
  delegated("keydown", div, handleKeydown);
  delegated("click", div_1, (e) => e.stopPropagation());
  delegated("click", button, function(...$$args) {
    var _a2;
    (_a2 = onCancel()) == null ? void 0 : _a2.apply(this, $$args);
  });
  delegated("click", button_7, function(...$$args) {
    var _a2;
    (_a2 = onCancel()) == null ? void 0 : _a2.apply(this, $$args);
  });
  delegated("click", button_8, handleConfirm);
  append($$anchor, div);
  pop();
}
delegate(["click", "keydown"]);
var root_4 = from_html(`<span class="pcr-atb2-rail-count svelte-ibd6yj"> </span>`);
var root_5 = from_html(`<span class="pcr-atb2-rail-count svelte-ibd6yj"> </span>`);
var root_7 = from_html(`<span class="pcr-atb2-rail-count svelte-ibd6yj"> </span>`);
var root_9 = from_html(`<span class="pcr-atb2-rail-count svelte-ibd6yj"> </span>`);
var root_10 = from_html(`<span class="pcr-atb2-rail-count svelte-ibd6yj"> </span>`);
var root_8 = from_html(`<div><span class="pcr-atb2-rail-sub-label svelte-ibd6yj"> </span> <!></div>`);
var root_6 = from_html(`<div class="pcr-atb2-rail-drilldown svelte-ibd6yj"><div><span class="pcr-atb2-rail-sub-label svelte-ibd6yj">All</span> <!></div> <!></div>`);
var root_12 = from_html(`<div><span class="pcr-atb2-rail-sub-label svelte-ibd6yj"> </span> <span class="pcr-atb2-rail-count svelte-ibd6yj"> </span></div>`);
var root_11 = from_html(`<div class="pcr-atb2-rail-drilldown svelte-ibd6yj"><div><span class="pcr-atb2-rail-sub-label svelte-ibd6yj">All</span> <span class="pcr-atb2-rail-count svelte-ibd6yj"> </span></div> <!></div>`);
var root_14 = from_html(`<div><span class="pcr-atb2-rail-sub-label svelte-ibd6yj"> </span> <span class="pcr-atb2-rail-count svelte-ibd6yj"> </span></div>`);
var root_15 = from_html(`<div><span class="pcr-atb2-rail-sub-label svelte-ibd6yj">Modifiers</span> <span class="pcr-atb2-rail-count svelte-ibd6yj"> </span></div>`);
var root_13 = from_html(`<div class="pcr-atb2-rail-drilldown svelte-ibd6yj"><!> <!></div>`);
var root_17 = from_html(`<div><span class="pcr-atb2-rail-sub-label svelte-ibd6yj"> </span> <span class="pcr-atb2-rail-count svelte-ibd6yj"> </span></div>`);
var root_18 = from_html(`<div><span class="pcr-atb2-rail-sub-label svelte-ibd6yj">Modifiers</span> <span class="pcr-atb2-rail-count svelte-ibd6yj"> </span></div>`);
var root_16 = from_html(`<div class="pcr-atb2-rail-drilldown svelte-ibd6yj"><!> <!></div>`);
var root_2 = from_html(`<div><span class="pcr-atb2-rail-icon svelte-ibd6yj"> </span> <span class="pcr-atb2-rail-label svelte-ibd6yj"> </span> <!></div> <!>`, 1);
var root_19 = from_html(`<span class="pcr-atb2-bc-sep svelte-ibd6yj">/</span> <span class="pcr-atb2-bc-group svelte-ibd6yj"> </span>`, 1);
var root_21 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj"> </div>`);
var root_26 = from_html(`<img alt="" loading="lazy" class="svelte-ibd6yj"/>`);
var root_25 = from_html(`<div><!></div>`);
var root_28 = from_html(`<img alt="" loading="lazy" class="svelte-ibd6yj"/>`);
var root_27 = from_html(`<div><!></div>`);
var root_29 = from_html(`<div class="pcr-atb2-card-thumb has-image svelte-ibd6yj"><img alt="" loading="lazy" class="svelte-ibd6yj"/></div>`);
var root_30 = from_html(`<div class="pcr-atb2-card-thumb svelte-ibd6yj"></div>`);
var root_31 = from_html(`<button title="Edit modifiers" aria-label="Edit modifiers"></button>`);
var root_24 = from_html(`<div><!> <div class="pcr-atb2-card-name svelte-ibd6yj"><!> </div></div>`);
var root_23 = from_html(`<div class="pcr-atb2-browser-section svelte-ibd6yj"><div class="pcr-atb2-section-sentinel svelte-ibd6yj"></div> <div class="pcr-atb2-browser-section-header svelte-ibd6yj"><span class="pcr-atb2-browser-section-cat svelte-ibd6yj"> </span> <span class="pcr-atb2-browser-section-sep svelte-ibd6yj">/</span> <span class="pcr-atb2-browser-section-grp svelte-ibd6yj"> </span></div> <div class="pcr-atb2-grid svelte-ibd6yj"></div></div>`);
var root_34 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj">Searching characters…</div>`);
var root_35 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj"> </div>`);
var root_38 = from_html(`<img alt="" loading="lazy" class="svelte-ibd6yj"/>`);
var root_39 = from_html(`<div class="pcr-atb2-card-group svelte-ibd6yj"> </div>`);
var root_37 = from_html(`<div><div><!></div> <div class="pcr-atb2-card-name svelte-ibd6yj"> </div> <!></div>`);
var root_40 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj"> </div>`);
var root_36 = from_html(`<div class="pcr-atb2-grid svelte-ibd6yj"></div> <!>`, 1);
var root_42 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj"> </div>`);
var root_43 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj"> </div>`);
var root_46 = from_html(`<img alt="" loading="lazy" class="svelte-ibd6yj"/>`);
var root_45 = from_html(`<div><div><!></div> <div class="pcr-atb2-card-name svelte-ibd6yj"> </div></div>`);
var root_44 = from_html(`<div class="pcr-atb2-grid svelte-ibd6yj"></div>`);
var root_47 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj">Connect a model to see styles.</div>`);
var root_48 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj">Loading styles…</div>`);
var root_49 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj">No styles found for this model.</div>`);
var root_50 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj"> </div>`);
var root_51 = from_html(`<div class="pcr-atb2-empty svelte-ibd6yj">No items.</div>`);
var root_55 = from_html(`<img alt="" loading="lazy" class="svelte-ibd6yj"/>`);
var root_56 = from_html(`<button title="Edit modifiers" aria-label="Edit modifiers"></button>`);
var root_54 = from_html(`<div><div><!></div> <div class="pcr-atb2-card-name svelte-ibd6yj"><!> </div></div>`);
var root_53 = from_html(`<div class="pcr-atb2-browser-section svelte-ibd6yj"><div class="pcr-atb2-section-sentinel svelte-ibd6yj"></div> <div class="pcr-atb2-browser-section-header svelte-ibd6yj"><span class="pcr-atb2-browser-section-grp svelte-ibd6yj"> </span></div> <div class="pcr-atb2-grid svelte-ibd6yj"></div></div>`);
var root_60 = from_html(`<img alt="" loading="lazy" class="svelte-ibd6yj"/>`);
var root_59 = from_html(`<div><!></div>`);
var root_61 = from_html(`<button title="Edit modifiers" aria-label="Edit modifiers"></button>`);
var root_62 = from_html(`<div class="pcr-atb2-card-group svelte-ibd6yj"> </div>`);
var root_63 = from_html(`<div class="pcr-atb2-card-group svelte-ibd6yj"> </div>`);
var root_58 = from_html(`<div><!> <div class="pcr-atb2-card-name svelte-ibd6yj"><!> </div> <!></div>`);
var root_57 = from_html(`<div class="pcr-atb2-grid svelte-ibd6yj"></div>`);
var root_65 = from_html(`<span class="pcr-atb2-card2-avatar pcr-atb2-card2-avatar-img svelte-ibd6yj"><img alt="" class="svelte-ibd6yj"/></span>`);
var root_66 = from_html(`<span class="pcr-atb2-card2-avatar svelte-ibd6yj"> </span>`);
var root_67 = from_html(`<span class="pcr-atb2-card2-tag svelte-ibd6yj" title="The regional block this subject rebuilds into"> </span>`);
var root_68 = from_html(` <!>`, 1);
var root_71 = from_html(`<button class="pcr-atb2-preset-clear svelte-ibd6yj" title="Unbind identity">&times;</button>`);
var root_72 = from_html(` <!>`, 1);
var root_75 = from_html(`<button class="pcr-atb2-preset-clear svelte-ibd6yj" title="Remove outfit">&times;</button>`);
var root_76 = from_html(` <!>`, 1);
var root_79 = from_html(`<button class="pcr-atb2-preset-clear svelte-ibd6yj" title="Remove pose">&times;</button>`);
var root_82 = from_html(`<span class="pcr-atb2-section-chev svelte-ibd6yj"> </span>`);
var root_83 = from_html(`<div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-label svelte-ibd6yj">Identity</span> <span class="pcr-atb2-slot-value svelte-ibd6yj"><span class="pcr-atb2-chip pcr-atb2-chip-identity pcr-atb2-chip-jumpable svelte-ibd6yj" title="Jump to Subjects"> <button class="pcr-atb2-chip-x svelte-ibd6yj" aria-label="Remove">&times;</button></span></span></div>`);
var root_85 = from_html(`<span class="pcr-atb2-chip pcr-atb2-chip-modifier pcr-atb2-chip-jumpable svelte-ibd6yj" title="Jump to Modifiers"> <button class="pcr-atb2-chip-x svelte-ibd6yj" aria-label="Remove">&times;</button></span>`);
var root_84 = from_html(`<div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-label svelte-ibd6yj">Modifiers</span> <span class="pcr-atb2-slot-value svelte-ibd6yj"><!>  <span class="pcr-atb2-slot-add pcr-atb2-modifier-trigger svelte-ibd6yj">+ add</span></span></div>`);
var root_88 = from_html(`<span class="pcr-atb2-slot-multi svelte-ibd6yj" title="Multi-select">+</span>`);
var root_90 = from_html(`<span></span>`);
var root_89 = from_html(`<span><!>  <span class="pcr-atb2-chip-body svelte-ibd6yj"> </span> <button class="pcr-atb2-chip-x svelte-ibd6yj" aria-label="Clear">&times;</button></span>`);
var root_91 = from_html(`<span class="pcr-atb2-slot-add svelte-ibd6yj">+ add</span>`);
var root_87 = from_html(`<div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-label svelte-ibd6yj"> <!></span> <span class="pcr-atb2-slot-value svelte-ibd6yj"><!> <!></span></div>`);
var root_81 = from_html(`<div class="pcr-atb2-subj-section svelte-ibd6yj"><div><span class="pcr-atb2-subj-section-title svelte-ibd6yj"> </span> <!></div> <!> <!> <!></div>`);
var root_93 = from_html(`<span class="pcr-atb2-chip pcr-atb2-chip-freeform svelte-ibd6yj"> <button class="pcr-atb2-chip-x svelte-ibd6yj" aria-label="Remove">&times;</button></span>`);
var root_92 = from_html(`<div class="pcr-atb2-subj-section svelte-ibd6yj"><div class="pcr-atb2-subj-section-header svelte-ibd6yj"><span class="pcr-atb2-subj-section-title svelte-ibd6yj">Custom / Freeform</span></div> <div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-value svelte-ibd6yj"></span></div></div>`);
var root_96 = from_html(`<span class="pcr-atb2-chip pcr-atb2-chip-freeform svelte-ibd6yj"> <button class="pcr-atb2-chip-x svelte-ibd6yj" aria-label="Remove">&times;</button></span>`);
var root_95 = from_html(`<div class="pcr-atb2-subj-section svelte-ibd6yj"><div class="pcr-atb2-subj-section-header svelte-ibd6yj"><span class="pcr-atb2-subj-section-title svelte-ibd6yj"> </span></div> <div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-value svelte-ibd6yj"></span></div></div>`);
var root_64 = from_html(`<div><div class="pcr-atb2-card2-header svelte-ibd6yj"><!> <input class="pcr-atb2-subject-name svelte-ibd6yj"/> <span class="pcr-atb2-card2-tag svelte-ibd6yj"> </span> <!> <button class="pcr-atb2-card2-delete svelte-ibd6yj" aria-label="Delete subject">&times;</button></div> <div class="pcr-atb2-subj-section svelte-ibd6yj"><div class="pcr-atb2-subj-section-header svelte-ibd6yj">Subject</div> <div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-label svelte-ibd6yj">Identity</span> <span class="pcr-atb2-slot-value svelte-ibd6yj"><span class="pcr-atb2-preset-row svelte-ibd6yj"><button class="pcr-atb2-preset-select pcr-atb2-identity-trigger svelte-ibd6yj" type="button"><span class="pcr-atb2-identity-trigger-label svelte-ibd6yj"><!></span> <span class="pcr-atb2-identity-trigger-chev svelte-ibd6yj">▾</span></button> <!></span></span></div> <div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-label svelte-ibd6yj">Outfit</span> <span class="pcr-atb2-slot-value svelte-ibd6yj"><span class="pcr-atb2-preset-row svelte-ibd6yj"><button class="pcr-atb2-preset-select pcr-atb2-preset-trigger svelte-ibd6yj" type="button"><span class="pcr-atb2-preset-trigger-label svelte-ibd6yj"><!></span> <span class="pcr-atb2-preset-trigger-chev svelte-ibd6yj">▾</span></button> <!></span></span></div> <div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-label svelte-ibd6yj">Pose</span> <span class="pcr-atb2-slot-value svelte-ibd6yj"><span class="pcr-atb2-preset-row svelte-ibd6yj"><button class="pcr-atb2-preset-select pcr-atb2-preset-trigger svelte-ibd6yj" type="button"><span class="pcr-atb2-preset-trigger-label svelte-ibd6yj"><!></span> <span class="pcr-atb2-preset-trigger-chev svelte-ibd6yj">▾</span></button> <!></span></span></div></div> <!> <!> <!></div>`);
var root_99 = from_html(`<span class="pcr-atb2-slot-multi svelte-ibd6yj" title="Multi-select">+</span>`);
var root_100 = from_html(`<span> <button class="pcr-atb2-chip-x svelte-ibd6yj" aria-label="Clear">&times;</button></span>`);
var root_101 = from_html(`<span class="pcr-atb2-slot-add svelte-ibd6yj">+ add</span>`);
var root_98 = from_html(`<div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-label svelte-ibd6yj"> <!></span> <span class="pcr-atb2-slot-value svelte-ibd6yj"><!> <!></span></div>`);
var root_103 = from_html(`<span class="pcr-atb2-chip pcr-atb2-chip-freeform svelte-ibd6yj"> <button class="pcr-atb2-chip-x svelte-ibd6yj" aria-label="Remove">&times;</button></span>`);
var root_102 = from_html(`<div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-label svelte-ibd6yj">Custom / Freeform</span> <span class="pcr-atb2-slot-value svelte-ibd6yj"></span></div>`);
var root_107 = from_html(`<span class="pcr-atb2-chip-cap pcr-atb2-chip-cap-filled svelte-ibd6yj" title="Edit prop"></span>`);
var root_106 = from_html(`<span><!> <span class="pcr-atb2-chip-body svelte-ibd6yj"> </span> <button class="pcr-atb2-chip-x svelte-ibd6yj" aria-label="Clear">&times;</button></span>`);
var root_105 = from_html(`<div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-label svelte-ibd6yj"> <span class="pcr-atb2-slot-multi svelte-ibd6yj" title="Multi-select">+</span></span> <span class="pcr-atb2-slot-value svelte-ibd6yj"></span></div>`);
var root_97 = from_html(`<div><div class="pcr-atb2-card2-header svelte-ibd6yj"><span class="pcr-atb2-card2-avatar pcr-atb2-scene-avatar svelte-ibd6yj">🏠</span> <span class="pcr-atb2-card2-title svelte-ibd6yj">Scene</span> <span class="pcr-atb2-card2-tag svelte-ibd6yj">Shared</span> <button class="pcr-atb2-card2-delete svelte-ibd6yj" aria-label="Delete scene">&times;</button></div> <!> <!> <!></div>`);
var root_108 = from_html(`<div class="pcr-atb2-add-subject pcr-atb2-add-scene svelte-ibd6yj">+ Add Scene</div>`);
var root_110 = from_html(`<span class="pcr-atb2-chip pcr-atb2-chip-style svelte-ibd6yj"> </span>`);
var root_109 = from_html(`<div class="pcr-atb2-card2 pcr-atb2-style-card svelte-ibd6yj"><div class="pcr-atb2-card2-header svelte-ibd6yj"><span class="pcr-atb2-card2-avatar pcr-atb2-style-avatar svelte-ibd6yj">🎨</span>  <span class="pcr-atb2-card2-title pcr-atb2-style-title svelte-ibd6yj" title="Jump to Styles"> </span> <span class="pcr-atb2-card2-tag svelte-ibd6yj">Style</span> <button class="pcr-atb2-card2-delete svelte-ibd6yj" aria-label="Remove style">&times;</button></div> <div class="pcr-atb2-slot svelte-ibd6yj"><span class="pcr-atb2-slot-value svelte-ibd6yj"></span></div></div>`);
var root_111 = from_html(`<div class="pcr-atb2-add-subject pcr-atb2-add-style svelte-ibd6yj">+ Add Style</div>`);
var root_112 = from_html(`<div class="pcr-atb2-qa-overlay svelte-ibd6yj"></div> <div class="pcr-atb2-qa-menu svelte-ibd6yj"><div class="pcr-atb2-qa-menu-title svelte-ibd6yj"> </div> <div class="pcr-atb2-qa-menu-preview svelte-ibd6yj"><div class="pcr-atb2-qa-block svelte-ibd6yj"><div class="pcr-atb2-qa-block-label svelte-ibd6yj">Tag</div> <div class="pcr-atb2-qa-block-value pcr-atb2-qa-block-mono svelte-ibd6yj"> </div></div> <div class="pcr-atb2-qa-block svelte-ibd6yj"><div class="pcr-atb2-qa-block-label svelte-ibd6yj">Natlang</div> <div class="pcr-atb2-qa-block-value svelte-ibd6yj"> </div></div></div> <div class="pcr-atb2-qa-menu-actions svelte-ibd6yj"><button><span class="pcr-atb2-qa-dot pcr-atb2-qa-dot-ready svelte-ibd6yj"></span> Mark Ready</button> <button><span class="pcr-atb2-qa-dot pcr-atb2-qa-dot-unprocessed svelte-ibd6yj"></span> Mark Unprocessed</button> <button><span class="pcr-atb2-qa-dot pcr-atb2-qa-dot-broken svelte-ibd6yj"></span> Mark Broken</button></div></div>`, 1);
var root_114 = from_html(`<div class="pcr-atb2-identity-dd-empty svelte-ibd6yj">Searching…</div>`);
var root_115 = from_html(`<div class="pcr-atb2-identity-dd-empty svelte-ibd6yj">No matches.</div>`);
var root_117 = from_html(`<div class="pcr-atb2-identity-dd-row svelte-ibd6yj"><span class="pcr-atb2-identity-dd-name svelte-ibd6yj"> </span> <span class="pcr-atb2-identity-dd-meta svelte-ibd6yj"><!></span></div>`);
var root_113 = from_html(`<div class="pcr-atb2-identity-dd svelte-ibd6yj"><input class="pcr-atb2-identity-dd-search svelte-ibd6yj" type="text" placeholder="Search subjects…"/> <div class="pcr-atb2-identity-dd-list svelte-ibd6yj"><!></div></div>`);
var root_121 = from_html(`<div class="pcr-atb2-preset-dd-empty svelte-ibd6yj">Loading…</div>`);
var root_122 = from_html(`<div class="pcr-atb2-preset-dd-empty svelte-ibd6yj">No matches.</div>`);
var root_125 = from_html(`<span class="pcr-atb2-preset-dd-star svelte-ibd6yj" title="Canonical for bound character">★</span>`);
var root_124 = from_html(`<div><!> <span class="pcr-atb2-preset-dd-name svelte-ibd6yj"> </span> <span class="pcr-atb2-preset-dd-meta svelte-ibd6yj"> </span></div>`);
var root_120 = from_html(`<div class="pcr-atb2-preset-dd svelte-ibd6yj"><input class="pcr-atb2-preset-dd-search svelte-ibd6yj" type="text"/> <div class="pcr-atb2-preset-dd-list svelte-ibd6yj"><!></div></div>`);
var root_127 = from_html(`<div><span class="pcr-atb2-modifier-dd-check svelte-ibd6yj"> </span> <span class="pcr-atb2-modifier-dd-name svelte-ibd6yj"> </span></div>`);
var root_126 = from_html(`<div class="pcr-atb2-modifier-dd svelte-ibd6yj"><div class="pcr-atb2-modifier-dd-list svelte-ibd6yj"></div></div>`);
var root_128 = from_html(`<div class="pcr-atb2-modal-backdrop svelte-ibd6yj"><div class="pcr-atb2-modal svelte-ibd6yj"><div class="pcr-atb2-modal-title svelte-ibd6yj">Swap identity?</div> <div class="pcr-atb2-modal-body svelte-ibd6yj">Replace <strong class="svelte-ibd6yj"> </strong> with <strong class="svelte-ibd6yj"> </strong>? <div class="pcr-atb2-modal-note svelte-ibd6yj"> </div></div> <div class="pcr-atb2-modal-footer svelte-ibd6yj"><button class="pcr-atb2-btn pcr-atb2-btn-cancel svelte-ibd6yj">Cancel</button> <button class="pcr-atb2-btn pcr-atb2-btn-insert svelte-ibd6yj">Swap</button></div></div></div>`);
var root_1 = from_html(`<div><div class="pcr-atb-header svelte-ibd6yj"><span class="pcr-atb-title svelte-ibd6yj">Tag Builder 2</span> <div class="pcr-atb-search-wrapper svelte-ibd6yj"><input class="pcr-atb-search svelte-ibd6yj" type="text"/></div> <button class="pcr-atb2-titlebar-btn svelte-ibd6yj"> </button> <button class="pcr-atb2-close svelte-ibd6yj" aria-label="Close">&times;</button></div> <div class="pcr-atb2-body svelte-ibd6yj"><aside class="pcr-atb2-rail svelte-ibd6yj"><div class="pcr-atb2-rail-heading svelte-ibd6yj">Categories</div> <!></aside> <main class="pcr-atb2-browser svelte-ibd6yj"><div class="pcr-atb2-browser-header svelte-ibd6yj"><span class="pcr-atb2-breadcrumb svelte-ibd6yj"><span>Adding to: <strong class="svelte-ibd6yj"> </strong></span> <!></span></div> <!></main> <aside class="pcr-atb2-outline svelte-ibd6yj"><div class="pcr-atb2-outline-heading svelte-ibd6yj">Subjects &amp; Scene</div> <!>  <div class="pcr-atb2-add-subject svelte-ibd6yj">+ Add Subject</div> <!> <!></aside></div> <div class="pcr-atb2-footer svelte-ibd6yj"><div class="pcr-atb2-mode-toggle svelte-ibd6yj" role="radiogroup" aria-label="Output format"><div role="radio" tabindex="0">Tags</div>  <div role="radio" tabindex="0">Natural Language</div></div> <div class="pcr-atb2-footer-spacer svelte-ibd6yj"></div> <button class="pcr-atb2-btn pcr-atb2-btn-cancel svelte-ibd6yj">Cancel</button> <button class="pcr-atb2-btn pcr-atb2-btn-insert svelte-ibd6yj"> </button></div> <!></div> <!> <!> <!> <!> <!> <!> <!>`, 1);
function TagBuilder2($$anchor, $$props) {
  var _a;
  push($$props, true);
  const CUSTOMIZABLE_CLOTHING_GROUPS = /* @__PURE__ */ new Set([
    "legwear",
    "footwear",
    "lingerie",
    "underwear",
    "swimwear",
    "dresses",
    "handwear",
    "tops",
    "bottoms"
  ]);
  prop($$props, "from", 3, 0);
  prop($$props, "to", 3, 0);
  prop($$props, "initialTab", 3, "all");
  prop($$props, "initialQuery", 3, "");
  let initialText = prop($$props, "initialText", 3, ""), editScope = prop($$props, "editScope", 3, "subject"), tagSourceConfig = prop($$props, "tagSourceConfig", 19, () => ({})), modelInfo = prop($$props, "modelInfo", 3, null), onPromptStyleChange = prop($$props, "onPromptStyleChange", 3, () => {
  }), onInsert = prop($$props, "onInsert", 3, () => {
  }), onClose = prop($$props, "onClose", 3, () => {
  });
  const CATEGORIES = [
    {
      key: "all",
      label: "All",
      icon: "📋",
      scope: "all",
      enabled: true
    },
    {
      key: "subjects",
      label: "Subjects",
      icon: "🎭",
      scope: "spawn",
      enabled: true
    },
    {
      key: "appearance",
      label: "Appearance",
      icon: "✨",
      scope: "subject",
      bucket: "appearance",
      enabled: true
    },
    {
      key: "clothing",
      label: "Clothing",
      icon: "👗",
      scope: "subject",
      bucket: "clothing",
      enabled: true
    },
    {
      key: "pose",
      label: "Pose",
      icon: "🧘",
      scope: "subject",
      bucket: "pose",
      enabled: true
    },
    {
      key: "expression",
      label: "Expression",
      icon: "😊",
      scope: "subject",
      bucket: "expression",
      enabled: true
    },
    {
      key: "action",
      label: "Action",
      icon: "⚡",
      scope: "subject",
      bucket: "action",
      enabled: true
    },
    // Props has a synthetic scope: an active subject routes the pick into
    // an interaction chip on the subject's `furniture` slot (with an action
    // verb); no subject routes it into `sceneSelections.<category>` as a
    // standalone scene element. Same picker, same customizer. The bucket
    // key stays "furniture" historically — it now holds all 16 prop
    // categories (furniture/weapons/food/etc.), not just furniture.
    {
      key: "furniture",
      label: "Props",
      icon: "📦",
      scope: "furniture",
      bucket: "furniture",
      enabled: true
    },
    {
      key: "scene",
      label: "Scene",
      icon: "🏠",
      scope: "global",
      bucket: "scene",
      enabled: true
    },
    {
      key: "styles",
      label: "Styles",
      icon: "🎨",
      scope: "style",
      enabled: !!((_a = modelInfo()) == null ? void 0 : _a.hash)
    }
  ];
  const SUBJECT_SUBITEMS = [
    {
      key: "anime",
      label: "Anime",
      source: "characters",
      filter: "anime"
    },
    {
      key: "archetype",
      label: "Archetype",
      source: "cast",
      filter: "archetype"
    },
    {
      key: "creatures",
      label: "Creatures",
      source: "cast",
      filter: "creatures"
    },
    {
      key: "fantasy",
      label: "Fantasy",
      source: "cast",
      filter: "fantasy_beings"
    },
    {
      key: "original",
      label: "Original",
      source: "characters",
      filter: "original"
    },
    {
      key: "video_game",
      label: "Video Game",
      source: "characters",
      filter: "video_game"
    },
    {
      key: "vtuber",
      label: "V-Tuber",
      source: "characters",
      filter: "vtuber"
    }
  ];
  const MULTI_GROUPS = {
    scene: /* @__PURE__ */ new Set(["lighting", "mood", "style", "camera"]),
    appearance: /* @__PURE__ */ new Set([
      "fantasy",
      "body_marks",
      "hair_style",
      "body_type",
      "modifiers",
      "eye_color",
      "eyes"
    ]),
    clothing: /* @__PURE__ */ new Set([
      "accessories",
      "modifiers",
      "handwear",
      "headwear",
      "neckwear",
      "tops"
    ]),
    pose: /* @__PURE__ */ new Set([]),
    expression: /* @__PURE__ */ new Set([]),
    action: /* @__PURE__ */ new Set([]),
    // Every prop category is multi: a scene can stack chair+table+lamp,
    // and a subject can wield a sword while holding an apple. The bucket
    // covers all 16 prop_category_meta keys.
    furniture: /* @__PURE__ */ new Set([
      "furniture",
      "animals",
      "food",
      "drinks",
      "nature",
      "books",
      "tech",
      "tools",
      "misc",
      "weapons",
      "vehicles",
      "sports",
      "toys",
      "effects",
      "symbols",
      "adult"
    ])
  };
  const SUBJECT_TYPES = {
    person: {
      label: "Person",
      icon: "👤",
      color: "#7c3aed",
      slotCategories: [
        "appearance",
        "clothing",
        "pose",
        "expression",
        "action",
        "furniture"
      ]
    },
    object: {
      label: "Object",
      icon: "📦",
      color: "#10b981",
      slotCategories: ["clothing"]
    }
  };
  const SUBJECT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const MODIFIER_OPTIONS = [
    "1girl",
    "2girls",
    "3girls",
    "4girls",
    "5girls",
    "6+girls",
    "multiple_girls",
    "1boy",
    "2boys",
    "3boys",
    "4boys",
    "5boys",
    "6+boys",
    "multiple_boys",
    "1other",
    "2others",
    "multiple_others",
    "solo",
    "solo_focus"
  ];
  const MODIFIER_TOKENS = new Set(MODIFIER_OPTIONS);
  const COMPOSITION_MODIFIERS = /* @__PURE__ */ new Set(["solo", "solo_focus"]);
  const MODIFIER_NATLANG = {
    "1girl": "female",
    "2girls": "two females",
    "3girls": "three females",
    "4girls": "four females",
    "5girls": "five females",
    "6+girls": "six or more females",
    "multiple_girls": "multiple females",
    "1boy": "male",
    "2boys": "two males",
    "3boys": "three males",
    "4boys": "four males",
    "5boys": "five males",
    "6+boys": "six or more males",
    "multiple_boys": "multiple males",
    "1other": "one figure",
    "2others": "two figures",
    "multiple_others": "multiple figures",
    "solo": "alone",
    "solo_focus": "solo focus"
  };
  const MODIFIER_ITEMS = [
    {
      item_tag: "1girl",
      display_name: "1 Girl",
      item_group: "count_girls"
    },
    {
      item_tag: "2girls",
      display_name: "2 Girls",
      item_group: "count_girls"
    },
    {
      item_tag: "3girls",
      display_name: "3 Girls",
      item_group: "count_girls"
    },
    {
      item_tag: "4girls",
      display_name: "4 Girls",
      item_group: "count_girls"
    },
    {
      item_tag: "5girls",
      display_name: "5 Girls",
      item_group: "count_girls"
    },
    {
      item_tag: "6+girls",
      display_name: "6+ Girls",
      item_group: "count_girls"
    },
    {
      item_tag: "multiple_girls",
      display_name: "Multiple Girls",
      item_group: "count_girls"
    },
    {
      item_tag: "1boy",
      display_name: "1 Boy",
      item_group: "count_boys"
    },
    {
      item_tag: "2boys",
      display_name: "2 Boys",
      item_group: "count_boys"
    },
    {
      item_tag: "3boys",
      display_name: "3 Boys",
      item_group: "count_boys"
    },
    {
      item_tag: "4boys",
      display_name: "4 Boys",
      item_group: "count_boys"
    },
    {
      item_tag: "5boys",
      display_name: "5 Boys",
      item_group: "count_boys"
    },
    {
      item_tag: "6+boys",
      display_name: "6+ Boys",
      item_group: "count_boys"
    },
    {
      item_tag: "multiple_boys",
      display_name: "Multiple Boys",
      item_group: "count_boys"
    },
    {
      item_tag: "1other",
      display_name: "1 Other",
      item_group: "count_other"
    },
    {
      item_tag: "2others",
      display_name: "2 Others",
      item_group: "count_other"
    },
    {
      item_tag: "multiple_others",
      display_name: "Multiple Others",
      item_group: "count_other"
    },
    {
      item_tag: "solo",
      display_name: "Solo",
      item_group: "composition"
    },
    {
      item_tag: "solo_focus",
      display_name: "Solo Focus",
      item_group: "composition"
    }
  ];
  Object.fromEntries(MODIFIER_ITEMS.map((i) => [i.item_tag, i.item_group]));
  const MODIFIER_GROUP_KEY = "__modifiers";
  let activeCategory = state("all");
  let activeGroup = state(null);
  let searchQuery = state("");
  let isNaturalMode = state(tagSourceConfig().prompt_style === "natural");
  let bucketCache = state(proxy({}));
  let characters = state(proxy([]));
  let charactersTotal = state(0);
  let charactersLoading = state(false);
  let charactersSearchHandle = null;
  let characterThumbs = state(proxy(/* @__PURE__ */ new Set()));
  const CARD_MIN_PX_KEY = "pcr-atb2-card-min-px";
  const CARD_MIN_PX_MIN = 60;
  const CARD_MIN_PX_MAX = 320;
  const CARD_MIN_PX_STEP = 25;
  let cardMinPx = state(130);
  try {
    const stored = parseInt(localStorage.getItem(CARD_MIN_PX_KEY) || "", 10);
    if (Number.isFinite(stored)) {
      set(cardMinPx, Math.max(CARD_MIN_PX_MIN, Math.min(CARD_MIN_PX_MAX, stored)), true);
    }
  } catch {
  }
  let browserEl = state(null);
  let railEl = state(null);
  const MAXIMIZED_KEY = "pcr-atb2-maximized";
  let maximized = state(false);
  try {
    set(maximized, localStorage.getItem(MAXIMIZED_KEY) === "1");
  } catch {
  }
  function toggleMaximized() {
    set(maximized, !get(maximized));
    try {
      localStorage.setItem(MAXIMIZED_KEY, get(maximized) ? "1" : "0");
    } catch {
    }
  }
  user_effect(() => {
    const el = get(browserEl);
    if (!el) return;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const step = event.deltaY < 0 ? CARD_MIN_PX_STEP : -CARD_MIN_PX_STEP;
      const next = Math.max(CARD_MIN_PX_MIN, Math.min(CARD_MIN_PX_MAX, get(cardMinPx) + step));
      if (next === get(cardMinPx)) return;
      set(cardMinPx, next, true);
      console.log(`[TagBuilder2] cardMinPx = ${next}px`);
      try {
        localStorage.setItem(CARD_MIN_PX_KEY, String(next));
      } catch {
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel, { passive: false });
  });
  let activeSubjectSubitem = state(null);
  let characterCategoryCounts = state(proxy({}));
  let castCache = state(proxy({}));
  const castPromises = {};
  let castThumbs = state(proxy({}));
  let subjects = state(proxy([]));
  let activeSubjectId = state(null);
  let nextSubjectIdx = state(0);
  let sceneSelections = state(proxy({}));
  let sceneFreeform = state(proxy([]));
  let regionMode = state(false);
  let stylesCache = state(proxy({ items: [], loaded: false, loading: false }));
  let activeStyle = state(null);
  let styleSpawned = state(false);
  let sceneSpawned = state(false);
  let normalizedCharacterTags = /* @__PURE__ */ new Set();
  let normalizedCharacters = [];
  let preservedPassthrough = state("");
  let chipQaMenu = state(
    null
    // { x, y, bucket, item }
  );
  let identityPickerOpen = state(null);
  let identityPickerQuery = state("");
  let identityPickerRect = state(proxy({ left: 0, top: 0, width: 280 }));
  let identityCharResults = state(proxy([]));
  let identityCharLoading = state(false);
  let identityPickerHandle = null;
  let identityPickerSearchEl = null;
  let pendingIdentitySwap = state(null);
  let presetPickerOpen = state(
    null
    // { kind, subjId } | null
  );
  let presetPickerQuery = state("");
  let presetPickerRect = state(proxy({ left: 0, top: 0, width: 280 }));
  let presetPickerResults = state(proxy([]));
  let presetPickerLoading = state(false);
  let presetPickerHandle = null;
  let presetPickerSearchEl = null;
  let modifierPickerOpen = state(
    null
    // subjId | null
  );
  let modifierPickerRect = state(proxy({ left: 0, top: 0, width: 280 }));
  let scrollToItemTag = state(null);
  let customizerOpen = state(null);
  let furnitureCustomizerOpen = state(null);
  let furnitureActions = state(proxy([]));
  let furnitureActionsLoaded = false;
  let clothingModData = state(proxy({}));
  const clothingModPromises = {};
  let fantasyCustomizerOpen = state(null);
  let fantasyModData = state(null);
  let fantasyModPromise = null;
  const CUSTOMIZABLE_APPEARANCE_GROUPS = /* @__PURE__ */ new Set(["fantasy"]);
  let activeCategoryDef = user_derived(() => CATEGORIES.find((c) => c.key === get(activeCategory)) || CATEGORIES[0]);
  let activeBucket = user_derived(() => get(activeCategoryDef).bucket);
  let activeBucketData = user_derived(() => get(bucketCache)[get(activeBucket)] || { groups: [], items: [], thumbs: /* @__PURE__ */ new Set(), loading: true });
  let activeSubject = user_derived(() => get(subjects).find((s) => s.id === get(activeSubjectId)) || null);
  let routingTarget = user_derived(() => {
    var _a2;
    if (get(activeCategoryDef).scope === "all") return { type: "all", label: "All categories" };
    if (get(activeCategoryDef).scope === "global") return { type: "scene", label: "Scene" };
    if (get(activeCategoryDef).scope === "furniture") {
      if (get(activeSubject)) return {
        type: "subject-furniture",
        label: `${get(activeSubject).name} (prop interaction)`
      };
      return { type: "scene-furniture", label: "Scene" };
    }
    if (get(activeCategoryDef).scope === "style") return { type: "style", label: "Style" };
    if (get(activeCategoryDef).scope === "spawn") {
      if ((_a2 = get(activeSubject)) == null ? void 0 : _a2.character) {
        return {
          type: "rebind",
          label: `${get(activeSubject).name} (will prompt to swap)`
        };
      }
      if (get(activeSubject)) {
        return {
          type: "bind",
          label: `${get(activeSubject).name} (will bind identity)`
        };
      }
      return { type: "spawn", label: "(spawns new subject on click)" };
    }
    if (get(activeSubject)) return {
      type: "subject",
      id: get(activeSubject).id,
      label: get(activeSubject).name
    };
    const nextLetter = SUBJECT_LETTERS[get(nextSubjectIdx) % 26] || "?";
    return { type: "auto", label: `(auto-spawn Subject ${nextLetter})` };
  });
  let itemsByGroup = user_derived(() => {
    const source = get(activeCategory) === "styles" ? get(stylesCache).items : get(activeBucketData).items;
    const map = {};
    for (const it of source) {
      if (!map[it.item_group]) map[it.item_group] = [];
      map[it.item_group].push(it);
    }
    return map;
  });
  let allCategorySections = user_derived(() => {
    var _a2;
    if (get(activeCategory) !== "all") return [];
    const q = get(searchQuery).trim().toLowerCase().replace(/[_\s]+/g, " ");
    const filterFn = (it) => {
      if (!q) return true;
      const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      const t = (it.base_tags || "").toLowerCase().replace(/[_\s]+/g, " ");
      return d.includes(q) || t.includes(q);
    };
    const sections = [];
    if (get(characters).length) {
      sections.push({
        key: "subjects/characters",
        kind: "subject-character",
        categoryKey: "subjects",
        categoryLabel: "Subjects",
        groupLabel: "Characters",
        items: get(characters).map((c) => ({ ...c, item_tag: c.tag, display_name: c.display }))
      });
    }
    for (const sub of SUBJECT_SUBITEMS) {
      if (sub.source !== "cast") continue;
      const items = (((_a2 = get(castCache)[sub.filter]) == null ? void 0 : _a2.items) || []).filter(filterFn);
      if (items.length) {
        sections.push({
          key: `subjects/${sub.filter}`,
          kind: "subject-cast",
          castGroup: sub.filter,
          categoryKey: "subjects",
          categoryLabel: "Subjects",
          groupLabel: sub.label,
          items
        });
      }
    }
    for (const cat of CATEGORIES) {
      if (!cat.enabled) continue;
      if (cat.scope === "all" || cat.scope === "spawn" || cat.scope === "style") continue;
      if (!cat.bucket) continue;
      const data = get(bucketCache)[cat.bucket];
      if (!(data == null ? void 0 : data.loaded)) continue;
      const groups = data.groups || [];
      for (const g of groups) {
        const items = (data.items || []).filter((it) => it.item_group === g.group_name).filter(filterFn);
        if (items.length) {
          sections.push({
            key: `${cat.key}/${g.group_name}`,
            categoryKey: cat.key,
            categoryLabel: cat.label,
            groupLabel: g.display_name || g.group_name,
            groupKey: g.group_name,
            items
          });
        }
      }
      if (cat.key === "appearance") {
        const modItems = MODIFIER_ITEMS.filter(filterFn);
        if (modItems.length) {
          sections.push({
            key: "appearance/__modifiers__",
            categoryKey: "appearance",
            categoryLabel: "Appearance",
            groupLabel: "Modifiers",
            groupKey: MODIFIER_GROUP_KEY,
            items: modItems
          });
        }
      }
    }
    return sections;
  });
  let groupedSections = user_derived(() => {
    if (get(activeCategory) === "all" || get(activeCategory) === "subjects" || get(activeCategory) === "styles") return null;
    if (get(activeGroup)) return null;
    if (!get(activeBucket)) return null;
    const data = get(bucketCache)[get(activeBucket)];
    if (!(data == null ? void 0 : data.loaded)) return null;
    const groups = data.groups || [];
    if (groups.length <= 1) return null;
    const q = get(searchQuery).trim().toLowerCase().replace(/[_\s]+/g, " ");
    const filterFn = (it) => {
      if (!q) return true;
      const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      const t = (it.base_tags || "").toLowerCase().replace(/[_\s]+/g, " ");
      return d.includes(q) || t.includes(q);
    };
    const sections = [];
    for (const g of groups) {
      const items = (data.items || []).filter((it) => it.item_group === g.group_name).filter(filterFn);
      if (items.length) {
        sections.push({
          key: g.group_name,
          groupLabel: g.display_name || g.group_name,
          groupKey: g.group_name,
          items
        });
      }
    }
    return sections;
  });
  let visibleItems = user_derived(() => {
    const q = get(searchQuery).trim().toLowerCase().replace(/[_\s]+/g, " ");
    if (get(activeCategory) === "appearance" && get(activeGroup) === MODIFIER_GROUP_KEY) {
      if (!q) return MODIFIER_ITEMS;
      return MODIFIER_ITEMS.filter((it) => {
        const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
        const t = (it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
        return d.includes(q) || t.includes(q);
      });
    }
    if (get(activeCategory) === "styles") {
      const pool2 = get(activeGroup) ? get(itemsByGroup)[get(activeGroup)] || [] : get(stylesCache).items;
      if (!q) return pool2;
      return pool2.filter((it) => {
        const d = (it.display_name || "").toLowerCase().replace(/[_\s]+/g, " ");
        const t = (it.tags || []).join(" ").toLowerCase().replace(/[_\s]+/g, " ");
        return d.includes(q) || t.includes(q);
      });
    }
    const pool = get(activeGroup) ? get(itemsByGroup)[get(activeGroup)] || [] : get(activeBucketData).items;
    if (!q) return pool;
    return pool.filter((it) => {
      const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      const t = (it.base_tags || "").toLowerCase().replace(/[_\s]+/g, " ");
      return d.includes(q) || t.includes(q);
    });
  });
  let sceneGroupsList = user_derived(() => {
    var _a2;
    return ((_a2 = get(bucketCache).scene) == null ? void 0 : _a2.groups) || [];
  });
  let searchPlaceholder = user_derived(() => {
    if (get(activeCategory) === "subjects") {
      const sub = SUBJECT_SUBITEMS.find((s) => s.key === get(activeSubjectSubitem));
      if (sub) return `Search ${sub.label.toLowerCase()}…`;
      return "Pick a subject type…";
    }
    return `Search ${get(activeCategoryDef).label.toLowerCase()}…`;
  });
  let tagToItem = user_derived(() => {
    const map = /* @__PURE__ */ new Map();
    const BUCKET_PRIORITY = ["appearance", "pose", "scene", "clothing", "style"];
    const orderedEntries = Object.entries(get(bucketCache)).sort(([a], [b]) => {
      const ai = BUCKET_PRIORITY.indexOf(a);
      const bi = BUCKET_PRIORITY.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    for (const [bucket, data] of orderedEntries) {
      if (!(data == null ? void 0 : data.items)) continue;
      for (const item of data.items) {
        if (!map.has(item.item_tag)) {
          map.set(item.item_tag, { bucket, group: item.item_group, item });
        }
      }
      for (const item of data.items) {
        const bt = (item.base_tags || "").trim();
        if (!bt || bt.includes(",") || bt.startsWith("(")) continue;
        if (!map.has(bt)) {
          map.set(bt, { bucket, group: item.item_group, item });
        }
      }
    }
    return map;
  });
  let totalSelectionCount = user_derived(() => {
    var _a2, _b;
    let n = 0;
    for (const arr of Object.values(get(sceneSelections))) n += (arr == null ? void 0 : arr.length) || 0;
    if ((_b = (_a2 = get(activeStyle)) == null ? void 0 : _a2.tags) == null ? void 0 : _b.length) n += 1;
    for (const subj of get(subjects)) {
      if (subj.character) n += 1;
      n += (subj.identityTokens || []).length;
      n += (subj.modifiers || []).length;
      n += (subj.freeform || []).length;
      for (const cat of Object.values(subj.slots || {})) {
        for (const arr of Object.values(cat || {})) n += (arr == null ? void 0 : arr.length) || 0;
      }
    }
    return n;
  });
  user_effect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose()();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  user_effect(() => {
    var _a2, _b;
    const bucket = get(activeBucket);
    if (bucket && !((_a2 = get(bucketCache)[bucket]) == null ? void 0 : _a2.loaded) && !((_b = get(bucketCache)[bucket]) == null ? void 0 : _b.loading)) {
      loadBucket(bucket);
    }
  });
  user_effect(() => {
    if (get(activeCategory) !== "subjects" && get(activeCategory) !== "all") return;
    const q = get(searchQuery);
    if (get(activeCategory) === "all" || !get(activeSubjectSubitem)) {
      if (charactersSearchHandle) clearTimeout(charactersSearchHandle);
      charactersSearchHandle = setTimeout(() => loadCharacters(q, ""), 200);
      return;
    }
    const sub = SUBJECT_SUBITEMS.find((s) => s.key === get(activeSubjectSubitem));
    if (!sub) return;
    if (sub.source === "characters") {
      if (charactersSearchHandle) clearTimeout(charactersSearchHandle);
      charactersSearchHandle = setTimeout(() => loadCharacters(q, sub.filter), 200);
    } else if (sub.source === "cast") {
      loadCast(sub.filter);
    }
  });
  onMount(async () => {
    for (const cat of CATEGORIES) {
      if (cat.enabled && cat.bucket) loadBucket(cat.bucket);
    }
    const charTagsPromise = fetch(`/promptchain/tag-builder/characters?natlang_status=normalized&per_page=1000&sort=display`).then((r) => r.ok ? r.json() : { characters: [] }).then((d) => {
      const chars = d.characters || [];
      normalizedCharacterTags = new Set(chars.map((c) => c.tag));
      normalizedCharacters = chars.filter((c) => c.base_natlang && c.base_natlang.trim()).sort((a, b) => (b.base_natlang || "").length - (a.base_natlang || "").length);
    }).catch(() => {
    });
    if (initialText() && initialText().trim()) {
      Promise.all([
        charTagsPromise,
        ensureSubjectBucketsLoaded(),
        loadStyles(),
        // Furniture isn't a subject-scope bucket, so ensureSubjectBucketsLoaded
        // skips it. Round-trip parsing needs furniture items + prop_actions
        // available to recognize phrases like "sitting on a wooden chair"
        // and bind them as furniture chips instead of section freeform.
        loadFurniture(),
        // Cast groups must be loaded too so buildCastIdentityMap can rebind
        // archetype identities ("motherly" → archetype_motherly) instead of
        // racing and dropping them to freeform.
        ...SUBJECT_SUBITEMS.filter((s) => s.source === "cast").map((s) => loadCast(s.filter))
      ]).then(() => parseInitialPrompt(initialText())).catch((e) => {
        console.error("[TagBuilder2] round-trip parse failed", e);
      });
    }
    for (const sub of SUBJECT_SUBITEMS) {
      if (sub.source === "cast") loadCast(sub.filter);
    }
    fetch(`/promptchain/tag-builder/thumbs/manifest?bucket=characters`).then((r) => r.ok ? r.json() : { thumbs: [] }).then((d) => {
      set(characterThumbs, new Set(d.thumbs || []), true);
    }).catch(() => {
    });
    fetch(`/promptchain/tag-builder/character-counts?natlang_status=normalized`).then((r) => r.ok ? r.json() : { counts: {} }).then((d) => {
      set(characterCategoryCounts, d.counts || {}, true);
    }).catch(() => {
    });
    for (const sub of SUBJECT_SUBITEMS) {
      if (sub.source !== "cast") continue;
      const group = sub.filter;
      fetch(`/promptchain/tag-builder/thumbs/manifest?bucket=${encodeURIComponent(group)}`).then((r) => r.ok ? r.json() : { thumbs: [] }).then((d) => {
        set(castThumbs, { ...get(castThumbs), [group]: new Set(d.thumbs || []) }, true);
      }).catch(() => {
      });
    }
  });
  function extractStyleTags(text2) {
    if (!text2) return [];
    const lines = text2.split("\n");
    const cursorIdx = lines.findIndex((l) => l.includes("{cursor}"));
    const startIdx = cursorIdx >= 0 ? cursorIdx + 1 : 0;
    const out = [];
    for (let i = startIdx; i < lines.length; i++) {
      if (isStructuralLine(lines[i])) continue;
      if (isInNegativeBlock(lines, i)) continue;
      for (const piece of lines[i].split(/,|\.\s+/)) {
        const t = piece.trim().replace(/\.$/, "");
        if (t) out.push(t);
      }
    }
    return out;
  }
  function presetToStyleItem(preset) {
    const tags = extractStyleTags(preset.text || "");
    if (!tags.length) return null;
    return {
      item_tag: preset.id || preset.name,
      display_name: preset.name || preset.id,
      item_group: preset.category || "Uncategorized",
      tags,
      _text: preset.text || ""
    };
  }
  async function loadStyles() {
    var _a2, _b, _c, _d, _e;
    if (get(stylesCache).loaded || get(stylesCache).loading) return;
    set(stylesCache, { ...get(stylesCache), loading: true }, true);
    try {
      const params = new URLSearchParams();
      if ((_a2 = modelInfo()) == null ? void 0 : _a2.hash) params.set("hash", modelInfo().hash);
      if ((_b = modelInfo()) == null ? void 0 : _b.filename) params.set("name", modelInfo().filename);
      if ((_c = modelInfo()) == null ? void 0 : _c.architecture) params.set("arch", modelInfo().architecture);
      if ((_d = modelInfo()) == null ? void 0 : _d.family) params.set("family", modelInfo().family);
      const res = await fetch(`/promptchain/prompts/list?${params}`);
      const data = res.ok ? await res.json() : { prompts: [] };
      const items = (data.prompts || []).map(presetToStyleItem).filter(Boolean);
      set(stylesCache, { items, loaded: true, loading: false }, true);
      console.log(`[TagBuilder2] loadStyles: ${items.length} presets (modelInfo: ${modelInfo() ? `arch=${modelInfo().architecture} fam=${modelInfo().family} hash=${(_e = modelInfo().hash) == null ? void 0 : _e.slice(0, 8)}` : "null"})`);
    } catch (e) {
      console.error("[TagBuilder2] styles fetch failed", e);
      set(stylesCache, { items: [], loaded: true, loading: false }, true);
    }
  }
  user_effect(() => {
    if (get(activeCategory) === "styles" && !get(stylesCache).loaded && !get(stylesCache).loading) {
      loadStyles();
    }
  });
  let styleGroups = user_derived(() => {
    const counts = /* @__PURE__ */ new Map();
    for (const it of get(stylesCache).items) {
      counts.set(it.item_group, (counts.get(it.item_group) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([group_name]) => ({ group_name, display_name: group_name }));
  });
  function pickStyle(item) {
    var _a2;
    if (((_a2 = get(activeStyle)) == null ? void 0 : _a2.id) === item.item_tag) {
      set(activeStyle, null);
      return;
    }
    set(
      activeStyle,
      {
        id: item.item_tag,
        name: item.display_name,
        tags: [...item.tags],
        // First pick OR a swap from a different style -> emit a fresh header
        // alongside the tags. Round-trip parse will overwrite this with the
        // user's original header text (or null) when re-binding.
        commentHeader: `// Style: ${item.display_name}`
      },
      true
    );
    if (!get(styleSpawned)) set(styleSpawned, true);
  }
  function deleteStyleCard() {
    set(activeStyle, null);
    set(styleSpawned, false);
  }
  async function loadCharacters(query, category) {
    set(charactersLoading, true);
    try {
      const params = new URLSearchParams({ page: "1", per_page: "60", sort: "post_count" });
      if (query) params.set("search", query);
      if (category) params.set("category", category);
      params.set("natlang_status", "normalized");
      const res = await fetch(`/promptchain/tag-builder/characters?${params}`);
      if (!res.ok) throw new Error("character fetch failed");
      const data = await res.json();
      set(characters, data.characters || [], true);
      set(charactersTotal, data.total || 0, true);
    } catch (e) {
      console.error("[TagBuilder2] character fetch failed", e);
      set(characters, [], true);
      set(charactersTotal, 0);
    }
    set(charactersLoading, false);
  }
  function loadCast(group) {
    var _a2;
    if ((_a2 = get(castCache)[group]) == null ? void 0 : _a2.loaded) return Promise.resolve();
    if (castPromises[group]) return castPromises[group];
    set(
      castCache,
      {
        ...get(castCache),
        [group]: { items: [], loaded: false, loading: true }
      },
      true
    );
    castPromises[group] = (async () => {
      try {
        const res = await fetch(`/promptchain/tag-builder/cast?group=${encodeURIComponent(group)}`);
        const data = res.ok ? await res.json() : { items: [] };
        set(
          castCache,
          {
            ...get(castCache),
            [group]: { items: data.items || [], loaded: true, loading: false }
          },
          true
        );
      } catch (e) {
        console.error(`[TagBuilder2] cast fetch failed: ${group}`, e);
        set(
          castCache,
          {
            ...get(castCache),
            [group]: { items: [], loaded: true, loading: false, error: true }
          },
          true
        );
      } finally {
        delete castPromises[group];
      }
    })();
    return castPromises[group];
  }
  const bucketPromises = {};
  function loadBucket(bucket) {
    var _a2;
    if ((_a2 = get(bucketCache)[bucket]) == null ? void 0 : _a2.loaded) return Promise.resolve();
    if (bucketPromises[bucket]) return bucketPromises[bucket];
    if (bucket === "furniture") return loadFurniture();
    set(
      bucketCache,
      {
        ...get(bucketCache),
        [bucket]: {
          groups: [],
          items: [],
          thumbs: /* @__PURE__ */ new Set(),
          loaded: false,
          loading: true
        }
      },
      true
    );
    bucketPromises[bucket] = (async () => {
      try {
        const [gRes, iRes, mRes] = await Promise.all([
          fetch(`/promptchain/tag-builder/buckets/${bucket}/groups`),
          fetch(`/promptchain/tag-builder/buckets/${bucket}/items`),
          fetch(`/promptchain/tag-builder/thumbs/manifest?bucket=${bucket}`)
        ]);
        const groups = gRes.ok ? (await gRes.json()).groups || [] : [];
        const items = iRes.ok ? (await iRes.json()).items || [] : [];
        const thumbs = mRes.ok ? new Set((await mRes.json()).thumbs || []) : /* @__PURE__ */ new Set();
        set(
          bucketCache,
          {
            ...get(bucketCache),
            [bucket]: { groups, items, thumbs, loaded: true, loading: false }
          },
          true
        );
      } catch (e) {
        console.error(`[TagBuilder2] bucket fetch failed: ${bucket}`, e);
        set(
          bucketCache,
          {
            ...get(bucketCache),
            [bucket]: {
              groups: [],
              items: [],
              thumbs: /* @__PURE__ */ new Set(),
              loaded: true,
              loading: false,
              error: true
            }
          },
          true
        );
      } finally {
        delete bucketPromises[bucket];
      }
    })();
    return bucketPromises[bucket];
  }
  function loadFurniture() {
    var _a2;
    if ((_a2 = get(bucketCache).furniture) == null ? void 0 : _a2.loaded) return Promise.resolve();
    if (bucketPromises.furniture) return bucketPromises.furniture;
    set(
      bucketCache,
      {
        ...get(bucketCache),
        furniture: {
          groups: [],
          items: [],
          thumbs: /* @__PURE__ */ new Set(),
          loaded: false,
          loading: true
        }
      },
      true
    );
    bucketPromises.furniture = (async () => {
      try {
        const [allRes, furnRes, thumbRes] = await Promise.all([
          fetch("/promptchain/props/all"),
          fetch("/promptchain/furniture"),
          // Props/furniture thumbs live on disk under the "furniture"
          // bucket segment (all 16 prop categories share it). Without this
          // manifest the thumbs Set stays empty and no prop card shows art.
          fetch("/promptchain/tag-builder/thumbs/manifest?bucket=furniture")
        ]);
        const all = allRes.ok ? await allRes.json() : {
          categories: [],
          props: [],
          actions: [],
          materials: [],
          patterns: [],
          colors: [],
          action_overrides: {}
        };
        const furnRows = furnRes.ok ? await furnRes.json() : [];
        const furnThumbs = thumbRes.ok ? new Set((await thumbRes.json()).thumbs || []) : /* @__PURE__ */ new Set();
        set(furnitureActions, all.actions || [], true);
        furnitureActionsLoaded = true;
        const groups = (all.categories || []).map((c) => ({
          group_name: c.category,
          display_name: c.display_name || c.category.charAt(0).toUpperCase() + c.category.slice(1),
          icon: c.icon || "",
          sort_order: c.sort_order
        }));
        const furnSubCat = /* @__PURE__ */ new Map();
        for (const row of furnRows) furnSubCat.set(row.tag, row.category);
        const items = (all.props || []).map((row) => ({
          item_tag: row.prop_tag,
          display_name: row.display_name,
          item_group: row.category,
          base_tags: row.base_tags || row.prop_tag,
          base_natlang: row.base_natlang || (row.display_name || "").toLowerCase(),
          sort_order: row.sort_order,
          is_customizable: !!row.is_customizable,
          subCategory: row.category === "furniture" ? furnSubCat.get(row.prop_tag) || null : null
        }));
        set(
          bucketCache,
          {
            ...get(bucketCache),
            furniture: {
              groups,
              items,
              thumbs: furnThumbs,
              loaded: true,
              loading: false,
              // Sidecar data used by the customizer; not consumed by the
              // generic rail/browser rendering. action_overrides keyed by
              // prop_tag lets the customizer prefer per-prop verb lists when
              // present (e.g. a sword's overrides narrow to wielding/aiming).
              mods: {
                materials: all.materials || [],
                patterns: all.patterns || [],
                colors: all.colors || [],
                actionOverrides: all.action_overrides || {}
              }
            }
          },
          true
        );
      } catch (e) {
        console.error("[TagBuilder2] props fetch failed", e);
        set(
          bucketCache,
          {
            ...get(bucketCache),
            furniture: {
              groups: [],
              items: [],
              thumbs: /* @__PURE__ */ new Set(),
              loaded: true,
              loading: false,
              error: true
            }
          },
          true
        );
      } finally {
        delete bucketPromises.furniture;
      }
    })();
    return bucketPromises.furniture;
  }
  function isItemUnprocessed(item) {
    if (!item) return false;
    return (item.natlang_status ?? "") === "broken";
  }
  function openChipQaMenu(e, bucket, item) {
    if (!bucket || !item) return;
    e.preventDefault();
    e.stopPropagation();
    set(chipQaMenu, { x: e.clientX, y: e.clientY, bucket, item }, true);
  }
  function closeChipQaMenu() {
    set(chipQaMenu, null);
  }
  async function setChipNatlangStatus(bucket, item, status) {
    var _a2;
    closeChipQaMenu();
    try {
      const res = await fetch(`/promptchain/tag-builder/buckets/${bucket}/items/${encodeURIComponent(item.item_tag)}/natlang-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        console.error(`[TagBuilder2] natlang_status update failed: ${res.status}`);
        return;
      }
    } catch (err) {
      console.error("[TagBuilder2] natlang_status update error", err);
      return;
    }
    const items = (_a2 = get(bucketCache)[bucket]) == null ? void 0 : _a2.items;
    if (items) {
      const row = items.find((r) => r.item_tag === item.item_tag);
      if (row) row.natlang_status = status;
    }
    for (const subj of get(subjects)) {
      for (const catKey of Object.keys(subj.slots || {})) {
        for (const grp of Object.keys(subj.slots[catKey] || {})) {
          for (const chip of subj.slots[catKey][grp]) {
            if (chip.item_tag === item.item_tag) chip.natlang_status = status;
          }
        }
      }
    }
    for (const grp of Object.keys(get(sceneSelections) || {})) {
      for (const chip of get(sceneSelections)[grp] || []) {
        if (chip.item_tag === item.item_tag) chip.natlang_status = status;
      }
    }
    set(bucketCache, { ...get(bucketCache) }, true);
    set(subjects, [...get(subjects)], true);
    set(sceneSelections, { ...get(sceneSelections) }, true);
  }
  function thumbUrl(bucket, itemTag) {
    return `/promptchain/tag-builder/thumb/${bucket}/${encodeURIComponent(itemTag)}`;
  }
  function hasThumb(bucket, itemTag) {
    var _a2, _b;
    return (_b = (_a2 = get(bucketCache)[bucket]) == null ? void 0 : _a2.thumbs) == null ? void 0 : _b.has(itemTag);
  }
  function stickyShadow(headerEl) {
    var _a2;
    const root2 = headerEl.closest(".pcr-atb2-browser");
    const sentinel = (_a2 = headerEl.parentElement) == null ? void 0 : _a2.querySelector(".pcr-atb2-section-sentinel");
    if (!root2 || !sentinel) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        var _a3;
        const stuck = !entry.isIntersecting && entry.boundingClientRect.top < (((_a3 = entry.rootBounds) == null ? void 0 : _a3.top) ?? 0);
        headerEl.classList.toggle("pcr-atb2-section-stuck", stuck);
      },
      { root: root2, threshold: 0 }
    );
    io.observe(sentinel);
    return {
      destroy() {
        io.disconnect();
      }
    };
  }
  let scrollSpyGroup = state(null);
  const _spyNodes = /* @__PURE__ */ new Set();
  const _spyVisible = /* @__PURE__ */ new Set();
  let _spyObserver = null;
  function _recomputeSpy(root2) {
    if (!_spyVisible.size) return;
    const rootTop = root2.getBoundingClientRect().top;
    let atTop = null, atTopOffset = -Infinity;
    let topmost = null, topmostOffset = Infinity;
    for (const node of _spyVisible) {
      const offset = node.getBoundingClientRect().top - rootTop;
      if (offset <= 4 && offset > atTopOffset) {
        atTopOffset = offset;
        atTop = node;
      }
      if (offset < topmostOffset) {
        topmostOffset = offset;
        topmost = node;
      }
    }
    const winner = atTop ?? topmost;
    if (winner) set(scrollSpyGroup, winner.dataset.spyGroup, true);
  }
  user_effect(() => {
    const root2 = get(browserEl);
    if (!root2) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) _spyVisible.add(entry.target);
          else _spyVisible.delete(entry.target);
        }
        _recomputeSpy(root2);
      },
      { root: root2, rootMargin: "0px 0px -85% 0px", threshold: 0 }
    );
    _spyObserver = io;
    for (const node of _spyNodes) io.observe(node);
    return () => {
      io.disconnect();
      _spyObserver = null;
      _spyVisible.clear();
    };
  });
  user_effect(() => {
    get(activeCategory);
    set(scrollSpyGroup, null);
  });
  let scrollSpyCategory = user_derived(() => get(activeCategory) === "all" && typeof get(scrollSpyGroup) === "string" && get(scrollSpyGroup).includes("/") ? get(scrollSpyGroup).slice(0, get(scrollSpyGroup).indexOf("/")) : null);
  user_effect(() => {
    var _a2;
    get(
      scrollSpyGroup
      // re-run when the active section changes
    );
    if (get(activeCategory) !== "all") return;
    const row = (_a2 = get(railEl)) == null ? void 0 : _a2.querySelector(".pcr-atb2-rail-drilldown .pcr-atb2-rail-sub.active");
    row == null ? void 0 : row.scrollIntoView({ block: "nearest" });
  });
  function spyTarget(node) {
    _spyNodes.add(node);
    _spyObserver == null ? void 0 : _spyObserver.observe(node);
    return {
      destroy() {
        _spyNodes.delete(node);
        _spyVisible.delete(node);
        _spyObserver == null ? void 0 : _spyObserver.unobserve(node);
      }
    };
  }
  async function scrollToGroup(group) {
    if (get(activeGroup) !== null) set(activeGroup, null);
    await tick();
    const root2 = get(browserEl);
    if (!root2) return;
    const section = root2.querySelector(`.pcr-atb2-browser-section[data-spy-group="${CSS.escape(group)}"]`);
    section == null ? void 0 : section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function scrollToAllSection(sectionKey) {
    const root2 = get(browserEl);
    if (!root2) return;
    const section = root2.querySelector(`.pcr-atb2-browser-section[data-spy-group="${CSS.escape(sectionKey)}"]`);
    section == null ? void 0 : section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function scrollBrowserTop() {
    await tick();
    if (get(browserEl)) get(browserEl).scrollTop = 0;
  }
  async function refreshThumbs(bucket) {
    var _a2;
    if (!bucket || !((_a2 = get(bucketCache)[bucket]) == null ? void 0 : _a2.loaded)) return;
    try {
      const res = await fetch(`/promptchain/tag-builder/thumbs/manifest?bucket=${encodeURIComponent(bucket)}`);
      if (!res.ok) return;
      const thumbs = new Set((await res.json()).thumbs || []);
      set(
        bucketCache,
        {
          ...get(bucketCache),
          [bucket]: { ...get(bucketCache)[bucket], thumbs }
        },
        true
      );
    } catch {
    }
  }
  function selectCategory(key) {
    const cat = CATEGORIES.find((c) => c.key === key);
    if (!cat || !cat.enabled) return;
    if (key !== get(activeCategory)) set(searchQuery, "");
    set(activeCategory, key, true);
    set(activeGroup, null);
    if (key !== "subjects") set(activeSubjectSubitem, null);
    if (cat.bucket) refreshThumbs(cat.bucket);
    scrollBrowserTop();
  }
  function selectSubjectSubitem(key) {
    set(activeSubjectSubitem, get(activeSubjectSubitem) === key ? null : key, true);
    set(searchQuery, "");
    scrollBrowserTop();
  }
  function selectGroup(groupName) {
    set(activeGroup, get(activeGroup) === groupName ? null : groupName, true);
    scrollBrowserTop();
  }
  function groupDisplay(bucket, groupName) {
    var _a2, _b;
    if (groupName === MODIFIER_GROUP_KEY) return "Modifiers";
    const g = (_b = (_a2 = get(bucketCache)[bucket]) == null ? void 0 : _a2.groups) == null ? void 0 : _b.find((g2) => g2.group_name === groupName);
    return (g == null ? void 0 : g.display_name) || groupName;
  }
  function spawnSubject(type = "person", overrides = {}) {
    const idx = get(nextSubjectIdx);
    const letter = SUBJECT_LETTERS[idx % 26] || "?";
    const id = `subj_${Date.now()}_${idx}`;
    const subj = {
      id,
      type,
      name: overrides.name || `Subject ${letter}`,
      letter,
      character: overrides.character || null,
      regionName: overrides.regionName ?? null,
      slots: {},
      freeform: [],
      // Section-anchored freeform — phrases the parser couldn't bind to
      // any chip but knew came from a specific section. Emitted back into
      // their section on compose so an edited-but-unrecognized outfit
      // chip stays in `// Outfit:` instead of leaking into the subject
      // body. Keys mirror the parser's section taxonomy.
      sectionFreeform: { outfit: [], pose: [], interaction: [], scene: [] },
      // Active outfit/pose carry the chosen preset's identity (id, name,
      // source character) so the trigger button can render its label even
      // when the preset is from a different character than `character`.
      activeOutfit: null,
      activePose: null,
      // Snapshots of what the active outfit/pose preset injected. Used to
      // remove the previous preset's contribution before applying a new one,
      // so switching presets is a real delta — not stacking.
      outfitSnapshot: null,
      poseSnapshot: null,
      // Per-section expansion. Section keys map to category keys
      // (appearance, clothing, pose). When false/missing, empty slot rows
      // are hidden in that section. Defaults to all collapsed.
      expandedSections: {},
      // Identity assertions split out of freeform — bound character tag
      // chips like (cammy_white:1.1). Rendered as the first row of the
      // Appearance section.
      identityTokens: [],
      // Modifiers — count/solo tokens (1girl, 2girls, solo, etc.).
      // Picker-driven and identity-agnostic so a blank subject can
      // declare them.
      modifiers: []
    };
    set(subjects, [...get(subjects), subj], true);
    set(nextSubjectIdx, idx + 1);
    set(activeSubjectId, id);
    return subj;
  }
  function characterToOption(char) {
    return {
      kind: "character",
      kindLabel: "Character",
      tag: char.tag,
      display: char.display || char.tag,
      series: char.series || "",
      base_tags: char.base_tags || "",
      base_natlang: char.base_natlang || ""
    };
  }
  function castToOption(item, group) {
    const subDef = SUBJECT_SUBITEMS.find((s) => s.filter === group);
    return {
      kind: "cast",
      kindLabel: (subDef == null ? void 0 : subDef.label) || group,
      group,
      tag: item.item_tag,
      display: item.display_name || item.item_tag,
      series: "",
      base_tags: item.base_tags || "",
      base_natlang: item.base_natlang || ""
    };
  }
  async function ensureSubjectBucketsLoaded() {
    const subjectBuckets = CATEGORIES.filter((c) => c.scope === "subject" && c.enabled && c.bucket).map((c) => c.bucket);
    await Promise.all(subjectBuckets.map((b) => loadBucket(b)));
  }
  async function pickIdentityFromBrowser(option) {
    const subj = get(activeSubject);
    if (subj && subj.character) {
      set(pendingIdentitySwap, { subjId: subj.id, current: subj.character, next: option }, true);
      return;
    }
    if (subj && !subj.character) {
      await applyIdentity(subj.id, option);
      return;
    }
    await spawnSubjectWithIdentity(option);
  }
  async function pickIdentityFromDropdown(option) {
    const subjId = get(identityPickerOpen);
    closeIdentityPicker();
    const subj = get(subjects).find((s) => s.id === subjId);
    if (!subj) return;
    if (subj.character) {
      set(pendingIdentitySwap, { subjId, current: subj.character, next: option }, true);
      return;
    }
    await applyIdentity(subjId, option);
  }
  async function fetchCharacterDefaultOutfit(characterTag) {
    try {
      const res = await fetch(`/promptchain/tag-builder/outfits?scope_character=${encodeURIComponent(characterTag)}&per_page=50`);
      if (!res.ok) return null;
      const data = await res.json();
      return (data.results || []).find((r) => r.character_tag === characterTag && r.is_default === 1) || null;
    } catch {
      return null;
    }
  }
  async function applyIdentity(subjId, option) {
    await ensureSubjectBucketsLoaded();
    const { matched, freeform: rawFreeform } = parseTagsToSlots(option.base_tags);
    const {
      identity: identityTokens,
      modifiers: parsedModifiers,
      free: freeform
    } = partitionTokens(rawFreeform, identityMatchToken(option));
    let characterOverrides = {};
    if (option.kind === "character" && option.tag) {
      try {
        const res = await fetch(`/promptchain/tag-builder/characters/${encodeURIComponent(option.tag)}/overrides`);
        if (res.ok) {
          const data = await res.json();
          characterOverrides = data.overrides || {};
        }
      } catch {
      }
    }
    set(
      subjects,
      get(subjects).map((s) => {
        var _a2;
        if (s.id !== subjId) return s;
        const nextSlots = { ...s.slots };
        for (const [catKey, groups] of Object.entries(matched)) {
          const cat = { ...nextSlots[catKey] || {} };
          for (const [grp, items] of Object.entries(groups)) cat[grp] = items;
          nextSlots[catKey] = cat;
        }
        const prevAutoName = ((_a2 = s.character) == null ? void 0 : _a2.display) || `Subject ${s.letter}`;
        const isAutoNamed = s.name === prevAutoName;
        const mergedModifiers = mergeFreeform(s.modifiers || [], parsedModifiers);
        return {
          ...s,
          name: isAutoNamed ? option.display || option.tag : s.name,
          character: {
            tag: option.tag,
            display: option.display,
            series: option.series,
            base_tags: option.base_tags,
            base_natlang: option.base_natlang,
            kind: option.kind,
            group: option.group || null,
            overrides: characterOverrides,
            commentHeader: defaultCharacterCommentHeader(option)
          },
          slots: nextSlots,
          freeform,
          identityTokens,
          modifiers: mergedModifiers
        };
      }),
      true
    );
    set(activeSubjectId, subjId, true);
    if (option.kind === "character" && option.tag) {
      const boundSubj = get(subjects).find((s) => s.id === subjId);
      if (boundSubj && !boundSubj.activeOutfit) {
        const def = await fetchCharacterDefaultOutfit(option.tag);
        if (def) applyPreset(subjId, "outfit", presetRowToOption(def, "outfit"));
      }
    }
  }
  async function spawnSubjectWithIdentity(option) {
    let characterOverrides = {};
    if (option.kind === "character" && option.tag) {
      try {
        const res = await fetch(`/promptchain/tag-builder/characters/${encodeURIComponent(option.tag)}/overrides`);
        if (res.ok) {
          const data = await res.json();
          characterOverrides = data.overrides || {};
        }
      } catch {
      }
    }
    const subj = spawnSubject("person", {
      name: option.display || option.tag,
      character: {
        tag: option.tag,
        display: option.display,
        series: option.series,
        base_tags: option.base_tags,
        base_natlang: option.base_natlang,
        kind: option.kind,
        group: option.group || null,
        overrides: characterOverrides,
        commentHeader: defaultCharacterCommentHeader(option)
      }
    });
    await ensureSubjectBucketsLoaded();
    const { matched, freeform: rawFreeform } = parseTagsToSlots(option.base_tags);
    const { identity: identityTokens, modifiers, free: freeform } = partitionTokens(rawFreeform, identityMatchToken(option));
    set(
      subjects,
      get(subjects).map((s) => s.id === subj.id ? { ...s, slots: matched, freeform, identityTokens, modifiers } : s),
      true
    );
    if (option.kind === "character" && option.tag) {
      const def = await fetchCharacterDefaultOutfit(option.tag);
      if (def) applyPreset(subj.id, "outfit", presetRowToOption(def, "outfit"));
    }
  }
  function confirmIdentitySwap() {
    if (!get(pendingIdentitySwap)) return;
    const pending = get(pendingIdentitySwap);
    set(pendingIdentitySwap, null);
    applyIdentity(pending.subjId, pending.next);
  }
  function cancelIdentitySwap() {
    set(pendingIdentitySwap, null);
  }
  function unbindIdentity(subjId) {
    set(
      subjects,
      get(subjects).map((s) => {
        var _a2;
        if (s.id !== subjId) return s;
        const wasAutoNamed = s.name === (((_a2 = s.character) == null ? void 0 : _a2.display) || `Subject ${s.letter}`);
        return {
          ...s,
          name: wasAutoNamed ? `Subject ${s.letter}` : s.name,
          character: null,
          identityTokens: []
        };
      }),
      true
    );
  }
  function toggleIdentityPicker(subjId, triggerEl) {
    if (get(identityPickerOpen) === subjId) {
      closeIdentityPicker();
      return;
    }
    openIdentityPicker(subjId, triggerEl);
  }
  function openIdentityPicker(subjId, triggerEl) {
    set(identityPickerOpen, subjId, true);
    set(identityPickerQuery, "");
    if (triggerEl) {
      const r = triggerEl.getBoundingClientRect();
      set(
        identityPickerRect,
        {
          left: r.left,
          top: r.bottom + 4,
          width: Math.max(280, r.width)
        },
        true
      );
    }
    loadIdentityChars("");
    requestAnimationFrame(() => identityPickerSearchEl == null ? void 0 : identityPickerSearchEl.focus());
  }
  function closeIdentityPicker() {
    set(identityPickerOpen, null);
    if (identityPickerHandle) {
      clearTimeout(identityPickerHandle);
      identityPickerHandle = null;
    }
  }
  user_effect(() => {
    if (get(identityPickerOpen) === null) return;
    const q = get(identityPickerQuery);
    if (identityPickerHandle) clearTimeout(identityPickerHandle);
    identityPickerHandle = setTimeout(() => loadIdentityChars(q), 200);
  });
  async function loadIdentityChars(query) {
    set(identityCharLoading, true);
    try {
      const params = new URLSearchParams({ page: "1", per_page: "60", sort: "post_count" });
      if (query) params.set("search", query);
      params.set("natlang_status", "normalized");
      const res = await fetch(`/promptchain/tag-builder/characters?${params}`);
      const data = res.ok ? await res.json() : { characters: [] };
      set(identityCharResults, data.characters || [], true);
    } catch (e) {
      set(identityCharResults, [], true);
    }
    set(identityCharLoading, false);
  }
  let identityResults = user_derived(() => {
    var _a2;
    const q = get(identityPickerQuery).trim().toLowerCase().replace(/[_\s]+/g, " ");
    const out = [];
    for (const c of get(identityCharResults)) out.push(characterToOption(c));
    for (const sub of SUBJECT_SUBITEMS) {
      if (sub.source !== "cast") continue;
      const items = ((_a2 = get(castCache)[sub.filter]) == null ? void 0 : _a2.items) || [];
      for (const it of items) {
        if (q) {
          const d = (it.display_name || it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
          const t = (it.item_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
          if (!d.includes(q) && !t.includes(q)) continue;
        }
        out.push(castToOption(it, sub.filter));
      }
    }
    return out;
  });
  user_effect(() => {
    if (get(identityPickerOpen) === null) return;
    function onDocClick(e) {
      if (e.target.closest(".pcr-atb2-identity-dd")) return;
      if (e.target.closest(".pcr-atb2-identity-trigger")) return;
      closeIdentityPicker();
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  });
  function togglePresetPicker(kind, subjId, triggerEl) {
    var _a2, _b;
    if (((_a2 = get(presetPickerOpen)) == null ? void 0 : _a2.kind) === kind && ((_b = get(presetPickerOpen)) == null ? void 0 : _b.subjId) === subjId) {
      closePresetPicker();
      return;
    }
    openPresetPicker(kind, subjId, triggerEl);
  }
  function openPresetPicker(kind, subjId, triggerEl) {
    var _a2;
    set(presetPickerOpen, { kind, subjId }, true);
    set(presetPickerQuery, "");
    if (triggerEl) {
      const r = triggerEl.getBoundingClientRect();
      set(
        presetPickerRect,
        {
          left: r.left,
          top: r.bottom + 4,
          width: Math.max(320, r.width)
        },
        true
      );
    }
    const subj = get(subjects).find((s) => s.id === subjId);
    const scope = ((_a2 = subj == null ? void 0 : subj.character) == null ? void 0 : _a2.kind) === "character" ? subj.character.tag : "";
    loadPresets(kind, "", scope);
    requestAnimationFrame(() => presetPickerSearchEl == null ? void 0 : presetPickerSearchEl.focus());
  }
  function closePresetPicker() {
    set(presetPickerOpen, null);
    if (presetPickerHandle) {
      clearTimeout(presetPickerHandle);
      presetPickerHandle = null;
    }
  }
  user_effect(() => {
    var _a2;
    if (!get(presetPickerOpen)) return;
    const q = get(presetPickerQuery);
    const kind = get(presetPickerOpen).kind;
    const subj = get(subjects).find((s) => s.id === get(presetPickerOpen).subjId);
    const scope = ((_a2 = subj == null ? void 0 : subj.character) == null ? void 0 : _a2.kind) === "character" ? subj.character.tag : "";
    if (presetPickerHandle) clearTimeout(presetPickerHandle);
    presetPickerHandle = setTimeout(() => loadPresets(kind, q, scope), 200);
  });
  async function loadPresets(kind, query, scope) {
    set(presetPickerLoading, true);
    try {
      const path = kind === "outfit" ? "outfits" : "poses";
      const params = new URLSearchParams({ page: "1", per_page: "60" });
      if (query) params.set("search", query);
      if (scope) params.set("scope_character", scope);
      const res = await fetch(`/promptchain/tag-builder/${path}?${params}`);
      const data = res.ok ? await res.json() : { results: [] };
      set(presetPickerResults, data.results || [], true);
    } catch (e) {
      set(presetPickerResults, [], true);
    }
    set(presetPickerLoading, false);
  }
  function parseTagArray(jsonStr) {
    if (!jsonStr) return [];
    try {
      const v = JSON.parse(jsonStr);
      return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : [];
    } catch {
      return [];
    }
  }
  function presetRowToOption(row, kind) {
    const common = {
      id: row.id,
      character_tag: row.character_tag,
      character_display: row.character_display,
      character_series: row.character_series,
      overrides: row.overrides || {},
      appearance_adds: parseTagArray(row.appearance_adds),
      appearance_removes: parseTagArray(row.appearance_removes)
    };
    if (kind === "outfit") {
      return {
        ...common,
        name: row.outfit_name,
        tags: row.outfit_tags,
        natlang: row.outfit_natlang
      };
    }
    return {
      ...common,
      name: row.pose_name,
      tags: row.pose_tags,
      natlang: row.pose_natlang
    };
  }
  function pickPresetFromDropdown(row) {
    if (!get(presetPickerOpen)) return;
    const { kind, subjId } = get(presetPickerOpen);
    closePresetPicker();
    applyPreset(subjId, kind, presetRowToOption(row, kind));
  }
  user_effect(() => {
    if (!get(presetPickerOpen)) return;
    function onDocClick(e) {
      if (e.target.closest(".pcr-atb2-preset-dd")) return;
      if (e.target.closest(".pcr-atb2-preset-trigger")) return;
      closePresetPicker();
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  });
  function removePreset(subjId, kind) {
    set(
      subjects,
      get(subjects).map((s) => {
        if (s.id !== subjId) return s;
        const snap = kind === "outfit" ? s.outfitSnapshot : s.poseSnapshot;
        let next = subtractSnapshot(s, snap);
        if (kind === "outfit") {
          next = { ...next, activeOutfit: null, outfitSnapshot: null };
        } else {
          next = { ...next, activePose: null, poseSnapshot: null };
        }
        return next;
      }),
      true
    );
  }
  function subtractSnapshot(s, snapshot) {
    if (!snapshot) return s;
    const nextSlots = { ...s.slots };
    for (const [catKey, groups] of Object.entries(snapshot.matched || {})) {
      if (!nextSlots[catKey]) continue;
      const cat = { ...nextSlots[catKey] };
      for (const [grp, items] of Object.entries(groups)) {
        const drop = new Set(items.map((i) => i.item_tag));
        const filtered = (cat[grp] || []).filter((x) => !drop.has(x.item_tag));
        if (filtered.length) cat[grp] = filtered;
        else delete cat[grp];
      }
      if (Object.keys(cat).length) nextSlots[catKey] = cat;
      else delete nextSlots[catKey];
    }
    const dropFree = new Set(snapshot.freeform || []);
    const nextFreeform = (s.freeform || []).filter((t) => !dropFree.has(t));
    return { ...s, slots: nextSlots, freeform: nextFreeform };
  }
  function applyPreset(subjId, kind, option) {
    const parse = parseTagsToSlots(option.tags || "");
    const marker = {
      id: option.id,
      character_tag: option.character_tag,
      character_display: option.character_display,
      character_series: option.character_series || "",
      name: option.name,
      natlang: option.natlang || "",
      overrides: option.overrides || {},
      appearance_adds: option.appearance_adds || [],
      appearance_removes: option.appearance_removes || []
    };
    set(
      subjects,
      get(subjects).map((s) => {
        if (s.id !== subjId) return s;
        const prev = kind === "outfit" ? s.outfitSnapshot : s.poseSnapshot;
        let next = subtractSnapshot(s, prev);
        const nextSlots = { ...next.slots };
        for (const [catKey, groups] of Object.entries(parse.matched)) {
          const cat = { ...nextSlots[catKey] || {} };
          for (const [grp, items] of Object.entries(groups)) {
            const existing = cat[grp] || [];
            const have = new Set(existing.map((i) => i.item_tag));
            cat[grp] = [...existing, ...items.filter((i) => !have.has(i.item_tag))];
          }
          nextSlots[catKey] = cat;
        }
        next = {
          ...next,
          slots: nextSlots,
          freeform: mergeFreeform(next.freeform, parse.freeform)
        };
        if (kind === "outfit") {
          next.activeOutfit = marker;
          next.outfitSnapshot = parse;
        } else {
          next.activePose = marker;
          next.poseSnapshot = parse;
        }
        return next;
      }),
      true
    );
  }
  function parseTagsToSlots(tagString) {
    const matched = {};
    const freeformSet = /* @__PURE__ */ new Set();
    const freeform = [];
    if (!tagString) return { matched, freeform };
    const tokens = tagString.split(",").map((t) => t.trim()).filter(Boolean);
    const pushFree = (t) => {
      if (!freeformSet.has(t)) {
        freeformSet.add(t);
        freeform.push(t);
      }
    };
    for (const tok of tokens) {
      const stripped = tok.replace(/^\(([^:)]+):[^)]+\)$/, "$1").replace(/^\(([^)]+)\)$/, "$1");
      const lookup = get(tagToItem).get(stripped);
      if (!lookup) {
        pushFree(tok);
        continue;
      }
      const cat = CATEGORIES.find((c) => c.bucket === lookup.bucket);
      if (!cat) {
        pushFree(tok);
        continue;
      }
      if (!matched[cat.key]) matched[cat.key] = {};
      if (!matched[cat.key][lookup.group]) matched[cat.key][lookup.group] = [];
      if (!matched[cat.key][lookup.group].some((x) => x.item_tag === lookup.item.item_tag)) {
        matched[cat.key][lookup.group].push(lookup.item);
      }
    }
    return { matched, freeform };
  }
  function mergeFreeform(a, b) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const arr of [a || [], b || []]) {
      for (const t of arr) {
        if (!seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      }
    }
    return out;
  }
  function makeBlankSubject(letter, idx) {
    return {
      id: `subj_${Date.now()}_${idx}`,
      type: "person",
      name: `Subject ${letter}`,
      letter,
      character: null,
      slots: {},
      freeform: [],
      sectionFreeform: { outfit: [], pose: [], interaction: [], scene: [] },
      activeOutfit: null,
      activePose: null,
      outfitSnapshot: null,
      poseSnapshot: null,
      expandedSections: {},
      identityTokens: [],
      modifiers: [],
      // Which `$name{}` regional block this subject emits back into (Phase 2
      // whole-composition edit). null = un-regioned; in region mode compose
      // assigns a fresh `$mannequinN` on output.
      regionName: null
    };
  }
  async function detectOutfitsAndPosesFor(subj) {
    var _a2;
    if (!((_a2 = subj.character) == null ? void 0 : _a2.tag)) return;
    if (subj.character.kind === "cast") return;
    const charTag = subj.character.tag;
    const clothingChips = [];
    for (const grp of Object.values(subj.slots.clothing || {})) {
      for (const it of grp) clothingChips.push(it.item_tag);
    }
    if (clothingChips.length) {
      try {
        const res = await fetch(`/promptchain/tag-builder/detect-outfit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chips: clothingChips, character_tag: charTag, threshold: 0.8 })
        });
        const data = await res.json();
        const m = (data.matches || [])[0];
        if (m) {
          const oRes = await fetch(`/promptchain/tag-builder/outfits?scope_character=${encodeURIComponent(charTag)}&per_page=200`);
          if (oRes.ok) {
            const oData = await oRes.json();
            const row = (oData.results || []).find((r) => r.id === m.outfit_id);
            if (row) {
              subj.activeOutfit = {
                id: row.id,
                character_tag: row.character_tag,
                character_display: row.character_display,
                character_series: row.character_series || "",
                name: row.outfit_name,
                natlang: row.outfit_natlang || "",
                overrides: row.overrides || {},
                appearance_adds: parseTagArray(row.appearance_adds),
                appearance_removes: parseTagArray(row.appearance_removes)
              };
              subj.outfitSnapshot = parseTagsToSlots(row.outfit_tags || "");
            }
          }
        }
      } catch {
      }
    }
    const poseChips = [];
    for (const grp of Object.values(subj.slots.pose || {})) {
      for (const it of grp) poseChips.push(it.item_tag);
    }
    if (poseChips.length) {
      try {
        const res = await fetch(`/promptchain/tag-builder/detect-pose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chips: poseChips, character_tag: charTag, threshold: 0.8 })
        });
        const data = await res.json();
        const m = (data.matches || [])[0];
        if (m) {
          const pRes = await fetch(`/promptchain/tag-builder/poses?scope_character=${encodeURIComponent(charTag)}&per_page=200`);
          if (pRes.ok) {
            const pData = await pRes.json();
            const row = (pData.results || []).find((r) => r.id === m.pose_id);
            if (row) {
              subj.activePose = {
                id: row.id,
                character_tag: row.character_tag,
                character_display: row.character_display,
                character_series: row.character_series || "",
                name: row.pose_name,
                natlang: row.pose_natlang || "",
                overrides: row.overrides || {},
                appearance_adds: parseTagArray(row.appearance_adds),
                appearance_removes: parseTagArray(row.appearance_removes)
              };
              subj.poseSnapshot = parseTagsToSlots(row.pose_tags || "");
            }
          }
        }
      } catch {
      }
    }
  }
  function addChipToSubject(subj, lookup) {
    const cat = CATEGORIES.find((c) => c.bucket === lookup.bucket);
    if (!cat || cat.scope !== "subject") return false;
    if (!subj.slots[cat.key]) subj.slots[cat.key] = {};
    if (!subj.slots[cat.key][lookup.group]) subj.slots[cat.key][lookup.group] = [];
    if (!subj.slots[cat.key][lookup.group].some((x) => x.item_tag === lookup.item.item_tag)) {
      subj.slots[cat.key][lookup.group].push(lookup.item);
      return true;
    }
    return false;
  }
  async function fetchCharacterOverrides(tag) {
    try {
      const res = await fetch(`/promptchain/tag-builder/characters/${encodeURIComponent(tag)}/overrides`);
      if (res.ok) return (await res.json()).overrides || {};
    } catch {
    }
    return {};
  }
  function buildChipNatlangMap() {
    const map = /* @__PURE__ */ new Map();
    for (const [bucket, data] of Object.entries(get(bucketCache))) {
      if (!(data == null ? void 0 : data.items)) continue;
      for (const it of data.items) {
        const nl = (it.base_natlang || "").trim();
        if (!nl) continue;
        if (!map.has(nl)) map.set(nl, { bucket, group: it.item_group, item: it });
      }
    }
    return map;
  }
  function buildMultiCommaChipList() {
    const out = [];
    for (const [bucket, data] of Object.entries(get(bucketCache))) {
      if (!(data == null ? void 0 : data.items)) continue;
      for (const it of data.items) {
        const nl = (it.base_natlang || "").trim().replace(/\.\s*$/, "");
        if (!nl || !nl.includes(",")) continue;
        out.push({
          natlang: nl,
          lookup: { bucket, group: it.item_group, item: it }
        });
      }
    }
    out.sort((a, b) => b.natlang.length - a.natlang.length);
    return out;
  }
  function scanMultiCommaChips(text2, list) {
    if (!text2 || !list.length) return { claims: [], remaining: text2 };
    const taken = [];
    const matches = [];
    for (const entry of list) {
      let from = 0;
      while (from <= text2.length) {
        const at = text2.indexOf(entry.natlang, from);
        if (at < 0) break;
        const end = at + entry.natlang.length;
        const before = at === 0 ? "" : text2.charAt(at - 1);
        const after = end >= text2.length ? "" : text2.charAt(end);
        const okBefore = at === 0 || /[.,;\s]/.test(before);
        const okAfter = end >= text2.length || /[.,;\s]/.test(after);
        let overlap = false;
        for (const [s, e] of taken) {
          if (at < e && end > s) {
            overlap = true;
            break;
          }
        }
        if (okBefore && okAfter && !overlap) {
          matches.push({ lookup: entry.lookup, start: at, end });
          taken.push([at, end]);
          from = end;
        } else {
          from = at + 1;
        }
      }
    }
    taken.sort((a, b) => a[0] - b[0]);
    matches.sort((a, b) => a.start - b.start);
    let remaining = "";
    let pos = 0;
    for (const [s, e] of taken) {
      remaining += text2.slice(pos, s);
      pos = e;
    }
    remaining += text2.slice(pos);
    remaining = remaining.replace(/\s*,\s*,\s*/g, ", ").replace(/\s*\.\s*,\s*/g, ". ").replace(/\s*,\s*\.\s*/g, ". ").replace(/^[\s,;.]+|[\s,;.]+$/g, "").replace(/\s{2,}/g, " ").trim();
    return { claims: matches.map((m) => m.lookup), remaining };
  }
  function applyMultiCommaClaims(claims, subj, sceneSelectionsTarget) {
    if (!(claims == null ? void 0 : claims.length)) return;
    for (const lookup of claims) {
      const cat = CATEGORIES.find((c) => c.bucket === lookup.bucket);
      if ((cat == null ? void 0 : cat.scope) === "subject" && subj) {
        addChipToSubject(subj, lookup);
      } else if ((cat == null ? void 0 : cat.scope) === "global" && sceneSelectionsTarget) {
        if (!sceneSelectionsTarget[lookup.group]) sceneSelectionsTarget[lookup.group] = [];
        if (!sceneSelectionsTarget[lookup.group].some((x) => x.item_tag === lookup.item.item_tag)) {
          sceneSelectionsTarget[lookup.group].push(lookup.item);
        }
      }
    }
  }
  function buildModifierNatlangMap() {
    const map = /* @__PURE__ */ new Map();
    for (const [tok, nl] of Object.entries(MODIFIER_NATLANG)) {
      if (!map.has(nl)) map.set(nl, tok);
    }
    return map;
  }
  function buildCastIdentityMap() {
    const map = /* @__PURE__ */ new Map();
    for (const [group, entry] of Object.entries(get(castCache))) {
      for (const item of (entry == null ? void 0 : entry.items) || []) {
        const first = (item.base_tags || "").split(",").map((s) => s.trim()).filter(Boolean)[0];
        const key = (first || item.item_tag || "").toLowerCase();
        if (!key) continue;
        if (MODIFIER_TOKENS.has(key)) continue;
        if (get(tagToItem).has(key) || get(tagToItem).has(key.replace(/ /g, "_"))) continue;
        if (normalizedCharacterTags.has(key)) continue;
        const spaceKey = key.replace(/_/g, " ");
        if (!map.has(key)) map.set(key, { item, group });
        if (!map.has(spaceKey)) map.set(spaceKey, { item, group });
      }
    }
    return map;
  }
  function reverseOverrides(overrides) {
    const map = /* @__PURE__ */ new Map();
    for (const [chipTag, nl] of Object.entries(overrides || {})) {
      if (!map.has(nl)) map.set(nl, chipTag);
    }
    return map;
  }
  async function parseNatlangPrompt(sectionedChunks, charRecord, skipPhrases = null, commentHeader = null, multiCommaClaims = []) {
    var _a2, _b;
    const overrides = await fetchCharacterOverrides(charRecord.tag);
    const letter = SUBJECT_LETTERS[0];
    const subj = {
      ...makeBlankSubject(letter, 1),
      name: charRecord.display || charRecord.tag,
      character: {
        tag: charRecord.tag,
        display: charRecord.display,
        series: charRecord.series,
        base_tags: charRecord.base_tags || "",
        base_natlang: charRecord.base_natlang || "",
        kind: "character",
        group: null,
        overrides,
        // Verbatim header text from the user's prompt, or null if there
        // wasn't one above the character's base_natlang line. Compose
        // re-emits this so we don't duplicate or overwrite the user.
        commentHeader
      }
    };
    const [outfitData, poseData] = await Promise.all([
      fetch(`/promptchain/tag-builder/outfits?scope_character=${encodeURIComponent(charRecord.tag)}&per_page=200`).then((r) => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] })),
      fetch(`/promptchain/tag-builder/poses?scope_character=${encodeURIComponent(charRecord.tag)}&per_page=200`).then((r) => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
    ]);
    const outfits = outfitData.results || [];
    const poses = poseData.results || [];
    const outfitOverrideByNatlang = /* @__PURE__ */ new Map();
    for (const o of outfits) {
      for (const [chipTag, nl] of Object.entries(o.overrides || {})) {
        if (!outfitOverrideByNatlang.has(nl)) {
          outfitOverrideByNatlang.set(nl, { id: o.id, chip_tag: chipTag, row: o });
        }
      }
    }
    const poseOverrideByNatlang = /* @__PURE__ */ new Map();
    for (const p of poses) {
      for (const [chipTag, nl] of Object.entries(p.overrides || {})) {
        if (!poseOverrideByNatlang.has(nl)) {
          poseOverrideByNatlang.set(nl, { id: p.id, chip_tag: chipTag, row: p });
        }
      }
    }
    const chipByNatlang = buildChipNatlangMap();
    const modifierByNatlang = buildModifierNatlangMap();
    const charOverrideByNatlang = reverseOverrides(overrides);
    const outfitVotes = {};
    const poseVotes = {};
    const sceneTarget = { ...get(sceneSelections) };
    for (const { phrase: chunkRaw, section } of sectionedChunks) {
      let phrase = chunkRaw.trim().replace(/\.$/, "");
      if (!phrase) continue;
      phrase = phrase.replace(/^[Ww]earing(?:\s+an?)?\s+/, "");
      if (skipPhrases && skipPhrases.has(phrase)) continue;
      if (modifierByNatlang.has(phrase)) {
        const tok = modifierByNatlang.get(phrase);
        if (!subj.modifiers.includes(tok)) subj.modifiers.push(tok);
        continue;
      }
      if (charOverrideByNatlang.has(phrase)) {
        const chipTag = charOverrideByNatlang.get(phrase);
        const lookup = get(tagToItem).get(chipTag);
        if (lookup && addChipToSubject(subj, lookup)) continue;
      }
      if (outfitOverrideByNatlang.has(phrase)) {
        const { id, chip_tag } = outfitOverrideByNatlang.get(phrase);
        const lookup = get(tagToItem).get(chip_tag);
        if (lookup && addChipToSubject(subj, lookup)) {
          outfitVotes[id] = (outfitVotes[id] || 0) + 1;
          continue;
        }
      }
      if (poseOverrideByNatlang.has(phrase)) {
        const { id, chip_tag } = poseOverrideByNatlang.get(phrase);
        const lookup = get(tagToItem).get(chip_tag);
        if (lookup && addChipToSubject(subj, lookup)) {
          poseVotes[id] = (poseVotes[id] || 0) + 1;
          continue;
        }
      }
      if (chipByNatlang.has(phrase)) {
        const lookup = chipByNatlang.get(phrase);
        const cat = CATEGORIES.find((c) => c.bucket === lookup.bucket);
        if ((cat == null ? void 0 : cat.scope) === "subject" && addChipToSubject(subj, lookup)) continue;
        if ((cat == null ? void 0 : cat.scope) === "global") {
          const grp = lookup.group;
          if (!sceneTarget[grp]) sceneTarget[grp] = [];
          if (!sceneTarget[grp].some((x) => x.item_tag === lookup.item.item_tag)) {
            sceneTarget[grp].push(lookup.item);
          }
          continue;
        }
      }
      const peeled = await peelNatlangModifiers(phrase);
      if (peeled) {
        const stamped = { ...peeled.lookup.item, modifiers: peeled.modifiers };
        if (addChipToSubject(subj, { ...peeled.lookup, item: stamped })) continue;
      }
      const furnMatch = matchFurnitureInteraction(phrase);
      if (furnMatch) {
        if (!subj.slots.furniture) subj.slots.furniture = {};
        if (!subj.slots.furniture[furnMatch.group]) subj.slots.furniture[furnMatch.group] = [];
        const arr = subj.slots.furniture[furnMatch.group];
        if (!arr.some((x) => x.item_tag === furnMatch.chip.item_tag)) {
          arr.push(furnMatch.chip);
        }
        continue;
      }
      if (section && subj.sectionFreeform[section]) {
        subj.sectionFreeform[section].push(phrase);
      } else {
        subj.freeform.push(phrase);
      }
    }
    const winningOutfitId = (_a2 = Object.entries(outfitVotes).sort((a, b) => b[1] - a[1])[0]) == null ? void 0 : _a2[0];
    if (winningOutfitId) {
      const row = outfits.find((x) => String(x.id) === String(winningOutfitId));
      if (row) {
        subj.activeOutfit = {
          id: row.id,
          character_tag: row.character_tag,
          character_display: row.character_display,
          character_series: row.character_series || "",
          name: row.outfit_name,
          natlang: row.outfit_natlang || "",
          overrides: row.overrides || {},
          appearance_adds: parseTagArray(row.appearance_adds),
          appearance_removes: parseTagArray(row.appearance_removes)
        };
        subj.outfitSnapshot = parseTagsToSlots(row.outfit_tags || "");
      }
    }
    const winningPoseId = (_b = Object.entries(poseVotes).sort((a, b) => b[1] - a[1])[0]) == null ? void 0 : _b[0];
    if (winningPoseId) {
      const row = poses.find((x) => String(x.id) === String(winningPoseId));
      if (row) {
        subj.activePose = {
          id: row.id,
          character_tag: row.character_tag,
          character_display: row.character_display,
          character_series: row.character_series || "",
          name: row.pose_name,
          natlang: row.pose_natlang || "",
          overrides: row.overrides || {},
          appearance_adds: parseTagArray(row.appearance_adds),
          appearance_removes: parseTagArray(row.appearance_removes)
        };
        subj.poseSnapshot = parseTagsToSlots(row.pose_tags || "");
      }
    }
    if (!subj.activeOutfit || !subj.activePose) {
      await detectOutfitsAndPosesFor(subj);
    }
    applyMultiCommaClaims(multiCommaClaims, subj, sceneTarget);
    if (Object.keys(sceneTarget).length) {
      set(sceneSelections, sceneTarget, true);
      set(sceneSpawned, true);
    }
    set(subjects, [subj], true);
    set(nextSubjectIdx, 1);
    set(activeSubjectId, subj.id, true);
  }
  async function parseTagPrompt(sectionedChunks, firstSubjectCommentHeader = void 0, fromRoundTrip = false, multiCommaClaims = []) {
    var _a2, _b;
    const newSubjects = [];
    let currentSubj = null;
    let letterIdx = 0;
    let firstSubjectHeaderApplied = false;
    const ensureSubject = () => {
      if (!currentSubj) {
        const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
        letterIdx++;
        currentSubj = makeBlankSubject(letter, letterIdx);
        if (!firstSubjectHeaderApplied && fromRoundTrip) {
          currentSubj.commentHeader = firstSubjectCommentHeader;
          if (firstSubjectCommentHeader) {
            const parsed = nameFromCommentHeader(firstSubjectCommentHeader);
            if (parsed) currentSubj.name = parsed;
          }
          firstSubjectHeaderApplied = true;
        }
        newSubjects.push(currentSubj);
      }
      return currentSubj;
    };
    const regionSubjects = /* @__PURE__ */ new Map();
    const regionSubjectFor = (region) => {
      let s = regionSubjects.get(region);
      if (!s) {
        const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
        letterIdx++;
        s = makeBlankSubject(letter, letterIdx);
        s.regionName = region;
        regionSubjects.set(region, s);
        newSubjects.push(s);
      }
      currentSubj = s;
      return s;
    };
    const newSceneSelections = {};
    const newSceneFreeform = [];
    const pendingFreeform = [];
    const chipByNatlang = buildChipNatlangMap();
    const modifierByNatlang = buildModifierNatlangMap();
    let castByIdentityToken;
    try {
      castByIdentityToken = buildCastIdentityMap();
    } catch (e) {
      console.error("[TagBuilder2] buildCastIdentityMap failed", e);
      castByIdentityToken = /* @__PURE__ */ new Map();
    }
    console.group("[TagBuilder2.parseTagPrompt]");
    console.log("tokens:", sectionedChunks.map((c) => c.phrase));
    console.log("chipByNatlang.size:", chipByNatlang.size, "tagToItem.size:", get(tagToItem).size);
    console.log("loaded buckets:", Object.entries(get(bucketCache)).filter(([, v]) => v == null ? void 0 : v.loaded).map(([k, v]) => {
      var _a3;
      return `${k}(${((_a3 = v.items) == null ? void 0 : _a3.length) || 0})`;
    }));
    for (const { phrase: tok, section, region } of sectionedChunks) {
      const stripped = tok.replace(/^\((.+):\s*\d+(?:\.\d+)?\)$/, "$1").replace(/^\((.+)\)$/, "$1");
      if (get(regionMode)) {
        if (region) regionSubjectFor(region);
        else currentSubj = null;
      }
      if (normalizedCharacterTags.has(stripped)) {
        try {
          const cRes = await fetch(`/promptchain/tag-builder/characters/${encodeURIComponent(stripped)}`);
          if (cRes.ok) {
            const cData = await cRes.json();
            const overrides = await fetchCharacterOverrides(stripped);
            const charObj = {
              tag: cData.tag,
              display: cData.display,
              series: cData.series,
              base_tags: cData.base_tags || "",
              base_natlang: cData.base_natlang || "",
              kind: "character",
              group: null,
              overrides,
              commentHeader: defaultCharacterCommentHeader({
                kind: "character",
                display: cData.display,
                series: cData.series
              })
            };
            if (get(regionMode) && region) {
              const s = regionSubjectFor(region);
              s.character = charObj;
              s.name = cData.display || cData.tag;
              if (!s.identityTokens.includes(tok)) s.identityTokens.push(tok);
            } else {
              const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
              letterIdx++;
              currentSubj = {
                ...makeBlankSubject(letter, letterIdx),
                name: cData.display || cData.tag,
                character: charObj,
                identityTokens: [tok]
              };
              newSubjects.push(currentSubj);
            }
            continue;
          }
        } catch {
        }
      }
      const castHit = castByIdentityToken.get(stripped.toLowerCase());
      if (castHit) {
        const display = castHit.item.display_name || castHit.item.item_tag;
        const castObj = {
          tag: castHit.item.item_tag,
          display,
          series: "",
          base_tags: castHit.item.base_tags || "",
          base_natlang: castHit.item.base_natlang || "",
          kind: "cast",
          group: castHit.group,
          overrides: {},
          commentHeader: defaultCharacterCommentHeader({ kind: "cast", display, series: "" })
        };
        if (get(regionMode) && region) {
          const s = regionSubjectFor(region);
          s.character = castObj;
          s.name = display;
          if (!s.identityTokens.includes(tok)) s.identityTokens.push(tok);
        } else {
          const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
          letterIdx++;
          currentSubj = {
            ...makeBlankSubject(letter, letterIdx),
            name: display,
            character: castObj,
            identityTokens: [tok]
          };
          newSubjects.push(currentSubj);
        }
        console.log(`✓ "${tok}" → ${castHit.item.item_tag} [cast-identity]`);
        continue;
      }
      if (MODIFIER_TOKENS.has(stripped)) {
        const subj = ensureSubject();
        if (!subj.modifiers.includes(stripped)) subj.modifiers.push(stripped);
        continue;
      }
      let lookup = get(tagToItem).get(stripped);
      let matchPath = lookup ? "tag" : null;
      if (!lookup && stripped.includes(" ")) {
        lookup = get(tagToItem).get(stripped.replace(/ /g, "_"));
        if (lookup) matchPath = "tag(space→_)";
      }
      if (!lookup) {
        lookup = chipByNatlang.get(stripped);
        if (lookup) matchPath = "chipByNatlang";
      }
      if (lookup) {
        const cat = CATEGORIES.find((c) => c.bucket === lookup.bucket);
        if ((cat == null ? void 0 : cat.scope) === "global") {
          if (!newSceneSelections[lookup.group]) newSceneSelections[lookup.group] = [];
          if (!newSceneSelections[lookup.group].some((x) => x.item_tag === lookup.item.item_tag)) {
            newSceneSelections[lookup.group].push(lookup.item);
          }
          console.log(`✓ "${tok}" → ${lookup.item.item_tag} [${matchPath}, scene]`);
          continue;
        }
        if ((cat == null ? void 0 : cat.scope) === "subject") {
          addChipToSubject(ensureSubject(), lookup);
          console.log(`✓ "${tok}" → ${lookup.item.item_tag} [${matchPath}, ${lookup.bucket}]`);
          continue;
        }
      }
      if (modifierByNatlang.has(stripped)) {
        const tokId = modifierByNatlang.get(stripped);
        const subj = ensureSubject();
        if (!subj.modifiers.includes(tokId)) subj.modifiers.push(tokId);
        console.log(`✓ "${tok}" → ${tokId} [modifier-natlang]`);
        continue;
      }
      const peeled = await peelTagModifiers(stripped);
      if (peeled) {
        const subj = ensureSubject();
        const stamped = { ...peeled.lookup.item, modifiers: peeled.modifiers };
        addChipToSubject(subj, { ...peeled.lookup, item: stamped });
        console.log(`✓ "${tok}" → ${peeled.lookup.item.item_tag} [peelTag]`);
        continue;
      }
      const peeledNl = await peelNatlangModifiers(stripped);
      if (peeledNl) {
        const subj = ensureSubject();
        const stamped = { ...peeledNl.lookup.item, modifiers: peeledNl.modifiers };
        addChipToSubject(subj, { ...peeledNl.lookup, item: stamped });
        console.log(`✓ "${tok}" → ${peeledNl.lookup.item.item_tag} [peelNatlang]`);
        continue;
      }
      const furnMatch = matchFurnitureInteraction(stripped);
      if (furnMatch) {
        const subj = ensureSubject();
        if (!subj.slots.furniture) subj.slots.furniture = {};
        if (!subj.slots.furniture[furnMatch.group]) subj.slots.furniture[furnMatch.group] = [];
        const arr = subj.slots.furniture[furnMatch.group];
        if (!arr.some((x) => x.item_tag === furnMatch.chip.item_tag)) arr.push(furnMatch.chip);
        console.log(`✓ "${tok}" → ${furnMatch.chip.item_tag} [furniture-interaction]`);
        continue;
      }
      console.log(`✗ "${tok}" → deferred freeform`);
      pendingFreeform.push({ tok, section, subj: currentSubj, region });
    }
    console.groupEnd();
    for (const { tok, section, subj, region } of pendingFreeform) {
      if (region) {
        const target2 = subj || regionSubjects.get(region);
        if (target2) {
          const bucket2 = section && ((_a2 = target2.sectionFreeform) == null ? void 0 : _a2[section]) ? target2.sectionFreeform[section] : target2.freeform;
          if (!bucket2.includes(tok)) bucket2.push(tok);
          continue;
        }
      }
      if (editScope() === "global" || section === "scene") {
        if (!newSceneFreeform.includes(tok)) newSceneFreeform.push(tok);
        continue;
      }
      const target = subj || newSubjects[0] || ensureSubject();
      const bucket = section && ((_b = target.sectionFreeform) == null ? void 0 : _b[section]) ? target.sectionFreeform[section] : target.freeform;
      if (!bucket.includes(tok)) bucket.push(tok);
    }
    for (const subj of newSubjects) {
      await detectOutfitsAndPosesFor(subj);
    }
    if (multiCommaClaims.length) {
      let claimSubj = newSubjects[0];
      if (!claimSubj && multiCommaClaims.some((c) => {
        var _a3;
        return ((_a3 = CATEGORIES.find((x) => x.bucket === c.bucket)) == null ? void 0 : _a3.scope) === "subject";
      })) {
        const letter = SUBJECT_LETTERS[letterIdx % 26] || "?";
        letterIdx++;
        claimSubj = makeBlankSubject(letter, letterIdx);
        newSubjects.push(claimSubj);
      }
      applyMultiCommaClaims(multiCommaClaims, claimSubj, newSceneSelections);
    }
    set(subjects, newSubjects, true);
    set(nextSubjectIdx, newSubjects.length, true);
    if (newSubjects.length) set(activeSubjectId, newSubjects[0].id, true);
    if (Object.keys(newSceneSelections).length) {
      set(sceneSelections, newSceneSelections, true);
      set(sceneSpawned, true);
    }
    set(sceneFreeform, newSceneFreeform, true);
    if (newSceneFreeform.length) set(sceneSpawned, true);
  }
  function detectAndBindStyle(tokenStream, rawLines, passthroughLineSet) {
    var _a2, _b;
    const stripIdx = /* @__PURE__ */ new Set();
    if (!((_a2 = get(stylesCache).items) == null ? void 0 : _a2.length) || !tokenStream.length) return stripIdx;
    const candidates = get(stylesCache).items.filter((it) => {
      var _a3;
      return (_a3 = it.tags) == null ? void 0 : _a3.length;
    }).slice().sort((a, b) => b.tags.length - a.tags.length);
    console.log(`[TagBuilder2] detectAndBindStyle: ${candidates.length} preset candidates against ${tokenStream.length} tokens`);
    let bestPreset = null;
    let bestMatchedIdx = null;
    let bestScore = 0;
    for (const preset of candidates) {
      const presetTags = preset.tags;
      const usedStreamIdx = /* @__PURE__ */ new Set();
      const matchedIdx = [];
      for (const ptag of presetTags) {
        for (let i = 0; i < tokenStream.length; i++) {
          if (usedStreamIdx.has(i)) continue;
          if (tokenStream[i].token === ptag) {
            usedStreamIdx.add(i);
            matchedIdx.push(i);
            break;
          }
        }
      }
      if (matchedIdx.length < 2) continue;
      const score = matchedIdx.length / presetTags.length;
      if (score < 0.7) continue;
      const sortedIdx = [...matchedIdx].sort((a, b) => a - b);
      const span = sortedIdx[sortedIdx.length - 1] - sortedIdx[0] + 1;
      const maxAllowedSpan = Math.max(presetTags.length * 2, 6);
      if (span > maxAllowedSpan) continue;
      if (score > bestScore || score === bestScore && presetTags.length > (((_b = bestPreset == null ? void 0 : bestPreset.tags) == null ? void 0 : _b.length) || 0)) {
        bestScore = score;
        bestPreset = preset;
        bestMatchedIdx = sortedIdx;
      }
    }
    if (bestPreset) {
      let commentHeader = null;
      const firstLine = tokenStream[bestMatchedIdx[0]].rawLineIdx;
      for (let r = firstLine - 1; r >= 0; r--) {
        const ln = rawLines[r].trim();
        if (!ln) continue;
        if (/^\/\//.test(ln)) {
          commentHeader = rawLines[r];
          passthroughLineSet.delete(r);
        }
        break;
      }
      const spanStart = bestMatchedIdx[0];
      const spanEnd = bestMatchedIdx[bestMatchedIdx.length - 1];
      const spanTags = [];
      for (let i = spanStart; i <= spanEnd; i++) {
        spanTags.push(tokenStream[i].token);
        stripIdx.add(i);
      }
      set(
        activeStyle,
        {
          id: bestPreset.item_tag,
          name: bestPreset.display_name,
          tags: spanTags,
          commentHeader
        },
        true
      );
      set(styleSpawned, true);
      console.log(`[TagBuilder2] style matched: ${bestPreset.display_name} (${bestMatchedIdx.length}/${bestPreset.tags.length} tags, score=${bestScore.toFixed(2)}), span ${spanStart}..${spanEnd}, commentHeader: ${commentHeader ? JSON.stringify(commentHeader) : "<none>"}`);
    } else {
      console.log(`[TagBuilder2] no style matched`);
    }
    return stripIdx;
  }
  function inferSectionFromHeader(line) {
    const text2 = (line || "").replace(/^\s*\/\/\s*/, "").trim();
    if (!text2) return null;
    if (/^Outfit\b/i.test(text2)) return "outfit";
    if (/^Pose\b/i.test(text2)) return "pose";
    if (/^Interaction\b/i.test(text2)) return "interaction";
    if (/^Scene\b/i.test(text2)) return "scene";
    return null;
  }
  function isVerbatimCustomHeader(line) {
    const text2 = (line || "").replace(/^\s*\/\/\s*/, "").trim();
    if (!text2) return false;
    if (/^(Outfit|Pose|Interaction|Scene|Subject|Character)\b/i.test(text2)) return false;
    if (/^Style\b/i.test(text2) || /^Style:/i.test(text2)) return false;
    return true;
  }
  async function parseInitialPrompt(text2) {
    var _a2, _b;
    const rawLines = text2.split(/\r?\n/);
    set(regionMode, false);
    const passthroughLineSet = /* @__PURE__ */ new Set();
    const tokenStream = [];
    const positiveContentLines = [];
    const positiveContentRawIdx = [];
    const positiveContentSectionStart = [];
    const lineSections = [];
    const lineRegions = [];
    let pendingSectionBreak = false;
    let currentSection = null;
    let currentRegion = null;
    let currentVerbatim = false;
    let inNegative = false;
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (inNegative) {
        passthroughLineSet.add(i);
        continue;
      }
      if (/^Negative Prompt:\s*$/i.test(line.trim())) {
        inNegative = true;
        passthroughLineSet.add(i);
        continue;
      }
      const regionOpen = line.match(/^\s*(\$[A-Za-z]\w*)\s*\{\s*$/);
      if (regionOpen) {
        currentRegion = regionOpen[1];
        set(regionMode, true);
        continue;
      }
      if (currentRegion && /^\s*\}\s*$/.test(line)) {
        currentRegion = null;
        continue;
      }
      if (/^\s*\/\//.test(line)) {
        passthroughLineSet.add(i);
        pendingSectionBreak = true;
        currentSection = inferSectionFromHeader(line);
        currentVerbatim = isVerbatimCustomHeader(line);
        continue;
      }
      if (!line.trim()) {
        passthroughLineSet.add(i);
        continue;
      }
      if (currentVerbatim) {
        passthroughLineSet.add(i);
        continue;
      }
      positiveContentLines.push(line);
      positiveContentRawIdx.push(i);
      positiveContentSectionStart.push(pendingSectionBreak);
      lineSections.push(currentSection);
      lineRegions.push(currentRegion);
      pendingSectionBreak = false;
      for (const part of line.split(/,|\.\s+/)) {
        const t = part.trim().replace(/\.$/, "");
        if (t) tokenStream.push({ token: t, rawLineIdx: i });
      }
    }
    const stripIndices = detectAndBindStyle(tokenStream, rawLines, passthroughLineSet);
    set(preservedPassthrough, rawLines.filter((_, i) => passthroughLineSet.has(i)).join("\n"), true);
    const mcChipList = buildMultiCommaChipList();
    const naturalJoinedRaw = positiveContentLines.map((line, idx) => idx > 0 && positiveContentSectionStart[idx] ? ". " + line : line).join(" ").trim();
    const mcScan = scanMultiCommaChips(naturalJoinedRaw, mcChipList);
    if (mcScan.claims.length) {
      console.log(`[TagBuilder2] multi-comma chip claims: ${mcScan.claims.length}`, mcScan.claims.map((c) => c.item.item_tag));
    }
    const naturalJoined = mcScan.remaining;
    let natlangChar = null;
    for (const c of normalizedCharacters) {
      if (!c.base_natlang) continue;
      const bn = c.base_natlang.replace(/\.\s*$/, "").trim();
      if (!bn) continue;
      let searchFrom = 0;
      while (searchFrom <= naturalJoined.length) {
        const at = naturalJoined.indexOf(bn, searchFrom);
        if (at < 0) break;
        const before = at === 0 ? "" : naturalJoined.charAt(at - 1);
        const after = naturalJoined.charAt(at + bn.length);
        const okBefore = at === 0 || /[.,;\s]/.test(before);
        const okAfter = after === "" || /[.,;\s]/.test(after);
        if (okBefore && okAfter) {
          natlangChar = c;
          at + bn.length;
          break;
        }
        searchFrom = at + 1;
      }
      if (natlangChar) break;
    }
    if (natlangChar && !get(regionMode)) {
      const styleSkip = /* @__PURE__ */ new Set();
      for (const i of stripIndices) styleSkip.add(tokenStream[i].token);
      let charCommentHeader = null;
      const firstPosRawIdx = positiveContentRawIdx[0] ?? -1;
      for (let r = firstPosRawIdx - 1; r >= 0; r--) {
        const ln = rawLines[r].trim();
        if (!ln) continue;
        if (/^\/\//.test(ln)) {
          charCommentHeader = rawLines[r];
          passthroughLineSet.delete(r);
        }
        break;
      }
      set(preservedPassthrough, rawLines.filter((_, i) => passthroughLineSet.has(i)).join("\n"), true);
      const charBase = (natlangChar.base_natlang || "").replace(/\.\s*$/, "").trim();
      const mcSkip = /* @__PURE__ */ new Set();
      for (const claim of mcScan.claims) {
        const cn = (((_a2 = claim == null ? void 0 : claim.item) == null ? void 0 : _a2.base_natlang) || "").trim().replace(/\.\s*$/, "");
        for (const part of cn.split(/,|\.\s+/)) {
          const t = part.trim().replace(/\.$/, "");
          if (t) mcSkip.add(t);
        }
      }
      const sectionedChunks = [];
      for (let lineIdx = 0; lineIdx < positiveContentLines.length; lineIdx++) {
        const sec = lineSections[lineIdx];
        for (const part of positiveContentLines[lineIdx].split(/,|\.\s+/)) {
          const phrase = part.trim().replace(/\.$/, "");
          if (!phrase) continue;
          if (charBase && phrase === charBase) continue;
          if (mcSkip.has(phrase)) continue;
          sectionedChunks.push({ phrase, section: sec });
        }
      }
      await parseNatlangPrompt(sectionedChunks, natlangChar, styleSkip, charCommentHeader, mcScan.claims);
      await maybeRouteToActiveStyle();
      return;
    }
    let firstSubjectCommentHeader = null;
    const firstSubjLineIdx = lineSections.findIndex((s) => s !== "scene");
    const headerAnchorRawIdx = firstSubjLineIdx >= 0 ? positiveContentRawIdx[firstSubjLineIdx] ?? -1 : -1;
    for (let r = headerAnchorRawIdx - 1; r >= 0; r--) {
      const ln = rawLines[r].trim();
      if (!ln) continue;
      if (/^\/\//.test(ln)) {
        firstSubjectCommentHeader = rawLines[r];
        passthroughLineSet.delete(r);
      }
      break;
    }
    set(preservedPassthrough, rawLines.filter((_, i) => passthroughLineSet.has(i)).join("\n"), true);
    const rawIdxToSection = /* @__PURE__ */ new Map();
    const rawIdxToRegion = /* @__PURE__ */ new Map();
    for (let k = 0; k < positiveContentRawIdx.length; k++) {
      rawIdxToSection.set(positiveContentRawIdx[k], lineSections[k]);
      rawIdxToRegion.set(positiveContentRawIdx[k], lineRegions[k]);
    }
    let sectionedTagChunks;
    if (mcScan.claims.length) {
      const styleSkipSet = new Set(((_b = get(activeStyle)) == null ? void 0 : _b.tags) || []);
      sectionedTagChunks = naturalJoined.split(/,|\.\s+/).map((s) => s.trim().replace(/\.$/, "")).filter((s) => s && !styleSkipSet.has(s)).map((phrase) => ({ phrase, section: null, region: null }));
    } else {
      sectionedTagChunks = tokenStream.filter((_, i) => !stripIndices.has(i)).map((t) => ({
        phrase: t.token,
        section: rawIdxToSection.get(t.rawLineIdx) ?? null,
        region: rawIdxToRegion.get(t.rawLineIdx) ?? null
      }));
    }
    await parseTagPrompt(sectionedTagChunks, firstSubjectCommentHeader, true, mcScan.claims);
    await maybeRouteToActiveStyle();
  }
  function nameFromCommentHeader(line) {
    if (!line) return null;
    const m = /^\s*\/\/\s*(.+?)\s*$/.exec(line);
    if (!m) return null;
    const text2 = m[1].trim();
    const tagged = /^(?:Character|Subject):\s*(.+?)(?:\s*\([^)]+\))?\s*$/i.exec(text2);
    if (tagged) return tagged[1].trim();
    return text2;
  }
  async function maybeRouteToActiveStyle() {
    if (!get(activeStyle)) return;
    const anyChips = get(subjects).some((s) => {
      var _a2, _b, _c;
      return (((_a2 = s.identityTokens) == null ? void 0 : _a2.length) || 0) > 0 || (((_b = s.modifiers) == null ? void 0 : _b.length) || 0) > 0 || (((_c = s.freeform) == null ? void 0 : _c.length) || 0) > 0 || Object.values(s.sectionFreeform || {}).some((arr) => ((arr == null ? void 0 : arr.length) || 0) > 0) || Object.values(s.slots || {}).some((cat) => Object.values(cat || {}).some((arr) => ((arr == null ? void 0 : arr.length) || 0) > 0));
    });
    if (anyChips) return;
    selectCategory("styles");
    await tick();
    if (!get(stylesCache).loaded) {
      await loadStyles();
      await tick();
    }
    const card = document.querySelector(`.pcr-atb2-card[data-item-tag="${CSS.escape(get(activeStyle).id)}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  function removeFreeform(subjId, token) {
    set(
      subjects,
      get(subjects).map((s) => s.id === subjId ? {
        ...s,
        freeform: (s.freeform || []).filter((t) => t !== token)
      } : s),
      true
    );
  }
  function removeSectionFreeform(subjId, sectionKey, token) {
    set(
      subjects,
      get(subjects).map((s) => {
        if (s.id !== subjId) return s;
        const cur = s.sectionFreeform || { outfit: [], pose: [], interaction: [], scene: [] };
        const next = {
          ...cur,
          [sectionKey]: (cur[sectionKey] || []).filter((t) => t !== token)
        };
        return { ...s, sectionFreeform: next };
      }),
      true
    );
  }
  function toggleModifier(subjId, token) {
    set(
      subjects,
      get(subjects).map((s) => {
        if (s.id !== subjId) return s;
        const cur = s.modifiers || [];
        if (cur.includes(token)) return { ...s, modifiers: cur.filter((t) => t !== token) };
        if (COMPOSITION_MODIFIERS.has(token)) return { ...s, modifiers: [...cur, token] };
        const kept = cur.filter((t) => COMPOSITION_MODIFIERS.has(t));
        return { ...s, modifiers: [...kept, token] };
      }),
      true
    );
  }
  function removeModifier(subjId, token) {
    set(
      subjects,
      get(subjects).map((s) => s.id === subjId ? {
        ...s,
        modifiers: (s.modifiers || []).filter((t) => t !== token)
      } : s),
      true
    );
  }
  function openModifierPicker(subjId, triggerEl) {
    set(modifierPickerOpen, subjId, true);
    if (triggerEl) {
      const r = triggerEl.getBoundingClientRect();
      set(modifierPickerRect, { left: r.left, top: r.bottom + 4, width: 280 }, true);
    }
  }
  function closeModifierPicker() {
    set(modifierPickerOpen, null);
  }
  user_effect(() => {
    if (get(modifierPickerOpen) === null) return;
    function onDocClick(e) {
      if (e.target.closest(".pcr-atb2-modifier-dd")) return;
      if (e.target.closest(".pcr-atb2-modifier-trigger")) return;
      closeModifierPicker();
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  });
  function identityMatchToken(option) {
    if ((option == null ? void 0 : option.kind) === "cast") {
      const first = (option.base_tags || "").split(",").map((s) => s.trim()).filter(Boolean)[0];
      return first || option.tag;
    }
    return (option == null ? void 0 : option.tag) || "";
  }
  function partitionTokens(tokens, characterTag) {
    const identity = [];
    const modifiers = [];
    const free = [];
    for (const tok of tokens || []) {
      const stripped = tok.replace(/^\((.+):\s*\d+(?:\.\d+)?\)$/, "$1").replace(/^\((.+)\)$/, "$1");
      if (characterTag && stripped === characterTag) identity.push(tok);
      else if (MODIFIER_TOKENS.has(stripped)) modifiers.push(tok);
      else free.push(tok);
    }
    return { identity, modifiers, free };
  }
  function deleteSubject(id) {
    var _a2;
    set(subjects, get(subjects).filter((s) => s.id !== id), true);
    if (get(activeSubjectId) === id) set(activeSubjectId, null);
    if (get(identityPickerOpen) === id) closeIdentityPicker();
    if (((_a2 = get(presetPickerOpen)) == null ? void 0 : _a2.subjId) === id) closePresetPicker();
  }
  function spawnScene() {
    set(sceneSpawned, true);
  }
  function deleteScene() {
    set(sceneSpawned, false);
    set(sceneSelections, {}, true);
    set(sceneFreeform, [], true);
  }
  function removeSceneFreeform(tok) {
    set(sceneFreeform, get(sceneFreeform).filter((t) => t !== tok), true);
  }
  function setActiveSubject(id) {
    set(activeSubjectId, get(activeSubjectId) === id ? null : id, true);
  }
  function jumpToSlot(subjId, catKey, grpName) {
    set(activeSubjectId, subjId, true);
    set(activeCategory, catKey, true);
    set(activeGroup, grpName, true);
  }
  function jumpToTag({ subjId, category, group, itemTag, query }) {
    if (subjId) set(activeSubjectId, subjId, true);
    if (category) set(activeCategory, category, true);
    set(activeGroup, group ?? null, true);
    if (category === "subjects") set(activeSubjectSubitem, null);
    set(searchQuery, query || "", true);
    if (itemTag) set(scrollToItemTag, itemTag, true);
  }
  function jumpToModifier(subjId, token) {
    jumpToTag({
      subjId,
      category: "appearance",
      group: MODIFIER_GROUP_KEY,
      itemTag: token
    });
  }
  function jumpToIdentity(subjId) {
    jumpToTag({ subjId, category: "subjects" });
  }
  function jumpToSlotChip(subjId, catKey, grpName, itemTag) {
    jumpToTag({ subjId, category: catKey, group: grpName, itemTag });
  }
  user_effect(() => {
    if (!get(scrollToItemTag)) return;
    const tag = get(scrollToItemTag);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-item-tag="${CSS.escape(tag)}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("pcr-atb2-flash");
          el.addEventListener("animationend", () => el.classList.remove("pcr-atb2-flash"), { once: true });
        }
      });
    });
    set(scrollToItemTag, null);
  });
  function renameSubject(id, name) {
    set(
      subjects,
      get(subjects).map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, name };
        if (s.character) {
          const series = s.character.series ? ` (${s.character.series})` : "";
          next.character = {
            ...s.character,
            commentHeader: `// Character: ${name}${series}`
          };
        } else {
          next.commentHeader = name.trim() ? `// ${name}` : null;
        }
        return next;
      }),
      true
    );
  }
  function toggleSubjectSection(subjId, catKey) {
    set(
      subjects,
      get(subjects).map((s) => {
        if (s.id !== subjId) return s;
        const cur = s.expandedSections || {};
        return { ...s, expandedSections: { ...cur, [catKey]: !cur[catKey] } };
      }),
      true
    );
  }
  function pickItemFromAll(item, categoryKey, groupKey) {
    var _a2, _b, _c, _d;
    if (groupKey === MODIFIER_GROUP_KEY) {
      let subj2 = get(activeSubject);
      if (!subj2) subj2 = spawnSubject("person");
      toggleModifier(subj2.id, item.item_tag);
      return;
    }
    const cat = CATEGORIES.find((c) => c.key === categoryKey);
    if (!cat) return;
    if (cat.scope === "furniture") {
      if (!get(activeSubject) && !item.is_customizable) {
        if (!get(sceneSpawned)) set(sceneSpawned, true);
        set(sceneSelections, toggleInBag(get(sceneSelections), item.item_group, item, true), true);
        return;
      }
      openFurnitureCustomizer(item, get(activeSubject) || null);
      return;
    }
    const isMulti = (MULTI_GROUPS[cat.bucket] || /* @__PURE__ */ new Set()).has(groupKey);
    if (cat.scope === "global") {
      if (!get(sceneSpawned)) set(sceneSpawned, true);
      set(sceneSelections, toggleInBag(get(sceneSelections), groupKey, item, isMulti), true);
      return;
    }
    let subj = get(activeSubject);
    if (!subj) subj = spawnSubject("person");
    if (isCustomizableClothing(categoryKey, groupKey)) {
      const existing = (_b = (_a2 = subj.slots[categoryKey]) == null ? void 0 : _a2[groupKey]) == null ? void 0 : _b.find((x) => x.item_tag === item.item_tag);
      if (!existing) {
        openCustomizerForNewPick(item, subj, categoryKey, groupKey);
        return;
      }
    }
    if (isCustomizableAppearance(categoryKey, groupKey)) {
      const existing = (_d = (_c = subj.slots[categoryKey]) == null ? void 0 : _c[groupKey]) == null ? void 0 : _d.find((x) => x.item_tag === item.item_tag);
      if (!existing) {
        openFantasyCustomizerForNewPick(item, subj);
        return;
      }
    }
    const catSlots = subj.slots[categoryKey] || {};
    const nextSlots = toggleInBag(catSlots, groupKey, item, isMulti);
    set(
      subjects,
      get(subjects).map((s) => s.id === subj.id ? { ...s, slots: { ...s.slots, [categoryKey]: nextSlots } } : s),
      true
    );
  }
  function isSelectedInCategory(item, categoryKey, groupKey) {
    var _a2, _b, _c;
    if (groupKey === MODIFIER_GROUP_KEY) {
      return !!((_b = (_a2 = get(activeSubject)) == null ? void 0 : _a2.modifiers) == null ? void 0 : _b.includes(item.item_tag));
    }
    const cat = CATEGORIES.find((c) => c.key === categoryKey);
    if (!cat) return false;
    if (cat.scope === "global") {
      const arr2 = get(sceneSelections)[groupKey] || [];
      return arr2.some((s) => s.item_tag === item.item_tag);
    }
    if (cat.scope === "furniture" && !get(activeSubject)) {
      const arr2 = get(sceneSelections)[groupKey] || [];
      return arr2.some((s) => {
        var _a3;
        return s.item_tag === item.item_tag || ((_a3 = s._furniture) == null ? void 0 : _a3.prop_tag) === item.item_tag;
      });
    }
    if (!get(activeSubject)) return false;
    const arr = ((_c = get(activeSubject).slots[categoryKey]) == null ? void 0 : _c[groupKey]) || [];
    return arr.some((s) => {
      var _a3;
      return s.item_tag === item.item_tag || ((_a3 = s._furniture) == null ? void 0 : _a3.prop_tag) === item.item_tag;
    });
  }
  function pickItem(item) {
    var _a2, _b, _c, _d;
    const grp = item.item_group;
    const isMulti = (MULTI_GROUPS[get(activeBucket)] || /* @__PURE__ */ new Set()).has(grp);
    if (get(activeCategoryDef).scope === "furniture") {
      if (!get(activeSubject) && !item.is_customizable) {
        if (!get(sceneSpawned)) set(sceneSpawned, true);
        set(sceneSelections, toggleInBag(get(sceneSelections), item.item_group, item, true), true);
        return;
      }
      openFurnitureCustomizer(item, get(activeSubject) || null);
      return;
    }
    if (get(activeCategoryDef).scope === "global") {
      if (!get(sceneSpawned)) set(sceneSpawned, true);
      set(sceneSelections, toggleInBag(get(sceneSelections), grp, item, isMulti), true);
      return;
    }
    if (get(activeCategoryDef).scope === "style") {
      pickStyle(item);
      return;
    }
    if (get(activeCategory) === "appearance" && get(activeGroup) === MODIFIER_GROUP_KEY) {
      let subj2 = get(activeSubject);
      if (!subj2) subj2 = spawnSubject("person");
      toggleModifier(subj2.id, item.item_tag);
      return;
    }
    let subj = get(activeSubject);
    if (!subj) subj = spawnSubject("person");
    const catKey = get(activeCategory);
    if (isCustomizableClothing(catKey, grp)) {
      const existing = (_b = (_a2 = subj.slots[catKey]) == null ? void 0 : _a2[grp]) == null ? void 0 : _b.find((x) => x.item_tag === item.item_tag);
      if (!existing) {
        openCustomizerForNewPick(item, subj, catKey, grp);
        return;
      }
    }
    if (isCustomizableAppearance(catKey, grp)) {
      const existing = (_d = (_c = subj.slots[catKey]) == null ? void 0 : _c[grp]) == null ? void 0 : _d.find((x) => x.item_tag === item.item_tag);
      if (!existing) {
        openFantasyCustomizerForNewPick(item, subj);
        return;
      }
    }
    const catSlots = subj.slots[catKey] || {};
    const nextSlots = toggleInBag(catSlots, grp, item, isMulti);
    set(
      subjects,
      get(subjects).map((s) => s.id === subj.id ? { ...s, slots: { ...s.slots, [catKey]: nextSlots } } : s),
      true
    );
  }
  function toggleInBag(bag, grp, item, isMulti) {
    const arr = bag[grp] || [];
    const exists = arr.some((s) => s.item_tag === item.item_tag);
    if (exists) {
      const filtered = arr.filter((s) => s.item_tag !== item.item_tag);
      const next = { ...bag };
      if (filtered.length) next[grp] = filtered;
      else delete next[grp];
      return next;
    }
    if (isMulti) return { ...bag, [grp]: [...arr, item] };
    return { ...bag, [grp]: [item] };
  }
  function clearSceneChip(grp, itemTag) {
    const arr = get(sceneSelections)[grp] || [];
    const filtered = arr.filter((s) => s.item_tag !== itemTag);
    const next = { ...get(sceneSelections) };
    if (filtered.length) next[grp] = filtered;
    else delete next[grp];
    set(sceneSelections, next, true);
  }
  function clearSubjectChip(subjId, catKey, grp, itemTag) {
    set(
      subjects,
      get(subjects).map((s) => {
        if (s.id !== subjId) return s;
        const cat = s.slots[catKey] || {};
        const arr = cat[grp] || [];
        const filtered = arr.filter((x) => x.item_tag !== itemTag);
        const nextCat = { ...cat };
        if (filtered.length) nextCat[grp] = filtered;
        else delete nextCat[grp];
        const nextSlots = { ...s.slots };
        if (Object.keys(nextCat).length) nextSlots[catKey] = nextCat;
        else delete nextSlots[catKey];
        return { ...s, slots: nextSlots };
      }),
      true
    );
  }
  function isSelected(item) {
    var _a2, _b, _c, _d;
    if (get(activeCategoryDef).scope === "global") {
      const arr2 = get(sceneSelections)[item.item_group] || [];
      return arr2.some((s) => s.item_tag === item.item_tag);
    }
    if (get(activeCategoryDef).scope === "style") {
      return ((_a2 = get(activeStyle)) == null ? void 0 : _a2.id) === item.item_tag;
    }
    if (get(activeCategory) === "appearance" && get(activeGroup) === MODIFIER_GROUP_KEY) {
      return !!((_c = (_b = get(activeSubject)) == null ? void 0 : _b.modifiers) == null ? void 0 : _c.includes(item.item_tag));
    }
    if (get(activeCategoryDef).scope === "furniture" && !get(activeSubject)) {
      const arr2 = get(sceneSelections)[item.item_group] || [];
      return arr2.some((s) => {
        var _a3;
        return s.item_tag === item.item_tag || ((_a3 = s._furniture) == null ? void 0 : _a3.prop_tag) === item.item_tag;
      });
    }
    if (!get(activeSubject)) return false;
    const arr = ((_d = get(activeSubject).slots[get(activeCategory)]) == null ? void 0 : _d[item.item_group]) || [];
    return arr.some((s) => {
      var _a3;
      return s.item_tag === item.item_tag || ((_a3 = s._furniture) == null ? void 0 : _a3.prop_tag) === item.item_tag;
    });
  }
  function loadClothingMods(group) {
    if (!group) return Promise.resolve(null);
    if (get(clothingModData)[group]) return Promise.resolve(get(clothingModData)[group]);
    if (clothingModPromises[group]) return clothingModPromises[group];
    clothingModPromises[group] = (async () => {
      try {
        const res = await fetch(`/promptchain/clothing/customizer-data?group=${encodeURIComponent(group)}`);
        const data = res.ok ? await res.json() : { colors: [], patterns: [], materials: [], conditions: [] };
        set(clothingModData, { ...get(clothingModData), [group]: data }, true);
        return data;
      } catch {
        const data = { colors: [], patterns: [], materials: [], conditions: [] };
        set(clothingModData, { ...get(clothingModData), [group]: data }, true);
        return data;
      } finally {
        delete clothingModPromises[group];
      }
    })();
    return clothingModPromises[group];
  }
  function isCustomizableClothing(catKey, grp) {
    return catKey === "clothing" && CUSTOMIZABLE_CLOTHING_GROUPS.has((grp || "").toLowerCase());
  }
  function isCustomizableAppearance(catKey, grp) {
    return catKey === "appearance" && CUSTOMIZABLE_APPEARANCE_GROUPS.has((grp || "").toLowerCase());
  }
  function isCustomizableSlot(catKey, grp) {
    return isCustomizableClothing(catKey, grp) || isCustomizableAppearance(catKey, grp);
  }
  function loadFantasyMods() {
    if (get(fantasyModData)) return Promise.resolve(get(fantasyModData));
    if (fantasyModPromise) return fantasyModPromise;
    fantasyModPromise = (async () => {
      try {
        const res = await fetch("/promptchain/fantasy/customizer-data");
        const data = res.ok ? await res.json() : { shapes: [], colors: [], types: [] };
        set(fantasyModData, data, true);
        return data;
      } catch {
        const data = { shapes: [], colors: [], types: [] };
        set(fantasyModData, data, true);
        return data;
      } finally {
        fantasyModPromise = null;
      }
    })();
    return fantasyModPromise;
  }
  const COLOR_EMIT_OVERRIDE = { nude: { tag: "see-through" } };
  const COLOR_INPUT_OVERRIDE = { "see-through": "nude", "see through": "nude" };
  const CHIP_COLOR_HEX = {
    burgundy: "#800020",
    wine: "#722f37",
    rose: "#ff66cc",
    blush: "#de5d83",
    coral: "#ff7f50",
    salmon: "#fa8072",
    peach: "#ffcba4",
    mustard: "#ffdb58",
    olive: "#808000",
    sage: "#9caf88",
    forest: "#228b22",
    mint: "#98ff98",
    teal: "#008080",
    turquoise: "#40e0d0",
    navy: "#000080",
    royal: "#4169e1",
    cobalt: "#0047ab",
    indigo: "#4b0082",
    plum: "#8e4585",
    lavender: "#e6e6fa",
    lilac: "#c8a2c8",
    cream: "#ffe69f",
    beige: "#f5f5dc",
    tan: "#d2b48c",
    khaki: "#c3b091",
    bronze: "#cd7f32",
    copper: "#b87333",
    rust: "#b7410e",
    chocolate: "#7b3f00",
    charcoal: "#36454f",
    brown: "#5d2d19",
    grey: "#636363",
    gray: "#636363"
  };
  function customizerColorHex(tag) {
    if (!tag) return null;
    return CHIP_COLOR_HEX[tag] || tag;
  }
  function modifierTooltip(item) {
    if (!item.modifiers) return "";
    if (item.item_group === "fantasy") {
      if (!get(fantasyModData)) loadFantasyMods();
      return buildFantasyPhrase(item, item.modifiers, "natlang") || "";
    }
    if (!get(clothingModData)[item.item_group]) loadClothingMods(item.item_group);
    const phrase = buildModifiedPhrase(item, item.modifiers, "natlang");
    return phrase || "";
  }
  function openCustomizerForNewPick(item, subj, catKey, grp) {
    loadClothingMods(item.item_group);
    set(
      customizerOpen,
      {
        item,
        subjId: subj.id,
        catKey,
        grp,
        isNew: true,
        initial: null
      },
      true
    );
  }
  function openCustomizerForExisting(subjId, catKey, grp, item) {
    loadClothingMods(item.item_group);
    set(
      customizerOpen,
      {
        item,
        subjId,
        catKey,
        grp,
        isNew: false,
        initial: item.modifiers || null
      },
      true
    );
  }
  function openFantasyCustomizerForNewPick(item, subj) {
    loadFantasyMods();
    set(
      fantasyCustomizerOpen,
      {
        item,
        subjId: subj.id,
        catKey: "appearance",
        grp: "fantasy",
        isNew: true,
        initial: null
      },
      true
    );
  }
  function openFantasyCustomizerForExisting(subjId, item) {
    loadFantasyMods();
    set(
      fantasyCustomizerOpen,
      {
        item,
        subjId,
        catKey: "appearance",
        grp: "fantasy",
        isNew: false,
        initial: item.modifiers || null
      },
      true
    );
  }
  function cancelFantasyCustomizer() {
    set(fantasyCustomizerOpen, null);
  }
  function commitFantasyCustomizer({ modifiers }) {
    if (!get(fantasyCustomizerOpen)) return;
    const { item, subjId, catKey, grp, isNew } = get(fantasyCustomizerOpen);
    set(fantasyCustomizerOpen, null);
    set(
      subjects,
      get(subjects).map((s) => {
        if (s.id !== subjId) return s;
        const catSlots = s.slots[catKey] || {};
        const arr = catSlots[grp] || [];
        let nextArr;
        if (isNew) {
          if (arr.some((x) => x.item_tag === item.item_tag)) {
            nextArr = arr.map((x) => x.item_tag === item.item_tag ? { ...x, modifiers } : x);
          } else {
            nextArr = [...arr, { ...item, modifiers }];
          }
        } else {
          nextArr = arr.map((x) => x.item_tag === item.item_tag ? { ...x, modifiers } : x);
        }
        const nextGrp = { ...catSlots, [grp]: nextArr };
        return { ...s, slots: { ...s.slots, [catKey]: nextGrp } };
      }),
      true
    );
  }
  function cardModifiers(item, catKey, grp) {
    var _a2, _b;
    if (!get(activeSubject)) return null;
    const found = (_b = (_a2 = get(activeSubject).slots[catKey]) == null ? void 0 : _a2[grp]) == null ? void 0 : _b.find((x) => x.item_tag === item.item_tag);
    return (found == null ? void 0 : found.modifiers) || null;
  }
  function editCardModifiers(item, catKey, grp) {
    var _a2, _b;
    if (!get(activeSubject)) return;
    const found = (_b = (_a2 = get(activeSubject).slots[catKey]) == null ? void 0 : _a2[grp]) == null ? void 0 : _b.find((x) => x.item_tag === item.item_tag);
    if (!found) return;
    if (isCustomizableAppearance(catKey, grp)) {
      openFantasyCustomizerForExisting(get(activeSubject).id, found);
    } else {
      openCustomizerForExisting(get(activeSubject).id, catKey, grp, found);
    }
  }
  function commitCustomizer({ modifiers }) {
    if (!get(customizerOpen)) return;
    const { item, subjId, catKey, grp, isNew } = get(customizerOpen);
    set(customizerOpen, null);
    set(
      subjects,
      get(subjects).map((s) => {
        var _a2;
        if (s.id !== subjId) return s;
        const cat = { ...s.slots[catKey] || {} };
        const arr = cat[grp] || [];
        const isMulti = (MULTI_GROUPS[(_a2 = CATEGORIES.find((c) => c.key === catKey)) == null ? void 0 : _a2.bucket] || /* @__PURE__ */ new Set()).has(grp);
        const stamped = { ...item };
        if (modifiers) stamped.modifiers = modifiers;
        else delete stamped.modifiers;
        let nextArr;
        if (isNew) {
          const exists = arr.some((x) => x.item_tag === item.item_tag);
          if (exists) {
            nextArr = arr.map((x) => x.item_tag === item.item_tag ? stamped : x);
          } else if (isMulti) {
            nextArr = [...arr, stamped];
          } else {
            nextArr = [stamped];
          }
        } else {
          nextArr = arr.map((x) => x.item_tag === item.item_tag ? stamped : x);
        }
        cat[grp] = nextArr;
        return { ...s, slots: { ...s.slots, [catKey]: cat } };
      }),
      true
    );
  }
  function cancelCustomizer() {
    set(customizerOpen, null);
  }
  function openFurnitureCustomizer(item, subj) {
    loadFurniture().then(() => {
      set(
        furnitureCustomizerOpen,
        {
          item,
          subjId: (subj == null ? void 0 : subj.id) || null,
          sceneGroup: item.item_group,
          isNew: true,
          initial: null
        },
        true
      );
    });
  }
  function openFurnitureCustomizerForExisting(chip, subjId, sceneGroup) {
    loadFurniture().then(() => {
      var _a2;
      const propRow = (((_a2 = get(bucketCache).furniture) == null ? void 0 : _a2.items) || []).find((p) => p.item_tag === chip._furniture.prop_tag);
      set(
        furnitureCustomizerOpen,
        {
          item: {
            item_tag: chip._furniture.prop_tag,
            display_name: chip._furniture.prop_display,
            item_group: (propRow == null ? void 0 : propRow.item_group) || sceneGroup,
            base_tags: (propRow == null ? void 0 : propRow.base_tags) || chip._furniture.prop_tag,
            base_natlang: (propRow == null ? void 0 : propRow.base_natlang) || chip._furniture.prop_display.toLowerCase(),
            is_customizable: (propRow == null ? void 0 : propRow.is_customizable) ?? !!(chip._furniture.material || chip._furniture.pattern),
            subCategory: (propRow == null ? void 0 : propRow.subCategory) || null
          },
          subjId,
          sceneGroup,
          isNew: false,
          // The existing chip's item_tag — kept for in-place replacement.
          existingTag: chip.item_tag,
          initial: {
            material: chip._furniture.material || "",
            pattern: chip._furniture.pattern || "",
            color: chip._furniture.color || "",
            action: chip._furniture.action || ""
          }
        },
        true
      );
    });
  }
  function cancelFurnitureCustomizer() {
    set(furnitureCustomizerOpen, null);
  }
  function commitFurnitureCustomizer(result) {
    var _a2, _b, _c, _d, _e;
    if (!get(furnitureCustomizerOpen)) return;
    const { item, subjId, sceneGroup, isNew, existingTag } = get(furnitureCustomizerOpen);
    set(furnitureCustomizerOpen, null);
    const { material, pattern, color, action: action2, assembled, parts } = result;
    const labelParts = [];
    if ((_a2 = parts == null ? void 0 : parts.actionOpt) == null ? void 0 : _a2.display_name) labelParts.push(parts.actionOpt.display_name);
    if ((_b = parts == null ? void 0 : parts.colorOpt) == null ? void 0 : _b.display) labelParts.push(parts.colorOpt.display);
    if ((_c = parts == null ? void 0 : parts.patternOpt) == null ? void 0 : _c.display) labelParts.push(parts.patternOpt.display);
    if ((_d = parts == null ? void 0 : parts.materialOpt) == null ? void 0 : _d.display) labelParts.push(parts.materialOpt.display);
    labelParts.push(item.display_name || item.item_tag);
    const syntheticTag = isNew ? `_furn_${item.item_tag}_${action2 || "x"}_${color || "x"}_${material || "x"}_${pattern || "x"}` : existingTag;
    const chip = {
      item_tag: syntheticTag,
      display_name: labelParts.join(" "),
      item_group: sceneGroup,
      // Pre-baked emit strings — itemText/chipText return these unchanged,
      // so no special-casing in the compose path.
      base_tags: (assembled == null ? void 0 : assembled.tags) || item.base_tags || item.item_tag,
      base_natlang: (assembled == null ? void 0 : assembled.natlang) || item.base_natlang || ((_e = item.display_name) == null ? void 0 : _e.toLowerCase()) || item.item_tag,
      // QA status not tracked for synthetic chips — they'd otherwise inherit
      // the prop's base status and render red.
      natlang_status: "normalized",
      // Round-trip metadata for re-edit.
      _furniture: {
        prop_tag: item.item_tag,
        prop_display: item.display_name,
        material: material || null,
        pattern: pattern || null,
        color: color || null,
        action: action2 || null
      }
    };
    if (subjId) {
      set(
        subjects,
        get(subjects).map((s) => {
          if (s.id !== subjId) return s;
          const slots = { ...s.slots || {} };
          const cat = { ...slots.furniture || {} };
          const arr = cat[sceneGroup] || [];
          let nextArr;
          if (!isNew) {
            nextArr = arr.map((x) => x.item_tag === existingTag ? chip : x);
          } else if (arr.some((x) => x.item_tag === chip.item_tag)) {
            nextArr = arr.map((x) => x.item_tag === chip.item_tag ? chip : x);
          } else {
            nextArr = [...arr, chip];
          }
          cat[sceneGroup] = nextArr;
          slots.furniture = cat;
          return { ...s, slots };
        }),
        true
      );
    } else {
      if (!get(sceneSpawned)) set(sceneSpawned, true);
      const next = { ...get(sceneSelections) };
      const arr = next[sceneGroup] || [];
      let nextArr;
      if (!isNew) {
        nextArr = arr.map((x) => x.item_tag === existingTag ? chip : x);
      } else if (arr.some((x) => x.item_tag === chip.item_tag)) {
        nextArr = arr.map((x) => x.item_tag === chip.item_tag ? chip : x);
      } else {
        nextArr = [...arr, chip];
      }
      next[sceneGroup] = nextArr;
      set(sceneSelections, next, true);
    }
  }
  function isFurnitureChip(chip) {
    return !!(chip == null ? void 0 : chip._furniture);
  }
  function buildFantasyPhrase(item, mods, mode) {
    if (!get(fantasyModData)) {
      loadFantasyMods();
      return null;
    }
    const find = (list, tag) => (list || []).find((o) => o.tag === tag);
    const shape = (mods == null ? void 0 : mods.shape) ? find(get(fantasyModData).shapes, mods.shape) : null;
    const color = (mods == null ? void 0 : mods.color) ? find(get(fantasyModData).colors, mods.color) : null;
    const type = (mods == null ? void 0 : mods.type) ? find(get(fantasyModData).types, mods.type) : null;
    const primary = (row) => ((row == null ? void 0 : row.base_tags) || (row == null ? void 0 : row.tag) || "").split(",")[0].trim();
    const parts = [shape, color, type].map(primary).filter(Boolean);
    if (mode === "tag") {
      const itemTag = item.item_tag || "";
      if (!parts.length) return itemTag;
      const slug = (s) => s.replace(/\s+/g, "_");
      return [...parts.map(slug), itemTag].join("_");
    }
    const base = (item.display_name || item.item_tag || "").toLowerCase();
    return [...parts, base].join(" ");
  }
  function buildModifiedPhrase(item, mods, mode) {
    var _a2;
    const data = get(clothingModData)[item.item_group];
    if (!data) return null;
    const find = (list, tag) => (list || []).find((o) => o.tag === tag);
    const condition = (mods == null ? void 0 : mods.condition) ? find(data.conditions, mods.condition) : null;
    const color = (mods == null ? void 0 : mods.color) ? find(data.colors, mods.color) : null;
    const pattern = (mods == null ? void 0 : mods.pattern) ? find(data.patterns, mods.pattern) : null;
    const material = (mods == null ? void 0 : mods.material) ? find(data.materials, mods.material) : null;
    let colorPrefix = color == null ? void 0 : color.prefix;
    if ((mods == null ? void 0 : mods.color) && ((_a2 = COLOR_EMIT_OVERRIDE[mods.color]) == null ? void 0 : _a2[mode])) {
      colorPrefix = COLOR_EMIT_OVERRIDE[mods.color][mode];
    }
    const prefixes = [
      condition == null ? void 0 : condition.prefix,
      colorPrefix,
      pattern == null ? void 0 : pattern.prefix,
      material == null ? void 0 : material.prefix
    ].filter(Boolean);
    if (mode === "tag") {
      const itemTag = item.item_tag || "";
      if (!prefixes.length) return itemTag;
      const slug = (s) => s.replace(/\s+/g, "_");
      return [...prefixes.map(slug), itemTag].join("_");
    }
    const base = (item.display_name || item.item_tag || "").toLowerCase();
    const phrase = [...prefixes, base].join(" ");
    return (mods == null ? void 0 : mods.focus) ? `${phrase}, presenting ${phrase} to viewer, ${phrase} focus` : phrase;
  }
  async function peelTagModifiers(token) {
    const segments = token.split("_").filter(Boolean);
    if (segments.length < 2) return null;
    for (let i = 1; i < segments.length; i++) {
      const candidate = segments.slice(i).join("_");
      const lookup = get(tagToItem).get(candidate);
      if (!lookup) continue;
      if (!isCustomizableClothing("clothing", lookup.group)) continue;
      const data = await loadClothingMods(lookup.group);
      const peeled = segments.slice(0, i);
      const mods = matchModifierTokens(peeled, data);
      if (!mods) continue;
      return { lookup, modifiers: mods };
    }
    return null;
  }
  function matchModifierTokens(tokens, data) {
    if (!tokens.length) return null;
    const out = {
      color: null,
      pattern: null,
      material: null,
      condition: null,
      focus: false
    };
    const buckets = [
      ["color", data.colors],
      ["pattern", data.patterns],
      ["material", data.materials],
      ["condition", data.conditions]
    ];
    for (const tok of tokens) {
      const norm = tok.toLowerCase().replace(/_/g, " ");
      let placed = false;
      if (!out.color && COLOR_INPUT_OVERRIDE[norm]) {
        out.color = COLOR_INPUT_OVERRIDE[norm];
        placed = true;
      }
      if (!placed) {
        for (const [field, list] of buckets) {
          if (out[field]) continue;
          const opt = (list || []).find((o) => (o.prefix || "").toLowerCase() === norm) || (list || []).find((o) => (o.tag || "").toLowerCase() === norm);
          if (opt) {
            out[field] = opt.tag;
            placed = true;
            break;
          }
        }
      }
      if (!placed) return null;
    }
    return out;
  }
  function matchFurnitureInteraction(phrase) {
    var _a2;
    const furn = get(bucketCache).furniture;
    if (!(furn == null ? void 0 : furn.loaded) || !furn.mods || !((_a2 = get(furnitureActions)) == null ? void 0 : _a2.length)) return null;
    const norm = (s) => (s || "").toLowerCase().replace(/_/g, " ").trim();
    const lower = norm(phrase);
    if (!lower) return null;
    const verbs = [];
    for (const a of get(furnitureActions)) {
      for (const p of [norm(a.action_prefix_natlang), norm(a.action_prefix_tags)]) {
        if (p) verbs.push({ action: a, prefix: p });
      }
    }
    verbs.sort((x, y) => y.prefix.length - x.prefix.length);
    for (const { action: action2, prefix } of verbs) {
      if (!lower.startsWith(prefix + " ")) continue;
      const body = lower.slice(prefix.length + 1).trim();
      if (!body) continue;
      const compat = Array.isArray(action2.compatible_categories) ? action2.compatible_categories : [];
      const candidates = [];
      for (const it of furn.items) {
        if (compat.length && !compat.includes(it.item_group)) continue;
        for (const form of [
          norm(it.base_natlang),
          norm(it.base_tags),
          norm(it.display_name),
          norm(it.item_tag)
        ]) {
          if (!form) continue;
          if (body === form || body.endsWith(" " + form)) {
            candidates.push({ it, nat: form });
            break;
          }
        }
      }
      if (!candidates.length) continue;
      candidates.sort((a, b) => b.nat.length - a.nat.length);
      for (const { it, nat } of candidates) {
        const head = body.length === nat.length ? "" : body.slice(0, body.length - nat.length).trim();
        const mods = peelFurnitureMods(head, it);
        if (mods === null) continue;
        return buildFurnitureChip(it, action2, mods);
      }
    }
    return null;
  }
  function peelFurnitureMods(head, propItem) {
    var _a2;
    let h = (head || "").trim().replace(/_/g, " ").replace(/^(?:an?|the)\s+/, "");
    if (!h) return { color: null, pattern: null, material: null };
    if (propItem && propItem.is_customizable === false) return null;
    const data = (_a2 = get(bucketCache).furniture) == null ? void 0 : _a2.mods;
    if (!data) return null;
    const out = { color: null, pattern: null, material: null };
    const buckets = [
      ["color", data.colors],
      ["pattern", data.patterns],
      ["material", data.materials]
    ];
    let remaining = h;
    while (remaining) {
      let bestLen = 0;
      let bestField = null;
      let bestTag = null;
      for (const [field, list] of buckets) {
        if (out[field]) continue;
        for (const opt of list || []) {
          for (const cand of [
            (opt.prefix || "").toLowerCase(),
            (opt.tag || "").toLowerCase().replace(/_/g, " ")
          ]) {
            if (!cand) continue;
            if ((remaining === cand || remaining.startsWith(cand + " ")) && cand.length > bestLen) {
              bestLen = cand.length;
              bestField = field;
              bestTag = opt.tag;
            }
          }
        }
      }
      if (!bestField) return null;
      out[bestField] = bestTag;
      remaining = remaining.slice(bestLen).trim();
    }
    return out;
  }
  function buildFurnitureChip(propItem, action2, mods) {
    const data = get(bucketCache).furniture.mods;
    const colorRow = mods.color ? (data.colors || []).find((c) => c.tag === mods.color) : null;
    const patternRow = mods.pattern ? (data.patterns || []).find((p) => p.tag === mods.pattern) : null;
    const materialRow = mods.material ? (data.materials || []).find((m) => m.tag === mods.material) : null;
    const tagParts = [];
    const nlParts = [];
    if (colorRow) {
      tagParts.push(colorRow.tag);
      nlParts.push(colorRow.prefix);
    }
    if (patternRow) {
      tagParts.push(patternRow.tag);
      nlParts.push(patternRow.prefix);
    }
    if (materialRow) {
      tagParts.push(materialRow.tag);
      nlParts.push(materialRow.prefix);
    }
    tagParts.push(propItem.item_tag);
    nlParts.push(propItem.base_natlang || (propItem.display_name || "").toLowerCase());
    let baseTags = tagParts.join(" ");
    let baseNatlang = nlParts.join(" ");
    if (action2) {
      baseTags = `${action2.action_prefix_tags} ${baseTags}`;
      baseNatlang = `${action2.action_prefix_natlang} ${baseNatlang}`;
    }
    const labelParts = [];
    if (action2 == null ? void 0 : action2.display_name) labelParts.push(action2.display_name);
    if (colorRow == null ? void 0 : colorRow.display) labelParts.push(colorRow.display);
    if (patternRow == null ? void 0 : patternRow.display) labelParts.push(patternRow.display);
    if (materialRow == null ? void 0 : materialRow.display) labelParts.push(materialRow.display);
    labelParts.push(propItem.display_name);
    const syntheticTag = `_furn_${propItem.item_tag}_${(action2 == null ? void 0 : action2.action_tag) || "x"}_${mods.color || "x"}_${mods.material || "x"}_${mods.pattern || "x"}`;
    return {
      group: propItem.item_group,
      chip: {
        item_tag: syntheticTag,
        display_name: labelParts.join(" "),
        item_group: propItem.item_group,
        base_tags: baseTags,
        base_natlang: baseNatlang,
        natlang_status: "normalized",
        _furniture: {
          prop_tag: propItem.item_tag,
          prop_display: propItem.display_name,
          material: mods.material || null,
          pattern: mods.pattern || null,
          color: mods.color || null,
          action: (action2 == null ? void 0 : action2.action_tag) || null
        }
      }
    };
  }
  async function peelNatlangModifiers(phrase) {
    const lower = phrase.toLowerCase().trim();
    const candidates = [];
    for (const [bucket, data] of Object.entries(get(bucketCache))) {
      if (bucket !== "clothing") continue;
      for (const it of data.items || []) {
        if (!isCustomizableClothing("clothing", it.item_group)) continue;
        const display = (it.display_name || it.item_tag || "").toLowerCase();
        if (!display) continue;
        if (lower === display || lower.endsWith(" " + display)) {
          candidates.push({ it, display });
        }
      }
    }
    candidates.sort((a, b) => b.display.length - a.display.length);
    for (const { it, display } of candidates) {
      let head = lower.length === display.length ? "" : lower.slice(0, lower.length - display.length).trim();
      head = head.replace(/^wearing(?:\s+an?)?\s*/, "").trim();
      const data = await loadClothingMods(it.item_group);
      const mods = matchNatlangPrefix(head, data);
      if (!mods) continue;
      return {
        lookup: { bucket: "clothing", group: it.item_group, item: it },
        modifiers: mods
      };
    }
    return null;
  }
  function matchNatlangPrefix(head, data) {
    if (!head) return {
      color: null,
      pattern: null,
      material: null,
      condition: null,
      focus: false
    };
    const buckets = [
      ["color", data.colors],
      ["pattern", data.patterns],
      ["material", data.materials],
      ["condition", data.conditions]
    ];
    const out = {
      color: null,
      pattern: null,
      material: null,
      condition: null,
      focus: false
    };
    let remaining = head;
    while (remaining) {
      let consumed = false;
      let bestLen = 0;
      let bestField = null;
      let bestTag = null;
      if (!out.color) {
        for (const [alias, canonicalTag] of Object.entries(COLOR_INPUT_OVERRIDE)) {
          if (remaining === alias || remaining.startsWith(alias + " ")) {
            if (alias.length > bestLen) {
              bestLen = alias.length;
              bestField = "color";
              bestTag = canonicalTag;
            }
          }
        }
      }
      for (const [field, list] of buckets) {
        if (out[field]) continue;
        for (const opt of list || []) {
          const p = (opt.prefix || "").toLowerCase();
          if (!p) continue;
          if (remaining === p || remaining.startsWith(p + " ")) {
            if (p.length > bestLen) {
              bestLen = p.length;
              bestField = field;
              bestTag = opt.tag;
            }
          }
        }
      }
      if (bestField) {
        out[bestField] = bestTag;
        remaining = remaining.slice(bestLen).trim();
        consumed = true;
      }
      if (!consumed) return null;
    }
    return out;
  }
  function itemText(item) {
    return get(isNaturalMode) ? item.base_natlang || item.display_name || item.item_tag : item.base_tags || item.item_tag;
  }
  function chipText(item, overrides) {
    if (get(isNaturalMode)) {
      if (overrides) {
        if (overrides[item.item_tag]) return overrides[item.item_tag];
        const bt = (item.base_tags || "").trim();
        if (bt && !bt.includes(",") && !bt.startsWith("(") && overrides[bt]) {
          return overrides[bt];
        }
      }
      if (item.modifiers) {
        const phrase = item.item_group === "fantasy" ? buildFantasyPhrase(item, item.modifiers, "natlang") : buildModifiedPhrase(item, item.modifiers, "natlang");
        if (phrase) return phrase;
      }
      return item.base_natlang || item.display_name || item.item_tag;
    }
    if (item.modifiers) {
      const phrase = item.item_group === "fantasy" ? buildFantasyPhrase(item, item.modifiers, "tag") : buildModifiedPhrase(item, item.modifiers, "tag");
      if (phrase) return phrase;
    }
    return item.base_tags || item.item_tag;
  }
  function iterateSlots(slots, subj) {
    var _a2, _b, _c, _d, _e, _f;
    const bits = [];
    const appearanceRemoves = /* @__PURE__ */ new Set();
    const appearanceAdds = /* @__PURE__ */ new Set();
    if (subj == null ? void 0 : subj.activeOutfit) {
      for (const t of subj.activeOutfit.appearance_removes || []) appearanceRemoves.add(t);
      for (const t of subj.activeOutfit.appearance_adds || []) appearanceAdds.add(t);
    }
    if (subj == null ? void 0 : subj.activePose) {
      for (const t of subj.activePose.appearance_removes || []) appearanceRemoves.add(t);
      for (const t of subj.activePose.appearance_adds || []) appearanceAdds.add(t);
    }
    for (const catKey of Object.keys(slots || {})) {
      let overrides = null;
      if (subj) {
        if (catKey === "appearance") overrides = (_a2 = subj.character) == null ? void 0 : _a2.overrides;
        else if (catKey === "clothing") overrides = (_b = subj.activeOutfit) == null ? void 0 : _b.overrides;
        else if (catKey === "pose") overrides = (_c = subj.activePose) == null ? void 0 : _c.overrides;
      }
      const bucket = (_d = CATEGORIES.find((c) => c.key === catKey)) == null ? void 0 : _d.bucket;
      const groupOrder = ((_f = (_e = get(bucketCache)[bucket]) == null ? void 0 : _e.groups) == null ? void 0 : _f.map((g) => g.group_name)) || Object.keys(slots[catKey]);
      const emittedAppearance = /* @__PURE__ */ new Set();
      for (const grp of groupOrder) {
        const arr = slots[catKey][grp] || [];
        for (const it of arr) {
          if (catKey === "appearance" && appearanceRemoves.has(it.item_tag)) continue;
          const t = chipText(it, overrides);
          if (t == null ? void 0 : t.trim()) bits.push(t.trim());
          if (catKey === "appearance") emittedAppearance.add(it.item_tag);
        }
      }
      if (catKey === "appearance" && appearanceAdds.size) {
        for (const addTag of appearanceAdds) {
          if (emittedAppearance.has(addTag) || appearanceRemoves.has(addTag)) continue;
          const lookup = get(tagToItem).get(addTag);
          if (!lookup || lookup.bucket !== "appearance") continue;
          const t = chipText(lookup.item, overrides);
          if (t == null ? void 0 : t.trim()) bits.push(t.trim());
        }
      }
    }
    return bits;
  }
  function composeSubjectBody(subj) {
    let s = subj;
    if (subj.outfitSnapshot) s = subtractSnapshot(s, subj.outfitSnapshot);
    if (subj.poseSnapshot) s = subtractSnapshot(s, subj.poseSnapshot);
    const typeDef = SUBJECT_TYPES[subj.type] || SUBJECT_TYPES.person;
    const skipCategories = /* @__PURE__ */ new Set(["clothing", "pose", "furniture"]);
    const orderedSlots = {};
    for (const catKey of typeDef.slotCategories) {
      if (skipCategories.has(catKey)) continue;
      if (s.slots[catKey]) orderedSlots[catKey] = s.slots[catKey];
    }
    const chipBits = [];
    for (const tok of s.modifiers || []) {
      if (!tok.trim()) continue;
      chipBits.push(get(isNaturalMode) ? MODIFIER_NATLANG[tok] || tok : tok);
    }
    chipBits.push(...iterateSlots(orderedSlots, subj));
    for (const tok of s.freeform || []) {
      if (tok.trim()) chipBits.push(tok.trim());
    }
    if (get(isNaturalMode)) {
      if (subj.character) {
        const base = (subj.character.base_natlang || "").trim();
        if (!chipBits.length) return base;
        const baseNoPeriod = base.replace(/\.\s*$/, "");
        return baseNoPeriod ? `${baseNoPeriod}, ${chipBits.join(", ")}.` : `${chipBits.join(", ")}.`;
      }
      return chipBits.length ? `${chipBits.join(", ")}.` : "";
    }
    const lead = (s.identityTokens || []).filter((t) => t.trim());
    return [...lead, ...chipBits].join(", ");
  }
  function composeSnapshotBody(snapshot, marker, subj, kind) {
    var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    if (!snapshot) return "";
    const hasOverrides = (marker == null ? void 0 : marker.overrides) && Object.keys(marker.overrides).length > 0;
    if (get(isNaturalMode) && !hasOverrides && ((_a2 = marker == null ? void 0 : marker.natlang) == null ? void 0 : _a2.trim())) {
      return marker.natlang.trim();
    }
    const overrides = (marker == null ? void 0 : marker.overrides) || {};
    const primaryCat = kind === "outfit" ? "clothing" : kind === "pose" ? "pose" : null;
    const categoriesToEmit = new Set(Object.keys(snapshot.matched || {}));
    if (primaryCat) categoriesToEmit.add(primaryCat);
    const bits = [];
    for (const catKey of categoriesToEmit) {
      const bucket = (_b = CATEGORIES.find((c) => c.key === catKey)) == null ? void 0 : _b.bucket;
      if (catKey === primaryCat) {
        const slotMap = ((_c = subj == null ? void 0 : subj.slots) == null ? void 0 : _c[catKey]) || {};
        const groupOrder = ((_e = (_d = get(bucketCache)[bucket]) == null ? void 0 : _d.groups) == null ? void 0 : _e.map((g) => g.group_name)) || Object.keys(slotMap);
        for (const grp of groupOrder) {
          const arr = slotMap[grp] || [];
          for (const it of arr) {
            const t = chipText(it, overrides);
            if (t == null ? void 0 : t.trim()) bits.push(t.trim());
          }
        }
      } else {
        const matchedGroups = snapshot.matched[catKey] || {};
        const groupOrder = ((_g = (_f = get(bucketCache)[bucket]) == null ? void 0 : _f.groups) == null ? void 0 : _g.map((g) => g.group_name)) || Object.keys(matchedGroups);
        for (const grp of groupOrder) {
          const arr = matchedGroups[grp] || [];
          for (const it of arr) {
            if (subj && !((_j = (_i = (_h = subj.slots) == null ? void 0 : _h[catKey]) == null ? void 0 : _i[grp]) == null ? void 0 : _j.some((x) => x.item_tag === it.item_tag))) continue;
            const t = chipText(it, overrides);
            if (t == null ? void 0 : t.trim()) bits.push(t.trim());
          }
        }
      }
    }
    for (const tok of snapshot.freeform || []) if (tok.trim()) bits.push(tok.trim());
    const sectionKey = kind === "outfit" ? "outfit" : kind === "pose" ? "pose" : null;
    if (sectionKey) {
      for (const tok of ((_k = subj == null ? void 0 : subj.sectionFreeform) == null ? void 0 : _k[sectionKey]) || []) {
        if (tok.trim()) bits.push(tok.trim());
      }
    }
    const body = bits.join(", ");
    return get(isNaturalMode) && body ? `${body}.` : body;
  }
  function defaultCharacterCommentHeader(option) {
    if (!option) return null;
    if (option.kind === "cast") return `// Subject: ${option.display || option.tag}`;
    const series = option.series ? ` (${option.series})` : "";
    return `// Character: ${option.display || option.tag}${series}`;
  }
  function composeCategoryBody(subj, catKey, intro) {
    var _a2, _b, _c, _d;
    const bucket = (_a2 = CATEGORIES.find((c) => c.key === catKey)) == null ? void 0 : _a2.bucket;
    const slotMap = subj.slots[catKey] || {};
    const groupOrder = ((_c = (_b = get(bucketCache)[bucket]) == null ? void 0 : _b.groups) == null ? void 0 : _c.map((g) => g.group_name)) || Object.keys(slotMap);
    const bits = [];
    for (const grp of groupOrder) {
      const arr = slotMap[grp] || [];
      for (const it of arr) {
        const t = chipText(it, null);
        if (t == null ? void 0 : t.trim()) bits.push(t.trim());
      }
    }
    const sectionKey = catKey === "clothing" ? "outfit" : catKey === "pose" ? "pose" : catKey === "furniture" ? "interaction" : null;
    if (sectionKey) {
      for (const tok of ((_d = subj == null ? void 0 : subj.sectionFreeform) == null ? void 0 : _d[sectionKey]) || []) {
        if (tok.trim()) bits.push(tok.trim());
      }
    }
    if (!bits.length) return "";
    if (!get(isNaturalMode)) return bits.join(", ");
    if (intro) {
      const first = bits[0];
      const article = /^[aeiou]/i.test(first) ? "an" : "a";
      return `${intro} ${article} ${bits.join(", ")}.`;
    }
    return `${bits.join(", ")}.`;
  }
  function subjectHeader(subj) {
    if (subj.character) {
      return subj.character.commentHeader ?? null;
    }
    if (subj.commentHeader !== void 0) return subj.commentHeader;
    return `// ${subj.name || `Subject ${subj.letter}`}`;
  }
  function composeOutput() {
    var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const parts = [];
    const usedRegionNums = /* @__PURE__ */ new Set();
    for (const s of get(subjects)) {
      const m = /(\d+)$/.exec(s.regionName || "");
      if (m) usedRegionNums.add(parseInt(m[1], 10));
    }
    let nextRegionNum = 0;
    const freshRegionName = () => {
      do {
        nextRegionNum++;
      } while (usedRegionNums.has(nextRegionNum));
      usedRegionNums.add(nextRegionNum);
      return `$mannequin${nextRegionNum}`;
    };
    for (const subj of get(subjects)) {
      const subjParts = [];
      const body = composeSubjectBody(subj);
      if (body) {
        const h = subjectHeader(subj);
        subjParts.push(h ? `${h}
${body}` : body);
      }
      if (subj.activeOutfit && subj.outfitSnapshot) {
        const outfitBody = composeSnapshotBody(subj.outfitSnapshot, subj.activeOutfit, subj, "outfit");
        if (outfitBody) {
          const oa = subj.activeOutfit;
          const subjLabel = ((_a2 = subj.character) == null ? void 0 : _a2.display) || subj.name || `Subject ${subj.letter}`;
          const isCross = ((_b = subj.character) == null ? void 0 : _b.tag) && oa.character_tag !== subj.character.tag;
          const fromBit = isCross && oa.character_display ? ` from Character: ${oa.character_display}` : "";
          subjParts.push(`// Outfit: ${oa.name}${fromBit} (${subjLabel})
${outfitBody}`);
        }
      } else {
        const adhocOutfit = composeCategoryBody(subj, "clothing", get(isNaturalMode) ? "Wearing" : null);
        if (adhocOutfit) subjParts.push(`// Outfit
${adhocOutfit}`);
      }
      if (subj.activePose && subj.poseSnapshot) {
        const poseBody = composeSnapshotBody(subj.poseSnapshot, subj.activePose, subj, "pose");
        if (poseBody) {
          const pa = subj.activePose;
          const subjLabel = ((_c = subj.character) == null ? void 0 : _c.display) || subj.name || `Subject ${subj.letter}`;
          const isCross = ((_d = subj.character) == null ? void 0 : _d.tag) && pa.character_tag !== subj.character.tag;
          const fromBit = isCross && pa.character_display ? ` from Character: ${pa.character_display}` : "";
          subjParts.push(`// Pose: ${pa.name}${fromBit} (${subjLabel})
${poseBody}`);
        }
      } else {
        const adhocPose = composeCategoryBody(subj, "pose", null);
        if (adhocPose) subjParts.push(`// Pose
${adhocPose}`);
      }
      const interactions = composeCategoryBody(subj, "furniture", null);
      if (interactions) subjParts.push(`// Interaction
${interactions}`);
      if (!subjParts.length) continue;
      if (get(regionMode)) {
        const region = subj.regionName || freshRegionName();
        const inner = subjParts.join("\n\n").split("\n").map((l) => l.trim() ? `  ${l}` : l).join("\n");
        parts.push(`${region} {
${inner}
}`);
      } else {
        parts.push(...subjParts);
      }
    }
    const sceneBucket = get(bucketCache).scene;
    const sceneGroupOrder = ((_e = sceneBucket == null ? void 0 : sceneBucket.groups) == null ? void 0 : _e.map((g) => g.group_name)) || [];
    const furnitureGroupOrder = ((_g = (_f = get(bucketCache).furniture) == null ? void 0 : _f.groups) == null ? void 0 : _g.map((g) => g.group_name)) || [];
    const sceneOrder = [...sceneGroupOrder, ...furnitureGroupOrder];
    const seenKeys = new Set(sceneOrder);
    for (const k of Object.keys(get(sceneSelections))) if (!seenKeys.has(k)) sceneOrder.push(k);
    const sceneBits = [];
    for (const grp of sceneOrder) {
      for (const it of get(sceneSelections)[grp] || []) {
        const t = itemText(it);
        if (t == null ? void 0 : t.trim()) sceneBits.push(t.trim());
      }
    }
    for (const subj of get(subjects)) {
      for (const tok of ((_h = subj.sectionFreeform) == null ? void 0 : _h.scene) || []) {
        if (tok.trim()) sceneBits.push(tok.trim());
      }
    }
    for (const tok of get(sceneFreeform)) {
      if (tok.trim()) sceneBits.push(tok.trim());
    }
    if (sceneBits.length) parts.push(`// Scene
${sceneBits.join(", ")}`);
    if ((_j = (_i = get(activeStyle)) == null ? void 0 : _i.tags) == null ? void 0 : _j.length) {
      if (get(activeStyle).commentHeader) {
        parts.push(`${get(activeStyle).commentHeader}
${get(activeStyle).tags.join(", ")}`);
      } else {
        parts.push(get(activeStyle).tags.join(", "));
      }
    }
    let out = parts.join("\n\n");
    if (get(preservedPassthrough) && get(preservedPassthrough).trim()) {
      const ORPHAN_HEADER_RE = /^\/\/\s*(Outfit|Pose|Scene|Style|Character|Subject|Interaction)(\s*:.*)?\s*$/;
      const lines = get(preservedPassthrough).split("\n");
      const kept = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (ORPHAN_HEADER_RE.test(line)) {
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j++;
          if (j >= lines.length || /^\s*\/\//.test(lines[j])) continue;
        }
        kept.push(line);
      }
      const filtered = kept.join("\n").trim();
      if (filtered) out = out ? `${out}

${filtered}` : filtered;
    }
    if (!get(isNaturalMode) && ((_k = tagSourceConfig()) == null ? void 0 : _k.format) === "spaces") {
      out = out.split("\n").map((line) => line.startsWith("//") ? line : formatTagsForModel(line, tagSourceConfig())).join("\n");
    }
    return out;
  }
  function handleInsert() {
    onInsert()(composeOutput());
  }
  function setMode(natural) {
    set(isNaturalMode, natural, true);
    onPromptStyleChange()(natural ? "natural" : "tags");
  }
  var fragment = root_1();
  var div = first_child(fragment);
  let classes;
  var div_1 = child(div);
  var div_2 = sibling(child(div_1), 2);
  var input = child(div_2);
  var button = sibling(div_2, 2);
  var text_1 = child(button);
  var button_1 = sibling(button, 2);
  var div_3 = sibling(div_1, 2);
  var aside = child(div_3);
  var node_1 = sibling(child(aside), 2);
  each(node_1, 17, () => CATEGORIES, index, ($$anchor2, cat) => {
    const isActive = user_derived(() => get(activeCategory) === get(cat).key);
    var fragment_1 = root_2();
    var div_4 = first_child(fragment_1);
    let classes_1;
    var span_1 = child(div_4);
    var text_2 = child(span_1);
    var span_2 = sibling(span_1, 2);
    var text_3 = child(span_2);
    var node_2 = sibling(span_2, 2);
    {
      var consequent = ($$anchor3) => {
      };
      var consequent_2 = ($$anchor3) => {
        var fragment_2 = comment();
        var node_3 = first_child(fragment_2);
        {
          var consequent_1 = ($$anchor4) => {
            var span_3 = root_4();
            var text_4 = child(span_3);
            template_effect(() => set_text(text_4, get(stylesCache).items.length));
            append($$anchor4, span_3);
          };
          if_block(node_3, ($$render) => {
            if (get(cat).enabled && get(stylesCache).items.length) $$render(consequent_1);
          });
        }
        append($$anchor3, fragment_2);
      };
      var consequent_3 = ($$anchor3) => {
        var span_4 = root_5();
        var text_5 = child(span_4);
        template_effect(() => set_text(text_5, get(bucketCache)[get(cat).bucket].items.length));
        append($$anchor3, span_4);
      };
      if_block(node_2, ($$render) => {
        var _a2;
        if (get(cat).enabled && get(cat).key === "subjects") $$render(consequent);
        else if (get(cat).key === "styles") $$render(consequent_2, 1);
        else if (get(cat).enabled && ((_a2 = get(bucketCache)[get(cat).bucket]) == null ? void 0 : _a2.items)) $$render(consequent_3, 2);
      });
    }
    var node_4 = sibling(div_4, 2);
    {
      var consequent_7 = ($$anchor3) => {
        var div_5 = root_6();
        var div_6 = child(div_5);
        let classes_2;
        var node_5 = sibling(child(div_6), 2);
        {
          var consequent_4 = ($$anchor4) => {
            var span_5 = root_7();
            var text_6 = child(span_5);
            template_effect(($0) => set_text(text_6, $0), [() => get(charactersTotal).toLocaleString()]);
            append($$anchor4, span_5);
          };
          if_block(node_5, ($$render) => {
            if (get(charactersTotal) > 0 && !get(activeSubjectSubitem)) $$render(consequent_4);
          });
        }
        var node_6 = sibling(div_6, 2);
        each(node_6, 17, () => SUBJECT_SUBITEMS, index, ($$anchor4, sub) => {
          var div_7 = root_8();
          let classes_3;
          var span_6 = child(div_7);
          var text_7 = child(span_6);
          var node_7 = sibling(span_6, 2);
          {
            var consequent_5 = ($$anchor5) => {
              var span_7 = root_9();
              var text_8 = child(span_7);
              template_effect(() => set_text(text_8, get(castCache)[get(sub).filter].items.length));
              append($$anchor5, span_7);
            };
            var consequent_6 = ($$anchor5) => {
              var span_8 = root_10();
              var text_9 = child(span_8);
              template_effect(() => set_text(text_9, get(characterCategoryCounts)[get(sub).filter]));
              append($$anchor5, span_8);
            };
            if_block(node_7, ($$render) => {
              var _a2;
              if (get(sub).source === "cast" && ((_a2 = get(castCache)[get(sub).filter]) == null ? void 0 : _a2.items)) $$render(consequent_5);
              else if (get(sub).source === "characters" && get(characterCategoryCounts)[get(sub).filter]) $$render(consequent_6, 1);
            });
          }
          template_effect(() => {
            classes_3 = set_class(div_7, 1, "pcr-atb2-rail-sub svelte-ibd6yj", null, classes_3, { active: get(activeSubjectSubitem) === get(sub).key });
            set_text(text_7, get(sub).label);
          });
          delegated("click", div_7, () => selectSubjectSubitem(get(sub).key));
          append($$anchor4, div_7);
        });
        template_effect(() => classes_2 = set_class(div_6, 1, "pcr-atb2-rail-sub svelte-ibd6yj", null, classes_2, { active: get(activeSubjectSubitem) === null }));
        delegated("click", div_6, () => set(activeSubjectSubitem, null));
        append($$anchor3, div_5);
      };
      var consequent_8 = ($$anchor3) => {
        var div_8 = root_11();
        var div_9 = child(div_8);
        let classes_4;
        var span_9 = sibling(child(div_9), 2);
        var text_10 = child(span_9);
        var node_8 = sibling(div_9, 2);
        each(node_8, 17, () => get(styleGroups), index, ($$anchor4, g) => {
          var div_10 = root_12();
          let classes_5;
          var span_10 = child(div_10);
          var text_11 = child(span_10);
          var span_11 = sibling(span_10, 2);
          var text_12 = child(span_11);
          template_effect(() => {
            classes_5 = set_class(div_10, 1, "pcr-atb2-rail-sub svelte-ibd6yj", null, classes_5, { active: get(activeGroup) === get(g).group_name });
            set_text(text_11, get(g).display_name);
            set_text(text_12, (get(itemsByGroup)[get(g).group_name] || []).length);
          });
          delegated("click", div_10, () => selectGroup(get(g).group_name));
          append($$anchor4, div_10);
        });
        template_effect(() => {
          classes_4 = set_class(div_9, 1, "pcr-atb2-rail-sub svelte-ibd6yj", null, classes_4, { active: get(activeGroup) === null });
          set_text(text_10, get(stylesCache).items.length);
        });
        delegated("click", div_9, () => set(activeGroup, null));
        append($$anchor3, div_8);
      };
      var consequent_10 = ($$anchor3) => {
        var div_11 = root_13();
        var node_9 = child(div_11);
        each(node_9, 17, () => get(bucketCache)[get(cat).bucket].groups, index, ($$anchor4, g) => {
          var div_12 = root_14();
          let classes_6;
          var span_12 = child(div_12);
          var text_13 = child(span_12);
          var span_13 = sibling(span_12, 2);
          var text_14 = child(span_13);
          template_effect(() => {
            classes_6 = set_class(div_12, 1, "pcr-atb2-rail-sub svelte-ibd6yj", null, classes_6, {
              active: get(activeGroup) === null && get(scrollSpyGroup) === get(g).group_name
            });
            set_text(text_13, get(g).display_name || get(g).group_name);
            set_text(text_14, (get(itemsByGroup)[get(g).group_name] || []).length);
          });
          delegated("click", div_12, () => scrollToGroup(get(g).group_name));
          append($$anchor4, div_12);
        });
        var node_10 = sibling(node_9, 2);
        {
          var consequent_9 = ($$anchor4) => {
            var div_13 = root_15();
            let classes_7;
            var span_14 = sibling(child(div_13), 2);
            var text_15 = child(span_14);
            template_effect(() => {
              classes_7 = set_class(div_13, 1, "pcr-atb2-rail-sub svelte-ibd6yj", null, classes_7, { active: get(activeGroup) === MODIFIER_GROUP_KEY });
              set_text(text_15, MODIFIER_ITEMS.length);
            });
            delegated("click", div_13, () => selectGroup(MODIFIER_GROUP_KEY));
            append($$anchor4, div_13);
          };
          if_block(node_10, ($$render) => {
            if (get(cat).key === "appearance") $$render(consequent_9);
          });
        }
        append($$anchor3, div_11);
      };
      var consequent_12 = ($$anchor3) => {
        var div_14 = root_16();
        var node_11 = child(div_14);
        each(node_11, 17, () => get(bucketCache)[get(cat).bucket].groups, index, ($$anchor4, g) => {
          var div_15 = root_17();
          let classes_8;
          var span_15 = child(div_15);
          var text_16 = child(span_15);
          var span_16 = sibling(span_15, 2);
          var text_17 = child(span_16);
          template_effect(
            ($0) => {
              classes_8 = set_class(div_15, 1, "pcr-atb2-rail-sub svelte-ibd6yj", null, classes_8, {
                active: get(scrollSpyGroup) === get(cat).key + "/" + get(g).group_name
              });
              set_text(text_16, get(g).display_name || get(g).group_name);
              set_text(text_17, $0);
            },
            [
              () => get(bucketCache)[get(cat).bucket].items.filter((i) => i.item_group === get(g).group_name).length
            ]
          );
          delegated("click", div_15, () => scrollToAllSection(get(cat).key + "/" + get(g).group_name));
          append($$anchor4, div_15);
        });
        var node_12 = sibling(node_11, 2);
        {
          var consequent_11 = ($$anchor4) => {
            var div_16 = root_18();
            let classes_9;
            var span_17 = sibling(child(div_16), 2);
            var text_18 = child(span_17);
            template_effect(() => {
              classes_9 = set_class(div_16, 1, "pcr-atb2-rail-sub svelte-ibd6yj", null, classes_9, { active: get(scrollSpyGroup) === "appearance/__modifiers__" });
              set_text(text_18, MODIFIER_ITEMS.length);
            });
            delegated("click", div_16, () => scrollToAllSection("appearance/__modifiers__"));
            append($$anchor4, div_16);
          };
          if_block(node_12, ($$render) => {
            if (get(cat).key === "appearance") $$render(consequent_11);
          });
        }
        append($$anchor3, div_14);
      };
      if_block(node_4, ($$render) => {
        var _a2, _b, _c, _d;
        if (get(isActive) && get(cat).key === "subjects") $$render(consequent_7);
        else if (get(isActive) && get(cat).key === "styles" && get(styleGroups).length) $$render(consequent_8, 1);
        else if (get(isActive) && get(cat).enabled && ((_b = (_a2 = get(bucketCache)[get(cat).bucket]) == null ? void 0 : _a2.groups) == null ? void 0 : _b.length)) $$render(consequent_10, 2);
        else if (get(activeCategory) === "all" && get(cat).key === get(scrollSpyCategory) && get(cat).enabled && get(cat).bucket && ((_d = (_c = get(bucketCache)[get(cat).bucket]) == null ? void 0 : _c.groups) == null ? void 0 : _d.length)) $$render(consequent_12, 3);
      });
    }
    template_effect(() => {
      classes_1 = set_class(div_4, 1, "pcr-atb2-rail-item svelte-ibd6yj", null, classes_1, { active: get(isActive), disabled: !get(cat).enabled });
      set_text(text_2, get(cat).icon);
      set_text(text_3, get(cat).label);
    });
    delegated("click", div_4, () => selectCategory(get(cat).key));
    append($$anchor2, fragment_1);
  });
  bind_this(aside, ($$value) => set(railEl, $$value), () => get(railEl));
  var main = sibling(aside, 2);
  var div_17 = child(main);
  var span_18 = child(div_17);
  var span_19 = child(span_18);
  let classes_10;
  var strong = sibling(child(span_19));
  var text_19 = child(strong);
  var node_13 = sibling(span_19, 2);
  {
    var consequent_13 = ($$anchor2) => {
      var fragment_3 = root_19();
      var span_20 = sibling(first_child(fragment_3), 2);
      var text_20 = child(span_20);
      template_effect(($0) => set_text(text_20, $0), [() => groupDisplay(get(activeBucket), get(activeGroup))]);
      append($$anchor2, fragment_3);
    };
    if_block(node_13, ($$render) => {
      if (get(activeGroup)) $$render(consequent_13);
    });
  }
  var node_14 = sibling(div_17, 2);
  {
    var consequent_22 = ($$anchor2) => {
      var fragment_4 = comment();
      var node_15 = first_child(fragment_4);
      {
        var consequent_14 = ($$anchor3) => {
          var div_18 = root_21();
          var text_21 = child(div_18);
          template_effect(() => set_text(text_21, get(searchQuery) ? `No items match "${get(searchQuery)}"` : "Loading…"));
          append($$anchor3, div_18);
        };
        var alternate = ($$anchor3) => {
          var fragment_5 = comment();
          var node_16 = first_child(fragment_5);
          each(node_16, 17, () => get(allCategorySections), (section) => section.key, ($$anchor4, section) => {
            const cat = user_derived(() => CATEGORIES.find((c) => c.key === get(section).categoryKey));
            var div_19 = root_23();
            var div_20 = sibling(child(div_19), 2);
            var span_21 = child(div_20);
            var text_22 = child(span_21);
            var span_22 = sibling(span_21, 4);
            var text_23 = child(span_22);
            action(div_20, ($$node) => stickyShadow == null ? void 0 : stickyShadow($$node));
            var div_21 = sibling(div_20, 2);
            each(div_21, 21, () => get(section).items, (item) => item.item_tag, ($$anchor5, item) => {
              const sectionCardMods = user_derived(() => !get(section).kind && isCustomizableSlot(get(section).categoryKey, get(section).groupKey) ? cardModifiers(get(item), get(section).categoryKey, get(section).groupKey) : null);
              const sectionCardDotColor = user_derived(() => {
                var _a2;
                return ((_a2 = get(sectionCardMods)) == null ? void 0 : _a2.color) ? customizerColorHex(get(sectionCardMods).color) : null;
              });
              const sectionBucket = user_derived(() => {
                var _a2;
                return (_a2 = CATEGORIES.find((c) => c.key === get(section).categoryKey)) == null ? void 0 : _a2.bucket;
              });
              const sectionActiveIdentity = user_derived(() => {
                var _a2, _b, _c, _d;
                return get(section).kind === "subject-character" ? ((_b = (_a2 = get(activeSubject)) == null ? void 0 : _a2.character) == null ? void 0 : _b.tag) === get(item).tag : get(section).kind === "subject-cast" ? ((_d = (_c = get(activeSubject)) == null ? void 0 : _c.character) == null ? void 0 : _d.tag) === get(item).item_tag : false;
              });
              var div_22 = root_24();
              let classes_11;
              var node_17 = child(div_22);
              {
                var consequent_16 = ($$anchor6) => {
                  var div_23 = root_25();
                  let classes_12;
                  var node_18 = child(div_23);
                  {
                    var consequent_15 = ($$anchor7) => {
                      var img = root_26();
                      template_effect(($0) => set_attribute(img, "src", $0), [
                        () => `/promptchain/tag-builder/thumb/characters/${encodeURIComponent(get(item).tag)}`
                      ]);
                      append($$anchor7, img);
                    };
                    var d_1 = user_derived(() => get(characterThumbs).has(get(item).tag));
                    if_block(node_18, ($$render) => {
                      if (get(d_1)) $$render(consequent_15);
                    });
                  }
                  template_effect(($0) => classes_12 = set_class(div_23, 1, "pcr-atb2-card-thumb svelte-ibd6yj", null, classes_12, $0), [
                    () => ({ "has-image": get(characterThumbs).has(get(item).tag) })
                  ]);
                  append($$anchor6, div_23);
                };
                var consequent_18 = ($$anchor6) => {
                  const hasImg = user_derived(() => {
                    var _a2;
                    return (_a2 = get(castThumbs)[get(section).castGroup]) == null ? void 0 : _a2.has(get(item).item_tag);
                  });
                  var div_24 = root_27();
                  let classes_13;
                  var node_19 = child(div_24);
                  {
                    var consequent_17 = ($$anchor7) => {
                      var img_1 = root_28();
                      template_effect(($0) => set_attribute(img_1, "src", $0), [
                        () => `/promptchain/tag-builder/thumb/${encodeURIComponent(get(section).castGroup)}/${encodeURIComponent(get(item).item_tag)}`
                      ]);
                      append($$anchor7, img_1);
                    };
                    if_block(node_19, ($$render) => {
                      if (get(hasImg)) $$render(consequent_17);
                    });
                  }
                  template_effect(() => classes_13 = set_class(div_24, 1, "pcr-atb2-card-thumb svelte-ibd6yj", null, classes_13, { "has-image": get(hasImg) }));
                  append($$anchor6, div_24);
                };
                var consequent_19 = ($$anchor6) => {
                  var div_25 = root_29();
                  var img_2 = child(div_25);
                  template_effect(($0) => set_attribute(img_2, "src", $0), [() => thumbUrl(get(cat).bucket, get(item).item_tag)]);
                  append($$anchor6, div_25);
                };
                var d_2 = user_derived(() => {
                  var _a2;
                  return ((_a2 = get(cat)) == null ? void 0 : _a2.bucket) && hasThumb(get(cat).bucket, get(item).item_tag);
                });
                var consequent_20 = ($$anchor6) => {
                  var div_26 = root_30();
                  append($$anchor6, div_26);
                };
                if_block(node_17, ($$render) => {
                  var _a2;
                  if (get(section).kind === "subject-character") $$render(consequent_16);
                  else if (get(section).kind === "subject-cast") $$render(consequent_18, 1);
                  else if (get(d_2)) $$render(consequent_19, 2);
                  else if ((_a2 = get(cat)) == null ? void 0 : _a2.bucket) $$render(consequent_20, 3);
                });
              }
              var div_27 = sibling(node_17, 2);
              var node_20 = child(div_27);
              {
                var consequent_21 = ($$anchor6) => {
                  var button_2 = root_31();
                  let classes_14;
                  template_effect(() => {
                    classes_14 = set_class(button_2, 1, "pcr-atb2-card-mod-dot svelte-ibd6yj", null, classes_14, {
                      filled: !!get(sectionCardDotColor),
                      hollow: !get(sectionCardDotColor)
                    });
                    set_style(button_2, get(sectionCardDotColor) ? `background:${get(sectionCardDotColor)}` : "");
                  });
                  delegated("click", button_2, (e) => {
                    e.stopPropagation();
                    editCardModifiers(get(item), get(section).categoryKey, get(section).groupKey);
                  });
                  append($$anchor6, button_2);
                };
                if_block(node_20, ($$render) => {
                  if (get(sectionCardMods)) $$render(consequent_21);
                });
              }
              var text_24 = sibling(node_20);
              template_effect(
                ($0) => {
                  classes_11 = set_class(div_22, 1, "pcr-atb2-card svelte-ibd6yj", null, classes_11, $0);
                  set_attribute(div_22, "data-item-tag", get(item).item_tag);
                  set_attribute(div_22, "title", get(item).base_natlang || get(item).display_name || get(item).item_tag);
                  set_text(text_24, ` ${(get(item).display_name || get(item).item_tag) ?? ""}`);
                },
                [
                  () => ({
                    selected: get(section).kind ? get(sectionActiveIdentity) : isSelectedInCategory(get(item), get(section).categoryKey, get(section).groupKey),
                    "pcr-atb2-card-unprocessed": !get(section).kind && isItemUnprocessed(get(item))
                  })
                ]
              );
              delegated("click", div_22, () => {
                if (get(section).kind === "subject-character") {
                  if (get(sectionActiveIdentity)) unbindIdentity(get(activeSubject).id);
                  else pickIdentityFromBrowser(characterToOption(get(item)));
                } else if (get(section).kind === "subject-cast") {
                  if (get(sectionActiveIdentity)) unbindIdentity(get(activeSubject).id);
                  else pickIdentityFromBrowser(castToOption(get(item), get(section).castGroup));
                } else {
                  pickItemFromAll(get(item), get(section).categoryKey, get(section).groupKey);
                }
              });
              delegated("contextmenu", div_22, (e) => {
                if (!get(section).kind && get(sectionBucket)) openChipQaMenu(e, get(sectionBucket), get(item));
              });
              append($$anchor5, div_22);
            });
            action(div_19, ($$node) => spyTarget == null ? void 0 : spyTarget($$node));
            template_effect(() => {
              set_attribute(div_19, "data-spy-group", get(section).key);
              set_text(text_22, get(section).categoryLabel);
              set_text(text_23, get(section).groupLabel);
            });
            append($$anchor4, div_19);
          });
          append($$anchor3, fragment_5);
        };
        if_block(node_15, ($$render) => {
          if (get(allCategorySections).length === 0) $$render(consequent_14);
          else $$render(alternate, -1);
        });
      }
      append($$anchor2, fragment_4);
    };
    var consequent_32 = ($$anchor2) => {
      const sub = user_derived(() => get(activeSubjectSubitem) ? SUBJECT_SUBITEMS.find((s) => s.key === get(activeSubjectSubitem)) : null);
      var fragment_6 = comment();
      var node_21 = first_child(fragment_6);
      {
        var consequent_28 = ($$anchor3) => {
          var fragment_7 = comment();
          var node_22 = first_child(fragment_7);
          {
            var consequent_23 = ($$anchor4) => {
              var div_28 = root_34();
              append($$anchor4, div_28);
            };
            var consequent_24 = ($$anchor4) => {
              var div_29 = root_35();
              var text_25 = child(div_29);
              template_effect(() => set_text(text_25, get(searchQuery) ? `No characters match "${get(searchQuery)}"` : "No characters."));
              append($$anchor4, div_29);
            };
            var alternate_1 = ($$anchor4) => {
              var fragment_8 = root_36();
              var div_30 = first_child(fragment_8);
              each(div_30, 21, () => get(characters), (char) => char.tag, ($$anchor5, char) => {
                const isActiveIdentity = user_derived(() => {
                  var _a2, _b;
                  return ((_b = (_a2 = get(activeSubject)) == null ? void 0 : _a2.character) == null ? void 0 : _b.tag) === get(char).tag;
                });
                var div_31 = root_37();
                let classes_15;
                var div_32 = child(div_31);
                let classes_16;
                var node_23 = child(div_32);
                {
                  var consequent_25 = ($$anchor6) => {
                    var img_3 = root_38();
                    template_effect(($0) => set_attribute(img_3, "src", $0), [
                      () => `/promptchain/tag-builder/thumb/characters/${encodeURIComponent(get(char).tag)}`
                    ]);
                    append($$anchor6, img_3);
                  };
                  var d_3 = user_derived(() => get(characterThumbs).has(get(char).tag));
                  if_block(node_23, ($$render) => {
                    if (get(d_3)) $$render(consequent_25);
                  });
                }
                var div_33 = sibling(div_32, 2);
                var text_26 = child(div_33);
                var node_24 = sibling(div_33, 2);
                {
                  var consequent_26 = ($$anchor6) => {
                    var div_34 = root_39();
                    var text_27 = child(div_34);
                    template_effect(() => set_text(text_27, get(char).series));
                    append($$anchor6, div_34);
                  };
                  if_block(node_24, ($$render) => {
                    if (get(char).series) $$render(consequent_26);
                  });
                }
                template_effect(
                  ($0) => {
                    classes_15 = set_class(div_31, 1, "pcr-atb2-card svelte-ibd6yj", null, classes_15, { selected: get(isActiveIdentity) });
                    set_attribute(div_31, "title", get(char).base_natlang || `${get(char).display}${get(char).series ? " — " + get(char).series : ""}`);
                    classes_16 = set_class(div_32, 1, "pcr-atb2-card-thumb svelte-ibd6yj", null, classes_16, $0);
                    set_text(text_26, get(char).display || get(char).tag);
                  },
                  [
                    () => ({ "has-image": get(characterThumbs).has(get(char).tag) })
                  ]
                );
                delegated("click", div_31, () => get(isActiveIdentity) ? unbindIdentity(get(activeSubject).id) : pickIdentityFromBrowser(characterToOption(get(char))));
                append($$anchor5, div_31);
              });
              var node_25 = sibling(div_30, 2);
              {
                var consequent_27 = ($$anchor5) => {
                  var div_35 = root_40();
                  var text_28 = child(div_35);
                  template_effect(() => set_text(text_28, `Showing top ${get(characters).length ?? ""} of ${get(charactersTotal) ?? ""} — narrow your search to find more.`));
                  append($$anchor5, div_35);
                };
                if_block(node_25, ($$render) => {
                  if (get(charactersTotal) > get(characters).length) $$render(consequent_27);
                });
              }
              append($$anchor4, fragment_8);
            };
            if_block(node_22, ($$render) => {
              if (get(charactersLoading)) $$render(consequent_23);
              else if (get(characters).length === 0) $$render(consequent_24, 1);
              else $$render(alternate_1, -1);
            });
          }
          append($$anchor3, fragment_7);
        };
        var alternate_3 = ($$anchor3) => {
          const castData = user_derived(() => get(castCache)[get(sub).filter]);
          var fragment_9 = comment();
          var node_26 = first_child(fragment_9);
          {
            var consequent_29 = ($$anchor4) => {
              var div_36 = root_42();
              var text_29 = child(div_36);
              template_effect(() => set_text(text_29, `Loading ${get(sub).label ?? ""}…`));
              append($$anchor4, div_36);
            };
            var consequent_30 = ($$anchor4) => {
              var div_37 = root_43();
              var text_30 = child(div_37);
              template_effect(($0) => set_text(text_30, `No ${$0 ?? ""} items.`), [() => get(sub).label.toLowerCase()]);
              append($$anchor4, div_37);
            };
            var alternate_2 = ($$anchor4) => {
              var div_38 = root_44();
              each(div_38, 21, () => get(castData).items, (item) => item.item_tag, ($$anchor5, item) => {
                const hasImg = user_derived(() => {
                  var _a2;
                  return (_a2 = get(castThumbs)[get(sub).filter]) == null ? void 0 : _a2.has(get(item).item_tag);
                });
                const isActiveIdentity = user_derived(() => {
                  var _a2, _b;
                  return ((_b = (_a2 = get(activeSubject)) == null ? void 0 : _a2.character) == null ? void 0 : _b.tag) === get(item).item_tag;
                });
                var div_39 = root_45();
                let classes_17;
                var div_40 = child(div_39);
                let classes_18;
                var node_27 = child(div_40);
                {
                  var consequent_31 = ($$anchor6) => {
                    var img_4 = root_46();
                    template_effect(($0) => set_attribute(img_4, "src", $0), [
                      () => `/promptchain/tag-builder/thumb/${encodeURIComponent(get(sub).filter)}/${encodeURIComponent(get(item).item_tag)}`
                    ]);
                    append($$anchor6, img_4);
                  };
                  if_block(node_27, ($$render) => {
                    if (get(hasImg)) $$render(consequent_31);
                  });
                }
                var div_41 = sibling(div_40, 2);
                var text_31 = child(div_41);
                template_effect(
                  ($0) => {
                    classes_17 = set_class(div_39, 1, "pcr-atb2-card svelte-ibd6yj", null, classes_17, $0);
                    set_attribute(div_39, "title", get(item).base_natlang || get(item).display_name || get(item).item_tag);
                    classes_18 = set_class(div_40, 1, "pcr-atb2-card-thumb svelte-ibd6yj", null, classes_18, { "has-image": get(hasImg) });
                    set_text(text_31, get(item).display_name || get(item).item_tag);
                  },
                  [
                    () => ({
                      selected: get(isActiveIdentity),
                      "pcr-atb2-card-unprocessed": isItemUnprocessed(get(item))
                    })
                  ]
                );
                delegated("click", div_39, () => get(isActiveIdentity) ? unbindIdentity(get(activeSubject).id) : pickIdentityFromBrowser(castToOption(get(item), get(sub).filter)));
                delegated("contextmenu", div_39, (e) => openChipQaMenu(e, "cast", get(item)));
                append($$anchor5, div_39);
              });
              append($$anchor4, div_38);
            };
            if_block(node_26, ($$render) => {
              var _a2;
              if (!get(castData) || get(castData).loading) $$render(consequent_29);
              else if (!((_a2 = get(castData).items) == null ? void 0 : _a2.length)) $$render(consequent_30, 1);
              else $$render(alternate_2, -1);
            });
          }
          append($$anchor3, fragment_9);
        };
        if_block(node_21, ($$render) => {
          if (!get(sub) || get(sub).source === "characters") $$render(consequent_28);
          else $$render(alternate_3, -1);
        });
      }
      append($$anchor2, fragment_6);
    };
    var consequent_33 = ($$anchor2) => {
      var div_42 = root_47();
      append($$anchor2, div_42);
    };
    var consequent_34 = ($$anchor2) => {
      var div_43 = root_48();
      append($$anchor2, div_43);
    };
    var consequent_35 = ($$anchor2) => {
      var div_44 = root_49();
      append($$anchor2, div_44);
    };
    var consequent_36 = ($$anchor2) => {
      var div_45 = root_50();
      var text_32 = child(div_45);
      template_effect(() => set_text(text_32, `Loading ${get(activeCategoryDef).label ?? ""}…`));
      append($$anchor2, div_45);
    };
    var consequent_37 = ($$anchor2) => {
      var div_46 = root_51();
      append($$anchor2, div_46);
    };
    var consequent_40 = ($$anchor2) => {
      var fragment_10 = comment();
      var node_28 = first_child(fragment_10);
      each(node_28, 17, () => get(groupedSections), (section) => section.key, ($$anchor3, section) => {
        var div_47 = root_53();
        var div_48 = sibling(child(div_47), 2);
        var span_23 = child(div_48);
        var text_33 = child(span_23);
        action(div_48, ($$node) => stickyShadow == null ? void 0 : stickyShadow($$node));
        var div_49 = sibling(div_48, 2);
        each(div_49, 21, () => get(section).items, (item) => item.item_tag, ($$anchor4, item) => {
          const groupCardMods = user_derived(() => isCustomizableSlot(get(activeCategory), get(item).item_group) ? cardModifiers(get(item), get(activeCategory), get(item).item_group) : null);
          const groupCardDotColor = user_derived(() => {
            var _a2;
            return ((_a2 = get(groupCardMods)) == null ? void 0 : _a2.color) ? customizerColorHex(get(groupCardMods).color) : null;
          });
          var div_50 = root_54();
          let classes_19;
          var div_51 = child(div_50);
          let classes_20;
          var node_29 = child(div_51);
          {
            var consequent_38 = ($$anchor5) => {
              var img_5 = root_55();
              template_effect(($0) => set_attribute(img_5, "src", $0), [() => thumbUrl(get(activeBucket), get(item).item_tag)]);
              append($$anchor5, img_5);
            };
            var d_4 = user_derived(() => hasThumb(get(activeBucket), get(item).item_tag));
            if_block(node_29, ($$render) => {
              if (get(d_4)) $$render(consequent_38);
            });
          }
          var div_52 = sibling(div_51, 2);
          var node_30 = child(div_52);
          {
            var consequent_39 = ($$anchor5) => {
              var button_3 = root_56();
              let classes_21;
              template_effect(() => {
                classes_21 = set_class(button_3, 1, "pcr-atb2-card-mod-dot svelte-ibd6yj", null, classes_21, {
                  filled: !!get(groupCardDotColor),
                  hollow: !get(groupCardDotColor)
                });
                set_style(button_3, get(groupCardDotColor) ? `background:${get(groupCardDotColor)}` : "");
              });
              delegated("click", button_3, (e) => {
                e.stopPropagation();
                editCardModifiers(get(item), get(activeCategory), get(item).item_group);
              });
              append($$anchor5, button_3);
            };
            if_block(node_30, ($$render) => {
              if (get(groupCardMods)) $$render(consequent_39);
            });
          }
          var text_34 = sibling(node_30);
          template_effect(
            ($0, $1) => {
              classes_19 = set_class(div_50, 1, "pcr-atb2-card svelte-ibd6yj", null, classes_19, $0);
              set_attribute(div_50, "data-item-tag", get(item).item_tag);
              set_attribute(div_50, "title", get(item).base_natlang || get(item).display_name || get(item).item_tag);
              classes_20 = set_class(div_51, 1, "pcr-atb2-card-thumb svelte-ibd6yj", null, classes_20, $1);
              set_text(text_34, ` ${(get(item).display_name || get(item).item_tag) ?? ""}`);
            },
            [
              () => ({
                selected: isSelected(get(item)),
                "pcr-atb2-card-unprocessed": isItemUnprocessed(get(item))
              }),
              () => ({
                "has-image": hasThumb(get(activeBucket), get(item).item_tag)
              })
            ]
          );
          delegated("click", div_50, () => pickItem(get(item)));
          delegated("contextmenu", div_50, (e) => {
            if (get(activeBucket)) openChipQaMenu(e, get(activeBucket), get(item));
          });
          append($$anchor4, div_50);
        });
        action(div_47, ($$node) => spyTarget == null ? void 0 : spyTarget($$node));
        template_effect(() => {
          set_attribute(div_47, "data-spy-group", get(section).groupKey);
          set_text(text_33, get(section).groupLabel);
        });
        append($$anchor3, div_47);
      });
      append($$anchor2, fragment_10);
    };
    var alternate_4 = ($$anchor2) => {
      var div_53 = root_57();
      each(div_53, 21, () => get(visibleItems), (item) => item.item_tag, ($$anchor3, item) => {
        const flatCardMods = user_derived(() => isCustomizableSlot(get(activeCategory), get(item).item_group) ? cardModifiers(get(item), get(activeCategory), get(item).item_group) : null);
        const flatCardDotColor = user_derived(() => {
          var _a2;
          return ((_a2 = get(flatCardMods)) == null ? void 0 : _a2.color) ? customizerColorHex(get(flatCardMods).color) : null;
        });
        var div_54 = root_58();
        let classes_22;
        var node_31 = child(div_54);
        {
          var consequent_42 = ($$anchor4) => {
            var div_55 = root_59();
            let classes_23;
            var node_32 = child(div_55);
            {
              var consequent_41 = ($$anchor5) => {
                var img_6 = root_60();
                template_effect(($0) => set_attribute(img_6, "src", $0), [() => thumbUrl(get(activeBucket), get(item).item_tag)]);
                append($$anchor5, img_6);
              };
              var d_5 = user_derived(() => hasThumb(get(activeBucket), get(item).item_tag));
              if_block(node_32, ($$render) => {
                if (get(d_5)) $$render(consequent_41);
              });
            }
            template_effect(($0) => classes_23 = set_class(div_55, 1, "pcr-atb2-card-thumb svelte-ibd6yj", null, classes_23, $0), [
              () => ({
                "has-image": hasThumb(get(activeBucket), get(item).item_tag)
              })
            ]);
            append($$anchor4, div_55);
          };
          if_block(node_31, ($$render) => {
            if (get(activeCategory) !== "styles") $$render(consequent_42);
          });
        }
        var div_56 = sibling(node_31, 2);
        var node_33 = child(div_56);
        {
          var consequent_43 = ($$anchor4) => {
            var button_4 = root_61();
            let classes_24;
            template_effect(() => {
              classes_24 = set_class(button_4, 1, "pcr-atb2-card-mod-dot svelte-ibd6yj", null, classes_24, {
                filled: !!get(flatCardDotColor),
                hollow: !get(flatCardDotColor)
              });
              set_style(button_4, get(flatCardDotColor) ? `background:${get(flatCardDotColor)}` : "");
            });
            delegated("click", button_4, (e) => {
              e.stopPropagation();
              editCardModifiers(get(item), get(activeCategory), get(item).item_group);
            });
            append($$anchor4, button_4);
          };
          if_block(node_33, ($$render) => {
            if (get(flatCardMods)) $$render(consequent_43);
          });
        }
        var text_35 = sibling(node_33);
        var node_34 = sibling(div_56, 2);
        {
          var consequent_44 = ($$anchor4) => {
            var div_57 = root_62();
            var text_36 = child(div_57);
            template_effect(() => {
              var _a2;
              return set_text(text_36, `${((_a2 = get(item).tags) == null ? void 0 : _a2.length) ?? 0 ?? ""} tags`);
            });
            append($$anchor4, div_57);
          };
          var consequent_45 = ($$anchor4) => {
            var div_58 = root_63();
            var text_37 = child(div_58);
            template_effect(($0) => set_text(text_37, $0), [
              () => groupDisplay(get(activeBucket), get(item).item_group)
            ]);
            append($$anchor4, div_58);
          };
          if_block(node_34, ($$render) => {
            if (get(activeCategory) === "styles") $$render(consequent_44);
            else if (!get(activeGroup)) $$render(consequent_45, 1);
          });
        }
        template_effect(
          ($0) => {
            classes_22 = set_class(div_54, 1, "pcr-atb2-card svelte-ibd6yj", null, classes_22, $0);
            set_attribute(div_54, "data-item-tag", get(item).item_tag);
            set_attribute(div_54, "title", get(item).base_natlang || get(item).display_name || get(item).item_tag);
            set_text(text_35, ` ${(get(item).display_name || get(item).item_tag) ?? ""}`);
          },
          [
            () => ({
              selected: isSelected(get(item)),
              "pcr-atb2-card-style": get(activeCategory) === "styles",
              "pcr-atb2-card-unprocessed": get(activeCategory) !== "styles" && isItemUnprocessed(get(item))
            })
          ]
        );
        delegated("click", div_54, () => pickItem(get(item)));
        delegated("contextmenu", div_54, (e) => {
          if (get(activeCategory) !== "styles" && get(activeBucket)) openChipQaMenu(e, get(activeBucket), get(item));
        });
        append($$anchor3, div_54);
      });
      append($$anchor2, div_53);
    };
    if_block(node_14, ($$render) => {
      var _a2;
      if (get(activeCategory) === "all") $$render(consequent_22);
      else if (get(activeCategory) === "subjects") $$render(consequent_32, 1);
      else if (get(activeCategory) === "styles" && !((_a2 = modelInfo()) == null ? void 0 : _a2.hash)) $$render(consequent_33, 2);
      else if (get(activeCategory) === "styles" && get(stylesCache).loading) $$render(consequent_34, 3);
      else if (get(activeCategory) === "styles" && get(visibleItems).length === 0) $$render(consequent_35, 4);
      else if (get(activeCategory) !== "styles" && get(activeBucketData).loading) $$render(consequent_36, 5);
      else if (get(visibleItems).length === 0) $$render(consequent_37, 6);
      else if (get(groupedSections)) $$render(consequent_40, 7);
      else $$render(alternate_4, -1);
    });
  }
  bind_this(main, ($$value) => set(browserEl, $$value), () => get(browserEl));
  var aside_1 = sibling(main, 2);
  var node_35 = sibling(child(aside_1), 2);
  each(node_35, 17, () => get(subjects), (subj) => subj.id, ($$anchor2, subj) => {
    const typeDef = user_derived(() => SUBJECT_TYPES[get(subj).type] || SUBJECT_TYPES.person);
    const isActive = user_derived(() => get(activeSubjectId) === get(subj).id);
    const charThumbBucket = user_derived(() => {
      var _a2;
      return ((_a2 = get(subj).character) == null ? void 0 : _a2.kind) === "cast" ? get(subj).character.group : get(subj).character ? "characters" : null;
    });
    const charThumbHas = user_derived(() => {
      var _a2, _b;
      return ((_a2 = get(subj).character) == null ? void 0 : _a2.kind) === "cast" ? !!((_b = get(castThumbs)[get(subj).character.group]) == null ? void 0 : _b.has(get(subj).character.tag)) : !!(get(subj).character && get(characterThumbs).has(get(subj).character.tag));
    });
    var div_59 = root_64();
    let classes_25;
    var div_60 = child(div_59);
    var node_36 = child(div_60);
    {
      var consequent_46 = ($$anchor3) => {
        var span_24 = root_65();
        var img_7 = child(span_24);
        template_effect(
          ($0) => {
            set_style(span_24, `border-color:${get(typeDef).color ?? ""}`);
            set_attribute(img_7, "src", $0);
          },
          [
            () => `/promptchain/tag-builder/thumb/${encodeURIComponent(get(charThumbBucket))}/${encodeURIComponent(get(subj).character.tag)}`
          ]
        );
        append($$anchor3, span_24);
      };
      var alternate_5 = ($$anchor3) => {
        var span_25 = root_66();
        var text_38 = child(span_25);
        template_effect(() => {
          set_style(span_25, `background:${get(typeDef).color ?? ""}`);
          set_text(text_38, get(subj).letter);
        });
        append($$anchor3, span_25);
      };
      if_block(node_36, ($$render) => {
        if (get(subj).character && get(charThumbHas)) $$render(consequent_46);
        else $$render(alternate_5, -1);
      });
    }
    var input_1 = sibling(node_36, 2);
    var span_26 = sibling(input_1, 2);
    var text_39 = child(span_26);
    var node_37 = sibling(span_26, 2);
    {
      var consequent_47 = ($$anchor3) => {
        var span_27 = root_67();
        var text_40 = child(span_27);
        template_effect(() => set_text(text_40, get(subj).regionName || "+ new block"));
        append($$anchor3, span_27);
      };
      if_block(node_37, ($$render) => {
        if (get(regionMode)) $$render(consequent_47);
      });
    }
    var button_5 = sibling(node_37, 2);
    var div_61 = sibling(div_60, 2);
    var div_62 = sibling(child(div_61), 2);
    var span_28 = sibling(child(div_62), 2);
    var span_29 = child(span_28);
    var button_6 = child(span_29);
    var span_30 = child(button_6);
    var node_38 = child(span_30);
    {
      var consequent_49 = ($$anchor3) => {
        var fragment_11 = root_68();
        var text_41 = first_child(fragment_11, true);
        var node_39 = sibling(text_41);
        {
          var consequent_48 = ($$anchor4) => {
            var text_42 = text();
            template_effect(() => set_text(text_42, `— ${get(subj).character.series ?? ""}`));
            append($$anchor4, text_42);
          };
          if_block(node_39, ($$render) => {
            if (get(subj).character.series) $$render(consequent_48);
          });
        }
        template_effect(() => set_text(text_41, get(subj).character.display));
        append($$anchor3, fragment_11);
      };
      var alternate_6 = ($$anchor3) => {
        var text_43 = text("Pick an identity…");
        append($$anchor3, text_43);
      };
      if_block(node_38, ($$render) => {
        if (get(subj).character) $$render(consequent_49);
        else $$render(alternate_6, -1);
      });
    }
    var node_40 = sibling(button_6, 2);
    {
      var consequent_50 = ($$anchor3) => {
        var button_7 = root_71();
        delegated("click", button_7, (e) => {
          e.stopPropagation();
          unbindIdentity(get(subj).id);
        });
        append($$anchor3, button_7);
      };
      if_block(node_40, ($$render) => {
        if (get(subj).character) $$render(consequent_50);
      });
    }
    var div_63 = sibling(div_62, 2);
    var span_31 = sibling(child(div_63), 2);
    var span_32 = child(span_31);
    var button_8 = child(span_32);
    var span_33 = child(button_8);
    var node_41 = child(span_33);
    {
      var consequent_52 = ($$anchor3) => {
        var fragment_13 = root_72();
        var text_44 = first_child(fragment_13, true);
        var node_42 = sibling(text_44);
        {
          var consequent_51 = ($$anchor4) => {
            var text_45 = text();
            template_effect(() => set_text(text_45, `— ${get(subj).activeOutfit.character_display ?? ""}`));
            append($$anchor4, text_45);
          };
          if_block(node_42, ($$render) => {
            var _a2;
            if (get(subj).activeOutfit.character_tag !== ((_a2 = get(subj).character) == null ? void 0 : _a2.tag)) $$render(consequent_51);
          });
        }
        template_effect(() => set_text(text_44, get(subj).activeOutfit.name));
        append($$anchor3, fragment_13);
      };
      var alternate_7 = ($$anchor3) => {
        var text_46 = text("Pick outfit…");
        append($$anchor3, text_46);
      };
      if_block(node_41, ($$render) => {
        if (get(subj).activeOutfit) $$render(consequent_52);
        else $$render(alternate_7, -1);
      });
    }
    var node_43 = sibling(button_8, 2);
    {
      var consequent_53 = ($$anchor3) => {
        var button_9 = root_75();
        delegated("click", button_9, (e) => {
          e.stopPropagation();
          removePreset(get(subj).id, "outfit");
        });
        append($$anchor3, button_9);
      };
      if_block(node_43, ($$render) => {
        if (get(subj).activeOutfit) $$render(consequent_53);
      });
    }
    var div_64 = sibling(div_63, 2);
    var span_34 = sibling(child(div_64), 2);
    var span_35 = child(span_34);
    var button_10 = child(span_35);
    var span_36 = child(button_10);
    var node_44 = child(span_36);
    {
      var consequent_55 = ($$anchor3) => {
        var fragment_15 = root_76();
        var text_47 = first_child(fragment_15, true);
        var node_45 = sibling(text_47);
        {
          var consequent_54 = ($$anchor4) => {
            var text_48 = text();
            template_effect(() => set_text(text_48, `— ${get(subj).activePose.character_display ?? ""}`));
            append($$anchor4, text_48);
          };
          if_block(node_45, ($$render) => {
            var _a2;
            if (get(subj).activePose.character_tag !== ((_a2 = get(subj).character) == null ? void 0 : _a2.tag)) $$render(consequent_54);
          });
        }
        template_effect(() => set_text(text_47, get(subj).activePose.name));
        append($$anchor3, fragment_15);
      };
      var alternate_8 = ($$anchor3) => {
        var text_49 = text("Pick pose…");
        append($$anchor3, text_49);
      };
      if_block(node_44, ($$render) => {
        if (get(subj).activePose) $$render(consequent_55);
        else $$render(alternate_8, -1);
      });
    }
    var node_46 = sibling(button_10, 2);
    {
      var consequent_56 = ($$anchor3) => {
        var button_11 = root_79();
        delegated("click", button_11, (e) => {
          e.stopPropagation();
          removePreset(get(subj).id, "pose");
        });
        append($$anchor3, button_11);
      };
      if_block(node_46, ($$render) => {
        if (get(subj).activePose) $$render(consequent_56);
      });
    }
    var node_47 = sibling(div_61, 2);
    each(node_47, 17, () => get(typeDef).slotCategories, index, ($$anchor3, catKey) => {
      const catDef = user_derived(() => CATEGORIES.find((c) => c.key === get(catKey)));
      var fragment_17 = comment();
      var node_48 = first_child(fragment_17);
      {
        var consequent_64 = ($$anchor4) => {
          const catGroups = user_derived(() => get(bucketCache)[get(catDef).bucket].groups);
          const catSlots = user_derived(() => get(subj).slots[get(catKey)] || {});
          const multiSet = user_derived(() => MULTI_GROUPS[get(catDef).bucket] || /* @__PURE__ */ new Set());
          const emptyCount = user_derived(() => get(catGroups).filter((g) => !(get(catSlots)[g.group_name] || []).length).length);
          const isExpanded = user_derived(() => {
            var _a2;
            return !!((_a2 = get(subj).expandedSections) == null ? void 0 : _a2[get(catKey)]);
          });
          const hasChev = user_derived(() => get(emptyCount) > 0);
          var div_65 = root_81();
          var div_66 = child(div_65);
          let classes_26;
          var span_37 = child(div_66);
          var text_50 = child(span_37);
          var node_49 = sibling(span_37, 2);
          {
            var consequent_57 = ($$anchor5) => {
              var span_38 = root_82();
              var text_51 = child(span_38);
              template_effect(() => set_text(text_51, `${get(isExpanded) ? "▾" : "▸"} +${get(emptyCount) ?? ""}`));
              append($$anchor5, span_38);
            };
            if_block(node_49, ($$render) => {
              if (get(hasChev)) $$render(consequent_57);
            });
          }
          var node_50 = sibling(div_66, 2);
          {
            var consequent_58 = ($$anchor5) => {
              var div_67 = root_83();
              var span_39 = sibling(child(div_67), 2);
              var span_40 = child(span_39);
              var text_52 = child(span_40);
              var button_12 = sibling(text_52);
              template_effect(() => set_text(text_52, `${get(subj).character.display ?? ""} `));
              delegated("click", span_40, (e) => {
                e.stopPropagation();
                jumpToIdentity(get(subj).id);
              });
              delegated("click", button_12, (e) => {
                e.stopPropagation();
                unbindIdentity(get(subj).id);
              });
              append($$anchor5, div_67);
            };
            if_block(node_50, ($$render) => {
              if (get(catKey) === "appearance" && get(subj).character) $$render(consequent_58);
            });
          }
          var node_51 = sibling(node_50, 2);
          {
            var consequent_59 = ($$anchor5) => {
              var div_68 = root_84();
              var span_41 = sibling(child(div_68), 2);
              var node_52 = child(span_41);
              each(node_52, 19, () => get(subj).modifiers || [], (tok, mi) => tok + " " + mi, ($$anchor6, tok) => {
                var span_42 = root_85();
                var text_53 = child(span_42);
                var button_13 = sibling(text_53);
                template_effect(() => set_text(text_53, `${get(tok) ?? ""} `));
                delegated("click", span_42, (e) => {
                  e.stopPropagation();
                  jumpToModifier(get(subj).id, get(tok));
                });
                delegated("click", button_13, (e) => {
                  e.stopPropagation();
                  removeModifier(get(subj).id, get(tok));
                });
                append($$anchor6, span_42);
              });
              var span_43 = sibling(node_52, 2);
              delegated("click", span_43, (e) => {
                e.stopPropagation();
                openModifierPicker(get(subj).id, e.currentTarget);
              });
              append($$anchor5, div_68);
            };
            if_block(node_51, ($$render) => {
              if (get(catKey) === "appearance") $$render(consequent_59);
            });
          }
          var node_53 = sibling(node_51, 2);
          each(node_53, 17, () => get(catGroups), index, ($$anchor5, g) => {
            const sel = user_derived(() => get(catSlots)[get(g).group_name] || []);
            const isMulti = user_derived(() => get(multiSet).has(get(g).group_name));
            var fragment_18 = comment();
            var node_54 = first_child(fragment_18);
            {
              var consequent_63 = ($$anchor6) => {
                var div_69 = root_87();
                var span_44 = child(div_69);
                var text_54 = child(span_44);
                var node_55 = sibling(text_54);
                {
                  var consequent_60 = ($$anchor7) => {
                    var span_45 = root_88();
                    append($$anchor7, span_45);
                  };
                  if_block(node_55, ($$render) => {
                    if (get(isMulti)) $$render(consequent_60);
                  });
                }
                var span_46 = sibling(span_44, 2);
                var node_56 = child(span_46);
                each(node_56, 17, () => get(sel), (item) => item.item_tag, ($$anchor7, item) => {
                  const hasMods = user_derived(() => !!get(item).modifiers);
                  const isFurn = user_derived(() => isFurnitureChip(get(item)));
                  const capColor = user_derived(() => {
                    var _a2;
                    return get(isFurn) ? get(item)._furniture.color ? customizerColorHex(get(item)._furniture.color) : null : get(hasMods) ? customizerColorHex((_a2 = get(item).modifiers) == null ? void 0 : _a2.color) : null;
                  });
                  const modTooltip = user_derived(() => get(isFurn) ? "Edit furniture" : get(hasMods) ? modifierTooltip(get(item)) : "");
                  var span_47 = root_89();
                  let classes_27;
                  var node_57 = child(span_47);
                  {
                    var consequent_61 = ($$anchor8) => {
                      var span_48 = root_90();
                      let classes_28;
                      template_effect(() => {
                        classes_28 = set_class(span_48, 1, "pcr-atb2-chip-cap svelte-ibd6yj", null, classes_28, {
                          "pcr-atb2-chip-cap-filled": !!get(capColor) || get(isFurn),
                          "pcr-atb2-chip-cap-hollow": !get(capColor) && !get(isFurn)
                        });
                        set_style(span_48, get(capColor) ? `background:${get(capColor)}` : get(isFurn) ? "background:#7c3aed" : "");
                        set_attribute(span_48, "title", get(modTooltip));
                      });
                      delegated("click", span_48, (e) => {
                        e.stopPropagation();
                        if (get(isFurn)) openFurnitureCustomizerForExisting(get(item), get(subj).id, get(g).group_name);
                        else if (isCustomizableAppearance(get(catKey), get(g).group_name)) openFantasyCustomizerForExisting(get(subj).id, get(item));
                        else openCustomizerForExisting(get(subj).id, get(catKey), get(g).group_name, get(item));
                      });
                      append($$anchor8, span_48);
                    };
                    if_block(node_57, ($$render) => {
                      if (get(hasMods) || get(isFurn)) $$render(consequent_61);
                    });
                  }
                  var span_49 = sibling(node_57, 2);
                  var text_55 = child(span_49);
                  var button_14 = sibling(span_49, 2);
                  template_effect(
                    ($0) => {
                      classes_27 = set_class(span_47, 1, "pcr-atb2-chip pcr-atb2-chip-jumpable svelte-ibd6yj", null, classes_27, $0);
                      set_attribute(span_49, "title", `Jump to ${get(catDef).label} / ${get(g).display_name || get(g).group_name}`);
                      set_text(text_55, get(item).display_name || get(item).item_tag);
                    },
                    [
                      () => ({
                        "pcr-atb2-chip-customized": get(hasMods) || get(isFurn),
                        "pcr-atb2-chip-unprocessed": isItemUnprocessed(get(item))
                      })
                    ]
                  );
                  delegated("click", span_49, (e) => {
                    e.stopPropagation();
                    jumpToSlotChip(get(subj).id, get(catKey), get(g).group_name, get(item).item_tag);
                  });
                  delegated("click", button_14, (e) => {
                    e.stopPropagation();
                    clearSubjectChip(get(subj).id, get(catKey), get(g).group_name, get(item).item_tag);
                  });
                  append($$anchor7, span_47);
                });
                var node_58 = sibling(node_56, 2);
                {
                  var consequent_62 = ($$anchor7) => {
                    var span_50 = root_91();
                    delegated("click", span_50, (e) => {
                      e.stopPropagation();
                      jumpToSlot(get(subj).id, get(catKey), get(g).group_name);
                    });
                    append($$anchor7, span_50);
                  };
                  if_block(node_58, ($$render) => {
                    if (get(sel).length === 0 || get(isMulti)) $$render(consequent_62);
                  });
                }
                template_effect(() => set_text(text_54, `${(get(g).display_name || get(g).group_name) ?? ""} `));
                append($$anchor6, div_69);
              };
              if_block(node_54, ($$render) => {
                if (get(sel).length > 0 || get(isExpanded)) $$render(consequent_63);
              });
            }
            append($$anchor5, fragment_18);
          });
          template_effect(() => {
            classes_26 = set_class(div_66, 1, "pcr-atb2-subj-section-header svelte-ibd6yj", null, classes_26, { clickable: get(hasChev) });
            set_text(text_50, get(catDef).label);
          });
          delegated("click", div_66, (e) => {
            if (get(hasChev)) {
              e.stopPropagation();
              toggleSubjectSection(get(subj).id, get(catKey));
            }
          });
          append($$anchor4, div_65);
        };
        if_block(node_48, ($$render) => {
          var _a2, _b;
          if (get(catDef) && get(catDef).enabled && ((_b = (_a2 = get(bucketCache)[get(catDef).bucket]) == null ? void 0 : _a2.groups) == null ? void 0 : _b.length)) $$render(consequent_64);
        });
      }
      append($$anchor3, fragment_17);
    });
    var node_59 = sibling(node_47, 2);
    {
      var consequent_65 = ($$anchor3) => {
        var div_70 = root_92();
        var div_71 = sibling(child(div_70), 2);
        var span_51 = child(div_71);
        each(span_51, 23, () => get(subj).freeform, (tok, ti) => tok + "\0" + ti, ($$anchor4, tok) => {
          var span_52 = root_93();
          var text_56 = child(span_52);
          var button_15 = sibling(text_56);
          template_effect(() => set_text(text_56, `${get(tok) ?? ""} `));
          delegated("click", button_15, (e) => {
            e.stopPropagation();
            removeFreeform(get(subj).id, get(tok));
          });
          append($$anchor4, span_52);
        });
        append($$anchor3, div_70);
      };
      if_block(node_59, ($$render) => {
        if (get(subj).freeform && get(subj).freeform.length) $$render(consequent_65);
      });
    }
    var node_60 = sibling(node_59, 2);
    each(node_60, 16, () => ["outfit", "pose", "interaction", "scene"], index, ($$anchor3, sectionKey) => {
      const items = user_derived(() => {
        var _a2;
        return ((_a2 = get(subj).sectionFreeform) == null ? void 0 : _a2[sectionKey]) || [];
      });
      var fragment_19 = comment();
      var node_61 = first_child(fragment_19);
      {
        var consequent_66 = ($$anchor4) => {
          var div_72 = root_95();
          var div_73 = child(div_72);
          var span_53 = child(div_73);
          var text_57 = child(span_53);
          var div_74 = sibling(div_73, 2);
          var span_54 = child(div_74);
          each(span_54, 20, () => get(items), (tok) => tok, ($$anchor5, tok) => {
            var span_55 = root_96();
            var text_58 = child(span_55);
            var button_16 = sibling(text_58);
            template_effect(() => set_text(text_58, `${tok ?? ""} `));
            delegated("click", button_16, (e) => {
              e.stopPropagation();
              removeSectionFreeform(get(subj).id, sectionKey, tok);
            });
            append($$anchor5, span_55);
          });
          template_effect(() => set_text(text_57, `Unbound (${sectionKey ?? ""})`));
          append($$anchor4, div_72);
        };
        if_block(node_61, ($$render) => {
          if (get(items).length) $$render(consequent_66);
        });
      }
      append($$anchor3, fragment_19);
    });
    template_effect(() => {
      classes_25 = set_class(div_59, 1, "pcr-atb2-card2 pcr-atb2-subject-card svelte-ibd6yj", null, classes_25, { active: get(isActive) });
      set_style(div_59, `--subj-color:${get(typeDef).color ?? ""}`);
      set_value(input_1, get(subj).name);
      set_text(text_39, get(typeDef).label);
    });
    delegated("click", div_59, () => setActiveSubject(get(subj).id));
    delegated("input", input_1, (e) => renameSubject(get(subj).id, e.target.value));
    delegated("click", input_1, (e) => e.stopPropagation());
    delegated("click", button_5, (e) => {
      e.stopPropagation();
      deleteSubject(get(subj).id);
    });
    delegated("click", button_6, (e) => {
      e.stopPropagation();
      toggleIdentityPicker(get(subj).id, e.currentTarget);
    });
    delegated("click", button_8, (e) => {
      e.stopPropagation();
      togglePresetPicker("outfit", get(subj).id, e.currentTarget);
    });
    delegated("click", button_10, (e) => {
      e.stopPropagation();
      togglePresetPicker("pose", get(subj).id, e.currentTarget);
    });
    append($$anchor2, div_59);
  });
  var div_75 = sibling(node_35, 2);
  var node_62 = sibling(div_75, 2);
  {
    var consequent_72 = ($$anchor2) => {
      var div_76 = root_97();
      let classes_29;
      var div_77 = child(div_76);
      var button_17 = sibling(child(div_77), 6);
      var node_63 = sibling(div_77, 2);
      each(node_63, 17, () => get(sceneGroupsList), index, ($$anchor3, g) => {
        const sel = user_derived(() => get(sceneSelections)[get(g).group_name] || []);
        const isMulti = user_derived(() => MULTI_GROUPS.scene.has(get(g).group_name));
        var div_78 = root_98();
        var span_56 = child(div_78);
        var text_59 = child(span_56);
        var node_64 = sibling(text_59);
        {
          var consequent_67 = ($$anchor4) => {
            var span_57 = root_99();
            append($$anchor4, span_57);
          };
          if_block(node_64, ($$render) => {
            if (get(isMulti)) $$render(consequent_67);
          });
        }
        var span_58 = sibling(span_56, 2);
        var node_65 = child(span_58);
        each(node_65, 17, () => get(sel), (item) => item.item_tag, ($$anchor4, item) => {
          var span_59 = root_100();
          let classes_30;
          var text_60 = child(span_59);
          var button_18 = sibling(text_60);
          template_effect(
            ($0) => {
              classes_30 = set_class(span_59, 1, "pcr-atb2-chip pcr-atb2-chip-jumpable svelte-ibd6yj", null, classes_30, $0);
              set_attribute(span_59, "title", `Jump to Scene / ${(get(g).display_name || get(g).group_name) ?? ""}`);
              set_text(text_60, `${(get(item).display_name || get(item).item_tag) ?? ""} `);
            },
            [
              () => ({ "pcr-atb2-chip-unprocessed": isItemUnprocessed(get(item)) })
            ]
          );
          delegated("click", span_59, (e) => {
            e.stopPropagation();
            jumpToTag({
              category: "scene",
              group: get(g).group_name,
              itemTag: get(item).item_tag
            });
          });
          delegated("click", button_18, (e) => {
            e.stopPropagation();
            clearSceneChip(get(g).group_name, get(item).item_tag);
          });
          append($$anchor4, span_59);
        });
        var node_66 = sibling(node_65, 2);
        {
          var consequent_68 = ($$anchor4) => {
            var span_60 = root_101();
            delegated("click", span_60, () => {
              set(activeCategory, "scene");
              set(activeGroup, get(g).group_name, true);
            });
            append($$anchor4, span_60);
          };
          if_block(node_66, ($$render) => {
            if (get(sel).length === 0 || get(isMulti)) $$render(consequent_68);
          });
        }
        template_effect(() => set_text(text_59, `${(get(g).display_name || get(g).group_name) ?? ""} `));
        append($$anchor3, div_78);
      });
      var node_67 = sibling(node_63, 2);
      {
        var consequent_69 = ($$anchor3) => {
          var div_79 = root_102();
          var span_61 = sibling(child(div_79), 2);
          each(span_61, 23, () => get(sceneFreeform), (tok, ti) => tok + " " + ti, ($$anchor4, tok) => {
            var span_62 = root_103();
            var text_61 = child(span_62);
            var button_19 = sibling(text_61);
            template_effect(() => set_text(text_61, `${get(tok) ?? ""} `));
            delegated("click", button_19, (e) => {
              e.stopPropagation();
              removeSceneFreeform(get(tok));
            });
            append($$anchor4, span_62);
          });
          append($$anchor3, div_79);
        };
        if_block(node_67, ($$render) => {
          if (get(sceneFreeform).length) $$render(consequent_69);
        });
      }
      var node_68 = sibling(node_67, 2);
      each(node_68, 17, () => {
        var _a2;
        return ((_a2 = get(bucketCache).furniture) == null ? void 0 : _a2.groups) || [];
      }, index, ($$anchor3, fg) => {
        const fsel = user_derived(() => get(sceneSelections)[get(fg).group_name] || []);
        var fragment_20 = comment();
        var node_69 = first_child(fragment_20);
        {
          var consequent_71 = ($$anchor4) => {
            var div_80 = root_105();
            var span_63 = child(div_80);
            var text_62 = child(span_63);
            var span_64 = sibling(span_63, 2);
            each(span_64, 21, () => get(fsel), (item) => item.item_tag, ($$anchor5, item) => {
              const isCustomized = user_derived(() => isFurnitureChip(get(item)));
              var span_65 = root_106();
              let classes_31;
              var node_70 = child(span_65);
              {
                var consequent_70 = ($$anchor6) => {
                  const sceneCapColor = user_derived(() => get(item)._furniture.color ? customizerColorHex(get(item)._furniture.color) : null);
                  var span_66 = root_107();
                  template_effect(() => set_style(span_66, get(sceneCapColor) ? `background:${get(sceneCapColor)}` : "background:#7c3aed"));
                  delegated("click", span_66, (e) => {
                    e.stopPropagation();
                    openFurnitureCustomizerForExisting(get(item), null, get(fg).group_name);
                  });
                  append($$anchor6, span_66);
                };
                if_block(node_70, ($$render) => {
                  if (get(isCustomized)) $$render(consequent_70);
                });
              }
              var span_67 = sibling(node_70, 2);
              var text_63 = child(span_67);
              var button_20 = sibling(span_67, 2);
              template_effect(() => {
                classes_31 = set_class(span_65, 1, "pcr-atb2-chip svelte-ibd6yj", null, classes_31, { "pcr-atb2-chip-customized": get(isCustomized) });
                set_text(text_63, get(item).display_name || get(item).item_tag);
              });
              delegated("click", button_20, (e) => {
                e.stopPropagation();
                clearSceneChip(get(fg).group_name, get(item).item_tag);
              });
              append($$anchor5, span_65);
            });
            template_effect(() => set_text(text_62, `${(get(fg).icon || "📦") ?? ""} ${(get(fg).display_name || get(fg).group_name) ?? ""} `));
            append($$anchor4, div_80);
          };
          if_block(node_69, ($$render) => {
            if (get(fsel).length > 0) $$render(consequent_71);
          });
        }
        append($$anchor3, fragment_20);
      });
      template_effect(() => classes_29 = set_class(div_76, 1, "pcr-atb2-card2 pcr-atb2-scene-card svelte-ibd6yj", null, classes_29, { active: get(activeCategoryDef).scope === "global" }));
      delegated("click", button_17, deleteScene);
      append($$anchor2, div_76);
    };
    var alternate_9 = ($$anchor2) => {
      var div_81 = root_108();
      delegated("click", div_81, spawnScene);
      append($$anchor2, div_81);
    };
    if_block(node_62, ($$render) => {
      if (get(sceneSpawned)) $$render(consequent_72);
      else $$render(alternate_9, -1);
    });
  }
  var node_71 = sibling(node_62, 2);
  {
    var consequent_73 = ($$anchor2) => {
      var div_82 = root_109();
      var div_83 = child(div_82);
      var span_68 = sibling(child(div_83), 2);
      var text_64 = child(span_68);
      var button_21 = sibling(span_68, 4);
      var div_84 = sibling(div_83, 2);
      var span_69 = child(div_84);
      each(span_69, 20, () => get(activeStyle).tags, (tag) => tag, ($$anchor3, tag) => {
        var span_70 = root_110();
        var text_65 = child(span_70);
        template_effect(() => set_text(text_65, tag));
        append($$anchor3, span_70);
      });
      template_effect(() => set_text(text_64, get(activeStyle).name));
      delegated("click", span_68, (e) => {
        e.stopPropagation();
        jumpToTag({ category: "styles", itemTag: get(activeStyle).id });
      });
      delegated("click", button_21, deleteStyleCard);
      append($$anchor2, div_82);
    };
    var consequent_74 = ($$anchor2) => {
      var div_85 = root_111();
      delegated("click", div_85, () => {
        set(activeCategory, "styles");
        set(activeGroup, null);
      });
      append($$anchor2, div_85);
    };
    if_block(node_71, ($$render) => {
      var _a2;
      if (get(styleSpawned) && get(activeStyle)) $$render(consequent_73);
      else if ((_a2 = modelInfo()) == null ? void 0 : _a2.hash) $$render(consequent_74, 1);
    });
  }
  var div_86 = sibling(div_3, 2);
  var div_87 = child(div_86);
  var div_88 = child(div_87);
  let classes_32;
  var div_89 = sibling(div_88, 2);
  let classes_33;
  var button_22 = sibling(div_87, 4);
  var button_23 = sibling(button_22, 2);
  var text_66 = child(button_23);
  var node_72 = sibling(div_86, 2);
  {
    var consequent_75 = ($$anchor2) => {
      const curStatus = user_derived(() => get(chipQaMenu).item.natlang_status ?? "unprocessed");
      const tagOutput = user_derived(() => get(chipQaMenu).item.base_tags || get(chipQaMenu).item.item_tag);
      const natlangOutput = user_derived(() => get(chipQaMenu).item.base_natlang || "");
      var fragment_21 = root_112();
      var div_90 = first_child(fragment_21);
      var div_91 = sibling(div_90, 2);
      var div_92 = child(div_91);
      var text_67 = child(div_92);
      var div_93 = sibling(div_92, 2);
      var div_94 = child(div_93);
      var div_95 = sibling(child(div_94), 2);
      var text_68 = child(div_95);
      var div_96 = sibling(div_94, 2);
      var div_97 = sibling(child(div_96), 2);
      var text_69 = child(div_97);
      var div_98 = sibling(div_93, 2);
      var button_24 = child(div_98);
      let classes_34;
      var button_25 = sibling(button_24, 2);
      let classes_35;
      var button_26 = sibling(button_25, 2);
      let classes_36;
      template_effect(() => {
        set_style(div_91, `left:${get(chipQaMenu).x ?? ""}px;top:${get(chipQaMenu).y ?? ""}px`);
        set_text(text_67, get(chipQaMenu).item.display_name || get(chipQaMenu).item.item_tag);
        set_text(text_68, get(tagOutput));
        set_text(text_69, get(natlangOutput) || "(empty)");
        classes_34 = set_class(button_24, 1, "pcr-atb2-qa-menu-item svelte-ibd6yj", null, classes_34, { current: get(curStatus) === "normalized" });
        classes_35 = set_class(button_25, 1, "pcr-atb2-qa-menu-item svelte-ibd6yj", null, classes_35, { current: get(curStatus) === "unprocessed" });
        classes_36 = set_class(button_26, 1, "pcr-atb2-qa-menu-item svelte-ibd6yj", null, classes_36, { current: get(curStatus) === "broken" });
      });
      delegated("click", div_90, closeChipQaMenu);
      delegated("contextmenu", div_90, (e) => {
        e.preventDefault();
        closeChipQaMenu();
      });
      delegated("click", button_24, () => setChipNatlangStatus(get(chipQaMenu).bucket, get(chipQaMenu).item, "normalized"));
      delegated("click", button_25, () => setChipNatlangStatus(get(chipQaMenu).bucket, get(chipQaMenu).item, "unprocessed"));
      delegated("click", button_26, () => setChipNatlangStatus(get(chipQaMenu).bucket, get(chipQaMenu).item, "broken"));
      append($$anchor2, fragment_21);
    };
    if_block(node_72, ($$render) => {
      if (get(chipQaMenu)) $$render(consequent_75);
    });
  }
  var node_73 = sibling(div, 2);
  {
    var consequent_79 = ($$anchor2) => {
      var div_99 = root_113();
      var input_2 = child(div_99);
      bind_this(input_2, ($$value) => identityPickerSearchEl = $$value, () => identityPickerSearchEl);
      var div_100 = sibling(input_2, 2);
      var node_74 = child(div_100);
      {
        var consequent_76 = ($$anchor3) => {
          var div_101 = root_114();
          append($$anchor3, div_101);
        };
        var consequent_77 = ($$anchor3) => {
          var div_102 = root_115();
          append($$anchor3, div_102);
        };
        var alternate_11 = ($$anchor3) => {
          var fragment_22 = comment();
          var node_75 = first_child(fragment_22);
          each(node_75, 17, () => get(identityResults), (opt) => opt.kind + ":" + opt.tag, ($$anchor4, opt) => {
            var div_103 = root_117();
            var span_71 = child(div_103);
            var text_70 = child(span_71);
            var span_72 = sibling(span_71, 2);
            var node_76 = child(span_72);
            {
              var consequent_78 = ($$anchor5) => {
                var text_71 = text();
                template_effect(() => set_text(text_71, get(opt).series));
                append($$anchor5, text_71);
              };
              var alternate_10 = ($$anchor5) => {
                var text_72 = text();
                template_effect(() => set_text(text_72, get(opt).kindLabel));
                append($$anchor5, text_72);
              };
              if_block(node_76, ($$render) => {
                if (get(opt).kind === "character" && get(opt).series) $$render(consequent_78);
                else $$render(alternate_10, -1);
              });
            }
            template_effect(() => set_text(text_70, get(opt).display));
            delegated("click", div_103, () => pickIdentityFromDropdown(get(opt)));
            append($$anchor4, div_103);
          });
          append($$anchor3, fragment_22);
        };
        if_block(node_74, ($$render) => {
          if (get(identityCharLoading) && get(identityResults).length === 0) $$render(consequent_76);
          else if (get(identityResults).length === 0) $$render(consequent_77, 1);
          else $$render(alternate_11, -1);
        });
      }
      template_effect(() => set_style(div_99, `left:${get(identityPickerRect).left ?? ""}px; top:${get(identityPickerRect).top ?? ""}px; width:${get(identityPickerRect).width ?? ""}px;`));
      delegated("click", div_99, (e) => e.stopPropagation());
      bind_value(input_2, () => get(identityPickerQuery), ($$value) => set(identityPickerQuery, $$value));
      append($$anchor2, div_99);
    };
    if_block(node_73, ($$render) => {
      if (get(identityPickerOpen)) $$render(consequent_79);
    });
  }
  var node_77 = sibling(node_73, 2);
  {
    var consequent_83 = ($$anchor2) => {
      const subj = user_derived(() => get(subjects).find((s) => s.id === get(presetPickerOpen).subjId));
      const boundTag = user_derived(() => {
        var _a2, _b;
        return (_b = (_a2 = get(subj)) == null ? void 0 : _a2.character) == null ? void 0 : _b.tag;
      });
      var div_104 = root_120();
      var input_3 = child(div_104);
      bind_this(input_3, ($$value) => presetPickerSearchEl = $$value, () => presetPickerSearchEl);
      var div_105 = sibling(input_3, 2);
      var node_78 = child(div_105);
      {
        var consequent_80 = ($$anchor3) => {
          var div_106 = root_121();
          append($$anchor3, div_106);
        };
        var consequent_81 = ($$anchor3) => {
          var div_107 = root_122();
          append($$anchor3, div_107);
        };
        var alternate_12 = ($$anchor3) => {
          var fragment_25 = comment();
          var node_79 = first_child(fragment_25);
          each(node_79, 17, () => get(presetPickerResults), (row) => row.id, ($$anchor4, row) => {
            const isCanonical = user_derived(() => get(row).character_tag === get(boundTag));
            const presetName = user_derived(() => get(presetPickerOpen).kind === "outfit" ? get(row).outfit_name : get(row).pose_name);
            var div_108 = root_124();
            let classes_37;
            var node_80 = child(div_108);
            {
              var consequent_82 = ($$anchor5) => {
                var span_73 = root_125();
                append($$anchor5, span_73);
              };
              if_block(node_80, ($$render) => {
                if (get(isCanonical)) $$render(consequent_82);
              });
            }
            var span_74 = sibling(node_80, 2);
            var text_73 = child(span_74);
            var span_75 = sibling(span_74, 2);
            var text_74 = child(span_75);
            template_effect(() => {
              classes_37 = set_class(div_108, 1, "pcr-atb2-preset-dd-row svelte-ibd6yj", null, classes_37, { canonical: get(isCanonical) });
              set_text(text_73, get(presetName));
              set_text(text_74, `${get(row).character_display ?? ""}${get(row).character_series ? ` · ${get(row).character_series}` : ""}`);
            });
            delegated("click", div_108, () => pickPresetFromDropdown(get(row)));
            append($$anchor4, div_108);
          });
          append($$anchor3, fragment_25);
        };
        if_block(node_78, ($$render) => {
          if (get(presetPickerLoading) && get(presetPickerResults).length === 0) $$render(consequent_80);
          else if (get(presetPickerResults).length === 0) $$render(consequent_81, 1);
          else $$render(alternate_12, -1);
        });
      }
      template_effect(() => {
        set_style(div_104, `left:${get(presetPickerRect).left ?? ""}px; top:${get(presetPickerRect).top ?? ""}px; width:${get(presetPickerRect).width ?? ""}px;`);
        set_attribute(input_3, "placeholder", get(presetPickerOpen).kind === "outfit" ? "Search outfits…" : "Search poses…");
      });
      delegated("click", div_104, (e) => e.stopPropagation());
      bind_value(input_3, () => get(presetPickerQuery), ($$value) => set(presetPickerQuery, $$value));
      append($$anchor2, div_104);
    };
    if_block(node_77, ($$render) => {
      if (get(presetPickerOpen)) $$render(consequent_83);
    });
  }
  var node_81 = sibling(node_77, 2);
  {
    var consequent_84 = ($$anchor2) => {
      const subj = user_derived(() => get(subjects).find((s) => s.id === get(modifierPickerOpen)));
      var div_109 = root_126();
      var div_110 = child(div_109);
      each(div_110, 20, () => MODIFIER_OPTIONS, (opt) => opt, ($$anchor3, opt) => {
        const isOn = user_derived(() => {
          var _a2, _b;
          return !!((_b = (_a2 = get(subj)) == null ? void 0 : _a2.modifiers) == null ? void 0 : _b.includes(opt));
        });
        var div_111 = root_127();
        let classes_38;
        var span_76 = child(div_111);
        var text_75 = child(span_76);
        var span_77 = sibling(span_76, 2);
        var text_76 = child(span_77);
        template_effect(() => {
          classes_38 = set_class(div_111, 1, "pcr-atb2-modifier-dd-row svelte-ibd6yj", null, classes_38, { on: get(isOn) });
          set_text(text_75, get(isOn) ? "✓" : "");
          set_text(text_76, opt);
        });
        delegated("click", div_111, () => {
          toggleModifier(get(modifierPickerOpen), opt);
          closeModifierPicker();
        });
        append($$anchor3, div_111);
      });
      template_effect(() => set_style(div_109, `left:${get(modifierPickerRect).left ?? ""}px; top:${get(modifierPickerRect).top ?? ""}px; width:${get(modifierPickerRect).width ?? ""}px;`));
      delegated("click", div_109, (e) => e.stopPropagation());
      append($$anchor2, div_109);
    };
    if_block(node_81, ($$render) => {
      if (get(modifierPickerOpen)) $$render(consequent_84);
    });
  }
  var node_82 = sibling(node_81, 2);
  {
    var consequent_85 = ($$anchor2) => {
      var div_112 = root_128();
      var div_113 = child(div_112);
      var div_114 = sibling(child(div_113), 2);
      var strong_1 = sibling(child(div_114));
      var text_77 = child(strong_1);
      var strong_2 = sibling(strong_1, 2);
      var text_78 = child(strong_2);
      var div_115 = sibling(strong_2, 2);
      var text_79 = child(div_115);
      var div_116 = sibling(div_114, 2);
      var button_27 = child(div_116);
      var button_28 = sibling(button_27, 2);
      template_effect(() => {
        set_text(text_77, get(pendingIdentitySwap).current.display);
        set_text(text_78, get(pendingIdentitySwap).next.display);
        set_text(text_79, `Identity-derived tags from ${get(pendingIdentitySwap).current.display ?? ""} will be removed and replaced.`);
      });
      delegated("click", div_112, cancelIdentitySwap);
      delegated("click", div_113, (e) => e.stopPropagation());
      delegated("click", button_27, cancelIdentitySwap);
      delegated("click", button_28, confirmIdentitySwap);
      append($$anchor2, div_112);
    };
    if_block(node_82, ($$render) => {
      if (get(pendingIdentitySwap)) $$render(consequent_85);
    });
  }
  var node_83 = sibling(node_82, 2);
  {
    var consequent_86 = ($$anchor2) => {
      Customizer($$anchor2, {
        get item() {
          return get(customizerOpen).item;
        },
        get initial() {
          return get(customizerOpen).initial;
        },
        get isNaturalMode() {
          return get(isNaturalMode);
        },
        onConfirm: commitCustomizer,
        onCancel: cancelCustomizer
      });
    };
    if_block(node_83, ($$render) => {
      if (get(customizerOpen)) $$render(consequent_86);
    });
  }
  var node_84 = sibling(node_83, 2);
  {
    var consequent_87 = ($$anchor2) => {
      {
        let $0 = user_derived(() => get(bucketCache).furniture.mods.actionOverrides || {});
        let $1 = user_derived(() => get(furnitureCustomizerOpen).subjId ? get(subjects).find((s) => s.id === get(furnitureCustomizerOpen).subjId) : null);
        FurnitureCustomizer($$anchor2, {
          get item() {
            return get(furnitureCustomizerOpen).item;
          },
          get materials() {
            return get(bucketCache).furniture.mods.materials;
          },
          get patterns() {
            return get(bucketCache).furniture.mods.patterns;
          },
          get colors() {
            return get(bucketCache).furniture.mods.colors;
          },
          get actions() {
            return get(furnitureActions);
          },
          get actionOverrides() {
            return get($0);
          },
          get contextSubject() {
            return get($1);
          },
          get initial() {
            return get(furnitureCustomizerOpen).initial;
          },
          get isNaturalMode() {
            return get(isNaturalMode);
          },
          onConfirm: commitFurnitureCustomizer,
          onCancel: cancelFurnitureCustomizer
        });
      }
    };
    if_block(node_84, ($$render) => {
      var _a2;
      if (get(furnitureCustomizerOpen) && ((_a2 = get(bucketCache).furniture) == null ? void 0 : _a2.mods)) $$render(consequent_87);
    });
  }
  var node_85 = sibling(node_84, 2);
  {
    var consequent_88 = ($$anchor2) => {
      FantasyCustomizer($$anchor2, {
        get item() {
          return get(fantasyCustomizerOpen).item;
        },
        get data() {
          return get(fantasyModData);
        },
        get initial() {
          return get(fantasyCustomizerOpen).initial;
        },
        get isNaturalMode() {
          return get(isNaturalMode);
        },
        onConfirm: commitFantasyCustomizer,
        onCancel: cancelFantasyCustomizer
      });
    };
    if_block(node_85, ($$render) => {
      if (get(fantasyCustomizerOpen)) $$render(consequent_88);
    });
  }
  template_effect(() => {
    classes = set_class(div, 1, "pcr-atb-panel pcr-atb2 svelte-ibd6yj", null, classes, { "pcr-atb-maximized": get(maximized) });
    set_attribute(input, "placeholder", get(searchPlaceholder));
    set_attribute(button, "aria-label", get(maximized) ? "Restore" : "Maximize");
    set_attribute(button, "title", get(maximized) ? "Restore" : "Maximize");
    set_text(text_1, get(maximized) ? "❐" : "▢");
    set_style(main, `--pcr-atb2-card-min: ${get(cardMinPx) ?? ""}px`);
    classes_10 = set_class(span_19, 1, "pcr-atb2-bc-target svelte-ibd6yj", null, classes_10, { rebind: get(routingTarget).type === "rebind" });
    set_text(text_19, get(routingTarget).label);
    classes_32 = set_class(div_88, 1, "pcr-atb2-mode-option svelte-ibd6yj", null, classes_32, { active: !get(isNaturalMode) });
    set_attribute(div_88, "aria-checked", !get(isNaturalMode));
    classes_33 = set_class(div_89, 1, "pcr-atb2-mode-option svelte-ibd6yj", null, classes_33, { active: get(isNaturalMode) });
    set_attribute(div_89, "aria-checked", get(isNaturalMode));
    button_23.disabled = get(totalSelectionCount) === 0;
    set_text(text_66, `Insert${get(totalSelectionCount) > 0 ? ` (${get(totalSelectionCount)})` : ""}`);
  });
  bind_value(input, () => get(searchQuery), ($$value) => set(searchQuery, $$value));
  delegated("click", button, toggleMaximized);
  delegated("click", button_1, function(...$$args) {
    var _a2;
    (_a2 = onClose()) == null ? void 0 : _a2.apply(this, $$args);
  });
  delegated("click", div_75, () => spawnSubject("person"));
  delegated("click", div_88, () => setMode(false));
  delegated("click", div_89, () => setMode(true));
  delegated("click", button_22, function(...$$args) {
    var _a2;
    (_a2 = onClose()) == null ? void 0 : _a2.apply(this, $$args);
  });
  delegated("click", button_23, handleInsert);
  append($$anchor, fragment);
  pop();
}
delegate(["click", "contextmenu", "input"]);
function mountTagBuilder2(target, props) {
  return mount(TagBuilder2, { target, props });
}
function destroyTagBuilder2(instance) {
  if (instance) unmount(instance);
}
export {
  destroyTagBuilder2,
  mountTagBuilder2
};
//# sourceMappingURL=promptchain-tag-builder2.js.map
