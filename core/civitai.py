"""
CivitAI API integration — model lookup by hash, baseModel mapping.

Public API (no auth required):
  GET /api/v1/model-versions/by-hash/{sha256}  → model version info
  GET /api/v1/models/{id}                      → full model (author, tags)

All generated data (SHA256 cache) lives in user/PromptChain/.
"""
from __future__ import annotations

import json
import re
import threading
from pathlib import Path
from typing import Optional

import aiohttp
import folder_paths

from .api_utils import atomic_write_json

_API_BASE = "https://civitai.com/api/v1"
_TIMEOUT = aiohttp.ClientTimeout(total=15)

# ── baseModel → (architecture, family) ───────────────────────────

BASEMODEL_MAP: dict[str, tuple[str, str]] = {
    # SDXL family
    "Illustrious":      ("sdxl", "illustrious"),
    "Pony":             ("sdxl", "pony"),
    "NoobAI":           ("sdxl", "noobai"),
    "SDXL 1.0":         ("sdxl", ""),
    "SDXL 0.9":         ("sdxl", ""),
    "SDXL Turbo":       ("sdxl", ""),
    "SDXL Lightning":   ("sdxl", ""),
    "SDXL Distilled":   ("sdxl", ""),
    "SDXL 1.0 LCM":    ("sdxl", ""),
    "Playground v2":    ("sdxl", ""),
    # SD 1.5
    "SD 1.5":           ("sd15", ""),
    "SD 1.5 LCM":      ("sd15", ""),
    "SD 1.5 Hyper":     ("sd15", ""),
    # SD 2.x
    "SD 2.0":           ("sd2", ""),
    "SD 2.0 768":       ("sd2", ""),
    "SD 2.1":           ("sd2", ""),
    "SD 2.1 768":       ("sd2", ""),
    "SD 2.1 Unclip":    ("sd2", ""),
    # Flux
    "Flux.1 D":         ("flux", "flux_dev"),
    "Flux.1 S":         ("flux", "flux_schnell"),
    "Flux.1 Kontext":   ("flux", "flux_kontext"),
    "Flux.2 D":         ("flux2", "flux2"),
    "Flux.2 Klein 4B":      ("flux2", "flux2_klein"),
    "Flux.2 Klein 4B-base": ("flux2", "flux2_klein"),
    "Flux.2 Klein 9B":      ("flux2", "flux2_klein"),
    "Flux.2 Klein 9B-base": ("flux2", "flux2_klein"),
    # ERNIE
    "ERNIE Image":      ("ernie", "ernie_base"),
    "ERNIE Image Turbo": ("ernie", "ernie_turbo"),
    # Other
    "Stable Cascade":   ("cascade", ""),
    "SVD":              ("svd", ""),
    "SVD XT":           ("svd", ""),
    "PixArt a":         ("pixart", ""),
}


def map_basemodel(base_model: str, fallback_arch: str = "") -> tuple[str, str]:
    """Map a CivitAI baseModel string to (architecture, family).
    Falls back to (fallback_arch, '') for unknown baseModel values."""
    result = BASEMODEL_MAP.get(base_model)
    if result:
        return result
    if base_model:
        print(f"[PromptChain] Unknown CivitAI baseModel: '{base_model}' — add to BASEMODEL_MAP in core/civitai.py")
    return (fallback_arch, "")


# Family keywords found in model names — checked when CivitAI's
# baseModel is a generic parent (e.g. "Illustrious" for a NoobAI mix)
_FAMILY_NAME_PATTERNS: list[tuple[str, str, str]] = [
    # (keyword, required_arch, family)
    ("noobai",      "sdxl", "noobai"),
    ("noob ai",     "sdxl", "noobai"),
    ("noob-ai",     "sdxl", "noobai"),
    ("pony",        "sdxl", "pony"),
    ("illustrious", "sdxl", "illustrious"),
    ("klein",       "flux2", "flux2_klein"),
    ("kontext",     "flux",  "flux_kontext"),
]


def _refine_family_from_name(model_name: str, arch: str, current_family: str) -> str:
    """Override family if the model name contains a more specific family keyword.
    Only overrides when the current family is empty or a generic parent."""
    name_lower = model_name.lower()
    for keyword, req_arch, family in _FAMILY_NAME_PATTERNS:
        if keyword in name_lower and arch == req_arch:
            if family != current_family:
                print(f"[PromptChain] Family refined: '{current_family or '(none)'}' → '{family}' (found '{keyword}' in model name)")
            return family
    return current_family


# ── A1111 sampler → ComfyUI (sampler_name, scheduler) ───────────
# CivitAI image meta uses A1111-style combined strings like
# "DPM++ 2M Karras" which ComfyUI splits into sampler + scheduler.

