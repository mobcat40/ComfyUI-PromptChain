import { getLinkInfo } from "./slot-utils.js";

const app = window.comfyAPI?.app?.app || window.app;

let activeMenu = null;
let openedAt = 0;

// prompt cache: hash → { prompts, groups }
const _promptCache = new Map();

function _isInsideMenu(target) {
  if (activeMenu?.contains(target)) return true;
  return !!target.closest(".pcr-context-submenu, .pcr-context-preview");
}

window.addEventListener("pointerdown", (e) => {
  if (!activeMenu) return;
  if (Date.now() - openedAt < 200) return;
  if (_isInsideMenu(e.target)) return;
  closeMenu();
}, true);

window.addEventListener("contextmenu", (e) => {
  if (!activeMenu) return;
  if (_isInsideMenu(e.target)) return;
  closeMenu();
}, true);

function closeMenu() {
  if (activeMenu) {
    // clean up all submenus and preview cards
    document.querySelectorAll(".pcr-context-submenu, .pcr-context-preview").forEach(el => el.remove());
    activeMenu.remove();
    activeMenu = null;
  }
}

// ── graph traversal ──────────────────────────────────────────────

const KSAMPLER_TYPES = new Set(["KSampler", "KSamplerAdvanced", "PromptChain_RegionalDetailer", "SamplerCustomAdvanced", "UltimateSDUpscale", "UltimateSDUpscaleNoUpscale", "PromptChain_IdeogramSampler"]);
const LOAD_IMAGE_TYPES = new Set(["LoadImage", "LoadImageOutput"]);
function _findDownstream(startNode, targetTypes, graph) {
  const visited = new Set();
  const queue = [startNode];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    for (const output of (n.outputs || [])) {
      for (const linkId of (output.links || [])) {
        const link = getLinkInfo(linkId);
        if (!link) continue;
        const target = graph.getNodeById(link.target_id);
        if (!target) continue;
        if (targetTypes.has(target.comfyClass || target.type)) return target;
        queue.push(target);
      }
    }
  }
  return null;
}

function _findAllUpstream(startNode, targetTypes, graph) {
  const found = [];
  const visited = new Set();
  const queue = [startNode];
  while (queue.length) {
    const n = queue.shift();
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    for (const input of (n.inputs || [])) {
      if (input.link == null) continue;
      const link = getLinkInfo(input.link);
      if (!link) continue;
      const source = graph.getNodeById(link.origin_id);
      if (!source) continue;
      if (targetTypes.has(source.comfyClass || source.type)) found.push(source);
      queue.push(source);
    }
  }
  return found;
}

/**
 * Find all LoadImage nodes in the network, sorted with the latent_image
 * source first (the image being img2img'd), then the rest by node id.
 */
function findLoadImagesInNetwork(node) {
  const graph = app?.graph;
  if (!graph || !node) return [];

  const sampler = _findDownstream(node, KSAMPLER_TYPES, graph);
  if (!sampler) return [];

  const all = _findAllUpstream(sampler, LOAD_IMAGE_TYPES, graph);
  if (all.length === 0) return [];

  // dedupe by node id
  const seen = new Set();
  const unique = [];
  for (const n of all) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    unique.push(n);
  }

  // put the latent_image source first
  const latentInput = (sampler.inputs || []).find(i => i.name === "latent_image" && i.link != null);
  if (latentInput && unique.length > 1) {
    const link = getLinkInfo(latentInput.link);
    if (link) {
      const latentSourceId = link.origin_id;
      // the latent_image source itself, or trace upstream from it
      const primaryIdx = unique.findIndex(n => n.id === latentSourceId);
      if (primaryIdx > 0) {
        const [primary] = unique.splice(primaryIdx, 1);
        unique.unshift(primary);
      } else if (primaryIdx === -1) {
        // latent source isn't a LoadImage directly — find which LoadImage feeds it
        const latentSource = graph.getNodeById(latentSourceId);
        if (latentSource) {
          const upstream = _findAllUpstream(latentSource, LOAD_IMAGE_TYPES, graph);
          if (upstream.length) {
            const pid = upstream[0].id;
            const idx = unique.findIndex(n => n.id === pid);
            if (idx > 0) {
              const [primary] = unique.splice(idx, 1);
              unique.unshift(primary);
            }
          }
        }
      }
    }
  }

  return unique;
}

