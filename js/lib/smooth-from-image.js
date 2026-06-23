// "Smooth" graph builder — RIFE frame interpolation as a viewer post-process.
// Builds an off-screen graph: LoadVideo -> GetVideoComponents -> RIFE VFI ->
// CreateVideo (fps x multiplier) -> SaveVideo. All core ComfyUI video nodes
// except RIFE VFI (Fannovel16 ComfyUI-Frame-Interpolation, bundled as the
// "FrameInterpolation" pack). The source video is staged in input/ by
// /promptchain/extend/prepare (reused) so LoadVideo can consume it.

import { offscreenIdBase } from "./offscreen-graph.js";

const EMPTY_WORKFLOW = { last_node_id: 0, last_link_id: 0, nodes: [], links: [], groups: [], config: {}, extra: {}, version: 0.4 };

function freshWorkflowId() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-smooth`;
}

function setNamedWidget(node, name, value) {
  const w = node?.widgets?.find((x) => x.name === name);
  if (!w) return false;
  if (Array.isArray(w.options?.values) && value != null && !w.options.values.includes(value)) {
    w.options.values.push(value); // a freshly-staged input video isn't in the combo yet
  }
  w.value = value;
  w.callback?.(value);
  return true;
}

// True only when every node the Smooth graph needs is registered (RIFE pack +
// core video nodes). The caller gates the install offer on RIFE VFI specifically.
export function smoothNodesAvailable() {
  const reg = window.LiteGraph?.registered_node_types || {};
  return ["RIFE VFI", "LoadVideo", "GetVideoComponents", "CreateVideo", "SaveVideo"].every((t) => reg[t]);
}

// opts: { sourceVideoFilename, multiplier, outFps }
export function buildSmoothGraph(opts) {
  const LG = window.LiteGraph;
  if (!LG || !smoothNodesAvailable()) return null;

  const workflowId = freshWorkflowId();
  const graph = new LG.LGraph(structuredClone({ ...EMPTY_WORKFLOW, id: workflowId }));
  graph.last_node_id = offscreenIdBase(); // render-node ids must stay off the live canvas — see offscreen-graph.js
  const mk = (t) => { const n = LG.createNode(t); if (n) graph.add(n); return n; };

  const load = mk("LoadVideo");
  const comp = mk("GetVideoComponents");
  const rife = mk("RIFE VFI");
  const create = mk("CreateVideo");
  const save = mk("SaveVideo");
  if (!load || !comp || !rife || !create || !save) return null;

  setNamedWidget(load, "file", opts.sourceVideoFilename);
  setNamedWidget(rife, "ckpt_name", opts.ckptName || "rife49.pth");
  setNamedWidget(rife, "multiplier", opts.multiplier || 2);
  // Quality/VRAM knobs — all optional, RIFE's own defaults if omitted. A picked
  // ckpt that isn't on disk auto-downloads on first run (the node handles it).
  if (opts.scaleFactor != null) setNamedWidget(rife, "scale_factor", opts.scaleFactor);
  if (opts.ensemble != null) setNamedWidget(rife, "ensemble", opts.ensemble);
  if (opts.fastMode != null) setNamedWidget(rife, "fast_mode", opts.fastMode);
  if (!setNamedWidget(create, "fps", opts.outFps || 32) && create.widgets?.[1]) {
    create.widgets[1].value = opts.outFps || 32; // positional fallback (images, fps, audio)
  }
  if (!setNamedWidget(save, "filename_prefix", "video/PromptChain") && save.widgets?.[0]) {
    save.widgets[0].value = "video/PromptChain";
  }

  // wiring: VIDEO -> components; images -> RIFE; interpolated -> CreateVideo;
  // carry the original audio through; CreateVideo -> SaveVideo.
  try {
    load.connect(0, comp, 0);     // VIDEO -> GetVideoComponents.video
    comp.connect(0, rife, 0);     // images -> RIFE.frames
    rife.connect(0, create, 0);   // interpolated images -> CreateVideo.images
    comp.connect(1, create, 1);   // audio -> CreateVideo.audio (optional)
    create.connect(0, save, 0);   // VIDEO -> SaveVideo.video
  } catch (e) {
    console.warn("[Smooth] wiring failed", e);
    return null;
  }

  return { graph, workflowId };
}
