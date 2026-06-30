// PromptChain — extension registration and lifecycle hooks.
// All logic lives in lib/. This file stays thin.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { MIN_NODE_SIZE, getMinNodeSize, isVueMode, NODE_TYPE } from "./lib/config.js";
import { injectStyles } from "./lib/global-styles.js";
import { isolateEvents, installGlobalIsolation, removeWheelContainer } from "./lib/isolation.js";
import { loadCodeMirror, createEditor } from "./lib/editor.js";
import { createModelIndicator } from "./lib/model-indicator-bridge.js";
import { createTagsDropdown } from "./lib/tags-dropdown.js";
import { activateTagAutocomplete } from "./lib/autocomplete.js";
import { checkOnboarding } from "./lib/onboarding.js";
import { runUpdateCheck, checkUpdateStatus } from "./lib/update-check.js";
import { createDocumentDropdown } from "./lib/documents.js";
import { setModeOnNode, handleLockCascade, handleDisableCascade, handleCollapse, updateCollapsedHeight, updateOverlay, cleanupOverlayObserver } from "./lib/menubar-utils.js";
import { applyVueMinWidthAll } from "./lib/sizing.js";
import { attachSlotClickHandlers, attachCanvasClickHandler } from "./lib/slot-dropdown.js";
import { getConnectedInputs, getLinkInfo } from "./lib/slot-utils.js";
import { poseRegistry } from "./lib/pose-registry.js";
import { regionBoxRegistry } from "./lib/region-box-registry.js";
import { updateInputLabels, updateParentLabels, checkWildcardConflict, cleanupOrderChain } from "./lib/order-chain.js";
import { createHighlightExtension } from "./lib/active-label-highlight.js";
import { createWildcardBadgeExtension } from "./lib/wildcard-badge.js";
import { updateDynamicOutputs, initializeOutputSlots, healRegionsLinks, invalidateFluxCache, autoConnectToSampler } from "./lib/dynamic-outputs.js";
import { setupIterateListeners, advanceAndCascade } from "./lib/iterate-hierarchy.js";
import { setupShiftSync } from "./lib/krea2-shift-sync.js";
import { getSwitchOptions, countLabeledOptions } from "./lib/label-utils.js";
import { getWorkflowId, installSaveInterceptor, healWorkflowIdDrift } from "./lib/workflow-id.js";
import { recordGeneration, fetchWorkflowImages, fetchWorkflowCount, subscribe as subscribeHistory, invalidateCache, getCachedImages, externallyTrackedPrompts, isExternalPrompt } from "./lib/history.js";
import { renderAiSetting } from "./lib/settings/ai-setting.js";
import { renderInstallSetting } from "./lib/settings/install-setting.js";
import { renderAboutSetting } from "./lib/settings/about-setting.js";
import { installWorkflowBlankStateFix } from "./lib/patches/workflow-blank-state.js";

// Install loadGraphData intercept at module load — must land before Vue
// mounts GraphCanvas (whose onMounted triggers initializeWorkflow).
installWorkflowBlankStateFix();

// ComfyUI drops a freshly-created node with its top-left at the viewport center
// (litegraphService.getCanvasCenter), so a large node hangs into the lower-right
// quadrant. Re-anchor it so the whole node — title bar included — is centered.
function centerNodeInViewport(node) {
  const visibleArea = app.canvas?.ds?.visible_area;
  if (!visibleArea) return;
  const dpi = Math.max(window.devicePixelRatio ?? 1, 1);
  const [areaX, areaY, areaW, areaH] = visibleArea;
  const centerX = areaX + areaW / dpi / 2;
  const centerY = areaY + areaH / dpi / 2;
  const [width, height] = node.size;
  const titleHeight = window.LiteGraph?.NODE_TITLE_HEIGHT ?? 30;
  node.pos = [centerX - width / 2, centerY - height / 2 + titleHeight / 2];
}

// --- Svelte node widget (lazy-loaded) ---

let _svelteNodeModule = null;
let _svelteCssLoaded = false;

function ensureSvelteCSS() {
  if (_svelteCssLoaded) return;
  _svelteCssLoaded = true;
  if (!document.querySelector('link[href*="promptchain-svelte.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./lib/svelte/assets/promptchain-svelte.css", import.meta.url).href;
    document.head.appendChild(link);
  }
}

async function loadSvelteNode() {
  if (_svelteNodeModule) return _svelteNodeModule;
  ensureSvelteCSS();
  _svelteNodeModule = await import("./lib/svelte/promptchain-node.js");
  return _svelteNodeModule;
}

// Sync shared reactive state from node properties + graph state.
// Call this after any external property change so Svelte re-renders.
function syncShared(node, shared) {
  if (!shared) return;
  shared.mode = node.properties?.pcrMode || "switch";
  shared.switchIndex = node.properties?.pcrSwitchIndex ?? 1;
  shared.locked = !!node.properties?.pcrLocked;
  shared.disabled = !!node.properties?.pcrDisabled;
  shared.collapsed = !!node.properties?.pcrCollapsed;
  shared.connectedCount = getConnectedInputs(node).length;
  shared.hasLabels = /^::([^:]+)::/m.test(
    node.widgets?.find(w => w.name === "prompt")?.value || ""
  );
  let options = getSwitchOptions(node);

  // Follow the selected self-label by name across text edits. Without this,
  // inserting a label above the selected one silently shifts the selection
  // to whatever now sits at that raw index. Only reconcile when the label
  // list itself changed (text edit) — an explicit user click on a different
  // label arrives with the list unchanged and must not be reverted.
  const isSelfLabelMode = shared.connectedCount === 0 && options.length > 0;
  const optionsKey = options.map(o => o.label).join(" ");
  const labelsChanged = optionsKey !== node._pcrLastOptionsKey;
  if (isSelfLabelMode && shared.mode === "switch") {
    const atIndex = options.find(o => o.index === shared.switchIndex);
    const remembered = node._pcrSelectedLabelName;
    if (labelsChanged && remembered && (!atIndex || atIndex.label !== remembered)) {
      const moved = options.find(o => o.label === remembered);
      if (moved) {
        node.properties.pcrSwitchIndex = moved.index;
        shared.switchIndex = moved.index;
        const siWidget = node.widgets?.find(w => w.name === "switch_index");
        if (siWidget) siWidget.value = moved.index;
      }
    }
    const finalAt = options.find(o => o.index === shared.switchIndex);
    if (finalAt) node._pcrSelectedLabelName = finalAt.label;
  } else {
    node._pcrSelectedLabelName = null;
  }
  node._pcrLastOptionsKey = optionsKey;

  shared.switchOptions = options;
  if (shared.mode === "switch") {
    shared.switchLabel = options.find(o => o.index === shared.switchIndex)?.label || "";
  } else {
    shared.switchLabel = "";
  }
  shared.iterateCurrent = node.properties?.pcrIterateCurrent ?? 0;
  shared.iterateTotal = countLabeledOptions(node) || (node.properties?.pcrIterateTotal ?? 0);
  shared.iterateCycle = node.properties?.pcrIterateCycle ?? 1;
  shared.outputPanelOpen = !!node.properties?.pcrOutputPanel;
  shared.imagePanelVisible = !!node.properties?.pcrImagePreview;
  shared.posePanelVisible = !!node.properties?.pcrPosePanel;
  shared.regionPanelVisible = !!node.properties?.pcrRegionPanel;
}

// --- Image preview: execution tracking + graph traversal ---

const _outputToPC = new Map();
const _ksamplerToPC = new Map();      // ksamplerNodeId → PromptChain[] (progress/preview routing)
const _executionMeta = new Map();     // ksamplerNodeId → {seed, model, steps, cfg, …}
const _saveNodeGraph = new Map();     // saveNodeId → { pcNode, parentSaveId, ksampleId, loadImageParent }
const _savedOutputs = new Map();      // saveNodeId → "subfolder/filename"
let _executingNodeId = null;
let _executionWorkflowId = null;
let _lastPreviewUrl = null;

// SaveVideo/SaveWEBM are terminal outputs too: they emit a PreviewVideo UI
// payload shaped like images ({images:[{filename,subfolder,type}], animated})
// so the executed handler treats them uniformly. Without them here the panel's
// generating-node map never includes the video node, so hideProgress() never
// fires and the preview stays stuck on "Generating…" after a video finishes.
const OUTPUT_NODE_TYPES = new Set(["SaveImage", "PreviewImage", "SaveVideo", "SaveWEBM"]);
const KSAMPLER_TYPES = new Set(["KSampler", "KSamplerAdvanced", "PromptChain_RegionalDetailer", "SamplerCustomAdvanced", "UltimateSDUpscale", "UltimateSDUpscaleNoUpscale", "PromptChain_IdeogramSampler", "ClownsharKSampler_Beta"]);
const IMAGE_LATENT_TYPES = new Set(["IMAGE", "LATENT"]);
const LOAD_IMAGE_TYPES = new Set(["LoadImage"]);

function findDownstreamByType(startNode, targetTypes) {
  const found = [];
  const visited = new Set();
  const queue = [startNode];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    for (const output of (n.outputs || [])) {
      for (const linkId of (output.links || [])) {
        const link = getLinkInfo(linkId);
        if (!link) continue;
        const target = app.graph?.getNodeById(link.target_id);
        if (!target) continue;
        if (targetTypes.has(target.comfyClass || target.type)) found.push(target);
        queue.push(target);
      }
    }
  }
  return found;
}

