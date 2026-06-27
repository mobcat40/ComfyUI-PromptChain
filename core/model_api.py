# Model API — model fingerprinting, identity lookup, settings CRUD,
# CivitAI-based recognition, and recognition state tracking.

import asyncio
import os

from aiohttp import web
import server

from .api_utils import error_response, ok_response, parse_json, validate_model_path
from .shared import HASH_RE
from .fingerprint import (
    scan_models,
    get_model_identity,
    find_by_hash,
    list_models,
    compute_full_sha256,
)
from . import civitai
from . import model_settings

routes = server.PromptServer.instance.routes


# ── recognition state (read by boot code in __init__.py) ─────────

recognition_state = {
    "running": False,
    "total": 0,
    "done": 0,
    "current": None,
}


async def detect_model(quick_hash: str, filepath: str, fallback_arch: str = "") -> dict:
    """Full SHA256 -> CivitAI lookup -> save settings. Returns status dict."""
    existing = model_settings.load(quick_hash)
    if existing:
        return {"status": "already_known", "settings": existing}

    full_sha = civitai.get_cached_sha256(quick_hash)
    if not full_sha:
        try:
            # 10-min cap: multi-GB checkpoints on slow spinning disk can
            # legitimately take minutes, but unbounded means a hung
            # network mount could starve the thread pool forever.
            full_sha = await asyncio.wait_for(
                asyncio.to_thread(compute_full_sha256, filepath),
                timeout=600,
            )
        except asyncio.TimeoutError:
            return {"status": "hash_timeout"}
        if not full_sha:
            return {"status": "hash_failed"}
        civitai.set_cached_sha256(quick_hash, full_sha)

    # Cross-reference SHA256 against existing curated configs before hitting API
    existing_by_sha = model_settings.find_config_by_sha256(full_sha)
    if existing_by_sha:
        return {"status": "found", "settings": existing_by_sha}

    info = await civitai.lookup_by_hash(full_sha)
    if not info:
        return {"status": "not_found"}

    settings = civitai.build_model_settings(info, fallback_arch=fallback_arch)

    # Inherit curated fields (model_name, trigger/negative, node ranges
    # + options, tag_sources, prompt_style, notes, etc.) from any
    # already-installed version of the same CivitAI model.  Without
    # this, a fresh recognition gets only the bare-bones fields that
    # CivitAI's API exposes — no trigger words, no FaceDetailer ranges,
    # no curated prompt style — even when the user already has a
    # carefully set up config for an earlier version of the same model.
    sibling = model_settings.find_sibling_config(
        settings.get("civitai_model_id"),
        exclude_quick_hash=quick_hash,
    )
    if sibling:
        settings = model_settings.inherit_from_sibling(settings, sibling)

    model_settings.save_discovered(quick_hash, settings, sha256=full_sha)

    return {"status": "found", "settings": settings}


# ── model list + identity endpoints ──────────────────────────────

@routes.get("/promptchain/models/list")
async def _api_list_models(request):
    models = await asyncio.to_thread(list_models)
    # Hide files that are catalog sub-components (MoE pairs, text encoders,
    # VAEs, LoRAs) but have no config of their own. Without this, every
    # file in the fingerprint index shows in the picker as a bare filename.
    filtered = [
        m for m in models
        if (model_settings.load(m["hash"])
            and model_settings.is_primary_model_file(m["filename"]))
        or not model_settings.is_catalog_filename(m["filename"])
    ]
    # The fingerprint scanner assigns architecture from header patterns; newer
    # DiT families (e.g. krea2) have no pattern yet and read as "unknown", which
    # drops them from the upscale picker's engine list. Their curated config
    # (matched by filename) carries the authoritative architecture — adopt it so
    # the right re-detail engine is offered.
    for m in filtered:
        if m.get("architecture") in ("", "unknown", None):
            config = model_settings.find_config_by_filename(m["filename"])
            if config and config.get("architecture"):
                m["architecture"] = config["architecture"]
    return web.json_response({"models": filtered})


