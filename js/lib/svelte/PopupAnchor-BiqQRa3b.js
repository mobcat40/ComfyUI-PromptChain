import { t as template_effect, T as active_effect, U as assign_nodes, V as get_first_child, W as remove_effect_dom, X as create_element, Y as NAMESPACE_SVG, Z as NAMESPACE_MATHML, b as block, _ as EFFECT_TRANSPARENT, B as BranchManager, c as proxy, d as delegate, p as push, a as prop, u as user_effect, o as bind_this, j as delegated, k as append, l as pop, A as from_html, n as child } from "./disclose-version-CPcS7M7Y.js";
import { a as onMount, o as onDestroy } from "./index-client-DMSJyFwf.js";
function html(node, get_value, is_controlled = false, svg = false, mathml = false, skip_warning = false) {
  var anchor = node;
  var value = "";
  if (is_controlled) {
    var parent_node = (
      /** @type {Element} */
      node
    );
  }
  template_effect(() => {
    var effect = (
      /** @type {Effect} */
      active_effect
    );
    if (value === (value = get_value() ?? "")) {
      return;
    }
    if (is_controlled && true) {
      effect.nodes = null;
      parent_node.innerHTML = /** @type {string} */
      value;
      if (value !== "") {
        assign_nodes(
          /** @type {TemplateNode} */
          get_first_child(parent_node),
          /** @type {TemplateNode} */
          parent_node.lastChild
        );
      }
      return;
    }
    if (effect.nodes !== null) {
      remove_effect_dom(
        effect.nodes.start,
        /** @type {TemplateNode} */
        effect.nodes.end
      );
      effect.nodes = null;
    }
    if (value === "") return;
    var ns = svg ? NAMESPACE_SVG : mathml ? NAMESPACE_MATHML : void 0;
    var wrapper = (
      /** @type {HTMLTemplateElement | SVGElement | MathMLElement} */
      create_element(svg ? "svg" : mathml ? "math" : "template", ns)
    );
    wrapper.innerHTML = /** @type {any} */
    value;
    var node2 = svg || mathml ? wrapper : (
      /** @type {HTMLTemplateElement} */
      wrapper.content
    );
    assign_nodes(
      /** @type {TemplateNode} */
      get_first_child(node2),
      /** @type {TemplateNode} */
      node2.lastChild
    );
    if (svg || mathml) {
      while (get_first_child(node2)) {
        anchor.before(
          /** @type {TemplateNode} */
          get_first_child(node2)
        );
      }
    } else {
      anchor.before(node2);
    }
  });
}
function snippet(node, get_snippet, ...args) {
  var branches = new BranchManager(node);
  block(() => {
    const snippet2 = get_snippet() ?? null;
    branches.ensure(snippet2, snippet2 && ((anchor) => snippet2(anchor, ...args)));
  }, EFFECT_TRANSPARENT);
}
const popup = proxy({ activeKey: null, close: null });
function closeActivePopup() {
  var _a;
  (_a = popup.close) == null ? void 0 : _a.call(popup);
  popup.activeKey = null;
  popup.close = null;
}
function openPopupState(key, closeFn) {
  closeActivePopup();
  popup.activeKey = key;
  popup.close = closeFn;
}
proxy({ running: false, total: 0, done: 0 });
var root = from_html(`<div class="pcr-mode-menu" style="position:fixed;z-index:100000;"><!></div>`);
function PopupAnchor($$anchor, $$props) {
  push($$props, true);
  let triggerRect = prop($$props, "triggerRect", 3, null), popupKey = prop($$props, "popupKey", 3, ""), triggerEl = prop($$props, "triggerEl", 3, null), onClose = prop($$props, "onClose", 3, () => {
  });
  let menuEl;
  let openedAt = 0;
  function close() {
    onClose()();
  }
  function dismiss(e) {
    var _a;
    if (Date.now() - openedAt < 300) return;
    if (menuEl == null ? void 0 : menuEl.contains(e.target)) return;
    if ((_a = triggerEl()) == null ? void 0 : _a.contains(e.target)) return;
    close();
  }
  function reposition() {
    if (!menuEl || !triggerRect()) return;
    requestAnimationFrame(() => {
      if (!menuEl) return;
      const menuRect = menuEl.getBoundingClientRect();
      let left = triggerRect().left;
      let top = triggerRect().bottom + 4;
      if (left + menuRect.width > window.innerWidth) left = window.innerWidth - menuRect.width - 10;
      if (top + menuRect.height > window.innerHeight) top = triggerRect().top - menuRect.height - 4;
      if (left < 10) left = 10;
      if (top < 10) top = 10;
      menuEl.style.left = `${left}px`;
      menuEl.style.top = `${top}px`;
    });
  }
  onMount(() => {
    document.body.appendChild(menuEl);
    openedAt = Date.now();
    openPopupState(popupKey(), close);
    document.addEventListener("click", dismiss, true);
    document.addEventListener("pointerdown", dismiss, true);
    reposition();
  });
  onDestroy(() => {
    document.removeEventListener("click", dismiss, true);
    document.removeEventListener("pointerdown", dismiss, true);
    if ((menuEl == null ? void 0 : menuEl.parentNode) === document.body) menuEl.remove();
    if (popup.activeKey === popupKey()) {
      popup.activeKey = null;
      popup.close = null;
    }
  });
  user_effect(() => {
    if (triggerRect()) reposition();
  });
  var div = root();
  var node = child(div);
  snippet(node, () => $$props.children);
  bind_this(div, ($$value) => menuEl = $$value, () => menuEl);
  delegated("click", div, (e) => e.stopPropagation());
  delegated("pointerdown", div, (e) => e.stopPropagation());
  append($$anchor, div);
  pop();
}
delegate(["click", "pointerdown"]);
export {
  PopupAnchor as P,
  html as h
};
//# sourceMappingURL=PopupAnchor-BiqQRa3b.js.map