_SAMPLER_MAP: dict[str, tuple[str, str]] = {
    # Euler variants
    "Euler":                        ("euler", "normal"),
    "Euler a":                      ("euler_ancestral", "normal"),
    "Euler CFG++":                  ("euler_cfg_pp", "normal"),
    # Heun
    "Heun":                         ("heun", "normal"),
    # DPM2
    "DPM2":                         ("dpm_2", "normal"),
    "DPM2 a":                       ("dpm_2_ancestral", "normal"),
    "DPM2 Karras":                  ("dpm_2", "karras"),
    "DPM2 a Karras":                ("dpm_2_ancestral", "karras"),
    # DPM++ SDE
    "DPM++ SDE":                    ("dpmpp_sde", "normal"),
    "DPM++ SDE Karras":             ("dpmpp_sde", "karras"),
    "DPM++ SDE Exponential":        ("dpmpp_sde", "exponential"),
    # DPM++ 2S
    "DPM++ 2S a":                   ("dpmpp_2s_ancestral", "normal"),
    "DPM++ 2S a Karras":            ("dpmpp_2s_ancestral", "karras"),
    "DPM++ 2S a Exponential":       ("dpmpp_2s_ancestral", "exponential"),
    # DPM++ 2M
    "DPM++ 2M":                     ("dpmpp_2m", "normal"),
    "DPM++ 2M Karras":              ("dpmpp_2m", "karras"),
    "DPM++ 2M Exponential":         ("dpmpp_2m", "exponential"),
    "DPM++ 2M SDE":                 ("dpmpp_2m_sde", "normal"),
    "DPM++ 2M SDE Karras":          ("dpmpp_2m_sde", "karras"),
    "DPM++ 2M SDE Exponential":     ("dpmpp_2m_sde", "exponential"),
    "DPM++ 2M SDE Heun":            ("dpmpp_2m_sde_heun", "normal"),
    "DPM++ 2M SDE Heun Karras":     ("dpmpp_2m_sde_heun", "karras"),
    "DPM++ 2M SDE Heun Exponential": ("dpmpp_2m_sde_heun", "exponential"),
    # DPM++ 3M
    "DPM++ 3M SDE":                 ("dpmpp_3m_sde", "normal"),
    "DPM++ 3M SDE Karras":          ("dpmpp_3m_sde", "karras"),
    "DPM++ 3M SDE Exponential":     ("dpmpp_3m_sde", "exponential"),
    # Others
    "LMS":                          ("lms", "normal"),
    "LMS Karras":                   ("lms", "karras"),
    "DPM fast":                     ("dpm_fast", "normal"),
    "DPM adaptive":                 ("dpm_adaptive", "normal"),
    "DDIM":                         ("ddim", "normal"),
    "DDPM":                         ("ddpm", "normal"),
    "UniPC":                        ("uni_pc", "normal"),
    "UniPC BH2":                    ("uni_pc_bh2", "normal"),
    "LCM":                          ("lcm", "normal"),
}


def map_sampler(a1111_sampler: str) -> Optional[tuple[str, str]]:
    """Map A1111-style sampler string to (comfyui_sampler, scheduler).
    Returns None if unrecognized."""
    result = _SAMPLER_MAP.get(a1111_sampler)
    if result:
        return result
    if a1111_sampler:
        print(f"[PromptChain] Unknown A1111 sampler: '{a1111_sampler}' — add to _SAMPLER_MAP in core/civitai.py")
    return None


# ── SHA256 cache ─────────────────────────────────────────────────

_sha256_lock = threading.Lock()
_sha256_cache: Optional[dict[str, str]] = None


def _get_cache_path() -> Path:
    return Path(folder_paths.get_user_directory()) / "PromptChain" / "sha256_cache.json"


def _load_sha256_cache() -> dict[str, str]:
    global _sha256_cache
    if _sha256_cache is not None:
        return _sha256_cache
    path = _get_cache_path()
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                _sha256_cache = json.load(f)
        except Exception:
            _sha256_cache = {}
    else:
        _sha256_cache = {}
    return _sha256_cache


def get_cached_sha256(quick_hash: str) -> Optional[str]:
    with _sha256_lock:
        cache = _load_sha256_cache()
        return cache.get(quick_hash)


def set_cached_sha256(quick_hash: str, full_sha256: str):
    with _sha256_lock:
        cache = _load_sha256_cache()
        cache[quick_hash] = full_sha256
        path = _get_cache_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            atomic_write_json(path, cache)
        except Exception as e:
            print(f"[PromptChain] Failed to save SHA256 cache: {e}")


# ── CivitAI API ──────────────────────────────────────────────────


