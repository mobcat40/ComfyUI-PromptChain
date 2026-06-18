// Editor — CodeMirror 6 loader, editor factory, and keybindings.

import { api } from "../../../scripts/api.js";
import { adjustWeight } from "./weight-adjust.js";
import { CONFIG } from "./config.js";
import { getLabelIndexAtLine } from "./active-label-highlight.js";
import { showContextMenu, setupKeywordTooltip } from "./editor-context-menu.js";
import { chipRecognizerExtension } from "./chip-recognizer.js";
import { regionHighlightExtension } from "./region-highlight.js";

let cmLoadPromise = null;

// Lazy-loads the CodeMirror bundle via script tag. Returns the CM module.
export async function loadCodeMirror() {
  if (cmLoadPromise) return cmLoadPromise;
  cmLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("../codemirror.bundle.js", import.meta.url).href;
    script.onload = () => resolve(window.PromptChainCM);
    script.onerror = () => reject(new Error("Failed to load CodeMirror"));
    document.head.appendChild(script);
  });
  return cmLoadPromise;
}

function toggleLineComment(view) {
  const doc = view.state.doc;
  const selection = view.state.selection.main;
  const startLine = doc.lineAt(selection.from);
  const endLine = doc.lineAt(selection.to);

  let allCommented = true;
  for (let i = startLine.number; i <= endLine.number; i++) {
    const trimmed = doc.line(i).text.trimStart();
    if (trimmed.length > 0 && !trimmed.startsWith("//")) {
      allCommented = false;
      break;
    }
  }

  const changes = [];
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = doc.line(i);
    if (allCommented) {
      const commentIndex = line.text.indexOf("//");
      if (commentIndex !== -1) {
        const removeLength = line.text[commentIndex + 2] === " " ? 3 : 2;
        changes.push({ from: line.from + commentIndex, to: line.from + commentIndex + removeLength, insert: "" });
      }
    } else if (line.text.trim().length > 0) {
      changes.push({ from: line.from, to: line.from, insert: "// " });
    }
  }
  if (changes.length > 0) view.dispatch({ changes });
}

// Append a doc-change listener to an ALREADY-CREATED editor. CodeMirror's
// updateListener is fixed at construction (createEditor wires the node's own
// onChange there), so a later observer — e.g. the 3D Poser watching a bound
// prompt for `$name{}` block renames — is added dynamically via appendConfig.
// Returns a disposer that quiesces the callback (CM keeps the extension, but the
// guard makes it a no-op after teardown).
export function attachDocChangeListener(view, onDocChange) {
  const CM = window.PromptChainCM;
  if (!CM || !view) return () => {};
  let active = true;
  view.dispatch({
    effects: CM.StateEffect.appendConfig.of(
      CM.EditorView.updateListener.of((update) => {
        if (active && update.docChanged) onDocChange(update.state.doc.toString());
      })
    ),
  });
  return () => { active = false; };
}

