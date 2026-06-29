// CodeMirror 6 bundle for PromptChain
// Exports: core CM6 + custom prompt language, theme, linter, keybindings, wildcard system

// -- Core CM6 --
import { EditorView, keymap, Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import { EditorState, StateField, StateEffect, Compartment } from "@codemirror/state";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { linter, diagnosticCount, forceLinting } from "@codemirror/lint";
import { autocompletion, startCompletion, acceptCompletion, completionStatus, pickedCompletion } from "@codemirror/autocomplete";
import { tooltips } from "@codemirror/view";
import { tags } from "@lezer/highlight";

// -- Prompt Language (StreamLanguage) --
const promptLanguage = StreamLanguage.define({
  startState() {
    return { inBlockComment: false, inNegativeRegion: false, inScriptBlock: false };
  },
  copyState(state) {
    return {
      inBlockComment: state.inBlockComment,
      inNegativeRegion: state.inNegativeRegion,
      inScriptBlock: state.inScriptBlock,
    };
  },
  token(stream, state) {
    // script blocks
    if (state.inScriptBlock && stream.match(/<\/SCRIPT>/i)) {
      state.inScriptBlock = false;
      return "moduleKeyword";
    }
    if (state.inScriptBlock) {
      if (stream.match(/\{PROMPT\}/i)) return "operator";
      stream.next();
      return "typeName";
    }
    if (stream.match(/<SCRIPT>/i)) {
      state.inScriptBlock = true;
      return "moduleKeyword";
    }

    // negative prompt region — reset at ::Label:: boundaries so
    // per-option negatives don't bleed into the next option
    if (state.inNegativeRegion && stream.sol() && stream.match(/::/, false)) {
      state.inNegativeRegion = false;
    }
    if (stream.match("Negative Prompt:")) {
      state.inNegativeRegion = true;
      return "deleted";
    }
    if (state.inNegativeRegion) {
      stream.next();
      return "deleted";
    }

    // block comments
    if (state.inBlockComment) {
      while (!stream.eol()) {
        if (stream.match("*/")) {
          state.inBlockComment = false;
          return "comment";
        }
        stream.next();
      }
      return "comment";
    }
    if (stream.match("/*")) {
      state.inBlockComment = true;
      while (!stream.eol()) {
        if (stream.match("*/")) {
          state.inBlockComment = false;
          return "comment";
        }
        stream.next();
      }
      return "comment";
    }

    // line comments
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    // # comments only at line start (with optional leading whitespace),
    // matching the Python compiler's strip_comments behavior.
    if (stream.match("#", false)) {
      const before = stream.string.slice(0, stream.pos);
      if (/^\s*$/.test(before)) {
        stream.match("#");
        stream.skipToEnd();
        return "comment";
      }
    }

    // ::labels::
    if (stream.match(/::[^:\n]+::/)) return "regexp";

    // lora
    if (stream.match(/<lora:[^>]+>/i)) return "meta";

    // embeddings
    if (stream.match(/<embedding:[^>]+>/i) || stream.match(/embedding:\w+/i)) return "className";

    // wildcards (supports hierarchical paths like __name/key__)
    if (stream.match(/__[a-zA-Z0-9_/.-]+__/)) return "variableName";

    // BREAK — case-sensitive, matches the convention used by A1111,
    // dfl-clip-with-break, and asagi4 prompt-control encoders.
    if (stream.match(/\bBREAK\b/)) return "keyword";

    // parentheses (emphasis)
    if (stream.peek() === "(") { stream.next(); return "atom"; }
    if (stream.peek() === ")") { stream.next(); return "atom"; }

    // weight colon + number
    if (stream.match(/:(?=[\d.]+\))/)) return "punctuation";
    if (stream.match(/[\d.]+(?=\))/)) return "number";

    // brackets (de-emphasis)
    if (stream.peek() === "[") { stream.next(); return "tagName"; }
    if (stream.peek() === "]") { stream.next(); return "tagName"; }

    // standalone numbers
    if (stream.match(/\b\d+\.?\d*\b/)) return "number";

    // operators: comma, pipe, braces
    if (stream.match(/[,|{}]/)) return "operator";

    stream.next();
    return null;
  },
});

