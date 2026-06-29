"""
Bi-encoder semantic search over Danbooru tag wiki bodies.

Used by `_patch_user_message` to surface "Relevant Danbooru tags"
inline with the user-message prompt, replacing the substring n-gram
canonical scan that couldn't disambiguate polysemy
(`pointing` vs `presenting_foot`).

Index shape: each row of `danbooru_tag_wikis` (typically ~14k general
tags ranked >= 200) is embedded with bge-small-en-v1.5, CLS-pooled,
L2-normalized. Cosine == dot product on the index tensor.

Diverges from `bucket_search.py` and `modifier_search.py` by persisting
the index to disk: 14k rows × 384 floats = ~21 MB tensor; cold rebuild
on CPU ~5–10 min. Every-restart rebuild was a development tax. Manifest
fingerprint forces rebuild when the underlying table changes.

Cache layout (under `<repo>/cache/tag_search/`):
    manifest.json   {model_id, embed_dim, schema_version, fingerprint}
    rows.jsonl      one tag row per line
    index.npy       numpy float32 array [N, 384]

Threshold/top_k calibration (Phase 0 probe + disambiguation test):
- 0.55 threshold catches genuine semantic matches without surfacing
  noise — "girl walking through forest" tops out at ~0.50 against
  foot/gesture tags so they don't appear.
- top_k=12 gives Qwen enough candidates to disambiguate without
  overflowing the prompt budget.
"""
from __future__ import annotations

import json
import logging
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any, Callable

from . import _embed_model

logger = logging.getLogger("promptchain.tag_search")
_dbg = logging.getLogger("promptchain.ai.debug")

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = REPO_ROOT / "data" / "tag-builder" / "tag-builder.db"
ALIASES_SEED_PATH = REPO_ROOT / "data" / "tag-builder" / "tag-aliases-seed.json"
CACHE_DIR = REPO_ROOT / "cache" / "tag_search"
INDEX_PATH = CACHE_DIR / "index.npy"
ROWS_PATH = CACHE_DIR / "rows.jsonl"
MANIFEST_PATH = CACHE_DIR / "manifest.json"

# Bump this when the on-disk format changes (e.g. add fields to row
# dicts, change pooling strategy). Mismatch → rebuild + rewrite cache.
# v2: include wiki_status='synthesized' rows (was filtered out as
# body_full = '' previously; migration synthesized fallback bodies).
# v3: alias-augmented body_full at index time so curator-authored
# user-phrasings embed alongside the Danbooru wiki definition.
# Solves bge-small's bag-of-words limit on definitional paraphrase
# (e.g. "close up on feet" -> foot_focus rank 43 -> rank ~3 with the
# phrase explicitly aliased).
SCHEMA_VERSION = 3

_lock = threading.RLock()
_state: dict[str, Any] = {
    "embeddings": None,        # torch.Tensor [N, 384]
    "rows": [],                # list[dict] aligned with embeddings
    "fingerprint": None,
}

# A transient DB lock made _fingerprint() return zeros, which read as
# "table changed" and kicked off a 5–10 min CPU re-embed. Cache the last
# good fingerprint + the DB mtime it was read at: return the cached value
# on error (never treat a read failure as a change), and skip the recompute
# entirely while the file is unchanged.
_last_successful_fingerprint: tuple | None = None
_last_db_mtime: float | None = None


def _open_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.text_factory = lambda b: b.decode("utf-8", "replace")
    return conn