// Creates a CodeMirror 6 editor inside the container.
// onChange(text) fires on every document edit.
// onUpdate(viewUpdate) fires on every CM6 update (selection, focus, etc).
export function createEditor(container, initialValue, onChange, onUpdate, extraExtensions, onDblClickLabel, onDblClickWildcard) {
  const CM = window.PromptChainCM;
  if (!CM) return null;

  const extensions = [
    CM.minimalSetup,
    ...(extraExtensions || []),
    CM.promptLanguage,
    CM.promptTheme,
    CM.syntaxHighlighting(CM.highlightStyle),
    ...chipRecognizerExtension(CM),
    ...regionHighlightExtension(CM),
    CM.EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange?.(update.state.doc.toString());
      }
      onUpdate?.(update);
    }),
    CM.EditorView.domEventHandlers({
          contextmenu: (event, view) => {
            if (event.ctrlKey) return false; // Ctrl+Right-Click = browser default
            event.preventDefault();
            event.stopPropagation();
            showContextMenu(event.clientX, event.clientY, view, container._pcrNode);
            return true;
          },
          keydown: (event, view) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "/") {
              event.preventDefault();
              toggleLineComment(view);
              return true;
            }
            // Ctrl+Up/Down — weight adjustment
            if (event.ctrlKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
              event.preventDefault();
              const direction = event.key === "ArrowUp" ? 1 : -1;
              adjustWeight(view, direction);
              return true;
            }
            // Ctrl+0 — reset font size
            if ((event.ctrlKey || event.metaKey) && event.key === "0") {
              event.preventDefault();
              container._pcrUpdateFontSize?.(CONFIG.defaultFontSize);
              return true;
            }
            // Ctrl+Plus/Minus — font size
            if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) {
              event.preventDefault();
              container._pcrUpdateFontSize?.((container._pcrFontSize || CONFIG.defaultFontSize) + 1);
              return true;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "-") {
              event.preventDefault();
              container._pcrUpdateFontSize?.((container._pcrFontSize || CONFIG.defaultFontSize) - 1);
              return true;
            }
            // Ctrl+Shift+L — split commas onto new lines. Operates on the
            // active selection when present; otherwise the current line.
            // "a, b, c" → "a,\nb,\nc".
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "l") {
              event.preventDefault();
              event.stopPropagation();
              const sel = view.state.selection.main;
              let from, to;
              if (sel.from !== sel.to) {
                from = sel.from;
                to = sel.to;
              } else {
                const line = view.state.doc.lineAt(sel.head);
                from = line.from;
                to = line.to;
              }
              const text = view.state.sliceDoc(from, to);
              const split = text.replace(/,\s*/g, ",\n");
              if (split !== text) {
                view.dispatch({
                  changes: { from, to, insert: split },
                  selection: { anchor: from + split.length },
                });
              }
              return true;
            }
            // Ctrl+` — toggle output panel
            if ((event.ctrlKey || event.metaKey) && event.key === "`") {
              event.preventDefault();
              event.stopPropagation();
              const nodes = window.app?.graph?._nodes || [];
              for (const n of nodes) {
                if (n._pcrEditor === view) {
                  n._pcrOutputPanel?.openPrompt?.();
                  if (n._pcrShared) n._pcrShared.outputPanelOpen = !!n._pcrOutputPanel?.getIsOpen?.();
                  break;
                }
              }
              return true;
            }
            return false;
          },
          keyup: (event) => { event.stopPropagation(); },
          dblclick: (event, view) => {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;

            // check if double-click is on a __wildcard__ token
            if (onDblClickWildcard) {
              const line = view.state.doc.lineAt(pos);
              const wcRegex = /__([a-zA-Z0-9_/.-]+)__/g;
              let m;
              while ((m = wcRegex.exec(line.text)) !== null) {
                const from = line.from + m.index;
                const to = from + m[0].length;
                if (pos >= from && pos <= to) {
                  onDblClickWildcard(m[1]);
                  return true;
                }
              }
            }

            if (!onDblClickLabel) return false;
            const labelIndex = getLabelIndexAtLine(view.state.doc, view.state.doc.lineAt(pos).number - 1);
            if (labelIndex < 1) return false;
            const handled = onDblClickLabel(labelIndex);
            if (handled) {
              requestAnimationFrame(() => {
                const sel = view.state.selection.main;
                if (sel.from !== sel.to) {
                  view.dispatch({ selection: { anchor: sel.to } });
                }
              });
            }
            return handled;
          },
        }),
  ];

  const view = new CM.EditorView({
    state: CM.EditorState.create({ doc: initialValue || "", extensions }),
    parent: container,
  });
  view._pcrExtensions = extensions;
  // Make ChangeTracker treat our contenteditable as a textarea so Ctrl+Z stays
  // local to CodeMirror instead of triggering a graph-level undo (which would
  // destroy and rebuild every PromptChain node). See docs/bugs/ctrl-z-undo-desync.md.
  view.contentDOM.type = "textarea";
  // CM's domEventHandlers ride the content DOM — a right-click in the empty
  // scroller area below a SHORT document never reaches them (bit the inpaint
  // modal's empty prompt box). Content-area right-clicks stopPropagation in
  // the handler above, so this only catches the dead zone.
  container.addEventListener("contextmenu", (event) => {
    if (event.ctrlKey) return; // Ctrl+Right-Click = browser default
    event.preventDefault();
    event.stopPropagation();
    showContextMenu(event.clientX, event.clientY, view, container._pcrNode);
  });
  setupKeywordTooltip(view, () => container._pcrNode);
  installPromptFileDropMerge(container, view);
  return view;
}

