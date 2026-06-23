"""
Per-model settings storage — keyed by fingerprint hash.

Three layers:
  System:     data/models/{readable_name}.json — shipped presets (read-only)
  Discovered: cache/models/{readable_name}.json — auto-detected via CivitAI
  User:       {user_dir}/PromptChain/models/{hash}.json — user overrides

Each config embeds quick_hash and sha256 in its files array. Lookups go
through a hash + filename config index.

User settings override the resolved base config. When a file matches both a
curated system preset (by filename) and an auto-discovered config (by the
embedded hash), the system preset wins — it holds the authoritative family,
templates, and node ranges. On save, only the delta from the base config is
stored so shipped updates still propagate.
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

import folder_paths

from . import fingerprint
from .api_utils import atomic_write_json

logger = logging.getLogger("promptchain.model_settings")

_HASH_RE = re.compile(r"^[0-9a-f]{16}$")


def _ascii_safe(text: str) -> str:
    # Windows stdout is often cp1252; emoji/non-latin chars in log args
    # raise UnicodeEncodeError inside the handler. Strip to ASCII for logs.
    return str(text).encode("ascii", "replace").decode("ascii")


def _system_dir() -> Path:
    return Path(__file__).parent.parent / "data" / "models"


def _discovered_dir() -> Path:
    return Path(__file__).parent.parent / "cache" / "models"


def _user_dir() -> Path:
    return Path(folder_paths.get_user_directory()) / "PromptChain" / "models"


# ── config index: hash → config data ─────────────────────────────
# Built lazily from system + discovered configs. Maps quick_hash,
# sha256, and filename to config data for O(1) lookups. Replaces the
# old filename-based reverse index.

_config_index: Optional[dict] = None
_config_index_signature: Optional[tuple] = None


def _config_dir_signature() -> tuple:
    # Freshness check mirroring get_db's mtime watch: a directory's mtime
    # changes when configs are added, removed, or atomically replaced
    # (atomic_write_json renames into place; git /deploy pulls write new
    # files), so shipped presets are picked up without a server restart.
    # In-place content edits to an existing file don't bump the dir mtime —
    # those still need invalidate_config_index() or a restart.
    sig = []
    for directory in (_system_dir(), _discovered_dir()):
        try:
            sig.append(directory.stat().st_mtime_ns)
        except OSError:
            sig.append(0)
    return tuple(sig)


def _get_config_index() -> dict:
    global _config_index, _config_index_signature
    sig = _config_dir_signature()
    if _config_index is not None and sig == _config_index_signature:
        return _config_index
    _config_index = _build_config_index()
    _config_index_signature = sig
    return _config_index


def invalidate_config_index():
    """Force rebuild on next lookup (e.g. after adding/removing configs)."""
    global _config_index, _config_index_signature
    _config_index = None
    _config_index_signature = None


def _build_config_index() -> dict:
    """Scan discovered + system configs, build hash and filename indexes.

    Discovered is scanned first so curated system configs take priority
    when both exist for the same hash.
    """
    index = {
        "by_quick_hash": {},  # quick_hash → config dict
        "by_sha256": {},      # sha256 → config dict
        "by_filename": {},    # filename.lower() → config dict
    }
    # Discovered first, then system — system overwrites, giving curated
    # configs priority over auto-detected ones. Each config is stamped with
    # its source tier so the resolver can prefer a curated system preset over
    # an auto-discovered config when both match the same physical file.
    for directory, tier in ((_discovered_dir(), "discovered"),
                            (_system_dir(), "system")):
        if not directory.is_dir():
            continue
        for path in directory.glob("*.json"):
            if path.name.startswith("_"):
                continue
            data = _read_json(path)
            if not data:
                continue
            data["_source_tier"] = tier

            # Legacy hash-named configs without files array:
            # treat stem as quick_hash
            if "files" not in data and _HASH_RE.match(path.stem):
                index["by_quick_hash"][path.stem] = data
                continue

            if "files" not in data:
                continue

            _index_file_entries(index, data)

    return index


def _index_file_entries(index: dict, config: dict):
    """Add a config's file entries to the index by hash and filename."""
    for entry in config.get("files", []):
        _index_single_entry(index, entry, config)
        for variant in entry.get("variants", []):
            _index_single_entry(index, variant, config)


