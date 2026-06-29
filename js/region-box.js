// Region Box — a flat rectangle canvas + region list mounted into the
// PromptChain_RegionBox node body. You draw, name, recolor, reorder and delete
// rectangles on the output frame; the backend node rasterizes each into a region
// mask. Wire MASKS + POSE_JSON into a PromptChain_AttentionCouple (SDXL) or
// PromptChain_RegionalConditioning (Flux) or PromptChain_IdeogramCaption exactly
// like the 3D Poser, and each `$name{}` block in the prompt paints only inside
// its box.
//
// Like the 3D Poser, the canvas is a single relocatable element that can be
// "docked" into a roomy left-side panel (RegionPanel.svelte) — see enterDock /
// exitDock + region-box-registry.js. A SEPARATE extension from the Poser so a JS
// error here can never take down the Poser or the prompt editor. The region-name
// binding lives in the shared ./lib/regional-binding.js (which covers BOTH
// consumer classes).

import { app } from "../../scripts/app.js";
import { getLink } from "./lib/slot-utils.js";
import { regionBoxRegistry } from "./lib/region-box-registry.js";
import {
  traceRegionConsumer,
  reconcileRegionBlocks,
  renameRegionBlock,
  ensureConsumerPoseWire,
} from "./lib/regional-binding.js";

const NODE_TYPE = "PromptChain_RegionBox";
const MIN_NODE_SIZE = [340, 360];
const MIN_BOX = 0.02;            // ignore accidental micro-drags (fraction of frame)
const HANDLE_VIS = 4;            // half-size of a drawn resize handle (px)
const HANDLE_HIT = 12;           // px radius to grab a resize handle
const DEADZONE = 4;             // px a click must travel before it becomes a move
const SIDEBAR_SHOW_WIDTH = 380;  // container width at/above which the region list shows
const PALETTE = ["#5b9dff", "#ff7a7a", "#67d98b", "#f0c651", "#c08bff", "#54d6d6", "#ff9f5b", "#e06fb0"];

console.log("%c[PromptChain RegionBox] BUILD region-box-2 (panel + list redesign) loaded", "color:#7fffb0;font-weight:bold");

let idSeq = 1;
function genId() { return "rb" + (idSeq++); }

// ── tiny widget helpers (local copies; trivial, not the shared binding logic) ──
function setWidgetValue(node, name, value) {
  const w = node.widgets?.find((x) => x.name === name);
  if (w) w.value = value;
}
function widgetValue(node, name) {
  return node.widgets?.find((x) => x.name === name)?.value;
}
function hideWidget(node, name) {
  const w = node.widgets?.find((x) => x.name === name);
  if (!w) return;
  w.type = "hidden";
  w.computeSize = () => [0, -4];
}

// ── one-time stylesheet for the region list (hover states need real CSS) ──────
function installRegionStyles() {
  if (document.getElementById("pcr-region-box-styles")) return;
  const s = document.createElement("style");
  s.id = "pcr-region-box-styles";
  s.textContent = `
.pcr-region-box { display:flex; flex-direction:row; }
.pcr-rb-sidebar {
  display:flex; flex-direction:column; width:150px; flex-shrink:0;
  background:#15151b; border-right:1px solid #2c2c36; min-width:0; overflow:hidden;
}
.pcr-rb-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:6px 8px; font:600 11px/1 sans-serif; color:#9aa0ad;
  letter-spacing:.04em; text-transform:uppercase; border-bottom:1px solid #2c2c36;
}
.pcr-rb-addbtn {
  background:#2a2f3a; color:#cfe3ff; border:1px solid #3a4150; border-radius:4px;
  font:600 11px sans-serif; padding:2px 7px; cursor:pointer; white-space:nowrap;
}
.pcr-rb-addbtn:hover { background:#34506e; border-color:#4a6a90; }
.pcr-rb-list { flex:1; overflow-y:auto; overflow-x:hidden; padding:4px; }
.pcr-rb-empty { color:#6a6a78; font:italic 11px/1.4 sans-serif; padding:10px 8px; text-align:center; }
.pcr-rb-row {
  display:flex; align-items:center; gap:5px; padding:4px 5px; border-radius:4px;
  cursor:pointer; margin-bottom:2px;
}
.pcr-rb-row:hover { background:#20212a; }
.pcr-rb-row.active { background:#2c3242; outline:1px solid #4a6a90; }
.pcr-rb-swatch {
  width:13px; height:13px; border-radius:3px; flex-shrink:0; cursor:pointer;
  border:1px solid rgba(255,255,255,.25);
}
.pcr-rb-name {
  flex:1; min-width:0; color:#dfe3ea; font:12px sans-serif;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.pcr-rb-nameinput {
  flex:1; min-width:0; background:#1a1a22; color:#cfe3ff;
  border:1px solid #5b9dff; border-radius:3px; padding:1px 4px; font:12px sans-serif; outline:none;
}
.pcr-rb-iconbtn {
  background:transparent; border:none; color:#7c8190; cursor:pointer;
  font:12px/1 sans-serif; padding:1px 3px; border-radius:3px; flex-shrink:0;
}
.pcr-rb-iconbtn:hover { color:#fff; background:#3a4150; }
.pcr-rb-iconbtn:disabled { opacity:.25; cursor:default; background:transparent; }
.pcr-rb-canvas-wrap { position:relative; flex:1; min-width:0; }
`;
  document.head.appendChild(s);
}