function _getImageLabel(loadImageNode) {
  const widget = loadImageNode.widgets?.find(w => w.name === "image");
  const filename = widget?.value || "unknown";
  return filename.replace(/\s*\[(input|output)\]\s*$/i, "").replace(/^.*[\\/]/, "");
}

function _getImageViewUrl(loadImageNode) {
  const widget = loadImageNode.widgets?.find(w => w.name === "image");
  const raw = widget?.value || "";
  const typeMatch = raw.match(/\[(input|output)\]\s*$/i);
  const type = typeMatch ? typeMatch[1] : "input";
  const filename = raw.replace(/\s*\[(input|output)\]\s*$/i, "").trim();
  const parts = filename.split(/[\\/]/);
  const name = parts.pop();
  const subfolder = parts.join("/");
  let url = `/view?filename=${encodeURIComponent(name)}&type=${type}`;
  if (subfolder) url += `&subfolder=${encodeURIComponent(subfolder)}`;
  return url;
}

// ── prompt helpers ───────────────────────────────────────────────

async function _fetchPrompts(modelInfo) {
  const hash = modelInfo.hash;
  if (_promptCache.has(hash)) return _promptCache.get(hash);

  // get model settings for arch/family/name, fall back to identity arch
  let arch = modelInfo.architecture || "";
  let family = "";
  let name = "";

  try {
    const r = await fetch(`/promptchain/models/settings/${hash}`);
    if (r.ok) {
      const cfg = await r.json();
      arch = cfg.architecture || arch;
      family = cfg.family || "";
      name = cfg.model_name || "";
    }
  } catch { /* use identity arch */ }

  const params = new URLSearchParams();
  if (arch) params.set("arch", arch);
  if (family) params.set("family", family);
  if (name) params.set("name", name);
  if (hash) params.set("hash", hash);

  try {
    const r = await fetch(`/promptchain/prompts/list?${params}`);
    if (!r.ok) return null;
    const { prompts } = await r.json();
    if (!prompts?.length) return null;

    // group by category
    const groups = new Map();
    for (const p of prompts) {
      const cat = p.category || "";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    }

    const entry = { prompts, groups };
    _promptCache.set(hash, entry);
    return entry;
  } catch { return null; }
}

// Returns the wildcard name if pos is inside a __name__ token, else null.
function _getWildcardAtPos(doc, pos) {
  const regex = /__([a-zA-Z0-9_/.-]+)__/g;
  let m;
  while ((m = regex.exec(doc)) !== null) {
    if (pos >= m.index && pos <= m.index + m[0].length) return m[1];
  }
  return null;
}

const _WILDCARD_MODES = new Set(["roll", "switch", "iterate"]);

function _isWildcardContext(doc, pos, node) {
  // Empty doc — insert the prompt as-is; nothing to extend.
  if (!doc.trim()) return false;

  // Cursor inside {…} brace wildcard always wins, regardless of mode.
  let depth = 0;
  for (let i = 0; i < pos && i < doc.length; i++) {
    if (doc[i] === "{") depth++;
    else if (doc[i] === "}") depth--;
  }
  if (depth > 0) return true;

  // Mode alone isn't enough — a roll/switch/iterate node with free-form
  // prose shouldn't get ::Label:: wrapping tacked onto new insertions.
  // Only treat the doc as wildcard when it already contains wildcard syntax.
  const mode = node?.properties?.pcrMode;
  if (!mode || !_WILDCARD_MODES.has(mode)) return false;
  return /^::[^\n]+::\s*$/m.test(doc) || /\{[^{}]*\|[^{}]*\}/.test(doc);
}

