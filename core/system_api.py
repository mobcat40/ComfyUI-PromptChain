# System API — checkpoint file operations, checkpoint watching,
# folder access, server restart, and model file existence checks.

import os
import asyncio
import subprocess
import threading
from pathlib import Path

from aiohttp import web
import folder_paths
import server

from . import civitai
from . import model_settings
from .api_utils import error_response, parse_json
from .shared import send_ws

routes = server.PromptServer.instance.routes


# ── helpers ──────────────────────────────────────────────────────

def _list_checkpoint_files():
    files = []
    for folder_type in ("checkpoints", "diffusion_models", "unet"):
        try:
            for folder in folder_paths.get_folder_paths(folder_type):
                if not os.path.isdir(folder):
                    continue
                for fname in os.listdir(folder):
                    if fname.lower().endswith((".safetensors", ".gguf")):
                        files.append(fname)
        except Exception:
            pass
    return files


def _checkpoint_file_size(fname):
    """Return file size in bytes, or -1 if not found."""
    for folder_type in ("checkpoints", "diffusion_models", "unet"):
        try:
            for folder in folder_paths.get_folder_paths(folder_type):
                path = os.path.join(folder, fname)
                if os.path.isfile(path):
                    return os.path.getsize(path)
        except Exception:
            pass
    return -1


_file_exists_in_folder = model_settings._file_exists_in_folder


# ── file check endpoint ──────────────────────────────────────────

@routes.post("/promptchain/models/check-files")
async def _api_check_files(request):
    """Check which files from a model preset exist locally.

    Expects JSON body: { files: [{filename, folder}, ...] }
    Returns: { results: [{filename, folder, exists}, ...] }
    """
    body, err = await parse_json(request)
    if err: return err

    files = body.get("files", [])
    results = []
    for f in files:
        filename = f.get("filename", "")
        folder_type = f.get("folder", "")
        size_bytes = f.get("size_bytes", 0) or 0
        results.append({
            "filename": filename,
            "folder": folder_type,
            "exists": _file_exists_in_folder(filename, folder_type, size_bytes) if filename and folder_type else False,
        })
    return web.json_response({"results": results})


# ── checkpoint listing ───────────────────────────────────────────

@routes.get("/promptchain/system/checkpoint-files")
async def _api_checkpoint_files(request):
    return web.json_response({"files": _list_checkpoint_files()})


# ── checkpoint watch (wait for new file to finish copying) ───────

_checkpoint_watch_task: asyncio.Task | None = None


@routes.post("/promptchain/system/watch-checkpoints")
async def _api_watch_checkpoints(request):
    """Watch for a new checkpoint file that finishes copying. Sends promptchain_new_checkpoint via WebSocket."""
    global _checkpoint_watch_task
    if _checkpoint_watch_task and not _checkpoint_watch_task.done():
        _checkpoint_watch_task.cancel()

    if request.content_length:
        body, err = await parse_json(request)
        if err: return err
    else:
        body = {}
    expected_size_bytes = int(body.get("expected_size_gb", 0) * (1024 ** 3))
    expected_filename = body.get("expected_filename", "")

    # If the expected file already exists, notify immediately
    current_files = set(_list_checkpoint_files())
    if expected_filename and expected_filename in current_files:
        send_ws("promptchain_new_checkpoint", {"filename": expected_filename})
        return web.json_response({"status": "already_exists"})

    known = set(current_files)

    def _size_matches(actual_bytes: int) -> bool:
        if not expected_size_bytes:
            return True
        return expected_size_bytes * 0.5 <= actual_bytes <= expected_size_bytes * 1.5

    async def _watch():
        pending_sizes: dict[str, int] = {}
        for _ in range(100):  # ~5 min at 3s intervals
            await asyncio.sleep(3)
            current = set(_list_checkpoint_files())
            new_files = current - known
            if not new_files:
                if pending_sizes:
                    pending_sizes.clear()
                continue
            for fname in new_files:
                size = _checkpoint_file_size(fname)
                prev = pending_sizes.get(fname, -1)
                if size > 0 and size == prev:
                    if _size_matches(size):
                        send_ws("promptchain_new_checkpoint", {"filename": fname})
                        return
                    else:
                        known.add(fname)
                pending_sizes[fname] = size

    _checkpoint_watch_task = asyncio.ensure_future(_watch())
    return web.json_response({"status": "ok"})