// -- Prompt Theme --
const promptTheme = EditorView.theme({
  "&": {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    color: "#ffffffe3",
    fontSize: "12px",
    borderRadius: "4px",
    cursor: "text",
  },
  ".cm-content": {
    caretColor: "#fff",
    fontFamily: "inherit",
    cursor: "text",
  },
  ".cm-cursor": { borderLeftColor: "#fff" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(74, 158, 255, 0.3)",
  },
  ".cm-gutters": { display: "none" },
  ".cm-scroller": {
    overflow: "auto",
    cursor: "text",
    userSelect: "text",
    WebkitUserSelect: "text",
  },
  ".cm-line": { cursor: "text" },
}, { dark: true });

// -- Highlight Style --
const highlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "#6a6a6a", fontStyle: "italic" },
  { tag: tags.keyword, color: "#F92672", fontWeight: "bold" },       // BREAK
  { tag: tags.string, color: "#e4d3ff" },                             // weighted
  { tag: tags.operator, color: "#F92672", fontWeight: "bold" },       // comma, pipe
  { tag: tags.meta, color: "#66D9EF" },                               // LoRA
  { tag: tags.className, color: "#AE81FF" },                          // embeddings
  { tag: tags.variableName, color: "#E6DB74" },                       // wildcards
  { tag: tags.atom, color: "#A6E22E" },                               // emphasis ()
  { tag: tags.tagName, color: "#FD971F" },                             // de-emphasis []
  { tag: tags.number, color: "#FD971F" },                              // numbers
  { tag: tags.punctuation, color: "#888888" },                         // colon in weights
  { tag: tags.deleted, color: "#e74c3c" },                             // negative region
  { tag: tags.moduleKeyword, color: "#BB86FC", fontWeight: "bold" },  // <SCRIPT>
  { tag: tags.typeName, color: "#D4BBFF" },                            // script content
  { tag: tags.regexp, color: "#8274d9", fontWeight: "bold" },         // ::Label::
]);

