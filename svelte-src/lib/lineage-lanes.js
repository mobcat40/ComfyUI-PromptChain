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

// Full render: column 0 anchored on `anchorHash`'s spine, then DFS the broken-out
// lanes (each appears just right of the junction it forks from). Returns:
//   columns         — lanes in left-to-right DFS order (column 0 first)
//   edges           — { from: forkHash, to: childRootHash } per broken-out lane,
//                     consumed as DATA by the SVG connector layer (geometry is
//                     measured from the DOM; topology is never inferred from it)
//   junctionsByNode — Map<atHash, { shown:[], hidden:[] }> powering the ⊞ expander
//                     badge and the context-menu "Expand branches" gate
//   rootHash        — column 0's first node (for the dot-root badge)
// topRow is the column's vertical offset measured in ROWS from the top of the
// whole lane area. A broken-out child column starts one generation BELOW its fork
// (topRow = parentTopRow + forkRowInParent + 1), i.e. the SAME row as the sibling
// that stayed inline in the parent column. So a parent sits a row above all its
// children, children of children another row down — a proper top-down hierarchy
// instead of every column top-aligned (which made parents look like peers).
export function buildRender(tree, anchorHash, brokenOut) {
  const a = ancestry(tree, anchorHash);
  const col0 = buildLane(tree, a.root, a.set);
  const columns = [];
  const edges = [];
  const started = new Set();
  const junctionsByNode = new Map();
  const visit = (lane, topRow) => {
    lane.topRow = topRow;
    columns.push(lane);
    // spine edges: every consecutive pair in a column is a parent→primary-child
    // link, drawn as a straight vertical connector (same column = same x).
    for (let i = 0; i + 1 < lane.nodes.length; i++) {
      edges.push({ from: lane.nodes[i].hash, to: lane.nodes[i + 1].hash });
    }
    for (const j of lane.junctions) {
      const forkRow = lane.nodes.findIndex(n => n.hash === j.atHash);
      let rec = junctionsByNode.get(j.atHash);
      if (!rec) { rec = { shown: [], hidden: [] }; junctionsByNode.set(j.atHash, rec); }
      for (const childRoot of j.childRoots) {
        if (brokenOut.has(childRoot)) {
          rec.shown.push(childRoot);
          if (!started.has(childRoot)) {
            started.add(childRoot);
            edges.push({ from: j.atHash, to: childRoot });
            visit(buildLane(tree, childRoot), topRow + forkRow + 1);
          }
        } else {
          rec.hidden.push(childRoot);
        }
      }
    }
  };
  visit(col0, 0);
  return { columns, edges, junctionsByNode, rootHash: col0.nodes.length ? col0.nodes[0].hash : null };
}
