import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { NODE_TYPE, CONFIG } from "./config.js";
import { isPromptChain, getSourceNode, getConnectedInputs, hasCustomTitle, getLinkInfo } from "./slot-utils.js";
import { getSwitchOptions, getSelfLabelOptions, getNodePromptContent } from "./label-utils.js";
import { loadCodeMirror, createEditor, setEditorContent, resetEditorContent } from "./editor.js";
import { updateInputLabels } from "./order-chain.js";
import { createHighlightExtension } from "./active-label-highlight.js";
import { createWildcardBadgeExtension } from "./wildcard-badge.js";
import { activateTagAutocomplete } from "./autocomplete.js";
import { openPopup, createSearchableList, closeActivePopup, isPopupOpen, positionPopup } from "./popup-menu.js";
import { getWildcardMode, setWildcardMode } from "./wildcard-dropdown.js";
import { buildTree, findRoot, findAllRoots, flattenTree, stampInactive, isDescendant } from "./tree-utils.js";
import { getWorkflowId } from "./workflow-id.js";
import { fetchWorkflowImages, fetchWorkflowCount, subscribe, invalidateCache, getCachedImages } from "./history.js";
import { openViewer } from "./viewer-bridge.js";
import { ensureSvelteCSS } from "./lazy-load.js";

let svelteModule = null;
let instance = null;
let state = null;
let overlay = null;
let highlight = null;
let wildcardBadge = null;
let syncTimer = null;
let cleanupFns = [];
let rootNode = null;
let rootRelocated = null;
let rootToggleCleanups = [];
let relocated = null; // footer relocation tracking
let treeRefreshTimer = null;
let outputFontSize = CONFIG.defaultFontSize;
// Global editor font size for the fullscreen overlay. Ctrl+wheel on any
// pane updates it; every pane reflects it via the --pcr-font-size CSS var.
// Seeded from root.properties.pcrFsFontSize on mount, written back in
// captureFsState so the zoom level survives session reload.
let fsFontSize = CONFIG.defaultFontSize;
let wildcardSaveTimer = null;
let outputBtn = null;
let imageBtn = null;
let poseBtn = null;
let cmModule = null; // loaded CodeMirror module — needed by createGroupEditor after initial show

// Pane groups. Phase A: always exactly one group. Phase B will introduce
// splits and inter-group tab drag. Each group owns its own CM6 editor view
// plus the node/wildcard it currently has loaded. Operations driven by UI
// (tree click, tab select, keyboard) target `focusedGroup`; editor-driven
// callbacks (onChange, onUpdate) close over the owning `group` reference
// so they route correctly once there's more than one group.
let nextGroupId = 1;
let groups = [];
let focusedGroup = null;

// Node types whose execution should anchor the fullscreen preview to the
// PromptChain feeding them. Mirrored from main.js — the canonical set.
const KSAMPLER_TYPES = new Set([
  "KSampler", "KSamplerAdvanced", "PromptChain_RegionalDetailer", "SamplerCustomAdvanced", "UltimateSDUpscale", "UltimateSDUpscaleNoUpscale",
  "PromptChain_IdeogramSampler",
]);

// Workflow-level fullscreen state stash. The preview panels are
// conceptually a workflow-level singleton — they show whatever this
// workflow most recently generated — so their open/closed state and the
// anchor node id live in graph.extra (serialized with the workflow),
// not on any individual PromptChain node's properties.
function getWfFs() {
  if (!app.graph) return null;
  if (!app.graph.extra) app.graph.extra = {};
  if (!app.graph.extra.promptchain) app.graph.extra.promptchain = {};
  if (!app.graph.extra.promptchain.fs) app.graph.extra.promptchain.fs = {};
  return app.graph.extra.promptchain.fs;
}

// Walk forward from a PromptChain through output links; true if any
// downstream node is a KSampler/Sampler. Used to pick a fullscreen
// anchor when no prior generation has happened yet — preview should
// follow a node that's wired to actually generate.
function hasDownstreamKSampler(start, visited = new Set()) {
  if (!start || visited.has(start.id)) return false;
  visited.add(start.id);
  for (const output of start.outputs || []) {
    for (const linkId of output.links || []) {
      const link = getLinkInfo(linkId);
      if (!link) continue;
      const target = app.graph?.getNodeById(link.target_id);
      if (!target) continue;
      if (KSAMPLER_TYPES.has(target.comfyClass || target.type)) return true;
      if (hasDownstreamKSampler(target, visited)) return true;
    }
  }
  return false;
}

// Resolve which PromptChain root the fullscreen preview panels should
// anchor to. Preference order: stored activeOutputNodeId (last node to
// generate), first PromptChain with a wired-up KSampler downstream,
// finally the entry node's root as a last resort.
function pickFsAnchor(entryNode) {
  const wf = getWfFs();
  if (wf?.activeOutputNodeId != null) {
    const stored = app.graph?.getNodeById?.(wf.activeOutputNodeId);
    if (stored && isPromptChain(stored)) return findRoot(stored);
  }
  for (const n of app.graph?._nodes || []) {
    if (!isPromptChain(n)) continue;
    if (hasDownstreamKSampler(n)) return findRoot(n);
  }
  return findRoot(entryNode);
}

// Push workflow-level fullscreen state into the anchor's properties
// just before relocateRootPanels runs so its existing per-property
// read-and-apply logic gets the right values. The anchor changes when
// generation moves between PromptChains; the workflow-level stash is
// what carries open/closed state across anchor swaps.
function applyWfFsToProps(root) {
  const wf = getWfFs();
  if (!wf || !root?.properties) return;
  const props = root.properties;
  if (wf.imageOpen != null) props.pcrFsImagePreview = wf.imageOpen;
  if (wf.poseOpen != null) props.pcrFsPosePanel = wf.poseOpen;
  if (wf.outputOpen != null) props.pcrFsOutputPanel = wf.outputOpen;
  if (wf.imagePanelWidth != null) props.pcrFsImagePanelWidth = wf.imagePanelWidth;
  if (wf.posePanelWidth != null) props.pcrFsPosePanelWidth = wf.posePanelWidth;
  if (wf.panelHeight != null) props.pcrFsPanelHeight = wf.panelHeight;
  if (wf.outputTab != null) props.pcrFsOutputTab = wf.outputTab;
  if (wf.outputFontSize != null) props.pcrFsOutputFontSize = wf.outputFontSize;
  if (wf.galleryRowHeight != null) props.pcrFsGalleryRowHeight = wf.galleryRowHeight;
  if (wf.galleryViewMode != null) props.pcrFsGalleryViewMode = wf.galleryViewMode;
  if (wf.panelMaximized != null) props.pcrFsPanelMaximized = wf.panelMaximized;
}

function captureWfFsFromAnchor() {
  const wf = getWfFs();
  if (!wf || !rootNode) return;
  const props = rootNode.properties || {};
  if (rootNode._pcrImagePanel) wf.imageOpen = rootNode._pcrImagePanel.getIsVisible();
  if (rootNode._pcrPosePanel) wf.poseOpen = rootNode._pcrPosePanel.getIsVisible();
  if (rootNode._pcrOutputPanel) wf.outputOpen = rootNode._pcrOutputPanel.getIsOpen();
  if (props.pcrFsImagePanelWidth != null) wf.imagePanelWidth = props.pcrFsImagePanelWidth;
  if (props.pcrFsPosePanelWidth != null) wf.posePanelWidth = props.pcrFsPosePanelWidth;
  if (props.pcrFsPanelHeight != null) wf.panelHeight = props.pcrFsPanelHeight;
  if (props.pcrFsOutputTab != null) wf.outputTab = props.pcrFsOutputTab;
  if (props.pcrFsOutputFontSize != null) wf.outputFontSize = props.pcrFsOutputFontSize;
  if (props.pcrFsGalleryRowHeight != null) wf.galleryRowHeight = props.pcrFsGalleryRowHeight;
  if (props.pcrFsGalleryViewMode != null) wf.galleryViewMode = props.pcrFsGalleryViewMode;
  if (props.pcrFsPanelMaximized != null) wf.panelMaximized = props.pcrFsPanelMaximized;
}

function createGroup(mountEl) {
  return {
    id: nextGroupId++,
    mountEl,
    editorView: null,
    activeNode: null,
    activeWildcardTab: null,
  };
}

function destroyGroup(group) {
  if (group.editorView) { group.editorView.destroy(); group.editorView = null; }
  group.activeNode = null;
  group.activeWildcardTab = null;
  group.mountEl = null;
}

// Create the CM6 editor inside this group's mount point and wire up
// per-group callbacks. Callbacks close over `group` (not focusedGroup)
// so editor-initiated events (onChange, labelClick, wildcard dbl-click)
// route to the correct group even when the user has focused another.
function createGroupEditor(group, mountEl, initialTab) {
  if (!cmModule) return;
  group.mountEl = mountEl;

  const tabNode = (initialTab && initialTab.type !== "wildcard") ? initialTab.node : null;
  const tabWildcard = initialTab?.type === "wildcard" ? initialTab.wildcardName : null;
  if (tabNode) group.activeNode = tabNode;
  if (tabWildcard) group.activeWildcardTab = tabWildcard;
  const initialText = tabNode?.widgets?.find(w => w.name === "prompt")?.value || "";

  mountEl.style.setProperty("--pcr-font-size", `${fsFontSize}px`);
  mountEl._pcrNode = tabNode;

  group.editorView = createEditor(
    mountEl,
    initialText,
    () => {
      if (group.activeWildcardTab) { debouncedWildcardSave(); return; }
      debouncedSync();
      debouncedTreeRefresh();
      group.activeNode?._pcrFooter?.updateWordCount?.();
      group.activeNode?._pcrFooter?.updatePosNeg?.();
    },
    (update) => {
      if (update.selectionSet) group.activeNode?._pcrFooter?.updatePosNeg?.();
      if (update.focusChanged) {
        group.activeNode?._pcrFooter?.setFocused?.(update.view.hasFocus);
        // Route CM6-captured pointerdowns into our focused-group tracking.
        // The column's onpointerdown handler doesn't fire for clicks inside
        // the editor body because CM6 stops propagation; relying on the
        // editor's own focus event is the only signal that always arrives.
        if (update.view.hasFocus && group !== focusedGroup) {
          focusedGroup = group;
          if (group.activeNode) {
            // Preview panels stay anchored to the last-generated node;
            // focus only moves the per-node text concerns (footer, AI).
            relocateFooter(group.activeNode);
            relocateAiAssistant(group.activeNode, group);
          }
          overlay?._pcrNotifyFocusChange?.(group.id);
        }
      }
      group.activeNode?._pcrFooter?.updateErrors?.();
    },
    [highlight.extension, ...(wildcardBadge ? wildcardBadge.extension : [])],
    (labelIndex) => {
      // In a wildcard tab there's no node.pcrSwitchIndex to write — the
      // switch for a wildcard lives as pcrWildcardModes on whichever node
      // references it, and multiple nodes can reference the same file.
      // Move the visible green bar locally; persistence to an owner node
      // is deferred until we track a tab's owning node.
      if (group.activeWildcardTab) {
        if (!group.editorView || !highlight) return false;
        highlight.setHighlightState(group.editorView, { mode: "switch", switchIndex: labelIndex });
        return true;
      }
      if (!group.activeNode) return false;
      const mode = group.activeNode.properties?.pcrMode;
      if (mode !== "switch" && mode !== "iterate") return false;
      if (!group.activeNode.properties) group.activeNode.properties = {};
      // In fullscreen, relocateFooter rebinds node._pcrEditor to the overlay
      // editorView, so getSwitchOptions reads fresh labels. But fullscreen's
      // onChange only calls debouncedSync + debouncedTreeRefresh — it skips
      // updateModeDisplay, so _pcrLastOptionsKey stays frozen to the
      // pre-edit label list. When we mutate pcrSwitchIndex and trigger
      // syncShared, labelsChanged comes up true (fresh options vs stale
      // key) and the label-name reconciler finds _pcrSelectedLabelName
      // ("Tifa") in the new options and reverts our switch back to it.
      // Pre-set the remembered label to the target so the reconciler's
      // `atIndex.label !== remembered` check is false and it skips.
      // Also push the widget value through so graph save serialization
      // reflects the new text.
      const overlayText = group.editorView.state.doc.toString();
      const pw = group.activeNode.widgets?.find(w => w.name === "prompt");
      if (pw) pw.value = overlayText;
      if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
      const targetLabel = getSwitchOptions(group.activeNode).find(o => o.index === labelIndex)?.label;
      if (targetLabel) group.activeNode._pcrSelectedLabelName = targetLabel;
      group.activeNode.properties.pcrMode = "switch";
      group.activeNode.properties.pcrSwitchIndex = labelIndex;
      const modeWidget = group.activeNode.widgets?.find(w => w.name === "mode");
      if (modeWidget) modeWidget.value = "switch";
      const siWidget = group.activeNode.widgets?.find(w => w.name === "switch_index");
      if (siWidget) siWidget.value = labelIndex;
      group.activeNode._pcrMenubar?.updateModeDisplay?.();
      // Move the editor's green active-label bar to the new line. The
      // node-form path does this via node._pcrMenubar.setMode which
      // calls syncHighlight internally; fullscreen has to dispatch the
      // highlight effect here or the bar never moves.
      if (highlight) {
        highlight.setHighlightState(group.editorView, { mode: "switch", switchIndex: labelIndex });
      }
      state.treeRoots = computeTreeRoots();
      return true;
    },
    (wildcardName) => {
      if (!group.editorView) return;
      // Capture the source node (whichever node's prompt contained the
      // `__wildcard__` reference we're about to open) BEFORE the editor
      // content is swapped. Its pcrWildcardModes tells us the active
      // switch index for this wildcard, so we can place the green
      // active-label bar on the matching label line in the wildcard file.
      const sourceNode = group.activeNode;
      const wcMode = sourceNode ? getWildcardMode(sourceNode, wildcardName) : { mode: "randomize", index: 0 };
      fetch(`/promptchain/wildcard/content?name=${encodeURIComponent(wildcardName)}`)
        .then(r => r.json())
        .then(data => {
          if (data.error) return;
          const filename = data.filename || wildcardName;
          flushEditorSync();
          if (group.activeWildcardTab && group.activeWildcardTab !== wildcardName) {
            saveWildcardContent(group.activeWildcardTab, group.editorView.state.doc.toString());
          }
          group.activeNode = null;
          group.activeWildcardTab = wildcardName;
          if (group === focusedGroup) restoreFooter();
          overlay?._pcrAddWildcardTab?.(wildcardName, filename);
          resetEditorContent(group.editorView, data.content || "");
          if (highlight) {
            const switchIndex = (wcMode.mode === "switch" && wcMode.index > 0) ? wcMode.index : 0;
            const mode = switchIndex > 0 ? "switch" : "combine";
            highlight.setHighlightState(group.editorView, { mode, switchIndex });
          }
          if (wildcardBadge) { wildcardBadge.setNode(null); wildcardBadge.refreshBadges(group.editorView); }
          if (group.mountEl) group.mountEl._pcrNode = null;
        })
        .catch(() => {});
    },
  );

  if (highlight && tabNode) {
    const mode = tabNode.properties?.pcrMode || "switch";
    const switchIndex = tabNode.properties?.pcrSwitchIndex ?? 0;
    highlight.setHighlightState(group.editorView, { mode, switchIndex });
  }
  if (wildcardBadge) {
    wildcardBadge.setNode(tabNode);
    wildcardBadge.refreshBadges(group.editorView);
  }
  try { activateTagAutocomplete(cmModule, group.editorView); } catch {}
}