@routes.post("/promptchain/system/stop-watch-checkpoints")
async def _api_stop_watch_checkpoints(request):
    global _checkpoint_watch_task
    if _checkpoint_watch_task and not _checkpoint_watch_task.done():
        _checkpoint_watch_task.cancel()
        _checkpoint_watch_task = None
    return web.json_response({"status": "ok"})


# ── folder + system endpoints ────────────────────────────────────

def _resolve_folder_path(folder_type: str) -> str:
    """Resolve a folder_paths key to an absolute directory.  Mirrors
    civitai.download_model's logic: prefer the directory whose basename
    matches the key, since folder_paths often aliases (e.g. "unet" as
    the first entry for "diffusion_models") and picking [0] can land
    files in the wrong place."""
    import folder_paths
    try:
        candidates = folder_paths.get_folder_paths(folder_type)
    except Exception:
        return ""
    for d in candidates:
        if os.path.basename(d) == folder_type:
            return d
    return candidates[0] if candidates else ""


@routes.post("/promptchain/system/open-folder")
async def _api_open_folder(request):
    """Open a model folder in the OS file manager.

    Accepts optional JSON body {folder: "checkpoints"} (default
    "checkpoints" for backward compat with the original checkpoints-
    only endpoint)."""
    folder_type = "checkpoints"
    try:
        data = await request.json()
        if isinstance(data, dict) and data.get("folder"):
            folder_type = str(data["folder"]).strip() or "checkpoints"
    except Exception:
        pass
    folder = _resolve_folder_path(folder_type)
    if not folder:
        return error_response("folder not found", 404)
    from pathlib import Path
    resolved = str(Path(folder).resolve())
    if not os.path.isdir(resolved):
        return error_response("folder not found", 404)
    import subprocess, sys
    # Use list-form subprocess across platforms — no shell parsing of
    # path contents (ampersands, quotes, etc.).  explorer.exe is the
    # shell-safe equivalent of os.startfile on Windows.
    if sys.platform == "win32":
        subprocess.Popen(["explorer.exe", resolved])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", resolved])
    else:
        subprocess.Popen(["xdg-open", resolved])
    return web.json_response({"status": "ok"})


@routes.get("/promptchain/system/folder-path")
async def _api_folder_path(request):
    """Return the resolved absolute path for a folder_paths key.  Used
    by download modals to show the user the actual destination dir
    instead of just the `checkpoints` / `diffusion_models` key."""
    folder_type = request.query.get("folder", "checkpoints").strip() or "checkpoints"
    return web.json_response({"folder": folder_type, "path": _resolve_folder_path(folder_type)})


@routes.get("/promptchain/system/checkpoints-folder")
async def _api_checkpoints_folder(request):
    # Kept for backward compat with anything still hitting it.
    return web.json_response({"folder": civitai.get_checkpoints_folder()})


@routes.post("/promptchain/system/restart")
async def _api_restart(request):
    """Restart the ComfyUI server."""
    import os as _os
    import sys as _sys

    def do_restart():
        import time, atexit
        time.sleep(0.5)
        # execv replaces the process so atexit hooks normally skip —
        # run them explicitly so DB connections and temp files get
        # cleaned up before the handoff.
        try:
            atexit._run_exitfuncs()
        except Exception as e:
            print(f"[PromptChain] restart: atexit cleanup failed: {e}")
        args = [_sys.executable] + _sys.argv
        if "--disable-auto-launch" not in args:
            args.append("--disable-auto-launch")
        _os.execv(_sys.executable, args)

    threading.Thread(target=do_restart, daemon=True).start()
    return web.json_response({"status": "restarting"})


# ── version / update check ────────────────────────────────────────
# The About modal surfaces the installed build and a user-triggered update
# check. We compare against the checkout's OWN tracking remote (origin) rather
# than a hardcoded GitHub URL, so it works whether the user cloned the public
# repo or any fork. The check is read-only; applying an update (pull) is a
# separate explicit action and needs a restart to reload the package.

