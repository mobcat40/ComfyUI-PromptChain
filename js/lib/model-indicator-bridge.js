// Model indicator bridge — manages the model indicator footer element,
// graph tracing, recognition state, and lazy-loads Svelte for the picker
// and download modals.

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { showModelModal, closeModelModal, applyTemplate, swapModelInPlace, hasCheckpointGraph, registerCatalogDownloadModal, registerDownloadModal, registerNodePackInstallModal } from "./model-bridge.js";
import "./model-settings-bridge.js"; // side-effect: registers showModelModal/closeModelModal
import { autoApplyTagSources, resetTagAutoApply } from "./tags-dropdown.js";
import { getLink } from "./slot-utils.js";
import { ensureSvelteCSS, createModuleLoader } from "./lazy-load.js";

// ── recognition state ─────────────────────────────────────────────

const _recognition = { running: false, total: 0, done: 0 };

api.addEventListener("promptchain_recognition_start", ({ detail }) => {
  _recognition.running = true;
  _recognition.total = detail.total;
  _recognition.done = 0;
  window.dispatchEvent(new CustomEvent("pcr-recognition-update"));
});

api.addEventListener("promptchain_model_recognized", ({ detail }) => {
  _recognition.done = detail.done;
  _recognition.total = detail.total;
  window.dispatchEvent(new CustomEvent("pcr-recognition-update", { detail }));
});

api.addEventListener("promptchain_recognition_done", () => {
  _recognition.running = false;
  window.dispatchEvent(new CustomEvent("pcr-recognition-update"));
});

// ── graph tracing ─────────────────────────────────────────────────

// Mirrors the canonical set in main.js — UltimateSDUpscale included so the
// indicator resolves the model in upscale-only graphs (no KSampler at all).
const KSAMPLER_TYPES = new Set([
  "KSampler", "KSamplerAdvanced",
  "PromptChain_RegionalDetailer", "SamplerCustomAdvanced", "UltimateSDUpscale", "UltimateSDUpscaleNoUpscale",
  "PromptChain_IdeogramSampler",
]);
const MODEL_WIDGET_NAMES = ["ckpt_name", "unet_name", "model_name"];

function findConnectedModel(pcNode) {
  const graph = app.graph;
  if (!graph) return null;
  const ksNode = findDownstreamKSampler(pcNode, graph);
  if (!ksNode) return null;
  return findUpstreamCheckpoint(ksNode, graph)?.filename ?? null;
}

function findDownstreamKSampler(node, graph) {
  const visited = new Set();
  const queue = [node];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    for (const output of n.outputs || []) {
      if (!output.links?.length) continue;
      for (const lid of output.links) {
        const link = getLink(graph, lid);
        if (!link) continue;
        const target = graph.getNodeById(link.target_id);
        if (!target) continue;
        if (KSAMPLER_TYPES.has(target.comfyClass)) return target;
        queue.push(target);
      }
    }
  }
  return null;
}

function findUpstreamCheckpoint(ksNode, graph) {
  const visited = new Set();
  const queue = [ksNode];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    for (const input of n.inputs || []) {
      if (input.link == null) continue;
      const link = getLink(graph, input.link);
      if (!link) continue;
      const source = graph.getNodeById(link.origin_id);
      if (!source) continue;
      for (const wName of MODEL_WIDGET_NAMES) {
        const w = source.widgets?.find(w => w.name === wName);
        if (w?.value) return { filename: w.value, node: source };
      }
      queue.push(source);
    }
  }
  return null;
}

// ── download helpers (pure data transforms) ────────────────────────

export function resolveDownloadUrl(source) {
  if (!source) return "";
  if (source.provider === "huggingface") {
    return `https://huggingface.co/${source.repo}/resolve/main/${source.path}`;
  }
  if (source.provider === "civitai") {
    return source.download_url || "";
  }
  return source.url || "";
}