async function loadModule() {
  if (svelteModule) return svelteModule;
  ensureSvelteCSS();
  svelteModule = await import("./svelte/promptchain-fullscreen.js");
  return svelteModule;
}

function computeTreeRoots() {
  return findAllRoots().map(r => {
    const tree = buildTree(r);
    stampInactive(tree);
    stampParentRefs(tree, null);
    return tree;
  });
}

function flattenAllTrees(roots) {
  return roots.flatMap(t => flattenTree(t));
}

function getUpstream(startNode, visited = new Set()) {
  const result = [];
  if (visited.has(startNode.id)) return result;
  visited.add(startNode.id);
  for (const input of startNode.inputs || []) {
    if (input.link == null) continue;
    const linkInfo = getLinkInfo(input.link);
    if (!linkInfo) continue;
    const source = app.graph?.getNodeById?.(linkInfo.origin_id);
    if (source && isPromptChain(source)) {
      result.push(source);
      result.push(...getUpstream(source, visited));
    }
  }
  return result;
}

// ── DOM relocation (ported from fullscreen-editor.js) ────────────────────────

function savePosition(el) {
  if (!el) return null;
  return { el, parent: el.parentElement, next: el.nextSibling };
}

function restorePosition(saved) {
  if (!saved?.el || !saved.parent) return;
  if (saved.next && saved.next.parentElement === saved.parent) {
    saved.parent.insertBefore(saved.el, saved.next);
  } else {
    saved.parent.appendChild(saved.el);
  }
}

function relocateRootPanels(root) {
  const widget = root.widgets?.find(w => w.name === "pcr_editor");
  const container = widget?.element;
  if (!container || !overlay) return;

  // Output panel relocates into the editor area (flex-column: panes on
  // top, panel below) so the panel spans every pane and the resize
  // handle's parentElement.clientHeight calculation works correctly.
  // Image panel is a sibling of editor-area inside .pcr-fs-main so it
  // spans the full height on the right, not just the editor row.
  const editorArea = overlay.querySelector(".pcr-fs-editor-area");
  const mainEl = overlay.querySelector(".pcr-fs-main");
  if (!editorArea || !mainEl) return;

  const saves = {};
  if (!root.properties) root.properties = {};

  // snapshot node-mode panel properties for restore on exit
  // Output tab is intentionally not snapshotted — fullscreen writes to
  // pcrFsOutputTab via setPersistKey, so pcrOutputTab stays untouched and
  // doesn't need restoring.
  saves.nodeModeProps = {
    pcrOutputPanel: root.properties.pcrOutputPanel,
    pcrPanelHeight: root.properties.pcrPanelHeight,
    pcrPanelMaximized: root.properties.pcrPanelMaximized,
    pcrImagePreview: root.properties.pcrImagePreview,
    pcrImagePanelWidth: root.properties.pcrImagePanelWidth,
    pcrGalleryRowHeight: root.properties.pcrGalleryRowHeight,
    pcrGalleryViewMode: root.properties.pcrGalleryViewMode,
    pcrOutputFontSize: root.properties.pcrOutputFontSize,
    pcrPosePanel: root.properties.pcrPosePanel,
    pcrPosePanelWidth: root.properties.pcrPosePanelWidth,
  };
  saves.imagePanelVisible = root._pcrImagePanel?.getIsVisible?.() ?? false;
  saves.posePanelVisible = root._pcrPosePanel?.getIsVisible?.() ?? false;

  // output panel — lives under .pcr-node-content, not .pcr-editor-frame
  const nodeContent = container.querySelector(".pcr-node-content");
  if (root._pcrOutputPanel && nodeContent) {
    const handle = nodeContent.querySelector(".pcr-output-panel-resize");
    const panel = nodeContent.querySelector(".pcr-output-panel");
    if (handle && panel) {
      saves.outputHandle = savePosition(handle);
      saves.outputPanel = savePosition(panel);
      saves.outputPanelDomHeight = panel.style.height;
      editorArea.appendChild(handle);
      editorArea.appendChild(panel);
    }
  }

  // image panel
  const nodeRow = container.querySelector(".pcr-editor-row");
  if (root._pcrImagePanel && nodeRow) {
    const divider = nodeRow.querySelector(".pcr-image-divider");
    const panel = nodeRow.querySelector(".pcr-image-panel");
    if (panel) {
      saves.imagePanelDomWidth = panel.style.width;
      if (divider) {
        saves.imageDivider = savePosition(divider);
        mainEl.appendChild(divider);
      }
      saves.imagePanel = savePosition(panel);
      mainEl.appendChild(panel);
    }
  }

  // 3D Poser panel — left edge of .pcr-fs-main (mirrors its leftmost spot in
  // the node editor row). Relocated regardless of open/closed; the docked Poser
  // viewport rides along as a child of the panel body.
  if (root._pcrPosePanel && nodeRow) {
    const divider = nodeRow.querySelector(".pcr-pose-divider");
    const panel = nodeRow.querySelector(".pcr-pose-panel");
    if (panel) {
      saves.posePanelDomWidth = panel.style.width;
      saves.posePanel = savePosition(panel);
      mainEl.insertBefore(panel, mainEl.firstChild);
      if (divider) {
        saves.poseDivider = savePosition(divider);
        mainEl.insertBefore(divider, panel.nextSibling); // between panel and editor-area
      }
    }
  }

  // AI assistant panel is relocated per FOCUSED node (not per root) by
  // relocateAiAssistant — see hookups inside CM focus / tab switch /
  // group focus handlers. Skipped here so root-level swaps don't fight
  // the per-pane logic.

  rootRelocated = saves;
  rootNode = root;

  // apply fullscreen-specific panel state
  const props = root.properties;
  if (props.pcrFsImagePanelWidth != null && rootRelocated.imagePanel?.el) {
    rootRelocated.imagePanel.el.style.width = `${props.pcrFsImagePanelWidth}px`;
    props.pcrImagePanelWidth = props.pcrFsImagePanelWidth;
  }
  if (root._pcrImagePanel && props.pcrFsImagePreview !== undefined) {
    const want = props.pcrFsImagePreview;
    const have = root._pcrImagePanel.getIsVisible();
    if (want && !have) root._pcrImagePanel.show();
    else if (!want && have) root._pcrImagePanel.hide();
  }
  // 3D Poser panel — fullscreen remembers its own width + open state, separate
  // from node mode (same scheme as the image panel above).
  if (props.pcrFsPosePanelWidth != null && rootRelocated.posePanel?.el) {
    rootRelocated.posePanel.el.style.width = `${props.pcrFsPosePanelWidth}px`;
    props.pcrPosePanelWidth = props.pcrFsPosePanelWidth;
  }
  if (root._pcrPosePanel && props.pcrFsPosePanel !== undefined) {
    const want = props.pcrFsPosePanel;
    const have = root._pcrPosePanel.getIsVisible();
    if (want && !have) root._pcrPosePanel.show();
    else if (!want && have) root._pcrPosePanel.hide();
  }
  if (props.pcrFsGalleryRowHeight != null) props.pcrGalleryRowHeight = props.pcrFsGalleryRowHeight;
  if (props.pcrFsGalleryViewMode != null) props.pcrGalleryViewMode = props.pcrFsGalleryViewMode;
  if (props.pcrFsOutputFontSize != null) props.pcrOutputFontSize = props.pcrFsOutputFontSize;
  if (root._pcrOutputPanel && props.pcrFsOutputPanel !== undefined) {
    if (root._pcrOutputPanel.getIsOpen()) root._pcrOutputPanel.close();
    if (props.pcrFsOutputPanel) {
      if (props.pcrFsPanelHeight != null) props.pcrPanelHeight = props.pcrFsPanelHeight;
      props.pcrPanelMaximized = false;
      if (rootRelocated.outputPanel?.el && props.pcrFsPanelHeight) {
        rootRelocated.outputPanel.el.style.height = `${props.pcrFsPanelHeight}px`;
      }
      root._pcrOutputPanel.open();
    }
  }
  // Swap the output panel's persistence key to the fullscreen-specific
  // property so tab clicks inside the overlay don't mutate the node-mode
  // tab. Seed pcrFsOutputTab from pcrOutputTab on first entry so returning
  // users don't land on a reset default.
  if (root._pcrOutputPanel && rootRelocated.outputPanel?.el) {
    if (props.pcrFsOutputTab == null) props.pcrFsOutputTab = props.pcrOutputTab || "prompt";
    rootRelocated.outputPanel.el._setPersistKey?.("pcrFsOutputTab");
  }
}

