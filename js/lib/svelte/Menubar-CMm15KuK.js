import { d as delegate, p as push, a as prop, u as user_effect, g as get, e as set, v as first_child, i as if_block, f as sibling, k as append, l as pop, s as state, m as user_derived, o as bind_this, j as delegated, n as child, D as comment, w as each, z as index, A as from_html, t as template_effect, h as set_class, r as event, y as set_text, x as set_attribute } from "./disclose-version-et9wt-4m.js";
import { o as onDestroy } from "./index-client-6amB1qrM.js";
import { h as html, P as PopupAnchor } from "./PopupAnchor-D5Lvfjom.js";
import { a as action } from "./actions-zjmT0mOr.js";
import { s as set_style } from "./style-B3hsaAru.js";
import { app } from "/scripts/app.js";
import { b as bind_value } from "./input-B9kD0bWJ.js";
var root_1$2 = from_html(`<div class="pcr-mode-menu-search-container"><input type="text" class="pcr-mode-menu-search" placeholder="Search options..."/></div> <div class="pcr-mode-menu-separator"></div>`, 1);
var root_2$2 = from_html(`<div class="pcr-mode-menu-empty">No matching options</div>`);
var root_5$1 = from_html(`<span class="pcr-mode-menu-check"></span>`);
var root_4$2 = from_html(`<div><span class="pcr-mode-menu-label"></span> <!></div>`);
var root$1 = from_html(`<!> <div class="pcr-mode-menu-list"><!></div>`, 1);
function SearchableList($$anchor, $$props) {
  push($$props, true);
  let options = prop($$props, "options", 19, () => []), onSelect = prop($$props, "onSelect", 3, () => {
  }), currentMode = prop($$props, "currentMode", 3, "switch"), currentSwitchIndex = prop($$props, "currentSwitchIndex", 3, 1), itemPrefix = prop($$props, "itemPrefix", 3, "");
  let filter = state("");
  let selectedIndex = state(-1);
  let searchInput = state(null);
  let filtered = user_derived(() => {
    const terms = get(filter).toLowerCase().split(/\s+/).filter((t) => t.length > 0);
    if (!terms.length) return options();
    return options().filter((opt) => terms.every((t) => opt.label.toLowerCase().includes(t)));
  });
  user_effect(() => {
    get(filter);
    set(selectedIndex, -1);
  });
  function highlightText(text, terms) {
    if (!terms.length) return text;
    let result = "";
    let remaining = text;
    let lower = remaining.toLowerCase();
    while (remaining.length > 0) {
      let earliest = -1;
      let matched = "";
      for (const term of terms) {
        const idx = lower.indexOf(term);
        if (idx !== -1 && (earliest === -1 || idx < earliest)) {
          earliest = idx;
          matched = term;
        }
      }
      if (earliest === -1) {
        result += escapeHtml(remaining);
        break;
      }
      if (earliest > 0) result += escapeHtml(remaining.slice(0, earliest));
      result += `<span class="pcr-mode-menu-highlight">${escapeHtml(remaining.slice(earliest, earliest + matched.length))}</span>`;
      remaining = remaining.slice(earliest + matched.length);
      lower = remaining.toLowerCase();
    }
    return result;
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  let searchTerms = user_derived(() => get(filter).toLowerCase().split(/\s+/).filter((t) => t.length > 0));
  function handleKeydown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (get(filtered).length > 0) set(selectedIndex, (get(selectedIndex) + 1) % get(filtered).length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (get(filtered).length > 0) set(selectedIndex, get(selectedIndex) > 0 ? get(selectedIndex) - 1 : get(filtered).length - 1, true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (get(selectedIndex) >= 0 && get(selectedIndex) < get(filtered).length) {
        onSelect()(get(filtered)[get(selectedIndex)]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
    }
    e.stopPropagation();
  }
  function focusSearch() {
    requestAnimationFrame(() => {
      var _a;
      return (_a = get(searchInput)) == null ? void 0 : _a.focus();
    });
  }
  var $$exports = { focusSearch };
  var fragment = root$1();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var fragment_1 = root_1$2();
      var div = first_child(fragment_1);
      var input = child(div);
      bind_this(input, ($$value) => set(searchInput, $$value), () => get(searchInput));
      delegated("keydown", input, handleKeydown);
      bind_value(input, () => get(filter), ($$value) => set(filter, $$value));
      append($$anchor2, fragment_1);
    };
    if_block(node, ($$render) => {
      if (options().length > 0) $$render(consequent);
    });
  }
  var div_1 = sibling(node, 2);
  var node_1 = child(div_1);
  {
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_2$2();
      append($$anchor2, div_2);
    };
    var alternate = ($$anchor2) => {
      var fragment_2 = comment();
      var node_2 = first_child(fragment_2);
      each(node_2, 17, () => get(filtered), index, ($$anchor3, opt, i) => {
        const isSelected = user_derived(() => currentMode() === "switch" && get(opt).index === currentSwitchIndex());
        var div_3 = root_4$2();
        let classes;
        var span = child(div_3);
        html(span, () => highlightText(`${itemPrefix()}${get(opt).label}`, get(searchTerms)), true);
        var node_3 = sibling(span, 2);
        {
          var consequent_2 = ($$anchor4) => {
            var span_1 = root_5$1();
            span_1.textContent = "✓";
            append($$anchor4, span_1);
          };
          if_block(node_3, ($$render) => {
            if (get(isSelected)) $$render(consequent_2);
          });
        }
        template_effect(() => classes = set_class(div_3, 1, "pcr-mode-menu-item", null, classes, {
          "pcr-mode-menu-selected": get(isSelected),
          "pcr-mode-menu-keyboard-selected": i === get(selectedIndex)
        }));
        delegated("click", div_3, (e) => {
          e.stopPropagation();
          onSelect()(get(opt));
        });
        event("mouseenter", div_3, () => {
          set(selectedIndex, i, true);
        });
        append($$anchor3, div_3);
      });
      append($$anchor2, fragment_2);
    };
    if_block(node_1, ($$render) => {
      if (get(filtered).length === 0 && options().length > 0) $$render(consequent_1);
      else $$render(alternate, -1);
    });
  }
  append($$anchor, fragment);
  return pop($$exports);
}
delegate(["keydown", "click"]);
var root_3$1 = from_html(`<span class="pcr-mode-menu-check"></span>`);
var root_4$1 = from_html(`<span class="pcr-mode-menu-reset" title="Reset iterate position"></span>`);
var root_2$1 = from_html(`<div><span> </span> <!> <!></div>`);
var root_5 = from_html(`<span class="pcr-mode-menu-check"></span>`);
var root_1$1 = from_html(`<div class="pcr-mode-menu-modes"><!>  <div><span></span> <!></div></div> <!>`, 1);
function ModeMenu($$anchor, $$props) {
  push($$props, true);
  let popupKey = prop($$props, "popupKey", 3, "mode"), currentMode = prop($$props, "currentMode", 3, "switch"), currentSwitchIndex = prop($$props, "currentSwitchIndex", 3, 1), switchOptions = prop($$props, "switchOptions", 19, () => []), hasMultipleOptions = prop($$props, "hasMultipleOptions", 3, false), onSelectMode = prop($$props, "onSelectMode", 3, () => {
  }), onSelectSwitch = prop($$props, "onSelectSwitch", 3, () => {
  }), onResetIterate = prop($$props, "onResetIterate", 3, null), onClose = prop($$props, "onClose", 3, () => {
  });
  let searchList;
  const modes = [
    { emoji: "🎲", label: "Randomize", value: "roll" },
    { emoji: "📚", label: "Combine", value: "combine" },
    { emoji: "♻️", label: "Iterate", value: "iterate" }
  ];
  function selectMode(e, mode) {
    e.stopPropagation();
    onSelectMode()(mode);
    onClose()();
  }
  function selectNone(e) {
    e.stopPropagation();
    onSelectSwitch()({ index: 0 });
    onClose()();
  }
  function selectSwitch(opt) {
    onSelectSwitch()(opt);
    onClose()();
  }
  function resetIterate(e) {
    var _a;
    e.stopPropagation();
    (_a = onResetIterate()) == null ? void 0 : _a();
    onClose()();
  }
  PopupAnchor($$anchor, {
    get triggerRect() {
      return $$props.triggerRect;
    },
    get popupKey() {
      return popupKey();
    },
    get onClose() {
      return onClose();
    },
    children: ($$anchor2, $$slotProps) => {
      var fragment_1 = root_1$1();
      var div = first_child(fragment_1);
      var node = child(div);
      each(node, 17, () => modes, index, ($$anchor3, mode) => {
        var div_1 = root_2$1();
        let classes;
        var span = child(div_1);
        var text = child(span);
        var node_1 = sibling(span, 2);
        {
          var consequent = ($$anchor4) => {
            var span_1 = root_3$1();
            span_1.textContent = "✓";
            append($$anchor4, span_1);
          };
          if_block(node_1, ($$render) => {
            if (currentMode() === get(mode).value) $$render(consequent);
          });
        }
        var node_2 = sibling(node_1, 2);
        {
          var consequent_1 = ($$anchor4) => {
            var span_2 = root_4$1();
            span_2.textContent = "↺";
            delegated("click", span_2, resetIterate);
            append($$anchor4, span_2);
          };
          if_block(node_2, ($$render) => {
            if (get(mode).value === "iterate" && currentMode() === "iterate" && onResetIterate()) $$render(consequent_1);
          });
        }
        template_effect(() => {
          classes = set_class(div_1, 1, "pcr-mode-menu-item pcr-mode-menu-mode-option", null, classes, {
            "pcr-mode-menu-selected": currentMode() === get(mode).value,
            "pcr-mode-menu-disabled": !hasMultipleOptions()
          });
          set_text(text, `${get(mode).emoji ?? ""} ${get(mode).label ?? ""}`);
        });
        delegated("click", div_1, (e) => {
          if (hasMultipleOptions()) selectMode(e, get(mode).value);
        });
        append($$anchor3, div_1);
      });
      var div_2 = sibling(node, 2);
      let classes_1;
      var span_3 = child(div_2);
      span_3.textContent = "❌ None";
      var node_3 = sibling(span_3, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var span_4 = root_5();
          span_4.textContent = "✓";
          append($$anchor3, span_4);
        };
        if_block(node_3, ($$render) => {
          if (currentMode() === "switch" && currentSwitchIndex() === 0) $$render(consequent_2);
        });
      }
      var node_4 = sibling(div, 2);
      bind_this(
        SearchableList(node_4, {
          get options() {
            return switchOptions();
          },
          onSelect: selectSwitch,
          get currentMode() {
            return currentMode();
          },
          get currentSwitchIndex() {
            return currentSwitchIndex();
          }
        }),
        ($$value) => searchList = $$value,
        () => searchList
      );
      template_effect(() => classes_1 = set_class(div_2, 1, "pcr-mode-menu-item pcr-mode-menu-mode-option", null, classes_1, {
        "pcr-mode-menu-selected": currentMode() === "switch" && currentSwitchIndex() === 0
      }));
      delegated("click", div_2, selectNone);
      append($$anchor2, fragment_1);
    },
    $$slots: { default: true }
  });
  pop();
}
delegate(["click"]);
var root_1 = from_html(`<span class="pcr-menubar-mode-arrow svelte-vzwh12"></span>`);
var root_2 = from_html(`<span title="AI Assistant (experimental)" data-action="assistant"></span>`);
var root_3 = from_html(`<span data-action="pose"></span> <span data-action="region"></span> <span title="Toggle image preview" data-action="image"></span> <span title="Toggle output panel (Ctrl+\`)" data-action="output"></span>`, 1);
var root_4 = from_html(`<span class="pcr-menubar-btn svelte-vzwh12" title="Fullscreen editor" data-action="maximize"></span> <span title="Collapse editor" data-action="collapse"></span>`, 1);
var root = from_html(`<div><div class="pcr-menubar-actions-left"></div> <div style="display:flex;align-items:center;min-width:0;"><div class="pcr-menubar-mode svelte-vzwh12"><span class="pcr-menubar-mode-label svelte-vzwh12"> </span> <!></div> <div class="pcr-menubar-actions svelte-vzwh12"><!> <span title="Lock output" data-action="lock"></span> <span title="Disable node" data-action="disable"></span> <!> <!></div></div></div> <!>`, 1);
function Menubar($$anchor, $$props) {
  var _a, _b, _c;
  push($$props, true);
  const MODE_COLORS = {
    combine: "#e99e2d",
    roll: "#da3e65",
    switch: "#73d952",
    iterate: "#33bdff"
  };
  const DISPLAY_LABELS = { combine: "Combine Inputs", roll: "Randomize Inputs" };
  let inFullscreen = prop($$props, "inFullscreen", 3, false), onSetMode = prop($$props, "onSetMode", 3, () => {
  }), onToggleLock = prop($$props, "onToggleLock", 3, () => {
  }), onToggleDisable = prop($$props, "onToggleDisable", 3, () => {
  }), onToggleCollapse = prop($$props, "onToggleCollapse", 3, () => {
  }), onToggleOutput = prop($$props, "onToggleOutput", 3, () => {
  }), onToggleImage = prop($$props, "onToggleImage", 3, () => {
  }), onToggleAssistant = prop($$props, "onToggleAssistant", 3, () => {
  }), onTogglePose = prop($$props, "onTogglePose", 3, () => {
  }), onToggleRegion = prop($$props, "onToggleRegion", 3, () => {
  }), onOpenFullscreen = prop($$props, "onOpenFullscreen", 3, () => {
  }), onResetIterate = prop($$props, "onResetIterate", 3, null), docDropdownEl = prop($$props, "docDropdownEl", 3, null);
  let docSlot;
  let modeAreaEl;
  let showModeMenu = state(false);
  let modeMenuRect = state(null);
  let adoptedEl = null;
  let adoptedHome = null;
  user_effect(() => {
    if (adoptedEl === docDropdownEl()) return;
    if (adoptedEl) {
      if (adoptedHome && adoptedHome.isConnected) {
        adoptedHome.appendChild(adoptedEl);
      } else {
        adoptedEl.remove();
      }
    }
    adoptedEl = null;
    adoptedHome = null;
    if (!docDropdownEl() || !docSlot) return;
    if (docSlot.contains(docDropdownEl())) {
      adoptedEl = docDropdownEl();
      return;
    }
    if (inFullscreen()) {
      adoptedHome = docDropdownEl().parentElement;
    }
    docSlot.appendChild(docDropdownEl());
    adoptedEl = docDropdownEl();
  });
  onDestroy(() => {
    if (adoptedEl && adoptedHome && adoptedHome.isConnected) {
      adoptedHome.appendChild(adoptedEl);
    }
  });
  let aiAssistantEnabled = state(((_c = (_b = (_a = app.ui) == null ? void 0 : _a.settings) == null ? void 0 : _b.getSettingValue) == null ? void 0 : _c.call(_b, "PromptChain.AIAssistantEnabled")) === true);
  const aiEnabledChanged = (e) => {
    var _a2;
    set(aiAssistantEnabled, ((_a2 = e.detail) == null ? void 0 : _a2.value) === true);
  };
  window.addEventListener("promptchain:ai-assistant-enabled-changed", aiEnabledChanged);
  onDestroy(() => window.removeEventListener("promptchain:ai-assistant-enabled-changed", aiEnabledChanged));
  let showMode = user_derived(() => $$props.shared.connectedCount > 0 || $$props.shared.hasLabels);
  let modeLabelText = user_derived(() => {
    if (!get(showMode)) return "";
    if ($$props.shared.mode === "switch") {
      return $$props.shared.switchIndex === 0 ? "None" : $$props.shared.switchLabel || "Switch";
    }
    if ($$props.shared.mode === "iterate") {
      const total = $$props.shared.iterateTotal;
      if (total > 0) {
        const display = `(${$$props.shared.iterateCurrent + 1}/${total})`;
        return $$props.shared.iterateCycle > 1 ? `Iterate Inputs ${display} x${$$props.shared.iterateCycle}` : `Iterate Inputs ${display}`;
      }
      return "Iterate Inputs";
    }
    return DISPLAY_LABELS[$$props.shared.mode] || $$props.shared.mode;
  });
  let modeLabelColor = user_derived(() => {
    if ($$props.shared.mode === "switch" && $$props.shared.switchIndex === 0) return "#b0b0b0";
    return MODE_COLORS[$$props.shared.mode] || "";
  });
  function handleModeClick(e) {
    e.stopPropagation();
    if (get(showModeMenu)) {
      set(showModeMenu, false);
      return;
    }
    set(modeMenuRect, e.currentTarget.getBoundingClientRect(), true);
    set(showModeMenu, true);
  }
  function handleModeSelect(mode) {
    onSetMode()(mode);
    set(showModeMenu, false);
  }
  function handleSwitchSelect(opt) {
    onSetMode()("switch", opt.index);
    set(showModeMenu, false);
  }
  function handleAction(action2, e) {
    e.stopPropagation();
    if (action2 === "lock") onToggleLock()();
    else if (action2 === "disable") onToggleDisable()();
    else if (action2 === "image") onToggleImage()();
    else if (action2 === "output") onToggleOutput()();
    else if (action2 === "assistant") {
      if (get(aiAssistantEnabled)) onToggleAssistant()();
    } else if (action2 === "pose") {
      if ($$props.shared.hasPoseStudio) onTogglePose()();
    } else if (action2 === "region") {
      if ($$props.shared.hasRegionBox) onToggleRegion()();
    } else if (action2 === "collapse") onToggleCollapse()();
    else if (action2 === "maximize") onOpenFullscreen()();
  }
  function actionClick(node, action2) {
    function handler(e) {
      handleAction(action2, e);
    }
    node.addEventListener("click", handler);
    return {
      destroy() {
        node.removeEventListener("click", handler);
      }
    };
  }
  var fragment = root();
  var div = first_child(fragment);
  let classes;
  var div_1 = child(div);
  bind_this(div_1, ($$value) => docSlot = $$value, () => docSlot);
  var div_2 = sibling(div_1, 2);
  var div_3 = child(div_2);
  let styles;
  var span = child(div_3);
  let styles_1;
  var text = child(span);
  var node_1 = sibling(span, 2);
  {
    var consequent = ($$anchor2) => {
      var span_1 = root_1();
      span_1.textContent = "▾";
      append($$anchor2, span_1);
    };
    if_block(node_1, ($$render) => {
      if (get(showMode)) $$render(consequent);
    });
  }
  bind_this(div_3, ($$value) => modeAreaEl = $$value, () => modeAreaEl);
  var div_4 = sibling(div_3, 2);
  var node_2 = child(div_4);
  {
    var consequent_1 = ($$anchor2) => {
      var span_2 = root_2();
      let classes_1;
      let styles_2;
      html(span_2, () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 5.6 10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.9959.9959 0 0 0-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"/></svg>', true);
      action(span_2, ($$node, $$action_arg) => actionClick == null ? void 0 : actionClick($$node, $$action_arg), () => "assistant");
      template_effect(() => {
        classes_1 = set_class(span_2, 1, "pcr-menubar-btn svelte-vzwh12", null, classes_1, { "pcr-menubar-btn-active": $$props.shared.aiAssistantOpen });
        styles_2 = set_style(span_2, "", styles_2, { color: $$props.shared.aiAssistantOpen ? "#a855f7" : "" });
      });
      append($$anchor2, span_2);
    };
    if_block(node_2, ($$render) => {
      if (get(aiAssistantEnabled)) $$render(consequent_1);
    });
  }
  var span_3 = sibling(node_2, 2);
  let classes_2;
  let styles_3;
  html(
    span_3,
    () => $$props.shared.locked ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2s-2 .9-2 2s.9 2 2 2z"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2s-2 .9-2 2s.9 2 2 2z"/></svg>',
    true
  );
  action(span_3, ($$node, $$action_arg) => actionClick == null ? void 0 : actionClick($$node, $$action_arg), () => "lock");
  var span_4 = sibling(span_3, 2);
  let classes_3;
  let styles_4;
  html(span_4, () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8c1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0 1 20 12c0 4.42-3.58 8-8 8z"/></svg>', true);
  action(span_4, ($$node, $$action_arg) => actionClick == null ? void 0 : actionClick($$node, $$action_arg), () => "disable");
  var node_3 = sibling(span_4, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var fragment_1 = root_3();
      var span_5 = first_child(fragment_1);
      let classes_4;
      let styles_5;
      html(span_5, () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 6c-2.61.7-5.67 1-8.5 1s-5.89-.3-8.5-1L3 8c1.86.5 4 .83 6 1v13h2v-6h2v6h2V9c2-.17 4.14-.5 6-1l-.5-2zM12 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>', true);
      action(span_5, ($$node, $$action_arg) => actionClick == null ? void 0 : actionClick($$node, $$action_arg), () => "pose");
      var span_6 = sibling(span_5, 2);
      let classes_5;
      let styles_6;
      html(span_6, () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2zM7 7v10h10V7H7zm8 8H9V9h6v6z"/></svg>', true);
      action(span_6, ($$node, $$action_arg) => actionClick == null ? void 0 : actionClick($$node, $$action_arg), () => "region");
      var span_7 = sibling(span_6, 2);
      let classes_6;
      let styles_7;
      html(span_7, () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>', true);
      action(span_7, ($$node, $$action_arg) => actionClick == null ? void 0 : actionClick($$node, $$action_arg), () => "image");
      var span_8 = sibling(span_7, 2);
      let classes_7;
      let styles_8;
      html(span_8, () => '<svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor"><path d="M400-280h160v-80H400v80Zm0-160h280v-80H400v80ZM280-600h400v-80H280v80Zm200 120ZM80-80v-80h102q-48-23-77.5-68T75-330q0-79 55.5-134.5T265-520v80q-45 0-77.5 32T155-330q0 39 24 69t61 38v-97h80v240H80Zm320-40v-80h360v-560H200v160h-80v-160q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H400Z"/></svg>', true);
      action(span_8, ($$node, $$action_arg) => actionClick == null ? void 0 : actionClick($$node, $$action_arg), () => "output");
      template_effect(() => {
        classes_4 = set_class(span_5, 1, "pcr-menubar-btn svelte-vzwh12", null, classes_4, {
          "pcr-menubar-btn-active": $$props.shared.posePanelVisible,
          "pcr-menubar-btn-disabled": !$$props.shared.hasPoseStudio
        });
        set_attribute(span_5, "title", $$props.shared.hasPoseStudio ? "Toggle 3D Poser panel" : "Add a 3D Poser node to use this");
        styles_5 = set_style(span_5, "", styles_5, { color: $$props.shared.posePanelVisible ? "#ff8c1a" : "" });
        classes_5 = set_class(span_6, 1, "pcr-menubar-btn svelte-vzwh12", null, classes_5, {
          "pcr-menubar-btn-active": $$props.shared.regionPanelVisible,
          "pcr-menubar-btn-disabled": !$$props.shared.hasRegionBox
        });
        set_attribute(span_6, "title", $$props.shared.hasRegionBox ? "Toggle Region Box panel" : "Add a Region Box node to use this");
        styles_6 = set_style(span_6, "", styles_6, { color: $$props.shared.regionPanelVisible ? "#42b9c4" : "" });
        classes_6 = set_class(span_7, 1, "pcr-menubar-btn svelte-vzwh12", null, classes_6, { "pcr-menubar-btn-active": $$props.shared.imagePanelVisible });
        styles_7 = set_style(span_7, "", styles_7, { color: $$props.shared.imagePanelVisible ? "#4bb949" : "" });
        classes_7 = set_class(span_8, 1, "pcr-menubar-btn svelte-vzwh12", null, classes_7, { "pcr-menubar-btn-active": $$props.shared.outputPanelOpen });
        styles_8 = set_style(span_8, "", styles_8, { color: $$props.shared.outputPanelOpen ? "#4fc3f7" : "" });
      });
      append($$anchor2, fragment_1);
    };
    if_block(node_3, ($$render) => {
      if (!inFullscreen()) $$render(consequent_2);
    });
  }
  var node_4 = sibling(node_3, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var fragment_2 = root_4();
      var span_9 = first_child(fragment_2);
      html(span_9, () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm18 0v7h-7v-2h5v-5h2z"/></svg>', true);
      action(span_9, ($$node, $$action_arg) => actionClick == null ? void 0 : actionClick($$node, $$action_arg), () => "maximize");
      var span_10 = sibling(span_9, 2);
      let classes_8;
      let styles_9;
      html(span_10, () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.83 4H20a2 2 0 0 1 2 2v12c0 .34-.09.66-.23.94L20 17.17V8h-9.17l-4-4zm13.66 19.31L17.17 20H4a2 2 0 0 1-2-2V6c0-.34.08-.66.23-.94L.69 3.51L2.1 2.1l19.8 19.8l-1.41 1.41zM15.17 18l-10-10H4v10h11.17z"/></svg>', true);
      action(span_10, ($$node, $$action_arg) => actionClick == null ? void 0 : actionClick($$node, $$action_arg), () => "collapse");
      template_effect(() => {
        classes_8 = set_class(span_10, 1, "pcr-menubar-btn svelte-vzwh12", null, classes_8, { "pcr-menubar-btn-active": $$props.shared.collapsed });
        styles_9 = set_style(span_10, "", styles_9, { color: $$props.shared.collapsed ? "#5e79ff" : "" });
      });
      append($$anchor2, fragment_2);
    };
    if_block(node_4, ($$render) => {
      if (!inFullscreen()) $$render(consequent_3);
    });
  }
  var node_5 = sibling(div, 2);
  {
    var consequent_4 = ($$anchor2) => {
      {
        let $0 = user_derived(() => {
          var _a2;
          return (_a2 = $$props.node) == null ? void 0 : _a2.id;
        });
        let $1 = user_derived(() => $$props.shared.switchOptions.length > 1);
        ModeMenu($$anchor2, {
          get triggerRect() {
            return get(modeMenuRect);
          },
          get popupKey() {
            return `menubar_${get($0) ?? ""}`;
          },
          get currentMode() {
            return $$props.shared.mode;
          },
          get currentSwitchIndex() {
            return $$props.shared.switchIndex;
          },
          get switchOptions() {
            return $$props.shared.switchOptions;
          },
          get hasMultipleOptions() {
            return get($1);
          },
          onSelectMode: (mode) => handleModeSelect(mode),
          onSelectSwitch: (opt) => handleSwitchSelect(opt),
          get onResetIterate() {
            return onResetIterate();
          },
          onClose: () => {
            set(showModeMenu, false);
          }
        });
      }
    };
    if_block(node_5, ($$render) => {
      if (get(showModeMenu) && get(modeMenuRect)) $$render(consequent_4);
    });
  }
  template_effect(() => {
    var _a2, _b2, _c2;
    classes = set_class(div, 1, "pcr-menubar svelte-vzwh12", null, classes, {
      "pcr-menubar--fullscreen": inFullscreen(),
      "pcr-menubar--locked": inFullscreen() && ((_a2 = $$props.shared) == null ? void 0 : _a2.locked) && !((_b2 = $$props.shared) == null ? void 0 : _b2.disabled),
      "pcr-menubar--disabled": inFullscreen() && ((_c2 = $$props.shared) == null ? void 0 : _c2.disabled)
    });
    styles = set_style(div_3, "", styles, {
      display: get(showMode) ? "" : "none",
      "pointer-events": get(showMode) ? "" : "none"
    });
    styles_1 = set_style(span, "", styles_1, { color: get(modeLabelColor) });
    set_text(text, get(modeLabelText));
    classes_2 = set_class(span_3, 1, "pcr-menubar-btn svelte-vzwh12", null, classes_2, { "pcr-menubar-btn-active": $$props.shared.locked });
    styles_3 = set_style(span_3, "", styles_3, { color: $$props.shared.locked ? "#d2b115" : "" });
    classes_3 = set_class(span_4, 1, "pcr-menubar-btn svelte-vzwh12", null, classes_3, { "pcr-menubar-btn-active": $$props.shared.disabled });
    styles_4 = set_style(span_4, "", styles_4, { color: $$props.shared.disabled ? "#c42020" : "" });
  });
  delegated("click", div_3, handleModeClick);
  append($$anchor, fragment);
  pop();
}
delegate(["click"]);
export {
  Menubar as M,
  SearchableList as S
};
//# sourceMappingURL=Menubar-CMm15KuK.js.map