export function extractPrecisions(files) {
  const precisions = new Set();
  for (const f of files) {
    if (f.variants) {
      for (const v of f.variants) precisions.add(v.precision);
    }
  }
  return [...precisions];
}

export function resolveFilesForPrecision(files, precision) {
  const resolved = [];
  for (const f of files) {
    if (f.variants) {
      const match = f.variants.find(v => v.precision === precision);
      if (match) {
        resolved.push({
          label: f.label,
          folder: f.folder,
          filename: match.filename,
          size_bytes: match.size_bytes,
          source: match.source,
        });
      }
    } else {
      resolved.push(f);
    }
  }
  return resolved;
}

export function totalSizeForPrecision(files, precision) {
  return resolveFilesForPrecision(files, precision)
    .reduce((sum, f) => sum + (f.size_bytes || 0), 0);
}

// ── Svelte lazy-load ──────────────────────────────────────────────

const ensureCSS = ensureSvelteCSS;
let svelteModule = null;
const loadModule = createModuleLoader(async () => {
  svelteModule = await import("./svelte/promptchain-model-indicator.js");
  return svelteModule;
});

// ── model picker (Svelte) ─────────────────────────────────────────

let _activePicker = null;
let _pickerContainer = null;
// showModelPicker is async (lazy module load) — without this guard a second
// trigger mid-await (double-click, or click + the pcr-open-model-picker
// event) passes the _activePicker null-check too, mounts a TWIN picker and
// orphans the first container (it's untracked, so nothing ever removes it).
let _pickerOpening = false;

function closeModelPicker() {
  if (_activePicker) {
    svelteModule?.destroyModelPicker(_activePicker);
    _activePicker = null;
  }
  if (_pickerContainer) {
    _pickerContainer.remove();
    _pickerContainer = null;
  }
}

async function showModelPicker(pcNode, anchorEl, opts = {}) {
  if (_activePicker) { closeModelPicker(); return; }
  if (_pickerOpening) return; // the in-flight open wins
  _pickerOpening = true;
  try {
    await showModelPickerInner(pcNode, anchorEl, opts);
  } finally {
    _pickerOpening = false;
  }
}

async function showModelPickerInner(pcNode, anchorEl, opts) {
  closeModelModal();
  ensureCSS();

  const mod = await loadModule();

  _pickerContainer = document.createElement("div");
  document.body.appendChild(_pickerContainer);

  _activePicker = mod.mountModelPicker(_pickerContainer, {
    anchorEl,
    focusModelFile: opts.focusModelFile || null,
    recognition: _recognition,
    // Offer "(Current Workflow)" in the template submenu only when an in-place swap
    // is possible (the current network is a checkpoint graph).
    hasCheckpointGraph: hasCheckpointGraph(pcNode),
    onSwapInPlace: (filename, hash) => {
      fetch(`/promptchain/models/settings/${hash}`).then(r => r.ok ? r.json() : null)
        .then(settings => swapModelInPlace(pcNode, filename, settings))
        .catch(() => {});
      closeModelPicker();
    },
    onSelectModel: (model, template) => {
      // Load the model's saved settings, then prefer an IN-PLACE swap when a
      // compatible checkpoint graph already exists (preserves custom wiring like the
      // regional couple). Only rebuild from the template when there's nothing to
      // preserve or the new model isn't checkpoint-loadable.
      fetch(`/promptchain/models/settings/${model.hash}`).then(r => r.ok ? r.json() : null)
        .then(settings => {
          if (swapModelInPlace(pcNode, model.filename, settings)) return;
          if (template) {
            template._presetNodes = settings?.nodes || {};
            applyTemplate(pcNode, template, model.filename);
          }
        })
        .catch(() => { if (template) applyTemplate(pcNode, template, model.filename); });
      closeModelPicker();
    },
    onOpenSettings: (model) => {
      closeModelPicker();
      anchorEl.classList.add("pcr-model-indicator-open");
      showModelModal(pcNode, model, anchorEl);
    },
    onShowDownload: (civitaiResult) => {
      closeModelPicker();
      showDownloadModal(civitaiResult, pcNode, anchorEl);
    },
    onShowCatalogDownload: (catalogEntry, initialPrecision) => {
      closeModelPicker();
      showCatalogDownloadModal(catalogEntry, pcNode, anchorEl, initialPrecision);
    },
    onClose: () => closeModelPicker(),
    applyTemplate: (tpl, filename, presetNodes) => {
      tpl._presetNodes = presetNodes || {};
      applyTemplate(pcNode, tpl, filename);
      closeModelPicker();
    },
  });
}

