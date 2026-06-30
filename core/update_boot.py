"""Restart-bound, marker-driven self-update — applied at boot, before anything
opens the database or the server serves a request.

WHY THIS EXISTS: data/tag-builder/tag-builder.db is a ~47MB git-tracked binary.
A running ComfyUI holds it open through a cached sqlite connection
(core/tag_builder.py), and Windows refuses to rename/replace a sqlite file that
is open (sqlite opens it without FILE_SHARE_DELETE). So a live `git pull` that
touches the DB fails or half-applies. The fix: the UI only *stages* an update
(writes a marker + restarts); the actual working-tree git ops happen HERE, at
the very top of __init__.py on the next boot, when no connection is open yet and
the file is therefore unlocked.

This module is deliberately tiny and defensive. __init__.py is compiled before
its first line runs, so a change to THIS file only takes effect on the boot
AFTER it lands — every step must degrade safely on an older copy, and boot must
never hang or raise on our account.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

_log = logging.getLogger("promptchain").info

NODE_DIR = Path(__file__).resolve().parent.parent
CACHE = NODE_DIR / "cache"  # gitignored — survives a pull, never a tracked change
MARKER = CACHE / "pending-update.json"
LOCK = CACHE / "update.lock"
STATUS = CACHE / "update-status.json"

DB_REL = "data/tag-builder/tag-builder.db"
DB_PATH = NODE_DIR / DB_REL
DB_BACKUP = CACHE / "tag-builder.db.prepull"

# The only git-tracked files the running app dirties (boot reconcile commit +
# alias seeding + user curation all write tag-builder.db, nothing else). The
# apply discards exactly these before fast-forwarding; never a `git reset
# --hard`/`git clean`, which would also wipe untracked user state.
DISCARD_PATHS = [DB_REL]

# Old process release can lag a restart (os.execv on Windows spawns the child
# then exits the parent; CUDA/torch teardown adds more). Bounded wait for the
# DB handle to free before we touch the file. A one-shot wait on an OS resource
# at boot — not UI state polling.
LOCK_WAIT_BUDGET_S = 30
# A legitimate apply can run db-wait(30) + fetch(120) + merge(300) + pip(600).
# The stale-steal threshold MUST exceed that sum, or a second instance booting
# mid-apply would steal a live lock and run git concurrently. Generous margin.
STALE_LOCK_S = 30 * 60


def _git_env() -> dict:
    """Never let git block boot on a credential or host-key prompt."""
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "never"
    env["GIT_SSH_COMMAND"] = env.get("GIT_SSH_COMMAND", "ssh -oBatchMode=yes")
    return env


def _git(args, timeout=60):
    """Run git in the node dir. Returns (returncode, stdout, stderr); returncode
    is None when git couldn't run at all (missing, timeout, OS error)."""
    try:
        r = subprocess.run(
            ["git", *args], cwd=str(NODE_DIR),
            capture_output=True, text=True, timeout=timeout,
            stdin=subprocess.DEVNULL, env=_git_env(),
        )
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except (OSError, subprocess.SubprocessError) as e:
        return None, "", str(e)


def _db_replaceable() -> bool:
    """True when the DB file is not held open by another process — proven by
    renaming it away and back. On Windows a sqlite-open file can't be renamed
    (no FILE_SHARE_DELETE), so this directly tests the thing we need: can git
    replace the blob? A missing DB is trivially replaceable."""
    probe = DB_PATH.with_name(DB_PATH.name + ".locktest")
    # A probe stranded by a prior crash: it may BE the real DB (crash between the
    # two renames). Recover it before testing; only treat as clear once handled.
    if probe.exists():
        try:
            if not DB_PATH.exists():
                os.replace(str(probe), str(DB_PATH))
            else:
                probe.unlink()
        except OSError:
            return False
    if not DB_PATH.exists():
        return True
    try:
        os.replace(str(DB_PATH), str(probe))
    except OSError:
        return False
    try:
        os.replace(str(probe), str(DB_PATH))
    except OSError as e:
        # DB is now stranded at .locktest — do NOT report replaceable; the next
        # pass recovers it from the probe-exists branch above.
        _log(f"update: WARNING DB left at lock probe, will recover: {e}")
        return False
    return True


def _wait_db_unlocked() -> bool:
    deadline = time.monotonic() + LOCK_WAIT_BUDGET_S
    while True:
        if _db_replaceable():
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.5)


