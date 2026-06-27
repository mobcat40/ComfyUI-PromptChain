// Krea 2 RAW uses a resolution-dynamic flow-shift: the ModelSamplingFlux node's
// width/height decide mu, and they MUST match the actual render resolution or the
// shift is mis-applied — a 1024² shift on an 832×1024 render over-shifts mu ~10%
// and compresses the detail tail (the same failure mode the node exists to fix,
// milder). The model Settings resolution row mirrors this live for t2i, but that
// misses i2i (size comes from the loaded image — there is no resolution row) and
// any graph whose resolution was set on-canvas or loaded from disk. So re-derive
// every krea2_raw ModelSamplingFlux's width/height from its true render size just
// before each queue — the one chokepoint that catches all cases. Event-driven on
// the queue (not a timer). No-op for any graph without a krea2_raw shift node.

import { app } from "../../../scripts/app.js";
import { getLink } from "./slot-utils.js";

const SHIFT_TYPE = "ModelSamplingFlux";
const LATENT_DIM_TYPES = new Set(["EmptySD3LatentImage", "EmptyLatentImage", "EmptyFlux2LatentImage"]);
const IMAGE_TYPES = new Set(["LoadImage"]);

// Nearest ancestor of `startNode` (walking input links) whose class is in `types`.
function findUpstreamByType(startNode, types) {
  const graph = startNode?.graph || app.graph;
  if (!graph || !startNode) return null;
  const visited = new Set();
  const queue = [startNode];
  while (queue.length) {
    const n = queue.shift();
    if (!n || visited.has(n.id)) continue;
    visited.add(n.id);
    for (const input of n.inputs || []) {
      if (input.link == null) continue;
      const link = getLink(graph, input.link);
      if (!link) continue;
      const src = graph.getNodeById(link.origin_id);
      if (!src) continue;
      if (types.has(src.comfyClass)) return src;
      queue.push(src);
    }
  }
  return null;
}

function widgetValue(node, name) {
  return node?.widgets?.find((w) => w.name === name)?.value;
}

function setWidget(node, name, value) {
  const w = node?.widgets?.find((x) => x.name === name);
  if (!w || w.value === value) return;
  w.value = value;
  w.callback?.(value);
}

// The render resolution feeding a sampler: the latent node's width/height widgets
// (t2i), or — when the latent is encoded from an input image and has no such
// widgets (i2i) — the loaded image's natural pixel dimensions.
function samplerResolution(samplerNode) {
  const latent = findUpstreamByType(samplerNode, LATENT_DIM_TYPES);
  if (latent) {
    const w = widgetValue(latent, "width");
    const h = widgetValue(latent, "height");
    if (typeof w === "number" && typeof h === "number") return { width: w, height: h };
  }
  const img = findUpstreamByType(samplerNode, IMAGE_TYPES)?.imgs?.[0];
  if (img?.naturalWidth) return { width: img.naturalWidth, height: img.naturalHeight };
  return null;
}

// Scope the sync to Krea 2 RAW: only its UNET wants a resolution-tracking shift.
// Turbo bakes a fixed mu (and carries no shift node); Flux's shift is its own
// concern. Gating on the upstream UNET filename keeps every other arch untouched.
function isKrea2RawShift(shiftNode) {
  const name = widgetValue(findUpstreamByType(shiftNode, new Set(["UNETLoader"])), "unet_name");
  return typeof name === "string" && /krea2_raw/i.test(name);
}

// Re-derive every krea2_raw ModelSamplingFlux's width/height from its render size.
export function syncShiftNodes() {
  const graph = app?.graph;
  if (!graph) return;
  for (const sampler of graph._nodes || []) {
    const cls = sampler.comfyClass || sampler.type || "";
    if (!cls.includes("KSampler") || cls === "KSamplerSelect") continue;
    const shift = findUpstreamByType(sampler, new Set([SHIFT_TYPE]));
    if (!shift || !isKrea2RawShift(shift)) continue;
    const res = samplerResolution(sampler);
    if (!res) continue;
    const before = `${widgetValue(shift, "width")}×${widgetValue(shift, "height")}`;
    setWidget(shift, "width", res.width);
    setWidget(shift, "height", res.height);
    const after = `${res.width}×${res.height}`;
    if (before !== after) console.log(`[PromptChain] krea2 RAW shift synced ${before} → ${after}`);
  }
}

// Wrap queuePrompt so the shift is corrected for the live graph before it serializes.
export function setupShiftSync() {
  const orig = app.queuePrompt?.bind(app);
  if (!orig) return;
  app.queuePrompt = async function (...args) {
    try { syncShiftNodes(); } catch (e) { console.warn("[PromptChain] krea2 shift-sync skipped:", e); }
    return orig(...args);
  };
}
