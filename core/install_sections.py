"""Section-level installer — one source of truth above NODE_PACKS + subject_api.

A SECTION is a user-facing feature (Style Reference, ControlNet, PuLID, AI
Selection…). Each groups one or more MEMBERS, where a member is either a
node-pack key (node_install_api.NODE_PACKS) or an AI-selection target
(subject_api). Both the onboarding splash and the in-app install modal read
these sections, so a feature added here shows up identically in every entry
point and reports ONE rolled-up status. Per-member skip logic lives in the
installers themselves, so installing a section only fetches what's missing.

Routes:
  GET  /promptchain/install/sections          → all sections + rolled-up health
  GET  /promptchain/install/status?section=ID → one section's detailed status
  POST /promptchain/install/install {section} → SSE: install missing members
  GET  /promptchain/install/updates           → bundled-pack vs installed drift
"""
from __future__ import annotations

import hashlib
import logging
import sys
from pathlib import Path

import server
from aiohttp import web

from .api_utils import error_response, parse_json
from .node_install_api import (
    INSTALL_CANCEL,
    NODE_PACKS, _CRITICAL, _bundled_packs_dir, _custom_nodes_dir, _log,
    _open_sse, _pack_status, _pkg_version, _restore_critical, _run, _send,
    install_pack,
)
from .subject_api import _object_status, _subject_status, install_subject_target

routes = server.PromptServer.instance.routes
log = logging.getLogger("promptchain.install")


def _np(key: str) -> dict:
    return {"kind": "nodepack", "key": key}


def _subj(target: str) -> dict:
    return {"kind": "subject", "target": target}


# A `deferred` entry documents a download that only happens on first USE (not at
# install), so the UI can warn "+N GB later" instead of the user being surprised.
SECTIONS: list[dict] = [
    {"id": "style_reference", "label": "Style Reference", "size": "~3.2 GB",
     "desc": "IP-Adapter — transfer style from a reference image",
     "members": [_np("StyleReference")]},
    {"id": "upscaler", "label": "Upscaler", "size": "~64 MB",
     "desc": "Ultimate SD Upscale + 4x-UltraSharp",
     "members": [_np("Upscaler")]},
    {"id": "face_detailer", "label": "Face Detailer", "size": "~6 MB",
     "desc": "Region-correct face detailing",
     "members": [_np("RegionalDetailer")]},
    {"id": "krea2_highdetail", "label": "Krea 2 High Detail", "size": "~510 MB",
     "desc": "Clean 2× decoder + conditioning rebalance for the Krea 2 High-Detail templates",
     "members": [_np("Krea2HighDetail")]},
    {"id": "controlnet", "label": "ControlNet", "size": "~5 GB SDXL · up to ~22 GB all",
     "desc": "Depth / pose / canny / edge guidance (SDXL · Flux · Z-Image)",
     "members": [_np("ControlNet"), _np("FluxControlNet"),
                 _np("ZImageControlNet"), _np("ZImageControlNetBase")]},
    {"id": "pulid", "label": "PuLID (face identity)", "size": "~4.3 GB",
     "desc": "Identity transfer for SDXL · Flux · Flux.2",
     # EVA-CLIP (used by PuLID Flux 2) is no longer deferred — installing that
     # member pre-fetches it (see _MEMBER_PREFETCH) so the first render doesn't
     # stall on an ~800 MB download.
     "members": [_np("PuLID"), _np("PuLIDFlux"), _np("PuLIDFlux2")]},
    {"id": "seedvr2", "label": "SeedVR2 Upscaler", "size": "~480 MB",
     "desc": "Restoration upscaler (ByteDance)",
     "members": [_np("SeedVR2")],
     "deferred": [{"label": "SeedVR2 DiT weights", "size": "6.8–16.5 GB",
                   "when": "first SeedVR2 upscale"}]},
    {"id": "ai_selection", "label": "AI Selection", "size": "~1 GB",
     "desc": "Select Subject (BiRefNet) + click-to-select objects (SAM2) in the editor",
     "members": [_subj("subject"), _subj("object")]},
]

_SECTIONS_BY_ID = {s["id"]: s for s in SECTIONS}