def _index_single_entry(index: dict, entry: dict, config: dict):
    qh = entry.get("quick_hash")
    if qh:
        index["by_quick_hash"][qh] = config
    sha = entry.get("sha256")
    if sha:
        index["by_sha256"][sha] = config
    fname = entry.get("filename")
    if fname:
        key = fname.lower()
        existing = index["by_filename"].get(key)
        if existing is not None and existing is not config:
            existing_system = existing.get("_source_tier") == "system"
            new_system = config.get("_source_tier") == "system"
            # A curated system preset always wins over an auto-discovered
            # config for the same filename — the discovered one carries the
            # file's hash but lacks the authoritative family/templates. Within
            # the same tier, keep first (deterministic by scan order) and log.
            if existing_system and not new_system:
                return
            if not (new_system and not existing_system):
                logger.debug(
                    "filename collision %s: kept %s, ignored %s",
                    fname,
                    _ascii_safe(existing.get("display_name", "?")),
                    _ascii_safe(config.get("display_name", "?")),
                )
                return
        index["by_filename"][key] = config


# Fields that are specific to a single version of a model — must come
# from the new recognition, never inherited from a sibling config.
# Everything else (model_name, trigger, negative, prompt_style, nodes
# ranges / options, tag_sources, notes, etc.) counts as curated
# model-level data worth inheriting.
VERSION_SPECIFIC_KEYS = frozenset({
    "version",
    "release_date",
    "civitai_version_id",
    "download_url",
    "files",
    "description",   # CivitAI returns a per-version description
    "nsfw_level",    # can differ between versions
})


def find_sibling_config(civitai_model_id, exclude_quick_hash: Optional[str] = None) -> Optional[dict]:
    """Return the oldest existing config sharing this civitai_model_id.

    Used during recognition of a new version so it can inherit the
    sibling's curated fields (model_name, trigger words, node ranges,
    etc.) instead of saving a bare-bones CivitAI dump.  Oldest wins
    because older configs reflect the page before the creator started
    embellishing it, and curated system presets generally have their
    release_date already set.
    """
    if civitai_model_id is None:
        return None
    try:
        target = int(civitai_model_id)
    except (TypeError, ValueError):
        return None
    best_date = "9999-99-99"
    best: Optional[dict] = None
    seen: set[int] = set()
    index = _get_config_index()
    for cfg in index.get("by_quick_hash", {}).values():
        if id(cfg) in seen:
            continue
        seen.add(id(cfg))
        try:
            if int(cfg.get("civitai_model_id") or 0) != target:
                continue
        except (TypeError, ValueError):
            continue
        if exclude_quick_hash:
            files = cfg.get("files") or []
            if any(f.get("quick_hash") == exclude_quick_hash for f in files):
                continue
            # Legacy hash-named configs: the filename stem is the hash.
            # _build_config_index indexes them without a files array so
            # we can't check that path; fall back to sniffing the index
            # key that holds this config.
        date = cfg.get("release_date") or "9999-99-99"
        if date < best_date:
            best_date = date
            best = cfg
    return best


def find_curated_hash_sibling(config: dict) -> Optional[dict]:
    """Find a curated config sharing a file hash with this one.

    CivitAI never returns a 'family', and a CivitAI dump that is byte-identical
    to a curated preset often can't match it by civitai_model_id (HF-sourced
    presets carry none). Matching on the exact file hash lets the discovered
    config inherit the curated identity fields — family above all. A shared
    quick_hash/sha256 means identical file bytes, so it's the same model.
    Only returns a candidate that actually has 'family' (i.e. a curated source),
    never another bare auto-discovered config.
    """
    index = _get_config_index()

    def _candidates(entry):
        for bucket, key in (("by_quick_hash", entry.get("quick_hash")),
                            ("by_sha256", entry.get("sha256"))):
            if key:
                yield index[bucket].get(key)

    for entry in config.get("files", []):
        sources = [entry] + entry.get("variants", [])
        for src in sources:
            for cand in _candidates(src):
                if cand is not None and cand is not config and cand.get("family"):
                    return cand
    return None


