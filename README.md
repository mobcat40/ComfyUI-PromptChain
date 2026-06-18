<h1 align="left"><img src="docs/spacer.webp" width="10" alt=""><img src="docs/wordmark.webp" alt="ComfyUI-PromptChain" height="43"></h1>

<p align="center">
  <img src="docs/hero.webp" alt="PromptChain: 3D posing, structured prompt authoring, and layered editing in ComfyUI" width="100%">
</p>

> ⚠️ **Beta.** This is an early public release; things may change and break. Feedback welcome.

A prompt-authoring and image-iteration suite for [ComfyUI](https://github.com/comfyanonymous/ComfyUI). PromptChain turns the raw prompt box into a model-aware, structured workflow, then carries that structure through posing, generating, viewing, editing, and upscaling.

## Prompt authoring

- **Prompt Chain node**: a real code editor on the node with syntax highlighting, comments, multi-line editing, and a collapsible output panel showing the compiled positive/negative prompt, a live server console, and this node's gallery.
- **Chain modes**: link multiple Prompt Chain nodes and pick how their text merges, shown live in the toolbar. **Combine** all, **Randomize** one at random, **Switch** to a chosen branch, or **Iterate** through options across queued runs.
- **Wildcards**: inline `::Label::a|b` option sets that randomize, cycle, or switch, plus `__file__` wildcards whose per-token badge sets the mode inline.
- **Autocomplete**: booru tag completion as you type, `@` to pull in curated characters/styles/poses (auto-cascading their outfit and pose), and `$` to insert a regional prompt block for any figure in your 3D pose.
- **Fast editing**: weight nudging with Ctrl+↑/↓ on a tag, `(text:weight)` group, or `<lora:…:weight>`; comment, font-size, comma-split, and panel-toggle shortcuts; a right-click menu for Tag Builder, saved prompts, and image-prompt recovery.
- **Drag an image to merge its prompts**: drop any ComfyUI-generated image onto the editor and its positive/negative prompts merge in, deduplicated. A LoadImage node can also pull an image's original prompts into the editor via keywords.
- **Saved prompt library**: store reusable snippets scoped to a checkpoint and drop them in from the right-click menu.
- **Fullscreen editor**: open the whole prompt chain in a distraction-free overlay that edits every linked node side by side.

## Tag Builder

- **Visual prompt composer**: assemble a prompt from curated, model-aware tag sets instead of typing. Open it from the editor, pick a subject, dress it, pose it, and scene it; the tags write straight into your prompt.
- **Multi-subject cards**: each subject is its own card with appearance, clothing, pose, expression, action, and prop slots, so multi-character prompts stay organized.
- **Character library**: browse and search a large library of named characters (anime, original, video game, V-Tuber, archetype, fantasy, creatures); picking one drops in its canonical identity tags.
- **Curated picks with thumbnails**: pick from image-backed sets for appearance, clothing, pose, expression, action, scene, and 16 prop categories.
- **Customizers**: refine clothing (color / material / condition / pattern), fantasy traits (wings / horns / tails / ears), and props & furniture (materials, patterns, attach to a subject as an interaction).
- **Round-trips**: open the builder on an existing prompt and it parses your styles, characters, outfits, poses, and props back into chips, preserving your original wording so visual and hand edits stay in sync.
- **Model-aware styles**: a Styles tab of render presets matched to your loaded checkpoint's architecture and family appears when a model is detected.

## Model awareness

- **Checkpoint recognition**: models are fingerprinted and looked up on CivitAI by hash, so PromptChain shows the real name and applies the right presets, prompt defaults, sampler recommendations, and ControlNet routing for the detected family. Unknown models are recognized in the background at startup with live progress.
- **In-place model swap**: pick a compatible checkpoint from the model panel and PromptChain swaps it into your existing nodes and reapplies its settings; custom wiring (like a regional couple) stays put.
- **Model panel**: a clickable model chip on each node opens a searchable picker and a settings modal (Info / Settings / Prompts / Templates / Versions) for tuning recommended ranges, scoped prompt snippets, workflow templates, and spotting newer releases.
- **Version inheritance**: a new version of a model you already set up inherits your trigger words, prompt style, sampler ranges, and detailer settings automatically.
- **Built-in downloads**: search CivitAI or browse a curated model catalog and download checkpoints into the right folder with a live progress bar and size estimates.

## 3D Poser

- **Pose Studio node**: pose full 3D mannequins in the browser and emit depth + OpenPose control maps that stay in sync with your prompt sections; the pose is saved into the workflow for cache reuse.
- **Per-figure masks**: alongside the control map, the node outputs a per-character silhouette mask (and per-named-prop region) to drive regional conditioning.
- **Figures & bodies**: stage multiple people, start from body templates, and reshape anyone live with a **MakeHuman-derived slider engine** (height, weight, muscle, gender, age, proportions, and more), applied instantly with no rebake.
- **Creatures**: pose a horse or a cat as first-class rigged figures with their own IK.
- **Props**: drop in matte primitives and a large categorized library (furniture, weapons, vehicles, tools, environment), spawn pre-arranged prop sets, wear calibrated shoes, or **import your own `.glb`/`.obj`**, then fit a skeleton inside an import to make it posable.
- **Build geometry**: **draw a 3D shape** from a freehand outline (flat / extruded / revolved / inflated), or **trace an image** into inflated solids that keep its layout.
- **Mesh sculpt**: reshape a body or prop freehand with a grab / inflate / smooth brush, including sculpting while the figure is posed.
- **Posing tools**: move/rotate/scale gizmo, per-finger hand posing, foot pinning, prop linking, object grouping, mirror/reset, full undo/redo, and per-prop `$` prompt regions.
- **Pose presets**: apply bundled poses or save your own, filtered to the active figure's rig.
- **Workspace**: dock the live Poser into a panel, go fullscreen, toggle a ground floor, and export/import whole scenes as JSON.

## Multi-character & regional control

- **Regional (Attention Couple)**: per-figure silhouette masks from the 3D Poser pin each character's prompt block to that figure, so characters and outfits stop bleeding into each other.
- **Regional Conditioning**: carries each character's prompt as native masked conditioning that survives tiled samplers, so an upscale tile over a figure samples with that figure's own prompt.
- **Regional Detailer**: mask-correct face detailing that pairs each face with its own character prompt (detects faces or uses the Poser's exact head positions; works non-regionally too, and installs its own detector).

## Generate & view

- **Generation gallery**: every image a node makes collects into a built-in gallery, newest first, with justified / grid / list views, selection, keyboard navigation, and bulk delete.
- **Lineage grouping**: upscales, inpaints, and edits collapse into their source image's card with the latest on top and a count badge; re-generating from the same source spawns a separate card. Toggleable in settings.
- **Image viewer**: a full-screen viewer with a timeline strip, a lineage family tree for stepping between an image and its variants, a side-by-side compare slider, and a panel that recovers the prompt, model, seed, and settings from any PromptChain image.
- **Safe deletes & recovery**: deleting purges every copy on disk and tombstones the image so self-healing history can't revive it; if a source file goes missing, the viewer offers a hash-verified "Locate file" re-link.

## Edit, inpaint & upscale

Everything below lives behind **Edit**, the single doorway to post-processing any generated image.

- **Layered editor**: a Photoshop-style editor with non-destructive layers (opacity, blend modes, reorder, merge, flatten), brush/eraser, paint bucket, spot heal, healing brush, clone stamp, smooth, move-with-snap, rectangle/lasso selections with feather, crop, **Liquify**, and **Camera-Raw-style** tonal/color adjustments, with full undo history. Save back onto the same image (keeping its lineage) or export a new one.
- **AI selection**: one-click masking. **Select Subject** (BiRefNet) segments the main subject, **Object Select** (SAM2) turns any click into that object's mask, and pose-derived masks isolate an individual figure in a multi-character scene.
- **Region → Inpaint**: send a layer or selection to a full inpaint pass and get it back as a layer. Modes for Basic, Depth (structure-locked), Regional (each figure's own prompt), or both; a choice of engines (the image's own model, a standalone SDXL / FLUX.1, or a Qwen Edit instruction model); and **character lock** via PuLID or Style Reference referenced from the image itself.
- **Region → Upscale**: targeted upscale that can grow the canvas so new detail lands pixel-for-pixel, or keep the canvas and fit the re-detail back in place. Basic / Depth / Regional modes, scale and denoise controls, recommended sampler markers, character lock, and a choice of engines: a deterministic **UltraSharp** climb by default, an opt-in **SeedVR2** restore for degraded sources, or AI re-detail.
- **Background upscales**: queue an upscale from any viewed image without touching your open workflow; it runs in the background with live tile preview, progress, ETA, and a real Cancel, then records into lineage.
- **Re-pose**: pose a detached 3D mannequin from Edit and re-render the whole image into the new pose while keeping identity and outfit, using a Qwen Edit AnyPose recipe or a FLUX.2 Klein depth recipe.

## Asset browser

- **Sidebar file manager**: a desktop-style browser docked in ComfyUI's sidebar for your **Workflows**, **Input**, and **Output** folders, with breadcrumbs, history navigation, sort/group, and type-to-select.
- **Recent feed**: flatten every subfolder into one newest-first stream with infinite scroll and full-subtree search, so your latest renders are always on top.
- **Thumbnails & previews**: inline image/video thumbnails (grid or list, Ctrl+scroll to zoom), saved workflows showing their last render, favorites, and a properties view with embedded generation metadata.
- **File ops**: cut / copy / paste / move (drag-and-drop or shortcuts with conflict resolution), rename, delete, multi-select, and drag-and-drop upload of files or whole folders. New outputs appear live as renders finish.
- **Find Duplicates**: scan a folder for visually duplicate images via perceptual hashing and clean them up.
- **New workflow in a few clicks**: pick a checkpoint from a searchable, architecture-grouped list and a template wired for it; the file is auto-named and you land on the canvas ready to render.

## Onboarding & installation

- **First-run walkthrough**: a guided Welcome / Setup / Extras splash flips on recommended ComfyUI options, validates a CivitAI key, and offers to install optional features.
- **Self-installing features**: Style Reference, Upscaler, Face Detailer, ControlNet, PuLID, SeedVR2, and AI Selection install their own nodes and model files on first use, with live progress, a restart, and no Manager round-trip. A health dashboard in **Settings → PromptChain → Install** shows status, sizes, and updates.
- **Bundled ControlNet preprocessors**: license-clean OpenPose, Depth, Canny, Tile, Luminance, Scribble, Soft Edge, and Line Art preprocessors ship with the pack, so full ControlNet workflows work without `comfyui_controlnet_aux`.
- **In-app updater**: an About panel checks the repo, applies updates, and restarts ComfyUI in place.

To install, clone into your ComfyUI `custom_nodes` directory and restart ComfyUI:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/mobcat40/ComfyUI-PromptChain.git
```

Add the **Prompt Chain** node from the node menu, and onboarding takes it from there.

## Nodes

| Node | Purpose |
| --- | --- |
| Prompt Chain | Structured prompt editor and compiler (chain modes, wildcards, regions) |
| PromptChain 3D Poser | 3D posing → depth / OpenPose maps + per-figure masks |
| Prompt Chain Regional (Attention Couple) | Per-character regional attention from per-figure masks |
| Prompt Chain Regional Conditioning | Tile-safe per-region conditioning that survives upscaling |
| Prompt Chain Regional Detailer | Mask-correct per-region face detailing |
| Prompt Chain Masked Detail | Crop-and-upscale re-render of a masked region |
| Prompt Chain Background Mask (Depth) | Depth-based background mask for bokeh-preserving upscales |
| Prompt Chain OpenPose / Depth Anything / Canny / Tile / Luminance / Scribble / Soft Edge / Line Art | Bundled, license-clean ControlNet image preprocessors |

## License

[AGPL-3.0](LICENSE). © 2026 mobcat40. If you run a modified PromptChain as part of a hosted service, you must offer your users the modified source.
