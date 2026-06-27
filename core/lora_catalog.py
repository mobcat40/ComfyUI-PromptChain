# LoRA catalog — curated, scope-filtered LoRA packs the model panel offers as
# swappable "styles". Data lives in data/loras/*.json (shipped) and
# user/PromptChain/loras/*.json (user-added, shadows by id). Each file:
#   { "scope": {type, architecture, family}, "loras": [ {id,label,filename,
#     folder,trigger,strength_default,size_bytes,source}, ... ] }
# Served scope-filtered to the active model so e.g. Krea 2 Turbo styles only
# surface on Krea 2 Turbo.

import json
from pathlib import Path
from typing import Optional

from aiohttp import web
import server
import folder_paths

routes = server.PromptServer.instance.routes

_cache: Optional[list] = None
_cache_signature: Optional[tuple] = None


def _system_dir() -> Path:
    return Path(__file__).parent.parent / "data" / "loras"


def _user_dir() -> Path:
    return Path(folder_paths.get_user_directory()) / "PromptChain" / "loras"


def _dir_signature() -> tuple:
    # Mirror model_settings' mtime watch: a dir's mtime bumps when files are
    # added/removed/atomically replaced (a /deploy pull), so shipped catalogs
    # refresh without a restart. In-place edits to an existing file don't bump
    # the dir mtime — those need a restart.
    sig = []
    for directory in (_system_dir(), _user_dir()):
        try:
            sig.append(directory.stat().st_mtime_ns)
        except OSError:
            sig.append(0)
    return tuple(sig)


def _read_json(path: Path) -> Optional[dict]:
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _ingest() -> list:
    """All catalog files as (scope, loras) records. User dir is read last so a
    user catalog with the same lora id shadows the shipped one."""
    by_id: dict[str, dict] = {}
    order: list[str] = []
    for directory in (_system_dir(), _user_dir()):
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.json")):
            data = _read_json(path)
            if not data:
                continue
            scope = data.get("scope", {})
            for lora in data.get("loras", []):
                lid = lora.get("id") or lora.get("filename")
                if not lid:
                    continue
                if lid not in by_id:
                    order.append(lid)
                by_id[lid] = {**lora, "scope": scope}
    return [by_id[lid] for lid in order]


def _get_all() -> list:
    global _cache, _cache_signature
    sig = _dir_signature()
    if _cache is not None and sig == _cache_signature:
        return _cache
    _cache = _ingest()
    _cache_signature = sig
    return _cache


def _matches_scope(scope: dict, architecture: str, family: Optional[str]) -> bool:
    scope_type = scope.get("type", "architecture")
    if scope_type == "family":
        return scope.get("architecture") == architecture and scope.get("family") == family
    return scope.get("architecture") == architecture


def list_loras(architecture: str, family: Optional[str] = None) -> list:
    """Scope-filtered LoRAs for the active model, scope stripped from each."""
    out = []
    for lora in _get_all():
        if _matches_scope(lora.get("scope", {}), architecture, family):
            out.append({k: v for k, v in lora.items() if k != "scope"})
    return out


@routes.get("/promptchain/loras/catalog")
async def _api_lora_catalog(request):
    architecture = request.query.get("architecture", "").strip()
    family = request.query.get("family", "").strip() or None
    if not architecture:
        return web.json_response({"loras": []})
    return web.json_response({"loras": list_loras(architecture, family)})
