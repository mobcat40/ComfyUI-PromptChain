import { b as block, B as BranchManager, d as delegate, p as push, a as prop, s as state, c as proxy, u as user_effect, g as get, e as set, i as if_block, f as sibling, t as template_effect, h as set_class, j as delegated, k as append, l as pop, m as user_derived, n as child, o as bind_this, q as set_value, r as event, v as first_child, w as each, x as set_attribute, y as set_text, z as index, A as from_html, C as tick, D as comment, E as untrack, F as update, G as set_checked, H as autofocus, I as to_array, J as from_svg, $ as $window, K as mount, L as unmount } from "./disclose-version-BjTnIIw0.js";
import { o as onDestroy } from "./index-client-m0VtlDjX.js";
import { s as set_style } from "./style-CbOHK2KU.js";
import { a as action } from "./actions-Ckx5huYg.js";
import { b as bind_value, a as bind_checked } from "./input-Bjai8x-c.js";
import { i as init_select, s as select_option, b as bind_select_value } from "./select-Dgaht2aI.js";
import { p as portal, C as ConfirmModal } from "./ConfirmModal-DSeVjwuq.js";
import { S as SettingsSlider } from "./SettingsSlider-Bxw-taga.js";
import { P as PopupAnchor, h as html } from "./PopupAnchor-sxqUMRLP.js";
const NAN = Symbol("NaN");
function key(node, get_key, render_fn) {
  var branches = new BranchManager(node);
  block(() => {
    var key2 = get_key();
    if (key2 !== key2) {
      key2 = /** @type {any} */
      NAN;
    }
    branches.ensure(key2, render_fn);
  });
}
const KEY = "pcr.modal.memory";
const MAX_ENTRIES = 60;
function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
function recallModalMemory(kind, imageKey) {
  if (!imageKey) return null;
  return readAll()[`${kind}:${imageKey}`] || null;
}
function storeModalMemory(kind, imageKey, value) {
  if (!imageKey) return;
  try {
    const all = readAll();
    all[`${kind}:${imageKey}`] = { ...value, t: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys.sort((a, b) => {
        var _a, _b;
        return (((_a = all[a]) == null ? void 0 : _a.t) || 0) - (((_b = all[b]) == null ? void 0 : _b.t) || 0);
      });
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete all[k];
    }
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
  }
}
const isHash = (h) => /^[0-9a-f]{64}$/.test(h || "");
async function loadModalSetup(fetchApi, hash) {
  if (!fetchApi || !isHash(hash)) return null;
  try {
    const res = await fetchApi(`/promptchain/modal-setup/${hash}`);
    if (!(res == null ? void 0 : res.ok)) return null;
    const doc = await res.json();
    return doc && typeof doc === "object" && doc.kinds ? doc : null;
  } catch {
    return null;
  }
}
async function saveModalSetup(fetchApi, hash, kind, data, dims = null, planes = {}) {
  if (!fetchApi || !isHash(hash) || !kind) return false;
  try {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("data", JSON.stringify(data ?? {}));
    if (dims) fd.append("dims", JSON.stringify(dims));
    for (const [name, blob] of Object.entries(planes)) fd.append(name, blob, name);
    const res = await fetchApi(`/promptchain/modal-setup/${hash}`, { method: "POST", body: fd });
    return !!(res == null ? void 0 : res.ok);
  } catch {
    return false;
  }
}
var root_1$7 = from_html(`<input class="pcr-spi-edit svelte-zjr12h" type="text" spellcheck="false"/>`);
var root_3$7 = from_html(`<button type="button"> </button> <span class="pcr-spi-sep svelte-zjr12h">/</span>`, 1);
var root_2$8 = from_html(`<!> <input class="pcr-spi-input svelte-zjr12h" type="text" spellcheck="false"/>`, 1);
var root_5$7 = from_html(`<div><svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" class="svelte-zjr12h"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z"></path></svg> </div>`);
var root_4$7 = from_html(`<div class="pcr-spi-dd svelte-zjr12h"></div>`);
var root$3 = from_html(`<div><div class="pcr-spi-field svelte-zjr12h"><!></div> <!></div>`);
function SavePathInput($$anchor, $$props) {
  push($$props, true);
  let value = prop($$props, "value", 3, ""), onChange = prop($$props, "onChange", 3, () => {
  }), fetchApi = prop($$props, "fetchApi", 3, null);
  let inputEl;
  let editEl;
  let focused = state(false);
  let editMode = state(
    false
    // Explorer's address bar: breadcrumbs <-> raw text
  );
  let ddIdx = state(-1);
  let folderCache = state(proxy(
    {}
    // chipsPath -> string[] of existing subfolders
  ));
  function enterEditMode(selectAll) {
    set(editMode, true);
    requestAnimationFrame(() => {
      editEl == null ? void 0 : editEl.focus();
      if (selectAll) editEl == null ? void 0 : editEl.select();
      else editEl == null ? void 0 : editEl.setSelectionRange(value().length, value().length);
    });
  }
  let chips = user_derived(() => value().includes("/") ? value().split("/").slice(0, -1) : []);
  let tail = user_derived(() => value().includes("/") ? value().split("/").pop() : value());
  let chipsPath = user_derived(() => get(chips).join("/"));
  user_effect(() => {
    const p = get(chipsPath);
    if (!fetchApi() || get(folderCache)[p] !== void 0) return;
    fetchApi()(`/promptchain/browse?scope=output&path=${encodeURIComponent(p)}&sort=name&direction=asc`).then((r) => r.ok ? r.json() : null).then((data) => {
      const folders = ((data == null ? void 0 : data.items) || []).filter((i) => i.type === "folder").map((i) => i.name);
      set(folderCache, { ...get(folderCache), [p]: folders }, true);
    }).catch(() => {
      set(folderCache, { ...get(folderCache), [p]: [] }, true);
    });
  });
  let matches = user_derived(() => (() => {
    if (!get(focused)) return [];
    const list = get(folderCache)[get(chipsPath)] || [];
    const t = get(tail).trim().toLowerCase();
    if (!t) return list;
    return list.filter((n) => n.toLowerCase().startsWith(t) && n.toLowerCase() !== t);
  })());
  function emit(newChips, newTail) {
    onChange()(newChips.length ? `${newChips.join("/")}/${newTail}` : newTail);
  }
  function caretTo(pos) {
    requestAnimationFrame(() => inputEl == null ? void 0 : inputEl.setSelectionRange(pos, pos));
  }
  function handleInput(e) {
    let text = e.target.value;
    set(ddIdx, -1);
    const slash = text.indexOf("/");
    if (slash >= 0) {
      const seg = text.slice(0, slash).trim();
      const rest = text.slice(slash + 1);
      emit(seg ? [...get(chips), seg] : get(chips), rest);
      caretTo(Math.max(0, Math.min(rest.length, (e.target.selectionStart ?? rest.length) - slash - 1)));
      return;
    }
    emit(get(chips), text);
  }
  function handleKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      enterEditMode(true);
      return;
    }
    if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "Home") && get(chips).length && (e.key === "Home" || (inputEl == null ? void 0 : inputEl.selectionStart) === 0)) {
      e.preventDefault();
      const prefixLen = value().length - get(
        tail
        // chips + trailing slash
      ).length;
      const selEnd = prefixLen + ((inputEl == null ? void 0 : inputEl.selectionEnd) ?? 0);
      const selStart = e.key === "Home" ? 0 : Math.max(0, prefixLen - 1);
      set(editMode, true);
      requestAnimationFrame(() => {
        editEl == null ? void 0 : editEl.focus();
        editEl == null ? void 0 : editEl.setSelectionRange(selStart, selEnd, "backward");
      });
      return;
    }
    if (e.key === "Backspace" && (inputEl == null ? void 0 : inputEl.selectionStart) === 0 && (inputEl == null ? void 0 : inputEl.selectionEnd) === 0 && get(chips).length) {
      e.preventDefault();
      const popped = get(chips)[get(chips).length - 1];
      emit(get(chips).slice(0, -1), popped + get(tail));
      caretTo(popped.length);
      return;
    }
    if (get(matches).length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        set(ddIdx, (get(ddIdx) + 1) % get(matches).length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        set(ddIdx, get(ddIdx) <= 0 ? get(matches).length - 1 : get(ddIdx) - 1, true);
        return;
      }
      if (e.key === "Enter" && get(ddIdx) >= 0) {
        e.preventDefault();
        e.stopPropagation();
        pick(get(matches)[get(ddIdx)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        set(ddIdx, -1);
        set(focused, false);
        return;
      }
    }
  }
  function pick(folder) {
    emit([...get(chips), folder], "");
    set(ddIdx, -1);
    if (get(editMode)) {
      requestAnimationFrame(() => {
        editEl == null ? void 0 : editEl.focus();
        const len = (editEl == null ? void 0 : editEl.value.length) ?? 0;
        editEl == null ? void 0 : editEl.setSelectionRange(len, len);
      });
    } else {
      inputEl == null ? void 0 : inputEl.focus();
    }
  }
  function tailClickToEdit(e) {
    const prefixLen = value().length - get(tail).length;
    const start = prefixLen + (e.target.selectionStart ?? get(tail).length);
    const end = prefixLen + (e.target.selectionEnd ?? get(tail).length);
    set(editMode, true);
    requestAnimationFrame(() => {
      editEl == null ? void 0 : editEl.focus();
      editEl == null ? void 0 : editEl.setSelectionRange(start, end);
    });
  }
  const isLocalClient = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname);
  function chipExists(i) {
    return (get(folderCache)[get(chips).slice(0, i).join("/")] || []).includes(get(chips)[i]);
  }
  function clickChip(i) {
    if (!isLocalClient || !fetchApi() || !chipExists(i)) return;
    const rel = get(chips).slice(0, i + 1).join("/");
    fetchApi()(`/promptchain/reveal-file?scope=output&path=${encodeURIComponent(rel)}`).catch(() => {
    });
  }
  var div = root$3();
  let classes;
  var div_1 = child(div);
  var node = child(div_1);
  {
    var consequent = ($$anchor2) => {
      var input = root_1$7();
      bind_this(input, ($$value) => editEl = $$value, () => editEl);
      template_effect(() => set_value(input, value()));
      delegated("input", input, (e) => {
        set(ddIdx, -1);
        onChange()(e.target.value);
      });
      delegated("keydown", input, (e) => {
        if (get(matches).length) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            set(ddIdx, (get(ddIdx) + 1) % get(matches).length);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            set(ddIdx, get(ddIdx) <= 0 ? get(matches).length - 1 : get(ddIdx) - 1, true);
            return;
          }
          if (e.key === "Enter" && get(ddIdx) >= 0) {
            e.preventDefault();
            e.stopPropagation();
            pick(get(matches)[get(ddIdx)]);
            return;
          }
        }
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          set(editMode, false);
        }
      });
      event("focus", input, () => {
        set(focused, true);
      });
      event("blur", input, () => {
        set(focused, false);
        set(editMode, false);
        set(ddIdx, -1);
      });
      append($$anchor2, input);
    };
    var alternate = ($$anchor2) => {
      var fragment = root_2$8();
      var node_1 = first_child(fragment);
      each(node_1, 17, () => get(chips), index, ($$anchor3, chip, i) => {
        var fragment_1 = root_3$7();
        var button = first_child(fragment_1);
        let classes_1;
        var text_1 = child(button);
        template_effect(
          ($0, $1) => {
            classes_1 = set_class(button, 1, "pcr-spi-chip svelte-zjr12h", null, classes_1, $0);
            set_attribute(button, "title", $1);
            set_text(text_1, get(chip));
          },
          [
            () => ({
              exists: (get(folderCache)[get(chips).slice(0, i).join("/")] || []).includes(get(chip))
            }),
            () => (get(folderCache)[get(chips).slice(0, i).join("/")] || []).includes(get(chip)) ? "Open this folder in Explorer" : "New folder (created on save)"
          ]
        );
        delegated("click", button, (e) => {
          e.stopPropagation();
          clickChip(i);
        });
        append($$anchor3, fragment_1);
      });
      var input_1 = sibling(node_1, 2);
      bind_this(input_1, ($$value) => inputEl = $$value, () => inputEl);
      template_effect(() => set_value(input_1, get(tail)));
      delegated("input", input_1, handleInput);
      delegated("keydown", input_1, handleKeydown);
      delegated("click", input_1, tailClickToEdit);
      event("focus", input_1, () => {
        set(focused, true);
      });
      event("blur", input_1, () => {
        set(focused, false);
        set(ddIdx, -1);
      });
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(editMode)) $$render(consequent);
      else $$render(alternate, -1);
    });
  }
  var node_2 = sibling(div_1, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_4$7();
      each(div_2, 21, () => get(matches), index, ($$anchor3, m, i) => {
        var div_3 = root_5$7();
        let classes_2;
        var text_2 = sibling(child(div_3));
        template_effect(() => {
          classes_2 = set_class(div_3, 1, "pcr-spi-dd-item svelte-zjr12h", null, classes_2, { active: i === get(ddIdx) });
          set_text(text_2, ` ${get(m) ?? ""}`);
        });
        delegated("mousedown", div_3, (e) => {
          e.preventDefault();
          pick(get(m));
        });
        append($$anchor3, div_3);
      });
      append($$anchor2, div_2);
    };
    if_block(node_2, ($$render) => {
      if (get(focused) && get(matches).length) $$render(consequent_1);
    });
  }
  template_effect(() => classes = set_class(div, 1, "pcr-spi svelte-zjr12h", null, classes, { focused: get(focused) }));
  delegated("click", div_1, (e) => {
    if (e.target === e.currentTarget) enterEditMode(false);
  });
  append($$anchor, div);
  pop();
}
delegate(["click", "input", "keydown", "mousedown"]);
var root_3$6 = from_html(`<div class="pcr-mode-menu-empty">No matching models</div>`);
var root_6$5 = from_html(`<div class="pcr-ssel-group svelte-1izuj9d"> </div>`);
var root_8$5 = from_html(`<span class="pcr-mode-menu-check"></span>`);
var root_7$5 = from_html(`<div><span class="pcr-mode-menu-label"></span> <!></div>`);
var root_5$6 = from_html(`<!> <!>`, 1);
var root_2$7 = from_html(`<div class="pcr-mode-menu-search-container"><input type="text" class="pcr-mode-menu-search"/></div> <div class="pcr-mode-menu-separator"></div> <div class="pcr-mode-menu-list"><!></div>`, 1);
var root$2 = from_html(`<button type="button" class="pcr-ssel-trigger svelte-1izuj9d"><span class="pcr-ssel-label svelte-1izuj9d"> </span> <span class="pcr-ssel-caret svelte-1izuj9d"></span></button> <!>`, 1);
function SearchableSelect($$anchor, $$props) {
  push($$props, true);
  let id = prop($$props, "id", 3, ""), value = prop($$props, "value", 3, ""), groups = prop($$props, "groups", 19, () => []), disabled = prop($$props, "disabled", 3, false), popupKey = prop($$props, "popupKey", 3, "searchable-select"), placeholder = prop($$props, "placeholder", 3, "Search models..."), onpick = prop($$props, "onpick", 3, () => {
  });
  let open = state(false);
  let triggerEl = state(null);
  let triggerRect = state(null);
  let searchEl = state(null);
  let filter = state("");
  let keyboardIndex = state(-1);
  const allOptions = user_derived(() => groups().flatMap((g) => g.options));
  const currentLabel = user_derived(() => {
    var _a;
    return ((_a = get(allOptions).find((o) => o.value === value())) == null ? void 0 : _a.label) || "";
  });
  const terms = user_derived(() => get(filter).toLowerCase().split(/\s+/).filter(Boolean));
  const filteredGroups = user_derived(() => groups().map((g) => ({
    label: g.label,
    options: g.options.filter((o) => get(terms).every((t) => o.label.toLowerCase().includes(t) || (g.label || "").toLowerCase().includes(t)))
  })).filter((g) => g.options.length));
  const flat = user_derived(() => get(filteredGroups).flatMap((g) => g.options));
  user_effect(() => {
    get(filter);
    set(keyboardIndex, -1);
  });
  async function toggle() {
    var _a;
    if (disabled()) return;
    if (get(open)) {
      set(open, false);
      return;
    }
    set(triggerRect, get(triggerEl).getBoundingClientRect(), true);
    set(filter, "");
    set(keyboardIndex, -1);
    set(open, true);
    await tick();
    (_a = get(searchEl)) == null ? void 0 : _a.focus();
  }
  function pick(opt) {
    set(open, false);
    if (opt.value !== value()) onpick()(opt.value);
  }
  function onSearchKeydown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (get(flat).length) set(keyboardIndex, (get(keyboardIndex) + 1) % get(flat).length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (get(flat).length) set(keyboardIndex, get(keyboardIndex) > 0 ? get(keyboardIndex) - 1 : get(flat).length - 1, true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (get(keyboardIndex) >= 0 && get(keyboardIndex) < get(flat).length) pick(get(flat)[get(keyboardIndex)]);
      else if (get(flat).length === 1) pick(get(flat)[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      set(open, false);
    }
    e.stopPropagation();
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function highlightText(text) {
    if (!get(terms).length) return escapeHtml(text);
    let result = "";
    let remaining = text;
    let lower = remaining.toLowerCase();
    while (remaining.length > 0) {
      let earliest = -1;
      let matched = "";
      for (const term of get(terms)) {
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
  var fragment = root$2();
  var button = first_child(fragment);
  var span = child(button);
  var text_1 = child(span);
  var span_1 = sibling(span, 2);
  span_1.textContent = "▾";
  bind_this(button, ($$value) => set(triggerEl, $$value), () => get(triggerEl));
  var node = sibling(button, 2);
  {
    var consequent_3 = ($$anchor2) => {
      PopupAnchor($$anchor2, {
        get triggerRect() {
          return get(triggerRect);
        },
        get popupKey() {
          return popupKey();
        },
        get triggerEl() {
          return get(triggerEl);
        },
        onClose: () => {
          set(open, false);
        },
        children: ($$anchor3, $$slotProps) => {
          var fragment_2 = root_2$7();
          var div = first_child(fragment_2);
          var input = child(div);
          bind_this(input, ($$value) => set(searchEl, $$value), () => get(searchEl));
          var div_1 = sibling(div, 4);
          var node_1 = child(div_1);
          {
            var consequent = ($$anchor4) => {
              var div_2 = root_3$6();
              append($$anchor4, div_2);
            };
            var alternate = ($$anchor4) => {
              var fragment_3 = comment();
              var node_2 = first_child(fragment_3);
              each(node_2, 17, () => get(filteredGroups), index, ($$anchor5, g) => {
                var fragment_4 = root_5$6();
                var node_3 = first_child(fragment_4);
                {
                  var consequent_1 = ($$anchor6) => {
                    var div_3 = root_6$5();
                    var text_2 = child(div_3);
                    template_effect(() => set_text(text_2, get(g).label));
                    append($$anchor6, div_3);
                  };
                  if_block(node_3, ($$render) => {
                    if (get(g).label) $$render(consequent_1);
                  });
                }
                var node_4 = sibling(node_3, 2);
                each(node_4, 17, () => get(g).options, index, ($$anchor6, opt) => {
                  const i = user_derived(() => get(flat).indexOf(get(opt)));
                  var div_4 = root_7$5();
                  let classes;
                  var span_2 = child(div_4);
                  html(span_2, () => highlightText(get(opt).label), true);
                  var node_5 = sibling(span_2, 2);
                  {
                    var consequent_2 = ($$anchor7) => {
                      var span_3 = root_8$5();
                      span_3.textContent = "✓";
                      append($$anchor7, span_3);
                    };
                    if_block(node_5, ($$render) => {
                      if (get(opt).value === value()) $$render(consequent_2);
                    });
                  }
                  template_effect(() => classes = set_class(div_4, 1, "pcr-mode-menu-item", null, classes, {
                    "pcr-mode-menu-selected": get(opt).value === value(),
                    "pcr-mode-menu-keyboard-selected": get(i) === get(keyboardIndex)
                  }));
                  delegated("click", div_4, (e) => {
                    e.stopPropagation();
                    pick(get(opt));
                  });
                  event("mouseenter", div_4, () => {
                    set(keyboardIndex, get(i), true);
                  });
                  append($$anchor6, div_4);
                });
                append($$anchor5, fragment_4);
              });
              append($$anchor4, fragment_3);
            };
            if_block(node_1, ($$render) => {
              if (!get(flat).length) $$render(consequent);
              else $$render(alternate, -1);
            });
          }
          template_effect(() => set_attribute(input, "placeholder", placeholder()));
          delegated("keydown", input, onSearchKeydown);
          bind_value(input, () => get(filter), ($$value) => set(filter, $$value));
          append($$anchor3, fragment_2);
        },
        $$slots: { default: true }
      });
    };
    if_block(node, ($$render) => {
      if (get(open)) $$render(consequent_3);
    });
  }
  template_effect(() => {
    set_attribute(button, "id", id());
    button.disabled = disabled();
    set_text(text_1, get(currentLabel) || "—");
  });
  delegated("click", button, toggle);
  append($$anchor, fragment);
  pop();
}
delegate(["click", "keydown"]);
var root_2$6 = from_html(`<button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`);
var root_3$5 = from_html(`<img class="pcr-up-live svelte-xw7bpl" alt="" draggable="false"/>`);
var root_5$5 = from_html(`<div class="pcr-up-split-before svelte-xw7bpl"><div class="pcr-up-zoomwrap svelte-xw7bpl"><img class="pcr-up-preview svelte-xw7bpl" alt="" draggable="false"/></div></div> <div class="pcr-up-split-label before svelte-xw7bpl">Before</div> <div class="pcr-up-split-label after svelte-xw7bpl">After</div> <div class="pcr-up-split-divider svelte-xw7bpl"><div class="pcr-up-split-knob svelte-xw7bpl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="svelte-xw7bpl"><polyline points="9.5 8 5.5 12 9.5 16"></polyline><polyline points="14.5 8 18.5 12 14.5 16"></polyline></svg></div></div>`, 1);
var root_7$4 = from_html(`<button title="Drag the divider to wipe the original over the result">Compare</button>`);
var root_6$4 = from_html(`<div class="pcr-up-zoomctl svelte-xw7bpl"><span class="pcr-up-zoompct svelte-xw7bpl"> </span> <!> <button class="pcr-up-fit-btn svelte-xw7bpl">Fit</button></div>`);
var root_4$6 = from_html(`<div class="pcr-up-zoomwrap svelte-xw7bpl"><img class="pcr-up-preview svelte-xw7bpl" alt="" draggable="false"/></div> <!> <!>`, 1);
var root_9$4 = from_html(`<div class="pcr-up-progress-text pcr-up-done svelte-xw7bpl"> </div>`);
var root_10$4 = from_html(`<div class="pcr-up-progress-text pcr-up-error svelte-xw7bpl"> </div>`);
var root_12$4 = from_html(`<div class="pcr-up-bar-label svelte-xw7bpl"> </div>`);
var root_11$3 = from_html(`<div class="pcr-up-progress-text svelte-xw7bpl"> </div> <div class="pcr-up-bar svelte-xw7bpl"><div></div></div> <!>`, 1);
var root_8$4 = from_html(`<div class="pcr-up-progress svelte-xw7bpl"><!></div>`);
var root_13$4 = from_html(`<button class="pcr-up-restore-chip svelte-xw7bpl" title="Re-apply the dials from your last upscale of this image">↩ Restore last setup</button>`);
var root_14$4 = from_html(`<p class="pcr-up-floor-msg svelte-xw7bpl">This image has no usable prompt metadata — a plain model upscale (ESRGAN) will be used.</p>`);
var root_16$4 = from_html(`<span class="pcr-up-cond-hint svelte-xw7bpl"> </span>`);
var root_17$4 = from_html(`<span class="pcr-up-cond-hint svelte-xw7bpl">re-renders the whole frame at ~2MP from your instruction — composition can shift slightly; the climb model below pushes to the target size</span>`);
var root_18$4 = from_html(`<span class="pcr-up-cond-hint svelte-xw7bpl">deterministic enlargement with the climb model below — add a Restore step for degraded sources (webcam, jpeg, blur)</span>`);
var root_15$4 = from_html(`<div class="pcr-mcard"><div class="pcr-mcard-title">Engine</div> <div class="pcr-up-cond pcr-up-engine-block svelte-xw7bpl"><!> <!></div></div>`);
var root_20$4 = from_html(`<option> </option>`);
var root_21$3 = from_html(`<div class="pcr-up-sources svelte-xw7bpl"><span class="pcr-up-sources-label svelte-xw7bpl">Depth from</span> <div class="pcr-up-seg svelte-xw7bpl"><div>3D pose</div> <div>This image</div></div></div>`);
var root_19$4 = from_html(`<div class="pcr-mcard"><div class="pcr-mcard-title">Mode</div> <select class="pcr-up-select svelte-xw7bpl" data-mode-select=""></select> <div class="pcr-up-cond-hint svelte-xw7bpl"> </div> <!></div>`);
var root_23$2 = from_html(`<option> </option>`);
var root_24$3 = from_html(`<option> </option>`);
var root_22$3 = from_html(`<div class="pcr-mcard"><div class="pcr-mcard-title">Character lock</div> <div class="pcr-up-cond svelte-xw7bpl"><select id="pcr-up-condition" class="pcr-up-select svelte-xw7bpl"><option>None</option><!><!></select> <span class="pcr-up-cond-hint svelte-xw7bpl">keeps the character from drifting while tiles re-detail — the image itself is the reference</span></div></div>`);
var root_27$3 = from_html(`<div class="pcr-up-prompt pcr-up-prompt-editor svelte-xw7bpl"></div>`);
var root_28$2 = from_html(`<textarea class="pcr-up-prompt svelte-xw7bpl" spellcheck="false"></textarea>`);
var root_29$3 = from_html(`<span class="pcr-up-save-label svelte-xw7bpl">Workflow prompt (reference)</span> <textarea class="pcr-up-refprompt svelte-xw7bpl" readonly="" spellcheck="false"></textarea>`, 1);
var root_25$3 = from_html(`<div class="pcr-mcard"><div class="pcr-mcard-title"> </div> <div class="pcr-up-prompt-block svelte-xw7bpl"><span class="pcr-up-save-label svelte-xw7bpl"> </span> <!> <!></div></div>`);
var root_31$3 = from_html(`<div class="pcr-up-canvas svelte-xw7bpl"><div class="pcr-up-canvas-title svelte-xw7bpl">This quality is bigger than the region's footprint — how should it land?</div> <div><div class="pcr-up-mode-radio svelte-xw7bpl"><div class="pcr-up-mode-dot svelte-xw7bpl"></div></div> <div class="pcr-up-mode-text svelte-xw7bpl"><div class="pcr-up-mode-label svelte-xw7bpl"> </div> <div class="pcr-up-mode-desc svelte-xw7bpl">The whole document scales up and the region lands pixel-for-pixel — full quality kept. The UltraSharp-enlarged image becomes the new Background, so erasing the upscale layer reveals it.</div></div></div> <div><div class="pcr-up-mode-radio svelte-xw7bpl"><div class="pcr-up-mode-dot svelte-xw7bpl"></div></div> <div class="pcr-up-mode-text svelte-xw7bpl"><div class="pcr-up-mode-label svelte-xw7bpl"> </div> <div class="pcr-up-mode-desc svelte-xw7bpl">The render is rescaled back into the region — re-detailed, but softer than 1:1.</div></div></div></div>`);
var root_32$2 = from_html(`<label class="pcr-up-ultrasharp svelte-xw7bpl"><input type="checkbox" class="svelte-xw7bpl"/> <span class="pcr-up-ultrasharp-text svelte-xw7bpl">Keep a plain UltraSharp layer underneath <span class="pcr-up-ultrasharp-hint svelte-xw7bpl">erase the AI layer anywhere to reveal a faithfully sharpened original instead of the soft source</span></span></label>`);
var root_33$3 = from_html(`<div class="pcr-up-slider-row svelte-xw7bpl"><span class="pcr-up-slider-label svelte-xw7bpl">Denoise</span> <!></div>`);
var root_30$3 = from_html(`<div class="pcr-up-sliders svelte-xw7bpl"><div><span class="pcr-up-slider-label svelte-xw7bpl">Scale</span> <!></div> <div class="pcr-up-slider-target svelte-xw7bpl"> </div> <!> <!> <!></div>`);
var root_34$3 = from_html(`<div class="pcr-up-combos svelte-xw7bpl"><div class="pcr-up-combo svelte-xw7bpl"><label class="pcr-up-combo-label svelte-xw7bpl" for="pcr-up-plainpass">Plain pass — Background / under-layer</label> <select id="pcr-up-plainpass"><option> </option><option> </option></select></div></div>`);
var root_36$3 = from_html(`<div class="pcr-up-combo svelte-xw7bpl"><label class="pcr-up-combo-label svelte-xw7bpl" for="pcr-up-restore">Restore</label> <select id="pcr-up-restore"><option> </option><option> </option></select></div>`);
var root_37$3 = from_html(`<option> </option>`);
var root_35$3 = from_html(`<div class="pcr-up-combos svelte-xw7bpl"><!> <div class="pcr-up-combo svelte-xw7bpl"><label class="pcr-up-combo-label svelte-xw7bpl" for="pcr-up-climb">Climb model</label> <select id="pcr-up-climb"></select></div></div>`);
var root_39$2 = from_html(`<option> </option>`);
var root_40$2 = from_html(`<option> </option>`);
var root_38$3 = from_html(`<div class="pcr-up-combos svelte-xw7bpl"><div class="pcr-up-combo svelte-xw7bpl"><label class="pcr-up-combo-label svelte-xw7bpl" for="pcr-up-sampler">Sampler</label> <select id="pcr-up-sampler"></select></div> <div class="pcr-up-combo svelte-xw7bpl"><label class="pcr-up-combo-label svelte-xw7bpl" for="pcr-up-scheduler">Scheduler</label> <select id="pcr-up-scheduler"></select></div></div>`);
var root_42$3 = from_html(`<span class="pcr-up-adv-dirty svelte-xw7bpl"> </span>`);
var root_44$3 = from_html(`<label class="pcr-up-ultrasharp svelte-xw7bpl"><input type="checkbox" class="svelte-xw7bpl"/> <span class="pcr-up-ultrasharp-text svelte-xw7bpl">Preserve soft background <span class="pcr-up-ultrasharp-hint svelte-xw7bpl">defocused regions keep the original's smoothness instead of growing invented texture</span></span></label>`);
var root_47$2 = from_html(`<option> </option>`);
var root_46$3 = from_html(`<div class="pcr-up-slider-row svelte-xw7bpl"><span class="pcr-up-slider-label svelte-xw7bpl"> </span> <select class="pcr-up-select pcr-up-adv-select svelte-xw7bpl"></select></div>`);
var root_48$2 = from_html(`<div class="pcr-up-slider-row svelte-xw7bpl"><span class="pcr-up-slider-label svelte-xw7bpl"> </span> <!></div>`);
var root_43$3 = from_html(`<div class="pcr-up-adv-body svelte-xw7bpl"><!> <!> <!></div>`);
var root_41$3 = from_html(`<div class="pcr-up-adv-toggle svelte-xw7bpl"><span>▶</span> Advanced <!></div> <!>`, 1);
var root_49$2 = from_html(`<div class="pcr-up-save svelte-xw7bpl"><span class="pcr-up-save-label svelte-xw7bpl">Save to</span> <!></div>`);
var root_51$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-danger">Cancel</button>`);
var root_53$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-primary">Add to Edit</button>`);
var root_54$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-primary">View result</button>`);
var root_52$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-secondary">Close</button> <button class="pcr-modal-btn pcr-modal-btn-secondary"> </button> <!>`, 1);
var root_56$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-secondary">Create Workflow</button>`);
var root_55$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-secondary">Cancel</button> <!> <button class="pcr-modal-btn pcr-modal-btn-primary">Apply</button>`, 1);
var root_1$6 = from_html(`<div class="pcr-modal-backdrop"><div class="pcr-modal pcr-up-modal svelte-xw7bpl" role="dialog" aria-modal="true"><div class="pcr-modal-header"><span class="pcr-modal-title"> </span> <!></div> <div class="pcr-modal-body pcr-up-body svelte-xw7bpl"><div class="pcr-up-left svelte-xw7bpl"><div><!></div> <!></div> <div><!> <!> <!> <!> <!> <!> <div class="pcr-mcard"><div class="pcr-mcard-title">Settings</div> <!> <!> <!> <!> <!> <!></div></div></div> <div class="pcr-modal-footer"><!></div></div></div>`);
function UpscaleOptionsModal($$anchor, $$props) {
  push($$props, true);
  let caps = prop($$props, "caps", 3, null), fetchApi = prop($$props, "fetchApi", 3, null), filename = prop($$props, "filename", 3, ""), width = prop($$props, "width", 3, 0), height = prop($$props, "height", 3, 0), previewUrl = prop($$props, "previewUrl", 3, ""), progress = prop($$props, "progress", 3, null), onCancelRun = prop($$props, "onCancelRun", 3, null), onViewResult = prop($$props, "onViewResult", 3, null), onUseInEdit = prop(
    $$props,
    "onUseInEdit",
    3,
    null
    // (doneState) => void — hand the render back to Edit as a layer
  ), elevated = prop(
    $$props,
    "elevated",
    3,
    false
    // raise z-index above the Edit modal
  ), docWidth = prop(
    $$props,
    "docWidth",
    3,
    0
    // Edit handoff: full document dims, for the grow-canvas choice
  ), docHeight = prop($$props, "docHeight", 3, 0), mountPromptEditor = prop(
    $$props,
    "mountPromptEditor",
    3,
    null
    // (container, initialValue, onChange) => Promise<EditorView>
  ), imageKey = prop(
    $$props,
    "imageKey",
    3,
    ""
    // stable id of the image (per-image session memory)
  ), onInstallPack = prop(
    $$props,
    "onInstallPack",
    3,
    null
    // (injectable) => Promise<installed> — offer-to-install a character-lock condition
  );
  const PACK_FOR = { ipadapter: "StyleReference", pulid: "PuLID" };
  const isCondInstalled = (key2) => {
    var _a, _b, _c;
    return !!((_c = (_b = (_a = caps()) == null ? void 0 : _a.conditions) == null ? void 0 : _b[key2]) == null ? void 0 : _c.ok);
  };
  let mode = state("prompt");
  let depthSource = state("pose");
  let savePrefix = state("");
  let upscaleBy = state(2);
  let canvasMode = state(
    "grow"
    // Edit handoff: grow the canvas vs squeeze the render back
  );
  let ultrasharpUnder = state(
    false
    // Edit keep-path: pair the AI layer with a plain-ESRGAN layer beneath
  );
  let condition = state(
    "none"
    // identity/style lock for the re-detail pass (reference = the image itself)
  );
  let prompt = state(
    ""
    // mirrors the editor; sent only when edited away from the prefill
  );
  let refEl = null;
  let denoise = state(0.3);
  let sampler = state("");
  let scheduler = state("");
  let engineSel = state(
    "source"
    // "source" | "plain" | engine-model hash
  );
  let plainEngine = state(
    "ultrasharp"
    // Edit handoff: engine of the plain side passes (under-layer / grow Background)
  );
  let recommendedPlainEngine = user_derived(() => {
    var _a;
    return ((_a = caps()) == null ? void 0 : _a.seedvr2Available) ? "seedvr2" : "ultrasharp";
  });
  let climbStage = state(
    "ultrasharp"
    // "ultrasharp" = no restore | "seedvr2"
  );
  let climbModel = state(
    ""
    // which installed ESRGAN model climbs to target
  );
  let preserveDefocus = state(
    true
    // flux2 refine: soft-region composite keeps bokeh un-textured
  );
  let advanced = state(proxy({}));
  let advancedOpen = state(false);
  let confirmBtn;
  let engineEntry = user_derived(() => {
    var _a, _b;
    return ((_b = (_a = caps()) == null ? void 0 : _a.engineModels) == null ? void 0 : _b.find((m) => m.hash === get(engineSel))) || null;
  });
  let engineKind = user_derived(() => get(engineEntry) ? get(engineEntry).architecture === "qwen_edit" ? "qwen" : get(engineEntry).architecture === "flux" ? "flux1" : "sdxl" : get(engineSel) === "source" ? "source" : "plain");
  let sourceGraftable = user_derived(() => {
    var _a;
    return get(engineKind) === "source" && !!((_a = caps()) == null ? void 0 : _a.graftable);
  });
  let tileEngine = user_derived(() => get(engineKind) === "sdxl" || get(engineKind) === "flux1");
  let engineGroups = user_derived(() => {
    var _a, _b, _c;
    return {
      sdxl: (((_a = caps()) == null ? void 0 : _a.engineModels) || []).filter((m) => m.architecture === "sdxl"),
      flux1: (((_b = caps()) == null ? void 0 : _b.engineModels) || []).filter((m) => m.architecture === "flux"),
      qwen: (((_c = caps()) == null ? void 0 : _c.engineModels) || []).filter((m) => m.architecture === "qwen_edit")
    };
  });
  let engineChoices = user_derived(() => {
    var _a, _b, _c;
    return (((_a = caps()) == null ? void 0 : _a.graftable) ? 1 : 0) + (((_c = (_b = caps()) == null ? void 0 : _b.engineModels) == null ? void 0 : _c.length) || 0) + 1;
  });
  let engineSelectGroups = user_derived(() => {
    var _a;
    return [
      ...((_a = caps()) == null ? void 0 : _a.graftable) ? [
        {
          label: "",
          options: [
            {
              value: "source",
              label: "Source model — this image's own workflow (default)"
            }
          ]
        }
      ] : [],
      ...get(engineGroups).sdxl.length ? [
        {
          label: "SDXL — tiled re-detail",
          options: get(engineGroups).sdxl.map((m) => ({ value: m.hash, label: m.displayName }))
        }
      ] : [],
      ...get(engineGroups).flux1.length ? [
        {
          label: "FLUX.1 — tiled re-detail",
          options: get(engineGroups).flux1.map((m) => ({ value: m.hash, label: m.displayName }))
        }
      ] : [],
      ...get(engineGroups).qwen.length ? [
        {
          label: "Qwen Edit — instruction enhance",
          options: get(engineGroups).qwen.map((m) => ({ value: m.hash, label: m.displayName }))
        }
      ] : [],
      {
        label: "Plain upscale",
        options: [
          {
            value: "plain",
            label: "Model climb only — no re-detail pass"
          }
        ]
      }
    ];
  });
  let recSampler = user_derived(() => {
    var _a;
    return get(engineKind) === "sdxl" ? "dpmpp_2m" : get(engineKind) === "flux1" || get(engineKind) === "qwen" ? "euler" : (_a = caps()) == null ? void 0 : _a.recommendedSampler;
  });
  let recScheduler = user_derived(() => {
    var _a;
    return get(engineKind) === "sdxl" ? "karras" : get(engineKind) === "flux1" || get(engineKind) === "qwen" ? "simple" : (_a = caps()) == null ? void 0 : _a.recommendedScheduler;
  });
  let advDefaults = user_derived(() => {
    var _a, _b;
    return get(engineEntry) ? ((_a = get(engineEntry).defaults) == null ? void 0 : _a.advanced) || {} : ((_b = caps()) == null ? void 0 : _b.advancedDefaults) || {};
  });
  let denoiseMax = user_derived(() => {
    var _a, _b, _c;
    return get(tileEngine) ? ((_b = (_a = get(engineEntry)) == null ? void 0 : _a.defaults) == null ? void 0 : _b.denoiseMax) || 0.4 : ((_c = caps()) == null ? void 0 : _c.denoiseMax) || 0.7;
  });
  let denoiseDefault = user_derived(() => {
    var _a, _b, _c;
    return get(tileEngine) ? ((_b = (_a = get(engineEntry)) == null ? void 0 : _a.defaults) == null ? void 0 : _b.denoise) ?? (get(engineKind) === "flux1" ? 0.2 : 0.15) : (_c = caps()) == null ? void 0 : _c.defaultDenoise;
  });
  user_effect(() => {
    if ($$props.open && caps()) untrack(() => {
      var _a, _b, _c, _d, _e;
      set(mode, caps().defaultMode || "prompt", true);
      set(depthSource, caps().defaultDepthSource || "pose", true);
      set(savePrefix, caps().defaultSavePrefix || "upscale/upscale", true);
      set(upscaleBy, caps().defaultUpscaleBy || 2, true);
      set(denoise, caps().defaultDenoise ?? 0.3, true);
      set(sampler, caps().defaultSampler || caps().recommendedSampler || "", true);
      set(scheduler, caps().defaultScheduler || caps().recommendedScheduler || "", true);
      set(canvasMode, "grow");
      try {
        const saved = localStorage.getItem(ultrasharpStorageKey());
        set(ultrasharpUnder, saved == null ? get(wholeImageRegion) : saved === "1", true);
      } catch {
        set(ultrasharpUnder, get(wholeImageRegion), true);
      }
      set(condition, onUseInEdit() && ((_b = (_a = caps().conditions) == null ? void 0 : _a.ipadapter) == null ? void 0 : _b.ok) ? "ipadapter" : "none", true);
      memoryPrompt = null;
      set(engineSel, caps().graftable ? "source" : "plain", true);
      set(prompt, prefillFor(caps().graftable ? "source" : "plain"), true);
      set(plainEngine, caps().seedvr2Available ? "seedvr2" : "ultrasharp", true);
      set(climbStage, caps().recommendedRestore === "seedvr2" ? "seedvr2" : "ultrasharp", true);
      set(climbModel, caps().recommendedUpscaleModel || "", true);
      set(preserveDefocus, true);
      set(advanced, {}, true);
      set(advancedOpen, false);
      const modelKey = ((_c = caps().sourceModelInfo) == null ? void 0 : _c.hash) || "";
      const modelMem = modelKey ? recallModalMemory("upscale-model", modelKey) : null;
      if ((modelMem == null ? void 0 : modelMem.plainEngine) === "ultrasharp" || (modelMem == null ? void 0 : modelMem.plainEngine) === "seedvr2" && caps().seedvr2Available) {
        set(plainEngine, modelMem.plainEngine, true);
      }
      if (typeof (modelMem == null ? void 0 : modelMem.denoise) === "number") set(denoise, modelMem.denoise, true);
      const mem = recallModalMemory("upscale", imageKey());
      const memEngine = (mem == null ? void 0 : mem.engine) === "ultrasharp" || (mem == null ? void 0 : mem.engine) === "seedvr2" ? "plain" : mem == null ? void 0 : mem.engine;
      const memEngineValid = memEngine === "source" ? !!caps().graftable : memEngine === "plain" ? true : !!memEngine && !!((_d = caps().engineModels) == null ? void 0 : _d.some((m) => m.hash === memEngine));
      if (memEngineValid) {
        memoryPrompt = typeof mem.prompt === "string" && mem.prompt.trim() ? mem.prompt : null;
        pickEngine(memEngine);
        if (memEngine === "source" && typeof (modelMem == null ? void 0 : modelMem.denoise) === "number") set(denoise, modelMem.denoise, true);
        if (typeof mem.denoise === "number") set(denoise, mem.denoise, true);
        if ((mem.climbStage === "seedvr2" || mem.engine === "seedvr2") && caps().seedvr2Available) set(climbStage, "seedvr2");
        if (mem.climbModel && ((_e = caps().upscaleModelOptions) == null ? void 0 : _e.includes(mem.climbModel))) set(climbModel, mem.climbModel, true);
        if (mem.plainEngine === "ultrasharp" || mem.plainEngine === "seedvr2" && caps().seedvr2Available) set(plainEngine, mem.plainEngine, true);
      }
      requestAnimationFrame(() => confirmBtn == null ? void 0 : confirmBtn.focus());
    });
  });
  let memoryPrompt = null;
  function basePrefillFor(kind) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    if (kind === "qwen") return ((_b = (_a = caps()) == null ? void 0 : _a.enginePromptDefaults) == null ? void 0 : _b.qwen) || "";
    if (kind === "sdxl" || kind === "flux1") {
      const srcArch = ((_c = caps()) == null ? void 0 : _c.architecture) || ((_e = (_d = caps()) == null ? void 0 : _d.sourceModelInfo) == null ? void 0 : _e.architecture) || "";
      const descriptive = srcArch === "qwen_edit" ? "" : (_f = caps()) == null ? void 0 : _f.prefillPrompt;
      return descriptive || ((_h = (_g = caps()) == null ? void 0 : _g.enginePromptDefaults) == null ? void 0 : _h.sdxlFallback) || "";
    }
    if (kind === "source" && get(mode) === "regional" && ((_i = caps()) == null ? void 0 : _i.graftable)) {
      const ref = ((_j = caps()) == null ? void 0 : _j.referencePrompt) || "";
      if (/\$\w+\s*\{/.test(ref)) return ref;
    }
    return ((_k = caps()) == null ? void 0 : _k.prefillPrompt) || "";
  }
  function prefillFor(kind) {
    if (typeof memoryPrompt === "string" && memoryPrompt.trim()) return memoryPrompt;
    return basePrefillFor(kind);
  }
  function pickEngine(value) {
    var _a, _b, _c, _d, _e, _f, _g;
    set(engineSel, value, true);
    const entry = ((_b = (_a = caps()) == null ? void 0 : _a.engineModels) == null ? void 0 : _b.find((m) => m.hash === value)) || null;
    const kind = entry ? entry.architecture === "qwen_edit" ? "qwen" : entry.architecture === "flux" ? "flux1" : "sdxl" : value === "source" ? "source" : "plain";
    set(advanced, {}, true);
    const d = entry == null ? void 0 : entry.defaults;
    set(denoise, (d == null ? void 0 : d.denoise) ?? ((_c = caps()) == null ? void 0 : _c.defaultDenoise) ?? 0.3, true);
    set(sampler, (d == null ? void 0 : d.sampler) ?? (((_d = caps()) == null ? void 0 : _d.defaultSampler) || ((_e = caps()) == null ? void 0 : _e.recommendedSampler) || ""), true);
    set(scheduler, (d == null ? void 0 : d.scheduler) ?? (((_f = caps()) == null ? void 0 : _f.defaultScheduler) || ((_g = caps()) == null ? void 0 : _g.recommendedScheduler) || ""), true);
    set(prompt, prefillFor(kind), true);
  }
  function editorModelInfo() {
    var _a;
    if (get(engineEntry)) return {
      hash: get(engineEntry).hash,
      architecture: get(engineEntry).architecture
    };
    return ((_a = caps()) == null ? void 0 : _a.sourceModelInfo) || null;
  }
  let promptSeedKey = user_derived(() => get(engineKind) + (get(engineKind) === "source" && get(mode) === "regional" ? ":regional" : ""));
  function promptEditor(node) {
    let disposed = false;
    let view = null;
    (async () => {
      var _a;
      if (!mountPromptEditor()) return;
      const v = await mountPromptEditor()(
        node,
        untrack(() => prefillFor(get(engineKind))),
        (text) => {
          set(prompt, text, true);
        },
        editorModelInfo
      );
      if (disposed) (_a = v == null ? void 0 : v.destroy) == null ? void 0 : _a.call(v);
      else view = v;
    })().catch((e) => console.error("[Upscale] prompt editor mount failed", e));
    return {
      destroy() {
        var _a;
        disposed = true;
        (_a = view == null ? void 0 : view.destroy) == null ? void 0 : _a.call(view);
      }
    };
  }
  user_effect(() => {
    if (!$$props.open) return;
    const onKey = (e) => {
      var _a;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        confirm("background");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && refEl && document.activeElement === refEl) {
        const text = refEl.selectionStart !== refEl.selectionEnd ? refEl.value.slice(refEl.selectionStart, refEl.selectionEnd) : refEl.value;
        (_a = navigator.clipboard) == null ? void 0 : _a.writeText(text);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  const ADV_SLIDERS = [
    { name: "steps", label: "Steps", min: 1, max: 60, step: 1 },
    { name: "cfg", label: "CFG", min: 1, max: 15, step: 0.1 },
    {
      name: "tile_width",
      label: "Tile W",
      min: 256,
      max: 2048,
      step: 64
    },
    {
      name: "tile_height",
      label: "Tile H",
      min: 256,
      max: 2048,
      step: 64
    },
    {
      name: "mask_blur",
      label: "Mask blur",
      min: 0,
      max: 64,
      step: 1
    },
    {
      name: "tile_padding",
      label: "Padding",
      min: 0,
      max: 128,
      step: 8
    },
    {
      name: "seam_fix_denoise",
      label: "Seam den.",
      min: 0,
      max: 1,
      step: 0.01
    }
  ];
  const ADV_COMBOS = [
    {
      name: "mode_type",
      label: "Tiling",
      optionsKey: "modeOptions"
    },
    {
      name: "seam_fix_mode",
      label: "Seam fix",
      optionsKey: "seamFixOptions"
    }
  ];
  function advValue(name) {
    var _a;
    return get(advanced)[name] ?? ((_a = get(advDefaults)) == null ? void 0 : _a[name]);
  }
  function setAdv(name, value) {
    set(advanced, { ...get(advanced), [name]: value }, true);
  }
  const RES_TARGETS = [
    { pixels: 1024, label: "1K" },
    { pixels: 2048, label: "2K" },
    { pixels: 3072, label: "3K" },
    { pixels: 4096, label: "4K" },
    { pixels: 5120, label: "5K" },
    { pixels: 6144, label: "6K" },
    { pixels: 7168, label: "7K" },
    { pixels: 8192, label: "8K" }
  ];
  let scaleSlider = user_derived(() => (() => {
    const longest = onUseInEdit() && docWidth() > 0 ? Math.max(docWidth(), docHeight()) : Math.max(width() || 0, height() || 0);
    if (!longest) return { min: 1, max: 8, ticks: null };
    const ticks = RES_TARGETS.map((t) => ({
      value: Math.round(t.pixels / longest * 100) / 100,
      label: t.label
    })).filter((t) => t.value >= 1 && t.value <= 8);
    const top = ticks.length ? ticks[ticks.length - 1].value : 8;
    return {
      min: 1,
      max: Math.min(8, Math.round(top * 1.08 * 100) / 100),
      ticks: ticks.length ? ticks : null
    };
  })());
  const MODE_ROWS = [
    {
      key: "prompt",
      label: "Prompt only",
      desc: "Re-detail each tile with the image's prompt."
    },
    {
      key: "depth",
      label: "Prompt + depth",
      desc: "Adds a depth ControlNet so structure can't drift."
    },
    {
      key: "regional",
      label: "Regional + 3D depth",
      desc: "Per-figure prompts plus pose depth for multi-character scenes."
    }
  ];
  const PROGRESS_TEXT = {
    building: "Building the upscale graph…",
    "rendering-pose": "Re-rendering the 3D pose maps…",
    queueing: "Queueing…",
    running: "Upscaling…"
  };
  let targetRes = user_derived(() => width() && height() ? `${Math.round(width() * get(upscaleBy))}×${Math.round(height() * get(upscaleBy))}` : "");
  let needsGrow = user_derived(() => !!onUseInEdit() && docWidth() > 0 && get(upscaleBy) > 1.02);
  let grownW = user_derived(() => Math.round(docWidth() * get(upscaleBy)));
  let grownH = user_derived(() => Math.round(docHeight() * get(upscaleBy)));
  let wholeImageRegion = user_derived(() => !!onUseInEdit() && docWidth() > 0 && width() * height() >= 0.9 * docWidth() * docHeight());
  let landsInFootprint = user_derived(() => !!onUseInEdit() && (!get(needsGrow) || get(canvasMode) === "keep"));
  function ultrasharpStorageKey() {
    return get(wholeImageRegion) ? "pcr-edit-ultrasharp-under-whole" : "pcr-edit-ultrasharp-under-region";
  }
  function setUltrasharpUnder(v) {
    set(ultrasharpUnder, v, true);
    try {
      localStorage.setItem(ultrasharpStorageKey(), v ? "1" : "0");
    } catch {
    }
  }
  let progressPercent = user_derived(() => (() => {
    var _a;
    if (((_a = progress()) == null ? void 0 : _a.phase) !== "running") return null;
    if (progress().tile && progress().totalTiles && progress().max) {
      return Math.min(100, Math.round((progress().tile - 1 + progress().value / progress().max) / progress().totalTiles * 100));
    }
    if (progress().prep && progress().max) return Math.round(progress().value / progress().max * 100);
    return null;
  })());
  let progressStatus = user_derived(() => (() => {
    var _a, _b;
    if (((_a = progress()) == null ? void 0 : _a.phase) !== "running") return PROGRESS_TEXT[(_b = progress()) == null ? void 0 : _b.phase] || "Working…";
    if (progress().tile) return `Re-detailing tiles · ${get(progressPercent)}%`;
    if (progress().prep) return progress().model ? `Enlarging with ${progress().model}…` : "Enlarging image…";
    return "Waiting for the sampler…";
  })());
  function fmtEta(s) {
    if (s == null) return "";
    if (s < 60) return `~${s}s left`;
    return `~${Math.floor(s / 60)}m ${s % 60}s left`;
  }
  let progressLabel = user_derived(() => (() => {
    var _a;
    if (((_a = progress()) == null ? void 0 : _a.phase) !== "running") return "";
    if (progress().tile && progress().totalTiles) {
      const eta = fmtEta(progress().etaSec);
      return `Tile ${progress().tile} / ${progress().totalTiles} · step ${progress().value}/${progress().max}${eta ? ` · ${eta}` : ""}`;
    }
    if (progress().prep && progress().max) return `${progress().value} / ${progress().max}`;
    return "";
  })());
  let currentModeRow = user_derived(() => MODE_ROWS.find((r) => r.key === get(mode)) || MODE_ROWS[0]);
  function pickModeKey(key2) {
    const r = MODE_ROWS.find((x) => x.key === key2);
    if (r) pick(r);
  }
  function pick(row) {
    var _a, _b, _c, _d, _e;
    if (!((_c = (_b = (_a = caps()) == null ? void 0 : _a.modes) == null ? void 0 : _b[row.key]) == null ? void 0 : _c.ok)) return;
    const wasRegional = get(mode) === "regional";
    set(mode, row.key, true);
    if (row.key === "depth" && !((_e = (_d = caps().sources) == null ? void 0 : _d[get(depthSource)]) == null ? void 0 : _e.ok)) {
      set(depthSource, get(depthSource) === "pose" ? "image" : "pose", true);
    }
    if (wasRegional !== (get(mode) === "regional")) {
      memoryPrompt = null;
      set(prompt, prefillFor(get(engineKind)), true);
    }
  }
  async function confirm(action2) {
    var _a, _b, _c, _d, _e, _f;
    if (get(
      runActive
      // a run is live; done/error/cancelled can re-run
    )) return;
    if (get(condition) !== "none" && !isCondInstalled(get(condition)) && onInstallPack()) {
      await onInstallPack()(PACK_FOR[get(condition)]);
      return;
    }
    if ((get(climbStage) === "seedvr2" || get(plainEngine) === "seedvr2") && !((_a = caps()) == null ? void 0 : _a.seedvr2Available) && onInstallPack()) {
      await onInstallPack()("SeedVR2");
      return;
    }
    const base = {
      savePrefix: get(savePrefix).trim(),
      sampler: get(sampler),
      scheduler: get(scheduler),
      upscaleBy: get(upscaleBy),
      denoise: get(denoise),
      target: action2
    };
    if (onUseInEdit()) {
      base.canvasMode = get(
        needsGrow
        // ≤1×: render fits the region natively, nothing to grow
      ) ? get(canvasMode) : "keep";
      base.ultrasharpUnder = base.canvasMode === "keep" && get(ultrasharpUnder);
      base.plainEngine = get(plainEngine);
    }
    base.condition = get(condition);
    base.engine = get(engineKind) === "source" ? "source" : (
      // Consolidated plain entry: Restore decides which floor builds.
      get(engineKind) === "plain" ? get(climbStage) === "seedvr2" && ((_b = caps()) == null ? void 0 : _b.seedvr2Available) ? "seedvr2" : "ultrasharp" : get(engineKind) === "qwen" ? "qwen-edit" : get(engineKind) === "flux1" ? "flux1-unet" : "sdxl-ckpt"
    );
    if (get(engineEntry)) base.engineModel = {
      hash: get(engineEntry).hash,
      filename: get(engineEntry).filename
    };
    if (get(tileEngine) && get(climbStage) !== "ultrasharp") base.climbStage = get(climbStage);
    if (get(engineKind) !== "source" && get(climbModel)) base.climbModel = get(climbModel);
    if (get(engineKind) === "source" && ((_c = caps()) == null ? void 0 : _c.architecture) === "flux2") base.preserveDefocus = get(preserveDefocus);
    if (get(tileEngine) || get(engineKind) === "qwen") {
      base.prompt = get(prompt);
    } else if (get(prompt).trim() && get(prompt).trim() !== basePrefillFor(get(engineKind)).trim()) {
      base.prompt = get(prompt);
    }
    if (Object.keys(get(advanced)).length) base.advanced = { ...get(advanced) };
    storeModalMemory("upscale", imageKey(), {
      engine: get(engineKind) === "source" ? "source" : get(engineSel),
      prompt: get(prompt),
      denoise: get(denoise),
      climbStage: get(engineKind) !== "source" ? get(climbStage) : void 0,
      climbModel: get(engineKind) !== "source" ? get(climbModel) : void 0,
      plainEngine: onUseInEdit() ? get(plainEngine) : void 0
    });
    saveModalSetup(
      fetchApi(),
      imageKey(),
      "upscale",
      {
        mode: get(mode),
        depthSource: get(depthSource),
        upscaleBy: get(upscaleBy),
        denoise: get(denoise),
        sampler: get(sampler),
        scheduler: get(scheduler),
        condition: get(condition),
        preserveDefocus: get(preserveDefocus),
        engine: get(engineSel),
        climbStage: get(climbStage),
        climbModel: get(climbModel),
        prompt: get(prompt),
        advanced: { ...get(advanced) }
      },
      { w: docWidth() || width(), h: docHeight() || height() }
    );
    const memModelKey = ((_e = (_d = caps()) == null ? void 0 : _d.sourceModelInfo) == null ? void 0 : _e.hash) || "";
    if (memModelKey) {
      storeModalMemory("upscale-model", memModelKey, {
        ...recallModalMemory("upscale-model", memModelKey) || {},
        ...onUseInEdit() ? { plainEngine: get(plainEngine) } : {},
        ...get(engineKind) === "source" ? { denoise: get(denoise) } : {}
      });
    }
    (_f = $$props.onConfirm) == null ? void 0 : _f.call($$props, get(sourceGraftable) ? { mode: get(mode), depthSource: get(depthSource), ...base } : base);
  }
  let runActive = user_derived(() => !!progress() && progress().phase !== "done" && progress().phase !== "error" && progress().phase !== "cancelled");
  let savedSetup = state(null);
  let promptRestoreNonce = state(
    0
    // bump to force the prompt editor to reseed
  );
  user_effect(() => {
    if (!$$props.open || !fetchApi() || !imageKey()) {
      set(savedSetup, null);
      return;
    }
    let cancelled = false;
    loadModalSetup(fetchApi(), imageKey()).then((doc) => {
      var _a;
      if (cancelled || !doc) return;
      const up = (_a = doc.kinds) == null ? void 0 : _a.upscale;
      const keyW = docWidth() || width(), keyH = docHeight() || height();
      const dimsOk = !doc.dims || doc.dims.w === keyW && doc.dims.h === keyH;
      set(savedSetup, up && dimsOk ? up : null, true);
    });
    return () => {
      cancelled = true;
    };
  });
  function applySavedSetup() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    const s = get(savedSetup);
    if (!s) return;
    if (typeof s.mode === "string" && ((_c = (_b = (_a = caps()) == null ? void 0 : _a.modes) == null ? void 0 : _b[s.mode]) == null ? void 0 : _c.ok)) set(mode, s.mode, true);
    if (typeof s.depthSource === "string" && ((_f = (_e = (_d = caps()) == null ? void 0 : _d.sources) == null ? void 0 : _e[s.depthSource]) == null ? void 0 : _f.ok)) set(depthSource, s.depthSource, true);
    if (typeof s.upscaleBy === "number") set(upscaleBy, Math.max(get(scaleSlider).min, Math.min(get(scaleSlider).max, s.upscaleBy)), true);
    if (typeof s.condition === "string") set(condition, s.condition, true);
    if (typeof s.preserveDefocus === "boolean") set(preserveDefocus, s.preserveDefocus, true);
    if (s.advanced && typeof s.advanced === "object") set(advanced, { ...s.advanced }, true);
    if (typeof s.engine === "string") {
      const ok = s.engine === "source" ? !!((_g = caps()) == null ? void 0 : _g.graftable) : s.engine === "plain" ? true : !!((_i = (_h = caps()) == null ? void 0 : _h.engineModels) == null ? void 0 : _i.some((m) => m.hash === s.engine));
      if (ok) {
        memoryPrompt = null;
        pickEngine(s.engine);
      }
    }
    if (typeof s.denoise === "number") set(denoise, s.denoise, true);
    if (typeof s.sampler === "string") set(sampler, s.sampler, true);
    if (typeof s.scheduler === "string") set(scheduler, s.scheduler, true);
    if (s.climbStage === "ultrasharp") set(climbStage, "ultrasharp");
    else if (s.climbStage === "seedvr2" && ((_j = caps()) == null ? void 0 : _j.seedvr2Available)) set(climbStage, "seedvr2");
    if (typeof s.climbModel === "string" && ((_l = (_k = caps()) == null ? void 0 : _k.upscaleModelOptions) == null ? void 0 : _l.includes(s.climbModel))) set(climbModel, s.climbModel, true);
    if (typeof s.prompt === "string" && s.prompt.trim()) {
      memoryPrompt = s.prompt;
      set(prompt, s.prompt, true);
      update(promptRestoreNonce);
    }
    set(
      savedSetup,
      null
      // dismiss the chip once applied
    );
  }
  let liveTile = user_derived(() => {
    var _a;
    return get(runActive) && ((_a = progress()) == null ? void 0 : _a.previewUrl) ? progress().previewUrl : null;
  });
  let inspectSrc = user_derived(() => {
    var _a;
    return ((_a = progress()) == null ? void 0 : _a.resultUrl) ? progress().resultUrl : get(runActive) ? null : previewUrl() || null;
  });
  let stageEl;
  let imgNatW = state(0);
  let imgNatH = state(0);
  let zoom = state(1);
  let panX = state(0);
  let panY = state(0);
  let panning = false;
  let panLast = null;
  function fitView() {
    if (!stageEl || !get(imgNatW) || !get(imgNatH)) {
      set(zoom, 1);
      set(panX, 0);
      set(panY, 0);
      return;
    }
    const r = stageEl.getBoundingClientRect();
    set(zoom, Math.min(r.width / get(imgNatW), r.height / get(imgNatH), 1) || 1, true);
    set(panX, (r.width - get(imgNatW) * get(zoom)) / 2);
    set(panY, (r.height - get(imgNatH) * get(zoom)) / 2);
  }
  function onPreviewLoad(e) {
    set(imgNatW, e.currentTarget.naturalWidth || 0, true);
    set(imgNatH, e.currentTarget.naturalHeight || 0, true);
    fitView();
  }
  function onStageDown(e) {
    var _a, _b;
    if (e.button > 2 || !get(inspectSrc)) return;
    if ((_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".pcr-up-zoomctl")) return;
    panning = true;
    panLast = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    stageEl.setPointerCapture(e.pointerId);
  }
  function onStageMove(e) {
    if (!panning) return;
    set(panX, get(panX) + (e.clientX - panLast.x));
    set(panY, get(panY) + (e.clientY - panLast.y));
    panLast = { x: e.clientX, y: e.clientY };
  }
  function onStageUp(e) {
    if (!panning) return;
    panning = false;
    panLast = null;
    try {
      stageEl.releasePointerCapture(e.pointerId);
    } catch {
    }
  }
  function onStageWheel(e) {
    if (!get(inspectSrc) || !get(imgNatW)) return;
    e.preventDefault();
    const r = stageEl.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nz = Math.max(0.05, Math.min(12, get(zoom) * f));
    set(panX, cx - (cx - get(panX)) / get(zoom) * nz);
    set(panY, cy - (cy - get(panY)) / get(zoom) * nz);
    set(zoom, nz, true);
  }
  let compareSplit = state(false);
  let splitX = state(0);
  let splitDragging = false;
  let canCompare = user_derived(() => {
    var _a;
    return !get(runActive) && !!previewUrl() && !!((_a = progress()) == null ? void 0 : _a.resultUrl);
  });
  user_effect(() => {
    if (!get(canCompare) && get(compareSplit)) set(compareSplit, false);
  });
  function toggleCompare() {
    if (!get(canCompare)) return;
    set(compareSplit, !get(compareSplit));
    if (get(compareSplit)) {
      const r = stageEl == null ? void 0 : stageEl.getBoundingClientRect();
      set(
        splitX,
        r ? r.width / 2 : 0,
        // open centered so both halves show
        true
      );
    }
  }
  function onSplitDown(e) {
    e.stopPropagation();
    e.preventDefault();
    splitDragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onSplitMove(e) {
    if (!splitDragging) return;
    e.stopPropagation();
    const r = stageEl.getBoundingClientRect();
    set(splitX, Math.max(0, Math.min(r.width, e.clientX - r.left)), true);
  }
  function onSplitUp(e) {
    splitDragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
  }
  function handleKeydown(e) {
    var _a, _b, _c;
    const typing = /^(INPUT|TEXTAREA)$/.test(((_a = e.target) == null ? void 0 : _a.tagName) || "") || ((_b = e.target) == null ? void 0 : _b.isContentEditable);
    if (e.key === "Enter" && !typing) {
      e.preventDefault();
      e.stopPropagation();
      confirm("background");
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (!get(runActive)) (_c = $$props.onCancel) == null ? void 0 : _c.call($$props);
    }
  }
  var fragment = comment();
  var node_1 = first_child(fragment);
  {
    var consequent_43 = ($$anchor2) => {
      var div = root_1$6();
      let styles;
      var div_1 = child(div);
      var div_2 = child(div_1);
      var span = child(div_2);
      var text_1 = child(span);
      var node_2 = sibling(span, 2);
      {
        var consequent = ($$anchor3) => {
          var button = root_2$6();
          delegated("click", button, function(...$$args) {
            var _a;
            (_a = $$props.onCancel) == null ? void 0 : _a.apply(this, $$args);
          });
          append($$anchor3, button);
        };
        if_block(node_2, ($$render) => {
          if (!get(runActive)) $$render(consequent);
        });
      }
      var div_3 = sibling(div_2, 2);
      var div_4 = child(div_3);
      var div_5 = child(div_4);
      let classes;
      var node_3 = child(div_5);
      {
        var consequent_1 = ($$anchor3) => {
          var img = root_3$5();
          template_effect(() => set_attribute(img, "src", get(liveTile)));
          append($$anchor3, img);
        };
        var consequent_5 = ($$anchor3) => {
          var fragment_1 = root_4$6();
          var div_6 = first_child(fragment_1);
          var img_1 = child(div_6);
          var node_4 = sibling(div_6, 2);
          {
            var consequent_2 = ($$anchor4) => {
              var fragment_2 = root_5$5();
              var div_7 = first_child(fragment_2);
              var div_8 = child(div_7);
              var img_2 = child(div_8);
              var div_9 = sibling(div_7, 6);
              template_effect(() => {
                set_style(div_7, `clip-path: inset(0 calc(100% - ${get(splitX) ?? ""}px) 0 0);`);
                set_style(div_8, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""});`);
                set_attribute(img_2, "src", previewUrl());
                set_attribute(img_2, "width", get(imgNatW));
                set_attribute(img_2, "height", get(imgNatH));
                set_style(div_9, `left: ${get(splitX) ?? ""}px;`);
              });
              delegated("pointerdown", div_9, onSplitDown);
              delegated("pointermove", div_9, onSplitMove);
              delegated("pointerup", div_9, onSplitUp);
              event("pointercancel", div_9, onSplitUp);
              append($$anchor4, fragment_2);
            };
            if_block(node_4, ($$render) => {
              if (get(compareSplit) && get(canCompare)) $$render(consequent_2);
            });
          }
          var node_5 = sibling(node_4, 2);
          {
            var consequent_4 = ($$anchor4) => {
              var div_10 = root_6$4();
              var span_1 = child(div_10);
              var text_2 = child(span_1);
              var node_6 = sibling(span_1, 2);
              {
                var consequent_3 = ($$anchor5) => {
                  var button_1 = root_7$4();
                  let classes_1;
                  template_effect(() => classes_1 = set_class(button_1, 1, "pcr-up-fit-btn svelte-xw7bpl", null, classes_1, { on: get(compareSplit) }));
                  delegated("click", button_1, toggleCompare);
                  append($$anchor5, button_1);
                };
                if_block(node_6, ($$render) => {
                  if (get(canCompare)) $$render(consequent_3);
                });
              }
              var button_2 = sibling(node_6, 2);
              template_effect(($0) => set_text(text_2, `${$0 ?? ""}%`), [() => Math.round(get(zoom) * 100)]);
              delegated("click", button_2, fitView);
              append($$anchor4, div_10);
            };
            if_block(node_5, ($$render) => {
              if (get(imgNatW)) $$render(consequent_4);
            });
          }
          template_effect(() => {
            set_style(div_6, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""});`);
            set_attribute(img_1, "src", get(inspectSrc));
          });
          event("load", img_1, onPreviewLoad);
          append($$anchor3, fragment_1);
        };
        if_block(node_3, ($$render) => {
          if (get(liveTile)) $$render(consequent_1);
          else if (get(inspectSrc)) $$render(consequent_5, 1);
        });
      }
      bind_this(div_5, ($$value) => stageEl = $$value, () => stageEl);
      var node_7 = sibling(div_5, 2);
      {
        var consequent_9 = ($$anchor3) => {
          var div_11 = root_8$4();
          var node_8 = child(div_11);
          {
            var consequent_6 = ($$anchor4) => {
              var div_12 = root_9$4();
              var text_3 = child(div_12);
              template_effect(() => set_text(text_3, `Done${progress().filename ? ` — ${progress().filename}` : ""}`));
              append($$anchor4, div_12);
            };
            var consequent_7 = ($$anchor4) => {
              var div_13 = root_10$4();
              var text_4 = child(div_13);
              template_effect(() => set_text(text_4, progress().message || "Failed"));
              append($$anchor4, div_13);
            };
            var alternate = ($$anchor4) => {
              var fragment_3 = root_11$3();
              var div_14 = first_child(fragment_3);
              var text_5 = child(div_14);
              var div_15 = sibling(div_14, 2);
              var div_16 = child(div_15);
              let classes_2;
              var node_9 = sibling(div_15, 2);
              {
                var consequent_8 = ($$anchor5) => {
                  var div_17 = root_12$4();
                  var text_6 = child(div_17);
                  template_effect(() => set_text(text_6, get(progressLabel)));
                  append($$anchor5, div_17);
                };
                if_block(node_9, ($$render) => {
                  if (get(progressLabel)) $$render(consequent_8);
                });
              }
              template_effect(() => {
                set_text(text_5, get(progressStatus));
                classes_2 = set_class(div_16, 1, "pcr-up-bar-fill svelte-xw7bpl", null, classes_2, { indeterminate: get(progressPercent) == null });
                set_style(div_16, get(progressPercent) != null ? `width: ${get(progressPercent)}%` : "");
              });
              append($$anchor4, fragment_3);
            };
            if_block(node_8, ($$render) => {
              if (progress().phase === "done") $$render(consequent_6);
              else if (progress().phase === "error") $$render(consequent_7, 1);
              else $$render(alternate, -1);
            });
          }
          append($$anchor3, div_11);
        };
        if_block(node_7, ($$render) => {
          if (progress()) $$render(consequent_9);
        });
      }
      var div_18 = sibling(div_4, 2);
      let classes_3;
      var node_10 = child(div_18);
      {
        var consequent_10 = ($$anchor3) => {
          var button_3 = root_13$4();
          delegated("click", button_3, applySavedSetup);
          append($$anchor3, button_3);
        };
        if_block(node_10, ($$render) => {
          if (get(savedSetup) && !progress()) $$render(consequent_10);
        });
      }
      var node_11 = sibling(node_10, 2);
      {
        var consequent_11 = ($$anchor3) => {
          var p = root_14$4();
          append($$anchor3, p);
        };
        if_block(node_11, ($$render) => {
          var _a;
          if (!((_a = caps()) == null ? void 0 : _a.graftable) && get(engineKind) === "plain") $$render(consequent_11);
        });
      }
      var node_12 = sibling(node_11, 2);
      {
        var consequent_15 = ($$anchor3) => {
          var div_19 = root_15$4();
          var div_20 = sibling(child(div_19), 2);
          var node_13 = child(div_20);
          SearchableSelect(node_13, {
            id: "pcr-up-engine",
            get value() {
              return get(engineSel);
            },
            get groups() {
              return get(engineSelectGroups);
            },
            popupKey: "upscale-engine",
            onpick: (v) => {
              memoryPrompt = null;
              pickEngine(v);
            }
          });
          var node_14 = sibling(node_13, 2);
          {
            var consequent_12 = ($$anchor4) => {
              var span_2 = root_16$4();
              var text_7 = child(span_2);
              template_effect(() => set_text(text_7, get(engineKind) === "flux1" ? "the climb model below pushes to the target, then this FLUX.1 model re-details every tile with the prompt below — low denoise holds structure without a ControlNet" : "the climb model below pushes to the target, then this checkpoint re-details every tile (structure locked by a tile ControlNet) with the prompt below"));
              append($$anchor4, span_2);
            };
            var consequent_13 = ($$anchor4) => {
              var span_3 = root_17$4();
              append($$anchor4, span_3);
            };
            var consequent_14 = ($$anchor4) => {
              var span_4 = root_18$4();
              append($$anchor4, span_4);
            };
            if_block(node_14, ($$render) => {
              if (get(tileEngine)) $$render(consequent_12);
              else if (get(engineKind) === "qwen") $$render(consequent_13, 1);
              else if (get(engineKind) === "plain") $$render(consequent_14, 2);
            });
          }
          append($$anchor3, div_19);
        };
        if_block(node_12, ($$render) => {
          if (get(engineChoices) > 1) $$render(consequent_15);
        });
      }
      var node_15 = sibling(node_12, 2);
      {
        var consequent_17 = ($$anchor3) => {
          var div_21 = root_19$4();
          var select = sibling(child(div_21), 2);
          each(select, 21, () => MODE_ROWS, index, ($$anchor4, row) => {
            var option = root_20$4();
            var text_8 = child(option);
            var option_value = {};
            template_effect(() => {
              var _a, _b;
              option.disabled = !((_a = caps().modes[get(row).key]) == null ? void 0 : _a.ok);
              set_attribute(option, "title", ((_b = caps().modes[get(row).key]) == null ? void 0 : _b.reason) || "");
              set_text(text_8, get(row).label);
              if (option_value !== (option_value = get(row).key)) {
                option.value = (option.__value = get(row).key) ?? "";
              }
            });
            append($$anchor4, option);
          });
          var select_value;
          init_select(select);
          var div_22 = sibling(select, 2);
          var text_9 = child(div_22);
          var node_16 = sibling(div_22, 2);
          {
            var consequent_16 = ($$anchor4) => {
              var div_23 = root_21$3();
              var div_24 = sibling(child(div_23), 2);
              var div_25 = child(div_24);
              let classes_4;
              var div_26 = sibling(div_25, 2);
              let classes_5;
              template_effect(() => {
                classes_4 = set_class(div_25, 1, "pcr-up-seg-opt svelte-xw7bpl", null, classes_4, {
                  active: get(depthSource) === "pose",
                  disabled: !caps().sources.pose.ok
                });
                set_attribute(div_25, "title", caps().sources.pose.ok ? "" : "No 3D pose in this image's workflow");
                classes_5 = set_class(div_26, 1, "pcr-up-seg-opt svelte-xw7bpl", null, classes_5, {
                  active: get(depthSource) === "image",
                  disabled: !caps().sources.image.ok
                });
              });
              delegated("click", div_25, () => {
                if (caps().sources.pose.ok) set(depthSource, "pose");
              });
              delegated("click", div_26, () => {
                if (caps().sources.image.ok) set(depthSource, "image");
              });
              append($$anchor4, div_23);
            };
            if_block(node_16, ($$render) => {
              if (get(mode) === "depth") $$render(consequent_16);
            });
          }
          template_effect(() => {
            var _a, _b;
            if (select_value !== (select_value = get(mode))) {
              select.value = (select.__value = get(mode)) ?? "", select_option(select, get(mode));
            }
            set_text(text_9, ((_a = caps().modes[get(mode)]) == null ? void 0 : _a.ok) ? get(currentModeRow).desc : ((_b = caps().modes[get(mode)]) == null ? void 0 : _b.reason) || get(currentModeRow).desc);
          });
          delegated("change", select, (e) => pickModeKey(e.currentTarget.value));
          append($$anchor3, div_21);
        };
        if_block(node_15, ($$render) => {
          var _a;
          if (((_a = caps()) == null ? void 0 : _a.graftable) && get(engineKind) === "source") $$render(consequent_17);
        });
      }
      var node_17 = sibling(node_15, 2);
      {
        var consequent_20 = ($$anchor3) => {
          var div_27 = root_22$3();
          var div_28 = sibling(child(div_27), 2);
          var select_1 = child(div_28);
          var option_1 = child(select_1);
          option_1.value = option_1.__value = "none";
          var node_18 = sibling(option_1);
          {
            var consequent_18 = ($$anchor4) => {
              var option_2 = root_23$2();
              var text_10 = child(option_2);
              option_2.value = option_2.__value = "ipadapter";
              template_effect(() => {
                var _a;
                return set_text(text_10, `Style Reference — lock look to this image${((_a = caps().conditions.ipadapter) == null ? void 0 : _a.ok) ? "" : " (installs on apply)"}`);
              });
              append($$anchor4, option_2);
            };
            if_block(node_18, ($$render) => {
              var _a, _b;
              if (((_a = caps().conditions.ipadapter) == null ? void 0 : _a.ok) || ((_b = caps().conditions.ipadapter) == null ? void 0 : _b.installable)) $$render(consequent_18);
            });
          }
          var node_19 = sibling(node_18);
          {
            var consequent_19 = ($$anchor4) => {
              var option_3 = root_24$3();
              var text_11 = child(option_3);
              option_3.value = option_3.__value = "pulid";
              template_effect(() => {
                var _a;
                return set_text(text_11, `PuLID — lock the face to this image${((_a = caps().conditions.pulid) == null ? void 0 : _a.ok) ? "" : " (installs on apply)"}`);
              });
              append($$anchor4, option_3);
            };
            if_block(node_19, ($$render) => {
              var _a, _b;
              if (((_a = caps().conditions.pulid) == null ? void 0 : _a.ok) || ((_b = caps().conditions.pulid) == null ? void 0 : _b.installable)) $$render(consequent_19);
            });
          }
          bind_select_value(select_1, () => get(condition), ($$value) => set(condition, $$value));
          append($$anchor3, div_27);
        };
        if_block(node_17, ($$render) => {
          var _a, _b, _c, _d, _e, _f, _g, _h;
          if (get(sourceGraftable) && (((_b = (_a = caps().conditions) == null ? void 0 : _a.ipadapter) == null ? void 0 : _b.ok) || ((_d = (_c = caps().conditions) == null ? void 0 : _c.ipadapter) == null ? void 0 : _d.installable) || ((_f = (_e = caps().conditions) == null ? void 0 : _e.pulid) == null ? void 0 : _f.ok) || ((_h = (_g = caps().conditions) == null ? void 0 : _g.pulid) == null ? void 0 : _h.installable))) $$render(consequent_20);
        });
      }
      var node_20 = sibling(node_17, 2);
      {
        var consequent_23 = ($$anchor3) => {
          var div_29 = root_25$3();
          var div_30 = child(div_29);
          var text_12 = child(div_30);
          var div_31 = sibling(div_30, 2);
          var span_5 = child(div_31);
          var text_13 = child(span_5);
          var node_21 = sibling(span_5, 2);
          key(node_21, () => get(promptSeedKey) + ":" + get(promptRestoreNonce), ($$anchor4) => {
            var fragment_4 = comment();
            var node_22 = first_child(fragment_4);
            {
              var consequent_21 = ($$anchor5) => {
                var div_32 = root_27$3();
                action(div_32, ($$node) => promptEditor == null ? void 0 : promptEditor($$node));
                append($$anchor5, div_32);
              };
              var alternate_1 = ($$anchor5) => {
                var textarea = root_28$2();
                bind_value(textarea, () => get(prompt), ($$value) => set(prompt, $$value));
                append($$anchor5, textarea);
              };
              if_block(node_22, ($$render) => {
                if (mountPromptEditor()) $$render(consequent_21);
                else $$render(alternate_1, -1);
              });
            }
            append($$anchor4, fragment_4);
          });
          var node_23 = sibling(node_21, 2);
          {
            var consequent_22 = ($$anchor4) => {
              var fragment_5 = root_29$3();
              var textarea_1 = sibling(first_child(fragment_5), 2);
              bind_this(textarea_1, ($$value) => refEl = $$value, () => refEl);
              template_effect(() => set_value(textarea_1, caps().referencePrompt));
              append($$anchor4, fragment_5);
            };
            if_block(node_23, ($$render) => {
              if (caps().referencePrompt && get(engineKind) !== "qwen") $$render(consequent_22);
            });
          }
          template_effect(() => {
            set_text(text_12, get(engineKind) === "qwen" ? "Instruction" : "Prompt");
            set_text(text_13, get(engineKind) === "qwen" ? "how Qwen Edit should enhance" : "what the tiles re-detail with");
          });
          append($$anchor3, div_29);
        };
        if_block(node_20, ($$render) => {
          if (get(sourceGraftable) && caps().prefillPrompt != null || get(tileEngine) || get(engineKind) === "qwen") $$render(consequent_23);
        });
      }
      var div_33 = sibling(node_20, 2);
      var node_24 = sibling(child(div_33), 2);
      {
        var consequent_27 = ($$anchor3) => {
          var div_34 = root_30$3();
          var div_35 = child(div_34);
          let classes_6;
          var node_25 = sibling(child(div_35), 2);
          {
            let $0 = user_derived(() => {
              var _a;
              return (_a = caps()) == null ? void 0 : _a.defaultUpscaleBy;
            });
            SettingsSlider(node_25, {
              get min() {
                return get(scaleSlider).min;
              },
              get max() {
                return get(scaleSlider).max;
              },
              step: 0.05,
              get value() {
                return get(upscaleBy);
              },
              get savedValue() {
                return get($0);
              },
              get ticks() {
                return get(scaleSlider).ticks;
              },
              onChange: (v) => {
                set(upscaleBy, v, true);
              }
            });
          }
          var div_36 = sibling(div_35, 2);
          var text_14 = child(div_36);
          var node_26 = sibling(div_36, 2);
          {
            var consequent_24 = ($$anchor4) => {
              var div_37 = root_31$3();
              var div_38 = sibling(child(div_37), 2);
              let classes_7;
              var div_39 = sibling(child(div_38), 2);
              var div_40 = child(div_39);
              var text_15 = child(div_40);
              var div_41 = sibling(div_38, 2);
              let classes_8;
              var div_42 = sibling(child(div_41), 2);
              var div_43 = child(div_42);
              var text_16 = child(div_43);
              template_effect(() => {
                classes_7 = set_class(div_38, 1, "pcr-up-mode svelte-xw7bpl", null, classes_7, { selected: get(canvasMode) === "grow" });
                set_text(text_15, `Grow canvas to ${get(grownW) ?? ""}×${get(grownH) ?? ""}`);
                classes_8 = set_class(div_41, 1, "pcr-up-mode svelte-xw7bpl", null, classes_8, { selected: get(canvasMode) === "keep" });
                set_text(text_16, `Keep canvas at ${docWidth() ?? ""}×${docHeight() ?? ""}`);
              });
              delegated("click", div_38, () => {
                set(canvasMode, "grow");
              });
              delegated("click", div_41, () => {
                set(canvasMode, "keep");
              });
              append($$anchor4, div_37);
            };
            if_block(node_26, ($$render) => {
              if (get(needsGrow)) $$render(consequent_24);
            });
          }
          var node_27 = sibling(node_26, 2);
          {
            var consequent_25 = ($$anchor4) => {
              var label = root_32$2();
              var input = child(label);
              template_effect(() => set_checked(input, get(ultrasharpUnder)));
              delegated("change", input, (e) => setUltrasharpUnder(e.currentTarget.checked));
              append($$anchor4, label);
            };
            if_block(node_27, ($$render) => {
              if (get(landsInFootprint)) $$render(consequent_25);
            });
          }
          var node_28 = sibling(node_27, 2);
          {
            var consequent_26 = ($$anchor4) => {
              var div_44 = root_33$3();
              var node_29 = sibling(child(div_44), 2);
              SettingsSlider(node_29, {
                min: 0.05,
                get max() {
                  return get(denoiseMax);
                },
                step: 0.01,
                get value() {
                  return get(denoise);
                },
                get savedValue() {
                  return get(denoiseDefault);
                },
                onChange: (v) => {
                  set(denoise, v, true);
                }
              });
              append($$anchor4, div_44);
            };
            if_block(node_28, ($$render) => {
              if (get(sourceGraftable) || get(tileEngine)) $$render(consequent_26);
            });
          }
          template_effect(() => {
            classes_6 = set_class(div_35, 1, "pcr-up-slider-row svelte-xw7bpl", null, classes_6, { "pcr-up-slider-row-ticks": !!get(scaleSlider).ticks });
            set_text(text_14, get(targetRes) ? `→ ${get(targetRes)}` : "");
          });
          append($$anchor3, div_34);
        };
        if_block(node_24, ($$render) => {
          if (get(sourceGraftable) || get(tileEngine) || get(engineKind) === "qwen") $$render(consequent_27);
        });
      }
      var node_30 = sibling(node_24, 2);
      {
        var consequent_28 = ($$anchor3) => {
          var div_45 = root_34$3();
          var div_46 = child(div_45);
          var select_2 = sibling(child(div_46), 2);
          let classes_9;
          var option_4 = child(select_2);
          let styles_1;
          var text_17 = child(option_4);
          option_4.value = option_4.__value = "ultrasharp";
          var option_5 = sibling(option_4);
          let styles_2;
          var text_18 = child(option_5);
          option_5.value = option_5.__value = "seedvr2";
          template_effect(() => {
            var _a;
            classes_9 = set_class(select_2, 1, "pcr-up-select svelte-xw7bpl", null, classes_9, {
              "at-rec": get(plainEngine) === get(recommendedPlainEngine)
            });
            styles_1 = set_style(option_4, "", styles_1, {
              color: get(recommendedPlainEngine) === "ultrasharp" ? "#5ed357" : "#999"
            });
            set_text(text_17, `UltraSharp${get(recommendedPlainEngine) === "ultrasharp" ? "  ●" : ""}`);
            styles_2 = set_style(option_5, "", styles_2, {
              color: get(recommendedPlainEngine) === "seedvr2" ? "#5ed357" : "#999"
            });
            set_text(text_18, `SeedVR2 + UltraSharp (slow)${((_a = caps()) == null ? void 0 : _a.seedvr2Available) ? get(recommendedPlainEngine) === "seedvr2" ? "  ●" : "" : " (installs on apply)"}`);
          });
          bind_select_value(select_2, () => get(plainEngine), ($$value) => set(plainEngine, $$value));
          append($$anchor3, div_45);
        };
        if_block(node_30, ($$render) => {
          if (onUseInEdit() && get(engineKind) !== "plain") $$render(consequent_28);
        });
      }
      var node_31 = sibling(node_30, 2);
      {
        var consequent_30 = ($$anchor3) => {
          var div_47 = root_35$3();
          var node_32 = child(div_47);
          {
            var consequent_29 = ($$anchor4) => {
              var div_48 = root_36$3();
              var select_3 = sibling(child(div_48), 2);
              let classes_10;
              var option_6 = child(select_3);
              let styles_3;
              var text_19 = child(option_6);
              option_6.value = option_6.__value = "ultrasharp";
              var option_7 = sibling(option_6);
              let styles_4;
              var text_20 = child(option_7);
              option_7.value = option_7.__value = "seedvr2";
              template_effect(() => {
                var _a;
                classes_10 = set_class(select_3, 1, "pcr-up-select svelte-xw7bpl", null, classes_10, {
                  "at-rec": (get(climbStage) === "seedvr2" ? "seedvr2" : "none") === (caps().recommendedRestore || "none")
                });
                styles_3 = set_style(option_6, "", styles_3, {
                  color: (caps().recommendedRestore || "none") === "none" ? "#5ed357" : "#999"
                });
                set_text(text_19, `None${(caps().recommendedRestore || "none") === "none" ? "  ●" : ""}`);
                styles_4 = set_style(option_7, "", styles_4, {
                  color: caps().recommendedRestore === "seedvr2" ? "#5ed357" : "#999"
                });
                set_text(text_20, `SeedVR2 — repair degraded source${((_a = caps()) == null ? void 0 : _a.seedvr2Available) ? caps().recommendedRestore === "seedvr2" ? "  ●" : "" : " (installs on apply)"}`);
              });
              bind_select_value(select_3, () => get(climbStage), ($$value) => set(climbStage, $$value));
              append($$anchor4, div_48);
            };
            if_block(node_32, ($$render) => {
              if (get(engineKind) !== "qwen") $$render(consequent_29);
            });
          }
          var div_49 = sibling(node_32, 2);
          var select_4 = sibling(child(div_49), 2);
          let classes_11;
          each(select_4, 21, () => caps().upscaleModelOptions, index, ($$anchor4, opt) => {
            var option_8 = root_37$3();
            let styles_5;
            var text_21 = child(option_8);
            var option_8_value = {};
            template_effect(() => {
              styles_5 = set_style(option_8, "", styles_5, {
                color: get(opt) === caps().recommendedUpscaleModel ? "#5ed357" : "#999"
              });
              set_text(text_21, `${get(opt) ?? ""}${get(opt) === caps().recommendedUpscaleModel ? "  ●" : ""}`);
              if (option_8_value !== (option_8_value = get(opt))) {
                option_8.value = (option_8.__value = get(opt)) ?? "";
              }
            });
            append($$anchor4, option_8);
          });
          template_effect(() => classes_11 = set_class(select_4, 1, "pcr-up-select svelte-xw7bpl", null, classes_11, {
            "at-rec": get(climbModel) === caps().recommendedUpscaleModel
          }));
          bind_select_value(select_4, () => get(climbModel), ($$value) => set(climbModel, $$value));
          append($$anchor3, div_47);
        };
        if_block(node_31, ($$render) => {
          var _a, _b;
          if (get(engineKind) !== "source" && ((_b = (_a = caps()) == null ? void 0 : _a.upscaleModelOptions) == null ? void 0 : _b.length)) $$render(consequent_30);
        });
      }
      var node_33 = sibling(node_31, 2);
      {
        var consequent_31 = ($$anchor3) => {
          var div_50 = root_38$3();
          var div_51 = child(div_50);
          var select_5 = sibling(child(div_51), 2);
          let classes_12;
          each(select_5, 21, () => caps().samplerOptions, index, ($$anchor4, opt) => {
            var option_9 = root_39$2();
            let styles_6;
            var text_22 = child(option_9);
            var option_9_value = {};
            template_effect(
              ($0) => {
                styles_6 = set_style(option_9, "", styles_6, $0);
                set_text(text_22, `${get(opt) ?? ""}${get(opt) === get(recSampler) ? "  ●" : ""}`);
                if (option_9_value !== (option_9_value = get(opt))) {
                  option_9.value = (option_9.__value = get(opt)) ?? "";
                }
              },
              [
                () => {
                  var _a;
                  return {
                    color: get(opt) === get(recSampler) ? "#5ed357" : get(engineKind) === "source" && ((_a = caps().samplerAlternates) == null ? void 0 : _a.includes(get(opt))) ? "#5dcaff" : "#999"
                  };
                }
              ]
            );
            append($$anchor4, option_9);
          });
          var div_52 = sibling(div_51, 2);
          var select_6 = sibling(child(div_52), 2);
          let classes_13;
          each(select_6, 21, () => caps().schedulerOptions, index, ($$anchor4, opt) => {
            var option_10 = root_40$2();
            let styles_7;
            var text_23 = child(option_10);
            var option_10_value = {};
            template_effect(
              ($0) => {
                styles_7 = set_style(option_10, "", styles_7, $0);
                set_text(text_23, `${get(opt) ?? ""}${get(opt) === get(recScheduler) ? "  ●" : ""}`);
                if (option_10_value !== (option_10_value = get(opt))) {
                  option_10.value = (option_10.__value = get(opt)) ?? "";
                }
              },
              [
                () => {
                  var _a;
                  return {
                    color: get(opt) === get(recScheduler) ? "#5ed357" : get(engineKind) === "source" && ((_a = caps().schedulerAlternates) == null ? void 0 : _a.includes(get(opt))) ? "#5dcaff" : "#999"
                  };
                }
              ]
            );
            append($$anchor4, option_10);
          });
          template_effect(() => {
            classes_12 = set_class(select_5, 1, "pcr-up-select svelte-xw7bpl", null, classes_12, { "at-rec": get(sampler) === get(recSampler) });
            classes_13 = set_class(select_6, 1, "pcr-up-select svelte-xw7bpl", null, classes_13, { "at-rec": get(scheduler) === get(recScheduler) });
          });
          bind_select_value(select_5, () => get(sampler), ($$value) => set(sampler, $$value));
          bind_select_value(select_6, () => get(scheduler), ($$value) => set(scheduler, $$value));
          append($$anchor3, div_50);
        };
        if_block(node_33, ($$render) => {
          var _a;
          if ((get(sourceGraftable) || get(tileEngine) || get(engineKind) === "qwen") && ((_a = caps().samplerOptions) == null ? void 0 : _a.length)) $$render(consequent_31);
        });
      }
      var node_34 = sibling(node_33, 2);
      {
        var consequent_36 = ($$anchor3) => {
          var fragment_6 = root_41$3();
          var div_53 = first_child(fragment_6);
          var span_6 = child(div_53);
          let classes_14;
          var node_35 = sibling(span_6, 2);
          {
            var consequent_32 = ($$anchor4) => {
              var span_7 = root_42$3();
              var text_24 = child(span_7);
              template_effect(($0) => set_text(text_24, `${$0 ?? ""} changed`), [() => Object.keys(get(advanced)).length]);
              append($$anchor4, span_7);
            };
            var d_1 = user_derived(() => Object.keys(get(advanced)).length);
            if_block(node_35, ($$render) => {
              if (get(d_1)) $$render(consequent_32);
            });
          }
          var node_36 = sibling(div_53, 2);
          {
            var consequent_35 = ($$anchor4) => {
              var div_54 = root_43$3();
              var node_37 = child(div_54);
              {
                var consequent_33 = ($$anchor5) => {
                  var label_1 = root_44$3();
                  var input_1 = child(label_1);
                  bind_checked(input_1, () => get(preserveDefocus), ($$value) => set(preserveDefocus, $$value));
                  append($$anchor5, label_1);
                };
                if_block(node_37, ($$render) => {
                  var _a;
                  if (get(engineKind) === "source" && ((_a = caps()) == null ? void 0 : _a.architecture) === "flux2") $$render(consequent_33);
                });
              }
              var node_38 = sibling(node_37, 2);
              each(node_38, 17, () => get(engineKind) === "qwen" ? [] : ADV_COMBOS, index, ($$anchor5, combo) => {
                var fragment_7 = comment();
                var node_39 = first_child(fragment_7);
                {
                  var consequent_34 = ($$anchor6) => {
                    var div_55 = root_46$3();
                    var span_8 = child(div_55);
                    var text_25 = child(span_8);
                    var select_7 = sibling(span_8, 2);
                    each(select_7, 21, () => caps()[get(combo).optionsKey], index, ($$anchor7, opt) => {
                      var option_11 = root_47$2();
                      let styles_8;
                      var text_26 = child(option_11);
                      var option_11_value = {};
                      template_effect(() => {
                        styles_8 = set_style(option_11, "", styles_8, {
                          color: get(opt) === get(advDefaults)[get(combo).name] ? "#5ed357" : "#999"
                        });
                        set_text(text_26, `${get(opt) ?? ""}${get(opt) === get(advDefaults)[get(combo).name] ? "  ●" : ""}`);
                        if (option_11_value !== (option_11_value = get(opt))) {
                          option_11.value = (option_11.__value = get(opt)) ?? "";
                        }
                      });
                      append($$anchor7, option_11);
                    });
                    var select_7_value;
                    init_select(select_7);
                    template_effect(
                      ($0) => {
                        set_text(text_25, get(combo).label);
                        if (select_7_value !== (select_7_value = $0)) {
                          select_7.value = (select_7.__value = $0) ?? "", select_option(select_7, $0);
                        }
                      },
                      [() => advValue(get(combo).name)]
                    );
                    delegated("change", select_7, (e) => setAdv(get(combo).name, e.target.value));
                    append($$anchor6, div_55);
                  };
                  if_block(node_39, ($$render) => {
                    var _a;
                    if ((_a = caps()[get(combo).optionsKey]) == null ? void 0 : _a.length) $$render(consequent_34);
                  });
                }
                append($$anchor5, fragment_7);
              });
              var node_40 = sibling(node_38, 2);
              each(
                node_40,
                17,
                () => get(engineKind) === "qwen" ? ADV_SLIDERS.filter((r) => r.name === "steps" || r.name === "cfg") : ADV_SLIDERS,
                index,
                ($$anchor5, row) => {
                  var div_56 = root_48$2();
                  var span_9 = child(div_56);
                  var text_27 = child(span_9);
                  var node_41 = sibling(span_9, 2);
                  {
                    let $0 = user_derived(() => Number(advValue(get(row).name) ?? get(row).min));
                    SettingsSlider(node_41, {
                      get min() {
                        return get(row).min;
                      },
                      get max() {
                        return get(row).max;
                      },
                      get step() {
                        return get(row).step;
                      },
                      get value() {
                        return get($0);
                      },
                      get savedValue() {
                        return get(advDefaults)[get(row).name];
                      },
                      onChange: (v) => setAdv(get(row).name, v)
                    });
                  }
                  template_effect(() => set_text(text_27, get(row).label));
                  append($$anchor5, div_56);
                }
              );
              append($$anchor4, div_54);
            };
            if_block(node_36, ($$render) => {
              if (get(advancedOpen)) $$render(consequent_35);
            });
          }
          template_effect(() => classes_14 = set_class(span_6, 1, "pcr-up-adv-arrow svelte-xw7bpl", null, classes_14, { open: get(advancedOpen) }));
          delegated("click", div_53, () => {
            set(advancedOpen, !get(advancedOpen));
          });
          append($$anchor3, fragment_6);
        };
        if_block(node_34, ($$render) => {
          if (get(sourceGraftable) && caps().advancedDefaults || get(tileEngine) || get(engineKind) === "qwen") $$render(consequent_36);
        });
      }
      var node_42 = sibling(node_34, 2);
      {
        var consequent_37 = ($$anchor3) => {
          var div_57 = root_49$2();
          var node_43 = sibling(child(div_57), 2);
          SavePathInput(node_43, {
            get value() {
              return get(savePrefix);
            },
            onChange: (v) => {
              set(savePrefix, v, true);
            },
            get fetchApi() {
              return fetchApi();
            }
          });
          append($$anchor3, div_57);
        };
        if_block(node_42, ($$render) => {
          if (!onUseInEdit()) $$render(consequent_37);
        });
      }
      var div_58 = sibling(div_3, 2);
      var node_44 = child(div_58);
      {
        var consequent_41 = ($$anchor3) => {
          var fragment_8 = comment();
          var node_45 = first_child(fragment_8);
          {
            var consequent_38 = ($$anchor4) => {
              var button_4 = root_51$2();
              delegated("click", button_4, function(...$$args) {
                var _a;
                (_a = onCancelRun()) == null ? void 0 : _a.apply(this, $$args);
              });
              append($$anchor4, button_4);
            };
            var alternate_2 = ($$anchor4) => {
              var fragment_9 = root_52$2();
              var button_5 = first_child(fragment_9);
              var button_6 = sibling(button_5, 2);
              var text_28 = child(button_6);
              var node_46 = sibling(button_6, 2);
              {
                var consequent_39 = ($$anchor5) => {
                  var button_7 = root_53$2();
                  template_effect(() => button_7.disabled = !progress().filename);
                  delegated("click", button_7, () => onUseInEdit()(progress()));
                  append($$anchor5, button_7);
                };
                var consequent_40 = ($$anchor5) => {
                  var button_8 = root_54$2();
                  delegated("click", button_8, () => onViewResult()(progress().resultHash));
                  append($$anchor5, button_8);
                };
                if_block(node_46, ($$render) => {
                  if (progress().phase === "done" && onUseInEdit()) $$render(consequent_39);
                  else if (progress().phase === "done" && progress().resultHash && onViewResult()) $$render(consequent_40, 1);
                });
              }
              template_effect(() => set_text(text_28, progress().phase === "done" ? "Run Again" : "Apply"));
              delegated("click", button_5, function(...$$args) {
                var _a;
                (_a = $$props.onCancel) == null ? void 0 : _a.apply(this, $$args);
              });
              delegated("click", button_6, () => confirm("background"));
              append($$anchor4, fragment_9);
            };
            if_block(node_45, ($$render) => {
              if (get(runActive)) $$render(consequent_38);
              else $$render(alternate_2, -1);
            });
          }
          append($$anchor3, fragment_8);
        };
        var alternate_3 = ($$anchor3) => {
          var fragment_10 = root_55$2();
          var button_9 = first_child(fragment_10);
          var node_47 = sibling(button_9, 2);
          {
            var consequent_42 = ($$anchor4) => {
              var button_10 = root_56$2();
              delegated("click", button_10, () => confirm("workflow"));
              append($$anchor4, button_10);
            };
            if_block(node_47, ($$render) => {
              if (!onUseInEdit()) $$render(consequent_42);
            });
          }
          var button_11 = sibling(node_47, 2);
          bind_this(button_11, ($$value) => confirmBtn = $$value, () => confirmBtn);
          delegated("click", button_9, function(...$$args) {
            var _a;
            (_a = $$props.onCancel) == null ? void 0 : _a.apply(this, $$args);
          });
          delegated("click", button_11, () => confirm("background"));
          append($$anchor3, fragment_10);
        };
        if_block(node_44, ($$render) => {
          if (progress()) $$render(consequent_41);
          else $$render(alternate_3, -1);
        });
      }
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      template_effect(() => {
        styles = set_style(div, "", styles, { "z-index": elevated() ? 10006 : null });
        set_text(text_1, `${progress() ? get(runActive) ? "Upscaling Image" : progress().phase === "done" ? "Upscale Complete" : progress().phase === "error" ? "Upscale Failed" : "Upscale Cancelled" : "Image Upscale"}${filename() ? ` — ${filename()}` : ""}${width() && height() ? ` · ${width()}×${height()}` : ""}`);
        classes = set_class(div_5, 1, "pcr-up-stage svelte-xw7bpl", null, classes, { zoomable: !!get(inspectSrc) });
        classes_3 = set_class(div_18, 1, "pcr-up-right svelte-xw7bpl", null, classes_3, { running: get(runActive) });
      });
      delegated("keydown", div, handleKeydown);
      delegated("pointerdown", div_5, onStageDown);
      delegated("pointermove", div_5, onStageMove);
      delegated("pointerup", div_5, onStageUp);
      event("pointercancel", div_5, onStageUp);
      event("wheel", div_5, onStageWheel);
      delegated("dblclick", div_5, fitView);
      delegated("contextmenu", div_5, (e) => e.preventDefault());
      append($$anchor2, div);
    };
    if_block(node_1, ($$render) => {
      if ($$props.open) $$render(consequent_43);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate([
  "keydown",
  "click",
  "pointerdown",
  "pointermove",
  "pointerup",
  "dblclick",
  "contextmenu",
  "change"
]);
var root_2$5 = from_html(`<button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`);
var root_3$4 = from_html(`<label class="pcr-ip-tool pcr-ip-opacity svelte-ch4fw9">Opacity <input type="range" min="0" max="1" step="0.05" class="svelte-ch4fw9"/></label> <div class="pcr-ip-tools svelte-ch4fw9"><label class="pcr-ip-tool svelte-ch4fw9">Brush <input type="range" min="4" max="1024" step="4" class="svelte-ch4fw9"/></label> <div class="pcr-ip-iconbtns svelte-ch4fw9"><button title="Brush" aria-label="Brush"><svg viewBox="0 0 24 24" class="svelte-ch4fw9"><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"></path><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"></path></svg></button> <button title="Eraser" aria-label="Eraser"><svg viewBox="0 0 24 24" class="svelte-ch4fw9"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path></svg></button></div> <button class="pcr-ip-tool-btn svelte-ch4fw9">Clear</button> <button class="pcr-ip-tool-btn svelte-ch4fw9">Fit</button></div>`, 1);
var root_4$5 = from_html(`<div class="pcr-ip-tools svelte-ch4fw9"><button class="pcr-ip-tool-btn svelte-ch4fw9">Fit</button> <button title="Drag the divider to wipe the original over the result">Compare</button></div>`);
var root_5$4 = from_html(`<div></div>`);
var root_7$3 = from_html(`<div class="pcr-ip-center svelte-ch4fw9"><img class="pcr-ip-live-preview svelte-ch4fw9" alt="" draggable="false"/></div>`);
var root_9$3 = from_html(`<div class="pcr-ip-split-before svelte-ch4fw9"><div class="pcr-ip-stage svelte-ch4fw9"><img alt="" draggable="false" class="svelte-ch4fw9"/></div></div> <div class="pcr-ip-split-label before svelte-ch4fw9">Before</div> <div class="pcr-ip-split-label after svelte-ch4fw9">After</div> <div class="pcr-ip-split-divider svelte-ch4fw9"><div class="pcr-ip-split-knob svelte-ch4fw9"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="svelte-ch4fw9"><polyline points="9.5 8 5.5 12 9.5 16"></polyline><polyline points="14.5 8 18.5 12 14.5 16"></polyline></svg></div></div>`, 1);
var root_8$3 = from_html(`<div class="pcr-ip-stage svelte-ch4fw9"><img alt="" draggable="false" class="svelte-ch4fw9"/></div> <!>`, 1);
var root_10$3 = from_html(`<div class="pcr-ip-center svelte-ch4fw9"><div class="pcr-ip-waiting svelte-ch4fw9"> </div></div>`);
var root_12$3 = from_html(`<span class="pcr-ip-bar-label svelte-ch4fw9"> </span>`);
var root_11$2 = from_html(`<div class="pcr-ip-progress svelte-ch4fw9"><div class="pcr-ip-bar svelte-ch4fw9"><div></div></div> <!></div>`);
var root_6$3 = from_html(`<!> <!>`, 1);
var root_13$3 = from_html(`<button class="pcr-ip-restore-chip svelte-ch4fw9" title="Re-apply the engine / reference / dials from your last inpaint of this image">↩ Restore last setup</button>`);
var root_15$3 = from_html(`<div class="pcr-ip-hint svelte-ch4fw9">renders the painted region with this checkpoint — no render metadata needed, and PuLID / Style Reference work on any source</div>`);
var root_16$3 = from_html(`<div class="pcr-ip-hint svelte-ch4fw9">re-renders the painted region with this FLUX.1 model at the denoise below — describe the content, strong on faces and eyes</div>`);
var root_17$3 = from_html(`<div class="pcr-ip-hint svelte-ch4fw9">follows your instruction inside the mask only — unmasked pixels stay untouched; the region renders at full model resolution</div>`);
var root_14$3 = from_html(`<div class="pcr-mcard"><div class="pcr-mcard-title">Engine</div> <!> <!></div>`);
var root_19$3 = from_html(`<div class="pcr-ip-hint svelte-ch4fw9">Installing pack…</div>`);
var root_21$2 = from_html(`<img class="pcr-ip-ref-thumb svelte-ch4fw9" alt="reference"/>`);
var root_22$2 = from_html(`<img class="pcr-ip-ref-thumb svelte-ch4fw9" alt="this image"/> <span class="pcr-ip-hint svelte-ch4fw9">this image (default)</span>`, 1);
var root_25$2 = from_html(`<option> </option>`);
var root_24$2 = from_html(`<label class="pcr-ip-label svelte-ch4fw9" for="pcr-ip-wtype">Weight type</label> <select id="pcr-ip-wtype" class="pcr-ip-select svelte-ch4fw9"></select> <div class="pcr-ip-denoise svelte-ch4fw9"><span class="pcr-ip-label svelte-ch4fw9">Start</span> <!></div> <div class="pcr-ip-denoise svelte-ch4fw9"><span class="pcr-ip-label svelte-ch4fw9">End</span> <!></div>`, 1);
var root_26$2 = from_html(`<div class="pcr-ip-denoise svelte-ch4fw9"><span class="pcr-ip-label svelte-ch4fw9">Fidelity</span> <!></div> <div class="pcr-ip-denoise svelte-ch4fw9"><span class="pcr-ip-label svelte-ch4fw9">Start</span> <!></div> <div class="pcr-ip-denoise svelte-ch4fw9"><span class="pcr-ip-label svelte-ch4fw9">End</span> <!></div>`, 1);
var root_20$3 = from_html(`<div class="pcr-ip-ref svelte-ch4fw9"><button class="pcr-ip-tool-btn svelte-ch4fw9">Choose image</button> <!> <input type="file" accept="image/*" style="display:none"/></div> <div class="pcr-ip-denoise svelte-ch4fw9"><span class="pcr-ip-label svelte-ch4fw9">Strength</span> <!></div>  <div class="pcr-ip-adv-head svelte-ch4fw9"> </div> <!>`, 1);
var root_18$3 = from_html(`<div class="pcr-mcard"><div class="pcr-mcard-title">Condition</div> <select id="pcr-ip-cond" class="pcr-ip-select svelte-ch4fw9"><option>Inpaint</option><option>Inpaint + PuLID</option><option>Inpaint + Style Reference</option></select> <!></div>`);
var root_28$1 = from_html(`<option> </option>`);
var root_27$2 = from_html(`<div class="pcr-mcard"><div class="pcr-mcard-title">Mode</div> <select class="pcr-ip-select svelte-ch4fw9" data-mode-select=""></select> <div class="pcr-ip-hint svelte-ch4fw9"> </div></div>`);
var root_30$2 = from_html(`<span class="pcr-ip-region-auto svelte-ch4fw9"> </span>`);
var root_31$2 = from_html(`<button> </button>`);
var root_29$2 = from_html(`<!> <div class="pcr-ip-regionrow svelte-ch4fw9"></div>`, 1);
var root_33$2 = from_html(`<div class="pcr-ip-prompt pcr-ip-prompt-editor svelte-ch4fw9"></div>`);
var root_34$2 = from_html(`<textarea class="pcr-ip-prompt svelte-ch4fw9" spellcheck="false"></textarea>`);
var root_35$2 = from_html(`<span class="pcr-ip-label svelte-ch4fw9">Workflow prompt (reference)</span> <textarea class="pcr-ip-refprompt svelte-ch4fw9" readonly="" spellcheck="false"></textarea>`, 1);
var root_36$2 = from_html(`<div class="pcr-ip-denoise svelte-ch4fw9"><span class="pcr-ip-label svelte-ch4fw9">Denoise</span> <!></div>`);
var root_38$2 = from_html(`<option> </option>`);
var root_39$1 = from_html(`<option> </option>`);
var root_37$2 = from_html(`<div class="pcr-ip-combos svelte-ch4fw9"><div class="pcr-ip-combo svelte-ch4fw9"><label class="pcr-ip-label svelte-ch4fw9" for="pcr-ip-sampler">Sampler</label> <select id="pcr-ip-sampler"></select></div> <div class="pcr-ip-combo svelte-ch4fw9"><label class="pcr-ip-label svelte-ch4fw9" for="pcr-ip-scheduler">Scheduler</label> <select id="pcr-ip-scheduler"></select></div></div>`);
var root_40$1 = from_html(`<div class="pcr-ip-denoise svelte-ch4fw9"><span class="pcr-ip-label svelte-ch4fw9">Grow</span> <!></div> <div class="pcr-ip-denoise svelte-ch4fw9"><span class="pcr-ip-label svelte-ch4fw9">Feather</span> <!></div>`, 1);
var root_41$2 = from_html(`<span class="pcr-ip-label svelte-ch4fw9">Save to</span> <!>`, 1);
var root_42$2 = from_html(`<div class="pcr-ip-error svelte-ch4fw9"> </div>`);
var root_43$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-danger svelte-ch4fw9">Stop</button>`);
var root_45$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-primary svelte-ch4fw9">Add to Edit</button>`);
var root_46$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-primary svelte-ch4fw9"> </button>`);
var root_44$2 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-secondary svelte-ch4fw9">Cancel</button> <button class="pcr-modal-btn pcr-modal-btn-primary svelte-ch4fw9"> </button> <!>`, 1);
var root_1$5 = from_html(`<div class="pcr-modal-backdrop"><div class="pcr-modal pcr-ip-modal svelte-ch4fw9" role="dialog" aria-modal="true"><div class="pcr-modal-header"><span class="pcr-modal-title"> </span> <!></div> <div class="pcr-modal-body pcr-ip-body svelte-ch4fw9"><div class="pcr-ip-left svelte-ch4fw9"><div class="pcr-ip-tabs svelte-ch4fw9"><div class="pcr-ip-seg svelte-ch4fw9"><div>Mask</div>  <div>Output</div></div> <!></div> <div><div class="pcr-ip-stage svelte-ch4fw9"><img alt="" draggable="false" class="svelte-ch4fw9"/> <canvas class="svelte-ch4fw9"></canvas></div> <!> <!></div></div> <div class="pcr-ip-right svelte-ch4fw9"><!> <!> <!> <!> <div class="pcr-mcard"><div class="pcr-mcard-title"> </div> <!> <!> <!></div> <div class="pcr-mcard"><div class="pcr-mcard-title">Settings</div> <!> <!>  <div class="pcr-ip-adv-head svelte-ch4fw9"> </div> <!> <!></div></div></div> <!> <div class="pcr-modal-footer"><!></div></div></div>`);
function InpaintModal($$anchor, $$props) {
  push($$props, true);
  let sourceUrl = prop($$props, "sourceUrl", 3, ""), width = prop($$props, "width", 3, 0), height = prop($$props, "height", 3, 0), filename = prop($$props, "filename", 3, ""), caps = prop($$props, "caps", 3, null), prefillPrompt = prop($$props, "prefillPrompt", 3, ""), referencePrompt = prop($$props, "referencePrompt", 3, ""), fetchApi = prop($$props, "fetchApi", 3, null), apiURL = prop($$props, "apiURL", 3, (p) => p), onRun = prop(
    $$props,
    "onRun",
    3,
    null
    // (options) => tracker
  ), onSave = prop(
    $$props,
    "onSave",
    3,
    null
    // (doneState, prefix) => entry | null
  ), onSaved = prop(
    $$props,
    "onSaved",
    3,
    null
    // (entry) => void — viewer jumps to the result
  ), initialMask = prop(
    $$props,
    "initialMask",
    3,
    null
    // canvas/ImageData to pre-paint (Edit handoff)
  ), imageKey = prop(
    $$props,
    "imageKey",
    3,
    ""
    // stable id of the image (per-image session memory)
  ), onUseInEdit = prop(
    $$props,
    "onUseInEdit",
    3,
    null
    // (doneState) => void — hand the render back to Edit as a layer
  ), elevated = prop(
    $$props,
    "elevated",
    3,
    false
    // raise z-index above the Edit modal
  ), onUploadReference = prop(
    $$props,
    "onUploadReference",
    3,
    null
    // (File) => Promise<filename in input/>
  ), onInstallPack = prop(
    $$props,
    "onInstallPack",
    3,
    null
    // (injectable) => Promise<boolean installed>
  ), mountPromptEditor = prop(
    $$props,
    "mountPromptEditor",
    3,
    null
    // (container, initialValue, onChange) => Promise<EditorView>
  ), regionPrompts = prop($$props, "regionPrompts", 19, () => []), forcedPrefill = prop(
    $$props,
    "forcedPrefill",
    3,
    null
    // auto-resolved region prompt (the mask's figure) — wins over generic prefill
  ), forcedPrefillLabel = prop(
    $$props,
    "forcedPrefillLabel",
    3,
    ""
    // which figure forcedPrefill resolved to, for the note
  ), movedContent = prop(
    $$props,
    "movedContent",
    3,
    false
    // the content was dragged off its scene position — regional resolves wrong
  );
  let activeTab = state("mask");
  let prompt = state("");
  let denoise = state(0.5);
  let sampler = state("");
  let scheduler = state("");
  let grow = state(0);
  let feather = state(24);
  let maskAdvancedOpen = state(false);
  let promptEditorView = null;
  let savePrefix = state("");
  let condition = state("none");
  let referenceImage = state("");
  let conditionWeight = state(
    0.6
    // identity (pulid) / style (ipadapter) strength → node `weight`
  );
  let ipaWeightType = state("style transfer");
  let conditionAdvancedOpen = state(false);
  let ipaStartAt = state(0);
  let ipaEndAt = state(0.7);
  let pulidFidelity = state(4);
  let pulidStartAt = state(0);
  let pulidEndAt = state(1);
  let installing = state(false);
  let installedOverride = state(proxy(
    {}
    // condition -> true after an inline install
  ));
  let refInputEl;
  let needsReference = user_derived(() => get(condition) === "pulid" || get(condition) === "ipadapter");
  let engineSel = state("source");
  let engineEntry = user_derived(() => {
    var _a, _b;
    return ((_b = (_a = caps()) == null ? void 0 : _a.engineModels) == null ? void 0 : _b.find((m) => m.hash === get(engineSel))) || null;
  });
  let engineKind = user_derived(() => get(engineEntry) ? get(engineEntry).architecture === "qwen_edit" ? "qwen" : get(engineEntry).architecture === "flux" ? "flux1" : "sdxl" : "source");
  let engineGroups = user_derived(() => {
    var _a, _b, _c;
    return {
      sdxl: (((_a = caps()) == null ? void 0 : _a.engineModels) || []).filter((m) => m.architecture === "sdxl"),
      flux1: (((_b = caps()) == null ? void 0 : _b.engineModels) || []).filter((m) => m.architecture === "flux"),
      qwen: (((_c = caps()) == null ? void 0 : _c.engineModels) || []).filter((m) => m.architecture === "qwen_edit")
    };
  });
  let engineSelectGroups = user_derived(() => {
    var _a;
    return [
      ...((_a = caps()) == null ? void 0 : _a.sourceUsable) !== false ? [
        {
          label: "",
          options: [
            {
              value: "source",
              label: "Source model — this image's own workflow (default)"
            }
          ]
        }
      ] : [],
      ...get(engineGroups).sdxl.length ? [
        {
          label: "SDXL — re-render the masked region",
          options: get(engineGroups).sdxl.map((m) => ({ value: m.hash, label: m.displayName }))
        }
      ] : [],
      ...get(engineGroups).flux1.length ? [
        {
          label: "FLUX.1 — re-render the masked region",
          options: get(engineGroups).flux1.map((m) => ({ value: m.hash, label: m.displayName }))
        }
      ] : [],
      ...get(engineGroups).qwen.length ? [
        {
          label: "Qwen Edit — instruction edit (masked)",
          options: get(engineGroups).qwen.map((m) => ({ value: m.hash, label: m.displayName }))
        }
      ] : []
    ];
  });
  let recSampler = user_derived(() => {
    var _a, _b, _c, _d, _e;
    return get(engineKind) === "qwen" || get(engineKind) === "flux1" ? ((_b = (_a = get(engineEntry)) == null ? void 0 : _a.gen) == null ? void 0 : _b.sampler) || "euler" : ((_d = (_c = get(engineEntry)) == null ? void 0 : _c.gen) == null ? void 0 : _d.sampler) || ((_e = caps()) == null ? void 0 : _e.recommendedSampler);
  });
  let recScheduler = user_derived(() => {
    var _a, _b, _c, _d, _e;
    return get(engineKind) === "qwen" || get(engineKind) === "flux1" ? ((_b = (_a = get(engineEntry)) == null ? void 0 : _a.gen) == null ? void 0 : _b.scheduler) || "simple" : ((_d = (_c = get(engineEntry)) == null ? void 0 : _c.gen) == null ? void 0 : _d.scheduler) || ((_e = caps()) == null ? void 0 : _e.recommendedScheduler);
  });
  function conditionOk(key2) {
    var _a, _b, _c;
    if (get(engineKind) === "qwen" || get(engineKind) === "flux1") return false;
    return get(engineKind) === "sdxl" || !!((_c = (_b = (_a = caps()) == null ? void 0 : _a.conditions) == null ? void 0 : _b[key2]) == null ? void 0 : _c.ok);
  }
  let mode = state("regional");
  let memoryPrompt = null;
  const MODE_ROWS = [
    {
      key: "basic",
      label: "Basic",
      desc: "Re-render the masked region with one prompt.",
      needs: null
    },
    {
      key: "depth",
      label: "Depth",
      desc: "One prompt + a depth ControlNet so structure can't drift.",
      needs: "depth"
    },
    {
      key: "regional",
      label: "Regional",
      desc: "The scene masks resolve each figure's prompt automatically.",
      needs: "regional"
    },
    {
      key: "regional-depth",
      label: "Regional + depth",
      desc: "Per-figure prompts plus depth structure-lock.",
      needs: "both"
    }
  ];
  let isRegionalMode = user_derived(() => get(mode) === "regional" || get(mode) === "regional-depth");
  let currentModeRow = user_derived(() => MODE_ROWS.find((r) => r.key === get(mode)) || MODE_ROWS[0]);
  function pickModeKey(key2) {
    const r = MODE_ROWS.find((x) => x.key === key2);
    if (r) pick(r);
  }
  let showModeRows = user_derived(() => {
    var _a, _b;
    return get(engineKind) === "source" && (!!((_a = caps()) == null ? void 0 : _a.regionalAvailable) || !!((_b = caps()) == null ? void 0 : _b.depthAvailable));
  });
  function modeOk(row) {
    var _a, _b, _c, _d;
    if (row.needs === "regional") return !!((_a = caps()) == null ? void 0 : _a.regionalAvailable);
    if (row.needs === "depth") return !!((_b = caps()) == null ? void 0 : _b.depthAvailable);
    if (row.needs === "both") return !!((_c = caps()) == null ? void 0 : _c.regionalAvailable) && !!((_d = caps()) == null ? void 0 : _d.depthAvailable);
    return true;
  }
  function modeReason(row) {
    var _a;
    if (modeOk(row)) return "";
    if (row.needs === "depth" || row.needs === "both") {
      if (!((_a = caps()) == null ? void 0 : _a.depthAvailable)) return "Needs the ControlNet preprocessor pack and an SDXL union ControlNet model.";
    }
    return "This image's workflow carries no 3D pose scene to resolve regions from.";
  }
  function basePrefillFor() {
    var _a, _b, _c;
    if (get(engineKind) === "source") {
      if (((_b = (_a = caps()) == null ? void 0 : _a.sourceModelInfo) == null ? void 0 : _b.architecture) === "qwen_edit") return "";
      if (get(isRegionalMode) && ((_c = caps()) == null ? void 0 : _c.regionalAvailable) && typeof referencePrompt() === "string" && referencePrompt().trim()) return referencePrompt();
      if (typeof forcedPrefill() === "string" && forcedPrefill().trim()) return forcedPrefill();
      return prefillPrompt() || "";
    }
    if (get(engineKind) === "qwen") return "";
    return prefillPrompt() || "";
  }
  function prefillFor() {
    if (typeof memoryPrompt === "string" && memoryPrompt.trim()) return memoryPrompt;
    return basePrefillFor();
  }
  function pick(row) {
    if (!modeOk(row)) return;
    const wasRegional = get(isRegionalMode);
    set(mode, row.key, true);
    if (wasRegional !== get(isRegionalMode)) {
      memoryPrompt = null;
      set(prompt, prefillFor(), true);
    }
  }
  function pickEngine(value) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    set(engineSel, value, true);
    const entry = ((_b = (_a = caps()) == null ? void 0 : _a.engineModels) == null ? void 0 : _b.find((m) => m.hash === value)) || null;
    const kind = entry ? entry.architecture === "qwen_edit" ? "qwen" : entry.architecture === "flux" ? "flux1" : "sdxl" : "source";
    if (entry) {
      const fluxLike = kind === "qwen" || kind === "flux1";
      set(sampler, ((_c = entry.gen) == null ? void 0 : _c.sampler) || (fluxLike ? "euler" : get(sampler)), true);
      set(scheduler, ((_d = entry.gen) == null ? void 0 : _d.scheduler) || (fluxLike ? "simple" : get(scheduler)), true);
      if (fluxLike && get(condition) !== "none") set(condition, "none");
    } else {
      set(sampler, ((_e = caps()) == null ? void 0 : _e.defaultSampler) || "", true);
      set(scheduler, ((_f = caps()) == null ? void 0 : _f.defaultScheduler) || "", true);
      if (get(condition) !== "none" && !((_i = (_h = (_g = caps()) == null ? void 0 : _g.conditions) == null ? void 0 : _h[get(condition)]) == null ? void 0 : _i.ok)) set(condition, "none");
    }
    memoryPrompt = null;
    set(prompt, prefillFor(), true);
  }
  const DEFAULT_WEIGHT = { pulid: 0.45, ipadapter: 0.7 };
  const IPA_WEIGHT_TYPES = [
    "linear",
    "ease in",
    "ease out",
    "ease in-out",
    "reverse in-out",
    "weak input",
    "weak output",
    "weak middle",
    "strong middle",
    "style transfer",
    "composition",
    "strong style transfer",
    "style and composition",
    "style transfer precise",
    "composition precise"
  ];
  let refThumbUrl = user_derived(() => get(referenceImage) ? apiURL()(`/view?filename=${encodeURIComponent(get(referenceImage))}&subfolder=&type=input`) : "");
  let refEl;
  user_effect(() => {
    if (!$$props.open) return;
    const onKey = (e) => {
      var _a;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        apply();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && refEl && document.activeElement === refEl) {
        const text = refEl.selectionStart !== refEl.selectionEnd ? refEl.value.slice(refEl.selectionStart, refEl.selectionEnd) : refEl.value;
        (_a = navigator.clipboard) == null ? void 0 : _a.writeText(text);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  let progress = state(null);
  let doneState = state(null);
  let saving = state(false);
  let errorMsg = state("");
  let tracker = null;
  let unsub = null;
  let wasOpen = false;
  user_effect(() => {
    if ($$props.open && caps() && !wasOpen) {
      wasOpen = true;
      untrack(() => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const initialCondition = caps().defaultCondition || "none";
        set(activeTab, "mask");
        const mem = recallModalMemory("inpaint", imageKey());
        const memEngineValid = (mem == null ? void 0 : mem.engine) === "source" ? caps().sourceUsable !== false : !!(mem == null ? void 0 : mem.engine) && !!((_a = caps().engineModels) == null ? void 0 : _a.some((m) => m.hash === mem.engine));
        set(
          engineSel,
          memEngineValid ? mem.engine : caps().sourceUsable === false ? ((_c = (_b = caps().engineModels) == null ? void 0 : _b[0]) == null ? void 0 : _c.hash) || "source" : "source",
          true
        );
        const onSource = get(engineSel) === "source";
        const defaultMode = onSource && caps().regionalAvailable ? "regional" : "basic";
        const memModeOk = onSource && ((mem == null ? void 0 : mem.mode) === "basic" ? true : (mem == null ? void 0 : mem.mode) === "depth" ? caps().depthAvailable : (mem == null ? void 0 : mem.mode) === "regional" ? caps().regionalAvailable : (mem == null ? void 0 : mem.mode) === "regional-depth" ? caps().regionalAvailable && caps().depthAvailable : false);
        set(mode, memModeOk ? mem.mode : defaultMode, true);
        memoryPrompt = mem && mem.mode === get(mode) && typeof mem.prompt === "string" && mem.prompt.trim() ? mem.prompt : null;
        set(prompt, prefillFor(), true);
        set(denoise, caps().defaultDenoise ?? 0.5, true);
        set(sampler, caps().defaultSampler || "", true);
        set(scheduler, caps().defaultScheduler || "", true);
        const preEntry = (_d = caps().engineModels) == null ? void 0 : _d.find((m) => m.hash === get(engineSel));
        if ((_e = preEntry == null ? void 0 : preEntry.gen) == null ? void 0 : _e.sampler) set(sampler, preEntry.gen.sampler, true);
        if ((_f = preEntry == null ? void 0 : preEntry.gen) == null ? void 0 : _f.scheduler) set(scheduler, preEntry.gen.scheduler, true);
        if (memEngineValid && typeof mem.denoise === "number") set(denoise, mem.denoise, true);
        set(grow, 0);
        set(feather, 24);
        set(maskOpacity, 0.55);
        set(maskAdvancedOpen, false);
        set(savePrefix, caps().defaultSavePrefix || "inpaint/inpaint", true);
        set(condition, initialCondition, true);
        set(referenceImage, ((_h = (_g = caps().conditions) == null ? void 0 : _g[initialCondition]) == null ? void 0 : _h.reference) || "", true);
        set(conditionWeight, DEFAULT_WEIGHT[initialCondition] ?? 0.6, true);
        set(ipaWeightType, "style transfer");
        set(conditionAdvancedOpen, false);
        set(ipaStartAt, 0);
        set(ipaEndAt, 0.7);
        set(pulidFidelity, 4);
        set(pulidStartAt, 0);
        set(pulidEndAt, 1);
        set(installing, false);
        set(progress, null);
        set(doneState, null);
        set(saving, false);
        set(errorMsg, "");
        set(hasMask, false);
        requestAnimationFrame(() => {
          resetView();
          clearMask();
          applyInitialMask();
        });
      });
    } else if (!$$props.open) {
      wasOpen = false;
    }
  });
  let savedSetup = state(null);
  let promptRestoreNonce = state(
    0
    // bump to force the prompt editor to reseed
  );
  user_effect(() => {
    if (!$$props.open || !fetchApi() || !imageKey()) {
      set(savedSetup, null);
      return;
    }
    let cancelled = false;
    loadModalSetup(fetchApi(), imageKey()).then((doc) => {
      var _a;
      if (cancelled || !doc) return;
      const ip = (_a = doc.kinds) == null ? void 0 : _a.inpaint;
      const dimsOk = !doc.dims || doc.dims.w === width() && doc.dims.h === height();
      set(savedSetup, ip && dimsOk ? ip : null, true);
    });
    return () => {
      cancelled = true;
    };
  });
  function applySavedSetup() {
    var _a, _b, _c, _d, _e, _f, _g;
    const s = get(savedSetup);
    if (!s) return;
    if (typeof s.engine === "string") {
      const ok = s.engine === "source" ? ((_a = caps()) == null ? void 0 : _a.sourceUsable) !== false : !!((_c = (_b = caps()) == null ? void 0 : _b.engineModels) == null ? void 0 : _c.some((m) => m.hash === s.engine));
      if (ok) pickEngine(s.engine);
    }
    if (get(engineKind) === "source" && typeof s.mode === "string") {
      const modeOk2 = s.mode === "basic" ? true : s.mode === "depth" ? (_d = caps()) == null ? void 0 : _d.depthAvailable : s.mode === "regional" ? (_e = caps()) == null ? void 0 : _e.regionalAvailable : s.mode === "regional-depth" ? ((_f = caps()) == null ? void 0 : _f.regionalAvailable) && ((_g = caps()) == null ? void 0 : _g.depthAvailable) : false;
      if (modeOk2) set(mode, s.mode, true);
    }
    if (typeof s.denoise === "number") set(denoise, s.denoise, true);
    if (typeof s.sampler === "string") set(sampler, s.sampler, true);
    if (typeof s.scheduler === "string") set(scheduler, s.scheduler, true);
    if (typeof s.grow === "number") set(grow, s.grow, true);
    if (typeof s.feather === "number") set(feather, s.feather, true);
    if (typeof s.maskOpacity === "number") set(maskOpacity, s.maskOpacity, true);
    const fluxLike = get(engineKind) === "flux1" || get(engineKind) === "qwen";
    if (typeof s.condition === "string" && !(fluxLike && s.condition !== "none") && (s.condition === "none" || conditionOk(s.condition))) {
      set(condition, s.condition, true);
      if (typeof s.referenceImage === "string") set(referenceImage, s.referenceImage, true);
      if (typeof s.conditionWeight === "number") set(conditionWeight, s.conditionWeight, true);
      if (typeof s.ipaWeightType === "string") set(ipaWeightType, s.ipaWeightType, true);
      if (typeof s.ipaStartAt === "number") set(ipaStartAt, s.ipaStartAt, true);
      if (typeof s.ipaEndAt === "number") set(ipaEndAt, s.ipaEndAt, true);
      if (typeof s.pulidFidelity === "number") set(pulidFidelity, s.pulidFidelity, true);
      if (typeof s.pulidStartAt === "number") set(pulidStartAt, s.pulidStartAt, true);
      if (typeof s.pulidEndAt === "number") set(pulidEndAt, s.pulidEndAt, true);
    }
    if (typeof s.prompt === "string" && s.prompt.trim()) {
      memoryPrompt = s.prompt;
      set(prompt, s.prompt, true);
      update(promptRestoreNonce);
    }
    if (s.hasMask && imageKey() && maskCanvas) {
      const img = new Image();
      img.onload = () => {
        const ctx = maskCanvas.getContext("2d");
        const tmp = document.createElement("canvas");
        tmp.width = width();
        tmp.height = height();
        const tctx = tmp.getContext("2d");
        tctx.drawImage(img, 0, 0, width(), height());
        tctx.globalCompositeOperation = "source-in";
        tctx.fillStyle = "rgb(255, 60, 60)";
        tctx.fillRect(0, 0, width(), height());
        ctx.clearRect(0, 0, width(), height());
        ctx.drawImage(tmp, 0, 0);
        set(hasMask, true);
      };
      img.src = apiURL()(`/promptchain/modal-setup/${imageKey()}/inpaint__mask.png?t=${Date.now()}`);
    }
    set(
      savedSetup,
      null
      // dismiss the chip once applied
    );
  }
  let running = user_derived(() => !!get(progress) && get(progress).phase !== "done" && get(progress).phase !== "error" && get(progress).phase !== "cancelled");
  let outputUrl = user_derived(() => (() => {
    var _a, _b;
    if (((_a = get(progress)) == null ? void 0 : _a.phase) === "running" && get(progress).previewUrl) return get(progress).previewUrl;
    if ((_b = get(doneState)) == null ? void 0 : _b.temp) {
      const t = get(doneState).temp;
      return apiURL()(`/view?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || "")}&type=${t.type || "temp"}&rand=${get(doneState).rand}`);
    }
    return null;
  })());
  let progressPercent = user_derived(() => {
    var _a;
    return ((_a = get(progress)) == null ? void 0 : _a.phase) === "running" && get(progress).max ? Math.round(get(progress).value / get(progress).max * 100) : null;
  });
  let viewportEl;
  let maskCanvas;
  let zoom = state(1);
  let panX = state(0);
  let panY = state(0);
  const BRUSH_SIZE_KEY = "pcr.inpaint.brushSize";
  function loadBrushSize() {
    try {
      const v = Number(localStorage.getItem(BRUSH_SIZE_KEY));
      if (Number.isFinite(v) && v >= 4 && v <= 256) return v;
    } catch {
    }
    return 48;
  }
  let brushSize = state(proxy(loadBrushSize()));
  user_effect(() => {
    try {
      localStorage.setItem(BRUSH_SIZE_KEY, String(get(
        brushSize
        /* ignore */
      )));
    } catch {
    }
  });
  let eraser = state(false);
  let maskOpacity = state(0.55);
  let hasMask = state(false);
  let painting = false;
  let panning = false;
  let lastPt = null;
  let cursorX = state(0);
  let cursorY = state(0);
  let cursorOver = state(false);
  let compareSplit = state(false);
  let splitX = state(0);
  let splitDragging = false;
  function resetView() {
    if (!viewportEl || !width() || !height()) {
      set(zoom, 1);
      set(panX, 0);
      set(panY, 0);
      return;
    }
    const rect = viewportEl.getBoundingClientRect();
    set(zoom, Math.min(rect.width / width(), rect.height / height(), 1) || 1, true);
    set(panX, (rect.width - width() * get(zoom)) / 2);
    set(panY, (rect.height - height() * get(zoom)) / 2);
  }
  function toggleCompare() {
    if (!get(outputUrl) || get(running)) return;
    set(compareSplit, !get(compareSplit));
    if (get(compareSplit)) {
      const rect = viewportEl == null ? void 0 : viewportEl.getBoundingClientRect();
      set(splitX, rect ? rect.width / 2 : 0, true);
    }
  }
  function onSplitDown(e) {
    e.stopPropagation();
    e.preventDefault();
    splitDragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onSplitMove(e) {
    if (!splitDragging) return;
    e.stopPropagation();
    const rect = viewportEl.getBoundingClientRect();
    set(splitX, Math.max(0, Math.min(rect.width, e.clientX - rect.left)), true);
  }
  function onSplitUp(e) {
    splitDragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
  }
  function clearMask() {
    const ctx = maskCanvas == null ? void 0 : maskCanvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, width(), height());
    set(hasMask, false);
  }
  function applyInitialMask() {
    if (!initialMask() || !maskCanvas) return;
    const ctx = maskCanvas.getContext("2d");
    const tmp = document.createElement("canvas");
    tmp.width = width();
    tmp.height = height();
    const tctx = tmp.getContext("2d");
    if (initialMask() instanceof ImageData) tctx.putImageData(initialMask(), 0, 0);
    else tctx.drawImage(initialMask(), 0, 0);
    tctx.globalCompositeOperation = "source-in";
    tctx.fillStyle = "rgb(255, 60, 60)";
    tctx.fillRect(0, 0, width(), height());
    ctx.drawImage(tmp, 0, 0);
    set(hasMask, true);
  }
  function toImageCoords(e) {
    const rect = viewportEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - get(panX)) / get(zoom),
      y: (e.clientY - rect.top - get(panY)) / get(zoom)
    };
  }
  function strokeTo(pt) {
    const ctx = maskCanvas.getContext("2d");
    ctx.globalCompositeOperation = get(eraser) ? "destination-out" : "source-over";
    ctx.strokeStyle = "rgb(255, 60, 60)";
    ctx.fillStyle = "rgb(255, 60, 60)";
    ctx.lineWidth = get(brushSize);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (lastPt) {
      ctx.beginPath();
      ctx.moveTo(lastPt.x, lastPt.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, get(brushSize) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPt = pt;
    if (!get(eraser)) set(hasMask, true);
  }
  function onPointerDown(e) {
    if (e.button > 2) return;
    if (get(activeTab) === "output" || e.button === 1 || e.button === 2 || e.shiftKey) {
      panning = true;
      lastPt = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (get(activeTab) !== "mask" || get(running) || e.button !== 0) {
      if (e.button === 0) console.warn("[PCR][ip] paint click ignored:", {
        activeTab: get(activeTab),
        running: get(running),
        hasMask: get(hasMask)
      });
      return;
    }
    e.preventDefault();
    painting = true;
    lastPt = null;
    strokeTo(toImageCoords(e));
    viewportEl.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    const rect = viewportEl.getBoundingClientRect();
    set(cursorX, e.clientX - rect.left);
    set(cursorY, e.clientY - rect.top);
    if (panning) {
      set(panX, get(panX) + (e.clientX - lastPt.x));
      set(panY, get(panY) + (e.clientY - lastPt.y));
      lastPt = { x: e.clientX, y: e.clientY };
      return;
    }
    if (painting) strokeTo(toImageCoords(e));
  }
  function onPointerUp() {
    painting = false;
    panning = false;
    lastPt = null;
  }
  function onWheel(e) {
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.05, Math.min(12, get(zoom) * factor));
    set(panX, cx - (cx - get(panX)) / get(zoom) * newZoom);
    set(panY, cy - (cy - get(panY)) / get(zoom) * newZoom);
    set(zoom, newZoom, true);
  }
  function maskBboxFromCanvas() {
    const ctx = maskCanvas == null ? void 0 : maskCanvas.getContext("2d");
    if (!ctx) return void 0;
    const d = ctx.getImageData(0, 0, width(), height()).data;
    let minX = width(), minY = height(), maxX = -1, maxY = -1;
    for (let y = 0; y < height(); y++) {
      for (let x = 0; x < width(); x++) {
        if (d[(y * width() + x) * 4 + 3] > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return void 0;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  async function exportMask() {
    const out = document.createElement("canvas");
    out.width = width();
    out.height = height();
    const ctx = out.getContext("2d");
    ctx.drawImage(maskCanvas, 0, 0);
    const img = ctx.getImageData(0, 0, width(), height());
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const on = d[i + 3] > 16 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = on;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return new Promise((resolve) => out.toBlob(resolve, "image/png"));
  }
  function editorModelInfo() {
    var _a;
    if (get(engineEntry)) return {
      hash: get(engineEntry).hash,
      architecture: get(engineEntry).architecture
    };
    return ((_a = caps()) == null ? void 0 : _a.sourceModelInfo) || null;
  }
  let promptSeedKey = user_derived(() => get(engineKind) + ":" + (get(engineKind) === "source" ? get(isRegionalMode) ? "regional" : "flat" : "engine"));
  function promptEditor(node) {
    let disposed = false;
    let view = null;
    (async () => {
      var _a;
      if (!mountPromptEditor()) return;
      const v = await mountPromptEditor()(
        node,
        untrack(() => prefillFor()),
        (text) => {
          set(prompt, text, true);
        },
        editorModelInfo
      );
      if (disposed) {
        (_a = v == null ? void 0 : v.destroy) == null ? void 0 : _a.call(v);
        return;
      }
      view = v;
      promptEditorView = v;
    })().catch((e) => console.error("[Inpaint] prompt editor mount failed", e));
    return {
      destroy() {
        var _a;
        disposed = true;
        (_a = view == null ? void 0 : view.destroy) == null ? void 0 : _a.call(view);
        if (promptEditorView === view) promptEditorView = null;
      }
    };
  }
  function applyRegionPrompt(r) {
    const text = ((r == null ? void 0 : r.text) || "").trim();
    if (!text) return;
    set(prompt, text, true);
    if (promptEditorView) {
      promptEditorView.dispatch({
        changes: { from: 0, to: promptEditorView.state.doc.length, insert: text }
      });
    }
  }
  const PACK_FOR = { pulid: "PuLID", ipadapter: "StyleReference" };
  function isInstalled(key2) {
    var _a, _b, _c;
    return !!get(installedOverride)[key2] || !!((_c = (_b = (_a = caps()) == null ? void 0 : _a.conditions) == null ? void 0 : _b[key2]) == null ? void 0 : _c.installed);
  }
  async function pickCondition(value) {
    var _a, _b;
    set(condition, value, true);
    set(errorMsg, "");
    if (value === "none") return;
    set(
      conditionWeight,
      DEFAULT_WEIGHT[value] ?? 0.6,
      // reseed strength to the picked condition's default
      true
    );
    const cap = (_b = (_a = caps()) == null ? void 0 : _a.conditions) == null ? void 0 : _b[value];
    set(referenceImage, (cap == null ? void 0 : cap.reference) || get(referenceImage) || "", true);
    if (conditionOk(value) && !isInstalled(value) && onInstallPack()) {
      set(installing, true);
      try {
        const ok = await onInstallPack()(PACK_FOR[value]);
        if (ok) set(installedOverride, { ...get(installedOverride), [value]: true }, true);
        else set(condition, "none");
      } catch (e) {
        set(condition, "none");
        set(errorMsg, `Couldn't set up ${value === "pulid" ? "PuLID" : "Style Reference"}: ${(e == null ? void 0 : e.message) || e}`);
      } finally {
        set(installing, false);
      }
    }
  }
  async function chooseReference(e) {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    e.target.value = "";
    if (!file || !onUploadReference()) return;
    try {
      const name = await onUploadReference()(file);
      if (name) set(referenceImage, name, true);
    } catch {
      set(errorMsg, "reference upload failed");
    }
  }
  async function apply() {
    var _a;
    if (!onRun() || get(running) || !get(hasMask)) return;
    if (get(condition) !== "none" && !isInstalled(get(condition))) {
      set(errorMsg, "Install this condition's pack first.");
      return;
    }
    const maskBlob = await exportMask();
    let appliedMask = null;
    if (onUseInEdit()) {
      appliedMask = document.createElement("canvas");
      appliedMask.width = width();
      appliedMask.height = height();
      appliedMask.getContext("2d").drawImage(maskCanvas, 0, 0);
    }
    set(doneState, null);
    set(errorMsg, "");
    set(activeTab, "output");
    tracker = onRun()({
      maskBlob,
      prompt: get(prompt),
      denoise: get(denoise),
      grow: get(grow),
      feather: get(feather),
      sampler: get(sampler) || null,
      scheduler: get(scheduler) || null,
      // Source engine carries the mode so a Basic pick forces a flat encode
      // even if the prompt still has $blocks; engine models ignore it. (Moved
      // content rides regional + the ImageViewer-injected condOffset, which
      // shifts the region masks to the content's origin.)
      mode: get(engineKind) === "source" ? get(mode) : void 0,
      engine: get(engineKind) === "sdxl" ? "sdxl-ckpt" : get(engineKind) === "flux1" ? "flux1-unet" : get(engineKind) === "qwen" ? "qwen-edit" : "source",
      engineModel: get(engineEntry) ? {
        hash: get(engineEntry).hash,
        filename: get(engineEntry).filename
      } : void 0,
      engineGen: ((_a = get(engineEntry)) == null ? void 0 : _a.gen) || void 0,
      // The qwen builder crops around the mask client-side — the bbox is
      // known here (the painted canvas), not on the server.
      maskBbox: get(engineKind) === "qwen" ? maskBboxFromCanvas() : void 0,
      // No picked reference → lock to the image being inpainted itself (the
      // upscale modal's zero-config Character-lock anchor).
      condition: get(condition),
      referenceImage: get(condition) === "none" ? null : get(referenceImage) || "__self__",
      conditionWeight: get(conditionWeight),
      ipaWeightType: get(ipaWeightType),
      ipaStartAt: get(ipaStartAt),
      ipaEndAt: get(ipaEndAt),
      pulidFidelity: get(pulidFidelity),
      pulidStartAt: get(pulidStartAt),
      pulidEndAt: get(pulidEndAt)
    });
    storeModalMemory("inpaint", imageKey(), {
      prompt: get(prompt),
      mode: get(engineKind) === "source" ? get(mode) : void 0,
      engine: get(engineKind) === "source" ? "source" : get(engineSel),
      denoise: get(denoise)
    });
    const maskPlaneBlob = await new Promise((res) => maskCanvas.toBlob(res, "image/png"));
    saveModalSetup(
      fetchApi(),
      imageKey(),
      "inpaint",
      {
        engine: get(engineSel),
        mode: get(engineKind) === "source" ? get(mode) : void 0,
        denoise: get(denoise),
        sampler: get(sampler),
        scheduler: get(scheduler),
        grow: get(grow),
        feather: get(feather),
        maskOpacity: get(maskOpacity),
        condition: get(condition),
        referenceImage: get(referenceImage),
        conditionWeight: get(conditionWeight),
        ipaWeightType: get(ipaWeightType),
        ipaStartAt: get(ipaStartAt),
        ipaEndAt: get(ipaEndAt),
        pulidFidelity: get(pulidFidelity),
        pulidStartAt: get(pulidStartAt),
        pulidEndAt: get(pulidEndAt),
        prompt: get(prompt),
        hasMask: true
      },
      { w: width(), h: height() },
      maskPlaneBlob ? { "inpaint__mask.png": maskPlaneBlob } : {}
    );
    unsub == null ? void 0 : unsub();
    unsub = tracker.subscribe((state2) => {
      set(progress, state2, true);
      if (state2.phase === "done") {
        set(doneState, { ...state2, appliedMask, rand: Math.random() }, true);
        set(progress, null);
      } else if (state2.phase === "cancelled") {
        set(progress, null);
        set(activeTab, "mask");
      } else if (state2.phase === "error") {
        set(errorMsg, state2.message || "inpaint failed", true);
        set(progress, null);
        set(activeTab, "mask");
      }
    });
  }
  function stopRun() {
    var _a;
    (_a = tracker == null ? void 0 : tracker.cancel) == null ? void 0 : _a.call(tracker);
  }
  async function save() {
    var _a;
    if (!onSave() || !get(doneState) || get(saving)) return;
    set(saving, true);
    try {
      const entry = await onSave()(get(doneState), get(savePrefix).trim());
      if (entry) {
        if (entry.hash) {
          storeModalMemory("inpaint", entry.hash, {
            prompt: get(prompt),
            mode: get(engineKind) === "source" ? get(mode) : void 0,
            engine: get(engineKind) === "source" ? "source" : get(engineSel),
            denoise: get(denoise)
          });
        }
        close();
        (_a = onSaved()) == null ? void 0 : _a(entry);
      }
    } finally {
      set(saving, false);
    }
  }
  function close() {
    var _a;
    unsub == null ? void 0 : unsub();
    unsub = null;
    tracker = null;
    (_a = $$props.onCancel) == null ? void 0 : _a.call($$props);
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (get(
        running
        // Stop is the only way out mid-run
      )) return;
      close();
    }
  }
  var fragment = comment();
  var node_1 = first_child(fragment);
  {
    var consequent_32 = ($$anchor2) => {
      var div = root_1$5();
      let styles;
      var div_1 = child(div);
      var div_2 = child(div_1);
      var span = child(div_2);
      var text_1 = child(span);
      var node_2 = sibling(span, 2);
      {
        var consequent = ($$anchor3) => {
          var button = root_2$5();
          delegated("click", button, close);
          append($$anchor3, button);
        };
        if_block(node_2, ($$render) => {
          if (!get(running)) $$render(consequent);
        });
      }
      var div_3 = sibling(div_2, 2);
      var div_4 = child(div_3);
      var div_5 = child(div_4);
      var div_6 = child(div_5);
      var div_7 = child(div_6);
      let classes;
      var div_8 = sibling(div_7, 2);
      let classes_1;
      var node_3 = sibling(div_6, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var fragment_1 = root_3$4();
          var label = first_child(fragment_1);
          var input = sibling(child(label));
          var div_9 = sibling(label, 2);
          var label_1 = child(div_9);
          var input_1 = sibling(child(label_1));
          var div_10 = sibling(label_1, 2);
          var button_1 = child(div_10);
          let classes_2;
          var button_2 = sibling(button_1, 2);
          let classes_3;
          var button_3 = sibling(div_10, 2);
          var button_4 = sibling(button_3, 2);
          template_effect(() => {
            classes_2 = set_class(button_1, 1, "pcr-ip-iconbtn svelte-ch4fw9", null, classes_2, { active: !get(eraser) });
            classes_3 = set_class(button_2, 1, "pcr-ip-iconbtn svelte-ch4fw9", null, classes_3, { active: get(eraser) });
          });
          bind_value(input, () => get(maskOpacity), ($$value) => set(maskOpacity, $$value));
          bind_value(input_1, () => get(brushSize), ($$value) => set(brushSize, $$value));
          delegated("click", button_1, () => {
            set(eraser, false);
          });
          delegated("click", button_2, () => {
            set(eraser, true);
          });
          delegated("click", button_3, clearMask);
          delegated("click", button_4, resetView);
          append($$anchor3, fragment_1);
        };
        var alternate = ($$anchor3) => {
          var div_11 = root_4$5();
          var button_5 = child(div_11);
          var button_6 = sibling(button_5, 2);
          let classes_4;
          template_effect(() => {
            classes_4 = set_class(button_6, 1, "pcr-ip-tool-btn svelte-ch4fw9", null, classes_4, { on: get(compareSplit) });
            button_6.disabled = !get(outputUrl) || get(running);
          });
          delegated("click", button_5, resetView);
          delegated("click", button_6, toggleCompare);
          append($$anchor3, div_11);
        };
        if_block(node_3, ($$render) => {
          if (get(activeTab) === "mask") $$render(consequent_1);
          else $$render(alternate, -1);
        });
      }
      var div_12 = sibling(div_5, 2);
      let classes_5;
      var div_13 = child(div_12);
      let styles_1;
      var img_1 = child(div_13);
      var canvas = sibling(img_1, 2);
      let styles_2;
      bind_this(canvas, ($$value) => maskCanvas = $$value, () => maskCanvas);
      var node_4 = sibling(div_13, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_14 = root_5$4();
          let classes_6;
          template_effect(() => {
            classes_6 = set_class(div_14, 1, "pcr-ip-brush-ring svelte-ch4fw9", null, classes_6, { eraser: get(eraser) });
            set_style(div_14, `left:${get(cursorX) ?? ""}px; top:${get(cursorY) ?? ""}px; width:${get(brushSize) * get(zoom)}px; height:${get(brushSize) * get(zoom)}px;`);
          });
          append($$anchor3, div_14);
        };
        if_block(node_4, ($$render) => {
          if (get(activeTab) === "mask" && get(cursorOver)) $$render(consequent_2);
        });
      }
      var node_5 = sibling(node_4, 2);
      {
        var consequent_8 = ($$anchor3) => {
          var fragment_2 = root_6$3();
          var node_6 = first_child(fragment_2);
          {
            var consequent_3 = ($$anchor4) => {
              var div_15 = root_7$3();
              var img_2 = child(div_15);
              template_effect(() => set_attribute(img_2, "src", get(progress).previewUrl));
              append($$anchor4, div_15);
            };
            var consequent_5 = ($$anchor4) => {
              var fragment_3 = root_8$3();
              var div_16 = first_child(fragment_3);
              var img_3 = child(div_16);
              var node_7 = sibling(div_16, 2);
              {
                var consequent_4 = ($$anchor5) => {
                  var fragment_4 = root_9$3();
                  var div_17 = first_child(fragment_4);
                  var div_18 = child(div_17);
                  var img_4 = child(div_18);
                  var div_19 = sibling(div_17, 6);
                  template_effect(() => {
                    set_style(div_17, `clip-path: inset(0 calc(100% - ${get(splitX) ?? ""}px) 0 0);`);
                    set_style(div_18, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""});`);
                    set_attribute(img_4, "src", sourceUrl());
                    set_attribute(img_4, "width", width());
                    set_attribute(img_4, "height", height());
                    set_style(div_19, `left: ${get(splitX) ?? ""}px;`);
                  });
                  delegated("pointerdown", div_19, onSplitDown);
                  delegated("pointermove", div_19, onSplitMove);
                  delegated("pointerup", div_19, onSplitUp);
                  event("pointercancel", div_19, onSplitUp);
                  append($$anchor5, fragment_4);
                };
                if_block(node_7, ($$render) => {
                  if (get(compareSplit)) $$render(consequent_4);
                });
              }
              template_effect(() => {
                set_style(div_16, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""});`);
                set_attribute(img_3, "src", get(outputUrl));
                set_attribute(img_3, "width", width());
                set_attribute(img_3, "height", height());
              });
              append($$anchor4, fragment_3);
            };
            var alternate_1 = ($$anchor4) => {
              var div_20 = root_10$3();
              var div_21 = child(div_20);
              var text_2 = child(div_21);
              template_effect(() => set_text(text_2, get(running) ? "Waiting for the sampler…" : "No output yet — paint a mask and Apply."));
              append($$anchor4, div_20);
            };
            if_block(node_6, ($$render) => {
              var _a;
              if (get(running) && ((_a = get(progress)) == null ? void 0 : _a.previewUrl)) $$render(consequent_3);
              else if (get(outputUrl)) $$render(consequent_5, 1);
              else $$render(alternate_1, -1);
            });
          }
          var node_8 = sibling(node_6, 2);
          {
            var consequent_7 = ($$anchor4) => {
              var div_22 = root_11$2();
              var div_23 = child(div_22);
              var div_24 = child(div_23);
              let classes_7;
              var node_9 = sibling(div_23, 2);
              {
                var consequent_6 = ($$anchor5) => {
                  var span_1 = root_12$3();
                  var text_3 = child(span_1);
                  template_effect(() => set_text(text_3, `step ${get(progress).value ?? ""}/${get(progress).max ?? ""}`));
                  append($$anchor5, span_1);
                };
                if_block(node_9, ($$render) => {
                  if (get(progressPercent) != null) $$render(consequent_6);
                });
              }
              template_effect(() => {
                classes_7 = set_class(div_24, 1, "pcr-ip-bar-fill svelte-ch4fw9", null, classes_7, { indeterminate: get(progressPercent) == null });
                set_style(div_24, get(progressPercent) != null ? `width: ${get(progressPercent)}%` : "");
              });
              append($$anchor4, div_22);
            };
            if_block(node_8, ($$render) => {
              if (get(running)) $$render(consequent_7);
            });
          }
          append($$anchor3, fragment_2);
        };
        if_block(node_5, ($$render) => {
          if (get(activeTab) === "output") $$render(consequent_8);
        });
      }
      bind_this(div_12, ($$value) => viewportEl = $$value, () => viewportEl);
      var div_25 = sibling(div_4, 2);
      var node_10 = child(div_25);
      {
        var consequent_9 = ($$anchor3) => {
          var button_7 = root_13$3();
          delegated("click", button_7, applySavedSetup);
          append($$anchor3, button_7);
        };
        if_block(node_10, ($$render) => {
          if (get(savedSetup) && !get(running)) $$render(consequent_9);
        });
      }
      var node_11 = sibling(node_10, 2);
      {
        var consequent_13 = ($$anchor3) => {
          var div_26 = root_14$3();
          var node_12 = sibling(child(div_26), 2);
          {
            let $0 = user_derived(() => get(installing) || get(running));
            SearchableSelect(node_12, {
              id: "pcr-ip-engine",
              get value() {
                return get(engineSel);
              },
              get groups() {
                return get(engineSelectGroups);
              },
              popupKey: "inpaint-engine",
              get disabled() {
                return get($0);
              },
              onpick: (v) => pickEngine(v)
            });
          }
          var node_13 = sibling(node_12, 2);
          {
            var consequent_10 = ($$anchor4) => {
              var div_27 = root_15$3();
              append($$anchor4, div_27);
            };
            var consequent_11 = ($$anchor4) => {
              var div_28 = root_16$3();
              append($$anchor4, div_28);
            };
            var consequent_12 = ($$anchor4) => {
              var div_29 = root_17$3();
              append($$anchor4, div_29);
            };
            if_block(node_13, ($$render) => {
              if (get(engineKind) === "sdxl") $$render(consequent_10);
              else if (get(engineKind) === "flux1") $$render(consequent_11, 1);
              else if (get(engineKind) === "qwen") $$render(consequent_12, 2);
            });
          }
          append($$anchor3, div_26);
        };
        if_block(node_11, ($$render) => {
          var _a, _b;
          if ((_b = (_a = caps()) == null ? void 0 : _a.engineModels) == null ? void 0 : _b.length) $$render(consequent_13);
        });
      }
      var node_14 = sibling(node_11, 2);
      {
        var consequent_19 = ($$anchor3) => {
          var div_30 = root_18$3();
          var select = sibling(child(div_30), 2);
          var option = child(select);
          option.value = option.__value = "none";
          var option_1 = sibling(option);
          option_1.value = option_1.__value = "pulid";
          var option_2 = sibling(option_1);
          option_2.value = option_2.__value = "ipadapter";
          var select_value;
          init_select(select);
          var node_15 = sibling(select, 2);
          {
            var consequent_14 = ($$anchor4) => {
              var div_31 = root_19$3();
              append($$anchor4, div_31);
            };
            var consequent_18 = ($$anchor4) => {
              var fragment_5 = root_20$3();
              var div_32 = first_child(fragment_5);
              var button_8 = child(div_32);
              var node_16 = sibling(button_8, 2);
              {
                var consequent_15 = ($$anchor5) => {
                  var img_5 = root_21$2();
                  template_effect(() => set_attribute(img_5, "src", get(refThumbUrl)));
                  append($$anchor5, img_5);
                };
                var alternate_2 = ($$anchor5) => {
                  var fragment_6 = root_22$2();
                  var img_6 = first_child(fragment_6);
                  template_effect(() => set_attribute(img_6, "src", sourceUrl()));
                  append($$anchor5, fragment_6);
                };
                if_block(node_16, ($$render) => {
                  if (get(refThumbUrl)) $$render(consequent_15);
                  else $$render(alternate_2, -1);
                });
              }
              var input_2 = sibling(node_16, 2);
              bind_this(input_2, ($$value) => refInputEl = $$value, () => refInputEl);
              var div_33 = sibling(div_32, 2);
              var node_17 = sibling(child(div_33), 2);
              {
                let $0 = user_derived(() => DEFAULT_WEIGHT[get(condition)] ?? 0.6);
                SettingsSlider(node_17, {
                  min: 0,
                  max: 1.5,
                  step: 0.05,
                  get value() {
                    return get(conditionWeight);
                  },
                  get savedValue() {
                    return get($0);
                  },
                  onChange: (v) => {
                    set(conditionWeight, v, true);
                  }
                });
              }
              var div_34 = sibling(div_33, 2);
              var text_4 = child(div_34);
              var node_18 = sibling(div_34, 2);
              {
                var consequent_17 = ($$anchor5) => {
                  var fragment_7 = comment();
                  var node_19 = first_child(fragment_7);
                  {
                    var consequent_16 = ($$anchor6) => {
                      var fragment_8 = root_24$2();
                      var select_1 = sibling(first_child(fragment_8), 2);
                      each(select_1, 21, () => IPA_WEIGHT_TYPES, index, ($$anchor7, wt) => {
                        var option_3 = root_25$2();
                        var text_5 = child(option_3);
                        var option_3_value = {};
                        template_effect(() => {
                          set_text(text_5, get(wt));
                          if (option_3_value !== (option_3_value = get(wt))) {
                            option_3.value = (option_3.__value = get(wt)) ?? "";
                          }
                        });
                        append($$anchor7, option_3);
                      });
                      var div_35 = sibling(select_1, 2);
                      var node_20 = sibling(child(div_35), 2);
                      SettingsSlider(node_20, {
                        min: 0,
                        max: 1,
                        step: 0.01,
                        get value() {
                          return get(ipaStartAt);
                        },
                        savedValue: 0,
                        onChange: (v) => {
                          set(ipaStartAt, v, true);
                        }
                      });
                      var div_36 = sibling(div_35, 2);
                      var node_21 = sibling(child(div_36), 2);
                      SettingsSlider(node_21, {
                        min: 0,
                        max: 1,
                        step: 0.01,
                        get value() {
                          return get(ipaEndAt);
                        },
                        savedValue: 0.7,
                        onChange: (v) => {
                          set(ipaEndAt, v, true);
                        }
                      });
                      bind_select_value(select_1, () => get(ipaWeightType), ($$value) => set(ipaWeightType, $$value));
                      append($$anchor6, fragment_8);
                    };
                    var alternate_3 = ($$anchor6) => {
                      var fragment_9 = root_26$2();
                      var div_37 = first_child(fragment_9);
                      var node_22 = sibling(child(div_37), 2);
                      SettingsSlider(node_22, {
                        min: 0,
                        max: 10,
                        step: 1,
                        get value() {
                          return get(pulidFidelity);
                        },
                        savedValue: 4,
                        onChange: (v) => {
                          set(pulidFidelity, v, true);
                        }
                      });
                      var div_38 = sibling(div_37, 2);
                      var node_23 = sibling(child(div_38), 2);
                      SettingsSlider(node_23, {
                        min: 0,
                        max: 1,
                        step: 0.01,
                        get value() {
                          return get(pulidStartAt);
                        },
                        savedValue: 0,
                        onChange: (v) => {
                          set(pulidStartAt, v, true);
                        }
                      });
                      var div_39 = sibling(div_38, 2);
                      var node_24 = sibling(child(div_39), 2);
                      SettingsSlider(node_24, {
                        min: 0,
                        max: 1,
                        step: 0.01,
                        get value() {
                          return get(pulidEndAt);
                        },
                        savedValue: 1,
                        onChange: (v) => {
                          set(pulidEndAt, v, true);
                        }
                      });
                      append($$anchor6, fragment_9);
                    };
                    if_block(node_19, ($$render) => {
                      if (get(condition) === "ipadapter") $$render(consequent_16);
                      else $$render(alternate_3, -1);
                    });
                  }
                  append($$anchor5, fragment_7);
                };
                if_block(node_18, ($$render) => {
                  if (get(conditionAdvancedOpen)) $$render(consequent_17);
                });
              }
              template_effect(() => set_text(text_4, `${get(conditionAdvancedOpen) ? "▾" : "▸"} Advanced`));
              delegated("click", button_8, () => refInputEl == null ? void 0 : refInputEl.click());
              delegated("change", input_2, chooseReference);
              delegated("click", div_34, () => {
                set(conditionAdvancedOpen, !get(conditionAdvancedOpen));
              });
              append($$anchor4, fragment_5);
            };
            if_block(node_15, ($$render) => {
              if (get(installing)) $$render(consequent_14);
              else if (get(needsReference)) $$render(consequent_18, 1);
            });
          }
          template_effect(
            ($0, $1, $2, $3) => {
              select.disabled = get(installing) || get(running);
              option_1.disabled = $0;
              set_attribute(option_1, "title", $1);
              option_2.disabled = $2;
              set_attribute(option_2, "title", $3);
              if (select_value !== (select_value = get(condition))) {
                select.value = (select.__value = get(condition)) ?? "", select_option(select, get(condition));
              }
            },
            [
              () => !conditionOk("pulid"),
              () => {
                var _a;
                return conditionOk("pulid") ? "" : ((_a = caps().conditions.pulid) == null ? void 0 : _a.reason) || "";
              },
              () => !conditionOk("ipadapter"),
              () => {
                var _a;
                return conditionOk("ipadapter") ? "" : ((_a = caps().conditions.ipadapter) == null ? void 0 : _a.reason) || "";
              }
            ]
          );
          delegated("change", select, (e) => pickCondition(e.currentTarget.value));
          append($$anchor3, div_30);
        };
        if_block(node_14, ($$render) => {
          var _a;
          if (((_a = caps()) == null ? void 0 : _a.conditions) && get(engineKind) !== "qwen" && get(engineKind) !== "flux1") $$render(consequent_19);
        });
      }
      var node_25 = sibling(node_14, 2);
      {
        var consequent_20 = ($$anchor3) => {
          var div_40 = root_27$2();
          var select_2 = sibling(child(div_40), 2);
          each(select_2, 21, () => MODE_ROWS, index, ($$anchor4, row) => {
            var option_4 = root_28$1();
            var text_6 = child(option_4);
            var option_4_value = {};
            template_effect(
              ($0, $1) => {
                option_4.disabled = $0;
                set_attribute(option_4, "title", $1);
                set_text(text_6, get(row).label);
                if (option_4_value !== (option_4_value = get(row).key)) {
                  option_4.value = (option_4.__value = get(row).key) ?? "";
                }
              },
              [() => !modeOk(get(row)), () => modeReason(get(row))]
            );
            append($$anchor4, option_4);
          });
          var select_2_value;
          init_select(select_2);
          var div_41 = sibling(select_2, 2);
          var text_7 = child(div_41);
          template_effect(
            ($0) => {
              if (select_2_value !== (select_2_value = get(mode))) {
                select_2.value = (select_2.__value = get(mode)) ?? "", select_option(select_2, get(mode));
              }
              set_text(text_7, $0);
            },
            [
              () => modeOk(get(currentModeRow)) ? get(currentModeRow).desc : modeReason(get(currentModeRow))
            ]
          );
          delegated("change", select_2, (e) => pickModeKey(e.currentTarget.value));
          append($$anchor3, div_40);
        };
        if_block(node_25, ($$render) => {
          if (get(showModeRows)) $$render(consequent_20);
        });
      }
      var div_42 = sibling(node_25, 2);
      var div_43 = child(div_42);
      var text_8 = child(div_43);
      var node_26 = sibling(div_43, 2);
      {
        var consequent_22 = ($$anchor3) => {
          var fragment_10 = root_29$2();
          var node_27 = first_child(fragment_10);
          {
            var consequent_21 = ($$anchor4) => {
              var span_2 = root_30$2();
              var text_9 = child(span_2);
              template_effect(() => set_text(text_9, `🧍 auto-loaded ${forcedPrefillLabel() ?? ""}'s prompt — switch below or edit`));
              append($$anchor4, span_2);
            };
            if_block(node_27, ($$render) => {
              if (forcedPrefill() && forcedPrefillLabel() && !get(showModeRows)) $$render(consequent_21);
            });
          }
          var div_44 = sibling(node_27, 2);
          each(div_44, 21, () => regionPrompts().filter((r) => r.text), (r) => r.name, ($$anchor4, r) => {
            var button_9 = root_31$2();
            let classes_8;
            var text_10 = child(button_9);
            template_effect(
              ($0) => {
                classes_8 = set_class(button_9, 1, "pcr-ip-region-chip svelte-ch4fw9", null, classes_8, { active: get(r).name === forcedPrefillLabel() });
                set_attribute(button_9, "title", $0);
                set_text(text_10, `🧍 ${get(r).name ?? ""}`);
              },
              [() => get(r).text.slice(0, 400)]
            );
            delegated("click", button_9, () => applyRegionPrompt(get(r)));
            append($$anchor4, button_9);
          });
          append($$anchor3, fragment_10);
        };
        if_block(node_26, ($$render) => {
          if (regionPrompts().length && get(engineKind) !== "qwen" && !movedContent() && (!get(showModeRows) || !get(isRegionalMode))) $$render(consequent_22);
        });
      }
      var node_28 = sibling(node_26, 2);
      key(node_28, () => get(promptSeedKey) + ":" + get(promptRestoreNonce), ($$anchor3) => {
        var fragment_11 = comment();
        var node_29 = first_child(fragment_11);
        {
          var consequent_23 = ($$anchor4) => {
            var div_45 = root_33$2();
            action(div_45, ($$node) => promptEditor == null ? void 0 : promptEditor($$node));
            append($$anchor4, div_45);
          };
          var alternate_4 = ($$anchor4) => {
            var textarea = root_34$2();
            set_attribute(textarea, "placeholder", "what should appear in the painted region\n\nNegative Prompt:\noptional");
            bind_value(textarea, () => get(prompt), ($$value) => set(prompt, $$value));
            append($$anchor4, textarea);
          };
          if_block(node_29, ($$render) => {
            if (mountPromptEditor()) $$render(consequent_23);
            else $$render(alternate_4, -1);
          });
        }
        append($$anchor3, fragment_11);
      });
      var node_30 = sibling(node_28, 2);
      {
        var consequent_24 = ($$anchor3) => {
          var fragment_12 = root_35$2();
          var textarea_1 = sibling(first_child(fragment_12), 2);
          bind_this(textarea_1, ($$value) => refEl = $$value, () => refEl);
          template_effect(() => set_value(textarea_1, referencePrompt()));
          append($$anchor3, fragment_12);
        };
        if_block(node_30, ($$render) => {
          if (referencePrompt() && get(engineKind) !== "qwen") $$render(consequent_24);
        });
      }
      var div_46 = sibling(div_42, 2);
      var node_31 = sibling(child(div_46), 2);
      {
        var consequent_25 = ($$anchor3) => {
          var div_47 = root_36$2();
          var node_32 = sibling(child(div_47), 2);
          {
            let $0 = user_derived(() => {
              var _a;
              return ((_a = caps()) == null ? void 0 : _a.defaultDenoise) ?? 0.5;
            });
            SettingsSlider(node_32, {
              min: 0.05,
              max: 1,
              step: 0.01,
              get value() {
                return get(denoise);
              },
              get savedValue() {
                return get($0);
              },
              onChange: (v) => {
                set(denoise, v, true);
              }
            });
          }
          append($$anchor3, div_47);
        };
        if_block(node_31, ($$render) => {
          if (get(engineKind) !== "qwen") $$render(consequent_25);
        });
      }
      var node_33 = sibling(node_31, 2);
      {
        var consequent_26 = ($$anchor3) => {
          var div_48 = root_37$2();
          var div_49 = child(div_48);
          var select_3 = sibling(child(div_49), 2);
          let classes_9;
          each(select_3, 21, () => caps().samplerOptions, index, ($$anchor4, opt) => {
            var option_5 = root_38$2();
            let styles_3;
            var text_11 = child(option_5);
            var option_5_value = {};
            template_effect(
              ($0) => {
                styles_3 = set_style(option_5, "", styles_3, $0);
                set_text(text_11, `${get(opt) ?? ""}${get(opt) === get(recSampler) ? "  ●" : ""}`);
                if (option_5_value !== (option_5_value = get(opt))) {
                  option_5.value = (option_5.__value = get(opt)) ?? "";
                }
              },
              [
                () => {
                  var _a;
                  return {
                    color: get(opt) === get(recSampler) ? "#5ed357" : get(engineKind) === "source" && ((_a = caps().samplerAlternates) == null ? void 0 : _a.includes(get(opt))) ? "#5dcaff" : "#999"
                  };
                }
              ]
            );
            append($$anchor4, option_5);
          });
          var div_50 = sibling(div_49, 2);
          var select_4 = sibling(child(div_50), 2);
          let classes_10;
          each(select_4, 21, () => caps().schedulerOptions, index, ($$anchor4, opt) => {
            var option_6 = root_39$1();
            let styles_4;
            var text_12 = child(option_6);
            var option_6_value = {};
            template_effect(
              ($0) => {
                styles_4 = set_style(option_6, "", styles_4, $0);
                set_text(text_12, `${get(opt) ?? ""}${get(opt) === get(recScheduler) ? "  ●" : ""}`);
                if (option_6_value !== (option_6_value = get(opt))) {
                  option_6.value = (option_6.__value = get(opt)) ?? "";
                }
              },
              [
                () => {
                  var _a;
                  return {
                    color: get(opt) === get(recScheduler) ? "#5ed357" : get(engineKind) === "source" && ((_a = caps().schedulerAlternates) == null ? void 0 : _a.includes(get(opt))) ? "#5dcaff" : "#999"
                  };
                }
              ]
            );
            append($$anchor4, option_6);
          });
          template_effect(() => {
            classes_9 = set_class(select_3, 1, "pcr-ip-select svelte-ch4fw9", null, classes_9, { "at-rec": get(sampler) === get(recSampler) });
            classes_10 = set_class(select_4, 1, "pcr-ip-select svelte-ch4fw9", null, classes_10, { "at-rec": get(scheduler) === get(recScheduler) });
          });
          bind_select_value(select_3, () => get(sampler), ($$value) => set(sampler, $$value));
          bind_select_value(select_4, () => get(scheduler), ($$value) => set(scheduler, $$value));
          append($$anchor3, div_48);
        };
        if_block(node_33, ($$render) => {
          var _a, _b;
          if ((_b = (_a = caps()) == null ? void 0 : _a.samplerOptions) == null ? void 0 : _b.length) $$render(consequent_26);
        });
      }
      var div_51 = sibling(node_33, 2);
      var text_13 = child(div_51);
      var node_34 = sibling(div_51, 2);
      {
        var consequent_27 = ($$anchor3) => {
          var fragment_13 = root_40$1();
          var div_52 = first_child(fragment_13);
          var node_35 = sibling(child(div_52), 2);
          SettingsSlider(node_35, {
            min: 0,
            max: 64,
            step: 1,
            get value() {
              return get(grow);
            },
            savedValue: 0,
            onChange: (v) => {
              set(grow, v, true);
            }
          });
          var div_53 = sibling(div_52, 2);
          var node_36 = sibling(child(div_53), 2);
          SettingsSlider(node_36, {
            min: 0,
            max: 128,
            step: 1,
            get value() {
              return get(feather);
            },
            savedValue: 24,
            onChange: (v) => {
              set(feather, v, true);
            }
          });
          append($$anchor3, fragment_13);
        };
        if_block(node_34, ($$render) => {
          if (get(maskAdvancedOpen)) $$render(consequent_27);
        });
      }
      var node_37 = sibling(node_34, 2);
      {
        var consequent_28 = ($$anchor3) => {
          var fragment_14 = root_41$2();
          var node_38 = sibling(first_child(fragment_14), 2);
          SavePathInput(node_38, {
            get value() {
              return get(savePrefix);
            },
            onChange: (v) => {
              set(savePrefix, v, true);
            },
            get fetchApi() {
              return fetchApi();
            }
          });
          append($$anchor3, fragment_14);
        };
        if_block(node_37, ($$render) => {
          if (!onUseInEdit()) $$render(consequent_28);
        });
      }
      var node_39 = sibling(div_3, 2);
      {
        var consequent_29 = ($$anchor3) => {
          var div_54 = root_42$2();
          var text_14 = child(div_54);
          template_effect(() => set_text(text_14, `⚠ ${get(errorMsg) ?? ""}`));
          append($$anchor3, div_54);
        };
        if_block(node_39, ($$render) => {
          if (get(errorMsg)) $$render(consequent_29);
        });
      }
      var div_55 = sibling(node_39, 2);
      var node_40 = child(div_55);
      {
        var consequent_30 = ($$anchor3) => {
          var button_10 = root_43$2();
          delegated("click", button_10, stopRun);
          append($$anchor3, button_10);
        };
        var alternate_6 = ($$anchor3) => {
          var fragment_15 = root_44$2();
          var button_11 = first_child(fragment_15);
          var button_12 = sibling(button_11, 2);
          var text_15 = child(button_12);
          var node_41 = sibling(button_12, 2);
          {
            var consequent_31 = ($$anchor4) => {
              var button_13 = root_45$2();
              template_effect(() => button_13.disabled = !get(doneState));
              delegated("click", button_13, () => onUseInEdit()(get(doneState)));
              append($$anchor4, button_13);
            };
            var alternate_5 = ($$anchor4) => {
              var button_14 = root_46$2();
              var text_16 = child(button_14);
              template_effect(() => {
                button_14.disabled = !get(doneState) || get(saving);
                set_text(text_16, get(saving) ? "Saving…" : "Save");
              });
              delegated("click", button_14, save);
              append($$anchor4, button_14);
            };
            if_block(node_41, ($$render) => {
              if (onUseInEdit()) $$render(consequent_31);
              else $$render(alternate_5, -1);
            });
          }
          template_effect(() => {
            button_12.disabled = !get(hasMask) || get(installing);
            set_attribute(button_12, "title", !get(hasMask) ? "Paint a mask first" : "");
            set_text(text_15, get(doneState) ? "Re-Apply" : "Apply");
          });
          delegated("click", button_11, close);
          delegated("click", button_12, apply);
          append($$anchor3, fragment_15);
        };
        if_block(node_40, ($$render) => {
          if (get(running)) $$render(consequent_30);
          else $$render(alternate_6, -1);
        });
      }
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      template_effect(() => {
        styles = set_style(div, "", styles, { "z-index": elevated() ? 10006 : null });
        set_text(text_1, `${get(running) ? "Inpainting…" : "Inpaint"}${filename() ? ` — ${filename()}` : ""}${width() && height() ? ` · ${width()}×${height()}` : ""}`);
        classes = set_class(div_7, 1, "pcr-ip-tab svelte-ch4fw9", null, classes, { active: get(activeTab) === "mask" });
        classes_1 = set_class(div_8, 1, "pcr-ip-tab svelte-ch4fw9", null, classes_1, { active: get(activeTab) === "output" });
        classes_5 = set_class(div_12, 1, "pcr-ip-viewport svelte-ch4fw9", null, classes_5, { "out-mode": get(activeTab) === "output" });
        styles_1 = set_style(div_13, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""});`, styles_1, { display: get(activeTab) === "mask" ? null : "none" });
        set_attribute(img_1, "src", sourceUrl());
        set_attribute(img_1, "width", width());
        set_attribute(img_1, "height", height());
        set_attribute(canvas, "width", width());
        set_attribute(canvas, "height", height());
        styles_2 = set_style(canvas, "", styles_2, { opacity: get(maskOpacity) });
        set_text(text_8, get(engineKind) === "qwen" ? "Instruction" : "Prompt");
        set_text(text_13, `${get(maskAdvancedOpen) ? "▾" : "▸"} Advanced`);
      });
      delegated("keydown", div, handleKeydown);
      delegated("click", div_7, () => {
        if (!get(running)) set(activeTab, "mask");
      });
      delegated("click", div_8, () => {
        set(activeTab, "output");
      });
      delegated("pointerdown", div_12, onPointerDown);
      delegated("pointermove", div_12, onPointerMove);
      delegated("pointerup", div_12, onPointerUp);
      event("pointercancel", div_12, onPointerUp);
      event("pointerenter", div_12, () => {
        set(cursorOver, true);
      });
      event("pointerleave", div_12, () => {
        set(cursorOver, false);
      });
      event("wheel", div_12, onWheel);
      delegated("contextmenu", div_12, (e) => e.preventDefault());
      event("dragstart", div_12, (e) => e.preventDefault());
      event("selectstart", div_12, (e) => e.preventDefault());
      delegated("click", div_51, () => {
        set(maskAdvancedOpen, !get(maskAdvancedOpen));
      });
      append($$anchor2, div);
    };
    if_block(node_1, ($$render) => {
      if ($$props.open) $$render(consequent_32);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate([
  "keydown",
  "click",
  "pointerdown",
  "pointermove",
  "pointerup",
  "contextmenu",
  "change"
]);
var root_4$4 = from_html(`<div class="pcr-adj-slider svelte-k7hhb3"><span class="pcr-adj-label svelte-k7hhb3"> </span> <!></div>`);
var root_3$3 = from_html(`<div class="pcr-adj-group-body svelte-k7hhb3"></div>`);
var root_2$4 = from_html(`<div class="pcr-adj-group svelte-k7hhb3"><div class="pcr-adj-group-head svelte-k7hhb3"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"></path></svg> <span class="pcr-adj-group-title svelte-k7hhb3"> </span> <button class="pcr-adj-group-reset svelte-k7hhb3">↺</button></div> <!></div>`);
var root_1$4 = from_html(`<div class="pcr-modal-backdrop pcr-adj-backdrop svelte-k7hhb3"><div class="pcr-modal pcr-adj-modal svelte-k7hhb3" role="dialog" aria-modal="true"><div class="pcr-modal-header"><span class="pcr-modal-title">Camera Raw: <span class="pcr-adj-fname svelte-k7hhb3"> </span></span> <button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div> <div class="pcr-modal-body pcr-adj-body svelte-k7hhb3"><div class="pcr-adj-viewport svelte-k7hhb3"><div class="pcr-adj-stage svelte-k7hhb3"><canvas class="svelte-k7hhb3"></canvas></div></div> <div class="pcr-adj-panel svelte-k7hhb3"></div></div> <div class="pcr-modal-footer"><span class="pcr-adj-hint svelte-k7hhb3">scroll zooms · drag pans · double-click fits · sliders preview live, OK applies once</span> <button class="pcr-modal-btn pcr-modal-btn-secondary svelte-k7hhb3">Cancel</button> <button class="pcr-modal-btn pcr-modal-btn-primary svelte-k7hhb3"> </button></div></div></div>`);
function AdjustModal($$anchor, $$props) {
  push($$props, true);
  let sourceCanvas = prop(
    $$props,
    "sourceCanvas",
    3,
    null
    // flattened composite to adjust
  ), filename = prop($$props, "filename", 3, ""), onApply = prop(
    $$props,
    "onApply",
    3,
    null
    // (ImageData) => void
  );
  const GROUPS = [
    {
      id: "light",
      label: "Light",
      sliders: [
        {
          key: "exposure",
          label: "Exposure",
          min: -5,
          max: 5,
          step: 0.05
        },
        {
          key: "contrast",
          label: "Contrast",
          min: -100,
          max: 100,
          step: 1
        },
        {
          key: "highlights",
          label: "Highlights",
          min: -100,
          max: 100,
          step: 1
        },
        {
          key: "shadows",
          label: "Shadows",
          min: -100,
          max: 100,
          step: 1
        },
        { key: "whites", label: "Whites", min: -100, max: 100, step: 1 },
        { key: "blacks", label: "Blacks", min: -100, max: 100, step: 1 }
      ]
    },
    {
      id: "color",
      label: "Color",
      sliders: [
        {
          key: "temp",
          label: "Temperature",
          min: -100,
          max: 100,
          step: 1,
          rail: "linear-gradient(to right, #3f6fd1, #6e7686 50%, #e3c44d)"
        },
        {
          key: "tint",
          label: "Tint",
          min: -100,
          max: 100,
          step: 1,
          rail: "linear-gradient(to right, #4fae57, #6e7686 50%, #c25ac2)"
        },
        {
          key: "vibrance",
          label: "Vibrance",
          min: -100,
          max: 100,
          step: 1,
          rail: "linear-gradient(to right, #7d7d7d, #a8806f 35%, #ad9a62 50%, #6f9d7c 70%, #6f7fad 85%, #a06fa3 100%)"
        },
        {
          key: "saturation",
          label: "Saturation",
          min: -100,
          max: 100,
          step: 1,
          rail: "linear-gradient(to right, #808080, #c25c5c 30%, #c2a35c 50%, #5cc282 70%, #5c79c2 85%, #b05cc2 100%)"
        }
      ]
    },
    {
      id: "effects",
      label: "Effects",
      sliders: [
        {
          key: "texture",
          label: "Texture",
          min: -100,
          max: 100,
          step: 1
        },
        {
          key: "clarity",
          label: "Clarity",
          min: -100,
          max: 100,
          step: 1
        },
        { key: "dehaze", label: "Dehaze", min: -100, max: 100, step: 1 }
      ]
    },
    {
      id: "curve",
      label: "Curve",
      sliders: [
        {
          key: "curveH",
          label: "Highlights",
          min: -100,
          max: 100,
          step: 1
        },
        { key: "curveL", label: "Lights", min: -100, max: 100, step: 1 },
        { key: "curveD", label: "Darks", min: -100, max: 100, step: 1 },
        {
          key: "curveS",
          label: "Shadows",
          min: -100,
          max: 100,
          step: 1
        }
      ]
    },
    {
      id: "detail",
      label: "Detail",
      sliders: [
        {
          key: "sharpen",
          label: "Sharpening",
          min: 0,
          max: 150,
          step: 1
        },
        {
          key: "noise",
          label: "Noise Reduction",
          min: 0,
          max: 100,
          step: 1
        }
      ]
    }
  ];
  function defaultSettings() {
    const s = {};
    for (const g of GROUPS) for (const sl of g.sliders) s[sl.key] = 0;
    return s;
  }
  let settings = state(proxy(defaultSettings()));
  let collapsed = state(proxy({}));
  let applying = state(false);
  let viewportEl;
  let previewCanvas = state(null);
  let zoom = state(1);
  let panX = state(0);
  let panY = state(0);
  let panning = false;
  let panLast = null;
  let pw = 0;
  let ph = 0;
  let srcW = 0;
  let srcH = 0;
  let preview8 = null;
  let rafPending = false;
  let cp = null;
  let cpHash = [null, null, null, null, null];
  let dirtyFrom = Infinity;
  const SRGB2LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    SRGB2LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function lin2perc(c) {
    c = Math.max(0, Math.min(1, c));
    return c <= 31308e-7 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }
  function dither(x, y) {
    let h = x * 374761393 + y * 668265263 | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296 - 0.5;
  }
  user_effect(() => {
    if ($$props.open && sourceCanvas()) {
      set(settings, defaultSettings(), true);
      set(collapsed, {}, true);
      set(applying, false);
      srcW = sourceCanvas().width;
      srcH = sourceCanvas().height;
      const scale = Math.min(1, Math.sqrt(14e5 / (srcW * srcH)));
      pw = Math.max(2, Math.round(srcW * scale));
      ph = Math.max(2, Math.round(srcH * scale));
      const c = document.createElement("canvas");
      c.width = pw;
      c.height = ph;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceCanvas(), 0, 0, pw, ph);
      preview8 = ctx.getImageData(0, 0, pw, ph).data;
      cpHash = [null, null, null, null, null];
      dirtyFrom = Infinity;
      let tries = 0;
      const init = () => {
        const r = viewportEl == null ? void 0 : viewportEl.getBoundingClientRect();
        if ((!r || r.width < 10) && tries++ < 20) {
          requestAnimationFrame(init);
          return;
        }
        if (get(previewCanvas)) {
          get(previewCanvas).width = pw;
          get(previewCanvas).height = ph;
        }
        resetView();
        renderPreview();
      };
      requestAnimationFrame(init);
    }
  });
  user_effect(() => {
    if (!$$props.open) return;
    const onKey = (e) => {
      var _a, _b;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (!get(applying)) apply();
        return;
      }
      if (/^(INPUT|TEXTAREA)$/.test(((_a = e.target) == null ? void 0 : _a.tagName) || "")) return;
      if (e.key === "Escape" && !get(applying)) {
        e.preventDefault();
        e.stopPropagation();
        (_b = $$props.onCancel) == null ? void 0 : _b.call($$props);
      } else if (e.key === "Enter" && !get(applying)) {
        e.preventDefault();
        e.stopPropagation();
        apply();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  function resetView() {
    if (!viewportEl || !pw) {
      set(zoom, 1);
      set(panX, 0);
      set(panY, 0);
      return;
    }
    const rect = viewportEl.getBoundingClientRect();
    set(zoom, Math.min(rect.width / pw, rect.height / ph, 1) || 1, true);
    set(panX, (rect.width - pw * get(zoom)) / 2);
    set(panY, (rect.height - ph * get(zoom)) / 2);
  }
  function onWheel(e) {
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nz = Math.max(0.05, Math.min(8, get(zoom) * factor));
    set(panX, cx - (cx - get(panX)) / get(zoom) * nz);
    set(panY, cy - (cy - get(panY)) / get(zoom) * nz);
    set(zoom, nz, true);
  }
  function onPointerDown(e) {
    if (e.button > 2) return;
    e.preventDefault();
    panning = true;
    panLast = { x: e.clientX, y: e.clientY };
    viewportEl.setPointerCapture(e.pointerId);
    if (e.button === 2) {
      window.addEventListener("contextmenu", (ev) => ev.preventDefault(), { capture: true, once: true });
    }
  }
  function onPointerMove(e) {
    if (!panning) return;
    set(panX, get(panX) + (e.clientX - panLast.x));
    set(panY, get(panY) + (e.clientY - panLast.y));
    panLast = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    panning = false;
  }
  function setSlider(key2, v) {
    get(settings)[key2] = v;
    dirtyFrom = Math.min(dirtyFrom, SEG_OF_KEY[key2] ?? 0);
    scheduleRender();
  }
  function resetGroup(g) {
    for (const sl of g.sliders) get(settings)[sl.key] = 0;
    dirtyFrom = Math.min(dirtyFrom, ...g.sliders.map((sl) => SEG_OF_KEY[sl.key] ?? 0));
    scheduleRender();
  }
  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderPreview();
    });
  }
  function renderPreview() {
    if (!preview8 || !get(previewCanvas)) return;
    const out = runCachedPreview(preview8, pw, ph, pw / srcW);
    get(previewCanvas).getContext("2d").putImageData(out, 0, 0);
  }
  async function apply() {
    if (!onApply() || get(applying)) return;
    set(applying, true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const ctx = sourceCanvas().getContext("2d", { willReadFrequently: true });
      const full = ctx.getImageData(0, 0, srcW, srcH).data;
      const out = runFull(full, srcW, srcH, 1);
      onApply()(out);
    } finally {
      set(applying, false);
    }
  }
  function buildToneLUT(s) {
    const N = 1024;
    const lut = new Float32Array(N);
    const bp = -(s.blacks / 100) * 0.15;
    const wp = 1 - s.whites / 100 * 0.15;
    const span = Math.max(0.05, wp - bp);
    const k = Math.pow(3, s.contrast / 100);
    const cS = s.curveS / 100, cD = s.curveD / 100, cL = s.curveL / 100, cH = s.curveH / 100;
    for (let i = 0; i < N; i++) {
      let y = Math.max(0, Math.min(1, (i / (N - 1) - bp) / span));
      if (k !== 1) {
        const yk = Math.pow(y, k);
        y = yk / (yk + Math.pow(1 - y, k));
      }
      let add = 0;
      if (cS && y < 0.25) add += cS * (1 + Math.cos(Math.PI * y / 0.25)) / 2;
      if (cD && y < 0.5) {
        const t = Math.sin(Math.PI * y / 0.5);
        add += cD * t * t;
      }
      if (cL && y >= 0.5) {
        const t = Math.sin(Math.PI * (y - 0.5) / 0.5);
        add += cL * t * t;
      }
      if (cH && y > 0.75) add += cH * (1 - Math.cos(Math.PI * (y - 0.75) / 0.25)) / 2;
      lut[i] = Math.max(0, Math.min(1, y + 0.25 * add));
    }
    return lut;
  }
  function buildChannelLUTs(s) {
    const t = s.temp / 100, ti = s.tint / 100;
    let gR = 1 + 0.3 * t, gB = 1 - 0.3 * t, gG = 1 + 0.12 * ti;
    const Y = 0.2126 * gR + 0.7152 * gG + 0.0722 * gB;
    gR /= Y;
    gG /= Y;
    gB /= Y;
    const ev = Math.pow(2, s.exposure);
    const tone = buildToneLUT(s);
    const gains = [gR * ev, gG * ev, gB * ev];
    const luts = [
      new Float32Array(256),
      new Float32Array(256),
      new Float32Array(256)
    ];
    for (let ch = 0; ch < 3; ch++) {
      for (let i = 0; i < 256; i++) {
        const p = lin2perc(SRGB2LIN[i] * gains[ch]);
        luts[ch][i] = tone[Math.min(1023, p * 1023 | 0)];
      }
    }
    return luts;
  }
  function boxBlur(src, w, h, radius, iterations = 3) {
    const r = Math.max(1, Math.round(radius));
    let a = Float32Array.from(src);
    let b = new Float32Array(src.length);
    const norm = 1 / (2 * r + 1);
    for (let it = 0; it < iterations; it++) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let acc = a[row] * (r + 1);
        for (let x = 1; x <= r; x++) acc += a[row + Math.min(x, w - 1)];
        for (let x = 0; x < w; x++) {
          b[row + x] = acc * norm;
          acc += a[row + Math.min(x + r + 1, w - 1)] - a[row + Math.max(x - r, 0)];
        }
      }
      for (let x = 0; x < w; x++) {
        let acc = b[x] * (r + 1);
        for (let y = 1; y <= r; y++) acc += b[Math.min(y, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
          a[y * w + x] = acc * norm;
          acc += b[Math.min(y + r + 1, h - 1) * w + x] - b[Math.max(y - r, 0) * w + x];
        }
      }
    }
    return a;
  }
  function softLight(ta, lb) {
    return ta > 0.5 ? 1 - (1 - 2 * (ta - 0.5)) * (1 - lb) : 2 * ta * lb;
  }
  function planarLum(R, G, B, n) {
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
    return L;
  }
  function applyRatio(R, G, B, i, ratio) {
    if (!isFinite(ratio)) return;
    R[i] = Math.max(0, Math.min(1, R[i] * ratio));
    G[i] = Math.max(0, Math.min(1, G[i] * ratio));
    B[i] = Math.max(0, Math.min(1, B[i] * ratio));
  }
  function stageDecode(R, G, B, src8, n, luts) {
    for (let i = 0; i < n; i++) {
      R[i] = luts[0][src8[i * 4]];
      G[i] = luts[1][src8[i * 4 + 1]];
      B[i] = luts[2][src8[i * 4 + 2]];
    }
  }
  function stageShadowsHighlights(R, G, B, n, w, h, s) {
    if (s.highlights === 0 && s.shadows === 0) return;
    const L = planarLum(R, G, B, n);
    const guide = boxBlur(L, w, h, Math.max(6, Math.min(w, h) * 0.04));
    const hl = s.highlights / 100, sh = s.shadows / 100;
    const smooth = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    for (let i = 0; i < n; i++) {
      let ta = L[i];
      if (ta <= 1e-3) continue;
      if (hl !== 0) {
        const m = smooth(0.45, 0.85, guide[i]);
        if (m > 0) {
          const g = 1 + hl * (hl < 0 ? 0.6 : 0.35) * m;
          ta = 0.5 + (ta - 0.5) * g;
        }
      }
      if (sh !== 0) {
        const tb = 1 - guide[i];
        if (tb > 0.5) {
          const optrans = Math.min(1, sh * sh) * Math.min(1, 2 * tb - 1);
          if (optrans > 0) {
            const lb = (tb - 0.5) * Math.sign(sh) * Math.sign(1 - ta) + 0.5;
            ta = ta * (1 - optrans) + softLight(ta, lb) * optrans;
          }
        }
      }
      ta = Math.max(0, Math.min(1, ta));
      if (ta !== L[i]) applyRatio(R, G, B, i, ta / L[i]);
    }
  }
  function stageColor(R, G, B, n, s) {
    if (s.vibrance === 0 && s.saturation === 0) return;
    const v = s.vibrance / 100;
    const satScale = 1 + s.saturation / 100;
    for (let i = 0; i < n; i++) {
      let r = R[i], g = G[i], b = B[i];
      if (v !== 0) {
        const mx = Math.max(r, g, b);
        const avg = (r + g + b) / 3;
        const amt = (mx - avg) * 3 * -v;
        r = r * (1 - amt) + mx * amt;
        g = g * (1 - amt) + mx * amt;
        b = b * (1 - amt) + mx * amt;
      }
      if (satScale !== 1) {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = gray + (r - gray) * satScale;
        g = gray + (g - gray) * satScale;
        b = gray + (b - gray) * satScale;
      }
      R[i] = Math.max(0, Math.min(1, r));
      G[i] = Math.max(0, Math.min(1, g));
      B[i] = Math.max(0, Math.min(1, b));
    }
  }
  function stageDehaze(R, G, B, n, w, h, s) {
    if (s.dehaze === 0) return;
    const d = s.dehaze / 100;
    if (d > 0) {
      const dark = new Float32Array(n);
      for (let i = 0; i < n; i++) dark[i] = Math.min(R[i], G[i], B[i]);
      const darkMin = boxBlur(dark, w, h, Math.max(4, Math.min(w, h) * 0.015), 1);
      let A = 0.05;
      for (let i = 0; i < n; i += 7) if (darkMin[i] > A) A = darkMin[i];
      A = Math.min(1, A + 0.05);
      const trans = boxBlur(darkMin, w, h, Math.max(8, Math.min(w, h) * 0.03), 2);
      for (let i = 0; i < n; i++) {
        const t = Math.max(0.15, 1 - 0.95 * (trans[i] / A));
        const jr = (R[i] - A) / t + A, jg = (G[i] - A) / t + A, jb = (B[i] - A) / t + A;
        R[i] = Math.max(0, Math.min(1, R[i] + (jr - R[i]) * d));
        G[i] = Math.max(0, Math.min(1, G[i] + (jg - G[i]) * d));
        B[i] = Math.max(0, Math.min(1, B[i] + (jb - B[i]) * d));
      }
    } else {
      const k = -d * 0.35;
      for (let i = 0; i < n; i++) {
        R[i] += (0.85 - R[i]) * k;
        G[i] += (0.85 - G[i]) * k;
        B[i] += (0.85 - B[i]) * k;
      }
    }
  }
  function stageClarityTexture(R, G, B, n, w, h, scale, s) {
    if (s.clarity === 0 && s.texture === 0) return;
    const L = planarLum(R, G, B, n);
    let detail = null;
    if (s.clarity !== 0) {
      const Lb = boxBlur(L, w, h, Math.max(8, Math.min(w, h) * 0.06));
      detail = new Float32Array(n);
      const c = s.clarity / 100 * 0.9;
      for (let i = 0; i < n; i++) {
        detail[i] = c * (L[i] - Lb[i]) * 4 * L[i] * (1 - L[i]);
      }
    }
    if (s.texture !== 0) {
      const fine = boxBlur(L, w, h, Math.max(1, 2 * scale), 2);
      const coarse = boxBlur(L, w, h, Math.max(3, 12 * scale), 2);
      const t = s.texture / 100 * 0.7;
      if (!detail) detail = new Float32Array(n);
      for (let i = 0; i < n; i++) detail[i] += t * (fine[i] - coarse[i]);
    }
    for (let i = 0; i < n; i++) {
      if (L[i] > 1e-3 && detail[i] !== 0) applyRatio(R, G, B, i, (L[i] + detail[i]) / L[i]);
    }
  }
  function stageDetail(R, G, B, n, w, h, scale, s) {
    if (!(s.sharpen > 0) && !(s.noise > 0)) return;
    const L = planarLum(R, G, B, n);
    if (s.noise > 0) {
      const k = s.noise / 100;
      const Ls = boxBlur(L, w, h, Math.max(1, 1.5 * scale), 2);
      for (let i = 0; i < n; i++) {
        const e = Math.min(1, Math.abs(L[i] - Ls[i]) * 12);
        const nl = L[i] + (Ls[i] - L[i]) * k * (1 - e);
        if (L[i] > 1e-3) applyRatio(R, G, B, i, nl / L[i]);
        L[i] = nl;
      }
    }
    if (s.sharpen > 0) {
      const amt = s.sharpen / 100 * 1.2;
      const Lb = boxBlur(L, w, h, Math.max(1, Math.round(1 * scale)), 2);
      for (let i = 0; i < n; i++) {
        const hp = L[i] - Lb[i];
        if (L[i] > 1e-3 && hp !== 0) applyRatio(R, G, B, i, (L[i] + amt * hp) / L[i]);
      }
    }
  }
  function encodePlanar(R, G, B, src8, w, h) {
    const out = new ImageData(w, h);
    const o = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, j = i * 4;
        const dd = dither(x, y);
        o[j] = Math.max(0, Math.min(255, Math.round(R[i] * 255 + dd)));
        o[j + 1] = Math.max(0, Math.min(255, Math.round(G[i] * 255 + dd)));
        o[j + 2] = Math.max(0, Math.min(255, Math.round(B[i] * 255 + dd)));
        o[j + 3] = src8[j + 3];
      }
    }
    return out;
  }
  const SEG_DEPS = [
    [
      "temp",
      "tint",
      "exposure",
      "contrast",
      "blacks",
      "whites",
      "curveH",
      "curveL",
      "curveD",
      "curveS"
    ],
    ["highlights", "shadows"],
    ["vibrance", "saturation", "dehaze"],
    ["clarity", "texture"],
    ["sharpen", "noise"]
  ];
  const SEG_OF_KEY = {};
  SEG_DEPS.forEach((keys, k) => keys.forEach((key2) => {
    SEG_OF_KEY[key2] = k;
  }));
  const segHash = (k) => SEG_DEPS[k].map((key2) => get(settings)[key2]).join(",");
  function runSegment(k, R, G, B, n, w, h, scale, s) {
    if (k === 1) stageShadowsHighlights(R, G, B, n, w, h, s);
    else if (k === 2) {
      stageColor(R, G, B, n, s);
      stageDehaze(R, G, B, n, w, h, s);
    } else if (k === 3) stageClarityTexture(R, G, B, n, w, h, scale, s);
    else if (k === 4) stageDetail(R, G, B, n, w, h, scale, s);
  }
  function runFull(src8, w, h, scale) {
    const s = get(settings);
    const n = w * h;
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    stageDecode(R, G, B, src8, n, buildChannelLUTs(s));
    for (let k = 1; k <= 4; k++) runSegment(k, R, G, B, n, w, h, scale, s);
    return encodePlanar(R, G, B, src8, w, h);
  }
  function ensureCheckpoints(n) {
    if (cp && cp[0].R.length === n) return;
    cp = [];
    for (let k = 0; k < 5; k++) {
      cp.push({
        R: new Float32Array(n),
        G: new Float32Array(n),
        B: new Float32Array(n)
      });
    }
    cpHash = [null, null, null, null, null];
  }
  function runCachedPreview(src8, w, h, scale) {
    const s = get(settings);
    const n = w * h;
    ensureCheckpoints(n);
    let from = dirtyFrom;
    for (let k = 0; k < Math.min(from, 5); k++) {
      if (cpHash[k] !== segHash(k)) {
        from = k;
        break;
      }
    }
    dirtyFrom = Infinity;
    if (from <= 4) {
      const luts = from === 0 ? buildChannelLUTs(s) : null;
      for (let k = from; k < 5; k++) {
        const cur = cp[k];
        if (k === 0) {
          stageDecode(cur.R, cur.G, cur.B, src8, n, luts);
        } else {
          const prev = cp[k - 1];
          cur.R.set(prev.R);
          cur.G.set(prev.G);
          cur.B.set(prev.B);
          runSegment(k, cur.R, cur.G, cur.B, n, w, h, scale, s);
        }
        cpHash[k] = segHash(k);
      }
    }
    return encodePlanar(cp[4].R, cp[4].G, cp[4].B, src8, w, h);
  }
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent_1 = ($$anchor2) => {
      var div = root_1$4();
      var div_1 = child(div);
      var div_2 = child(div_1);
      var span_1 = child(div_2);
      var span_2 = sibling(child(span_1));
      var text = child(span_2);
      var button = sibling(span_1, 2);
      var div_3 = sibling(div_2, 2);
      var div_4 = child(div_3);
      var div_5 = child(div_4);
      var canvas = child(div_5);
      bind_this(canvas, ($$value) => set(previewCanvas, $$value), () => get(previewCanvas));
      bind_this(div_4, ($$value) => viewportEl = $$value, () => viewportEl);
      var div_6 = sibling(div_4, 2);
      each(div_6, 21, () => GROUPS, index, ($$anchor3, g) => {
        var div_7 = root_2$4();
        var div_8 = child(div_7);
        var svg = child(div_8);
        let classes;
        var span_3 = sibling(svg, 2);
        var text_1 = child(span_3);
        var button_1 = sibling(span_3, 2);
        var node_1 = sibling(div_8, 2);
        {
          var consequent = ($$anchor4) => {
            var div_9 = root_3$3();
            each(div_9, 21, () => get(g).sliders, index, ($$anchor5, sl) => {
              var div_10 = root_4$4();
              var span_4 = child(div_10);
              var text_2 = child(span_4);
              var node_2 = sibling(span_4, 2);
              SettingsSlider(node_2, {
                get min() {
                  return get(sl).min;
                },
                get max() {
                  return get(sl).max;
                },
                get step() {
                  return get(sl).step;
                },
                get value() {
                  return get(settings)[get(sl).key];
                },
                savedValue: 0,
                get rail() {
                  return get(sl).rail;
                },
                onChange: (v) => setSlider(get(sl).key, v)
              });
              template_effect(() => set_text(text_2, get(sl).label));
              append($$anchor5, div_10);
            });
            append($$anchor4, div_9);
          };
          if_block(node_1, ($$render) => {
            if (!get(collapsed)[get(g).id]) $$render(consequent);
          });
        }
        template_effect(() => {
          classes = set_class(svg, 0, "pcr-adj-chev svelte-k7hhb3", null, classes, { open: !get(collapsed)[get(g).id] });
          set_text(text_1, get(g).label);
          set_attribute(button_1, "title", `Reset ${get(g).label ?? ""}`);
        });
        delegated("click", div_8, () => {
          get(collapsed)[get(g).id] = !get(collapsed)[get(g).id];
        });
        delegated("click", button_1, (e) => {
          e.stopPropagation();
          resetGroup(get(g));
        });
        append($$anchor3, div_7);
      });
      var div_11 = sibling(div_3, 2);
      var button_2 = sibling(child(div_11), 2);
      var button_3 = sibling(button_2, 2);
      var text_3 = child(button_3);
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      template_effect(() => {
        set_text(text, filename());
        set_style(div_5, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""});`);
        button_2.disabled = get(applying);
        button_3.disabled = get(applying);
        set_text(text_3, get(applying) ? "Applying…" : "OK");
      });
      delegated("click", button, () => {
        var _a;
        return (_a = $$props.onCancel) == null ? void 0 : _a.call($$props);
      });
      delegated("pointerdown", div_4, onPointerDown);
      delegated("pointermove", div_4, onPointerMove);
      delegated("pointerup", div_4, onPointerUp);
      event("pointercancel", div_4, onPointerUp);
      event("wheel", div_4, onWheel);
      delegated("contextmenu", div_4, (e) => e.preventDefault());
      delegated("dblclick", div_4, resetView);
      delegated("click", button_2, () => {
        var _a;
        return (_a = $$props.onCancel) == null ? void 0 : _a.call($$props);
      });
      delegated("click", button_3, apply);
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      if ($$props.open) $$render(consequent_1);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate([
  "click",
  "pointerdown",
  "pointermove",
  "pointerup",
  "contextmenu",
  "dblclick"
]);
var root_2$3 = from_html(`<span class="pcr-ed-dims svelte-1ozzqkm"> </span>`);
var root_3$2 = from_svg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 8.5 V6.5 A1.5 1.5 0 0 1 10 5 H17.5 A1.5 1.5 0 0 1 19 6.5 V14 A1.5 1.5 0 0 1 17.5 15.5 H15.5"></path><rect x="5" y="8.5" width="10.5" height="10.5" rx="1.5"></rect></svg>`);
var root_4$3 = from_svg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="1.5"></rect></svg>`);
var root_5$3 = from_html(`<div class="pcr-ed-restoring svelte-1ozzqkm"><div class="pcr-ed-restoring-card svelte-1ozzqkm"><span class="pcr-ed-spinner svelte-1ozzqkm"></span> <span> </span></div></div>`);
var root_6$2 = from_html(`<span class="pcr-ed-label svelte-1ozzqkm">Transform</span> <button class="pcr-ed-tool-btn svelte-1ozzqkm" title="Flip horizontal">⇆ Flip H</button> <button class="pcr-ed-tool-btn svelte-1ozzqkm" title="Flip vertical">⇅ Flip V</button> <span class="pcr-ed-opt-readout svelte-1ozzqkm"> </span> <button class="pcr-ed-tool-btn svelte-1ozzqkm" title="Reset to the original size, rotation and flip">Reset</button> <button class="pcr-ed-tool-btn pcr-ed-pop-ok svelte-1ozzqkm">✓ Apply</button> <span class="pcr-ed-opt-hint svelte-1ozzqkm">drag a corner to scale · the knob above rotates (Shift = 15° steps) · drag inside to move · Shift on a corner keeps proportions · Enter applies · Esc cancels</span>`, 1);
var root_7$2 = from_html(`<div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Tolerance</span> <!></div> <button>Contiguous</button> <span class="pcr-ed-opt-hint svelte-1ozzqkm">click to flood-fill with the foreground color · constrained to the selection · Alt/Ctrl+Backspace fills</span>`, 1);
var root_8$2 = from_html(`<div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Blur</span> <!></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Feather</span> <!></div> <span class="pcr-ed-opt-hint svelte-1ozzqkm">lasso a region — it blurs and feather-blends on release</span>`, 1);
var root_9$2 = from_html(`<div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Size</span> <!></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Hardness</span> <!></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Opacity</span> <!></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Flow</span> <!></div> <button title="Airbrush — paint keeps building while you hold the button (Flow = rate, Opacity = ceiling)"><svg viewBox="0 0 24 24" class="svelte-1ozzqkm"><path d="M3 3h.01"></path><path d="M7 5h.01"></path><path d="M11 3h.01"></path><path d="M3 7h.01"></path><path d="M7 9h.01"></path><path d="M3 11h.01"></path><rect width="4" height="4" x="15" y="5"></rect><path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2"></path><path d="m13 14 8-2"></path></svg></button>`, 1);
var root_11$1 = from_html(`<div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Opacity</span> <!></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Flow</span> <!></div>`, 1);
var root_12$2 = from_html(`<span class="pcr-ed-opt-hint svelte-1ozzqkm">paint over a blemish — it heals from the surroundings on release</span>`);
var root_13$2 = from_html(`<span class="pcr-ed-opt-hint svelte-1ozzqkm"> </span>`);
var root_14$2 = from_html(`<span class="pcr-ed-opt-hint svelte-1ozzqkm"> </span>`);
var root_10$2 = from_html(`<div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Size</span> <!></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Hardness</span> <!></div> <!> <!>`, 1);
var root_16$2 = from_html(`<button> </button>`);
var root_17$2 = from_html(`<div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Rate</span> <!></div>`);
var root_15$2 = from_html(`<div class="pcr-ed-liq-seg svelte-1ozzqkm"></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Size</span> <!></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Density</span> <!></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Pressure</span> <!></div> <!> <span class="pcr-ed-opt-hint svelte-1ozzqkm"> </span>`, 1);
var root_19$2 = from_html(`<option> </option>`);
var root_18$2 = from_html(`<div class="pcr-ed-opt pcr-ed-opt-narrow svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Ratio</span> <select class="pcr-ed-opt-select svelte-1ozzqkm"></select> <button class="pcr-ed-tool-btn svelte-1ozzqkm" title="Swap width and height">⇄</button></div> <button class="pcr-ed-tool-btn pcr-ed-pop-ok svelte-1ozzqkm">✓ Apply</button> <button class="pcr-ed-tool-btn svelte-1ozzqkm">Reset</button> <span class="pcr-ed-opt-hint svelte-1ozzqkm">drag handles · drag inside to move · Shift locks ratio · Enter / double-click applies · Esc resets</span>`, 1);
var root_21$1 = from_html(`<button class="pcr-ed-tool-btn svelte-1ozzqkm"> </button>`);
var root_20$2 = from_html(`<div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Feather</span> <!></div> <div class="pcr-ed-opt svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Opacity</span> <!></div> <button class="pcr-ed-tool-btn svelte-1ozzqkm" title="AI-select the main subject of the image"> </button> <!> <span class="pcr-ed-opt-hint svelte-1ozzqkm"> <b>Ctrl+J</b> copy / <b>Ctrl+Shift+J</b> cut to a new layer · Ctrl+C/V · Esc deselects · Feather softens the edge</span>`, 1);
var root_23$1 = from_html(`<button class="pcr-ed-tool-btn svelte-1ozzqkm"> </button>`);
var root_22$1 = from_html(`<button class="pcr-ed-tool-btn svelte-1ozzqkm" title="AI-select the main subject of the image"> </button> <!> <span class="pcr-ed-opt-hint svelte-1ozzqkm"> </span>`, 1);
var root_24$1 = from_html(`<div class="pcr-ed-opt pcr-ed-opt-narrow svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Sample</span> <select class="pcr-ed-opt-select svelte-1ozzqkm"><option>Point</option><option>3×3 average</option><option>5×5 average</option></select></div> <span class="pcr-ed-opt-hint svelte-1ozzqkm">click the image to pick a color · hold to preview · Screen pick grabs from anywhere</span>`, 1);
var root_25$1 = from_html(`<button><svg viewBox="0 0 24 24" class="svelte-1ozzqkm"></svg></button>`);
var root_27$1 = from_html(`<button class="pcr-ed-tool-btn svelte-1ozzqkm" title="Pick a color from anywhere on screen">Screen pick</button>`);
var root_26$1 = from_html(`<div class="pcr-ed-color-pop svelte-1ozzqkm"><span class="pcr-ed-panel-title svelte-1ozzqkm">Color</span> <div class="pcr-ed-sv svelte-1ozzqkm"><div class="pcr-ed-sv-white svelte-1ozzqkm"></div> <div class="pcr-ed-sv-black svelte-1ozzqkm"></div> <div class="pcr-ed-sv-thumb svelte-1ozzqkm"></div></div> <div class="pcr-ed-hue svelte-1ozzqkm"><div class="pcr-ed-hue-thumb svelte-1ozzqkm"></div></div> <div class="pcr-ed-color-row svelte-1ozzqkm"><span class="pcr-ed-swatch svelte-1ozzqkm"></span> <span class="pcr-ed-hex svelte-1ozzqkm"> </span> <!></div> <div class="pcr-ed-hint svelte-1ozzqkm">click the image to pick a color</div> <div class="pcr-ed-pop-btns svelte-1ozzqkm"><button class="pcr-ed-tool-btn svelte-1ozzqkm">Cancel</button> <button class="pcr-ed-tool-btn pcr-ed-pop-ok svelte-1ozzqkm">OK</button></div></div>`);
var root_29$1 = from_html(`<canvas class="svelte-1ozzqkm"></canvas>`);
var root_30$1 = from_html(`<div class="pcr-ed-heal-src svelte-1ozzqkm"></div>`);
var root_31$1 = from_html(`<div class="pcr-ed-marquee svelte-1ozzqkm"></div>`);
var root_32$1 = from_svg(`<svg class="pcr-ed-lasso svelte-1ozzqkm"><polyline class="pcr-ed-lasso-halo svelte-1ozzqkm"></polyline><polyline class="pcr-ed-lasso-line svelte-1ozzqkm"></polyline></svg>`);
var root_33$1 = from_html(`<div class="pcr-ed-snapguide svelte-1ozzqkm"></div>`);
var root_34$1 = from_html(`<div class="pcr-ed-snapguide svelte-1ozzqkm"></div>`);
var root_35$1 = from_svg(`<svg class="pcr-ed-selants svelte-1ozzqkm"><g class="svelte-1ozzqkm"><path class="pcr-ed-selants-bg svelte-1ozzqkm"></path><path class="pcr-ed-selants-fg svelte-1ozzqkm"></path></g></svg>`);
var root_37$1 = from_html(`<div class="pcr-ed-thirds pcr-ed-thirds-v svelte-1ozzqkm"></div> <div class="pcr-ed-thirds pcr-ed-thirds-v svelte-1ozzqkm"></div> <div class="pcr-ed-thirds pcr-ed-thirds-h svelte-1ozzqkm"></div> <div class="pcr-ed-thirds pcr-ed-thirds-h svelte-1ozzqkm"></div>`, 1);
var root_38$1 = from_html(`<div class="pcr-ed-crop-handle svelte-1ozzqkm"></div>`);
var root_36$1 = from_html(`<svg class="pcr-ed-crop-shield svelte-1ozzqkm"><path fill-rule="evenodd" class="svelte-1ozzqkm"></path></svg> <div><!></div> <!>`, 1);
var root_40 = from_html(`<div class="pcr-ed-handle svelte-1ozzqkm"></div>`);
var root_41$1 = from_html(`<div class="pcr-ed-rot-stem svelte-1ozzqkm"></div> <div class="pcr-ed-rot-knob svelte-1ozzqkm" title="Drag to rotate · Shift snaps to 15°"></div>`, 1);
var root_39 = from_html(`<div class="pcr-ed-patch-wrap svelte-1ozzqkm"><canvas class="pcr-ed-patch svelte-1ozzqkm"></canvas> <div class="pcr-ed-patch-border svelte-1ozzqkm"></div> <!> <!></div>`);
var root_42$1 = from_html(`<div class="pcr-ed-cursor svelte-1ozzqkm"></div>`);
var root_43$1 = from_html(`<div class="pcr-ed-sel-badge svelte-1ozzqkm"> </div>`);
var root_44$1 = from_html(`<div class="pcr-ed-heal-cross svelte-1ozzqkm"></div>`);
var root_45$1 = from_html(`<div class="pcr-ed-pick-bubble svelte-1ozzqkm"></div>`);
var root_46$1 = from_html(`<div class="pcr-ed-float-hint svelte-1ozzqkm">drag / stretch · Enter applies · Esc cancels</div>`);
var root_47$1 = from_html(`<div class="pcr-ed-nav-rect svelte-1ozzqkm"></div>`);
var root_49$1 = from_html(`<button class="pcr-ed-ip-render svelte-1ozzqkm">✦ Inpaint</button>`);
var root_50$1 = from_html(`<button class="pcr-ed-ip-render svelte-1ozzqkm">✦ Upscale</button>`);
var root_51$1 = from_html(`<div class="pcr-ed-render-row svelte-1ozzqkm"><button class="pcr-ed-ip-render svelte-1ozzqkm" title="Re-pose — pose a 3D figure and re-render this whole image into the new pose. Result is a new image in lineage.">✦ Re-pose</button></div>`);
var root_48$1 = from_html(`<div class="pcr-ed-panel svelte-1ozzqkm"><span class="pcr-ed-panel-title svelte-1ozzqkm"> </span> <div class="pcr-ed-render-row svelte-1ozzqkm"><!> <!></div> <!></div>`);
var root_52$1 = from_html(`<span class="pcr-ed-layer-actions svelte-1ozzqkm"><button class="pcr-ed-layer-btn svelte-1ozzqkm" title="New layer (Ctrl+Shift+N)">＋</button> <button class="pcr-ed-layer-btn svelte-1ozzqkm" title="Merge selected layers">⬇</button> <button class="pcr-ed-layer-btn svelte-1ozzqkm" title="Flatten image">▣</button> <button class="pcr-ed-layer-btn svelte-1ozzqkm">🗑</button></span>`);
var root_54$1 = from_html(`<option> </option>`);
var root_56$1 = from_html(`<input class="pcr-ed-layer-rename svelte-1ozzqkm" type="text"/>`);
var root_58$1 = from_html(`<span class="pcr-ed-layer-blendtag svelte-1ozzqkm" title="Has a layer mask">▦</span>`);
var root_59$1 = from_html(`<span class="pcr-ed-layer-blendtag svelte-1ozzqkm"> </span>`);
var root_57$1 = from_html(`<span class="pcr-ed-layer-name svelte-1ozzqkm" title="Double-click to rename"> <!><!></span>`);
var root_55$1 = from_html(`<div><span title="Drag to reorder">⠿</span> <span title="Toggle visibility"> </span> <!> <input class="pcr-ed-layer-opacity svelte-1ozzqkm" type="range" min="0" max="1" step="0.05" title="Opacity"/></div>`);
var root_53$1 = from_html(`<select class="pcr-ed-blend-select svelte-1ozzqkm" title="Blend mode of the active layer"></select> <div class="pcr-ed-layers svelte-1ozzqkm"></div>`, 1);
var root_61$1 = from_html(`<div> </div>`);
var root_60$1 = from_html(`<div class="pcr-ed-hist svelte-1ozzqkm"></div>`);
var root_63$1 = from_html(`<button class="svelte-1ozzqkm">Merge Layers</button>`);
var root_64$1 = from_html(`<button class="svelte-1ozzqkm">Merge Down</button>`);
var root_66 = from_html(`<button class="svelte-1ozzqkm"> </button>`);
var root_67 = from_html(`<button class="svelte-1ozzqkm">Apply Layer Mask</button> <button class="svelte-1ozzqkm">Delete Layer Mask</button>`, 1);
var root_68 = from_html(`<button class="svelte-1ozzqkm">Match Colors to Below</button>`);
var root_69 = from_html(`<button class="danger svelte-1ozzqkm"> </button>`);
var root_62$1 = from_html(`<div class="pcr-ed-layer-menu svelte-1ozzqkm"><button class="svelte-1ozzqkm">New Layer</button> <!> <button class="svelte-1ozzqkm">Duplicate Layer</button> <!> <!> <button class="svelte-1ozzqkm">Flatten Image</button> <!></div>`);
var root_71 = from_html(`<button class="svelte-1ozzqkm">Deselect</button> <button class="svelte-1ozzqkm">Select Inverse</button>`, 1);
var root_72 = from_html(`<button class="svelte-1ozzqkm">Layer Via Copy</button> <button class="svelte-1ozzqkm">Layer Via Cut</button>`, 1);
var root_70 = from_html(`<div class="pcr-ed-layer-menu svelte-1ozzqkm"><!> <button class="svelte-1ozzqkm"> </button> <button class="svelte-1ozzqkm">Select All</button> <button class="svelte-1ozzqkm"> </button> <!></div>`);
var root_73 = from_html(`<div class="pcr-ed-error svelte-1ozzqkm"> </div>`);
var root_74 = from_html(`<div class="pcr-ed-error pcr-ed-busy svelte-1ozzqkm"> </div>`);
var root_75 = from_html(`<div class="pcr-ed-error pcr-ed-busy svelte-1ozzqkm">⏳ Selecting subject…</div>`);
var root_76 = from_html(`<div class="pcr-ed-dialog-backdrop svelte-1ozzqkm"><div class="pcr-ed-dialog svelte-1ozzqkm" role="alertdialog"><div class="pcr-ed-dialog-text svelte-1ozzqkm"> <span class="pcr-ed-dialog-em svelte-1ozzqkm">Alt-click</span> a clean area of the image to define a source point, then paint.</div> <div class="pcr-ed-dialog-btns svelte-1ozzqkm"><button class="pcr-modal-btn pcr-modal-btn-primary svelte-1ozzqkm">OK</button></div></div></div>`);
var root_77 = from_html(`<div class="pcr-ed-dialog-backdrop svelte-1ozzqkm"><div class="pcr-ed-dialog svelte-1ozzqkm" role="alertdialog"><div class="pcr-ed-dialog-text svelte-1ozzqkm"> </div> <div class="pcr-ed-dialog-btns svelte-1ozzqkm"><button class="pcr-modal-btn pcr-modal-btn-primary svelte-1ozzqkm">OK</button></div></div></div>`);
var root_78 = from_html(`<span class="pcr-ed-saved svelte-1ozzqkm">✓ Edits saved</span>`);
var root_1$3 = from_html(`<div class="pcr-modal-backdrop"><div role="dialog" aria-modal="true"><div class="pcr-modal-header"><span class="pcr-modal-title">Editing: <span class="pcr-ed-fname svelte-1ozzqkm"> </span><!></span> <div class="pcr-ed-headbtns svelte-1ozzqkm"><button class="pcr-modal-close"><!></button> <button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div></div> <!> <div class="pcr-modal-body pcr-ed-body svelte-1ozzqkm"><div class="pcr-ed-optbar svelte-1ozzqkm"><!></div> <div class="pcr-ed-cols svelte-1ozzqkm"><div class="pcr-ed-toolstrip svelte-1ozzqkm"><!> <div class="pcr-ed-strip-sep svelte-1ozzqkm"></div> <button class="pcr-ed-strip-btn svelte-1ozzqkm" title="Undo (Ctrl+Z)"><svg viewBox="0 0 24 24" class="svelte-1ozzqkm"></svg></button> <button class="pcr-ed-strip-btn svelte-1ozzqkm" title="Redo (Ctrl+Y)"><svg viewBox="0 0 24 24" class="svelte-1ozzqkm"></svg></button> <button class="pcr-ed-strip-btn svelte-1ozzqkm" title="Clear all edits"><svg viewBox="0 0 24 24" class="svelte-1ozzqkm"></svg></button> <div class="pcr-ed-strip-sep svelte-1ozzqkm"></div> <button title="Foreground color — click to pick" aria-label="Color picker"></button> <button class="pcr-ed-strip-bgcolor svelte-1ozzqkm" title="Background color (fills holes when moving on Background) — click to set from foreground" aria-label="Background color"></button> <!></div> <div class="pcr-ed-left svelte-1ozzqkm"><div><div class="pcr-ed-stage svelte-1ozzqkm"><img alt="" draggable="false" class="svelte-1ozzqkm"/> <canvas class="svelte-1ozzqkm"></canvas> <canvas class="svelte-1ozzqkm"></canvas> <!> <!> <!> <!> <!> <!> <!> <!> <!></div> <!> <!> <!> <!> <!></div></div> <div class="pcr-ed-right svelte-1ozzqkm"><div class="pcr-ed-panel svelte-1ozzqkm"><div class="pcr-ed-panel-titlerow svelte-1ozzqkm"><span class="pcr-ed-panel-title svelte-1ozzqkm">Navigator</span> <span class="pcr-ed-nav-pct svelte-1ozzqkm"> </span></div> <div class="pcr-ed-nav-stage svelte-1ozzqkm"><img alt="" draggable="false" class="svelte-1ozzqkm"/> <!></div> <div class="pcr-ed-nav-zoomrow svelte-1ozzqkm"><button class="pcr-ed-nav-zbtn svelte-1ozzqkm" aria-label="Zoom out">−</button> <input class="pcr-ed-nav-slider svelte-1ozzqkm" type="range" step="0.01"/> <button class="pcr-ed-nav-zbtn svelte-1ozzqkm" aria-label="Zoom in">+</button></div></div> <!> <div class="pcr-ed-panel svelte-1ozzqkm"><div class="pcr-ed-panel-titlerow svelte-1ozzqkm"><span class="pcr-ed-lh-tabs svelte-1ozzqkm"><button>Layers</button> <button>History</button></span> <!></div> <!></div> <!> <!></div></div></div> <!> <!> <!> <!> <!> <div class="pcr-modal-footer"><div class="pcr-ed-footer-save svelte-1ozzqkm"><span class="pcr-ed-label svelte-1ozzqkm">Save to</span> <!></div> <!> <button class="pcr-modal-btn pcr-modal-btn-secondary svelte-1ozzqkm">Cancel</button> <button class="pcr-modal-btn pcr-modal-btn-secondary svelte-1ozzqkm"> </button> <button class="pcr-modal-btn pcr-modal-btn-primary svelte-1ozzqkm"> </button></div></div></div>`);
function EditModal($$anchor, $$props) {
  push($$props, true);
  let srcUrlProp = prop($$props, "sourceUrl", 3, ""), widthProp = prop($$props, "width", 3, 0), heightProp = prop($$props, "height", 3, 0), filename = prop($$props, "filename", 3, ""), caps = prop($$props, "caps", 3, null), fetchApi = prop($$props, "fetchApi", 3, null);
  prop($$props, "apiURL", 3, (p) => p);
  let onSave = prop(
    $$props,
    "onSave",
    3,
    null
    // (blob, prefix) => entry | null
  ), onSaved = prop(
    $$props,
    "onSaved",
    3,
    null
    // (entry) => void — viewer jumps to the result
  ), onOpenInpaint = prop(
    $$props,
    "onOpenInpaint",
    3,
    null
    // ({compositeBlob, maskCanvas}) => void — opens the full Inpaint modal
  ), onOpenUpscale = prop(
    $$props,
    "onOpenUpscale",
    3,
    null
    // ({cropBlob, rect}) => void — opens the Upscale modal on the region crop
  ), onOpenRepose = prop(
    $$props,
    "onOpenRepose",
    3,
    null
    // ({compositeBlob}) => void — opens the Re-pose modal on the whole composite
  ), figureRegions = prop($$props, "figureRegions", 19, () => []), editDocHash = prop(
    $$props,
    "editDocHash",
    3,
    ""
    // content hash of the image being edited — restores its saved layer stack ("don't-flatten" persistence)
  ), suspended = prop(
    $$props,
    "suspended",
    3,
    false
    // an elevated modal (Inpaint/Upscale handoff) is open above — release the keyboard
  );
  let inpaintMaskUsed = null;
  let upscaleRegionUsed = null;
  let sourceUrl = state("");
  let width = state(0);
  let height = state(0);
  let savePrefix = state("");
  let saving = state(false);
  let errorMsg = state("");
  let savingEdits = state(
    false
    // "Save edits" → opened image's sidecar, in flight
  );
  let editsSaved = state(
    false
    // "✓ Edits saved" chip; cleared by the next edit
  );
  let restoring = state(
    false
    // loading a saved layer stack on open
  );
  let handoffBusy = state(
    null
    // "inpaint" | "upscale" | "repose" while the handoff modal prepares (uploads/graph build)
  );
  async function openReposeHandoff() {
    if (!onOpenRepose()) return;
    set(errorMsg, "");
    const compositeBlob = await flattenBlob();
    set(handoffBusy, "repose");
    try {
      await onOpenRepose()({ compositeBlob });
    } catch (e) {
      set(errorMsg, `Couldn't open Re-pose: ${(e == null ? void 0 : e.message) || e}`);
    } finally {
      set(handoffBusy, null);
    }
  }
  let viewportEl;
  let imgEl;
  let paintCanvas;
  let zoom = state(1);
  let panX = state(0);
  let panY = state(0);
  const REMEMBERED_TOOLS = /* @__PURE__ */ new Set([
    "move",
    "brush",
    "select",
    "lasso",
    "smooth",
    "spot",
    "heal",
    "stamp",
    "eyedrop",
    "bucket",
    "eraser"
  ]);
  const savedTool = (() => {
    try {
      return localStorage.getItem("pcrEditTool");
    } catch {
      return null;
    }
  })();
  let tool = state(proxy(REMEMBERED_TOOLS.has(savedTool) ? savedTool : "brush"));
  user_effect(() => {
    if (REMEMBERED_TOOLS.has(get(tool))) {
      try {
        localStorage.setItem(
          "pcrEditTool",
          /* storage unavailable — session-only memory */
          get(tool)
        );
      } catch {
      }
    }
  });
  let maximized = state(proxy((() => {
    try {
      return localStorage.getItem("pcrEditMaximized") === "1";
    } catch {
      return false;
    }
  })()));
  function toggleMaximize() {
    set(maximized, !get(maximized));
    try {
      localStorage.setItem("pcrEditMaximized", get(
        maximized
        /* storage unavailable — session-only memory */
      ) ? "1" : "0");
    } catch {
    }
  }
  let brushSize = state(48);
  let flow = state(
    0.12
    // per-dab deposit rate
  );
  let opacity = state(
    1
    // per-stroke coverage ceiling (PS model)
  );
  let hardness = state(0.35);
  let airbrush = state(
    true
    // timed dabs while the button is held
  );
  let featherPx = state(
    0
    // Select: patch-commit edge feather
  );
  let sampleSize = state(
    1
    // Pick: 1 | 3 | 5 px average
  );
  let fillTolerance = state(
    32
    // Paint bucket: color-match threshold
  );
  let fillContiguous = state(
    true
    // Paint bucket: flood from click vs all matching pixels
  );
  let hue = state(
    0
    // HSV foreground color
  );
  let sat = state(0);
  let val = state(1);
  let bgRgb = state(proxy(
    [0, 0, 0]
    // secondary (background) color for explicit fills (Alt/Ctrl+Backspace). The Background is a normal transparent layer now — moving/erasing it reveals the checker, no auto-fill. Default black.
  ));
  let cursorPos = state(
    null
    // viewport-relative brush outline
  );
  let layers = state(proxy([]));
  let activeIndex = state(0);
  let layerCanvasEls = state(proxy(
    []
    // per-inactive-layer <canvas> refs (by index) — ABOVE active only
  ));
  let belowCanvasEl;
  let nextLayerNum = 0;
  let selectedIds = state(proxy(
    []
    // multi-selected layer ids (for merge); always includes the active layer
  ));
  let lhTab = state(
    "layers"
    // Layers/History share one tabbed panel (PS-style)
  );
  let layerMenu = state(
    null
    // { x, y } right-click context menu
  );
  let renamingId = state(
    null
    // layer id being renamed (dblclick)
  );
  let renameText = state("");
  let canvasMenu = state(
    null
    // { x, y } right-click menu on the canvas (selection commands)
  );
  let rightDownAt = null;
  let subjectBusy = state(
    false
    // Select Subject round-trip in flight
  );
  let selSetupMsg = state(
    ""
    // one-time AI-selection install/download progress
  );
  let dragId = null;
  let dragOverId = state(
    null
    // layer id currently under the drag
  );
  let imgLoadTick = state(
    0
    // bumped when the source <img> loads → redraw Background
  );
  let painting = false;
  let panning = false;
  let lastPt = null;
  let strokeResidual = 0;
  const HIST_MAX = 12;
  let history2 = state(proxy([{ label: "Open", snap: null }]));
  let histIndex = state(0);
  function commitAction(label) {
    set(
      editsSaved,
      false
      // a fresh change since the last "Save edits"
    );
    flushActive();
    const head = get(history2).slice(0, get(histIndex) + 1);
    head.push({
      label,
      layers: [...get(layers)],
      activeIndex: get(activeIndex),
      selectedIds: [...get(selectedIds)],
      url: get(sourceUrl),
      w: get(width),
      h: get(height)
    });
    while (head.length > HIST_MAX + 1) head.splice(1, 1);
    set(history2, head, true);
    set(histIndex, get(history2).length - 1);
  }
  function jumpTo(i) {
    if (i < 0 || i >= get(history2).length || i === get(histIndex) || painting || liqStroking) return;
    if (get(
      tool
      // rebuilt from the restored state
    ) === "liquify") dropLiqSession();
    const h = get(history2)[i];
    if (!h.layers) return;
    set(histIndex, i, true);
    const dimsChanged = h.url !== get(sourceUrl) || h.w !== get(width) || h.h !== get(height);
    if (dimsChanged) {
      set(sourceUrl, h.url, true);
      set(width, h.w, true);
      set(height, h.h, true);
      sourceData = null;
      strokeCov = null;
      set(cropBox, null);
      set(healSource, null);
    }
    const restore = () => {
      var _a;
      set(layers, [...h.layers], true);
      set(activeIndex, Math.min(h.activeIndex ?? 0, get(layers).length - 1), true);
      set(
        selectedIds,
        h.selectedIds ? [...h.selectedIds] : [(_a = get(layers)[get(activeIndex)]) == null ? void 0 : _a.id].filter((x) => x != null),
        true
      );
      loadActiveBitmap();
      if (dimsChanged) resetView();
    };
    if (dimsChanged) requestAnimationFrame(restore);
    else
      restore();
  }
  function undo() {
    jumpTo(get(histIndex) - 1);
  }
  function redo() {
    jumpTo(get(histIndex) + 1);
  }
  let histEl = null;
  user_effect(() => {
    get(
      histIndex
      // deps
    );
    get(history2).length;
    requestAnimationFrame(() => {
      var _a;
      (_a = histEl == null ? void 0 : histEl.querySelector(".active")) == null ? void 0 : _a.scrollIntoView({ block: "nearest" });
    });
  });
  let picking = false;
  let pickRgb = null;
  let pickPreview = state(
    null
    // { x, y, hex } viewport coords
  );
  let selRect = state(
    null
    // marquee while dragging (image coords)
  );
  let patch = state(null);
  let patchEl = state(null);
  let patchOpacity = state(
    1
    // live patch opacity, applied at commit too
  );
  let selecting = false;
  let selStart = null;
  let patchDrag = null;
  let overRotateZone = state(
    false
    // pointer is just outside a transform corner → rotate cursor
  );
  const ROTATE_CURSOR = (() => {
    const g = "<path d='M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'/><path d='M21 3v5h-5'/><path d='M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'/><path d='M8 16H3v5'/>";
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24'><g fill='none' stroke='#fff' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'>" + g + "</g><g fill='none' stroke='#1d1d1d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" + g + "</g></svg>";
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, grab`;
  })();
  const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  let lassoPts = state(
    null
    // polyline while dragging (image coords)
  );
  let smoothBlur = state(6);
  let smoothFeather = state(14);
  let lassoing = false;
  let selMaskCanvas = null;
  let selBBox = null;
  let selActive = state(
    false
    // is there a selection?
  );
  let selVersion = state(
    0
    // bump → re-derive ants
  );
  let selMove = null;
  let selDragDxy = state(
    null
    // live {dx,dy} during a move — applied as a cheap SVG transform; the mask is re-traced only on commit
  );
  let selOp = "replace";
  let clipboard = null;
  let moveFloat = null;
  let snapGuides = state(proxy(
    { v: null, h: null }
    // doc-space guide line positions during a whole-layer move (null = none)
  ));
  const rgbCss = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  function ensureSelMask() {
    if (!selMaskCanvas || selMaskCanvas.width !== get(width) || selMaskCanvas.height !== get(height)) {
      selMaskCanvas = document.createElement("canvas");
      selMaskCanvas.width = get(width);
      selMaskCanvas.height = get(height);
    }
    return selMaskCanvas;
  }
  function recomputeSelBBox() {
    if (!selMaskCanvas) {
      selBBox = null;
      set(selActive, false);
      return;
    }
    const d = selMaskCanvas.getContext("2d").getImageData(0, 0, get(width), get(height)).data;
    let minX = get(width), minY = get(height), maxX = -1, maxY = -1;
    for (let y = 0; y < get(height); y++) {
      for (let x = 0; x < get(width); x++) {
        if (d[(y * get(width) + x) * 4 + 3] > 127) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      selBBox = null;
      set(selActive, false);
    } else {
      selBBox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      set(selActive, true);
    }
  }
  function applySelectionShape(shape, op) {
    const ctx = ensureSelMask().getContext("2d");
    const s = document.createElement("canvas");
    s.width = get(width);
    s.height = get(height);
    const sc = s.getContext("2d");
    if (get(featherPx) > 0) sc.filter = `blur(${get(featherPx)}px)`;
    sc.fillStyle = "#fff";
    if (shape.type === "rect") sc.fillRect(shape.x, shape.y, shape.w, shape.h);
    else {
      sc.beginPath();
      sc.moveTo(shape.pts[0].x, shape.pts[0].y);
      for (let i = 1; i < shape.pts.length; i++) sc.lineTo(shape.pts[i].x, shape.pts[i].y);
      sc.closePath();
      sc.fill();
    }
    sc.filter = "none";
    if (op === "replace") {
      ctx.clearRect(0, 0, get(width), get(height));
      ctx.drawImage(s, 0, 0);
    } else if (op === "subtract") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(s, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    } else if (op === "intersect") {
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(s, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    } else ctx.drawImage(s, 0, 0);
    recomputeSelBBox();
    update(selVersion);
  }
  function selectAllRegion() {
    const ctx = ensureSelMask().getContext("2d");
    ctx.clearRect(0, 0, get(width), get(height));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, get(width), get(height));
    recomputeSelBBox();
    update(selVersion);
  }
  function selectInverse() {
    if (!get(selActive) || !selMaskCanvas) return;
    const cur = copyMaskCanvas();
    const ctx = ensureSelMask().getContext("2d");
    ctx.clearRect(0, 0, get(width), get(height));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, get(width), get(height));
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(cur, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    recomputeSelBBox();
    update(selVersion);
  }
  let flatBlobCache = null;
  function flatKey() {
    return `${get(histIndex)}|${get(activeIndex)}|${get(layers).map((L) => `${L.id}:${L.visible}:${L.opacity}:${L.blend || ""}:${L.ox || 0}:${L.oy || 0}`).join(",")}`;
  }
  async function flattenedBlobCached() {
    const key2 = flatKey();
    if ((flatBlobCache == null ? void 0 : flatBlobCache.key) === key2) return flatBlobCache.blob;
    const blob = await flattenBlob();
    flatBlobCache = { blob, key: key2 };
    return blob;
  }
  async function activeLayerBlob() {
    const L = activeLayer();
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    const ctx = c.getContext("2d");
    ctx.drawImage(paintCanvas, L.ox || 0, L.oy || 0);
    if (L.mask && L.mask.width === get(width) && L.mask.height === get(height)) {
      const m = document.createElement("canvas");
      m.width = get(width);
      m.height = get(height);
      m.getContext("2d").putImageData(L.mask, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(m, L.ox || 0, L.oy || 0);
      ctx.globalCompositeOperation = "source-over";
    }
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
  function activeLayerHasContent() {
    const d = paintCanvas.getContext("2d").getImageData(0, 0, get(width), get(height)).data;
    for (let p = 3; p < d.length; p += 4) if (d[p] > 8) return true;
    return false;
  }
  async function fetchSelectionMask(route, fields, sourceBlob) {
    var _a;
    const fd = new FormData();
    fd.append("image", sourceBlob || await flattenedBlobCached(), "composite.png");
    for (const [k, v] of Object.entries(fields || {})) fd.append(k, String(v));
    const resp = await fetch(route, { method: "POST", body: fd });
    if (!resp.ok) {
      const msg = resp.status === 404 ? "the server needs a restart to enable AI selection (new endpoint)" : ((_a = await resp.json().catch(() => null)) == null ? void 0 : _a.error) || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    const bmp = await createImageBitmap(await resp.blob());
    const mc = document.createElement("canvas");
    mc.width = get(width);
    mc.height = get(height);
    const mctx = mc.getContext("2d");
    mctx.drawImage(bmp, 0, 0, get(width), get(height));
    const md = mctx.getImageData(0, 0, get(width), get(height));
    for (let i = 0; i < md.data.length; i += 4) {
      md.data[i + 3] = md.data[i];
      md.data[i] = 255;
      md.data[i + 1] = 255;
      md.data[i + 2] = 255;
    }
    mctx.putImageData(md, 0, 0);
    return mc;
  }
  function composeMaskIntoSelection(srcCanvas, op) {
    const ctx = ensureSelMask().getContext("2d");
    if (op === "replace") {
      ctx.clearRect(0, 0, get(width), get(height));
      ctx.drawImage(srcCanvas, 0, 0);
    } else if (op === "subtract") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(srcCanvas, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    } else if (op === "intersect") {
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(srcCanvas, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    } else ctx.drawImage(srcCanvas, 0, 0);
    recomputeSelBBox();
    update(selVersion);
  }
  async function ensureSelectionReady(which) {
    let st = null;
    try {
      const r = await fetch(`/promptchain/subject/status?which=${which}`);
      if (r.ok) st = await r.json();
      else if (r.status === 404) return true;
    } catch {
      return true;
    }
    if (!st || st.ready) return true;
    set(selSetupMsg, "Setting up AI selection…");
    try {
      const resp = await fetch("/promptchain/subject/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ which })
      });
      if (!resp.ok || !resp.body) throw new Error(await resp.text().catch(() => `HTTP ${resp.status}`));
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (; ; ) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
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
          if (evt.error) throw new Error(evt.error);
          else if (evt.stage === "pip") set(selSetupMsg, `Installing ${evt.repo}…`);
          else if (evt.stage === "download") set(selSetupMsg, `Downloading ${evt.file}… (one-time)`);
          else if (evt.line) set(selSetupMsg, evt.line, true);
        }
      }
      set(selSetupMsg, "");
      return true;
    } catch (e) {
      set(selSetupMsg, "");
      set(errorMsg, `AI selection setup failed: ${(e == null ? void 0 : e.message) || e}`);
      return false;
    }
  }
  async function selectSubject() {
    if (get(subjectBusy)) return;
    set(subjectBusy, true);
    set(errorMsg, "");
    try {
      if (!await ensureSelectionReady("subject")) return;
      flushActive();
      const L = activeLayer();
      const onLayer = L && !L.isBackground && activeLayerHasContent();
      const mask = await fetchSelectionMask("/promptchain/select-subject", null, onLayer ? await activeLayerBlob() : void 0);
      composeMaskIntoSelection(mask, "replace");
      if (!get(selActive)) set(
        errorMsg,
        onLayer ? "No subject found on this layer." : "No subject found in the image.",
        true
      );
    } catch (e) {
      set(errorMsg, `Select Subject failed: ${(e == null ? void 0 : e.message) || e}`);
    } finally {
      set(subjectBusy, false);
    }
  }
  let figureSelBusy = state(false);
  async function selectFigureMask(region) {
    if (get(figureSelBusy)) return;
    set(figureSelBusy, true);
    set(errorMsg, "");
    try {
      const resp = await fetch(region.maskUrl);
      if (!resp.ok) throw new Error("its pose mask file is missing — open the source workflow once to re-render the maps");
      const bmp = await createImageBitmap(await resp.blob());
      const mc = document.createElement("canvas");
      mc.width = get(width);
      mc.height = get(height);
      const mctx = mc.getContext("2d");
      mctx.drawImage(bmp, 0, 0, get(width), get(height));
      const md = mctx.getImageData(0, 0, get(width), get(height));
      for (let i = 0; i < md.data.length; i += 4) {
        md.data[i + 3] = md.data[i] > 64 ? 255 : 0;
        md.data[i] = 255;
        md.data[i + 1] = 255;
        md.data[i + 2] = 255;
      }
      mctx.putImageData(md, 0, 0);
      composeMaskIntoSelection(mc, "replace");
      if (!get(selActive)) set(errorMsg, `${region.name}: the pose mask is empty.`);
    } catch (e) {
      set(errorMsg, `Select ${region.name} failed: ${(e == null ? void 0 : e.message) || e}`);
    } finally {
      set(figureSelBusy, false);
    }
  }
  let objselBusy = state(false);
  async function selectObjectAt(pt, op) {
    if (get(objselBusy)) return;
    set(objselBusy, true);
    set(errorMsg, "");
    try {
      if (!await ensureSelectionReady("object")) return;
      flushActive();
      const mask = await fetchSelectionMask("/promptchain/select-object", { x: Math.round(pt.x), y: Math.round(pt.y) });
      composeMaskIntoSelection(mask, op);
    } catch (e) {
      set(errorMsg, `Object Select failed: ${(e == null ? void 0 : e.message) || e}`);
    } finally {
      set(objselBusy, false);
    }
  }
  function pointInSelection(pt) {
    if (!get(selActive) || !selMaskCanvas) return false;
    const x = Math.floor(pt.x), y = Math.floor(pt.y);
    if (x < 0 || y < 0 || x >= get(width) || y >= get(height)) return false;
    return selMaskCanvas.getContext("2d").getImageData(x, y, 1, 1).data[3] > 127;
  }
  function captureSelection() {
    if (!get(selActive) || !selBBox) return null;
    const bb = selBBox;
    const c = document.createElement("canvas");
    c.width = bb.w;
    c.height = bb.h;
    const cx = c.getContext("2d");
    cx.drawImage(paintCanvas, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
    const mask = document.createElement("canvas");
    mask.width = bb.w;
    mask.height = bb.h;
    const mctx = mask.getContext("2d");
    mctx.drawImage(selMaskCanvas, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
    if (get(featherPx) === 0) {
      const m = mctx.getImageData(0, 0, bb.w, bb.h);
      const md = m.data;
      for (let p = 3; p < md.length; p += 4) md[p] = md[p] >= 128 ? 255 : 0;
      mctx.putImageData(m, 0, 0);
    }
    cx.globalCompositeOperation = "destination-in";
    cx.drawImage(mask, 0, 0);
    cx.globalCompositeOperation = "source-over";
    if (get(featherPx) === 0) {
      const im = cx.getImageData(0, 0, bb.w, bb.h), d = im.data;
      for (let p = 3; p < d.length; p += 4) d[p] = d[p] >= 128 ? 255 : 0;
      cx.putImageData(im, 0, 0);
    }
    return { canvas: c, x: bb.x, y: bb.y, mask };
  }
  function eraseSelectionFromActive(cap) {
    var _a;
    flushActive();
    const t = document.createElement("canvas");
    t.width = get(width);
    t.height = get(height);
    const tctx = t.getContext("2d");
    const bmp = (_a = get(layers)[get(activeIndex)]) == null ? void 0 : _a.bitmap;
    if (bmp) tctx.putImageData(bmp, 0, 0);
    tctx.globalCompositeOperation = "destination-out";
    tctx.drawImage(cap.mask, cap.x, cap.y);
    tctx.globalCompositeOperation = "source-over";
    get(layers)[get(activeIndex)] = {
      ...get(layers)[get(activeIndex)],
      bitmap: tctx.getImageData(0, 0, get(width), get(height))
    };
    loadActiveBitmap();
  }
  function deleteSelection() {
    if (blockHiddenEdit("clear")) return;
    const cap = captureSelection();
    if (!cap) return;
    eraseSelectionFromActive(cap);
    commitAction("Delete");
  }
  function newLayerFromCanvas(srcCanvas, x, y, label, sourceRect = null) {
    flushActive();
    const lc = document.createElement("canvas");
    lc.width = get(width);
    lc.height = get(height);
    lc.getContext("2d").drawImage(srcCanvas, x, y);
    const id = ++nextLayerNum;
    set(
      layers,
      [
        ...get(layers).slice(0, get(activeIndex) + 1),
        {
          id,
          name: `Layer ${id}`,
          visible: true,
          opacity: 1,
          sourceRect,
          bitmap: lc.getContext("2d").getImageData(0, 0, get(width), get(height))
        },
        ...get(layers).slice(get(activeIndex) + 1)
      ],
      true
    );
    set(activeIndex, get(activeIndex) + 1);
    loadActiveBitmap();
    deselect();
    commitAction(label);
  }
  function capSourceRect(cap) {
    return {
      x: cap.x,
      y: cap.y,
      w: cap.canvas.width,
      h: cap.canvas.height,
      docW: get(width),
      docH: get(height)
    };
  }
  function layerViaCopy(cut) {
    const cap = captureSelection();
    if (!cap) return;
    if (cut) eraseSelectionFromActive(cap);
    newLayerFromCanvas(cap.canvas, cap.x, cap.y, cut ? "Layer via Cut" : "Layer via Copy", capSourceRect(cap));
  }
  function copySelection(cut) {
    const cap = captureSelection();
    if (!cap) return;
    clipboard = {
      canvas: cap.canvas,
      x: cap.x,
      y: cap.y,
      sourceRect: capSourceRect(cap)
    };
    if (cut) {
      eraseSelectionFromActive(cap);
      commitAction("Cut");
    }
  }
  function pasteClipboard() {
    if (!clipboard) return;
    newLayerFromCanvas(clipboard.canvas, clipboard.x, clipboard.y, "Paste", clipboard.sourceRect || null);
  }
  let dragActive = state(false);
  function placeImageAsLayer(img, centerX, centerY) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const fit = Math.min(1, get(width) / iw, get(height) / ih);
    const dw = Math.max(1, Math.round(iw * fit)), dh = Math.max(1, Math.round(ih * fit));
    const c = document.createElement("canvas");
    c.width = dw;
    c.height = dh;
    c.getContext("2d").drawImage(img, 0, 0, dw, dh);
    newLayerFromCanvas(c, Math.round(centerX - dw / 2), Math.round(centerY - dh / 2), "Place Image");
  }
  async function placeImageFromUrl(url, cx, cy) {
    try {
      placeImageAsLayer(await loadImageEl(url), cx, cy);
    } catch {
      set(errorMsg, "Couldn't load that image (it may block cross-site use). Save it and drag the file in instead.");
    }
  }
  function firstImgSrc(html2) {
    const m = html2 && html2.match(/<img[^>]+src=["']([^"']+)["']/i);
    return m ? m[1] : "";
  }
  async function onCanvasDrop(e) {
    var _a, _b, _c, _d;
    e.preventDefault();
    set(dragActive, false);
    const pt = toImageCoords(e);
    const file = [...((_a = e.dataTransfer) == null ? void 0 : _a.files) || []].find((f) => f.type.startsWith("image/"));
    if (file) {
      const obj = URL.createObjectURL(file);
      try {
        placeImageAsLayer(await loadImageEl(obj), pt.x, pt.y);
      } catch {
        set(errorMsg, "Couldn't read that image file.");
      } finally {
        URL.revokeObjectURL(obj);
      }
      return;
    }
    const url = (((_b = e.dataTransfer) == null ? void 0 : _b.getData("text/uri-list")) || ((_c = e.dataTransfer) == null ? void 0 : _c.getData("text/plain")) || firstImgSrc(((_d = e.dataTransfer) == null ? void 0 : _d.getData("text/html")) || "")).trim();
    if (/^(https?:|data:|blob:|\/)/i.test(url)) await placeImageFromUrl(url, pt.x, pt.y);
  }
  function onCanvasDragOver(e) {
    if (!e.dataTransfer) return;
    const droppable = [...e.dataTransfer.items || []].some((it) => it.kind === "file" || /^text\/(uri-list|html|plain)$/.test(it.type));
    if (!droppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    set(dragActive, true);
  }
  user_effect(() => {
    if (!$$props.open) return;
    const onPaste = (e) => {
      var _a;
      if (suspended() || get(adjustOpen)) return;
      const item = [...((_a = e.clipboardData) == null ? void 0 : _a.items) || []].find((it) => it.type.startsWith("image/"));
      const blob = item == null ? void 0 : item.getAsFile();
      if (!blob) return;
      e.preventDefault();
      const obj = URL.createObjectURL(blob);
      loadImageEl(obj).then((img) => placeImageAsLayer(img, get(width) / 2, get(height) / 2)).catch(() => {
        set(errorMsg, "Couldn't read the pasted image.");
      }).finally(() => URL.revokeObjectURL(obj));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  function deselect() {
    if (selMaskCanvas) selMaskCanvas.getContext("2d").clearRect(0, 0, get(width), get(height));
    selBBox = null;
    set(selActive, false);
    update(selVersion);
    set(selRect, null);
    set(lassoPts, null);
  }
  let selContour = user_derived(() => {
    get(
      selVersion
      // dependency
    );
    if (!get(selActive) || !selMaskCanvas) return "";
    const d = selMaskCanvas.getContext("2d").getImageData(0, 0, get(width), get(height)).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < get(width) && y < get(height) && d[(y * get(width) + x) * 4 + 3] > 127;
    let p = "";
    for (let y = 0; y <= get(height); y++) {
      let x = 0;
      while (x < get(width)) {
        if (on(x, y - 1) !== on(x, y)) {
          let x2 = x;
          while (x2 < get(width) && on(x2, y - 1) !== on(x2, y)) x2++;
          p += `M${x} ${y}H${x2}`;
          x = x2;
        } else x++;
      }
    }
    for (let x = 0; x <= get(width); x++) {
      let y = 0;
      while (y < get(height)) {
        if (on(x - 1, y) !== on(x, y)) {
          let y2 = y;
          while (y2 < get(height) && on(x - 1, y2) !== on(x, y2)) y2++;
          p += `M${x} ${y}V${y2}`;
          y = y2;
        } else y++;
      }
    }
    return p;
  });
  let mods = state(proxy({ shift: false, alt: false, ctrl: false }));
  let isSelTool = user_derived(() => get(tool) === "select" || get(tool) === "lasso" || get(tool) === "objsel");
  let hiddenEditBlocked = user_derived(() => {
    var _a;
    return ((_a = activeLayer()) == null ? void 0 : _a.visible) === false && !get(mods).alt && (get(tool) === "brush" || get(tool) === "eraser" || get(tool) === "bucket" || get(tool) === "smooth" || get(tool) === "spot" || get(tool) === "heal" || get(tool) === "stamp" || get(tool) === "liquify" || get(tool) === "move");
  });
  let transforming = user_derived(() => {
    var _a;
    return !!((_a = get(patch)) == null ? void 0 : _a.transform);
  });
  let selBadge = user_derived(() => !get(isSelTool) ? "" : get(mods).shift && get(mods).alt ? "∩" : get(mods).shift ? "+" : get(mods).alt ? "−" : "");
  user_effect(() => {
    if (!$$props.open) return;
    const upd = (e) => {
      set(
        mods,
        {
          shift: e.shiftKey,
          alt: e.altKey,
          ctrl: e.ctrlKey || e.metaKey
        },
        true
      );
    };
    const clear = () => {
      set(mods, { shift: false, alt: false, ctrl: false }, true);
    };
    window.addEventListener("keydown", upd, true);
    window.addEventListener("keyup", upd, true);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", upd, true);
      window.removeEventListener("keyup", upd, true);
      window.removeEventListener("blur", clear);
    };
  });
  function copyMaskCanvas() {
    if (!selMaskCanvas) return null;
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    c.getContext("2d").drawImage(selMaskCanvas, 0, 0);
    return c;
  }
  function translateSelMask(orig, origBBox, dx, dy) {
    const ctx = ensureSelMask().getContext("2d");
    ctx.clearRect(0, 0, get(width), get(height));
    if (orig) ctx.drawImage(orig, dx, dy);
    selBBox = origBBox ? {
      x: origBBox.x + dx,
      y: origBBox.y + dy,
      w: origBBox.w,
      h: origBBox.h
    } : null;
    set(selActive, !!origBBox);
    update(selVersion);
  }
  const contentBBoxCache = /* @__PURE__ */ new WeakMap();
  function layerContentBBox(L) {
    if (L.isBackground) return { x: 0, y: 0, w: get(width), h: get(height) };
    if (!L.bitmap) return null;
    if (contentBBoxCache.has(L)) return contentBBoxCache.get(L);
    const d = L.bitmap.data, bw = L.bitmap.width, bh = L.bitmap.height;
    let minX = bw, minY = bh, maxX = -1, maxY = -1;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (d[(y * bw + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const b = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    contentBBoxCache.set(L, b);
    return b;
  }
  function buildSnapTargets(L) {
    const mb = layerContentBBox(L);
    if (!mb) return null;
    const xs = [0, get(width) / 2, get(width)], ys = [0, get(height) / 2, get(height)];
    for (const O of get(layers)) {
      if (O === L || !O.visible) continue;
      const ob = layerContentBBox(O);
      if (!ob) continue;
      const oox = O.ox || 0, ooy = O.oy || 0;
      xs.push(ob.x + oox, ob.x + ob.w + oox, ob.x + ob.w / 2 + oox);
      ys.push(ob.y + ooy, ob.y + ob.h + ooy, ob.y + ob.h / 2 + ooy);
    }
    return {
      mxs: [mb.x, mb.x + mb.w, mb.x + mb.w / 2],
      mys: [mb.y, mb.y + mb.h, mb.y + mb.h / 2],
      xs,
      ys
    };
  }
  function startMove(e) {
    flushActive();
    const L = get(layers)[get(activeIndex)];
    if (!get(selActive)) {
      moveFloat = {
        wholeLayer: true,
        startOx: L.ox || 0,
        startOy: L.oy || 0,
        ox: e.clientX,
        oy: e.clientY,
        dx: 0,
        dy: 0,
        snap: buildSnapTargets(get(layers)[get(activeIndex)])
      };
      return true;
    }
    const cap = captureSelection();
    if (!cap) return false;
    const base = document.createElement("canvas");
    base.width = get(width);
    base.height = get(height);
    const bctx = base.getContext("2d");
    bctx.drawImage(paintCanvas, 0, 0);
    if (cap.mask) {
      bctx.globalCompositeOperation = "destination-out";
      bctx.drawImage(cap.mask, cap.x, cap.y);
      bctx.globalCompositeOperation = "source-over";
    } else {
      bctx.clearRect(0, 0, get(width), get(height));
    }
    moveFloat = {
      cap,
      base,
      ox: e.clientX,
      oy: e.clientY,
      dx: 0,
      dy: 0,
      selOrig: get(selActive) ? copyMaskCanvas() : null,
      selOrigBBox: selBBox
    };
    return true;
  }
  function updateMove(e) {
    const dx = Math.round((e.clientX - moveFloat.ox) / get(zoom));
    const dy = Math.round((e.clientY - moveFloat.oy) / get(zoom));
    moveFloat.dx = dx;
    moveFloat.dy = dy;
    if (moveFloat.wholeLayer) {
      let nx = moveFloat.startOx + dx, ny = moveFloat.startOy + dy;
      if (e.altKey || !moveFloat.snap) {
        set(snapGuides, { v: null, h: null }, true);
      } else {
        const s = moveFloat.snap;
        const t = 7 / get(zoom);
        let bx = null, bdx = t, by = null, bdy = t;
        for (const m of s.mxs) for (const gx of s.xs) {
          const d = Math.abs(nx - (gx - m));
          if (d < bdx) {
            bdx = d;
            bx = { at: gx - m, line: gx };
          }
        }
        for (const m of s.mys) for (const gy of s.ys) {
          const d = Math.abs(ny - (gy - m));
          if (d < bdy) {
            bdy = d;
            by = { at: gy - m, line: gy };
          }
        }
        if (Math.abs(nx) < bdx) bx = { at: 0, line: null };
        if (Math.abs(ny) < bdy) by = { at: 0, line: null };
        if (bx) nx = bx.at;
        if (by) ny = by.at;
        set(snapGuides, { v: (bx == null ? void 0 : bx.line) ?? null, h: (by == null ? void 0 : by.line) ?? null }, true);
      }
      get(layers)[get(activeIndex)] = { ...get(layers)[get(activeIndex)], ox: nx, oy: ny };
      loadActiveBitmap();
      return;
    }
    const ctx = paintCanvas.getContext("2d");
    ctx.clearRect(0, 0, get(width), get(height));
    ctx.drawImage(moveFloat.base, 0, 0);
    ctx.drawImage(moveFloat.cap.canvas, moveFloat.cap.x + dx, moveFloat.cap.y + dy);
    if (moveFloat.selOrig) set(
      selDragDxy,
      { dx, dy },
      // ants follow (cheap transform)
      true
    );
  }
  function endMove() {
    if (!moveFloat) return;
    set(snapGuides, { v: null, h: null }, true);
    if (moveFloat.wholeLayer) {
      const moved2 = moveFloat.dx !== 0 || moveFloat.dy !== 0;
      moveFloat = null;
      if (moved2) commitAction("Move");
      return;
    }
    if (moveFloat.selOrig) {
      translateSelMask(moveFloat.selOrig, moveFloat.selOrigBBox, moveFloat.dx, moveFloat.dy);
      set(selDragDxy, null);
    }
    const moved = moveFloat.dx !== 0 || moveFloat.dy !== 0;
    moveFloat = null;
    if (moved) commitAction("Move");
  }
  function nudgeActiveLayer(dx, dy) {
    if (blockHiddenEdit("move")) return;
    const L = get(layers)[get(activeIndex)];
    if (!L) return;
    flushActive();
    get(layers)[get(activeIndex)] = { ...L, ox: (L.ox || 0) + dx, oy: (L.oy || 0) + dy };
    loadActiveBitmap();
    commitAction("Move");
  }
  function floodFill(pt) {
    const x0 = Math.floor(pt.x), y0 = Math.floor(pt.y);
    if (x0 < 0 || y0 < 0 || x0 >= get(width) || y0 >= get(height)) return;
    flushActive();
    const ctx = paintCanvas.getContext("2d");
    const img = ctx.getImageData(0, 0, get(width), get(height));
    const d = img.data;
    const si = (y0 * get(width) + x0) * 4;
    const sr = d[si], sg = d[si + 1], sb = d[si + 2], sa = d[si + 3];
    const tol2 = get(fillTolerance) * get(fillTolerance) * 4;
    const match = (i) => {
      const dr = d[i] - sr, dg = d[i + 1] - sg, db = d[i + 2] - sb, da = d[i + 3] - sa;
      return dr * dr + dg * dg + db * db + da * da <= tol2;
    };
    const region = new Uint8Array(get(width) * get(height));
    if (get(fillContiguous)) {
      const stack = [[x0, y0]];
      while (stack.length) {
        let [x, y] = stack.pop();
        while (x >= 0 && !region[y * get(width) + x] && match((y * get(width) + x) * 4)) x--;
        x++;
        let spanUp = false, spanDown = false;
        while (x < get(width) && !region[y * get(width) + x] && match((y * get(width) + x) * 4)) {
          region[y * get(width) + x] = 1;
          if (y > 0) {
            const up = !region[(y - 1) * get(width) + x] && match(((y - 1) * get(width) + x) * 4);
            if (up && !spanUp) {
              stack.push([x, y - 1]);
              spanUp = true;
            } else if (!up) spanUp = false;
          }
          if (y < get(height) - 1) {
            const dn = !region[(y + 1) * get(width) + x] && match(((y + 1) * get(width) + x) * 4);
            if (dn && !spanDown) {
              stack.push([x, y + 1]);
              spanDown = true;
            } else if (!dn) spanDown = false;
          }
          x++;
        }
      }
    } else {
      for (let p = 0; p < region.length; p++) if (match(p * 4)) region[p] = 1;
    }
    if (get(selActive) && selMaskCanvas) {
      const sm = selMaskCanvas.getContext("2d").getImageData(0, 0, get(width), get(height)).data;
      for (let p = 0; p < region.length; p++) if (region[p] && sm[p * 4 + 3] <= 127) region[p] = 0;
    }
    let any = false;
    for (let p = 0; p < region.length; p++) if (region[p]) {
      any = true;
      break;
    }
    if (!any) return;
    const md = new ImageData(get(width), get(height));
    for (let p = 0; p < region.length; p++) if (region[p]) md.data[p * 4 + 3] = 255;
    const m = document.createElement("canvas");
    m.width = get(width);
    m.height = get(height);
    m.getContext("2d").putImageData(md, 0, 0);
    const f = document.createElement("canvas");
    f.width = get(width);
    f.height = get(height);
    const fctx = f.getContext("2d");
    fctx.fillStyle = rgbCss(get(rgb));
    fctx.fillRect(0, 0, get(width), get(height));
    fctx.globalCompositeOperation = "destination-in";
    fctx.filter = "blur(0.6px)";
    fctx.drawImage(m, 0, 0);
    fctx.filter = "none";
    fctx.globalCompositeOperation = "source-over";
    ctx.drawImage(f, 0, 0);
    commitAction("Fill");
  }
  function fillWith(color) {
    if (blockHiddenEdit("fill")) return;
    flushActive();
    const ctx = paintCanvas.getContext("2d");
    if (get(selActive) && selMaskCanvas) {
      const tmp = document.createElement("canvas");
      tmp.width = get(width);
      tmp.height = get(height);
      const tctx = tmp.getContext("2d");
      tctx.fillStyle = rgbCss(color);
      tctx.fillRect(0, 0, get(width), get(height));
      tctx.globalCompositeOperation = "destination-in";
      tctx.drawImage(selMaskCanvas, 0, 0);
      ctx.drawImage(tmp, 0, 0);
    } else {
      ctx.fillStyle = rgbCss(color);
      ctx.fillRect(0, 0, get(width), get(height));
    }
    commitAction("Fill");
  }
  function flattenBlob() {
    flushActive();
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    drawFlattened(c.getContext("2d"), 0, 0, get(width), get(height), 0, 0, get(width), get(height));
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
  function activeContentMaskCanvas() {
    const d = paintCanvas.getContext("2d").getImageData(0, 0, get(width), get(height)).data;
    let minX = get(width), minY = get(height), maxX = -1, maxY = -1;
    for (let y = 0; y < get(height); y++) {
      for (let x = 0; x < get(width); x++) {
        if (d[(y * get(width) + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
    return c;
  }
  function loadImageEl(url) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
  }
  function activeAlphaMaskCanvas() {
    const L = activeLayer();
    if ((L == null ? void 0 : L.isBackground) && !L.bitmap) return null;
    const src = activeMaskedCanvas();
    const d = src.getContext("2d").getImageData(0, 0, get(width), get(height)).data;
    let on = 0;
    for (let p = 3; p < d.length; p += 4) if (d[p] > 8) on++;
    if (!on || on >= get(
      width
      // empty or full-frame
    ) * get(height) * 0.995) return null;
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    const ctx = c.getContext("2d");
    const md = ctx.createImageData(get(width), get(height));
    for (let p = 0; p < d.length; p += 4) {
      const a = d[p + 3] >= 128 ? 255 : 0;
      md.data[p] = 255;
      md.data[p + 1] = 255;
      md.data[p + 2] = 255;
      md.data[p + 3] = a;
    }
    ctx.putImageData(md, 0, 0);
    return c;
  }
  async function openInpaintHandoff() {
    if (!onOpenInpaint()) return;
    const maskCanvas = get(selActive) ? selMaskCanvas : activeAlphaMaskCanvas();
    set(errorMsg, "");
    inpaintMaskUsed = maskCanvas;
    let sceneRect = null, condOffset = null;
    if (!get(selActive) && maskCanvas) {
      const bb = maskBBox(maskCanvas);
      const L = get(layers)[get(activeIndex)];
      const prov = L == null ? void 0 : L.sourceRect;
      let dx = 0, dy = 0;
      if (bb && prov && prov.docW === get(width) && prov.docH === get(height)) {
        dx = Math.round(prov.x + prov.w / 2 - (bb.x + bb.w / 2));
        dy = Math.round(prov.y + prov.h / 2 - (bb.y + bb.h / 2));
      } else if (L && (L.ox || L.oy)) {
        dx = -(L.ox || 0);
        dy = -(L.oy || 0);
      }
      if (bb && (dx || dy)) {
        condOffset = { x: dx, y: dy };
        sceneRect = {
          x: Math.max(0, Math.min(get(width) - bb.w, bb.x + dx)),
          y: Math.max(0, Math.min(get(height) - bb.h, bb.y + dy)),
          w: bb.w,
          h: bb.h
        };
      }
    }
    const compositeBlob = await flattenBlob();
    set(handoffBusy, "inpaint");
    try {
      await onOpenInpaint()({ compositeBlob, maskCanvas, sceneRect, condOffset });
    } catch (e) {
      set(errorMsg, `Couldn't open inpaint: ${(e == null ? void 0 : e.message) || e}`);
    } finally {
      set(handoffBusy, null);
    }
  }
  function matchLayerColorsToBelow(i, baseImg = null) {
    const L = get(layers)[i];
    if (!(L == null ? void 0 : L.bitmap) || i <= 0) return false;
    const under = document.createElement("canvas");
    under.width = get(width);
    under.height = get(height);
    const uctx = under.getContext("2d");
    for (let j = 0; j < i; j++) {
      const Lj = get(layers)[j];
      if (!Lj.visible) continue;
      uctx.globalAlpha = Lj.opacity ?? 1;
      if (Lj.isBackground && !Lj.bitmap && baseImg) {
        uctx.drawImage(baseImg, 0, 0, get(width), get(height));
      } else {
        drawLayerContent(uctx, Lj, 0, 0, get(width), get(height), 0, 0, get(width), get(height));
      }
    }
    uctx.globalAlpha = 1;
    const u = uctx.getImageData(0, 0, get(width), get(height)).data;
    const d = L.bitmap.data;
    const ox = L.ox || 0, oy = L.oy || 0;
    const sums = [0, 0, 0], sumsU = [0, 0, 0], sq = [0, 0, 0], sqU = [0, 0, 0];
    let n = 0;
    for (let y = 0; y < get(height); y++) {
      const uy = y + oy;
      if (uy < 0 || uy >= get(height)) continue;
      for (let x = 0; x < get(width); x++) {
        const p = (y * get(width) + x) * 4;
        const a = d[p + 3];
        if (a < 8 || a > 248) continue;
        const ux = x + ox;
        if (ux < 0 || ux >= get(width)) continue;
        const q = (uy * get(width) + ux) * 4;
        if (u[q + 3] < 250) continue;
        const lumL = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        const lumU = 0.299 * u[q] + 0.587 * u[q + 1] + 0.114 * u[q + 2];
        if (Math.abs(lumL - lumU) > 40) continue;
        for (let ch = 0; ch < 3; ch++) {
          const vl = d[p + ch], vu = u[q + ch];
          sums[ch] += vl;
          sq[ch] += vl * vl;
          sumsU[ch] += vu;
          sqU[ch] += vu * vu;
        }
        n++;
      }
    }
    if (n < 200) {
      try {
        fetch("/promptchain/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            where: "upscale-colormatch",
            message: `no usable band (n=${n}) — skipped`,
            stack: ""
          })
        }).catch(() => {
        });
      } catch {
      }
      return false;
    }
    const bandMean = [0, 1, 2].map((ch) => sums[ch] / n);
    const bandTol = [0, 1, 2].map((ch) => {
      const m = bandMean[ch];
      const s = Math.sqrt(Math.max(0, sq[ch] / n - m * m));
      return Math.max(3 * s, 16);
    });
    const iSums = [0, 0, 0], iSumsU = [0, 0, 0], iSq = [0, 0, 0], iSqU = [0, 0, 0];
    let nI = 0;
    for (let y = 0; y < get(height); y++) {
      const uy = y + oy;
      if (uy < 0 || uy >= get(height)) continue;
      for (let x = 0; x < get(width); x++) {
        const p = (y * get(width) + x) * 4;
        if (d[p + 3] < 250) continue;
        const ux = x + ox;
        if (ux < 0 || ux >= get(width)) continue;
        const q = (uy * get(width) + ux) * 4;
        if (u[q + 3] < 250) continue;
        let dist2 = 0;
        for (let ch = 0; ch < 3; ch++) {
          const z = (d[p + ch] - bandMean[ch]) / bandTol[ch];
          dist2 += z * z;
        }
        if (dist2 > 4) continue;
        const lumL = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        const lumU = 0.299 * u[q] + 0.587 * u[q + 1] + 0.114 * u[q + 2];
        if (Math.abs(lumL - lumU) > 40) continue;
        for (let ch = 0; ch < 3; ch++) {
          const vl = d[p + ch], vu = u[q + ch];
          iSums[ch] += vl;
          iSq[ch] += vl * vl;
          iSumsU[ch] += vu;
          iSqU[ch] += vu * vu;
        }
        nI++;
      }
    }
    const useInterior = nI >= 500;
    const fs = useInterior ? iSums : sums, fsU = useInterior ? iSumsU : sumsU;
    const fq = useInterior ? iSq : sq, fqU = useInterior ? iSqU : sqU;
    const fn = useInterior ? nI : n;
    const fit = [0, 1, 2].map((ch) => {
      const mL = fs[ch] / fn, mU = fsU[ch] / fn;
      const sL = Math.sqrt(Math.max(0, fq[ch] / fn - mL * mL));
      const sU = Math.sqrt(Math.max(0, fqU[ch] / fn - mU * mU));
      let a = sL > 2 && sU > 2 ? sU / sL : 1;
      a = Math.min(1.1, Math.max(0.9, a));
      const b = Math.min(32, Math.max(-32, mU - a * mL));
      return { a, b };
    });
    try {
      fetch("/promptchain/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          where: "upscale-colormatch",
          message: `${useInterior ? "interior" : "ring"} fit nRing=${n} nInterior=${nI} RGB ` + fit.map((f) => `a=${f.a.toFixed(3)} b=${f.b.toFixed(1)}`).join(" | "),
          stack: ""
        })
      }).catch(() => {
      });
    } catch {
    }
    const out = new ImageData(new Uint8ClampedArray(d), get(width), get(height));
    const o = out.data;
    for (let p = 0; p < o.length; p += 4) {
      if (o[p + 3] === 0) continue;
      let dist2 = 0;
      for (let ch = 0; ch < 3; ch++) {
        const z = (o[p + ch] - bandMean[ch]) / bandTol[ch];
        dist2 += z * z;
      }
      const w = Math.exp(-dist2 / 2);
      if (w < 0.01) continue;
      for (let ch = 0; ch < 3; ch++) {
        const corrected = fit[ch].a * o[p + ch] + fit[ch].b;
        o[p + ch] = Math.min(255, Math.max(0, o[p + ch] + w * (corrected - o[p + ch])));
      }
    }
    set(layers, get(layers).map((Lk, k) => k === i ? { ...Lk, bitmap: out } : Lk), true);
    if (i === get(activeIndex)) loadActiveBitmap();
    return true;
  }
  function insertResultLayer(c, maskCanvas, label, underCanvas = null) {
    let fm = null;
    if (maskCanvas) {
      fm = document.createElement("canvas");
      fm.width = get(width);
      fm.height = get(height);
      const fctx = fm.getContext("2d");
      fctx.filter = "blur(12px)";
      fctx.drawImage(maskCanvas, 0, 0);
      fctx.filter = "none";
    }
    const featherClip = (target) => {
      if (!fm) return;
      const tctx = target.getContext("2d");
      tctx.globalCompositeOperation = "destination-in";
      tctx.drawImage(fm, 0, 0);
      tctx.globalCompositeOperation = "source-over";
    };
    featherClip(c);
    flushActive();
    const inserted = [];
    if (underCanvas) {
      featherClip(underCanvas);
      const uid = ++nextLayerNum;
      inserted.push({
        id: uid,
        name: `UltraSharp ${uid}`,
        visible: true,
        opacity: 1,
        bitmap: underCanvas.getContext("2d").getImageData(0, 0, get(width), get(height))
      });
    }
    const id = ++nextLayerNum;
    inserted.push({
      id,
      name: `${label} ${id}`,
      visible: true,
      opacity: 1,
      bitmap: c.getContext("2d").getImageData(0, 0, get(width), get(height))
    });
    set(
      layers,
      [
        ...get(layers).slice(0, get(activeIndex) + 1),
        ...inserted,
        ...get(layers).slice(get(activeIndex) + 1)
      ],
      true
    );
    set(activeIndex, get(activeIndex) + inserted.length);
    set(selectedIds, [id], true);
    if (underCanvas) matchLayerColorsToBelow(get(activeIndex) - 1);
    matchLayerColorsToBelow(get(activeIndex));
    loadActiveBitmap();
    commitAction(label);
  }
  async function addLayerFromResult(url, finalMask = null) {
    const img = await loadImageEl(url);
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    c.getContext("2d").drawImage(img, 0, 0, get(width), get(height));
    insertResultLayer(c, finalMask || inpaintMaskUsed, "Inpaint");
  }
  function maskBBox(maskCanvas) {
    const d = maskCanvas.getContext("2d").getImageData(0, 0, get(width), get(height)).data;
    let minX = get(width), minY = get(height), maxX = -1, maxY = -1;
    for (let y = 0; y < get(height); y++) {
      for (let x = 0; x < get(width); x++) {
        if (d[(y * get(width) + x) * 4 + 3] > 127) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  async function openUpscaleHandoff() {
    if (!onOpenUpscale()) return;
    const maskCanvas = get(selActive) ? selMaskCanvas : activeContentMaskCanvas();
    const bbox = maskCanvas && maskBBox(maskCanvas);
    if (!bbox) {
      set(errorMsg, "Select a region, or paint on the active layer first.");
      return;
    }
    set(errorMsg, "");
    const pad = 32;
    const x = Math.max(0, bbox.x - pad);
    const y = Math.max(0, bbox.y - pad);
    const w = Math.min(get(width), bbox.x + bbox.w + pad) - x;
    const h = Math.min(get(height), bbox.y + bbox.h + pad) - y;
    upscaleRegionUsed = { x, y, w, h, maskCanvas };
    let sceneRect = null;
    if (!get(selActive)) {
      const L = get(layers)[get(activeIndex)];
      const prov = L == null ? void 0 : L.sourceRect;
      let dx = 0, dy = 0;
      if (prov && prov.docW === get(width) && prov.docH === get(height)) {
        dx = Math.round(prov.x + prov.w / 2 - (bbox.x + bbox.w / 2));
        dy = Math.round(prov.y + prov.h / 2 - (bbox.y + bbox.h / 2));
      } else if (L && (L.ox || L.oy)) {
        dx = -(L.ox || 0);
        dy = -(L.oy || 0);
      }
      if (dx || dy) {
        sceneRect = {
          x: Math.max(0, Math.min(get(width) - w, x + dx)),
          y: Math.max(0, Math.min(get(height) - h, y + dy)),
          w,
          h
        };
      }
    }
    flushActive();
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    drawFlattened(c.getContext("2d"), x, y, w, h, 0, 0, w, h);
    const cropBlob = await new Promise((r) => c.toBlob(r, "image/png"));
    const bg = document.createElement("canvas");
    bg.width = get(width);
    bg.height = get(height);
    drawLayerContent(bg.getContext("2d"), get(layers)[0], 0, 0, get(width), get(height), 0, 0, get(width), get(height));
    const bgBlob = await new Promise((r) => bg.toBlob(r, "image/png"));
    set(handoffBusy, "upscale");
    try {
      await onOpenUpscale()({
        cropBlob,
        bgBlob,
        rect: { x, y, w, h },
        sceneRect,
        docWidth: get(width),
        docHeight: get(height)
      });
    } catch (e) {
      set(errorMsg, `Couldn't open upscale: ${(e == null ? void 0 : e.message) || e}`);
    } finally {
      set(handoffBusy, null);
    }
  }
  async function addUpscaledLayerFromResult(url, underUrl = null) {
    const r = upscaleRegionUsed;
    if (!r) return;
    const drawIntoRegion = (img2) => {
      const c = document.createElement("canvas");
      c.width = get(width);
      c.height = get(height);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img2, r.x, r.y, r.w, r.h);
      return c;
    };
    let underImg = null;
    if (underUrl) {
      try {
        underImg = await loadImageEl(underUrl);
      } catch {
      }
    }
    const img = await loadImageEl(url);
    insertResultLayer(drawIntoRegion(img), r.maskCanvas, "Upscale", underImg ? drawIntoRegion(underImg) : null);
  }
  async function applyCanvasUpscale({ bgUrl, regionUrl }) {
    const r = upscaleRegionUsed;
    if (!r) return;
    const [bgImg, regionImg] = await Promise.all([loadImageEl(bgUrl), loadImageEl(regionUrl)]);
    const W2 = bgImg.naturalWidth, H2 = bgImg.naturalHeight;
    const fx = W2 / get(width), fy = H2 / get(height);
    flushActive();
    if (get(
      selActive
      // the selection mask is in old-document coordinates
    )) deselect();
    const ow = get(width), oh = get(height);
    const newLayers = get(layers).map((L) => {
      if (L.isBackground) return { ...L, bitmap: null, ox: 0, oy: 0 };
      const scalePlane = (data) => {
        if (!data) return void 0;
        const t = document.createElement("canvas");
        t.width = ow;
        t.height = oh;
        t.getContext("2d").putImageData(data, 0, 0);
        const sc = document.createElement("canvas");
        sc.width = W2;
        sc.height = H2;
        const sctx = sc.getContext("2d");
        sctx.imageSmoothingQuality = "high";
        sctx.drawImage(t, 0, 0, W2, H2);
        return sc;
      };
      const next = {
        ...L,
        ox: Math.round((L.ox || 0) * fx),
        oy: Math.round((L.oy || 0) * fy)
      };
      const bc = scalePlane(L.bitmap);
      if (bc) next.bitmap = bc.getContext("2d").getImageData(0, 0, W2, H2);
      const mc = scalePlane(L.mask);
      if (mc) {
        next.mask = mc.getContext("2d").getImageData(0, 0, W2, H2);
        next.maskUrl = mc.toDataURL();
      }
      return next;
    });
    const c = document.createElement("canvas");
    c.width = W2;
    c.height = H2;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(regionImg, Math.round(r.x * fx), Math.round(r.y * fy), Math.round(r.w * fx), Math.round(r.h * fy));
    const fm = document.createElement("canvas");
    fm.width = W2;
    fm.height = H2;
    const fctx = fm.getContext("2d");
    fctx.filter = `blur(${Math.round(12 * Math.max(fx, fy))}px)`;
    fctx.drawImage(r.maskCanvas, 0, 0, W2, H2);
    fctx.filter = "none";
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(fm, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    const regionBitmap = ctx.getImageData(0, 0, W2, H2);
    set(sourceUrl, bgUrl, true);
    set(width, W2, true);
    set(height, H2, true);
    sourceData = null;
    strokeCov = null;
    set(cropBox, null);
    dropLiqSession();
    set(healSource, null);
    const id = ++nextLayerNum;
    set(
      layers,
      [
        ...newLayers.slice(0, get(activeIndex) + 1),
        {
          id,
          name: `Upscale ${id}`,
          visible: true,
          opacity: 1,
          bitmap: regionBitmap
        },
        ...newLayers.slice(get(activeIndex) + 1)
      ],
      true
    );
    set(activeIndex, get(activeIndex) + 1);
    set(selectedIds, [id], true);
    matchLayerColorsToBelow(get(
      activeIndex
      // region render vs the fresh ESRGAN base
    ), bgImg);
    requestAnimationFrame(() => {
      loadActiveBitmap();
      commitAction("Upscale Canvas");
      resetView();
    });
  }
  const TOOLS = [
    {
      id: "move",
      label: "Move — drag the layer, or the selected pixels",
      icon: `<path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/>`
    },
    {
      id: "select",
      label: "Select",
      icon: `<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3.2 2.4"/>`
    },
    {
      id: "lasso",
      label: "Lasso",
      icon: `<path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1"/><path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>`
    },
    {
      id: "brush",
      label: "Brush",
      icon: `<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>`
    },
    {
      id: "eraser",
      label: "Eraser",
      icon: `<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>`
    },
    {
      id: "bucket",
      label: "Paint Bucket — flood fill with the foreground color",
      icon: `<path d="M4 9.2 L8.6 17.8 a1.4 1.4 0 0 0 1.9 0.55 L16.6 13.9 a1.4 1.4 0 0 0 0.45 -1.9 L13 5"/><ellipse cx="8.5" cy="7.1" rx="4.9" ry="1.85" transform="rotate(-27 8.5 7.1)"/><path d="M5.7 6.4 A 4.4 4.4 0 0 1 13.6 5.6"/><path d="M18.7 14.8 c1.15 1.55 1.45 2.45 1.45 3.15 a1.45 1.45 0 0 1 -2.9 0 c0 -0.7 0.3 -1.45 1.45 -3.15z"/>`
    },
    {
      id: "objsel",
      label: "Object Select — click an object to select it (AI); Shift adds, Alt subtracts",
      icon: `<rect x="3" y="4" width="18" height="16" rx="1" stroke-dasharray="3 2.2"/><path d="M12 8.5l1.2 2.4 2.6.4-1.9 1.9.4 2.6-2.3-1.2-2.3 1.2.4-2.6-1.9-1.9 2.6-.4z"/>`
    },
    {
      id: "smooth",
      label: "Smooth",
      icon: `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>`
    },
    {
      id: "spot",
      label: "Spot Heal",
      icon: `<circle cx="8.5" cy="8.5" r="5" stroke-dasharray="2.4 2.1"/><g transform="rotate(-45 14.5 14.5)"><rect x="7.5" y="11.5" width="14" height="6" rx="3"/><path d="M12 11.5v6"/><path d="M17 11.5v6"/></g>`
    },
    {
      id: "heal",
      label: "Heal (Alt-click source)",
      icon: `<g transform="rotate(-45 12 12)"><rect x="2.5" y="8" width="19" height="8" rx="4"/><path d="M8.5 8v8"/><path d="M15.5 8v8"/><path d="M10.8 10.8h.01"/><path d="M13.2 13.2h.01"/><path d="M13.2 10.8h.01"/><path d="M10.8 13.2h.01"/></g>`
    },
    {
      id: "stamp",
      label: "Clone Stamp (Alt-click source)",
      icon: `<path d="M5 22h14"/><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"/><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/>`
    },
    {
      id: "liquify",
      label: "Liquify",
      icon: `<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>`
    },
    {
      id: "adjust",
      label: "Camera Raw adjustments",
      icon: `<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/>`
    },
    {
      id: "crop",
      label: "Crop",
      icon: `<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>`
    },
    {
      id: "eyedrop",
      label: "Pick",
      icon: `<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>`
    }
  ];
  const ACTION_ICONS = {
    undo: `<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>`,
    redo: `<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/>`,
    clear: `<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>`
  };
  function makePatchView(raw, pts, f) {
    const w = raw.width, h = raw.height;
    const view = document.createElement("canvas");
    view.width = w;
    view.height = h;
    const ctx = view.getContext("2d");
    ctx.drawImage(raw, 0, 0);
    if (!pts && f < 1) return view;
    const mask = document.createElement("canvas");
    mask.width = w;
    mask.height = h;
    const mctx = mask.getContext("2d", { willReadFrequently: true });
    if (f >= 1) mctx.filter = `blur(${Math.min(f, w / 2 - 1, h / 2 - 1)}px)`;
    mctx.fillStyle = "#fff";
    if (pts) {
      mctx.beginPath();
      mctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) mctx.lineTo(pts[i].x, pts[i].y);
      mctx.closePath();
      mctx.fill();
    } else {
      mctx.fillRect(0, 0, w, h);
    }
    mctx.filter = "none";
    if (f >= 1) {
      const md = mctx.getImageData(0, 0, w, h);
      for (let i = 3; i < md.data.length; i += 4) {
        md.data[i] = Math.max(0, Math.min(255, (md.data[i] - 128) * 2));
      }
      mctx.putImageData(md, 0, 0);
    }
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    return view;
  }
  user_effect(() => {
    if (get(patch) && get(patchEl)) {
      const view = makePatchView(get(patch).raw, get(patch).pts, get(featherPx));
      get(patch).canvas = view;
      get(patchEl).width = get(patch).pw;
      get(patchEl).height = get(patch).ph;
      const ctx = get(patchEl).getContext("2d");
      ctx.clearRect(0, 0, get(patch).pw, get(patch).ph);
      ctx.drawImage(view, 0, 0);
    }
  });
  function commitPatch() {
    if (!get(patch)) return;
    const ctx = paintCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const view = makePatchView(get(patch).raw, get(patch).pts, get(featherPx));
    ctx.save();
    ctx.globalAlpha = get(patchOpacity);
    const cx = get(patch).x + get(patch).w / 2, cy = get(patch).y + get(patch).h / 2;
    ctx.translate(cx, cy);
    if (get(patch).rot) ctx.rotate(get(patch).rot);
    if (get(patch).flipH || get(patch).flipV) ctx.scale(get(patch).flipH ? -1 : 1, get(patch).flipV ? -1 : 1);
    ctx.drawImage(view, 0, 0, get(patch).pw, get(patch).ph, -get(patch).w / 2, -get(patch).h / 2, get(patch).w, get(patch).h);
    ctx.restore();
    commitAction(get(patch).transform ? "Transform" : "Patch");
    set(patch, null);
  }
  function cancelPatch() {
    var _a;
    if (((_a = get(patch)) == null ? void 0 : _a.restore) && paintCanvas) {
      const ctx = paintCanvas.getContext("2d");
      ctx.clearRect(0, 0, get(width), get(height));
      ctx.drawImage(get(patch).restore, 0, 0);
    }
    set(patch, null);
  }
  function beginTransform() {
    if (get(patch)) return true;
    if (blockHiddenEdit("transform")) return false;
    if (!paintCanvas || !get(layers)[get(activeIndex)]) return false;
    flushActive();
    const L = get(layers)[get(activeIndex)];
    const restore = document.createElement("canvas");
    restore.width = get(width);
    restore.height = get(height);
    restore.getContext("2d").drawImage(paintCanvas, 0, 0);
    const pctx = paintCanvas.getContext("2d");
    if (get(selActive) && selBBox) {
      const cap = captureSelection();
      if (!cap) {
        set(errorMsg, "Nothing to transform.");
        return false;
      }
      pctx.globalCompositeOperation = "destination-out";
      pctx.drawImage(cap.mask, cap.x, cap.y);
      pctx.globalCompositeOperation = "source-over";
      set(
        patch,
        {
          canvas: cap.canvas,
          raw: cap.canvas,
          pts: null,
          pw: cap.canvas.width,
          ph: cap.canvas.height,
          x: cap.x,
          y: cap.y,
          w: cap.canvas.width,
          h: cap.canvas.height,
          rot: 0,
          flipH: false,
          flipV: false,
          transform: true,
          restore,
          home: {
            x: cap.x,
            y: cap.y,
            w: cap.canvas.width,
            h: cap.canvas.height
          }
        },
        true
      );
      deselect();
      return true;
    }
    const bb = layerContentBBox(L);
    if (!bb || bb.w < 2 || bb.h < 2) {
      set(errorMsg, "This layer is empty — nothing to transform.");
      return false;
    }
    const ox = L.ox || 0, oy = L.oy || 0;
    const dx0 = Math.max(0, Math.floor(bb.x + ox)), dy0 = Math.max(0, Math.floor(bb.y + oy));
    const dw = Math.min(get(width), Math.ceil(bb.x + ox + bb.w)) - dx0;
    const dh = Math.min(get(height), Math.ceil(bb.y + oy + bb.h)) - dy0;
    if (dw < 2 || dh < 2) {
      set(errorMsg, "This layer's content is off-canvas — move it back to transform.");
      return false;
    }
    const c = document.createElement("canvas");
    c.width = dw;
    c.height = dh;
    c.getContext("2d").drawImage(paintCanvas, dx0, dy0, dw, dh, 0, 0, dw, dh);
    pctx.clearRect(dx0, dy0, dw, dh);
    set(
      patch,
      {
        canvas: c,
        raw: c,
        pts: null,
        pw: dw,
        ph: dh,
        x: dx0,
        y: dy0,
        w: dw,
        h: dh,
        rot: 0,
        flipH: false,
        flipV: false,
        transform: true,
        restore,
        home: { x: dx0, y: dy0, w: dw, h: dh }
      },
      true
    );
    return true;
  }
  function resetTransform() {
    var _a;
    if (!((_a = get(patch)) == null ? void 0 : _a.transform) || !get(patch).home) return;
    set(
      patch,
      {
        ...get(patch),
        ...get(patch).home,
        rot: 0,
        flipH: false,
        flipV: false
      },
      true
    );
  }
  function flipPatch(axis) {
    if (!get(patch)) return;
    set(
      patch,
      axis === "h" ? { ...get(patch), flipH: !get(patch).flipH } : { ...get(patch), flipV: !get(patch).flipV },
      true
    );
  }
  function normalizedRect(a, b) {
    const x1 = Math.round(Math.max(0, Math.min(a.x, b.x)));
    const y1 = Math.round(Math.max(0, Math.min(a.y, b.y)));
    const x2 = Math.round(Math.min(get(width), Math.max(a.x, b.x)));
    const y2 = Math.round(Math.min(get(height), Math.max(a.y, b.y)));
    return {
      x: x1,
      y: y1,
      w: Math.max(0, x2 - x1),
      h: Math.max(0, y2 - y1)
    };
  }
  function inRotateZone(p) {
    var _a;
    if (!((_a = get(patch)) == null ? void 0 : _a.transform)) return false;
    const cx = get(patch).x + get(patch).w / 2, cy = get(patch).y + get(patch).h / 2;
    const ang = get(patch).rot || 0;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const dx = p.x - cx, dy = p.y - cy;
    const lx = dx * cosA + dy * sinA, ly = -dx * sinA + dy * cosA;
    const band = 30 / get(
      zoom
      // rotate ring: just past the handle (~6px) out to ~30 screen px
    ), edge = 6 / get(zoom);
    const outX = Math.abs(lx) - get(patch).w / 2, outY = Math.abs(ly) - get(patch).h / 2;
    const isOutside = outX > edge || outY > edge;
    const inBand = outX <= band && outY <= band;
    const nearCorner = outX > -band && outY > -band;
    return isOutside && inBand && nearCorner;
  }
  function patchPointerDown(e, mode) {
    if (e.button !== 0) return;
    if (e.shiftKey && mode === "move") return;
    e.stopPropagation();
    e.preventDefault();
    patchDrag = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...get(patch) }
    };
    if (mode === "rot") {
      const cx = get(patch).x + get(patch).w / 2, cy = get(patch).y + get(patch).h / 2;
      const p = toImageCoords(e);
      patchDrag.grabAngle = Math.atan2(p.y - cy, p.x - cx) - (get(patch).rot || 0);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function patchPointerMove(e) {
    if (!patchDrag) return;
    const o = patchDrag.orig;
    if (patchDrag.mode === "rot") {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      const p = toImageCoords(e);
      let a = Math.atan2(p.y - cy, p.x - cx) - patchDrag.grabAngle;
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      set(patch, { ...get(patch), rot: a }, true);
      return;
    }
    const dx = (e.clientX - patchDrag.startX) / get(zoom);
    const dy = (e.clientY - patchDrag.startY) / get(zoom);
    if (patchDrag.mode === "move") {
      set(patch, { ...get(patch), x: o.x + dx, y: o.y + dy }, true);
      return;
    }
    const dir = patchDrag.mode;
    const ang = o.rot || 0;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const ux = dir.includes("e") ? 1 : dir.includes("w") ? -1 : 0;
    const uy = dir.includes("s") ? 1 : dir.includes("n") ? -1 : 0;
    let w2 = Math.max(2, o.w + ux * lx);
    let h2 = Math.max(2, o.h + uy * ly);
    if (e.shiftKey && ux !== 0 && uy !== 0) {
      const ar = o.w / o.h;
      if (Math.abs(w2 / o.w - 1) >= Math.abs(h2 / o.h - 1)) h2 = w2 / ar;
      else w2 = h2 * ar;
    }
    const ocx = o.x + o.w / 2, ocy = o.y + o.h / 2;
    const aox = -ux * o.w / 2, aoy = -uy * o.h / 2;
    const aDocX = ocx + aox * cos - aoy * sin;
    const aDocY = ocy + aox * sin + aoy * cos;
    const ndx = ux * w2 / 2, ndy = uy * h2 / 2;
    const ncx = aDocX + ndx * cos - ndy * sin;
    const ncy = aDocY + ndx * sin + ndy * cos;
    set(
      patch,
      {
        ...get(patch),
        x: ncx - w2 / 2,
        y: ncy - h2 / 2,
        w: w2,
        h: h2
      },
      true
    );
  }
  function patchPointerUp() {
    patchDrag = null;
  }
  function applySmooth(pts) {
    const pad = Math.ceil(get(smoothBlur) + get(smoothFeather)) + 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const bx = Math.max(0, Math.floor(minX - pad));
    const by = Math.max(0, Math.floor(minY - pad));
    const bw = Math.min(get(width), Math.ceil(maxX + pad)) - bx;
    const bh = Math.min(get(height), Math.ceil(maxY + pad)) - by;
    if (bw < 2 || bh < 2) return;
    const src = document.createElement("canvas");
    src.width = bw;
    src.height = bh;
    const sctx = src.getContext("2d");
    try {
      drawBackdrop(sctx, bx, by, bw, bh, 0, 0, bw, bh);
      sctx.drawImage(paintCanvas, bx, by, bw, bh, 0, 0, bw, bh);
    } catch (e) {
      console.warn("[PromptChain] smooth lift failed", e);
      return;
    }
    const mask = document.createElement("canvas");
    mask.width = bw;
    mask.height = bh;
    const mctx = mask.getContext("2d", { willReadFrequently: true });
    mctx.filter = `blur(${get(smoothFeather)}px)`;
    mctx.beginPath();
    mctx.moveTo(pts[0].x - bx, pts[0].y - by);
    for (let i = 1; i < pts.length; i++) mctx.lineTo(pts[i].x - bx, pts[i].y - by);
    mctx.closePath();
    mctx.fillStyle = "#fff";
    mctx.fill();
    mctx.filter = "none";
    const mdata = mctx.getImageData(0, 0, bw, bh);
    const md = mdata.data;
    for (let i = 3; i < md.length; i += 4) {
      md[i] = Math.max(0, Math.min(255, (md[i] - 128) * 2));
    }
    mctx.putImageData(mdata, 0, 0);
    const out = document.createElement("canvas");
    out.width = bw;
    out.height = bh;
    const ctx = out.getContext("2d");
    ctx.filter = `blur(${get(smoothBlur)}px)`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    paintCanvas.getContext("2d").drawImage(out, bx, by);
    commitAction("Smooth");
  }
  let liqTool = state(
    "warp"
    // warp | bloat | pucker | reconstruct
  );
  let liqSize = state(140);
  let liqDensity = state(
    50
    // edge falloff (PS Density)
  );
  let liqPressure = state(
    70
    // magnitude
  );
  let liqRate = state(
    60
    // hold-accumulation speed (bloat/pucker)
  );
  let liqSrc = null;
  let liqD = null;
  let liqStrokeDirty = false;
  let liqStroking = false;
  let liqResidual = 0;
  let liqLastStamp = null;
  let liqBatchBox = null;
  let liqRafId = 0;
  let liqRafLast = 0;
  let liqLUT = { key: "", table: null };
  function ensureLiqSession() {
    if (liqSrc && liqSrc.width === get(width) && liqSrc.height === get(height) && liqD) return;
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    try {
      drawBackdrop(ctx, 0, 0, get(width), get(height), 0, 0, get(width), get(height));
      ctx.drawImage(paintCanvas, 0, 0);
    } catch (e) {
      console.warn("[PromptChain] liquify session failed", e);
      return;
    }
    liqSrc = ctx.getImageData(0, 0, get(width), get(height));
    liqD = new Float32Array(get(width) * get(height) * 2);
  }
  function dropLiqSession() {
    liqSrc = null;
    liqD = null;
  }
  function getLiqLUT() {
    const radius = get(liqSize) / 2;
    const key2 = `${radius}|${get(liqDensity)}`;
    if (liqLUT.key === key2) return liqLUT.table;
    const len = Math.floor(radius) + 3;
    const table = new Float32Array(len);
    const hardness2 = Math.min(0.99, get(liqDensity) / 100);
    const exponent = 0.4 / (1 - hardness2);
    for (let i = 0; i < len; i++) {
      const f = Math.pow(Math.min(1, i / radius), exponent);
      table[i] = f < 0.5 ? 1 - 2 * f * f : 2 * (1 - f) * (1 - f);
    }
    liqLUT = { key: key2, table };
    return table;
  }
  function liqForce(dist, lut) {
    const a = dist | 0;
    if (a + 1 >= lut.length) return 0;
    return lut[a] + (dist - a) * (lut[a + 1] - lut[a]);
  }
  function liqStampWarp(cx, cy, mx, my) {
    const lut = getLiqLUT();
    const radius = get(liqSize) / 2;
    const k = get(liqPressure) / 100;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(get(width) - 1, Math.ceil(cx + radius));
    const y1 = Math.min(get(height) - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * get(width) + x) * 2;
        liqD[i] += f * k * mx;
        liqD[i + 1] += f * k * my;
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }
  function liqStampPush(cx, cy, mx, my) {
    const lut = getLiqLUT();
    const radius = get(liqSize) / 2;
    const k = get(liqPressure) / 100;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(get(width) - 1, Math.ceil(cx + radius));
    const y1 = Math.min(get(height) - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * get(width) + x) * 2;
        liqD[i] += f * k * my;
        liqD[i + 1] += f * k * -mx;
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }
  function liqStampTwirl(cx, cy, theta) {
    const lut = getLiqLUT();
    const radius = get(liqSize) / 2;
    const s = -Math.sin(theta);
    const c = Math.cos(theta) - 1;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(get(width) - 1, Math.ceil(cx + radius));
    const y1 = Math.min(get(height) - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * get(width) + x) * 2;
        liqD[i] += f * (c * xi - s * yi);
        liqD[i + 1] += f * (s * xi + c * yi);
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }
  function liqStampRadial(cx, cy, k) {
    const lut = getLiqLUT();
    const radius = get(liqSize) / 2;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(get(width) - 1, Math.ceil(cx + radius));
    const y1 = Math.min(get(height) - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * get(width) + x) * 2;
        liqD[i] += f * k * xi;
        liqD[i + 1] += f * k * yi;
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }
  function liqStampReconstruct(cx, cy) {
    const lut = getLiqLUT();
    const radius = get(liqSize) / 2;
    const k = get(liqPressure) / 100 * 0.35;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(get(width) - 1, Math.ceil(cx + radius));
    const y1 = Math.min(get(height) - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * get(width) + x) * 2;
        const s = 1 - f * k;
        liqD[i] *= s;
        liqD[i + 1] *= s;
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }
  function liqGrowBatch(x0, y0, x1, y1) {
    liqStrokeDirty = true;
    liqBatchBox = liqBatchBox ? {
      x0: Math.min(liqBatchBox.x0, x0),
      y0: Math.min(liqBatchBox.y0, y0),
      x1: Math.max(liqBatchBox.x1, x1),
      y1: Math.max(liqBatchBox.y1, y1)
    } : { x0, y0, x1, y1 };
  }
  function liqDragStamps(to) {
    const from = liqLastStamp;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist === 0) return;
    const spacing = Math.max(2, get(liqSize) * 0.08);
    let t = liqResidual;
    let px = from.x, py = from.y;
    while (t <= dist) {
      const f = t / dist;
      const sx = from.x + (to.x - from.x) * f;
      const sy = from.y + (to.y - from.y) * f;
      if (get(liqTool) === "warp") liqStampWarp(sx, sy, px - sx, py - sy);
      else if (get(liqTool) === "push") liqStampPush(sx, sy, px - sx, py - sy);
      else liqStampReconstruct(sx, sy);
      px = sx;
      py = sy;
      t += spacing;
    }
    liqResidual = t - dist;
    liqLastStamp = { x: px, y: py };
    renderLiqBatch();
  }
  function liqHoldLoop(ts) {
    if (!liqStroking) return;
    const dt = Math.min(0.05, Math.max(0, (ts - liqRafLast) / 1e3));
    liqRafLast = ts;
    if (lastPt && dt > 0) {
      if (get(liqTool) === "twirl") {
        const theta = get(liqRate) / 100 * (get(liqPressure) / 100) * dt * 2.2;
        liqStampTwirl(lastPt.x, lastPt.y, theta);
      } else {
        const k = get(liqRate) / 100 * dt * 1.2 * (get(liqPressure) / 100);
        liqStampRadial(lastPt.x, lastPt.y, get(liqTool) === "bloat" ? -k : k);
      }
      renderLiqBatch();
    }
    liqRafId = requestAnimationFrame(liqHoldLoop);
  }
  function renderLiqBatch() {
    if (!liqBatchBox) return;
    const { x0, y0, x1, y1 } = liqBatchBox;
    liqBatchBox = null;
    renderLiqRect(x0, y0, x1, y1);
  }
  function renderLiqRect(x0, y0, x1, y1) {
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < 1 || bh < 1) return;
    const img = new ImageData(bw, bh);
    const o = img.data;
    const s = liqSrc.data;
    const maxX = get(width) - 1.001, maxY = get(height) - 1.001;
    for (let y = 0; y < bh; y++) {
      const Y = y0 + y;
      for (let x = 0; x < bw; x++) {
        const X = x0 + x;
        const gi = Y * get(width) + X;
        const idx = (y * bw + x) * 4;
        const dx = liqD[gi * 2], dy = liqD[gi * 2 + 1];
        if (dx === 0 && dy === 0) {
          const j = gi * 4;
          o[idx] = s[j];
          o[idx + 1] = s[j + 1];
          o[idx + 2] = s[j + 2];
        } else {
          const fx = Math.min(maxX, Math.max(0, X + dx));
          const fy = Math.min(maxY, Math.max(0, Y + dy));
          const ix = fx | 0, iy = fy | 0;
          const tx = fx - ix, ty = fy - iy;
          const i00 = (iy * get(width) + ix) * 4;
          const i10 = i00 + 4, i01 = i00 + get(width) * 4, i11 = i01 + 4;
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
          const w01 = (1 - tx) * ty, w11 = tx * ty;
          o[idx] = s[i00] * w00 + s[i10] * w10 + s[i01] * w01 + s[i11] * w11;
          o[idx + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
          o[idx + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
        }
        o[idx + 3] = 255;
      }
    }
    paintCanvas.getContext("2d").putImageData(img, x0, y0);
  }
  let cropBox = state(
    null
    // {x,y,w,h} image coords
  );
  let cropRatioId = state("free");
  let cropRatioFlip = state(false);
  let cropDragging = state(
    false
    // any active manipulation → thirds overlay
  );
  let cropDrag = null;
  let cropDrawStart = null;
  const CROP_RATIOS = [
    { id: "free", label: "Free" },
    { id: "original", label: "Original" },
    { id: "1:1", label: "1:1", r: 1 },
    { id: "4:5", label: "4:5", r: 4 / 5 },
    { id: "5:7", label: "5:7", r: 5 / 7 },
    { id: "2:3", label: "2:3", r: 2 / 3 },
    { id: "16:9", label: "16:9", r: 16 / 9 }
  ];
  function cropRatioValue() {
    if (get(cropRatioId) === "free") return null;
    const r = get(cropRatioId) === "original" ? get(width) / get(height) : CROP_RATIOS.find((c) => c.id === get(cropRatioId)).r;
    return get(cropRatioFlip) ? 1 / r : r;
  }
  function setTool(id) {
    commitPatch();
    if (id === "adjust") {
      openAdjust();
      return;
    }
    if (get(tool) === "liquify" && id !== "liquify") dropLiqSession();
    set(tool, id, true);
    if (id === "crop") resetCropBox();
    else set(cropBox, null);
    if (id === "liquify") ensureLiqSession();
  }
  let adjustOpen = state(false);
  let adjustSrcCanvas = state(null);
  function openAdjust() {
    if (blockHiddenEdit("adjust")) return;
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    try {
      drawBackdrop(ctx, 0, 0, get(width), get(height), 0, 0, get(width), get(height));
      ctx.drawImage(paintCanvas, 0, 0);
    } catch (e) {
      console.warn("[PromptChain] adjust open failed", e);
      return;
    }
    set(adjustSrcCanvas, c, true);
    set(adjustOpen, true);
  }
  function onAdjustApply(imageData) {
    paintCanvas.getContext("2d").putImageData(imageData, 0, 0);
    commitAction("Camera Raw");
    set(adjustOpen, false);
    set(adjustSrcCanvas, null);
  }
  function resetCropBox() {
    set(cropBox, { x: 0, y: 0, w: get(width), h: get(height) }, true);
    applyRatioToBox();
  }
  function cropBoxIsFull() {
    return get(cropBox) && get(cropBox).x < 0.5 && get(cropBox).y < 0.5 && Math.abs(get(cropBox).w - get(width)) < 1 && Math.abs(get(cropBox).h - get(height)) < 1;
  }
  function applyRatioToBox() {
    const r = cropRatioValue();
    if (!r || !get(cropBox)) return;
    let { x, y, w, h } = get(cropBox);
    const cx = x + w / 2, cy = y + h / 2;
    if (w / h > r) w = h * r;
    else h = w / r;
    x = Math.max(0, Math.min(get(width) - w, cx - w / 2));
    y = Math.max(0, Math.min(get(height) - h, cy - h / 2));
    set(cropBox, { x, y, w, h }, true);
  }
  function cropPointerDown(e, mode) {
    if (e.button !== 0) return;
    if (mode === "move" && cropBoxIsFull()) return;
    e.stopPropagation();
    e.preventDefault();
    cropDrag = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...get(cropBox) },
      shiftRatio: get(cropBox).w / get(cropBox).h
    };
    set(cropDragging, true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function cropPointerMove(e) {
    if (!cropDrag) return;
    const dx = (e.clientX - cropDrag.startX) / get(zoom);
    const dy = (e.clientY - cropDrag.startY) / get(zoom);
    const o = cropDrag.orig;
    let r = cropRatioValue();
    if (!r && e.shiftKey) r = cropDrag.shiftRatio;
    if (cropDrag.mode === "move") {
      set(
        cropBox,
        {
          ...get(cropBox),
          x: Math.max(0, Math.min(get(width) - o.w, o.x + dx)),
          y: Math.max(0, Math.min(get(height) - o.h, o.y + dy))
        },
        true
      );
      return;
    }
    const dir = cropDrag.mode;
    let { x, y, w, h } = o;
    if (dir.includes("e")) w = o.w + dx;
    if (dir.includes("s")) h = o.h + dy;
    if (dir.includes("w")) {
      x = o.x + dx;
      w = o.w - dx;
    }
    if (dir.includes("n")) {
      y = o.y + dy;
      h = o.h - dy;
    }
    w = Math.max(8, w);
    h = Math.max(8, h);
    if (r) {
      if (dir === "n" || dir === "s") w = h * r;
      else h = w / r;
    }
    if (dir.includes("w")) x = o.x + o.w - w;
    if (dir.includes("n")) y = o.y + o.h - h;
    if (dir === "n" || dir === "s") x = o.x + (o.w - w) / 2;
    if (dir === "e" || dir === "w") y = o.y + (o.h - h) / 2;
    x = Math.max(0, x);
    y = Math.max(0, y);
    if (x + w > get(width)) w = get(width) - x;
    if (y + h > get(height)) h = get(height) - y;
    if (r) {
      if (w / h > r) w = h * r;
      else h = w / r;
      if (dir.includes("w")) x = o.x + o.w - w;
      if (dir.includes("n")) y = o.y + o.h - h;
    }
    set(cropBox, { x, y, w, h }, true);
  }
  function cropPointerUp() {
    cropDrag = null;
    set(cropDragging, false);
  }
  function commitCrop() {
    if (!get(cropBox) || cropBoxIsFull()) {
      resetCropBox();
      return;
    }
    const cx = Math.max(0, Math.round(get(cropBox).x));
    const cy = Math.max(0, Math.round(get(cropBox).y));
    const cw = Math.min(get(width) - cx, Math.round(get(cropBox).w));
    const ch = Math.min(get(height) - cy, Math.round(get(cropBox).h));
    if (cw < 4 || ch < 4) return;
    flushActive();
    const sc = document.createElement("canvas");
    sc.width = cw;
    sc.height = ch;
    try {
      sc.getContext("2d").drawImage(imgEl, cx, cy, cw, ch, 0, 0, cw, ch);
    } catch (e) {
      console.warn("[PromptChain] crop failed", e);
      return;
    }
    const newUrl = sc.toDataURL("image/png");
    const ow = get(width), oh = get(height);
    const cropPlane = (data) => {
      if (!data) return void 0;
      const t = document.createElement("canvas");
      t.width = ow;
      t.height = oh;
      t.getContext("2d").putImageData(data, 0, 0);
      const cc = document.createElement("canvas");
      cc.width = cw;
      cc.height = ch;
      cc.getContext("2d").drawImage(t, cx, cy, cw, ch, 0, 0, cw, ch);
      return cc;
    };
    const newLayers = get(layers).map((L) => {
      const next = { ...L };
      const bc = cropPlane(L.bitmap);
      if (bc) next.bitmap = bc.getContext("2d").getImageData(0, 0, cw, ch);
      const mc = cropPlane(L.mask);
      if (mc) {
        next.mask = mc.getContext("2d").getImageData(0, 0, cw, ch);
        next.maskUrl = mc.toDataURL();
      }
      return next;
    });
    set(sourceUrl, newUrl, true);
    set(width, cw, true);
    set(height, ch, true);
    sourceData = null;
    strokeCov = null;
    set(cropBox, null);
    dropLiqSession();
    set(healSource, null);
    set(layers, newLayers, true);
    requestAnimationFrame(() => {
      loadActiveBitmap();
      commitAction("Crop");
      resetView();
    });
  }
  function cropHandleStyle(dir, p, z) {
    const cursors = {
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      nw: "nwse-resize",
      se: "nwse-resize",
      ne: "nesw-resize",
      sw: "nesw-resize"
    };
    const t = 3.5 / z;
    const L = 16 / z;
    const B = 26 / z;
    if (dir.length === 2) {
      const x2 = dir.includes("w") ? p.x - t : p.x + p.w - L + t;
      const y2 = dir.includes("n") ? p.y - t : p.y + p.h - L + t;
      const borders = `border-${dir.includes("n") ? "top" : "bottom"}-width:${t}px; border-${dir.includes("w") ? "left" : "right"}-width:${t}px;`;
      return `left:${x2}px; top:${y2}px; width:${L}px; height:${L}px; ${borders} cursor:${cursors[dir]};`;
    }
    if (dir === "n" || dir === "s") {
      const x2 = p.x + p.w / 2 - B / 2;
      const y2 = dir === "n" ? p.y - t / 2 : p.y + p.h - t / 2;
      return `left:${x2}px; top:${y2}px; width:${B}px; height:${t}px; background:#fff; cursor:${cursors[dir]};`;
    }
    const x = dir === "w" ? p.x - t / 2 : p.x + p.w - t / 2;
    const y = p.y + p.h / 2 - B / 2;
    return `left:${x}px; top:${y}px; width:${t}px; height:${B}px; background:#fff; cursor:${cursors[dir]};`;
  }
  function tHandleStyle(dir, p, z) {
    const s = 11 / z;
    const cx = dir.includes("w") ? 0 : dir.includes("e") ? p.w : p.w / 2;
    const cy = dir.includes("n") ? 0 : dir.includes("s") ? p.h : p.h / 2;
    return `left:${cx - s / 2}px; top:${cy - s / 2}px; width:${s}px; height:${s}px;`;
  }
  let rgb = user_derived(() => hsvToRgb(get(hue), get(sat), get(val)));
  let hexColor = user_derived(() => rgbToHex(get(rgb)));
  let colorPopout = state(false);
  let popoutEl = state(null);
  let colorChipEl = state(null);
  let popPrev = null;
  function openColorPop() {
    popPrev = { hue: get(hue), sat: get(sat), val: get(val) };
    set(colorPopout, true);
  }
  function okColorPop() {
    set(colorPopout, false);
  }
  function cancelColorPop() {
    if (popPrev) set(hue, popPrev.hue, true), set(sat, popPrev.sat, true), set(val, popPrev.val, true);
    set(colorPopout, false);
  }
  user_effect(() => {
    if (!get(colorPopout)) return;
    const onDown = (e) => {
      var _a, _b;
      if (viewportEl == null ? void 0 : viewportEl.contains(e.target)) return;
      if (!((_a = get(popoutEl)) == null ? void 0 : _a.contains(e.target)) && !((_b = get(colorChipEl)) == null ? void 0 : _b.contains(e.target))) {
        set(colorPopout, false);
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  });
  user_effect(() => {
    if ($$props.open && caps()) {
      set(savePrefix, caps().defaultSavePrefix || "edit/edit", true);
      set(saving, false);
      set(errorMsg, "");
      set(tool, "brush");
      set(sourceUrl, srcUrlProp());
      set(width, widthProp());
      set(height, heightProp());
      sourceData = null;
      set(cropBox, null);
      dropLiqSession();
      set(healSource, null);
      requestAnimationFrame(() => {
        resetView();
        restoreOrInit();
      });
    }
  });
  user_effect(() => {
    if (!$$props.open) return;
    const onKey = (e) => {
      if (get(
        adjustOpen
        // Camera Raw / an elevated handoff modal owns the keyboard
      ) || suspended()) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const kt = e.target, ktag = (kt == null ? void 0 : kt.tagName) || "";
      const typingTarget = (kt == null ? void 0 : kt.isContentEditable) || ktag === "TEXTAREA" || ktag === "INPUT" && !/^(range|checkbox|radio|button|submit|reset|color|file|image)$/i.test(kt.type || "");
      if (typingTarget) return;
      if (get(
        hiddenEditDialog
        // PS modal: Esc/Enter/OK dismiss, swallow other Edit hotkeys
      )) {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          set(hiddenEditDialog, null);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (get(patch)) cancelPatch();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y" || (e.key === "z" || e.key === "Z") && e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "j" || e.key === "J") && get(selActive)) {
        e.preventDefault();
        e.stopPropagation();
        layerViaCopy(e.shiftKey);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && get(selActive)) {
        e.preventDefault();
        e.stopPropagation();
        copySelection(false);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "X") && get(selActive)) {
        e.preventDefault();
        e.stopPropagation();
        copySelection(true);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V") && clipboard) {
        e.preventDefault();
        e.stopPropagation();
        pasteClipboard();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        e.stopPropagation();
        addLayer();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        e.stopPropagation();
        selectAllRegion();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "i" || e.key === "I") && get(selActive)) {
        e.preventDefault();
        e.stopPropagation();
        selectInverse();
      } else if (e.key === "Backspace" && (e.altKey || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        fillWith(e.altKey ? get(
          rgb
          // Alt+Backspace = foreground, Ctrl+Backspace = background
        ) : get(bgRgb));
      } else if ((e.key === "Delete" || e.key === "Backspace") && get(selActive)) {
        e.preventDefault();
        e.stopPropagation();
        deleteSelection();
      } else if ((e.key === "Delete" || e.key === "Backspace") && get(selectedIds).length > 1 && canDeleteSelected()) {
        e.preventDefault();
        e.stopPropagation();
        deleteSelectedLayers();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D") && get(selActive)) {
        e.preventDefault();
        e.stopPropagation();
        deselect();
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.ctrlKey && !e.metaKey && !e.altKey && !get(patch) && !get(colorPopout) && !get(healDialog) && get(tool) !== "crop") {
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (get(selActive)) translateSelMask(copyMaskCanvas(), selBBox, dx, dy);
        else nudgeActiveLayer(dx, dy);
      } else if (e.key === "Enter" && get(colorPopout)) {
        e.preventDefault();
        e.stopPropagation();
        okColorPop();
      } else if (e.key === "Enter" && get(patch)) {
        e.preventDefault();
        e.stopPropagation();
        commitPatch();
      } else if (e.key === "Enter" && get(tool) === "crop" && get(cropBox)) {
        e.preventDefault();
        e.stopPropagation();
        commitCrop();
      } else if ((e.key === "Escape" || e.key === "Enter") && get(healDialog)) {
        e.preventDefault();
        e.stopPropagation();
        set(healDialog, false);
      } else if (e.key === "Escape" && !get(saving)) {
        e.preventDefault();
        e.stopPropagation();
        if (get(
          colorPopout
          // Esc = cancel, reverts the color
        )) cancelColorPop();
        else if (get(
          patch
          // first Esc drops the patch, second closes
        )) cancelPatch();
        else if (get(
          selActive
          // first Esc drops the selection
        )) deselect();
        else if (get(tool) === "crop" && get(cropBox) && !cropBoxIsFull()) resetCropBox();
        else close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  function hsvToRgb(h, s, v) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
    };
    return [f(5), f(3), f(1)];
  }
  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * ((g - b) / d % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return [(h + 360) % 360, max ? d / max : 0, max];
  }
  function rgbToHex([r, g, b]) {
    return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  }
  function setColorFromRgb(r, g, b) {
    (($$value) => {
      var $$array = to_array($$value, 3);
      set(hue, $$array[0], true);
      set(sat, $$array[1], true);
      set(val, $$array[2], true);
    })(rgbToHsv(r, g, b));
  }
  const NAV_W = 256;
  const NAV_MAX_H = 190;
  let vpW = state(0);
  let vpH = state(0);
  let fitMode = state(true);
  let navScale = user_derived(() => get(width) && get(height) ? Math.min(NAV_W / get(width), NAV_MAX_H / get(height)) : 0);
  let navTw = user_derived(() => get(width) * get(navScale));
  let navTh = user_derived(() => get(height) * get(navScale));
  let navRect = user_derived(() => {
    if (!get(vpW) || !get(vpH) || !get(navScale)) return null;
    const x0 = Math.max(0, -get(panX) / get(zoom));
    const y0 = Math.max(0, -get(panY) / get(zoom));
    const x1 = Math.min(get(width), (get(vpW) - get(panX)) / get(zoom));
    const y1 = Math.min(get(height), (get(vpH) - get(panY)) / get(zoom));
    if (x1 <= x0 || y1 <= y0) return null;
    return {
      x: x0 * get(navScale),
      y: y0 * get(navScale),
      w: (x1 - x0) * get(navScale),
      h: (y1 - y0) * get(navScale)
    };
  });
  function clampPan() {
    const sw = get(width) * get(zoom), sh = get(height) * get(zoom);
    set(
      panX,
      sw <= get(vpW) ? (get(vpW) - sw) / 2 : Math.max(get(vpW) - sw, Math.min(0, get(panX))),
      true
    );
    set(
      panY,
      sh <= get(vpH) ? (get(vpH) - sh) / 2 : Math.max(get(vpH) - sh, Math.min(0, get(panY))),
      true
    );
  }
  user_effect(() => {
    if (!$$props.open) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!viewportEl) return;
        const nw = viewportEl.clientWidth, nh = viewportEl.clientHeight;
        if (nw === get(
          vpW
          // no real size change
        ) && nh === get(vpH)) return;
        const ow = get(
          vpW
          // anchor against the OLD size
        ), oh = get(vpH);
        set(vpW, nw, true);
        set(vpH, nh, true);
        if (!ow || !oh || !get(width) || !get(height)) return;
        if (get(fitMode)) {
          resetView();
        } else {
          const ax = (ow / 2 - get(panX)) / get(zoom), ay = (oh / 2 - get(panY)) / get(zoom);
          set(panX, nw / 2 - ax * get(zoom));
          set(panY, nh / 2 - ay * get(zoom));
          clampPan();
        }
      });
    });
    if (viewportEl) ro.observe(viewportEl);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });
  function navPanTo(e, el) {
    const rect = el.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / get(navScale);
    const cy = (e.clientY - rect.top) / get(navScale);
    set(panX, get(vpW) / 2 - cx * get(zoom));
    set(panY, get(vpH) / 2 - cy * get(zoom));
  }
  function navDrag(e) {
    const el = e.currentTarget;
    e.preventDefault();
    navPanTo(e, el);
    el.setPointerCapture(e.pointerId);
    const move = (ev) => navPanTo(ev, el);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }
  function setZoomCentered(z) {
    const nz = Math.max(0.05, Math.min(12, z));
    set(panX, get(vpW) / 2 - (get(vpW) / 2 - get(panX)) / get(zoom) * nz);
    set(panY, get(vpH) / 2 - (get(vpH) / 2 - get(panY)) / get(zoom) * nz);
    set(zoom, nz, true);
    set(
      fitMode,
      false
      // a manual zoom — resize now holds this zoom and re-anchors
    );
  }
  const ZOOM_STOPS = [
    0.05,
    0.0625,
    0.0833,
    0.125,
    0.1667,
    0.25,
    0.3333,
    0.5,
    0.6667,
    1,
    2,
    3,
    4,
    5,
    6,
    8,
    12
  ];
  function zoomStep(dir) {
    const eps = 1e-3;
    if (dir > 0) {
      const next = ZOOM_STOPS.find((s) => s > get(zoom) + eps);
      if (next) setZoomCentered(next);
    } else {
      const next = [...ZOOM_STOPS].reverse().find((s) => s < get(zoom) - eps);
      if (next) setZoomCentered(next);
    }
  }
  function resetView() {
    set(
      fitMode,
      true
      // a reset/fit IS the fit-to-window state — resize will re-fit
    );
    if (!viewportEl || !get(width) || !get(height)) {
      set(zoom, 1);
      set(panX, 0);
      set(panY, 0);
      return;
    }
    const rect = viewportEl.getBoundingClientRect();
    set(zoom, Math.min(rect.width / get(width), rect.height / get(height), 1) || 1, true);
    set(panX, (rect.width - get(width) * get(zoom)) / 2);
    set(panY, (rect.height - get(height) * get(zoom)) / 2);
  }
  function toImageCoords(e) {
    const rect = viewportEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - get(panX)) / get(zoom),
      y: (e.clientY - rect.top - get(panY)) / get(zoom)
    };
  }
  function onWheel(e) {
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.05, Math.min(12, get(zoom) * factor));
    set(panX, cx - (cx - get(panX)) / get(zoom) * newZoom);
    set(panY, cy - (cy - get(panY)) / get(zoom) * newZoom);
    set(zoom, newZoom, true);
    set(
      fitMode,
      false
      // wheel zoom is a manual zoom — resize holds it and re-anchors
    );
  }
  let strokeCov = null;
  let sourceData = null;
  let preStroke = null;
  let batchBox = null;
  let strokeBox = null;
  let falloffLUT = { key: "", table: null };
  let healDialog = state(
    false
    // PS-style "Alt-click to define a source" dialog
  );
  let healSource = state(
    null
    // {x,y} primed by Alt-click (heal tool)
  );
  let healStrokeOffset = state(
    null
    // active stroke's offset (drives the crosshair)
  );
  let healPaintingUi = state(false);
  const isHealTool = () => get(tool) === "spot" || get(tool) === "heal";
  function compositeAt(x, y, ch) {
    const j = (y * get(width) + x) * 4;
    const pa = preStroke.data[j + 3] / 255;
    return preStroke.data[j + ch] * pa + sourceData.data[j + ch] * (1 - pa);
  }
  function findBestPatchOffset(x0, y0, bw, bh) {
    const ring = [];
    for (let y = 0; y < bh && ring.length < 600; y += 2) {
      for (let x = 0; x < bw && ring.length < 600; x += 2) {
        const cov = strokeCov[(y0 + y) * get(width) + x0 + x];
        if (cov > 0 && cov <= 0.5) ring.push([x0 + x, y0 + y]);
      }
    }
    if (!ring.length) return null;
    const rH = Math.max(bw, bh) / 2;
    const rMin = rH * 1.2 + 6;
    const rMax = Math.min(rH * 3 + 60, Math.max(get(width), get(height)));
    let best = null, bestErr = Infinity;
    for (let k = 0; k < 280; k++) {
      const r = rMin + (rMax - rMin) * k / 280;
      const a = k * 2.39996;
      const dx = Math.round(r * Math.cos(a));
      const dy = Math.round(r * Math.sin(a));
      let err = 0, n = 0;
      for (const [px, py] of ring) {
        const sx = px + dx, sy = py + dy;
        if (sx < 0 || sy < 0 || sx >= get(width) || sy >= get(height)) {
          continue;
        }
        if (strokeCov[sy * get(
          width
          // don't sample the hole
        ) + sx] > 0) {
          continue;
        }
        for (let ch = 0; ch < 3; ch++) {
          const d = compositeAt(px, py, ch) - compositeAt(sx, sy, ch);
          err += d * d;
        }
        n++;
        if (err / Math.max(1, n) > bestErr) break;
      }
      if (n < ring.length * 0.7) continue;
      const norm = err / n;
      if (norm < bestErr) {
        bestErr = norm;
        best = { dx, dy };
      }
    }
    return best;
  }
  function runHeal() {
    if (!strokeBox) return;
    const pad = 3;
    const x0 = Math.max(0, strokeBox.x0 - pad);
    const y0 = Math.max(0, strokeBox.y0 - pad);
    const x1 = Math.min(get(width) - 1, strokeBox.x1 + pad);
    const y1 = Math.min(get(height) - 1, strokeBox.y1 + pad);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const restore = () => {
      paintCanvas.getContext("2d").putImageData(preStroke, 0, 0, x0, y0, bw, bh);
    };
    const off = get(tool) === "heal" ? get(healStrokeOffset) : findBestPatchOffset(x0, y0, bw, bh);
    if (!off) {
      restore();
      return;
    }
    off.dx = Math.round(off.dx);
    off.dy = Math.round(off.dy);
    const npx = bw * bh;
    const dest = new Float32Array(npx * 3);
    const src = new Float32Array(npx * 3);
    const D = [
      new Float32Array(npx),
      new Float32Array(npx),
      new Float32Array(npx)
    ];
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        const sx = Math.max(0, Math.min(get(width) - 1, x0 + x + off.dx));
        const sy = Math.max(0, Math.min(get(height) - 1, y0 + y + off.dy));
        for (let ch = 0; ch < 3; ch++) {
          dest[i * 3 + ch] = compositeAt(x0 + x, y0 + y, ch);
          src[i * 3 + ch] = compositeAt(sx, sy, ch);
          D[ch][i] = dest[i * 3 + ch] - src[i * 3 + ch];
        }
      }
    }
    let interior = collectInterior(x0, y0, bw, bh, 0.5);
    if (!interior.idx.length) interior = collectInterior(x0, y0, bw, bh, 0.2);
    if (!interior.idx.length) {
      restore();
      return;
    }
    const n = interior.idx.length;
    const w = 2 - 1 / (0.1575 * Math.sqrt(n) + 0.8);
    for (let ch = 0; ch < 3; ch++) {
      const Dc = D[ch];
      for (let iter = 0; iter < 500; iter++) {
        let err = 0;
        for (let parity = 0; parity < 2; parity++) {
          const list = parity ? interior.black : interior.red;
          for (let k = 0; k < list.length; k++) {
            const i = list[k];
            let sum = 0, diag = 0;
            const x = i % bw, y = i / bw | 0;
            if (y > 0) {
              sum += Dc[i - bw];
              diag++;
            }
            if (y < bh - 1) {
              sum += Dc[i + bw];
              diag++;
            }
            if (x > 0) {
              sum += Dc[i - 1];
              diag++;
            }
            if (x < bw - 1) {
              sum += Dc[i + 1];
              diag++;
            }
            const delta = w * (sum / diag - Dc[i]);
            Dc[i] += delta;
            err += delta * delta;
          }
        }
        if (err < 0.01 * n) break;
      }
    }
    const img = new ImageData(bw, bh);
    const px = img.data;
    const pd = preStroke.data;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        const gi = (y0 + y) * get(width) + x0 + x;
        const cov = Math.min(1, strokeCov[gi]);
        const o = i * 4, j = gi * 4;
        if (cov <= 0) {
          px[o] = pd[j];
          px[o + 1] = pd[j + 1];
          px[o + 2] = pd[j + 2];
          px[o + 3] = pd[j + 3];
          continue;
        }
        const d = dither(x0 + x, y0 + y);
        for (let ch = 0; ch < 3; ch++) {
          const healed = src[i * 3 + ch] + D[ch][i];
          const target = cov * healed + (1 - cov) * dest[i * 3 + ch];
          px[o + ch] = Math.max(0, Math.min(255, Math.round(target + d)));
        }
        px[o + 3] = 255;
      }
    }
    paintCanvas.getContext("2d").putImageData(img, x0, y0);
    commitAction(get(tool) === "heal" ? "Heal" : "Spot Heal");
  }
  function collectInterior(x0, y0, bw, bh, threshold) {
    const idx = [], red = [], black = [];
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (strokeCov[(y0 + y) * get(width) + x0 + x] > threshold) {
          const i = y * bw + x;
          idx.push(i);
          (x + y & 1 ? black : red).push(i);
        }
      }
    }
    return { idx, red, black };
  }
  function getFalloffLUT() {
    const core = Math.min(0.98, Math.max(0.02, get(hardness)));
    const key2 = String(core);
    if (falloffLUT.key !== key2) {
      const table = new Float32Array(1025);
      for (let i = 0; i <= 1024; i++) {
        const rr = i / 1024;
        table[i] = rr < core ? rr + 1 - rr / core : core / (1 - core) * (1 - rr);
      }
      falloffLUT = { key: key2, table };
    }
    return falloffLUT.table;
  }
  function beginStroke() {
    if (!strokeCov || strokeCov.length !== get(width) * get(height)) {
      strokeCov = new Float32Array(get(width) * get(height));
    } else {
      strokeCov.fill(0);
    }
    sourceData = backdropCanvas().getContext("2d").getImageData(0, 0, get(width), get(height));
    preStroke = paintCanvas.getContext("2d").getImageData(0, 0, get(width), get(height));
    batchBox = null;
    strokeBox = null;
  }
  function dabCov(cx, cy, radius) {
    const lut = getFalloffLUT();
    const dabFlow = isHealTool() ? 1 : get(flow);
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(get(width) - 1, Math.ceil(cx + radius));
    const y1 = Math.min(get(height) - 1, Math.ceil(cy + radius));
    if (x1 < x0 || y1 < y0) return;
    const inv = 1 / (radius * radius);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      const row = y * get(width);
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const rr = (dx * dx + dy * dy) * inv;
        if (rr >= 1) continue;
        const a = lut[rr * 1024 | 0] * dabFlow;
        const i = row + x;
        strokeCov[i] += a * (1 - strokeCov[i]);
      }
    }
    batchBox = batchBox ? {
      x0: Math.min(batchBox.x0, x0),
      y0: Math.min(batchBox.y0, y0),
      x1: Math.max(batchBox.x1, x1),
      y1: Math.max(batchBox.y1, y1)
    } : { x0, y0, x1, y1 };
    strokeBox = strokeBox ? {
      x0: Math.min(strokeBox.x0, x0),
      y0: Math.min(strokeBox.y0, y0),
      x1: Math.max(strokeBox.x1, x1),
      y1: Math.max(strokeBox.y1, y1)
    } : { x0, y0, x1, y1 };
  }
  function dither(x, y) {
    let h = x * 374761393 + y * 668265263 | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296 - 0.5;
  }
  function renderStrokeBatch() {
    if (!batchBox) return;
    const { x0, y0, x1, y1 } = batchBox;
    batchBox = null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const erase = get(tool) === "eraser";
    const healMode = isHealTool();
    const stampMode = get(tool) === "stamp" && get(healStrokeOffset);
    const odx = stampMode ? get(healStrokeOffset).dx : 0;
    const ody = stampMode ? get(healStrokeOffset).dy : 0;
    const ceil = healMode ? 1 : get(
      opacity
      // per-stroke cap: flow is the rate, opacity the ceiling
    );
    const [cr, cg, cb] = get(rgb);
    const img = new ImageData(bw, bh);
    const px = img.data;
    const pd = preStroke.data;
    const sd = sourceData.data;
    for (let y = 0; y < bh; y++) {
      const row = (y0 + y) * get(width) + x0;
      for (let x = 0; x < bw; x++) {
        const gi = row + x;
        const cov = Math.min(strokeCov[gi], ceil);
        const i = (y * bw + x) * 4;
        const j = gi * 4;
        if (cov <= 0) {
          px[i] = pd[j];
          px[i + 1] = pd[j + 1];
          px[i + 2] = pd[j + 2];
          px[i + 3] = pd[j + 3];
          continue;
        }
        const pa = pd[j + 3] / 255;
        const d = dither(x0 + x, y0 + y);
        const sj = stampMode ? (Math.max(0, Math.min(get(height) - 1, y0 + y + ody)) * get(width) + Math.max(0, Math.min(get(width) - 1, x0 + x + odx))) * 4 : 0;
        const spa = stampMode ? pd[sj + 3] / 255 : 0;
        for (let ch = 0; ch < 3; ch++) {
          const comp = pd[j + ch] * pa + sd[j + ch] * (1 - pa);
          const target = healMode ? comp * (1 - cov * 0.4) + 200 * cov * 0.4 : stampMode ? (pd[sj + ch] * spa + sd[sj + ch] * (1 - spa)) * cov + comp * (1 - cov) : erase ? comp * (1 - cov) + sd[j + ch] * cov : (ch === 0 ? cr : ch === 1 ? cg : cb) * cov + comp * (1 - cov);
          px[i + ch] = Math.max(0, Math.min(255, Math.round(target + d)));
        }
        px[i + 3] = 255;
      }
    }
    paintCanvas.getContext("2d").putImageData(img, x0, y0);
  }
  const AIRBRUSH_DABS_PER_SEC = 30;
  let airRafId = 0;
  let airLastTs = 0;
  let airResidual = 0;
  function airbrushLoop(ts) {
    if (!painting) return;
    const dt = Math.min(0.25, Math.max(0, (ts - airLastTs) / 1e3));
    airLastTs = ts;
    if (get(airbrush) && lastPt) {
      airResidual += dt * AIRBRUSH_DABS_PER_SEC;
      const radius = Math.max(0.5, get(brushSize) / 2);
      let fired = false;
      while (airResidual >= 1) {
        dabCov(lastPt.x, lastPt.y, radius);
        airResidual -= 1;
        fired = true;
      }
      if (fired) renderStrokeBatch();
    }
    airRafId = requestAnimationFrame(airbrushLoop);
  }
  function stampSegment(from, to) {
    const radius = Math.max(0.5, get(brushSize) / 2);
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(0.5, radius * 0.15);
    if (dist === 0) {
      dabCov(to.x, to.y, radius);
    } else {
      let t = strokeResidual;
      while (t <= dist) {
        const f = t / dist;
        dabCov(from.x + dx * f, from.y + dy * f, radius);
        t += step;
      }
      strokeResidual = t - dist;
    }
    renderStrokeBatch();
  }
  function initPaint() {
    var _a;
    set(patch, null);
    set(selRect, null);
    selMaskCanvas = null;
    selBBox = null;
    set(selActive, false);
    update(selVersion);
    (_a = paintCanvas == null ? void 0 : paintCanvas.getContext("2d")) == null ? void 0 : _a.clearRect(0, 0, get(width), get(height));
    strokeCov = null;
    nextLayerNum = 0;
    set(
      layers,
      [
        {
          id: 0,
          name: "Background",
          visible: true,
          opacity: 1,
          bitmap: null,
          isBackground: true
        }
      ],
      true
    );
    set(activeIndex, 0);
    set(selectedIds, [0], true);
    set(layerMenu, null);
    set(layerCanvasEls, [], true);
    set(
      history2,
      [
        {
          label: "Open",
          layers: [...get(layers)],
          activeIndex: 0,
          selectedIds: [0],
          url: get(sourceUrl),
          w: get(width),
          h: get(height)
        }
      ],
      true
    );
    set(histIndex, 0);
    requestAnimationFrame(() => loadActiveBitmap());
  }
  async function restoreOrInit() {
    var _a;
    let doc = null;
    if (editDocHash() && fetchApi()) {
      try {
        const res = await fetchApi()(`/promptchain/edit-doc/${editDocHash()}`);
        if (res.ok) doc = await res.json();
      } catch (e) {
        doc = null;
      }
    }
    if (((_a = doc == null ? void 0 : doc.layers) == null ? void 0 : _a.length) && doc.w === get(width) && doc.h === get(height)) {
      set(restoring, true);
      try {
        await restoreLayerDoc(doc, editDocHash());
      } finally {
        set(restoring, false);
      }
    } else {
      initPaint();
    }
  }
  async function loadPlane(hash, file) {
    try {
      const res = await fetchApi()(`/promptchain/edit-doc/${hash}/${file}`);
      if (!res.ok) return null;
      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const cx = c.getContext("2d");
      cx.drawImage(bmp, 0, 0);
      return cx.getImageData(0, 0, bmp.width, bmp.height);
    } catch (e) {
      return null;
    }
  }
  async function restoreLayerDoc(doc, hash) {
    var _a;
    set(patch, null);
    set(selRect, null);
    selMaskCanvas = null;
    selBBox = null;
    set(selActive, false);
    update(selVersion);
    (_a = paintCanvas == null ? void 0 : paintCanvas.getContext("2d")) == null ? void 0 : _a.clearRect(0, 0, get(width), get(height));
    strokeCov = null;
    set(layerMenu, null);
    set(layerCanvasEls, [], true);
    const rebuilt = [];
    let maxId = 0;
    for (const m of doc.layers) {
      const L = {
        id: m.id,
        name: m.name,
        visible: m.visible !== false,
        opacity: m.opacity ?? 1
      };
      if (m.blend) L.blend = m.blend;
      if (m.ox) L.ox = m.ox;
      if (m.oy) L.oy = m.oy;
      if (m.is_background) L.isBackground = true;
      if (m.source_rect) L.sourceRect = m.source_rect;
      L.bitmap = m.bitmap ? await loadPlane(hash, m.bitmap) : null;
      if (m.mask) {
        const md = await loadPlane(hash, m.mask);
        if (md) {
          L.mask = md;
          const mc = document.createElement("canvas");
          mc.width = md.width;
          mc.height = md.height;
          mc.getContext("2d").putImageData(md, 0, 0);
          L.maskUrl = mc.toDataURL();
        }
      }
      rebuilt.push(L);
      maxId = Math.max(maxId, m.id || 0);
    }
    if (!rebuilt.length) {
      initPaint();
      return;
    }
    set(layers, rebuilt, true);
    nextLayerNum = maxId;
    set(activeIndex, Math.min(Math.max(0, doc.active_index ?? 0), rebuilt.length - 1), true);
    set(selectedIds, [get(layers)[get(activeIndex)].id], true);
    set(
      history2,
      [
        {
          label: "Open",
          layers: [...get(layers)],
          activeIndex: get(activeIndex),
          selectedIds: [...get(selectedIds)],
          url: get(sourceUrl),
          w: get(width),
          h: get(height)
        }
      ],
      true
    );
    set(histIndex, 0);
    requestAnimationFrame(() => loadActiveBitmap());
  }
  function encodeImageData(imageData) {
    const c = document.createElement("canvas");
    c.width = imageData.width;
    c.height = imageData.height;
    c.getContext("2d").putImageData(imageData, 0, 0);
    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }
  function packLayerDoc(force = false) {
    flushActive();
    if (!force && get(
      layers
      // a single layer IS the flat PNG — unless we're forcing a sidecar-only "Save edits"
    ).length <= 1) return null;
    const planes = [];
    const manifestLayers = get(layers).map((L) => {
      let bitmap = L.bitmap;
      if (!bitmap && L.isBackground && imgEl) {
        const c = document.createElement("canvas");
        c.width = get(width);
        c.height = get(height);
        const cx = c.getContext("2d");
        cx.drawImage(imgEl, 0, 0, get(width), get(height));
        bitmap = cx.getImageData(0, 0, get(width), get(height));
      }
      const m = {
        id: L.id,
        name: L.name,
        visible: L.visible,
        opacity: L.opacity
      };
      if (L.blend) m.blend = L.blend;
      if (L.ox) m.ox = L.ox;
      if (L.oy) m.oy = L.oy;
      if (L.isBackground) m.is_background = true;
      if (L.sourceRect) m.source_rect = L.sourceRect;
      if (bitmap) {
        const name = `L${L.id}.png`;
        m.bitmap = name;
        planes.push({ name, data: bitmap });
      } else m.bitmap = null;
      if (L.mask) {
        const name = `L${L.id}.mask.png`;
        m.mask = name;
        planes.push({ name, data: L.mask });
      }
      return m;
    });
    return {
      manifest: {
        v: 1,
        image_hash: "",
        w: get(width),
        h: get(height),
        active_index: get(activeIndex),
        layers: manifestLayers
      },
      planes
    };
  }
  async function persistDoc(hash, packed) {
    if (!hash || !packed || !fetchApi()) return false;
    try {
      const form = new FormData();
      packed.manifest.image_hash = hash;
      form.append("manifest", JSON.stringify(packed.manifest));
      for (const { name, data } of packed.planes) {
        const blob = await encodeImageData(data);
        if (blob) form.append(name, new File([blob], name, { type: "image/png" }));
      }
      const res = await fetchApi()(`/promptchain/edit-doc/${hash}`, { method: "POST", body: form });
      return !!(res == null ? void 0 : res.ok);
    } catch (e) {
      console.warn("[PromptChain] edit-doc persist failed", e);
      return false;
    }
  }
  async function clearDoc(hash) {
    if (!hash || !fetchApi()) return;
    try {
      await fetchApi()(`/promptchain/edit-doc/${hash}`, { method: "DELETE" });
    } catch (e) {
    }
  }
  const activeLayer = () => get(layers)[get(activeIndex)] || get(layers)[0];
  let hiddenEditDialog = state(
    null
    // PS "target layer is hidden" modal text, or null
  );
  const HIDDEN_EDIT_MSG = {
    brush: "Could not use the brush tool because the target layer is hidden.",
    eraser: "Could not use the eraser because the target layer is hidden.",
    bucket: "Could not use the paint bucket because the target layer is hidden.",
    smooth: "Could not use the blur tool because the target layer is hidden.",
    spot: "Could not use the spot healing brush because the target layer is hidden.",
    heal: "Could not use the healing brush because the target layer is hidden.",
    stamp: "Could not use the clone stamp because the target layer is hidden.",
    liquify: "Could not complete the Liquify command because the target layer is hidden.",
    move: "Could not use the move tool because the target layer is hidden.",
    adjust: "Could not complete the Camera Raw Filter command because the target layer is hidden.",
    transform: "Could not complete the Free Transform command because the target layer is hidden.",
    fill: "Could not complete the Fill command because the target layer is hidden.",
    clear: "Could not complete your request because the target layer is hidden."
  };
  function blockHiddenEdit(opKey) {
    var _a;
    if (((_a = activeLayer()) == null ? void 0 : _a.visible) !== false) return false;
    set(hiddenEditDialog, HIDDEN_EDIT_MSG[opKey] || HIDDEN_EDIT_MSG.clear, true);
    return true;
  }
  function activeMaskedCanvas() {
    const L = activeLayer();
    if (!(L == null ? void 0 : L.mask)) return paintCanvas;
    const t = document.createElement("canvas");
    t.width = get(width);
    t.height = get(height);
    const tctx = t.getContext("2d");
    tctx.drawImage(paintCanvas, 0, 0);
    const m = document.createElement("canvas");
    m.width = get(width);
    m.height = get(height);
    m.getContext("2d").putImageData(L.mask, 0, 0);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(m, L.ox || 0, L.oy || 0);
    tctx.globalCompositeOperation = "source-over";
    return t;
  }
  const maskedRenderCache = /* @__PURE__ */ new WeakMap();
  function maskedRenderCanvas(L) {
    let c = maskedRenderCache.get(L);
    if (c && c.width === get(width) && c.height === get(height)) return c;
    c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    const ctx = c.getContext("2d");
    const ox = L.ox || 0, oy = L.oy || 0;
    if (L.bitmap && L.bitmap.width === get(width) && L.bitmap.height === get(height)) {
      const t = document.createElement("canvas");
      t.width = get(width);
      t.height = get(height);
      t.getContext("2d").putImageData(L.bitmap, 0, 0);
      ctx.drawImage(t, ox, oy);
    } else if (L.isBackground && imgEl) {
      ctx.drawImage(imgEl, ox, oy, get(width), get(height));
    }
    if (L.mask && L.mask.width === get(width) && L.mask.height === get(height)) {
      const m = document.createElement("canvas");
      m.width = get(width);
      m.height = get(height);
      m.getContext("2d").putImageData(L.mask, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(m, ox, oy);
      ctx.globalCompositeOperation = "source-over";
    }
    maskedRenderCache.set(L, c);
    return c;
  }
  function drawLayerRaw(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh) {
    const ox = L.ox || 0, oy = L.oy || 0;
    if (L.bitmap && L.bitmap.width === get(width) && L.bitmap.height === get(height)) {
      const t = document.createElement("canvas");
      t.width = get(width);
      t.height = get(height);
      t.getContext("2d").putImageData(L.bitmap, 0, 0);
      ctx.drawImage(t, sx, sy, sw, sh, dx + ox, dy + oy, dw, dh);
    } else if (L.isBackground && imgEl) {
      ctx.drawImage(imgEl, sx, sy, sw, sh, dx + ox, dy + oy, dw, dh);
    }
  }
  function drawLayerContent(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (L.mask) {
      ctx.drawImage(maskedRenderCanvas(L), sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    drawLayerRaw(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  function flushActive() {
    if (!paintCanvas || !get(layers)[get(activeIndex)]) return;
    const L = get(layers)[get(activeIndex)];
    const ox = L.ox || 0, oy = L.oy || 0;
    if (!ox && !oy) {
      get(layers)[get(activeIndex)] = {
        ...L,
        bitmap: paintCanvas.getContext("2d").getImageData(0, 0, get(width), get(height))
      };
      return;
    }
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    const cx = c.getContext("2d");
    if (L.bitmap) cx.putImageData(L.bitmap, 0, 0);
    cx.clearRect(-ox, -oy, get(width), get(height));
    cx.drawImage(paintCanvas, -ox, -oy);
    get(layers)[get(activeIndex)] = {
      ...L,
      bitmap: cx.getImageData(0, 0, get(width), get(height))
    };
  }
  function loadActiveBitmap() {
    const ctx = paintCanvas == null ? void 0 : paintCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, get(width), get(height));
    const L = get(layers)[get(activeIndex)];
    if (L) drawLayerRaw(ctx, L, 0, 0, get(width), get(height), 0, 0, get(width), get(height));
  }
  function selectLayer(i) {
    if (i < 0 || i >= get(layers).length || painting) return;
    if (i !== get(activeIndex)) {
      flushActive();
      set(activeIndex, i, true);
      loadActiveBitmap();
    }
  }
  function clickLayer(i, e) {
    const id = get(layers)[i].id;
    if ((e.ctrlKey || e.metaKey) && get(selectedIds).length) {
      set(selectedIds, get(selectedIds).includes(id) ? get(selectedIds) : [...get(selectedIds), id], true);
    } else if (e.shiftKey && get(selectedIds).length) {
      const lo = Math.min(get(activeIndex), i), hi = Math.max(get(activeIndex), i);
      set(selectedIds, get(layers).slice(lo, hi + 1).map((L) => L.id), true);
    } else {
      set(selectedIds, [id], true);
    }
    selectLayer(i);
    if (!get(selectedIds).includes(id)) set(selectedIds, [...get(selectedIds), id], true);
  }
  function addLayer(at = get(activeIndex)) {
    if (painting) return;
    flushActive();
    const id = ++nextLayerNum;
    set(
      layers,
      [
        ...get(layers).slice(0, at + 1),
        {
          id,
          name: `Layer ${id}`,
          visible: true,
          opacity: 1,
          bitmap: null
        },
        ...get(layers).slice(at + 1)
      ],
      true
    );
    set(activeIndex, at + 1);
    set(selectedIds, [id], true);
    loadActiveBitmap();
  }
  function canDeleteSelected() {
    return get(layers).length > 1 && get(layers).some((L) => get(selectedIds).includes(L.id) && !L.isBackground);
  }
  function deleteSelectedLayers() {
    var _a, _b;
    if (painting) return;
    const doomedIds = new Set(get(layers).filter((L) => get(selectedIds).includes(L.id) && !L.isBackground).map((L) => L.id));
    if (!doomedIds.size || get(layers).length - doomedIds.size < 1) return;
    const activeId = (_a = get(layers)[get(activeIndex)]) == null ? void 0 : _a.id;
    if (!doomedIds.has(activeId)) flushActive();
    let na = 0;
    for (let k = 0; k < get(
      activeIndex
      // survivors below the old active
    ); k++) if (!doomedIds.has(get(layers)[k].id)) na++;
    const survivors = get(layers).filter((L) => !doomedIds.has(L.id));
    set(layers, survivors, true);
    set(activeIndex, Math.min(na, survivors.length - 1), true);
    set(selectedIds, [(_b = get(layers)[get(activeIndex)]) == null ? void 0 : _b.id].filter((x) => x != null), true);
    loadActiveBitmap();
    commitAction(doomedIds.size > 1 ? "Delete Layers" : "Delete Layer");
  }
  function duplicateLayer(i) {
    if (painting) return;
    flushActive();
    const src = get(layers)[i];
    const id = ++nextLayerNum;
    let bitmap = src.bitmap;
    if (!bitmap && src.isBackground && imgEl) {
      const c = document.createElement("canvas");
      c.width = get(width);
      c.height = get(height);
      c.getContext("2d").drawImage(imgEl, 0, 0, get(width), get(height));
      bitmap = c.getContext("2d").getImageData(0, 0, get(width), get(height));
    }
    set(
      layers,
      [
        ...get(layers).slice(0, i + 1),
        {
          id,
          name: `${src.name} copy`,
          visible: true,
          opacity: src.opacity,
          blend: src.blend,
          ox: src.ox,
          oy: src.oy,
          mask: src.mask,
          maskUrl: src.maskUrl,
          sourceRect: src.sourceRect,
          bitmap
        },
        ...get(layers).slice(i + 1)
      ],
      true
    );
    set(activeIndex, i + 1);
    set(selectedIds, [id], true);
    loadActiveBitmap();
    commitAction("Duplicate Layer");
  }
  function setLayerVisible(i, v) {
    get(layers)[i] = { ...get(layers)[i], visible: v };
  }
  function setLayerOpacity(i, o) {
    get(layers)[i] = { ...get(layers)[i], opacity: o };
  }
  const BLEND_MODES = [
    ["normal", "Normal"],
    ["multiply", "Multiply"],
    ["screen", "Screen"],
    ["overlay", "Overlay"],
    ["darken", "Darken"],
    ["lighten", "Lighten"],
    ["color-dodge", "Color Dodge"],
    ["color-burn", "Color Burn"],
    ["hard-light", "Hard Light"],
    ["soft-light", "Soft Light"],
    ["difference", "Difference"],
    ["exclusion", "Exclusion"],
    ["hue", "Hue"],
    ["saturation", "Saturation"],
    ["color", "Color"],
    ["luminosity", "Luminosity"]
  ];
  const layerBlendCss = (L) => (L == null ? void 0 : L.blend) && L.blend !== "normal" ? L.blend : null;
  function setLayerBlend(i, blend) {
    get(layers)[i] = {
      ...get(layers)[i],
      blend: blend === "normal" ? void 0 : blend
    };
    commitAction("Blend Mode");
  }
  function addLayerMask(i) {
    const L0 = get(layers)[i];
    if (!L0 || L0.isBackground) return;
    if (i === get(activeIndex)) flushActive();
    const L = get(
      layers
      // flush replaced the object
    )[i];
    const ox = L.ox || 0, oy = L.oy || 0;
    const m = document.createElement("canvas");
    m.width = get(width);
    m.height = get(height);
    const mctx = m.getContext("2d");
    if (get(selActive) && selMaskCanvas) {
      mctx.drawImage(selMaskCanvas, -ox, -oy);
    } else {
      mctx.fillStyle = "#fff";
      mctx.fillRect(
        0,
        0,
        // reveal all
        get(width),
        get(height)
      );
    }
    get(layers)[i] = {
      ...L,
      mask: mctx.getImageData(0, 0, get(width), get(height)),
      maskUrl: m.toDataURL()
    };
    if (get(
      selActive
      // PS consumes the selection into the mask
    )) deselect();
    commitAction("Add Layer Mask");
  }
  function applyLayerMask(i) {
    if (i === get(activeIndex)) flushActive();
    const L = get(layers)[i];
    if (!(L == null ? void 0 : L.mask)) return;
    const t = document.createElement("canvas");
    t.width = get(width);
    t.height = get(height);
    const tctx = t.getContext("2d");
    if (L.bitmap) tctx.putImageData(L.bitmap, 0, 0);
    const m = document.createElement("canvas");
    m.width = get(width);
    m.height = get(height);
    m.getContext("2d").putImageData(L.mask, 0, 0);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(m, 0, 0);
    tctx.globalCompositeOperation = "source-over";
    get(layers)[i] = {
      ...L,
      bitmap: tctx.getImageData(0, 0, get(width), get(height)),
      mask: void 0,
      maskUrl: void 0
    };
    if (i === get(activeIndex)) loadActiveBitmap();
    commitAction("Apply Layer Mask");
  }
  function deleteLayerMask(i) {
    var _a;
    if (!((_a = get(layers)[i]) == null ? void 0 : _a.mask)) return;
    get(layers)[i] = { ...get(layers)[i], mask: void 0, maskUrl: void 0 };
    commitAction("Delete Layer Mask");
  }
  function startRename(L) {
    set(renamingId, L.id, true);
    set(renameText, L.name, true);
  }
  function commitRename() {
    const i = get(layers).findIndex((L) => L.id === get(renamingId));
    const name = get(renameText).trim();
    if (i >= 0 && name && name !== get(layers)[i].name) get(layers)[i] = { ...get(layers)[i], name };
    set(renamingId, null);
  }
  function dropLayer(targetId) {
    set(dragOverId, null);
    if (dragId == null || dragId === targetId) {
      dragId = null;
      return;
    }
    const moved = get(layers).find((L) => L.id === dragId);
    if (!moved || moved.isBackground) {
      dragId = null;
      return;
    }
    flushActive();
    const activeId = get(layers)[get(activeIndex)].id;
    const rest = get(layers).filter((L) => L.id !== dragId);
    const ti = rest.findIndex((L) => L.id === targetId);
    let at = ti < 0 ? rest.length : ti + 1;
    if (at < 1) at = 1;
    rest.splice(at, 0, moved);
    set(layers, rest, true);
    set(activeIndex, get(layers).findIndex((L) => L.id === activeId), true);
    dragId = null;
  }
  function compositeLayers(idxs) {
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    const ctx = c.getContext("2d");
    for (const i of idxs) {
      const L = get(layers)[i];
      if (!L.visible) continue;
      ctx.globalAlpha = L.opacity;
      ctx.globalCompositeOperation = layerBlendCss(L) || "source-over";
      if (i === get(activeIndex)) ctx.drawImage(activeMaskedCanvas(), 0, 0);
      else drawLayerContent(ctx, L, 0, 0, get(width), get(height), 0, 0, get(width), get(height));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    return ctx.getImageData(0, 0, get(width), get(height));
  }
  function mergeSelected() {
    if (painting) return;
    const ids = get(selectedIds).length > 1 ? get(selectedIds) : null;
    if (!ids) return;
    flushActive();
    const idxs = ids.map((id) => get(layers).findIndex((L) => L.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (idxs.length < 2) return;
    const lo = idxs[0];
    const hasBg = idxs.some((i) => get(layers)[i].isBackground);
    const bitmap = compositeLayers(idxs);
    const merged = {
      id: hasBg ? 0 : ++nextLayerNum,
      name: hasBg ? "Background" : get(layers)[lo].name,
      visible: true,
      opacity: 1,
      bitmap,
      isBackground: hasBg || void 0
    };
    const keptBelow = get(layers).filter((L, i) => i < lo && !idxs.includes(i)).length;
    const rest = get(layers).filter((_, i) => !idxs.includes(i));
    rest.splice(keptBelow, 0, merged);
    set(layers, rest, true);
    set(activeIndex, get(layers).findIndex((L) => L.id === merged.id), true);
    set(selectedIds, [merged.id], true);
    loadActiveBitmap();
    commitAction("Merge Layers");
  }
  function mergeDown(i) {
    if (painting || i <= 0) return;
    set(selectedIds, [get(layers)[i].id, get(layers)[i - 1].id], true);
    mergeSelected();
  }
  function flattenImage() {
    if (painting) return;
    flushActive();
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    drawFlattened(c.getContext("2d"), 0, 0, get(width), get(height), 0, 0, get(width), get(height));
    set(
      layers,
      [
        {
          id: 0,
          name: "Background",
          visible: true,
          opacity: 1,
          bitmap: c.getContext("2d").getImageData(0, 0, get(width), get(height)),
          isBackground: true
        }
      ],
      true
    );
    set(activeIndex, 0);
    set(selectedIds, [0], true);
    loadActiveBitmap();
    commitAction("Flatten Image");
  }
  user_effect(() => {
    if (!get(layerMenu) && !get(canvasMenu)) return;
    const close2 = (e) => {
      var _a, _b;
      if (!((_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".pcr-ed-layer-menu"))) {
        set(layerMenu, null);
        set(canvasMenu, null);
      }
    };
    window.addEventListener("pointerdown", close2, true);
    return () => window.removeEventListener("pointerdown", close2, true);
  });
  function drawBackdrop(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
    for (let k = 0; k < get(activeIndex); k++) {
      const L = get(layers)[k];
      if (!L.visible) continue;
      ctx.globalAlpha = L.opacity;
      ctx.globalCompositeOperation = layerBlendCss(L) || "source-over";
      drawLayerContent(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }
  function drawFlattened(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
    for (let k = 0; k < get(layers).length; k++) {
      const L = get(layers)[k];
      if (!L.visible) continue;
      ctx.globalAlpha = L.opacity;
      ctx.globalCompositeOperation = layerBlendCss(L) || "source-over";
      if (k === get(activeIndex)) ctx.drawImage(activeMaskedCanvas(), sx, sy, sw, sh, dx, dy, dw, dh);
      else drawLayerContent(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }
  function backdropCanvas() {
    const c = document.createElement("canvas");
    c.width = get(width);
    c.height = get(height);
    drawBackdrop(c.getContext("2d"), 0, 0, get(width), get(height), 0, 0, get(width), get(height));
    return c;
  }
  user_effect(() => {
    get(
      imgLoadTick
      // redraw the Background when the source <img> loads
    );
    if (belowCanvasEl) {
      if (belowCanvasEl.width !== get(width)) belowCanvasEl.width = get(width);
      if (belowCanvasEl.height !== get(height)) belowCanvasEl.height = get(height);
      const bctx = belowCanvasEl.getContext("2d");
      bctx.clearRect(0, 0, get(width), get(height));
      drawBackdrop(bctx, 0, 0, get(width), get(height), 0, 0, get(width), get(height));
    }
    for (let i = get(activeIndex) + 1; i < get(layers).length; i++) {
      const el = get(layerCanvasEls)[i];
      if (!el) continue;
      if (el.width !== get(width)) el.width = get(width);
      if (el.height !== get(height)) el.height = get(height);
      const ctx = el.getContext("2d");
      ctx.clearRect(0, 0, get(width), get(height));
      drawLayerContent(ctx, get(layers)[i], 0, 0, get(width), get(height), 0, 0, get(width), get(height));
    }
  });
  function clearAll() {
    if (get(histIndex) === 0 && get(history2).length === 1) return;
    set(patch, null);
    set(selRect, null);
    paintCanvas.getContext("2d").clearRect(0, 0, get(width), get(height));
    commitAction("Clear");
  }
  let sampleCtx = null;
  function samplePixel(pt) {
    const s = get(sampleSize);
    const x = Math.max(0, Math.min(get(width) - s, Math.round(pt.x) - (s - 1) / 2));
    const y = Math.max(0, Math.min(get(height) - s, Math.round(pt.y) - (s - 1) / 2));
    if (!sampleCtx || sampleCtx.canvas.width < s) {
      const c = document.createElement("canvas");
      c.width = 5;
      c.height = 5;
      sampleCtx = c.getContext("2d", { willReadFrequently: true });
    }
    try {
      sampleCtx.clearRect(0, 0, s, s);
      drawFlattened(sampleCtx, x, y, s, s, 0, 0, s, s);
      const d = sampleCtx.getImageData(0, 0, s, s).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < s * s; i++) {
        sum[0] += d[i * 4];
        sum[1] += d[i * 4 + 1];
        sum[2] += d[i * 4 + 2];
      }
      return sum.map((v) => Math.round(v / (s * s)));
    } catch (e) {
      console.warn("[PromptChain] eyedrop failed", e);
      return null;
    }
  }
  function updatePickPreview(e) {
    const sampled = samplePixel(toImageCoords(e));
    if (!sampled) return;
    pickRgb = sampled;
    const rect = viewportEl.getBoundingClientRect();
    set(
      pickPreview,
      {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        hex: rgbToHex(sampled)
      },
      true
    );
  }
  async function screenEyedrop() {
    if (!window.EyeDropper) return;
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const n = parseInt(sRGBHex.slice(1), 16);
      setColorFromRgb(n >> 16 & 255, n >> 8 & 255, n & 255);
      if (get(tool) === "eyedrop") set(tool, "brush");
    } catch {
    }
  }
  function onPointerDown(e) {
    var _a;
    if (e.button > 2) return;
    if (e.button === 1 || e.button === 2 || e.shiftKey && !get(
      isSelTool
      // Shift adds to a selection / snaps a transform rotation — doesn't pan
    ) && !get(transforming)) {
      panning = true;
      lastPt = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      viewportEl.setPointerCapture(e.pointerId);
      if (e.button === 2) {
        window.addEventListener("contextmenu", (ev) => ev.preventDefault(), { capture: true, once: true });
        rightDownAt = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    if (e.button !== 0 || get(saving)) return;
    e.preventDefault();
    const pt = toImageCoords(e);
    if (get(transforming)) {
      if (inRotateZone(pt)) {
        const cx = get(patch).x + get(patch).w / 2, cy = get(patch).y + get(patch).h / 2;
        patchDrag = {
          mode: "rot",
          viaViewport: true,
          startX: e.clientX,
          startY: e.clientY,
          orig: { ...get(patch) },
          grabAngle: Math.atan2(pt.y - cy, pt.x - cx) - (get(patch).rot || 0)
        };
        viewportEl.setPointerCapture(e.pointerId);
        return;
      }
      commitPatch();
      return;
    }
    if (((_a = activeLayer()) == null ? void 0 : _a.visible) === false) {
      const moveGesture = get(tool) === "move" || (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      const sampling = get(tool) === "eyedrop" || get(colorPopout) || e.altKey && !get(isSelTool);
      if (moveGesture || !(get(isSelTool) || get(tool) === "crop" || sampling)) {
        blockHiddenEdit(moveGesture ? "move" : get(tool));
        return;
      }
    }
    if (get(tool) === "move" || (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      if (startMove(e)) viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if ((get(tool) === "heal" || get(tool) === "stamp") && e.altKey) {
      set(healSource, { x: pt.x, y: pt.y }, true);
      set(errorMsg, "");
      return;
    }
    if (e.altKey && !get(
      isSelTool
      // Alt subtracts from a selection, doesn't pick
    ) || get(tool) === "eyedrop" || get(colorPopout)) {
      picking = true;
      updatePickPreview(e);
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (get(tool) === "liquify") {
      ensureLiqSession();
      if (!liqSrc) return;
      liqStroking = true;
      liqStrokeDirty = false;
      liqResidual = 0;
      liqLastStamp = pt;
      lastPt = pt;
      if (get(liqTool) === "bloat" || get(liqTool) === "pucker" || get(liqTool) === "twirl") {
        liqRafLast = performance.now();
        liqRafId = requestAnimationFrame(liqHoldLoop);
      } else if (get(liqTool) === "reconstruct") {
        liqStampReconstruct(pt.x, pt.y);
        renderLiqBatch();
      }
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (get(tool) === "crop") {
      cropDrawStart = pt;
      set(cropDragging, true);
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (get(tool) === "objsel") {
      const op = e.shiftKey && e.altKey ? "intersect" : e.shiftKey ? "add" : e.altKey ? "subtract" : "replace";
      selectObjectAt(pt, op);
      return;
    }
    if (get(tool) === "select") {
      const op = e.shiftKey && e.altKey ? "intersect" : e.shiftKey ? "add" : e.altKey ? "subtract" : "replace";
      if (op === "replace" && get(selActive) && pointInSelection(pt)) {
        selMove = {
          orig: copyMaskCanvas(),
          origBBox: selBBox,
          startX: e.clientX,
          startY: e.clientY
        };
        viewportEl.setPointerCapture(e.pointerId);
        return;
      }
      selecting = true;
      selStart = pt;
      set(selRect, { x: pt.x, y: pt.y, w: 0, h: 0 }, true);
      selOp = op;
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (get(tool) === "smooth" || get(tool) === "lasso") {
      const op = e.shiftKey && e.altKey ? "intersect" : e.shiftKey ? "add" : e.altKey ? "subtract" : "replace";
      if (get(tool) === "lasso" && op === "replace" && get(selActive) && pointInSelection(pt)) {
        selMove = {
          orig: copyMaskCanvas(),
          origBBox: selBBox,
          startX: e.clientX,
          startY: e.clientY
        };
        viewportEl.setPointerCapture(e.pointerId);
        return;
      }
      lassoing = true;
      set(lassoPts, [pt], true);
      if (get(tool) === "lasso") selOp = op;
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (get(tool) === "bucket") {
      floodFill(pt);
      return;
    }
    if ((get(tool) === "heal" || get(tool) === "stamp") && !get(healSource)) {
      set(healDialog, true);
      return;
    }
    if (get(tool) === "heal" || get(tool) === "stamp") {
      set(
        healStrokeOffset,
        {
          dx: Math.round(get(healSource).x - pt.x),
          dy: Math.round(get(healSource).y - pt.y)
        },
        true
      );
    }
    if (isHealTool() || get(tool) === "stamp") set(healPaintingUi, true);
    painting = true;
    strokeResidual = 0;
    beginStroke();
    lastPt = pt;
    stampSegment(pt, pt);
    if (get(tool) === "brush" || get(tool) === "eraser") {
      airLastTs = performance.now();
      airResidual = 0;
      airRafId = requestAnimationFrame(airbrushLoop);
    }
    viewportEl.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    set(
      cursorPos,
      (() => {
        const rect = viewportEl == null ? void 0 : viewportEl.getBoundingClientRect();
        return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null;
      })(),
      true
    );
    if (patchDrag == null ? void 0 : patchDrag.viaViewport) {
      patchPointerMove(e);
      return;
    }
    if (get(transforming)) set(overRotateZone, inRotateZone(toImageCoords(e)), true);
    if (panning) {
      set(panX, get(panX) + (e.clientX - lastPt.x));
      set(panY, get(panY) + (e.clientY - lastPt.y));
      lastPt = { x: e.clientX, y: e.clientY };
      return;
    }
    if (moveFloat) {
      updateMove(e);
      return;
    }
    if (picking) {
      updatePickPreview(e);
      return;
    }
    if (liqStroking) {
      const pt = toImageCoords(e);
      if (get(liqTool) === "warp" || get(liqTool) === "reconstruct") liqDragStamps(pt);
      lastPt = pt;
      return;
    }
    if (cropDrawStart) {
      const box = normalizedRect(cropDrawStart, toImageCoords(e));
      const r = cropRatioValue() || (e.shiftKey ? null : null);
      if (r && box.w > 0 && box.h > 0) {
        if (box.w / box.h > r) box.w = box.h * r;
        else box.h = box.w / r;
      }
      set(cropBox, box, true);
      return;
    }
    if (selMove) {
      set(
        selDragDxy,
        {
          dx: Math.round((e.clientX - selMove.startX) / get(zoom)),
          dy: Math.round((e.clientY - selMove.startY) / get(zoom))
        },
        true
      );
      return;
    }
    if (selecting) {
      set(selRect, normalizedRect(selStart, toImageCoords(e)), true);
      return;
    }
    if (lassoing) {
      const pt = toImageCoords(e);
      const last = get(lassoPts)[get(lassoPts).length - 1];
      if (Math.hypot(pt.x - last.x, pt.y - last.y) > 1.5) set(lassoPts, [...get(lassoPts), pt], true);
      return;
    }
    if (painting) {
      const pt = toImageCoords(e);
      stampSegment(lastPt, pt);
      lastPt = pt;
    }
  }
  function onPointerUp(e) {
    if (patchDrag == null ? void 0 : patchDrag.viaViewport) {
      patchPointerUp();
      return;
    }
    if (moveFloat) {
      endMove();
      return;
    }
    if (liqStroking) {
      liqStroking = false;
      cancelAnimationFrame(liqRafId);
      lastPt = null;
      if (liqStrokeDirty) {
        commitAction("Liquify");
        liqStrokeDirty = false;
      }
      return;
    }
    if (cropDrawStart) {
      cropDrawStart = null;
      set(cropDragging, false);
      if (!get(cropBox) || get(cropBox).w < 8 || get(cropBox).h < 8) resetCropBox();
    }
    if (picking) {
      picking = false;
      if (pickRgb) setColorFromRgb(...pickRgb);
      pickRgb = null;
      set(pickPreview, null);
      if (get(
        tool
        // pick once, back to brush
      ) === "eyedrop" && !(e == null ? void 0 : e.altKey)) set(tool, "brush");
    }
    if (selMove) {
      if (get(selDragDxy)) translateSelMask(selMove.orig, selMove.origBBox, get(selDragDxy).dx, get(selDragDxy).dy);
      set(selDragDxy, null);
      selMove = null;
      return;
    }
    if (selecting) {
      selecting = false;
      if (get(selRect) && get(selRect).w >= 1 && get(selRect).h >= 1) {
        applySelectionShape(
          {
            type: "rect",
            x: get(selRect).x,
            y: get(selRect).y,
            w: get(selRect).w,
            h: get(selRect).h
          },
          selOp
        );
      } else if (selOp === "replace") {
        deselect();
      }
      set(selRect, null);
      return;
    }
    if (lassoing) {
      lassoing = false;
      if (get(tool) === "lasso") {
        if (get(lassoPts) && get(lassoPts).length >= 3) applySelectionShape({ type: "lasso", pts: get(lassoPts) }, selOp);
        else if (selOp === "replace") deselect();
      } else if (get(lassoPts) && get(lassoPts).length >= 3) {
        applySmooth(get(
          lassoPts
          // smooth tool still applies immediately
        ));
      }
      set(lassoPts, null);
      return;
    }
    if (painting) {
      cancelAnimationFrame(airRafId);
      if (isHealTool()) runHeal();
      else commitAction(get(tool) === "eraser" ? "Eraser" : get(tool) === "stamp" ? "Stamp" : "Brush");
    }
    painting = false;
    set(healPaintingUi, false);
    set(healStrokeOffset, null);
    if (panning && e.button === 2 && rightDownAt && Math.hypot(e.clientX - rightDownAt.x, e.clientY - rightDownAt.y) < 4) {
      set(canvasMenu, { x: e.clientX, y: e.clientY }, true);
    }
    rightDownAt = null;
    panning = false;
    lastPt = null;
  }
  function svDrag(e) {
    const el = e.currentTarget;
    const apply = (ev) => {
      const rect = el.getBoundingClientRect();
      set(sat, Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)), true);
      set(val, Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height)), true);
    };
    apply(e);
    el.setPointerCapture(e.pointerId);
    const move = (ev) => apply(ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }
  function hueDrag(e) {
    const el = e.currentTarget;
    const apply = (ev) => {
      const rect = el.getBoundingClientRect();
      set(hue, Math.max(0, Math.min(359.9, (ev.clientX - rect.left) / rect.width * 360)), true);
    };
    apply(e);
    el.setPointerCapture(e.pointerId);
    const move = (ev) => apply(ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }
  async function exportComposite() {
    const out = document.createElement("canvas");
    out.width = get(width);
    out.height = get(height);
    flushActive();
    const ctx = out.getContext("2d");
    drawFlattened(ctx, 0, 0, get(width), get(height), 0, 0, get(width), get(height));
    return new Promise((resolve) => out.toBlob(resolve, "image/png"));
  }
  async function save() {
    var _a;
    commitPatch();
    if (!onSave() || !get(histIndex) || get(saving)) return;
    set(saving, true);
    set(errorMsg, "");
    try {
      const blob = await exportComposite();
      if (!blob) throw new Error("export produced no image");
      const packed = packLayerDoc();
      const entry = await onSave()(blob, get(savePrefix).trim());
      if (entry) {
        close();
        (_a = onSaved()) == null ? void 0 : _a(entry);
        if (packed) persistDoc(entry.hash, packed);
        else
          clearDoc(entry.hash);
      } else {
        set(errorMsg, "save failed — see console");
      }
    } catch (e) {
      set(errorMsg, e.message || "save failed", true);
    } finally {
      set(saving, false);
    }
  }
  async function saveEdits() {
    commitPatch();
    if (!editDocHash() || !fetchApi() || !get(histIndex) || get(savingEdits) || get(saving)) return;
    set(savingEdits, true);
    set(errorMsg, "");
    try {
      const packed = packLayerDoc(true);
      if (!packed) {
        set(errorMsg, "nothing to save yet");
        return;
      }
      if (await persistDoc(editDocHash(), packed)) {
        set(editsSaved, true);
        window.dispatchEvent(new CustomEvent("promptchain:edit-docs-changed"));
      } else {
        set(errorMsg, "couldn't save edits — the server may need a restart");
      }
    } catch (e) {
      set(errorMsg, `Save edits failed: ${(e == null ? void 0 : e.message) || e}`);
    } finally {
      set(savingEdits, false);
    }
  }
  function close() {
    var _a;
    (_a = $$props.onCancel) == null ? void 0 : _a.call($$props);
  }
  var $$exports = {
    addLayerFromResult,
    addUpscaledLayerFromResult,
    applyCanvasUpscale
  };
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent_60 = ($$anchor2) => {
      var div = root_1$3();
      var div_1 = child(div);
      let classes;
      var div_2 = child(div_1);
      var span = child(div_2);
      var span_1 = sibling(child(span));
      var text = child(span_1);
      var node_1 = sibling(span_1);
      {
        var consequent = ($$anchor3) => {
          var span_2 = root_2$3();
          var text_1 = child(span_2);
          template_effect(() => set_text(text_1, `${get(width) ?? ""}×${get(height) ?? ""}`));
          append($$anchor3, span_2);
        };
        if_block(node_1, ($$render) => {
          if (get(width) && get(height)) $$render(consequent);
        });
      }
      var div_3 = sibling(span, 2);
      var button = child(div_3);
      var node_2 = child(button);
      {
        var consequent_1 = ($$anchor3) => {
          var svg_1 = root_3$2();
          append($$anchor3, svg_1);
        };
        var alternate = ($$anchor3) => {
          var svg_2 = root_4$3();
          append($$anchor3, svg_2);
        };
        if_block(node_2, ($$render) => {
          if (get(maximized)) $$render(consequent_1);
          else $$render(alternate, -1);
        });
      }
      var button_1 = sibling(button, 2);
      var node_3 = sibling(div_2, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_4 = root_5$3();
          var div_5 = child(div_4);
          var span_3 = sibling(child(div_5), 2);
          var text_2 = child(span_3);
          template_effect(() => set_text(text_2, get(restoring) ? "Restoring saved layers…" : get(handoffBusy) === "upscale" ? "Preparing upscale…" : get(handoffBusy) === "repose" ? "Preparing Re-pose…" : "Preparing inpaint…"));
          append($$anchor3, div_4);
        };
        if_block(node_3, ($$render) => {
          if (get(restoring) || get(handoffBusy)) $$render(consequent_2);
        });
      }
      var div_6 = sibling(node_3, 2);
      var div_7 = child(div_6);
      var node_4 = child(div_7);
      {
        var consequent_3 = ($$anchor3) => {
          var fragment_1 = root_6$2();
          var button_2 = sibling(first_child(fragment_1), 2);
          var button_3 = sibling(button_2, 2);
          var span_4 = sibling(button_3, 2);
          var text_3 = child(span_4);
          var button_4 = sibling(span_4, 2);
          var button_5 = sibling(button_4, 2);
          template_effect(($0) => set_text(text_3, `${$0 ?? ""}°`), [
            () => Math.round(((get(patch).rot || 0) * 180 / Math.PI % 360 + 360) % 360)
          ]);
          delegated("click", button_2, () => flipPatch("h"));
          delegated("click", button_3, () => flipPatch("v"));
          delegated("click", button_4, resetTransform);
          delegated("click", button_5, commitPatch);
          append($$anchor3, fragment_1);
        };
        var consequent_4 = ($$anchor3) => {
          var fragment_2 = root_7$2();
          var div_8 = first_child(fragment_2);
          var node_5 = sibling(child(div_8), 2);
          SettingsSlider(node_5, {
            min: 0,
            max: 128,
            step: 1,
            get value() {
              return get(fillTolerance);
            },
            savedValue: 32,
            onChange: (v) => {
              set(fillTolerance, v, true);
            }
          });
          var button_6 = sibling(div_8, 2);
          let classes_1;
          template_effect(() => classes_1 = set_class(button_6, 1, "pcr-ed-air-toggle pcr-ed-text-toggle svelte-1ozzqkm", null, classes_1, { active: get(fillContiguous) }));
          delegated("click", button_6, () => {
            set(fillContiguous, !get(fillContiguous));
          });
          append($$anchor3, fragment_2);
        };
        var consequent_5 = ($$anchor3) => {
          var fragment_3 = root_8$2();
          var div_9 = first_child(fragment_3);
          var node_6 = sibling(child(div_9), 2);
          SettingsSlider(node_6, {
            min: 1,
            max: 30,
            step: 1,
            get value() {
              return get(smoothBlur);
            },
            savedValue: 6,
            onChange: (v) => {
              set(smoothBlur, v, true);
            }
          });
          var div_10 = sibling(div_9, 2);
          var node_7 = sibling(child(div_10), 2);
          SettingsSlider(node_7, {
            min: 2,
            max: 60,
            step: 1,
            get value() {
              return get(smoothFeather);
            },
            savedValue: 14,
            onChange: (v) => {
              set(smoothFeather, v, true);
            }
          });
          append($$anchor3, fragment_3);
        };
        var consequent_6 = ($$anchor3) => {
          var fragment_4 = root_9$2();
          var div_11 = first_child(fragment_4);
          var node_8 = sibling(child(div_11), 2);
          SettingsSlider(node_8, {
            min: 1,
            max: 1024,
            step: 1,
            get value() {
              return get(brushSize);
            },
            savedValue: 48,
            onChange: (v) => {
              set(brushSize, v, true);
            }
          });
          var div_12 = sibling(div_11, 2);
          var node_9 = sibling(child(div_12), 2);
          SettingsSlider(node_9, {
            min: 0,
            max: 0.95,
            step: 0.05,
            get value() {
              return get(hardness);
            },
            savedValue: 0.35,
            onChange: (v) => {
              set(hardness, v, true);
            }
          });
          var div_13 = sibling(div_12, 2);
          var node_10 = sibling(child(div_13), 2);
          SettingsSlider(node_10, {
            min: 0.05,
            max: 1,
            step: 0.05,
            get value() {
              return get(opacity);
            },
            savedValue: 1,
            onChange: (v) => {
              set(opacity, v, true);
            }
          });
          var div_14 = sibling(div_13, 2);
          var node_11 = sibling(child(div_14), 2);
          SettingsSlider(node_11, {
            min: 0.02,
            max: 1,
            step: 0.01,
            get value() {
              return get(flow);
            },
            savedValue: 0.12,
            onChange: (v) => {
              set(flow, v, true);
            }
          });
          var button_7 = sibling(div_14, 2);
          let classes_2;
          template_effect(() => classes_2 = set_class(button_7, 1, "pcr-ed-air-toggle svelte-1ozzqkm", null, classes_2, { active: get(airbrush) }));
          delegated("click", button_7, () => {
            set(airbrush, !get(airbrush));
          });
          append($$anchor3, fragment_4);
        };
        var consequent_10 = ($$anchor3) => {
          var fragment_5 = root_10$2();
          var div_15 = first_child(fragment_5);
          var node_12 = sibling(child(div_15), 2);
          SettingsSlider(node_12, {
            min: 1,
            max: 256,
            step: 1,
            get value() {
              return get(brushSize);
            },
            savedValue: 48,
            onChange: (v) => {
              set(brushSize, v, true);
            }
          });
          var div_16 = sibling(div_15, 2);
          var node_13 = sibling(child(div_16), 2);
          SettingsSlider(node_13, {
            min: 0,
            max: 0.95,
            step: 0.05,
            get value() {
              return get(hardness);
            },
            savedValue: 0.35,
            onChange: (v) => {
              set(hardness, v, true);
            }
          });
          var node_14 = sibling(div_16, 2);
          {
            var consequent_7 = ($$anchor4) => {
              var fragment_6 = root_11$1();
              var div_17 = first_child(fragment_6);
              var node_15 = sibling(child(div_17), 2);
              SettingsSlider(node_15, {
                min: 0.05,
                max: 1,
                step: 0.05,
                get value() {
                  return get(opacity);
                },
                savedValue: 1,
                onChange: (v) => {
                  set(opacity, v, true);
                }
              });
              var div_18 = sibling(div_17, 2);
              var node_16 = sibling(child(div_18), 2);
              SettingsSlider(node_16, {
                min: 0.02,
                max: 1,
                step: 0.01,
                get value() {
                  return get(flow);
                },
                savedValue: 0.12,
                onChange: (v) => {
                  set(flow, v, true);
                }
              });
              append($$anchor4, fragment_6);
            };
            if_block(node_14, ($$render) => {
              if (get(tool) === "stamp") $$render(consequent_7);
            });
          }
          var node_17 = sibling(node_14, 2);
          {
            var consequent_8 = ($$anchor4) => {
              var span_5 = root_12$2();
              append($$anchor4, span_5);
            };
            var consequent_9 = ($$anchor4) => {
              var span_6 = root_13$2();
              var text_4 = child(span_6);
              template_effect(() => set_text(text_4, get(healSource) ? "paint over the flaw — texture from the source, lighting from the spot · Alt-click to re-sample" : "Alt-click a clean area to set the sample source"));
              append($$anchor4, span_6);
            };
            var alternate_1 = ($$anchor4) => {
              var span_7 = root_14$2();
              var text_5 = child(span_7);
              template_effect(() => set_text(text_5, get(healSource) ? "paint to clone source pixels exactly · Alt-click to re-sample" : "Alt-click the area to clone from, then paint"));
              append($$anchor4, span_7);
            };
            if_block(node_17, ($$render) => {
              if (get(tool) === "spot") $$render(consequent_8);
              else if (get(tool) === "heal") $$render(consequent_9, 1);
              else $$render(alternate_1, -1);
            });
          }
          append($$anchor3, fragment_5);
        };
        var consequent_12 = ($$anchor3) => {
          var fragment_7 = root_15$2();
          var div_19 = first_child(fragment_7);
          each(
            div_19,
            20,
            () => [
              ["warp", "Warp"],
              ["twirl", "Twirl ↻"],
              ["bloat", "Bloat"],
              ["pucker", "Pucker"],
              ["push", "Push Left"],
              ["reconstruct", "Reconstruct"]
            ],
            index,
            ($$anchor4, $$item) => {
              var $$array_1 = user_derived(() => to_array($$item, 2));
              let id = () => get($$array_1)[0];
              let label = () => get($$array_1)[1];
              var button_8 = root_16$2();
              let classes_3;
              var text_6 = child(button_8);
              template_effect(() => {
                classes_3 = set_class(button_8, 1, "pcr-ed-liq-opt svelte-1ozzqkm", null, classes_3, { active: get(liqTool) === id() });
                set_text(text_6, label());
              });
              delegated("click", button_8, () => {
                set(liqTool, id(), true);
              });
              append($$anchor4, button_8);
            }
          );
          var div_20 = sibling(div_19, 2);
          var node_18 = sibling(child(div_20), 2);
          SettingsSlider(node_18, {
            min: 5,
            max: 500,
            step: 1,
            get value() {
              return get(liqSize);
            },
            savedValue: 140,
            onChange: (v) => {
              set(liqSize, v, true);
            }
          });
          var div_21 = sibling(div_20, 2);
          var node_19 = sibling(child(div_21), 2);
          SettingsSlider(node_19, {
            min: 0,
            max: 100,
            step: 1,
            get value() {
              return get(liqDensity);
            },
            savedValue: 50,
            onChange: (v) => {
              set(liqDensity, v, true);
            }
          });
          var div_22 = sibling(div_21, 2);
          var node_20 = sibling(child(div_22), 2);
          SettingsSlider(node_20, {
            min: 1,
            max: 100,
            step: 1,
            get value() {
              return get(liqPressure);
            },
            savedValue: 70,
            onChange: (v) => {
              set(liqPressure, v, true);
            }
          });
          var node_21 = sibling(div_22, 2);
          {
            var consequent_11 = ($$anchor4) => {
              var div_23 = root_17$2();
              var node_22 = sibling(child(div_23), 2);
              SettingsSlider(node_22, {
                min: 1,
                max: 100,
                step: 1,
                get value() {
                  return get(liqRate);
                },
                savedValue: 60,
                onChange: (v) => {
                  set(liqRate, v, true);
                }
              });
              append($$anchor4, div_23);
            };
            if_block(node_21, ($$render) => {
              if (get(liqTool) === "bloat" || get(liqTool) === "pucker" || get(liqTool) === "twirl") $$render(consequent_11);
            });
          }
          var span_8 = sibling(node_21, 2);
          var text_7 = child(span_8);
          template_effect(() => set_text(text_7, get(liqTool) === "push" ? "drag up pushes content left, down pushes right" : get(liqTool) === "twirl" ? "hold to twirl clockwise" : "each stroke commits to History · Reconstruct un-warps · Ctrl+Z undoes a stroke"));
          append($$anchor3, fragment_7);
        };
        var consequent_13 = ($$anchor3) => {
          var fragment_8 = root_18$2();
          var div_24 = first_child(fragment_8);
          var select = sibling(child(div_24), 2);
          each(select, 21, () => CROP_RATIOS, index, ($$anchor4, cr) => {
            var option = root_19$2();
            var text_8 = child(option);
            var option_value = {};
            template_effect(() => {
              set_text(text_8, get(cr).label);
              if (option_value !== (option_value = get(cr).id)) {
                option.value = (option.__value = get(cr).id) ?? "";
              }
            });
            append($$anchor4, option);
          });
          var button_9 = sibling(select, 2);
          var button_10 = sibling(div_24, 2);
          var button_11 = sibling(button_10, 2);
          template_effect(($0) => button_10.disabled = $0, [() => !get(cropBox) || cropBoxIsFull()]);
          delegated("change", select, applyRatioToBox);
          bind_select_value(select, () => get(cropRatioId), ($$value) => set(cropRatioId, $$value));
          delegated("click", button_9, () => {
            set(cropRatioFlip, !get(cropRatioFlip));
            applyRatioToBox();
          });
          delegated("click", button_10, commitCrop);
          delegated("click", button_11, resetCropBox);
          append($$anchor3, fragment_8);
        };
        var consequent_14 = ($$anchor3) => {
          var fragment_9 = root_20$2();
          var div_25 = first_child(fragment_9);
          var node_23 = sibling(child(div_25), 2);
          SettingsSlider(node_23, {
            min: 0,
            max: 40,
            step: 1,
            get value() {
              return get(featherPx);
            },
            savedValue: 0,
            onChange: (v) => {
              set(featherPx, v, true);
            }
          });
          var div_26 = sibling(div_25, 2);
          var node_24 = sibling(child(div_26), 2);
          SettingsSlider(node_24, {
            min: 0.05,
            max: 1,
            step: 0.05,
            get value() {
              return get(patchOpacity);
            },
            savedValue: 1,
            onChange: (v) => {
              set(patchOpacity, v, true);
            }
          });
          var button_12 = sibling(div_26, 2);
          var text_9 = child(button_12);
          var node_25 = sibling(button_12, 2);
          each(node_25, 17, figureRegions, (r) => r.name, ($$anchor4, r) => {
            var button_13 = root_21$1();
            var text_10 = child(button_13);
            template_effect(() => {
              button_13.disabled = get(figureSelBusy);
              set_attribute(button_13, "title", `select ${get(r).name}'s silhouette (3D pose mask)`);
              set_text(text_10, `🧍 ${get(r).name ?? ""}`);
            });
            delegated("click", button_13, () => selectFigureMask(get(r)));
            append($$anchor4, button_13);
          });
          var span_9 = sibling(node_25, 2);
          var text_11 = child(span_9);
          template_effect(() => {
            button_12.disabled = get(subjectBusy);
            set_text(text_9, get(subjectBusy) ? "Selecting…" : "✦ Select Subject");
            set_text(text_11, `${get(tool) === "lasso" ? "draw around a region" : "drag a rectangle"} · drag inside to move the ants · `);
          });
          delegated("click", button_12, selectSubject);
          append($$anchor3, fragment_9);
        };
        var consequent_15 = ($$anchor3) => {
          var fragment_10 = root_22$1();
          var button_14 = first_child(fragment_10);
          var text_12 = child(button_14);
          var node_26 = sibling(button_14, 2);
          each(node_26, 17, figureRegions, (r) => r.name, ($$anchor4, r) => {
            var button_15 = root_23$1();
            var text_13 = child(button_15);
            template_effect(() => {
              button_15.disabled = get(figureSelBusy);
              set_attribute(button_15, "title", `select ${get(r).name}'s silhouette (3D pose mask)`);
              set_text(text_13, `🧍 ${get(r).name ?? ""}`);
            });
            delegated("click", button_15, () => selectFigureMask(get(r)));
            append($$anchor4, button_15);
          });
          var span_10 = sibling(node_26, 2);
          var text_14 = child(span_10);
          template_effect(() => {
            button_14.disabled = get(subjectBusy);
            set_text(text_12, get(subjectBusy) ? "Selecting…" : "✦ Select Subject");
            set_text(text_14, `${get(objselBusy) ? "segmenting…" : "click an object to select all of it (AI)"} · Shift-click adds · Alt-click subtracts · Esc deselects · first click on a new composite takes a second, later clicks are instant`);
          });
          delegated("click", button_14, selectSubject);
          append($$anchor3, fragment_10);
        };
        var alternate_2 = ($$anchor3) => {
          var fragment_11 = root_24$1();
          var div_27 = first_child(fragment_11);
          var select_1 = sibling(child(div_27), 2);
          var option_1 = child(select_1);
          option_1.value = option_1.__value = 1;
          var option_2 = sibling(option_1);
          option_2.value = option_2.__value = 3;
          var option_3 = sibling(option_2);
          option_3.value = option_3.__value = 5;
          bind_select_value(select_1, () => get(sampleSize), ($$value) => set(sampleSize, $$value));
          append($$anchor3, fragment_11);
        };
        if_block(node_4, ($$render) => {
          if (get(transforming)) $$render(consequent_3);
          else if (get(tool) === "bucket") $$render(consequent_4, 1);
          else if (get(tool) === "smooth") $$render(consequent_5, 2);
          else if (get(tool) === "brush" || get(tool) === "eraser") $$render(consequent_6, 3);
          else if (get(tool) === "spot" || get(tool) === "heal" || get(tool) === "stamp") $$render(consequent_10, 4);
          else if (get(tool) === "liquify") $$render(consequent_12, 5);
          else if (get(tool) === "crop") $$render(consequent_13, 6);
          else if (get(tool) === "select" || get(tool) === "lasso") $$render(consequent_14, 7);
          else if (get(tool) === "objsel") $$render(consequent_15, 8);
          else $$render(alternate_2, -1);
        });
      }
      var div_28 = sibling(div_7, 2);
      var div_29 = child(div_28);
      var node_27 = child(div_29);
      each(node_27, 17, () => TOOLS, index, ($$anchor3, t) => {
        var button_16 = root_25$1();
        let classes_4;
        var svg_3 = child(button_16);
        html(svg_3, () => get(t).icon, true);
        template_effect(() => {
          classes_4 = set_class(button_16, 1, "pcr-ed-strip-btn svelte-1ozzqkm", null, classes_4, { active: get(tool) === get(t).id });
          set_attribute(button_16, "title", get(t).label);
        });
        delegated("click", button_16, () => setTool(get(t).id));
        append($$anchor3, button_16);
      });
      var button_17 = sibling(node_27, 4);
      var svg_4 = child(button_17);
      html(svg_4, () => ACTION_ICONS.undo, true);
      var button_18 = sibling(button_17, 2);
      var svg_5 = child(button_18);
      html(svg_5, () => ACTION_ICONS.redo, true);
      var button_19 = sibling(button_18, 2);
      var svg_6 = child(button_19);
      html(svg_6, () => ACTION_ICONS.clear, true);
      var button_20 = sibling(button_19, 4);
      let classes_5;
      bind_this(button_20, ($$value) => set(colorChipEl, $$value), () => get(colorChipEl));
      var button_21 = sibling(button_20, 2);
      var node_28 = sibling(button_21, 2);
      {
        var consequent_17 = ($$anchor3) => {
          var div_30 = root_26$1();
          var div_31 = sibling(child(div_30), 2);
          var div_32 = sibling(child(div_31), 4);
          var div_33 = sibling(div_31, 2);
          var div_34 = child(div_33);
          var div_35 = sibling(div_33, 2);
          var span_11 = child(div_35);
          var span_12 = sibling(span_11, 2);
          var text_15 = child(span_12);
          var node_29 = sibling(span_12, 2);
          {
            var consequent_16 = ($$anchor4) => {
              var button_22 = root_27$1();
              delegated("click", button_22, screenEyedrop);
              append($$anchor4, button_22);
            };
            if_block(node_29, ($$render) => {
              if (typeof window !== "undefined" && window.EyeDropper) $$render(consequent_16);
            });
          }
          var div_36 = sibling(div_35, 4);
          var button_23 = child(div_36);
          var button_24 = sibling(button_23, 2);
          bind_this(div_30, ($$value) => set(popoutEl, $$value), () => get(popoutEl));
          template_effect(() => {
            var _a;
            set_style(div_30, `top: ${((_a = get(colorChipEl)) == null ? void 0 : _a.offsetTop) ?? 0 ?? ""}px;`);
            set_style(div_31, `background-color: hsl(${get(hue) ?? ""}, 100%, 50%);`);
            set_style(div_32, `left: ${get(sat) * 100}%; top: ${(1 - get(val)) * 100}%;`);
            set_style(div_34, `left: ${get(hue) / 360 * 100}%;`);
            set_style(span_11, `background: ${get(hexColor) ?? ""};`);
            set_text(text_15, get(hexColor));
          });
          delegated("pointerdown", div_31, svDrag);
          delegated("pointerdown", div_33, hueDrag);
          delegated("click", button_23, cancelColorPop);
          delegated("click", button_24, okColorPop);
          append($$anchor3, div_30);
        };
        if_block(node_28, ($$render) => {
          if (get(colorPopout)) $$render(consequent_17);
        });
      }
      var div_37 = sibling(div_29, 2);
      var div_38 = child(div_37);
      let classes_6;
      let styles;
      var div_39 = child(div_38);
      var img_1 = child(div_39);
      set_style(img_1, "", {}, { display: "none" });
      bind_this(img_1, ($$value) => imgEl = $$value, () => imgEl);
      var canvas = sibling(img_1, 2);
      bind_this(canvas, ($$value) => belowCanvasEl = $$value, () => belowCanvasEl);
      var canvas_1 = sibling(canvas, 2);
      let styles_1;
      bind_this(canvas_1, ($$value) => paintCanvas = $$value, () => paintCanvas);
      var node_30 = sibling(canvas_1, 2);
      each(node_30, 19, () => get(layers), (L) => L.id, ($$anchor3, L, i) => {
        var fragment_12 = comment();
        var node_31 = first_child(fragment_12);
        {
          var consequent_18 = ($$anchor4) => {
            var canvas_2 = root_29$1();
            let styles_2;
            bind_this(canvas_2, ($$value, i2) => get(layerCanvasEls)[i2] = $$value, (i2) => {
              var _a;
              return (_a = get(layerCanvasEls)) == null ? void 0 : _a[i2];
            }, () => [get(i)]);
            template_effect(
              ($0) => {
                set_attribute(canvas_2, "width", get(width));
                set_attribute(canvas_2, "height", get(height));
                styles_2 = set_style(canvas_2, "", styles_2, $0);
              },
              [
                () => ({
                  display: get(L).visible ? null : "none",
                  opacity: get(L).opacity,
                  "mix-blend-mode": layerBlendCss(get(L))
                })
              ]
            );
            append($$anchor4, canvas_2);
          };
          if_block(node_31, ($$render) => {
            if (get(i) > get(activeIndex)) $$render(consequent_18);
          });
        }
        append($$anchor3, fragment_12);
      });
      var node_32 = sibling(node_30, 2);
      {
        var consequent_19 = ($$anchor3) => {
          var div_40 = root_30$1();
          template_effect(() => set_style(div_40, `left:${get(healSource).x ?? ""}px; top:${get(healSource).y ?? ""}px; width:${18 / get(zoom)}px; height:${18 / get(zoom)}px; border-width:${1.5 / get(zoom)}px;`));
          append($$anchor3, div_40);
        };
        if_block(node_32, ($$render) => {
          if ((get(tool) === "heal" || get(tool) === "stamp") && get(healSource) && !get(healPaintingUi)) $$render(consequent_19);
        });
      }
      var node_33 = sibling(node_32, 2);
      {
        var consequent_20 = ($$anchor3) => {
          var div_41 = root_31$1();
          template_effect(() => set_style(div_41, `left:${get(selRect).x ?? ""}px; top:${get(selRect).y ?? ""}px; width:${get(selRect).w ?? ""}px; height:${get(selRect).h ?? ""}px; --ant-w:${1.5 / get(zoom)}px; --ant-step:${8 / get(zoom)}px;`));
          append($$anchor3, div_41);
        };
        if_block(node_33, ($$render) => {
          if (get(selRect)) $$render(consequent_20);
        });
      }
      var node_34 = sibling(node_33, 2);
      {
        var consequent_21 = ($$anchor3) => {
          const pts = user_derived(() => get(lassoPts).map((p) => `${p.x},${p.y}`).join(" "));
          var svg_7 = root_32$1();
          var polyline = child(svg_7);
          var polyline_1 = sibling(polyline);
          template_effect(() => {
            set_attribute(svg_7, "width", get(width));
            set_attribute(svg_7, "height", get(height));
            set_attribute(svg_7, "viewBox", `0 0 ${get(width) ?? ""} ${get(height) ?? ""}`);
            set_attribute(polyline, "points", get(pts));
            set_style(polyline, `stroke-width: ${2.5 / get(zoom)}px;`);
            set_attribute(polyline_1, "points", get(pts));
            set_style(polyline_1, `stroke-width: ${1.25 / get(zoom)}px;`);
          });
          append($$anchor3, svg_7);
        };
        if_block(node_34, ($$render) => {
          if (get(lassoPts) && get(lassoPts).length > 1) $$render(consequent_21);
        });
      }
      var node_35 = sibling(node_34, 2);
      {
        var consequent_22 = ($$anchor3) => {
          var div_42 = root_33$1();
          template_effect(() => set_style(div_42, `left:0; top:0; width:${1 / get(zoom)}px; height:${get(height) ?? ""}px; transform: translateX(${get(snapGuides).v ?? ""}px);`));
          append($$anchor3, div_42);
        };
        if_block(node_35, ($$render) => {
          if (get(snapGuides).v != null) $$render(consequent_22);
        });
      }
      var node_36 = sibling(node_35, 2);
      {
        var consequent_23 = ($$anchor3) => {
          var div_43 = root_34$1();
          template_effect(() => set_style(div_43, `left:0; top:0; width:${get(width) ?? ""}px; height:${1 / get(zoom)}px; transform: translateY(${get(snapGuides).h ?? ""}px);`));
          append($$anchor3, div_43);
        };
        if_block(node_36, ($$render) => {
          if (get(snapGuides).h != null) $$render(consequent_23);
        });
      }
      var node_37 = sibling(node_36, 2);
      {
        var consequent_24 = ($$anchor3) => {
          var svg_8 = root_35$1();
          var g_1 = child(svg_8);
          var path = child(g_1);
          var path_1 = sibling(path);
          template_effect(() => {
            set_attribute(svg_8, "width", get(width));
            set_attribute(svg_8, "height", get(height));
            set_attribute(svg_8, "viewBox", `0 0 ${get(width) ?? ""} ${get(height) ?? ""}`);
            set_attribute(g_1, "transform", get(selDragDxy) ? `translate(${get(selDragDxy).dx} ${get(selDragDxy).dy})` : "");
            set_attribute(path, "d", get(selContour));
            set_attribute(path_1, "d", get(selContour));
          });
          append($$anchor3, svg_8);
        };
        if_block(node_37, ($$render) => {
          if (get(selContour)) $$render(consequent_24);
        });
      }
      var node_38 = sibling(node_37, 2);
      {
        var consequent_26 = ($$anchor3) => {
          var fragment_13 = root_36$1();
          var svg_9 = first_child(fragment_13);
          var path_2 = child(svg_9);
          var div_44 = sibling(svg_9, 2);
          let classes_7;
          var node_39 = child(div_44);
          {
            var consequent_25 = ($$anchor4) => {
              var fragment_14 = root_37$1();
              var div_45 = first_child(fragment_14);
              var div_46 = sibling(div_45, 2);
              var div_47 = sibling(div_46, 2);
              var div_48 = sibling(div_47, 2);
              template_effect(() => {
                set_style(div_45, `left: 33.333%; width:${1 / get(zoom)}px;`);
                set_style(div_46, `left: 66.666%; width:${1 / get(zoom)}px;`);
                set_style(div_47, `top: 33.333%; height:${1 / get(zoom)}px;`);
                set_style(div_48, `top: 66.666%; height:${1 / get(zoom)}px;`);
              });
              append($$anchor4, fragment_14);
            };
            if_block(node_39, ($$render) => {
              if (get(cropDragging)) $$render(consequent_25);
            });
          }
          var node_40 = sibling(div_44, 2);
          each(node_40, 17, () => HANDLES, index, ($$anchor4, dir) => {
            var div_49 = root_38$1();
            template_effect(($0) => set_style(div_49, $0), [
              () => cropHandleStyle(get(dir), get(cropBox), get(zoom))
            ]);
            delegated("pointerdown", div_49, (e) => cropPointerDown(e, get(dir)));
            delegated("pointermove", div_49, cropPointerMove);
            delegated("pointerup", div_49, cropPointerUp);
            event("pointercancel", div_49, cropPointerUp);
            append($$anchor4, div_49);
          });
          template_effect(
            ($0) => {
              set_attribute(svg_9, "width", get(width));
              set_attribute(svg_9, "height", get(height));
              set_attribute(svg_9, "viewBox", `0 0 ${get(width) ?? ""} ${get(height) ?? ""}`);
              set_attribute(path_2, "d", `M0 0H${get(width) ?? ""}V${get(height) ?? ""}H0Z M${get(cropBox).x ?? ""} ${get(cropBox).y ?? ""}h${get(cropBox).w ?? ""}v${get(cropBox).h ?? ""}h-${get(cropBox).w ?? ""}Z`);
              classes_7 = set_class(div_44, 1, "pcr-ed-crop-border svelte-1ozzqkm", null, classes_7, $0);
              set_style(div_44, `left:${get(cropBox).x ?? ""}px; top:${get(cropBox).y ?? ""}px; width:${get(cropBox).w ?? ""}px; height:${get(cropBox).h ?? ""}px; border-width:${1 / get(zoom)}px;`);
            },
            [() => ({ fresh: cropBoxIsFull() })]
          );
          delegated("pointerdown", div_44, (e) => cropPointerDown(e, "move"));
          delegated("pointermove", div_44, cropPointerMove);
          delegated("pointerup", div_44, cropPointerUp);
          event("pointercancel", div_44, cropPointerUp);
          append($$anchor3, fragment_13);
        };
        if_block(node_38, ($$render) => {
          if (get(tool) === "crop" && get(cropBox)) $$render(consequent_26);
        });
      }
      var node_41 = sibling(node_38, 2);
      {
        var consequent_28 = ($$anchor3) => {
          const hs = user_derived(() => 11 / get(zoom));
          var div_50 = root_39();
          var canvas_3 = child(div_50);
          bind_this(canvas_3, ($$value) => set(patchEl, $$value), () => get(patchEl));
          var div_51 = sibling(canvas_3, 2);
          var node_42 = sibling(div_51, 2);
          each(node_42, 17, () => HANDLES, index, ($$anchor4, dir) => {
            var div_52 = root_40();
            template_effect(($0) => set_style(div_52, $0), [() => tHandleStyle(get(dir), get(patch), get(zoom))]);
            delegated("pointerdown", div_52, (e) => patchPointerDown(e, get(dir)));
            delegated("pointermove", div_52, patchPointerMove);
            delegated("pointerup", div_52, patchPointerUp);
            event("pointercancel", div_52, patchPointerUp);
            append($$anchor4, div_52);
          });
          var node_43 = sibling(node_42, 2);
          {
            var consequent_27 = ($$anchor4) => {
              var fragment_15 = root_41$1();
              var div_53 = first_child(fragment_15);
              var div_54 = sibling(div_53, 2);
              template_effect(() => {
                set_style(div_53, `left:50%; top:${-22 / get(zoom)}px; width:${1 / get(zoom)}px; height:${22 / get(zoom)}px;`);
                set_style(div_54, `left:calc(50% - ${get(hs) / 2}px); top:${-22 / get(zoom) - get(hs) / 2}px; width:${get(hs) ?? ""}px; height:${get(hs) ?? ""}px;`);
              });
              delegated("pointerdown", div_54, (e) => patchPointerDown(e, "rot"));
              delegated("pointermove", div_54, patchPointerMove);
              delegated("pointerup", div_54, patchPointerUp);
              event("pointercancel", div_54, patchPointerUp);
              append($$anchor4, fragment_15);
            };
            if_block(node_43, ($$render) => {
              if (get(patch).transform) $$render(consequent_27);
            });
          }
          template_effect(() => {
            set_style(div_50, `left:${get(patch).x ?? ""}px; top:${get(patch).y ?? ""}px; width:${get(patch).w ?? ""}px; height:${get(patch).h ?? ""}px; transform: rotate(${(get(patch).rot || 0) ?? ""}rad);`);
            set_style(canvas_3, `left:0; top:0; width:100%; height:100%; opacity:${get(patchOpacity) ?? ""}; transform: scale(${get(patch).flipH ? -1 : 1}, ${get(patch).flipV ? -1 : 1});`);
            set_style(div_51, `inset:0; border-width:${1 / get(zoom)}px;`);
          });
          delegated("pointerdown", canvas_3, (e) => patchPointerDown(e, "move"));
          delegated("pointermove", canvas_3, patchPointerMove);
          delegated("pointerup", canvas_3, patchPointerUp);
          event("pointercancel", canvas_3, patchPointerUp);
          append($$anchor3, div_50);
        };
        if_block(node_41, ($$render) => {
          if (get(patch)) $$render(consequent_28);
        });
      }
      var node_44 = sibling(div_39, 2);
      {
        var consequent_29 = ($$anchor3) => {
          var div_55 = root_42$1();
          template_effect(() => set_style(div_55, `left: ${get(cursorPos).x ?? ""}px; top: ${get(cursorPos).y ?? ""}px; width: ${(get(tool) === "liquify" ? get(liqSize) : get(brushSize)) * get(zoom)}px; height: ${(get(tool) === "liquify" ? get(liqSize) : get(brushSize)) * get(zoom)}px;`));
          append($$anchor3, div_55);
        };
        if_block(node_44, ($$render) => {
          if (get(cursorPos) && !get(colorPopout) && !get(transforming) && !get(hiddenEditBlocked) && (get(tool) === "brush" || get(tool) === "eraser" || get(tool) === "spot" || get(tool) === "heal" || get(tool) === "stamp" || get(tool) === "liquify")) $$render(consequent_29);
        });
      }
      var node_45 = sibling(node_44, 2);
      {
        var consequent_30 = ($$anchor3) => {
          var div_56 = root_43$1();
          var text_16 = child(div_56);
          template_effect(() => {
            set_style(div_56, `left: ${get(cursorPos).x + 12}px; top: ${get(cursorPos).y - 16}px;`);
            set_text(text_16, get(selBadge));
          });
          append($$anchor3, div_56);
        };
        if_block(node_45, ($$render) => {
          if (get(selBadge) && get(cursorPos)) $$render(consequent_30);
        });
      }
      var node_46 = sibling(node_45, 2);
      {
        var consequent_31 = ($$anchor3) => {
          var div_57 = root_44$1();
          template_effect(() => set_style(div_57, `left: ${get(cursorPos).x + get(healStrokeOffset).dx * get(zoom)}px; top: ${get(cursorPos).y + get(healStrokeOffset).dy * get(zoom)}px;`));
          append($$anchor3, div_57);
        };
        if_block(node_46, ($$render) => {
          if ((get(tool) === "heal" || get(tool) === "stamp") && get(healPaintingUi) && get(healStrokeOffset) && get(cursorPos)) $$render(consequent_31);
        });
      }
      var node_47 = sibling(node_46, 2);
      {
        var consequent_32 = ($$anchor3) => {
          var div_58 = root_45$1();
          template_effect(() => set_style(div_58, `left: ${get(pickPreview).x ?? ""}px; top: ${get(pickPreview).y ?? ""}px; background: ${get(pickPreview).hex ?? ""};`));
          append($$anchor3, div_58);
        };
        if_block(node_47, ($$render) => {
          if (get(pickPreview)) $$render(consequent_32);
        });
      }
      var node_48 = sibling(node_47, 2);
      {
        var consequent_33 = ($$anchor3) => {
          var div_59 = root_46$1();
          append($$anchor3, div_59);
        };
        if_block(node_48, ($$render) => {
          if (get(patch)) $$render(consequent_33);
        });
      }
      bind_this(div_38, ($$value) => viewportEl = $$value, () => viewportEl);
      var div_60 = sibling(div_37, 2);
      var div_61 = child(div_60);
      var div_62 = child(div_61);
      var span_13 = sibling(child(div_62), 2);
      var text_17 = child(span_13);
      var div_63 = sibling(div_62, 2);
      var img_2 = child(div_63);
      var node_49 = sibling(img_2, 2);
      {
        var consequent_34 = ($$anchor3) => {
          var div_64 = root_47$1();
          template_effect(() => set_style(div_64, `left: ${get(navRect).x ?? ""}px; top: ${get(navRect).y ?? ""}px; width: ${get(navRect).w ?? ""}px; height: ${get(navRect).h ?? ""}px;`));
          append($$anchor3, div_64);
        };
        if_block(node_49, ($$render) => {
          if (get(navRect)) $$render(consequent_34);
        });
      }
      var div_65 = sibling(div_63, 2);
      var button_25 = child(div_65);
      var input = sibling(button_25, 2);
      set_attribute(input, "min", Math.log(0.05));
      set_attribute(input, "max", Math.log(12));
      var button_26 = sibling(input, 2);
      var node_50 = sibling(div_61, 2);
      {
        var consequent_38 = ($$anchor3) => {
          var div_66 = root_48$1();
          var span_14 = child(div_66);
          var text_18 = child(span_14);
          var div_67 = sibling(span_14, 2);
          var node_51 = child(div_67);
          {
            var consequent_35 = ($$anchor4) => {
              var button_27 = root_49$1();
              template_effect(() => {
                button_27.disabled = !!get(handoffBusy);
                set_attribute(button_27, "title", get(selActive) ? "Inpaint the selected region — it's pre-masked; the result returns as a new layer." : "Inpaint — an alpha-bounded layer pre-masks its silhouette, else paint the mask in the Inpaint editor; the result returns as a new layer.");
              });
              delegated("click", button_27, openInpaintHandoff);
              append($$anchor4, button_27);
            };
            if_block(node_51, ($$render) => {
              if (onOpenInpaint()) $$render(consequent_35);
            });
          }
          var node_52 = sibling(node_51, 2);
          {
            var consequent_36 = ($$anchor4) => {
              var button_28 = root_50$1();
              template_effect(() => {
                button_28.disabled = !!get(handoffBusy);
                set_attribute(button_28, "title", get(selActive) ? "Upscale the selected region at the quality you pick." : "Upscale the active layer's content at the quality you pick — grow the canvas to keep it 1:1, or squeeze it back in place.");
              });
              delegated("click", button_28, openUpscaleHandoff);
              append($$anchor4, button_28);
            };
            if_block(node_52, ($$render) => {
              if (onOpenUpscale()) $$render(consequent_36);
            });
          }
          var node_53 = sibling(div_67, 2);
          {
            var consequent_37 = ($$anchor4) => {
              var div_68 = root_51$1();
              var button_29 = child(div_68);
              template_effect(() => button_29.disabled = !!get(handoffBusy));
              delegated("click", button_29, openReposeHandoff);
              append($$anchor4, div_68);
            };
            if_block(node_53, ($$render) => {
              if (onOpenRepose()) $$render(consequent_37);
            });
          }
          template_effect(() => set_text(text_18, `Render ${get(selActive) ? "selection" : "layer"}`));
          append($$anchor3, div_66);
        };
        if_block(node_50, ($$render) => {
          if (onOpenInpaint() || onOpenUpscale() || onOpenRepose()) $$render(consequent_38);
        });
      }
      var div_69 = sibling(node_50, 2);
      var div_70 = child(div_69);
      var span_15 = child(div_70);
      var button_30 = child(span_15);
      let classes_8;
      var button_31 = sibling(button_30, 2);
      let classes_9;
      var node_54 = sibling(span_15, 2);
      {
        var consequent_39 = ($$anchor3) => {
          var span_16 = root_52$1();
          var button_32 = child(span_16);
          var button_33 = sibling(button_32, 2);
          var button_34 = sibling(button_33, 2);
          var button_35 = sibling(button_34, 2);
          template_effect(
            ($0) => {
              button_33.disabled = get(selectedIds).length < 2;
              button_34.disabled = get(layers).length <= 1;
              set_attribute(button_35, "title", get(selectedIds).length > 1 ? "Delete selected layers" : "Delete layer");
              button_35.disabled = $0;
            },
            [() => !canDeleteSelected()]
          );
          delegated("click", button_32, () => addLayer());
          delegated("click", button_33, mergeSelected);
          delegated("click", button_34, flattenImage);
          delegated("click", button_35, deleteSelectedLayers);
          append($$anchor3, span_16);
        };
        if_block(node_54, ($$render) => {
          if (get(lhTab) === "layers") $$render(consequent_39);
        });
      }
      var node_55 = sibling(div_70, 2);
      {
        var consequent_43 = ($$anchor3) => {
          var fragment_16 = root_53$1();
          var select_2 = first_child(fragment_16);
          each(select_2, 21, () => BLEND_MODES, ([v, label]) => v, ($$anchor4, $$item) => {
            var $$array_2 = user_derived(() => to_array(get($$item), 2));
            let v = () => get($$array_2)[0];
            let label = () => get($$array_2)[1];
            var option_4 = root_54$1();
            var text_19 = child(option_4);
            var option_4_value = {};
            template_effect(() => {
              set_text(text_19, label());
              if (option_4_value !== (option_4_value = v())) {
                option_4.value = (option_4.__value = v()) ?? "";
              }
            });
            append($$anchor4, option_4);
          });
          var select_2_value;
          init_select(select_2);
          var div_71 = sibling(select_2, 2);
          each(div_71, 21, () => [...get(layers)].reverse(), (L) => L.id, ($$anchor4, L) => {
            const i = user_derived(() => get(layers).indexOf(get(L)));
            var div_72 = root_55$1();
            let classes_10;
            var span_17 = child(div_72);
            let classes_11;
            var span_18 = sibling(span_17, 2);
            let classes_12;
            var text_20 = child(span_18);
            var node_56 = sibling(span_18, 2);
            {
              var consequent_40 = ($$anchor5) => {
                var input_1 = root_56$1();
                autofocus(input_1);
                delegated("click", input_1, (e) => e.stopPropagation());
                delegated("keydown", input_1, (e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  else if (e.key === "Escape") set(renamingId, null);
                });
                event("blur", input_1, commitRename);
                bind_value(input_1, () => get(renameText), ($$value) => set(renameText, $$value));
                append($$anchor5, input_1);
              };
              var alternate_3 = ($$anchor5) => {
                var span_19 = root_57$1();
                var text_21 = child(span_19);
                var node_57 = sibling(text_21);
                {
                  var consequent_41 = ($$anchor6) => {
                    var span_20 = root_58$1();
                    append($$anchor6, span_20);
                  };
                  if_block(node_57, ($$render) => {
                    if (get(L).mask) $$render(consequent_41);
                  });
                }
                var node_58 = sibling(node_57);
                {
                  var consequent_42 = ($$anchor6) => {
                    var span_21 = root_59$1();
                    var text_22 = child(span_21);
                    template_effect(() => set_text(text_22, get(L).blend));
                    append($$anchor6, span_21);
                  };
                  var d_1 = user_derived(() => layerBlendCss(get(L)));
                  if_block(node_58, ($$render) => {
                    if (get(d_1)) $$render(consequent_42);
                  });
                }
                template_effect(() => set_text(text_21, get(L).name));
                delegated("dblclick", span_19, (e) => {
                  e.stopPropagation();
                  startRename(get(L));
                });
                append($$anchor5, span_19);
              };
              if_block(node_56, ($$render) => {
                if (get(renamingId) === get(L).id) $$render(consequent_40);
                else $$render(alternate_3, -1);
              });
            }
            var input_2 = sibling(node_56, 2);
            template_effect(
              ($0) => {
                classes_10 = set_class(div_72, 1, "pcr-ed-layer-row svelte-1ozzqkm", null, classes_10, $0);
                classes_11 = set_class(span_17, 1, "pcr-ed-layer-grip svelte-1ozzqkm", null, classes_11, { hidden: get(L).isBackground });
                set_attribute(span_17, "draggable", !get(L).isBackground);
                classes_12 = set_class(span_18, 1, "pcr-ed-eye svelte-1ozzqkm", null, classes_12, { off: !get(L).visible });
                set_text(text_20, get(L).visible ? "👁" : "—");
                set_value(input_2, get(L).opacity);
              },
              [
                () => ({
                  active: get(i) === get(activeIndex),
                  selected: get(selectedIds).includes(get(L).id),
                  dragover: get(dragOverId) === get(L).id
                })
              ]
            );
            delegated("click", div_72, (e) => clickLayer(get(i), e));
            delegated("contextmenu", div_72, (e) => {
              e.preventDefault();
              if (!get(selectedIds).includes(get(L).id)) clickLayer(get(i), e);
              set(layerMenu, { x: e.clientX, y: e.clientY, i: get(i) }, true);
            });
            event("dragover", div_72, (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              set(dragOverId, get(L).id, true);
            });
            event("dragleave", div_72, () => {
              if (get(dragOverId) === get(L).id) set(dragOverId, null);
            });
            event("drop", div_72, (e) => {
              e.preventDefault();
              dropLayer(get(L).id);
            });
            event("dragstart", span_17, (e) => {
              dragId = get(L).id;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(get(L).id));
            });
            event("dragend", span_17, () => {
              dragId = null;
              set(dragOverId, null);
            });
            delegated("click", span_18, (e) => {
              e.stopPropagation();
              setLayerVisible(get(i), !get(L).visible);
            });
            delegated("input", input_2, (e) => setLayerOpacity(get(i), +e.currentTarget.value));
            delegated("click", input_2, (e) => e.stopPropagation());
            append($$anchor4, div_72);
          });
          template_effect(
            ($0, $1) => {
              select_2.disabled = $0;
              if (select_2_value !== (select_2_value = $1)) {
                select_2.value = (select_2.__value = $1) ?? "", select_option(select_2, $1);
              }
            },
            [
              () => {
                var _a;
                return (_a = activeLayer()) == null ? void 0 : _a.isBackground;
              },
              () => {
                var _a;
                return ((_a = activeLayer()) == null ? void 0 : _a.blend) || "normal";
              }
            ]
          );
          delegated("change", select_2, (e) => setLayerBlend(get(activeIndex), e.currentTarget.value));
          append($$anchor3, fragment_16);
        };
        var alternate_4 = ($$anchor3) => {
          var div_73 = root_60$1();
          each(div_73, 21, () => get(history2), index, ($$anchor4, h, i) => {
            var div_74 = root_61$1();
            let classes_13;
            var text_23 = child(div_74);
            template_effect(() => {
              classes_13 = set_class(div_74, 1, "pcr-ed-hist-row svelte-1ozzqkm", null, classes_13, { active: i === get(histIndex), future: i > get(histIndex) });
              set_text(text_23, get(h).label);
            });
            delegated("click", div_74, () => jumpTo(i));
            append($$anchor4, div_74);
          });
          bind_this(div_73, ($$value) => histEl = $$value, () => histEl);
          append($$anchor3, div_73);
        };
        if_block(node_55, ($$render) => {
          if (get(lhTab) === "layers") $$render(consequent_43);
          else $$render(alternate_4, -1);
        });
      }
      var node_59 = sibling(div_69, 2);
      {
        var consequent_50 = ($$anchor3) => {
          var div_75 = root_62$1();
          var button_36 = child(div_75);
          var node_60 = sibling(button_36, 2);
          {
            var consequent_44 = ($$anchor4) => {
              var button_37 = root_63$1();
              delegated("click", button_37, () => {
                mergeSelected();
                set(layerMenu, null);
              });
              append($$anchor4, button_37);
            };
            var consequent_45 = ($$anchor4) => {
              var button_38 = root_64$1();
              delegated("click", button_38, () => {
                mergeDown(get(layerMenu).i);
                set(layerMenu, null);
              });
              append($$anchor4, button_38);
            };
            if_block(node_60, ($$render) => {
              if (get(selectedIds).length > 1) $$render(consequent_44);
              else if (get(layerMenu).i > 0) $$render(consequent_45, 1);
            });
          }
          var button_39 = sibling(node_60, 2);
          var node_61 = sibling(button_39, 2);
          {
            var consequent_47 = ($$anchor4) => {
              var fragment_17 = comment();
              var node_62 = first_child(fragment_17);
              {
                var consequent_46 = ($$anchor5) => {
                  var button_40 = root_66();
                  var text_24 = child(button_40);
                  template_effect(() => set_text(text_24, `Add Layer Mask${get(selActive) ? " (Reveal Selection)" : ""}`));
                  delegated("click", button_40, () => {
                    addLayerMask(get(layerMenu).i);
                    set(layerMenu, null);
                  });
                  append($$anchor5, button_40);
                };
                var alternate_5 = ($$anchor5) => {
                  var fragment_18 = root_67();
                  var button_41 = first_child(fragment_18);
                  var button_42 = sibling(button_41, 2);
                  delegated("click", button_41, () => {
                    applyLayerMask(get(layerMenu).i);
                    set(layerMenu, null);
                  });
                  delegated("click", button_42, () => {
                    deleteLayerMask(get(layerMenu).i);
                    set(layerMenu, null);
                  });
                  append($$anchor5, fragment_18);
                };
                if_block(node_62, ($$render) => {
                  var _a;
                  if (!((_a = get(layers)[get(layerMenu).i]) == null ? void 0 : _a.mask)) $$render(consequent_46);
                  else $$render(alternate_5, -1);
                });
              }
              append($$anchor4, fragment_17);
            };
            if_block(node_61, ($$render) => {
              var _a;
              if (!((_a = get(layers)[get(layerMenu).i]) == null ? void 0 : _a.isBackground)) $$render(consequent_47);
            });
          }
          var node_63 = sibling(node_61, 2);
          {
            var consequent_48 = ($$anchor4) => {
              var button_43 = root_68();
              delegated("click", button_43, () => {
                const i = get(layerMenu).i;
                set(layerMenu, null);
                if (i === get(activeIndex)) flushActive();
                if (matchLayerColorsToBelow(i)) commitAction("Match Colors");
                else set(errorMsg, "No usable edge band — the layer's feathered edge must overlap solid content below.");
              });
              append($$anchor4, button_43);
            };
            if_block(node_63, ($$render) => {
              var _a;
              if (get(layerMenu).i > 0 && ((_a = get(layers)[get(layerMenu).i]) == null ? void 0 : _a.bitmap)) $$render(consequent_48);
            });
          }
          var button_44 = sibling(node_63, 2);
          var node_64 = sibling(button_44, 2);
          {
            var consequent_49 = ($$anchor4) => {
              var button_45 = root_69();
              var text_25 = child(button_45);
              template_effect(() => set_text(text_25, get(selectedIds).length > 1 ? "Delete Layers" : "Delete Layer"));
              delegated("click", button_45, () => {
                deleteSelectedLayers();
                set(layerMenu, null);
              });
              append($$anchor4, button_45);
            };
            var d_2 = user_derived(() => canDeleteSelected());
            if_block(node_64, ($$render) => {
              if (get(d_2)) $$render(consequent_49);
            });
          }
          template_effect(() => set_style(div_75, `left:${get(layerMenu).x ?? ""}px; top:${get(layerMenu).y ?? ""}px;`));
          delegated("click", button_36, () => {
            addLayer(get(layerMenu).i);
            set(layerMenu, null);
          });
          delegated("click", button_39, () => {
            duplicateLayer(get(layerMenu).i);
            set(layerMenu, null);
          });
          delegated("click", button_44, () => {
            flattenImage();
            set(layerMenu, null);
          });
          append($$anchor3, div_75);
        };
        if_block(node_59, ($$render) => {
          if (get(layerMenu)) $$render(consequent_50);
        });
      }
      var node_65 = sibling(node_59, 2);
      {
        var consequent_53 = ($$anchor3) => {
          var div_76 = root_70();
          var node_66 = child(div_76);
          {
            var consequent_51 = ($$anchor4) => {
              var fragment_19 = root_71();
              var button_46 = first_child(fragment_19);
              var button_47 = sibling(button_46, 2);
              delegated("click", button_46, () => {
                deselect();
                set(canvasMenu, null);
              });
              delegated("click", button_47, () => {
                selectInverse();
                set(canvasMenu, null);
              });
              append($$anchor4, fragment_19);
            };
            if_block(node_66, ($$render) => {
              if (get(selActive)) $$render(consequent_51);
            });
          }
          var button_48 = sibling(node_66, 2);
          var text_26 = child(button_48);
          var button_49 = sibling(button_48, 2);
          var button_50 = sibling(button_49, 2);
          var text_27 = child(button_50);
          var node_67 = sibling(button_50, 2);
          {
            var consequent_52 = ($$anchor4) => {
              var fragment_20 = root_72();
              var button_51 = first_child(fragment_20);
              var button_52 = sibling(button_51, 2);
              delegated("click", button_51, () => {
                set(canvasMenu, null);
                layerViaCopy(false);
              });
              delegated("click", button_52, () => {
                set(canvasMenu, null);
                layerViaCopy(true);
              });
              append($$anchor4, fragment_20);
            };
            if_block(node_67, ($$render) => {
              if (get(selActive)) $$render(consequent_52);
            });
          }
          template_effect(() => {
            set_style(div_76, `left:${get(canvasMenu).x ?? ""}px; top:${get(canvasMenu).y ?? ""}px;`);
            set_text(text_26, get(selActive) ? "Free Transform Selection" : "Free Transform Layer");
            button_50.disabled = get(subjectBusy);
            set_text(text_27, get(subjectBusy) ? "Selecting Subject…" : "Select Subject");
          });
          delegated("click", button_48, () => {
            set(canvasMenu, null);
            beginTransform();
          });
          delegated("click", button_49, () => {
            selectAllRegion();
            set(canvasMenu, null);
          });
          delegated("click", button_50, () => {
            set(canvasMenu, null);
            selectSubject();
          });
          append($$anchor3, div_76);
        };
        if_block(node_65, ($$render) => {
          if (get(canvasMenu)) $$render(consequent_53);
        });
      }
      var node_68 = sibling(div_6, 2);
      {
        var consequent_54 = ($$anchor3) => {
          var div_77 = root_73();
          var text_28 = child(div_77);
          template_effect(() => set_text(text_28, `⚠ ${get(errorMsg) ?? ""}`));
          append($$anchor3, div_77);
        };
        if_block(node_68, ($$render) => {
          if (get(errorMsg)) $$render(consequent_54);
        });
      }
      var node_69 = sibling(node_68, 2);
      {
        var consequent_55 = ($$anchor3) => {
          var div_78 = root_74();
          var text_29 = child(div_78);
          template_effect(() => set_text(text_29, `⏳ ${get(selSetupMsg) ?? ""}`));
          append($$anchor3, div_78);
        };
        var consequent_56 = ($$anchor3) => {
          var div_79 = root_75();
          append($$anchor3, div_79);
        };
        if_block(node_69, ($$render) => {
          if (get(selSetupMsg)) $$render(consequent_55);
          else if (get(subjectBusy)) $$render(consequent_56, 1);
        });
      }
      var node_70 = sibling(node_69, 2);
      AdjustModal(node_70, {
        get open() {
          return get(adjustOpen);
        },
        get sourceCanvas() {
          return get(adjustSrcCanvas);
        },
        get filename() {
          return filename();
        },
        onApply: onAdjustApply,
        onCancel: () => {
          set(adjustOpen, false);
          set(adjustSrcCanvas, null);
        }
      });
      var node_71 = sibling(node_70, 2);
      {
        var consequent_57 = ($$anchor3) => {
          var div_80 = root_76();
          var div_81 = child(div_80);
          var div_82 = child(div_81);
          var text_30 = child(div_82);
          var div_83 = sibling(div_82, 2);
          var button_53 = child(div_83);
          template_effect(() => set_text(text_30, `Could not use the ${get(tool) === "stamp" ? "clone stamp" : "healing brush"} because the area to sample from has not been defined. `));
          delegated("click", div_80, () => {
            set(healDialog, false);
          });
          delegated("click", button_53, () => {
            set(healDialog, false);
          });
          append($$anchor3, div_80);
        };
        if_block(node_71, ($$render) => {
          if (get(healDialog)) $$render(consequent_57);
        });
      }
      var node_72 = sibling(node_71, 2);
      {
        var consequent_58 = ($$anchor3) => {
          var div_84 = root_77();
          var div_85 = child(div_84);
          var div_86 = child(div_85);
          var text_31 = child(div_86);
          var div_87 = sibling(div_86, 2);
          var button_54 = child(div_87);
          template_effect(() => set_text(text_31, get(hiddenEditDialog)));
          delegated("click", div_84, () => {
            set(hiddenEditDialog, null);
          });
          delegated("click", button_54, () => {
            set(hiddenEditDialog, null);
          });
          append($$anchor3, div_84);
        };
        if_block(node_72, ($$render) => {
          if (get(hiddenEditDialog)) $$render(consequent_58);
        });
      }
      var div_88 = sibling(node_72, 2);
      var div_89 = child(div_88);
      var node_73 = sibling(child(div_89), 2);
      SavePathInput(node_73, {
        get value() {
          return get(savePrefix);
        },
        onChange: (v) => {
          set(savePrefix, v, true);
        },
        get fetchApi() {
          return fetchApi();
        }
      });
      var node_74 = sibling(div_89, 2);
      {
        var consequent_59 = ($$anchor3) => {
          var span_22 = root_78();
          append($$anchor3, span_22);
        };
        if_block(node_74, ($$render) => {
          if (get(editsSaved)) $$render(consequent_59);
        });
      }
      var button_55 = sibling(node_74, 2);
      var button_56 = sibling(button_55, 2);
      var text_32 = child(button_56);
      var button_57 = sibling(button_56, 2);
      var text_33 = child(button_57);
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      template_effect(
        ($0, $1, $2, $3) => {
          classes = set_class(div_1, 1, "pcr-modal pcr-ed-modal svelte-1ozzqkm", null, classes, { maximized: get(maximized) });
          set_text(text, filename());
          set_attribute(button, "aria-label", get(maximized) ? "Restore" : "Maximize");
          set_attribute(button, "title", get(maximized) ? "Restore down" : "Maximize");
          button_17.disabled = get(histIndex) === 0;
          button_18.disabled = get(histIndex) >= get(history2).length - 1;
          button_19.disabled = get(histIndex) === 0;
          classes_5 = set_class(button_20, 1, "pcr-ed-strip-color svelte-1ozzqkm", null, classes_5, { open: get(colorPopout) });
          set_style(button_20, `background: ${get(hexColor) ?? ""};`);
          set_style(button_21, `background: ${$0 ?? ""};`);
          classes_6 = set_class(div_38, 1, "pcr-ed-viewport svelte-1ozzqkm", null, classes_6, {
            eyedrop: get(tool) === "eyedrop" || get(colorPopout),
            "select-mode": get(tool) === "select" || get(tool) === "lasso" || get(tool) === "objsel" || get(tool) === "smooth" || get(tool) === "crop" || get(tool) === "bucket",
            "move-mode": get(tool) === "move" || get(mods).ctrl && !get(mods).shift && !get(mods).alt,
            "transform-mode": get(transforming),
            "no-edit": get(hiddenEditBlocked),
            "drag-over": get(dragActive)
          });
          styles = set_style(div_38, "", styles, {
            cursor: get(transforming) && get(overRotateZone) ? ROTATE_CURSOR : null
          });
          set_style(div_39, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""}); width:${get(width) ?? ""}px; height:${get(height) ?? ""}px;`);
          set_attribute(img_1, "src", get(sourceUrl));
          set_attribute(img_1, "width", get(width));
          set_attribute(img_1, "height", get(height));
          set_attribute(canvas, "width", get(width));
          set_attribute(canvas, "height", get(height));
          set_attribute(canvas_1, "width", get(width));
          set_attribute(canvas_1, "height", get(height));
          styles_1 = set_style(canvas_1, "", styles_1, $1);
          set_text(text_17, `${$2 ?? ""}%`);
          set_style(div_63, `width: ${get(navTw) ?? ""}px; height: ${get(navTh) ?? ""}px;`);
          set_attribute(img_2, "src", get(sourceUrl));
          set_style(img_2, `width: ${get(navTw) ?? ""}px; height: ${get(navTh) ?? ""}px;`);
          set_value(input, $3);
          classes_8 = set_class(button_30, 1, "pcr-ed-lh-tab svelte-1ozzqkm", null, classes_8, { active: get(lhTab) === "layers" });
          classes_9 = set_class(button_31, 1, "pcr-ed-lh-tab svelte-1ozzqkm", null, classes_9, { active: get(lhTab) === "history" });
          button_56.disabled = !editDocHash() || !get(histIndex) || get(savingEdits) || get(saving);
          set_attribute(button_56, "title", editDocHash() ? "Save your layers back onto this image — no new file, keeps the thumbnail" : "This image can't store edits in place — use Save new image");
          set_text(text_32, get(savingEdits) ? "Saving…" : "Save edits");
          button_57.disabled = !get(histIndex) || get(saving) || get(savingEdits);
          set_attribute(button_57, "title", get(histIndex) ? "Export the result as a new image (keeps the original)" : "Paint something first");
          set_text(text_33, get(saving) ? "Saving…" : "Save new image");
        },
        [
          () => rgbCss(get(bgRgb)),
          () => {
            var _a, _b, _c, _d, _e;
            return {
              display: ((_a = activeLayer()) == null ? void 0 : _a.visible) ? null : "none",
              opacity: ((_b = activeLayer()) == null ? void 0 : _b.opacity) ?? 1,
              "mix-blend-mode": layerBlendCss(activeLayer()),
              "mask-image": ((_c = activeLayer()) == null ? void 0 : _c.maskUrl) ? `url(${activeLayer().maskUrl})` : null,
              "mask-repeat": "no-repeat",
              "mask-position": `${((_d = activeLayer()) == null ? void 0 : _d.ox) || 0}px ${((_e = activeLayer()) == null ? void 0 : _e.oy) || 0}px`
            };
          },
          () => Math.round(get(zoom) * 100),
          () => Math.log(get(zoom))
        ]
      );
      delegated("click", button, toggleMaximize);
      delegated("click", button_1, close);
      delegated("click", button_17, undo);
      delegated("click", button_18, redo);
      delegated("click", button_19, clearAll);
      delegated("click", button_20, () => {
        get(colorPopout) ? okColorPop() : openColorPop();
      });
      delegated("click", button_21, () => {
        set(bgRgb, [...get(rgb)], true);
      });
      event("dragover", div_38, onCanvasDragOver);
      event("dragleave", div_38, () => {
        set(dragActive, false);
      });
      event("drop", div_38, onCanvasDrop);
      delegated("pointerdown", div_38, onPointerDown);
      delegated("pointermove", div_38, onPointerMove);
      delegated("pointerup", div_38, onPointerUp);
      event("pointercancel", div_38, onPointerUp);
      event("pointerleave", div_38, () => {
        set(cursorPos, null);
      });
      delegated("dblclick", div_38, () => {
        if (get(tool) === "crop" && get(cropBox)) commitCrop();
      });
      event("wheel", div_38, onWheel);
      delegated("contextmenu", div_38, (e) => e.preventDefault());
      event("dragstart", div_38, (e) => e.preventDefault());
      event("selectstart", div_38, (e) => e.preventDefault());
      event("load", img_1, () => {
        var _a, _b;
        update(imgLoadTick);
        if (((_a = activeLayer()) == null ? void 0 : _a.isBackground) && !((_b = activeLayer()) == null ? void 0 : _b.bitmap)) loadActiveBitmap();
      });
      delegated("pointerdown", div_63, navDrag);
      delegated("click", button_25, () => zoomStep(-1));
      delegated("input", input, (e) => setZoomCentered(Math.exp(parseFloat(e.target.value))));
      delegated("click", button_26, () => zoomStep(1));
      delegated("click", button_30, () => {
        set(lhTab, "layers");
      });
      delegated("click", button_31, () => {
        set(lhTab, "history");
      });
      delegated("click", button_55, close);
      delegated("click", button_56, saveEdits);
      delegated("click", button_57, save);
      append($$anchor2, div);
    };
    if_block(node, ($$render) => {
      if ($$props.open) $$render(consequent_60);
    });
  }
  append($$anchor, fragment);
  return pop($$exports);
}
delegate([
  "click",
  "change",
  "pointerdown",
  "pointermove",
  "pointerup",
  "dblclick",
  "contextmenu",
  "input",
  "keydown"
]);
var root_3$1 = from_html(`<button title="Drag the divider to wipe the source over the result">Compare</button>`);
var root_2$2 = from_html(`<div class="pcr-rp-stage-tools svelte-1elgmyq"><!> <button class="pcr-rp-fit-btn svelte-1elgmyq">Fit</button></div>`);
var root_4$2 = from_html(`<img class="pcr-rp-live svelte-1elgmyq" alt="preview" draggable="false"/>`);
var root_6$1 = from_html(`<div class="pcr-rp-split-before svelte-1elgmyq"><div class="pcr-rp-zoomwrap svelte-1elgmyq"><img class="pcr-rp-preview svelte-1elgmyq" alt="" draggable="false"/></div></div> <div class="pcr-rp-split-label before svelte-1elgmyq">Before</div> <div class="pcr-rp-split-label after svelte-1elgmyq">After</div> <div class="pcr-rp-split-divider svelte-1elgmyq"><div class="pcr-rp-split-knob svelte-1elgmyq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="svelte-1elgmyq"><polyline points="9.5 8 5.5 12 9.5 16"></polyline><polyline points="14.5 8 18.5 12 14.5 16"></polyline></svg></div></div>`, 1);
var root_5$2 = from_html(`<div class="pcr-rp-zoomwrap svelte-1elgmyq"><img class="pcr-rp-preview svelte-1elgmyq" alt="" draggable="false"/></div> <!>`, 1);
var root_7$1 = from_html(`<div class="pcr-rp-bar-wrap svelte-1elgmyq"><div class="pcr-rp-bar svelte-1elgmyq"><div class="pcr-rp-bar-fill svelte-1elgmyq"></div></div> <span> </span></div>`);
var root_8$1 = from_html(`<option> </option>`);
var root_9$1 = from_html(`<div class="pcr-rp-hint svelte-1elgmyq"> </div>`);
var root_10$1 = from_html(`<option> </option>`);
var root_12$1 = from_html(`<div class="pcr-rp-text pcr-rp-editor svelte-1elgmyq"></div>`);
var root_13$1 = from_html(`<textarea class="pcr-rp-text svelte-1elgmyq" rows="9" spellcheck="false"></textarea>`);
var root_14$1 = from_html(`<label class="pcr-rp-field svelte-1elgmyq"><span class="svelte-1elgmyq">Input scale (MP)</span><input type="number" min="0.25" max="4" step="0.25" class="svelte-1elgmyq"/></label>`);
var root_15$1 = from_html(`<label class="pcr-rp-field svelte-1elgmyq"><span class="svelte-1elgmyq">Seed</span><input type="number" class="svelte-1elgmyq"/></label>`);
var root_16$1 = from_html(`<div class="pcr-rp-hint svelte-1elgmyq">Depth-locked: the poser outputs a depth map; output follows the pose frame.</div>`);
var root_17$1 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-danger">Cancel</button>`);
var root_18$1 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-secondary">Close</button> <button class="pcr-modal-btn pcr-modal-btn-secondary">Re-Apply</button> <button class="pcr-modal-btn pcr-modal-btn-primary">Add to Edit</button>`, 1);
var root_19$1 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-secondary">Close</button> <button class="pcr-modal-btn pcr-modal-btn-primary">Retry</button>`, 1);
var root_20$1 = from_html(`<button class="pcr-modal-btn pcr-modal-btn-secondary">Cancel</button> <button class="pcr-modal-btn pcr-modal-btn-primary">Run</button>`, 1);
var root_1$2 = from_html(`<div class="pcr-modal-backdrop"><div class="pcr-modal pcr-rp-modal svelte-1elgmyq" role="dialog" aria-modal="true" aria-label="Re-pose"><div class="pcr-modal-header"><span class="pcr-modal-title"> </span> <button class="pcr-modal-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"></path></svg></button></div> <div class="pcr-modal-body pcr-rp-body svelte-1elgmyq"><div class="pcr-rp-stage svelte-1elgmyq"><div class="pcr-rp-stage-head svelte-1elgmyq"><span class="pcr-rp-stage-label svelte-1elgmyq">Pose</span></div> <div class="pcr-rp-poser-mount svelte-1elgmyq"></div></div> <div class="pcr-rp-stage svelte-1elgmyq"><div class="pcr-rp-stage-head svelte-1elgmyq"><span class="pcr-rp-stage-label svelte-1elgmyq"> </span> <!></div> <div><!></div> <!></div> <div><div class="pcr-mcard"><div class="pcr-mcard-title">Recipe</div> <select class="pcr-rp-select svelte-1elgmyq"></select> <!></div> <div class="pcr-mcard"><div class="pcr-mcard-title">Base model</div> <select class="pcr-rp-select svelte-1elgmyq"></select></div> <div class="pcr-mcard"><div class="pcr-mcard-title">Prompt</div> <!></div> <div class="pcr-mcard"><div class="pcr-mcard-title">Settings</div> <div class="pcr-rp-row svelte-1elgmyq"><label class="pcr-rp-field svelte-1elgmyq"><span class="svelte-1elgmyq">Steps</span><input type="number" min="1" max="100" class="svelte-1elgmyq"/></label> <label class="pcr-rp-field svelte-1elgmyq"><span class="svelte-1elgmyq">CFG</span><input type="number" min="1" max="20" step="0.5" class="svelte-1elgmyq"/></label></div> <div class="pcr-rp-row svelte-1elgmyq"><label class="pcr-rp-field svelte-1elgmyq"><span class="svelte-1elgmyq">Pose LoRA strength</span><input type="number" min="0" max="2" step="0.05" class="svelte-1elgmyq"/></label> <!></div> <label class="pcr-rp-check svelte-1elgmyq"><input type="checkbox"/> Randomize seed</label> <!> <!></div></div></div> <div class="pcr-modal-footer"><!></div></div></div>`);
function RePoseModal($$anchor, $$props) {
  push($$props, true);
  let open = prop($$props, "open", 3, false), sourceUrl = prop($$props, "sourceUrl", 3, ""), width = prop($$props, "width", 3, 0), height = prop($$props, "height", 3, 0), imageKey = prop(
    $$props,
    "imageKey",
    3,
    ""
    // displayedHash — the image being re-posed (save key)
  ), lineageKeys = prop($$props, "lineageKeys", 19, () => []), fetchApi = prop($$props, "fetchApi", 3, null), caps = prop(
    $$props,
    "caps",
    3,
    null
    // { recipes: [...] } from fetchReposeCaps
  ), progress = prop(
    $$props,
    "progress",
    3,
    null
    // background tracker state
  ), onMountPoser = prop(
    $$props,
    "onMountPoser",
    3,
    null
    // (el, {width,height,outputMode}) => Promise<handle>
  ), mountPromptEditor = prop(
    $$props,
    "mountPromptEditor",
    3,
    null
    // (container, initialValue, onChange, modelInfoFn) => Promise<EditorView> — shared rich editor (inpaint/upscale)
  ), onRun = prop(
    $$props,
    "onRun",
    3,
    null
    // (opts) => void
  ), onUseInEdit = prop(
    $$props,
    "onUseInEdit",
    3,
    null
    // (doneState) => void — add the result into the editor as a layer (inpaint/upscale pattern)
  ), onCancel = prop($$props, "onCancel", 3, () => {
  });
  const recipes = user_derived(() => {
    var _a;
    return ((_a = caps()) == null ? void 0 : _a.recipes) || [];
  });
  let selectedRecipeId = state("");
  const recipe = user_derived(() => get(recipes).find((r) => r.id === get(selectedRecipeId)) || null);
  let modelFilename = state("");
  let promptDoc = state("");
  let seed = state(0);
  let randomizeSeed = state(true);
  let steps = state(20);
  let cfg = state(5);
  let loraStrength = state(
    0.7
    // pose-LoRA weight (the "pattern" strength)
  );
  let megapixels = state(
    1
    // Qwen input-image scale target (AnyPose only)
  );
  let poserEl = state(
    null
    // $state so the mount effect re-runs when the element rebinds on reopen
  );
  let poserHandle = state(
    null
    // $state so the scene-load effect reacts when it mounts
  );
  user_effect(() => {
    if (!open()) return;
    if (!get(selectedRecipeId) || !get(recipes).some((r) => r.id === get(selectedRecipeId))) {
      const first = get(recipes).find((r) => r.ok) || get(recipes)[0];
      if (first) untrack(() => applyRecipeDefaults(first));
    }
  });
  function recipeDoc(r) {
    return (r == null ? void 0 : r.promptDoc) || "";
  }
  function applyRecipeDefaults(r) {
    var _a, _b, _c, _d;
    set(selectedRecipeId, r.id, true);
    set(promptDoc, recipeDoc(r), true);
    set(steps, ((_a = r.sampler) == null ? void 0 : _a.steps) ?? 20, true);
    set(cfg, ((_b = r.sampler) == null ? void 0 : _b.cfg) ?? 5, true);
    set(loraStrength, r.loraStrength ?? 0.7, true);
    set(megapixels, r.megapixels ?? 1, true);
    set(modelFilename, ((_d = (_c = r.models) == null ? void 0 : _c[0]) == null ? void 0 : _d.filename) || "", true);
  }
  function onRecipeChange(e) {
    const r = get(recipes).find((x) => x.id === e.target.value);
    if (r) applyRecipeDefaults(r);
  }
  function editorModelInfo() {
    var _a;
    const m = (((_a = get(recipe)) == null ? void 0 : _a.models) || []).find((x) => x.filename === get(modelFilename));
    return m ? { hash: m.hash, architecture: m.architecture } : null;
  }
  function promptEditor(node) {
    let disposed = false, view = null;
    (async () => {
      var _a;
      if (!mountPromptEditor()) return;
      const v = await mountPromptEditor()(
        node,
        untrack(() => get(promptDoc)),
        (text) => {
          set(promptDoc, text, true);
        },
        editorModelInfo
      );
      if (disposed) (_a = v == null ? void 0 : v.destroy) == null ? void 0 : _a.call(v);
      else view = v;
    })();
    return {
      destroy() {
        var _a;
        disposed = true;
        (_a = view == null ? void 0 : view.destroy) == null ? void 0 : _a.call(view);
      }
    };
  }
  user_effect(() => {
    if (!open() || !get(poserEl) || !onMountPoser() || !get(restoreReady)) return;
    let disposed = false, handle = null;
    const w = untrack(() => width()) || 832;
    const h = untrack(() => height()) || 1216;
    const mode = untrack(() => {
      var _a;
      return (_a = get(recipe)) == null ? void 0 : _a.poserMode;
    }) || "default";
    const seed2 = untrack(() => get(restorePoseState)) || "";
    Promise.resolve(onMountPoser()(get(poserEl), { width: w, height: h, outputMode: mode, poseState: seed2 })).then((hd) => {
      var _a;
      if (disposed) (_a = hd == null ? void 0 : hd.dispose) == null ? void 0 : _a.call(hd);
      else {
        handle = hd;
        set(poserHandle, hd, true);
      }
    }).catch((err) => console.error("[Re-pose] poser mount failed", err));
    return () => {
      var _a;
      disposed = true;
      (_a = handle == null ? void 0 : handle.dispose) == null ? void 0 : _a.call(handle);
      if (get(poserHandle) === handle) set(poserHandle, null);
    };
  });
  user_effect(() => {
    var _a;
    const mode = (_a = get(recipe)) == null ? void 0 : _a.poserMode;
    if (get(poserHandle) && mode) untrack(() => {
      var _a2, _b;
      return (_b = (_a2 = get(poserHandle)).setOutputMode) == null ? void 0 : _b.call(_a2, mode);
    });
  });
  const running = user_derived(() => progress() && ["building", "queueing", "running"].includes(progress().phase));
  const canRun = user_derived(() => {
    var _a;
    return !!((_a = get(recipe)) == null ? void 0 : _a.ok) && !!get(modelFilename) && !get(running);
  });
  const progressPct = user_derived(() => {
    var _a, _b;
    return ((_a = progress()) == null ? void 0 : _a.max) ? Math.min(100, Math.round(progress().value / progress().max * 100)) : ((_b = progress()) == null ? void 0 : _b.phase) === "done" ? 100 : 0;
  });
  async function run() {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!get(canRun) || !onRun()) return;
    const cm = await ((_b = (_a = get(poserHandle)) == null ? void 0 : _a.captureNow) == null ? void 0 : _b.call(_a, get(recipe).poserMode)) || ((_d = (_c = get(poserHandle)) == null ? void 0 : _c.getControlMap) == null ? void 0 : _d.call(_c)) || { filename: "" };
    if (!cm.filename) {
      console.warn("[Re-pose] no control map yet");
      return;
    }
    onRun()({
      recipe: get(
        recipe
        // caps entry: lora/clip/vae/templateId
      ),
      modelFilename: get(modelFilename),
      promptDoc: get(
        promptDoc
        // raw PromptChain doc — compiled server-side (single source of truth)
      ),
      loraStrength: get(
        loraStrength
        // pose-LoRA weight override
      ),
      megapixels: get(
        recipe
        // Qwen input scale (AnyPose only)
      ).megapixels ? get(megapixels) : null,
      sampler: {
        seed: get(
          randomizeSeed
          // 0 → runner randomizes
        ) ? 0 : get(seed),
        steps: get(steps),
        cfg: get(cfg),
        sampler: ((_e = get(recipe).sampler) == null ? void 0 : _e.sampler) || "euler",
        scheduler: ((_f = get(recipe).sampler) == null ? void 0 : _f.scheduler) || "simple",
        denoise: ((_g = get(recipe).sampler) == null ? void 0 : _g.denoise) ?? 1
      },
      controlMapFilename: cm.filename
    });
    saveModalSetup(
      fetchApi(),
      imageKey(),
      "repose",
      {
        recipeId: get(selectedRecipeId),
        modelFilename: get(modelFilename),
        promptDoc: get(promptDoc),
        steps: get(steps),
        cfg: get(cfg),
        loraStrength: get(loraStrength),
        megapixels: get(megapixels),
        randomizeSeed: get(randomizeSeed),
        seed: get(seed),
        poseState: cm.poseState || ""
        // the full 3D scene, seeded into the poser on restore
      },
      { w: width(), h: height() }
    );
  }
  let promptRestoreNonce = state(
    0
    // bump to force the prompt editor to reseed
  );
  let restoreReady = state(
    false
    // restore attempt done — GATES the poser mount
  );
  let restorePoseState = state(
    ""
    // saved scene to SEED the poser with at mount
  );
  let attempted = false;
  function restoreKeys() {
    const ks = lineageKeys() && lineageKeys().length ? lineageKeys() : imageKey() ? [imageKey()] : [];
    return ks.filter(Boolean);
  }
  user_effect(() => {
    if (!open()) {
      attempted = false;
      set(restoreReady, false);
      set(restorePoseState, "");
      return;
    }
    if (!fetchApi() || attempted) return;
    const keys = restoreKeys();
    if (!keys.length) return;
    attempted = true;
    let cancelled = false;
    (async () => {
      var _a;
      for (const k of keys) {
        const doc = await loadModalSetup(fetchApi(), k);
        if (cancelled) return;
        const rp = (_a = doc == null ? void 0 : doc.kinds) == null ? void 0 : _a.repose;
        if (rp) {
          applySetup(rp);
          set(
            restorePoseState,
            rp.poseState || "",
            // seed the poser (mount effect)
            true
          );
          set(restoreReady, true);
          return;
        }
      }
      if (!cancelled) {
        set(restorePoseState, "");
        set(restoreReady, true);
      }
    })();
    return () => {
      cancelled = true;
    };
  });
  function applySetup(s) {
    var _a;
    if (!s) return;
    if (typeof s.recipeId === "string") {
      const r = get(recipes).find((x) => x.id === s.recipeId);
      if (r) applyRecipeDefaults(r);
    }
    if (typeof s.modelFilename === "string" && (((_a = get(recipe)) == null ? void 0 : _a.models) || []).some((m) => m.filename === s.modelFilename)) {
      set(modelFilename, s.modelFilename, true);
    }
    if (typeof s.steps === "number") set(steps, s.steps, true);
    if (typeof s.cfg === "number") set(cfg, s.cfg, true);
    if (typeof s.loraStrength === "number") set(loraStrength, s.loraStrength, true);
    if (typeof s.megapixels === "number") set(megapixels, s.megapixels, true);
    if (typeof s.randomizeSeed === "boolean") set(randomizeSeed, s.randomizeSeed, true);
    if (typeof s.seed === "number") set(seed, s.seed, true);
    if (typeof s.promptDoc === "string" && s.promptDoc.trim()) {
      set(promptDoc, s.promptDoc, true);
      update(promptRestoreNonce);
    }
  }
  function progressText(p) {
    if (!p) return "";
    if (p.phase === "building") return "Building graph…";
    if (p.phase === "queueing") return "Queueing…";
    if (p.phase === "running") return p.max ? `Rendering… ${p.value}/${p.max} (${get(progressPct)}%)` : "Rendering…";
    if (p.phase === "done") return "Done.";
    if (p.phase === "error") return `Error: ${p.message || "failed"}`;
    if (p.phase === "cancelled") return "Cancelled.";
    return "";
  }
  let liveTile = user_derived(() => {
    var _a;
    return get(running) && ((_a = progress()) == null ? void 0 : _a.previewUrl) ? progress().previewUrl : null;
  });
  let inspectSrc = user_derived(() => {
    var _a, _b;
    return ((_a = progress()) == null ? void 0 : _a.phase) === "done" && ((_b = progress()) == null ? void 0 : _b.resultUrl) ? progress().resultUrl : get(running) ? null : sourceUrl() || null;
  });
  let stageEl;
  let imgNatW = state(0);
  let imgNatH = state(0);
  let zoom = state(1);
  let panX = state(0);
  let panY = state(0);
  let panning = false;
  let panLast = null;
  function fitView() {
    if (!stageEl || !get(imgNatW) || !get(imgNatH)) {
      set(zoom, 1);
      set(panX, 0);
      set(panY, 0);
      return;
    }
    const r = stageEl.getBoundingClientRect();
    set(zoom, Math.min(r.width / get(imgNatW), r.height / get(imgNatH), 1) || 1, true);
    set(panX, (r.width - get(imgNatW) * get(zoom)) / 2);
    set(panY, (r.height - get(imgNatH) * get(zoom)) / 2);
  }
  function onPreviewLoad(e) {
    set(imgNatW, e.currentTarget.naturalWidth || 0, true);
    set(imgNatH, e.currentTarget.naturalHeight || 0, true);
    fitView();
  }
  function onStageDown(e) {
    if (e.button > 2 || !get(inspectSrc)) return;
    panning = true;
    panLast = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    stageEl.setPointerCapture(e.pointerId);
  }
  function onStageMove(e) {
    if (!panning) return;
    set(panX, get(panX) + (e.clientX - panLast.x));
    set(panY, get(panY) + (e.clientY - panLast.y));
    panLast = { x: e.clientX, y: e.clientY };
  }
  function onStageUp(e) {
    if (!panning) return;
    panning = false;
    panLast = null;
    try {
      stageEl.releasePointerCapture(e.pointerId);
    } catch {
    }
  }
  function onStageWheel(e) {
    if (!get(inspectSrc) || !get(imgNatW)) return;
    e.preventDefault();
    const r = stageEl.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nz = Math.max(0.05, Math.min(12, get(zoom) * f));
    set(panX, cx - (cx - get(panX)) / get(zoom) * nz);
    set(panY, cy - (cy - get(panY)) / get(zoom) * nz);
    set(zoom, nz, true);
  }
  let compareSplit = state(false);
  let splitX = state(0);
  let splitDragging = false;
  let canCompare = user_derived(() => {
    var _a, _b;
    return !get(running) && !!sourceUrl() && ((_a = progress()) == null ? void 0 : _a.phase) === "done" && !!((_b = progress()) == null ? void 0 : _b.resultUrl);
  });
  user_effect(() => {
    if (!get(canCompare) && get(compareSplit)) set(compareSplit, false);
  });
  function toggleCompare() {
    if (!get(canCompare)) return;
    set(compareSplit, !get(compareSplit));
    if (get(compareSplit)) {
      const r = stageEl == null ? void 0 : stageEl.getBoundingClientRect();
      set(
        splitX,
        r ? r.width / 2 : 0,
        // open centered so both halves show
        true
      );
    }
  }
  function onSplitDown(e) {
    e.stopPropagation();
    e.preventDefault();
    splitDragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onSplitMove(e) {
    if (!splitDragging) return;
    e.stopPropagation();
    const r = stageEl.getBoundingClientRect();
    set(splitX, Math.max(0, Math.min(r.width, e.clientX - r.left)), true);
  }
  function onSplitUp(e) {
    splitDragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
  }
  var fragment = comment();
  var node_1 = first_child(fragment);
  {
    var consequent_14 = ($$anchor2) => {
      var div = root_1$2();
      set_style(div, "", {}, { "z-index": 10006 });
      var div_1 = child(div);
      var div_2 = child(div_1);
      var span = child(div_2);
      var text_1 = child(span);
      var button = sibling(span, 2);
      var div_3 = sibling(div_2, 2);
      var div_4 = child(div_3);
      var div_5 = sibling(child(div_4), 2);
      bind_this(div_5, ($$value) => set(poserEl, $$value), () => get(poserEl));
      var div_6 = sibling(div_4, 2);
      var div_7 = child(div_6);
      var span_1 = child(div_7);
      var text_2 = child(span_1);
      var node_2 = sibling(span_1, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var div_8 = root_2$2();
          var node_3 = child(div_8);
          {
            var consequent = ($$anchor4) => {
              var button_1 = root_3$1();
              let classes;
              template_effect(() => classes = set_class(button_1, 1, "pcr-rp-fit-btn svelte-1elgmyq", null, classes, { on: get(compareSplit) }));
              delegated("click", button_1, toggleCompare);
              append($$anchor4, button_1);
            };
            if_block(node_3, ($$render) => {
              if (get(canCompare)) $$render(consequent);
            });
          }
          var button_2 = sibling(node_3, 2);
          delegated("click", button_2, fitView);
          append($$anchor3, div_8);
        };
        if_block(node_2, ($$render) => {
          if (get(inspectSrc) && get(imgNatW)) $$render(consequent_1);
        });
      }
      var div_9 = sibling(div_7, 2);
      let classes_1;
      var node_4 = child(div_9);
      {
        var consequent_2 = ($$anchor3) => {
          var img = root_4$2();
          template_effect(() => set_attribute(img, "src", get(liveTile)));
          append($$anchor3, img);
        };
        var consequent_4 = ($$anchor3) => {
          var fragment_1 = root_5$2();
          var div_10 = first_child(fragment_1);
          var img_1 = child(div_10);
          var node_5 = sibling(div_10, 2);
          {
            var consequent_3 = ($$anchor4) => {
              var fragment_2 = root_6$1();
              var div_11 = first_child(fragment_2);
              var div_12 = child(div_11);
              var img_2 = child(div_12);
              var div_13 = sibling(div_11, 6);
              template_effect(() => {
                set_style(div_11, `clip-path: inset(0 calc(100% - ${get(splitX) ?? ""}px) 0 0);`);
                set_style(div_12, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""});`);
                set_attribute(img_2, "src", sourceUrl());
                set_attribute(img_2, "width", get(imgNatW));
                set_attribute(img_2, "height", get(imgNatH));
                set_style(div_13, `left: ${get(splitX) ?? ""}px;`);
              });
              delegated("pointerdown", div_13, onSplitDown);
              delegated("pointermove", div_13, onSplitMove);
              delegated("pointerup", div_13, onSplitUp);
              event("pointercancel", div_13, onSplitUp);
              append($$anchor4, fragment_2);
            };
            if_block(node_5, ($$render) => {
              if (get(compareSplit) && get(canCompare)) $$render(consequent_3);
            });
          }
          template_effect(() => {
            set_style(div_10, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""});`);
            set_attribute(img_1, "src", get(inspectSrc));
          });
          event("load", img_1, onPreviewLoad);
          append($$anchor3, fragment_1);
        };
        if_block(node_4, ($$render) => {
          if (get(liveTile)) $$render(consequent_2);
          else if (get(inspectSrc)) $$render(consequent_4, 1);
        });
      }
      bind_this(div_9, ($$value) => stageEl = $$value, () => stageEl);
      var node_6 = sibling(div_9, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var div_14 = root_7$1();
          var div_15 = child(div_14);
          var div_16 = child(div_15);
          let styles;
          var span_2 = sibling(div_15, 2);
          let classes_2;
          var text_3 = child(span_2);
          template_effect(
            ($0) => {
              styles = set_style(div_16, "", styles, { width: get(progressPct) + "%" });
              classes_2 = set_class(span_2, 1, "pcr-rp-bar-text svelte-1elgmyq", null, classes_2, { err: progress().phase === "error" });
              set_text(text_3, $0);
            },
            [() => progressText(progress())]
          );
          append($$anchor3, div_14);
        };
        if_block(node_6, ($$render) => {
          if (progress() && progress().phase !== "building") $$render(consequent_5);
        });
      }
      var div_17 = sibling(div_6, 2);
      let classes_3;
      var div_18 = child(div_17);
      var select = sibling(child(div_18), 2);
      each(select, 21, () => get(recipes), index, ($$anchor3, r) => {
        var option = root_8$1();
        var text_4 = child(option);
        var option_value = {};
        template_effect(() => {
          option.disabled = !get(r).ok;
          set_text(text_4, `${get(r).label ?? ""}${get(r).ok ? "" : ` — ${get(r).reason}`}`);
          if (option_value !== (option_value = get(r).id)) {
            option.value = (option.__value = get(r).id) ?? "";
          }
        });
        append($$anchor3, option);
      });
      var select_value;
      init_select(select);
      var node_7 = sibling(select, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var div_19 = root_9$1();
          var text_5 = child(div_19);
          template_effect(() => set_text(text_5, get(recipe).blurb));
          append($$anchor3, div_19);
        };
        if_block(node_7, ($$render) => {
          if (get(recipe)) $$render(consequent_6);
        });
      }
      var div_20 = sibling(div_18, 2);
      var select_1 = sibling(child(div_20), 2);
      each(select_1, 21, () => {
        var _a;
        return ((_a = get(recipe)) == null ? void 0 : _a.models) || [];
      }, index, ($$anchor3, m) => {
        var option_1 = root_10$1();
        var text_6 = child(option_1);
        var option_1_value = {};
        template_effect(() => {
          set_text(text_6, get(m).displayName);
          if (option_1_value !== (option_1_value = get(m).filename)) {
            option_1.value = (option_1.__value = get(m).filename) ?? "";
          }
        });
        append($$anchor3, option_1);
      });
      var div_21 = sibling(div_20, 2);
      var node_8 = sibling(child(div_21), 2);
      key(node_8, () => get(selectedRecipeId) + ":" + get(promptRestoreNonce), ($$anchor3) => {
        var fragment_3 = comment();
        var node_9 = first_child(fragment_3);
        {
          var consequent_7 = ($$anchor4) => {
            var div_22 = root_12$1();
            action(div_22, ($$node) => promptEditor == null ? void 0 : promptEditor($$node));
            append($$anchor4, div_22);
          };
          var alternate = ($$anchor4) => {
            var textarea = root_13$1();
            bind_value(textarea, () => get(promptDoc), ($$value) => set(promptDoc, $$value));
            append($$anchor4, textarea);
          };
          if_block(node_9, ($$render) => {
            if (mountPromptEditor()) $$render(consequent_7);
            else $$render(alternate, -1);
          });
        }
        append($$anchor3, fragment_3);
      });
      var div_23 = sibling(div_21, 2);
      var div_24 = sibling(child(div_23), 2);
      var label = child(div_24);
      var input = sibling(child(label));
      var label_1 = sibling(label, 2);
      var input_1 = sibling(child(label_1));
      var div_25 = sibling(div_24, 2);
      var label_2 = child(div_25);
      var input_2 = sibling(child(label_2));
      var node_10 = sibling(label_2, 2);
      {
        var consequent_8 = ($$anchor3) => {
          var label_3 = root_14$1();
          var input_3 = sibling(child(label_3));
          bind_value(input_3, () => get(megapixels), ($$value) => set(megapixels, $$value));
          append($$anchor3, label_3);
        };
        if_block(node_10, ($$render) => {
          var _a;
          if ((_a = get(recipe)) == null ? void 0 : _a.megapixels) $$render(consequent_8);
        });
      }
      var label_4 = sibling(div_25, 2);
      var input_4 = child(label_4);
      var node_11 = sibling(label_4, 2);
      {
        var consequent_9 = ($$anchor3) => {
          var label_5 = root_15$1();
          var input_5 = sibling(child(label_5));
          bind_value(input_5, () => get(seed), ($$value) => set(seed, $$value));
          append($$anchor3, label_5);
        };
        if_block(node_11, ($$render) => {
          if (!get(randomizeSeed)) $$render(consequent_9);
        });
      }
      var node_12 = sibling(node_11, 2);
      {
        var consequent_10 = ($$anchor3) => {
          var div_26 = root_16$1();
          append($$anchor3, div_26);
        };
        if_block(node_12, ($$render) => {
          var _a;
          if (((_a = get(recipe)) == null ? void 0 : _a.poserMode) === "depth") $$render(consequent_10);
        });
      }
      var div_27 = sibling(div_3, 2);
      var node_13 = child(div_27);
      {
        var consequent_11 = ($$anchor3) => {
          var button_3 = root_17$1();
          delegated("click", button_3, () => onCancel()());
          append($$anchor3, button_3);
        };
        var consequent_12 = ($$anchor3) => {
          var fragment_4 = root_18$1();
          var button_4 = first_child(fragment_4);
          var button_5 = sibling(button_4, 2);
          var button_6 = sibling(button_5, 2);
          template_effect(() => {
            button_5.disabled = !get(canRun);
            button_6.disabled = !onUseInEdit() || !progress().resultUrl;
          });
          delegated("click", button_4, () => onCancel()());
          delegated("click", button_5, run);
          delegated("click", button_6, () => {
            var _a;
            return (_a = onUseInEdit()) == null ? void 0 : _a(progress());
          });
          append($$anchor3, fragment_4);
        };
        var consequent_13 = ($$anchor3) => {
          var fragment_5 = root_19$1();
          var button_7 = first_child(fragment_5);
          var button_8 = sibling(button_7, 2);
          template_effect(() => button_8.disabled = !get(canRun));
          delegated("click", button_7, () => onCancel()());
          delegated("click", button_8, run);
          append($$anchor3, fragment_5);
        };
        var alternate_1 = ($$anchor3) => {
          var fragment_6 = root_20$1();
          var button_9 = first_child(fragment_6);
          var button_10 = sibling(button_9, 2);
          template_effect(() => button_10.disabled = !get(canRun));
          delegated("click", button_9, () => onCancel()());
          delegated("click", button_10, run);
          append($$anchor3, fragment_6);
        };
        if_block(node_13, ($$render) => {
          var _a, _b;
          if (get(running)) $$render(consequent_11);
          else if (((_a = progress()) == null ? void 0 : _a.phase) === "done") $$render(consequent_12, 1);
          else if (((_b = progress()) == null ? void 0 : _b.phase) === "error") $$render(consequent_13, 2);
          else $$render(alternate_1, -1);
        });
      }
      action(div, ($$node) => {
        var _a;
        return (_a = portal) == null ? void 0 : _a($$node);
      });
      template_effect(() => {
        var _a, _b, _c, _d;
        set_text(text_1, get(running) ? "Re-posing…" : ((_a = progress()) == null ? void 0 : _a.phase) === "done" ? "Re-pose Complete" : "Re-pose");
        set_text(text_2, get(running) ? "Rendering" : ((_b = progress()) == null ? void 0 : _b.phase) === "done" ? "Result" : "Source");
        classes_1 = set_class(div_9, 1, "pcr-rp-stage-img svelte-1elgmyq", null, classes_1, { zoomable: !!get(inspectSrc) });
        classes_3 = set_class(div_17, 1, "pcr-rp-config svelte-1elgmyq", null, classes_3, { running: get(running) });
        if (select_value !== (select_value = get(selectedRecipeId))) {
          select.value = (select.__value = get(selectedRecipeId)) ?? "", select_option(select, get(selectedRecipeId));
        }
        select_1.disabled = !((_d = (_c = get(recipe)) == null ? void 0 : _c.models) == null ? void 0 : _d.length);
      });
      delegated("click", button, () => !get(running) && onCancel()());
      delegated("pointerdown", div_9, onStageDown);
      delegated("pointermove", div_9, onStageMove);
      delegated("pointerup", div_9, onStageUp);
      event("pointercancel", div_9, onStageUp);
      event("wheel", div_9, onStageWheel);
      delegated("dblclick", div_9, fitView);
      delegated("contextmenu", div_9, (e) => e.preventDefault());
      delegated("change", select, onRecipeChange);
      bind_select_value(select_1, () => get(modelFilename), ($$value) => set(modelFilename, $$value));
      bind_value(input, () => get(steps), ($$value) => set(steps, $$value));
      bind_value(input_1, () => get(cfg), ($$value) => set(cfg, $$value));
      bind_value(input_2, () => get(loraStrength), ($$value) => set(loraStrength, $$value));
      bind_checked(input_4, () => get(randomizeSeed), ($$value) => set(randomizeSeed, $$value));
      append($$anchor2, div);
    };
    if_block(node_1, ($$render) => {
      if (open()) $$render(consequent_14);
    });
  }
  append($$anchor, fragment);
  pop();
}
delegate([
  "click",
  "pointerdown",
  "pointermove",
  "pointerup",
  "dblclick",
  "contextmenu",
  "change"
]);
var root_1$1 = from_html(`<button class="pcr-ctx-item svelte-esmc9y">Edit</button>`);
var root_2$1 = from_html(`<button class="pcr-ctx-item pcr-ctx-danger svelte-esmc9y">Delete</button>`);
var root_4$1 = from_html(`<div class="pcr-ctx-sep svelte-esmc9y"></div>`);
var root_5$1 = from_html(`<button class="pcr-ctx-item svelte-esmc9y">Properties</button>`);
var root_3 = from_html(`<!> <button class="pcr-ctx-item svelte-esmc9y">Open File</button> <button class="pcr-ctx-item svelte-esmc9y">Open Folder</button> <!>`, 1);
var root$1 = from_html(`<div class="pcr-ctx svelte-esmc9y"><!> <!> <!></div>`);
function LineageContextMenu($$anchor, $$props) {
  push($$props, true);
  let canEdit = prop($$props, "canEdit", 3, false), canDelete = prop($$props, "canDelete", 3, false), isLocal = prop($$props, "isLocal", 3, false), isWindows = prop($$props, "isWindows", 3, false), orphaned = prop($$props, "orphaned", 3, false);
  let menuEl;
  function act(action2) {
    var _a, _b;
    (_a = $$props.onAction) == null ? void 0 : _a.call($$props, action2);
    (_b = $$props.onClose) == null ? void 0 : _b.call($$props);
  }
  let pos = user_derived(() => (() => {
    const mw = 180, mh = 280;
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
  var div = root$1();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var button = root_1$1();
      delegated("click", button, () => act("edit"));
      append($$anchor2, button);
    };
    if_block(node, ($$render) => {
      if (canEdit()) $$render(consequent);
    });
  }
  var node_1 = sibling(node, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var button_1 = root_2$1();
      delegated("click", button_1, () => act("delete"));
      append($$anchor2, button_1);
    };
    if_block(node_1, ($$render) => {
      if (canDelete()) $$render(consequent_1);
    });
  }
  var node_2 = sibling(node_1, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var fragment = root_3();
      var node_3 = first_child(fragment);
      {
        var consequent_2 = ($$anchor3) => {
          var div_1 = root_4$1();
          append($$anchor3, div_1);
        };
        if_block(node_3, ($$render) => {
          if (canEdit() || canDelete()) $$render(consequent_2);
        });
      }
      var button_2 = sibling(node_3, 2);
      var button_3 = sibling(button_2, 2);
      var node_4 = sibling(button_3, 2);
      {
        var consequent_3 = ($$anchor3) => {
          var button_4 = root_5$1();
          template_effect(() => button_4.disabled = orphaned());
          delegated("click", button_4, () => act("properties"));
          append($$anchor3, button_4);
        };
        if_block(node_4, ($$render) => {
          if (isWindows()) $$render(consequent_3);
        });
      }
      template_effect(() => {
        button_2.disabled = orphaned();
        button_3.disabled = orphaned();
      });
      delegated("click", button_2, () => act("open-file"));
      delegated("click", button_3, () => act("open-folder"));
      append($$anchor2, fragment);
    };
    if_block(node_2, ($$render) => {
      if (isLocal()) $$render(consequent_4);
    });
  }
  action(div, ($$node) => {
    var _a;
    return (_a = portal) == null ? void 0 : _a($$node);
  });
  bind_this(div, ($$value) => menuEl = $$value, () => menuEl);
  template_effect(() => set_style(div, `left:${get(pos).left ?? ""}px;top:${get(pos).top ?? ""}px;`));
  append($$anchor, div);
  pop();
}
delegate(["click"]);
function regionFigureIndices(regionList, poseJson) {
  let names = [];
  let numFigures = null;
  if (poseJson && poseJson.trim()) {
    try {
      const pose = JSON.parse(poseJson);
      const ents = Array.isArray(pose.regionEntities) && pose.regionEntities.length ? pose.regionEntities : null;
      if (ents) {
        names = ents.map((e) => String(e && e.name || "").toLowerCase());
        numFigures = ents.filter((e) => e && e.kind === "figure").length;
      } else if (Array.isArray(pose.figures)) {
        names = pose.figures.map((f, i) => String(f && f.name || `mannequin${i + 1}`).toLowerCase());
      }
    } catch {
    }
  }
  return regionList.map((r, n) => {
    const rname = String((r == null ? void 0 : r.name) || "").toLowerCase();
    const hit = rname ? names.indexOf(rname) : -1;
    if (hit >= 0) return hit;
    let idx = parseInt(r == null ? void 0 : r.id, 10);
    idx = Number.isFinite(idx) ? idx - 1 : n;
    if (numFigures !== null) idx = Math.min(Math.max(idx, 0), Math.max(numFigures, 1) - 1);
    return idx;
  });
}
async function matchRegionByOverlap(probeCanvas, regions, width, height) {
  if (!probeCanvas || !(regions == null ? void 0 : regions.length) || !(width > 0) || !(height > 0)) return null;
  const pdata = probeCanvas.getContext("2d").getImageData(0, 0, width, height).data;
  let probeCount = 0;
  for (let i = 3; i < pdata.length; i += 4) if (pdata[i] > 127) probeCount++;
  if (!probeCount) return null;
  let best = null, bestScore = 0;
  for (const r of regions) {
    if (!r.maskUrl || !r.text) continue;
    let bmp;
    try {
      const resp = await fetch(r.maskUrl);
      if (!resp.ok) continue;
      bmp = await createImageBitmap(await resp.blob());
    } catch {
      continue;
    }
    const rc = document.createElement("canvas");
    rc.width = width;
    rc.height = height;
    const rctx = rc.getContext("2d");
    rctx.drawImage(bmp, 0, 0, width, height);
    const rdata = rctx.getImageData(0, 0, width, height).data;
    let overlap = 0;
    for (let i = 0; i < pdata.length; i += 4) {
      if (pdata[i + 3] > 127 && rdata[i] > 64) overlap++;
    }
    const score = overlap / probeCount;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore >= 0.2 ? best : null;
}
function buildFigureRegions({ workflow, regionsRaw, poseFilesOk, apiURL }) {
  try {
    if (!workflow || poseFilesOk === false) return [];
    let regions = regionsRaw;
    if (typeof regions === "string") {
      try {
        regions = JSON.parse(regions);
      } catch {
        return [];
      }
    }
    const list = Array.isArray(regions == null ? void 0 : regions.regions) ? regions.regions : [];
    if (!list.length) return [];
    const poser = (workflow.nodes || []).find((n) => n.type === "PromptChain_PoseStudio");
    const values = (poser == null ? void 0 : poser.widgets_values) || [];
    const mapRef = typeof values[0] === "string" ? values[0].trim().replace(/\s*\[\w+\]$/, "") : "";
    if (!mapRef) return [];
    const poseState = typeof values[1] === "string" ? values[1] : "";
    const indices = regionFigureIndices(list, poseState);
    const slash = mapRef.lastIndexOf("/");
    const subfolder = slash >= 0 ? mapRef.slice(0, slash) : "";
    const baseName = (slash >= 0 ? mapRef.slice(slash + 1) : mapRef).replace(/\.[^.]+$/, "");
    return list.map((r, i) => ({
      name: r.name || `region ${i + 1}`,
      text: (r.text || "").trim(),
      maskUrl: apiURL(`/view?filename=${encodeURIComponent(`${baseName}_mask${indices[i]}.png`)}&type=input&subfolder=${encodeURIComponent(subfolder)}`)
    }));
  } catch {
    return [];
  }
}
var root_1 = from_html(`<div class="pcr-viewer-newgen-banner svelte-5cciiw"> </div>`);
var root_5 = from_html(`<div class="pcr-viewer-lineage-layers svelte-5cciiw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="svelte-5cciiw"><path d="M12 2 2 7l10 5 10-5-10-5Z"></path><path d="m2 17 10 5 10-5"></path><path d="m2 12 10 5 10-5"></path></svg></div>`);
var root_4 = from_html(`<div><img alt="" draggable="false" loading="lazy" class="svelte-5cciiw"/> <div></div> <!></div>`);
var root_8 = from_html(`<img alt="" draggable="false" loading="lazy" class="svelte-5cciiw"/>`);
var root_7 = from_html(`<div class="pcr-viewer-lineage-bundle-stack svelte-5cciiw"></div> <span class="pcr-viewer-lineage-bundle-count svelte-5cciiw"> </span>`, 1);
var root_9 = from_html(`<span class="pcr-viewer-lineage-bundle-count svelte-5cciiw">▴</span>`);
var root_6 = from_html(`<div><!></div>`);
var root_10 = from_html(`<div class="pcr-viewer-lineage-hidden svelte-5cciiw"> </div>`);
var root_2 = from_html(`<div class="pcr-viewer-lineage pcr-viewer-lineage-visible svelte-5cciiw"><div class="pcr-viewer-lineage-header svelte-5cciiw"> </div> <div class="pcr-viewer-lineage-strip svelte-5cciiw"></div> <!></div>`);
var root_11 = from_html(`<div class="pcr-viewer-lineage svelte-5cciiw"></div>`);
var root_13 = from_html(`<div> </div>`);
var root_14 = from_html(`<div> </div>`);
var root_15 = from_html(`<div class="pcr-viewer-tip-layers svelte-5cciiw"> </div>`);
var root_12 = from_html(`<div class="pcr-viewer-tip svelte-5cciiw"><div class="pcr-viewer-tip-name svelte-5cciiw"> </div> <!> <!> <!></div>`);
var root_17 = from_html(`<div class="pcr-viewer-spinner svelte-5cciiw"></div>`);
var root_18 = from_html(`<img alt="Compare" draggable="false" class="pcr-viewer-image pcr-viewer-after-image svelte-5cciiw"/>`);
var root_21 = from_html(`<div class="pcr-viewer-error-msg svelte-5cciiw"> </div>`);
var root_20 = from_html(
  `<div class="pcr-viewer-error-hint svelte-5cciiw">This image's record points to a file that no longer exists. If the
              file was moved or renamed, locate it — it's verified against the
              image's content hash, so the wrong file can't be attached.</div> <button class="pcr-viewer-reattach-btn svelte-5cciiw"> </button> <!> <input type="file" accept="image/*" style="display:none"/>`,
  1
);
var root_19 = from_html(`<div class="pcr-viewer-error svelte-5cciiw"><div> </div> <!></div>`);
var root_23 = from_html(`<div class="pcr-viewer-compare-label-age svelte-5cciiw"> </div>`);
var root_24 = from_html(`<div class="pcr-viewer-compare-label-age svelte-5cciiw"> </div>`);
var root_22 = from_html(`<div class="pcr-viewer-compare-slider svelte-5cciiw"><div class="pcr-viewer-compare-handle svelte-5cciiw"><div class="pcr-viewer-compare-line svelte-5cciiw"></div> <div class="pcr-viewer-compare-circle svelte-5cciiw"><svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h160v80H200v480h160v80H200Zm240 80v-800h80v80h240q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H520v80h-80Zm80-160h240v-480H520v480Zm-320 0v-480 480Zm560 0v-480 480Z"></path></svg></div> <div class="pcr-viewer-compare-line svelte-5cciiw"></div></div></div> <div class="pcr-viewer-compare-label pcr-viewer-compare-label-before svelte-5cciiw"> <!></div> <div class="pcr-viewer-compare-label pcr-viewer-compare-label-after svelte-5cciiw"> <!></div>`, 1);
var root_16 = from_html(`<!> <img alt="" draggable="false"/> <!> <!> <!>`, 1);
var root_25 = from_html(`<div class="pcr-viewer-nav pcr-viewer-nav-left svelte-5cciiw"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path></svg></div>`);
var root_26 = from_html(`<div class="pcr-viewer-nav pcr-viewer-nav-right svelte-5cciiw"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"></path></svg></div>`);
var root_28 = from_html(`<div><img alt="" draggable="false" loading="lazy" class="svelte-5cciiw"/></div>`);
var root_29 = from_svg(`<path d="M7 14l5-5 5 5z"></path>`);
var root_30 = from_svg(`<path d="M7 10l5 5 5-5z"></path>`);
var root_32 = from_html(`<div><img alt="" draggable="false" loading="lazy" class="svelte-5cciiw"/></div>`);
var root_31 = from_html(`<div class="pcr-viewer-history-grid svelte-5cciiw"></div>`);
var root_27 = from_html(`<div><div class="pcr-viewer-history-header svelte-5cciiw"><div class="pcr-viewer-history-thumbs svelte-5cciiw"><!> <div class="pcr-viewer-history-fade svelte-5cciiw"></div></div>  <div class="pcr-viewer-history-expand svelte-5cciiw"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><!></svg></div></div>  <div class="pcr-viewer-scrubber-track svelte-5cciiw"><div class="pcr-viewer-scrubber-fill svelte-5cciiw"></div> <div class="pcr-viewer-scrubber-handle svelte-5cciiw"></div></div> <!></div>`);
var root_34 = from_html(`<div class="pcr-viewer-zoom-preset svelte-5cciiw"> </div>`);
var root_33 = from_html(`<div class="pcr-viewer-zoom-dropdown svelte-5cciiw"></div>`);
var root_37 = from_html(`<div> </div>`);
var root_38 = from_html(`<div class="pcr-viewer-compare-dropdown-divider svelte-5cciiw"></div>  <div class="pcr-viewer-compare-dropdown-item pcr-viewer-compare-clear svelte-5cciiw">Clear</div>`, 1);
var root_36 = from_html(`<div class="pcr-viewer-compare-dropdown svelte-5cciiw"><!> <!></div>`);
var root_35 = from_html(`<div class="pcr-viewer-toolbar-row pcr-viewer-compare-container svelte-5cciiw"><div title="Compare (C)"><svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h160v80H200v480h160v80H200Zm240 80v-800h80v80h240q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H520v80h-80Zm80-160h240v-480H520v480Z"></path></svg> <span>Compare</span> <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.7;"><path d="M7 10l5 5 5-5z"></path></svg></div> <!></div>`);
var root_42 = from_html(`<span class="pcr-viewer-edit-layers svelte-5cciiw"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="svelte-5cciiw"><path d="M12 2 2 7l10 5 10-5-10-5Z"></path><path d="m2 17 10 5 10-5"></path><path d="m2 12 10 5 10-5"></path></svg> </span>`);
var root_41 = from_html(`<div class="pcr-viewer-toolbar-row svelte-5cciiw"><div class="pcr-viewer-toolbar-btn svelte-5cciiw" title="Edit, inpaint or upscale this image"><svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L530-360H360Zm481-424-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z"></path></svg> <span> </span> <!></div></div>`);
var root_43 = from_html(`<div class="pcr-viewer-toolbar-btn pcr-viewer-delete svelte-5cciiw" title="Delete file"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg> <span> </span></div>`);
var root_44 = from_html(`<div class="pcr-viewer-toolbar-btn svelte-5cciiw" title="Reveal file in Explorer"><svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z"></path></svg> <span>Open Folder</span></div>`);
var root_46 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label svelte-5cciiw">Dimensions</span> <span class="pcr-meta-val svelte-5cciiw"> </span></div>`);
var root_47 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label svelte-5cciiw">Size</span> <span class="pcr-meta-val svelte-5cciiw"> </span></div>`);
var root_48 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label svelte-5cciiw">Generated</span> <span class="pcr-meta-val svelte-5cciiw"> </span></div>`);
var root_49 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label svelte-5cciiw">Filename</span> <span class="pcr-meta-val pcr-meta-break svelte-5cciiw"> </span></div>`);
var root_50 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label pcr-label-orphan svelte-5cciiw">Status</span> <span class="pcr-meta-val pcr-meta-orphan svelte-5cciiw">Source deleted</span></div>`);
var root_53 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label pcr-label-region svelte-5cciiw"> </span> <p class="pcr-meta-prompt svelte-5cciiw"> </p></div>`);
var root_54 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label pcr-label-pos svelte-5cciiw">Global:</span> <p class="pcr-meta-prompt svelte-5cciiw"> </p></div>`);
var root_52 = from_html(`<!> <!>`, 1);
var root_55 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label pcr-label-pos svelte-5cciiw">Positive Prompt:</span> <p class="pcr-meta-prompt svelte-5cciiw"> </p></div>`);
var root_56 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label pcr-label-neg svelte-5cciiw">Negative Prompt:</span> <p class="pcr-meta-prompt pcr-text-neg svelte-5cciiw"> </p></div>`);
var root_51 = from_html(`<div class="pcr-meta-heading svelte-5cciiw">Prompt</div> <div class="pcr-meta-card svelte-5cciiw"><!> <!></div>`, 1);
var root_58 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label svelte-5cciiw">Model</span> <span class="pcr-meta-val pcr-meta-break svelte-5cciiw"> </span></div>`);
var root_59 = from_html(`<div class="pcr-meta-field pcr-clickable svelte-5cciiw" title="Click to copy"><span class="pcr-meta-label svelte-5cciiw">Seed</span> <span class="pcr-meta-val svelte-5cciiw"> </span></div>`);
var root_60 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label svelte-5cciiw">Steps</span> <span class="pcr-meta-val svelte-5cciiw"> </span></div>`);
var root_61 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label svelte-5cciiw">CFG</span> <span class="pcr-meta-val svelte-5cciiw"> </span></div>`);
var root_62 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label svelte-5cciiw">Sampler</span> <span class="pcr-meta-val svelte-5cciiw"> </span></div>`);
var root_63 = from_html(`<div class="pcr-meta-field svelte-5cciiw"><span class="pcr-meta-label svelte-5cciiw">Denoise</span> <span class="pcr-meta-val svelte-5cciiw"> </span></div>`);
var root_57 = from_html(`<div class="pcr-meta-heading svelte-5cciiw">Generation Settings</div> <div class="pcr-meta-card svelte-5cciiw"><!> <!> <div class="pcr-meta-grid-2 svelte-5cciiw"><!> <!> <!> <!></div></div>`, 1);
var root_45 = from_html(`<div class="pcr-meta-heading svelte-5cciiw">Image Info</div> <div class="pcr-meta-card svelte-5cciiw"><div class="pcr-meta-grid-2 svelte-5cciiw"><!> <!></div> <!> <!> <!></div> <!> <!>`, 1);
var root_64 = from_html(`<div class="pcr-viewer-meta-empty svelte-5cciiw">Loading metadata...</div>`);
var root = from_html(`<div class="pcr-viewer svelte-5cciiw"><!> <!> <!>  <div class="pcr-viewer-center svelte-5cciiw"><!> <!> <!></div> <div class="pcr-viewer-meta svelte-5cciiw"><div class="pcr-viewer-meta-header svelte-5cciiw"><span class="pcr-viewer-counter svelte-5cciiw"> </span>  <div class="pcr-viewer-close svelte-5cciiw"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div></div> <!> <div class="pcr-viewer-toolbar svelte-5cciiw"><div class="pcr-viewer-toolbar-row svelte-5cciiw"><div class="pcr-viewer-zoom-control svelte-5cciiw"><div class="pcr-viewer-zoom-btn svelte-5cciiw"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg> <span> </span></div> <!></div> <input type="range" class="pcr-viewer-zoom-slider svelte-5cciiw" min="0" max="100"/></div> <!> <!> <!> <!> <div class="pcr-viewer-toolbar-row pcr-viewer-toolbar-row-equal svelte-5cciiw"><!> <!> <div title="Copy shareable link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> <span> </span></div></div></div> <div class="pcr-viewer-meta-content svelte-5cciiw"><!></div></div></div> <!> <!> <!> <!> <!> <!>`, 1);
function ImageViewer($$anchor, $$props) {
  var _a;
  push($$props, true);
  let images = prop($$props, "images", 23, () => []), startIndex = prop($$props, "startIndex", 3, 0), workflowId = prop($$props, "workflowId", 3, ""), apiURL = prop($$props, "apiURL", 3, (p) => p), fetchApi = prop($$props, "fetchApi", 3, null), onClose = prop($$props, "onClose", 3, () => {
  }), onDelete = prop($$props, "onDelete", 3, null), onUpscale = prop($$props, "onUpscale", 3, null), onUpscalePrepare = prop($$props, "onUpscalePrepare", 3, null), onUpscaleBackground = prop($$props, "onUpscaleBackground", 3, null), onUpscaleEnlarge = prop($$props, "onUpscaleEnlarge", 3, null), onInpaintPrepare = prop($$props, "onInpaintPrepare", 3, null), onInpaintRun = prop($$props, "onInpaintRun", 3, null), onInpaintSave = prop($$props, "onInpaintSave", 3, null), onInpaintUploadReference = prop($$props, "onInpaintUploadReference", 3, null), onInpaintInstallPack = prop($$props, "onInpaintInstallPack", 3, null), onMountPromptEditor = prop($$props, "onMountPromptEditor", 3, null), onEditPrepare = prop($$props, "onEditPrepare", 3, null), onEditSave = prop($$props, "onEditSave", 3, null), onInpaintRegion = prop($$props, "onInpaintRegion", 3, null), onReposeCaps = prop(
    $$props,
    "onReposeCaps",
    3,
    null
    // () => Promise<{recipes}> — installable pose-transfer recipes
  ), onReposeRun = prop(
    $$props,
    "onReposeRun",
    3,
    null
    // (opts) => tracker — background pose-transfer render
  ), onMountPoser = prop(
    $$props,
    "onMountPoser",
    3,
    null
    // (el, {width,height,outputMode}) => Promise<handle> — detached 3D poser
  ), autoEdit = prop($$props, "autoEdit", 3, false);
  let currentIndex = state(proxy(startIndex()));
  let displayedHash = state(proxy(((_a = images()[startIndex()]) == null ? void 0 : _a.hash) || null));
  let imageInfo = state(null);
  let zoom = state(1);
  let panX = state(0);
  let panY = state(0);
  let isPanning = state(false);
  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };
  let imageLoaded = state(false);
  let imageError = state(false);
  let containerEl;
  let viewerEl;
  let isGesturing = state(false);
  let gestureStart = { x: 0, y: 0, time: 0 };
  let viewerTransformY = state(0);
  let viewerOpacity = state(1);
  const H_SWIPE_RATIO = 0.12;
  const H_VELOCITY = 0.6;
  const V_CLOSE_DIST = 160;
  const V_CLOSE_VELOCITY = 1.25;
  const BOUNCE_MS = 300;
  let historyExpanded = state(false);
  let isDraggingScrubber = state(false);
  let historyGridEl = state(null);
  const STRIP_VISIBLE = 6;
  const GRID_COLUMNS = 4;
  const GRID_THUMB_SIZE = 56.5;
  const GRID_GAP = 4;
  const GRID_MAX_HEIGHT = 280;
  let compareMode = state(false);
  let compareSliderPos = state(50);
  let compareClipPercent = state(50);
  let isDraggingSlider = state(false);
  let compareDropdownOpen = state(false);
  let upscaling = state(false);
  let upscaleModalOpen = state(false);
  let upscalePrepared = state(null);
  let upscalePreviewUrl = state("");
  let upscaleProgress = state(null);
  let upscaleUnsub = null;
  let upscaleTracker = null;
  let compareTargetHash = state(null);
  let compareTargetLabel = state("");
  let mainImageEl = state(null);
  let isOrphaned = user_derived(() => {
    var _a2;
    return ((_a2 = get(imageInfo)) == null ? void 0 : _a2.orphaned) === 1;
  });
  let reattachInputEl = state(null);
  let reattaching = state(false);
  let reattachMsg = state("");
  let imageReloadNonce = state(0);
  let canReattach = user_derived(() => {
    var _a2;
    return !!fetchApi() && /^[0-9a-f]{64}$/.test(get(displayedHash) || "") && !((_a2 = images().find((i) => i.hash === get(displayedHash))) == null ? void 0 : _a2._directUrl);
  });
  function mainImageSrc(hash) {
    const url = imageUrl(hash);
    if (!get(imageReloadNonce)) return url;
    return url + (url.includes("?") ? "&" : "?") + "r=" + get(imageReloadNonce);
  }
  async function handleReattachPick(e) {
    var _a2;
    const file = (_a2 = e.target.files) == null ? void 0 : _a2[0];
    e.target.value = "";
    if (!file || !fetchApi() || !get(displayedHash)) return;
    set(reattaching, true);
    set(reattachMsg, "");
    try {
      const fd = new FormData();
      fd.append("hash", get(displayedHash));
      fd.append("image", file);
      const res = await fetchApi()("/promptchain/reattach", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        set(
          reattachMsg,
          res.status === 409 ? "That file's content doesn't match this image." : `Re-attach failed: ${(err == null ? void 0 : err.error) || res.status}`,
          true
        );
        return;
      }
      set(imageInfo, await res.json(), true);
      set(imageReloadNonce, get(imageReloadNonce) + 1);
      set(imageError, false);
      set(imageLoaded, false);
      fetchApi()(`/promptchain/lineage/${get(displayedHash)}`).then((r) => r.ok ? r.json() : null).then((data) => {
        if (data) set(lineageData, data, true);
      }).catch(() => {
      });
    } catch (err) {
      set(reattachMsg, `Re-attach failed: ${err.message}`);
    } finally {
      set(reattaching, false);
    }
  }
  let closeTimer = null;
  let bounceTimer = null;
  let linkCopiedTimer = null;
  onDestroy(() => {
    clearTimeout(closeTimer);
    clearTimeout(bounceTimer);
    clearTimeout(linkCopiedTimer);
    clearTimeout(newGenTimer);
    upscaleUnsub == null ? void 0 : upscaleUnsub();
  });
  let zoomDropdownOpen = state(false);
  let linkCopied = state(false);
  const ZOOM_PRESETS = [50, 100, 200, 300, 400];
  let zoomDisplayText = user_derived(() => `${Math.round(get(zoom) * 100)}%`);
  let zoomSliderValue = user_derived(() => Math.max(0, Math.min(100, 25 * Math.log2(get(zoom) / 0.25))));
  let editDocLayers = state(proxy({}));
  function refreshEditDocs() {
    if (!fetchApi()) return;
    fetchApi()("/promptchain/edit-docs").then((r) => r.ok ? r.json() : null).then((d) => {
      set(editDocLayers, (d == null ? void 0 : d.docs) || {}, true);
    }).catch(() => {
    });
  }
  user_effect(() => {
    if (fetchApi()) refreshEditDocs();
  });
  let lineageData = state(null);
  let lineageList = user_derived(() => (() => {
    var _a2;
    if (!get(lineageData)) return [];
    if ((_a2 = get(lineageData).family) == null ? void 0 : _a2.length) return get(lineageData).family;
    return [
      ...get(lineageData).ancestors || [],
      get(lineageData).image,
      ...get(lineageData).descendants || []
    ].filter(Boolean);
  })());
  let lineageCurrentIdx = user_derived(() => get(lineageList).findIndex((item) => (item == null ? void 0 : item.hash) === get(displayedHash)));
  let reposeLineageKeys = user_derived(() => [
    get(displayedHash),
    ...get(lineageList).map((i) => i == null ? void 0 : i.hash)
  ].filter((h, i, a) => h && a.indexOf(h) === i));
  let expandedBundles = state(proxy(/* @__PURE__ */ new Set()));
  function toggleBundle(at) {
    const next = new Set(get(expandedBundles));
    if (next.has(at)) next.delete(at);
    else next.add(at);
    set(expandedBundles, next, true);
  }
  let lineageFocusHash = state(null);
  let keepLineageFocusFor = null;
  user_effect(() => {
    const h = get(displayedHash);
    if (keepLineageFocusFor === h) {
      keepLineageFocusFor = null;
      return;
    }
    keepLineageFocusFor = null;
    set(lineageFocusHash, h, true);
  });
  function lineageJump(hash) {
    keepLineageFocusFor = hash;
    set(displayedHash, hash, true);
  }
  let lineageDisplay = user_derived(() => (() => {
    const asNodes = (list) => list.map((item) => ({ kind: "node", item }));
    if (get(lineageList).length < 2) return asNodes(get(lineageList));
    const byHash = new Map(get(lineageList).map((f) => [f.hash, f]));
    if (!byHash.has(get(displayedHash))) return asNodes(get(lineageList));
    const childrenOf = /* @__PURE__ */ new Map();
    for (const f of get(lineageList)) {
      if (!f.parent_hash || !byHash.has(f.parent_hash)) continue;
      if (!childrenOf.has(f.parent_hash)) childrenOf.set(f.parent_hash, []);
      childrenOf.get(f.parent_hash).push(f);
    }
    for (const kids of childrenOf.values()) {
      kids.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    }
    const subtreeNodes = (rootHash) => {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      const stack = [rootHash];
      while (stack.length) {
        const h = stack.pop();
        if (seen.has(h)) continue;
        seen.add(h);
        const f = byHash.get(h);
        if (!f) continue;
        out.push(f);
        const kids = (childrenOf.get(h) || []).slice().reverse();
        for (const k of kids) stack.push(k.hash);
      }
      return out;
    };
    const buildFrom = (anchorHash) => {
      const spine = [];
      let cur = anchorHash;
      const climbed = /* @__PURE__ */ new Set();
      while (cur && byHash.has(cur) && !climbed.has(cur)) {
        climbed.add(cur);
        spine.push(cur);
        cur = byHash.get(cur).parent_hash;
      }
      spine.reverse();
      const spineSet = new Set(spine);
      const ownSubtree = /* @__PURE__ */ new Set();
      const seedStack = [anchorHash];
      while (seedStack.length) {
        const h = seedStack.pop();
        if (ownSubtree.has(h)) continue;
        ownSubtree.add(h);
        for (const k of childrenOf.get(h) || []) seedStack.push(k.hash);
      }
      const display2 = [];
      for (const h of spine) {
        display2.push({ kind: "node", item: byHash.get(h) });
        const offSpine = (childrenOf.get(h) || []).filter((k) => !spineSet.has(k.hash) && !ownSubtree.has(k.hash));
        if (!offSpine.length) continue;
        const branchNodes = offSpine.flatMap((k) => subtreeNodes(k.hash));
        if (get(expandedBundles).has(h)) {
          display2.push({
            kind: "collapse",
            at: h,
            count: branchNodes.length,
            preview: []
          });
          for (const f of branchNodes) display2.push({ kind: "node", item: f, branch: true });
        } else {
          display2.push({
            kind: "bundle",
            at: h,
            count: branchNodes.length,
            preview: branchNodes.slice(0, 2)
          });
        }
      }
      for (const f of subtreeNodes(anchorHash)) {
        if (f.hash !== anchorHash) display2.push({ kind: "node", item: f });
      }
      return display2;
    };
    const anchor = get(lineageFocusHash) && byHash.has(get(lineageFocusHash)) ? get(lineageFocusHash) : get(displayedHash);
    let display = buildFrom(anchor);
    if (anchor !== get(displayedHash) && !display.some((d) => d.kind === "node" && d.item.hash === get(displayedHash))) {
      display = buildFrom(get(displayedHash));
    }
    return display;
  })());
  let lineageVisible = user_derived(() => get(lineageDisplay).filter((d) => d.kind === "node").map((d) => d.item));
  let lineageDisplayCurrentIdx = user_derived(() => get(lineageDisplay).findIndex((d) => d.kind === "node" && d.item.hash === get(displayedHash)));
  let lineageHiddenCount = user_derived(() => get(lineageList).length - get(lineageVisible).length);
  let compareTargets = user_derived(() => get(lineageList).filter((item) => (item == null ? void 0 : item.hash) !== get(displayedHash)));
  let hasCompareTargets = user_derived(() => get(compareTargets).length > 0);
  let compareImageUrl = user_derived(() => get(compareTargetHash) ? imageUrl(get(compareTargetHash)) : null);
  let compareTargetItem = user_derived(() => get(compareTargetHash) ? get(lineageList).find((item) => (item == null ? void 0 : item.hash) === get(compareTargetHash)) || null : null);
  let currentImage = user_derived(() => images()[get(currentIndex)] || null);
  let scrubberPercent = user_derived(() => images().length > 1 ? get(currentIndex) / (images().length - 1) * 100 : 0);
  let visibleThumbs = user_derived(() => (() => {
    const start = Math.max(0, Math.min(get(currentIndex), images().length - STRIP_VISIBLE));
    return images().slice(start, start + STRIP_VISIBLE).map((img, i) => ({ ...img, globalIndex: start + i }));
  })());
  user_effect(() => {
    if (!get(displayedHash) || !fetchApi()) return;
    set(imageError, false);
    set(reattachMsg, "");
    const img = images().find((i) => i.hash === get(displayedHash));
    const onMetaError = (label) => (e) => {
      set(imageInfo, null);
      console.error(`[PromptChain] ${label} fetch failed for ${get(displayedHash)}:`, e);
    };
    if (img == null ? void 0 : img._directUrl) {
      const scope = img._browseScope || "output";
      const path = img._browsePath || get(displayedHash);
      const openedHash = get(displayedHash);
      set(lineageData, null);
      fetchApi()(`/promptchain/browse/meta?scope=${scope}&path=${encodeURIComponent(path)}`).then((r) => r.ok ? r.json() : null).then((data) => {
        set(imageInfo, data, true);
        if (!(data == null ? void 0 : data.hash) || get(displayedHash) !== openedHash) return;
        if (get(displayedHash) !== data.hash) {
          set(displayedHash, data.hash, true);
          return;
        }
        fetchApi()(`/promptchain/lineage/${data.hash}`).then((r) => r.ok ? r.json() : null).then((d) => {
          if (get(displayedHash) === data.hash) set(lineageData, d, true);
        }).catch((e) => console.error(`[PromptChain] lineage fetch failed for ${data.hash}:`, e));
      }).catch(onMetaError("browse meta"));
    } else {
      fetchApi()(`/promptchain/image-meta/${get(displayedHash)}`).then((r) => r.ok ? r.json() : null).then((data) => {
        set(imageInfo, data, true);
      }).catch(onMetaError("image meta"));
      fetchApi()(`/promptchain/lineage/${get(displayedHash)}`).then((r) => r.ok ? r.json() : null).then((data) => {
        set(lineageData, data, true);
      }).catch((e) => {
        set(lineageData, null);
        console.error(`[PromptChain] lineage fetch failed for ${get(displayedHash)}:`, e);
      });
    }
  });
  user_effect(() => {
    const idx = images().findIndex((i) => i.hash === get(displayedHash));
    if (idx >= 0 && idx !== get(currentIndex)) set(currentIndex, idx, true);
  });
  user_effect(() => {
    if (!get(displayedHash)) return;
    const wid = workflowId() || "";
    const params = new URLSearchParams();
    const img = images().find((i) => i.hash === get(displayedHash));
    if (img == null ? void 0 : img._browsePath) {
      params.set("s", img._browseScope || "output");
      params.set("p", img._browsePath);
    } else {
      params.set("h", get(displayedHash));
      if (wid) params.set("w", wid);
    }
    try {
      history.replaceState(null, "", `#pcr/view?${params}`);
    } catch (e) {
      console.warn("[PromptChain] history update blocked:", e);
    }
  });
  user_effect(() => {
    console.trace("[PCR][viewer] displayedHash ->", get(displayedHash), "currentIndex", get(currentIndex));
  });
  function imageUrl(hash) {
    const img = images().find((i) => i.hash === hash);
    if (img == null ? void 0 : img._directUrl) return img._directUrl;
    return apiURL()(`/promptchain/image/${hash}`);
  }
  function thumbUrl(hash) {
    const img = images().find((i) => i.hash === hash);
    if (img == null ? void 0 : img._directUrl) return img._directUrl;
    return apiURL()(`/promptchain/thumb/${hash}`);
  }
  function jumpTo(idx) {
    if (idx >= 0 && idx < images().length && idx !== get(currentIndex)) {
      set(currentIndex, idx, true);
      set(displayedHash, images()[idx].hash, true);
      exitCompare();
    }
  }
  function navigate(delta) {
    jumpTo(get(currentIndex) + delta);
  }
  function resetZoom() {
    set(zoom, 1);
    set(panX, 0);
    set(panY, 0);
  }
  function navigateLineage(delta) {
    const idx = get(lineageVisible).findIndex((item) => item.hash === get(displayedHash));
    if (idx < 0) return;
    const next = idx + delta;
    if (next >= 0 && next < get(lineageVisible).length) {
      lineageJump(get(lineageVisible)[next].hash);
      exitCompare();
    }
  }
  function enterCompareWith(targetHash, label) {
    if (get(compareMode) && get(compareTargetHash) === targetHash) {
      exitCompare();
      return;
    }
    const fresh = !get(compareMode);
    set(compareTargetHash, targetHash, true);
    set(compareTargetLabel, label, true);
    set(compareMode, true);
    set(compareDropdownOpen, false);
    if (fresh) {
      set(compareSliderPos, 50);
      set(compareClipPercent, 50);
      requestAnimationFrame(updateCompareClip);
    }
  }
  function exitCompare() {
    if (!get(compareMode)) return;
    set(compareMode, false);
    set(compareTargetHash, null);
    set(compareTargetLabel, "");
    set(compareDropdownOpen, false);
  }
  function handleSliderDown(e) {
    e.preventDefault();
    e.stopPropagation();
    set(isDraggingSlider, true);
  }
  function handleSliderMove(e) {
    if (!get(isDraggingSlider) || !containerEl || !get(mainImageEl)) return;
    const cRect = containerEl.getBoundingClientRect();
    const iRect = get(mainImageEl).getBoundingClientRect();
    set(compareSliderPos, Math.max(0, Math.min(100, (e.clientX - cRect.left) / cRect.width * 100)), true);
    set(compareClipPercent, Math.max(0, Math.min(100, (e.clientX - iRect.left) / iRect.width * 100)), true);
  }
  function updateCompareClip() {
    if (!get(compareMode) || !containerEl || !get(mainImageEl)) return;
    const cRect = containerEl.getBoundingClientRect();
    const iRect = get(mainImageEl).getBoundingClientRect();
    const clientX = cRect.left + get(compareSliderPos) / 100 * cRect.width;
    set(compareClipPercent, Math.max(0, Math.min(100, (clientX - iRect.left) / iRect.width * 100)), true);
  }
  function handleWheel(e) {
    e.preventDefault();
    const step = e.deltaY > 0 ? -0.15 : 0.15;
    const newZoom = Math.max(0.5, Math.min(8, get(zoom) + step));
    if (newZoom === get(zoom)) return;
    const rect = containerEl.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    const ratio = newZoom / get(zoom);
    set(panX, mx - (mx - get(panX)) * ratio);
    set(panY, my - (my - get(panY)) * ratio);
    set(zoom, newZoom, true);
    requestAnimationFrame(updateCompareClip);
  }
  function handlePointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest(".pcr-viewer-compare-slider")) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      set(isGesturing, true);
      gestureStart = { x: e.clientX, y: e.clientY, time: Date.now() };
      if (viewerEl) viewerEl.style.transition = "none";
    } else {
      set(isPanning, true);
      panStart = {
        x: e.clientX,
        y: e.clientY,
        panX: get(panX),
        panY: get(panY)
      };
    }
    containerEl.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e) {
    if (get(isPanning)) {
      set(panX, panStart.panX + (e.clientX - panStart.x));
      set(panY, panStart.panY + (e.clientY - panStart.y));
      updateCompareClip();
      return;
    }
    if (get(isGesturing)) {
      const dy = e.clientY - gestureStart.y;
      if (dy > 0 && Math.abs(dy) > Math.abs(e.clientX - gestureStart.x)) {
        const progress = Math.min(dy / window.innerHeight, 1);
        set(viewerTransformY, dy);
        set(viewerOpacity, 1 - (1 - Math.pow(1 - progress, 1.6)));
      }
    }
  }
  function handlePointerUp(e) {
    if (get(isPanning)) {
      set(isPanning, false);
      containerEl.releasePointerCapture(e.pointerId);
      return;
    }
    if (get(isGesturing)) {
      set(isGesturing, false);
      containerEl.releasePointerCapture(e.pointerId);
      const dx = e.clientX - gestureStart.x;
      const dy = e.clientY - gestureStart.y;
      const dt = Math.max(1, Date.now() - gestureStart.time);
      const vx = dx / dt;
      const vy = dy / dt;
      if (Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > window.innerWidth * H_SWIPE_RATIO || Math.abs(vx) > H_VELOCITY)) {
        resetGesture();
        navigate(dx < 0 ? 1 : -1);
        return;
      }
      if (Math.abs(dy) > Math.abs(dx) && (dy > V_CLOSE_DIST || vy > V_CLOSE_VELOCITY)) {
        if (viewerEl) viewerEl.style.transition = `transform 0.3s ease, opacity 0.3s ease`;
        set(viewerTransformY, window.innerHeight, true);
        set(viewerOpacity, 0);
        closeTimer = setTimeout(() => onClose()(), 180);
        return;
      }
      if (Math.abs(dy) > Math.abs(dx) && (dy < -90 || vy < -0.9)) {
        resetGesture();
        navigateLineage(1);
        return;
      }
      if (viewerEl) viewerEl.style.transition = `transform ${BOUNCE_MS}ms ease, opacity ${BOUNCE_MS}ms ease`;
      set(viewerTransformY, 0);
      set(viewerOpacity, 1);
      bounceTimer = setTimeout(
        () => {
          if (viewerEl) viewerEl.style.transition = "";
        },
        BOUNCE_MS
      );
    }
  }
  function resetGesture() {
    set(viewerTransformY, 0);
    set(viewerOpacity, 1);
    if (viewerEl) viewerEl.style.transition = "";
  }
  function handleDblClick() {
    resetZoom();
  }
  async function confirmUpscale(options) {
    if (get(upscaling) || !get(upscalePrepared)) return;
    if (get(upscaleFromEdit) && get(upscaleEditCtx)) {
      options = { ...options, previewOnly: true };
      get(upscaleEditCtx).canvasMode = options.canvasMode || "keep";
      if (get(upscaleEditCtx).canvasMode === "grow" && onUpscaleEnlarge()) {
        const tw = Math.round(get(upscaleEditCtx).docWidth * options.upscaleBy);
        const th = Math.round(get(upscaleEditCtx).docHeight * options.upscaleBy);
        get(upscaleEditCtx).bgPromise = onUpscaleEnlarge()(get(upscaleEditCtx).bgName, tw, th, options.plainEngine || "ultrasharp");
        get(
          upscaleEditCtx
          // surfaced at Add to Edit
        ).bgPromise.catch(() => {
        });
      } else if (options.ultrasharpUnder && onUpscaleEnlarge()) {
        get(upscaleEditCtx).usPromise = onUpscaleEnlarge()(get(upscaleEditCtx).cropName, get(upscaleEditCtx).rect.w, get(upscaleEditCtx).rect.h, options.plainEngine || "ultrasharp");
        get(
          upscaleEditCtx
          // best-effort — surfaced at Add to Edit
        ).usPromise.catch(() => {
        });
      }
    }
    if ((options == null ? void 0 : options.target) === "background" && onUpscaleBackground()) {
      const tracker = onUpscaleBackground()(get(upscalePrepared), options);
      upscaleTracker = tracker;
      upscaleUnsub == null ? void 0 : upscaleUnsub();
      upscaleUnsub = tracker.subscribe((state2) => {
        set(upscaleProgress, state2, true);
        if (state2.phase === "done" && state2.resultHash && !get(upscaleFromEdit)) {
          showNewGenBanner(state2.elapsedSec);
          viewUpscaleResult(state2.resultHash);
        } else if (state2.phase === "cancelled") {
          cancelUpscale();
        }
      });
      return;
    }
    set(upscaling, true);
    set(upscaleModalOpen, false);
    try {
      const ok = await onUpscale()(get(upscalePrepared), options);
      if (ok) onClose()();
    } finally {
      set(upscaling, false);
      set(upscalePrepared, null);
    }
  }
  function cancelUpscale() {
    set(upscaleModalOpen, false);
    set(upscalePrepared, null);
    set(upscaleProgress, null);
    set(upscaleFromEdit, false);
    set(upscaleEditCtx, null);
    if (get(upscalePreviewUrl).startsWith("blob:")) {
      URL.revokeObjectURL(get(upscalePreviewUrl));
      set(upscalePreviewUrl, "");
    }
    upscaleUnsub == null ? void 0 : upscaleUnsub();
    upscaleUnsub = null;
    upscaleTracker = null;
  }
  function cancelUpscaleRun() {
    var _a2;
    (_a2 = upscaleTracker == null ? void 0 : upscaleTracker.cancel) == null ? void 0 : _a2.call(upscaleTracker);
  }
  let reposeModalOpen = state(false);
  let reposePrepared = state(
    null
    // { sourceUrl, referenceFilename, parentFilename, width, height, caps }
  );
  let reposeProgress = state(null);
  let reposeTracker = null;
  let reposeUnsub = null;
  async function openReposeFromEdit({ compositeBlob }) {
    var _a2, _b, _c, _d;
    if (!onReposeCaps() || !onReposeRun() || !onMountPoser() || !onInpaintUploadReference()) return;
    try {
      const referenceFilename = await onInpaintUploadReference()(new File([compositeBlob], "repose-source.png", { type: "image/png" }));
      if (!referenceFilename) return;
      const caps = await onReposeCaps()();
      set(
        reposePrepared,
        {
          sourceUrl: URL.createObjectURL(compositeBlob),
          referenceFilename,
          parentFilename: (editEntry == null ? void 0 : editEntry.filename) || "",
          width: ((_b = (_a2 = get(editPrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.width) || 0,
          height: ((_d = (_c = get(editPrepared)) == null ? void 0 : _c.data) == null ? void 0 : _d.height) || 0,
          caps
        },
        true
      );
      set(reposeProgress, null);
      set(reposeModalOpen, true);
    } catch (e) {
      console.error("[PromptChain] repose-from-edit failed", e);
    }
  }
  function confirmRepose(opts) {
    if (!onReposeRun() || !get(reposePrepared)) return;
    const tracker = onReposeRun()({
      ...opts,
      referenceFilename: get(reposePrepared).referenceFilename,
      parentFilename: get(reposePrepared).parentFilename
    });
    reposeTracker = tracker;
    reposeUnsub == null ? void 0 : reposeUnsub();
    reposeUnsub = tracker.subscribe((state2) => {
      if (state2.phase === "cancelled") {
        set(reposeProgress, null);
        return;
      }
      set(reposeProgress, state2, true);
    });
  }
  async function handleReposeToEdit(doneState) {
    var _a2;
    if (((_a2 = get(editModalRef)) == null ? void 0 : _a2.addLayerFromResult) && (doneState == null ? void 0 : doneState.resultUrl)) {
      const url = doneState.resultUrl + (doneState.resultUrl.includes("?") ? "&" : "?") + "rand=" + Math.random();
      try {
        await get(editModalRef).addLayerFromResult(url, null);
      } catch (e) {
        console.error("[PromptChain] add repose layer failed", e);
      }
    }
    closeRepose();
  }
  function closeRepose() {
    var _a2, _b, _c;
    set(reposeModalOpen, false);
    if ((_c = (_b = (_a2 = get(reposePrepared)) == null ? void 0 : _a2.sourceUrl) == null ? void 0 : _b.startsWith) == null ? void 0 : _c.call(_b, "blob:")) URL.revokeObjectURL(get(reposePrepared).sourceUrl);
    set(reposePrepared, null);
    set(reposeProgress, null);
    reposeUnsub == null ? void 0 : reposeUnsub();
    reposeUnsub = null;
    reposeTracker = null;
  }
  let inpaintModalOpen = state(false);
  let inpaintPrepared = state(null);
  function inpaintSaved(entry) {
    showNewGenBanner(null);
    if (!(entry == null ? void 0 : entry.hash)) return;
    const existingIdx = images().findIndex((i) => i.hash === entry.hash);
    if (existingIdx >= 0) {
      set(currentIndex, existingIdx, true);
    } else {
      const srcIdx = images().findIndex((i) => i.hash === get(displayedHash));
      const insertAt = srcIdx >= 0 ? srcIdx + 1 : images().length;
      images([
        ...images().slice(0, insertAt),
        entry,
        ...images().slice(insertAt)
      ]);
      set(currentIndex, insertAt, true);
    }
    set(
      displayedHash,
      entry.hash,
      // lineage links it to the source
      true
    );
    refreshEditDocs();
    window.dispatchEvent(new CustomEvent("promptchain:edit-docs-changed"));
  }
  let editModalOpen = state(false);
  let editPrepared = state(null);
  let editFigureRegions = user_derived(() => {
    var _a2, _b, _c;
    return ((_b = (_a2 = get(editPrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.workflow) ? buildFigureRegions({
      workflow: get(editPrepared).data.workflow,
      regionsRaw: (_c = get(imageInfo)) == null ? void 0 : _c.regions,
      poseFilesOk: get(editPrepared).data.pose_files_ok,
      apiURL: apiURL()
    }) : [];
  });
  let editPreparing = state(false);
  let editEntry = null;
  let editModalRef = state(
    null
    // EditModal instance, for addLayerFromResult
  );
  let inpaintEditMask = state(
    null
    // the region mask handed from Edit
  );
  let inpaintFromEdit = state(false);
  async function openEdit(targetHash = get(displayedHash)) {
    if (get(editPreparing) || !onEditPrepare() || !onEditSave()) return;
    const entry = images().find((i) => i.hash === targetHash) || { hash: targetHash };
    set(editPreparing, true);
    try {
      const prepared = await onEditPrepare()(entry);
      if (prepared) {
        editEntry = entry;
        set(editPrepared, { ...prepared, sourceUrl: imageUrl(targetHash) }, true);
        set(editModalOpen, true);
      }
    } finally {
      set(editPreparing, false);
    }
  }
  let autoEditFired = false;
  user_effect(() => {
    if (autoEdit() && !autoEditFired && get(displayedHash)) {
      autoEditFired = true;
      openEdit();
    }
  });
  let inpaintRegionPrefill = state(
    null
    // auto-resolved region prompt (regioned workflow)
  );
  let inpaintRegionName = state(
    ""
    // which figure it resolved to, for the modal note
  );
  let inpaintMovedContent = state(
    false
    // the painted content was moved off its scene position
  );
  let inpaintCondOffset = state(
    null
    // {x,y} move delta → shifts region masks to the content's origin
  );
  async function openInpaintFromEdit({
    compositeBlob,
    maskCanvas,
    sceneRect = null,
    condOffset = null
  }) {
    var _a2, _b;
    if (!onInpaintPrepare() || !onInpaintRun() || !editEntry) return;
    try {
      const prepared = await onInpaintPrepare()(editEntry);
      if (!prepared) return;
      const name = onInpaintUploadReference() ? await onInpaintUploadReference()(new File([compositeBlob], "edit-composite.png", { type: "image/png" })) : null;
      set(inpaintEditMask, maskCanvas, true);
      set(inpaintFromEdit, true);
      set(
        inpaintPrepared,
        {
          ...prepared,
          data: {
            ...prepared.data,
            input_ref: name || ((_a2 = prepared.data) == null ? void 0 : _a2.input_ref)
          },
          sourceUrl: URL.createObjectURL(compositeBlob)
        },
        true
      );
      set(inpaintMovedContent, !!condOffset);
      set(inpaintCondOffset, condOffset, true);
      if (!condOffset && !((_b = prepared.caps) == null ? void 0 : _b.regionalAvailable)) {
        await resolveInpaintRegionPrefill(maskCanvas, sceneRect);
      }
      set(inpaintModalOpen, true);
    } catch (e) {
      console.error("[PromptChain] inpaint-from-edit failed", e);
    }
  }
  async function resolveInpaintRegionPrefill(maskCanvas, sceneRect) {
    var _a2, _b, _c, _d, _e;
    set(inpaintRegionPrefill, null);
    set(inpaintRegionName, "");
    const regions = get(editFigureRegions);
    const dw = ((_b = (_a2 = get(editPrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.width) || 0, dh = ((_d = (_c = get(editPrepared)) == null ? void 0 : _c.data) == null ? void 0 : _d.height) || 0;
    if (!regions.length || !(dw > 0) || !(dh > 0)) return;
    let probe = maskCanvas;
    if (sceneRect) {
      probe = document.createElement("canvas");
      probe.width = dw;
      probe.height = dh;
      const ctx = probe.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(sceneRect.x, sceneRect.y, sceneRect.w, sceneRect.h);
    }
    const match = await matchRegionByOverlap(probe, regions, dw, dh);
    if (!match) return;
    const parsed = parseRegions((_e = get(imageInfo)) == null ? void 0 : _e.regions);
    const global = ((parsed == null ? void 0 : parsed.global) || "").trim();
    const negative = ((parsed == null ? void 0 : parsed.negative) || "").trim();
    set(inpaintRegionName, match.name, true);
    set(inpaintRegionPrefill, [global, match.text].filter(Boolean).join(", ") + (negative ? `

Negative Prompt:
${negative}` : ""));
  }
  function closeInpaintFromEdit() {
    set(inpaintModalOpen, false);
    set(inpaintFromEdit, false);
    set(inpaintPrepared, null);
    set(inpaintEditMask, null);
    set(inpaintRegionPrefill, null);
    set(inpaintRegionName, "");
    set(inpaintMovedContent, false);
    set(inpaintCondOffset, null);
  }
  async function handleInpaintToEdit(doneState) {
    var _a2;
    const t = doneState == null ? void 0 : doneState.temp;
    if (t && ((_a2 = get(editModalRef)) == null ? void 0 : _a2.addLayerFromResult)) {
      const url = apiURL()(`/view?filename=${encodeURIComponent(t.filename)}&subfolder=${encodeURIComponent(t.subfolder || "")}&type=${t.type || "temp"}&rand=${Math.random()}`);
      try {
        await get(editModalRef).addLayerFromResult(url, doneState.appliedMask || null);
      } catch (e) {
        console.error("[PromptChain] add inpaint layer failed", e);
      }
    }
    closeInpaintFromEdit();
  }
  let upscaleFromEdit = state(false);
  let upscaleEditCtx = state(
    null
    // { rect, bgName, docWidth, docHeight, canvasMode?, bgPromise? }
  );
  function regionUpscalePrepared(prepared, inputRef, rect, dw, dh, sceneRect = null) {
    var _a2;
    const caps = { ...prepared.caps };
    const sourceFrame = dw === prepared.data.width && dh === prepared.data.height;
    const fullCanvas = sourceFrame && rect.x === 0 && rect.y === 0 && rect.w === dw && rect.h === dh;
    if (caps.graftable && !sourceFrame) {
      caps.modes = {
        ...caps.modes,
        regional: {
          ok: false,
          reason: "The document was resized or grown past the source image's frame — the per-figure masks and 3D pose depth can't line up with it anymore. Describe just this figure in the Prompt below instead (the reference shows the workflow's character blocks)."
        }
      };
      caps.sources = { ...caps.sources, pose: { ok: false } };
      caps.defaultDepthSource = "image";
      if (caps.defaultMode === "regional") caps.defaultMode = ((_a2 = caps.modes.depth) == null ? void 0 : _a2.ok) ? "depth" : "prompt";
    }
    const docLongest = Math.max(dw || 0, dh || 0);
    caps.defaultUpscaleBy = docLongest > 0 ? Math.min(8, Math.max(1, Math.round(2048 / docLongest * 100) / 100)) : 2;
    return {
      ...prepared,
      data: {
        ...prepared.data,
        input_ref: inputRef,
        width: rect.w,
        height: rect.h,
        filename: fullCanvas ? prepared.data.filename : "edit region",
        // Scene modes can run on any source-frame rect now, so those keep the
        // REAL flag (the runner's gate is mode-aware — prompt-only crops never
        // wait on pose files). Off-frame documents can't pose-hint at all.
        pose_files_ok: sourceFrame ? prepared.data.pose_files_ok : true,
        // sceneRect = layer-provenance override: a moved copy's pixels sit at
        // `rect`, but its scene location (where the pose masks/depth should be
        // cropped) is where it was cut/copied from. Same dims by construction.
        ...sourceFrame && !fullCanvas ? {
          editRect: {
            x: (sceneRect || rect).x,
            y: (sceneRect || rect).y,
            w: rect.w,
            h: rect.h,
            docW: dw,
            docH: dh
          }
        } : {}
      },
      caps
    };
  }
  async function openUpscaleFromEdit({
    cropBlob,
    bgBlob,
    rect,
    sceneRect = null,
    docWidth,
    docHeight
  }) {
    if (!onUpscalePrepare() || !onUpscaleBackground() || !onInpaintUploadReference() || !editEntry) return;
    try {
      const prepared = await onUpscalePrepare()(editEntry);
      if (!prepared) return;
      const upload = (blob, name) => onInpaintUploadReference()(new File([blob], name, { type: "image/png" }));
      const [cropName, bgName] = await Promise.all([
        upload(cropBlob, "edit-region.png"),
        upload(bgBlob, "edit-background.png")
      ]);
      if (!cropName || !bgName) return;
      set(upscaleEditCtx, { rect, bgName, cropName, docWidth, docHeight }, true);
      set(upscaleFromEdit, true);
      set(upscalePrepared, regionUpscalePrepared(prepared, cropName, rect, docWidth, docHeight, sceneRect), true);
      set(upscalePreviewUrl, URL.createObjectURL(cropBlob), true);
      set(upscaleProgress, null);
      set(upscaleModalOpen, true);
    } catch (e) {
      console.error("[PromptChain] upscale-from-edit failed", e);
    }
  }
  function reportHandback(where, message) {
    try {
      fetchApi()("/promptchain/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ where, message, stack: "" })
      }).catch(() => {
      });
    } catch {
    }
  }
  async function handleUpscaleToEdit(doneState) {
    var _a2, _b, _c;
    const ctx = get(upscaleEditCtx);
    const viewUrl = (img) => apiURL()(`/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${img.type || "output"}&rand=${Math.random()}`);
    reportHandback("upscale-handback", `branch check: filename=${(doneState == null ? void 0 : doneState.filename) || "NONE"} canvasMode=${(ctx == null ? void 0 : ctx.canvasMode) || "NONE"} bgPromise=${!!(ctx == null ? void 0 : ctx.bgPromise)} applyFn=${!!((_a2 = get(editModalRef)) == null ? void 0 : _a2.applyCanvasUpscale)}`);
    try {
      if ((doneState == null ? void 0 : doneState.filename) && (ctx == null ? void 0 : ctx.canvasMode) === "grow" && ctx.bgPromise && ((_b = get(editModalRef)) == null ? void 0 : _b.applyCanvasUpscale)) {
        let bg = null;
        try {
          bg = await ctx.bgPromise;
        } catch (e) {
          console.error("[PromptChain] background enlarge failed — falling back to in-place", e);
          reportHandback("upscale-handback", `bg enlarge REJECTED → in-place fallback: ${(e == null ? void 0 : e.message) || e}`);
        }
        if (bg) {
          await get(editModalRef).applyCanvasUpscale({ bgUrl: viewUrl(bg), regionUrl: viewUrl(doneState) });
          reportHandback("upscale-handback", `GROW applied: bg=${bg.filename} (${bg.type || "output"})`);
        } else {
          await get(editModalRef).addUpscaledLayerFromResult(viewUrl(doneState));
        }
      } else if ((doneState == null ? void 0 : doneState.filename) && ((_c = get(editModalRef)) == null ? void 0 : _c.addUpscaledLayerFromResult)) {
        let under = null;
        if (ctx == null ? void 0 : ctx.usPromise) {
          try {
            under = await ctx.usPromise;
          } catch (e) {
            reportHandback("upscale-handback", `UltraSharp under-layer REJECTED — inserting without it: ${(e == null ? void 0 : e.message) || e}`);
          }
        }
        await get(editModalRef).addUpscaledLayerFromResult(viewUrl(doneState), under ? viewUrl(under) : null);
        reportHandback("upscale-handback", `KEEP path: squeezed into footprint${under ? " + UltraSharp under-layer" : ""}`);
      }
    } catch (e) {
      console.error("[PromptChain] add upscale layer failed", e);
      reportHandback("upscale-handback", `handback threw: ${(e == null ? void 0 : e.message) || e}`);
    }
    cancelUpscale();
  }
  function viewUpscaleResult(hash) {
    cancelUpscale();
    set(
      displayedHash,
      hash,
      // lineage already links it to the source
      true
    );
  }
  let newGenBanner = state(null);
  let newGenTimer = null;
  function showNewGenBanner(elapsedSec) {
    clearTimeout(newGenTimer);
    set(
      newGenBanner,
      elapsedSec ? `New generation! Generated in ${elapsedSec}s` : "New generation!",
      true
    );
    newGenTimer = setTimeout(
      () => {
        set(newGenBanner, null);
      },
      6e3
    );
  }
  function handleKeydown(e) {
    if (get(
      upscaleModalOpen
      // a modal owns the keyboard while open
    ) || get(inpaintModalOpen) || get(editModalOpen) || get(confirmDeleteOpen)) return;
    if (e.key === "Escape") {
      if (get(compareDropdownOpen)) {
        set(compareDropdownOpen, false);
        return;
      }
      if (get(historyExpanded)) {
        set(historyExpanded, false);
        return;
      }
      if (get(compareMode)) {
        exitCompare();
        return;
      }
      onClose()();
      return;
    }
    if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && get(hasCompareTargets)) {
      e.preventDefault();
      if (get(compareMode)) exitCompare();
      else set(compareDropdownOpen, !get(compareDropdownOpen));
      return;
    }
    if (e.key === "ArrowLeft") {
      navigate(-1);
      return;
    }
    if (e.key === "ArrowRight") {
      navigate(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      navigateLineage(-1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      navigateLineage(1);
      return;
    }
  }
  function scrubberIndexFromX(clientX, trackEl) {
    const rect = trackEl.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
    return Math.round(percent / 100 * (images().length - 1));
  }
  function handleScrubberTrackDown(e) {
    e.preventDefault();
    const idx = scrubberIndexFromX(e.clientX, e.currentTarget);
    jumpTo(idx);
    set(isDraggingScrubber, true);
    e.clientX;
    idx / (images().length - 1) * 100;
  }
  function handleScrubberHandleDown(e) {
    e.preventDefault();
    e.stopPropagation();
    set(isDraggingScrubber, true);
    e.clientX;
    get(scrubberPercent);
  }
  function handleWindowMouseMove(e) {
    if (get(isDraggingSlider)) {
      handleSliderMove(e);
      return;
    }
    if (!get(isDraggingScrubber)) return;
    const track = document.querySelector(".pcr-viewer-scrubber-track");
    if (!track) return;
    const idx = scrubberIndexFromX(e.clientX, track);
    jumpTo(idx);
  }
  function handleWindowMouseUp() {
    set(isDraggingScrubber, false);
    set(isDraggingSlider, false);
  }
  function toggleGrid() {
    set(historyExpanded, !get(historyExpanded));
    if (get(historyExpanded)) {
      requestAnimationFrame(() => scrollGridToCurrent());
    }
  }
  function scrollGridToCurrent() {
    if (!get(historyGridEl)) return;
    const rowHeight = GRID_THUMB_SIZE + GRID_GAP;
    const row = Math.floor(get(currentIndex) / GRID_COLUMNS);
    const target = row * rowHeight - GRID_MAX_HEIGHT / 2 + rowHeight / 2;
    get(historyGridEl).scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }
  user_effect(() => {
    void get(currentIndex);
    void images().length;
    if (get(historyExpanded)) requestAnimationFrame(() => scrollGridToCurrent());
  });
  function setZoomLevel(percent) {
    set(zoom, percent / 100);
    set(panX, 0);
    set(panY, 0);
    set(zoomDropdownOpen, false);
    requestAnimationFrame(updateCompareClip);
  }
  function handleZoomSlider(e) {
    set(zoom, 0.25 * Math.pow(2, parseInt(e.currentTarget.value) / 25));
    set(panX, 0);
    set(panY, 0);
    requestAnimationFrame(updateCompareClip);
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      set(linkCopied, true);
      linkCopiedTimer = setTimeout(
        () => {
          set(linkCopied, false);
        },
        2e3
      );
    } catch {
    }
  }
  const isLocalClient = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname);
  function openFolder() {
    if (!fetchApi()) return;
    const entry = images().find((i) => i.hash === get(displayedHash)) || { hash: get(displayedHash) };
    const params = entry._browsePath != null ? `scope=${encodeURIComponent(entry._browseScope || "output")}&path=${encodeURIComponent(entry._browsePath)}` : `hash=${encodeURIComponent(entry.hash)}`;
    fetchApi()(`/promptchain/reveal-file?${params}`).catch(() => {
    });
  }
  let deleting = state(false);
  let confirmDeleteOpen = state(false);
  let deleteTargetHash = state(null);
  function requestDelete() {
    if (!onDelete() || get(deleting)) return;
    set(deleteTargetHash, null);
    set(confirmDeleteOpen, true);
  }
  function cancelDelete() {
    set(confirmDeleteOpen, false);
    set(deleteTargetHash, null);
  }
  const isWindows = /windows/i.test(navigator.userAgent);
  let lineageMenu = state(
    null
    // { x, y, item } | null
  );
  function openLineageMenu(e, item) {
    e.preventDefault();
    e.stopPropagation();
    set(lineageMenu, { x: e.clientX, y: e.clientY, item }, true);
  }
  function lineageMenuAction(action2, item) {
    var _a2, _b, _c;
    const hash = item == null ? void 0 : item.hash;
    if (!hash) return;
    if (action2 === "edit") {
      lineageJump(hash);
      openEdit(hash);
    } else if (action2 === "delete") {
      set(deleteTargetHash, hash, true);
      set(confirmDeleteOpen, true);
    } else if (action2 === "open-file") {
      (_a2 = fetchApi()) == null ? void 0 : _a2(`/promptchain/open-file?hash=${encodeURIComponent(hash)}`).catch(() => {
      });
    } else if (action2 === "open-folder") {
      (_b = fetchApi()) == null ? void 0 : _b(`/promptchain/reveal-file?hash=${encodeURIComponent(hash)}`).catch(() => {
      });
    } else if (action2 === "properties") {
      (_c = fetchApi()) == null ? void 0 : _c(`/promptchain/file-properties?hash=${encodeURIComponent(hash)}`).catch(() => {
      });
    }
  }
  async function handleDelete() {
    var _a2, _b;
    set(confirmDeleteOpen, false);
    if (!onDelete() || get(deleting)) return;
    const hash = get(deleteTargetHash) || get(displayedHash);
    set(deleteTargetHash, null);
    const linIdx = get(lineageVisible).findIndex((item) => (item == null ? void 0 : item.hash) === hash);
    let landHash = null;
    if (linIdx >= 0) {
      const prev = (_a2 = get(lineageVisible)[linIdx - 1]) == null ? void 0 : _a2.hash;
      const next = (_b = get(lineageVisible)[linIdx + 1]) == null ? void 0 : _b.hash;
      landHash = prev && prev !== hash ? prev : next && next !== hash ? next : null;
    }
    set(deleting, true);
    try {
      await onDelete()(hash);
      const idx = images().findIndex((i) => i.hash === hash);
      images(images().filter((i) => i.hash !== hash));
      if (images().length === 0) {
        const survivors = get(lineageList).filter((item) => (item == null ? void 0 : item.hash) && item.hash !== hash);
        if (survivors.length) {
          const removedAt = get(lineageList).findIndex((item) => (item == null ? void 0 : item.hash) === hash);
          const next = survivors.find((s) => s.hash === landHash) || survivors[Math.min(Math.max(0, removedAt), survivors.length - 1)];
          images(survivors);
          set(currentIndex, Math.max(0, survivors.findIndex((s) => s.hash === next.hash)), true);
          set(displayedHash, next.hash, true);
        } else {
          onClose()();
        }
        return;
      }
      if (landHash) {
        const li = images().findIndex((i) => i.hash === landHash);
        set(
          currentIndex,
          li >= 0 ? li : Math.min(idx >= 0 ? idx : get(currentIndex), images().length - 1),
          true
        );
        set(displayedHash, landHash, true);
      } else if (idx >= 0) {
        const nextIdx = Math.min(idx, images().length - 1);
        set(currentIndex, nextIdx, true);
        set(displayedHash, images()[nextIdx].hash, true);
      } else {
        set(displayedHash, images()[Math.min(get(currentIndex), images().length - 1)].hash, true);
      }
    } catch (e) {
      console.error("[PromptChain] viewer delete failed", e);
    }
    set(deleting, false);
  }
  function formatSeed(seed) {
    return seed != null ? String(seed) : null;
  }
  function parseRegions(raw) {
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      return Array.isArray(obj == null ? void 0 : obj.regions) && obj.regions.length ? obj : null;
    } catch {
      return null;
    }
  }
  function timeAgo(epochSec) {
    const s = Math.max(0, Math.floor(Date.now() / 1e3 - epochSec));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }
  let hoverTip = state(
    null
    // { item, top, left }
  );
  function showTip(e, item) {
    const r = e.currentTarget.getBoundingClientRect();
    const top = Math.max(56, Math.min(window.innerHeight - 56, r.top + r.height / 2));
    set(hoverTip, { item, top, left: r.right + 9 }, true);
  }
  function hideTip() {
    set(hoverTip, null);
  }
  function copySeed() {
    var _a2;
    if (((_a2 = get(imageInfo)) == null ? void 0 : _a2.seed) != null) {
      navigator.clipboard.writeText(String(get(imageInfo).seed)).catch(() => {
      });
    }
  }
  var fragment = root();
  event("keydown", $window, handleKeydown);
  event("mousemove", $window, handleWindowMouseMove);
  event("mouseup", $window, handleWindowMouseUp);
  event("click", $window, (e) => {
    if (get(compareDropdownOpen) && !e.target.closest(".pcr-viewer-compare-container")) set(compareDropdownOpen, false);
    if (get(zoomDropdownOpen) && !e.target.closest(".pcr-viewer-zoom-control")) set(zoomDropdownOpen, false);
  });
  var div = first_child(fragment);
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1();
      var text = child(div_1);
      template_effect(() => set_text(text, `✨ ${get(newGenBanner) ?? ""}`));
      append($$anchor2, div_1);
    };
    if_block(node, ($$render) => {
      if (get(newGenBanner)) $$render(consequent);
    });
  }
  var node_1 = sibling(node, 2);
  {
    var consequent_5 = ($$anchor2) => {
      var div_2 = root_2();
      var div_3 = child(div_2);
      var text_1 = child(div_3);
      var div_4 = sibling(div_3, 2);
      each(div_4, 23, () => get(lineageDisplay), (d) => d.kind === "node" ? d.item.hash : `${d.kind}:${d.at}`, ($$anchor3, d, i) => {
        var fragment_1 = comment();
        var node_2 = first_child(fragment_1);
        {
          var consequent_2 = ($$anchor4) => {
            const item = user_derived(() => get(d).item);
            var div_5 = root_4();
            let classes;
            var img_1 = child(div_5);
            var div_6 = sibling(img_1, 2);
            let classes_1;
            var node_3 = sibling(div_6, 2);
            {
              var consequent_1 = ($$anchor5) => {
                var div_7 = root_5();
                append($$anchor5, div_7);
              };
              if_block(node_3, ($$render) => {
                if (get(editDocLayers)[get(item).hash]) $$render(consequent_1);
              });
            }
            template_effect(
              ($0) => {
                var _a2;
                classes = set_class(div_5, 1, "pcr-viewer-lineage-node svelte-5cciiw", null, classes, {
                  current: get(i) === get(lineageDisplayCurrentIdx),
                  ancestor: get(i) < get(lineageDisplayCurrentIdx),
                  descendant: get(i) > get(lineageDisplayCurrentIdx),
                  branch: get(d).branch,
                  orphaned: get(item).orphaned === 1,
                  "compare-candidate": get(compareDropdownOpen) && get(item).hash !== get(displayedHash),
                  "compare-left": get(compareMode) && get(item).hash === get(displayedHash),
                  "compare-right": get(compareMode) && get(item).hash === get(compareTargetHash)
                });
                set_attribute(img_1, "src", $0);
                classes_1 = set_class(div_6, 1, "pcr-viewer-lineage-dot svelte-5cciiw", null, classes_1, {
                  "dot-root": get(item).hash === ((_a2 = get(lineageList)[0]) == null ? void 0 : _a2.hash),
                  "dot-current": get(i) === get(lineageDisplayCurrentIdx),
                  "dot-tip": get(i) === get(lineageDisplay).length - 1 && get(i) !== get(lineageDisplayCurrentIdx)
                });
              },
              [() => thumbUrl(get(item).hash)]
            );
            delegated("click", div_5, () => {
              if (get(compareDropdownOpen)) {
                if (get(item).hash !== get(displayedHash)) enterCompareWith(get(item).hash, get(item).filename || get(item).hash.slice(0, 8));
                return;
              }
              lineageJump(get(item).hash);
              exitCompare();
            });
            event("mouseenter", div_5, (e) => showTip(e, get(item)));
            event("mouseleave", div_5, hideTip);
            delegated("contextmenu", div_5, (e) => {
              hideTip();
              openLineageMenu(e, get(item));
            });
            append($$anchor4, div_5);
          };
          var alternate_1 = ($$anchor4) => {
            var div_8 = root_6();
            let classes_2;
            var node_4 = child(div_8);
            {
              var consequent_3 = ($$anchor5) => {
                var fragment_2 = root_7();
                var div_9 = first_child(fragment_2);
                each(div_9, 21, () => get(d).preview, (p) => p.hash, ($$anchor6, p) => {
                  var img_2 = root_8();
                  template_effect(($0) => set_attribute(img_2, "src", $0), [() => thumbUrl(get(p).hash)]);
                  append($$anchor6, img_2);
                });
                var span = sibling(div_9, 2);
                var text_2 = child(span);
                template_effect(() => set_text(text_2, `+${get(d).count ?? ""}`));
                append($$anchor5, fragment_2);
              };
              var alternate = ($$anchor5) => {
                var span_1 = root_9();
                append($$anchor5, span_1);
              };
              if_block(node_4, ($$render) => {
                if (get(d).kind === "bundle") $$render(consequent_3);
                else $$render(alternate, -1);
              });
            }
            template_effect(() => {
              classes_2 = set_class(div_8, 1, "pcr-viewer-lineage-bundle svelte-5cciiw", null, classes_2, { expanded: get(d).kind === "collapse" });
              set_attribute(div_8, "title", get(d).kind === "collapse" ? "Collapse this branch" : `${get(d).count} other generation${get(d).count > 1 ? "s" : ""} branch off here — click to expand`);
            });
            delegated("click", div_8, () => toggleBundle(get(d).at));
            append($$anchor4, div_8);
          };
          if_block(node_2, ($$render) => {
            if (get(d).kind === "node") $$render(consequent_2);
            else $$render(alternate_1, -1);
          });
        }
        append($$anchor3, fragment_1);
      });
      var node_5 = sibling(div_4, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var div_10 = root_10();
          var text_3 = child(div_10);
          template_effect(() => set_text(text_3, `${get(lineageHiddenCount) ?? ""} hidden`));
          append($$anchor3, div_10);
        };
        if_block(node_5, ($$render) => {
          if (get(lineageHiddenCount) > 0) $$render(consequent_4);
        });
      }
      template_effect(() => set_text(text_1, `${get(lineageCurrentIdx) + 1} / ${get(lineageList).length ?? ""}`));
      append($$anchor2, div_2);
    };
    var alternate_2 = ($$anchor2) => {
      var div_11 = root_11();
      append($$anchor2, div_11);
    };
    if_block(node_1, ($$render) => {
      if (get(lineageList).length > 1) $$render(consequent_5);
      else $$render(alternate_2, -1);
    });
  }
  var node_6 = sibling(node_1, 2);
  {
    var consequent_9 = ($$anchor2) => {
      var div_12 = root_12();
      var div_13 = child(div_12);
      var text_4 = child(div_13);
      var node_7 = sibling(div_13, 2);
      {
        var consequent_6 = ($$anchor3) => {
          var div_14 = root_13();
          var text_5 = child(div_14);
          template_effect(($0) => set_text(text_5, $0), [() => timeAgo(get(hoverTip).item.created_at)]);
          append($$anchor3, div_14);
        };
        if_block(node_7, ($$render) => {
          if (get(hoverTip).item.created_at) $$render(consequent_6);
        });
      }
      var node_8 = sibling(node_7, 2);
      {
        var consequent_7 = ($$anchor3) => {
          var div_15 = root_14();
          var text_6 = child(div_15);
          template_effect(() => set_text(text_6, `${get(hoverTip).item.width ?? ""}×${get(hoverTip).item.height ?? ""}`));
          append($$anchor3, div_15);
        };
        if_block(node_8, ($$render) => {
          if (get(hoverTip).item.width && get(hoverTip).item.height) $$render(consequent_7);
        });
      }
      var node_9 = sibling(node_8, 2);
      {
        var consequent_8 = ($$anchor3) => {
          var div_16 = root_15();
          var text_7 = child(div_16);
          template_effect(() => set_text(text_7, `▦ ${get(editDocLayers)[get(hoverTip).item.hash] ?? ""} layers — opens layered in Edit`));
          append($$anchor3, div_16);
        };
        if_block(node_9, ($$render) => {
          if (get(editDocLayers)[get(hoverTip).item.hash]) $$render(consequent_8);
        });
      }
      template_effect(
        ($0) => {
          set_style(div_12, `top:${get(hoverTip).top ?? ""}px; left:${get(hoverTip).left ?? ""}px;`);
          set_text(text_4, $0);
        },
        [
          () => {
            var _a2;
            return get(hoverTip).item.filename || ((_a2 = get(hoverTip).item.hash) == null ? void 0 : _a2.slice(0, 12));
          }
        ]
      );
      append($$anchor2, div_12);
    };
    if_block(node_6, ($$render) => {
      if (get(hoverTip)) $$render(consequent_9);
    });
  }
  var div_17 = sibling(node_6, 2);
  var node_10 = child(div_17);
  {
    var consequent_18 = ($$anchor2) => {
      var fragment_3 = root_16();
      var node_11 = first_child(fragment_3);
      {
        var consequent_10 = ($$anchor3) => {
          var div_18 = root_17();
          append($$anchor3, div_18);
        };
        if_block(node_11, ($$render) => {
          if (!get(imageLoaded) && !get(imageError)) $$render(consequent_10);
        });
      }
      var img_3 = sibling(node_11, 2);
      let classes_3;
      bind_this(img_3, ($$value) => set(mainImageEl, $$value), () => get(mainImageEl));
      var node_12 = sibling(img_3, 2);
      {
        var consequent_11 = ($$anchor3) => {
          var img_4 = root_18();
          template_effect(() => {
            set_attribute(img_4, "src", get(compareImageUrl));
            set_style(img_4, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""}); clip-path: inset(0 0 0 ${get(compareClipPercent) ?? ""}%);`);
          });
          append($$anchor3, img_4);
        };
        if_block(node_12, ($$render) => {
          if (get(compareMode) && get(compareImageUrl)) $$render(consequent_11);
        });
      }
      var node_13 = sibling(node_12, 2);
      {
        var consequent_14 = ($$anchor3) => {
          var div_19 = root_19();
          var div_20 = child(div_19);
          var text_8 = child(div_20);
          var node_14 = sibling(div_20, 2);
          {
            var consequent_13 = ($$anchor4) => {
              var fragment_4 = root_20();
              var button = sibling(first_child(fragment_4), 2);
              var text_9 = child(button);
              var node_15 = sibling(button, 2);
              {
                var consequent_12 = ($$anchor5) => {
                  var div_21 = root_21();
                  var text_10 = child(div_21);
                  template_effect(() => set_text(text_10, get(reattachMsg)));
                  append($$anchor5, div_21);
                };
                if_block(node_15, ($$render) => {
                  if (get(reattachMsg)) $$render(consequent_12);
                });
              }
              var input = sibling(node_15, 2);
              bind_this(input, ($$value) => set(reattachInputEl, $$value), () => get(reattachInputEl));
              template_effect(() => {
                button.disabled = get(reattaching);
                set_text(text_9, get(reattaching) ? "Verifying…" : "Locate file…");
              });
              delegated("click", button, () => {
                var _a2;
                return (_a2 = get(reattachInputEl)) == null ? void 0 : _a2.click();
              });
              delegated("change", input, handleReattachPick);
              append($$anchor4, fragment_4);
            };
            if_block(node_14, ($$render) => {
              if (get(canReattach)) $$render(consequent_13);
            });
          }
          template_effect(() => set_text(text_8, get(isOrphaned) ? "Source file deleted" : "Image not found"));
          append($$anchor3, div_19);
        };
        if_block(node_13, ($$render) => {
          if (get(imageError)) $$render(consequent_14);
        });
      }
      var node_16 = sibling(node_13, 2);
      {
        var consequent_17 = ($$anchor3) => {
          var fragment_5 = root_22();
          var div_22 = first_child(fragment_5);
          var div_23 = sibling(div_22, 2);
          var text_11 = child(div_23);
          var node_17 = sibling(text_11);
          {
            var consequent_15 = ($$anchor4) => {
              var div_24 = root_23();
              var text_12 = child(div_24);
              template_effect(($0) => set_text(text_12, $0), [() => timeAgo(get(imageInfo).created_at)]);
              append($$anchor4, div_24);
            };
            if_block(node_17, ($$render) => {
              var _a2;
              if ((_a2 = get(imageInfo)) == null ? void 0 : _a2.created_at) $$render(consequent_15);
            });
          }
          var div_25 = sibling(div_23, 2);
          var text_13 = child(div_25);
          var node_18 = sibling(text_13);
          {
            var consequent_16 = ($$anchor4) => {
              var div_26 = root_24();
              var text_14 = child(div_26);
              template_effect(($0) => set_text(text_14, $0), [() => timeAgo(get(compareTargetItem).created_at)]);
              append($$anchor4, div_26);
            };
            if_block(node_18, ($$render) => {
              var _a2;
              if ((_a2 = get(compareTargetItem)) == null ? void 0 : _a2.created_at) $$render(consequent_16);
            });
          }
          template_effect(() => {
            var _a2;
            set_style(div_22, `left: ${get(compareSliderPos) ?? ""}%;`);
            set_text(text_11, `${(((_a2 = get(imageInfo)) == null ? void 0 : _a2.filename) || "Current") ?? ""} `);
            set_text(text_13, `${(get(compareTargetLabel) || "Compare") ?? ""} `);
          });
          delegated("mousedown", div_22, handleSliderDown);
          append($$anchor3, fragment_5);
        };
        if_block(node_16, ($$render) => {
          if (get(compareMode)) $$render(consequent_17);
        });
      }
      template_effect(
        ($0) => {
          set_attribute(img_3, "src", $0);
          classes_3 = set_class(img_3, 1, "pcr-viewer-image svelte-5cciiw", null, classes_3, { hidden: !get(imageLoaded) });
          set_style(img_3, `transform: translate(${get(panX) ?? ""}px, ${get(panY) ?? ""}px) scale(${get(zoom) ?? ""})`);
        },
        [() => mainImageSrc(get(displayedHash))]
      );
      event("load", img_3, () => {
        set(imageLoaded, true);
      });
      event("error", img_3, () => {
        set(imageError, true);
        set(imageLoaded, false);
      });
      append($$anchor2, fragment_3);
    };
    if_block(node_10, ($$render) => {
      if (get(displayedHash)) $$render(consequent_18);
    });
  }
  var node_19 = sibling(node_10, 2);
  {
    var consequent_19 = ($$anchor2) => {
      var div_27 = root_25();
      delegated("pointerdown", div_27, (e) => e.stopPropagation());
      delegated("click", div_27, (e) => {
        e.stopPropagation();
        navigate(-1);
      });
      append($$anchor2, div_27);
    };
    if_block(node_19, ($$render) => {
      if (get(currentIndex) > 0) $$render(consequent_19);
    });
  }
  var node_20 = sibling(node_19, 2);
  {
    var consequent_20 = ($$anchor2) => {
      var div_28 = root_26();
      delegated("pointerdown", div_28, (e) => e.stopPropagation());
      delegated("click", div_28, (e) => {
        e.stopPropagation();
        navigate(1);
      });
      append($$anchor2, div_28);
    };
    if_block(node_20, ($$render) => {
      if (get(currentIndex) < images().length - 1) $$render(consequent_20);
    });
  }
  bind_this(div_17, ($$value) => containerEl = $$value, () => containerEl);
  var div_29 = sibling(div_17, 2);
  var div_30 = child(div_29);
  var span_2 = child(div_30);
  var text_15 = child(span_2);
  var div_31 = sibling(span_2, 2);
  var node_21 = sibling(div_30, 2);
  {
    var consequent_23 = ($$anchor2) => {
      var div_32 = root_27();
      let classes_4;
      var div_33 = child(div_32);
      var div_34 = child(div_33);
      var node_22 = child(div_34);
      each(node_22, 17, () => get(visibleThumbs), (thumb) => thumb.hash, ($$anchor3, thumb) => {
        var div_35 = root_28();
        let classes_5;
        var img_5 = child(div_35);
        template_effect(
          ($0) => {
            classes_5 = set_class(div_35, 1, "pcr-viewer-history-thumb svelte-5cciiw", null, classes_5, { current: get(thumb).globalIndex === get(currentIndex) });
            set_attribute(img_5, "src", $0);
          },
          [() => thumbUrl(get(thumb).hash)]
        );
        delegated("click", div_35, () => jumpTo(get(thumb).globalIndex));
        append($$anchor3, div_35);
      });
      var div_36 = sibling(div_34, 2);
      var svg = child(div_36);
      var node_23 = child(svg);
      {
        var consequent_21 = ($$anchor3) => {
          var path_1 = root_29();
          append($$anchor3, path_1);
        };
        var alternate_3 = ($$anchor3) => {
          var path_2 = root_30();
          append($$anchor3, path_2);
        };
        if_block(node_23, ($$render) => {
          if (get(historyExpanded)) $$render(consequent_21);
          else $$render(alternate_3, -1);
        });
      }
      var div_37 = sibling(div_33, 2);
      var div_38 = child(div_37);
      var div_39 = sibling(div_38, 2);
      var node_24 = sibling(div_37, 2);
      {
        var consequent_22 = ($$anchor3) => {
          var div_40 = root_31();
          each(div_40, 23, images, (img) => img.hash, ($$anchor4, img, idx) => {
            var div_41 = root_32();
            let classes_6;
            var img_6 = child(div_41);
            template_effect(
              ($0) => {
                classes_6 = set_class(div_41, 1, "pcr-viewer-grid-thumb svelte-5cciiw", null, classes_6, { current: get(idx) === get(currentIndex) });
                set_attribute(img_6, "src", $0);
              },
              [() => thumbUrl(get(img).hash)]
            );
            delegated("click", div_41, () => jumpTo(get(idx)));
            append($$anchor4, div_41);
          });
          bind_this(div_40, ($$value) => set(historyGridEl, $$value), () => get(historyGridEl));
          append($$anchor3, div_40);
        };
        if_block(node_24, ($$render) => {
          if (get(historyExpanded)) $$render(consequent_22);
        });
      }
      template_effect(() => {
        classes_4 = set_class(div_32, 1, "pcr-viewer-history svelte-5cciiw", null, classes_4, { expanded: get(historyExpanded) });
        set_attribute(div_36, "title", get(historyExpanded) ? "Collapse" : "Expand");
        set_style(div_38, `width: ${get(scrubberPercent) ?? ""}%`);
        set_style(div_39, `left: ${get(scrubberPercent) ?? ""}%`);
      });
      delegated("click", div_36, toggleGrid);
      delegated("mousedown", div_37, handleScrubberTrackDown);
      delegated("mousedown", div_39, handleScrubberHandleDown);
      append($$anchor2, div_32);
    };
    if_block(node_21, ($$render) => {
      if (images().length > 1) $$render(consequent_23);
    });
  }
  var div_42 = sibling(node_21, 2);
  var div_43 = child(div_42);
  var div_44 = child(div_43);
  var div_45 = child(div_44);
  var span_3 = sibling(child(div_45), 2);
  var text_16 = child(span_3);
  var node_25 = sibling(div_45, 2);
  {
    var consequent_24 = ($$anchor2) => {
      var div_46 = root_33();
      each(div_46, 21, () => ZOOM_PRESETS, index, ($$anchor3, level) => {
        var div_47 = root_34();
        var text_17 = child(div_47);
        template_effect(() => set_text(text_17, `${get(level) ?? ""}%`));
        delegated("click", div_47, () => setZoomLevel(get(level)));
        append($$anchor3, div_47);
      });
      append($$anchor2, div_46);
    };
    if_block(node_25, ($$render) => {
      if (get(zoomDropdownOpen)) $$render(consequent_24);
    });
  }
  var input_1 = sibling(div_44, 2);
  var node_26 = sibling(div_43, 2);
  {
    var consequent_27 = ($$anchor2) => {
      var div_48 = root_35();
      var div_49 = child(div_48);
      let classes_7;
      var node_27 = sibling(div_49, 2);
      {
        var consequent_26 = ($$anchor3) => {
          var div_50 = root_36();
          var node_28 = child(div_50);
          each(node_28, 17, () => get(compareTargets), index, ($$anchor4, target) => {
            var div_51 = root_37();
            let classes_8;
            var text_18 = child(div_51);
            template_effect(
              ($0) => {
                classes_8 = set_class(div_51, 1, "pcr-viewer-compare-dropdown-item svelte-5cciiw", null, classes_8, { active: get(compareTargetHash) === get(target).hash });
                set_text(text_18, $0);
              },
              [
                () => get(target).filename || get(target).hash.slice(0, 8)
              ]
            );
            delegated("click", div_51, () => enterCompareWith(get(target).hash, get(target).filename || get(target).hash.slice(0, 8)));
            append($$anchor4, div_51);
          });
          var node_29 = sibling(node_28, 2);
          {
            var consequent_25 = ($$anchor4) => {
              var fragment_6 = root_38();
              var div_52 = sibling(first_child(fragment_6), 2);
              delegated("click", div_52, exitCompare);
              append($$anchor4, fragment_6);
            };
            if_block(node_29, ($$render) => {
              if (get(compareMode)) $$render(consequent_25);
            });
          }
          append($$anchor3, div_50);
        };
        if_block(node_27, ($$render) => {
          if (get(compareDropdownOpen)) $$render(consequent_26);
        });
      }
      template_effect(() => classes_7 = set_class(div_49, 1, "pcr-viewer-toolbar-btn svelte-5cciiw", null, classes_7, { active: get(compareMode) || get(compareDropdownOpen) }));
      delegated("click", div_49, () => {
        set(compareDropdownOpen, !get(compareDropdownOpen));
      });
      append($$anchor2, div_48);
    };
    if_block(node_26, ($$render) => {
      if (get(hasCompareTargets)) $$render(consequent_27);
    });
  }
  var node_30 = sibling(node_26, 2);
  {
    if_block(node_30, ($$render) => {
    });
  }
  var node_31 = sibling(node_30, 2);
  {
    if_block(node_31, ($$render) => {
    });
  }
  var node_32 = sibling(node_31, 2);
  {
    var consequent_31 = ($$anchor2) => {
      var div_57 = root_41();
      var div_58 = child(div_57);
      var span_6 = sibling(child(div_58), 2);
      var text_21 = child(span_6);
      var node_33 = sibling(span_6, 2);
      {
        var consequent_30 = ($$anchor3) => {
          var span_7 = root_42();
          var text_22 = sibling(child(span_7));
          template_effect(() => {
            set_attribute(span_7, "title", `This image has ${get(editDocLayers)[get(displayedHash)] ?? ""} saved layers — Edit opens it layered, un-flattened`);
            set_text(text_22, ` ${get(editDocLayers)[get(displayedHash)] ?? ""}`);
          });
          append($$anchor3, span_7);
        };
        if_block(node_33, ($$render) => {
          if (get(editDocLayers)[get(displayedHash)]) $$render(consequent_30);
        });
      }
      template_effect(() => set_text(text_21, get(editPreparing) ? "Reading..." : "Edit"));
      delegated("click", div_58, () => {
        if (!get(editPreparing)) openEdit();
      });
      append($$anchor2, div_57);
    };
    if_block(node_32, ($$render) => {
      if (onEditSave()) $$render(consequent_31);
    });
  }
  var div_59 = sibling(node_32, 2);
  var node_34 = child(div_59);
  {
    var consequent_32 = ($$anchor2) => {
      var div_60 = root_43();
      var span_8 = sibling(child(div_60), 2);
      var text_23 = child(span_8);
      template_effect(() => set_text(text_23, get(deleting) ? "Deleting..." : "Delete"));
      delegated("click", div_60, requestDelete);
      append($$anchor2, div_60);
    };
    if_block(node_34, ($$render) => {
      if (onDelete()) $$render(consequent_32);
    });
  }
  var node_35 = sibling(node_34, 2);
  {
    var consequent_33 = ($$anchor2) => {
      var div_61 = root_44();
      delegated("click", div_61, openFolder);
      append($$anchor2, div_61);
    };
    if_block(node_35, ($$render) => {
      if (isLocalClient) $$render(consequent_33);
    });
  }
  var div_62 = sibling(node_35, 2);
  let classes_9;
  var span_9 = sibling(child(div_62), 2);
  var text_24 = child(span_9);
  var div_63 = sibling(div_42, 2);
  var node_36 = child(div_63);
  {
    var consequent_51 = ($$anchor2) => {
      var fragment_7 = root_45();
      var div_64 = sibling(first_child(fragment_7), 2);
      var div_65 = child(div_64);
      var node_37 = child(div_65);
      {
        var consequent_34 = ($$anchor3) => {
          var div_66 = root_46();
          var span_10 = sibling(child(div_66), 2);
          var text_25 = child(span_10);
          template_effect(() => set_text(text_25, `${get(imageInfo).width ?? ""} × ${get(imageInfo).height ?? ""}`));
          append($$anchor3, div_66);
        };
        if_block(node_37, ($$render) => {
          if (get(imageInfo).width && get(imageInfo).height) $$render(consequent_34);
        });
      }
      var node_38 = sibling(node_37, 2);
      {
        var consequent_35 = ($$anchor3) => {
          var div_67 = root_47();
          var span_11 = sibling(child(div_67), 2);
          var text_26 = child(span_11);
          template_effect(($0) => set_text(text_26, $0), [
            () => get(imageInfo).file_size > 1048576 ? (get(imageInfo).file_size / 1048576).toFixed(1) + " MB" : Math.round(get(imageInfo).file_size / 1024) + " KB"
          ]);
          append($$anchor3, div_67);
        };
        if_block(node_38, ($$render) => {
          if (get(imageInfo).file_size) $$render(consequent_35);
        });
      }
      var node_39 = sibling(div_65, 2);
      {
        var consequent_36 = ($$anchor3) => {
          var div_68 = root_48();
          var span_12 = sibling(child(div_68), 2);
          var text_27 = child(span_12);
          template_effect(($0) => set_text(text_27, $0), [
            () => new Date(get(imageInfo).created_at * 1e3).toLocaleDateString()
          ]);
          append($$anchor3, div_68);
        };
        if_block(node_39, ($$render) => {
          if (get(imageInfo).created_at) $$render(consequent_36);
        });
      }
      var node_40 = sibling(node_39, 2);
      {
        var consequent_37 = ($$anchor3) => {
          var div_69 = root_49();
          var span_13 = sibling(child(div_69), 2);
          var text_28 = child(span_13);
          template_effect(() => set_text(text_28, get(imageInfo).filename));
          append($$anchor3, div_69);
        };
        if_block(node_40, ($$render) => {
          if (get(imageInfo).filename) $$render(consequent_37);
        });
      }
      var node_41 = sibling(node_40, 2);
      {
        var consequent_38 = ($$anchor3) => {
          var div_70 = root_50();
          append($$anchor3, div_70);
        };
        if_block(node_41, ($$render) => {
          if (get(isOrphaned)) $$render(consequent_38);
        });
      }
      var node_42 = sibling(div_64, 2);
      {
        var consequent_43 = ($$anchor3) => {
          const regionData = user_derived(() => parseRegions(get(imageInfo).regions));
          var fragment_8 = root_51();
          var div_71 = sibling(first_child(fragment_8), 2);
          var node_43 = child(div_71);
          {
            var consequent_40 = ($$anchor4) => {
              var fragment_9 = root_52();
              var node_44 = first_child(fragment_9);
              each(node_44, 17, () => get(regionData).regions, (region) => region.id, ($$anchor5, region) => {
                var div_72 = root_53();
                var span_14 = child(div_72);
                var text_29 = child(span_14);
                var p_1 = sibling(span_14, 2);
                var text_30 = child(p_1);
                template_effect(() => {
                  set_text(text_29, `$${get(region).name ?? ""}`);
                  set_text(text_30, get(region).text);
                });
                append($$anchor5, div_72);
              });
              var node_45 = sibling(node_44, 2);
              {
                var consequent_39 = ($$anchor5) => {
                  var div_73 = root_54();
                  var p_2 = sibling(child(div_73), 2);
                  var text_31 = child(p_2);
                  template_effect(() => set_text(text_31, get(regionData).global));
                  append($$anchor5, div_73);
                };
                if_block(node_45, ($$render) => {
                  if (get(regionData).global) $$render(consequent_39);
                });
              }
              append($$anchor4, fragment_9);
            };
            var consequent_41 = ($$anchor4) => {
              var div_74 = root_55();
              var p_3 = sibling(child(div_74), 2);
              var text_32 = child(p_3);
              template_effect(() => set_text(text_32, get(imageInfo).prompt));
              append($$anchor4, div_74);
            };
            if_block(node_43, ($$render) => {
              if (get(regionData)) $$render(consequent_40);
              else if (get(imageInfo).prompt) $$render(consequent_41, 1);
            });
          }
          var node_46 = sibling(node_43, 2);
          {
            var consequent_42 = ($$anchor4) => {
              var div_75 = root_56();
              var p_4 = sibling(child(div_75), 2);
              var text_33 = child(p_4);
              template_effect(() => set_text(text_33, get(imageInfo).negative));
              append($$anchor4, div_75);
            };
            if_block(node_46, ($$render) => {
              if (get(imageInfo).negative) $$render(consequent_42);
            });
          }
          append($$anchor3, fragment_8);
        };
        if_block(node_42, ($$render) => {
          if (get(imageInfo).prompt || get(imageInfo).negative) $$render(consequent_43);
        });
      }
      var node_47 = sibling(node_42, 2);
      {
        var consequent_50 = ($$anchor3) => {
          var fragment_10 = root_57();
          var div_76 = sibling(first_child(fragment_10), 2);
          var node_48 = child(div_76);
          {
            var consequent_44 = ($$anchor4) => {
              var div_77 = root_58();
              var span_15 = sibling(child(div_77), 2);
              var text_34 = child(span_15);
              template_effect(() => set_text(text_34, get(imageInfo).model));
              append($$anchor4, div_77);
            };
            if_block(node_48, ($$render) => {
              if (get(imageInfo).model) $$render(consequent_44);
            });
          }
          var node_49 = sibling(node_48, 2);
          {
            var consequent_45 = ($$anchor4) => {
              var div_78 = root_59();
              var span_16 = sibling(child(div_78), 2);
              var text_35 = child(span_16);
              template_effect(($0) => set_text(text_35, $0), [() => formatSeed(get(imageInfo).seed)]);
              delegated("click", div_78, copySeed);
              append($$anchor4, div_78);
            };
            if_block(node_49, ($$render) => {
              if (get(imageInfo).seed != null) $$render(consequent_45);
            });
          }
          var div_79 = sibling(node_49, 2);
          var node_50 = child(div_79);
          {
            var consequent_46 = ($$anchor4) => {
              var div_80 = root_60();
              var span_17 = sibling(child(div_80), 2);
              var text_36 = child(span_17);
              template_effect(() => set_text(text_36, get(imageInfo).steps));
              append($$anchor4, div_80);
            };
            if_block(node_50, ($$render) => {
              if (get(imageInfo).steps) $$render(consequent_46);
            });
          }
          var node_51 = sibling(node_50, 2);
          {
            var consequent_47 = ($$anchor4) => {
              var div_81 = root_61();
              var span_18 = sibling(child(div_81), 2);
              var text_37 = child(span_18);
              template_effect(() => set_text(text_37, get(imageInfo).cfg));
              append($$anchor4, div_81);
            };
            if_block(node_51, ($$render) => {
              if (get(imageInfo).cfg) $$render(consequent_47);
            });
          }
          var node_52 = sibling(node_51, 2);
          {
            var consequent_48 = ($$anchor4) => {
              var div_82 = root_62();
              var span_19 = sibling(child(div_82), 2);
              var text_38 = child(span_19);
              template_effect(() => set_text(text_38, get(imageInfo).sampler));
              append($$anchor4, div_82);
            };
            if_block(node_52, ($$render) => {
              if (get(imageInfo).sampler) $$render(consequent_48);
            });
          }
          var node_53 = sibling(node_52, 2);
          {
            var consequent_49 = ($$anchor4) => {
              var div_83 = root_63();
              var span_20 = sibling(child(div_83), 2);
              var text_39 = child(span_20);
              template_effect(() => set_text(text_39, get(imageInfo).denoise));
              append($$anchor4, div_83);
            };
            if_block(node_53, ($$render) => {
              if (get(imageInfo).denoise != null) $$render(consequent_49);
            });
          }
          append($$anchor3, fragment_10);
        };
        if_block(node_47, ($$render) => {
          if (get(imageInfo).model || get(imageInfo).seed != null || get(imageInfo).steps) $$render(consequent_50);
        });
      }
      append($$anchor2, fragment_7);
    };
    var consequent_52 = ($$anchor2) => {
      var div_84 = root_64();
      append($$anchor2, div_84);
    };
    if_block(node_36, ($$render) => {
      if (get(imageInfo)) $$render(consequent_51);
      else if (get(currentImage)) $$render(consequent_52, 1);
    });
  }
  bind_this(div, ($$value) => viewerEl = $$value, () => viewerEl);
  var node_54 = sibling(div, 2);
  {
    let $0 = user_derived(() => get(displayedHash) || "");
    let $1 = user_derived(() => {
      var _a2;
      return (_a2 = get(upscalePrepared)) == null ? void 0 : _a2.caps;
    });
    let $2 = user_derived(() => {
      var _a2, _b;
      return ((_b = (_a2 = get(upscalePrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.filename) || "";
    });
    let $3 = user_derived(() => {
      var _a2, _b;
      return ((_b = (_a2 = get(upscalePrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.width) || 0;
    });
    let $4 = user_derived(() => {
      var _a2, _b;
      return ((_b = (_a2 = get(upscalePrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.height) || 0;
    });
    let $5 = user_derived(() => get(upscaleFromEdit) ? handleUpscaleToEdit : null);
    let $6 = user_derived(() => {
      var _a2;
      return get(upscaleFromEdit) ? ((_a2 = get(upscaleEditCtx)) == null ? void 0 : _a2.docWidth) || 0 : 0;
    });
    let $7 = user_derived(() => {
      var _a2;
      return get(upscaleFromEdit) ? ((_a2 = get(upscaleEditCtx)) == null ? void 0 : _a2.docHeight) || 0 : 0;
    });
    UpscaleOptionsModal(node_54, {
      get open() {
        return get(upscaleModalOpen);
      },
      get imageKey() {
        return get($0);
      },
      get caps() {
        return get($1);
      },
      get fetchApi() {
        return fetchApi();
      },
      get filename() {
        return get($2);
      },
      get width() {
        return get($3);
      },
      get height() {
        return get($4);
      },
      get previewUrl() {
        return get(upscalePreviewUrl);
      },
      get progress() {
        return get(upscaleProgress);
      },
      onConfirm: confirmUpscale,
      onCancel: cancelUpscale,
      onCancelRun: cancelUpscaleRun,
      onViewResult: viewUpscaleResult,
      get onUseInEdit() {
        return get($5);
      },
      get elevated() {
        return get(upscaleFromEdit);
      },
      get docWidth() {
        return get($6);
      },
      get docHeight() {
        return get($7);
      },
      get onInstallPack() {
        return onInpaintInstallPack();
      },
      get mountPromptEditor() {
        return onMountPromptEditor();
      }
    });
  }
  var node_55 = sibling(node_54, 2);
  {
    let $0 = user_derived(() => get(displayedHash) || "");
    let $1 = user_derived(() => {
      var _a2;
      return ((_a2 = get(inpaintPrepared)) == null ? void 0 : _a2.sourceUrl) || "";
    });
    let $2 = user_derived(() => {
      var _a2, _b;
      return ((_b = (_a2 = get(inpaintPrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.width) || 0;
    });
    let $3 = user_derived(() => {
      var _a2, _b;
      return ((_b = (_a2 = get(inpaintPrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.height) || 0;
    });
    let $4 = user_derived(() => {
      var _a2, _b;
      return ((_b = (_a2 = get(inpaintPrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.filename) || "";
    });
    let $5 = user_derived(() => {
      var _a2;
      return (_a2 = get(inpaintPrepared)) == null ? void 0 : _a2.caps;
    });
    let $6 = user_derived(() => {
      var _a2, _b, _c;
      return ((_b = (_a2 = get(inpaintPrepared)) == null ? void 0 : _a2.caps) == null ? void 0 : _b.prefillPrompt) || (((_c = get(imageInfo)) == null ? void 0 : _c.prompt) ? get(imageInfo).prompt + (get(imageInfo).negative ? `

Negative Prompt:
${get(imageInfo).negative}` : "") : "");
    });
    let $7 = user_derived(() => {
      var _a2, _b, _c;
      return ((_b = (_a2 = get(inpaintPrepared)) == null ? void 0 : _a2.caps) == null ? void 0 : _b.referencePrompt) || (((_c = get(imageInfo)) == null ? void 0 : _c.prompt) ? get(imageInfo).prompt + (get(imageInfo).negative ? `

Negative Prompt:
${get(imageInfo).negative}` : "") : "");
    });
    let $8 = user_derived(() => get(inpaintFromEdit) ? get(inpaintRegionPrefill) : null);
    let $9 = user_derived(() => get(inpaintFromEdit) ? get(inpaintMovedContent) : false);
    let $10 = user_derived(() => get(inpaintFromEdit) ? get(inpaintEditMask) : null);
    let $11 = user_derived(() => get(inpaintFromEdit) ? handleInpaintToEdit : null);
    InpaintModal(node_55, {
      get open() {
        return get(inpaintModalOpen);
      },
      get imageKey() {
        return get($0);
      },
      get sourceUrl() {
        return get($1);
      },
      get width() {
        return get($2);
      },
      get height() {
        return get($3);
      },
      get filename() {
        return get($4);
      },
      get caps() {
        return get($5);
      },
      get prefillPrompt() {
        return get($6);
      },
      get referencePrompt() {
        return get($7);
      },
      get fetchApi() {
        return fetchApi();
      },
      get apiURL() {
        return apiURL();
      },
      onRun: (options) => onInpaintRun()(get(inpaintPrepared), {
        ...options,
        condOffset: get(inpaintFromEdit) ? get(inpaintCondOffset) : null
      }),
      onSave: (doneState, prefix) => onInpaintSave()(doneState, prefix),
      get onUploadReference() {
        return onInpaintUploadReference();
      },
      get onInstallPack() {
        return onInpaintInstallPack();
      },
      get mountPromptEditor() {
        return onMountPromptEditor();
      },
      onSaved: inpaintSaved,
      get regionPrompts() {
        return get(editFigureRegions);
      },
      get forcedPrefill() {
        return get($8);
      },
      get forcedPrefillLabel() {
        return get(inpaintRegionName);
      },
      get movedContent() {
        return get($9);
      },
      get initialMask() {
        return get($10);
      },
      get onUseInEdit() {
        return get($11);
      },
      get elevated() {
        return get(inpaintFromEdit);
      },
      onCancel: () => {
        if (get(inpaintFromEdit)) closeInpaintFromEdit();
        else {
          set(inpaintModalOpen, false);
          set(inpaintPrepared, null);
        }
      }
    });
  }
  var node_56 = sibling(node_55, 2);
  {
    let $0 = user_derived(() => {
      var _a2;
      return ((_a2 = get(editPrepared)) == null ? void 0 : _a2.sourceUrl) || "";
    });
    let $1 = user_derived(() => {
      var _a2, _b;
      return ((_b = (_a2 = get(editPrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.width) || 0;
    });
    let $2 = user_derived(() => {
      var _a2, _b;
      return ((_b = (_a2 = get(editPrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.height) || 0;
    });
    let $3 = user_derived(() => {
      var _a2, _b;
      return ((_b = (_a2 = get(editPrepared)) == null ? void 0 : _a2.data) == null ? void 0 : _b.filename) || "";
    });
    let $4 = user_derived(() => {
      var _a2;
      return (_a2 = get(editPrepared)) == null ? void 0 : _a2.caps;
    });
    let $5 = user_derived(() => get(editPrepared) ? get(displayedHash) || "" : "");
    let $6 = user_derived(() => onInpaintRegion() ? openInpaintFromEdit : null);
    let $7 = user_derived(() => onUpscalePrepare() && onUpscaleBackground() && onInpaintUploadReference() ? openUpscaleFromEdit : null);
    let $8 = user_derived(() => onReposeCaps() && onReposeRun() && onMountPoser() && onInpaintUploadReference() ? openReposeFromEdit : null);
    let $9 = user_derived(() => get(inpaintFromEdit) && get(inpaintModalOpen) || get(upscaleFromEdit) && get(upscaleModalOpen) || get(reposeModalOpen));
    bind_this(
      EditModal(node_56, {
        get open() {
          return get(editModalOpen);
        },
        get sourceUrl() {
          return get($0);
        },
        get width() {
          return get($1);
        },
        get height() {
          return get($2);
        },
        get filename() {
          return get($3);
        },
        get caps() {
          return get($4);
        },
        get editDocHash() {
          return get($5);
        },
        get fetchApi() {
          return fetchApi();
        },
        get apiURL() {
          return apiURL();
        },
        onSave: (blob, prefix) => onEditSave()(get(editPrepared), blob, prefix),
        onSaved: inpaintSaved,
        get onOpenInpaint() {
          return get($6);
        },
        get onOpenUpscale() {
          return get($7);
        },
        get onOpenRepose() {
          return get($8);
        },
        get figureRegions() {
          return get(editFigureRegions);
        },
        get suspended() {
          return get($9);
        },
        onCancel: () => {
          set(editModalOpen, false);
          set(editPrepared, null);
          editEntry = null;
        }
      }),
      ($$value) => set(editModalRef, $$value, true),
      () => get(editModalRef)
    );
  }
  var node_57 = sibling(node_56, 2);
  {
    let $0 = user_derived(() => get(displayedHash) || "");
    let $1 = user_derived(() => {
      var _a2;
      return ((_a2 = get(reposePrepared)) == null ? void 0 : _a2.sourceUrl) || "";
    });
    let $2 = user_derived(() => {
      var _a2;
      return ((_a2 = get(reposePrepared)) == null ? void 0 : _a2.width) || 0;
    });
    let $3 = user_derived(() => {
      var _a2;
      return ((_a2 = get(reposePrepared)) == null ? void 0 : _a2.height) || 0;
    });
    let $4 = user_derived(() => {
      var _a2;
      return (_a2 = get(reposePrepared)) == null ? void 0 : _a2.caps;
    });
    RePoseModal(node_57, {
      get open() {
        return get(reposeModalOpen);
      },
      get imageKey() {
        return get($0);
      },
      get lineageKeys() {
        return get(reposeLineageKeys);
      },
      get fetchApi() {
        return fetchApi();
      },
      get sourceUrl() {
        return get($1);
      },
      get width() {
        return get($2);
      },
      get height() {
        return get($3);
      },
      get caps() {
        return get($4);
      },
      get progress() {
        return get(reposeProgress);
      },
      get onMountPoser() {
        return onMountPoser();
      },
      get mountPromptEditor() {
        return onMountPromptEditor();
      },
      onRun: confirmRepose,
      onUseInEdit: handleReposeToEdit,
      onCancel: () => {
        var _a2;
        if (get(reposeProgress) && ["building", "queueing", "running"].includes(get(reposeProgress).phase)) (_a2 = reposeTracker == null ? void 0 : reposeTracker.cancel) == null ? void 0 : _a2.call(reposeTracker);
        else closeRepose();
      }
    });
  }
  var node_58 = sibling(node_57, 2);
  ConfirmModal(node_58, {
    get open() {
      return get(confirmDeleteOpen);
    },
    title: "Delete image",
    message: "Permanently delete this image? This removes the file from disk and can't be undone.",
    confirmLabel: "Delete",
    onConfirm: handleDelete,
    onCancel: cancelDelete
  });
  var node_59 = sibling(node_58, 2);
  {
    var consequent_53 = ($$anchor2) => {
      {
        let $0 = user_derived(() => !!onEditSave());
        let $1 = user_derived(() => !!onDelete());
        let $2 = user_derived(() => {
          var _a2;
          return ((_a2 = get(lineageMenu).item) == null ? void 0 : _a2.orphaned) === 1;
        });
        LineageContextMenu($$anchor2, {
          get x() {
            return get(lineageMenu).x;
          },
          get y() {
            return get(lineageMenu).y;
          },
          get canEdit() {
            return get($0);
          },
          get canDelete() {
            return get($1);
          },
          get isLocal() {
            return isLocalClient;
          },
          get isWindows() {
            return isWindows;
          },
          get orphaned() {
            return get($2);
          },
          onAction: (action2) => lineageMenuAction(action2, get(lineageMenu).item),
          onClose: () => {
            set(lineageMenu, null);
          }
        });
      }
    };
    if_block(node_59, ($$render) => {
      if (get(lineageMenu)) $$render(consequent_53);
    });
  }
  template_effect(() => {
    set_style(div, `transform: translateY(${get(viewerTransformY) ?? ""}px); opacity: ${get(viewerOpacity) ?? ""}`);
    set_style(div_17, `cursor: ${get(isPanning) ? "grabbing" : "grab"}`);
    set_text(text_15, `${get(currentIndex) + 1} / ${images().length ?? ""}`);
    set_text(text_16, get(zoomDisplayText));
    set_value(input_1, get(zoomSliderValue));
    classes_9 = set_class(div_62, 1, "pcr-viewer-toolbar-btn svelte-5cciiw", null, classes_9, { active: get(linkCopied) });
    set_text(text_24, get(linkCopied) ? "Copied!" : "Copy Link");
  });
  event("wheel", div_17, handleWheel);
  delegated("pointerdown", div_17, handlePointerDown);
  delegated("pointermove", div_17, handlePointerMove);
  delegated("pointerup", div_17, handlePointerUp);
  delegated("dblclick", div_17, handleDblClick);
  delegated("click", div_31, function(...$$args) {
    var _a2;
    (_a2 = onClose()) == null ? void 0 : _a2.apply(this, $$args);
  });
  delegated("click", div_45, () => {
    set(zoomDropdownOpen, !get(zoomDropdownOpen));
  });
  delegated("input", input_1, handleZoomSlider);
  delegated("click", div_62, copyLink);
  append($$anchor, fragment);
  pop();
}
delegate([
  "click",
  "contextmenu",
  "pointerdown",
  "pointermove",
  "pointerup",
  "dblclick",
  "change",
  "mousedown",
  "input"
]);
let viewerInstance = null;
let viewerContainer = null;
function openImageViewer(target, props) {
  var _a;
  closeImageViewer();
  (_a = document.activeElement) == null ? void 0 : _a.blur();
  viewerContainer = target;
  viewerInstance = mount(ImageViewer, { target, props });
  return () => closeImageViewer();
}
function closeImageViewer() {
  if (viewerInstance) {
    unmount(viewerInstance);
    viewerInstance = null;
  }
  if (viewerContainer) {
    viewerContainer.remove();
    viewerContainer = null;
  }
}
export {
  closeImageViewer,
  openImageViewer
};
//# sourceMappingURL=promptchain-viewer.js.map