// BFS backward through input links to find a node of a given type.
// followTypes restricts which input slot types are traversed (null = all).
function findUpstreamByType(startNode, targetTypes, followTypes) {
  const visited = new Set();
  const queue = [startNode];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    for (const input of (n.inputs || [])) {
      if (input.link == null) continue;
      if (followTypes && !followTypes.has(input.type)) continue;
      const link = getLinkInfo(input.link);
      if (!link) continue;
      const source = app.graph?.getNodeById(link.origin_id);
      if (!source) continue;
      if (targetTypes.has(source.comfyClass || source.type)) return source;
      queue.push(source);
    }
  }
  return null;
}

// Walk backward from a SaveImage through IMAGE/LATENT links. At each node,
// check if its IMAGE/LATENT outputs also connect to a different SaveImage.
// The first such sibling found is the graph parent (saves the pre-modification image).
function findParentSaveNode(saveNode, allSaveIds) {
  const visited = new Set();
  const queue = [saveNode];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    for (const output of (n.outputs || [])) {
      if (!IMAGE_LATENT_TYPES.has(output.type)) continue;
      for (const linkId of (output.links || [])) {
        const link = getLinkInfo(linkId);
        if (!link) continue;
        if (link.target_id !== saveNode.id && allSaveIds.has(link.target_id))
          return link.target_id;
      }
    }
    for (const input of (n.inputs || [])) {
      if (input.link == null || !IMAGE_LATENT_TYPES.has(input.type)) continue;
      const link = getLinkInfo(input.link);
      if (!link) continue;
      const source = app.graph?.getNodeById(link.origin_id);
      if (source && !visited.has(source.id)) queue.push(source);
    }
  }
  return null;
}

// Read widget value by name from a node (returns undefined if not found)
function readWidget(node, name) {
  const w = node.widgets?.find(w => w.name === name);
  return w?.value;
}

// Capture generation metadata from a KSampler's widgets and upstream model loader
function captureKSamplerMeta(ksNode) {
  const meta = {
    seed: readWidget(ksNode, "seed"),
    steps: readWidget(ksNode, "steps"),
    cfg: readWidget(ksNode, "cfg"),
    sampler: readWidget(ksNode, "sampler_name"),
    scheduler: readWidget(ksNode, "scheduler"),
    denoise: readWidget(ksNode, "denoise"),
  };
  for (const input of ksNode.inputs || []) {
    if (input.type !== "MODEL" || input.link == null) continue;
    const link = getLinkInfo(input.link);
    if (!link) continue;
    const source = app.graph?.getNodeById(link.origin_id);
    if (!source) continue;
    const ckpt = readWidget(source, "ckpt_name") || readWidget(source, "unet_name");
    if (ckpt) { meta.model = ckpt; break; }
  }
  return meta;
}

// Pre-compute per-SaveImage lineage from graph topology:
// parent SaveImage (shares image source), nearest KSampler, img2img LoadImage fallback.
function buildSaveNodeGraph(pcSaveNodes) {
  const allSaveIds = new Set(pcSaveNodes.keys());
  for (const [saveId, pcNode] of pcSaveNodes) {
    const saveNode = app.graph?.getNodeById(saveId);
    if (!saveNode) continue;
    const parentSaveId = findParentSaveNode(saveNode, allSaveIds);
    const nearestKS = findUpstreamByType(saveNode, KSAMPLER_TYPES, IMAGE_LATENT_TYPES);
    let loadImageParent = null;
    if (!parentSaveId) {
      const loadImage = findUpstreamByType(saveNode, LOAD_IMAGE_TYPES, IMAGE_LATENT_TYPES);
      if (loadImage) {
        const imgWidget = readWidget(loadImage, "image");
        if (imgWidget) loadImageParent = imgWidget.replace(/\s*\[(input|output)\]\s*$/, "");
      }
    }
    _saveNodeGraph.set(saveId, { pcNode, parentSaveId, ksampleId: nearestKS?.id ?? null, loadImageParent });
  }
}

function setupImagePreviewListeners() {
  // Background viewer runs (inpaint/upscale Apply) execute prompts that have
  // nothing to do with the open graph. Without this gate, execution_start
  // darkened every PC panel into a spinner that nothing ever resolved (their
  // executed events are skipped below), and the external run's progress/
  // preview events could drive panels on node-id collisions.
  let _externalRun = false;

  api.addEventListener("execution_start", ({ detail }) => {
    // isExternalPrompt (not a bare .has) closes a race: a background run
    // registers its prompt id only after its queue POST resolves, which can
    // land AFTER this event — the armed-window guard claims it anyway, so the
    // spinner never starts on a run whose completion we'll skip.
    _externalRun = isExternalPrompt(detail?.prompt_id);
    if (_externalRun) return;
    _outputToPC.clear();
    _ksamplerToPC.clear();
    _executionMeta.clear();
    _saveNodeGraph.clear();
    _savedOutputs.clear();
    _executingNodeId = null;
    _executionWorkflowId = getWorkflowId();
    if (_lastPreviewUrl) { URL.revokeObjectURL(_lastPreviewUrl); _lastPreviewUrl = null; }

    const pcSaveNodes = new Map();
    let primaryPc = null;

    for (const node of app.graph?._nodes || []) {
      if (node.comfyClass !== NODE_TYPE) continue;

      const downstreamOut = findDownstreamByType(node, OUTPUT_NODE_TYPES);
      for (const out of downstreamOut) {
        if (!_outputToPC.has(out.id)) _outputToPC.set(out.id, []);
        const list = _outputToPC.get(out.id);
        if (!list.some(n => n.id === node.id)) list.push(node);
        if (!pcSaveNodes.has(out.id)) pcSaveNodes.set(out.id, node);
      }

      const downstreamKs = findDownstreamByType(node, KSAMPLER_TYPES);
      if (downstreamKs.length && !primaryPc) primaryPc = node;
      for (const ks of downstreamKs) {
        if (!_ksamplerToPC.has(ks.id)) _ksamplerToPC.set(ks.id, []);
        const list = _ksamplerToPC.get(ks.id);
        if (!list.some(n => n.id === node.id)) list.push(node);
        if (!_executionMeta.has(ks.id)) _executionMeta.set(ks.id, captureKSamplerMeta(ks));
      }

      // Only mark a PC as generating if its output actually reaches a
      // sampler or save node — otherwise the `executed` event has no
      // way to route back here, leaving the indeterminate spinner stuck.
      if (downstreamOut.length || downstreamKs.length) {
        node._pcrImagePanel?.startGenerating();
        if (node._pcrImagePanel?.getIsVisible()) node._pcrImagePanel.showIndeterminate();
      }
    }

    buildSaveNodeGraph(pcSaveNodes);

    // Notify the fullscreen bridge which PromptChain owns this run so
    // its preview anchor follows the workflow's actual output, not the
    // tab the user happens to have focused. Persists the anchor id to
    // graph.extra even when fullscreen isn't open.
    if (primaryPc) {
      import("./lib/fullscreen-bridge.js")
        .then(m => m.setFsActiveOutputNode?.(primaryPc))
        .catch(() => {});
    }
  });

  api.addEventListener("executing", ({ detail }) => {
    if (_externalRun) return;
    _executingNodeId = detail != null ? Number(detail) : null;
  });

  api.addEventListener("progress", ({ detail }) => {
    if (_externalRun || !detail?.node) return;
    const nodeId = Number(detail.node);
    const pcNodes = _ksamplerToPC.get(nodeId);
    if (!pcNodes?.length) return;
    for (const pc of pcNodes) {
      const p = pc._pcrImagePanel;
      if (p?.getIsVisible()) p.showProgress(detail.value, detail.max);
    }
  });

  api.addEventListener("executed", ({ detail }) => {
    if (!detail?.output?.images?.length) return;
    // Background upscales record through their own tracker; the node-id maps
    // here describe the user's active graph, not that prompt's.
    if (detail.prompt_id && externallyTrackedPrompts.has(detail.prompt_id)) return;
    const nodeId = Number(detail.node);
    const img = detail.output.images[detail.output.images.length - 1];
    const params = new URLSearchParams({
      filename: img.filename,
      subfolder: img.subfolder || "",
      type: img.type || "output",
    });
    const imageUrl = api.apiURL(`/view?${params}&rand=${Math.random()}`);

    // A PreviewImage emits type "temp" — a transient guide map (e.g. the 3D
    // Poser depth control map), not a saved render. It still flashes in the
    // node panel to guide the user, but must never be recorded: the Generated
    // gallery holds saved outputs (SaveImage → "output") only.
    const isSavedOutput = (img.type || "output") === "output";

    let pcNodes = _outputToPC.get(nodeId);
    let wfId = _executionWorkflowId;
    if (!pcNodes?.length) {
      // The SaveImage didn't map to a PromptChain node via the execution_start
      // graph scan (trace miss / subgraph / workflow-id drift). Don't silently
      // drop the generation — diagnose, then attribute it to the active graph's
      // PromptChain node so the generation panel still catches it. A side-branch
      // preview (the pose depth map) is EXPECTED to be unmapped — don't warn.
      if (!wfId) wfId = getWorkflowId();
      const fallbackPC = (app.graph?._nodes || []).find((n) => n.comfyClass === NODE_TYPE);
      if (isSavedOutput) {
        console.warn(`[PromptChain][record] unmapped output node=${detail.node}->${nodeId} mapKeys=[${[..._outputToPC.keys()]}] wfId=${wfId} graphNodes=${app.graph?._nodes?.length} rootGraph=${!!app.rootGraph} fallbackPC=${fallbackPC?.id ?? "none"}`);
      }
      if (!fallbackPC || (isSavedOutput && !wfId)) return;
      pcNodes = [fallbackPC];
    }

    // Transient preview (PreviewImage / non-"output"): flash in the panel to
    // guide the user, then stop — no metadata, no gallery record.
    if (!isSavedOutput) {
      for (const pc of pcNodes) {
        pc._pcrImagePanel?.updateImage(imageUrl, null);
        pc._pcrImagePanel?.hideProgress();
      }
      return;
    }

    // metadata from graph-determined nearest KSampler
    const entry = _saveNodeGraph.get(nodeId);
    let meta = entry?.ksampleId != null ? { ..._executionMeta.get(entry.ksampleId) } : {};
    const primaryPC = entry?.pcNode || pcNodes[0];
    if (primaryPC) {
      meta.prompt = primaryPC._pcrOutputText || primaryPC.properties?.pcrCompiledOutput || "";
      meta.negative = primaryPC._pcrNegOutputText || primaryPC.properties?.pcrCompiledNegOutput || "";
      // Regional gens: the per-region breakdown JSON, so the viewer's prompt
      // panel can show $mannequin blocks instead of only the flattened text.
      meta.regions = primaryPC._pcrRegionsText || "";
    }

    // parent: graph-based SaveImage chain, then img2img LoadImage fallback
    if (entry?.parentSaveId != null) {
      const parentOutput = _savedOutputs.get(entry.parentSaveId);
      if (parentOutput) meta.parent_filename = parentOutput;
    } else if (entry?.loadImageParent) {
      meta.parent_filename = entry.loadImageParent;
    }

    const outputPath = img.subfolder ? `${img.subfolder}/${img.filename}` : img.filename;
    _savedOutputs.set(nodeId, outputPath);

    // Fire recordGeneration first so we can hand its promise to the panel;
    // the panel awaits it on filename-click to resolve the exact hash even
    // if the click lands before the POST response writes the entry to cache.
    const genPromise = recordGeneration(
      wfId,
      img.filename,
      img.subfolder || "",
      img.type || "output",
      meta,
    );

    for (const pc of pcNodes) {
      pc._pcrImagePanel?.updateImage(imageUrl, genPromise);
      pc._pcrImagePanel?.hideProgress();
    }
  });

  api.addEventListener("b_preview", ({ detail: blob }) => {
    if (_externalRun || _executingNodeId == null) return;
    const pcNodes = _ksamplerToPC.get(_executingNodeId);
    if (!pcNodes?.length) return;
    if (_lastPreviewUrl) URL.revokeObjectURL(_lastPreviewUrl);
    const url = URL.createObjectURL(blob);
    _lastPreviewUrl = url;
    for (const pc of pcNodes) pc._pcrImagePanel?.updatePreview(url);
  });

  // revert preview on cancel/error — no executed event fires, so restore previous image
  for (const evt of ["execution_interrupted", "execution_error"]) {
    api.addEventListener(evt, () => {
      if (_externalRun) return;
      for (const pcList of _ksamplerToPC.values()) {
        for (const pc of pcList) pc._pcrImagePanel?.revertPreview();
      }
    });
  }

  // Viewer-initiated renders (edit/inpaint/upscale) run as externally tracked
  // prompts, so the `executed` recorder above never routes their result to a
  // node panel. When one records into this workflow's lineage, mirror it into
  // the preview panels. recordedWorkflowId === active id is the foreground
  // path — its panel already got the exact image. A panel mid-generation
  // keeps its live run's preview.
  window.addEventListener("promptchain:generation-recorded", ({ detail }) => {
    const { entry, recordedWorkflowId } = detail || {};
    const wid = getWorkflowId();
    if (!wid || wid === recordedWorkflowId) return;
    if (!entry?.workflows?.includes(wid)) return;
    const params = new URLSearchParams({
      filename: entry.filename,
      subfolder: entry.subfolder || "",
      type: entry.source_type || "output",
    });
    const imageUrl = api.apiURL(`/view?${params}&rand=${Math.random()}`);
    for (const node of app.graph?._nodes || []) {
      if (node.comfyClass !== NODE_TYPE) continue;
      if (node._pcrShared?.isGenerating) continue;
      node._pcrImagePanel?.updateImage(imageUrl, Promise.resolve(entry));
    }
  });
}