// -- Prompt Linter --
const promptLinter = linter((view) => {
  const diagnostics = [];
  const doc = view.state.doc.toString();

  // invalid weight format (multiple decimals)
  for (const match of doc.matchAll(/:\d*\.\.+\d*|\:\d+\.\d+\.\d*/g)) {
    diagnostics.push({
      from: match.index, to: match.index + match[0].length,
      severity: "error", message: "Invalid weight format - multiple decimal points",
    });
  }

  // missing weight value
  for (const match of doc.matchAll(/\([^():]+:\s*\)/g)) {
    diagnostics.push({
      from: match.index, to: match.index + match[0].length,
      severity: "error", message: "Missing weight value after colon",
    });
  }

  // unmatched parentheses
  let parenDepth = 0;
  let lastOpen = -1;
  for (let i = 0; i < doc.length; i++) {
    if (doc[i] === "(") {
      if (parenDepth === 0) lastOpen = i;
      parenDepth++;
    } else if (doc[i] === ")") {
      parenDepth--;
      if (parenDepth < 0) {
        diagnostics.push({
          from: i, to: i + 1,
          severity: "error", message: "Unmatched closing parenthesis",
        });
        parenDepth = 0;
      }
    }
  }
  if (parenDepth > 0 && lastOpen >= 0) {
    diagnostics.push({
      from: lastOpen, to: lastOpen + 1,
      severity: "error", message: "Unclosed parenthesis",
    });
  }

  // extreme weights
  for (const match of doc.matchAll(/\([^():]+:(-?\d+\.?\d*)\)/g)) {
    const weight = parseFloat(match[1]);
    if (weight > 5 || weight < -5) {
      const colonIdx = match[0].lastIndexOf(":");
      const numStart = match.index + colonIdx + 1;
      const numEnd = match.index + match[0].length - 1;
      diagnostics.push({
        from: numStart, to: numEnd,
        severity: "warning", message: `Unusual weight value (${weight}) - typically between -2 and 2`,
      });
    }
  }

  // missing parentheses around weight
  for (const match of doc.matchAll(/(?<!\()(\b\w+):(\d+\.?\d*)(?!\))/g)) {
    const before = doc.slice(0, match.index);
    const openCount = (before.match(/\(/g) || []).length;
    const closeCount = (before.match(/\)/g) || []).length;
    if (openCount === closeCount) {
      diagnostics.push({
        from: match.index, to: match.index + match[0].length,
        severity: "warning", message: "Missing parentheses - use (word:1.5) instead of word:1.5",
      });
    }
  }

  // regional block ($name { ... }) syntax. Grammar (region-highlight.js):
  // $ + a letter-led word name + optional space + a plain `{`, closed by the
  // next `}`. Catch the breakages that make a block silently fail to bind.

  // space after the $ — "$ mannequin {" is not recognized as a region.
  for (const match of doc.matchAll(/\$\s+[A-Za-z][\w-]*\s*\{/g)) {
    diagnostics.push({
      from: match.index, to: match.index + match[0].length,
      severity: "error", message: "No space after $ in a regional block — write $name {",
    });
  }

  // decorative / full-width opening brace instead of a plain `{`.
  for (const match of doc.matchAll(/\$\s*[A-Za-z][\w-]*\s*([｛﹛❴⦃])/g)) {
    diagnostics.push({
      from: match.index, to: match.index + match[0].length,
      severity: "error", message: "Use a plain { to open a regional block (not a decorative brace)",
    });
  }

  // unclosed block — a valid opener with no `}` after it (a full-width `}`
  // closer trips this too, which is the intended nudge).
  for (const match of doc.matchAll(/\$[A-Za-z]\w*\s*\{/g)) {
    const openBrace = match.index + match[0].length - 1;
    if (doc.indexOf("}", openBrace + 1) === -1) {
      diagnostics.push({
        from: match.index, to: openBrace + 1,
        severity: "error", message: "Unclosed regional block — add a closing }",
      });
    }
  }

  // wildcard validation: check __name__ references against API
  for (const match of doc.matchAll(/__([a-zA-Z0-9_/.-]+)__/g)) {
    const name = match[1];
    const cached = getWildcardSync(name);
    if (cached === null) {
      fetchWildcard(name, view);
    } else if (!cached.exists) {
      const msg = cached.error === "parse_error"
        ? `Wildcard "${name}" found but failed to parse (check ${cached.format || "file"} syntax)`
        : `Wildcard "${name}" not found in ${cached.folder}`;
      diagnostics.push({
        from: match.index, to: match.index + match[0].length,
        severity: "error", message: msg,
      });
    }
  }

  return diagnostics;
}, { delay: 750 });

// -- Lint Styles --
const lintStyles = EditorView.baseTheme({
  ".cm-diagnostic": {
    padding: "3px 6px 3px 8px", marginLeft: "-1px",
    display: "block", whiteSpace: "pre-wrap",
  },
  ".cm-diagnostic-error": { borderLeft: "5px solid #e74c3c" },
  ".cm-diagnostic-warning": { borderLeft: "5px solid #f0ad4e" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy #e74c3c", textDecorationSkipInk: "none",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy #f0ad4e", textDecorationSkipInk: "none",
  },
  ".cm-tooltip-lint": {
    backgroundColor: "#1e1e1e", border: "1px solid #444",
    borderRadius: "4px", padding: "0", zIndex: "100000",
  },
});

// -- Wildcard Cache & Linting --
const wildcardCache = new Map();
let wildcardCacheVersionValue = 0;

const wildcardRefreshEffect = StateEffect.define();
const wildcardCacheVersion = StateField.define({
  create() { return wildcardCacheVersionValue; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(wildcardRefreshEffect)) return wildcardCacheVersionValue;
    }
    return value;
  },
});