// Drag a ComfyUI-generated image onto the editor to merge its embedded
// positive/negative prompts with the current doc. Positives and negatives
// are each comma-joined across existing and dropped content.
function installPromptFileDropMerge(container, view) {
  const isFileDrag = (e) => e.dataTransfer?.types?.includes("Files");

  // dragenter/dragleave fire on every descendant crossing, so we ref-count
  // the active state rather than toggling on each event.
  let dragDepth = 0;
  const markActive = () => container.classList.add("pcr-editor-drop-active");
  const clearActive = () => { dragDepth = 0; container.classList.remove("pcr-editor-drop-active"); };

  container.addEventListener("dragenter", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth++;
    if (dragDepth === 1) markActive();
  }, true);

  container.addEventListener("dragleave", (e) => {
    if (!isFileDrag(e)) return;
    dragDepth--;
    if (dragDepth <= 0) clearActive();
  }, true);

  // Capture phase — CodeMirror registers its own file-drop handler on
  // contentDOM that would otherwise insert the file path as text.
  container.addEventListener("dragover", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, true);

  container.addEventListener("drop", async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    clearActive();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      toastPromptDrop("warn", "drop one file at a time");
      return;
    }
    await mergeDroppedPromptFile(files[0], view);
  }, true);
}

async function mergeDroppedPromptFile(file, view) {
  let extracted;
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const resp = await api.fetchApi("/promptchain/extract-prompts-upload", { method: "POST", body: formData });
    if (!resp.ok) {
      toastPromptDrop("error", "failed to read prompt metadata");
      return;
    }
    extracted = await resp.json();
  } catch (err) {
    console.error("[PromptChain drop] error:", err);
    toastPromptDrop("error", "failed to read prompt metadata");
    return;
  }
  const newPositive = extracted?.positive || "";
  const newNegative = extracted?.negative || "";
  if (!newPositive && !newNegative) {
    toastPromptDrop("warn", "no prompt metadata found in file");
    return;
  }
  const { doc, added } = mergePromptSections(view.state.doc.toString(), newPositive, newNegative);
  setEditorContent(view, doc);
  if (added === 0) {
    toastPromptDrop("info", "no new words to add");
  } else {
    toastPromptDrop("success", `added ${added} new word${added === 1 ? "" : "s"}`);
  }
}

function mergePromptSections(existing, newPositive, newNegative) {
  const match = existing.match(/Negative Prompt:/i);
  let oldPositive, oldNegative;
  if (match) {
    oldPositive = existing.slice(0, match.index);
    oldNegative = existing.slice(match.index + match[0].length);
  } else {
    oldPositive = existing;
    oldNegative = "";
  }
  const pos = mergeUniqueTokens(oldPositive, newPositive);
  const neg = mergeUniqueTokens(oldNegative, newNegative);
  const doc = neg.text
    ? `${pos.text}\n\nNegative Prompt: ${neg.text}`
    : pos.text;
  return { doc, added: pos.added + neg.added };
}

// Comma/newline tokenized union. Case-insensitive dedup, preserves the
// casing of whichever occurrence was seen first. Returns word count of
// the novel tokens added (matches Footer.svelte's status-bar counter).
function mergeUniqueTokens(existing, incoming) {
  const seen = new Set();
  const result = [];
  for (const raw of (existing || "").split(/[,\n]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  let added = 0;
  for (const raw of (incoming || "").split(/[,\n]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
    added += token.split(/\s+/).filter(Boolean).length;
  }
  return { text: result.join(", "), added };
}

function toastPromptDrop(severity, summary) {
  window.app?.extensionManager?.toast?.add?.({ severity, summary, life: 3000 });
}

// Replaces all content in a CodeMirror view.
export function setEditorContent(view, text) {
  if (!view) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text || "" },
  });
}

// Replaces content and resets undo history (for switching between documents).
export function resetEditorContent(view, text) {
  if (!view) return;
  const CM = window.PromptChainCM;
  if (!CM || !view._pcrExtensions) {
    setEditorContent(view, text);
    return;
  }
  view.setState(CM.EditorState.create({
    doc: text || "",
    extensions: view._pcrExtensions,
  }));
}
