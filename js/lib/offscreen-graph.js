// Shared helper for off-screen render graphs (extend / smooth / repose).
//
// ComfyUI keys execution outputs by node id GLOBALLY: app.ts runs
//   nodeOutputStore.setNodeOutputsByExecutionId(String(detail.node), output)
// and then paints that output onto whatever node in the VISIBLE graph carries
// the same id. A background render graph numbered from 1 (EMPTY_WORKFLOW starts
// at last_node_id: 0) therefore collides with low-id live nodes — e.g. a 5-node
// Smooth graph whose SaveVideo is id 5 lands its broken-looking video frame on
// the user's PromptChain node when that node also happens to be id 5. Numbering
// our render nodes far above every live id keeps execution results off canvas.

import { app } from "../../../scripts/app.js";

const OFFSCREEN_GAP = 1_000_000;

// First id to assign in an off-screen graph: above every id the live canvas
// could report, so ComfyUI's id-keyed output painter never finds a visible
// match. Set graph.last_node_id to this BEFORE adding nodes (LGraph.add then
// hands out base+1, base+2, …).
export function offscreenIdBase() {
  let maxLiveId = 0;
  try {
    for (const g of [app?.graph, app?.rootGraph, app?.canvas?.graph]) {
      const n = Number(g?.last_node_id);
      if (Number.isFinite(n) && n > maxLiveId) maxLiveId = n;
    }
  } catch { /* app not ready → the constant gap alone is collision-proof */ }
  return maxLiveId + OFFSCREEN_GAP;
}