async function fetchWildcard(name, view) {
  if (wildcardCache.has(name)) return wildcardCache.get(name);
  try {
    const response = await fetch(`/promptchain/wildcard?name=${encodeURIComponent(name)}`);
    const data = await response.json();
    wildcardCache.set(name, data);
    wildcardCacheVersionValue++;
    if (view) view.dispatch({ effects: wildcardRefreshEffect.of(null) });
    return data;
  } catch (e) {
    const fallback = { exists: false, name, folder: "wildcards" };
    wildcardCache.set(name, fallback);
    return fallback;
  }
}

function getWildcardSync(name) {
  return wildcardCache.get(name) || null;
}

// -- Wildcard List Cache --
let wildcardListCache = null;
let wildcardListFetching = false;
let wildcardListFetchedAt = 0;
const LIST_REFRESH_INTERVAL = 5000; // throttle refreshes to 5s

fetchWildcardList();

async function fetchWildcardList() {
  if (wildcardListFetching) return wildcardListCache;
  // throttle: skip if fetched recently
  if (wildcardListCache && Date.now() - wildcardListFetchedAt < LIST_REFRESH_INTERVAL) {
    return wildcardListCache;
  }
  wildcardListFetching = true;
  try {
    const response = await fetch("/promptchain/wildcard/list");
    const data = await response.json();
    const newList = data.wildcards || [];
    wildcardListCache = newList;
    wildcardListFetchedAt = Date.now();
    // merge list data into wildcard cache (don't clear individually-fetched entries)
    for (const wc of newList) {
      wildcardCache.set(wc.name, {
        exists: wc.count > 0,
        name: wc.name,
        folder: "wildcards",
        count: wc.count,
        format: wc.format,
        sections: wc.sections || [],
        error: wc.count > 0 ? null : "parse_error",
      });
    }
    return wildcardListCache;
  } catch (e) {
    if (!wildcardListCache) wildcardListCache = [];
    return wildcardListCache;
  } finally {
    wildcardListFetching = false;
  }
}

// -- Shared helpers --

function isInsideWildcard(textBefore) {
  const dunderCount = textBefore.split("__").length - 1;
  return dunderCount > 0 && dunderCount % 2 !== 0;
}

function buildSectionOptions(wildcardName, sections, sectionPrefix) {
  return sections
    .filter(s => s.toLowerCase().startsWith(sectionPrefix))
    .map(s => ({
      label: s,
      apply: wildcardName + "/" + s + "__",
      type: "property",
      detail: "section",
    }));
}

function findMatchingFile(prefix) {
  if (!wildcardListCache) return null;
  let best = null;
  const lowerPrefix = prefix.toLowerCase();
  for (const wc of wildcardListCache) {
    const namePrefix = wc.name.toLowerCase() + "/";
    if (lowerPrefix.startsWith(namePrefix) && (!best || wc.name.length > best.name.length)) {
      best = wc;
    }
  }
  return best;
}