def _pick_thumbnail(images: list, max_nsfw: int = 1) -> Optional[str]:
    """Pick the first SFW image and return a 256px thumbnail URL."""
    for img in images:
        if img.get("type") != "image":
            continue
        if img.get("nsfwLevel", 99) > max_nsfw:
            continue
        url = img.get("url", "")
        if not url:
            continue
        return re.sub(r"/original=true/", "/width=256/", url)
    return None


async def search_models(query: str, limit: int = 10, cursor: str = "") -> dict:
    """Search CivitAI for checkpoints. First call fires tag + query in parallel.
    Subsequent calls (with cursor) paginate the tag-based results.
    Returns {"results": [...], "next_cursor": str|None}."""
    from datetime import datetime, timezone

    url = f"{_API_BASE}/models"
    next_cursor = None

    try:
        raw_items = []
        async with aiohttp.ClientSession() as session:
            if cursor:
                params = {"tag": query, "types": "Checkpoint", "sort": "Highest Rated",
                          "period": "Year", "limit": str(limit), "cursor": cursor}
                async with session.get(url, params=params, timeout=_TIMEOUT) as resp:
                    if resp.status == 200:
                        raw = await resp.json()
                        raw_items = raw.get("items", [])
                        next_cursor = raw.get("metadata", {}).get("nextCursor")
            else:
                params_tag = {"tag": query, "types": "Checkpoint", "sort": "Highest Rated",
                              "period": "Year", "limit": str(limit)}
                params_query = {"query": query, "types": "Checkpoint", "sort": "Highest Rated",
                                "limit": str(limit)}
                # Sequential to avoid aiohttp context manager issues
                async with session.get(url, params=params_tag, timeout=_TIMEOUT) as resp_tag:
                    raw_tag = await resp_tag.json() if resp_tag.status == 200 else {}
                async with session.get(url, params=params_query, timeout=_TIMEOUT) as resp_query:
                    raw_query = await resp_query.json() if resp_query.status == 200 else {}
                raw_items = raw_tag.get("items", []) + raw_query.get("items", [])
                next_cursor = raw_tag.get("metadata", {}).get("nextCursor")
    except Exception as e:
        print(f"[PromptChain] CivitAI search failed: {e}")
        return {"results": [], "next_cursor": None}

    results_by_id: dict[int, dict] = {}
    now = datetime.now(timezone.utc)

    for raw_model in raw_items:
        model_id = raw_model.get("id")
        if not model_id or model_id in results_by_id:
            continue

        # Find the latest freely downloadable version
        best_version = None
        for v in raw_model.get("modelVersions", []):
            if v.get("availability") == "EarlyAccess":
                continue
            best_version = v
            break

        if not best_version:
            continue

        base_model = best_version.get("baseModel", "")
        arch, family = map_basemodel(base_model)
        model_name = raw_model.get("name", "")
        family = _refine_family_from_name(model_name, arch, family)

        # Pick best file
        best_file = _pick_best_file(best_version.get("files", []))

        thumbnail = _pick_thumbnail(best_version.get("images", []))

        results_by_id[model_id] = {
            "model_name": model_name,
            "version_name": best_version.get("name", ""),
            "base_model": base_model,
            "architecture": arch,
            "family": family,
            "civitai_model_id": model_id,
            "civitai_version_id": best_version.get("id"),
            "downloads": raw_model.get("stats", {}).get("downloadCount", 0),
            "thumbs_up": raw_model.get("stats", {}).get("thumbsUpCount", 0),
            "nsfw_level": raw_model.get("nsfwLevel", 1),
            "tags": raw_model.get("tags", []),
            "file": best_file,
            "thumbnail": thumbnail,
        }

    results = sorted(results_by_id.values(), key=lambda r: r["downloads"], reverse=True)[:limit]
    return {"results": results, "next_cursor": next_cursor}


def _pick_best_file(files: list) -> Optional[dict]:
    """Pick the best downloadable file — prefers safetensors fp16 pruned."""
    scored: list[tuple[int, dict]] = []
    for f in files:
        meta = f.get("metadata", {})
        score = 0
        if meta.get("format") == "SafeTensor":
            score += 10
        if meta.get("fp") == "fp16":
            score += 5
        if meta.get("size") == "pruned":
            score += 3
        scored.append((score, f))

    if not scored:
        return None

    scored.sort(key=lambda x: x[0], reverse=True)
    best = scored[0][1]
    name = best.get("name", "")
    return {
        "name": name,
        "filename": name,
        "folder": "checkpoints",
        "size_gb": round(best.get("sizeKB", 0) / 1048576, 1),
        "download_url": best.get("downloadUrl", ""),
        "format": best.get("metadata", {}).get("format", ""),
        "fp": best.get("metadata", {}).get("fp", ""),
    }