# Reverse index: node-pack member key -> section id. The in-app install modal is
# opened per node-pack "injectable"; this lets it install through the unified
# section route scoped to just that one member (not the whole section — the
# ControlNet section alone spans up to ~22 GB across four base families).
_SECTION_FOR_NODEPACK = {
    m["key"]: s["id"]
    for s in SECTIONS for m in s["members"] if m["kind"] == "nodepack"
}


def section_for_injectable(key: str) -> str | None:
    return _SECTION_FOR_NODEPACK.get(key)


# Weights a pack would otherwise lazy-download on first USE, which we instead
# pre-fetch right after the pack installs so the first render doesn't stall.
# Keyed by node-pack member key. The code runs the pack's OWN resolver in a
# subprocess (inheriting our env + interpreter), so it writes to exactly the
# cache the runtime later reads, and is a cheap no-op once cached. Best-effort:
# a failure never aborts the install — the weight simply falls back to lazy.
async def _prefetch_for_member(resp: web.StreamResponse, key: str) -> None:
    """No-op. Weight pre-fetching was removed for ComfyUI Registry compliance —
    it ran a subprocess to warm a pack's lazy weights. Those weights now simply
    download on first render, as the packs already handle (e.g. PuLID-Flux2's
    EVA-CLIP via open_clip), so the first such render is slightly slower and
    nothing else changes."""
    return None


def _member_status(m: dict) -> dict:
    """Normalize one member's install state to installed | needs_restart | missing.

    needs_restart = files are on disk but the proof node hasn't registered yet
    (a just-installed node pack before the ComfyUI restart)."""
    if m["kind"] == "nodepack":
        st = _pack_status(m["key"])
        files_present = all(r["cloned"] for r in st["repos"]) and not st["missing_models"]
        if st["present"]:
            state = "installed"
        elif files_present and st["missing_nodes"]:
            state = "needs_restart"
        else:
            state = "missing"
        return {"kind": "nodepack", "key": m["key"], "label": st["label"],
                "state": state, "missing_models": st["missing_models"],
                "missing_nodes": st["missing_nodes"]}
    st = _subject_status() if m["target"] == "subject" else _object_status()
    # Selection libs import at call time — no restart concept; ready or not.
    state = "installed" if st["ready"] else "missing"
    return {"kind": "subject", "target": m["target"], "label": st["label"],
            "state": state, "deps_ok": st["deps_ok"], "model_ok": st["model_ok"],
            "size": st.get("size")}


def _section_status(sec: dict) -> dict:
    members = [_member_status(m) for m in sec["members"]]
    installed = sum(1 for mm in members if mm["state"] == "installed")
    total = len(members)
    if installed == total:
        health = "installed"
    elif installed == 0 and not any(mm["state"] == "needs_restart" for mm in members):
        health = "missing"
    else:
        health = "partial"  # some members present (or just need a restart)
    return {
        "id": sec["id"],
        "label": sec["label"],
        "desc": sec.get("desc", ""),
        "size": sec.get("size", ""),
        "members": members,
        "installed_count": installed,
        "total": total,
        "present": installed == total,
        "health": health,
        "needs_restart": any(mm["state"] == "needs_restart" for mm in members),
        "deferred": sec.get("deferred", []),
    }


@routes.get("/promptchain/install/sections")
async def _api_sections(request):
    return web.json_response({"sections": [_section_status(s) for s in SECTIONS]})


@routes.get("/promptchain/install/status")
async def _api_section_status(request):
    sid = (request.query.get("section") or "").strip()
    sec = _SECTIONS_BY_ID.get(sid)
    if not sec:
        return error_response(f"unknown section: {sid}")
    return web.json_response(_section_status(sec))


