// Lineage "subway" lane builder — pure topology, no Svelte. Shared by the in-rail
// lane view (ImageViewer) and the pop-out full-graph panel. Consumes the hoisted
// `lineageTree` ({ byHash, childrenOf, roots }) and a `brokenOut` Set of
// child-subtree ROOT hashes (the nodes the user has peeled into their own columns).
//
// Mental model: the family is a pure tree (single parent_hash, acyclic by
// content-sha256, never merges). A LANE is one vertical run following a primary
// path; at each node the OTHER children are "junctions" that can break out into
// their own lane. A column is the same recursive shape as column 0, so nested
// sub-junctions have somewhere to attach.

// Climb parent_hash from `hash` to its root. Returns { root, set } where `set`
// holds every node on the path (used as column 0's primary-path preference so the
// displayed image always sits on the leftmost lane).
export function ancestry(tree, hash) {
  const { byHash } = tree;
  const set = new Set();
  let cur = hash;
  let root = hash;
  while (cur && byHash.has(cur) && !set.has(cur)) {
    set.add(cur);
    root = cur;
    cur = byHash.get(cur).parent_hash;
  }
  return { root, set };
}

// Build one lane from `startHash`: start → primary child → … → tip, recording each
// off-primary fork as a junction. `spineSet` (optional) pulls the lane through a
// preferred path — on column 0 it's the displayed image's ancestry, so the lane
// flows root → displayed → tip; broken-out lanes pass no spineSet and follow the
// oldest child (childrenOf is pre-sorted ascending by created_at).
export function buildLane(tree, startHash, spineSet) {
  const { byHash, childrenOf } = tree;
  const nodes = [];
  const junctions = [];
  const guard = new Set();
  let cur = startHash;
  while (cur && byHash.has(cur) && !guard.has(cur)) {
    guard.add(cur);
    nodes.push(byHash.get(cur));
    const kids = childrenOf.get(cur) || [];
    let primary = spineSet ? kids.find(k => spineSet.has(k.hash)) : null;
    if (!primary) primary = kids[0] || null;
    const offPrimary = kids.filter(k => k !== primary).map(k => k.hash);
    if (offPrimary.length) junctions.push({ atHash: cur, childRoots: offPrimary });
    cur = primary ? primary.hash : null;
  }
  return { startHash, nodes, junctions };
}

// A row stays readable up to this many columns; past it, the OLDEST overflow
// siblings collapse into a single "+N" bundle chip that takes the last column
// slot (so the visible width is bounded). CHILDREN_REVEAL_STEP is how many more
// individual siblings each bundle click pages in.
export const CHILDREN_PER_ROW_CAP = 5;
export const CHILDREN_REVEAL_STEP = 4;
const DEFAULT_REVEAL = CHILDREN_PER_ROW_CAP - 1; // reals shown alongside the chip

