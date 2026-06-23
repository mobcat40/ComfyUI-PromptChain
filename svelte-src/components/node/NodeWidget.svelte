<script>
  // Root component for the PromptChain node widget.
  // Renders Menubar, EditorPane, OutputPanel, ImagePanel, Footer.

  import { provideApi } from "../../lib/api-context.js";
  import Menubar from "./Menubar.svelte";
  import EditorPane from "./EditorPane.svelte";
  import OutputPanel from "./OutputPanel.svelte";
  import ImagePanel from "./ImagePanel.svelte";
  import PosePanel from "./PosePanel.svelte";
  import RegionPanel from "./RegionPanel.svelte";
  import Footer from "./Footer.svelte";
  import AIAssistant from "./AIAssistant.svelte";

  let {
    node,
    shared,
    // menubar callbacks
    onSetMode = () => {},
    onResetIterate = null,
    onToggleLock = () => {},
    onToggleDisable = () => {},
    onToggleCollapse = () => {},
    onToggleOutput = () => {},
    onToggleImage = () => {},
    onToggleAssistant = () => {},
    onTogglePose = () => {},
    onToggleRegion = () => {},
    onOpenFullscreen = () => {},
    // doc dropdown DOM element (imperative)
    docDropdownEl = null,
    // footer DOM elements (imperative)
    modelIndicatorEl = null,
    tagsDropdownEl = null,
    // editor
    getEditorView = () => null,
    onEditorPaneReady = null,
    // panel registration callbacks
    onOutputPanelRegister = null,
    onImagePanelRegister = null,
    onPosePanelRegister = null,
    onRegionPanelRegister = null,
    onAIAssistantRegister = null,
    onFooterRegister = null,
    // returns the active 3D Poser node to dock into the pose panel
    getActivePoser = () => null,
    // returns the active Region Box node to dock into the region panel
    getActiveRegionBox = () => null,
    // OutputPanel API callbacks
    apiURL = (p) => p,
    fetchApi = (p, o) => fetch(p, o),
    toast = () => {},
    getWorkflowId = () => "",
    fetchWorkflowImages = async () => [],
    fetchWorkflowCount = async () => 0,
    subscribeHistory = () => () => {},
    invalidateCache = () => {},
    openViewer = () => {},
    getCanvasScale = () => 1,
    // ImagePanel API callbacks
    getCachedImages = () => [],
  } = $props();

  provideApi({ apiURL, fetchApi, toast, getWorkflowId, fetchWorkflowImages,
    fetchWorkflowCount, subscribeHistory, invalidateCache, openViewer,
    getCanvasScale, getCachedImages });

  let editorPane;

  // expose editor container to main.js on mount
  $effect(() => {
    if (editorPane) {
      onEditorPaneReady?.(editorPane.getContainer());
    }
  });

</script>

<Menubar
  {node}
  {shared}
  {onSetMode}
  {onResetIterate}
  onToggleLock={() => onToggleLock()}
  onToggleDisable={() => onToggleDisable()}
  onToggleCollapse={() => onToggleCollapse()}
  onToggleOutput={() => onToggleOutput()}
  onToggleImage={() => onToggleImage()}
  onToggleAssistant={() => onToggleAssistant()}
  onTogglePose={() => onTogglePose()}
  onToggleRegion={() => onToggleRegion()}
  {onOpenFullscreen}
  {docDropdownEl}
/>

<div class="pcr-node-content">
  <div class="pcr-editor-row">
    <!-- 3D Poser panel — leftmost. Always rendered (same relocate-into-
         fullscreen lifecycle as ImagePanel); it docks the live Poser viewport. -->
    <PosePanel
      {node}
      {shared}
      {getActivePoser}
      onToggle={(visible) => { shared.posePanelVisible = visible; }}
      onRegister={onPosePanelRegister}
    />
    <!-- Region Box panel — also leftmost. Docks the live Region Box canvas. -->
    <RegionPanel
      {node}
      {shared}
      {getActiveRegionBox}
      onToggle={(visible) => { shared.regionPanelVisible = visible; }}
      onRegister={onRegionPanelRegister}
    />
    <!-- AIAssistant is always rendered so its DOM can be relocated into
         the fullscreen pane-row when entering fullscreen; visibility
         toggles via display:none. Same lifecycle pattern as ImagePanel. -->
    <AIAssistant
      {node}
      {shared}
      onToggle={(visible) => { shared.aiAssistantOpen = visible; }}
      onRegister={onAIAssistantRegister}
    />
    <div class="pcr-editor-stack">
      <EditorPane bind:this={editorPane} {node} {shared} />
      <OutputPanel
        {node}
        {shared}
        onToggle={(isOpen) => { shared.outputPanelOpen = isOpen; }}
        onRegister={onOutputPanelRegister}
      />
    </div>
    <ImagePanel
      {node}
      {shared}
      onToggle={(visible) => { shared.imagePanelVisible = visible; }}
      onRegister={onImagePanelRegister}
    />
  </div>
  <Footer
    {node}
    {shared}
    {modelIndicatorEl}
    {tagsDropdownEl}
    {getEditorView}
    onRegister={onFooterRegister}
  />
</div>
