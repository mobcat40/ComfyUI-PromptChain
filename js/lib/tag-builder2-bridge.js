// Tag Builder v2 bridge — lazy-loads the v2 Svelte module and manages its
// lifecycle. Shares tag-builder.css so the scaffold inherits panel/header styling.
// Public API: showTagBuilder2(view, from, to, options), hideTagBuilder2()

import { getTagSourceConfig, setTagSourceConfig } from "./tags-dropdown.js";
import { ensureSvelteCSS, createModuleLoader } from "./lazy-load.js";

let currentInstance = null;
let currentContainer = null;
let tbCssLoaded = false;

function ensureCSS() {
  ensureSvelteCSS();
  if (tbCssLoaded) return;
  tbCssLoaded = true;
  const tbLink = document.createElement("link");
  tbLink.rel = "stylesheet";
  tbLink.href = new URL("./tag-builder.css", import.meta.url).href;
  document.head.appendChild(tbLink);
}

let svelteModule = null;
const loadModule = createModuleLoader(async () => {
  svelteModule = await import("./svelte/promptchain-tag-builder2.js");
  return svelteModule;
});

// Walks back from `pos` for an unmatched `{`, then forward to its matching
// `}`. Returns the inner range or null if not inside a brace wildcard.
function findInlineWildcardRange(doc, pos) {
  let depth = 0;
  let openIdx = -1;
  for (let i = pos - 1; i >= 0; i--) {
    const ch = doc[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) { openIdx = i; break; }
      depth--;
    }
  }
  if (openIdx === -1) return null;
  let depth2 = 0;
  for (let i = openIdx + 1; i < doc.length; i++) {
    const ch = doc[i];
    if (ch === "{") depth2++;
    else if (ch === "}") {
      if (depth2 === 0) return { from: openIdx + 1, to: i };
      depth2--;
    }
  }
  return null;
}

