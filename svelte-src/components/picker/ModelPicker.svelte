<script>
  // ModelPicker — search input, grouped model list, catalog sections,
  // CivitAI live search, version/template submenus, hover cards.

  import { untrack, tick } from "svelte";
  import { extractPrecisions, resolveFilesForPrecision } from "../../lib/model-constants.js";
  import HoverCard from "./HoverCard.svelte";

  let {
    anchorEl,
    recognition = {},
    onSelectModel,
    onShowDownload,
    onShowCatalogDownload,
    onClose,
    applyTemplate: applyTpl,
    // In-place model swap: when the current node is a checkpoint graph, the template
    // submenu offers "(Current Workflow)" at the top, which swaps the checkpoint and
    // reapplies settings to the existing nodes instead of rebuilding from a template.
    onSwapInPlace = null,
    hasCheckpointGraph = false,
    // When set (e.g. just after a download+restart), the picker scrolls to and
    // highlights this model and surfaces its templates: a single template is
    // applied automatically (no real choice), 2+ open the submenu so the user
    // picks — we never choose the workflow for them.
    focusModelFile = null,
  } = $props();

  // Checkpoint-family models can swap in place; flux/z-image use a different loader.
  const NON_CHECKPOINT_ARCHS = new Set(["flux", "flux_fill", "flux_schnell", "flux2", "zimage", "zimage_base"]);
  function canSwapInPlace(model) {
    if (!hasCheckpointGraph || !onSwapInPlace || !model) return false;
    const arch = (modelSettings[model.hash]?.architecture || "").toLowerCase();
    return !NON_CHECKPOINT_ARCHS.has(arch);
  }

  // ── data ──
  let models = $state([]);
  let templates = $state([]);
  let categoryOrder = $state([]);
  let catalog = $state([]);
  let modelSettings = $state({});
  let loading = $state(true);
  let searchQuery = $state("");

  // CivitAI search
  let civitaiResults = $state([]);
  let civitaiCursor = $state(null);
  let civitaiLoading = $state(false);
  let civitaiSearchTimer = null;

  // Submenus
  let activeSubmenu = $state(null); // { type: "version"|"template", groupKey, anchorRect }
  let activeNestedSubmenu = $state(null); // { model, versionLabel, anchorRect }

  // Group highlighted after a download+restart (the just-installed model).
  let highlightGroupName = $state(null);

  // Hover card
  let hoverCard;
  let hoverTimeout = null;

  $effect(() => () => {
    clearTimeout(civitaiSearchTimer);
    clearTimeout(hoverTimeout);
  });

  // Panel refs and positioning
  let pickerEl;
  let listEl;
  let searchEl;
  let panelStyle = $state("");

  // Per-precision install state for every catalog entry, authoritative from the
  // backend ("installed" | "partial" | "missing"). Derived straight from the
  // catalog payload — no client-side file probing, so it can't drift from the
  // real _all_files_installed check the way the old JS heuristic did (it only
  // probed the diffusion file and flagged a precision installed while a
  // companion encoder/VAE was still missing).
  let catalogPrecisionStatus = $derived.by(() => {
    const out = {};
    for (const c of catalog) out[c.hash] = c.precision_status || {};
    return out;
  });

  // ── load data ──
  async function loadData() {
    try {
      const [modelsRes, templatesRes, catalogRes] = await Promise.all([
        fetch("/promptchain/models/list").then(r => r.json()),
        fetch("/promptchain/templates/list").then(r => r.json()),
        fetch("/promptchain/models/catalog").then(r => r.json()),
      ]);
      models = modelsRes.models || [];
      templates = templatesRes.templates || [];
      categoryOrder = templatesRes.category_order || [];
      catalog = catalogRes.catalog || [];

      // Bulk load model settings
      const hashes = models.map(m => m.hash).filter(Boolean);
      if (hashes.length) {
        const settingsRes = await fetch("/promptchain/models/settings/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hashes }),
        }).then(r => r.json());
        modelSettings = settingsRes.settings || {};
      }

      loading = false;
      requestAnimationFrame(() => searchEl?.focus());
      focusDownloadedModel();
    } catch {
      loading = false;
    }
  }

  // Surface the just-downloaded model: highlight + scroll to it, then apply its
  // template if there's only one, or open the template submenu for the user to
  // choose if there are several. Never picks the workflow for them.
  async function focusDownloadedModel() {
    if (!focusModelFile) return;
    await tick();
    const group = groupedModels.find(g => g.versions.some(v => v.filename === focusModelFile));
    if (!group) return;
    const model = group.versions.find(v => v.filename === focusModelFile) || group.versions[0];
    highlightGroupName = group.name;

    const tpls = templatesForModel(model);
    if (tpls.length === 1) {
      handleTemplateClick(tpls[0], model); // single template = no choice; apply + close
      return;
    }
    if (tpls.length > 1) {
      activeSubmenu = {
        type: "template",
        model,
        displayName: modelSettings[model.hash]?.display_name || model.filename,
      };
      activeNestedSubmenu = null;
    }
    await tick();
    listEl?.querySelector(".pcr-picker-item-highlight")?.scrollIntoView({ block: "center" });
  }

  // ── grouped models ──
  let groupedModels = $derived.by(() => {
    // Sort models alphabetically by display name first
    const sorted = models.slice().sort((a, b) => {
      const nameA = modelSettings[a.hash]?.display_name || a.filename;
      const nameB = modelSettings[b.hash]?.display_name || b.filename;
      return nameA.localeCompare(nameB);
    });

    // Grouping key prefers civitai_model_id so versions stay unified
    // even when the CivitAI page name has drifted between recognitions
    // (creators often rename / add emoji / append new base-models over
    // time, which would otherwise split the group in two).  Falls back
    // to model_name for non-CivitAI models.
    const groups = new Map();
    for (const m of sorted) {
      const s = modelSettings[m.hash];
      const key = s?.civitai_model_id
        ? `civitai:${s.civitai_model_id}`
        : (s?.model_name || s?.display_name || m.filename);
      if (!groups.has(key)) {
        groups.set(key, {
          name: s?.model_name || s?.display_name || m.filename,
          architecture: s?.architecture || m.architecture || "",
          family: s?.family || "",
          versions: [],
        });
      }
      groups.get(key).versions.push(m);
    }

    // Sort versions within each group by release_date then version.
    // After sorting we pick the OLDEST version's model_name as the
    // group label — it's the most stable anchor since CivitAI page
    // names drift newer→older over time (creators add emoji and
    // expanded descriptors to the current listing).
    for (const g of groups.values()) {
      g.versions.sort((a, b) => {
        const sa = modelSettings[a.hash] || {};
        const sb = modelSettings[b.hash] || {};
        const da = sa.release_date || "";
        const db = sb.release_date || "";
        if (da || db) return (db || "").localeCompare(da || "");
        return (sb.version || "").localeCompare(sa.version || "");
      });
      const oldestSettings = modelSettings[g.versions[g.versions.length - 1].hash];
      if (oldestSettings?.model_name) g.name = oldestSettings.model_name;
      else if (oldestSettings?.display_name) g.name = oldestSettings.display_name;
    }

    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  // ── filtered results ──
  let filteredGroups = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return groupedModels;
    const terms = q.split(/\s+/);
    return groupedModels.filter(g => {
      const searchText = [
        g.name,
        ...g.versions.map(v => {
          const s = modelSettings[v.hash];
          return [v.filename, s?.architecture, s?.family, s?.version].filter(Boolean).join(" ");
        }),
      ].join(" ").toLowerCase();
      return terms.every(t => searchText.includes(t));
    });
  });

  // Catalog: split into partially installed + fully uninstalled
  let catalogInstalled = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    const terms = q ? q.split(/\s+/) : [];
    return catalog.filter(c => {
      const status = catalogPrecisionStatus[c.hash] || {};
      // In the precision-tag strip when at least one precision has files on disk
      // (installed, or a resumable partial). All-missing entries drop to the
      // grouped "available for download" list below.
      if (!Object.values(status).some(v => v === "installed" || v === "partial")) return false;
      if (!terms.length) return true;
      const text = [c.display_name, c.model_name, c.architecture, c.family, c.version].join(" ").toLowerCase();
      return terms.every(t => text.includes(t));
    });
  });
  let catalogUninstalled = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    let items = catalog.filter(c => {
      const status = catalogPrecisionStatus[c.hash] || {};
      return !Object.values(status).some(v => v === "installed" || v === "partial");
    });
    if (q) {
      const terms = q.split(/\s+/);
      items = items.filter(c => {
        const text = [c.model_name, c.architecture, c.family].filter(Boolean).join(" ").toLowerCase();
        return terms.every(t => text.includes(t));
      });
    }
    return items;
  });

  // Group the uninstalled catalog by model so each model shows once with a
  // version submenu (latest first) — mirroring the installed-model grouping.
  let catalogGroups = $derived.by(() => {
    const groups = new Map();
    for (const entry of catalogUninstalled) {
      const key = entry.civitai_model_id
        ? `civitai:${entry.civitai_model_id}`
        : (entry.model_name || entry.display_name || entry.hash);
      if (!groups.has(key)) {
        groups.set(key, {
          name: entry.model_name || entry.display_name || "",
          architecture: entry.architecture || "",
          family: entry.family || "",
          partial: false,
          versions: [],
        });
      }
      const g = groups.get(key);
      g.versions.push(entry);
      if (entry.partial) g.partial = true;
    }
    for (const g of groups.values()) {
      g.versions.sort((a, b) => (b.version || "").localeCompare(a.version || "", undefined, { numeric: true }));
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  // ── positioning ──
  function positionPicker() {
    if (!pickerEl || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const gap = 4;
    const padding = 8;
    const spaceAbove = rect.top - padding;
    const spaceBelow = window.innerHeight - rect.bottom - padding;

    let s = `left:${rect.left}px;`;
    if (spaceBelow >= spaceAbove) {
      s += `top:${rect.bottom + gap}px;bottom:auto;max-height:${spaceBelow - gap}px;`;
    } else {
      s += `bottom:${window.innerHeight - rect.top}px;top:auto;max-height:${spaceAbove}px;`;
    }
    panelStyle = s;
  }

  // ── outside click ──
  function onOutsideClick(e) {
    if (pickerEl && !pickerEl.contains(e.target)) {
      if (e.target.closest?.(".pcr-model-indicator")) return;
      if (e.target.closest?.(".pcr-picker-submenu")) return;
      onClose();
    }
  }

  // ── CivitAI dedup ──
  function _normalizeModelName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).sort().join(" ");
  }

  function civitaiResultIsKnown(r) {
    // Check CivitAI model ID
    for (const s of Object.values(modelSettings)) {
      if (s.civitai_model_id && s.civitai_model_id === r.civitai_model_id) return true;
    }
    for (const c of catalog) {
      if (c.civitai_model_id && c.civitai_model_id === r.civitai_model_id) return true;
    }
    // Fuzzy name matching
    const key = _normalizeModelName(r.model_name || "");
    const knownKeys = new Set();
    for (const s of Object.values(modelSettings)) {
      const mn = s.model_name || s.display_name || "";
      if (mn) knownKeys.add(_normalizeModelName(mn));
    }
    for (const c of catalog) {
      const mn = c.model_name || c.display_name || "";
      if (mn) knownKeys.add(_normalizeModelName(mn));
    }
    if (knownKeys.has(key)) return true;
    for (const known of knownKeys) {
      const knownWords = known.split(" ").filter(w => w.length >= 3);
      const resultWords = key.split(" ").filter(w => w.length >= 3);
      if (knownWords.length >= 2 && knownWords.every(w => key.includes(w))) return true;
      if (resultWords.length >= 2 && resultWords.every(w => known.includes(w))) return true;
    }
    return false;
  }

  // ── CivitAI search ──
  // Each search owns an AbortController so rapid typing doesn't let a
  // slow "dog" response clobber fresh "cat" results after the user has
  // moved on.
  let civitaiSearchAbort = null;

  // True from the moment the user types until a search (including its
  // 400ms debounce) completes, fails, or the query is cleared.  Drives
  // the "Searching CivitAI..." placeholder so the reserved space isn't
  // just an empty gap while the request is in flight.
  let civitaiHasSearched = $state(false);

  function doCivitaiSearch(query, append = false) {
    if (!query.trim()) { civitaiResults = []; return; }
    civitaiSearchAbort?.abort();
    civitaiSearchAbort = new AbortController();
    const signal = civitaiSearchAbort.signal;
    civitaiLoading = true;
    const params = new URLSearchParams({ q: query, limit: "10" });
    if (append && civitaiCursor) params.set("cursor", civitaiCursor);

    fetch(`/promptchain/civitai/search?${params}`, { signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (signal.aborted) return;
        const results = data.results || [];
        // Deduplicate against known local models + catalog
        const filtered = results.filter(r => !civitaiResultIsKnown(r));
        civitaiResults = append ? [...civitaiResults, ...filtered] : filtered;
        civitaiCursor = data.next_cursor || null;
        civitaiLoading = false;
        civitaiHasSearched = true;
      })
      .catch(e => {
        if (e.name === "AbortError") return;
        console.error("[PromptChain] CivitAI search failed:", e);
        civitaiLoading = false;
        civitaiHasSearched = true;
      });
  }

  function onSearchInput() {
    clearTimeout(civitaiSearchTimer);
    civitaiSearchAbort?.abort();
    civitaiResults = [];
    civitaiCursor = null;
    civitaiHasSearched = false;
    if (searchQuery.trim()) {
      // Flag loading now so the placeholder is visible during debounce,
      // not just while the actual network request is in flight.
      civitaiLoading = true;
      civitaiSearchTimer = setTimeout(() => doCivitaiSearch(searchQuery), 400);
    } else {
      civitaiLoading = false;
    }
  }

  // ── template helpers ──
  function templatesForModel(model) {
    const arch = modelSettings[model.hash]?.architecture || model.architecture;
    const family = modelSettings[model.hash]?.family || "";
    const mName = modelSettings[model.hash]?.model_name || modelSettings[model.hash]?.display_name || model.filename || "";
    return templates.filter(tpl => {
      if (tpl._hidden) return false;
      const scope = tpl.scope || {};
      if (scope.type === "version") return scope.model_hash === model.hash;
      if (scope.type === "model") return (scope.model_name || scope.display_name) === mName && mName;
      if (scope.type === "family") return scope.architecture === arch && scope.family === family && (!scope.version || scope.version === (modelSettings[model.hash]?.version || ""));
      return scope.architecture === arch;
    });
  }

  async function handleCatalogPrecisionClick(entry, prec, state) {
    // Anything not fully present opens the download modal, which re-checks each
    // file (with size) and offers "Download N Missing" — so a partial download
    // resumes the missing companion instead of restarting from scratch.
    if (state !== "installed") {
      onShowCatalogDownload(entry, prec);
      return;
    }
    // Installed: jump to this precision's templates. If the model can't be
    // resolved (e.g. files on disk but not yet scanned), fall back to the
    // download modal rather than silently closing — that onClose() dead-end is
    // exactly what left partial entries looking installed yet unclickable.
    const resolved = resolveFilesForPrecision(entry.files, prec);
    const diffFile = resolved.find(f => f.folder === "diffusion_models" || f.folder === "unet");
    const localModel = diffFile && models.find(m => m.filename === diffFile.filename);
    if (localModel && templatesForModel(localModel).length > 0) {
      activeSubmenu = {
        type: "template",
        model: localModel,
        displayName: modelSettings[localModel.hash]?.display_name || localModel.filename,
      };
      activeNestedSubmenu = null;
    } else {
      onShowCatalogDownload(entry, prec);
    }
  }

  // ── installed-model precision upgrades ──
  // An installed model whose config declares several precisions for its
  // primary file (e.g. Wan fp8_scaled + fp16) but only has some on disk can be
  // "moved up" to a heavier precision. We surface the declared precisions as
  // inline tags on the installed row: present ones jump to templates, missing
  // ones open the download modal. Detection is client-side — modelSettings
  // already ships the config's files, and the models list tells us which
  // primary files are on disk.

  // The config's primary diffusion/unet file entry — its variants are the
  // upgrade options. Mirrors the backend is_primary_model_file: an explicit
  // primary:true wins, else the first diffusion/unet entry.
  function primaryFileEntry(settings) {
    const files = settings?.files || [];
    const isPrimaryFolder = f => f.folder === "diffusion_models" || f.folder === "unet" || f.folder === "checkpoints";
    return files.find(f => f.primary && isPrimaryFolder(f))
      || files.find(isPrimaryFolder)
      || null;
  }

  // Declared primary precisions for an installed group, each tagged with
  // whether its file is on disk. Empty unless the config has 2+ variants
  // (nothing to upgrade otherwise).
  function groupPrecisions(group) {
    const settings = modelSettings[group.versions[0]?.hash];
    const variants = primaryFileEntry(settings)?.variants || [];
    if (variants.length < 2) return [];
    return variants.map(v => {
      const fnameLower = (v.filename || "").toLowerCase();
      const localModel = models.find(m => (m.filename || "").toLowerCase() === fnameLower);
      return { precision: v.precision, filename: v.filename, installed: !!localModel, model: localModel || null };
    });
  }

  // Catalog-entry shape for the download modal, built from an installed model's
  // stored config so the same modal handles a precision upgrade.
  function entryForGroup(group) {
    const s = modelSettings[group.versions[0]?.hash] || {};
    const entry = {
      hash: group.versions[0]?.hash,
      display_name: s.display_name || group.name,
      model_name: s.model_name || group.name,
      version: s.version || "",
      architecture: s.architecture || group.architecture || "",
      family: s.family || group.family || "",
      description: s.description || "",
      files: s.files || [],
    };
    if (s.civitai_model_id) entry.civitai_model_id = s.civitai_model_id;
    if (s.thumbnail) entry.thumbnail = s.thumbnail;
    return entry;
  }

  // Installed precision tag → that precision's templates.
  function handleInstalledPrecisionClick(prec) {
    if (prec.model && templatesForModel(prec.model).length > 0) {
      activeNestedSubmenu = null;
      activeSubmenu = {
        type: "template",
        model: prec.model,
        displayName: modelSettings[prec.model.hash]?.display_name || prec.model.filename,
      };
    } else {
      onClose();
    }
  }

  // Missing precision tag → download modal pre-set to that precision.
  function handleMissingPrecisionClick(group, prec) {
    onShowCatalogDownload(entryForGroup(group), prec.precision);
  }

  function sortCategories(cats) {
    const known = (categoryOrder || []).filter(c => cats.includes(c));
    const unknown = cats.filter(c => !categoryOrder?.includes(c)).sort();
    return [...known, ...unknown];
  }

  function buildVersionLabel(model) {
    const settings = modelSettings[model.hash];
    if (settings?.version_label) return settings.version_label;

    const version = settings?.version || "";
    const filename = (model.filename || "").toLowerCase();

    // Prefer the precision the config DECLARES for this exact file variant.
    // A filename regex collapses GGUF quants (Q4/Q5/Q8 all read "GGUF") and
    // fp8_scaled vs fp8, so multiple installed precisions of one model would
    // render as identical, indistinguishable rows. The variant's precision
    // field disambiguates them. Fall back to a filename sniff for configs
    // with no variants array.
    const precision = declaredPrecision(settings, filename) || sniffPrecision(filename);

    if (precision && version) {
      const esc = precision.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (version.toLowerCase().includes(precision.toLowerCase())) {
        return version.replace(new RegExp(`\\s*${esc}`, "i"), ` (${precision})`);
      }
      return `${version} (${precision})`;
    }
    return version || model.filename || "";
  }

  // The precision label a config declares for the file with this exact name,
  // checking each file entry's flat filename and its precision variants.
  function declaredPrecision(settings, filenameLower) {
    for (const f of settings?.files || []) {
      if ((f.filename || "").toLowerCase() === filenameLower) return f.precision || null;
      for (const v of f.variants || []) {
        if ((v.filename || "").toLowerCase() === filenameLower) return v.precision || null;
      }
    }
    return null;
  }

  // No separator requirement — civitai filenames embed precision in
  // camelCase (v4BaseFp8) which lowercasing flattens to "basefp8".
  function sniffPrecision(filenameLower) {
    const precisionPatterns = [
      [/bf16/i, "BF16"], [/fp16/i, "FP16"], [/fp8/i, "FP8"],
      [/fp32/i, "FP32"], [/nvfp4/i, "NVFP4"], [/fp4/i, "FP4"],
      [/\.gguf$/i, "GGUF"],
    ];
    for (const [pattern, label] of precisionPatterns) {
      if (pattern.test(filenameLower)) return label;
    }
    return null;
  }

  // Catalog entries have no modelSettings[hash], so derive the version label
  // from the entry's own fields + the primary file's precision suffix.
  function buildCatalogVersionLabel(entry) {
    const version = entry.version || "";
    const filename = (entry.files?.[0]?.filename || "").toLowerCase();
    const precisionPatterns = [
      [/bf16/i, "BF16"], [/fp16/i, "FP16"], [/fp8/i, "FP8"],
      [/fp32/i, "FP32"], [/nvfp4/i, "NVFP4"], [/fp4/i, "FP4"],
      [/\.gguf$/i, "GGUF"],
    ];
    let precision = null;
    for (const [pattern, label] of precisionPatterns) {
      if (pattern.test(filename)) { precision = label; break; }
    }
    if (precision && version) {
      if (version.toLowerCase().includes(precision.toLowerCase())) {
        return version.replace(new RegExp(`\\s*${precision}`, "i"), ` (${precision})`);
      }
      return `${version} (${precision})`;
    }
    return version || entry.display_name || entry.model_name || "";
  }

  // ── catalog group click: one version downloads directly, many open a
  // version submenu (toggle off if already open) ──
  function handleCatalogGroupClick(group) {
    if (activeSubmenu?.type === "catalogVersion" && activeSubmenu?.group === group) {
      activeSubmenu = null;
      activeNestedSubmenu = null;
      return;
    }
    activeNestedSubmenu = null;
    if (group.versions.length === 1) {
      activeSubmenu = null;
      onShowCatalogDownload(group.versions[0]);
    } else {
      activeSubmenu = { type: "catalogVersion", group };
    }
  }

  function handleCatalogVersionClick(entry) {
    activeSubmenu = null;
    activeNestedSubmenu = null;
    onShowCatalogDownload(entry);
  }

  // ── group click (toggle: clicking active item closes submenu) ──
  function handleGroupClick(group) {
    const model = group.versions[0];
    // Toggle off if already active
    if (activeSubmenu?.type === "version" && activeSubmenu?.group?.name === group.name
      || activeSubmenu?.type === "template" && activeSubmenu?.model?.hash === model.hash) {
      activeSubmenu = null;
      activeNestedSubmenu = null;
      return;
    }
    activeNestedSubmenu = null;
    if (group.versions.length === 1) {
      activeSubmenu = {
        type: "template",
        model,
        displayName: modelSettings[model.hash]?.display_name || model.filename,
      };
    } else {
      activeSubmenu = { type: "version", group };
    }
  }

  // ── version click (toggle: clicking open version closes nested) ──
  function handleVersionClick(model, versionLabel) {
    if (activeNestedSubmenu?.model?.hash === model.hash) {
      activeNestedSubmenu = null;
      return;
    }
    activeNestedSubmenu = { model, versionLabel };
  }

  // ── template click ──
  function handleTemplateClick(tpl, model) {
    applyTpl(tpl, model.filename, modelSettings[model.hash]?.nodes || {});
  }

  // ── submenu positioning ──
  let submenuStyle = $state("");
  let nestedSubmenuStyle = $state("");

  function positionSubmenu() {
    if (!pickerEl) return;
    const rect = pickerEl.getBoundingClientRect();
    const width = 220;
    const rightSpace = window.innerWidth - rect.right;
    const left = rightSpace > width + 10 ? rect.right + 2 : rect.left - width - 2;
    submenuStyle = `position:fixed;z-index:10001;left:${left}px;top:${rect.top}px;width:${width}px;max-height:${rect.height}px;overflow-y:auto`;
  }

  function positionNestedSubmenu() {
    if (!pickerEl) return;
    const rect = pickerEl.getBoundingClientRect();
    const width = 220;
    const submenuWidth = 220;
    const rightSpace = window.innerWidth - rect.right;
    const left = rightSpace > submenuWidth + width + 20
      ? rect.right + submenuWidth + 4
      : rect.left - width - submenuWidth - 4;
    nestedSubmenuStyle = `position:fixed;z-index:10002;left:${left}px;top:${rect.top}px;width:${width}px;max-height:${rect.height}px;overflow-y:auto`;
  }

  // Reposition when submenus change
  $effect(() => {
    if (activeSubmenu) positionSubmenu();
  });
  $effect(() => {
    if (activeNestedSubmenu || activeSubmenu?.type === "template") positionNestedSubmenu();
  });

  // ── hover card ──
  function onItemEnter(e, data) {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => hoverCard?.show(e.currentTarget, data), 200);
  }

  function onItemLeave() {
    clearTimeout(hoverTimeout);
    hoverCard?.hide();
  }

  // ── scroll pagination for CivitAI ──
  function onListScroll(e) {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40 && civitaiCursor && !civitaiLoading) {
      doCivitaiSearch(searchQuery, true);
    }
  }

  // ── click inside picker clears submenu (if not on an item) ──
  function onPickerPointerDown(e) {
    if (!e.target.closest(".pcr-picker-item")) {
      activeSubmenu = null;
      activeNestedSubmenu = null;
    }
  }

  // ── recognition reload ──
  function onRecognitionUpdate() {
    // Reload all data when models are recognized in background
    loadData();
  }

  // ── lifecycle ──
  $effect(() => {
    untrack(() => {
      loadData();
      requestAnimationFrame(() => positionPicker());
    });
    document.addEventListener("pointerdown", onOutsideClick, true);
    window.addEventListener("pcr-recognition-update", onRecognitionUpdate);
    return () => {
      document.removeEventListener("pointerdown", onOutsideClick, true);
      window.removeEventListener("pcr-recognition-update", onRecognitionUpdate);
      clearTimeout(civitaiSearchTimer);
      clearTimeout(hoverTimeout);
    };
  });