def _acquire_lock() -> bool:
    """Cross-process exclusive lock so two instances (e.g. multi-GPU) never apply
    at once. Steals a lock left by a crashed apply after STALE_LOCK_S."""
    try:
        CACHE.mkdir(exist_ok=True)
        fd = os.open(str(LOCK), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        return True
    except FileExistsError:
        try:
            if time.time() - LOCK.stat().st_mtime > STALE_LOCK_S:
                LOCK.unlink()
                return _acquire_lock()
        except OSError:
            pass
        return False
    except OSError:
        return False


def _release_lock() -> None:
    """Only remove the lock if THIS process still owns it — so a stolen/recreated
    lock held by another instance is never freed by us."""
    try:
        if LOCK.read_text().strip() == str(os.getpid()):
            LOCK.unlink()
    except OSError:
        pass


def _delete_db_sidecars() -> None:
    # A leftover rollback journal/WAL from the OLD DB must never roll back onto
    # the freshly pulled blob. They're gitignored, so deleting is always safe.
    for suffix in ("-journal", "-wal", "-shm"):
        try:
            DB_PATH.with_name(DB_PATH.name + suffix).unlink()
        except OSError:
            pass


def _db_ok() -> bool:
    try:
        con = sqlite3.connect(str(DB_PATH))
        try:
            row = con.execute("PRAGMA quick_check").fetchone()
            return bool(row) and row[0] == "ok"
        finally:
            con.close()
    except sqlite3.Error:
        return False


def _restore_db() -> None:
    if DB_BACKUP.exists():
        try:
            os.replace(str(DB_BACKUP), str(DB_PATH))
            _log("update: restored pre-update DB after a failed apply")
        except OSError as e:
            _log(f"update: FAILED to restore DB backup: {e}")


def _pip_install() -> bool:
    """Best-effort `pip install -r requirements.txt` so a newly pulled dep can't
    leave the install broken. Non-fatal: boot continues regardless."""
    req = NODE_DIR / "requirements.txt"
    if not req.exists():
        return True
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(req)],
            cwd=str(NODE_DIR), capture_output=True, text=True,
            stdin=subprocess.DEVNULL, timeout=600,
        )
        if r.returncode != 0:
            _log(f"update: pip install exited {r.returncode}; deps may need a manual install")
        return r.returncode == 0
    except (OSError, subprocess.SubprocessError) as e:
        _log(f"update: pip install failed ({e}); deps may need a manual install")
        return False


def _write_status(applied_sha: str, ok: bool, deps_ok: bool, detail: str = "") -> None:
    try:
        CACHE.mkdir(exist_ok=True)
        payload = json.dumps(
            {"applied_sha": applied_sha, "ok": ok, "deps_ok": deps_ok,
             "detail": detail, "at": int(time.time())}
        )
        tmp = STATUS.with_suffix(".tmp")
        tmp.write_text(payload)
        os.replace(str(tmp), str(STATUS))  # atomic — no torn read on next boot
    except OSError:
        pass


def apply_pending_update() -> None:
    """Entry point called at the very top of __init__.py. No-op (and cheap) when
    nothing is staged. Wrapped so a failure can never block or crash boot."""
    if not MARKER.exists():
        return
    if not _acquire_lock():
        _log("update: another instance is applying or active; deferring")
        return  # someone else holds the lock — do NOT release it
    try:
        _apply()
    except Exception as e:  # never let an update attempt brick startup
        _log(f"update: apply aborted, booting current version: {e}")
    finally:
        _release_lock()
        _safe_unlink(DB_BACKUP)  # any backup left by an early return — restore already consumed its copy