// -- Wildcard Autocomplete --
function wildcardCompletionSource(context) {
  const pos = context.pos;
  const line = context.state.doc.lineAt(pos);
  const textBefore = line.text.slice(0, pos - line.from);

  if (!isInsideWildcard(textBefore)) return null;

  const lastDunder = textBefore.lastIndexOf("__");
  const prefix = textBefore.slice(lastDunder + 2);
  const from = line.from + lastDunder + 2;

  // Section completion (prefix contains /)
  if (prefix.includes("/") && wildcardListCache) {
    const matched = findMatchingFile(prefix);
    if (matched && matched.sections && matched.sections.length > 0) {
      const sectionPrefix = prefix.slice(matched.name.length + 1).toLowerCase();
      return { from, filter: false, options: buildSectionOptions(matched.name, matched.sections, sectionPrefix) };
    }
    return null;
  }

  // File name completion
  const list = wildcardListCache;
  if (!list) {
    fetchWildcardList();
    return null;
  }
  fetchWildcardList(); // background refresh

  const lowerPrefix = prefix.toLowerCase();
  // show inline sections only when narrowed to one file, to avoid flooding the dropdown
  const matchCount = lowerPrefix
    ? list.filter(w => w.name.toLowerCase().startsWith(lowerPrefix)).length
    : list.length;

  const options = [];
  for (const wc of list) {
    const name = wc.name;
    if (wc.count === 0 && (!wc.sections || wc.sections.length === 0)) continue;
    if (lowerPrefix && !name.toLowerCase().startsWith(lowerPrefix)) continue;
    const hasSections = wc.sections && wc.sections.length > 0;

    if (hasSections) {
      options.push({
        label: name + "/",
        apply: (view, _completion, from, to) => {
          const insert = name + "/";
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + insert.length },
          });
          setTimeout(() => startCompletion(view), 50);
        },
        type: "variable",
        detail: `${wc.format} · ${wc.sections.length} sections`,
      });
    } else {
      options.push({
        label: name,
        apply: name + "__",
        type: "variable",
        detail: `${wc.format} · ${wc.count} options`,
      });
    }

    // show subsections only when narrowed to a single file
    if (lowerPrefix && hasSections && matchCount === 1) {
      for (const section of wc.sections) {
        const fullName = name + "/" + section;
        if (!fullName.toLowerCase().startsWith(lowerPrefix)) continue;
        options.push({
          label: fullName,
          apply: fullName + "__",
          type: "property",
          detail: "section",
        });
      }
    }
  }

  options.sort((a, b) => a.label.localeCompare(b.label));
  return { from, filter: false, options };
}

const wildcardAutocomplete = autocompletion({
  override: [wildcardCompletionSource],
  activateOnTyping: true,
  maxRenderedOptions: 25,
  icons: false,
});

// Compartment allows reconfiguring the autocomplete after editor creation
// to add additional sources (e.g. tag DB) alongside wildcards.
const autocompleteCompartment = new Compartment();

function reconfigureAutocomplete(view, sources) {
  view.dispatch({
    effects: autocompleteCompartment.reconfigure(
      autocompletion({
        override: sources,
        activateOnTyping: true,
        maxRenderedOptions: 25,
        icons: false,
      })
    ),
  });
}

// Re-trigger autocomplete on backspace when inside a __wildcard__ context
const autocompleteOnDelete = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  if (update.changes.newLength >= update.changes.length) return;
  const pos = update.state.selection.main.head;
  const line = update.state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  if (isInsideWildcard(before)) {
    setTimeout(() => startCompletion(update.view), 50);
  }
});

// -- Autocomplete Theme --
const autocompleteTheme = EditorView.baseTheme({
  ".cm-tooltip-autocomplete": {
    backgroundColor: "#1e1e1e !important",
    border: "1px solid #444 !important",
    borderRadius: "4px !important",
    boxShadow: "0 4px 12px rgba(0,0,0,0.5) !important",
    zIndex: "100000 !important",
    maxHeight: "300px !important",
    overflow: "hidden !important",
    pointerEvents: "auto !important",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: "system-ui, sans-serif !important",
    fontSize: "12px !important",
    maxHeight: "300px !important",
    overflowY: "auto !important",
    pointerEvents: "auto !important",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding: "4px 8px !important",
    borderBottom: "1px solid #333 !important",
    pointerEvents: "auto !important",
    cursor: "pointer !important",
  },
  ".cm-tooltip-autocomplete > ul > li:last-child": {
    borderBottom: "none !important",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "#2d4f7c !important",
    color: "#fff !important",
  },
  ".cm-completionLabel": {
    color: "#e0e0e0 !important",
  },
  ".cm-completionDetail": {
    color: "#888 !important",
    marginLeft: "8px !important",
    fontSize: "11px !important",
  },
});

