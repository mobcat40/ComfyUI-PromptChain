import { ac as to_style } from "./disclose-version-uq4tn5Y6.js";
function update_styles(dom, prev = {}, next, priority) {
  for (var key in next) {
    var value = next[key];
    if (prev[key] !== value) {
      if (next[key] == null) {
        dom.style.removeProperty(key);
      } else {
        dom.style.setProperty(key, value, priority);
      }
    }
  }
}
function set_style(dom, value, prev_styles, next_styles) {
  var prev = dom.__style;
  if (prev !== value) {
    var next_style_attr = to_style(value, next_styles);
    {
      if (next_style_attr == null) {
        dom.removeAttribute("style");
      } else {
        dom.style.cssText = next_style_attr;
      }
    }
    dom.__style = value;
  } else if (next_styles) {
    if (Array.isArray(next_styles)) {
      update_styles(dom, prev_styles == null ? void 0 : prev_styles[0], next_styles[0]);
      update_styles(dom, prev_styles == null ? void 0 : prev_styles[1], next_styles[1], "important");
    } else {
      update_styles(dom, prev_styles, next_styles);
    }
  }
  return next_styles;
}
export {
  set_style as s
};
//# sourceMappingURL=style-Boi27oOu.js.map