// Regional-conditioning blocks: `$name { ... }`. Grammar mirrors
// region-highlight.js — `$[A-Za-z]\w*` then optional whitespace then `{`.
// Regions don't nest, but a `{a|b}` wildcard can sit inside the body, so the
// closer is found by depth-tracking braces — not the first `}`, which would
// stop short at the wildcard and corrupt the prompt on insert. Returns
// each block's wrapper bounds, interior bounds, and the indent of its first
// content line (so re-wrapping on insert preserves the user's layout).
const REGION_OPEN = /\$[A-Za-z]\w*\s*\{/g;
function findRegionBlocks(doc) {
  const blocks = [];
  REGION_OPEN.lastIndex = 0;
  let m;
  while ((m = REGION_OPEN.exec(doc)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    let depth = 1, i = openBrace + 1;
    for (; i < doc.length && depth > 0; i++) {
      const ch = doc[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    const close = depth === 0 ? i - 1 : -1;
    if (close === -1) continue; // unterminated block — leave it alone
    const indentMatch = doc.slice(openBrace + 1, close).match(/\n([ \t]+)\S/);
    blocks.push({
      name: m[0].match(/^\$[A-Za-z]\w*/)[0],
      headerStart: m.index,
      openBrace,
      innerFrom: openBrace + 1,
      innerTo: close,
      closeBrace: close,
      indent: indentMatch ? indentMatch[1] : "  ",
    });
    REGION_OPEN.lastIndex = close + 1;
  }
  return blocks;
}

export async function showTagBuilder2(view, from = 0, to = 0, options = {}) {
  ensureCSS();
  hideTagBuilder2();

  const mod = await loadModule();

  currentContainer = document.createElement("div");
  document.body.appendChild(currentContainer);

  const tagSourceConfig = getTagSourceConfig();
  // Pull current model info off the node so the Styles category can fetch
  // model-scoped prompt presets. May be null if no model is connected.
  const modelInfo = options.node?._pcrGetModelInfo?.() || null;

  // Resolve the parse range based on mode:
  //   "add"  — blank composer, insert at the cursor position on save
  //   "edit" — an explicit selection edits that text in isolation; otherwise,
  //            by cursor: inside a `$name{}` block edits just its interior,
  //            outside (with blocks) loads the whole composition, and with no
  //            blocks falls back to the inline wildcard or the whole doc.
  const docText = view.state.doc.toString();
  const mode = options.mode === "add" ? "add" : "edit";
  let parseFrom, parseTo;
  // Set when we scope to a region interior — drives re-wrapping on insert so
  // the `$name {` / `}` wrapper and indentation are reconstructed cleanly.
  let regionWrap = null;
  // Tells the parser how to default ambiguous loose text: "global" (editing
  // outside the regional blocks) routes it to the scene; "subject" (inside a
  // block, or a normal prompt) keeps the traditional main-prompt behavior.
  let editScope = "subject";
  if (mode === "add") {
    parseFrom = from;
    parseTo = from;
  } else if (from < to) {
    // Explicit selection → edit exactly that text in isolation. The lone
    // exception: a selection that swallowed a `$name { }` wrapper snaps to the
    // block interior (re-wrapped on insert) so the region assignment isn't
    // parsed as junk or dropped.
    const blocks = findRegionBlocks(docText);
    const anchorBlock = blocks.find(
      (b) => from >= b.headerStart && from <= b.closeBrace + 1
    ) || null;
    const withinInterior =
      anchorBlock && from >= anchorBlock.innerFrom && to <= anchorBlock.innerTo;
    if (anchorBlock && !withinInterior) {
      parseFrom = anchorBlock.innerFrom;
      parseTo = anchorBlock.innerTo;
      regionWrap = anchorBlock;
    } else {
      parseFrom = from;
      parseTo = to;
    }
  } else {
    // Cursor only (no selection).
    const blocks = findRegionBlocks(docText);
    const anchorBlock = blocks.find(
      (b) => from >= b.headerStart && from <= b.closeBrace + 1
    ) || null;
    if (anchorBlock) {
      // Inside a region block → edit just its interior, re-wrap on insert.
      parseFrom = anchorBlock.innerFrom;
      parseTo = anchorBlock.innerTo;
      regionWrap = anchorBlock;
    } else if (blocks.length) {
      // Outside every block (Phase 2): load the WHOLE composition. Each
      // `$name{}` block becomes an editable subject and the globals load too;
      // the builder parses the regions and rebuilds the entire doc on insert.
      editScope = "global";
      parseFrom = 0;
      parseTo = docText.length;
    } else {
      const wcRange = findInlineWildcardRange(docText, from);
      if (wcRange) {
        parseFrom = wcRange.from;
        parseTo = wcRange.to;
      } else {
        parseFrom = 0;
        parseTo = docText.length;
      }
    }
  }
  const initialText = mode === "add" ? "" : docText.slice(parseFrom, parseTo);

  currentInstance = mod.mountTagBuilder2(currentContainer, {
    from: parseFrom,
    to: parseTo,
    initialTab: options.initialTab || "all",
    initialQuery: options.initialQuery || "",
    initialText,
    editScope,
    tagSourceConfig,
    modelInfo,
    onPromptStyleChange: (style) => setTagSourceConfig({ prompt_style: style }),
    onInsert: (text) => {
      if (text) {
        const doc = view.state.doc;
        let result = text;
        if (regionWrap) {
          // We replaced a `$name{}` interior: the braces sit just outside
          // [parseFrom, parseTo], so re-indent the body and pad it with
          // newlines to land cleanly on its own lines between `{` and `}`.
          const indent = regionWrap.indent || "  ";
          const body = text
            .split("\n")
            .map((l) => (l.trim() ? indent + l : l))
            .join("\n");
          result = `\n${body}\n`;
        } else {
          const lineStart = doc.lineAt(parseFrom).from;
          const isAtLineStart = parseFrom === lineStart || parseFrom === 0;
          const isMultiline = text.includes("\n");
          // When the parse range was a selection / inline wildcard / etc,
          // we replace exactly that range. When it was the whole doc,
          // parseFrom..parseTo equals 0..doc.length — wholesale rewrite.
          const isWholeDoc = parseFrom === 0 && parseTo === docText.length;

          if (!isWholeDoc && parseFrom > 0 && !isAtLineStart) {
            if (isMultiline) {
              result = "\n\n" + result;
            } else {
              const textBefore = doc.sliceString(Math.max(0, parseFrom - 1), parseFrom);
              if (textBefore && !/\s/.test(textBefore)) {
                result = (tagSourceConfig.prompt_style === "natural" ? " " : ", ") + result;
              }
            }
          }
        }

        view.dispatch({
          changes: { from: parseFrom, to: parseTo, insert: result },
          selection: { anchor: parseFrom + result.length },
        });
      }
      hideTagBuilder2();
      view.focus();
    },
    onClose: () => {
      hideTagBuilder2();
      view.focus();
    },
  });
}

export function hideTagBuilder2() {
  if (currentInstance) {
    svelteModule?.destroyTagBuilder2(currentInstance);
    currentInstance = null;
  }
  if (currentContainer) {
    currentContainer.remove();
    currentContainer = null;
  }
}