@routes.post("/promptchain/install/install")
async def _api_section_install(request):
    """SSE: install every not-yet-present member of a section, in order. Members
    already installed are skipped (logged), so re-running or installing an
    overlapping section is cheap. One critical-deps snapshot + restore wraps the
    whole run; needs_restart is true iff any node-pack member was installed."""
    body, err = await parse_json(request)
    if err:
        return err
    sid = (body.get("section") or "").strip()
    sec = _SECTIONS_BY_ID.get(sid)
    if not sec:
        return error_response(f"unknown section: {sid}")

    # Optional filter: install only these members (node-pack keys or subject
    # targets). Defaults to the whole section. Lets the picker install just the
    # families the user ticked — e.g. only Flux ControlNet, not all four.
    want = body.get("members")
    members = sec["members"]
    if isinstance(want, list) and want:
        wanted = set(want)
        members = [m for m in members if (m.get("key") or m.get("target")) in wanted]
        if not members:
            return error_response("no matching members in section")

    resp = await _open_sse(request)
    snapshot = {p: _pkg_version(p) for p in _CRITICAL}
    installed_nodepack = False
    INSTALL_CANCEL.clear()  # fresh run — drop any stale cancel from a prior install
    try:
        await _log(resp, f"Installing {sec['label']}")
        for m in members:
            if INSTALL_CANCEL.is_set():
                await _send(resp, {"cancelled": True})
                return resp
            ms = _member_status(m)
            await _send(resp, {"member": ms["label"], "state": ms["state"]})
            if ms["state"] == "installed":
                await _log(resp, f"{ms['label']}: already installed, skipping")
                continue
            if m["kind"] == "nodepack":
                if not await install_pack(resp, m["key"], snapshot):
                    return resp  # install_pack already emitted the error
                installed_nodepack = True
                await _prefetch_for_member(resp, m["key"])
            else:
                if not await install_subject_target(resp, m["target"], snapshot):
                    return resp
        # subject members install pip libs without restoring on success — and a
        # node pack's restore already ran inside install_pack, so this final pass
        # is a no-op there. One sweep covers the whole section either way.
        await _restore_critical(resp, snapshot)
        msg = ("Restart ComfyUI to load the new nodes."
               if installed_nodepack else "Done.")
        await _log(resp, msg)
        await _send(resp, {"done": True, "ok": True, "needs_restart": installed_nodepack})
    except ConnectionResetError:
        pass  # client navigated away; pip/downloads keep running
    except Exception as e:
        log.exception("section install failed")
        try:
            await _send(resp, {"error": str(e)})
        except Exception:
            pass
    return resp


@routes.post("/promptchain/install/cancel")
async def _api_install_cancel(request):
    """Signal the running section install to stop. _download checks this per
    chunk and the section loop checks it between members, so the in-flight file
    bails (keeping a .part for resume) and no further members start."""
    INSTALL_CANCEL.set()
    return web.json_response({"ok": True})


# ── update check ──────────────────────────────────────────────────
# Every 3rd-party pack we install is VENDORED in bundled_packs/ at a pinned
# version, so "check for updates" = did PromptChain ship a newer copy than the
# one already in custom_nodes/? Compare a content signature of the two trees.
# Read-only — applying an update (re-copy) needs a restart and is a separate
# action, since overwriting a loaded pack can hit locked DLLs on Windows.

def _pack_signature(d: Path) -> str | None:
    if not d.is_dir():
        return None
    h = hashlib.sha256()
    for f in sorted(d.rglob("*")):
        if not f.is_file() or "__pycache__" in f.parts or f.suffix == ".pyc":
            continue
        h.update(f.relative_to(d).as_posix().encode())
        h.update(b"\0")
        try:
            h.update(f.read_bytes())
        except OSError:
            h.update(b"<unreadable>")
        h.update(b"\0")
    return h.hexdigest()


@routes.get("/promptchain/install/updates")
async def _api_updates(request):
    """Report bundled packs whose installed copy differs from the version
    PromptChain currently ships (i.e. an update is available via re-copy)."""
    cn = _custom_nodes_dir()
    bp = _bundled_packs_dir()
    updates = []
    seen: set[str] = set()
    for sec in SECTIONS:
        for m in sec["members"]:
            if m["kind"] != "nodepack":
                continue
            for name in NODE_PACKS[m["key"]].get("bundle", []):
                if name in seen:
                    continue
                seen.add(name)
                installed = cn / name
                if not installed.is_dir():
                    continue  # not installed → an install, not an update
                shipped_sig = _pack_signature(bp / name)
                installed_sig = _pack_signature(installed)
                if shipped_sig and installed_sig and shipped_sig != installed_sig:
                    updates.append({"pack": name, "section": sec["id"]})
    return web.json_response({"updates": updates})
