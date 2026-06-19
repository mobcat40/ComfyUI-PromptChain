# Viewer "Upscale" support: hands the frontend everything it needs to rebuild
# an upscale workflow from a finished image — the embedded workflow JSON from
# the PNG's metadata, the pixel dimensions, and a stable content-addressed copy
# of the image in the input dir for LoadImage to consume.

import asyncio
import hashlib
import io as _io
import json
import os
import re

import folder_paths
import server
from aiohttp import web
from PIL import Image

import node_helpers

from .api_utils import error_response
from .browse_api import _get_scope_root, _validate_path
from .history_db import resolve_image_path

routes = server.PromptServer.instance.routes

# "source", not "upscale": the copy is the ORIGINAL image staged for LoadImage.
# A prefix containing "upscale" read as "this is the upscaled version" and made
# the graft look like it grabbed the wrong image.
_UPSCALE_PREFIX = "promptchain_source_"


def _resolve_request_path(request) -> tuple[str | None, str | None]:
    """(file_path, error) from either ?hash= (DB image) or ?scope=&path= (browse)."""
    image_hash = request.query.get("hash", "").strip()
    if image_hash:
        path = resolve_image_path(image_hash)
        if path and os.path.isfile(str(path)):
            return str(path), None
        return None, "image not found for hash"
    scope = request.query.get("scope", "").strip()
    rel_path = request.query.get("path", "").strip()
    if not scope or not rel_path:
        return None, "need hash or scope+path"
    root = _get_scope_root(scope)
    if not root or not root.is_dir():
        return None, f"invalid scope: {scope}"
    target = _validate_path(root, rel_path)
    if not target or not target.is_file():
        return None, "not found"
    return str(target), None


def _read_image_payload(path: str) -> dict:
    with open(path, "rb") as f:
        raw = f.read()

    # Content-addressed input copy: same image always lands on the same name,
    # so repeat upscales of one image don't pile up files, and the name can
    # never hold different pixels. The copy goes in the input ROOT — LoadImage's
    # combo only lists top-level files (nodes.py os.listdir), so a subfolder
    # path can never be a legal option and permanently flags the node red even
    # though execution resolves it fine. Namespace lives in the filename.
    digest = hashlib.sha256(raw).hexdigest()[:12]
    ext = os.path.splitext(path)[1].lower() or ".png"
    name = f"{_UPSCALE_PREFIX}{digest}{ext}"
    dest = os.path.join(folder_paths.get_input_directory(), name)
    if not os.path.exists(dest):
        with open(dest, "wb") as f:
            f.write(raw)

    img = node_helpers.pillow(Image.open, _io.BytesIO(raw))
    # PNG tEXt lands in .info, iTXt in .text — ComfyUI saves may use either
    # depending on payload encoding, so merge both before reading.
    chunks = dict(img.info or {})
    chunks.update(getattr(img, "text", None) or {})

    def parse(key):
        try:
            value = chunks.get(key)
            if not isinstance(value, str) or not value:
                return None
            # ComfyUI embeds the prompt with is_changed values that can be NaN —
            # Python's json writes the bare NaN literal, which the browser's
            # strict JSON.parse rejects. Map NaN/Infinity to null on the way in
            # so our re-serialization stays valid JSON.
            return json.loads(value, parse_constant=lambda _: None)
        except (json.JSONDecodeError, TypeError):
            return None

    workflow = parse("workflow")
    return {
        "workflow": workflow,
        "prompt": parse("prompt"),
        "width": img.width,
        "height": img.height,
        "input_ref": name,
        "filename": os.path.basename(path),
        # Background mode's queue gate: content-addressed pose files mean
        # existence == proof the rendered maps match the workflow's pose_state,
        # so the client can queue directly instead of waiting for a re-render.
        "pose_files_ok": _pose_files_ok(workflow),
    }


def _pose_files_ok(workflow) -> bool:
    """Every PoseStudio control map the workflow references exists on disk."""
    try:
        nodes = (workflow or {}).get("nodes") or []
        input_dir = folder_paths.get_input_directory()
        for n in nodes:
            if n.get("type") != "PromptChain_PoseStudio":
                continue
            values = n.get("widgets_values") or []
            ref = values[0] if values and isinstance(values[0], str) else ""
            ref = re.sub(r"\s*\[\w+\]$", "", ref.strip())
            if not ref or not os.path.isfile(os.path.join(input_dir, ref)):
                return False
        return True
    except Exception:
        return False


@routes.get("/promptchain/image-workflow")
async def image_workflow(request):
    path, err = _resolve_request_path(request)
    if err:
        return error_response(err, 404 if "not found" in err else 400)
    try:
        payload = await asyncio.to_thread(_read_image_payload, path)
    except (OSError, ValueError) as e:
        return error_response(f"could not read image: {e}", 500)
    return web.json_response(payload)


