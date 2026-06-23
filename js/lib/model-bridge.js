// Model bridge — shared registry that breaks the circular dependency
// between model-settings.js and model-indicator.js.
// Also owns applyTemplate (pure graph logic used by both sides).

import { app } from "../../../scripts/app.js";
import { getLink } from "./slot-utils.js";

// ── callback registry ─────────────────────────────────────────────

let _showCatalogDownloadModal;
let _showDownloadModal;
let _showModelModal;
let _closeModelModal;

export function registerCatalogDownloadModal(fn) { _showCatalogDownloadModal = fn; }
export function showCatalogDownloadModal(...args) { _showCatalogDownloadModal?.(...args); }

let _showNodePackInstallModal;
export function registerNodePackInstallModal(fn) { _showNodePackInstallModal = fn; }
export function showNodePackInstallModal(...args) { _showNodePackInstallModal?.(...args); }

export function registerDownloadModal(fn) { _showDownloadModal = fn; }
export function showDownloadModal(...args) { _showDownloadModal?.(...args); }

export function registerModelModal(showFn, closeFn) {
  _showModelModal = showFn;
  _closeModelModal = closeFn;
}
export function showModelModal(...args) { _showModelModal?.(...args); }
export function closeModelModal() { _closeModelModal?.(); }

// ── template application (graph logic) ────────────────────────────

export const MODEL_WIDGET_NAMES = ["ckpt_name", "unet_name", "model_name"];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function removeWorkflowNodes(pcNode) {
  const graph = app.graph;
  if (!graph) return;

  const pcType = pcNode.comfyClass || "PromptChain";
  const toRemove = new Set();

  // BFS downstream
  const downQueue = [pcNode];
  const downVisited = new Set([pcNode.id]);
  while (downQueue.length) {
    const n = downQueue.shift();
    for (const output of n.outputs || []) {
      if (!output.links?.length) continue;
      for (const lid of output.links) {
        const link = getLink(graph, lid);
        if (!link) continue;
        const target = graph.getNodeById(link.target_id);
        if (!target || downVisited.has(target.id)) continue;
        downVisited.add(target.id);
        if (target.comfyClass === pcType) continue;
        toRemove.add(target);
        downQueue.push(target);
      }
    }
  }

  // Expand upstream from captured nodes
  const upQueue = [...toRemove];
  while (upQueue.length) {
    const n = upQueue.shift();
    for (const input of n.inputs || []) {
      if (input.link == null) continue;
      const link = getLink(graph, input.link);
      if (!link) continue;
      const source = graph.getNodeById(link.origin_id);
      if (!source || toRemove.has(source) || source.id === pcNode.id) continue;
      if (source.comfyClass === pcType) continue;
      toRemove.add(source);
      upQueue.push(source);
    }
  }

  for (const n of toRemove) graph.remove(n);
}

function ensureComboOption(widget, val) {
  if (val != null && widget.options?.values && !widget.options.values.includes(val)) {
    widget.options.values.push(val);
  }
}

// A model filename is "<base>-<variant>.<ext>", where <variant> is a GGUF quant
// (Q5_K_M, Q8_0, IQ2_XXS…) or a safetensors precision (fp8_scaled,
// fp8_e4m3fn_scaled, fp16, bf16…). The base identifies the model file (e.g. a
// Wan high-noise expert) independent of which variant was downloaded.
const _VARIANT_RE = /^(.*)[-_]((?:Q\d+(?:_[0-9A-Za-z]+)*|IQ\d+[A-Za-z0-9_]*|fp8(?:_[a-z0-9]+)*|fp16|bf16|fp32|fp4|f16|f32)(?:_scaled)?)\.(gguf|safetensors|ckpt)$/i;

export function variantParts(name) {
  const m = _VARIANT_RE.exec(name || "");
  return m ? { base: m[1].toLowerCase(), token: m[2].toLowerCase(), ext: m[3].toLowerCase() } : null;
}