function adoptLazyPanel(root, parentSel, handleSel, panelSel, targetContainer, handleKey, panelKey, sizeKey) {
  const widget = root.widgets?.find(w => w.name === "pcr_editor");
  const nodeParent = widget?.element?.querySelector(parentSel);
  if (!nodeParent) return;
  const handle = handleSel ? nodeParent.querySelector(handleSel) : null;
  const panel = nodeParent.querySelector(panelSel);
  if (!panel || targetContainer.contains(panel)) return;
  if (handle) {
    rootRelocated[handleKey] = savePosition(handle);
    targetContainer.appendChild(handle);
  }
  rootRelocated[panelKey] = savePosition(panel);
  rootRelocated[sizeKey] = panel.style.width || panel.style.height || "";
  targetContainer.appendChild(panel);
}

// Capture every pcrFs* property that tracks in-fullscreen state into
// the root node's properties. Called on fullscreen close AND whenever
// the workflow is saved from within fullscreen (Ctrl+S) so the save
// reflects the current layout instead of a stale pre-session snapshot.
function captureFsState() {
  if (!rootRelocated || !rootNode?.properties) return;
  const props = rootNode.properties;
  props.pcrFsOutputPanel = props.pcrOutputPanel;
  props.pcrFsPanelHeight = props.pcrPanelHeight;
  // pcrFsOutputTab is written directly by the output panel while persistKey
  // is "pcrFsOutputTab" — no mirror needed.
  props.pcrFsPanelMaximized = props.pcrPanelMaximized;
  props.pcrFsGalleryRowHeight = props.pcrGalleryRowHeight;
  props.pcrFsGalleryViewMode = props.pcrGalleryViewMode;
  props.pcrFsOutputFontSize = outputFontSize;
  props.pcrFsFontSize = fsFontSize;
  if (rootRelocated.imagePanel?.el) {
    props.pcrFsImagePanelWidth = rootRelocated.imagePanel.el.offsetWidth;
  }
  if (rootNode._pcrImagePanel) {
    props.pcrFsImagePreview = rootNode._pcrImagePanel.getIsVisible();
  }
  if (rootRelocated.posePanel?.el) {
    props.pcrFsPosePanelWidth = rootRelocated.posePanel.el.offsetWidth;
  }
  if (rootNode._pcrPosePanel) {
    props.pcrFsPosePanel = rootNode._pcrPosePanel.getIsVisible();
  }
  // Serialize node-mode pose state, not the fullscreen values.
  // relocateRootPanels mirrors pcrFsPosePanelWidth into pcrPosePanelWidth on
  // entry (and fullscreen divider drags keep writing it), so without this
  // reset a save from inside fullscreen bakes the much wider fullscreen
  // panel into the workflow and the node-mode panel reopens huge.
  if (rootRelocated.nodeModeProps) {
    props.pcrPosePanel = rootRelocated.nodeModeProps.pcrPosePanel;
    props.pcrPosePanelWidth = rootRelocated.nodeModeProps.pcrPosePanelWidth;
  }
  const sb = overlay?._pcrGetSidebarState?.();
  if (sb) {
    props.pcrFsSidebarCollapsed = sb.collapsed;
    props.pcrFsSidebarView = sb.view;
  }
  // Pane layout (groups, tabs, active tab, splitter weights, focused
  // pane). Nodes are stored by id; wildcard tabs by filename.
  const fsGroups = overlay?._pcrGetFsGroups?.();
  if (fsGroups) props.pcrFsGroups = fsGroups;

  // Mirror preview-panel state to graph.extra so it travels with the
  // workflow rather than with the current anchor node.
  captureWfFsFromAnchor();
}

function restoreRootPanels() {
  if (!rootRelocated) return;
  const root = rootNode;
  const props = root?.properties;
  const saved = rootRelocated.nodeModeProps;

  captureFsState();

  // restore node-mode properties
  if (props && saved) {
    for (const [key, value] of Object.entries(saved)) {
      props[key] = value;
    }
  }

  // restore image panel
  if (rootRelocated.imagePanel?.el && rootRelocated.imagePanelDomWidth !== undefined) {
    rootRelocated.imagePanel.el.style.width = rootRelocated.imagePanelDomWidth;
  }
  if (root?._pcrImagePanel) {
    const wasVisible = rootRelocated.imagePanelVisible;
    const isVisible = root._pcrImagePanel.getIsVisible();
    if (wasVisible && !isVisible) root._pcrImagePanel.show();
    else if (!wasVisible && isVisible) root._pcrImagePanel.hide();
  }
  restorePosition(rootRelocated.imagePanel);
  restorePosition(rootRelocated.imageDivider);

  // restore 3D Poser panel — width, visibility, then DOM slot. Returning the
  // panel home re-docks the Poser viewport into the node body's panel.
  if (rootRelocated.posePanel?.el && rootRelocated.posePanelDomWidth !== undefined) {
    rootRelocated.posePanel.el.style.width = rootRelocated.posePanelDomWidth;
  }
  if (root?._pcrPosePanel) {
    const wasVisible = rootRelocated.posePanelVisible;
    const isVisible = root._pcrPosePanel.getIsVisible();
    if (wasVisible && !isVisible) root._pcrPosePanel.show();
    else if (!wasVisible && isVisible) root._pcrPosePanel.hide();
  }
  // Divider before panel: the panel's saved next-sibling IS the divider, so the
  // divider must be back in the row first or the panel falls through to append.
  restorePosition(rootRelocated.poseDivider);
  restorePosition(rootRelocated.posePanel);

  // AI panel is restored by restoreAiAssistant() before this runs.

  // Swap the panel's persistence key back before restoring DOM + open
  // state, so the node-mode tab is what the component reflects.
  rootRelocated.outputPanel?.el?._setPersistKey?.("pcrOutputTab");

  // restore output panel
  restorePosition(rootRelocated.outputPanel);
  restorePosition(rootRelocated.outputHandle);
  if (root?._pcrOutputPanel && saved) {
    const isOpen = root._pcrOutputPanel.getIsOpen();
    const wasOpen = saved.pcrOutputPanel;
    if (isOpen) root._pcrOutputPanel.close();
    if (wasOpen) {
      if (saved.pcrPanelMaximized != null) props.pcrPanelMaximized = saved.pcrPanelMaximized;
      const panelEl = rootRelocated.outputPanel?.el;
      if (panelEl) {
        panelEl.style.height = rootRelocated.outputPanelDomHeight
          || (saved.pcrPanelHeight ? `${saved.pcrPanelHeight}px` : "");
      }
      root._pcrOutputPanel.open();
    }
  }

  rootRelocated = null;
  rootNode = null;

  // re-render gallery after DOM is back in the original context
  requestAnimationFrame(() => {
    const panel = root?.widgets?.find(w => w.name === "pcr_editor")
      ?.element?.querySelector(".pcr-output-panel");
    panel?._updateGalleryZoom?.(0);
  });
}

const TOGGLE_BTN_COLORS = { output: "#4fc3f7", image: "#4bb949", pose: "#ff8c1a" };
function updateToggleButton(btn, active) {
  if (!btn) return;
  btn.style.color = active ? (TOGGLE_BTN_COLORS[btn.dataset.fsAction] || "#4bb949") : "";
}

function hookRootToggles(root) {
  unhookRootToggles();
  // setToggleListener is fired from inside the Svelte component on every
  // visibility change — topbar button, panel's own close button, keyboard
  // shortcut, programmatic. Wrapping the registered API's methods doesn't
  // work because the component's internal close buttons call local
  // function references, not the API object's properties.
  if (root._pcrOutputPanel?.setToggleListener) {
    root._pcrOutputPanel.setToggleListener((isOpen) => updateToggleButton(outputBtn, isOpen));
    rootToggleCleanups.push(() => root._pcrOutputPanel?.setToggleListener?.(null));
  }
  if (root._pcrImagePanel?.setToggleListener) {
    root._pcrImagePanel.setToggleListener((isVisible) => updateToggleButton(imageBtn, isVisible));
    rootToggleCleanups.push(() => root._pcrImagePanel?.setToggleListener?.(null));
  }
  if (root._pcrPosePanel?.setToggleListener) {
    root._pcrPosePanel.setToggleListener((isVisible) => updateToggleButton(poseBtn, isVisible));
    rootToggleCleanups.push(() => root._pcrPosePanel?.setToggleListener?.(null));
  }
  // AI panel is bound per-focused-node (not per-root) by
  // relocateAiAssistant — see the setToggleListener call there.
}

function unhookRootToggles() {
  for (const fn of rootToggleCleanups) fn();
  rootToggleCleanups = [];
}

function flushEditorSync() {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  if (!focusedGroup?.activeNode || !focusedGroup.editorView) return;
  const text = focusedGroup.editorView.state.doc.toString();
  const node = focusedGroup.activeNode;
  const pw = node.widgets?.find(w => w.name === "prompt");
  if (pw && pw.value !== text) pw.value = text;
  // relocateFooter rebinds node._pcrEditor to the overlay's editorView for
  // the duration of fullscreen; the original canvas CM6 instance lives in
  // relocated.editorBackup. Sync that one so the in-canvas editor reflects
  // fullscreen edits — both live (debouncedSync) and on close.
  const canvasEditor = (relocated?.node === node) ? relocated.editorBackup : node._pcrEditor;
  if (canvasEditor && canvasEditor !== focusedGroup.editorView) {
    setEditorContent(canvasEditor, text);
  }
}

function debouncedSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(flushEditorSync, 150);
}

function debouncedTreeRefresh() {
  if (treeRefreshTimer) clearTimeout(treeRefreshTimer);
  treeRefreshTimer = setTimeout(() => { if (state) state.treeRoots = computeTreeRoots(); }, 500);
}