_NODE_DIR = Path(__file__).resolve().parent.parent


def _git_env():
    """Never let git block a request on a credential / host-key prompt."""
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "never"
    env["GIT_SSH_COMMAND"] = env.get("GIT_SSH_COMMAND", "ssh -oBatchMode=yes")
    return env


def _git(args, timeout=15):
    """Run git in the PromptChain dir. Returns stdout (stripped), or None on any
    failure — git missing, not a repo, timeout, or non-zero exit."""
    try:
        out = subprocess.run(
            ["git", *args], cwd=str(_NODE_DIR),
            capture_output=True, text=True, timeout=timeout,
            stdin=subprocess.DEVNULL, env=_git_env(),
        )
        return out.stdout.strip() if out.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def _local_version():
    commit = _git(["rev-parse", "--short", "HEAD"])
    return {
        "is_git": commit is not None,
        "commit": commit,
        "branch": _git(["rev-parse", "--abbrev-ref", "HEAD"]),
        "date": _git(["show", "-s", "--format=%cd", "--date=short", "HEAD"]),
    }


# Serialize `git fetch` across concurrent requests (background check + the About
# button) — two fetches in one repo race on FETCH_HEAD.lock, and the loser falsely
# reports offline.
_fetch_lock = threading.Lock()


@routes.get("/promptchain/system/version")
async def _api_version(request):
    """Installed build info, read locally — fast, no network. Off the event loop:
    it still shells out to git a few times."""
    return web.json_response(await asyncio.to_thread(_local_version))


@routes.post("/promptchain/system/check-updates")
async def _api_check_updates(request):
    """Fetch the tracking remote and report how many commits behind HEAD is.
    Read-only: `git fetch` updates the object store but never the working tree,
    so it can't touch (or lock) the tag-builder DB.
    status: current | behind | unknown (no git, offline, or no upstream).
    Also reports whether an update is already staged for the next restart, so
    the UI shows 'restart to finish' instead of re-prompting."""
    from . import update_boot

    def check():
        info = _local_version()
        staged = {"staged": update_boot.is_staged(), "staged_sha": update_boot.staged_target()}
        if not info["is_git"]:
            return {**info, **staged, "status": "unknown",
                    "detail": "Installed via the Registry / ComfyUI-Manager — update it from the Manager menu."}
        with _fetch_lock:
            fetched = _git(["fetch", "--quiet"], timeout=30)
        if fetched is None:
            return {**info, **staged, "status": "unknown", "detail": "Couldn't reach the update server."}
        behind = _git(["rev-list", "--count", "HEAD..@{upstream}"])
        if behind is None or not behind.isdigit():
            return {**info, **staged, "status": "unknown", "detail": "No upstream branch to compare against."}
        n = int(behind)
        return {**info, **staged, "status": "current" if n == 0 else "behind",
                "behind": n, "target_sha": _git(["rev-parse", "@{upstream}"])}

    return web.json_response(await asyncio.to_thread(check))


@routes.post("/promptchain/system/apply-update")
async def _api_apply_update(request):
    """STAGE the update — write a marker the next boot consumes — instead of
    pulling on the live server. A live `git pull` would try to replace the
    open, locally-modified 47MB tag-builder.db and fail on Windows (the file is
    held by sqlite). The caller restarts; core/update_boot.py applies the pull
    at the top of __init__.py before any DB handle is opened."""
    from . import update_boot

    def stage():
        staged = update_boot.stage_pending_update()
        if staged is None:
            return {"ok": False, "detail": "Not a fast-forwardable git checkout — update manually."}
        return {"ok": True, "staged": True, "target_sha": staged["target_sha"], "restart_required": True}

    return web.json_response(await asyncio.to_thread(stage))


@routes.get("/promptchain/system/update-status")
async def _api_update_status(request):
    """Post-boot outcome of a just-applied update (consumed once), so the UI can
    confirm 'Updated to <sha>' or warn that deps need a manual pip install."""
    from . import update_boot
    return web.json_response(await asyncio.to_thread(update_boot.read_and_clear_status) or {})
