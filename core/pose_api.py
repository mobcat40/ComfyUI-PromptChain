# Pose Studio capture-file maintenance + imported-mesh storage.
#
# The 3D Poser viewport uploads content-addressed capture sets to
# input/promptchain_pose (promptchain_pose_<sha12>.png + _mask<i>.png). Names
# pin content, so sets are never overwritten — superseded ones are deleted here
# instead, and anything a crashed/closed tab missed is collected by an age
# sweep at server start. Legacy node-id-named files (promptchain_pose_<id>) are
# shared across workflows and never touched.
#
# Imported meshes (user .glb/.obj props) live in input/promptchain_meshes as
# <sha16>.<ext> — content-addressed so re-imports dedupe, and referenced from
# pose_state long-term, so they are deliberately OUTSIDE the capture age sweep.

import glob
import hashlib
import json
import os
import re
import time

from aiohttp import web

import folder_paths
import server

from .api_utils import error_response, ok_response, parse_json

routes = server.PromptServer.instance.routes

_HASHED_BASE = re.compile(r"^promptchain_pose_[0-9a-f]{12}$")
_HASHED_FILE = re.compile(r"^promptchain_pose_([0-9a-f]{12})(?:_mask\d+)?\.png$")
_SWEEP_MAX_AGE_DAYS = 30


def _pose_dir() -> str:
    return os.path.join(folder_paths.get_input_directory(), "promptchain_pose")


def _is_hashed(base_or_name: str) -> bool:
    # A 12-digit decimal could in principle be a legacy node id; rule it out so
    # legacy files stay deletable only by hand.
    m = _HASHED_BASE.match(base_or_name)
    return bool(m) and not base_or_name.rsplit("_", 1)[-1].isdigit()


@routes.post("/promptchain/pose-files/delete")
async def delete_pose_files(request):
    data, err = await parse_json(request)
    if err:
        return err
    base = data.get("base", "")
    if not _is_hashed(base):
        return error_response("not a content-addressed pose base")
    if os.path.exists(os.path.join(_pose_dir(), base + ".keep")):
        # A render consumed this set (the PoseStudio node pinned it). The
        # viewport fires this delete on every re-pose to clear the SUPERSEDED
        # set, but a set already baked into a generated image must survive —
        # its per-figure masks are the only copy. Refuse, don't orphan.
        return ok_response({"deleted": [], "kept": True})
    deleted = []
    for path in glob.glob(os.path.join(glob.escape(_pose_dir()), base + "*.png")):
        name = os.path.basename(path)
        if name == base + ".png" or re.match(re.escape(base) + r"_mask\d+\.png$", name):
            try:
                os.remove(path)
                deleted.append(name)
            except OSError:
                pass
    return ok_response({"deleted": deleted})


@routes.post("/promptchain/pose-files/pin")
async def pin_pose_files(request):
    """Mark a content-addressed capture set permanent (write <base>.keep).

    Called when a prompt referencing the set is ENQUEUED, closing the window
    between queue and the node's execute() (which also pins): during a busy
    queue, a re-pose would otherwise fire the superseded-delete on a set whose
    render is still waiting, losing its map + the only copy of its region masks.
    The delete route already refuses any base carrying a .keep.
    """
    data, err = await parse_json(request)
    if err:
        return err
    base = data.get("base", "")
    if not _is_hashed(base):
        return error_response("not a content-addressed pose base")
    pose_dir = _pose_dir()
    # Only pin a set whose map is actually on disk — don't litter markers.
    if not os.path.exists(os.path.join(pose_dir, base + ".png")):
        return ok_response({"pinned": False})
    marker = os.path.join(pose_dir, base + ".keep")
    if not os.path.exists(marker):
        try:
            open(marker, "w").close()
        except OSError as e:
            return error_response(f"could not pin: {e}")
    return ok_response({"pinned": True})


# ── imported meshes (.glb/.obj props) ────────────────────────────────────────

_MESH_EXTS = {".glb", ".gltf", ".obj"}
_MESH_FILE = re.compile(r"^[0-9a-f]{16}\.(glb|gltf|obj)$")
# 96MB: GLB weight is usually embedded TEXTURES, which the importer discards
# (matte prop material) — a 62MB rigged mannequin carried only 84k tris. The
# real viewport budget is triangles, not file bytes.
_MESH_MAX_BYTES = 96 * 1024 * 1024


