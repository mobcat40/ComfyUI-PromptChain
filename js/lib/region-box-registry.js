// Shared registry of live Region Box (PromptChain_RegionBox) nodes.
//
// region-box.js populates this as Region Box nodes mount/unmount; main.js reads
// it so each PromptChain node's menubar can gate the "pop the Region Box into a
// panel" button (enabled only when a Region Box exists) and so the panel knows
// which node to dock. A single shared module instead of a window global keeps it
// deterministic regardless of which extension file the loader runs first.
//
// Twin of pose-registry.js — separate so the two panels gate independently.
// Event-driven: subscribers are notified on add/remove (never polled).

const nodes = new Set();
const listeners = new Set();
let lastActive = null;

function notify() {
  for (const cb of listeners) {
    try { cb(); } catch (e) { console.error("[PromptChain] region-box-registry listener error", e); }
  }
}

export const regionBoxRegistry = {
  // Called by region-box.js on mount.
  add(node) {
    nodes.add(node);
    lastActive = node;
    notify();
  },
  // Called by region-box.js on teardown.
  remove(node) {
    const had = nodes.delete(node);
    if (lastActive === node) lastActive = null;
    if (had) notify();
  },
  // Called when a Region Box canvas is interacted with, so "which node does the
  // panel dock" follows the one you last touched. Quiet by design — switching
  // focus shouldn't yank an already-open panel onto a different node.
  touch(node) {
    if (nodes.has(node)) lastActive = node;
  },
  // The canvas finished mounting (enterDock now exists). add() fired its notify
  // earlier; re-notify so an already-open panel can dock now.
  signalReady(node) {
    if (nodes.has(node)) notify();
  },
  all() {
    return [...nodes];
  },
  // The node a freshly-opened panel should host: last-interacted if still alive,
  // else any live one.
  getActive() {
    if (lastActive && lastActive._pcrAlive && nodes.has(lastActive)) return lastActive;
    for (const n of nodes) if (n._pcrAlive) return n;
    return null;
  },
  get count() { return nodes.size; },
  // Returns an unsubscribe fn. Fires on add/remove (gating + open-panel refresh).
  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