def inherit_from_sibling(new_config: dict, sibling: dict) -> dict:
    """Merge a sibling config's curated fields into a freshly-built
    version config.  New wins for version-specific keys; sibling wins
    for everything else.  display_name regenerates from the canonical
    model_name plus the new version's label so it stays consistent."""
    merged = dict(new_config)
    for key, value in sibling.items():
        if key in VERSION_SPECIFIC_KEYS:
            continue
        if key.startswith("_"):
            continue
        merged[key] = value
    name = merged.get("model_name") or merged.get("display_name", "")
    version = merged.get("version", "")
    if name:
        merged["display_name"] = f"{name} - {version}" if version else name
    return merged


# Back-compat alias: previous code called find_canonical_model_name
# before we broadened the inheritance to whole configs.
def find_canonical_model_name(civitai_model_id) -> Optional[str]:
    sib = find_sibling_config(civitai_model_id)
    if not sib:
        return None
    return sib.get("model_name") or sib.get("display_name")


def normalize_civitai_model_names():
    """Heal discovered configs on boot: for each one that shares a
    civitai_model_id with a sibling (curated system config, or older
    auto-discovered config), re-inherit the sibling's curated fields.

    Runs after scan_models so the config index is primed.  Only touches
    files in _discovered_dir() — system configs stay read-only.  Fixes
    both the model_name inconsistency (CivitAI page rename drift) and
    the missing curated fields (trigger words, negative prompt, node
    ranges, tag_sources, prompt_style) on versions that were recognized
    before sibling-inheritance shipped.  Idempotent — no writes when
    the config is already aligned with its sibling.
    """
    discovered = _discovered_dir()
    if not discovered.is_dir():
        return

    changed_any = False
    for path in discovered.glob("*.json"):
        cfg = _read_json(path)
        if not cfg:
            continue

        # Sibling lookup uses the full index so a curated system
        # preset for an older version counts as the canonical source
        # for a freshly-downloaded new version.
        sibling = None
        mid = cfg.get("civitai_model_id")
        if mid is not None:
            my_hash = None
            for f in cfg.get("files", []):
                qh = f.get("quick_hash")
                if qh:
                    my_hash = qh
                    break
            sibling = find_sibling_config(mid, exclude_quick_hash=my_hash)
        # No civitai sibling (or none at all): inherit from a hash-identical
        # curated preset instead, so 'family' lands on CivitAI dumps of models
        # that ship a curated config without a civitai_model_id (e.g. Z-Image).
        if not sibling or sibling is cfg:
            sibling = find_curated_hash_sibling(cfg)
        if not sibling or sibling is cfg:
            continue

        merged = inherit_from_sibling(cfg, sibling)
        if merged == cfg:
            continue

        print(f"[PromptChain] inheriting sibling config for civitai model {mid}: "
              f"{_ascii_safe(path.name)} "
              f"(name '{_ascii_safe(cfg.get('model_name','?'))}' -> "
              f"'{_ascii_safe(merged.get('model_name','?'))}')")
        atomic_write_json(path, merged)
        changed_any = True

    if changed_any:
        invalidate_config_index()


def find_config_by_hash(model_hash: str) -> Optional[dict]:
    """Look up a config by quick_hash, checking system + discovered configs."""
    return _get_config_index()["by_quick_hash"].get(model_hash)


def find_config_by_sha256(sha256: str) -> Optional[dict]:
    """Look up a config by full SHA256, checking system + discovered configs."""
    return _get_config_index()["by_sha256"].get(sha256)


def find_config_by_filename(filename: str) -> Optional[dict]:
    """Look up a config by model filename."""
    return _get_config_index()["by_filename"].get(filename.lower())


def _get_primary_hash(config: dict) -> Optional[str]:
    """Get the quick_hash of the primary file (first diffusion_models/unet/checkpoints entry)."""
    for entry in config.get("files", []):
        if entry.get("folder") not in ("diffusion_models", "unet", "checkpoints"):
            continue
        qh = entry.get("quick_hash")
        if qh:
            return qh
        for v in entry.get("variants", []):
            qh = v.get("quick_hash")
            if qh:
                return qh
    return None


