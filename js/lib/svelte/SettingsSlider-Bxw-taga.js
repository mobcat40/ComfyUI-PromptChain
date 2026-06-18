import { d as delegate, p as push, a as prop, s as state, c as proxy, u as user_effect, e as set, i as if_block, g as get, f as sibling, t as template_effect, x as set_attribute, q as set_value, j as delegated, k as append, l as pop, m as user_derived, n as child, o as bind_this, w as each, h as set_class, y as set_text, z as index, A as from_html } from "./disclose-version-BjTnIIw0.js";
import { s as set_style } from "./style-CbOHK2KU.js";
var root_2 = from_html(`<div class="pcr-slider-zone svelte-nuvs0d"></div>`);
var root_3 = from_html(`<div class="pcr-slider-marker svelte-nuvs0d"></div>`);
var root_4 = from_html(`<div><span class="pcr-slider-tick-label svelte-nuvs0d"> </span></div>`);
var root_1 = from_html(`<div class="pcr-slider-track-wrapper svelte-nuvs0d"><div class="pcr-slider-track svelte-nuvs0d"><!> <!> <div class="pcr-slider-fill svelte-nuvs0d"></div> <div></div></div> <div class="pcr-slider-ticks svelte-nuvs0d"></div></div>`);
var root_6 = from_html(`<div class="pcr-slider-zone svelte-nuvs0d"></div>`);
var root_7 = from_html(`<div class="pcr-slider-marker svelte-nuvs0d"></div>`);
var root_5 = from_html(`<div class="pcr-slider-track svelte-nuvs0d"><!> <!> <div class="pcr-slider-fill svelte-nuvs0d"></div> <div></div></div>`);
var root = from_html(`<div class="pcr-slider-container svelte-nuvs0d"><!> <input type="number" class="pcr-slider-input svelte-nuvs0d"/></div>`);
function SettingsSlider($$anchor, $$props) {
  push($$props, true);
  let savedValue = prop($$props, "savedValue", 3, void 0), rangeMin = prop($$props, "rangeMin", 3, void 0), rangeMax = prop($$props, "rangeMax", 3, void 0), userSaved = prop($$props, "userSaved", 3, false), ticks = prop($$props, "ticks", 3, null), rail = prop(
    $$props,
    "rail",
    3,
    void 0
    // optional CSS background for the track (e.g. temp gradient)
  ), onChange = prop($$props, "onChange", 3, () => {
  });
  let currentVal = state(proxy($$props.value));
  let dragging = state(false);
  let trackEl;
  user_effect(() => {
    set(currentVal, $$props.value, true);
  });
  const hasSaved = user_derived(() => savedValue() !== void 0);
  const hasRange = user_derived(() => rangeMin() !== void 0 && rangeMax() !== void 0);
  const hasTicks = user_derived(() => Array.isArray(ticks()) && ticks().length > 0);
  function toPercent(val) {
    return Math.max(0, Math.min(100, (val - $$props.min) / ($$props.max - $$props.min) * 100));
  }
  function snapToStep(val) {
    return Math.round((val - $$props.min) / $$props.step) * $$props.step + $$props.min;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function formatVal(v) {
    if ($$props.step >= 1) return String(v);
    const decimals = Math.max(0, Math.min(6, Math.ceil(-Math.log10($$props.step))));
    return v.toFixed(decimals);
  }
  let fillPct = user_derived(() => toPercent(get(currentVal)));
  let thumbColor = user_derived(() => {
    const atSaved = get(hasSaved) && Math.abs(get(currentVal) - savedValue()) < ($$props.step || 1e-3) * 0.5;
    const inRange = get(hasRange) && get(currentVal) >= rangeMin() && get(currentVal) <= rangeMax();
    return atSaved ? "green" : inRange ? "blue" : "gray";
  });
  let inputColor = user_derived(() => get(thumbColor) === "green" ? "#5ed357" : get(thumbColor) === "blue" ? "#5dcaff" : "");
  function setValue(v) {
    v = snapToStep(clamp(v, $$props.min, $$props.max));
    if (v === get(currentVal)) return;
    set(currentVal, v, true);
    onChange()(v);
  }
  function posToValue(clientX) {
    const rect = trackEl.getBoundingClientRect();
    const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
    return snapToStep($$props.min + pct * ($$props.max - $$props.min));
  }
  function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    set(dragging, true);
    trackEl.setPointerCapture(e.pointerId);
    setValue(posToValue(e.clientX));
  }
  function onPointerMove(e) {
    if (get(dragging)) setValue(posToValue(e.clientX));
  }
  function onPointerUp() {
    set(dragging, false);
  }
  function onTickClick(tickValue, e) {
    e.stopPropagation();
    e.preventDefault();
    setValue(snapToStep(tickValue));
  }
  function onInputChange(e) {
    setValue(parseFloat(e.target.value) || $$props.min);
  }
  function onInputKeydown(e) {
    if (e.key === "Escape") {
      e.target.value = formatVal(get(currentVal));
      e.target.blur();
    }
  }
  var div = root();
  var node = child(div);
  {
    var consequent_2 = ($$anchor2) => {
      var div_1 = root_1();
      var div_2 = child(div_1);
      let styles;
      var node_1 = child(div_2);
      {
        var consequent = ($$anchor3) => {
          var div_3 = root_2();
          let styles_1;
          template_effect(($0) => styles_1 = set_style(div_3, "", styles_1, $0), [
            () => ({
              left: `${toPercent(rangeMin()) ?? ""}%`,
              width: `${toPercent(rangeMax()) - toPercent(rangeMin())}%`
            })
          ]);
          append($$anchor3, div_3);
        };
        if_block(node_1, ($$render) => {
          if (get(hasRange)) $$render(consequent);
        });
      }
      var node_2 = sibling(node_1, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var div_4 = root_3();
          let styles_2;
          template_effect(
            ($0) => {
              set_attribute(div_4, "title", `${userSaved() ? "Saved" : "Default"}: ${savedValue() ?? ""}`);
              styles_2 = set_style(div_4, "", styles_2, $0);
            },
            [
              () => ({
                left: `clamp(7px, ${toPercent(savedValue()) ?? ""}%, calc(100% - 7px))`
              })
            ]
          );
          append($$anchor3, div_4);
        };
        if_block(node_2, ($$render) => {
          if (get(hasSaved)) $$render(consequent_1);
        });
      }
      var div_5 = sibling(node_2, 2);
      let styles_3;
      var div_6 = sibling(div_5, 2);
      let classes;
      let styles_4;
      bind_this(div_2, ($$value) => trackEl = $$value, () => trackEl);
      var div_7 = sibling(div_2, 2);
      each(div_7, 21, ticks, index, ($$anchor3, tick) => {
        var div_8 = root_4();
        let classes_1;
        let styles_5;
        var span = child(div_8);
        var text = child(span);
        template_effect(
          ($0, $1) => {
            classes_1 = set_class(div_8, 1, "pcr-slider-tick svelte-nuvs0d", null, classes_1, $0);
            styles_5 = set_style(div_8, "", styles_5, $1);
            set_text(text, get(tick).label);
          },
          [
            () => ({
              "pcr-tick-active": Math.abs(get(tick).value - get(currentVal)) < $$props.step * 1.5
            }),
            () => ({ left: `${toPercent(get(tick).value) ?? ""}%` })
          ]
        );
        delegated("pointerdown", div_8, (e) => onTickClick(get(tick).value, e));
        append($$anchor3, div_8);
      });
      template_effect(() => {
        styles = set_style(div_2, "", styles, { background: rail() });
        styles_3 = set_style(div_5, "", styles_3, { width: `${get(fillPct) ?? ""}%` });
        classes = set_class(div_6, 1, `pcr-slider-thumb pcr-thumb-${get(thumbColor) ?? ""}`, "svelte-nuvs0d", classes, { "pcr-thumb-dragging": get(dragging) });
        styles_4 = set_style(div_6, "", styles_4, {
          left: `clamp(7px, ${get(fillPct) ?? ""}%, calc(100% - 7px))`
        });
      });
      delegated("pointerdown", div_2, onPointerDown);
      delegated("pointermove", div_2, onPointerMove);
      delegated("pointerup", div_2, onPointerUp);
      append($$anchor2, div_1);
    };
    var alternate = ($$anchor2) => {
      var div_9 = root_5();
      let styles_6;
      var node_3 = child(div_9);
      {
        var consequent_3 = ($$anchor3) => {
          var div_10 = root_6();
          let styles_7;
          template_effect(($0) => styles_7 = set_style(div_10, "", styles_7, $0), [
            () => ({
              left: `${toPercent(rangeMin()) ?? ""}%`,
              width: `${toPercent(rangeMax()) - toPercent(rangeMin())}%`
            })
          ]);
          append($$anchor3, div_10);
        };
        if_block(node_3, ($$render) => {
          if (get(hasRange)) $$render(consequent_3);
        });
      }
      var node_4 = sibling(node_3, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var div_11 = root_7();
          let styles_8;
          template_effect(
            ($0) => {
              set_attribute(div_11, "title", `${userSaved() ? "Saved" : "Default"}: ${savedValue() ?? ""}`);
              styles_8 = set_style(div_11, "", styles_8, $0);
            },
            [
              () => ({
                left: `clamp(7px, ${toPercent(savedValue()) ?? ""}%, calc(100% - 7px))`
              })
            ]
          );
          append($$anchor3, div_11);
        };
        if_block(node_4, ($$render) => {
          if (get(hasSaved)) $$render(consequent_4);
        });
      }
      var div_12 = sibling(node_4, 2);
      let styles_9;
      var div_13 = sibling(div_12, 2);
      let classes_2;
      let styles_10;
      bind_this(div_9, ($$value) => trackEl = $$value, () => trackEl);
      template_effect(() => {
        styles_6 = set_style(div_9, "", styles_6, { background: rail() });
        styles_9 = set_style(div_12, "", styles_9, { width: `${get(fillPct) ?? ""}%` });
        classes_2 = set_class(div_13, 1, `pcr-slider-thumb pcr-thumb-${get(thumbColor) ?? ""}`, "svelte-nuvs0d", classes_2, { "pcr-thumb-dragging": get(dragging) });
        styles_10 = set_style(div_13, "", styles_10, {
          left: `clamp(7px, ${get(fillPct) ?? ""}%, calc(100% - 7px))`
        });
      });
      delegated("pointerdown", div_9, onPointerDown);
      delegated("pointermove", div_9, onPointerMove);
      delegated("pointerup", div_9, onPointerUp);
      append($$anchor2, div_9);
    };
    if_block(node, ($$render) => {
      if (get(hasTicks)) $$render(consequent_2);
      else $$render(alternate, -1);
    });
  }
  var input = sibling(node, 2);
  let styles_11;
  template_effect(
    ($0) => {
      set_attribute(input, "min", $$props.min);
      set_attribute(input, "max", $$props.max);
      set_attribute(input, "step", $$props.step);
      set_value(input, $0);
      styles_11 = set_style(input, "", styles_11, { color: get(inputColor) });
    },
    [() => formatVal(get(currentVal))]
  );
  delegated("change", input, onInputChange);
  delegated("keydown", input, onInputKeydown);
  append($$anchor, div);
  pop();
}
delegate([
  "pointerdown",
  "pointermove",
  "pointerup",
  "change",
  "keydown"
]);
export {
  SettingsSlider as S
};
//# sourceMappingURL=SettingsSlider-Bxw-taga.js.map