// -- Keybindings --
const INDENT = "  ";

function indentLines(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (sel.from === sel.to) {
    view.dispatch(state.replaceSelection(INDENT));
  } else {
    const from = state.doc.lineAt(sel.from).from;
    const to = state.doc.lineAt(sel.to).to;
    let changes = [];
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      changes.push({ from: line.from, insert: INDENT });
      pos = line.to + 1;
    }
    view.dispatch({ changes });
  }
  return true;
}

function dedentLines(view) {
  const { state } = view;
  const sel = state.selection.main;
  const from = state.doc.lineAt(sel.from).from;
  const to = state.doc.lineAt(sel.to).to;
  let changes = [];
  for (let pos = from; pos <= to; ) {
    const line = state.doc.lineAt(pos);
    let removeCount = 0;
    for (let i = 0; i < INDENT.length && i < line.text.length; i++) {
      if (line.text[i] === " ") removeCount++;
      else break;
    }
    if (removeCount > 0) {
      changes.push({ from: line.from, to: line.from + removeCount, insert: "" });
    }
    pos = line.to + 1;
  }
  if (changes.length > 0) view.dispatch({ changes });
  return true;
}

function formatPromptText(text) {
  // Label-aware formatting: ::Label:: lines are kept flush-left and the
  // content below each label is indented one INDENT level. Sections are
  // separated by blank lines. `//` line-comments directly above a label
  // (no blank line between) are treated as that label's preamble and
  // stay flush-left with it. If the text has no labels this falls
  // through to the single-block branch below.
  const lines = text.split("\n");
  // Match ::Label:: at line start (allowing leading whitespace) with any
  // inline body after it on the same line. The inline body is prepended
  // to the label's body lines so `::Label::inline` formats the same as
  // `::Label::\ninline`.
  const labelRE = /^\s*(::[^:]+::)(.*)$/;
  const commentRE = /^\s*\/\//;

  const labelMatches = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelRE);
    if (m) labelMatches.push({ idx: i, label: m[1], inline: m[2] });
  }
  if (labelMatches.length === 0) return formatPromptBlock(text);

  // For each label, walk upward over contiguous comment lines with no
  // blank line between — those attach as the label's preamble.
  const sectionStarts = labelMatches.map(({ idx }) => {
    let start = idx;
    while (start > 0 && commentRE.test(lines[start - 1])) start--;
    return start;
  });

  const sections = [];
  if (sectionStarts[0] > 0) {
    sections.push({ kind: "prelude", lines: lines.slice(0, sectionStarts[0]) });
  }
  for (let s = 0; s < labelMatches.length; s++) {
    const { idx: labelIdx, label, inline } = labelMatches[s];
    const preamble = lines.slice(sectionStarts[s], labelIdx);
    const bodyEnd = s + 1 < labelMatches.length ? sectionStarts[s + 1] : lines.length;
    const body = lines.slice(labelIdx + 1, bodyEnd);
    if (inline.trim()) body.unshift(inline);
    sections.push({ kind: "label", preamble, label, body });
  }

  return sections.map(sec => {
    if (sec.kind === "prelude") {
      return sec.lines.join("\n").replace(/^\s+|\s+$/g, "");
    }
    const parts = [];
    if (sec.preamble.length) parts.push(sec.preamble.map(l => l.trim()).join("\n"));
    parts.push(sec.label);
    const rawBody = sec.body.join("\n").trim();
    if (rawBody) {
      const formatted = formatPromptBlock(rawBody);
      const indented = formatted
        .split("\n")
        .map(l => (l === "" ? "" : INDENT + l))
        .join("\n");
      parts.push(indented);
    }
    return parts.join("\n");
  }).filter(s => s).join("\n\n");
}