def _file_installed(file_entry: dict, folder_type: str) -> bool:
    """Check if a file is installed — prefer hash match, fall back to filename+size.

    Size check guards against truncated downloads that landed at the final
    path without a .part suffix: without it, a partial file reads as
    installed and its catalog entry vanishes, making resume impossible.
    """
    qh = file_entry.get("quick_hash")
    if qh and fingerprint.find_by_hash(qh):
        return True
    fname = file_entry.get("filename")
    if fname:
        return _file_exists_in_folder(fname, folder_type, file_entry.get("size_bytes", 0))
    return False


def load(model_hash: str) -> Optional[dict]:
    """Load settings for a model hash. User overrides system."""
    user_config = _read_json(_user_dir() / f"{model_hash}.json")

    # Config index handles both hash-named and readable-named configs,
    # system and discovered, in one lookup.
    base_config = _find_base_config(model_hash)

    if not user_config and not base_config:
        return None

    if not base_config:
        return user_config

    if not user_config:
        return base_config

    # Merge: base (system+discovered), user overlay.
    # For 'nodes', merge per-node-type so base nodes the user
    # hasn't touched still appear.
    merged = {**base_config, **user_config}
    base_nodes = base_config.get("nodes", {})
    user_nodes = user_config.get("nodes", {})
    merged_nodes = {**base_nodes}
    for node_type, widgets in user_nodes.items():
        merged_nodes[node_type] = {**merged_nodes.get(node_type, {}), **widgets}
    merged["nodes"] = merged_nodes
    return merged


def _resolve_base_config(model_hash: str) -> Optional[dict]:
    """Resolve the curated/discovered base config for a hash (no install gate).

    A model file can match an auto-discovered config by hash (the CivitAI scan
    embeds the file's quick_hash) and a curated system preset by filename
    (HuggingFace presets carry no hash). When both match, the curated system
    preset wins — it holds the authoritative family, templates, and node
    ranges. No install gate here so save()/delta resolves the same base load()
    surfaces.
    """
    by_hash = find_config_by_hash(model_hash)
    by_name = None
    fp_info = fingerprint.find_by_hash(model_hash)
    if fp_info:
        by_name = find_config_by_filename(fp_info["filename"])
    for candidate in (by_hash, by_name):
        if candidate is not None and candidate.get("_source_tier") == "system":
            return candidate
    return by_hash or by_name


def _find_base_config(model_hash: str) -> Optional[dict]:
    """Find the base config for a model hash, gated on its files being present.

    For multi-file models, verifies all required files are installed before
    returning so a half-downloaded model doesn't surface a dead template.
    """
    config = _resolve_base_config(model_hash)
    if config:
        if "files" in config and not _all_files_installed(config["files"]):
            import logging
            logging.getLogger("promptchain.model_settings").info(
                "config %r found but files incomplete; hiding until install completes",
                config.get("display_name") or config.get("_hash", "?"),
            )
            return None
        return config
    return None


def load_bulk(hashes: list[str]) -> dict[str, dict]:
    """Load settings for multiple hashes. Returns {hash: config} (omits misses)."""
    result = {}
    for h in hashes:
        config = load(h)
        if config:
            result[h] = config
    return result


def save(model_hash: str, config: dict):
    """Save user settings — stores only the delta from system defaults."""
    config = {k: v for k, v in config.items() if not k.startswith("_")}

    user_dir = _user_dir()
    user_dir.mkdir(parents=True, exist_ok=True)

    system_config = _resolve_base_config(model_hash)
    delta = _compute_delta(config, system_config) if system_config else config

    if not delta and system_config:
        path = user_dir / f"{model_hash}.json"
        if path.exists():
            path.unlink()
        return

    path = user_dir / f"{model_hash}.json"
    atomic_write_json(path, delta)


def save_discovered(model_hash: str, config: dict,
                     sha256: Optional[str] = None):
    """Save auto-discovered settings (CivitAI recognition) to cache.

    Generates a readable filename from model metadata. Embeds quick_hash
    and sha256 into the files array so the config is self-identifying.
    """
    config = {k: v for k, v in config.items() if not k.startswith("_")}

    # Ensure files array with hashes exists
    if "files" not in config:
        fp_info = fingerprint.find_by_hash(model_hash)
        config["files"] = [{
            "label": "Checkpoint",
            "folder": "checkpoints",
            "filename": fp_info["filename"] if fp_info else None,
            "quick_hash": model_hash,
            "sha256": sha256,
        }]
    else:
        _backfill_hashes(config["files"], model_hash, sha256)

    slug = _make_config_slug(config, model_hash)

    discovered_dir = _discovered_dir()
    discovered_dir.mkdir(parents=True, exist_ok=True)
    path = discovered_dir / f"{slug}.json"
    atomic_write_json(path, config)
    invalidate_config_index()