@routes.get("/promptchain/reveal-file")
async def reveal_file(request):
    """Open the OS file manager with the image selected (local tool affordance).

    Loopback-only: revealing a folder opens a window on the SERVER's desktop,
    which is only meaningful (and only safe) when the requester is that
    machine. The frontend hides the button for non-loopback origins; this is
    the backstop.
    """
    if request.remote not in ("127.0.0.1", "::1"):
        return error_response("reveal is only available from the server machine", 403)
    # Files resolve like image-workflow does (hash or scope+path); the save-
    # path field's folder chips also reveal DIRECTORIES via scope+path.
    is_dir = False
    image_hash = request.query.get("hash", "").strip()
    if image_hash:
        path, err = _resolve_request_path(request)
        if err:
            return error_response(err, 404)
    else:
        root = _get_scope_root(request.query.get("scope", "output").strip() or "output")
        if not root or not root.is_dir():
            return error_response("invalid scope")
        target = _validate_path(root, request.query.get("path", "").strip())
        if not target or not target.exists():
            return error_response("not found", 404)
        path = str(target)
        is_dir = target.is_dir()
    import subprocess
    import sys
    try:
        if sys.platform == "win32":
            # explorer exits non-zero even on success; don't check the code
            if is_dir:
                subprocess.Popen(["explorer", os.path.normpath(path)])
            else:
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path] if is_dir else ["open", "-R", path])
        else:
            subprocess.Popen(["xdg-open", path if is_dir else os.path.dirname(path)])
    except OSError as e:
        return error_response(f"could not open folder: {e}", 500)
    return web.json_response({"ok": True})


@routes.get("/promptchain/open-file")
async def open_file(request):
    """Open the image itself in the OS default application (local tool affordance).

    Loopback-only for the same reason as reveal-file: this launches a program on
    the SERVER's desktop, only meaningful when the requester is that machine.
    """
    if request.remote not in ("127.0.0.1", "::1"):
        return error_response("open is only available from the server machine", 403)
    path, err = _resolve_request_path(request)
    if err:
        return error_response(err, 404)
    import subprocess
    import sys
    try:
        if sys.platform == "win32":
            os.startfile(os.path.normpath(path))  # noqa: S606 — local desktop launch
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except OSError as e:
        return error_response(f"could not open file: {e}", 500)
    return web.json_response({"ok": True})


@routes.get("/promptchain/file-path")
async def file_path(request):
    """Return the resolved absolute disk path for an image so the viewer can copy
    it to the clipboard.

    Loopback-only: the path is a SERVER-machine filesystem path — meaningless on a
    remote client and not worth leaking. The frontend only offers Copy Path to
    local clients; this is the backstop.
    """
    if request.remote not in ("127.0.0.1", "::1"):
        return error_response("file path is only available from the server machine", 403)
    path, err = _resolve_request_path(request)
    if err:
        return error_response(err, 404)
    return web.json_response({"path": os.path.normpath(path)})


def _show_file_properties_win(path):
    """Show the native Windows file-properties sheet for `path`.

    SHObjectProperties creates a MODELESS property sheet that lives on the
    calling thread and needs that thread to pump messages, so this runs on its
    own daemon thread with a self-terminating pump: once the sheet has appeared
    and the thread no longer owns any window, the user has closed it and we exit
    (a plain GetMessage loop would block forever — the sheet posts no WM_QUIT).
    """
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    shell32 = ctypes.windll.shell32
    ole32 = ctypes.windll.ole32
    kernel32 = ctypes.windll.kernel32

    ole32.CoInitialize(None)
    try:
        SHOP_FILEPATH = 0x00000002
        shell32.SHObjectProperties(None, SHOP_FILEPATH, ctypes.c_wchar_p(path), None)

        thread_id = kernel32.GetCurrentThreadId()

        def thread_owns_window():
            found = ctypes.c_bool(False)

            @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
            def _cb(hwnd, lparam):
                found.value = True
                return False  # one is enough; stop enumerating

            user32.EnumThreadWindows(thread_id, _cb, 0)
            return found.value

        PM_REMOVE = 0x0001
        QS_ALLINPUT = 0x04FF
        msg = wintypes.MSG()
        sheet_seen = False
        while True:
            user32.MsgWaitForMultipleObjectsEx(0, None, 200, QS_ALLINPUT, 0)
            while user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, PM_REMOVE):
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
            if thread_owns_window():
                sheet_seen = True
            elif sheet_seen:
                break
    finally:
        ole32.CoUninitialize()


@routes.get("/promptchain/file-properties")
async def file_properties(request):
    """Show the OS file-properties dialog (Windows only)."""
    if request.remote not in ("127.0.0.1", "::1"):
        return error_response("properties is only available from the server machine", 403)
    import sys
    if sys.platform != "win32":
        return error_response("file properties is only available on Windows", 501)
    path, err = _resolve_request_path(request)
    if err:
        return error_response(err, 404)
    import threading
    threading.Thread(
        target=_show_file_properties_win,
        args=(os.path.normpath(path),),
        daemon=True,
    ).start()
    return web.json_response({"ok": True})