def _ensure_aliases_schema(conn: sqlite3.Connection) -> None:
    """Create the tag_aliases table if missing and sync seed entries
    from JSON every boot. INSERT OR IGNORE keeps curator-authored
    additions in the DB intact — only adds new seed entries since
    last sync. Removals from the JSON do NOT auto-delete from the DB
    (avoids clobbering curator additions); use SQL to clean up if
    needed: DELETE FROM tag_aliases WHERE source='seed' AND alias='...'"""
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS tag_aliases (
        tag    TEXT NOT NULL,
        alias  TEXT NOT NULL,
        source TEXT DEFAULT 'curator',
        PRIMARY KEY (tag, alias)
    );
    CREATE INDEX IF NOT EXISTS idx_tag_aliases_tag ON tag_aliases(tag);
    """)
    conn.commit()
    if not ALIASES_SEED_PATH.exists():
        return
    try:
        seed = json.loads(ALIASES_SEED_PATH.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("tag_aliases: seed read failed", exc_info=True)
        return
    inserted = 0
    for tag, aliases in seed.items():
        if tag.startswith("_") or not isinstance(aliases, list):
            continue
        for alias in aliases:
            alias_norm = (alias or "").strip().lower()
            if not alias_norm:
                continue
            try:
                cur = conn.execute(
                    "INSERT OR IGNORE INTO tag_aliases (tag, alias, source) "
                    "VALUES (?, ?, 'seed')",
                    (tag.strip(), alias_norm),
                )
                if cur.rowcount > 0:
                    inserted += 1
            except Exception:
                pass
    conn.commit()
    if inserted:
        logger.info("tag_aliases: synced %d new entries from %s",
                    inserted, ALIASES_SEED_PATH.name)


def _load_aliases_by_tag() -> dict[str, list[str]]:
    """Pull every alias keyed by its canonical tag. Used to:
      - augment body_full at embed-rebuild time
      - back the literal alias_scan at retrieval time
    Returns {} on any DB failure — system stays functional, just without
    alias-augmentation (degrades to raw wiki retrieval)."""
    out: dict[str, list[str]] = {}
    try:
        conn = _open_db()
        _ensure_aliases_schema(conn)
        for r in conn.execute("SELECT tag, alias FROM tag_aliases").fetchall():
            tag = (r["tag"] or "").strip()
            alias = (r["alias"] or "").strip().lower()
            if tag and alias:
                out.setdefault(tag, []).append(alias)
        conn.close()
    except Exception:
        logger.warning("tag_aliases: load failed", exc_info=True)
        return {}
    return out


def _fingerprint() -> tuple:
    """Cheap signature of the tag-wikis table state PLUS the alias
    table state. Changes when wiki rows are added/removed/refreshed
    (body_hash sum) OR when aliases are added/removed/edited. Either
    forces a rebuild — alias changes shift the embedded body_full
    text so cached embeddings need to be regenerated.

    On a transient DB lock / read error, returns the last successful
    fingerprint instead of zeros, so a momentary lock can't masquerade
    as a table change and trigger a spurious rebuild."""
    global _last_successful_fingerprint
    try:
        conn = _open_db()
        _ensure_aliases_schema(conn)
        wiki_row = conn.execute(
            "SELECT COALESCE(MAX(rowid), 0) AS m, "
            "       COUNT(*) AS c, "
            "       COALESCE(SUM(LENGTH(body_hash)), 0) AS h "
            "FROM danbooru_tag_wikis"
        ).fetchone()
        alias_row = conn.execute(
            "SELECT COUNT(*) AS c, "
            "       COALESCE(SUM(LENGTH(alias)), 0) AS h "
            "FROM tag_aliases"
        ).fetchone()
        conn.close()
        result = (
            wiki_row["m"], wiki_row["c"], wiki_row["h"],
            alias_row["c"], alias_row["h"],
        )
        _last_successful_fingerprint = result
        return result
    except Exception:
        if _last_successful_fingerprint is not None:
            return _last_successful_fingerprint
        return (0, 0, 0, 0, 0)


def _read_rows() -> list[dict]:
    """Load all rows with non-empty body_full from danbooru_tag_wikis.
    Empty bodies (sentinel for "tag exists but has no wiki") are
    excluded — there's nothing meaningful to embed for them.

    body_full is augmented with curator-authored aliases (joined via
    tag_aliases) so the bi-encoder embeds both the canonical Danbooru
    definition AND user-typed phrasings that mean the same concept.
    body_summary stays pristine — it's what the AI prompt block
    surfaces to the model, and we want that to remain the source-of-
    truth Danbooru text without alias clutter."""
    try:
        conn = _open_db()
        _ensure_aliases_schema(conn)
        rows = conn.execute(
            "SELECT t.tag, t.body_full, t.body_summary, "
            "       d.ranking "
            "FROM danbooru_tag_wikis t "
            "LEFT JOIN danbooru_tags d ON d.tag = t.tag "
            "WHERE t.body_full <> '' "
            "ORDER BY d.ranking DESC"
        ).fetchall()
        conn.close()
    except Exception:
        logger.exception("tag_search: failed to read tag wikis")
        return []
    aliases_by_tag = _load_aliases_by_tag()
    out: list[dict] = []
    augmented = 0
    for r in rows:
        tag = r["tag"]
        body_full = r["body_full"]
        aliases = aliases_by_tag.get(tag) or []
        if aliases:
            # Append aliases as a sentence at the end. Plain text — the
            # encoder ignores punctuation but the bag-of-words it uses
            # to score cosine now sees these tokens and lifts cosine for
            # queries that use them.
            body_full = f"{body_full} Common phrasings: {', '.join(aliases)}."
            augmented += 1
        out.append({
            "tag": tag,
            "body_full": body_full,
            "body_summary": r["body_summary"],
            "ranking": int(r["ranking"] or 0),
        })
    if augmented:
        logger.info("tag_search: augmented %d rows with alias text", augmented)
    return out


def _persist_index_to_disk() -> None:
    """Atomic write — index.tmp + rename — so a crashed write doesn't
    leave a half-written cache. Manifest goes last so its presence
    signifies the other files are intact."""
    if _state["embeddings"] is None or not _state["rows"]:
        return
    import numpy as np

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    arr = _state["embeddings"].cpu().numpy().astype("float32")
    # numpy.save auto-appends .npy when the path doesn't already end in
    # .npy. Put .tmp BEFORE the suffix so the path stays *.npy and
    # numpy writes where we expect.
    tmp_index = INDEX_PATH.with_name(INDEX_PATH.stem + ".tmp.npy")
    np.save(tmp_index, arr, allow_pickle=False)
    tmp_index.replace(INDEX_PATH)

    tmp_rows = ROWS_PATH.with_name(ROWS_PATH.name + ".tmp")
    with open(tmp_rows, "w", encoding="utf-8") as f:
        for r in _state["rows"]:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    tmp_rows.replace(ROWS_PATH)

    manifest = {
        "model_id": _embed_model.MODEL_ID,
        "embed_dim": _embed_model.EMBED_DIM,
        "schema_version": SCHEMA_VERSION,
        "fingerprint": list(_state["fingerprint"]),
        "rowcount": len(_state["rows"]),
    }
    tmp_manifest = MANIFEST_PATH.with_name(MANIFEST_PATH.name + ".tmp")
    tmp_manifest.write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    tmp_manifest.replace(MANIFEST_PATH)
    logger.info(
        "tag_search: persisted %d rows to %s",
        len(_state["rows"]), CACHE_DIR,
    )


def _load_index_from_disk() -> bool:
    """Try to load the index from disk. Returns True on success and
    state is populated. False on any mismatch (caller falls back to
    rebuild). Mismatch reasons:
      - any file missing
      - manifest version != current SCHEMA_VERSION
      - manifest model_id != current model
      - manifest fingerprint != live DB fingerprint
    """
    if not (INDEX_PATH.exists() and ROWS_PATH.exists() and MANIFEST_PATH.exists()):
        return False
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        return False

    if manifest.get("schema_version") != SCHEMA_VERSION:
        logger.info("tag_search: cache schema mismatch — rebuilding")
        return False
    if manifest.get("model_id") != _embed_model.MODEL_ID:
        logger.info("tag_search: cache model mismatch — rebuilding")
        return False

    live_fp = _get_fingerprint_cached()
    cached_fp = tuple(manifest.get("fingerprint") or ())
    if cached_fp != live_fp:
        logger.info(
            "tag_search: cache fingerprint mismatch (cached=%s live=%s) — rebuilding",
            cached_fp, live_fp,
        )
        return False

    try:
        import numpy as np
        import torch
        arr = np.load(INDEX_PATH, allow_pickle=False)
        # On-disk arrays are CPU float32; pin to whatever device the
        # embed model lives on so query@index matmul doesn't hit a
        # device-mismatch RuntimeError when the model is on CUDA.
        loaded = _embed_model.get()
        target_device = loaded[2] if loaded else "cpu"
        embeddings = torch.from_numpy(arr).float().to(target_device)
        rows: list[dict] = []
        with open(ROWS_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    except Exception:
        logger.warning("tag_search: cache load failed — rebuilding", exc_info=True)
        return False

    if embeddings.shape[0] != len(rows):
        logger.warning("tag_search: cache row/embedding count mismatch — rebuilding")
        return False

    _state["embeddings"] = embeddings
    _state["rows"] = rows
    _state["fingerprint"] = live_fp
    logger.info(
        "tag_search: loaded %d rows from disk cache", len(rows),
    )
    return True


def _rebuild_index(on_status: Callable[[str], None] | None = None) -> None:
    if _embed_model.get() is None:
        return
    rows = _read_rows()
    if not rows:
        _state["embeddings"] = None
        _state["rows"] = []
        _state["fingerprint"] = _fingerprint()
        return
    # Embed body_full — gives bge-small enough surface area to
    # disambiguate. body_summary is what we surface to Qwen, but the
    # full body is the better embedding source.
    texts = [r["body_full"] for r in rows]
    device = _embed_model.get()[2] if _embed_model.get() else "cpu"
    eta = "~30s on GPU" if device == "cuda" else "~5-10 min on CPU"
    logger.info("tag_search: embedding %d tag wikis on %s (%s)", len(rows), device, eta)
    if on_status:
        on_status(f"Rebuilding tag index ({len(rows):,} rows, {eta}, one-time)")
    # Larger batches on GPU — bge-small is small, throughput-bound.
    batch = 256 if device == "cuda" else 64
    embeddings = _embed_model.embed(texts, batch_size=batch)
    if embeddings is None:
        logger.warning("tag_search: embed() returned None — model not loaded")
        return
    _state["embeddings"] = embeddings
    _state["rows"] = rows
    _state["fingerprint"] = _fingerprint()
    logger.info("tag_search: indexed %d tag wikis", len(rows))
    _persist_index_to_disk()


def _get_fingerprint_cached() -> tuple:
    """Gate the expensive _fingerprint() (DDL + alias seed-sync + two
    aggregate scans) on the DB file mtime. The fingerprint only changes
    when the file changes, so while mtime is steady — the common case for
    a search — return the cached value and skip the query entirely."""
    global _last_db_mtime
    try:
        current_mtime = DB_PATH.stat().st_mtime
    except Exception:
        return _fingerprint()
    if _last_db_mtime == current_mtime and _last_successful_fingerprint is not None:
        return _last_successful_fingerprint
    _last_db_mtime = current_mtime
    return _fingerprint()


def _ensure_index_fresh(on_status: Callable[[str], None] | None = None) -> None:
    """Try disk first, then rebuild. Disk load is fast; rebuild is the
    minutes-long path."""
    if _state["embeddings"] is not None and _state["fingerprint"] == _get_fingerprint_cached():
        return
    if _load_index_from_disk():
        return
    _rebuild_index(on_status=on_status)


def search(user_text: str, top_k: int = 12,
           threshold: float = 0.55,
           on_status: Callable[[str], None] | None = None) -> list[dict]:
    """Return tags whose wiki body cosine-matches user_text above
    threshold, sorted by score desc, capped at top_k.

    Each entry: {tag, ranking, score, body_summary, body_full}.
    Empty list when the model failed to load — caller degrades to
    alias scan + bio context only.
    """
    user_text = (user_text or "").strip()
    if not user_text:
        return []
    with _lock:
        if _embed_model.get() is None:
            return []
        _ensure_index_fresh(on_status=on_status)
        if _state["embeddings"] is None or not _state["rows"]:
            return []
        qv = _embed_model.embed([user_text])
        if qv is None:
            return []
        scores = (_state["embeddings"] @ qv.T).squeeze(-1).tolist()
        paired = list(zip(_state["rows"], scores))
        paired.sort(key=lambda x: -x[1])
        out: list[dict] = []
        for row, score in paired[:top_k]:
            if score < threshold:
                break
            entry = dict(row)
            entry["score"] = float(score)
            out.append(entry)
        return out


_ALIAS_LOOKUP_CACHE: list[tuple[str, str]] | None = None


def _alias_lookup_list() -> list[tuple[str, str]]:
    """Flatten the per-tag alias map into a single list of (alias, tag)
    sorted by alias length descending. Sorted-by-length matters: when
    "close-up of feet" and "close up" are both aliases, the longer one
    must match first or the shorter one wins by accident. Cached at
    module level — invalidate by setting `_ALIAS_LOOKUP_CACHE = None`."""
    global _ALIAS_LOOKUP_CACHE
    if _ALIAS_LOOKUP_CACHE is not None:
        return _ALIAS_LOOKUP_CACHE
    pairs: list[tuple[str, str]] = []
    for tag, aliases in _load_aliases_by_tag().items():
        for alias in aliases:
            pairs.append((alias, tag))
    pairs.sort(key=lambda p: -len(p[0]))
    _ALIAS_LOOKUP_CACHE = pairs
    return pairs


def alias_scan(user_text: str) -> list[dict]:
    """Curator-authored deterministic literal scan. For each (alias, tag)
    pair, check if alias appears as a whitespace-bounded substring in
    user_text (case-insensitive). Returns at most one hit per tag, in
    the order longest-alias-first so specific phrases beat generic ones.

    Each hit: {tag, ranking, score, body_summary, body_full, matched_alias}.
    score is a sentinel high value so alias hits always beat semantic
    hits in the candidate menu — the curator already decided this
    phrasing means this tag, no need to second-guess via cosine.
    Empty list when no aliases configured or no match."""
    text = (user_text or "").lower()
    if not text:
        return []
    pairs = _alias_lookup_list()
    if not pairs:
        return []
    seen: set[str] = set()
    out: list[dict] = []
    for alias, tag in pairs:
        if tag in seen:
            continue
        # Whitespace/punctuation boundary on both sides. Avoids matching
        # 'close up' inside 'enclosed up there'. Allow alias to contain
        # spaces, hyphens, etc. — re.escape keeps it literal.
        pat = re.compile(r"(?<![A-Za-z0-9_])" + re.escape(alias) + r"(?![A-Za-z0-9_])")
        if pat.search(text):
            row = _row_for_tag(tag)
            entry = {
                "tag": tag,
                "ranking": (row or {}).get("ranking", 0),
                "score": 1.0,
                "body_summary": (row or {}).get("body_summary", ""),
                "body_full": (row or {}).get("body_full", ""),
                "matched_alias": alias,
            }
            out.append(entry)
            seen.add(tag)
    return out


def _row_for_tag(tag: str) -> dict | None:
    """Lookup helper for alias_scan — pulls wiki row directly from DB
    rather than scanning the in-memory index, so this works even when
    the embed model is unavailable and the index isn't loaded."""
    try:
        conn = _open_db()
        r = conn.execute(
            "SELECT t.tag, t.body_full, t.body_summary, d.ranking "
            "FROM danbooru_tag_wikis t "
            "LEFT JOIN danbooru_tags d ON d.tag = t.tag "
            "WHERE t.tag = ?",
            (tag,),
        ).fetchone()
        conn.close()
        if not r:
            return None
        return {
            "tag": r["tag"],
            "body_full": r["body_full"] or "",
            "body_summary": r["body_summary"] or "",
            "ranking": int(r["ranking"] or 0),
        }
    except Exception:
        return None


def warmup() -> None:
    """Best-effort eager load on server boot. Disk-cache hit is < 1s;
    cold rebuild is ~5–10 min on CPU and is the only thing that takes
    real time here.

    Seeds the alias lookup cache up front so the literal alias_scan path
    doesn't hit the DB on every search, and warms the fingerprint cache so
    early searches can't trip a spurious rebuild on a transient lock."""
    import time
    try:
        with _lock:
            _alias_lookup_list()
    except Exception:
        logger.warning("tag_search: alias cache seed failed", exc_info=True)
    for attempt in range(3):
        with _lock:
            if _embed_model.get() is not None:
                _ensure_index_fresh()
                return
            if _embed_model.get_load_error():
                return
        time.sleep(2.0 * (attempt + 1))