def _make_config_slug(config: dict, fallback: str) -> str:
    """Generate a readable filename slug from model metadata."""
    name = config.get("model_name", "")
    version = config.get("version", "")
    if name:
        slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        if version:
            slug += "_" + re.sub(r"[^a-z0-9]+", "_", version.lower()).strip("_")
        return slug[:60]
    return fallback


def _backfill_hashes(files: list[dict], quick_hash: str,
                     sha256: Optional[str]):
    """Add quick_hash/sha256 to the first primary file entry that lacks them."""
    for entry in files:
        if entry.get("folder") not in ("diffusion_models", "unet", "checkpoints"):
            continue
        if entry.get("variants"):
            for v in entry["variants"]:
                if not v.get("quick_hash"):
                    v["quick_hash"] = quick_hash
                    if sha256:
                        v["sha256"] = sha256
                    return
        else:
            if not entry.get("quick_hash"):
                entry["quick_hash"] = quick_hash
                if sha256:
                    entry["sha256"] = sha256
            return


def delete(model_hash: str) -> bool:
    """Delete user settings for a model hash. Returns True if deleted."""
    path = _user_dir() / f"{model_hash}.json"
    if path.exists():
        path.unlink()
        return True
    return False


def has_user_config(model_hash: str) -> bool:
    return (_user_dir() / f"{model_hash}.json").exists()


def has_system_config(model_hash: str) -> bool:
    return find_config_by_hash(model_hash) is not None


def _all_config_dirs() -> tuple[Path, ...]:
    return (_system_dir(), _discovered_dir(), _user_dir())


def list_model_names() -> list[str]:
    """Return sorted unique model names across all model configs."""
    names = set()
    for directory in _all_config_dirs():
        if not directory.is_dir():
            continue
        for path in directory.glob("*.json"):
            if path.name.startswith("_"):
                continue
            data = _read_json(path)
            name = data.get("model_name") or data.get("display_name") if data else None
            if name:
                names.add(name)
    return sorted(names)


def list_versions(model_name: str) -> list[str]:
    """Return sorted unique version strings for a given model name."""
    versions = set()
    for directory in _all_config_dirs():
        if not directory.is_dir():
            continue
        for path in directory.glob("*.json"):
            if path.name.startswith("_"):
                continue
            data = _read_json(path)
            if not data:
                continue
            name = data.get("model_name") or data.get("display_name")
            if name == model_name and data.get("version"):
                versions.add(data["version"])
    return sorted(versions)


def list_version_details(model_name: str) -> list[dict]:
    """Version objects with hash, filename, and release_date for a model name.

    Sorted by release_date descending (empty dates last), then version descending.
    """
    seen_hashes: set[str] = set()
    versions: list[dict] = []

    # Scan config index (covers system + discovered with any naming scheme)
    for _qh, data in _get_config_index()["by_quick_hash"].items():
        name = data.get("model_name") or data.get("display_name")
        if name != model_name or not data.get("version"):
            continue
        primary_hash = _get_primary_hash(data) or _qh
        if primary_hash in seen_hashes:
            continue
        fp_info = fingerprint.find_by_hash(primary_hash)
        if not fp_info:
            continue
        seen_hashes.add(primary_hash)
        versions.append({
            "version": data["version"],
            "hash": primary_hash,
            "filename": fp_info["filename"],
            "release_date": data.get("release_date", ""),
        })

    # Also check user overrides (still hash-named)
    user_dir = _user_dir()
    if user_dir.is_dir():
        for path in user_dir.glob("*.json"):
            if path.name.startswith("_"):
                continue
            model_hash = path.stem
            if model_hash in seen_hashes:
                continue
            data = load(model_hash)
            if not data:
                continue
            name = data.get("model_name") or data.get("display_name")
            if name != model_name or not data.get("version"):
                continue
            fp_info = fingerprint.find_by_hash(model_hash)
            if not fp_info:
                continue
            seen_hashes.add(model_hash)
            versions.append({
                "version": data["version"],
                "hash": model_hash,
                "filename": fp_info["filename"],
                "release_date": data.get("release_date", ""),
            })

    def sort_key(v):
        return (1 if v["release_date"] else 0, v["release_date"], v["version"])

    versions.sort(key=sort_key, reverse=True)
    return versions