@routes.get("/promptchain/models/catalog")
async def _api_model_catalog(request):
    return web.json_response({"catalog": model_settings.list_catalog()})


@routes.get("/promptchain/models/identity")
async def _api_model_identity(request):
    filepath = request.query.get("file", "").strip()
    if not filepath:
        return error_response("missing file parameter")
    # full paths must be inside a known model directory
    if os.sep in filepath or "/" in filepath:
        if not validate_model_path(filepath):
            return error_response("path not in model directory", 403)
    identity = get_model_identity(filepath)
    if not identity:
        return error_response("could not identify model", 404)
    return web.json_response(identity)


@routes.post("/promptchain/models/scan")
async def _api_scan_models(request):
    count = await asyncio.to_thread(scan_models)
    return ok_response({"count": count})


@routes.post("/promptchain/models/detect")
async def _api_detect_model(request):
    """On-demand CivitAI detection for a single model by quick hash."""
    data, err = await parse_json(request)
    if err: return err
    quick_hash = data.get("hash", "").strip()
    if not quick_hash or not HASH_RE.match(quick_hash):
        return error_response("invalid hash")

    model_info = find_by_hash(quick_hash)
    if not model_info:
        return error_response("unknown hash", 404)

    result = await detect_model(
        quick_hash,
        model_info["filepath"],
        model_info.get("architecture", ""),
    )
    return web.json_response(result)


@routes.post("/promptchain/models/settings/bulk")
async def _api_model_settings_bulk(request):
    """Load settings for multiple hashes in one request."""
    data, err = await parse_json(request)
    if err: return err
    hashes = data.get("hashes", [])
    if not isinstance(hashes, list):
        return error_response("hashes must be a list")
    configs = model_settings.load_bulk(hashes)
    for h, config in configs.items():
        config["_user_saved"] = model_settings.has_user_config(h)
        config["_has_system"] = model_settings.has_system_config(h)
    return web.json_response({"settings": configs})


@routes.get("/promptchain/models/recognition-status")
async def _api_recognition_status(request):
    return web.json_response(recognition_state)


# ── model settings CRUD ──────────────────────────────────────────

@routes.get("/promptchain/models/names")
async def _api_model_names(request):
    return web.json_response({"names": model_settings.list_model_names()})


@routes.get("/promptchain/models/versions")
async def _api_model_versions(request):
    name = request.query.get("name", "")
    return web.json_response({"versions": model_settings.list_versions(name) if name else []})


@routes.get("/promptchain/models/version-details")
async def _api_model_version_details(request):
    name = request.query.get("name", "")
    return web.json_response({
        "versions": model_settings.list_version_details(name) if name else []
    })


@routes.get("/promptchain/models/older-versions")
async def _api_model_older_versions(request):
    name = request.query.get("name", "")
    return web.json_response({
        "versions": model_settings.list_older_versions(name) if name else []
    })


@routes.get("/promptchain/models/settings/{model_hash}")
async def _api_model_settings_get(request):
    model_hash = request.match_info.get("model_hash", "")
    if not model_hash:
        return error_response("missing model_hash")
    config = model_settings.load(model_hash)
    if not config:
        return error_response("no settings found", 404)
    config["_user_saved"] = model_settings.has_user_config(model_hash)
    config["_has_system"] = model_settings.has_system_config(model_hash)
    return web.json_response(config)


@routes.post("/promptchain/models/settings/{model_hash}")
async def _api_model_settings_save(request):
    model_hash = request.match_info.get("model_hash", "")
    if not model_hash or not HASH_RE.match(model_hash):
        return error_response("invalid model_hash")
    data, err = await parse_json(request)
    if err: return err
    model_settings.save(model_hash, data)
    return ok_response()


@routes.delete("/promptchain/models/settings/{model_hash}")
async def _api_model_settings_delete(request):
    model_hash = request.match_info.get("model_hash", "")
    if not model_hash or not HASH_RE.match(model_hash):
        return error_response("invalid model_hash")
    if model_settings.delete(model_hash):
        return ok_response()
    return error_response("no user settings found", 404)
