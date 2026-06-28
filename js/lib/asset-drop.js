/**
 * Asset Drop Handler
 *
 * Intercepts drag-and-drop from the PromptChain sidebar to ComfyUI nodes.
 * When an asset (image/video) is dragged from the sidebar, we:
 * 1. Detect the drop target node
 * 2. Fetch the asset file from userdata
 * 3. Upload it via /upload/image
 * 4. Update the node's widget value
 */

import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";

// Debug flag - set to true for verbose logging
const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log("[PromptChain:AssetDrop]", ...args); };

// Track if we're currently dragging an asset
let currentAssetDrag = null;

/**
 * Handle dragover on the canvas/graph area.
 * Sets appropriate drop effect for asset drags.
 */
function handleDragOver(e) {
    // Check if this is a PromptChain asset drag
    if (!e.dataTransfer.types.includes("application/x-promptchain-asset")) {
        return;
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
}

/**
 * Handle drop on the canvas.
 * If dropping on a node that accepts images, upload and set the value.
 */
async function handleDrop(e) {
    // Check if this is a PromptChain asset drag
    if (!e.dataTransfer.types.includes("application/x-promptchain-asset")) {
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Parse the asset data
    let assetData;
    try {
        const dataStr = e.dataTransfer.getData("application/x-promptchain-asset");
        assetData = JSON.parse(dataStr);
    } catch (err) {
        console.error("[PromptChain] Failed to parse asset drag data:", err);
        return;
    }

    if (!assetData || assetData.type !== "asset" || !assetData.path) {
        console.warn("[PromptChain] Invalid asset drag data:", assetData);
        return;
    }

    // Find the node under the drop point
    const canvas = app.canvas;
    if (!canvas) {
        console.warn("[PromptChain] No canvas available");
        return;
    }

    // Convert screen coordinates to canvas coordinates
    const rect = canvas.canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / canvas.ds.scale - canvas.ds.offset[0];
    const canvasY = (e.clientY - rect.top) / canvas.ds.scale - canvas.ds.offset[1];

    const scope = assetData.scope || "output";

    // Smart switch: dropping an output image onto a STRICTLY EMPTY graph restores
    // its embedded ComfyUI workflow (the litegraph "workflow" PNG chunk) instead of
    // adding a Load Image node — mirroring ComfyUI's native PNG file-drop. Gated to
    // zero nodes because loadGraphData clean-wipes the canvas (same as the native
    // drop), so on a populated graph that would silently destroy the user's work.
    // The endpoint already exists (inpaint/upscale use it) and NaN-defuses the JSON.
    if (!app.graph?._nodes?.length && /\.(png|webp)$/i.test(assetData.path)) {
        try {
            const wfResp = await api.fetchApi(
                `/promptchain/image-workflow?scope=${scope}&path=${encodeURIComponent(assetData.path)}`
            );
            if (wfResp.ok) {
                const { workflow } = await wfResp.json();
                if (workflow) {
                    await app.loadGraphData(workflow, true, true, assetData.name || assetData.path.split("/").pop());
                    app.extensionManager?.toast?.add?.({ severity: "success", summary: "Restored workflow from image", life: 2500 });
                    return;
                }
            }
        } catch (err) {
            // any failure (no workflow chunk, fetch error) falls through to Load Image
            log("workflow restore failed; falling back to Load Image", err);
        }
    }

    try {
        // fetch image via browse preview
        const fetchResponse = await api.fetchApi(
            `/promptchain/browse/preview?scope=${scope}&path=${encodeURIComponent(assetData.path)}`
        );
        if (!fetchResponse.ok) throw new Error(`Failed to fetch: ${fetchResponse.status}`);
        const blob = await fetchResponse.blob();

        // Upload into the input ROOT, not a subfolder. Stock LoadImage's INPUT_TYPES
        // only enumerates top-level input files, so a "subfolder/name" combo value is
        // never in its option list — the node loads flagged/errored even though the
        // backend's VALIDATE_INPUTS (exists_annotated_filepath) still finds the file
        // and the graph runs. A bare filename keeps the combo valid.
        const filename = assetData.path.split("/").pop();
        const file = new File([blob], filename, { type: blob.type });
        const formData = new FormData();
        formData.append("image", file);
        formData.append("type", "input");
        formData.append("overwrite", "true");
        const uploadResponse = await api.fetchApi("/upload/image", { method: "POST", body: formData });
        if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.status}`);
        const result = await uploadResponse.json();
        const uploadedPath = result.subfolder ? `${result.subfolder}/${result.name}` : result.name;

        // find target node, or create a new LoadImage
        let node = app.graph.getNodeOnPos(canvasX, canvasY);
        let imageWidget = node ? findImageWidget(node) : null;

        if (!imageWidget) {
            // no suitable target — create LoadImage at drop position
            const LG = window.LiteGraph || globalThis.LiteGraph;
            if (!LG || !app.graph) return;
            node = LG.createNode("LoadImage");
            if (!node) return;
            node.pos = [canvasX, canvasY];
            app.graph.add(node);
            imageWidget = findImageWidget(node);
        }

        if (imageWidget) {
            if (imageWidget.options?.values && !imageWidget.options.values.includes(uploadedPath)) {
                imageWidget.options.values.push(uploadedPath);
            }
            imageWidget.value = uploadedPath;
            imageWidget.callback?.(uploadedPath);
        }

        node.setDirtyCanvas(true, true);
        canvas.selectNode(node);
        app.graph.setDirtyCanvas(true, true);

        // notify sidebar that input folder changed (uploaded a file)
        window.dispatchEvent(new CustomEvent("promptchain:input-changed", {
          detail: { name: result.name, subfolder: result.subfolder || "" },
        }));

    } catch (err) {
        console.error("[PromptChain] Failed to drop asset:", err);
    }
}

/**
 * Find an image upload widget on a node.
 * Looks for combo widgets with image_upload flag.
 */
function findImageWidget(node) {
    if (!node.widgets) return null;

    for (const widget of node.widgets) {
        // Check for image_upload flag in widget options
        if (widget.options?.image_upload === true) {
            return widget;
        }

        // Also check if this is a COMBO widget named "image" (common pattern)
        if (widget.type === "combo" && widget.name === "image") {
            return widget;
        }

        // Check for LoadImage pattern - first combo widget
        if (node.type === "LoadImage" && widget.type === "combo") {
            return widget;
        }
    }

    return null;
}

/**
 * Install global drag-and-drop handlers for asset drops.
 * Call this once during extension setup.
 */
export function setupAssetDropHandler() {
    // We need to intercept at the document level to catch drops on the canvas
    // The canvas is inside several nested elements

    const waitForCanvas = () => {
        const canvasEl = document.querySelector("canvas.lgraphcanvas") ||
                         document.querySelector("#graph-canvas canvas") ||
                         app.canvas?.canvas;

        if (!canvasEl) {
            requestAnimationFrame(waitForCanvas);
            return;
        }

        // Add listeners to the canvas element
        canvasEl.addEventListener("dragover", handleDragOver, true);
        canvasEl.addEventListener("drop", handleDrop, true);

        // Also add to parent containers to ensure we catch the event
        let parent = canvasEl.parentElement;
        while (parent && parent !== document.body) {
            parent.addEventListener("dragover", handleDragOver, true);
            parent.addEventListener("drop", handleDrop, true);
            parent = parent.parentElement;
        }

        log("Asset drop handler installed");
    };

    requestAnimationFrame(waitForCanvas);
}
