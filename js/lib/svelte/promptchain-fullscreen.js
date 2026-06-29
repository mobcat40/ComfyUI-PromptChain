var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var _activeNodeId, _treeRoots, _openTabs, _activeWildcardTab, _compiledOutput, _compiledNegOutput, _imageUrl, _previewUrl, _progress, _isGenerating, _sidebarView, _fontSize, _renamingNodeId;
import { d as delegate, p as push, a as prop, i as if_block, f as sibling, t as template_effect, e as set, g as get, j as delegated, k as append, l as pop, s as state, n as child, A as from_html, x as set_attribute, u as user_effect, h as set_class, r as event, m as user_derived, S as text, y as set_text, F as set_style, o as bind_this, w as each, z as index, D as comment, v as first_child, c as proxy, N as unmount, M as mount } from "./disclose-version-CPcS7M7Y.js";
import { a as onMount, o as onDestroy } from "./index-client-DMSJyFwf.js";
import { b as bind_value } from "./input-uYBeAZAB.js";
import { M as Menubar, S as SearchableList } from "./Menubar-CXbySUbI.js";
var root_1$4 = from_html(`<img class="pcr-fs-topbar-logo svelte-93wsqh" alt="PromptChain"/>`);
var root$5 = from_html(`<div class="pcr-fs-topbar svelte-93wsqh"><div class="pcr-fs-topbar-left svelte-93wsqh"><!> <span class="pcr-fs-topbar-title svelte-93wsqh"></span></div> <div class="pcr-fs-topbar-right svelte-93wsqh"><div class="pcr-fs-topbar-actions svelte-93wsqh"><input type="number" class="pcr-fs-batch-input svelte-93wsqh" min="1" max="99" title="Batch count"/>  <span class="pcr-fs-run-btn svelte-93wsqh" title="Queue prompt (Ctrl+Enter)"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg> <span>Run</span></span>  <span class="pcr-fs-cancel-btn pcr-fs-inactive svelte-93wsqh" title="Cancel execution"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg></span> <span class="pcr-fs-queue-badge pcr-fs-inactive svelte-93wsqh">0 active</span></div> <div class="pcr-fs-panel-toggles svelte-93wsqh"><span class="pcr-fs-header-btn svelte-93wsqh" title="Toggle 3D Poser panel" data-fs-action="pose"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 6c-2.61.7-5.67 1-8.5 1s-5.89-.3-8.5-1L3 8c1.86.5 4 .83 6 1v13h2v-6h2v6h2V9c2-.17 4.14-.5 6-1l-.5-2zM12 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"></path></svg></span> <span class="pcr-fs-header-btn svelte-93wsqh" title="Toggle output panel" data-fs-action="output"><svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M400-280h160v-80H400v80Zm0-160h280v-80H400v80ZM280-600h400v-80H280v80Zm200 120ZM80-80v-80h102q-48-23-77.5-68T75-330q0-79 55.5-134.5T265-520v80q-45 0-77.5 32T155-330q0 39 24 69t61 38v-97h80v240H80Zm320-40v-80h360v-560H200v160h-80v-160q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H400Z"></path></svg></span> <span class="pcr-fs-header-btn svelte-93wsqh" title="Toggle image preview" data-fs-action="image"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"></path></svg></span></div>  <span class="pcr-fs-close-btn svelte-93wsqh" title="Close (Escape)"></span></div></div>`);
function Topbar($$anchor, $$props) {
  push($$props, true);
  let logoUrl = prop($$props, "logoUrl", 3, ""), workflowName = prop($$props, "workflowName", 3, "Workflow"), onQueuePrompt = prop($$props, "onQueuePrompt", 3, () => {
  }), onCancelExecution = prop($$props, "onCancelExecution", 3, () => {
  }), onClose = prop($$props, "onClose", 3, () => {
  });
  let batchCount = state(1);
  var div = root$5();
  var div_1 = child(div);
  var node = child(div_1);
  {
    var consequent = ($$anchor2) => {
      var img = root_1$4();
      template_effect(() => set_attribute(img, "src", logoUrl()));
      append($$anchor2, img);
    };
    if_block(node, ($$render) => {
      if (logoUrl()) $$render(consequent);
    });
  }
  var span = sibling(node, 2);
  var div_2 = sibling(div_1, 2);
  var div_3 = child(div_2);
  var input = child(div_3);
  var span_1 = sibling(input, 2);
  var span_2 = sibling(span_1, 2);
  var span_3 = sibling(div_3, 4);
  span_3.textContent = "✕";
  template_effect(() => set_attribute(span, "data-name", workflowName()));
  bind_value(input, () => get(batchCount), ($$value) => set(batchCount, $$value));
  delegated("click", span_1, (e) => {
    e.stopPropagation();
    onQueuePrompt()(get(batchCount));
  });
  delegated("click", span_2, (e) => {
    e.stopPropagation();
    onCancelExecution()();
  });
  delegated("click", span_3, (e) => {
    e.stopPropagation();
    onClose()();
  });
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_2$4 = from_html(`<span><!></span>`);
var root_5$2 = from_html(`<input class="pcr-nettree-rename-input svelte-cjyach" type="text"/>`);
var root_6$1 = from_html(`<span class="pcr-nettree-name svelte-cjyach"> </span>`);
var root_9 = from_html(`<div><div><span class="pcr-nettree-indicator svelte-cjyach"><!></span> <span class="pcr-nettree-toggle pcr-nettree-toggle--none svelte-cjyach"></span> <span class="pcr-nettree-name pcr-nettree-name--label svelte-cjyach"><!></span></div></div>`);
var root_17 = from_html(`<span> </span>`);
var root_16 = from_html(`<div><div class="pcr-nettree-row svelte-cjyach"><span class="pcr-nettree-indicator pcr-nettree-indicator--wildcard svelte-cjyach"> </span> <span class="pcr-nettree-toggle pcr-nettree-toggle--none svelte-cjyach"></span> <span class="pcr-nettree-name pcr-nettree-name--wildcard svelte-cjyach"><!></span></div></div>`);
var root_7 = from_html(`<div><!> <!> <!></div>`);
var root$4 = from_html(`<div><div><span><!></span> <!> <!> <span class="pcr-nettree-actions svelte-cjyach"><span></span>  <span></span></span></div> <!></div>`);
function TreeNode_1($$anchor, $$props) {
  push($$props, true);
  const MODE_EMOJI = {
    combine: "📚",
    roll: "🎲",
    switch: "✅",
    iterate: "♻️"
  };
  const MODE_COLORS = {
    combine: "#e99e2d",
    roll: "#da3e65",
    switch: "#73d952",
    iterate: "#33bdff"
  };
  let activeNodeId = prop($$props, "activeNodeId", 3, null), renamingNodeId = prop($$props, "renamingNodeId", 3, null), onSelectNode = prop($$props, "onSelectNode", 3, () => {
  }), onSetMode = prop($$props, "onSetMode", 3, () => {
  }), onToggleLock = prop($$props, "onToggleLock", 3, () => {
  }), onToggleDisable = prop($$props, "onToggleDisable", 3, () => {
  }), onContextMenu = prop($$props, "onContextMenu", 3, () => {
  }), onLabelClick = prop($$props, "onLabelClick", 3, () => {
  }), onWildcardClick = prop($$props, "onWildcardClick", 3, () => {
  }), onWildcardModeClick = prop($$props, "onWildcardModeClick", 3, () => {
  }), onDragDrop = prop($$props, "onDragDrop", 3, () => {
  }), onFinishRename = prop($$props, "onFinishRename", 3, () => {
  }), refreshTree = prop($$props, "refreshTree", 3, () => {
  }), isRoot = prop($$props, "isRoot", 3, false), parentTree = prop($$props, "parentTree", 3, null);
  let isRenaming = user_derived(() => renamingNodeId() != null && $$props.tree.node.id === renamingNodeId());
  let renameValue = state("");
  let renameInputEl = state(null);
  let renameCommitted = false;
  user_effect(() => {
    if (get(isRenaming)) {
      set(renameValue, $$props.tree.title || "", true);
      renameCommitted = false;
      queueMicrotask(() => {
        var _a, _b;
        (_a = get(renameInputEl)) == null ? void 0 : _a.focus();
        (_b = get(renameInputEl)) == null ? void 0 : _b.select();
      });
    }
  });
  function commitRename() {
    if (renameCommitted) return;
    renameCommitted = true;
    const val = get(renameValue).trim();
    onFinishRename()($$props.tree.node.id, val || null);
  }
  function cancelRename() {
    if (renameCommitted) return;
    renameCommitted = true;
    onFinishRename()($$props.tree.node.id, null);
  }
  let node = user_derived(() => $$props.tree.node);
  let mode = user_derived(() => $$props.tree.mode);
  let switchIndex = user_derived(() => $$props.tree.switchIndex);
  let isInactive = user_derived(() => $$props.tree._inactive);
  let isCollapsed = user_derived(() => $$props.tree.collapsed);
  let isLocked = user_derived(() => $$props.tree.locked);
  let isDisabled = user_derived(() => $$props.tree.disabled);
  let isActive = user_derived(() => activeNodeId() != null && get(node).id === activeNodeId());
  let parentMode = user_derived(() => {
    var _a;
    return ((_a = parentTree()) == null ? void 0 : _a.mode) || "switch";
  });
  let parentSwitch = user_derived(() => {
    var _a;
    return ((_a = parentTree()) == null ? void 0 : _a.switchIndex) ?? 1;
  });
  let childIndex = user_derived(() => {
    var _a;
    if (!((_a = parentTree()) == null ? void 0 : _a.children)) return 0;
    const idx = parentTree().children.indexOf($$props.tree);
    return idx >= 0 ? idx + 1 : 0;
  });
  let isSelected = user_derived(() => get(parentMode) === "switch" && get(parentSwitch) === get(childIndex));
  function toggleCollapse(e) {
    e.stopPropagation();
    if (!get(node).properties) get(node).properties = {};
    get(node).properties.pcrTreeCollapsed = !get(node).properties.pcrTreeCollapsed;
    refreshTree()();
  }
  function handleIndicatorClick(e) {
    var _a;
    e.stopPropagation();
    if (!((_a = parentTree()) == null ? void 0 : _a.node)) return;
    if (get(parentMode) === "switch") {
      onSetMode()(parentTree().node, "switch", get(childIndex));
    } else {
      onSetMode()(parentTree().node, get(parentMode), void 0, e.currentTarget);
    }
  }
  var div = root$4();
  let classes;
  var div_1 = child(div);
  let classes_1;
  set_attribute(div_1, "draggable", true);
  var span = child(div_1);
  let classes_2;
  var node_1 = child(span);
  {
    var consequent = ($$anchor2) => {
      var text$1 = text();
      template_effect(() => set_text(text$1, get(isCollapsed) ? "▶" : "▼"));
      append($$anchor2, text$1);
    };
    if_block(node_1, ($$render) => {
      if ($$props.tree.hasChildren) $$render(consequent);
    });
  }
  var node_2 = sibling(span, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var span_1 = root_2$4();
      let classes_3;
      let styles;
      var node_3 = child(span_1);
      {
        var consequent_1 = ($$anchor3) => {
          var text_1 = text();
          template_effect(() => set_text(text_1, get(isSelected) ? "✅" : "☐"));
          append($$anchor3, text_1);
        };
        var alternate = ($$anchor3) => {
          var text_2 = text();
          template_effect(() => set_text(text_2, MODE_EMOJI[get(parentMode)] || ""));
          append($$anchor3, text_2);
        };
        if_block(node_3, ($$render) => {
          if (get(parentMode) === "switch") $$render(consequent_1);
          else $$render(alternate, -1);
        });
      }
      template_effect(() => {
        classes_3 = set_class(span_1, 1, "pcr-nettree-indicator svelte-cjyach", null, classes_3, {
          "pcr-nettree-indicator--unselected": get(parentMode) === "switch" && !get(isSelected),
          "pcr-nettree-indicator--combine": get(parentMode) === "combine"
        });
        styles = set_style(span_1, "", styles, {
          color: get(parentMode) === "switch" ? get(isSelected) ? MODE_COLORS.switch : "" : MODE_COLORS[get(parentMode)] || ""
        });
      });
      delegated("pointerdown", span_1, (e) => e.stopPropagation());
      delegated("click", span_1, handleIndicatorClick);
      append($$anchor2, span_1);
    };
    if_block(node_2, ($$render) => {
      if (!isRoot() && parentTree()) $$render(consequent_2);
    });
  }
  var node_4 = sibling(node_2, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var input = root_5$2();
      bind_this(input, ($$value) => set(renameInputEl, $$value), () => get(renameInputEl));
      delegated("pointerdown", input, (e) => e.stopPropagation());
      delegated("click", input, (e) => e.stopPropagation());
      event("blur", input, commitRename);
      delegated("keydown", input, (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commitRename();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelRename();
        }
      });
      bind_value(input, () => get(renameValue), ($$value) => set(renameValue, $$value));
      append($$anchor2, input);
    };
    var alternate_1 = ($$anchor2) => {
      var span_2 = root_6$1();
      var text_3 = child(span_2);
      template_effect(() => set_text(text_3, $$props.tree.title));
      append($$anchor2, span_2);
    };
    if_block(node_4, ($$render) => {
      if (get(isRenaming)) $$render(consequent_3);
      else $$render(alternate_1, -1);
    });
  }
  var span_3 = sibling(node_4, 2);
  var span_4 = child(span_3);
  let classes_4;
  span_4.textContent = "🔒";
  var span_5 = sibling(span_4, 2);
  let classes_5;
  span_5.textContent = "⊘";
  var node_5 = sibling(div_1, 2);
  {
    var consequent_13 = ($$anchor2) => {
      var div_2 = root_7();
      let classes_6;
      var node_6 = child(div_2);
      each(node_6, 17, () => $$props.tree.children, index, ($$anchor3, child2) => {
        TreeNode_1($$anchor3, {
          get tree() {
            return get(child2);
          },
          get activeNodeId() {
            return activeNodeId();
          },
          get renamingNodeId() {
            return renamingNodeId();
          },
          get onSelectNode() {
            return onSelectNode();
          },
          get onSetMode() {
            return onSetMode();
          },
          get onToggleLock() {
            return onToggleLock();
          },
          get onToggleDisable() {
            return onToggleDisable();
          },
          get onContextMenu() {
            return onContextMenu();
          },
          get onLabelClick() {
            return onLabelClick();
          },
          get onWildcardClick() {
            return onWildcardClick();
          },
          get onWildcardModeClick() {
            return onWildcardModeClick();
          },
          get onDragDrop() {
            return onDragDrop();
          },
          get onFinishRename() {
            return onFinishRename();
          },
          get refreshTree() {
            return refreshTree();
          },
          isRoot: false,
          get parentTree() {
            return $$props.tree;
          }
        });
      });
      var node_7 = sibling(node_6, 2);
      {
        var consequent_8 = ($$anchor3) => {
          var div_3 = root_9();
          let classes_7;
          var div_4 = child(div_3);
          let classes_8;
          var span_6 = child(div_4);
          var node_8 = child(span_6);
          {
            var consequent_4 = ($$anchor4) => {
              var text_4 = text();
              text_4.nodeValue = "✅";
              append($$anchor4, text_4);
            };
            var d = user_derived(() => $$props.tree.labels.some((l) => l.index === get(switchIndex)));
            var consequent_5 = ($$anchor4) => {
              var text_5 = text();
              text_5.nodeValue = "❌";
              append($$anchor4, text_5);
            };
            var alternate_2 = ($$anchor4) => {
              var text_6 = text();
              template_effect(() => set_text(text_6, MODE_EMOJI[get(mode)] || "🎲"));
              append($$anchor4, text_6);
            };
            if_block(node_8, ($$render) => {
              if (get(d)) $$render(consequent_4);
              else if (get(mode) === "switch" && get(switchIndex) === 0) $$render(consequent_5, 1);
              else $$render(alternate_2, -1);
            });
          }
          var span_7 = sibling(span_6, 4);
          var node_9 = child(span_7);
          {
            var consequent_6 = ($$anchor4) => {
              var text_7 = text();
              template_effect(($0) => set_text(text_7, $0), [
                () => {
                  var _a;
                  return (_a = $$props.tree.labels.find((l) => l.index === get(switchIndex))) == null ? void 0 : _a.label;
                }
              ]);
              append($$anchor4, text_7);
            };
            var d_1 = user_derived(() => $$props.tree.labels.some((l) => l.index === get(switchIndex)));
            var consequent_7 = ($$anchor4) => {
              var text_8 = text("None");
              append($$anchor4, text_8);
            };
            var alternate_3 = ($$anchor4) => {
              var text_9 = text();
              template_effect(() => set_text(text_9, `${$$props.tree.labels.length ?? ""} options`));
              append($$anchor4, text_9);
            };
            if_block(node_9, ($$render) => {
              if (get(d_1)) $$render(consequent_6);
              else if (get(mode) === "switch" && get(switchIndex) === 0) $$render(consequent_7, 1);
              else $$render(alternate_3, -1);
            });
          }
          template_effect(
            ($0) => {
              classes_7 = set_class(div_3, 1, "pcr-nettree-item svelte-cjyach", null, classes_7, { "pcr-nettree-item--inactive": get(isInactive) });
              classes_8 = set_class(div_4, 1, "pcr-nettree-row svelte-cjyach", null, classes_8, $0);
            },
            [
              () => ({
                "pcr-nettree-row--selected": $$props.tree.labels.some((l) => l.index === get(switchIndex))
              })
            ]
          );
          delegated("pointerdown", div_4, (e) => e.stopPropagation());
          delegated("click", div_4, () => {
            onSelectNode()($$props.tree);
            const sel = $$props.tree.labels.find((l) => l.index === get(switchIndex));
            if (sel) onLabelClick()(get(node), sel.index);
          });
          delegated("contextmenu", div_4, (e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu()(get(node), $$props.tree, parentTree(), e.clientX, e.clientY);
          });
          delegated("pointerdown", span_6, (e) => e.stopPropagation());
          delegated("click", span_6, (e) => {
            e.stopPropagation();
            onLabelClick()(get(node), null, e.currentTarget);
          });
          append($$anchor3, div_3);
        };
        if_block(node_7, ($$render) => {
          if ($$props.tree.labels.length > 0) $$render(consequent_8);
        });
      }
      var node_10 = sibling(node_7, 2);
      each(node_10, 17, () => $$props.tree.wildcards, index, ($$anchor3, wc) => {
        const keyName = user_derived(() => get(wc).name.includes("/") ? get(wc).name.split("/").pop() : get(wc).name);
        const hasRolled = user_derived(() => get(wc).mode === "randomize" && get(wc).rolledLabel);
        var div_5 = root_16();
        let classes_9;
        var div_6 = child(div_5);
        var span_8 = child(div_6);
        var text_10 = child(span_8);
        var span_9 = sibling(span_8, 4);
        let styles_1;
        var node_11 = child(span_9);
        {
          var consequent_9 = ($$anchor4) => {
            var span_10 = root_17();
            let classes_10;
            var text_11 = child(span_10);
            template_effect(() => {
              classes_10 = set_class(span_10, 1, "pcr-wc-rolled svelte-cjyach", null, classes_10, { "pcr-wc-rolled--animate": get(hasRolled) });
              set_text(text_11, get(wc).rolledLabel);
            });
            append($$anchor4, span_10);
          };
          var consequent_10 = ($$anchor4) => {
            var text_12 = text();
            template_effect(() => set_text(text_12, `${get(keyName) ?? ""}: ${get(wc).label ?? ""}`));
            append($$anchor4, text_12);
          };
          var consequent_11 = ($$anchor4) => {
            var text_13 = text();
            template_effect(() => set_text(text_13, `${get(keyName) ?? ""} (all)`));
            append($$anchor4, text_13);
          };
          var consequent_12 = ($$anchor4) => {
            var text_14 = text();
            template_effect(() => set_text(text_14, `${get(keyName) ?? ""} (off)`));
            append($$anchor4, text_14);
          };
          var alternate_4 = ($$anchor4) => {
            var text_15 = text();
            template_effect(() => set_text(text_15, get(keyName)));
            append($$anchor4, text_15);
          };
          if_block(node_11, ($$render) => {
            if (get(hasRolled)) $$render(consequent_9);
            else if (get(wc).mode === "switch" && get(wc).label) $$render(consequent_10, 1);
            else if (get(wc).mode === "combine") $$render(consequent_11, 2);
            else if (get(wc).mode === "none") $$render(consequent_12, 3);
            else $$render(alternate_4, -1);
          });
        }
        template_effect(() => {
          classes_9 = set_class(div_5, 1, "pcr-nettree-item pcr-nettree-item--wildcard svelte-cjyach", null, classes_9, { "pcr-nettree-item--inactive": get(isInactive) });
          set_text(text_10, get(wc).mode === "switch" && get(wc).index > 0 ? "✅" : MODE_EMOJI[get(wc).mode === "randomize" ? "roll" : get(wc).mode] || "🎲");
          set_attribute(span_9, "title", `__${get(wc).name ?? ""}__`);
          styles_1 = set_style(span_9, "", styles_1, {
            color: get(wc).mode === "switch" && get(wc).index > 0 ? MODE_COLORS.switch : get(wc).mode === "combine" ? MODE_COLORS.combine : get(wc).mode === "iterate" ? MODE_COLORS.iterate : get(wc).mode === "none" ? "#b0b0b0" : MODE_COLORS.roll
          });
        });
        delegated("pointerdown", div_6, (e) => e.stopPropagation());
        delegated("click", div_6, () => onSelectNode()($$props.tree, get(wc).name));
        delegated("contextmenu", div_6, (e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectNode()($$props.tree, get(wc).name);
        });
        delegated("pointerdown", span_8, (e) => e.stopPropagation());
        delegated("click", span_8, (e) => {
          e.stopPropagation();
          onWildcardModeClick()(get(node), get(wc).name, e.currentTarget);
        });
        append($$anchor3, div_5);
      });
      template_effect(() => classes_6 = set_class(div_2, 1, "pcr-nettree-children svelte-cjyach", null, classes_6, { "pcr-nettree-children--root": isRoot() }));
      append($$anchor2, div_2);
    };
    if_block(node_5, ($$render) => {
      if ($$props.tree.hasChildren && !get(isCollapsed)) $$render(consequent_13);
    });
  }
  template_effect(
    ($0) => {
      classes = set_class(div, 1, "pcr-nettree-item svelte-cjyach", null, classes, { "pcr-nettree-item--inactive": get(isInactive) });
      set_attribute(div, "data-node-id", $0);
      classes_1 = set_class(div_1, 1, "pcr-nettree-row svelte-cjyach", null, classes_1, {
        "pcr-nettree-row--root": isRoot(),
        "pcr-nettree-row--active": get(isActive),
        "pcr-nettree-row--selected": !isRoot() && get(isSelected),
        "pcr-nettree-row--locked": get(isLocked),
        "pcr-nettree-row--disabled": get(isDisabled)
      });
      classes_2 = set_class(span, 1, "pcr-nettree-toggle svelte-cjyach", null, classes_2, { "pcr-nettree-toggle--empty": !$$props.tree.hasChildren });
      classes_4 = set_class(span_4, 1, "pcr-nettree-action-btn svelte-cjyach", null, classes_4, { "pcr-nettree-action--locked": get(isLocked) });
      set_attribute(span_4, "title", get(isLocked) ? "Unlock" : "Lock");
      classes_5 = set_class(span_5, 1, "pcr-nettree-action-btn svelte-cjyach", null, classes_5, { "pcr-nettree-action--disabled": get(isDisabled) });
      set_attribute(span_5, "title", get(isDisabled) ? "Enable" : "Disable");
    },
    [() => String(get(node).id)]
  );
  delegated("pointerdown", div_1, (e) => e.stopPropagation());
  delegated("click", div_1, () => onSelectNode()($$props.tree));
  delegated("contextmenu", div_1, (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu()(get(node), $$props.tree, parentTree(), e.clientX, e.clientY);
  });
  event("dragstart", div_1, (e) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
    e.currentTarget.classList.add("pcr-nettree-row--dragging");
    e.currentTarget._dragTree = $$props.tree;
    e.currentTarget._dragParent = parentTree();
  });
  event("dragend", div_1, (e) => {
    e.currentTarget.classList.remove("pcr-nettree-row--dragging");
  });
  event("dragover", div_1, (e) => {
    var _a, _b, _c;
    const src = (_a = e.currentTarget.closest(".pcr-nettree-items")) == null ? void 0 : _a.querySelector(".pcr-nettree-row--dragging");
    if (!src || ((_b = src._dragTree) == null ? void 0 : _b.node) === get(node)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const third = rect.height / 3;
    (_c = e.currentTarget.closest(".pcr-nettree-items")) == null ? void 0 : _c.querySelectorAll(".pcr-nettree-row").forEach((r) => r.classList.remove("pcr-nettree-row--drop-before", "pcr-nettree-row--drop-after", "pcr-nettree-row--drop-onto"));
    if (y < third) e.currentTarget.classList.add("pcr-nettree-row--drop-before");
    else if (y > third * 2) e.currentTarget.classList.add("pcr-nettree-row--drop-after");
    else e.currentTarget.classList.add("pcr-nettree-row--drop-onto");
  });
  event("dragleave", div_1, (e) => {
    e.currentTarget.classList.remove("pcr-nettree-row--drop-before", "pcr-nettree-row--drop-after", "pcr-nettree-row--drop-onto");
  });
  event("drop", div_1, (e) => {
    var _a, _b, _c, _d;
    e.preventDefault();
    const src = (_a = e.currentTarget.closest(".pcr-nettree-items")) == null ? void 0 : _a.querySelector(".pcr-nettree-row--dragging");
    if (!src || ((_b = src._dragTree) == null ? void 0 : _b.node) === get(node)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const third = rect.height / 3;
    const position = y < third ? "before" : y > third * 2 ? "after" : "into";
    const sameParent = ((_c = src._dragParent) == null ? void 0 : _c.node) === ((_d = parentTree()) == null ? void 0 : _d.node);
    if (position === "after" && $$props.tree.hasChildren && !get(isCollapsed)) {
      onDragDrop()("reparent", src._dragTree, $$props.tree, src._dragParent, parentTree(), "first-child");
    } else if (position !== "into" && sameParent && !isRoot()) {
      onDragDrop()("reorder", src._dragTree, $$props.tree, src._dragParent, parentTree(), position);
    } else {
      onDragDrop()("reparent", src._dragTree, $$props.tree, src._dragParent, parentTree(), position);
    }
  });
  delegated("click", span, function(...$$args) {
    var _a;
    (_a = $$props.tree.hasChildren ? toggleCollapse : null) == null ? void 0 : _a.apply(this, $$args);
  });
  delegated("click", span_4, (e) => {
    e.stopPropagation();
    onToggleLock()(get(node));
  });
  delegated("click", span_5, (e) => {
    e.stopPropagation();
    onToggleDisable()(get(node));
  });
  append($$anchor, div);
  pop();
}
delegate(["pointerdown", "click", "contextmenu", "keydown"]);
function NetworkTree($$anchor, $$props) {
  let roots = prop($$props, "roots", 19, () => []), activeNodeId = prop($$props, "activeNodeId", 3, null), renamingNodeId = prop($$props, "renamingNodeId", 3, null), onSelectNode = prop($$props, "onSelectNode", 3, () => {
  }), onSetMode = prop($$props, "onSetMode", 3, () => {
  }), onToggleLock = prop($$props, "onToggleLock", 3, () => {
  }), onToggleDisable = prop($$props, "onToggleDisable", 3, () => {
  }), onContextMenu = prop($$props, "onContextMenu", 3, () => {
  }), onLabelClick = prop($$props, "onLabelClick", 3, () => {
  }), onWildcardClick = prop($$props, "onWildcardClick", 3, () => {
  }), onWildcardModeClick = prop($$props, "onWildcardModeClick", 3, () => {
  }), onDragDrop = prop($$props, "onDragDrop", 3, () => {
  }), onFinishRename = prop($$props, "onFinishRename", 3, () => {
  }), refreshTree = prop($$props, "refreshTree", 3, () => {
  });
  var fragment = comment();
  var node = first_child(fragment);
  each(node, 17, roots, index, ($$anchor2, tree) => {
    TreeNode_1($$anchor2, {
      get tree() {
        return get(tree);
      },
      get activeNodeId() {
        return activeNodeId();
      },
      get renamingNodeId() {
        return renamingNodeId();
      },
      get onSelectNode() {
        return onSelectNode();
      },
      get onSetMode() {
        return onSetMode();
      },
      get onToggleLock() {
        return onToggleLock();
      },
      get onToggleDisable() {
        return onToggleDisable();
      },
      get onContextMenu() {
        return onContextMenu();
      },
      get onLabelClick() {
        return onLabelClick();
      },
      get onWildcardClick() {
        return onWildcardClick();
      },
      get onWildcardModeClick() {
        return onWildcardModeClick();
      },
      get onDragDrop() {
        return onDragDrop();
      },
      get onFinishRename() {
        return onFinishRename();
      },
      get refreshTree() {
        return refreshTree();
      },
      isRoot: true,
      parentTree: null
    });
  });
  append($$anchor, fragment);
}
var root_1$3 = from_html(`<div><span class="pcr-fs-tab-title svelte-18o7ut9"> </span>  <span class="pcr-fs-tab-close svelte-18o7ut9"></span></div>`);
var root_2$3 = from_html(`<span class="pcr-fs-group-btn svelte-18o7ut9" title="Close group"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line></svg></span>`);
var root$3 = from_html(`<div><div class="pcr-fs-tabs svelte-18o7ut9"></div> <div class="pcr-fs-tabbar-actions svelte-18o7ut9"><!></div></div>`);
function TabBar($$anchor, $$props) {
  push($$props, true);
  let tabs = prop($$props, "tabs", 19, () => []), activeTab = prop($$props, "activeTab", 3, null), canClose = prop($$props, "canClose", 3, false), isExternalDrag = prop($$props, "isExternalDrag", 3, false), isFocused = prop($$props, "isFocused", 3, true), onSelect = prop($$props, "onSelect", 3, () => {
  }), onClose = prop($$props, "onClose", 3, () => {
  }), onReorder = prop($$props, "onReorder", 3, () => {
  }), onCloseGroup = prop($$props, "onCloseGroup", 3, () => {
  }), onDragStart = prop($$props, "onDragStart", 3, () => {
  }), onDragEnd = prop($$props, "onDragEnd", 3, () => {
  }), onExternalDrop = prop($$props, "onExternalDrop", 3, () => {
  });
  function isActive(tab, active) {
    if (!active || !tab) return false;
    if (tab === active) return true;
    if (tab.type === "wildcard") {
      return active.type === "wildcard" && tab.filename === active.filename;
    }
    return !!tab.node && tab.node === active.node;
  }
  function findDraggingEl() {
    return document.querySelector(".pcr-fs-tab-dragging");
  }
  var div = root$3();
  let classes;
  var div_1 = child(div);
  each(
    div_1,
    21,
    // Individual tabs handle their own drop-before/drop-after indicator
    // when the cursor is over them — only style the empty area past the
    // last tab here (shows drop-after on the last tab).
    // Only clear when the pointer exits the container entirely (not
    // when moving between children — that's handled by each tab).
    // Drop in the empty area past the last tab: append to end of this
    // pane's tab list. Works for both same-pane (reorder) and
    // cross-pane (move) — handleTabReorder detects which case it is.
    tabs,
    index,
    ($$anchor2, tab) => {
      var div_2 = root_1$3();
      let classes_1;
      set_attribute(div_2, "draggable", true);
      var span = child(div_2);
      var text2 = child(span);
      var span_1 = sibling(span, 2);
      span_1.textContent = "×";
      template_effect(
        ($0) => {
          classes_1 = set_class(div_2, 1, "pcr-fs-tab svelte-18o7ut9", null, classes_1, $0);
          set_text(text2, get(tab).title);
        },
        [
          () => {
            var _a, _b, _c, _d, _e, _f;
            return {
              "pcr-fs-tab-active": isActive(get(tab), activeTab()),
              "pcr-fs-tab--wildcard": get(tab).type === "wildcard",
              "pcr-fs-tab--locked": ((_b = (_a = get(tab).node) == null ? void 0 : _a._pcrShared) == null ? void 0 : _b.locked) && !((_d = (_c = get(tab).node) == null ? void 0 : _c._pcrShared) == null ? void 0 : _d.disabled),
              "pcr-fs-tab--disabled": !!((_f = (_e = get(tab).node) == null ? void 0 : _e._pcrShared) == null ? void 0 : _f.disabled)
            };
          }
        ]
      );
      delegated("click", div_2, () => onSelect()(get(tab)));
      event("auxclick", div_2, (e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose()(get(tab));
        }
      });
      event("dragstart", div_2, (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "");
        e.currentTarget.classList.add("pcr-fs-tab-dragging");
        e.currentTarget._dragTab = get(tab);
        onSelect()(get(tab));
        onDragStart()(get(tab));
      });
      event("dragend", div_2, (e) => {
        var _a;
        e.currentTarget.classList.remove("pcr-fs-tab-dragging");
        (_a = e.currentTarget.closest(".pcr-fs-tabs")) == null ? void 0 : _a.querySelectorAll(".pcr-fs-tab").forEach((t) => t.classList.remove("pcr-fs-tab-drop-before", "pcr-fs-tab-drop-after"));
        onDragEnd()();
        onSelect()(e.currentTarget._dragTab ?? get(tab));
      });
      event("dragover", div_2, (e) => {
        var _a;
        const src = findDraggingEl();
        if (!src || src._dragTab === get(tab)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        (_a = e.currentTarget.closest(".pcr-fs-tabs")) == null ? void 0 : _a.querySelectorAll(".pcr-fs-tab").forEach((t) => t.classList.remove("pcr-fs-tab-drop-before", "pcr-fs-tab-drop-after"));
        e.currentTarget.classList.add(before ? "pcr-fs-tab-drop-before" : "pcr-fs-tab-drop-after");
      });
      event("dragleave", div_2, (e) => {
        e.currentTarget.classList.remove("pcr-fs-tab-drop-before", "pcr-fs-tab-drop-after");
      });
      event("drop", div_2, (e) => {
        e.preventDefault();
        e.stopPropagation();
        const src = findDraggingEl();
        if (!src || src._dragTab === get(tab)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        onReorder()(src._dragTab, get(tab), before);
      });
      delegated("click", span_1, (e) => {
        e.stopPropagation();
        onClose()(get(tab));
      });
      append($$anchor2, div_2);
    }
  );
  var div_3 = sibling(div_1, 2);
  var node = child(div_3);
  {
    var consequent = ($$anchor2) => {
      var span_2 = root_2$3();
      delegated("click", span_2, (e) => {
        e.stopPropagation();
        onCloseGroup()();
      });
      append($$anchor2, span_2);
    };
    if_block(node, ($$render) => {
      if (canClose()) $$render(consequent);
    });
  }
  template_effect(() => classes = set_class(div, 1, "pcr-fs-tabbar svelte-18o7ut9", null, classes, { "pcr-fs-tabbar--unfocused": !isFocused() }));
  event("dragover", div_1, (e) => {
    const src = findDraggingEl();
    if (!src) return;
    if (e.target.closest(".pcr-fs-tab")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const allTabs = e.currentTarget.querySelectorAll(".pcr-fs-tab");
    allTabs.forEach((t) => t.classList.remove("pcr-fs-tab-drop-before", "pcr-fs-tab-drop-after"));
    const lastTab = allTabs[allTabs.length - 1];
    if (lastTab && lastTab !== src) {
      lastTab.classList.add("pcr-fs-tab-drop-after");
    }
  });
  event("dragleave", div_1, (e) => {
    if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
      e.currentTarget.querySelectorAll(".pcr-fs-tab").forEach((t) => t.classList.remove("pcr-fs-tab-drop-before", "pcr-fs-tab-drop-after"));
    }
  });
  event("drop", div_1, (e) => {
    const src = findDraggingEl();
    if (!src || !src._dragTab) return;
    e.preventDefault();
    e.currentTarget.querySelectorAll(".pcr-fs-tab").forEach((t) => t.classList.remove("pcr-fs-tab-drop-before", "pcr-fs-tab-drop-after"));
    if (isExternalDrag()) {
      onExternalDrop()();
      return;
    }
    if (tabs().length < 2) return;
    onReorder()(src._dragTab, tabs()[tabs().length - 1], false);
  });
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_1$2 = from_html(`<img draggable="false" alt="PromptChain" class="svelte-1qg492v"/>`);
var root$2 = from_html(`<div class="pcr-fs-welcome svelte-1qg492v"><!></div>`);
function WelcomePanel($$anchor, $$props) {
  let logoTextUrl = prop($$props, "logoTextUrl", 3, "");
  var div = root$2();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var img = root_1$2();
      template_effect(() => set_attribute(img, "src", logoTextUrl()));
      append($$anchor2, img);
    };
    if_block(node, ($$render) => {
      if (logoTextUrl()) $$render(consequent);
    });
  }
  append($$anchor, div);
}
var root_4$3 = from_html(`<div class="pcr-fs-wildcard-header svelte-1bace6d"><span class="pcr-fs-wildcard-header-name svelte-1bace6d"> </span> <span class="pcr-fs-wildcard-header-hint svelte-1bace6d">wildcard file</span></div>`);
var root_5$1 = from_html(`<div></div>`);
var root$1 = from_html(`<div><!> <div class="pcr-fs-group-body svelte-1bace6d"><!> <div><div class="pcr-fs-editor-pane-row svelte-1bace6d"><div class="pcr-fs-editor-main-col svelte-1bace6d"><!> <div class="pcr-fs-editor-body pcr-editor svelte-1bace6d"></div></div></div></div>  <div><!></div></div></div>`);
function EditorGroup($$anchor, $$props) {
  push($$props, true);
  let isFocused = prop($$props, "isFocused", 3, false), canClose = prop($$props, "canClose", 3, false), isDragActive = prop($$props, "isDragActive", 3, false), isExternalDrag = prop($$props, "isExternalDrag", 3, false), isDragFromSelf = prop($$props, "isDragFromSelf", 3, false), sourceSingleTab = prop($$props, "sourceSingleTab", 3, false);
  prop($$props, "treeRoots", 19, () => []);
  let logoTextUrl = prop($$props, "logoTextUrl", 3, ""), overlayEl = prop($$props, "overlayEl", 3, null), onFocus = prop($$props, "onFocus", 3, () => {
  }), onSelectTab = prop($$props, "onSelectTab", 3, () => {
  }), onCloseTab = prop($$props, "onCloseTab", 3, () => {
  }), onReorderTabs = prop($$props, "onReorderTabs", 3, () => {
  }), onTabDragStart = prop($$props, "onTabDragStart", 3, () => {
  }), onTabDragEnd = prop($$props, "onTabDragEnd", 3, () => {
  }), onCloseGroup = prop($$props, "onCloseGroup", 3, () => {
  }), onTabDrop = prop($$props, "onTabDrop", 3, () => {
  });
  const activeNode = user_derived(() => $$props.group.activeTab && $$props.group.activeTab.type !== "wildcard" ? $$props.group.activeTab.node : null);
  const showWelcome = user_derived(() => !$$props.group.activeTab);
  let mountEl;
  let activeZone = state(
    null
    // "center" | "top" | "right" | "bottom" | "left"
  );
  onMount(() => {
    var _a, _b;
    if (!overlayEl() || !mountEl) return;
    (_b = (_a = overlayEl())._pcrCreateEditorInGroup) == null ? void 0 : _b.call(_a, $$props.group.id, mountEl, $$props.group.activeTab);
    return () => {
      var _a2, _b2;
      return (_b2 = (_a2 = overlayEl()) == null ? void 0 : _a2._pcrDestroyEditorInGroup) == null ? void 0 : _b2.call(_a2, $$props.group.id);
    };
  });
  function zoneFromPointer(rect, x, y) {
    const relX = (x - rect.left) / rect.width;
    const relY = (y - rect.top) / rect.height;
    const distLeft = relX;
    const distRight = 1 - relX;
    const distTop = relY;
    const distBottom = 1 - relY;
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);
    if (minDist > 0.25) return "center";
    if (minDist === distRight) return "right";
    if (minDist === distBottom) return "bottom";
    if (minDist === distLeft) return "left";
    return "top";
  }
  function isZoneInvalid(zone) {
    if (!isDragFromSelf()) return false;
    if (sourceSingleTab()) return true;
    if (zone === "center") return true;
    return false;
  }
  function handleDragOver(e) {
    if (!isDragActive()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const zone = zoneFromPointer(rect, e.clientX, e.clientY);
    if (isZoneInvalid(zone)) {
      set(activeZone, null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    set(activeZone, zone, true);
  }
  function handleDragLeave() {
    set(activeZone, null);
  }
  function handleDrop(e) {
    if (!isDragActive()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const zone = zoneFromPointer(rect, e.clientX, e.clientY);
    if (isZoneInvalid(zone)) {
      set(activeZone, null);
      return;
    }
    e.preventDefault();
    set(activeZone, null);
    onTabDrop()($$props.group.id, zone);
  }
  var div = root$1();
  let classes;
  let styles;
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      TabBar($$anchor2, {
        get tabs() {
          return $$props.group.tabs;
        },
        get activeTab() {
          return $$props.group.activeTab;
        },
        get canClose() {
          return canClose();
        },
        get isExternalDrag() {
          return isExternalDrag();
        },
        get isFocused() {
          return isFocused();
        },
        onSelect: (tab) => onSelectTab()($$props.group.id, tab),
        onClose: (tab) => onCloseTab()($$props.group.id, tab),
        onReorder: (srcTab, targetTab, before) => onReorderTabs()($$props.group.id, srcTab, targetTab, before),
        onDragStart: (tab) => onTabDragStart()($$props.group.id, tab),
        onDragEnd: () => onTabDragEnd()(),
        onCloseGroup: () => onCloseGroup()($$props.group.id),
        onExternalDrop: () => onTabDrop()($$props.group.id, "center")
      });
    };
    if_block(node, ($$render) => {
      if ($$props.group.tabs.length > 0) $$render(consequent);
    });
  }
  var div_1 = sibling(node, 2);
  var node_1 = child(div_1);
  {
    var consequent_1 = ($$anchor2) => {
      WelcomePanel($$anchor2, {
        get logoTextUrl() {
          return logoTextUrl();
        }
      });
    };
    if_block(node_1, ($$render) => {
      if (get(showWelcome)) $$render(consequent_1);
    });
  }
  var div_2 = sibling(node_1, 2);
  let classes_1;
  let styles_1;
  var div_3 = child(div_2);
  var div_4 = child(div_3);
  var node_2 = child(div_4);
  {
    var consequent_2 = ($$anchor2) => {
      {
        let $0 = user_derived(() => get(activeNode)._pcrDocDropdownEl ?? null);
        Menubar($$anchor2, {
          get node() {
            return get(activeNode);
          },
          get shared() {
            return get(activeNode)._pcrShared;
          },
          inFullscreen: true,
          get docDropdownEl() {
            return get($0);
          },
          onSetMode: (mode, switchIndex) => {
            var _a, _b;
            return (_b = (_a = get(activeNode)._pcrMenubar) == null ? void 0 : _a.setMode) == null ? void 0 : _b.call(_a, mode, switchIndex);
          },
          onToggleLock: () => {
            var _a, _b;
            return (_b = (_a = get(activeNode)._pcrMenubar) == null ? void 0 : _a.toggleLock) == null ? void 0 : _b.call(_a);
          },
          onToggleDisable: () => {
            var _a, _b;
            return (_b = (_a = get(activeNode)._pcrMenubar) == null ? void 0 : _a.toggleDisable) == null ? void 0 : _b.call(_a);
          },
          onToggleOutput: () => {
            var _a, _b;
            return (_b = (_a = get(activeNode)._pcrMenubar) == null ? void 0 : _a.toggleOutput) == null ? void 0 : _b.call(_a);
          },
          onToggleImage: () => {
            var _a, _b;
            return (_b = (_a = get(activeNode)._pcrMenubar) == null ? void 0 : _a.toggleImage) == null ? void 0 : _b.call(_a);
          },
          onToggleAssistant: () => {
            var _a, _b;
            return (_b = (_a = get(activeNode)._pcrMenubar) == null ? void 0 : _a.toggleAssistant) == null ? void 0 : _b.call(_a);
          },
          onResetIterate: () => {
            var _a, _b;
            return (_b = (_a = get(activeNode)._pcrMenubar) == null ? void 0 : _a.resetIterate) == null ? void 0 : _b.call(_a);
          }
        });
      }
    };
    var consequent_3 = ($$anchor2) => {
      var div_5 = root_4$3();
      var span = child(div_5);
      var text2 = child(span);
      template_effect(() => set_text(text2, $$props.group.activeTab.title));
      append($$anchor2, div_5);
    };
    if_block(node_2, ($$render) => {
      var _a;
      if (get(activeNode) && get(activeNode)._pcrShared) $$render(consequent_2);
      else if (((_a = $$props.group.activeTab) == null ? void 0 : _a.type) === "wildcard") $$render(consequent_3, 1);
    });
  }
  var div_6 = sibling(node_2, 2);
  bind_this(div_6, ($$value) => mountEl = $$value, () => mountEl);
  var div_7 = sibling(div_2, 2);
  let classes_2;
  var node_3 = child(div_7);
  {
    var consequent_4 = ($$anchor2) => {
      var div_8 = root_5$1();
      let classes_3;
      template_effect(() => classes_3 = set_class(div_8, 1, "pcr-fs-drop-preview svelte-1bace6d", null, classes_3, {
        "pcr-fs-drop-preview--center": get(activeZone) === "center",
        "pcr-fs-drop-preview--right": get(activeZone) === "right",
        "pcr-fs-drop-preview--left": get(activeZone) === "left",
        "pcr-fs-drop-preview--top": get(activeZone) === "top",
        "pcr-fs-drop-preview--bottom": get(activeZone) === "bottom"
      }));
      append($$anchor2, div_8);
    };
    if_block(node_3, ($$render) => {
      if (get(activeZone)) $$render(consequent_4);
    });
  }
  template_effect(() => {
    var _a, _b, _c, _d, _e, _f;
    classes = set_class(div, 1, "pcr-fs-editor-column svelte-1bace6d", null, classes, { "pcr-fs-editor-column--focused": isFocused() });
    set_attribute(div, "data-group-id", $$props.group.id);
    styles = set_style(div, "", styles, { "flex-grow": $$props.group.flex ?? 1 });
    classes_1 = set_class(div_2, 1, "pcr-fs-editor-frame svelte-1bace6d", null, classes_1, {
      "pcr-fs-editor-frame--locked": ((_b = (_a = get(activeNode)) == null ? void 0 : _a._pcrShared) == null ? void 0 : _b.locked) && !((_d = (_c = get(activeNode)) == null ? void 0 : _c._pcrShared) == null ? void 0 : _d.disabled),
      "pcr-fs-editor-frame--disabled": !!((_f = (_e = get(activeNode)) == null ? void 0 : _e._pcrShared) == null ? void 0 : _f.disabled)
    });
    styles_1 = set_style(div_2, "", styles_1, { display: get(showWelcome) ? "none" : "" });
    classes_2 = set_class(div_7, 1, "pcr-fs-drop-overlay svelte-1bace6d", null, classes_2, { "pcr-fs-drop-overlay--active": isDragActive() });
  });
  delegated("pointerdown", div, () => onFocus()($$props.group.id));
  event("dragover", div_7, handleDragOver);
  event("dragleave", div_7, handleDragLeave);
  event("drop", div_7, handleDrop);
  append($$anchor, div);
  pop();
}
delegate(["pointerdown"]);
var root_4$2 = from_html(`<div></div>`);
var root_3$1 = from_html(`<!> <!>`, 1);
var root_2$2 = from_html(`<div></div>`);
function LayoutNode_1($$anchor, $$props) {
  push($$props, true);
  var fragment = comment();
  var node_1 = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      {
        let $0 = user_derived(() => $$props.node.id === $$props.focusedLeafId);
        let $1 = user_derived(() => $$props.leafCount > 1);
        let $2 = user_derived(() => !!$$props.draggingTab);
        let $3 = user_derived(() => !!$$props.draggingTab && $$props.draggingTab.groupId !== $$props.node.id);
        let $4 = user_derived(() => !!$$props.draggingTab && $$props.draggingTab.groupId === $$props.node.id);
        EditorGroup($$anchor2, {
          get group() {
            return $$props.node;
          },
          get overlayEl() {
            return $$props.overlayEl;
          },
          get isFocused() {
            return get($0);
          },
          get canClose() {
            return get($1);
          },
          get isDragActive() {
            return get($2);
          },
          get isExternalDrag() {
            return get($3);
          },
          get isDragFromSelf() {
            return get($4);
          },
          get sourceSingleTab() {
            return $$props.dragSourceSingleTab;
          },
          get treeRoots() {
            return $$props.treeRoots;
          },
          get logoTextUrl() {
            return $$props.logoTextUrl;
          },
          get onFocus() {
            return $$props.onFocus;
          },
          get onSelectTab() {
            return $$props.onSelectTab;
          },
          get onCloseTab() {
            return $$props.onCloseTab;
          },
          get onReorderTabs() {
            return $$props.onReorderTabs;
          },
          get onTabDragStart() {
            return $$props.onTabDragStart;
          },
          get onTabDragEnd() {
            return $$props.onTabDragEnd;
          },
          get onTabDrop() {
            return $$props.onTabDrop;
          },
          get onCloseGroup() {
            return $$props.onCloseGroup;
          }
        });
      }
    };
    var alternate = ($$anchor2) => {
      var div = root_2$2();
      let classes;
      let styles;
      each(div, 23, () => $$props.node.children, (child2) => child2.id, ($$anchor3, child2, i) => {
        var fragment_2 = root_3$1();
        var node_2 = first_child(fragment_2);
        {
          var consequent_1 = ($$anchor4) => {
            var div_1 = root_4$2();
            let classes_1;
            template_effect(() => classes_1 = set_class(div_1, 1, "pcr-fs-pane-splitter svelte-62gxmf", null, classes_1, {
              "pcr-fs-pane-splitter--vertical": $$props.node.direction === "column"
            }));
            delegated("pointerdown", div_1, (e) => $$props.onStartResize($$props.node, get(i) - 1, get(i), e));
            append($$anchor4, div_1);
          };
          if_block(node_2, ($$render) => {
            if (get(i) > 0) $$render(consequent_1);
          });
        }
        var node_3 = sibling(node_2, 2);
        LayoutNode_1(node_3, {
          get node() {
            return get(child2);
          },
          get overlayEl() {
            return $$props.overlayEl;
          },
          get focusedLeafId() {
            return $$props.focusedLeafId;
          },
          get draggingTab() {
            return $$props.draggingTab;
          },
          get dragSourceSingleTab() {
            return $$props.dragSourceSingleTab;
          },
          get treeRoots() {
            return $$props.treeRoots;
          },
          get logoTextUrl() {
            return $$props.logoTextUrl;
          },
          get leafCount() {
            return $$props.leafCount;
          },
          get onFocus() {
            return $$props.onFocus;
          },
          get onSelectTab() {
            return $$props.onSelectTab;
          },
          get onCloseTab() {
            return $$props.onCloseTab;
          },
          get onReorderTabs() {
            return $$props.onReorderTabs;
          },
          get onTabDragStart() {
            return $$props.onTabDragStart;
          },
          get onTabDragEnd() {
            return $$props.onTabDragEnd;
          },
          get onTabDrop() {
            return $$props.onTabDrop;
          },
          get onCloseGroup() {
            return $$props.onCloseGroup;
          },
          get onStartResize() {
            return $$props.onStartResize;
          }
        });
        append($$anchor3, fragment_2);
      });
      template_effect(() => {
        classes = set_class(div, 1, "pcr-fs-layout-container svelte-62gxmf", null, classes, {
          "pcr-fs-layout-container--column": $$props.node.direction === "column"
        });
        styles = set_style(div, "", styles, { "flex-grow": $$props.node.flex ?? 1 });
      });
      append($$anchor2, div);
    };
    if_block(node_1, ($$render) => {
      if ($$props.node.kind === "leaf") $$render(consequent);
      else $$render(alternate, -1);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate(["pointerdown"]);
var root_4$1 = from_html(`<div class="pcr-comfy-menu-sep svelte-1qqdbxt"></div>`);
var root_5 = from_html(`<button class="pcr-comfy-menu-item svelte-1qqdbxt"> </button>`);
var root_2$1 = from_html(`<div class="pcr-comfy-menu-backdrop svelte-1qqdbxt"></div> <div class="pcr-comfy-menu svelte-1qqdbxt"></div>`, 1);
var root_6 = from_html(`<div class="pcr-fs-sidebar-resize svelte-1qqdbxt"></div>`);
var root_1$1 = from_html(`<!> <div class="pcr-fs-body svelte-1qqdbxt"><div class="pcr-fs-sidebar svelte-1qqdbxt"><div class="pcr-activity-bar svelte-1qqdbxt"><span title="Menu"><svg width="20" height="20" viewBox="0 0 18 18" fill="currentColor"><path d="M14.8193 0.600586C15.1248 0.600586 15.3296 0.70893 15.459 0.881836C15.5914 1.05888 15.6471 1.33774 15.5527 1.66895L14.8037 4.30176C14.7063 4.64386 14.4729 4.97024 14.1641 5.21191C13.8544 5.45415 13.496 5.58984 13.1699 5.58984H13.1689L9.5791 5.59668H7.90625C7.52654 5.59668 7.19496 5.84986 7.09082 6.21289L5.69434 11.0889C5.63007 11.3133 5.66134 11.5534 5.77734 11.7529L5.83203 11.8359C5.99177 12.0491 6.24252 12.1758 6.50977 12.1758H6.51074L8.88281 12.1709H11.4971C11.7643 12.171 11.9541 12.254 12.084 12.3906L12.1357 12.4521C12.2685 12.6295 12.3249 12.9089 12.2305 13.2402L11.4805 15.8721C11.383 16.2144 11.1498 16.5415 10.8408 16.7832C10.5314 17.0252 10.1736 17.161 9.84766 17.1611H9.84668L6.25684 17.168H3.64258C3.33762 17.1679 3.13349 17.0588 3.00391 16.8857C2.87135 16.7087 2.81482 16.43 2.90918 16.0986L3.39551 14.3887C3.46841 14.1327 3.41794 13.8576 3.25879 13.6445V13.6436C3.09901 13.4303 2.84745 13.3037 2.58008 13.3037H1.18066C0.875088 13.3037 0.670398 13.1953 0.541016 13.0225C0.408483 12.8451 0.351891 12.5655 0.446289 12.2344L2.11914 6.38965L2.30371 5.74707V5.74609C2.40139 5.40341 2.63456 5.07671 2.94336 4.83496C3.25302 4.59258 3.61143 4.45705 3.9375 4.45703H5.6123C5.94484 4.45703 6.24083 4.26316 6.37891 3.9707L6.42773 3.83984L6.98145 1.89551C7.07894 1.55317 7.31212 1.22614 7.62109 0.984375C7.93074 0.742127 8.2892 0.606445 8.61523 0.606445H8.61621L12.1982 0.600586H14.8193Z"></path></svg></span>  <span data-view="edit" title="Edit"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 14v7M14 17.5h7"></path></svg></span>  <span data-view="switch" title="Switch"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6h13M6 12h13M6 18h13M1 6h.01M1 12h.01M1 18h.01"></path></svg></span> <!></div> <div class="pcr-fs-sidebar-content svelte-1qqdbxt"><div class="pcr-fs-sidebar-panel svelte-1qqdbxt" data-panel="edit"><div class="pcr-nettree-header svelte-1qqdbxt"><span class="pcr-nettree-header-label svelte-1qqdbxt">Network</span> <div class="pcr-nettree-header-actions svelte-1qqdbxt"><span class="pcr-nettree-header-btn svelte-1qqdbxt" title="Add node">+</span>  <span class="pcr-nettree-header-btn svelte-1qqdbxt" title="Refresh tree"></span></div></div> <div class="pcr-nettree-items svelte-1qqdbxt"><!></div></div> <div class="pcr-fs-sidebar-panel svelte-1qqdbxt" data-panel="switch"><div class="pcr-nettree-header svelte-1qqdbxt"><span class="pcr-nettree-header-label svelte-1qqdbxt">Switches</span></div> <div class="pcr-switch-items svelte-1qqdbxt"></div></div></div></div> <!> <div class="pcr-fs-main svelte-1qqdbxt"><div class="pcr-fs-editor-area svelte-1qqdbxt"><div class="pcr-fs-content-row svelte-1qqdbxt"><!></div></div></div></div> <div class="pcr-fs-footer-slot svelte-1qqdbxt"></div>`, 1);
function FullscreenEditor($$anchor, $$props) {
  var _a, _b, _c, _d;
  push($$props, true);
  let fsState = prop($$props, "fsState", 7), overlayEl = prop($$props, "overlayEl", 7, null), refreshTree = prop($$props, "refreshTree", 3, () => {
  }), entryNodeId = prop($$props, "entryNodeId", 3, null), onAddNode = prop($$props, "onAddNode", 3, () => {
  }), onSelectNode = prop($$props, "onSelectNode", 3, () => {
  }), onSetMode = prop($$props, "onSetMode", 3, () => {
  }), onToggleLock = prop($$props, "onToggleLock", 3, () => {
  }), onToggleDisable = prop($$props, "onToggleDisable", 3, () => {
  }), onContextMenu = prop($$props, "onContextMenu", 3, () => {
  }), onEmptyContextMenu = prop($$props, "onEmptyContextMenu", 3, () => {
  }), onLabelClick = prop($$props, "onLabelClick", 3, () => {
  }), onWildcardClick = prop($$props, "onWildcardClick", 3, () => {
  }), onWildcardModeClick = prop($$props, "onWildcardModeClick", 3, () => {
  }), onDragDrop = prop($$props, "onDragDrop", 3, () => {
  }), onFinishRename = prop($$props, "onFinishRename", 3, () => {
  }), onClose = prop($$props, "onClose", 3, () => {
  }), onQueuePrompt = prop($$props, "onQueuePrompt", 3, () => {
  }), onCancelExecution = prop($$props, "onCancelExecution", 3, () => {
  }), onSaveWorkflow = prop($$props, "onSaveWorkflow", 3, () => {
  }), logoUrl = prop($$props, "logoUrl", 3, ""), logoTextUrl = prop($$props, "logoTextUrl", 3, ""), workflowName = prop($$props, "workflowName", 3, "Workflow"), onComfyCommand = prop($$props, "onComfyCommand", 3, () => {
  });
  let liveWorkflowName = state(proxy(workflowName()));
  let sidebarWidth = state(250);
  let activeView = state(proxy(((_a = fsState()) == null ? void 0 : _a.initialSidebarView) ?? "edit"));
  let sidebarCollapsed = state(!!((_b = fsState()) == null ? void 0 : _b.initialSidebarCollapsed));
  let comfyMenuOpen = state(false);
  let comfyIconEl;
  let comfyMenuPos = state(proxy({ left: 0, top: 0 }));
  function toggleComfyMenu() {
    if (!get(comfyMenuOpen) && comfyIconEl) {
      const r = comfyIconEl.getBoundingClientRect();
      set(comfyMenuPos, { left: r.right + 4, top: r.top }, true);
    }
    set(comfyMenuOpen, !get(comfyMenuOpen));
  }
  const COMFY_MENU_ITEMS = [
    { label: "New", command: "Comfy.NewBlankWorkflow" },
    { sep: true },
    { label: "Open…", command: "Comfy.OpenWorkflow" },
    { label: "Save", command: "Comfy.SaveWorkflow" },
    { label: "Save As…", command: "Comfy.SaveWorkflowAs" },
    { label: "Export", command: "Comfy.ExportWorkflow" },
    { label: "Export (API)", command: "Comfy.ExportWorkflowAPI" },
    { sep: true },
    { label: "Settings", command: "Comfy.ShowSettingsDialog" }
  ];
  function runComfyCommand(commandId) {
    set(comfyMenuOpen, false);
    onComfyCommand()(commandId);
  }
  function findEntryTab() {
    var _a2;
    const roots = ((_a2 = fsState()) == null ? void 0 : _a2.treeRoots) || [];
    if (!roots.length) return null;
    if (entryNodeId()) {
      let findInTree = function(tree, visited) {
        if (visited.has(tree)) return null;
        visited.add(tree);
        if (tree.node.id === entryNodeId()) return { node: tree.node, title: tree.title };
        for (const child2 of tree.children) {
          const found = findInTree(child2, visited);
          if (found) return found;
        }
        return null;
      };
      for (const root2 of roots) {
        const found = findInTree(root2, /* @__PURE__ */ new Set());
        if (found) return found;
      }
    }
    return { node: roots[0].node, title: roots[0].title };
  }
  const initialTab = findEntryTab();
  let nextGroupId = 1;
  function hydrateLayoutNode(raw) {
    if (!raw) return null;
    if (raw.kind === "container") {
      const children = (raw.children || []).map(hydrateLayoutNode).filter(Boolean);
      if (children.length === 0) return null;
      return {
        kind: "container",
        id: nextGroupId++,
        direction: raw.direction === "column" ? "column" : "row",
        flex: typeof raw.flex === "number" && raw.flex > 0 ? raw.flex : 1,
        children
      };
    }
    const tabs = [...raw.tabs || []];
    if (tabs.length === 0) return null;
    return {
      kind: "leaf",
      id: nextGroupId++,
      tabs,
      activeTab: tabs[raw.activeTabIdx] ?? tabs[0] ?? null,
      flex: typeof raw.flex === "number" && raw.flex > 0 ? raw.flex : 1
    };
  }
  function buildInitialLayout() {
    var _a2, _b2;
    const savedTree = (_a2 = fsState()) == null ? void 0 : _a2.initialLayout;
    if (savedTree) {
      const hydrated = hydrateLayoutNode(savedTree);
      if (hydrated) {
        if (hydrated.kind === "container") return hydrated;
        return {
          kind: "container",
          id: nextGroupId++,
          direction: "row",
          flex: 1,
          children: [hydrated]
        };
      }
    }
    const legacyFlat = (_b2 = fsState()) == null ? void 0 : _b2.initialGroups;
    if (legacyFlat && legacyFlat.length > 0) {
      return {
        kind: "container",
        id: nextGroupId++,
        direction: "row",
        flex: 1,
        children: legacyFlat.map((sg) => {
          const tabs = [...sg.tabs];
          return {
            kind: "leaf",
            id: nextGroupId++,
            tabs,
            activeTab: tabs[sg.activeTabIdx] ?? tabs[0] ?? null,
            flex: typeof sg.flex === "number" && sg.flex > 0 ? sg.flex : 1
          };
        })
      };
    }
    return {
      kind: "container",
      id: nextGroupId++,
      direction: "row",
      flex: 1,
      children: [
        {
          kind: "leaf",
          id: nextGroupId++,
          tabs: initialTab ? [initialTab] : [],
          activeTab: initialTab,
          flex: 1
        }
      ]
    };
  }
  let rootLayout = state(proxy(buildInitialLayout()));
  function allLeaves(node) {
    if (!node) return [];
    if (node.kind === "leaf") return [node];
    return node.children.flatMap(allLeaves);
  }
  function findLeaf(id, node = get(rootLayout)) {
    if (!node) return null;
    if (node.kind === "leaf") return node.id === id ? node : null;
    for (const c of node.children) {
      const f = findLeaf(id, c);
      if (f) return f;
    }
    return null;
  }
  function findFirstLeaf(node = get(rootLayout)) {
    if (!node) return null;
    if (node.kind === "leaf") return node;
    for (const c of node.children) {
      const f = findFirstLeaf(c);
      if (f) return f;
    }
    return null;
  }
  function findParentContainer(childId, current = get(rootLayout)) {
    if (!current || current.kind === "leaf") return null;
    for (const c of current.children) {
      if (c.id === childId) return current;
      if (c.kind === "container") {
        const res = findParentContainer(childId, c);
        if (res) return res;
      }
    }
    return null;
  }
  const initialFocusedLeafId = (() => {
    var _a2, _b2, _c2;
    const saved = (_a2 = fsState()) == null ? void 0 : _a2.initialFocusedLeafId;
    if (saved != null && findLeaf(saved)) return saved;
    if (typeof ((_b2 = fsState()) == null ? void 0 : _b2.initialFocusedGroupIdx) === "number") {
      const leaves = allLeaves(get(rootLayout));
      const idx = Math.max(0, Math.min(leaves.length - 1, fsState().initialFocusedGroupIdx));
      if (leaves[idx]) return leaves[idx].id;
    }
    return (_c2 = findFirstLeaf(get(rootLayout))) == null ? void 0 : _c2.id;
  })();
  let focusedGroupId = state(proxy(initialFocusedLeafId));
  if ((initialTab == null ? void 0 : initialTab.node) && entryNodeId()) {
    let targetLeaf = null;
    let entryTab = null;
    for (const leaf of allLeaves(get(rootLayout))) {
      const found = leaf.tabs.find((t) => t.node && t.node.id === entryNodeId());
      if (found) {
        targetLeaf = leaf;
        entryTab = found;
        break;
      }
    }
    if (!targetLeaf) {
      targetLeaf = findLeaf(initialFocusedLeafId) || findFirstLeaf(get(rootLayout));
      if (targetLeaf) {
        targetLeaf.tabs = [...targetLeaf.tabs, initialTab];
        entryTab = targetLeaf.tabs[targetLeaf.tabs.length - 1];
      }
    }
    if (targetLeaf && entryTab) {
      targetLeaf.activeTab = entryTab;
      set(focusedGroupId, targetLeaf.id, true);
    }
  }
  let draggingTab = state(null);
  const dragSourceSingleTab = user_derived(() => {
    if (!get(draggingTab)) return false;
    const srcL = findLeaf(get(draggingTab).groupId);
    return !!srcL && srcL.tabs.length <= 1;
  });
  let initialSelectionDone = !!initialTab || !!((_c = fsState()) == null ? void 0 : _c.initialLayout) || !!((_d = fsState()) == null ? void 0 : _d.initialGroups);
  const focusedGroup = user_derived(() => findLeaf(get(focusedGroupId)) || findFirstLeaf(get(rootLayout)));
  const activeTab = user_derived(() => {
    var _a2;
    return ((_a2 = get(focusedGroup)) == null ? void 0 : _a2.activeTab) ?? null;
  });
  const activeNode = user_derived(() => get(activeTab) && get(activeTab).type !== "wildcard" ? get(activeTab).node : null);
  const leafCount = user_derived(() => allLeaves(get(rootLayout)).length);
  function clickActivityIcon(view) {
    var _a2, _b2;
    if (get(sidebarCollapsed)) {
      set(sidebarCollapsed, false);
      set(activeView, view, true);
    } else if (get(activeView) === view) {
      set(sidebarCollapsed, true);
    } else {
      set(activeView, view, true);
    }
    if (!get(sidebarCollapsed) && view === "switch") (_b2 = (_a2 = overlayEl()) == null ? void 0 : _a2._pcrRefreshSwitchPanel) == null ? void 0 : _b2.call(_a2);
  }
  function setFocusedGroup(groupId) {
    var _a2, _b2;
    set(focusedGroupId, groupId, true);
    (_b2 = (_a2 = overlayEl()) == null ? void 0 : _a2._pcrSetFocusedGroup) == null ? void 0 : _b2.call(_a2, groupId);
  }
  function selectTreeNode(treeNode, scrollToWildcard) {
    if (!(treeNode == null ? void 0 : treeNode.node)) return;
    for (const g of allLeaves(get(rootLayout))) {
      const existing = g.tabs.find((t) => t.node === treeNode.node);
      if (existing) {
        setFocusedGroup(g.id);
        g.activeTab = g.tabs.find((t) => t.node === treeNode.node) || null;
        set(rootLayout, { ...get(rootLayout) }, true);
        onSelectNode()(treeNode, scrollToWildcard);
        return;
      }
    }
    const leaf = get(focusedGroup);
    if (!leaf) return;
    onSelectNode()(treeNode, scrollToWildcard);
    if (!leaf.tabs.find((t) => t.node === treeNode.node)) {
      leaf.tabs = [...leaf.tabs, { node: treeNode.node, title: treeNode.title }];
    }
    leaf.activeTab = leaf.tabs.find((t) => t.node === treeNode.node) || null;
    set(rootLayout, { ...get(rootLayout) }, true);
  }
  function handleTabSelect(groupId, tab) {
    const leaf = findLeaf(groupId);
    if (!leaf) return;
    if (!leaf.tabs.find((t) => sameTab(t, tab))) return;
    setFocusedGroup(groupId);
    leaf.activeTab = tab;
    set(rootLayout, { ...get(rootLayout) }, true);
    if (tab.type === "wildcard") {
      onWildcardClick()(tab.wildcardName);
    } else if (tab.node) {
      onSelectNode()({ node: tab.node, title: tab.title });
    }
  }
  function sameTab(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.type === "wildcard") {
      return b.type === "wildcard" && a.filename === b.filename;
    }
    return !!a.node && a.node === b.node;
  }
  function handleTabClose(groupId, tab) {
    var _a2, _b2, _c2, _d2;
    const leaf = findLeaf(groupId);
    if (!leaf) return;
    if (tab.type === "wildcard") (_b2 = (_a2 = overlayEl()) == null ? void 0 : _a2._pcrFlushWildcard) == null ? void 0 : _b2.call(_a2, tab.wildcardName);
    leaf.tabs = leaf.tabs.filter((t) => !sameTab(t, tab));
    if (sameTab(tab, leaf.activeTab)) {
      if (leaf.tabs.length > 0) {
        handleTabSelect(groupId, leaf.tabs[leaf.tabs.length - 1]);
        return;
      }
      leaf.activeTab = null;
      if (groupId === get(focusedGroupId)) (_d2 = (_c2 = overlayEl()) == null ? void 0 : _c2._pcrClearWildcard) == null ? void 0 : _d2.call(_c2);
    }
    set(rootLayout, { ...get(rootLayout) }, true);
    if (leaf.tabs.length === 0 && get(leafCount) > 1) {
      closeGroup(groupId);
    }
  }
  function handleTabReorder(groupId, srcTab, targetTab, before) {
    var _a2, _b2;
    const targetLeaf = findLeaf(groupId);
    if (!targetLeaf) return;
    const srcLeaf = allLeaves(get(rootLayout)).find((l) => l.tabs.some((t) => sameTab(t, srcTab)));
    if (!srcLeaf) return;
    const srcTabData = srcLeaf.tabs.find((t) => sameTab(t, srcTab));
    if (!srcTabData) return;
    if (srcLeaf.id === targetLeaf.id) {
      const filtered = targetLeaf.tabs.filter((t) => !sameTab(t, srcTab));
      const targetIdx2 = filtered.findIndex((t) => sameTab(t, targetTab));
      if (targetIdx2 < 0) return;
      filtered.splice(before ? targetIdx2 : targetIdx2 + 1, 0, srcTabData);
      targetLeaf.tabs = filtered;
      set(rootLayout, { ...get(rootLayout) }, true);
      return;
    }
    set(draggingTab, null);
    const srcWasActive = sameTab(srcLeaf.activeTab, srcTab);
    srcLeaf.tabs = srcLeaf.tabs.filter((t) => !sameTab(t, srcTab));
    if (srcWasActive) {
      srcLeaf.activeTab = srcLeaf.tabs[srcLeaf.tabs.length - 1] || null;
    }
    const targetIdx = targetLeaf.tabs.findIndex((t) => sameTab(t, targetTab));
    if (targetIdx < 0) return;
    const insertAt = before ? targetIdx : targetIdx + 1;
    targetLeaf.tabs = [
      ...targetLeaf.tabs.slice(0, insertAt),
      srcTabData,
      ...targetLeaf.tabs.slice(insertAt)
    ];
    targetLeaf.activeTab = srcTabData;
    setFocusedGroup(groupId);
    set(rootLayout, { ...get(rootLayout) }, true);
    if (srcWasActive) (_b2 = (_a2 = overlayEl()) == null ? void 0 : _a2._pcrLoadTabInGroup) == null ? void 0 : _b2.call(_a2, srcLeaf.id, srcLeaf.activeTab);
    if (srcTabData.type === "wildcard") onWildcardClick()(srcTabData.wildcardName);
    else if (srcTabData.node) onSelectNode()({ node: srcTabData.node, title: srcTabData.title });
    if (srcLeaf.tabs.length === 0 && get(leafCount) > 1) closeGroup(srcLeaf.id);
  }
  function splitLeafInsert(targetLeafId, direction, before, newLeaf) {
    const parent = findParentContainer(targetLeafId);
    if (!parent) return false;
    const idx = parent.children.findIndex((c) => c.kind === "leaf" && c.id === targetLeafId);
    if (idx < 0) return false;
    if (parent.direction === direction) {
      parent.children.splice(before ? idx : idx + 1, 0, newLeaf);
    } else {
      const targetLeaf = parent.children[idx];
      const prevFlex = targetLeaf.flex ?? 1;
      targetLeaf.flex = 1;
      const newContainer = {
        kind: "container",
        id: nextGroupId++,
        direction,
        flex: prevFlex,
        children: before ? [newLeaf, targetLeaf] : [targetLeaf, newLeaf]
      };
      parent.children.splice(idx, 1, newContainer);
    }
    set(rootLayout, { ...get(rootLayout) }, true);
    return true;
  }
  function collapseUp(container) {
    if (!container || container === get(rootLayout)) {
      if (container === get(rootLayout) && container.children.length === 0) {
        container.children.push({
          kind: "leaf",
          id: nextGroupId++,
          tabs: [],
          activeTab: null,
          flex: 1
        });
      }
      return;
    }
    if (container.children.length === 1) {
      const parent = findParentContainer(container.id);
      if (!parent) return;
      const pIdx = parent.children.findIndex((c) => c.id === container.id);
      if (pIdx < 0) return;
      const sole = container.children[0];
      sole.flex = container.flex ?? 1;
      parent.children.splice(pIdx, 1, sole);
      collapseUp(parent);
    } else if (container.children.length === 0) {
      const parent = findParentContainer(container.id);
      if (!parent) return;
      parent.children = parent.children.filter((c) => c.id !== container.id);
      collapseUp(parent);
    }
  }
  function closeGroup(groupId) {
    var _a2, _b2, _c2;
    if (get(
      leafCount
      // never close the last pane
    ) <= 1) return;
    const leaf = findLeaf(groupId);
    if (!leaf) return;
    if (((_a2 = leaf.activeTab) == null ? void 0 : _a2.type) === "wildcard") {
      (_c2 = (_b2 = overlayEl()) == null ? void 0 : _b2._pcrFlushWildcard) == null ? void 0 : _c2.call(_b2, leaf.activeTab.wildcardName);
    }
    const parent = findParentContainer(groupId);
    if (!parent) return;
    parent.children = parent.children.filter((c) => !(c.kind === "leaf" && c.id === groupId));
    collapseUp(parent);
    set(rootLayout, { ...get(rootLayout) }, true);
    if (get(focusedGroupId) === groupId) {
      const first = findFirstLeaf(get(rootLayout));
      if (first) {
        set(focusedGroupId, first.id, true);
        queueMicrotask(() => {
          var _a3, _b3;
          return (_b3 = (_a3 = overlayEl()) == null ? void 0 : _a3._pcrSetFocusedGroup) == null ? void 0 : _b3.call(_a3, get(focusedGroupId));
        });
      }
    }
  }
  function startResize(parent, leftIdx, rightIdx, e) {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const parentEl = handle.parentElement;
    const rect = parentEl.getBoundingClientRect();
    const isRow = parent.direction === "row";
    const parentExtent = isRow ? rect.width : rect.height;
    const start = isRow ? e.clientX : e.clientY;
    const leftChild = parent.children[leftIdx];
    const rightChild = parent.children[rightIdx];
    if (!leftChild || !rightChild) return;
    const leftStartFlex = leftChild.flex ?? 1;
    const rightStartFlex = rightChild.flex ?? 1;
    const totalFlex = parent.children.reduce((s, c) => s + (c.flex ?? 1), 0);
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = isRow ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    const MIN = 0.1;
    const onMove = (ev) => {
      const current = isRow ? ev.clientX : ev.clientY;
      const deltaFlex = (current - start) / parentExtent * totalFlex;
      let newLeft = leftStartFlex + deltaFlex;
      let newRight = rightStartFlex - deltaFlex;
      if (newLeft < MIN) {
        newRight -= MIN - newLeft;
        newLeft = MIN;
      }
      if (newRight < MIN) {
        newLeft -= MIN - newRight;
        newRight = MIN;
      }
      leftChild.flex = newLeft;
      rightChild.flex = newRight;
      set(rootLayout, { ...get(rootLayout) }, true);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }
  function handleTabDragStart(groupId, tab) {
    set(draggingTab, { groupId, tab }, true);
  }
  function handleTabDragEnd() {
    set(draggingTab, null);
  }
  function handleTabDrop(targetGroupId, zone) {
    var _a2, _b2, _c2, _d2;
    const src = get(draggingTab);
    set(draggingTab, null);
    if (!src) return;
    const srcLeaf = findLeaf(src.groupId);
    const targetLeaf = findLeaf(targetGroupId);
    if (!srcLeaf || !targetLeaf) return;
    if (srcLeaf === targetLeaf && srcLeaf.tabs.length <= 1) return;
    if (zone === "center" && srcLeaf === targetLeaf) return;
    const srcTab = srcLeaf.tabs.find((t) => sameTab(t, src.tab));
    if (!srcTab) return;
    const srcWasActive = sameTab(srcLeaf.activeTab, src.tab);
    if (zone === "center") {
      srcLeaf.tabs = srcLeaf.tabs.filter((t) => !sameTab(t, src.tab));
      if (srcWasActive) {
        srcLeaf.activeTab = srcLeaf.tabs[srcLeaf.tabs.length - 1] || null;
      }
      let moved = targetLeaf.tabs.find((t) => sameTab(t, src.tab));
      if (!moved) {
        targetLeaf.tabs = [...targetLeaf.tabs, srcTab];
        moved = targetLeaf.tabs[targetLeaf.tabs.length - 1];
      }
      targetLeaf.activeTab = moved;
      setFocusedGroup(targetGroupId);
      set(rootLayout, { ...get(rootLayout) }, true);
      if (srcWasActive) (_b2 = (_a2 = overlayEl()) == null ? void 0 : _a2._pcrLoadTabInGroup) == null ? void 0 : _b2.call(_a2, srcLeaf.id, srcLeaf.activeTab);
      if (srcTab.type === "wildcard") onWildcardClick()(srcTab.wildcardName);
      else if (srcTab.node) onSelectNode()({ node: srcTab.node, title: srcTab.title });
      if (srcLeaf.tabs.length === 0 && get(leafCount) > 1) closeGroup(srcLeaf.id);
      return;
    }
    const direction = zone === "left" || zone === "right" ? "row" : "column";
    const before = zone === "left" || zone === "top";
    srcLeaf.tabs = srcLeaf.tabs.filter((t) => !sameTab(t, src.tab));
    if (srcWasActive) {
      srcLeaf.activeTab = srcLeaf.tabs[srcLeaf.tabs.length - 1] || null;
    }
    const newLeaf = {
      kind: "leaf",
      id: nextGroupId++,
      tabs: [srcTab],
      activeTab: srcTab,
      flex: 1
    };
    if (!splitLeafInsert(targetGroupId, direction, before, newLeaf)) return;
    set(focusedGroupId, newLeaf.id, true);
    if (srcWasActive) (_d2 = (_c2 = overlayEl()) == null ? void 0 : _c2._pcrLoadTabInGroup) == null ? void 0 : _d2.call(_c2, srcLeaf.id, srcLeaf.activeTab);
    queueMicrotask(() => {
      var _a3, _b3;
      return (_b3 = (_a3 = overlayEl()) == null ? void 0 : _a3._pcrSetFocusedGroup) == null ? void 0 : _b3.call(_a3, newLeaf.id);
    });
    queueMicrotask(() => {
      if (srcTab.type === "wildcard") onWildcardClick()(srcTab.wildcardName);
      else if (srcTab.node) onSelectNode()({ node: srcTab.node, title: srcTab.title });
    });
    if (srcLeaf.tabs.length === 0 && get(leafCount) > 1) closeGroup(srcLeaf.id);
  }
  user_effect(() => {
    if (initialSelectionDone) return;
    if (fsState().treeRoots.length > 0) {
      initialSelectionDone = true;
      let target = null;
      if (entryNodeId()) {
        let findInTree = function(tree, visited) {
          if (visited.has(tree)) return null;
          visited.add(tree);
          if (tree.node.id === entryNodeId()) return tree;
          for (const child2 of tree.children) {
            const found = findInTree(child2, visited);
            if (found) return found;
          }
          return null;
        };
        for (const root2 of fsState().treeRoots) {
          target = findInTree(root2, /* @__PURE__ */ new Set());
          if (target) break;
        }
      }
      if (!target) target = fsState().treeRoots[0];
      if (target == null ? void 0 : target.node) selectTreeNode(target);
    }
  });
  function stopProp(e) {
    e.stopPropagation();
  }
  onMount(() => {
    if (!overlayEl()) return;
    overlayEl()._pcrAddWildcardTab = (wildcardName, filename) => {
      const leaf = get(focusedGroup);
      if (!leaf) return;
      if (!leaf.tabs.find((t) => t.type === "wildcard" && t.filename === filename)) {
        leaf.tabs = [
          ...leaf.tabs,
          {
            node: null,
            title: filename,
            type: "wildcard",
            wildcardName,
            filename
          }
        ];
      }
      leaf.activeTab = leaf.tabs.find((t) => t.type === "wildcard" && t.filename === filename) || null;
      set(rootLayout, { ...get(rootLayout) }, true);
    };
    overlayEl()._pcrHideWelcome = () => {
    };
    overlayEl()._pcrShowWelcome = () => {
      const leaf = get(focusedGroup);
      if (leaf) {
        leaf.activeTab = null;
        set(rootLayout, { ...get(rootLayout) }, true);
      }
    };
    overlayEl()._pcrUpdateWorkflowName = (name) => {
      set(liveWorkflowName, name || "Workflow", true);
    };
    overlayEl()._pcrUpdateTabTitle = (nodeId, newTitle) => {
      let changed = false;
      for (const g of allLeaves(get(rootLayout))) {
        const tab = g.tabs.find((t) => {
          var _a2;
          return ((_a2 = t.node) == null ? void 0 : _a2.id) === nodeId;
        });
        if (tab) {
          tab.title = newTitle;
          changed = true;
        }
      }
      if (changed) set(rootLayout, { ...get(rootLayout) }, true);
    };
    overlayEl()._pcrCloseWildcardTab = (filename) => {
      for (const g of allLeaves(get(rootLayout))) {
        const tab = g.tabs.find((t) => t.type === "wildcard" && t.filename === filename);
        if (tab) {
          handleTabClose(g.id, tab);
          return;
        }
      }
    };
    overlayEl()._pcrGetActiveWildcardTab = () => {
      var _a2, _b2;
      return ((_b2 = (_a2 = get(focusedGroup)) == null ? void 0 : _a2.activeTab) == null ? void 0 : _b2.type) === "wildcard" ? get(focusedGroup).activeTab : null;
    };
    overlayEl()._pcrNotifyFocusChange = (groupId) => {
      if (get(focusedGroupId) !== groupId) set(focusedGroupId, groupId, true);
    };
    overlayEl()._pcrGetSidebarState = () => ({ collapsed: get(sidebarCollapsed), view: get(activeView) });
    overlayEl()._pcrGetFsGroups = () => ({
      root: serializeLayoutNode(get(rootLayout)),
      focusedLeafId: get(focusedGroupId)
    });
  });
  function serializeLayoutNode(node) {
    if (!node) return null;
    if (node.kind === "container") {
      return {
        kind: "container",
        direction: node.direction,
        flex: node.flex,
        children: node.children.map(serializeLayoutNode).filter(Boolean)
      };
    }
    return {
      kind: "leaf",
      flex: node.flex,
      tabs: node.tabs.map((t) => {
        var _a2;
        return t.type === "wildcard" ? {
          kind: "wildcard",
          wildcardName: t.wildcardName,
          filename: t.filename,
          title: t.title
        } : { kind: "node", nodeId: (_a2 = t.node) == null ? void 0 : _a2.id, title: t.title };
      }),
      activeTabIdx: node.activeTab ? node.tabs.findIndex((t) => sameTab(t, node.activeTab)) : -1
    };
  }
  onMount(() => {
    if (!overlayEl()) return;
    function handleKeydown(e) {
      var _a2, _b2, _c2, _d2, _e, _f, _g, _h, _i;
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        onClose()();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onSaveWorkflow()();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (e.target.closest(".cm-editor")) return;
        e.preventDefault();
        if (e.altKey) {
          (_d2 = (_c2 = (_b2 = (_a2 = window.app) == null ? void 0 : _a2.extensionManager) == null ? void 0 : _b2.command) == null ? void 0 : _c2.execute) == null ? void 0 : _d2.call(_c2, "Comfy.Interrupt");
        } else if (e.shiftKey) {
          (_h = (_g = (_f = (_e = window.app) == null ? void 0 : _e.extensionManager) == null ? void 0 : _f.command) == null ? void 0 : _g.execute) == null ? void 0 : _h.call(_g, "Comfy.QueuePromptFront");
        } else {
          onQueuePrompt()(1);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        (_i = overlayEl().querySelector('[title="Toggle output panel"]')) == null ? void 0 : _i.click();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (get(activeTab)) handleTabClose(get(focusedGroupId), get(activeTab));
      }
      if (e.key === "F2" && get(activeNode)) {
        e.preventDefault();
        fsState().renamingNodeId = get(activeNode).id;
      }
    }
    overlayEl().addEventListener("keydown", handleKeydown);
    function captureSave(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
      }
    }
    document.addEventListener("keydown", captureSave, true);
    return () => {
      var _a2;
      (_a2 = overlayEl()) == null ? void 0 : _a2.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("keydown", captureSave, true);
    };
  });
  onMount(() => {
    if (!overlayEl()) return;
    const stopPropEvents = [
      "keyup",
      "keypress",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "pointerup",
      "copy",
      "paste",
      "cut"
    ];
    for (const evt of stopPropEvents) {
      overlayEl().addEventListener(evt, stopProp);
    }
    function handlePointerDown(e) {
      var _a2, _b2;
      e.stopPropagation();
      if (e.target.closest(".pcr-nettree-indicator")) return;
      (_b2 = (_a2 = overlayEl())._pcrClosePopup) == null ? void 0 : _b2.call(_a2);
    }
    overlayEl().addEventListener("pointerdown", handlePointerDown);
    function handleMouseDown(e) {
      const editorEl = overlayEl().querySelector(".pcr-fs-editor-body .cm-editor");
      if (editorEl && !editorEl.contains(e.target) && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" && !e.target.closest("[draggable]") && !e.target.closest(".pcr-nettree-indicator") && !e.target.closest(".pcr-output-panel-content") && !e.target.closest(".pcr-ai-panel") && // The docked 3D Poser manages its own pointer events and hosts native
      // <select>s (hand presets) — preventDefault here would block them from
      // opening. Let it behave natively, same as in node view.
      !e.target.closest(".pcr-pose-panel")) {
        e.preventDefault();
      }
    }
    overlayEl().addEventListener("mousedown", handleMouseDown);
    function handleWheel(e) {
      var _a2, _b2, _c2, _d2, _e;
      e.stopPropagation();
      const imagePanel = e.target.closest(".pcr-image-panel");
      if (imagePanel) {
        e.preventDefault();
        const rect = imagePanel.getBoundingClientRect();
        imagePanel.dispatchEvent(new CustomEvent("pcr-zoom", {
          detail: {
            deltaY: e.deltaY,
            mouseX: e.clientX - rect.left,
            mouseY: e.clientY - rect.top,
            containerWidth: rect.width,
            containerHeight: rect.height
          }
        }));
        return;
      }
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        if (e.target.closest(".pcr-fs-sidebar")) return;
        const outputPanel = e.target.closest(".pcr-output-panel");
        if (outputPanel) {
          if (e.target.closest(".pcr-output-panel-generated")) {
            (_a2 = outputPanel._updateGalleryZoom) == null ? void 0 : _a2.call(outputPanel, delta);
          } else if (e.target.closest(".pcr-output-panel-content, .pcr-console-log")) {
            const area = overlayEl().querySelector(".pcr-fs-editor-area");
            if (area) {
              const cur = parseFloat(getComputedStyle(area).getPropertyValue("--pcr-output-font-size")) || 13;
              const next = Math.max(8, Math.min(32, cur + delta));
              area.style.setProperty("--pcr-output-font-size", `${next}px`);
              (_c2 = (_b2 = overlayEl())._pcrSetOutputFontSize) == null ? void 0 : _c2.call(_b2, next);
            }
          }
          return;
        }
        const editorBody = e.target.closest(".pcr-fs-editor-body");
        if (editorBody) (_e = (_d2 = overlayEl()) == null ? void 0 : _d2._pcrUpdateFsFontSize) == null ? void 0 : _e.call(_d2, delta);
      }
    }
    overlayEl().addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      var _a2, _b2, _c2, _d2;
      for (const evt of stopPropEvents) (_a2 = overlayEl()) == null ? void 0 : _a2.removeEventListener(evt, stopProp);
      (_b2 = overlayEl()) == null ? void 0 : _b2.removeEventListener("pointerdown", handlePointerDown);
      (_c2 = overlayEl()) == null ? void 0 : _c2.removeEventListener("mousedown", handleMouseDown);
      (_d2 = overlayEl()) == null ? void 0 : _d2.removeEventListener("wheel", handleWheel);
    };
  });
  var fragment = root_1$1();
  var node_1 = first_child(fragment);
  Topbar(node_1, {
    get logoUrl() {
      return logoUrl();
    },
    get workflowName() {
      return get(liveWorkflowName);
    },
    get onQueuePrompt() {
      return onQueuePrompt();
    },
    get onCancelExecution() {
      return onCancelExecution();
    },
    onClose: () => onClose()()
  });
  var div = sibling(node_1, 2);
  var div_1 = child(div);
  let styles;
  var div_2 = child(div_1);
  var span = child(div_2);
  let classes;
  bind_this(span, ($$value) => comfyIconEl = $$value, () => comfyIconEl);
  var span_1 = sibling(span, 2);
  let classes_1;
  var span_2 = sibling(span_1, 2);
  let classes_2;
  var node_2 = sibling(span_2, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var fragment_1 = root_2$1();
      var div_3 = first_child(fragment_1);
      var div_4 = sibling(div_3, 2);
      let styles_1;
      each(div_4, 21, () => COMFY_MENU_ITEMS, index, ($$anchor3, item) => {
        var fragment_2 = comment();
        var node_3 = first_child(fragment_2);
        {
          var consequent = ($$anchor4) => {
            var div_5 = root_4$1();
            append($$anchor4, div_5);
          };
          var alternate = ($$anchor4) => {
            var button = root_5();
            var text2 = child(button);
            template_effect(() => set_text(text2, get(item).label));
            delegated("click", button, () => runComfyCommand(get(item).command));
            append($$anchor4, button);
          };
          if_block(node_3, ($$render) => {
            if (get(item).sep) $$render(consequent);
            else $$render(alternate, -1);
          });
        }
        append($$anchor3, fragment_2);
      });
      template_effect(() => styles_1 = set_style(div_4, "", styles_1, {
        left: `${get(comfyMenuPos).left}px`,
        top: `${get(comfyMenuPos).top}px`
      }));
      delegated("click", div_3, () => set(comfyMenuOpen, false));
      append($$anchor2, fragment_1);
    };
    if_block(node_2, ($$render) => {
      if (get(comfyMenuOpen)) $$render(consequent_1);
    });
  }
  var div_6 = sibling(div_2, 2);
  let styles_2;
  var div_7 = child(div_6);
  let styles_3;
  var div_8 = child(div_7);
  var div_9 = sibling(child(div_8), 2);
  var span_3 = child(div_9);
  var span_4 = sibling(span_3, 2);
  span_4.textContent = "↻";
  var div_10 = sibling(div_8, 2);
  var node_4 = child(div_10);
  {
    let $0 = user_derived(() => {
      var _a2;
      return (_a2 = get(activeNode)) == null ? void 0 : _a2.id;
    });
    NetworkTree(node_4, {
      get roots() {
        return fsState().treeRoots;
      },
      get activeNodeId() {
        return get($0);
      },
      get renamingNodeId() {
        return fsState().renamingNodeId;
      },
      onSelectNode: selectTreeNode,
      get onSetMode() {
        return onSetMode();
      },
      get onToggleLock() {
        return onToggleLock();
      },
      get onToggleDisable() {
        return onToggleDisable();
      },
      get onContextMenu() {
        return onContextMenu();
      },
      get onLabelClick() {
        return onLabelClick();
      },
      get onWildcardClick() {
        return onWildcardClick();
      },
      get onWildcardModeClick() {
        return onWildcardModeClick();
      },
      get onDragDrop() {
        return onDragDrop();
      },
      get onFinishRename() {
        return onFinishRename();
      },
      get refreshTree() {
        return refreshTree();
      }
    });
  }
  var div_11 = sibling(div_7, 2);
  let styles_4;
  var node_5 = sibling(div_1, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div_12 = root_6();
      delegated("pointerdown", div_12, (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = get(sidebarWidth);
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        const onMove = (ev) => {
          set(sidebarWidth, Math.max(150, Math.min(500, startWidth + ev.clientX - startX)), true);
        };
        const onUp = () => {
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          e.currentTarget.removeEventListener("pointermove", onMove);
          e.currentTarget.removeEventListener("pointerup", onUp);
        };
        e.currentTarget.addEventListener("pointermove", onMove);
        e.currentTarget.addEventListener("pointerup", onUp);
      });
      append($$anchor2, div_12);
    };
    if_block(node_5, ($$render) => {
      if (!get(sidebarCollapsed)) $$render(consequent_2);
    });
  }
  var div_13 = sibling(node_5, 2);
  var div_14 = child(div_13);
  var div_15 = child(div_14);
  var node_6 = child(div_15);
  LayoutNode_1(node_6, {
    get node() {
      return get(rootLayout);
    },
    get overlayEl() {
      return overlayEl();
    },
    get focusedLeafId() {
      return get(focusedGroupId);
    },
    get draggingTab() {
      return get(draggingTab);
    },
    get dragSourceSingleTab() {
      return get(dragSourceSingleTab);
    },
    get treeRoots() {
      return fsState().treeRoots;
    },
    get logoTextUrl() {
      return logoTextUrl();
    },
    get leafCount() {
      return get(leafCount);
    },
    onFocus: setFocusedGroup,
    onSelectTab: handleTabSelect,
    onCloseTab: handleTabClose,
    onReorderTabs: handleTabReorder,
    onTabDragStart: handleTabDragStart,
    onTabDragEnd: handleTabDragEnd,
    onTabDrop: handleTabDrop,
    onCloseGroup: closeGroup,
    onStartResize: startResize
  });
  template_effect(() => {
    styles = set_style(div_1, "", styles, {
      width: get(sidebarCollapsed) ? "auto" : `${get(sidebarWidth)}px`
    });
    classes = set_class(span, 1, "pcr-activity-icon pcr-activity-icon--comfy svelte-1qqdbxt", null, classes, { "pcr-activity-icon--active": get(comfyMenuOpen) });
    classes_1 = set_class(span_1, 1, "pcr-activity-icon svelte-1qqdbxt", null, classes_1, {
      "pcr-activity-icon--active": !get(sidebarCollapsed) && get(activeView) === "edit"
    });
    classes_2 = set_class(span_2, 1, "pcr-activity-icon svelte-1qqdbxt", null, classes_2, {
      "pcr-activity-icon--active": !get(sidebarCollapsed) && get(activeView) === "switch"
    });
    styles_2 = set_style(div_6, "", styles_2, { display: get(sidebarCollapsed) ? "none" : "" });
    styles_3 = set_style(div_7, "", styles_3, { display: get(activeView) === "edit" ? "" : "none" });
    styles_4 = set_style(div_11, "", styles_4, { display: get(activeView) === "switch" ? "" : "none" });
  });
  delegated("click", span, (e) => {
    e.stopPropagation();
    toggleComfyMenu();
  });
  delegated("click", span_1, () => clickActivityIcon("edit"));
  delegated("click", span_2, () => clickActivityIcon("switch"));
  delegated("click", span_3, () => onAddNode()());
  delegated("click", span_4, () => refreshTree()());
  delegated("contextmenu", div_10, (e) => {
    e.preventDefault();
    e.stopPropagation();
    onEmptyContextMenu()(e.clientX, e.clientY);
  });
  append($$anchor, fragment);
  pop();
}
delegate(["click", "contextmenu", "pointerdown"]);
const optionsCache = /* @__PURE__ */ new Map();
var root_2 = from_html(`<span class="pcr-mode-menu-check"></span>`);
var root_1 = from_html(`<div><span> </span> <!></div>`);
var root_3 = from_html(`<div class="pcr-mode-menu-item" style="color:#888;font-style:italic;"></div>`);
var root_4 = from_html(`<div class="pcr-mode-menu-item" style="color:#e55;font-style:italic;"> </div>`);
var root = from_html(`<div class="pcr-mode-menu" style="position:fixed;z-index:100000;"><div class="pcr-mode-menu-modes"></div> <!></div>`);
function WildcardDropdown($$anchor, $$props) {
  push($$props, true);
  let currentMode = prop($$props, "currentMode", 3, "randomize"), currentIndex = prop($$props, "currentIndex", 3, 0);
  prop($$props, "popupKey", 3, "");
  let onSelectMode = prop($$props, "onSelectMode", 3, () => {
  }), onSelectOption = prop($$props, "onSelectOption", 3, () => {
  }), onClose = prop($$props, "onClose", 3, () => {
  });
  let options = state(proxy([]));
  let loading = state(true);
  let loadError = state(null);
  let searchList = state(null);
  let menuEl;
  let openedAt = 0;
  let fetchAc = null;
  const modes = [
    { emoji: "🎲", label: "Randomize", value: "randomize" },
    { emoji: "📚", label: "Combine", value: "combine" },
    { emoji: "♻️", label: "Iterate", value: "iterate" },
    { emoji: "❌", label: "None", value: "none" }
  ];
  function selectMode(e, mode) {
    e.stopPropagation();
    onSelectMode()(mode);
    requestAnimationFrame(() => onClose()());
  }
  function selectOption(opt) {
    onSelectOption()(opt);
    requestAnimationFrame(() => onClose()());
  }
  function dismiss(e) {
    if (Date.now() - openedAt < 300) return;
    if (menuEl == null ? void 0 : menuEl.contains(e.target)) return;
    onClose()();
  }
  function reposition() {
    if (!menuEl || !$$props.triggerRect) return;
    requestAnimationFrame(() => {
      if (!menuEl) return;
      const rect = menuEl.getBoundingClientRect();
      let left = $$props.triggerRect.left;
      let top = $$props.triggerRect.bottom + 4;
      if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 10;
      if (top + rect.height > window.innerHeight) top = $$props.triggerRect.top - rect.height - 4;
      if (left < 10) left = 10;
      if (top < 10) top = 10;
      menuEl.style.left = `${left}px`;
      menuEl.style.top = `${top}px`;
    });
  }
  onMount(() => {
    openedAt = Date.now();
    document.addEventListener("click", dismiss);
    document.addEventListener("pointerdown", dismiss);
    reposition();
    const cached = optionsCache.get($$props.wildcardName);
    if (cached) {
      set(options, cached, true);
      set(loading, false);
      requestAnimationFrame(() => {
        var _a;
        reposition();
        (_a = get(searchList)) == null ? void 0 : _a.focusSearch();
      });
      return;
    }
    fetchAc = new AbortController();
    fetch(`/promptchain/wildcard?name=${encodeURIComponent($$props.wildcardName)}&options=true`, { signal: fetchAc.signal }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((data) => {
      const raw = data.options || [];
      const mapped = raw.map((label, idx) => ({
        index: idx + 1,
        label: label.replace(/:\d+\.?\d*\)/g, ")").replace(/\s+/g, " ").trim(),
        fullLabel: label
      }));
      optionsCache.set($$props.wildcardName, mapped);
      set(options, mapped, true);
      set(loading, false);
      requestAnimationFrame(() => {
        var _a;
        reposition();
        (_a = get(searchList)) == null ? void 0 : _a.focusSearch();
      });
    }).catch((e) => {
      if (e.name === "AbortError") return;
      console.error("[PromptChain] wildcard options load failed:", e);
      set(loadError, e.message || "Load failed", true);
      set(loading, false);
    });
  });
  onDestroy(() => {
    fetchAc == null ? void 0 : fetchAc.abort();
    document.removeEventListener("click", dismiss);
    document.removeEventListener("pointerdown", dismiss);
  });
  var div = root();
  var div_1 = child(div);
  each(div_1, 21, () => modes, index, ($$anchor2, mode) => {
    var div_2 = root_1();
    let classes;
    var span = child(div_2);
    var text2 = child(span);
    var node = sibling(span, 2);
    {
      var consequent = ($$anchor3) => {
        var span_1 = root_2();
        span_1.textContent = "✓";
        append($$anchor3, span_1);
      };
      if_block(node, ($$render) => {
        if (currentMode() === get(mode).value) $$render(consequent);
      });
    }
    template_effect(() => {
      classes = set_class(div_2, 1, "pcr-mode-menu-item pcr-mode-menu-mode-option", null, classes, {
        "pcr-mode-menu-selected": currentMode() === get(mode).value
      });
      set_text(text2, `${get(mode).emoji ?? ""} ${get(mode).label ?? ""}`);
    });
    delegated("click", div_2, (e) => selectMode(e, get(mode).value));
    append($$anchor2, div_2);
  });
  var node_1 = sibling(div_1, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_3 = root_3();
      div_3.textContent = "Loading options…";
      append($$anchor2, div_3);
    };
    var consequent_2 = ($$anchor2) => {
      var div_4 = root_4();
      var text_1 = child(div_4);
      template_effect(() => set_text(text_1, `Error: ${get(loadError) ?? ""}`));
      append($$anchor2, div_4);
    };
    var alternate = ($$anchor2) => {
      {
        let $0 = user_derived(() => currentMode() === "switch" ? "switch" : "");
        bind_this(
          SearchableList($$anchor2, {
            get options() {
              return get(options);
            },
            onSelect: selectOption,
            get currentMode() {
              return get($0);
            },
            get currentSwitchIndex() {
              return currentIndex();
            }
          }),
          ($$value) => set(searchList, $$value, true),
          () => get(searchList)
        );
      }
    };
    if_block(node_1, ($$render) => {
      if (get(loading)) $$render(consequent_1);
      else if (get(loadError)) $$render(consequent_2, 1);
      else $$render(alternate, -1);
    });
  }
  bind_this(div, ($$value) => menuEl = $$value, () => menuEl);
  delegated("click", div, (e) => e.stopPropagation());
  delegated("pointerdown", div, (e) => e.stopPropagation());
  append($$anchor, div);
  pop();
}
delegate(["click", "pointerdown"]);
class FullscreenState {
  constructor() {
    __privateAdd(
      this,
      _activeNodeId,
      // active node in the editor
      state(null)
    );
    __privateAdd(this, _treeRoots, state(proxy([])));
    __privateAdd(this, _openTabs, state(proxy([])));
    __privateAdd(this, _activeWildcardTab, state(null));
    __privateAdd(this, _compiledOutput, state(""));
    __privateAdd(this, _compiledNegOutput, state(""));
    __privateAdd(this, _imageUrl, state(null));
    __privateAdd(this, _previewUrl, state(null));
    __privateAdd(this, _progress, state(null));
    __privateAdd(this, _isGenerating, state(false));
    __privateAdd(this, _sidebarView, state("edit"));
    __privateAdd(this, _fontSize, state(13));
    __privateAdd(this, _renamingNodeId, state(null));
  }
  get activeNodeId() {
    return get(__privateGet(this, _activeNodeId));
  }
  set activeNodeId(value) {
    set(__privateGet(this, _activeNodeId), value, true);
  }
  get treeRoots() {
    return get(__privateGet(this, _treeRoots));
  }
  set treeRoots(value) {
    set(__privateGet(this, _treeRoots), value, true);
  }
  get openTabs() {
    return get(__privateGet(this, _openTabs));
  }
  set openTabs(value) {
    set(__privateGet(this, _openTabs), value, true);
  }
  get activeWildcardTab() {
    return get(__privateGet(this, _activeWildcardTab));
  }
  set activeWildcardTab(value) {
    set(__privateGet(this, _activeWildcardTab), value, true);
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
  get sidebarView() {
    return get(__privateGet(this, _sidebarView));
  }
  set sidebarView(value) {
    set(__privateGet(this, _sidebarView), value, true);
  }
  get fontSize() {
    return get(__privateGet(this, _fontSize));
  }
  set fontSize(value) {
    set(__privateGet(this, _fontSize), value, true);
  }
  get renamingNodeId() {
    return get(__privateGet(this, _renamingNodeId));
  }
  set renamingNodeId(value) {
    set(__privateGet(this, _renamingNodeId), value, true);
  }
}
_activeNodeId = new WeakMap();
_treeRoots = new WeakMap();
_openTabs = new WeakMap();
_activeWildcardTab = new WeakMap();
_compiledOutput = new WeakMap();
_compiledNegOutput = new WeakMap();
_imageUrl = new WeakMap();
_previewUrl = new WeakMap();
_progress = new WeakMap();
_isGenerating = new WeakMap();
_sidebarView = new WeakMap();
_fontSize = new WeakMap();
_renamingNodeId = new WeakMap();
function mountFullscreen(target, props) {
  return mount(FullscreenEditor, { target, props });
}
function destroyFullscreen(instance) {
  if (instance) unmount(instance);
}
let wcDropdownInstance = null;
let wcDropdownTarget = null;
function showWildcardDropdown(props) {
  hideWildcardDropdown();
  wcDropdownTarget = document.createElement("div");
  document.body.appendChild(wcDropdownTarget);
  const originalClose = props.onClose;
  props.onClose = () => {
    originalClose == null ? void 0 : originalClose();
    hideWildcardDropdown();
  };
  wcDropdownInstance = mount(WildcardDropdown, { target: wcDropdownTarget, props });
}
function hideWildcardDropdown() {
  if (wcDropdownInstance) {
    unmount(wcDropdownInstance);
    wcDropdownInstance = null;
  }
  if (wcDropdownTarget) {
    wcDropdownTarget.remove();
    wcDropdownTarget = null;
  }
}
export {
  FullscreenState,
  destroyFullscreen,
  hideWildcardDropdown,
  mountFullscreen,
  showWildcardDropdown
};
//# sourceMappingURL=promptchain-fullscreen.js.map
