import { d as delegate, p as push, a as prop, w as each, z as index, g as get, f as sibling, i as if_block, k as append, l as pop, m as user_derived, n as child, h as set_class, j as delegated, A as from_html, t as template_effect, x as set_attribute, q as set_value, v as first_child, y as set_text, D as comment, s as state, c as proxy, u as user_effect, e as set, I as to_array, E as untrack, o as bind_this, G as set_checked, L as unmount, K as mount } from "./disclose-version-BjTnIIw0.js";
import { a as onMount, o as onDestroy } from "./index-client-m0VtlDjX.js";
import { a as action } from "./actions-Ckx5huYg.js";
import { a as bind_checked, b as bind_value } from "./input-Bjai8x-c.js";
import { b as buildInsertText } from "./tag-builder-utils-ng134QDV.js";
import { b as bind_select_value } from "./select-Dgaht2aI.js";
const MULTI_SELECT_GROUPS = ["props"];
const CUSTOMIZABLE_CLOTHING_GROUPS = [
  "legwear",
  "footwear",
  "lingerie",
  "underwear",
  "swimwear",
  "dresses",
  "handwear",
  "tops",
  "bottoms",
  "neckwear",
  "headwear",
  "accessories",
  "full_outfits"
];
var root_2$7 = from_html(`<div class="pcr-atb-mixer-search-wrap"><input class="pcr-atb-mixer-search" type="text"/> <button type="button" class="pcr-atb-mixer-close" aria-label="Close">&times;</button></div>`);
var root_3$8 = from_html(`<span class="pcr-atb-mixer-label"> </span> <span> </span>`, 1);
var root_6$5 = from_html(`<span class="pcr-atb-checkbox-icon"> </span>`);
var root_5$7 = from_html(`<div><!> </div>`);
var root_7$6 = from_html(`<div class="pcr-atb-mixer-empty">No matches</div>`);
var root_4$6 = from_html(`<div class="pcr-atb-mixer-dropdown"><div class="pcr-atb-mixer-option pcr-atb-mixer-none"> </div> <!> <!></div>`);
var root_1$8 = from_html(`<div><div class="pcr-atb-mixer-header"><!></div> <!></div>`);
var root_8$3 = from_html(`<div class="pcr-atb-mixer-group pcr-atb-adult-trigger"><div class="pcr-atb-mixer-header pcr-atb-adult-header"><span class="pcr-atb-mixer-label">Adult Actions</span> <span>Browse</span></div></div>`);
var root$8 = from_html(`<div class="pcr-atb-mixer-grid"><!> <!></div>`);
function MixerGrid($$anchor, $$props) {
  push($$props, true);
  let groups = prop($$props, "groups", 19, () => []), bucket = prop($$props, "bucket", 3, ""), selections = prop($$props, "selections", 19, () => ({}));
  prop($$props, "isNaturalMode", 3, false);
  let searchQuery = prop($$props, "searchQuery", 3, ""), openGroup = prop($$props, "openGroup", 3, null), onSetOpenGroup = prop($$props, "onSetOpenGroup", 3, () => {
  }), dropdownSearchQuery = prop($$props, "dropdownSearchQuery", 3, ""), onSetDropdownSearchQuery = prop($$props, "onSetDropdownSearchQuery", 3, () => {
  }), highlightedIndex = prop($$props, "highlightedIndex", 3, 0), onSetHighlightedIndex = prop($$props, "onSetHighlightedIndex", 3, () => {
  }), onSelect = prop($$props, "onSelect", 3, () => {
  }), onOpenNsfwModal = prop($$props, "onOpenNsfwModal", 3, null), onOpenClothingCustomizer = prop($$props, "onOpenClothingCustomizer", 3, null), onOpenFantasyCustomizer = prop($$props, "onOpenFantasyCustomizer", 3, null);
  function focusOnMount(node) {
    node.focus();
  }
  function highlightScroll(node, highlighted) {
    function check(h) {
      if (h) node.scrollIntoView({ block: "nearest" });
    }
    check(highlighted);
    return { update: check };
  }
  function filterOpenItems(items) {
    const q = (dropdownSearchQuery() || "").toLowerCase().replace(/[_\s]+/g, " ").trim();
    if (!q) return items;
    return items.filter((item) => {
      const d = (item.display || item.tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      const t = (item.tags || item.tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      return d.includes(q) || t.includes(q);
    });
  }
  function handleSearchKey(e, flatList, group) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onSetHighlightedIndex()(Math.min(Math.max(flatList.length - 1, 0), highlightedIndex() + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onSetHighlightedIndex()(Math.max(0, highlightedIndex() - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const item = flatList[highlightedIndex()];
      if (item) handleOptionClick(e, group, item);
      return;
    }
  }
  let filteredGroups = user_derived(() => {
    const lowerQuery = (searchQuery() || "").toLowerCase();
    if (!lowerQuery) return groups();
    return groups().map((group) => {
      const filtered = group.items.filter((item) => {
        const normalizedDisplay = (item.display || item.tag).toLowerCase().replace(/[_\s]+/g, " ");
        const normalizedTag = (item.tags || "").toLowerCase().replace(/[_\s]+/g, " ");
        const normalizedQuery = lowerQuery.replace(/[_\s]+/g, " ");
        return normalizedDisplay.includes(normalizedQuery) || normalizedTag.includes(normalizedQuery);
      });
      return { ...group, items: filtered };
    }).filter((group) => group.items.length > 0);
  });
  function positionDropdown(dropdownNode) {
    function reposition() {
      if (!dropdownNode || !dropdownNode.isConnected) return;
      const groupEl = dropdownNode.closest(".pcr-atb-mixer-group");
      if (!groupEl) return;
      const header = groupEl.querySelector(".pcr-atb-mixer-header");
      if (!header) return;
      const isFixed = !!groupEl.closest(".pcr-atb-all-mixer-wrapper");
      if (!isFixed) {
        const headerRect2 = header.getBoundingClientRect();
        const isCharCategory2 = groupEl.classList.contains("pcr-atb-char-category");
        const maxDropdownHeight2 = isCharCategory2 ? 350 : 200;
        const dropdownHeight2 = Math.min(dropdownNode.scrollHeight || maxDropdownHeight2, maxDropdownHeight2);
        const viewportHeight2 = window.innerHeight;
        const spaceBelow2 = viewportHeight2 - headerRect2.bottom;
        const spaceAbove2 = headerRect2.top;
        if (spaceBelow2 < dropdownHeight2 && spaceAbove2 > spaceBelow2) {
          groupEl.classList.add("flip-up");
          dropdownNode.style.maxHeight = `${Math.min(spaceAbove2 - 10, maxDropdownHeight2)}px`;
        } else {
          groupEl.classList.remove("flip-up");
          dropdownNode.style.maxHeight = `${Math.min(spaceBelow2 - 10, maxDropdownHeight2)}px`;
        }
        return;
      }
      const headerRect = header.getBoundingClientRect();
      const isCharCategory = groupEl.classList.contains("pcr-atb-char-category");
      const maxDropdownHeight = isCharCategory ? 350 : 200;
      const dropdownHeight = Math.min(dropdownNode.scrollHeight || maxDropdownHeight, maxDropdownHeight);
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - headerRect.bottom;
      const spaceAbove = headerRect.top;
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        groupEl.classList.add("flip-up");
        dropdownNode.style.left = `${headerRect.left}px`;
        dropdownNode.style.width = `${headerRect.width}px`;
        dropdownNode.style.bottom = `${viewportHeight - headerRect.top}px`;
        dropdownNode.style.top = "auto";
        dropdownNode.style.maxHeight = `${Math.min(spaceAbove - 10, maxDropdownHeight)}px`;
      } else {
        groupEl.classList.remove("flip-up");
        dropdownNode.style.left = `${headerRect.left}px`;
        dropdownNode.style.width = `${headerRect.width}px`;
        dropdownNode.style.top = `${headerRect.bottom}px`;
        dropdownNode.style.bottom = "auto";
        dropdownNode.style.maxHeight = `${Math.min(spaceBelow - 10, maxDropdownHeight)}px`;
      }
    }
    reposition();
    const scrollContainer = dropdownNode.closest(".pcr-atb-content");
    if (scrollContainer) scrollContainer.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);
    return {
      update: reposition,
      destroy() {
        if (scrollContainer) scrollContainer.removeEventListener("scroll", reposition);
        window.removeEventListener("resize", reposition);
      }
    };
  }
  function isMultiSelect(groupName) {
    return MULTI_SELECT_GROUPS.includes(groupName.toLowerCase());
  }
  function getSelectedItems(groupName) {
    const sel = selections()[groupName];
    if (!sel) return [];
    return Array.isArray(sel) ? sel : [sel];
  }
  function getSelectedTags(groupName) {
    return new Set(getSelectedItems(groupName).map((s) => s.tag));
  }
  function getDisplayValue(groupName) {
    const items = getSelectedItems(groupName);
    if (items.length === 0) return "Select";
    if (items.length === 1) return items[0].display;
    return `${items.length} selected`;
  }
  function hasValue(groupName) {
    return getSelectedItems(groupName).length > 0;
  }
  function toggleGroup(groupName) {
    onSetOpenGroup()(openGroup() === groupName ? null : groupName);
  }
  function handleOptionClick(e, group, item) {
    e.stopPropagation();
    const groupName = group.name;
    if (bucket() === "clothing" && CUSTOMIZABLE_CLOTHING_GROUPS.includes(groupName.toLowerCase()) && item) {
      onSetOpenGroup()(null);
      if (onOpenClothingCustomizer()) {
        onOpenClothingCustomizer()({
          tag: item.tag,
          display: item.display || item.tag,
          tags: item.tags,
          natlang: item.natlang,
          group: groupName.toLowerCase()
        });
      }
      return;
    }
    if (bucket() === "appearance" && groupName.toLowerCase() === "fantasy" && item) {
      onSetOpenGroup()(null);
      if (onOpenFantasyCustomizer()) {
        onOpenFantasyCustomizer()({
          tag: item.tag,
          display: item.display || item.tag,
          tags: item.tags,
          natlang: item.natlang
        });
      }
      return;
    }
    if (isMultiSelect(groupName)) {
      onSelect()(bucket(), groupName, item, "toggle");
    } else {
      onSelect()(bucket(), groupName, item, "single");
      if (item) onSetOpenGroup()(null);
    }
  }
  function handleClearGroup(e, group) {
    e.stopPropagation();
    onSelect()(bucket(), group.name, null, "clear");
    if (!isMultiSelect(group.name)) {
      onSetOpenGroup()(null);
    }
  }
  function handleAdultClick(e) {
    e.stopPropagation();
    onSetOpenGroup()(null);
    if (onOpenNsfwModal()) onOpenNsfwModal()();
  }
  var div = root$8();
  var node_1 = child(div);
  each(node_1, 17, () => get(filteredGroups), index, ($$anchor2, group) => {
    const multi = user_derived(() => isMultiSelect(get(group).name));
    const selectedTags = user_derived(() => getSelectedTags(get(group).name));
    const isOpen = user_derived(() => openGroup() === get(group).name);
    const visibleItems = user_derived(() => get(isOpen) ? filterOpenItems(get(group).items) : []);
    var div_1 = root_1$8();
    let classes;
    var div_2 = child(div_1);
    var node_2 = child(div_2);
    {
      var consequent = ($$anchor3) => {
        var div_3 = root_2$7();
        var input = child(div_3);
        action(input, ($$node) => focusOnMount == null ? void 0 : focusOnMount($$node));
        var button = sibling(input, 2);
        template_effect(() => {
          set_attribute(input, "placeholder", `Search ${(get(group).display || get(group).name) ?? ""}…`);
          set_value(input, dropdownSearchQuery());
        });
        delegated("input", input, (e) => onSetDropdownSearchQuery()(e.target.value));
        delegated("click", input, (e) => e.stopPropagation());
        delegated("keydown", input, (e) => handleSearchKey(e, get(visibleItems), get(group)));
        delegated("click", button, (e) => {
          e.stopPropagation();
          onSetOpenGroup()(null);
        });
        append($$anchor3, div_3);
      };
      var alternate = ($$anchor3) => {
        var fragment = root_3$8();
        var span = first_child(fragment);
        var text = child(span);
        var span_1 = sibling(span, 2);
        let classes_1;
        var text_1 = child(span_1);
        template_effect(
          ($0, $1) => {
            set_text(text, get(group).display || get(group).name);
            classes_1 = set_class(span_1, 1, "pcr-atb-mixer-value", null, classes_1, $0);
            set_text(text_1, $1);
          },
          [
            () => ({ "has-value": hasValue(get(group).name) }),
            () => getDisplayValue(get(group).name)
          ]
        );
        append($$anchor3, fragment);
      };
      if_block(node_2, ($$render) => {
        if (get(isOpen)) $$render(consequent);
        else $$render(alternate, -1);
      });
    }
    var node_3 = sibling(div_2, 2);
    {
      var consequent_3 = ($$anchor3) => {
        var div_4 = root_4$6();
        var div_5 = child(div_4);
        var text_2 = child(div_5);
        var node_4 = sibling(div_5, 2);
        each(node_4, 17, () => get(visibleItems), index, ($$anchor4, item, idx) => {
          const isHighlighted = user_derived(() => idx === highlightedIndex());
          var div_6 = root_5$7();
          let classes_2;
          var node_5 = child(div_6);
          {
            var consequent_1 = ($$anchor5) => {
              var span_2 = root_6$5();
              var text_3 = child(span_2);
              template_effect(($0) => set_text(text_3, $0), [
                () => get(selectedTags).has(get(item).tag) ? "☑" : "☐"
              ]);
              append($$anchor5, span_2);
            };
            if_block(node_5, ($$render) => {
              if (get(multi)) $$render(consequent_1);
            });
          }
          var text_4 = sibling(node_5);
          action(div_6, ($$node, $$action_arg) => highlightScroll == null ? void 0 : highlightScroll($$node, $$action_arg), () => get(isHighlighted));
          template_effect(
            ($0) => {
              classes_2 = set_class(div_6, 1, "pcr-atb-mixer-option", null, classes_2, $0);
              set_text(text_4, ` ${(get(item).display || get(item).tag) ?? ""}`);
            },
            [
              () => ({
                selected: get(selectedTags).has(get(item).tag),
                highlighted: get(isHighlighted)
              })
            ]
          );
          delegated("click", div_6, (e) => handleOptionClick(e, get(group), get(item)));
          append($$anchor4, div_6);
        });
        var node_6 = sibling(node_4, 2);
        {
          var consequent_2 = ($$anchor4) => {
            var div_7 = root_7$6();
            append($$anchor4, div_7);
          };
          if_block(node_6, ($$render) => {
            if (get(visibleItems).length === 0) $$render(consequent_2);
          });
        }
        action(div_4, ($$node) => positionDropdown == null ? void 0 : positionDropdown($$node));
        template_effect(() => set_text(text_2, `-- ${get(multi) ? "Clear All" : "None"} --`));
        delegated("click", div_5, (e) => handleClearGroup(e, get(group)));
        append($$anchor3, div_4);
      };
      if_block(node_3, ($$render) => {
        if (get(isOpen)) $$render(consequent_3);
      });
    }
    template_effect(() => {
      classes = set_class(div_1, 1, "pcr-atb-mixer-group", null, classes, { open: get(isOpen), "multi-select": get(multi) });
      set_attribute(div_1, "data-group", get(group).name);
    });
    delegated("click", div_2, function(...$$args) {
      var _a;
      (_a = get(isOpen) ? null : (e) => {
        e.stopPropagation();
        toggleGroup(get(group).name);
      }) == null ? void 0 : _a.apply(this, $$args);
    });
    append($$anchor2, div_1);
  });
  var node_7 = sibling(node_1, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var div_8 = root_8$3();
      var div_9 = child(div_8);
      var span_3 = sibling(child(div_9), 2);
      set_class(span_3, 1, "pcr-atb-mixer-value", null, {}, { "has-value": false });
      delegated("click", div_9, handleAdultClick);
      append($$anchor2, div_8);
    };
    if_block(node_7, ($$render) => {
      if (bucket() === "action" && onOpenNsfwModal()) $$render(consequent_4);
    });
  }
  append($$anchor, div);
  pop();
}
delegate(["click", "input", "keydown"]);
var root_1$7 = from_html(`<span class="pcr-atb-selection-empty">No selections</span>`);
var root_3$7 = from_html(`<div><span class="pcr-atb-bubble-type"> </span> <span class="pcr-atb-bubble-label"> </span> <span class="pcr-atb-bubble-remove">&times;</span></div>`);
var root$7 = from_html(`<div class="pcr-atb-selection"><!></div>`);
function SelectionPreview($$anchor, $$props) {
  push($$props, true);
  const BUCKET_LABELS = {
    cast: "Cast",
    characters: "Char",
    appearance: "App",
    clothing: "Clothes",
    pose: "Pose",
    scene: "Scene",
    expression: "Expr",
    action: "Action",
    nsfw_action: "NSFW"
  };
  let onRemove = prop($$props, "onRemove", 3, () => {
  }), onEdit = prop($$props, "onEdit", 3, () => {
  });
  let bubbles = user_derived(() => {
    const result = [];
    const characters = $$props.selections.characters || [];
    characters.forEach((char, charIdx) => {
      if (char.base) {
        result.push({
          type: "character",
          cssClass: "character",
          label: char.display,
          removeInfo: { bucket: "characters", index: charIdx, type: "character" }
        });
      }
      if (char.outfit) {
        result.push({
          type: "outfit",
          cssClass: "sub-item",
          label: char.outfit.display,
          removeInfo: { bucket: "characters", index: charIdx, type: "outfit" }
        });
      }
      if (char.pose) {
        result.push({
          type: "pose",
          cssClass: "sub-item",
          label: char.pose.display,
          removeInfo: { bucket: "characters", index: charIdx, type: "pose" }
        });
      }
    });
    const props = $$props.selections.props || [];
    props.forEach((prop2, propIdx) => {
      if (prop2.display) {
        result.push({
          type: "Prop",
          cssClass: "props",
          label: prop2.display,
          removeInfo: { bucket: "props", index: propIdx, type: "prop" }
        });
      }
    });
    for (const bucket of [
      "cast",
      "appearance",
      "clothing",
      "pose",
      "scene",
      "expression",
      "action",
      "nsfw_action"
    ]) {
      const bucketSel = $$props.selections[bucket];
      if (!bucketSel) continue;
      for (const groupName in bucketSel) {
        const sel = bucketSel[groupName];
        const items = Array.isArray(sel) ? sel : [sel];
        for (const item of items) {
          if (item.display) {
            result.push({
              type: BUCKET_LABELS[bucket] || bucket,
              cssClass: "",
              label: item.display,
              removeInfo: { bucket, groupName, tag: item.tag, type: "mixer" }
            });
          }
        }
      }
    }
    return result;
  });
  var div = root$7();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var span = root_1$7();
      append($$anchor2, span);
    };
    var alternate = ($$anchor2) => {
      var fragment = comment();
      var node_1 = first_child(fragment);
      each(node_1, 17, () => get(bubbles), index, ($$anchor3, bubble) => {
        const editable = user_derived(() => get(bubble).removeInfo.bucket === "characters");
        var div_1 = root_3$7();
        let classes;
        var span_1 = child(div_1);
        var text = child(span_1);
        var span_2 = sibling(span_1, 2);
        var text_1 = child(span_2);
        var span_3 = sibling(span_2, 2);
        template_effect(() => {
          classes = set_class(div_1, 1, `pcr-atb-bubble ${get(bubble).cssClass ?? ""}`, null, classes, { editable: get(editable) });
          set_text(text, get(bubble).type);
          set_attribute(span_2, "title", get(bubble).label);
          set_text(text_1, get(bubble).label);
        });
        delegated("click", div_1, function(...$$args) {
          var _a;
          (_a = get(editable) ? () => onEdit()(get(bubble).removeInfo) : null) == null ? void 0 : _a.apply(this, $$args);
        });
        delegated("click", span_3, (e) => {
          e.stopPropagation();
          onRemove()(get(bubble).removeInfo);
        });
        append($$anchor3, div_1);
      });
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(bubbles).length === 0) $$render(consequent);
      else $$render(alternate, -1);
    });
  }
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_1$6 = from_html(`<div class="pcr-atb-customizer-modal"><div class="pcr-atb-loading">Loading character...</div></div>`);
var root_3$6 = from_html(`<span class="pcr-atb-char-modal-series"> </span>`);
var root_5$6 = from_html(`<option> </option>`);
var root_4$5 = from_html(`<div class="pcr-atb-customizer-row"><label>Outfit:</label> <select class="pcr-atb-customizer-select"><option>-- None --</option><!></select></div>`);
var root_7$5 = from_html(`<option> </option>`);
var root_6$4 = from_html(`<div class="pcr-atb-customizer-row"><label>Pose:</label> <select class="pcr-atb-customizer-select"><option>-- None --</option><!></select></div>`);
var root_2$6 = from_html(`<div class="pcr-atb-customizer-modal pcr-atb-char-modal"><div class="pcr-atb-customizer-header"><span class="pcr-atb-customizer-title"> </span> <!> <button class="pcr-atb-customizer-close">&times;</button></div> <div class="pcr-atb-customizer-body"><div class="pcr-atb-customizer-row"><label class="pcr-atb-checkbox"><input type="checkbox"/> <span>Base appearance</span></label></div> <!> <!></div> <div class="pcr-atb-customizer-footer"><button class="pcr-atb-customizer-btn pcr-atb-customizer-cancel">Cancel</button> <button class="pcr-atb-customizer-btn pcr-atb-customizer-ok"> </button></div></div>`);
var root$6 = from_html(`<div class="pcr-atb-customizer-overlay"><!></div>`);
function CharacterModal($$anchor, $$props) {
  push($$props, true);
  let existing = prop($$props, "existing", 3, null), cache = prop($$props, "cache", 23, () => ({})), onConfirm = prop($$props, "onConfirm", 3, () => {
  }), onCancel = prop($$props, "onCancel", 3, () => {
  });
  let loading = state(true);
  let char = state(null);
  let includeBase = state(proxy(existing() ? !!existing().base : true));
  let outfitIndex = state(proxy(existing() && existing().outfitIndex != null ? existing().outfitIndex : ""));
  let poseIndex = state(proxy(existing() && existing().poseIndex != null ? existing().poseIndex : ""));
  user_effect(() => {
    loadCharacter($$props.characterTag);
  });
  async function loadCharacter(tag) {
    const cacheKey = `char:${tag}`;
    if (cache()[cacheKey]) {
      set(char, cache()[cacheKey], true);
      set(loading, false);
      return;
    }
    try {
      const response = await fetch(`/promptchain/tag-builder/characters/${encodeURIComponent(tag)}`);
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      cache()[cacheKey] = data;
      set(char, data, true);
    } catch (e) {
      console.error("[TagBuilder] Failed to load character:", e);
      onCancel()();
      return;
    }
    set(loading, false);
  }
  function handleConfirm() {
    var _a, _b;
    if (!get(char)) return;
    const outIdx = get(outfitIndex) !== "" ? parseInt(get(outfitIndex)) : null;
    const posIdx = get(poseIndex) !== "" ? parseInt(get(poseIndex)) : null;
    const outfit = outIdx !== null && ((_a = get(char).outfits) == null ? void 0 : _a[outIdx]) ? {
      tags: get(char).outfits[outIdx].outfit_tags || "",
      natlang: get(char).outfits[outIdx].outfit_natlang || "",
      display: get(char).outfits[outIdx].outfit_name + (get(char).outfits[outIdx].is_default ? " (default)" : ""),
      overridesTags: get(char).outfits[outIdx].overrides_tags || "",
      overridesNatlang: get(char).outfits[outIdx].overrides_natlang || "",
      slots: get(char).outfits[outIdx].slots || []
    } : null;
    const pose = posIdx !== null && ((_b = get(char).poses) == null ? void 0 : _b[posIdx]) ? {
      tags: get(char).poses[posIdx].pose_tags || "",
      natlang: get(char).poses[posIdx].pose_natlang || "",
      display: get(char).poses[posIdx].pose_name + (get(char).poses[posIdx].is_signature ? " (signature)" : "")
    } : null;
    onConfirm()({
      tag: get(char).tag,
      display: get(char).display || get(char).tag,
      base: get(includeBase),
      baseTags: get(char).base_tags || "",
      baseNatlang: get(char).base_natlang || "",
      outfitIndex: outIdx,
      outfit,
      poseIndex: posIdx,
      pose
    });
  }
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel()();
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel()();
    } else if (e.key === "Enter") {
      e.stopPropagation();
      handleConfirm();
    }
  }
  function focusOnMount(node) {
    node.focus();
  }
  var div = root$6();
  var node_1 = child(div);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1$6();
      append($$anchor2, div_1);
    };
    var consequent_4 = ($$anchor2) => {
      var div_2 = root_2$6();
      var div_3 = child(div_2);
      var span = child(div_3);
      var text = child(span);
      var node_2 = sibling(span, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var span_1 = root_3$6();
          var text_1 = child(span_1);
          template_effect(() => set_text(text_1, get(char).series));
          append($$anchor3, span_1);
        };
        if_block(node_2, ($$render) => {
          if (get(char).series) $$render(consequent_1);
        });
      }
      var button = sibling(node_2, 2);
      var div_4 = sibling(div_3, 2);
      var div_5 = child(div_4);
      var label = child(div_5);
      var input = child(label);
      var node_3 = sibling(div_5, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_6 = root_4$5();
          var select = sibling(child(div_6), 2);
          var option = child(select);
          option.value = option.__value = "";
          var node_4 = sibling(option);
          each(node_4, 17, () => get(char).outfits, index, ($$anchor4, outfit, i) => {
            var option_1 = root_5$6();
            var text_2 = child(option_1);
            option_1.value = option_1.__value = i;
            template_effect(() => set_text(text_2, `${get(outfit).outfit_name ?? ""}${get(outfit).is_default ? " (default)" : ""}`));
            append($$anchor4, option_1);
          });
          bind_select_value(select, () => get(outfitIndex), ($$value) => set(outfitIndex, $$value));
          append($$anchor3, div_6);
        };
        if_block(node_3, ($$render) => {
          var _a;
          if ((_a = get(char).outfits) == null ? void 0 : _a.length) $$render(consequent_2);
        });
      }
      var node_5 = sibling(node_3, 2);
      {
        var consequent_3 = ($$anchor3) => {
          var div_7 = root_6$4();
          var select_1 = sibling(child(div_7), 2);
          var option_2 = child(select_1);
          option_2.value = option_2.__value = "";
          var node_6 = sibling(option_2);
          each(node_6, 17, () => get(char).poses, index, ($$anchor4, pose, i) => {
            var option_3 = root_7$5();
            var text_3 = child(option_3);
            option_3.value = option_3.__value = i;
            template_effect(() => set_text(text_3, `${get(pose).pose_name ?? ""}${get(pose).is_signature ? " (signature)" : ""}`));
            append($$anchor4, option_3);
          });
          bind_select_value(select_1, () => get(poseIndex), ($$value) => set(poseIndex, $$value));
          append($$anchor3, div_7);
        };
        if_block(node_5, ($$render) => {
          var _a;
          if ((_a = get(char).poses) == null ? void 0 : _a.length) $$render(consequent_3);
        });
      }
      var div_8 = sibling(div_4, 2);
      var button_1 = child(div_8);
      var button_2 = sibling(button_1, 2);
      var text_4 = child(button_2);
      action(button_2, ($$node) => focusOnMount == null ? void 0 : focusOnMount($$node));
      template_effect(() => {
        set_text(text, get(char).display || get(char).tag);
        set_text(text_4, existing() ? "Update Character" : "Add Character");
      });
      delegated("click", button, function(...$$args) {
        var _a;
        (_a = onCancel()) == null ? void 0 : _a.apply(this, $$args);
      });
      bind_checked(input, () => get(includeBase), ($$value) => set(includeBase, $$value));
      delegated("click", button_1, function(...$$args) {
        var _a;
        (_a = onCancel()) == null ? void 0 : _a.apply(this, $$args);
      });
      delegated("click", button_2, handleConfirm);
      append($$anchor2, div_2);
    };
    if_block(node_1, ($$render) => {
      if (get(loading)) $$render(consequent);
      else if (get(char)) $$render(consequent_4, 1);
    });
  }
  delegated("click", div, handleOverlayClick);
  delegated("keydown", div, handleKeydown);
  append($$anchor, div);
  pop();
}
delegate(["click", "keydown"]);
var root_1$5 = from_html(`<option> </option>`);
var root_3$5 = from_html(`<option> </option>`);
var root_4$4 = from_html(`<option> </option>`);
var root_6$3 = from_html(`<option> </option>`);
var root_5$5 = from_html(`<optgroup></optgroup>`);
var root_2$5 = from_html(`<div class="pcr-atb-customizer-furniture-opts" style="display: flex; flex-direction: column;"><div class="pcr-atb-customizer-row"><label>Material:</label> <select class="pcr-atb-customizer-select"><option>-- None --</option><!></select></div> <div class="pcr-atb-customizer-row"><label>Pattern:</label> <select class="pcr-atb-customizer-select"><option>-- Solid --</option><!></select></div> <div class="pcr-atb-customizer-row"><label>Color:</label> <select class="pcr-atb-customizer-select"><option>-- None --</option><!></select></div></div>`);
var root_7$4 = from_html(`<option> </option>`);
var root$5 = from_html(`<div class="pcr-atb-customizer-overlay"><div class="pcr-atb-customizer-modal"><div class="pcr-atb-customizer-header"><span class="pcr-atb-customizer-title"> </span> <button class="pcr-atb-customizer-close">&times;</button></div> <div class="pcr-atb-customizer-body"><div class="pcr-atb-customizer-row"><label>Item:</label> <select class="pcr-atb-customizer-select"><option>-- Select item --</option><!></select></div> <!> <div class="pcr-atb-customizer-row"><label>Action:</label> <select class="pcr-atb-customizer-select"><option>-- No action --</option><!></select></div> <div class="pcr-atb-customizer-preview"><div class="pcr-atb-customizer-preview-label">Preview:</div> <div class="pcr-atb-customizer-preview-text"> </div></div></div> <div class="pcr-atb-customizer-footer"><button class="pcr-atb-customizer-btn pcr-atb-customizer-cancel">Cancel</button> <button class="pcr-atb-customizer-btn pcr-atb-customizer-ok">Add Prop</button></div></div></div>`);
function PropsCustomizerModal($$anchor, $$props) {
  push($$props, true);
  let preSelectedProp = prop($$props, "preSelectedProp", 3, null), isNaturalMode = prop($$props, "isNaturalMode", 3, false), onConfirm = prop($$props, "onConfirm", 3, () => {
  }), onCancel = prop($$props, "onCancel", 3, () => {
  });
  let selectedProp = state(proxy(preSelectedProp() || ""));
  let selectedMaterial = state("");
  let selectedPattern = state("");
  let selectedColor = state("");
  let selectedAction = state("");
  let previewText = state("Select an item");
  let catMeta = user_derived(() => {
    var _a;
    return (_a = $$props.propsData.categories) == null ? void 0 : _a.find((c) => c.category === $$props.category);
  });
  let categoryProps = user_derived(() => ($$props.propsData.props || []).filter((p) => p.category === $$props.category));
  let isCustomizable = user_derived(() => {
    if (!get(selectedProp)) return false;
    const prop2 = get(categoryProps).find((p) => p.prop_tag === get(selectedProp));
    return (prop2 == null ? void 0 : prop2.is_customizable) || false;
  });
  let availableActions = user_derived(() => {
    const overrides = $$props.propsData.action_overrides || {};
    const propOverrides = get(selectedProp) ? overrides[get(selectedProp)] : null;
    if (propOverrides && propOverrides.length > 0) {
      return propOverrides.map((actionTag) => {
        var _a;
        return (_a = $$props.propsData.actions) == null ? void 0 : _a.find((a) => a.action_tag === actionTag);
      }).filter(Boolean);
    }
    return ($$props.propsData.actions || []).filter((a) => {
      const compatible = a.compatible_categories;
      return Array.isArray(compatible) && compatible.includes($$props.category);
    });
  });
  let materials = user_derived(() => $$props.propsData.materials || []);
  let patterns = user_derived(() => ($$props.propsData.patterns || []).filter((p) => p.tag !== "solid"));
  let colorGroups = user_derived(() => {
    const groups = {};
    for (const c of $$props.propsData.colors || []) {
      if (!groups[c.color_group]) groups[c.color_group] = [];
      groups[c.color_group].push(c);
    }
    return Object.entries(groups);
  });
  let patternEnabled = user_derived(() => {
    if (!get(selectedMaterial)) return false;
    const mat = get(materials).find((m) => m.tag === get(selectedMaterial));
    return (mat == null ? void 0 : mat.supports_patterns) === 1 || (mat == null ? void 0 : mat.supports_patterns) === true;
  });
  user_effect(() => {
    get(selectedProp);
    get(selectedMaterial);
    get(selectedPattern);
    get(selectedColor);
    get(selectedAction);
    get(isCustomizable);
    isNaturalMode();
    updatePreview();
  });
  user_effect(() => {
    get(selectedProp);
    if (!get(isCustomizable)) {
      set(selectedMaterial, "");
      set(selectedPattern, "");
      set(selectedColor, "");
    }
    updateActionDropdown();
  });
  user_effect(() => {
    if (!get(patternEnabled)) {
      set(selectedPattern, "");
    }
  });
  function updateActionDropdown() {
    if (get(selectedAction) && !get(availableActions).find((a) => a.action_tag === get(selectedAction))) {
      set(selectedAction, "");
    }
  }
  async function updatePreview() {
    if (!get(selectedProp)) {
      set(previewText, "Select an item");
      return;
    }
    const body = { prop: get(selectedProp) };
    if (get(isCustomizable)) {
      if (get(selectedMaterial)) body.material = get(selectedMaterial);
      if (get(selectedPattern)) body.pattern = get(selectedPattern);
      if (get(selectedColor)) body.color = get(selectedColor);
    }
    if (get(selectedAction)) body.action = get(selectedAction);
    try {
      const resp = await fetch("/promptchain/props/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (resp.ok) {
        const result = await resp.json();
        set(previewText, isNaturalMode() ? result.natlang : result.tags, true);
      }
    } catch (e) {
      console.error("[Props] Preview error:", e);
    }
  }
  let canConfirm = user_derived(() => !!get(selectedProp));
  async function handleConfirm() {
    if (!get(selectedProp)) return;
    const body = { prop: get(selectedProp) };
    if (get(isCustomizable)) {
      if (get(selectedMaterial)) body.material = get(selectedMaterial);
      if (get(selectedPattern)) body.pattern = get(selectedPattern);
      if (get(selectedColor)) body.color = get(selectedColor);
    }
    if (get(selectedAction)) body.action = get(selectedAction);
    try {
      const resp = await fetch("/promptchain/props/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (resp.ok) {
        const result = await resp.json();
        const displayParts = [];
        if (result.parts.action) displayParts.push(result.parts.action.display_name);
        if (result.parts.color) displayParts.push(result.parts.color.display);
        if (result.parts.pattern) displayParts.push(result.parts.pattern.display);
        if (result.parts.material) displayParts.push(result.parts.material.display);
        displayParts.push(result.parts.prop.display_name);
        onConfirm()({
          prop: get(selectedProp),
          category: $$props.category,
          material: body.material || null,
          pattern: body.pattern || null,
          color: body.color || null,
          action: body.action || null,
          tags: result.tags,
          natlang: result.natlang,
          display: displayParts.join(" ")
        });
      }
    } catch (e) {
      console.error("[Props] Add error:", e);
    }
  }
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel()();
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel()();
    } else if (e.key === "Enter" && get(canConfirm)) {
      e.stopPropagation();
      handleConfirm();
    }
  }
  var div = root$5();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var span = child(div_2);
  var text = child(span);
  var button = sibling(span, 2);
  var div_3 = sibling(div_2, 2);
  var div_4 = child(div_3);
  var select = sibling(child(div_4), 2);
  var option = child(select);
  option.value = option.__value = "";
  var node = sibling(option);
  each(node, 17, () => get(categoryProps), index, ($$anchor2, p) => {
    var option_1 = root_1$5();
    var text_1 = child(option_1);
    var option_1_value = {};
    template_effect(() => {
      set_text(text_1, `${get(p).display_name ?? ""}${get(p).is_customizable ? " ★" : ""}`);
      if (option_1_value !== (option_1_value = get(p).prop_tag)) {
        option_1.value = (option_1.__value = get(p).prop_tag) ?? "";
      }
    });
    append($$anchor2, option_1);
  });
  var node_1 = sibling(div_4, 2);
  {
    var consequent = ($$anchor2) => {
      var div_5 = root_2$5();
      var div_6 = child(div_5);
      var select_1 = sibling(child(div_6), 2);
      var option_2 = child(select_1);
      option_2.value = option_2.__value = "";
      var node_2 = sibling(option_2);
      each(node_2, 17, () => get(materials), index, ($$anchor3, m) => {
        var option_3 = root_3$5();
        var text_2 = child(option_3);
        var option_3_value = {};
        template_effect(() => {
          set_text(text_2, get(m).display);
          if (option_3_value !== (option_3_value = get(m).tag)) {
            option_3.value = (option_3.__value = get(m).tag) ?? "";
          }
        });
        append($$anchor3, option_3);
      });
      var div_7 = sibling(div_6, 2);
      var select_2 = sibling(child(div_7), 2);
      var option_4 = child(select_2);
      option_4.value = option_4.__value = "";
      var node_3 = sibling(option_4);
      each(node_3, 17, () => get(patterns), index, ($$anchor3, p) => {
        var option_5 = root_4$4();
        var text_3 = child(option_5);
        var option_5_value = {};
        template_effect(() => {
          set_text(text_3, get(p).display);
          if (option_5_value !== (option_5_value = get(p).tag)) {
            option_5.value = (option_5.__value = get(p).tag) ?? "";
          }
        });
        append($$anchor3, option_5);
      });
      var div_8 = sibling(div_7, 2);
      var select_3 = sibling(child(div_8), 2);
      var option_6 = child(select_3);
      option_6.value = option_6.__value = "";
      var node_4 = sibling(option_6);
      each(node_4, 17, () => get(colorGroups), index, ($$anchor3, $$item) => {
        var $$array = user_derived(() => to_array(get($$item), 2));
        let group = () => get($$array)[0];
        let colors = () => get($$array)[1];
        var optgroup = root_5$5();
        each(optgroup, 21, colors, index, ($$anchor4, c) => {
          var option_7 = root_6$3();
          var text_4 = child(option_7);
          var option_7_value = {};
          template_effect(() => {
            set_text(text_4, get(c).display);
            if (option_7_value !== (option_7_value = get(c).tag)) {
              option_7.value = (option_7.__value = get(c).tag) ?? "";
            }
          });
          append($$anchor4, option_7);
        });
        template_effect(($0) => set_attribute(optgroup, "label", $0), [() => group().charAt(0).toUpperCase() + group().slice(1)]);
        append($$anchor3, optgroup);
      });
      template_effect(() => select_2.disabled = !get(patternEnabled));
      bind_select_value(select_1, () => get(selectedMaterial), ($$value) => set(selectedMaterial, $$value));
      bind_select_value(select_2, () => get(selectedPattern), ($$value) => set(selectedPattern, $$value));
      bind_select_value(select_3, () => get(selectedColor), ($$value) => set(selectedColor, $$value));
      append($$anchor2, div_5);
    };
    if_block(node_1, ($$render) => {
      if (get(isCustomizable)) $$render(consequent);
    });
  }
  var div_9 = sibling(node_1, 2);
  var select_4 = sibling(child(div_9), 2);
  var option_8 = child(select_4);
  option_8.value = option_8.__value = "";
  var node_5 = sibling(option_8);
  each(node_5, 17, () => get(availableActions), index, ($$anchor2, a) => {
    var option_9 = root_7$4();
    var text_5 = child(option_9);
    var option_9_value = {};
    template_effect(() => {
      set_text(text_5, get(a).display_name);
      if (option_9_value !== (option_9_value = get(a).action_tag)) {
        option_9.value = (option_9.__value = get(a).action_tag) ?? "";
      }
    });
    append($$anchor2, option_9);
  });
  var div_10 = sibling(div_9, 2);
  var div_11 = sibling(child(div_10), 2);
  var text_6 = child(div_11);
  var div_12 = sibling(div_3, 2);
  var button_1 = child(div_12);
  var button_2 = sibling(button_1, 2);
  template_effect(() => {
    var _a, _b;
    set_text(text, `${(((_a = get(catMeta)) == null ? void 0 : _a.icon) || "") ?? ""} ${(((_b = get(catMeta)) == null ? void 0 : _b.display_name) || $$props.category) ?? ""}`);
    set_text(text_6, get(previewText));
    button_2.disabled = !get(canConfirm);
  });
  delegated("click", div, handleOverlayClick);
  delegated("keydown", div, handleKeydown);
  delegated("click", button, function(...$$args) {
    var _a;
    (_a = onCancel()) == null ? void 0 : _a.apply(this, $$args);
  });
  bind_select_value(select, () => get(selectedProp), ($$value) => set(selectedProp, $$value));
  bind_select_value(select_4, () => get(selectedAction), ($$value) => set(selectedAction, $$value));
  delegated("click", button_1, function(...$$args) {
    var _a;
    (_a = onCancel()) == null ? void 0 : _a.apply(this, $$args);
  });
  delegated("click", button_2, handleConfirm);
  append($$anchor, div);
  pop();
}
delegate(["click", "keydown"]);
var root_2$4 = from_html(`<span class="pcr-atb-nsfw-tab-dot">&#9679;</span>`);
var root_1$4 = from_html(`<div> <!></div>`);
var root_4$3 = from_html(`<div> </div>`);
var root_3$4 = from_html(`<div><div class="pcr-atb-nsfw-clear">-- Clear Selection --</div> <!></div>`);
var root_5$4 = from_html(`<span class="pcr-atb-nsfw-preview-none">None</span>`);
var root_7$3 = from_html(`<span class="pcr-atb-nsfw-preview-pill"> </span>`);
var root$4 = from_html(`<div class="pcr-atb-customizer-overlay"><div class="pcr-atb-customizer-modal pcr-atb-nsfw-modal"><div class="pcr-atb-customizer-header"><span class="pcr-atb-customizer-title">Adult Actions</span> <button class="pcr-atb-customizer-close">&times;</button></div> <div class="pcr-atb-nsfw-tabs"></div> <div class="pcr-atb-nsfw-panels"></div> <div class="pcr-atb-nsfw-preview"><div class="pcr-atb-nsfw-preview-label">Selected:</div> <div class="pcr-atb-nsfw-preview-items"><!></div></div> <div class="pcr-atb-customizer-footer"><button class="pcr-atb-customizer-btn pcr-atb-customizer-cancel">Cancel</button> <button class="pcr-atb-customizer-btn pcr-atb-customizer-ok">Done</button></div></div></div>`);
function NsfwActionModal($$anchor, $$props) {
  var _a;
  push($$props, true);
  let groups = prop($$props, "groups", 19, () => []), currentSelections = prop($$props, "currentSelections", 19, () => ({})), onConfirm = prop($$props, "onConfirm", 3, () => {
  }), onCancel = prop($$props, "onCancel", 3, () => {
  });
  let activeGroup = state(proxy(((_a = groups()[0]) == null ? void 0 : _a.name) || ""));
  let pendingSelections = state(proxy((() => {
    try {
      return structuredClone(currentSelections());
    } catch (e) {
      console.error("[PromptChain] NsfwActionModal clone failed:", e);
      return {};
    }
  })()));
  let selectedPills = user_derived(() => Object.values(get(pendingSelections)).filter((s) => s == null ? void 0 : s.display));
  function switchGroup(groupName) {
    set(activeGroup, groupName, true);
  }
  function selectItem(groupName, item) {
    get(pendingSelections)[groupName] = {
      tag: item.tag,
      tags: item.tags,
      natlang: item.natlang,
      display: item.display
    };
    set(pendingSelections, { ...get(pendingSelections) }, true);
  }
  function clearGroup(groupName) {
    delete get(pendingSelections)[groupName];
    set(pendingSelections, { ...get(pendingSelections) }, true);
  }
  function hasGroupSelection(groupName) {
    return !!get(pendingSelections)[groupName];
  }
  function handleConfirm() {
    onConfirm()(get(pendingSelections));
  }
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel()();
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel()();
    } else if (e.key === "Enter") {
      e.stopPropagation();
      handleConfirm();
    }
  }
  var div = root$4();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var button = sibling(child(div_2), 2);
  var div_3 = sibling(div_2, 2);
  each(div_3, 21, groups, index, ($$anchor2, group) => {
    var div_4 = root_1$4();
    let classes;
    var text = child(div_4);
    var node = sibling(text);
    {
      var consequent = ($$anchor3) => {
        var span = root_2$4();
        append($$anchor3, span);
      };
      var d = user_derived(() => hasGroupSelection(get(group).name));
      if_block(node, ($$render) => {
        if (get(d)) $$render(consequent);
      });
    }
    template_effect(() => {
      classes = set_class(div_4, 1, "pcr-atb-nsfw-tab", null, classes, { active: get(activeGroup) === get(group).name });
      set_text(text, `${get(group).display ?? ""} `);
    });
    delegated("click", div_4, () => switchGroup(get(group).name));
    append($$anchor2, div_4);
  });
  var div_5 = sibling(div_3, 2);
  each(div_5, 21, groups, index, ($$anchor2, group) => {
    var div_6 = root_3$4();
    let classes_1;
    var div_7 = child(div_6);
    var node_1 = sibling(div_7, 2);
    each(node_1, 17, () => get(group).items, index, ($$anchor3, item) => {
      var div_8 = root_4$3();
      let classes_2;
      var text_1 = child(div_8);
      template_effect(() => {
        var _a2;
        classes_2 = set_class(div_8, 1, "pcr-atb-nsfw-item", null, classes_2, {
          selected: ((_a2 = get(pendingSelections)[get(group).name]) == null ? void 0 : _a2.tag) === get(item).tag
        });
        set_text(text_1, get(item).display);
      });
      delegated("click", div_8, () => selectItem(get(group).name, get(item)));
      append($$anchor3, div_8);
    });
    template_effect(() => classes_1 = set_class(div_6, 1, "pcr-atb-nsfw-panel", null, classes_1, { active: get(activeGroup) === get(group).name }));
    delegated("click", div_7, () => clearGroup(get(group).name));
    append($$anchor2, div_6);
  });
  var div_9 = sibling(div_5, 2);
  var div_10 = sibling(child(div_9), 2);
  var node_2 = child(div_10);
  {
    var consequent_1 = ($$anchor2) => {
      var span_1 = root_5$4();
      append($$anchor2, span_1);
    };
    var alternate = ($$anchor2) => {
      var fragment = comment();
      var node_3 = first_child(fragment);
      each(node_3, 17, () => get(selectedPills), index, ($$anchor3, pill) => {
        var span_2 = root_7$3();
        var text_2 = child(span_2);
        template_effect(() => set_text(text_2, get(pill).display));
        append($$anchor3, span_2);
      });
      append($$anchor2, fragment);
    };
    if_block(node_2, ($$render) => {
      if (get(selectedPills).length === 0) $$render(consequent_1);
      else $$render(alternate, -1);
    });
  }
  var div_11 = sibling(div_9, 2);
  var button_1 = child(div_11);
  var button_2 = sibling(button_1, 2);
  delegated("click", div, handleOverlayClick);
  delegated("keydown", div, handleKeydown);
  delegated("click", button, function(...$$args) {
    var _a2;
    (_a2 = onCancel()) == null ? void 0 : _a2.apply(this, $$args);
  });
  delegated("click", button_1, function(...$$args) {
    var _a2;
    (_a2 = onCancel()) == null ? void 0 : _a2.apply(this, $$args);
  });
  delegated("click", button_2, handleConfirm);
  append($$anchor, div);
  pop();
}
delegate(["click", "keydown"]);
var root_1$3 = from_html(`<div class="pcr-atb-loading">Loading customizer...</div>`);
var root_4$2 = from_html(`<option> </option>`);
var root_3$3 = from_html(`<optgroup></optgroup>`);
var root_6$2 = from_html(`<option> </option>`);
var root_5$3 = from_html(`<optgroup></optgroup>`);
var root_7$2 = from_html(`<option> </option>`);
var root_9$1 = from_html(`<option> </option>`);
var root_8$2 = from_html(`<optgroup></optgroup>`);
var root_2$3 = from_html(`<div class="pcr-atb-customizer-body"><div class="pcr-atb-customizer-row"><label>Color:</label> <select class="pcr-atb-customizer-select"><option>-- None --</option><!></select></div> <div class="pcr-atb-customizer-row"><label>Pattern:</label> <select class="pcr-atb-customizer-select"></select></div> <div class="pcr-atb-customizer-row"><label>Material:</label> <select class="pcr-atb-customizer-select"><option>-- None --</option><!></select></div> <div class="pcr-atb-customizer-row"><label>Condition:</label> <select class="pcr-atb-customizer-select"></select></div> <div class="pcr-atb-customizer-row pcr-atb-customizer-focus-row"><label><input type="checkbox"/> Add focus tags</label> <span class="pcr-atb-customizer-focus-hint">Camera focuses on this item</span></div> <div class="pcr-atb-customizer-preview"><div class="pcr-atb-customizer-preview-label">Preview:</div> <div class="pcr-atb-customizer-preview-text"> </div></div></div> <div class="pcr-atb-customizer-footer"><button class="pcr-atb-customizer-btn pcr-atb-customizer-cancel">Cancel</button> <button class="pcr-atb-customizer-btn pcr-atb-customizer-ok">OK</button></div>`, 1);
var root$3 = from_html(`<div class="pcr-atb-customizer-overlay"><div class="pcr-atb-customizer-modal"><div class="pcr-atb-customizer-header"><span class="pcr-atb-customizer-title"> </span> <button class="pcr-atb-customizer-close">&times;</button></div> <!></div></div>`);
function ClothingCustomizer($$anchor, $$props) {
  push($$props, true);
  let onConfirm = prop($$props, "onConfirm", 3, () => {
  }), onCancel = prop($$props, "onCancel", 3, () => {
  });
  let loading = state(true);
  let customizerData = state(null);
  let selectedColor = state("");
  let selectedPattern = state("solid");
  let selectedMaterial = state("");
  let selectedCondition = state("default");
  let hasFocus = state(false);
  let sortedColorGroups = user_derived(() => {
    var _a;
    if (!((_a = get(customizerData)) == null ? void 0 : _a.colors)) return [];
    const groups = {};
    for (const c of get(customizerData).colors) {
      if (!groups[c.color_group]) groups[c.color_group] = [];
      groups[c.color_group].push(c);
    }
    for (const colors of Object.values(groups)) {
      colors.sort((a, b) => a.display.localeCompare(b.display));
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a.toLowerCase() === "neutral") return -1;
      if (b.toLowerCase() === "neutral") return 1;
      return a.localeCompare(b);
    });
  });
  let patternGroups = user_derived(() => {
    var _a;
    if (!((_a = get(customizerData)) == null ? void 0 : _a.patterns)) return {};
    const groups = {};
    for (const p of get(customizerData).patterns) {
      if (!groups[p.pattern_group]) groups[p.pattern_group] = [];
      groups[p.pattern_group].push(p);
    }
    return groups;
  });
  let conditionGroups = user_derived(() => {
    var _a;
    if (!((_a = get(customizerData)) == null ? void 0 : _a.conditions)) return {};
    const groups = {};
    for (const c of get(customizerData).conditions) {
      if (!groups[c.condition_group]) groups[c.condition_group] = [];
      groups[c.condition_group].push(c);
    }
    return groups;
  });
  let previewText = user_derived(() => {
    if (!get(customizerData)) return $$props.itemInfo.display.toLowerCase();
    return buildPhrase();
  });
  user_effect(() => {
    fetchCustomizerData($$props.itemInfo.group);
  });
  async function fetchCustomizerData(group) {
    try {
      const response = await fetch(`/promptchain/clothing/customizer-data?group=${encodeURIComponent(group)}`);
      if (!response.ok) throw new Error("Failed to fetch customizer data");
      set(customizerData, await response.json(), true);
    } catch (e) {
      console.error("[TagBuilder] Failed to load clothing customizer data:", e);
      onConfirm()({
        tag: $$props.itemInfo.tag,
        tags: $$props.itemInfo.tags || $$props.itemInfo.tag,
        natlang: $$props.itemInfo.natlang,
        display: $$props.itemInfo.display,
        isCustomized: false
      });
      return;
    }
    set(loading, false);
  }
  function getOptionPrefix(selectValue, options) {
    if (!selectValue || !options) return "";
    const opt = options.find((o) => o.tag === selectValue);
    return (opt == null ? void 0 : opt.prefix) || "";
  }
  function buildPhrase() {
    var _a, _b, _c, _d;
    const parts = [];
    const colorPrefix = getOptionPrefix(get(selectedColor), (_a = get(customizerData)) == null ? void 0 : _a.colors);
    if (colorPrefix) parts.push(colorPrefix);
    const patternPrefix = getOptionPrefix(get(selectedPattern), (_b = get(customizerData)) == null ? void 0 : _b.patterns);
    if (patternPrefix) parts.push(patternPrefix);
    const conditionPrefix = getOptionPrefix(get(selectedCondition), (_c = get(customizerData)) == null ? void 0 : _c.conditions);
    if (conditionPrefix) parts.push(conditionPrefix);
    const materialPrefix = getOptionPrefix(get(selectedMaterial), (_d = get(customizerData)) == null ? void 0 : _d.materials);
    if (materialPrefix) parts.push(materialPrefix);
    parts.push($$props.itemInfo.display.toLowerCase());
    const phrase = parts.join(" ");
    if (get(hasFocus)) {
      return `${phrase}, presenting ${phrase} to viewer, ${phrase} focus`;
    }
    return phrase;
  }
  function handleConfirm() {
    var _a, _b, _c, _d;
    const phrase = buildPhrase();
    const hasCustomization = get(hasFocus) || get(selectedColor) !== "" || get(selectedPattern) !== "" && get(selectedPattern) !== "solid" || get(selectedMaterial) !== "" || get(selectedCondition) !== "" && get(selectedCondition) !== "default";
    const displayParts = [];
    if (get(selectedCondition) && get(selectedCondition) !== "default" && ((_a = get(customizerData)) == null ? void 0 : _a.conditions)) {
      const c = get(customizerData).conditions.find((x) => x.tag === get(selectedCondition));
      if (c) displayParts.push(c.display);
    }
    if (get(selectedColor) && ((_b = get(customizerData)) == null ? void 0 : _b.colors)) {
      const c = get(customizerData).colors.find((x) => x.tag === get(selectedColor));
      if (c) displayParts.push(c.display);
    }
    if (get(selectedPattern) && get(selectedPattern) !== "solid" && ((_c = get(customizerData)) == null ? void 0 : _c.patterns)) {
      const p = get(customizerData).patterns.find((x) => x.tag === get(selectedPattern));
      if (p) displayParts.push(p.display);
    }
    if (get(selectedMaterial) && ((_d = get(customizerData)) == null ? void 0 : _d.materials)) {
      const m = get(customizerData).materials.find((x) => x.tag === get(selectedMaterial));
      if (m) displayParts.push(m.display);
    }
    displayParts.push($$props.itemInfo.display);
    if (get(hasFocus)) displayParts.push("(focus)");
    onConfirm()({
      tag: $$props.itemInfo.tag,
      tags: hasCustomization ? phrase : $$props.itemInfo.tags || phrase,
      natlang: hasCustomization ? phrase : $$props.itemInfo.natlang || phrase,
      display: displayParts.join(" "),
      isCustomized: hasCustomization
    });
  }
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel()();
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel()();
    } else if (e.key === "Enter") {
      e.stopPropagation();
      handleConfirm();
    }
  }
  var div = root$3();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var span = child(div_2);
  var text = child(span);
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
      var select = sibling(child(div_5), 2);
      var option = child(select);
      option.value = option.__value = "";
      var node_1 = sibling(option);
      each(node_1, 17, () => get(sortedColorGroups), index, ($$anchor3, $$item) => {
        var $$array = user_derived(() => to_array(get($$item), 2));
        let group = () => get($$array)[0];
        let colors = () => get($$array)[1];
        var optgroup = root_3$3();
        each(optgroup, 21, colors, index, ($$anchor4, c) => {
          var option_1 = root_4$2();
          var text_1 = child(option_1);
          var option_1_value = {};
          template_effect(() => {
            set_text(text_1, get(c).display);
            if (option_1_value !== (option_1_value = get(c).tag)) {
              option_1.value = (option_1.__value = get(c).tag) ?? "";
            }
          });
          append($$anchor4, option_1);
        });
        template_effect(($0) => set_attribute(optgroup, "label", $0), [() => group().charAt(0).toUpperCase() + group().slice(1)]);
        append($$anchor3, optgroup);
      });
      var div_6 = sibling(div_5, 2);
      var select_1 = sibling(child(div_6), 2);
      each(select_1, 21, () => Object.entries(get(patternGroups)), index, ($$anchor3, $$item) => {
        var $$array_1 = user_derived(() => to_array(get($$item), 2));
        let group = () => get($$array_1)[0];
        let patterns = () => get($$array_1)[1];
        var optgroup_1 = root_5$3();
        each(optgroup_1, 21, patterns, index, ($$anchor4, p) => {
          var option_2 = root_6$2();
          var text_2 = child(option_2);
          var option_2_value = {};
          template_effect(() => {
            set_text(text_2, get(p).display);
            if (option_2_value !== (option_2_value = get(p).tag)) {
              option_2.value = (option_2.__value = get(p).tag) ?? "";
            }
          });
          append($$anchor4, option_2);
        });
        template_effect(($0) => set_attribute(optgroup_1, "label", $0), [() => group().charAt(0).toUpperCase() + group().slice(1)]);
        append($$anchor3, optgroup_1);
      });
      var div_7 = sibling(div_6, 2);
      var select_2 = sibling(child(div_7), 2);
      var option_3 = child(select_2);
      option_3.value = option_3.__value = "";
      var node_2 = sibling(option_3);
      each(node_2, 17, () => {
        var _a;
        return ((_a = get(customizerData)) == null ? void 0 : _a.materials) || [];
      }, index, ($$anchor3, m) => {
        var option_4 = root_7$2();
        var text_3 = child(option_4);
        var option_4_value = {};
        template_effect(() => {
          set_text(text_3, get(m).display);
          if (option_4_value !== (option_4_value = get(m).tag)) {
            option_4.value = (option_4.__value = get(m).tag) ?? "";
          }
        });
        append($$anchor3, option_4);
      });
      var div_8 = sibling(div_7, 2);
      var select_3 = sibling(child(div_8), 2);
      each(select_3, 21, () => Object.entries(get(conditionGroups)), index, ($$anchor3, $$item) => {
        var $$array_2 = user_derived(() => to_array(get($$item), 2));
        let group = () => get($$array_2)[0];
        let conditions = () => get($$array_2)[1];
        var optgroup_2 = root_8$2();
        each(optgroup_2, 21, conditions, index, ($$anchor4, c) => {
          var option_5 = root_9$1();
          var text_4 = child(option_5);
          var option_5_value = {};
          template_effect(() => {
            set_text(text_4, get(c).display);
            if (option_5_value !== (option_5_value = get(c).tag)) {
              option_5.value = (option_5.__value = get(c).tag) ?? "";
            }
          });
          append($$anchor4, option_5);
        });
        template_effect(($0) => set_attribute(optgroup_2, "label", $0), [() => group().charAt(0).toUpperCase() + group().slice(1)]);
        append($$anchor3, optgroup_2);
      });
      var div_9 = sibling(div_8, 2);
      var label = child(div_9);
      var input = child(label);
      var div_10 = sibling(div_9, 2);
      var div_11 = sibling(child(div_10), 2);
      var text_5 = child(div_11);
      var div_12 = sibling(div_4, 2);
      var button_1 = child(div_12);
      var button_2 = sibling(button_1, 2);
      template_effect(() => {
        var _a, _b;
        select_2.disabled = !((_b = (_a = get(customizerData)) == null ? void 0 : _a.materials) == null ? void 0 : _b.length);
        set_text(text_5, get(previewText));
      });
      bind_select_value(select, () => get(selectedColor), ($$value) => set(selectedColor, $$value));
      bind_select_value(select_1, () => get(selectedPattern), ($$value) => set(selectedPattern, $$value));
      bind_select_value(select_2, () => get(selectedMaterial), ($$value) => set(selectedMaterial, $$value));
      bind_select_value(select_3, () => get(selectedCondition), ($$value) => set(selectedCondition, $$value));
      bind_checked(input, () => get(hasFocus), ($$value) => set(hasFocus, $$value));
      delegated("click", button_1, function(...$$args) {
        var _a;
        (_a = onCancel()) == null ? void 0 : _a.apply(this, $$args);
      });
      delegated("click", button_2, handleConfirm);
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(loading)) $$render(consequent);
      else $$render(alternate, -1);
    });
  }
  template_effect(() => set_text(text, `Customize: ${$$props.itemInfo.display ?? ""}`));
  delegated("click", div, handleOverlayClick);
  delegated("keydown", div, handleKeydown);
  delegated("click", button, function(...$$args) {
    var _a;
    (_a = onCancel()) == null ? void 0 : _a.apply(this, $$args);
  });
  append($$anchor, div);
  pop();
}
delegate(["click", "keydown"]);
var root_1$2 = from_html(`<div class="pcr-atb-loading">Loading customizer...</div>`);
var root_3$2 = from_html(`<option> </option>`);
var root_4$1 = from_html(`<option> </option>`);
var root_5$2 = from_html(`<option> </option>`);
var root_2$2 = from_html(`<div class="pcr-atb-customizer-body"><div class="pcr-atb-customizer-row"><label>Shape:</label> <select class="pcr-atb-customizer-select"><option>-- None --</option><!></select></div> <div class="pcr-atb-customizer-row"><label>Color:</label> <select class="pcr-atb-customizer-select"><option>-- None --</option><!></select></div> <div class="pcr-atb-customizer-row"><label>Type:</label> <select class="pcr-atb-customizer-select"><option>-- None --</option><!></select></div> <div class="pcr-atb-customizer-preview"><div class="pcr-atb-customizer-preview-label">Preview:</div> <div class="pcr-atb-customizer-preview-text"> </div></div></div> <div class="pcr-atb-customizer-footer"><button class="pcr-atb-customizer-btn pcr-atb-customizer-cancel">Cancel</button> <button class="pcr-atb-customizer-btn pcr-atb-customizer-ok">OK</button></div>`, 1);
var root$2 = from_html(`<div class="pcr-atb-customizer-overlay"><div class="pcr-atb-customizer-modal"><div class="pcr-atb-customizer-header"><span class="pcr-atb-customizer-title"> </span> <button class="pcr-atb-customizer-close">&times;</button></div> <!></div></div>`);
function FantasyCustomizer($$anchor, $$props) {
  push($$props, true);
  let onConfirm = prop($$props, "onConfirm", 3, () => {
  }), onCancel = prop($$props, "onCancel", 3, () => {
  });
  let loading = state(true);
  let customizerData = state(null);
  let selectedShape = state("");
  let selectedColor = state("");
  let selectedType = state("");
  let featureTag = user_derived(() => ($$props.itemInfo.tag || "").toLowerCase());
  let filteredShapes = user_derived(() => {
    var _a;
    return (((_a = get(customizerData)) == null ? void 0 : _a.shapes) || []).filter((s) => !get(featureTag).includes(s.tag.toLowerCase()));
  });
  let filteredColors = user_derived(() => {
    var _a;
    return (((_a = get(customizerData)) == null ? void 0 : _a.colors) || []).filter((c) => !get(featureTag).includes(c.tag.toLowerCase()));
  });
  let filteredTypes = user_derived(() => {
    var _a;
    return (((_a = get(customizerData)) == null ? void 0 : _a.types) || []).filter((t) => !get(featureTag).includes(t.tag.toLowerCase()));
  });
  let previewText = user_derived(() => {
    if (!get(customizerData)) return $$props.itemInfo.display.toLowerCase();
    const parts = [];
    if (get(selectedShape)) {
      const s = get(customizerData).shapes.find((x) => x.tag === get(selectedShape));
      if (s == null ? void 0 : s.base_tags) parts.push(s.base_tags);
    }
    if (get(selectedColor)) {
      const c = get(customizerData).colors.find((x) => x.tag === get(selectedColor));
      if (c == null ? void 0 : c.base_tags) parts.push(c.base_tags);
    }
    if (get(selectedType)) {
      const t = get(customizerData).types.find((x) => x.tag === get(selectedType));
      if (t == null ? void 0 : t.base_tags) parts.push(t.base_tags);
    }
    parts.push($$props.itemInfo.display.toLowerCase());
    return parts.join(" ");
  });
  user_effect(() => {
    fetchData();
  });
  async function fetchData() {
    try {
      const response = await fetch("/promptchain/fantasy/customizer-data");
      if (!response.ok) throw new Error("Failed to fetch fantasy customizer data");
      set(customizerData, await response.json(), true);
    } catch (e) {
      console.error("[TagBuilder] Failed to load fantasy customizer data:", e);
      onConfirm()({
        tag: $$props.itemInfo.tag,
        tags: $$props.itemInfo.tags || $$props.itemInfo.tag,
        natlang: $$props.itemInfo.natlang,
        display: $$props.itemInfo.display,
        isCustomized: false
      });
      return;
    }
    set(loading, false);
  }
  function handleConfirm() {
    if (!get(customizerData)) return;
    const phrase = get(previewText);
    const hasCustomization = get(selectedShape) || get(selectedColor) || get(selectedType);
    const displayParts = [];
    if (get(selectedShape)) {
      const s = get(customizerData).shapes.find((x) => x.tag === get(selectedShape));
      if (s) displayParts.push(s.display);
    }
    if (get(selectedColor)) {
      const c = get(customizerData).colors.find((x) => x.tag === get(selectedColor));
      if (c) displayParts.push(c.display);
    }
    if (get(selectedType)) {
      const t = get(customizerData).types.find((x) => x.tag === get(selectedType));
      if (t) displayParts.push(t.display);
    }
    displayParts.push($$props.itemInfo.display);
    onConfirm()({
      tag: $$props.itemInfo.tag,
      tags: hasCustomization ? phrase : $$props.itemInfo.tags || phrase,
      natlang: hasCustomization ? phrase : $$props.itemInfo.natlang || phrase,
      display: displayParts.join(" "),
      isCustomized: !!hasCustomization
    });
  }
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel()();
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel()();
    } else if (e.key === "Enter") {
      e.stopPropagation();
      handleConfirm();
    }
  }
  var div = root$2();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var span = child(div_2);
  var text = child(span);
  var button = sibling(span, 2);
  var node = sibling(div_2, 2);
  {
    var consequent = ($$anchor2) => {
      var div_3 = root_1$2();
      append($$anchor2, div_3);
    };
    var alternate = ($$anchor2) => {
      var fragment = root_2$2();
      var div_4 = first_child(fragment);
      var div_5 = child(div_4);
      var select = sibling(child(div_5), 2);
      var option = child(select);
      option.value = option.__value = "";
      var node_1 = sibling(option);
      each(node_1, 17, () => get(filteredShapes), index, ($$anchor3, s) => {
        var option_1 = root_3$2();
        var text_1 = child(option_1);
        var option_1_value = {};
        template_effect(() => {
          set_text(text_1, get(s).display);
          if (option_1_value !== (option_1_value = get(s).tag)) {
            option_1.value = (option_1.__value = get(s).tag) ?? "";
          }
        });
        append($$anchor3, option_1);
      });
      var div_6 = sibling(div_5, 2);
      var select_1 = sibling(child(div_6), 2);
      var option_2 = child(select_1);
      option_2.value = option_2.__value = "";
      var node_2 = sibling(option_2);
      each(node_2, 17, () => get(filteredColors), index, ($$anchor3, c) => {
        var option_3 = root_4$1();
        var text_2 = child(option_3);
        var option_3_value = {};
        template_effect(() => {
          set_text(text_2, get(c).display);
          if (option_3_value !== (option_3_value = get(c).tag)) {
            option_3.value = (option_3.__value = get(c).tag) ?? "";
          }
        });
        append($$anchor3, option_3);
      });
      var div_7 = sibling(div_6, 2);
      var select_2 = sibling(child(div_7), 2);
      var option_4 = child(select_2);
      option_4.value = option_4.__value = "";
      var node_3 = sibling(option_4);
      each(node_3, 17, () => get(filteredTypes), index, ($$anchor3, t) => {
        var option_5 = root_5$2();
        var text_3 = child(option_5);
        var option_5_value = {};
        template_effect(() => {
          set_text(text_3, get(t).display);
          if (option_5_value !== (option_5_value = get(t).tag)) {
            option_5.value = (option_5.__value = get(t).tag) ?? "";
          }
        });
        append($$anchor3, option_5);
      });
      var div_8 = sibling(div_7, 2);
      var div_9 = sibling(child(div_8), 2);
      var text_4 = child(div_9);
      var div_10 = sibling(div_4, 2);
      var button_1 = child(div_10);
      var button_2 = sibling(button_1, 2);
      template_effect(() => set_text(text_4, get(previewText)));
      bind_select_value(select, () => get(selectedShape), ($$value) => set(selectedShape, $$value));
      bind_select_value(select_1, () => get(selectedColor), ($$value) => set(selectedColor, $$value));
      bind_select_value(select_2, () => get(selectedType), ($$value) => set(selectedType, $$value));
      delegated("click", button_1, function(...$$args) {
        var _a;
        (_a = onCancel()) == null ? void 0 : _a.apply(this, $$args);
      });
      delegated("click", button_2, handleConfirm);
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if (get(loading)) $$render(consequent);
      else $$render(alternate, -1);
    });
  }
  template_effect(() => set_text(text, `Customize: ${$$props.itemInfo.display ?? ""}`));
  delegated("click", div, handleOverlayClick);
  delegated("keydown", div, handleKeydown);
  delegated("click", button, function(...$$args) {
    var _a;
    (_a = onCancel()) == null ? void 0 : _a.apply(this, $$args);
  });
  append($$anchor, div);
  pop();
}
delegate(["click", "keydown"]);
var root_2$1 = from_html(`<div class="pcr-tb-clothing-cat-thumb"><img alt="" loading="lazy"/></div>`);
var root_3$1 = from_html(`<span class="dot">·</span><span class="sel"> </span>`, 1);
var root_1$1 = from_html(`<div><!> <div class="pcr-tb-clothing-cat-meta"><div class="pcr-tb-clothing-cat-name"> </div> <div class="pcr-tb-clothing-cat-count"> <!></div></div></div>`);
var root_5$1 = from_html(`<button class="pcr-tb-clothing-clear">Clear</button>`);
var root_7$1 = from_html(`<div class="pcr-tb-clothing-item-thumb"><img loading="lazy"/></div>`);
var root_6$1 = from_html(`<div><!> <div class="pcr-tb-clothing-item-name"> </div> <button type="button" class="pcr-tb-clothing-item-add" aria-label="Add">+</button></div>`);
var root_4 = from_html(`<div class="pcr-tb-clothing-section"><div class="pcr-tb-clothing-section-header"><span class="title"> </span> <span class="count"> </span> <!></div> <div class="pcr-tb-clothing-items"></div></div>`);
var root_8$1 = from_html(`<div class="pcr-tb-clothing-empty"> </div>`);
var root$1 = from_html(`<div class="pcr-tb-clothing"><div class="pcr-tb-clothing-categories"></div> <!> <!></div>`);
function ClothingPanel($$anchor, $$props) {
  push($$props, true);
  let groups = prop($$props, "groups", 19, () => []), selections = prop($$props, "selections", 19, () => ({}));
  prop($$props, "isNaturalMode", 3, false);
  let searchQuery = prop($$props, "searchQuery", 3, ""), onSelect = prop($$props, "onSelect", 3, () => {
  }), onOpenClothingCustomizer = prop($$props, "onOpenClothingCustomizer", 3, null);
  let activeFilters = state(proxy(/* @__PURE__ */ new Set()));
  let availableThumbs = state(proxy(/* @__PURE__ */ new Set()));
  onMount(async () => {
    try {
      const res = await fetch("/promptchain/tag-builder/thumbs/manifest?bucket=clothing");
      if (!res.ok) return;
      const data = await res.json();
      set(availableThumbs, new Set(data.thumbs || []), true);
    } catch {
    }
  });
  function togglePill(groupName) {
    const next = new Set(get(activeFilters));
    if (next.has(groupName)) next.delete(groupName);
    else next.add(groupName);
    set(activeFilters, next, true);
  }
  let visibleGroups = user_derived(() => get(activeFilters).size === 0 ? groups() : groups().filter((g) => get(activeFilters).has(g.name)));
  function isCustomizable(groupName) {
    return CUSTOMIZABLE_CLOTHING_GROUPS.includes((groupName || "").toLowerCase());
  }
  function getSelectedTags(groupName) {
    const sel = selections()[groupName];
    if (!sel) return /* @__PURE__ */ new Set();
    const items = Array.isArray(sel) ? sel : [sel];
    return new Set(items.map((s) => s.tag));
  }
  function getGroupSelectionCount(groupName) {
    const sel = selections()[groupName];
    if (!sel) return 0;
    return Array.isArray(sel) ? sel.length : 1;
  }
  function thumbUrl(itemTag) {
    return `/promptchain/tag-builder/thumb/clothing/${encodeURIComponent(itemTag)}`;
  }
  function categoryThumbUrl(groupName) {
    return `/promptchain/tag-builder/thumb/clothing/${encodeURIComponent("_group_" + groupName)}`;
  }
  function hasItemThumb(itemTag) {
    return get(availableThumbs).has(itemTag);
  }
  function hasGroupThumb(groupName) {
    return get(availableThumbs).has("_group_" + groupName);
  }
  function handleAddItem(item, groupName) {
    if (isCustomizable(groupName) && onOpenClothingCustomizer()) {
      onOpenClothingCustomizer()({
        tag: item.tag,
        display: item.display || item.tag,
        tags: item.tags,
        natlang: item.natlang,
        group: groupName.toLowerCase()
      });
    } else {
      onSelect()("clothing", groupName, item, "single");
    }
  }
  function handleClearGroup(groupName) {
    onSelect()("clothing", groupName, null, "clear");
  }
  function filterItems(items) {
    const q = (searchQuery() || "").toLowerCase().replace(/[_\s]+/g, " ").trim();
    if (!q) return items;
    return items.filter((item) => {
      const d = (item.display || item.tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      const t = (item.tags || item.tag || "").toLowerCase().replace(/[_\s]+/g, " ");
      return d.includes(q) || t.includes(q);
    });
  }
  let visibleGroupsWithItems = user_derived(() => get(visibleGroups).map((g) => ({ group: g, items: filterItems(g.items) })).filter((x) => x.items.length > 0));
  var div = root$1();
  var div_1 = child(div);
  each(div_1, 21, groups, index, ($$anchor2, group) => {
    const isActive = user_derived(() => get(activeFilters).has(get(group).name));
    const selectedCount = user_derived(() => getGroupSelectionCount(get(group).name));
    const showThumb = user_derived(() => hasGroupThumb(get(group).name));
    var div_2 = root_1$1();
    let classes;
    var node = child(div_2);
    {
      var consequent = ($$anchor3) => {
        var div_3 = root_2$1();
        var img = child(div_3);
        template_effect(($0) => set_attribute(img, "src", $0), [() => categoryThumbUrl(get(group).name)]);
        append($$anchor3, div_3);
      };
      if_block(node, ($$render) => {
        if (get(showThumb)) $$render(consequent);
      });
    }
    var div_4 = sibling(node, 2);
    var div_5 = child(div_4);
    var text = child(div_5);
    var div_6 = sibling(div_5, 2);
    var text_1 = child(div_6);
    var node_1 = sibling(text_1);
    {
      var consequent_1 = ($$anchor3) => {
        var fragment = root_3$1();
        var span = sibling(first_child(fragment));
        var text_2 = child(span);
        template_effect(() => set_text(text_2, `${get(selectedCount) ?? ""} selected`));
        append($$anchor3, fragment);
      };
      if_block(node_1, ($$render) => {
        if (get(selectedCount) > 0) $$render(consequent_1);
      });
    }
    template_effect(() => {
      classes = set_class(div_2, 1, "pcr-tb-clothing-cat", null, classes, {
        active: get(isActive),
        "has-selection": get(selectedCount) > 0,
        "has-thumb": get(showThumb)
      });
      set_text(text, get(group).display || get(group).name);
      set_text(text_1, `${get(group).items.length ?? ""} `);
    });
    delegated("click", div_2, () => togglePill(get(group).name));
    append($$anchor2, div_2);
  });
  var node_2 = sibling(div_1, 2);
  each(node_2, 17, () => get(visibleGroupsWithItems), index, ($$anchor2, $$item) => {
    let group = () => get($$item).group;
    let items = () => get($$item).items;
    var div_7 = root_4();
    var div_8 = child(div_7);
    var span_1 = child(div_8);
    var text_3 = child(span_1);
    var span_2 = sibling(span_1, 2);
    var text_4 = child(span_2);
    var node_3 = sibling(span_2, 2);
    {
      var consequent_2 = ($$anchor3) => {
        var button = root_5$1();
        delegated("click", button, () => handleClearGroup(group().name));
        append($$anchor3, button);
      };
      var d_1 = user_derived(() => getGroupSelectionCount(group().name) > 0);
      if_block(node_3, ($$render) => {
        if (get(d_1)) $$render(consequent_2);
      });
    }
    var div_9 = sibling(div_8, 2);
    each(div_9, 21, items, index, ($$anchor3, item) => {
      const showThumb = user_derived(() => hasItemThumb(get(item).tag));
      const isSelected = user_derived(() => getSelectedTags(group().name).has(get(item).tag));
      var div_10 = root_6$1();
      let classes_1;
      var node_4 = child(div_10);
      {
        var consequent_3 = ($$anchor4) => {
          var div_11 = root_7$1();
          var img_1 = child(div_11);
          template_effect(
            ($0) => {
              set_attribute(img_1, "src", $0);
              set_attribute(img_1, "alt", get(item).display || get(item).tag);
            },
            [() => thumbUrl(get(item).tag)]
          );
          append($$anchor4, div_11);
        };
        if_block(node_4, ($$render) => {
          if (get(showThumb)) $$render(consequent_3);
        });
      }
      var div_12 = sibling(node_4, 2);
      var text_5 = child(div_12);
      var button_1 = sibling(div_12, 2);
      template_effect(() => {
        classes_1 = set_class(div_10, 1, "pcr-tb-clothing-item", null, classes_1, { selected: get(isSelected), "has-thumb": get(showThumb) });
        set_attribute(div_10, "title", get(item).display || get(item).tag);
        set_text(text_5, get(item).display || get(item).tag);
      });
      delegated("click", div_10, () => handleAddItem(get(item), group().name));
      delegated("click", button_1, (e) => {
        e.stopPropagation();
        handleAddItem(get(item), group().name);
      });
      append($$anchor3, div_10);
    });
    template_effect(() => {
      set_text(text_3, group().display || group().name);
      set_text(text_4, items().length);
    });
    append($$anchor2, div_7);
  });
  var node_5 = sibling(node_2, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var div_13 = root_8$1();
      var text_6 = child(div_13);
      template_effect(() => set_text(text_6, searchQuery() ? `No matches for "${searchQuery()}"` : "No items"));
      append($$anchor2, div_13);
    };
    if_block(node_5, ($$render) => {
      if (get(visibleGroupsWithItems).length === 0) $$render(consequent_4);
    });
  }
  append($$anchor, div);
  pop();
}
delegate(["click"]);
var root_1 = from_html(`<div><span class="pcr-atb-tab-icon"> </span> <span class="pcr-atb-tab-label"> </span></div>`);
var root_2 = from_html(`<div class="pcr-atb-loading-overlay"><div class="pcr-atb-loading-spinner"></div> <div class="pcr-atb-loading-text"> </div></div>`);
var root_8 = from_html(`<div class="pcr-atb-mixer-search-wrap"><input class="pcr-atb-mixer-search" type="text"/> <button type="button" class="pcr-atb-mixer-close" aria-label="Close">&times;</button></div>`);
var root_9 = from_html(`<span class="pcr-atb-mixer-label"> </span> <span> </span>`, 1);
var root_13 = from_html(`<div><span class="pcr-atb-char-option-name"> </span></div>`);
var root_12 = from_html(`<div class="pcr-atb-char-series-group"><div class="pcr-atb-char-series-header"> </div> <!></div>`);
var root_10 = from_html(`<div class="pcr-atb-mixer-dropdown pcr-atb-char-dropdown"></div>`);
var root_7 = from_html(`<div><div class="pcr-atb-mixer-header"><!></div> <!></div>`);
var root_6 = from_html(`<div class="pcr-atb-mixer-grid"></div>`);
var root_16 = from_html(`<div class="pcr-atb-mixer-search-wrap"><input class="pcr-atb-mixer-search" type="text"/> <button type="button" class="pcr-atb-mixer-close" aria-label="Close">&times;</button></div>`);
var root_17 = from_html(`<span class="pcr-atb-mixer-label"> </span> <span> </span>`, 1);
var root_19 = from_html(`<div> </div>`);
var root_20 = from_html(`<div class="pcr-atb-mixer-empty">No matches</div>`);
var root_18 = from_html(`<div class="pcr-atb-mixer-dropdown"><div class="pcr-atb-mixer-option pcr-atb-mixer-none">-- None --</div> <!> <!></div>`);
var root_15 = from_html(`<div><div class="pcr-atb-mixer-header"><!></div> <!></div>`);
var root_14 = from_html(`<div class="pcr-atb-mixer-grid"></div>`);
var root_5 = from_html(`<div class="pcr-atb-all-section"><div class="pcr-atb-all-section-header"><span class="icon"> </span> </div> <!></div>`);
var root_3 = from_html(`<div class="pcr-atb-all-mixer-wrapper"></div>`);
var root_24 = from_html(`<div class="pcr-atb-empty"> </div>`);
var root_27 = from_html(`<div class="pcr-atb-mixer-search-wrap"><input class="pcr-atb-mixer-search" type="text"/> <button type="button" class="pcr-atb-mixer-close" aria-label="Close">&times;</button></div>`);
var root_28 = from_html(`<span class="pcr-atb-mixer-label"> </span> <span> </span>`, 1);
var root_32 = from_html(`<div><span class="pcr-atb-char-option-name"> </span></div>`);
var root_31 = from_html(`<div class="pcr-atb-char-series-group"><div class="pcr-atb-char-series-header"> </div> <!></div>`);
var root_29 = from_html(`<div class="pcr-atb-mixer-dropdown pcr-atb-char-dropdown"></div>`);
var root_26 = from_html(`<div><div class="pcr-atb-mixer-header"><!></div> <!></div>`);
var root_25 = from_html(`<div class="pcr-atb-all-mixer-wrapper"><div class="pcr-atb-mixer-grid"></div></div>`);
var root_36 = from_html(`<div class="pcr-atb-mixer-search-wrap"><input class="pcr-atb-mixer-search" type="text"/> <button type="button" class="pcr-atb-mixer-close" aria-label="Close">&times;</button></div>`);
var root_37 = from_html(`<span class="pcr-atb-mixer-label"> </span> <span> </span>`, 1);
var root_39 = from_html(`<div> </div>`);
var root_40 = from_html(`<div class="pcr-atb-mixer-empty">No matches</div>`);
var root_38 = from_html(`<div class="pcr-atb-mixer-dropdown"><div class="pcr-atb-mixer-option pcr-atb-mixer-none">-- None --</div> <!> <!></div>`);
var root_35 = from_html(`<div class="pcr-atb-all-section" data-bucket="props"><div class="pcr-atb-all-section-header"><span class="icon"> </span> </div> <div class="pcr-atb-mixer-grid"><div><div class="pcr-atb-mixer-header"><!></div> <!></div></div></div>`);
var root_42 = from_html(`<div class="pcr-atb-props-pill"><span class="pill-text"> </span> <span class="pill-remove">&times;</span></div>`);
var root_41 = from_html(`<div class="pcr-atb-props-selections"><div class="pcr-atb-props-selections-label">Selected Props:</div> <div class="pcr-atb-props-selections-pills"></div></div>`);
var root_34 = from_html(`<div class="pcr-atb-props"><div class="pcr-atb-all-mixer-wrapper"></div> <!></div>`);
var root_43 = from_html(`<div class="pcr-atb-empty"> </div>`);
var root_45 = from_html(`<button class="pcr-atb-props-btn"> </button>`);
var root_47 = from_html(`<div class="pcr-atb-props-pill"><span class="pill-text"> </span> <span class="pill-remove">&times;</span></div>`);
var root_46 = from_html(`<div class="pcr-atb-props-selections"><div class="pcr-atb-props-selections-label">Selected Props:</div> <div class="pcr-atb-props-selections-pills"></div></div>`);
var root_44 = from_html(`<div class="pcr-atb-props"><div class="pcr-atb-props-buttons"></div> <!></div>`);
var root = from_html(`<div class="pcr-atb-panel"><div class="pcr-atb-header"><span class="pcr-atb-title">Tag Builder</span> <div class="pcr-atb-search-wrapper"><input class="pcr-atb-search" placeholder="Search..."/> <button title="Clear search">&times;</button></div></div> <div class="pcr-atb-body"><div class="pcr-atb-tabs"></div> <div class="pcr-atb-content"><!></div></div> <!> <div class="pcr-atb-footer"><div class="pcr-atb-toggle"><label class="pcr-atb-toggle-option"><input type="radio" name="pcr-atb-format" value="tags"/> <span>Tags</span></label> <label class="pcr-atb-toggle-option"><input type="radio" name="pcr-atb-format" value="natural"/> <span>Natural Language</span></label></div> <div class="pcr-atb-buttons"><button class="pcr-atb-cancel">Cancel</button> <button class="pcr-atb-insert">Insert</button></div></div></div> <!> <!> <!> <!> <!>`, 1);
function TagBuilder($$anchor, $$props) {
  push($$props, true);
  const TABS = [
    { key: "all", label: "All", icon: "🔍" },
    { key: "cast", label: "Cast", icon: "👥" },
    { key: "characters", label: "Character", icon: "👤" },
    { key: "appearance", label: "Appearance", icon: "✨" },
    { key: "clothing", label: "Clothing", icon: "👕" },
    { key: "pose", label: "Pose", icon: "🧘" },
    { key: "props", label: "Props", icon: "🛋️" },
    { key: "expression", label: "Expression", icon: "😊" },
    { key: "action", label: "Action", icon: "⚡" },
    { key: "scene", label: "Scene", icon: "🏠" }
  ];
  const ALL_TAB_BUCKETS = [
    "characters",
    "appearance",
    "clothing",
    "pose",
    "props",
    "scene",
    "expression",
    "action",
    "nsfw_action"
  ];
  const BUCKET_INFO = {
    characters: { label: "Characters", icon: "👤" },
    appearance: { label: "Appearance", icon: "✨" },
    clothing: { label: "Clothing", icon: "👕" },
    pose: { label: "Pose", icon: "🧘" },
    props: { label: "Props", icon: "🛋️" },
    scene: { label: "Scene", icon: "🏠" },
    expression: { label: "Expression", icon: "😊" },
    action: { label: "Action", icon: "⚡" },
    nsfw_action: { label: "NSFW", icon: "🔞" }
  };
  prop($$props, "from", 3, 0);
  prop($$props, "to", 3, 0);
  let initialTab = prop($$props, "initialTab", 3, "all"), initialQuery = prop($$props, "initialQuery", 3, ""), tagSourceConfig = prop($$props, "tagSourceConfig", 19, () => ({})), onPromptStyleChange = prop($$props, "onPromptStyleChange", 3, () => {
  }), onInsert = prop($$props, "onInsert", 3, () => {
  }), onClose = prop($$props, "onClose", 3, () => {
  });
  let activeTab = state(proxy(initialTab()));
  let searchQuery = state(proxy(initialQuery()));
  let isNaturalMode = state(tagSourceConfig().prompt_style === "natural");
  let loading = state(false);
  let selections = state(proxy({
    cast: {},
    characters: [],
    appearance: {},
    clothing: {},
    pose: {},
    props: [],
    scene: {},
    expression: {},
    action: {},
    nsfw_action: {}
  }));
  let cache = proxy({});
  let searchTimeout = null;
  onDestroy(() => {
    clearTimeout(searchTimeout);
  });
  let tabData = proxy({});
  let showCharacterModal = state(false);
  let characterModalTag = state("");
  let characterModalDisplay = state("");
  let showPropsModal = state(false);
  let propsModalCategory = state("");
  let propsModalPreSelected = state(null);
  let showNsfwModal = state(false);
  let nsfwModalGroups = state(proxy([]));
  let showClothingCustomizer = state(false);
  let clothingCustomizerItem = state(null);
  let showFantasyCustomizer = state(false);
  let fantasyCustomizerItem = state(null);
  let characterCategories = state(proxy([]));
  let allTabGroups = state(proxy({}));
  let searchInputEl;
  user_effect(() => {
    function onKeydown(e) {
      if (e.key !== "Escape") return;
      if (get(openDropdownKey)) {
        set(openDropdownKey, null);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (get(showCharacterModal) || get(showPropsModal) || get(showNsfwModal) || get(showClothingCustomizer) || get(showFantasyCustomizer)) return;
      onClose()();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });
  user_effect(() => {
    untrack(() => {
      loadTabContent(get(activeTab), get(searchQuery), true);
      if (searchInputEl) searchInputEl.focus();
    });
  });
  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(
      () => {
        loadTabContent(get(activeTab), get(searchQuery), false);
      },
      200
    );
  }
  function clearSearch() {
    set(searchQuery, "");
    loadTabContent(get(activeTab), "", false);
    searchInputEl == null ? void 0 : searchInputEl.focus();
  }
  function switchTab(tabKey) {
    if (tabKey === get(activeTab)) {
      if (tabKey === "all") return;
      tabKey = "all";
    }
    set(activeTab, tabKey, true);
    set(searchQuery, "");
    loadTabContent(tabKey, "", true);
  }
  async function loadTabContent(tab, query, showSpinner) {
    if (showSpinner) set(loading, true);
    try {
      if (tab === "all") {
        await loadAllContent(query);
      } else if (tab === "characters") {
        await loadCharacterContent(query);
      } else if (tab === "props") {
        await loadPropsContent(query);
      } else {
        await loadMixerContent(tab, query);
      }
    } catch (e) {
      console.error(`[TagBuilder] Failed to load ${tab}:`, e);
    }
    set(loading, false);
  }
  async function loadMixerContent(bucket, query) {
    if (!cache[bucket]) {
      const [groupsRes, itemsRes] = await Promise.all([
        fetch(`/promptchain/tag-builder/buckets/${bucket}/groups`),
        fetch(`/promptchain/tag-builder/buckets/${bucket}/items`)
      ]);
      if (!groupsRes.ok || !itemsRes.ok) throw new Error("Failed to fetch");
      const groupsData = await groupsRes.json();
      const itemsData = await itemsRes.json();
      const itemsByGroup = {};
      for (const item of itemsData.items) {
        if (!itemsByGroup[item.item_group]) itemsByGroup[item.item_group] = [];
        itemsByGroup[item.item_group].push({
          tag: item.item_tag,
          display: item.display_name,
          tags: item.base_tags,
          natlang: item.base_natlang,
          group: item.item_group
        });
      }
      cache[bucket] = groupsData.groups.map((g) => ({
        name: g.group_name,
        display: g.display_name,
        items: itemsByGroup[g.group_name] || []
      }));
    }
    tabData[bucket] = cache[bucket];
  }
  async function loadCharacterContent(query) {
    let url = "/promptchain/tag-builder/character-categories";
    if (query) url += `?search=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    set(characterCategories, data.categories || [], true);
  }
  async function loadPropsContent(query) {
    if (!cache.propsData) {
      const response = await fetch("/promptchain/props/all");
      if (!response.ok) throw new Error("Failed to fetch props data");
      cache.propsData = await response.json();
    }
  }
  async function loadAllContent(query) {
    const lowerQuery = (query || "").toLowerCase();
    const dataPromises = [];
    let charUrl = "/promptchain/tag-builder/character-categories";
    if (lowerQuery) charUrl += `?search=${encodeURIComponent(lowerQuery)}`;
    dataPromises.push(fetch(charUrl).then((r) => r.ok ? r.json() : { categories: [] }).then((data) => ({ bucket: "characters", categories: data.categories || [] })).catch(() => ({ bucket: "characters", categories: [] })));
    if (!cache.propsData) {
      dataPromises.push(fetch("/promptchain/props/all").then((r) => r.ok ? r.json() : null).then((data) => {
        if (data) cache.propsData = data;
        return { bucket: "props", propsData: data };
      }).catch(() => ({ bucket: "props", propsData: null })));
    } else {
      dataPromises.push(Promise.resolve({ bucket: "props", propsData: cache.propsData }));
    }
    const mixerBuckets = [
      "appearance",
      "clothing",
      "pose",
      "scene",
      "expression",
      "action",
      "nsfw_action"
    ];
    for (const bucket of mixerBuckets) {
      if (!cache[bucket]) {
        dataPromises.push(Promise.all([
          fetch(`/promptchain/tag-builder/buckets/${bucket}/groups`).then((r) => r.ok ? r.json() : { groups: [] }),
          fetch(`/promptchain/tag-builder/buckets/${bucket}/items`).then((r) => r.ok ? r.json() : { items: [] })
        ]).then(([groupsData, itemsData]) => {
          const itemsByGroup = {};
          for (const item of itemsData.items) {
            if (!itemsByGroup[item.item_group]) itemsByGroup[item.item_group] = [];
            itemsByGroup[item.item_group].push({
              tag: item.item_tag,
              display: item.display_name,
              tags: item.base_tags,
              natlang: item.base_natlang,
              group: item.item_group
            });
          }
          cache[bucket] = groupsData.groups.map((g) => ({
            name: g.group_name,
            display: g.display_name,
            items: itemsByGroup[g.group_name] || []
          }));
          return { bucket, groups: cache[bucket] };
        }).catch(() => ({ bucket, groups: [] })));
      } else {
        dataPromises.push(Promise.resolve({ bucket, groups: cache[bucket] }));
      }
    }
    const results = await Promise.all(dataPromises);
    const grouped = {};
    for (const result of results) {
      if (result.bucket === "characters") {
        const charGroups = [];
        for (const category of result.categories) {
          const items = [];
          for (const series of category.series) {
            for (const char of series.characters) {
              items.push({
                tag: char.tag,
                display: char.display || char.tag,
                series: series.name
              });
            }
          }
          if (items.length > 0) {
            charGroups.push({
              name: `_char_${category.tag}`,
              display: category.name,
              bucket: "characters",
              category: category.tag,
              items,
              seriesData: category.series
            });
          }
        }
        grouped.characters = charGroups;
      } else if (result.bucket === "props" && result.propsData) {
        const propGroups = [];
        for (const cat of result.propsData.categories || []) {
          const categoryProps = (result.propsData.props || []).filter((p) => p.category === cat.category);
          if (categoryProps.length > 0) {
            propGroups.push({
              name: `_props_${cat.category}`,
              display: `${cat.icon} ${cat.display_name}`,
              bucket: "props",
              category: cat.category,
              items: categoryProps.map((p) => ({
                tag: p.prop_tag,
                display: p.display_name || p.prop_tag,
                category: p.category,
                is_customizable: p.is_customizable
              }))
            });
          }
        }
        grouped.props = propGroups;
      } else if (result.groups) {
        grouped[result.bucket] = result.groups.map((g) => ({ ...g, bucket: result.bucket }));
      }
    }
    set(allTabGroups, grouped, true);
  }
  function getAllFilteredGroups(bucket) {
    const groups = get(allTabGroups)[bucket] || [];
    const lowerQuery = (get(searchQuery) || "").toLowerCase();
    if (!lowerQuery) return groups;
    return groups.map((group) => {
      const filtered = group.items.filter((item) => {
        const normalize = (s) => (s || "").toLowerCase().replace(/[_\s]+/g, " ");
        const q = normalize(lowerQuery);
        return normalize(item.display || item.tag).includes(q) || normalize(item.tags || "").includes(q) || normalize(item.series || "").includes(q);
      });
      return { ...group, items: filtered };
    }).filter((g) => g.items.length > 0);
  }
  function handleMixerSelect(bucket, groupName, item, mode) {
    if (mode === "clear") {
      delete get(selections)[bucket][groupName];
      set(selections, { ...get(selections) }, true);
      return;
    }
    if (!get(selections)[bucket]) get(selections)[bucket] = {};
    if (mode === "toggle") {
      let arr = get(selections)[bucket][groupName];
      if (!Array.isArray(arr)) arr = [];
      const idx = arr.findIndex((s) => s.tag === item.tag);
      if (idx >= 0) {
        arr.splice(idx, 1);
      } else {
        arr.push({
          tag: item.tag,
          tags: item.tags,
          natlang: item.natlang,
          display: item.display || item.tag
        });
      }
      if (arr.length > 0) {
        get(selections)[bucket][groupName] = arr;
      } else {
        delete get(selections)[bucket][groupName];
      }
    } else {
      if (item) {
        get(selections)[bucket][groupName] = {
          tag: item.tag,
          tags: item.tags,
          natlang: item.natlang,
          display: item.display || item.tag
        };
      } else {
        delete get(selections)[bucket][groupName];
      }
    }
    set(selections, { ...get(selections) }, true);
  }
  function handleAllCharacterClick(tag, display) {
    set(characterModalTag, tag, true);
    set(characterModalDisplay, display, true);
    set(showCharacterModal, true);
  }
  function handleAllPropsClick(category, preSelectedTag) {
    set(propsModalCategory, category, true);
    set(propsModalPreSelected, preSelectedTag, true);
    set(showPropsModal, true);
  }
  function handleAllSelect(bucket, groupName, item, mode) {
    if (bucket === "characters") {
      if (!item) {
        get(selections).characters = [];
        set(selections, { ...get(selections) }, true);
      } else {
        handleAllCharacterClick(item.tag, item.display || item.tag);
      }
      return;
    }
    if (bucket === "props") {
      if (!item) {
        const category = groupName.replace("_props_", "");
        get(selections).props = (get(selections).props || []).filter((p) => p.category !== category);
        set(selections, { ...get(selections) }, true);
      } else {
        handleAllPropsClick(item.category || groupName.replace("_props_", ""), item.tag);
      }
      return;
    }
    if (bucket === "clothing" && CUSTOMIZABLE_CLOTHING_GROUPS.includes(groupName.toLowerCase()) && item) {
      handleOpenClothingCustomizer({
        tag: item.tag,
        display: item.display || item.tag,
        tags: item.tags,
        natlang: item.natlang,
        group: groupName.toLowerCase()
      });
      return;
    }
    if (bucket === "appearance" && groupName.toLowerCase() === "fantasy" && item) {
      handleOpenFantasyCustomizer({
        tag: item.tag,
        display: item.display || item.tag,
        tags: item.tags,
        natlang: item.natlang
      });
      return;
    }
    handleMixerSelect(bucket, groupName, item, mode);
  }
  function handleCharacterSelected(charObj) {
    const chars = get(selections).characters || [];
    const idx = chars.findIndex((c) => c.tag === charObj.tag);
    get(selections).characters = idx >= 0 ? chars.map((c, i) => i === idx ? charObj : c) : [...chars, charObj];
    set(showCharacterModal, false);
  }
  let openDropdownKey = state(null);
  let dropdownSearchQuery = state("");
  let highlightedIndex = state(0);
  function setOpenDropdown(key) {
    set(openDropdownKey, get(openDropdownKey) === key ? null : key, true);
  }
  user_effect(() => {
    get(openDropdownKey);
    untrack(() => {
      set(dropdownSearchQuery, "");
      set(highlightedIndex, 0);
    });
  });
  user_effect(() => {
    get(dropdownSearchQuery);
    untrack(() => {
      set(highlightedIndex, 0);
    });
  });
  function focusOnMount(node) {
    node.focus();
  }
  function highlightScroll(node, highlighted) {
    function check(h) {
      if (h) node.scrollIntoView({ block: "nearest" });
    }
    check(highlighted);
    return { update: check };
  }
  function handleDropdownKey(e, flatList, selectFn) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      set(highlightedIndex, Math.min(Math.max(flatList.length - 1, 0), get(highlightedIndex) + 1), true);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      set(highlightedIndex, Math.max(0, get(highlightedIndex) - 1), true);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const item = flatList[get(highlightedIndex)];
      if (item) selectFn(item);
      return;
    }
  }
  function filterDropdownItems(items, getDisplay, getTag) {
    const q = (get(dropdownSearchQuery) || "").toLowerCase().replace(/[_\s]+/g, " ").trim();
    if (!q) return items;
    return items.filter((item) => {
      const d = (getDisplay(item) || "").toLowerCase().replace(/[_\s]+/g, " ");
      const t = (getTag(item) || "").toLowerCase().replace(/[_\s]+/g, " ");
      return d.includes(q) || t.includes(q);
    });
  }
  function mixerOpenGroupFor(bucket) {
    var _a;
    const prefix = `mixer:${bucket}:`;
    return ((_a = get(openDropdownKey)) == null ? void 0 : _a.startsWith(prefix)) ? get(openDropdownKey).slice(prefix.length) : null;
  }
  function setMixerOpenGroup(bucket, group) {
    set(openDropdownKey, group ? `mixer:${bucket}:${group}` : null, true);
  }
  function toggleCharCategory(categoryTag) {
    setOpenDropdown(`char:${categoryTag}`);
  }
  user_effect(() => {
    if (!get(openDropdownKey)) return;
    function onDocClick(e) {
      if (e.target.closest(".pcr-atb-mixer-group.open")) return;
      set(openDropdownKey, null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  });
  function handleCharOptionClick(tag, display) {
    set(openDropdownKey, null);
    set(characterModalTag, tag, true);
    set(characterModalDisplay, display, true);
    set(showCharacterModal, true);
  }
  function handlePropsCategoryClick(category) {
    set(propsModalCategory, category, true);
    set(propsModalPreSelected, null);
    set(showPropsModal, true);
  }
  function handlePropConfirm(propObj) {
    if (!get(selections).props) get(selections).props = [];
    get(selections).props = [...get(selections).props, propObj];
    set(showPropsModal, false);
  }
  function removeProp(index2) {
    get(selections).props = get(selections).props.filter((_, i) => i !== index2);
  }
  let propsSearchGroups = user_derived(() => {
    if (!cache.propsData || get(activeTab) !== "props") return [];
    const lowerQuery = (get(searchQuery) || "").toLowerCase().replace(/[_\s]+/g, " ");
    if (!lowerQuery) return [];
    const result = [];
    for (const cat of cache.propsData.categories || []) {
      const categoryProps = (cache.propsData.props || []).filter((p) => p.category === cat.category);
      const filtered = categoryProps.filter((p) => {
        const d = (p.display_name || p.prop_tag).toLowerCase().replace(/[_\s]+/g, " ");
        const t = (p.prop_tag || "").toLowerCase().replace(/[_\s]+/g, " ");
        return d.includes(lowerQuery) || t.includes(lowerQuery);
      });
      if (filtered.length > 0) {
        result.push({ category: cat, props: filtered });
      }
    }
    return result;
  });
  async function handleOpenNsfwModal() {
    if (!cache.nsfw_action) {
      try {
        const [groupsRes, itemsRes] = await Promise.all([
          fetch("/promptchain/tag-builder/buckets/nsfw_action/groups"),
          fetch("/promptchain/tag-builder/buckets/nsfw_action/items")
        ]);
        if (!groupsRes.ok || !itemsRes.ok) throw new Error("Failed to fetch");
        const groupsData = await groupsRes.json();
        const itemsData = await itemsRes.json();
        const itemsByGroup = {};
        for (const item of itemsData.items) {
          if (!itemsByGroup[item.item_group]) itemsByGroup[item.item_group] = [];
          itemsByGroup[item.item_group].push({
            tag: item.item_tag,
            display: item.display_name,
            tags: item.base_tags,
            natlang: item.base_natlang
          });
        }
        cache.nsfw_action = groupsData.groups.map((g) => ({
          name: g.group_name,
          display: g.display_name,
          items: itemsByGroup[g.group_name] || []
        }));
      } catch (e) {
        console.error("[TagBuilder] Failed to load NSFW actions:", e);
        return;
      }
    }
    set(nsfwModalGroups, cache.nsfw_action, true);
    set(showNsfwModal, true);
  }
  function handleNsfwConfirm(pendingSelections) {
    get(selections).nsfw_action = pendingSelections;
    set(selections, { ...get(selections) }, true);
    set(showNsfwModal, false);
    if (get(activeTab) === "action") {
      loadTabContent("action", get(searchQuery));
    }
  }
  function handleOpenClothingCustomizer(itemInfo) {
    set(clothingCustomizerItem, itemInfo, true);
    set(showClothingCustomizer, true);
  }
  function handleClothingConfirm(result) {
    if (result && get(clothingCustomizerItem)) {
      const bucket = "clothing";
      const groupName = get(clothingCustomizerItem).group;
      if (!get(selections)[bucket]) get(selections)[bucket] = {};
      get(selections)[bucket][groupName] = {
        tag: result.tag || get(clothingCustomizerItem).tag,
        tags: result.tags,
        natlang: result.natlang,
        display: result.display,
        isCustomized: result.isCustomized
      };
      set(selections, { ...get(selections) }, true);
    }
    set(showClothingCustomizer, false);
    set(clothingCustomizerItem, null);
  }
  function handleClothingCancel() {
    set(showClothingCustomizer, false);
    set(clothingCustomizerItem, null);
  }
  function handleOpenFantasyCustomizer(itemInfo) {
    set(fantasyCustomizerItem, itemInfo, true);
    set(showFantasyCustomizer, true);
  }
  function handleFantasyConfirm(result) {
    if (result && get(fantasyCustomizerItem)) {
      const bucket = "appearance";
      const groupName = "fantasy";
      if (!get(selections)[bucket]) get(selections)[bucket] = {};
      get(selections)[bucket][groupName] = {
        tag: result.tag || get(fantasyCustomizerItem).tag,
        tags: result.tags,
        natlang: result.natlang,
        display: result.display,
        isCustomized: result.isCustomized
      };
      set(selections, { ...get(selections) }, true);
    }
    set(showFantasyCustomizer, false);
    set(fantasyCustomizerItem, null);
  }
  function handleFantasyCancel() {
    set(showFantasyCustomizer, false);
    set(fantasyCustomizerItem, null);
  }
  function handleEditBubble(removeInfo) {
    var _a;
    if (removeInfo.bucket !== "characters") return;
    const char = (_a = get(selections).characters) == null ? void 0 : _a[removeInfo.index];
    if (!char) return;
    set(characterModalTag, char.tag, true);
    set(characterModalDisplay, char.display || char.tag, true);
    set(showCharacterModal, true);
  }
  function handleRemove(removeInfo) {
    var _a;
    const { bucket, index: index2, type, groupName, tag } = removeInfo;
    if (bucket === "characters") {
      const char = get(selections).characters[index2];
      if (char) {
        if (type === "character") char.base = false;
        else if (type === "outfit") {
          char.outfit = null;
          char.outfitIndex = null;
        } else if (type === "pose") {
          char.pose = null;
          char.poseIndex = null;
        }
        if (!char.base && !char.outfit && !char.pose) {
          get(selections).characters.splice(index2, 1);
        }
      }
    } else if (bucket === "props") {
      get(selections).props.splice(index2, 1);
    } else if (type === "mixer") {
      const sel = (_a = get(selections)[bucket]) == null ? void 0 : _a[groupName];
      if (Array.isArray(sel)) {
        const idx = sel.findIndex((s) => s.tag === tag);
        if (idx >= 0) sel.splice(idx, 1);
        if (sel.length === 0) delete get(selections)[bucket][groupName];
      } else {
        delete get(selections)[bucket][groupName];
      }
    }
    set(selections, { ...get(selections) }, true);
  }
  function handleInsert() {
    const stateSnapshot = {
      isNaturalMode: get(isNaturalMode),
      selections: get(selections),
      cache
    };
    const text = buildInsertText(stateSnapshot, true, tagSourceConfig());
    onInsert()(text);
  }
  function positionDropdown(dropdownNode) {
    function reposition() {
      const groupEl = dropdownNode.closest(".pcr-atb-mixer-group");
      const header = groupEl == null ? void 0 : groupEl.querySelector(".pcr-atb-mixer-header");
      if (!header) return;
      const headerRect = header.getBoundingClientRect();
      const isCharCategory = groupEl.classList.contains("pcr-atb-char-category");
      const maxH = isCharCategory ? 350 : 200;
      const dropH = Math.min(dropdownNode.scrollHeight, maxH);
      const vh = window.innerHeight;
      const spaceBelow = vh - headerRect.bottom;
      const spaceAbove = headerRect.top;
      if (spaceBelow < dropH && spaceAbove > spaceBelow) {
        groupEl.classList.add("flip-up");
        dropdownNode.style.left = `${headerRect.left}px`;
        dropdownNode.style.width = `${headerRect.width}px`;
        dropdownNode.style.bottom = `${vh - headerRect.top}px`;
        dropdownNode.style.top = "auto";
        dropdownNode.style.maxHeight = `${Math.min(spaceAbove - 10, maxH)}px`;
      } else {
        groupEl.classList.remove("flip-up");
        dropdownNode.style.left = `${headerRect.left}px`;
        dropdownNode.style.width = `${headerRect.width}px`;
        dropdownNode.style.top = `${headerRect.bottom}px`;
        dropdownNode.style.bottom = "auto";
        dropdownNode.style.maxHeight = `${Math.min(spaceBelow - 10, maxH)}px`;
      }
    }
    reposition();
    const scrollContainer = dropdownNode.closest(".pcr-atb-content");
    if (scrollContainer) scrollContainer.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);
    return {
      update: reposition,
      destroy() {
        if (scrollContainer) scrollContainer.removeEventListener("scroll", reposition);
        window.removeEventListener("resize", reposition);
      }
    };
  }
  var fragment = root();
  var div = first_child(fragment);
  var div_1 = child(div);
  var div_2 = sibling(child(div_1), 2);
  var input = child(div_2);
  bind_this(input, ($$value) => searchInputEl = $$value, () => searchInputEl);
  var button = sibling(input, 2);
  let classes;
  var div_3 = sibling(div_1, 2);
  var div_4 = child(div_3);
  each(div_4, 21, () => TABS, index, ($$anchor2, tab) => {
    var div_5 = root_1();
    let classes_1;
    var span = child(div_5);
    var text_1 = child(span);
    var span_1 = sibling(span, 2);
    var text_2 = child(span_1);
    template_effect(() => {
      classes_1 = set_class(div_5, 1, "pcr-atb-tab", null, classes_1, { active: get(activeTab) === get(tab).key });
      set_text(text_1, get(tab).icon);
      set_text(text_2, get(tab).label);
    });
    delegated("click", div_5, () => switchTab(get(tab).key));
    append($$anchor2, div_5);
  });
  var div_6 = sibling(div_4, 2);
  var node_1 = child(div_6);
  {
    var consequent = ($$anchor2) => {
      var div_7 = root_2();
      var div_8 = sibling(child(div_7), 2);
      var text_3 = child(div_8);
      template_effect(($0) => set_text(text_3, `Loading ${$0 ?? ""}...`), [
        () => {
          var _a;
          return ((_a = TABS.find((t) => t.key === get(activeTab))) == null ? void 0 : _a.label) || get(activeTab);
        }
      ]);
      append($$anchor2, div_7);
    };
    var consequent_11 = ($$anchor2) => {
      var div_9 = root_3();
      each(div_9, 21, () => ALL_TAB_BUCKETS, index, ($$anchor3, bucket) => {
        const groups = user_derived(() => getAllFilteredGroups(get(bucket)));
        var fragment_1 = comment();
        var node_2 = first_child(fragment_1);
        {
          var consequent_10 = ($$anchor4) => {
            const info = user_derived(() => BUCKET_INFO[get(bucket)] || { label: get(bucket), icon: "📁" });
            var div_10 = root_5();
            var div_11 = child(div_10);
            var span_2 = child(div_11);
            var text_4 = child(span_2);
            var text_5 = sibling(span_2, 1, true);
            var node_3 = sibling(div_11, 2);
            {
              var consequent_4 = ($$anchor5) => {
                var div_12 = root_6();
                each(div_12, 21, () => get(groups), index, ($$anchor6, group) => {
                  const charsInCategory = user_derived(() => (get(selections).characters || []).filter((c) => get(group).items.some((i) => i.tag === c.tag)));
                  const selectedTags = user_derived(() => new Set(get(charsInCategory).map((c) => c.tag)));
                  const displayVal = user_derived(() => get(charsInCategory).length === 0 ? "Select" : get(charsInCategory).length === 1 ? get(charsInCategory)[0].display : `${get(charsInCategory).length} selected`);
                  const isCharOpen = user_derived(() => get(openDropdownKey) === `char:${get(group).category}`);
                  const charFlatList = user_derived(() => get(isCharOpen) ? (get(group).seriesData || []).flatMap((s) => filterDropdownItems(s.characters.filter((c) => get(group).items.some((i) => i.tag === c.tag)), (c) => c.display || c.tag, (c) => c.tag)) : []);
                  var div_13 = root_7();
                  let classes_2;
                  var div_14 = child(div_13);
                  var node_4 = child(div_14);
                  {
                    var consequent_1 = ($$anchor7) => {
                      var div_15 = root_8();
                      var input_1 = child(div_15);
                      action(input_1, ($$node) => focusOnMount == null ? void 0 : focusOnMount($$node));
                      var button_1 = sibling(input_1, 2);
                      template_effect(() => {
                        set_attribute(input_1, "placeholder", `Search ${get(group).display ?? ""}…`);
                        set_value(input_1, get(dropdownSearchQuery));
                      });
                      delegated("input", input_1, (e) => {
                        set(dropdownSearchQuery, e.target.value, true);
                      });
                      delegated("click", input_1, (e) => e.stopPropagation());
                      delegated("keydown", input_1, (e) => handleDropdownKey(e, get(charFlatList), (char) => {
                        handleAllCharacterClick(char.tag, char.display || char.tag);
                        set(openDropdownKey, null);
                      }));
                      delegated("click", button_1, (e) => {
                        e.stopPropagation();
                        set(openDropdownKey, null);
                      });
                      append($$anchor7, div_15);
                    };
                    var alternate = ($$anchor7) => {
                      var fragment_2 = root_9();
                      var span_3 = first_child(fragment_2);
                      var text_6 = child(span_3);
                      var span_4 = sibling(span_3, 2);
                      let classes_3;
                      var text_7 = child(span_4);
                      template_effect(() => {
                        set_text(text_6, `${get(group).display ?? ""} (${get(group).items.length ?? ""})`);
                        classes_3 = set_class(span_4, 1, "pcr-atb-mixer-value", null, classes_3, { "has-value": get(charsInCategory).length > 0 });
                        set_text(text_7, get(displayVal));
                      });
                      append($$anchor7, fragment_2);
                    };
                    if_block(node_4, ($$render) => {
                      if (get(isCharOpen)) $$render(consequent_1);
                      else $$render(alternate, -1);
                    });
                  }
                  var node_5 = sibling(div_14, 2);
                  {
                    var consequent_3 = ($$anchor7) => {
                      var div_16 = root_10();
                      each(div_16, 21, () => get(group).seriesData || [], index, ($$anchor8, series) => {
                        const seriesCharsInGroup = user_derived(() => get(series).characters.filter((c) => get(group).items.some((i) => i.tag === c.tag)));
                        const seriesChars = user_derived(() => filterDropdownItems(get(seriesCharsInGroup), (c) => c.display || c.tag, (c) => c.tag));
                        var fragment_3 = comment();
                        var node_6 = first_child(fragment_3);
                        {
                          var consequent_2 = ($$anchor9) => {
                            var div_17 = root_12();
                            var div_18 = child(div_17);
                            var text_8 = child(div_18);
                            var node_7 = sibling(div_18, 2);
                            each(node_7, 17, () => get(seriesChars), index, ($$anchor10, char) => {
                              const flatIdx = user_derived(() => get(charFlatList).indexOf(get(char)));
                              const isHighlighted = user_derived(() => get(flatIdx) === get(highlightedIndex));
                              var div_19 = root_13();
                              let classes_4;
                              var span_5 = child(div_19);
                              var text_9 = child(span_5);
                              action(div_19, ($$node, $$action_arg) => highlightScroll == null ? void 0 : highlightScroll($$node, $$action_arg), () => get(isHighlighted));
                              template_effect(
                                ($0) => {
                                  classes_4 = set_class(div_19, 1, "pcr-atb-mixer-option pcr-atb-char-option", null, classes_4, $0);
                                  set_text(text_9, get(char).display || get(char).tag);
                                },
                                [
                                  () => ({
                                    selected: get(selectedTags).has(get(char).tag),
                                    highlighted: get(isHighlighted)
                                  })
                                ]
                              );
                              delegated("click", div_19, (e) => {
                                e.stopPropagation();
                                handleAllCharacterClick(get(char).tag, get(char).display || get(char).tag);
                                set(openDropdownKey, null);
                              });
                              append($$anchor10, div_19);
                            });
                            template_effect(() => set_text(text_8, get(series).name));
                            append($$anchor9, div_17);
                          };
                          if_block(node_6, ($$render) => {
                            if (get(seriesChars).length > 0) $$render(consequent_2);
                          });
                        }
                        append($$anchor8, fragment_3);
                      });
                      action(div_16, ($$node) => positionDropdown == null ? void 0 : positionDropdown($$node));
                      append($$anchor7, div_16);
                    };
                    if_block(node_5, ($$render) => {
                      if (get(isCharOpen)) $$render(consequent_3);
                    });
                  }
                  template_effect(() => {
                    classes_2 = set_class(div_13, 1, "pcr-atb-mixer-group pcr-atb-char-category", null, classes_2, { open: get(isCharOpen) });
                    set_attribute(div_13, "data-group", get(group).name);
                  });
                  delegated("click", div_14, function(...$$args) {
                    var _a;
                    (_a = get(isCharOpen) ? null : (e) => {
                      e.stopPropagation();
                      toggleCharCategory(get(group).category);
                    }) == null ? void 0 : _a.apply(this, $$args);
                  });
                  append($$anchor6, div_13);
                });
                append($$anchor5, div_12);
              };
              var consequent_8 = ($$anchor5) => {
                var div_20 = root_14();
                each(div_20, 21, () => get(groups), index, ($$anchor6, group) => {
                  const propsInCategory = user_derived(() => (get(selections).props || []).filter((p) => p.category === get(group).category));
                  const selectedTagsSet = user_derived(() => new Set(get(propsInCategory).map((p) => p.prop)));
                  const propDisplayVal = user_derived(() => get(propsInCategory).length === 0 ? "Select" : get(propsInCategory).length === 1 ? get(propsInCategory)[0].display : `${get(propsInCategory).length} selected`);
                  const isPropsOpen = user_derived(() => get(openDropdownKey) === `props:${get(group).name}`);
                  const visiblePropItems = user_derived(() => get(isPropsOpen) ? filterDropdownItems(get(group).items, (i) => i.display || i.tag, (i) => i.tag) : []);
                  var div_21 = root_15();
                  let classes_5;
                  var div_22 = child(div_21);
                  var node_8 = child(div_22);
                  {
                    var consequent_5 = ($$anchor7) => {
                      var div_23 = root_16();
                      var input_2 = child(div_23);
                      action(input_2, ($$node) => focusOnMount == null ? void 0 : focusOnMount($$node));
                      var button_2 = sibling(input_2, 2);
                      template_effect(() => {
                        set_attribute(input_2, "placeholder", `Search ${get(group).display ?? ""}…`);
                        set_value(input_2, get(dropdownSearchQuery));
                      });
                      delegated("input", input_2, (e) => {
                        set(dropdownSearchQuery, e.target.value, true);
                      });
                      delegated("click", input_2, (e) => e.stopPropagation());
                      delegated("keydown", input_2, (e) => handleDropdownKey(e, get(visiblePropItems), (item) => {
                        set(openDropdownKey, null);
                        handleAllPropsClick(item.category || get(group).category, item.tag);
                      }));
                      delegated("click", button_2, (e) => {
                        e.stopPropagation();
                        set(openDropdownKey, null);
                      });
                      append($$anchor7, div_23);
                    };
                    var alternate_1 = ($$anchor7) => {
                      var fragment_4 = root_17();
                      var span_6 = first_child(fragment_4);
                      var text_10 = child(span_6);
                      var span_7 = sibling(span_6, 2);
                      let classes_6;
                      var text_11 = child(span_7);
                      template_effect(() => {
                        set_text(text_10, `${get(group).display ?? ""} (${get(group).items.length ?? ""})`);
                        classes_6 = set_class(span_7, 1, "pcr-atb-mixer-value", null, classes_6, { "has-value": get(propsInCategory).length > 0 });
                        set_text(text_11, get(propDisplayVal));
                      });
                      append($$anchor7, fragment_4);
                    };
                    if_block(node_8, ($$render) => {
                      if (get(isPropsOpen)) $$render(consequent_5);
                      else $$render(alternate_1, -1);
                    });
                  }
                  var node_9 = sibling(div_22, 2);
                  {
                    var consequent_7 = ($$anchor7) => {
                      var div_24 = root_18();
                      var div_25 = child(div_24);
                      var node_10 = sibling(div_25, 2);
                      each(node_10, 17, () => get(visiblePropItems), index, ($$anchor8, item, idx) => {
                        const isHighlighted = user_derived(() => idx === get(highlightedIndex));
                        var div_26 = root_19();
                        let classes_7;
                        var text_12 = child(div_26);
                        action(div_26, ($$node, $$action_arg) => highlightScroll == null ? void 0 : highlightScroll($$node, $$action_arg), () => get(isHighlighted));
                        template_effect(
                          ($0) => {
                            classes_7 = set_class(div_26, 1, "pcr-atb-mixer-option", null, classes_7, $0);
                            set_text(text_12, `${(get(item).display || get(item).tag) ?? ""}${get(item).is_customizable ? " ★" : ""}`);
                          },
                          [
                            () => ({
                              selected: get(selectedTagsSet).has(get(item).tag),
                              highlighted: get(isHighlighted)
                            })
                          ]
                        );
                        delegated("click", div_26, (e) => {
                          e.stopPropagation();
                          set(openDropdownKey, null);
                          handleAllPropsClick(get(item).category || get(group).category, get(item).tag);
                        });
                        append($$anchor8, div_26);
                      });
                      var node_11 = sibling(node_10, 2);
                      {
                        var consequent_6 = ($$anchor8) => {
                          var div_27 = root_20();
                          append($$anchor8, div_27);
                        };
                        if_block(node_11, ($$render) => {
                          if (get(visiblePropItems).length === 0) $$render(consequent_6);
                        });
                      }
                      action(div_24, ($$node) => positionDropdown == null ? void 0 : positionDropdown($$node));
                      delegated("click", div_25, (e) => {
                        e.stopPropagation();
                        get(selections).props = (get(selections).props || []).filter((p) => p.category !== get(group).category);
                        set(selections, { ...get(selections) }, true);
                        set(openDropdownKey, null);
                      });
                      append($$anchor7, div_24);
                    };
                    if_block(node_9, ($$render) => {
                      if (get(isPropsOpen)) $$render(consequent_7);
                    });
                  }
                  template_effect(() => {
                    classes_5 = set_class(div_21, 1, "pcr-atb-mixer-group", null, classes_5, { open: get(isPropsOpen) });
                    set_attribute(div_21, "data-group", get(group).name);
                  });
                  delegated("click", div_22, function(...$$args) {
                    var _a;
                    (_a = get(isPropsOpen) ? null : (e) => {
                      e.stopPropagation();
                      setOpenDropdown(`props:${get(group).name}`);
                    }) == null ? void 0 : _a.apply(this, $$args);
                  });
                  append($$anchor6, div_21);
                });
                append($$anchor5, div_20);
              };
              var consequent_9 = ($$anchor5) => {
                {
                  let $0 = user_derived(() => get(selections).clothing || {});
                  ClothingPanel($$anchor5, {
                    get groups() {
                      return get(groups);
                    },
                    get selections() {
                      return get($0);
                    },
                    get isNaturalMode() {
                      return get(isNaturalMode);
                    },
                    get searchQuery() {
                      return get(searchQuery);
                    },
                    onSelect: handleMixerSelect,
                    onOpenClothingCustomizer: handleOpenClothingCustomizer
                  });
                }
              };
              var alternate_2 = ($$anchor5) => {
                {
                  let $0 = user_derived(() => get(selections)[get(bucket)] || {});
                  let $1 = user_derived(() => mixerOpenGroupFor(get(bucket)));
                  let $2 = user_derived(() => get(bucket) === "action" ? handleOpenNsfwModal : null);
                  let $3 = user_derived(() => get(bucket) === "appearance" ? handleOpenFantasyCustomizer : null);
                  MixerGrid($$anchor5, {
                    get groups() {
                      return get(groups);
                    },
                    get bucket() {
                      return get(bucket);
                    },
                    get selections() {
                      return get($0);
                    },
                    get isNaturalMode() {
                      return get(isNaturalMode);
                    },
                    get searchQuery() {
                      return get(searchQuery);
                    },
                    get openGroup() {
                      return get($1);
                    },
                    onSetOpenGroup: (g) => setMixerOpenGroup(get(bucket), g),
                    get dropdownSearchQuery() {
                      return get(dropdownSearchQuery);
                    },
                    onSetDropdownSearchQuery: (q) => {
                      set(dropdownSearchQuery, q, true);
                    },
                    get highlightedIndex() {
                      return get(highlightedIndex);
                    },
                    onSetHighlightedIndex: (i) => {
                      set(highlightedIndex, i, true);
                    },
                    onSelect: handleAllSelect,
                    get onOpenNsfwModal() {
                      return get($2);
                    },
                    get onOpenFantasyCustomizer() {
                      return get($3);
                    }
                  });
                }
              };
              if_block(node_3, ($$render) => {
                if (get(bucket) === "characters") $$render(consequent_4);
                else if (get(bucket) === "props") $$render(consequent_8, 1);
                else if (get(bucket) === "clothing") $$render(consequent_9, 2);
                else $$render(alternate_2, -1);
              });
            }
            template_effect(() => {
              set_attribute(div_10, "data-bucket", get(bucket));
              set_text(text_4, get(info).icon);
              set_text(text_5, get(info).label);
            });
            append($$anchor4, div_10);
          };
          if_block(node_2, ($$render) => {
            if (get(groups).length > 0) $$render(consequent_10);
          });
        }
        append($$anchor3, fragment_1);
      });
      append($$anchor2, div_9);
    };
    var consequent_16 = ($$anchor2) => {
      var fragment_7 = comment();
      var node_12 = first_child(fragment_7);
      {
        var consequent_12 = ($$anchor3) => {
          var div_28 = root_24();
          var text_13 = child(div_28);
          template_effect(() => set_text(text_13, get(searchQuery) ? "No characters found" : "No characters in database"));
          append($$anchor3, div_28);
        };
        var alternate_4 = ($$anchor3) => {
          var div_29 = root_25();
          var div_30 = child(div_29);
          each(div_30, 21, () => get(characterCategories), index, ($$anchor4, category) => {
            const charCount = user_derived(() => get(category).series.reduce((sum, s) => sum + s.characters.length, 0));
            const selectedChars = user_derived(() => (get(selections).characters || []).filter((c) => get(category).series.some((s) => s.characters.some((ch) => ch.tag === c.tag))));
            const selectedCharTags = user_derived(() => new Set(get(selectedChars).map((c) => c.tag)));
            const charDisplayVal = user_derived(() => get(selectedChars).length === 0 ? "Select" : get(selectedChars).length === 1 ? get(selectedChars)[0].display : `${get(selectedChars).length} selected`);
            const isCatOpen = user_derived(() => get(openDropdownKey) === `char:${get(category).tag}`);
            const catFlatList = user_derived(() => get(isCatOpen) ? get(category).series.flatMap((s) => filterDropdownItems(s.characters, (c) => c.display || c.tag, (c) => c.tag)) : []);
            var div_31 = root_26();
            let classes_8;
            var div_32 = child(div_31);
            var node_13 = child(div_32);
            {
              var consequent_13 = ($$anchor5) => {
                var div_33 = root_27();
                var input_3 = child(div_33);
                action(input_3, ($$node) => focusOnMount == null ? void 0 : focusOnMount($$node));
                var button_3 = sibling(input_3, 2);
                template_effect(() => {
                  set_attribute(input_3, "placeholder", `Search ${get(category).name ?? ""}…`);
                  set_value(input_3, get(dropdownSearchQuery));
                });
                delegated("input", input_3, (e) => {
                  set(dropdownSearchQuery, e.target.value, true);
                });
                delegated("click", input_3, (e) => e.stopPropagation());
                delegated("keydown", input_3, (e) => handleDropdownKey(e, get(catFlatList), (char) => handleCharOptionClick(char.tag, char.display || char.tag)));
                delegated("click", button_3, (e) => {
                  e.stopPropagation();
                  set(openDropdownKey, null);
                });
                append($$anchor5, div_33);
              };
              var alternate_3 = ($$anchor5) => {
                var fragment_8 = root_28();
                var span_8 = first_child(fragment_8);
                var text_14 = child(span_8);
                var span_9 = sibling(span_8, 2);
                let classes_9;
                var text_15 = child(span_9);
                template_effect(() => {
                  set_text(text_14, `${get(category).name ?? ""} (${get(charCount) ?? ""})`);
                  classes_9 = set_class(span_9, 1, "pcr-atb-mixer-value", null, classes_9, { "has-value": get(selectedChars).length > 0 });
                  set_text(text_15, get(charDisplayVal));
                });
                append($$anchor5, fragment_8);
              };
              if_block(node_13, ($$render) => {
                if (get(isCatOpen)) $$render(consequent_13);
                else $$render(alternate_3, -1);
              });
            }
            var node_14 = sibling(div_32, 2);
            {
              var consequent_15 = ($$anchor5) => {
                var div_34 = root_29();
                each(div_34, 21, () => get(category).series, index, ($$anchor6, series) => {
                  const visibleChars = user_derived(() => filterDropdownItems(get(series).characters, (c) => c.display || c.tag, (c) => c.tag));
                  var fragment_9 = comment();
                  var node_15 = first_child(fragment_9);
                  {
                    var consequent_14 = ($$anchor7) => {
                      var div_35 = root_31();
                      var div_36 = child(div_35);
                      var text_16 = child(div_36);
                      var node_16 = sibling(div_36, 2);
                      each(node_16, 17, () => get(visibleChars), index, ($$anchor8, char) => {
                        const flatIdx = user_derived(() => get(catFlatList).indexOf(get(char)));
                        const isHighlighted = user_derived(() => get(flatIdx) === get(highlightedIndex));
                        var div_37 = root_32();
                        let classes_10;
                        var span_10 = child(div_37);
                        var text_17 = child(span_10);
                        action(div_37, ($$node, $$action_arg) => highlightScroll == null ? void 0 : highlightScroll($$node, $$action_arg), () => get(isHighlighted));
                        template_effect(
                          ($0) => {
                            classes_10 = set_class(div_37, 1, "pcr-atb-mixer-option pcr-atb-char-option", null, classes_10, $0);
                            set_text(text_17, get(char).display || get(char).tag);
                          },
                          [
                            () => ({
                              selected: get(selectedCharTags).has(get(char).tag),
                              highlighted: get(isHighlighted)
                            })
                          ]
                        );
                        delegated("click", div_37, (e) => {
                          e.stopPropagation();
                          handleCharOptionClick(get(char).tag, get(char).display || get(char).tag);
                        });
                        append($$anchor8, div_37);
                      });
                      template_effect(() => set_text(text_16, get(series).name));
                      append($$anchor7, div_35);
                    };
                    if_block(node_15, ($$render) => {
                      if (get(visibleChars).length > 0) $$render(consequent_14);
                    });
                  }
                  append($$anchor6, fragment_9);
                });
                action(div_34, ($$node) => positionDropdown == null ? void 0 : positionDropdown($$node));
                append($$anchor5, div_34);
              };
              if_block(node_14, ($$render) => {
                if (get(isCatOpen)) $$render(consequent_15);
              });
            }
            template_effect(() => {
              classes_8 = set_class(div_31, 1, "pcr-atb-mixer-group pcr-atb-char-category", null, classes_8, { open: get(isCatOpen) });
              set_attribute(div_31, "data-category", get(category).tag);
            });
            delegated("click", div_32, function(...$$args) {
              var _a;
              (_a = get(isCatOpen) ? null : (e) => {
                e.stopPropagation();
                toggleCharCategory(get(category).tag);
              }) == null ? void 0 : _a.apply(this, $$args);
            });
            append($$anchor4, div_31);
          });
          append($$anchor3, div_29);
        };
        if_block(node_12, ($$render) => {
          if (get(characterCategories).length === 0) $$render(consequent_12);
          else $$render(alternate_4, -1);
        });
      }
      append($$anchor2, fragment_7);
    };
    var consequent_24 = ($$anchor2) => {
      var fragment_10 = comment();
      var node_17 = first_child(fragment_10);
      {
        var consequent_21 = ($$anchor3) => {
          var div_38 = root_34();
          var div_39 = child(div_38);
          each(div_39, 21, () => get(propsSearchGroups), index, ($$anchor4, $$item) => {
            let cat = () => get($$item).category;
            let filteredProps = () => get($$item).props;
            const propsInCategory = user_derived(() => (get(selections).props || []).filter((p) => p.category === cat().category));
            const selectedPropTags = user_derived(() => new Set(get(propsInCategory).map((p) => p.prop)));
            const propDisplayVal = user_derived(() => get(propsInCategory).length === 0 ? "Select" : get(propsInCategory).length === 1 ? get(propsInCategory)[0].display : `${get(propsInCategory).length} selected`);
            const isSearchPropOpen = user_derived(() => get(openDropdownKey) === `props:${cat().category}`);
            const visibleFilteredProps = user_derived(() => get(isSearchPropOpen) ? filterDropdownItems(filteredProps(), (p) => p.display_name || p.prop_tag, (p) => p.prop_tag) : []);
            var div_40 = root_35();
            var div_41 = child(div_40);
            var span_11 = child(div_41);
            var text_18 = child(span_11);
            var text_19 = sibling(span_11, 1, true);
            var div_42 = sibling(div_41, 2);
            var div_43 = child(div_42);
            let classes_11;
            var div_44 = child(div_43);
            var node_18 = child(div_44);
            {
              var consequent_17 = ($$anchor5) => {
                var div_45 = root_36();
                var input_4 = child(div_45);
                action(input_4, ($$node) => focusOnMount == null ? void 0 : focusOnMount($$node));
                var button_4 = sibling(input_4, 2);
                template_effect(() => {
                  set_attribute(input_4, "placeholder", `Search ${cat().display_name ?? ""}…`);
                  set_value(input_4, get(dropdownSearchQuery));
                });
                delegated("input", input_4, (e) => {
                  set(dropdownSearchQuery, e.target.value, true);
                });
                delegated("click", input_4, (e) => e.stopPropagation());
                delegated("keydown", input_4, (e) => handleDropdownKey(e, get(visibleFilteredProps), (p) => {
                  set(openDropdownKey, null);
                  handleAllPropsClick(cat().category, p.prop_tag);
                }));
                delegated("click", button_4, (e) => {
                  e.stopPropagation();
                  set(openDropdownKey, null);
                });
                append($$anchor5, div_45);
              };
              var alternate_5 = ($$anchor5) => {
                var fragment_11 = root_37();
                var span_12 = first_child(fragment_11);
                var text_20 = child(span_12);
                var span_13 = sibling(span_12, 2);
                let classes_12;
                var text_21 = child(span_13);
                template_effect(() => {
                  set_text(text_20, `${cat().icon ?? ""} ${cat().display_name ?? ""}`);
                  classes_12 = set_class(span_13, 1, "pcr-atb-mixer-value", null, classes_12, { "has-value": get(propsInCategory).length > 0 });
                  set_text(text_21, get(propDisplayVal));
                });
                append($$anchor5, fragment_11);
              };
              if_block(node_18, ($$render) => {
                if (get(isSearchPropOpen)) $$render(consequent_17);
                else $$render(alternate_5, -1);
              });
            }
            var node_19 = sibling(div_44, 2);
            {
              var consequent_19 = ($$anchor5) => {
                var div_46 = root_38();
                var div_47 = child(div_46);
                var node_20 = sibling(div_47, 2);
                each(node_20, 17, () => get(visibleFilteredProps), index, ($$anchor6, p, idx) => {
                  const isHighlighted = user_derived(() => idx === get(highlightedIndex));
                  var div_48 = root_39();
                  let classes_13;
                  var text_22 = child(div_48);
                  action(div_48, ($$node, $$action_arg) => highlightScroll == null ? void 0 : highlightScroll($$node, $$action_arg), () => get(isHighlighted));
                  template_effect(
                    ($0) => {
                      classes_13 = set_class(div_48, 1, "pcr-atb-mixer-option", null, classes_13, $0);
                      set_text(text_22, `${(get(p).display_name || get(p).prop_tag) ?? ""}${get(p).is_customizable ? " ★" : ""}`);
                    },
                    [
                      () => ({
                        selected: get(selectedPropTags).has(get(p).prop_tag),
                        highlighted: get(isHighlighted)
                      })
                    ]
                  );
                  delegated("click", div_48, (e) => {
                    e.stopPropagation();
                    set(openDropdownKey, null);
                    handleAllPropsClick(cat().category, get(p).prop_tag);
                  });
                  append($$anchor6, div_48);
                });
                var node_21 = sibling(node_20, 2);
                {
                  var consequent_18 = ($$anchor6) => {
                    var div_49 = root_40();
                    append($$anchor6, div_49);
                  };
                  if_block(node_21, ($$render) => {
                    if (get(visibleFilteredProps).length === 0) $$render(consequent_18);
                  });
                }
                action(div_46, ($$node) => positionDropdown == null ? void 0 : positionDropdown($$node));
                delegated("click", div_47, (e) => {
                  e.stopPropagation();
                  get(selections).props = (get(selections).props || []).filter((p) => p.category !== cat().category);
                  set(selections, { ...get(selections) }, true);
                  set(openDropdownKey, null);
                });
                append($$anchor5, div_46);
              };
              if_block(node_19, ($$render) => {
                if (get(isSearchPropOpen)) $$render(consequent_19);
              });
            }
            template_effect(() => {
              set_text(text_18, cat().icon);
              set_text(text_19, cat().display_name);
              classes_11 = set_class(div_43, 1, "pcr-atb-mixer-group", null, classes_11, { open: get(isSearchPropOpen) });
              set_attribute(div_43, "data-group", `_props_${cat().category ?? ""}`);
            });
            delegated("click", div_44, function(...$$args) {
              var _a;
              (_a = get(isSearchPropOpen) ? null : (e) => {
                e.stopPropagation();
                setOpenDropdown(`props:${cat().category}`);
              }) == null ? void 0 : _a.apply(this, $$args);
            });
            append($$anchor4, div_40);
          });
          var node_22 = sibling(div_39, 2);
          {
            var consequent_20 = ($$anchor4) => {
              var div_50 = root_41();
              var div_51 = sibling(child(div_50), 2);
              each(div_51, 21, () => get(selections).props, index, ($$anchor5, prop2, idx) => {
                var div_52 = root_42();
                var span_14 = child(div_52);
                var text_23 = child(span_14);
                var span_15 = sibling(span_14, 2);
                template_effect(() => set_text(text_23, get(prop2).display));
                delegated("click", span_15, () => removeProp(idx));
                append($$anchor5, div_52);
              });
              append($$anchor4, div_50);
            };
            if_block(node_22, ($$render) => {
              if ((get(selections).props || []).length > 0) $$render(consequent_20);
            });
          }
          append($$anchor3, div_38);
        };
        var consequent_22 = ($$anchor3) => {
          var div_53 = root_43();
          var text_24 = child(div_53);
          template_effect(() => set_text(text_24, `No props found matching "${get(searchQuery) ?? ""}"`));
          append($$anchor3, div_53);
        };
        var alternate_6 = ($$anchor3) => {
          var div_54 = root_44();
          var div_55 = child(div_54);
          each(div_55, 21, () => {
            var _a;
            return ((_a = cache.propsData) == null ? void 0 : _a.categories) || [];
          }, index, ($$anchor4, cat) => {
            var button_5 = root_45();
            var text_25 = child(button_5);
            template_effect(() => set_text(text_25, `${get(cat).icon ?? ""} ${get(cat).display_name ?? ""}`));
            delegated("click", button_5, () => handlePropsCategoryClick(get(cat).category));
            append($$anchor4, button_5);
          });
          var node_23 = sibling(div_55, 2);
          {
            var consequent_23 = ($$anchor4) => {
              var div_56 = root_46();
              var div_57 = sibling(child(div_56), 2);
              each(div_57, 21, () => get(selections).props, index, ($$anchor5, prop2, idx) => {
                var div_58 = root_47();
                var span_16 = child(div_58);
                var text_26 = child(span_16);
                var span_17 = sibling(span_16, 2);
                template_effect(() => set_text(text_26, get(prop2).display));
                delegated("click", span_17, () => removeProp(idx));
                append($$anchor5, div_58);
              });
              append($$anchor4, div_56);
            };
            if_block(node_23, ($$render) => {
              if ((get(selections).props || []).length > 0) $$render(consequent_23);
            });
          }
          append($$anchor3, div_54);
        };
        if_block(node_17, ($$render) => {
          if (get(searchQuery) && get(propsSearchGroups).length > 0) $$render(consequent_21);
          else if (get(searchQuery)) $$render(consequent_22, 1);
          else $$render(alternate_6, -1);
        });
      }
      append($$anchor2, fragment_10);
    };
    var consequent_25 = ($$anchor2) => {
      {
        let $0 = user_derived(() => tabData[get(activeTab)] || cache[get(activeTab)] || []);
        let $1 = user_derived(() => get(selections).clothing || {});
        ClothingPanel($$anchor2, {
          get groups() {
            return get($0);
          },
          get selections() {
            return get($1);
          },
          get isNaturalMode() {
            return get(isNaturalMode);
          },
          get searchQuery() {
            return get(searchQuery);
          },
          onSelect: handleMixerSelect,
          onOpenClothingCustomizer: handleOpenClothingCustomizer
        });
      }
    };
    var alternate_7 = ($$anchor2) => {
      {
        let $0 = user_derived(() => tabData[get(activeTab)] || cache[get(activeTab)] || []);
        let $1 = user_derived(() => get(selections)[get(activeTab)] || {});
        let $2 = user_derived(() => mixerOpenGroupFor(get(activeTab)));
        let $3 = user_derived(() => get(activeTab) === "action" ? handleOpenNsfwModal : null);
        let $4 = user_derived(() => get(activeTab) === "appearance" ? handleOpenFantasyCustomizer : null);
        MixerGrid($$anchor2, {
          get groups() {
            return get($0);
          },
          get bucket() {
            return get(activeTab);
          },
          get selections() {
            return get($1);
          },
          get isNaturalMode() {
            return get(isNaturalMode);
          },
          get searchQuery() {
            return get(searchQuery);
          },
          get openGroup() {
            return get($2);
          },
          onSetOpenGroup: (g) => setMixerOpenGroup(get(activeTab), g),
          get dropdownSearchQuery() {
            return get(dropdownSearchQuery);
          },
          onSetDropdownSearchQuery: (q) => {
            set(dropdownSearchQuery, q, true);
          },
          get highlightedIndex() {
            return get(highlightedIndex);
          },
          onSetHighlightedIndex: (i) => {
            set(highlightedIndex, i, true);
          },
          onSelect: handleMixerSelect,
          get onOpenNsfwModal() {
            return get($3);
          },
          get onOpenFantasyCustomizer() {
            return get($4);
          }
        });
      }
    };
    if_block(node_1, ($$render) => {
      if (get(loading)) $$render(consequent);
      else if (get(activeTab) === "all") $$render(consequent_11, 1);
      else if (get(activeTab) === "characters") $$render(consequent_16, 2);
      else if (get(activeTab) === "props") $$render(consequent_24, 3);
      else if (get(activeTab) === "clothing") $$render(consequent_25, 4);
      else $$render(alternate_7, -1);
    });
  }
  var node_24 = sibling(div_3, 2);
  SelectionPreview(node_24, {
    get selections() {
      return get(selections);
    },
    get cache() {
      return cache;
    },
    onRemove: handleRemove,
    onEdit: handleEditBubble
  });
  var div_59 = sibling(node_24, 2);
  var div_60 = child(div_59);
  var label = child(div_60);
  var input_5 = child(label);
  var label_1 = sibling(label, 2);
  var input_6 = child(label_1);
  var div_61 = sibling(div_60, 2);
  var button_6 = child(div_61);
  var button_7 = sibling(button_6, 2);
  var node_25 = sibling(div, 2);
  {
    var consequent_26 = ($$anchor2) => {
      {
        let $0 = user_derived(() => (get(selections).characters || []).find((c) => c.tag === get(characterModalTag)) || null);
        CharacterModal($$anchor2, {
          get characterTag() {
            return get(characterModalTag);
          },
          get characterDisplay() {
            return get(characterModalDisplay);
          },
          get existing() {
            return get($0);
          },
          get cache() {
            return cache;
          },
          onConfirm: handleCharacterSelected,
          onCancel: () => {
            set(showCharacterModal, false);
          }
        });
      }
    };
    if_block(node_25, ($$render) => {
      if (get(showCharacterModal)) $$render(consequent_26);
    });
  }
  var node_26 = sibling(node_25, 2);
  {
    var consequent_27 = ($$anchor2) => {
      PropsCustomizerModal($$anchor2, {
        get category() {
          return get(propsModalCategory);
        },
        get propsData() {
          return cache.propsData;
        },
        get preSelectedProp() {
          return get(propsModalPreSelected);
        },
        get isNaturalMode() {
          return get(isNaturalMode);
        },
        onConfirm: handlePropConfirm,
        onCancel: () => {
          set(showPropsModal, false);
        }
      });
    };
    if_block(node_26, ($$render) => {
      if (get(showPropsModal) && cache.propsData) $$render(consequent_27);
    });
  }
  var node_27 = sibling(node_26, 2);
  {
    var consequent_28 = ($$anchor2) => {
      {
        let $0 = user_derived(() => get(selections).nsfw_action || {});
        NsfwActionModal($$anchor2, {
          get groups() {
            return get(nsfwModalGroups);
          },
          get currentSelections() {
            return get($0);
          },
          onConfirm: handleNsfwConfirm,
          onCancel: () => {
            set(showNsfwModal, false);
          }
        });
      }
    };
    if_block(node_27, ($$render) => {
      if (get(showNsfwModal)) $$render(consequent_28);
    });
  }
  var node_28 = sibling(node_27, 2);
  {
    var consequent_29 = ($$anchor2) => {
      ClothingCustomizer($$anchor2, {
        get itemInfo() {
          return get(clothingCustomizerItem);
        },
        onConfirm: handleClothingConfirm,
        onCancel: handleClothingCancel
      });
    };
    if_block(node_28, ($$render) => {
      if (get(showClothingCustomizer) && get(clothingCustomizerItem)) $$render(consequent_29);
    });
  }
  var node_29 = sibling(node_28, 2);
  {
    var consequent_30 = ($$anchor2) => {
      FantasyCustomizer($$anchor2, {
        get itemInfo() {
          return get(fantasyCustomizerItem);
        },
        onConfirm: handleFantasyConfirm,
        onCancel: handleFantasyCancel
      });
    };
    if_block(node_29, ($$render) => {
      if (get(showFantasyCustomizer) && get(fantasyCustomizerItem)) $$render(consequent_30);
    });
  }
  template_effect(() => {
    classes = set_class(button, 1, "pcr-atb-search-clear", null, classes, { hidden: !get(searchQuery) });
    set_checked(input_5, !get(isNaturalMode));
    set_checked(input_6, get(isNaturalMode));
  });
  delegated("input", input, handleSearchInput);
  bind_value(input, () => get(searchQuery), ($$value) => set(searchQuery, $$value));
  delegated("click", button, clearSearch);
  delegated("change", input_5, () => {
    set(isNaturalMode, false);
    onPromptStyleChange()("tags");
  });
  delegated("change", input_6, () => {
    set(isNaturalMode, true);
    onPromptStyleChange()("natural");
  });
  delegated("click", button_6, function(...$$args) {
    var _a;
    (_a = onClose()) == null ? void 0 : _a.apply(this, $$args);
  });
  delegated("click", button_7, handleInsert);
  append($$anchor, fragment);
  pop();
}
delegate(["input", "click", "keydown", "change"]);
function mountTagBuilder(target, props) {
  return mount(TagBuilder, { target, props });
}
function destroyTagBuilder(instance) {
  if (instance) unmount(instance);
}
export {
  destroyTagBuilder,
  mountTagBuilder
};
//# sourceMappingURL=promptchain-tag-builder.js.map