def _file_exists_in_folder(filename: str, folder_type: str, min_size: int = 0) -> bool:
    """True if filename exists in folder_type and isn't grossly undersized.

    Catches a truncated download left at its final path (no .part suffix) that
    would otherwise pass a mere-existence check and make its catalog entry
    disappear, blocking resume. But catalog config sizes are ROUNDED ESTIMATES,
    not exact byte counts (a Q8 GGUF listed as 16 GB is really ~15.4 GB), so the
    floor is half the estimate — enough to reject a real stub while accepting a
    complete file that's a few percent under the guess.
    """
    try:
        for folder in folder_paths.get_folder_paths(folder_type):
            path = os.path.join(folder, filename)
            if not os.path.isfile(path):
                continue
            if min_size and os.path.getsize(path) < min_size * 0.5:
                continue
            return True
    except Exception:
        pass
    return False


def _all_files_installed(files: list[dict]) -> bool:
    """True when every file entry has at least one present file on disk.

    Checks by hash first (via fingerprint registry), falls back to filename
    for files not in the fingerprint scan (text encoders, VAEs). Variant
    entries need at least one variant present.
    """
    for entry in files:
        # Optional files (e.g. a Fast-template LoRA) don't gate "installed":
        # a vanilla download without them must still surface the config.
        if entry.get("optional"):
            continue
        folder_type = entry.get("folder", "")
        if not folder_type:
            continue

        variants = entry.get("variants")
        if variants:
            if not any(_file_installed(v, folder_type) for v in variants):
                return False
        elif entry.get("filename") or entry.get("quick_hash"):
            if not _file_installed(entry, folder_type):
                return False
    return True


_PRIMARY_FOLDERS = ("diffusion_models", "unet", "checkpoints")


def _precision_tier(precision: str) -> str:
    """High-precision primaries pull the high-precision companion; everything
    else (fp8*, fp4, GGUF quants) pulls the lighter one. Mirrors the client's
    precisionTier so companion files pair to the chosen primary consistently."""
    return "high" if re.search(r"fp16|bf16|fp32", precision or "", re.I) else "low"


def _resolve_files_for_precision(files: list[dict], precision: str) -> list[dict]:
    """The concrete files a precision needs — primary variant + companions paired
    by tier. Mirror of the client resolveFilesForPrecision so install state is
    computed against the exact same file set the download modal would fetch."""
    tier = _precision_tier(precision)
    resolved = []
    for f in files:
        variants = f.get("variants")
        if not variants:
            resolved.append(f)
            continue
        match = next((v for v in variants if v.get("precision") == precision), None) \
            or next((v for v in variants if _precision_tier(v.get("precision")) == tier), None) \
            or variants[0]
        if not match:
            continue
        resolved.append({
            "label": f.get("label"),
            "folder": f.get("folder"),
            "filename": match.get("filename"),
            "size_bytes": match.get("size_bytes", 0),
            "quick_hash": match.get("quick_hash"),
            "optional": f.get("optional", False),
            "source": match.get("source"),
        })
    return resolved