// ── latent-resolution awareness (fork of the Poser's, scoped to RegionBox) ────
// The canvas letterboxes to the generation aspect, so the box node mirrors the
// downstream latent's width/height. Forked rather than reused because the
// Poser's helpers self-skip on its own node type and re-sync via the pose
// registry — both must point at RegionBox here instead.
const regionBoxNodes = new Set();

const SAMPLER_TYPES = new Set([
  "KSampler", "KSamplerAdvanced", "SamplerCustom", "SamplerCustomAdvanced",
  "PromptChain_RegionalDetailer", "UltimateSDUpscale",
]);
const LATENT_RES_TYPES = new Set([
  "EmptyLatentImage", "EmptySD3LatentImage", "EmptyHunyuanLatentVideo",
  "SDXLEmptyLatentSizePicker", "EmptyImage", "EmptyMochiLatentVideo", "EmptyLTXVLatentVideo",
]);

function findDownstreamSampler(start, graph) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    for (const out of n.outputs || []) {
      for (const lid of out.links || []) {
        const l = getLink(graph, lid);
        if (!l) continue;
        const t = graph.getNodeById(l.target_id);
        if (!t) continue;
        if (SAMPLER_TYPES.has(t.comfyClass || t.type)) return t;
        queue.push(t);
      }
    }
  }
  return null;
}

function findResUpstream(start, graph) {
  const seen = new Set();
  const queue = [start];
  let fallback = null;
  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    // Skip our OWN node type so a box never adopts its own width/height as the
    // latent source (the Poser's copy skips PromptChain_PoseStudio here).
    if ((n.comfyClass || n.type) !== NODE_TYPE) {
      const w = n.widgets?.find((x) => x.name === "width");
      const h = n.widgets?.find((x) => x.name === "height");
      if (w && h && typeof w.value === "number" && typeof h.value === "number") {
        const res = { width: Math.round(w.value), height: Math.round(h.value), node: n };
        if (LATENT_RES_TYPES.has(n.comfyClass || n.type)) return res;
        if (!fallback) fallback = res;
      }
    }
    for (const inp of n.inputs || []) {
      if (inp.link == null) continue;
      const l = getLink(graph, inp.link);
      const s = l && graph.getNodeById(l.origin_id);
      if (s) queue.push(s);
    }
  }
  return fallback;
}

function findLatentResolution(node) {
  const graph = app.graph;
  if (!graph) return null;
  const sampler = findDownstreamSampler(node, graph);
  if (!sampler) return null;
  const latentInput = (sampler.inputs || []).find((i) => /latent|samples/i.test(i.name) && i.link != null);
  let start = sampler;
  if (latentInput) {
    const l = getLink(graph, latentInput.link);
    const src = l && graph.getNodeById(l.origin_id);
    if (src) start = src;
  }
  return findResUpstream(start, graph);
}

// Editing the latent's width/height pushes the new resolution into every live
// box node — event-driven, no polling. Distinct hook flag from the Poser's so
// both can hook the same latent node independently.
function hookLatentResWidgets(resNode) {
  for (const name of ["width", "height"]) {
    const w = resNode.widgets?.find((x) => x.name === name);
    if (!w || w._pcrRegionResHooked) continue;
    w._pcrRegionResHooked = true;
    const orig = w.callback;
    w.callback = function (...args) {
      const r = orig?.apply(this, args);
      requestAnimationFrame(() => {
        for (const n of regionBoxNodes) if (n._pcrAlive) syncToLatent(n);
      });
      return r;
    };
  }
}

function syncToLatent(node) {
  const res = findLatentResolution(node);
  if (!res) return;
  if (res.node) hookLatentResWidgets(res.node);
  const wW = node.widgets?.find((w) => w.name === "width");
  const hW = node.widgets?.find((w) => w.name === "height");
  if (!wW || !hW) return;
  if (wW.value === res.width && hW.value === res.height) return;
  wW.value = res.width;
  hW.value = res.height;
  node._pcrRedraw?.();           // re-letterbox to the new aspect
  node.setDirtyCanvas?.(true, true);
}