# Disk-backed TTL cache for fetch_model_versions.  Panel re-opens are
# the hot path — every time the settings modal opens on a CivitAI-tagged
# model it would otherwise re-hit /api/v1/models/{id}.  Persisting to
# disk means the cache also survives server restarts.
#
# Entry shape (JSON):
#   {model_id_as_str: {
#     "fetched_at": epoch_seconds,
#     "versions": [...],
#     "deleted": bool,       # true when CivitAI returned 404
#   }}
# Keys are stringified because JSON object keys can't be ints.
#
# Two TTLs: a short one for live models (small enough that new releases
# surface within minutes on next open) and a long one for 404s so we
# don't hammer CivitAI looking up models that have been taken down.

_versions_cache: Optional[dict[str, dict]] = None
_versions_cache_lock = threading.Lock()
_VERSIONS_CACHE_TTL_SECONDS = 600            # 10 min — live models
_VERSIONS_CACHE_DELETED_TTL_SECONDS = 86400  # 24 h — 404s
_VERSIONS_CACHE_MAX_AGE_SECONDS = 604800     # 7 days — drop on load


def _get_versions_cache_path() -> Path:
    return Path(folder_paths.get_user_directory()) / "PromptChain" / "civitai_versions_cache.json"


def _entry_ttl(entry: dict) -> int:
    return _VERSIONS_CACHE_DELETED_TTL_SECONDS if entry.get("deleted") else _VERSIONS_CACHE_TTL_SECONDS


def _load_versions_cache() -> dict[str, dict]:
    """Load + evict stale entries.  Silent on corrupt JSON — returns {}
    so a bad file doesn't wedge the whole feature."""
    global _versions_cache
    if _versions_cache is not None:
        return _versions_cache
    path = _get_versions_cache_path()
    raw: dict = {}
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)
                if not isinstance(raw, dict):
                    raw = {}
        except Exception:
            raw = {}
    import time as _time
    now = _time.time()
    evicted_any = False
    cleaned: dict[str, dict] = {}
    for k, v in raw.items():
        if not isinstance(v, dict):
            evicted_any = True
            continue
        age = now - v.get("fetched_at", 0)
        if age > _VERSIONS_CACHE_MAX_AGE_SECONDS:
            evicted_any = True
            continue
        cleaned[k] = v
    _versions_cache = cleaned
    if evicted_any:
        try:
            _save_versions_cache_unlocked()
        except Exception:
            pass
    return _versions_cache


def _save_versions_cache_unlocked():
    """Caller must hold _versions_cache_lock."""
    if _versions_cache is None:
        return
    path = _get_versions_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        atomic_write_json(path, _versions_cache)
    except Exception as e:
        print(f"[PromptChain] Failed to save CivitAI versions cache: {e}")


def invalidate_versions_cache(model_id: int):
    """Drop the cache entry for a model_id.  Called after a successful
    download so the next panel open sees the freshly-installed version
    instead of continuing to advertise it as a download bubble."""
    key = str(model_id)
    with _versions_cache_lock:
        cache = _load_versions_cache()
        if key in cache:
            del cache[key]
            _save_versions_cache_unlocked()


def get_cached_versions_entry(model_id: int) -> Optional[dict]:
    """Read-only accessor so the API layer can surface fetched_at to
    the frontend without re-fetching."""
    key = str(model_id)
    with _versions_cache_lock:
        cache = _load_versions_cache()
        entry = cache.get(key)
        return dict(entry) if entry else None


