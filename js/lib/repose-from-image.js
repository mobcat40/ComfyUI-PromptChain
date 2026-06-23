// Re-pose build + capability probing. fetchReposeCaps tells the modal which
// recipes are runnable (their node pack is installed) and what base models to
// offer; buildReposeGraph instantiates the recipe TEMPLATE into an off-screen
// LGraph (NEVER the user's workflow) and overrides ONLY the user-controlled
// pieces — the base UNET (the model pick), the reference + pose images, the
// prompt, the sampler params, and the pose-LoRA strength. CLIP / VAE / LoRA
// files + types come straight from the template (it's a proven, working graph;
// only the base model is meant to vary). Mirrors buildSeedvr2FloorGraph.

import { api } from "../../../scripts/api.js";
import { REPOSE_RECIPES } from "./repose-recipes.js";
import { offscreenIdBase } from "./offscreen-graph.js";

const EMPTY_WORKFLOW = { last_node_id: 0, last_link_id: 0, nodes: [], links: [], groups: [], config: {}, extra: {}, version: 0.4 };

function freshWorkflowId() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-repose`;
}

// Every installed model whose architecture is in `archs`, with display names —
// the Re-pose base-model picker. fetchEngineModels (upscale) only covers
// sdxl/qwen_edit/flux1, so flux2/flux2_klein needs this arch-parameterized fetch.
async function fetchModelsByArch(archs) {
  try {
    const listRes = await api.fetchApi("/promptchain/models/list");
    if (!listRes.ok) return [];
    const models = ((await listRes.json())?.models || []).filter((m) => archs.includes(m.architecture));
    if (!models.length) return [];
    let settings = {};
    try {
      const bulkRes = await api.fetchApi("/promptchain/models/settings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashes: models.map((m) => m.hash) }),
      });
      if (bulkRes.ok) settings = (await bulkRes.json())?.settings || {};
    } catch { /* display names are optional */ }
    return models.map((m) => ({
      hash: m.hash,
      filename: m.filename,
      architecture: m.architecture,
      displayName: settings[m.hash]?.display_name || m.filename,
    }));
  } catch {
    return [];
  }
}

// Per recipe: is its node pack installed, and what base models can drive it.
// The CLIP/VAE/LoRA come from the template, so the only gate is node types +
// at least one compatible base model.
export async function fetchReposeCaps() {
  const reg = window.LiteGraph?.registered_node_types || {};
  const out = [];
  for (const recipe of REPOSE_RECIPES) {
    let ok = true, reason = "";
    const needTypes = recipe.id === "anypose"
      ? ["TextEncodeQwenImageEditPlus", "FluxKontextMultiReferenceLatentMethod", "ModelSamplingAuraFlow", "CFGNorm", "LoraLoaderModelOnly", "UNETLoader", "VAEEncode"]
      : ["ReferenceLatent", "CFGGuider", "SamplerCustomAdvanced", "Flux2Scheduler", "EmptyFlux2LatentImage", "RandomNoise", "KSamplerSelect", "LoraLoaderModelOnly", "UNETLoader"];
    // These are CORE ComfyUI nodes (Flux2 / Qwen-edit), not a 3rd-party pack —
    // a missing one means the ComfyUI build is too old, not that something needs
    // installing.
    const missingType = needTypes.find((t) => !reg[t]);
    if (missingType) { ok = false; reason = `needs a newer ComfyUI (missing ${missingType})`; }

    let models = await fetchModelsByArch(recipe.archs);
    // Lock the picker to the models this recipe's LoRA/CLIP actually support
    // (e.g. Klein 9B only — not Flux2 Dev or the 4B).
    if (recipe.modelMatch) models = models.filter((m) => recipe.modelMatch.test(m.filename) || recipe.modelMatch.test(m.displayName || ""));
    // GGUF base models need UnetLoaderGGUF — hide them if it isn't installed.
    if (!reg["UnetLoaderGGUF"]) models = models.filter((m) => !/\.gguf$/i.test(m.filename));
    // Default the picker to the recipe's preferred file (e.g. the proven fp8 over
    // the GGUF) — the modal selects models[0] on open.
    if (recipe.preferModel) {
      models = [...models].sort((a, b) =>
        (recipe.preferModel.test(b.filename) || recipe.preferModel.test(b.displayName || "") ? 1 : 0)
        - (recipe.preferModel.test(a.filename) || recipe.preferModel.test(a.displayName || "") ? 1 : 0));
    }
    if (ok && !models.length) { ok = false; reason = `no ${recipe.modelLabel || recipe.archs[0]} model installed`; }

    out.push({
      id: recipe.id, label: recipe.label, blurb: recipe.blurb, templateId: recipe.templateId,
      poserMode: recipe.poserMode, promptDoc: recipe.promptDoc,
      sampler: { ...recipe.sampler }, loraStrength: recipe.loraStrength, megapixels: recipe.megapixels || null,
      ok, reason, models,
    });
  }
  return { recipes: out };
}

function setNamedWidget(node, name, value) {
  const w = node?.widgets?.find((x) => x.name === name);
  if (!w) return false;
  if (Array.isArray(w.options?.values) && value != null && !w.options.values.includes(value)) {
    w.options.values.push(value); // ensure a not-yet-listed file is selectable
  }
  w.value = value;
  w.callback?.(value);
  return true;
}

// Build the recipe graph off-screen from its template. Returns { graph,
// workflowId } or null. Overrides ONLY: base UNET (modelFilename, with a GGUF
// loader swap), reference image, pose control map, sampler params, pose-LoRA
// strength, and (Qwen) input megapixels. The prompt is NOT written into the
// encoders — a PromptChain_PromptChain node is created and wired per the
// template's anchorConnections so the raw editor doc is compiled SERVER-SIDE
// (the same compile_prompt engine inpaint/upscale use). Everything else is the
// template verbatim — CLIP/VAE/LoRA files and node types included.
export async function buildReposeGraph(opts) {
  const LG = window.LiteGraph;
  if (!LG) return null;

  let template;
  try {
    const res = await api.fetchApi(`/promptchain/templates/${encodeURIComponent(opts.templateId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    template = data?.template || data;
  } catch {
    return null;
  }
  if (!template?.nodes?.length) return null;

  const workflowId = freshWorkflowId();
  const graph = new LG.LGraph(structuredClone({ ...EMPTY_WORKFLOW, id: workflowId }));
  graph.last_node_id = offscreenIdBase(); // render-node ids must stay off the live canvas — see offscreen-graph.js

  const created = new Array(template.nodes.length).fill(null);
  let poserLoader = null;
  for (let i = 0; i < template.nodes.length; i++) {
    const tpl = template.nodes[i];
    // The poser node is never created — its IMAGE output (the control map) comes
    // from a LoadImage of the file the detached modal poser already uploaded.
    if (tpl.type === "PromptChain_PoseStudio") {
      const ld = LG.createNode("LoadImage");
      if (!ld) return null;
      graph.add(ld);
      setNamedWidget(ld, "image", opts.controlMapFilename);
      created[i] = ld;
      poserLoader = ld;
      continue;
    }
    // GGUF diffusion models load via UnetLoaderGGUF, not UNETLoader — picking a
    // .gguf on a plain UNETLoader fails server validation ("not in list"). Swap
    // the loader type; its MODEL output matches so the wiring is unchanged.
    if (tpl.type === "UNETLoader") {
      const isGguf = /\.gguf$/i.test(opts.modelFilename || "");
      const ld = LG.createNode(isGguf ? "UnetLoaderGGUF" : "UNETLoader");
      if (!ld) { console.warn(`[Re-pose] loader unavailable: ${isGguf ? "UnetLoaderGGUF" : "UNETLoader"}`); return null; }
      graph.add(ld);
      setNamedWidget(ld, "unet_name", opts.modelFilename);
      created[i] = ld;
      continue;
    }
    const node = LG.createNode(tpl.type);
    if (!node) { console.warn(`[Re-pose] unknown node type ${tpl.type}`); return null; }
    graph.add(node);
    // Copy the template's widget values verbatim (CLIP/VAE/LoRA files + types,
    // AuraFlow shift, ref method, CFGNorm, save prefix, …). Only the user-driven
    // pieces are overridden below.
    if (tpl.widgets_values?.length && node.widgets?.length) {
      for (let w = 0; w < Math.min(tpl.widgets_values.length, node.widgets.length); w++) {
        const widget = node.widgets[w];
        // Never touch upload/action widgets — invoking their callback opens a
        // native file dialog (LoadImage's "choose file to upload" = IMAGEUPLOAD).
        if (widget.type === "IMAGEUPLOAD" || widget.type === "button") continue;
        const val = tpl.widgets_values[w];
        if (Array.isArray(widget.options?.values) && val != null && !widget.options.values.includes(val)) {
          widget.options.values.push(val);
        }
        widget.value = val;
        widget.callback?.(val);
      }
    }
    created[i] = node;
  }

  // ── overrides (user-controlled only) ─────────────────────────────────────────
  const s = opts.sampler || {};
  const seed = s.seed && s.seed > 0 ? s.seed : Math.floor(Math.random() * 2 ** 48);
  for (const node of created) {
    if (!node) continue;
    const type = node.comfyClass || node.type;
    if (node === poserLoader) continue; // already set to the control map
    switch (type) {
      case "LoadImage":
        setNamedWidget(node, "image", opts.referenceFilename); // the subject photo
        break;
      case "LoraLoaderModelOnly":
        // Keep the template's lora_name (the recipe's pattern) — only the weight
        // is user-tunable.
        if (opts.loraStrength != null) setNamedWidget(node, "strength_model", opts.loraStrength);
        break;
      case "ImageScaleToTotalPixels":
        // Qwen input-image scale (latent-space target MP). Only overridden when
        // the modal exposes it (AnyPose); Flux follows the pose-map size.
        if (opts.megapixels) setNamedWidget(node, "megapixels", opts.megapixels);
        break;
      case "KSampler":
        setNamedWidget(node, "seed", seed);
        setNamedWidget(node, "steps", s.steps);
        setNamedWidget(node, "cfg", s.cfg);
        setNamedWidget(node, "sampler_name", s.sampler);
        setNamedWidget(node, "scheduler", s.scheduler);
        setNamedWidget(node, "denoise", s.denoise);
        break;
      case "RandomNoise":
        setNamedWidget(node, "noise_seed", seed);
        break;
      case "Flux2Scheduler":
        setNamedWidget(node, "steps", s.steps);
        break;
      case "CFGGuider":
        setNamedWidget(node, "cfg", s.cfg);
        break;
      case "KSamplerSelect":
        setNamedWidget(node, "sampler_name", s.sampler);
        break;
      default:
        break;
    }
  }

  // ── wiring ───────────────────────────────────────────────────────────────
  for (const conn of template.connections || []) {
    const from = created[conn.from_node_idx];
    const to = created[conn.to_node_idx];
    if (!from || !to) continue;
    // The poser→LoadImage swap only carries IMAGE (slot 0); POSE_JSON/MASKS
    // (slots 1/2) are unused by both recipes and have no LoadImage equivalent.
    if (from === poserLoader && conn.from_slot > 0) continue;
    try { from.connect(conn.from_slot, to, conn.to_slot); } catch (e) { console.warn("[Re-pose] wire failed", e); }
  }

  // ── prompt compile: single source of truth ───────────────────────────────
  // The template carries the prompt wiring as anchorConnections (PromptChain
  // output slot 1=positive, slot 2=negative → the two encoders), exactly as the
  // user's real workflows do. Create that PromptChain_PromptChain and wire it so
  // the raw editor doc is compiled SERVER-SIDE by compile_prompt — `//` sections,
  // the `Negative Prompt:` split, tag/outfit expansion, wildcards — the same
  // engine inpaint and upscale route through. No client-side prompt parsing.
  // (Mirrors applyTemplate's anchorConnections handling in model-bridge.js.)
  const anchors = template.anchorConnections || [];
  if (anchors.length) {
    const pc = LG.createNode("PromptChain_PromptChain");
    if (!pc) { console.warn("[Re-pose] PromptChain_PromptChain unavailable (install the pack)"); return null; }
    graph.add(pc);
    // The prompt widget is hidden; its serializeValue falls back to .value
    // whenever the editor DOM isn't in the document — always true for this
    // off-screen graph — so .value is exactly what reaches the compile.
    const promptW = pc.widgets?.find((w) => w.name === "prompt");
    if (promptW) { promptW.value = opts.promptDoc || ""; promptW.callback?.(promptW.value); }
    // Mode/cache widgets serialize from node.properties; pin a fresh-compile
    // config (switch/1, blank caches) so a stale compile can never serve.
    pc.properties = pc.properties || {};
    Object.assign(pc.properties, {
      pcrMode: "switch", pcrSwitchIndex: 1, pcrLocked: false, pcrDisabled: false,
      pcrCachedOutput: "", pcrCachedNegOutput: "", pcrCachedRegions: "",
    });
    // Backfill output slots if the fresh node lacks the positive/negative ones
    // the anchors reference (mirrors applyTemplate's guard).
    const maxSlot = Math.max(...anchors.map((c) => c.from_slot));
    if (!pc.outputs || pc.outputs.length <= maxSlot) {
      const ref = LG.createNode(pc.comfyClass || pc.type);
      if (ref?.outputs) {
        for (let i = pc.outputs?.length || 0; i < ref.outputs.length; i++) {
          pc.addOutput(ref.outputs[i].name, ref.outputs[i].type);
        }
      }
    }
    for (const conn of anchors) {
      const to = created[conn.to_node_idx];
      if (to) { try { pc.connect(conn.from_slot, to, conn.to_slot); } catch (e) { console.warn("[Re-pose] anchor wire failed", e); } }
    }
  }

  return { graph, workflowId, seed };
}
