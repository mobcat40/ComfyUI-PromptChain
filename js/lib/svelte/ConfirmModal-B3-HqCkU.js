import { d as delegate, p as push, a as prop, u as user_effect, D as comment, v as first_child, i as if_block, k as append, l as pop, g as get, s as state, f as sibling, o as bind_this, e as set, t as template_effect, y as set_text, j as delegated, A as from_html, n as child } from "./disclose-version-CPcS7M7Y.js";
import { a as action } from "./actions-DQdCj5pi.js";
function portal(node) {
  document.body.appendChild(node);
  return { destroy() {
    var _a;
    (_a = node.parentNode) == null ? void 0 : _a.removeChild(node);
  } };
}
var root_1 = from_html(`<div class="pcr-modal-backdrop"><div class="pcr-modal" role="dialog" aria-modal="true"><div class="pcr-modal-header"><span class="pcr-modal-title"> </span> <button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div> <div class="pcr-modal-body"><p class="pcr-cf-msg svelte-sjfwjz"> </p></div> <div class="pcr-modal-footer"><button class="pcr-modal-btn pcr-modal-btn-secondary">Cancel</button> <button class="pcr-modal-btn pcr-modal-btn-danger"> </button></div></div></div>`);
function ConfirmModal($$anchor, $$props) {
  push($$props, true);
  let title = prop($$props, "title", 3, "Confirm"), message = prop($$props, "message", 3, ""), confirmLabel = prop($$props, "confirmLabel", 3, "Delete");
  let confirmBtn = state(null);
  user_effect(() => {
    if ($$props.open) requestAnimationFrame(() => {
      var _a;
      return (_a = get(confirmBtn)) == null ? void 0 : _a.focus();
    });
  });
  function handleKeydown(e) {
    var _a, _b;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      (_a = $$props.onConfirm) == null ? void 0 : _a.call($$props);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      (_b = $$props.onCancel) == null ? void 0 : _b.call($$props);
    }
  }
  function handleBackdrop(e) {
    var _a;
    if (e.target === e.currentTarget) (_a = $$props.onCancel) == null ? void 0 : _a.call($$props);
  }
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var div = root_1();
      var div_1 = child(div);
      var div_2 = child(div_1);
      var span = child(div_2);
      var text = child(span);
      var button = sibling(span, 2);
      var div_3 = sibling(div_2, 2);
      var p = child(div_3);
      var text_1 = child(p);
      var div_4 = sibling(div_3, 2);
      var button_1 = child(div_4);
      var button_2 = sibling(button_1, 2);
      var text_2 = child(button_2);
      bind_this(button_2, ($$value) => set(confirmBtn, $$value), () => get(confirmBtn));
      action(div, ($$node) => portal == null ? void 0 : portal($$node));
      template_effect(() => {
        set_text(text, title());
        set_text(text_1, message());
        set_text(text_2, confirmLabel());
      });
      delegated("click", div, handleBackdrop);
      delegated("keydown", div, handleKeydown);
      delegated("click", button, function(...$$args) {
        var _a;
        (_a = $$props.onCancel) == null ? void 0 : _a.apply(this, $$args);
      });
      delegated("click", button_1, function(...$$args) {
        var _a;
        (_a = $$props.onCancel) == null ? void 0 : _a.apply(this, $$args);
      });
      delegated("click", button_2, function(...$$args) {
        var _a;
        (_a = $$props.onConfirm) == null ? void 0 : _a.apply(this, $$args);
      });
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
export {
  ConfirmModal as C,
  portal as p
};
//# sourceMappingURL=ConfirmModal-B3-HqCkU.js.map