// Ctrl+Right-Click bypasses ComfyUI context menus for browser inspect
document.addEventListener("contextmenu", (e) => {
  if (e.ctrlKey) {
    e.stopImmediatePropagation();
  }
}, true);

// Work around ComfyUI autogrow cleanup bug: autogrowInputDisconnected uses
// groupInputs.slice((min-1)*stride) which becomes slice(-1) when min=0,
// effectively preventing removal of trailing empty slots.
function trimEmptyAutogrowSlots(node) {
  const inputs = node.inputs;
  if (!inputs) return;
  const agInputs = inputs.filter(inp => inp.name?.startsWith("inputs.in_"));
  if (agInputs.length <= 1) return;

  let lastConnected = -1;
  for (let i = agInputs.length - 1; i >= 0; i--) {
    if (agInputs[i].link != null) { lastConnected = i; break; }
  }

  // keep all connected + one trailing empty (autogrow convention), minimum 1
  const keepCount = Math.max(1, lastConnected + 2);
  if (keepCount >= agInputs.length) return;

  const toRemove = agInputs.slice(keepCount);
  for (const inp of toRemove) {
    const idx = inputs.indexOf(inp);
    if (idx !== -1) inputs.splice(idx, 1);
    if (inp.widget?.name && node.widgets) {
      const wIdx = node.widgets.findIndex(w => w.name === inp.widget.name);
      if (wIdx !== -1) {
        node.widgets[wIdx].onRemove?.();
        node.widgets.splice(wIdx, 1);
      }
    }
  }
  if (toRemove.length > 0) {
    // only grow to fit — never shrink below user's current size
    const minSize = node.computeSize?.();
    if (minSize) {
      const cur = node.size || [0, 0];
      node.setSize?.([Math.max(cur[0], minSize[0]), Math.max(cur[1], minSize[1])]);
    }
    app.canvas?.setDirty?.(true, true);
  }
}

