// Shared region-name binding between a region-mask PRODUCER (the 3D Poser, the
// Region Box canvas) and a regional CONSUMER (Attention Couple / Regional
// Conditioning) wired to a PromptChain node.
//
// A producer emits MASKS (one row per region entity, in entity order) plus a
// POSE_JSON entity list; a consumer binds each `$name{}` block in the prompt to
// its mask row BY NAME. These helpers keep the bound prompt stocked with one
// `$name{}` block per producer region and travel renames into the prompt.
//
// Generalized fork of the Poser's own (AttentionCouple-only) helpers so the Flux
// RegionalConditioning path binds region names too, and so the seed budget is
// per-producer (counting only the caller's own names) — the Poser's inline copy
// is intentionally left untouched.

import { app } from "../../../scripts/app.js";
import { getLink } from "./slot-utils.js";
import { setEditorContent } from "./editor.js";

// PromptChain consumers that take a `regions` JSON and bind each $name{} block
// to a region. AttentionCouple patches SDXL cross-attention; RegionalConditioning
// attaches the mask inside the conditioning (Flux + tiled upscale); IdeogramCaption
// places each region at its box's caption coordinates (Ideogram has no mask, so it
// reads the box from POSE_JSON, not MASKS). A producer feeds any of these.
export const REGIONAL_CONSUMERS = new Set([
  "PromptChain_AttentionCouple",
  "PromptChain_RegionalConditioning",
  "PromptChain_IdeogramCaption",
]);

// Producer outputs that can reach a consumer: MASKS for the mask consumers,
// POSE_JSON for the Ideogram caption (mask-less).
const PRODUCER_OUTPUTS = ["MASKS", "POSE_JSON"];

// $-block names are matched as \w+ by the compiler; drop any other char so a
// stray metachar in a label can't corrupt the seed/rename regexes. (Labels are
// already constrained to word-chars at the canvas, so this is a safety net.)
function safeName(name) {
  return String(name || "").replace(/[^\w]/g, "");
}

// Trace a producer node's MASKS/POSE_JSON output -> a regional consumer -> its
// `regions` input -> the PromptChain node feeding it. Returns { consumer, pc }
// or {}.
export function traceRegionConsumer(node) {
  const graph = app.graph;
  if (!graph) return {};
  for (const outName of PRODUCER_OUTPUTS) {
    const out = node.outputs?.find((o) => o.name === outName);
    if (!out?.links?.length) continue;
    for (const linkId of out.links) {
      const link = getLink(graph, linkId);
      const consumer = link && graph.getNodeById(link.target_id);
      if (!REGIONAL_CONSUMERS.has(consumer?.comfyClass)) continue;
      const regIn = consumer.inputs?.find((i) => i.name === "regions");
      const rlink = regIn?.link != null ? getLink(graph, regIn.link) : null;
      const pc = rlink && graph.getNodeById(rlink.origin_id);
      if (pc?.comfyClass === "PromptChain_PromptChain") return { consumer, pc };
    }
  }
  return {};
}

// Seed a `$name { }` block into the bound prompt for every region name that has
// no block yet (add-only, case-insensitive to match the server's name binding).
// Per-producer by construction: it only ever seeds the names passed in, so a
// Poser sharing the same prompt can't make it over/under-seed. Inserts ABOVE the
// negative section so a new block never lands inside the negative prompt.
export function reconcileRegionBlocks(node, names) {
  if (!names?.length) return;
  const { pc } = traceRegionConsumer(node);
  if (!pc?._pcrEditor) return;
  const text = pc._pcrEditor.state.doc.toString();
  const missing = names.filter(
    (n) => safeName(n) && !new RegExp("\\$" + safeName(n) + "\\s*\\{", "i").test(text));
  if (!missing.length) return;
  const blocks = missing.map((name) => "$" + safeName(name) + " {\n\n}").join("\n\n");
  const neg = text.match(/negative\s+prompt\s*:/i);
  if (neg) {
    const head = text.slice(0, neg.index);
    setEditorContent(pc._pcrEditor,
      (head.trim() ? head.replace(/\s*$/, "\n\n") : "") + blocks + "\n\n" + text.slice(neg.index));
  } else {
    setEditorContent(pc._pcrEditor, text + (text.trim() ? "\n\n" : "") + blocks);
  }
}