// Full render. The breakout walk (col0 spine + DFS through broken-out junctions)
// decides WHICH nodes are shown and collects the per-node junction record; then a
// tidy top-down tree positions them, collapsing wide sibling rows into bundles.
//
//   opts.displayedHash — the image currently on screen; its whole root→self chain
//     is protected from bundling so the active branch is always visible.
//   opts.revealed      — Map<parentHash, realsBudget>: how many individual children
//     to show for a parent before bundling the rest (paged up by bundle clicks).
//
// Returns:
//   nodes           — for every placed item: real nodes { kind:"node", hash, item,
//                     x, depth, isTip } and bundle chips { kind:"bundle", hash,
//                     parent, hidden:[…], preview:[…], count, x, depth }.
//                     depth = generation (row); x = column (may be fractional),
//                     assigned post-order so each leaf takes the next slot and each
//                     parent centers over its children. Absolutely positioned
//                     (left = x*COL_W, top = depth*ROW_H).
//   edges           — { from, to } parent→child among PLACED nodes (a bundle's
//                     `to` is its synthetic id), consumed as DATA by the SVG
//                     connector layer (geometry is measured from the DOM).
//   junctionsByNode — Map<atHash, { shown:[], hidden:[] }> powering the ⊞ expander
//                     badge and the context-menu "Expand branches" gate.
//   rootHash        — the family root (for the dot-root badge).
//   width, height   — extent in columns / rows, for sizing the scroll content.
export function buildRender(tree, anchorHash, brokenOut, opts = {}) {
  const { byHash, childrenOf } = tree;
  const { displayedHash, revealed = new Map(), rootHash: rootOverride, pinned = new Set() } = opts;
  const a = ancestry(tree, anchorHash);
  // "Focus this branch" renders only the subtree from rootOverride down; otherwise
  // the lane starts at the true family root.
  const laneStart = (rootOverride && byHash.has(rootOverride)) ? rootOverride : a.root;
  const col0 = buildLane(tree, laneStart, a.set);
  const shown = new Set();
  const started = new Set();
  const junctionsByNode = new Map();
  const visit = (lane) => {
    for (const n of lane.nodes) shown.add(n.hash);
    for (const j of lane.junctions) {
      let rec = junctionsByNode.get(j.atHash);
      if (!rec) { rec = { shown: [], hidden: [] }; junctionsByNode.set(j.atHash, rec); }
      for (const childRoot of j.childRoots) {
        if (brokenOut.has(childRoot)) {
          rec.shown.push(childRoot);
          if (!started.has(childRoot)) { started.add(childRoot); visit(buildLane(tree, childRoot)); }
        } else {
          rec.hidden.push(childRoot);
        }
      }
    }
  };
  visit(col0);

  // The root→displayed chain is protected so the active branch never bundles away.
  const activePath = ancestry(tree, displayedHash || anchorHash).set;
  const childrenShown = (h) => (childrenOf.get(h) || []).filter(k => shown.has(k.hash));
  const hasShownSubtree = (h) => childrenShown(h).length > 0;

  // Tidy layout. childrenShown is in created_at order (oldest→newest). A parent
  // with more than the cap collapses its oldest non-protected leaf siblings into
  // one bundle chip (placed leftmost, where the old generations would sit); the
  // remaining reals keep their column each. Sibling subtrees occupy disjoint
  // column ranges, so same-row nodes never overlap and a parent always sits above
  // its own lineage.
  const xOf = new Map();
  const depthOf = new Map();
  const placed = new Set();
  const foldedAway = new Set(); // children collapsed into a chip — never placed as reals
  const bundles = [];
  let cursor = 0;
  const place = (h, depth) => {
    depthOf.set(h, depth);
    placed.add(h);
    const kids = childrenShown(h);
    if (!kids.length) { xOf.set(h, cursor++); return; }

    let bundleKids = [];
    let reals = kids;
    if (kids.length > CHILDREN_PER_ROW_CAP) {
      // Candidates to fold: leaf siblings that aren't on the active path and aren't
      // pinned (a pinned sibling is a deliberate keeper — never bundle it away).
      const optional = kids.filter(k => !activePath.has(k.hash) && !hasShownSubtree(k.hash) && !pinned.has(k.hash));
      const budget = revealed.get(h) ?? DEFAULT_REVEAL;
      const forced = kids.length - optional.length;           // protected reals
      const keepOptional = Math.max(0, budget - forced);      // newest optional kept as reals
      const keep = new Set(optional.slice(Math.max(0, optional.length - keepOptional)).map(k => k.hash));
      bundleKids = optional.filter(k => !keep.has(k.hash));    // the oldest leftover
      if (bundleKids.length <= 1) bundleKids = [];             // a 1-item chip saves nothing
      const folded = new Set(bundleKids.map(k => k.hash));
      reals = kids.filter(k => !folded.has(k.hash));
    }

    const xs = [];
    if (bundleKids.length) {
      const id = `bundle:${h}`;
      depthOf.set(id, depth + 1);
      xOf.set(id, cursor++);
      xs.push(xOf.get(id));
      bundles.push({
        id, parent: h, depth: depth + 1,
        hidden: bundleKids.map(k => k.hash),
        preview: bundleKids.slice(0, 2).map(k => k.hash),
        count: bundleKids.length,
      });
      for (const k of bundleKids) foldedAway.add(k.hash);
    }
    for (const k of reals) { place(k.hash, depth + 1); xs.push(xOf.get(k.hash)); }
    xOf.set(h, (xs[0] + xs[xs.length - 1]) / 2);
  };
  const rootHash = col0.nodes.length ? col0.nodes[0].hash : null;
  if (rootHash && shown.has(rootHash)) place(rootHash, 0);
  // Stragglers (defensive): shown nodes the spine walk never reached. Folded
  // children are intentionally unplaced (they live in a chip) — skip them here or
  // they'd be re-placed as duplicate real nodes at row 0, defeating the bundle.
  for (const h of shown) if (!placed.has(h) && !foldedAway.has(h)) place(h, 0);

  // Edges derive from parent_hash over the placed reals (reproducing every spine
  // and broken-out junction edge), plus one parent→chip edge per bundle. Folded
  // children aren't placed, so no connector dangles at a missing node.
  const edges = [];
  for (const h of placed) {
    if (h === rootHash) continue;
    const p = byHash.get(h)?.parent_hash;
    if (p && placed.has(p)) edges.push({ from: p, to: h });
  }
  for (const b of bundles) edges.push({ from: b.parent, to: b.id });

  let maxX = 0, maxDepth = 0;
  const nodes = [];
  const note = (x, depth) => { if (x > maxX) maxX = x; if (depth > maxDepth) maxDepth = depth; };
  for (const h of placed) {
    const x = xOf.get(h), depth = depthOf.get(h);
    note(x, depth);
    nodes.push({ kind: "node", hash: h, item: byHash.get(h), x, depth, isTip: childrenShown(h).length === 0 });
  }
  for (const b of bundles) {
    const x = xOf.get(b.id);
    note(x, b.depth);
    nodes.push({ kind: "bundle", hash: b.id, parent: b.parent, hidden: b.hidden, preview: b.preview, count: b.count, x, depth: b.depth });
  }
  return { nodes, edges, junctionsByNode, rootHash, width: maxX + 1, height: maxDepth + 1 };
}