function formatPromptBlock(text) {
  if (!text.includes("{")) {
    return text.split("\n").map((line) => line.trimStart()).join("\n").trim();
  }
  text = text.replace(/[^\S\n]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n");
  text = text.replace(/\s+/g, " ").trim();
  // Returns true if string contains nested braces like {a|{b|c}}
  const hasNestedBrackets = (str) => {
    let depth = 0;
    for (const char of str) {
      if (char === "{") { depth++; if (depth > 0) return true; }
      else if (char === "}") depth--;
    }
    return false;
  };
  const splitByPipes = (str) => {
    let depth = 0, options = [], start = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "{") depth++;
      else if (str[i] === "}") depth--;
      else if (str[i] === "|" && depth === 0) {
        options.push(str.slice(start, i).trim());
        start = i + 1;
      }
    }
    options.push(str.slice(start).trim());
    return options;
  };
  const formatWithDepth = (str, depth) => {
    let result = "", i = 0;
    while (i < str.length) {
      if (str[i] === "{") {
        let braceDepth = 1, j = i + 1;
        while (j < str.length && braceDepth > 0) {
          if (str[j] === "{") braceDepth++;
          else if (str[j] === "}") braceDepth--;
          j++;
        }
        const content = str.slice(i + 1, j - 1);
        const options = splitByPipes(content);
        const nested = hasNestedBrackets(content);
        if (nested || options.length > 3) {
          result += "{\n";
          for (let k = 0; k < options.length; k++) {
            const prefix = k === 0 ? "" : "| ";
            result += INDENT.repeat(depth + 1) + prefix + formatWithDepth(options[k].trim(), depth + 1) + "\n";
          }
          result += INDENT.repeat(depth) + "}";
        } else {
          result += "{" + content + "}";
        }
        i = j;
      } else {
        result += str[i];
        i++;
      }
    }
    return result;
  };
  return formatWithDepth(text, 0);
}

// Regional blocks ($name { ... }) format to the house style: the `$name {`
// opener and `}` closer each on their own line, the body indented one INDENT
// level. Blocks are pulled out first so the wildcard-brace formatter never
// touches a region's `{`; the text around them formats as a normal prompt.
function formatRegionInner(inner) {
  const lines = inner.split("\n").map((l) => l.trim().replace(/[ \t]{2,}/g, " "));
  const out = [];
  for (const l of lines) {
    if (l === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.map((l) => (l === "" ? "" : INDENT + l)).join("\n");
}

function formatWithRegions(text) {
  const OPEN = /\$\w+\s*\{/g;  // \w+ to match the compiler/binding rule (digit-leading names too)
  let result = "";
  let last = 0;
  let m;
  while ((m = OPEN.exec(text)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    // Find the region's close by brace DEPTH, not the first `}` — otherwise a
    // wildcard brace ({a|b}) inside the body ends the region early, spilling the
    // rest into the wildcard formatter and splitting a phrase across lines (which
    // the newline→comma rule then turns into an unwanted comma).
    let depth = 1, j = openBrace + 1;
    while (j < text.length && depth > 0) {
      const ch = text[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      j++;
    }
    if (depth !== 0) continue; // unterminated — leave it for the linter to flag
    const close = j - 1;
    const name = m[0].match(/^\$\w+/)[0];
    const before = text.slice(last, m.index);
    if (before.trim()) result += formatPromptText(before).trim() + "\n\n";
    const inner = text.slice(openBrace + 1, close);
    result += `${name} {\n${formatRegionInner(inner)}\n}\n\n`;
    last = close + 1;
    OPEN.lastIndex = close + 1;
  }
  const tail = text.slice(last);
  if (tail.trim()) result += formatPromptText(tail).trim();
  return result.trim();
}

function formatPrompt(view) {
  const text = view.state.doc.toString();
  const formatted = formatWithRegions(text);
  if (formatted !== text) {
    view.dispatch({ changes: { from: 0, to: text.length, insert: formatted } });
  }
  return true;
}

// -- Indent-aware word wrap --
// Wrapped continuations align to the line's leading whitespace.
const indentWrap = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view);
  }
  build(view) {
    const decos = [];
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
        const match = line.text.match(/^(\s+)/);
        if (match) {
          const indent = match[1].length;
          decos.push(Decoration.line({
            attributes: { style: `padding-left: ${indent}ch; text-indent: -${indent}ch;` }
          }).range(line.from));
        }
        pos = line.to + 1;
      }
    }
    return Decoration.set(decos);
  }
}, { decorations: v => v.decorations });