async def fetch_model_versions(model_id: int, *, force: bool = False) -> list[dict]:
    """Fetch all versions of a CivitAI model by id.

    Returns a list of normalized version entries sorted newest-first by
    publishedAt. EarlyAccess entries are dropped to match the search path.
    Entries without a usable Model-type file are dropped too — some
    versions only ship training data.

    Results persist to user/PromptChain/civitai_versions_cache.json so
    repeat panel opens (even across server restarts) short-circuit the
    API call until the TTL expires.

    Failure handling:
      - 200: normal path, cached with standard TTL
      - 404: cached with deleted=True and a 24h TTL so we don't hammer
        CivitAI for models that have been taken down
      - any other status or network exception: returns [] without
        touching the cache, so a transient outage doesn't poison
        future calls

    Shape per entry:
      {civitai_version_id, version_name, base_model, published_at,
       availability, file: {filename, folder, size_gb, download_url,
       format, fp} | None}
    """
    import time as _time
    now = _time.time()
    key = str(model_id)

    if not force:
        with _versions_cache_lock:
            cache = _load_versions_cache()
            entry = cache.get(key)
            if entry and (now - entry.get("fetched_at", 0)) < _entry_ttl(entry):
                return entry.get("versions", [])

    url = f"{_API_BASE}/models/{model_id}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=_TIMEOUT) as resp:
                if resp.status == 404:
                    # Model deleted on CivitAI — cache as tombstone so
                    # we stop retrying.  Keep the existing entry if any,
                    # just flip `deleted` and bump fetched_at.
                    with _versions_cache_lock:
                        cache = _load_versions_cache()
                        cache[key] = {"fetched_at": now, "versions": [], "deleted": True}
                        _save_versions_cache_unlocked()
                    return []
                if resp.status != 200:
                    return []
                raw_model = await resp.json()
    except Exception as e:
        print(f"[PromptChain] CivitAI fetch_model_versions({model_id}) failed: {e}")
        return []

    results: list[dict] = []
    for v in raw_model.get("modelVersions", []):
        if v.get("availability") == "EarlyAccess":
            continue
        # Only consider Model-type files; training data and config files
        # ship in the same array but aren't what the user wants to download.
        model_files = [f for f in v.get("files", []) if f.get("type") == "Model"]
        if not model_files:
            continue
        best = _pick_best_file(model_files)
        if not best or not best.get("download_url"):
            continue
        results.append({
            "civitai_version_id": v.get("id"),
            "version_name": v.get("name", ""),
            "base_model": v.get("baseModel", ""),
            "published_at": v.get("publishedAt", ""),
            "availability": v.get("availability", ""),
            "file": best,
        })

    results.sort(key=lambda r: r.get("published_at", ""), reverse=True)

    with _versions_cache_lock:
        cache = _load_versions_cache()
        cache[key] = {"fetched_at": now, "versions": results}
        _save_versions_cache_unlocked()

    return results


async def lookup_by_hash(sha256_hex: str) -> Optional[dict]:
    """Look up a model on CivitAI by SHA256 hash.
    Makes two calls: by-hash for version info, then /models/{id} for full metadata.
    Returns enriched normalized info or None."""
    version_url = f"{_API_BASE}/model-versions/by-hash/{sha256_hex}"
    try:
        async with aiohttp.ClientSession() as session:
            # First call: version info (includes images with meta)
            async with session.get(version_url, timeout=_TIMEOUT) as resp:
                if resp.status != 200:
                    return None
                raw_version = await resp.json()

            # Second call: full model info (author, tags, description)
            model_id = raw_version.get("modelId")
            raw_model = None
            if model_id:
                model_url = f"{_API_BASE}/models/{model_id}"
                try:
                    async with session.get(model_url, timeout=_TIMEOUT) as resp:
                        if resp.status == 200:
                            raw_model = await resp.json()
                except Exception:
                    pass  # non-fatal — we still have version data

            return normalize_version(raw_version, raw_model)
    except Exception as e:
        print(f"[PromptChain] CivitAI lookup failed: {e}")
        return None


def normalize_version(raw_version: dict, raw_model: Optional[dict] = None) -> dict:
    """Flatten CivitAI responses into a consistent shape."""
    model = raw_version.get("model", {})
    base_model = raw_version.get("baseModel", "")
    arch, family = map_basemodel(base_model)

    # Override family from model name — creators often include the actual
    # base in the title even when CivitAI's baseModel field is generic
    model_name = model.get("name", "")
    family = _refine_family_from_name(model_name, arch, family)

    trained_words = raw_version.get("trainedWords") or []

    result = {
        "model_name": model.get("name", ""),
        "version_name": raw_version.get("name", ""),
        "base_model": base_model,
        "architecture": arch,
        "family": family,
        "trigger_words": trained_words,
        "model_type": model.get("type", ""),
        "civitai_model_id": raw_version.get("modelId"),
        "civitai_version_id": raw_version.get("id"),
        "early_access_ends": raw_version.get("earlyAccessEndsAt"),
        "published_at": raw_version.get("publishedAt"),
        "nsfw_level": raw_version.get("nsfwLevel", 1),
    }

    # Version-level extras
    result["download_url"] = raw_version.get("downloadUrl", "")
    result["air"] = raw_version.get("air", "")

    # Enrich from full model response
    if raw_model:
        creator = raw_model.get("creator", {})
        result["author"] = creator.get("username", "")
        result["tags"] = raw_model.get("tags", [])
        desc = raw_model.get("description", "")
        if desc:
            result["description"] = re.sub(r"<[^>]+>", "", desc).strip()[:500]

        # License
        license_parts = []
        commercial = raw_model.get("allowCommercialUse")
        if commercial:
            license_parts.append(f"Commercial: {commercial}")
        if not raw_model.get("allowDerivatives", True):
            license_parts.append("No derivatives")
        if raw_model.get("allowNoCredit"):
            license_parts.append("No credit required")
        if license_parts:
            result["license"] = "; ".join(license_parts)

    # Extract generation settings from sample images
    gen_settings = _extract_generation_settings(raw_version.get("images", []))
    if gen_settings:
        result["generation_settings"] = gen_settings

    return result


