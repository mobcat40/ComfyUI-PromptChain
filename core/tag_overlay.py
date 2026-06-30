# User-editable tag-builder library — update-safe delta overlay.
#
# The tag-builder DB (data/tag-builder/tag-builder.db) is git-tracked and the
# sole entry in the auto-updater's DISCARD_PATHS, so update_boot.py runs
# `git checkout -- DB` on every apply — any edit written into that DB is wiped
# on the next restart. So user CRUD is stored OUT of the node tree as sparse
# per-table JSON deltas under ComfyUI/user/PromptChain/tag-builder/, exactly
# where models/templates/prompts/poses already keep their user data (an
# ff-only merge cannot touch untracked files outside the repo). The base DB
# stays a pure read-only upstream reference; nothing user-authored is written
# into it.
#
# A generic `apply_overlay(table, base_rows)` merges base + delta at read time;
# the same engine drives every editable table from one registry line. Reads are
# fresh per request (the deltas are tiny) — mirroring model_settings.load(),
# which avoids the dir-mtime cache whose own comment warns it misses in-place
# edits. The overlay is only ever written by our own routes in this process, so
# correctness needs no cross-process watch.

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

from aiohttp import web
import server

import folder_paths

from .api_utils import atomic_write_json, parse_json, error_response, ok_response

logger = logging.getLogger("promptchain")
routes = server.PromptServer.instance.routes

SCHEMA_VERSION = 1

# Composite PKs join with the ASCII Unit Separator — it cannot occur in any
# danbooru tag/source_phrase (':' and weight syntax `(tag:1.1)` can, so they
# are unsafe as separators).
_PK_SEP = "\x1f"


# ── editable-entity registry ─────────────────────────────────────────
# One line per table makes it editable. `pk` lists the primary-key columns;
# `required` are non-empty-on-add columns; `group_ref` (groups_table,
# item_col, group_pk) soft-validates the section link so an add can't land in
# a non-existent group. AI-infra tables (danbooru_tags/_wikis, series_lookup,
# tag_aliases) are intentionally ABSENT — they must never be user-editable.
# All eight browse buckets share the uniform chip schema (item_tag PK,
# item_group, display_name, base_tags, base_natlang, sort_order,
# natlang_status) — verified column-identical — so one shape registers them
# all. MUST mirror BUCKETS in core/tag_builder.py.
_EDITABLE_BUCKETS = ["cast", "appearance", "clothing", "pose",
                     "scene", "expression", "action", "nsfw_action"]
ENTITY_REGISTRY: dict[str, dict] = {
    f"{b}_items": {
        "pk": ["item_tag"],
        "required": ["item_tag", "item_group"],
        "numeric": ["sort_order"],
        "sort_col": "sort_order",  # re-sort the merged read by this column
        "group_ref": (f"{b}_groups", "item_group", "group_name"),
    }
    for b in _EDITABLE_BUCKETS
}

# Characters are a different shape (PK `tag`, no item_group). Plain-field
# editing only for now — editing the appearance chips (which recomputes the
# derived base_tags) is deferred, as are character adds/deletes (those need
# the paginated list + counts + identity-index merged, beyond plain edits).
ENTITY_REGISTRY["characters"] = {
    "pk": ["tag"],
    "required": ["tag"],
}


def is_editable(table: str) -> bool:
    return table in ENTITY_REGISTRY


def _assert_editable(table: str) -> dict:
    spec = ENTITY_REGISTRY.get(table)
    if spec is None:
        raise ValueError(f"table not user-editable: {table!r}")
    return spec


# ── overlay file storage ─────────────────────────────────────────────

def _overlay_root() -> Path:
    # Env override exists for headless tests; production path mirrors the four
    # shipped user-delta precedents and lives outside the node git tree.
    override = os.environ.get("PROMPTCHAIN_TAG_OVERLAY_DIR")
    root = Path(override) if override else Path(folder_paths.get_user_directory()) / "PromptChain" / "tag-builder"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _overlay_path(table: str) -> Path:
    return _overlay_root() / f"{table}.json"


def _empty_doc(table: str) -> dict:
    return {"schema_version": SCHEMA_VERSION, "table": table,
            "pk": ENTITY_REGISTRY[table]["pk"], "adds": {}, "edits": {}, "deletes": []}