def _precision_install_status(files: list[dict]) -> dict:
    """Per declared primary precision → 'installed' | 'partial' | 'missing'.

    Status is keyed on the precision's OWN model weight (the primary variant —
    the quant / diffusion file). Shared companions (text encoder, VAE) are
    reused across every precision, so a precision whose weight isn't downloaded
    is 'missing' even when those companions happen to be on disk from another
    model. Only when the weight IS present do we split installed (all companions
    too) from 'partial' (a resumable download missing a companion).
    """
    # Only a variant-bearing MODEL file (diffusion/unet/checkpoint) defines
    # selectable precisions. A single-weight model whose only variants live on a
    # companion — e.g. the 5B, whose lone variant file is the shared umt5 text
    # encoder — has no model precisions; surfacing the encoder's fp8/fp16 as if
    # they were model choices is meaningless (and falsely "partial" when the
    # shared encoder happens to be on disk from another model).
    primary = next((f for f in files if f.get("variants") and f.get("folder") in _PRIMARY_FOLDERS), None)
    if not primary:
        return {}
    primary_folder = primary.get("folder", "")
    precisions: list[str] = []
    for v in primary.get("variants", []):
        p = v.get("precision")
        if p and p not in precisions:
            precisions.append(p)

    status = {}
    for p in precisions:
        variant = next((v for v in primary.get("variants", []) if v.get("precision") == p), None)
        if not (variant and _file_installed(variant, primary_folder)):
            status[p] = "missing"
            continue
        required = [
            f for f in _resolve_files_for_precision(files, p)
            if not f.get("optional") and f.get("folder") and (f.get("filename") or f.get("quick_hash"))
        ]
        present = sum(1 for f in required if _file_installed(f, f["folder"]))
        status[p] = "installed" if present == len(required) else "partial"
    return status


def _primary_file_present(files: list[dict]) -> bool:
    """True if any primary model weight (diffusion/unet/checkpoint) is on disk.

    Drives the 'resume' hint for entries without precision variants: a shared
    encoder/VAE being present is NOT a started download — only the model's own
    weight is, so we never glow an un-downloaded model amber."""
    for f in files:
        if f.get("folder") not in _PRIMARY_FOLDERS:
            continue
        variants = f.get("variants")
        if variants:
            if any(_file_installed(v, f["folder"]) for v in variants):
                return True
        elif (f.get("filename") or f.get("quick_hash")) and _file_installed(f, f["folder"]):
            return True
    return False


def _base_version_key(version: str) -> tuple:
    """Parse version string into a comparable tuple, ignoring precision suffixes.

    '16.0 fp16' → (16, 0), '14.1' → (14, 1), 'v2' → (2,)
    """
    base = re.split(r"\s+", version)[0]
    parts = re.findall(r"\d+", base)
    return tuple(int(p) for p in parts) if parts else (0,)


def _collect_uninstalled_presets() -> list[dict]:
    """Collect system presets whose required files aren't all on disk.

    Mirrors load()'s completeness check so partially-installed configs
    (primary present, supplemental files missing) surface as downloadable
    rather than disappearing between load() hiding them and the catalog
    treating them as installed.
    """
    entries = []
    seen = set()

    system_dir = _system_dir()
    if not system_dir.is_dir():
        return entries

    for path in system_dir.glob("*.json"):
        if path.name.startswith("_"):
            continue
        data = _read_json(path)
        if not data or "files" not in data:
            continue

        if _all_files_installed(data["files"]):
            continue

        primary_hash = _get_primary_hash(data)

        dedup_key = (data.get("display_name", ""), data.get("version", ""))
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        entry = {
            "hash": primary_hash or path.stem,
            "display_name": data.get("display_name", ""),
            "model_name": data.get("model_name", ""),
            "version": data.get("version", ""),
            "architecture": data.get("architecture", ""),
            "family": data.get("family", ""),
            "description": data.get("description", ""),
            "files": data["files"],
        }
        if data.get("civitai_model_id"):
            entry["civitai_model_id"] = data["civitai_model_id"]
        if data.get("thumbnail"):
            entry["thumbnail"] = data["thumbnail"]
        entry["precision_status"] = _precision_install_status(entry["files"])
        entry["partial"] = _primary_file_present(entry["files"])
        entries.append(entry)

    return entries