def _extract_generation_settings(images: list) -> Optional[dict]:
    """Extract consensus generation settings from CivitAI sample images.
    Uses the most common values across images that have metadata."""
    from collections import Counter

    steps_c: Counter = Counter()
    cfg_c: Counter = Counter()
    sampler_c: Counter = Counter()
    clip_skip_c: Counter = Counter()
    resolution_c: Counter = Counter()
    negative_c: Counter = Counter()

    for img in images:
        meta = img.get("meta")
        if not meta:
            continue

        if "steps" in meta:
            steps_c[int(meta["steps"])] += 1
        if "cfgScale" in meta:
            cfg_c[float(meta["cfgScale"])] += 1

        # Sampler — map from A1111 format to ComfyUI
        raw_sampler = meta.get("sampler", "")
        if raw_sampler:
            mapped = map_sampler(raw_sampler)
            if mapped:
                sampler_c[mapped] += 1

        # Clip skip — multiple possible key names/types
        clip = meta.get("clipSkip") or meta.get("Clip skip")
        if clip is not None:
            try:
                clip_skip_c[int(clip)] += 1
            except (ValueError, TypeError):
                pass

        # Resolution from "Size" field ("832x1216") or width/height keys
        size_str = meta.get("Size", "")
        if size_str and "x" in size_str:
            try:
                w, h = size_str.split("x")
                resolution_c[(int(w), int(h))] += 1
            except (ValueError, TypeError):
                pass
        elif "width" in meta and "height" in meta:
            try:
                resolution_c[(int(meta["width"]), int(meta["height"]))] += 1
            except (ValueError, TypeError):
                pass

        # Negative prompt
        neg = meta.get("negativePrompt", "")
        if neg:
            negative_c[neg] += 1

    if not (steps_c or cfg_c or sampler_c):
        return None

    settings: dict = {}
    if steps_c:
        settings["steps"] = steps_c.most_common(1)[0][0]
    if cfg_c:
        settings["cfg"] = cfg_c.most_common(1)[0][0]
    if sampler_c:
        sampler, scheduler = sampler_c.most_common(1)[0][0]
        settings["sampler_name"] = sampler
        settings["scheduler"] = scheduler
    if clip_skip_c:
        settings["clip_skip"] = clip_skip_c.most_common(1)[0][0]
    if resolution_c:
        w, h = resolution_c.most_common(1)[0][0]
        settings["width"] = w
        settings["height"] = h
    if negative_c:
        neg, count = negative_c.most_common(1)[0]
        # Only use if majority consensus, enough distinct tags to be
        # useful, long enough to not be embedding shorthand, and seen
        # across multiple distinct images so one flaky sample can't
        # dictate defaults.
        total_with_meta = sum(1 for img in images if img.get("meta"))
        tags = [t.strip() for t in neg.split(",")]
        if (count >= 3
            and count >= total_with_meta * 0.5
            and len(tags) >= 5):
            settings["negative"] = neg

    return settings


def build_model_settings(civitai_info: dict, fallback_arch: str = "") -> dict:
    """Build model settings dict from CivitAI data.
    Includes identity for template scoping + generation defaults from sample images."""
    arch = civitai_info["architecture"] or fallback_arch
    family = civitai_info["family"]
    model_name = civitai_info["model_name"]
    version_name = civitai_info["version_name"]

    trigger = ", ".join(civitai_info.get("trigger_words", []))

    settings: dict = {
        "display_name": f"{model_name} - {version_name}" if version_name else model_name,
        "model_name": model_name,
        "architecture": arch,
        "_source": "civitai_auto",
    }

    if version_name:
        settings["version"] = version_name
    if family:
        settings["family"] = family
    if trigger:
        settings["trigger"] = trigger
    if civitai_info.get("author"):
        settings["author"] = civitai_info["author"]
    if civitai_info.get("tags"):
        settings["tags"] = civitai_info["tags"]
    if civitai_info.get("description"):
        settings["description"] = civitai_info["description"]
    if civitai_info.get("published_at"):
        # Extract date portion from ISO timestamp
        settings["release_date"] = civitai_info["published_at"][:10]
    if civitai_info.get("civitai_model_id"):
        settings["url"] = f"https://civitai.com/models/{civitai_info['civitai_model_id']}"
        settings["civitai_model_id"] = civitai_info["civitai_model_id"]
    if civitai_info.get("civitai_version_id"):
        settings["civitai_version_id"] = civitai_info["civitai_version_id"]
    if civitai_info.get("nsfw_level"):
        settings["nsfw_level"] = civitai_info["nsfw_level"]
    if civitai_info.get("download_url"):
        settings["download_url"] = civitai_info["download_url"]
    if civitai_info.get("license"):
        settings["license"] = civitai_info["license"]

    # Generation defaults from sample images
    gen = civitai_info.get("generation_settings")
    if gen:
        nodes: dict = {}
        ksampler: dict = {}
        if "steps" in gen:
            ksampler["steps"] = gen["steps"]
        if "cfg" in gen:
            ksampler["cfg"] = gen["cfg"]
        if "sampler_name" in gen:
            ksampler["sampler_name"] = gen["sampler_name"]
        if "scheduler" in gen:
            ksampler["scheduler"] = gen["scheduler"]
        if ksampler:
            nodes["KSampler"] = ksampler

        if "clip_skip" in gen:
            nodes["CLIPSetLastLayer"] = {"stop_at_clip_layer": -gen["clip_skip"]}

        if "width" in gen and "height" in gen:
            nodes["EmptyLatentImage"] = {
                "width": gen["width"],
                "height": gen["height"],
            }

        if nodes:
            settings["nodes"] = nodes

        if gen.get("negative"):
            settings["negative"] = gen["negative"]

    return settings