function saveWildcardContent(name, content) {
  clearTimeout(wildcardSaveTimer);
  wildcardSaveTimer = null;
  fetch("/promptchain/wildcard/content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  }).catch(() => {});
}

function debouncedWildcardSave() {
  if (!focusedGroup?.activeWildcardTab || !focusedGroup.editorView) return;
  clearTimeout(wildcardSaveTimer);
  const name = focusedGroup.activeWildcardTab;
  wildcardSaveTimer = setTimeout(() => {
    if (focusedGroup.activeWildcardTab === name && focusedGroup.editorView) {
      saveWildcardContent(name, focusedGroup.editorView.state.doc.toString());
    }
  }, 1000);
}

// ── Mode popup (ported from fullscreen-editor.js) ────────────────────────────

const MODE_EMOJI = { combine: "\uD83D\uDCDA", roll: "\uD83C\uDFB2", switch: "\u2705", iterate: "\u267B\uFE0F" };
const MODE_COLORS = { combine: "#e99e2d", roll: "#da3e65", switch: "#73d952", iterate: "#33bdff" };

function setCardMode(cardNode, mode, switchIndex) {
  if (!cardNode.properties) cardNode.properties = {};
  cardNode.properties.pcrMode = mode;
  if (switchIndex !== undefined) cardNode.properties.pcrSwitchIndex = switchIndex;
  const modeWidget = cardNode.widgets?.find(w => w.name === "mode");
  if (modeWidget) modeWidget.value = mode;
  if (switchIndex !== undefined) {
    const sw = cardNode.widgets?.find(w => w.name === "switch_index");
    if (sw) sw.value = switchIndex;
  }
  for (const n of app.graph?._nodes || []) {
    if (n.comfyClass === NODE_TYPE) { try { updateInputLabels(n); } catch {} }
  }
  app.graph?.setDirtyCanvas?.(true, true);
  if (cardNode === focusedGroup.activeNode && highlight && focusedGroup.editorView) {
    highlight.setHighlightState(focusedGroup.editorView, {
      mode,
      switchIndex: switchIndex ?? cardNode.properties?.pcrSwitchIndex ?? 0,
    });
  }
  cardNode._pcrMenubar?.updateModeDisplay?.();
}

function activateAncestorSwitches(treeNode) {
  let current = treeNode;
  while (current._parent) {
    const parent = current._parent;
    const parentMode = parent.node.properties?.pcrMode || "switch";
    if (parentMode !== "switch") break;
    const childIndex = parent.children.findIndex(c => c.node.id === current.node.id) + 1;
    if (childIndex > 0) setCardMode(parent.node, "switch", childIndex);
    current = parent;
  }
}

function stampParentRefs(tree, parent) {
  tree._parent = parent || null;
  for (const child of tree.children) stampParentRefs(child, tree);
}

function showCardModePopup(cardNode, triggerEl) {
  const popupKey = `fs_mode_${cardNode.id}`;
  if (isPopupOpen(popupKey)) { closeActivePopup(); return; }

  const currentMode = cardNode.properties?.pcrMode || "switch";
  const currentSwitchIndex = cardNode.properties?.pcrSwitchIndex ?? 1;
  const switchOptions = getSwitchOptions(cardNode);
  const hasMultipleOptions = switchOptions.length > 1;

  const menu = document.createElement("div");
  menu.className = "pcr-mode-menu";
  let close;

  const modeSection = document.createElement("div");
  modeSection.className = "pcr-mode-menu-modes";

  function addModeItem(label, mode, disabled) {
    const item = document.createElement("div");
    item.className = "pcr-mode-menu-item pcr-mode-menu-mode-option";
    if (disabled) item.classList.add("pcr-mode-menu-disabled");
    if (currentMode === mode) item.classList.add("pcr-mode-menu-selected");
    const text = document.createElement("span");
    text.textContent = label;
    item.appendChild(text);
    if (currentMode === mode) { const check = document.createElement("span"); check.className = "pcr-mode-menu-check"; check.textContent = "\u2713"; item.appendChild(check); }
    if (!disabled) {
      item.addEventListener("click", (e) => { e.stopPropagation(); setCardMode(cardNode, mode); close(); refreshSwitchPanel(); if (state) state.treeRoots = computeTreeRoots(); });
    }
    modeSection.appendChild(item);
  }

  addModeItem("\uD83C\uDFB2 Randomize", "roll", !hasMultipleOptions);
  addModeItem("\uD83D\uDCDA Combine", "combine", !hasMultipleOptions);
  addModeItem("\u267B\uFE0F Iterate", "iterate", !hasMultipleOptions);

  const noneItem = document.createElement("div");
  noneItem.className = "pcr-mode-menu-item pcr-mode-menu-mode-option";
  if (currentMode === "switch" && currentSwitchIndex === 0) noneItem.classList.add("pcr-mode-menu-selected");
  noneItem.innerHTML = `<span>\u274C None</span>`;
  if (currentMode === "switch" && currentSwitchIndex === 0) { noneItem.innerHTML += `<span class="pcr-mode-menu-check">\u2713</span>`; }
  noneItem.addEventListener("click", (e) => { e.stopPropagation(); setCardMode(cardNode, "switch", 0); close(); refreshSwitchPanel(); if (state) state.treeRoots = computeTreeRoots(); });
  modeSection.appendChild(noneItem);
  menu.appendChild(modeSection);

  const list = createSearchableList({ options: switchOptions, onSelect: (opt) => { setCardMode(cardNode, "switch", opt.index); close(); refreshSwitchPanel(); if (state) state.treeRoots = computeTreeRoots(); }, currentMode, currentSwitchIndex });
  if (list.searchContainer) menu.appendChild(list.searchContainer);
  if (list.separator) menu.appendChild(list.separator);
  menu.appendChild(list.listContainer);

  const btnRect = triggerEl.getBoundingClientRect();
  close = openPopup(menu, btnRect, popupKey);
  list.renderList();
  requestAnimationFrame(() => { positionPopup(menu, btnRect); if (list.searchInput) list.searchInput.focus(); });
}

// ── Switch panel ─────────────────────────────────────────────────────────────

function collectSwitchItems(treeNode, depth, items) {
  if (!treeNode) return;
  const node = treeNode.node;
  const options = getSwitchOptions(node);
  const hasOptions = options.length >= 1;
  if (hasOptions) {
    items.push({ type: "node", node, treeNode, depth, mode: node.properties?.pcrMode || "switch", switchIndex: node.properties?.pcrSwitchIndex ?? 1 });
  }
  for (const wc of treeNode.wildcards || []) {
    items.push({ type: "wildcard", node, wildcardName: wc.name, depth: depth + (hasOptions ? 1 : 0) });
  }
  if (!treeNode._inactive) {
    for (const child of treeNode.children) collectSwitchItems(child, depth + 1, items);
  }
}

function refreshSwitchPanel() {
  const container = overlay?.querySelector(".pcr-switch-items");
  if (!container) return;
  const scrollTop = container.scrollTop;
  container.innerHTML = "";

  const roots = computeTreeRoots();
  const items = [];
  for (const tree of roots) collectSwitchItems(tree, 0, items);

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "pcr-switch-empty";
    empty.textContent = "No switchable items";
    container.appendChild(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "pcr-switch-row";
    row.style.paddingLeft = `${12 + item.depth * 16}px`;

    if (item.type === "node") {
      const { node, mode, switchIndex } = item;
      const options = getSwitchOptions(node);
      const title = hasCustomTitle(node) ? node.title : "PromptChain";
      const label = document.createElement("span"); label.className = "pcr-switch-label"; label.textContent = title; row.appendChild(label);
      const selector = document.createElement("span"); selector.className = "pcr-switch-selector";
      const emoji = document.createElement("span"); emoji.className = "pcr-switch-emoji";
      const value = document.createElement("span"); value.className = "pcr-switch-value";
      const arrow = document.createElement("span"); arrow.className = "pcr-switch-arrow"; arrow.textContent = "\u25BE";
      if (mode === "switch") {
        const selected = options.find(o => o.index === switchIndex);
        emoji.textContent = switchIndex === 0 ? "\u274C" : "\u2705";
        value.textContent = switchIndex === 0 ? "None" : selected ? selected.label : "Switch";
        value.style.color = switchIndex === 0 ? "#b0b0b0" : MODE_COLORS.switch;
      } else {
        emoji.textContent = MODE_EMOJI[mode] || "\uD83C\uDFB2";
        value.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
        value.style.color = MODE_COLORS[mode] || "#aaa";
      }
      selector.appendChild(emoji); selector.appendChild(value); selector.appendChild(arrow); row.appendChild(selector);
      row.addEventListener("pointerdown", (e) => e.stopPropagation());
      row.addEventListener("click", () => showCardModePopup(node, row));
    } else if (item.type === "wildcard") {
      const { node, wildcardName } = item;
      const wcMode = getWildcardMode(node, wildcardName);
      const keyName = wildcardName.includes("/") ? wildcardName.split("/").pop() : wildcardName;
      const label = document.createElement("span"); label.className = "pcr-switch-label pcr-switch-label--wildcard"; label.textContent = keyName; row.appendChild(label);
      const selector = document.createElement("span"); selector.className = "pcr-switch-selector";
      const emoji = document.createElement("span"); emoji.className = "pcr-switch-emoji";
      const value = document.createElement("span"); value.className = "pcr-switch-value";
      const arrow = document.createElement("span"); arrow.className = "pcr-switch-arrow"; arrow.textContent = "\u25BE";
      if (wcMode.mode === "switch" && wcMode.index > 0) { emoji.textContent = "\u2705"; value.textContent = wcMode.label || `Option ${wcMode.index}`; value.style.color = MODE_COLORS.switch; }
      else { emoji.textContent = wcMode.mode === "none" ? "\u274C" : "\uD83C\uDFB2"; value.textContent = wcMode.mode === "none" ? "None" : wcMode.mode.charAt(0).toUpperCase() + wcMode.mode.slice(1); value.style.color = wcMode.mode === "none" ? "#b0b0b0" : MODE_COLORS[wcMode.mode] || "#aaa"; }
      selector.appendChild(emoji); selector.appendChild(value); selector.appendChild(arrow); row.appendChild(selector);
      row.addEventListener("pointerdown", (e) => e.stopPropagation());
      row.addEventListener("click", () => {
        const rect = row.getBoundingClientRect();
        const wcMode = getWildcardMode(node, wildcardName);
        svelteModule?.showWildcardDropdown?.({
          wildcardName,
          currentMode: wcMode.mode,
          currentIndex: wcMode.index,
          triggerRect: rect,
          popupKey: `wc_${node.id}_${wildcardName}`,
          onSelectMode: (mode) => {
            setWildcardMode(node, wildcardName, mode, 0);
            refreshSwitchPanel();
            if (state) state.treeRoots = computeTreeRoots();
          },
          onSelectOption: (opt) => {
            setWildcardMode(node, wildcardName, "switch", opt.index, opt.label);
            refreshSwitchPanel();
            if (state) state.treeRoots = computeTreeRoots();
          },
        });
      });
    }
    container.appendChild(row);
  }
  container.scrollTop = scrollTop;
}

// AI assistant relocation — moves the focused node's AI panel + divider
// into the focused pane's editor-row wrapper so the panel sits visually
// "inside" the pane, under the tab bar and beside CodeMirror. Tracks
// whichever node is currently relocated so swapping focus restores the
// previous node's panel to its widget DOM first.
let relocatedAi = null;

function restoreAiAssistantPanel() {
  if (!relocatedAi) return;
  if (relocatedAi.panel?.el && relocatedAi.panelDomWidth !== undefined) {
    relocatedAi.panel.el.style.width = relocatedAi.panelDomWidth;
  }
  restorePosition(relocatedAi.panel);
  restorePosition(relocatedAi.divider);
  relocatedAi = null;
}

function relocateAiAssistant(node, group) {
  if (relocatedAi?.node === node && relocatedAi?.group === group) return;
  restoreAiAssistantPanel();
  if (!node || !group?.mountEl) return;
  const widget = node.widgets?.find(w => w.name === "pcr_editor");
  const widgetRow = widget?.element?.querySelector(".pcr-editor-row");
  if (!widgetRow) return;
  const panel = widgetRow.querySelector(".pcr-ai-panel");
  if (!panel) return;
  const divider = widgetRow.querySelector(".pcr-ai-divider");
  const paneRow = group.mountEl.closest(".pcr-fs-editor-pane-row");
  if (!paneRow) return;
  const panelDomWidth = panel.style.width;
  const panelSaved = savePosition(panel);
  paneRow.appendChild(panel);
  let dividerSaved = null;
  if (divider) {
    dividerSaved = savePosition(divider);
    paneRow.appendChild(divider);
  }
  relocatedAi = {
    node,
    group,
    panel: panelSaved,
    divider: dividerSaved,
    panelDomWidth,
  };
}

// Footer relocation — swap footer from active node into fullscreen footer slot
function relocateFooter(node) {
  restoreFooter();
  const widget = node.widgets?.find(w => w.name === "pcr_editor");
  const container = widget?.element;
  if (!container) return;

  const saves = { node, editorBackup: node._pcrEditor };
  node._pcrEditor = focusedGroup.editorView;

  const footerEl = container.querySelector(".pcr-footer");
  const footerSlot = overlay?.querySelector(".pcr-fs-footer-slot");
  if (footerEl && footerSlot) {
    saves.footer = savePosition(footerEl);
    footerSlot.appendChild(footerEl);
  }

  relocated = saves;
  node._pcrFooter?.setFocused?.(true);
  node._pcrFooter?.updateWordCount?.();
  node._pcrFooter?.updatePosNeg?.();
  node._pcrFooter?.updateErrors?.();
}

function restoreFooter() {
  if (!relocated) return;
  relocated.node._pcrEditor = relocated.editorBackup;
  restorePosition(relocated.footer);
  relocated.node._pcrFooter?.setFocused?.(false);
  relocated = null;
}

// Root panel swap — triggered by setFsActiveOutputNode when generation
// moves to a different PromptChain. Captures the current anchor's
// state to graph.extra first so the new anchor inherits open/closed,
// sizes, tab selection, etc. — the user's mental model is one
// workflow-wide preview that just happens to be hosted on whichever
// node last generated.
function swapRootPanels(newRoot) {
  if (newRoot === rootNode) return;
  captureWfFsFromAnchor();
  const wasOutputOpen = rootNode?._pcrOutputPanel?.getIsOpen?.() ?? false;
  const wasImageVisible = rootNode?._pcrImagePanel?.getIsVisible?.() ?? false;

  unhookRootToggles();
  restoreRootPanels();
  applyWfFsToProps(newRoot);
  relocateRootPanels(newRoot);
  hookRootToggles(newRoot);

  // reapply visual state to new root's panels
  if (wasOutputOpen && newRoot._pcrOutputPanel) {
    if (!newRoot._pcrOutputPanel.getIsOpen()) newRoot._pcrOutputPanel.open();
    if (rootRelocated) {
      const editorArea = overlay?.querySelector(".pcr-fs-editor-area");
      if (editorArea) adoptLazyPanel(newRoot, ".pcr-node-content", ".pcr-output-panel-resize", ".pcr-output-panel", editorArea, "outputHandle", "outputPanel", "outputPanelDomHeight");
    }
  }
  if (wasImageVisible && newRoot._pcrImagePanel) {
    if (!newRoot._pcrImagePanel.getIsVisible()) newRoot._pcrImagePanel.show();
    if (rootRelocated) {
      const mainEl = overlay?.querySelector(".pcr-fs-main");
      if (mainEl) adoptLazyPanel(newRoot, ".pcr-editor-row", ".pcr-image-divider", ".pcr-image-panel", mainEl, "imageDivider", "imagePanel", "imagePanelDomWidth");
    }
  }

  // update output font size for new root
  outputFontSize = newRoot.properties?.pcrOutputFontSize || CONFIG.defaultFontSize;
  const editorArea = overlay?.querySelector(".pcr-fs-editor-area");
  if (editorArea) editorArea.style.setProperty("--pcr-output-font-size", `${outputFontSize}px`);

  // update toggle button colors
  updateToggleButton(outputBtn, !!newRoot._pcrOutputPanel?.getIsOpen?.());
  updateToggleButton(imageBtn, !!newRoot._pcrImagePanel?.getIsVisible?.());
  updateToggleButton(poseBtn, !!newRoot._pcrPosePanel?.getIsVisible?.());
}

// When the active workflow is replaced via app.loadGraphData (Save As on a
// saved workflow, File > New, Open) the overlay's node references are
// destroyed. Wrap the funnel once: tear the overlay down, let the load run,
// then reopen on the equivalent node if it survived (Save As preserves node
// ids), else stay closed so the user lands on the new tab.
let _loadGraphPatchedForFs = false;
function patchLoadGraphForFullscreen() {
  if (_loadGraphPatchedForFs || typeof app?.loadGraphData !== "function") return;
  _loadGraphPatchedForFs = true;
  const original = app.loadGraphData.bind(app);
  app.loadGraphData = async function pcrFsReopen(...args) {
    const wasOpen = isSvelteFullscreenActive();
    const anchorId = wasOpen ? rootNode?.id : null;
    if (wasOpen) hideSvelteFullscreen();
    const result = await original(...args);
    if (wasOpen && anchorId != null) {
      const reborn = app.graph?.getNodeById?.(anchorId);
      if (reborn && reborn.type === NODE_TYPE) await showSvelteFullscreen(reborn);
    }
    return result;
  };
}

export async function showSvelteFullscreen(entryNode) {
  patchLoadGraphForFullscreen();
  if (overlay) hideSvelteFullscreen();

  const mod = await loadModule();
  const CM = await loadCodeMirror();

  // build initial tree
  const roots = computeTreeRoots();
  const entries = flattenAllTrees(roots);
  const entryEntry = entries.find(e => e.node.id === entryNode.id) || entries[0];
  if (!entryEntry) return;

  // The fullscreen preview is a workflow-level singleton (one workflow =
  // one in-flight generation), so the panel anchor is decoupled from
  // `entryNode`. Pick whichever PromptChain most recently generated,
  // falling back to the first one wired up to a sampler.
  const root = pickFsAnchor(entryNode);

  // Groups are created by Svelte's EditorGroup component via
  // overlay._pcrCreateEditorInGroup. Keep the CM module handy for the
  // per-group editor factory called once that mount fires.
  cmModule = CM;

  // create highlight + wildcard badge extensions
  highlight = createHighlightExtension(CM);
  wildcardBadge = createWildcardBadgeExtension(CM);
  wildcardBadge.setOnModeChanged(() => {
    state.treeRoots = computeTreeRoots();
    if (focusedGroup?.editorView) wildcardBadge.refreshBadges(focusedGroup.editorView);
  });

  // create state
  state = new mod.FullscreenState();
  state.treeRoots = roots;
  fsFontSize = root.properties?.pcrFsFontSize ?? entryNode.properties?.pcrFontSize ?? CONFIG.defaultFontSize;
  state.fontSize = fsFontSize;
  state.initialSidebarCollapsed = !!root.properties?.pcrFsSidebarCollapsed;
  state.initialSidebarView = root.properties?.pcrFsSidebarView === "switch" ? "switch" : "edit";
  // Restore pane layout from previous session if present. Resolve node
  // ids into live LGraphNode refs here so the Svelte side only deals
  // with usable objects; drop tabs whose nodes no longer exist. Two
  // formats are supported: the new tree layout (savedFs.root) and the
  // legacy flat list (savedFs.groups). Empty result falls through to the
  // default single-pane with the entry node.
  const savedFs = root.properties?.pcrFsGroups;
  function hydrateTabList(rawTabs) {
    const tabs = [];
    for (const st of rawTabs || []) {
      if (st.kind === "wildcard" && st.wildcardName) {
        tabs.push({ node: null, title: st.title || st.filename || st.wildcardName, type: "wildcard", wildcardName: st.wildcardName, filename: st.filename });
      } else if (st.kind === "node" && st.nodeId != null) {
        const n = app.graph?.getNodeById?.(st.nodeId);
        if (!n) continue;
        tabs.push({ node: n, title: hasCustomTitle(n) ? n.title : "PromptChain" });
      }
    }
    return tabs;
  }
  function hydrateTree(raw) {
    if (!raw) return null;
    if (raw.kind === "container") {
      const children = (raw.children || []).map(hydrateTree).filter(Boolean);
      if (children.length === 0) return null;
      return {
        kind: "container",
        direction: raw.direction === "column" ? "column" : "row",
        flex: typeof raw.flex === "number" && raw.flex > 0 ? raw.flex : 1,
        children,
      };
    }
    // leaf
    const tabs = hydrateTabList(raw.tabs);
    if (tabs.length === 0) return null;
    return {
      kind: "leaf",
      tabs,
      activeTabIdx: Math.max(0, Math.min(tabs.length - 1, raw.activeTabIdx ?? 0)),
      flex: typeof raw.flex === "number" && raw.flex > 0 ? raw.flex : 1,
    };
  }
  if (savedFs?.root) {
    const hydrated = hydrateTree(savedFs.root);
    if (hydrated) {
      state.initialLayout = hydrated;
      if (typeof savedFs.focusedLeafId === "number") {
        state.initialFocusedLeafId = savedFs.focusedLeafId;
      }
    }
  } else if (savedFs && Array.isArray(savedFs.groups)) {
    // Legacy flat format — keep producing initialGroups/initialFocusedGroupIdx
    // so FullscreenEditor's compat path wraps it into a row container.
    const resolved = [];
    for (const sg of savedFs.groups) {
      const tabs = hydrateTabList(sg.tabs);
      if (tabs.length === 0) continue;
      const activeTabIdx = Math.max(0, Math.min(tabs.length - 1, sg.activeTabIdx ?? 0));
      resolved.push({
        tabs,
        activeTabIdx,
        flex: typeof sg.flex === "number" && sg.flex > 0 ? sg.flex : 1,
      });
    }
    if (resolved.length > 0) {
      state.initialGroups = resolved;
      state.initialFocusedGroupIdx = Math.max(0, Math.min(resolved.length - 1, savedFs.focusedGroupIdx ?? 0));
    }
  }

  // create overlay container — matches old fullscreen-editor.js structure
  overlay = document.createElement("div");
  overlay.className = "pcr-fs-overlay";
  document.body.appendChild(overlay);

  // get workflow name
  const workflowName = app.extensionManager?.workflow?.activeWorkflow?.filename
    || app.graph?.extra?.promptchain?.name
    || "Workflow";

  // mount Svelte fullscreen editor
  instance = mod.mountFullscreen(overlay, {
    fsState: state,
    overlayEl: overlay,
    entryNodeId: entryNode.id,
    logoUrl: new URL("../logo.png", import.meta.url).href,
    logoTextUrl: new URL("../logo-text.png", import.meta.url).href,
    workflowName,

    refreshTree: () => { state.treeRoots = computeTreeRoots(); },

    onFinishRename: (nodeId, newTitle) => {
      const target = app.graph?.getNodeById?.(nodeId);
      if (target && newTitle && newTitle !== target.title) {
        target.title = newTitle;
        app.graph?.setDirtyCanvas?.(true, true);
        overlay?._pcrUpdateTabTitle?.(target.id, newTitle);
      }
      state.renamingNodeId = null;
      state.treeRoots = computeTreeRoots();
    },

    onAddNode: () => {
      const LiteGraph = window.LiteGraph;
      if (!LiteGraph) return;
      const newNode = LiteGraph.createNode(NODE_TYPE);
      if (!newNode) return;
      if (focusedGroup.activeNode) {
        const pos = focusedGroup.activeNode.pos || [0, 0];
        newNode.pos = [pos[0] - 200, pos[1] + 100];
        app.graph.add(newNode);
        const connected = getConnectedInputs(focusedGroup.activeNode).length;
        const slotName = `in_${connected}`;
        const slotIdx = focusedGroup.activeNode.inputs?.findIndex(s =>
          s.name === slotName || s.name === `inputs.${slotName}`
        );
        if (slotIdx >= 0) newNode.connect(0, focusedGroup.activeNode, slotIdx);
      } else {
        newNode.pos = [100, 100];
        app.graph.add(newNode);
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        state.treeRoots = computeTreeRoots();
      }));
    },

    onSelectNode: (treeNode, scrollToWildcard) => {
      if (!focusedGroup.editorView || !treeNode?.node) return;
      // flush wildcard save when leaving a wildcard tab
      if (focusedGroup.activeWildcardTab) {
        saveWildcardContent(focusedGroup.activeWildcardTab, focusedGroup.editorView.state.doc.toString());
        focusedGroup.activeWildcardTab = null;
      }
      flushEditorSync();
      focusedGroup.activeNode = treeNode.node;

      const editorBody = overlay?.querySelector(".pcr-fs-editor-body");
      if (editorBody) editorBody._pcrNode = focusedGroup.activeNode;

      // update editor content
      const pw = focusedGroup.activeNode.widgets?.find(w => w.name === "prompt");
      resetEditorContent(focusedGroup.editorView, pw?.value || "");

      try { activateTagAutocomplete(CM, focusedGroup.editorView); } catch {}

      // sync highlight
      if (highlight) {
        const mode = focusedGroup.activeNode.properties?.pcrMode || "switch";
        const switchIndex = focusedGroup.activeNode.properties?.pcrSwitchIndex ?? 0;
        highlight.setHighlightState(focusedGroup.editorView, { mode, switchIndex });
      }
      if (wildcardBadge) {
        wildcardBadge.setNode(focusedGroup.activeNode);
        wildcardBadge.refreshBadges(focusedGroup.editorView);
      }

      // The fullscreen preview anchor follows generation, not focus —
      // see setFsActiveOutputNode. Compiled output panes still mirror
      // whichever node the user is currently editing, though.
      const newRoot = findRoot(focusedGroup.activeNode);
      state.compiledOutput = newRoot.properties?.pcrCompiledOutput || newRoot._pcrOutputText || "";
      state.compiledNegOutput = newRoot.properties?.pcrCompiledNegOutput || newRoot._pcrNegOutputText || "";

      // relocate footer from this node
      relocateFooter(focusedGroup.activeNode);
      relocateAiAssistant(focusedGroup.activeNode, focusedGroup);

      // scroll to wildcard reference line if requested
      if (scrollToWildcard && focusedGroup.editorView) {
        const doc = focusedGroup.editorView.state.doc;
        const needle = `__${scrollToWildcard}__`;
        for (let i = 1; i <= doc.lines; i++) {
          if (doc.line(i).text.includes(needle)) {
            const pos = doc.line(i).from;
            focusedGroup.editorView.dispatch({
              selection: { anchor: pos },
              effects: CM?.EditorView?.scrollIntoView?.(pos, { y: "center" }),
            });
            break;
          }
        }
      }

      focusedGroup.editorView.focus();
    },

    onSetMode: (node, mode, switchIndex, triggerEl) => {
      if (triggerEl && switchIndex === undefined) {
        showCardModePopup(node, triggerEl);
        return;
      }
      setCardMode(node, mode, switchIndex);
      state.treeRoots = computeTreeRoots();
    },

    onToggleLock: (targetNode) => {
      const locked = !targetNode.properties?.pcrLocked;
      for (const n of [targetNode, ...getUpstream(targetNode)]) {
        if (!n.properties) n.properties = {};
        n.properties.pcrLocked = locked;
        if (locked && n._pcrOutputText) {
          n.properties.pcrCachedOutput = n._pcrOutputText;
          n.properties.pcrCachedNegOutput = n._pcrNegOutputText || "";
          n.properties.pcrCachedRegions = n._pcrRegionsText || ""; // regional split freezes with the text
        }
        if (!locked) {
          n.properties.pcrCachedOutput = "";
          n.properties.pcrCachedNegOutput = "";
          n.properties.pcrCachedRegions = "";
        }
        n._pcrMenubar?.updateActionStates?.();
      }
      state.treeRoots = computeTreeRoots();
      app.graph?.setDirtyCanvas?.(true, true);
    },

    onToggleDisable: (targetNode) => {
      const disabled = !targetNode.properties?.pcrDisabled;
      for (const n of [targetNode, ...getUpstream(targetNode)]) {
        if (!n.properties) n.properties = {};
        n.properties.pcrDisabled = disabled;
        n._pcrMenubar?.updateActionStates?.();
      }
      state.treeRoots = computeTreeRoots();
      app.graph?.setDirtyCanvas?.(true, true);
    },

    onClose: () => hideSvelteFullscreen(),

    onQueuePrompt: (batchCount) => {
      flushEditorSync();
      app.queuePrompt(0, batchCount || 1);
    },

    onCancelExecution: () => { api.interrupt(null); },

    // Comfy menu commands fired from the fullscreen activity bar. Flush the
    // live editor + pane layout into node properties first so any command
    // that serializes (Save/Save As/Export) or reloads (New/Open) the graph
    // sees the current state. After a rename-in-place (temp workflow Save As,
    // no reload) the overlay survives, so refresh its title.
    onComfyCommand: async (commandId) => {
      if (focusedGroup?.activeWildcardTab && focusedGroup.editorView) {
        saveWildcardContent(focusedGroup.activeWildcardTab, focusedGroup.editorView.state.doc.toString());
      }
      flushEditorSync();
      captureFsState();
      await window.app?.extensionManager?.command?.execute?.(commandId);
      if (isSvelteFullscreenActive()) {
        const aw = window.app?.extensionManager?.workflow?.activeWorkflow;
        overlay?._pcrUpdateWorkflowName?.(aw?.filename || aw?.name || "Workflow");
      }
    },

    onSaveWorkflow: () => {
      if (focusedGroup?.activeWildcardTab && focusedGroup.editorView) {
        saveWildcardContent(focusedGroup.activeWildcardTab, focusedGroup.editorView.state.doc.toString());
      }
      flushEditorSync();
      // Flush the live fullscreen layout into root properties so
      // SaveWorkflow serializes the *current* state, not whatever was
      // captured at the previous close.
      captureFsState();
      window.app?.extensionManager?.command?.execute?.("Comfy.SaveWorkflow");
      const activeWorkflow = window.app?.extensionManager?.workflow?.activeWorkflow;
      const name = activeWorkflow?.filename || activeWorkflow?.name || "Workflow";
      window.app?.extensionManager?.toast?.add?.({
        severity: "success",
        summary: "Workflow saved",
        detail: name,
        life: 2000,
      });
    },

    // Empty-area context menu — right-click below the tree rows. Surfaces
    // operations that don't need a target node (currently just Add Node,
    // mirroring the header + button).
    onEmptyContextMenu: (x, y) => {
      const menu = document.createElement("div");
      menu.className = "pcr-mode-menu pcr-ctx-menu";
      let close;
      const item = document.createElement("div");
      item.className = "pcr-mode-menu-item";
      item.textContent = "Add Node";
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
        const LiteGraph = window.LiteGraph;
        if (!LiteGraph) return;
        const newNode = LiteGraph.createNode(NODE_TYPE);
        if (!newNode) return;
        newNode.pos = [100, 100];
        app.graph.add(newNode);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          state.treeRoots = computeTreeRoots();
        }));
      });
      menu.appendChild(item);
      close = openPopup(menu, { left: x, right: x, top: y, bottom: y }, "ctx_empty");
    },

    // tree context menu — builds imperative popup using popup-menu.js
    onContextMenu: (node, treeNode, parentTree, x, y) => {
      const menu = document.createElement("div");
      menu.className = "pcr-mode-menu pcr-ctx-menu";
      let close;

      function addItem(label, handler, danger) {
        const item = document.createElement("div");
        item.className = "pcr-mode-menu-item" + (danger ? " pcr-mode-menu-item--danger" : "");
        item.textContent = label;
        item.addEventListener("click", (e) => { e.stopPropagation(); close(); handler(); });
        menu.appendChild(item);
      }

      addItem("Add Node", () => {
        const LiteGraph = window.LiteGraph;
        if (!LiteGraph) return;
        const newNode = LiteGraph.createNode(NODE_TYPE);
        if (!newNode) return;
        const pos = node.pos || [0, 0];
        newNode.pos = [pos[0] - 200, pos[1] + 100];
        app.graph.add(newNode);
        const connected = getConnectedInputs(node).length;
        const slotName = `in_${connected}`;
        const slotIdx = node.inputs?.findIndex(s => s.name === slotName || s.name === `inputs.${slotName}`);
        if (slotIdx >= 0) newNode.connect(0, node, slotIdx);
        requestAnimationFrame(() => requestAnimationFrame(() => { state.treeRoots = computeTreeRoots(); }));
      });

      addItem("Edit Node", () => {
        // trigger Svelte's selectTreeNode by clicking the tree row
        const row = overlay?.querySelector(`[data-node-id="${node.id}"] .pcr-nettree-row`);
        if (row) row.click();
      });

      addItem("Rename", () => {
        state.renamingNodeId = node.id;
      });

      addItem(node.properties?.pcrLocked ? "Unlock" : "Lock", () => {
        const locked = !node.properties?.pcrLocked;
        for (const n of [node, ...getUpstream(node)]) {
          if (!n.properties) n.properties = {};
          n.properties.pcrLocked = locked;
          if (locked && n._pcrOutputText) { n.properties.pcrCachedOutput = n._pcrOutputText; n.properties.pcrCachedNegOutput = n._pcrNegOutputText || ""; n.properties.pcrCachedRegions = n._pcrRegionsText || ""; }
          if (!locked) { n.properties.pcrCachedOutput = ""; n.properties.pcrCachedNegOutput = ""; n.properties.pcrCachedRegions = ""; }
          n._pcrMenubar?.updateActionStates?.();
        }
        state.treeRoots = computeTreeRoots();
        app.graph?.setDirtyCanvas?.(true, true);
      });

      addItem(node.properties?.pcrDisabled ? "Enable" : "Disable", () => {
        const disabled = !node.properties?.pcrDisabled;
        for (const n of [node, ...getUpstream(node)]) {
          if (!n.properties) n.properties = {};
          n.properties.pcrDisabled = disabled;
          n._pcrMenubar?.updateActionStates?.();
        }
        state.treeRoots = computeTreeRoots();
        app.graph?.setDirtyCanvas?.(true, true);
      });

      if (parentTree) {
        addItem("Delete", () => {
          const title = node.title || "PromptChain";
          const backdrop = document.createElement("div");
          backdrop.className = "pcr-modal-backdrop";
          const modal = document.createElement("div");
          modal.className = "pcr-modal";
          modal.setAttribute("role", "dialog");
          modal.innerHTML = `
            <div class="pcr-modal-header">
              <span class="pcr-modal-title">Delete</span>
              <button class="pcr-modal-close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div class="pcr-modal-body"><p class="pcr-cf-msg"></p></div>
            <div class="pcr-modal-footer">
              <button class="pcr-modal-btn pcr-modal-btn-secondary">Cancel</button>
              <button class="pcr-modal-btn pcr-modal-btn-danger">Delete</button>
            </div>`;
          // textContent prevents HTML injection via user-editable node.title
          modal.querySelector(".pcr-cf-msg").textContent = `Delete "${title}"?`;
          backdrop.appendChild(modal);
          const dismiss = () => backdrop.remove();
          const confirm = () => {
            dismiss();
            for (const slot of getConnectedInputs(parentTree.node)) {
              if (getSourceNode(parentTree.node, slot) === node) {
                parentTree.node.disconnectInput(parentTree.node.inputs.indexOf(slot));
                break;
              }
            }
            updateInputLabels(parentTree.node);
            parentTree.node._pcrMenubar?.updateModeDisplay?.();
            app.graph.remove(node);
            app.graph?.setDirtyCanvas?.(true, true);
            state.treeRoots = computeTreeRoots();
          };
          modal.querySelector(".pcr-modal-close").addEventListener("click", dismiss);
          modal.querySelector(".pcr-modal-btn-secondary").addEventListener("click", dismiss);
          modal.querySelector(".pcr-modal-btn-danger").addEventListener("click", confirm);
          backdrop.addEventListener("click", (ev) => { if (ev.target === backdrop) dismiss(); });
          backdrop.addEventListener("keydown", (ev) => { if (ev.key === "Escape") dismiss(); if (ev.key === "Enter") confirm(); ev.stopPropagation(); });
          overlay.appendChild(backdrop);
          modal.querySelector(".pcr-modal-btn-danger").focus();
        }, true);
      }

      close = openPopup(menu, { left: x, right: x, top: y, bottom: y }, `ctx_${node.id}`);
    },

    // label indicator click — opens label dropdown or jumps to label
    onLabelClick: (node, labelIndex, triggerEl) => {
      if (labelIndex !== null && labelIndex !== undefined) {
        // jump to label line in editor
        if (!focusedGroup.editorView) return;
        const doc = focusedGroup.editorView.state.doc;
        let count = 0;
        for (let i = 1; i <= doc.lines; i++) {
          const trimmed = doc.line(i).text.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
          if (/^::([^:]+)::/.test(trimmed)) {
            count++;
            if (count === labelIndex) {
              focusedGroup.editorView.dispatch({ selection: { anchor: doc.line(i).from }, scrollIntoView: true });
              focusedGroup.editorView.focus();
              return;
            }
          }
        }
        return;
      }
      // open label dropdown popup
      if (!triggerEl) return;
      const treeRoots = computeTreeRoots();
      const entries = treeRoots.flatMap(t => flattenTree(t));
      const entry = entries.find(e => e.node.id === node.id);
      if (!entry) return;
      const labels = getSelfLabelOptions(node);
      if (!labels.length) return;

      const currentMode = node.properties?.pcrMode || "switch";
      const currentIndex = node.properties?.pcrSwitchIndex ?? 1;
      const popupKey = `label_${node.id}`;
      if (isPopupOpen(popupKey)) { closeActivePopup(); return; }

      const menu = document.createElement("div");
      menu.className = "pcr-mode-menu";
      const modeSection = document.createElement("div");
      modeSection.className = "pcr-mode-menu-modes";

      function addMode(label, modeVal) {
        const item = document.createElement("div");
        item.className = "pcr-mode-menu-item pcr-mode-menu-mode-option";
        if (currentMode === modeVal) item.classList.add("pcr-mode-menu-selected");
        item.innerHTML = `<span>${label}</span>` + (currentMode === modeVal ? `<span class="pcr-mode-menu-check">\u2713</span>` : "");
        item.addEventListener("click", (e) => { e.stopPropagation(); setCardMode(node, modeVal, modeVal === "switch" ? currentIndex : 0); close(); state.treeRoots = computeTreeRoots(); });
        modeSection.appendChild(item);
      }
      addMode("\uD83C\uDFB2 Randomize", "roll");
      addMode("\uD83D\uDCDA Combine", "combine");
      addMode("\u267B\uFE0F Iterate", "iterate");

      const noneItem = document.createElement("div");
      noneItem.className = "pcr-mode-menu-item pcr-mode-menu-mode-option";
      if (currentMode === "switch" && currentIndex === 0) noneItem.classList.add("pcr-mode-menu-selected");
      noneItem.innerHTML = `<span>\u274C None</span>` + (currentMode === "switch" && currentIndex === 0 ? `<span class="pcr-mode-menu-check">\u2713</span>` : "");
      noneItem.addEventListener("click", (e) => { e.stopPropagation(); setCardMode(node, "switch", 0); close(); state.treeRoots = computeTreeRoots(); });
      modeSection.appendChild(noneItem);
      menu.appendChild(modeSection);

      const list = createSearchableList({ options: labels, onSelect: (opt) => {
        setCardMode(node, "switch", opt.index);
        // activate ancestor switches so parent nodes point at this branch
        if (entry) activateAncestorSwitches(entry);
        close();
        state.treeRoots = computeTreeRoots();
      }, currentMode, currentSwitchIndex: currentIndex });
      if (list.searchContainer) menu.appendChild(list.searchContainer);
      if (list.separator) menu.appendChild(list.separator);
      menu.appendChild(list.listContainer);

      const rect = triggerEl.getBoundingClientRect();
      const close = openPopup(menu, rect, popupKey);
      list.renderList();
      requestAnimationFrame(() => { positionPopup(menu, rect); if (list.searchInput) list.searchInput.focus(); });
    },

    // wildcard row click — open wildcard file in editor
    onWildcardClick: async (wildcardName) => {
      if (!focusedGroup.editorView) return;
      try {
        const res = await fetch(`/promptchain/wildcard/content?name=${encodeURIComponent(wildcardName)}`);
        const data = await res.json();
        if (data.error) return;
        const filename = data.filename || wildcardName;

        // flush previous wildcard save if switching files
        if (focusedGroup.activeWildcardTab && focusedGroup.activeWildcardTab !== wildcardName) {
          saveWildcardContent(focusedGroup.activeWildcardTab, focusedGroup.editorView.state.doc.toString());
        }
        flushEditorSync();
        focusedGroup.activeNode = null;
        focusedGroup.activeWildcardTab = wildcardName;
        restoreFooter();

        // update Svelte tab system
        overlay?._pcrAddWildcardTab?.(wildcardName, filename);

        resetEditorContent(focusedGroup.editorView, data.content || "");
  
        if (highlight) highlight.setHighlightState(focusedGroup.editorView, { mode: "combine", switchIndex: 0 });
        if (wildcardBadge) { wildcardBadge.setNode(null); wildcardBadge.refreshBadges(focusedGroup.editorView); }

        const editorBody = overlay?.querySelector(".pcr-fs-editor-body");
        if (editorBody) editorBody._pcrNode = null;

        // scroll to key if resolved
        if (data.key) {
          const doc = focusedGroup.editorView.state.doc;
          const keySegment = data.key.split("/")[0];
          const searchStr = `${keySegment}:`;
          for (let i = 1; i <= doc.lines; i++) {
            if (doc.line(i).text.trimStart().startsWith(searchStr)) {
              focusedGroup.editorView.dispatch({ selection: { anchor: doc.line(i).from }, effects: window.PromptChainCM?.EditorView?.scrollIntoView?.(doc.line(i).from, { y: "start" }) });
              break;
            }
          }
        }
      } catch {}
    },

    // wildcard indicator click — open mode selector popup
    onWildcardModeClick: (wcNode, wildcardName, triggerEl) => {
      const rect = triggerEl.getBoundingClientRect();
      const wcMode = getWildcardMode(wcNode, wildcardName);
      svelteModule?.showWildcardDropdown?.({
        wildcardName,
        currentMode: wcMode.mode,
        currentIndex: wcMode.index,
        triggerRect: rect,
        popupKey: `wc_${wcNode.id}_${wildcardName}`,
        onSelectMode: (mode) => {
          setWildcardMode(wcNode, wildcardName, mode, 0);
          state.treeRoots = computeTreeRoots();
        },
        onSelectOption: (opt) => {
          setWildcardMode(wcNode, wildcardName, "switch", opt.index, opt.label);
          state.treeRoots = computeTreeRoots();
        },
      });
    },

    // tree drag & drop — reorder siblings or reparent nodes
    onDragDrop: (action, srcTree, targetTree, srcParent, targetParent, position) => {
      // prevent dropping onto own descendants (would create a cycle)
      if (action === "reparent" && isDescendant(srcTree, targetTree.node.id)) return;

      // Reconnect `parent`'s children as `newOrder`. Disconnects every existing
      // child input, then wires each node in the new order into in_0..in_N.
      // Pre-disconnect state must be passed in; reading post-disconnect from
      // the graph returns the child set after we've already wiped it.
      const rewireChildren = (parent, newOrder) => {
        parent._pcrFromWorkflow = true;
        const inputs = getConnectedInputs(parent);
        const indices = inputs.map(s => parent.inputs.indexOf(s)).sort((a, b) => b - a);
        for (const idx of indices) parent.disconnectInput(idx);
        for (let i = 0; i < newOrder.length; i++) {
          const slotName = `in_${i}`;
          const slotIdx = parent.inputs.findIndex(s => s.name === slotName || s.name === `inputs.${slotName}`);
          if (slotIdx >= 0) newOrder[i].connect(0, parent, slotIdx);
        }
        delete parent._pcrFromWorkflow;
        updateInputLabels(parent);
        parent._pcrMenubar?.updateModeDisplay?.();
      };

      if (action === "reorder" && srcParent?.node === targetParent?.node && srcParent) {
        const parent = srcParent.node;
        const siblings = (srcParent.children || []).map(c => c.node);
        const dragIdx = siblings.indexOf(srcTree.node);
        if (dragIdx < 0) return;
        const withoutDrag = siblings.filter((_, i) => i !== dragIdx);
        const targetIdx = withoutDrag.indexOf(targetTree.node);
        const insertAt = targetIdx < 0 ? withoutDrag.length
          : position === "before" ? targetIdx : targetIdx + 1;
        withoutDrag.splice(insertAt, 0, srcTree.node);
        rewireChildren(parent, withoutDrag);
      } else if (action === "reparent") {
        const child = srcTree.node;
        const oldParent = srcParent?.node || null;
        const firstChild = position === "first-child";
        const intoTarget = firstChild || !position || position === "into";
        const newParent = intoTarget ? targetTree.node : (targetParent?.node || null);

        // Snapshot newParent's existing children before any disconnect runs.
        // Needed to compute the correct insertion index in the new order.
        const newParentTree = intoTarget ? targetTree : targetParent;
        const existingSiblings = (newParentTree?.children || [])
          .map(c => c.node)
          .filter(n => n !== child);

        let insertIdx;
        if (firstChild) insertIdx = 0;
        else if (position === "before") {
          const i = existingSiblings.indexOf(targetTree.node);
          insertIdx = i < 0 ? 0 : i;
        } else if (position === "after") {
          const i = existingSiblings.indexOf(targetTree.node);
          insertIdx = i < 0 ? existingSiblings.length : i + 1;
        } else insertIdx = existingSiblings.length;

        if (oldParent === newParent) {
          if (!newParent) return;
          if (position === "into") return;
          const newOrder = [...existingSiblings];
          newOrder.splice(insertIdx, 0, child);
          rewireChildren(newParent, newOrder);
        } else {
          if (oldParent) {
            oldParent._pcrFromWorkflow = true;
            for (const slot of getConnectedInputs(oldParent)) {
              if (getSourceNode(oldParent, slot) === child) {
                oldParent.disconnectInput(oldParent.inputs.indexOf(slot));
                break;
              }
            }
            delete oldParent._pcrFromWorkflow;
            updateInputLabels(oldParent);
            oldParent._pcrMenubar?.updateModeDisplay?.();
          }
          if (newParent) {
            const newOrder = [...existingSiblings];
            newOrder.splice(insertIdx, 0, child);
            rewireChildren(newParent, newOrder);
          }
        }
      }
      app.graph?.setDirtyCanvas?.(true, true);
      state.treeRoots = computeTreeRoots();
    },
  });

  // wire imperative helpers on the overlay element
  overlay._pcrRefreshSwitchPanel = refreshSwitchPanel;
  overlay._pcrClosePopup = () => {
    closeActivePopup();
    svelteModule?.hideWildcardDropdown?.();
  };
  overlay._pcrFlushWildcard = (name) => {
    if (!focusedGroup) return;
    if (focusedGroup.activeWildcardTab === name && focusedGroup.editorView) {
      saveWildcardContent(name, focusedGroup.editorView.state.doc.toString());
    }
    focusedGroup.activeWildcardTab = null;
  };
  overlay._pcrClearWildcard = () => { if (focusedGroup) focusedGroup.activeWildcardTab = null; };
  overlay._pcrSetOutputFontSize = (size) => {
    outputFontSize = size;
    if (rootNode?.properties) rootNode.properties.pcrOutputFontSize = size;
  };

  // Per-group editor lifecycle — Svelte's EditorGroup component drives
  // creation/destruction via these imperative APIs as groups are added
  // (e.g. split-right button) or removed (close-group button). The initial
  // group is also created this way when FullscreenEditor first mounts.
  overlay._pcrCreateEditorInGroup = (groupId, mountEl, initialTab) => {
    let group = groups.find(g => g.id === groupId);
    if (!group) {
      group = createGroup(mountEl);
      group.id = groupId;
      groups.push(group);
    }
    if (group.editorView) return; // idempotent
    createGroupEditor(group, mountEl, initialTab);
    if (!focusedGroup) {
      focusedGroup = group;
      if (group.activeNode) {
        relocateFooter(group.activeNode);
        relocateAiAssistant(group.activeNode, group);
      }
    } else if (group === focusedGroup && group.activeNode) {
      // re-mount of the focused group (e.g. layout change) — re-anchor
      // the AI panel into the new pane-row.
      relocateAiAssistant(group.activeNode, group);
    }
  };
  // Global ctrl+wheel zoom. Updates fsFontSize and broadcasts the new
  // --pcr-font-size CSS var to every pane's mount element so all editors
  // resize together (VS Code semantics). Persists via captureFsState.
  overlay._pcrUpdateFsFontSize = (delta) => {
    const next = Math.max(CONFIG.minFontSize, Math.min(CONFIG.maxFontSize, fsFontSize + delta));
    if (next === fsFontSize) return;
    fsFontSize = next;
    for (const g of groups) {
      if (g.mountEl) g.mountEl.style.setProperty("--pcr-font-size", `${fsFontSize}px`);
      const v = g.editorView;
      if (!v) continue;
      // CM6 caches defaultLineHeight/defaultCharacterWidth and only refreshes
      // them when its cm-content ResizeObserver fires. Because cm-content
      // gets an explicit inline height from CM6's heightMap, a font-size
      // change alone leaves the rendered size unchanged — the observer
      // never fires and posAtCoords keeps mapping clicks with stale
      // metrics, landing the cursor on the wrong line. Briefly clearing
      // the inline height lets layout flow from the new line metrics,
      // which triggers the observer; the requestMeasure that follows then
      // picks up the refreshed font cache.
      const cd = v.contentDOM;
      const savedHeight = cd.style.height;
      cd.style.height = "auto";
      void cd.offsetHeight;
      cd.style.height = savedHeight;
      v.requestMeasure();
    }
  };
  overlay._pcrDestroyEditorInGroup = (groupId) => {
    const idx = groups.findIndex(g => g.id === groupId);
    if (idx < 0) return;
    const group = groups[idx];
    // Flush pending edits before tearing down — avoids losing the last
    // ~150ms of typing that hasn't debounced through to the node widget
    // or wildcard save endpoint.
    if (group.editorView) {
      if (group.activeWildcardTab) {
        saveWildcardContent(group.activeWildcardTab, group.editorView.state.doc.toString());
      } else if (group.activeNode) {
        const text = group.editorView.state.doc.toString();
        const node = group.activeNode;
        const pw = node.widgets?.find(w => w.name === "prompt");
        if (pw && pw.value !== text) pw.value = text;
        // see flushEditorSync: when this group's node is the relocated
        // (focused) one, _pcrEditor points at this group's editorView, so
        // the original canvas editor must be reached via relocated.editorBackup.
        const canvasEditor = (relocated?.node === node) ? relocated.editorBackup : node._pcrEditor;
        if (canvasEditor && canvasEditor !== group.editorView) {
          setEditorContent(canvasEditor, text);
        }
      }
    }
    if (focusedGroup === group && group.activeNode) restoreFooter();
    destroyGroup(group);
    groups.splice(idx, 1);
    if (focusedGroup === group) focusedGroup = groups[0] || null;
  };
  overlay._pcrSetFocusedGroup = (groupId) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || focusedGroup === group) return;
    focusedGroup = group;
    if (group.activeNode) {
      relocateFooter(group.activeNode);
      relocateAiAssistant(group.activeNode, group);
    }
  };
  // Load a tab's content into a specific group's editor without changing
  // focus. Used after tab drag-drops to refresh the *source* group, since
  // onSelectNode/onWildcardClick always target the focused group and the
  // source's editor would otherwise keep showing the dragged-out tab.
  overlay._pcrLoadTabInGroup = (groupId, tab) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || !group.editorView) return;
    if (!tab) {
      flushEditorSync();
      resetEditorContent(group.editorView, "");
      group.activeNode = null;
      group.activeWildcardTab = null;
      if (group.mountEl) group.mountEl._pcrNode = null;
      return;
    }
    if (tab.type === "wildcard") {
      fetch(`/promptchain/wildcard/content?name=${encodeURIComponent(tab.wildcardName)}`)
        .then(r => r.json())
        .then(data => {
          if (data.error || !group.editorView) return;
          resetEditorContent(group.editorView, data.content || "");
          group.activeNode = null;
          group.activeWildcardTab = tab.wildcardName;
          if (highlight) highlight.setHighlightState(group.editorView, { mode: "combine", switchIndex: 0 });
          if (wildcardBadge) { wildcardBadge.setNode(null); wildcardBadge.refreshBadges(group.editorView); }
          if (group.mountEl) group.mountEl._pcrNode = null;
        })
        .catch(() => {});
      return;
    }
    const node = tab.node;
    if (!node) return;
    group.activeNode = node;
    group.activeWildcardTab = null;
    const pw = node.widgets?.find(w => w.name === "prompt");
    resetEditorContent(group.editorView, pw?.value || "");
    if (highlight) {
      const mode = node.properties?.pcrMode || "switch";
      const switchIndex = node.properties?.pcrSwitchIndex ?? 0;
      highlight.setHighlightState(group.editorView, { mode, switchIndex });
    }
    if (wildcardBadge) {
      wildcardBadge.setNode(node);
      wildcardBadge.refreshBadges(group.editorView);
    }
    if (group.mountEl) group.mountEl._pcrNode = node;
    if (group === focusedGroup) relocateAiAssistant(node, group);
  };

  // set initial compiled output from root
  state.compiledOutput = root.properties?.pcrCompiledOutput || root._pcrOutputText || "";
  state.compiledNegOutput = root.properties?.pcrCompiledNegOutput || root._pcrNegOutputText || "";

  // init output font size CSS variable
  outputFontSize = root.properties?.pcrOutputFontSize || CONFIG.defaultFontSize;
  const editorAreaEl = overlay.querySelector(".pcr-fs-editor-area");
  if (editorAreaEl) editorAreaEl.style.setProperty("--pcr-output-font-size", `${outputFontSize}px`);

  // Push workflow-level preview state into the anchor's properties so
  // relocateRootPanels' existing read-and-apply restores the panels to
  // the open/closed/sized state they had at last session-close, even
  // when a different PromptChain owned them then.
  applyWfFsToProps(root);

  // relocate root node's output + image panels into fullscreen layout
  relocateRootPanels(root);
  hookRootToggles(root);
  cleanupFns.push(() => unhookRootToggles());

  // Record the anchor at session start so workflow saves serialize it
  // even if no generation runs this session.
  const wfFs = getWfFs();
  if (wfFs) wfFs.activeOutputNodeId = root.id;

  // wire topbar panel toggle buttons to the relocated panels
  outputBtn = overlay.querySelector('[title="Toggle output panel"]');
  imageBtn = overlay.querySelector('[title="Toggle image preview"]');
  poseBtn = overlay.querySelector('[title="Toggle 3D Poser panel"]');
  if (outputBtn) {
    const handler = (e) => {
      e.stopPropagation();
      if (!rootNode?._pcrOutputPanel) return;
      rootNode._pcrOutputPanel.toggle();
      const isOpen = rootNode._pcrOutputPanel.getIsOpen();
      updateToggleButton(outputBtn, isOpen);
      if (isOpen && rootRelocated) {
        const area = overlay.querySelector(".pcr-fs-editor-area");
        if (area) {
          adoptLazyPanel(rootNode, ".pcr-editor-frame", ".pcr-output-panel-resize", ".pcr-output-panel", area, "outputHandle", "outputPanel", "outputPanelDomHeight");
        }
      }
      const wf = getWfFs();
      if (wf) wf.outputOpen = isOpen;
    };
    outputBtn.addEventListener("click", handler);
    cleanupFns.push(() => outputBtn.removeEventListener("click", handler));
  }
  if (imageBtn) {
    const handler = (e) => {
      e.stopPropagation();
      if (!rootNode?._pcrImagePanel) return;
      rootNode._pcrImagePanel.toggle();
      const isVisible = rootNode._pcrImagePanel.getIsVisible();
      updateToggleButton(imageBtn, isVisible);
      if (isVisible && rootRelocated) {
        const main = overlay.querySelector(".pcr-fs-main");
        if (main) {
          adoptLazyPanel(rootNode, ".pcr-editor-row", ".pcr-image-divider", ".pcr-image-panel", main, "imageDivider", "imagePanel", "imagePanelDomWidth");
        }
      }
      const wf = getWfFs();
      if (wf) wf.imageOpen = isVisible;
    };
    imageBtn.addEventListener("click", handler);
    cleanupFns.push(() => imageBtn.removeEventListener("click", handler));
  }
  if (poseBtn) {
    const handler = (e) => {
      e.stopPropagation();
      if (!rootNode?._pcrPosePanel) return;
      rootNode._pcrPosePanel.toggle();
      const isVisible = rootNode._pcrPosePanel.getIsVisible();
      updateToggleButton(poseBtn, isVisible);
      // Panel is always relocated at entry; this is a defensive no-op if so,
      // and prepends it left-of-editor-area if it was somehow missed.
      if (isVisible && rootRelocated) {
        const main = overlay.querySelector(".pcr-fs-main");
        const panel = main?.querySelector(".pcr-pose-panel");
        if (main && panel && panel.parentElement !== main) {
          main.insertBefore(panel, main.firstChild);
        }
      }
      const wf = getWfFs();
      if (wf) wf.poseOpen = isVisible;
    };
    poseBtn.addEventListener("click", handler);
    cleanupFns.push(() => poseBtn.removeEventListener("click", handler));
  }
  // init toggle button states
  updateToggleButton(outputBtn, !!root._pcrOutputPanel?.getIsOpen?.());
  updateToggleButton(imageBtn, !!root._pcrImagePanel?.getIsVisible?.());
  updateToggleButton(poseBtn, !!root._pcrPosePanel?.getIsVisible?.());

  // Footer relocation for the initial group's active node happens inside
  // _pcrCreateEditorInGroup when Svelte's EditorGroup mounts. By the time
  // we reach here the editor may not yet exist.

  // execution state tracking (queue badge, cancel visibility, run active)
  const runBtn = overlay.querySelector(".pcr-fs-run-btn");
  const cancelBtn = overlay.querySelector(".pcr-fs-cancel-btn");
  const queueBadge = overlay.querySelector(".pcr-fs-queue-badge");

  function updateQueueState() {
    api.getQueue().then(q => {
      const count = (q.Running?.length || 0) + (q.Pending?.length || 0);
      const running = (q.Running?.length || 0) > 0;
      if (queueBadge) {
        queueBadge.textContent = `${count} active`;
        queueBadge.classList.toggle("pcr-fs-inactive", count === 0);
      }
      if (cancelBtn) cancelBtn.classList.toggle("pcr-fs-inactive", !running);
      if (runBtn) runBtn.classList.toggle("pcr-fs-run-active", running);
    }).catch(() => {});
  }
  updateQueueState();

  const onExecStart = () => updateQueueState();
  const onExecDone = () => {
    requestAnimationFrame(updateQueueState);
    const r = focusedGroup.activeNode ? findRoot(focusedGroup.activeNode) : root;
    state.compiledOutput = r.properties?.pcrCompiledOutput || r._pcrOutputText || "";
    state.compiledNegOutput = r.properties?.pcrCompiledNegOutput || r._pcrNegOutputText || "";
    // rebuild tree so wildcard results and roll selections update
    state.treeRoots = computeTreeRoots();
  };
  const onProgress = () => {
    if (cancelBtn) cancelBtn.classList.remove("pcr-fs-inactive");
    if (runBtn) runBtn.classList.add("pcr-fs-run-active");
  };
  api.addEventListener("execution_start", onExecStart);
  api.addEventListener("executed", onExecDone);
  api.addEventListener("execution_interrupted", onExecDone);
  api.addEventListener("execution_error", onExecDone);
  api.addEventListener("progress", onProgress);
  cleanupFns.push(() => {
    api.removeEventListener("execution_start", onExecStart);
    api.removeEventListener("executed", onExecDone);
    api.removeEventListener("execution_interrupted", onExecDone);
    api.removeEventListener("execution_error", onExecDone);
    api.removeEventListener("progress", onProgress);
  });

  requestAnimationFrame(() => focusedGroup.editorView?.focus());
}