def list_catalog() -> list[dict]:
    """Return system presets whose required files aren't all on disk yet.

    Every uninstalled version newer than the user's newest installed one is
    returned (flat, one entry per version/precision) so the picker can group
    them under a single model_name with a version submenu. Versions at or
    below what's installed are dropped.
    """
    entries = _collect_uninstalled_presets()

    # Build installed version map: model_name → highest base version.
    # A truncated file landing at its final path gets fingerprinted and
    # would otherwise resolve to its config via filename, bumping
    # installed_max and hiding the model's own catalog entry behind the
    # "already have this version" dedup. Only count configs whose
    # required files are all present at full size.
    installed_max: dict[str, tuple] = {}
    config_idx = _get_config_index()
    for m in fingerprint.list_models():
        cfg = config_idx["by_quick_hash"].get(m["hash"])
        if not cfg:
            cfg = config_idx["by_filename"].get(m.get("filename", "").lower())
        if not cfg:
            continue
        if cfg.get("files") and not _all_files_installed(cfg["files"]):
            continue
        name = cfg.get("model_name") or cfg.get("display_name") or ""
        ver = _base_version_key(cfg.get("version", ""))
        if name and ver > installed_max.get(name, ()):
            installed_max[name] = ver

    # Group by model_name, keep only the latest version per model
    by_model: dict[str, list[dict]] = {}
    for entry in entries:
        name = entry.get("model_name") or entry.get("display_name") or ""
        by_model.setdefault(name, []).append(entry)

    catalog = []
    for name, group in by_model.items():
        imax = installed_max.get(name, ())
        # Keep every uninstalled version newer than the user's newest install;
        # the picker groups these by model_name into a version submenu. Drop
        # versions at or below what's already installed.
        for entry in group:
            if _base_version_key(entry.get("version", "")) > imax:
                catalog.append(entry)

    catalog.sort(key=lambda c: c.get("display_name", ""))
    return catalog


def list_older_versions(model_name: str) -> list[dict]:
    """Return all uninstalled versions of a model.

    Used by the model panel's "Older Versions" dropdown. The main catalog
    only shows the latest version; this provides access to older ones.
    """
    entries = _collect_uninstalled_presets()
    matching = [e for e in entries if (e.get("model_name") or e.get("display_name")) == model_name]
    matching.sort(key=lambda e: _base_version_key(e.get("version", "")), reverse=True)
    return matching


def is_catalog_filename(filename: str) -> bool:
    """Check if a filename appears in any system/discovered config's files array."""
    return filename.lower() in _get_config_index()["by_filename"]


def _entry_matches_filename(entry: dict, filename_lower: str) -> bool:
    """True if a file entry owns this filename — as its flat filename or any
    of its precision variants."""
    flat = entry.get("filename")
    if flat:
        return flat.lower() == filename_lower
    return any(v.get("filename", "").lower() == filename_lower
               for v in entry.get("variants", []))


def is_primary_model_file(filename: str) -> bool:
    """True if this filename is the model's primary (picker-facing) file.

    A multi-file config lists several components (dual MoE experts, text
    encoder, VAE, LoRAs). Only the primary surfaces in the picker; its
    precision variants become the selectable versions and every other
    component is hidden so one model reads as one selection.

    The primary is declared with "primary": true on a file entry — needed
    when a config has more than one diffusion_models/unet entry (e.g. a MoE
    high+low pair). Configs with a single, unambiguous diffusion entry omit
    the flag and fall back to "first diffusion_models/unet entry wins". Files
    in no config (standalone models) are always primary.
    """
    config = find_config_by_filename(filename)
    if not config or "files" not in config:
        return True

    lower = filename.lower()
    files = config["files"]

    flagged = [e for e in files if e.get("primary")]
    if flagged:
        return any(_entry_matches_filename(e, lower) for e in flagged)

    for entry in files:
        if entry.get("folder") in ("diffusion_models", "unet"):
            return _entry_matches_filename(entry, lower)
    return True


def _compute_delta(config: dict, system: dict) -> dict:
    """Return only the keys/values in config that differ from system.

    For the 'nodes' key, diffs per-node-type, then per-widget within each.
    """
    delta = {}

    for key, value in config.items():
        if key == "nodes":
            continue
        if key not in system or system[key] != value:
            delta[key] = value

    # Deep diff for nodes — only store changed widgets per node type
    config_nodes = config.get("nodes", {})
    system_nodes = system.get("nodes", {})

    if config_nodes:
        delta_nodes = {}
        for node_type, widgets in config_nodes.items():
            if node_type not in system_nodes:
                # Entirely new node type — keep all
                delta_nodes[node_type] = widgets
                continue
            sys_widgets = system_nodes[node_type]
            changed = {}
            for wk, wv in widgets.items():
                if wk not in sys_widgets or sys_widgets[wk] != wv:
                    changed[wk] = wv
            if changed:
                delta_nodes[node_type] = changed
        if delta_nodes:
            delta["nodes"] = delta_nodes

    return delta


def _read_json(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        logger.warning("failed to read config %s", path, exc_info=True)
        return None