# ── download ─────────────────────────────────────────────────────

import os

_download_state: dict = {
    "active": False,
    "filename": "",
    "folder_type": "",
    "progress": 0,
    "size_bytes": 0,
    "downloaded": 0,
    "status": "idle",  # idle, downloading, completed, failed, cancelled
    "error": None,
}
_download_lock = threading.Lock()
_download_cancel = threading.Event()


def get_download_state() -> dict:
    with _download_lock:
        return dict(_download_state)


def cancel_download():
    _download_cancel.set()


def get_checkpoints_folder() -> str:
    folders = folder_paths.get_folder_paths("checkpoints")
    return folders[0] if folders else ""


def _get_api_key() -> Optional[str]:
    """Resolve CivitAI API key.  Environment variable wins over config
    so a secure deployment can keep the key out of the on-disk config
    file without deleting the existing user-saved value."""
    env_key = os.environ.get("CIVITAI_API_KEY", "").strip()
    if env_key:
        return env_key
    from . import config as promptchain_config
    key = promptchain_config.load().get("civitai_api_key", "").strip()
    return key or None


def probe_file_size(url: str) -> int:
    """Best-effort byte size of a download URL (Content-Length only, no body
    fetched). Catalog presets carry no size_bytes, so the download modal calls
    this to show the size up front. Returns 0 on any failure — the UI just
    omits the size then."""
    if not url:
        return 0
    import requests
    headers = {}
    if "civitai.com" in url:
        api_key = _get_api_key()
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
    try:
        resp = requests.get(url, stream=True, timeout=20, allow_redirects=True, headers=headers)
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        resp.close()
        return total if total > 0 else 0
    except Exception:
        return 0


# Cap on any single download.  50 GiB accommodates the largest public
# checkpoints; protects against a malicious or misconfigured server
# reporting a bogus Content-Length that would otherwise exhaust disk.
_MAX_DOWNLOAD_BYTES = 50 * 1024 ** 3
# Per-chunk stall timeout.  The requests-level `timeout=30` only covers
# connect + initial response; a server that sends headers then stalls
# mid-body would hang indefinitely without this secondary deadline.
_CHUNK_STALL_SECONDS = 60