// Templates bake one variant; the user may have downloaded another. Remap the
// baked filename to whichever variant of the SAME model file is actually
// installed (read from the loader widget's own combo list). `ref` carries the
// variant chosen by a sibling loader so a multi-expert recipe (Wan high+low
// noise) stays on a single quant when several are on disk. No-op when the baked
// file is already installed or no same-base variant exists.
export function resolveInstalledVariant(baked, installed, ref) {
  if (!Array.isArray(installed) || installed.includes(baked)) return baked;
  const bp = variantParts(baked);
  if (!bp) return baked;
  const candidates = installed.filter((o) => {
    const op = variantParts(o);
    return op && op.base === bp.base && op.ext === bp.ext;
  });
  if (!candidates.length) return baked;
  const pick = (ref?.token && candidates.find((o) => variantParts(o).token === ref.token))
    || candidates.find((o) => o === baked)
    || candidates[0];
  if (ref) ref.token = variantParts(pick).token;
  return pick;
}

// Checkpoint-loadable archs all share CheckpointLoaderSimple, so they can be swapped
// in place without rebuilding. Flux/Z-Image use different loaders → not swappable here.
const CHECKPOINT_LOADERS = new Set(["CheckpointLoaderSimple", "CheckpointLoader"]);
const CHECKPOINT_ARCHS = new Set(["sdxl", "sd15", "sd1.5", "pony", "illustrious", "noobai"]);

// Every node reachable from `startNode` in either direction (the wired network).
function collectConnectedNodes(startNode) {
  const graph = app.graph;
  const seen = new Set();
  const out = [];
  const queue = [startNode];
  while (queue.length) {
    const n = queue.shift();
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id); out.push(n);
    for (const inp of n.inputs || []) {
      if (inp.link == null) continue;
      const l = getLink(graph, inp.link);
      const src = l && graph.getNodeById(l.origin_id);
      if (src) queue.push(src);
    }
    for (const o of n.outputs || []) {
      for (const lid of o.links || []) {
        const l = getLink(graph, lid);
        const tgt = l && graph.getNodeById(l.target_id);
        if (tgt) queue.push(tgt);
      }
    }
  }
  return out;
}

// Swap to a checkpoint-compatible model IN PLACE: change the loader's checkpoint and
// reapply the new model's saved per-node settings (cfg/steps/sampler/clip-skip/CN
// strengths/latent size/FaceDetailer…) to the EXISTING nodes — preserving custom
// wiring like the regional Attention Couple. Returns false when there's no existing
// checkpoint graph or the new model isn't checkpoint-loadable, so the caller can fall
// back to applyTemplate (a full rebuild).
// Sampling nodes that mark a live checkpoint graph. UltimateSDUpscale counts:
// an upscale-only graph (LoadImage -> USDU, no KSampler) is still a checkpoint
// graph the user wants swapped in place, not template-rebuilt out from under them.
const SWAP_SAMPLERS = new Set(["KSampler", "KSamplerAdvanced", "UltimateSDUpscale"]);

export function swapModelInPlace(pcNode, filename, settings) {
  const graph = app.graph;
  if (!graph || !filename) return false;
  const nodes = collectConnectedNodes(pcNode);
  const ks = nodes.find(n => SWAP_SAMPLERS.has(n.comfyClass));
  const loader = nodes.find(n => CHECKPOINT_LOADERS.has(n.comfyClass || n.type));
  if (!ks || !loader) return false; // no existing checkpoint graph to preserve
  const arch = (settings?.architecture || "").toLowerCase();
  if (arch && !CHECKPOINT_ARCHS.has(arch)) return false; // flux/zimage etc. → rebuild

  // 1. point the loader at the new checkpoint
  for (const wName of MODEL_WIDGET_NAMES) {
    const w = loader.widgets?.find(x => x.name === wName);
    if (!w) continue;
    ensureComboOption(w, filename);
    w.value = filename; w.callback?.(filename);
    break;
  }
  // 2. reapply the model's per-node-type settings to the existing nodes
  const presets = settings?.nodes || {};
  for (const n of nodes) {
    const pw = presets[n.comfyClass || n.type];
    if (!pw || !n.widgets) continue;
    for (const w of n.widgets) {
      if (w.name in pw) { ensureComboOption(w, pw[w.name]); w.value = pw[w.name]; w.callback?.(pw[w.name]); }
    }
  }
  graph.setDirtyCanvas(true, true);
  return true;
}