def _mesh_dir() -> str:
    return os.path.join(folder_paths.get_input_directory(), "promptchain_meshes")


@routes.post("/promptchain/pose-mesh/upload")
async def upload_pose_mesh(request):
    """Store an imported mesh content-addressed: <sha256[:16]>.<ext>.

    Multipart field "mesh" (filename supplies the extension). Same content =
    same name, so duplicate imports are a no-op and pose_state references stay
    valid across workflows. Writes via a temp file + rename so a crashed upload
    never leaves a half-written mesh under a valid hash name.
    """
    reader = await request.multipart()
    part = await reader.next()
    while part is not None and part.name != "mesh":
        part = await reader.next()
    if part is None:
        return error_response("multipart field 'mesh' missing")
    ext = os.path.splitext(part.filename or "")[1].lower()
    if ext not in _MESH_EXTS:
        return error_response(f"unsupported mesh type '{ext}' — expected .glb/.gltf/.obj")
    data = bytearray()
    while True:
        chunk = await part.read_chunk()
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > _MESH_MAX_BYTES:
            return error_response(f"mesh exceeds {_MESH_MAX_BYTES // (1024 * 1024)}MB")
    if not data:
        return error_response("empty upload")
    name = hashlib.sha256(data).hexdigest()[:16] + ext  # hash the bytearray directly — no full copy
    mesh_dir = _mesh_dir()
    os.makedirs(mesh_dir, exist_ok=True)
    path = os.path.join(mesh_dir, name)
    if not os.path.exists(path):
        # Unique temp so two concurrent uploads of the same content (same path)
        # don't write/replace each other's .part mid-flight.
        tmp = f"{path}.part-{os.getpid()}-{os.urandom(4).hex()}"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    return ok_response({"file": name})


def _heal_mesh_name(name: str) -> str | None:
    """Recover a referenced mesh whose file was renamed by hand.

    The canonical filename IS the content hash, so the lookup key is derivable
    from bytes alone: re-hash candidates and rename the match back to its
    canonical name (using the reference's extension — it was minted from the
    original upload, so it's right even if the rename mangled it). Only runs on
    a 404, and only hashes STRAYS: a file still wearing a canonical hash name
    is already addressable (the direct lookup would have found it), so a folder
    of 10,000 well-named meshes costs nothing here — just the handful someone
    renamed.
    """
    want_stem = os.path.splitext(name)[0]
    mesh_dir = _mesh_dir()
    if not os.path.isdir(mesh_dir):
        return None
    for path in glob.glob(os.path.join(glob.escape(mesh_dir), "*")):
        if not os.path.isfile(path) or os.path.splitext(path)[1].lower() not in _MESH_EXTS:
            continue
        if _MESH_FILE.match(os.path.basename(path)):
            continue  # canonical-named = already addressable, can't be the stray we want
        try:
            h = hashlib.sha256()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
            if h.hexdigest()[:16] != want_stem:
                continue
            canonical = os.path.join(mesh_dir, name)
            os.replace(path, canonical)
            print(f"[PoseStudio] healed renamed mesh {os.path.basename(path)} -> {name}")
            return canonical
        except OSError:
            continue
    return None