// ── download modal (Svelte) ───────────────────────────────────────

let _activeDownload = null;
let _downloadContainer = null;

function closeDownloadModal() {
  if (_activeDownload) {
    svelteModule?.destroyDownloadModal(_activeDownload);
    _activeDownload = null;
  }
  if (_downloadContainer) {
    _downloadContainer.remove();
    _downloadContainer = null;
  }
}

async function showDownloadModal(civitaiResult, pcNode, indicatorEl, opts = {}) {
  closeDownloadModal();
  ensureCSS();

  const mod = await loadModule();

  _downloadContainer = document.createElement("div");
  document.body.appendChild(_downloadContainer);

  _activeDownload = mod.mountDownloadModal(_downloadContainer, {
    civitaiResult,
    onClose: () => closeDownloadModal(),
    onBeforeRestart: opts.onBeforeRestart,
    onModelReady: (filename) => {
      closeDownloadModal();
      // Let the caller decide what "done" means.  Default: re-open the
      // picker so the user can click the freshly-scanned model.  The
      // "download newer version" flow swapped the ckpt widget during
      // onBeforeRestart (atomic with the user clicking Restart) and
      // skips the picker.
      if (opts.onModelReady) opts.onModelReady(filename);
      else showModelPicker(pcNode, indicatorEl, { focusModelFile: filename });
    },
  });
}

// ── catalog download modal (Svelte) ───────────────────────────────

let _activeCatalogDownload = null;
let _catalogContainer = null;

function closeCatalogDownloadModal() {
  if (_activeCatalogDownload) {
    svelteModule?.destroyCatalogDownloadModal(_activeCatalogDownload);
    _activeCatalogDownload = null;
  }
  if (_catalogContainer) {
    _catalogContainer.remove();
    _catalogContainer = null;
  }
}

async function showCatalogDownloadModal(catalogEntry, pcNode, indicatorEl, initialPrecision = null) {
  closeCatalogDownloadModal();
  ensureCSS();

  const mod = await loadModule();

  _catalogContainer = document.createElement("div");
  document.body.appendChild(_catalogContainer);

  _activeCatalogDownload = mod.mountCatalogDownloadModal(_catalogContainer, {
    catalogEntry,
    initialPrecision,
    onClose: () => closeCatalogDownloadModal(),
    onModelReady: (filename) => {
      closeCatalogDownloadModal();
      // Re-open the picker focused on the just-installed model so its template
      // choice is front-and-center (single template auto-applies).
      showModelPicker(pcNode, indicatorEl, { focusModelFile: filename });
    },
  });
}

export { showCatalogDownloadModal };
registerCatalogDownloadModal(showCatalogDownloadModal);
registerDownloadModal(showDownloadModal);

// ── node-pack install modal (Svelte) ──────────────────────────────

let _activeNodePack = null;
let _nodePackContainer = null;

function closeNodePackInstallModal() {
  if (_activeNodePack) {
    svelteModule?.destroyNodePackInstallModal(_activeNodePack);
    _activeNodePack = null;
  }
  if (_nodePackContainer) {
    _nodePackContainer.remove();
    _nodePackContainer = null;
  }
}

async function showNodePackInstallModal(injectable, onReady, onClose) {
  closeNodePackInstallModal();
  ensureCSS();

  const mod = await loadModule();

  _nodePackContainer = document.createElement("div");
  document.body.appendChild(_nodePackContainer);

  _activeNodePack = mod.mountNodePackInstallModal(_nodePackContainer, {
    injectable,
    onClose: () => { closeNodePackInstallModal(); onClose?.(); },
    onReady: () => onReady?.(),
  });
}

