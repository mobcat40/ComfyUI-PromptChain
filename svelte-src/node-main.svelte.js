// Node widget entry point — exports mount/destroy for the PromptChain node UI.
// SharedState is a class with $state fields: main.js mutates properties, Svelte reacts.

import { mount, unmount } from "svelte";
import NodeWidget from "./components/node/NodeWidget.svelte";

export class SharedState {
  // mode display — main.js keeps these in sync with node.properties
  mode = $state("switch");
  switchIndex = $state(1);
  locked = $state(false);
  disabled = $state(false);
  collapsed = $state(false);

  // mode context — computed by main.js from graph state
  connectedCount = $state(0);
  hasLabels = $state(false);
  switchLabel = $state("");
  iterateCurrent = $state(0);
  iterateTotal = $state(0);
  iterateCycle = $state(1);

  // switch options array — computed by main.js from graph state
  switchOptions = $state([]);

  // panel visibility
  outputPanelOpen = $state(false);
  imagePanelVisible = $state(false);
  aiAssistantOpen = $state(false);
  posePanelVisible = $state(false);
  regionPanelVisible = $state(false);

  // whether any 3D Poser node exists in the graph (gates the menubar button) —
  // main.js drives this from the shared pose registry, not node.properties.
  hasPoseStudio = $state(false);
  // same gate for the Region Box panel — driven from the region-box registry.
  hasRegionBox = $state(false);

  // execution output
  compiledOutput = $state("");
  compiledNegOutput = $state("");

  // image preview
  imageUrl = $state(null);
  previewUrl = $state(null);
  progress = $state(null);
  isGenerating = $state(false);
  rollSelected = $state(null);

  constructor(node) {
    if (!node) return;
    const p = node.properties || {};
    this.mode = p.pcrMode || "switch";
    this.switchIndex = p.pcrSwitchIndex ?? 1;
    this.locked = !!p.pcrLocked;
    this.disabled = !!p.pcrDisabled;
    this.collapsed = !!p.pcrCollapsed;
    this.iterateCurrent = p.pcrIterateCurrent ?? 0;
    this.iterateTotal = p.pcrIterateTotal ?? 0;
    this.iterateCycle = p.pcrIterateCycle ?? 1;
    this.outputPanelOpen = !!p.pcrOutputPanel;
    this.imagePanelVisible = !!p.pcrImagePreview;
    this.aiAssistantOpen = !!p.pcrAiAssistant;
    this.posePanelVisible = !!p.pcrPosePanel;
    this.regionPanelVisible = !!p.pcrRegionPanel;
    this.compiledOutput = p.pcrCompiledOutput || "";
    this.compiledNegOutput = p.pcrCompiledNegOutput || "";
  }
}

export function mountNodeWidget(target, props) {
  return mount(NodeWidget, { target, props });
}

export function destroyNodeWidget(instance) {
  if (instance) unmount(instance);
}