def download_model(url: str, filename: str, on_progress=None, folder_type: str = "checkpoints"):
    """Download a file to a model folder. Blocking — run in a thread.

    folder_type: any folder_paths key (checkpoints, diffusion_models, text_encoders, vae, etc.)
    on_progress(downloaded, total) called periodically.
    """
    import requests
    import shutil
    import time as _time

    try:
        folders = folder_paths.get_folder_paths(folder_type)
        # Prefer directory whose name matches the folder_type key.
        # folder_paths often returns aliases (e.g. "unet" first for
        # "diffusion_models") which causes files to land in the wrong dir.
        dest_dir = ""
        for f in folders:
            if os.path.basename(f) == folder_type:
                dest_dir = f
                break
        if not dest_dir:
            dest_dir = folders[0] if folders else ""
    except Exception:
        dest_dir = ""
    if not dest_dir:
        raise RuntimeError(f"No folder configured for type '{folder_type}'")

    os.makedirs(dest_dir, exist_ok=True)
    # strip path separators to prevent directory traversal
    filename = os.path.basename(filename)
    if not filename:
        raise RuntimeError("invalid filename")
    dest_path = os.path.join(dest_dir, filename)
    temp_path = dest_path + ".part"

    _download_cancel.clear()

    with _download_lock:
        _download_state["active"] = True
        _download_state["filename"] = filename
        _download_state["folder_type"] = folder_type
        _download_state["progress"] = 0
        _download_state["downloaded"] = 0
        _download_state["status"] = "downloading"
        _download_state["error"] = None

    try:
        headers = {}
        is_civitai = "civitai.com" in url
        if is_civitai:
            api_key = _get_api_key()
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            else:
                raise RuntimeError("CivitAI API key required for downloads. Set it in PromptChain/config.json or CIVITAI_API_KEY env var.")

        # Resume an interrupted download: a leftover .part is a valid in-order
        # prefix of the file (TCP delivers bytes in order, and HTTP errors are
        # caught before any write, so .part only ever holds real body bytes).
        # Ask the server to continue from that offset via a Range request.
        resume_from = 0
        try:
            if os.path.isfile(temp_path):
                resume_from = os.path.getsize(temp_path)
        except OSError:
            resume_from = 0
        if resume_from:
            headers["Range"] = f"bytes={resume_from}-"

        resp = requests.get(url, stream=True, timeout=30, allow_redirects=True, headers=headers)

        # Range rejected (416): our .part is >= the server's file. Exactly equal
        # = a finished-but-unpromoted download, so promote it; any other offset
        # is unusable, so discard the stub and restart clean.
        already_complete = False
        if resume_from and resp.status_code == 416:
            tail = resp.headers.get("content-range", "").rsplit("/", 1)[-1]
            full = int(tail) if tail.isdigit() else 0
            resp.close()
            if full and resume_from == full:
                already_complete = True
            else:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
                resume_from = 0
                headers.pop("Range", None)
                resp = requests.get(url, stream=True, timeout=30, allow_redirects=True, headers=headers)

        if not already_complete:
            resp.raise_for_status()

            # 206 = server honored the resume; its Content-Range carries the FULL
            # size (Content-Length is only the remaining tail). Any other status
            # (200) means Range was ignored — start clean so we never append onto
            # a stale head or double-count progress.
            if resp.status_code == 206:
                mode = "ab"
                tail = resp.headers.get("content-range", "").rsplit("/", 1)[-1]
                total = int(tail) if tail.isdigit() else resume_from + int(resp.headers.get("content-length", 0))
            else:
                mode = "wb"
                resume_from = 0
                total = int(resp.headers.get("content-length", 0))

            if total > _MAX_DOWNLOAD_BYTES:
                resp.close()
                raise RuntimeError(f"refusing download: size {total} exceeds cap {_MAX_DOWNLOAD_BYTES}")
            if total > 0:
                try:
                    free = shutil.disk_usage(dest_dir).free
                    if (total - resume_from) > free:
                        resp.close()
                        raise RuntimeError(f"insufficient disk space: need {total - resume_from}, have {free}")
                except OSError:
                    pass  # disk_usage can fail on some network mounts; don't block download

            with _download_lock:
                _download_state["size_bytes"] = total

            downloaded = resume_from
            last_chunk_at = _time.monotonic()
            with open(temp_path, mode) as f:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    if _download_cancel.is_set():
                        resp.close()
                        raise RuntimeError("Download cancelled")
                    now = _time.monotonic()
                    if now - last_chunk_at > _CHUNK_STALL_SECONDS:
                        resp.close()
                        raise RuntimeError(f"download stalled: no data for {_CHUNK_STALL_SECONDS}s")
                    if not chunk:
                        continue
                    last_chunk_at = now
                    downloaded += len(chunk)
                    if downloaded > _MAX_DOWNLOAD_BYTES:
                        resp.close()
                        # streamed past the declared size → the .part is corrupt
                        try:
                            os.remove(temp_path)
                        except OSError:
                            pass
                        raise RuntimeError(f"download exceeded cap {_MAX_DOWNLOAD_BYTES} bytes (server lied about Content-Length)")
                    f.write(chunk)
                    progress = (downloaded / total * 100) if total else 0

                    with _download_lock:
                        _download_state["downloaded"] = downloaded
                        _download_state["progress"] = progress

                    if on_progress:
                        on_progress(downloaded, total)

            # Never promote a short file to its final name: a stream that ended
            # early without raising would otherwise look complete on disk and
            # block resume forever. Keep the .part so the next attempt continues.
            if total > 0 and downloaded != total:
                raise RuntimeError(f"incomplete download: got {downloaded} of {total} bytes")

        os.replace(temp_path, dest_path)

        with _download_lock:
            _download_state["progress"] = 100
            _download_state["status"] = "completed"

    except Exception as e:
        with _download_lock:
            _download_state["status"] = "failed"
            _download_state["error"] = str(e)
        # Keep the .part on a recoverable interruption (stall, network drop,
        # cancel, incomplete) so the next attempt resumes from here instead of
        # restarting. The corrupt-state paths above already removed it.
        raise
    finally:
        with _download_lock:
            _download_state["active"] = False