function _formatWildcardOption(prompt) {
  const cat = prompt.category || "";
  const label = cat ? `${cat} - ${prompt.name}` : prompt.name;

  // extract positive/negative from the raw text, stripping comment headers
  const raw = (prompt.text || "")
    .replace(/\/\/[^\n]*\n?/g, "")  // strip // comments
    .replace(/\{cursor\}/g, "")     // strip cursor marker
    .trim();

  const negIdx = raw.search(/Negative Prompt\s*:/i);
  let pos, neg;
  if (negIdx >= 0) {
    pos = raw.slice(0, negIdx).trim();
    neg = raw.slice(negIdx).replace(/^Negative Prompt\s*:\s*/i, "").trim();
  } else {
    pos = raw;
    neg = "";
  }

  let result = `::${label}::\n\t${pos}`;
  if (neg) result += `\n\tNegative Prompt: ${neg}`;
  return result;
}

// Mirrors buildPromptInsertion in autocomplete.js (@prompt source): an empty
// editor gets the full template ("// Your Tags" scaffold included, caret on
// the {cursor} slot); an editor with content already HAS the user's tags, so
// everything up to and including {cursor} is dropped and only the style +
// negative sections are inserted.
function _insertPromptAtPos(view, text, pos) {
  const doc = view.state.doc.toString();
  const cursorIdx = text.indexOf("{cursor}");

  let insertText, anchor;
  if (!doc.trim()) {
    insertText = text.replace("{cursor}", "");
    anchor = cursorIdx >= 0 ? pos + cursorIdx : pos + insertText.length;
  } else {
    const after = cursorIdx >= 0 ? text.slice(cursorIdx + "{cursor}".length) : text;
    const trimmedAfter = after.replace(/^\s+/, "");
    // Caret lands at the end of the positive section (just before the
    // Negative Prompt block), or end of insertion without one.
    const negMatch = trimmedAfter.match(/\n+Negative Prompt:/i);
    let cursorWithinAfter;
    if (negMatch) {
      let idx = negMatch.index;
      while (idx > 0 && /\s/.test(trimmedAfter[idx - 1])) idx--;
      cursorWithinAfter = idx;
    } else {
      cursorWithinAfter = trimmedAfter.length;
    }
    const before = doc.slice(0, pos);
    const trailNewlines = (before.match(/\n*$/) || [""])[0].length;
    const separator = before.trim() ? "\n".repeat(Math.max(0, 2 - trailNewlines)) : "";
    insertText = separator + trimmedAfter;
    anchor = pos + separator.length + cursorWithinAfter;
  }

  view.dispatch({
    changes: { from: pos, to: pos, insert: insertText },
    selection: { anchor },
  });
  view.focus();
}

function _insertWildcardOption(view, prompt, pos, inBraces) {
  const doc = view.state.doc.toString();
  const option = _formatWildcardOption(prompt);

  let prefix = "";
  if (inBraces) {
    // inside {…} — need pipe separator if there's content before us
    let needsPipe = false;
    for (let i = pos - 1; i >= 0; i--) {
      const ch = doc[i];
      if (ch === "{" || ch === "|") break;
      if (ch !== " " && ch !== "\n" && ch !== "\t") { needsPipe = true; break; }
    }
    if (needsPipe) prefix = " |\n";
  } else {
    // label mode — just ensure we start on a new line
    if (pos > 0 && doc[pos - 1] !== "\n") prefix = "\n";
  }

  const insertText = prefix + option;
  view.dispatch({
    changes: { from: pos, to: pos, insert: insertText },
    selection: { anchor: pos + insertText.length },
  });
  view.focus();
}

// ── keyword helpers ──────────────────────────────────────────────

const _KW_RE = /__LoadImage(Positive|Negative)(?:_(\d+))?__/g;