def _apply() -> None:
    try:
        marker = json.loads(MARKER.read_text())
    except (OSError, ValueError) as e:
        _log(f"update: unreadable marker, discarding ({e})")
        _safe_unlink(MARKER)
        return

    rc, _, _ = _git(["rev-parse", "HEAD"])
    if rc != 0:
        _log("update: not a git checkout (registry/zip install); cannot self-update")
        _safe_unlink(MARKER)
        return

    rc, branch, _ = _git(["rev-parse", "--abbrev-ref", "HEAD"])
    if rc != 0 or branch == "HEAD":
        _log("update: detached HEAD, no branch to fast-forward; skipping")
        _safe_unlink(MARKER)
        return

    # One-shot rule: drop the marker BEFORE any git/DB write so a crash mid-apply
    # can't loop us on every boot. Everything past here is best-effort.
    _safe_unlink(MARKER)

    if not _wait_db_unlocked():
        _log("update: DB still locked by a prior process after wait; booting current version")
        return

    _backup_db()
    _delete_db_sidecars()

    _git(["fetch", "--quiet"], timeout=120)  # non-fatal; target may already be local

    target = marker.get("target_sha")
    if not target:
        rc, target, _ = _git(["rev-parse", "@{upstream}"])
        if rc != 0 or not target:
            _log("update: no target/upstream to apply; skipping")
            return

    rc, old_head, _ = _git(["rev-parse", "HEAD"])
    if rc != 0:
        _log("update: couldn't read HEAD; skipping")
        return
    if old_head == target:
        _log("update: already at target; nothing to apply")
        return

    rc, _, _ = _git(["merge-base", "--is-ancestor", "HEAD", target])
    if rc != 0:
        _log("update: local history has diverged from upstream; manual update required")
        _write_status(target, ok=False, deps_ok=False,
                      detail="local git history has diverged from upstream — update manually")
        return

    req = NODE_DIR / "requirements.txt"
    reqs_before = req.read_bytes() if req.exists() else b""

    for path in DISCARD_PATHS:
        _git(["checkout", "--", path])  # discard local DB edits (read-only reference)

    rc, _, err = _git(["merge", "--ff-only", target], timeout=300)
    if rc != 0:
        _log(f"update: fast-forward failed ({err or 'non-ff / dirty tree'}); restoring DB")
        _restore_db()
        _write_status(target, ok=False, deps_ok=False,
                      detail="could not fast-forward (a local file blocked the merge)")
        return

    if not _db_ok():
        # Pair code with DB: roll the tree back to old_head so the restored old DB
        # never runs against new-commit schema/code expectations.
        _log("update: pulled DB failed integrity check; rolling code + DB back")
        _git(["reset", "--hard", old_head], timeout=120)
        _restore_db()
        _write_status(target, ok=False, deps_ok=False,
                      detail="updated DB failed its integrity check — previous version restored")
        return

    deps_ok = _install_deps_if_changed(reqs_before, req)
    rc, short, _ = _git(["rev-parse", "--short", "HEAD"])
    _log(f"update: applied {short or target}; deps_ok={deps_ok}")
    _write_status(short or target, ok=True, deps_ok=deps_ok)
    _safe_unlink(DB_BACKUP)


def _install_deps_if_changed(reqs_before: bytes, req: Path) -> bool:
    """Only pip-install when requirements.txt actually changed in this update.
    Most updates don't touch it, so boot isn't gated behind a multi-minute pip
    resolve for nothing."""
    reqs_after = req.read_bytes() if req.exists() else b""
    if reqs_after == reqs_before:
        return True
    _log("update: requirements changed — installing dependencies, this can take a minute…")
    return _pip_install()


def _backup_db() -> None:
    if not DB_PATH.exists():
        return
    try:
        CACHE.mkdir(exist_ok=True)
        import shutil
        shutil.copy2(str(DB_PATH), str(DB_BACKUP))
    except OSError as e:
        _log(f"update: could not back up DB before apply: {e}")


def _safe_unlink(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass


# ── staging side: called by the /apply-update route on the LIVE server ──────
# Writes the marker the next boot consumes. Never touches the working tree, so
# it's safe to run while the DB is open.

def stage_pending_update():
    """Record the fetched upstream tip as the update to apply next boot. Returns
    the staged dict, or None when this isn't a fast-forwardable git checkout."""
    rc, _, _ = _git(["rev-parse", "HEAD"])
    if rc != 0:
        return None
    rc, branch, _ = _git(["rev-parse", "--abbrev-ref", "HEAD"])
    rc2, target, _ = _git(["rev-parse", "@{upstream}"])
    if rc2 != 0 or not target:
        return None
    data = {
        "target_sha": target,
        "branch": branch if rc == 0 else "",
        "old_pid": os.getpid(),
        "staged_at": int(time.time()),
    }
    try:
        CACHE.mkdir(exist_ok=True)
        MARKER.write_text(json.dumps(data))
    except OSError as e:
        _log(f"update: could not write staging marker: {e}")
        return None
    return data


def is_staged() -> bool:
    return MARKER.exists()


def staged_target():
    try:
        return json.loads(MARKER.read_text()).get("target_sha")
    except (OSError, ValueError):
        return None


def read_and_clear_status():
    """Post-boot outcome for the UI, consumed once so the notice shows a single
    time. Always clears the file — including a torn/corrupt one — so it can't
    persist across boots."""
    if not STATUS.exists():
        return None
    try:
        data = json.loads(STATUS.read_text())
    except (OSError, ValueError):
        data = None
    _safe_unlink(STATUS)
    return data