// True when the node's network is a checkpoint graph (KSampler + CheckpointLoader),
// i.e. an in-place model swap is possible — used to offer "(Current Workflow)".
export function hasCheckpointGraph(pcNode) {
  const nodes = collectConnectedNodes(pcNode);
  return !!(nodes.find(n => SWAP_SAMPLERS.has(n.comfyClass))
    && nodes.find(n => CHECKPOINT_LOADERS.has(n.comfyClass || n.type)));
}

// Templates can include nodes that need a model/pip the user may not have:
// PromptChain_RegionalDetailer → ultralytics + face_yolov8n.pt; ControlNet*
// → a CN checkpoint. The nodes themselves are ours/core so the graph LOADS, but
// it would fail at queue time with no hint. After applying, check each implied
// injectable's /nodepacks/status and offer the same install modal the [add]
// menu uses for any whose model/pack isn't present. Sequential via the modal's
// done-callback; a cancel just stops the chain.
function offerTemplateDeps(template, modelFilename) {
  if (!_showNodePackInstallModal) return;
  const types = new Set((template?.nodes || []).map((n) => n.type || n.comfyClass));
  const injectables = [];
  if (types.has("PromptChain_RegionalDetailer")) injectables.push("RegionalDetailer");
  if (types.has("ControlNetApplyAdvanced") || types.has("ControlNetLoader")
    || types.has("ZImageFunControlnet") || types.has("ModelPatchLoader")) {
    // Match the ControlNet checkpoint family to the template's base model so the
    // user is offered the pack they can actually use. Z-Image rides the model-
    // patch path (ModelPatchLoader/ZImageFunControlnet); SDXL/Flux ride the
    // classic ControlNetLoader. Z-Image turbo vs base both default to turbo
    // unless "base" is named, since the control models aren't cross-compatible.
    const hay = ((template?.name || "") + " " + (modelFilename || "")).toLowerCase();
    if (/z.?image|zimage/.test(hay)) {
      injectables.push(/\bbase\b/.test(hay) ? "ZImageControlNetBase" : "ZImageControlNet");
    } else if (/flux/.test(hay)) {
      injectables.push("FluxControlNet");
    } else {
      injectables.push("ControlNet");
    }
  }
  if (!injectables.length) return;
  (async () => {
    const missing = [];
    for (const inj of injectables) {
      try {
        const st = await fetch(`/promptchain/nodepacks/status?injectable=${encodeURIComponent(inj)}`).then((r) => r.json());
        if (st?.present === false) missing.push(inj);
      } catch { /* can't check → don't nag */ }
    }
    let i = 0;
    const next = () => { if (i < missing.length) _showNodePackInstallModal(missing[i++], next); };
    next();
  })();
}