app.registerExtension({
  name: "PromptChain",

  settings: [
    {
      id: "PromptChain.Install",
      category: ["PromptChain", "Features"],
      name: "Install features",
      // Low sortOrder → Features sits LAST among the PromptChain subcategories.
      sortOrder: 1,
      tooltip: "Install or check the 3rd-party features PromptChain can use (ControlNet, PuLID, Style Reference, upscalers, AI selection). Pick only what you need; each can be installed independently and is skipped if already present.",
      defaultValue: "",
      type: () => renderInstallSetting(),
    },
    {
      id: "PromptChain.About",
      category: ["PromptChain", "Features"],
      name: "About & help",
      // sortOrder below Install (1) → sits at the very bottom of Features.
      sortOrder: 0,
      tooltip: "Version info, a one-click update check, and a link to the docs.",
      defaultValue: "",
      type: () => renderAboutSetting(),
    },
    {
      id: "PromptChain.UpdateNotify",
      category: ["PromptChain", "Updates"],
      name: "Notify me about updates",
      type: "boolean",
      defaultValue: true,
      sortOrder: 1,
      tooltip: "Check for PromptChain updates in the background (at most once a day, when the tab is open or refocused) and show a prompt when one's available. Turning this off is the same as 'Never show again'.",
    },
    {
      id: "PromptChain.AutoUpdate",
      category: ["PromptChain", "Updates"],
      name: "Always update in background",
      type: "boolean",
      defaultValue: false,
      sortOrder: 0,
      tooltip: "When an update is found, stage it silently instead of prompting. It applies the next time you restart ComfyUI — PromptChain never restarts the server on its own.",
    },
    {
      id: "PromptChain.AutoSplitOutputs",
      category: ["PromptChain", "General"],
      name: "Automatic output slots",
      type: "boolean",
      defaultValue: true,
      // ComfyUI orders subcategories by the max sortOrder of any setting
      // in them (higher = earlier). Anchoring General at 20 puts it
      // between Gallery (30) and API Keys (10).
      sortOrder: 20,
      tooltip: "Automatically show positive/negative outputs when connected to a KSampler. Disable to always show all three outputs.",
      onChange() {
        invalidateFluxCache();
        for (const n of app.graph?._nodes || []) {
          if (n.comfyClass === NODE_TYPE) updateDynamicOutputs(n);
        }
      },
    },
    // Hidden alongside the AI Assistant (deferred) — uncomment to restore.
    /*
    {
      id: "PromptChain.AutoOpenAIAssistant",
      category: ["PromptChain", "General"],
      name: "Open AI Assistant on new nodes",
      type: "boolean",
      defaultValue: true,
      sortOrder: 19,
      tooltip: "When a provider is configured, open the AI Assistant panel automatically on a freshly created PromptChain node. Nodes you've closed it on (and saved workflows) keep their own state.",
    },
    */
    {
      id: "PromptChain.LineageView",
      category: ["PromptChain", "Gallery"],
      name: "Group images by lineage",
      type: "boolean",
      defaultValue: true,
      sortOrder: 31,
      tooltip: "Show one thumbnail per image family: upscales, inpaints, and edits collapse into their source image's card, with the latest version as the thumbnail. Clicking opens that version; older ones stay reachable with up/down in the viewer. Disable to list every image individually.",
      onChange(value) {
        window.dispatchEvent(new CustomEvent("promptchain:lineage-view-changed", { detail: { value } }));
      },
    },
    {
      id: "PromptChain.ShowOrphanedImages",
      category: ["PromptChain", "Gallery"],
      name: "Show orphaned images",
      type: "boolean",
      defaultValue: false,
      sortOrder: 30,
      tooltip: "Show thumbnails for images whose source files have been deleted. They appear dimmed with a red dashed border.",
      onChange(value) {
        for (const el of document.querySelectorAll(".pcr-gallery-wrapper")) {
          el.classList.toggle("pcr-gallery-show-orphans", value);
          el.dispatchEvent(new CustomEvent("pcr-orphan-toggle"));
        }
      },
    },
    {
      id: "PromptChain.CivitaiApiKey",
      category: ["PromptChain", "API Keys"],
      name: "CivitAI API key",
      sortOrder: 10,
      tooltip: "Required for downloading models from CivitAI. Get your key at civitai.com/user/account",
      // value unused — key is stored server-side in config.json, not in the settings store
      defaultValue: "",
      type(name, setter, value, attrs) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;align-items:center;gap:8px;width:100%;";

        const input = document.createElement("input");
        input.type = "password";
        input.placeholder = "Paste your API key...";
        input.spellcheck = false;
        input.autocomplete = "off";
        input.style.cssText = "flex:1;padding:6px 10px;background:var(--comfy-input-bg, #2a2a2a);border:1px solid var(--border-color, #555);border-radius:4px;color:var(--input-text, #ddd);font-size:13px;font-family:monospace;outline:none;";

        const status = document.createElement("span");
        status.style.cssText = "font-size:12px;white-space:nowrap;color:#888;";

        const saveBtn = document.createElement("button");
        saveBtn.textContent = "Save";
        saveBtn.disabled = true;
        saveBtn.style.cssText = "padding:5px 14px;border:none;border-radius:4px;background:var(--comfy-input-bg, #333);color:var(--input-text, #ddd);font-size:12px;cursor:pointer;opacity:0.5;";

        wrap.append(input, status, saveBtn);

        let validateTimer = null;
        let keyIsValid = false;

        // check existing key on render
        fetch("/promptchain/civitai/api-key")
          .then(r => r.json())
          .then(data => {
            if (!data.has_key) { status.textContent = "not set"; return; }
            input.placeholder = "•••••••• (key is set)";
            status.textContent = "✓ configured";
            status.style.color = "#4ec96b";
            // validate stored key
            return fetch("/promptchain/civitai/validate-key", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }).then(r => r.json()).then(v => {
              if (v.valid) {
                status.textContent = "✓ " + (v.username || "valid");
                status.style.color = "#4ec96b";
              } else {
                status.textContent = "✗ " + (v.error || "stored key invalid");
                status.style.color = "#e55";
              }
            });
          })
          .catch(() => {});

        let validateAbort = null;
        input.addEventListener("input", () => {
          clearTimeout(validateTimer);
          validateAbort?.abort();
          const val = input.value.trim();
          saveBtn.disabled = true;
          saveBtn.style.opacity = "0.5";
          keyIsValid = false;
          if (!val) { status.textContent = ""; status.style.color = "#888"; return; }
          status.textContent = "...";
          status.style.color = "#888";
          validateTimer = setTimeout(async () => {
            validateAbort = new AbortController();
            const signal = validateAbort.signal;
            try {
              const res = await fetch("/promptchain/civitai/validate-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: val }),
                signal,
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const data = await res.json();
              if (signal.aborted || input.value.trim() !== val) return;
              if (data.valid) {
                status.textContent = "✓ " + (data.username || "valid");
                status.style.color = "#4ec96b";
                saveBtn.disabled = false;
                saveBtn.style.opacity = "1";
                keyIsValid = true;
              } else {
                status.textContent = "✗ " + (data.error || "invalid");
                status.style.color = "#e55";
              }
            } catch (e) {
              if (e.name === "AbortError") return;
              console.error("[PromptChain] API key validation failed:", e);
              if (input.value.trim() === val) {
                status.textContent = "✗ connection failed";
                status.style.color = "#e55";
              }
            }
          }, 600);
        });

        saveBtn.addEventListener("click", async () => {
          const val = input.value.trim();
          if (!val || !keyIsValid) return;
          saveBtn.disabled = true;
          saveBtn.textContent = "Saving...";
          try {
            await fetch("/promptchain/civitai/api-key", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key: val }),
            });
            saveBtn.textContent = "✓ Saved";
            saveBtn.style.opacity = "0.5";
            input.value = "";
            input.placeholder = "•••••••• (key is set)";
            setTimeout(() => { saveBtn.textContent = "Save"; }, 1500);
          } catch {
            saveBtn.textContent = "Error";
            saveBtn.style.opacity = "1";
            saveBtn.disabled = false;
            setTimeout(() => { saveBtn.textContent = "Save"; }, 1500);
          }
        });

        return wrap;
      },
    },
    // AI Assistant deferred — re-enable in a later version (the chat panel is
    // still under active development). Commented out so the toggle doesn't ship;
    // default is off anyway, so the Assistant button stays hidden without it.
    /*
    {
      id: "PromptChain.AIAssistantEnabled",
      category: ["PromptChain", "AI"],
      name: "AI Assistant (experimental)",
      type: "boolean",
      defaultValue: false,
      sortOrder: 6,
      tooltip: "Show the AI Assistant button on PromptChain nodes. Experimental — the chat panel is under active development. First open walks you through provider setup (local Ollama or a cloud API key).",
      onChange(value) {
        window.dispatchEvent(new CustomEvent("promptchain:ai-assistant-enabled-changed", { detail: { value: value === true } }));
      },
    },
    */
    {
      id: "PromptChain.AI",
      category: ["PromptChain", "AI"],
      name: "AI provider",
      sortOrder: 5,
      tooltip: "Pick Claude API or a local OpenAI-compatible server (Ollama / llama.cpp / LM Studio). Powers the right-click 'Prompt Generator...' action in PromptChain editors.",
      defaultValue: "",
      type: () => renderAiSetting(),
    },
  ],

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "PromptChain_PromptChain") return;

    // 1.0 canvas overlay: paint lock/disable background via onDrawBackground
    const origDraw = nodeType.prototype.onDrawBackground;
    nodeType.prototype.onDrawBackground = function (ctx) {
      origDraw?.apply(this, arguments);

      const locked = this.properties?.pcrLocked && !this.properties?.pcrDisabled;
      const disabled = this.properties?.pcrDisabled;
      if ((!locked && !disabled) || this.flags?.collapsed) return;

      const stripeWidth = 6;
      const stripeGap = 18;
      const [w, h] = this.size;
      const radius = 8;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, [0, 0, radius, radius]);
      ctx.clip();

      if (disabled) {
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "#4a1a1a";
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = "#000000";
        const total = w + h + stripeGap;
        for (let x = -h - stripeGap; x < total; x += stripeGap) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + stripeWidth, 0);
          ctx.lineTo(x + h + stripeWidth, h);
          ctx.lineTo(x + h, h);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "#9e6e19";
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = "#000000";
        const total = w + h + stripeGap;
        for (let x = -h - stripeGap; x < total; x += stripeGap) {
          ctx.beginPath();
          ctx.moveTo(x, h);
          ctx.lineTo(x + stripeWidth, h);
          ctx.lineTo(x + h + stripeWidth, 0);
          ctx.lineTo(x + h, 0);
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.restore();
    };
  },

  afterConfigureGraph() {
    installGlobalIsolation();
    invalidateFluxCache();
    healWorkflowIdDrift(); // same tab reconfigured under a regenerated uuid → clone its generation history across
    // sanitize stale link references on autogrow inputs — autogrow can
    // leave orphaned link IDs on input slots after disconnect/undo.
    // ComfyUI's ExecutableNodeDTO throws if graph.getLink() returns null.
    for (const node of app.graph?._nodes || []) {
      if (node.comfyClass !== NODE_TYPE) continue;
      for (const input of node.inputs || []) {
        if (input.link != null && !getLinkInfo(input.link)) {
          console.warn(`[PromptChain] Clearing stale link ${input.link} on node ${node.id} input ${input.name}`);
          input.link = null;
        }
      }
      // trim trailing empty autogrow slots left from serialization
      trimEmptyAutogrowSlots(node);
      // repair slot-drifted regions links BEFORE the collapse pass — saves
      // exist where the old positional collapse slid a linked regions output
      // onto the positive index (flat text fed into the couple/conditioning)
      healRegionsLinks(node);
      // collapse unconnected pos/neg outputs synchronously — must happen
      // before ComfyUI's afterLoadNewGraph snapshot, otherwise the snapshot
      // records 3 outputs but the deferred rAF trims to 1, causing a false
      // "unsaved changes" dirty flag
      initializeOutputSlots(node, { skipRefresh: true });
    }

    // global connection change listener — re-evaluate dynamic outputs
    // when downstream nodes change (e.g. CLIPTextEncode connected to KSampler)
    // always re-install (undo/redo can replace graph.onConnectionChange)
    const origOnConnectionChange = app.graph._pcrOrigOnConnectionChange || app.graph.onConnectionChange;
    app.graph._pcrOrigOnConnectionChange = origOnConnectionChange;
    app.graph.onConnectionChange = function (...args) {
      origOnConnectionChange?.apply(this, args);
      invalidateFluxCache();
      for (const n of app.graph._nodes || []) {
        if (n.comfyClass !== NODE_TYPE) continue;
        // preserve user's node size across updates
        const savedSize = n.size ? [...n.size] : null;
        // clear stale link references left by deleted nodes
        for (const input of n.inputs || []) {
          if (input.link != null && !getLinkInfo(input.link)) {
            input.link = null;
          }
        }
        updateDynamicOutputs(n);
        updateInputLabels(n);
        checkWildcardConflict(n);
        n._pcrMenubar?.updateModeDisplay?.();
        if (n._pcrShared) syncShared(n, n._pcrShared);
        updateOverlay(n);
        // restore size — updates above can trigger Vue re-render that resets size
        if (savedSize) n.setSize?.(savedSize);
      }
    };

    requestAnimationFrame(() => {
      applyVueMinWidthAll(app.graph);
      // refresh all menubar displays and slot labels after connections are loaded
      for (const node of app.graph?._nodes || []) {
        if (node.comfyClass === NODE_TYPE) {
          node._pcrMenubar?.updateModeDisplay?.();
          updateInputLabels(node);
          checkWildcardConflict(node);
          // defer click handlers until Vue renders the new labels
          requestAnimationFrame(() => attachSlotClickHandlers(node));
        }
      }
    });
  },

  setup() {
    setupIterateListeners();
    setupShiftSync(); // krea2 RAW: keep the flow-shift node's w/h matched to render size
    setupImagePreviewListeners();
    checkOnboarding();
    // Surface the outcome of any just-applied update, then run the throttled
    // (24h) background update check. Event-driven, no timers: it fires here at
    // load and again whenever the tab regains focus.
    checkUpdateStatus();
    runUpdateCheck();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") runUpdateCheck();
    });
    loadSvelteNode(); // preload Svelte module in background

    // workflow UUID dedup — intercept saves to catch Save-As duplicates
    installSaveInterceptor();

    // asset browser sidebar
    import("./lib/sidebar-bridge.js").then(m => m.createSidebarTab()).catch(e => console.error("[PromptChain] sidebar registration failed:", e));

    // restore viewer from hash URI if present (e.g. shared link)
    import("./lib/viewer-bridge.js").then(m => m.restoreFromHash()).catch(e => console.error("[PromptChain] viewer restore failed:", e));

    // undo/redo: Ctrl+Z recreates all nodes but no post-undo hook fires
    // after async nodeCreated completes. Double-RAF to refresh after settle.
    window.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toUpperCase();
      if ((key === "Z" && !e.shiftKey) || key === "Y" || (key === "Z" && e.shiftKey)) {
        // ChangeTracker._restoringState runs inside a RAF with async awaits
        // (configure → loadGraphData → nodeCreated are all async). No public
        // event fires when restore completes. 6 frames covers the observed
        // worst case: 1 undo RAF + 1 configure + 2 async nodeCreated + 2 settle.
        let f = 6;
        const fsActiveNow = () => !!document.querySelector(".pcr-fs-overlay");
        // Vue's WidgetDOM keys on nodeId+widgetName so it reuses the same
        // component instance after a graph-level undo/redo. Its onMounted
        // runs once — the fresh container our new nodeCreated creates never
        // gets placed into the Vue wrapper, leaving the stale empty
        // .pcr-editor visible while our Svelte-mounted container sits
        // orphaned. Re-attach ASAP (every frame) so there's no visible
        // flicker of an empty node body before the 6-frame settle.
        const reAttachOrphans = () => {
          if (fsActiveNow()) return;
          for (const n of app.graph?._nodes || []) {
            if (n.comfyClass !== NODE_TYPE) continue;
            const ew = n.widgets?.find(w => w.name === "pcr_editor");
            const el = ew?.element;
            if (!el || document.body.contains(el)) continue;
            const liveEl = document.querySelector(`[data-node-id="${n.id}"]`);
            if (!liveEl) continue;
            const stale = liveEl.querySelector(".pcr-editor");
            const wrapper = stale?.parentElement;
            if (wrapper) wrapper.replaceChildren(el);
          }
        };
        const tick = () => {
          reAttachOrphans();
          if (--f > 0) { requestAnimationFrame(tick); return; }
          // fullscreen editor manages its own undo — skip widget→editor re-sync
          const fsActive = fsActiveNow();
          for (const n of app.graph?._nodes || []) {
            if (n.comfyClass !== NODE_TYPE) continue;
            checkWildcardConflict(n);
            updateInputLabels(n);
            n._pcrMenubar?.updateModeDisplay?.();
            if (n._pcrShared) syncShared(n, n._pcrShared);
            // safety net: if editor diverged from promptWidget during
            // graph-level undo/redo, force re-sync from the widget
            // (which holds the correct value from widgets_values[0])
            if (!fsActive) {
              const pw = n.widgets?.find(w => w.name === "prompt");
              if (n._pcrEditor && pw) {
                const editorText = n._pcrEditor.state.doc.toString();
                if (editorText !== (pw.value || "")) {
                  n._pcrEditor.dispatch({
                    changes: { from: 0, to: editorText.length, insert: pw.value || "" },
                  });
                }
              }
            }
            // patch live DOM menubar (node's menubar may be detached after undo)
            const liveEl = document.querySelector(`[data-node-id="${n.id}"]`);
            if (liveEl && n.properties?.pcrMode === "iterate") {
              const total = countLabeledOptions(n);
              const cur = n.properties?.pcrIterateCurrent ?? 0;
              const cycle = n.properties?.pcrIterateCycle ?? 1;
              const label = liveEl.querySelector(".pcr-menubar-mode-label");
              if (label && total > 0) {
                const display = `(${cur + 1}/${total})`;
                label.textContent = cycle > 1 ? `${display} x${cycle}` : display;
              }
            }
          }
        };
        requestAnimationFrame(tick);
      }
    }, true);

    let lastVueMode = isVueMode();

    const onVueModeChange = () => {
      const current = isVueMode();
      if (current === lastVueMode) return;
      lastVueMode = current;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          applyVueMinWidthAll(app.graph);
          // Vue destroyed and recreated all DOM elements — rebuild slot click handlers
          if (current) {
            for (const node of app.graph?._nodes || []) {
              if (node.comfyClass === NODE_TYPE) {
                updateInputLabels(node);
                requestAnimationFrame(() => attachSlotClickHandlers(node));
              }
            }
          }
        })
      );
    };

    // Intercept LiteGraph.vueNodesMode setter to detect mode changes
    const LG = window.LiteGraph;
    if (LG) {
      const desc = Object.getOwnPropertyDescriptor(LG, 'vueNodesMode') ||
                   Object.getOwnPropertyDescriptor(Object.getPrototypeOf(LG) || {}, 'vueNodesMode');
      let _val = LG.vueNodesMode ?? false;
      const origGet = desc?.get;
      const origSet = desc?.set;
      Object.defineProperty(LG, 'vueNodesMode', {
        get() { return origGet ? origGet.call(LG) : _val; },
        set(v) {
          if (origSet) origSet.call(LG, v);
          else _val = v;
          onVueModeChange();
        },
        configurable: true,
        enumerable: true,
      });
    }
  },

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // block updateDynamicOutputs until initial setup completes — during paste,
    // other connections fire graph.onConnectionChange before this node's own
    // links are restored, causing pos/neg outputs to be removed prematurely
    node._pcrInitializing = true;

    const promptWidget = node.widgets?.find((w) => w.name === "prompt");
    if (!promptWidget) return;

    // Disable ComfyUI's autogrow bubble-up: on disconnect it shifts all
    // connections up to fill the gap, causing double-links and reordering.
    // A high min makes autogrowInputDisconnected return early for all slots.
    // trimEmptyAutogrowSlots handles trailing cleanup instead (bottom-only).
    if (node.comfyDynamic?.autogrow?.inputs) {
      node.comfyDynamic.autogrow.inputs.min = 100;
    }

    // prevent ComfyUI's "Hide advanced inputs" footer bar
    node.showAdvanced = undefined;
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
      origOnConfigure?.call(this, info);
      this._pcrFromWorkflow = true;
      // Persistent flag: onConfigure fires only on workflow-sourced nodes.
      // `_pcrFromWorkflow` is cleared in a rAF, but the intro-size rAF
      // below can race past that clear and slam a resized node to 970x650.
      // A never-cleared flag is the reliable guard.
      this._pcrEverConfigured = true;
      this.showAdvanced = undefined;
      // LiteGraph.configure() fires onConnectionsChange per slot BEFORE onConfigure,
      // so auto-mode logic may have corrupted pcrMode. Restore from saved workflow data.
      const saved = info?.properties;
      if (saved) {
        if (saved.pcrMode !== undefined) this.properties.pcrMode = saved.pcrMode;
        if (saved.pcrSwitchIndex !== undefined) this.properties.pcrSwitchIndex = saved.pcrSwitchIndex;
      }
      // Backfill from widget values when properties are missing. Legacy
      // workflows (and workflows saved before pcrMode/pcrSwitchIndex were
      // mirrored into properties) only carry mode/switch_index in
      // widgets_values, leaving properties.pcrMode undefined. Gates like
      // the label-click handler's `pcrMode !== "switch"` check would then
      // silently refuse every interaction on those nodes.
      if (this.properties.pcrMode === undefined) {
        const modeWidget = this.widgets?.find(w => w.name === "mode");
        if (modeWidget?.value) this.properties.pcrMode = modeWidget.value;
      }
      if (this.properties.pcrSwitchIndex === undefined) {
        const siWidget = this.widgets?.find(w => w.name === "switch_index");
        if (typeof siWidget?.value === "number") this.properties.pcrSwitchIndex = siWidget.value;
      }
      // refresh menubar after properties are restored
      // use rAF because menubar may not be created yet during early configure
      requestAnimationFrame(() => {
        node._pcrMenubar?.updateModeDisplay?.();
        // re-apply persisted font sizes — isolateEvents runs before onConfigure
        // populates node.properties, so the initial read gets defaults
        const el = node.widgets?.find(w => w.name === "pcr_editor")?.element;
        if (el) {
          if (node.properties?.pcrFontSize) el._pcrUpdateFontSize(node.properties.pcrFontSize);
          if (node.properties?.pcrOutputFontSize) el._pcrUpdateOutputFontSize(node.properties.pcrOutputFontSize);
        }
        // re-enable auto-mode logic now that configure-time slot iteration is done
        node._pcrFromWorkflow = false;
        // sync custom node color (bgcolor may change on configure/workflow load)
        syncColorClass?.();
      });
    };

    // hide default textarea — all of these needed for both 1.0 and 2.0
    promptWidget.type = "hidden";
    promptWidget.hidden = true;
    promptWidget.options = promptWidget.options || {};
    promptWidget.options.hidden = true;
    promptWidget.computeSize = () => [0, -4]; // negative height collapses widget spacing
    if (promptWidget.element) promptWidget.element.style.display = "none";
    // Override serializeValue to always return live editor content.
    // Without this, autogrow corruption can cause ComfyUI to read stale text
    // from the wrong widgets_values position.
    promptWidget.serializeValue = () => {
      // Only trust the editor if its DOM is still in the document.
      // Vue re-renders, forceOutputRefresh, or unknown lifecycle paths can
      // orphan the CM instance — fall back to promptWidget.value (kept in
      // sync by onChange) so execution never receives stale text.
      if (node._pcrEditor && document.contains(node._pcrEditor.dom)) {
        return node._pcrEditor.state.doc.toString();
      }
      return promptWidget.value || "";
    };

    // Fix widget serialization: autogrow shifts widgets_values positions,
    // corrupting mode/switch_index/locked/disabled values.
    // Override serializeValue on each mode widget to read from node.properties
    // instead of the widget's .value (which may be wrong).
    const modeWidgetMap = {
      mode: { prop: "pcrMode", fallback: "switch" },
      switch_index: { prop: "pcrSwitchIndex", fallback: 1 },
      locked: { prop: "pcrLocked", fallback: false },
      disabled: { prop: "pcrDisabled", fallback: false },
      cached_output: { prop: "pcrCachedOutput", fallback: "" },
      cached_neg_output: { prop: "pcrCachedNegOutput", fallback: "" },
      cached_regions: { prop: "pcrCachedRegions", fallback: "" },
      iterate_index: { prop: "pcrIterateIndex", fallback: 0 },
      iterate_cycle: { prop: "pcrIterateCycle", fallback: 1 },
      collapsed: { prop: "pcrCollapsed", fallback: false },
    };
    for (const widget of node.widgets || []) {
      const mapping = modeWidgetMap[widget.name];
      if (mapping) {
        widget.type = "hidden";
        widget.hidden = true;
        widget.options = widget.options || {};
        widget.options.hidden = true;
        widget.computeSize = () => [0, -4];
        // serializeValue is called by ComfyUI when building the prompt data.
        // return the value from properties (set by JS menubar) instead of widget.value.
        widget.serializeValue = () => {
          return node.properties?.[mapping.prop] ?? mapping.fallback;
        };
      }
    }

    // wildcard_modes widget — serializes pcrWildcardModes as JSON string
    const wcWidget = (node.widgets || []).find(w => w.name === "wildcard_modes");
    if (wcWidget) {
      wcWidget.type = "hidden";
      wcWidget.hidden = true;
      wcWidget.options = wcWidget.options || {};
      wcWidget.options.hidden = true;
      wcWidget.computeSize = () => [0, -4];
      wcWidget.serializeValue = () => {
        const modes = node.properties?.pcrWildcardModes;
        if (!modes || Object.keys(modes).length === 0) return "";
        return JSON.stringify(modes);
      };
    }

    // container
    const container = document.createElement("div");
    container.className = "pcr-editor";
    container.setAttribute("data-capture-wheel", "true");
    isolateEvents(container, node);

    // DOM widget
    const widget = node.addDOMWidget("pcr_editor", "pcr_editor", container, {
      getValue: () => promptWidget.value,
      setValue: (v) => {
        // During the async loadCodeMirror gap, node.configure() assigns
        // widgets_values entries to every serializable widget. Autogrow
        // inputs shift array positions, so pcr_editor may receive a value
        // from the wrong slot. promptWidget already holds the correct text
        // from its own position (#0) — guard against overwriting it.
        if (!node._pcrEditor) return;
        promptWidget.value = v;
        const current = node._pcrEditor.state.doc.toString();
        if (current !== v) {
          node._pcrEditor.dispatch({
            changes: { from: 0, to: current.length, insert: v },
          });
        }
      },
    });

    // size floors. ComfyUI autogrow resets height via `node.size[1] = computeSize([...node.size])[1]`
    // on every connection change — including during workflow load — which slams a
    // user-resized node back to min height. LGraphCanvas's drag-to-resize calls
    // computeSize() with no arg as the shrink floor. Distinguish by the `out`
    // arg: autogrow passes current size, canvas doesn't.
    widget.options.minNodeSize = [...MIN_NODE_SIZE.litegraph];
    node.computeSize = (out) => {
      const min = getMinNodeSize();
      if (out) {
        const cur = node.size || min;
        return [Math.max(min[0], cur[0]), Math.max(min[1], cur[1])];
      }
      return [...min];
    };
    node._pcrHasMinSize = true;

    // refresh all labels — used by slot-dropdown when changing a child's mode
    node._pcrRefreshAllLabels = () => {
      for (const n of app.graph?._nodes || []) {
        if (n.comfyClass === NODE_TYPE) updateInputLabels(n);
      }
    };

    // shared reactive state — null until Svelte module loads
    let shared = null;
    node._pcrShared = null; // set after async load

    // _pcrMenubar shim: fullscreen-bridge.js and other callers use this API
    let _onModeChange = null;
    node._pcrMenubar = {
      updateModeDisplay() { if (shared) syncShared(node, shared); _onModeChange?.(); },
      setMode(mode, switchIndex) { setModeOnNode(node, mode, switchIndex); if (shared) syncShared(node, shared); _onModeChange?.(); },
      updateCollapsedHeight() { updateCollapsedHeight(node); },
      updateActionStates() { if (shared) syncShared(node, shared); },
      get element() { return container.querySelector(".pcr-menubar"); },
      set onModeChange(fn) { _onModeChange = fn; },
    };

    // update menubar and slot labels when connections change
    const origOnConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function (contype, slot, iscon, ...rest) {
      const savedSize = this.size ? [...this.size] : null;
      origOnConnectionsChange?.apply(this, [contype, slot, iscon, ...rest]);
      if (savedSize) this.setSize?.(savedSize);

      // auto-set mode based on child count (skip during workflow load —
      // onConfigure restores saved mode after configure()'s slot iteration)
      if (!this._pcrFromWorkflow) {
        const connected = getConnectedInputs(this).length;
        const mode = this.properties?.pcrMode || "switch";
        const modeWidget = this.widgets?.find(w => w.name === "mode");
        const siWidget = this.widgets?.find(w => w.name === "switch_index");
        const si = this.properties?.pcrSwitchIndex ?? 1;
        if (connected >= 2 && mode === "switch" && si !== 0) {
          this.properties.pcrMode = "combine";
          if (modeWidget) modeWidget.value = "combine";
        } else if (connected <= 1 && mode !== "switch" && countLabeledOptions(this) <= 1) {
          this.properties.pcrMode = "switch";
          this.properties.pcrSwitchIndex = 1;
          if (modeWidget) modeWidget.value = "switch";
          if (siWidget) siWidget.value = 1;
        }
        if (mode === "switch" && connected > 0) {
          const clampSi = this.properties?.pcrSwitchIndex ?? 1;
          if (clampSi > connected) {
            this.properties.pcrSwitchIndex = connected;
            if (siWidget) siWidget.value = connected;
          }
        }
      }

      node._pcrMenubar.updateModeDisplay();
      node._pcrMenubar.updateCollapsedHeight();
      updateInputLabels(this);
      checkWildcardConflict(this);
      updateDynamicOutputs(this);
      modelIndicator.update();
      const self = this;
      requestAnimationFrame(() => {
        attachSlotClickHandlers(self);
        // Re-run after link drag state clears — the synchronous call above
        // skips slot object replacement (to preserve references for connectSlots),
        // so Vue labels may be stale. By this RAF, linkConnector.reset() has run.
        updateInputLabels(self);
        // Safe to trim now — link drag is complete, slot references are settled.
        trimEmptyAutogrowSlots(self);
        // restore after all deferred updates (autogrow, Vue re-render, forceOutputRefresh)
        requestAnimationFrame(() => {
          if (savedSize) self.setSize?.(savedSize);
          app.canvas?.setDirty?.(true, true);
        });
      });
    };

    // 1.0 mode: detect clicks on slot label text via canvas hit-testing
    attachCanvasClickHandler(node);

    // update parent labels when this node's title changes (works in both 1.0 and 2.0)
    let _pcrTitle = node.title;
    const titleDesc = Object.getOwnPropertyDescriptor(node, "title") ||
                      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), "title");
    if (titleDesc) {
      // title is already a property — wrap the setter
      const origSet = titleDesc.set;
      const origGet = titleDesc.get;
      Object.defineProperty(node, "title", {
        get() { return origGet ? origGet.call(this) : _pcrTitle; },
        set(v) {
          const old = origGet ? origGet.call(this) : _pcrTitle;
          if (origSet) origSet.call(this, v);
          else _pcrTitle = v;
          if (v !== old) updateParentLabels(this);
        },
        configurable: true,
      });
    } else {
      // title is a plain value — define a property
      Object.defineProperty(node, "title", {
        get() { return _pcrTitle; },
        set(v) {
          const old = _pcrTitle;
          _pcrTitle = v;
          if (v !== old) updateParentLabels(this);
        },
        configurable: true,
      });
    }

    // detect custom node color — darken widget area when bgcolor is set
    const syncColorClass = () => {
      container.classList.toggle("pcr-colored", !!node.bgcolor);
    };
    let _pcrBgcolor = node.bgcolor;
    const bgDesc = Object.getOwnPropertyDescriptor(node, "bgcolor") ||
                   Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), "bgcolor");
    if (bgDesc) {
      const origSet = bgDesc.set;
      const origGet = bgDesc.get;
      Object.defineProperty(node, "bgcolor", {
        get() { return origGet ? origGet.call(this) : _pcrBgcolor; },
        set(v) {
          if (origSet) origSet.call(this, v);
          else _pcrBgcolor = v;
          syncColorClass();
        },
        configurable: true,
      });
    } else {
      Object.defineProperty(node, "bgcolor", {
        get() { return _pcrBgcolor; },
        set(v) { _pcrBgcolor = v; syncColorClass(); },
        configurable: true,
      });
    }
    syncColorClass();

    // doc dropdown, model indicator, tags dropdown — created before Svelte mount
    const docDropdown = createDocumentDropdown(node);
    // Expose the DOM element so the fullscreen menubar can adopt it while
    // fullscreen is open (and return it on close).
    node._pcrDocDropdownEl = docDropdown.element;
    const modelIndicator = createModelIndicator(node);
    node._pcrGetModelInfo = modelIndicator.getModelInfo;
    const tagsDropdown = createTagsDropdown({ node, getModelInfo: modelIndicator.getModelInfo });

    // first node in graph: open both panels for an introduction-friendly layout.
    // onConfigure runs synchronously during configure() and sets _pcrEverConfigured,
    // so workflow-loaded nodes always skip the intro-size branch by the time the
    // rAF below reads this flag. Plain `_pcrFromWorkflow` is cleared in a rAF and
    // races with the intro-size rAF, so we use the persistent flag instead.
    const isFirstNode = !node._pcrEverConfigured
      && !(app.graph?._nodes || []).some(n => n.comfyClass === NODE_TYPE && n.id !== node.id);
    if (isFirstNode) {
      if (!node.properties) node.properties = {};
      node.properties.pcrOutputPanel = true;
      node.properties.pcrImagePreview = true;
      node.properties.pcrImagePanelWidth = 260;
    }

    // mount editor + Svelte widget
    try {
      injectStyles();
      const [_, svelteModule] = await Promise.all([loadCodeMirror(), loadSvelteNode()]);

      // mount Svelte widget (renders Menubar + .pcr-node-content)
      shared = new svelteModule.SharedState(node);
      node._pcrShared = shared;
      syncShared(node, shared);

      // Extend _pcrMenubar with action wrappers so the fullscreen editor
      // can render its own Menubar per pane without duplicating node-
      // specific logic (lock cascade, disable cascade, iterate reset, etc).
      node._pcrMenubar.toggleLock = () => {
        handleLockCascade(node, !node.properties?.pcrLocked);
        if (shared) syncShared(node, shared);
      };
      node._pcrMenubar.toggleDisable = () => {
        handleDisableCascade(node, !node.properties?.pcrDisabled);
        if (shared) syncShared(node, shared);
      };
      node._pcrMenubar.toggleOutput = () => {
        if (node.properties?.pcrCollapsed) {
          handleCollapse(node, false, container);
          if (shared) syncShared(node, shared);
        }
        node._pcrOutputPanel?.toggle();
      };
      node._pcrMenubar.toggleImage = () => {
        if (node.properties?.pcrCollapsed) {
          handleCollapse(node, false, container);
          if (shared) syncShared(node, shared);
        }
        node._pcrImagePanel?.toggle();
      };
      node._pcrMenubar.toggleAssistant = () => {
        if (node.properties?.pcrCollapsed) {
          handleCollapse(node, false, container);
          if (shared) syncShared(node, shared);
        }
        node._pcrAiAssistant?.toggle();
      };
      node._pcrMenubar.togglePose = () => {
        if (node.properties?.pcrCollapsed) {
          handleCollapse(node, false, container);
          if (shared) syncShared(node, shared);
        }
        node._pcrPosePanel?.toggle();
      };
      node._pcrMenubar.toggleRegion = () => {
        if (node.properties?.pcrCollapsed) {
          handleCollapse(node, false, container);
          if (shared) syncShared(node, shared);
        }
        node._pcrRegionPanel?.toggle();
      };
      node._pcrMenubar.resetIterate = () => {
        if (!node.properties) node.properties = {};
        node.properties.pcrIterateIndex = 0;
        node.properties.pcrIterateCurrent = 0;
        node.properties.pcrIterateCycle = 1;
        node.properties.pcrIterateTotal = 0;
        node.properties.pcrIteratePending = true;
        const hash = node.properties.pcrIterateContentHash;
        if (hash) {
          fetch("/promptchain/iterate/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content_hash: hash }),
          }).catch(() => {});
        }
        if (shared) syncShared(node, shared);
        updateParentLabels(node);
      };

      // active label highlight + wildcard badges — set up before editor creation
      const highlight = createHighlightExtension(window.PromptChainCM);
      const wcBadge = createWildcardBadgeExtension(window.PromptChainCM);
      node._pcrWcBadge = wcBadge;
      wcBadge.setNode(node);
      wcBadge.setOnModeChanged(() => {
        if (node._pcrEditor) wcBadge.refreshBadges(node._pcrEditor);
      });
      function syncHighlight() {
        if (!node._pcrEditor) return;
        const mode = node.properties?.pcrMode || "switch";
        let activeIndex = node.properties?.pcrSwitchIndex ?? 0;
        if (mode === "iterate") {
          activeIndex = (node.properties?.pcrIterateCurrent ?? -1) + 1;
        }
        // When connected children own selection, self-labels are ignored
        // (see checkWildcardConflict). Hide the green bar so the user
        // isn't misled into thinking body labels drive the switch.
        if (getConnectedInputs(node).length > 0) activeIndex = 0;
        highlight.setHighlightState(node._pcrEditor, {
          mode,
          switchIndex: activeIndex,
        });
      }
      _onModeChange = syncHighlight;

      const svelteInstance = svelteModule.mountNodeWidget(container, {
        node,
        shared,
        docDropdownEl: docDropdown.element,
        modelIndicatorEl: modelIndicator.element,
        tagsDropdownEl: tagsDropdown.element,
        getEditorView: () => node._pcrEditor,
        // panel API callbacks
        apiURL: (p) => api.apiURL(p),
        fetchApi: (p, o) => api.fetchApi(p, o),
        toast: (severity, detail) => app.extensionManager?.toast?.add?.({ severity, summary: "PromptChain", detail, life: 4000 }),
        getWorkflowId: () => getWorkflowId(),
        fetchWorkflowImages: (wid) => fetchWorkflowImages(wid),
        fetchWorkflowCount: (wid) => fetchWorkflowCount(wid),
        subscribeHistory: (fn) => subscribeHistory(fn),
        invalidateCache: (wid) => invalidateCache(wid),
        getCachedImages: (wid) => getCachedImages(wid),
        openViewer: (images, startIndex, wid) => {
          import("./lib/viewer-bridge.js")
            .then(m => m.openViewer(images, startIndex, wid))
            .catch(e => console.error("[PromptChain] viewer bridge failed:", e));
        },
        getCanvasScale: () => app.canvas?.ds?.scale ?? 1,
        // the Poser node the pose panel should dock (shared registry, last-interacted)
        getActivePoser: () => poseRegistry.getActive(),
        // the Region Box node the region panel should dock (shared registry)
        getActiveRegionBox: () => regionBoxRegistry.getActive(),
        // registration callbacks
        onEditorPaneReady: (editorContainer) => {
          editorContainer._pcrNode = node;
          const editorView = createEditor(editorContainer, promptWidget.value || "", (text) => {
            promptWidget.value = text;
            node._pcrFooter?.updateWordCount?.();
            node._pcrFooter?.updateErrors?.();
            node._pcrFooter?.updatePosNeg?.();
            docDropdown.scheduleAutoSave();
            checkWildcardConflict(node);
            node._pcrMenubar.updateModeDisplay();
            updateParentLabels(node);
          }, (update) => {
            if (update.selectionSet) node._pcrFooter?.updatePosNeg?.();
            if (update.focusChanged) node._pcrFooter?.setFocused?.(update.view.hasFocus);
            node._pcrFooter?.updateErrors?.();
          }, [highlight.extension, ...wcBadge.extension], (labelIndex) => {
            if ((node.properties?.pcrMode || "combine") !== "switch") return false;
            // Connected children take priority — self-label clicks would
            // desync the switch (green bar moves but indicator/output follow
            // connected slots). Treat the body as read-only in that state.
            if (getConnectedInputs(node).length > 0) return false;
            if (labelIndex === (node.properties?.pcrSwitchIndex ?? 0)) return false;
            node._pcrMenubar.setMode("switch", labelIndex);
            return true;
          }, (wildcardName) => {
            import("./lib/fullscreen-bridge.js")
              .then(m => m.showSvelteFullscreen(node))
              .catch(e => console.error("[PromptChain] fullscreen bridge failed:", e));
          });
          node._pcrEditor = editorView;

          try { activateTagAutocomplete(window.PromptChainCM, editorView); }
          catch (e) { console.error("[PromptChain] Tag autocomplete activation failed:", e); }

          syncHighlight();
          checkWildcardConflict(node);
          node._pcrFooter?.updateWordCount?.();
        },
        onOutputPanelRegister: (panelApi) => {
          node._pcrOutputPanel = panelApi;
          // bridge DOM methods for fullscreen-bridge.js
          requestAnimationFrame(() => {
            const panelEl = container.querySelector(".pcr-output-panel");
            if (panelEl) {
              panelEl._switchTab = panelApi.switchTab;
              panelEl._setPersistKey = panelApi.setPersistKey;
              panelEl._loadGenerated = panelApi.loadGenerated;
              panelEl._updateGalleryZoom = panelApi.updateGalleryZoom;
            }
          });
        },
        onImagePanelRegister: (panelApi) => {
          node._pcrImagePanel = panelApi;
        },
        onPosePanelRegister: (panelApi) => {
          node._pcrPosePanel = panelApi;
        },
        onRegionPanelRegister: (panelApi) => {
          node._pcrRegionPanel = panelApi;
        },
        onAIAssistantRegister: (panelApi) => {
          node._pcrAiAssistant = panelApi;
        },
        onFooterRegister: (footerApi) => {
          node._pcrFooter = footerApi;
        },
        // menubar action callbacks
        onSetMode: (mode, switchIndex) => {
          setModeOnNode(node, mode, switchIndex);
          if (shared) syncShared(node, shared);
          syncHighlight();
        },
        onResetIterate: () => {
          if (!node.properties) node.properties = {};
          node.properties.pcrIterateIndex = 0;
          node.properties.pcrIterateCurrent = 0;
          node.properties.pcrIterateCycle = 1;
          node.properties.pcrIterateTotal = 0;
          node.properties.pcrIteratePending = true;
          const hash = node.properties.pcrIterateContentHash;
          if (hash) {
            fetch("/promptchain/iterate/reset", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content_hash: hash }),
            }).catch(() => {});
          }
          if (shared) syncShared(node, shared);
          syncHighlight();
          updateParentLabels(node);
        },
        onToggleLock: () => {
          handleLockCascade(node, !node.properties?.pcrLocked);
          if (shared) syncShared(node, shared);
        },
        onToggleDisable: () => {
          handleDisableCascade(node, !node.properties?.pcrDisabled);
          if (shared) syncShared(node, shared);
        },
        onToggleCollapse: () => {
          handleCollapse(node, !node.properties?.pcrCollapsed, container);
          if (shared) syncShared(node, shared);
        },
        onToggleOutput: () => {
          if (node.properties?.pcrCollapsed) {
            handleCollapse(node, false, container);
            if (shared) syncShared(node, shared);
          }
          node._pcrOutputPanel?.toggle();
        },
        onToggleImage: () => {
          if (node.properties?.pcrCollapsed) {
            handleCollapse(node, false, container);
            if (shared) syncShared(node, shared);
          }
          node._pcrImagePanel?.toggle();
        },
        onToggleAssistant: () => {
          if (node.properties?.pcrCollapsed) {
            handleCollapse(node, false, container);
            if (shared) syncShared(node, shared);
          }
          node._pcrAiAssistant?.toggle();
        },
        onTogglePose: () => {
          if (node.properties?.pcrCollapsed) {
            handleCollapse(node, false, container);
            if (shared) syncShared(node, shared);
          }
          node._pcrPosePanel?.toggle();
        },
        onToggleRegion: () => {
          if (node.properties?.pcrCollapsed) {
            handleCollapse(node, false, container);
            if (shared) syncShared(node, shared);
          }
          node._pcrRegionPanel?.toggle();
        },
        onOpenFullscreen: () => {
          import("./lib/fullscreen-bridge.js")
            .then(m => m.showSvelteFullscreen(node))
            .catch(e => console.error("[PromptChain] fullscreen-bridge load failed:", e));
        },
      });
      node._pcrSvelteInstance = svelteInstance;

      // Gate the "3D Poser" menubar button on a Poser node existing, and keep an
      // open pose panel docked to a live Poser. Event-driven via the shared
      // registry (pose-studio.js notifies on Poser add/remove) — never polled.
      const updatePosePresence = () => {
        if (shared) shared.hasPoseStudio = poseRegistry.count > 0;
        node._pcrPosePanel?.refreshDock?.();
      };
      updatePosePresence();
      node._pcrUnsubscribePose = poseRegistry.subscribe(updatePosePresence);

      // Same gate for the Region Box panel — driven from its own registry.
      const updateRegionPresence = () => {
        if (shared) shared.hasRegionBox = regionBoxRegistry.count > 0;
        node._pcrRegionPanel?.refreshDock?.();
      };
      updateRegionPresence();
      node._pcrUnsubscribeRegion = regionBoxRegistry.subscribe(updateRegionPresence);

      // Restore tag config now that node properties are available
      tagsDropdown.restore();

      // restore collapsed state
      if (node.properties?.pcrCollapsed) {
        handleCollapse(node, true, container);
      }

      // restore overlay state
      updateOverlay(node);

      // capture execution output
      const originalOnExecuted = node.onExecuted;
      node.onExecuted = function (message) {
        originalOnExecuted?.apply(this, arguments);
        if (message?.text?.[0] !== undefined) {
          if (!this.properties) this.properties = {};
          this.properties.pcrCompiledOutput = message.text[0];
          this.properties.pcrCompiledNegOutput = message.neg_text?.[0] || "";
          this.properties.pcrCompiledRegions = message.regions?.[0] || "";
          this._pcrOutputText = message.text[0];
          this._pcrNegOutputText = message.neg_text?.[0] || "";
          this._pcrRegionsText = message.regions?.[0] || "";
          if (shared) {
            shared.compiledOutput = message.text[0];
            shared.compiledNegOutput = message.neg_text?.[0] || "";
            shared.compiledRegions = message.regions?.[0] || "";
          }
          updateInputLabels(this);
          requestAnimationFrame(() => attachSlotClickHandlers(this));
        }
        if (message?.roll_selected?.[0] !== undefined) {
          if (!this.properties) this.properties = {};
          this.properties.pcrRollSelected = message.roll_selected[0];
          node._pcrMenubar.updateModeDisplay();
          updateParentLabels(this);
        }
        if (message?.wildcard_results?.[0]) {
          if (!this.properties) this.properties = {};
          try {
            this.properties.pcrWildcardResults = JSON.parse(message.wildcard_results[0]);
            if (this._pcrWcBadge && this._pcrEditor) {
              this._pcrWcBadge.refreshBadges(this._pcrEditor);
            }
          } catch {}
        }
        if (message?.iterate_next?.[0] !== undefined) {
          if (!this.properties) this.properties = {};
          this.properties.pcrIterateIndex = message.iterate_next[0];
          this.properties.pcrIterateTotal = message.iterate_total?.[0] ?? 0;
          this.properties.pcrIterateCurrent = message.iterate_current?.[0] ?? 0;
          this.properties.pcrIterateCycle = message.iterate_cycle?.[0] ?? 1;
          this.properties.pcrIterateContentHash = message.iterate_content_hash?.[0] ?? "";
          this.properties.pcrIteratePending = false;
          node._pcrMenubar.updateModeDisplay();
          syncHighlight();

          const contentHash = this.properties.pcrIterateContentHash;
          const isInnermost = this.properties.pcrInnermostSubordinate;
          const hasChainSubs = this.properties.pcrHasChainSubordinates;
          const isSubordinate = this.properties.pcrSubordinate;
          const isSiblingMaster = this.properties.pcrSiblingMaster;

          if (contentHash && isInnermost) {
            advanceAndCascade(this);
          } else if (contentHash && hasChainSubs && !isSubordinate && !isSiblingMaster) {
            advanceAndCascade(this);
          }
        }
      };

      // cleanup on node removal
      const origOnRemoved = node.onRemoved;
      node.onRemoved = function () {
        origOnRemoved?.call(this);
        widget.onRemove?.();
        removeWheelContainer(container);
        node._pcrOutputPanel?.cleanup?.();
        docDropdown.cleanup?.();
        tagsDropdown.cleanup?.();
        cleanupOverlayObserver(node.id);
        cleanupOrderChain(node.id);
        node._pcrUnsubscribePose?.();
        node._pcrUnsubscribePose = null;
        node._pcrUnsubscribeRegion?.();
        node._pcrUnsubscribeRegion = null;
        if (svelteInstance && svelteModule) {
          svelteModule.destroyNodeWidget(svelteInstance);
        }
        node._pcrEditor = null;
        node._pcrShared = null;
        node._pcrSvelteInstance = null;
      };

    } catch (err) {
      console.error("[PromptChain] CodeMirror failed:", err);
      const textarea = document.createElement("textarea");
      textarea.style.cssText =
        "width:100%;height:100%;resize:none;background:#1a1a1a;color:#ccc;border:none;padding:8px;font:13px monospace;outline:none;";
      textarea.placeholder = "prompt...";
      textarea.value = promptWidget.value || "";
      textarea.addEventListener("input", () => {
        promptWidget.value = textarea.value;
      });
      container.appendChild(textarea);
    }

    // set initial "in" label — Python defines the slot as "in_0" for autogrow
    updateInputLabels(node);

    // dynamic output slots — hide pos/neg if not connected to KSampler,
    // and auto-connect to free CLIPTextEncode nodes if this is a fresh drop
    requestAnimationFrame(() => {
      node._pcrInitializing = false;
      initializeOutputSlots(node);
      if (!node._pcrEverConfigured) {
        // set introduction size BEFORE auto-connect so that connection handlers
        // (onConnectionsChange double-rAF) capture and restore this size, not the default
        if (isFirstNode) {
          node.setSize?.([970, 650]);
          centerNodeInViewport(node);
          // programmatic resize/move doesn't fire LiteGraph's selection refresh,
          // so the selection toolbox keeps its pre-resize anchor (mid-node);
          // flag it dirty the same way core's moveSelectedNodes does
          app.canvas.state.selectionChanged = true;
        }
        const captured = autoConnectToSampler(node);
        if (captured) {
          let text = captured.posText;
          if (captured.negText) text += `\n\nNegative Prompt:\n${captured.negText}`;
          const pw = node.widgets?.find(w => w.name === "prompt");
          if (pw && node._pcrEditor && text) {
            pw.value = text;
            node._pcrEditor.dispatch({
              changes: { from: 0, to: node._pcrEditor.state.doc.length, insert: text },
            });
          }

        }
      }
    });
  },
});