// Returns {keyword, index} if cursor is on a LoadImage keyword, else null.
function _cursorKeyword(doc, sel) {
  const pos = sel.head;
  for (const m of doc.matchAll(_KW_RE)) {
    if (pos >= m.index && pos <= m.index + m[0].length) {
      return { keyword: m[0], index: m[2] ? parseInt(m[2]) : null };
    }
  }
  return null;
}

function _hasAnyLoadImageKeyword(doc) {
  return /__LoadImage(Positive|Negative)/.test(doc);
}

// ── context menu ─────────────────────────────────────────────────

export function showContextMenu(x, y, view, node) {
  closeMenu();

  const sel = view.state.selection.main;
  const hasSelection = !sel.empty;
  const doc = view.state.doc.toString();
  const loadImages = node ? findLoadImagesInNetwork(node) : [];
  const alreadyInserted = _hasAnyLoadImageKeyword(doc);
  const cursorHit = _cursorKeyword(doc, sel);

  // capture insert position from right-click coordinates
  const insertPos = view.posAtCoords({ x, y }) ?? sel.head;

  const menu = document.createElement("div");
  menu.className = "pcr-mode-menu pcr-context-menu";

  const items = [];

  // Open in Editor — when right-clicking a __wildcard__ token
  const wcMatch = _getWildcardAtPos(doc, insertPos);
  if (wcMatch) {
    items.push({
      label: "Open in Editor",
      action: () => {
        import("./fullscreen-bridge.js").then(m => {
          // node.graph gate: modal editors pass a graphless model-info stub —
          // fullscreen only makes sense for a real canvas node.
          if (!m.isSvelteFullscreenActive() && node?.graph) {
            m.showSvelteFullscreen(node);
          }
          // wildcard tab support is Phase 5b
        });
      },
      enabled: true,
    });
  }

  // Resolve to Text — top of menu when cursor is on a keyword
  if (cursorHit) {
    // figure out which LoadImage this keyword refers to
    const targetNode = cursorHit.index != null
      ? loadImages[cursorHit.index - 1] || loadImages[0]
      : loadImages[0];
    items.push({
      label: "Resolve to Text",
      action: () => resolveKeywordToText(view, targetNode, cursorHit.keyword),
      enabled: !!targetNode,
    });
  }

  items.push({
    label: "Add Tags",
    action: () => openTagBuilder2(view, node, "add"),
  });
  items.push({
    label: "Edit Tags",
    action: () => openTagBuilder2(view, node, "edit"),
  });
  items.push({
    label: "Tag Builder (Legacy)",
    action: () => openTagBuilder(view),
  });

  // Prompts — async submenu populated on hover
  const modelInfo = node?._pcrGetModelInfo?.();
  if (modelInfo?.hash) {
    items.push({
      label: "Prompts",
      asyncSubmenu: () => _buildPromptSubmenu(view, insertPos, modelInfo, node),
    });
  }

  // Load Image Prompt insertion
  if (!alreadyInserted && loadImages.length === 1) {
    items.push({
      label: "Insert Load Image Prompt",
      action: () => insertLoadImageKeywords(view, null, loadImages[0]),
      enabled: true,
    });
  } else if (!alreadyInserted && loadImages.length > 1) {
    items.push({
      label: "Load Image Prompts",
      submenu: loadImages.map((li, i) => ({
        label: _getImageLabel(li),
        action: () => insertLoadImageKeywords(view, i + 1, li),
        imageUrl: _getImageViewUrl(li),
      })),
    });
  }

  items.push({ sep: true });
  items.push({ label: "Cut", shortcut: "Ctrl+X", action: () => clipboardAction(view, "cut"), enabled: hasSelection });
  items.push({ label: "Copy", shortcut: "Ctrl+C", action: () => clipboardAction(view, "copy"), enabled: hasSelection });
  items.push({ label: "Paste", shortcut: "Ctrl+V", action: () => clipboardAction(view, "paste"), enabled: true });
  items.push({ sep: true });
  items.push({ label: "Select All", shortcut: "Ctrl+A", action: () => selectAll(view), enabled: true });

  _buildMenu(menu, items, x, y);
}