export function applyTemplate(pcNode, template, modelFilename) {
  const graph = app.graph;
  if (!graph) return false;

  const LG = window.LiteGraph || app.graph.constructor.LiteGraph;
  if (!LG) return false;

  removeWorkflowNodes(pcNode);

  // Template offsets are authored relative to the PromptChain node's top-left
  // assuming its default width. When the node is wider (e.g. the AI Assistant
  // panel is open) the first column would land on top of it — so slide the
  // whole template right until its leftmost node clears the node's actual
  // right edge. No-op (shift 0) when the node is narrower than the template
  // already assumes, so default layouts are unchanged.
  // ONLY for templates authored entirely to the RIGHT of the anchor: a template
  // captured around a mid-graph PromptChain has nodes at negative offsets by
  // design (e.g. the 3D Regional rig with the Poser far left), and "clearing"
  // its leftmost node would shove the whole layout thousands of px right.
  const SPAWN_GAP = 60;
  const minOffsetX = template.nodes.length
    ? Math.min(...template.nodes.map(n => n.offset?.[0] ?? 0))
    : 0;
  const anchorShiftX = minOffsetX >= 0
    ? Math.max(0, (pcNode.size?.[0] || 0) + SPAWN_GAP - minOffsetX)
    : 0;

  // Keeps multi-expert loaders (Wan high+low noise) on a single downloaded quant.
  const _variantRef = { token: "" };

  const createdNodes = new Array(template.nodes.length).fill(null);
  for (let i = 0; i < template.nodes.length; i++) {
    const tplNode = template.nodes[i];
    const newNode = LG.createNode(tplNode.type);
    if (!newNode) {
      console.warn(`[PromptChain] Template: unknown node type "${tplNode.type}"`);
      continue;
    }
    newNode.pos = [
      pcNode.pos[0] + tplNode.offset[0] + anchorShiftX,
      pcNode.pos[1] + tplNode.offset[1],
    ];
    if (tplNode.size) newNode.size = [...tplNode.size];
    if (tplNode.title) newNode.title = tplNode.title;
    if (tplNode.properties) Object.assign(newNode.properties, tplNode.properties);
    graph.add(newNode);

    if (tplNode.widgets_values?.length && newNode.widgets?.length) {
      const modelName = modelFilename
        ? modelFilename.replace(/\.(safetensors|ckpt|gguf)$/i, "")
        : "";
      for (let w = 0; w < Math.min(tplNode.widgets_values.length, newNode.widgets.length); w++) {
        let val = tplNode.widgets_values[w];
        if (typeof val === "string" && val.includes("{model_name}")) {
          val = val.replace(/\{model_name\}/g, slugify(modelName));
        }
        // Remap a baked GGUF quant / safetensors precision to the variant the
        // user actually downloaded — fixes locked multi-expert templates (Wan)
        // pointing at a quant that isn't on disk. Reads the loader's installed
        // list before ensureComboOption appends the (possibly absent) baked name.
        if (typeof val === "string" && /\.(gguf|safetensors|ckpt)$/i.test(val)) {
          val = resolveInstalledVariant(val, newNode.widgets[w].options?.values, _variantRef);
        }
        ensureComboOption(newNode.widgets[w], val);
        newNode.widgets[w].value = val;
        newNode.widgets[w].callback?.(val);
      }
    }

    // A locked template is a self-contained recipe: it bakes both its model
    // filenames (see lockModels guard below) AND its sampler widget values.
    // The model config's node presets carry ONE recipe per family (e.g. Wan's
    // vanilla 20-step / CFG 3.5), which would clobber a sibling template's
    // distinct recipe — applying the vanilla preset over the Fast 4-step /
    // CFG 1.0 template left the LightX2V LoRAs running at CFG 3.5 and produced
    // burnt video. So skip preset overrides for locked templates; the model-
    // settings panel still reads slider RANGES from the config and current
    // values from the live (template-baked) nodes.
    if (template._presetNodes && !template.lockModels) {
      const nodeType = tplNode.type;
      const presetWidgets = template._presetNodes[nodeType];
      if (presetWidgets && newNode.widgets) {
        for (const widget of newNode.widgets) {
          if (widget.name in presetWidgets) {
            ensureComboOption(widget, presetWidgets[widget.name]);
            widget.value = presetWidgets[widget.name];
            widget.callback?.(presetWidgets[widget.name]);
          }
        }
      }
    }

    createdNodes[i] = newNode;
  }

  // Single-loader templates inject the picked model into their loader. MoE/video
  // templates (e.g. Wan's high+low noise experts) set lockModels and keep their
  // own per-expert filenames — injecting one picked file would clobber the
  // second expert and break the pair.
  if (modelFilename && !template.lockModels) {
    const LOADER_TYPES = new Set([
      "CheckpointLoaderSimple", "CheckpointLoader",
      "UNETLoader", "DiffusersLoader",
    ]);
    let applied = false;
    for (const node of createdNodes) {
      if (!node || !LOADER_TYPES.has(node.comfyClass || node.type)) continue;
      if (applied) break;
      for (const w of node.widgets) {
        if (MODEL_WIDGET_NAMES.includes(w.name)) {
          ensureComboOption(w, modelFilename);
          w.value = modelFilename;
          w.callback?.(modelFilename);
          applied = true;
        }
      }
    }
  }

  for (const conn of template.connections) {
    const from = createdNodes[conn.from_node_idx];
    const to = createdNodes[conn.to_node_idx];
    if (from && to) from.connect(conn.from_slot, to, conn.to_slot);
  }

  if (template.anchorConnections?.length) {
    const maxSlot = Math.max(...template.anchorConnections.map(c => c.from_slot));
    if (!pcNode.outputs || pcNode.outputs.length <= maxSlot) {
      const refNode = LG.createNode(pcNode.comfyClass || pcNode.type);
      if (refNode?.outputs) {
        for (let i = (pcNode.outputs?.length || 0); i < refNode.outputs.length; i++) {
          pcNode.addOutput(refNode.outputs[i].name, refNode.outputs[i].type);
        }
      }
    }
  }
  for (const conn of template.anchorConnections) {
    const to = createdNodes[conn.to_node_idx];
    if (to) pcNode.connect(conn.from_slot, to, conn.to_slot);
  }

  // A template that ships a 3D Poser should arrive ready to pose: open the
  // invoking node's poser side-panel (same path as the menubar toggle —
  // properties.pcrPosePanel persists it). The panel docks the registry's
  // last-active poser, which IS the just-created one (poseRegistry.add runs
  // in the poser's nodeCreated during graph.add above); its viewport mounts
  // async and the panel re-docks on signalReady.
  if (createdNodes.some((n) => n && (n.comfyClass || n.type) === "PromptChain_PoseStudio")) {
    if (pcNode.properties) pcNode.properties.pcrPosePanel = true;
    pcNode._pcrPosePanel?.show?.();
  }

  if (template.prompt_id) injectTemplatePrompt(pcNode, template.prompt_id);

  offerTemplateDeps(template, modelFilename);
  graph.setDirtyCanvas(true, true);
  return true;
}