// ── canvas ────────────────────────────────────────────────────────────────
function setupRegionBox(node) {
  node._pcrAlive = true;
  installRegionStyles();
  regionBoxNodes.add(node);
  hideWidget(node, "box_state");

  let boxes = [];        // [{id,name,x,y,w,h,color?}] normalized 0-1, top-left origin
  let activeId = null;   // id of the selected box, or null

  const container = document.createElement("div");
  container.className = "pcr-region-box";
  container.tabIndex = 0;     // focusable so Delete only fires when the canvas has focus
  container.style.cssText =
    "position:relative;width:100%;height:100%;min-height:120px;outline:none;" +
    "background:#0d0d11;border-radius:6px;overflow:hidden;touch-action:none;";

  // Region list sidebar (shown only when the surface is wide enough).
  const sidebar = document.createElement("div");
  sidebar.className = "pcr-rb-sidebar";
  const head = document.createElement("div");
  head.className = "pcr-rb-head";
  const headTitle = document.createElement("span");
  headTitle.textContent = "Regions";
  const addBtn = document.createElement("button");
  addBtn.className = "pcr-rb-addbtn";
  addBtn.textContent = "+ Add";
  addBtn.title = "Add a region in the centre of the frame";
  head.appendChild(headTitle);
  head.appendChild(addBtn);
  const syncBtn = document.createElement("button");
  syncBtn.className = "pcr-rb-addbtn";
  syncBtn.textContent = "⟲";
  syncBtn.title = "Pull $name{} regions from the prompt into boxes";
  syncBtn.addEventListener("click", (e) => { e.stopPropagation(); syncFromPrompt(); });
  head.appendChild(syncBtn);
  const list = document.createElement("div");
  list.className = "pcr-rb-list";
  sidebar.appendChild(head);
  sidebar.appendChild(list);
  container.appendChild(sidebar);

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "pcr-rb-canvas-wrap";
  canvasWrap.style.cursor = "crosshair";
  container.appendChild(canvasWrap);

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  canvasWrap.appendChild(canvas);

  const hint = document.createElement("div");
  hint.textContent = "drag empty frame to add · drag a box or its $label to move · right-click to rename / delete";
  hint.style.cssText =
    "position:absolute;left:8px;bottom:6px;right:8px;pointer-events:none;z-index:2;" +
    "font:11px/1.3 sans-serif;color:#8a8a98;text-shadow:0 1px 2px #000;";
  canvasWrap.appendChild(hint);

  node.addDOMWidget("region_box_view", "region_box_view", container, { serialize: false });

  // Track this Region Box for the panel: register existence (gates the menubar
  // button) + mark last-touched so the panel docks whichever node you last used.
  regionBoxRegistry.add(node);
  // Capture phase so it fires even though the canvas's own onDown stops the
  // event from bubbling back up to the container.
  container.addEventListener("pointerdown", () => regionBoxRegistry.touch(node), true);
  // Keep sidebar/list interactions from reaching LiteGraph (node drag/select).
  // The canvas isolates itself in onDown; this covers the list controls. Bubble
  // phase so inner handlers still run first.
  for (const ev of ["pointerdown", "click", "dblclick", "wheel"]) {
    container.addEventListener(ev, (e) => e.stopPropagation());
  }

  // Inline rename input on the canvas. window.prompt() is disabled in the
  // ComfyUI desktop (Electron) build — it silently returns null — so a prompt-
  // based rename never commits. Overlay <input> like the 3D Poser instead.
  const renameInput = document.createElement("input");
  renameInput.type = "text";
  renameInput.maxLength = 24;
  renameInput.spellcheck = false;
  renameInput.style.cssText =
    "position:absolute;z-index:7;display:none;background:#1a1a22;color:#cfe3ff;" +
    "border:1px solid #5b9dff;border-radius:4px;padding:2px 6px;" +
    "font:12px sans-serif;outline:none;";
  renameInput.addEventListener("pointerdown", (e) => e.stopPropagation());
  canvasWrap.appendChild(renameInput);
  let renameId = null;
  let listRenameCommit = null;   // commit fn for an in-place region-list rename, if open
  const rowEls = new Map();      // id -> { row, nameEl } so a rename can re-find its live row
  const closeRename = () => { renameId = null; renameInput.style.display = "none"; };
  const commitCanvasRename = () => {
    const id = renameId;
    if (id == null) return;
    const value = renameInput.value;
    closeRename();
    applyRename(id, value);
  };
  renameInput.addEventListener("keydown", (e) => {
    e.stopPropagation();  // graph hotkeys must not fire while typing
    if (e.key === "Enter") commitCanvasRename();
    else if (e.key === "Escape") closeRename();
  });
  renameInput.addEventListener("blur", commitCanvasRename);

  // ── helpers ──
  function sanitize(name) {
    return String(name || "").replace(/[^\w]/g, "");
  }
  function uniqueName() {
    let n = 1;
    // Case-insensitive: the backend lowercases entity names, so 'Hero'/'hero'
    // collide to one mask — match that here so names stay unambiguous.
    const have = new Set(boxes.map((b) => b.name.toLowerCase()));
    while (have.has("region" + n)) n++;
    return "region" + n;
  }
  function indexOfId(id) { return boxes.findIndex((b) => b.id === id); }
  function activeIndex() { return indexOfId(activeId); }
  function boxColor(b, i) { return b.color || PALETTE[i % PALETTE.length]; }

  // letterbox the output aspect inside the canvas's own CSS pixel box
  function frame() {
    const cw = canvas.clientWidth || 1;
    const ch = canvas.clientHeight || 1;
    const ow = Math.max(1, widgetValue(node, "width") || 832);
    const oh = Math.max(1, widgetValue(node, "height") || 1216);
    const ar = ow / oh, car = cw / ch;
    let fw, fh;
    if (car > ar) { fh = ch; fw = ch * ar; } else { fw = cw; fh = cw / ar; }
    return { fx: (cw - fw) / 2, fy: (ch - fh) / 2, fw, fh, cw, ch };
  }

  const toPx = (b, f) => ({ x: f.fx + b.x * f.fw, y: f.fy + b.y * f.fh, w: b.w * f.fw, h: b.h * f.fh });

  // The drawn `$name` chip above a box — kept identical to draw() so it's a
  // grab/select/rename target too (clicking the label === clicking the box).
  function labelRect(b, f) {
    const r = toPx(b, f);
    const ctx = canvas.getContext("2d");
    ctx.font = "12px sans-serif";
    const tw = ctx.measureText("$" + (b.name || "region")).width;
    return { x: r.x, y: Math.max(f.fy, r.y - 16), w: tw + 8, h: 16 };
  }

  // 8 resize handles for a px rect, keyed by which edges they move
  function handles(r) {
    return [
      { id: "nw", x: r.x, y: r.y }, { id: "n", x: r.x + r.w / 2, y: r.y }, { id: "ne", x: r.x + r.w, y: r.y },
      { id: "e", x: r.x + r.w, y: r.y + r.h / 2 }, { id: "se", x: r.x + r.w, y: r.y + r.h },
      { id: "s", x: r.x + r.w / 2, y: r.y + r.h }, { id: "sw", x: r.x, y: r.y + r.h }, { id: "w", x: r.x, y: r.y + r.h / 2 },
    ];
  }
  function cursorForHandle(id) {
    if (id === "nw" || id === "se") return "nwse-resize";
    if (id === "ne" || id === "sw") return "nesw-resize";
    if (id === "n" || id === "s") return "ns-resize";
    return "ew-resize";
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const f = frame();
    if (canvas.width !== Math.round(f.cw * dpr) || canvas.height !== Math.round(f.ch * dpr)) {
      canvas.width = Math.round(f.cw * dpr);
      canvas.height = Math.round(f.ch * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, f.cw, f.ch);

    // dead (non-drawable) area vs the drawable "paper" frame — clear figure/ground
    ctx.fillStyle = "#0d0d11";
    ctx.fillRect(0, 0, f.cw, f.ch);
    ctx.fillStyle = "#1b1b22";
    ctx.fillRect(f.fx, f.fy, f.fw, f.fh);

    // rule-of-thirds guides (subtle composition aid)
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let k = 1; k <= 2; k++) {
      const gx = Math.round(f.fx + (f.fw * k) / 3) + 0.5;
      const gy = Math.round(f.fy + (f.fh * k) / 3) + 0.5;
      ctx.beginPath(); ctx.moveTo(gx, f.fy); ctx.lineTo(gx, f.fy + f.fh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f.fx, gy); ctx.lineTo(f.fx + f.fw, gy); ctx.stroke();
    }

    // bright drawable-frame border
    ctx.strokeStyle = "#5a5a6e";
    ctx.lineWidth = 2;
    ctx.strokeRect(f.fx + 1, f.fy + 1, f.fw - 2, f.fh - 2);

    const aIdx = activeIndex();
    boxes.forEach((b, i) => {
      const r = toPx(b, f);
      const color = boxColor(b, i);
      ctx.fillStyle = color + "2b";       // ~17% alpha fill
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = color;
      ctx.lineWidth = i === aIdx ? 2.5 : 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      const label = "$" + (b.name || "region");
      ctx.font = "12px sans-serif";
      const tw = ctx.measureText(label).width;
      const ly = Math.max(f.fy, r.y - 16);
      ctx.fillStyle = color;
      ctx.fillRect(r.x, ly, tw + 8, 16);
      ctx.fillStyle = "#101015";
      ctx.fillText(label, r.x + 4, ly + 12);

      if (i === aIdx) {
        for (const hd of handles(r)) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(hd.x - HANDLE_VIS, hd.y - HANDLE_VIS, HANDLE_VIS * 2, HANDLE_VIS * 2);
          ctx.fillStyle = color;
          ctx.fillRect(hd.x - HANDLE_VIS + 1, hd.y - HANDLE_VIS + 1, HANDLE_VIS * 2 - 2, HANDLE_VIS * 2 - 2);
        }
      }
    });
  }
  node._pcrRedraw = draw;

  // ── region list ──
  // Commit any open in-place rename before its row gets torn out / replaced.
  // Null the handle first so the commit's own renderList doesn't recurse here.
  function commitListRename() {
    if (!listRenameCommit) return;
    const c = listRenameCommit;
    listRenameCommit = null;
    c();
  }

  function renderList() {
    commitListRename();
    rowEls.clear();
    list.replaceChildren();
    if (!boxes.length) {
      const empty = document.createElement("div");
      empty.className = "pcr-rb-empty";
      empty.textContent = "No regions yet — drag on the canvas or click + Add.";
      list.appendChild(empty);
      return;
    }
    boxes.forEach((b, i) => {
      const row = document.createElement("div");
      row.className = "pcr-rb-row" + (b.id === activeId ? " active" : "");

      const swatch = document.createElement("div");
      swatch.className = "pcr-rb-swatch";
      swatch.style.background = boxColor(b, i);
      swatch.title = "Click to change colour";
      swatch.addEventListener("click", (e) => { e.stopPropagation(); recolor(b.id); });

      const name = document.createElement("span");
      name.className = "pcr-rb-name";
      name.textContent = "$" + (b.name || "region");
      name.title = "Double-click to rename";
      name.addEventListener("dblclick", (e) => { e.stopPropagation(); startListRename(b.id); });

      const up = document.createElement("button");
      up.className = "pcr-rb-iconbtn"; up.textContent = "▲"; up.title = "Move back";
      up.disabled = i === 0;
      up.addEventListener("click", (e) => { e.stopPropagation(); reorder(b.id, -1); });

      const down = document.createElement("button");
      down.className = "pcr-rb-iconbtn"; down.textContent = "▼"; down.title = "Move forward";
      down.disabled = i === boxes.length - 1;
      down.addEventListener("click", (e) => { e.stopPropagation(); reorder(b.id, 1); });

      const del = document.createElement("button");
      del.className = "pcr-rb-iconbtn"; del.textContent = "✕"; del.title = "Delete region";
      del.addEventListener("click", (e) => { e.stopPropagation(); removeBox(b.id); });

      row.addEventListener("click", () => { activeId = b.id; draw(); renderList(); });

      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(up);
      row.appendChild(down);
      row.appendChild(del);
      list.appendChild(row);
      rowEls.set(b.id, { row, nameEl: name });
    });
  }

  // In-place rename keyed by id (not a DOM ref): committing a prior rename may
  // rebuild the list, so we look the live row up fresh from rowEls afterwards.
  function startListRename(id) {
    if (renameId != null) commitCanvasRename();   // close any open canvas rename
    commitListRename();                            // and any other open list rename
    const i = indexOfId(id);
    const ref = rowEls.get(id);
    if (i < 0 || !ref) return;
    const input = document.createElement("input");
    input.className = "pcr-rb-nameinput";
    input.maxLength = 24;
    input.spellcheck = false;
    input.value = boxes[i].name;
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      listRenameCommit = null;
      if (commit) applyRename(id, input.value);
      else renderList();
    };
    listRenameCommit = () => finish(true);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("click", (e) => e.stopPropagation());
    ref.row.replaceChild(input, ref.nameEl);
    input.focus();
    input.select();
  }

  // ── mutations (each persists, re-binds where names/order change, redraws) ──
  function applyRename(id, raw) {
    const i = indexOfId(id);
    if (i < 0) return;
    const next = sanitize(raw);
    if (!next || next === boxes[i].name) { renderList(); return; }
    // Case-insensitive uniqueness — the backend lowercases names, so 'Hero' and
    // 'hero' would otherwise pass here then collide to one mask row.
    if (boxes.some((b, j) => j !== i && b.name.toLowerCase() === next.toLowerCase())) { renderList(); return; }
    const old = boxes[i].name;
    boxes[i].name = next;
    persist();
    renameRegionBlock(node, old, next);  // carry typed tags to the new name
    bind();
    draw();
    renderList();
  }

  function recolor(id) {
    const i = indexOfId(id);
    if (i < 0) return;
    const cur = boxes[i].color || PALETTE[i % PALETTE.length];
    const ci = PALETTE.indexOf(cur);
    boxes[i].color = PALETTE[(ci + 1) % PALETTE.length];
    persist();
    draw();
    renderList();
  }

  function reorder(id, dir) {
    const i = indexOfId(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= boxes.length) return;
    const [b] = boxes.splice(i, 1);
    boxes.splice(j, 0, b);   // array order = mask-row / z order
    persist();
    draw();
    renderList();
  }

  function removeBox(id) {
    const i = indexOfId(id);
    if (i < 0) return;
    boxes.splice(i, 1);
    if (activeId === id) activeId = null;
    persist();
    draw();
    renderList();
  }

  function addRegion() {
    const id = genId();
    boxes.push({ id, name: uniqueName(), x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
    activeId = id;
    persist();
    bind();
    draw();
    renderList();
  }
  addBtn.addEventListener("click", (e) => { e.stopPropagation(); addRegion(); });

  function addRegionAt(x, y) {
    const id = genId();
    const w = 0.3, h = 0.3;
    boxes.push({ id, name: uniqueName(), x: clamp01(x - w / 2), y: clamp01(y - h / 2), w, h });
    activeId = id;
    persist(); bind(); draw(); renderList();
  }

  function openCanvasRename(id) {
    const i = indexOfId(id);
    if (i < 0) return;
    commitListRename();
    activeId = id; renameId = id;
    const f = frame();
    const r = toPx(boxes[i], f);
    renameInput.value = boxes[i].name;
    renameInput.style.left = r.x + "px";
    renameInput.style.top = Math.max(f.fy, r.y - 18) + "px";
    renameInput.style.width = Math.max(70, Math.min(r.w || 120, 160)) + "px";
    renameInput.style.display = "block";
    renameInput.focus(); renameInput.select();
    draw();
  }

  // Pull `$name{}` blocks from the bound prompt into boxes (prompt -> node).
  // Event-driven: on panel open, on rewire, or via the ⟲ button — never polled.
  function syncFromPrompt() {
    const { pc } = traceRegionConsumer(node);
    if (!pc?._pcrEditor) return;
    const text = pc._pcrEditor.state.doc.toString();
    const have = new Set(boxes.map((b) => b.name.toLowerCase()));
    let added = false;
    for (const m of text.matchAll(/\$(\w+)\s*\{/g)) {
      const low = m[1].toLowerCase();
      if (low === "background" || have.has(low)) continue;  // background is a scope, not a box
      boxes.push({ id: genId(), name: sanitize(m[1]), x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
      have.add(low);
      added = true;
    }
    if (added) { persist(); draw(); renderList(); }
  }

  // ── right-click context menu (Rename / Recolour / Delete on a box; Add on empty) ──
  let ctxMenu = null;
  function closeCtxMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
  function openCtxMenu(clientX, clientY, items) {
    closeCtxMenu();
    const menu = document.createElement("div");
    menu.style.cssText =
      "position:fixed;z-index:10000;left:" + clientX + "px;top:" + clientY + "px;" +
      "background:#1b1b22;border:1px solid #3a3a46;border-radius:6px;padding:4px;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.5);min-width:150px;font:13px sans-serif;";
    menu.addEventListener("pointerdown", (e) => e.stopPropagation());
    for (const it of items) {
      const row = document.createElement("div");
      row.textContent = it.label;
      row.style.cssText = "padding:6px 10px;border-radius:4px;cursor:pointer;color:" +
        (it.danger ? "#ff8a8a" : "#dfe3ea") + ";";
      row.addEventListener("mouseenter", () => { row.style.background = "#2c3242"; });
      row.addEventListener("mouseleave", () => { row.style.background = "transparent"; });
      row.addEventListener("click", (e) => { e.stopPropagation(); closeCtxMenu(); it.action(); });
      menu.appendChild(row);
    }
    document.body.appendChild(menu);
    ctxMenu = menu;
    setTimeout(() => document.addEventListener("pointerdown", closeCtxMenu, { capture: true, once: true }), 0);
  }
  function onContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();   // suppress LiteGraph's node menu
    const { px, py, nx, ny, f } = pointerNorm(e);
    const i = hitBox(px, py, f);
    if (i >= 0) {
      const id = boxes[i].id;
      activeId = id; draw(); renderList();
      openCtxMenu(e.clientX, e.clientY, [
        { label: "Rename", action: () => openCanvasRename(id) },
        { label: "Recolour", action: () => recolor(id) },
        { label: "Delete", danger: true, action: () => removeBox(id) },
      ]);
    } else if (insideFrame(px, py, f)) {
      openCtxMenu(e.clientX, e.clientY, [
        { label: "Add region here", action: () => addRegionAt(nx, ny) },
      ]);
    }
  }

  function load() {
    let data = [];
    try {
      const raw = JSON.parse(widgetValue(node, "box_state") || "[]");
      data = Array.isArray(raw) ? raw : (raw.boxes || []);
    } catch { data = []; }
    boxes = data.filter((b) => b && typeof b.x === "number").map((b) => ({
      id: b.id || null,
      name: sanitize(b.name) || "",
      x: b.x, y: b.y, w: b.w, h: b.h,
      ...(b.color ? { color: b.color } : {}),
    }));
    // stable ids: bump the seq past any saved suffix, then fill missing ids
    for (const b of boxes) {
      const m = b.id && /^rb(\d+)$/.exec(b.id);
      if (m) idSeq = Math.max(idSeq, +m[1] + 1);
    }
    for (const b of boxes) if (!b.id) b.id = genId();
    if (activeId != null && indexOfId(activeId) < 0) activeId = null;
    draw();
    renderList();
  }

  function persist() {
    setWidgetValue(node, "box_state", JSON.stringify({ boxes }));
    node.setDirtyCanvas?.(true, true);
  }

  // Push box names into the bound prompt as $name{} blocks + wire POSE_JSON.
  // Called on commit (add/rename), not during a drag, so the editor isn't thrashed.
  function bind() {
    ensureConsumerPoseWire(node);
    reconcileRegionBlocks(node, boxes.map((b) => b.name).filter(Boolean));
  }

  // ── pointer interaction ──
  let drag = null;  // {mode:'new'|'move'|'resize', ...}

  function pointerNorm(e) {
    const rect = canvas.getBoundingClientRect();
    const f = frame();
    // getBoundingClientRect() is in SCREEN px (scaled by the LiteGraph graph
    // zoom), but frame()/draw() work in canvas LAYOUT px (clientWidth). Convert
    // screen->layout so the rubber band, hit-testing and cursor line up at ANY
    // zoom. Without this, off-100% zoom made drags miss every box (=> "move
    // creates a new box"), the rubber band drift, and the wrong hover cursor.
    const sx = (canvas.clientWidth || 1) / (rect.width || 1);
    const sy = (canvas.clientHeight || 1) / (rect.height || 1);
    const px = (e.clientX - rect.left) * sx;
    const py = (e.clientY - rect.top) * sy;
    return { px, py, f, nx: (px - f.fx) / f.fw, ny: (py - f.fy) / f.fh };
  }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  function insideFrame(px, py, f) {
    return px >= f.fx && px <= f.fx + f.fw && py >= f.fy && py <= f.fy + f.fh;
  }

  function hitHandle(px, py, f) {
    const i = activeIndex();
    if (i < 0) return null;
    const r = toPx(boxes[i], f);
    for (const hd of handles(r)) {
      if (Math.abs(px - hd.x) <= HANDLE_HIT && Math.abs(py - hd.y) <= HANDLE_HIT) return hd.id;
    }
    return null;
  }
  function hitBox(px, py, f) {
    for (let i = boxes.length - 1; i >= 0; i--) {   // topmost first
      const r = toPx(boxes[i], f);
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
      const l = labelRect(boxes[i], f);             // the $name label is part of the box
      if (px >= l.x && px <= l.x + l.w && py >= l.y && py <= l.y + l.h) return i;
    }
    return -1;
  }

  function updateCursor(px, py, f) {
    const h = hitHandle(px, py, f);
    if (h) { canvasWrap.style.cursor = cursorForHandle(h); return; }
    if (hitBox(px, py, f) >= 0) { canvasWrap.style.cursor = "move"; return; }
    canvasWrap.style.cursor = insideFrame(px, py, f) ? "crosshair" : "default";
  }

  function onDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();        // keep litegraph from panning/selecting the node
    // Release any stale LiteGraph pointer-capture left by a prior node drag —
    // otherwise it keeps the pointer and our move/resize never sees pointermove.
    const lg = document.querySelector("canvas.lgraphcanvas");
    if (lg && typeof e.pointerId === "number") {
      try { if (lg.hasPointerCapture(e.pointerId)) lg.releasePointerCapture(e.pointerId); } catch {}
    }
    container.focus();
    const { px, py, nx, ny, f } = pointerNorm(e);
    const h = hitHandle(px, py, f);
    if (h) {
      drag = { mode: "resize", handle: h };
    } else {
      const i = hitBox(px, py, f);
      if (i >= 0) {
        // select first; only turn into a move once the pointer crosses the
        // dead-zone, so a plain click selects without nudging the box.
        activeId = boxes[i].id;
        drag = { mode: "move", ox: nx - boxes[i].x, oy: ny - boxes[i].y, downPx: px, downPy: py, moved: false };
        renderList();
      } else if (insideFrame(px, py, f)) {
        const id = genId();
        boxes.push({ id, name: "", x: clamp01(nx), y: clamp01(ny), w: 0, h: 0 });
        activeId = id;
        drag = { mode: "new", ax: clamp01(nx), ay: clamp01(ny) };
      } else {
        activeId = null;            // click in the dead margin clears selection
        renderList();
      }
    }
    canvas.setPointerCapture?.(e.pointerId);
    draw();
  }

  function onMove(e) {
    const p = pointerNorm(e);
    if (!drag) { updateCursor(p.px, p.py, p.f); return; }
    e.stopPropagation();
    const { px, py, nx, ny } = p;
    const i = activeIndex();
    if (i < 0) return;
    const b = boxes[i];
    if (drag.mode === "new") {
      b.x = Math.min(drag.ax, clamp01(nx));
      b.y = Math.min(drag.ay, clamp01(ny));
      b.w = Math.abs(clamp01(nx) - drag.ax);
      b.h = Math.abs(clamp01(ny) - drag.ay);
    } else if (drag.mode === "move") {
      if (!drag.moved) {
        if (Math.abs(px - drag.downPx) < DEADZONE && Math.abs(py - drag.downPy) < DEADZONE) return;
        drag.moved = true;
      }
      b.x = clamp01(nx - drag.ox); if (b.x + b.w > 1) b.x = 1 - b.w;
      b.y = clamp01(ny - drag.oy); if (b.y + b.h > 1) b.y = 1 - b.h;
    } else if (drag.mode === "resize") {
      resize(b, drag.handle, clamp01(nx), clamp01(ny));
    }
    draw();
  }

  function resize(b, handle, nx, ny) {
    let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    if (handle.includes("w")) x0 = nx;
    if (handle.includes("e")) x1 = nx;
    if (handle.includes("n")) y0 = ny;
    if (handle.includes("s")) y1 = ny;
    b.x = Math.min(x0, x1); b.w = Math.abs(x1 - x0);
    b.y = Math.min(y0, y1); b.h = Math.abs(y1 - y0);
  }

  function onUp(e) {
    if (!drag) return;
    e.stopPropagation();
    canvas.releasePointerCapture?.(e.pointerId);
    const wasNew = drag.mode === "new";
    const moved = drag.moved === true;
    const resized = drag.mode === "resize";
    drag = null;
    const i = activeIndex();
    const b = i >= 0 ? boxes[i] : null;
    if (wasNew && b && (b.w < MIN_BOX || b.h < MIN_BOX)) {
      boxes.splice(i, 1); activeId = null;   // discard a micro-drag (a click on empty frame)
      persist();
    } else if (wasNew && b) {
      if (!b.name) b.name = uniqueName();
      persist();
      bind();                                // new region: seed its $name{} block + wire POSE_JSON
    } else if (moved || resized) {
      persist();                             // move/resize: geometry changed, names unchanged
    }
    // a pure select click (move mode, dead-zone never crossed) changes nothing
    draw();
    renderList();
  }

  function onDblClick(e) {
    e.stopPropagation();
    if (renameId != null) commitCanvasRename();    // commit any open canvas rename
    const { px, py, f } = pointerNorm(e);
    const i = hitBox(px, py, f);
    if (i < 0) return;
    openCanvasRename(boxes[i].id);
  }

  function onKey(e) {
    if ((e.key === "Delete" || e.key === "Backspace") && activeId != null && renameId == null) {
      e.preventDefault();
      e.stopPropagation();
      removeBox(activeId);
    }
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("dblclick", onDblClick);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
  container.addEventListener("keydown", onKey);

  // Responsive: show the region list only when there's room; always redraw the
  // canvas to its new size. Event-driven via ResizeObserver (no polling).
  function applyResponsive() {
    sidebar.style.display = container.clientWidth >= SIDEBAR_SHOW_WIDTH ? "flex" : "none";
    if (renameId != null) commitCanvasRename();   // commit (not discard) — reflow would float it
    draw();
  }
  const ro = new ResizeObserver(() => applyResponsive());
  ro.observe(container);

  // ── dock into the Region Box panel (relocate-and-restore, mirrors the Poser) ──
  // The !important flow styles beat ComfyUI's per-frame DOM-widget writes (it
  // still holds this element's ref and would otherwise re-absolute-position/hide).
  let dockActive = false, dockSavedCss = "", dockParent = null, dockNextSibling = null;
  const enterDock = (panelBodyEl) => {
    if (!panelBodyEl) return;
    if (dockActive) exitDock();   // re-dock into a different panel cleanly
    dockActive = true;
    dockSavedCss = container.style.cssText;
    dockParent = container.parentNode;
    dockNextSibling = container.nextSibling;
    panelBodyEl.appendChild(container);
    container.style.cssText =
      "position:relative !important;left:0 !important;top:0 !important;" +
      "width:100% !important;height:100% !important;transform:none !important;" +
      "margin:0 !important;max-width:none !important;max-height:none !important;" +
      "display:flex !important;flex-direction:row !important;visibility:visible !important;opacity:1 !important;" +
      "background:#0d0d11;border-radius:0;overflow:hidden;touch-action:none;";
    applyResponsive();
    requestAnimationFrame(() => syncFromPrompt());   // opening the panel pulls in $name{} blocks
  };
  const exitDock = () => {
    if (!dockActive) return;
    dockActive = false;
    if (dockParent && dockParent.isConnected) {
      if (dockNextSibling && dockNextSibling.parentNode === dockParent) dockParent.insertBefore(container, dockNextSibling);
      else dockParent.appendChild(container);
    } else {
      container.remove();   // home slot gone (node removed while docked)
    }
    dockParent = dockNextSibling = null;
    container.style.cssText = dockSavedCss;
    applyResponsive();
  };
  node._pcrRegion = { enterDock, exitDock, container };

  // Adopt the downstream latent's resolution; re-sync when this node is rewired.
  const origOnConnectionsChange = node.onConnectionsChange;
  node.onConnectionsChange = function (...args) {
    origOnConnectionsChange?.apply(this, args);
    requestAnimationFrame(() => syncToLatent(node));
  };
  // Reload boxes after the workflow restores the hidden widget value.
  const origOnConfigure = node.onConfigure;
  node.onConfigure = function (...args) {
    origOnConfigure?.apply(this, args);
    load();
  };

  node.computeSize = (out) => {
    if (out) {
      const cur = node.size || MIN_NODE_SIZE;
      return [Math.max(MIN_NODE_SIZE[0], cur[0]), Math.max(MIN_NODE_SIZE[1], cur[1])];
    }
    return [...MIN_NODE_SIZE];
  };
  if (!node.size || node.size[0] < MIN_NODE_SIZE[0] || node.size[1] < MIN_NODE_SIZE[1]) {
    node.setSize?.(node.computeSize());
  }

  const origOnRemoved = node.onRemoved;
  node.onRemoved = function () {
    origOnRemoved?.call(this);
    node._pcrAlive = false;
    regionBoxNodes.delete(node);
    regionBoxRegistry.remove(node);   // un-gate panels; open panels re-dock or show empty
    closeCtxMenu();
    try { node._pcrRegion?.exitDock?.(); } catch {}
    node._pcrRegion = null;
    ro.disconnect();
  };

  load();
  requestAnimationFrame(() => { load(); applyResponsive(); syncToLatent(node); regionBoxRegistry.signalReady(node); });
}

app.registerExtension({
  name: "PromptChain.RegionBox",
  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;
    setupRegionBox(node);
  },
});