</script>

<div class="pcr-model-picker" bind:this={pickerEl} style={panelStyle}
  onpointerdown={onPickerPointerDown}>
  {#if loading}
    <div class="pcr-model-panel-empty">Loading...</div>
  {:else}
    <!-- Header: search + recognition -->
    <div class="pcr-picker-header">
      <input class="pcr-picker-search"
        bind:this={searchEl}
        type="text"
        placeholder="Search models..."
        bind:value={searchQuery}
        oninput={onSearchInput} />
      {#if recognition.running}
        <div class="pcr-picker-recognition">
          Recognizing models... {recognition.done}/{recognition.total}
        </div>
      {/if}
    </div>

    <!-- Scrollable list.  Height locks when a search is active so async
         CivitAI results can't push items out from under the user's cursor
         when the panel opens upward (bottom-pinned). -->
    <div class="pcr-picker-list"
      class:pcr-picker-list-reserved={searchQuery.trim().length > 0}
      bind:this={listEl} onscroll={onListScroll}>

      <!-- Local models -->
      {#each filteredGroups as group (group.name)}
        {@const model = group.versions[0]}
        {@const displayName = group.name}
        {@const meta = [group.architecture, group.family].filter(Boolean).join(" · ")}
        {@const precs = groupPrecisions(group)}
        <div class="pcr-picker-item"
          class:pcr-picker-item-active={activeSubmenu?.type === "version" && activeSubmenu?.group?.name === group.name
            || activeSubmenu?.type === "template" && activeSubmenu?.model?.hash === model.hash}
          class:pcr-picker-item-highlight={highlightGroupName === group.name}
          onclick={(e) => { e.stopPropagation(); handleGroupClick(group); }}
          onpointerenter={(e) => onItemEnter(e, { thumbnail: modelSettings[model.hash]?.thumbnail, name: displayName })}
          onpointerleave={onItemLeave}>
          <div class="pcr-picker-item-info">
            <span class="pcr-picker-item-name">
              {displayName}
              {#if group.versions.length > 1 && !precs.length}
                <span class="pcr-model-version-badge">{group.versions.length}</span>
              {/if}
            </span>
            {#if meta}
              <span class="pcr-picker-item-meta">{meta}</span>
            {/if}
            {#if precs.length}
              <div class="pcr-picker-precision-row">
                {#each precs as p}
                  <span class="pcr-picker-precision-tag"
                    class:pcr-precision-installed={p.installed}
                    class:pcr-precision-missing={!p.installed}
                    title={p.installed ? `${p.precision.toUpperCase()} installed — use it` : `Download ${p.precision.toUpperCase()}`}
                    onclick={(e) => {
                      e.stopPropagation();
                      p.installed ? handleInstalledPrecisionClick(p) : handleMissingPrecisionClick(group, p);
                    }}>
                    {p.precision.toUpperCase()}{p.installed ? "" : " ↓"}
                  </span>
                {/each}
              </div>
            {/if}
          </div>
          <span class="pcr-picker-item-arrow">▸</span>
        </div>
      {/each}

      <!-- Started catalog entries (installed / resumable-partial precisions) -->
      {#each catalogInstalled as entry}
        {@const precisions = extractPrecisions(entry.files || [])}
        {@const status = catalogPrecisionStatus[entry.hash] || {}}
        <div class="pcr-picker-item pcr-picker-catalog-item"
          class:pcr-picker-catalog-partial={precisions.some(p => status[p] === "partial")}
          onclick={(e) => {
            e.stopPropagation();
            const prec = precisions.find(p => status[p] === "installed")
              || precisions.find(p => status[p] === "partial");
            if (prec) handleCatalogPrecisionClick(entry, prec, status[prec]);
          }}>
          <div class="pcr-picker-item-info">
            <span class="pcr-picker-item-name">{entry.display_name || entry.model_name}</span>
            <div class="pcr-picker-precision-row">
              {#each precisions as prec}
                {@const st = status[prec] || "missing"}
                <span class="pcr-picker-precision-tag"
                  class:pcr-precision-installed={st === "installed"}
                  class:pcr-precision-partial={st === "partial"}
                  class:pcr-precision-missing={st === "missing"}
                  title={st === "installed" ? `${prec.toUpperCase()} installed`
                       : st === "partial" ? `${prec.toUpperCase()} download unfinished — click to resume`
                       : `Download ${prec.toUpperCase()}`}
                  onclick={(e) => {
                    e.stopPropagation();
                    handleCatalogPrecisionClick(entry, prec, st);
                  }}>
                  {prec.toUpperCase()}{st === "installed" ? "" : st === "partial" ? " ↻" : " ↓"}
                </span>
              {/each}
            </div>
          </div>
          <span class="pcr-picker-item-arrow">›</span>
        </div>
      {/each}

      <!-- Fully uninstalled catalog — grouped by model with a version submenu -->
      {#if catalogGroups.length}
        <div class="pcr-picker-civitai-header">AVAILABLE FOR DOWNLOAD</div>
        {#each catalogGroups as group (group.name)}
          {@const meta = [group.architecture, group.family].filter(Boolean).join(" · ")}
          <div class="pcr-picker-item pcr-picker-catalog-item"
            class:pcr-picker-item-active={activeSubmenu?.type === "catalogVersion" && activeSubmenu?.group === group}
            class:pcr-picker-catalog-partial={group.partial}
            onclick={(e) => { e.stopPropagation(); handleCatalogGroupClick(group); }}>
            <div class="pcr-picker-item-info">
              <span class="pcr-picker-item-name">
                {group.name}
                {#if group.versions.length > 1}
                  <span class="pcr-model-version-badge">{group.versions.length}</span>
                {/if}
              </span>
              {#if meta || group.partial}
                <span class="pcr-picker-item-meta">
                  {meta}{#if group.partial}{meta ? " · " : ""}<span class="pcr-picker-resume-hint">resume ↻</span>{/if}
                </span>
              {/if}
            </div>
            <span class="pcr-picker-item-arrow">{group.versions.length > 1 ? "▸" : (group.partial ? "↻" : "↓")}</span>
          </div>
        {/each}
      {/if}

      <!-- CivitAI results — the section surfaces as soon as a search is
           kicked off so the reserved space shows progress instead of a
           blank gap.  First render is the header + a placeholder; once
           results arrive, the placeholder is swapped for rows. -->
      {#if searchQuery.trim() && (civitaiResults.length || civitaiLoading || civitaiHasSearched)}
        <div class="pcr-picker-civitai-header">CIVITAI</div>
        <div class="pcr-picker-civitai-section">
          {#each civitaiResults as result}
            <div class="pcr-picker-item pcr-picker-civitai-item"
              onclick={() => onShowDownload(result)}
              onpointerenter={(e) => onItemEnter(e, {
                thumbnail: result.thumbnail,
                name: result.model_name,
                version: result.version,
                base_model: result.base_model,
                thumbs_up: result.thumbs_up,
                downloads: result.downloads,
                tags: result.tags,
              })}
              onpointerleave={onItemLeave}>
              <div class="pcr-picker-item-info">
                <span class="pcr-picker-item-name">{result.model_name}</span>
                <span class="pcr-picker-item-meta">
                  {[result.architecture, result.family, result.file?.size_gb ? `${result.file.size_gb} GB` : "",
                    result.downloads ? `${(result.downloads / 1000).toFixed(0)}k ↓` : ""].filter(Boolean).join(" · ")}
                </span>
              </div>
              <span class="pcr-picker-item-arrow">↓</span>
            </div>
          {/each}
          {#if civitaiLoading && !civitaiResults.length}
            <div class="pcr-picker-civitai-loading">Searching CivitAI…</div>
          {:else if civitaiLoading}
            <div class="pcr-picker-civitai-loading">Loading more…</div>
          {:else if civitaiHasSearched && !civitaiResults.length}
            <div class="pcr-picker-civitai-empty">No results on CivitAI</div>
          {/if}
        </div>
      {/if}

      {#if !filteredGroups.length && !catalogInstalled.length && !catalogUninstalled.length && !civitaiResults.length && !civitaiLoading && !civitaiHasSearched && !loading}
        <div class="pcr-model-panel-empty">No matches</div>
      {/if}
    </div>
  {/if}
</div>

<!-- Version submenu -->
{#if activeSubmenu?.type === "version"}
  {@const group = activeSubmenu.group}
  <div class="pcr-picker-submenu" style={submenuStyle}>
    <div class="pcr-picker-submenu-header">SELECT VERSION</div>
    {#each group.versions as model}
      {@const label = buildVersionLabel(model)}
      <div class="pcr-picker-version-item"
        class:pcr-submenu-open={activeNestedSubmenu?.model?.hash === model.hash}
        onclick={() => handleVersionClick(model, label)}>
        <span>{label}</span>
        <span class="pcr-picker-version-arrow">▶</span>
      </div>
    {/each}
  </div>
{/if}

<!-- Catalog version submenu: pick a version to download (latest first) -->
{#if activeSubmenu?.type === "catalogVersion"}
  {@const group = activeSubmenu.group}
  <div class="pcr-picker-submenu" style={submenuStyle}>
    <div class="pcr-picker-submenu-header">SELECT VERSION</div>
    {#each group.versions as entry}
      <div class="pcr-picker-version-item"
        onclick={() => handleCatalogVersionClick(entry)}>
        <span>{buildCatalogVersionLabel(entry)}</span>
        <span class="pcr-picker-version-arrow">↓</span>
      </div>
    {/each}
  </div>
{/if}

<!-- Template submenu (single-version or nested) -->
{#if activeSubmenu?.type === "template" || activeNestedSubmenu}
  {@const model = activeNestedSubmenu?.model || activeSubmenu?.model}
  {@const tpls = model ? templatesForModel(model) : []}
  {@const displayName = activeNestedSubmenu?.versionLabel || activeSubmenu?.displayName || ""}
  <div class="pcr-picker-submenu" style={activeNestedSubmenu ? nestedSubmenuStyle : submenuStyle}>
    <div class="pcr-picker-submenu-header">{displayName}</div>
    {#if canSwapInPlace(model)}
      <div class="pcr-picker-submenu-item pcr-picker-current-workflow"
        title="Swap this checkpoint into your current graph and reapply its settings — keeps your wiring (regional couple, etc.)"
        onclick={() => { onSwapInPlace(model.filename, model.hash); onClose?.(); }}>
        (Current Workflow)
      </div>
      {#if tpls.length}<div class="pcr-picker-category-header">TEMPLATES</div>{/if}
    {/if}
    {#if tpls.length}
      {@const cats = [...new Set(tpls.map(t => t.category || "General"))]}
      {@const sortedCats = sortCategories(cats)}
      {#each sortedCats as cat}
        {@const catTpls = tpls.filter(t => (t.category || "General") === cat)}
        {#if catTpls.length}
          {#if sortedCats.length > 1}
            <div class="pcr-picker-category-header">{cat.toUpperCase()}</div>
          {/if}
          {#each catTpls as tpl}
            <div class="pcr-picker-submenu-item"
              title={tpl.description || ""}
              onclick={() => handleTemplateClick(tpl, model)}>
              {tpl.name}
            </div>
          {/each}
        {/if}
      {/each}
    {:else}
      <div class="pcr-picker-submenu-item pcr-picker-submenu-hint">No templates available</div>
    {/if}
  </div>
{/if}

<HoverCard bind:this={hoverCard} pickerEl={pickerEl} />

<style>
  /* model picker panel */
  .pcr-model-picker {
    position: fixed;
    min-width: 280px;
    max-width: 360px;
    background: rgba(30, 30, 30, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.6);
    z-index: 100000;
    color: #ddd;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .pcr-picker-header {
    padding: 8px 10px;
    border-bottom: 1px solid #333;
  }
  .pcr-picker-search {
    width: 100%;
    padding: 5px 8px;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid #444;
    border-radius: 4px;
    color: #ddd;
    outline: none;
    box-sizing: border-box;
  }
  .pcr-picker-search:focus { border-color: #4fc3f7; }
  .pcr-picker-search::placeholder { color: #666; }
  .pcr-picker-list {
    overflow-y: auto;
    max-height: 320px;
    padding: 4px 0;
  }
  /* Active search: lock list to its max height so CivitAI results
     arriving async don't shift installed rows out from under the mouse.
     Capped at 40vh so a cramped viewport doesn't clip the panel. */
  .pcr-picker-list-reserved {
    min-height: min(320px, 40vh);
  }
  .pcr-picker-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    cursor: pointer;
  }
  .pcr-picker-item:hover { background: rgba(255, 255, 255, 0.05); }
  .pcr-picker-item-active { background: rgba(79, 195, 247, 0.1); }
  /* Just-installed model after a download+restart — draws the eye to it. */
  .pcr-picker-item-highlight {
    outline: 2px solid #4fc3f7;
    outline-offset: -2px;
    border-radius: 4px;
    background: rgba(79, 195, 247, 0.14);
  }
  .pcr-picker-item-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .pcr-picker-item-name {
    font-size: 12px;
    color: #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pcr-picker-item-meta {
    font-size: 10px;
    color: #777;
  }
  .pcr-picker-item-arrow {
    font-size: 14px;
    color: #555;
    margin-left: 8px;
    flex-shrink: 0;
  }
  .pcr-picker-item-active .pcr-picker-item-arrow { color: #4fc3f7; }

  /* submenus */
  .pcr-picker-submenu {
    position: fixed;
    min-width: 150px;
    background: rgba(30, 30, 30, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid #444;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 100001;
    padding: 4px 0;
  }
  .pcr-picker-submenu-header {
    padding: 6px 12px 4px;
    font-size: 10px;
    color: #666;
    letter-spacing: 0.5px;
  }
  .pcr-picker-submenu-item {
    padding: 7px 12px;
    font-size: 12px;
    color: #ddd;
    cursor: pointer;
    white-space: nowrap;
  }
  .pcr-picker-submenu-item:hover { background: rgba(255, 255, 255, 0.08); }
  .pcr-picker-current-workflow { color: #ff9d5c; font-weight: 600; }
  .pcr-picker-submenu-hint { color: #666; cursor: default; font-style: italic; }
  .pcr-picker-submenu-hint:hover { background: none; }

  /* version items — gold styling */
  .pcr-picker-version-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: rgba(255, 193, 7, 0.9);
    padding: 7px 12px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .pcr-picker-version-item:hover,
  .pcr-picker-version-item.pcr-submenu-open {
    background: rgba(255, 193, 7, 0.2);
    color: rgba(255, 193, 7, 1);
  }
  .pcr-picker-version-arrow {
    font-size: 10px;
    opacity: 0.7;
    margin-left: 8px;
  }

  /* nested (level 3) submenu */
  .pcr-picker-submenu.pcr-picker-nested-submenu {
    z-index: 100002;
  }

  /* gold version header at top of template submenu */
  .pcr-picker-version-header {
    background: rgba(255, 193, 7, 0.15);
    color: rgba(255, 193, 7, 0.95);
    font-size: 11px;
    font-weight: 600;
    padding: 8px 12px 6px;
    border-bottom: 1px solid rgba(255, 193, 7, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* category dividers in template submenus */
  .pcr-picker-category-header {
    padding: 6px 12px 4px;
    font-size: 10px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: rgba(40, 40, 40, 0.8);
    border-bottom: 1px solid #333;
  }
  .pcr-picker-category-header:not(:first-child) {
    margin-top: 4px;
    border-top: 1px solid #333;
  }

  /* recognition progress banner */
  .pcr-picker-recognition {
    padding: 8px 12px;
    font-size: 11px;
    color: #999;
    background: rgba(79, 195, 247, 0.06);
    border-bottom: 1px solid #333;
    animation: pcr-pulse 2s ease-in-out infinite;
  }

  /* CivitAI search results */
  .pcr-picker-civitai-section {
    border-top: 1px solid #444;
  }
  .pcr-picker-civitai-header {
    padding: 8px 12px 4px;
    font-size: 10px;
    color: #4fc3f7;
    letter-spacing: 0.5px;
  }
  .pcr-picker-civitai-item .pcr-picker-item-arrow {
    color: #4fc3f7;
    font-size: 14px;
  }

  /* catalog items */
  .pcr-picker-catalog-item {
    border-left: 2px solid #4fc3f7;
  }

  /* precision tags in picker rows */
  .pcr-picker-precision-row {
    display: flex;
    gap: 4px;
    margin-top: 3px;
  }
  .pcr-picker-precision-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pcr-precision-installed {
    background: rgba(79, 195, 247, 0.15);
    color: #4fc3f7;
    border: 1px solid rgba(79, 195, 247, 0.3);
  }
  .pcr-precision-installed:hover {
    background: rgba(79, 195, 247, 0.25);
  }
  .pcr-precision-partial {
    background: rgba(255, 183, 77, 0.15);
    color: #ffb74d;
    border: 1px solid rgba(255, 183, 77, 0.4);
  }
  .pcr-precision-partial:hover {
    background: rgba(255, 183, 77, 0.28);
  }
  .pcr-precision-missing {
    background: rgba(255, 255, 255, 0.05);
    color: #888;
    border: 1px solid #444;
  }
  .pcr-precision-missing:hover {
    color: #ccc;
    border-color: #666;
  }
  /* a started-but-unfinished download gets an amber edge so it reads as
     "resume", not "ready" */
  .pcr-picker-catalog-partial {
    border-left-color: #ffb74d;
  }
  .pcr-picker-resume-hint {
    color: #ffb74d;
  }

  .pcr-picker-civitai-loading {
    padding: 10px 12px;
    font-size: 11px;
    color: #888;
    text-align: center;
    animation: pcr-pulse 1.5s ease-in-out infinite;
  }
  .pcr-picker-civitai-empty {
    padding: 10px 12px;
    font-size: 11px;
    color: #666;
    text-align: center;
    font-style: italic;
  }

  /* version count badge */
  .pcr-model-version-badge {
    display: inline-block;
    font-size: 10px;
    padding: 0 4px;
    margin-left: 6px;
    background: rgba(79, 195, 247, 0.15);
    color: #4fc3f7;
    border-radius: 8px;
    vertical-align: middle;
  }
</style>