function _buildMenu(menu, items, x, y) {
  for (const item of items) {
    if (!item) continue;
    if (item.sep) {
      const sep = document.createElement("div");
      sep.className = "pcr-context-separator";
      menu.appendChild(sep);
      continue;
    }

    const row = document.createElement("div");
    row.className = "pcr-context-item" + (item.enabled === false ? " pcr-context-disabled" : "");

    if (item.submenu || item.asyncSubmenu) {
      // parent row with arrow indicator
      row.innerHTML = `
        <span class="pcr-context-label">${item.label}</span>
        <span class="pcr-context-shortcut">\u25B6</span>
      `;
      if (item.asyncSubmenu) {
        let _fetching = false;
        row.addEventListener("mouseenter", async () => {
          clearTimeout(row._pcrHideTimer);
          if (row._pcrSubmenu) return; // already open
          if (_fetching) return;
          _fetching = true;
          const subItems = await item.asyncSubmenu();
          _fetching = false;
          if (!activeMenu) return; // menu was closed during fetch
          if (subItems?.length) _showSubmenu(row, subItems);
        });
      } else {
        row.addEventListener("mouseenter", () => {
          clearTimeout(row._pcrHideTimer);
          _showSubmenu(row, item.submenu);
        });
      }
      row.addEventListener("mouseleave", () => {
        row._pcrHideTimer = setTimeout(() => {
          if (!row._pcrSubmenu?.matches(":hover")) _hideSubmenu(row);
        }, 150);
      });
    } else {
      row.innerHTML = `
        <span class="pcr-context-label">${item.label}</span>
        ${item.shortcut ? `<span class="pcr-context-shortcut">${item.shortcut}</span>` : ""}
      `;
      if (item.enabled !== false) {
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          closeMenu();
          item.action();
        });
      }
    }
    menu.appendChild(row);
  }

  document.body.appendChild(menu);
  activeMenu = menu;
  openedAt = Date.now();

  const rect = menu.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
  if (x < 4) x = 4;
  if (y < 4) y = 4;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function _showSubmenu(parentRow, subItems) {
  // close any sibling submenus in the same parent menu
  const parentMenu = parentRow.parentElement;
  if (parentMenu) {
    for (const sibling of parentMenu.children) {
      if (sibling !== parentRow && sibling._pcrSubmenu) {
        clearTimeout(sibling._pcrHideTimer);
        _hideSubmenu(sibling);
      }
    }
  }
  _hideSubmenu(parentRow);
  const sub = document.createElement("div");
  sub.className = "pcr-mode-menu pcr-context-menu pcr-context-submenu";

  // floating preview card (for image previews)
  const preview = document.createElement("div");
  preview.className = "pcr-context-preview";
  preview.style.display = "none";
  const previewImg = document.createElement("img");
  preview.appendChild(previewImg);

  for (const si of subItems) {
    const row = document.createElement("div");
    row.className = "pcr-context-item";

    if (si.submenu) {
      // nested submenu (e.g. category → prompts)
      row.innerHTML = `
        <span class="pcr-context-label">${si.label}</span>
        <span class="pcr-context-shortcut">\u25B6</span>
      `;
      row.addEventListener("mouseenter", () => {
        clearTimeout(row._pcrHideTimer);
        _showSubmenu(row, si.submenu);
      });
      row.addEventListener("mouseleave", () => {
        row._pcrHideTimer = setTimeout(() => {
          if (!row._pcrSubmenu?.matches(":hover")) _hideSubmenu(row);
        }, 150);
      });
    } else {
      row.innerHTML = `<span class="pcr-context-label">${si.label}</span>`;
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
        si.action();
      });
      if (si.imageUrl) {
        row.addEventListener("mouseenter", () => {
          previewImg.src = si.imageUrl;
          preview.style.display = "";
        });
        row.addEventListener("mouseleave", () => {
          preview.style.display = "none";
        });
      }
    }

    sub.appendChild(row);
  }

  document.body.appendChild(sub);
  document.body.appendChild(preview);
  parentRow._pcrSubmenu = sub;
  parentRow._pcrPreview = preview;

  // position submenu to the right of the parent row
  const pr = parentRow.getBoundingClientRect();
  let sx = pr.right;
  let sy = pr.top;
  sub.style.left = `${sx}px`;
  sub.style.top = `${sy}px`;

  const sr = sub.getBoundingClientRect();
  if (sx + sr.width > window.innerWidth) sx = pr.left - sr.width;
  if (sy + sr.height > window.innerHeight) sy = window.innerHeight - sr.height - 8;
  sub.style.left = `${sx}px`;
  sub.style.top = `${sy}px`;

  // position preview card to the right of the submenu
  const updatePreviewPos = () => {
    const sbr = sub.getBoundingClientRect();
    let px = sbr.right + 4;
    let py = sbr.top;
    if (px + 130 > window.innerWidth) px = sbr.left - 134;
    preview.style.left = `${px}px`;
    preview.style.top = `${py}px`;
  };
  updatePreviewPos();
  previewImg.addEventListener("load", updatePreviewPos);

  sub.addEventListener("mouseleave", () => {
    parentRow._pcrHideTimer = setTimeout(() => {
      if (!parentRow.matches(":hover") && !_isSubmenuTreeHovered(sub)) _hideSubmenu(parentRow);
    }, 150);
  });
  sub.addEventListener("mouseenter", () => {
    clearTimeout(parentRow._pcrHideTimer);
  });
}