def _load(table: str) -> dict:
    """Read the delta fresh. A corrupt file is quarantined to .bak and the read
    degrades to an empty overlay rather than 500ing — base rows still serve."""
    import json
    path = _overlay_path(table)
    if not path.is_file():
        return _empty_doc(table)
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
    except Exception:
        try:
            os.replace(path, path.with_suffix(path.suffix + ".bak"))
            logger.warning("[tag_overlay] quarantined unreadable %s to .bak", path.name)
        except OSError:
            pass
        return _empty_doc(table)
    doc.setdefault("adds", {})
    doc.setdefault("edits", {})
    doc.setdefault("deletes", [])
    doc["table"] = table
    doc["pk"] = ENTITY_REGISTRY[table]["pk"]
    return doc


def _save(table: str, doc: dict) -> None:
    """Persist atomically. An empty overlay (no adds/edits/deletes) unlinks the
    file — restore-to-default for a whole table is the free inverse."""
    path = _overlay_path(table)
    if not doc.get("adds") and not doc.get("edits") and not doc.get("deletes"):
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        return
    doc["schema_version"] = SCHEMA_VERSION
    doc["table"] = table
    doc["pk"] = ENTITY_REGISTRY[table]["pk"]
    atomic_write_json(path, doc)


_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(table: str) -> threading.Lock:
    with _locks_guard:
        lock = _locks.get(table)
        if lock is None:
            lock = _locks[table] = threading.Lock()
        return lock


# ── pk helpers ───────────────────────────────────────────────────────

def _pk_key(row: dict, pk_cols: list[str]) -> str:
    return _PK_SEP.join(str(row.get(c, "")) for c in pk_cols)


def _strip_meta(row: dict) -> dict:
    # Drop transient annotation keys the read path adds (and any other
    # underscore-prefixed key) so they never get persisted as real columns.
    return {k: v for k, v in row.items() if not k.startswith("_")}


def _coerce_types(spec: dict, data: dict) -> None:
    """Cast registry-declared numeric columns in place at the write boundary so
    a stray string can't poison the read-path sort. Empty/invalid -> None (the
    sort treats None as the trailing sentinel)."""
    for col in spec.get("numeric", ()):
        if col not in data:
            continue
        v = data[col]
        if v is None or (isinstance(v, str) and not v.strip()):
            data[col] = None
            continue
        try:
            data[col] = int(v)
        except (TypeError, ValueError):
            try:
                data[col] = float(v)
            except (TypeError, ValueError):
                data[col] = None


# ── the merge ────────────────────────────────────────────────────────

def apply_overlay(table: str, base_rows: list[dict], add_filter: dict | None = None,
                  include_adds: bool = True) -> list[dict]:
    """Merge the user delta over freshly-read base rows. Unregistered tables and
    tables with no overlay pass through unchanged, so every read site can call
    this unconditionally and Phase-2 breadth is just registry lines.

    add_filter (e.g. {"item_group": group}) scopes user-added rows to a filtered
    query so an add in one group doesn't leak into another group's view.

    include_adds=False applies only edits + deletes, never user-added rows. The
    paginated character browser uses this: its adds live in a separate "Mine"
    view, so injecting them here would duplicate them across every page (adds
    aren't bounded by the SQL LIMIT/OFFSET) and skew the total count.
    """
    spec = ENTITY_REGISTRY.get(table)
    if spec is None:
        return base_rows
    doc = _load(table)
    if not (doc["adds"] or doc["edits"] or doc["deletes"]):
        return base_rows

    pk_cols = spec["pk"]
    deletes = set(doc["deletes"])
    edits = doc["edits"]
    adds = doc["adds"]

    out: list[dict] = []
    seen: set[str] = set()
    for row in base_rows:
        key = _pk_key(row, pk_cols)
        if key in deletes:
            continue
        merged = dict(row)
        edit = edits.get(key)
        if edit:
            base_at_edit = edit.get("_base_at_edit") or {}
            changed = False
            for col, val in edit.items():
                if col == "_base_at_edit" or col not in merged:
                    continue
                merged[col] = val
            # base-drift badge: an upstream change to a column the user also
            # edited (their value still wins, but surface that it diverged).
            for col, old in base_at_edit.items():
                if col in row and row[col] != old:
                    changed = True
                    break
            merged["_overlay"] = "edit"
            if changed:
                merged["_overlay_base_changed"] = True
        out.append(merged)
        seen.add(key)

    if include_adds:
        for key, row in adds.items():
            if key in deletes or key in seen:
                continue
            if add_filter and any(str(row.get(c, "")) != str(v) for c, v in add_filter.items()):
                continue
            merged = dict(row)
            merged["_overlay"] = "add"
            out.append(merged)
            seen.add(key)

    # Only re-sort tables that declare a sort column (the *_items buckets).
    # Tables without one (e.g. characters, ordered server-side by post_count)
    # MUST keep the incoming SQL order — re-sorting them by a missing column
    # would collapse every row onto the tag tiebreaker (alphabetical) and
    # clobber relevance ordering. Adds (none for those tables today) trail.
    sort_col = spec.get("sort_col")
    if sort_col:
        def _sort_key(r):
            v = r.get(sort_col)
            # bool is an int subclass — exclude it; any non-number (incl. a
            # stray string from a hand-crafted write) falls to the trailing
            # sentinel so the sort can never raise a mixed-type TypeError.
            n = v if isinstance(v, (int, float)) and not isinstance(v, bool) else 1_000_000
            return (n, str(r.get(pk_cols[0], "")))
        out.sort(key=_sort_key)
    return out


