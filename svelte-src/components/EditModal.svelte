<script>
  // EditModal — quick airbrush touch-up before a follow-up inpaint/upscale.
  // Strokes accumulate in a float coverage buffer (dabs spaced along the
  // stroke, flow buildup) and quantize to the canvas once with stable dither,
  // Alt-click eyedropper, restore-to-original eraser, ImageData-snapshot
  // undo. Save composites paint over the untouched source.

  import { portal } from "../lib/portal.js";
  import SettingsSlider from "./model/SettingsSlider.svelte";
  import SavePathInput from "./SavePathInput.svelte";
  import AdjustModal from "./AdjustModal.svelte";
  import "./sidebar/modal-shared.css";

  let {
    open,
    sourceUrl: srcUrlProp = "",
    width: widthProp = 0,
    height: heightProp = 0,
    filename = "",
    caps = null,
    fetchApi = null,
    apiURL = (p) => p,
    onSave = null,       // (blob, prefix) => entry | null
    onSaved = null,      // (entry) => void — viewer jumps to the result
    onOpenInpaint = null, // ({compositeBlob, maskCanvas}) => void — opens the full Inpaint modal
    onOpenUpscale = null, // ({cropBlob, rect}) => void — opens the Upscale modal on the region crop
    onOpenRepose = null,  // ({compositeBlob}) => void — opens the Re-pose modal on the whole composite
    onOpenI2i = null,     // ({compositeBlob, width, height}) => Promise<void> — opens the i2i modal on the /16-snapped composite
    figureRegions = [],   // [{name, text, maskUrl}] — the pose scene's region entities, for one-click figure selection
    editDocHash = "",     // content hash of the image being edited — restores its saved layer stack ("don't-flatten" persistence)
    suspended = false,    // an elevated modal (Inpaint/Upscale handoff) is open above — release the keyboard
    onCancel,
  } = $props();

  // ── Region → Inpaint: open the full Inpaint modal; its result returns here as a layer ──
  let inpaintMaskUsed = null; // mask used for the current handoff (for clipping the returned result)
  let upscaleRegionUsed = null; // { x, y, w, h, maskCanvas } of the current Region → Upscale handoff

  // local because Crop changes them — props only seed the values on open
  let sourceUrl = $state("");
  let width = $state(0);
  let height = $state(0);

  let savePrefix = $state("");
  let saving = $state(false);
  let errorMsg = $state("");
  let savingEdits = $state(false); // "Save edits" → opened image's sidecar, in flight
  let editsSaved = $state(false);  // "✓ Edits saved" chip; cleared by the next edit
  let restoring = $state(false); // loading a saved layer stack on open
  let handoffBusy = $state(null); // "inpaint" | "upscale" | "repose" | "i2i" while the handoff modal prepares (uploads/graph build)

  // Re-pose: hand the whole flattened composite to the Re-pose modal (pose a 3D
  // figure → background re-render into the new pose). Whole-image, not a region.
  async function openReposeHandoff() {
    if (!onOpenRepose) return;
    errorMsg = "";
    const compositeBlob = await flattenBlob();
    handoffBusy = "repose";
    try { await onOpenRepose({ compositeBlob }); }
    catch (e) { errorMsg = `Couldn't open Re-pose: ${e?.message || e}`; }
    finally { handoffBusy = null; }
  }

  // i2i: re-diffuse the whole flattened composite. The render dims are snapped
  // DOWN to a multiple of 16 with a centered crop — that's exactly what the VAE
  // encode would do server-side (it center-crops to /8, and DiT engines patchify
  // ×2 = /16), but doing it here means the result comes back at known dims and
  // composites over the original without the silent 1–3px shift a raw odd size
  // would cause. addI2iLayerFromResult scales the result to fill the document.
  async function openI2iHandoff() {
    if (!onOpenI2i) return;
    errorMsg = "";
    flushActive();
    const encW = Math.max(16, Math.floor(width / 16) * 16);
    const encH = Math.max(16, Math.floor(height / 16) * 16);
    const ox = (width - encW) >> 1, oy = (height - encH) >> 1;
    const c = document.createElement("canvas");
    c.width = encW; c.height = encH;
    drawFlattened(c.getContext("2d"), ox, oy, encW, encH, 0, 0, encW, encH);
    const compositeBlob = await new Promise((r) => c.toBlob(r, "image/png"));
    handoffBusy = "i2i";
    try { await onOpenI2i({ compositeBlob, width: encW, height: encH }); }
    catch (e) { errorMsg = `Couldn't open i2i: ${e?.message || e}`; }
    finally { handoffBusy = null; }
  }

  // ── view state (same stage-transform pattern as the inpaint painter) ──
  let viewportEl;
  let imgEl;
  let paintCanvas;
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);

  // ── brush state ──
  // The active tool survives editor reopens — someone living in the marquee
  // shouldn't be dropped back to the brush every edit. Only tools that are
  // safe to wake up in are remembered (Crop/Liquify/Camera Raw do setup work
  // at switch time and would restore half-initialized).
  const REMEMBERED_TOOLS = new Set(["move", "brush", "select", "lasso", "smooth", "spot", "heal", "stamp", "eyedrop", "bucket", "eraser"]);
  const savedTool = (() => { try { return localStorage.getItem("pcrEditTool"); } catch { return null; } })();
  let tool = $state(REMEMBERED_TOOLS.has(savedTool) ? savedTool : "brush");
  $effect(() => {
    if (REMEMBERED_TOOLS.has(tool)) {
      try { localStorage.setItem("pcrEditTool", tool); } catch { /* storage unavailable — session-only memory */ }
    }
  });
  // Maximized fills the screen; the choice persists so the editor reopens the
  // way you left it. The canvas re-fits automatically via the ResizeObserver.
  let maximized = $state((() => { try { return localStorage.getItem("pcrEditMaximized") === "1"; } catch { return false; } })());
  function toggleMaximize() {
    maximized = !maximized;
    try { localStorage.setItem("pcrEditMaximized", maximized ? "1" : "0"); } catch { /* storage unavailable — session-only memory */ }
  }
  let brushSize = $state(48);
  let flow = $state(0.12);           // per-dab deposit rate
  let opacity = $state(1);           // per-stroke coverage ceiling (PS model)
  let hardness = $state(0.35);
  let airbrush = $state(true);       // timed dabs while the button is held
  let featherPx = $state(0);         // Select: patch-commit edge feather
  let sampleSize = $state(1);        // Pick: 1 | 3 | 5 px average
  let sampleMerged = $state(true);   // Pick from the flattened composite (true) or the active layer only (false)
  let maskEdit = $state(false);      // editing the active layer's MASK (paintCanvas shows it as grayscale) vs its pixels
  let fillTolerance = $state(32);    // Paint bucket: color-match threshold
  let fillContiguous = $state(true); // Paint bucket: flood from click vs all matching pixels
  let hue = $state(0);               // HSV foreground color
  let sat = $state(0);
  let val = $state(1);
  let bgRgb = $state([0, 0, 0]);     // secondary (background) color for explicit fills (Alt/Ctrl+Backspace). The Background is a normal transparent layer now — moving/erasing it reveals the checker, no auto-fill. Default black.
  let cursorPos = $state(null);      // viewport-relative brush outline

  // ── layers ──
  // ONE live canvas (`paintCanvas`) always shows the ACTIVE layer, so every
  // tool keeps writing to it unchanged. Inactive layers are stored as bitmaps
  // and drawn into their own stacked canvases. Switching active flushes the
  // live canvas back to its layer's bitmap and loads the target's. The brush
  // composites over the layers BELOW the active one (its backdrop). Background
  // = the source image (imgEl), always the bottom.
  //   layer = { id, name, visible, opacity, bitmap: ImageData|null }
  let layers = $state([]);
  let activeIndex = $state(0);
  let layerCanvasEls = $state([]);   // per-inactive-layer <canvas> refs (by index) — ABOVE active only
  let belowCanvasEl;                 // everything BELOW active, pre-composited into one buffer
  let customEl;                      // single-canvas composite used when a custom (non-CSS) blend mode is in play
  let nextLayerNum = 0;
  let selectedIds = $state([]);      // multi-selected layer ids (for merge); always includes the active layer
  let groups = $state([]);           // lightweight layer groups: { id, name, collapsed, visible, opacity }
  let nextGroupNum = 0;
  let renamingGroupId = $state(null);
  let lhTab = $state("layers");      // Layers/History share one tabbed panel (PS-style)
  let layerMenu = $state(null);      // { x, y } right-click context menu
  let renamingId = $state(null);     // layer id being renamed (dblclick)
  let renameText = $state("");
  let canvasMenu = $state(null);     // { x, y } right-click menu on the canvas (selection commands)
  let rightDownAt = null;            // screen point of a right-button press — release without drag opens canvasMenu
  let subjectBusy = $state(false);   // Select Subject round-trip in flight
  let selSetupMsg = $state("");      // one-time AI-selection install/download progress
  let dragId = null;                 // layer id being dragged to reorder
  let dragOverId = $state(null);     // layer id currently under the drag
  let imgLoadTick = $state(0);       // bumped when the source <img> loads → redraw Background

  let painting = false;
  let panning = false;
  let lastPt = null;
  let strokeResidual = 0;

  // ── history (Photoshop-style): snapshot AFTER each action, click to jump ──
  // history[0] = "Open" (blank paint layer); undo/redo just move histIndex.
  // Painting while back in time truncates the forward entries (PS semantics).
  const HIST_MAX = 30; // entries share unchanged layer bitmaps by reference, so a deeper stack is cheap
  let history = $state([{ label: "Open", snap: null }]);
  let histIndex = $state(0);
  let blankSnap = null;

  // Entries carry their epoch (source url + dims) because Crop changes the
  // document — jumping across a crop boundary swaps the base image back.
  // Snapshot the WHOLE layer stack per action so structural changes (add /
  // delete / reorder / merge / inpaint-layer / move) are all undoable. Layer
  // objects are replaced (never mutated) on edits, so a shallow array copy
  // shares unchanged bitmaps by reference — cheap.
  function commitAction(label) {
    editsSaved = false; // a fresh change since the last "Save edits"
    flushActive(); // sync paintCanvas → the active layer's FULL bitmap (offset-aware)
    const head = history.slice(0, histIndex + 1);
    head.push({ label, layers: [...layers], groups: [...groups], activeIndex, selectedIds: [...selectedIds], sel: selSnapshot(), url: sourceUrl, w: width, h: height });
    while (head.length > HIST_MAX + 1) head.splice(1, 1); // evict oldest, keep "Open"
    history = head;
    histIndex = history.length - 1;
  }

  function jumpTo(i) {
    if (i < 0 || i >= history.length || i === histIndex || painting || liqStroking) return;
    if (tool === "liquify") dropLiqSession(); // rebuilt from the restored state
    const h = history[i];
    if (!h.layers) return; // legacy/empty entry
    histIndex = i;
    const dimsChanged = h.url !== sourceUrl || h.w !== width || h.h !== height;
    if (dimsChanged) {
      sourceUrl = h.url; width = h.w; height = h.h;
      sourceData = null; strokeCov = null; blankSnap = null;
      cropBox = null; healSource = null;
    }
    const restore = () => {
      layers = [...h.layers];
      // collapse is view-only: keep the current expand/collapse state across undo/redo
      groups = h.groups ? h.groups.map((g) => { const cur = groups.find((x) => x.id === g.id); return cur ? { ...g, collapsed: cur.collapsed } : g; }) : [];
      activeIndex = Math.min(h.activeIndex ?? 0, layers.length - 1);
      selectedIds = h.selectedIds ? [...h.selectedIds] : [layers[activeIndex]?.id].filter((x) => x != null);
      restoreSelection(h.sel); // bring back the pixel selection that existed at this step
      loadActiveBitmap();
      if (dimsChanged) resetView();
    };
    if (dimsChanged) requestAnimationFrame(restore); // canvas resize flushes first
    else restore();
  }

  function undo() { jumpTo(histIndex - 1); }
  function redo() { jumpTo(histIndex + 1); }

  // Keep the ACTIVE history row in view — new commits land at the bottom of a
  // scrolling column, and undo/redo can walk above the fold.
  let histEl = null;
  $effect(() => {
    histIndex; history.length; // deps
    requestAnimationFrame(() => {
      histEl?.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    });
  });

  // Live eyedrop: hold the button → bubble tracks the color under the
  // pointer; the color only commits on release.
  let picking = false;
  let pickRgb = null;
  let pickPreview = $state(null);    // { x, y, hex } viewport coords

  // ── rectangle select + transform (gradient repair) ──
  // Lift a COPY of the selected region as a floating patch, move/stretch it
  // freely (non-uniform on purpose — stretching a clean gradient band over a
  // blemish is the whole use case), commit onto the paint layer as one stroke.
  let selRect = $state(null);        // marquee while dragging (image coords)
  // floating patch: { canvas (feathered view), raw (unfeathered pixels),
  // pts (lasso shape, bbox-relative, null = rect), pw, ph, x, y, w, h }
  let patch = $state(null);
  let patchEl = $state(null);
  let patchOpacity = $state(1);      // live patch opacity, applied at commit too
  let selecting = false;
  let selStart = null;
  let patchDrag = null;              // { mode: "move"|handle dir, startX, startY, orig }
  let overRotateZone = $state(false); // pointer is just outside a transform corner → rotate cursor
  // Custom rotate cursor (CSS has no built-in): a double circular arrow with a
  // white halo so it reads on any canvas colour; hotspot centred (14,14 of 28px).
  const ROTATE_CURSOR = (() => {
    const g = "<path d='M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'/><path d='M21 3v5h-5'/><path d='M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'/><path d='M8 16H3v5'/>";
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24'><g fill='none' stroke='#fff' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'>" + g + "</g><g fill='none' stroke='#1d1d1d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" + g + "</g></svg>";
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, grab`;
  })();
  const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  // ── lasso smooth (feathered gaussian blur — banding/blemish repair) ──
  let lassoPts = $state(null);       // polyline while dragging (image coords)
  let smoothBlur = $state(6);
  let smoothFeather = $state(14);
  let lassoing = false;

  // ── selection (mask-based, Photoshop model) ──
  // The selection is an alpha MASK (white = selected) so Shift-add / Alt-subtract
  // compose arbitrary regions; marching ants are traced from the mask boundary.
  // Select/Lasso DEFINE a region — nothing is lifted; a command (Ctrl+J copy /
  // Ctrl+Shift+J cut / Ctrl+C/X/V) turns it into a layer; Esc/Ctrl+D deselects.
  let selMaskCanvas = null;          // offscreen doc-sized canvas | null
  let selBBox = null;                // cached bounds {x,y,w,h} | null
  let selActive = $state(false);     // is there a selection?
  let selVersion = $state(0);        // bump → re-derive ants
  let selMove = null;                // { orig, origBBox, startX, startY } while moving the ants
  let selDragDxy = $state(null);     // live {dx,dy} during a move — applied as a cheap SVG transform; the mask is re-traced only on commit
  let selOp = "replace";             // pending boolean op for the in-progress marquee (Shift=add, Alt=subtract)
  let clipboard = null;              // { canvas, x, y } from Ctrl+C / Ctrl+X
  let moveFloat = null;              // active Move-tool / Ctrl-drag
  let snapGuides = $state({ v: null, h: null }); // doc-space guide line positions during a whole-layer move (null = none)
  const rgbCss = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

  function ensureSelMask() {
    if (!selMaskCanvas || selMaskCanvas.width !== width || selMaskCanvas.height !== height) {
      selMaskCanvas = document.createElement("canvas");
      selMaskCanvas.width = width; selMaskCanvas.height = height;
    }
    return selMaskCanvas;
  }
  function recomputeSelBBox() {
    if (!selMaskCanvas) { selBBox = null; selActive = false; return; }
    const d = selMaskCanvas.getContext("2d").getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (d[(y * width + x) * 4 + 3] > 127) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) { selBBox = null; selActive = false; }
    else { selBBox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }; selActive = true; }
  }
  // Rasterize a shape (feathered white) and compose it into the selection mask.
  // op = "replace" | "add" | "subtract" | "intersect".
  function applySelectionShape(shape, op) {
    const ctx = ensureSelMask().getContext("2d");
    const s = document.createElement("canvas");
    s.width = width; s.height = height;
    const sc = s.getContext("2d");
    if (featherPx > 0) sc.filter = `blur(${featherPx}px)`;
    sc.fillStyle = "#fff";
    if (shape.type === "rect") sc.fillRect(shape.x, shape.y, shape.w, shape.h);
    else {
      sc.beginPath();
      sc.moveTo(shape.pts[0].x, shape.pts[0].y);
      for (let i = 1; i < shape.pts.length; i++) sc.lineTo(shape.pts[i].x, shape.pts[i].y);
      sc.closePath();
      sc.fill();
    }
    sc.filter = "none";
    if (op === "replace") { ctx.clearRect(0, 0, width, height); ctx.drawImage(s, 0, 0); }
    else if (op === "subtract") { ctx.globalCompositeOperation = "destination-out"; ctx.drawImage(s, 0, 0); ctx.globalCompositeOperation = "source-over"; }
    else if (op === "intersect") { ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(s, 0, 0); ctx.globalCompositeOperation = "source-over"; }
    else ctx.drawImage(s, 0, 0); // add
    recomputeSelBBox();
    selVersion++;
  }
  // ── selection in history ──
  // Snapshot the selection mask into each history entry so undo/redo restores the
  // selection that existed at that step (and a bare select/deselect is undoable).
  // Cached by selVersion so consecutive edits sharing one selection reference the
  // SAME ImageData (cheap, like the layer-bitmap sharing) instead of copying it.
  let _selSnapCache = { version: -1, snap: null };
  function selSnapshot() {
    if (!selActive || !selMaskCanvas) return null;
    if (_selSnapCache.version === selVersion && _selSnapCache.snap) return _selSnapCache.snap;
    const snap = {
      mask: selMaskCanvas.getContext("2d").getImageData(0, 0, width, height),
      bbox: selBBox ? { ...selBBox } : null,
    };
    _selSnapCache = { version: selVersion, snap };
    return snap;
  }
  function restoreSelection(sel) {
    if (!sel || !sel.mask) { selBBox = null; selActive = false; selVersion++; if (selMaskCanvas) selMaskCanvas.getContext("2d").clearRect(0, 0, width, height); return; }
    ensureSelMask();
    const ctx = selMaskCanvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.putImageData(sel.mask, 0, 0);
    selBBox = sel.bbox ? { ...sel.bbox } : null;
    selActive = true; selVersion++;
  }
  function selectAllRegion() {
    const ctx = ensureSelMask().getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
    recomputeSelBBox(); selVersion++;
  }
  function selectInverse() {
    if (!selActive || !selMaskCanvas) return;
    const cur = copyMaskCanvas();
    const ctx = ensureSelMask().getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(cur, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    recomputeSelBBox(); selVersion++;
  }
  // ── AI selection (server-side segmentation → selection mask) ──
  // The flattened composite is what gets segmented (PS analyzes the visible
  // image); the blob is cached per history step so successive Object-Select
  // clicks skip the re-flatten AND let the server reuse its encoder cache.
  let flatBlobCache = null; // { blob, key }
  function flatKey() {
    // histIndex covers committed edits; the per-layer suffix also keys on
    // visibility/opacity/blend/offset so the cache stays correct mid-drag,
    // before an opacity release commits.
    return `${histIndex}|${activeIndex}|${layers.map((L) => `${L.id}:${L.visible}:${L.opacity}:${L.blend || ""}:${L.ox || 0}:${L.oy || 0}:${L.groupId || ""}`).join(",")}|${groups.map((g) => `${g.id}:${g.visible}:${g.opacity}`).join(",")}`;
  }
  async function flattenedBlobCached() {
    const key = flatKey();
    if (flatBlobCache?.key === key) return flatBlobCache.blob;
    const blob = await flattenBlob();
    flatBlobCache = { blob, key };
    return blob;
  }
  // The ACTIVE layer rendered alone in document space (its move offset + layer
  // mask applied), transparent elsewhere — what Select Subject segments when
  // you're on a real layer, so it finds THAT layer's subject, not the whole
  // composite's. paintCanvas is the live active-layer content at home position;
  // ox/oy place it where it's displayed, so the returned mask aligns to the doc.
  async function activeLayerBlob() {
    const L = activeLayer();
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const ctx = c.getContext("2d");
    ctx.drawImage(paintCanvas, L.ox || 0, L.oy || 0);
    if (L.mask && L.mask.width === width && L.mask.height === height) {
      const m = document.createElement("canvas");
      m.width = width; m.height = height;
      m.getContext("2d").putImageData(L.mask, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(m, L.ox || 0, L.oy || 0);
      ctx.globalCompositeOperation = "source-over";
    }
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
  function activeLayerHasContent() {
    const d = paintCanvas.getContext("2d").getImageData(0, 0, width, height).data;
    for (let p = 3; p < d.length; p += 4) if (d[p] > 8) return true;
    return false;
  }
  async function fetchSelectionMask(route, fields, sourceBlob) {
    const fd = new FormData();
    fd.append("image", sourceBlob || await flattenedBlobCached(), "composite.png");
    for (const [k, v] of Object.entries(fields || {})) fd.append(k, String(v));
    const resp = await fetch(route, { method: "POST", body: fd });
    if (!resp.ok) {
      const msg = resp.status === 404
        ? "the server needs a restart to enable AI selection (new endpoint)"
        : (await resp.json().catch(() => null))?.error || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    // grayscale mask PNG → alpha canvas (luminance = selectedness, soft edges survive)
    const bmp = await createImageBitmap(await resp.blob());
    const mc = document.createElement("canvas");
    mc.width = width; mc.height = height;
    const mctx = mc.getContext("2d");
    mctx.drawImage(bmp, 0, 0, width, height);
    const md = mctx.getImageData(0, 0, width, height);
    for (let i = 0; i < md.data.length; i += 4) {
      md.data[i + 3] = md.data[i];
      md.data[i] = 255; md.data[i + 1] = 255; md.data[i + 2] = 255;
    }
    mctx.putImageData(md, 0, 0);
    return mc;
  }
  function composeMaskIntoSelection(srcCanvas, op) {
    const ctx = ensureSelMask().getContext("2d");
    if (op === "replace") { ctx.clearRect(0, 0, width, height); ctx.drawImage(srcCanvas, 0, 0); }
    else if (op === "subtract") { ctx.globalCompositeOperation = "destination-out"; ctx.drawImage(srcCanvas, 0, 0); ctx.globalCompositeOperation = "source-over"; }
    else if (op === "intersect") { ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(srcCanvas, 0, 0); ctx.globalCompositeOperation = "source-over"; }
    else ctx.drawImage(srcCanvas, 0, 0); // add
    recomputeSelBBox(); selVersion++;
  }
  // AI selection (BiRefNet/SAM2) is a pip lib + model, not a node pack, so it
  // can't ride the [add] install gate. This is its equivalent: check the
  // dedicated status route, and if the deps/model aren't there, run the
  // one-time install (deps + ~0.9GB/~154MB download) with live progress before
  // selecting — instead of a silent hang or a raw import error. Returns false
  // (with errorMsg set) if setup fails; true if ready (incl. an old server with
  // no status route, where we let the original call proceed).
  async function ensureSelectionReady(which) {
    let st = null;
    try {
      const r = await fetch(`/promptchain/subject/status?which=${which}`);
      if (r.ok) st = await r.json(); else if (r.status === 404) return true;
    } catch { return true; }
    if (!st || st.ready) return true;
    selSetupMsg = "Setting up AI selection…";
    try {
      const resp = await fetch("/promptchain/subject/install", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ which }),
      });
      if (!resp.ok || !resp.body) throw new Error(await resp.text().catch(() => `HTTP ${resp.status}`));
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, nl).trim(); buf = buf.slice(nl + 2);
          if (!chunk.startsWith("data:")) continue;
          let evt; try { evt = JSON.parse(chunk.slice(5).trim()); } catch { continue; }
          if (evt.error) throw new Error(evt.error);
          else if (evt.stage === "pip") selSetupMsg = `Installing ${evt.repo}…`;
          else if (evt.stage === "download") selSetupMsg = `Downloading ${evt.file}… (one-time)`;
          else if (evt.line) selSetupMsg = evt.line;
        }
      }
      selSetupMsg = "";
      return true;
    } catch (e) {
      selSetupMsg = "";
      errorMsg = `AI selection setup failed: ${e?.message || e}`;
      return false;
    }
  }
  // Select Subject — BiRefNet segments the composite's salient subject; the
  // soft matte becomes the selection.
  async function selectSubject() {
    if (subjectBusy) return;
    subjectBusy = true; errorMsg = "";
    try {
      if (!(await ensureSelectionReady("subject"))) return;
      flushActive();
      const L = activeLayer();
      // On a real (non-Background) layer with content, segment THAT layer so the
      // subject comes from the layer you're on, not the flattened composite.
      const onLayer = L && !L.isBackground && activeLayerHasContent();
      const mask = await fetchSelectionMask("/promptchain/select-subject", null,
        onLayer ? await activeLayerBlob() : undefined);
      composeMaskIntoSelection(mask, "replace");
      if (!selActive) errorMsg = onLayer ? "No subject found on this layer." : "No subject found in the image.";
    } catch (e) {
      errorMsg = `Select Subject failed: ${e?.message || e}`;
    } finally {
      subjectBusy = false;
    }
  }
  // Select Figure — the pose scene's per-entity silhouette PNG (rendered at
  // gen time, content-addressed beside the control map) becomes the
  // selection. One click isolates a figure for the upscale/inpaint handoffs.
  // The mask is at the poser's render dims — stretch to the document (exact
  // on an unmodified document; approximate after crop/resize epochs).
  let figureSelBusy = $state(false);
  async function selectFigureMask(region) {
    if (figureSelBusy) return;
    figureSelBusy = true; errorMsg = "";
    try {
      const resp = await fetch(region.maskUrl);
      if (!resp.ok) throw new Error("its pose mask file is missing — open the source workflow once to re-render the maps");
      const bmp = await createImageBitmap(await resp.blob());
      const mc = document.createElement("canvas");
      mc.width = width; mc.height = height;
      const mctx = mc.getContext("2d");
      mctx.drawImage(bmp, 0, 0, width, height);
      const md = mctx.getImageData(0, 0, width, height);
      for (let i = 0; i < md.data.length; i += 4) {
        // binarize over the same threshold the server's mask loader uses —
        // legacy captures carry body shading / viewport-gray pollution
        md.data[i + 3] = md.data[i] > 64 ? 255 : 0;
        md.data[i] = 255; md.data[i + 1] = 255; md.data[i + 2] = 255;
      }
      mctx.putImageData(md, 0, 0);
      composeMaskIntoSelection(mc, "replace");
      if (!selActive) errorMsg = `${region.name}: the pose mask is empty.`;
    } catch (e) {
      errorMsg = `Select ${region.name} failed: ${e?.message || e}`;
    } finally {
      figureSelBusy = false;
    }
  }
  // Object Select — SAM2 point prompt: click an object, get its whole mask;
  // Shift/Alt compose with the existing selection like the marquee tools.
  let objselBusy = $state(false);
  async function selectObjectAt(pt, op) {
    if (objselBusy) return;
    objselBusy = true; errorMsg = "";
    try {
      if (!(await ensureSelectionReady("object"))) return;
      flushActive();
      const mask = await fetchSelectionMask("/promptchain/select-object",
        { x: Math.round(pt.x), y: Math.round(pt.y) });
      composeMaskIntoSelection(mask, op);
    } catch (e) {
      errorMsg = `Object Select failed: ${e?.message || e}`;
    } finally {
      objselBusy = false;
    }
  }
  function pointInSelection(pt) {
    if (!selActive || !selMaskCanvas) return false;
    const x = Math.floor(pt.x), y = Math.floor(pt.y);
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return selMaskCanvas.getContext("2d").getImageData(x, y, 1, 1).data[3] > 127;
  }
  function selectionBBox() { return selBBox; }
  // Grab the selected pixels of the ACTIVE layer (clipped to the mask).
  function captureSelection(merged = false) {
    if (!selActive || !selBBox) return null;
    const bb = selBBox;
    const c = document.createElement("canvas");
    c.width = bb.w; c.height = bb.h;
    const cx = c.getContext("2d");
    // merged = the flattened VISIBLE composite (Copy Merged); else the active layer alone.
    if (merged) drawFlattened(cx, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
    else cx.drawImage(paintCanvas, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
    const mask = document.createElement("canvas");
    mask.width = bb.w; mask.height = bb.h;
    const mctx = mask.getContext("2d");
    mctx.drawImage(selMaskCanvas, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
    // No feather requested → cut on a HARD edge. A non-feathered selection still
    // anti-aliases its border (a sub-pixel marquee rect, or any lasso curve),
    // leaving partial-alpha edge pixels; destination-in carries them into the
    // copy where they fringe — and COMPOUND every time the region is re-copied
    // (each cut multiplies the edge alpha and the getImageData premultiply
    // round-trip contaminates the low-alpha RGB). Binarizing at the 50% contour
    // makes the copy clean; featherPx>0 keeps its intentional soft edge.
    if (featherPx === 0) {
      const m = mctx.getImageData(0, 0, bb.w, bb.h);
      const md = m.data;
      for (let p = 3; p < md.length; p += 4) md[p] = md[p] >= 128 ? 255 : 0;
      mctx.putImageData(m, 0, 0);
    }
    cx.globalCompositeOperation = "destination-in";
    cx.drawImage(mask, 0, 0);
    cx.globalCompositeOperation = "source-over";
    // Also harden any soft alpha the SOURCE layer itself contributed (e.g. an
    // earlier copy that already had a feathered edge) — the mask binarize above
    // only controls the selection boundary, not the content's existing alpha.
    if (featherPx === 0) {
      const im = cx.getImageData(0, 0, bb.w, bb.h), d = im.data;
      for (let p = 3; p < d.length; p += 4) d[p] = d[p] >= 128 ? 255 : 0;
      cx.putImageData(im, 0, 0);
    }
    return { canvas: c, x: bb.x, y: bb.y, mask };
  }
  function eraseSelectionFromActive(cap) {
    flushActive();
    const t = document.createElement("canvas");
    t.width = width; t.height = height;
    const tctx = t.getContext("2d");
    const bmp = layers[activeIndex]?.bitmap;
    if (bmp) tctx.putImageData(bmp, 0, 0);
    tctx.globalCompositeOperation = "destination-out";
    tctx.drawImage(cap.mask, cap.x, cap.y);
    tctx.globalCompositeOperation = "source-over";
    // The Background erases to transparency like any layer (the checker shows through).
    layers[activeIndex] = { ...layers[activeIndex], bitmap: tctx.getImageData(0, 0, width, height) };
    loadActiveBitmap();
  }
  // Del / Backspace — clear the selected pixels from the active layer.
  function deleteSelection() {
    if (blockHiddenEdit("clear")) return;
    const cap = captureSelection();
    if (!cap) return;
    eraseSelectionFromActive(cap);
    commitAction("Delete");
  }
  // sourceRect = layer provenance: where on the document these pixels were
  // cut/copied from (plus the doc dims at the time — an epoch invalidates
  // it). The upscale handoff uses it to map a MOVED copy back to its scene
  // location so the pose masks/depth still line up with the content.
  function newLayerFromCanvas(srcCanvas, x, y, label, sourceRect = null) {
    flushActive();
    const lc = document.createElement("canvas");
    lc.width = width; lc.height = height;
    lc.getContext("2d").drawImage(srcCanvas, x, y);
    const id = ++nextLayerNum;
    layers = [...layers.slice(0, activeIndex + 1),
      { id, name: `Layer ${id}`, visible: true, opacity: 1, sourceRect, groupId: layers[activeIndex]?.groupId,
        bitmap: lc.getContext("2d").getImageData(0, 0, width, height) },
      ...layers.slice(activeIndex + 1)];
    activeIndex = activeIndex + 1;
    loadActiveBitmap();
    deselect(); // Photoshop deselects after paste / layer-via-copy/cut
    commitAction(label);
  }
  function capSourceRect(cap) {
    return { x: cap.x, y: cap.y, w: cap.canvas.width, h: cap.canvas.height, docW: width, docH: height };
  }
  function layerViaCopy(cut) {
    const cap = captureSelection();
    if (!cap) return;
    if (cut) eraseSelectionFromActive(cap); // active is still the source layer here
    newLayerFromCanvas(cap.canvas, cap.x, cap.y, cut ? "Layer via Cut" : "Layer via Copy", capSourceRect(cap));
  }
  function copySelection(cut, merged = false) {
    const cap = captureSelection(merged);
    if (!cap) return;
    clipboard = { canvas: cap.canvas, x: cap.x, y: cap.y, sourceRect: capSourceRect(cap) };
    if (cut) { eraseSelectionFromActive(cap); commitAction("Cut"); }
  }
  function pasteClipboard() {
    if (!clipboard) return;
    newLayerFromCanvas(clipboard.canvas, clipboard.x, clipboard.y, "Paste", clipboard.sourceRect || null);
  }

  // ── Drop / paste an EXTERNAL image in as a floating layer (PS-style), reusing
  // the paste plumbing: the image rides as its own layer (Move repositions it),
  // scaled down to fit when larger than the document so it never dwarfs the
  // canvas. Drop lands at the cursor; clipboard paste lands centered. ──
  let dragActive = $state(false);
  function placeImageAsLayer(img, centerX, centerY) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const fit = Math.min(1, width / iw, height / ih);
    const dw = Math.max(1, Math.round(iw * fit)), dh = Math.max(1, Math.round(ih * fit));
    const c = document.createElement("canvas");
    c.width = dw; c.height = dh;
    c.getContext("2d").drawImage(img, 0, 0, dw, dh);
    newLayerFromCanvas(c, Math.round(centerX - dw / 2), Math.round(centerY - dh / 2), "Place Image");
  }
  async function placeImageFromUrl(url, cx, cy) {
    // cross-origin web images taint the canvas → newLayerFromCanvas' getImageData throws
    try { placeImageAsLayer(await loadImageEl(url), cx, cy); }
    catch { errorMsg = "Couldn't load that image (it may block cross-site use). Save it and drag the file in instead."; }
  }
  function firstImgSrc(html) {
    const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return m ? m[1] : "";
  }
  async function onCanvasDrop(e) {
    e.preventDefault();
    dragActive = false;
    const pt = toImageCoords(e); // doc-space drop point
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
    if (file) {
      const obj = URL.createObjectURL(file);
      try { placeImageAsLayer(await loadImageEl(obj), pt.x, pt.y); }
      catch { errorMsg = "Couldn't read that image file."; }
      finally { URL.revokeObjectURL(obj); }
      return;
    }
    // Dragged from the PromptChain gallery/sidebar, a browser tab, or an <img>
    const url = (e.dataTransfer?.getData("text/uri-list")
      || e.dataTransfer?.getData("text/plain")
      || firstImgSrc(e.dataTransfer?.getData("text/html") || "")).trim();
    if (/^(https?:|data:|blob:|\/)/i.test(url)) await placeImageFromUrl(url, pt.x, pt.y);
  }
  function onCanvasDragOver(e) {
    if (!e.dataTransfer) return;
    // file kinds don't expose .type until drop, so accept any file drag here
    const droppable = [...(e.dataTransfer.items || [])].some(
      (it) => it.kind === "file" || /^text\/(uri-list|html|plain)$/.test(it.type));
    if (!droppable) return;
    e.preventDefault(); // required to permit the drop
    e.dataTransfer.dropEffect = "copy";
    dragActive = true;
  }
  // OS-clipboard image paste → centered layer. Fires only when the editor's own
  // Ctrl+V (internal clipboard) didn't preventDefault, so the internal clipboard
  // keeps priority and an external screenshot/web image lands when it's empty.
  $effect(() => {
    if (!open) return;
    const onPaste = (e) => {
      if (suspended || adjustOpen) return;
      const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith("image/"));
      const blob = item?.getAsFile();
      if (!blob) return;
      e.preventDefault();
      const obj = URL.createObjectURL(blob);
      loadImageEl(obj)
        .then((img) => placeImageAsLayer(img, width / 2, height / 2))
        .catch(() => { errorMsg = "Couldn't read the pasted image."; })
        .finally(() => URL.revokeObjectURL(obj));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function deselect() {
    if (selMaskCanvas) selMaskCanvas.getContext("2d").clearRect(0, 0, width, height);
    selBBox = null; selActive = false; selVersion++;
    selRect = null; lassoPts = null;
  }

  // Marching-ants outline traced from the selection mask boundary (merged
  // horizontal/vertical edge runs → a compact SVG path; CSS animates the dash).
  let selContour = $derived.by(() => {
    selVersion; // dependency
    if (!selActive || !selMaskCanvas) return "";
    const d = selMaskCanvas.getContext("2d").getImageData(0, 0, width, height).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < width && y < height && d[(y * width + x) * 4 + 3] > 127;
    let p = "";
    for (let y = 0; y <= height; y++) {
      let x = 0;
      while (x < width) {
        if (on(x, y - 1) !== on(x, y)) { let x2 = x; while (x2 < width && on(x2, y - 1) !== on(x2, y)) x2++; p += `M${x} ${y}H${x2}`; x = x2; }
        else x++;
      }
    }
    for (let x = 0; x <= width; x++) {
      let y = 0;
      while (y < height) {
        if (on(x - 1, y) !== on(x, y)) { let y2 = y; while (y2 < height && on(x - 1, y2) !== on(x, y2)) y2++; p += `M${x} ${y}V${y2}`; y = y2; }
        else y++;
      }
    }
    return p;
  });

  // Modifier state (for the selection-tool cursor feedback).
  let mods = $state({ shift: false, alt: false, ctrl: false });
  let spaceDown = $state(false); // hold Space → temporary Hand tool (drag to pan)
  let isSelTool = $derived(tool === "select" || tool === "lasso" || tool === "objsel");
  // Hidden active layer + a paint/move tool → PS not-allowed cursor on hover.
  // Alt is the eyedropper (still allowed), so it keeps the normal cursor.
  let hiddenEditBlocked = $derived(activeLayer()?.visible === false && !mods.alt
    && (tool === "brush" || tool === "eraser" || tool === "bucket" || tool === "smooth"
      || tool === "spot" || tool === "heal" || tool === "stamp" || tool === "liquify" || tool === "move"));
  // Free Transform is a MODAL mode (PS Ctrl+T), invoked from the right-click
  // menu — not a strip tool. While a transform float is live, the options bar
  // shows its controls and a viewport click outside the box commits.
  let transforming = $derived(!!patch?.transform);
  // + (add), − (subtract), ∩ (intersect) badge shown by the cursor on a
  // selection tool while Shift/Alt are held — Photoshop's mode affordance.
  let selBadge = $derived(!isSelTool ? "" : (mods.shift && mods.alt) ? "∩" : mods.shift ? "+" : mods.alt ? "−" : "");
  $effect(() => {
    if (!open) return;
    const upd = (e) => {
      mods = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey };
      if (e.code === "Space") spaceDown = e.type === "keydown";
    };
    const clear = () => { mods = { shift: false, alt: false, ctrl: false }; spaceDown = false; };
    window.addEventListener("keydown", upd, true);
    window.addEventListener("keyup", upd, true);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", upd, true);
      window.removeEventListener("keyup", upd, true);
      window.removeEventListener("blur", clear);
    };
  });

  // ── Move (Move tool / Ctrl-drag) — float the selected pixels (or the whole
  // layer) and leave a hole: background color on the Background layer, else
  // transparent. ──
  function copyMaskCanvas() {
    if (!selMaskCanvas) return null;
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    c.getContext("2d").drawImage(selMaskCanvas, 0, 0);
    return c;
  }
  // Re-place the selection mask = `orig` translated by (dx, dy).
  function translateSelMask(orig, origBBox, dx, dy) {
    const ctx = ensureSelMask().getContext("2d");
    ctx.clearRect(0, 0, width, height);
    if (orig) ctx.drawImage(orig, dx, dy);
    selBBox = origBBox ? { x: origBBox.x + dx, y: origBBox.y + dy, w: origBBox.w, h: origBBox.h } : null;
    selActive = !!origBBox;
    selVersion++;
  }
  // Content bbox (alpha > 8) in BITMAP space, cached per layer object — the
  // snap targets below shift it by the layer's live ox/oy.
  const contentBBoxCache = new WeakMap();
  function layerContentBBox(L) {
    if (L.isBackground) return { x: 0, y: 0, w: width, h: height };
    if (!L.bitmap) return null;
    if (contentBBoxCache.has(L)) return contentBBoxCache.get(L);
    const d = L.bitmap.data, bw = L.bitmap.width, bh = L.bitmap.height;
    let minX = bw, minY = bh, maxX = -1, maxY = -1;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (d[(y * bw + x) * 4 + 3] > 8) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const b = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    contentBBoxCache.set(L, b);
    return b;
  }
  // Snap targets, precomputed at drag start: canvas edges + center, and every
  // OTHER visible layer's content edges + centers (doc space).
  function buildSnapTargets(L) {
    const mb = layerContentBBox(L);
    if (!mb) return null;
    const xs = [0, width / 2, width], ys = [0, height / 2, height];
    for (const O of layers) {
      if (O === L || !O.visible) continue;
      const ob = layerContentBBox(O);
      if (!ob) continue;
      const oox = O.ox || 0, ooy = O.oy || 0;
      xs.push(ob.x + oox, ob.x + ob.w + oox, ob.x + ob.w / 2 + oox);
      ys.push(ob.y + ooy, ob.y + ob.h + ooy, ob.y + ob.h / 2 + ooy);
    }
    return { mxs: [mb.x, mb.x + mb.w, mb.x + mb.w / 2], mys: [mb.y, mb.y + mb.h, mb.y + mb.h / 2], xs, ys };
  }
  function startMove(e) {
    flushActive();
    const L = layers[activeIndex];
    if (!selActive) {
      // Whole-layer move = non-destructive offset (no clip, no bake).
      moveFloat = { wholeLayer: true, startOx: L.ox || 0, startOy: L.oy || 0, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0,
        snap: buildSnapTargets(layers[activeIndex]) };
      return true;
    }
    // Selection move = cut the pixels and float them (destructive sub-region).
    const cap = captureSelection();
    if (!cap) return false;
    const base = document.createElement("canvas");
    base.width = width; base.height = height;
    const bctx = base.getContext("2d");
    bctx.drawImage(paintCanvas, 0, 0);
    if (cap.mask) {
      // erase the lifted pixels from the base — the Background goes transparent
      // too (it's a normal layer now; the checker shows through the hole)
      bctx.globalCompositeOperation = "destination-out";
      bctx.drawImage(cap.mask, cap.x, cap.y);
      bctx.globalCompositeOperation = "source-over";
    } else {
      bctx.clearRect(0, 0, width, height);
    }
    moveFloat = { cap, base, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0,
      selOrig: selActive ? copyMaskCanvas() : null, selOrigBBox: selBBox };
    return true;
  }
  function updateMove(e) {
    const dx = Math.round((e.clientX - moveFloat.ox) / zoom);
    const dy = Math.round((e.clientY - moveFloat.oy) / zoom);
    moveFloat.dx = dx; moveFloat.dy = dy;
    if (moveFloat.wholeLayer) {
      let nx = moveFloat.startOx + dx, ny = moveFloat.startOy + dy;
      if (e.altKey || !moveFloat.snap) { // hold Alt to suppress snapping (Photoshop/Figma convention)
        snapGuides = { v: null, h: null };
      } else {
        // Computed from the RAW cursor offset each frame (idempotent — no
        // accumulation), best candidate within 7 screen px wins.
        const s = moveFloat.snap;
        const t = 7 / zoom;
        let bx = null, bdx = t, by = null, bdy = t;
        for (const m of s.mxs) for (const gx of s.xs) {
          const d = Math.abs(nx - (gx - m));
          if (d < bdx) { bdx = d; bx = { at: gx - m, line: gx }; }
        }
        for (const m of s.mys) for (const gy of s.ys) {
          const d = Math.abs(ny - (gy - m));
          if (d < bdy) { bdy = d; by = { at: gy - m, line: gy }; }
        }
        // home (the layer's original spot) snaps too, without a guide line
        if (Math.abs(nx) < bdx) bx = { at: 0, line: null };
        if (Math.abs(ny) < bdy) by = { at: 0, line: null };
        if (bx) nx = bx.at;
        if (by) ny = by.at;
        snapGuides = { v: bx?.line ?? null, h: by?.line ?? null };
      }
      layers[activeIndex] = { ...layers[activeIndex], ox: nx, oy: ny };
      loadActiveBitmap();
      return;
    }
    const ctx = paintCanvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(moveFloat.base, 0, 0);
    ctx.drawImage(moveFloat.cap.canvas, moveFloat.cap.x + dx, moveFloat.cap.y + dy);
    if (moveFloat.selOrig) selDragDxy = { dx, dy }; // ants follow (cheap transform)
  }
  function endMove() {
    if (!moveFloat) return;
    snapGuides = { v: null, h: null };
    if (moveFloat.wholeLayer) {
      const moved = moveFloat.dx !== 0 || moveFloat.dy !== 0;
      moveFloat = null;
      if (moved) commitAction("Move");
      return;
    }
    if (moveFloat.selOrig) { translateSelMask(moveFloat.selOrig, moveFloat.selOrigBBox, moveFloat.dx, moveFloat.dy); selDragDxy = null; }
    const moved = moveFloat.dx !== 0 || moveFloat.dy !== 0;
    moveFloat = null;
    if (moved) commitAction("Move");
  }

  // Arrow-key nudge: shift the active layer by its non-destructive offset — the
  // same ox/oy the Move tool drives, so it renders, undoes, and persists
  // identically. 1px, or 10px with Shift.
  function nudgeActiveLayer(dx, dy) {
    if (blockHiddenEdit("move")) return;
    const L = layers[activeIndex];
    if (!L) return;
    flushActive();
    layers[activeIndex] = { ...L, ox: (L.ox || 0) + dx, oy: (L.oy || 0) + dy };
    loadActiveBitmap();
    commitAction("Move");
  }

  // ── paint bucket ──
  // Flood-fill the ACTIVE layer with the foreground color from the clicked
  // point: matching pixels within Tolerance, contiguous (scanline flood) or all,
  // clipped to the selection when one is active.
  function floodFill(pt) {
    const x0 = Math.floor(pt.x), y0 = Math.floor(pt.y);
    if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return;
    flushActive();
    const ctx = paintCanvas.getContext("2d");
    const img = ctx.getImageData(0, 0, width, height);
    const d = img.data;
    const si = (y0 * width + x0) * 4;
    const sr = d[si], sg = d[si + 1], sb = d[si + 2], sa = d[si + 3];
    const tol2 = fillTolerance * fillTolerance * 4;
    const match = (i) => {
      const dr = d[i] - sr, dg = d[i + 1] - sg, db = d[i + 2] - sb, da = d[i + 3] - sa;
      return dr * dr + dg * dg + db * db + da * da <= tol2;
    };
    const region = new Uint8Array(width * height);
    if (fillContiguous) {
      const stack = [[x0, y0]];
      while (stack.length) {
        let [x, y] = stack.pop();
        while (x >= 0 && !region[y * width + x] && match((y * width + x) * 4)) x--;
        x++;
        let spanUp = false, spanDown = false;
        while (x < width && !region[y * width + x] && match((y * width + x) * 4)) {
          region[y * width + x] = 1;
          if (y > 0) {
            const up = !region[(y - 1) * width + x] && match(((y - 1) * width + x) * 4);
            if (up && !spanUp) { stack.push([x, y - 1]); spanUp = true; } else if (!up) spanUp = false;
          }
          if (y < height - 1) {
            const dn = !region[(y + 1) * width + x] && match(((y + 1) * width + x) * 4);
            if (dn && !spanDown) { stack.push([x, y + 1]); spanDown = true; } else if (!dn) spanDown = false;
          }
          x++;
        }
      }
    } else {
      for (let p = 0; p < region.length; p++) if (match(p * 4)) region[p] = 1;
    }
    if (selActive && selMaskCanvas) {
      const sm = selMaskCanvas.getContext("2d").getImageData(0, 0, width, height).data;
      for (let p = 0; p < region.length; p++) if (region[p] && sm[p * 4 + 3] <= 127) region[p] = 0;
    }
    let any = false;
    for (let p = 0; p < region.length; p++) if (region[p]) { any = true; break; }
    if (!any) return;
    // Anti-aliased apply: the binary region becomes a slightly blurred mask
    // and the fill composites through it — the interior replaces outright,
    // the ~1px rim blends with what's there instead of stair-stepping.
    const md = new ImageData(width, height);
    for (let p = 0; p < region.length; p++) if (region[p]) md.data[p * 4 + 3] = 255;
    const m = document.createElement("canvas");
    m.width = width; m.height = height;
    m.getContext("2d").putImageData(md, 0, 0);
    const f = document.createElement("canvas");
    f.width = width; f.height = height;
    const fctx = f.getContext("2d");
    fctx.fillStyle = rgbCss(rgb);
    fctx.fillRect(0, 0, width, height);
    fctx.globalCompositeOperation = "destination-in";
    fctx.filter = "blur(0.6px)";
    fctx.drawImage(m, 0, 0);
    fctx.filter = "none";
    fctx.globalCompositeOperation = "source-over";
    ctx.drawImage(f, 0, 0);
    commitAction("Fill");
  }
  // Fill the selection (or the whole layer) with a flat color — Alt+Backspace
  // (foreground) / Ctrl+Backspace (background).
  function fillWith(color) {
    if (blockHiddenEdit("fill")) return;
    flushActive();
    const ctx = paintCanvas.getContext("2d");
    if (selActive && selMaskCanvas) {
      const tmp = document.createElement("canvas");
      tmp.width = width; tmp.height = height;
      const tctx = tmp.getContext("2d");
      tctx.fillStyle = rgbCss(color); tctx.fillRect(0, 0, width, height);
      tctx.globalCompositeOperation = "destination-in";
      tctx.drawImage(selMaskCanvas, 0, 0);
      ctx.drawImage(tmp, 0, 0);
    } else {
      ctx.fillStyle = rgbCss(color);
      ctx.fillRect(0, 0, width, height);
    }
    commitAction("Fill");
  }

  // ── Region → Inpaint ──
  function flattenBlob() {
    flushActive();
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    drawFlattened(c.getContext("2d"), 0, 0, width, height, 0, 0, width, height);
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
  // No selection? Upscale targets the active layer's content bounding box
  // (the full canvas on the Background = a whole-image upscale).
  function activeContentMaskCanvas() {
    const d = paintCanvas.getContext("2d").getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (d[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
    return c;
  }
  function loadImageEl(url) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
  }
  // The active layer's alpha SILHOUETTE as a pre-paint mask — only when the
  // layer is genuinely alpha-bounded (a cutout/paste/inpaint layer). A
  // full-frame layer (the Background photo) returns null: the Inpaint modal
  // opens blank and the user paints the mask there, exactly like the old
  // viewer-direct flow.
  function activeAlphaMaskCanvas() {
    const L = activeLayer();
    if (L?.isBackground && !L.bitmap) return null; // the photo covers everything
    const src = activeMaskedCanvas(); // honor a layer mask in the silhouette
    const d = src.getContext("2d").getImageData(0, 0, width, height).data;
    let on = 0;
    for (let p = 3; p < d.length; p += 4) if (d[p] > 8) on++;
    if (!on || on >= width * height * 0.995) return null; // empty or full-frame
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const ctx = c.getContext("2d");
    // BINARIZE the layer's alpha into a crisp mask at the 50% contour. Carrying
    // the soft alpha through made a feathered layer (e.g. a prior inpaint result)
    // yield a soft mask that got softer every re-inpaint — the 12px result
    // feather compounding into an "all blurry" mask that then persists with the
    // layer. Thresholding at the feather midpoint keeps each pass crisp AND the
    // region stable; the soft blend still comes from the feather on insertion.
    const md = ctx.createImageData(width, height);
    for (let p = 0; p < d.length; p += 4) {
      const a = d[p + 3] >= 128 ? 255 : 0;
      md.data[p] = 255; md.data[p + 1] = 255; md.data[p + 2] = 255; md.data[p + 3] = a;
    }
    ctx.putImageData(md, 0, 0);
    return c;
  }
  async function openInpaintHandoff() {
    if (!onOpenInpaint) return;
    // Selection, or an alpha-bounded layer, pre-paints the mask; otherwise the
    // modal opens blank for painting (null mask).
    const maskCanvas = selActive ? selMaskCanvas : activeAlphaMaskCanvas();
    errorMsg = "";
    inpaintMaskUsed = maskCanvas; // remembered to clip the returned result
    // sceneRect: a moved copy's pixels sit away from where they were cut from,
    // so region auto-matching must probe the ORIGIN (provenance first, live
    // ox/oy fallback). Only meaningful for the layer case (no selection — a
    // selection mask is already in scene coordinates).
    // condOffset = the raw move delta (origin − current), in document px. It
    // shifts the region-mask crop back to the content's ORIGIN so a moved figure
    // keeps its own region prompt. sceneRect = the same thing as a rect (used to
    // NAME the figure for the note).
    let sceneRect = null, condOffset = null;
    if (!selActive && maskCanvas) {
      const bb = maskBBox(maskCanvas);
      const L = layers[activeIndex];
      const prov = L?.sourceRect;
      let dx = 0, dy = 0;
      if (bb && prov && prov.docW === width && prov.docH === height) {
        dx = Math.round((prov.x + prov.w / 2) - (bb.x + bb.w / 2));
        dy = Math.round((prov.y + prov.h / 2) - (bb.y + bb.h / 2));
      } else if (L && (L.ox || L.oy)) {
        dx = -(L.ox || 0); dy = -(L.oy || 0);
      }
      if (bb && (dx || dy)) {
        condOffset = { x: dx, y: dy };
        sceneRect = {
          x: Math.max(0, Math.min(width - bb.w, bb.x + dx)),
          y: Math.max(0, Math.min(height - bb.h, bb.y + dy)),
          w: bb.w, h: bb.h,
        };
      }
    }
    const compositeBlob = await flattenBlob();
    // the modal's prep (composite upload + graph prepare) takes a beat — show a
    // loader until it opens over us instead of a dead pause
    handoffBusy = "inpaint";
    try { await onOpenInpaint({ compositeBlob, maskCanvas, sceneRect, condOffset }); }
    catch (e) { errorMsg = `Couldn't open inpaint: ${e?.message || e}`; }
    finally { handoffBusy = null; }
  }
  // Color-match a layer to the content beneath it. Tiled re-renders (USDU)
  // drift in tone on flat, textureless areas, leaving a visible patch even
  // through the feather. The layer's feathered edge band covers pixels that
  // SHOULD be identical to what's below (same source content), so a
  // per-channel linear fit over that band recovers the drift correction for
  // the whole layer. Pairs that genuinely differ (figure edge against
  // background) are excluded by a luminance gate so re-detailed content
  // doesn't skew the fit. Callers must flushActive() first if the target
  // layer is the active one.
  function matchLayerColorsToBelow(i, baseImg = null) {
    const L = layers[i];
    if (!L?.bitmap || i <= 0) return false;
    const under = document.createElement("canvas");
    under.width = width; under.height = height;
    const uctx = under.getContext("2d");
    for (let j = 0; j < i; j++) {
      const Lj = layers[j];
      if (!layerShown(Lj)) continue;
      uctx.globalAlpha = layerEffOpacity(Lj);
      if (Lj.isBackground && !Lj.bitmap && baseImg) {
        // Canvas-grow epoch: the new Background image element hasn't loaded
        // yet at match time — the caller hands us the decoded ESRGAN render.
        uctx.drawImage(baseImg, 0, 0, width, height);
      } else {
        drawLayerContent(uctx, Lj, 0, 0, width, height, 0, 0, width, height);
      }
    }
    uctx.globalAlpha = 1;
    const u = uctx.getImageData(0, 0, width, height).data;
    const d = L.bitmap.data;
    const ox = L.ox || 0, oy = L.oy || 0;
    // Pass 1 — the feather RING identifies the background's color family.
    // It can NOT measure inpaint drift: MaskedDetail blends the render back
    // into the original across the mask edge, so ring pixels are half-original
    // and read near-zero drift while the interior shows the full shift.
    const sums = [0, 0, 0], sumsU = [0, 0, 0], sq = [0, 0, 0], sqU = [0, 0, 0];
    let n = 0;
    for (let y = 0; y < height; y++) {
      const uy = y + oy;
      if (uy < 0 || uy >= height) continue;
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4;
        const a = d[p + 3];
        if (a < 8 || a > 248) continue; // feather ring only
        const ux = x + ox;
        if (ux < 0 || ux >= width) continue;
        const q = (uy * width + ux) * 4;
        if (u[q + 3] < 250) continue; // below must be solid to compare
        const lumL = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        const lumU = 0.299 * u[q] + 0.587 * u[q + 1] + 0.114 * u[q + 2];
        if (Math.abs(lumL - lumU) > 40) continue; // different content, not drift
        for (let ch = 0; ch < 3; ch++) {
          const vl = d[p + ch], vu = u[q + ch];
          sums[ch] += vl; sq[ch] += vl * vl;
          sumsU[ch] += vu; sqU[ch] += vu * vu;
        }
        n++;
      }
    }
    if (n < 200) {
      // No usable band — leave the layer alone, but say so: silent no-ops
      // here masked the grow-path stale-background bug.
      try {
        fetch("/promptchain/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ where: "upscale-colormatch", message: `no usable band (n=${n}) — skipped`, stack: "" }),
        }).catch(() => {});
      } catch { /* diagnostics only */ }
      return false;
    }
    // The ring defines the background's color family (mean ± spread per
    // channel — covers gradient backdrops).
    const bandMean = [0, 1, 2].map((ch) => sums[ch] / n);
    const bandTol = [0, 1, 2].map((ch) => {
      const m = bandMean[ch];
      const s = Math.sqrt(Math.max(0, sq[ch] / n - m * m));
      return Math.max(3 * s, 16);
    });
    // Pass 2 — measure the DRIFT on interior (full-alpha) pixels that belong
    // to the ring's family. The ring itself under-reads inpaint drift (the
    // server's blend-back dilutes it toward zero); the interior shows it
    // whole. The family + luminance gates keep intentionally-changed content
    // out of the measurement.
    const iSums = [0, 0, 0], iSumsU = [0, 0, 0], iSq = [0, 0, 0], iSqU = [0, 0, 0];
    let nI = 0;
    for (let y = 0; y < height; y++) {
      const uy = y + oy;
      if (uy < 0 || uy >= height) continue;
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4;
        if (d[p + 3] < 250) continue; // interior only
        const ux = x + ox;
        if (ux < 0 || ux >= width) continue;
        const q = (uy * width + ux) * 4;
        if (u[q + 3] < 250) continue;
        let dist2 = 0;
        for (let ch = 0; ch < 3; ch++) {
          const z = (d[p + ch] - bandMean[ch]) / bandTol[ch];
          dist2 += z * z;
        }
        if (dist2 > 4) continue; // not background family
        const lumL = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        const lumU = 0.299 * u[q] + 0.587 * u[q + 1] + 0.114 * u[q + 2];
        if (Math.abs(lumL - lumU) > 40) continue;
        for (let ch = 0; ch < 3; ch++) {
          const vl = d[p + ch], vu = u[q + ch];
          iSums[ch] += vl; iSq[ch] += vl * vl;
          iSumsU[ch] += vu; iSqU[ch] += vu * vu;
        }
        nI++;
      }
    }
    const useInterior = nI >= 500;
    const fs = useInterior ? iSums : sums, fsU = useInterior ? iSumsU : sumsU;
    const fq = useInterior ? iSq : sq, fqU = useInterior ? iSqU : sqU;
    const fn = useInterior ? nI : n;
    const fit = [0, 1, 2].map((ch) => {
      const mL = fs[ch] / fn, mU = fsU[ch] / fn;
      const sL = Math.sqrt(Math.max(0, fq[ch] / fn - mL * mL));
      const sU = Math.sqrt(Math.max(0, fqU[ch] / fn - mU * mU));
      // Flat bands have no contrast to scale by — pure offset is the honest fit.
      let a = sL > 2 && sU > 2 ? sU / sL : 1;
      // Drift corrections are SMALL by nature — a fit wanting more than a few
      // percent of gain or a modest offset is polluted, and identity-ish is
      // safer than trusting it. Caps the worst case at an exposure-trim.
      a = Math.min(1.1, Math.max(0.9, a));
      const b = Math.min(32, Math.max(-32, mU - a * mL));
      return { a, b };
    });
    try {
      fetch("/promptchain/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          where: "upscale-colormatch",
          message: `${useInterior ? "interior" : "ring"} fit nRing=${n} nInterior=${nI} RGB ` + fit.map((f) => `a=${f.a.toFixed(3)} b=${f.b.toFixed(1)}`).join(" | "),
          stack: "",
        }),
      }).catch(() => {});
    } catch { /* diagnostics only */ }
    // Apply the correction ONLY to pixels in the band's color family — a
    // re-pass can re-tone the background while rendering the subject
    // perfectly, so a uniform application would push a correct subject away
    // from correct. Subject colors get weight ~0 and are left untouched.
    const out = new ImageData(new Uint8ClampedArray(d), width, height);
    const o = out.data;
    for (let p = 0; p < o.length; p += 4) {
      if (o[p + 3] === 0) continue;
      let dist2 = 0;
      for (let ch = 0; ch < 3; ch++) {
        const z = (o[p + ch] - bandMean[ch]) / bandTol[ch];
        dist2 += z * z;
      }
      const w = Math.exp(-dist2 / 2);
      if (w < 0.01) continue;
      for (let ch = 0; ch < 3; ch++) {
        const corrected = fit[ch].a * o[p + ch] + fit[ch].b;
        o[p + ch] = Math.min(255, Math.max(0, o[p + ch] + w * (corrected - o[p + ch])));
      }
    }
    layers = layers.map((Lk, k) => (k === i ? { ...Lk, bitmap: out } : Lk));
    if (i === activeIndex) loadActiveBitmap();
    return true;
  }

  // Clip a doc-sized result canvas to the handoff region and insert it as a new
  // layer above the active one. Feathering the clip matches the render's edge
  // blend (~MaskedDetail's 24px feather straddles the mask edge), so the new
  // layer fades into the layers below instead of a hard half-step seam.
  function insertResultLayer(c, maskCanvas, label, underCanvas = null) {
    let fm = null;
    if (maskCanvas) {
      fm = document.createElement("canvas");
      fm.width = width; fm.height = height;
      const fctx = fm.getContext("2d");
      fctx.filter = "blur(12px)";
      fctx.drawImage(maskCanvas, 0, 0);
      fctx.filter = "none";
    }
    const featherClip = (target) => {
      if (!fm) return;
      const tctx = target.getContext("2d");
      tctx.globalCompositeOperation = "destination-in";
      tctx.drawImage(fm, 0, 0);
      tctx.globalCompositeOperation = "source-over";
    };
    featherClip(c);
    flushActive();
    const inserted = [];
    if (underCanvas) {
      // Plain UltraSharp twin under the diffusion render — erasing/masking the
      // AI layer reveals a faithful sharpened original instead of the soft
      // source. Same clip + placement so the pair lands as one unit.
      featherClip(underCanvas);
      const uid = ++nextLayerNum;
      inserted.push({ id: uid, name: `UltraSharp ${uid}`, visible: true, opacity: 1, groupId: layers[activeIndex]?.groupId,
        bitmap: underCanvas.getContext("2d").getImageData(0, 0, width, height) });
    }
    const id = ++nextLayerNum;
    inserted.push({ id, name: `${label} ${id}`, visible: true, opacity: 1, groupId: layers[activeIndex]?.groupId,
      bitmap: c.getContext("2d").getImageData(0, 0, width, height) });
    layers = [...layers.slice(0, activeIndex + 1), ...inserted, ...layers.slice(activeIndex + 1)];
    activeIndex = activeIndex + inserted.length;
    selectedIds = [id];
    // Auto-match both handoffs. Upscales re-detail the same content, so drift
    // is never intentional. Inpaints DO deviate on purpose — but the
    // band-family weighting only moves pixels matching the rim background's
    // color distribution, so intentional new content (different colors) is
    // outside the family and untouchable; what remains is the same grey-band
    // drift upscales show. The UltraSharp layer matches first so the AI layer
    // above measures against the already-corrected stack.
    if (underCanvas) matchLayerColorsToBelow(activeIndex - 1);
    matchLayerColorsToBelow(activeIndex);
    loadActiveBitmap();
    commitAction(label);
  }
  // The Inpaint modal hands back the full re-rendered composite; clip it to
  // the mask the run actually rendered with (the user may have repainted it
  // inside the modal — the original handoff region is only the fallback).
  // Exported for the viewer to call.
  export async function addLayerFromResult(url, finalMask = null) {
    const img = await loadImageEl(url);
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    c.getContext("2d").drawImage(img, 0, 0, width, height);
    insertResultLayer(c, finalMask || inpaintMaskUsed, "Inpaint");
  }
  // i2i hands back the full-frame re-diffusion — it covers the whole document,
  // so it lands as an UNCLIPPED new layer scaled to fill (the result is the
  // /16-snapped render, ≤15px smaller per axis, so the fill is sub-pixel).
  // Exported for the viewer to call.
  export async function addI2iLayerFromResult(url) {
    const img = await loadImageEl(url);
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    c.getContext("2d").drawImage(img, 0, 0, width, height);
    insertResultLayer(c, null, "i2i");
  }

  // ── Region → Upscale ──
  function maskBBox(maskCanvas) {
    const d = maskCanvas.getContext("2d").getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (d[(y * width + x) * 4 + 3] > 127) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  async function openUpscaleHandoff() {
    if (!onOpenUpscale) return;
    const liveMask = selActive ? selMaskCanvas : activeContentMaskCanvas();
    const bbox = liveMask && maskBBox(liveMask);
    if (!bbox) { errorMsg = "Select a region, or paint on the active layer first."; return; }
    // Snapshot the mask. When it's the live selection canvas, a GROW (grow-canvas)
    // apply calls deselect() — which clearRect()s selMaskCanvas — BEFORE the region
    // is feather-clipped with r.maskCanvas. Clipping against the emptied mask erased
    // the whole region, so the first apply produced a BLANK "Upscale" layer; the
    // second worked only because the selection was already gone (a fresh
    // activeContentMaskCanvas was used). An independent copy is immune to deselect().
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width; maskCanvas.height = height;
    maskCanvas.getContext("2d").drawImage(liveMask, 0, 0);
    errorMsg = "";
    // Pad the crop so the upscaler's edge tiles get surrounding context; the
    // feathered clip on return drops the pad again.
    const pad = 32;
    const x = Math.max(0, bbox.x - pad);
    const y = Math.max(0, bbox.y - pad);
    const w = Math.min(width, bbox.x + bbox.w + pad) - x;
    const h = Math.min(height, bbox.y + bbox.h + pad) - y;
    upscaleRegionUsed = { x, y, w, h, maskCanvas };
    // sceneRect: where this content CAME FROM on the original frame, when
    // that differs from where it sits now — a moved copy still needs its
    // pose masks/depth cropped at the origin. Provenance stamp first
    // (layer-via-copy/cut/paste, survives a baking float-move), else the
    // layer's live ox/oy (whole-layer Move keeps the bitmap at origin).
    let sceneRect = null;
    if (!selActive) {
      const L = layers[activeIndex];
      const prov = L?.sourceRect;
      let dx = 0, dy = 0;
      if (prov && prov.docW === width && prov.docH === height) {
        dx = Math.round((prov.x + prov.w / 2) - (bbox.x + bbox.w / 2));
        dy = Math.round((prov.y + prov.h / 2) - (bbox.y + bbox.h / 2));
      } else if (L && (L.ox || L.oy)) {
        dx = -(L.ox || 0); dy = -(L.oy || 0);
      }
      if (dx || dy) {
        sceneRect = {
          x: Math.max(0, Math.min(width - w, x + dx)),
          y: Math.max(0, Math.min(height - h, y + dy)),
          w, h,
        };
      }
    }
    flushActive();
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    drawFlattened(c.getContext("2d"), x, y, w, h, 0, 0, w, h);
    const cropBlob = await new Promise((r) => c.toBlob(r, "image/png"));
    // The Background alone (no paint layers), for the grow-canvas path: the
    // server ESRGAN-enlarges it into the new base while layers rescale here.
    const bg = document.createElement("canvas");
    bg.width = width; bg.height = height;
    drawLayerContent(bg.getContext("2d"), layers[0], 0, 0, width, height, 0, 0, width, height);
    const bgBlob = await new Promise((r) => bg.toBlob(r, "image/png"));
    handoffBusy = "upscale";
    try { await onOpenUpscale({ cropBlob, bgBlob, rect: { x, y, w, h }, sceneRect, docWidth: width, docHeight: height }); }
    catch (e) { errorMsg = `Couldn't open upscale: ${e?.message || e}`; }
    finally { handoffBusy = null; }
  }
  // "Keep canvas size": the hi-res render is rescaled back into the region's
  // footprint (supersampled but squeezed — the user chose this in the modal).
  export async function addUpscaledLayerFromResult(url, underUrl = null) {
    const r = upscaleRegionUsed;
    if (!r) return;
    const drawIntoRegion = (img) => {
      const c = document.createElement("canvas");
      c.width = width; c.height = height;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
      return c;
    };
    let underImg = null;
    if (underUrl) {
      try { underImg = await loadImageEl(underUrl); } catch { /* under-layer is best-effort */ }
    }
    const img = await loadImageEl(url);
    insertResultLayer(drawIntoRegion(img), r.maskCanvas, "Upscale", underImg ? drawIntoRegion(underImg) : null);
  }
  // "Grow canvas": the document scales up to host the region render 1:1 — the
  // ESRGAN-enlarged Background becomes the new base (an epoch, like Crop),
  // every layer bitmap rescales, and the render drops in untouched as a new
  // layer clipped to the scaled region mask. No resampling of the diffusion
  // output — this is the targeted-upscale spec.
  export async function applyCanvasUpscale({ bgUrl, regionUrl }) {
    const r = upscaleRegionUsed;
    if (!r) return;
    const [bgImg, regionImg] = await Promise.all([loadImageEl(bgUrl), loadImageEl(regionUrl)]);
    const W2 = bgImg.naturalWidth, H2 = bgImg.naturalHeight; // server-rendered exact target dims
    const fx = W2 / width, fy = H2 / height;
    flushActive();
    if (selActive) deselect(); // the selection mask is in old-document coordinates
    const ow = width, oh = height;
    const newLayers = layers.map((L) => {
      // The ESRGAN render IS the new Background — the handoff blob was drawn
      // from this layer (bitmap, offset and all), so rendering from the new
      // base image keeps it crisp instead of shadowing it with a client-side
      // resample of the old bitmap.
      if (L.isBackground) return { ...L, bitmap: null, ox: 0, oy: 0 };
      const scalePlane = (data) => {
        if (!data) return undefined;
        const t = document.createElement("canvas");
        t.width = ow; t.height = oh;
        t.getContext("2d").putImageData(data, 0, 0);
        const sc = document.createElement("canvas");
        sc.width = W2; sc.height = H2;
        const sctx = sc.getContext("2d");
        sctx.imageSmoothingQuality = "high";
        sctx.drawImage(t, 0, 0, W2, H2);
        return sc;
      };
      const next = { ...L, ox: Math.round((L.ox || 0) * fx), oy: Math.round((L.oy || 0) * fy) };
      const bc = scalePlane(L.bitmap);
      if (bc) next.bitmap = bc.getContext("2d").getImageData(0, 0, W2, H2);
      const mc = scalePlane(L.mask);
      if (mc) { next.mask = mc.getContext("2d").getImageData(0, 0, W2, H2); next.maskUrl = mc.toDataURL(); }
      return next;
    });
    // The region render, 1:1 pixels, positioned at the scaled rect.
    const c = document.createElement("canvas");
    c.width = W2; c.height = H2;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(regionImg, Math.round(r.x * fx), Math.round(r.y * fy), Math.round(r.w * fx), Math.round(r.h * fy));
    const fm = document.createElement("canvas");
    fm.width = W2; fm.height = H2;
    const fctx = fm.getContext("2d");
    fctx.filter = `blur(${Math.round(12 * Math.max(fx, fy))}px)`; // feather scales with the document
    fctx.drawImage(r.maskCanvas, 0, 0, W2, H2);
    fctx.filter = "none";
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(fm, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    const regionBitmap = ctx.getImageData(0, 0, W2, H2);

    sourceUrl = bgUrl; width = W2; height = H2;
    sourceData = null; strokeCov = null; blankSnap = null;
    cropBox = null;
    dropLiqSession();
    healSource = null;
    const id = ++nextLayerNum;
    layers = [...newLayers.slice(0, activeIndex + 1),
      { id, name: `Upscale ${id}`, visible: true, opacity: 1, bitmap: regionBitmap },
      ...newLayers.slice(activeIndex + 1)];
    activeIndex = activeIndex + 1;
    selectedIds = [id];
    matchLayerColorsToBelow(activeIndex, bgImg); // region render vs the fresh ESRGAN base
    // the paint canvas resizes via its bound attrs; restore the active layer after
    requestAnimationFrame(() => {
      loadActiveBitmap();
      commitAction("Upscale Canvas");
      resetView();
    });
  }

  // Photoshop-style left tool strip — icons in the strip, per-tool options on
  // the bar above the canvas.
  const TOOLS = [
    { id: "move", label: "Move — drag the layer, or the selected pixels",
      icon: `<path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/>` },
    { id: "select", label: "Select",
      icon: `<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3.2 2.4"/>` },
    { id: "lasso", label: "Lasso",
      icon: `<path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1"/><path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>` },
    { id: "brush", label: "Brush",
      icon: `<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>` },
    { id: "eraser", label: "Eraser",
      icon: `<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>` },
    { id: "bucket", label: "Paint Bucket — flood fill with the foreground color",
      icon: `<path d="M4 9.2 L8.6 17.8 a1.4 1.4 0 0 0 1.9 0.55 L16.6 13.9 a1.4 1.4 0 0 0 0.45 -1.9 L13 5"/><ellipse cx="8.5" cy="7.1" rx="4.9" ry="1.85" transform="rotate(-27 8.5 7.1)"/><path d="M5.7 6.4 A 4.4 4.4 0 0 1 13.6 5.6"/><path d="M18.7 14.8 c1.15 1.55 1.45 2.45 1.45 3.15 a1.45 1.45 0 0 1 -2.9 0 c0 -0.7 0.3 -1.45 1.45 -3.15z"/>` },
    { id: "objsel", label: "Object Select — click an object to select it (AI); Shift adds, Alt subtracts",
      icon: `<rect x="3" y="4" width="18" height="16" rx="1" stroke-dasharray="3 2.2"/><path d="M12 8.5l1.2 2.4 2.6.4-1.9 1.9.4 2.6-2.3-1.2-2.3 1.2.4-2.6-1.9-1.9 2.6-.4z"/>` },
    { id: "smooth", label: "Smooth",
      icon: `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>` },
    { id: "spot", label: "Spot Heal",
      icon: `<circle cx="8.5" cy="8.5" r="5" stroke-dasharray="2.4 2.1"/><g transform="rotate(-45 14.5 14.5)"><rect x="7.5" y="11.5" width="14" height="6" rx="3"/><path d="M12 11.5v6"/><path d="M17 11.5v6"/></g>` },
    { id: "heal", label: "Heal (Alt-click source)",
      icon: `<g transform="rotate(-45 12 12)"><rect x="2.5" y="8" width="19" height="8" rx="4"/><path d="M8.5 8v8"/><path d="M15.5 8v8"/><path d="M10.8 10.8h.01"/><path d="M13.2 13.2h.01"/><path d="M13.2 10.8h.01"/><path d="M10.8 13.2h.01"/></g>` },
    { id: "stamp", label: "Clone Stamp (Alt-click source)",
      icon: `<path d="M5 22h14"/><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"/><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/>` },
    { id: "liquify", label: "Liquify",
      icon: `<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>` },
    { id: "adjust", label: "Camera Raw adjustments",
      icon: `<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/>` },
    { id: "crop", label: "Crop",
      icon: `<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>` },
    { id: "eyedrop", label: "Pick",
      icon: `<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>` },
  ];
  // PS single-key tool shortcuts (no modifier) → tool id.
  const TOOL_KEYS = { v: "move", m: "select", l: "lasso", b: "brush", e: "eraser",
    g: "bucket", w: "objsel", j: "spot", s: "stamp", c: "crop", i: "eyedrop" };
  const ACTION_ICONS = {
    undo: `<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>`,
    redo: `<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/>`,
    clear: `<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>`,
  };

  // Feathered VIEW of a patch, derived from the raw pixels + shape — rebuilt
  // live when the Feather slider moves (mask is inside-feathered: blurred
  // shape fill with (a-128)*2 alpha remap, ramp entirely inside the shape).
  function makePatchView(raw, pts, f) {
    const w = raw.width, h = raw.height;
    const view = document.createElement("canvas");
    view.width = w; view.height = h;
    const ctx = view.getContext("2d");
    ctx.drawImage(raw, 0, 0);
    if (!pts && f < 1) return view; // hard rect: no mask needed
    const mask = document.createElement("canvas");
    mask.width = w; mask.height = h;
    const mctx = mask.getContext("2d", { willReadFrequently: true });
    if (f >= 1) mctx.filter = `blur(${Math.min(f, w / 2 - 1, h / 2 - 1)}px)`;
    mctx.fillStyle = "#fff";
    if (pts) {
      mctx.beginPath();
      mctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) mctx.lineTo(pts[i].x, pts[i].y);
      mctx.closePath();
      mctx.fill();
    } else {
      mctx.fillRect(0, 0, w, h);
    }
    mctx.filter = "none";
    if (f >= 1) {
      const md = mctx.getImageData(0, 0, w, h);
      for (let i = 3; i < md.data.length; i += 4) {
        md.data[i] = Math.max(0, Math.min(255, (md.data[i] - 128) * 2));
      }
      mctx.putImageData(md, 0, 0);
    }
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    return view;
  }

  // blit the lifted pixels once the floating <canvas> mounts; re-feather LIVE
  // when the Feather slider moves while a patch floats
  $effect(() => {
    if (patch && patchEl) {
      const view = makePatchView(patch.raw, patch.pts, featherPx);
      patch.canvas = view;
      patchEl.width = patch.pw;
      patchEl.height = patch.ph;
      const ctx = patchEl.getContext("2d");
      ctx.clearRect(0, 0, patch.pw, patch.ph);
      ctx.drawImage(view, 0, 0);
    }
  });

  function liftPatch(rect) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(rect.w));
    c.height = Math.max(1, Math.round(rect.h));
    const ctx = c.getContext("2d");
    try {
      // copy from the COMPOSITE so already-painted fixes can be re-patched
      drawBackdrop(ctx, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
      ctx.drawImage(paintCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
    } catch (e) {
      console.warn("[PromptChain] patch lift failed", e);
      return;
    }
    patch = { canvas: c, raw: c, pts: null, pw: c.width, ph: c.height, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  }

  // Lasso select: lift the freehand region as a SHAPED floating patch — the
  // polygon becomes the patch's alpha (feather re-derives live from the raw
  // pixels), then the normal move/stretch/commit flow applies.
  function liftLassoPatch(pts) {
    const pad = 42; // headroom so live feather (≤40px) never clips at the bbox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    const bx = Math.max(0, Math.floor(minX - pad));
    const by = Math.max(0, Math.floor(minY - pad));
    const bw = Math.min(width, Math.ceil(maxX + pad)) - bx;
    const bh = Math.min(height, Math.ceil(maxY + pad)) - by;
    if (bw < 3 || bh < 3) return;
    const c = document.createElement("canvas");
    c.width = bw; c.height = bh;
    const ctx = c.getContext("2d");
    try {
      drawBackdrop(ctx, bx, by, bw, bh, 0, 0, bw, bh);
      ctx.drawImage(paintCanvas, bx, by, bw, bh, 0, 0, bw, bh);
    } catch (e) {
      console.warn("[PromptChain] lasso lift failed", e);
      return;
    }
    const rel = pts.map((p) => ({ x: p.x - bx, y: p.y - by }));
    patch = { canvas: c, raw: c, pts: rel, pw: bw, ph: bh, x: bx, y: by, w: bw, h: bh };
  }

  function commitPatch() {
    if (!patch) return;
    const ctx = paintCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // the view carries the LIVE feather; opacity applies at composite
    const view = makePatchView(patch.raw, patch.pts, featherPx);
    ctx.save();
    ctx.globalAlpha = patchOpacity;
    // rotate/flip ride the box center so a transformed float bakes exactly
    // where the on-screen box sits (translate→rotate→scale matches the CSS
    // wrap-rotate ∘ canvas-flip order)
    const cx = patch.x + patch.w / 2, cy = patch.y + patch.h / 2;
    ctx.translate(cx, cy);
    if (patch.rot) ctx.rotate(patch.rot);
    if (patch.flipH || patch.flipV) ctx.scale(patch.flipH ? -1 : 1, patch.flipV ? -1 : 1);
    ctx.drawImage(view, 0, 0, patch.pw, patch.ph, -patch.w / 2, -patch.h / 2, patch.w, patch.h);
    ctx.restore();
    commitAction(patch.transform ? "Transform" : "Patch");
    patch = null;
  }

  function cancelPatch() {
    // a Transform float erased its source pixels on lift — put them back
    if (patch?.restore && paintCanvas) {
      const ctx = paintCanvas.getContext("2d");
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(patch.restore, 0, 0);
    }
    // a Transform on a masked layer baked the mask into the pixels — restore the live mask
    if (patch?.maskRestore) {
      layers[activeIndex] = { ...layers[activeIndex], mask: patch.maskRestore.mask, maskUrl: patch.maskRestore.maskUrl };
    }
    patch = null;
  }

  // Free Transform: float the active layer's content (or the current selection)
  // into the patch overlay, then scale/rotate/flip and bake on commit. The
  // source is erased on lift so the float doesn't leave a duplicate; cancelPatch
  // restores it from patch.restore.
  function beginTransform() {
    if (patch) return true;
    if (maskEdit) exitMaskEdit(); // transform operates on the layer, not its mask
    if (blockHiddenEdit("transform")) return false;
    if (!paintCanvas || !layers[activeIndex]) return false;
    flushActive();
    const L = layers[activeIndex];
    const restore = document.createElement("canvas");
    restore.width = width; restore.height = height;
    restore.getContext("2d").drawImage(paintCanvas, 0, 0);
    const pctx = paintCanvas.getContext("2d");
    if (selActive && selBBox) {
      const cap = captureSelection();
      if (!cap) { errorMsg = "Nothing to transform."; return false; }
      pctx.globalCompositeOperation = "destination-out";
      pctx.drawImage(cap.mask, cap.x, cap.y);
      pctx.globalCompositeOperation = "source-over";
      patch = { canvas: cap.canvas, raw: cap.canvas, pts: null,
        pw: cap.canvas.width, ph: cap.canvas.height,
        x: cap.x, y: cap.y, w: cap.canvas.width, h: cap.canvas.height,
        rot: 0, flipH: false, flipV: false, transform: true, restore,
        home: { x: cap.x, y: cap.y, w: cap.canvas.width, h: cap.canvas.height } };
      deselect(); // the marching ants give way to the transform box
      return true;
    }
    // no selection → hug the layer's on-canvas content with the box
    const bb = layerContentBBox(L);
    if (!bb || bb.w < 2 || bb.h < 2) { errorMsg = "This layer is empty — nothing to transform."; return false; }
    const ox = L.ox || 0, oy = L.oy || 0;
    const dx0 = Math.max(0, Math.floor(bb.x + ox)), dy0 = Math.max(0, Math.floor(bb.y + oy));
    const dw = Math.min(width, Math.ceil(bb.x + ox + bb.w)) - dx0;
    const dh = Math.min(height, Math.ceil(bb.y + oy + bb.h)) - dy0;
    if (dw < 2 || dh < 2) { errorMsg = "This layer's content is off-canvas — move it back to transform."; return false; }
    // A masked layer: bake the mask into the pixels so it transforms WITH the
    // content — otherwise the un-transformed mask would clip the scaled/rotated
    // result. cancelPatch restores both the unmasked pixels (from `restore`) and the
    // live mask. L.mask is content-space; paintCanvas is DOC-space (loadActiveBitmap
    // draws at +ox/+oy), so the mask must ride the layer's ox/oy offset to align.
    let maskRestore = null;
    if (L.mask) {
      const mc = document.createElement("canvas"); mc.width = width; mc.height = height;
      mc.getContext("2d").putImageData(L.mask, 0, 0);
      pctx.globalCompositeOperation = "destination-in";
      pctx.drawImage(mc, ox, oy);
      pctx.globalCompositeOperation = "source-over";
      maskRestore = { mask: L.mask, maskUrl: L.maskUrl };
      layers[activeIndex] = { ...L, mask: undefined, maskUrl: undefined };
    }
    const c = document.createElement("canvas");
    c.width = dw; c.height = dh;
    c.getContext("2d").drawImage(paintCanvas, dx0, dy0, dw, dh, 0, 0, dw, dh);
    pctx.clearRect(dx0, dy0, dw, dh); // Background lifts to transparency too (normal layer)
    patch = { canvas: c, raw: c, pts: null, pw: dw, ph: dh,
      x: dx0, y: dy0, w: dw, h: dh, rot: 0, flipH: false, flipV: false, transform: true, restore,
      maskRestore,
      home: { x: dx0, y: dy0, w: dw, h: dh } };
    return true;
  }

  function resetTransform() {
    if (!patch?.transform || !patch.home) return;
    patch = { ...patch, ...patch.home, rot: 0, flipH: false, flipV: false };
  }


  function flipPatch(axis) {
    if (!patch) return;
    patch = axis === "h" ? { ...patch, flipH: !patch.flipH } : { ...patch, flipV: !patch.flipV };
  }

  function normalizedRect(a, b) {
    // Snap to the integer pixel grid so a marquee is pixel-exact (lets you select
    // a single pixel, and the cut edge is crisp instead of sub-pixel anti-aliased).
    const x1 = Math.round(Math.max(0, Math.min(a.x, b.x)));
    const y1 = Math.round(Math.max(0, Math.min(a.y, b.y)));
    const x2 = Math.round(Math.min(width, Math.max(a.x, b.x)));
    const y2 = Math.round(Math.min(height, Math.max(a.y, b.y)));
    return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
  }

  // Just-outside-a-corner rotate zone (PS Free Transform): the pointer is past a
  // box edge, within a screen-constant band, and near a corner (both axes). On a
  // handle = resize (handles capture their own events); beyond the band = commit.
  function inRotateZone(p) {
    if (!patch?.transform) return false;
    const cx = patch.x + patch.w / 2, cy = patch.y + patch.h / 2;
    const ang = patch.rot || 0;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const dx = p.x - cx, dy = p.y - cy;
    const lx = dx * cosA + dy * sinA, ly = -dx * sinA + dy * cosA; // box-local frame
    const band = 30 / zoom, edge = 6 / zoom; // rotate ring: just past the handle (~6px) out to ~30 screen px
    const outX = Math.abs(lx) - patch.w / 2, outY = Math.abs(ly) - patch.h / 2;
    const isOutside = outX > edge || outY > edge;    // past the box edge AND its resize handle
    const inBand = outX <= band && outY <= band;     // not too far out
    const nearCorner = outX > -band && outY > -band; // near a corner, not mid-edge
    return isOutside && inBand && nearCorner;
  }
  function patchPointerDown(e, mode) {
    if (e.button !== 0) return;
    if (e.shiftKey && mode === "move") return; // shift-pan from the body falls through
    e.stopPropagation();
    e.preventDefault();
    patchDrag = { mode, startX: e.clientX, startY: e.clientY, orig: { ...patch } };
    if (mode === "rot") {
      const cx = patch.x + patch.w / 2, cy = patch.y + patch.h / 2;
      const p = toImageCoords(e);
      patchDrag.grabAngle = Math.atan2(p.y - cy, p.x - cx) - (patch.rot || 0);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function patchPointerMove(e) {
    if (!patchDrag) return;
    const o = patchDrag.orig;
    if (patchDrag.mode === "rot") {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      const p = toImageCoords(e);
      let a = Math.atan2(p.y - cy, p.x - cx) - patchDrag.grabAngle;
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); // 15° snap
      patch = { ...patch, rot: a };
      return;
    }
    const dx = (e.clientX - patchDrag.startX) / zoom;
    const dy = (e.clientY - patchDrag.startY) / zoom;
    if (patchDrag.mode === "move") {
      patch = { ...patch, x: o.x + dx, y: o.y + dy };
      return;
    }
    // resize in the box's LOCAL frame so handles track even when rotated, with
    // the opposite corner/edge held fixed in doc space.
    const dir = patchDrag.mode;
    const ang = o.rot || 0;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const lx = dx * cos + dy * sin;   // screen delta → box-local x
    const ly = -dx * sin + dy * cos;  // screen delta → box-local y
    const ux = dir.includes("e") ? 1 : dir.includes("w") ? -1 : 0;
    const uy = dir.includes("s") ? 1 : dir.includes("n") ? -1 : 0;
    let w2 = Math.max(2, o.w + ux * lx);
    let h2 = Math.max(2, o.h + uy * ly);
    if (e.shiftKey && ux !== 0 && uy !== 0) { // Shift = keep proportions from a corner
      const ar = o.w / o.h;
      if (Math.abs(w2 / o.w - 1) >= Math.abs(h2 / o.h - 1)) h2 = w2 / ar;
      else w2 = h2 * ar;
    }
    // anchor = the corner/edge-mid opposite the dragged handle (original box)
    const ocx = o.x + o.w / 2, ocy = o.y + o.h / 2;
    const aox = -ux * o.w / 2, aoy = -uy * o.h / 2;
    const aDocX = ocx + aox * cos - aoy * sin;
    const aDocY = ocy + aox * sin + aoy * cos;
    // new center sits so that anchor stays put given the new local size
    const ndx = ux * w2 / 2, ndy = uy * h2 / 2;
    const ncx = aDocX + ndx * cos - ndy * sin;
    const ncy = aDocY + ndx * sin + ndy * cos;
    patch = { ...patch, x: ncx - w2 / 2, y: ncy - h2 / 2, w: w2, h: h2 };
  }

  function patchPointerUp() {
    patchDrag = null;
  }

  // Blur a copy of the lassoed region, mask it with a FEATHERED fill of the
  // lasso shape, and stamp the result: fully blurred in the middle, fading to
  // untouched original at the boundary — edges always match.
  function applySmooth(pts) {
    const pad = Math.ceil(smoothBlur + smoothFeather) + 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    const bx = Math.max(0, Math.floor(minX - pad));
    const by = Math.max(0, Math.floor(minY - pad));
    const bw = Math.min(width, Math.ceil(maxX + pad)) - bx;
    const bh = Math.min(height, Math.ceil(maxY + pad)) - by;
    if (bw < 2 || bh < 2) return;

    const src = document.createElement("canvas");
    src.width = bw; src.height = bh;
    const sctx = src.getContext("2d");
    try {
      // Active layer only — smoothing must not pull the backdrop into the layer.
      sctx.drawImage(paintCanvas, bx, by, bw, bh, 0, 0, bw, bh);
    } catch (e) {
      console.warn("[PromptChain] smooth lift failed", e);
      return;
    }

    // Feathered mask, INSIDE the lasso only: a blurred polygon fill sits at
    // 50% alpha exactly on the lasso line (gaussian bleeds both ways), so
    // remap alpha [0.5..1] → [0..1]. The ramp then lives entirely inside the
    // selection and pixels outside the line stay mathematically untouched.
    const mask = document.createElement("canvas");
    mask.width = bw; mask.height = bh;
    const mctx = mask.getContext("2d", { willReadFrequently: true });
    mctx.filter = `blur(${smoothFeather}px)`;
    mctx.beginPath();
    mctx.moveTo(pts[0].x - bx, pts[0].y - by);
    for (let i = 1; i < pts.length; i++) mctx.lineTo(pts[i].x - bx, pts[i].y - by);
    mctx.closePath();
    mctx.fillStyle = "#fff";
    mctx.fill();
    mctx.filter = "none";
    const mdata = mctx.getImageData(0, 0, bw, bh);
    const md = mdata.data;
    for (let i = 3; i < md.length; i += 4) {
      md[i] = Math.max(0, Math.min(255, (md[i] - 128) * 2));
    }
    mctx.putImageData(mdata, 0, 0);

    const out = document.createElement("canvas");
    out.width = bw; out.height = bh;
    const ctx = out.getContext("2d");
    ctx.filter = `blur(${smoothBlur}px)`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";

    paintCanvas.getContext("2d").drawImage(out, bx, by);
    commitAction("Smooth");
  }

  // ── liquify (GEGL warp model: cumulative displacement field over the
  // flattened composite, backward-mapped bilinear preview re-rendered from the
  // ORIGINAL every frame — never chain-resample or the image blurs) ──
  let liqTool = $state("warp");      // warp | bloat | pucker | reconstruct
  let liqSize = $state(140);
  let liqDensity = $state(50);       // edge falloff (PS Density)
  let liqPressure = $state(70);      // magnitude
  let liqRate = $state(60);          // hold-accumulation speed (bloat/pucker)
  let liqSrc = null;                 // ImageData: flattened composite at session start
  let liqD = null;                   // Float32Array w*h*2 — backward displacement field
  let liqStrokeDirty = false;        // this stroke changed the field → commit at release
  let liqStroking = false;
  let liqResidual = 0;
  let liqLastStamp = null;
  let liqBatchBox = null;
  let liqRafId = 0;
  let liqRafLast = 0;
  let liqLUT = { key: "", table: null };

  function ensureLiqSession() {
    if (liqSrc && liqSrc.width === width && liqSrc.height === height && liqD) return;
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    try {
      // Active layer only — warp the layer's own pixels, not the backdrop, so the
      // layer keeps its transparency (same scoping as the Camera Raw fix).
      ctx.drawImage(paintCanvas, 0, 0);
    } catch (e) {
      console.warn("[PromptChain] liquify session failed", e);
      return;
    }
    liqSrc = ctx.getImageData(0, 0, width, height);
    liqD = new Float32Array(width * height * 2);
  }

  function dropLiqSession() {
    liqSrc = null; liqD = null;
  }

  // GEGL calc_lut: smooth bump falloff, density = edge hardness
  function getLiqLUT() {
    const radius = liqSize / 2;
    const key = `${radius}|${liqDensity}`;
    if (liqLUT.key === key) return liqLUT.table;
    const len = Math.floor(radius) + 3;
    const table = new Float32Array(len);
    const hardness = Math.min(0.99, liqDensity / 100);
    const exponent = 0.4 / (1 - hardness);
    for (let i = 0; i < len; i++) {
      const f = Math.pow(Math.min(1, i / radius), exponent);
      table[i] = f < 0.5 ? 1 - 2 * f * f : 2 * (1 - f) * (1 - f);
    }
    liqLUT = { key, table };
    return table;
  }

  function liqForce(dist, lut) {
    const a = dist | 0;
    if (a + 1 >= lut.length) return 0;
    return lut[a] + (dist - a) * (lut[a + 1] - lut[a]);
  }

  // Field updates. Backward-mapped semantics: out(p) = src(p + D(p)), so
  // forward warp stores (prev − cur) and bloat samples TOWARD the center
  // (negative radial) to expand content outward.
  function liqStampWarp(cx, cy, mx, my) {
    const lut = getLiqLUT();
    const radius = liqSize / 2;
    const k = liqPressure / 100;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * width + x) * 2;
        liqD[i] += f * k * mx;
        liqD[i + 1] += f * k * my;
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }

  // Push Left: displacement perpendicular to the stroke (drag up → content
  // moves left). Backward store of rot90CCW(motion).
  function liqStampPush(cx, cy, mx, my) {
    const lut = getLiqLUT();
    const radius = liqSize / 2;
    const k = liqPressure / 100;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * width + x) * 2;
        liqD[i] += f * k * my;
        liqD[i + 1] += f * k * -mx;
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }

  // Twirl: rotation-minus-identity about the brush center (GEGL SWIRL_CW)
  function liqStampTwirl(cx, cy, theta) {
    const lut = getLiqLUT();
    const radius = liqSize / 2;
    const s = -Math.sin(theta);
    const c = Math.cos(theta) - 1;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * width + x) * 2;
        liqD[i] += f * (c * xi - s * yi);
        liqD[i + 1] += f * (s * xi + c * yi);
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }

  function liqStampRadial(cx, cy, k) {
    const lut = getLiqLUT();
    const radius = liqSize / 2;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * width + x) * 2;
        liqD[i] += f * k * xi;
        liqD[i + 1] += f * k * yi;
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }

  function liqStampReconstruct(cx, cy) {
    const lut = getLiqLUT();
    const radius = liqSize / 2;
    const k = (liqPressure / 100) * 0.35;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const yi = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const xi = x + 0.5 - cx;
        const f = liqForce(Math.sqrt(xi * xi + yi * yi), lut);
        if (f <= 0) continue;
        const i = (y * width + x) * 2;
        const s = 1 - f * k;
        liqD[i] *= s;
        liqD[i + 1] *= s;
      }
    }
    liqGrowBatch(x0, y0, x1, y1);
  }

  function liqGrowBatch(x0, y0, x1, y1) {
    liqStrokeDirty = true;
    liqBatchBox = liqBatchBox
      ? { x0: Math.min(liqBatchBox.x0, x0), y0: Math.min(liqBatchBox.y0, y0),
          x1: Math.max(liqBatchBox.x1, x1), y1: Math.max(liqBatchBox.y1, y1) }
      : { x0, y0, x1, y1 };
  }

  // stamps spaced along the drag; motion per stamp = inter-stamp step (GEGL),
  // so displacement integrates along the path
  function liqDragStamps(to) {
    const from = liqLastStamp;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist === 0) return;
    const spacing = Math.max(2, liqSize * 0.08);
    let t = liqResidual;
    let px = from.x, py = from.y;
    while (t <= dist) {
      const f = t / dist;
      const sx = from.x + (to.x - from.x) * f;
      const sy = from.y + (to.y - from.y) * f;
      if (liqTool === "warp") liqStampWarp(sx, sy, px - sx, py - sy);
      else if (liqTool === "push") liqStampPush(sx, sy, px - sx, py - sy);
      else liqStampReconstruct(sx, sy);
      px = sx; py = sy;
      t += spacing;
    }
    liqResidual = t - dist;
    liqLastStamp = { x: px, y: py };
    renderLiqBatch();
  }

  function liqHoldLoop(ts) {
    if (!liqStroking) return;
    const dt = Math.min(0.05, Math.max(0, (ts - liqRafLast) / 1000));
    liqRafLast = ts;
    if (lastPt && dt > 0) {
      if (liqTool === "twirl") {
        const theta = (liqRate / 100) * (liqPressure / 100) * dt * 2.2;
        liqStampTwirl(lastPt.x, lastPt.y, theta);
      } else {
        const k = (liqRate / 100) * dt * 1.2 * (liqPressure / 100);
        liqStampRadial(lastPt.x, lastPt.y, liqTool === "bloat" ? -k : k);
      }
      renderLiqBatch();
    }
    liqRafId = requestAnimationFrame(liqHoldLoop);
  }

  // backward-mapped bilinear render of the dirty region, ALWAYS from liqSrc
  function renderLiqBatch() {
    if (!liqBatchBox) return;
    const { x0, y0, x1, y1 } = liqBatchBox;
    liqBatchBox = null;
    renderLiqRect(x0, y0, x1, y1);
  }

  function renderLiqRect(x0, y0, x1, y1) {
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < 1 || bh < 1) return;
    const img = new ImageData(bw, bh);
    const o = img.data;
    const s = liqSrc.data;
    const maxX = width - 1.001, maxY = height - 1.001;
    for (let y = 0; y < bh; y++) {
      const Y = y0 + y;
      for (let x = 0; x < bw; x++) {
        const X = x0 + x;
        const gi = Y * width + X;
        const idx = (y * bw + x) * 4;
        const dx = liqD[gi * 2], dy = liqD[gi * 2 + 1];
        if (dx === 0 && dy === 0) {
          const j = gi * 4;
          o[idx] = s[j]; o[idx + 1] = s[j + 1]; o[idx + 2] = s[j + 2]; o[idx + 3] = s[j + 3];
        } else {
          const fx = Math.min(maxX, Math.max(0, X + dx));
          const fy = Math.min(maxY, Math.max(0, Y + dy));
          const ix = fx | 0, iy = fy | 0;
          const tx = fx - ix, ty = fy - iy;
          const i00 = (iy * width + ix) * 4;
          const i10 = i00 + 4, i01 = i00 + width * 4, i11 = i01 + 4;
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
          const w01 = (1 - tx) * ty, w11 = tx * ty;
          o[idx] = s[i00] * w00 + s[i10] * w10 + s[i01] * w01 + s[i11] * w11;
          o[idx + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
          o[idx + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
          // carry the layer's own alpha through the warp (no opaque bake)
          o[idx + 3] = s[i00 + 3] * w00 + s[i10 + 3] * w10 + s[i01 + 3] * w01 + s[i11 + 3] * w11;
        }
      }
    }
    paintCanvas.getContext("2d").putImageData(img, x0, y0);
    if (hasCustomBlend) customTick++; // refresh the single-canvas custom-blend composite mid-stroke
  }


  // ── crop (Photoshop model: full-image box on activation, shield outside,
  // ratio presets, rule-of-thirds while dragging, Enter/double-click commits) ──
  let cropBox = $state(null);        // {x,y,w,h} image coords
  let cropRatioId = $state("free");
  let cropRatioFlip = $state(false);
  let cropDragging = $state(false);  // any active manipulation → thirds overlay
  let cropDrag = null;               // {mode: "move"|dir, startX, startY, orig, shiftRatio}
  let cropDrawStart = null;          // fresh-box drag origin (viewport-level)
  const CROP_RATIOS = [
    { id: "free", label: "Free" },
    { id: "original", label: "Original" },
    { id: "1:1", label: "1:1", r: 1 },
    { id: "4:5", label: "4:5", r: 4 / 5 },
    { id: "5:7", label: "5:7", r: 5 / 7 },
    { id: "2:3", label: "2:3", r: 2 / 3 },
    { id: "16:9", label: "16:9", r: 16 / 9 },
  ];

  function cropRatioValue() {
    if (cropRatioId === "free") return null;
    const r = cropRatioId === "original"
      ? width / height
      : CROP_RATIOS.find((c) => c.id === cropRatioId).r;
    return cropRatioFlip ? 1 / r : r;
  }

  function setTool(id) {
    commitPatch();
    if (maskEdit && (id === "adjust" || id === "crop" || id === "liquify")) exitMaskEdit(); // these don't operate on a mask
    if (id === "adjust") { openAdjust(); return; } // modal, not a canvas tool
    if (tool === "liquify" && id !== "liquify") dropLiqSession();
    tool = id;
    if (id === "crop") resetCropBox();
    else cropBox = null;
    if (id === "liquify") ensureLiqSession();
  }

  // ── Camera Raw modal (PS pattern: fullscreen dialog over the editor,
  // live parametric preview, OK applies as ONE history entry) ──
  let adjustOpen = $state(false);
  let adjustSrcCanvas = $state(null);

  function openAdjust() {
    if (blockHiddenEdit("adjust")) return; // Camera Raw reads + writes the active layer only
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    try {
      // Scope to the SELECTED layer: feed the modal only the active layer's pixels
      // (paintCanvas), NOT the backdrop below it. Compositing the backdrop in baked
      // the under-layers into the result and, because that composite is opaque, the
      // returned ImageData overwrote the layer's transparency on apply (the layer then
      // covered everything beneath it). The active layer's own alpha now rides through.
      ctx.drawImage(paintCanvas, 0, 0);
    } catch (e) {
      console.warn("[PromptChain] adjust open failed", e);
      return;
    }
    adjustSrcCanvas = c;
    adjustOpen = true;
  }

  function onAdjustApply(imageData) {
    const ctx = paintCanvas.getContext("2d");
    // Honor an active selection: blend the adjusted pixels with the original by the
    // selection's (feather-aware) coverage. Camera Raw preserves the layer's alpha,
    // so a plain RGBA lerp is correct and avoids canvas-composite alpha inflation;
    // outside the selection (t=0) the pixel stays exactly the original.
    if (selActive && selMaskCanvas) {
      const orig = ctx.getImageData(0, 0, width, height).data;
      const sel = selMaskCanvas.getContext("2d").getImageData(0, 0, width, height).data;
      const a = imageData.data;
      for (let i = 0; i < a.length; i += 4) {
        const t = sel[i + 3] / 255;
        if (t >= 1) continue;
        const it = 1 - t;
        a[i] = a[i] * t + orig[i] * it;
        a[i + 1] = a[i + 1] * t + orig[i + 1] * it;
        a[i + 2] = a[i + 2] * t + orig[i + 2] * it;
        a[i + 3] = a[i + 3] * t + orig[i + 3] * it;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    commitAction("Camera Raw");
    adjustOpen = false;
    adjustSrcCanvas = null;
  }

  function resetCropBox() {
    cropBox = { x: 0, y: 0, w: width, h: height };
    applyRatioToBox();
  }

  function cropBoxIsFull() {
    return cropBox && cropBox.x < 0.5 && cropBox.y < 0.5
      && Math.abs(cropBox.w - width) < 1 && Math.abs(cropBox.h - height) < 1;
  }

  // refit the current box to the chosen ratio about its center
  function applyRatioToBox() {
    const r = cropRatioValue();
    if (!r || !cropBox) return;
    let { x, y, w, h } = cropBox;
    const cx = x + w / 2, cy = y + h / 2;
    if (w / h > r) w = h * r; else h = w / r;
    x = Math.max(0, Math.min(width - w, cx - w / 2));
    y = Math.max(0, Math.min(height - h, cy - h / 2));
    cropBox = { x, y, w, h };
  }

  function cropPointerDown(e, mode) {
    if (e.button !== 0) return;
    // a full-image box is the fresh state — dragging inside rubber-bands a
    // new section (PS behavior); let the event fall through to the viewport
    if (mode === "move" && cropBoxIsFull()) return;
    e.stopPropagation();
    e.preventDefault();
    cropDrag = {
      mode,
      startX: e.clientX, startY: e.clientY,
      orig: { ...cropBox },
      shiftRatio: cropBox.w / cropBox.h,
    };
    cropDragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function cropPointerMove(e) {
    if (!cropDrag) return;
    const dx = (e.clientX - cropDrag.startX) / zoom;
    const dy = (e.clientY - cropDrag.startY) / zoom;
    const o = cropDrag.orig;
    let r = cropRatioValue();
    if (!r && e.shiftKey) r = cropDrag.shiftRatio; // Shift locks current ratio in free mode
    if (cropDrag.mode === "move") {
      cropBox = {
        ...cropBox,
        x: Math.max(0, Math.min(width - o.w, o.x + dx)),
        y: Math.max(0, Math.min(height - o.h, o.y + dy)),
      };
      return;
    }
    const dir = cropDrag.mode;
    let { x, y, w, h } = o;
    if (dir.includes("e")) w = o.w + dx;
    if (dir.includes("s")) h = o.h + dy;
    if (dir.includes("w")) { x = o.x + dx; w = o.w - dx; }
    if (dir.includes("n")) { y = o.y + dy; h = o.h - dy; }
    w = Math.max(8, w); h = Math.max(8, h);
    if (r) {
      if (dir === "n" || dir === "s") w = h * r;
      else h = w / r; // corners and e/w edges: width wins
    }
    // anchor the opposite side/corner, then clamp into the image
    if (dir.includes("w")) x = o.x + o.w - w;
    if (dir.includes("n")) y = o.y + o.h - h;
    if (dir === "n" || dir === "s") x = o.x + (o.w - w) / 2;
    if (dir === "e" || dir === "w") y = o.y + (o.h - h) / 2;
    x = Math.max(0, x); y = Math.max(0, y);
    if (x + w > width) w = width - x;
    if (y + h > height) h = height - y;
    if (r) {
      if (w / h > r) w = h * r; else h = w / r;
      if (dir.includes("w")) x = o.x + o.w - w;
      if (dir.includes("n")) y = o.y + o.h - h;
    }
    cropBox = { x, y, w, h };
  }

  function cropPointerUp() {
    cropDrag = null;
    cropDragging = false;
  }

  function commitCrop() {
    if (!cropBox || cropBoxIsFull()) { resetCropBox(); return; }
    const cx = Math.max(0, Math.round(cropBox.x));
    const cy = Math.max(0, Math.round(cropBox.y));
    const cw = Math.min(width - cx, Math.round(cropBox.w));
    const ch = Math.min(height - cy, Math.round(cropBox.h));
    if (cw < 4 || ch < 4) return;
    flushActive(); // sync the live canvas into the active layer before cropping
    if (selActive) deselect(); // selection mask is in old-document coordinates — invalid after crop
    const sc = document.createElement("canvas");
    sc.width = cw; sc.height = ch;
    try {
      sc.getContext("2d").drawImage(imgEl, cx, cy, cw, ch, 0, 0, cw, ch);
    } catch (e) {
      console.warn("[PromptChain] crop failed", e);
      return;
    }
    const newUrl = sc.toDataURL("image/png");
    // Crop every layer's bitmap to the new dimensions (uses the OLD width/height
    // for the source, so it must run before width/height are reassigned).
    const ow = width, oh = height;
    const cropPlane = (data, lox, loy) => {
      if (!data) return undefined;
      const t = document.createElement("canvas");
      t.width = ow; t.height = oh;
      t.getContext("2d").putImageData(data, 0, 0);
      // Bake the layer's non-destructive move offset into doc space so the crop
      // reads the region the user actually SEES (bitmap + mask share the offset).
      const doc = document.createElement("canvas");
      doc.width = ow; doc.height = oh;
      doc.getContext("2d").drawImage(t, lox, loy);
      const cc = document.createElement("canvas");
      cc.width = cw; cc.height = ch;
      cc.getContext("2d").drawImage(doc, cx, cy, cw, ch, 0, 0, cw, ch);
      return cc;
    };
    const newLayers = layers.map((L) => {
      const next = { ...L };
      const lox = L.ox || 0, loy = L.oy || 0;
      const bc = cropPlane(L.bitmap, lox, loy);
      if (bc) next.bitmap = bc.getContext("2d").getImageData(0, 0, cw, ch);
      const mc = cropPlane(L.mask, lox, loy);
      if (mc) { next.mask = mc.getContext("2d").getImageData(0, 0, cw, ch); next.maskUrl = mc.toDataURL(); }
      // crop establishes a new coordinate system — offsets are now baked into pixels
      next.ox = 0; next.oy = 0;
      return next;
    });
    sourceUrl = newUrl; width = cw; height = ch;
    sourceData = null; strokeCov = null; blankSnap = null;
    cropBox = null;
    dropLiqSession();
    healSource = null;
    layers = newLayers;
    // the paint canvas resizes via its bound attrs; restore the active layer after
    requestAnimationFrame(() => {
      loadActiveBitmap();
      commitAction("Crop");
      resetView();
    });
  }

  // PS-style crop furniture: L-brackets on corners, bars on edge midpoints
  function cropHandleStyle(dir, p, z) {
    const cursors = {
      n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
      nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
    };
    const t = 3.5 / z;   // stroke thickness
    const L = 16 / z;    // corner bracket arm length
    const B = 26 / z;    // edge bar length
    if (dir.length === 2) {
      const x = dir.includes("w") ? p.x - t : p.x + p.w - L + t;
      const y = dir.includes("n") ? p.y - t : p.y + p.h - L + t;
      const borders = `border-${dir.includes("n") ? "top" : "bottom"}-width:${t}px; border-${dir.includes("w") ? "left" : "right"}-width:${t}px;`;
      return `left:${x}px; top:${y}px; width:${L}px; height:${L}px; ${borders} cursor:${cursors[dir]};`;
    }
    if (dir === "n" || dir === "s") {
      const x = p.x + p.w / 2 - B / 2;
      const y = dir === "n" ? p.y - t / 2 : p.y + p.h - t / 2;
      return `left:${x}px; top:${y}px; width:${B}px; height:${t}px; background:#fff; cursor:${cursors[dir]};`;
    }
    const x = dir === "w" ? p.x - t / 2 : p.x + p.w - t / 2;
    const y = p.y + p.h / 2 - B / 2;
    return `left:${x}px; top:${y}px; width:${t}px; height:${B}px; background:#fff; cursor:${cursors[dir]};`;
  }

  function handleStyle(dir, p, z) {
    const s = 9 / z; // counter-scale so handles stay grabbable at any zoom
    const cx = dir.includes("w") ? p.x : dir.includes("e") ? p.x + p.w : p.x + p.w / 2;
    const cy = dir.includes("n") ? p.y : dir.includes("s") ? p.y + p.h : p.y + p.h / 2;
    const cursors = {
      n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
      nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
    };
    return `left:${cx - s / 2}px; top:${cy - s / 2}px; width:${s}px; height:${s}px; cursor:${cursors[dir]};`;
  }

  // handle position LOCAL to the rotated transform wrap (the wrap carries x/y) —
  // fixed cursors would lie once the box rotates, so they're omitted here
  function tHandleStyle(dir, p, z) {
    const s = 11 / z;
    const cx = dir.includes("w") ? 0 : dir.includes("e") ? p.w : p.w / 2;
    const cy = dir.includes("n") ? 0 : dir.includes("s") ? p.h : p.h / 2;
    return `left:${cx - s / 2}px; top:${cy - s / 2}px; width:${s}px; height:${s}px;`;
  }

  let rgb = $derived(hsvToRgb(hue, sat, val));
  let hexColor = $derived(rgbToHex(rgb));

  // color picker pops out next to the strip's color chip (PS-style)
  let colorPopout = $state(false);
  let popoutEl = $state(null);
  let colorChipEl = $state(null);
  let popPrev = null;                // color at popout-open, for Cancel/Esc

  function openColorPop() {
    popPrev = { hue, sat, val };
    colorPopout = true;
  }

  function okColorPop() {
    colorPopout = false;
  }

  function cancelColorPop() {
    if (popPrev) ({ hue, sat, val } = popPrev);
    colorPopout = false;
  }

  $effect(() => {
    if (!colorPopout) return;
    const onDown = (e) => {
      // canvas clicks sample a color while the picker is out (PS behavior)
      if (viewportEl?.contains(e.target)) return;
      if (!popoutEl?.contains(e.target) && !colorChipEl?.contains(e.target)) {
        colorPopout = false;
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  });

  $effect(() => {
    if (open && caps) {
      savePrefix = caps.defaultSavePrefix || "edit/edit";
      saving = false;
      errorMsg = "";
      tool = "brush";
      maskEdit = false;
      groups = [];
      renamingGroupId = null;
      sourceUrl = srcUrlProp;
      width = widthProp;
      height = heightProp;
      sourceData = null;
      cropBox = null;
      dropLiqSession();
      healSource = null;
      requestAnimationFrame(() => { resetView(); restoreOrInit(); });
    }
  });

  // Ctrl+Z / Escape need a window listener: focus rarely sits inside the
  // modal, and the viewer's own keydown guard skips while we're open.
  $effect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (adjustOpen || suspended) return; // Camera Raw / an elevated handoff modal owns the keyboard
      // Ctrl+Enter must never reach ComfyUI's Queue Prompt while the editor is
      // open — it would re-run the whole workflow underneath. Swallowed before
      // the typing guard so the save-path input can't leak it either.
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); return; }
      // Typing in a genuine TEXT field — the save path, or the handoff Inpaint
      // modal's CM6 prompt editor (a contenteditable DIV) — must never trigger
      // Edit hotkeys. But a focused range slider (opacity/feather) or <select> is
      // NOT a text field: Del/Backspace there must still delete the selection,
      // else "lasso, then nudge a slider, then hit Del" silently does nothing.
      const kt = e.target, ktag = kt?.tagName || "";
      const typingTarget = kt?.isContentEditable || ktag === "TEXTAREA"
        || (ktag === "INPUT" && !/^(range|checkbox|radio|button|submit|reset|color|file|image)$/i.test(kt.type || ""));
      if (typingTarget) return;
      if (hiddenEditDialog) { // PS modal: Esc/Enter/OK dismiss, swallow other Edit hotkeys
        if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); hiddenEditDialog = null; }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (patch) cancelPatch();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y" || ((e.key === "z" || e.key === "Z") && e.shiftKey))) {
        e.preventDefault();
        e.stopPropagation();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault(); e.stopPropagation();
        if (selActive) layerViaCopy(e.shiftKey); // Ctrl+J copy / Ctrl+Shift+J cut → new layer
        else if (!e.shiftKey) duplicateLayer(activeIndex); // no selection → duplicate the whole layer (PS)
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "c" || e.key === "C") && selActive) {
        e.preventDefault(); e.stopPropagation(); copySelection(false, true); // Copy Merged (visible composite)
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && selActive) {
        e.preventDefault(); e.stopPropagation(); copySelection(false);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "X") && selActive) {
        e.preventDefault(); e.stopPropagation(); copySelection(true);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V") && clipboard) {
        e.preventDefault(); e.stopPropagation(); pasteClipboard();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault(); e.stopPropagation();
        addLayer(); // new layer above the active one
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault(); e.stopPropagation();
        const g = groupById(layers[activeIndex]?.groupId); if (g) ungroup(g.id);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "g" || e.key === "G")) {
        e.preventDefault(); e.stopPropagation();
        if (selectedIds.length) groupSelected();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault(); e.stopPropagation();
        selectAllRegion(); commitAction("Select All"); // select whole canvas
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "i" || e.key === "I") && selActive) {
        e.preventDefault(); e.stopPropagation();
        selectInverse(); commitAction("Select Inverse"); // Photoshop's Ctrl+Shift+I
      } else if (e.key === "Backspace" && (e.altKey || e.ctrlKey || e.metaKey)) {
        e.preventDefault(); e.stopPropagation();
        fillWith(e.altKey ? rgb : bgRgb); // Alt+Backspace = foreground, Ctrl+Backspace = background
      } else if ((e.key === "Delete" || e.key === "Backspace") && selActive) {
        e.preventDefault(); e.stopPropagation();
        deleteSelection();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 1 && canDeleteSelected()) {
        // No pixel selection, but multiple layers are selected → delete the layers.
        e.preventDefault(); e.stopPropagation();
        deleteSelectedLayers();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D") && selActive) {
        e.preventDefault(); e.stopPropagation(); deselect(); commitAction("Deselect");
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault(); e.stopPropagation(); resetView(); // fit to window
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault(); e.stopPropagation(); zoomBy(1.25);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault(); e.stopPropagation(); zoomBy(1 / 1.25);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "[" || e.key === "]")) {
        e.preventDefault(); e.stopPropagation();
        const dir = e.key === "]" ? 1 : -1; // PS brush-size step grows with size
        const step = brushSize < 10 ? 1 : brushSize < 50 ? 2 : brushSize < 100 ? 5 : 10;
        brushSize = Math.max(1, Math.min(1024, brushSize + dir * step));
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !colorPopout && (e.key === "x" || e.key === "X")) {
        e.preventDefault(); e.stopPropagation();
        const fg = rgb; [hue, sat, val] = rgbToHsv(bgRgb[0], bgRgb[1], bgRgb[2]); bgRgb = fg; // swap foreground/background
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !colorPopout && (e.key === "d" || e.key === "D")) {
        e.preventDefault(); e.stopPropagation();
        hue = 0; sat = 0; val = 0; bgRgb = [255, 255, 255]; // default colors: black foreground / white background
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !patch && !colorPopout && TOOL_KEYS[(e.key || "").toLowerCase()]) {
        e.preventDefault(); e.stopPropagation();
        setTool(TOOL_KEYS[e.key.toLowerCase()]); // single-key tool switch (setTool commits any float first)
      } else if (e.key === " ") {
        // Hold Space to pan (Hand tool). spaceDown is tracked by the mods listener;
        // swallow the default so the page can't scroll or click a focused button.
        e.preventDefault(); e.stopPropagation();
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")
                 && !e.ctrlKey && !e.metaKey && !e.altKey && !patch && !colorPopout && !healDialog && tool !== "crop") {
        // A selection nudges its OUTLINE 1px (10px with Shift), PS-style; with no
        // selection the arrows nudge the active layer. (Free Transform, crop and
        // the colour popout reserve the arrows.)
        e.preventDefault(); e.stopPropagation();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (selActive) translateSelMask(copyMaskCanvas(), selBBox, dx, dy);
        else nudgeActiveLayer(dx, dy);
      } else if (e.key === "Enter" && colorPopout) {
        e.preventDefault();
        e.stopPropagation();
        okColorPop();
      } else if (e.key === "Enter" && patch) {
        e.preventDefault();
        e.stopPropagation();
        commitPatch();
      } else if (e.key === "Enter" && tool === "crop" && cropBox) {
        e.preventDefault();
        e.stopPropagation();
        commitCrop();
      } else if ((e.key === "Escape" || e.key === "Enter") && healDialog) {
        e.preventDefault();
        e.stopPropagation();
        healDialog = false;
      } else if (e.key === "Escape" && !saving) {
        e.preventDefault();
        e.stopPropagation();
        if (colorPopout) cancelColorPop();  // Esc = cancel, reverts the color
        else if (patch) cancelPatch();      // first Esc drops the patch, second closes
        else if (selActive) { deselect(); commitAction("Deselect"); }  // first Esc drops the selection
        else if (tool === "crop" && cropBox && !cropBoxIsFull()) resetCropBox();
        else close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // ── color helpers ──
  function hsvToRgb(h, s, v) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
    };
    return [f(5), f(3), f(1)];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return [(h + 360) % 360, max ? d / max : 0, max];
  }

  function rgbToHex([r, g, b]) {
    return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  function setColorFromRgb(r, g, b) {
    [hue, sat, val] = rgbToHsv(r, g, b);
  }

  // ── navigator (Photoshop-style: thumbnail + view rect + zoom slider) ──
  const NAV_W = 256, NAV_MAX_H = 190;
  let vpW = $state(0);
  let vpH = $state(0);
  // Is the view fit-to-window? A fit view re-fits on resize; a manual zoom flips
  // this off, so resize then holds the zoom and re-anchors the centre instead.
  let fitMode = $state(true);
  let navScale = $derived(width && height ? Math.min(NAV_W / width, NAV_MAX_H / height) : 0);
  let navTw = $derived(width * navScale);
  let navTh = $derived(height * navScale);
  let navRect = $derived.by(() => {
    if (!vpW || !vpH || !navScale) return null;
    const x0 = Math.max(0, -panX / zoom);
    const y0 = Math.max(0, -panY / zoom);
    const x1 = Math.min(width, (vpW - panX) / zoom);
    const y1 = Math.min(height, (vpH - panY) / zoom);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0 * navScale, y: y0 * navScale, w: (x1 - x0) * navScale, h: (y1 - y0) * navScale };
  });

  // Keep the image positioned the way Photoshop does on a window/panel resize,
  // and feed the navigator rect. PS rule: a fit-to-window view re-fits; a zoomed
  // view holds its zoom and re-anchors the image point that was at the viewport
  // centre — so the image never drifts into a corner, and centre-locks once it's
  // smaller than the frame. ResizeObserver is event-driven; the rAF lets layout
  // settle, coalesces drag-resizes, and dodges the RO "loop" warning.
  function clampPan() {
    const sw = width * zoom, sh = height * zoom;
    panX = sw <= vpW ? (vpW - sw) / 2 : Math.max(vpW - sw, Math.min(0, panX));
    panY = sh <= vpH ? (vpH - sh) / 2 : Math.max(vpH - sh, Math.min(0, panY));
  }
  $effect(() => {
    if (!open) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) return; // coalesce a burst of callbacks into one update per frame
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!viewportEl) return;
        const nw = viewportEl.clientWidth, nh = viewportEl.clientHeight;
        if (nw === vpW && nh === vpH) return; // no real size change
        const ow = vpW, oh = vpH;            // anchor against the OLD size
        vpW = nw; vpH = nh;
        // first real measure (or no image yet): resetView() already fit it on open
        if (!ow || !oh || !width || !height) return;
        if (fitMode) {
          resetView(); // recompute fit + recentre for the new viewport
        } else {
          // hold the zoom; keep the image point that was at the OLD centre centred
          const ax = (ow / 2 - panX) / zoom, ay = (oh / 2 - panY) / zoom;
          panX = nw / 2 - ax * zoom;
          panY = nh / 2 - ay * zoom;
          clampPan();
        }
      });
    });
    if (viewportEl) ro.observe(viewportEl);
    return () => { if (raf) cancelAnimationFrame(raf); ro.disconnect(); };
  });

  function navPanTo(e, el) {
    const rect = el.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / navScale;
    const cy = (e.clientY - rect.top) / navScale;
    panX = vpW / 2 - cx * zoom;
    panY = vpH / 2 - cy * zoom;
  }

  function navDrag(e) {
    const el = e.currentTarget;
    e.preventDefault();
    navPanTo(e, el);
    el.setPointerCapture(e.pointerId);
    const move = (ev) => navPanTo(ev, el);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  function setZoomCentered(z) {
    const nz = Math.max(0.05, Math.min(12, z));
    panX = vpW / 2 - ((vpW / 2 - panX) / zoom) * nz;
    panY = vpH / 2 - ((vpH / 2 - panY) / zoom) * nz;
    zoom = nz;
    fitMode = false; // a manual zoom — resize now holds this zoom and re-anchors
  }

  // Photoshop's zoom stops: −/+ walk these, so any odd in-between value (110%)
  // snaps to the nearest stop in that direction — one click back to 100%.
  const ZOOM_STOPS = [0.05, 0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 2, 3, 4, 5, 6, 8, 12];
  function zoomStep(dir) {
    const eps = 0.001;
    if (dir > 0) {
      const next = ZOOM_STOPS.find((s) => s > zoom + eps);
      if (next) setZoomCentered(next);
    } else {
      const next = [...ZOOM_STOPS].reverse().find((s) => s < zoom - eps);
      if (next) setZoomCentered(next);
    }
  }

  // ── view ──
  function resetView() {
    fitMode = true; // a reset/fit IS the fit-to-window state — resize will re-fit
    if (!viewportEl || !width || !height) { zoom = 1; panX = 0; panY = 0; return; }
    const rect = viewportEl.getBoundingClientRect();
    zoom = Math.min(rect.width / width, rect.height / height, 1) || 1;
    panX = (rect.width - width * zoom) / 2;
    panY = (rect.height - height * zoom) / 2;
  }

  // Keyboard zoom (Ctrl +/-): scale around the viewport center, mirroring onWheel.
  function zoomBy(factor) {
    if (!viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newZoom = Math.max(0.05, Math.min(12, zoom * factor));
    panX = cx - ((cx - panX) / zoom) * newZoom;
    panY = cy - ((cy - panY) / zoom) * newZoom;
    zoom = newZoom;
    fitMode = false;
  }

  function toImageCoords(e) {
    const rect = viewportEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panX) / zoom,
      y: (e.clientY - rect.top - panY) / zoom,
    };
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.05, Math.min(12, zoom * factor));
    panX = cx - ((cx - panX) / zoom) * newZoom;
    panY = cy - ((cy - panY) / zoom) * newZoom;
    zoom = newZoom;
    fitMode = false; // wheel zoom is a manual zoom — resize holds it and re-anchors
  }

  // ── brush engine ──
  // The stroke accumulates in a FLOAT coverage buffer; painted pixels are written
  // once in the active layer's OWN straight-alpha space (Porter-Duff per tool) and
  // dithered/rounded a single time (no opaque bake of the backdrop). Two
  // quantization mechanisms ring otherwise: (1) compositing dabs straight onto
  // the 8-bit canvas rounds after EVERY dab, so a held airbrush converges each
  // pixel to a quantized equilibrium terrace; (2) a semi-transparent paint
  // layer stores PREMULTIPLIED color — round(color×alpha) — whose staircase
  // has a period of 255/color alpha levels, far too coarse for alpha dither
  // to break. Opaque float-blended output sidesteps both, which is why
  // Photoshop (opaque layer, one float blend per pixel) doesn't ring.
  // Falloff is Photoshop's model (per libmypaint, the documented clone): two
  // line segments in SQUARED-radius space, hardness = the breakpoint.
  let strokeCov = null;       // Float32Array width×height, current stroke coverage
  let sourceData = null;      // ImageData of the untouched source image
  let preStroke = null;       // paint-layer ImageData at stroke start
  let selStrokeData = null;   // active selection's alpha, snapshotted at stroke start (clips the brush to the selection SHAPE)
  let batchBox = null;        // dirty region of the current pointer batch
  let strokeBox = null;       // dirty region of the WHOLE stroke (heal resolves it at release)
  let falloffLUT = { key: "", table: null };

  // ── healing (GIMP gimpheal.c model) ──
  // Texture from the source, color/illumination from the destination: solve
  // ∇²D = 0 on the stroked interior where D = dest − source, with the soft
  // brush ring as the fixed Dirichlet boundary, then healed = source + D.
  // Spot Heal auto-picks the source: best-matching offset in the surrounding
  // annulus by boundary-ring SSD. Both compute at stroke release (PS shows a
  // gray wash during the stroke, and so do we).
  let healDialog = $state(false);       // PS-style "Alt-click to define a source" dialog
  let healSource = $state(null);        // {x,y} primed by Alt-click (heal tool)
  let healStrokeOffset = $state(null);  // active stroke's offset (drives the crosshair)
  let healPaintingUi = $state(false);

  const isHealTool = () => tool === "spot" || tool === "heal";

  // pre-stroke composite (paint over source) at full-image coords, 0..255
  function compositeAt(x, y, ch) {
    const j = (y * width + x) * 4;
    const pa = preStroke.data[j + 3] / 255;
    return preStroke.data[j + ch] * pa + sourceData.data[j + ch] * (1 - pa);
  }

  function findBestPatchOffset(x0, y0, bw, bh) {
    // boundary-ring samples: soft-edge pixels around the hole
    const ring = [];
    for (let y = 0; y < bh && ring.length < 600; y += 2) {
      for (let x = 0; x < bw && ring.length < 600; x += 2) {
        const cov = strokeCov[(y0 + y) * width + x0 + x];
        if (cov > 0 && cov <= 0.5) ring.push([x0 + x, y0 + y]);
      }
    }
    if (!ring.length) return null;
    const rH = Math.max(bw, bh) / 2;
    const rMin = rH * 1.2 + 6;
    const rMax = Math.min(rH * 3 + 60, Math.max(width, height));
    let best = null, bestErr = Infinity;
    for (let k = 0; k < 280; k++) {
      const r = rMin + ((rMax - rMin) * k) / 280;
      const a = k * 2.39996; // golden-angle spiral around the hole
      const dx = Math.round(r * Math.cos(a));
      const dy = Math.round(r * Math.sin(a));
      let err = 0, n = 0, invalid = 0;
      for (const [px, py] of ring) {
        const sx = px + dx, sy = py + dy;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) { invalid++; continue; }
        if (strokeCov[sy * width + sx] > 0) { invalid++; continue; } // don't sample the hole
        for (let ch = 0; ch < 3; ch++) {
          const d = compositeAt(px, py, ch) - compositeAt(sx, sy, ch);
          err += d * d;
        }
        n++;
        if (err / Math.max(1, n) > bestErr) break; // early out
      }
      if (n < ring.length * 0.7) continue;
      const norm = err / n;
      if (norm < bestErr) { bestErr = norm; best = { dx, dy }; }
    }
    return best;
  }

  function runHeal() {
    if (!strokeBox) return;
    const pad = 3;
    const x0 = Math.max(0, strokeBox.x0 - pad);
    const y0 = Math.max(0, strokeBox.y0 - pad);
    const x1 = Math.min(width - 1, strokeBox.x1 + pad);
    const y1 = Math.min(height - 1, strokeBox.y1 + pad);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const restore = () => {
      paintCanvas.getContext("2d").putImageData(preStroke, 0, 0, x0, y0, bw, bh);
    };

    const off = tool === "heal" ? healStrokeOffset : findBestPatchOffset(x0, y0, bw, bh);
    if (!off) { restore(); return; }
    off.dx = Math.round(off.dx); // pixel-array lookups need integer offsets
    off.dy = Math.round(off.dy);

    // dest/src composites + D = dest − src, full bbox (source coords clamped)
    const npx = bw * bh;
    const dest = new Float32Array(npx * 3);
    const src = new Float32Array(npx * 3);
    const D = [new Float32Array(npx), new Float32Array(npx), new Float32Array(npx)];
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        const sx = Math.max(0, Math.min(width - 1, x0 + x + off.dx));
        const sy = Math.max(0, Math.min(height - 1, y0 + y + off.dy));
        for (let ch = 0; ch < 3; ch++) {
          dest[i * 3 + ch] = compositeAt(x0 + x, y0 + y, ch);
          src[i * 3 + ch] = compositeAt(sx, sy, ch);
          D[ch][i] = dest[i * 3 + ch] - src[i * 3 + ch];
        }
      }
    }

    // interior = solidly-covered pixels; the soft ring stays fixed (Dirichlet)
    let interior = collectInterior(x0, y0, bw, bh, 0.5);
    if (!interior.idx.length) interior = collectInterior(x0, y0, bw, bh, 0.2);
    if (!interior.idx.length) { restore(); return; }

    // checkerboard SOR (GIMP constants), per channel
    const n = interior.idx.length;
    const w = 2.0 - 1.0 / (0.1575 * Math.sqrt(n) + 0.8);
    for (let ch = 0; ch < 3; ch++) {
      const Dc = D[ch];
      for (let iter = 0; iter < 500; iter++) {
        let err = 0;
        for (let parity = 0; parity < 2; parity++) {
          const list = parity ? interior.black : interior.red;
          for (let k = 0; k < list.length; k++) {
            const i = list[k];
            let sum = 0, diag = 0;
            const x = i % bw, y = (i / bw) | 0;
            if (y > 0) { sum += Dc[i - bw]; diag++; }
            if (y < bh - 1) { sum += Dc[i + bw]; diag++; }
            if (x > 0) { sum += Dc[i - 1]; diag++; }
            if (x < bw - 1) { sum += Dc[i + 1]; diag++; }
            const delta = w * (sum / diag - Dc[i]);
            Dc[i] += delta;
            err += delta * delta;
          }
        }
        if (err < 0.01 * n) break;
      }
    }

    // healed = source texture + harmonic membrane; soft-edge composite back
    const img = new ImageData(bw, bh);
    const px = img.data;
    const pd = preStroke.data;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        const gi = (y0 + y) * width + x0 + x;
        let cov = Math.min(1, strokeCov[gi]);
        if (selStrokeData) cov *= selStrokeData[gi * 4 + 3] / 255; // clip heal to the selection shape
        const o = i * 4, j = gi * 4;
        if (cov <= 0) {
          px[o] = pd[j]; px[o + 1] = pd[j + 1]; px[o + 2] = pd[j + 2]; px[o + 3] = pd[j + 3];
          continue;
        }
        const d = dither(x0 + x, y0 + y);
        for (let ch = 0; ch < 3; ch++) {
          const healed = src[i * 3 + ch] + D[ch][i];
          const target = cov * healed + (1 - cov) * dest[i * 3 + ch];
          px[o + ch] = Math.max(0, Math.min(255, Math.round(target + d)));
        }
        px[o + 3] = pd[j + 3]; // heal re-textures; keep the layer's own alpha (no opaque bake)
      }
    }
    paintCanvas.getContext("2d").putImageData(img, x0, y0);
    commitAction(tool === "heal" ? "Heal" : "Spot Heal");
  }

  function collectInterior(x0, y0, bw, bh, threshold) {
    const idx = [], red = [], black = [];
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (strokeCov[(y0 + y) * width + x0 + x] > threshold) {
          const i = y * bw + x;
          idx.push(i);
          ((x + y) & 1 ? black : red).push(i);
        }
      }
    }
    return { idx, red, black };
  }

  function getFalloffLUT() {
    const core = Math.min(0.98, Math.max(0.02, hardness));
    const key = String(core);
    if (falloffLUT.key !== key) {
      const table = new Float32Array(1025);
      for (let i = 0; i <= 1024; i++) {
        const rr = i / 1024;
        table[i] = rr < core ? rr + 1 - rr / core : (core / (1 - core)) * (1 - rr);
      }
      falloffLUT = { key, table };
    }
    return falloffLUT.table;
  }

  function beginStroke() {
    if (!strokeCov || strokeCov.length !== width * height) {
      strokeCov = new Float32Array(width * height);
    } else {
      strokeCov.fill(0);
    }
    // Source-of-truth = the backdrop (Background + layers below the active one),
    // recomputed per stroke since the active layer and lower edits can change.
    sourceData = backdropCanvas().getContext("2d").getImageData(0, 0, width, height);
    // preStroke = the ACTIVE layer's current pixels (the live canvas), captured
    // fresh so a layer switch can't leave it pointing at another layer's state.
    preStroke = paintCanvas.getContext("2d").getImageData(0, 0, width, height);
    // Snapshot the selection SHAPE (lasso curve / marquee / object-select) once
    // per stroke so the brush clips to the true mask, not its bbox. null when
    // nothing is selected → paint freely. renderStrokeBatch scales coverage by
    // this alpha, and restores the pre-stroke pixel verbatim where cov ≤ 0, so
    // neither brush nor eraser touch anything outside the selection.
    selStrokeData = (selActive && selMaskCanvas)
      ? selMaskCanvas.getContext("2d").getImageData(0, 0, width, height).data
      : null;
    batchBox = null;
    strokeBox = null;
  }

  function dabCov(cx, cy, radius) {
    const lut = getFalloffLUT();
    // heal strokes are a MASK, not flow buildup — full-strength dabs
    const dabFlow = isHealTool() ? 1 : flow;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    if (x1 < x0 || y1 < y0) return;
    const inv = 1 / (radius * radius);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      const row = y * width;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const rr = (dx * dx + dy * dy) * inv;
        if (rr >= 1) continue;
        const a = lut[(rr * 1024) | 0] * dabFlow;
        const i = row + x;
        strokeCov[i] += a * (1 - strokeCov[i]);
      }
    }
    batchBox = batchBox
      ? { x0: Math.min(batchBox.x0, x0), y0: Math.min(batchBox.y0, y0),
          x1: Math.max(batchBox.x1, x1), y1: Math.max(batchBox.y1, y1) }
      : { x0, y0, x1, y1 };
    strokeBox = strokeBox
      ? { x0: Math.min(strokeBox.x0, x0), y0: Math.min(strokeBox.y0, y0),
          x1: Math.max(strokeBox.x1, x1), y1: Math.max(strokeBox.y1, y1) }
      : { x0, y0, x1, y1 };
  }

  // Per-pixel integer-hash white noise — deterministic per position, so
  // re-rendering the same coverage never shimmers. (Interleaved gradient
  // noise is built from a line gradient and its structure resolves into a
  // visible dot lattice under contrast boost; white noise has no pattern.)
  function dither(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5;
  }

  // Re-derive the batch region from pre-stroke state + cumulative coverage —
  // identical inputs render identical pixels (stable dither), so re-rendering
  // an already-painted region is idempotent. Pixels are written in the ACTIVE
  // layer's OWN straight-alpha space (Porter-Duff per tool), so transparency is
  // preserved; cov ≤ 0 restores pd verbatim, so the cutoff to untouched pixels
  // is seamless.
  function renderStrokeBatch() {
    if (!batchBox) return;
    const { x0, y0, x1, y1 } = batchBox;
    batchBox = null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const erase = tool === "eraser";
    const healMode = isHealTool(); // gray wash preview; the heal resolves at release
    // stamp clones source pixels verbatim, LIVE (no relighting → no solve)
    const stampMode = tool === "stamp" && healStrokeOffset;
    const odx = stampMode ? healStrokeOffset.dx : 0;
    const ody = stampMode ? healStrokeOffset.dy : 0;
    const ceil = healMode ? 1 : opacity; // per-stroke cap: flow is the rate, opacity the ceiling
    const [cr, cg, cb] = rgb;
    const img = new ImageData(bw, bh);
    const px = img.data;
    const pd = preStroke.data;
    for (let y = 0; y < bh; y++) {
      const row = (y0 + y) * width + x0;
      for (let x = 0; x < bw; x++) {
        const gi = row + x;
        let cov = Math.min(strokeCov[gi], ceil);
        if (selStrokeData) cov *= selStrokeData[gi * 4 + 3] / 255; // clip to the selection shape (feather-aware)
        const i = (y * bw + x) * 4;
        const j = gi * 4;
        if (cov <= 0) {
          px[i] = pd[j]; px[i + 1] = pd[j + 1]; px[i + 2] = pd[j + 2]; px[i + 3] = pd[j + 3];
          continue;
        }
        const pa = pd[j + 3] / 255;
        const d = dither(x0 + x, y0 + y);
        const sj = stampMode
          ? (Math.max(0, Math.min(height - 1, y0 + y + ody)) * width
            + Math.max(0, Math.min(width - 1, x0 + x + odx))) * 4
          : 0;
        const spa = stampMode ? pd[sj + 3] / 255 : 0;
        // Work in the ACTIVE layer's OWN straight-alpha pixels (pd), never the
        // backdrop, so a layer keeps its transparency and lower layers are not
        // baked in. Porter-Duff source-over per tool; alpha is set per-pixel, not
        // forced to 255. On a flat Background (pa = 1) this reduces to the old
        // opaque blend. (Stamp samples the layer's own offset pixels.)
        const se = spa * cov; // stamp: effective source coverage
        const na = healMode ? pa            // heal preview re-textures; alpha unchanged
          : erase ? pa * (1 - cov)          // eraser = destination-out on own alpha
          : stampMode ? se + pa * (1 - se)  // clone source-over
          : cov + pa * (1 - cov);           // brush source-over
        const naInv = na > 0 ? 1 / na : 0;
        for (let ch = 0; ch < 3; ch++) {
          const lc = pd[j + ch]; // the layer's own pre-stroke color
          const target = healMode
            ? lc * (1 - cov * 0.4) + 200 * cov * 0.4
            : erase
              ? lc // RGB stays; alpha carries the erase
              : stampMode
                ? (pd[sj + ch] * se + lc * pa * (1 - se)) * naInv
                : ((ch === 0 ? cr : ch === 1 ? cg : cb) * cov + lc * pa * (1 - cov)) * naInv;
          px[i + ch] = erase ? lc : Math.max(0, Math.min(255, Math.round(target + d)));
        }
        px[i + 3] = Math.max(0, Math.min(255, Math.round(na * 255)));
      }
    }
    paintCanvas.getContext("2d").putImageData(img, x0, y0);
    if (hasCustomBlend) customTick++; // refresh the single-canvas custom-blend composite mid-stroke
  }

  // Stamp every ~15% of radius along the segment; the residual carries across
  // segments so spacing stays even on fast strokes (no dotted line).
  // Airbrush: timed dabs while the button is held (libmypaint's dabs_per_second
  // term) — rAF loop gated on the active stroke, with fractional carry so dab
  // emission is smooth across frames and a dt clamp so a stalled frame can't
  // dump a burst of paint.
  const AIRBRUSH_DABS_PER_SEC = 30;
  let airRafId = 0;
  let airLastTs = 0;
  let airResidual = 0;

  function airbrushLoop(ts) {
    if (!painting) return;
    const dt = Math.min(0.25, Math.max(0, (ts - airLastTs) / 1000));
    airLastTs = ts;
    if (airbrush && lastPt) {
      airResidual += dt * AIRBRUSH_DABS_PER_SEC;
      const radius = Math.max(0.5, brushSize / 2);
      let fired = false;
      while (airResidual >= 1) {
        dabCov(lastPt.x, lastPt.y, radius);
        airResidual -= 1;
        fired = true;
      }
      if (fired) renderStrokeBatch();
    }
    airRafId = requestAnimationFrame(airbrushLoop);
  }

  function stampSegment(from, to) {
    const radius = Math.max(0.5, brushSize / 2);
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(0.5, radius * 0.15);
    if (dist === 0) {
      dabCov(to.x, to.y, radius);
    } else {
      let t = strokeResidual;
      while (t <= dist) {
        const f = t / dist;
        dabCov(from.x + dx * f, from.y + dy * f, radius);
        t += step;
      }
      strokeResidual = t - dist;
    }
    renderStrokeBatch();
  }

  function initPaint() {
    patch = null;
    selRect = null;
    selMaskCanvas = null; selBBox = null; selActive = false; selVersion++;
    paintCanvas?.getContext("2d")?.clearRect(0, 0, width, height);
    blankSnap = null;
    strokeCov = null;
    nextLayerNum = 0;
    // Open with just a Background layer (the photo itself). Its bitmap stays
    // null until edited; drawLayerContent falls back to the source <img>.
    layers = [{ id: 0, name: "Background", visible: true, opacity: 1, bitmap: null, isBackground: true }];
    activeIndex = 0;
    selectedIds = [0];
    layerMenu = null;
    layerCanvasEls = [];
    history = [{ label: "Open", layers: [...layers], activeIndex: 0, selectedIds: [0], url: sourceUrl, w: width, h: height }];
    histIndex = 0;
    requestAnimationFrame(() => loadActiveBitmap());
  }

  // ── layer-stack persistence ("don't-flatten = keep your PSD") ──
  // On open, restore the saved layer stack for this image's hash; on save, write
  // it back as a sidecar (see core/edit_api.py). The flat PNG is always the
  // source of truth — restore is a 404-fast convenience.
  async function restoreOrInit() {
    let doc = null;
    if (editDocHash && fetchApi) {
      try {
        const res = await fetchApi(`/promptchain/edit-doc/${editDocHash}`);
        if (res.ok) doc = await res.json();
      } catch (e) { doc = null; }
    }
    if (doc?.layers?.length && doc.w === width && doc.h === height) {
      restoring = true;
      try { await restoreLayerDoc(doc, editDocHash); }
      finally { restoring = false; }
    } else {
      initPaint();
    }
  }

  async function loadPlane(hash, file) {
    try {
      const res = await fetchApi(`/promptchain/edit-doc/${hash}/${file}`);
      if (!res.ok) return null;
      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const cx = c.getContext("2d");
      cx.drawImage(bmp, 0, 0);
      return cx.getImageData(0, 0, bmp.width, bmp.height);
    } catch (e) { return null; }
  }

  async function restoreLayerDoc(doc, hash) {
    patch = null; selRect = null;
    selMaskCanvas = null; selBBox = null; selActive = false; selVersion++;
    paintCanvas?.getContext("2d")?.clearRect(0, 0, width, height);
    blankSnap = null; strokeCov = null; layerMenu = null; layerCanvasEls = [];
    const rebuilt = [];
    let maxId = 0;
    for (const m of doc.layers) {
      const L = { id: m.id, name: m.name, visible: m.visible !== false, opacity: m.opacity ?? 1 };
      if (m.blend) L.blend = m.blend;
      if (m.ox) L.ox = m.ox;
      if (m.oy) L.oy = m.oy;
      if (m.is_background) L.isBackground = true;
      if (m.source_rect) L.sourceRect = m.source_rect;
      L.bitmap = m.bitmap ? await loadPlane(hash, m.bitmap) : null;
      if (m.mask) {
        const md = await loadPlane(hash, m.mask);
        if (md) {
          L.mask = md;
          const mc = document.createElement("canvas");
          mc.width = md.width; mc.height = md.height;
          mc.getContext("2d").putImageData(md, 0, 0);
          L.maskUrl = mc.toDataURL();
        }
      }
      rebuilt.push(L);
      maxId = Math.max(maxId, m.id || 0);
    }
    if (!rebuilt.length) { initPaint(); return; }
    layers = rebuilt;
    nextLayerNum = maxId;
    activeIndex = Math.min(Math.max(0, doc.active_index ?? 0), rebuilt.length - 1);
    selectedIds = [layers[activeIndex].id];
    history = [{ label: "Open", layers: [...layers], activeIndex, selectedIds: [...selectedIds], url: sourceUrl, w: width, h: height }];
    histIndex = 0;
    requestAnimationFrame(() => loadActiveBitmap());
  }

  function encodeImageData(imageData) {
    const c = document.createElement("canvas");
    c.width = imageData.width; c.height = imageData.height;
    c.getContext("2d").putImageData(imageData, 0, 0);
    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }

  // Snapshot the layer stack into a manifest + per-layer/mask ImageData. Only a
  // genuine multi-layer stack is persisted — a single layer IS the flat PNG, so
  // there's nothing to reconstruct. The Background's ORIGINAL pixels are always
  // stored: the saved flat image is the COMPOSITE, so rehydrating the base from
  // it on reopen would double-paint every layer above.
  function packLayerDoc(force = false) {
    flushActive();
    if (!force && layers.length <= 1) return null; // a single layer IS the flat PNG — unless we're forcing a sidecar-only "Save edits"
    const planes = [];
    const manifestLayers = layers.map((L) => {
      let bitmap = L.bitmap;
      if (!bitmap && L.isBackground && imgEl) { // materialize the original base from the source img
        const c = document.createElement("canvas"); c.width = width; c.height = height;
        const cx = c.getContext("2d"); cx.drawImage(imgEl, 0, 0, width, height);
        bitmap = cx.getImageData(0, 0, width, height);
      }
      const m = { id: L.id, name: L.name, visible: L.visible, opacity: L.opacity };
      if (L.blend) m.blend = L.blend;
      if (L.ox) m.ox = L.ox;
      if (L.oy) m.oy = L.oy;
      if (L.isBackground) m.is_background = true;
      if (L.sourceRect) m.source_rect = L.sourceRect;
      if (bitmap) { const name = `L${L.id}.png`; m.bitmap = name; planes.push({ name, data: bitmap }); }
      else m.bitmap = null;
      if (L.mask) { const name = `L${L.id}.mask.png`; m.mask = name; planes.push({ name, data: L.mask }); }
      return m;
    });
    return { manifest: { v: 1, image_hash: "", w: width, h: height, active_index: activeIndex, layers: manifestLayers }, planes };
  }

  // Async sidecar write — off the save critical path (the flat PNG already
  // saved); a failure is non-fatal. `packed` is snapshotted before close().
  async function persistDoc(hash, packed) {
    if (!hash || !packed || !fetchApi) return false;
    try {
      const form = new FormData();
      packed.manifest.image_hash = hash;
      form.append("manifest", JSON.stringify(packed.manifest));
      for (const { name, data } of packed.planes) {
        const blob = await encodeImageData(data);
        if (blob) form.append(name, new File([blob], name, { type: "image/png" }));
      }
      const res = await fetchApi(`/promptchain/edit-doc/${hash}`, { method: "POST", body: form });
      return !!res?.ok;
    } catch (e) {
      console.warn("[PromptChain] edit-doc persist failed", e);
      return false;
    }
  }

  // Flattened (or single-layer) save → remove any prior sidecar for this hash so
  // the file is truly flat. Flatten keeps the same pixels → same hash, so without
  // this an old layer stack would survive a flatten-and-save.
  async function clearDoc(hash) {
    if (!hash || !fetchApi) return;
    try { await fetchApi(`/promptchain/edit-doc/${hash}`, { method: "DELETE" }); }
    catch (e) { /* non-fatal — the flat PNG is the source of truth */ }
  }

  // ── layer helpers ──
  const activeLayer = () => layers[activeIndex] || layers[0];
  // Lightweight layer groups: a layer's groupId points at a groups[] entry; the
  // group's visibility/opacity fold into each member's effective render. Members
  // are kept contiguous in the flat array so the panel can show them under a header.
  const groupById = (gid) => (gid ? groups.find((g) => g.id === gid) : null);
  const layerShown = (L) => !!L?.visible && groupById(L?.groupId)?.visible !== false;
  const layerEffOpacity = (L) => (L?.opacity ?? 1) * (groupById(L?.groupId)?.opacity ?? 1);
  // Panel display rows, top-to-bottom: a group header before its members; a
  // collapsed group hides its member rows. Ungrouped layers pass through.
  let panelRows = $derived.by(() => {
    const rows = [];
    const seen = new Set();
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      const g = groupById(L.groupId);
      if (g && !seen.has(g.id)) { seen.add(g.id); rows.push({ type: "group", group: g }); }
      if (g && g.collapsed) continue;
      rows.push({ type: "layer", L, i, inGroup: !!g });
    }
    return rows;
  });
  function groupSelected() {
    const ids = selectedIds.filter((id) => { const L = layers.find((x) => x.id === id); return L && !L.isBackground; });
    if (!ids.length) return;
    flushActive();
    const gid = ++nextGroupNum;
    const members = layers.filter((L) => ids.includes(L.id)).map((L) => ({ ...L, groupId: gid }));
    const rest = layers.filter((L) => !ids.includes(L.id));
    const topSelIdx = Math.max(...layers.map((L, i) => (ids.includes(L.id) ? i : -1)));
    let insertAt = 0;
    for (let i = 0; i < topSelIdx; i++) if (!ids.includes(layers[i].id)) insertAt++;
    const activeId = layers[activeIndex]?.id;
    groups = [...groups, { id: gid, name: `Group ${gid}`, collapsed: false, visible: true, opacity: 1 }];
    layers = [...rest.slice(0, insertAt), ...members, ...rest.slice(insertAt)];
    activeIndex = Math.max(0, layers.findIndex((L) => L.id === activeId));
    selectedIds = members.map((L) => L.id);
    loadActiveBitmap();
    commitAction("Group Layers");
  }
  function ungroup(gid) {
    if (!groups.some((g) => g.id === gid)) return;
    flushActive();
    layers = layers.map((L) => (L.groupId === gid ? { ...L, groupId: undefined } : L));
    groups = groups.filter((g) => g.id !== gid);
    commitAction("Ungroup");
  }
  function toggleGroupCollapsed(gid) { groups = groups.map((g) => (g.id === gid ? { ...g, collapsed: !g.collapsed } : g)); } // view-only, no history
  function setGroupVisible(gid, v) { groups = groups.map((g) => (g.id === gid ? { ...g, visible: v } : g)); commitAction("Group Visibility"); }
  function setGroupOpacity(gid, o) { groups = groups.map((g) => (g.id === gid ? { ...g, opacity: o } : g)); } // commit on release (slider onchange)
  function startGroupRename(g) { renamingGroupId = g.id; renameText = g.name; }
  function commitGroupRename() {
    if (renamingGroupId == null) return;
    const gid = renamingGroupId; renamingGroupId = null;
    const name = renameText.trim();
    if (name) { groups = groups.map((g) => (g.id === gid ? { ...g, name } : g)); commitAction("Rename Group"); }
  }

  // Photoshop refuses to edit a hidden layer — you'd be changing pixels you
  // can't see (the active layer's canvas is display:none while hidden). On a
  // blocked attempt we pop Photoshop's exact modal; the cursor turns
  // not-allowed on hover (see hiddenEditBlocked). Every path that writes to the
  // active layer's pixels guards on this first.
  let hiddenEditDialog = $state(null); // PS "target layer is hidden" modal text, or null
  // PS phrasing per op: tools → "Could not use the <name> because…", filters/
  // commands → "Could not complete the <X> command because…", a bare clear →
  // the generic request form. The suffix is always "the target layer is hidden."
  const HIDDEN_EDIT_MSG = {
    brush: "Could not use the brush tool because the target layer is hidden.",
    eraser: "Could not use the eraser because the target layer is hidden.",
    bucket: "Could not use the paint bucket because the target layer is hidden.",
    smooth: "Could not use the blur tool because the target layer is hidden.",
    spot: "Could not use the spot healing brush because the target layer is hidden.",
    heal: "Could not use the healing brush because the target layer is hidden.",
    stamp: "Could not use the clone stamp because the target layer is hidden.",
    liquify: "Could not complete the Liquify command because the target layer is hidden.",
    move: "Could not use the move tool because the target layer is hidden.",
    adjust: "Could not complete the Camera Raw Filter command because the target layer is hidden.",
    transform: "Could not complete the Free Transform command because the target layer is hidden.",
    fill: "Could not complete the Fill command because the target layer is hidden.",
    clear: "Could not complete your request because the target layer is hidden.",
  };
  function blockHiddenEdit(opKey) {
    if (activeLayer()?.visible !== false) return false;
    hiddenEditDialog = HIDDEN_EDIT_MSG[opKey] || HIDDEN_EDIT_MSG.clear;
    return true;
  }

  // The live paint canvas with the active layer's mask applied (composite
  // view); the paintCanvas itself stays raw so editing under the mask works.
  function activeMaskedCanvas() {
    const L = activeLayer();
    // In mask-edit, paintCanvas holds the grayscale MASK, not the layer's pixels.
    // Composite/flatten/save/merge must render from the stored bitmap+mask instead,
    // or the gray would bake into the output. Callers flushActive() first, so L is current.
    if (maskEdit && L?.mask) return maskedRenderCanvas(L);
    if (!L?.mask) return paintCanvas;
    const t = document.createElement("canvas");
    t.width = width; t.height = height;
    const tctx = t.getContext("2d");
    tctx.drawImage(paintCanvas, 0, 0);
    const m = document.createElement("canvas");
    m.width = width; m.height = height;
    m.getContext("2d").putImageData(L.mask, 0, 0);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(m, L.ox || 0, L.oy || 0);
    tctx.globalCompositeOperation = "source-over";
    return t;
  }

  // Masked layer render (doc space), cached per layer OBJECT — layers are
  // replaced rather than mutated on every change, so the WeakMap
  // self-invalidates. The mask is stored in CONTENT space and rides the
  // layer's ox/oy (Photoshop's linked-mask behavior).
  const maskedRenderCache = new WeakMap();
  function maskedRenderCanvas(L) {
    let c = maskedRenderCache.get(L);
    if (c && c.width === width && c.height === height) return c;
    c = document.createElement("canvas");
    c.width = width; c.height = height;
    const ctx = c.getContext("2d");
    const ox = L.ox || 0, oy = L.oy || 0;
    if (L.bitmap && L.bitmap.width === width && L.bitmap.height === height) {
      const t = document.createElement("canvas");
      t.width = width; t.height = height;
      t.getContext("2d").putImageData(L.bitmap, 0, 0);
      ctx.drawImage(t, ox, oy);
    } else if (L.isBackground && imgEl) {
      ctx.drawImage(imgEl, ox, oy, width, height);
    }
    if (L.mask && L.mask.width === width && L.mask.height === height) {
      const m = document.createElement("canvas");
      m.width = width; m.height = height;
      m.getContext("2d").putImageData(L.mask, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(m, ox, oy);
      ctx.globalCompositeOperation = "source-over";
    }
    maskedRenderCache.set(L, c);
    return c;
  }

  // Raw layer pixels (no mask) — what the active layer loads for editing.
  // Per-layer offset (non-destructive move) shifts where the layer is drawn;
  // the bitmap itself is never re-clipped, so moving off-canvas and back is lossless.
  function drawLayerRaw(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh) {
    const ox = L.ox || 0, oy = L.oy || 0;
    if (L.bitmap && L.bitmap.width === width && L.bitmap.height === height) {
      const t = document.createElement("canvas");
      t.width = width; t.height = height;
      t.getContext("2d").putImageData(L.bitmap, 0, 0);
      ctx.drawImage(t, sx, sy, sw, sh, dx + ox, dy + oy, dw, dh);
    } else if (L.isBackground && imgEl) {
      ctx.drawImage(imgEl, sx, sy, sw, sh, dx + ox, dy + oy, dw, dh);
    }
  }
  // Draw a layer's pixels onto ctx. An unedited Background (no bitmap) falls
  // back to the source <img>, so the photo IS the Background layer.
  // NOTE: this is the COMPOSITE view (mask applied). loadActiveBitmap loads
  // raw content instead, or activating a masked layer would bake the mask.
  function drawLayerContent(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (L.mask) {
      // the masked render is already offset into doc space
      ctx.drawImage(maskedRenderCanvas(L), sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    drawLayerRaw(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // Persist the live canvas (active layer) back into its stored bitmap.
  function flushActive() {
    if (!paintCanvas || !layers[activeIndex]) return;
    const L = layers[activeIndex];
    const ox = L.ox || 0, oy = L.oy || 0;
    if (maskEdit) {
      if (!L.mask) return;
      // Content-space gray = existing mask, with the on-canvas window replaced by
      // the freshly-painted paintCanvas (un-offset). Mirrors the bitmap offset path.
      const gray = document.createElement("canvas"); gray.width = width; gray.height = height;
      const gx = gray.getContext("2d");
      gx.drawImage(maskToGrayCanvas(L.mask), 0, 0);
      gx.clearRect(-ox, -oy, width, height);
      gx.drawImage(paintCanvas, -ox, -oy);
      writeLayerMask(activeIndex, grayToMaskImageData(gx.getImageData(0, 0, width, height)));
      return;
    }
    if (!ox && !oy) {
      layers[activeIndex] = { ...L, bitmap: paintCanvas.getContext("2d").getImageData(0, 0, width, height) };
      return;
    }
    // Offset layer: keep the full bitmap (incl. off-canvas), update only the
    // on-canvas window from the current paintCanvas (un-offset). The bitmap is
    // never clipped, so the moved-off content survives.
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const cx = c.getContext("2d");
    if (L.bitmap) cx.putImageData(L.bitmap, 0, 0);
    cx.clearRect(-ox, -oy, width, height);
    cx.drawImage(paintCanvas, -ox, -oy);
    layers[activeIndex] = { ...L, bitmap: cx.getImageData(0, 0, width, height) };
  }
  // Load a layer's stored bitmap onto the live canvas — RAW content; the
  // layer mask stays non-destructive (applied as CSS mask on the element).
  function loadActiveBitmap() {
    const ctx = paintCanvas?.getContext("2d");
    if (!ctx) return;
    const L = layers[activeIndex];
    if (maskEdit && !L?.mask) maskEdit = false; // active layer has no mask → leave mask-edit (safety net)
    ctx.clearRect(0, 0, width, height);
    if (!L) return;
    if (maskEdit && L.mask) { ctx.drawImage(maskToGrayCanvas(L.mask), L.ox || 0, L.oy || 0); return; }
    drawLayerRaw(ctx, L, 0, 0, width, height, 0, 0, width, height);
  }
  function selectLayer(i) {
    if (i < 0 || i >= layers.length || painting) return;
    if (i === activeIndex) return;
    if (maskEdit) exitMaskEdit(); // clicking another layer targets its pixels, not a mask
    // Resolve a live Free-Transform/patch float onto its OWN (still-current) layer
    // before switching, matching Photoshop's auto-apply — otherwise the float would
    // bake into the wrong layer and the source layer commits erased (data loss).
    commitPatch();
    flushActive();
    activeIndex = i;
    loadActiveBitmap();
  }
  // Click a layer row, honoring Ctrl (toggle into the multi-selection) and
  // Shift (range). Plain click = single. The clicked layer becomes active.
  function clickLayer(i, e) {
    const id = layers[i].id;
    if ((e.ctrlKey || e.metaKey) && selectedIds.length) {
      if (selectedIds.includes(id)) {
        // Ctrl-click an already-selected layer toggles it OFF (PS) — but never empty
        // the selection; if it was the active layer, hand active to a survivor.
        if (selectedIds.length > 1) {
          selectedIds = selectedIds.filter((x) => x !== id);
          if (id === layers[activeIndex]?.id) {
            const s = layers.findIndex((L) => selectedIds.includes(L.id));
            if (s >= 0) selectLayer(s);
          }
        }
        return; // the ctrl-clicked (now-deselected) layer does not become active
      }
      selectedIds = [...selectedIds, id];
    } else if (e.shiftKey && selectedIds.length) {
      const lo = Math.min(activeIndex, i), hi = Math.max(activeIndex, i);
      selectedIds = layers.slice(lo, hi + 1).map((L) => L.id);
    } else {
      selectedIds = [id];
    }
    selectLayer(i);
    if (!selectedIds.includes(id)) selectedIds = [...selectedIds, id];
  }
  // New layer directly ABOVE `at` (the active layer by default) — Photoshop
  // places it above the selected layer, not at the top of the stack.
  function addLayer(at = activeIndex) {
    if (painting) return;
    flushActive();
    const id = ++nextLayerNum;
    layers = [...layers.slice(0, at + 1),
      { id, name: `Layer ${id}`, visible: true, opacity: 1, bitmap: null, groupId: layers[at]?.groupId },
      ...layers.slice(at + 1)];
    activeIndex = at + 1;
    selectedIds = [id];
    loadActiveBitmap(); // empty
    commitAction("New Layer"); // discrete undoable step; keeps history in sync with the live layers
  }
  // True when the multi-selection has at least one deletable (non-Background) layer.
  function canDeleteSelected() {
    return layers.length > 1 && layers.some((L) => selectedIds.includes(L.id) && !L.isBackground);
  }
  // Delete every selected layer at once (the Background is undeletable, never leave
  // zero layers). One history entry; re-homes the active layer to a survivor.
  function deleteSelectedLayers() {
    if (painting) return;
    const doomedIds = new Set(layers.filter((L) => selectedIds.includes(L.id) && !L.isBackground).map((L) => L.id));
    if (!doomedIds.size || layers.length - doomedIds.size < 1) return;
    const activeId = layers[activeIndex]?.id;
    if (!doomedIds.has(activeId)) flushActive(); // preserve a surviving active layer's live edits
    let na = 0;
    for (let k = 0; k < activeIndex; k++) if (!doomedIds.has(layers[k].id)) na++; // survivors below the old active
    const survivors = layers.filter((L) => !doomedIds.has(L.id));
    layers = survivors;
    groups = groups.filter((g) => layers.some((L) => L.groupId === g.id));
    activeIndex = Math.min(na, survivors.length - 1);
    selectedIds = [layers[activeIndex]?.id].filter((x) => x != null);
    loadActiveBitmap();
    commitAction(doomedIds.size > 1 ? "Delete Layers" : "Delete Layer");
  }
  function duplicateLayer(i) {
    if (painting) return;
    flushActive();
    const src = layers[i];
    const id = ++nextLayerNum;
    let bitmap = src.bitmap;
    if (!bitmap && src.isBackground && imgEl) { // materialize the background photo
      const c = document.createElement("canvas"); c.width = width; c.height = height;
      c.getContext("2d").drawImage(imgEl, 0, 0, width, height);
      bitmap = c.getContext("2d").getImageData(0, 0, width, height);
    }
    layers = [...layers.slice(0, i + 1),
      { id, name: `${src.name} copy`, visible: true, opacity: src.opacity, blend: src.blend, ox: src.ox, oy: src.oy, mask: src.mask, maskUrl: src.maskUrl, sourceRect: src.sourceRect, groupId: src.groupId, bitmap },
      ...layers.slice(i + 1)];
    activeIndex = i + 1;
    selectedIds = [id];
    loadActiveBitmap();
    commitAction("Duplicate Layer");
  }
  function setLayerVisible(i, v) { layers[i] = { ...layers[i], visible: v }; commitAction("Visibility"); }
  // Opacity drags fire on every tick — mutate in place for the live preview and
  // commit ONCE on release (see the slider's onpointerdown/onchange) so the
  // change is undoable and dirties the doc without flooding the history ring.
  let opacityDragStart = null;
  function setLayerOpacity(i, o) { if (layers[i].opacity === o) return; layers[i] = { ...layers[i], opacity: o }; }

  // Blend modes — CSS mix-blend-mode keywords double as canvas
  // globalCompositeOperation names, so the live stacked-canvas view and every
  // flatten/merge path blend identically.
  const BLEND_MODES = [
    ["normal", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"],
    ["overlay", "Overlay"], ["darken", "Darken"], ["lighten", "Lighten"],
    ["color-dodge", "Color Dodge"], ["color-burn", "Color Burn"],
    ["linear-dodge", "Linear Dodge (Add)"], ["subtract", "Subtract"], ["divide", "Divide"],
    ["hard-light", "Hard Light"], ["soft-light", "Soft Light"],
    ["vivid-light", "Vivid Light"], ["linear-light", "Linear Light"], ["pin-light", "Pin Light"], ["hard-mix", "Hard Mix"],
    ["difference", "Difference"], ["exclusion", "Exclusion"],
    ["hue", "Hue"], ["saturation", "Saturation"], ["color", "Color"], ["luminosity", "Luminosity"],
    ["darker-color", "Darker Color"], ["lighter-color", "Lighter Color"],
  ];
  // Modes the browser supports in BOTH CSS mix-blend-mode and canvas
  // globalCompositeOperation render via the fast DOM-stacked path. The rest
  // (Photoshop modes the web APIs lack) need a hand-written per-pixel blend and
  // are composited through a single canvas (see drawFlattened / the customEl effect).
  const CUSTOM_BLENDS = new Set(["linear-dodge", "subtract", "divide", "vivid-light", "linear-light", "pin-light", "hard-mix", "darker-color", "lighter-color"]);
  const isCustomBlend = (b) => CUSTOM_BLENDS.has(b);
  // Custom path is active only when a VISIBLE layer actually uses a custom mode —
  // native-mode editing keeps the fast DOM-stacked compositing untouched.
  let hasCustomBlend = $derived(layers.some((L) => layerShown(L) && isCustomBlend(L.blend)));
  let customTick = $state(0); // bumped after a paint dab so the single-canvas composite refreshes live
  // Per-channel blend math (b = base, s = source, 0..1). darker/lighter-color are
  // non-separable and handled in the pixel loop.
  function blendChannel(mode, b, s) {
    switch (mode) {
      case "linear-dodge": return Math.min(1, b + s);
      case "subtract": return Math.max(0, b - s);
      case "divide": return s <= 0 ? 1 : Math.min(1, b / s);
      case "linear-light": return Math.max(0, Math.min(1, b + 2 * s - 1));
      case "pin-light": return s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1);
      case "vivid-light":
        if (s <= 0.5) { const d = 2 * s; return d <= 0 ? 0 : Math.max(0, 1 - (1 - b) / d); }
        { const d = 2 * (1 - s); return d <= 0 ? 1 : Math.min(1, b / d); }
      case "hard-mix": {
        let v; if (s <= 0.5) { const d = 2 * s; v = d <= 0 ? 0 : Math.max(0, 1 - (1 - b) / d); }
        else { const d = 2 * (1 - s); v = d <= 0 ? 1 : Math.min(1, b / d); }
        return v < 0.5 ? 0 : 1;
      }
      default: return s;
    }
  }
  const layerBlendCss = (L) => (L?.blend && L.blend !== "normal" && !isCustomBlend(L.blend) ? L.blend : null);
  function setLayerBlend(i, blend) {
    layers[i] = { ...layers[i], blend: blend === "normal" ? undefined : blend };
    commitAction("Blend Mode");
  }
  // ── layer masks (non-destructive, from the selection) ──
  function addLayerMask(i) {
    const L0 = layers[i];
    if (!L0 || L0.isBackground) return;
    if (i === activeIndex) flushActive();
    const L = layers[i]; // flush replaced the object
    const ox = L.ox || 0, oy = L.oy || 0;
    const m = document.createElement("canvas");
    m.width = width; m.height = height;
    const mctx = m.getContext("2d");
    if (selActive && selMaskCanvas) {
      // selection is doc-space; the mask lives in content space and rides ox/oy
      mctx.drawImage(selMaskCanvas, -ox, -oy);
    } else {
      mctx.fillStyle = "#fff"; mctx.fillRect(0, 0, width, height); // reveal all
    }
    layers[i] = { ...L, mask: mctx.getImageData(0, 0, width, height), maskUrl: m.toDataURL() };
    if (selActive) deselect(); // PS consumes the selection into the mask
    commitAction("Add Layer Mask");
  }
  function applyLayerMask(i) {
    if (i === activeIndex) flushActive();
    const L = layers[i];
    if (!L?.mask) return;
    const t = document.createElement("canvas");
    t.width = width; t.height = height;
    const tctx = t.getContext("2d");
    if (L.bitmap) tctx.putImageData(L.bitmap, 0, 0);
    const m = document.createElement("canvas");
    m.width = width; m.height = height;
    m.getContext("2d").putImageData(L.mask, 0, 0);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(m, 0, 0); // both content-space — no offset
    tctx.globalCompositeOperation = "source-over";
    layers[i] = { ...L, bitmap: tctx.getImageData(0, 0, width, height), mask: undefined, maskUrl: undefined };
    if (i === activeIndex) loadActiveBitmap();
    commitAction("Apply Layer Mask");
  }
  function deleteLayerMask(i) {
    if (!layers[i]?.mask) return;
    if (maskEdit && i === activeIndex) maskEdit = false;
    layers[i] = { ...layers[i], mask: undefined, maskUrl: undefined };
    if (i === activeIndex) loadActiveBitmap();
    commitAction("Delete Layer Mask");
  }

  // ── editing a layer mask by painting (#3) ──
  // The mask is stored white-RGB / alpha=visibility. To reuse the whole brush
  // engine, mask-edit mode shows the mask on paintCanvas as opaque GRAYSCALE
  // (white = revealed) and routes flushActive/loadActiveBitmap to the mask; the
  // brush/eraser/fill/smooth then "just work" (paint white to reveal, black to
  // hide). Conversions are content-space; the doc-space offset rides ox/oy.
  function maskToGrayCanvas(mask) {
    const c = document.createElement("canvas"); c.width = width; c.height = height;
    const ctx = c.getContext("2d");
    if (mask) {
      const g = new ImageData(width, height), d = g.data, m = mask.data;
      for (let i = 0; i < d.length; i += 4) { const v = m[i + 3]; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
      ctx.putImageData(g, 0, 0);
    } else { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); }
    return c;
  }
  function grayToMaskImageData(gray) {
    const s = gray.data, out = new ImageData(width, height), d = out.data;
    for (let i = 0; i < s.length; i += 4) {
      const lum = s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.round(lum * (s[i + 3] / 255)); // erased (alpha 0) → hidden; white → revealed
    }
    return out;
  }
  function writeLayerMask(i, maskId) {
    const mc = document.createElement("canvas"); mc.width = width; mc.height = height;
    mc.getContext("2d").putImageData(maskId, 0, 0);
    layers[i] = { ...layers[i], mask: maskId, maskUrl: mc.toDataURL() };
  }
  function enterMaskEdit(i = activeIndex) {
    if (i !== activeIndex) selectLayer(i);
    if (!layers[activeIndex]?.mask || maskEdit || painting) return;
    flushActive();          // maskEdit false here → saves the layer's pixels
    maskEdit = true;
    hue = 0; sat = 0; val = 1; // default to white = reveal (X/D still work)
    loadActiveBitmap();     // maskEdit true → loads the mask as grayscale
  }
  function exitMaskEdit() {
    if (!maskEdit) return;
    flushActive();          // maskEdit true → saves the grayscale back as the mask
    maskEdit = false;
    loadActiveBitmap();     // loads the layer's pixels
  }
  function toggleMaskEdit(i) { if (maskEdit && i === activeIndex) exitMaskEdit(); else enterMaskEdit(i); }
  function invertLayerMask(i) {
    if (!layers[i]?.mask) return;
    if (maskEdit && i === activeIndex) flushActive(); // pull live paint into the mask first
    const m = layers[i].mask, inv = new ImageData(width, height), d = inv.data, s = m.data;
    for (let k = 0; k < d.length; k += 4) { d[k] = 255; d[k + 1] = 255; d[k + 2] = 255; d[k + 3] = 255 - s[k + 3]; }
    writeLayerMask(i, inv);
    if (maskEdit && i === activeIndex) loadActiveBitmap();
    commitAction("Invert Mask");
  }
  function fillLayerMask(i, vis) { // vis 255 = Reveal All, 0 = Hide All
    if (!layers[i]?.mask) return;
    const fill = new ImageData(width, height), d = fill.data;
    for (let k = 0; k < d.length; k += 4) { d[k] = 255; d[k + 1] = 255; d[k + 2] = 255; d[k + 3] = vis; }
    writeLayerMask(i, fill);
    if (maskEdit && i === activeIndex) loadActiveBitmap();
    commitAction(vis ? "Reveal All" : "Hide All");
  }

  function startRename(L) { renamingId = L.id; renameText = L.name; }
  function commitRename() {
    const i = layers.findIndex((L) => L.id === renamingId);
    const name = renameText.trim();
    if (i >= 0 && name && name !== layers[i].name) { layers[i] = { ...layers[i], name }; commitAction("Rename Layer"); }
    renamingId = null;
  }

  // Reorder: drop the dragged layer at the target row's position. Background
  // stays pinned at the bottom (index 0).
  function dropLayer(targetId) {
    dragOverId = null;
    if (dragId == null || dragId === targetId) { dragId = null; return; }
    const moved = layers.find((L) => L.id === dragId);
    if (!moved || moved.isBackground) { dragId = null; return; }
    flushActive();
    const activeId = layers[activeIndex].id;
    const rest = layers.filter((L) => L.id !== dragId);
    const ti = rest.findIndex((L) => L.id === targetId);
    // Insert ABOVE the target (matches the top-border drop line); dropping on the
    // topmost row lands at the very top.
    let at = ti < 0 ? rest.length : ti + 1;
    if (at < 1) at = 1; // never below Background
    // Dropping onto a row inside a group joins that group; otherwise the layer
    // leaves any group it was in. Then drop any group left with no members.
    const targetGroupId = rest[ti]?.groupId;
    rest.splice(at, 0, { ...moved, groupId: targetGroupId });
    layers = rest;
    groups = groups.filter((g) => layers.some((L) => L.groupId === g.id));
    activeIndex = layers.findIndex((L) => L.id === activeId);
    dragId = null;
    commitAction("Reorder Layers");
  }

  // Hand-written per-pixel composite of srcCanvas onto ctx using a Photoshop
  // blend the web APIs lack (CSS mix-blend-mode + canvas globalCompositeOperation
  // both miss these). Shared by every full-frame composite path so live preview,
  // merge, flatten and export all blend identically. Uses the W3C
  // source-over-with-blend formula (Cs' = (1-αb)·Cs + αb·B(Cb,Cs)) so a custom
  // layer over a transparent/partial backdrop shows the source, not black.
  function blendLayerFull(ctx, srcCanvas, mode, eff) {
    const baseImg = ctx.getImageData(0, 0, width, height);
    const srcImg = srcCanvas.getContext("2d").getImageData(0, 0, width, height);
    const bd = baseImg.data, sd = srcImg.data;
    const sep = mode !== "darker-color" && mode !== "lighter-color";
    for (let p = 0; p < bd.length; p += 4) {
      const sa = (sd[p + 3] / 255) * eff;
      if (sa <= 0) continue;
      const br = bd[p] / 255, bg = bd[p + 1] / 255, bb = bd[p + 2] / 255;
      const sr = sd[p] / 255, sg = sd[p + 1] / 255, sbb = sd[p + 2] / 255;
      let rr, rg, rb;
      if (sep) { rr = blendChannel(mode, br, sr); rg = blendChannel(mode, bg, sg); rb = blendChannel(mode, bb, sbb); }
      else {
        const lb = 0.299 * br + 0.587 * bg + 0.114 * bb, ls = 0.299 * sr + 0.587 * sg + 0.114 * sbb;
        const keepBase = mode === "darker-color" ? lb <= ls : lb >= ls;
        rr = keepBase ? br : sr; rg = keepBase ? bg : sg; rb = keepBase ? bb : sbb;
      }
      const ba = bd[p + 3] / 255, oa = sa + ba * (1 - sa), inv = oa > 0 ? 1 / oa : 0;
      const cr = (1 - ba) * sr + ba * rr, cg = (1 - ba) * sg + ba * rg, cb2 = (1 - ba) * sbb + ba * rb;
      bd[p] = Math.round((cr * sa + br * ba * (1 - sa)) * inv * 255);
      bd[p + 1] = Math.round((cg * sa + bg * ba * (1 - sa)) * inv * 255);
      bd[p + 2] = Math.round((cb2 * sa + bb * ba * (1 - sa)) * inv * 255);
      bd[p + 3] = Math.round(oa * 255);
    }
    ctx.putImageData(baseImg, 0, 0);
  }
  // Render the active or an inactive layer's full-frame pixels onto a fresh
  // canvas (active rides the live paintCanvas + mask). Source for blendLayerFull.
  function layerFullCanvas(L, isActive) {
    const tmp = document.createElement("canvas");
    tmp.width = width; tmp.height = height;
    if (isActive) tmp.getContext("2d").drawImage(activeMaskedCanvas(), 0, 0);
    else drawLayerContent(tmp.getContext("2d"), L, 0, 0, width, height, 0, 0, width, height);
    return tmp;
  }
  // Composite a set of layer indices (z-order) into one ImageData.
  function compositeLayers(idxs) {
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const ctx = c.getContext("2d");
    for (const i of idxs) {
      const L = layers[i];
      if (!layerShown(L)) continue;
      const eff = layerEffOpacity(L);
      if (isCustomBlend(L.blend)) {
        blendLayerFull(ctx, layerFullCanvas(L, i === activeIndex), L.blend, eff);
        continue;
      }
      ctx.globalAlpha = eff;
      ctx.globalCompositeOperation = layerBlendCss(L) || "source-over";
      if (i === activeIndex) ctx.drawImage(activeMaskedCanvas(), 0, 0);
      else drawLayerContent(ctx, L, 0, 0, width, height, 0, 0, width, height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    return ctx.getImageData(0, 0, width, height);
  }
  function mergeSelected() {
    if (painting) return;
    const ids = selectedIds.length > 1 ? selectedIds : null;
    if (!ids) return;
    flushActive();
    const idxs = ids.map((id) => layers.findIndex((L) => L.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (idxs.length < 2) return;
    const lo = idxs[0];
    const hasBg = idxs.some((i) => layers[i].isBackground);
    const bitmap = compositeLayers(idxs);
    // Keep the merged layer in its group when all merged layers shared one.
    const grp = !hasBg && layers[lo].groupId && idxs.every((i) => layers[i].groupId === layers[lo].groupId) ? layers[lo].groupId : undefined;
    const merged = { id: hasBg ? 0 : ++nextLayerNum, name: hasBg ? "Background" : layers[lo].name,
      visible: true, opacity: 1, bitmap, isBackground: hasBg || undefined, groupId: grp };
    const keptBelow = layers.filter((L, i) => i < lo && !idxs.includes(i)).length;
    const rest = layers.filter((_, i) => !idxs.includes(i));
    rest.splice(keptBelow, 0, merged);
    layers = rest;
    groups = groups.filter((g) => layers.some((L) => L.groupId === g.id));
    activeIndex = layers.findIndex((L) => L.id === merged.id);
    selectedIds = [merged.id];
    loadActiveBitmap();
    commitAction("Merge Layers");
  }
  function mergeDown(i) {
    if (painting || i <= 0) return;
    selectedIds = [layers[i].id, layers[i - 1].id];
    mergeSelected();
  }
  function flattenImage() {
    if (painting) return;
    flushActive();
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    drawFlattened(c.getContext("2d"), 0, 0, width, height, 0, 0, width, height);
    layers = [{ id: 0, name: "Background", visible: true, opacity: 1, bitmap: c.getContext("2d").getImageData(0, 0, width, height), isBackground: true }];
    groups = [];
    activeIndex = 0; selectedIds = [0];
    loadActiveBitmap();
    commitAction("Flatten Image");
  }
  // Dismiss the layer / canvas context menus on any outside click.
  $effect(() => {
    if (!layerMenu && !canvasMenu) return;
    const close = (e) => {
      if (!e.target.closest?.(".pcr-ed-layer-menu")) { layerMenu = null; canvasMenu = null; }
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  });

  // Draw a sub-rect of the backdrop (Background + every layer BELOW the active
  // one, honoring visibility/opacity) onto `ctx`. The brush composites over
  // this so painting blends with what's beneath the active layer.
  function drawBackdrop(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
    for (let k = 0; k < activeIndex; k++) {
      const L = layers[k];
      if (!layerShown(L)) continue;
      ctx.globalAlpha = layerEffOpacity(L);
      ctx.globalCompositeOperation = layerBlendCss(L) || "source-over";
      drawLayerContent(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }
  // Draw the FULL flattened composite (Background + every visible layer, active
  // from the live canvas) — used by the eyedropper so it samples what's shown.
  function drawFlattened(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
    const fullFrame = sx === 0 && sy === 0 && dx === 0 && dy === 0 && sw === width && sh === height && dw === width && dh === height;
    // Custom blend modes only resolve in a whole-canvas composite (blendLayerFull works on the full
    // pixel buffer). For sub-rect requests — crop/upscale/i2i/Copy-Merged/eyedropper handoffs — flatten
    // the entire doc once (the fullFrame branch routes custom layers through blendLayerFull), then copy
    // the requested window out, so exported/handed-off output matches the on-screen preview.
    if (!fullFrame && layers.some((L) => layerShown(L) && isCustomBlend(L.blend))) {
      const full = document.createElement("canvas");
      full.width = width; full.height = height;
      drawFlattened(full.getContext("2d"), 0, 0, width, height, 0, 0, width, height);
      ctx.drawImage(full, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    for (let k = 0; k < layers.length; k++) {
      const L = layers[k];
      if (!layerShown(L)) continue;
      const eff = layerEffOpacity(L);
      if (fullFrame && isCustomBlend(L.blend)) {
        blendLayerFull(ctx, layerFullCanvas(L, k === activeIndex), L.blend, eff);
        continue;
      }
      ctx.globalAlpha = eff;
      ctx.globalCompositeOperation = layerBlendCss(L) || "source-over";
      if (k === activeIndex) ctx.drawImage(activeMaskedCanvas(), sx, sy, sw, sh, dx, dy, dw, dh);
      else drawLayerContent(ctx, L, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  // Full-image backdrop canvas (used as the brush's source-of-truth).
  function backdropCanvas() {
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    drawBackdrop(c.getContext("2d"), 0, 0, width, height, 0, 0, width, height);
    return c;
  }

  // Paint each INACTIVE layer's stored bitmap into its stacked canvas. The
  // active layer rides the live paintCanvas, so it's skipped here. Re-runs when
  // a layer's bitmap, visibility, the active index, or the doc size changes.
  $effect(() => {
    imgLoadTick; // redraw the Background when the source <img> loads
    // BELOW the active layer → one composited buffer (drawBackdrop already blends
    // exactly this set with per-layer visibility/opacity/blend/mask). Re-runs when
    // a layer's bitmap/order/visibility or the active index changes — NOT per paint
    // stroke (painting writes the live active canvas, which isn't in this set).
    if (belowCanvasEl) {
      if (belowCanvasEl.width !== width) belowCanvasEl.width = width;
      if (belowCanvasEl.height !== height) belowCanvasEl.height = height;
      const bctx = belowCanvasEl.getContext("2d");
      bctx.clearRect(0, 0, width, height);
      drawBackdrop(bctx, 0, 0, width, height, 0, 0, width, height);
    }
    // ABOVE the active layer → still one canvas per layer, so each layer's blend
    // mode composites against the live active layer + below beneath it.
    for (let i = activeIndex + 1; i < layers.length; i++) {
      const el = layerCanvasEls[i];
      if (!el) continue;
      if (el.width !== width) el.width = width;
      if (el.height !== height) el.height = height;
      const ctx = el.getContext("2d");
      ctx.clearRect(0, 0, width, height);
      drawLayerContent(ctx, layers[i], 0, 0, width, height, 0, 0, width, height);
    }
  });

  // Single-canvas composite for custom (non-CSS) blend modes. Only renders when
  // such a mode is in use (else the DOM-stacked path above shows the image). It
  // depends on layers/groups (reactive) and customTick (bumped after each paint
  // dab, since painting writes paintCanvas imperatively, not reactively).
  $effect(() => {
    customTick; imgLoadTick;
    if (!hasCustomBlend || !customEl) return;
    if (customEl.width !== width) customEl.width = width;
    if (customEl.height !== height) customEl.height = height;
    const ctx = customEl.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    drawFlattened(ctx, 0, 0, width, height, 0, 0, width, height);
  });

  function clearAll() {
    if (histIndex === 0 && history.length === 1) return;
    patch = null;
    selRect = null;
    paintCanvas.getContext("2d").clearRect(0, 0, width, height);
    commitAction("Clear");
  }

  // Sample the COMPOSITE (source + paint) under the cursor, averaged over the
  // Pick tool's sample size (1/3/5 px). Cached canvas — this runs on every
  // pointermove during a pick drag.
  let sampleCtx = null;
  function samplePixel(pt) {
    const s = sampleSize;
    const x = Math.max(0, Math.min(width - s, Math.round(pt.x) - (s - 1) / 2));
    const y = Math.max(0, Math.min(height - s, Math.round(pt.y) - (s - 1) / 2));
    if (!sampleCtx || sampleCtx.canvas.width < s) {
      const c = document.createElement("canvas");
      c.width = 5; c.height = 5;
      sampleCtx = c.getContext("2d", { willReadFrequently: true });
    }
    try {
      sampleCtx.clearRect(0, 0, s, s);
      // Merged sample = the on-screen composite. With a custom blend live, customEl already
      // holds the full-frame composite — read that window directly instead of recompositing
      // the whole doc per pointer-move (drawFlattened's sub-rect path would do that).
      if (sampleMerged && hasCustomBlend && customEl) sampleCtx.drawImage(customEl, x, y, s, s, 0, 0, s, s);
      else if (sampleMerged) drawFlattened(sampleCtx, x, y, s, s, 0, 0, s, s);
      else sampleCtx.drawImage(paintCanvas, x, y, s, s, 0, 0, s, s); // current layer only
      const d = sampleCtx.getImageData(0, 0, s, s).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < s * s; i++) {
        sum[0] += d[i * 4]; sum[1] += d[i * 4 + 1]; sum[2] += d[i * 4 + 2];
      }
      return sum.map((v) => Math.round(v / (s * s)));
    } catch (e) {
      console.warn("[PromptChain] eyedrop failed", e);
      return null;
    }
  }

  function updatePickPreview(e) {
    const sampled = samplePixel(toImageCoords(e));
    if (!sampled) return;
    pickRgb = sampled;
    const rect = viewportEl.getBoundingClientRect();
    pickPreview = { x: e.clientX - rect.left, y: e.clientY - rect.top, hex: rgbToHex(sampled) };
  }

  async function screenEyedrop() {
    if (!window.EyeDropper) return;
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const n = parseInt(sRGBHex.slice(1), 16);
      setColorFromRgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
      if (tool === "eyedrop") tool = "brush";
    } catch {} // Esc = cancelled
  }

  // ── pointer handling ──
  function onPointerDown(e) {
    if (e.button > 2) return;
    if (e.button === 1 || e.button === 2 || (spaceDown && e.button === 0) || (e.shiftKey && !isSelTool && !transforming)) { // middle/right or Space-drag pans; Shift adds to a selection / snaps a transform rotation
      panning = true;
      lastPt = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      viewportEl.setPointerCapture(e.pointerId);
      if (e.button === 2) {
        // a right-drag released OUTSIDE the viewport fires contextmenu on
        // whatever is under the cursor — eat the next one wherever it lands
        window.addEventListener("contextmenu", (ev) => ev.preventDefault(),
          { capture: true, once: true });
        rightDownAt = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    if (e.button !== 0 || saving) return;
    // preventDefault or the browser starts a native drag mid-stroke and the
    // OS "no-drop" cursor takes over the paint drag
    e.preventDefault();
    const pt = toImageCoords(e);
    // Free Transform is modal: the box's handles/body eat their own events, so a
    // press that reaches the viewport is OUTSIDE the box. Just outside a corner
    // rotates (PS); anywhere else outside commits.
    if (transforming) {
      if (inRotateZone(pt)) {
        const cx = patch.x + patch.w / 2, cy = patch.y + patch.h / 2;
        patchDrag = { mode: "rot", viaViewport: true, startX: e.clientX, startY: e.clientY,
          orig: { ...patch }, grabAngle: Math.atan2(pt.y - cy, pt.x - cx) - (patch.rot || 0) };
        viewportEl.setPointerCapture(e.pointerId);
        return;
      }
      commitPatch();
      return;
    }
    // A hidden active layer can't be painted or moved (PS blocks it). Selection,
    // crop, pan and color-pick don't alter its pixels, so they stay allowed.
    if (activeLayer()?.visible === false) {
      const moveGesture = tool === "move" || ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey);
      const sampling = tool === "eyedrop" || colorPopout || (e.altKey && !isSelTool);
      if (moveGesture || !(isSelTool || tool === "crop" || sampling)) { blockHiddenEdit(moveGesture ? "move" : tool); return; }
    }
    // Move tool, or Ctrl/Cmd-drag from any tool, grabs the selection (or the
    // whole layer) and drags it — Photoshop's Move.
    if (tool === "move" || ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey)) {
      if (startMove(e)) viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if ((tool === "heal" || tool === "stamp") && e.altKey) {
      // Alt-click primes the sample source (the eyedropper shortcut yields)
      healSource = { x: pt.x, y: pt.y };
      errorMsg = "";
      return;
    }
    if ((e.altKey && !isSelTool) || tool === "eyedrop" || colorPopout) { // Alt subtracts from a selection, doesn't pick
      picking = true;
      updatePickPreview(e);
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "liquify") {
      ensureLiqSession();
      if (!liqSrc) return;
      liqStroking = true;
      liqStrokeDirty = false;
      liqResidual = 0;
      liqLastStamp = pt;
      lastPt = pt;
      if (liqTool === "bloat" || liqTool === "pucker" || liqTool === "twirl") {
        liqRafLast = performance.now();
        liqRafId = requestAnimationFrame(liqHoldLoop);
      } else if (liqTool === "reconstruct") {
        liqStampReconstruct(pt.x, pt.y);
        renderLiqBatch();
      }
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "crop") {
      // drag on the shield draws a fresh box (handles/border eat their events)
      cropDrawStart = pt;
      cropDragging = true;
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "objsel") {
      const op = e.shiftKey && e.altKey ? "intersect" : e.shiftKey ? "add" : e.altKey ? "subtract" : "replace";
      selectObjectAt(pt, op);
      return;
    }
    if (tool === "select") {
      const op = e.shiftKey && e.altKey ? "intersect" : e.shiftKey ? "add" : e.altKey ? "subtract" : "replace";
      // plain drag inside an existing selection → move the ants
      if (op === "replace" && selActive && pointInSelection(pt)) {
        selMove = { orig: copyMaskCanvas(), origBBox: selBBox, startX: e.clientX, startY: e.clientY };
        viewportEl.setPointerCapture(e.pointerId);
        return;
      }
      selecting = true;
      selStart = pt;
      selRect = { x: pt.x, y: pt.y, w: 0, h: 0 };
      selOp = op;
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "smooth" || tool === "lasso") {
      const op = e.shiftKey && e.altKey ? "intersect" : e.shiftKey ? "add" : e.altKey ? "subtract" : "replace";
      if (tool === "lasso" && op === "replace" && selActive && pointInSelection(pt)) {
        selMove = { orig: copyMaskCanvas(), origBBox: selBBox, startX: e.clientX, startY: e.clientY };
        viewportEl.setPointerCapture(e.pointerId);
        return;
      }
      lassoing = true;
      lassoPts = [pt];
      if (tool === "lasso") selOp = op;
      viewportEl.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "bucket") {
      floodFill(pt);
      return;
    }
    if ((tool === "heal" || tool === "stamp") && !healSource) {
      healDialog = true;
      return;
    }
    if (tool === "heal" || tool === "stamp") {
      // every stroke re-anchors to the Alt-clicked source: sampling starts AT
      // the marker and tracks the brush from there for the stroke's duration.
      // INTEGER offset — fractional deltas would index the pixel arrays at
      // non-integer positions (undefined → NaN → black output).
      healStrokeOffset = {
        dx: Math.round(healSource.x - pt.x),
        dy: Math.round(healSource.y - pt.y),
      };
    }
    if (isHealTool() || tool === "stamp") healPaintingUi = true;
    painting = true;
    strokeResidual = 0;
    beginStroke();
    lastPt = pt;
    stampSegment(pt, pt);
    if (tool === "brush" || tool === "eraser") {
      airLastTs = performance.now();
      airResidual = 0;
      airRafId = requestAnimationFrame(airbrushLoop);
    }
    viewportEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    cursorPos = (() => {
      const rect = viewportEl?.getBoundingClientRect();
      return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null;
    })();
    if (patchDrag?.viaViewport) { patchPointerMove(e); return; } // viewport-driven corner rotate
    if (transforming) overRotateZone = inRotateZone(toImageCoords(e));
    if (panning) {
      panX += e.clientX - lastPt.x;
      panY += e.clientY - lastPt.y;
      lastPt = { x: e.clientX, y: e.clientY };
      return;
    }
    if (moveFloat) { updateMove(e); return; }
    if (picking) {
      updatePickPreview(e);
      return;
    }
    if (liqStroking) {
      const pt = toImageCoords(e);
      if (liqTool === "warp" || liqTool === "reconstruct") liqDragStamps(pt);
      lastPt = pt; // hold tools stamp at the tracked cursor
      return;
    }
    if (cropDrawStart) {
      const box = normalizedRect(cropDrawStart, toImageCoords(e));
      const r = cropRatioValue() || (e.shiftKey ? null : null);
      if (r && box.w > 0 && box.h > 0) {
        if (box.w / box.h > r) box.w = box.h * r; else box.h = box.w / r;
      }
      cropBox = box;
      return;
    }
    if (selMove) {
      selDragDxy = {
        dx: Math.round((e.clientX - selMove.startX) / zoom),
        dy: Math.round((e.clientY - selMove.startY) / zoom),
      };
      return;
    }
    if (selecting) {
      selRect = normalizedRect(selStart, toImageCoords(e));
      return;
    }
    if (lassoing) {
      const pt = toImageCoords(e);
      const last = lassoPts[lassoPts.length - 1];
      if (Math.hypot(pt.x - last.x, pt.y - last.y) > 1.5) lassoPts = [...lassoPts, pt];
      return;
    }
    if (painting) {
      const pt = toImageCoords(e);
      stampSegment(lastPt, pt);
      lastPt = pt;
    }
  }

  function onPointerUp(e) {
    if (patchDrag?.viaViewport) { patchPointerUp(); return; } // end of a viewport corner rotate
    if (moveFloat) { endMove(); return; }
    if (liqStroking) {
      liqStroking = false;
      cancelAnimationFrame(liqRafId);
      lastPt = null;
      if (liqStrokeDirty) {
        // every released stroke is its own edit; the session field stays
        // cumulative so Reconstruct can still unwind earlier strokes
        commitAction("Liquify");
        liqStrokeDirty = false;
      }
      return;
    }
    if (cropDrawStart) {
      cropDrawStart = null;
      cropDragging = false;
      if (!cropBox || cropBox.w < 8 || cropBox.h < 8) resetCropBox();
    }
    if (picking) {
      picking = false;
      if (pickRgb) setColorFromRgb(...pickRgb);
      pickRgb = null;
      pickPreview = null;
      if (tool === "eyedrop" && !e?.altKey) tool = "brush"; // pick once, back to brush
    }
    if (selMove) {
      if (selDragDxy) translateSelMask(selMove.orig, selMove.origBBox, selDragDxy.dx, selDragDxy.dy);
      selDragDxy = null; selMove = null;
      return;
    }
    if (selecting) {
      selecting = false;
      const had = selActive;
      // Compose the marquee into the selection mask (replace / add / subtract).
      if (selRect && selRect.w >= 1 && selRect.h >= 1) {
        applySelectionShape({ type: "rect", x: selRect.x, y: selRect.y, w: selRect.w, h: selRect.h }, selOp);
        commitAction("Select");
      } else if (selOp === "replace") {
        deselect(); // a click with no drag clears the selection
        if (had) commitAction("Deselect");
      }
      selRect = null;
      return;
    }
    if (lassoing) {
      lassoing = false;
      if (tool === "lasso") {
        const had = selActive;
        if (lassoPts && lassoPts.length >= 3) { applySelectionShape({ type: "lasso", pts: lassoPts }, selOp); commitAction("Select"); }
        else if (selOp === "replace") { deselect(); if (had) commitAction("Deselect"); }
      } else if (lassoPts && lassoPts.length >= 3) {
        applySmooth(lassoPts); // smooth tool still applies immediately
      }
      lassoPts = null;
      return;
    }
    if (painting) {
      cancelAnimationFrame(airRafId);
      if (isHealTool()) runHeal();
      else commitAction(tool === "eraser" ? "Eraser" : tool === "stamp" ? "Stamp" : "Brush");
    }
    painting = false;
    healPaintingUi = false;
    healStrokeOffset = null;
    // right-click released in place (no pan drag) → canvas context menu
    if (panning && e.button === 2 && rightDownAt
        && Math.hypot(e.clientX - rightDownAt.x, e.clientY - rightDownAt.y) < 4) {
      canvasMenu = { x: e.clientX, y: e.clientY };
    }
    rightDownAt = null;
    panning = false;
    lastPt = null;
  }

  // ── HSV picker drags ──
  function svDrag(e) {
    const el = e.currentTarget;
    const apply = (ev) => {
      const rect = el.getBoundingClientRect();
      sat = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      val = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height));
    };
    apply(e);
    el.setPointerCapture(e.pointerId);
    const move = (ev) => apply(ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  function hueDrag(e) {
    const el = e.currentTarget;
    const apply = (ev) => {
      const rect = el.getBoundingClientRect();
      hue = Math.max(0, Math.min(359.9, ((ev.clientX - rect.left) / rect.width) * 360));
    };
    apply(e);
    el.setPointerCapture(e.pointerId);
    const move = (ev) => apply(ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  // ── save ──
  async function exportComposite() {
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    flushActive(); // sync the live canvas into the active layer's bitmap
    const ctx = out.getContext("2d");
    drawFlattened(ctx, 0, 0, width, height, 0, 0, width, height);
    return new Promise((resolve) => out.toBlob(resolve, "image/png"));
  }

  async function save() {
    commitPatch(); // a floating patch is intended content — bake it in
    if (!onSave || !histIndex || saving) return;
    saving = true;
    errorMsg = "";
    try {
      const blob = await exportComposite();
      if (!blob) throw new Error("export produced no image");
      const packed = packLayerDoc(); // snapshot the layer stack before close() tears it down
      const entry = await onSave(blob, savePrefix.trim());
      if (entry) {
        close();
        onSaved?.(entry);
        if (packed) persistDoc(entry.hash, packed); // async sidecar, off the save path
        else clearDoc(entry.hash); // flattened/single-layer → drop any stale sidecar
      } else {
        errorMsg = "save failed — see console";
      }
    } catch (e) {
      errorMsg = e.message || "save failed";
    } finally {
      saving = false;
    }
  }

  // Save edits: persist the layer stack to the OPENED image's sidecar (the
  // "keep your PSD" doc) in place — no new file, no flatten/export, thumbnail
  // unchanged. Forces a doc even for a single edited layer (there's no flat PNG
  // to fall back on here). Stays open so you keep working; the viewer's saved-
  // layers badge refreshes via the event.
  async function saveEdits() {
    commitPatch(); // bake a floating patch in first
    if (!editDocHash || !fetchApi || !histIndex || savingEdits || saving) return;
    savingEdits = true; errorMsg = "";
    try {
      const packed = packLayerDoc(true);
      if (!packed) { errorMsg = "nothing to save yet"; return; }
      if (await persistDoc(editDocHash, packed)) {
        editsSaved = true;
        window.dispatchEvent(new CustomEvent("promptchain:edit-docs-changed"));
      } else {
        errorMsg = "couldn't save edits — the server may need a restart";
      }
    } catch (e) {
      errorMsg = `Save edits failed: ${e?.message || e}`;
    } finally {
      savingEdits = false;
    }
  }

  function close() {
    onCancel?.();
  }
</script>

{#if open}
  <!-- Deliberately NOT closable on an outside click: a text-selection drag that
       starts inside the modal and releases on the backdrop fires a click there
       and would abruptly close the editor mid-edit. Close via the ✕, Cancel, or Esc. -->
  <div use:portal class="pcr-modal-backdrop">
    <div class="pcr-modal pcr-ed-modal" class:maximized role="dialog" aria-modal="true">
      <div class="pcr-modal-header">
        <span class="pcr-modal-title">Editing: <span class="pcr-ed-fname">{filename}</span>{#if width && height}<span class="pcr-ed-dims">{width}×{height}</span>{/if}</span>
        <div class="pcr-ed-headbtns">
          <button class="pcr-modal-close" onclick={toggleMaximize}
            aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore down" : "Maximize"}>
            {#if maximized}
              <!-- restore: the Windows two-overlapping-squares glyph -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8.5 8.5 V6.5 A1.5 1.5 0 0 1 10 5 H17.5 A1.5 1.5 0 0 1 19 6.5 V14 A1.5 1.5 0 0 1 17.5 15.5 H15.5"/>
                <rect x="5" y="8.5" width="10.5" height="10.5" rx="1.5"/>
              </svg>
            {:else}
              <!-- maximize: single square -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="5" y="5" width="14" height="14" rx="1.5"/>
              </svg>
            {/if}
          </button>
          <button class="pcr-modal-close" onclick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      {#if restoring || handoffBusy}
        <div class="pcr-ed-restoring">
          <div class="pcr-ed-restoring-card">
            <span class="pcr-ed-spinner"></span>
            <span>{restoring ? "Restoring saved layers…" : handoffBusy === "upscale" ? "Preparing upscale…" : handoffBusy === "repose" ? "Preparing Re-pose…" : handoffBusy === "i2i" ? "Preparing i2i…" : "Preparing inpaint…"}</span>
          </div>
        </div>
      {/if}
      <div class="pcr-modal-body pcr-ed-body">
        <!-- Photoshop-style options bar: the active tool's settings, always here -->
        <div class="pcr-ed-optbar">
          {#if transforming}
            <span class="pcr-ed-label">Transform</span>
            <button class="pcr-ed-tool-btn" onclick={() => flipPatch("h")} title="Flip horizontal">⇆ Flip H</button>
            <button class="pcr-ed-tool-btn" onclick={() => flipPatch("v")} title="Flip vertical">⇅ Flip V</button>
            <span class="pcr-ed-opt-readout">{Math.round((((patch.rot || 0) * 180 / Math.PI) % 360 + 360) % 360)}°</span>
            <button class="pcr-ed-tool-btn" onclick={resetTransform} title="Reset to the original size, rotation and flip">Reset</button>
            <button class="pcr-ed-tool-btn pcr-ed-pop-ok" onclick={commitPatch}>✓ Apply</button>
            <span class="pcr-ed-opt-hint">drag a corner to scale · the knob above rotates (Shift = 15° steps) · drag inside to move · Shift on a corner keeps proportions · Enter applies · Esc cancels</span>
          {:else if tool === "bucket"}
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Tolerance</span>
              <SettingsSlider min={0} max={128} step={1} value={fillTolerance}
                savedValue={32} onChange={(v) => { fillTolerance = v; }} />
            </div>
            <button class="pcr-ed-air-toggle pcr-ed-text-toggle" class:active={fillContiguous}
              onclick={() => { fillContiguous = !fillContiguous; }}>Contiguous</button>
            <span class="pcr-ed-opt-hint">click to flood-fill with the foreground color · constrained to the selection · Alt/Ctrl+Backspace fills</span>
          {:else if tool === "smooth"}
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Blur</span>
              <SettingsSlider min={1} max={30} step={1} value={smoothBlur}
                savedValue={6} onChange={(v) => { smoothBlur = v; }} />
            </div>
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Feather</span>
              <SettingsSlider min={2} max={60} step={1} value={smoothFeather}
                savedValue={14} onChange={(v) => { smoothFeather = v; }} />
            </div>
            <span class="pcr-ed-opt-hint">lasso a region — it blurs and feather-blends on release</span>
          {:else if tool === "brush" || tool === "eraser"}
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Size</span>
              <SettingsSlider min={1} max={1024} step={1} value={brushSize}
                savedValue={48} onChange={(v) => { brushSize = v; }} />
            </div>
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Hardness</span>
              <SettingsSlider min={0} max={0.95} step={0.05} value={hardness}
                savedValue={0.35} onChange={(v) => { hardness = v; }} />
            </div>
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Opacity</span>
              <SettingsSlider min={0.05} max={1} step={0.05} value={opacity}
                savedValue={1} onChange={(v) => { opacity = v; }} />
            </div>
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Flow</span>
              <SettingsSlider min={0.02} max={1} step={0.01} value={flow}
                savedValue={0.12} onChange={(v) => { flow = v; }} />
            </div>
            <button class="pcr-ed-air-toggle" class:active={airbrush}
              title="Airbrush — paint keeps building while you hold the button (Flow = rate, Opacity = ceiling)"
              onclick={() => { airbrush = !airbrush; }}>
              <svg viewBox="0 0 24 24">
                <path d="M3 3h.01"/><path d="M7 5h.01"/><path d="M11 3h.01"/>
                <path d="M3 7h.01"/><path d="M7 9h.01"/><path d="M3 11h.01"/>
                <rect width="4" height="4" x="15" y="5"/>
                <path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2"/>
                <path d="m13 14 8-2"/>
              </svg>
            </button>
          {:else if tool === "spot" || tool === "heal" || tool === "stamp"}
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Size</span>
              <SettingsSlider min={1} max={256} step={1} value={brushSize}
                savedValue={48} onChange={(v) => { brushSize = v; }} />
            </div>
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Hardness</span>
              <SettingsSlider min={0} max={0.95} step={0.05} value={hardness}
                savedValue={0.35} onChange={(v) => { hardness = v; }} />
            </div>
            {#if tool === "stamp"}
              <div class="pcr-ed-opt">
                <span class="pcr-ed-label">Opacity</span>
                <SettingsSlider min={0.05} max={1} step={0.05} value={opacity}
                  savedValue={1} onChange={(v) => { opacity = v; }} />
              </div>
              <div class="pcr-ed-opt">
                <span class="pcr-ed-label">Flow</span>
                <SettingsSlider min={0.02} max={1} step={0.01} value={flow}
                  savedValue={0.12} onChange={(v) => { flow = v; }} />
              </div>
            {/if}
            {#if tool === "spot"}
              <span class="pcr-ed-opt-hint">paint over a blemish — it heals from the surroundings on release</span>
            {:else if tool === "heal"}
              <span class="pcr-ed-opt-hint">
                {healSource
                  ? "paint over the flaw — texture from the source, lighting from the spot · Alt-click to re-sample"
                  : "Alt-click a clean area to set the sample source"}
              </span>
            {:else}
              <span class="pcr-ed-opt-hint">
                {healSource
                  ? "paint to clone source pixels exactly · Alt-click to re-sample"
                  : "Alt-click the area to clone from, then paint"}
              </span>
            {/if}
          {:else if tool === "liquify"}
            <div class="pcr-ed-liq-seg">
              {#each [["warp", "Warp"], ["twirl", "Twirl ↻"], ["bloat", "Bloat"], ["pucker", "Pucker"], ["push", "Push Left"], ["reconstruct", "Reconstruct"]] as [id, label]}
                <button class="pcr-ed-liq-opt" class:active={liqTool === id}
                  onclick={() => { liqTool = id; }}>{label}</button>
              {/each}
            </div>
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Size</span>
              <SettingsSlider min={5} max={500} step={1} value={liqSize}
                savedValue={140} onChange={(v) => { liqSize = v; }} />
            </div>
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Density</span>
              <SettingsSlider min={0} max={100} step={1} value={liqDensity}
                savedValue={50} onChange={(v) => { liqDensity = v; }} />
            </div>
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Pressure</span>
              <SettingsSlider min={1} max={100} step={1} value={liqPressure}
                savedValue={70} onChange={(v) => { liqPressure = v; }} />
            </div>
            {#if liqTool === "bloat" || liqTool === "pucker" || liqTool === "twirl"}
              <div class="pcr-ed-opt">
                <span class="pcr-ed-label">Rate</span>
                <SettingsSlider min={1} max={100} step={1} value={liqRate}
                  savedValue={60} onChange={(v) => { liqRate = v; }} />
              </div>
            {/if}
            <span class="pcr-ed-opt-hint">
              {liqTool === "push" ? "drag up pushes content left, down pushes right"
                : liqTool === "twirl" ? "hold to twirl clockwise"
                : "each stroke commits to History · Reconstruct un-warps · Ctrl+Z undoes a stroke"}
            </span>
          {:else if tool === "crop"}
            <div class="pcr-ed-opt pcr-ed-opt-narrow">
              <span class="pcr-ed-label">Ratio</span>
              <select class="pcr-ed-opt-select" bind:value={cropRatioId} onchange={applyRatioToBox}>
                {#each CROP_RATIOS as cr}
                  <option value={cr.id}>{cr.label}</option>
                {/each}
              </select>
              <button class="pcr-ed-tool-btn" title="Swap width and height"
                onclick={() => { cropRatioFlip = !cropRatioFlip; applyRatioToBox(); }}>⇄</button>
            </div>
            <button class="pcr-ed-tool-btn pcr-ed-pop-ok" onclick={commitCrop} disabled={!cropBox || cropBoxIsFull()}>✓ Apply</button>
            <button class="pcr-ed-tool-btn" onclick={resetCropBox}>Reset</button>
            <span class="pcr-ed-opt-hint">drag handles · drag inside to move · Shift locks ratio · Enter / double-click applies · Esc resets</span>
          {:else if tool === "select" || tool === "lasso"}
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Feather</span>
              <SettingsSlider min={0} max={40} step={1} value={featherPx}
                savedValue={0} onChange={(v) => { featherPx = v; }} />
            </div>
            <div class="pcr-ed-opt">
              <span class="pcr-ed-label">Opacity</span>
              <SettingsSlider min={0.05} max={1} step={0.05} value={patchOpacity}
                savedValue={1} onChange={(v) => { patchOpacity = v; }} />
            </div>
            <button class="pcr-ed-tool-btn" disabled={subjectBusy} onclick={selectSubject}
              title="AI-select the main subject of the image">{subjectBusy ? "Selecting…" : "✦ Select Subject"}</button>
            {#each figureRegions as r (r.name)}
              <button class="pcr-ed-tool-btn" disabled={figureSelBusy} onclick={() => selectFigureMask(r)}
                title={`select ${r.name}'s silhouette (3D pose mask)`}>🧍 {r.name}</button>
            {/each}
            <span class="pcr-ed-opt-hint">{tool === "lasso" ? "draw around a region" : "drag a rectangle"} · drag inside to move the ants · <b>Ctrl+J</b> copy / <b>Ctrl+Shift+J</b> cut to a new layer · Ctrl+C/V · Esc deselects · Feather softens the edge</span>
          {:else if tool === "objsel"}
            <button class="pcr-ed-tool-btn" disabled={subjectBusy} onclick={selectSubject}
              title="AI-select the main subject of the image">{subjectBusy ? "Selecting…" : "✦ Select Subject"}</button>
            {#each figureRegions as r (r.name)}
              <button class="pcr-ed-tool-btn" disabled={figureSelBusy} onclick={() => selectFigureMask(r)}
                title={`select ${r.name}'s silhouette (3D pose mask)`}>🧍 {r.name}</button>
            {/each}
            <span class="pcr-ed-opt-hint">{objselBusy ? "segmenting…" : "click an object to select all of it (AI)"} · Shift-click adds · Alt-click subtracts · Esc deselects · first click on a new composite takes a second, later clicks are instant</span>
          {:else}
            <div class="pcr-ed-opt pcr-ed-opt-narrow">
              <span class="pcr-ed-label">Sample</span>
              <select class="pcr-ed-opt-select" bind:value={sampleSize}>
                <option value={1}>Point</option>
                <option value={3}>3×3 average</option>
                <option value={5}>5×5 average</option>
              </select>
            </div>
            <div class="pcr-ed-opt pcr-ed-opt-narrow">
              <span class="pcr-ed-label">From</span>
              <select class="pcr-ed-opt-select" bind:value={sampleMerged}>
                <option value={true}>All layers</option>
                <option value={false}>Current layer</option>
              </select>
            </div>
            <span class="pcr-ed-opt-hint">click the image to pick a color · hold to preview · Screen pick grabs from anywhere</span>
          {/if}
        </div>
        <div class="pcr-ed-cols">
        <div class="pcr-ed-toolstrip">
          {#each TOOLS as t}
            <button class="pcr-ed-strip-btn" class:active={tool === t.id} title={t.label}
              onclick={() => setTool(t.id)}>
              <svg viewBox="0 0 24 24">{@html t.icon}</svg>
            </button>
          {/each}
          <div class="pcr-ed-strip-sep"></div>
          <button class="pcr-ed-strip-btn" title="Undo (Ctrl+Z)" onclick={undo} disabled={histIndex === 0}>
            <svg viewBox="0 0 24 24">{@html ACTION_ICONS.undo}</svg>
          </button>
          <button class="pcr-ed-strip-btn" title="Redo (Ctrl+Y)" onclick={redo} disabled={histIndex >= history.length - 1}>
            <svg viewBox="0 0 24 24">{@html ACTION_ICONS.redo}</svg>
          </button>
          <button class="pcr-ed-strip-btn" title="Clear all edits" onclick={clearAll} disabled={histIndex === 0}>
            <svg viewBox="0 0 24 24">{@html ACTION_ICONS.clear}</svg>
          </button>
          <div class="pcr-ed-strip-sep"></div>
          <button class="pcr-ed-strip-color" bind:this={colorChipEl} title="Foreground color — click to pick"
            class:open={colorPopout}
            style="background: {hexColor};"
            onclick={() => { colorPopout ? okColorPop() : openColorPop(); }}
            aria-label="Color picker"></button>
          <button class="pcr-ed-strip-bgcolor" title="Background color (fills holes when moving on Background) — click to set from foreground"
            style="background: {rgbCss(bgRgb)};"
            onclick={() => { bgRgb = [...rgb]; }}
            aria-label="Background color"></button>
          {#if colorPopout}
            <div class="pcr-ed-color-pop" bind:this={popoutEl} style="top: {colorChipEl?.offsetTop ?? 0}px;">
              <span class="pcr-ed-panel-title">Color</span>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="pcr-ed-sv" style="background-color: hsl({hue}, 100%, 50%);" onpointerdown={svDrag}>
                <div class="pcr-ed-sv-white"></div>
                <div class="pcr-ed-sv-black"></div>
                <div class="pcr-ed-sv-thumb" style="left: {sat * 100}%; top: {(1 - val) * 100}%;"></div>
              </div>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="pcr-ed-hue" onpointerdown={hueDrag}>
                <div class="pcr-ed-hue-thumb" style="left: {(hue / 360) * 100}%;"></div>
              </div>
              <div class="pcr-ed-color-row">
                <span class="pcr-ed-swatch" style="background: {hexColor};"></span>
                <span class="pcr-ed-hex">{hexColor}</span>
                {#if typeof window !== "undefined" && window.EyeDropper}
                  <button class="pcr-ed-tool-btn" onclick={screenEyedrop} title="Pick a color from anywhere on screen">Screen pick</button>
                {/if}
              </div>
              <div class="pcr-ed-hint">click the image to pick a color</div>
              <div class="pcr-ed-pop-btns">
                <button class="pcr-ed-tool-btn" onclick={cancelColorPop}>Cancel</button>
                <button class="pcr-ed-tool-btn pcr-ed-pop-ok" onclick={okColorPop}>OK</button>
              </div>
            </div>
          {/if}
        </div>
        <div class="pcr-ed-left">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="pcr-ed-viewport"
            class:eyedrop={tool === "eyedrop" || colorPopout}
            class:select-mode={tool === "select" || tool === "lasso" || tool === "objsel" || tool === "smooth" || tool === "crop" || tool === "bucket"}
            class:move-mode={tool === "move" || (mods.ctrl && !mods.shift && !mods.alt)}
            class:transform-mode={transforming}
            class:no-edit={hiddenEditBlocked}
            class:drag-over={dragActive}
            style:cursor={spaceDown ? "grab" : (transforming && overRotateZone ? ROTATE_CURSOR : null)}
            bind:this={viewportEl}
            ondragover={onCanvasDragOver}
            ondragleave={() => { dragActive = false; }}
            ondrop={onCanvasDrop}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointercancel={onPointerUp}
            onpointerleave={() => { cursorPos = null; }}
            ondblclick={() => { if (tool === "crop" && cropBox) commitCrop(); }}
            onwheel={onWheel}
            oncontextmenu={(e) => e.preventDefault()}
            ondragstart={(e) => e.preventDefault()}
            onselectstart={(e) => e.preventDefault()}
          >
            {#if maskEdit}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div style="position:absolute; top:10px; left:50%; transform:translateX(-50%); z-index:30; background:rgba(20,20,24,0.92); color:#fff; padding:5px 12px; border-radius:6px; font-size:12px; display:flex; gap:10px; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,.4);"
                onpointerdown={(e) => e.stopPropagation()}>
                <span>✎ Editing layer mask — paint <b>white</b> to reveal, <b>black</b> to hide</span>
                <button class="pcr-ed-tool-btn" onclick={exitMaskEdit}>Done</button>
              </div>
            {/if}
            <div class="pcr-ed-stage" style="transform: translate({panX}px, {panY}px) scale({zoom}); width:{width}px; height:{height}px;">
              <!-- Source image is a hidden pixel-source; the Background LAYER renders it. -->
              <img bind:this={imgEl} src={sourceUrl} alt="" draggable="false" width={width} height={height}
                style:display="none"
                onload={() => { imgLoadTick++; if (activeLayer()?.isBackground && !activeLayer()?.bitmap) loadActiveBitmap(); }} />
              <!-- Everything BELOW the active layer, pre-composited into ONE canvas.
                   Stacking N transparent-bordered layers and CSS-scaling each
                   independently fringes their edges and the seams compound (the
                   premultiplied-alpha resample doesn't commute per-layer); compositing
                   first then scaling once is seam-free. Visibility/opacity/blend are
                   baked in by drawBackdrop, so this canvas needs no per-layer CSS. -->
              <canvas bind:this={belowCanvasEl} width={width} height={height} style:display={hasCustomBlend ? "none" : null}></canvas>
              <!-- Active layer = the single live paint canvas all tools write to.
                   A layer mask applies as a CSS mask so the canvas pixels stay raw.
                   Hidden (but still painted on) when the custom-blend composite is shown. -->
              <canvas bind:this={paintCanvas} width={width} height={height}
                style:display={hasCustomBlend || !layerShown(activeLayer()) ? "none" : null} style:opacity={layerEffOpacity(activeLayer())}
                style:mix-blend-mode={maskEdit ? null : layerBlendCss(activeLayer())}
                style:mask-image={!maskEdit && activeLayer()?.maskUrl ? `url(${activeLayer().maskUrl})` : null}
                style:mask-repeat="no-repeat"
                style:mask-position={`${activeLayer()?.ox || 0}px ${activeLayer()?.oy || 0}px`}></canvas>
              <!-- Inactive layers ABOVE the active one. -->
              {#each layers as L, i (L.id)}
                {#if i > activeIndex}
                  <canvas bind:this={layerCanvasEls[i]} width={width} height={height}
                    style:display={hasCustomBlend || !layerShown(L) ? "none" : null} style:opacity={layerEffOpacity(L)}
                    style:mix-blend-mode={layerBlendCss(L)}></canvas>
                {/if}
              {/each}
              <!-- Single-canvas composite, shown only when a custom (non-CSS) blend mode is active. -->
              <canvas bind:this={customEl} width={width} height={height} style:display={hasCustomBlend ? null : "none"}></canvas>
              {#if (tool === "heal" || tool === "stamp") && healSource && !healPaintingUi}
                <div class="pcr-ed-heal-src"
                  style="left:{healSource.x}px; top:{healSource.y}px; width:{18 / zoom}px; height:{18 / zoom}px; border-width:{1.5 / zoom}px;"></div>
              {/if}
              {#if selRect}
                <div class="pcr-ed-marquee"
                  style="left:{selRect.x}px; top:{selRect.y}px; width:{selRect.w}px; height:{selRect.h}px; --ant-w:{1.5 / zoom}px; --ant-step:{8 / zoom}px;"></div>
              {/if}
              {#if lassoPts && lassoPts.length > 1}
                <!-- while dragging: just the OPEN trail (no fill, no auto-close,
                     no ants) so the path is easy to follow — it closes into a
                     real selection on release, PS-style -->
                {@const pts = lassoPts.map((p) => `${p.x},${p.y}`).join(" ")}
                <svg class="pcr-ed-lasso" width={width} height={height} viewBox="0 0 {width} {height}">
                  <polyline class="pcr-ed-lasso-halo" points={pts} style="stroke-width: {2.5 / zoom}px;" />
                  <polyline class="pcr-ed-lasso-line" points={pts} style="stroke-width: {1.25 / zoom}px;" />
                </svg>
              {/if}
              {#if snapGuides.v != null}
                <div class="pcr-ed-snapguide" style="left:0; top:0; width:{1 / zoom}px; height:{height}px; transform: translateX({snapGuides.v}px);"></div>
              {/if}
              {#if snapGuides.h != null}
                <div class="pcr-ed-snapguide" style="left:0; top:0; width:{width}px; height:{1 / zoom}px; transform: translateY({snapGuides.h}px);"></div>
              {/if}
              <!-- Persistent marching-ants selection, traced from the mask. -->
              {#if selContour}
                <svg class="pcr-ed-selants" width={width} height={height} viewBox="0 0 {width} {height}">
                  <g transform={selDragDxy ? `translate(${selDragDxy.dx} ${selDragDxy.dy})` : ""}>
                    <!-- vector-effect:non-scaling-stroke renders the stroke width AND
                         the dash pattern in constant SCREEN px regardless of the stage's
                         scale(zoom), so the march is a static, seamless 0→-8px loop with
                         NO per-zoom math — the /zoom dash math was what made it pulse/flash
                         when zoomed out (the loop snapped mid-pattern). See CSS. -->
                    <path class="pcr-ed-selants-bg" d={selContour} />
                    <path class="pcr-ed-selants-fg" d={selContour} />
                  </g>
                </svg>
              {/if}
              {#if tool === "crop" && cropBox}
                <!-- crop shield: 75% dark wash outside the box (PS default) -->
                <svg class="pcr-ed-crop-shield" width={width} height={height} viewBox="0 0 {width} {height}">
                  <path fill-rule="evenodd"
                    d="M0 0H{width}V{height}H0Z M{cropBox.x} {cropBox.y}h{cropBox.w}v{cropBox.h}h-{cropBox.w}Z" />
                </svg>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="pcr-ed-crop-border" class:fresh={cropBoxIsFull()}
                  style="left:{cropBox.x}px; top:{cropBox.y}px; width:{cropBox.w}px; height:{cropBox.h}px; border-width:{1 / zoom}px;"
                  onpointerdown={(e) => cropPointerDown(e, "move")}
                  onpointermove={cropPointerMove}
                  onpointerup={cropPointerUp}
                  onpointercancel={cropPointerUp}>
                  {#if cropDragging}
                    <div class="pcr-ed-thirds pcr-ed-thirds-v" style="left: 33.333%; width:{1 / zoom}px;"></div>
                    <div class="pcr-ed-thirds pcr-ed-thirds-v" style="left: 66.666%; width:{1 / zoom}px;"></div>
                    <div class="pcr-ed-thirds pcr-ed-thirds-h" style="top: 33.333%; height:{1 / zoom}px;"></div>
                    <div class="pcr-ed-thirds pcr-ed-thirds-h" style="top: 66.666%; height:{1 / zoom}px;"></div>
                  {/if}
                </div>
                {#each HANDLES as dir}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="pcr-ed-crop-handle" style={cropHandleStyle(dir, cropBox, zoom)}
                    onpointerdown={(e) => cropPointerDown(e, dir)}
                    onpointermove={cropPointerMove}
                    onpointerup={cropPointerUp}
                    onpointercancel={cropPointerUp}></div>
                {/each}
              {/if}
              {#if patch}
                <!-- one rotated container so the canvas, border, handles and
                     rotate knob all ride the same transform; the browser scales
                     the lifted pixels live via CSS width/height -->
                {@const hs = 11 / zoom}
                <div class="pcr-ed-patch-wrap"
                  style="left:{patch.x}px; top:{patch.y}px; width:{patch.w}px; height:{patch.h}px; transform: rotate({patch.rot || 0}rad);">
                  <canvas bind:this={patchEl} class="pcr-ed-patch"
                    style="left:0; top:0; width:100%; height:100%; opacity:{patchOpacity}; transform: scale({patch.flipH ? -1 : 1}, {patch.flipV ? -1 : 1});"
                    onpointerdown={(e) => patchPointerDown(e, "move")}
                    onpointermove={patchPointerMove}
                    onpointerup={patchPointerUp}
                    onpointercancel={patchPointerUp}></canvas>
                  <div class="pcr-ed-patch-border" style="inset:0; border-width:{1 / zoom}px;"></div>
                  {#each HANDLES as dir}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="pcr-ed-handle" style={tHandleStyle(dir, patch, zoom)}
                      onpointerdown={(e) => patchPointerDown(e, dir)}
                      onpointermove={patchPointerMove}
                      onpointerup={patchPointerUp}
                      onpointercancel={patchPointerUp}></div>
                  {/each}
                  {#if patch.transform}
                    <div class="pcr-ed-rot-stem" style="left:50%; top:{-22 / zoom}px; width:{1 / zoom}px; height:{22 / zoom}px;"></div>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="pcr-ed-rot-knob" title="Drag to rotate · Shift snaps to 15°"
                      style="left:calc(50% - {hs / 2}px); top:{-22 / zoom - hs / 2}px; width:{hs}px; height:{hs}px;"
                      onpointerdown={(e) => patchPointerDown(e, "rot")}
                      onpointermove={patchPointerMove}
                      onpointerup={patchPointerUp}
                      onpointercancel={patchPointerUp}></div>
                  {/if}
                </div>
              {/if}
            </div>
            {#if cursorPos && !colorPopout && !transforming && !hiddenEditBlocked && (tool === "brush" || tool === "eraser" || tool === "spot" || tool === "heal" || tool === "stamp" || tool === "liquify")}
              <div class="pcr-ed-cursor" style="left: {cursorPos.x}px; top: {cursorPos.y}px; width: {(tool === "liquify" ? liqSize : brushSize) * zoom}px; height: {(tool === "liquify" ? liqSize : brushSize) * zoom}px;"></div>
            {/if}
            {#if selBadge && cursorPos}
              <div class="pcr-ed-sel-badge" style="left: {cursorPos.x + 12}px; top: {cursorPos.y - 16}px;">{selBadge}</div>
            {/if}
            {#if (tool === "heal" || tool === "stamp") && healPaintingUi && healStrokeOffset && cursorPos}
              <!-- live source crosshair, locked offset from the brush (PS behavior) -->
              <div class="pcr-ed-heal-cross"
                style="left: {cursorPos.x + healStrokeOffset.dx * zoom}px; top: {cursorPos.y + healStrokeOffset.dy * zoom}px;"></div>
            {/if}
            {#if pickPreview}
              <div class="pcr-ed-pick-bubble" style="left: {pickPreview.x}px; top: {pickPreview.y}px; background: {pickPreview.hex};"></div>
            {/if}
            {#if patch}
              <div class="pcr-ed-float-hint">drag / stretch · Enter applies · Esc cancels</div>
            {/if}
          </div>
        </div>
        <div class="pcr-ed-right">
          <div class="pcr-ed-panel">
            <div class="pcr-ed-panel-titlerow">
              <span class="pcr-ed-panel-title">Navigator</span>
              <span class="pcr-ed-nav-pct">{Math.round(zoom * 100)}%</span>
            </div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="pcr-ed-nav-stage" style="width: {navTw}px; height: {navTh}px;" onpointerdown={navDrag}>
              <img src={sourceUrl} alt="" draggable="false" style="width: {navTw}px; height: {navTh}px;" />
              {#if navRect}
                <div class="pcr-ed-nav-rect"
                  style="left: {navRect.x}px; top: {navRect.y}px; width: {navRect.w}px; height: {navRect.h}px;"></div>
              {/if}
            </div>
            <div class="pcr-ed-nav-zoomrow">
              <button class="pcr-ed-nav-zbtn" onclick={() => zoomStep(-1)} aria-label="Zoom out">−</button>
              <input class="pcr-ed-nav-slider" type="range" min={Math.log(0.05)} max={Math.log(12)} step="0.01"
                value={Math.log(zoom)} oninput={(e) => setZoomCentered(Math.exp(parseFloat(e.target.value)))} />
              <button class="pcr-ed-nav-zbtn" onclick={() => zoomStep(1)} aria-label="Zoom in">+</button>
            </div>
          </div>

          {#if onOpenInpaint || onOpenUpscale || onOpenRepose || onOpenI2i}
            <div class="pcr-ed-panel">
              <span class="pcr-ed-panel-title">Render {selActive ? "selection" : "layer"}</span>
              <!-- 2×2 grid (flex-wrap, each button ~50%): Inpaint · i2i Blend /
                   Upscale · Re-pose. Absent callbacks drop their button and the
                   rest reflow. -->
              <div class="pcr-ed-render-row">
                {#if onOpenInpaint}
                  <button class="pcr-ed-ip-render" disabled={!!handoffBusy} onclick={openInpaintHandoff}
                    title={selActive
                      ? "Inpaint the selected region — it's pre-masked; the result returns as a new layer."
                      : "Inpaint — an alpha-bounded layer pre-masks its silhouette, else paint the mask in the Inpaint editor; the result returns as a new layer."}>✦ Inpaint</button>
                {/if}
                {#if onOpenI2i}
                  <button class="pcr-ed-ip-render" disabled={!!handoffBusy} onclick={openI2iHandoff}
                    title="i2i Blend — re-diffuse the whole image at the denoise you pick (pick an engine, type a prompt). The result returns as a new layer.">✦ i2i Blend</button>
                {/if}
                {#if onOpenUpscale}
                  <button class="pcr-ed-ip-render" disabled={!!handoffBusy} onclick={openUpscaleHandoff}
                    title={selActive
                      ? "Upscale the selected region at the quality you pick."
                      : "Upscale the active layer's content at the quality you pick — grow the canvas to keep it 1:1, or squeeze it back in place."}>✦ Upscale</button>
                {/if}
                {#if onOpenRepose}
                  <button class="pcr-ed-ip-render" disabled={!!handoffBusy} onclick={openReposeHandoff}
                    title="Re-pose — pose a 3D figure and re-render this whole image into the new pose. Result is a new image in lineage.">✦ Re-pose</button>
                {/if}
              </div>
            </div>
          {/if}

          <div class="pcr-ed-panel">
            <div class="pcr-ed-panel-titlerow">
              <span class="pcr-ed-lh-tabs">
                <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                <button class="pcr-ed-lh-tab" class:active={lhTab === "layers"} onclick={() => { lhTab = "layers"; }}>Layers</button>
                <button class="pcr-ed-lh-tab" class:active={lhTab === "history"} onclick={() => { lhTab = "history"; }}>History</button>
              </span>
              {#if lhTab === "layers"}
                <span class="pcr-ed-layer-actions">
                  <button class="pcr-ed-layer-btn" title="New layer (Ctrl+Shift+N)" onclick={() => addLayer()}>＋</button>
                  <button class="pcr-ed-layer-btn" title="Merge selected layers" onclick={mergeSelected} disabled={selectedIds.length < 2}>⬇</button>
                  <button class="pcr-ed-layer-btn" title="Flatten image" onclick={flattenImage} disabled={layers.length <= 1}>▣</button>
                  <button class="pcr-ed-layer-btn" title={selectedIds.length > 1 ? "Delete selected layers" : "Delete layer"} onclick={deleteSelectedLayers} disabled={!canDeleteSelected()}>🗑</button>
                </span>
              {/if}
            </div>
          {#if lhTab === "layers"}
            <!-- Blend mode of the ACTIVE layer (PS: the dropdown above the list).
                 Pointless on the Background — nothing sits beneath it. -->
            <select class="pcr-ed-blend-select" title="Blend mode of the active layer"
              disabled={activeLayer()?.isBackground}
              value={activeLayer()?.blend || "normal"}
              onchange={(e) => setLayerBlend(activeIndex, e.currentTarget.value)}>
              {#each BLEND_MODES as [v, label] (v)}
                <option value={v}>{label}</option>
              {/each}
            </select>
            <div class="pcr-ed-layers">
              {#each panelRows as row (row.type === "group" ? "g" + row.group.id : row.L.id)}
                {#if row.type === "group"}
                  {@const g = row.group}
                  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                  <div class="pcr-ed-group-row">
                    <span class="pcr-ed-eye" title="Collapse / expand" onclick={() => toggleGroupCollapsed(g.id)}>{g.collapsed ? "▸" : "▾"}</span>
                    <span class="pcr-ed-eye" class:off={!g.visible} title="Toggle group visibility"
                      onclick={() => setGroupVisible(g.id, !g.visible)}>{g.visible ? "👁" : "—"}</span>
                    {#if renamingGroupId === g.id}
                      <!-- svelte-ignore a11y_autofocus -->
                      <input class="pcr-ed-layer-rename" type="text" autofocus bind:value={renameText}
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitGroupRename(); else if (e.key === "Escape") renamingGroupId = null; }}
                        onblur={commitGroupRename} />
                    {:else}
                      <span class="pcr-ed-group-name" title="Double-click to rename"
                        ondblclick={(e) => { e.stopPropagation(); startGroupRename(g); }}>📁 {g.name}</span>
                    {/if}
                    <input class="pcr-ed-layer-opacity" type="range" min="0" max="1" step="0.05" value={g.opacity}
                      onpointerdown={() => { opacityDragStart = g.opacity; }}
                      oninput={(e) => setGroupOpacity(g.id, +e.currentTarget.value)}
                      onchange={(e) => { if (opacityDragStart === null || +e.currentTarget.value !== opacityDragStart) commitAction("Group Opacity"); opacityDragStart = null; }}
                      onclick={(e) => e.stopPropagation()} title="Group opacity" />
                    <button class="pcr-ed-group-x" title="Ungroup" onclick={() => ungroup(g.id)}>⊟</button>
                  </div>
                {:else}
                  {@const L = row.L}
                  {@const i = row.i}
                  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                  <!-- Reorder drags start ONLY from the grip — a draggable row
                       hijacked horizontal drags on the opacity slider. The row
                       stays the drop target. -->
                  <div class="pcr-ed-layer-row"
                    class:active={i === activeIndex}
                    class:selected={selectedIds.includes(L.id)}
                    class:dragover={dragOverId === L.id}
                    class:in-group={row.inGroup}
                    onclick={(e) => clickLayer(i, e)}
                    oncontextmenu={(e) => { e.preventDefault(); if (!selectedIds.includes(L.id)) clickLayer(i, e); layerMenu = { x: e.clientX, y: e.clientY, i, flip: e.clientX > window.innerWidth - 340 }; }}
                    ondragover={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; dragOverId = L.id; }}
                    ondragleave={() => { if (dragOverId === L.id) dragOverId = null; }}
                    ondrop={(e) => { e.preventDefault(); dropLayer(L.id); }}>
                    <span class="pcr-ed-layer-grip" class:hidden={L.isBackground}
                      draggable={!L.isBackground} title="Drag to reorder"
                      ondragstart={(e) => { dragId = L.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(L.id)); }}
                      ondragend={() => { dragId = null; dragOverId = null; }}>⠿</span>
                    <span class="pcr-ed-eye" class:off={!L.visible} title="Toggle visibility"
                      onclick={(e) => { e.stopPropagation(); setLayerVisible(i, !L.visible); }}>{L.visible ? "👁" : "—"}</span>
                    {#if L.mask}
                      <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                      <img class="pcr-ed-mask-thumb" class:editing={maskEdit && i === activeIndex}
                        src={L.maskUrl} alt="" draggable="false"
                        title={maskEdit && i === activeIndex ? "Editing layer mask — click the layer to edit pixels" : "Click to edit layer mask"}
                        onclick={(e) => { e.stopPropagation(); toggleMaskEdit(i); }} />
                    {/if}
                    {#if renamingId === L.id}
                      <!-- svelte-ignore a11y_autofocus -->
                      <input class="pcr-ed-layer-rename" type="text" autofocus bind:value={renameText}
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") commitRename();
                          else if (e.key === "Escape") renamingId = null;
                        }}
                        onblur={commitRename} />
                    {:else}
                      <span class="pcr-ed-layer-name" title="Double-click to rename"
                        ondblclick={(e) => { e.stopPropagation(); startRename(L); }}>{L.name}{#if L.blend && L.blend !== "normal"}<span class="pcr-ed-layer-blendtag" title={`Blend: ${L.blend}`}>{L.blend}</span>{/if}</span>
                    {/if}
                    <input class="pcr-ed-layer-opacity" type="range" min="0" max="1" step="0.05"
                      value={L.opacity}
                      onpointerdown={() => { opacityDragStart = L.opacity; }}
                      oninput={(e) => setLayerOpacity(i, +e.currentTarget.value)}
                      onchange={(e) => { if (opacityDragStart === null || +e.currentTarget.value !== opacityDragStart) commitAction("Opacity"); opacityDragStart = null; }}
                      onclick={(e) => e.stopPropagation()} title="Opacity" />
                  </div>
                {/if}
              {/each}
            </div>
          {:else}
            <div class="pcr-ed-hist" bind:this={histEl}>
              {#each history as h, i}
                <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                <div class="pcr-ed-hist-row" class:active={i === histIndex} class:future={i > histIndex}
                  onclick={() => jumpTo(i)}>{h.label}</div>
              {/each}
            </div>
          {/if}
          </div>
          {#if layerMenu}
            <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
            {@const Lm = layers[layerMenu.i]}
            {@const multi = selectedIds.length > 1}
            {@const groupable = selectedIds.filter((id) => !layers.find((ly) => ly.id === id)?.isBackground).length}
            <div class="pcr-ed-layer-menu" style="left:{layerMenu.x}px; top:{layerMenu.y}px;">
              <!-- Layer -->
              <button onclick={() => { addLayer(layerMenu.i); layerMenu = null; }}>New Layer</button>
              <button onclick={() => { duplicateLayer(layerMenu.i); layerMenu = null; }}>Duplicate Layer</button>
              {#if multi}
                <button onclick={() => { mergeSelected(); layerMenu = null; }}>Merge Layers</button>
              {:else if layerMenu.i > 0}
                <button onclick={() => { mergeDown(layerMenu.i); layerMenu = null; }}>Merge Down</button>
              {/if}
              {#if layerMenu.i > 0 && Lm?.bitmap}
                <button onclick={() => {
                  const i = layerMenu.i; layerMenu = null;
                  if (i === activeIndex) flushActive();
                  if (matchLayerColorsToBelow(i)) commitAction("Match Colors");
                  else errorMsg = "No usable edge band — the layer's feathered edge must overlap solid content below.";
                }}>Match Colors to Below</button>
              {/if}

              <!-- Arrange -->
              {#if groupable || Lm?.groupId}
                <div class="pcr-ed-menu-sep"></div>
                {#if groupable}
                  <button onclick={() => { groupSelected(); layerMenu = null; }}>Group {multi ? "Layers" : "Layer"}</button>
                {/if}
                {#if Lm?.groupId}
                  <button onclick={() => { ungroup(Lm.groupId); layerMenu = null; }}>Ungroup</button>
                {/if}
              {/if}

              <!-- Mask -->
              {#if !Lm?.isBackground}
                <div class="pcr-ed-menu-sep"></div>
                {#if !Lm?.mask}
                  <button onclick={() => { addLayerMask(layerMenu.i); layerMenu = null; }}>Add Layer Mask{selActive ? " (Reveal Selection)" : ""}</button>
                {:else}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="pcr-ed-submenu-host" class:flip={layerMenu.flip}>
                    <button class="pcr-ed-submenu-trigger">Layer Mask<span class="pcr-ed-submenu-caret">▸</span></button>
                    <div class="pcr-ed-submenu">
                      <button onclick={() => { toggleMaskEdit(layerMenu.i); layerMenu = null; }}>{maskEdit && layerMenu.i === activeIndex ? "Done Editing Mask" : "Edit Mask (paint)"}</button>
                      <button onclick={() => { invertLayerMask(layerMenu.i); layerMenu = null; }}>Invert Mask</button>
                      <button onclick={() => { fillLayerMask(layerMenu.i, 255); layerMenu = null; }}>Reveal All</button>
                      <button onclick={() => { fillLayerMask(layerMenu.i, 0); layerMenu = null; }}>Hide All</button>
                      <div class="pcr-ed-menu-sep"></div>
                      <button onclick={() => { applyLayerMask(layerMenu.i); layerMenu = null; }}>Apply Layer Mask</button>
                      <button class="danger" onclick={() => { deleteLayerMask(layerMenu.i); layerMenu = null; }}>Delete Layer Mask</button>
                    </div>
                  </div>
                {/if}
              {/if}

              <!-- Image-wide / destructive -->
              <div class="pcr-ed-menu-sep"></div>
              <button onclick={() => { flattenImage(); layerMenu = null; }}>Flatten Image</button>
              {#if canDeleteSelected()}
                <button class="danger" onclick={() => { deleteSelectedLayers(); layerMenu = null; }}>{multi ? "Delete Layers" : "Delete Layer"}</button>
              {/if}
            </div>
          {/if}

          {#if canvasMenu}
            <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
            <div class="pcr-ed-layer-menu" style="left:{canvasMenu.x}px; top:{canvasMenu.y}px;">
              {#if selActive}
                <button onclick={() => { deselect(); commitAction("Deselect"); canvasMenu = null; }}>Deselect</button>
                <button onclick={() => { selectInverse(); commitAction("Select Inverse"); canvasMenu = null; }}>Select Inverse</button>
              {/if}
              <button onclick={() => { canvasMenu = null; beginTransform(); }}>{selActive ? "Free Transform Selection" : "Free Transform Layer"}</button>
              <button onclick={() => { selectAllRegion(); commitAction("Select All"); canvasMenu = null; }}>Select All</button>
              <button disabled={subjectBusy} onclick={() => { canvasMenu = null; selectSubject(); }}>
                {subjectBusy ? "Selecting Subject…" : "Select Subject"}</button>
              {#if selActive}
                <button onclick={() => { canvasMenu = null; layerViaCopy(false); }}>Layer Via Copy</button>
                <button onclick={() => { canvasMenu = null; layerViaCopy(true); }}>Layer Via Cut</button>
              {/if}
            </div>
          {/if}

        </div>
        </div>
      </div>
      {#if errorMsg}
        <div class="pcr-ed-error">⚠ {errorMsg}</div>
      {/if}
      {#if selSetupMsg}
        <div class="pcr-ed-error pcr-ed-busy">⏳ {selSetupMsg}</div>
      {:else if subjectBusy}
        <div class="pcr-ed-error pcr-ed-busy">⏳ Selecting subject…</div>
      {/if}
      <AdjustModal open={adjustOpen} sourceCanvas={adjustSrcCanvas} {filename}
        onApply={onAdjustApply}
        onCancel={() => { adjustOpen = false; adjustSrcCanvas = null; }} />
      {#if healDialog}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pcr-ed-dialog-backdrop" onclick={() => { healDialog = false; }}>
          <div class="pcr-ed-dialog" role="alertdialog">
            <div class="pcr-ed-dialog-text">
              Could not use the {tool === "stamp" ? "clone stamp" : "healing brush"} because the area to sample from has not been defined.
              <span class="pcr-ed-dialog-em">Alt-click</span> a clean area of the image to define a source point, then paint.
            </div>
            <div class="pcr-ed-dialog-btns">
              <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={() => { healDialog = false; }}>OK</button>
            </div>
          </div>
        </div>
      {/if}
      {#if hiddenEditDialog}
        <!-- PS "target layer is hidden" modal — same red-dialog pattern as the heal dialog -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pcr-ed-dialog-backdrop" onclick={() => { hiddenEditDialog = null; }}>
          <div class="pcr-ed-dialog" role="alertdialog">
            <div class="pcr-ed-dialog-text">{hiddenEditDialog}</div>
            <div class="pcr-ed-dialog-btns">
              <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={() => { hiddenEditDialog = null; }}>OK</button>
            </div>
          </div>
        </div>
      {/if}
      <div class="pcr-modal-footer">
        <div class="pcr-ed-footer-save">
          <span class="pcr-ed-label">Save to</span>
          <SavePathInput value={savePrefix} onChange={(v) => { savePrefix = v; }} {fetchApi} />
        </div>
        {#if editsSaved}<span class="pcr-ed-saved">✓ Edits saved</span>{/if}
        <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={close}>Cancel</button>
        <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={saveEdits}
          disabled={!editDocHash || !histIndex || savingEdits || saving}
          title={editDocHash ? "Save your layers back onto this image — no new file, keeps the thumbnail" : "This image can't store edits in place — use Save new image"}>
          {savingEdits ? "Saving…" : "Save edits"}
        </button>
        <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={save} disabled={!histIndex || saving || savingEdits}
          title={histIndex ? "Export the result as a new image (keeps the original)" : "Paint something first"}>
          {saving ? "Saving…" : "Save new image"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* near-fullscreen: this is a work surface — the canvas gets every pixel the
     monitor has, minus enough margin to still read as a modal */
  .pcr-ed-modal {
    position: relative; /* anchors the heal dialog overlay */
    width: 96vw; height: 94vh;
    min-width: 900px; max-width: 96vw;
    display: flex; flex-direction: column;
  }
  /* Maximized: fill the whole screen (the backdrop has no padding and centers,
     so 100vw/100vh sits flush). No border/radius so there's no seam at the edge. */
  .pcr-ed-modal.maximized {
    width: 100vw; height: 100vh;
    min-width: 0; max-width: 100vw;
    border: none; border-radius: 0;
  }
  .pcr-ed-headbtns { display: flex; align-items: center; gap: 2px; }
  .pcr-ed-body { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; }
  .pcr-ed-cols { display: flex; gap: 14px; flex: 1; min-height: 0; }
  /* Photoshop-style options bar */
  .pcr-ed-optbar {
    flex: none; display: flex; align-items: center; gap: 22px;
    padding: 0 12px; height: 38px; box-sizing: border-box;
    background: #232323; border: 1px solid #3a3a3a; border-radius: 6px;
  }
  /* gap absorbs the slider thumb's -50% overhang (7px past the track start) */
  .pcr-ed-opt { display: flex; align-items: center; gap: 16px; width: 225px; }
  .pcr-ed-opt .pcr-ed-label { flex: none; margin-top: 0; }
  .pcr-ed-opt-narrow { width: auto; }
  .pcr-ed-opt-hint { font-size: 11px; color: #777; }
  .pcr-ed-opt-readout { font-size: 12px; color: #ccc; font-family: monospace; min-width: 34px; }
  .pcr-ed-liq-seg { display: flex; border: 1px solid #3a3a3a; border-radius: 5px; overflow: hidden; flex: none; }
  .pcr-ed-liq-opt {
    padding: 3px 11px; font-size: 11.5px; color: #aaa;
    background: transparent; border: none; cursor: pointer;
  }
  .pcr-ed-liq-opt + .pcr-ed-liq-opt { border-left: 1px solid #3a3a3a; }
  .pcr-ed-liq-opt:hover:not(.active) { color: #ddd; }
  .pcr-ed-liq-opt.active { background: #c85909; color: #fff; }
  .pcr-ed-opt-select {
    font-size: 11.5px; color: #ccc; padding: 2px 6px;
    background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px;
  }
  .pcr-ed-air-toggle {
    width: 30px; height: 24px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px;
    color: #aaa; cursor: pointer;
  }
  /* Text toggles (e.g. Contiguous) size to their label instead of the 30px icon box. */
  .pcr-ed-text-toggle {
    width: auto; padding: 0 10px; font-size: 11.5px; white-space: nowrap;
  }
  .pcr-ed-air-toggle svg {
    width: 15px; height: 15px;
    fill: none; stroke: currentColor; stroke-width: 1.8;
    stroke-linecap: round; stroke-linejoin: round;
  }
  .pcr-ed-air-toggle:hover:not(.active) { color: #fff; border-color: #555; }
  .pcr-ed-air-toggle.active { background: #c85909; border-color: #c85909; color: #fff; }
  .pcr-ed-panel-hist { min-height: 0; }
  /* Cap the layer list so a tall stack scrolls inside itself instead of
     shoving Render/History off the bottom of the panel (PS layers behavior). */
  .pcr-ed-layers { display: flex; flex-direction: column; gap: 3px; max-height: 340px; overflow-y: auto; }
  .pcr-ed-layer-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 7px; border-radius: 4px; cursor: pointer;
    background: #1c1c1c; border: 1px solid #2e2e2e;
    -webkit-user-select: none; user-select: none; /* the name text must not hijack a press-drag */
  }
  .pcr-ed-layer-row:hover { border-color: #3d3d3d; }
  .pcr-ed-layer-row.selected { background: rgba(200, 89, 9, 0.10); border-color: #5a4630; }
  .pcr-ed-layer-row.active { border-color: #c85909; background: rgba(200, 89, 9, 0.18); }
  .pcr-ed-layer-row.dragover { border-top: 2px solid #c85909; }
  .pcr-ed-layer-menu {
    position: fixed; z-index: 100001; min-width: 150px;
    background: #232323; border: 1px solid #444; border-radius: 6px;
    padding: 4px; box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5);
    display: flex; flex-direction: column;
  }
  .pcr-ed-layer-menu button {
    text-align: left; padding: 6px 10px; font-size: 12px; color: #ddd;
    background: transparent; border: none; border-radius: 4px; cursor: pointer;
  }
  .pcr-ed-layer-menu button:hover { background: #c85909; color: #fff; }
  .pcr-ed-layer-menu button.danger:hover { background: #b23b3b; }
  .pcr-ed-menu-sep { height: 1px; margin: 4px 6px; background: #3a3a3a; }
  /* Mask actions collapse into a hover flyout (CSS-only, no timers). The flyout is
     a DOM descendant of .pcr-ed-layer-menu so the outside-click dismiss still works. */
  .pcr-ed-submenu-host { position: relative; display: flex; flex-direction: column; }
  .pcr-ed-submenu-trigger { display: flex; align-items: center; justify-content: space-between; }
  .pcr-ed-submenu-caret { color: #888; font-size: 11px; margin-left: 8px; }
  .pcr-ed-submenu {
    position: absolute; left: 100%; top: -5px; min-width: 160px;
    background: #232323; border: 1px solid #444; border-radius: 6px; padding: 4px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5); display: none; flex-direction: column; z-index: 1;
  }
  .pcr-ed-submenu-host.flip .pcr-ed-submenu { left: auto; right: 100%; }
  .pcr-ed-submenu-host:hover .pcr-ed-submenu, .pcr-ed-submenu:hover { display: flex; }
  .pcr-ed-submenu-host:hover .pcr-ed-submenu-trigger { background: #c85909; color: #fff; }
  .pcr-ed-layer-bg { cursor: default; opacity: 0.85; }
  .pcr-ed-layer-actions { display: flex; gap: 4px; }
  .pcr-ed-layer-btn {
    width: 22px; height: 20px; padding: 0; font-size: 12px; line-height: 1;
    color: #bbb; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; cursor: pointer;
  }
  .pcr-ed-layer-btn:hover:not(:disabled) { color: #fff; border-color: #555; }
  .pcr-ed-layer-btn:disabled { opacity: 0.4; cursor: default; }
  .pcr-ed-layer-grip {
    flex: none; width: 16px; text-align: center;
    font-size: 12px; line-height: 1; color: #666;
    cursor: grab; user-select: none;
  }
  .pcr-ed-layer-grip:hover { color: #aaa; }
  .pcr-ed-layer-grip:active { cursor: grabbing; }
  .pcr-ed-layer-grip.hidden { visibility: hidden; }
  .pcr-ed-eye {
    font-size: 12px; line-height: 1; cursor: pointer; width: 16px; text-align: center;
    user-select: none; color: #ccc;
  }
  .pcr-ed-eye.off { color: #666; }
  /* Photoshop-style layer-mask thumbnail (shows the mask shape; white glow = active paint target). */
  .pcr-ed-mask-thumb {
    flex: none; width: 18px; height: 18px; border-radius: 3px;
    object-fit: cover; background: #000; border: 1px solid #555; cursor: pointer;
  }
  .pcr-ed-mask-thumb:hover { border-color: #888; }
  .pcr-ed-mask-thumb.editing { border-color: #fff; box-shadow: 0 0 0 1px #fff, 0 0 0 3px rgba(255, 255, 255, 0.30); }
  .pcr-ed-layer-name { flex: 1; font-size: 12px; color: #ddd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pcr-ed-layer-blendtag { margin-left: 5px; font-size: 10px; color: #8b96a5; }
  .pcr-ed-layer-rename {
    flex: 1; min-width: 0; font-size: 12px; color: #eee;
    background: #1b1b1b; border: 1px solid #c85909; border-radius: 3px; padding: 1px 4px;
    -webkit-user-select: text; user-select: text; /* stays editable under the row's user-select:none */
  }
  .pcr-ed-blend-select {
    width: 100%; margin: 0 0 4px; padding: 3px 6px; font-size: 12px;
    color: #ddd; background: #242424; border: 1px solid #3d3d3d; border-radius: 4px;
  }
  .pcr-ed-blend-select:disabled { opacity: 0.45; }
  .pcr-ed-layer-opacity { width: 70px; accent-color: #c85909; }
  .pcr-ed-group-row { display: flex; align-items: center; gap: 4px; padding: 3px 5px; border: 1px solid #333; border-radius: 4px;
    background: rgba(120, 130, 150, 0.12); -webkit-user-select: none; user-select: none; }
  .pcr-ed-group-row .pcr-ed-eye { cursor: pointer; }
  .pcr-ed-group-name { flex: 1; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
  .pcr-ed-group-x { background: none; border: none; color: #999; cursor: pointer; font-size: 13px; padding: 0 2px; }
  .pcr-ed-group-x:hover { color: #fff; }
  .pcr-ed-layer-row.in-group { margin-left: 14px; }
  .pcr-ed-hist {
    display: flex; flex-direction: column;
    max-height: 170px; overflow-y: auto;
    border: 1px solid #303030; border-radius: 4px; background: #1d1d1d;
  }
  .pcr-ed-hist-row {
    flex: none; /* otherwise column-flex shrinks rows before the list scrolls */
    padding: 3px 9px; font-size: 11.5px; color: #bbb; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .pcr-ed-hist-row:hover:not(.active) { background: #2a2a2a; color: #eee; }
  .pcr-ed-hist-row.active { background: #c85909; color: #fff; }
  .pcr-ed-hist-row.future { opacity: 0.45; }
  .pcr-ed-left { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .pcr-ed-right { flex: 0 0 280px; min-height: 0; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 8px; }
  /* Photoshop-style stacked panels */
  .pcr-ed-panel {
    display: flex; flex-direction: column; gap: 6px;
    padding: 9px 10px 10px; background: #232323;
    border: 1px solid #3a3a3a; border-radius: 6px;
  }
  .pcr-ed-panel-title {
    font-size: 10.5px; color: #999; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.6px;
  }
  .pcr-ed-panel-titlerow { display: flex; justify-content: space-between; align-items: center; }
  /* Layers/History tabs share one panel (PS-style); History is the second tab. */
  .pcr-ed-lh-tabs { display: flex; gap: 10px; }
  .pcr-ed-lh-tab {
    background: none; border: none; cursor: pointer; padding: 0 1px 3px;
    font-size: 10.5px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase;
    color: #6b6b75; border-bottom: 2px solid transparent;
  }
  .pcr-ed-lh-tab:hover { color: #aaa; }
  .pcr-ed-lh-tab.active { color: #e0e0e0; border-bottom-color: #c85909; }
  .pcr-ed-nav-pct { font-size: 11px; color: #bbb; font-family: monospace; }
  .pcr-ed-nav-stage {
    position: relative; margin: 0 auto; overflow: hidden;
    cursor: crosshair; touch-action: none;
  }
  .pcr-ed-nav-stage img {
    display: block; user-select: none; pointer-events: none;
    border: 1px solid #3a3a3a; box-sizing: border-box;
  }
  .pcr-ed-nav-rect {
    position: absolute; border: 1px solid #ff3b30;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
    pointer-events: none;
  }
  .pcr-ed-nav-zoomrow { display: flex; align-items: center; gap: 6px; }
  .pcr-ed-nav-zbtn {
    width: 22px; height: 20px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; color: #aaa;
    background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; cursor: pointer;
  }
  .pcr-ed-nav-zbtn:hover { color: #fff; border-color: #555; }
  .pcr-ed-nav-slider { flex: 1; min-width: 0; accent-color: #c85909; }
  /* Photoshop-style vertical tool strip */
  .pcr-ed-toolstrip {
    position: relative; /* anchors the color popout */
    flex: none; display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 6px 4px; background: #232323;
    border: 1px solid #3a3a3a; border-radius: 6px;
  }
  /* PS-style color chip at the strip's foot; picker floats out beside it */
  .pcr-ed-strip-color {
    width: 26px; height: 26px; flex: none; padding: 0;
    border: 2px solid #555; border-radius: 4px; cursor: pointer;
  }
  .pcr-ed-strip-bgcolor {
    width: 20px; height: 20px; flex: none; padding: 0; margin-top: 3px;
    border: 1px solid #555; border-radius: 4px; cursor: pointer;
  }
  .pcr-ed-strip-bgcolor:hover { border-color: #888; }
  .pcr-ed-strip-color:hover { border-color: #888; }
  .pcr-ed-strip-color.open { border-color: #c85909; }
  .pcr-ed-color-pop {
    position: absolute; left: calc(100% + 10px);
    width: 250px; z-index: 30;
    display: flex; flex-direction: column; gap: 6px;
    padding: 10px; background: #262626;
    border: 1px solid #3f3f3f; border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  }
  .pcr-ed-pop-btns { display: flex; justify-content: flex-end; gap: 6px; margin-top: 2px; }
  .pcr-ed-pop-ok { background: #c85909; border-color: #c85909; color: #fff; }
  .pcr-ed-pop-ok:hover { border-color: #e06a14 !important; background: #e06a14; }
  .pcr-ed-strip-btn {
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; border-radius: 5px;
    color: #aaa; cursor: pointer;
  }
  .pcr-ed-strip-btn svg {
    width: 17px; height: 17px;
    fill: none; stroke: currentColor; stroke-width: 1.8;
    stroke-linecap: round; stroke-linejoin: round;
  }
  .pcr-ed-strip-btn:hover:not(:disabled):not(.active) { color: #fff; background: #2f2f2f; }
  .pcr-ed-strip-btn.active { background: #c85909; color: #fff; }
  .pcr-ed-strip-btn:disabled { opacity: 0.35; cursor: default; }
  .pcr-ed-strip-sep { width: 22px; height: 1px; background: #3a3a3a; margin: 4px 0; }
  .pcr-ed-tool-btn {
    padding: 3px 10px; font-size: 11.5px; color: #aaa;
    background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; cursor: pointer;
  }
  .pcr-ed-tool-btn:hover:not(:disabled) { color: #fff; border-color: #555; }
  .pcr-ed-tool-btn:disabled { opacity: 0.4; cursor: default; }
  .pcr-ed-viewport {
    position: relative; overflow: hidden;
    flex: 1; min-height: 0; background: #141414;
    border: 1px solid #3a3a3a; border-radius: 6px;
    touch-action: none; cursor: none; user-select: none;
  }
  .pcr-ed-viewport.drag-over { border-color: #5a8cff; box-shadow: inset 0 0 0 2px #5a8cff66; }
  .pcr-ed-viewport.eyedrop { cursor: crosshair; }
  .pcr-ed-viewport.select-mode { cursor: crosshair; }
  .pcr-ed-viewport.move-mode { cursor: move; }
  /* Free Transform: restore the OS cursor (base viewport hides it for brushes);
     the box body/handles set their own over the float */
  .pcr-ed-viewport.transform-mode { cursor: default; }
  /* hidden active layer + a paint/move tool → Photoshop's not-allowed cursor */
  .pcr-ed-viewport.no-edit, .pcr-ed-viewport.no-edit * { cursor: not-allowed !important; }
  .pcr-ed-lasso {
    position: absolute; inset: 0; pointer-events: none;
  }
  .pcr-ed-lasso-halo { fill: none; stroke: rgba(0, 0, 0, 0.55); stroke-linejoin: round; stroke-linecap: round; }
  .pcr-ed-lasso-line { fill: none; stroke: #fff; stroke-linejoin: round; stroke-linecap: round; }
  /* Mask-traced marching ants: solid black under a marching white dash. */
  .pcr-ed-snapguide { position: absolute; background: #ff36c6; pointer-events: none; z-index: 25; }
  .pcr-ed-ip-prompt {
    width: 100%; box-sizing: border-box; min-height: 56px; resize: vertical;
    margin: 4px 0; padding: 6px 8px; font-size: 12px; line-height: 1.4; color: #ddd;
    background: #1c1c1c; border: 1px solid #3a3a3a; border-radius: 5px; outline: none; font-family: inherit;
  }
  .pcr-ed-ip-prompt:focus { border-color: #c85909; }
  .pcr-ed-ip-row { display: flex; align-items: center; gap: 10px; margin: 4px 0; }
  .pcr-ed-render-row { display: flex; flex-wrap: wrap; gap: 8px; }
  /* ~50% basis → two buttons per row (a lone trailing button grows to full). */
  .pcr-ed-render-row .pcr-ed-ip-render { flex: 1 1 calc(50% - 4px); margin-top: 0; width: auto; white-space: nowrap; }
  .pcr-ed-ip-render {
    width: 100%; margin-top: 6px; padding: 7px 10px; font-size: 12.5px; color: #fff; cursor: pointer;
    background: #c85909; border: none; border-radius: 5px;
  }
  .pcr-ed-ip-render:hover:not(:disabled) { background: #e0680f; }
  .pcr-ed-ip-render:disabled { opacity: 0.45; cursor: default; }
  .pcr-ed-ip-progress { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .pcr-ed-ip-bar { flex: 1; height: 6px; border-radius: 3px; background: #1c1c1c; border: 1px solid #3a3a3a; overflow: hidden; }
  .pcr-ed-ip-bar-fill { height: 100%; background: #c85909; transition: width 0.2s ease; }
  .pcr-ed-ip-bar-fill.indet { width: 35%; animation: pcr-ed-ip-slide 1.2s ease-in-out infinite alternate; }
  @keyframes pcr-ed-ip-slide { from { margin-left: 0; } to { margin-left: 65%; } }
  .pcr-ed-selants { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
  /* non-scaling-stroke = width + dashes in screen px at any zoom (no /zoom math) */
  .pcr-ed-selants path { fill: none; vector-effect: non-scaling-stroke; }
  .pcr-ed-selants-bg { stroke: rgba(0, 0, 0, 0.85); stroke-width: 1.5; }
  .pcr-ed-selants-fg { stroke: #fff; stroke-width: 1.5; stroke-dasharray: 4 4; animation: pcr-ed-selants-march 0.9s linear infinite; }
  /* constant 8px = one 4+4 dash period → seamless loop at every zoom */
  @keyframes pcr-ed-selants-march { to { stroke-dashoffset: -8px; } }
  @media (prefers-reduced-motion: reduce) { .pcr-ed-selants-fg { animation: none; } }
  /* +/−/∩ mode badge that follows the cursor on a selection tool. */
  .pcr-ed-sel-badge {
    position: absolute; pointer-events: none; z-index: 30;
    font-size: 14px; font-weight: 700; line-height: 1; color: #fff;
    text-shadow: 0 0 3px #000, 0 0 3px #000;
  }
  /* isolation: blend modes must composite against the layer stack only, never
     the viewport chrome behind a transparent doc region */
  .pcr-ed-stage {
    position: absolute; transform-origin: 0 0; isolation: isolate;
    /* transparency checker behind the layers — any transparent pixel (the
       Background moved off, an erased area, a cutout layer) reads as empty,
       Photoshop-style, instead of looking like dark content */
    background-color: #2d2d2d;
    background-image:
      linear-gradient(45deg, #404040 25%, transparent 25%, transparent 75%, #404040 75%),
      linear-gradient(45deg, #404040 25%, transparent 25%, transparent 75%, #404040 75%);
    background-size: 16px 16px;
    background-position: 0 0, 8px 8px;
  }
  .pcr-ed-stage img { display: block; user-select: none; pointer-events: none; }
  .pcr-ed-stage canvas { position: absolute; inset: 0; pointer-events: none; }
  /* marching ants: four edge strips of alternating white/black, counter-
     scaled via --ant-* and marched clockwise */
  .pcr-ed-marquee {
    position: absolute; pointer-events: none;
    background-image:
      linear-gradient(90deg, #fff 50%, #000 50%),
      linear-gradient(90deg, #fff 50%, #000 50%),
      linear-gradient(0deg, #fff 50%, #000 50%),
      linear-gradient(0deg, #fff 50%, #000 50%);
    background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
    background-size:
      var(--ant-step) var(--ant-w), var(--ant-step) var(--ant-w),
      var(--ant-w) var(--ant-step), var(--ant-w) var(--ant-step);
    background-position: 0 0, 0 100%, 0 0, 100% 0;
    animation: pcr-ants 0.45s linear infinite;
  }
  @keyframes pcr-ants {
    to {
      background-position:
        var(--ant-step) 0, calc(-1 * var(--ant-step)) 100%,
        0 calc(-1 * var(--ant-step)), 100% var(--ant-step);
    }
  }
  /* one rotated frame; transform-origin defaults to center, matching the
     commit affine that rotates/flips about the box center */
  .pcr-ed-patch-wrap { position: absolute; pointer-events: none; }
  .pcr-ed-stage canvas.pcr-ed-patch {
    position: absolute; inset: auto; pointer-events: auto;
    cursor: move; image-rendering: auto;
  }
  .pcr-ed-rot-knob {
    position: absolute; background: #fff; border: 1px solid #c85909;
    border-radius: 50%; pointer-events: auto; cursor: grab;
    box-sizing: border-box;
  }
  .pcr-ed-rot-stem { position: absolute; background: #c85909; pointer-events: none; transform: translateX(-50%); }
  .pcr-ed-patch-border {
    position: absolute; border: 1px solid #c85909; pointer-events: none;
  }
  .pcr-ed-crop-shield {
    position: absolute; inset: 0; pointer-events: none;
  }
  .pcr-ed-crop-shield path { fill: rgba(0, 0, 0, 0.75); }
  .pcr-ed-crop-border {
    position: absolute; border: 1px solid rgba(255, 255, 255, 0.9);
    cursor: move; pointer-events: auto;
  }
  .pcr-ed-crop-border.fresh { cursor: crosshair; }
  .pcr-ed-crop-handle {
    position: absolute; pointer-events: auto;
    box-sizing: border-box; border: 0 solid #fff;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.6));
  }
  .pcr-ed-thirds {
    position: absolute; background: rgba(255, 255, 255, 0.35); pointer-events: none;
  }
  .pcr-ed-thirds-v { top: 0; bottom: 0; }
  .pcr-ed-thirds-h { left: 0; right: 0; }
  .pcr-ed-handle {
    position: absolute; background: #fff; border: 1px solid #c85909;
    border-radius: 2px; pointer-events: auto;
  }
  .pcr-ed-float-hint {
    position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
    padding: 4px 12px; font-size: 11px; color: #ffb27d; white-space: nowrap;
    background: rgba(20, 20, 20, 0.85); border: 1px solid rgba(200, 89, 9, 0.5);
    border-radius: 12px; pointer-events: none;
  }
  .pcr-ed-cursor {
    position: absolute; transform: translate(-50%, -50%);
    border: 1px solid rgba(255, 255, 255, 0.85); border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .pcr-ed-heal-src {
    position: absolute; transform: translate(-50%, -50%);
    border: 1.5px solid #fff; border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }
  .pcr-ed-heal-cross {
    position: absolute; width: 18px; height: 18px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8));
  }
  .pcr-ed-heal-cross::before, .pcr-ed-heal-cross::after {
    content: ""; position: absolute; background: #fff;
  }
  .pcr-ed-heal-cross::before { left: 50%; top: 0; bottom: 0; width: 1.5px; margin-left: -0.75px; }
  .pcr-ed-heal-cross::after { top: 50%; left: 0; right: 0; height: 1.5px; margin-top: -0.75px; }
  .pcr-ed-pick-bubble {
    position: absolute; width: 32px; height: 32px;
    transform: translate(-50%, -145%);
    border: 2px solid #fff; border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }
  .pcr-ed-footer-save {
    display: flex; align-items: center; gap: 10px;
    margin-right: auto; min-width: 0; flex: 0 1 520px;
  }
  .pcr-ed-footer-save .pcr-ed-label { flex: none; margin-top: 0; }
  .pcr-ed-saved { color: #6cc06c; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .pcr-ed-fname {
    color: #e0a875; font-weight: 400; font-family: monospace; font-size: 0.92em;
  }
  .pcr-ed-dims {
    margin-left: 10px; color: #777; font-weight: 400; font-size: 0.78em;
  }
  .pcr-ed-label { font-size: 11px; color: #888; margin-top: 6px; }
  .pcr-ed-sv {
    position: relative; width: 100%; height: 140px;
    border-radius: 5px; border: 1px solid #3a3a3a;
    cursor: crosshair; touch-action: none;
  }
  .pcr-ed-sv-white { position: absolute; inset: 0; border-radius: 4px; background: linear-gradient(to right, #fff, transparent); }
  .pcr-ed-sv-black { position: absolute; inset: 0; border-radius: 4px; background: linear-gradient(to top, #000, transparent); }
  .pcr-ed-sv-thumb {
    position: absolute; width: 12px; height: 12px; transform: translate(-50%, -50%);
    border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,0.6);
    pointer-events: none;
  }
  .pcr-ed-hue {
    position: relative; width: 100%; height: 14px; margin-top: 6px;
    border-radius: 7px; border: 1px solid #3a3a3a;
    cursor: crosshair; touch-action: none;
    background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
  }
  .pcr-ed-hue-thumb {
    position: absolute; top: 50%; width: 12px; height: 18px; transform: translate(-50%, -50%);
    border: 2px solid #fff; border-radius: 4px; box-shadow: 0 0 0 1px rgba(0,0,0,0.6);
    pointer-events: none;
  }
  .pcr-ed-color-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .pcr-ed-swatch {
    width: 22px; height: 22px; border-radius: 4px;
    border: 1px solid #3a3a3a; flex: none;
  }
  .pcr-ed-hex { font-size: 11.5px; color: #bbb; font-family: monospace; flex: 1; }
  .pcr-ed-hint { font-size: 10.5px; color: #666; }
  .pcr-ed-slider { display: flex; align-items: center; gap: 10px; }
  .pcr-ed-slider .pcr-ed-label { flex: none; width: 58px; margin-top: 0; }
  .pcr-ed-dialog-backdrop {
    position: absolute; inset: 0; z-index: 50;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.45); border-radius: inherit;
  }
  .pcr-ed-dialog {
    width: 380px; max-width: 80%;
    padding: 16px 18px 14px;
    background: #2b2b2b; border: 1px solid #444; border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
    display: flex; flex-direction: column; gap: 14px;
  }
  .pcr-ed-dialog-text { font-size: 12.5px; color: #ccc; line-height: 1.55; }
  .pcr-ed-dialog-em { color: #ffb27d; font-weight: 600; }
  .pcr-ed-dialog-btns { display: flex; justify-content: flex-end; }
  .pcr-ed-error {
    margin: 0 2px 2px; padding: 7px 12px;
    font-size: 12px; color: #ff8a80; line-height: 1.4;
    background: rgba(229, 57, 53, 0.12); border: 1px solid rgba(229, 57, 53, 0.4);
    border-radius: 5px; word-break: break-word;
  }
  .pcr-ed-busy {
    color: #b9c4d4;
    background: rgba(60, 120, 200, 0.12); border-color: rgba(60, 120, 200, 0.4);
  }
  .pcr-modal-btn:disabled { opacity: 0.45; cursor: default; }
  /* "restoring saved layers" overlay — covers the editor until the stack loads */
  .pcr-ed-restoring {
    position: absolute; inset: 0; z-index: 20;
    display: flex; align-items: center; justify-content: center;
    background: rgba(10, 10, 10, 0.72);
  }
  .pcr-ed-restoring-card {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 22px; border-radius: 10px;
    background: #1c1c1c; border: 1px solid #3a3a3a;
    color: #e0a875; font-size: 14px;
  }
  .pcr-ed-spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2.5px solid rgba(200, 89, 9, 0.25); border-top-color: #ffb27d;
    animation: pcr-ed-spin 0.7s linear infinite;
  }
  @keyframes pcr-ed-spin { to { transform: rotate(360deg); } }
</style>