export function hideSvelteFullscreen() {
  // flush pending wildcard save
  if (focusedGroup?.activeWildcardTab && focusedGroup.editorView) {
    saveWildcardContent(focusedGroup.activeWildcardTab, focusedGroup.editorView.state.doc.toString());
  }
  flushEditorSync();

  // persist output-panel font size. Per-pane editor font sizes live in
  // each leaf of pcrFsGroups.root; no global editor font size is kept.
  if (rootNode?.properties) {
    rootNode.properties.pcrOutputFontSize = outputFontSize;
  }

  restoreFooter();
  restoreAiAssistantPanel();
  restoreRootPanels();
  for (const g of groups) destroyGroup(g);
  groups = [];
  focusedGroup = null;
  if (instance && svelteModule) { svelteModule.destroyFullscreen(instance); instance = null; }
  if (overlay?.parentNode) overlay.remove();
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
  overlay = null;
  state = null;
  highlight = null;
  wildcardBadge = null;
  rootNode = null;
  rootRelocated = null;
  relocated = null;
  outputBtn = null;
  imageBtn = null;
  poseBtn = null;
  cmModule = null;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  if (treeRefreshTimer) { clearTimeout(treeRefreshTimer); treeRefreshTimer = null; }
  if (wildcardSaveTimer) { clearTimeout(wildcardSaveTimer); wildcardSaveTimer = null; }
}

export function isSvelteFullscreenActive() { return !!overlay; }

// Called from main.js on every execution_start with the PromptChain
// node whose downstream KSampler is about to run. Persists the anchor
// id to graph.extra (so workflow reload remembers it) and, if the
// fullscreen overlay is currently open, swaps the relocated preview
// panels onto that node's panels.
export function setFsActiveOutputNode(pcNode) {
  if (!pcNode || !isPromptChain(pcNode)) return;
  const newAnchor = findRoot(pcNode);
  if (!newAnchor) return;
  const wf = getWfFs();
  if (wf) wf.activeOutputNodeId = newAnchor.id;
  if (!overlay || newAnchor === rootNode) return;
  swapRootPanels(newAnchor);
}