# ── base-row access (for diffs / collision / soft-link checks) ───────

def _base_row(table: str, pk_cols: list[str], pk_values: list[str]) -> dict | None:
    from .tag_builder import get_db  # deferred: avoid an import cycle at load
    where = " AND ".join(f"{c} = ?" for c in pk_cols)  # cols are registry-fixed
    row = get_db().execute(f"SELECT * FROM {table} WHERE {where}", tuple(pk_values)).fetchone()
    return dict(row) if row else None


def _group_exists(group_ref: tuple, value: str) -> bool:
    groups_table, _item_col, group_pk = group_ref
    from .tag_builder import get_db
    row = get_db().execute(
        f"SELECT 1 FROM {groups_table} WHERE {group_pk} = ?", (value,)
    ).fetchone()
    return row is not None


# ── CRUD operations (pure — HTTP-free, so they unit-test headlessly) ─
# The async routes below are thin wrappers; all validation + delta mutation
# lives here and raises OverlayError(message, status) on rejection.

class OverlayError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def overlay_summary(table: str) -> dict:
    if not is_editable(table):
        raise OverlayError(f"table not user-editable: {table}", 400)
    doc = _load(table)
    return {
        "table": table,
        "adds": doc["adds"], "edits": doc["edits"], "deletes": doc["deletes"],
        "counts": {"adds": len(doc["adds"]), "edits": len(doc["edits"]), "deletes": len(doc["deletes"])},
    }


def overlay_summary_all() -> dict:
    """Every editable table that currently has any user delta, with its
    adds/edits/deletes + counts. Backs the 'Your edits' management view in one
    request instead of one per table."""
    tables = {}
    total = {"adds": 0, "edits": 0, "deletes": 0}
    for table in ENTITY_REGISTRY:
        doc = _load(table)
        n_a, n_e, n_d = len(doc["adds"]), len(doc["edits"]), len(doc["deletes"])
        if not (n_a or n_e or n_d):
            continue
        tables[table] = {
            "adds": doc["adds"], "edits": doc["edits"], "deletes": doc["deletes"],
            "counts": {"adds": n_a, "edits": n_e, "deletes": n_d},
        }
        total["adds"] += n_a
        total["edits"] += n_e
        total["deletes"] += n_d
    return {"tables": tables, "total": total}


def overlay_add(table: str, body: dict) -> dict:
    try:
        spec = _assert_editable(table)
    except ValueError as e:
        raise OverlayError(str(e), 400)
    row = _strip_meta(body)
    _coerce_types(spec, row)
    pk_cols = spec["pk"]

    for col in spec.get("required", pk_cols):
        if not str(row.get(col, "")).strip():
            raise OverlayError(f"missing required field: {col}", 400)

    group_ref = spec.get("group_ref")
    if group_ref and not _group_exists(group_ref, row.get(group_ref[1])):
        raise OverlayError(f"unknown {group_ref[1]}: {row.get(group_ref[1])!r}", 400)

    pk_values = [str(row.get(c, "")) for c in pk_cols]
    if _base_row(table, pk_cols, pk_values) is not None:
        raise OverlayError("primary key already exists in the base library", 409)

    key = _pk_key(row, pk_cols)
    with _lock_for(table):
        doc = _load(table)
        if key in doc["adds"]:
            raise OverlayError("you already added an item with this key", 409)
        doc["adds"][key] = row
        if key in doc["deletes"]:
            doc["deletes"].remove(key)
        _save(table, doc)
    return {"key": key, "row": row}


