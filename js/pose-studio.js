// Pose Studio — a Three.js posable-figure viewport mounted into the
// PromptChain_PoseStudio node body. The figure is posed here; on every
// interaction-end the viewport renders a control map, uploads it to the input
// dir, and writes the filename into the (hidden) control_map widget so the
// backend node just reloads a finished image. Mirrors the CodeMirror mounting
// harness in main.js (addDOMWidget + bespoke event isolation + clean teardown).

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { poseRegistry } from "./lib/pose-registry.js";
import { setEditorContent, attachDocChangeListener } from "./lib/editor.js";
import { getLink } from "./lib/slot-utils.js";

const NODE_TYPE = "PromptChain_PoseStudio";
const MIN_NODE_SIZE = [320, 400];
// Build stamp — open the browser console (F12). If you do NOT see this exact line after
// restarting ComfyUI, your server is still serving the OLD extension JS (it caches it at
// startup) and no code change can reach you until it actually reloads this file.
console.log("%c[PromptChain PoseStudio] BUILD region-rename-reverse-1 (text $name{} rename -> figure rename) loaded", "color:#7fffb0;font-weight:bold");

// ── figure/prop clipboard ───────────────────────────────────────────────────
// Copy a selection (person, prop, or band-selected group) and paste it into the
// same viewport or any other 3D Poser — including one in another workflow. The
// payload rides the SYSTEM clipboard (survives workflow switches and browser
// restarts); this module-level copy is the fallback when the clipboard API is
// unavailable or permission-denied (then paste works within the current tab).
const CLIP_FORMAT = "promptchain-pose-clip";
let poseClipMemory = null;

// ── lazy Three.js loader ────────────────────────────────────────────────────
// three.bundle.js is an IIFE that assigns window.PromptChainThree, but only
// when run as a classic <script> (a module import scopes the var locally). So
// inject a script tag on first use — same trick as loadCodeMirror, and it keeps
// the 700KB bundle off pages that never open a Pose Studio node.
let threePromise = null;
function loadThree() {
  if (threePromise) return threePromise;
  threePromise = new Promise((resolve, reject) => {
    if (window.PromptChainThree) return resolve(window.PromptChainThree);
    const script = document.createElement("script");
    script.src = new URL("./three.bundle.js?v=2", import.meta.url).href; // v=2: + OBJLoader
    script.onload = () =>
      window.PromptChainThree
        ? resolve(window.PromptChainThree)
        : reject(new Error("three.bundle.js loaded but window.PromptChainThree is missing"));
    script.onerror = () => reject(new Error("Failed to load three.bundle.js"));
    document.head.appendChild(script);
  });
  return threePromise;
}

// ── viewport wheel dolly ────────────────────────────────────────────────────
// A single window-capture wheel handler. Capture-at-window fires before the
// 2.0 frontend's TransformPane @wheel.capture, so the canvas never zooms; we
// dolly the camera ourselves (OrbitControls' own zoom is disabled because its
// listener would never get the event past the capture-phase block).
const viewportContainers = new Set();
let wheelInstalled = false;
function installViewportWheel() {
  if (wheelInstalled) return;
  wheelInstalled = true;
  window.addEventListener(
    "wheel",
    (event) => {
      let host = null;
      for (const c of viewportContainers) {
        if (c.contains(event.target)) { host = c; break; }
      }
      if (!host) return;
      // Scrollable sub-panels (e.g. the 66-slider custom body panel) own the
      // wheel while hovered: still swallow propagation (or the frontend's
      // capture handler zooms the GRAPH) but skip preventDefault + dolly so
      // the browser scrolls the panel natively. Panel-level stopPropagation
      // can't do this — this capture-at-window handler fires first.
      const scrollPane = event.target?.closest?.("[data-pcr-wheel-scroll]");
      if (scrollPane && host.contains(scrollPane) && scrollPane.scrollHeight > scrollPane.clientHeight) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      host._pcrDolly?.(event.deltaY);
    },
    { capture: true, passive: false }
  );
}

// ── viewport chrome styles ──────────────────────────────────────────────────
// The tool strip is quiet chrome: dimmed when the cursor is away from the
// viewport, full when hovering it. The sub-panels live inside the container, so
// hovering them keeps :hover true and the strip stays up while you're posing.
let poseStylesInstalled = false;
function installPoseStyles() {
  if (poseStylesInstalled) return;
  poseStylesInstalled = true;
  const style = document.createElement("style");
  style.textContent =
    ".pcr-pose-toolbar{opacity:0;transition:opacity .18s ease;}" + // fully hidden until the cursor enters the viewport
    ".pcr-pose-studio:hover .pcr-pose-toolbar{opacity:1;}";
  document.head.appendChild(style);
}

// ── event isolation ─────────────────────────────────────────────────────────
// Stop pointer/key events from bubbling to LiteGraph (which would drag the node
// or pop its context menu), but only in the BUBBLE phase — OrbitControls listens
// on the canvas in the target phase, which runs first, so it still gets to orbit.
function isolateViewportEvents(container) {
  const stop = (event) => event.stopPropagation();
  for (const type of ["pointerdown", "pointerup", "pointermove", "keydown", "keyup", "contextmenu"]) {
    container.addEventListener(type, stop);
  }
  // LiteGraph captures the pointer on its canvas; release it so a drag here
  // orbits the camera instead of moving the node.
  container.addEventListener("pointerdown", (event) => {
    const canvas = document.querySelector("canvas.lgraphcanvas");
    if (canvas && typeof event.pointerId === "number") {
      try {
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      } catch {} // capture may already be released
    }
  });
  viewportContainers.add(container);
  installViewportWheel();
}

// ── rigged figure ───────────────────────────────────────────────────────────
// A volumetric capsule mannequin built as a parented bone hierarchy: each joint
// is a THREE.Group pivot, and the limb leaving it is attached to that group, so
// rotating a joint swings everything downstream (forward kinematics). Each mesh
// carries userData.joint = the group that rotates it, so clicking a body part
// selects the right joint. Returns the root, a flat mesh list (for raycasting),
// and the named joints (for serialization). No asset needed; the real rigged/
// morphable mesh lands in a later phase.
function buildFigure(THREE) {
  const skin = new THREE.MeshStandardMaterial({ color: 0xb9b6c2, roughness: 0.85, metalness: 0.0 });
  const up = new THREE.Vector3(0, 1, 0);
  const meshes = [];
  const joints = {};

  const joint = (name, parent, off) => {
    const g = new THREE.Group();
    g.position.set(off[0], off[1], off[2]);
    g.userData.jointName = name;
    parent.add(g);
    joints[name] = g;
    return g;
  };
  // Capsule from the group origin to a local end point, owned by that joint.
  const limbTo = (group, end, r) => {
    const b = new THREE.Vector3(end[0], end[1], end[2]);
    const span = b.length();
    const geo = new THREE.CapsuleGeometry(r, Math.max(0.0001, span - 2 * r), 6, 14);
    const m = new THREE.Mesh(geo, skin);
    m.position.copy(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, b.clone().normalize());
    m.userData.joint = group;
    group.add(m);
    meshes.push(m);
  };
  const ballAt = (group, p, r) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), skin);
    m.position.set(p[0], p[1], p[2]);
    m.userData.joint = group;
    group.add(m);
    meshes.push(m);
  };
  const boxAt = (group, p, dim) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(dim[0], dim[1], dim[2]), skin);
    m.position.set(p[0], p[1], p[2]);
    m.userData.joint = group;
    group.add(m);
    meshes.push(m);
  };

  const root = new THREE.Group(); // pelvis — selecting it rotates the whole body
  root.position.set(0, 0.98, 0);
  root.userData.jointName = "root";
  joints.root = root;

  // Trunk — root → spine (lumbar) → chest (thoracic); the two 0.11 offsets sum
  // to the original 0.22 so chest/shoulders/neck/head heights are unchanged.
  limbTo(root, [0, 0.14, 0], 0.135);              // pelvis mass
  const spine = joint("spine", root, [0, 0.11, 0]);
  limbTo(spine, [0, 0.11, 0], 0.115);             // lumbar mass
  const chest = joint("chest", spine, [0, 0.11, 0]);
  limbTo(chest, [0, 0.26, 0], 0.150);             // chest mass
  limbTo(chest, [0.17, 0.26, 0], 0.060);          // clavicle L (selects chest)
  limbTo(chest, [-0.17, 0.26, 0], 0.060);         // clavicle R
  const neck = joint("neck", chest, [0, 0.28, 0]);
  limbTo(neck, [0, 0.10, 0], 0.055);
  const head = joint("head", neck, [0, 0.14, 0]);
  ballAt(head, [0, 0.06, 0], 0.115);

  // Arms
  for (const [side, s] of [["L", 1], ["R", -1]]) {
    const sh = joint("shoulder" + side, chest, [s * 0.17, 0.26, 0]);
    limbTo(sh, [s * 0.25, 0, 0], 0.052);          // upper arm
    const el = joint("elbow" + side, sh, [s * 0.25, 0, 0]);
    limbTo(el, [s * 0.22, 0, 0], 0.044);          // forearm
    const wr = joint("wrist" + side, el, [s * 0.22, 0, 0]);
    ballAt(wr, [s * 0.05, 0, 0], 0.050);          // hand
  }

  // Legs
  for (const [side, s] of [["L", 1], ["R", -1]]) {
    const hip = joint("hip" + side, root, [s * 0.10, 0, 0]);
    limbTo(hip, [s * 0.02, -0.43, 0], 0.088);     // thigh
    const kn = joint("knee" + side, hip, [s * 0.02, -0.43, 0]);
    limbTo(kn, [0, -0.46, 0], 0.062);             // shin
    const an = joint("ankle" + side, kn, [0, -0.46, 0]);
    boxAt(an, [0, -0.06, 0.05], [0.10, 0.06, 0.22]); // forward-pointing foot
  }

  return { root, meshes, joints, jointForHit: (hit) => hit.object.userData.joint || null };
}

// ── realistic mesh loading (GLB) ────────────────────────────────────────────
// Load a rigged humanoid GLB and retarget our canonical joints onto its
// skeleton so the gizmo/FK posing works on a realistic skinned mesh — which is
// what DepthAnything needs to read the figure as human. Falls back to the
// capsule mannequin if the file is absent or unrigged.
const CANON_JOINTS = [
  "root", "spine", "back", "chest", "neck", "head",
  "shoulderL", "elbowL", "wristL", "shoulderR", "elbowR", "wristR",
  "hipL", "kneeL", "ankleL", "hipR", "kneeR", "ankleR",
];

// Heuristic bone-name → canonical-joint classifier covering Mixamo, Unity-
// humanoid, and Blender/Rigify/MakeHuman naming. Logs are emitted on load so a
// rig that doesn't map cleanly can be diagnosed and the rules tightened.
function classifyBone(rawName) {
  const n = rawName.toLowerCase().replace(/mixamorig[:_]?/g, "");
  const side = /(^|[^a-z])l([^a-z]|$)|left|lft/.test(n) ? "L"
             : /(^|[^a-z])r([^a-z]|$)|right|rgt/.test(n) ? "R" : "";
  const has = (...k) => k.some((x) => n.includes(x));
  const sided = (base) => (side ? base + side : null);
  if (has("head") && !has("end", "top")) return "head";
  if (has("neck")) return "neck";
  if (has("hand") || has("wrist")) return sided("wrist");
  if (has("forearm", "lowerarm")) return sided("elbow");
  if (has("upperarm")) return sided("shoulder");
  if (has("clavicle", "shoulder")) return null; // skip clavicle; the upper-arm bone is our "shoulder"
  if (has("arm")) return sided("shoulder"); // Mixamo "Arm" = upper arm
  if (has("toe")) return null;
  if (has("foot", "ankle")) return sided("ankle");
  if (has("upleg", "upperleg", "thigh")) return sided("hip");
  if (has("shin", "calf", "lowerleg")) return sided("knee");
  if (has("leg")) return sided("knee"); // Mixamo "Leg" = lower leg
  if (has("hips", "pelvis", "root")) return "root";
  if (has("upperchest", "chest", "spine2", "spine1")) return "chest";
  if (has("spine")) return "chest";
  return null;
}

// Blender Rigify exports keep hundreds of control/mechanism bones; only the
// hierarchically-parented DEF- bones actually deform the skinned mesh (the rig's
// constraints don't survive glTF). Map our joints onto those. Limb twist
// segments (".001") are skipped — we drive the primary bone.
function classifyRigifyDef(rawName) {
  // three's GLTFLoader strips dots from node names, so "DEF-thigh.L.001_228"
  // arrives as "DEF-thighL001_228". Normalize by dropping the DEF- prefix, the
  // trailing "_<id>", and any remaining dots — then parse undotted names.
  let n = rawName.replace(/^DEF-/i, "").replace(/_\d+$/, "").replace(/\./g, "").toLowerCase();
  // Spine chain is intentionally NOT posable on constraint-driven Rigify
  // exports: the skull (DEF-spine006) and the face bones (DEF-jaw/temple/lip…)
  // sit in separate parent branches kept in sync by constraints that glTF
  // drops, so rotating any spine bone tears the head off the face. Limbs are
  // unaffected (their DEF chains are self-contained). Torso/head posing waits
  // for a clean simple-rig mesh.
  if (/^spine\d*$/.test(n)) return null;
  // Limbs: trailing digits = twist segment (skip); trailing l/r = side.
  const twist = /\d$/.test(n);
  n = n.replace(/\d+$/, "");
  let side = "";
  if (/l$/.test(n)) { side = "L"; n = n.replace(/l$/, ""); }
  else if (/r$/.test(n)) { side = "R"; n = n.replace(/r$/, ""); }
  const sided = (b) => (side ? b + side : null);
  if (n === "upper_arm") return twist ? null : sided("shoulder");
  if (n === "forearm") return twist ? null : sided("elbow");
  if (n === "hand") return sided("wrist");
  if (n === "thigh") return twist ? null : sided("hip");
  if (n === "shin") return twist ? null : sided("knee");
  if (n === "foot") return sided("ankle");
  return null; // shoulder (clavicle), pelvis, toe, forehead, etc.
}

function buildBoneMap(bones, profile) {
  // Non-biped rigs carry an author-baked explicit map — exact bone names, no
  // guessing. The heuristic path below is biped-only by design (hard rule:
  // never classify a quadruped's bones heuristically; they'd silently drop).
  if (profile?.boneMap) {
    const joints = {};
    for (const bone of bones) {
      const slot = profile.boneMap[bone.name];
      if (slot && !joints[slot]) joints[slot] = bone;
    }
    return joints;
  }
  const canon = profile?.joints || CANON_JOINTS;
  const isRigify = bones.some((b) => /^DEF-/i.test(b.name));
  const spineRank = (nm) => { const m = nm.match(/(\d+)\s*$/); return m ? +m[1] : 0; };
  const joints = {};
  const spineBones = [];
  for (const bone of bones) {
    if (isRigify && !/^DEF-/i.test(bone.name)) continue;
    const slot = isRigify ? classifyRigifyDef(bone.name) : classifyBone(bone.name);
    if (!slot || !canon.includes(slot)) continue;
    // Generic-rig spine: collect every spine bone, then split the lowest
    // (lumbar) into "spine" and the highest (thoracic) into "chest" so the
    // torso bends at the waist AND the upper back, not as one rigid block.
    if (slot === "chest" && !isRigify) { spineBones.push(bone); continue; }
    // Root slot: prefer the actual PELVIS bone over an armature "Root"/master node
    // above it (this rig has both). The base handle then sits at the hips and
    // body rotation pivots around the body's center, not the floor.
    if (slot === "root") {
      const rank = (nm) => /pelvis|hip/i.test(nm) ? 2 : /root|master|armature/i.test(nm) ? 0 : 1;
      if (!joints.root || rank(bone.name) > rank(joints.root.name)) joints.root = bone;
      continue;
    }
    if (!joints[slot]) joints[slot] = bone;
  }
  if (spineBones.length) {
    spineBones.sort((a, b) => spineRank(a.name) - spineRank(b.name));
    joints.chest = spineBones[spineBones.length - 1];        // highest = upper torso
    if (spineBones.length > 1) joints.spine = spineBones[0]; // lowest = lumbar
    if (spineBones.length > 3) {
      // Our subdivided rig (tools/spine_subdiv.py): the game rig packs
      // spine_01..03 into the lower torso and spans the whole ribcage with
      // spine_03 alone, so the builds split it. The new top bone (spine_04,
      // shoulder-blade level) = "back"; "chest" stays spine_03 so old saves
      // restore onto the bone they were posed with.
      joints.back = spineBones[spineBones.length - 1];
      joints.chest = spineBones[spineBones.length - 2];
    } else if (spineBones.length > 2) {
      joints.back = spineBones[1]; // legacy 3-bone GLB: middle vertebra
    }
  }
  return joints;
}

function loadGlbFigure(THREE, GLTFLoader, url, profile) {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        const root = gltf.scene;
        const skinned = [];
        root.traverse((o) => { if (o.isSkinnedMesh) { o.frustumCulled = false; skinned.push(o); } });
        if (!skinned.length) {
          console.warn("[PoseStudio] GLB has no skinned mesh — using capsule fallback");
          resolve(null);
          return;
        }
        // This asset (and similar) can ship multiple bodies + eye meshes. Show
        // only the highest-poly mesh (the body) and hide the rest; pose its rig.
        // Profiles with keepAllMeshes (creature GLBs whose extra meshes are real
        // parts — mane/tail hair — not alternate bodies) keep everything visible.
        const keepAll = !!profile?.keepAllMeshes;
        const body = skinned.reduce((a, b) =>
          (b.geometry.attributes.position?.count || 0) > (a.geometry.attributes.position?.count || 0) ? b : a);
        for (const m of skinned) m.visible = keepAll || (m === body);
        const meshes = keepAll ? skinned : [body];
        const skeleton = body.skeleton;
        if (!skeleton) { console.warn("[PoseStudio] body mesh has no skeleton"); resolve(null); return; }
        const bones = skeleton.bones;
        console.log("%c[PoseStudio] FIGURE GLB URL =", "color:#ffd24a;font-weight:bold", url, "| meshVerts =", body.geometry.attributes.position?.count);
        console.log("[PoseStudio] GLB bones:", bones.map((b) => b.name));
        const joints = buildBoneMap(bones, profile);
        console.log("[PoseStudio] mapped joints:", Object.fromEntries(Object.entries(joints).map(([k, v]) => [k, v.name])));
        const missing = (profile?.joints || CANON_JOINTS).filter((j) => !joints[j]);
        if (missing.length) console.warn("[PoseStudio] unmapped joints (not selectable yet):", missing);

        // Finger/toe bones for hand & foot posing. MakeHuman's Game rig names fingers
        // `<finger>_<NN>_<side>` (e.g. index_03_l) and ONE `ball_<side>` per foot; our
        // build (tools/toe_split.py) splits that ball into `toe<1-5>_<side>`. Underscores
        // survive GLTFLoader's dot-stripping, so match raw.
        const fingers = { wristL: {}, wristR: {} };
        const toes = {};       // ankleL/R → ball bone (whole-foot presets, parent of the toes)
        const toeChains = {};  // ankleL/R → five 2-bone toe digits: [ [toeN_1, toeN_2] × 5 ]
        const fingerRe = /^(thumb|index|middle|ring|pinky)_(\d\d)_(l|r)$/i;
        const toeRe = /^toe(\d)_(\d)_(l|r)$/i; // toe<num>_<segment>_<side>
        const ankleOf = (side) => "ankle" + (side.toLowerCase() === "l" ? "L" : "R");
        const toeByNum = {}; // ankle → { toeNum → { segment → bone } }
        for (const b of bones) {
          const fm = b.name.match(fingerRe);
          if (fm) {
            const wrist = "wrist" + (fm[3].toLowerCase() === "l" ? "L" : "R");
            (fingers[wrist][fm[1].toLowerCase()] ||= []).push(b);
            continue;
          }
          const bm = b.name.match(/^ball_(l|r)$/i);
          if (bm) { toes[ankleOf(bm[1])] = b; continue; }
          const tm = b.name.match(toeRe);
          if (tm) (((toeByNum[ankleOf(tm[3])] ||= {})[+tm[1]] ||= {}))[+tm[2]] = b;
        }
        // Order each finger proximal→distal.
        for (const wrist of ["wristL", "wristR"]) {
          for (const f of Object.keys(fingers[wrist])) {
            fingers[wrist][f].sort((a, b) => a.name.localeCompare(b.name));
          }
        }
        // Assemble toe chains: toes 1→5, each ordered [proximal (seg 1), distal (seg 2)].
        for (const a of Object.keys(toeByNum)) {
          toeChains[a] = Object.keys(toeByNum[a]).sort((x, y) => x - y).map((num) =>
            Object.keys(toeByNum[a][num]).sort((x, y) => x - y).map((s) => toeByNum[a][num][s]));
        }

        // Clean opaque material: imported skin can carry alpha / missing-texture
        // data that renders as holes, and a matte surface reads cleanest through
        // DepthAnything. (Skinning still works — it's independent of material.)
        // Neutral Blender-clay gray with a soft sheen (was a flat warm tan) —
        // paired with the key+fill studio lights where the scene is built.
        for (const m of meshes) {
          disposeMaterial(m.material); // free the original PBR material + textures we're replacing
          m.material = new THREE.MeshStandardMaterial({
            color: 0xc7a892, roughness: 0.78, metalness: 0.0, side: THREE.DoubleSide,
          });
        }

        // Stand upright: FBX→glTF conversions often land the figure lying down,
        // so rotate the longest extent to vertical. Quadruped profiles disable
        // this (a standing horse is LONGER than tall — the heuristic would tip
        // it onto its tail).
        root.updateMatrixWorld(true);
        let box = new THREE.Box3().setFromObject(root);
        let size = box.getSize(new THREE.Vector3());
        if (profile?.uprightHeuristic !== false) {
          if (size.y < size.x && size.x >= size.z) root.rotateZ(Math.PI / 2);
          else if (size.y < size.z && size.z > size.x) root.rotateX(-Math.PI / 2);
          root.updateMatrixWorld(true);
        }

        // Scale to the profile's standing height (human 1.8), ground feet at
        // y=0, center x/z.
        box = new THREE.Box3().setFromObject(root);
        size = box.getSize(new THREE.Vector3());
        if (size.y > 0) root.scale.multiplyScalar((profile?.targetHeight || 1.8) / size.y);
        root.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(root);
        root.position.x -= (box.min.x + box.max.x) / 2;
        root.position.z -= (box.min.z + box.max.z) / 2;
        root.position.y -= box.min.y;

        // Inflate the body's raycast bounding sphere. Mesh.raycast early-rejects rays that
        // miss geometry.boundingSphere, which three computes in the BIND (T) pose — so an
        // extended limb (leg kicked up, arm reaching) lands OUTSIDE it and hovering that
        // limb stops registering, making its handles unselectable. Skinning never moves a
        // joint more than ~a body-length from center, so a 3× radius covers any human pose.
        for (const m of meshes) {
          m.geometry.computeBoundingSphere();
          if (m.geometry.boundingSphere) m.geometry.boundingSphere.radius *= 3;
        }

        const tmp = new THREE.Vector3();
        const jointForHit = (hit) => {
          let best = null, bestD = Infinity;
          for (const b of Object.values(joints)) {
            b.getWorldPosition(tmp);
            const d = tmp.distanceToSquared(hit.point);
            if (d < bestD) { bestD = d; best = b; }
          }
          return best;
        };
        resolve({ root, meshes, joints, jointForHit, fingers, toes, toeChains, isGlb: true });
      },
      undefined,
      (err) => { console.warn("[PoseStudio] GLB load failed:", err); resolve(null); }
    );
  });
}

// Dispose a material AND its textures — Material.dispose() does NOT free the GPU
// textures it references, so a removed figure would otherwise leak every skin/normal/eye
// map. Safe on shared materials only if the caller owns them (we only call it on
// per-figure GLB materials, never the shared prop/handle materials).
function disposeMaterial(m) {
  if (!m) return;
  for (const mat of Array.isArray(m) ? m : [m]) {
    if (!mat) continue;
    for (const k in mat) { const v = mat[k]; if (v && v.isTexture) v.dispose(); }
    mat.dispose?.();
  }
}

function setWidgetValue(node, name, value) {
  const w = node.widgets?.find((x) => x.name === name);
  if (w) w.value = value;
}

// Hide a serializable widget: keep its value (it still serializes into the
// prompt) but give it zero height so the node body is just the viewport.
function hideWidget(node, name) {
  const w = node.widgets?.find((x) => x.name === name);
  if (!w) return;
  w.type = "hidden";
  w.computeSize = () => [0, -4];
}

// A freehand sculpt edit = a sparse per-vertex rest-space displacement (Map<vertexIndex,
// [dx,dy,dz]>). Serialized as parallel idx/d arrays, rounded to 0.01mm to keep the JSON
// small (a breast tweak is a few hundred verts). Indices are GLB/geometry vertex indices,
// so they stay valid as long as the body/prop asset version is unchanged.
function sculptMapToData(m) {
  const idx = [], d = [];
  for (const [vi, dv] of m) { idx.push(vi); d.push(Math.round(dv[0] * 1e5) / 1e5, Math.round(dv[1] * 1e5) / 1e5, Math.round(dv[2] * 1e5) / 1e5); }
  return { idx, d };
}
function sculptDataToMap(data) {
  const m = new Map();
  if (!data || !Array.isArray(data.idx) || !Array.isArray(data.d)) return m;
  for (let j = 0; j < data.idx.length; j++) m.set(data.idx[j], [data.d[j * 3] || 0, data.d[j * 3 + 1] || 0, data.d[j * 3 + 2] || 0]);
  return m;
}

// One figure's full pose: joint rotations, every bone position (fold/Ctrl-move +
// skeletal morphs), finger/toe + spine bones by name, surface morphs, skeletal
// morph amounts, and the figure's world root. Keyed by name so it's forward-
// compatible and rig-shape-agnostic (skeleton vs capsule fallback).
function serializeFigure(rig) {
  const joints = {};
  for (const [name, g] of Object.entries(rig.joints)) joints[name] = g.quaternion.toArray();
  // Toes save as raw quaternions but under a SEPARATE key (`toeQuats`), kept OUT of `digits`:
  // a pre-pivot-fix save stored toe rotations in `digits`, and replaying those on the rebuilt
  // bones crumpled the foot — keeping them out of `digits` lets the loader ignore them while
  // still restoring fingers. Only non-rest toes are written (toe-tip IK pose).
  const toeNameSet = new Set();
  if (rig.toeChains) for (const k of Object.keys(rig.toeChains)) for (const ch of rig.toeChains[k]) for (const b of ch) toeNameSet.add(b.name);
  const digits = {};
  for (const b of digitBones(rig)) if (!toeNameSet.has(b.name)) digits[b.name] = b.quaternion.toArray();
  const toeQuats = {};
  if (rig.toeChains) for (const k of Object.keys(rig.toeChains)) for (const ch of rig.toeChains[k]) for (const b of ch) toeQuats[b.name] = b.quaternion.toArray();
  const spine = {};
  if (rig.spineChain) for (const b of rig.spineChain) spine[b.name] = b.quaternion.toArray();
  const jointPos = {};
  if (rig.skel) for (const b of rig.skel.bones) jointPos[b.name] = b.position.toArray();
  else for (const [name, g] of Object.entries(rig.joints)) jointPos[name] = g.position.toArray();
  const morphs = {};
  const mm = rig.morphMesh;
  if (mm?.morphTargetInfluences) mm.morphTargetInfluences.forEach((v, i) => { if (v) morphs[rig.morphNames[i] ?? i] = v; });
  const skeletalAmount = rig.skeletalAmount ? { ...rig.skeletalAmount } : {};
  const footPins = {}; // planted-foot world anchors (so pinned-feet mode survives reload/undo)
  if (rig.footPins) for (const k of Object.keys(rig.footPins)) if (rig.footPins[k]) footPins[k] = rig.footPins[k].toArray();
  // uid = stable per-figure identity so undo/restore can match poses to the right body
  // even after a middle figure was removed (array-index matching scrambles them).
  // rootQuat = the figure-select gizmo rotates fig.root (the scene wrapper); for GLB
  // rigs joints.root is a separate skeleton bone, so without this the whole-figure
  // rotation is serialized nowhere and lost on reload.
  // name = the user's custom label (absent → consumers default to mannequinN by
  // position). It feeds the server-side region→figure NAME binding, so renamed
  // $blocks keep pointing at the right mask.
  // skinBind = an imported mesh bound to this figure's skeleton (the "make my
  // monster posable" feature): mesh file ref + its placement + the skeleton's
  // BIND pose. Weights recompute deterministically on load, so none serialize.
  // rootScale is LOAD-BEARING for skinBind: the fit scales the skeleton to the
  // model and meshLocal/bindPose are relative to that scale — restoring at the
  // default scale displaced and tore the bound mesh on every reload.
  return { uid: rig.uid, ...(rig.body && rig.body !== "human" ? { body: rig.body } : {}), ...(rig.customName ? { name: rig.customName } : {}), root: rig.root.position.toArray(), rootQuat: rig.root.quaternion.toArray(), rootScale: rig.root.scale.toArray(), joints, jointPos, digits, ...(Object.keys(toeQuats).length ? { toeQuats } : {}), spine, morphs, skeletalAmount, footPins, shoes: rig.shoes ? { style: rig.shoeStyle || "procedural", scope: rig.shoeScope || "pair" } : false, ...(rig.skinBind ? { skinBind: rig.skinBind } : {}), ...(rig.customEngine ? { sliders: { ...rig.customEngine.values } } : {}), ...(rig.sculptMap && rig.sculptMap.size ? { sculpt: sculptMapToData(rig.sculptMap) } : {}) };
}

// Whole-scene state: every figure's pose, which one is active, the camera, and the
// props (props are scene-level, not per figure). version 2 = multi-figure; a
// version-1 (flat single-figure) save still loads — restoreSavedState detects it.
// Project each figure's head ball through the GIVEN camera so the Regional
// Detailer can detail a head the face detector can't see (profile / tilted
// back) and knows which way it's looking. Boxes are normalized 0..1 in the
// output frame; facing = dot(head forward, direction to camera): 1 = straight
// at the camera, 0 = profile, -1 = back of head.
// MUST be called with the exact camera state that renders the control map
// (inside captureBlob, aspect already set) — a separately-cloned camera can
// disagree with the map (orbit damping, mid-settle captures) and emit head
// boxes that don't correspond to the rendered frame at all.
function computeHeadExports(THREE, figures, camera) {
  if (!THREE || !camera) return [];
  const HAIR_INFLATE = 1.6; // rendered hair/headgear overshoots the mannequin skull
  // Both rig types are normalized to ~1.8 world units tall, so the skull is
  // ~0.115 around a point ~0.06 above the head joint — in WORLD units. Never
  // use the bone's own scale/axes: GLB bones carry unit-conversion scales and
  // arbitrary local frames (that bug read every GLB head as "looking away").
  const HEAD_RADIUS = 0.115, HEAD_LIFT = 0.06;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  return (figures || []).map((fig) => {
    const head = fig?.joints?.head;
    if (!head) return { box: null, facing: -1 };
    fig.root.updateMatrixWorld(true);
    // Rest-relative world rotation: restWorld is captured in bind pose (facing
    // +Z) per joint NAME, regardless of the rig's local-axis convention — the
    // same trick the pose mirror uses. delta = now ⊗ rest⁻¹ rotates rest-world
    // directions to their current world directions (root turns included).
    const nowQ = head.getWorldQuaternion(new THREE.Quaternion());
    const restQ = fig.restWorld?.get("head");
    const delta = restQ ? nowQ.clone().multiply(restQ.clone().invert()) : nowQ;
    const center = head.getWorldPosition(new THREE.Vector3())
      .add(new THREE.Vector3(0, HEAD_LIFT, 0).applyQuaternion(delta));
    const ndc = center.clone().project(camera);
    if (ndc.z > 1 || ndc.z < -1) return { box: null, facing: -1 }; // behind/outside the camera
    const r = HEAD_RADIUS * HAIR_INFLATE;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const rx = Math.abs(center.clone().addScaledVector(right, r).project(camera).x - ndc.x) / 2;
    const ry = Math.abs(center.clone().addScaledVector(up, r).project(camera).y - ndc.y) / 2;
    const cx = (ndc.x + 1) / 2, cy = (1 - ndc.y) / 2;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(delta);
    const toCam = camera.position.clone().sub(center).normalize();
    return {
      box: [clamp01(cx - rx), clamp01(cy - ry), clamp01(cx + rx), clamp01(cy + ry)].map((v) => +v.toFixed(4)),
      facing: +forward.dot(toCam).toFixed(3),
    };
  });
}

/* VOXELW-BEGIN — pure (no THREE); the offline harness extracts and runs THIS code against real GLBs */
// Geodesic-voxel skin weights (the Maya "geodesic voxel bind" idea): voxelize
// the mesh into a solid, then per bone run a BFS THROUGH the solid — so the
// distance from a belly vertex to the arm bone is measured up through the
// shoulder, not across the air gap. Straight-line distance (the naive method)
// mutilates bulky bodies exactly because of that gap.
// meshes: [{ pos: Float32Array (world xyz), index: ArrayLike|null }]
// segs:   [{ bone: int, a: [x,y,z], b: [x,y,z] }] world-space bone capsules
// returns [{ sIdx: Uint16Array(n*4), sWgt: Float32Array(n*4) }] per mesh
function voxelSkinWeights(meshes, segs, res = 64) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const m of meshes) {
    const p = m.pos;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i];
      if (p[i + 1] < minY) minY = p[i + 1]; if (p[i + 1] > maxY) maxY = p[i + 1];
      if (p[i + 2] < minZ) minZ = p[i + 2]; if (p[i + 2] > maxZ) maxZ = p[i + 2];
    }
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const h = span / res, pad = 2;
  const nx = Math.ceil((maxX - minX) / h) + pad * 2;
  const ny = Math.ceil((maxY - minY) / h) + pad * 2;
  const nz = Math.ceil((maxZ - minZ) / h) + pad * 2;
  const nvox = nx * ny * nz;
  const vx = (x) => Math.max(0, Math.min(nx - 1, Math.floor((x - minX) / h) + pad));
  const vy = (y) => Math.max(0, Math.min(ny - 1, Math.floor((y - minY) / h) + pad));
  const vz = (z) => Math.max(0, Math.min(nz - 1, Math.floor((z - minZ) / h) + pad));
  const vid = (x, y, z) => (z * ny + y) * nx + x;

  // 1. Occupancy: every vertex + points sampled across each triangle face (a
  //    vertex-only fill leaves holes in big low-poly triangles).
  const occ = new Uint8Array(nvox);
  const mark = (x, y, z) => { occ[vid(vx(x), vy(y), vz(z))] = 1; };
  for (const m of meshes) {
    const p = m.pos, idx = m.index;
    const triCount = idx ? idx.length / 3 : p.length / 9;
    for (let t = 0; t < triCount; t++) {
      const i0 = (idx ? idx[t * 3] : t * 3) * 3;
      const i1 = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3;
      const i2 = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
      const e1 = Math.hypot(p[i1] - p[i0], p[i1 + 1] - p[i0 + 1], p[i1 + 2] - p[i0 + 2]);
      const e2 = Math.hypot(p[i2] - p[i0], p[i2 + 1] - p[i0 + 1], p[i2 + 2] - p[i0 + 2]);
      const steps = Math.min(8, Math.max(1, Math.ceil(Math.max(e1, e2) / h)));
      for (let u = 0; u <= steps; u++) {
        for (let v = 0; v + u <= steps; v++) {
          const a = u / steps, b = v / steps, c = 1 - a - b;
          mark(p[i0] * c + p[i1] * a + p[i2] * b,
               p[i0 + 1] * c + p[i1 + 1] * a + p[i2 + 1] * b,
               p[i0 + 2] * c + p[i1 + 2] * a + p[i2 + 2] * b);
        }
      }
    }
  }

  // 2. Solid = everything NOT reachable from outside through empty voxels
  //    (flood from the padded border) — surface shells AND enclosed interiors.
  const outside = new Uint8Array(nvox);
  const queue = new Int32Array(nvox);
  let qh = 0, qt = 0;
  const pushOut = (x, y, z) => {
    const id = vid(x, y, z);
    if (!outside[id] && !occ[id]) { outside[id] = 1; queue[qt++] = id; }
  };
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) { pushOut(x, y, 0); pushOut(x, y, nz - 1); }
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) { pushOut(x, 0, z); pushOut(x, ny - 1, z); }
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) { pushOut(0, y, z); pushOut(nx - 1, y, z); }
  while (qh < qt) {
    const id = queue[qh++];
    const z = Math.floor(id / (nx * ny)), y = Math.floor((id - z * nx * ny) / nx), x = id - (z * ny + y) * nx;
    if (x > 0) pushOut(x - 1, y, z); if (x < nx - 1) pushOut(x + 1, y, z);
    if (y > 0) pushOut(x, y - 1, z); if (y < ny - 1) pushOut(x, y + 1, z);
    if (z > 0) pushOut(x, y, z - 1); if (z < nz - 1) pushOut(x, y, z + 1);
  }
  const solid = (id) => !outside[id];

  // 3. Per-bone BFS through the solid. Keep the best FOUR bone distances per
  //    voxel (all four skin slots blend — K=2 with a sharp falloff tore at the
  //    chest/shoulder seam under wide poses: adjacent verts flipped owners).
  const D4 = new Uint16Array(nvox * 4).fill(65535);
  const B4 = new Int16Array(nvox * 4).fill(-1);
  const dist = new Uint16Array(nvox);
  const snapToSolid = (x, y, z) => {
    for (let r = 0; r <= 4; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const X = x + dx, Y = y + dy, Z = z + dz;
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const id = vid(X, Y, Z);
        if (solid(id)) return id;
      }
    }
    return -1;
  };
  for (const s of segs) {
    dist.fill(65535);
    qh = 0; qt = 0;
    const segLen = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
    const steps = Math.max(1, Math.ceil(segLen / (h * 0.5)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const id = snapToSolid(vx(s.a[0] + (s.b[0] - s.a[0]) * t), vy(s.a[1] + (s.b[1] - s.a[1]) * t), vz(s.a[2] + (s.b[2] - s.a[2]) * t));
      if (id >= 0 && dist[id] === 65535) { dist[id] = 0; queue[qt++] = id; }
    }
    while (qh < qt) {
      const id = queue[qh++];
      const d = dist[id] + 1;
      const z = Math.floor(id / (nx * ny)), y = Math.floor((id - z * nx * ny) / nx), x = id - (z * ny + y) * nx;
      const tryN = (X, Y, Z) => {
        const n = vid(X, Y, Z);
        if (dist[n] === 65535 && solid(n)) { dist[n] = d; queue[qt++] = n; }
      };
      if (x > 0) tryN(x - 1, y, z); if (x < nx - 1) tryN(x + 1, y, z);
      if (y > 0) tryN(x, y - 1, z); if (y < ny - 1) tryN(x, y + 1, z);
      if (z > 0) tryN(x, y, z - 1); if (z < nz - 1) tryN(x, y, z + 1);
    }
    // Optional segment RADIUS (world units): torso bones are thin lines in the
    // middle of a thick barrel, so a bulky pec sits geodesically closer to the
    // SHOULDER than to the spine and rides the arm (tearing at the sternum).
    // Subtracting the bone's volume radius lets the chest claim its barrel.
    // FLOOR AT 1, never 0: a zero plateau makes the bone TOTALLY dominate
    // everything inside its bubble (1/(0+1)³ = 1 vs neighbors' crumbs) — the
    // chest bubble swallowed the monster's skull and head rotation tore the
    // face at the bubble edge. d≥1 keeps an ordering gradient everywhere.
    const rVox = s.r ? Math.round(s.r / h) : 0;
    for (let id = 0; id < nvox; id++) {
      let d = dist[id];
      if (d === 65535) continue;
      if (rVox) d = Math.max(1, d - rVox);
      const o = id * 4;
      if (d >= D4[o + 3]) continue;
      let k = 3;
      while (k > 0 && d < D4[o + k - 1]) { D4[o + k] = D4[o + k - 1]; B4[o + k] = B4[o + k - 1]; k--; }
      D4[o + k] = d; B4[o + k] = s.bone;
    }
  }

  // 4. Per-vertex weights from the voxel fields (up to 4 bones, gentle 1/(d+1)²
  //    falloff — broad blends, no hard ownership seams); stray vertices
  //    (outside the solid, e.g. floating debris) fall back to straight-line.
  const lineFallback = (x, y, z) => {
    let b0 = segs[0]?.bone ?? 0, d0 = Infinity, b1 = b0, d1 = Infinity;
    for (const s of segs) {
      const abx = s.b[0] - s.a[0], aby = s.b[1] - s.a[1], abz = s.b[2] - s.a[2];
      const apx = x - s.a[0], apy = y - s.a[1], apz = z - s.a[2];
      const ll = abx * abx + aby * aby + abz * abz;
      const t = ll > 1e-12 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / ll)) : 0;
      const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < d0) { b1 = b0; d1 = d0; b0 = s.bone; d0 = d; }
      else if (d < d1) { b1 = s.bone; d1 = d; }
    }
    return [b0, Math.sqrt(d0) / h, b1, Math.sqrt(d1) / h]; // in voxel units, like the BFS
  };
  // TRILINEAR sampling of the distance fields: nearest-voxel weights step at
  // voxel boundaries (adjacent verts jump owners = crumple), and the model's
  // detail-shell mesh hugging the body sampled DIFFERENT voxels than the body
  // beneath it (shell separated into debris when posed). Interpolating the
  // per-bone distances across the 8 surrounding voxels makes the weight field
  // continuous in SPACE — same answer for any mesh at the same spot.
  const sampleBones = (x, y, z, accOut) => {
    const fx = (x - minX) / h + pad - 0.5, fy = (y - minY) / h + pad - 0.5, fz = (z - minZ) / h + pad - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    const tx = fx - x0, ty = fy - y0, tz = fz - z0;
    let total = 0;
    for (let c = 0; c < 8; c++) {
      const X = Math.max(0, Math.min(nx - 1, x0 + (c & 1)));
      const Y = Math.max(0, Math.min(ny - 1, y0 + ((c >> 1) & 1)));
      const Z = Math.max(0, Math.min(nz - 1, z0 + ((c >> 2) & 1)));
      const tw = ((c & 1) ? tx : 1 - tx) * (((c >> 1) & 1) ? ty : 1 - ty) * (((c >> 2) & 1) ? tz : 1 - tz);
      if (tw < 1e-6) continue;
      let id = vid(X, Y, Z);
      if (B4[id * 4] < 0) { // empty corner (outside the solid) — borrow the nearest solid voxel
        const snapped = snapToSolid(X, Y, Z);
        if (snapped < 0 || B4[snapped * 4] < 0) continue;
        id = snapped;
      }
      const o = id * 4;
      for (let k = 0; k < 4; k++) {
        if (B4[o + k] < 0) break;
        const w = tw / Math.pow(D4[o + k] + 1, 3); // ^3: joint blending without arm influence flooding the chest
        accOut.set(B4[o + k], (accOut.get(B4[o + k]) || 0) + w);
      }
      total += tw;
    }
    return total > 0;
  };
  const acc0 = new Map();
  const out = meshes.map((m) => {
    const p = m.pos;
    const n = p.length / 3;
    const sIdx = new Uint16Array(n * 4);
    const sWgt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      acc0.clear();
      let sum = 0;
      if (sampleBones(x, y, z, acc0)) {
        const kept = [...acc0.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        kept.forEach(([bone, wv], k) => { sIdx[i * 4 + k] = bone; sWgt[i * 4 + k] = wv; sum += wv; });
      } else {
        const [b0, d0, b1, d1] = lineFallback(x, y, z);
        sIdx[i * 4] = b0; sWgt[i * 4] = 1 / Math.pow(d0 + 1, 3);
        sIdx[i * 4 + 1] = b1; sWgt[i * 4 + 1] = 1 / Math.pow(d1 + 1, 3);
        sum = sWgt[i * 4] + sWgt[i * 4 + 1];
      }
      if (sum > 0) for (let k = 0; k < 4; k++) sWgt[i * 4 + k] /= sum;
      else sWgt[i * 4] = 1; // pathological — pin to first bone rather than NaN
    }
    return { sIdx, sWgt };
  });

  // 5. WELD + Laplacian weight smoothing (indexed meshes only). Weld first:
  //    glTF duplicates vertices along UV/normal seams — same position, two
  //    records, NOT connected in the index — so they can take different
  //    weights and visibly RIP apart when posed (the clean-edged chest tear).
  //    Coincident verts are unioned into the smoothing adjacency AND forced to
  //    identical weights at the end. Smoothing then mixes 40% of neighbors'
  //    weights per pass so no edge crosses a hard ownership seam.
  out.forEach((w, mi) => {
    const idx = meshes[mi].index;
    if (!idx) return;
    const p = meshes[mi].pos;
    const n = w.sWgt.length / 4;
    // Weld groups by quantized position.
    const groupOf = new Int32Array(n).fill(-1);
    const groups = [];
    {
      const seen = new Map();
      const q = h * 1e-3; // far below voxel scale — only true duplicates weld
      for (let i = 0; i < n; i++) {
        const key = `${Math.round(p[i * 3] / q)},${Math.round(p[i * 3 + 1] / q)},${Math.round(p[i * 3 + 2] / q)}`;
        let g = seen.get(key);
        if (g == null) { g = groups.length; groups.push([]); seen.set(key, g); }
        groupOf[i] = g;
        groups[g].push(i);
      }
    }
    const deg = new Uint16Array(n);
    for (let t = 0; t < idx.length; t += 3) {
      deg[idx[t]] += 2; deg[idx[t + 1]] += 2; deg[idx[t + 2]] += 2;
    }
    const off = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
    const nbr = new Uint32Array(off[n]);
    const cur = new Uint32Array(n);
    const addEdge = (a, b) => { nbr[off[a] + cur[a]++] = b; nbr[off[b] + cur[b]++] = a; };
    for (let t = 0; t < idx.length; t += 3) {
      addEdge(idx[t], idx[t + 1]); addEdge(idx[t + 1], idx[t + 2]); addEdge(idx[t + 2], idx[t]);
    }
    let sI = w.sIdx, sW = w.sWgt;
    const weld = () => { // every weld group shares its averaged weights
      for (const g of groups) {
        if (g.length < 2) continue;
        const acc = new Map();
        for (const i of g) for (let k = 0; k < 4; k++) if (sW[i * 4 + k] > 0) acc.set(sI[i * 4 + k], (acc.get(sI[i * 4 + k]) || 0) + sW[i * 4 + k]);
        const kept = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        let sum = 0;
        for (const [, wv] of kept) sum += wv;
        for (const i of g) kept.forEach(([bone, wv], k) => { sI[i * 4 + k] = bone; sW[i * 4 + k] = wv / sum; });
      }
    };
    weld();
    for (let pass = 0; pass < 2; pass++) {
      const nI = new Uint16Array(n * 4), nW = new Float32Array(n * 4);
      const acc = new Map();
      for (let i = 0; i < n; i++) {
        acc.clear();
        for (let k = 0; k < 4; k++) if (sW[i * 4 + k] > 0) acc.set(sI[i * 4 + k], (acc.get(sI[i * 4 + k]) || 0) + sW[i * 4 + k] * 0.6);
        const nb = deg[i];
        if (nb) {
          const share = 0.4 / nb;
          for (let e = off[i]; e < off[i] + nb; e++) {
            const j = nbr[e];
            for (let k = 0; k < 4; k++) if (sW[j * 4 + k] > 0) acc.set(sI[j * 4 + k], (acc.get(sI[j * 4 + k]) || 0) + sW[j * 4 + k] * share);
          }
        }
        // keep the 4 heaviest, renormalize
        let kept = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        let sum = 0;
        for (const [, wv] of kept) sum += wv;
        kept.forEach(([bone, wv], k) => { nI[i * 4 + k] = bone; nW[i * 4 + k] = wv / sum; });
      }
      sI = nI; sW = nW;
      weld(); // re-weld after each pass — smoothing pulls seam twins apart again
    }
    w.sIdx = sI; w.sWgt = sW;
  });
  return out;
}
/* VOXELW-END */

function serializePose(node) {
  const ps = node._pcrPose;
  if (!ps) return {};
  const figs = ps.figures || [];
  return {
    version: 3,
    camera: {
      position: ps.camera.position.toArray(),
      target: ps.controls.target.toArray(),
    },
    activeIndex: Math.max(0, figs.indexOf(ps.rig)),
    figures: figs.map(serializeFigure),
    props: ps.propsApi ? ps.propsApi.serialize() : [],
    attachments: ps.attachApi ? ps.attachApi.serialize() : [],
    // Computed during the control-map render (captureBlob) with that exact
    // camera — never recomputed here, so heads always match the rendered map.
    heads: node._pcrHeads || [],
    // Region entities in EXACT mask-row order (figures, then named props),
    // stamped by captureRegionMasks — the server binds $blocks to mask rows
    // through this list. Empty = no regional masks (server derives figures-only,
    // the v2 behavior). Never derived here: capture skips load-failed prop
    // placeholders that a name-walk would count, which would shift every row.
    regionEntities: node._pcrRegionEntities || [],
  };
}

// Render the current frame, upload it as this node's control map, and stash the
// resulting filename + pose state on the hidden widgets. Coalesced so rapid
// interaction-ends don't stack uploads.
// Regional conditioning: when this Poser's MASKS feed a PromptChain_AttentionCouple
// node, keep the bound PromptChain prompt stocked with one $mannequinN{} block per
// figure. Add-only — deleting a figure leaves its block (so typed tags survive; the
// couple node harmlessly clamps an unbound index). Idempotent, so ordinary posing
// never rewrites the editor; only spawning a new figure injects. Gated by the
// MASKS->couple trace below, so non-regional Posers are a no-op regardless of count.
// Trace this Poser's MASKS -> AttentionCouple -> its regions input -> PromptChain.
// Returns {} when the Poser isn't wired regionally.
function traceRegionalNodes(node) {
  const graph = app.graph;
  if (!graph) return {};
  const maskOut = node.outputs?.find((o) => o.name === "MASKS");
  if (!maskOut?.links?.length) return {};
  for (const linkId of maskOut.links) {
    // graph.links is a Map in some ComfyUI builds and a plain object in others —
    // getLink handles both (a bare graph.links[id] silently fails on the Map).
    const link = getLink(graph, linkId);
    const couple = link && graph.getNodeById(link.target_id);
    if (couple?.comfyClass !== "PromptChain_AttentionCouple") continue;
    const regIn = couple.inputs?.find((i) => i.name === "regions");
    const rlink = regIn?.link != null ? getLink(graph, regIn.link) : null;
    const pc = rlink && graph.getNodeById(rlink.origin_id);
    if (pc?.comfyClass === "PromptChain_PromptChain") return { couple, pc };
  }
  return {};
}

function reconcileRegionBlocks(node, names) {
  if (!names?.length) return;
  const { pc } = traceRegionalNodes(node);
  if (!pc?._pcrEditor) return;

  const text = pc._pcrEditor.state.doc.toString();
  // Ghost guard: this sync is keyed by each figure's CURRENT name and has no
  // memory, so whenever a name and its block drift (manual block rename, undo
  // reverting a rename, old saves without names) a naive "name missing → add"
  // re-seeds default-named ghost blocks next to the user's real ones. Only seed
  // while the doc has fewer region blocks than figures — equal counts mean the
  // user is managing the blocks — and spend the budget on the NEWEST figures
  // (a fresh spawn is what actually needs seeding).
  let budget = names.length - (text.match(/\$\w+\s*\{/g) || []).length;
  if (budget <= 0) return;
  const missing = [];
  for (let i = names.length - 1; i >= 0 && budget > 0; i--) {
    // Case-insensitive to match the server-side name binding (it lower-cases both).
    if (new RegExp("\\$" + names[i] + "\\s*\\{", "i").test(text)) continue;
    missing.unshift(names[i]);
    budget--;
  }
  if (!missing.length) return;
  const blocks = missing.map((name) => "$" + name + " {\n\n}").join("\n\n");
  // Insert ABOVE the negative section — blind appending dropped the new block
  // inside the negative prompt whenever the doc had a "Negative Prompt:" marker.
  // Same marker regex the compiler splits on.
  const neg = text.match(/negative\s+prompt\s*:/i);
  if (neg) {
    const head = text.slice(0, neg.index);
    setEditorContent(pc._pcrEditor,
      (head.trim() ? head.replace(/\s*$/, "\n\n") : "") + blocks + "\n\n" + text.slice(neg.index));
  } else {
    setEditorContent(pc._pcrEditor, text + (text.trim() ? "\n\n" : "") + blocks);
  }
}

// Rewrite every `$oldName {` block in the bound prompt to the figure's new name,
// so the user's typed tags travel with the rename. If no block exists yet,
// reconcileRegionBlocks adds the new-name block on the next capture.
function renameRegionBlock(node, oldName, newName) {
  const { pc } = traceRegionalNodes(node);
  if (!pc?._pcrEditor) return;
  const text = pc._pcrEditor.state.doc.toString();
  const re = new RegExp("\\$" + oldName + "(\\s*\\{)", "gi");
  if (!re.test(text)) return;
  re.lastIndex = 0;
  setEditorContent(pc._pcrEditor, text.replace(re, (m, brace) => "$" + newName + brace));
}

// ── Text → Poser region-name sync (the reverse of renameRegionBlock) ─────────
// renameRegionBlock pushes a Poser-side rename INTO the prompt; this brings a
// prompt-side rename BACK to the figure. Renaming `$mannequin1 {` → `$alice {`
// in the bound PromptChain editor renames mannequin 1 in the viewport. The
// editor has no figure identity in it (only names, in order), so we act ONLY on
// an unambiguous single in-place rename and debounce (the editor fires per
// keystroke) so half-typed names never touch figure state. Add/delete edits are
// left to the forward reconcile; invalid/duplicate names are rejected by the
// same gate the inline rename uses (renameEntityByName on _pcrPose).
const REGION_BLOCK_NAME_RE = /\$([A-Za-z_]\w*)\s*\{/g;
function regionBlockNames(text) {
  const out = [];
  REGION_BLOCK_NAME_RE.lastIndex = 0;
  let m;
  while ((m = REGION_BLOCK_NAME_RE.exec(text)) !== null) out.push(m[1]);
  return out;
}
// One block renamed in place → {from,to}; otherwise null. Differing counts mean
// an add/delete (the reconcile's job); more than one change means an ambiguous
// paste we can't map without identity. Case-sensitive so a case-only edit still
// propagates (binding itself stays case-insensitive).
function singleBlockRename(prev, cur) {
  if (prev.length !== cur.length) return null;
  let hit = null;
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] === prev[i]) continue;
    if (hit) return null;
    hit = { from: prev[i], to: cur[i] };
  }
  return hit;
}
function syncRegionRenamesFromText(pc) {
  if (!pc?._pcrEditor) return;
  const cur = regionBlockNames(pc._pcrEditor.state.doc.toString());
  const prev = pc._pcrLastBlockNames;
  pc._pcrLastBlockNames = cur; // advance the baseline every run, applied or not
  if (!prev) return;           // first observation — nothing to diff against
  const ren = singleBlockRename(prev, cur);
  if (!ren || !ren.to) return;
  // The Poser bound to THIS prompt (MASKS→couple→regions→pc). Found live so it
  // stays correct across rewiring/teardown; a torn-down Poser left the registry.
  const poser = poseRegistry.all().find((p) => p._pcrAlive && traceRegionalNodes(p).pc === pc);
  poser?._pcrPose?.renameEntityByName?.(ren.from, ren.to);
}
// Attach the debounced observer to the bound prompt's editor, once per editor
// instance (re-attaches if the node rebuilds its editor on reload). Called from
// the same spots as the forward sync, so it's live the moment a Poser is wired
// regionally. No-op when this Poser doesn't feed an AttentionCouple.
function ensureReverseRegionSync(node) {
  const { pc } = traceRegionalNodes(node);
  if (!pc?._pcrEditor) return;
  if (pc._pcrRegionSyncView === pc._pcrEditor) return; // already observing this view
  pc._pcrRegionSyncView = pc._pcrEditor;
  pc._pcrLastBlockNames = regionBlockNames(pc._pcrEditor.state.doc.toString());
  attachDocChangeListener(pc._pcrEditor, () => {
    clearTimeout(pc._pcrRegionSyncTimer);
    pc._pcrRegionSyncTimer = setTimeout(() => syncRegionRenamesFromText(pc), 400);
  });
}

// Custom names bind region→figure by NAME on the server, which needs the figure
// list — wire POSE_JSON into the couple's pose input if it isn't already. Old
// couple defs (page loaded before the backend gained 'pose') just skip; default
// mannequinN names still bind positionally without the wire.
function ensureCouplePoseWire(node) {
  const { couple } = traceRegionalNodes(node);
  if (!couple) return;
  const poseIn = couple.inputs?.findIndex((i) => i.name === "pose");
  if (poseIn == null || poseIn < 0 || couple.inputs[poseIn].link != null) return;
  const poseOut = node.outputs?.findIndex((o) => o.name === "POSE_JSON");
  if (poseOut >= 0) node.connect(poseOut, couple, poseIn);
}

// Content id for a capture set (control map + masks), salted with the node id.
// The salt keeps two posers in one graph from sharing filenames — sharing would
// let one poser's superseded-set delete orphan the other's live reference.
// crypto.subtle needs a secure context (https/localhost); plain-http LAN access
// gets a dual-FNV fallback — it only has to separate scenes, not resist attack.
async function hashCaptureSet(node, mapBlob, maskCaptures) {
  const buffers = [await mapBlob.arrayBuffer()];
  for (const m of maskCaptures) buffers.push(await m.blob.arrayBuffer());
  buffers.push(new TextEncoder().encode(String(node.id)).buffer);
  const bytes = new Uint8Array(buffers.reduce((n, b) => n + b.byteLength, 0));
  let offset = 0;
  for (const b of buffers) { bytes.set(new Uint8Array(b), offset); offset += b.byteLength; }
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest, 0, 6)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  let h1 = 0x811c9dc5, h2 = 0x6c62272e;
  for (const b of bytes) {
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ b, 0x01000193) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
}

async function uploadPoseFile(blob, filename) {
  const form = new FormData();
  form.append("image", new File([blob], filename, { type: "image/png" }));
  form.append("subfolder", "promptchain_pose");
  form.append("type", "input");
  form.append("overwrite", "true");
  const resp = await api.fetchApi("/upload/image", { method: "POST", body: form });
  return resp.json();
}

// Remove the capture set a new upload superseded. Only content-addressed bases
// are deletable — legacy node-id names are shared across workflows, and the
// server enforces the same pattern. Fire-and-forget: a missed delete is just a
// file the age sweep collects later.
function deleteSupersededSet(previousRef, newBase) {
  const prevName = previousRef?.split("/").pop()?.replace(/ \[\w+\]$/, "") || "";
  const prevBase = prevName.endsWith(".png") ? prevName.slice(0, -4) : null;
  if (!prevBase || prevBase === newBase || !/^promptchain_pose_[0-9a-f]{12}$/.test(prevBase)) return;
  api.fetchApi("/promptchain/pose-files/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base: prevBase }),
  }).catch((e) => console.warn("[PoseStudio] superseded-set delete failed", e));
}

async function captureAndUpload(node) {
  const ps = node._pcrPose;
  if (!ps || !node._pcrAlive) return; // bail if torn down (renderer may be disposed)
  // Persist scene state SYNCHRONOUSLY, every call, decoupled from the async image
  // upload below. pose_state is pure scene data and must always reflect the latest
  // scene — gating it behind the (coalesced, awaited) upload meant a save during an
  // in-flight upload wrote stale state, silently dropping figures/props the user had
  // just added. The control-map image can lag; the saved scene must not.
  setWidgetValue(node, "pose_state", JSON.stringify(serializePose(node)));
  ps.recordHistory?.(); // snapshot the pose for undo/redo (dedupes; skipped during undo)
  if (ps.uploading) { ps.uploadPending = true; return; }
  ps.uploading = true;
  try {
    const blob = ps.captureBlob
      ? await ps.captureBlob()
      : await new Promise((res) => ps.renderer.domElement.toBlob(res, "image/png"));
    if (blob) {
      // Masks are captured BEFORE any upload so the whole set shares one
      // content hash. Content-addressed names make a filename pin exactly its
      // own scene's pixels: two workflows whose posers share a node id used to
      // overwrite each other's promptchain_pose_<id>.png and silently render
      // with the other scene's map.
      const maskCaptures = ps.captureRegionMasks ? await ps.captureRegionMasks() : [];
      const base = `promptchain_pose_${await hashCaptureSet(node, blob, maskCaptures)}`;
      const previousRef = node.widgets?.find((w) => w.name === "control_map")?.value;
      const data = await uploadPoseFile(blob, `${base}.png`);
      let ref = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
      if (data.type && data.type !== "input") ref += ` [${data.type}]`;
      // Export one region mask per figure (for regional conditioning). Files
      // only — no new output sockets, so saved graphs are unaffected. The
      // server finds them beside the map as <map-base>_mask<i>.png.
      for (const m of maskCaptures) {
        await uploadPoseFile(m.blob, `${base}_mask${m.index}.png`);
      }
      setWidgetValue(node, "control_map", ref); // pose_state already persisted at the top
      // Re-persist pose_state now that captureBlob refreshed the head boxes
      // (the synchronous write at the top carried the previous capture's).
      setWidgetValue(node, "pose_state", JSON.stringify(serializePose(node)));
      deleteSupersededSet(previousRef, base);
      // Background upscale's queue gate listens for this: a complete capture
      // set (map + masks) for this node's current scene is now on the server.
      ps.uploadedOnce = true;
      window.dispatchEvent(new CustomEvent("promptchain:pose-uploaded", { detail: { nodeId: node.id } }));
    }
    // Regional: keep the bound PromptChain prompt's $name{} blocks in sync
    // with the region entities — figures AND named props (add-only). No-op
    // unless this Poser feeds an AttentionCouple.
    reconcileRegionBlocks(node, ps.entityNames ? ps.entityNames() : effectiveFigureNames(ps.figures));
    ensureReverseRegionSync(node); // and watch the prompt for $name{} renames typed back the other way
  } catch (e) {
    console.error("[PoseStudio] control-map upload failed", e);
  } finally {
    ps.uploading = false;
    if (ps.uploadPending) { ps.uploadPending = false; captureAndUpload(node); }
  }
}

// ── auto-sync to the generation latent ──────────────────────────────────────
// Trace the graph downstream to the sampler, back up its latent input to the
// node that defines the generation resolution (EmptyLatentImage et al.), and
// adopt its width/height so the control map always matches the output frame.
const SAMPLER_TYPES = new Set([
  "KSampler", "KSamplerAdvanced", "SamplerCustom", "SamplerCustomAdvanced",
  "PromptChain_RegionalDetailer", "UltimateSDUpscale",
]);
// Nodes that actually DEFINE the generation resolution — preferred when the upstream
// sweep would otherwise latch onto some unrelated node that happens to carry width/height.
const LATENT_RES_TYPES = new Set([
  "EmptyLatentImage", "EmptySD3LatentImage", "EmptyHunyuanLatentVideo",
  "SDXLEmptyLatentSizePicker", "EmptyImage", "EmptyMochiLatentVideo", "EmptyLTXVLatentVideo",
]);

function linkOf(graph, id) {
  return graph?.links?.get?.(id) || graph?.links?.[id] || null;
}

function findDownstreamSampler(start, graph) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    for (const out of n.outputs || []) {
      for (const lid of out.links || []) {
        const l = linkOf(graph, lid);
        if (!l) continue;
        const t = graph.getNodeById(l.target_id);
        if (!t) continue;
        if (SAMPLER_TYPES.has(t.comfyClass || t.type)) return t;
        queue.push(t);
      }
    }
  }
  return null;
}

// BFS upstream for the node defining the generation resolution. A real latent-size node
// (EmptyLatentImage et al.) wins immediately; otherwise fall back to the first node that
// merely carries numeric width/height (which may be an unrelated loader/resize node).
function findResUpstream(start, graph) {
  const seen = new Set();
  const queue = [start];
  let fallback = null;
  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    if ((n.comfyClass || n.type) !== NODE_TYPE) {
      const w = n.widgets?.find((x) => x.name === "width");
      const h = n.widgets?.find((x) => x.name === "height");
      if (w && h && typeof w.value === "number" && typeof h.value === "number") {
        const res = { width: Math.round(w.value), height: Math.round(h.value), node: n };
        if (LATENT_RES_TYPES.has(n.comfyClass || n.type)) return res; // a true latent-size node wins
        if (!fallback) fallback = res; // remember the first generic w/h node
      }
    }
    for (const inp of n.inputs || []) {
      if (inp.link == null) continue;
      const l = linkOf(graph, inp.link);
      const s = l && graph.getNodeById(l.origin_id);
      if (s) queue.push(s);
    }
  }
  return fallback;
}

function findLatentResolution(node) {
  const graph = app.graph;
  if (!graph) return null;
  const sampler = findDownstreamSampler(node, graph);
  if (!sampler) return null;
  // Prefer the sampler's latent input; fall back to a full upstream sweep.
  const latentInput = (sampler.inputs || []).find((i) => /latent|samples/i.test(i.name) && i.link != null);
  let start = sampler;
  if (latentInput) {
    const l = linkOf(graph, latentInput.link);
    const src = l && graph.getNodeById(l.origin_id);
    if (src) start = src;
  }
  return findResUpstream(start, graph);
}

// Live follow: once a poser has resolved its latent-size node, hook that
// node's width/height widget callbacks so EDITING THE LATENT pushes the new
// resolution back into every connected poser — event-driven, no polling.
// Each poser re-traces its own chain on notify, so a poser fed by a different
// latent ignores the change; the hook outliving its posers is a harmless
// no-op (the registry is empty). Rewiring to a NEW latent node is covered by
// the existing triggers (mount / the poser's own connection changes / ⟳),
// which hook the new node on their next sync.
function hookLatentResWidgets(resNode) {
  for (const name of ["width", "height"]) {
    const w = resNode.widgets?.find((x) => x.name === name);
    if (!w || w._pcrPoseResHooked) continue;
    w._pcrPoseResHooked = true;
    const orig = w.callback;
    w.callback = function (...args) {
      const r = orig?.apply(this, args);
      requestAnimationFrame(() => {
        for (const p of poseRegistry.all()) if (p._pcrAlive) syncToLatent(p);
      });
      return r;
    };
  }
}

// Returns "matched" | "unchanged" | "not-found".
function syncToLatent(node) {
  const res = findLatentResolution(node);
  if (!res) return "not-found";
  if (res.node) hookLatentResWidgets(res.node); // future latent edits flow back automatically
  const wW = node.widgets?.find((w) => w.name === "width");
  const hW = node.widgets?.find((w) => w.name === "height");
  if (!wW || !hW) return "not-found";
  if (wW.value === res.width && hW.value === res.height) return "unchanged";
  wW.value = res.width;
  hW.value = res.height;
  // Fire ONE wrapped widget callback (setup wraps both with fitCanvas +
  // render + capture): setting .value alone left the viewport letterboxed at
  // the OLD aspect until the next container resize. Both values are already
  // set, so a single callback re-fits with the full new resolution.
  if (hW.callback) hW.callback(res.height);
  else { node._pcrPose?.requestRender?.(); captureAndUpload(node); }
  node.setDirtyCanvas?.(true, true);
  return "matched";
}

// Apply one figure's serialized pose (joint rotations + positions, digits, spine,
// whole-figure root, morphs) to its rig. Camera and props are scene-level and
// handled by the caller (restoreSavedState/applyHistory), not here. Every field is
// optional so older saves load cleanly; unknown joints are skipped.
function applyFigureData(rig, data) {
  if (!rig || !data) return;
  if (data.joints) for (const [name, q] of Object.entries(data.joints)) {
    const b = rig.joints[name];
    if (b && Array.isArray(q) && q.length === 4) b.quaternion.fromArray(q);
  }
  if (data.jointPos) {
    // Pre-spine_04 saves (no spine_04 key) stored neck/clavicle LOCAL positions
    // relative to the old undivided spine_03; restoring them onto the subdivided
    // rig would shove the neck up by the split distance. Skip those three — the
    // new rest is correct (only a rare Ctrl-moved neck/clavicle loses anything).
    const preSubdivSave = rig.boneByName?.has("spine_04") && !data.jointPos.spine_04;
    for (const [name, p] of Object.entries(data.jointPos)) {
      if (preSubdivSave && (name === "neck_01" || name === "clavicle_l" || name === "clavicle_r")) continue;
      // Saved by bone name (all skeleton bones) for morph rigs; by canonical joint
      // name for the capsule fallback. Try both maps.
      const b = rig.boneByName?.get(name) || rig.joints[name];
      if (b && Array.isArray(p) && p.length === 3) b.position.fromArray(p);
    }
  }
  // Toe bones restore from `toeQuats` (a separate key), NOT raw `digits`: skip any toe entry
  // in digits so a pre-2-bone save's stale toe quaternion can't crumple the rebuilt foot.
  const toeNameSet = new Set();
  if (rig.toeChains) for (const k of Object.keys(rig.toeChains)) for (const ch of rig.toeChains[k]) for (const b of ch) toeNameSet.add(b.name);
  if (data.digits) {
    const byName = {};
    for (const b of digitBones(rig)) byName[b.name] = b;
    for (const [name, q] of Object.entries(data.digits))
      if (byName[name] && !toeNameSet.has(name) && Array.isArray(q) && q.length === 4) byName[name].quaternion.fromArray(q);
  }
  // Toes (2-bone digits): reset every toe to its captured rest, then apply `toeQuats` if present.
  // Old/incompatible saves carry no toeQuats → toes land at a clean rest instead of crumpled.
  if (rig.toeChains && rig.toeRest) {
    const byName = {};
    for (const k of Object.keys(rig.toeChains)) for (const ch of rig.toeChains[k]) for (const b of ch) {
      const r = rig.toeRest.get(b); if (r) b.quaternion.copy(r);
      byName[b.name] = b;
    }
    if (data.toeQuats) for (const [name, q] of Object.entries(data.toeQuats))
      if (byName[name] && Array.isArray(q) && q.length === 4) byName[name].quaternion.fromArray(q);
  }
  if (data.spine && rig.spineChain) {
    const byName = {};
    for (const b of rig.spineChain) byName[b.name] = b;
    for (const [name, q] of Object.entries(data.spine))
      if (byName[name] && Array.isArray(q) && q.length === 4) byName[name].quaternion.fromArray(q);
  }
  if (Array.isArray(data.root) && rig.root) rig.root.position.fromArray(data.root);
  // Whole-figure rotation (fig.root wrapper). Older saves lack it → leave identity.
  if (Array.isArray(data.rootQuat) && rig.root) rig.root.quaternion.fromArray(data.rootQuat);
  // Whole-figure scale — set by the skeleton-fit (sized to the bound model).
  // Older saves lack it → keep the spawn's own auto-fit scale untouched.
  if (Array.isArray(data.rootScale) && rig.root) rig.root.scale.fromArray(data.rootScale);
  if (data.morphs && rig.morphMesh?.morphTargetInfluences) {
    rig.morphMesh.morphTargetInfluences.fill(0); // unsaved morphs → neutral, not stale
    for (const [name, v] of Object.entries(data.morphs)) {
      const i = rig.morphIndex[name];
      if (i != null && Number.isFinite(v)) rig.morphMesh.morphTargetInfluences[i] = v;
    }
  }
  if (rig.skeletalAmount) rig.skeletalAmount = { ...(data.skeletalAmount || {}) };
  rig.customName = (typeof data.name === "string" && data.name.trim()) ? data.name.trim() : null;
  rig.skinBind = data.skinBind || null; // materialized by syncSkinBinds (async mesh load)
}

// Display/binding name per figure: the custom name, else positional mannequinN.
function effectiveFigureNames(figs) {
  return (figs || []).map((f, i) => f.customName || "mannequin" + (i + 1));
}

// ── inverse kinematics ──────────────────────────────────────────────────────
// Each limb is a 2-bone chain (root→mid→tip) the user can pose by dragging the
// tip. The pole hint is a WORLD direction (the figure faces +Z) used only to pick
// a bend side when the limb starts dead-straight; otherwise the current bend
// plane is preserved so dragging never flips the elbow/knee.
const IK_LIMBS = [
  { tip: "wristL", chain: ["shoulderL", "elbowL", "wristL"], pole: [0, -0.5, -1] },
  { tip: "wristR", chain: ["shoulderR", "elbowR", "wristR"], pole: [0, -0.5, -1] },
  { tip: "ankleL", chain: ["hipL", "kneeL", "ankleL"], pole: [0, -0.2, 1] },
  { tip: "ankleR", chain: ["hipR", "kneeR", "ankleR"], pole: [0, -0.2, 1] },
];

// Anatomical elbow/knee bend range. Enforced by clamping the IK reach (below) so
// the interior angle never leaves this band: HINGE_MAX < 180° means the limb can't
// straighten fully (so it can't hyperextend / cross to a backward bend, and the
// bend plane never degenerates → no flips); HINGE_MIN stops it folding through itself.
const HINGE_MIN = 0.18;             // ~10°
const HINGE_MAX = Math.PI * 0.96;   // ~173°
// Max bend between consecutive spine segments (head-IK FABRIK) — keeps the spine a
// smooth curve instead of a crumple/kink. The base segment is left unconstrained so
// the whole spine can still bow/lean freely.
// 50°/vertebra × 4 bending joints (spine_01..03 + neck) = a full 200° inward
// roll — 30° capped the whole spine at 120°, which couldn't tuck the head
// ("body is incapable of a full inward curl"). Skin verified smooth at 50°
// (_headless/curl.mjs screenshots); IK below the cap is unchanged.
const MAX_SPINE_JOINT_BEND = (50 * Math.PI) / 180;

// ── rig profiles ────────────────────────────────────────────────────────────
// One entry per rig KIND. The posing toolkit (joint handles, two-bone IK,
// mirror, planted-limb pins, skeleton-bind capsules) reads the ACTIVE figure's
// profile instead of human-only module constants, so a non-human rig (horse,
// cat…) declares its own joint vocabulary and chains. `human` is exactly the
// historical constants; figures resolve their profile at spawn from
// FIGURE_LIBRARY[body].rig (absent = human, so old saves are untouched).
// Non-biped profiles must supply an explicit `boneMap` (bone name → canonical
// joint, authored per rig) — the heuristic classifiers below are biped-only
// and silently drop quadruped bones.
// Mirror pairs: L↔R joint names swapped across the sagittal plane.
const MIRROR_PAIRS = [
  ["shoulderL", "shoulderR"], ["elbowL", "elbowR"], ["wristL", "wristR"],
  ["hipL", "hipR"], ["kneeL", "kneeR"], ["ankleL", "ankleR"],
];
// Limb chains for "mirror just the selected limb" (base names; L/R appended).
const LIMB_MIRROR_SETS = [["shoulder", "elbow", "wrist"], ["hip", "knee", "ankle"]];
// Skeleton-bind capsules: canonical joint pairs spanning each body segment, and
// tip stubs that extend INTO the head/hands/feet so those verts don't grab the
// parent limb.
const SKIN_SEGMENTS = [
  ["root", "spine"], ["spine", "chest"], ["chest", "neck"], ["neck", "head"],
  ["shoulderL", "elbowL"], ["elbowL", "wristL"],
  ["shoulderR", "elbowR"], ["elbowR", "wristR"],
  ["hipL", "kneeL"], ["kneeL", "ankleL"],
  ["hipR", "kneeR"], ["kneeR", "ankleR"],
];
const SKIN_STUBS = [
  ["head", "neck", 0.9], ["wristL", "elbowL", 0.45], ["wristR", "elbowR", 0.45],
  ["ankleL", "kneeL", 0.35], ["ankleR", "kneeR", 0.35],
];
const RIG_PROFILES = {
  human: {
    joints: CANON_JOINTS,
    ikLimbs: IK_LIMBS,
    mirrorPairs: MIRROR_PAIRS,
    limbMirrorSets: LIMB_MIRROR_SETS,
    plantedTips: ["ankleL", "ankleR"], // feet pinned to the floor while the body moves
    skinSegments: SKIN_SEGMENTS,
    skinStubs: SKIN_STUBS,
    boneMap: null, // null = heuristic biped classifiers
  },
  // Quadruped: authored for the bundled CC-BY horse (MAXDESIGN-3D, Sketchfab —
  // see js/assets/props/CREDITS.txt). Vocabulary mirrors the human pattern with
  // front/hind legs; chain tips are the fetlocks (Hand/Foot bones) so planted
  // hooves pin where the leg meets the ground. Scapula/shoulder, hooves, and
  // tail are FK posture bones. Head-drag spine FABRIK falls out of the generic
  // head→pelvis chain walk (spine + neck bones).
  horse: {
    joints: [
      "root", "spine", "back", "chest", "neck", "head", "tail", "tailMid",
      "frontShoulderL", "frontHipL", "frontKneeL", "frontAnkleL", "frontHoofL",
      "frontShoulderR", "frontHipR", "frontKneeR", "frontAnkleR", "frontHoofR",
      "hindHipL", "hindKneeL", "hindAnkleL", "hindHoofL",
      "hindHipR", "hindKneeR", "hindAnkleR", "hindHoofR",
    ],
    ikLimbs: [
      { tip: "frontAnkleL", chain: ["frontHipL", "frontKneeL", "frontAnkleL"], pole: [0, -0.3, 1] },
      { tip: "frontAnkleR", chain: ["frontHipR", "frontKneeR", "frontAnkleR"], pole: [0, -0.3, 1] },
      { tip: "hindAnkleL", chain: ["hindHipL", "hindKneeL", "hindAnkleL"], pole: [0, -0.3, 1] },
      { tip: "hindAnkleR", chain: ["hindHipR", "hindKneeR", "hindAnkleR"], pole: [0, -0.3, 1] },
      // A horse hind leg has THREE long segments (femur/tibia/cannon) — one
      // two-bone chain can't span it, so the chain above tips at the HOCK and
      // the lower leg hung FK-only. Second chain on the lower leg: the hoof
      // gets its own IK diamond solving tibia+cannon about the hock; the hock
      // diamond above keeps driving femur+tibia from the hip.
      { tip: "hindHoofL", chain: ["hindKneeL", "hindAnkleL", "hindHoofL"], pole: [0, -0.2, -1] },
      { tip: "hindHoofR", chain: ["hindKneeR", "hindAnkleR", "hindHoofR"], pole: [0, -0.2, -1] },
    ],
    mirrorPairs: [
      ["frontShoulderL", "frontShoulderR"], ["frontHipL", "frontHipR"], ["frontKneeL", "frontKneeR"],
      ["frontAnkleL", "frontAnkleR"], ["frontHoofL", "frontHoofR"],
      ["hindHipL", "hindHipR"], ["hindKneeL", "hindKneeR"], ["hindAnkleL", "hindAnkleR"], ["hindHoofL", "hindHoofR"],
    ],
    limbMirrorSets: [["frontHip", "frontKnee", "frontAnkle", "frontHoof"], ["hindHip", "hindKnee", "hindAnkle", "hindHoof"]],
    plantedTips: ["frontAnkleL", "frontAnkleR", "hindAnkleL", "hindAnkleR"],
    skinSegments: [
      ["root", "spine"], ["spine", "chest"], ["chest", "neck"], ["neck", "head"],
      ["frontHipL", "frontKneeL"], ["frontKneeL", "frontAnkleL"],
      ["frontHipR", "frontKneeR"], ["frontKneeR", "frontAnkleR"],
      ["hindHipL", "hindKneeL"], ["hindKneeL", "hindAnkleL"],
      ["hindHipR", "hindKneeR"], ["hindKneeR", "hindAnkleR"],
    ],
    skinStubs: [
      ["head", "neck", 0.9],
      ["frontAnkleL", "frontKneeL", 0.35], ["frontAnkleR", "frontKneeR", 0.35],
      ["hindAnkleL", "hindKneeL", 0.35], ["hindAnkleR", "hindKneeR", 0.35],
    ],
    boneMap: {
      Hips_01: "root",
      Spine_02: "spine", Spine2_04: "back", Spine3_05: "chest",
      Neck_06: "neck", Head_010: "head",
      Tail_043: "tail", Tail2_045: "tailMid",
      LeftShoulder_024: "frontShoulderL", RightShoulder_031: "frontShoulderR",
      LeftArm_025: "frontHipL", LeftForeArm_026: "frontKneeL", LeftHand_027: "frontAnkleL", LeftFingerBase_028: "frontHoofL",
      RightArm_032: "frontHipR", RightForeArm_033: "frontKneeR", RightHand_034: "frontAnkleR", RightFingerBase_035: "frontHoofR",
      LeftUpLeg_037: "hindHipL", LeftLeg_038: "hindKneeL", LeftFoot_039: "hindAnkleL", LeftToeBase_040: "hindHoofL",
      RightUpLeg_049: "hindHipR", RightLeg_050: "hindKneeR", RightFoot_051: "hindAnkleR", RightToeBase_052: "hindHoofR",
    },
    keepAllMeshes: true,   // body + mane/tail hair meshes — both are the horse
    uprightHeuristic: false, // standing horse is longer than tall; don't tip it
    targetHeight: 1.65,    // withers-to-ground-ish overall height in meters
  },
  // Quadruped: authored for the bundled CC-BY cat (Evil_Katz, Sketchfab — see
  // js/assets/props/CREDITS.txt). Same front/hind vocabulary as the horse, but
  // the rig is fully semantic (j_l_femur, j_spine_1…) so the boneMap is exact.
  // A cat is digitigrade — it stands on its paws, not its wrists/hocks — so the
  // PLANTED tips and the ground-contact IK targets are the paws (palm/ball),
  // and every leg carries BOTH a wrist/hock chain and a paw chain so the toe end
  // is draggable too (the lesson the horse hind leg taught us, applied up front).
  cat: {
    joints: [
      "root", "spine", "back", "chest", "neck", "head", "tail", "tailMid",
      "frontShoulderL", "frontHipL", "frontKneeL", "frontAnkleL", "frontHoofL",
      "frontShoulderR", "frontHipR", "frontKneeR", "frontAnkleR", "frontHoofR",
      "hindHipL", "hindKneeL", "hindAnkleL", "hindHoofL",
      "hindHipR", "hindKneeR", "hindAnkleR", "hindHoofR",
    ],
    ikLimbs: [
      // Front legs: humerus→elbow→wrist (2-bone to the wrist) + the lower chain
      // elbow→wrist→paw so the paw has its own diamond. Hind legs likewise.
      { tip: "frontAnkleL", chain: ["frontHipL", "frontKneeL", "frontAnkleL"], pole: [0, -0.3, 1] },
      { tip: "frontAnkleR", chain: ["frontHipR", "frontKneeR", "frontAnkleR"], pole: [0, -0.3, 1] },
      { tip: "frontHoofL", chain: ["frontKneeL", "frontAnkleL", "frontHoofL"], pole: [0, -0.2, 1] },
      { tip: "frontHoofR", chain: ["frontKneeR", "frontAnkleR", "frontHoofR"], pole: [0, -0.2, 1] },
      { tip: "hindAnkleL", chain: ["hindHipL", "hindKneeL", "hindAnkleL"], pole: [0, -0.3, -1] },
      { tip: "hindAnkleR", chain: ["hindHipR", "hindKneeR", "hindAnkleR"], pole: [0, -0.3, -1] },
      { tip: "hindHoofL", chain: ["hindKneeL", "hindAnkleL", "hindHoofL"], pole: [0, -0.2, -1] },
      { tip: "hindHoofR", chain: ["hindKneeR", "hindAnkleR", "hindHoofR"], pole: [0, -0.2, -1] },
    ],
    mirrorPairs: [
      ["frontShoulderL", "frontShoulderR"], ["frontHipL", "frontHipR"], ["frontKneeL", "frontKneeR"],
      ["frontAnkleL", "frontAnkleR"], ["frontHoofL", "frontHoofR"],
      ["hindHipL", "hindHipR"], ["hindKneeL", "hindKneeR"], ["hindAnkleL", "hindAnkleR"], ["hindHoofL", "hindHoofR"],
    ],
    limbMirrorSets: [["frontHip", "frontKnee", "frontAnkle", "frontHoof"], ["hindHip", "hindKnee", "hindAnkle", "hindHoof"]],
    plantedTips: ["frontHoofL", "frontHoofR", "hindHoofL", "hindHoofR"],
    skinSegments: [
      ["root", "spine"], ["spine", "chest"], ["chest", "neck"], ["neck", "head"],
      ["frontHipL", "frontKneeL"], ["frontKneeL", "frontAnkleL"], ["frontAnkleL", "frontHoofL"],
      ["frontHipR", "frontKneeR"], ["frontKneeR", "frontAnkleR"], ["frontAnkleR", "frontHoofR"],
      ["hindHipL", "hindKneeL"], ["hindKneeL", "hindAnkleL"], ["hindAnkleL", "hindHoofL"],
      ["hindHipR", "hindKneeR"], ["hindKneeR", "hindAnkleR"], ["hindAnkleR", "hindHoofR"],
    ],
    skinStubs: [
      ["head", "neck", 0.9],
      ["frontHoofL", "frontAnkleL", 0.3], ["frontHoofR", "frontAnkleR", 0.3],
      ["hindHoofL", "hindAnkleL", 0.3], ["hindHoofR", "hindAnkleR", 0.3],
    ],
    boneMap: {
      j_body_00_12: "root",
      j_spine_1_02_13: "spine", j_spine_2_03_14: "back", j_spine_4_05_16: "chest",
      j_neck_base_06_17: "neck", j_head_08_19: "head",
      j_tail_1_043_54: "tail", j_tail_3_045_56: "tailMid",
      j_l_scap_029_40: "frontShoulderL", j_r_scap_030_41: "frontShoulderR",
      j_l_humerous_031_42: "frontHipL", j_l_elbow_032_43: "frontKneeL", j_l_wrist_033_44: "frontAnkleL", j_l_palm_034_45: "frontHoofL",
      j_r_humerous_037_48: "frontHipR", j_r_elbow_038_49: "frontKneeR", j_r_wrist_039_50: "frontAnkleR", j_r_palm_040_51: "frontHoofR",
      j_l_femur_050_61: "hindHipL", j_l_knee_051_62: "hindKneeL", j_l_ankle_052_63: "hindAnkleL", j_l_ball_053_64: "hindHoofL",
      j_r_femur_055_66: "hindHipR", j_r_knee_056_67: "hindKneeR", j_r_ankle_057_68: "hindAnkleR", j_r_ball_058_69: "hindHoofR",
    },
    keepAllMeshes: true,    // body + eye/inner meshes — all part of the cat
    uprightHeuristic: false, // standing cat is longer than tall; don't tip it
    targetHeight: 0.45,     // ear-to-ground-ish overall height in meters
    // This GLB's bind pose is a sitting cat with its head curled down to the floor —
    // unworkable as a default. Pitch the neck + head UP about world Z (the cat's
    // left-right axis; it stands facing +X) into an alert, head-up sit. Applied
    // before rest capture, so this IS the pose it resets / mirrors / head-drags from.
    restPose: [
      { bone: "j_neck_base_06_17", axis: [0, 0, 1], deg: 50 },
      { bone: "j_neck_1_07_18", axis: [0, 0, 1], deg: 35 },
      { bone: "j_head_08_19", axis: [0, 0, 1], deg: 25 },
    ],
  },
};
// Active profile for a figure (everything pre-profile resolves to human).
const figProfile = (r) => r?.profile || RIG_PROFILES.human;

// ── hand / foot pose presets ────────────────────────────────────────────────
// Fingers are driven by a single 0–1 CURL AMOUNT per finger (the slider value).
// The amount scales a per-phalanx profile (proximal→distal degrees at amount=1),
// applied about each phalanx's bend axis. Presets are just sets of amounts, so
// picking one moves the sliders — and the user can fine-tune from there.
const FINGER_PROFILE = [82, 92, 68]; // deg at amount=1 (proximal, middle, distal)
const THUMB_CURL_DEG = [0, 60, 48];  // thumb_02/03 flexion (fold) at amount=1 (metacarpal aims, not folds)
const FINGER_ORDER = ["index", "middle", "ring", "pinky"];
// Hand-control sliders: [amount-key, label]. Fingers only — the thumb is posed by
// dragging its IK tip handle (a slider can't capture its 2-DOF motion).
const HAND_SLIDERS = [
  ["index", "index"], ["middle", "middle"], ["ring", "ring"], ["pinky", "pinky"],
];
const HAND_PRESETS = {
  "Relaxed":       { thumb: 0.15, thumbCurl: 0.10, index: 0.13, middle: 0.14, ring: 0.15, pinky: 0.15 },
  "Fist":          { thumb: 1.0, thumbCurl: 0.65, index: 1.0, middle: 1.0, ring: 1.0, pinky: 1.0 },
  "Open":          { thumb: 0.0, thumbCurl: 0.0, index: 0.0, middle: 0.0, ring: 0.0, pinky: 0.0 },
  "Point":         { thumb: 0.85, thumbCurl: 0.35, index: 0.0, middle: 1.0, ring: 1.0, pinky: 1.0 },
  "Peace ✌":       { thumb: 0.85, thumbCurl: 0.40, index: 0.0, middle: 0.0, ring: 1.0, pinky: 1.0 },
  "Middle finger": { thumb: 0.85, thumbCurl: 0.35, index: 1.0, middle: 0.0, ring: 1.0, pinky: 1.0 },
  "Chop":          { thumb: 0.30, thumbCurl: 0.10, index: 0.0, middle: 0.0, ring: 0.0, pinky: 0.0 },
  "Hold (large)":  { thumb: 0.60, thumbCurl: 0.30, index: 0.50, middle: 0.52, ring: 0.52, pinky: 0.50 },
  "Hold (small)":  { thumb: 0.90, thumbCurl: 0.55, index: 0.80, middle: 0.82, ring: 0.80, pinky: 0.78 },
  "Thumbs up":     { thumb: 0.0, thumbCurl: 0.0, index: 1.0, middle: 1.0, ring: 1.0, pinky: 1.0 },
};
// Single `ball` bone per foot → flex angle in degrees (negative = point/extend). The ball
// is the PARENT of the five toe bones, so a preset still flexes every toe together.
const FOOT_PRESETS = { "Neutral": 0, "Pointed": -38, "Curled": 42 };
// Per-toe curl: each toe bone (big→little) curls about its bend axis by amount(0-1) × this.
const TOE_LABELS = ["big", "long", "middle", "ring", "little"];
const TOE_CURL_DEG = 45;

// Hand-authored CAPTURED poses (raw bone quaternions, keyed by base bone name, in
// RIGHT-hand convention — mirrored for the left). These reproduce a pose exactly,
// including the IK-posed thumb, which the amount sliders can't. Captured by posing
// the figure and reading pose_state.digits from a saved workflow.
const POSE_PRESETS = {
  "Peace ✌": {
    thumb_01: [0.0157, -0.131, -0.0587, 0.9895], thumb_02: [0.2102, 0.0141, 0.5779, 0.7884], thumb_03: [0.0236, -0.4833, 0.4229, 0.7662],
    index_01: [0.1141, -0.473, 0.0048, 0.8736], index_02: [0.1078, -0.0028, -0.0061, 0.9942], index_03: [0.0642, -0.0001, -0.0187, 0.9978],
    middle_01: [0.1035, -0.4057, 0.1552, 0.8948], middle_02: [0.0456, -0.0014, -0.0373, 0.9983], middle_03: [0.071, 0, 0.0058, 0.9975],
    ring_01: [0.6105, -0.1594, 0.3522, 0.6913], ring_02: [0.7026, 0.0246, -0.1131, 0.7021], ring_03: [0.5648, 0.0213, -0.044, 0.8238],
    pinky_01: [0.5248, -0.077, 0.4512, 0.7177], pinky_02: [0.6685, 0.0178, 0.0268, 0.743], pinky_03: [0.452, 0.023, 0.0421, 0.8907],
  },
};

// Captured FULL-BODY poses (raw local quaternions for the canonical joints, the
// spine chain, and the digits). All GLB bodies share the 54-bone rig, so a pose
// captured on one transfers to any of them; body shape lives in bone POSITIONS
// (jointPos/sliders), which a pose never touches. Authoring workflow: pose a
// figure in the poser, save the ComfyUI workflow, run
// _posebuild/extract_body_pose.py on it, paste the entry here.
const BODY_POSES = {
  "arms behind head": {
    joints: {
      root: [0.5306, 0, 0, 0.8476], shoulderL: [-0.3572, 0.704, -0.2933, -0.5392], elbowL: [-0.8592, -0.0093, -0.003, -0.5115],
      wristL: [-0.1102, -0.4111, 0.0161, -0.9048], shoulderR: [0.3572, 0.704, -0.2933, 0.5392], elbowR: [0.8592, -0.0093, -0.003, 0.5115],
      wristR: [0.1102, -0.4111, 0.0161, 0.9048], neck: [0.1624, 0, 0, 0.9867], head: [-0.2058, 0, 0, 0.9786],
      hipL: [-0.9581, -0.0917, 0.2139, 0.1671], kneeL: [0.0588, 0.2322, -0.0085, 0.9709], ankleL: [-0.5353, -0.0011, 0.0008, 0.8446],
      hipR: [-0.9581, 0.0917, -0.2139, 0.1671], kneeR: [0.0588, -0.2322, 0.0085, 0.9709], ankleR: [-0.5353, 0.0011, -0.0008, 0.8446],
      chest: [0.0085, 0, 0, 1], spine: [0.3345, 0, 0, 0.9424], back: [0, 0, 0, 1],
    },
    spine: {
      spine_01: [0.3345, 0, 0, 0.9424], spine_02: [-0.1026, 0, 0, 0.9947], spine_03: [0.0085, 0, 0, 1],
      spine_04: [0, 0, 0, 1], neck_01: [0.1624, 0, 0, 0.9867], head: [-0.2058, 0, 0, 0.9786],
    },
    digits: {
      index_01_l: [0.1101, 0.4792, -0.0033, 0.8708], index_02_l: [0.1087, 0.0029, 0.0061, 0.9941], index_03_l: [0.0627, 0.0006, 0.0187, 0.9979],
      middle_01_l: [0.0982, 0.4131, -0.1524, 0.8925], middle_02_l: [0.0468, 0.0005, 0.0367, 0.9982], middle_03_l: [0.0677, 0.0009, -0.0059, 0.9977],
      pinky_01_l: [0.0467, 0.2921, -0.3033, 0.9058], pinky_02_l: [0.0809, 0.0011, 0.0246, 0.9964], pinky_03_l: [-0.0087, -0.0002, -0.0113, 0.9999],
      ring_01_l: [0.0521, 0.3896, -0.2305, 0.8902], ring_02_l: [0.0595, 0.0003, 0.0431, 0.9973], ring_03_l: [0.0596, 0.0007, -0.0245, 0.9979],
      thumb_01_l: [-0.2744, -0.7312, -0.4376, -0.4456], thumb_02_l: [-0.069, 0.0171, 0.1829, -0.9806], thumb_03_l: [-0.1421, 0.0069, 0.0328, -0.9893],
      index_01_r: [0.1101, -0.4792, 0.0033, 0.8708], index_02_r: [0.1087, -0.0029, -0.0061, 0.9941], index_03_r: [0.0627, -0.0006, -0.0187, 0.9979],
      middle_01_r: [0.0982, -0.4131, 0.1524, 0.8925], middle_02_r: [0.0468, -0.0005, -0.0367, 0.9982], middle_03_r: [0.0677, -0.0009, 0.0059, 0.9977],
      pinky_01_r: [0.0467, -0.2921, 0.3033, 0.9058], pinky_02_r: [0.0809, -0.0011, -0.0246, 0.9964], pinky_03_r: [-0.0087, 0.0002, 0.0113, 0.9999],
      ring_01_r: [0.0521, -0.3896, 0.2305, 0.8902], ring_02_r: [0.0595, -0.0003, -0.0431, 0.9973], ring_03_r: [0.0596, -0.0007, 0.0245, 0.9979],
      thumb_01_r: [0.2744, -0.7312, -0.4376, 0.4456], thumb_02_r: [0.069, 0.0171, 0.1829, 0.9806], thumb_03_r: [0.1421, 0.0069, 0.0328, 0.9893],
      ball_l: [-0.2622, 0.0073, 0.0292, 0.9645], ball_r: [-0.2622, -0.0073, -0.0292, 0.9645],
    },
  },
};

// Flat list of all finger + toe bones on a rig (for serialize/restore).
function digitBones(rig) {
  const out = [];
  if (rig?.fingers) {
    for (const wrist of ["wristL", "wristR"]) {
      const hand = rig.fingers[wrist];
      if (hand) for (const f of Object.keys(hand)) out.push(...hand[f]);
    }
  }
  if (rig?.toes) for (const k of Object.keys(rig.toes)) out.push(rig.toes[k]);
  if (rig?.toeChains) for (const k of Object.keys(rig.toeChains)) for (const ch of rig.toeChains[k]) out.push(...ch);
  return out;
}

// Two-bone analytic IK (Daniel Holden, "Simple Two Joint IK"). Closed-form → one
// drag is one deterministic, jitter-free solve. a/b/c are the root/mid/tip joints
// (any Object3D — works for GLB bones or capsule groups); targetW is the desired
// tip world position. Rig-agnostic: it rotates each joint by the DELTA from its
// current angle, converting the world-space bend axis into each joint's own frame
// via that joint's original world quaternion, so it never assumes a bone's local
// axis convention (which differs across MakeHuman/Mixamo/Rigify exports).
function solveTwoBoneIK(THREE, a, b, c, targetW, poleW) {
  if (!a || !b || !c) return; // an unmapped joint (GLB miss) must not throw in the IK/foot-pin path
  const eps = 1e-5;
  const aPos = a.getWorldPosition(new THREE.Vector3());
  const bPos = b.getWorldPosition(new THREE.Vector3());
  const cPos = c.getWorldPosition(new THREE.Vector3());
  const lab = aPos.distanceTo(bPos);
  const lcb = bPos.distanceTo(cPos);
  if (lab < eps || lcb < eps) return;
  // Clamp the reach to the span that keeps the interior elbow/knee angle inside
  // [HINGE_MIN, HINGE_MAX] (law of cosines). This both enforces the joint limits
  // and keeps the solved triangle valid (the tip stays on the target unless the
  // target is out of the allowed range, where the limb sits at its limit).
  const latMin = Math.sqrt(Math.max(0, lab * lab + lcb * lcb - 2 * lab * lcb * Math.cos(HINGE_MIN)));
  const latMax = Math.sqrt(Math.max(0, lab * lab + lcb * lcb - 2 * lab * lcb * Math.cos(HINGE_MAX)));
  const lat = THREE.MathUtils.clamp(aPos.distanceTo(targetW), latMin, latMax);

  const dCA = cPos.clone().sub(aPos).normalize();
  const dBA = bPos.clone().sub(aPos).normalize();
  const dAB = aPos.clone().sub(bPos).normalize();
  const dCB = cPos.clone().sub(bPos).normalize();
  const dTA = targetW.clone().sub(aPos).normalize();
  const cl = (x) => THREE.MathUtils.clamp(x, -1, 1); // every acos arg — NaN guard

  const acAb0 = Math.acos(cl(dCA.dot(dBA)));
  const baBc0 = Math.acos(cl(dAB.dot(dCB)));
  const acAt0 = Math.acos(cl(dCA.dot(dTA)));
  const acAb1 = Math.acos(cl((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat)));
  const baBc1 = Math.acos(cl((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb)));

  // Bend-plane normal: keep the limb's current plane (flip-free while dragging);
  // if it's straight (degenerate cross), pick the side from the heuristic pole.
  const axis0 = new THREE.Vector3().crossVectors(dCA, dBA);
  if (axis0.lengthSq() < eps && poleW) {
    axis0.crossVectors(dTA, poleW.clone().sub(aPos).normalize());
  }
  if (axis0.lengthSq() < eps) {
    axis0.crossVectors(dCA, new THREE.Vector3(0, 0, 1));
    if (axis0.lengthSq() < eps) axis0.crossVectors(dCA, new THREE.Vector3(1, 0, 0));
  }
  axis0.normalize();
  const axis1 = new THREE.Vector3().crossVectors(dCA, dTA);
  const swing = axis1.lengthSq() > eps;
  axis1.normalize();

  // Original world quaternions (captured before any rotation, per Holden).
  const aQi = a.getWorldQuaternion(new THREE.Quaternion()).invert();
  const bQi = b.getWorldQuaternion(new THREE.Quaternion()).invert();
  const localAxis = new THREE.Vector3();
  const dq = new THREE.Quaternion();

  localAxis.copy(axis0).applyQuaternion(aQi).normalize();
  a.quaternion.multiply(dq.setFromAxisAngle(localAxis, acAb1 - acAb0));
  localAxis.copy(axis0).applyQuaternion(bQi).normalize();
  b.quaternion.multiply(dq.setFromAxisAngle(localAxis, baBc1 - baBc0));
  if (swing) {
    localAxis.copy(axis1).applyQuaternion(aQi).normalize();
    a.quaternion.multiply(dq.setFromAxisAngle(localAxis, acAt0));
  }
  a.updateMatrixWorld(true); // refresh the chain so the tip handle + capture are current
}

// Set q to the minimal rotation from `from` to `to` (both unit) — but when they're
// near-ANTIPARALLEL, setFromUnitVectors picks an arbitrary perpendicular axis that
// flips with tiny input changes (the IK "spazz" when a chain is dragged to reverse
// on itself, e.g. the head pulled straight down in front view). Guard that case by
// rotating π about a STABLE axis derived from `fallback` (use world-forward so a
// reversing spine folds forward instead of flickering).
function setRotFromTo(THREE, q, from, to, fallback) {
  if (from.dot(to) < -0.999999) {
    const axis = new THREE.Vector3().crossVectors(from, fallback);
    if (axis.lengthSq() < 1e-8) axis.crossVectors(from, new THREE.Vector3(1, 0, 0));
    if (axis.lengthSq() < 1e-8) axis.crossVectors(from, new THREE.Vector3(0, 1, 0));
    q.setFromAxisAngle(axis.normalize(), Math.PI);
  } else {
    q.setFromUnitVectors(from, to);
  }
}

// Bend the spine chain toward a target DIRECTION, distributing the bend evenly
// across the vertebrae. This replaces FABRIK for the head handle. FABRIK reaches
// an exact POSITION, but near the spine's own axis (dragging the head up/down in
// front view) the bend AZIMUTH is undefined, so it spun the torso around the
// vertical axis. Here the bend axis is derived ONCE from the REST spine direction
// → target — a smooth, well-defined function of the drag with no azimuthal
// freedom to spin. Absolute from rest each call (so it's idempotent, never
// accumulates) and capped per vertebra so it stays a smooth, bounded curve.
// bones[0] is the base (rides the pelvis); bones[last] (head) isn't rotated — it
// follows the neck. `rest` maps each bone → its rest local quaternion.
function bendSpineToward(THREE, bones, rest, targetW) {
  const n = bones.length;
  if (n < 2) return;
  for (const b of bones) { const r = rest.get(b); if (r) b.quaternion.copy(r); } // start from rest each frame
  bones[0].updateMatrixWorld(true);
  const basePos = bones[0].getWorldPosition(new THREE.Vector3());
  const restDir = bones[n - 1].getWorldPosition(new THREE.Vector3()).sub(basePos);
  const tgtDir = targetW.clone().sub(basePos);
  if (restDir.lengthSq() < 1e-9 || tgtDir.lengthSq() < 1e-9) return;
  restDir.normalize(); tgtDir.normalize();
  const dot = THREE.MathUtils.clamp(restDir.dot(tgtDir), -1, 1);
  if (dot > 0.99999) return; // already aligned with rest — no bend
  const axis = new THREE.Vector3().crossVectors(restDir, tgtDir);
  if (axis.lengthSq() < 1e-8) {
    // Antiparallel (head dragged straight opposite the spine) → fold forward (+Z).
    axis.crossVectors(restDir, new THREE.Vector3(0, 0, 1));
    if (axis.lengthSq() < 1e-8) axis.crossVectors(restDir, new THREE.Vector3(1, 0, 0));
  }
  axis.normalize();
  // Distribute the swing evenly: rotating each of the k bending joints by `per`
  // about the world axis compounds to a k·per swing of the head — exactly the
  // angle to rest→target when uncapped, and a smooth arc when capped.
  const k = n - 1;
  const per = Math.min(Math.acos(dot) / k, MAX_SPINE_JOINT_BEND);
  const dq = new THREE.Quaternion().setFromAxisAngle(axis, per);
  for (let i = 0; i < n - 1; i++) {
    const b = bones[i];
    const newWorld = dq.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
    const parentInv = b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()).invert() : new THREE.Quaternion();
    b.quaternion.copy(parentInv.multiply(newWorld));
    b.updateMatrixWorld(true);
  }
}

// Aim a single bone so its child joint points at targetW, rotating only that bone
// (the rest of the limb rides along as children). Used to drag the elbow/knee:
// grab it and the upper arm/thigh swings to put it there. Rig-agnostic — applies a
// world-space delta in the bone's own frame, like the FABRIK retarget step.
function aimBoneAt(THREE, bone, childJoint, targetW) {
  bone.updateMatrixWorld(true);
  const pPos = bone.getWorldPosition(new THREE.Vector3());
  const curDir = childJoint.getWorldPosition(new THREE.Vector3()).sub(pPos);
  const tgtDir = targetW.clone().sub(pPos);
  if (curDir.lengthSq() < 1e-10 || tgtDir.lengthSq() < 1e-10) return;
  curDir.normalize(); tgtDir.normalize();
  const q = new THREE.Quaternion();
  setRotFromTo(THREE, q, curDir, tgtDir, new THREE.Vector3(0, 0, 1));
  const newWorld = q.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parentInv = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert() : new THREE.Quaternion();
  bone.quaternion.copy(parentInv.multiply(newWorld));
  bone.updateMatrixWorld(true);
}

async function mountViewport(node, container) {
  let lib;
  try {
    lib = await loadThree();
  } catch (e) {
    container.textContent = "Failed to load 3D engine — see console.";
    console.error(e);
    return;
  }
  if (!node._pcrAlive) return; // node was removed during the async load
  const { THREE, OrbitControls, TransformControls, GLTFLoader, OBJLoader } = lib;

  const scene = new THREE.Scene();
  scene.background = null; // cleared manually so the letterbox bars can differ from the frame

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 1.3, 3.4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  // Absolute + explicitly sized/positioned by fitCanvas (never width/height:100%),
  // so the drawing-buffer size never feeds back into the container's flow height
  // (that path is an endless setSize → taller container → ResizeObserver loop).
  canvas.style.cssText = "position:absolute;display:block;";
  container.appendChild(canvas);

  // Blender-style studio clay lighting: bright ambient dome + a soft key and an
  // opposite fill, so forms shade gently instead of splitting into a lit side
  // and a black side (the old single 1.25 sun). Affects the capture too — the
  // depth net doesn't care, it reads geometry cues, and matte gray is the same
  // family as the props/floor.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3c3e46, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-3, 2.5, -2.5);
  scene.add(fill);
  const grid = new THREE.GridHelper(4, 8, 0x4a4a55, 0x2a2a30);
  scene.add(grid);
  // Opt-in solid ground plane at foot level (y=0). Unlike the grid (lines, a
  // viewport aid hidden from the capture), this is a matte surface that STAYS in
  // the captured render so DepthAnything reads a receding floor — grounding the
  // figure with a continuous depth gradient and a foot-contact edge. Off by
  // default; toggled from the toolbar.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a8a92, roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.visible = false;
  scene.add(floor);
  // ── figure body library ─────────────────────────────────────────────────────
  // Official posable bodies the 👤 button offers. EVERY entry must ride the same
  // MakeHuman game rig (classifyBone names: upperarm_l, spine_01..03, single
  // head bone, fingers/toes) — that contract is what lets IK, hand presets, the
  // thumb drag, foot pins, mirror, morphs and regional head boxes work on every
  // body with zero retuning. `bones` = the per-morph bone-delta JSON (null =
  // the body ships without skeletal morph sliders). ?v bumps on asset change so
  // browsers refetch instead of serving a stale cached GLB.
  // Authoring pipeline: MakeHuman (game rig) → FBX → fbx2glb.py / MPFB2 bake
  // (tools/build_pose_figure.py) → drop in js/assets/ → add an entry here.
  const FIGURE_LIBRARY = {
    human: { label: "🧍 human", file: "pose-figure.glb?v=16", bones: "pose-figure-bones.json?v=10" },
    // User MakeHuman recipes rebuilt through MPFB2 with the game rig attached
    // in script — tools/build_body_figure.py (recipe per body, own slider set
    // baked relative to its base; identity dimensions deliberately absent:
    // heavy's weight/muscle, stacked's bust/weight).
    heavy: { label: "🏋 heavy man", file: "pose-figure-heavy.glb?v=13", bones: "pose-figure-heavy-bones.json?v=6" },
    stacked: { label: "💃 stacked", file: "pose-figure-stacked.glb?v=13", bones: "pose-figure-stacked-bones.json?v=6" },
    // The slider-engine body: a morph-free default-macro GLB + a packed MakeHuman
    // target library applied at RUNTIME (CPU vertex deltas + analytic bone-rest
    // moves). GLB and pack are a MATCHED PAIR (the pack's vertex remap is bound
    // to that GLB's exact vertex order) — rebuilding one means rebuilding both
    // (tools/build_body_figure.py custom + tools/build_slider_pack.py) and
    // bumping BOTH ?v=.
    custom: { label: "🧬 custom", file: "pose-figure-custom.glb?v=16", bones: null, pack: "body-pack.bin.gz?v=7" },
    // Creatures: non-human rigs (rig key selects the RIG_PROFILES entry; the
    // profile's explicit boneMap is authored against this exact GLB's skeleton).
    horse: { label: "🐴 horse", file: "pose-figure-horse.glb?v=1", bones: null, rig: "horse" },
    cat: { label: "🐈 cat", file: "pose-figure-cat.glb?v=1", bones: null, rig: "cat" },
  };
  // 👤 menu entries: every template spawns the CUSTOM slider-engine body with a
  // preset dict, so each one stays fully tweakable afterwards. The slider
  // values are exact transcriptions of the baked bodies' build recipes (the
  // user's .mhm files — see tools/build_body_figure.py RECIPES), and the
  // engine computes the same MakeHuman blend the bakes did, so `woman` and
  // `giant` reproduce the old stacked/heavy meshes. The baked GLB entries
  // above stay registered (not in the menu) so saves that reference them
  // restore byte-identically. Age presets are in UI scale (0..1 spans MH age
  // 0.5..1.0 — see the slider's uiToValue).
  const BODY_TEMPLATES = {
    basic: { label: "🧍 basic", sliders: {} },
    woman: {
      label: "💃 woman",
      sliders: {
        gender: 0, age: 0.008, muscle: 0.422, weight: 0.865, height: 0.624,
        proportions: 0.681, cupsize: 0.894, firmness: 0.84,
        "breast-trans": 0.602, "breast-dist": -0.014, "breast-point": -0.164,
        "breast-volume-vert": -0.242, "nipple-size": -0.056, "nipple-point": -0.142,
      },
    },
    giant: {
      label: "🏋 giant",
      sliders: {
        gender: 1, age: 0.12, muscle: 0.872, weight: 0.95, height: 0.465,
        proportions: 0.755, cupsize: 0.17, firmness: 0.486,
        african: 0.426, asian: 0.287, caucasian: 0.287,
        "torso-scale-depth": 0.482, "torso-scale-horiz": 0.56, "torso-scale-vert": 0.056,
        "torso-trans-horiz": -0.086, "torso-trans-vert": -0.092, "torso-trans-depth": 0.086,
        "torso-vshape": 0.304, "torso-dorsi": 0.334, "torso-pectoral": 1,
        "breast-trans": 0.568,
      },
    },
  };
  const DEFAULT_BODY = "human";
  const bodyKeyOf = (key) => (FIGURE_LIBRARY[key] ? key : DEFAULT_BODY);
  const figureUrl = (body) => new URL(`./assets/${FIGURE_LIBRARY[bodyKeyOf(body)].file}`, import.meta.url).href;
  // Rig profile for a body key — FIGURE_LIBRARY entries opt into a non-human
  // rig via `rig: "<kind>"`; everything else (all current bodies) is human.
  const rigProfileOf = (body) => RIG_PROFILES[FIGURE_LIBRARY[bodyKeyOf(body)].rig] || RIG_PROFILES.human;

  // ── multiple figures ────────────────────────────────────────────────────────
  // The viewport hosts N posable people. `figures` holds them all; `rig` is the
  // ACTIVE one — a mutable reference the gizmo, handles, IK, body sliders and
  // hand/foot panels all read, so clicking a figure retargets the whole posing
  // layer onto it. ALL per-figure state (rest pose, morph state, spine chain,
  // finger axes, joint handles, foot pins) lives ON each rig; only the scene,
  // camera, gizmo and DOM panels are shared. initFigure() builds that per-figure
  // state, so a spawned person is set up identically to the first.
  const figures = [];
  let figureUidSeq = 1; // monotonic stable per-figure id (see serializeFigure / history reconcile)
  let rig = null; // the ACTIVE figure
  let bodyHovered = false; // pointer is over the active figure's body mesh
  const handlesRoot = new THREE.Group(); // parents every figure's handle group
  scene.add(handlesRoot);

  // Link status line — shows when the selected prop is linked to something, with how to
  // undo. Driven from updatePropUI (event-driven, no timers).
  const linkStatus = document.createElement("div");
  linkStatus.style.cssText =
    "position:absolute;bottom:6px;left:50%;transform:translateX(-50%);z-index:5;display:none;" +
    "padding:3px 10px;background:rgba(20,20,26,0.9);color:#cfe;border:1px solid #3a7d52;border-radius:5px;" +
    "font:11px/1.4 system-ui,sans-serif;pointer-events:none;white-space:nowrap;";
  container.appendChild(linkStatus);
  const jointFriendly = (n) => /^wrist/i.test(n) ? "hand" : /^ankle/i.test(n) ? "foot" : /^head/i.test(n) ? "head" : n;

  // Floor ring under the active figure — the "this person is selected" marker, only
  // meaningful with more than one in the scene. Turns amber when the figure is ARMED
  // (a joint of it is selected on the gizmo), the state in which Del removes it. Lives
  // under handlesRoot so it's stripped from the captured control map like the handles.
  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.26, 0.32, 48),
    new THREE.MeshBasicMaterial({ color: 0x46b1ff, transparent: true, opacity: 0.45, depthTest: false, side: THREE.DoubleSide })
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.renderOrder = 998;
  selectionRing.visible = false;
  handlesRoot.add(selectionRing);

  // ── attach constraints (pinning) ────────────────────────────────────────────
  // A follower tracks a leader each frame with a FROZEN offset, so a prop pinned to a
  // hand rides the wrist as you pose ("hold the pole"). Direction is fixed —
  // follower → leader, never mutual — so there are no cycles (the convention every DCC
  // uses). Runtime refs hold live objects; attachApi maps them to indices/names for
  // pose_state. follower: {kind:'prop', mesh}; leader: {kind:'prop', mesh} | {kind:'joint', fig, joint}.
  const attachments = [];
  const _atM = new THREE.Matrix4(), _atP = new THREE.Vector3(), _atQ = new THREE.Quaternion(), _atS = new THREE.Vector3(), _atJ = new THREE.Vector3();
  const _atRigid = new THREE.Matrix4(), _atOne = new THREE.Vector3(1, 1, 1);
  const leaderWorldMatrix = (ref) => {
    if (ref.kind === "prop") { ref.mesh.updateWorldMatrix(true, false); return ref.mesh.matrixWorld; }
    const bone = ref.fig?.joints?.[ref.joint];
    if (!bone) return null;
    bone.updateWorldMatrix(true, false);
    return bone.matrixWorld;
  };
  // RIGID (position + rotation, scale forced to 1) leader frame. The figure root carries
  // a ~1.8× scale that bakes into every bone's world matrix; using the full matrix as the
  // link frame makes the decompose in enforceAttachments scale-skewed. A rigid frame keeps
  // the offset an exact pose transform so the prop rides position+orientation cleanly and
  // keeps its own size. Returns the shared _atRigid buffer (clone before mutating).
  const leaderRigidMatrix = (ref) => {
    const w = leaderWorldMatrix(ref);
    if (!w) return null;
    w.decompose(_atP, _atQ, _atS);
    return _atRigid.compose(_atP, _atQ, _atOne);
  };
  // Re-place every follower at leaderWorld · offset. Props sit directly under propsGroup
  // (identity transform), so the decomposed world TRS is the prop's local TRS; scale is
  // left alone (the prop keeps its own size, it doesn't inherit the hand's).
  const enforceAttachments = () => {
    for (const a of attachments) {
      if (a.follower.kind !== "prop") continue;
      const lW = leaderRigidMatrix(a.leader);
      if (!lW) continue;
      _atM.multiplyMatrices(lW, a.offset);
      _atM.decompose(_atP, _atQ, _atS); // _atP = target world point (translation of leader·offset)
      if (a.follower.jointIndex != null) {
        // CHAIN-JOINT pin: keep ONE joint glued to the frozen point in the leader
        // frame by translating the whole prop — re-enforced every frame, so posing
        // the other joints can't drag the pinned joint off (it snaps back here).
        // Bones/orientation untouched; only the prop's position shifts.
        const m = a.follower.mesh;
        m.updateWorldMatrix(true, true); // refresh the bones' world matrices first
        chainJointWorld(m, a.follower.jointIndex, _atJ);
        m.position.add(_atP.sub(_atJ));
      } else {
        a.follower.mesh.position.copy(_atP);
        a.follower.mesh.quaternion.copy(_atQ);
      }
    }
  };
  // A thin connector line per attachment (follower → leader) so a pin is visible. Under
  // handlesRoot, so it's stripped from the capture like the handles.
  const ATTACH_LINE_MAX = 64; // segments; far beyond any realistic pin count
  const attachLinePos = new Float32Array(ATTACH_LINE_MAX * 6);
  const attachConnectors = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(attachLinePos, 3)),
    new THREE.LineBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.7, depthTest: false })
  );
  attachConnectors.renderOrder = 997;
  attachConnectors.frustumCulled = false;
  handlesRoot.add(attachConnectors);
  // Update the shared buffer in place (no per-frame allocation) and draw only the
  // active segments.
  const updateAttachConnectors = () => {
    let i = 0;
    for (const a of attachments) {
      if (i + 6 > attachLinePos.length) break;
      const lW = leaderWorldMatrix(a.leader);
      if (!lW) continue;
      const f = a.follower.jointIndex != null ? chainJointWorld(a.follower.mesh, a.follower.jointIndex, _atP) : a.follower.mesh.getWorldPosition(_atP);
      attachLinePos[i++] = f.x; attachLinePos[i++] = f.y; attachLinePos[i++] = f.z;
      attachLinePos[i++] = lW.elements[12]; attachLinePos[i++] = lW.elements[13]; attachLinePos[i++] = lW.elements[14];
    }
    attachConnectors.geometry.attributes.position.needsUpdate = true;
    attachConnectors.geometry.setDrawRange(0, i / 3);
  };
  const removeAttachmentsFor = (mesh) => {
    if (mesh?.userData) mesh.userData._pinIndex = null; // drop the chain-pin marker
    for (let i = attachments.length - 1; i >= 0; i--) {
      const a = attachments[i];
      if ((a.follower.kind === "prop" && a.follower.mesh === mesh) ||
          (a.leader.kind === "prop" && a.leader.mesh === mesh)) attachments.splice(i, 1);
    }
  };
  const removeAttachmentsForFigure = (fig) => {
    for (let i = attachments.length - 1; i >= 0; i--)
      if (attachments[i].leader.kind === "joint" && attachments[i].leader.fig === fig) attachments.splice(i, 1);
  };
  const propAttachment = (mesh) => attachments.find((a) => a.follower.kind === "prop" && a.follower.mesh === mesh);
  // Walk a prop's attachment chain to the figure it ultimately rides (a sword pinned
  // to a hand, or a charm pinned to that sword…). Returns null for an unpinned prop,
  // so it belongs to no figure's region mask. Seen-set guards against any stray cycle.
  const figureOwningProp = (mesh) => {
    const seen = new Set();
    let cur = mesh;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const a = propAttachment(cur);
      if (!a) return null;
      if (a.leader.kind === "joint") return a.leader.fig;
      cur = a.leader.mesh;
    }
    return null;
  };
  // Pin `propMesh` to `leaderRef`, freezing the current relative offset so the prop
  // stays put and then rides the leader. One leader per follower.
  const createPropAttach = (propMesh, leaderRef) => {
    const lW = leaderRigidMatrix(leaderRef);
    if (!lW) return;
    propMesh.updateWorldMatrix(true, false);
    removeAttachmentsFor(propMesh);
    attachments.push({ follower: { kind: "prop", mesh: propMesh }, leader: leaderRef, offset: lW.clone().invert().multiply(propMesh.matrixWorld) });
  };
  // Pin ONE joint of a chain prop to a leader (mannequin joint / prop): the joint
  // glues to its current spot in the leader frame and rides it, while every OTHER
  // joint stays free to pose around it (enforceAttachments re-locks it each frame).
  // offset = the joint's position in the leader's rigid frame, as a translation
  // matrix, so it round-trips through the same attachment serialization.
  const createChainPin = (chainMesh, jointIndex, leaderRef) => {
    const lW = leaderRigidMatrix(leaderRef);
    if (!lW) return;
    removeAttachmentsFor(chainMesh);
    // Zero offset → the joint SNAPS onto the leader joint ("stuck on there"); the
    // user then nudges with the move gizmo, which re-freezes the offset.
    attachments.push({ follower: { kind: "prop", mesh: chainMesh, jointIndex }, leader: leaderRef, offset: new THREE.Matrix4() });
    chainMesh.userData._pinIndex = jointIndex; // quick lookup for handle/IK code
  };

  // The active figure is "armed" when a joint of it is selected on the rotate gizmo —
  // clicking its body arms it, clicking empty space / Esc disarms it. Del removes an
  // armed figure (so a stray Del with nothing selected is inert).
  function gizmoOnActiveJoint() {
    return !!transformControls?.object && !!rig?.handles?.some((h) => h.userData.joint === transformControls.object);
  }
  // Handles are hidden until the pointer is over the figure (or a handle), so the body
  // reads clean; they also stay up through any active posing so a drag that leaves the
  // mesh, or a held selection/foot-pin, doesn't make them vanish mid-edit. While the
  // figure is selected as an object they stay up too, so the path from "picked the
  // person" to "now pose a limb" is always visible (the discoverability bridge).
  function handlesShouldShow() {
    return !!(bodyHovered || hoveredHandle || selectedFigure === rig || ik.active
      || transformControls.dragging || gizmoOnActiveJoint() || anyFootPinned() || pinPickProp || pinPickGroup
      || skinFit); // skeleton-fitting: the body is hidden, so hover can't reveal them — force them on
  }

  const D2R = Math.PI / 180;
  const HANDLE = { fk: 0x46b1ff, ik: 0xffb24a, hover: 0xffffff, pin: 0x46d18a };
  const ikGeo = new THREE.OctahedronGeometry(1, 0); // shared by every figure's handles
  const fkGeo = new THREE.SphereGeometry(1, 16, 12);
  const HANDLE_SIZE = 0.015; // was 0.02 — the torso's 5 joints left no clickable body
  // Above this rendered-frame height (px) handles stop growing with the viewport, so they
  // don't balloon and cover their own joints in fullscreen. At/below it (the node) the
  // original constant-angular sizing is untouched.
  const HANDLE_REF_H = 800;
  const HANDLE_DIM = 0.22, HANDLE_BRIGHT = 0.95; // idle vs hovered/active/dragging

  // Per-morph bone deltas are identical for every figure OF THE SAME BODY —
  // fetched once per body key. Bodies without a bones JSON get {} (their
  // morphs, if any, are all treated as surface).
  const morphDeltasCache = new Map();
  const loadMorphDeltas = async (body = DEFAULT_BODY) => {
    const key = bodyKeyOf(body);
    if (morphDeltasCache.has(key)) return morphDeltasCache.get(key);
    let morphs = {};
    const src = FIGURE_LIBRARY[key].bones;
    if (src) {
      try {
        const bj = await fetch(new URL(`./assets/${src}`, import.meta.url).href);
        if (bj.ok) morphs = (await bj.json()).morphs || {};
      } catch (e) { console.warn("[PoseStudio] morph bone deltas missing:", e); }
    }
    morphDeltasCache.set(key, morphs);
    return morphs;
  };

  // ── runtime slider pack (the `custom` body) ─────────────────────────────────
  // One binary holds every MakeHuman target the slider engine needs: sparse
  // per-vertex deltas remapped onto the GLB's vertex order, per-target bone-rest
  // deltas, and the dense default-blend the GLB ships baked in (subtracted back
  // at runtime so default sliders reproduce the GLB exactly). Built by
  // tools/build_slider_pack.py; format documented there. Fetched lazily on the
  // first custom-figure spawn, shared read-only by every custom figure.
  const sliderPackCache = new Map(); // body key -> Promise<pack | {failed:true}>
  const loadSliderPack = (body = DEFAULT_BODY) => {
    const key = bodyKeyOf(body);
    if (sliderPackCache.has(key)) return sliderPackCache.get(key);
    const src = FIGURE_LIBRARY[key].pack;
    const promise = (async () => {
      if (!src) return { failed: true };
      const res = await fetch(new URL(`./assets/${src}`, import.meta.url).href);
      if (!res.ok) throw new Error(`pack fetch ${res.status}`);
      const buf = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      const dv = new DataView(buf);
      if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== "PCPK")
        throw new Error("bad pack magic");
      const manifestLen = dv.getUint32(20, true), blobStart = dv.getUint32(24, true);
      const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 32, manifestLen)));
      const f32 = (off, n) => new Float32Array(buf, blobStart + off, n);
      const u16 = (off, n) => new Uint16Array(buf, blobStart + off, n);
      const i16 = (off, n) => new Int16Array(buf, blobStart + off, n);
      const targets = manifest.targets.map((t) => ({
        tokens: t.tokens,
        vIdx: u16(t.vOff, t.vCount),
        vDelta: i16(t.vOff + 2 * t.vCount, t.vCount * 3),
        // bone-id run is padded to a 4-byte boundary before the f32 deltas
        bones: t.bCount ? {
          idx: u16(t.bOff, t.bCount),
          delta: f32((t.bOff + 2 * t.bCount + 3) & ~3, t.bCount * 3),
        } : null,
      }));
      return {
        manifest, targets,
        defaultVerts: f32(manifest.defaultBlend.vOff, manifest.vertCount * 3),
        defaultBones: f32(manifest.defaultBlend.bOff, manifest.boneCount * 3),
      };
    })().catch((e) => {
      console.warn("[PoseStudio] slider pack failed:", e);
      sliderPackCache.delete(key); // a later spawn may retry (transient server hiccup)
      return { failed: true };
    });
    sliderPackCache.set(key, promise);
    return promise;
  };

  // 1:1 port of MakeHuman's macro factor math (apps/human.py). Target weight =
  // sliderValue x PRODUCT(factor per macro token in the target's filename); the
  // packer pre-parsed the tokens, so this is the entire blending engine.
  const computeMacroFactors = (m) => {
    const tri = (x, lo, mid, hi, dominant) => {
      const mx = Math.max(0, x * 2 - 1), mn = Math.max(0, 1 - x * 2);
      return { [lo]: mn, [mid]: 1 - (dominant ? Math.max(mx, mn) : mx + mn), [hi]: mx };
    };
    const f = { male: m.gender, female: 1 - m.gender };
    if (m.age < 0.5) {
      f.old = 0;
      f.baby = Math.max(0, 1 - m.age * 5.333);
      f.young = Math.max(0, (m.age - 0.1875) * 3.2);
      f.child = Math.max(0, Math.min(1, 5.333 * m.age) - f.young);
    } else {
      f.baby = f.child = 0;
      f.old = Math.max(0, m.age * 2 - 1);
      f.young = 1 - f.old;
    }
    Object.assign(f,
      tri(m.muscle, "minmuscle", "averagemuscle", "maxmuscle", false),
      tri(m.weight, "minweight", "averageweight", "maxweight", false),
      tri(m.height, "minheight", "averageheight", "maxheight", true),
      tri(m.proportions, "uncommonproportions", "regularproportions", "idealproportions", true),
      tri(m.cupsize, "mincup", "averagecup", "maxcup", true),
      tri(m.firmness, "minfirmness", "averagefirmness", "maxfirmness", true));
    const raceSum = m.african + m.asian + m.caucasian;
    for (const r of ["african", "asian", "caucasian"]) f[r] = raceSum ? m[r] / raceSum : 1 / 3;
    return f;
  };

  // limbFor/aimFor/legsAreIkable take the figure explicitly so they can be used
  // while BUILDING a figure that isn't active yet. Chains come from the figure's
  // rig profile (human's = IK_LIMBS verbatim).
  const limbFor = (r, tip) => {
    const limb = figProfile(r).ikLimbs.find((l) => l.tip === tip);
    return limb && limb.chain.every((n) => r.joints[n]) ? limb : null;
  };
  // Mid-joint (elbow/knee) drag = aim: rotate the parent bone (shoulder/hip) so the
  // joint points at the cursor; the rest of the limb follows.
  const aimFor = (r, name) => {
    const limb = figProfile(r).ikLimbs.find((l) => l.chain[1] === name);
    return limb && r.joints[limb.chain[0]] && r.joints[name]
      ? { aim: true, parentName: limb.chain[0], jointName: name }
      : null;
  };
  // Foot-pinning (planted feet while you move/rotate the whole figure) needs every
  // planted limb IK-solvable; gates whether the 📌 feet button appears.
  const legsAreIkable = (r) => figProfile(r).plantedTips.every((t) => limbFor(r, t));

  // ── pose helpers (drive the ACTIVE figure) ───────────────────────────────────
  // These read the active figure's finger axes / rest pose / curl amounts via the
  // mutable `rig`, so they always pose whichever figure is selected.
  const curlBone = (bone, deg) => {
    const info = rig.digitInfo.get(bone);
    if (!info) return;
    bone.quaternion.copy(info.rest).multiply(new THREE.Quaternion().setFromAxisAngle(info.axis, deg * D2R));
  };
  // Aim a bone so the direction to `dirChild` points at a world target, by a 0–1
  // amount (slerp rest → fully aimed). Recomputed live so it tracks the current hand
  // orientation, and can't overshoot — at amount=1 it points exactly at the target.
  const aimBone = (bone, dirChild, targetWorld, amount) => {
    const restLocal = rig.rest.get(bone);
    if (!restLocal) return;
    bone.quaternion.copy(restLocal);
    bone.updateMatrixWorld(true);
    const base = bone.getWorldPosition(new THREE.Vector3());
    const dir = dirChild.getWorldPosition(new THREE.Vector3()).sub(base);
    const tgt = targetWorld.clone().sub(base);
    if (dir.lengthSq() < 1e-9 || tgt.lengthSq() < 1e-9) return;
    const aim = new THREE.Quaternion().setFromUnitVectors(dir.normalize(), tgt.normalize());
    const restWorld = bone.getWorldQuaternion(new THREE.Quaternion());
    const newWorld = new THREE.Quaternion().slerp(aim, amount).multiply(restWorld);
    const parentQ = (bone.parent || rig.root).getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(newWorld));
    bone.updateMatrixWorld(true);
  };
  // Curl one finger to a 0–1 amount: scale FINGER_PROFILE across the phalanges.
  const curlFinger = (wristName, finger, amount) => {
    const chain = rig.fingers?.[wristName]?.[finger];
    if (!chain) return;
    for (let i = 0; i < chain.length; i++) curlBone(chain[i], amount * (FINGER_PROFILE[i] ?? FINGER_PROFILE[FINGER_PROFILE.length - 1]));
  };
  // Thumb DOF: "thumb" (across) aims the metacarpal toward the finger bases so the
  // whole thumb sweeps across the palm to lie over the fingers (CMC flexion); "curl"
  // folds the phalanges about the thumb's bend normal (MCP/IP flexion).
  const curlThumb = (wristName, across, curl) => {
    const td = rig.thumbData.get(wristName);
    if (!td) return;
    const tgt = rig.fingers?.[wristName]?.middle?.[0] || rig.fingers?.[wristName]?.index?.[0];
    if (tgt && td.bones[1]) aimBone(td.bones[0], td.bones[1], tgt.getWorldPosition(new THREE.Vector3()), across);
    else if (rig.rest.get(td.bones[0])) td.bones[0].quaternion.copy(rig.rest.get(td.bones[0]));
    const rot = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * D2R);
    for (let i = 1; i < td.bones.length; i++) {
      td.bones[i].quaternion.copy(td.rest[i]).multiply(rot(td.curl[i], curl * (THUMB_CURL_DEG[i] ?? 0)));
    }
  };
  const applyHandAmounts = (wristName, amts) => {
    rig.handAmounts.set(wristName, amts);
    // Fingers only — the thumb is posed by its IK drag handle, so presets/sliders
    // must not reset it.
    for (const f of FINGER_ORDER) curlFinger(wristName, f, amts[f] ?? 0);
    rig.joints[wristName]?.updateMatrixWorld(true);
  };
  // Apply a captured raw-quaternion pose (POSE_PRESETS) to a hand: set each digit
  // bone from the stored RIGHT-hand quat, mirrored (x,-y,-z,w) for the left.
  const applyHandPose = (wristName, poseByBase) => {
    const flip = wristName.endsWith("L");
    const sideRe = flip ? /_l$/i : /_r$/i;
    for (const b of digitBones(rig)) {
      if (!sideRe.test(b.name)) continue;
      const q = poseByBase[b.name.replace(/_(l|r)$/i, "")];
      if (q) b.quaternion.set(q[0], flip ? -q[1] : q[1], flip ? -q[2] : q[2], q[3]);
    }
    rig.joints[wristName]?.updateMatrixWorld(true);
  };
  const applyFootPreset = (ankleName, key) => {
    const ball = rig.toes?.[ankleName];
    if (!ball || !(key in FOOT_PRESETS)) return;
    curlBone(ball, FOOT_PRESETS[key]);
    rig.joints[ankleName]?.updateMatrixWorld(true);
  };
  // Curl one toe to a 0–1 amount (independent of the whole-foot preset on the parent ball).
  const curlToe = (ankleName, idx, amount) => {
    const tb = rig.toeBones?.[ankleName]?.[idx];
    if (tb) curlBone(tb, amount * TOE_CURL_DEG);
    rig.joints[ankleName]?.updateMatrixWorld(true);
  };

  // ── per-figure setup ──────────────────────────────────────────────────────
  // Build all posing state onto `fig` (rest snapshots, morph setup, spine chain,
  // finger/toe bend axes, joint handles). Mirrors what the first figure used to get
  // inline, so a spawned figure is fully poseable. Everything addresses `fig`, not
  // the active `rig`, so it's safe to set up a figure before it's selected.
  // Some authored creature GLBs ship a curled bind pose (the cat's head folds to
  // the floor). profile.restPose pitches named bones in WORLD space into a natural
  // neutral, applied BEFORE rest capture so the corrected pose IS the rest the
  // figure resets / mirrors / head-drags from. Parent-worlds are read from the bind
  // pose (corrections don't compound) so the result matches what was authored.
  const applyProfileRestPose = (fig) => {
    const rp = figProfile(fig).restPose;
    if (!rp) return;
    const byName = new Map();
    fig.root.traverse((o) => { if (o.isBone) byName.set(o.name, o); });
    fig.root.updateMatrixWorld(true);
    const corrections = [];
    for (const { bone, axis, deg } of rp) {
      const b = byName.get(bone);
      if (!b || !deg) continue;
      const Qw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis[0], axis[1], axis[2]).normalize(), deg * Math.PI / 180);
      const pW = b.parent.getWorldQuaternion(new THREE.Quaternion());
      corrections.push([b, pW.clone().invert().multiply(Qw).multiply(pW)]);
    }
    for (const [b, c] of corrections) b.quaternion.premultiply(c);
    fig.root.updateMatrixWorld(true);
  };

  const initFigure = async (fig) => {
    fig.uid = figureUidSeq++; // stable identity (restore overrides with the saved uid)
    scene.add(fig.root);
    applyProfileRestPose(fig); // straighten an authored curl before rest is captured
    // Rest pose for "reset pose" (bind pose for a GLB, identity for capsules).
    fig.rest = new Map();
    fig.restPos = new Map(); // rest POSITIONS (fold + Ctrl-move translate bones)
    for (const j of Object.values(fig.joints)) { fig.rest.set(j, j.quaternion.clone()); fig.restPos.set(j, j.position.clone()); }
    fig.rootRest = fig.root.position.clone();
    // Rest WORLD orientation/position per joint name — the mirror routes motion-
    // from-rest through these so it's correct regardless of the rig's local-axis
    // convention. Captured in bind pose, before any restore.
    fig.root.updateMatrixWorld(true);
    fig.restWorld = new Map();
    fig.restWorldPos = new Map();
    for (const [name, j] of Object.entries(fig.joints)) {
      fig.restWorld.set(name, j.getWorldQuaternion(new THREE.Quaternion()));
      fig.restWorldPos.set(name, j.getWorldPosition(new THREE.Vector3()));
    }
    for (const b of digitBones(fig)) {
      fig.rest.set(b, b.quaternion.clone());
      fig.restPos.set(b, b.position.clone());
      fig.restWorld.set(b.name, b.getWorldQuaternion(new THREE.Quaternion()));
    }

    // Body-shape morph targets (height/weight/muscle/breast/hips/glutes). Surface
    // morphs (weight/muscle/breast/glutes) drive morphTargetInfluences (shape keys);
    // skeletal morphs (gender/height/hips — any bone delta) move the BONES directly
    // so handles + pivots track. A figure with no morphs leaves morphMesh null.
    fig.morphMesh = (fig.meshes || []).find((m) => m.morphTargetInfluences?.length) || null;
    fig.morphNames = [];
    fig.morphIndex = {};
    // skel/boneByName are RIG properties, not morph properties — bodies without
    // morph targets (e.g. the heavy man) still need them for full-skeleton pose
    // serialization/restore and skeleton-fit binding.
    fig.skel = (fig.meshes || []).find((m) => m.isSkinnedMesh && m.skeleton)?.skeleton || null;
    fig.boneByName = new Map();
    if (fig.skel) for (const b of fig.skel.bones) fig.boneByName.set(b.name, b);
    if (fig.morphMesh) {
      const dict = fig.morphMesh.morphTargetDictionary;
      if (dict) for (const [name, i] of Object.entries(dict)) { fig.morphNames[i] = name; fig.morphIndex[name] = i; }
      fig.morphMesh.morphTargetInfluences.forEach((_, i) => {
        if (fig.morphNames[i] == null) { fig.morphNames[i] = `morph ${i}`; fig.morphIndex[`morph ${i}`] = i; }
      });
      fig.boneRestPos = new Map(); // neutral bind local position per bone
      fig.curSkelRest = new Map(); // current skeletal-morph rest (fold/move ride on top)
      for (const b of fig.skel.bones) {
        fig.boneRestPos.set(b, b.position.clone());
        fig.curSkelRest.set(b, b.position.clone());
      }
      fig.morphBoneDeltas = await loadMorphDeltas(fig.body);
      fig.skeletalAmount = {}; // name -> -1..1 for bone-driven morphs
      fig.isSkeletalMorph = (name) => Object.keys(fig.morphBoneDeltas[name] || {}).length > 0;
    } else if (FIGURE_LIBRARY[bodyKeyOf(fig.body)].pack && fig.skel) {
      // Slider-engine body: no GPU morph targets — vertices are recomputed on the
      // CPU from the slider pack, bone rests ride the existing skeletal-morph
      // machinery via one synthetic morph (__custom). boneRestPos/curSkelRest only
      // exist in the morphMesh branch above, and applySkeletalMorph dies without
      // them — they MUST be created here.
      fig.boneRestPos = new Map();
      fig.curSkelRest = new Map();
      for (const b of fig.skel.bones) {
        fig.boneRestPos.set(b, b.position.clone());
        fig.curSkelRest.set(b, b.position.clone());
      }
      fig.skeletalAmount = {};
      fig.morphBoneDeltas = {};
      fig.isSkeletalMorph = () => false; // baked-morph predicate; the engine owns bones
      const pack = await loadSliderPack(fig.body);
      if (pack && !pack.failed) {
        fig.customEngine = makeCustomEngine(fig, pack);
        // Defaults reproduce the GLB exactly (blend - defaultBlend = 0); restore
        // mode because the figure may not be the active rig yet.
        fig.customEngine?.recompute({ restore: true });
      } else {
        fig._packFailed = true;
        showClipToast("body slider pack failed to load — figure is posable, sliders disabled", true);
      }
    }

    // Spine IK chain for the head handle: pelvis-up to head, excluding the leg-
    // parent pelvis so a head drag bends the spine only (not the legs).
    fig.spineChain = null;
    const pelvisBone = fig.joints.hipL?.parent || fig.joints.hipR?.parent || fig.joints.root;
    if (fig.joints.head && pelvisBone) {
      const chain = [];
      for (let b = fig.joints.head; b && b !== pelvisBone; b = b.parent) chain.unshift(b);
      if (chain.length >= 2 && chain[0].parent === pelvisBone) fig.spineChain = chain;
    }
    if (fig.spineChain) for (const b of fig.spineChain) if (!fig.rest.has(b)) fig.rest.set(b, b.quaternion.clone());

    // Per-phalanx bend data: each digit bone's rest local rotation + flex axis in
    // its own local frame. Fingers share one world axis (parallel knuckle line);
    // sign fixed by a geometric toward-wrist test (rig-agnostic); thumb in its own
    // bend plane; the foot's single ball bone signed so +angle drops the toe.
    fig.digitInfo = new Map();
    fig.thumbData = new Map();
    fig.handAmounts = new Map();
    const wpos = (b) => b.getWorldPosition(new THREE.Vector3());
    const signToward = (axis, pivotB, tipB, target) => {
      if (!target) return axis;
      const pivot = wpos(pivotB), tip = wpos(tipB);
      const moved = tip.clone().sub(pivot).applyAxisAngle(axis, 0.2).add(pivot);
      return moved.distanceTo(target) > tip.distanceTo(target) ? axis.negate() : axis;
    };
    const storeAxis = (b, axisW) => {
      const inv = b.getWorldQuaternion(new THREE.Quaternion()).invert();
      fig.digitInfo.set(b, { rest: b.quaternion.clone(), axis: axisW.clone().applyQuaternion(inv).normalize() });
    };
    for (const wrist of ["wristL", "wristR"]) {
      const hand = fig.fingers?.[wrist];
      if (!hand) continue;
      const wristPos = fig.joints[wrist] ? wpos(fig.joints[wrist]) : null;
      const i0 = hand.index?.[0], p0 = hand.pinky?.[0], m = hand.middle;
      const knuckle = (i0 && p0) ? wpos(p0).sub(wpos(i0)).normalize() : new THREE.Vector3(1, 0, 0);
      const fwd = (m?.length >= 2) ? wpos(m[m.length - 1]).sub(wpos(m[0])).normalize() : new THREE.Vector3(0, 1, 0);
      let palmN = new THREE.Vector3().crossVectors(fwd, knuckle);
      if (palmN.lengthSq() < 1e-8) palmN.set(0, 0, 1);
      palmN.normalize();
      for (const finger of Object.keys(hand)) {
        const chain = hand[finger];
        const tip = chain[chain.length - 1];
        if (finger === "thumb") {
          const s1 = wpos(chain[1]).sub(wpos(chain[0]));
          const s2 = chain[2] ? wpos(chain[2]).sub(wpos(chain[1])) : s1.clone();
          let nB = new THREE.Vector3().crossVectors(s1, s2);
          if (nB.lengthSq() < 1e-8) nB.copy(palmN);
          nB.normalize();
          const toLocal = (b, aw) => aw.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
          fig.thumbData.set(wrist, {
            bones: chain,
            curl: chain.map((b) => toLocal(b, nB)),
            rest: chain.map((b) => b.quaternion.clone()),
          });
          continue;
        }
        const fdir = chain.length >= 2 ? wpos(chain[1]).sub(wpos(chain[0])) : knuckle.clone();
        let ax = new THREE.Vector3().crossVectors(fdir, palmN);
        if (ax.lengthSq() < 1e-8) ax.copy(knuckle);
        ax = signToward(ax.normalize(), chain[0], tip, wristPos);
        for (const b of chain) storeAxis(b, ax);
      }
    }
    for (const ankleName of Object.keys(fig.toes || {})) {
      const ball = fig.toes[ankleName];
      const ankle = fig.joints[ankleName], knee = fig.joints[ankleName.replace("ankle", "knee")];
      let axisW = new THREE.Vector3(1, 0, 0);
      if (ankle && knee) {
        axisW.crossVectors(wpos(ball).sub(wpos(ankle)), wpos(ankle).sub(wpos(knee)));
        if (axisW.lengthSq() < 1e-8) axisW.set(1, 0, 0);
        const bp = wpos(ball);
        const moved = bp.clone().sub(wpos(ankle)).applyAxisAngle(axisW.normalize(), 0.2).add(wpos(ankle));
        if (moved.y > bp.y) axisW.negate();
      }
      storeAxis(ball, axisW.normalize()); // whole-foot flex preset still curls the ball (parent of the toes)
    }
    fig.footAmounts = new Map(); // legacy (per-toe slider, now hidden) — kept so dead refs don't throw
    // Each toe is now a 2-bone digit posed by its tip IK handle (built below) — NOT a curl axis.
    // Capture each toe bone's REST quaternion so toeQuats can restore poses and reset cleanly.
    fig.toeRest = new Map();
    for (const k of Object.keys(fig.toeChains || {})) for (const ch of fig.toeChains[k]) for (const b of ch) fig.toeRest.set(b, b.quaternion.clone());

    // Joint handles for this figure, in its OWN group under handlesRoot (so only
    // the active figure's handles are shown/raycast). Diamonds = IK limb tips,
    // spheres = FK joints. The pelvis (root) is NOT a handle: the whole figure is
    // moved/rotated by selecting it as an object (gizmo on its scene root), like a
    // prop — so there's no stray pivot dot to confuse it with joint posing. Drawn
    // over the body, hidden from capture.
    fig.footPins = Object.fromEntries(figProfile(fig).plantedTips.map((t) => [t, null]));
    fig.handlesGroup = new THREE.Group();
    fig.handlesGroup.visible = false; // only the active figure's group is shown (setActiveFigure + hover gate)
    handlesRoot.add(fig.handlesGroup);
    fig.handles = [];
    for (const name of figProfile(fig).joints) {
      if (name === "root") continue; // the pelvis is posed via whole-figure selection, not a joint handle
      const joint = fig.joints[name];
      if (!joint) continue;
      const limb = limbFor(fig, name)
        || (name === "head" && fig.spineChain ? { spine: true, bones: fig.spineChain } : null)
        || aimFor(fig, name);
      const kind = limb ? "ik" : "fk";
      const mesh = new THREE.Mesh(
        limb ? ikGeo : fkGeo,
        new THREE.MeshBasicMaterial({ color: HANDLE[kind], transparent: true, opacity: 0.22, depthTest: false })
      );
      mesh.renderOrder = 999;
      mesh.userData = { joint, kind, base: HANDLE[kind], limb, name };
      fig.handlesGroup.add(mesh);
      fig.handles.push(mesh);
    }
    // A fingertip IK diamond on every digit (thumb + 4 fingers, both hands): grab the tip and
    // the two proximal phalanges bend via the same two-bone IK as the limbs, so the finger
    // curls to follow. The pole is the digit's own current bend direction — it's only consulted
    // when a finger is perfectly straight (otherwise the solve keeps the finger's existing bend
    // plane), so a dead-straight finger folds toward the palm instead of hyperextending.
    for (const wrist of ["wristL", "wristR"]) {
      const hand = fig.fingers?.[wrist];
      if (!hand) continue;
      for (const finger of Object.keys(hand)) {
        const chain = hand[finger];
        if (!chain || chain.length < 3) continue;
        const aP = wpos(chain[0]), midP = wpos(chain[1]), cP = wpos(chain[2]);
        const ac = cP.clone().sub(aP), acLen2 = ac.lengthSq() || 1, am = midP.clone().sub(aP);
        const poleV = am.clone().sub(ac.clone().multiplyScalar(am.dot(ac) / acLen2)); // mid's offset from the a→tip line = the bend bulge side
        if (poleV.lengthSq() < 1e-9) poleV.set(0, -0.4, -1); // dead-straight finger → palm-ward default
        poleV.normalize();
        const limb = { bones: [chain[0], chain[1], chain[2]], pole: [poleV.x, poleV.y, poleV.z] };
        const mesh = new THREE.Mesh(ikGeo, new THREE.MeshBasicMaterial({ color: HANDLE.ik, transparent: true, opacity: 0.22, depthTest: false }));
        mesh.renderOrder = 999;
        mesh.userData = { joint: chain[2], kind: "ik", base: HANDLE.ik, limb, finger: true, thumb: finger === "thumb" };
        fig.handlesGroup.add(mesh);
        fig.handles.push(mesh);
      }
    }
    // Each TOE is a 2-bone digit (proximal + distal) driven by the SAME two-bone IK as the
    // fingers: a tip grab handle, solveTwoBoneIK bends both segments so the tip follows the
    // cursor and the toe curls at its knuckle. The distal bone has no tail node in the GLB, so
    // the tip is reconstructed: project the distal bone's own verts onto the toe's forward axis
    // (MCP→PIP) and place the marker at the 90th-percentile forward extent. Projection discards
    // lateral position, so an inward-curving or stray vert can no longer pull a tip sideways
    // onto the neighbour toe (the old "farthest weighted vert" did exactly that — adjacent tips
    // piled onto one toe and left another bare). The marker is the IK effector AND the handle.
    const toeSkin = fig.toeChains && fig.meshes.find((m) => m.isSkinnedMesh && m.skeleton?.bones?.some((b) => /^toe\d_2_(l|r)$/.test(b.name)));
    if (toeSkin) {
      fig.root.updateMatrixWorld(true);
      toeSkin.skeleton.update();
      const bones = toeSkin.skeleton.bones;
      const si = toeSkin.geometry.attributes.skinIndex, sw = toeSkin.geometry.attributes.skinWeight;
      const idxToDist = new Map(); // distal bone's skeleton index → bone
      const distAim = new Map();   // distal bone → { axis, head, verts:[{p,u}] }
      for (const k of Object.keys(fig.toeChains)) for (const ch of fig.toeChains[k]) {
        const prox = ch[0], d = ch[ch.length - 1];
        const head = prox.getWorldPosition(new THREE.Vector3()); // MCP (toe base) so `u` spans the WHOLE toe
        const axis = d.getWorldPosition(new THREE.Vector3()).sub(head).normalize();
        idxToDist.set(bones.indexOf(d), d);
        idxToDist.set(bones.indexOf(prox), d); // proximal verts contribute too → lateral centre is the toe's middle, not its inward-angled tip
        distAim.set(d, { axis, head, verts: [] });
      }
      const vtmp = new THREE.Vector3();
      for (let v = 0; v < si.count; v++) {
        let bi = -1, bw = 0;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; bi = si.getComponent(v, k); } }
        const d = idxToDist.get(bi);
        if (!d) continue;
        const aim = distAim.get(d);
        toeSkin.getVertexPosition(v, vtmp); const wp = vtmp.clone().applyMatrix4(toeSkin.matrixWorld);
        const u = wp.clone().sub(aim.head).dot(aim.axis);
        if (u > 0) aim.verts.push({ p: wp, u });
      }
      for (const k of Object.keys(fig.toeChains)) for (const ch of fig.toeChains[k]) {
        const prox = ch[0], dist = ch[ch.length - 1];
        const aim = distAim.get(dist);
        // Tip = CENTROID of the toe's forward tip band (its own most-forward 30% of verts), so the
        // marker sits on the toe's LATERAL CENTRE. The old axis projection drifted inward (toes
        // angle toward the midline), pushing the wide big-toe marker off onto its neighbour —
        // one toe ended up with two diamonds and one (the big toe) with none.
        let tipW;
        if (aim.verts.length) {
          aim.verts.sort((a, b) => a.u - b.u);
          const band = aim.verts.slice(Math.floor(aim.verts.length * 0.7)); // forward tip band → dorsal height + forward reach
          let by = 0, bz = 0; for (const e of band) { by += e.p.y; bz += e.p.z; } by /= band.length; bz /= band.length;
          // LATERAL position = the toe's full vertex centre (its lobe centre), NOT the tip verts:
          // the toes angle toward the midline, so the tip is inboard of the toe and using it bunched
          // the markers (the wide big toe lost its diamond to the neighbour). Centre laterally, keep
          // the tip's depth/height so the diamond still sits at the front of the toe.
          let cx = 0; for (const e of aim.verts) cx += e.p.x; cx /= aim.verts.length;
          tipW = new THREE.Vector3(cx, by, bz);
        } else {
          tipW = aim.head.clone().addScaledVector(aim.axis, 0.02);
        }
        const tip = new THREE.Object3D();
        dist.add(tip); dist.updateMatrixWorld(true);
        tip.position.copy(dist.worldToLocal(tipW.clone()));
        // Bend plane (pole): the PIP's offset from the MCP→tip line; default DORSAL (up) so
        // dragging the tip down curls the toe under (knuckle bulges up), like fingers fold.
        const aP = prox.getWorldPosition(new THREE.Vector3());
        const midP = dist.getWorldPosition(new THREE.Vector3());
        const cP = tip.getWorldPosition(new THREE.Vector3());
        const ac = cP.clone().sub(aP); const acL2 = ac.lengthSq() || 1;
        const pole = midP.clone().sub(aP); pole.addScaledVector(ac, -pole.dot(ac) / acL2);
        if (pole.lengthSq() < 1e-9) pole.set(0, 1, 0);
        pole.normalize();
        const mesh = new THREE.Mesh(ikGeo, new THREE.MeshBasicMaterial({ color: HANDLE.ik, transparent: true, opacity: 0.22, depthTest: false }));
        mesh.renderOrder = 999;
        mesh.userData = { joint: tip, kind: "ik", base: HANDLE.ik, limb: { bones: [prox, dist, tip], pole: [pole.x, pole.y, pole.z] }, finger: true, toe: true };
        fig.handlesGroup.add(mesh);
        fig.handles.push(mesh);
      }
    }
    return fig;
  };

  // Render-time: keep the ACTIVE figure's handles glued to its joints, scaled to
  // stay grabbable; inactive figures' handle groups are hidden.
  const updateHandles = () => {
    // Imported-prop 🦴 handles sync FIRST: they are figure-independent, and the
    // rig-null early-return below otherwise orphans them in a figure-less scene
    // (all handles stacked at the origin at unit scale = one giant blue ball).
    updatePropBoneHandles();
    // Selection ring tracks the active figure's base; only shown with a cast to pick
    // between. Amber while armed = "Del removes this one".
    const multi = figures.length > 1;
    selectionRing.visible = multi;
    if (multi && rig) {
      const p = rig.root.getWorldPosition(new THREE.Vector3());
      selectionRing.position.set(p.x, 0.012, p.z);
      const armed = selectedFigure === rig; // selected as an object → Del removes it
      selectionRing.material.color.setHex(armed ? 0xffb24a : 0x46b1ff);
      selectionRing.material.opacity = armed ? 0.8 : 0.45;
    }
    if (!rig?.handles) return;
    rig.handlesGroup.visible = handlesShouldShow();
    for (const h of rig.handles) {
      // A bound import follows whole-hand only (its fingers don't match the
      // mannequin's), so a fingertip IK diamond would move an invisible bone and
      // nothing else — hide them rather than offer dead controls.
      const dead = !!rig.skinBind && h.userData.finger;
      h.visible = !dead;
      if (dead) continue;
      h.userData.joint.getWorldPosition(h.position);
      const d = h.position.distanceTo(camera.position);
      // Fingertip diamonds are small so they read as digits, not the larger wrist
      // (hand-reach) diamond sitting right next to them.
      const sizeMul = h.userData.finger ? 0.7 : (h.userData.kind === "ik" ? 1.3 : 1);
      // Cap pixel growth in a large (fullscreen) frame; node sizes (<= ref) are unchanged.
      const vpScale = Math.min(1, HANDLE_REF_H / Math.max(1, frameH));
      h.scale.setScalar(Math.max(0.005, d * HANDLE_SIZE * vpScale) * sizeMul);
      // Faint until reached for: bright when hovered, when its joint is selected
      // for the rotate gizmo, or while its IK tip is being dragged.
      const lit = h === hoveredHandle
        || transformControls.object === h.userData.joint
        || h.userData.name === selectedJointName // selected in move mode (gizmo is on the IK proxy)
        || (ik.active && ik.handle === h)
        || !!skinFit; // fitting a skeleton: full brightness, these ARE the UI right now
      const pinned = !!rig.footPins[h.userData.name];
      h.material.opacity = (lit || pinned) ? HANDLE_BRIGHT : HANDLE_DIM;
      h.material.color.setHex(h === hoveredHandle ? HANDLE.hover : pinned ? HANDLE.pin : h.userData.base);
    }
    // Keep the move gizmo glued to its wrist/ankle except while it's being dragged (the
    // drag IS moving the proxy). So after a free diamond-drag or any other pose change the
    // gizmo follows the joint instead of floating where it last sat.
    if (transformControls.object === ikMoveProxy && !transformControls.dragging && selectedJointName)
      rig?.joints[selectedJointName]?.getWorldPosition(ikMoveProxy.position);
  };

  // Make `fig` the active figure: show only its handles, retarget the gizmo/panels.
  // null = NO active figure (the cast is empty) — every rig consumer is guarded.
  const setActiveFigure = (fig) => {
    rig = fig || null;
    for (const f of figures) if (f.handlesGroup) f.handlesGroup.visible = (f === rig);
    if (node._pcrPose) node._pcrPose.rig = rig;
    detachGizmo();        // drop any selection on the previous figure's joint
    buildBodySliders(rig); // a different BODY ships a different slider set
    syncBodySliders();    // body-shape sliders reflect this figure
    requestRender();
  };

  // Spawn another person: load a fresh GLB instance, set it up, stand it to the
  // side, and select it. Used by the toolbar button (body picked from the
  // FIGURE_LIBRARY flyout when there's more than one) and by restore-on-reload.
  const spawnFigure = async ({ select = true, capture = true, body = DEFAULT_BODY } = {}) => {
    if (!node._pcrAlive) return null;
    const fig = (await loadGlbFigure(THREE, GLTFLoader, figureUrl(body), rigProfileOf(body))) || buildFigure(THREE);
    if (!node._pcrAlive) return null;
    fig.body = bodyKeyOf(body); // before initFigure — it loads this body's morph deltas
    fig.profile = rigProfileOf(body); // rig vocabulary (joints/IK/mirror/pins) — before initFigure builds handles
    await initFigure(fig); // adds fig.root to scene + fig.handlesGroup to handlesRoot
    // Teardown can land during initFigure's await; if so, free this figure instead of
    // leaving its GLB attached to an already-disposed scene (a leaked skinned mesh).
    if (!node._pcrAlive) {
      scene.remove(fig.root);
      if (fig.handlesGroup) handlesRoot.remove(fig.handlesGroup);
      disposeFigure(fig);
      return null;
    }
    fig.root.position.x += figures.length * 0.7; // stand each new person to the side
    fig.root.updateMatrixWorld(true);
    fig.rootRest = fig.root.position.clone();
    figures.push(fig);
    updateFigureLabels();
    if (select) setActiveFigure(fig);
    requestRender();
    if (capture) captureAndUpload(node);
    return fig;
  };

  // Free a removed figure's GPU resources. Everything under fig.root is owned by that
  // GLB/capsule instance (nothing shared), so traversing it is safe; the handle MESHES
  // carry their own materials but SHARE ikGeo/fkGeo with every figure, so only their
  // materials are disposed — never the geometry.
  const disposeFigure = (fig) => {
    fig.root.traverse((o) => {
      o.geometry?.dispose?.();
      disposeMaterial(o.material); // material + its textures (incl. hidden eye/extra sub-meshes)
    });
    for (const h of fig.handles || []) h.material?.dispose?.(); // handle materials have no textures; geometry is shared
  };

  // Remove a person from the scene. The last figure is never removed (there's always
  // an active rig). Undoable: applyHistory reconciles the cast count, so the figure
  // and its pose come back on undo. capture=false during history replay to avoid
  // re-recording.
  const removeFigure = (fig, { capture = true } = {}) => {
    // The LAST figure is deletable too: imported meshes / named props make
    // figure-less scenes legitimate (a statue-only composition). 👤 re-adds.
    if (!fig) return;
    const idx = figures.indexOf(fig);
    if (idx === -1) return;
    // Drop any selection that points at this figure before it's gone (clear selectedFigure
    // first so clearFigureSelection doesn't touch the about-to-be-disposed material).
    if (selectedFigure === fig) selectedFigure = null;
    removeAttachmentsForFigure(fig); // drop any prop pinned to this figure's joints
    if (transformControls.object === fig.root ||
        (transformControls.object && Object.values(fig.joints).includes(transformControls.object))) detachGizmo();
    scene.remove(fig.root);
    handlesRoot.remove(fig.handlesGroup);
    disposeFigure(fig);
    figures.splice(idx, 1);
    updateFigureLabels(); // renumber remaining figures' labels
    if (rig === fig) setActiveFigure(figures.length ? figures[Math.min(idx, figures.length - 1)] : null);
    cancelPinPick(); // re-enable the gizmo if a link was mid-pick
    updatePinBtn();
    updateFigureUI();
    requestRender();
    if (capture) captureAndUpload(node);
  };

  // Floating "mannequinN" name labels above each figure so it's clear which figure
  // each $mannequinN region block targets. Viewport-only — hidden during the
  // control-map and mask captures so they never leak into depth maps / silhouettes.
  const makeLabelSprite = (text) => {
    // Drawn as the region syntax the name IS ("$mannequin2"), in a fitted
    // rounded pill with breathing room — not a bare full-width bar.
    const label = "$" + text;
    const cnv = document.createElement("canvas");
    cnv.width = 256; cnv.height = 64;
    const ctx = cnv.getContext("2d");
    ctx.font = "600 23px sans-serif"; // smaller type inside a roomier pill (reference look)
    // Long custom names shrink to keep the pill inside the canvas.
    let w = ctx.measureText(label).width;
    if (w > 200) {
      ctx.font = `600 ${Math.max(13, Math.floor(23 * 200 / w))}px sans-serif`;
      w = ctx.measureText(label).width;
    }
    const padX = 24, pillH = 46, pillW = Math.min(252, w + padX * 2);
    ctx.fillStyle = "rgba(12,12,16,0.88)";
    ctx.beginPath();
    ctx.roundRect(128 - pillW / 2, (64 - pillH) / 2, pillW, pillH, 9);
    ctx.fill();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff9d5c";
    ctx.fillText(label, 128, 33);
    const tex = new THREE.CanvasTexture(cnv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, opacity: 0.9 }));
    sp.scale.set(0.7, 0.175, 1);
    sp.position.set(0, 1.8, 0); // just above the head, in figure-root local space
    sp.renderOrder = 999;
    return sp;
  };
  const updateFigureLabels = () => {
    figures.forEach((f, i) => {
      const name = f.customName || "mannequin" + (i + 1);
      if (f._label && f._labelText === name) return; // unchanged
      if (f._label) { f.root.remove(f._label); f._label.material.map?.dispose(); f._label.material.dispose(); }
      const sp = makeLabelSprite(name);
      f.root.add(sp);
      f._label = sp; f._labelText = name;
    });
    // No requestRender here — callers (spawn/remove/first-figure setup) render after,
    // and requestRender is defined later in setup (calling it here = TDZ crash).
  };
  const setLabelsVisible = (v) => {
    for (const f of figures) if (f._label) f._label.visible = v;
    // Prop labels too — same rule, labels are viewport-only and must never
    // reach the control map or a silhouette mask (the named prop's own pass
    // would otherwise bake its label into its region mask).
    for (const m of propsGroup.children) if (m._pcrLabel) m._pcrLabel.visible = v;
  };
  // Keep labels a roughly constant on-screen size regardless of zoom (world-space
  // sprites otherwise balloon as you dolly in) AND clamp them inside the viewport
  // so they never slide off when you zoom in or a figure nears a border — the
  // label hugs the nearest edge, staying above (or as close as possible to) the
  // head. Must run after camera.updateProjectionMatrix() so project/unproject use
  // the frame's actual aspect.
  const _labelAnchor = new THREE.Vector3();
  const _labelNdc = new THREE.Vector3();
  const _labelScale = new THREE.Vector3();
  const scaleLabelsForCamera = () => {
    let cameraReady = false;
    for (const f of figures) {
      const sp = f._label;
      if (!sp || !sp.visible) continue;
      if (!cameraReady) { camera.updateMatrixWorld(); cameraReady = true; }
      f.root.updateWorldMatrix(true, false); // localToWorld/worldToLocal need it fresh

      // Natural anchor: just above the LIVE head bone — a fixed root-space
      // height sat inside tall bodies (height slider, big templates) and
      // ignored posing entirely. Clearance is WORLD-space: root scale is a unit
      // conversion (human ~0.96, the cm-unit horse 0.008), not figure size —
      // scaling by it collapsed the gap to millimeters on creature GLBs.
      const headJ = f.joints?.head;
      if (headJ) {
        headJ.getWorldPosition(_labelAnchor);
        _labelAnchor.y += 0.32;
      } else {
        _labelAnchor.set(0, 1.8, 0); // capsule/odd rigs: the old fixed anchor
        f.root.localToWorld(_labelAnchor);
      }
      const dist = camera.position.distanceTo(_labelAnchor);
      const h = dist * 0.035; // screen-size factor; sprite canvas is 4:1
      // Counter-scale by the root's baked unit scale, exactly like prop labels
      // (updatePropLabels): the sprite is a CHILD of fig.root, so a cm-unit GLB
      // otherwise renders its label at 0.8% size — an invisible speck the user
      // can't see or dblclick-rename.
      f.root.getWorldScale(_labelScale);
      sp.scale.set(h * 4 / (_labelScale.x || 1), h / (_labelScale.y || 1), 1);

      // Half-extents of the view at the label's depth → NDC margins that keep the
      // whole sprite on screen. The sprite inherits the figure root's baked scale
      // (~1.8/native-height), so fold that into its effective on-screen size.
      f.root.getWorldScale(_labelScale);
      const viewHalfH = dist * Math.tan((camera.fov * Math.PI / 180) / 2);
      const viewHalfW = viewHalfH * camera.aspect;
      const marginY = Math.min(0.9, (sp.scale.y * _labelScale.y / 2) / viewHalfH);
      const marginX = Math.min(0.9, (sp.scale.x * _labelScale.x / 2) / viewHalfW);

      // Clamp the anchor's projected position into that box, then unproject back so
      // the sprite slides along the screen plane (same depth → constant size).
      _labelNdc.copy(_labelAnchor).project(camera);
      _labelNdc.x = Math.max(-1 + marginX, Math.min(1 - marginX, _labelNdc.x));
      _labelNdc.y = Math.max(-1 + marginY, Math.min(1 - marginY, _labelNdc.y));
      _labelNdc.unproject(camera);
      f.root.worldToLocal(_labelNdc);
      sp.position.copy(_labelNdc);
    }
  };

  // The first figure (always present). Spawned as the baked DEFAULT_BODY here
  // because the custom slider-engine machinery (requestRender, makeCustomEngine,
  // …) is defined further down this function and would TDZ if a custom body
  // initialised at this point. A FRESH node is upgraded to the custom slider body
  // right after restoreSavedState (once that machinery exists); old saves restore
  // their own body via reconcileCast.
  if (!node._pcrAlive) return;
  {
    const fig = (await loadGlbFigure(THREE, GLTFLoader, figureUrl(DEFAULT_BODY), rigProfileOf(DEFAULT_BODY))) || buildFigure(THREE);
    if (!node._pcrAlive) return;
    fig.body = DEFAULT_BODY;
    fig.profile = rigProfileOf(DEFAULT_BODY);
    await initFigure(fig);
    if (!node._pcrAlive) { scene.remove(fig.root); if (fig.handlesGroup) handlesRoot.remove(fig.handlesGroup); disposeFigure(fig); return; }
    figures.push(fig);
    rig = fig;
    fig.handlesGroup.visible = true;
  }
  updateFigureLabels();
  // Regional: if this Poser is wired to an Attention Couple (e.g. the [add]
  // regional branch just connected MASKS), seed the bound prompt with
  // $mannequin1 now that the first figure exists. No-op otherwise; adding more
  // people tops it up on each capture.
  reconcileRegionBlocks(node, effectiveFigureNames(figures)); // no props exist yet at mount
  ensureReverseRegionSync(node); // observe the bound prompt for typed $name{} renames
  // Let external triggers (the regional [add]) re-run the block sync after they
  // wire MASKS->couple, since pure rewiring fires no capture. Reads live names —
  // figures and named props (liveEntityNames hoists; props exist by call time).
  node._pcrReconcileRegions = () => { reconcileRegionBlocks(node, liveEntityNames()); ensureReverseRegionSync(node); };

  // Orbit listens on the canvas (same element as the posing handlers + transform gizmo,
  // so pointer capture is shared and selection/gizmo dragging keep working). The canvas
  // fills the node body's width, so this rotates the whole viewport — the dead left strip
  // was the toolbar's invisible box, now made click-through (pointer-events:none) below.
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false; // dolly handled by the window-capture wheel handler
  controls.enableDamping = false; // damping needs a render loop; we stay event-driven
  controls.target.set(0, 1.0, 0);
  // Left orbits, right pans. Middle is left to LiteGraph (it pans the ComfyUI
  // graph and can't be reliably reclaimed from inside a DOM widget).
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: THREE.MOUSE.PAN };
  controls.update();
  const HOME = { pos: camera.position.clone(), target: controls.target.clone() };

  // Target control-map resolution drives the framing — the viewport letterboxes
  // to this aspect so what you pose is exactly the output frame.
  const wWidget = node.widgets?.find((w) => w.name === "width");
  const hWidget = node.widgets?.find((w) => w.name === "height");
  const getW = () => Math.max(64, Math.round(wWidget?.value || 1024));
  const getH = () => Math.max(64, Math.round(hWidget?.value || 1216));
  const FRAME_BG = 0x24242b; // inside the output frame (the GL canvas)

  // Fit the GL canvas to the target-aspect frame, centered in the node body; the
  // node background shows around it as the letterbox bars. Sizing the canvas to
  // the frame (rather than letterboxing INSIDE a full-bleed canvas) keeps pointer
  // math correct: canvas pixels === frame pixels, so raycasts AND the
  // TransformControls gizmo line up no matter how the node is stretched.
  let frameW = 1, frameH = 1;
  const fitCanvas = () => {
    const cw = Math.max(1, container.clientWidth);
    const ch = Math.max(1, container.clientHeight);
    const aspect = getW() / getH();
    let vw = cw, vh = cw / aspect;
    if (vh > ch) { vh = ch; vw = ch * aspect; }
    frameW = Math.max(1, Math.round(vw));
    frameH = Math.max(1, Math.round(vh));
    canvas.style.left = Math.round((cw - frameW) / 2) + "px";
    canvas.style.top = Math.round((ch - frameH) / 2) + "px";
    renderer.setSize(frameW, frameH, true); // updateStyle: also sets canvas CSS w/h
  };

  // ── Blender-style selection outlines (screen-space) ────────────────────────
  // Port of Blender's overlay_outline pass: outlined objects re-render FLAT into
  // an offscreen ID buffer that shares the scene's depth (a depth prepass of all
  // content), so only their VISIBLE pixels land there — outlines hug visible
  // silhouettes, occluders clip them, and a seam appears where two outlined
  // objects touch on screen. A fullscreen edge-detect then draws constant-width
  // lines over the canvas: bright orange for the ACTIVE object, darker orange
  // for other selected ones (Blender's theme colors). The pass only runs in
  // renderFrame — the offscreen capture/mask renders never see any of it.
  const OUTLINE_ACTIVE = 0xffaa40;   // Blender "active object"
  const OUTLINE_SELECTED = 0xed5700; // Blender "object selected"
  const OUTLINE_PX = 2.0;            // line width in device pixels
  const OUTLINE_LAYER = 30;          // scratch layer for the per-set ID renders
  const outlineDepthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  const outlineSelMat = new THREE.MeshBasicMaterial({ color: OUTLINE_SELECTED });
  const outlineActMat = new THREE.MeshBasicMaterial({ color: OUTLINE_ACTIVE });
  let outlineTarget = null;
  const outlineQuadGeo = new THREE.BufferGeometry(); // fullscreen triangle
  outlineQuadGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  outlineQuadGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const outlineQuadMat = new THREE.ShaderMaterial({
    uniforms: { tId: { value: null }, texelSize: { value: new THREE.Vector2() }, radius: { value: OUTLINE_PX } },
    vertexShader: "varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: [
      "uniform sampler2D tId;",
      "uniform vec2 texelSize;",
      "uniform float radius;",
      "varying vec2 vUv;",
      "void main() {",
      "  vec4 c = texture2D(tId, vUv);",
      "  vec4 best = vec4(0.0);",
      "  bool seam = false;",
      "  vec2 o[8];",
      "  o[0] = vec2(1.0, 0.0); o[1] = vec2(-1.0, 0.0); o[2] = vec2(0.0, 1.0); o[3] = vec2(0.0, -1.0);",
      "  o[4] = vec2(0.7071, 0.7071); o[5] = vec2(-0.7071, 0.7071); o[6] = vec2(0.7071, -0.7071); o[7] = vec2(-0.7071, -0.7071);",
      "  for (int i = 0; i < 8; i++) {",
      "    vec4 n = texture2D(tId, vUv + o[i] * texelSize * radius);",
      "    if (n.a < 0.5) continue;",
      "    if (c.a > 0.5 && distance(n.rgb, c.rgb) > 0.08) seam = true;",
      "    if (best.a < 0.5 || dot(n.rgb, vec3(1.0)) > dot(best.rgb, vec3(1.0))) best = n;",
      "  }",
      "  vec3 col = vec3(0.0);",
      "  if (c.a < 0.5 && best.a > 0.5) col = best.rgb;            // exterior rim",
      "  else if (c.a > 0.5 && seam) col = max(c.rgb, best.rgb);   // boundary between two outlined objects",
      "  else discard;",
      "  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);         // RT is linear; canvas wants sRGB",
      "}",
    ].join("\n"),
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const outlineQuad = new THREE.Mesh(outlineQuadGeo, outlineQuadMat);
  outlineQuad.frustumCulled = false;
  const outlineScene = new THREE.Scene();
  outlineScene.add(outlineQuad);
  const outlineCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // shader ignores it; render() requires one
  const _obSize = new THREE.Vector2();
  // active = what the gizmo is on (bright); selected = everything else that reads
  // as selected — band-select members and props the active figure carries (the
  // same "figure plus what it carries" semantics its region mask uses).
  const collectOutlineSets = () => {
    const active = [], selected = [];
    if (selectedFigure) {
      active.push(selectedFigure.root);
      for (const m of propsGroup.children)
        if (m.visible && figureOwningProp(m) === selectedFigure) selected.push(m);
    }
    if (selectedProp?.visible) active.push(selectedProp);
    for (const s of bandSel) selected.push(s.kind === "figure" ? s.o.root : s.o);
    return { active, selected };
  };
  const drawOutlineSet = (roots, mat) => {
    if (!roots.length) return;
    const tagged = [];
    for (const r of roots) r.traverse((obj) => { if (obj.isMesh) { obj.layers.enable(OUTLINE_LAYER); tagged.push(obj); } });
    const prevMask = camera.layers.mask;
    camera.layers.set(OUTLINE_LAYER);
    scene.overrideMaterial = mat;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.mask = prevMask;
    for (const obj of tagged) obj.layers.disable(OUTLINE_LAYER);
  };
  const renderOutlinePass = () => {
    const sets = collectOutlineSets();
    if (!sets.active.length && !sets.selected.length) return;
    renderer.getDrawingBufferSize(_obSize);
    if (!outlineTarget || outlineTarget.width !== _obSize.x || outlineTarget.height !== _obSize.y) {
      outlineTarget?.dispose();
      outlineTarget = new THREE.WebGLRenderTarget(_obSize.x, _obSize.y, {
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      });
    }
    // Viewport aids must neither occlude the outlines nor get outlined.
    const aidVis = [grid.visible, tcHelper.visible, handlesRoot.visible];
    grid.visible = tcHelper.visible = handlesRoot.visible = false;
    setLabelsVisible(false);
    const prevAutoClear = renderer.autoClear;
    try {
      renderer.setRenderTarget(outlineTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.autoClear = false; // the set renders must not wipe the prepass depth
      scene.overrideMaterial = outlineDepthMat; // depth prepass: all content occludes
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      drawOutlineSet(sets.selected, outlineSelMat);
      drawOutlineSet(sets.active, outlineActMat);
      renderer.setRenderTarget(null);
      outlineQuadMat.uniforms.tId.value = outlineTarget.texture;
      outlineQuadMat.uniforms.texelSize.value.set(1 / _obSize.x, 1 / _obSize.y);
      renderer.render(outlineScene, outlineCam); // composite over the live canvas
    } finally {
      renderer.autoClear = prevAutoClear;
      scene.overrideMaterial = null;
      renderer.setRenderTarget(null);
      grid.visible = aidVis[0]; tcHelper.visible = aidVis[1]; handlesRoot.visible = aidVis[2];
      setLabelsVisible(true);
    }
  };

  const renderFrame = () => {
    // A queued rAF can fire after the node was torn down/rebuilt (e.g. a graph
    // reload races our undo): rendering then hits a disposed renderer/context and
    // throws deep in THREE's shader code. Skip stale frames, and never let a render
    // error escape as an uncaught exception.
    if (!node._pcrAlive) return;
    // A repaint interleaving the mask-capture loop (its per-figure toBlob await
    // yields to rAF) resets the clear color to FRAME_BG and the viewport to the
    // screen size — later figures' masks then capture on a gray background that
    // downstream binarization reads as "figure" (full-canvas mask = total
    // prompt bleed). The capture's finally re-queues a repaint.
    if (captureBusy) return;
    enforceAttachments();      // pinned props ride their leader (hand/prop) before we draw
    updateAttachConnectors();
    updateHandles();
    renderer.setViewport(0, 0, frameW, frameH);
    renderer.setClearColor(FRAME_BG, 1);
    camera.aspect = frameW / frameH;
    camera.updateProjectionMatrix();
    scaleLabelsForCamera();    // constant on-screen size + clamp inside viewport (needs current projection)
    try {
      renderer.render(scene, camera);
      renderOutlinePass(); // Blender-style selection outlines, composited on top
    }
    catch (err) { console.warn("[PoseStudio] render skipped:", err?.message || err); }
  };

  // Event-driven render: render once per change, never a perpetual rAF loop
  // (CLAUDE.md: event-driven only).
  let renderQueued = false;
  const requestRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; renderFrame(); });
  };

  // Capture the control map at the exact target resolution, independent of the
  // node-body size. Render into an offscreen target (so the visible canvas never
  // flickers) with sRGB output to match the viewport, read it back, flip Y, and
  // pack to PNG.
  // Rubber-band multi-select (defined far below; forward-declared so captureBlob and
  // the single-select helpers above can reference them — assigned at runtime).
  let clearBand = () => {};
  let bandActive = () => false;
  const bandSel = []; // [{ kind:'figure'|'prop', o }] — feeds the outline pass too

  let captureTarget = null;
  let brushCursor = null; // clothing-paint brush footprint ring (viewport aid; assigned later)
  let sculptRing = null;  // sculpt brush footprint ring (viewport aid; assigned in the sculpt block below)
  let sculptWire = null;  // sculpt "show mesh" wireframe overlay (viewport aid; assigned in the sculpt block below)
  // ── True geometric depth output (toggle: node.properties.pcrTrueDepth) ─────────
  // Instead of letting a downstream monocular estimator (DepthAnythingV2) guess depth
  // from the clay render — which flattens thin clothing — output the REAL z-depth of
  // the scene. We render the scene NORMALLY into a target that has a DepthTexture (so
  // every vertex-shader offset, incl. the garment's normal-offset raise, lands in the
  // depth buffer exactly as drawn), then a fullscreen pass linearizes that depth and
  // remaps it over the content's view-space range: near = white, background = black.
  // (A material-swap / MeshDepthMaterial pass crashes this three build's uniform
  // refresh, and would also miss the garment's shader offset — the depth-texture route
  // avoids both.)
  let depthOutTarget = null;
  const depthLinearGeo = new THREE.BufferGeometry(); // fullscreen triangle
  depthLinearGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  depthLinearGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const depthLinearMat = new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: null }, cameraNear: { value: 0.1 }, cameraFar: { value: 100 }, dMin: { value: 0 }, dMax: { value: 1 }, curve: { value: 1 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }",
    fragmentShader: [
      "#include <packing>",
      "uniform sampler2D tDepth; uniform float cameraNear, cameraFar, dMin, dMax, curve; varying vec2 vUv;",
      "void main(){",
      "  float depth = texture2D(tDepth, vUv).x;",
      "  if (depth >= 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }", // empty pixel → background
      "  float dist = -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);",   // positive metres in front of camera
      "  float lin = 1.0 - clamp((dist - dMin) / max(0.0001, dMax - dMin), 0.0, 1.0);",      // linear distance, near=white
      "  float idMin = 1.0 / max(dMin, 0.0001), idMax = 1.0 / max(dMax, 0.0001);",           // inverse-depth (disparity) range
      "  float disp = clamp((1.0 / dist - idMax) / max(0.0001, idMin - idMax), 0.0, 1.0);",  // near=white; matches DepthAnything's 1/dist distribution
      "  gl_FragColor = vec4(vec3(mix(lin, disp, curve)), 1.0);",                            // curve=1 disparity (default), 0 linear
      "}",
    ].join("\n"),
  });
  const depthLinearQuad = new THREE.Mesh(depthLinearGeo, depthLinearMat); depthLinearQuad.frustumCulled = false;
  const depthLinearScene = new THREE.Scene(); depthLinearScene.add(depthLinearQuad);
  const depthLinearCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const _depthBox = new THREE.Box3(), _depthV = new THREE.Vector3();
  const computeDepthRange = () => {
    camera.updateMatrixWorld();
    _depthBox.makeEmpty();
    for (const f of figures) for (const m of f.meshes || []) if (m.visible) _depthBox.expandByObject(m);
    if (propsGroup.children.length) _depthBox.expandByObject(propsGroup);
    if (_depthBox.isEmpty()) return { near: camera.near, far: camera.far };
    const mn = _depthBox.min, mx = _depthBox.max;
    let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < 8; i++) {
      _depthV.set(i & 1 ? mx.x : mn.x, i & 2 ? mx.y : mn.y, i & 4 ? mx.z : mn.z).applyMatrix4(camera.matrixWorldInverse);
      const d = -_depthV.z; if (d < zmin) zmin = d; if (d > zmax) zmax = d;
    }
    const pad = Math.max(0.08, (zmax - zmin) * 0.2); // slack for posed limbs the bind-box misses
    return { near: Math.max(0.01, zmin - pad), far: zmax + pad };
  };
  // When true-depth is on, the Poser's IMAGE already IS the depth map, so the
  // downstream DepthAnythingV2 estimator must not re-process it — bypass it (mode 4
  // passes its input straight through to the ControlNet). Direct wiring only (v1).
  const setDepthBypass = (on) => {
    const g = node.graph; if (!g) return;
    const out = (node.outputs || []).find((o) => o.name === "IMAGE");
    if (!out || !out.links) return;
    for (const linkId of out.links) {
      const link = g.links[linkId]; if (!link) continue;
      const tgt = g.getNodeById(link.target_id);
      const cls = tgt && (tgt.comfyClass || tgt.type);
      if (cls === "DepthAnythingV2Preprocessor" || cls === "PromptChain_DepthAnything") {
        tgt.mode = on ? 4 : 0;
      }
    }
    g.setDirtyCanvas?.(true, true);
  };
  const captureBlob = async () => {
    enforceAttachments(); // make sure pinned props sit on their leader in the captured map
    const W = getW(), H = getH();
    if (!captureTarget || captureTarget.width !== W || captureTarget.height !== H) {
      captureTarget?.dispose();
      captureTarget = new THREE.WebGLRenderTarget(W, H);
      captureTarget.texture.colorSpace = THREE.SRGBColorSpace; // match on-screen output
      captureTarget.depthTexture = new THREE.DepthTexture(W, H); // readable depth for true-depth output
      captureTarget.depthTexture.type = THREE.UnsignedIntType;
    }
    const prevAspect = camera.aspect;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    // setRenderTarget sets the GL viewport/scissor to the target's exact pixel
    // size. Do NOT call renderer.setViewport here — it re-applies _viewport
    // scaled by pixelRatio, which on a HiDPI display renders the scene at 2× into
    // the corner (zoomed-in, cropped capture).
    // The grid and rotate gizmo are viewport aids — never let them into the
    // control map handed to ControlNet.
    const showGrid = grid.visible, showGizmo = tcHelper.visible, showHandles = handlesRoot.visible;
    const showBrush = brushCursor ? brushCursor.visible : false;
    const showSculptRing = sculptRing ? sculptRing.visible : false;
    const showSculptWire = sculptWire ? sculptWire.visible : false;
    // Output mode: "default" clay render | "white" isolated figure on white (pose-anchor
    // exports — mannequin-pose LoRAs are trained on white-background anchors) | "depth"
    // true z-depth. pcrTrueDepth stays mirrored for pre-mode saves.
    const outMode = node.properties?.pcrOutputMode || (node.properties?.pcrTrueDepth ? "depth" : "default");
    const depthMode = outMode === "depth";
    const whiteMode = outMode === "white";
    const showFloor = floor.visible;
    // Missing-mesh markers are viewport-only — never let them into the control map.
    const missingMarkers = propsGroup.children.filter((m) => m.userData._failedRecord);
    const buf = new Uint8Array(W * H * 4);
    // try/finally so a render/readback throw (e.g. a disposed-context teardown race) can
    // never leave the grid/gizmo/handles hidden on screen. (Selection outlines are a
    // screen-space pass that only runs in renderFrame — nothing to hide here.)
    try {
      grid.visible = false;
      tcHelper.visible = false;
      handlesRoot.visible = false; // hide every figure's handles in the capture
      if (brushCursor) brushCursor.visible = false; // the brush ring is a viewport aid
      if (sculptRing) sculptRing.visible = false; // the sculpt ring is a viewport aid
      if (sculptWire) sculptWire.visible = false; // the sculpt wireframe is a viewport aid
      setLabelsVisible(false); // name labels are viewport-only, never in the control map
      for (const mk of missingMarkers) mk.visible = false; // missing-mesh markers never enter the control map
      if (depthMode || whiteMode) floor.visible = false; // clean isolated figure (depth-on-black / anchor-on-white)
      renderer.setRenderTarget(captureTarget);
      renderer.setClearColor(depthMode ? 0x000000 : whiteMode ? 0xffffff : FRAME_BG, 1);
      renderer.clear();
      renderer.render(scene, camera); // normal render — fills captureTarget.depthTexture
      // Head boxes for the Regional Detailer — measured with the EXACT camera
      // state that just rendered the control map, so they always correspond to
      // the frame downstream nodes will see.
      node._pcrHeads = computeHeadExports(THREE, figures, camera);
      if (depthMode) {
        // Linearize the captured depth buffer and remap over the content's view-space
        // distance range → near=white on black. The garment's vertex-shader offset is
        // already baked into depthTexture, so its raise shows here automatically.
        if (!depthOutTarget || depthOutTarget.width !== W || depthOutTarget.height !== H) {
          depthOutTarget?.dispose();
          depthOutTarget = new THREE.WebGLRenderTarget(W, H);
        }
        const range = computeDepthRange();
        depthLinearMat.uniforms.tDepth.value = captureTarget.depthTexture;
        depthLinearMat.uniforms.cameraNear.value = camera.near;
        depthLinearMat.uniforms.cameraFar.value = camera.far;
        depthLinearMat.uniforms.dMin.value = range.near;
        depthLinearMat.uniforms.dMax.value = range.far;
        // Default to the disparity (inverse-depth) curve — it matches the 1/dist distribution
        // DepthAnything-trained depth ControlNets expect; pcrDepthCurve:"linear" opts back to raw
        // linear distance (the one consumer that wants it is the Flux2 Klein pose-refcontrol template).
        depthLinearMat.uniforms.curve.value = node.properties?.pcrDepthCurve === "linear" ? 0.0 : 1.0;
        renderer.setRenderTarget(depthOutTarget);
        renderer.render(depthLinearScene, depthLinearCam);
        renderer.setRenderTarget(null);
        renderer.readRenderTargetPixels(depthOutTarget, 0, 0, W, H, buf);
      } else {
        renderer.setRenderTarget(null);
        renderer.readRenderTargetPixels(captureTarget, 0, 0, W, H, buf);
      }
    } finally {
      renderer.setRenderTarget(null);
      grid.visible = showGrid;
      tcHelper.visible = showGizmo;
      handlesRoot.visible = showHandles;
      floor.visible = showFloor;
      if (brushCursor) brushCursor.visible = showBrush;
      if (sculptRing) sculptRing.visible = showSculptRing;
      if (sculptWire) sculptWire.visible = showSculptWire;
      setLabelsVisible(true); // restore viewport name labels
      for (const mk of missingMarkers) mk.visible = true; // restore the viewport markers
      camera.aspect = prevAspect;
      camera.updateProjectionMatrix();
      requestRender(); // repaint the on-screen letterboxed view
    }

    const cnv = document.createElement("canvas");
    cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext("2d");
    const imgData = ctx.createImageData(W, H);
    const row = W * 4;
    for (let y = 0; y < H; y++) {
      imgData.data.set(buf.subarray((H - 1 - y) * row, (H - y) * row), y * row); // GL origin is bottom-left
    }
    ctx.putImageData(imgData, 0, 0);
    return await new Promise((res) => cnv.toBlob(res, "image/png"));
  };
  // Per-entity region masks: render each REGION ENTITY alone on black (its own
  // posed silhouette) so regional conditioning (Attention Couple) can apply one
  // entity's tags to one body. Entities = every figure (always a region) followed
  // by every NAMED prop (naming a prop promotes it to a region; unnamed props
  // stay depth dressing). Uses the live materials so skinning/pose is preserved;
  // isolates by visibility, so it survives overlaps a screen-space split can't.
  let maskTarget = null;
  let captureBusy = false; // blocks renderFrame from clobbering renderer state mid-capture
  const captureRegionMasks = async () => {
    // Mask-row order = entity order: figures first (so heads[] / detailer face
    // boxes keep entity_index == figure_index), then named props. ONE contiguous
    // counter across both — a restarted counter would collide _mask0.png and let
    // prop masks overwrite figure masks on the server.
    const namedProps = namedPropMeshes();
    const entities = [
      ...figures.map((f, i) => ({ kind: "figure", o: f, name: f.customName || "mannequin" + (i + 1), uid: f.uid })),
      ...namedProps.map((m) => ({ kind: "prop", o: m, name: m.userData.customName, uid: m.userData.uid })),
    ];
    // A single figure is still a region: its silhouette mask is what binds a
    // $block's tags to the body instead of the whole frame. Gating this at
    // two entities silently degraded one-figure regional graphs to a
    // full-canvas region (the server's no-masks fallback).
    node._pcrRegionEntities = entities.map((e) => ({ kind: e.kind, name: e.name }));
    if (!entities.length) return [];
    const W = getW(), H = getH();
    if (!maskTarget || maskTarget.width !== W || maskTarget.height !== H) {
      maskTarget?.dispose();
      maskTarget = new THREE.WebGLRenderTarget(W, H);
      maskTarget.texture.colorSpace = THREE.SRGBColorSpace;
    }
    const prevAspect = camera.aspect;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    const sv = {
      grid: grid.visible, gizmo: tcHelper.visible, handles: handlesRoot.visible,
      floor: floor.visible, props: propsGroup.visible,
      figVis: figures.map((f) => f.root.visible),
      propVis: propsGroup.children.map((m) => m.visible),
    };
    // Each prop's owning figure (null = unpinned), resolved once: a figure's region
    // mask must include the props it carries (held/pinned), so they aren't clipped
    // out of its conditioning. Shoes already ride the ankle bone, so they're in the
    // figure render automatically. A NAMED prop is its OWN region — exclusive
    // membership, it leaves its holder's mask even while pinned to a hand.
    enforceAttachments(); // props sit on their leader before we read membership/render
    const namedSet = new Set(namedProps);
    // Ownership generalizes across entity kinds: an unnamed prop belongs to the
    // FIRST region entity up its 🔗 chain — a figure (sword in a hand) or a
    // NAMED prop (charm linked to the named statue) — so every region masks
    // "the entity plus what it carries", whoever the carrier is.
    const entityOwningProp = (mesh) => {
      const seen = new Set();
      let cur = mesh;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const a = propAttachment(cur);
        if (!a) return null;
        if (a.leader.kind === "joint") return a.leader.fig;
        if (namedSet.has(a.leader.mesh)) return a.leader.mesh;
        cur = a.leader.mesh;
      }
      return null;
    };
    const propOwner = propsGroup.children.map((m) => (namedSet.has(m) ? null : entityOwningProp(m)));
    const out = [];
    try {
      captureBusy = true;
      grid.visible = false; tcHelper.visible = false; handlesRoot.visible = false;
      floor.visible = false; propsGroup.visible = true;
      setLabelsVisible(false); // keep name labels out of the silhouette masks
      // Flat unlit white: a mask must be binary figure-vs-background. Rendering
      // with the normal lit materials bakes shading into the mask (~0.6 gray),
      // which downstream consumers multiply by — the regional detailer's
      // re-render strength was silently capped at that gray level.
      scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        figures.forEach((f) => { f.root.visible = ent.kind === "figure" && f === ent.o; });
        propsGroup.children.forEach((m, k) => {
          // The entity itself, plus every unnamed prop riding it (🔗 chain).
          // A missing-mesh marker never enters a region mask.
          m.visible = (m === ent.o || propOwner[k] === ent.o) && !m.userData._failedRecord;
        });
        // Re-asserted per pass (not hoisted): the toBlob await below yields to
        // rAF, and anything that slips through must not leave a stale target,
        // viewport, or clear color for the next entity's pass.
        renderer.setRenderTarget(maskTarget);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.render(scene, camera);
        const buf = new Uint8Array(W * H * 4);
        renderer.readRenderTargetPixels(maskTarget, 0, 0, W, H, buf);
        const cnv = document.createElement("canvas");
        cnv.width = W; cnv.height = H;
        const ctx = cnv.getContext("2d");
        const imgData = ctx.createImageData(W, H);
        const rowLen = W * 4;
        for (let y = 0; y < H; y++) imgData.data.set(buf.subarray((H - 1 - y) * rowLen, (H - y) * rowLen), y * rowLen);
        ctx.putImageData(imgData, 0, 0);
        out.push({ index: i, kind: ent.kind, name: ent.name, uid: ent.uid, blob: await new Promise((res) => cnv.toBlob(res, "image/png")) });
      }
    } finally {
      captureBusy = false;
      scene.overrideMaterial = null;
      renderer.setRenderTarget(null);
      grid.visible = sv.grid; tcHelper.visible = sv.gizmo; handlesRoot.visible = sv.handles;
      floor.visible = sv.floor; propsGroup.visible = sv.props;
      propsGroup.children.forEach((m, k) => { if (k < sv.propVis.length) m.visible = sv.propVis[k]; });
      setLabelsVisible(true);
      figures.forEach((f, j) => { f.root.visible = sv.figVis[j]; });
      camera.aspect = prevAspect; camera.updateProjectionMatrix();
      requestRender();
    }
    return out;
  };
  const disposeCapture = () => {
    captureTarget?.dispose(); maskTarget?.dispose();
    depthOutTarget?.dispose(); depthLinearGeo.dispose(); depthLinearMat.dispose();
    outlineTarget?.dispose(); outlineQuadGeo.dispose();
    outlineQuadMat.dispose(); outlineDepthMat.dispose(); outlineSelMat.dispose(); outlineActMat.dispose();
  };
  controls.addEventListener("change", requestRender);
  controls.addEventListener("end", () => captureAndUpload(node));

  // Rotate gizmo: click a body part to select its joint, drag the rings to pose
  // it (FK). OrbitControls is suspended while a ring is being dragged, and the
  // control map re-uploads when the drag ends.
  const transformControls = new TransformControls(camera, canvas);
  transformControls.setMode("rotate");
  transformControls.setSpace("local");
  transformControls.setSize(0.7);
  // r169+: the gizmo is a separate helper object you add to the scene.
  const tcHelper = transformControls.getHelper ? transformControls.getHelper() : transformControls;
  scene.add(tcHelper);
  transformControls.addEventListener("change", requestRender);
  transformControls.addEventListener("dragging-changed", (e) => {
    controls.enabled = !e.value; // don't orbit the camera while posing a joint
    if (bandActive()) { // gizmo is on the multi-select proxy
      if (e.value) bandDragStart();
      else { placeBandProxy(); captureAndUpload(node); } // re-center proxy on the moved group
      return;
    }
    if (transformControls.object === ikMoveProxy) { // gizmo-IK move of a wrist/ankle
      if (!e.value) {
        const nm = selectedJointName;
        if (nm && rig.footPins?.[nm]) rig.footPins[nm] = rig.joints[nm].getWorldPosition(new THREE.Vector3()); // re-plant a pinned foot
        if (nm) rig.joints[nm].getWorldPosition(ikMoveProxy.position); // snap the gizmo back to the (clamped) joint
        captureAndUpload(node);
      }
      return;
    }
    if (selectedFigure && transformControls.object === selectedFigure.root && transformControls.mode === "scale") {
      if (e.value) figScaleAnchor = figScaleAnchorOf(selectedFigure); // remember size + ground spot
      else { groundFigureAfterScale(selectedFigure, figScaleAnchor); figScaleAnchor = null; captureAndUpload(node); }
      return;
    }
    if (!e.value) captureAndUpload(node);
  });

  // ── hand/foot pose controls ──────────────────────────────────────────────
  // A wrist selection shows a preset dropdown + 5 per-finger curl sliders (direct
  // control); an ankle shows the foot-pose dropdown. The sliders are the source of
  // truth for hands — presets just set them.
  const jointName = (j) => j && rig && Object.keys(rig.joints).find((k) => rig.joints[k] === j);
  const presetSelect = document.createElement("select");
  // Contextual panels sit at the RIGHT edge now that the tool strip owns the left.
  presetSelect.style.cssText =
    "position:absolute;top:6px;right:6px;z-index:3;display:none;font:11px system-ui,sans-serif;" +
    "background:#2a2a35;color:#ccd;border:1px solid #4a4a55;border-radius:4px;padding:2px 4px;cursor:pointer;";
  presetSelect.addEventListener("pointerdown", (e) => e.stopPropagation());

  // Per-finger curl slider panel (hands), under the preset dropdown on the right.
  const handPanel = document.createElement("div");
  handPanel.style.cssText =
    "position:absolute;top:38px;right:6px;z-index:3;display:none;background:rgba(20,20,26,0.82);" +
    "border:1px solid #4a4a55;border-radius:5px;padding:5px 7px;font:10px system-ui,sans-serif;color:#ccd;";
  handPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  const fingerSliders = {};
  for (const [key, label] of HAND_SLIDERS) {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer;";
    const tag = document.createElement("span");
    tag.textContent = label;
    tag.style.cssText = "width:56px;opacity:0.85;";
    const s = document.createElement("input");
    s.type = "range"; s.min = "0"; s.max = "100"; s.value = "0";
    s.style.cssText = "width:96px;";
    s.addEventListener("input", () => {
      const name = selectedJointName; // NOT transformControls.object — a wrist selects in MOVE mode, so the gizmo is on the IK proxy, not the bone (same fix the presets use)
      if (!name?.startsWith("wrist")) return;
      const amts = rig.handAmounts.get(name) || {};
      amts[key] = +s.value / 100;
      rig.handAmounts.set(name, amts);
      curlFinger(name, key, amts[key]); // ONLY this finger — never re-pose the rest
      rig.joints[name]?.updateMatrixWorld(true);
      requestRender();
    });
    s.addEventListener("change", () => captureAndUpload(node)); // commit on release
    row.append(tag, s);
    handPanel.appendChild(row);
    fingerSliders[key] = s;
  }

  // Per-toe curl slider panel (feet), same placement as the hand panel under the foot-pose
  // dropdown. Each slider curls one toe bone; the dropdown's presets still flex the whole foot.
  const footPanel = document.createElement("div");
  footPanel.style.cssText =
    "position:absolute;top:38px;right:6px;z-index:3;display:none;background:rgba(20,20,26,0.82);" +
    "border:1px solid #4a4a55;border-radius:5px;padding:5px 7px;font:10px system-ui,sans-serif;color:#ccd;";
  footPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  const toeSliders = [];
  for (let i = 0; i < TOE_LABELS.length; i++) {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer;";
    const tag = document.createElement("span");
    tag.textContent = TOE_LABELS[i];
    tag.style.cssText = "width:56px;opacity:0.85;";
    const s = document.createElement("input");
    s.type = "range"; s.min = "0"; s.max = "100"; s.value = "0";
    s.style.cssText = "width:96px;";
    s.addEventListener("input", () => {
      const name = selectedJointName; // ankle selects in MOVE mode → gizmo is on the IK proxy, not the bone
      if (!name?.startsWith("ankle")) return;
      const amts = rig.footAmounts.get(name) || [];
      amts[i] = +s.value / 100;
      rig.footAmounts.set(name, amts);
      curlToe(name, i, amts[i]); // ONLY this toe
      requestRender();
    });
    s.addEventListener("change", () => captureAndUpload(node));
    row.append(tag, s);
    footPanel.appendChild(row);
    toeSliders.push(s);
  }
  const setToeSliders = (amts) => { for (let i = 0; i < toeSliders.length; i++) toeSliders[i].value = String(Math.round((amts?.[i] ?? 0) * 100)); };
  container.append(presetSelect, handPanel, footPanel);

  // ── body-shape morph sliders ────────────────────────────────────────────
  // One slider per shape-key morph the GLB carries, centred at 0 = the neutral
  // base. Dragging positive grows toward the baked extreme, negative shrinks
  // past it — glTF morphs are relative deltas, so the shader extrapolates
  // out-of-[0,1] cleanly and bidirectional sliders need only one shape key.
  // Toggled by the 💪 body button; absent entirely if the GLB has no morphs.
  const bodyPanel = document.createElement("div");
  // Bottom-right so the body sliders don't collide with the top-right selection panel
  // (you often shape a figure while it's selected).
  bodyPanel.style.cssText =
    "position:absolute;bottom:6px;right:6px;z-index:3;display:none;background:rgba(20,20,26,0.82);" +
    "border:1px solid #4a4a55;border-radius:5px;padding:5px 7px;font:10px system-ui,sans-serif;color:#ccd;";
  bodyPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  bodyPanel.dataset.pcrWheelScroll = "1"; // wheel scrolls the panel, not the camera (see installViewportWheel)
  const bodySliders = [];
  // (Re)built from a figure's morph list. With one body in the library this
  // runs once; with mixed bodies in a scene, setActiveFigure rebuilds whenever
  // the active figure's morph set differs from the panel's (different GLBs
  // ship different sliders). The handlers read/write the ACTIVE rig.
  let bodySlidersSig = null;
  // Custom-body panel: grouped sliders from the pack manifest. Group-open state
  // is sticky across rebuilds/selections; only "main" starts expanded (66
  // sliders would otherwise swallow the viewport).
  const customGroupOpen = new Set(["main"]);
  const buildCustomSliderPanel = (fromFig) => {
    const { manifest } = fromFig.customEngine;
    bodyPanel.style.maxHeight = "62%";
    bodyPanel.style.overflowY = "auto";
    for (const group of manifest.groups) {
      const rows = [];
      const head = document.createElement("div");
      head.textContent = (customGroupOpen.has(group.id) ? "▾ " : "▸ ") + group.label;
      head.style.cssText = "margin:3px 0 1px;cursor:pointer;font-weight:600;color:#aab;user-select:none;";
      head.addEventListener("click", () => {
        const open = !customGroupOpen.has(group.id);
        customGroupOpen[open ? "add" : "delete"](group.id);
        head.textContent = (open ? "▾ " : "▸ ") + group.label;
        for (const r of rows) r.style.display = open ? "flex" : "none";
      });
      bodyPanel.appendChild(head);
      for (const sid of group.sliders) {
        const def = manifest.sliders.find((s) => s.id === sid);
        if (!def) continue;
        const row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer;" +
          (customGroupOpen.has(group.id) ? "" : "display:none;");
        const tag = document.createElement("span");
        tag.textContent = def.label;
        tag.style.cssText = "width:96px;opacity:0.85;";
        const s = document.createElement("input");
        s.type = "range";
        s.min = def.kind === "bi" ? "-100" : "0";
        s.max = "100";
        s.value = String(Math.round(def.default * 100));
        s.style.cssText = "width:96px;";
        s.addEventListener("input", () => {
          const eng = rig?.customEngine;
          if (!eng) return;
          eng.values[def.id] = +s.value / 100;
          eng.requestRecompute(); // rAF-coalesced — macro drags re-sum everything
        });
        s.addEventListener("change", () => captureAndUpload(node)); // commit on release
        row.append(tag, s);
        bodyPanel.appendChild(row);
        rows.push(row);
        bodySliders.push({ custom: true, id: def.id, default: def.default, slider: s });
      }
    }
  };
  const buildBodySliders = (fromFig) => {
    if (fromFig?.customEngine) {
      const sig = "custom:" + fromFig.customEngine.manifest.version;
      if (sig === bodySlidersSig) return;
      bodySlidersSig = sig;
      bodySliders.length = 0;
      bodyPanel.innerHTML = "";
      buildCustomSliderPanel(fromFig);
      return;
    }
    bodyPanel.style.maxHeight = "";
    bodyPanel.style.overflowY = "";
    const names = fromFig?.morphMesh ? fromFig.morphNames : [];
    const sig = fromFig?._packFailed ? "packfail" : names.join("|");
    if (sig === bodySlidersSig) return;
    bodySlidersSig = sig;
    bodySliders.length = 0;
    bodyPanel.innerHTML = "";
    if (fromFig?._packFailed) {
      const note = document.createElement("div");
      note.textContent = "body slider pack unavailable — reload to retry";
      note.style.cssText = "opacity:0.7;max-width:160px;";
      bodyPanel.appendChild(note);
      return;
    }
    if (!fromFig?.morphMesh) return;
    for (const name of names) {
      const i = fromFig.morphIndex[name];
      const skeletal = fromFig.isSkeletalMorph(name);
      const row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer;";
      const tag = document.createElement("span");
      tag.textContent = name.replace(/[_-]+/g, " ");
      tag.style.cssText = "width:64px;opacity:0.85;text-transform:capitalize;";
      const s = document.createElement("input");
      s.type = "range"; s.min = "-100"; s.max = "100"; s.value = "0";
      s.style.cssText = "width:96px;";
      s.addEventListener("input", () => {
        if (!rig?.morphMesh) return;
        if (skeletal) { rig.skeletalAmount[name] = +s.value / 100; applySkeletalMorph(); }
        else { rig.morphMesh.morphTargetInfluences[i] = +s.value / 100; requestRender(); }
      });
      s.addEventListener("change", () => { debugMorphReport(); captureAndUpload(node); }); // commit on release
      row.append(tag, s);
      bodyPanel.appendChild(row);
      bodySliders.push({ index: i, name, skeletal, slider: s });
    }
  };
  buildBodySliders(rig);
  container.appendChild(bodyPanel);
  // Pull slider positions back from live state (after reset/restore/undo).
  const syncBodySliders = () => {
    if (rig?.customEngine) {
      for (const e of bodySliders)
        if (e.custom) e.slider.value = String(Math.round((rig.customEngine.values[e.id] ?? e.default) * 100));
      return;
    }
    const morphMesh = rig?.morphMesh; // null rig = empty cast — panel is hidden anyway
    if (!morphMesh) return;
    for (const { index, name, skeletal, slider } of bodySliders)
      slider.value = String(Math.round((skeletal ? (rig.skeletalAmount[name] || 0) : (morphMesh.morphTargetInfluences[index] || 0)) * 100));
  };

  // Skeletal-morph rest position per bone = neutral bind + Σ(amount · delta) over
  // the bone-driven morphs. Moving the bones here stretches the skin through
  // ordinary skinning, so no re-bind is needed and the joints stay where the
  // handles are.
  const computeSkelRest = (f = rig) => {
    const out = new Map();
    for (const b of f.skel.bones) out.set(b, f.boneRestPos.get(b).clone());
    for (const name in f.skeletalAmount) {
      const w = f.skeletalAmount[name]; if (!w) continue;
      const d = f.morphBoneDeltas[name]; if (!d) continue;
      for (const bn in d) {
        const b = f.boneByName.get(bn); if (!b) continue;
        const p = out.get(b), v = d[bn];
        p.x += w * v[0]; p.y += w * v[1]; p.z += w * v[2];
      }
    }
    return out;
  };

  // Apply the skeletal morph by relocating the bone rest positions. Fold/move
  // offsets (the bone's displacement from its previous skeletal rest) ride along.
  const applySkeletalMorph = () => {
    if (!(rig?.morphMesh || rig?.customEngine) || !rig.skel) return;
    const newRest = computeSkelRest();
    const off = new THREE.Vector3();
    for (const b of rig.skel.bones) {
      off.copy(b.position).sub(rig.curSkelRest.get(b)); // fold/move delta from old rest
      b.position.copy(newRest.get(b)).add(off);
    }
    rig.curSkelRest = newRest;
    rig.root.updateMatrixWorld(true);
    requestRender();
  };

  // TEMP DIAGNOSTIC: compare the actual morphed-mesh top to the live bone world
  // positions so we can see whether the skeleton is tracking the skin.
  const debugMorphReport = () => {
    const morphMesh = rig?.morphMesh;
    if (!morphMesh) return;
    const g = morphMesh.geometry, pos = g.attributes.position;
    const ma = g.morphAttributes.position || [], infl = morphMesh.morphTargetInfluences;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    morphMesh.updateMatrixWorld(true);
    rig.skel.update(); // refresh boneMatrices from current bones + (rebound) inverses
    const bm = morphMesh.skeleton.boneMatrices;
    const v = new THREE.Vector3(), sk = new THREE.Vector3(), tmp = new THREE.Vector3(), M = new THREE.Matrix4();
    const idx = new THREE.Vector4(), wt = new THREE.Vector4();
    let maxYgeo = -1e9, maxYskin = -1e9; // geometry (morph only) vs actually-skinned
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      for (let m = 0; m < ma.length; m++) if (infl[m]) { const d = ma[m]; v.x += infl[m] * d.getX(i); v.y += infl[m] * d.getY(i); v.z += infl[m] * d.getZ(i); }
      tmp.copy(v).applyMatrix4(morphMesh.matrixWorld);
      if (tmp.y > maxYgeo) maxYgeo = tmp.y;
      // actual skinning: bindMatrix -> Σ w·boneMatrix -> bindMatrixInverse -> world
      const base = v.clone().applyMatrix4(morphMesh.bindMatrix);
      idx.fromBufferAttribute(si, i); wt.fromBufferAttribute(sw, i);
      sk.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = wt.getComponent(k); if (!w) continue;
        M.fromArray(bm, idx.getComponent(k) * 16);
        sk.add(tmp.copy(base).applyMatrix4(M).multiplyScalar(w));
      }
      sk.applyMatrix4(morphMesh.bindMatrixInverse).applyMatrix4(morphMesh.matrixWorld);
      if (sk.y > maxYskin) maxYskin = sk.y;
    }
    const bw = (n) => { const b = rig.boneByName.get(n); return b ? b.getWorldPosition(new THREE.Vector3()) : null; };
    const head = bw("head"), ua = bw("upperarm_l"), pelvis = bw("pelvis");
    console.log("[PoseStudio DBG] infl=", Array.from(infl).map((x) => +x.toFixed(2)),
      "skel=", rig.skeletalAmount,
      "| geoTopY=", maxYgeo.toFixed(3), "| SKINNED topY=", maxYskin.toFixed(3),
      "| head bone=", head && head.toArray().map((x) => +x.toFixed(3)),
      "| upperarm_l=", ua && ua.toArray().map((x) => +x.toFixed(3)),
      "| pelvis=", pelvis && pelvis.toArray().map((x) => +x.toFixed(3)));
  };
  node._pcrPoseDebugMorph = debugMorphReport;

  // After applyFigureData has restored the skeletal amounts AND set every bone to its
  // saved absolute position (jointPos covers all skeleton bones), the skeleton is
  // already correctly placed. We only re-baseline curSkelRest to those amounts so a
  // subsequent slider move computes its fold/move offset correctly. Bones aren't moved.
  const restoreSkeletalMorph = (f = rig) => {
    if (!(f.morphMesh || f.customEngine) || !f.skel) return;
    f.curSkelRest = computeSkelRest(f);
  };

  // ── custom-body slider engine ───────────────────────────────────────────────
  // values -> macro factors -> per-target weights (one uniform formula) -> CPU
  // vertex re-sum + bone-rest deltas fed to the EXISTING skeletal-morph pipeline
  // as a single synthetic morph. Each figure owns its geometry (spawnFigure
  // parses a fresh GLB), so engines never share position buffers; the pack
  // itself is shared read-only.
  const makeCustomEngine = (fig, pack) => {
    const { manifest } = pack;
    const mesh = (fig.meshes || []).find((m) => m.isSkinnedMesh);
    if (!mesh || !fig.skel) return null;
    const posAttr = mesh.geometry.attributes.position;
    if (posAttr.count !== manifest.vertCount) {
      console.warn(`[PoseStudio] pack/GLB vertex mismatch (${manifest.vertCount} vs ${posAttr.count}) — pack stale?`);
      return null;
    }
    const basePos = posAttr.array.slice(); // GLB rest = the baked default blend
    // Skinning re-applies bone-rest movement to every weighted vertex, so the
    // engine must SUBTRACT that displacement from the (full-delta) morphed
    // positions or the mesh outruns the skeleton ~2:1. Captured at bind:
    // skeleton bone order (skinIndex space) + each bone's parent world
    // rotation (local rest deltas are expressed in the parent frame).
    const skelBones = mesh.skeleton.bones;
    const boneIdxByName = new Map(skelBones.map((b, i) => [b.name, i]));
    const parentBindQuat = skelBones.map((b) => b.parent.getWorldQuaternion(new THREE.Quaternion()));
    const values = {};
    for (const s of manifest.sliders) values[s.id] = s.default;

    const computeWeights = () => {
      const macros = {};
      for (const s of manifest.sliders) {
        if (s.kind !== "macro") continue;
        let v = values[s.id] ?? s.default;
        if (s.uiToValue) v = s.uiToValue[0] + v * (s.uiToValue[1] - s.uiToValue[0]);
        macros[s.var] = v;
      }
      const f = computeMacroFactors(macros);
      const w = new Float64Array(manifest.targets.length);
      for (let i = 0; i < manifest.targets.length; i++) {
        let x = 1;
        for (const tok of pack.targets[i].tokens) x *= f[tok] || 0;
        w[i] = x;
      }
      // detail targets: weight *= the slider's one-sided factor (grid targets
      // belong to no slider and keep the pure factor product)
      for (const s of manifest.sliders) {
        if (!s.targets) continue;
        const v = values[s.id] || 0;
        for (const r of s.targets) w[r.i] *= Math.max(0, r.sign * v);
      }
      return w;
    };

    const eng = { values, manifest };
    eng.recompute = ({ restore = false } = {}) => {
      const w = computeWeights();
      const arr = posAttr.array;
      arr.set(basePos);
      const boneAcc = {};
      for (let ti = 0; ti < pack.targets.length; ti++) {
        const wt = w[ti];
        if (Math.abs(wt) < 0.01) continue;
        const t = pack.targets[ti];
        const idx = t.vIdx, d = t.vDelta, k = wt * manifest.quant;
        for (let j = 0; j < idx.length; j++) {
          const o = idx[j] * 3, jj = j * 3;
          arr[o] += k * d[jj]; arr[o + 1] += k * d[jj + 1]; arr[o + 2] += k * d[jj + 2];
        }
        if (t.bones) {
          const bi = t.bones.idx, bd = t.bones.delta;
          for (let j = 0; j < bi.length; j++) {
            const acc = boneAcc[bi[j]] || (boneAcc[bi[j]] = [0, 0, 0]);
            acc[0] += wt * bd[j * 3]; acc[1] += wt * bd[j * 3 + 1]; acc[2] += wt * bd[j * 3 + 2];
          }
        }
      }
      const dvv = pack.defaultVerts; // baked into the GLB — subtract it back out
      for (let i = 0; i < arr.length; i++) arr[i] -= dvv[i];
      // Freehand sculpt edits ride on the TRUE morphed surface (here, before normals +
      // skin-compensation) so they shade correctly and skinning carries the new shape into
      // any pose. It is NOT a bone-driven morph, so it must stay out of the skeletal-morph
      // path below — the compensation subtraction is a fixed per-vertex offset that leaves
      // this delta untouched. Added after the slider sum so moving a slider composes with
      // (never erases) a sculpt.
      if (fig.sculptMap && fig.sculptMap.size) for (const [vi, dv] of fig.sculptMap) { const o = vi * 3; arr[o] += dv[0]; arr[o + 1] += dv[1]; arr[o + 2] += dv[2]; }
      // Bones: one synthetic skeletal morph carries the net rest deltas through
      // the shared computeSkelRest/applySkeletalMorph machinery.
      const db = pack.defaultBones;
      const bd = {};
      for (let b = 0; b < manifest.boneCount; b++) {
        const acc = boneAcc[b] || [0, 0, 0];
        const x = acc[0] - db[b * 3], y = acc[1] - db[b * 3 + 1], z = acc[2] - db[b * 3 + 2];
        if (x || y || z) bd[manifest.bones[b]] = [x, y, z];
      }
      fig.morphBoneDeltas = { __custom: bd };
      fig.skeletalAmount = { __custom: 1 };
      // Normals + bounds come from the TRUE morphed surface (positions currently
      // hold it) — computing them after the skin compensation below shades dark
      // bands at every joint transition.
      posAttr.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
      if (mesh.geometry.boundingSphere) mesh.geometry.boundingSphere.radius *= 3; // raycast slack, mirrors loadGlbFigure
      // Skin compensation: world REST delta per bone (local deltas propagated
      // through the bind hierarchy), then positions -= Σ skinWeight·boneDelta —
      // skinning adds it back, landing the mesh exactly on the moved skeleton.
      const wdelta = new Float64Array(skelBones.length * 3);
      const done = new Uint8Array(skelBones.length);
      const tmpV = new THREE.Vector3();
      const walk = (i) => {
        if (done[i]) return;
        done[i] = 1;
        const b = skelBones[i];
        const pi = boneIdxByName.get(b.parent?.name);
        let x = 0, y = 0, z = 0;
        if (pi != null) { walk(pi); x = wdelta[pi * 3]; y = wdelta[pi * 3 + 1]; z = wdelta[pi * 3 + 2]; }
        const ld = bd[b.name];
        if (ld) {
          tmpV.set(ld[0], ld[1], ld[2]).applyQuaternion(parentBindQuat[i]);
          x += tmpV.x; y += tmpV.y; z += tmpV.z;
        }
        wdelta[i * 3] = x; wdelta[i * 3 + 1] = y; wdelta[i * 3 + 2] = z;
      };
      for (let i = 0; i < skelBones.length; i++) walk(i);
      const siA = mesh.geometry.attributes.skinIndex.array;
      const swA = mesh.geometry.attributes.skinWeight.array;
      for (let i = 0; i < posAttr.count; i++) {
        const o4 = i * 4, o3 = i * 3;
        let dx = 0, dy = 0, dz = 0;
        for (let k = 0; k < 4; k++) {
          const w = swA[o4 + k];
          if (!w) continue;
          const bo = siA[o4 + k] * 3;
          dx += w * wdelta[bo]; dy += w * wdelta[bo + 1]; dz += w * wdelta[bo + 2];
        }
        arr[o3] -= dx; arr[o3 + 1] -= dy; arr[o3 + 2] -= dz;
      }
      // Live slider edits relocate bone rests now (fig IS the active rig — the
      // panel only drives the selection). Restores skip it: applyFigureData has
      // already placed every bone at its saved jointPos; restoreSkeletalMorph
      // re-baselines curSkelRest right after.
      if (!restore) applySkeletalMorph();
      reprojectFigureGarments(fig); // conformed garments follow body-shape sliders
      requestRender();
    };
    let queued = false;
    eng.requestRecompute = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; eng.recompute(); });
    };
    // Restore path: replace ALL values (absent ids -> defaults, so an undo past
    // a slider change actually reverts it), then one restore-mode recompute.
    eng.applyValues = (vals, opts) => {
      for (const s of manifest.sliders)
        values[s.id] = (vals && Number.isFinite(vals[s.id])) ? vals[s.id] : s.default;
      eng.recompute(opts);
    };
    return eng;
  };
  // Restore a figure's planted-foot anchors from serialized arrays (applyFigureData is
  // module-scope without THREE, so foot pins are rehydrated here).
  const restoreFootPins = (f, data) => {
    if (!f.footPins) return;
    for (const k of Object.keys(f.footPins))
      f.footPins[k] = (data?.footPins && Array.isArray(data.footPins[k])) ? new THREE.Vector3().fromArray(data.footPins[k]) : null;
  };
  const applyOneFigure = (f, fd) => {
    applyFigureData(f, fd);
    // Sculpt layer: set BEFORE the custom-engine recompute so its restore pass folds the
    // saved delta into the rest buffer in one shot (no un-sculpted first frame).
    f.sculptMap = fd?.sculpt ? sculptDataToMap(fd.sculpt) : null;
    // Custom-body sliders: rebuild geometry + the synthetic bone-delta morph from
    // the saved dict BEFORE restoreSkeletalMorph re-baselines curSkelRest. Restore
    // mode leaves the bones at their saved jointPos (already applied above).
    if (f.customEngine) f.customEngine.applyValues(fd?.sliders, { restore: true });
    // Baked-morph bodies have no re-sum engine, so apply the sculpt delta straight into
    // the (idempotent base-snapshot) position buffer.
    else if (f.sculptMap && f.sculptMap.size) { const sm = (f.meshes || []).find((m) => m.isSkinnedMesh) || f.morphMesh; if (sm) applySculpt(sm, f.sculptMap); }
    restoreSkeletalMorph(f);
    restoreFootPins(f, fd);
    f.root.updateMatrixWorld(true);
    restoreShoes(f, fd);
  };
  // Reconcile the live cast to a serialized one. By STABLE UID when the snapshot has them
  // (so undo of a middle-figure removal restores poses onto the right bodies), else by
  // position for old saves. Returns false if the node was torn down mid-spawn.
  const reconcileCast = async (figData) => {
    // [] takes the uid path too (vacuous every): a v3 scene saved with zero
    // figures restores as zero — the legacy branch's min-1 is only for old
    // saves that predate uids (which always carried at least one figure).
    const haveUids = figData.every((fd) => fd && fd.uid != null);
    if (haveUids) {
      for (const fd of figData) {
        figureUidSeq = Math.max(figureUidSeq, fd.uid + 1); // never reissue a restored uid
        // Same uid but a different BODY = a different mesh entirely (e.g. the
        // mount's default human colliding with a saved heavy man) — replace it,
        // or the restore silently pours this figure's pose onto the wrong body.
        const existing = figures.find((f) => f.uid === fd.uid);
        if (existing && bodyKeyOf(existing.body) !== bodyKeyOf(fd.body)) removeFigure(existing, { capture: false });
        if (!figures.some((f) => f.uid === fd.uid)) {
          const nf = await spawnFigure({ select: false, capture: false, body: fd.body });
          if (!node._pcrAlive) return false;
          if (nf) nf.uid = fd.uid;
        }
      }
      const wanted = new Set(figData.map((fd) => fd.uid));
      for (let i = figures.length - 1; i >= 0; i--)
        if (!wanted.has(figures[i].uid)) removeFigure(figures[i], { capture: false });
      for (const fd of figData) { const f = figures.find((x) => x.uid === fd.uid); if (f) applyOneFigure(f, fd); }
    } else {
      for (let i = figures.length; i < figData.length; i++) { await spawnFigure({ select: false, capture: false, body: figData[i]?.body }); if (!node._pcrAlive) return false; }
      while (figures.length > Math.max(1, figData.length)) removeFigure(figures[figures.length - 1], { capture: false });
      figData.forEach((fd, i) => { const f = figures[i]; if (f) applyOneFigure(f, fd); });
    }
    updateFigureLabels(); // restored custom names (undo of a rename included) reach the sprites
    return true;
  };
  // The live figure that the snapshot marked active (by uid when available, else index).
  const activeFromSnapshot = (data, figData) => {
    const idx = Math.min(data.activeIndex || 0, figData.length - 1);
    const fd = figData[idx];
    return (fd && fd.uid != null ? figures.find((f) => f.uid === fd.uid) : figures[Math.min(data.activeIndex || 0, figures.length - 1)]) || figures[0];
  };

  const setSliders = (amts) => {
    for (const [key] of HAND_SLIDERS) fingerSliders[key].value = String(Math.round((amts[key] ?? 0) * 100));
  };
  presetSelect.addEventListener("change", () => {
    const name = selectedJointName; // not transformControls.object — in move mode the gizmo is on the IK proxy
    if (!name || !presetSelect.value) return;
    if (name.startsWith("wrist")) {
      if (POSE_PRESETS[presetSelect.value]) {
        applyHandPose(name, POSE_PRESETS[presetSelect.value]); // captured raw pose (incl. IK thumb)
        setSliders(HAND_PRESETS[presetSelect.value] || {});    // sliders show the closest amounts
      } else {
        const amts = { ...HAND_PRESETS[presetSelect.value] };
        applyHandAmounts(name, amts);
        setSliders(amts);
      }
    } else if (name.startsWith("ankle")) {
      applyFootPreset(name, presetSelect.value);
    }
    presetSelect.selectedIndex = 0; // back to the label so re-picking the same fires change
    requestRender();
    captureAndUpload(node);
  });

  // Shoe controls in the foot-selection context — assigned with the shoe block below,
  // called here so they track every joint selection change. Users reach for shoes by
  // clicking a foot, not the whole figure, so the toggle + style picker live here too.
  let updateFootShoeUI = () => {};
  const updatePresetUI = () => {
    updateFootShoeUI();
    const name = selectedJointName; // tracked separately so it survives move-mode (gizmo on the IK proxy)
    // Bound imports follow whole-hand/-foot: finger curls / foot poses move
    // invisible mannequin bones with no skin influence — hide the dead panels.
    const isHand = name?.startsWith("wrist") && rig?.fingers?.[name] && !rig.skinBind;
    const isFoot = name?.startsWith("ankle") && rig?.toes?.[name] && !rig.skinBind;
    const hasToes = false; // per-toe SLIDER removed — toes are posed directly via their tip IK grab handles
    if (!isHand && !isFoot) { presetSelect.style.display = "none"; handPanel.style.display = "none"; footPanel.style.display = "none"; return; }
    const keys = isHand ? Object.keys(HAND_PRESETS) : Object.keys(FOOT_PRESETS);
    const label = isHand ? "✋ hand preset…" : "🦶 foot pose…";
    presetSelect.innerHTML = "";
    for (const [i, k] of [label, ...keys].entries()) {
      const o = document.createElement("option");
      o.textContent = k; o.value = i === 0 ? "" : k;
      presetSelect.appendChild(o);
    }
    presetSelect.style.display = "block";
    if (isHand) { setSliders(rig.handAmounts.get(name) || {}); handPanel.style.display = "block"; footPanel.style.display = "none"; }
    else { handPanel.style.display = "none"; if (hasToes) { setToeSliders(rig.footAmounts.get(name)); footPanel.style.display = "block"; } else footPanel.style.display = "none"; }
  };
  // Prop selection lives alongside joint selection on the one gizmo: selectedProp
  // is the currently-gizmo'd prop mesh (null while a joint or nothing is selected),
  // and propMode is its transform mode. updatePropUI/selectProp are defined with
  // the props block below; referenced here only at interaction time (post-mount).
  let selectedProp = null;
  let propMode = "translate"; // translate | rotate | scale
  let pinPickProp = null; // a prop awaiting a pin target (next click picks the leader)
  let pinPickGroup = null; // a GROUP (array of member props) awaiting a target → attach all members
  let pinPickJointIndex = null; // when set, the pending pin is a CHAIN-JOINT combine (this joint), not a whole-prop link
  let selectedChainJoint = null; // { prop, jointIndex } — a chain joint clicked for combine/FK (drives the combine button)
  let updatePropUI = () => {}; // assigned once the prop panel exists (props block below)
  // Disarm a pending link AND re-enable the gizmo. Must run on every path that ends
  // pin-pick (Esc, resolve, deleting the prop/figure), or transformControls.enabled
  // stays false and the gizmo is globally dead for all selections.
  const cancelPinPick = () => {
    if (!pinPickProp && !pinPickGroup) return;
    pinPickProp = null; pinPickGroup = null; pinPickJointIndex = null;
    transformControls.enabled = true;
    updatePropUI();
  };

  // Whole-figure selection — the prop-style "object" grip for a person (the model the
  // research landed on: body-click selects the whole figure, joints are posed via the
  // hover handles). selectedFigure is the figure selected as an OBJECT: gizmo on its
  // scene root, orange body tint, Del removes it. figureMode is that gizmo's transform.
  // A figure, a prop, and a joint are mutually exclusive selections. updateFigureUI is
  // assigned when the figure panel exists (toolbar block below).
  let selectedFigure = null;
  let figureMode = "translate"; // translate | rotate
  let bodyPanelOpen = false;    // body-shape sliders toggled from the selected-figure panel
  let updateFigureUI = () => {};
  // Selection visuals are the screen-space outline pass (renderOutlinePass,
  // render block above) — selection state alone drives them; nothing to build
  // or toggle per object here.
  const clearFigureSelection = () => {
    if (!selectedFigure) return;
    selectedFigure = null;
    updateFigureUI();
  };

  // IK-tip joints (wrist/ankle) can be posed two ways: ROTATE (the FK twist gizmo, default
  // on click) or MOVE — an XYZ translate gizmo whose drag drives two-bone IK so the
  // hand/foot slides on an axis while staying attached to the elbow/knee (it can't stretch).
  // The free diamond-drag IK stays for quick posing; this is the precise edge-case path.
  // ikMoveMode is remembered across selections like propMode/figureMode.
  let ikMoveMode = false;
  let selectedJointName = null; // selected joint; gizmo sits on its BONE in rotate, on ikMoveProxy in move
  let selectedIkLimb = null;    // two-bone limb of the selected wrist/ankle, else null (non-tip joints)
  const ikMoveProxy = new THREE.Object3D(); // the move gizmo's target; dragging it → IK solve
  scene.add(ikMoveProxy);
  // Segmented-chain tip IK: a DIRECT-DRAG gesture (grab the green tip dot, drag it
  // on a camera-facing plane → FABRIK), mirroring the figure's free-drag IK diamond —
  // not a gizmo. Armed in pointerdown, solved in pointermove, captured in pointerup.
  const chainDrag = { active: false, dragging: false, settling: false, canIk: false, prop: null, jointIndex: 0, driveCount: 0, anchorIndex: 0, pinIdx: 0, bone: null, plane: new THREE.Plane(), hit: new THREE.Vector3(), offset: new THREE.Vector3(), desired: new THREE.Vector3(), grabEase: new THREE.Vector3(), pinWorld: new THREE.Vector3(), rope: null, ropePrev: null, ropeLens: null };
  let updateIkUI = () => {};    // assigned when the ik move/rotate panel exists (toolbar block)
  const _ikTargetV = new THREE.Vector3();

  // Selecting/deselecting a joint goes through these so the controls track it. Attaching
  // to a joint drops any prop/whole-figure selection. A wrist/ankle gets the move OR rotate
  // gizmo per ikMoveMode; every other joint is rotate/local only (FK).
  const attachGizmo = (joint) => {
    clearBand();
    selectedProp = null;
    clearFigureSelection();
    selectedJointName = jointName(joint);
    selectedIkLimb = limbFor(rig, selectedJointName); // non-null only for wrist/ankle (two-bone tips)
    if (selectedIkLimb && ikMoveMode) {
      joint.getWorldPosition(ikMoveProxy.position); // gizmo target starts at the joint
      ikMoveProxy.quaternion.identity();
      ikMoveProxy.updateMatrixWorld(true);
      transformControls.setMode("translate");
      transformControls.setSpace("world");
      transformControls.attach(ikMoveProxy);
    } else {
      transformControls.setMode("rotate");
      transformControls.setSpace("local");
      transformControls.attach(joint);
    }
    updatePresetUI();
    updatePropUI();
    updateIkUI();
  };
  const detachGizmo = () => {
    clearBand();
    selectedProp = null;
    selectedChainJoint = null;
    clearFigureSelection();
    selectedJointName = null;
    selectedIkLimb = null;
    transformControls.detach();
    updatePresetUI();
    updatePropUI();
    updateIkUI();
  };
  // Toggle the selected IK tip between the move gizmo and the rotate gizmo (panel + W/E).
  const setIkJointMode = (mode) => {
    ikMoveMode = mode === "move";
    if (selectedIkLimb && selectedJointName) attachGizmo(rig.joints[selectedJointName]); // re-attach in the new mode
    else updateIkUI();
    requestRender();
  };

  // Select a whole figure as an object: make it active, tint it, and put the gizmo on
  // its scene root in the current move/rotate mode — exactly how a prop is selected.
  // Rotate uses the figure's own axes (local), move uses world axes.
  const figureGizmoSpace = () => (figureMode === "rotate" ? "local" : "world");
  // Creatures take a UNIFORM gizmo scale. The human is sized by the skeleton-fit
  // and body sliders instead — its root scale is load-bearing for skeleton/skin
  // binding — so the human stays gizmo-unscalable. A non-human profile = creature.
  const figureCanScale = (fig) => !!fig && figProfile(fig) !== RIG_PROFILES.human;
  const figureGizmoMode = (fig) => (transformTool === "scale" && figureCanScale(fig)) ? "scale" : figureMode;
  const _figBox = new THREE.Box3(), _figCtr = new THREE.Vector3();
  let figScaleAnchor = null; // { s0, cx, cz } captured at the start of a scale drag
  const figScaleAnchorOf = (fig) => {
    _figBox.setFromObject(fig.root); _figBox.getCenter(_figCtr);
    return { s0: fig.root.scale.x, cx: _figCtr.x, cz: _figCtr.z };
  };
  // After a scale: drop the feet back to the floor and hold the figure over the
  // ground spot it had before the drag (the gizmo scales about the root, not the base).
  const groundFigureAfterScale = (fig, anchor) => {
    fig.root.updateMatrixWorld(true);
    _figBox.setFromObject(fig.root); _figBox.getCenter(_figCtr);
    fig.root.position.y -= _figBox.min.y;
    if (anchor) { fig.root.position.x += anchor.cx - _figCtr.x; fig.root.position.z += anchor.cz - _figCtr.z; }
    fig.root.updateMatrixWorld(true);
  };
  const selectFigure = (fig) => {
    if (!fig) return;
    clearBand();
    setActiveFigure(fig); // detaches any prior joint/figure selection, shows this figure's handles
    selectedProp = null;
    selectedFigure = fig;
    const mode = figureGizmoMode(fig);
    transformControls.setMode(mode);
    transformControls.setSpace(mode === "scale" ? "local" : figureGizmoSpace());
    transformControls.attach(fig.root);
    updatePresetUI();
    updatePropUI();
    updateFigureUI();
  };
  const setFigureMode = (mode) => {
    figureMode = mode;
    if (selectedFigure) {
      transformControls.setMode(mode);
      transformControls.setSpace(figureGizmoSpace());
    }
    updateFigureUI();
    requestRender();
  };

  // Interaction. Hovering a handle highlights it (so what's grabbable is obvious);
  // clicking a handle selects its joint for the rotate gizmo (FK); dragging a tip
  // diamond reaches the hand/foot via two-bone IK. Clicking the bare body selects the
  // WHOLE figure as an object (move/rotate/Del); clicking empty space deselects. A drag
  // over empty space still orbits.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0, downY = 0, downOnGizmo = false, downHandle = null;

  const setPointer = (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  };
  const pickHandle = (e) => {
    setPointer(e);
    if (!rig?.handles) return null;
    const pickable = rig.skinBind ? rig.handles.filter((h) => !h.userData.finger) : rig.handles; // fingertip IK dead on bound imports
    // Screen-space disc picking, sized to each handle's PROJECTED radius: the
    // old 3D-mesh raycast hit anywhere on the (heavily overlapping) handle
    // spheres, which on the five-joint torso blanketed the body — selecting the
    // figure itself was nearly impossible. The hit zone is now exactly the dot
    // you see (8px floor so distant handles stay grabbable). Visibility games
    // are gone too: projection doesn't care that the group is hidden.
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const focalPx = (rect.height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const v = new THREE.Vector3();
    let best = null, bestD = Infinity;
    for (const h of pickable) {
      if (!h.visible) continue;
      h.userData.joint.getWorldPosition(v);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      if (v.z > 1 || v.z < -1) continue; // behind the camera
      const hx = ((v.x + 1) / 2) * rect.width, hy = ((1 - v.y) / 2) * rect.height;
      const r = Math.min(40, Math.max(8, (h.scale.x / dist) * focalPx)); // 40px cap guards the pre-first-render default scale
      const d2 = (hx - px) ** 2 + (hy - py) ** 2;
      if (d2 <= r * r && d2 < bestD) { best = h; bestD = d2; }
    }
    return best;
  };

  let hoveredHandle = null;
  const setHover = (h) => {
    if (hoveredHandle === h) return;
    hoveredHandle = h; // opacity/color applied in updateHandles on the next render
    canvas.style.cursor = h ? (h.userData.kind === "ik" ? "grab" : "pointer") : "";
    requestRender();
  };

  // Pole hint in world space (the figure faces +Z) — only steers the bend when a
  // limb starts dead-straight; otherwise solveTwoBoneIK keeps the current plane.
  const poleWorld = (limb, aJoint) =>
    aJoint.getWorldPosition(new THREE.Vector3())
      .addScaledVector(new THREE.Vector3(...limb.pole).normalize(), 2);

  // Drive a two-bone limb so its tip reaches a world target — the gizmo-IK move (and the
  // shared math behind the free diamond drag). Bones rotate; the limb can't stretch, so
  // a target past full reach just extends it.
  const solveIkTo = (limb, targetW) => {
    const [a, b, c] = limb.chain.map((n) => rig.joints[n]);
    if (a && b && c) solveTwoBoneIK(THREE, a, b, c, targetW, poleWorld(limb, a));
  };

  // Hold each pinned foot at its planted world position via two-bone leg IK. Called
  // after anything that moves the body above the legs (moving/rotating the whole figure).
  const anyFootPinned = () => !!(rig && Object.values(rig.footPins).some(Boolean));
  const enforceFootPins = () => {
    for (const tip of figProfile(rig).plantedTips) {
      const pin = rig.footPins[tip], limb = limbFor(rig, tip);
      if (!pin || !limb) continue;
      const [a, b, c] = limb.chain.map((n) => rig.joints[n]);
      solveTwoBoneIK(THREE, a, b, c, pin, poleWorld(limb, a));
    }
  };
  // FK-rotating/translating the pelvis or whole figure drags the legs along; re-plant.
  transformControls.addEventListener("objectChange", () => {
    const o = transformControls.object;
    if (bandActive()) { bandDragApply(); return; } // move/rotate the whole multi-selection together
    if (o === ikMoveProxy) { if (selectedIkLimb) solveIkTo(selectedIkLimb, ikMoveProxy.getWorldPosition(_ikTargetV)); return; } // gizmo-IK
    // Creature scale: the gizmo may have moved one axis (or the uniform handle) —
    // lock all three to the axis that moved most so the figure scales uniformly.
    if (selectedFigure && o === selectedFigure.root && transformControls.mode === "scale" && figScaleAnchor) {
      const s0 = figScaleAnchor.s0, s = selectedFigure.root.scale;
      let r = [s.x / s0, s.y / s0, s.z / s0].reduce((a, b) => Math.abs(b - 1) > Math.abs(a - 1) ? b : a, 1);
      r = Math.min(5, Math.max(0.2, r)); // clamp ONE drag to 0.2x–5x; repeat the drag to go further
      s.setScalar(s0 * r);
      return;
    }
    if (anyFootPinned() && rig && (o === rig.root || o === rig.joints.root)) enforceFootPins();
    // Dragging a LINKED prop's gizmo: re-freeze its offset to the new pose so the edit
    // sticks instead of the per-frame link snapping it back. It stays linked.
    const att = o && attachments.find((a) => a.follower.kind === "prop" && a.follower.mesh === o);
    if (att) {
      const lW = leaderRigidMatrix(att.leader);
      if (lW) {
        if (att.follower.jointIndex != null) { // chain-joint pin: re-freeze the joint's spot so moving the chain repositions the pin
          o.updateWorldMatrix(true, true);
          chainJointWorld(o, att.follower.jointIndex, _atJ);
          att.offset.setPosition(_atJ.applyMatrix4(lW.clone().invert()));
        } else { o.updateWorldMatrix(true, false); att.offset.copy(lW).invert().multiply(o.matrixWorld); }
      }
    }
  });
  let pinBtn = null;
  const updatePinBtn = () => {
    if (!pinBtn) return;
    setToolActive(pinBtn, anyFootPinned()); // 📌 lit blue while pinned (Blender-style toggle)
  };
  const toggleFootPins = () => {
    if (!rig) return; // empty cast — nothing to pin
    if (anyFootPinned()) { for (const tip of Object.keys(rig.footPins)) rig.footPins[tip] = null; }
    else for (const tip of figProfile(rig).plantedTips) {
      if (rig.joints[tip] && limbFor(rig, tip)) rig.footPins[tip] = rig.joints[tip].getWorldPosition(new THREE.Vector3());
    }
    updatePinBtn(); requestRender();
  };

  const ik = { active: false, dragging: false, move: false, limb: null, handle: null,
    moveJoint: null, moveOffset: new THREE.Vector3(), plane: new THREE.Plane(), hit: new THREE.Vector3() };
  // End an IK/move gesture and release everything it held. Shared by pointerup AND
  // pointercancel/lostpointercapture, so a cancelled gesture can never strand
  // ik.active=true / controls.enabled=false / a held pointer capture (which deadlocks
  // the viewport).
  const endIkGesture = (pointerId) => {
    ik.active = false; ik.dragging = false; ik.move = false;
    controls.enabled = true;
    try { canvas.releasePointerCapture?.(pointerId); } catch {}
  };

  canvas.addEventListener("pointerdown", (e) => {
    downX = e.clientX; downY = e.clientY;
    // Clothing paint: LEFT-drag paints (brush dabs / lasso loop); right-drag orbits
    // (mouseButtons were remapped on enter). Let right/middle fall through to controls.
    if (clothingPaint.active && clothingPaint.imgStamp && e.button === 0) { // dragging the placed image
      const s = clothingPaint.imgStamp; s._dx = e.clientX - s.cx; s._dy = e.clientY - s.cy; s.dragging = true;
      canvas.setPointerCapture?.(e.pointerId);
      return;
    }
    if (clothingPaint.active && e.button === 0) {
      canvas.setPointerCapture?.(e.pointerId);
      positionLassoCanvas(); // keep the feedback overlay aligned to the canvas (handles panel resizes)
      if (clothingPaint.mode === "lasso") {
        clothingPaint.lasso = [[e.clientX, e.clientY]]; // screen coords (converted per-surface later)
        clothingPaint.painting = true; drawLassoLine();
      } else { clothingPaint.painting = true; ensureMaskPiece(); maskUndoSnap(); paintMaskAt(e); } // brush stamps the coverage texture
      return;
    }
    // Sculpt: left-drag runs the brush, right-drag orbits, LEFT+RIGHT held = pan. With the
    // ✋ pan tool armed, left-drag pans instead of sculpting.
    if (sculpt.active) {
      if (sculpt.panTool && e.button === 0) { canvas.setPointerCapture?.(e.pointerId); beginSculptPan(e); return; }
      if ((e.buttons & 1) && (e.buttons & 2)) { sculptStrokeAbort(); beginSculptPan(e); } // both down → pan
      else if (e.button === 0) { canvas.setPointerCapture?.(e.pointerId); sculptStrokeStart(e); }
      else { downOnGizmo = false; downHandle = null; } // right alone → OrbitControls orbits
      return;
    }
    // Right/middle buttons belong to orbit-pan and the context menu — they must
    // never start a pick/IK gesture, and (in pointerup below) never run the
    // click-selection cascade: a right-click on empty space used to
    // detachGizmo() and clear the very selection the menu was opened to act on.
    if (e.button !== 0) { downOnGizmo = false; downHandle = null; return; }
    // Pin-pick: the prop awaiting a pin takes THIS click to choose its leader — a joint
    // handle on the active figure, or another prop. Resolved here on pointerdown so none
    // of the joint-posing logic downstream can swallow it. Clicking nothing cancels.
    if (pinPickProp || pinPickGroup) {
      try {
        setPointer(e);
        let leaderRef = null;
        const exclude = pinPickGroup ? pinPickGroup : [pinPickProp]; // never link the group/prop to itself
        const hHit = pickHandle(e);
        if (hHit && hHit.userData.name) leaderRef = { kind: "joint", fig: rig, joint: hHit.userData.name };
        else {
          const tHit = raycaster.intersectObjects(propsGroup.children.filter((m) => !exclude.includes(m)), true)[0];
          const tProp = tHit && propRootOf(tHit.object);
          if (tProp) leaderRef = { kind: "prop", mesh: tProp };
        }
        if (leaderRef) {
          if (pinPickGroup) for (const m of pinPickGroup) createPropAttach(m, leaderRef); // whole group rides the leader → all enter its mask
          else if (pinPickJointIndex != null) createChainPin(pinPickProp, pinPickJointIndex, leaderRef); // combine THIS chain joint
          else createPropAttach(pinPickProp, leaderRef);
          captureAndUpload(node);
        }
      } catch (err) {
        console.error("[PoseStudio] link pick failed", err);
      }
      pinPickProp = null; pinPickGroup = null; pinPickJointIndex = null;
      transformControls.enabled = true; // re-arm the gizmo now that linking is done
      updatePropUI();
      requestRender();
      downOnGizmo = false; downHandle = null;
      return;
    }
    // Hold Shift + drag = rubber-band multi-select (plain drag still orbits).
    if (e.shiftKey) { beginBand(e); downOnGizmo = false; downHandle = null; return; }
    downOnGizmo = transformControls.axis != null; // started on a gizmo ring
    downHandle = downOnGizmo ? null : pickHandle(e);
    if (downHandle && (e.ctrlKey || e.metaKey)) {
      // Ctrl/Cmd + grab any joint handle → translate that joint directly, no need
      // to select it first. Camera-facing drag plane through the handle; the joint
      // tracks the cursor, keeping the offset from where you grabbed. Grabbing a joint
      // leaves whole-figure/prop selection (we're posing now), so drop the object gizmo.
      detachGizmo();
      ik.active = true; ik.dragging = false; ik.move = true;
      ik.limb = null; ik.handle = downHandle; ik.moveJoint = downHandle.userData.joint;
      ik.plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), downHandle.position.clone());
      setPointer(e);
      ik.moveOffset.set(0, 0, 0);
      if (raycaster.ray.intersectPlane(ik.plane, ik.hit)) {
        ik.moveOffset.copy(ik.moveJoint.getWorldPosition(new THREE.Vector3())).sub(ik.hit);
      }
      controls.enabled = false;
      canvas.setPointerCapture?.(e.pointerId);
    } else if (downHandle && downHandle.userData.kind === "ik") {
      // Arm an IK reach: lock orbit, remember the camera-facing drag plane through
      // the handle. The solve only starts once the pointer moves, so a plain click
      // instead selects the tip for rotation (twist the hand/foot). Posing a joint
      // leaves object selection, so drop the whole-figure/prop gizmo.
      detachGizmo();
      ik.active = true; ik.dragging = false;
      ik.limb = downHandle.userData.limb; ik.handle = downHandle;
      ik.plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), downHandle.position.clone());
      controls.enabled = false;
      canvas.setPointerCapture?.(e.pointerId);
    } else if (!downHandle && !downOnGizmo && bonePoseProp?.userData?._chain && boneHandlesGroup.children.length) {
      // Grab ANY chain joint (amber diamond) → arm a direct bend-drag. The grabbed joint
      // follows the cursor; the chain bends between it and a fixed ANCHOR. Which end is the
      // anchor: if a joint is combined to a mannequin, that pinned joint is always the anchor
      // (it stays glued). Otherwise the anchor is whichever END is FARTHER from the joint you
      // grabbed — so you can wave EITHER end into shape (grab the tip → base holds; grab the
      // base → tip holds). Solve starts on move, so a plain click just selects for FK rotate.
      setPointer(e);
      const o = raycaster.intersectObjects(boneHandlesGroup.children, false)[0]?.object;
      const bones = bonePoseProp.userData._bones;
      let jointIndex = null, bone = null;
      if (o?.userData.isChainTip) jointIndex = bones.length; // tip endpoint
      else if (o?.userData.isBoneHandle) { jointIndex = bones.indexOf(o.userData.bone); bone = o.userData.bone; }
      if (jointIndex != null) {
        const n = bones.length, pinned = bonePoseProp.userData._pinIndex;
        const anchor = pinned != null ? pinned : (jointIndex <= n / 2 ? n : 0); // pin wins; else hold the far end
        chainDrag.active = true; chainDrag.dragging = false; chainDrag.prop = bonePoseProp;
        chainDrag.jointIndex = jointIndex; chainDrag.driveCount = jointIndex; chainDrag.anchorIndex = anchor;
        chainDrag.bone = bone; chainDrag.canIk = jointIndex !== anchor; // grabbing the anchor itself: select only
        if (chainDrag.canIk) { detachGizmo(); initChainRope(bonePoseProp, anchor); } // seed the rope from the current pose
        chainDrag.plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), o.position.clone());
        chainDrag.offset.set(0, 0, 0);
        if (raycaster.ray.intersectPlane(chainDrag.plane, chainDrag.hit)) {
          chainDrag.offset.copy(o.getWorldPosition(new THREE.Vector3())).sub(chainDrag.hit);
        }
        controls.enabled = false;
        canvas.setPointerCapture?.(e.pointerId);
      }
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (clothingPaint.imgStamp?.dragging) { const s = clothingPaint.imgStamp; s.cx = e.clientX - s._dx; s.cy = e.clientY - s._dy; drawImageOverlay(); return; }
    if (clothingPaint.painting) {
      if (clothingPaint.mode === "lasso") { clothingPaint.lasso.push([e.clientX, e.clientY]); drawLassoLine(); }
      else { paintMaskAt(e); updateBrushCursor(e); } // 3D ring tracks the surface hit so you see where paint lands
      return;
    }
    if (clothingPaint.active) { if (clothingPaint.mode === "brush") updateBrushCursor(e); return; } // 3D brush footprint ring on the surface while hovering
    if (sculpt.active) {
      if (sculpt.panning) { if (sculpt.panTool ? (e.buttons & 1) : ((e.buttons & 1) && (e.buttons & 2))) sculptPanMove(e); else endSculptPan(); return; }
      if (sculpt.painting) sculptStrokeMove(e); else sculptHover(e);
      return;
    }
    if (band.active) { updateBand(e); return; }
    if (chainDrag.active) { // dragging a chain joint → ease toward the cursor (settle loop), never snap
      if (!chainDrag.canIk) return; // anchor or at/below a pinned joint: no bend (selection happens on pointerup)
      if (!chainDrag.dragging && Math.hypot(e.clientX - downX, e.clientY - downY) <= 4) return;
      chainDrag.dragging = true;
      setPointer(e);
      if (!raycaster.ray.intersectPlane(chainDrag.plane, chainDrag.hit)) return;
      chainDrag.desired.copy(chainDrag.hit).add(chainDrag.offset); // where the cursor wants the grabbed joint
      if (!chainDrag.settling) { chainDrag.settling = true; chainRopeStep(); } // rope sim eases toward it (anti-spasm)
      return;
    }
    if (ik.active) {
      if (!ik.dragging && Math.hypot(e.clientX - downX, e.clientY - downY) <= 4) return;
      ik.dragging = true;
      setPointer(e);
      if (!raycaster.ray.intersectPlane(ik.plane, ik.hit)) return;
      if (ik.move) {
        // Ctrl-drag: translate the grabbed joint to follow the cursor on the plane.
        const targetW = ik.hit.clone().add(ik.moveOffset);
        const j = ik.moveJoint, parent = j.parent;
        if (parent) { parent.updateMatrixWorld(true); j.position.copy(parent.worldToLocal(targetW)); }
        else j.position.copy(targetW);
        j.updateMatrixWorld(true);
      } else if (ik.limb.spine) {
        bendSpineToward(THREE, ik.limb.bones, rig.rest, ik.hit); // head → bend the whole spine
      } else if (ik.limb.aim) {
        aimBoneAt(THREE, rig.joints[ik.limb.parentName], rig.joints[ik.limb.jointName], ik.hit);
      } else {
        // limb.bones (thumb / 2-bone toe) or limb.chain of joint names (arms/legs/fingers).
        const [a, b, c] = ik.limb.bones || ik.limb.chain.map((n) => rig.joints[n]);
        solveTwoBoneIK(THREE, a, b, c, ik.hit, poleWorld(ik.limb, a));
      }
      requestRender();
      return;
    }
    if (transformControls.dragging) return;
    // Raycast the handles even while they're hidden (pickHandle force-shows them for the
    // test). Otherwise, crossing the empty gap between the torso and a far-flung foot/hand
    // handle hides the handles, and a hidden handle can't be re-acquired — you'd be stuck
    // unable to grab the tip of an extended limb. pickHandle also sets the ray for the
    // body test below.
    const handleHit = pickHandle(e);
    const overBody = !!handleHit || (rig ? raycaster.intersectObjects(rig.meshes, true).length > 0 : false);
    if (overBody !== bodyHovered) { bodyHovered = overBody; requestRender(); }
    setHover(handleHit);
  });

  canvas.addEventListener("pointerup", (e) => {
    if (clothingPaint.imgStamp?.dragging) { clothingPaint.imgStamp.dragging = false; try { canvas.releasePointerCapture?.(e.pointerId); } catch {} return; }
    if (clothingPaint.painting) {
      clothingPaint.painting = false;
      try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
      if (clothingPaint.mode === "lasso") {
        if (clothingPaint.lasso && clothingPaint.lasso.length > 3) finishLasso(); // a drawn loop → new piece
        else { clothingPaint.lasso = null; lassoCanvas.getContext("2d").clearRect(0, 0, lassoCanvas.width, lassoCanvas.height); selectGarmentPiece(pickGarmentPiece(e)); } // a click → select a piece
      } else { lassoCanvas.getContext("2d").clearRect(0, 0, lassoCanvas.width, lassoCanvas.height); captureAndUpload(node); } // brush release → mask already live, just record
      return;
    }
    if (sculpt.active) {
      if (sculpt.panning) { if (!(sculpt.panTool ? (e.buttons & 1) : ((e.buttons & 1) && (e.buttons & 2)))) { endSculptPan(); try { canvas.releasePointerCapture?.(e.pointerId); } catch {} } return; }
      if (e.button === 0 && sculpt.painting) { sculptStrokeEnd(); try { canvas.releasePointerCapture?.(e.pointerId); } catch {} }
      return;
    }
    if (e.button !== 0) return; // selection is left-click only (gestures are left-started too)
    if (band.active) { endBand(e); return; }
    if (chainDrag.active) {
      const wasDrag = chainDrag.dragging, bone = chainDrag.bone, prop = chainDrag.prop, ji = chainDrag.jointIndex;
      chainDrag.active = false; chainDrag.dragging = false; controls.enabled = true;
      try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
      if (wasDrag) captureAndUpload(node); // dragged → IK pose committed
      else { // plain click on a joint → select it for combine (and FK-rotate if it's a bone)
        selectedChainJoint = { prop, jointIndex: ji };
        selectedProp = prop; // surface the prop panel so 🔗 combine is reachable
        if (bone) { selectedBone = bone; transformControls.attach(bone); transformControls.setMode("rotate"); transformControls.setSpace("local"); }
        updatePropUI();
        requestRender();
      }
      return;
    }
    if (ik.active) {
      const wasDrag = ik.dragging;
      const handle = ik.handle;
      endIkGesture(e.pointerId);
      if (wasDrag) {
        // Moving a foot — or aiming its knee, which carries the foot — re-anchors
        // that foot's pin to where it ended up.
        const nm = handle?.userData?.name;
        const ankle = nm === "ankleL" || nm === "kneeL" ? "ankleL"
          : nm === "ankleR" || nm === "kneeR" ? "ankleR" : null;
        if (ankle && rig.footPins[ankle]) rig.footPins[ankle] = rig.joints[ankle].getWorldPosition(new THREE.Vector3());
        captureAndUpload(node);
      } else if (handle) { attachGizmo(handle.userData.toe ? handle.userData.limb.bones[0] : handle.userData.joint); requestRender(); } // plain click selects for FK rotate (toe → its base bone, not the tip marker)
      return;
    }
    if (downOnGizmo || transformControls.dragging) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return; // was an orbit drag
    // Explicit handles beat the body: clicking a joint handle selects it for FK. Handles
    // sit over the body, so posing a limb never accidentally grabs the whole figure.
    if (downHandle) { attachGizmo(downHandle.userData.joint); requestRender(); return; }
    setPointer(e);
    // Imported-prop bone handles beat everything prop-shaped (they float over
    // the mesh exactly like figure joint handles beat the body).
    if (boneHandlesGroup.children.length) {
      const bHit = raycaster.intersectObjects(boneHandlesGroup.children, false)[0];
      if (bHit && !bHit.object.userData.isChainTip) { // segment dot → FK rotate that joint (tip is drag-armed in pointerdown)
        selectedBone = bHit.object.userData.bone;
        transformControls.attach(selectedBone);
        transformControls.setMode("rotate");
        transformControls.setSpace("local");
        requestRender();
        return;
      }
    }
    // A prop is its own object (carries its own transform mode).
    const propHit = raycaster.intersectObjects(propsGroup.children, true)[0]; // recursive: model props are Groups
    const propObj = propHit && propRootOf(propHit.object);
    if (propObj) { selectPropOrGroup(propObj); requestRender(); return; } // a grouped member selects its whole group
    // Clicking a body selects that WHOLE person as an object (move/rotate gizmo + Del),
    // like a prop; its joint handles stay visible so you can drop into posing. Clicking
    // empty space deselects everything.
    const hit = raycaster.intersectObjects(figures.flatMap((f) => f.meshes), true)[0];
    const fig = hit ? figures.find((f) => f.meshes.includes(hit.object)) : null;
    if (fig) selectFigure(fig); else detachGizmo();
    requestRender();
  });

  canvas.addEventListener("pointerleave", () => {
    if (sculpt.active && sculptRing && sculptRing.visible && !sculpt.painting) { sculptRing.visible = false; requestRender(); }
    if (brushCursor && brushCursor.visible) { brushCursor.visible = false; requestRender(); }
    if (clothingPaint.active && clothingPaint.mode === "brush" && !clothingPaint.painting) lassoCanvas.getContext("2d").clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
    if (ik.active) return;
    bodyHovered = false;
    setHover(null);
    requestRender(); // hide the handles once the cursor leaves (unless still posing)
  });
  // If the browser cancels/steals the pointer mid-gesture (touch interruption, OS,
  // context menu), pointerup never fires — without this the viewport would deadlock with
  // orbit disabled and IK still solving. Reset the gesture and re-render.
  const onPointerAbort = (e) => {
    if (sculpt.active && sculpt.panning) { endSculptPan(); return; }
    if (sculpt.active && sculpt.painting) { sculptStrokeEnd(); return; }
    if (clothingPaint.painting) { clothingPaint.painting = false; if (clothingPaint.mode === "lasso") finishLasso(); return; }
    if (band.active) { endBand(e); return; }
    if (ik.active) { endIkGesture(e.pointerId); requestRender(); }
  };
  canvas.addEventListener("pointercancel", onPointerAbort);
  canvas.addEventListener("lostpointercapture", onPointerAbort);

  // ── toolbar + resets ────────────────────────────────────────────────────
  // Posing is selection-driven, not mode-driven: click a body = select the whole
  // figure (move/rotate gizmo); click a joint handle = pose that joint (FK rings /
  // IK drag); click a prop = move/rotate/scale it. There is no global gizmo mode.
  const resetView = () => {
    camera.position.copy(HOME.pos);
    controls.target.copy(HOME.target);
    controls.update();
    requestRender();
    captureAndUpload(node);
  };
  const resetPose = () => {
    if (!rig) return; // empty cast — nothing to reset
    if (rig.rest) for (const [j, q] of rig.rest) j.quaternion.copy(q);
    if (rig.restPos) for (const [j, p] of rig.restPos) j.position.copy(p); // undo fold + Ctrl-move
    // Joints rest at the skeletal-morph positions (not the neutral bind) so a pose
    // reset keeps the current body shape while clearing fold/Ctrl-move.
    if (rig.curSkelRest) for (const [b, p] of rig.curSkelRest) b.position.copy(p);
    if (rig.rootRest) rig.root.position.copy(rig.rootRest);
    for (const k of Object.keys(rig.footPins)) rig.footPins[k] = null;
    updatePinBtn();
    detachGizmo();
    requestRender();
    captureAndUpload(node);
  };

  // Apply a captured full-body pose (BODY_POSES) to one figure: rest the skeleton
  // first (clears Ctrl-moves/folds and anything the capture doesn't cover), then
  // set the captured local quats. Placement (fig.root) and body shape (bone
  // positions/sliders) stay the figure's own — a pose is pure posture.
  const applyBodyPose = (f, pose) => {
    if (!f || !pose) return;
    if (f.rest) for (const [j, q] of f.rest) j.quaternion.copy(q);
    if (f.restPos) for (const [j, p] of f.restPos) j.position.copy(p);
    if (f.curSkelRest) for (const [b, p] of f.curSkelRest) b.position.copy(p);
    if (f.footPins) for (const k of Object.keys(f.footPins)) f.footPins[k] = null; // planted feet can't survive new legs
    if (f === rig) updatePinBtn();
    const setQuats = (map, lookup) => {
      for (const [name, q] of Object.entries(map || {})) {
        const b = lookup(name);
        if (b && Array.isArray(q) && q.length === 4) b.quaternion.fromArray(q);
      }
    };
    setQuats(pose.joints, (n) => f.joints[n]);
    const spineByName = new Map((f.spineChain || []).map((b) => [b.name, b]));
    setQuats(pose.spine, (n) => spineByName.get(n));
    const digitByName = new Map(digitBones(f).map((b) => [b.name, b]));
    setQuats(pose.digits, (n) => digitByName.get(n));
    detachGizmo();
    requestRender();
    captureAndUpload(node);
  };

  // ── L↔R mirror ──────────────────────────────────────────────────────────
  // Mirror a joint's pose onto its opposite-side joint across the figure's
  // sagittal plane (left-right = world X, since the figure is stood facing +Z).
  // We reflect the bone's MOTION FROM REST in world space, then re-apply it
  // relative to the opposite bone's OWN rest world orientation. Routing through
  // each bone's real rest (rig.restWorld) cancels out the rig's per-bone local-
  // axis convention, so this is correct on any symmetric skeleton — reflecting
  // absolute orientations (the previous approach) only worked on axis-aligned rigs.
  // MIRROR_PAIRS / LIMB_MIRROR_SETS live on the rig profile (module scope).
  const reflectWorldX = (q) => new THREE.Quaternion(q.x, -q.y, -q.z, q.w); // conj. by world-X reflection
  // Name → bone for everything mirrorable on the ACTIVE figure (canonical joints +
  // finger/toe bones). Rebuilt at the start of mirror() so it follows the figure.
  const buildMirrorBones = () => {
    const m = new Map(Object.entries(rig.joints));
    for (const b of digitBones(rig)) m.set(b.name, b);
    return m;
  };
  let mirrorBones = null;
  const applyMirror = (srcWorldQ, srcWorldP, srcName, dstName) => {
    const dst = mirrorBones.get(dstName);
    const restS = rig.restWorld.get(srcName), restD = rig.restWorld.get(dstName);
    if (!dst || !restS || !restD) return;
    const parent = dst.parent || rig.root;
    const deltaW = srcWorldQ.clone().multiply(restS.clone().invert()); // world rotation away from rest
    const dstWorld = reflectWorldX(deltaW).multiply(restD);            // mirrored, on dst's rest
    dst.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(dstWorld));
    // Position: carry ONLY a real local translation (a Ctrl-move/fold on the bone),
    // NEVER the rotation-induced world swing. The old code diffed the bone's posed
    // world position against its REST-WORLD (T-pose) position, so a rotation/IK pose
    // — where the bone has swung far from T-pose but its LOCAL position is unchanged —
    // was misread as a huge translation and stacked on top of the mirrored rotation,
    // stretching the limb. A bone whose local position still equals its rest is purely
    // rotation-posed → leave dst at its rest-local so plain FK places it.
    const src = mirrorBones.get(srcName);
    const srcRestLocal = rig.restPos?.get(src), dstRestLocal = rig.restPos?.get(dst);
    if (srcWorldP && src && srcRestLocal && dstRestLocal) {
      if (src.position.distanceToSquared(srcRestLocal) < 1e-8) {
        dst.position.copy(dstRestLocal); // rotation/IK only → no translation to mirror
      } else {
        // Real Ctrl-move: the world offset from where pure FK would put the bone is the
        // translation; reflect it across world-X onto dst's FK position.
        const sp = src.parent || rig.root; sp.updateMatrixWorld(true);
        const transW = srcWorldP.clone().sub(srcRestLocal.clone().applyMatrix4(sp.matrixWorld));
        parent.updateMatrixWorld(true);
        const dstW = dstRestLocal.clone().applyMatrix4(parent.matrixWorld);
        dstW.set(dstW.x - transW.x, dstW.y + transW.y, dstW.z + transW.z);
        dst.position.copy(parent.worldToLocal(dstW));
      }
    }
    dst.updateMatrixWorld(true); // child reads fresh parent world next (parent-first order)
  };
  const limbPairsFor = (name) => {
    for (const set of figProfile(rig).limbMirrorSets) {
      if (!set.some((base) => name === base + "L" || name === base + "R")) continue;
      const side = name.endsWith("L") ? "L" : "R", other = side === "L" ? "R" : "L";
      return set.map((base) => [base + side, base + other]); // [src, dst], parent-first order
    }
    return null;
  };
  // Finger/toe bone name on the opposite side (index_03_l ↔ index_03_r).
  const digitMirrorName = (name) => {
    const m = name.match(/^(.*)_(l|r)$/i);
    return m ? `${m[1]}_${m[2].toLowerCase() === "l" ? "r" : "l"}` : name;
  };
  const mirror = () => {
    if (!rig) return; // empty cast — nothing to mirror
    mirrorBones = buildMirrorBones();
    const sel = transformControls.object;
    const selName = sel && Object.keys(rig.joints).find((k) => rig.joints[k] === sel);
    const pairs = selName && limbPairsFor(selName);
    if (pairs) {
      // A limb is selected → mirror that limb (joints first, parent→child) to the
      // other side, then carry its hand/foot pose across (digits live below the
      // wrist/ankle, so the limb joints must already be mirrored).
      for (const [srcN, dstN] of pairs) {
        const src = rig.joints[srcN];
        if (src) applyMirror(src.getWorldQuaternion(new THREE.Quaternion()), src.getWorldPosition(new THREE.Vector3()), srcN, dstN);
      }
      const side = selName.endsWith("L") ? "L" : "R", other = side === "L" ? "R" : "L";
      for (const b of digitBones(rig)) {
        if (!b.name.match(new RegExp(`_${side.toLowerCase()}$`, "i"))) continue;
        const dstName = digitMirrorName(b.name);
        if (mirrorBones.has(dstName)) applyMirror(b.getWorldQuaternion(new THREE.Quaternion()), null, b.name, dstName);
      }
    } else {
      // Nothing (or a centerline joint) selected → flip the whole pose L↔R. Snapshot
      // first since it's a swap, then assign parent-first (joints then digits, which
      // hang below the wrists/ankles).
      const profile = figProfile(rig);
      const snap = new Map(), snapPos = new Map();
      for (const n of profile.joints) {
        const j = rig.joints[n];
        if (j) { snap.set(n, j.getWorldQuaternion(new THREE.Quaternion())); snapPos.set(n, j.getWorldPosition(new THREE.Vector3())); }
      }
      for (const b of digitBones(rig)) snap.set(b.name, b.getWorldQuaternion(new THREE.Quaternion()));
      for (const n of profile.joints) {
        if (!rig.joints[n]) continue;
        const pair = profile.mirrorPairs.find((p) => p.includes(n));
        const srcN = pair ? (pair[0] === n ? pair[1] : pair[0]) : n;
        if (snap.has(srcN)) applyMirror(snap.get(srcN), snapPos.get(srcN), srcN, n);
      }
      for (const b of digitBones(rig)) {
        const srcN = digitMirrorName(b.name);
        if (snap.has(srcN)) applyMirror(snap.get(srcN), null, srcN, b.name);
      }
    }
    requestRender();
    captureAndUpload(node);
  };

  // Icon-only buttons (label is a single glyph; the tooltip carries the meaning).
  // mkBtn = the bordered style the floating panels use; mkToolBtn = the Blender-
  // style flat icon used inside the left strip's grouped pills.
  const mkBtn = (label, title, onClick) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    b.style.cssText =
      "font:14px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;" +
      "width:30px;height:26px;padding:0;background:#2a2a35;color:#ccd;pointer-events:auto;" +
      "border:1px solid #4a4a55;border-radius:5px;cursor:pointer;opacity:0.85;";
    b.addEventListener("pointerdown", (e) => e.stopPropagation()); // a button press must not start an orbit
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(b); });
    return b;
  };
  const mkToolBtn = (label, title, onClick) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    // Edge-to-edge squares (no padding, no own radius) — the active blue fills
    // the button completely; the GROUP's rounded corners clip the end buttons.
    b.style.cssText =
      "font:15px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;" +
      "width:30px;height:30px;padding:0;background:transparent;color:#d8d8de;pointer-events:auto;" +
      "border:none;border-radius:0;cursor:pointer;";
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(b); });
    b.addEventListener("pointerenter", () => { if (!b._pcrOn) b.style.background = "#3d3d48"; });
    b.addEventListener("pointerleave", () => { if (!b._pcrOn) b.style.background = "transparent"; });
    return b;
  };
  // Active/toggled tool = Blender's selection blue, filling the button.
  const setToolActive = (b, on) => {
    b._pcrOn = !!on;
    b.style.background = on ? "#4772b3" : "transparent";
    b.style.color = on ? "#ffffff" : "#d8d8de";
  };
  const mkToolGroup = () => {
    const g = document.createElement("div");
    g.style.cssText =
      "display:flex;flex-direction:column;gap:0;padding:0;pointer-events:auto;" +
      "background:rgba(26,26,32,0.92);border-radius:5px;overflow:hidden;"; // rounded pill clips the square buttons
    return g;
  };
  // Vertical tool strip down the left edge, Blender-style: a TRANSFORM group
  // (move/rotate/scale — the single home for gizmo modes, the per-selection
  // panels no longer repeat them) above a group with everything else. The
  // groups ALWAYS stack; when the viewport is too short, the main pill wraps
  // its buttons into extra columns INSIDE itself (flex-shrink + wrap) — the
  // old toolbar-level wrap bounced the entire second pill sideways the moment
  // it didn't fit, leaving a dead gap under the transform group.
  const toolbar = document.createElement("div");
  toolbar.className = "pcr-pose-toolbar"; // hover-gated opacity (see installPoseStyles)
  // pointer-events:none so the container's empty area (it lays out wider than the button
  // column) is click-through to orbit; the groups re-enable pointer-events themselves.
  toolbar.style.cssText =
    "position:absolute;top:6px;left:6px;z-index:2;display:flex;flex-direction:column;gap:6px;" +
    "height:calc(100% - 12px);align-items:flex-start;pointer-events:none;";
  const toolGroup = mkToolGroup();
  toolGroup.style.flex = "none";
  const mainGroup = mkToolGroup();
  mainGroup.style.flex = "0 1 auto";       // hug content, but shrink when short…
  mainGroup.style.minHeight = "0";
  mainGroup.style.flexWrap = "wrap";       // …and wrap into a second column inside the pill
  mainGroup.style.alignContent = "flex-start";
  toolbar.appendChild(toolGroup);
  toolbar.appendChild(mainGroup);

  // ── transform tools (the Blender tool column) ───────────────────────────────
  // A GLOBAL armed mode, Blender-style: clicking a tool always works and stays
  // lit; every selection adopts it where it can. Scale applies to props and to
  // CREATURE figures (uniform); the HUMAN sizes via body sliders instead (its
  // root scale is load-bearing for skeleton binding) — with scale armed, a human
  // figure / IK simply keeps its last move/rotate gizmo until a scalable target
  // comes under the tool.
  const toolBtns = [];
  let transformTool = "translate";
  const updateToolUI = () => {
    for (const { tool, btn } of toolBtns) setToolActive(btn, tool === transformTool);
  };
  const setTransformTool = (tool) => {
    transformTool = tool;
    // arm the per-kind defaults so the NEXT selection of each kind adopts it
    if (tool !== "scale") {
      figureMode = tool;
      ikMoveMode = tool === "translate";
    }
    propMode = tool;
    // apply to the current selection where compatible
    if (bandActive()) {
      // Scale works on a group too: the proxy delta (newProxy·startProxy⁻¹) is decomposed
      // per member, so a scale about the median grows each item + its distance from centre.
      transformControls.setMode(tool);
      transformControls.setSpace(tool === "scale" ? "local" : "world"); // proxy is axis-aligned → local == world
    } else if (selectedIkLimb) {
      if (tool !== "scale") setIkJointMode(tool === "translate" ? "move" : "rotate");
    } else if (selectedProp) {
      setPropMode(tool);
    } else if (selectedFigure) {
      if (tool !== "scale") setFigureMode(tool);
      else if (figureCanScale(selectedFigure)) { transformControls.setMode("scale"); transformControls.setSpace("local"); requestRender(); }
    }
    updateToolUI();
    requestRender();
  };
  for (const [tool, label, title] of [
    ["translate", "✥", "Move (W)"],
    ["rotate", "⟲", "Rotate (E)"],
    ["scale", "⤢", "Scale — props & creatures (R)"],
  ]) {
    const b = mkToolBtn(label, title, () => setTransformTool(tool));
    toolBtns.push({ tool, btn: b });
    toolGroup.appendChild(b);
  }
  updateToolUI();

  // The strip stays lean (it must fit one column even in a short node):
  // - adding people/props/floor → the ➕ menu ("🧑 Subject ▸" etc.)
  // - mirror / reset pose / foot pins / reset camera → the right-click menu
  // - deletion → the selected panels (🗑) and the Del key
  // - body-shape (💪) → per-person, on the selected-figure panel

  // ── scene props ───────────────────────────────────────────────────────────
  // Spawn primitive props and pose them with the same gizmo. Props are REAL matte
  // geometry (unlike the grid/handles/gizmo, which are stripped from the capture),
  // so they land in the control map and DepthAnything reads them as part of the
  // scene — a box to sit on, a ball to hold, a pole to lean against. Selected by
  // raycast → gizmo, with a per-prop translate/rotate/scale mode; round-tripped
  // through pose_state so they survive save/reload and undo/redo. Default sizes are
  // in the figure's scale (~1.8 units tall); `y` rests the prop on the floor (y=0).
  const PROP_DEFS = {
    box:      { label: "📦 box",      geo: () => new THREE.BoxGeometry(0.5, 0.5, 0.5),           y: 0.25 },
    platform: { label: "▭ platform",  geo: () => new THREE.BoxGeometry(1.0, 0.12, 1.0),          y: 0.06 },
    sphere:   { label: "⚪ sphere",    geo: () => new THREE.SphereGeometry(0.22, 24, 16),         y: 0.22 },
    cylinder: { label: "🛢 cylinder", geo: () => new THREE.CylinderGeometry(0.13, 0.13, 0.8, 24), y: 0.40 },
    pole:     { label: "📏 pole",     geo: () => new THREE.CylinderGeometry(0.04, 0.04, 1.6, 16), y: 0.80 },
    cone:     { label: "🔺 cone",     geo: () => new THREE.ConeGeometry(0.3, 0.6, 24),            y: 0.30 },
  };
  // Segmented, articulated chain props — braids, tails, ropes, tentacles. Each is a
  // tapered tube SkinnedMesh over a serial bone chain along +Y, built procedurally so
  // short/long are just segment-count + length variants. The chain plugs into the same
  // 🦴 FK system imported skinned props use (per-segment handle, rotate with the gizmo)
  // AND carries a tip handle: drag it and a FABRIK solve ripples the whole chain. Bone
  // poses round-trip through the existing rest-diff serialization (_bones/_boneRest).
  const CHAIN_DEFS = {
    chainShort:  { label: "🪢 chain — short",  segs: 7,  len: 0.7, r0: 0.045, r1: 0.045 }, // uniform radius = a true cylinder, not a cone
    chainMedium: { label: "🪢 chain — medium", segs: 11, len: 1.2, r0: 0.037, r1: 0.037 },
    chainLong:   { label: "🪢 chain — long",   segs: 16, len: 1.7, r0: 0.03,  r1: 0.03  },
  };
  // One shared matte material for all props (teardown's scene.traverse dispose is
  // idempotent, so sharing is safe). Distinct from skin so props read as separate.
  // DoubleSide so photoscanned / split GLBs with inverted or open winding don't render
  // see-through (front faces culled → you'd see the inside/floor through them).
  const propMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
  const propsGroup = new THREE.Group();
  scene.add(propsGroup);
  // Stable per-prop identity, mirroring figureUidSeq: undo/restore re-applies a
  // prop's LIVE name by uid (names are identity, not posture), and paste strips
  // uids for fresh ones. Restore overrides with the saved uid.
  let propUidSeq = 1;
  // NAMED props are region entities (own mask row + $name{} block); load-failed
  // placeholders are excluded — they have no mesh to render a mask from.
  function namedPropMeshes() {
    return propsGroup.children.filter((m) => m.userData.customName && !m.userData._failedRecord);
  }
  // Region-entity names in mask-row order: figures (custom or mannequinN), then
  // named props. THE name list every block-sync and uniqueness check reads.
  function liveEntityNames() {
    return [...effectiveFigureNames(figures), ...namedPropMeshes().map((m) => m.userData.customName)];
  }

  // Bundled CC0 model props (Kenney Furniture Kit, kenney.nl, public domain). Loaded as
  // GLB, normalized to a real-world height, re-pivoted so the base rests on the floor, and
  // re-materialed to the shared matte so they read like the primitives + give clean depth.
  // `h` = target world height in metres (figure is ~1.8m); serialization keys on the type
  // string, so a model prop round-trips by reloading its GLB. Stay real geometry in the
  // capture (DepthAnything needs them), unlike grid/handles/gizmo which captureBlob strips.
  const MODEL_PROPS = {
    schoolDesk:  { file: "schoolDeskOnly.glb",  label: "🏫 school desk",h: 0.70 }, // split from the combined model (CC-BY, 3DGhost903)
    schoolChair: { file: "schoolChair.glb",     label: "🪑 school chair",h: 0.80 }, // node transforms baked in → upright; h = real height
    desk:        { file: "desk.glb",            label: "🪑 desk",       h: 0.75 },
    deskChair:   { file: "chairDesk.glb",       label: "💺 desk chair", h: 1.05 },
    chair:       { file: "chair.glb",           label: "🪑 chair",      h: 0.90 },
    table:       { file: "table.glb",           label: "🍽 table",      h: 0.74 },
    tableRound:  { file: "tableRound.glb",      label: "🍽 round table",h: 0.74 },
    stool:       { file: "stoolBar.glb",        label: "🪑 stool",      h: 0.85 },
    bookcase:    { file: "bookcaseOpen.glb",    label: "📚 bookcase",   h: 1.10 },
    crate:       { file: "cardboardBoxClosed.glb", label: "📦 crate",   h: 0.50 },
    bed:         { file: "bedSingle.glb",       label: "🛏 bed",        h: 0.45 },
    sofa:        { file: "loungeSofa.glb",      label: "🛋 sofa",       h: 0.75 },
    sideTable:   { file: "sideTable.glb",       label: "🛍 side table", h: 0.55 },
    trashcan:    { file: "trashcan.glb",        label: "🗑 trash can",  h: 0.55 },
    plant:       { file: "pottedPlant.glb",     label: "🪴 plant",      h: 0.60 },
    stairs:      { file: "stairs.glb",          label: "🪜 stairs",     h: 1.10 },
    // ── Kenney CC0 kits (Blaster / Survival / Food / Car / Mini-Skate / City-Roads / Fantasy-Town) ──
    gun:         { file: "gun.glb",             label: "🔫 gun",        h: 0.18 },
    bottle:      { file: "bottle.glb",          label: "🍾 bottle",     h: 0.25 },
    cup:         { file: "cup.glb",             label: "☕ cup",        h: 0.10 },
    mug:         { file: "mug.glb",             label: "🍺 mug",        h: 0.11 },
    wineglass:   { file: "wineglass.glb",       label: "🍷 wine glass", h: 0.18 },
    axe:         { file: "axe.glb",             label: "🪓 axe",        h: 0.70 },
    hammer:      { file: "hammer.glb",          label: "🔨 hammer",     h: 0.35 },
    pickaxe:     { file: "pickaxe.glb",         label: "⛏ pickaxe",    h: 0.70 },
    shovel:      { file: "shovel.glb",          label: "🥄 shovel",     h: 1.00 },
    carSedan:    { file: "carSedan.glb",        label: "🚗 sedan",      h: 1.45 },
    carSuv:      { file: "carSuv.glb",          label: "🚙 SUV",        h: 1.70 },
    van:         { file: "van.glb",             label: "🚐 van",        h: 2.00 },
    truck:       { file: "truck.glb",           label: "🚚 truck",      h: 2.60 },
    kart:        { file: "kart.glb",            label: "🏎 kart",       h: 0.80 },
    skateboard:  { file: "skateboard.glb",      label: "🛹 skateboard", h: 0.12 },
    lamppost:    { file: "lamppost.glb",        label: "🏮 lamppost",   h: 3.00 },
    trafficCone: { file: "trafficCone.glb",     label: "🚧 traffic cone",h: 0.50 },
    barrier:     { file: "barrier.glb",         label: "🚧 barrier",    h: 1.00 },
    roadSign:    { file: "roadSign.glb",        label: "🛑 road sign",  h: 2.50 },
    barrel:      { file: "barrel.glb",          label: "🛢 barrel",     h: 0.90 },
    chest:       { file: "chest.glb",           label: "🧰 chest",      h: 0.60 },
    crateWood:   { file: "crateWood.glb",       label: "📦 wood crate", h: 0.60 },
    fence:       { file: "fence.glb",           label: "🚧 fence",      h: 1.00 },
    signpost:    { file: "signpost.glb",        label: "🪧 signpost",   h: 1.80 },
    rock:        { file: "rock.glb",            label: "🪨 rock",       h: 0.60 },
    tree:        { file: "tree.glb",            label: "🌲 tree",       h: 3.50 },
    campfire:    { file: "campfire.glb",        label: "🔥 campfire",   h: 0.40 },
    workbench:   { file: "workbench.glb",       label: "🛠 workbench",  h: 1.00 },
    doorway:     { file: "doorway.glb",         label: "🚪 doorway",    h: 2.20 },
    windowframe: { file: "windowframe.glb",     label: "🪟 window",     h: 1.20 },
    pillar:      { file: "pillar.glb",          label: "🏛 pillar",     h: 2.50 },
    fountain:    { file: "fountain.glb",        label: "⛲ fountain",   h: 0.80 },
    bench:       { file: "bench.glb",           label: "🪑 bench",      h: 0.90 },
    // ── Quaternius CC0 (RPG Items / misc) ──
    sword:       { file: "sword.glb",           label: "⚔ sword",      h: 0.90 },
    dagger:      { file: "dagger.glb",          label: "🗡 dagger",     h: 0.32 },
    spear:       { file: "spear.glb",           label: "🔱 spear",      h: 1.80 },
    bow:         { file: "bow.glb",             label: "🏹 bow",        h: 1.20 },
    shield:      { file: "shield.glb",          label: "🛡 shield",     h: 0.60 },
    book:        { file: "book.glb",            label: "📖 book",       h: 0.24 },
    key:         { file: "key.glb",             label: "🔑 key",        h: 0.12 },
    guitar:      { file: "guitar.glb",          label: "🎸 guitar",     h: 1.00 },
    bag:         { file: "bag.glb",             label: "🎒 bag",        h: 0.45 },
    // ── CC-BY (Poly by Google / creators) — attribution in CREDITS ──
    motorcycle:  { file: "motorcycle.glb",      label: "🏍 motorcycle", h: 1.10 },
    bicycle:     { file: "bicycle.glb",         label: "🚲 bicycle",    h: 1.10 },
    scooter:     { file: "scooter.glb",         label: "🛵 scooter",    h: 1.10 },
    // Footwear: only the calibrated boots ship (loose props for undressing scenes, and the
    // calibration source for the wearable "boots" style). True L/R, split from the pair.
    // Other shoes get added one at a time as each is calibrated. CC-BY DanlyVostok.
    tacticalBootR:{ file: "boot_tactical_right.glb", label: "🥾 boot (R)", h: 0.34 },
    tacticalBootL:{ file: "boot_tactical_left.glb",  label: "🥾 boot (L)", h: 0.34 },
    heelR:        { file: "heel_right.glb",          label: "👠 heel (R)", h: 0.13 }, // CC-BY Andrey (Earl_1) classic pump, split from the pair (uncalibrated — position to fit)
    heelL:        { file: "heel_left.glb",           label: "👠 heel (L)", h: 0.13 },
    sneakerR:     { file: "sneaker_right.glb",       label: "👟 sneaker (R)", h: 0.12 }, // CC-BY AntonCla photoscan, split from the pair (uncalibrated — position to fit)
    sneakerL:     { file: "sneaker_left.glb",        label: "👟 sneaker (L)", h: 0.12 },
  };
  const propLoader = new GLTFLoader();
  const _mpBox = new THREE.Box3(), _mpV = new THREE.Vector3();
  // Resolve to a propsGroup CHILD: model props are a Group, so a raycast/select can land
  // on a deep sub-mesh — walk up to the object the gizmo/serializer addresses.
  const propRootOf = (obj) => { let o = obj; while (o && o.parent !== propsGroup) o = o.parent; return o?.parent === propsGroup ? o : null; };
  // "Missing mesh" marker: a translucent warning-orange box + crisp edges, base at
  // y=0 like a real prop. Stands in for an imported mesh whose file isn't on THIS
  // machine (a workflow carries only the content-hash reference, not the bytes), so
  // the prop is VISIBLE, selectable and locatable instead of silently absent. Owns
  // unique geometry/material (disposed below, unlike the shared prop material), and
  // is hidden from every capture so it can't poison the ControlNet hint.
  const MISSING_MARKER_COLOR = 0xff7a1a;
  const makeMissingMarker = () => {
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); // base at y=0, like a prop
    g.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: MISSING_MARKER_COLOR, transparent: true, opacity: 0.12, depthWrite: false })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: MISSING_MARKER_COLOR })));
    return g;
  };
  const disposeProp = (m) => { // model = a Group of meshes; primitive = one mesh. Material is shared, never disposed.
    if (m._pcrLabel) { m._pcrLabel.material.map?.dispose(); m._pcrLabel.material.dispose(); } // name label owns its texture
    m.userData._chainSkeleton?.dispose?.(); // procedural chain owns a bone texture
    if (m.userData._failedRecord) { m.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); return; } // missing-mesh marker owns unique geo + material
    if (m.userData.isModel) m.traverse((o) => o.geometry?.dispose?.());
    else m.geometry?.dispose?.();
  };
  // Normalize a loaded model into prop space: shared matte material, missing
  // normals computed, optionally scaled to targetH (bbox height), re-pivoted so
  // the base rests at y=0 centred on X/Z, and wrapped in an identity root (the
  // saved pos/quat/scale stay independent of the normalization, so restore
  // reproduces it exactly). Shared by bundled model props and imported meshes.
  const normalizePropModel = (inner, targetH) => {
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.material = propMat;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); // split props ship positions-only
    });
    _mpBox.setFromObject(inner);
    const sy = _mpBox.getSize(_mpV).y || 1;
    if (targetH) inner.scale.setScalar(targetH / sy);
    inner.updateMatrixWorld(true);
    _mpBox.setFromObject(inner);
    const ctr = _mpBox.getCenter(new THREE.Vector3());
    inner.position.set(-ctr.x, -_mpBox.min.y, -ctr.z); // centre X/Z, base at y=0 (rests on floor)
    const root = new THREE.Group();
    root.add(inner);
    return root;
  };
  // Load + normalize a bundled model prop, scaled to its curated real height.
  const loadModelProp = (type) => new Promise((resolve, reject) => {
    const def = MODEL_PROPS[type];
    if (!def) return reject(new Error("unknown model prop " + type));
    const url = new URL(`./assets/props/${def.file}?v=1`, import.meta.url).href;
    propLoader.load(url, (gltf) => {
      const root = normalizePropModel(gltf.scene, def.h);
      root.userData = { isProp: true, propType: type, isModel: true, uid: propUidSeq++ };
      resolve(root);
    }, undefined, reject);
  });
  // Imported mesh (user .glb/.gltf/.obj) — fetched from the server's content-
  // addressed store, so the SAME pose_state restores it after reload, undo,
  // cross-workflow paste, and scene export/import. The file reference (not the
  // mesh data) is what serializes; a blob/object URL would die with the page.
  //
  // AUTO-CAPABILITIES — the import is usable with whatever the file came with:
  //   multi-mesh static file → splittable into part-props (✂️, crude articulation)
  //   skinned file           → raw FK bone posing (🦴; no canonical mapping, so
  //                            ANY rig works — creature, multi-arm, whatever)
  //   animation clips        → scrub a clip to a frame and freeze it (🎬)
  // Parts and bones are exclusive: pulling one mesh out of a skinned model
  // would orphan its skeleton, and a rigged model articulates better by bone.
  // `part` (re)builds just mesh #part of the file, pivoted at its own centroid;
  // traversal order is stable for a given file, so part indices persist.
  const loadImportedMesh = async (file, part = null) => {
    const resp = await api.fetchApi(`/promptchain/pose-mesh/${file}`);
    if (!resp.ok) throw new Error(`mesh fetch failed (${resp.status})`);
    let inner, clips = [];
    if (/\.obj$/i.test(file)) {
      if (!OBJLoader) throw new Error("OBJ support needs the updated three bundle — refresh the page");
      inner = new OBJLoader().parse(await resp.text());
    } else {
      const gltf = await new GLTFLoader().parseAsync(await resp.arrayBuffer(), "");
      inner = gltf.scene;
      clips = gltf.animations || [];
    }
    // Plausible native size keeps the user's authored scale; absurd units
    // (mm/inch exports land km tall or ant sized) normalize to 1m and the
    // scale gizmo takes it from there.
    _mpBox.setFromObject(inner);
    const sy = _mpBox.getSize(_mpV).y;
    const root = normalizePropModel(inner, sy >= 0.05 && sy <= 3.5 ? 0 : 1.0);
    const meshList = [];
    inner.traverse((o) => { if (o.isMesh) meshList.push(o); });
    const skinned = meshList.some((o) => o.isSkinnedMesh);
    if (part != null) {
      // Part rebuild: keep ONLY mesh #part, re-pivoted at its centroid so the
      // gizmo rotates the part about itself, not the whole model's floor point.
      // _partCentroid = that pivot in the whole-model frame — the splitter
      // places the part-prop at wholeMatrix × centroid so the assembly lands
      // exactly where it stood.
      const src = meshList[part];
      if (!src) throw new Error(`part ${part} missing in ${file}`);
      root.updateMatrixWorld(true);
      const rel = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(src.matrixWorld);
      const m = src.clone(false); // children are other parts — never duplicate them in
      rel.decompose(m.position, m.quaternion, m.scale);
      const holder = new THREE.Group();
      holder.add(m);
      const c = new THREE.Box3().setFromObject(holder).getCenter(new THREE.Vector3());
      holder.position.set(-c.x, -c.y, -c.z);
      const partRoot = new THREE.Group();
      partRoot.add(holder);
      partRoot.userData = { isProp: true, propType: "importedMesh", isModel: true, file, part, uid: propUidSeq++, _partCentroid: c };
      return partRoot;
    }
    // Skeleton inventory (deduped across meshes sharing one skeleton) + rest
    // snapshot — bone poses serialize as diffs against this rest, and the 🎬
    // rest button returns here.
    const bones = [];
    if (skinned) {
      const seen = new Set();
      for (const sm of meshList) {
        if (!sm.isSkinnedMesh || !sm.skeleton) continue;
        for (const b of sm.skeleton.bones) if (!seen.has(b)) { seen.add(b); bones.push(b); }
      }
    }
    root.userData = {
      isProp: true, propType: "importedMesh", isModel: true, file, uid: propUidSeq++,
      // Runtime capabilities (underscore = never serialized; re-derived per load):
      _capParts: (!skinned && meshList.length > 1 && meshList.length <= 12) ? meshList.length : 0,
      _bones: bones.length ? bones : null,
      _boneRest: bones.length ? new Map(bones.map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }])) : null,
      // Clips only when there's a skeleton to freeze INTO: a frozen frame
      // persists via the bone rest-diffs, but rigid-node animation tracks have
      // nowhere to serialize — offering the scrubber there would silently lose
      // the pose on reload. Zero-length clips (Character Creator exports ship
      // "Default" placeholders) are dropped — nothing to scrub.
      _clips: bones.length ? clips.filter((c) => c.duration > 0.01) : [],
      _animRoot: inner,
    };
    return root;
  };
  const spawnImportedMesh = async (file) => {
    try {
      const root = await loadImportedMesh(file);
      if (!node._pcrAlive) { disposeProp(root); return; }
      root.position.set(0, 0, 0.4); // base already at y=0 → rests on the floor in front
      propsGroup.add(root);
      selectProp(root);
      requestRender();
      captureAndUpload(node);
    } catch (e) {
      console.error("[PoseStudio] imported mesh failed:", e);
      showClipToast("mesh import failed — " + (e.message || e), true);
    }
  };

  // ✂️ Split a multi-mesh import into per-mesh part-props: each part gets its
  // own gizmo (crude articulation on STATIC files — turn the head, raise the
  // tail), can be 🔗-relinked, even named into its own region. Parts spawn
  // exactly where they stood in the assembly and start linked to part 0 so the
  // model still moves as one until rearranged. Each part is a fresh parse, so
  // no geometry is shared and per-part dispose stays safe.
  const splitImportedProp = async (whole) => {
    const n = whole.userData._capParts;
    if (!n || !whole.userData.file) return;
    whole.updateMatrixWorld(true);
    const baseM = whole.matrixWorld.clone();
    const parts = [];
    for (let k = 0; k < n; k++) {
      let p = null;
      try { p = await loadImportedMesh(whole.userData.file, k); } catch (e) { console.warn("[PoseStudio] part load failed:", k, e); }
      if (!node._pcrAlive) { if (p) disposeProp(p); parts.forEach(disposeProp); return; }
      if (!p) continue;
      p.position.copy(p.userData._partCentroid.clone().applyMatrix4(baseM));
      p.quaternion.copy(whole.quaternion);
      p.scale.copy(whole.scale);
      parts.push(p);
    }
    if (parts.length < 2) { parts.forEach(disposeProp); showClipToast("couldn't split this model", true); return; }
    if (selectedProp === whole) { transformControls.detach(); selectedProp = null; }
    // Part 0 inherits the whole's identity: uid (undo continuity), region name,
    // and any 🔗 links that pointed at the whole.
    parts[0].userData.uid = whole.userData.uid;
    parts[0].userData.customName = whole.userData.customName;
    for (const a of attachments) {
      if (a.follower.mesh === whole) a.follower.mesh = parts[0];
      if (a.leader.kind === "prop" && a.leader.mesh === whole) a.leader.mesh = parts[0];
    }
    propsGroup.remove(whole);
    disposeProp(whole);
    for (const p of parts) propsGroup.add(p);
    for (let k = 1; k < parts.length; k++) createPropAttach(parts[k], { kind: "prop", mesh: parts[0] });
    updatePropLabels();
    selectProp(parts[0]);
    showClipToast(`split into ${parts.length} parts — each part has its own gizmo (🔗 to relink)`);
    requestRender();
    captureAndUpload(node);
  };

  // 🦴 Raw FK bone posing for skinned imports. NO canonical mapping — every
  // bone the rig ships gets a small handle; click one, rotate it with the
  // gizmo. That's why it works on any rig (creature/multi-arm/whatever) where
  // mapping-to-humanoid couldn't. Handles live under handlesRoot, so captures
  // hide them for free.
  let bonePoseProp = null;
  let selectedBone = null;
  const boneHandlesGroup = new THREE.Group();
  handlesRoot.add(boneHandlesGroup);
  const boneHandleGeo = new THREE.SphereGeometry(1, 10, 8);
  const setBonePoseProp = (prop) => {
    bonePoseProp = (bonePoseProp === prop) ? null : prop; // toggle
    if (selectedBone) {
      if (transformControls.object === selectedBone) transformControls.detach();
      selectedBone = null;
    }
    for (const h of [...boneHandlesGroup.children]) { boneHandlesGroup.remove(h); h.material.dispose(); }
    if (bonePoseProp?.userData._bones) {
      const isChain = !!bonePoseProp.userData._chain;
      for (const b of bonePoseProp.userData._bones) {
        // Handles only for POSE-meaningful bones. Production rigs (Character
        // Creator etc.) carry swarms of helper bones — twist correctives,
        // *_end leaf markers, ShareBones — that bury the model in dots no one
        // should click. They still deform (skinning + clip scrub use the full
        // _bones list); they just don't get a handle.
        if (/_end(_|\d|$)|twist|share/i.test(b.name)) continue;
        // Chain joints are amber IK DIAMONDS (every joint is grab-to-bend, base→joint
        // FABRIK); imported-rig bones stay blue FK spheres (rotate-only).
        const h = new THREE.Mesh(isChain ? ikGeo : boneHandleGeo, new THREE.MeshBasicMaterial({
          color: isChain ? HANDLE.ik : 0x57b1ff, transparent: true, opacity: HANDLE_DIM, depthTest: false,
        }));
        h.renderOrder = 998;
        h.userData = { isBoneHandle: true, bone: b, ...(isChain ? { sizeMul: 1.1 } : {}) };
        boneHandlesGroup.add(h);
      }
      // The TIP gets its own slightly larger diamond (the whole-chain reach).
      if (bonePoseProp.userData._chain) {
        const tip = new THREE.Mesh(ikGeo, new THREE.MeshBasicMaterial({
          color: HANDLE.ik, transparent: true, opacity: HANDLE_DIM, depthTest: false,
        }));
        tip.renderOrder = 998;
        tip.userData = { isChainTip: true, prop: bonePoseProp, sizeMul: 1.3 }; // match the figure IK diamond's 1.3×
        boneHandlesGroup.add(tip);
      }
    }
    updatePropUI();
    requestRender();
  };
  // World position of a chain prop's tip = the last bone's origin + one segment up it.
  const chainTipWorld = (prop, out) => {
    const ud = prop.userData;
    return ud._bones[ud._bones.length - 1].localToWorld(out.set(0, ud._chain.segLen, 0));
  };
  // World position of chain joint `idx` (0..bones.length): a bone origin, or the tip
  // endpoint when idx === bones.length. Used by the pin (combine) machinery.
  const chainJointWorld = (prop, idx, out) => {
    const ud = prop.userData;
    return idx < ud._bones.length ? ud._bones[idx].getWorldPosition(out) : chainTipWorld(prop, out);
  };
  // Per-render sync: handles track their bones (and the tip dot tracks the chain
  // end); mode dies with its prop (delete/restore rebuilds props, so the stale
  // reference self-clears), and a gizmo retargeted elsewhere drops the bone selection.
  const updatePropBoneHandles = () => {
    if (bonePoseProp && !propsGroup.children.includes(bonePoseProp)) {
      // The prop instance we were posing is gone. A capture/state round-trip REBUILDS the
      // props (new objects, same uid), so the bonePoseProp ref goes stale and the joint
      // handles vanish — the "lose the dots until I reload" bug. Re-bind to the rebuilt prop
      // with the same uid so bone mode survives; only truly clear if it was actually deleted.
      const uid = bonePoseProp.userData?.uid;
      const rebuilt = uid != null ? propsGroup.children.find((p) => p.userData?.uid === uid && p.userData?._bones) : null;
      bonePoseProp = null;
      setBonePoseProp(rebuilt || null);
      return;
    }
    if (selectedBone && transformControls.object !== selectedBone) selectedBone = null;
    for (const h of boneHandlesGroup.children) {
      if (h.userData.isChainTip) chainTipWorld(h.userData.prop, h.position);
      else h.userData.bone.getWorldPosition(h.position);
      const d = h.position.distanceTo(camera.position);
      const vpScale = Math.min(1, HANDLE_REF_H / Math.max(1, frameH));
      h.scale.setScalar(Math.max(0.004, d * HANDLE_SIZE * 0.8 * vpScale * (h.userData.sizeMul || 1)));
      const sel = h.userData.isChainTip
        ? (chainDrag.active && chainDrag.driveCount >= (h.userData.prop.userData._bones.length))
        : (h.userData.bone === selectedBone || (chainDrag.active && chainDrag.bone === h.userData.bone));
      h.material.opacity = sel ? HANDLE_BRIGHT : HANDLE_DIM;
    }
  };

  // 🎬 Animation-clip scrubber: many rigged downloads ship posed for you
  // (idle/walk/attack). Pick a clip, scrub to a frame, done — the bone state
  // it leaves behind persists through the same rest-diff serialization as
  // hand-posed bones, and 🦴 tweaks layer on top.
  let clipOpen = false;
  const clipPanel = document.createElement("div");
  clipPanel.style.cssText =
    "position:absolute;top:36px;right:6px;z-index:3;display:none;gap:4px;align-items:center;" +
    "background:rgba(20,20,26,0.82);border:1px solid #4a4a55;border-radius:5px;padding:3px 5px;";
  clipPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  const clipSelect = document.createElement("select");
  clipSelect.style.cssText = "font:11px system-ui,sans-serif;background:#2a2a35;color:#ccd;border:1px solid #4a4a55;border-radius:4px;padding:1px 3px;max-width:110px;";
  const clipScrub = document.createElement("input");
  clipScrub.type = "range"; clipScrub.min = "0"; clipScrub.max = "1"; clipScrub.step = "0.001"; clipScrub.value = "0";
  clipScrub.style.cssText = "width:110px;";
  const scrubClip = () => {
    const ud = selectedProp?.userData;
    const clip = ud?._clips?.[+clipSelect.value];
    if (!clip || !ud._animRoot) return;
    if (!ud._mixer) ud._mixer = new THREE.AnimationMixer(ud._animRoot);
    if (ud._action?.getClip() !== clip) {
      ud._mixer.stopAllAction();
      ud._action = ud._mixer.clipAction(clip);
      ud._action.play();
    }
    ud._mixer.setTime(+clipScrub.value * clip.duration);
    requestRender();
  };
  clipScrub.addEventListener("input", scrubClip);
  clipScrub.addEventListener("change", () => captureAndUpload(node)); // freeze the frame on release
  clipSelect.addEventListener("change", () => { scrubClip(); captureAndUpload(node); }); // a new clip poses the model — re-process
  const clipRestBtn = mkBtn("⏮", "Back to the model's rest pose", () => {
    const ud = selectedProp?.userData;
    if (!ud?._boneRest) return;
    ud._mixer?.stopAllAction();
    ud._action = null;
    for (const [b, r] of ud._boneRest) { b.quaternion.copy(r.q); b.position.copy(r.p); }
    clipScrub.value = "0";
    requestRender();
    captureAndUpload(node);
  });
  clipPanel.append(clipSelect, clipScrub, clipRestBtn);
  container.appendChild(clipPanel);
  let clipPanelProp = null; // whose clips the <select> currently lists
  const syncClipPanel = () => {
    const ud = selectedProp?.userData;
    const show = !!(clipOpen && ud?._clips?.length);
    clipPanel.style.display = show ? "flex" : "none";
    if (show && clipPanelProp !== selectedProp) {
      clipPanelProp = selectedProp;
      clipSelect.innerHTML = "";
      ud._clips.forEach((c, i) => {
        const o = document.createElement("option");
        o.value = String(i); o.textContent = c.name || `clip ${i + 1}`;
        clipSelect.appendChild(o);
      });
      clipScrub.value = "0";
    }
  };

  // ── skeleton binding: make a static import POSABLE ──────────────────────────
  // 🧍 on an imported prop spawns a normal mannequin figure with its body
  // hidden — that's the skeleton overlay. The user lines the limbs up with the
  // SAME IK/FK handles used for posing, then ✔ bind auto-weights every vertex
  // of the prop to the nearest skeleton segments and converts its meshes to
  // SkinnedMeshes on that skeleton. The prop is consumed; the figure now IS
  // the monster — posing, masks, regions, undo, save/reload, paste all work on
  // it unchanged. Quality is automatic-weights tier: elbows can crease, which
  // control maps don't care about.
  // SKIN_SEGMENTS / SKIN_STUBS live on the rig profile (module scope).
  // Canonical bone capsules in WORLD space at the skeleton's current pose.
  // Torso segments carry a volume RADIUS (≈ half the shoulder span) so the
  // chest/spine claim the torso barrel instead of losing bulky pecs/belly to
  // the nearer shoulder/hip bones (which tore the sternum on wide poses).
  const skinSegmentsFor = (fig) => {
    const segs = [];
    const wp = (n) => fig.joints[n] && fig.joints[n].getWorldPosition(new THREE.Vector3());
    const idx = (n) => fig.skel.bones.indexOf(fig.joints[n]);
    const shL = wp("shoulderL"), shR = wp("shoulderR");
    const torsoR = shL && shR ? shL.distanceTo(shR) * 0.55 : 0;
    // Chest tapers (its bubble must not reach the skull); the head stub gets
    // its own volume so the skull is HEAD-owned even when the fitted head
    // joint sits low between massive traps.
    const RADII = { root: torsoR, spine: torsoR, chest: torsoR * 0.6, neck: torsoR * 0.15 };
    const nk = wp("neck"), hd = wp("head");
    const headR = nk && hd ? nk.distanceTo(hd) * 0.7 : 0;
    for (const [a, b] of figProfile(fig).skinSegments) {
      const pa = wp(a), pb = wp(b), bi = idx(a);
      if (pa && pb && bi >= 0) segs.push({ bone: bi, a: pa, b: pb, r: RADII[a] || 0 });
    }
    for (const [tip, from, len] of figProfile(fig).skinStubs) {
      const pt = wp(tip), pf = wp(from), bi = idx(tip);
      if (pt && pf && bi >= 0) segs.push({ bone: bi, a: pt, b: pt.clone().add(pt.clone().sub(pf).multiplyScalar(len)), r: tip === "head" ? headR : 0 });
    }
    return segs;
  };
  // Convert every Mesh inside `container` into a SkinnedMesh on fig's skeleton,
  // weighted against the skeleton's CURRENT pose with GEODESIC voxel weights
  // (module-scope voxelSkinWeights — distances travel through the flesh, so an
  // arm bone can't capture belly vertices across the air gap; the straight-line
  // version did exactly that on bulky bodies and tore them apart).
  const skinContainerToFig = (fig, container) => {
    container.updateMatrixWorld(true);
    const segs = skinSegmentsFor(fig).map((s) => ({ bone: s.bone, a: s.a.toArray(), b: s.b.toArray(), r: s.r || 0 }));
    const meshes = [];
    container.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
    const datas = meshes.map((m) => {
      const src = m.geometry.attributes.position;
      const arr = new Float32Array(src.count * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < src.count; i++) {
        v.fromBufferAttribute(src, i).applyMatrix4(m.matrixWorld);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      }
      return { pos: arr, index: m.geometry.index ? m.geometry.index.array : null };
    });
    const weights = voxelSkinWeights(datas, segs, 64);
    // CRITICAL: the skin gets its OWN Skeleton over the same bones, whose
    // boneInverses are computed at THIS (fit) pose — the no-args constructor
    // calls calculateInverses() against the bones' current world matrices.
    // Reusing fig.skel kept the mannequin's T-POSE inverses, so the skin
    // deformed the instant it bound: every vertex offset by exactly its bone's
    // fit-vs-T-pose delta. That was the "instant mutilation", independent of
    // weights or alignment. Same bone objects → posing drives both skeletons.
    fig._skinSkel?.dispose?.();
    const skinSkel = new THREE.Skeleton(fig.skel.bones.slice());
    fig._skinSkel = skinSkel;
    meshes.forEach((m, k) => {
      m.geometry.setAttribute("skinIndex", new THREE.BufferAttribute(weights[k].sIdx, 4));
      m.geometry.setAttribute("skinWeight", new THREE.BufferAttribute(weights[k].sWgt, 4));
      const sm = new THREE.SkinnedMesh(m.geometry, m.material);
      sm.position.copy(m.position); sm.quaternion.copy(m.quaternion); sm.scale.copy(m.scale);
      sm.frustumCulled = false; // bind-pose bounds lie once posed — never cull the deformed mesh
      m.parent.add(sm);
      m.parent.remove(m);
      sm.updateWorldMatrix(true, false);
      sm.bind(skinSkel, sm.matrixWorld.clone());
    });
  };
  const removeSkinBindMesh = (fig) => {
    if (!fig._skinRoot) return;
    fig.root.remove(fig._skinRoot);
    fig._skinRoot.traverse((o) => o.geometry?.dispose?.());
    fig._skinRoot = null;
    fig._skinSkel?.dispose?.(); // frees the skin skeleton's bone texture
    fig._skinSkel = null;
  };
  // Undo the fit-time ghosting (and any undo that resurrects the mannequin body).
  const unghostFigure = (fig) => {
    for (const m of fig.meshes) {
      if (m.material) { m.material.transparent = false; m.material.opacity = 1; m.material.depthWrite = true; }
    }
  };
  // Build (or rebuild) a figure's bound skin from its serialized record: place
  // the mesh, snap the skeleton to the recorded BIND pose, weight + bind, then
  // return the skeleton to the pose it was holding. Weights are deterministic
  // from geometry + bind pose, so they never serialize.
  const materializeSkinBind = async (fig) => {
    const sb = fig.skinBind;
    if (!sb?.file || !fig.skel) return;
    const root = await loadImportedMesh(sb.file, sb.part ?? null).catch((e) => { console.warn("[PoseStudio] skin mesh load failed:", e); return null; });
    if (!root) return;
    if (!node._pcrAlive || !figures.includes(fig)) { disposeProp(root); return; }
    removeSkinBindMesh(fig);
    root.userData = { _skinFor: fig.uid }; // figure skin now, not a prop
    fig.root.add(root);
    if (Array.isArray(sb.meshLocal) && sb.meshLocal.length === 16) {
      new THREE.Matrix4().fromArray(sb.meshLocal).decompose(root.position, root.quaternion, root.scale);
    }
    const live = fig.skel.bones.map((b) => ({ b, p: b.position.clone(), q: b.quaternion.clone() }));
    if (sb.bindPose) for (const b of fig.skel.bones) {
      const d = sb.bindPose[b.name];
      if (d) { if (Array.isArray(d.p)) b.position.fromArray(d.p); if (Array.isArray(d.q)) b.quaternion.fromArray(d.q); }
    }
    fig.root.updateMatrixWorld(true);
    skinContainerToFig(fig, root);
    for (const { b, p, q } of live) { b.position.copy(p); b.quaternion.copy(q); }
    fig.root.updateMatrixWorld(true);
    fig._skinRoot = root;
    unghostFigure(fig); // clear any fit-time translucency before hiding
    for (const m of fig.meshes) m.visible = false; // the import IS the body now
  };
  // Reconcile every figure's serialized skinBind with what's on screen — the
  // async half of applyFigureData. Runs after any cast restore (load, undo,
  // paste). Unchanged binds are kept; an undo past the bind removes the skin
  // and brings the mannequin body (and, via the props snapshot, the prop) back.
  const syncSkinBinds = async () => {
    for (const fig of [...figures]) {
      const sb = fig.skinBind;
      const key = sb ? `${sb.file}|${sb.part ?? ""}` : null;
      if (key === (fig._skinBindKey || null)) continue;
      if (!sb) {
        removeSkinBindMesh(fig);
        unghostFigure(fig);
        for (const m of fig.meshes) m.visible = true; // mannequin body returns
        fig._skinBindKey = null;
        continue;
      }
      await materializeSkinBind(fig);
      if (!node._pcrAlive) return;
      fig._skinBindKey = key;
    }
    requestRender();
  };

  // Geometric auto-fit: the mesh itself says where the hands and feet are —
  // IK the skeleton's limbs there so "line it up" is usually just "check it".
  // Heuristics assume an upright biped (the only shape worth binding to this
  // rig): feet = the lowest 8% of vertices split left/right; hands = each
  // side's most lateral point in the 25–78% height band (hanging and
  // outstretched arms both put the hand near the lateral extreme). Targets
  // assign to L/R joints by proximity, so the model's facing doesn't matter.
  const autoAlignSkeleton = (fig, prop) => {
    const pts = [];
    prop.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    prop.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 4000)); // ~4k samples is plenty
      for (let i = 0; i < pos.count; i += step) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
    });
    if (pts.length < 100) return;
    let minY = Infinity, maxY = -Infinity, cx = 0, cz = 0;
    for (const p of pts) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); cx += p.x; cz += p.z; }
    cx /= pts.length; cz /= pts.length;
    const H = Math.max(1e-3, maxY - minY);
    const at = (p) => (p.y - minY) / H;
    const feetA = [], feetB = [];
    for (const p of pts) if (at(p) < 0.08) (p.x < cx ? feetA : feetB).push(p);
    const centroid = (arr) => {
      if (arr.length < 5) return null;
      const c = new THREE.Vector3();
      for (const p of arr) c.add(p);
      return c.multiplyScalar(1 / arr.length);
    };
    const handA = { d: 0, p: null }, handB = { d: 0, p: null };
    for (const p of pts) {
      const a = at(p);
      if (a < 0.25 || a > 0.78) continue;
      const d = Math.hypot(p.x - cx, p.z - cz);
      const side = p.x < cx ? handA : handB;
      if (d > side.d) { side.d = d; side.p = p; }
    }
    const assignPair = (tipL, tipR, tA, tB) => {
      const jL = fig.joints[tipL], jR = fig.joints[tipR];
      if (!jL || !jR) return;
      let a = tA, b = tB;
      if (a && b) {
        const lw = jL.getWorldPosition(new THREE.Vector3());
        if (lw.distanceToSquared(a) > lw.distanceToSquared(b)) { a = tB; b = tA; }
      }
      for (const [tip, t] of [[tipL, a], [tipR, b]]) {
        if (!t) continue;
        const limb = limbFor(fig, tip);
        if (limb) solveIkTo(limb, t);
      }
    };
    assignPair("ankleL", "ankleR", centroid(feetA), centroid(feetB));
    assignPair("wristL", "wristR", handA.p, handB.p);
    fig.root.updateMatrixWorld(true);
  };

  // Fit-skeleton flow: spawn the overlay figure inside the prop, hand the user
  // the normal posing tools, and a bottom bar carries ✔ bind / ✖ cancel.
  let skinFit = null; // { prop, fig } while aligning
  const bindBar = document.createElement("div");
  bindBar.style.cssText =
    "position:absolute;bottom:8px;left:50%;transform:translateX(-50%);z-index:4;display:none;" +
    "gap:6px;align-items:center;padding:4px 10px;background:#1e3a2c;color:#cfe;border:1px solid #2e5d44;" +
    "border-radius:5px;font:11px/1.4 system-ui,sans-serif;white-space:nowrap;";
  bindBar.addEventListener("pointerdown", (e) => e.stopPropagation());
  const bindBarText = document.createElement("span");
  bindBarText.textContent = "🧍 skeleton auto-fitted — if the ghost's hands/feet missed, drag its ◆ diamonds onto them · then ✔";
  bindBar.appendChild(bindBarText);
  const cancelSkinFit = () => {
    if (!skinFit) return;
    const { fig } = skinFit;
    skinFit = null;
    bindBar.style.display = "none";
    removeFigure(fig, { capture: false });
    requestRender();
  };
  const performSkinBind = () => {
    if (!skinFit) return;
    const { prop, fig } = skinFit;
    skinFit = null;
    bindBar.style.display = "none";
    if (!figures.includes(fig)) return; // skeleton deleted mid-fit — nothing to bind to
    if (!propsGroup.children.includes(prop)) { removeFigure(fig, { capture: false }); return; } // prop deleted mid-fit
    fig.root.updateMatrixWorld(true);
    prop.updateMatrixWorld(true);
    const meshLocal = new THREE.Matrix4().copy(fig.root.matrixWorld).invert().multiply(prop.matrixWorld);
    const bindPose = {};
    for (const b of fig.skel.bones) bindPose[b.name] = { p: b.position.toArray(), q: b.quaternion.toArray() };
    fig.skinBind = {
      file: prop.userData.file,
      ...(prop.userData.part != null ? { part: prop.userData.part } : {}),
      meshLocal: meshLocal.toArray(),
      bindPose,
    };
    // The figure inherits the prop's region name — the $block keeps binding by
    // name, its mask row just moves from the prop list to the figure list.
    if (prop.userData.customName && !fig.customName) fig.customName = prop.userData.customName;
    if (selectedProp === prop) { transformControls.detach(); selectedProp = null; updatePropUI(); }
    removeAttachmentsFor(prop);
    propsGroup.remove(prop);
    disposeProp(prop);
    updatePropLabels();
    updateFigureLabels();
    syncSkinBinds().then(() => {
      if (!node._pcrAlive) return;
      requestRender();
      captureAndUpload(node); // pre-bind history snapshot still lists the prop → ↶ undoes the whole bind
    });
  };
  bindBar.appendChild(mkBtn("✔", "Bind the model to this skeleton — it becomes a posable figure", performSkinBind));
  bindBar.appendChild(mkBtn("✖", "Cancel — remove the skeleton, keep the model as a prop", cancelSkinFit));
  container.appendChild(bindBar);
  const startSkinFit = async (prop) => {
    if (skinFit) cancelSkinFit();
    const fig = await spawnFigure({ select: true, capture: false });
    if (!node._pcrAlive || !fig) return;
    if (!fig.skel) {
      removeFigure(fig, { capture: false });
      showClipToast("skeleton binding needs the GLB figure (capsule fallback is active)", true);
      return;
    }
    // Stand the skeleton inside the prop: scaled to its height, centred on its
    // footprint, in the model's CURRENT stance (no T-pose needed — we pose
    // FROM wherever it was sculpted).
    prop.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(prop);
    const c = box.getCenter(new THREE.Vector3());
    const h = Math.max(0.2, box.max.y - box.min.y);
    fig.root.scale.multiplyScalar(h / 1.8);
    fig.root.position.set(c.x, box.min.y, c.z);
    fig.root.updateMatrixWorld(true);
    fig.rootRest.copy(fig.root.position); // reset must not yank it back to the spawn slot
    // GHOST body, not invisible: floating dots alone read as flat overlays —
    // the first camera move shattered the illusion ("wtf"). A translucent gray
    // figure makes "stand this INSIDE the model" self-evident, parallax included.
    for (const m of fig.meshes) {
      if (m.material) { m.material.transparent = true; m.material.opacity = 0.35; m.material.depthWrite = false; }
    }
    // Auto-align: hands/feet IK'd onto the mesh's own extremities — the manual
    // step is "check it and nudge", not "rig it".
    try { autoAlignSkeleton(fig, prop); } catch (e) { console.warn("[PoseStudio] auto-align skipped:", e); }
    if (selectedProp === prop) { transformControls.detach(); selectedProp = null; updatePropUI(); }
    skinFit = { prop, fig };
    bindBar.style.display = "flex";
    requestRender();
  };

  // (Prop selection highlight = the screen-space outline pass; selectedProp alone drives it.)

  // Name labels for NAMED props — same sprite as figure labels, floated above the
  // prop. A label marks the prop as a region entity (own mask + $name{} block).
  // Runs on rename/restore/paste/undo, not per-frame; capture hides it via
  // setLabelsVisible so it never reaches the control map or the prop's own mask.
  const _plBox = new THREE.Box3(), _plV = new THREE.Vector3();
  const updatePropLabels = () => {
    for (const m of propsGroup.children) {
      const name = m.userData.customName;
      if (!name) {
        if (m._pcrLabel) { m.remove(m._pcrLabel); m._pcrLabel.material.map?.dispose(); m._pcrLabel.material.dispose(); m._pcrLabel = null; m._pcrLabelText = null; }
        continue;
      }
      if (!m._pcrLabel || m._pcrLabelText !== name) {
        if (m._pcrLabel) { m.remove(m._pcrLabel); m._pcrLabel.material.map?.dispose(); m._pcrLabel.material.dispose(); }
        m._pcrLabel = makeLabelSprite(name); m._pcrLabelText = name;
      }
      // Measure WITHOUT the label (it's a child — including it would feed back into
      // the box and walk the label upward on every pass), then place it just above
      // the prop's top, converted to prop-local space so it tracks moves for free.
      if (m._pcrLabel.parent === m) m.remove(m._pcrLabel);
      m.updateMatrixWorld(true);
      _plBox.setFromObject(m);
      m.add(m._pcrLabel);
      if (!_plBox.isEmpty()) {
        _plV.set((_plBox.min.x + _plBox.max.x) / 2, _plBox.max.y + 0.12, (_plBox.min.z + _plBox.max.z) / 2);
        m.worldToLocal(_plV);
        m._pcrLabel.position.copy(_plV);
      }
      // Counter-scale so the gizmo-scaled prop doesn't stretch the label.
      const ws = m.getWorldScale(new THREE.Vector3());
      m._pcrLabel.scale.set(0.7 / (ws.x || 1), 0.175 / (ws.y || 1), 1);
    }
  };

  const makeProp = (type) => {
    const def = PROP_DEFS[type];
    if (!def) return null;
    const m = new THREE.Mesh(def.geo(), propMat);
    m.userData = { isProp: true, propType: type, uid: propUidSeq++ };
    return m;
  };

  // Build a segmented articulated chain prop (see CHAIN_DEFS). A tapered tube
  // SkinnedMesh over a serial +Y bone chain, wrapped in an identity root so the
  // prop's pos/quat/scale stay independent of the geometry (like normalizePropModel).
  // _bones/_boneRest light up the existing 🦴 handles + rest-diff serialization;
  // _chain feeds the tip-IK solver.
  const makeChainProp = (type) => {
    const def = CHAIN_DEFS[type];
    if (!def) return null;
    const { segs, len, r0, r1 } = def;
    const segLen = len / segs;
    // Lathe a CAPSULE profile (hemisphere → cylinder → hemisphere) instead of a flat-capped
    // cylinder, so both ends are ROUNDED. The profile is the silhouette revolved around +Y:
    // base hemisphere bulges below y=0, the body runs 0→len, the tip hemisphere caps past len.
    // Skin weights are still assigned by height below, so the caps deform with the end bones.
    const RADIAL = 14, BODY_DIV = segs * 4, CAP_DIV = 6;
    const prof = [];
    for (let i = 0; i <= CAP_DIV; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * (i / CAP_DIV); prof.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.cos(a)), r0 * Math.sin(a))); } // base cap: pole → rim
    for (let i = 1; i <= BODY_DIV; i++) { const f = i / BODY_DIV; prof.push(new THREE.Vector2(r0 + (r1 - r0) * f, len * f)); } // cylinder body, radius tapers r0→r1
    for (let i = 1; i <= CAP_DIV; i++) { const a = (Math.PI / 2) * (i / CAP_DIV); prof.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.cos(a)), len + r1 * Math.sin(a))); } // tip cap: rim → pole
    const geo = new THREE.LatheGeometry(prof, RADIAL);
    geo.computeVertexNormals();
    // Skin each vertex to the two bones bracketing its height, so the tube deforms
    // continuously across every joint instead of kinking at segment boundaries.
    const pos = geo.attributes.position;
    const sIdx = new Uint16Array(pos.count * 4);
    const sWgt = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(segs - 1e-4, Math.max(0, pos.getY(i) / segLen));
      const k = Math.floor(t), frac = t - k;
      sIdx[i * 4] = Math.min(segs - 1, k);
      sIdx[i * 4 + 1] = Math.min(segs - 1, k + 1);
      sWgt[i * 4] = 1 - frac;
      sWgt[i * 4 + 1] = frac;
    }
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(sIdx, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(sWgt, 4));
    // Serial chain: bone k at height k*segLen, parented to k-1 so rotating one
    // carries everything above it (FK), exactly like a limb. Names dodge the 🦴
    // helper-bone cull (_end/twist/share).
    const bones = [];
    for (let k = 0; k < segs; k++) {
      const b = new THREE.Bone();
      b.name = "seg" + k;
      b.position.set(0, k === 0 ? 0 : segLen, 0);
      if (k > 0) bones[k - 1].add(b);
      bones.push(b);
    }
    const mesh = new THREE.SkinnedMesh(geo, propMat);
    mesh.frustumCulled = false; // posed bounds diverge from the bind pose → never cull
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true); // bones need rest world matrices before the skeleton inverts them
    const skeleton = new THREE.Skeleton(bones);
    mesh.bind(skeleton, new THREE.Matrix4()); // identity bind in mesh-local space (straight rest pose)
    const root = new THREE.Group();
    root.add(mesh);
    root.userData = {
      isProp: true, propType: type, isModel: true, uid: propUidSeq++,
      _bones: bones,
      _boneRest: new Map(bones.map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }])),
      _chainSkeleton: skeleton,
      _chain: { segs, segLen }, // tip-IK + tip-handle placement read this
    };
    return root;
  };

  // FABRIK IK for a chain, drivable from ANY joint. `driveCount` = how many bones
  // from the base move so the grabbed point reaches the target; the effector is
  // joint[driveCount] (an intermediate joint) or, when driveCount === bone count,
  // the tip endpoint past the last bone. Bones past driveCount keep their local
  // rotations → the rest of the chain hangs naturally off the grabbed joint. Root
  // pinned at the base; lengths measured live (scale-safe). Only quaternions change
  // → serializes as rest-diffs.
  const _chainUp = new THREE.Vector3(0, 1, 0);
  const _qIdent = new THREE.Quaternion(); // identity, for damping slerp
  const solveChainTo = (prop, targetW, driveCount, anchorIndex = 0) => {
    const ud = prop.userData;
    const bones = ud._bones, n = bones?.length || 0;
    const dc = Math.min(driveCount, n);
    const m = dc - anchorIndex; // bones that move: [anchorIndex .. dc-1]
    if (m < 1) return;
    bones[0].updateMatrixWorld(true);
    // pts = world joints [anchorIndex .. dc], the anchor end fixed, the dc end the effector.
    const pts = [];
    for (let i = anchorIndex; i < dc; i++) pts.push(bones[i].getWorldPosition(new THREE.Vector3()));
    pts.push(dc < n ? bones[dc].getWorldPosition(new THREE.Vector3()) // intermediate joint = origin of the next bone
                    : bones[n - 1].localToWorld(new THREE.Vector3(0, ud._chain.segLen, 0))); // tip endpoint
    const lens = [];
    for (let i = 0; i < m; i++) lens.push(Math.max(1e-6, pts[i].distanceTo(pts[i + 1])));
    const base = pts[0].clone(), dir = new THREE.Vector3(); // base = the anchor joint, held fixed
    for (let iter = 0; iter < 12; iter++) {
      pts[m].copy(targetW); // backward reach: pull the effector to target, walk down keeping lengths
      for (let i = m - 1; i >= 0; i--) {
        dir.subVectors(pts[i], pts[i + 1]);
        pts[i].copy(pts[i + 1]).addScaledVector(dir, lens[i] / (dir.length() || 1e-6));
      }
      pts[0].copy(base); // forward reach: re-pin the anchor, walk up
      for (let i = 1; i <= m; i++) {
        dir.subVectors(pts[i], pts[i - 1]);
        pts[i].copy(pts[i - 1]).addScaledVector(dir, lens[i - 1] / (dir.length() || 1e-6));
      }
      if (pts[m].distanceToSquared(targetW) < 1e-8) break;
    }
    // Positions → rotations, top-down so each parent is already oriented. Rotate each
    // bone INCREMENTALLY from its CURRENT world forward to the solved segment, not
    // absolutely from +Y: an absolute setFromUnitVectors(+Y, dir) is singular when the
    // segment points near -Y (chain hanging straight down from a pinned top), so tiny
    // cursor moves there flipped the rotation axis and whipped the tube. Frame-to-frame
    // the delta stays tiny, so it stays stable through the fold.
    const parentQ = new THREE.Quaternion(), curQ = new THREE.Quaternion(), delta = new THREE.Quaternion();
    const curFwd = new THREE.Vector3(), worldDir = new THREE.Vector3();
    const MAX_STEP = 0.05; // rad/solve per bone — TIGHT angular cap: near a folded config the IK gain is huge (tiny tip move ⇒ big unfold), so this bounds the per-frame chain swing and the fold spreads over ~10 frames as smooth motion instead of whipping. Normal (non-singular) drags rarely hit it.
    for (let i = 0; i < m; i++) {
      const b = bones[anchorIndex + i];
      if ((pts[i + 1].distanceToSquared(pts[i])) < 1e-12) continue; // degenerate segment → leave bone as-is (no NaN)
      worldDir.subVectors(pts[i + 1], pts[i]).normalize();
      b.getWorldQuaternion(curQ);
      curFwd.copy(_chainUp).applyQuaternion(curQ).normalize(); // bone's current +Y in world
      delta.setFromUnitVectors(curFwd, worldDir);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(delta.w))); // angle of this step
      if (ang > MAX_STEP) delta.slerp(_qIdent, 1 - MAX_STEP / ang); // damp big swings → smooth, never spasm
      curQ.premultiply(delta); // desired (damped) world quaternion
      if (b.parent) { b.parent.getWorldQuaternion(parentQ); b.quaternion.copy(parentQ.invert().multiply(curQ)); }
      else b.quaternion.copy(curQ);
      b.updateMatrixWorld(true);
    }
    requestRender();
  };
  const solveChainIk = (prop, targetW) => solveChainTo(prop, targetW, prop.userData._bones?.length || 0); // full chain → tip (used by _dbgChainIk)

  // ── chain DRAG = position-based rope physics (Verlet) ────────────────────────
  // Analytical IK (FABRIK) snaps to a fully-solved pose every frame, so near a folded
  // config its gain explodes and the chain whips ("all the IKs fighting"). A rope sim
  // is ONE unified solver that can't whip: joints are point masses, segments are
  // distance constraints, the pinned joint and the grabbed joint are just fixed points
  // the relaxation respects. It eases (inertia) and holds its shape — exactly "grab the
  // loose end and throw slack on it". pinTarget is read live so the pin follows the
  // mannequin. Resulting positions convert to bone rotations + a prop translation, so
  // the SAME serialization (bone diffs) round-trips the pose.
  const _ropeTmp = new THREE.Vector3();
  const chainPinTarget = (prop, out) => {
    const a = attachments.find((x) => x.follower.kind === "prop" && x.follower.mesh === prop && x.follower.jointIndex != null);
    if (a) { const lW = leaderRigidMatrix(a.leader); if (lW) return _atM.multiplyMatrices(lW, a.offset).decompose(out, _atQ, _atS) && out; }
    return out.copy(chainDrag.pinWorld); // no combine → hold the anchor end exactly where it was when the drag began
  };
  const initChainRope = (prop, anchorIdx) => {
    const n = prop.userData._bones.length;
    const rope = [], prev = [], lens = [];
    for (let j = 0; j <= n; j++) { const p = chainJointWorld(prop, j, new THREE.Vector3()); rope.push(p); prev.push(p.clone()); }
    for (let j = 0; j < n; j++) lens.push(rope[j].distanceTo(rope[j + 1]));
    chainDrag.rope = rope; chainDrag.ropePrev = prev; chainDrag.ropeLens = lens; chainDrag.pinIdx = anchorIdx;
    chainDrag.grabEase.copy(rope[chainDrag.driveCount] || rope[n]); // eased grab target starts at the grabbed joint
    chainDrag.pinWorld.copy(rope[anchorIdx]); // freeze the anchor end's world position for the whole drag
  };
  const _ropeGrab = new THREE.Vector3(), _ropeSpan = new THREE.Vector3();
  const MAX_FOLD = 0.95; // rad (~54°) max bend at any single joint — generous enough for tight corkscrews, tight enough to stop the inside-out kink / tangent-flip singularity
  const COS_HALF_FOLD = Math.cos(MAX_FOLD / 2); // min next-nearest distance = (len[i]+len[i+1]) * this
  const chainRopeStep = () => {
    if (!chainDrag.active || !chainDrag.prop || !propsGroup.children.includes(chainDrag.prop)) { chainDrag.settling = false; return; }
    const prop = chainDrag.prop, rope = chainDrag.rope, lens = chainDrag.ropeLens;
    const n = rope.length - 1, pin = chainDrag.pinIdx, grab = chainDrag.driveCount;
    const pinTarget = chainPinTarget(prop, _ropeTmp).clone();
    // Clamp the cursor target to what the chain can physically reach from the pin. Asking
    // for a point past full extension IS the spasm: the grab drags the end out, the length
    // constraints yank it back, and the two oscillate — worse the longer the span (exactly
    // "the farther to the end, the more it spazzes"). A reachable target can be satisfied
    // with BOTH ends held, so the relaxation settles into an arc instead of fighting itself.
    let reach = 0; for (let i = Math.min(pin, grab); i < Math.max(pin, grab); i++) reach += lens[i];
    _ropeGrab.copy(chainDrag.desired);
    _ropeSpan.copy(_ropeGrab).sub(pinTarget);
    const spanLen = _ropeSpan.length();
    if (spanLen > reach * 0.999) _ropeGrab.copy(pinTarget).addScaledVector(_ropeSpan, (reach * 0.999) / (spanLen || 1e-6));
    chainDrag.grabEase.lerp(_ropeGrab, 0.5); // ease the HELD point toward the (reachable) cursor — smooth follow, no fling
    // QUASI-STATIC relaxation — deliberately NO momentum/Verlet. With BOTH ends held there
    // are two mirror-image bend solutions; a dynamic rope carries velocity, so a slack chain
    // flops and POPS to the mirror pose on a tiny input — the 1-pixel flip you saw, and only
    // when pinned (one free end has no mirror to flip to). Relaxing from the CURRENT shape
    // each frame keeps it in the SAME bend basin, so it can't teleport; no velocity = no flop.
    // Two constraint families, no bending ENERGY term (an energy minimiser buckles a slack
    // chain into a coil and creeps there over time — the old sinusoidal corkscrew). (1) length
    // constraints keep segments rigid. (2) a ONE-SIDED fold limit: a min-distance between
    // next-nearest joints (i, i+2) so no single joint can fold past ~MAX_FOLD. It's one-sided
    // (only pushes apart when over-folded, never pulls toward straight), so it does NOT prevent
    // a deliberate corkscrew — smooth coils stay well under the cap — it only stops the sharp
    // 180° kink that (a) pinches the skinned tube inside-out and (b) makes consecutive tangents
    // antiparallel, which is the singularity that spun a short chain into a spasm.
    const iters = Math.max(24, n * 4); // enough passes to propagate BOTH end constraints along the full span
    for (let it = 0; it < iters; it++) { // Jakobsen relaxation; pin AND grabbed joint are both immovable
      rope[pin].copy(pinTarget); rope[grab].copy(chainDrag.grabEase);
      for (let i = 0; i < n; i++) { // length constraints
        const a = rope[i], b = rope[i + 1], L = lens[i];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6;
        const fa = (i === pin || i === grab) ? 0 : 1, fb = (i + 1 === pin || i + 1 === grab) ? 0 : 1, tw = fa + fb || 1;
        const k = (d - L) / d;
        a.x += dx * k * (fa / tw); a.y += dy * k * (fa / tw); a.z += dz * k * (fa / tw);
        b.x -= dx * k * (fb / tw); b.y -= dy * k * (fb / tw); b.z -= dz * k * (fb / tw);
      }
      for (let i = 0; i < n - 1; i++) { // one-sided fold limit (joint i+1): keep i and i+2 from collapsing together
        const minD = (lens[i] + lens[i + 1]) * COS_HALF_FOLD;
        const a = rope[i], c = rope[i + 2];
        const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6;
        if (d >= minD) continue; // not over-folded → leave it (one-sided)
        const k = (d - minD) / d; // < 0 → push apart to open the joint
        const fa = (i === pin || i === grab) ? 0 : 1, fc = (i + 2 === pin || i + 2 === grab) ? 0 : 1, tw = fa + fc || 1;
        a.x += dx * k * (fa / tw); a.y += dy * k * (fa / tw); a.z += dz * k * (fa / tw);
        c.x -= dx * k * (fc / tw); c.y -= dy * k * (fc / tw); c.z -= dz * k * (fc / tw);
      }
    }
    rope[pin].copy(pinTarget); rope[grab].copy(chainDrag.grabEase);
    applyRopeToChain(prop, rope); // positions → bone rotations (enforceAttachments owns the prop position)
    requestAnimationFrame(chainRopeStep);
  };
  // Reproduce the rope's world joint positions on the bone hierarchy: place the prop so
  // joint 0 sits at rope[0], then aim each bone along its rope segment. Pin satisfied for
  // free (rope already has the pinned joint at its target).
  const _rcA = new THREE.Quaternion(), _rcP = new THREE.Quaternion(), _rcRun = new THREE.Quaternion(), _rcF = new THREE.Vector3(), _rcD = new THREE.Vector3(), _rcT = new THREE.Vector3(), _rcJ = new THREE.Vector3(), _rcShift = new THREE.Vector3();
  const applyRopeToChain = (prop, rope) => {
    const bones = prop.userData._bones, n = bones.length;
    // SINGLE WRITER of the chain's transform during a drag: orient every bone from the rope,
    // THEN translate the whole prop so the anchored joint lands exactly on rope[anchor]. The
    // anchor's rope position IS the pin target, so enforceAttachments computes a zero
    // correction and the two can't fight (that fight was the spasm).
    //
    // Orientation uses a ROTATION-MINIMIZING FRAME (parallel transport): bone 0 aligns to its
    // tangent keeping its current roll, then each next bone is carried forward by ONLY the
    // minimal rotation between consecutive rope tangents. Roll is a property of the curve alone
    // and never accumulates, so the tube can curl into a corkscrew/toroid without its
    // cross-section winding up. This is well-conditioned because the rope's one-sided fold
    // limit guarantees consecutive tangents are never near-antiparallel (that 180° reversal is
    // the setFromUnitVectors singularity that spun a short chain into a spasm).
    prop.updateWorldMatrix(true, true);
    let started = false;
    for (let i = 0; i < n; i++) {
      const b = bones[i];
      _rcD.subVectors(rope[i + 1], rope[i]);
      if (_rcD.lengthSq() < 1e-12) { if (!started) continue; _rcD.copy(_rcT); } // degenerate segment → keep previous tangent
      else _rcD.normalize();
      if (!started) {
        b.getWorldQuaternion(_rcRun);
        _rcF.copy(_chainUp).applyQuaternion(_rcRun).normalize();
        _rcRun.premultiply(_rcP.setFromUnitVectors(_rcF, _rcD)); // align bone0 +Y to its tangent, preserve its roll
        started = true;
      } else {
        _rcRun.premultiply(_rcP.setFromUnitVectors(_rcT, _rcD)); // parallel transport: minimal rotation between tangents → no twist
      }
      _rcT.copy(_rcD); // this rope tangent → base for the next transport
      if (b.parent) { b.parent.getWorldQuaternion(_rcA); b.quaternion.copy(_rcA.invert().multiply(_rcRun)); }
      else b.quaternion.copy(_rcRun);
      b.updateMatrixWorld(true);
    }
    chainJointWorld(prop, chainDrag.pinIdx, _rcJ); // where the anchored joint ended up after rotating
    prop.position.add(_rcShift.copy(rope[chainDrag.pinIdx]).sub(_rcJ)); // shift the whole prop so it sits exactly on the anchor target
    prop.updateMatrixWorld(true);
    requestRender();
  };

  // ── freehand "draw a flat shape" prop ───────────────────────────────────────
  // Sketch a 2D outline; it becomes a flat double-sided polygon you stand up in the
  // scene (e.g. robe panels behind a figure). It's just another prop — select/move/
  // rotate/scale/save/export all work. The outline points round-trip via pose_state.
  const drawMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
  let drawingShape = false;
  // A drawn outline (2D points, centred + scaled, world units, Y-up) becomes a prop in one
  // of four shapes, all rebuilt from the SAME points so the mode is just a live toggle:
  //   flat     — the original double-sided polygon (a panel).
  //   extrude  — pushed back to a depth, with an optional bevel that rounds the edges.
  //   revolve  — the right silhouette spun around the vertical centre axis (triangle→cone).
  //   inflate  — the filled outline ballooned out in ±Z (circle→sphere) — the "puff" tool.
  const DRAWN_DEFAULTS = { mode: "flat", amount: 0.25, round: 0.5 };
  const drawnShapeFrom = (points, holes) => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    for (const h of holes || []) { // enclosed regions (e.g. the Q inside a spade) → real holes
      if (!h || h.length < 3) continue;
      const path = new THREE.Path();
      path.moveTo(h[0][0], h[0][1]);
      for (let i = 1; i < h.length; i++) path.lineTo(h[i][0], h[i][1]);
      path.closePath();
      shape.holes.push(path);
    }
    return shape;
  };
  const drawnBBox = (points) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
  };
  const _distPtSeg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  // Triangulate a filled outline (+ optional holes) and midpoint-subdivide `levels` times so
  // the interior carries enough vertices to sculpt / displace smoothly — ear-clipping alone
  // produces boundary-only triangles with nothing to grab inside. Holes follow the contour in
  // index space (matching THREE.ShapeUtils.triangulateShape). Shared by flat + inflate.
  const triangulateDrawn = (points, holes, levels) => {
    const contour = points.map((p) => new THREE.Vector2(p[0], p[1]));
    const holeVecs = (holes || []).map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
    const verts = points.map((p) => [p[0], p[1]]);
    for (const h of holes || []) for (const p of h) verts.push([p[0], p[1]]);
    let tris = THREE.ShapeUtils.triangulateShape(contour, holeVecs).map((f) => [f[0], f[1], f[2]]);
    if (!tris.length) throw new Error("triangulation failed");
    for (let lvl = 0; lvl < levels; lvl++) {
      const mid = new Map(), getMid = (a, b) => {
        const key = a < b ? a + "_" + b : b + "_" + a; let m = mid.get(key);
        if (m == null) { m = verts.length; verts.push([(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2]); mid.set(key, m); }
        return m;
      };
      const nt = [];
      for (const [a, b, c] of tris) { const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a); nt.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
      tris = nt;
    }
    return { verts, tris };
  };
  // Split every triangle into four by edge midpoints (×4 polygons), so a coarse mesh gains
  // enough vertices to sculpt. Original vertices keep their indices 0..n-1 (a sculpt delta
  // keyed by index stays valid); midpoints are appended, each with its [a,b] parents so a
  // caller can interpolate per-vertex data. Welds shared edges when the input is indexed;
  // coincident midpoints on a non-indexed mesh are merged at sculpt time by sculptGroups.
  // Deterministic given the same input — so a stored subdiv count rebuilds identical indices.
  const subdivideGeometry = (geo) => {
    const srcPos = geo.attributes.position, idx = geo.index ? geo.index.array : null;
    const verts = [], parents = [];
    for (let i = 0; i < srcPos.count; i++) { verts.push([srcPos.getX(i), srcPos.getY(i), srcPos.getZ(i)]); parents.push(null); }
    const tris = [];
    if (idx) for (let i = 0; i < idx.length; i += 3) tris.push([idx[i], idx[i + 1], idx[i + 2]]);
    else for (let i = 0; i + 2 < srcPos.count; i += 3) tris.push([i, i + 1, i + 2]);
    const mid = new Map(), getMid = (a, b) => {
      const key = a < b ? a + "_" + b : b + "_" + a; let m = mid.get(key);
      if (m == null) { m = verts.length; verts.push([(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2, (verts[a][2] + verts[b][2]) / 2]); parents.push([a, b]); mid.set(key, m); }
      return m;
    };
    const out = [];
    for (const [a, b, c] of tris) { const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a); out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); }
    const pos = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) { pos[i * 3] = verts[i][0]; pos[i * 3 + 1] = verts[i][1]; pos[i * 3 + 2] = verts[i][2]; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(out); g.computeVertexNormals();
    return { geometry: g, parents };
  };
  const DRAWN_FLAT_SUBDIV = 2; // dense enough to sculpt out of the box; the 🗿 mesh editor's subdivide adds more
  const buildDrawnFlat = (points, holes) => {
    // A flat panel, but tessellated rather than a boundary-only ShapeGeometry, so the mesh
    // editor has interior vertices to shape (e.g. an underwear panel you then warp to fit).
    const { verts, tris } = triangulateDrawn(points, holes, DRAWN_FLAT_SUBDIV);
    const pos = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) { pos[i * 3] = verts[i][0]; pos[i * 3 + 1] = verts[i][1]; }
    const idx = []; for (const [a, b, c] of tris) idx.push(a, b, c);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const buildDrawnExtrude = (points, amount, round, holes) => {
    const bb = drawnBBox(points);
    const depth = Math.max(0.01, amount);
    const bevel = round > 0.01;
    const bt = bevel ? Math.min(depth * 0.49, round * Math.min(bb.w, bb.h) * 0.18) : 0; // keep small or a concave shape self-intersects
    const g = new THREE.ExtrudeGeometry(drawnShapeFrom(points, holes), {
      depth, bevelEnabled: bevel, bevelThickness: bt, bevelSize: bt, bevelSegments: bevel ? 3 : 0, steps: 1, curveSegments: 12,
    });
    g.translate(0, 0, -depth / 2); // centre the slab on the draw plane
    g.computeVertexNormals();
    // ExtrudeGeometry's caps are boundary-only ear-clip triangles; subdivide so the broad
    // front/back faces have interior vertices the mesh editor can shape.
    const dense = subdivideGeometry(g).geometry;
    g.dispose();
    return dense;
  };
  const buildDrawnRevolve = (points) => {
    // Right silhouette = max |x| at each height, revolved around x=0. Capped at both poles
    // (r→0) so it's a closed solid. Triangle→cone, pencil profile→cylinder + cone tip.
    const bb = drawnBBox(points), N = 48, prof = [new THREE.Vector2(1e-4, bb.minY)];
    for (let i = 0; i <= N; i++) {
      const y = bb.minY + bb.h * (i / N); let maxX = 0;
      for (let j = 0; j < points.length; j++) {
        const a = points[j], b = points[(j + 1) % points.length], y0 = a[1], y1 = b[1];
        if ((y0 <= y && y1 >= y) || (y1 <= y && y0 >= y)) {
          const x = Math.abs(y1 - y0) < 1e-9 ? Math.max(Math.abs(a[0]), Math.abs(b[0])) : a[0] + (b[0] - a[0]) * ((y - y0) / (y1 - y0));
          maxX = Math.max(maxX, Math.abs(x));
        }
      }
      prof.push(new THREE.Vector2(Math.max(1e-4, maxX), y));
    }
    prof.push(new THREE.Vector2(1e-4, bb.maxY));
    const g = new THREE.LatheGeometry(prof, 36);
    g.computeVertexNormals();
    return g;
  };
  const buildDrawnInflate = (points, amount, round, holes = []) => {
    // Triangulate the filled outline, densify by midpoint subdivision, then displace each
    // vertex ±Z by a function of its distance from the outline → a rounded pillow/balloon.
    const { verts, tris } = triangulateDrawn(points, holes, 3); // 3 levels keeps the dome smooth, not faceted
    const edges = []; for (let i = 0; i < points.length; i++) edges.push([points[i], points[(i + 1) % points.length]]);
    for (const h of holes || []) for (let i = 0; i < h.length; i++) edges.push([h[i], h[(i + 1) % h.length]]); // puff also tapers to 0 at hole rims
    const dArr = new Float32Array(verts.length); let dMax = 1e-6;
    for (let i = 0; i < verts.length; i++) {
      let dmin = Infinity; for (const [a, b] of edges) { const d = _distPtSeg(verts[i][0], verts[i][1], a[0], a[1], b[0], b[1]); if (d < dmin) dmin = d; }
      dArr[i] = dmin; if (dmin > dMax) dMax = dmin;
    }
    const height = (d) => { // round=0 → tent (linear), round=1 → dome (circular profile)
      const t = Math.min(1, d / dMax), dome = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
      return amount * (t + (dome - t) * round);
    };
    const V = verts.length, pos = new Float32Array(V * 2 * 3), idx = [];
    for (let i = 0; i < V; i++) { const z = height(dArr[i]); pos[i * 3] = verts[i][0]; pos[i * 3 + 1] = verts[i][1]; pos[i * 3 + 2] = z; pos[(V + i) * 3] = verts[i][0]; pos[(V + i) * 3 + 1] = verts[i][1]; pos[(V + i) * 3 + 2] = -z; }
    for (const [a, b, c] of tris) { idx.push(a, b, c); idx.push(V + a, V + c, V + b); } // front + reversed back shell
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const buildDrawnGeometry = (points, mode, amount, round, holes) => {
    try {
      if (mode === "extrude") return buildDrawnExtrude(points, amount, round, holes);
      if (mode === "revolve") return buildDrawnRevolve(points); // holes don't apply to a revolve
      if (mode === "inflate") return buildDrawnInflate(points, amount, round, holes);
      return buildDrawnFlat(points, holes); // dense tessellated panel (sculpt-ready), not boundary-only
    } catch (e) { console.warn("[PoseStudio] drawn geometry build failed → flat:", e); }
    return new THREE.ShapeGeometry(drawnShapeFrom(points, holes)); // last-ditch fallback if triangulation throws
  };
  const makeDrawnProp = (points, opts = {}) => {
    if (!Array.isArray(points) || points.length < 3) return null;
    const mode = opts.mode || DRAWN_DEFAULTS.mode;
    const amount = opts.amount != null ? opts.amount : DRAWN_DEFAULTS.amount;
    const round = opts.round != null ? opts.round : DRAWN_DEFAULTS.round;
    const holes = Array.isArray(opts.holes) ? opts.holes.filter((h) => Array.isArray(h) && h.length >= 3) : [];
    const m = new THREE.Mesh(buildDrawnGeometry(points, mode, amount, round, holes), drawMat);
    m.userData = { isProp: true, propType: "drawnShape", points, holes, drawMode: mode, drawAmount: amount, drawRound: round, uid: propUidSeq++ };
    return m;
  };
  // Swap a drawn prop's geometry in place when its mode/amount/round changes (live panel).
  // Re-applies any mesh-editor subdivisions + sculpt delta so a panel tweak doesn't wipe them.
  const rebuildDrawnGeometry = (prop) => {
    const ud = prop.userData;
    let g = buildDrawnGeometry(ud.points, ud.drawMode, ud.drawAmount, ud.drawRound, ud.holes);
    for (let i = 0; i < (ud.subdivLevel || 0); i++) { const ng = subdivideGeometry(g).geometry; g.dispose(); g = ng; }
    prop.geometry.dispose();
    prop.geometry = g;
    delete ud._sculptBase; // base geometry changed → recapture the sculpt base on next apply
    ud._sculptOwned = (ud.subdivLevel || 0) > 0; // a subdivided drawn geo is already a private copy
    if (ud.sculptMap && ud.sculptMap.size) applySculpt(prop, ud.sculptMap);
    requestRender();
  };
  // Ramer–Douglas–Peucker: thin a freehand stroke to its meaningful corners.
  const simplifyRDP = (pts, eps) => {
    if (pts.length < 3) return pts.slice();
    let dmax = 0, idx = 0;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps) return simplifyRDP(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplifyRDP(pts.slice(idx), eps));
    return [pts[0], pts[pts.length - 1]];
  };

  // Draw overlay: a 2D canvas over the viewport, shown only while drawing a shape.
  const drawCanvas = document.createElement("canvas");
  drawCanvas.style.cssText = "position:absolute;inset:0;z-index:7;cursor:crosshair;display:none;touch-action:none;background:rgba(20,20,26,0.22);";
  container.appendChild(drawCanvas);
  const drawHint = document.createElement("div");
  drawHint.textContent = "✏️ drag to draw a shape — release to create · Esc to cancel";
  drawHint.style.cssText = "position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:8;display:none;padding:3px 10px;background:#2e5d44;color:#fff;border:1px solid #5fbf8c;border-radius:5px;font:11px/1.4 system-ui,sans-serif;pointer-events:none;white-space:nowrap;";
  container.appendChild(drawHint);
  let drawPts = [], drawingStroke = false, drawDefaultMode = "flat";
  const enterDrawMode = (defaultMode = "flat") => {
    drawingShape = true; drawDefaultMode = defaultMode;
    detachGizmo();
    controls.enabled = false; transformControls.enabled = false; // modal: no orbit/gizmo while drawing
    drawCanvas.width = Math.max(1, container.clientWidth);
    drawCanvas.height = Math.max(1, container.clientHeight);
    drawCanvas.style.display = "block"; drawHint.style.display = "block";
    drawHint.textContent = defaultMode === "flat"
      ? "✏️ drag to draw a shape — release to create · Esc to cancel"
      : "🧊 drag to draw a 3D shape — release, then adjust it bottom-left · Esc to cancel";
    drawPts = []; drawingStroke = false;
  };
  const exitDrawMode = () => {
    drawingShape = false; drawingStroke = false; drawPts = [];
    controls.enabled = true; transformControls.enabled = true;
    drawCanvas.style.display = "none"; drawHint.style.display = "none";
  };
  const finishDraw = () => {
    const raw = drawPts;
    exitDrawMode();
    const simp = simplifyRDP(raw, 3);
    if (simp.length < 3) { requestRender(); return; }
    // px outline → local shape: flip Y (screen-down → world-up), centre, scale so height ≈ 0.8m
    let cx = 0, cy = 0, minY = 1e9, maxY = -1e9;
    for (const p of simp) { cx += p[0]; cy += p[1]; minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    cx /= simp.length; cy /= simp.length;
    const s = 0.8 / Math.max(1, maxY - minY);
    const pts = simp.map((p) => [ +((p[0] - cx) * s).toFixed(4), +(-(p[1] - cy) * s).toFixed(4) ]);
    const m = makeDrawnProp(pts, { mode: drawDefaultMode });
    if (!m) { requestRender(); return; }
    m.position.set(0, 1.0, 0); // a vertical panel at torso height, facing the camera; user repositions
    propsGroup.add(m);
    selectProp(m);
    requestRender();
    captureAndUpload(node);
  };

  // ── Image → 3D shape (import a stencil) ──────────────────────────────────────
  // Trace the DARK blobs of an imported image and turn EACH into a drawn-shape prop
  // (default = inflate, a puffed solid like the freehand 3D tool), preserving their
  // relative layout. A stencil (one logo, or many sparkles) becomes real solids you
  // can extrude/inflate/position with the same bottom-left panel — standalone, not
  // tied to clothing paint.
  const traceImageBlobs = (img) => {
    const maxDim = 480; // cap trace resolution for speed; outlines are simplified anyway
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const W = Math.max(1, Math.round(img.width * scale)), H = Math.max(1, Math.round(img.height * scale));
    const cnv = document.createElement("canvas"); cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const g = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { const a = data[i * 4 + 3], lum = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3; g[i] = (a > 40 && lum < 110) ? 1 : 0; } // dark = filled
    // Mark the OUTSIDE background: light pixels reachable from the image border. Light
    // pixels NOT reachable are ENCLOSED → holes (e.g. the white Q inside a black spade).
    const outside = new Uint8Array(W * H), bfs = [];
    const seedBg = (i) => { if (!g[i] && !outside[i]) { outside[i] = 1; bfs.push(i); } };
    for (let x = 0; x < W; x++) { seedBg(x); seedBg((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { seedBg(y * W); seedBg(y * W + W - 1); }
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (bfs.length) { const i = bfs.pop(), x = i % W, y = (i / W) | 0; for (const [ox, oy] of N4) { const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; seedBg(ny * W + nx); } }
    const dark = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : g[y * W + x];
    const hole = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : (!g[y * W + x] && !outside[y * W + x]) ? 1 : 0;
    const dirIdx = (fx, fy, px, py) => { const dx = fx - px, dy = fy - py; for (let i = 0; i < 8; i++) if (_MN[i][0] === dx && _MN[i][1] === dy) return i; return 4; };
    const moore = (fill, sx, sy) => { // Moore-neighbour boundary trace of a region
      let p = [sx, sy], b = [sx - 1, sy]; const out = [[sx, sy]];
      for (let guard = 0; guard < W * H * 8; guard++) {
        const bd = dirIdx(b[0], b[1], p[0], p[1]); let moved = false;
        for (let k = 1; k <= 8; k++) { const d = (bd + k) % 8, nx = p[0] + _MN[d][0], ny = p[1] + _MN[d][1]; if (fill(nx, ny)) { b = p; p = [nx, ny]; out.push(p); moved = true; break; } }
        if (!moved) break; if (p[0] === sx && p[1] === sy) break;
      }
      return out;
    };
    const flood = (fill, sx, sy, vis) => { const s = [[sx, sy]]; vis[sy * W + sx] = 1; while (s.length) { const [x, y] = s.pop(); for (const [ox, oy] of _MN) { const nx = x + ox, ny = y + oy; if (fill(nx, ny) && !vis[ny * W + nx]) { vis[ny * W + nx] = 1; s.push([nx, ny]); } } } };
    const dvis = new Uint8Array(W * H), blobs = [];
    for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
      if (!dark(sx, sy) || dvis[sy * W + sx]) continue;
      const outer = moore(dark, sx, sy); flood(dark, sx, sy, dvis);
      if (outer.length >= 16) blobs.push({ outer, holes: [] });
    }
    const hvis = new Uint8Array(W * H);
    for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
      if (!hole(sx, sy) || hvis[sy * W + sx]) continue;
      const hc = moore(hole, sx, sy); flood(hole, sx, sy, hvis);
      if (hc.length < 12) continue;
      let cxh = 0, cyh = 0; for (const p of hc) { cxh += p[0]; cyh += p[1]; } cxh /= hc.length; cyh /= hc.length;
      const host = blobs.find((bl) => pointInPoly(cxh, cyh, bl.outer)) || blobs[0]; // the blob enclosing this hole
      if (host) host.holes.push(hc);
    }
    return { blobs, W, H };
  };
  // Uniformly decimate a CLOSED contour to ~target points. (RDP can't be used: it collapses
  // a closed loop — start≈end → near-zero baseline — down to 2 points.)
  const decimateClosed = (pts, target) => {
    if (pts.length <= target) return pts;
    const out = [], step = pts.length / target;
    for (let i = 0; i < target; i++) out.push(pts[Math.floor(i * step)]);
    return out;
  };
  const imageToShapes = (img) => {
    const { blobs, W, H } = traceImageBlobs(img);
    if (!blobs.length) { showClipToast("no dark shapes found in that image", true); return 0; }
    const s = 0.8 / Math.max(W, H), cx = W / 2, cy = H / 2; // one scale → relative layout preserved
    // px → local shape: centre on the image, flip Y (screen-down → world-up), shared scale
    const toLocal = (pts) => decimateClosed(pts, 72).map((p) => [+((p[0] - cx) * s).toFixed(4), +(-(p[1] - cy) * s).toFixed(4)]);
    const made = [];
    for (const bl of blobs) {
      const outer = toLocal(bl.outer);
      if (outer.length < 3) continue;
      const holes = bl.holes.map(toLocal).filter((h) => h.length >= 3);
      const m = makeDrawnProp(outer, { mode: "inflate", amount: 0.12, round: 0.6, holes });
      if (!m) continue;
      m.position.set(0, 1.0, 0); // each blob's offset is baked into its points → layout reassembles
      propsGroup.add(m); made.push(m);
    }
    if (!made.length) { showClipToast("couldn't build shapes from that image", true); return 0; }
    selectProp(made[0]);
    requestRender(); captureAndUpload(node);
    showClipToast(`imported ${made.length} shape${made.length > 1 ? "s" : ""} — adjust bottom-left, drag to place`);
    return made.length;
  };
  const pickImageForShape = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.addEventListener("change", () => { const f = inp.files?.[0]; if (!f) return; const url = URL.createObjectURL(f); const im = new Image(); im.onload = () => { imageToShapes(im); URL.revokeObjectURL(url); }; im.src = url; });
    inp.click();
  };
  // ── bottom-left live panel: turn the selected drawn shape into a 3D solid ─────
  // Shows only when a drawn-shape prop is selected. Mode toggles + two sliders rebuild the
  // geometry from the same outline in real time; release commits (re-captures the depth map).
  const DRAW_MODES = [["flat", "▭ flat"], ["extrude", "📐 extrude"], ["revolve", "🧊 revolve"], ["inflate", "🎈 inflate"]];
  const drawPanel = document.createElement("div");
  drawPanel.style.cssText = "position:absolute;left:6px;bottom:6px;z-index:4;display:none;flex-direction:column;gap:5px;min-width:172px;" +
    "background:rgba(20,20,26,0.9);border:1px solid #4a4a55;border-radius:6px;padding:7px 8px;font:11px system-ui,sans-serif;color:#cdd;";
  drawPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  const drawModeRow = document.createElement("div");
  drawModeRow.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;";
  const drawModeBtns = {};
  for (const [key, label] of DRAW_MODES) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "flex:1 0 auto;padding:3px 6px;background:#2a2a35;color:#cdd;border:1px solid #4a4a55;border-radius:4px;cursor:pointer;font:11px system-ui,sans-serif;white-space:nowrap;";
    b.addEventListener("click", () => {
      if (!selectedProp?.userData?.points) return;
      const ud = selectedProp.userData;
      if (ud.drawMode !== key && ud.sculptMap?.size) { ud.sculptMap.clear(); delete ud._sculptBase; } // new mode = different topology; the old sculpt delta no longer maps
      ud.drawMode = key;
      rebuildDrawnGeometry(selectedProp);
      syncDrawPanel();
      captureAndUpload(node);
    });
    drawModeBtns[key] = b; drawModeRow.appendChild(b);
  }
  drawPanel.appendChild(drawModeRow);
  const mkDrawSlider = (labelText) => {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;";
    const lab = document.createElement("span"); lab.textContent = labelText; lab.style.cssText = "width:46px;flex:0 0 auto;color:#9aa;";
    const sl = document.createElement("input"); sl.type = "range";
    sl.style.cssText = "flex:1;accent-color:#5fbf8c;cursor:pointer;";
    wrap.appendChild(lab); wrap.appendChild(sl);
    return { wrap, lab, sl };
  };
  const drawAmtCtl = mkDrawSlider("Depth"); // relabelled per mode
  drawAmtCtl.sl.min = "0.02"; drawAmtCtl.sl.max = "0.7"; drawAmtCtl.sl.step = "0.01";
  const drawRndCtl = mkDrawSlider("Round");
  drawRndCtl.sl.min = "0"; drawRndCtl.sl.max = "1"; drawRndCtl.sl.step = "0.01";
  drawPanel.appendChild(drawAmtCtl.wrap); drawPanel.appendChild(drawRndCtl.wrap);
  drawAmtCtl.sl.addEventListener("input", () => { if (!selectedProp?.userData?.points) return; selectedProp.userData.drawAmount = parseFloat(drawAmtCtl.sl.value); rebuildDrawnGeometry(selectedProp); });
  drawRndCtl.sl.addEventListener("input", () => { if (!selectedProp?.userData?.points) return; selectedProp.userData.drawRound = parseFloat(drawRndCtl.sl.value); rebuildDrawnGeometry(selectedProp); });
  const commitDraw = () => { if (selectedProp?.userData?.points) captureAndUpload(node); };
  drawAmtCtl.sl.addEventListener("change", commitDraw); drawRndCtl.sl.addEventListener("change", commitDraw);
  container.appendChild(drawPanel);
  // Which sliders are meaningful per mode (flat/revolve are fully determined by the outline).
  const DRAW_SLIDERS = { flat: {}, extrude: { amount: "Depth", round: "Bevel" }, revolve: {}, inflate: { amount: "Puff", round: "Round" } };
  const syncDrawPanel = () => {
    const ud = selectedProp?.userData;
    const isDrawn = ud?.propType === "drawnShape" && Array.isArray(ud.points);
    drawPanel.style.display = isDrawn ? "flex" : "none";
    if (!isDrawn) return;
    for (const [key, b] of Object.entries(drawModeBtns)) {
      const on = (ud.drawMode || "flat") === key;
      b.style.background = on ? "#2e5d44" : "#2a2a35";
      b.style.borderColor = on ? "#5fbf8c" : "#4a4a55";
    }
    const cfg = DRAW_SLIDERS[ud.drawMode || "flat"] || {};
    drawAmtCtl.wrap.style.display = cfg.amount ? "flex" : "none";
    drawRndCtl.wrap.style.display = cfg.round ? "flex" : "none";
    if (cfg.amount) { drawAmtCtl.lab.textContent = cfg.amount; drawAmtCtl.sl.value = ud.drawAmount ?? DRAWN_DEFAULTS.amount; }
    if (cfg.round) { drawRndCtl.lab.textContent = cfg.round; drawRndCtl.sl.value = ud.drawRound ?? DRAWN_DEFAULTS.round; }
  };
  drawCanvas.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    drawingStroke = true; drawPts = [[e.offsetX, e.offsetY]];
    drawCanvas.setPointerCapture?.(e.pointerId);
  });
  drawCanvas.addEventListener("pointermove", (e) => {
    if (!drawingStroke) return;
    drawPts.push([e.offsetX, e.offsetY]);
    const c = drawCanvas.getContext("2d");
    c.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    c.strokeStyle = "#7fffb0"; c.lineWidth = 2; c.lineJoin = "round"; c.lineCap = "round";
    c.beginPath(); c.moveTo(drawPts[0][0], drawPts[0][1]);
    for (const p of drawPts) c.lineTo(p[0], p[1]);
    c.stroke();
  });
  drawCanvas.addEventListener("pointerup", (e) => {
    if (!drawingStroke) return;
    drawingStroke = false;
    try { drawCanvas.releasePointerCapture?.(e.pointerId); } catch {}
    finishDraw();
  });
  const selectProp = (mesh) => {
    clearBand();
    clearFigureSelection(); // a prop and a whole figure are never selected at once
    selectedJointName = null; selectedIkLimb = null; // drop any joint selection
    if (selectedChainJoint?.prop !== mesh) selectedChainJoint = null; // a different selection drops the combine target
    selectedProp = mesh;
    transformControls.setMode(propMode);
    transformControls.setSpace(propMode === "scale" ? "local" : "world"); // scale must be local
    transformControls.attach(mesh);
    updatePresetUI(); // not a wrist/ankle → hides the hand/foot panel
    updatePropUI();
    updateIkUI();
  };
  const setPropMode = (mode) => {
    propMode = mode;
    if (selectedProp) {
      transformControls.setMode(mode);
      transformControls.setSpace(mode === "scale" ? "local" : "world");
    }
    updatePropUI();
    requestRender();
  };
  const deleteSelectedProp = () => {
    if (!selectedProp) return;
    transformControls.detach();
    removeAttachmentsFor(selectedProp); // drop any pin to/from this prop
    propsGroup.remove(selectedProp);
    disposeProp(selectedProp); // model = traverse-dispose; primitive = single geometry (shared material kept)
    cancelPinPick(); // re-enables the gizmo if this prop was mid-link
    selectedProp = null;
    updatePropUI();
    requestRender();
    captureAndUpload(node);
  };
  const spawnProp = (type) => {
    if (type === "__draw__") { enterDrawMode("flat"); return; } // freehand flat panel — spawns on draw-finish
    if (type === "__draw3d__") { enterDrawMode("inflate"); return; } // freehand 3D shape — defaults to inflate, tweak via bottom-left panel
    if (MODEL_PROPS[type]) { // bundled GLB model — loads async
      loadModelProp(type).then((root) => {
        if (!node._pcrAlive) { disposeProp(root); return; }
        root.position.set(0, 0, 0.4); // base already at y=0 → rests on the floor in front
        propsGroup.add(root);
        selectProp(root);
        requestRender();
        captureAndUpload(node);
      }).catch((e) => console.error("[PoseStudio] model prop load failed:", type, e));
      return;
    }
    if (CHAIN_DEFS[type]) { // procedural articulated chain
      const m = makeChainProp(type);
      if (!m) return;
      m.position.set(0, 0, 0.4); // base at y=0 → stands on the floor in front
      propsGroup.add(m);
      selectProp(m); // selected as a normal prop → move/rotate/SCALE gizmo all work
      setBonePoseProp(m); // + show the segment dots and the green tip dot (grab the tip to bend)
      requestRender();
      captureAndUpload(node);
      return;
    }
    const def = PROP_DEFS[type];
    const m = makeProp(type);
    if (!m) return;
    m.position.set(0, def.y, 0.4); // on the floor, just in front of the figure (+Z faces camera)
    propsGroup.add(m);
    selectProp(m);
    requestRender();
    captureAndUpload(node);
  };

  // Prop transform panel — appears only while a prop is selected.
  const propPanel = document.createElement("div");
  propPanel.style.cssText =
    "position:absolute;top:6px;right:6px;z-index:3;display:none;gap:3px;" +
    "background:rgba(20,20,26,0.82);border:1px solid #4a4a55;border-radius:5px;padding:3px 4px;";
  propPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  // (Move/rotate/scale live in the left transform group now — not repeated here.)
  // Give this prop a REGION: its own silhouette mask row + a $name{} block in
  // the bound prompt (same machinery as figure renames). "$" because that's
  // the region syntax users already type — clearer than any name/tag icon.
  const propRegionBtn = mkBtn("$", "Give this prop its own prompt region — a $name{} block + silhouette mask (click to set/change the region name; clear it to remove)", () => {
    if (selectedProp) openRenameProp(selectedProp);
  });
  propPanel.appendChild(propRegionBtn);
  // Auto-capability buttons — each appears only when the imported file actually
  // carries that capability (multi-mesh / skeleton / animation clips).
  const propSplitBtn = mkBtn("✂️", "Split this model into its parts — each gets its own gizmo (they spawn linked to part 1)", () => {
    if (selectedProp) splitImportedProp(selectedProp);
  });
  propPanel.appendChild(propSplitBtn);
  const propBonesBtn = mkBtn("🦴", "Pose this model's bones — click a bone dot, rotate it with the gizmo (toggle)", () => {
    if (selectedProp) setBonePoseProp(selectedProp);
  });
  propPanel.appendChild(propBonesBtn);
  const propClipsBtn = mkBtn("🎬", "Pose from the model's own animations — pick a clip, scrub to a frame, it freezes there", () => {
    clipOpen = !clipOpen;
    updatePropUI();
    requestRender();
  });
  propPanel.appendChild(propClipsBtn);
  const propFitBtn = mkBtn("🧍", "Make this model POSABLE: fit a skeleton inside it (drag its handles to line up the limbs), then bind", () => {
    if (selectedProp) startSkinFit(selectedProp);
  });
  propPanel.appendChild(propFitBtn);
  // Pin this prop to a hand/joint or another prop: click 📌, then click the target. The
  // prop becomes the follower (rides the target). Click 📌 again to unpin.
  const propPinBtn = mkBtn("🔗", "Combine: stick this prop (or the selected chain joint) to a hand/joint or another prop — then click the target (🔗 again to unlink)", () => {
    if (!selectedProp) return;
    if (propAttachment(selectedProp)) { removeAttachmentsFor(selectedProp); requestRender(); captureAndUpload(node); }
    else {
      pinPickProp = (pinPickProp === selectedProp) ? null : selectedProp; // toggle pick-mode
      // On a chain with a joint selected, combine THAT joint (it becomes the held
      // anchor); otherwise the whole prop rides the target by its origin.
      pinPickJointIndex = (pinPickProp && selectedProp.userData._chain && selectedChainJoint?.prop === selectedProp) ? selectedChainJoint.jointIndex : null;
    }
    transformControls.enabled = !pinPickProp; // gizmo inert while waiting to pick a link target (its drag-planes block clicks/orbit otherwise)
    updatePropUI();
    requestRender();
  });
  propPanel.appendChild(propPinBtn);
  const propSculptBtn = mkBtn("🗿", "Sculpt this object — grab / inflate / smooth its surface", () => {
    if (!selectedProp) return;
    if (sculpt.active) exitSculpt(); else enterSculpt("prop", selectedProp);
  });
  propPanel.appendChild(propSculptBtn);
  // Shown only for a "missing mesh" marker — upload the file to restore the prop.
  const propLocateBtn = mkBtn("🔍", "Locate this prop's missing mesh file — its content is verified before the prop is restored", () => {
    if (selectedProp?.userData._failedRecord) locateMissingMesh(selectedProp);
  });
  propPanel.appendChild(propLocateBtn);
  propPanel.appendChild(mkBtn("🗑", "Delete prop (Del)", deleteSelectedProp));
  container.appendChild(propPanel);

  // The IK-tip move/rotate toggle moved into the left transform group (Move =
  // gizmo-driven IK drag, Rotate = FK twist) — its old floating panel is gone;
  // selection changes just re-sync the tool highlight.
  updateIkUI = () => updateToolUI();

  // Armed-pin banner — unmistakable feedback that the next click picks the pin target.
  const pinHint = document.createElement("div");
  pinHint.textContent = "🔗 click a hand / joint / prop to link this prop to — Esc to cancel";
  pinHint.style.cssText =
    "position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:4;display:none;" +
    "padding:3px 10px;background:#7a5a1e;color:#fff;border:1px solid #caa14a;border-radius:5px;" +
    "font:11px/1.4 system-ui,sans-serif;pointer-events:none;white-space:nowrap;";
  container.appendChild(pinHint);
  // "This prop's mesh is missing" banner — shown while a missing-mesh marker is selected.
  const missingHint = document.createElement("div");
  missingHint.style.cssText =
    "position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:4;display:none;max-width:88%;" +
    "padding:3px 10px;background:#7a3a1e;color:#fff;border:1px solid #caa14a;border-radius:5px;" +
    "font:11px/1.4 system-ui,sans-serif;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  container.appendChild(missingHint);
  // Proactive scene-level warning shown on LOAD when this workflow references
  // imported meshes whose files aren't on this machine (a shared workflow carries
  // meshes by content-hash reference, not the bytes). Dismissible; re-shown on the
  // next load. The per-marker `missingHint` above names a specific file on select;
  // this banner gives the count when nothing is selected, so the warning can't be
  // missed. The two never show at once (refreshMissingUI gates on selection).
  let missingDismissed = false;
  const loadBanner = document.createElement("div");
  loadBanner.style.cssText =
    "position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:5;display:none;align-items:center;gap:8px;max-width:92%;" +
    "padding:4px 6px 4px 10px;background:#7a3a1e;color:#fff;border:1px solid #caa14a;border-radius:5px;" +
    "font:11px/1.4 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,0.45);";
  loadBanner.addEventListener("pointerdown", (e) => e.stopPropagation());
  const loadBannerText = document.createElement("span");
  loadBannerText.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  const loadBannerClose = document.createElement("button");
  loadBannerClose.textContent = "✕"; loadBannerClose.title = "Dismiss";
  loadBannerClose.style.cssText = "flex:0 0 auto;width:18px;height:18px;padding:0;background:transparent;border:none;color:#fff;cursor:pointer;font:12px/1 system-ui,sans-serif;opacity:0.85;";
  loadBannerClose.addEventListener("click", (e) => { e.stopPropagation(); missingDismissed = true; loadBanner.style.display = "none"; });
  loadBanner.append(loadBannerText, loadBannerClose);
  container.appendChild(loadBanner);
  const refreshMissingUI = ({ reset = false } = {}) => {
    if (reset) missingDismissed = false;
    const sel = selectedProp?.userData._failedRecord;
    if (sel) { // a missing marker is selected → name its specific file
      missingHint.textContent = `⚠ Missing mesh "${sel.file || sel.type || "mesh"}" — click 🔍 to locate the file`;
      missingHint.style.display = "block";
    } else missingHint.style.display = "none";
    const n = propsGroup.children.filter((m) => m.userData._failedRecord).length;
    const show = !sel && n > 0 && !missingDismissed;
    if (show) loadBannerText.textContent = `⚠ ${n} imported mesh${n > 1 ? "es" : ""} missing on this machine — select the orange marker${n > 1 ? "s" : ""}, then 🔍 Locate the file${n > 1 ? "s" : ""} (a shared workflow carries meshes by reference, not the file)`;
    loadBanner.style.display = show ? "flex" : "none";
  };
  // 🔍 Locate: pick the missing mesh file, upload it to the content-addressed store,
  // and accept it ONLY if its content hash matches the one the prop references (the
  // same digest-verified contract as the lineage "Locate file…" reattach). On a
  // match, every marker that wanted that mesh adopts the stored name and the props +
  // pins are rebuilt from the live scene — the marker turns back into the real mesh.
  const meshHashOf = (f) => (f || "").replace(/\.(glb|gltf|obj)$/i, "");
  const locateInput = document.createElement("input");
  locateInput.type = "file"; locateInput.accept = ".glb,.gltf,.obj"; locateInput.style.display = "none";
  locateInput.className = "pcr-locate-mesh-input";
  container.appendChild(locateInput);
  let locateWantHash = null;
  const locateMissingMesh = (placeholder) => {
    locateWantHash = meshHashOf(placeholder?.userData?._failedRecord?.file);
    if (!locateWantHash) { showClipToast("this prop has no mesh reference to locate", true); return; }
    locateInput.click();
  };
  locateInput.addEventListener("change", async () => {
    const file = locateInput.files?.[0];
    locateInput.value = ""; // same file re-selectable later
    const wantHash = locateWantHash; locateWantHash = null;
    if (!file || !wantHash) return;
    try {
      const form = new FormData(); form.append("mesh", file);
      const resp = await api.fetchApi("/promptchain/pose-mesh/upload", { method: "POST", body: form });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error || !data.file) throw new Error(data.error || `upload failed (${resp.status})`);
      if (meshHashOf(data.file) !== wantHash) {
        showClipToast("that's not the right file — its contents don't match this prop", true);
        return;
      }
      // Content matches: adopt the actually-stored name on every marker that wanted it
      // (a different extension, or the same mesh reused across props), then rebuild the
      // props + pins from the live scene — the same path a scene load takes.
      for (const m of propsGroup.children) {
        const fr = m.userData._failedRecord;
        if (fr?.file && meshHashOf(fr.file) === wantHash) m.userData._failedRecord = { ...fr, file: data.file };
      }
      const props = propsApi.serialize(), atts = attachApi.serialize();
      await propsApi.restoreFrom(props);
      if (!node._pcrAlive) return;
      attachApi.restoreFrom(atts);
      await syncSkinBinds();
      updatePropLabels();
      const restored = propsGroup.children.find((m) => !m.userData._failedRecord && m.userData.file === data.file);
      if (restored) selectProp(restored); else updatePropUI();
      requestRender();
      captureAndUpload(node);
      showClipToast("mesh located — prop restored");
    } catch (e) { showClipToast("locate failed — " + (e.message || e), true); }
  });

  updatePropUI = () => {
    propPanel.style.display = selectedProp ? "flex" : "none";
    syncDrawPanel(); // bottom-left 3D-shape controls (drawn props only)
    updateToolUI(); // the left transform group reflects this selection's mode
    // $ green = this prop has its own region; tooltip carries the live name.
    const regionName = selectedProp?.userData.customName;
    propRegionBtn.style.background = regionName ? "#2e5d44" : "#2a2a35";
    propRegionBtn.title = regionName
      ? `Region $${regionName} — click to rename (clear the name to remove the region)`
      : "Give this prop its own prompt region — a $name{} block + silhouette mask";
    // Capability buttons only exist for files that came with the capability.
    const ud = selectedProp?.userData;
    propSplitBtn.style.display = ud?._capParts ? "" : "none";
    propBonesBtn.style.display = ud?._bones ? "" : "none";
    propClipsBtn.style.display = ud?._clips?.length ? "" : "none";
    propFitBtn.style.display = (ud?.file && !ud._bones) ? "" : "none"; // static imports: rigged ones pose via 🦴 already
    // A missing-mesh marker can only be located or deleted — hide the controls that
    // need real geometry, surface 🔍 Locate + a banner naming the missing file.
    const missingMesh = !!ud?._failedRecord;
    propLocateBtn.style.display = missingMesh ? "" : "none";
    propRegionBtn.style.display = missingMesh ? "none" : "";
    propSculptBtn.style.display = missingMesh ? "none" : "";
    propPinBtn.style.display = missingMesh ? "none" : "";
    refreshMissingUI(); // per-select file hint + scene-level load banner (mutually exclusive)
    propBonesBtn.style.background = (bonePoseProp && bonePoseProp === selectedProp) ? "#2e5d44" : "#2a2a35";
    propClipsBtn.style.background = (clipOpen && ud?._clips?.length) ? "#2e5d44" : "#2a2a35";
    syncClipPanel();
    // 🔗 green = linked; amber = waiting for you to click a target.
    const att = selectedProp ? propAttachment(selectedProp) : null;
    propPinBtn.style.background = att ? "#2e5d44" : pinPickProp === selectedProp ? "#7a5a1e" : "#2a2a35";
    propPinBtn.title = att ? "Linked — click to unlink"
      : "Link this prop to a hand/joint or another prop — then click the target";
    pinHint.style.display = pinPickProp ? "block" : "none";
    // Persistent "this prop is linked + how to undo" line (hidden while picking a target).
    if (att && !pinPickProp) {
      const tgt = att.leader.kind === "joint" ? jointFriendly(att.leader.joint) : "another prop";
      linkStatus.textContent = "🔗 linked to " + tgt + " — click 🔗 to unlink · ↶ to undo";
      linkStatus.style.display = "block";
    } else linkStatus.style.display = "none";
  };

  // ── rubber-band (marquee) multi-select ──────────────────────────────────────
  // Hold Shift + drag a rectangle to select multiple figures + props at once and
  // move/rotate them together (a single gizmo on a proxy at the group median applies
  // the same delta to all). Plain drag still orbits — Shift arms the band and turns
  // OrbitControls + the gizmo off for the gesture. Touch/intersect containment via
  // screen-space AABB overlap, select-through (no occlusion) — the DCC convention.
  // v1 is replace-only (Shift already arms the band, so it can't also mean "add").
  // (bandSel itself is declared with the capture forward-decls — the outline pass
  // reads it; selection membership alone drives the members' outlines.)
  const bandObj3d = (s) => (s.kind === "figure" ? s.o.root : s.o);
  const bandProxy = new THREE.Object3D(); // gizmo target; sits at the group median
  scene.add(bandProxy);
  const bandStartMat = new Map();  // obj3d -> world Matrix4 at drag start
  const bandStartPins = new Map(); // fig -> {tip: world Vec3|null} at drag start (profile plantedTips)
  const _bpInv = new THREE.Matrix4(), _bDelta = new THREE.Matrix4(), _bM = new THREE.Matrix4();
  const _bV = new THREE.Vector3(), _bBox = new THREE.Box3();

  bandActive = () => bandSel.length > 0 && transformControls.object === bandProxy;

  clearBand = () => {
    if (!bandSel.length) return;
    if (transformControls.object === bandProxy) transformControls.detach();
    bandSel.length = 0;
  };

  const placeBandProxy = () => {
    bandProxy.position.set(0, 0, 0);
    for (const s of bandSel) bandProxy.position.add(bandObj3d(s).getWorldPosition(_bV));
    if (bandSel.length) bandProxy.position.multiplyScalar(1 / bandSel.length);
    bandProxy.quaternion.identity();
    bandProxy.scale.setScalar(1);
    bandProxy.updateMatrixWorld(true);
  };
  const bandDragStart = () => {
    bandProxy.updateMatrixWorld(true);
    _bpInv.copy(bandProxy.matrixWorld).invert();
    bandStartMat.clear(); bandStartPins.clear();
    for (const s of bandSel) {
      const o3 = bandObj3d(s);
      o3.updateWorldMatrix(true, false);
      bandStartMat.set(o3, o3.matrixWorld.clone());
      if (s.kind === "figure" && s.o.footPins) bandStartPins.set(s.o,
        Object.fromEntries(Object.entries(s.o.footPins).map(([k, v]) => [k, v ? v.clone() : null])));
    }
  };
  const bandDragApply = () => {
    // Self-seed: if dragging-changed didn't capture the start matrices first (event-order
    // race — the gizmo's drag-start can fire before bandActive() reads true), bandStartMat is
    // empty and every object below would hit `if (!start) continue` → the proxy moves but the
    // objects don't. Seed here so the move always has a baseline (this frame is then a no-op,
    // the next applies the real delta) — the group can never silently fail to follow again.
    if (!bandStartMat.size) bandDragStart();
    bandProxy.updateMatrixWorld(true);
    _bDelta.multiplyMatrices(bandProxy.matrixWorld, _bpInv); // D such that newProxy = D·startProxy
    for (const s of bandSel) {
      const o3 = bandObj3d(s), start = bandStartMat.get(o3);
      if (!start) continue;
      _bM.multiplyMatrices(_bDelta, start); // newWorld = D·startWorld
      _bM.decompose(o3.position, o3.quaternion, o3.scale); // fig.root in scene / props in identity group → world == local
      o3.updateMatrixWorld(true);
      if (s.kind === "figure") { // carry the figure's foot pins along so they don't snap the feet back
        const sp = bandStartPins.get(s.o);
        if (sp) for (const k of Object.keys(sp)) s.o.footPins[k] = sp[k] ? sp[k].clone().applyMatrix4(_bDelta) : null;
      }
    }
  };

  // Screen-space AABB of an object overlaps the marquee rect (client px)?
  const screenAabbHit = (object3d, minX, minY, maxX, maxY) => {
    _bBox.setFromObject(object3d);
    if (_bBox.isEmpty()) return false;
    const cr = canvas.getBoundingClientRect();
    let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity, anyFront = false;
    for (let i = 0; i < 8; i++) {
      _bV.set(i & 1 ? _bBox.max.x : _bBox.min.x, i & 2 ? _bBox.max.y : _bBox.min.y, i & 4 ? _bBox.max.z : _bBox.min.z);
      _bV.project(camera);
      if (_bV.z < 1) anyFront = true; // at least one corner is in front of the camera
      const sx = (_bV.x * 0.5 + 0.5) * cr.width + cr.left;
      const sy = (-_bV.y * 0.5 + 0.5) * cr.height + cr.top;
      sMinX = Math.min(sMinX, sx); sMaxX = Math.max(sMaxX, sx);
      sMinY = Math.min(sMinY, sy); sMaxY = Math.max(sMaxY, sy);
    }
    if (!anyFront) return false;
    return !(sMaxX < minX || sMinX > maxX || sMaxY < minY || sMinY > maxY);
  };
  const collectBandHits = (minX, minY, maxX, maxY) => {
    const hits = [];
    for (const f of figures) if (screenAabbHit(f.root, minX, minY, maxX, maxY)) hits.push({ kind: "figure", o: f });
    for (const m of propsGroup.children) if (screenAabbHit(m, minX, minY, maxX, maxY)) hits.push({ kind: "prop", o: m });
    return hits;
  };

  // Establish the multi-selection. 0 → clear; 1 → defer to normal single-select so the
  // gizmo/panels behave exactly as a click; ≥2 → proxy gizmo at the median.
  const selectBand = (list) => {
    clearBand();
    detachGizmo();
    if (!list.length) { requestRender(); return; }
    if (list.length === 1) {
      const s = list[0];
      if (s.kind === "figure") selectFigure(s.o); else selectProp(s.o);
      requestRender();
      return;
    }
    for (const s of list) bandSel.push(s); // membership alone outlines them (screen-space pass)
    placeBandProxy();
    transformControls.setMode(figureMode === "rotate" ? "rotate" : "translate");
    transformControls.setSpace("world");
    transformControls.attach(bandProxy);
    updatePropUI(); updateFigureUI();
    requestRender();
  };

  // Delete every object in the multi-selection (props + figures, never the last figure).
  const removeBandProp = (mesh) => {
    if (transformControls.object === mesh) transformControls.detach();
    removeAttachmentsFor(mesh);
    propsGroup.remove(mesh);
    disposeProp(mesh); // model = traverse-dispose; primitive = single geometry (shared material kept)
  };
  const deleteBand = () => {
    const props = bandSel.filter((s) => s.kind === "prop").map((s) => s.o);
    const figs = bandSel.filter((s) => s.kind === "figure").map((s) => s.o);
    clearBand(); // drop highlights + detach the proxy before mutating the scene
    for (const m of props) removeBandProp(m);
    for (const f of figs) if (figures.length > 1) removeFigure(f, { capture: false });
    requestRender();
    captureAndUpload(node);
  };

  // Marquee rectangle (a CSS overlay, never WebGL — the three.js SelectionHelper trick).
  const marquee = document.createElement("div");
  marquee.style.cssText =
    "position:absolute;border:1px solid #55aaff;background:rgba(75,160,255,0.18);" +
    "z-index:6;pointer-events:none;display:none;";
  container.appendChild(marquee);
  const band = { active: false, x0: 0, y0: 0 };
  const beginBand = (e) => {
    band.active = true; band.x0 = e.clientX; band.y0 = e.clientY;
    controls.enabled = false;
    transformControls.enabled = false; // gizmo inert during the band drag
    const r = container.getBoundingClientRect();
    marquee.style.left = (e.clientX - r.left) + "px";
    marquee.style.top = (e.clientY - r.top) + "px";
    marquee.style.width = "0px"; marquee.style.height = "0px";
    marquee.style.display = "block";
    canvas.setPointerCapture?.(e.pointerId);
  };
  const updateBand = (e) => {
    const r = container.getBoundingClientRect();
    marquee.style.left = (Math.min(band.x0, e.clientX) - r.left) + "px";
    marquee.style.top = (Math.min(band.y0, e.clientY) - r.top) + "px";
    marquee.style.width = Math.abs(e.clientX - band.x0) + "px";
    marquee.style.height = Math.abs(e.clientY - band.y0) + "px";
  };
  // Object (figure/prop) under the cursor, no selection side effects — the
  // additive Shift-click picker. Props first, same precedence as pickAtPointer.
  const pickObjectAt = (e) => {
    setPointer(e);
    const propHit = raycaster.intersectObjects(propsGroup.children, true)[0];
    const propObj = propHit && propRootOf(propHit.object);
    if (propObj) return { kind: "prop", o: propObj };
    const hit = raycaster.intersectObjects(figures.flatMap((f) => f.meshes), true)[0];
    const fig = hit ? figures.find((f) => f.meshes.includes(hit.object)) : null;
    return fig ? { kind: "figure", o: fig } : null;
  };
  // The live selection as a band-style list, whatever form it currently takes.
  const currentSelectionList = () => {
    if (bandSel.length) return bandSel.map((s) => ({ kind: s.kind, o: s.o }));
    if (selectedFigure) return [{ kind: "figure", o: selectedFigure }];
    if (selectedProp) return [{ kind: "prop", o: selectedProp }];
    return [];
  };
  // ── Object grouping ──────────────────────────────────────────────────────────
  // A group is just a shared `groupId` tag on props. They stay FLAT children of
  // propsGroup, so serialization-by-index, 🔗 attachments and per-prop mask ownership
  // all keep working untouched. Clicking any member selects the whole group as a band
  // multi-selection → the existing bandProxy moves them together. Combining a group to
  // a mannequin attaches EVERY member, so the whole group lands in that figure's mask.
  let groupIdSeq = 1;
  const groupMembers = (gid) => gid ? propsGroup.children.filter((m) => m.userData.groupId === gid) : [];
  const selectionProps = () => currentSelectionList().filter((s) => s.kind === "prop").map((s) => s.o);
  const selectionGroupIds = () => new Set(selectionProps().map((m) => m.userData.groupId).filter(Boolean));
  // Click selection that respects groups: a member selects its whole group.
  const selectPropOrGroup = (mesh) => {
    const mem = groupMembers(mesh?.userData?.groupId);
    if (mem.length > 1) { selectBand(mem.map((o) => ({ kind: "prop", o }))); return; }
    selectProp(mesh);
  };
  const groupSelection = () => {
    const props = selectionProps();
    if (props.length < 2) { showClipToast("select 2 or more objects to group (Shift-click or drag a box)", true); return; }
    const gid = "g" + (groupIdSeq++);
    for (const m of props) m.userData.groupId = gid;
    selectBand(props.map((o) => ({ kind: "prop", o })));
    requestRender(); captureAndUpload(node);
    showClipToast(`grouped ${props.length} objects · Ctrl+Shift+G to ungroup`);
  };
  const ungroupSelection = () => {
    const gids = selectionGroupIds();
    if (!gids.size) { showClipToast("no group selected", true); return; }
    let n = 0;
    for (const m of propsGroup.children) if (gids.has(m.userData.groupId)) { m.userData.groupId = null; n++; }
    requestRender(); captureAndUpload(node);
    showClipToast(`ungrouped ${n} objects`);
  };
  // Arm a pick whose target attaches EVERY group member — they ride the leader AND all
  // enter its region mask (resolved per-prop in captureRegionMasks via the 🔗 chain).
  const combineGroupToTarget = () => {
    const props = selectionProps();
    if (!props.length) return;
    pinPickGroup = props.slice(); pinPickProp = null; pinPickJointIndex = null;
    transformControls.enabled = false; // gizmo inert while waiting to pick the target
    requestRender();
    showClipToast("🔗 click a hand / joint / prop to combine the group to — Esc to cancel");
  };
  const endBand = (e) => {
    if (!band.active) return;
    band.active = false;
    marquee.style.display = "none";
    controls.enabled = true;
    transformControls.enabled = true;
    try { canvas.releasePointerCapture?.(e.pointerId); } catch {}
    const minX = Math.min(band.x0, e.clientX), maxX = Math.max(band.x0, e.clientX);
    const minY = Math.min(band.y0, e.clientY), maxY = Math.max(band.y0, e.clientY);
    if (maxX - minX < 3 && maxY - minY < 3) {
      // Shift-CLICK (no drag) = additive toggle, the Blender convention: add the
      // object under the cursor to the selection, or drop it if already in.
      // Empty space keeps the selection (plain click already deselects).
      const hit = pickObjectAt(e);
      if (hit) {
        const list = currentSelectionList();
        const i = list.findIndex((s) => s.o === hit.o);
        if (i >= 0) list.splice(i, 1); else list.push(hit);
        selectBand(list);
      }
      requestRender();
      return;
    }
    selectBand(collectBandHits(minX, minY, maxX, maxY));
  };

  // Whole-figure transform panel — shown while a person is selected as an object (no
  // prop, no joint). Mirrors the prop panel: move / rotate the whole person, or remove
  // it. Top-right, sharing the slot with the prop panel and hand/foot picker — all are
  // selection-contextual and mutually exclusive, so only one ever shows.
  // ── shoes ───────────────────────────────────────────────────────────────────
  // Per-figure toggle that puts a shoe-shaped mesh on each ankle (parented to the ankle
  // bone, so it follows the foot pose) — covers the bare foot so the depth/control map
  // reads as footwear when generating for shoes. Matte, stays in the capture; serialized.
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x6b6f76, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
  // Shoe STYLES. "procedural" = the built-in extruded shape (no asset, always works); the
  // rest are CC0/CC-BY GLBs (CREDITS) baked into the same canonical unit frame as the
  // procedural shoe so the per-ankle placement below is style-agnostic. Per-style fields:
  //   fwd  = the toe direction in the RAW GLB's own axes (so flipping the sign flips the toe)
  //   up   = the GLB's up axis;  drop = where the ankle sits, as a fraction of shoe height
  //   back = how far behind the ankle the heel sits (unit-length);  mirror = mirror the
  //   width on the LEFT foot (single-foot GLBs read better mirrored into a pair).
  // Only calibrated styles ship: each is fit per-foot from a hand-placed prop (the
  // generic auto-fit GLBs never sat right). procedural is the always-works fallback.
  // New styles get added one at a time as they're calibrated, like boots was.
  const SHOE_STYLES = {
    procedural: { label: "👟 default" },
    // Calibrated from a hand-placed prop (rig-shoes.json): each foot's boot pose in the
    // ankle's rigid frame. CC-BY DanlyVostok. See placeCalibratedShoe.
    boots:      { label: "🥾 boots", fit: {
      ankleR: { prop: "tacticalBootL", offset: [1.183896, -0.041055, -0.098529, 0, -0.090012, -0.480269, -0.881443, 0, -0.009293, 0.878473, -0.477701, 0, 0.018443, 0.10315, 0.04347, 1] },
      ankleL: { prop: "tacticalBootR", offset: [1.183896, 0.041055, 0.098529, 0, 0.090012, -0.480269, -0.881443, 0, 0.009293, 0.878473, -0.477701, 0, -0.018443, 0.10315, 0.04347, 1] },
    } },
    // Heels also set the foot angle (a heel can't sit flat-footed). CC-BY Andrey (Earl_1).
    heels:      { label: "👠 heels",
      ankle: { ankleR: [-0.300556, -0.051419, -0.07434, 0.949471], ankleL: [-0.283384, 0.018363, 0.040812, 0.957962] },
      fit: {
        ankleR: { prop: "heelR", offset: [0.188145, 0.813829, -1.406336, 0, 0.037982, -1.366574, -0.785738, 0, -1.635714, 0.060297, -0.183939, 0, -0.004956, 0.172388, 0.049266, 1.0] },
        ankleL: { prop: "heelL", offset: [-0.320488, 0.774083, -1.404843, 0, -0.013742, -1.382313, -0.758534, 0, -1.643896, -0.145466, 0.29487, 0, 0.001825, 0.177854, 0.046676, 1] },
      } },
    // Sneakers sit flat — per-foot fit only, no ankle pose. CC-BY AntonCla (photoscan).
    sneakers:   { label: "👟 sneakers", fit: {
      ankleR: { prop: "sneakerR", offset: [1.177759, 0.026303, 0.051394, 0, 0.055834, -0.520172, -1.013296, 0, 0.000073, 1.074308, -0.551488, 0, -0.002422, 0.111585, 0.04788, 1] },
      ankleL: { prop: "sneakerL", offset: [1.177692, -0.02835, -0.051855, 0, -0.05714, -0.523426, -1.011546, 0, 0.001379, 1.07248, -0.555034, 0, 0.002623, 0.111738, 0.04751, 1] },
    } },
  };
  // Live calibration overrides (per style) from the 🔧 panel — the blind defaults above need a
  // visual tuning pass per model. styleMeta merges them; the panel reads back the final values.
  const shoeCalib = {};
  const styleMeta = (s) => ({ ...SHOE_STYLES[s], ...(shoeCalib[s] || {}) });
  const shoeLoader = new GLTFLoader();
  const shoeTemplates = {}; // style → Promise<Object3D> (canonical unit-frame template, cloned per foot)
  // Unit procedural shoe: length along +X (0→1 heel→toe), height +Y, width +Z (centred).
  const makeShoeGeo = () => {
    const prof = [[0, -0.45], [1.0, -0.45], [1.0, -0.20], [0.78, 0.0], [0.22, 0.06], [0.0, -0.05]];
    const shape = new THREE.Shape();
    shape.moveTo(prof[0][0], prof[0][1]);
    for (let i = 1; i < prof.length; i++) shape.lineTo(prof[i][0], prof[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: false });
    geo.translate(0, 0, -0.21); // centre the width on the foot
    return geo;
  };
  // Reorient + normalize a raw shoe GLB into the procedural shoe's canonical frame: toe along
  // +X with length 1, sole on the floor, ankle origin at (0, 0, 0). Returned as an inner-baked
  // template so the per-foot clone's own transform stays free for the ankle-basis placement.
  const bakeShoeTemplate = (style) => {
    if (shoeTemplates[style]) return shoeTemplates[style];
    const meta = styleMeta(style);
    const url = new URL(`./assets/props/${meta.file}?v=1`, import.meta.url).href;
    shoeTemplates[style] = new Promise((resolve, reject) => {
      shoeLoader.load(url, (gltf) => {
        const inner = gltf.scene;
        inner.traverse((o) => {
          if (!o.isMesh) return;
          o.material = shoeMat;
          if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        });
        const F = new THREE.Vector3().fromArray(meta.fwd).normalize();
        const U = new THREE.Vector3().fromArray(meta.up).normalize();
        if (Math.abs(F.dot(U)) > 0.99) U.set(F.y, F.z, F.x); // guard: Toe∥Up would give a NaN basis
        U.addScaledVector(F, -U.dot(F)).normalize();         // re-orthogonalize up against forward
        const W = new THREE.Vector3().crossVectors(F, U).normalize();
        // Rotate the GLB so (F,U,W) → (X,Y,Z): the inverse of the basis that maps X→F.
        const basis = new THREE.Matrix4().makeBasis(F, U, W);
        const rot = new THREE.Group();
        rot.quaternion.setFromRotationMatrix(basis).invert();
        rot.add(inner);
        rot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(rot);
        const size = box.getSize(new THREE.Vector3());
        const s = 1 / (size.x || 1);                       // forward length → 1 (uniform, keeps aspect)
        const ctrZ = (box.min.z + box.max.z) / 2;
        const baked = new THREE.Group();                   // carries the canonical-frame transform
        baked.scale.setScalar(s);
        baked.position.set(
          -box.min.x * s - meta.back,                      // heel `back` behind the ankle
          (-box.min.y - meta.drop * size.y) * s,           // ankle `drop` up the shoe height
          -ctrZ * s);                                      // width centred
        baked.add(rot);
        const tmpl = new THREE.Group();                    // identity outer; clone's transform = placement
        tmpl.add(baked);
        tmpl.userData = { mirror: !!meta.mirror };
        resolve(tmpl);
      }, undefined, reject);
    });
    return shoeTemplates[style];
  };
  // Calibrated styles place a per-foot boot at an offset captured from a hand-positioned
  // PROP. The offset was captured against the prop loader's NORMALIZED geometry (scaled to
  // `h`, grounded, centred) — so we MUST load the boot through that SAME normalization
  // (loadModelProp). Using the raw GLB changes the baseline and the boot floats. `entry.prop`
  // is the MODEL_PROPS key; the normalized template is cached and cloned per foot.
  const calibPropCache = {};
  const loadCalibProp = (type) => {
    if (!calibPropCache[type]) calibPropCache[type] = loadModelProp(type);
    return calibPropCache[type];
  };
  const _csA = new THREE.Matrix4(), _csRigid = new THREE.Matrix4(), _csOff = new THREE.Matrix4(), _csLocal = new THREE.Matrix4();
  const _csP = new THREE.Vector3(), _csQ = new THREE.Quaternion(), _csS = new THREE.Vector3();
  const placeCalibratedShoe = async (fig, ankleName, entry) => {
    const ankle = fig.joints[ankleName];
    if (!ankle) return;
    const tmpl = await loadCalibProp(entry.prop);  // same normalization the offset was captured against
    if (!fig.shoes) return;                        // toggled off while the GLB was loading
    const shoe = tmpl.clone(true);
    shoe.traverse((o) => { if (o.isMesh) o.material = shoeMat; });
    ankle.updateWorldMatrix(true, false);
    _csA.copy(ankle.matrixWorld); _csA.decompose(_csP, _csQ, _csS);
    _csRigid.compose(_csP, _csQ, _csS.set(1, 1, 1));        // ankle rigid frame (matches leaderRigidMatrix)
    _csOff.fromArray(entry.offset);                         // boot pose in that rigid frame (column-major)
    _csLocal.copy(_csA).invert().multiply(_csRigid).multiply(_csOff); // shoe_world = rigid(ankle)*offset (= where the prop sat)
    shoe.matrixAutoUpdate = false;
    shoe.matrix.copy(_csLocal);
    ankle.add(shoe);
    fig.shoeMeshes.push(shoe);
  };
  const _shoeUp = new THREE.Vector3(), _shoeDir = new THREE.Vector3(), _shoeX = new THREE.Vector3(), _shoeM = new THREE.Matrix4();
  const _xAxis = new THREE.Vector3(1, 0, 0), _zAxis = new THREE.Vector3(0, 0, 1);
  // Compute the ankle-local placement (basis quaternion + foot length) for one shoe, then
  // call `place(mesh, basisM, L, ankle, isLeft)` to parent it. Shared by every style.
  const placeShoe = (fig, ankleName, build) => {
    const ankle = fig.joints[ankleName];
    if (!ankle) return null;
    ankle.updateWorldMatrix(true, false);
    const ball = fig.toes?.[ankleName];
    const toeLocal = ball ? ankle.worldToLocal(ball.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(0, -0.05, 0.22);
    const L = Math.max(0.05, toeLocal.length());
    _shoeDir.copy(toeLocal).normalize();
    _shoeUp.set(0, 1, 0).applyQuaternion(ankle.getWorldQuaternion(new THREE.Quaternion()).invert());
    _shoeUp.addScaledVector(_shoeDir, -_shoeUp.dot(_shoeDir));
    if (_shoeUp.lengthSq() < 1e-6) _shoeUp.set(0, 1, 0);
    _shoeUp.normalize();
    _shoeX.crossVectors(_shoeDir, _shoeUp).normalize();
    _shoeM.makeBasis(_shoeDir, _shoeUp, _shoeX);           // geo X→dir(len), Y→up, Z→width
    const shoe = build(L, ankleName === "ankleL");
    const q = new THREE.Quaternion().setFromRotationMatrix(_shoeM);
    // Optional per-shoe orientation nudges (procedural calibration): roll about the foot's
    // length axis (fixes which way the sole faces), pitch about the width axis (toe up/down).
    const roll = shoe.userData.roll || 0, pitch = shoe.userData.pitch || 0;
    if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(_xAxis, roll));
    if (pitch) q.multiply(new THREE.Quaternion().setFromAxisAngle(_zAxis, pitch));
    shoe.quaternion.copy(q);
    const drop = shoe.userData.drop || 0;
    if (drop) shoe.position.copy(_shoeUp).multiplyScalar(-drop * L); // slide along the sole-up axis
    shoe.userData.isShoe = true;
    ankle.add(shoe);
    fig.shoeMeshes.push(shoe);
    return shoe;
  };
  // Add this figure's shoes in its current style. Procedural is synchronous; GLB styles await
  // the (cached) template, so this is async — callers requestRender/capture when it settles.
  const addShoes = async (fig) => {
    if (!fig) return;
    const style = SHOE_STYLES[fig.shoeStyle] ? fig.shoeStyle : "procedural";
    fig.shoeStyle = style;
    if (fig.shoeMeshes?.length) { fig.shoes = true; return; }
    fig.shoeMeshes = [];
    fig.shoes = true;
    // Which feet get shod — "pair" (both), "L" or "R" only (undressing / half-shod scenes).
    const ankles = fig.shoeScope === "L" ? ["ankleL"]
      : fig.shoeScope === "R" ? ["ankleR"] : ["ankleL", "ankleR"];
    if (style === "procedural") {
      const c = { lenScale: 1, widthScale: 1, drop: 0, roll: 0, pitch: 0, ...(shoeCalib.procedural || {}) };
      for (const ankleName of ankles)
        placeShoe(fig, ankleName, (L) => {
          const m = new THREE.Mesh(makeShoeGeo(), shoeMat);
          m.userData.ownGeo = true;
          m.scale.set(L * c.lenScale, L * c.lenScale, L * c.widthScale);
          m.userData.roll = c.roll; m.userData.pitch = c.pitch; m.userData.drop = c.drop;
          return m;
        });
      requestRender();
      return;
    }
    const fit = SHOE_STYLES[style].fit;
    if (fit) { // hand-calibrated per-foot placement (captured from a positioned prop)
      // Some styles (heels) also carry the foot angle — set it BEFORE placing so the
      // calibrated offset (captured at that angle) lands the shoe correctly.
      const anklePose = SHOE_STYLES[style].ankle;
      if (anklePose) for (const an of ankles) {
        if (anklePose[an] && fig.joints[an]) fig.joints[an].quaternion.fromArray(anklePose[an]);
      }
      for (const ankleName of ankles) {
        if (fit[ankleName]) await placeCalibratedShoe(fig, ankleName, fit[ankleName]);
      }
      requestRender();
      return;
    }
    let tmpl;
    try { tmpl = await bakeShoeTemplate(style); }
    catch (e) { console.error("[PromptChain] shoe style failed, using procedural", style, e); fig.shoeStyle = "procedural"; if (fig.shoes) await addShoes(fig); return; }
    if (!fig.shoes || fig.shoeStyle !== style) return;     // toggled off / style changed mid-load
    const k = (styleMeta(style).lenScale || 1);            // overall size relative to foot length
    for (const ankleName of ankles)
      placeShoe(fig, ankleName, (L, isLeft) => {
        const m = tmpl.clone(true);
        const w = (isLeft && tmpl.userData.mirror) ? -L * k : L * k; // mirror single-foot GLB into a pair
        m.scale.set(L * k, L * k, w);
        return m;
      });
    requestRender();
  };
  const removeShoes = (fig) => {
    // Only procedural shoes own their geometry; GLB clones share the cached template's, so
    // disposing it would break every other figure's shoes and the template itself.
    for (const s of fig?.shoeMeshes || []) { s.parent?.remove(s); s.traverse?.((o) => { if (o.userData?.ownGeo) o.geometry?.dispose?.(); }); }
    if (fig) { fig.shoeMeshes = []; fig.shoes = false; }
  };
  const restoreShoes = (fig, data) => {
    const want = data?.shoes;
    if (want) {
      // New saves store {style, scope}; old saves stored just the style string (= pair).
      if (typeof want === "object") { fig.shoeStyle = want.style || "procedural"; fig.shoeScope = want.scope || "pair"; }
      else { fig.shoeStyle = (typeof want === "string") ? want : "procedural"; fig.shoeScope = "pair"; }
      addShoes(fig);
    } else removeShoes(fig);
  };
  const setShoeStyle = (fig, style) => {
    if (!fig || !SHOE_STYLES[style]) return;
    fig.shoeStyle = style;
    if (!fig.shoes) return;
    removeShoes(fig);
    fig.shoes = true;
    addShoes(fig).then(() => captureAndUpload(node));
  };
  const setShoeScope = (fig, scope) => {
    if (!fig) return;
    fig.shoeScope = scope;
    if (!fig.shoes) return;
    removeShoes(fig);
    fig.shoes = true;
    addShoes(fig).then(() => captureAndUpload(node));
  };
  const toggleShoes = (fig) => {
    if (!fig) return;
    if (fig.shoes) { removeShoes(fig); requestRender(); captureAndUpload(node); }
    else {
      // sneakers are the default — "procedural" lives on only through old saves
      if (!fig.shoeStyle || fig.shoeStyle === "procedural") fig.shoeStyle = "sneakers";
      addShoes(fig).then(() => captureAndUpload(node));
    }
  };
  // Drop the cached template so the next build re-bakes with the latest calibration, then
  // rebuild the live shod figure(s). Used by the 🔧 panel while tuning a style's orientation.
  const recalibrateShoe = (style) => {
    delete shoeTemplates[style];
    if (selectedFigure?.shoes && selectedFigure.shoeStyle === style) setShoeStyle(selectedFigure, style);
  };

  const figurePanel = document.createElement("div");
  figurePanel.style.cssText =
    "position:absolute;top:6px;right:6px;z-index:3;display:none;gap:3px;" +
    "background:rgba(20,20,26,0.82);border:1px solid #4a4a55;border-radius:5px;padding:3px 4px;";
  figurePanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  // (Move/rotate live in the left transform group now — not repeated here.)
  // Full-body pose presets — bundled BODY_POSES (shipped in code, human rig)
  // overlaid by USER poses from user/PromptChain/poses/*.json: same name = the
  // user's version wins (the templates/prompts delta model). The list filters
  // to the selected figure's rig kind, so horse poses never offer to a person.
  // "💾 save pose…" captures the selected figure's current pose to the user
  // layer, so the dropdown grows without a code round-trip. Hidden on capsule
  // figures (captured quats only fit GLB rigs).
  const bodyPoseSelect = document.createElement("select");
  bodyPoseSelect.title = "Apply a ready-made pose to this person — or save the current one";
  bodyPoseSelect.style.cssText =
    "font:11px system-ui,sans-serif;background:#2a2a35;color:#ccd;" +
    "border:1px solid #4a4a55;border-radius:4px;padding:1px 3px;cursor:pointer;max-width:110px;";
  bodyPoseSelect.addEventListener("pointerdown", (e) => e.stopPropagation());
  figurePanel.appendChild(bodyPoseSelect);
  let userPoses = {}; // name -> {rig, pose} — the user layer, fetched once + updated on save
  const rigKindOf = (f) => FIGURE_LIBRARY[bodyKeyOf(f?.body)]?.rig || "human";
  const poseEntriesFor = (kind) => {
    const merged = {};
    for (const [n, p] of Object.entries(BODY_POSES)) merged[n] = { rig: "human", pose: p };
    for (const [n, e] of Object.entries(userPoses)) merged[n] = e; // user shadows bundled by name
    return Object.entries(merged).filter(([, e]) => e.rig === kind).sort(([a], [b]) => a.localeCompare(b));
  };
  let poseOptionsKind = null; // rig kind the options were last built for
  const rebuildPoseOptions = () => {
    const kind = rigKindOf(selectedFigure);
    bodyPoseSelect.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = ""; ph.textContent = "🤸 pose"; ph.disabled = true; ph.selected = true;
    bodyPoseSelect.appendChild(ph);
    for (const [name] of poseEntriesFor(kind)) {
      const o = document.createElement("option");
      o.value = name; o.textContent = name;
      bodyPoseSelect.appendChild(o);
    }
    const save = document.createElement("option");
    save.value = "__save__"; save.textContent = "💾 save pose…";
    bodyPoseSelect.appendChild(save);
    poseOptionsKind = kind;
  };
  const refreshUserPoses = async () => {
    try {
      const resp = await api.fetchApi("/promptchain/pose-presets/list");
      const data = await resp.json();
      userPoses = {};
      for (const p of data.poses || []) userPoses[p.name] = { rig: p.rig || "human", pose: p.pose };
    } catch (e) { console.warn("[PoseStudio] user poses unavailable:", e?.message || e); }
    rebuildPoseOptions();
  };
  refreshUserPoses();
  // Save flow: a naming modal (styled like the sidebar's rename modal) prompts for
  // the pose name. A pose is named by display name — the server slugifies it to one
  // <slug>.json file — so the name must be UNIQUE among the user's saved poses, or
  // the write would silently clobber an earlier pose. A clash is reported inline
  // (error line + highlighted field) and the modal stays open. Reusing a *bundled*
  // pose's name is still allowed: that writes a user file which SHADOWS the bundled
  // pose (the existing delta-overlay behaviour) and never overwrites a user file.
  // Portaled to <body> so the viewport's overflow:hidden can't clip it; raised above
  // this poser's fullscreen layer.
  let poseSaveFig = null;   // captured at open — the selection can change under the async save
  let poseSaveModal = null; // built lazily on first save (after the teardown chain is in place)
  const roundQuatMap = (map) => {
    const out = {};
    for (const [n, q] of Object.entries(map || {})) out[n] = q.map((v) => Math.round(v * 1e4) / 1e4);
    return out;
  };
  // Mirror the server's slug so two display names that map to one file ("My Pose"
  // vs "my pose") are caught as the same saved pose before the round-trip.
  const poseSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const closePoseSave = () => {
    poseSaveFig = null;
    if (poseSaveModal) poseSaveModal.backdrop.style.display = "none";
  };
  const commitPoseSave = async (name) => {
    const fig = poseSaveFig;
    if (!fig) return;
    const data = serializeFigure(fig);
    const pose = { joints: roundQuatMap(data.joints), spine: roundQuatMap(data.spine), digits: roundQuatMap(data.digits) };
    const rig = rigKindOf(fig);
    poseSaveModal.setBusy(true);
    try {
      const resp = await api.fetchApi("/promptchain/pose-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rig, pose }),
      });
      const res = await resp.json().catch(() => ({}));
      poseSaveModal.setBusy(false);
      if (resp.status === 409) { // a parallel tab/process wrote this name after our pre-check
        await refreshUserPoses();
        poseSaveModal.showError(res.error || `A pose named "${name}" already exists`);
        return;
      }
      if (!resp.ok || res.error) throw new Error(res.error || `save failed (${resp.status})`);
      userPoses[name] = { rig, pose };
      rebuildPoseOptions();
      closePoseSave();
      showClipToast(`pose "${name}" saved`);
    } catch (e) {
      poseSaveModal.setBusy(false);
      poseSaveModal.showError("save failed — " + (e.message || e));
    }
  };
  const attemptPoseSave = () => {
    if (!poseSaveFig) { closePoseSave(); return; }
    const name = poseSaveModal.input.value.trim();
    if (!name) { poseSaveModal.showError("Enter a name for this pose"); return; }
    const slug = poseSlug(name);
    if (Object.keys(userPoses).some((n) => poseSlug(n) === slug)) {
      poseSaveModal.showError(`A pose named "${name}" already exists — choose a unique name`);
      return;
    }
    commitPoseSave(name);
  };
  const buildPoseSaveModal = () => {
    const backdrop = document.createElement("div");
    backdrop.className = "pcr-pose-save-backdrop";
    backdrop.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;" +
      "background:rgba(0,0,0,0.6);font:14px system-ui,sans-serif;";
    const dialog = document.createElement("div");
    dialog.style.cssText =
      "min-width:320px;max-width:480px;background:#262626;border:1px solid #3a3a3a;border-radius:8px;" +
      "box-shadow:0 8px 32px rgba(0,0,0,0.5);";
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #3a3a3a;";
    const title = document.createElement("span");
    title.textContent = "Save Pose";
    title.style.cssText = "font-size:16px;font-weight:600;color:#fff;";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.title = "Close";
    closeBtn.style.cssText = "width:28px;height:28px;padding:0;background:transparent;border:none;border-radius:4px;color:#888;cursor:pointer;font-size:15px;line-height:1;";
    closeBtn.addEventListener("mouseenter", () => { closeBtn.style.background = "rgba(255,255,255,0.1)"; closeBtn.style.color = "#fff"; });
    closeBtn.addEventListener("mouseleave", () => { closeBtn.style.background = "transparent"; closeBtn.style.color = "#888"; });
    header.append(title, closeBtn);
    const body = document.createElement("div");
    body.style.cssText = "padding:20px;";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 64; // matches the server's 1–64 char limit
    input.placeholder = "Pose name";
    input.style.cssText =
      "width:100%;box-sizing:border-box;padding:10px 12px;background:#1a1a1a;border:1px solid #3a3a3a;" +
      "border-radius:6px;color:#fff;font-size:14px;outline:none;";
    const error = document.createElement("div");
    error.className = "pcr-pose-save-error";
    error.style.cssText = "margin-top:8px;min-height:15px;font-size:12px;color:#ff6b6b;display:none;";
    body.append(input, error);
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid #3a3a3a;";
    const mkFooterBtn = (label, bg, fg) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = `padding:8px 16px;border:none;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;background:${bg};color:${fg};`;
      return b;
    };
    const cancelBtn = mkFooterBtn("Cancel", "#3a3a3a", "#ccc");
    const confirmBtn = mkFooterBtn("Save", "#973f00", "#fff");
    footer.append(cancelBtn, confirmBtn);
    dialog.append(header, body, footer);
    backdrop.appendChild(dialog);

    const clearError = () => { error.style.display = "none"; input.style.borderColor = input === document.activeElement ? "#dd7634" : "#3a3a3a"; };
    const showError = (msg) => {
      error.textContent = msg;
      error.style.display = "block";
      input.style.borderColor = "#ff6b6b";
      input.focus();
      input.select();
    };
    const setBusy = (busy) => {
      confirmBtn.disabled = cancelBtn.disabled = busy;
      confirmBtn.style.opacity = busy ? "0.6" : "1";
      confirmBtn.style.cursor = busy ? "default" : "pointer";
    };
    input.addEventListener("input", () => { if (error.style.display === "block") clearError(); });
    input.addEventListener("focus", () => { if (error.style.display !== "block") input.style.borderColor = "#dd7634"; });
    input.addEventListener("blur", () => { if (error.style.display !== "block") input.style.borderColor = "#3a3a3a"; });
    backdrop.addEventListener("pointerdown", (e) => e.stopPropagation()); // keep canvas/selection handlers out
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closePoseSave(); }); // click the dim to cancel
    backdrop.addEventListener("keydown", (e) => {
      e.stopPropagation(); // graph/viewport hotkeys must never fire while the modal is up
      if (e.key === "Escape") { e.preventDefault(); closePoseSave(); }
      else if (e.key === "Enter" && e.target === input) { e.preventDefault(); attemptPoseSave(); }
    });
    closeBtn.addEventListener("click", closePoseSave);
    cancelBtn.addEventListener("click", closePoseSave);
    confirmBtn.addEventListener("click", attemptPoseSave);
    document.body.appendChild(backdrop);
    // Ride the portaled-flyout teardown chain so the modal never outlives the node.
    const prevCleanup = node._pcrMenuCleanup;
    node._pcrMenuCleanup = () => { prevCleanup?.(); backdrop.remove(); };

    poseSaveModal = { backdrop, input, showError, clearError, setBusy };
  };
  const openPoseSave = () => {
    poseSaveFig = selectedFigure;
    if (!poseSaveFig) return;
    if (!poseSaveModal) buildPoseSaveModal();
    poseSaveModal.backdrop.style.zIndex = String((node.properties?.pcrFullscreenZ || 10001) + 10); // above this poser's flyout menus
    poseSaveModal.input.value = "";
    poseSaveModal.clearError();
    poseSaveModal.setBusy(false);
    poseSaveModal.backdrop.style.display = "flex";
    requestAnimationFrame(() => { poseSaveModal.input.focus(); poseSaveModal.input.select(); });
  };
  bodyPoseSelect.addEventListener("change", () => {
    const picked = bodyPoseSelect.value;
    bodyPoseSelect.value = "";
    if (!selectedFigure) return;
    if (picked === "__save__") { openPoseSave(); return; }
    const entry = poseEntriesFor(rigKindOf(selectedFigure)).find(([n]) => n === picked);
    if (entry) applyBodyPose(selectedFigure, entry[1].pose);
  });
  // Body-shape toggle — only if the GLB carries morphs. Per-person, so it lives here on
  // the selected-figure panel; the sliders (bottom-right) follow the active figure.
  let figureBodyBtn = null;
  if (bodySliders.length) {
    figureBodyBtn = mkBtn("💪", "Body-shape sliders — height, weight, muscle, breast, hips, glutes", () => {
      bodyPanelOpen = !bodyPanelOpen;
      updateFigureUI();
      requestRender();
    });
    figurePanel.appendChild(figureBodyBtn);
  }
  // Segmented [ L | pair | R ] foot-scope control — which feet wear the shoe (undressing /
  // half-shod scenes). Shown only while shoes are on. `_sync(fig)` updates visibility + the
  // active segment highlight.
  const mkScopeToggle = (getFig, after) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:none;border:1px solid #4a4a55;border-radius:4px;overflow:hidden;";
    wrap.addEventListener("pointerdown", (e) => e.stopPropagation());
    const btns = {};
    const segs = [["L", "L", "Left foot only"], ["pair", "pair", "Both feet"], ["R", "R", "Right foot only"]];
    segs.forEach(([val, label, title], i) => {
      const b = document.createElement("button");
      b.textContent = label; b.title = title;
      b.style.cssText = "font:11px system-ui,sans-serif;background:#2a2a35;color:#ccd;border:0;padding:1px 6px;cursor:pointer;" +
        (i < segs.length - 1 ? "border-right:1px solid #4a4a55;" : "");
      b.addEventListener("click", (e) => { e.stopPropagation(); const f = getFig(); if (f) { setShoeScope(f, val); after(); } });
      btns[val] = b; wrap.appendChild(b);
    });
    wrap._sync = (fig) => {
      wrap.style.display = (fig && fig.shoes) ? "inline-flex" : "none";
      const sc = fig?.shoeScope || "pair";
      for (const [v, b] of Object.entries(btns)) b.style.background = (v === sc) ? "#2e5d44" : "#2a2a35";
    };
    return wrap;
  };
  // Shoes toggle — swap this person's bare feet for a shoe shape (and back).
  const figureShoesBtn = mkBtn("👟", "Toggle shoes on this person's feet (so the depth map reads footwear)", () => {
    if (selectedFigure) { toggleShoes(selectedFigure); updateFigureUI(); }
  });
  figurePanel.appendChild(figureShoesBtn);
  // Sculpt this body — reshape a region freehand when a slider isn't enough (e.g. nudge a
  // breast bigger / fix its shape). Hidden for skin-bound figures (reshaping under a bound
  // mesh distorts it — same v1 limit as the body sliders).
  const figureSculptBtn = mkBtn("🗿", "Sculpt this body — grab / inflate / smooth a region (e.g. nudge a breast bigger when the slider isn't enough)", () => {
    if (!selectedFigure) return;
    if (sculpt.active) exitSculpt(); else enterSculpt("figure", selectedFigure);
  });
  figurePanel.appendChild(figureSculptBtn);
  container.appendChild(figurePanel);
  // (The 🔧 calibration button and 🗑 are gone from this panel: calibration was
  // a dev tool — the panel code stays for future style fitting — and deletion
  // lives on the Del key / cut. The wrench's openShoeCalib hooks stay wired
  // but nothing opens it.)
  let openShoeCalib = () => {};
  let shoeCalibOpen = false;
  const shoesCalibAvail = () => !!selectedFigure?.shoes;
  // Shoe OPTIONS live in a bottom-right panel (like the 💪 sliders): style
  // picker + which-feet scope, shown while the selected figure wears shoes.
  // "procedural" is deliberately absent from the picker — sneakers are the
  // default; old saves with procedural shoes still restore it.
  const shoeStyleSelect = document.createElement("select");
  shoeStyleSelect.title = "Shoe style";
  shoeStyleSelect.style.cssText =
    "font:11px system-ui,sans-serif;background:#2a2a35;color:#ccd;" +
    "border:1px solid #4a4a55;border-radius:4px;padding:1px 3px;cursor:pointer;max-width:96px;";
  shoeStyleSelect.addEventListener("pointerdown", (e) => e.stopPropagation());
  for (const [key, def] of Object.entries(SHOE_STYLES)) {
    if (key === "procedural") continue;
    const o = document.createElement("option");
    o.value = key; o.textContent = def.label;
    shoeStyleSelect.appendChild(o);
  }
  shoeStyleSelect.addEventListener("change", () => {
    if (selectedFigure) { setShoeStyle(selectedFigure, shoeStyleSelect.value); updateFigureUI(); }
  });
  const figureScopeToggle = mkScopeToggle(() => selectedFigure, () => updateFigureUI());
  // ✕ = barefoot — the discoverable "off" right where the options are (the 👟
  // toggle on the top panel also works, but nothing down here said so).
  const shoeOffBtn = mkBtn("✕", "Remove the shoes (barefoot)", () => {
    if (selectedFigure?.shoes) { toggleShoes(selectedFigure); updateFigureUI(); }
  });
  shoeOffBtn.style.width = "22px";
  shoeOffBtn.style.height = "22px";
  const shoePanel = document.createElement("div");
  shoePanel.style.cssText =
    "position:absolute;bottom:6px;right:6px;z-index:3;display:none;gap:4px;align-items:center;" +
    "background:rgba(20,20,26,0.82);border:1px solid #4a4a55;border-radius:5px;padding:3px 4px;";
  shoePanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  shoePanel.append(shoeStyleSelect, figureScopeToggle, shoeOffBtn);
  container.appendChild(shoePanel);
  updateFigureUI = () => {
    figurePanel.style.display = selectedFigure ? "flex" : "none";
    figureSculptBtn.style.display = (selectedFigure && !selectedFigure.skinBind) ? "" : "none"; // bound meshes reshape via sliders only
    updateToolUI(); // the left transform group reflects this selection's mode
    bodyPoseSelect.style.display = selectedFigure?.skel ? "" : "none"; // captured quats fit GLB rigs only
    if (selectedFigure && rigKindOf(selectedFigure) !== poseOptionsKind) rebuildPoseOptions(); // human↔creature swap relists
    figureShoesBtn.style.background = (selectedFigure && selectedFigure.shoes) ? "#2e5d44" : "#2a2a35";
    const shoeVisible = !!(selectedFigure && selectedFigure.shoes);
    shoePanel.style.display = shoeVisible ? "flex" : "none";
    if (shoeVisible) {
      const st = selectedFigure.shoeStyle;
      shoeStyleSelect.value = (SHOE_STYLES[st] && st !== "procedural") ? st : "sneakers";
    }
    figureScopeToggle._sync(selectedFigure);
    // Body sliders belong to the selected figure: shown only while one is selected and
    // the 💪 toggle is on (sticky across selections, like a property panel).
    if (figureBodyBtn) figureBodyBtn.style.background = (selectedFigure && bodyPanelOpen) ? "#2e5d44" : "#2a2a35";
    // skin-bound figures hide sliders (v1 limit — reshaping under a bound mesh
    // distorts it; same family as the hidden hand/foot presets when bound)
    bodyPanel.style.display = (selectedFigure && bodyPanelOpen && !selectedFigure.skinBind) ? "block" : "none";
    // both bottom-right panels can be open at once — the sliders sit above the shoe row
    bodyPanel.style.bottom = shoeVisible ? "38px" : "6px";
  };

  // Foot-context shoe controls — the same toggle + style picker as the figure panel, but
  // surfaced when an ANKLE is selected (how users actually reach for footwear). Operates on
  // the active figure (rig), which owns the selected ankle. Sits under the foot-pose dropdown.
  const footShoePanel = document.createElement("div");
  footShoePanel.style.cssText =
    "position:absolute;top:36px;right:6px;z-index:3;display:none;gap:3px;align-items:center;" +
    "background:rgba(20,20,26,0.82);border:1px solid #4a4a55;border-radius:5px;padding:3px 4px;";
  footShoePanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  const footShoeBtn = mkBtn("👟", "Put shoes on this person's feet (so the depth map reads footwear)", () => {
    toggleShoes(rig); updateFootShoeUI();
  });
  const footShoeSelect = document.createElement("select");
  footShoeSelect.title = "Shoe style";
  footShoeSelect.style.cssText =
    "display:none;font:11px system-ui,sans-serif;background:#2a2a35;color:#ccd;" +
    "border:1px solid #4a4a55;border-radius:4px;padding:1px 3px;cursor:pointer;max-width:96px;";
  footShoeSelect.addEventListener("pointerdown", (e) => e.stopPropagation());
  for (const [key, def] of Object.entries(SHOE_STYLES)) {
    if (key === "procedural") continue; // hidden from pickers; legacy saves still restore it
    const o = document.createElement("option");
    o.value = key; o.textContent = def.label;
    footShoeSelect.appendChild(o);
  }
  footShoeSelect.addEventListener("change", () => { setShoeStyle(rig, footShoeSelect.value); updateFootShoeUI(); });
  const footScopeToggle = mkScopeToggle(() => rig, () => updateFootShoeUI());
  footShoePanel.append(footShoeBtn, footShoeSelect, footScopeToggle);
  container.appendChild(footShoePanel);
  updateFootShoeUI = () => {
    const isFoot = selectedJointName?.startsWith("ankle") && rig.toes?.[selectedJointName];
    footShoePanel.style.display = isFoot ? "flex" : "none";
    if (!isFoot) return;
    footShoeBtn.style.background = rig.shoes ? "#2e5d44" : "#2a2a35";
    footShoeSelect.style.display = rig.shoes ? "inline-block" : "none";
    if (rig.shoes) {
      const st = rig.shoeStyle;
      footShoeSelect.value = (SHOE_STYLES[st] && st !== "procedural") ? st : "sneakers";
    }
    footScopeToggle._sync(rig);
  };

  // ── shoe-calibration overlay ────────────────────────────────────────────────
  // Live controls for the selected shoe style — GLB styles expose model-axis orientation,
  // the procedural shoe exposes roll/pitch/scale. Edits write into shoeCalib[style], rebuild
  // the shod feet so you SEE the change, and the readout is the line to paste back to Claude
  // so the dialed-in values become the baked defaults.
  const AXES = [["+x", [1, 0, 0]], ["-x", [-1, 0, 0]], ["+y", [0, 1, 0]], ["-y", [0, -1, 0]], ["+z", [0, 0, 1]], ["-z", [0, 0, -1]]];
  const vecToAxis = (v) => (AXES.find(([, a]) => a[0] === v[0] && a[1] === v[1] && a[2] === v[2]) || AXES[0])[0];
  const axisToVec = (k) => (AXES.find(([n]) => n === k) || AXES[0])[1].slice();
  const shoeCalibPanel = document.createElement("div");
  shoeCalibPanel.style.cssText =
    "position:absolute;left:6px;bottom:42px;z-index:4;display:none;flex-direction:column;gap:4px;width:210px;" +
    "background:rgba(18,18,24,0.94);border:1px solid #4a4a55;border-radius:6px;padding:7px 8px;" +
    "font:11px system-ui,sans-serif;color:#ccd;";
  shoeCalibPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  shoeCalibPanel.addEventListener("wheel", (e) => e.stopPropagation());
  const calibRow = (label, ctrl) => {
    const r = document.createElement("div");
    r.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;";
    const l = document.createElement("span"); l.textContent = label; l.style.opacity = "0.85";
    r.append(l, ctrl); shoeCalibPanel.appendChild(r); return r;
  };
  const mkAxisSel = () => {
    const s = document.createElement("select");
    s.style.cssText = "background:#2a2a35;color:#ccd;border:1px solid #4a4a55;border-radius:4px;font:11px system-ui;padding:1px 3px;";
    for (const [n] of AXES) { const o = document.createElement("option"); o.value = n; o.textContent = n; s.appendChild(o); }
    return s;
  };
  const mkNum = (min, max, step) => {
    const n = document.createElement("input");
    n.type = "number"; n.min = min; n.max = max; n.step = step;
    n.style.cssText = "width:64px;background:#2a2a35;color:#ccd;border:1px solid #4a4a55;border-radius:4px;font:11px system-ui;padding:1px 3px;";
    return n;
  };
  const R2D = 180 / Math.PI; // D2R already declared above (skeletal-morph helpers)
  const procDefaults = { lenScale: 1, widthScale: 1, drop: 0, roll: 0, pitch: 0 };
  const calTitle = document.createElement("div");
  calTitle.style.cssText = "font-weight:600;opacity:0.9;margin-bottom:1px;";
  shoeCalibPanel.appendChild(calTitle);
  // GLB-style rows (real shoe meshes — orientation is a fixed model axis).
  const calToe = mkAxisSel(); const rToe = calibRow("Toe points →", calToe);
  const calUp = mkAxisSel(); const rUp = calibRow("Up ↑", calUp);
  const calBack = mkNum(-0.4, 0.6, 0.02); const rBack = calibRow("Heel set-back", calBack);
  const calMirror = document.createElement("input"); calMirror.type = "checkbox";
  const rMirror = calibRow("Mirror L/R", calMirror);
  // Procedural rows (auto-oriented to the foot — nudge orientation + proportions).
  const calWidth = mkNum(0.3, 3, 0.05); const rWidth = calibRow("Width ×", calWidth);
  const calRoll = mkNum(-180, 180, 5); const rRoll = calibRow("Roll °", calRoll);
  const calPitch = mkNum(-90, 90, 5); const rPitch = calibRow("Pitch °", calPitch);
  // Shared rows.
  const calDrop = mkNum(-0.5, 1, 0.02); const rDrop = calibRow("Ankle drop", calDrop);
  const calLen = mkNum(0.3, 3, 0.05); const rLen = calibRow("Length ×", calLen);
  const calOut = document.createElement("textarea");
  calOut.readOnly = true; calOut.rows = 3;
  calOut.style.cssText = "width:100%;box-sizing:border-box;background:#11131a;color:#9fd0a0;border:1px solid #3a3a45;" +
    "border-radius:4px;font:10px ui-monospace,monospace;resize:none;margin-top:2px;";
  const calHint = document.createElement("div");
  calHint.style.cssText = "opacity:0.7;font-size:10px;line-height:1.3;";
  calHint.textContent = "Dial until it fits, then paste this line back to Claude.";
  shoeCalibPanel.append(calOut, calHint);
  container.appendChild(shoeCalibPanel);

  const procCalib = () => ({ ...procDefaults, ...(shoeCalib.procedural || {}) });
  const refreshCalibReadout = () => {
    const style = selectedFigure?.shoeStyle;
    if (!style) return;
    if (style === "procedural") {
      const c = procCalib();
      calOut.value = `procedural shoe: lenScale ${c.lenScale}, widthScale ${c.widthScale}, ` +
        `drop ${c.drop}, roll ${Math.round(c.roll * R2D)}°, pitch ${Math.round(c.pitch * R2D)}°`;
    } else {
      const m = styleMeta(style);
      if (!m.fwd) { calOut.value = `${style}: hand-calibrated per-foot fit (positioned prop)`; return; }
      const len = (m.lenScale && m.lenScale !== 1) ? `, lenScale: ${m.lenScale}` : "";
      calOut.value = `${style}: fwd: [${m.fwd.join(", ")}], up: [${m.up.join(", ")}], ` +
        `drop: ${m.drop}, back: ${m.back}, mirror: ${!!m.mirror}${len}`;
    }
  };
  const applyCalib = () => {
    const style = selectedFigure?.shoeStyle;
    if (!style) return;
    if (style === "procedural") {
      shoeCalib.procedural = {
        lenScale: parseFloat(calLen.value), widthScale: parseFloat(calWidth.value),
        drop: parseFloat(calDrop.value),
        roll: parseFloat(calRoll.value) * D2R, pitch: parseFloat(calPitch.value) * D2R,
      };
    } else {
      shoeCalib[style] = {
        fwd: axisToVec(calToe.value), up: axisToVec(calUp.value),
        drop: parseFloat(calDrop.value), back: parseFloat(calBack.value),
        lenScale: parseFloat(calLen.value), mirror: calMirror.checked,
      };
    }
    recalibrateShoe(style);
    refreshCalibReadout();
  };
  for (const c of [calToe, calUp, calMirror]) c.addEventListener("change", applyCalib);
  for (const c of [calWidth, calRoll, calPitch, calBack, calDrop, calLen]) c.addEventListener("input", applyCalib);
  openShoeCalib = () => {
    const show = shoeCalibOpen && shoesCalibAvail();
    shoeCalibPanel.style.display = show ? "flex" : "none";
    if (!show) return;
    const style = selectedFigure.shoeStyle, proc = style === "procedural";
    for (const r of [rToe, rUp, rBack, rMirror]) r.style.display = proc ? "none" : "flex";
    for (const r of [rWidth, rRoll, rPitch]) r.style.display = proc ? "flex" : "none";
    if (proc) {
      const c = procCalib();
      calTitle.textContent = "🔧 default shoe fit";
      calLen.value = c.lenScale; calWidth.value = c.widthScale; calDrop.value = c.drop;
      calRoll.value = Math.round(c.roll * R2D); calPitch.value = Math.round(c.pitch * R2D);
    } else {
      const m = styleMeta(style);
      calTitle.textContent = `🔧 ${SHOE_STYLES[style].label} fit`;
      if (!m.fwd) { // calibrated style: no editable axis/offset rows, just the readout
        for (const r of [rToe, rUp, rBack, rMirror, rWidth, rRoll, rPitch, rDrop, rLen]) r.style.display = "none";
        refreshCalibReadout();
        return;
      }
      calToe.value = vecToAxis(m.fwd); calUp.value = vecToAxis(m.up);
      calDrop.value = m.drop; calBack.value = m.back; calLen.value = m.lenScale || 1; calMirror.checked = !!m.mirror;
    }
    refreshCalibReadout();
  };

  // Spawn dropdown in the strip — shows a single ➕ glyph closed, the named prop list
  // when opened (resets to ➕ after each pick).
  // Prop picker — a custom flyout menu (replaces a flat <select>) so the growing model
  // library tucks into a "Library ▸" submenu instead of one long list. Categories map
  // the MODEL_PROPS keys into groups; anything not listed here just won't appear.
  const PROP_LIBRARY = [
    { cat: "Furniture", items: ["desk", "chair", "table", "tableRound", "stool", "bench", "bookcase", "sofa", "sideTable", "bed", "stairs"] },
    { cat: "Classroom", items: ["schoolDeskSet"] },
    { cat: "Handheld", items: ["sword", "dagger", "spear", "bow", "shield", "axe", "hammer", "pickaxe", "shovel", "gun", "guitar", "book", "key", "bag", "bottle", "cup", "mug", "wineglass"] },
    { cat: "Vehicles", items: ["carSedan", "carSuv", "van", "truck", "kart", "motorcycle", "bicycle", "scooter", "skateboard"] },
    { cat: "Environment", items: ["lamppost", "trafficCone", "barrier", "roadSign", "signpost", "fence", "barrel", "crateWood", "chest", "workbench", "campfire", "rock", "tree", "doorway", "windowframe", "pillar", "fountain"] },
    { cat: "Footwear", items: ["tacticalBootR", "tacticalBootL", "heelR", "heelL", "sneakerR", "sneakerL"] },
    { cat: "Articulated", items: ["chainShort", "chainMedium", "chainLong"] }, // procedural posable chains (braids/tails/ropes) — 🦴 per-segment + tip IK
    { cat: "Misc", items: ["crate", "trashcan", "plant"] },
  ];
  // Prop SETS — one library entry that spawns several MODEL_PROPS in a captured
  // arrangement (offsets read from a real scene save). Parts stay individual
  // props: each serializes/moves/deletes on its own after spawn.
  const PROP_SETS = {
    schoolDeskSet: {
      label: "🏫 school desk",
      parts: [
        { type: "schoolDesk", pos: [0, 0, 0.4] }, // desk at the normal prop spawn spot…
        { type: "schoolChair", pos: [0, 0, -0.1706] }, // …chair tucked behind it (master-base-pos-2)
      ],
    },
  };
  const spawnPropSet = (set) => {
    Promise.all(set.parts.map((p) => loadModelProp(p.type))).then((roots) => {
      if (!node._pcrAlive) { roots.forEach(disposeProp); return; }
      roots.forEach((root, i) => {
        root.position.fromArray(set.parts[i].pos);
        propsGroup.add(root);
      });
      selectProp(roots[0]);
      requestRender();
      captureAndUpload(node); // one capture for the whole arrangement
    }).catch((e) => console.error("[PoseStudio] prop set load failed:", e));
  };
  // Portaled to <body> (position:fixed) so the poser viewport's overflow:hidden can't
  // clip them; positioned in viewport coords. z-index sits above the fullscreen
  // container (9998).
  // Fullscreen + menu z-index are per-instance so a poser hosted inside a high
  // modal (the detached Re-pose poser) can still take over the screen. Defaults
  // match the node context: fullscreen 10001 (above the PromptChain node
  // fullscreen 9999), menus just above it. mountDetachedPoser raises both.
  const fsZ = node.properties?.pcrFullscreenZ || 10001;
  const menuZ = fsZ + 9;
  const MENU_CSS = `position:fixed;z-index:${menuZ};display:none;flex-direction:column;min-width:128px;` + // above this poser's fullscreen
    "overflow-y:auto;overflow-x:hidden;background:#23232b;border:1px solid #4a4a55;border-radius:6px;padding:3px;" +
    "box-shadow:0 4px 16px rgba(0,0,0,0.55);font:12px/1.3 system-ui,sans-serif;";
  const mkFlyoutShell = () => {
    const m = document.createElement("div");
    m.style.cssText = MENU_CSS;
    m.addEventListener("pointerdown", (e) => e.stopPropagation());
    document.body.appendChild(m);
    return m;
  };
  const propMenu = mkFlyoutShell();
  const libMenu = mkFlyoutShell();
  const subjectMenu = mkFlyoutShell();
  const creatureMenu = mkFlyoutShell();
  const subFlyouts = []; // level-2 flyouts (one per library category)
  let menuOpen = false;
  const closeMenu = () => {
    for (const m of [propMenu, libMenu, subjectMenu, creatureMenu, ...subFlyouts]) m.style.display = "none";
    menuOpen = false;
  };
  // Flyouts are fixed-positioned on <body>, so positioning is in pure viewport
  // coordinates. Cap height to the window (overflow-y:auto scrolls a too-tall list)
  // and clamp the top so the whole menu stays on screen.
  const placeFlyoutTop = (menu, anchorTopClient) => {
    menu.style.maxHeight = Math.max(80, window.innerHeight - 16) + "px";
    const top = Math.min(anchorTopClient, window.innerHeight - menu.offsetHeight - 8);
    menu.style.top = Math.max(8, top) + "px";
  };
  const openSideFlyout = (menu, anchorItem, isSub = false) => {
    // siblings at the same depth yield (hovering between ▸ rows swaps flyouts);
    // opening a level-2 category keeps its parent libMenu up.
    const siblings = isSub ? subFlyouts : [libMenu, subjectMenu, creatureMenu, ...subFlyouts];
    for (const m of siblings) if (m !== menu) m.style.display = "none";
    menu.style.display = "flex";
    const ar = anchorItem.getBoundingClientRect();
    placeFlyoutTop(menu, ar.top); // caps height first so offsetWidth includes any scrollbar
    let left = ar.right + 2;
    if (left + menu.offsetWidth > window.innerWidth) left = ar.left - menu.offsetWidth - 2; // flip if it would overflow
    menu.style.left = Math.max(4, left) + "px";
  };
  const mkMenuItem = (label, onClick, opts = {}) => {
    const it = document.createElement("div");
    it.textContent = label;
    it.style.cssText = "padding:4px 9px;border-radius:4px;cursor:pointer;color:#cdd;white-space:nowrap;" +
      (opts.flyout ? "display:flex;align-items:center;justify-content:space-between;gap:12px;" : "");
    if (opts.flyout) { const a = document.createElement("span"); a.textContent = "▸"; a.style.opacity = "0.6"; it.appendChild(a); }
    it.addEventListener("pointerenter", () => {
      it.style.background = "#3a3a46";
      if (opts.flyout) openSideFlyout(opts.flyout, it, opts.sub);
      else if (opts.closesFlyout) for (const m of [libMenu, subjectMenu, creatureMenu, ...subFlyouts]) m.style.display = "none";
    });
    it.addEventListener("pointerleave", () => { it.style.background = "transparent"; });
    if (onClick) it.addEventListener("click", (e) => { e.stopPropagation(); onClick(); closeMenu(); });
    return it;
  };
  // Library ▸ Category ▸ props — each category is its own nested flyout instead
  // of one long header-sectioned list.
  for (const { cat, items } of PROP_LIBRARY) {
    const catMenu = mkFlyoutShell();
    subFlyouts.push(catMenu);
    for (const t of items) {
      const s = PROP_SETS[t];
      if (s) { catMenu.appendChild(mkMenuItem(s.label, () => spawnPropSet(s))); continue; }
      const c = CHAIN_DEFS[t];
      if (c) { catMenu.appendChild(mkMenuItem(c.label, () => spawnProp(t))); continue; }
      const d = MODEL_PROPS[t];
      if (d) catMenu.appendChild(mkMenuItem(d.label, () => spawnProp(t)));
    }
    libMenu.appendChild(mkMenuItem(cat, null, { flyout: catMenu, sub: true }));
  }
  // 🧑 Subject ▸ — the posable bodies, first thing in ➕ (the old standalone 👤
  // button is gone; everything addable lives in one menu). Every entry is a
  // TEMPLATE of the custom slider-engine body (the baked GLBs stay registered
  // for old saves but aren't offered for new spawns). Capture is deferred until
  // the preset is applied so the first control map isn't a default-shaped ghost.
  for (const [, t] of Object.entries(BODY_TEMPLATES)) {
    subjectMenu.appendChild(mkMenuItem(t.label, async () => {
      const f = await spawnFigure({ body: "custom", capture: false });
      if (f?.customEngine) {
        f.customEngine.applyValues(t.sliders, {});
        syncBodySliders();
      }
      captureAndUpload(node);
    }));
  }
  propMenu.appendChild(mkMenuItem("🧑 Subject", null, { flyout: subjectMenu }));
  // 🐾 Creatures ▸ — non-human FIGURES (full rig-profile toolkit: joint handles,
  // leg IK, mirror, hoof pins), not props. Entries are FIGURE_LIBRARY bodies
  // with a non-human `rig` key.
  for (const [key, b] of Object.entries(FIGURE_LIBRARY)) {
    if (!b.rig) continue;
    creatureMenu.appendChild(mkMenuItem(b.label, () => spawnFigure({ body: key })));
  }
  propMenu.appendChild(mkMenuItem("🐾 Creatures", null, { flyout: creatureMenu }));
  propMenu.appendChild(mkMenuItem("📚 Library", null, { flyout: libMenu }));
  // 👕 paint clothing is cordoned off for now (jagged edges / color-binding issues) —
  // re-enable here once the per-piece-region rework lands. enterClothingPaint + all its
  // code stay intact, just unreachable from the menu.
  propMenu.appendChild(mkMenuItem("✏️ draw shape", () => spawnProp("__draw__"), { closesFlyout: true }));
  propMenu.appendChild(mkMenuItem("🧊 draw 3D shape", () => spawnProp("__draw3d__"), { closesFlyout: true }));
  propMenu.appendChild(mkMenuItem("🖼 image → shape", () => pickImageForShape(), { closesFlyout: true }));
  for (const [t, d] of Object.entries(PROP_DEFS)) propMenu.appendChild(mkMenuItem(d.label, () => spawnProp(t), { closesFlyout: true }));
  // Ground plane toggle — scene furniture, so it lives with the other addables
  // (it STAYS in the capture: gives DepthAnything a receding floor to read).
  propMenu.appendChild(mkMenuItem("▦ ground floor (toggle)", () => {
    floor.visible = !floor.visible;
    requestRender();
    captureAndUpload(node); // the floor exists FOR the capture — re-process immediately
  }, { closesFlyout: true }));
  // True-depth output moved to the right-click context menu ("🖼 output ▸" —
  // default | white background | depth map), where the other always-available
  // verbs live. The ➕ menu stays add-things-only.
  // 📂 import a user mesh: upload to the server FIRST (content-addressed), then
  // spawn from the stored copy — the picked file never enters the scene
  // directly, so pose_state always references a refetchable name and the prop
  // survives reload/undo/paste/export. Same content = same name (dedupe).
  const meshInput = document.createElement("input");
  meshInput.type = "file"; meshInput.accept = ".glb,.gltf,.obj"; meshInput.style.display = "none";
  // Shared by the ➕ menu's import item AND the toolbar 📂 (which accepts a
  // scene .json or a mesh and routes by extension).
  const importMeshFile = async (file) => {
    try {
      const form = new FormData();
      form.append("mesh", file);
      const resp = await api.fetchApi("/promptchain/pose-mesh/upload", { method: "POST", body: form });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.error || !data.file) throw new Error(data.error || `upload failed (${resp.status})`);
      await spawnImportedMesh(data.file);
    } catch (e) {
      console.error("[PoseStudio] mesh upload failed:", e);
      showClipToast("mesh import failed — " + (e.message || e), true);
    }
  };
  meshInput.addEventListener("change", () => {
    const file = meshInput.files?.[0];
    meshInput.value = ""; // same file re-importable later
    if (file) importMeshFile(file);
  });
  container.appendChild(meshInput); // torn down with the viewport container
  propMenu.appendChild(mkMenuItem("📂 import model (.glb / .obj)", () => meshInput.click(), { closesFlyout: true }));
  const propAddBtn = mkToolBtn("➕", "Add a subject, prop or model to the scene", () => {
    if (menuOpen) { closeMenu(); return; }
    propMenu.style.display = "flex"; libMenu.style.display = "none"; menuOpen = true;
    const br = propAddBtn.getBoundingClientRect();
    placeFlyoutTop(propMenu, br.top); // caps height first so offsetWidth includes any scrollbar
    let left = br.right + 4;
    if (left + propMenu.offsetWidth > window.innerWidth) left = br.left - propMenu.offsetWidth - 4;
    propMenu.style.left = Math.max(4, left) + "px";
  });
  mainGroup.appendChild(propAddBtn);
  // Any pointerdown outside the menu/button closes it. On window (capture) because the
  // flyouts are portaled to <body>, outside the poser container. Removed on teardown.
  const onMenuOutside = (e) => {
    if (menuOpen && ![propMenu, libMenu, subjectMenu, creatureMenu, ...subFlyouts, propAddBtn].some((m) => m.contains(e.target))) closeMenu();
  };
  window.addEventListener("pointerdown", onMenuOutside, true);
  // Teardown bridge: onRemoved lives in setupPoseStudio — a different scope —
  // so hand it a closure over these locals (a bare reference there
  // ReferenceErrors and aborts the rest of the teardown).
  node._pcrMenuCleanup?.(); // re-mount: drop the previous mount's flyouts + listener
  node._pcrMenuCleanup = () => {
    window.removeEventListener("pointerdown", onMenuOutside, true);
    for (const m of [propMenu, libMenu, subjectMenu, creatureMenu, ...subFlyouts]) m.remove(); // flyouts live on <body>, not inside container
  };

  // Build/destroy props from serialized state (workflow reload + undo/redo). Props
  // are scene-level (shared by all figures), so propsApi lives at mount scope, not
  // on a rig. The gizmo may point at a prop we're about to dispose — drop it first.
  // Imported-mesh FK pose as a rest-diff: only bones the user (or a scrubbed
  // clip) actually moved — a 60-bone rig at rest serializes to nothing.
  const serializeBoneDiff = (ud) => {
    const out = {};
    for (const b of ud._bones) {
      const r = ud._boneRest.get(b);
      if (!r) continue;
      const moved = b.position.distanceToSquared(r.p) > 1e-10;
      const turned = 1 - Math.abs(b.quaternion.dot(r.q)) > 1e-7;
      if (!moved && !turned) continue;
      out[b.name] = { q: b.quaternion.toArray(), ...(moved ? { p: b.position.toArray() } : {}) };
    }
    return out;
  };
  const serializeProp = (m) => {
    // A missing-mesh marker re-serializes its original record verbatim, but with the
    // marker's CURRENT transform — so repositioning a missing prop persists and it
    // lands correctly once the file is located.
    if (m.userData._failedRecord) return { ...m.userData._failedRecord, pos: m.position.toArray(), quat: m.quaternion.toArray(), scale: m.scale.toArray() };
    const boneDiff = m.userData._bones ? serializeBoneDiff(m.userData) : null;
    return {
      type: m.userData.propType,
      uid: m.userData.uid,
      ...(m.userData.customName ? { name: m.userData.customName } : {}), // named prop = region entity
      ...(m.userData.groupId ? { groupId: m.userData.groupId } : {}), // grouping (shared id across members)
      pos: m.position.toArray(),
      quat: m.quaternion.toArray(),
      scale: m.scale.toArray(),
      ...(m.userData.points ? { points: m.userData.points } : {}), // freehand outline → rebuild on restore
      ...(m.userData.holes?.length ? { holes: m.userData.holes } : {}), // enclosed cut-outs (image→shape)
      ...(m.userData.drawMode ? { drawMode: m.userData.drawMode, drawAmount: m.userData.drawAmount, drawRound: m.userData.drawRound } : {}), // 3D-shape mode + sliders
      ...(m.userData.file ? { file: m.userData.file } : {}), // imported mesh → refetch by content hash
      ...(m.userData.part != null ? { part: m.userData.part } : {}), // split part → rebuild just that mesh
      ...(boneDiff && Object.keys(boneDiff).length ? { bones: boneDiff } : {}), // FK pose survives reload
      ...(m.userData.subdivLevel ? { subdivLevel: m.userData.subdivLevel } : {}), // mesh-editor subdivisions (re-applied before the sculpt delta)
      ...(m.userData.sculptMap && m.userData.sculptMap.size ? { sculpt: sculptMapToData(m.userData.sculptMap) } : {}), // freehand sculpt delta
    };
  };
  // Rebuild one prop from its serialized form (drawn shape / imported mesh /
  // GLB model / primitive). Returns null on a failed/unknown load — restoreFrom
  // holds the slot with a placeholder.
  const buildPropFrom = async (p) => {
    let m;
    if (p.type === "drawnShape") m = makeDrawnProp(p.points, { mode: p.drawMode, amount: p.drawAmount, round: p.drawRound, holes: p.holes });
    else if (p.type === "importedMesh") m = p.file ? await loadImportedMesh(p.file, p.part ?? null).catch(() => null) : null;
    else if (CHAIN_DEFS[p.type]) m = makeChainProp(p.type); // procedural chain; FK pose restores via p.bones below
    else if (MODEL_PROPS[p.type]) m = await loadModelProp(p.type).catch(() => null);
    else m = makeProp(p.type);
    if (!m) return null;
    if (p.uid != null) { m.userData.uid = p.uid; propUidSeq = Math.max(propUidSeq, p.uid + 1); } // never reissue a restored uid
    if (typeof p.groupId === "string" && p.groupId) { m.userData.groupId = p.groupId; const n = parseInt(p.groupId.slice(1), 10); if (Number.isFinite(n)) groupIdSeq = Math.max(groupIdSeq, n + 1); }
    m.userData.customName = (typeof p.name === "string" && p.name.trim()) ? p.name.trim() : null;
    if (Array.isArray(p.pos)) m.position.fromArray(p.pos);
    if (Array.isArray(p.quat)) m.quaternion.fromArray(p.quat);
    if (Array.isArray(p.scale)) m.scale.fromArray(p.scale);
    // Re-apply a saved FK pose (bone rest-diffs, by bone name).
    if (p.bones && m.userData._bones) {
      for (const b of m.userData._bones) {
        const d = p.bones[b.name];
        if (!d) continue;
        if (Array.isArray(d.q)) b.quaternion.fromArray(d.q);
        if (Array.isArray(d.p)) b.position.fromArray(d.p);
      }
    }
    // Re-apply mesh-editor subdivisions, then the freehand sculpt, onto the prop's primary
    // mesh (own its geometry first so a shared template GLB instance isn't mutated per clone).
    // subdivideGeometry is deterministic, so the rebuilt indices match the saved sculpt delta.
    const cm = sculptPropMesh(m);
    if (cm && p.subdivLevel) {
      let g = cm.geometry, owned = false;
      for (let i = 0; i < p.subdivLevel; i++) { const ng = subdivideGeometry(g).geometry; if (owned) g.dispose(); g = ng; owned = true; } // never dispose the shared template (first iteration)
      cm.geometry = g; cm.userData._sculptOwned = true;
      m.userData.subdivLevel = p.subdivLevel;
    }
    if (cm && p.sculpt) { if (!cm.userData._sculptOwned) ownPropGeo(m, cm); m.userData.sculptMap = sculptDataToMap(p.sculpt); applySculpt(cm, m.userData.sculptMap); }
    return m;
  };
  const propsApi = {
    serialize: () => propsGroup.children.map(serializeProp),
    // Async because model props load their GLB. Built sequentially so propsGroup order
    // matches the serialized order (attachApi resolves leaders/followers by index).
    restoreFrom: async (list) => {
      if (selectedProp) { transformControls.detach(); selectedProp = null; updatePropUI(); }
      attachments.length = 0; // these props are about to be disposed; pins are rebuilt by attachApi
      for (const m of [...propsGroup.children]) { propsGroup.remove(m); disposeProp(m); }
      for (const p of list || []) {
        const m = await buildPropFrom(p);
        if (!node._pcrAlive) { if (m) disposeProp(m); return; }
        if (m) { propsGroup.add(m); continue; }
        // Failed/unknown load: a VISIBLE marker HOLDS the slot — attachApi resolves
        // pins by prop index, so skipping would re-pin every later prop to the wrong
        // target. _failedRecord re-serializes verbatim, so the prop survives the
        // missing asset instead of vanishing; an imported mesh whose file isn't on
        // this machine becomes a "missing mesh" marker the user can 🔍 Locate.
        const placeholder = makeMissingMarker();
        placeholder.userData.isProp = true;
        placeholder.userData._failedRecord = p;
        if (p.uid != null) { placeholder.userData.uid = p.uid; propUidSeq = Math.max(propUidSeq, p.uid + 1); }
        if (typeof p.groupId === "string" && p.groupId) placeholder.userData.groupId = p.groupId;
        if (Array.isArray(p.pos)) placeholder.position.fromArray(p.pos);
        if (Array.isArray(p.quat)) placeholder.quaternion.fromArray(p.quat);
        if (Array.isArray(p.scale)) placeholder.scale.fromArray(p.scale);
        propsGroup.add(placeholder);
        console.warn("[PoseStudio] prop mesh missing, showing locate marker:", p.file || p.type);
      }
      // Chains come back with their grab-handles LIVE (spawn does this too) — otherwise
      // after a reload the joints have no diamonds to click and the chain looks frozen.
      const chainProp = propsGroup.children.find((p) => p.userData?._chain);
      if (chainProp && bonePoseProp !== chainProp) setBonePoseProp(chainProp);
    },
  };

  // Pin constraints round-trip through pose_state by prop INDEX (position in propsGroup,
  // stable since props rebuild in order) and the leader figure's stable UID + canonical
  // joint name. Restored AFTER props + figures exist. (Older saves used figIndex; restore
  // still accepts that for back-compat.)
  const attachApi = {
    serialize: () => attachments.map((a) => ({
      follower: { propIndex: propsGroup.children.indexOf(a.follower.mesh), ...(a.follower.jointIndex != null ? { jointIndex: a.follower.jointIndex } : {}) },
      leader: a.leader.kind === "prop"
        ? { kind: "prop", propIndex: propsGroup.children.indexOf(a.leader.mesh) }
        : { kind: "joint", figUid: a.leader.fig.uid, joint: a.leader.joint },
      offset: a.offset.toArray(),
    })).filter((a) => a.follower.propIndex >= 0 &&
      (a.leader.kind === "joint" ? a.leader.figUid != null : a.leader.propIndex >= 0)),
    restoreFrom: (list) => {
      attachments.length = 0;
      for (const a of list || []) {
        const fMesh = propsGroup.children[a?.follower?.propIndex];
        if (!fMesh) continue;
        let leader = null;
        if (a.leader?.kind === "prop") { const lM = propsGroup.children[a.leader.propIndex]; if (lM) leader = { kind: "prop", mesh: lM }; }
        else if (a.leader?.kind === "joint") {
          const fig = a.leader.figUid != null ? figures.find((f) => f.uid === a.leader.figUid) : figures[a.leader.figIndex];
          if (fig) leader = { kind: "joint", fig, joint: a.leader.joint };
        }
        if (!leader) continue;
        const follower = { kind: "prop", mesh: fMesh };
        if (a.follower?.jointIndex != null) { follower.jointIndex = a.follower.jointIndex; fMesh.userData._pinIndex = a.follower.jointIndex; } // chain-joint pin
        attachments.push({ follower, leader, offset: new THREE.Matrix4().fromArray(a.offset) });
      }
    },
  };

  // Fullscreen: blow the viewport up to fill the window for detailed posing.
  // ComfyUI's DOM-widget layer carries a CSS transform (canvas zoom/pan), and a
  // transformed ancestor makes position:fixed resolve relative to IT, not the
  // window — so fixed-fullscreen in place only filled the zoomed node region. We
  // must reparent to document.body to escape that transform; then fixed = the real
  // viewport. !important still beats ComfyUI's per-frame inline style writes (it
  // holds the element ref and styles it even at body level). The original DOM slot
  // is restored on exit/teardown so nothing orphans.
  let fsActive = false, fsSavedCss = "", fsParent = null, fsNextSibling = null, fullBtn = null;
  const enterFullscreen = () => {
    if (fsActive) return;
    fsActive = true;
    fsSavedCss = container.style.cssText;
    fsParent = container.parentNode;
    fsNextSibling = container.nextSibling;
    document.body.appendChild(container);
    container.style.cssText =
      "position:fixed !important;inset:0 !important;width:100vw !important;height:100vh !important;" +
      "transform:none !important;margin:0 !important;max-width:none !important;max-height:none !important;" +
      "display:block !important;visibility:visible !important;opacity:1 !important;" +
      `z-index:${fsZ};background:#141418;overflow:hidden;touch-action:none;`; // above the PromptChain fullscreen overlay (9999); raised for the detached Re-pose poser
    if (fullBtn) fullBtn.textContent = "🗗";
    fitCanvas(); requestRender();
  };
  const exitFullscreen = () => {
    if (!fsActive) return;
    fsActive = false;
    if (fsParent) {
      if (fsNextSibling && fsNextSibling.parentNode === fsParent) fsParent.insertBefore(container, fsNextSibling);
      else fsParent.appendChild(container);
    }
    fsParent = fsNextSibling = null;
    container.style.cssText = fsSavedCss;
    if (fullBtn) fullBtn.textContent = "⛶";
    fitCanvas(); requestRender();
  };

  // Dock: relocate the viewport into a PromptChain node's left "3D Poser" panel
  // so the figure is posed from one control surface (and survives PromptChain's
  // own fullscreen). Same reparent-and-restore contract as fullscreen, but the
  // container flows to fill the panel instead of going position:fixed. The
  // !important flow styles beat ComfyUI's per-frame DOM-widget writes (it still
  // holds this element's ref and would otherwise re-absolute-position/hide it).
  let dockActive = false, dockSavedCss = "", dockParent = null, dockNextSibling = null;
  const enterDock = (panelBodyEl) => {
    if (!panelBodyEl) return;
    if (fsActive) exitFullscreen(); // can't be window-fullscreen and docked at once
    if (dockActive) exitDock();     // re-dock into a different panel cleanly
    dockActive = true;
    dockSavedCss = container.style.cssText;
    dockParent = container.parentNode;
    dockNextSibling = container.nextSibling;
    panelBodyEl.appendChild(container);
    container.style.cssText =
      "position:relative !important;left:0 !important;top:0 !important;" +
      "width:100% !important;height:100% !important;transform:none !important;" +
      "margin:0 !important;max-width:none !important;max-height:none !important;" +
      "display:block !important;visibility:visible !important;opacity:1 !important;" +
      "background:#141418;border-radius:0;overflow:hidden;touch-action:none;";
    fitCanvas(); requestRender();
  };
  const exitDock = () => {
    if (!dockActive) return;
    dockActive = false;
    if (dockParent && dockParent.isConnected) {
      if (dockNextSibling && dockNextSibling.parentNode === dockParent) dockParent.insertBefore(container, dockNextSibling);
      else dockParent.appendChild(container);
    } else {
      // Home slot is gone (Poser node removed while docked) — drop the element
      // so it doesn't orphan inside the panel; teardown disposes the rest.
      container.remove();
    }
    dockParent = dockNextSibling = null;
    container.style.cssText = dockSavedCss;
    fitCanvas(); requestRender();
  };
  // Match the control-map size to the generation latent (manual escape hatch; auto-sync
  // covers mount + connection changes). Moved into the strip from a separate top button.
  // (The manual "match latent" ⟳ is gone: syncToLatent runs automatically on
  // mount, on this node's re-wiring, and live when the latent's w/h widgets
  // change. Only swapping the latent NODE itself waits for the next sync.)
  fullBtn = mkToolBtn("⛶", "Expand the viewport to fill the window (Esc or the icon to restore)",
    () => (fsActive ? exitFullscreen() : enterFullscreen()));
  mainGroup.appendChild(fullBtn);
  container.appendChild(toolbar);

  // Escape deselects/exits fullscreen, but only when the cursor is over this viewport.
  let hovered = false;
  container.addEventListener("pointerenter", () => { hovered = true; });
  container.addEventListener("pointerleave", () => { hovered = false; });
  // Undo/redo for pose edits. Snapshots are full serialized poses (camera dropped
  // so undo never moves the view). recordHistory() runs from captureAndUpload after
  // every committed change and dedupes, so non-pose captures (orbit/resize/seed)
  // don't pollute the stack. Ctrl+Z is captured here and stopped from propagating
  // so it doesn't also trigger ComfyUI's graph undo (which can desync the network).
  const history = [];
  let histIndex = -1, applyingHistory = false;
  const poseSnapshot = () => { const d = serializePose(node); delete d.camera; return JSON.stringify(d); };
  const recordHistory = () => {
    if (applyingHistory) return;
    const snap = poseSnapshot();
    if (snap === history[histIndex]) return; // pose unchanged — skip
    history.splice(histIndex + 1);           // drop the redo tail
    history.push(snap);
    if (history.length > 200) history.shift();
    histIndex = history.length - 1;
  };
  const applyHistory = async () => {
    applyingHistory = true;
    try {
      const data = JSON.parse(history[histIndex]);
      // Reconcile the cast (by uid) so figure spawn/removal is undoable without scrambling
      // poses. v1 flat saves → a single figure. capture/select off so replay stays silent.
      const figData = Array.isArray(data.figures) ? data.figures : [data];
      // Names are identity, not posture — pose undo must not time-travel them.
      // Snapshots carry the names of their era, so replay would silently revert a
      // rename while the prompt keeps the custom $blocks; the next capture then
      // re-seeds ghost default-named blocks. Keep each surviving figure's LIVE name.
      const liveNames = new Map(figures.map((f) => [f.uid, f.customName]));
      // Same identity-vs-posture rule for props: a pose-undo must not revert a
      // prop's name (and ghost-seed its old $block on the next reconcile).
      const livePropNames = new Map(propsGroup.children.filter((m) => m.userData.uid != null)
        .map((m) => [m.userData.uid, m.userData.customName || null]));
      if (!(await reconcileCast(figData))) return;
      for (const f of figures) if (liveNames.has(f.uid)) f.customName = liveNames.get(f.uid);
      updateFigureLabels();
      setActiveFigure(activeFromSnapshot(data, figData));
      if (Array.isArray(data.props)) await propsApi.restoreFrom(data.props);
      for (const m of propsGroup.children) {
        const u = m.userData.uid;
        if (u != null && livePropNames.has(u)) m.userData.customName = livePropNames.get(u);
      }
      updatePropLabels();
      attachApi.restoreFrom(data.attachments); // after props + figures exist (indices/uids resolve)
      await syncSkinBinds(); // undo across a bind re-skins / un-skins to match the snapshot
      updatePinBtn();
      syncBodySliders();
      requestRender();
      captureAndUpload(node);
    } finally { applyingHistory = false; }
  };
  // While clothing paint is open, ↶ undoes paint actions (add/erase/brush) — those
  // aren't in the pose history yet (Phase 4). Otherwise it's the normal pose undo.
  const undo = () => { if (clothingPaint?.active && clothingPaint.undo.length) { paintUndo(); return; } if (histIndex > 0) { histIndex--; applyHistory(); } };
  const redo = () => { if (histIndex < history.length - 1) { histIndex++; applyHistory(); } };
  // Undo/redo buttons — the reliable pose-history controls (no keyboard hijack).
  mainGroup.appendChild(mkToolBtn("↶", "Undo the last pose change", undo));
  mainGroup.appendChild(mkToolBtn("↷", "Redo", redo));

  // Export / import the whole scene (figures, props, links, foot-pins, camera) as a .json
  // file, so a posed scene can be carried between workflows. Reuses serializePose +
  // restoreSavedState — the same path that round-trips pose_state inside a workflow.
  // The 💾 button opens a naming modal (styled like Save Pose) so the author picks the
  // file name; confirming runs the download below.
  const downloadScene = (filename) => {
    try {
      const blob = new Blob([JSON.stringify(serializePose(node), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      // The scene JSON (like the workflow) carries imported meshes only by content
      // hash, not the bytes — warn so the author knows recipients need the file(s).
      const imported = propsGroup.children.filter((m) => m.userData.file || m.userData._failedRecord?.file).length;
      if (imported) showClipToast(`scene exported — ⚠ ${imported} imported mesh${imported > 1 ? "es" : ""} won't travel; recipients need the file(s) or 🔍 Locate`, true);
      else showClipToast("scene exported");
    } catch (e) { console.error("[PoseStudio] scene export failed", e); }
  };
  // Coerce whatever the author types into one safe download name: drop a trailing
  // .json (re-added below), neutralise path separators / illegal filename chars and
  // leading dots so the browser never rejects the download, and fall back to a default.
  const sanitizeSceneFilename = (raw) => {
    const base = (raw || "").trim().replace(/\.json$/i, "").replace(/[\\/:*?"<>|]+/g, "_").replace(/^\.+/, "").trim();
    return (base || "promptchain-pose-scene") + ".json";
  };
  // Visual twin of the sidebar's Rename modal (PromptModal.svelte + modal-shared.css):
  // same chrome, plain text field, SVG ✕ close, secondary/primary footer buttons with
  // the primary disabled while the field is empty. Styles are inlined (not the shared
  // global CSS classes) so the modal renders correctly even on a graph page where the
  // Svelte bundle's CSS isn't present.
  let exportModal = null; // built lazily on first export (after the teardown chain is in place)
  const closeExport = () => { if (exportModal) exportModal.backdrop.style.display = "none"; };
  // Remember the last name the author exported as (device-local), so the next
  // export defaults to it instead of the generic placeholder. The browser still
  // auto-suffixes " (1)" etc. on its own if that file already exists on disk.
  const EXPORT_NAME_KEY = "pcr.pose-export-name";
  const attemptExport = () => {
    const raw = exportModal.input.value.trim();
    if (!raw) return; // confirm is disabled while empty; guard the Enter path too
    closeExport();
    const name = sanitizeSceneFilename(raw);
    try { localStorage.setItem(EXPORT_NAME_KEY, name); } catch { /* localStorage blocked */ }
    downloadScene(name);
  };
  const buildExportModal = () => {
    const backdrop = document.createElement("div");
    backdrop.className = "pcr-scene-export-backdrop";
    backdrop.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;" +
      "background:rgba(0,0,0,0.6);font:14px system-ui,sans-serif;";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.style.cssText =
      "min-width:320px;max-width:480px;background:#262626;border:1px solid #3a3a3a;border-radius:8px;" +
      "box-shadow:0 8px 32px rgba(0,0,0,0.5);";
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #3a3a3a;";
    const title = document.createElement("span");
    title.textContent = "Export Scene";
    title.style.cssText = "font-size:16px;font-weight:600;color:#fff;";
    const closeBtn = document.createElement("button");
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.style.cssText = "display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;background:transparent;border:none;border-radius:4px;color:#888;cursor:pointer;";
    closeBtn.addEventListener("mouseenter", () => { closeBtn.style.background = "rgba(255,255,255,0.1)"; closeBtn.style.color = "#fff"; });
    closeBtn.addEventListener("mouseleave", () => { closeBtn.style.background = "transparent"; closeBtn.style.color = "#888"; });
    header.append(title, closeBtn);
    const body = document.createElement("div");
    body.style.cssText = "padding:20px;";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 80;
    input.placeholder = "File name";
    input.style.cssText =
      "width:100%;box-sizing:border-box;padding:10px 12px;background:#1a1a1a;border:1px solid #3a3a3a;" +
      "border-radius:6px;color:#fff;font-size:14px;outline:none;";
    body.append(input);
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid #3a3a3a;";
    const mkFooterBtn = (label, bg, fg) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = `padding:8px 16px;border:none;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;background:${bg};color:${fg};`;
      return b;
    };
    const cancelBtn = mkFooterBtn("Cancel", "#3a3a3a", "#ccc");
    cancelBtn.addEventListener("mouseenter", () => { cancelBtn.style.background = "#4a4a4a"; });
    cancelBtn.addEventListener("mouseleave", () => { cancelBtn.style.background = "#3a3a3a"; });
    const confirmBtn = mkFooterBtn("Export", "#973f00", "#fff");
    confirmBtn.addEventListener("mouseenter", () => { if (!confirmBtn.disabled) confirmBtn.style.background = "#c85909"; });
    confirmBtn.addEventListener("mouseleave", () => { confirmBtn.style.background = "#973f00"; });
    // Mirror PromptModal: the primary action is disabled while the field is empty.
    const refreshConfirm = () => {
      const empty = !input.value.trim();
      confirmBtn.disabled = empty;
      confirmBtn.style.opacity = empty ? "0.5" : "1";
      confirmBtn.style.cursor = empty ? "default" : "pointer";
    };
    footer.append(cancelBtn, confirmBtn);
    dialog.append(header, body, footer);
    backdrop.appendChild(dialog);

    input.addEventListener("input", refreshConfirm);
    input.addEventListener("focus", () => { input.style.borderColor = "#dd7634"; });
    input.addEventListener("blur", () => { input.style.borderColor = "#3a3a3a"; });
    backdrop.addEventListener("pointerdown", (e) => e.stopPropagation()); // keep canvas/selection handlers out
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeExport(); }); // click the dim to cancel
    backdrop.addEventListener("keydown", (e) => {
      e.stopPropagation(); // graph/viewport hotkeys must never fire while the modal is up
      if (e.key === "Escape") { e.preventDefault(); closeExport(); }
      else if (e.key === "Enter" && e.target === input) { e.preventDefault(); attemptExport(); }
    });
    closeBtn.addEventListener("click", closeExport);
    cancelBtn.addEventListener("click", closeExport);
    confirmBtn.addEventListener("click", attemptExport);
    document.body.appendChild(backdrop);
    // Ride the portaled-flyout teardown chain so the modal never outlives the node.
    const prevCleanup = node._pcrMenuCleanup;
    node._pcrMenuCleanup = () => { prevCleanup?.(); backdrop.remove(); };

    exportModal = { backdrop, input, refreshConfirm };
  };
  const openExportScene = () => {
    if (!exportModal) buildExportModal();
    exportModal.backdrop.style.zIndex = String((node.properties?.pcrFullscreenZ || 10001) + 10); // above this poser's flyout menus
    let defaultName = "promptchain-pose-scene.json";
    try { const saved = localStorage.getItem(EXPORT_NAME_KEY); if (saved) defaultName = saved; } catch { /* localStorage blocked */ }
    exportModal.input.value = defaultName;
    exportModal.refreshConfirm();
    exportModal.backdrop.style.display = "flex";
    requestAnimationFrame(() => {
      exportModal.input.focus();
      // Pre-select the base name only (leaves ".json") so typing replaces the name
      // without clobbering the extension — same trick the sidebar Rename modal uses.
      exportModal.input.setSelectionRange(0, defaultName.length - ".json".length);
    });
  };
  const importInput = document.createElement("input");
  importInput.type = "file"; importInput.accept = ".json,.glb,.gltf,.obj"; importInput.style.display = "none";
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = ""; // let the same file be re-imported later
    if (!file) return;
    // One open button, routed by extension: a mesh ADDS a prop to the scene,
    // a .json REPLACES the scene (same paths as the ➕ import / viewport drop).
    if (/\.(glb|gltf|obj)$/i.test(file.name)) { importMeshFile(file); return; }
    try {
      const text = await file.text();
      JSON.parse(text); // validate before committing it to the widget
      setWidgetValue(node, "pose_state", text);
      await restoreSavedState();
      if (!node._pcrAlive) return;
      syncBodySliders();
      requestRender();
      captureAndUpload(node);
    } catch (e) { console.error("[PoseStudio] scene import failed (not a valid pose JSON?)", e); }
  });
  container.appendChild(importInput);
  mainGroup.appendChild(mkToolBtn("💾", "Export this scene to a .json file (transfer between workflows)", openExportScene));
  mainGroup.appendChild(mkToolBtn("📂", "Open: a scene .json (replaces the scene) or a .glb/.gltf/.obj model (adds it as a prop)", () => importInput.click()));

  // ── copy / paste people + props ─────────────────────────────────────────────
  // Copies the current selection (band group > whole person > prop > the person
  // owning a selected joint) to the system clipboard, pasteable into this or any
  // other 3D Poser — other workflows included. Unlike 📂 import, paste is ADDITIVE.
  const clipToast = document.createElement("div");
  clipToast.style.cssText =
    "position:absolute;bottom:30px;left:50%;transform:translateX(-50%);z-index:6;display:none;" +
    "padding:3px 10px;background:rgba(20,20,26,0.92);border:1px solid #4a4a55;border-radius:5px;" +
    "font:11px/1.4 system-ui,sans-serif;pointer-events:none;white-space:nowrap;";
  container.appendChild(clipToast);
  const showClipToast = (msg, isError) => {
    clipToast.textContent = msg;
    clipToast.style.color = isError ? "#ff9d5c" : "#9fdf9f";
    clipToast.style.display = "block";
    // Web Animations API: the fade-out hides itself on 'finish' — no timers.
    clipToast.getAnimations().forEach((a) => a.cancel());
    const anim = clipToast.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
      { duration: 2200, easing: "ease-in" });
    anim.onfinish = () => { clipToast.style.display = "none"; };
  };
  const clipCountLabel = (clip) => [
    clip.figures.length && `${clip.figures.length} ${clip.figures.length > 1 ? "people" : "person"}`,
    clip.props.length && `${clip.props.length} prop${clip.props.length > 1 ? "s" : ""}`,
  ].filter(Boolean).join(" + ");
  // Attachments are carried only when BOTH ends are in the selection; indices are
  // remapped to clip-local order (offsets are leader-relative, so they paste as-is).
  const serializeClip = (sel) => {
    const figs = sel.filter((s) => s.kind === "figure").map((s) => s.o);
    const props = sel.filter((s) => s.kind === "prop").map((s) => s.o);
    const clip = { format: CLIP_FORMAT, version: 1, figures: figs.map(serializeFigure), props: props.map(serializeProp), attachments: [] };
    for (const a of attachments) {
      const fi = props.indexOf(a.follower.mesh);
      if (fi === -1) continue;
      let leader = null;
      if (a.leader.kind === "prop") { const li = props.indexOf(a.leader.mesh); if (li !== -1) leader = { kind: "prop", propIndex: li }; }
      else { const gi = figs.indexOf(a.leader.fig); if (gi !== -1) leader = { kind: "joint", figIndex: gi, joint: a.leader.joint }; }
      if (leader) clip.attachments.push({ follower: { propIndex: fi, ...(a.follower.jointIndex != null ? { jointIndex: a.follower.jointIndex } : {}) }, leader, offset: a.offset.toArray() });
    }
    return clip;
  };
  const copySelection = async () => {
    const sel = bandSel.length ? [...bandSel]
      : selectedFigure ? [{ kind: "figure", o: selectedFigure }]
      : selectedProp ? [{ kind: "prop", o: selectedProp }]
      : selectedJointName ? [{ kind: "figure", o: rig }] // a joint is selected → its person
      : [];
    if (!sel.length) { showClipToast("nothing selected — click a person or prop first", true); return; }
    // Props combined onto a selected person/prop travel with the copy — walk the
    // attachment graph leader→follower until closed (prop-on-prop chains too), so
    // serializeClip sees both ends and keeps the links.
    const inSel = new Set(sel.map((s) => s.o));
    for (let grew = true; grew; ) {
      grew = false;
      for (const a of attachments) {
        if (inSel.has(a.follower.mesh)) continue;
        if (inSel.has(a.leader.kind === "prop" ? a.leader.mesh : a.leader.fig)) {
          sel.push({ kind: "prop", o: a.follower.mesh });
          inSel.add(a.follower.mesh);
          grew = true;
        }
      }
    }
    const clip = serializeClip(sel);
    const json = JSON.stringify(clip);
    poseClipMemory = json;
    let system = false;
    // Bounded: in some contexts the clipboard promise never settles (no
    // permission UI to resolve it) — cut/copy must not wedge behind it; the
    // tab-local fallback is already written above.
    try {
      await Promise.race([
        navigator.clipboard.writeText(json).then(() => { system = true; }),
        new Promise((res) => setTimeout(res, 1500)),
      ]);
    } catch {} // http-non-localhost / permission denied → tab-local fallback
    showClipToast(`copied ${clipCountLabel(clip)}${system ? "" : " (this browser tab only)"}`);
  };
  const parseClip = (text) => {
    if (!text) return null;
    try {
      const d = JSON.parse(text);
      return d && d.format === CLIP_FORMAT && Array.isArray(d.figures) && Array.isArray(d.props) ? d : null;
    } catch { return null; }
  };
  const pasteClip = async () => {
    let sysText = null;
    try {
      sysText = await Promise.race([
        navigator.clipboard.readText(),
        new Promise((res) => setTimeout(() => res(null), 1500)), // never-settling read → tab-local fallback
      ]);
    } catch {}
    const clip = parseClip(sysText) || parseClip(poseClipMemory);
    if (!clip) { showClipToast("nothing to paste — copy a person or prop first (right-click → copy)", true); return; }
    if (!node._pcrAlive) return;
    const data = JSON.parse(JSON.stringify(clip)); // position nudges below must not mutate the stored clipboard

    // Nudge the whole group sideways onto free ground — pasting in place would
    // stack the duplicate exactly inside the original. Relative arrangement is
    // preserved (one shared dx); a paste into open space (other workflow) lands
    // at the copied position unmoved.
    const taken = (x, z) =>
      figures.some((f) => Math.hypot(f.root.position.x - x, f.root.position.z - z) < 0.3) ||
      propsGroup.children.some((m) => Math.hypot(m.position.x - x, m.position.z - z) < 0.15);
    const spots = [...data.figures.map((fd) => fd.root || [0, 0, 0]), ...data.props.map((p) => p.pos || [0, 0, 0])];
    let dx = 0;
    while (dx < 6 && spots.some(([x, , z]) => taken(x + dx, z))) dx += 0.5;
    // Custom names must stay unique across ALL region entities (figures + named
    // props): a colliding pasted name (e.g. duplicating "alice" or "sword" in
    // the same scene) falls back to default/unnamed — two masks under one name
    // would bind ambiguously.
    const usedNames = new Set(liveEntityNames().map((n) => n.toLowerCase()));
    const droppedNames = [];
    for (const fd of data.figures) {
      delete fd.uid; // pasted person gets a fresh identity — never collide with the source's
      if (typeof fd.name === "string" && fd.name) {
        if (usedNames.has(fd.name.toLowerCase())) { droppedNames.push(fd.name); delete fd.name; }
        else usedNames.add(fd.name.toLowerCase());
      }
      if (Array.isArray(fd.root)) fd.root[0] += dx;
      if (fd.footPins) for (const k of Object.keys(fd.footPins)) fd.footPins[k][0] += dx; // world anchors ride along
    }
    for (const p of data.props) {
      delete p.uid; // fresh identity, same rule as figures
      if (typeof p.name === "string" && p.name) {
        if (usedNames.has(p.name.toLowerCase())) { droppedNames.push(p.name); delete p.name; }
        else usedNames.add(p.name.toLowerCase());
      }
      if (Array.isArray(p.pos)) p.pos[0] += dx;
    }

    const pastedFigs = [];
    for (const fd of data.figures) {
      const f = await spawnFigure({ select: false, capture: false, body: fd.body });
      if (!node._pcrAlive) return;
      if (!f) continue;
      applyOneFigure(f, fd);
      f.rootRest = f.root.position.clone(); // reset returns it HERE, not to the spawn slot
      pastedFigs.push(f);
    }
    updateFigureLabels(); // pasted custom names land after spawnFigure already labeled
    const pastedProps = [];
    for (const p of data.props) {
      const m = await buildPropFrom(p);
      if (!node._pcrAlive) { if (m) disposeProp(m); return; }
      pastedProps.push(m); // null on a failed load keeps clip indices aligned for attachments
      if (m) propsGroup.add(m);
    }
    updatePropLabels(); // pasted named props get their region labels
    for (const a of data.attachments || []) {
      const fMesh = pastedProps[a?.follower?.propIndex];
      if (!fMesh) continue;
      let leader = null;
      if (a.leader?.kind === "prop") { const lM = pastedProps[a.leader.propIndex]; if (lM) leader = { kind: "prop", mesh: lM }; }
      else if (a.leader?.kind === "joint") { const fig = pastedFigs[a.leader.figIndex]; if (fig) leader = { kind: "joint", fig, joint: a.leader.joint }; }
      if (leader) {
        const follower = { kind: "prop", mesh: fMesh };
        if (a.follower?.jointIndex != null) { follower.jointIndex = a.follower.jointIndex; fMesh.userData._pinIndex = a.follower.jointIndex; }
        attachments.push({ follower, leader, offset: new THREE.Matrix4().fromArray(a.offset) });
      }
    }
    await syncSkinBinds(); // a pasted bound-monster figure rebuilds its skin
    // Select what landed (band for a group, plain select for one) so it can be
    // dragged into place immediately.
    selectBand([
      ...pastedFigs.map((o) => ({ kind: "figure", o })),
      ...pastedProps.filter(Boolean).map((o) => ({ kind: "prop", o })),
    ]);
    updatePinBtn();
    syncBodySliders();
    showClipToast(`pasted ${clipCountLabel(data)}` +
      (droppedNames.length ? ` — name${droppedNames.length > 1 ? "s" : ""} ${droppedNames.map((n) => `"${n}"`).join(", ")} taken → default` : ""));
    requestRender();
    captureAndUpload(node);
  };
  // (Copy/paste moved off the toolbar: right-click context menu + Ctrl+C/V.)

  // ── rename a person (double-click their name label) ─────────────────────────
  // The floating name bar becomes a text input. A custom name flows into
  // pose_state (server binds the region to its figure BY NAME), the bound
  // prompt's $block is rewritten so typed tags travel with the rename, and the
  // POSE_JSON→couple wire is added so the server can see the names.
  const renameInput = document.createElement("input");
  renameInput.type = "text";
  renameInput.maxLength = 24;
  renameInput.spellcheck = false;
  renameInput.style.cssText =
    "position:absolute;z-index:7;display:none;width:140px;transform:translateX(-50%);" +
    "background:#1a1a22;color:#ff9d5c;border:1px solid #caa14a;border-radius:4px;" +
    "padding:2px 6px;font:bold 12px system-ui,sans-serif;text-align:center;outline:none;";
  renameInput.addEventListener("pointerdown", (e) => e.stopPropagation());
  container.appendChild(renameInput);
  let renameTarget = null; // { kind: "figure", fig } | { kind: "prop", mesh }
  const closeRename = () => { renameTarget = null; renameInput.style.display = "none"; };
  // Valid = $block-safe (\w, starts with a letter), unique across ALL region
  // entities — figures (defaults included) and named props — so a name can
  // never point at two masks. Digit endings ARE allowed ("girl1"): the region
  // binder matches the entity list by exact name first (compiler.py
  // region_figure_indices), so a digit suffix is never read positionally. The
  // ONE reserved namespace is "mannequinN" — that's the auto-default for figure
  // N, so a custom "mannequin3" would silently collide with a 3rd figure added
  // later (the uniqueness check below only sees figures that exist NOW).
  const validateEntityName = (self, raw) => {
    const name = raw.trim();
    if (!name) return { name: null }; // empty = default mannequinN (figure) / not-a-region (prop)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return { error: "letters, digits and _ only — must start with a letter" };
    if (/^mannequin\d+$/i.test(name)) return { error: "\"mannequinN\" is reserved for default mannequin names — pick another" };
    const taken = [
      ...effectiveFigureNames(figures).filter((_, i) => figures[i] !== self),
      ...namedPropMeshes().filter((m) => m !== self).map((m) => m.userData.customName),
    ];
    if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return { error: `"${name}" is already another figure's or prop's name` };
    return { name };
  };
  const commitRename = (fromBlur = false) => {
    if (!renameTarget) return;
    const target = renameTarget;
    const res = validateEntityName(target.kind === "figure" ? target.fig : target.mesh, renameInput.value);
    if (res.error) {
      showClipToast(res.error, true);
      if (fromBlur) closeRename(); else renameInput.focus();
      return;
    }
    closeRename();
    if (target.kind === "figure") {
      const fig = target.fig;
      const idx = figures.indexOf(fig);
      const oldName = effectiveFigureNames(figures)[idx];
      fig.customName = res.name;
      const newName = effectiveFigureNames(figures)[idx];
      if (newName === oldName) return;
      renameRegionBlock(node, oldName, newName);
      ensureCouplePoseWire(node);
      updateFigureLabels();
    } else {
      const mesh = target.mesh;
      const oldName = mesh.userData.customName; // null = wasn't a region yet
      if (res.name === oldName) return;
      mesh.userData.customName = res.name;
      // A rename travels to the existing $block; a FIRST naming seeds its block
      // via the reconcile inside the capture below. Clearing the name demotes
      // the prop from regions — its block stays (add-only, like a removed
      // figure's; the server clamps an unbound name harmlessly).
      if (oldName && res.name) renameRegionBlock(node, oldName, res.name);
      if (res.name) ensureCouplePoseWire(node);
      updatePropLabels();
      updatePropUI(); // $ button reflects the region state immediately
    }
    requestRender();
    captureAndUpload(node); // pose_state + masks + regionEntities carry the change
  };
  renameInput.addEventListener("keydown", (e) => {
    e.stopPropagation(); // graph/viewport hotkeys must never fire while typing
    if (e.key === "Enter") commitRename();
    else if (e.key === "Escape") closeRename();
  });
  renameInput.addEventListener("blur", () => commitRename(true));
  // Sit the input on the entity's label screen position (same projection the
  // sprite renders through, container-relative for absolute positioning).
  const placeRenameInput = (p) => {
    p.project(camera);
    const r = canvas.getBoundingClientRect(), cr = container.getBoundingClientRect();
    renameInput.style.left = ((p.x * 0.5 + 0.5) * r.width + r.left - cr.left) + "px";
    renameInput.style.top = (((-p.y) * 0.5 + 0.5) * r.height + r.top - cr.top - 12) + "px";
    renameInput.style.display = "block";
    renameInput.focus();
    renameInput.select();
  };
  const openRename = (fig) => {
    renameTarget = { kind: "figure", fig };
    renameInput.value = fig.customName || "";
    renameInput.placeholder = effectiveFigureNames(figures)[figures.indexOf(fig)];
    placeRenameInput(fig._label ? fig._label.getWorldPosition(new THREE.Vector3()) : fig.root.getWorldPosition(new THREE.Vector3()).setY(1.8));
  };
  const openRenameProp = (mesh) => {
    renameTarget = { kind: "prop", mesh };
    renameInput.value = mesh.userData.customName || "";
    renameInput.placeholder = "region name";
    const p = new THREE.Vector3();
    if (mesh._pcrLabel) mesh._pcrLabel.getWorldPosition(p);
    else { _plBox.setFromObject(mesh); _plBox.isEmpty() ? mesh.getWorldPosition(p) : _plBox.getCenter(p).setY(_plBox.max.y + 0.12); }
    placeRenameInput(p);
  };
  canvas.addEventListener("dblclick", (e) => {
    setPointer(e); // shared raycaster, same NDC math as every other pick
    const sprites = figures.map((f) => f._label).filter(Boolean);
    const hit = raycaster.intersectObjects(sprites, false)[0];
    if (hit) {
      e.preventDefault();
      e.stopPropagation();
      const fig = figures.find((f) => f._label === hit.object);
      if (fig) openRename(fig);
      return;
    }
    // Dblclick a prop (or its label) = name it — mirrors the figure gesture and
    // is the discoverable path; the 🏷 panel button covers tiny/occluded props.
    const pHit = raycaster.intersectObjects(propsGroup.children, true)[0];
    const prop = pHit && propRootOf(pHit.object);
    if (prop) {
      e.preventDefault();
      e.stopPropagation();
      openRenameProp(prop);
    }
  });

  // Text → Poser: the bound prompt's `$oldName {` block was renamed to
  // `$newName {` (see syncRegionRenamesFromText). Apply it to the matching
  // entity so a rename typed in the prompt renames the actual mannequin/prop.
  // Mirrors commitRename's apply branches but DELIBERATELY skips renameRegionBlock
  // (the editor already holds newName — rewriting it would loop) and validates
  // through the same gate (reserved / duplicate / identifier), so a bad typed
  // name is rejected here instead of corrupting figure state. Returns
  // {applied, error?} — the caller leaves the user's text untouched either way.
  const renameEntityByName = (oldName, newName) => {
    const from = String(oldName || "").toLowerCase();
    const to = String(newName || "");
    if (!from || !to) return { applied: false };
    // Figures match on their EFFECTIVE name (custom, else mannequinN).
    const fIdx = effectiveFigureNames(figures).findIndex((n) => n.toLowerCase() === from);
    if (fIdx >= 0) {
      const fig = figures[fIdx];
      // Reverting a block to this figure's OWN default name clears the custom
      // name — validateEntityName forbids typing "mannequinN", so handle the
      // legitimate self-revert before that gate (other indices stay rejected).
      if (to.toLowerCase() === "mannequin" + (fIdx + 1)) {
        if (fig.customName == null) return { applied: false };
        fig.customName = null;
        updateFigureLabels(); requestRender(); captureAndUpload(node);
        return { applied: true };
      }
      const res = validateEntityName(fig, to);
      if (res.error) return { applied: false, error: res.error };
      if (!res.name || res.name === fig.customName) return { applied: false };
      fig.customName = res.name;
      ensureCouplePoseWire(node);
      updateFigureLabels(); requestRender(); captureAndUpload(node);
      return { applied: true };
    }
    // Named props match on their customName.
    const mesh = namedPropMeshes().find((m) => (m.userData.customName || "").toLowerCase() === from);
    if (mesh) {
      const res = validateEntityName(mesh, to);
      if (res.error) return { applied: false, error: res.error };
      if (!res.name || res.name === mesh.userData.customName) return { applied: false };
      mesh.userData.customName = res.name;
      ensureCouplePoseWire(node);
      updatePropLabels(); updatePropUI(); requestRender(); captureAndUpload(node);
      return { applied: true };
    }
    return { applied: false }; // no entity by that name (e.g. an orphan $block)
  };

  // ── drag-and-drop scene import ──────────────────────────────────────────────
  // Drop a finished render (PNG/WebP with embedded workflow), a workflow .json,
  // or an exported scene .json onto the viewport — docked, side-panel, or
  // fullscreen (the handlers ride the container) — and the scene it carries
  // REPLACES this Poser's, same path as 📂 import. preventDefault is load-
  // bearing: ComfyUI's document-level drop handler skips defaultPrevented
  // events, so the dropped workflow never replaces the whole graph.
  const poseStateFromWorkflow = (data) => {
    if (Array.isArray(data?.nodes)) { // saved-workflow format
      for (const n of data.nodes) {
        const ps = n?.type === "PromptChain_PoseStudio" ? n.widgets_values?.[1] : null;
        if (typeof ps === "string" && ps.trim()) return ps;
      }
      return null;
    }
    for (const v of Object.values(data || {})) { // API prompt format
      const ps = v?.class_type === "PromptChain_PoseStudio" ? v.inputs?.pose_state : null;
      if (typeof ps === "string" && ps.trim()) return ps;
    }
    return null;
  };
  // Accepts a scene export / bare pose_state directly, or digs one out of a
  // workflow JSON. Returns the scene JSON string, or null.
  const sceneJsonFromText = (text) => {
    let data; try { data = JSON.parse(text); } catch { return null; }
    if (!data) return null;
    if (Array.isArray(data.figures) || data.joints) return text; // v2 scene | v1 flat pose
    const ps = poseStateFromWorkflow(data);
    return ps ? sceneJsonFromText(ps) : null;
  };
  const applyDroppedScene = async (sceneJson, sourceLabel) => {
    setWidgetValue(node, "pose_state", sceneJson);
    await restoreSavedState();
    if (!node._pcrAlive) return;
    syncBodySliders();
    requestRender();
    captureAndUpload(node);
    showClipToast(`scene loaded from ${sourceLabel} — ` +
      `${figures.length} ${figures.length > 1 ? "people" : "person"}, ` +
      `${propsGroup.children.length} prop${propsGroup.children.length === 1 ? "" : "s"}`);
  };
  const sceneFromDroppedFile = async (file) => {
    const fname = (file.name || "").toLowerCase();
    if (fname.endsWith(".json")) return sceneJsonFromText(await file.text());
    const pnginfo = window.comfyAPI?.pnginfo;
    let meta = null;
    try {
      meta = fname.endsWith(".webp")
        ? await pnginfo?.getWebpMetadata?.(file)
        : await pnginfo?.getPngMetadata?.(file);
    } catch { /* unparseable image — treated as no scene below */ }
    for (const key of ["workflow", "prompt"]) {
      const scene = meta?.[key] ? sceneJsonFromText(meta[key]) : null;
      if (scene) return scene;
    }
    return null;
  };
  container.addEventListener("dragover", (e) => {
    if (!(e.dataTransfer?.types || []).some((t) => t === "Files" || t === "text/uri-list")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  });
  container.addEventListener("drop", async (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const file = dt.files?.[0];
      if (file) {
        // A dropped mesh imports as a prop (same path as 📂 import model);
        // anything else is treated as a scene carrier (render/.json).
        if (/\.(glb|gltf|obj)$/i.test(file.name || "")) {
          const form = new FormData();
          form.append("mesh", file);
          const resp = await api.fetchApi("/promptchain/pose-mesh/upload", { method: "POST", body: form });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || data.error || !data.file) throw new Error(data.error || `upload failed (${resp.status})`);
          await spawnImportedMesh(data.file);
          return;
        }
        const scene = await sceneFromDroppedFile(file);
        if (scene) await applyDroppedScene(scene, file.name || "file");
        else showClipToast("no 3D Poser scene found in that file", true);
        return;
      }
      // dragged from a ComfyUI gallery — fetch the same-origin image, read its metadata
      const uri = dt.getData("text/uri-list") || dt.getData("text/plain");
      if (uri && /\/(api\/)?view\?/.test(uri)) {
        const blob = await (await fetch(uri)).blob();
        const scene = await sceneFromDroppedFile(new File([blob], /webp/i.test(uri) ? "drop.webp" : "drop.png"));
        if (scene) await applyDroppedScene(scene, "image");
        else showClipToast("no 3D Poser scene found in that image", true);
      }
    } catch (err) {
      console.error("[PoseStudio] scene drop failed", err);
      showClipToast("couldn't read a scene from that drop", true);
    }
  });

  // Undo/redo are the ↶ ↷ toolbar buttons ONLY — we intentionally do NOT hijack
  // Ctrl+Z. ComfyUI owns Ctrl+Z (graph undo), and intercepting it reliably across
  // focus states proved fragile; when it slipped through, the graph reload rebuilt
  // and emptied the WebGL viewport. The buttons call undo()/redo() directly and
  // never touch ComfyUI's undo, so the viewport can't be killed.
  const onKey = (e) => {
    // Typing in a text field (the rename box, panel inputs)? None of the viewport
    // hotkeys may fire — Delete/W/E/Ctrl+V while naming a figure would delete or
    // move it. The field owns its own Enter/Esc handling.
    const t = e.target;
    if (t && ((t.tagName === "INPUT" && !/^(range|checkbox|button)$/.test(t.type)) ||
              t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === "Escape") {
      if (menuOpen) { closeMenu(); return; } // close the prop menu first
      if (sculpt.active) { exitSculpt(); return; } // finish sculpting
      if (clothingPaint.active) { if (clothingPaint.imgStamp) cancelImageStamp(); else exitClothingPaint(); return; } // cancel image placement, else finish paint
      if (drawingShape) { exitDrawMode(); requestRender(); return; } // cancel a shape draw first
      if (fsActive) { exitFullscreen(); return; } // Esc leaves fullscreen first
      if (pinPickProp) { cancelPinPick(); requestRender(); return; } // cancel a pending link
      if (hovered) { detachGizmo(); requestRender(); }
      return;
    }
    // Sculpt mode owns the viewport keys (Ctrl+Z = undo a stroke). Handled BEFORE the
    // hover gate below — during sculpt the joint-hover state is never set, so anything
    // gated on `hovered` would never fire.
    if (sculpt.active) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
        if (e.key.toLowerCase() === "z") { e.preventDefault(); e.stopPropagation(); sculptUndo(); }
      }
      return; // swallow Delete/W/E/R/other chords so they can't act on the target mid-sculpt
    }
    // Everything below acts on the viewport under the cursor.
    if (!hovered) return;
    // Ctrl/Cmd+C / +V — copy/paste people + props (here or in another workflow's
    // Poser). Captured BEFORE ComfyUI so the graph doesn't also copy/paste the
    // node itself; typing in a panel input keeps native clipboard behavior.
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      const ck = e.key.toLowerCase();
      if (ck === "z" && clothingPaint.active) { e.preventDefault(); e.stopPropagation(); paintUndo(); } // undo a paint stroke (not the whole graph)
      else if (ck === "c") { e.preventDefault(); e.stopPropagation(); copySelection(); }
      else if (ck === "v") { e.preventDefault(); e.stopPropagation(); pasteClip(); }
      else if (ck === "a") {
        // Select ALL objects (figures + props) as a band group — gizmo at the
        // median, Del/cut/copy act on everything. Captured before the browser's
        // select-all and ComfyUI's node select-all.
        e.preventDefault(); e.stopPropagation();
        selectBand([
          ...figures.map((f) => ({ kind: "figure", o: f })),
          ...propsGroup.children.map((m) => ({ kind: "prop", o: m })),
        ]);
      }
      else if (ck === "g") { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) ungroupSelection(); else groupSelection(); } // group / ungroup
      return; // other ctrl-chords are not ours — but never fall into the W/E handlers
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (clothingPaint.active && clothingPaint.selected) { // remove the picked garment piece
        e.preventDefault(); e.stopPropagation();
        removeGarment(clothingPaint.fig, clothingPaint.selected); clothingPaint.selected = null;
        requestRender(); captureAndUpload(node); return;
      }
      // Del removes the selected OBJECT — a prop, or the selected whole person
      // (the LAST one included: figure-less scenes are legal now, and the panel
      // 🗑 already allows it — the key must match). Never mid-drag, and never a
      // joint (joints aren't objects).
      if (bandActive()) { e.preventDefault(); e.stopPropagation(); deleteBand(); return; }
      if (selectedProp) { e.preventDefault(); e.stopPropagation(); deleteSelectedProp(); return; }
      if (selectedFigure && !ik.active && !transformControls.dragging) {
        e.preventDefault(); e.stopPropagation();
        removeFigure(selectedFigure);
      }
      return;
    }
    // W/E/R = move/rotate/scale — the Maya/Unity/Unreal/Cascadeur convention
    // (G/T alias translate for Blender muscle memory). One path with the left
    // transform group: setTransformTool dispatches per selection (band / IK tip /
    // figure / prop) and arms the defaults when nothing is selected.
    const k = e.key.toLowerCase();
    if (k === "w" || k === "g" || k === "t") { e.preventDefault(); e.stopPropagation(); setTransformTool("translate"); }
    else if (k === "e") { e.preventDefault(); e.stopPropagation(); setTransformTool("rotate"); }
    else if (k === "r") { e.preventDefault(); e.stopPropagation(); setTransformTool("scale"); }
  };
  window.addEventListener("keydown", onKey, true); // capture: intercept Ctrl+Z before ComfyUI

  // Right-button handling: a right-DRAG pans the orbit (LiteGraph's menu is
  // suppressed even when the release lands outside the canvas — window-capture
  // beats its handler), while a right-CLICK (<5px travel) opens the poser's own
  // context menu at the cursor: cut / copy / paste, which used to crowd the
  // toolbar strip as 📋/📥 buttons.
  const ctxMenu = document.createElement("div");
  ctxMenu.style.cssText = MENU_CSS;
  ctxMenu.addEventListener("pointerdown", (e) => e.stopPropagation());
  document.body.appendChild(ctxMenu);
  // "🖼 output ▸" hover flyout — self-contained rather than riding the ➕ menus'
  // openSideFlyout machinery, whose close chain is scoped to those menus.
  const ctxOutMenu = document.createElement("div");
  ctxOutMenu.style.cssText = MENU_CSS;
  ctxOutMenu.addEventListener("pointerdown", (e) => e.stopPropagation());
  document.body.appendChild(ctxOutMenu);
  const closeCtxMenu = () => { ctxMenu.style.display = "none"; ctxOutMenu.style.display = "none"; };
  // Hovering any other ctx item closes the flyout (items are flat divs, so
  // e.target is the item itself; the marked output item keeps it open).
  ctxMenu.addEventListener("pointerover", (e) => {
    if (ctxOutMenu.style.display === "flex" && !e.target.dataset?.pcrOut) ctxOutMenu.style.display = "none";
  });
  const deleteSelection = () => {
    if (bandActive()) deleteBand();
    else if (selectedProp) deleteSelectedProp();
    else if (selectedFigure) removeFigure(selectedFigure);
    else if (selectedJointName && rig) removeFigure(rig); // a joint is selected → its person
  };
  const mkCtxItem = (label, enabled, onClick) => {
    const it = document.createElement("div");
    it.textContent = label;
    it.style.cssText = "padding:4px 9px;border-radius:4px;white-space:nowrap;" +
      (enabled ? "cursor:pointer;color:#cdd;" : "color:#62656e;cursor:default;");
    if (enabled) {
      it.addEventListener("pointerenter", () => { it.style.background = "#3a3a46"; });
      it.addEventListener("pointerleave", () => { it.style.background = "transparent"; });
      it.addEventListener("click", (e) => { e.stopPropagation(); closeCtxMenu(); onClick(); });
    }
    return it;
  };
  // Right-click SELECTS what's under the cursor first (joint handle > prop >
  // figure — same priority as a left click), so the menu's verbs act on the
  // thing you clicked. Empty space keeps the current selection: deselect-on-
  // right-click would strip the selection paste/copy was opened for.
  const pickAtPointer = (e) => {
    setPointer(e);
    const h = pickHandle(e);
    if (h) { attachGizmo(h.userData.joint); requestRender(); return; }
    const propHit = raycaster.intersectObjects(propsGroup.children, true)[0];
    const propObj = propHit && propRootOf(propHit.object);
    if (propObj) {
      // Already part of the current multi-selection? KEEP it — so the menu's group verbs
      // see all of it instead of collapsing to the single thing under the cursor.
      if (bandSel.some((s) => s.o === propObj)) { requestRender(); return; }
      selectPropOrGroup(propObj); requestRender(); return; // a grouped member selects its whole group
    }
    const hit = raycaster.intersectObjects(figures.flatMap((f) => f.meshes), true)[0];
    const fig = hit ? figures.find((f) => f.meshes.includes(hit.object)) : null;
    if (fig) {
      if (bandSel.some((s) => s.o === fig)) { requestRender(); return; } // keep the multi-selection
      selectFigure(fig); requestRender();
    }
  };
  // Capture output mode — what the node's IMAGE output emits. "default" = clay render
  // over the dark frame (DepthAnything pipeline downstream), "white" = isolated figure
  // on white (pose-anchor exports; mannequin-pose LoRAs are trained on white-background
  // anchors), "depth" = true geometric z-depth (DepthAnything bypassed).
  const OUTPUT_MODES = [["default", "default"], ["white", "white background"], ["depth", "depth map"]];
  const getOutputMode = () => node.properties?.pcrOutputMode || (node.properties?.pcrTrueDepth ? "depth" : "default");
  const setOutputMode = (mode) => {
    node.properties = node.properties || {};
    node.properties.pcrOutputMode = mode;
    node.properties.pcrTrueDepth = mode === "depth"; // legacy flag mirrored for old saves/readers
    setDepthBypass(mode === "depth");
    showClipToast(mode === "depth" ? "output: depth map — DepthAnything bypassed"
      : mode === "white" ? "output: figure on white background" : "output: default render");
    requestRender();
    captureAndUpload(node);
  };
  const openCtxOutFlyout = (anchor) => {
    ctxOutMenu.innerHTML = "";
    const cur = getOutputMode();
    for (const [mode, label] of OUTPUT_MODES) {
      ctxOutMenu.appendChild(mkCtxItem((cur === mode ? "● " : "○ ") + label, true, () => setOutputMode(mode)));
    }
    const r = anchor.getBoundingClientRect();
    ctxOutMenu.style.display = "flex";
    ctxOutMenu.style.left = Math.max(4, Math.min(r.right + 2, window.innerWidth - ctxOutMenu.offsetWidth - 8)) + "px";
    ctxOutMenu.style.top = Math.max(4, Math.min(r.top, window.innerHeight - ctxOutMenu.offsetHeight - 8)) + "px";
  };
  const openCtxMenu = (x, y) => {
    ctxMenu.innerHTML = ""; // rebuilt per open — items reflect the live selection
    ctxOutMenu.style.display = "none";
    const can = !!(bandSel.length || selectedFigure || selectedProp || selectedJointName);
    ctxMenu.appendChild(mkCtxItem("✂️ cut", can, async () => { await copySelection(); deleteSelection(); }));
    ctxMenu.appendChild(mkCtxItem("📋 copy", can, copySelection));
    ctxMenu.appendChild(mkCtxItem("📥 paste", true, pasteClip));
    // Grouping — group a multi-selection (Ctrl+G), ungroup a selected group, or combine
    // a whole group onto a mannequin (every member rides it + enters its mask).
    const grpSel = selectionProps(), grpIds = selectionGroupIds();
    if (grpSel.length >= 2) ctxMenu.appendChild(mkCtxItem("🧩 group  (Ctrl+G)", true, groupSelection));
    if (grpIds.size) {
      ctxMenu.appendChild(mkCtxItem("🧩 ungroup  (Ctrl+Shift+G)", true, ungroupSelection));
      if (figures.length) ctxMenu.appendChild(mkCtxItem("🔗 combine group to mannequin", true, combineGroupToTarget));
    }
    // Person verbs — on a joint or a whole figure (they act on the active rig).
    if (rig && (selectedJointName || selectedFigure)) {
      ctxMenu.appendChild(mkCtxItem("⇄ mirror", true, mirror));
      ctxMenu.appendChild(mkCtxItem("↺ reset pose", true, resetPose));
    }
    // Foot pins live on the foot: right-click an ankle (or its knee — it carries
    // the foot) to plant/release both feet.
    const footish = /^(ankle|knee)[LR]$/.test(selectedJointName || "");
    if (rig && footish && legsAreIkable(rig)) {
      ctxMenu.appendChild(mkCtxItem(anyFootPinned() ? "📌 unpin feet" : "📌 pin feet", true, toggleFootPins));
    }
    // 🖼 output ▸ — hover (or click) opens the mode flyout; doesn't close the menu.
    const outItem = document.createElement("div");
    outItem.textContent = "🖼 output  ▸";
    outItem.dataset.pcrOut = "1";
    outItem.style.cssText = "padding:4px 9px;border-radius:4px;white-space:nowrap;cursor:pointer;color:#cdd;";
    outItem.addEventListener("pointerenter", () => { outItem.style.background = "#3a3a46"; openCtxOutFlyout(outItem); });
    outItem.addEventListener("pointerleave", () => { outItem.style.background = "transparent"; });
    outItem.addEventListener("click", (e) => { e.stopPropagation(); openCtxOutFlyout(outItem); });
    ctxMenu.appendChild(outItem);
    ctxMenu.appendChild(mkCtxItem("⌂ reset camera", true, resetView));
    ctxMenu.style.display = "flex";
    ctxMenu.style.left = Math.max(4, Math.min(x, window.innerWidth - ctxMenu.offsetWidth - 8)) + "px";
    ctxMenu.style.top = Math.max(4, Math.min(y, window.innerHeight - ctxMenu.offsetHeight - 8)) + "px";
  };
  let rightPressInViewport = false;
  let rightPressAt = null;
  container.addEventListener("pointerdown", (e) => {
    if (e.button === 2) { rightPressInViewport = true; rightPressAt = [e.clientX, e.clientY]; }
  });
  const onWinPointerDown = (e) => {
    if (e.button !== 2) rightPressInViewport = false;
    if (ctxMenu.style.display === "flex" && !ctxMenu.contains(e.target) && !ctxOutMenu.contains(e.target)) closeCtxMenu();
  };
  const onContextMenu = (e) => {
    if (!rightPressInViewport) return;
    rightPressInViewport = false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const moved = rightPressAt ? Math.hypot(e.clientX - rightPressAt[0], e.clientY - rightPressAt[1]) : 99;
    if (moved < 5) {
      pickAtPointer(e);
      openCtxMenu(e.clientX, e.clientY);
    }
  };
  window.addEventListener("pointerdown", onWinPointerDown, true);
  window.addEventListener("contextmenu", onContextMenu, true);
  // Ride the existing flyout cleanup chain (re-mount calls it before reassigning;
  // teardown calls it last) so the portaled menu never outlives the node.
  const prevMenuCleanup = node._pcrMenuCleanup;
  node._pcrMenuCleanup = () => { prevMenuCleanup?.(); ctxMenu.remove(); ctxOutMenu.remove(); };

  container._pcrDolly = (deltaY) => {
    const factor = Math.pow(0.95, -deltaY / 100);
    camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
    controls.update();
    requestRender();
    captureAndUpload(node);
  };

  let lastCW = 0, lastCH = 0;
  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    if (w === lastCW && h === lastCH) return; // ignore no-op observer ticks
    lastCW = w; lastCH = h;
    fitCanvas(); // re-fit the centered frame to the new node-body size
    requestRender();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // Re-frame and re-capture when the target resolution changes (the frame aspect,
  // hence the canvas fit, depends on width/height).
  for (const w of [wWidget, hWidget]) {
    if (!w) continue;
    const prev = w.callback;
    w.callback = function (...args) {
      prev?.apply(this, args);
      fitCanvas();
      requestRender();
      captureAndUpload(node);
    };
  }

  // ── Clothing paint: body-hugging garment shells ──────────────────────────────
  // A garment is a thin SkinnedMesh that REUSES the body's vertex attributes by
  // reference (position/normal/skinIndex/skinWeight + morph deltas) with its OWN
  // index buffer = only the painted triangles, pushed out along the surface normal
  // by a thickness uniform. Because the attributes are shared instances, every body
  // deformation tracks for free: skeletal pose (same skeleton), GPU shape-key morphs
  // (shared morphAttributes + morphTargetInfluences, baked bodies), and the 🧬 custom
  // engine (which re-sums position + recomputes normals IN PLACE — same buffers).
  // Merge-on-touch is automatic: coverage is a vertex Set, connected coverage yields
  // a connected submesh. See dev-promptchain/docs/plans/clothing-paint-shell.md.
  const GARMENT_COLOR = 0x3a6fd8; // distinct blue so the garment reads apart from skin while editing
  const garmentBodyOf = (fig) => (fig?.meshes || []).find((m) => m.isSkinnedMesh && m.skeleton) || null;
  const garmentMat = () => {
    const uThickness = { value: 0.012 };
    const mat = new THREE.MeshStandardMaterial({ color: GARMENT_COLOR, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uThickness = uThickness;
      // Offset along the RAW object-space normal (the `normal` attribute), not
      // `objectNormal` — by begin_vertex the skinnormal include has already rotated
      // objectNormal into posed space, so using it would double-skin the offset.
      // Adding the object-space offset to `transformed` before skinning_vertex lets
      // skinning transport it with the surface exactly once.
      shader.vertexShader = "uniform float uThickness;\n" + shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  transformed += normalize(normal) * uThickness;"
      );
    };
    return { mat, uThickness };
  };
  // Resolve the covered VERTEX SET into a triangle index over the body's topology:
  // a face is kept when ANY of its corners is covered. (Requiring all three left
  // holes where a press didn't happen to complete whole triangles — "I press and
  // get no polygon"; "any" guarantees every painted vertex contributes its faces
  // and fills interior gaps, at the cost of the patch edge running ~one ring wide.)
  const garmentIndexFromVerts = (srcGeo, vertSet) => {
    const out = [];
    const keep = (a, b, c) => vertSet.has(a) || vertSet.has(b) || vertSet.has(c);
    const idx = srcGeo.index;
    if (idx) {
      const a = idx.array;
      for (let i = 0; i < a.length; i += 3) if (keep(a[i], a[i + 1], a[i + 2])) out.push(a[i], a[i + 1], a[i + 2]);
    } else {
      const n = srcGeo.attributes.position.count;
      for (let i = 0; i + 2 < n; i += 3) if (keep(i, i + 1, i + 2)) out.push(i, i + 1, i + 2);
    }
    return out;
  };
  // Per-body vertex adjacency (cached) — the brush floods over real mesh edges so
  // coverage is GEODESIC: it can't leak across a gap (between thighs, under an arm)
  // the way a pure euclidean radius would, because there's no edge bridging them.
  const garmentAdjacency = (fig, srcGeo) => {
    if (fig._garmentAdjGeo === srcGeo && fig._garmentAdj) return fig._garmentAdj;
    const n = srcGeo.attributes.position.count;
    const adj = Array.from({ length: n }, () => []);
    const link = (a, b) => { if (!adj[a].includes(b)) adj[a].push(b); if (!adj[b].includes(a)) adj[b].push(a); };
    const idx = srcGeo.index;
    if (idx) { const a = idx.array; for (let i = 0; i < a.length; i += 3) { link(a[i], a[i + 1]); link(a[i + 1], a[i + 2]); link(a[i + 2], a[i]); } }
    else { for (let i = 0; i + 2 < n; i += 3) { link(i, i + 1); link(i + 1, i + 2); link(i + 2, i); } }
    fig._garmentAdj = adj; fig._garmentAdjGeo = srcGeo;
    return adj;
  };
  const rebuildShellIndex = (shell) => {
    const g = shell.userData._garment;
    const faces = garmentIndexFromVerts(g.srcGeo, g.vertSet);
    shell.geometry.setIndex(faces);
    shell.visible = faces.length > 0;
  };
  // Create a garment shell for `fig` covering `vertSet` (may be empty → grows via
  // paint). thickness is the desired WORLD stand-off; the shader works in mesh-local
  // units so we divide by the body's world scale.
  const makeShellMesh = (fig, vertSet, thickness = 0.012) => {
    const body = garmentBodyOf(fig);
    if (!body) return null;
    const srcGeo = body.geometry;
    const geo = new THREE.BufferGeometry();
    for (const k of ["position", "normal", "skinIndex", "skinWeight", "uv"]) {
      if (srcGeo.attributes[k]) geo.setAttribute(k, srcGeo.attributes[k]); // share instance by reference
    }
    geo.morphAttributes = srcGeo.morphAttributes;            // GPU shape-key bodies morph the shell too
    geo.morphTargetsRelative = srcGeo.morphTargetsRelative;
    geo.setIndex(garmentIndexFromVerts(srcGeo, vertSet));
    geo.boundingSphere = srcGeo.boundingSphere;              // already 3x-inflated for raycast slack
    const { mat, uThickness } = garmentMat();
    body.updateWorldMatrix(true, false);
    const ws = new THREE.Vector3(); body.getWorldScale(ws);
    const wsAvg = (ws.x + ws.y + ws.z) / 3 || 1;
    uThickness.value = thickness / wsAvg;
    const shell = new THREE.SkinnedMesh(geo, mat);
    shell.frustumCulled = false;
    shell.morphTargetInfluences = body.morphTargetInfluences; // share by ref → sliders move it
    shell.morphTargetDictionary = body.morphTargetDictionary;
    shell.bindMode = body.bindMode;
    shell.raycast = () => {};                                 // never intercept body raycast (brush) or figure selection
    // Child of the body with identity local transform → matrixWorld matches the
    // body, so binding with the body's bindMatrix lands the skin identically. It
    // also inherits the body's visibility (correct for per-figure mask captures).
    body.add(shell);
    shell.position.set(0, 0, 0); shell.quaternion.identity(); shell.scale.set(1, 1, 1);
    shell.bind(body.skeleton, body.bindMatrix);
    shell.visible = vertSet.size > 0;
    shell.userData._garment = { uThickness, vertSet, srcGeo, wsAvg, thickness };
    (fig.garments ||= []).push(shell);
    return shell;
  };
  const setGarmentThickness = (shell, worldThickness) => {
    const g = shell.userData._garment;
    g.thickness = worldThickness; g.uThickness.value = worldThickness / g.wsAvg;
  };
  const removeGarment = (fig, shell) => {
    shell.parent?.remove(shell); shell.geometry.dispose(); shell.material.dispose();
    const arr = fig?.garments; const k = arr ? arr.indexOf(shell) : -1; if (k >= 0) arr.splice(k, 1);
  };
  const clearGarments = (fig) => {
    for (const g of [...(fig?.garments || [])]) removeGarment(fig, g);
    if (fig) fig.garments = [];
    requestRender();
  };

  // ── Texture-coverage garment (fast paint, smooth HD edges, conforms for free) ──
  // The shell above borrows the body's faces, so painting was either blocky (edge
  // stuck at body polygons) or slow (rebuild an own-geometry mesh + per-vertex
  // raycast every stroke). Instead: ONE body-hugging shell carrying ALL the body
  // faces, with coverage stored in a MASK TEXTURE in the body's UV space. The
  // material samples the mask as its alphaMap with alphaTest, so unpainted texels
  // are cut away — including in the depth pass. Painting = raycast the body once per
  // pointer event, stamp a disc into the mask canvas at the hit's UV. Edges are as
  // smooth as the texture (not the mesh); no rebuild. Skin + morphs are shared by
  // reference, so it tracks pose AND sliders with zero reprojection.
  const MASK_RES = 2048;
  const garmentMaskMat = (maskTex) => {
    const uThickness = { value: 0.012 };
    const mat = new THREE.MeshStandardMaterial({
      color: GARMENT_COLOR, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
      alphaMap: maskTex, alphaTest: 0.5, // painted texels keep, blank texels discard (depth too)
    });
    mat.onBeforeCompile = (shader) => { // same single-skin thickness offset as garmentMat()
      shader.uniforms.uThickness = uThickness;
      shader.vertexShader = "uniform float uThickness;\n" + shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  transformed += normalize(normal) * uThickness;"
      );
    };
    return { mat, uThickness };
  };
  const makeMaskShell = (fig, thickness = 0.012) => {
    const body = garmentBodyOf(fig);
    if (!body || !body.geometry.attributes.uv) return null; // texture coverage needs body UVs
    const srcGeo = body.geometry;
    const geo = new THREE.BufferGeometry();
    for (const k of ["position", "normal", "skinIndex", "skinWeight", "uv"]) {
      if (srcGeo.attributes[k]) geo.setAttribute(k, srcGeo.attributes[k]); // share instance by reference
    }
    geo.morphAttributes = srcGeo.morphAttributes;
    geo.morphTargetsRelative = srcGeo.morphTargetsRelative;
    if (srcGeo.index) geo.setIndex(srcGeo.index);
    geo.boundingSphere = srcGeo.boundingSphere;
    const maskCanvas = document.createElement("canvas"); maskCanvas.width = maskCanvas.height = MASK_RES;
    const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
    const maskTex = new THREE.CanvasTexture(maskCanvas);
    maskTex.flipY = false;                 // stamp at (u·W, v·H), sample at vUv → 1:1
    maskTex.generateMipmaps = false; maskTex.minFilter = THREE.LinearFilter; maskTex.magFilter = THREE.LinearFilter;
    if (THREE.NoColorSpace) maskTex.colorSpace = THREE.NoColorSpace; // it's a mask, not color
    const { mat, uThickness } = garmentMaskMat(maskTex);
    body.updateWorldMatrix(true, false);
    const ws = new THREE.Vector3(); body.getWorldScale(ws);
    const wsAvg = (ws.x + ws.y + ws.z) / 3 || 1;
    uThickness.value = thickness / wsAvg;
    const shell = new THREE.SkinnedMesh(geo, mat);
    shell.frustumCulled = false;
    shell.morphTargetInfluences = body.morphTargetInfluences;
    shell.morphTargetDictionary = body.morphTargetDictionary;
    shell.bindMode = body.bindMode;
    body.add(shell);
    shell.position.set(0, 0, 0); shell.quaternion.identity(); shell.scale.set(1, 1, 1);
    shell.bind(body.skeleton, body.bindMatrix);
    shell.userData._garment = { uThickness, wsAvg, thickness, isMaskShell: true, maskCanvas, maskCtx, maskTex };
    (fig.garments ||= []).push(shell);
    return shell;
  };
  const stampMask = (shell, uv, erase, radiusPx) => {
    const g = shell.userData._garment, ctx = g.maskCtx;
    ctx.save();
    if (erase) ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(uv.x * MASK_RES, uv.y * MASK_RES, radiusPx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    g.maskTex.needsUpdate = true;
  };
  // Screen-px brush → texture-px radius, via the hit face's local UV-per-world scale,
  // so the brush feels the same size on the body wherever the unwrap stretches.
  const _mrA = new THREE.Vector3(), _mrB = new THREE.Vector3(), _mrUA = new THREE.Vector2(), _mrUB = new THREE.Vector2();
  const maskRadiusPxAtHit = (hit, body, shell) => {
    const rect = canvas.getBoundingClientRect();
    const focalPx = (rect.height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const worldR = clothingPaint.brushPx * hit.distance / Math.max(1, focalPx);
    const geo = body.geometry, f = hit.face; let uvPerLocal = 8;
    if (f && geo.attributes.uv) {
      _mrA.fromBufferAttribute(geo.attributes.position, f.a); _mrB.fromBufferAttribute(geo.attributes.position, f.b);
      _mrUA.fromBufferAttribute(geo.attributes.uv, f.a); _mrUB.fromBufferAttribute(geo.attributes.uv, f.b);
      const dPos = _mrB.distanceTo(_mrA); if (dPos > 1e-6) uvPerLocal = _mrUB.distanceTo(_mrUA) / dPos;
    }
    const localR = worldR / (shell.userData._garment.wsAvg || 1); // worldR → body-local units
    return Math.max(1, Math.min(MASK_RES * 0.5, localR * uvPerLocal * MASK_RES));
  };
  const maskPaintedCount = () => { // diagnostic: how many texels of the active mask are painted
    const g = clothingPaint.brushPiece?.userData?._garment; if (!g?.isMaskShell) return 0;
    const d = g.maskCtx.getImageData(0, 0, MASK_RES, MASK_RES).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  };
  const ensureMaskPiece = () => {
    const cur = clothingPaint.brushPiece;
    if (cur?.userData?._garment?.isMaskShell && clothingPaint.fig?.garments?.includes(cur)) return cur;
    return (clothingPaint.brushPiece = makeMaskShell(clothingPaint.fig, clothingPaint.thickness));
  };
  const maskUndoSnap = () => { // snapshot the active mask before a stroke; undo restores it
    const shell = clothingPaint.brushPiece; const g = shell?.userData?._garment; if (!g?.isMaskShell) return;
    const snap = g.maskCtx.getImageData(0, 0, MASK_RES, MASK_RES);
    pushUndo(() => { if (!clothingPaint.fig?.garments?.includes(shell)) return; g.maskCtx.putImageData(snap, 0, 0); g.maskTex.needsUpdate = true; requestRender(); });
  };
  const paintMaskAt = (e) => {
    const body = garmentBodyOf(clothingPaint.fig); if (!body) return;
    setPointer(e);
    const hit = raycaster.intersectObject(body, false)[0];
    if (!hit || !hit.uv) return; // missed the body (e.g. over empty space) — nothing to paint
    const shell = ensureMaskPiece(); if (!shell) { showClipToast("this body has no UVs to paint on", true); return; }
    stampMask(shell, hit.uv, clothingPaint.erase, maskRadiusPxAtHit(hit, body, shell));
    requestRender();
  };

  // Debug/spike entry: a front-facing chest band (kept for the headless harness).
  const buildGarmentShell = (fig, opts = {}) => {
    const body = garmentBodyOf(fig);
    if (!body) return null;
    const srcGeo = body.geometry, pos = srcGeo.attributes.position;
    let vertSet = opts.vertSet;
    if (!vertSet) {
      body.updateWorldMatrix(true, false);
      const mw = body.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(mw);
      const v = new THREE.Vector3(), nv = new THREE.Vector3();
      const nrm = srcGeo.attributes.normal, front = opts.front ?? 0.25;
      const wy0 = opts.wy0 ?? 1.15, wy1 = opts.wy1 ?? 1.45;
      vertSet = new Set();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mw);
        if (v.y < wy0 || v.y > wy1) continue;
        if (nrm) { nv.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); if (nv.z < front) continue; }
        vertSet.add(i);
      }
    }
    const shell = makeShellMesh(fig, vertSet, opts.thickness ?? 0.012);
    if (shell) { requestRender(); captureAndUpload(node); }
    return shell;
  };

  // ── Conformed garment (smooth own-geometry, projected onto the body) ──────────
  // The shell above borrows the body's faces, so its EDGES are stuck at the body's
  // coarse polygon resolution (blocky). This builds the garment from its OWN dense
  // triangulation of a drawn outline, then projects each vertex onto the body by
  // camera-ray, so the edge follows the smooth DRAWN outline — independent of the
  // body mesh. Skin weights are sampled from the hit body triangle (dominant corner)
  // so it still follows the pose. (Sliders not yet — that's the next step.)
  // Dense triangulation of a closed 2D outline (NDC): triangulate then subdivide
  // midpoints so the interior is sampled finely enough to hug body curvature.
  const denseTriangulate = (poly, subdiv) => {
    const verts = poly.map((p) => [p[0], p[1]]);
    let tris = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p[0], p[1])), []);
    for (let s = 0; s < subdiv; s++) {
      const mid = new Map(), nt = [];
      const getMid = (a, b) => {
        const k = a < b ? a + "_" + b : b + "_" + a;
        if (mid.has(k)) return mid.get(k);
        const i = verts.length; verts.push([(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2]); mid.set(k, i); return i;
      };
      for (const [a, b, c] of tris) { const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a); nt.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
      tris = nt;
    }
    return { verts, tris };
  };
  const _baryCoord = (p, a, b, c, out) => {
    const v0x = b.x - a.x, v0y = b.y - a.y, v0z = b.z - a.z;
    const v1x = c.x - a.x, v1y = c.y - a.y, v1z = c.z - a.z;
    const v2x = p.x - a.x, v2y = p.y - a.y, v2z = p.z - a.z;
    const d00 = v0x * v0x + v0y * v0y + v0z * v0z, d01 = v0x * v1x + v0y * v1y + v0z * v1z, d11 = v1x * v1x + v1y * v1y + v1z * v1z;
    const d20 = v2x * v0x + v2y * v0y + v2z * v0z, d21 = v2x * v1x + v2y * v1y + v2z * v1z;
    const den = d00 * d11 - d01 * d01 || 1e-9, vv = (d11 * d20 - d01 * d21) / den, ww = (d00 * d21 - d01 * d20) / den;
    out.set(1 - vv - ww, vv, ww);
  };
  // Core: turn a 2D mesh (verts in NDC + triangle list) into a smooth conformed garment
  // by projecting each vertex onto the body. Used by both the lasso (outline → dense
  // triangulation) and the brush (painted region → grid mesh).
  const conformFromMesh2D = (fig, v2, tris, opts = {}) => {
    const body = garmentBodyOf(fig); if (!body) return null;
    const thickness = opts.thickness ?? 0.015;
    body.updateWorldMatrix(true, false);
    const ws = new THREE.Vector3(); body.getWorldScale(ws); const wsAvg = (ws.x + ws.y + ws.z) / 3 || 1;
    const bgeo = body.geometry, bpos = bgeo.attributes.position, bN = bgeo.attributes.normal, bidx = bgeo.index ? bgeo.index.array : null;
    const bSI = bgeo.attributes.skinIndex, bSW = bgeo.attributes.skinWeight;
    const n = v2.length;
    // Positions sit ON the body surface; the thickness raise is applied in the shader
    // (garmentMat's uThickness along the stored normal) so thickness stays LIVE. Normals
    // are barycentric-interpolated body normals (SMOOTH shading, not faceted). pins store
    // each vertex's body triangle + barycentric coords so the garment can re-project when
    // the body SHAPE changes (slider tracking) — see reprojectGarment.
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), si = new Float32Array(n * 4), sw = new Float32Array(n * 4), hitMask = new Uint8Array(n);
    const pinTri = new Int32Array(n * 3).fill(-1), pinBary = new Float32Array(n * 3);
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), bary = new THREE.Vector3(), local = new THREE.Vector3();
    const nm3 = new THREE.Matrix3().getNormalMatrix(body.matrixWorld), wN = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      raycaster.setFromCamera(new THREE.Vector2(v2[i][0], v2[i][1]), camera);
      const hit = raycaster.intersectObject(body, false)[0];
      if (!hit) continue;
      // Reject only near-tangent/back-facing hits (true silhouette). A looser cut here
      // used to punch holes over curved areas like breasts; the drawn outline already
      // bounds the shape, so keep everything that faces the camera at all.
      wN.copy(hit.face.normal).applyMatrix3(nm3).normalize();
      if (wN.dot(raycaster.ray.direction) > -0.03) continue;
      hitMask[i] = 1;
      local.copy(hit.point); body.worldToLocal(local); // body-local hit point (bind ≈ pose at draw time)
      pos[i * 3] = local.x; pos[i * 3 + 1] = local.y; pos[i * 3 + 2] = local.z;
      const fi = hit.faceIndex;
      const a = bidx ? bidx[fi * 3] : fi * 3, b = bidx ? bidx[fi * 3 + 1] : fi * 3 + 1, c = bidx ? bidx[fi * 3 + 2] : fi * 3 + 2;
      A.fromBufferAttribute(bpos, a); B.fromBufferAttribute(bpos, b); C.fromBufferAttribute(bpos, c);
      _baryCoord(local, A, B, C, bary);
      const u = bary.x, vv = bary.y, w = bary.z;
      nrm[i * 3] = bN.getX(a) * u + bN.getX(b) * vv + bN.getX(c) * w; // smooth interpolated normal
      nrm[i * 3 + 1] = bN.getY(a) * u + bN.getY(b) * vv + bN.getY(c) * w;
      nrm[i * 3 + 2] = bN.getZ(a) * u + bN.getZ(b) * vv + bN.getZ(c) * w;
      pinTri[i * 3] = a; pinTri[i * 3 + 1] = b; pinTri[i * 3 + 2] = c;
      pinBary[i * 3] = u; pinBary[i * 3 + 1] = vv; pinBary[i * 3 + 2] = w;
      const dom = u >= vv && u >= w ? a : (vv >= w ? b : c); // dominant corner's bones
      si[i * 4] = bSI.getX(dom); si[i * 4 + 1] = bSI.getY(dom); si[i * 4 + 2] = bSI.getZ(dom); si[i * 4 + 3] = bSI.getW(dom);
      sw[i * 4] = bSW.getX(dom); sw[i * 4 + 1] = bSW.getY(dom); sw[i * 4 + 2] = bSW.getZ(dom); sw[i * 4 + 3] = bSW.getW(dom);
    }
    const outIdx = [];
    for (const [a, b, c] of tris) if (hitMask[a] && hitMask[b] && hitMask[c]) outIdx.push(a, b, c);
    if (!outIdx.length) { console.warn("[PoseStudio] conformed garment: outline missed the body"); return null; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    geo.setIndex(outIdx);
    geo.computeBoundingSphere();
    const { mat, uThickness } = garmentMat();
    uThickness.value = thickness / wsAvg;
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.frustumCulled = false; mesh.bindMode = body.bindMode; mesh.raycast = () => {};
    body.add(mesh); mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
    mesh.bind(body.skeleton, body.bindMatrix);
    mesh.userData._garment = { conformed: true, uThickness, wsAvg, thickness, pins: { tri: pinTri, bary: pinBary } };
    (fig.garments ||= []).push(mesh);
    return mesh;
  };
  // Lasso → conformed garment: dense-triangulate the outline, then project.
  const buildConformedGarment = (fig, ndcPoly, opts = {}) => {
    const { verts, tris } = denseTriangulate(ndcPoly, opts.subdiv ?? 2);
    return conformFromMesh2D(fig, verts, tris, opts);
  };
  // Trace the OUTER boundary of the painted mask (Moore-neighbour tracing on a downsampled
  // binary grid) → a smooth-ish closed outline in screen px. RDP later removes pixel noise.
  const _MN = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; // 8 neighbours, clockwise (y down)
  const traceMaskOutline = (ctx) => {
    const W = ctx.canvas.width, H = ctx.canvas.height, S = 2; // downsample for speed
    const data = ctx.getImageData(0, 0, W, H).data;
    const gw = Math.ceil(W / S), gh = Math.ceil(H / S), g = new Uint8Array(gw * gh);
    let count = 0, sx = -1, sy = -1;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const px = Math.min(W - 1, x * S), py = Math.min(H - 1, y * S);
      if (data[(py * W + px) * 4 + 3] > 128) { g[y * gw + x] = 1; count++; if (sy < 0) { sx = x; sy = y; } }
    }
    if (sx < 0 || count < 6) return null;
    const at = (x, y) => (x < 0 || y < 0 || x >= gw || y >= gh) ? 0 : g[y * gw + x];
    const dirIdx = (fx, fy, px, py) => { const dx = fx - px, dy = fy - py; for (let i = 0; i < 8; i++) if (_MN[i][0] === dx && _MN[i][1] === dy) return i; return 4; };
    let p = [sx, sy], b = [sx - 1, sy]; const out = [[sx, sy]];
    for (let guard = 0; guard < gw * gh * 8; guard++) {
      const bd = dirIdx(b[0], b[1], p[0], p[1]); let moved = false;
      for (let k = 1; k <= 8; k++) {
        const d = (bd + k) % 8, nx = p[0] + _MN[d][0], ny = p[1] + _MN[d][1];
        if (at(nx, ny)) { b = p; p = [nx, ny]; out.push(p); moved = true; break; }
      }
      if (!moved) break;
      if (p[0] === sx && p[1] === sy) break;
    }
    const crect = canvas.getBoundingClientRect(); // mask px (×S) → screen (canvas-keyed)
    return out.map(([x, y]) => [crect.left + x * S, crect.top + y * S]);
  };
  // A traced screen-px outline → conformed garment: decimate (RDP collapses closed loops),
  // Chaikin-smooth, → NDC → buildConformedGarment.
  const conformFromContour = (fig, outline, opts = {}) => {
    if (!outline || outline.length < 8) return null;
    let pts = outline.filter((_, i) => i % Math.max(1, Math.floor(outline.length / 56)) === 0);
    if (pts.length < 4) return null;
    for (let pass = 0; pass < (opts.smooth ?? 2); pass++) {
      const np = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        np.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      pts = np;
    }
    const cr = canvas.getBoundingClientRect();
    const ndc = pts.map(([x, y]) => [((x - cr.left) / cr.width) * 2 - 1, -(((y - cr.top) / cr.height) * 2 - 1)]);
    return buildConformedGarment(fig, ndc, { ...opts, subdiv: 1 });
  };
  // Brush → one conformed garment from the painted region's outline.
  const buildConformedFromMask = (fig, ctx, opts = {}) => conformFromContour(fig, traceMaskOutline(ctx), opts);
  // Trace EVERY filled blob's outline (one per connected black region) — for image stamps
  // where the picture has several separate shapes (e.g. sparkles).
  const traceAllContours = (ctx) => {
    const W = ctx.canvas.width, H = ctx.canvas.height, S = 2;
    const data = ctx.getImageData(0, 0, W, H).data;
    const gw = Math.ceil(W / S), gh = Math.ceil(H / S), g = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const px = Math.min(W - 1, x * S), py = Math.min(H - 1, y * S); g[y * gw + x] = data[(py * W + px) * 4 + 3] > 128 ? 1 : 0; }
    const at = (x, y) => (x < 0 || y < 0 || x >= gw || y >= gh) ? 0 : g[y * gw + x];
    const dirIdx = (fx, fy, px, py) => { const dx = fx - px, dy = fy - py; for (let i = 0; i < 8; i++) if (_MN[i][0] === dx && _MN[i][1] === dy) return i; return 4; };
    const visited = new Uint8Array(gw * gh), crect = canvas.getBoundingClientRect(), contours = [];
    for (let sy = 0; sy < gh; sy++) for (let sx = 0; sx < gw; sx++) {
      if (!g[sy * gw + sx] || visited[sy * gw + sx]) continue;
      let p = [sx, sy], b = [sx - 1, sy]; const out = [[sx, sy]];
      for (let guard = 0; guard < gw * gh * 8; guard++) {
        const bd = dirIdx(b[0], b[1], p[0], p[1]); let moved = false;
        for (let k = 1; k <= 8; k++) { const d = (bd + k) % 8, nx = p[0] + _MN[d][0], ny = p[1] + _MN[d][1]; if (at(nx, ny)) { b = p; p = [nx, ny]; out.push(p); moved = true; break; } }
        if (!moved) break; if (p[0] === sx && p[1] === sy) break;
      }
      const stack = [[sx, sy]]; visited[sy * gw + sx] = 1; // flood-fill this blob so we don't re-trace it
      while (stack.length) { const [x, y] = stack.pop(); for (const [ox, oy] of _MN) { const nx = x + ox, ny = y + oy; if (at(nx, ny) && !visited[ny * gw + nx]) { visited[ny * gw + nx] = 1; stack.push([nx, ny]); } } }
      if (out.length >= 8) contours.push(out.map(([x, y]) => [crect.left + x * S, crect.top + y * S]));
    }
    return contours;
  };
  // Re-derive a conformed garment's surface positions + normals from its body-triangle
  // pins against the body's CURRENT geometry — so it tracks body-shape sliders (breast,
  // weight…) that move the body's vertices. Pose is already handled by skinning.
  const reprojectGarment = (g) => {
    const gd = g.userData._garment; if (!gd?.pins) return;
    const body = g.parent; if (!body?.isSkinnedMesh) return;
    const bpos = body.geometry.attributes.position, bN = body.geometry.attributes.normal;
    const gp = g.geometry.attributes.position, gn = g.geometry.attributes.normal;
    const tri = gd.pins.tri, bary = gd.pins.bary, n = gp.count;
    for (let i = 0; i < n; i++) {
      const a = tri[i * 3]; if (a < 0) continue;
      const b = tri[i * 3 + 1], c = tri[i * 3 + 2], u = bary[i * 3], v = bary[i * 3 + 1], w = bary[i * 3 + 2];
      gp.setXYZ(i, bpos.getX(a) * u + bpos.getX(b) * v + bpos.getX(c) * w, bpos.getY(a) * u + bpos.getY(b) * v + bpos.getY(c) * w, bpos.getZ(a) * u + bpos.getZ(b) * v + bpos.getZ(c) * w);
      if (bN) gn.setXYZ(i, bN.getX(a) * u + bN.getX(b) * v + bN.getX(c) * w, bN.getY(a) * u + bN.getY(b) * v + bN.getY(c) * w, bN.getZ(a) * u + bN.getZ(b) * v + bN.getZ(c) * w);
    }
    gp.needsUpdate = true; if (bN) gn.needsUpdate = true;
  };
  const reprojectFigureGarments = (fig) => { for (const g of fig?.garments || []) if (g.userData._garment?.pins) reprojectGarment(g); };

  // ── Paint interaction (brush + lasso) ────────────────────────────────────────
  // Both modes drive off the main canvas pointer handlers: LEFT-drag paints, RIGHT-
  // drag orbits (mouseButtons are remapped on enter so you can rotate the body while
  // painting). The lasso draws onto a pointer-events:none overlay for feedback only.
  const clothingPaint = { active: false, mode: "lasso", erase: false, radius: 0.05, thickness: 0.015, brushPx: 26, fig: null, shell: null, painting: false, lasso: null, savedMouseButtons: null, undo: [], selected: null, brushMask: null, brushMaskCtx: null, brushPiece: null, imgStamp: null };
  // Brush = paint a 2D coverage MASK, then build a smooth conformed garment from it (same
  // quality as the lasso, not body-polygon blocks). The mask is an offscreen canvas in
  // container pixels; lassoCanvas shows live feedback.
  const ensureBrushMask = () => {
    if (!clothingPaint.brushMask) clothingPaint.brushMask = document.createElement("canvas");
    const cr = canvas.getBoundingClientRect(); // mask is keyed to the WebGL canvas (same frame projection uses)
    const m = clothingPaint.brushMask, w = Math.max(1, Math.round(cr.width)), h = Math.max(1, Math.round(cr.height));
    if (m.width !== w || m.height !== h) { m.width = w; m.height = h; }
    clothingPaint.brushMaskCtx = m.getContext("2d", { willReadFrequently: true });
  };
  const clearBrushMask = () => { ensureBrushMask(); clothingPaint.brushMaskCtx.clearRect(0, 0, clothingPaint.brushMask.width, clothingPaint.brushMask.height); };
  const maskDab = (e) => {
    if (!clothingPaint.brushMaskCtx) ensureBrushMask();
    const crect = canvas.getBoundingClientRect(); // mask px = canvas-relative px (matches projection)
    const ctx = clothingPaint.brushMaskCtx;
    if (clothingPaint.erase) { ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); ctx.arc(e.clientX - crect.left, e.clientY - crect.top, clothingPaint.brushPx, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(e.clientX - crect.left, e.clientY - crect.top, clothingPaint.brushPx, 0, Math.PI * 2); ctx.fill(); }
    const lr = lassoCanvas.getBoundingClientRect(), lc = lassoCanvas.getContext("2d"); // live feedback
    lc.fillStyle = clothingPaint.erase ? "rgba(255,143,92,0.55)" : "rgba(111,159,224,0.55)";
    lc.beginPath(); lc.arc(e.clientX - lr.left, e.clientY - lr.top, clothingPaint.brushPx, 0, Math.PI * 2); lc.fill();
  };
  const drawBrushRing = (e) => { // hover cursor: a 2D ring at the brush size
    const lc = lassoCanvas.getContext("2d"); lc.clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
    const lr = lassoCanvas.getBoundingClientRect();
    lc.strokeStyle = clothingPaint.erase ? "#ff8f5c" : "#6f9fe0"; lc.lineWidth = 1.5; lc.setLineDash([]);
    lc.beginPath(); lc.arc(e.clientX - lr.left, e.clientY - lr.top, clothingPaint.brushPx, 0, Math.PI * 2); lc.stroke();
  };
  const commitBrushPiece = () => { // rebuild the conformed garment from the accumulated mask
    if (clothingPaint.brushPiece && clothingPaint.fig?.garments?.includes(clothingPaint.brushPiece)) removeGarment(clothingPaint.fig, clothingPaint.brushPiece);
    clothingPaint.brushPiece = buildConformedFromMask(clothingPaint.fig, clothingPaint.brushMaskCtx, { thickness: clothingPaint.thickness });
  };
  const pushBrushUndo = () => { // snapshot the mask before a stroke; undo restores it + rebuilds
    ensureBrushMask();
    const m = clothingPaint.brushMask, snap = clothingPaint.brushMaskCtx.getImageData(0, 0, m.width, m.height);
    pushUndo(() => { ensureBrushMask(); clothingPaint.brushMaskCtx.putImageData(snap, 0, 0); commitBrushPiece(); });
  };
  // ── Image stamp: upload a picture → build a conformed garment piece per black blob ──
  // (e.g. a sheet of sparkles). Place/scale the image over the body, then stamp: dark
  // pixels become the coverage, each separate blob → its own smooth conformed garment.
  const drawImageOverlay = () => {
    const s = clothingPaint.imgStamp; const lc = lassoCanvas.getContext("2d");
    lc.clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
    if (!s) return;
    const lr = lassoCanvas.getBoundingClientRect();
    const w = s.img.width * s.scale, h = s.img.height * s.scale;
    lc.globalAlpha = 0.55; lc.drawImage(s.img, s.cx - lr.left - w / 2, s.cy - lr.top - h / 2, w, h); lc.globalAlpha = 1;
  };
  const enterImageStamp = (img) => {
    const cr = canvas.getBoundingClientRect();
    const scale = (cr.height * 0.4) / img.height; // default ~40% of the frame height
    clothingPaint.imgStamp = { img, cx: cr.left + cr.width / 2, cy: cr.top + cr.height * 0.42, scale, base: scale };
    imgBar.style.display = "flex"; imgScale.value = "1"; drawImageOverlay(); requestRender();
  };
  const cancelImageStamp = () => {
    clothingPaint.imgStamp = null; imgBar.style.display = "none";
    lassoCanvas.getContext("2d").clearRect(0, 0, lassoCanvas.width, lassoCanvas.height); requestRender();
  };
  const stampImage = () => {
    const s = clothingPaint.imgStamp; if (!s) return;
    ensureBrushMask(); const m = clothingPaint.brushMask, W = m.width, H = m.height;
    // rasterize the placed image, threshold dark pixels into a fresh mask
    const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H;
    const tctx = tmp.getContext("2d"); const crect = canvas.getBoundingClientRect();
    const w = s.img.width * s.scale, h = s.img.height * s.scale;
    tctx.drawImage(s.img, (s.cx - crect.left) - w / 2, (s.cy - crect.top) - h / 2, w, h);
    const td = tctx.getImageData(0, 0, W, H).data;
    const mctx = clothingPaint.brushMaskCtx; const mid = mctx.createImageData(W, H), md = mid.data;
    for (let i = 0; i < td.length; i += 4) { const lum = (td[i] + td[i + 1] + td[i + 2]) / 3; if (td[i + 3] > 40 && lum < 110) { md[i] = md[i + 1] = md[i + 2] = md[i + 3] = 255; } }
    mctx.putImageData(mid, 0, 0);
    const contours = traceAllContours(mctx), made = [];
    for (const c of contours) { const g = conformFromContour(clothingPaint.fig, c, { thickness: clothingPaint.thickness, smooth: 1 }); if (g) made.push(g); }
    clearBrushMask();
    cancelImageStamp();
    if (made.length) { pushUndo(() => { for (const g of made) if (clothingPaint.fig?.garments?.includes(g)) removeGarment(clothingPaint.fig, g); }); requestRender(); captureAndUpload(node); showClipToast(`stamped ${made.length} piece${made.length > 1 ? "s" : ""}`); }
    else showClipToast("place the dark shapes over the body, then stamp", true);
    return made.length;
  };
  const pickImageForStamp = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.addEventListener("change", () => { const f = inp.files?.[0]; if (!f) return; const url = URL.createObjectURL(f); const img = new Image(); img.onload = () => { enterImageStamp(img); URL.revokeObjectURL(url); }; img.src = url; });
    inp.click();
  };
  // Click an existing garment piece (in paint mode) to select it — the thickness slider
  // then edits THAT piece, and Del removes it. Garments have their instance raycast
  // disabled (so they never block the brush/figure picks), so pick via the prototype.
  const pickGarmentPiece = (e) => {
    setPointer(e);
    const hits = [];
    for (const g of clothingPaint.fig?.garments || []) {
      if (!g.visible || !g.geometry.index) continue;
      THREE.SkinnedMesh.prototype.raycast.call(g, raycaster, hits);
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0] ? hits[0].object : null;
  };
  const setPieceHighlight = (g) => {
    for (const x of clothingPaint.fig?.garments || []) if (x.material?.emissive) x.material.emissive.setHex(0x000000);
    if (g?.material?.emissive) g.material.emissive.setHex(0x14306a);
  };
  const selectGarmentPiece = (g) => {
    clothingPaint.selected = g || null;
    setPieceHighlight(g);
    if (g) { cpThick.sl.value = String(g.userData._garment.thickness ?? clothingPaint.thickness); showClipToast("piece selected — thickness slider edits it · Del removes it"); }
    requestRender();
  };
  // Paint-local undo = a stack of reverse-closures (covers lasso add, erase, and brush
  // strokes). The poser's ↶ button and Ctrl+Z both route here while paint mode is open.
  // (Full pose-history/serialization is Phase 4.)
  const pushUndo = (fn) => { clothingPaint.undo.push(fn); if (clothingPaint.undo.length > 50) clothingPaint.undo.shift(); };
  const pushPaintUndo = () => { // brush stroke: snapshot the shell's coverage
    const sh = clothingPaint.shell; if (!sh) return;
    const snap = new Set(sh.userData._garment.vertSet);
    pushUndo(() => { if (clothingPaint.fig?.garments?.includes(sh)) { sh.userData._garment.vertSet = snap; rebuildShellIndex(sh); clothingPaint.shell = sh; } });
  };
  const paintUndo = () => {
    if (!clothingPaint.active) return false;
    const fn = clothingPaint.undo.pop();
    if (!fn) { showClipToast("nothing to undo"); return true; }
    try { fn(); } catch (e) { console.warn("[PoseStudio] paint undo failed", e); }
    requestRender();
    captureAndUpload(node);
    return true;
  };
  const lassoCanvas = document.createElement("canvas");
  lassoCanvas.style.cssText = "position:absolute;inset:0;z-index:6;pointer-events:none;display:none;";
  container.appendChild(lassoCanvas);
  // Feedback overlay fills the container (inheriting the graph zoom like everything else).
  // Its backing is sized from its OWN on-screen rect so 1px backing == 1px on screen at any
  // zoom — never from clientWidth (layout px), which diverges from the rect under zoom and
  // was clipping paint at the letterbox gap. Feedback uses lassoCanvas's rect; the coverage
  // mask + projection use the canvas rect — both getBoundingClientRect, so zoom-consistent.
  const positionLassoCanvas = () => {
    // Size the backing from the CONTAINER (the overlay is inset:0, so it fills it). The
    // container is always laid out, so this is correct even when lassoCanvas itself is
    // still display:none on entry — sizing from the hidden overlay's own rect collapsed
    // the backing to 1×1 and the brush cursor/feedback drew into nothing.
    const r = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (lassoCanvas.width !== w || lassoCanvas.height !== h) { lassoCanvas.width = w; lassoCanvas.height = h; }
  };
  const drawLassoLine = () => {
    const c = lassoCanvas.getContext("2d");
    c.clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
    const pts = clothingPaint.lasso;
    if (!pts || pts.length < 2) return;
    const lr = lassoCanvas.getBoundingClientRect();
    c.strokeStyle = clothingPaint.erase ? "#ff8f5c" : "#6f9fe0";
    c.lineWidth = 2; c.lineJoin = "round"; c.lineCap = "round"; c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(pts[0][0] - lr.left, pts[0][1] - lr.top);
    for (const p of pts) c.lineTo(p[0] - lr.left, p[1] - lr.top);
    c.closePath(); c.stroke();
  };
  const pointInPoly = (x, y, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  // Brush footprint ring — a thin annulus laid tangent to the body surface at the
  // cursor, scaled to the brush radius, so you can see how big a dab will be.
  brushCursor = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1.0, 40),
    new THREE.MeshBasicMaterial({ color: GARMENT_COLOR, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false })
  );
  brushCursor.renderOrder = 999; brushCursor.visible = false; brushCursor.raycast = () => {};
  scene.add(brushCursor);
  const _bcN = new THREE.Vector3(), _bcZ = new THREE.Vector3(0, 0, 1), _bcMat3 = new THREE.Matrix3();
  const updateBrushCursor = (e) => {
    if (!clothingPaint.active || clothingPaint.mode !== "brush") { if (brushCursor.visible) { brushCursor.visible = false; requestRender(); } return; }
    const body = garmentBodyOf(clothingPaint.fig); if (!body) return;
    setPointer(e);
    const hit = raycaster.intersectObject(body, false)[0];
    if (!hit) { if (brushCursor.visible) { brushCursor.visible = false; requestRender(); } return; }
    _bcN.copy(hit.face.normal).applyMatrix3(_bcMat3.getNormalMatrix(body.matrixWorld)).normalize();
    brushCursor.position.copy(hit.point).addScaledVector(_bcN, 0.004); // float just off the skin
    brushCursor.quaternion.setFromUnitVectors(_bcZ, _bcN);
    // size the ring to the ACTUAL stamp footprint (same screen-px→world as the paint),
    // so what you see is what you paint
    const rect = canvas.getBoundingClientRect();
    const focalPx = (rect.height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    brushCursor.scale.setScalar(Math.max(0.004, clothingPaint.brushPx * hit.distance / Math.max(1, focalPx)));
    brushCursor.material.color.setHex(clothingPaint.erase ? 0xff8f5c : GARMENT_COLOR);
    brushCursor.visible = true;
    requestRender();
  };
  // Flood the covered set outward from `seeds` over mesh edges, gated by a local-
  // space radius around `centerLocal`. add (default) or erase based on the toggle.
  const brushFloodLocal = (centerLocal, seeds) => {
    const sh = clothingPaint.shell; if (!sh) return;
    const fig = clothingPaint.fig, body = garmentBodyOf(fig); if (!body) return;
    const srcGeo = body.geometry, pos = srcGeo.attributes.position;
    const adj = garmentAdjacency(fig, srcGeo);
    const rLocal = clothingPaint.radius / (sh.userData._garment.wsAvg || 1), r2 = rLocal * rLocal;
    const v = new THREE.Vector3(), vertSet = sh.userData._garment.vertSet;
    const within = (i) => { v.fromBufferAttribute(pos, i); return v.distanceToSquared(centerLocal) <= r2; };
    const visited = new Set(seeds), queue = [...seeds];
    while (queue.length) {
      const i = queue.pop();
      if (!within(i)) continue;
      if (clothingPaint.erase) vertSet.delete(i); else vertSet.add(i);
      for (const nb of adj[i]) if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
    rebuildShellIndex(sh);
    requestRender();
  };
  const brushDabAt = (e) => {
    const body = garmentBodyOf(clothingPaint.fig); if (!body) return;
    setPointer(e);
    const hit = raycaster.intersectObject(body, false)[0];
    if (!hit) return;
    const idx = body.geometry.index, fi = hit.faceIndex;
    const seeds = idx ? [idx.array[fi * 3], idx.array[fi * 3 + 1], idx.array[fi * 3 + 2]] : [fi * 3, fi * 3 + 1, fi * 3 + 2];
    brushFloodLocal(body.worldToLocal(hit.point.clone()), seeds);
  };
  // Lasso: mark every front-facing body vertex whose SKINNED screen position falls
  // inside the drawn polygon. Polygon points are in WebGL-canvas pixels (same space
  // the verts project into), so no overlay-offset math is needed.
  const applyLasso = (poly) => {
    const sh = clothingPaint.shell; if (!sh) return;
    const body = garmentBodyOf(clothingPaint.fig); if (!body) return;
    const srcGeo = body.geometry, pos = srcGeo.attributes.position, nrm = srcGeo.attributes.normal;
    body.updateWorldMatrix(true, false);
    const mw = body.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(mw);
    const cr = canvas.getBoundingClientRect();
    const useGVP = typeof body.getVertexPosition === "function";
    const v = new THREE.Vector3(), nv = new THREE.Vector3(), toCam = new THREE.Vector3(), tmp = new THREE.Vector3();
    const vertSet = sh.userData._garment.vertSet;
    for (let i = 0; i < pos.count; i++) {
      if (useGVP) { body.getVertexPosition(i, tmp); v.copy(tmp).applyMatrix4(mw); } // skinned world (works posed)
      else v.fromBufferAttribute(pos, i).applyMatrix4(mw);
      if (nrm) { nv.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); toCam.subVectors(camera.position, v).normalize(); if (nv.dot(toCam) < 0.05) continue; }
      const p = v.clone().project(camera);
      if (p.z > 1) continue; // behind the camera
      const sx = (p.x * 0.5 + 0.5) * cr.width, sy = (-p.y * 0.5 + 0.5) * cr.height;
      if (pointInPoly(sx, sy, poly)) { if (clothingPaint.erase) vertSet.delete(i); else vertSet.add(i); }
    }
    rebuildShellIndex(sh);
    requestRender();
    captureAndUpload(node);
  };
  // Erase: drop every garment face whose 3 corners all project inside the lasso loop
  // (carve away covered area; a piece fully enclosed is removed). Works across all of
  // the figure's garments. Poly + projected verts compared in canvas pixels.
  const eraseLasso = (screenPoly) => {
    const fig = clothingPaint.fig; if (!fig?.garments?.length) return;
    const cr = canvas.getBoundingClientRect();
    const poly = screenPoly.map(([x, y]) => [x - cr.left, y - cr.top]);
    const v = new THREE.Vector3(), tmp = new THREE.Vector3();
    const changes = []; // {g, prevIndex, removed} — for undo
    for (const g of [...fig.garments]) {
      const geo = g.geometry, idx = geo.index; if (!idx) continue;
      const pos = geo.attributes.position, count = pos.count, useGVP = typeof g.getVertexPosition === "function";
      g.updateWorldMatrix(true, false);
      const inside = new Uint8Array(count);
      for (let i = 0; i < count; i++) {
        if (useGVP) { g.getVertexPosition(i, tmp); v.copy(tmp); } else v.fromBufferAttribute(pos, i);
        v.applyMatrix4(g.matrixWorld);
        const p = v.project(camera);
        if (p.z <= 1 && pointInPoly((p.x * 0.5 + 0.5) * cr.width, (-p.y * 0.5 + 0.5) * cr.height, poly)) inside[i] = 1;
      }
      const arr = idx.array, keep = [];
      for (let i = 0; i < arr.length; i += 3) { if (inside[arr[i]] && inside[arr[i + 1]] && inside[arr[i + 2]]) continue; keep.push(arr[i], arr[i + 1], arr[i + 2]); }
      if (keep.length === arr.length) continue;
      const prevIndex = Array.from(arr);
      if (!keep.length) { // emptied → hide + drop from active (keep the mesh so undo can restore it, don't dispose)
        if (clothingPaint.selected === g) { setPieceHighlight(null); clothingPaint.selected = null; }
        g.visible = false; const k = fig.garments.indexOf(g); if (k >= 0) fig.garments.splice(k, 1);
        changes.push({ g, prevIndex, removed: true });
      } else { geo.setIndex(keep); changes.push({ g, prevIndex, removed: false }); }
    }
    if (changes.length) {
      pushUndo(() => { for (const c of changes) { c.g.geometry.setIndex(c.prevIndex); c.g.visible = true; if (c.removed && !fig.garments.includes(c.g)) fig.garments.push(c.g); } });
      requestRender(); captureAndUpload(node);
    } else showClipToast("nothing to erase there");
  };
  const finishLasso = () => {
    const raw0 = clothingPaint.lasso || [];
    clothingPaint.lasso = null;
    lassoCanvas.getContext("2d").clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
    if (raw0.length < 3) return;
    if (clothingPaint.erase) { eraseLasso(simplifyRDP(raw0, 4)); return; } // erase mode: carve, don't build
    // SIMPLIFY first: a freehand loop has hundreds of points → without this, the dense
    // triangulation explodes into thousands of vertices and the per-vertex body raycast
    // froze the tab. RDP to a clean ~outline; subdivision then refills interior density.
    const raw = simplifyRDP(raw0, 4);
    if (raw.length < 3) return;
    // The outline becomes a SMOOTH clothing piece: its own dense mesh projected onto the
    // body (edges follow the drawn outline, not the body's coarse polygons), skinned to
    // the body skeleton. Cap subdivision by outline complexity to bound the raycast cost.
    // Points are SCREEN coords → convert to NDC via the canvas's live rect.
    const rect = canvas.getBoundingClientRect();
    const ndc = raw.map(([x, y]) => [((x - rect.left) / rect.width) * 2 - 1, -(((y - rect.top) / rect.height) * 2 - 1)]);
    const subdiv = raw.length > 60 ? 1 : 2;
    const m = buildConformedGarment(clothingPaint.fig, ndc, { thickness: clothingPaint.thickness, subdiv });
    if (m) { pushUndo(() => { if (clothingPaint.fig?.garments?.includes(m)) removeGarment(clothingPaint.fig, m); }); requestRender(); captureAndUpload(node); }
    else showClipToast("draw the loop over the body", true);
  };

  // ── Paint mode lifecycle + bottom-left panel ─────────────────────────────────
  const clothingHint = document.createElement("div");
  clothingHint.style.cssText = "position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:8;display:none;padding:3px 10px;background:#2e4d7d;color:#fff;border:1px solid #6f9fe0;border-radius:5px;font:11px/1.4 system-ui,sans-serif;pointer-events:none;white-space:nowrap;";
  container.appendChild(clothingHint);
  const updateClothingHint = () => {
    clothingHint.textContent = clothingPaint.mode === "lasso"
      ? "👕 draw a loop = new piece · click a piece to select (slider=thickness, Del=remove) · right-drag orbits · Esc done"
      : "👕 brush to paint a smooth piece · － erase carves it · right-drag orbits · ＋new for another · Esc done";
  };
  const enterClothingPaint = () => {
    const fig = rig || figures[0];
    if (!garmentBodyOf(fig)) { showClipToast("add a person first to paint clothing on", true); return; }
    if (clothingPaint.active) return;
    clothingPaint.active = true; clothingPaint.fig = fig; clothingPaint.painting = false; clothingPaint.lasso = null;
    detachGizmo(); clearBand();
    // Left now paints; orbit (rotate) moves to right-drag so the body can be turned
    // while painting. Pan/dolly stay reachable via the wheel + middle as before.
    clothingPaint.savedMouseButtons = { ...controls.mouseButtons };
    controls.mouseButtons = { LEFT: null, MIDDLE: controls.mouseButtons.MIDDLE, RIGHT: THREE.MOUSE.ROTATE };
    lassoCanvas.style.display = "block";
    positionLassoCanvas();
    clearBrushMask(); clothingPaint.brushPiece = null; // fresh brush piece
    clothingPanel.style.display = "flex"; clothingHint.style.display = "block";
    syncClothingPanel(); updateClothingHint();
    requestRender();
  };
  const exitClothingPaint = () => {
    if (!clothingPaint.active) return;
    if (clothingPaint.imgStamp) cancelImageStamp();
    clothingPaint.active = false; clothingPaint.painting = false; clothingPaint.lasso = null;
    if (clothingPaint.savedMouseButtons) { controls.mouseButtons = clothingPaint.savedMouseButtons; clothingPaint.savedMouseButtons = null; }
    if (clothingPaint.selected) { setPieceHighlight(null); clothingPaint.selected = null; }
    clothingPaint.brushPiece = null; clearBrushMask();
    clothingPanel.style.display = "none"; clothingHint.style.display = "none";
    lassoCanvas.style.display = "none"; lassoCanvas.getContext("2d").clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
    if (brushCursor) brushCursor.visible = false;
    clothingPaint.undo = [];
    controls.enabled = true;
    requestRender();
    captureAndUpload(node);
  };
  const startNewGarment = () => {
    if (!clothingPaint.active) return;
    if (clothingPaint.selected) { setPieceHighlight(null); clothingPaint.selected = null; } // dropping the edit selection
    clearBrushMask(); clothingPaint.brushPiece = null; // next brush strokes start a new piece (existing one stays)
    requestRender();
  };

  // ── mesh sculpt (grab / inflate / smooth) ───────────────────────────────────
  // A direct-vertex sculptor for reshaping a body region (nudge a breast bigger when the
  // slider can't, fix a shape) or a prop. WHY it stays simple: a figure SNAPS TO REST POSE
  // while sculpting, so bone rotations are identity and an edit written into the rest
  // position buffer is screen-1:1 — no inverse-skinning math. The edit is stored as a sparse
  // rest-space delta (fig.sculptMap / prop mesh.userData.sculptMap) that the custom engine
  // re-adds on every recompute, so it survives slider changes, posing, and serialization.
  const sculpt = {
    active: false, kind: null, target: null, mesh: null, map: null, isEngine: false,
    brush: "grab", radius: 0.06, strength: 0.5, symmetry: true, wire: true, panTool: false, inPose: false,
    painting: false, panning: false, panLast: null, savedMouseButtons: null, poseSnap: null, stroke: null, undo: [],
  };
  let sculptWireBtn = null; // "show mesh" toggle (assigned when the panel is built)
  let sculptPanBtn = null;  // ✋ pan-tool toggle (assigned when the panel is built)
  let sculptPoseBtn = null; // 🧍 edit-in-pose toggle (assigned when the panel is built)
  const SCULPT_BRUSHES = [["grab", "✊ grab"], ["inflate", "🎈 inflate"], ["smooth", "〰 smooth"], ["revert", "↩ revert"]];
  const _scA = new THREE.Vector3(), _scB = new THREE.Vector3(), _scDl = new THREE.Vector3(), _scC = new THREE.Vector3();
  const _scN = new THREE.Vector3(), _scTmp = new THREE.Vector3(), _scAvg = new THREE.Vector3(), _scHit = new THREE.Vector3();
  const _scD2 = new THREE.Vector3(), _scWS = new THREE.Vector3(), _scZ = new THREE.Vector3(0, 0, 1), _scMat3 = new THREE.Matrix3();
  const _scGD = new THREE.Vector3(); // grab delta routed through a vertex's inverse skin (in-pose mode)
  const _isB = new THREE.Vector3(), _isX = new THREE.Vector3(), _isY = new THREE.Vector3(), _isZ = new THREE.Vector3(), _isMat = new THREE.Matrix3();
  // Skinned LOCAL position of vertex i. getVertexPosition seeds rest(+morph) then skins —
  // applyBoneTransform must NOT be called bare: it uses the PASSED vector as the base, so a
  // zero vector skins the ORIGIN (the bug that made the brush only bite where the bogus
  // barycentric center happened to land on geometry).
  const skinV = (mesh, i, out) => {
    if (mesh.getVertexPosition) return mesh.getVertexPosition(i, out);
    out.fromBufferAttribute(mesh.geometry.attributes.position, i);
    return mesh.applyBoneTransform ? mesh.applyBoneTransform(i, out) : mesh.boneTransform(i, out);
  };
  const baryWeights = (p, a, b, c) => {
    const v0x = b.x - a.x, v0y = b.y - a.y, v0z = b.z - a.z;
    const v1x = c.x - a.x, v1y = c.y - a.y, v1z = c.z - a.z;
    const v2x = p.x - a.x, v2y = p.y - a.y, v2z = p.z - a.z;
    const d00 = v0x * v0x + v0y * v0y + v0z * v0z, d01 = v0x * v1x + v0y * v1y + v0z * v1z, d11 = v1x * v1x + v1y * v1y + v1z * v1z;
    const d20 = v2x * v0x + v2y * v0y + v2z * v0z, d21 = v2x * v1x + v2y * v1y + v2z * v1z;
    const den = d00 * d11 - d01 * d01 || 1e-9;
    const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den;
    return [1 - v - w, v, w];
  };
  // Coincident-vertex GROUPS (UV-seam duplicates share a position): the brush moves whole
  // groups so a seam never cracks. Built once per geometry from the original rest positions.
  const sculptGroups = (mesh) => {
    const geo = mesh.geometry;
    if (geo.userData._sculptGroups) return geo.userData._sculptGroups;
    const pos = geo.attributes.position, n = pos.count, byKey = new Map(), reps = [], groupOf = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = Math.round(pos.getX(i) * 1e5) + "_" + Math.round(pos.getY(i) * 1e5) + "_" + Math.round(pos.getZ(i) * 1e5);
      let g = byKey.get(k);
      if (g == null) { g = reps.length; byKey.set(k, g); reps.push({ members: [] }); }
      reps[g].members.push(i); groupOf[i] = g;
    }
    const adjSet = Array.from({ length: reps.length }, () => new Set());
    const edge = (a, b) => { const ga = groupOf[a], gb = groupOf[b]; if (ga !== gb) { adjSet[ga].add(gb); adjSet[gb].add(ga); } };
    const idx = geo.index ? geo.index.array : null;
    if (idx) for (let i = 0; i < idx.length; i += 3) { edge(idx[i], idx[i + 1]); edge(idx[i + 1], idx[i + 2]); edge(idx[i + 2], idx[i]); }
    else for (let i = 0; i + 2 < n; i += 3) { edge(i, i + 1); edge(i + 1, i + 2); edge(i + 2, i); }
    const out = { reps, adj: adjSet.map((s) => [...s]) };
    geo.userData._sculptGroups = out;
    return out;
  };
  // Capture/snap/restore a figure's pose around a sculpt session (snap to rest so edits are
  // screen-1:1; restore the user's pose on exit — the sculpted rest buffer then rides it).
  const sculptSnapPose = (f) => {
    const snap = { q: new Map(), p: new Map(), root: f.root.position.clone() };
    if (f.rest) for (const [j] of f.rest) snap.q.set(j, j.quaternion.clone());
    if (f.restPos) for (const [j] of f.restPos) snap.p.set(j, j.position.clone());
    if (f.curSkelRest) for (const [b] of f.curSkelRest) snap.p.set(b, b.position.clone());
    return snap;
  };
  const sculptApplyRest = (f) => {
    if (f.rest) for (const [j, q] of f.rest) j.quaternion.copy(q);
    if (f.restPos) for (const [j, p] of f.restPos) j.position.copy(p);
    if (f.curSkelRest) for (const [b, p] of f.curSkelRest) b.position.copy(p);
    if (f.rootRest) f.root.position.copy(f.rootRest);
    f.root.updateMatrixWorld(true);
  };
  const sculptRestorePose = (f, snap) => {
    for (const [j, q] of snap.q) j.quaternion.copy(q);
    for (const [o, p] of snap.p) o.position.copy(p);
    f.root.position.copy(snap.root);
    f.root.updateMatrixWorld(true);
  };
  // Set position = base + sculptMap, idempotently (the base snapshot is captured on the first
  // call). Used by non-engine targets (baked-morph bodies + props) which have no re-sum.
  const applySculpt = (mesh, map) => {
    const pos = mesh.geometry.attributes.position, arr = pos.array;
    let base = mesh.userData._sculptBase;
    if (!base) base = mesh.userData._sculptBase = arr.slice();
    arr.set(base);
    if (map) for (const [vi, dv] of map) { const o = vi * 3; if (o + 2 >= arr.length) continue; arr[o] += dv[0]; arr[o + 1] += dv[1]; arr[o + 2] += dv[2]; }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.attributes.normal.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
    if (mesh.geometry.boundingSphere) mesh.geometry.boundingSphere.radius *= 3; // raycast slack
  };
  const sculptPropMesh = (root) => { let m = null; root.traverse((o) => { if (!m && o.isMesh && o.geometry?.attributes?.position) m = o; }); return m; };
  // A prop instance may share a template geometry (model-prop clones); own a private copy
  // before sculpting so other instances aren't mutated.
  const ownPropGeo = (root, mesh) => {
    if (mesh.userData._sculptOwned) return;
    mesh.geometry = mesh.geometry.clone();
    delete mesh.geometry.userData._sculptGroups;
    mesh.userData._sculptOwned = true;
  };
  const sculptRadiusLocal = () => { sculpt.mesh.getWorldScale(_scWS); return sculpt.radius / (Math.abs(_scWS.x) || 1); };
  const worldDirToLocal = (mesh, origin, D) => {
    _scA.copy(origin); mesh.worldToLocal(_scA);
    _scB.copy(origin).add(D); mesh.worldToLocal(_scB);
    return _scDl.copy(_scB).sub(_scA);
  };
  // Inverse of vertex i's linear skinning map A (posed = A·rest + b), so a displacement the
  // user makes on the POSED surface can be written back into the REST buffer (where the sculpt
  // delta lives). Built by probing applyBoneTransform with the basis vectors — no dependency on
  // this three build's internal bind/bone matrices. Returns null if not skinned or A is singular.
  const sculptVertInvSkin = (mesh, i) => {
    if (!mesh.isSkinnedMesh) return null;
    const abt = mesh.applyBoneTransform ? (v) => mesh.applyBoneTransform(i, v) : (v) => mesh.boneTransform(i, v);
    _isB.set(0, 0, 0); abt(_isB); const bx = _isB.x, by = _isB.y, bz = _isB.z;
    _isX.set(1, 0, 0); abt(_isX); _isY.set(0, 1, 0); abt(_isY); _isZ.set(0, 0, 1); abt(_isZ);
    _isMat.set(_isX.x - bx, _isY.x - bx, _isZ.x - bx, _isX.y - by, _isY.y - by, _isZ.y - by, _isX.z - bz, _isY.z - bz, _isZ.z - bz);
    if (Math.abs(_isMat.determinant()) < 1e-9) return null;
    return _isMat.clone().invert();
  };
  // A surface hit on the (rest-)posed mesh → its position in the rest buffer's local space.
  // Skinned: pull the hit's barycentric coords back onto the rest triangle (3 skinning ops,
  // cheap). Static prop: just inverse-transform the world point.
  const restLocalOfHit = (mesh, hit) => {
    if (!mesh.isSkinnedMesh || !hit.face) return mesh.worldToLocal(hit.point.clone());
    const f = hit.face, pos = mesh.geometry.attributes.position;
    const sa = skinV(mesh, f.a, new THREE.Vector3()), sb = skinV(mesh, f.b, new THREE.Vector3()), sc = skinV(mesh, f.c, new THREE.Vector3());
    const hl = mesh.worldToLocal(hit.point.clone());
    const [u, v, wgt] = baryWeights(hl, sa, sb, sc);
    return new THREE.Vector3().fromBufferAttribute(pos, f.a).multiplyScalar(u)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(pos, f.b), v)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(pos, f.c), wgt);
  };
  const sculptRecordOrig = (i) => {
    const rec = sculpt.stroke.rec;
    if (rec.buf.has(i)) return;
    const pos = sculpt.mesh.geometry.attributes.position;
    rec.buf.set(i, [pos.getX(i), pos.getY(i), pos.getZ(i)]);
    rec.mapBefore.set(i, sculpt.map.has(i) ? sculpt.map.get(i).slice() : null);
  };
  // Falloff-weighted groups whose live rep position is within the brush radius of `center`.
  const sculptGatherMembers = (center, rLocal) => {
    const GR = sculptGroups(sculpt.mesh), pos = sculpt.mesh.geometry.attributes.position, r2 = rLocal * rLocal, out = [];
    for (let g = 0; g < GR.reps.length; g++) {
      const i0 = GR.reps[g].members[0];
      _scC.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
      const d2 = _scC.distanceToSquared(center);
      if (d2 > r2) continue;
      const p = 1 - Math.sqrt(d2) / rLocal, w = p * p * (3 - 2 * p); // smoothstep falloff
      for (const i of GR.reps[g].members) out.push({ i, w });
    }
    return out;
  };
  // GRAB snapshots its affected verts + a camera-facing drag plane on press, then reapplies
  // from the originals each frame (elastic, one undo step). Mirror side included for X-symmetry.
  const sculptGatherSides = (hit) => {
    const center = restLocalOfHit(sculpt.mesh, hit), rLocal = sculptRadiusLocal();
    const sides = [{ mirror: false, members: sculptGatherMembers(center, rLocal) }];
    // X-mirror is a rest-space concept; meaningless in an arbitrary pose, so off in in-pose mode.
    if (sculpt.symmetry && sculpt.kind === "figure" && !sculpt.inPose) {
      const mc = center.clone(); mc.x = -mc.x;
      sides.push({ mirror: true, members: sculptGatherMembers(mc, rLocal) });
    }
    // In-pose grab needs each vert's inverse skin so a screen-space drag lands correctly once skinned.
    for (const s of sides) for (const m of s.members) { sculptRecordOrig(m.i); if (sculpt.inPose) m.ainv = sculptVertInvSkin(sculpt.mesh, m.i); }
    return sides;
  };
  const sculptCommitGeo = () => {
    const g = sculpt.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    g.attributes.normal.needsUpdate = true;
    requestRender();
  };
  // INFLATE pushes each group along its averaged normal; SMOOTH relaxes each group toward its
  // neighbours' average (Laplacian). Both record originals for undo. alt = carve (inflate).
  const sculptApplyDab = (center, alt) => {
    const GR = sculptGroups(sculpt.mesh), pos = sculpt.mesh.geometry.attributes.position, nrm = sculpt.mesh.geometry.attributes.normal;
    const rLocal = sculptRadiusLocal(), r2 = rLocal * rLocal, brush = sculpt.stroke.brush;
    for (let g = 0; g < GR.reps.length; g++) {
      const members = GR.reps[g].members, i0 = members[0];
      _scC.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
      const d2 = _scC.distanceToSquared(center);
      if (d2 > r2) continue;
      const p = 1 - Math.sqrt(d2) / rLocal, w = p * p * (3 - 2 * p);
      if (brush === "inflate") {
        _scN.set(0, 0, 0);
        for (const i of members) _scN.add(_scTmp.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)));
        if (_scN.lengthSq() < 1e-9) continue;
        _scN.normalize();
        const amt = w * sculpt.strength * rLocal * 0.2 * (alt ? -1 : 1); // gentle per-dab step (dab spacing controls rate)
        for (const i of members) { sculptRecordOrig(i); pos.setXYZ(i, pos.getX(i) + _scN.x * amt, pos.getY(i) + _scN.y * amt, pos.getZ(i) + _scN.z * amt); }
      } else if (brush === "revert") {
        // Pull each vert toward its UN-sculpted position (pre-stroke pos minus the cumulative
        // sculpt delta). The stroke-end fold then shrinks/clears its map entry. Erases any
        // brush (grab/inflate/smooth) edit locally; full strength fully restores the base.
        const m = Math.min(1, w * sculpt.strength);
        for (const i of members) {
          sculptRecordOrig(i);
          const o = sculpt.stroke.rec.buf.get(i), mb = sculpt.stroke.rec.mapBefore.get(i);
          const tx = o[0] - (mb ? mb[0] : 0), ty = o[1] - (mb ? mb[1] : 0), tz = o[2] - (mb ? mb[2] : 0);
          pos.setXYZ(i, pos.getX(i) + (tx - pos.getX(i)) * m, pos.getY(i) + (ty - pos.getY(i)) * m, pos.getZ(i) + (tz - pos.getZ(i)) * m);
        }
      } else { // smooth
        const adj = GR.adj[g];
        if (!adj.length) continue;
        _scAvg.set(0, 0, 0);
        for (const ng of adj) { const j0 = GR.reps[ng].members[0]; _scAvg.add(_scTmp.set(pos.getX(j0), pos.getY(j0), pos.getZ(j0))); }
        _scAvg.multiplyScalar(1 / adj.length);
        const m = Math.min(1, w * sculpt.strength * 0.7);
        const nx = _scC.x + (_scAvg.x - _scC.x) * m, ny = _scC.y + (_scAvg.y - _scC.y) * m, nz = _scC.z + (_scAvg.z - _scC.z) * m;
        for (const i of members) { sculptRecordOrig(i); pos.setXYZ(i, nx, ny, nz); }
      }
    }
  };
  const sculptDabAt = (hit, alt) => {
    const c = restLocalOfHit(sculpt.mesh, hit);
    sculptApplyDab(c, alt);
    if (sculpt.symmetry && sculpt.kind === "figure" && !sculpt.inPose) { const mc = c.clone(); mc.x = -mc.x; sculptApplyDab(mc, alt); }
    sculptCommitGeo();
  };
  const sculptGrabApply = () => {
    const Dw = _scD2.copy(_scHit).sub(sculpt.stroke.downWorld);
    worldDirToLocal(sculpt.mesh, sculpt.stroke.downWorld, Dw); // fills _scDl
    const pos = sculpt.mesh.geometry.attributes.position;
    for (const s of sculpt.stroke.sides) {
      const sx = s.mirror ? -1 : 1;
      for (const m of s.members) {
        const o = sculpt.stroke.rec.buf.get(m.i);
        let dx = _scDl.x * sx, dy = _scDl.y, dz = _scDl.z;
        if (m.ainv) { _scGD.set(dx, dy, dz).applyMatrix3(m.ainv); dx = _scGD.x; dy = _scGD.y; dz = _scGD.z; } // posed drag → rest-buffer delta
        pos.setXYZ(m.i, o[0] + dx * m.w, o[1] + dy * m.w, o[2] + dz * m.w);
      }
    }
    sculptCommitGeo();
  };
  const sculptStrokeStart = (e) => {
    setPointer(e);
    const hit = raycaster.intersectObject(sculpt.mesh, false)[0];
    if (!hit) return;
    controls.enabled = false;
    sculpt.painting = true;
    sculpt.stroke = { rec: { buf: new Map(), mapBefore: new Map() }, brush: e.shiftKey ? "smooth" : sculpt.brush };
    if (sculpt.stroke.brush === "grab") {
      sculpt.stroke.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.point.clone());
      sculpt.stroke.downWorld = hit.point.clone();
      sculpt.stroke.sides = sculptGatherSides(hit);
    } else {
      sculptDabAt(hit, e.altKey);
      sculpt.stroke.lastDab = hit.point.clone(); // dab-spacing anchor (below)
    }
    sculptUpdateRing(hit);
  };
  const sculptStrokeMove = (e) => {
    if (!sculpt.stroke) return;
    setPointer(e);
    if (sculpt.stroke.brush === "grab") {
      if (raycaster.ray.intersectPlane(sculpt.stroke.plane, _scHit)) sculptGrabApply();
    } else {
      const hit = raycaster.intersectObject(sculpt.mesh, false)[0];
      if (!hit) return;
      // Dab spacing: only deposit a dab once the cursor has travelled a fraction of the brush
      // radius. Makes stroke strength independent of frame rate / mouse speed — without it,
      // inflate balloons (a dab fires on every pointermove, dozens per second).
      const spacing = Math.max(0.004, sculpt.radius * 0.35);
      if (!sculpt.stroke.lastDab || hit.point.distanceTo(sculpt.stroke.lastDab) >= spacing) {
        sculptDabAt(hit, e.altKey);
        sculpt.stroke.lastDab = (sculpt.stroke.lastDab || new THREE.Vector3()).copy(hit.point);
      }
      sculptUpdateRing(hit);
    }
  };
  const sculptStrokeEnd = () => {
    if (!sculpt.stroke) { sculpt.painting = false; controls.enabled = true; return; }
    const pos = sculpt.mesh.geometry.attributes.position, rec = sculpt.stroke.rec;
    // Fold the stroke's net displacement into the cumulative sculpt map (orig = pre-stroke
    // buffer, which already includes base + prior sculpt, so this stays a running total).
    for (const [i, o] of rec.buf) {
      const cx = pos.getX(i) - o[0], cy = pos.getY(i) - o[1], cz = pos.getZ(i) - o[2];
      let dv = sculpt.map.get(i);
      if (!dv) { dv = [0, 0, 0]; sculpt.map.set(i, dv); }
      dv[0] += cx; dv[1] += cy; dv[2] += cz;
      if (Math.abs(dv[0]) < 1e-6 && Math.abs(dv[1]) < 1e-6 && Math.abs(dv[2]) < 1e-6) sculpt.map.delete(i);
    }
    if (!sculpt.isEngine) applySculpt(sculpt.mesh, sculpt.map);
    sculpt.undo.push(rec);
    if (sculpt.undo.length > 20) sculpt.undo.shift();
    sculpt.painting = false; sculpt.stroke = null; controls.enabled = true;
    requestRender();
    captureAndUpload(node);
  };
  const sculptUndo = () => {
    const rec = sculpt.undo.pop();
    if (!rec) return;
    const pos = sculpt.mesh.geometry.attributes.position;
    for (const [i, o] of rec.buf) pos.setXYZ(i, o[0], o[1], o[2]);
    for (const [i, mb] of rec.mapBefore) { if (mb) sculpt.map.set(i, mb.slice()); else sculpt.map.delete(i); }
    if (sculpt.isEngine) sculptCommitGeo(); else applySculpt(sculpt.mesh, sculpt.map);
    requestRender();
    captureAndUpload(node);
  };
  // Brush footprint ring, laid tangent to the surface at the cursor, sized to the world radius.
  sculptRing = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1.0, 40),
    new THREE.MeshBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false })
  );
  sculptRing.renderOrder = 999; sculptRing.visible = false; sculptRing.raycast = () => {};
  scene.add(sculptRing);
  const sculptUpdateRing = (hit) => {
    if (!hit || !sculpt.mesh) { if (sculptRing.visible) { sculptRing.visible = false; requestRender(); } return; }
    _scN.copy(hit.face.normal).applyMatrix3(_scMat3.getNormalMatrix(sculpt.mesh.matrixWorld)).normalize();
    sculptRing.position.copy(hit.point).addScaledVector(_scN, 0.004);
    sculptRing.quaternion.setFromUnitVectors(_scZ, _scN);
    sculptRing.scale.setScalar(Math.max(0.004, sculpt.radius));
    sculptRing.material.color.setHex(sculpt.brush === "smooth" ? 0xbcd0ff : sculpt.brush === "inflate" ? 0x8fe08f : sculpt.brush === "revert" ? 0xff8f5c : 0x6fd3ff);
    sculptRing.visible = true;
    requestRender();
  };
  const sculptHover = (e) => { if (sculpt.panTool) { sculptUpdateRing(null); return; } setPointer(e); sculptUpdateRing(raycaster.intersectObject(sculpt.mesh, false)[0]); };
  // ✋ pan tool: when armed, left-drag pans the view instead of sculpting. More reliable than
  // the left+right chord (which the two-button chord still supports as a shortcut).
  const sculptSetPanTool = (on) => {
    sculpt.panTool = on;
    if (on) sculptUpdateRing(null); // no brush footprint while panning
    if (sculptPanBtn) { sculptPanBtn.style.background = on ? "#2e5d44" : "#2a2a35"; sculptPanBtn.style.borderColor = on ? "#5fbf8c" : "#4a4a55"; }
    requestRender();
  };
  // Toggle editing on the posed surface vs the rest stance. When a figure session is live,
  // re-enter it so the rest-snap (or lack of it) + raycast-slack setup all rerun cleanly.
  const sculptSetInPose = (on) => {
    if (sculpt.inPose === on) return;
    sculpt.inPose = on;
    if (sculpt.active && sculpt.kind === "figure" && !sculpt.painting) { const tgt = sculpt.target; exitSculpt(); enterSculpt("figure", tgt); }
    sculptSyncPanel();
  };
  // "Show mesh" wireframe overlay — shares the target's geometry (so it tracks live edits)
  // and, for figures, its skeleton (so it follows the pose). x-ray (depthTest off) so the
  // whole topology reads through the clay surface. Helps you see vertex density while sculpting.
  const sculptSetWire = (on) => {
    sculpt.wire = on;
    if (on && !sculptWire && sculpt.mesh) {
      const m = sculpt.mesh;
      const mat = new THREE.MeshBasicMaterial({ color: 0x7fd9ff, wireframe: true, transparent: true, opacity: 0.1, depthTest: false });
      if (m.isSkinnedMesh) {
        sculptWire = new THREE.SkinnedMesh(m.geometry, mat);
        sculptWire.bindMode = m.bindMode;
        sculptWire.bind(m.skeleton, m.bindMatrix); // same skeleton+bind → deforms identically
        sculptWire.position.copy(m.position); sculptWire.quaternion.copy(m.quaternion); sculptWire.scale.copy(m.scale);
        (m.parent || scene).add(sculptWire);
      } else {
        sculptWire = new THREE.Mesh(m.geometry, mat);
        m.add(sculptWire); // identity child → inherits the prop's world transform
      }
      sculptWire.frustumCulled = false;
      sculptWire.raycast = () => {}; // never intercept the brush ray
      sculptWire.renderOrder = 998;
    }
    if (sculptWire) sculptWire.visible = on;
    if (sculptWireBtn) { sculptWireBtn.style.background = on ? "#2e5d44" : "#2a2a35"; sculptWireBtn.style.borderColor = on ? "#5fbf8c" : "#4a4a55"; }
    requestRender();
  };
  const sculptDisposeWire = () => {
    if (!sculptWire) return;
    sculptWire.parent?.remove(sculptWire);
    sculptWire.material.dispose(); // geometry is SHARED with the target — never dispose it
    sculptWire = null;
  };
  // Cancel an in-progress stroke without committing (used when a pan chord starts mid-stroke).
  const sculptStrokeAbort = () => {
    if (sculpt.stroke) {
      const pos = sculpt.mesh.geometry.attributes.position;
      for (const [i, o] of sculpt.stroke.rec.buf) pos.setXYZ(i, o[0], o[1], o[2]);
      sculptCommitGeo();
    }
    sculpt.painting = false; sculpt.stroke = null;
  };
  // LEFT+RIGHT held = pan (manual: move camera + orbit target together along the view plane).
  const beginSculptPan = (e) => {
    sculpt.panning = true; sculpt.panLast = { x: e.clientX, y: e.clientY };
    controls.enabled = false; // stop OrbitControls from also orbiting on the right button
    canvas.setPointerCapture?.(e.pointerId);
    if (sculptRing.visible) { sculptRing.visible = false; requestRender(); }
  };
  const sculptPanMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const dist = camera.position.distanceTo(controls.target);
    const worldPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, rect.height);
    const dx = (e.clientX - sculpt.panLast.x) * worldPerPx, dy = (e.clientY - sculpt.panLast.y) * worldPerPx;
    sculpt.panLast.x = e.clientX; sculpt.panLast.y = e.clientY;
    const right = _scA.setFromMatrixColumn(camera.matrix, 0), up = _scB.setFromMatrixColumn(camera.matrix, 1);
    const pan = _scDl.copy(right).multiplyScalar(-dx).add(up.multiplyScalar(dy));
    camera.position.add(pan); controls.target.add(pan);
    controls.update();
    requestRender();
  };
  const endSculptPan = () => {
    if (!sculpt.panning) return;
    sculpt.panning = false; sculpt.panLast = null;
    controls.enabled = true;
    captureAndUpload(node);
  };

  // ── sculpt sub-panel (bottom-left, mirrors the draw panel) ──────────────────
  const sculptPanel = document.createElement("div");
  sculptPanel.style.cssText = "position:absolute;left:6px;bottom:6px;z-index:4;display:none;flex-direction:column;gap:6px;min-width:184px;" +
    "background:rgba(20,20,26,0.9);border:1px solid #4a4a55;border-radius:6px;padding:8px;font:11px system-ui,sans-serif;color:#cdd;";
  sculptPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  const sculptBrushRow = document.createElement("div");
  sculptBrushRow.style.cssText = "display:flex;gap:3px;";
  const sculptBrushBtns = {};
  for (const [key, label] of SCULPT_BRUSHES) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "flex:1 0 auto;padding:3px 6px;background:#2a2a35;color:#cdd;border:1px solid #4a4a55;border-radius:4px;cursor:pointer;font:11px system-ui,sans-serif;white-space:nowrap;";
    b.addEventListener("click", () => { sculpt.brush = key; sculptSetPanTool(false); sculptSyncPanel(); }); // picking a brush leaves pan mode
    sculptBrushBtns[key] = b; sculptBrushRow.appendChild(b);
  }
  sculptPanel.appendChild(sculptBrushRow);
  const scMkSlider = (labelText, min, max, step, val) => {
    const wrap = document.createElement("label"); wrap.style.cssText = "display:flex;align-items:center;gap:6px;";
    const lab = document.createElement("span"); lab.textContent = labelText; lab.style.cssText = "width:52px;flex:0 0 auto;color:#9aa;";
    const sl = document.createElement("input"); sl.type = "range"; sl.min = min; sl.max = max; sl.step = step; sl.value = val;
    sl.style.cssText = "flex:1;accent-color:#6fd3ff;cursor:pointer;";
    sl.addEventListener("pointerdown", (e) => e.stopPropagation());
    wrap.appendChild(lab); wrap.appendChild(sl);
    return { wrap, sl };
  };
  const scRadius = scMkSlider("Size", "0.01", "0.3", "0.005", String(sculpt.radius));
  const scStrength = scMkSlider("Strength", "0.05", "1", "0.05", String(sculpt.strength));
  scRadius.sl.addEventListener("input", () => { sculpt.radius = parseFloat(scRadius.sl.value); });
  scStrength.sl.addEventListener("input", () => { sculpt.strength = parseFloat(scStrength.sl.value); });
  sculptPanel.appendChild(scRadius.wrap); sculptPanel.appendChild(scStrength.wrap);
  const scSymWrap = document.createElement("label"); scSymWrap.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;";
  const scSym = document.createElement("input"); scSym.type = "checkbox"; scSym.checked = sculpt.symmetry;
  scSym.addEventListener("pointerdown", (e) => e.stopPropagation());
  scSym.addEventListener("change", () => { sculpt.symmetry = scSym.checked; });
  const scSymLab = document.createElement("span"); scSymLab.textContent = "⇄ symmetry (X)"; scSymLab.style.color = "#9aa";
  scSymWrap.appendChild(scSym); scSymWrap.appendChild(scSymLab);
  sculptPanel.appendChild(scSymWrap);
  sculptWireBtn = document.createElement("button");
  sculptWireBtn.textContent = "▦ show mesh";
  sculptWireBtn.title = "Show the mesh wireframe so you can see the vertices you're sculpting";
  sculptWireBtn.style.cssText = "padding:3px 6px;background:#2a2a35;color:#cdd;border:1px solid #4a4a55;border-radius:4px;cursor:pointer;font:11px system-ui,sans-serif;";
  sculptWireBtn.addEventListener("click", () => sculptSetWire(!sculpt.wire));
  sculptPanBtn = document.createElement("button");
  sculptPanBtn.textContent = "✋ pan";
  sculptPanBtn.title = "Pan tool — while on, left-drag moves the view (right-drag always orbits)";
  sculptPanBtn.style.cssText = "padding:3px 6px;background:#2a2a35;color:#cdd;border:1px solid #4a4a55;border-radius:4px;cursor:pointer;font:11px system-ui,sans-serif;";
  sculptPanBtn.addEventListener("click", () => sculptSetPanTool(!sculpt.panTool));
  // Figures only: sculpt on the current pose instead of the rest stance (e.g. carve a sole groove
  // on a lifted foot). The edit is mapped back into the rest buffer so it still rides every pose.
  sculptPoseBtn = document.createElement("button");
  sculptPoseBtn.textContent = "🧍 in pose";
  sculptPoseBtn.title = "Sculpt the figure as it's currently posed instead of snapping to the rest stance. X-symmetry is off while on.";
  sculptPoseBtn.style.cssText = "padding:3px 6px;background:#2a2a35;color:#cdd;border:1px solid #4a4a55;border-radius:4px;cursor:pointer;font:11px system-ui,sans-serif;";
  sculptPoseBtn.addEventListener("click", () => sculptSetInPose(!sculpt.inPose));
  sculptPanel.appendChild(sculptPoseBtn);
  const sculptUtilRow = document.createElement("div");
  sculptUtilRow.style.cssText = "display:flex;gap:3px;";
  sculptUtilRow.append(sculptWireBtn, sculptPanBtn);
  sculptWireBtn.style.flex = "1 0 auto"; sculptPanBtn.style.flex = "1 0 auto";
  sculptPanel.appendChild(sculptUtilRow);
  // Props only: add polygons on demand when a shape is too coarse to shape finely.
  const sculptSubdivBtn = document.createElement("button");
  sculptSubdivBtn.textContent = "⊞ subdivide";
  sculptSubdivBtn.title = "Split every face into four — adds polygons so you can shape finer detail (e.g. on a drawn clothing panel)";
  sculptSubdivBtn.style.cssText = "padding:3px 6px;background:#2a2a35;color:#cdd;border:1px solid #4a4a55;border-radius:4px;cursor:pointer;font:11px system-ui,sans-serif;";
  sculptSubdivBtn.addEventListener("click", () => sculptSubdivide());
  sculptPanel.appendChild(sculptSubdivBtn);
  container.appendChild(sculptPanel);
  const sculptHint = document.createElement("div");
  sculptHint.style.cssText = "position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:8;display:none;padding:3px 10px;background:#2e4d7d;color:#fff;border:1px solid #6f9fe0;border-radius:5px;font:11px/1.4 system-ui,sans-serif;pointer-events:none;white-space:nowrap;";
  sculptHint.textContent = "🗿 drag to sculpt · ✋ pan tool (or left+right) moves the view · right-drag orbits · Shift = smooth · Alt = carve · Ctrl+Z undo · Esc done";
  container.appendChild(sculptHint);
  const sculptSyncPanel = () => {
    for (const [k, b] of Object.entries(sculptBrushBtns)) {
      const on = sculpt.brush === k;
      b.style.background = on ? "#2e5d44" : "#2a2a35";
      b.style.borderColor = on ? "#5fbf8c" : "#4a4a55";
    }
    scSymWrap.style.display = sculpt.kind === "figure" ? "flex" : "none";
    const symInactive = sculpt.kind === "figure" && sculpt.inPose; // mirror is rest-space only
    scSymWrap.style.opacity = symInactive ? "0.45" : "1";
    scSymWrap.title = symInactive ? "X-symmetry applies in rest mode only (off while editing in pose)" : "";
    sculptSubdivBtn.style.display = sculpt.kind === "prop" ? "block" : "none"; // subdividing a skinned/morph body would desync skin+morph attrs
    scRadius.sl.value = String(sculpt.radius); scStrength.sl.value = String(sculpt.strength);
    if (sculptPanBtn) { sculptPanBtn.style.background = sculpt.panTool ? "#2e5d44" : "#2a2a35"; sculptPanBtn.style.borderColor = sculpt.panTool ? "#5fbf8c" : "#4a4a55"; }
    if (sculptPoseBtn) { sculptPoseBtn.style.display = sculpt.kind === "figure" ? "block" : "none"; sculptPoseBtn.style.background = sculpt.inPose ? "#2e5d44" : "#2a2a35"; sculptPoseBtn.style.borderColor = sculpt.inPose ? "#5fbf8c" : "#4a4a55"; }
  };
  // Frame the camera on the sculpt target: pivot on its center and dolly so it fills the
  // view (keeps the current view direction). Box from the rest position buffer — close
  // enough for centering without disturbing the raycast-slack boundingSphere.
  const sculptFrameCamera = (mesh) => {
    const geo = mesh.geometry;
    if (!geo.attributes.position) return;
    const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    mesh.updateWorldMatrix(true, false);
    mesh.localToWorld(center);
    const ws = mesh.getWorldScale(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = 0.5 * Math.max(size.x, size.y, size.z) * Math.max(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z)) || 0.5;
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1);
    dir.normalize();
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.15;
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, dist);
    controls.update();
    requestRender();
  };
  const enterSculpt = (kind, target) => {
    if (sculpt.active) return;
    let mesh = null;
    if (kind === "figure") {
      if (target.skinBind) { showClipToast("can't sculpt a bound mesh — reshape uses the body sliders", true); return; }
      mesh = (target.meshes || []).find((m) => m.isSkinnedMesh) || target.morphMesh;
    } else {
      mesh = sculptPropMesh(target);
    }
    if (!mesh) { showClipToast("nothing to sculpt here", true); return; }
    sculpt.active = true; sculpt.kind = kind; sculpt.target = target; sculpt.mesh = mesh;
    sculpt.isEngine = kind === "figure" && !!target.customEngine;
    if (kind === "figure") {
      sculpt.map = target.sculptMap || (target.sculptMap = new Map());
    } else {
      ownPropGeo(target, mesh);
      sculpt.map = target.userData.sculptMap || (target.userData.sculptMap = new Map());
    }
    detachGizmo(); clearBand(); setHover(null);
    // Left-drag sculpts, right-drag orbits, LEFT+RIGHT held = pan (handled manually in the
    // pointer branches — OrbitControls can't map a two-button chord).
    sculpt.savedMouseButtons = { ...controls.mouseButtons };
    controls.mouseButtons = { LEFT: null, MIDDLE: controls.mouseButtons.MIDDLE, RIGHT: THREE.MOUSE.ROTATE };
    if (kind === "figure" && !sculpt.inPose) { sculpt.poseSnap = sculptSnapPose(target); sculptApplyRest(target); }
    if (!sculpt.isEngine) applySculpt(mesh, sculpt.map); // capture a clean base + reapply any existing delta
    else if (kind === "figure" && sculpt.inPose && mesh.geometry.computeBoundingSphere) { mesh.geometry.computeBoundingSphere(); if (mesh.geometry.boundingSphere) mesh.geometry.boundingSphere.radius *= 3; } // raycast slack over the posed surface
    sculptFrameCamera(mesh); // center the view on what you're about to mold
    sculptSetWire(sculpt.wire); // show the mesh wireframe so vertices are visible
    sculptSetPanTool(false); // start in brush mode, not pan
    sculpt.undo = [];
    sculptSyncPanel();
    sculptPanel.style.display = "flex"; sculptHint.style.display = "block";
    figureSculptBtn.style.background = kind === "figure" ? "#2e5d44" : "#2a2a35";
    propSculptBtn.style.background = kind === "prop" ? "#2e5d44" : "#2a2a35";
    requestRender();
  };
  const exitSculpt = () => {
    if (!sculpt.active) return;
    if (sculpt.painting) sculptStrokeEnd();
    sculptDisposeWire();
    if (sculpt.savedMouseButtons) { controls.mouseButtons = sculpt.savedMouseButtons; sculpt.savedMouseButtons = null; }
    if (sculpt.kind === "figure" && sculpt.poseSnap) { sculptRestorePose(sculpt.target, sculpt.poseSnap); sculpt.poseSnap = null; }
    sculptRing.visible = false; sculptPanel.style.display = "none"; sculptHint.style.display = "none";
    figureSculptBtn.style.background = "#2a2a35"; propSculptBtn.style.background = "#2a2a35";
    controls.enabled = true;
    sculpt.active = false; sculpt.painting = false; sculpt.panning = false; sculpt.panLast = null; sculpt.stroke = null; sculpt.undo = [];
    sculpt.mesh = null; sculpt.target = null; sculpt.map = null;
    requestRender();
    captureAndUpload(node);
  };
  // Mesh editor → "⊞ subdivide": split every triangle of the current PROP mesh into four,
  // quadrupling the polygon count so a coarse shape (e.g. a drawn underwear panel) has enough
  // vertices to shape finely. The sculpt delta carries forward — originals keep their indices,
  // new edge-midpoints take the average of their endpoints' deltas — so the current surface is
  // preserved exactly along edges. We subdivide the CLEAN base (not base+delta) and bump a
  // recorded level, so subdivideGeometry's determinism lets the saved delta re-map on reload.
  const sculptSubdivide = () => {
    if (!sculpt.active || sculpt.kind !== "prop" || !sculpt.mesh) return;
    const mesh = sculpt.mesh;
    if (mesh.geometry.attributes.position.count > 40000) { showClipToast("mesh is already very dense", true); return; }
    if (sculpt.painting) sculptStrokeEnd();
    const baseArr = mesh.userData._sculptBase || mesh.geometry.attributes.position.array;
    const baseGeo = new THREE.BufferGeometry();
    baseGeo.setAttribute("position", new THREE.BufferAttribute(baseArr.slice(), 3));
    if (mesh.geometry.index) baseGeo.setIndex(Array.from(mesh.geometry.index.array));
    const { geometry: newBase, parents } = subdivideGeometry(baseGeo);
    baseGeo.dispose();
    const oldMap = sculpt.map, newMap = new Map();
    for (const [i, d] of oldMap) newMap.set(i, d.slice()); // originals keep their index
    for (let i = 0; i < parents.length; i++) {
      const par = parents[i]; if (!par) continue;
      const da = oldMap.get(par[0]), db = oldMap.get(par[1]);
      if (!da && !db) continue;
      const a = da || [0, 0, 0], b = db || [0, 0, 0];
      newMap.set(i, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    }
    mesh.geometry.dispose();
    mesh.geometry = newBase;
    delete mesh.userData._sculptBase; // recapture the (clean) base from newBase on next apply
    mesh.userData._sculptOwned = true;
    sculpt.map = newMap;
    sculpt.target.userData.sculptMap = newMap;
    sculpt.target.userData.subdivLevel = (sculpt.target.userData.subdivLevel || 0) + 1;
    applySculpt(mesh, newMap); // base = newBase + delta → the prior surface, now on a denser mesh
    sculpt.undo = []; // indices changed; old per-stroke snapshots are invalid
    sculptDisposeWire(); sculptSetWire(sculpt.wire); // the wireframe shares geometry by reference — rebuild it
    sculptSyncPanel();
    requestRender();
    showClipToast(`subdivided → ${newBase.attributes.position.count.toLocaleString()} verts`);
  };

  const clothingPanel = document.createElement("div");
  clothingPanel.style.cssText = "position:absolute;left:6px;bottom:6px;z-index:4;display:none;flex-direction:column;gap:6px;min-width:184px;" +
    "background:rgba(20,20,26,0.9);border:1px solid #4a4a55;border-radius:6px;padding:8px;font:11px system-ui,sans-serif;color:#cdd;";
  clothingPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  const cpMkRow = () => { const r = document.createElement("div"); r.style.cssText = "display:flex;gap:4px;"; return r; };
  const cpMkBtn = (label) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "flex:1 0 auto;padding:3px 6px;background:#2a2a35;color:#cdd;border:1px solid #4a4a55;border-radius:4px;cursor:pointer;font:11px system-ui,sans-serif;white-space:nowrap;";
    return b;
  };
  const cpModeRow = cpMkRow();
  const cpBrushBtn = cpMkBtn("🖌 brush"), cpLassoBtn = cpMkBtn("➰ lasso");
  cpModeRow.appendChild(cpBrushBtn); cpModeRow.appendChild(cpLassoBtn);
  const cpEditRow = cpMkRow();
  const cpAddBtn = cpMkBtn("＋ add"), cpEraseBtn = cpMkBtn("－ erase");
  cpEditRow.appendChild(cpAddBtn); cpEditRow.appendChild(cpEraseBtn);
  const cpMkSlider = (label, min, max, step, val) => {
    const wrap = document.createElement("label"); wrap.style.cssText = "display:flex;align-items:center;gap:6px;";
    const lab = document.createElement("span"); lab.textContent = label; lab.style.cssText = "width:52px;flex:0 0 auto;color:#9aa;";
    const sl = document.createElement("input"); sl.type = "range"; sl.min = min; sl.max = max; sl.step = step; sl.value = val;
    sl.style.cssText = "flex:1;accent-color:#6f9fe0;cursor:pointer;";
    wrap.appendChild(lab); wrap.appendChild(sl); return { wrap, lab, sl };
  };
  const cpSize = cpMkSlider("brush", 8, 70, 1, clothingPaint.brushPx);
  const cpThick = cpMkSlider("thick", 0.003, 0.04, 0.001, clothingPaint.thickness);
  const cpImgRow = cpMkRow();
  const cpImgBtn = cpMkBtn("🖼 stamp image");
  cpImgRow.appendChild(cpImgBtn);
  const cpActRow = cpMkRow();
  const cpNewBtn = cpMkBtn("＋ new piece"), cpDoneBtn = cpMkBtn("✓ done");
  cpActRow.appendChild(cpNewBtn); cpActRow.appendChild(cpDoneBtn);
  clothingPanel.appendChild(cpModeRow); clothingPanel.appendChild(cpEditRow);
  clothingPanel.appendChild(cpSize.wrap); clothingPanel.appendChild(cpThick.wrap);
  clothingPanel.appendChild(cpImgRow); clothingPanel.appendChild(cpActRow);
  container.appendChild(clothingPanel);
  cpImgBtn.addEventListener("click", pickImageForStamp);

  // Image-stamp placement bar (shown only while positioning an uploaded image).
  const imgBar = document.createElement("div");
  imgBar.style.cssText = "position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:9;display:none;align-items:center;gap:8px;" +
    "background:rgba(20,20,26,0.92);border:1px solid #6f9fe0;border-radius:6px;padding:5px 9px;font:11px system-ui,sans-serif;color:#cdd;";
  imgBar.addEventListener("pointerdown", (e) => e.stopPropagation());
  const imgHint = document.createElement("span"); imgHint.textContent = "drag to place · scale:"; imgHint.style.color = "#9aa";
  const imgScale = document.createElement("input"); imgScale.type = "range"; imgScale.min = "0.2"; imgScale.max = "3"; imgScale.step = "0.05"; imgScale.value = "1"; imgScale.style.cssText = "width:90px;accent-color:#6f9fe0;cursor:pointer;";
  const imgStampBtn = cpMkBtn("✓ stamp"), imgCancelBtn = cpMkBtn("✕");
  imgStampBtn.style.flex = imgCancelBtn.style.flex = "0 0 auto";
  imgBar.appendChild(imgHint); imgBar.appendChild(imgScale); imgBar.appendChild(imgStampBtn); imgBar.appendChild(imgCancelBtn);
  container.appendChild(imgBar);
  imgScale.addEventListener("input", () => { const s = clothingPaint.imgStamp; if (s) { s.scale = s.base * parseFloat(imgScale.value); drawImageOverlay(); } });
  imgStampBtn.addEventListener("click", stampImage);
  imgCancelBtn.addEventListener("click", cancelImageStamp);
  const syncClothingPanel = () => {
    const onCol = "#2e4d7d", onBorder = "#6f9fe0", offCol = "#2a2a35", offBorder = "#4a4a55";
    const setOn = (b, on) => { b.style.background = on ? onCol : offCol; b.style.borderColor = on ? onBorder : offBorder; };
    setOn(cpBrushBtn, clothingPaint.mode === "brush"); setOn(cpLassoBtn, clothingPaint.mode === "lasso");
    setOn(cpAddBtn, !clothingPaint.erase); setOn(cpEraseBtn, clothingPaint.erase);
    cpSize.wrap.style.display = clothingPaint.mode === "brush" ? "flex" : "none"; // brush radius is meaningless for lasso
  };
  cpBrushBtn.addEventListener("click", () => { clothingPaint.mode = "brush"; updateClothingHint(); syncClothingPanel(); });
  cpLassoBtn.addEventListener("click", () => { clothingPaint.mode = "lasso"; updateClothingHint(); syncClothingPanel(); });
  cpAddBtn.addEventListener("click", () => { clothingPaint.erase = false; syncClothingPanel(); });
  cpEraseBtn.addEventListener("click", () => { clothingPaint.erase = true; syncClothingPanel(); });
  cpSize.sl.addEventListener("input", () => { clothingPaint.brushPx = parseFloat(cpSize.sl.value); });
  cpThick.sl.addEventListener("input", () => {
    const v = parseFloat(cpThick.sl.value);
    const piece = clothingPaint.selected || clothingPaint.brushPiece; // edit the picked piece, else the live brush piece
    if (piece) { setGarmentThickness(piece, v); requestRender(); }
    if (!clothingPaint.selected) clothingPaint.thickness = v; // also the default for new pieces
  });
  cpThick.sl.addEventListener("change", () => captureAndUpload(node));
  cpNewBtn.addEventListener("click", startNewGarment);
  cpDoneBtn.addEventListener("click", exitClothingPaint);

  node._pcrPose = { THREE, scene, camera, renderer, controls, transformControls, rig, figures, propsApi, attachApi, ro, container, requestRender, captureBlob, captureRegionMasks, disposeCapture, recordHistory, onKey, onWinPointerDown, onContextMenu, exitFullscreen, enterDock, exitDock, entityNames: liveEntityNames, renameEntityByName,
    // Headless-harness probe (cheap, read-only) — lets the puppeteer rig see
    // closure state the DOM can't reveal. Not a public API.
    _dbgSculptDiag: (cols = 9, rows = 14) => {
      const fig = selectedFigure || figures[0];
      if (!fig) return { err: "no figure" };
      enterSculpt("figure", fig);
      const mesh = sculpt.mesh, rLocal = sculptRadiusLocal();
      const out = { meshName: mesh.name, skinnedMeshes: (fig.meshes || []).filter((m) => m.isSkinnedMesh).length, verts: mesh.geometry.attributes.position.count, isEngine: sculpt.isEngine, radius: sculpt.radius, worldScale: +mesh.getWorldScale(new THREE.Vector3()).x.toFixed(4), rLocal: +rLocal.toFixed(4), rays: 0, hits: 0, zeroGather: 0, counts: [], deadSamples: [] };
      const ndc = new THREE.Vector2();
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        out.rays++;
        ndc.set((c + 0.5) / cols * 2 - 1, -((r + 0.5) / rows * 2 - 1));
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObject(mesh, false)[0];
        if (!hit) continue;
        out.hits++;
        const center = restLocalOfHit(mesh, hit);
        const n = sculptGatherMembers(center, rLocal).length;
        out.counts.push(n);
        if (n === 0) { out.zeroGather++; if (out.deadSamples.length < 6) out.deadSamples.push([+hit.point.x.toFixed(2), +hit.point.y.toFixed(2), +hit.point.z.toFixed(2)]); }
      }
      const cs = out.counts;
      out.min = cs.length ? Math.min(...cs) : null; out.max = cs.length ? Math.max(...cs) : null;
      out.avg = cs.length ? Math.round(cs.reduce((a, b) => a + b, 0) / cs.length) : null;
      exitSculpt();
      return out;
    },
    _dbgBones: () => ({
      selected: !!selectedProp,
      selBones: selectedProp?.userData?._bones?.length ?? null,
      bonePose: !!bonePoseProp,
      handleCount: boneHandlesGroup.children.length,
      inProps: bonePoseProp ? propsGroup.children.includes(bonePoseProp) : null,
      bonesBtnShown: propBonesBtn.style.display !== "none",
      clipsBtnShown: propClipsBtn.style.display !== "none",
    }),
    _dbgSelectProp: (uid) => {
      const m = propsGroup.children.find((p) => p.userData.uid === uid);
      if (m) selectProp(m);
      return !!m;
    },
    _dbgSelectFigure: (uid) => {
      const f = figures.find((x) => x.uid === uid);
      if (f) { setActiveFigure(f); selectFigure(f); }
      return !!f;
    },
    _dbgSetTool: (t) => { setTransformTool(t); return transformTool; },
    // Parity-harness probes (_headless/parity.mjs): drive IK / mirror / pins on
    // the ACTIVE figure deterministically — these paths are UI-gesture-bound and
    // unreachable from synthetic DOM events.
    _dbgIk: (tip, x, y, z) => {
      const limb = rig && limbFor(rig, tip);
      if (!limb) return false;
      solveIkTo(limb, new THREE.Vector3(x, y, z));
      requestRender();
      return true;
    },
    _dbgMirror: () => { if (!rig) return false; mirror(); return true; },
    _dbgTogglePins: () => { toggleFootPins(); return anyFootPinned(); },
    _dbgEnforcePins: () => { if (!rig) return false; enforceFootPins(); requestRender(); return true; },
    _dbgChainIk: (uid, x, y, z, driveCount, anchorIndex) => { // drive a chain's IK (FABRIK) by uid
      const m = propsGroup.children.find((p) => p.userData.uid === uid && p.userData._chain);
      if (!m) return false;
      if (driveCount == null) solveChainIk(m, new THREE.Vector3(x, y, z));
      else solveChainTo(m, new THREE.Vector3(x, y, z), driveCount, anchorIndex || 0);
      return true;
    },
    _dbgSpawnChain: (type) => { spawnProp(type); const m = [...propsGroup.children].reverse().find((p) => p.userData._chain); return m?.userData.uid ?? null; },
    // Clothing-shell spike probes (_headless/garment.mjs): build/inspect/clear the
    // chest-band garment on a figure (active figure if uid omitted).
    _dbgPaintShell: (uid, thickness) => {
      const f = uid != null ? figures.find((x) => x.uid === uid) : (rig || figures[0]);
      if (!f) return null;
      const s = buildGarmentShell(f, thickness != null ? { thickness } : {});
      return s ? { faces: s.geometry.index.count / 3, garments: f.garments.length } : null;
    },
    _dbgGarments: (uid) => {
      const f = uid != null ? figures.find((x) => x.uid === uid) : (rig || figures[0]);
      return (f?.garments || []).map((g) => ({ faces: g.geometry.index.count / 3, thickness: g.userData._garment.uThickness.value, visible: g.visible }));
    },
    _dbgClearGarments: (uid) => { const f = uid != null ? figures.find((x) => x.uid === uid) : (rig || figures[0]); clearGarments(f); return true; },
    // Paint-mode probes (_headless/garment.mjs): enter paint, dab the brush at a
    // WORLD point (nearest body vert = seed), run a lasso polygon (drawCanvas px),
    // and read the live garment state — gesture paths the DOM can't drive headlessly.
    _dbgEnterPaint: (mode) => { if (mode) clothingPaint.mode = mode; enterClothingPaint(); return clothingPaint.active; },
    _dbgExitPaint: () => { exitClothingPaint(); return true; },
    _dbgSetErase: (on) => { clothingPaint.erase = !!on; return clothingPaint.erase; },
    _dbgBrushWorld: (x, y, z) => {
      if (!clothingPaint.active || !clothingPaint.shell) return null;
      const body = garmentBodyOf(clothingPaint.fig); if (!body) return null;
      const pos = body.geometry.attributes.position, target = body.worldToLocal(new THREE.Vector3(x, y, z));
      let best = -1, bestD = Infinity; const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const d = v.distanceToSquared(target); if (d < bestD) { bestD = d; best = i; } }
      // Flood from the nearest vertex's ACTUAL position (the probe's world point may
      // sit off the surface; brushDabAt uses the true on-surface raycast hit).
      brushFloodLocal(new THREE.Vector3().fromBufferAttribute(pos, best), [best]);
      return clothingPaint.shell.userData._garment.vertSet.size;
    },
    _dbgProject: (x, y, z) => {
      const cr = canvas.getBoundingClientRect();
      const p = new THREE.Vector3(x, y, z).project(camera);
      return [(p.x * 0.5 + 0.5) * cr.width, (-p.y * 0.5 + 0.5) * cr.height];
    },
    // Diagnose the mask brush: project a world point to the cursor, run the real
    // paintMaskAt, report whether the body was hit, the hit uv, the computed radius,
    // and how many mask pixels are now painted. CPU-only (raycast + canvas) so it
    // reproduces the user's machine exactly.
    _dbgPaintWorld: (x, y, z) => {
      const cr = canvas.getBoundingClientRect();
      const p = new THREE.Vector3(x, y, z).project(camera);
      const e = { clientX: cr.left + (p.x * 0.5 + 0.5) * cr.width, clientY: cr.top + (-p.y * 0.5 + 0.5) * cr.height };
      const body = garmentBodyOf(clothingPaint.fig);
      setPointer(e);
      const hit = raycaster.intersectObject(body, false)[0];
      const before = maskPaintedCount();
      paintMaskAt(e);
      const after = maskPaintedCount();
      return { hit: !!hit, uv: hit?.uv ? [+hit.uv.x.toFixed(3), +hit.uv.y.toFixed(3)] : null, dist: hit ? +hit.distance.toFixed(3) : null,
        radiusPx: hit ? +maskRadiusPxAtHit(hit, body, ensureMaskPiece()).toFixed(1) : null, maskBefore: before, maskAfter: after, added: after - before };
    },
    _dbgMaskStats: () => ({ painted: maskPaintedCount(), pieces: (clothingPaint.fig?.garments || []).filter((g) => g.userData._garment.isMaskShell).length }),
    _dbgLasso: (poly) => { applyLasso(poly); return clothingPaint.shell?.userData._garment.vertSet.size ?? null; },
    _dbgPaintInfo: () => ({ active: clothingPaint.active, mode: clothingPaint.mode, erase: clothingPaint.erase,
      shellVerts: clothingPaint.shell?.userData._garment.vertSet.size ?? null,
      shellFaces: clothingPaint.shell?.geometry.index ? clothingPaint.shell.geometry.index.count / 3 : 0,
      garments: clothingPaint.fig?.garments?.length ?? 0 }),
    _dbgPaintSnapshot: () => { pushPaintUndo(); return clothingPaint.undo.length; },
    _dbgPaintUndo: () => { paintUndo(); return clothingPaint.shell?.userData._garment.vertSet.size ?? null; },
    _dbgBrushCursorAt: (clientX, clientY) => { updateBrushCursor({ clientX, clientY }); return { visible: brushCursor.visible, scale: +brushCursor.scale.x.toFixed(3) }; },
    // Conformed-garment spike: build a smooth own-geometry garment from a circle
    // outline (NDC center cx,cy radius r) projected onto the body. Proves the edge is
    // smooth (follows the outline) not blocky (body polygons).
    _dbgConformedTest: (cx = 0, cy = 0.12, r = 0.2, subdiv = 2) => {
      const f = rig || figures[0]; if (!f) return null;
      const N = 64, poly = [];
      for (let i = 0; i < N; i++) { const t = (i / N) * Math.PI * 2; poly.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r * 1.3]); }
      const m = buildConformedGarment(f, poly, { subdiv });
      if (m) { requestRender(); captureAndUpload(node); }
      return m ? { verts: m.geometry.attributes.position.count, faces: m.geometry.index.count / 3 } : null;
    },
    // Drive the REAL lasso→conformed-garment path with SCREEN-coord polygon points.
    _dbgFinishLasso: (polyPx) => { clothingPaint.lasso = polyPx; finishLasso(); return clothingPaint.fig?.garments?.length ?? 0; },
    _dbgSelectPieceByIndex: (i) => { const f = clothingPaint.fig || rig || figures[0]; const g = f?.garments?.[i]; if (g) selectGarmentPiece(g); return g ? g.userData._garment?.uThickness?.value ?? null : null; },
    _dbgSetSelThickness: (v) => { if (!clothingPaint.selected) return null; cpThick.sl.value = String(v); cpThick.sl.dispatchEvent(new Event("input")); return clothingPaint.selected.userData._garment.uThickness.value; },
    _dbgPickAt: (clientX, clientY) => { const g = pickGarmentPiece({ clientX, clientY }); return g ? (clothingPaint.fig.garments.indexOf(g)) : -1; },
    _dbgUndoButton: () => { undo(); return (clothingPaint.fig?.garments || []).filter((g) => g.userData._garment?.conformed && g.visible).length; },
    _dbgRects: () => { const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      return { canvas: r(canvas), container: r(container), lasso: r(lassoCanvas), mask: clothingPaint.brushMask ? [clothingPaint.brushMask.width, clothingPaint.brushMask.height] : null, aspect: +camera.aspect.toFixed(3), drawW: renderer.domElement.width, drawH: renderer.domElement.height }; },
    _dbgBrushStroke: (pts) => {
      pushBrushUndo(); for (const [x, y] of pts) maskDab({ clientX: x, clientY: y }); commitBrushPiece(); captureAndUpload(node);
      const g = clothingPaint.brushPiece; if (!g) return { faces: 0 };
      const p = g.geometry.attributes.position, v = new THREE.Vector3(); g.updateWorldMatrix(true, false);
      let wx = 0, wy = 0, wz = 0; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(g.matrixWorld); wx += v.x; wy += v.y; wz += v.z; }
      const c = new THREE.Vector3(wx / p.count, wy / p.count, wz / p.count).project(camera), cr = canvas.getBoundingClientRect();
      return { faces: g.geometry.index.count / 3, cx: Math.round((c.x * 0.5 + 0.5) * cr.width + cr.left), cy: Math.round((-c.y * 0.5 + 0.5) * cr.height + cr.top) };
    },
    _dbgStampBlobs: (centers, r) => { // simulate the image stamp: N separate filled blobs → N conformed pieces
      ensureBrushMask(); clearBrushMask();
      const crect = canvas.getBoundingClientRect(), mctx = clothingPaint.brushMaskCtx; mctx.fillStyle = "#fff";
      for (const [x, y] of centers) { mctx.beginPath(); mctx.arc(x - crect.left, y - crect.top, r || 18, 0, Math.PI * 2); mctx.fill(); }
      const contours = traceAllContours(mctx), made = [];
      for (const c of contours) { const g = conformFromContour(clothingPaint.fig, c, { thickness: clothingPaint.thickness, smooth: 1 }); if (g) made.push(g); }
      clearBrushMask(); requestRender(); captureAndUpload(node);
      return { contours: contours.length, pieces: made.length };
    },
    _dbgChainPin: (uid, jointIndex, figJoint) => { // combine a chain joint to an active-figure joint
      const m = propsGroup.children.find((p) => p.userData.uid === uid && p.userData._chain);
      if (!m || !rig?.joints?.[figJoint]) return false;
      createChainPin(m, jointIndex, { kind: "joint", fig: rig, joint: figJoint });
      requestRender();
      return true;
    },
    _dbgChainJointWorld: (uid, jointIndex) => { // read a chain joint's world position
      const m = propsGroup.children.find((p) => p.userData.uid === uid && p.userData._chain);
      if (!m) return null;
      enforceAttachments();
      return chainJointWorld(m, jointIndex, new THREE.Vector3()).toArray();
    },
  };
  // enterDock now exists — tell any already-open 3D Poser panel to (re)dock. On
  // workflow load the panel restored open and tried before this assignment.
  poseRegistry.signalReady(node);

  // Reopen a saved workflow: rebuild the full cast, then each figure's pose + the
  // props + camera. Spawns any extra people the save had (figure 0 already exists).
  const restoreSavedState = async () => {
    const raw = node.widgets?.find((w) => w.name === "pose_state")?.value;
    if (!raw) return;
    let data; try { data = JSON.parse(raw); } catch { return; }
    if (!data) return;
    const figData = Array.isArray(data.figures) ? data.figures : [data]; // v2 array | v1 flat
    if (!(await reconcileCast(figData))) return;
    setActiveFigure(activeFromSnapshot(data, figData));
    if (Array.isArray(data.props)) await propsApi.restoreFrom(data.props);
    updatePropLabels(); // restored named props get their region labels back
    attachApi.restoreFrom(data.attachments); // after props + figures exist (indices/uids resolve)
    await syncSkinBinds(); // bound imports (skinBind) rebuild after the cast exists
    updatePinBtn();
    if (data.camera?.position) camera.position.fromArray(data.camera.position);
    if (data.camera?.target) controls.target.fromArray(data.camera.target);
    controls.update();
    refreshMissingUI({ reset: true }); // proactively warn on load if this workflow's meshes aren't on this machine
  };
  await restoreSavedState();
  if (!node._pcrAlive) return;
  // Fresh node (no saved pose): upgrade the default first figure to the 🧬 custom
  // slider body — it couldn't be created at the early first-figure spawn (the
  // slider engine is defined later in this function and would TDZ). Restores and
  // 👤 templates already use custom; this brings a brand-new node in line so the
  // starting mannequin has the full slider panel.
  {
    const savedRaw = node.widgets?.find((w) => w.name === "pose_state")?.value;
    if (!savedRaw && figures.length === 1 && figures[0]?.body === DEFAULT_BODY) {
      const human = figures[0];
      const baseX = human.rootRest?.x ?? human.root.position.x;
      const custom = await spawnFigure({ select: true, capture: false, body: "custom" });
      if (custom && node._pcrAlive) {
        removeFigure(human, { capture: false });
        custom.root.position.x = baseX; // recenter (spawnFigure offsets new people sideways)
        custom.root.updateMatrixWorld(true);
        custom.rootRest = custom.root.position.clone();
      }
    }
  }
  syncBodySliders(); // reflect restored body-shape morphs on the sliders
  if (rig?.morphMesh) { console.log("[PoseStudio DBG] === LOAD BASELINE ==="); debugMorphReport(); } // rig null = restored a figure-less scene
  resize();
  captureAndUpload(node); // seed the control map so a fresh node renders something
  // If dropped into a complete graph (or on workflow load), adopt the latent res.
  requestAnimationFrame(() => syncToLatent(node));
}

function setupPoseStudio(node) {
  node._pcrAlive = true;
  installPoseStyles();
  hideWidget(node, "control_map");
  hideWidget(node, "pose_state");

  const container = document.createElement("div");
  container.className = "pcr-pose-studio";
  container.style.cssText =
    "position:relative;width:100%;height:100%;min-height:120px;" +
    "background:#141418;border-radius:6px;overflow:hidden;touch-action:none;"; // bg shows as the letterbox bars
  isolateViewportEvents(container);

  // Track this Poser for the PromptChain "3D Poser" panel: register its
  // existence (gates the menubar button) and mark it last-interacted so the
  // panel docks whichever Poser you last touched.
  poseRegistry.add(node);
  container.addEventListener("pointerdown", () => poseRegistry.touch(node));

  node.addDOMWidget("pose_studio_view", "pose_studio_view", container, { serialize: false });

  // ("Match output" now lives in the viewport tool strip as the ⟳ icon; auto-sync below
  // still covers mount + connection changes.)

  // Re-sync when this node's own connections change (e.g. wired into a graph).
  const origOnConnectionsChange = node.onConnectionsChange;
  node.onConnectionsChange = function (...args) {
    origOnConnectionsChange?.apply(this, args);
    requestAnimationFrame(() => syncToLatent(node));
  };

  // Node body sizing floor (mirrors main.js: distinguish autogrow's current-size
  // arg from canvas drag-to-resize so a user-resized node isn't slammed back).
  node.computeSize = (out) => {
    if (out) {
      const cur = node.size || MIN_NODE_SIZE;
      return [Math.max(MIN_NODE_SIZE[0], cur[0]), Math.max(MIN_NODE_SIZE[1], cur[1])];
    }
    return [...MIN_NODE_SIZE];
  };
  if (!node.size || node.size[0] < MIN_NODE_SIZE[0] || node.size[1] < MIN_NODE_SIZE[1]) {
    node.setSize?.(node.computeSize());
  }

  const origOnRemoved = node.onRemoved;
  node.onRemoved = function () {
    origOnRemoved?.call(this);
    node._pcrAlive = false;
    poseRegistry.remove(node); // un-gate panels; open panels re-dock or show empty
    viewportContainers.delete(container);
    container._pcrDolly = null; // break the stale-closure chain (the window wheel handler holds the Set)
    const ps = node._pcrPose;
    if (ps) {
      try {
        ps.exitFullscreen?.(); // restore the container's layout before it's removed
        ps.ro.disconnect();
        if (ps.onKey) window.removeEventListener("keydown", ps.onKey, true);
        if (ps.onWinPointerDown) window.removeEventListener("pointerdown", ps.onWinPointerDown, true);
        if (ps.onContextMenu) window.removeEventListener("contextmenu", ps.onContextMenu, true);
        node._pcrMenuCleanup?.(); // portaled flyouts + their close listener (mountViewport scope)
        node._pcrMenuCleanup = null;
        // Not transformControls.dispose(): in three r169 it calls this.traverse and
        // throws (it's no longer an Object3D), aborting teardown. The scene.traverse
        // below frees the gizmo helper's meshes anyway.
        ps.transformControls?.detach();
        ps.disposeCapture?.();
        ps.controls?.dispose?.();
        ps.scene?.traverse((o) => {
          o.geometry?.dispose?.();
          disposeMaterial(o.material); // material + textures
        });
      } catch (e) {
        console.error("[PoseStudio] teardown error", e);
      }
      // Free the WebGL context UNCONDITIONALLY — leaking it across rebuilds (graph
      // undo, etc.) exhausts the browser's context limit, after which new viewports
      // can't compile shaders and render black. Kept in its own try so a failure
      // above can never skip it.
      try {
        ps.renderer?.dispose();
        ps.renderer?.forceContextLoss?.();
        ps.renderer?.domElement?.remove();
      } catch (e) {
        console.error("[PoseStudio] renderer dispose error", e);
      }
      node._pcrPose = null;
    }
  };

  mountViewport(node, container);
}

// ── Detached poser (Re-pose modal) ───────────────────────────────────────────
// Mount a fully standalone poser into an arbitrary element — NOT a LiteGraph
// node, nothing on the user's workflow. The Re-pose feature poses a throwaway
// figure whose control map + masks upload to the input dir; a background recipe
// render then reads those files. Reuses the node's exact viewport + capture
// pipeline via a stub node whose every graph access is guarded (graph === null
// → syncToLatent and downstream tracing no-op). Returns a handle the modal uses
// to read the latest control map, switch output mode (clay vs depth), and tear
// the whole thing down on close.
export async function mountDetachedPoser(parentEl, { width = 832, height = 1216, outputMode = "default", poseState = "" } = {}) {
  installPoseStyles();
  const container = document.createElement("div");
  container.className = "pcr-pose-studio";
  container.style.cssText =
    "position:relative;width:100%;height:100%;min-height:120px;" +
    "background:#141418;border-radius:6px;overflow:hidden;touch-action:none;";
  isolateViewportEvents(container);
  parentEl.appendChild(container);

  const node = {
    id: "repose-poser",
    comfyClass: NODE_TYPE,
    _pcrAlive: true,
    graph: null,
    // Raise fullscreen + menus above the Re-pose modal backdrop (10020) so the
    // poser's ⛶ actually takes over the screen (menus derive to fsZ+9 = 10049).
    properties: { pcrOutputMode: outputMode, pcrTrueDepth: outputMode === "depth", pcrFullscreenZ: 10040 },
    outputs: [],
    widgets: [
      { name: "control_map", value: "" },
      // Seed-before-mount: mountViewport→restoreSavedState reads this widget once
      // at mount, so a seeded scene boots directly (no fragile post-mount load).
      { name: "pose_state", value: poseState || "" },
      { name: "width", value: width },
      { name: "height", value: height },
    ],
    setDirtyCanvas() {},
    setSize() {},
    computeSize() { return [width, height]; },
    addDOMWidget() {},
  };

  poseRegistry.add(node);
  container.addEventListener("pointerdown", () => poseRegistry.touch(node));

  await mountViewport(node, container);

  const ps = () => node._pcrPose;
  const readWidget = (name) => node.widgets.find((w) => w.name === name)?.value;
  // Guarantee an initial capture so getControlMap() returns a map even if the
  // user queues without touching the figure (the default mannequin is valid).
  requestAnimationFrame(() => captureAndUpload(node));

  return {
    node,
    getControlMap() {
      return { filename: readWidget("control_map") || "", poseState: readWidget("pose_state") || "" };
    },
    // Force a fresh capture in `mode` and AWAIT the upload, then return the control
    // map. Called at Run so the recipe always gets the right map (depth for
    // RefControl, white for AnyPose) regardless of what mode the live viewport was
    // last left in — fixes feeding a clay/white render to the depth LoRA.
    async captureNow(mode) {
      if (mode) {
        node.properties.pcrOutputMode = mode;
        node.properties.pcrTrueDepth = mode === "depth";
        ps()?.requestRender?.();
      }
      try { await captureAndUpload(node); } catch (e) { console.error("[Re-pose] captureNow failed", e); }
      return { filename: readWidget("control_map") || "", poseState: readWidget("pose_state") || "" };
    },
    setOutputMode(mode) {
      node.properties.pcrOutputMode = mode;
      node.properties.pcrTrueDepth = mode === "depth";
      ps()?.requestRender?.();
      captureAndUpload(node); // re-upload so the control map reflects clay-vs-depth
    },
    setSize(w, h) {
      const ww = node.widgets.find((x) => x.name === "width"); if (ww) ww.value = w;
      const hh = node.widgets.find((x) => x.name === "height"); if (hh) hh.value = h;
      ps()?.requestRender?.();
      captureAndUpload(node);
    },
    dispose() {
      node._pcrAlive = false;
      poseRegistry.remove(node);
      viewportContainers.delete(container);
      container._pcrDolly = null;
      const p = node._pcrPose;
      if (p) {
        try {
          p.exitFullscreen?.();
          p.ro?.disconnect?.();
          if (p.onKey) window.removeEventListener("keydown", p.onKey, true);
          if (p.onWinPointerDown) window.removeEventListener("pointerdown", p.onWinPointerDown, true);
          if (p.onContextMenu) window.removeEventListener("contextmenu", p.onContextMenu, true);
          node._pcrMenuCleanup?.();
          node._pcrMenuCleanup = null;
          p.transformControls?.detach?.();
          p.disposeCapture?.();
          p.controls?.dispose?.();
          p.scene?.traverse((o) => { o.geometry?.dispose?.(); disposeMaterial(o.material); });
        } catch (e) { console.error("[PoseStudio] detached teardown error", e); }
        try {
          p.renderer?.dispose?.();
          p.renderer?.forceContextLoss?.();
          p.renderer?.domElement?.remove?.();
        } catch (e) { console.error("[PoseStudio] detached renderer dispose error", e); }
        node._pcrPose = null;
      }
      container.remove();
    },
  };
}

app.registerExtension({
  name: "PromptChain.PoseStudio",
  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;
    setupPoseStudio(node);
  },
});