registerNodePackInstallModal(showNodePackInstallModal);

// ── shared cleanup state for onNodeRemoved (installed once) ──────

const _nodeCleanups = new Map(); // nodeId → { update, abort }
let _onNodeRemovedInstalled = false;

function installNodeRemovedHandler() {
  if (_onNodeRemovedInstalled || !app.graph) return;
  _onNodeRemovedInstalled = true;
  const origOnNodeRemoved = app.graph.onNodeRemoved;
  app.graph.onNodeRemoved = function (removedNode) {
    origOnNodeRemoved?.apply(this, arguments);
    const cleanup = _nodeCleanups.get(removedNode.id);
    if (cleanup) {
      cleanup.abort.abort();
      _nodeCleanups.delete(removedNode.id);
    }
    // Notify surviving indicators to re-trace after topology change
    for (const entry of _nodeCleanups.values()) entry.update();
  };
}

// ── createModelIndicator (vanilla — tightly coupled to ComfyUI footer) ──

export function createModelIndicator(node) {
  const el = document.createElement("div");
  el.className = "pcr-model-indicator pcr-model-disconnected";

  const label = document.createElement("span");
  label.className = "pcr-model-indicator-label";
  label.textContent = "No Model";
  el.appendChild(label);

  const arrow = document.createElement("span");
  arrow.className = "pcr-model-indicator-arrow";
  arrow.textContent = "▾";
  el.appendChild(arrow);

  let currentFilename = null;
  let _modelInfo = null;
  let _prevHash = null;
  let _updateGeneration = 0;
  let _trackedCheckpointId = null;

  function update() {
    const graph = app.graph;
    let filename = null;
    let ckptNode = null;
    if (graph) {
      const ksNode = findDownstreamKSampler(node, graph);
      if (ksNode) {
        const ckpt = findUpstreamCheckpoint(ksNode, graph);
        if (ckpt) { filename = ckpt.filename; ckptNode = ckpt.node; }
      }
    }
    currentFilename = filename;

    if (ckptNode && ckptNode.id !== _trackedCheckpointId) {
      _trackedCheckpointId = ckptNode.id;
      const w = ckptNode.widgets?.find(w => MODEL_WIDGET_NAMES.includes(w.name));
      if (w && !w._pcrHooked) {
        w._pcrHooked = true;
        const origCb = w.callback;
        w.callback = function (...args) {
          origCb?.apply(this, args);
          update();
        };
      }
    }

    const gen = ++_updateGeneration;
    if (filename) {
      label.textContent = filename;
      label.title = filename;
      el.className = "pcr-model-indicator pcr-model-connected";
      fetch(`/promptchain/models/identity?file=${encodeURIComponent(filename)}`)
        .then(r => r.json())
        .then(data => {
          if (gen !== _updateGeneration) return;
          if (data.error) return;
          _modelInfo = data;
          const hashChanged = data.hash !== _prevHash;
          _prevHash = data.hash;
          if (hashChanged) {
            resetTagAutoApply();
            autoApplyTagSources(data.hash);
          }
          return fetch(`/promptchain/models/settings/${data.hash}`).then(r => r.ok ? r.json() : null);
        })
        .then(settings => {
          if (gen !== _updateGeneration) return;
          if (settings) {
            if (settings.display_name && settings.display_name !== filename) {
              label.textContent = settings.display_name;
              label.title = `${settings.display_name}\n${filename}`;
            }
            return;
          }
          el.classList.add("pcr-model-detecting");
          return fetch("/promptchain/models/detect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hash: _modelInfo.hash }),
          })
            .then(r => r.ok ? r.json() : null)
            .then(result => {
              if (gen !== _updateGeneration) return;
              el.classList.remove("pcr-model-detecting");
              if (result?.status === "found" && result.settings?.display_name) {
                label.textContent = result.settings.display_name;
                label.title = `${result.settings.display_name}\n${filename}`;
                window.dispatchEvent(new CustomEvent("pcr-model-detected", {
                  detail: { hash: _modelInfo.hash, settings: result.settings },
                }));
              }
            });
        })
        .catch(() => { el.classList.remove("pcr-model-detecting"); });
    } else {
      label.textContent = "No Model";
      label.title = "";
      el.className = "pcr-model-indicator pcr-model-disconnected";
      _modelInfo = null;
      currentFilename = null;
      if (_prevHash) {
        _prevHash = null;
        resetTagAutoApply();
      }
    }
  }

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const freshFilename = findConnectedModel(node);

    if (!freshFilename) {
      label.textContent = "No Model";
      el.className = "pcr-model-indicator pcr-model-disconnected";
      _modelInfo = null;
      currentFilename = null;
      closeModelModal();
      showModelPicker(node, el);
      return;
    }

    // Always re-resolve identity on click.  The cached _modelInfo can
    // be stale — e.g. after a download+restart the widget swap fires
    // its callback while the server is offline, the identity fetch
    // fails, and _modelInfo keeps pointing at the previous version's
    // hash.  Opening the settings modal with that stale hash shows
    // the old version as active even though the node is now on the
    // new file.  Small latency cost (local /identity call) in exchange
    // for always-correct state.
    //
    // Only touch the label when the filename actually changed — if it
    // didn't, the existing "JANKU Trained NoobAI - v7.77" text is
    // already correct, and slamming in the raw filename while the
    // fetch is in flight creates a visible flicker back to the raw
    // filename for ~50ms.
    const filenameChanged = freshFilename !== currentFilename;
    currentFilename = freshFilename;
    if (filenameChanged) {
      label.textContent = freshFilename;
      label.title = freshFilename;
    }
    el.className = "pcr-model-indicator pcr-model-connected";
    const gen = ++_updateGeneration;
    fetch(`/promptchain/models/identity?file=${encodeURIComponent(freshFilename)}`)
      .then(r => r.json())
      .then(data => {
        if (gen !== _updateGeneration) return null;
        if (data.error) {
          // Identity unknown — fall back to the picker so the user
          // can recover.  Leaves _modelInfo intact in case a stale
          // version is still better than nothing for future clicks.
          closeModelModal();
          showModelPicker(node, el);
          return null;
        }
        const hashChanged = data.hash !== _prevHash;
        _modelInfo = data;
        _prevHash = data.hash;
        if (hashChanged) {
          resetTagAutoApply();
          autoApplyTagSources(data.hash);
        }
        return fetch(`/promptchain/models/settings/${data.hash}`).then(r => r.ok ? r.json() : null);
      })
      .then(settings => {
        if (gen !== _updateGeneration || !_modelInfo) return;
        if (settings?.display_name && settings.display_name !== freshFilename) {
          label.textContent = settings.display_name;
          label.title = `${settings.display_name}\n${freshFilename}`;
        }
        closeModelPicker();
        el.classList.add("pcr-model-indicator-open");
        showModelModal(node, _modelInfo, el);
      })
      .catch(() => {});
  });

  const abortController = new AbortController();
  const { signal } = abortController;

  window.addEventListener("pcr-open-model-picker", (e) => {
    if (e.detail.nodeId === node.id) showModelPicker(node, el);
  }, { signal });

  window.addEventListener("pcr-model-renamed", (e) => {
    if (_modelInfo && e.detail.hash === _modelInfo.hash) {
      label.textContent = e.detail.name;
      label.title = `${e.detail.name}\n${currentFilename}`;
    }
  }, { signal });

  installNodeRemovedHandler();
  _nodeCleanups.set(node.id, { update, abort: abortController });

  requestAnimationFrame(update);

  return { element: el, update, getModelInfo: () => _modelInfo };
}