def overlay_edit(table: str, pk: str, body: dict) -> dict:
    try:
        spec = _assert_editable(table)
    except ValueError as e:
        raise OverlayError(str(e), 400)
    incoming = _strip_meta(body)
    _coerce_types(spec, incoming)
    pk_cols = spec["pk"]

    # PK is identity — forbid in-place renames (a rename is add-new + delete-old
    # so soft links to the old key don't silently orphan).
    if any(c in incoming for c in pk_cols) and _pk_key({**{c: "" for c in pk_cols}, **incoming}, pk_cols) != pk:
        raise OverlayError("primary key is immutable; delete and re-add to rename", 400)

    # Same soft-link guard as overlay_add — both the user-add and base-edit
    # branches below consume `incoming`, so an edit can't move a row into a
    # group that doesn't exist (which would silently orphan it from every view).
    group_ref = spec.get("group_ref")
    if group_ref and group_ref[1] in incoming and not _group_exists(group_ref, incoming[group_ref[1]]):
        raise OverlayError(f"unknown {group_ref[1]}: {incoming[group_ref[1]]!r}", 400)

    with _lock_for(table):
        doc = _load(table)
        if pk in doc["adds"]:
            doc["adds"][pk] = {**doc["adds"][pk], **incoming}
            _save(table, doc)
            return {"key": pk, "kind": "add"}

        base = _base_row(table, pk_cols, pk.split(_PK_SEP))
        if base is None:
            raise OverlayError("no base row to edit (and no user add); add it instead", 404)

        changed, snapshot = {}, {}
        for col, val in incoming.items():
            if col in pk_cols or col not in base:
                continue
            if base[col] != val:
                changed[col] = val
                snapshot[col] = base[col]
        if not changed:
            doc["edits"].pop(pk, None)
        else:
            doc["edits"][pk] = {**changed, "_base_at_edit": snapshot}
        doc["deletes"] = [d for d in doc["deletes"] if d != pk]
        _save(table, doc)
    return {"key": pk, "kind": "edit", "changed": list(changed)}


def overlay_delete(table: str, pk: str) -> dict:
    if not is_editable(table):
        raise OverlayError(f"table not user-editable: {table}", 400)
    with _lock_for(table):
        doc = _load(table)
        if pk in doc["adds"]:
            del doc["adds"][pk]  # drop a user-added row — no tombstone needed
            kind = "drop_add"
        else:
            if pk not in doc["deletes"]:
                doc["deletes"].append(pk)  # tombstone a base row
            doc["edits"].pop(pk, None)
            kind = "tombstone"
        _save(table, doc)
    return {"key": pk, "kind": kind}


def overlay_restore(table: str, pk: str) -> dict:
    """Restore a base row to shipped default — drop any edit and any tombstone.
    (Restoring a user-added row is a delete; use DELETE for that.)"""
    if not is_editable(table):
        raise OverlayError(f"table not user-editable: {table}", 400)
    with _lock_for(table):
        doc = _load(table)
        doc["edits"].pop(pk, None)
        doc["deletes"] = [d for d in doc["deletes"] if d != pk]
        _save(table, doc)
    return {"key": pk}


# ── CRUD routes (thin wrappers — write ONLY the overlay files) ───────

@routes.get("/promptchain/tag-builder/overlay")
async def _api_overlay_all(request):
    return web.json_response(overlay_summary_all())


@routes.get("/promptchain/tag-builder/overlay/{table}")
async def _api_overlay_get(request):
    try:
        return web.json_response(overlay_summary(request.match_info["table"]))
    except OverlayError as e:
        return error_response(e.message, e.status)


@routes.post("/promptchain/tag-builder/overlay/{table}")
async def _api_overlay_add(request):
    body, err = await parse_json(request)
    if err is not None:
        return err
    try:
        return ok_response(overlay_add(request.match_info["table"], body))
    except OverlayError as e:
        return error_response(e.message, e.status)


@routes.put("/promptchain/tag-builder/overlay/{table}/{pk}")
async def _api_overlay_edit(request):
    body, err = await parse_json(request)
    if err is not None:
        return err
    try:
        return ok_response(overlay_edit(request.match_info["table"], request.match_info["pk"], body))
    except OverlayError as e:
        return error_response(e.message, e.status)


@routes.delete("/promptchain/tag-builder/overlay/{table}/{pk}")
async def _api_overlay_delete(request):
    try:
        return ok_response(overlay_delete(request.match_info["table"], request.match_info["pk"]))
    except OverlayError as e:
        return error_response(e.message, e.status)


@routes.post("/promptchain/tag-builder/overlay/{table}/{pk}/restore")
async def _api_overlay_restore(request):
    try:
        return ok_response(overlay_restore(request.match_info["table"], request.match_info["pk"]))
    except OverlayError as e:
        return error_response(e.message, e.status)
