<script>
  // AdjustModal — Camera-Raw-style parametric adjustments in a fullscreen
  // modal (PS Camera Raw Filter pattern). Sliders are parameters into ONE
  // fixed pipeline recomputed from the original every change — never stacked
  // ops. OK renders full-res once and hands the result back as a single edit.
  //
  // Pipeline (formulas per GEGL/darktable/RawTherapee):
  //   decode sRGB→linear (LUT) → white balance gains + exposure (linear)
  //   → encode perceptual → tone LUT (blacks/whites/contrast/parametric curve)
  //   → shadows/highlights (blurred-luminance-guided soft-light, darktable)
  //   → vibrance/saturation → dehaze/clarity/texture → sharpen/NR → encode.
  // Tonal ops collapse into per-channel 256-LUTs; spatial ops share one
  // running-sum box blur. Preview renders at ≤1.4MP; OK renders full-res.

  import { portal } from "../lib/portal.js";
  import SettingsSlider from "./model/SettingsSlider.svelte";
  import "./sidebar/modal-shared.css";

  let {
    open,
    sourceCanvas = null,   // the active layer's pixels to adjust (caller scopes this)
    filename = "",
    onApply = null,        // (ImageData) => void
    onCancel,
  } = $props();

  const GROUPS = [
    { id: "light", label: "Light", sliders: [
      { key: "exposure", label: "Exposure", min: -5, max: 5, step: 0.05 },
      { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
      { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1 },
      { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1 },
      { key: "whites", label: "Whites", min: -100, max: 100, step: 1 },
      { key: "blacks", label: "Blacks", min: -100, max: 100, step: 1 },
    ]},
    { id: "color", label: "Color", sliders: [
      { key: "temp", label: "Temperature", min: -100, max: 100, step: 1,
        rail: "linear-gradient(to right, #3f6fd1, #6e7686 50%, #e3c44d)" },
      { key: "tint", label: "Tint", min: -100, max: 100, step: 1,
        rail: "linear-gradient(to right, #4fae57, #6e7686 50%, #c25ac2)" },
      { key: "vibrance", label: "Vibrance", min: -100, max: 100, step: 1,
        rail: "linear-gradient(to right, #7d7d7d, #a8806f 35%, #ad9a62 50%, #6f9d7c 70%, #6f7fad 85%, #a06fa3 100%)" },
      { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1,
        rail: "linear-gradient(to right, #808080, #c25c5c 30%, #c2a35c 50%, #5cc282 70%, #5c79c2 85%, #b05cc2 100%)" },
    ]},
    { id: "effects", label: "Effects", sliders: [
      { key: "texture", label: "Texture", min: -100, max: 100, step: 1 },
      { key: "clarity", label: "Clarity", min: -100, max: 100, step: 1 },
      { key: "dehaze", label: "Dehaze", min: -100, max: 100, step: 1 },
    ]},
    { id: "curve", label: "Curve", sliders: [
      { key: "curveH", label: "Highlights", min: -100, max: 100, step: 1 },
      { key: "curveL", label: "Lights", min: -100, max: 100, step: 1 },
      { key: "curveD", label: "Darks", min: -100, max: 100, step: 1 },
      { key: "curveS", label: "Shadows", min: -100, max: 100, step: 1 },
    ]},
    { id: "detail", label: "Detail", sliders: [
      { key: "sharpen", label: "Sharpening", min: 0, max: 150, step: 1 },
      { key: "noise", label: "Noise Reduction", min: 0, max: 100, step: 1 },
    ]},
  ];

  function defaultSettings() {
    const s = {};
    for (const g of GROUPS) for (const sl of g.sliders) s[sl.key] = 0;
    return s;
  }

  let settings = $state(defaultSettings());
  let collapsed = $state({});
  let applying = $state(false);

  // ── view ──
  let viewportEl;
  let previewCanvas = $state(null);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let panning = false;
  let panLast = null;

  // ── pipeline buffers ──
  let pw = 0, ph = 0;          // preview dims
  let srcW = 0, srcH = 0;      // full dims
  let preview8 = null;         // Uint8ClampedArray RGBA, preview-res source
  let rafPending = false;
  // progressive pipeline cache (preview only): 5 planar {R,G,B} checkpoints +
  // their param hashes; dirtyFrom = lowest stage to recompute on next render
  let cp = null;
  let cpHash = [null, null, null, null, null];
  let dirtyFrom = Infinity;

  const SRGB2LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    SRGB2LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function lin2perc(c) {
    c = Math.max(0, Math.min(1, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }
  function dither(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5;
  }

  $effect(() => {
    if (open && sourceCanvas) {
      settings = defaultSettings();
      collapsed = {};
      applying = false;
      srcW = sourceCanvas.width;
      srcH = sourceCanvas.height;
      // preview source at ≤1.4MP
      const scale = Math.min(1, Math.sqrt(1400000 / (srcW * srcH)));
      pw = Math.max(2, Math.round(srcW * scale));
      ph = Math.max(2, Math.round(srcH * scale));
      const c = document.createElement("canvas");
      c.width = pw; c.height = ph;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceCanvas, 0, 0, pw, ph);
      preview8 = ctx.getImageData(0, 0, pw, ph).data;
      // new source → invalidate the checkpoint cache (params may equal defaults,
      // whose hashes would otherwise match and skip the recompute)
      cpHash = [null, null, null, null, null];
      dirtyFrom = Infinity;
      // wait for the modal to actually have layout (rect is 0×0 on the first
      // frame → fit math lands off-screen), then size the canvas ourselves
      // (template-bound dims flush AFTER a draw and clear it)
      let tries = 0;
      const init = () => {
        const r = viewportEl?.getBoundingClientRect();
        if ((!r || r.width < 10) && tries++ < 20) { requestAnimationFrame(init); return; }
        if (previewCanvas) { previewCanvas.width = pw; previewCanvas.height = ph; }
        resetView();
        renderPreview();
      };
      requestAnimationFrame(init);
    }
  });

  // Esc/Enter handled here; the parent Edit modal ignores keys while open
  $effect(() => {
    if (!open) return;
    const onKey = (e) => {
      // Ctrl+Enter must never reach ComfyUI's Queue Prompt — even from inputs.
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        if (!applying) apply();
        return;
      }
      if (/^(INPUT|TEXTAREA)$/.test(e.target?.tagName || "")) return;
      if (e.key === "Escape" && !applying) {
        e.preventDefault(); e.stopPropagation();
        onCancel?.();
      } else if (e.key === "Enter" && !applying) {
        e.preventDefault(); e.stopPropagation();
        apply();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function resetView() {
    if (!viewportEl || !pw) { zoom = 1; panX = 0; panY = 0; return; }
    const rect = viewportEl.getBoundingClientRect();
    zoom = Math.min(rect.width / pw, rect.height / ph, 1) || 1;
    panX = (rect.width - pw * zoom) / 2;
    panY = (rect.height - ph * zoom) / 2;
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nz = Math.max(0.05, Math.min(8, zoom * factor));
    panX = cx - ((cx - panX) / zoom) * nz;
    panY = cy - ((cy - panY) / zoom) * nz;
    zoom = nz;
  }

  function onPointerDown(e) {
    if (e.button > 2) return;
    e.preventDefault();
    panning = true;
    panLast = { x: e.clientX, y: e.clientY };
    viewportEl.setPointerCapture(e.pointerId);
    if (e.button === 2) {
      window.addEventListener("contextmenu", (ev) => ev.preventDefault(),
        { capture: true, once: true });
    }
  }
  function onPointerMove(e) {
    if (!panning) return;
    panX += e.clientX - panLast.x;
    panY += e.clientY - panLast.y;
    panLast = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() { panning = false; }

  function setSlider(key, v) {
    settings[key] = v;
    dirtyFrom = Math.min(dirtyFrom, SEG_OF_KEY[key] ?? 0);
    scheduleRender();
  }

  function resetGroup(g) {
    for (const sl of g.sliders) settings[sl.key] = 0;
    dirtyFrom = Math.min(dirtyFrom, ...g.sliders.map((sl) => SEG_OF_KEY[sl.key] ?? 0));
    scheduleRender();
  }

  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderPreview();
    });
  }

  function renderPreview() {
    if (!preview8 || !previewCanvas) return;
    const out = runCachedPreview(preview8, pw, ph, pw / srcW);
    previewCanvas.getContext("2d").putImageData(out, 0, 0);
  }

  async function apply() {
    if (!onApply || applying) return;
    applying = true;
    // let the disabled state paint before the heavy full-res render
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
      const full = ctx.getImageData(0, 0, srcW, srcH).data;
      const out = runFull(full, srcW, srcH, 1);
      onApply(out);
    } finally {
      applying = false;
    }
  }

  // ════ pipeline ════

  // tone LUT over perceptual x: black/white points → logistic contrast →
  // parametric 4-region curve (raised-cosine bumps, splits .25/.5/.75)
  function buildToneLUT(s) {
    const N = 1024;
    const lut = new Float32Array(N);
    const bp = -(s.blacks / 100) * 0.15;
    const wp = 1 - (s.whites / 100) * 0.15;
    const span = Math.max(0.05, wp - bp);
    const k = Math.pow(3, s.contrast / 100);
    const cS = s.curveS / 100, cD = s.curveD / 100, cL = s.curveL / 100, cH = s.curveH / 100;
    for (let i = 0; i < N; i++) {
      let y = Math.max(0, Math.min(1, (i / (N - 1) - bp) / span));
      if (k !== 1) {
        const yk = Math.pow(y, k);
        y = yk / (yk + Math.pow(1 - y, k));
      }
      let add = 0;
      if (cS && y < 0.25) add += cS * (1 + Math.cos(Math.PI * y / 0.25)) / 2;
      if (cD && y < 0.5) { const t = Math.sin(Math.PI * y / 0.5); add += cD * t * t; }
      if (cL && y >= 0.5) { const t = Math.sin(Math.PI * (y - 0.5) / 0.5); add += cL * t * t; }
      if (cH && y > 0.75) add += cH * (1 - Math.cos(Math.PI * (y - 0.75) / 0.25)) / 2;
      lut[i] = Math.max(0, Math.min(1, y + 0.25 * add));
    }
    // Enforce monotonicity: large/opposing parametric bumps can fold the curve back
    // on itself (output decreasing as input rises), which inverts/solarizes tones.
    // Clamp any fold to a flat plateau instead — graceful, and keeps full slider
    // strength wherever the curve is still rising.
    for (let i = 1; i < N; i++) if (lut[i] < lut[i - 1]) lut[i] = lut[i - 1];
    return lut;
  }

  // per-channel 256-LUTs: decode → WB gain → exposure → perceptual → tone
  function buildChannelLUTs(s) {
    const t = s.temp / 100, ti = s.tint / 100;
    let gR = 1 + 0.3 * t, gB = 1 - 0.3 * t, gG = 1 + 0.12 * ti;
    const Y = 0.2126 * gR + 0.7152 * gG + 0.0722 * gB; // keep overall luma
    gR /= Y; gG /= Y; gB /= Y;
    const ev = Math.pow(2, s.exposure);
    const tone = buildToneLUT(s);
    const gains = [gR * ev, gG * ev, gB * ev];
    const luts = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
    for (let ch = 0; ch < 3; ch++) {
      for (let i = 0; i < 256; i++) {
        const p = lin2perc(SRGB2LIN[i] * gains[ch]);
        luts[ch][i] = tone[Math.min(1023, (p * 1023) | 0)];
      }
    }
    return luts;
  }

  // separable box blur (running sums), iterated 3× ≈ gaussian
  function boxBlur(src, w, h, radius, iterations = 3) {
    const r = Math.max(1, Math.round(radius));
    let a = Float32Array.from(src);
    let b = new Float32Array(src.length);
    const norm = 1 / (2 * r + 1);
    for (let it = 0; it < iterations; it++) {
      for (let y = 0; y < h; y++) { // horizontal
        const row = y * w;
        let acc = a[row] * (r + 1);
        for (let x = 1; x <= r; x++) acc += a[row + Math.min(x, w - 1)];
        for (let x = 0; x < w; x++) {
          b[row + x] = acc * norm;
          acc += a[row + Math.min(x + r + 1, w - 1)] - a[row + Math.max(x - r, 0)];
        }
      }
      for (let x = 0; x < w; x++) { // vertical
        let acc = b[x] * (r + 1);
        for (let y = 1; y <= r; y++) acc += b[Math.min(y, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
          a[y * w + x] = acc * norm;
          acc += b[Math.min(y + r + 1, h - 1) * w + x] - b[Math.max(y - r, 0) * w + x];
        }
      }
    }
    return a;
  }

  function softLight(ta, lb) {
    return ta > 0.5 ? 1 - (1 - 2 * (ta - 0.5)) * (1 - lb) : 2 * ta * lb;
  }

  // ── planar helpers (shared by every stage) ──
  function planarLum(R, G, B, n) {
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
    return L;
  }
  function applyRatio(R, G, B, i, ratio) {
    if (!isFinite(ratio)) return;
    R[i] = Math.max(0, Math.min(1, R[i] * ratio));
    G[i] = Math.max(0, Math.min(1, G[i] * ratio));
    B[i] = Math.max(0, Math.min(1, B[i] * ratio));
  }

  // ── pipeline stages: each mutates the planar R/G/B in place from its input.
  // Order matches the original single-pass pipeline exactly; a stage with all
  // its params at default is a no-op (so its checkpoint == its input). ──
  function stageDecode(R, G, B, src8, n, luts) {
    for (let i = 0; i < n; i++) {
      R[i] = luts[0][src8[i * 4]];
      G[i] = luts[1][src8[i * 4 + 1]];
      B[i] = luts[2][src8[i * 4 + 2]];
    }
  }

  // shadows/highlights — blurred-luminance guide selects the region (local:
  // recovers a sky without dragging midtones). Highlights compress/expand the
  // bright range about mid-gray graded by guide membership — the soft-light
  // form had almost no range at the top (a 0.95 px moved at most to 0.905, a
  // dead slider).
  function stageShadowsHighlights(R, G, B, n, w, h, s) {
    if (s.highlights === 0 && s.shadows === 0) return;
    const L = planarLum(R, G, B, n);
    const guide = boxBlur(L, w, h, Math.max(6, Math.min(w, h) * 0.04));
    const hl = s.highlights / 100, sh = s.shadows / 100;
    const smooth = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    for (let i = 0; i < n; i++) {
      let ta = L[i];
      if (ta <= 0.001) continue;
      if (hl !== 0) {
        const m = smooth(0.45, 0.85, guide[i]);
        if (m > 0) {
          const g = 1 + hl * (hl < 0 ? 0.6 : 0.35) * m;
          ta = 0.5 + (ta - 0.5) * g;
        }
      }
      if (sh !== 0) {
        const tb = 1 - guide[i];
        if (tb > 0.5) {
          const optrans = Math.min(1, sh * sh) * Math.min(1, 2 * tb - 1);
          if (optrans > 0) {
            const lb = (tb - 0.5) * Math.sign(sh) * Math.sign(1 - ta) + 0.5;
            ta = ta * (1 - optrans) + softLight(ta, lb) * optrans;
          }
        }
      }
      ta = Math.max(0, Math.min(1, ta));
      if (ta !== L[i]) applyRatio(R, G, B, i, ta / L[i]);
    }
  }

  // vibrance (low-sat-weighted, glfx) + saturation (luma-preserving)
  function stageColor(R, G, B, n, s) {
    if (s.vibrance === 0 && s.saturation === 0) return;
    const v = s.vibrance / 100;
    const satScale = 1 + s.saturation / 100;
    for (let i = 0; i < n; i++) {
      let r = R[i], g = G[i], b = B[i];
      if (v !== 0) {
        const mx = Math.max(r, g, b);
        const avg = (r + g + b) / 3;
        const amt = (mx - avg) * 3 * -v;
        r = r * (1 - amt) + mx * amt;
        g = g * (1 - amt) + mx * amt;
        b = b * (1 - amt) + mx * amt;
      }
      if (satScale !== 1) {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = gray + (r - gray) * satScale;
        g = gray + (g - gray) * satScale;
        b = gray + (b - gray) * satScale;
      }
      R[i] = Math.max(0, Math.min(1, r));
      G[i] = Math.max(0, Math.min(1, g));
      B[i] = Math.max(0, Math.min(1, b));
    }
  }

  // dehaze — dark channel prior (He et al.), box-refined transmission
  function stageDehaze(R, G, B, n, w, h, s) {
    if (s.dehaze === 0) return;
    const d = s.dehaze / 100;
    if (d > 0) {
      const dark = new Float32Array(n);
      for (let i = 0; i < n; i++) dark[i] = Math.min(R[i], G[i], B[i]);
      const darkMin = boxBlur(dark, w, h, Math.max(4, Math.min(w, h) * 0.015), 1);
      // atmospheric light ≈ high percentile of the hazy regions
      let A = 0.05;
      for (let i = 0; i < n; i += 7) if (darkMin[i] > A) A = darkMin[i];
      A = Math.min(1, A + 0.05);
      const trans = boxBlur(darkMin, w, h, Math.max(8, Math.min(w, h) * 0.03), 2);
      for (let i = 0; i < n; i++) {
        const t = Math.max(0.15, 1 - 0.95 * (trans[i] / A));
        const jr = (R[i] - A) / t + A, jg = (G[i] - A) / t + A, jb = (B[i] - A) / t + A;
        R[i] = Math.max(0, Math.min(1, R[i] + (jr - R[i]) * d));
        G[i] = Math.max(0, Math.min(1, G[i] + (jg - G[i]) * d));
        B[i] = Math.max(0, Math.min(1, B[i] + (jb - B[i]) * d));
      }
    } else {
      // negative = add haze: lift toward light gray
      const k = -d * 0.35;
      for (let i = 0; i < n; i++) {
        R[i] += (0.85 - R[i]) * k; G[i] += (0.85 - G[i]) * k; B[i] += (0.85 - B[i]) * k;
      }
    }
  }

  // clarity (large-radius USM on L, midtone-weighted) + texture (bandpass)
  function stageClarityTexture(R, G, B, n, w, h, scale, s) {
    if (s.clarity === 0 && s.texture === 0) return;
    const L = planarLum(R, G, B, n);
    let detail = null;
    if (s.clarity !== 0) {
      const Lb = boxBlur(L, w, h, Math.max(8, Math.min(w, h) * 0.06));
      detail = new Float32Array(n);
      const c = (s.clarity / 100) * 0.9;
      for (let i = 0; i < n; i++) {
        detail[i] = c * (L[i] - Lb[i]) * 4 * L[i] * (1 - L[i]);
      }
    }
    if (s.texture !== 0) {
      const fine = boxBlur(L, w, h, Math.max(1, 2 * scale), 2);
      const coarse = boxBlur(L, w, h, Math.max(3, 12 * scale), 2);
      const t = (s.texture / 100) * 0.7;
      if (!detail) detail = new Float32Array(n);
      for (let i = 0; i < n; i++) detail[i] += t * (fine[i] - coarse[i]);
    }
    for (let i = 0; i < n; i++) {
      if (L[i] > 0.001 && detail[i] !== 0) applyRatio(R, G, B, i, (L[i] + detail[i]) / L[i]);
    }
  }

  // detail: sharpen (small USM) + luminance NR (edge-soft blur blend)
  function stageDetail(R, G, B, n, w, h, scale, s) {
    if (!(s.sharpen > 0) && !(s.noise > 0)) return;
    const L = planarLum(R, G, B, n);
    if (s.noise > 0) {
      const k = s.noise / 100;
      const Ls = boxBlur(L, w, h, Math.max(1, 1.5 * scale), 2);
      for (let i = 0; i < n; i++) {
        // edge-soft: blend less where local contrast is strong
        const e = Math.min(1, Math.abs(L[i] - Ls[i]) * 12);
        const nl = L[i] + (Ls[i] - L[i]) * k * (1 - e);
        if (L[i] > 0.001) applyRatio(R, G, B, i, nl / L[i]);
        L[i] = nl;
      }
    }
    if (s.sharpen > 0) {
      const amt = (s.sharpen / 100) * 1.2;
      const Lb = boxBlur(L, w, h, Math.max(1, Math.round(1 * scale)), 2);
      for (let i = 0; i < n; i++) {
        const hp = L[i] - Lb[i];
        if (L[i] > 0.001 && hp !== 0) applyRatio(R, G, B, i, (L[i] + amt * hp) / L[i]);
      }
    }
  }

  // encode with stable hash dither
  function encodePlanar(R, G, B, src8, w, h) {
    const out = new ImageData(w, h);
    const o = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, j = i * 4;
        const dd = dither(x, y);
        o[j] = Math.max(0, Math.min(255, Math.round(R[i] * 255 + dd)));
        o[j + 1] = Math.max(0, Math.min(255, Math.round(G[i] * 255 + dd)));
        o[j + 2] = Math.max(0, Math.min(255, Math.round(B[i] * 255 + dd)));
        o[j + 3] = src8[j + 3];
      }
    }
    return out;
  }

  // ── segments → checkpoints ──
  // 6 logical stages collapse to 5 checkpointed segments: S0 decode, S1 shad/hi,
  // S2 color+dehaze (the cheap color point-op fuses into the dehaze spatial pass
  // so we only checkpoint at expensive boundaries), S3 clarity/texture, S4
  // detail. Each spatial segment is the real cost (1–3 box-blurs); a slider
  // change recomputes only from its segment forward.
  const SEG_DEPS = [
    ["temp", "tint", "exposure", "contrast", "blacks", "whites", "curveH", "curveL", "curveD", "curveS"],
    ["highlights", "shadows"],
    ["vibrance", "saturation", "dehaze"],
    ["clarity", "texture"],
    ["sharpen", "noise"],
  ];
  const SEG_OF_KEY = {};
  SEG_DEPS.forEach((keys, k) => keys.forEach((key) => { SEG_OF_KEY[key] = k; }));
  const segHash = (k) => SEG_DEPS[k].map((key) => settings[key]).join(",");

  function runSegment(k, R, G, B, n, w, h, scale, s) {
    if (k === 1) stageShadowsHighlights(R, G, B, n, w, h, s);
    else if (k === 2) { stageColor(R, G, B, n, s); stageDehaze(R, G, B, n, w, h, s); }
    else if (k === 3) stageClarityTexture(R, G, B, n, w, h, scale, s);
    else if (k === 4) stageDetail(R, G, B, n, w, h, scale, s);
  }

  // Cold full pipeline — apply()/full-res OK. One planar triple, no cache (it
  // runs once, so there's nothing to amortize and full-res checkpoints would
  // cost hundreds of MB).
  function runFull(src8, w, h, scale) {
    const s = settings;
    const n = w * h;
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    stageDecode(R, G, B, src8, n, buildChannelLUTs(s));
    for (let k = 1; k <= 4; k++) runSegment(k, R, G, B, n, w, h, scale, s);
    return encodePlanar(R, G, B, src8, w, h);
  }

  function ensureCheckpoints(n) {
    if (cp && cp[0].R.length === n) return;
    cp = [];
    for (let k = 0; k < 5; k++) {
      cp.push({ R: new Float32Array(n), G: new Float32Array(n), B: new Float32Array(n) });
    }
    cpHash = [null, null, null, null, null];
  }

  // Preview pipeline with the checkpoint cache. Recomputes from the lowest dirty
  // segment, feeding each segment the cached output of the one before it; the
  // par-hash check is a self-correcting safety net if dirtyFrom ever drifts.
  function runCachedPreview(src8, w, h, scale) {
    const s = settings;
    const n = w * h;
    ensureCheckpoints(n);
    let from = dirtyFrom;
    for (let k = 0; k < Math.min(from, 5); k++) {
      if (cpHash[k] !== segHash(k)) { from = k; break; }
    }
    dirtyFrom = Infinity;
    if (from <= 4) {
      const luts = from === 0 ? buildChannelLUTs(s) : null;
      for (let k = from; k < 5; k++) {
        const cur = cp[k];
        if (k === 0) {
          stageDecode(cur.R, cur.G, cur.B, src8, n, luts);
        } else {
          const prev = cp[k - 1];
          cur.R.set(prev.R); cur.G.set(prev.G); cur.B.set(prev.B);
          runSegment(k, cur.R, cur.G, cur.B, n, w, h, scale, s);
        }
        cpHash[k] = segHash(k);
      }
    }
    return encodePlanar(cp[4].R, cp[4].G, cp[4].B, src8, w, h);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div use:portal class="pcr-modal-backdrop pcr-adj-backdrop">
    <div class="pcr-modal pcr-adj-modal" role="dialog" aria-modal="true">
      <div class="pcr-modal-header">
        <span class="pcr-modal-title">Camera Raw: <span class="pcr-adj-fname">{filename}</span></span>
        <button class="pcr-modal-close" onclick={() => onCancel?.()} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="pcr-modal-body pcr-adj-body">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pcr-adj-viewport" bind:this={viewportEl}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
          onwheel={onWheel}
          oncontextmenu={(e) => e.preventDefault()}
          ondblclick={resetView}>
          <div class="pcr-adj-stage" style="transform: translate({panX}px, {panY}px) scale({zoom});">
            <canvas bind:this={previewCanvas}></canvas>
          </div>
        </div>
        <div class="pcr-adj-panel">
          {#each GROUPS as g}
            <div class="pcr-adj-group">
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="pcr-adj-group-head" onclick={() => { collapsed[g.id] = !collapsed[g.id]; }}>
                <svg class="pcr-adj-chev" class:open={!collapsed[g.id]} viewBox="0 0 24 24">
                  <path d="m9 6 6 6-6 6"/>
                </svg>
                <span class="pcr-adj-group-title">{g.label}</span>
                <button class="pcr-adj-group-reset" title="Reset {g.label}"
                  onclick={(e) => { e.stopPropagation(); resetGroup(g); }}>↺</button>
              </div>
              {#if !collapsed[g.id]}
                <div class="pcr-adj-group-body">
                  {#each g.sliders as sl}
                    <div class="pcr-adj-slider">
                      <span class="pcr-adj-label">{sl.label}</span>
                      <SettingsSlider min={sl.min} max={sl.max} step={sl.step}
                        value={settings[sl.key]} savedValue={0} rail={sl.rail}
                        onChange={(v) => setSlider(sl.key, v)} />
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
      <div class="pcr-modal-footer">
        <span class="pcr-adj-hint">scroll zooms · drag pans · double-click fits · sliders preview live, OK applies once</span>
        <button class="pcr-modal-btn pcr-modal-btn-secondary" onclick={() => onCancel?.()} disabled={applying}>Cancel</button>
        <button class="pcr-modal-btn pcr-modal-btn-primary" onclick={apply} disabled={applying}>
          {applying ? "Applying…" : "OK"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pcr-adj-backdrop { z-index: 10010; }
  .pcr-adj-modal {
    width: 97vw; height: 95vh;
    min-width: 900px; max-width: 97vw;
    display: flex; flex-direction: column;
  }
  .pcr-adj-fname { color: #e0a875; font-weight: 400; font-family: monospace; font-size: 0.92em; }
  .pcr-adj-body { display: flex; gap: 12px; flex: 1; min-height: 0; }
  .pcr-adj-viewport {
    position: relative; overflow: hidden; flex: 1; min-width: 0;
    background: #141414; border: 1px solid #3a3a3a; border-radius: 6px;
    touch-action: none; cursor: grab; user-select: none;
  }
  .pcr-adj-viewport:active { cursor: grabbing; }
  .pcr-adj-stage { position: absolute; transform-origin: 0 0; }
  .pcr-adj-stage canvas { display: block; }
  .pcr-adj-panel {
    flex: 0 0 300px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 8px;
    padding-right: 2px;
  }
  .pcr-adj-group {
    background: #232323; border: 1px solid #3a3a3a; border-radius: 6px;
    flex: none;
  }
  .pcr-adj-group-head {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 10px; cursor: pointer;
  }
  .pcr-adj-chev {
    width: 13px; height: 13px; flex: none;
    fill: none; stroke: #888; stroke-width: 2.2;
    stroke-linecap: round; stroke-linejoin: round;
    transition: transform 0.12s;
  }
  .pcr-adj-chev.open { transform: rotate(90deg); }
  .pcr-adj-group-title {
    flex: 1; font-size: 11px; color: #ccc; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.6px;
  }
  .pcr-adj-group-reset {
    width: 20px; height: 20px; flex: none;
    background: transparent; border: none; border-radius: 4px;
    color: #777; font-size: 13px; cursor: pointer; line-height: 1;
  }
  .pcr-adj-group-reset:hover { color: #fff; background: #2f2f2f; }
  .pcr-adj-group-body {
    display: flex; flex-direction: column; gap: 7px;
    padding: 2px 10px 11px;
  }
  .pcr-adj-slider { display: flex; align-items: center; gap: 12px; }
  .pcr-adj-label { flex: none; width: 78px; font-size: 11px; color: #999; }
  .pcr-adj-hint {
    margin-right: auto; font-size: 11px; color: #777;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .pcr-modal-btn:disabled { opacity: 0.5; cursor: default; }
</style>