// Check if a submenu or any of its nested child submenus are hovered.
function _isSubmenuTreeHovered(sub) {
  if (sub.matches(":hover")) return true;
  for (const child of sub.children) {
    if (child._pcrSubmenu && _isSubmenuTreeHovered(child._pcrSubmenu)) return true;
  }
  return false;
}

function _hideSubmenu(parentRow) {
  if (parentRow._pcrSubmenu) {
    // recursively clean up any nested submenus first
    for (const child of parentRow._pcrSubmenu.children) {
      if (child._pcrSubmenu) _hideSubmenu(child);
    }
    parentRow._pcrSubmenu.remove();
    parentRow._pcrSubmenu = null;
  }
  if (parentRow._pcrPreview) {
    parentRow._pcrPreview.remove();
    parentRow._pcrPreview = null;
  }
}

// ── prompt submenu builder ───────────────────────────────────────

async function _buildPromptSubmenu(view, insertPos, modelInfo, node) {
  // A model with no saved presets must SAY so — a hover that silently shows
  // nothing reads as a broken menu (bit the inpaint engine picker).
  const emptyNotice = [{ label: "No saved prompts for this model", enabled: false }];
  const data = await _fetchPrompts(modelInfo);
  if (!data) return emptyNotice;

  const doc = view.state.doc.toString();
  const isWildcard = _isWildcardContext(doc, insertPos, node);

  // distinguish brace wildcards from label-mode wildcards for separator style
  let inBraces = false;
  if (isWildcard) {
    let depth = 0;
    for (let i = 0; i < insertPos && i < doc.length; i++) {
      if (doc[i] === "{") depth++;
      else if (doc[i] === "}") depth--;
    }
    inBraces = depth > 0;
  }

  const insertAction = (p) => isWildcard
    ? () => _insertWildcardOption(view, p, insertPos, inBraces)
    : () => _insertPromptAtPos(view, p.text || "", insertPos);

  const { groups } = data;
  const subItems = [];

  for (const [cat, prompts] of groups) {
    if (prompts.length === 1 && !cat) {
      const p = prompts[0];
      subItems.push({ label: p.name, action: insertAction(p) });
    } else if (prompts.length === 1) {
      const p = prompts[0];
      subItems.push({
        label: cat ? `${cat}: ${p.name}` : p.name,
        action: insertAction(p),
      });
    } else {
      subItems.push({
        label: cat || "Uncategorized",
        submenu: prompts.map(p => ({
          label: p.name,
          action: insertAction(p),
        })),
      });
    }
  }

  return subItems.length ? subItems : emptyNotice;
}