// Read a `$name { body }` block's body to its MATCHING close brace (brace-depth
// tracked), skipping past any EMPTY same-name blocks to the first POPULATED one.
// Depth tracking keeps a body's own {a|b} wildcard/alternation braces intact, so
// what the user typed survives the copy — the server's compile grammar is itself
// non-greedy, but preserving the authored text is strictly safer than truncating
// it here. Returns "" when the name has no populated block.
function extractRegionBody(text, sn) {
  const open = new RegExp("\\$" + sn + "\\s*\\{", "gi");
  let m;
  while ((m = open.exec(text)) !== null) {
    let depth = 1, i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    if (depth === 0) {
      const body = text.slice(start, i - 1).trim();
      if (body) return body;
    }
  }
  return "";
}

// Read each named region's typed body out of the bound prompt, so a copied
// character's prompt can travel with it to another scene. Null-prototype map so a
// region literally named "__proto__" can't poison the result. Keyed by the name
// AS PASSED (the entity's custom name), not the escaped form.
export function readRegionBlockBodies(node, names) {
  const out = Object.create(null);
  if (!names?.length) return out;
  const { pc } = traceRegionConsumer(node);
  if (!pc?._pcrEditor) return out;
  const text = pc._pcrEditor.state.doc.toString();
  for (const name of names) {
    const sn = safeName(name);
    if (!sn) continue;
    const body = extractRegionBody(text, sn);
    if (body) out[name] = body;
  }
  return out;
}

// Seed `$name { body }` blocks carrying the typed tags of region entities pasted
// from another scene — like reconcileRegionBlocks but writes each block's BODY
// (not an empty stub) and is keyed per pasted entity, so a copied character's
// prompt travels with it. Add-only/case-insensitive: never clobbers a block the
// destination already holds under that name. Returns true once the bound editor
// exists (injection done, or nothing fresh to add) so the caller can stop
// retrying; false while the editor isn't built yet (caller keeps it pending).
export function seedRegionBlocks(node, entries) {
  if (!entries?.length) return true;
  const { pc } = traceRegionConsumer(node);
  if (!pc) return true; // not region-wired → nothing to inject into; caller must stop retrying
  if (!pc._pcrEditor) return false; // consumer wired but its editor isn't built yet → retry next capture
  const text = pc._pcrEditor.state.doc.toString();
  const fresh = entries.filter(
    (e) => safeName(e.name) && !new RegExp("\\$" + safeName(e.name) + "\\s*\\{", "i").test(text));
  if (!fresh.length) return true;
  const blocks = fresh.map((e) => {
    const body = (e.body || "").trim();
    return "$" + safeName(e.name) + " {\n" + (body ? body + "\n" : "\n") + "}";
  }).join("\n\n");
  // Carried region blocks LEAD the prompt: prepend at the very top so a pasted
  // character's $name{ tags } is the first thing in the prompt (above the quality
  // tags). Top placement is trivially above the negative section, so the
  // negative-marker guard reconcileRegionBlocks needs isn't required here.
  const rest = text.replace(/^\s+/, "");
  setEditorContent(pc._pcrEditor, blocks + (rest ? "\n\n" + rest : ""));
  return true;
}

// Rewrite every `$oldName {` block to `$newName {` so the user's typed tags
// travel with a box rename. No-op when no such block exists (reconcile seeds the
// new name instead on the next change).
export function renameRegionBlock(node, oldName, newName) {
  const oldN = safeName(oldName), newN = safeName(newName);
  if (!oldN || !newN || oldN === newN) return;
  const { pc } = traceRegionConsumer(node);
  if (!pc?._pcrEditor) return;
  const text = pc._pcrEditor.state.doc.toString();
  const re = new RegExp("\\$" + oldN + "(\\s*\\{)", "gi");
  if (!re.test(text)) return;
  re.lastIndex = 0;
  setEditorContent(pc._pcrEditor, text.replace(re, (m, brace) => "$" + newN + brace));
}

// Region->entity binding is by NAME on the server, which needs the entity list —
// wire POSE_JSON into the consumer's `pose` input if it isn't already. Connects
// ONLY when the slot is empty: never steals `pose` from a 3D Poser that already
// owns it (whoever owns `pose` defines the entity list for the whole prompt).
export function ensureConsumerPoseWire(node) {
  const { consumer } = traceRegionConsumer(node);
  if (!consumer) return;
  const poseIn = consumer.inputs?.findIndex((i) => i.name === "pose");
  if (poseIn == null || poseIn < 0 || consumer.inputs[poseIn].link != null) return;
  const poseOut = node.outputs?.findIndex((o) => o.name === "POSE_JSON");
  if (poseOut >= 0) node.connect(poseOut, consumer, poseIn);
}
