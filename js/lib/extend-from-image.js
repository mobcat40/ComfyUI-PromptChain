// "Extend video" graph builder. Instantiates an I2V template (VERBATIM — its
// lockModels recipe already matches the source clip's models) into an off-screen
// LGraph and overrides ONLY the start image (the source video's last frame) and
// the prompt, so the next clip continues from where the source ended. Mirrors
// buildReposeGraph (repose-from-image.js). The last frame is staged server-side
// by core/extend_api.py (/promptchain/extend/prepare).

import { api } from "../../../scripts/api.js";
import { resolveInstalledVariant } from "./model-bridge.js";
import { offscreenIdBase } from "./offscreen-graph.js";

const EMPTY_WORKFLOW = { last_node_id: 0, last_link_id: 0, nodes: [], links: [], groups: [], config: {}, extra: {}, version: 0.4 };

function freshWorkflowId() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-extend`;
}

function setNamedWidget(node, name, value) {
  const w = node?.widgets?.find((x) => x.name === name);
  if (!w) return false;
  if (Array.isArray(w.options?.values) && value != null && !w.options.values.includes(value)) {
    w.options.values.push(value); // make a not-yet-listed file selectable
  }
  w.value = value;
  w.callback?.(value);
  return true;
}

// opts: { templateId, lastFrameFilename, promptDoc, length }
// Returns { graph, workflowId } or null.
export async function buildExtendGraph(opts) {
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
  // Keeps the dual experts on one downloaded quant when remapping baked variants.
  const variantRef = { token: "" };

  for (let i = 0; i < template.nodes.length; i++) {
    const tpl = template.nodes[i];
    const node = LG.createNode(tpl.type);
    if (!node) { console.warn(`[Extend] unknown node type ${tpl.type}`); return null; }
    graph.add(node);
    if (tpl.title) node.title = tpl.title;
    // Copy widget values verbatim — lockModels keeps the proven recipe (model /
    // LoRA / VAE / CLIP files, steps, cfg, shift). Only the pieces below vary.
    if (tpl.widgets_values?.length && node.widgets?.length) {
      for (let w = 0; w < Math.min(tpl.widgets_values.length, node.widgets.length); w++) {
        const widget = node.widgets[w];
        if (widget.type === "IMAGEUPLOAD" || widget.type === "button") continue;
        let val = tpl.widgets_values[w];
        // The template bakes a fixed GGUF quant / safetensors precision; remap it
        // to whichever variant of the same model file the user actually installed
        // (same fix applyTemplate does — buildExtendGraph doesn't route through it).
        if (typeof val === "string" && /\.(gguf|safetensors|ckpt)$/i.test(val)) {
          val = resolveInstalledVariant(val, widget.options?.values, variantRef);
        }
        if (Array.isArray(widget.options?.values) && val != null && !widget.options.values.includes(val)) {
          widget.options.values.push(val);
        }
        widget.value = val;
        widget.callback?.(val);
      }
    }
    created[i] = node;
  }

  // ── overrides: start image = source's last frame; optional clip dims/length/
  // fps. Every override is OPTIONAL — an omitted opt keeps the template's tuned
  // value, so default Extend behaviour is unchanged. ──
  for (const node of created) {
    if (!node) continue;
    const type = node.comfyClass || node.type;
    if (type === "LoadImage") {
      setNamedWidget(node, "image", opts.lastFrameFilename);
    } else if (type === "WanImageToVideo" || type === "WanFirstLastFrameToVideo") {
      if (opts.length) setNamedWidget(node, "length", opts.length);
      if (opts.width) setNamedWidget(node, "width", opts.width);
      if (opts.height) setNamedWidget(node, "height", opts.height);
    } else if (type === "CreateVideo" && opts.outFps != null) {
      setNamedWidget(node, "fps", opts.outFps);
    }
  }

  // ── advanced sampler overrides (all optional). The 14B recipe is DUAL-EXPERT:
  // two KSamplerAdvanced (the high-noise expert runs the first slice of the step
  // schedule, the low-noise expert the rest) + two ModelSamplingSD3. Identify the
  // high expert by its add_noise="enable" and preserve the template's proportional
  // step split so the MoE handoff stays intact; single-expert recipes (one
  // sampler) just take the full [0, steps] window. ──
  const widgetVal = (node, name) => node?.widgets?.find((w) => w.name === name)?.value;
  const ksamplers = created.filter((n) => n && (n.comfyClass || n.type) === "KSamplerAdvanced");
  const shiftNodes = created.filter((n) => n && (n.comfyClass || n.type) === "ModelSamplingSD3");
  const highK = ksamplers.find((n) => widgetVal(n, "add_noise") === "enable") || ksamplers[0] || null;
  const lowK = ksamplers.find((n) => n !== highK) || null;

  if (opts.cfg != null) for (const k of ksamplers) setNamedWidget(k, "cfg", opts.cfg);
  if (opts.sampler) for (const k of ksamplers) setNamedWidget(k, "sampler_name", opts.sampler);
  if (opts.scheduler) for (const k of ksamplers) setNamedWidget(k, "scheduler", opts.scheduler);
  if (opts.shift != null) for (const m of shiftNodes) setNamedWidget(m, "shift", opts.shift);
  // Seed: a pinned seed fixes both experts; unpinned must inject a FRESH random
  // seed each run, because the off-screen api.queuePrompt path never fires the
  // "randomize" widget control — the baked noise_seed (0) would otherwise repeat
  // byte-identical every Extend / Run Again. The high expert drives the noise
  // (low has add_noise disabled), so randomizing it is enough.
  if (opts.seed != null) {
    for (const k of ksamplers) {
      setNamedWidget(k, "noise_seed", opts.seed);
      setNamedWidget(k, "control_after_generate", "fixed");
    }
  } else if (highK) {
    setNamedWidget(highK, "noise_seed", Math.floor(Math.random() * 2 ** 31));
  }
  if (opts.steps != null && highK) {
    const origSteps = Number(widgetVal(highK, "steps")) || opts.steps;
    const origEnd = Number(widgetVal(highK, "end_at_step"));
    setNamedWidget(highK, "steps", opts.steps);
    setNamedWidget(highK, "start_at_step", 0);
    if (lowK) {
      const ratio = origSteps > 0 && origEnd > 0 ? origEnd / origSteps : 0.5;
      const boundary = Math.max(1, Math.min(opts.steps - 1, Math.round(opts.steps * ratio)));
      setNamedWidget(highK, "end_at_step", boundary);
      setNamedWidget(lowK, "steps", opts.steps);
      setNamedWidget(lowK, "start_at_step", boundary);
      setNamedWidget(lowK, "end_at_step", opts.steps);
    } else {
      setNamedWidget(highK, "end_at_step", opts.steps);
    }
  }

  // ── wiring ──
  for (const conn of template.connections || []) {
    const from = created[conn.from_node_idx];
    const to = created[conn.to_node_idx];
    if (from && to) {
      try { from.connect(conn.from_slot, to, conn.to_slot); } catch (e) { console.warn("[Extend] wire failed", e); }
    }
  }

  // ── prompt: PromptChain_PromptChain wired via anchorConnections so the raw doc
  // compiles SERVER-SIDE (same engine repose/upscale use). Mirrors buildReposeGraph. ──
  const anchors = template.anchorConnections || [];
  if (anchors.length) {
    const pc = LG.createNode("PromptChain_PromptChain");
    if (!pc) { console.warn("[Extend] PromptChain_PromptChain unavailable (install the pack)"); return null; }
    graph.add(pc);
    const promptW = pc.widgets?.find((w) => w.name === "prompt");
    if (promptW) { promptW.value = opts.promptDoc || ""; promptW.callback?.(promptW.value); }
    pc.properties = pc.properties || {};
    Object.assign(pc.properties, {
      pcrMode: "switch", pcrSwitchIndex: 1, pcrLocked: false, pcrDisabled: false,
      pcrCachedOutput: "", pcrCachedNegOutput: "", pcrCachedRegions: "",
    });
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
      if (to) { try { pc.connect(conn.from_slot, to, conn.to_slot); } catch (e) { console.warn("[Extend] anchor wire failed", e); } }
    }
  }

  // ── optional stitch: prepend the SOURCE clip so the result is ONE continuous
  // video. Load the source -> frames; drop the continuation's duplicate first
  // frame (ImageFromBatch from index 1 — it equals the source's last frame);
  // concatenate (source + trimmed continuation) and re-encode through the
  // template's own CreateVideo at the source fps. All core video/image nodes; if
  // any is missing we silently leave the continuation-only graph intact. ──
  // The continuation is native 16fps. A source can only be cleanly joined with it
  // when the source is also 16 or a whole-number RIFE multiple of 16 (32/48/64) —
  // those we either join directly or match by interpolating the continuation up.
  // A non-multiple source (24fps 5B, foreign 25/30/60) can't be reconciled without
  // frame-rate conversion, so we SKIP the stitch (save the continuation on its own)
  // rather than silently slow the source half by re-encoding it at 16.
  const NATIVE_FPS = 16;
  const srcFps = Math.round(opts.fps || NATIVE_FPS);
  const fpsMult = Math.round(srcFps / NATIVE_FPS);
  const cleanForStitch = srcFps === NATIVE_FPS || (fpsMult >= 2 && srcFps === fpsMult * NATIVE_FPS);
  if (opts.stitch && opts.sourceVideoFilename && !cleanForStitch) {
    console.warn(`[Extend] source ${srcFps}fps can't be cleanly joined with a 16fps continuation; saving continuation only`);
  }
  if (opts.stitch && opts.sourceVideoFilename && cleanForStitch) {
    const reg = LG.registered_node_types || {};
    const need = ["LoadVideo", "GetVideoComponents", "ImageBatch", "ImageFromBatch"];
    const vae = created.find((n) => n && (n.comfyClass || n.type) === "VAEDecode");
    const cv = created.find((n) => n && (n.comfyClass || n.type) === "CreateVideo");
    if (need.every((t) => reg[t]) && vae && cv) {
      const load = LG.createNode("LoadVideo"); graph.add(load); setNamedWidget(load, "file", opts.sourceVideoFilename);
      const comp = LG.createNode("GetVideoComponents"); graph.add(comp);
      const drop = LG.createNode("ImageFromBatch"); graph.add(drop);
      setNamedWidget(drop, "batch_index", 1);
      setNamedWidget(drop, "length", 4096); // clamps to "rest of the batch" (default 1 would keep one frame)
      const batch = LG.createNode("ImageBatch"); graph.add(batch);
      try {
        // Source is 16 or a clean RIFE multiple (32/48/64 — guaranteed by
        // cleanForStitch). When it's a multiple, bring the native-16 continuation
        // up to the same density first so both halves play at one rate; this is
        // what makes "extend an already-smoothed clip" just work. RIFE is present
        // whenever the source was smoothed.
        const matchInterp = fpsMult >= 2 && reg["RIFE VFI"];
        let contFrames = vae; // node feeding the continuation frames into the join
        if (matchInterp) {
          const rife = LG.createNode("RIFE VFI"); graph.add(rife);
          setNamedWidget(rife, "ckpt_name", "rife49.pth");
          setNamedWidget(rife, "multiplier", fpsMult);
          vae.connect(0, rife, 0); // continuation 16fps -> interpolate up to source density
          contFrames = rife;
        }
        load.connect(0, comp, 0);        // source VIDEO -> GetVideoComponents.video
        contFrames.connect(0, drop, 0);  // (matched) continuation frames -> drop frame 0
        comp.connect(0, batch, 0);       // source frames -> ImageBatch.image1
        drop.connect(0, batch, 1);       // trimmed continuation -> ImageBatch.image2
        batch.connect(0, cv, 0);         // concatenated -> CreateVideo.images (replaces the VAEDecode link)
        // Encode at the source's rate when matched (both halves now that density),
        // else native 16 (the source was already 16). Never relabel un-matched
        // native frames to a higher fps — that's the fast-play bug.
        setNamedWidget(cv, "fps", matchInterp ? srcFps : NATIVE_FPS);
      } catch (e) {
        console.warn("[Extend] stitch wiring failed; producing continuation-only clip", e);
      }
    } else {
      console.warn("[Extend] stitch requested but core video nodes unavailable; continuation-only");
    }
  }

  return { graph, workflowId };
}
