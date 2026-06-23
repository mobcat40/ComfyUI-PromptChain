<script>
  import { api } from "/scripts/api.js";
  import { extractPrecisions, resolveFilesForPrecision } from "../../lib/model-constants.js";

  let {
    catalogEntry,
    onClose,
    onModelReady,
    // Pre-selects a precision (e.g. the "FP16 ↓" tag the user clicked on an
    // installed model row). Falls back to the first declared precision.
    initialPrecision = null,
  } = $props();

  // ── helpers ──────────────────────────────────────────────────────

  function resolveFileDownloadUrl(file) {
    if (file.download_url) return file.download_url;
    const source = file.source;
    if (!source) return "";
    if (source.provider === "huggingface") return `https://huggingface.co/${source.repo}/resolve/main/${source.path}`;
    if (source.provider === "civitai") return source.download_url || "";
    return source.url || "";
  }

  function totalSizeForPrecision(files, precision) {
    return resolveFilesForPrecision(files, precision).reduce((sum, f) => sum + (f.size_bytes || 0), 0);
  }

  function formatGB(bytes) {
    return (bytes / (1024 ** 3)).toFixed(1);
  }

  // Catalog presets carry no size_bytes; resolveSizes probes the backend for
  // each file's Content-Length and fills this map (filename → bytes) so the
  // size shows up reactively.
  let fileSizes = $state({});
  function sizeOf(f) { return f.size_bytes || fileSizes[f.filename] || 0; }

  async function resolveSizes(files) {
    for (const f of files) {
      if (sizeOf(f)) continue;
      const url = resolveFileDownloadUrl(f);
      if (!url) continue;
      try {
        const r = await fetch("/promptchain/civitai/file-size", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const { size_bytes } = await r.json();
        if (size_bytes > 0) fileSizes = { ...fileSizes, [f.filename]: size_bytes };
      } catch { /* size is best-effort */ }
    }
  }

  // ── state ────────────────────────────────────────────────────────

  const rawFiles = catalogEntry.files || [];
  const precisions = extractPrecisions(rawFiles);

  let selectedPrecision = $state(
    (initialPrecision && precisions.includes(initialPrecision)) ? initialPrecision : (precisions[0] || null)
  );
  let resolvedFiles = $derived(
    selectedPrecision ? resolveFilesForPrecision(rawFiles, selectedPrecision) : rawFiles
  );

  let fileStatuses = $state({});
  let downloading = $state(false);
  let currentFileIdx = $state(-1);
  let progress = $state(0);
  let statusText = $state("");
  let restarting = $state(false);

  // Indices of files that need downloading
  let filesToDownload = $state([]);
  let checkFailed = $state(false);
  let restartAc = null;

  $effect(() => () => { restartAc?.abort(); });

  let allDone = $derived(
    resolvedFiles.length > 0 && resolvedFiles.every(f => fileStatuses[f.filename] === "done")
  );
  let showRestart = $derived(allDone && !restarting);

  let totalBytes = $derived(resolvedFiles.reduce((sum, f) => sum + sizeOf(f), 0));
  let metaLine = $derived.by(() => {
    const parts = [catalogEntry.architecture, catalogEntry.family].filter(Boolean);
    if (totalBytes > 0) parts.push(`${formatGB(totalBytes)} GB total`);
    return parts.join(" \u00b7 ");
  });

  let downloadBtnLabel = $derived.by(() => {
    if (downloading) return "Downloading\u2026";
    const missing = resolvedFiles.filter(f => fileStatuses[f.filename] !== "done");
    if (missing.length === resolvedFiles.length) return "Download All";
    return `Download ${missing.length} Missing`;
  });

  // ── check existing files on mount / precision change ─────────

  $effect(() => {
    const files = resolvedFiles;
    statusText = "Checking…";
    (async () => { await resolveSizes(files); await checkFiles(files); })();
  });

  async function checkFiles(files) {
    statusText = "Checking local files\u2026";
    fileStatuses = {};
    filesToDownload = [];
    checkFailed = false;

    try {
      const res = await fetch("/promptchain/models/check-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: files.map(f => ({ filename: f.filename, folder: f.folder, size_bytes: f.size_bytes || 0 })) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = data.results || [];
      const newStatuses = {};
      const missing = [];

      for (let i = 0; i < results.length; i++) {
        newStatuses[results[i].filename || files[i].filename] = results[i].exists ? "done" : "pending";
        if (!results[i].exists) missing.push(i);
      }

      fileStatuses = newStatuses;
      filesToDownload = missing;

      if (missing.length === 0) {
        statusText = "Registering model\u2026";
        await registerDownloadedModel(files);
        statusText = "All files present!";
      } else {
        const dlBytes = missing.reduce((sum, i) => sum + sizeOf(files[i]), 0);
        statusText = `${missing.length} file${missing.length > 1 ? "s" : ""} to download${dlBytes > 0 ? ` (${formatGB(dlBytes)} GB)` : ""}`;
      }
    } catch (e) {
      console.error("[PromptChain] file check failed:", e);
      // Don't assume all files are missing — that would prompt the user
      // to re-download files that may already exist.  Surface an explicit
      // retry state instead.
      filesToDownload = [];
      checkFailed = true;
      statusText = "Could not check files \u2014 click Retry";
    }
  }

  // ── WebSocket listeners ──────────────────────────────────────

  $effect(() => {
    function onProgress({ detail }) {
      if (currentFileIdx < 0 || currentFileIdx >= filesToDownload.length) return;
      const currentFile = resolvedFiles[filesToDownload[currentFileIdx]];
      if (detail.filename !== currentFile.filename) return;
      progress = detail.progress;
      const mb = (detail.downloaded / 1048576).toFixed(0);
      const totalMb = (detail.total / 1048576).toFixed(0);
      statusText = `${currentFile.label || currentFile.filename}: ${mb} / ${totalMb} MB (${detail.progress}%)`;
    }

    function onDone({ detail }) {
      if (currentFileIdx < 0 || currentFileIdx >= filesToDownload.length) return;
      const fi = filesToDownload[currentFileIdx];
      if (detail.filename !== resolvedFiles[fi].filename) return;

      if (detail.status === "completed") {
        fileStatuses[resolvedFiles[fi].filename] = "done";
        downloadNext();
      } else {
        fileStatuses[resolvedFiles[fi].filename] = "failed";
        statusText = `Failed: ${detail.error || "unknown error"}`;
        downloading = false;
      }
    }

    api.addEventListener("promptchain_download_progress", onProgress);
    api.addEventListener("promptchain_download_done", onDone);

    return () => {
      api.removeEventListener("promptchain_download_progress", onProgress);
      api.removeEventListener("promptchain_download_done", onDone);
    };
  });

  // ── download sequencer ───────────────────────────────────────

  async function startDownload() {
    downloading = true;
    // Rebuild missing list from current statuses
    filesToDownload = resolvedFiles
      .map((f, i) => (fileStatuses[f.filename] !== "done") ? i : -1)
      .filter(i => i >= 0);
    currentFileIdx = -1;
    downloadNext();
  }

  async function downloadNext() {
    currentFileIdx++;
    if (currentFileIdx >= filesToDownload.length) {
      progress = 100;
      downloading = false;
      statusText = "Registering model\u2026";
      await registerDownloadedModel(resolvedFiles);
      statusText = "\u2714 All files downloaded!";
      return;
    }

    const fi = filesToDownload[currentFileIdx];
    const file = resolvedFiles[fi];
    fileStatuses[file.filename] = "downloading";
    progress = 0;
    statusText = `Downloading ${currentFileIdx + 1}/${filesToDownload.length}: ${file.label || file.filename}`;

    const url = resolveFileDownloadUrl(file);

    try {
      const res = await fetch("/promptchain/civitai/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, filename: file.filename, folder: file.folder }),
      });
      const data = await res.json();
      if (data.error) {
        fileStatuses[file.filename] = "failed";
        statusText = data.error;
        downloading = false;
      }
    } catch (err) {
      fileStatuses[file.filename] = "failed";
      statusText = err.message;
      downloading = false;
    }
  }

  // ── register model after all files downloaded ────────────────

  async function registerDownloadedModel(files) {
    const diffusionFile = files.find(f => f.folder === "diffusion_models") || files[0];
    try {
      await fetch("/promptchain/models/scan", { method: "POST" });
      const idRes = await fetch(`/promptchain/models/identity?file=${encodeURIComponent(diffusionFile.filename)}`);
      if (!idRes.ok) return;
      const identity = await idRes.json();
      if (!identity?.hash) return;

      const companionNodes = {};
      for (const f of files) {
        if (f.folder === "text_encoders") {
          companionNodes["CLIPLoader"] = { clip_name: f.filename };
          companionNodes["DualCLIPLoader"] = { clip_name: f.filename };
        } else if (f.folder === "vae") {
          companionNodes["VAELoader"] = { vae_name: f.filename };
        } else if (f.folder === "diffusion_models" || f.folder === "unet") {
          companionNodes["UNETLoader"] = { unet_name: f.filename };
        }
      }
      if (Object.keys(companionNodes).length) {
        await fetch(`/promptchain/models/settings/${identity.hash}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes: companionNodes }),
        });
      }
    } catch {}
  }

  // ── restart flow ─────────────────────────────────────────────

  async function restartAndResolve() {
    restarting = true;
    statusText = "Restarting server\u2026";
    restartAc = new AbortController();
    const { signal } = restartAc;

    fetch("/promptchain/system/restart", { method: "POST" }).catch(() => {});

    for (let i = 0; i < 120; i++) {
      if (signal.aborted) return;
      await new Promise(r => setTimeout(r, 500));
      try {
        const r = await fetch("/api/system_stats", { signal });
        if (r.ok) break;
      } catch { if (signal.aborted) return; }
    }

    statusText = "Scanning model\u2026";
    const diffusionFile = resolvedFiles.find(f => f.folder === "diffusion_models") || resolvedFiles[0];

    for (let i = 0; i < 20; i++) {
      if (signal.aborted) return;
      try {
        const r = await fetch(`/promptchain/models/identity?file=${encodeURIComponent(diffusionFile.filename)}`, { signal });
        if (r.ok) {
          onModelReady(diffusionFile.filename);
          return;
        }
      } catch { if (signal.aborted) return; }
      await new Promise(r => setTimeout(r, 1000));
    }

    statusText = "Model not detected after restart.";
    restarting = false;
  }

  // ── UI handlers ──────────────────────────────────────────────

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) cancel();
  }

  function cancel() {
    if (downloading) {
      fetch("/promptchain/civitai/download-cancel", { method: "POST" }).catch(() => {});
    }
    onClose();
  }

  function statusIcon(filename) {
    const s = fileStatuses[filename];
    if (s === "done") return "\u2714";
    if (s === "failed") return "\u2718";
    if (s === "downloading") return "\u27f3";
    return "\u25cb";
  }

  function statusColor(filename) {
    const s = fileStatuses[filename];
    if (s === "done") return "#4caf50";
    if (s === "failed") return "#f44336";
    if (s === "downloading") return "#4fc3f7";
    return "";
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pcr-download-overlay" onclick={handleOverlayClick}>
  <div class="pcr-download-modal">
    <div class="pcr-download-header">
      <div class="pcr-download-title">Get Model: {catalogEntry.display_name || catalogEntry.model_name}</div>
      <div class="pcr-download-meta">{metaLine}</div>
      {#if catalogEntry.description}
        <div style="margin-top:4px;font-size:11px;opacity:0.7">{catalogEntry.description}</div>
      {/if}
    </div>

    {#if precisions.length > 1}
      <div class="pcr-precision-picker">
        <div class="pcr-precision-buttons">
          {#each precisions as prec}
            <button
              class="pcr-precision-btn {prec === selectedPrecision ? 'pcr-precision-active' : ''}"
              disabled={downloading}
              onclick={() => { selectedPrecision = prec; }}
            >
              {prec.toUpperCase()} ({formatGB(totalSizeForPrecision(rawFiles, prec))} GB)
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="pcr-download-body">
      {#each resolvedFiles as file}
        <div class="pcr-catalog-file-row" style:opacity={fileStatuses[file.filename] === "done" ? 0.5 : 1}>
          <span class="pcr-catalog-file-status" style:color={statusColor(file.filename)}>
            {statusIcon(file.filename)}
          </span>
          <div class="pcr-catalog-file-info">
            <div class="pcr-catalog-file-label">{file.label || file.filename}</div>
            <div class="pcr-catalog-file-detail">
              {file.filename}{sizeOf(file) ? ` · ${formatGB(sizeOf(file))} GB` : ""} · {file.folder}/
            </div>
          </div>
        </div>
      {/each}
    </div>

    {#if downloading || progress > 0}
      <div class="pcr-download-progress-wrap">
        <div class="pcr-download-progress-bar">
          <div class="pcr-download-progress-fill" style="width: {progress}%"></div>
        </div>
      </div>
    {/if}

    <div class="pcr-download-footer">
      <div class="pcr-download-status">{statusText}</div>
      <div class="pcr-download-buttons">
        {#if showRestart}
          <button class="pcr-download-btn pcr-download-btn-primary" onclick={restartAndResolve}>
            Restart ComfyUI
          </button>
        {:else if checkFailed}
          <button
            class="pcr-download-btn pcr-download-btn-primary"
            onclick={() => checkFiles(resolvedFiles)}
          >
            Retry
          </button>
        {:else if !restarting && !allDone}
          <button
            class="pcr-download-btn pcr-download-btn-primary"
            onclick={startDownload}
            disabled={downloading || filesToDownload.length === 0}
          >
            {downloadBtnLabel}
          </button>
        {/if}
        {#if restarting}
          <button class="pcr-download-btn" disabled>Restarting&hellip;</button>
        {:else}
          <button class="pcr-download-btn" onclick={cancel}>
            {allDone ? "Later" : "Cancel"}
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  /* shared download modal base */
  .pcr-download-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
  }
  .pcr-download-modal {
    background: #1e1e1e;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 20px 24px;
    min-width: 360px;
    max-width: 460px;
  }
  .pcr-download-title {
    font-size: 14px;
    font-weight: 600;
    color: #eee;
    margin-bottom: 4px;
  }
  .pcr-download-meta {
    font-size: 11px;
    color: #888;
    margin-bottom: 16px;
  }
  .pcr-download-progress-wrap { margin-bottom: 8px; }
  .pcr-download-progress-bar {
    height: 6px;
    background: #333;
    border-radius: 3px;
    overflow: hidden;
  }
  .pcr-download-progress-fill {
    height: 100%;
    background: #4fc3f7;
    border-radius: 3px;
    width: 0%;
    transition: width 0.3s;
  }
  .pcr-download-status {
    font-size: 12px;
    color: #ccc;
    margin-bottom: 12px;
    min-height: 18px;
  }
  .pcr-download-buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .pcr-download-btn {
    padding: 6px 16px;
    font-size: 12px;
    border: 1px solid #555;
    border-radius: 4px;
    background: transparent;
    color: #ccc;
    cursor: pointer;
  }
  .pcr-download-btn:hover { background: rgba(255, 255, 255, 0.08); }
  .pcr-download-btn:disabled { opacity: 0.5; cursor: default; }
  .pcr-download-btn-primary {
    background: #4fc3f7;
    color: #111;
    border-color: #4fc3f7;
  }
  .pcr-download-btn-primary:hover { background: #39b0e4; }
  .pcr-download-btn-primary:disabled { background: #2a7a9e; }
  .pcr-download-header { margin-bottom: 12px; }
  .pcr-download-body { margin-bottom: 12px; }
  .pcr-download-footer { margin-top: 8px; }

  /* catalog file checklist */
  .pcr-catalog-file-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #333;
    transition: opacity 0.3s;
  }
  .pcr-catalog-file-row:last-child { border-bottom: none; }
  .pcr-catalog-file-status {
    flex-shrink: 0;
    width: 16px;
    text-align: center;
    font-size: 14px;
    line-height: 18px;
    color: #666;
  }
  .pcr-catalog-file-info { flex: 1; min-width: 0; }
  .pcr-catalog-file-label {
    font-size: 12px;
    font-weight: 500;
    color: #ddd;
  }
  .pcr-catalog-file-detail {
    font-size: 10px;
    color: #888;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* precision picker */
  .pcr-precision-picker {
    padding: 0 0 8px;
    border-bottom: 1px solid #333;
    margin-bottom: 4px;
  }
  .pcr-precision-buttons {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .pcr-precision-btn {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid #555;
    border-radius: 4px;
    background: transparent;
    color: #ccc;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pcr-precision-btn:hover { border-color: #888; color: #fff; }
  .pcr-precision-btn.pcr-precision-active {
    border-color: #4fc3f7;
    color: #4fc3f7;
    background: rgba(79, 195, 247, 0.1);
  }
</style>