// A template may name a prompt recipe via "prompt_id" (an id from the
// data/prompts sets): building it injects that recipe at the TOP of the
// invoking node's prompt, so the graph arrives ready to queue without a
// manual recipe pick. Resolved through the prompts endpoint so user-dir
// overrides win, exactly like the recipes tab.
async function injectTemplatePrompt(pcNode, promptId) {
  let text = "";
  try {
    const res = await fetch("/promptchain/prompts/list");
    const data = await res.json();
    text = data?.prompts?.find((p) => p.id === promptId)?.text || "";
  } catch (e) {
    console.warn("[PromptChain] template prompt lookup failed:", e);
  }
  if (!text) return;

  const view = pcNode._pcrEditor;
  const promptWidget = pcNode.widgets?.find((w) => w.name === "prompt");
  const docText = view ? view.state.doc.toString() : String(promptWidget?.value || "");

  const recipeHeader = text.split("\n").find((l) => l.trim()) || "";
  if (recipeHeader && docText.includes(recipeHeader)) return; // same template re-applied

  // A recipe's "Negative Prompt:" section is the model's standard negative
  // (e.g. Wan's anti-static string). It sits below {cursor}, so the existing-
  // doc path below would drop it — capture it now to re-apply afterward.
  const NEG_RE = /(^|\n)[ \t]*negative\s+prompt\s*:/i;
  const negMatch = text.match(NEG_RE);
  const negSection = negMatch ? text.slice(negMatch.index).replace(/^\n/, "") : "";

  const cursorIdx = text.indexOf("{cursor}");
  let insertText, anchor;
  if (!docText.trim()) {
    insertText = text.replace("{cursor}", "");
    anchor = cursorIdx >= 0 ? cursorIdx : insertText.length;
  } else {
    // The slice above {cursor} is what recipes put ahead of user tags
    // (it ends in their "// Your Tags"-style scaffold) — the existing
    // text takes the {cursor} slot, landing under the injected block.
    insertText = cursorIdx >= 0 ? text.slice(0, cursorIdx) : text;
    if (!insertText.endsWith("\n")) insertText += "\n";
    anchor = insertText.length;
  }

  if (view) {
    view.dispatch({
      changes: { from: 0, to: docText.trim() ? 0 : view.state.doc.length, insert: insertText },
      selection: { anchor },
    });
  } else if (promptWidget) {
    promptWidget.value = docText.trim() ? insertText + docText : insertText;
  }

  // Existing prompt with no negative of its own: append the recipe's standard
  // negative (the empty-doc path already inserted it inline).
  if (negSection && docText.trim() && !NEG_RE.test(docText)) {
    if (view) {
      const end = view.state.doc.length;
      const tail = view.state.doc.toString().endsWith("\n") ? "" : "\n";
      view.dispatch({ changes: { from: end, to: end, insert: tail + negSection } });
    } else if (promptWidget) {
      const cur = String(promptWidget.value || "");
      promptWidget.value = cur + (cur.endsWith("\n") ? "" : "\n") + negSection;
    }
  }
}