// ── actions ──────────────────────────────────────────────────────

async function insertLoadImageKeywords(view, index, loadImageNode) {
  const suffix = index != null ? `_${index}` : "";
  const posKw = `__LoadImagePositive${suffix}__`;
  const negKw = `__LoadImageNegative${suffix}__`;

  // check what the image actually has before inserting keywords
  let hasPos = true, hasNeg = true;
  const imageWidget = loadImageNode?.widgets?.find(w => w.name === "image");
  if (imageWidget?.value) {
    try {
      const resp = await fetch("/promptchain/extract-image-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_path: imageWidget.value }),
      });
      if (resp.ok) {
        const data = await resp.json();
        hasPos = !!(data.positive?.trim());
        hasNeg = !!(data.negative?.trim());
      }
    } catch { /* fall through — insert both as fallback */ }
  }

  if (!hasPos && !hasNeg) return;

  const doc = view.state.doc.toString();
  const negMatch = doc.match(/negative\s+prompt\s*:/i);

  let newDoc;
  if (negMatch) {
    const beforeNeg = doc.slice(0, negMatch.index).trimEnd();
    const negAndAfter = doc.slice(negMatch.index).trimEnd();
    const posSep = beforeNeg && hasPos ? ", " : "";
    newDoc = beforeNeg + (hasPos ? posSep + posKw : "") + "\n\n" + negAndAfter + (hasNeg ? ", " + negKw : "");
  } else if (hasPos && hasNeg) {
    const trimmed = doc.trimEnd();
    const posSep = trimmed ? ", " : "";
    newDoc = trimmed + posSep + posKw + "\n\nNegative Prompt: " + negKw;
  } else if (hasPos) {
    const trimmed = doc.trimEnd();
    const posSep = trimmed ? ", " : "";
    newDoc = trimmed + posSep + posKw;
  } else {
    // only negative — append to existing negative section or create one
    if (negMatch) {
      newDoc = doc.trimEnd() + ", " + negKw;
    } else {
      const trimmed = doc.trimEnd();
      newDoc = trimmed + (trimmed ? "\n\n" : "") + "Negative Prompt: " + negKw;
    }
  }

  view.dispatch({
    changes: { from: 0, to: doc.length, insert: newDoc },
  });
}

function clipboardAction(view, command) {
  view.focus();
  const sel = view.state.selection.main;

  if (command === "cut" && !sel.empty) {
    const text = view.state.sliceDoc(sel.from, sel.to);
    navigator.clipboard.writeText(text);
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: "" } });
  } else if (command === "copy" && !sel.empty) {
    const text = view.state.sliceDoc(sel.from, sel.to);
    navigator.clipboard.writeText(text);
  } else if (command === "paste") {
    navigator.clipboard.readText().then((text) => {
      if (text) {
        const s = view.state.selection.main;
        view.dispatch({ changes: { from: s.from, to: s.to, insert: text } });
      }
    }).catch(() => {});
  }
}

function selectAll(view) {
  view.focus();
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
}

async function openTagBuilder(view) {
  const { showTagBuilder } = await import("./tag-builder-bridge.js");
  const sel = view.state.selection.main;
  showTagBuilder(view, sel.from, sel.to);
}

async function openTagBuilder2(view, node, mode = "edit") {
  const { showTagBuilder2 } = await import("./tag-builder2-bridge.js");
  const sel = view.state.selection.main;
  showTagBuilder2(view, sel.from, sel.to, { node, mode });
}

