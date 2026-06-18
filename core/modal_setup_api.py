# Per-image modal-setup persistence: the last Upscale / Inpaint / Re-pose setup
# for an image, so reopening a render modal can restore the user's work and
# survive a restart. A SIBLING of edit-docs keyed by the SAME content hash
# (the viewer's displayedHash == the editor's editDocHash, which is edit-stable):
# {user}/PromptChain/modal-setup/<hash>/manifest.json + optional binary planes.
#
#   manifest = {"version", "dims": {"w","h"}, "kinds": {"upscale": {...},
#               "inpaint": {...}, "repose": {...}}}
#
# One POST MERGES a single kind, so the three tools never clobber each other's
# setup for the same image. Planes (e.g. the inpaint mask) are namespaced
# "<kind>__<name>.png". LRU size budget; touch-on-read survives eviction.
# Routes register at import time -> needs a server restart to take effect.

import asyncio
import json
import os
import re
import shutil
import time

import folder_paths
import server
from aiohttp import web

from .api_utils import error_response

routes = server.PromptServer.instance.routes

_BUDGET_BYTES = 512 * 1024 ** 2  # setups are tiny; mask planes dominate. 512 MB is plenty.
_SCHEMA_VERSION = 1
_HASH_RE = re.compile(r"[0-9a-f]{64}")
_KIND_RE = re.compile(r"[a-z]+")
_PLANE_RE = re.compile(r"[a-z]+__[a-z0-9_]+\.png")  # e.g. inpaint__mask.png


def _root() -> str:
    return os.path.join(folder_paths.get_user_directory(), "PromptChain", "modal-setup")


def _rmtree_robust(path: str, tries: int = 6) -> None:
    for _ in range(tries):
        shutil.rmtree(path, ignore_errors=True)
        if not os.path.exists(path):
            return
        time.sleep(0.05)


def _dir_size(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total


def _evict(keep_hash: str) -> None:
    """LRU by manifest mtime until under budget; never evict keep_hash."""
    root = _root()
    try:
        names = os.listdir(root)
    except OSError:
        return
    entries, total = [], 0
    for name in names:
        path = os.path.join(root, name)
        if not os.path.isdir(path):
            continue
        size = _dir_size(path)
        total += size
        manifest = os.path.join(path, "manifest.json")
        try:
            mtime = os.path.getmtime(manifest if os.path.isfile(manifest) else path)
        except OSError:
            mtime = 0
        entries.append((mtime, size, name, path))
    if total <= _BUDGET_BYTES:
        return
    entries.sort()  # oldest first
    for _mtime, size, name, path in entries:
        if total <= _BUDGET_BYTES:
            break
        if name == keep_hash:
            continue
        _rmtree_robust(path)
        total -= size


def _manifest_path(h: str) -> str:
    return os.path.join(_root(), h, "manifest.json")


def _read_manifest(h: str) -> dict:
    try:
        with open(_manifest_path(h), "r", encoding="utf-8") as fp:
            data = json.load(fp)
        if isinstance(data, dict):
            data.setdefault("kinds", {})
            return data
    except (OSError, ValueError):
        pass
    return {"version": _SCHEMA_VERSION, "dims": None, "kinds": {}}


def _form_text(val) -> str | None:
    """A multipart field that may arrive as a str or a file part."""
    if val is None:
        return None
    if isinstance(val, str):
        return val
    f = getattr(val, "file", None)
    return f.read().decode("utf-8") if f is not None else None


@routes.post("/promptchain/modal-setup/{hash}")
async def save_modal_setup(request):
    h = request.match_info.get("hash", "")
    if not _HASH_RE.fullmatch(h):
        return error_response("invalid hash")
    form = await request.post()
    kind = _form_text(form.get("kind")) or ""
    if not _KIND_RE.fullmatch(kind):
        return error_response("invalid kind")
    try:
        kind_data = json.loads(_form_text(form.get("data")) or "{}")
    except ValueError:
        return error_response("invalid data json")
    dims = None
    dims_text = _form_text(form.get("dims"))
    if dims_text:
        try:
            dims = json.loads(dims_text)
        except ValueError:
            dims = None
    planes = {}
    for key, val in form.items():
        if key in ("kind", "data", "dims") or not _PLANE_RE.fullmatch(key):
            continue
        f = getattr(val, "file", None)
        if f is not None:
            planes[key] = f.read()

    def _write():
        doc_dir = os.path.join(_root(), h)
        os.makedirs(doc_dir, exist_ok=True)
        manifest = _read_manifest(h)
        manifest["version"] = _SCHEMA_VERSION
        if dims is not None:
            manifest["dims"] = dims
        manifest["kinds"][kind] = kind_data
        with open(os.path.join(doc_dir, "manifest.json"), "w", encoding="utf-8") as fp:
            json.dump(manifest, fp)
        for name, content in planes.items():
            with open(os.path.join(doc_dir, name), "wb") as fp:
                fp.write(content)
        _evict(h)

    try:
        await asyncio.to_thread(_write)
    except OSError as e:
        return error_response(f"could not save modal setup: {e}", 500)
    return web.json_response({"ok": True})


@routes.get("/promptchain/modal-setup/{hash}")
async def get_modal_setup(request):
    h = request.match_info.get("hash", "")
    if not _HASH_RE.fullmatch(h):
        return error_response("invalid hash")
    path = _manifest_path(h)
    if not os.path.isfile(path):
        return web.json_response({"exists": False}, status=404)
    try:
        os.utime(path, None)  # LRU touch — reopened setups survive eviction
    except OSError:
        pass
    return web.FileResponse(path)


@routes.get("/promptchain/modal-setup/{hash}/{file}")
async def get_modal_setup_file(request):
    h = request.match_info.get("hash", "")
    fname = request.match_info.get("file", "")
    if not _HASH_RE.fullmatch(h) or not _PLANE_RE.fullmatch(fname):
        return error_response("invalid request")
    root = os.path.normpath(_root())
    path = os.path.normpath(os.path.join(root, h, fname))
    if not path.startswith(root) or not os.path.isfile(path):
        return web.Response(status=404)
    return web.FileResponse(path)


@routes.delete("/promptchain/modal-setup/{hash}")
async def delete_modal_setup(request):
    # ?kind=<x> drops one tool's setup (+ its planes); no kind drops the whole
    # image's sidecar. Idempotent: a missing dir/kind is fine. Used to invalidate
    # a stale setup when content is unchanged (same hash), like edit-doc flatten.
    h = request.match_info.get("hash", "")
    if not _HASH_RE.fullmatch(h):
        return error_response("invalid hash")
    kind = request.rel_url.query.get("kind", "")

    def _delete():
        doc_dir = os.path.join(_root(), h)
        if kind and _KIND_RE.fullmatch(kind):
            manifest = _read_manifest(h)
            manifest["kinds"].pop(kind, None)
            try:
                for name in os.listdir(doc_dir):
                    if name.startswith(f"{kind}__"):
                        try:
                            os.remove(os.path.join(doc_dir, name))
                        except OSError:
                            pass
            except OSError:
                pass
            if manifest["kinds"]:
                try:
                    with open(_manifest_path(h), "w", encoding="utf-8") as fp:
                        json.dump(manifest, fp)
                except OSError:
                    pass
            else:
                _rmtree_robust(doc_dir)
        else:
            _rmtree_robust(doc_dir)

    await asyncio.to_thread(_delete)
    return web.json_response({"ok": True})
