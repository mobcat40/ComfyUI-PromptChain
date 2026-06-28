// Right-click a LoadImage node -> "Open in PromptChain editor": opens the
// node's currently-loaded input image in the PromptChain editor. A saved edit
// becomes a lineage child (parent = the loaded image) and re-points THIS node
// to the edited result — a NEW input file, not an overwrite of the source.
//
// A SEPARATE extension (own registerExtension) so a JS error here can never
// take down the prompt editor / poser / region box. The menu item rides
// getExtraMenuOptions, which fires in both the legacy and Vue node renderers —
// the only trigger that works uniformly (a bare click on the on-node image is
// not interceptable in Vue mode), mirroring core's "Open in MaskEditor".

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { openViewer } from "./lib/viewer-bridge.js";

const TARGET_NODES = new Set(["LoadImage"]);

// The loaded file's identity. node.imgs[i].src is the authoritative
// /view?filename=&subfolder=&type= URL; the 'image' widget value is the
// fallback (it can carry a trailing " [input]" annotation, which we strip).
function readLoadedImage(node) {
  const src = node.imgs?.[node.imageIndex ?? 0]?.src;
  if (src) {
    try {
      const u = new URL(src, window.location.origin);
      const filename = u.searchParams.get("filename") || "";
      if (filename) {
        return {
          filename,
          subfolder: u.searchParams.get("subfolder") || "",
          type: u.searchParams.get("type") || "input",
        };
      }
    } catch {}
  }
  const widget = node.widgets?.find((w) => w.name === "image");
  const raw = typeof widget?.value === "string" ? widget.value : "";
  const val = raw.replace(/\s*\[(input|output|temp)\]\s*$/, "");
  if (!val) return null;
  const parts = val.split("/");
  const filename = parts.pop();
  return { filename, subfolder: parts.join("/"), type: "input" };
}

function findImageWidget(node) {
  return node.widgets?.find(
    (w) => w.options?.image_upload === true || (w.type === "combo" && w.name === "image")
  ) || null;
}

// The edit is saved to the OUTPUT tree, but LoadImage reads the INPUT root.
// image-workflow?hash= stages a content-addressed promptchain_source_<hash>
// copy into input/ and hands back input_ref — the same primitive prepareEdit
// uses for the source — which is then a valid LoadImage combo value.
async function attachEditedToNode(node, entry) {
  if (!entry?.hash) return;
  let inputRef = "";
  try {
    const res = await api.fetchApi(`/promptchain/image-workflow?hash=${encodeURIComponent(entry.hash)}`);
    if (res.ok) inputRef = (await res.json())?.input_ref || "";
  } catch (e) {
    console.error("[PromptChain] LoadImage attach-back staging failed", e);
  }
  if (!inputRef) return;

  const widget = findImageWidget(node);
  if (!widget) return;
  // The full re-point: add the option, set the value, fire the combo callback
  // (Comfy's installed refresh: node.imgs=undefined -> reload -> setDirtyCanvas).
  // Setting .value alone does NOT reload the preview.
  if (widget.options?.values && !widget.options.values.includes(inputRef)) {
    widget.options.values.push(inputRef);
  }
  widget.value = inputRef;
  widget.callback?.(inputRef);
  node.setDirtyCanvas(true, true);
}

async function openLoadImageInEditor(node) {
  const img = readLoadedImage(node);
  if (!img?.filename) {
    app.extensionManager?.toast?.add?.({
      severity: "warn",
      summary: "PromptChain",
      detail: "This node has no loaded image to edit.",
      life: 5000,
    });
    return;
  }
  // A browse-style entry (no DB hash) — identical shape to the sidebar's, so
  // prepareEdit resolves the input file as the lineage parent.
  const scope = img.type === "output" ? "output" : "input";
  const path = img.subfolder ? `${img.subfolder}/${img.filename}` : img.filename;
  const entry = {
    hash: path,
    filename: img.filename,
    subfolder: "",
    _directUrl: api.apiURL(`/promptchain/browse/preview?scope=${scope}&path=${encodeURIComponent(path)}`),
    _browseScope: scope,
    _browsePath: path,
  };
  openViewer([entry], 0, "", null, {
    autoEdit: true,
    onAfterEditSave: (saved) => attachEditedToNode(node, saved),
  });
}

app.registerExtension({
  name: "PromptChain.LoadImageEditor",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!TARGET_NODES.has(nodeData?.name)) return;
    const original = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      const result = original?.apply(this, arguments);
      const node = this;
      options.push({
        content: "Open in PromptChain editor",
        callback: () => openLoadImageInEditor(node),
      });
      return result;
    };
  },
});