@routes.get("/promptchain/pose-mesh/{file}")
async def get_pose_mesh(request):
    name = request.match_info["file"]
    if not _MESH_FILE.match(name):
        return error_response("not a content-addressed mesh name")
    path = os.path.join(_mesh_dir(), name)
    if not os.path.isfile(path):
        path = _heal_mesh_name(name)  # renamed by hand? content still finds it
    if not path:
        return error_response("mesh not found", status=404)
    # Content-addressed = immutable: cache hard so restores never refetch.
    return web.FileResponse(path, headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ── user-saved body poses (the 🤸 picker's user layer) ───────────────────────
# Bundled poses ship in code (BODY_POSES, pose-studio.js); user saves land in
# {user}/PromptChain/poses/<slug>.json and the frontend overlays them by NAME —
# a user pose named like a bundled one shadows it (the templates/prompts delta
# model). One file per pose: {"name", "rig", "pose": {joints, spine, digits}}.

_POSE_PRESET_MAX_BYTES = 256 * 1024


def _pose_presets_dir() -> str:
    return os.path.join(folder_paths.get_user_directory(), "PromptChain", "poses")


def _pose_preset_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or hashlib.sha256(name.encode()).hexdigest()[:12]


@routes.get("/promptchain/pose-presets/list")
async def list_pose_presets(request):
    out = []
    presets_dir = _pose_presets_dir()
    if os.path.isdir(presets_dir):
        for path in sorted(glob.glob(os.path.join(glob.escape(presets_dir), "*.json"))):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, ValueError):
                continue
            if isinstance(data, dict) and data.get("name") and isinstance(data.get("pose"), dict):
                out.append({"name": data["name"], "rig": data.get("rig") or "human", "pose": data["pose"]})
    return web.json_response({"poses": out})


@routes.post("/promptchain/pose-presets")
async def save_pose_preset(request):
    data, err = await parse_json(request)
    if err:
        return err
    name = (data.get("name") or "").strip()
    pose = data.get("pose")
    if not name or len(name) > 64:
        return error_response("pose name must be 1-64 characters")
    if not isinstance(pose, dict) or not isinstance(pose.get("joints"), dict):
        return error_response("pose must carry a joints map")
    payload = {"name": name, "rig": (data.get("rig") or "human"), "pose": pose}
    blob = json.dumps(payload, indent=2)
    if len(blob) > _POSE_PRESET_MAX_BYTES:
        return error_response("pose too large")
    presets_dir = _pose_presets_dir()
    os.makedirs(presets_dir, exist_ok=True)
    path = os.path.join(presets_dir, _pose_preset_slug(name) + ".json")
    if os.path.exists(path):
        # Unique-name-on-write: refuse to clobber an existing saved pose. The client
        # pre-checks too, but enforce it here so the write site is authoritative
        # (a second tab, or two names that slugify alike, can't silently overwrite).
        return error_response(f'A pose named "{name}" already exists', status=409)
    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(blob)
    os.replace(tmp, path)  # atomic: a crashed save never leaves a half-written pose
    return ok_response({"name": name})


@routes.delete("/promptchain/pose-presets/{name}")
async def delete_pose_preset(request):
    name = request.match_info["name"]
    path = os.path.join(_pose_presets_dir(), _pose_preset_slug(name) + ".json")
    try:
        os.remove(path)
    except FileNotFoundError:
        # Already gone (e.g. a second tab deleted it) — the user's intent is
        # satisfied; report 404 rather than 500ing on the lost race.
        return error_response("not found", status=404)
    except OSError as e:
        return error_response(f"could not delete: {e}")
    return ok_response()


def _sweep_aged_captures() -> None:
    pose_dir = _pose_dir()
    if not os.path.isdir(pose_dir):
        return
    cutoff = time.time() - _SWEEP_MAX_AGE_DAYS * 86400
    # Pinned bases were consumed by a render (the PoseStudio node drops a
    # `<base>.keep`); a generated image needs them indefinitely, so age never
    # collects them.
    pinned = {
        os.path.basename(p)[:-5]
        for p in glob.glob(os.path.join(glob.escape(pose_dir), "promptchain_pose_*.keep"))
    }
    swept = 0
    for path in glob.glob(os.path.join(glob.escape(pose_dir), "promptchain_pose_*.png")):
        m = _HASHED_FILE.match(os.path.basename(path))
        if not m or m.group(1).isdigit():
            continue
        if f"promptchain_pose_{m.group(1)}" in pinned:
            continue
        try:
            if os.path.getmtime(path) < cutoff:
                os.remove(path)
                swept += 1
        except OSError:
            pass
    # Drop orphaned pins whose capture set is already gone (hand-deleted, etc.)
    # so markers don't leak forever.
    for marker in glob.glob(os.path.join(glob.escape(pose_dir), "promptchain_pose_*.keep")):
        if not os.path.exists(marker[:-5] + ".png"):
            try:
                os.remove(marker)
            except OSError:
                pass
    if swept:
        print(f"[PoseStudio] swept {swept} pose capture file(s) older than {_SWEEP_MAX_AGE_DAYS} days")


_sweep_aged_captures()
