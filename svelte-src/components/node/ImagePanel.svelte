<script>
  // Image panel — right-side preview for generated images.
  // Zoom/pan, progress bar, divider resize.

  import { onMount, onDestroy } from "svelte";
  import { useApi } from "../../lib/api-context.js";

  const DEFAULT_WIDTH = 150;
  const MIN_WIDTH = 80;
  const MAX_ZOOM = 8;

  let {
    node,
    shared,
    onToggle = () => {},
    onRegister = null,
  } = $props();

  const { getWorkflowId, fetchWorkflowImages, getCachedImages, openViewer,
    apiURL, getCanvasScale } = useApi();

  let panelEl;
  let dividerEl;
  let imgEl;
  let videoEl;
  let imgContainerEl;
  let isVisible = $state(!!node.properties?.pcrImagePreview);
  let panelWidth = $state(node.properties?.pcrImagePanelWidth || DEFAULT_WIDTH);
  let currentImageUrl = $state(null);
  // Resolves to the DB entry hash of the currently displayed image once
  // recordGeneration has committed it to the cache. handleFilenameClick
  // awaits this so the viewer opens the exact image the filename names,
  // even if the click lands between the executed event and the async POST.
  let latestHashPromise = null;
  let isPreviewMode = $state(false);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let imageLoaded = $state(false);
  let imageError = $state(false);
  let naturalWidth = $state(0);
  let naturalHeight = $state(0);

  // progress state
  let showProgress = $state(false);
  let progressIndeterminate = $state(false);
  let progressValue = $state(0);
  let progressMax = $state(1);
  let lastProgressTime = 0;
  let progressDuration = 1;

  // react to shared state changes (main.js sets these on execution events)
  $effect(() => {
    if (shared.imageUrl && shared.imageUrl !== currentImageUrl && !isPreviewMode) {
      currentImageUrl = shared.imageUrl;
      isPreviewMode = false;
      if (isVisible && imgEl) imgEl.style.opacity = "";
    }
  });

  $effect(() => {
    if (shared.previewUrl && isVisible) {
      isPreviewMode = true;
      currentImageUrl = shared.previewUrl;
      if (imgEl) imgEl.style.opacity = "";
    }
  });

  $effect(() => {
    const progress = shared.progress;
    const generating = shared.isGenerating;

    if (progress) {
      // determinate progress data takes priority
      showProgress = true;
      progressIndeterminate = false;
      const now = performance.now();
      if (lastProgressTime > 0) {
        const delta = (now - lastProgressTime) / 1000;
        progressDuration = progressDuration === 1 ? delta : progressDuration * 0.7 + delta * 0.3;
      }
      lastProgressTime = now;
      progressValue = progress.value;
      progressMax = progress.max;
    } else if (generating) {
      // no progress data but generating — show indeterminate
      if (isVisible) {
        isPreviewMode = true;
        if (imgEl) imgEl.style.opacity = "0.3";
      }
      showProgress = true;
      progressIndeterminate = true;
    } else {
      // idle — clear the dim-while-generating opacity the generating
      // branch sets; otherwise the final image stays at 0.3 after the run
      showProgress = false;
      lastProgressTime = 0;
      progressDuration = 1;
      if (imgEl) imgEl.style.opacity = "";
    }
  });

  function parseImageUrl(url) {
    try {
      const u = new URL(url, location.origin);
      return { filename: u.searchParams.get("filename") || "", subfolder: u.searchParams.get("subfolder") || "" };
    } catch { return { filename: "", subfolder: "" }; }
  }

  // Video outputs (Wan/AnimateDiff/…) arrive through the same executed event as
  // images but name an .mp4/.webm file — render those in a <video>, not <img>.
  let isVideoUrl = $derived.by(() => {
    if (!currentImageUrl) return false;
    return /\.(mp4|webm|m4v|mov)(\?|$)/i.test(parseImageUrl(currentImageUrl).filename);
  });

  let filenameDisplay = $derived.by(() => {
    if (shared.isGenerating) return "Generating\u2026";
    if (!currentImageUrl) return "";
    const { filename, subfolder } = parseImageUrl(currentImageUrl);
    return subfolder ? `${subfolder}/${filename}` : filename;
  });

  let infoText = $derived.by(() => {
    if (showProgress || !naturalWidth) return "";
    const parts = [];
    try {
      const url = new URL(currentImageUrl, location.origin);
      const ext = url.pathname.slice(url.pathname.lastIndexOf(".") + 1).toUpperCase();
      if (ext && ext.length <= 4) parts.push(ext);
    } catch {}
    parts.push(`${naturalWidth}×${naturalHeight}`);
    parts.push(`${Math.round(zoom * 100)}%`);
    return parts.join("   ");
  });

  let progressPercent = $derived(Math.round((progressValue / progressMax) * 100));

  // Upper bound for panelWidth: row width minus AI panel and dividers.
  // Editor stack is allowed to fully collapse — the panel can cover it.
  // Returns +Infinity until the row has laid out so the initial state
  // isn't accidentally clamped to MIN_WIDTH.
  function getMaxPanelWidth() {
    const row = panelEl?.parentElement;
    const rowWidth = row?.offsetWidth || 0;
    if (!rowWidth) return Number.POSITIVE_INFINITY;
    const aiPanelW = row.querySelector(".pcr-ai-panel")?.offsetWidth || 0;
    const aiDividerW = row.querySelector(".pcr-ai-divider")?.offsetWidth || 0;
    const dividerW = dividerEl?.offsetWidth || 0;
    return Math.max(MIN_WIDTH, rowWidth - aiPanelW - aiDividerW - dividerW);
  }

  function clampPanelWidth(value) {
    return Math.min(Math.max(MIN_WIDTH, value), getMaxPanelWidth());
  }

  function applyTransform() {
    if (!imgEl) return;
    imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    imgEl.style.cursor = zoom > 1 ? "grab" : "";
  }

  function resetZoom(animate = false) {
    zoom = 1; panX = 0; panY = 0;
    if (animate && imgEl) {
      imgEl.style.transition = "transform 0.2s ease-out";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (imgEl) imgEl.style.transition = "none";
      }));
    }
    applyTransform();
  }

  function handleImageLoad() {
    imageLoaded = true;
    imageError = false;
    naturalWidth = imgEl?.naturalWidth || 0;
    naturalHeight = imgEl?.naturalHeight || 0;
    if (!isPreviewMode) resetZoom();
  }

  function handleVideoLoaded() {
    imageLoaded = true;
    imageError = false;
    naturalWidth = videoEl?.videoWidth || 0;
    naturalHeight = videoEl?.videoHeight || 0;
  }

  function handleImageError() {
    imageLoaded = false;
    imageError = true;
    currentImageUrl = null;
    fetchLatestImage();
  }

  async function fetchLatestImage() {
    const wid = getWorkflowId();
    if (!wid) return;
    const images = await fetchWorkflowImages(wid);
    if (!images.length) return;
    let target = images[0];
    const compiled = node.properties?.pcrCompiledOutput;
    if (compiled) {
      const match = images.find(img => img.prompt === compiled);
      if (match) target = match;
    }
    const params = new URLSearchParams({
      filename: target.filename,
      subfolder: target.subfolder || "",
      type: target.source_type || "output",
    });
    currentImageUrl = apiURL(`/view?${params}`);
    isPreviewMode = false;
    latestHashPromise = target.hash ? Promise.resolve(target.hash) : null;
  }

  async function handleFilenameClick(e) {
    e.stopPropagation();
    if (shared.isGenerating) return;
    if (!currentImageUrl) return;
    const wid = getWorkflowId() || "";
    // Await the in-flight recordGeneration so the cache contains the entry
    // we're about to search for. Without this, a click between the executed
    // event and the POST response falls through findIndex and opens the
    // wrong image.
    const hash = latestHashPromise ? await latestHashPromise : null;
    const images = getCachedImages(wid);
    if (hash) {
      const idx = images.findIndex(img => img.hash === hash);
      if (idx >= 0) { openViewer(images, idx, wid); return; }
    }
    const { filename, subfolder } = parseImageUrl(currentImageUrl);
    const idx = images.findIndex(img => img.filename === filename && (img.subfolder || "") === subfolder);
    if (idx >= 0) openViewer(images, idx, wid);
    else if (images.length) openViewer(images, 0, wid);
  }

  // External subscribers (e.g. fullscreen bridge's topbar-icon sync).
  // Fires on every visibility change, including the internal close
  // button which calls toggle() in component scope — bypassing any
  // wrapper the bridge might try to put on the registered API.
  let toggleListener = null;

  function emitToggle(visible) {
    onToggle(visible);
    toggleListener?.(visible);
  }

  export function show() {
    isVisible = true;
    if (node.properties) node.properties.pcrImagePreview = true;
    emitToggle(true);
    if (currentImageUrl && imgEl) imgEl.src = currentImageUrl;
    if (!isPreviewMode) fetchLatestImage();
  }

  export function hide() {
    isVisible = false;
    if (node.properties) node.properties.pcrImagePreview = false;
    emitToggle(false);
  }

  export function setToggleListener(cb) { toggleListener = cb; }

  export function toggle() { isVisible ? hide() : show(); }
  export function getIsVisible() { return isVisible; }

  export function updateImage(imageUrl, hashPromise = null) {
    currentImageUrl = imageUrl;
    isPreviewMode = false;
    showProgress = false;
    shared.isGenerating = false;
    latestHashPromise = hashPromise
      ? Promise.resolve(hashPromise).then(entry => entry?.hash ?? null).catch(() => null)
      : null;
  }

  export function updatePreview(previewUrl) {
    isPreviewMode = true;
    currentImageUrl = previewUrl;
    if (imgEl) imgEl.style.opacity = "";
  }

  export function revertPreview() {
    if (!isPreviewMode) return;
    isPreviewMode = false;
    showProgress = false;
    shared.isGenerating = false;
    if (shared.imageUrl) currentImageUrl = shared.imageUrl;
  }

  export function startGenerating() {
    isPreviewMode = true;
    showProgress = true;
    progressIndeterminate = true;
    shared.isGenerating = true;
    latestHashPromise = null;
  }

  export function showIndeterminate() {
    showProgress = true;
    progressIndeterminate = true;
  }

  export function showProgressBar(v, max) {
    showProgress = true;
    progressIndeterminate = false;
    progressValue = v;
    progressMax = max;
  }

  export function hideProgress() {
    showProgress = false;
    shared.isGenerating = false;
  }

  // zoom via custom event (dispatched by isolation.js wheel handler)
  function handleZoom(e) {
    const { deltaY, mouseX, mouseY, containerWidth, containerHeight } = e.detail;
    const step = deltaY > 0 ? -0.2 : 0.2;
    const newZoom = Math.max(1, Math.min(MAX_ZOOM, zoom + step));
    if (newZoom === zoom) return;
    const cx = containerWidth / 2;
    const cy = containerHeight / 2;
    const ratio = newZoom / zoom;
    panX = (mouseX - cx) - ((mouseX - cx) - panX) * ratio;
    panY = (mouseY - cy) - ((mouseY - cy) - panY) * ratio;
    zoom = newZoom;
    applyTransform();
  }

  // pan via pointer drag
  let isPanning = false;
  let panStartX, panStartY, panStartPanX, panStartPanY;

  function handlePanStart(e) {
    if (!imageLoaded) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = document.querySelector("canvas.lgraphcanvas");
    if (canvas && typeof e.pointerId === "number") {
      try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch {}
    }
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartPanX = panX;
    panStartPanY = panY;
    imgContainerEl?.setPointerCapture(e.pointerId);
  }

  function handlePanMove(e) {
    if (!isPanning) return;
    const inFs = !!document.querySelector(".pcr-fs-overlay");
    const scale = inFs ? 1 : getCanvasScale();
    panX = panStartPanX + (e.clientX - panStartX) / scale;
    panY = panStartPanY + (e.clientY - panStartY) / scale;
    applyTransform();
  }

  function handlePanEnd(e) {
    if (!isPanning) return;
    isPanning = false;
    try { imgContainerEl?.releasePointerCapture(e.pointerId); } catch {}
  }

  // register API with parent and wire up the isolation-layer zoom event.
  // `panelEl` is a plain let (not $state), so an $effect wouldn't re-run
  // when bind:this resolves — use onMount which fires after bindings.
  onMount(() => {
    onRegister?.({
      toggle, show, hide, getIsVisible, setToggleListener, updateImage, updatePreview, revertPreview,
      startGenerating, showIndeterminate, showProgress: showProgressBar, hideProgress, cleanup,
    });
    panelEl?.addEventListener("pcr-zoom", handleZoom);
    return () => panelEl?.removeEventListener("pcr-zoom", handleZoom);
  });

  // divider resize
  let dividerAc;
  onMount(() => {
    dividerAc = new AbortController();
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    document.addEventListener("pointerdown", (e) => {
      if (!dividerEl || (e.target !== dividerEl && !dividerEl.contains(e.target))) return;
      isDragging = true;
      startX = e.clientX;
      startWidth = panelEl?.offsetWidth || panelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const canvas = document.querySelector("canvas.lgraphcanvas");
      if (canvas && typeof e.pointerId === "number") {
        try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch {}
      }
    }, { capture: true, signal: dividerAc.signal });

    document.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      const inFs = !!document.querySelector(".pcr-fs-overlay");
      const scale = inFs ? 1 : getCanvasScale();
      const delta = (startX - e.clientX) / scale;
      panelWidth = clampPanelWidth(startWidth + delta);
    }, { capture: true, signal: dividerAc.signal });

    document.addEventListener("pointerup", () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (node.properties) node.properties.pcrImagePanelWidth = panelWidth;
    }, { capture: true, signal: dividerAc.signal });
  });
  onDestroy(() => dividerAc?.abort());

  function cleanup() {
    dividerAc?.abort();
  }

  // restore on load
  onMount(() => {
    if (node.properties?.pcrImagePreview) requestAnimationFrame(() => show());
    // Clamp a saved oversized width to current row layout. Updates live
    // state only, not node.properties — the saved preference is preserved
    // so the panel can grow back if the node is later widened.
    requestAnimationFrame(() => { panelWidth = clampPanelWidth(panelWidth); });
  });

  $effect(() => { applyTransform(); });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={dividerEl} class="pcr-image-divider"
  style:display={isVisible ? "flex" : "none"}
    ondblclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (naturalWidth && naturalHeight) {
        const container = panelEl?.querySelector(".pcr-image-container");
        const h = container?.offsetHeight || panelEl?.offsetHeight || 300;
        panelWidth = clampPanelWidth(Math.round(h * (naturalWidth / naturalHeight)));
        if (node.properties) node.properties.pcrImagePanelWidth = panelWidth;
      }
    }}
  ></div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={panelEl}
  class="pcr-image-panel"
  style:width="{panelWidth}px"
  style:display={isVisible ? "flex" : "none"}
    onpointerdown={(e) => e.stopPropagation()}
    onmousedown={(e) => e.stopPropagation()}
    onclick={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
  >
    <!-- header -->
    <div class="pcr-image-panel-header">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="pcr-image-panel-filename"
        class:pcr-image-panel-filename-generating={shared.isGenerating}
        onclick={handleFilenameClick}
        title={filenameDisplay}
      >{filenameDisplay}</span>
      <button class="pcr-image-panel-close-btn" title="Close image panel" onclick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- image container -->
    <div
      bind:this={imgContainerEl}
      class="pcr-image-container"
      onpointerdown={handlePanStart}
      onpointermove={handlePanMove}
      onpointerup={handlePanEnd}
      ondblclick={(e) => { e.stopPropagation(); resetZoom(true); }}
    >
      {#if currentImageUrl && isVideoUrl}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={videoEl}
          src={currentImageUrl}
          style:display={imageLoaded ? "block" : "none"}
          onloadeddata={handleVideoLoaded}
          onerror={handleImageError}
          autoplay
          loop
          muted
          playsinline
          controls
        ></video>
      {:else if currentImageUrl}
        <img
          bind:this={imgEl}
          src={currentImageUrl}
          draggable="false"
          style:display={imageLoaded ? "block" : "none"}
          onload={handleImageLoad}
          onerror={handleImageError}
          alt=""
        />
      {/if}
      {#if !imageLoaded || !currentImageUrl}
        <div class="pcr-image-placeholder">{imageError ? "Image not found" : "No image"}</div>
      {/if}
    </div>

    <!-- info / progress bar — always shown while generating, on hover otherwise -->
    <div
      class="pcr-image-panel-info"
      class:pcr-image-panel-info-always={showProgress}
      style:display={showProgress || (imageLoaded && currentImageUrl) ? "flex" : "none"}
    >
      {#if showProgress}
        <div class="pcr-image-panel-progress" class:pcr-image-panel-progress-indeterminate={progressIndeterminate}>
          <div class="pcr-image-panel-progress-track">
            <div
              class="pcr-image-panel-progress-bar"
              style:width="{progressPercent}%"
              style:transition="width {progressDuration * 1.3}s linear"
            ></div>
          </div>
          {#if !progressIndeterminate}
            <span class="pcr-image-panel-progress-text">{progressValue}/{progressMax}</span>
          {/if}
        </div>
      {:else}
        <span class="pcr-image-panel-info-text">{infoText}</span>
      {/if}
    </div>
  </div>

<style>
  .pcr-image-divider {
    width: 4px;
    background: #242424;
    cursor: col-resize;
    flex-shrink: 0;
    display: none;
    align-items: center;
    justify-content: center;
  }
  .pcr-image-divider::before {
    content: '';
    width: 2px;
    height: 40px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 1px;
    transition: background 0.15s;
  }
  .pcr-image-divider:hover::before {
    background: rgba(255, 255, 255, 0.3);
  }
  .pcr-image-panel {
    display: none;
    flex-direction: column;
    background: rgba(0, 0, 0, 0.4);
    min-width: 80px;
    flex-shrink: 0;
    overflow: hidden;
    position: relative;
  }
  :global(.lg-node-widgets) .pcr-image-panel {
    background: rgb(0 0 0 / 46%);
  }
  .pcr-image-panel-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 30px;
    min-height: 30px;
    padding: 0 4px;
    background: transparent;
    border: none;
    box-sizing: border-box;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;
  }
  .pcr-image-panel:hover .pcr-image-panel-header {
    opacity: 1;
    pointer-events: auto;
  }
  .pcr-image-panel-filename {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.7);
    cursor: pointer;
    padding: 0 4px;
    transition: color 0.15s;
  }
  .pcr-image-panel-filename:hover {
    color: #fff;
  }
  .pcr-image-panel-filename-generating {
    font-style: italic;
    cursor: default;
  }
  .pcr-image-panel-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    border: none;
    color: #fff;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 3px rgba(0, 0, 0, 0.7));
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.15s;
  }
  .pcr-image-panel-close-btn:hover {
    color: #fff;
  }
  .pcr-image-container {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--pcr-fs-editor-surface, transparent);
  }
  .pcr-image-container img,
  .pcr-image-container video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transform-origin: center center;
  }
  .pcr-image-placeholder {
    color: rgba(255, 255, 255, 0.3);
    font-size: 12px;
    font-style: italic;
    user-select: none;
  }
  .pcr-image-panel-info {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 2;
    display: none;
    align-items: center;
    justify-content: center;
    height: 20px;
    min-height: 20px;
    padding: 0 8px;
    background: rgba(0, 0, 0, 0.45);
    border: none;
    box-sizing: border-box;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    font-size: 10px;
    letter-spacing: 0.3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .pcr-image-panel:hover .pcr-image-panel-info,
  .pcr-image-panel-info-always {
    opacity: 1;
  }
  .pcr-image-panel-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 100%;
  }
  .pcr-image-panel-progress-track {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }
  .pcr-image-panel-progress-bar {
    width: 0%;
    height: 100%;
    background: linear-gradient(90deg, #4a9eff 0%, #7bb8ff 100%);
    border-radius: 2px;
    transition: width 1s linear;
  }
  .pcr-image-panel-progress-text {
    color: #aaa;
    font-size: 10px;
    min-width: 35px;
    text-align: center;
  }
  .pcr-image-panel-progress-indeterminate .pcr-image-panel-progress-bar {
    width: 100% !important;
    background: linear-gradient(90deg, transparent 0%, #4a9eff 50%, transparent 100%);
    background-size: 200% 100%;
    animation: pcr-progress-pulse 1.5s ease-in-out infinite;
    transition: none;
  }
  .pcr-image-panel-progress-indeterminate .pcr-image-panel-progress-text {
    display: none;
  }
  @keyframes pcr-progress-pulse {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }
</style>