// -- Minimal Setup --
const minimalSetup = [
  EditorView.lineWrapping,
  indentWrap,
  EditorView.contentAttributes.of({ draggable: "false" }),
  bracketMatching(),
  history(),
  wildcardCacheVersion,
  promptLinter,
  lintStyles,
  autocompleteCompartment.of(wildcardAutocomplete),
  autocompleteOnDelete,
  autocompleteTheme,
  tooltips({
    position: "fixed",
  }),
  keymap.of([
    // Custom bindings come BEFORE defaultKeymap because CM6 takes the first
    // matching keymap entry. defaultKeymap binds Mod-Enter (insertBlankLine)
    // and Tab (insertTab), which would otherwise win over our queue and
    // accept-completion bindings.
    // Tab accepts the active completion if one is open (matches editor
    // conventions like VS Code), otherwise indents.
    { key: "Tab", run: (view) => completionStatus(view.state) === "active" ? acceptCompletion(view) : indentLines(view) },
    { key: "Shift-Tab", run: dedentLines },
    { key: "Mod-]", run: indentLines },
    { key: "Mod-[", run: dedentLines },
    { key: "Shift-Alt-f", run: formatPrompt },
    // Ctrl/Cmd+S: route to ComfyUI's save command instead of letting the
    // browser's "Save Page As" dialog through. ComfyUI's keybindingService
    // bails on contenteditable targets, so we own the binding here.
    {
      key: "Mod-s",
      preventDefault: true,
      run: () => {
        window.app?.extensionManager?.command?.execute?.("Comfy.SaveWorkflow");
        return true;
      },
    },
    // Ctrl/Cmd+Shift+Enter: queue at front. Listed before Mod-Enter so the
    // more specific binding wins.
    {
      key: "Mod-Shift-Enter",
      preventDefault: true,
      run: () => {
        window.app?.extensionManager?.command?.execute?.("Comfy.QueuePromptFront");
        return true;
      },
    },
    // Ctrl/Cmd+Enter: queue the workflow from inside the editor. Same
    // contenteditable-bypass reason as Mod-s above.
    {
      key: "Mod-Enter",
      preventDefault: true,
      run: () => {
        window.app?.extensionManager?.command?.execute?.("Comfy.QueuePrompt");
        return true;
      },
    },
    // Ctrl/Cmd+Alt+Enter: interrupt the current generation.
    {
      key: "Mod-Alt-Enter",
      preventDefault: true,
      run: () => {
        window.app?.extensionManager?.command?.execute?.("Comfy.Interrupt");
        return true;
      },
    },
    ...defaultKeymap,
    ...historyKeymap,
  ]),
];

// -- Exports --
export {
  // core
  EditorView,
  EditorState,
  minimalSetup,
  // language/syntax
  promptLanguage,
  promptTheme,
  highlightStyle,
  syntaxHighlighting,
  // linting
  promptLinter,
  lintStyles,
  diagnosticCount,
  forceLinting,
  // autocomplete
  autocompletion,
  wildcardCompletionSource,
  reconfigureAutocomplete,
  startCompletion,
  pickedCompletion,
  // wildcard system
  wildcardCacheVersion,
  wildcardRefreshEffect,
  wildcardAutocomplete,
  fetchWildcard,
  getWildcardSync,
  fetchWildcardList,
  // state/view primitives (for extensions)
  Decoration,
  ViewPlugin,
  StateField,
  StateEffect,
  WidgetType,
  Compartment,
  // utilities
  formatPromptText,
};