async function resolveKeywordToText(view, loadImageNode, keyword) {
  if (!loadImageNode) return;
  const imageWidget = loadImageNode.widgets?.find(w => w.name === "image");
  if (!imageWidget?.value) return;

  try {
    const resp = await fetch("/promptchain/extract-image-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_path: imageWidget.value }),
    });
    if (!resp.ok) return;
    const data = await resp.json();

    const isPositive = keyword.includes("Positive");
    const replacement = isPositive ? (data.positive || "") : (data.negative || "");

    const doc = view.state.doc.toString();
    const idx = doc.indexOf(keyword);
    if (idx === -1) return;

    view.dispatch({
      changes: { from: idx, to: idx + keyword.length, insert: replacement },
    });
  } catch { /* silent */ }
}

// ── keyword hover tooltip ────────────────────────────────────────

const _tooltipCache = new Map(); // imagePath → {positive, negative}
let _tooltip = null;
let _tooltipTimer = null;

function _ensureTooltip() {
  if (!_tooltip) {
    _tooltip = document.createElement("div");
    _tooltip.className = "pcr-context-kw-tooltip";
    _tooltip.style.display = "none";
    document.body.appendChild(_tooltip);
  }
  return _tooltip;
}

function _hideTooltip() {
  clearTimeout(_tooltipTimer);
  if (_tooltip) _tooltip.style.display = "none";
}

/**
 * Wire up keyword hover tooltips on a CodeMirror view.
 * Call once per editor after creation.
 */
export function setupKeywordTooltip(view, getNode) {
  view.dom.addEventListener("mousemove", (e) => {
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) { _hideTooltip(); return; }

    const doc = view.state.doc.toString();
    let hit = null;
    for (const m of doc.matchAll(_KW_RE)) {
      if (pos >= m.index && pos <= m.index + m[0].length) {
        hit = { keyword: m[0], polarity: m[1], index: m[2] ? parseInt(m[2]) : null };
        break;
      }
    }

    if (!hit) { _hideTooltip(); return; }

    // debounce — only fetch after hovering 300ms
    clearTimeout(_tooltipTimer);
    _tooltipTimer = setTimeout(() => _showKeywordTooltip(e, hit, getNode), 300);
  });

  view.dom.addEventListener("mouseleave", _hideTooltip);
}

async function _showKeywordTooltip(event, hit, getNode) {
  const node = getNode();
  if (!node) return;

  const loadImages = findLoadImagesInNetwork(node);
  const targetNode = hit.index != null
    ? loadImages[hit.index - 1] || loadImages[0]
    : loadImages[0];
  if (!targetNode) return;

  const imageWidget = targetNode.widgets?.find(w => w.name === "image");
  const imagePath = imageWidget?.value;
  if (!imagePath) return;

  let data = _tooltipCache.get(imagePath);
  if (!data) {
    try {
      const resp = await fetch("/promptchain/extract-image-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_path: imagePath }),
      });
      if (!resp.ok) return;
      data = await resp.json();
      _tooltipCache.set(imagePath, data);
    } catch { return; }
  }

  const text = hit.polarity === "Positive" ? data.positive : data.negative;
  if (!text) { _hideTooltip(); return; }

  const tip = _ensureTooltip();
  // truncate long prompts for tooltip display
  tip.textContent = text.length > 300 ? text.slice(0, 300) + "..." : text;
  tip.style.display = "";

  // position near cursor
  let tx = event.clientX + 12;
  let ty = event.clientY + 16;
  const tr = tip.getBoundingClientRect();
  if (tx + tr.width > window.innerWidth) tx = window.innerWidth - tr.width - 8;
  if (ty + tr.height > window.innerHeight) ty = event.clientY - tr.height - 8;
  tip.style.left = `${tx}px`;
  tip.style.top = `${ty}px`;
}
