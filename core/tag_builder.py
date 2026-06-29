# Merges what used to be five domain APIs (autotagger, props, clothing,
# fantasy, furniture) so they share one sqlite connection — opening five
# was thrashing WAL on cold start.
from __future__ import annotations

import json
import logging
import re
import sqlite3
import threading
from pathlib import Path

from aiohttp import web
import server

from .api_utils import parse_json, error_response

# Shares the AI debug channel so `match-characters` traces sit alongside
# the rest of the Prompt Generator pipeline in comfyui.log.
_dbg = logging.getLogger("promptchain.ai.debug")

# ── database ──────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent.parent / "data" / "tag-builder" / "tag-builder.db"
_local = threading.local()
# True once the one-time schema/normalize/reconcile helpers have run this
# process. Gates get_db's mtime-triggered reconnects so the expensive
# ~11,529-row reconcile doesn't re-run on every spurious reopen.
_schema_ready = False


def get_db() -> sqlite3.Connection:
    # Reopen when the DB file's mtime changes — git pull / direct sqlite3
    # writes replace the file underneath us and the existing connection's
    # page cache keeps serving stale rows until ComfyUI restarts.
    try:
        current_mtime = DB_PATH.stat().st_mtime_ns
    except OSError:
        current_mtime = None
    cached_mtime = getattr(_local, "mtime", None)
    if (
        not hasattr(_local, "conn")
        or _local.conn is None
        or (current_mtime is not None and cached_mtime != current_mtime)
    ):
        if getattr(_local, "conn", None) is not None:
            try:
                _local.conn.close()
            except sqlite3.Error:
                pass
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.text_factory = lambda x: x.decode("utf-8", "replace")
        # FK enforcement is off by default in sqlite, so CASCADE deletes were
        # inert and orphan preset rows accumulated. Per-connection pragma.
        conn.execute("PRAGMA foreign_keys=ON")
        # These schema/normalize/reconcile helpers are idempotent but
        # expensive — the reconcile walks ~11,529 character rows. get_db
        # reconnects on every DB-file mtime change, and sqlite's delete
        # journal self-bumps that mtime on internal commits, so without
        # gating they re-ran on the asyncio loop on roughly every other
        # request while editing. Run them once per process; the request-
        # time appearance-chip fallback covers a char added externally
        # mid-session, and a restart re-runs them to refresh the cache.
        global _schema_ready
        if not _schema_ready:
            _ensure_generic_outfits_schema(conn)
            _normalize_full_outfits_sort_order(conn)
            _normalize_scene_locations_sort_order(conn)
            _ensure_character_appearance_chip_columns(conn)
            _reconcile_character_base_tags(conn)
            _schema_ready = True
            # The helpers commit, bumping the watched mtime; re-read it so
            # their own write doesn't immediately trigger another reconnect.
            try:
                current_mtime = DB_PATH.stat().st_mtime_ns
            except OSError:
                pass
        _local.conn = conn
        _local.mtime = current_mtime
    return _local.conn


def _reconcile_character_base_tags(conn: sqlite3.Connection) -> None:
    # Direct sqlite3 CLI writes to appearance_chip_tags bypass the
    # PUT endpoint's recompose, so base_tags can drift from the chip
    # refs that are the source of truth. The frontend applyIdentity()
    # parses base_tags, so drift surfaces as wrong slots (e.g. emitting
    # "long hair" when chips say short_hair). Reconcile on open so the
    # next request sees a coherent projection.
    rows = conn.execute(
        "SELECT tag, base_tags, appearance_chip_tags, base_extras "
        "FROM characters WHERE appearance_chip_tags IS NOT NULL "
        "AND appearance_chip_tags != ''"
    ).fetchall()
    for row in rows:
        chips, extras, identity_token, _ = _resolve_character_appearance_chips(conn, row)
        recomposed = _compose_character_base_tags(identity_token, extras, chips)
        if recomposed and recomposed != (row["base_tags"] or ""):
            conn.execute(
                "UPDATE characters SET base_tags = ? WHERE tag = ?",
                (recomposed, row["tag"]),
            )
    conn.commit()


def _ensure_character_appearance_chip_columns(conn: sqlite3.Connection) -> None:
    """Idempotently add columns supporting the chip-reference migration:
    appearance_chip_tags (JSON array of appearance_items.item_tag) and
    base_extras (any non-chip identity tokens like '1girl' that we still
    need to emit alongside the bound appearance chips). NULL on either
    means the character hasn't been migrated to chip refs yet — the
    resolver falls back to parsing characters.base_tags.

    Also adds `status` to character_chip_overrides so each enhancer
    phrasing carries its own normalized/unprocessed/broken QA state
    independent of the base chip's natlang_status.

    Also adds `appearance_adds` and `appearance_removes` to outfits/poses
    so a context can rewrite the character's bound appearance chips. SF6
    Cammy adds short_hair and removes twin_braids+long_hair, for example.
    JSON arrays of appearance_items.item_tag; NULL = no delta."""
    for column, decl in (
        ("appearance_chip_tags", "TEXT"),
        ("base_extras", "TEXT"),
    ):
        try:
            conn.execute(f"ALTER TABLE characters ADD COLUMN {column} {decl}")
        except sqlite3.OperationalError:
            # column already exists
            pass
    for table in ("character_chip_overrides", "outfit_chip_overrides", "pose_chip_overrides"):
        try:
            conn.execute(
                f"ALTER TABLE {table} ADD COLUMN status TEXT DEFAULT 'unprocessed'"
            )
        except sqlite3.OperationalError:
            pass
    for table in ("outfits", "poses"):
        for column in ("appearance_adds", "appearance_removes"):
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")
            except sqlite3.OperationalError:
                pass
    conn.commit()


def _normalize_full_outfits_sort_order(conn: sqlite3.Connection) -> None:
    """Flatten clothing_items.sort_order to 0 across every group so all
    clothing dropdowns are purely alphabetical via ORDER BY sort_order, item_tag.
    Idempotent: re-running is a no-op. Runs on every DB connection so dev/test
    instances auto-normalize after `git pull + restart`."""
    try:
        conn.execute(
            "UPDATE clothing_items SET sort_order = 0 WHERE sort_order != 0"
        )
        conn.commit()
    except sqlite3.OperationalError:
        # clothing_items table not yet initialized — schema bootstrap creates
        # it later via the bucket migrator; the next connection will normalize.
        pass


def _normalize_scene_locations_sort_order(conn: sqlite3.Connection) -> None:
    """Flatten scene_items.sort_order to 0 across the location group so the
    dropdown is purely alphabetical via ORDER BY sort_order, item_tag.
    Same pattern as _normalize_full_outfits_sort_order."""
    try:
        conn.execute(
            "UPDATE scene_items SET sort_order = 0 "
            "WHERE item_group = 'location' AND sort_order != 0"
        )
        conn.commit()
    except sqlite3.OperationalError:
        pass


def _ensure_generic_outfits_schema(conn: sqlite3.Connection) -> None:
    """Create generic_outfits + generic_outfit_slots if missing, and seed
    initial archetypes on a fresh table. Generic outfits are character-
    independent garment archetypes (cowboy, maid, pirate, etc.) the patch
    flow can apply to any character. Same slot-decomposition shape as
    per-character outfits so the rendering path is unchanged.
    Idempotent — safe to call on every connection."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS generic_outfits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            aliases TEXT,
            outfit_tags TEXT,
            outfit_natlang TEXT,
            sort_order INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS generic_outfit_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outfit_id INTEGER NOT NULL,
            slot TEXT NOT NULL,
            item TEXT,
            color TEXT,
            source_phrase TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (outfit_id) REFERENCES generic_outfits(id) ON DELETE CASCADE
        )
    """)
    # Per-entry idempotent seed: every name in _GENERIC_OUTFIT_SEED gets
    # inserted if missing, so adding a new archetype to the seed list
    # auto-populates on next ComfyUI restart for already-seeded DBs.
    # Existing rows are never overwritten — manual edits in the KB survive.
    for entry in _GENERIC_OUTFIT_SEED:
        already = conn.execute(
            "SELECT id FROM generic_outfits WHERE name = ?",
            (entry["name"],),
        ).fetchone()
        if already:
            continue
        cur = conn.execute(
            "INSERT INTO generic_outfits "
            "(name, aliases, outfit_tags, outfit_natlang, sort_order) "
            "VALUES (?, ?, ?, ?, ?)",
            (entry["name"], entry.get("aliases", ""),
             entry.get("outfit_tags", ""), entry.get("outfit_natlang", ""),
             entry.get("sort_order", 0)),
        )
        outfit_id = cur.lastrowid
        for s in entry.get("slots", []):
            conn.execute(
                "INSERT INTO generic_outfit_slots "
                "(outfit_id, slot, item, color, source_phrase, sort_order) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (outfit_id, s["slot"], s.get("item"), s.get("color"),
                 s["source_phrase"], s.get("sort_order", 0)),
            )
    conn.commit()


# Initial seed of common outfit archetypes. The point is durable
# tier-3 lookups for "in a [X] outfit" phrasing — curated tag lists
# beat bge-small retrieval which leaks scene props (horse, gun) into
# clothing context. Aliases cover plural / shorthand variants. Add
# more here or via direct DB rows; the lookup respects whatever's
# present.
_GENERIC_OUTFIT_SEED = [
    {
        "name": "Cowboy Outfit",
        "aliases": "cowboy,cowboy outfit,western,western outfit,wild west,wild west outfit,cowgirl,cowgirl outfit",
        "outfit_tags": "cowboy_hat, plaid_shirt, denim_pants, leather_belt, gun_holster, cowboy_boots, bandana",
        "outfit_natlang": "a cowboy hat, a plaid shirt, denim pants, a leather belt with gun holster, cowboy boots, and a bandana around the neck",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "cowboy_hat"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "plaid_shirt"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "denim_pants"},
            {"slot": "accessories", "item": "belt", "color": "", "source_phrase": "leather_belt"},
            {"slot": "accessories", "item": "holster", "color": "", "source_phrase": "gun_holster"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "cowboy_boots"},
            {"slot": "accessories", "item": "bandana", "color": "", "source_phrase": "bandana"},
        ],
    },
    {
        "name": "Maid Outfit",
        "aliases": "maid,maid outfit,french maid,french maid outfit,maid uniform",
        "outfit_tags": "maid_headdress, white_apron, black_dress, frilly_apron, white_thighhighs, mary_janes",
        "outfit_natlang": "a maid headdress, a white frilly apron over a black dress, white thighhighs, and mary jane shoes",
        "slots": [
            {"slot": "headwear", "item": "headdress", "color": "white", "source_phrase": "maid_headdress"},
            {"slot": "tops", "item": "apron", "color": "white", "source_phrase": "white_apron"},
            {"slot": "tops", "item": "dress", "color": "black", "source_phrase": "black_dress"},
            {"slot": "modifiers", "item": "frilly_apron", "color": "", "source_phrase": "frilly_apron"},
            {"slot": "legwear", "item": "thighhighs", "color": "white", "source_phrase": "white_thighhighs"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "mary_janes"},
        ],
    },
    {
        "name": "Pirate Outfit",
        "aliases": "pirate,pirate outfit,buccaneer,buccaneer outfit",
        "outfit_tags": "tricorne, ruffled_shirt, leather_vest, sash, eyepatch, knee_boots, (pirate_costume:1.1)",
        "outfit_natlang": "a tricorne hat, a ruffled white shirt under a leather vest, a sash at the waist, an eyepatch, and tall knee boots",
        "slots": [
            {"slot": "headwear", "item": "tricorne", "color": "", "source_phrase": "tricorne"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "ruffled_shirt"},
            {"slot": "tops", "item": "vest", "color": "", "source_phrase": "leather_vest"},
            {"slot": "accessories", "item": "sash", "color": "", "source_phrase": "sash"},
            {"slot": "accessories", "item": "eyepatch", "color": "", "source_phrase": "eyepatch"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "knee_boots"},
        ],
    },
    {
        "name": "Goth Outfit",
        "aliases": "goth,goth outfit,goth fashion,gothic,gothic outfit,gothic fashion,goth girl",
        "outfit_tags": "(goth_fashion:1.1), black_choker, black_lace, black_dress, fishnets, dark_makeup, black_lipstick, platform_boots",
        "outfit_natlang": "a black choker, black lace details on a black dress, fishnet legwear, dark makeup with black lipstick, and platform boots",
        "slots": [
            {"slot": "accessories", "item": "choker", "color": "black", "source_phrase": "black_choker"},
            {"slot": "tops", "item": "dress", "color": "black", "source_phrase": "black_dress"},
            {"slot": "modifiers", "item": "lace", "color": "black", "source_phrase": "black_lace"},
            {"slot": "legwear", "item": "fishnets", "color": "", "source_phrase": "fishnets"},
            {"slot": "modifiers", "item": "makeup", "color": "", "source_phrase": "dark_makeup"},
            {"slot": "modifiers", "item": "lipstick", "color": "black", "source_phrase": "black_lipstick"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "platform_boots"},
        ],
    },
    {
        "name": "School Uniform",
        "aliases": "school uniform,school outfit,sailor uniform,seifuku,school girl outfit,schoolgirl",
        "outfit_tags": "sailor_collar, white_blouse, pleated_skirt, knee_highs, loafers, neckerchief",
        "outfit_natlang": "a sailor-collar white blouse, a pleated skirt, knee-high socks, brown loafers, and a neckerchief",
        "slots": [
            {"slot": "tops", "item": "blouse", "color": "white", "source_phrase": "white_blouse"},
            {"slot": "modifiers", "item": "collar", "color": "", "source_phrase": "sailor_collar"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "accessories", "item": "neckerchief", "color": "", "source_phrase": "neckerchief"},
            {"slot": "legwear", "item": "knee_highs", "color": "", "source_phrase": "knee_highs"},
            {"slot": "footwear", "item": "loafers", "color": "", "source_phrase": "loafers"},
        ],
    },
    {
        "name": "Business Suit",
        "aliases": "business suit,business outfit,office outfit,formal suit,office wear,business attire",
        "outfit_tags": "(business_suit:1.1), white_shirt, necktie, dress_pants, leather_shoes, blazer",
        "outfit_natlang": "a tailored business suit with a blazer over a white shirt, a necktie, dress pants, and leather shoes",
        "slots": [
            {"slot": "tops", "item": "blazer", "color": "", "source_phrase": "blazer"},
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "accessories", "item": "necktie", "color": "", "source_phrase": "necktie"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "dress_pants"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "leather_shoes"},
        ],
    },
    {
        "name": "Cow Costume",
        "aliases": "cow costume,cow cosplay,cow girl costume,cow kigurumi,cow outfit,cow print outfit,cow hoodie outfit",
        "outfit_tags": "cow_hood, cow_horns, cow_print_bikini, cow_print_thighhighs, cow_print_gloves, cowbell, cow_tail",
        "outfit_natlang": "a cow-print hood with cow horns, a cow-print bikini, cow-print thighhighs, cow-print gloves, a cowbell at the neck, and a cow tail",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "cow_hood"},
            {"slot": "headwear", "item": "horns", "color": "", "source_phrase": "cow_horns"},
            {"slot": "tops", "item": "bikini", "color": "cow_print", "source_phrase": "cow_print_bikini"},
            {"slot": "legwear", "item": "thighhighs", "color": "cow_print", "source_phrase": "cow_print_thighhighs"},
            {"slot": "handwear", "item": "gloves", "color": "cow_print", "source_phrase": "cow_print_gloves"},
            {"slot": "neckwear", "item": "bell", "color": "", "source_phrase": "cowbell"},
            {"slot": "accessories", "item": "tail", "color": "", "source_phrase": "cow_tail"},
        ],
    },
    {
        "name": "Ancient Egyptian Clothes",
        "aliases": "ancient egyptian,ancient egyptian outfit,ancient egyptian clothes,ancient egypt,egyptian,egyptian outfit,egyptian costume,egyptian clothes,egyptian cosplay,pharaoh,pharaoh outfit,pharaoh costume",
        "outfit_tags": "(ancient_egyptian:1.1), (ancient_egyptian_clothes:1.1), nemes, usekh_collar, shendyt, uraeus, ankh, bracelet",
        "outfit_natlang": "a striped nemes headdress with a uraeus, a wide gold usekh collar, a white pleated shendyt kilt, gold armlets and bracelets, sandals, and an ankh accessory",
        "slots": [
            {"slot": "headwear", "item": "headdress", "color": "", "source_phrase": "nemes"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "usekh_collar"},
            {"slot": "bottoms", "item": "kilt", "color": "", "source_phrase": "shendyt"},
            {"slot": "accessories", "item": "armlet", "color": "", "source_phrase": "armlet"},
            {"slot": "accessories", "item": "bracelet", "color": "", "source_phrase": "bracelet"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "sandals"},
            {"slot": "accessories", "item": "ankh", "color": "", "source_phrase": "ankh"},
            {"slot": "accessories", "item": "uraeus", "color": "", "source_phrase": "uraeus"},
        ],
    },
    {
        "name": "Ao Dai",
        "aliases": "ao dai,ao dai outfit,ao dai dress,vietnamese dress,vietnamese ao dai,vietnamese national dress,traditional vietnamese outfit",
        "outfit_tags": "rice_hat, (ao_dai:1.1), mandarin_collar, side_slit, white_pants",
        "outfit_natlang": "a rice hat, a long fitted ao dai tunic with a mandarin collar and side slits, and white silk trousers",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "rice_hat"},
            {"slot": "bottoms", "item": "pants", "color": "white", "source_phrase": "white_pants"},
            {"slot": "modifiers", "item": "collar", "color": "", "source_phrase": "mandarin_collar"},
            {"slot": "modifiers", "item": "slit", "color": "", "source_phrase": "side_slit"},
        ],
    },
    {
        "name": "Arabian Clothes",
        "aliases": "arabian,arabian outfit,arabian clothes,arabian dress,middle eastern outfit,1001 nights outfit,desert robes,arabian princess outfit",
        "outfit_tags": "turban, keffiyeh, thobe, mouth_veil, armlet, head_chain, (arabian_clothes:1.1)",
        "outfit_natlang": "a turban with a keffiyeh draped over the shoulders, a long flowing thobe robe, a mouth veil, gold armlets on the upper arms, and a head chain across the brow",
        "slots": [
            {"slot": "headwear", "item": "turban", "color": "", "source_phrase": "turban"},
            {"slot": "headwear", "item": "keffiyeh", "color": "", "source_phrase": "keffiyeh"},
            {"slot": "dresses", "item": "thobe", "color": "", "source_phrase": "thobe"},
            {"slot": "neckwear", "item": "veil", "color": "", "source_phrase": "mouth_veil"},
            {"slot": "accessories", "item": "armlet", "color": "", "source_phrase": "armlet"},
            {"slot": "accessories", "item": "head_chain", "color": "", "source_phrase": "head_chain"},
        ],
    },
    {
        "name": "Armored Leotard",
        "aliases": "armored leotard,armored leotard outfit,armor leotard,plated leotard,battle leotard,warrior leotard,mecha leotard",
        "outfit_tags": "pauldrons, (armored_leotard:1.1), gauntlets, faulds, black_thighhighs, armored_boots",
        "outfit_natlang": "metal pauldrons over a form-fitting armored leotard with plated reinforcements, articulated gauntlets, faulds at the hips, black thighhighs, and armored boots",
        "slots": [
            {"slot": "tops", "item": "leotard", "color": "", "source_phrase": "armored_leotard"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "accessories", "item": "faulds", "color": "", "source_phrase": "faulds"},
            {"slot": "legwear", "item": "thighhighs", "color": "black", "source_phrase": "black_thighhighs"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "armored_boots"},
        ],
    },
    {
        "name": "Asticassia School Uniform",
        "aliases": "asticassia uniform, asticassia school uniform, the witch from mercury school uniform, witch from mercury uniform, g-witch uniform, g-witch school uniform, gundam witch from mercury uniform, suletta school uniform",
        "outfit_tags": "(asticassia_school_uniform:1.1), school_uniform, black_hairband, white_jacket, shoulder_boards, gold_trim, red_necktie, white_shorts, black_pantyhose, black_boots",
        "outfit_natlang": "a black hairband, a white military-style jacket with gold trim and shoulder boards, a red necktie, white shorts, black pantyhose, and black boots",
        "slots": [
            {"slot": "headwear", "item": "hairband", "color": "black", "source_phrase": "black_hairband"},
            {"slot": "tops", "item": "jacket", "color": "white", "source_phrase": "white_jacket"},
            {"slot": "bottoms", "item": "shorts", "color": "white", "source_phrase": "white_shorts"},
            {"slot": "legwear", "item": "pantyhose", "color": "black", "source_phrase": "black_pantyhose"},
            {"slot": "footwear", "item": "boots", "color": "black", "source_phrase": "black_boots"},
            {"slot": "neckwear", "item": "necktie", "color": "red", "source_phrase": "red_necktie"},
            {"slot": "accessories", "item": "shoulder_boards", "color": "", "source_phrase": "shoulder_boards"},
            {"slot": "modifiers", "item": "gold_trim", "color": "", "source_phrase": "gold_trim"},
        ],
    },
    {
        "name": "Athletic Leotard",
        "aliases": "athletic leotard,gymnast leotard,gymnastics leotard,ballet leotard,dance leotard,competition leotard,rhythmic gymnastics leotard",
        "outfit_tags": "(athletic_leotard:1.1), ballet_slippers",
        "outfit_natlang": "a fitted athletic leotard with high-cut legs and ballet slippers on the feet",
        "slots": [
            {"slot": "tops", "item": "leotard", "color": "", "source_phrase": "athletic_leotard"},
            {"slot": "footwear", "item": "slippers", "color": "", "source_phrase": "ballet_slippers"},
        ],
    },
    {
        "name": "Baseball Uniform",
        "aliases": "baseball uniform,baseball outfit,baseball jersey outfit,baseball player outfit,baseball cosplay,little league outfit",
        "outfit_tags": "baseball_cap, baseball_jersey, pants, baseball_mitt, (baseball_uniform:1.1)",
        "outfit_natlang": "a baseball cap, a baseball jersey, baseball pants with a belt, and a baseball mitt",
        "slots": [
            {"slot": "headwear", "item": "cap", "color": "", "source_phrase": "baseball_cap"},
            {"slot": "tops", "item": "jersey", "color": "", "source_phrase": "baseball_jersey"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "pants"},
            {"slot": "handwear", "item": "mitt", "color": "", "source_phrase": "baseball_mitt"},
        ],
    },
    {
        "name": "Basketball Uniform",
        "aliases": "basketball uniform,basketball outfit,basketball jersey,basketball kit,basketball cosplay,basketball player outfit,basketball player uniform",
        "outfit_tags": "(basketball_uniform:1.1), headband, basketball_jersey, basketball_shorts, wristband, sneakers, basketball_(object)",
        "outfit_natlang": "a sweatband headband, a sleeveless basketball jersey, basketball shorts, wristbands, athletic sneakers, and a basketball held as a prop",
        "slots": [
            {"slot": "headwear", "item": "headband", "color": "", "source_phrase": "headband"},
            {"slot": "tops", "item": "jersey", "color": "", "source_phrase": "basketball_jersey"},
            {"slot": "bottoms", "item": "shorts", "color": "", "source_phrase": "basketball_shorts"},
            {"slot": "handwear", "item": "wristband", "color": "", "source_phrase": "wristband"},
            {"slot": "footwear", "item": "sneakers", "color": "", "source_phrase": "sneakers"},
            {"slot": "accessories", "item": "basketball", "color": "", "source_phrase": "basketball_(object)"},
        ],
    },
    {
        "name": "Bath Yukata",
        "aliases": "bath yukata,bath yukata outfit,onsen yukata,ryokan yukata,post-bath yukata,hot springs yukata,nemaki yukata",
        "outfit_tags": "(bath_yukata:1.1), haori, obi, geta, towel, washbowl",
        "outfit_natlang": "a loose bath yukata tied with an obi sash, a haori jacket draped over the shoulders, wooden geta sandals, and a towel draped over one shoulder with a washbowl in hand",
        "slots": [
            {"slot": "dresses", "item": "yukata", "color": "", "source_phrase": "bath_yukata"},
            {"slot": "tops", "item": "haori", "color": "", "source_phrase": "haori"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "obi"},
            {"slot": "footwear", "item": "geta", "color": "", "source_phrase": "geta"},
            {"slot": "accessories", "item": "towel", "color": "", "source_phrase": "towel"},
            {"slot": "accessories", "item": "washbowl", "color": "", "source_phrase": "washbowl"},
        ],
    },
    {
        "name": "Bathrobe",
        "aliases": "bathrobe, bath robe, dressing gown, robe, terrycloth robe, after-bath robe",
        "outfit_tags": "(bathrobe:1.1), towel_on_head, slippers",
        "outfit_natlang": "a white bathrobe loosely tied at the waist, a towel wrapped on the head, and soft slippers",
        "slots": [
            {"slot": "headwear", "item": "towel", "color": "", "source_phrase": "towel_on_head"},
            {"slot": "dresses", "item": "bathrobe", "color": "", "source_phrase": "bathrobe"},
            {"slot": "footwear", "item": "slippers", "color": "", "source_phrase": "slippers"},
        ],
    },
    {
        "name": "Bikini Armor",
        "aliases": "bikini armor, bikini armor outfit, metal bikini, chainmail bikini, fantasy bikini armor, warrior bikini, armored bikini",
        "outfit_tags": "(bikini_armor:1.1), pauldrons, vambraces, gauntlets, greaves, armored_boots, loincloth, cape, sword",
        "outfit_natlang": "a metal bikini top, pauldrons over the shoulders, vambraces and gauntlets on the arms, a loincloth at the hips, greaves on the shins, armored boots, a cape draped behind, and a sword",
        "slots": [
            {"slot": "tops", "item": "bikini", "color": "", "source_phrase": "bikini_armor"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "handwear", "item": "vambraces", "color": "", "source_phrase": "vambraces"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "bottoms", "item": "loincloth", "color": "", "source_phrase": "loincloth"},
            {"slot": "legwear", "item": "greaves", "color": "", "source_phrase": "greaves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "armored_boots"},
            {"slot": "accessories", "item": "cape", "color": "", "source_phrase": "cape"},
            {"slot": "accessories", "item": "sword", "color": "", "source_phrase": "sword"},
        ],
    },
    {
        "name": "Bear Costume",
        "aliases": "bear costume,bear cosplay,bear kigurumi,bear onesie,bear suit,bear pajamas,bear outfit",
        "outfit_tags": "bear_hood, bear_paws, bear_tail, (bear_costume:1.1)",
        "outfit_natlang": "a bear hood with bear ears, paw mitten gloves, and a small stumpy bear tail, all part of a full bear kigurumi costume",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "bear_hood"},
            {"slot": "handwear", "item": "paws", "color": "", "source_phrase": "bear_paws"},
            {"slot": "accessories", "item": "tail", "color": "", "source_phrase": "bear_tail"},
        ],
    },
    {
        "name": "Bike Suit",
        "aliases": "bike suit, bikesuit, biker suit, motorcycle suit, biker outfit, motorcycle bodysuit",
        "outfit_tags": "motorcycle_helmet, black_bodysuit, black_gloves, boots, skin_tight",
        "outfit_natlang": "a motorcycle helmet, a black skintight bodysuit with a front zipper, black gloves, and boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "motorcycle_helmet"},
            {"slot": "tops", "item": "bodysuit", "color": "black", "source_phrase": "black_bodysuit"},
            {"slot": "handwear", "item": "gloves", "color": "black", "source_phrase": "black_gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
            {"slot": "modifiers", "item": "skin_tight", "color": "", "source_phrase": "skin_tight"},
        ],
    },
    {
        "name": "Bondage Outfit",
        "aliases": "bondage outfit, bondage attire, bdsm outfit, fetish outfit, dominatrix outfit, harness outfit, latex bondage outfit",
        "outfit_tags": "(bondage_outfit:1.1), harness, corset, latex_bodysuit, latex_gloves, leather_boots, collar, ball_gag, cuffs",
        "outfit_natlang": "a leather body harness over a black latex bodysuit, an underbust corset cinched at the waist, latex gloves, leather boots, a collar at the neck, a ball gag, and metal cuffs at the wrists",
        "slots": [
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "latex_bodysuit"},
            {"slot": "tops", "item": "corset", "color": "", "source_phrase": "corset"},
            {"slot": "accessories", "item": "harness", "color": "", "source_phrase": "harness"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "latex_gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "leather_boots"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "collar"},
            {"slot": "accessories", "item": "gag", "color": "", "source_phrase": "ball_gag"},
            {"slot": "accessories", "item": "cuffs", "color": "", "source_phrase": "cuffs"},
        ],
    },
    {
        "name": "Casual One-Piece Swimsuit",
        "aliases": "casual one-piece swimsuit, casual swimsuit, casual one piece swimsuit, beach swimsuit, casual maillot, casual bathing suit, everyday swimsuit",
        "outfit_tags": "sun_hat, (casual_one-piece_swimsuit:1.1), sandals",
        "outfit_natlang": "a sun hat, a casual one-piece swimsuit, and sandals",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "sun_hat"},
            {"slot": "tops", "item": "swimsuit", "color": "", "source_phrase": "casual_one-piece_swimsuit"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "sandals"},
        ],
    },
    {
        "name": "Duffel Coat",
        "aliases": "duffel coat,duffle coat,toggle coat,winter duffel coat,duffel coat outfit,winter coat outfit",
        "outfit_tags": "(duffel_coat:1.1), hood, toggles, scarf, mittens, pleated_skirt, pantyhose, boots, winter_clothes",
        "outfit_natlang": "a thick woolen duffel coat with a hood and toggle fasteners, a wool scarf wrapped at the neck, mittens, a pleated skirt, pantyhose, and boots",
        "slots": [
            {"slot": "tops", "item": "coat", "color": "", "source_phrase": "duffel_coat"},
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "hood"},
            {"slot": "modifiers", "item": "toggles", "color": "", "source_phrase": "toggles"},
            {"slot": "neckwear", "item": "scarf", "color": "", "source_phrase": "scarf"},
            {"slot": "handwear", "item": "mittens", "color": "", "source_phrase": "mittens"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "legwear", "item": "pantyhose", "color": "", "source_phrase": "pantyhose"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
            {"slot": "modifiers", "item": "winter_clothes", "color": "", "source_phrase": "winter_clothes"},
        ],
    },
    {
        "name": "Full Armor",
        "aliases": "full armor, full armor outfit, full plate armor, full body armor, knight armor, suit of armor, full suit of armor, fully armored",
        "outfit_tags": "(full_armor:1.1), helmet, pauldrons, breastplate, gauntlets, faulds, greaves, armored_boots, cape",
        "outfit_natlang": "a helmet covering the head, pauldrons over the shoulders, a metal breastplate, gauntlets on the hands, faulds at the hips, greaves on the shins, armored boots, and a cape draped behind",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "helmet"},
            {"slot": "tops", "item": "breastplate", "color": "", "source_phrase": "breastplate"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "armored_boots"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "accessories", "item": "faulds", "color": "", "source_phrase": "faulds"},
            {"slot": "accessories", "item": "greaves", "color": "", "source_phrase": "greaves"},
            {"slot": "accessories", "item": "cape", "color": "", "source_phrase": "cape"},
        ],
    },
    {
        "name": "Diving Suit",
        "aliases": "diving suit,diver outfit,scuba diver outfit,scuba gear,scuba outfit,diving gear,diver gear,underwater diving outfit",
        "outfit_tags": "diving_mask, (diving_suit:1.1), snorkel, oxygen_tank, flippers",
        "outfit_natlang": "a diving mask over the eyes, a form-fitting full-body diving suit, a snorkel mouthpiece, an oxygen tank on the back, and flippers on the feet",
        "slots": [
            {"slot": "headwear", "item": "mask", "color": "", "source_phrase": "diving_mask"},
            {"slot": "tops", "item": "diving_suit", "color": "", "source_phrase": "diving_suit"},
            {"slot": "accessories", "item": "snorkel", "color": "", "source_phrase": "snorkel"},
            {"slot": "accessories", "item": "oxygen_tank", "color": "", "source_phrase": "oxygen_tank"},
            {"slot": "footwear", "item": "flippers", "color": "", "source_phrase": "flippers"},
        ],
    },
    {
        "name": "Chaldea Uniform",
        "aliases": "chaldea uniform, chaldea master uniform, fgo uniform, fate grand order uniform, chaldea security organization uniform, master uniform, chaldea outfit",
        "outfit_tags": "chaldea_master_uniform, white_jacket, white_shirt, black_skirt, black_pantyhose, knee_boots, orange_scrunchie, command_spell",
        "outfit_natlang": "a white jacket with blue trim over a white shirt with black buckles, a black skirt, black pantyhose, knee-high boots, an orange hair scrunchie, and a command spell on the back of the hand",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "white", "source_phrase": "white_jacket"},
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "bottoms", "item": "skirt", "color": "black", "source_phrase": "black_skirt"},
            {"slot": "legwear", "item": "pantyhose", "color": "black", "source_phrase": "black_pantyhose"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "knee_boots"},
            {"slot": "accessories", "item": "scrunchie", "color": "orange", "source_phrase": "orange_scrunchie"},
            {"slot": "accessories", "item": "command_spell", "color": "", "source_phrase": "command_spell"},
        ],
    },
    {
        "name": "Emo Fashion",
        "aliases": "emo,emo fashion,emo outfit,emo style,scemo,emo aesthetic,2000s emo",
        "outfit_tags": "band_shirt, skinny_jeans, studded_belt, wallet_chain, studded_choker, converse, scene_cut, black_eyeshadow, hair_over_one_eye",
        "outfit_natlang": "a band shirt, skinny jeans, a studded belt with a wallet chain, a studded choker, converse sneakers, a scene-cut hairstyle with hair over one eye, and heavy black eyeshadow",
        "slots": [
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "band_shirt"},
            {"slot": "bottoms", "item": "jeans", "color": "", "source_phrase": "skinny_jeans"},
            {"slot": "footwear", "item": "sneakers", "color": "", "source_phrase": "converse"},
            {"slot": "neckwear", "item": "choker", "color": "", "source_phrase": "studded_choker"},
            {"slot": "accessories", "item": "belt", "color": "", "source_phrase": "studded_belt"},
            {"slot": "accessories", "item": "chain", "color": "", "source_phrase": "wallet_chain"},
            {"slot": "modifiers", "item": "hairstyle", "color": "", "source_phrase": "scene_cut"},
            {"slot": "modifiers", "item": "hair", "color": "", "source_phrase": "hair_over_one_eye"},
            {"slot": "modifiers", "item": "makeup", "color": "black", "source_phrase": "black_eyeshadow"},
        ],
    },
    {
        "name": "Cyberpunk",
        "aliases": "cyberpunk,cyberpunk outfit,cyberpunk cosplay,cyberpunk attire,cyberpunk gear,cyberpunk style,futuristic dystopian outfit",
        "outfit_tags": "(cyberpunk:1.1), head-mounted_display, bodysuit, mechanical_arms, fingerless_gloves, thigh_holster, knee_boots, neon_trim, glowing_clothes",
        "outfit_natlang": "a head-mounted display visor, a sleek black bodysuit with neon trim and glowing accents, a cybernetic mechanical arm, fingerless gloves, a thigh holster, and tall knee boots",
        "slots": [
            {"slot": "headwear", "item": "visor", "color": "", "source_phrase": "head-mounted_display"},
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "bodysuit"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "fingerless_gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "knee_boots"},
            {"slot": "accessories", "item": "holster", "color": "", "source_phrase": "thigh_holster"},
            {"slot": "accessories", "item": "mechanical_arm", "color": "", "source_phrase": "mechanical_arms"},
            {"slot": "modifiers", "item": "neon_trim", "color": "", "source_phrase": "neon_trim"},
            {"slot": "modifiers", "item": "glowing", "color": "", "source_phrase": "glowing_clothes"},
        ],
    },
    {
        "name": "Furisode",
        "aliases": "furisode, furisode kimono, formal kimono, long-sleeved kimono, swinging sleeves kimono, coming of age kimono, seijin kimono",
        "outfit_tags": "kanzashi, hair_flower, (furisode:1.1), wide_sleeves, floral_print, obi, tabi, zouri",
        "outfit_natlang": "kanzashi hair ornaments and a hair flower, a brightly colored floral-print furisode kimono with extremely long wide swinging sleeves, a wide obi sash tied at the waist, white tabi socks, and zouri sandals",
        "slots": [
            {"slot": "headwear", "item": "kanzashi", "color": "", "source_phrase": "kanzashi"},
            {"slot": "headwear", "item": "hair_flower", "color": "", "source_phrase": "hair_flower"},
            {"slot": "dresses", "item": "furisode", "color": "", "source_phrase": "furisode"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
            {"slot": "modifiers", "item": "floral_print", "color": "", "source_phrase": "floral_print"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "obi"},
            {"slot": "legwear", "item": "tabi", "color": "", "source_phrase": "tabi"},
            {"slot": "footwear", "item": "zouri", "color": "", "source_phrase": "zouri"},
        ],
    },
    {
        "name": "Greco-Roman Clothes",
        "aliases": "greco-roman clothes,greek clothes,ancient greek outfit,roman clothes,classical clothing,grecian outfit,ancient greek clothing",
        "outfit_tags": "(greco-roman_clothes:1.1), laurel_crown, chiton, himation, gladiator_sandals",
        "outfit_natlang": "a laurel crown, a flowing white chiton draped over the body with a himation wrap across the shoulders, and gladiator sandals",
        "slots": [
            {"slot": "headwear", "item": "wreath", "color": "", "source_phrase": "laurel_crown"},
            {"slot": "dresses", "item": "chiton", "color": "", "source_phrase": "chiton"},
            {"slot": "accessories", "item": "himation", "color": "", "source_phrase": "himation"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "gladiator_sandals"},
        ],
    },
    {
        "name": "Demon Slayer Uniform",
        "aliases": "demon slayer uniform,demon slayer outfit,demon slayer corps uniform,kimetsu no yaiba uniform,demon slayer cosplay,kny uniform",
        "outfit_tags": "(demon_slayer_uniform:1.1), black_jacket, gold_buttons, white_shirt, white_belt, hakama_pants, boots",
        "outfit_natlang": "a black gakuran-style jacket with gold buttons, a white dress shirt collar showing at the neckline, a white belt at the waist, baggy hakama pants, and boots",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "black", "source_phrase": "black_jacket"},
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "modifiers", "item": "buttons", "color": "gold", "source_phrase": "gold_buttons"},
            {"slot": "bottoms", "item": "hakama", "color": "", "source_phrase": "hakama_pants"},
            {"slot": "accessories", "item": "belt", "color": "white", "source_phrase": "white_belt"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
        ],
    },
    {
        "name": "Garreg Mach Monastery Uniform",
        "aliases": "garreg mach monastery uniform,garreg mach uniform,monastery uniform,fe3h school uniform,three houses uniform,officers academy uniform,three houses school uniform,fire emblem three houses uniform",
        "outfit_tags": "black_jacket, white_shirt, white_ascot, black_gloves, black_skirt, blue_pantyhose, knee_boots, cape, gold_trim",
        "outfit_natlang": "a black jacket with gold trim over a white shirt, a white ascot at the neck, black gloves, a high-waist black skirt, blue pantyhose, knee-high boots, and a house-color cape",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "black", "source_phrase": "black_jacket"},
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "neckwear", "item": "ascot", "color": "white", "source_phrase": "white_ascot"},
            {"slot": "handwear", "item": "gloves", "color": "black", "source_phrase": "black_gloves"},
            {"slot": "bottoms", "item": "skirt", "color": "black", "source_phrase": "black_skirt"},
            {"slot": "legwear", "item": "pantyhose", "color": "blue", "source_phrase": "blue_pantyhose"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "knee_boots"},
            {"slot": "accessories", "item": "cape", "color": "", "source_phrase": "cape"},
            {"slot": "modifiers", "item": "gold_trim", "color": "", "source_phrase": "gold_trim"},
        ],
    },
    {
        "name": "Happi",
        "aliases": "happi,happi coat,festival coat,japanese festival coat,matsuri coat,happi outfit",
        "outfit_tags": "hachimaki, (happi:1.1), japanese_clothes, fundoshi, geta",
        "outfit_natlang": "a hachimaki headband, a happi festival coat with wide straight sleeves and family crests, a fundoshi underneath, and geta sandals",
        "slots": [
            {"slot": "headwear", "item": "hachimaki", "color": "", "source_phrase": "hachimaki"},
            {"slot": "tops", "item": "happi", "color": "", "source_phrase": "happi"},
            {"slot": "bottoms", "item": "fundoshi", "color": "", "source_phrase": "fundoshi"},
            {"slot": "footwear", "item": "geta", "color": "", "source_phrase": "geta"},
        ],
    },
    {
        "name": "Ghost Costume",
        "aliases": "ghost costume,ghost outfit,ghost cosplay,sheet ghost,sheet ghost costume,halloween ghost,halloween ghost costume,bedsheet ghost",
        "outfit_tags": "sheet_ghost, (ghost_costume:1.1), halloween_costume, halloween_bucket, jack-o'-lantern",
        "outfit_natlang": "a white sheet draped over the entire body with two cut eye holes for vision, a Halloween candy bucket carried in one hand, and a jack-o-lantern at the side",
        "slots": [
            {"slot": "dresses", "item": "sheet", "color": "white", "source_phrase": "sheet_ghost"},
            {"slot": "accessories", "item": "bucket", "color": "", "source_phrase": "halloween_bucket"},
            {"slot": "accessories", "item": "pumpkin", "color": "", "source_phrase": "jack-o'-lantern"},
        ],
    },
    {
        "name": "Hooded Bodysuit",
        "aliases": "hooded bodysuit,bodysuit with hood,hooded suit,hooded catsuit,bodysuit hood,hooded full-body suit",
        "outfit_tags": "(hooded_bodysuit:1.1), hood, (bodysuit:1.1)",
        "outfit_natlang": "a form-fitting one-piece bodysuit with an attached hood pulled up over the head",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "hood"},
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "hooded_bodysuit"},
        ],
    },
    {
        "name": "Hanbok",
        "aliases": "hanbok,korean hanbok,traditional korean dress,hanbok dress,korean traditional clothing,hanbok outfit",
        "outfit_tags": "(hanbok:1.1), jeogori_(clothes), chima_(clothes), beoseon, gomusin, norigae",
        "outfit_natlang": "a short jeogori jacket tied with a long ribbon bow, a high-waisted floor-length chima skirt in vibrant colors, white beoseon socks, gomusin shoes, and a norigae pendant ornament",
        "slots": [
            {"slot": "tops", "item": "jeogori", "color": "", "source_phrase": "jeogori_(clothes)"},
            {"slot": "bottoms", "item": "chima", "color": "", "source_phrase": "chima_(clothes)"},
            {"slot": "legwear", "item": "socks", "color": "", "source_phrase": "beoseon"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "gomusin"},
            {"slot": "accessories", "item": "norigae", "color": "", "source_phrase": "norigae"},
        ],
    },
    {
        "name": "Jiangshi Costume",
        "aliases": "jiangshi costume,jiangshi cosplay,hopping vampire costume,chinese vampire costume,jiangshi halloween costume,qing dynasty vampire costume",
        "outfit_tags": "qingdai_guanmao, ofuda_on_head, china_dress, chinese_clothes, sleeves_past_fingers, halloween_costume, (jiangshi_costume:1.1)",
        "outfit_natlang": "a qingdai guanmao hat, an ofuda talisman on the forehead, a china dress with chinese clothes styling, and sleeves past the fingers covering the hands",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "qingdai_guanmao"},
            {"slot": "tops", "item": "dress", "color": "", "source_phrase": "china_dress"},
            {"slot": "tops", "item": "clothes", "color": "", "source_phrase": "chinese_clothes"},
            {"slot": "accessories", "item": "ofuda", "color": "", "source_phrase": "ofuda_on_head"},
            {"slot": "accessories", "item": "costume", "color": "", "source_phrase": "halloween_costume"},
            {"slot": "modifiers", "item": "sleeves_past_fingers", "color": "", "source_phrase": "sleeves_past_fingers"},
        ],
    },
    {
        "name": "Hooded Robe",
        "aliases": "hooded robe,hooded robe outfit,monk robe,wizard robe,acolyte robe,cloaked robe,hood and robe",
        "outfit_tags": "(hooded_robe:1.1), hood_up, long_sleeves, wide_sleeves",
        "outfit_natlang": "a long robe with an attached hood worn up over the head, with long wide sleeves",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "hood_up"},
            {"slot": "dresses", "item": "robe", "color": "", "source_phrase": "hooded_robe"},
            {"slot": "modifiers", "item": "long_sleeves", "color": "", "source_phrase": "long_sleeves"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
        ],
    },
    {
        "name": "Kariginu",
        "aliases": "kariginu, kariginu robe, heian noble robe, japanese noble robe, heian court robe, kariginu outfit",
        "outfit_tags": "tate_eboshi, (kariginu:1.1), wide_sleeves, hakama, obi, geta",
        "outfit_natlang": "a tall tate eboshi cap, a kariginu robe with wide sleeves and open shoulder slits, hakama trousers, an obi sash at the waist, and wooden geta sandals",
        "slots": [
            {"slot": "headwear", "item": "eboshi", "color": "", "source_phrase": "tate_eboshi"},
            {"slot": "tops", "item": "kariginu", "color": "", "source_phrase": "kariginu"},
            {"slot": "bottoms", "item": "hakama", "color": "", "source_phrase": "hakama"},
            {"slot": "footwear", "item": "geta", "color": "", "source_phrase": "geta"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "obi"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
        ],
    },
    {
        "name": "Kappougi",
        "aliases": "kappougi,kappougi outfit,japanese cooking apron,japanese kitchen apron,traditional japanese apron,smock apron over kimono,housewife kappougi",
        "outfit_tags": "tenugui, (kappougi:1.1), kimono, obi",
        "outfit_natlang": "a tenugui headscarf, a long-sleeved kappougi smock-apron tied at the back over a kimono cinched with an obi",
        "slots": [
            {"slot": "headwear", "item": "tenugui", "color": "", "source_phrase": "tenugui"},
            {"slot": "tops", "item": "kappougi", "color": "", "source_phrase": "kappougi"},
            {"slot": "dresses", "item": "kimono", "color": "", "source_phrase": "kimono"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "obi"},
        ],
    },
    {
        "name": "Hanfu",
        "aliases": "hanfu,hanfu outfit,hanfu dress,traditional chinese dress,traditional chinese outfit,chinese hanfu,han chinese clothing,ruqun outfit",
        "outfit_tags": "(hanfu:1.1), chinese_clothes, wide_sleeves, long_sleeves, mamianqun, sash, chinese_hairpin",
        "outfit_natlang": "a hanfu robe with crossed y-shaped collar over a long mamianqun horse-face skirt, wide flowing long sleeves, a draped sash at the waist, and a Chinese hairpin in the hair",
        "slots": [
            {"slot": "tops", "item": "robe", "color": "", "source_phrase": "hanfu"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "mamianqun"},
            {"slot": "accessories", "item": "sash", "color": "", "source_phrase": "sash"},
            {"slot": "headwear", "item": "hairpin", "color": "", "source_phrase": "chinese_hairpin"},
            {"slot": "modifiers", "item": "sleeves", "color": "", "source_phrase": "wide_sleeves"},
            {"slot": "modifiers", "item": "sleeves", "color": "", "source_phrase": "long_sleeves"},
        ],
    },
    {
        "name": "Jiangshi",
        "aliases": "jiangshi,chinese hopping vampire,hopping vampire,chinese vampire,jiangshi outfit,jiangshi look",
        "outfit_tags": "(jiangshi:1.1), qingdai_guanmao, ofuda_on_head, chinese_clothes, wide_sleeves, long_sleeves, hat_ornament",
        "outfit_natlang": "a qingdai guanmao round Qing-official hat with hat ornament, an ofuda paper talisman stuck to the forehead, traditional Chinese robes with long wide sleeves that cover the hands, and arms outstretched in a hopping pose",
        "slots": [
            {"slot": "headwear", "item": "qingdai_guanmao", "color": "", "source_phrase": "qingdai_guanmao"},
            {"slot": "headwear", "item": "ofuda", "color": "", "source_phrase": "ofuda_on_head"},
            {"slot": "tops", "item": "chinese_clothes", "color": "", "source_phrase": "chinese_clothes"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
            {"slot": "modifiers", "item": "long_sleeves", "color": "", "source_phrase": "long_sleeves"},
            {"slot": "accessories", "item": "hat_ornament", "color": "", "source_phrase": "hat_ornament"},
        ],
    },
    {
        "name": "Idol Outfit",
        "aliases": "idol,idol outfit,idol costume,idol clothes,j-pop idol outfit,jpop idol outfit,pop idol outfit,idol stage outfit",
        "outfit_tags": "(idol_clothes:1.1), mini_hat, hair_bow, frilled_dress, puffy_sleeves, wrist_cuffs, thighhighs, thigh_boots",
        "outfit_natlang": "a mini hat tilted in the hair with a hair bow, a frilly idol-style dress with puffy sleeves, frilled wrist cuffs, thighhighs, and thigh-high boots",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "mini_hat"},
            {"slot": "headwear", "item": "bow", "color": "", "source_phrase": "hair_bow"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "frilled_dress"},
            {"slot": "modifiers", "item": "sleeves", "color": "", "source_phrase": "puffy_sleeves"},
            {"slot": "handwear", "item": "cuffs", "color": "", "source_phrase": "wrist_cuffs"},
            {"slot": "legwear", "item": "thighhighs", "color": "", "source_phrase": "thighhighs"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "thigh_boots"},
        ],
    },
    {
        "name": "Japanese Armor",
        "aliases": "japanese armor, samurai armor, samurai outfit, yoroi, samurai cosplay, japanese armour, oyoroi",
        "outfit_tags": "(japanese_armor:1.1), kabuto_(helmet), menpoo, sode, dou, kote, kusazuri, haidate, suneate, waraji, jinbaori",
        "outfit_natlang": "a kabuto helmet, a menpoo half-mask, sode pauldrons over the shoulders, a dou cuirass on the torso, kote arm guards, kusazuri plated skirts at the waist, haidate thigh guards, suneate shin guards, waraji straw sandals, and a jinbaori surcoat draped over the armor",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "kabuto_(helmet)"},
            {"slot": "headwear", "item": "mask", "color": "", "source_phrase": "menpoo"},
            {"slot": "tops", "item": "pauldrons", "color": "", "source_phrase": "sode"},
            {"slot": "tops", "item": "cuirass", "color": "", "source_phrase": "dou"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "kote"},
            {"slot": "bottoms", "item": "faulds", "color": "", "source_phrase": "kusazuri"},
            {"slot": "legwear", "item": "thigh_guards", "color": "", "source_phrase": "haidate"},
            {"slot": "legwear", "item": "shin_guards", "color": "", "source_phrase": "suneate"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "waraji"},
            {"slot": "accessories", "item": "surcoat", "color": "", "source_phrase": "jinbaori"},
        ],
    },
    {
        "name": "Kesa",
        "aliases": "kesa, buddhist monk robe, monk kesa, kesa robe, kasaya, buddhist robe, monk outfit",
        "outfit_tags": "(kesa:1.1), kimono, prayer_beads, sandals",
        "outfit_natlang": "a patchwork kesa worn over one shoulder over a plain kimono, prayer beads in hand, and sandals",
        "slots": [
            {"slot": "tops", "item": "kimono", "color": "", "source_phrase": "kimono"},
            {"slot": "accessories", "item": "kesa", "color": "", "source_phrase": "kesa"},
            {"slot": "accessories", "item": "prayer_beads", "color": "", "source_phrase": "prayer_beads"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "sandals"},
        ],
    },
    {
        "name": "Gothic Lolita",
        "aliases": "gothic lolita,gothic lolita outfit,goth loli,gothloli,gothic lolita fashion,gothic lolita dress,egl gothic",
        "outfit_tags": "(gothic_lolita:1.1), lolita_hairband, frilled_dress, black_dress, black_thighhighs, mary_janes, petticoat, lace_trim",
        "outfit_natlang": "a black lolita hairband, a frilled black dress with lace trim, a petticoat underneath, black thighhighs, and mary jane shoes",
        "slots": [
            {"slot": "headwear", "item": "hairband", "color": "", "source_phrase": "lolita_hairband"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "frilled_dress"},
            {"slot": "dresses", "item": "dress", "color": "black", "source_phrase": "black_dress"},
            {"slot": "legwear", "item": "thighhighs", "color": "black", "source_phrase": "black_thighhighs"},
            {"slot": "footwear", "item": "mary janes", "color": "", "source_phrase": "mary_janes"},
            {"slot": "accessories", "item": "petticoat", "color": "", "source_phrase": "petticoat"},
            {"slot": "modifiers", "item": "lace trim", "color": "", "source_phrase": "lace_trim"},
        ],
    },
    {
        "name": "Jirai Kei",
        "aliases": "jirai kei,jirai,jirai kei outfit,jirai kei fashion,landmine girl,landmine fashion,landmine type,ryousangata",
        "outfit_tags": "pink_shirt, frilled_shirt, suspender_skirt, black_skirt, black_bow, heart_choker, heart_o-ring, platform_shoes, aegyo_sal",
        "outfit_natlang": "a frilled pink blouse, a black suspender skirt with high waist, a black ribbon bow at the chest, a heart choker, a heart-shaped o-ring accessory, platform shoes, and aegyo sal makeup under the eyes",
        "slots": [
            {"slot": "tops", "item": "shirt", "color": "pink", "source_phrase": "pink_shirt"},
            {"slot": "modifiers", "item": "frilled_shirt", "color": "", "source_phrase": "frilled_shirt"},
            {"slot": "bottoms", "item": "skirt", "color": "black", "source_phrase": "suspender_skirt"},
            {"slot": "modifiers", "item": "high_waist", "color": "", "source_phrase": "high-waist_skirt"},
            {"slot": "neckwear", "item": "choker", "color": "", "source_phrase": "heart_choker"},
            {"slot": "accessories", "item": "bow", "color": "black", "source_phrase": "black_bow"},
            {"slot": "accessories", "item": "o-ring", "color": "", "source_phrase": "heart_o-ring"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "platform_shoes"},
            {"slot": "modifiers", "item": "makeup", "color": "", "source_phrase": "aegyo_sal"},
        ],
    },
    {
        "name": "Harem Outfit",
        "aliases": "harem,harem outfit,harem clothes,bellydancer outfit,belly dancer outfit,genie outfit,1001 nights dancer outfit,arabian dancer outfit",
        "outfit_tags": "mouth_veil, see-through_veil, bandeau, harem_pants, see-through_pelvic_curtain, circlet, armlet, thighlet, anklet, gold_sandals, (harem_outfit:1.1)",
        "outfit_natlang": "a sheer veil over the mouth and a flowing see-through veil from the head, a jeweled bandeau top baring the midriff, sheer billowing harem pants under a see-through pelvic curtain, a gold circlet across the brow, gold armlets on the upper arms, thighlets, anklets, and gold sandals",
        "slots": [
            {"slot": "headwear", "item": "circlet", "color": "", "source_phrase": "circlet"},
            {"slot": "headwear", "item": "veil", "color": "", "source_phrase": "see-through_veil"},
            {"slot": "neckwear", "item": "veil", "color": "", "source_phrase": "mouth_veil"},
            {"slot": "tops", "item": "bandeau", "color": "", "source_phrase": "bandeau"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "harem_pants"},
            {"slot": "accessories", "item": "pelvic_curtain", "color": "", "source_phrase": "see-through_pelvic_curtain"},
            {"slot": "accessories", "item": "armlet", "color": "", "source_phrase": "armlet"},
            {"slot": "accessories", "item": "thighlet", "color": "", "source_phrase": "thighlet"},
            {"slot": "accessories", "item": "anklet", "color": "", "source_phrase": "anklet"},
            {"slot": "footwear", "item": "sandals", "color": "gold", "source_phrase": "gold_sandals"},
        ],
    },
    {
        "name": "Kindergarten Uniform",
        "aliases": "kindergarten uniform,kindergarten outfit,preschool uniform,japanese kindergarten uniform,smock uniform,kindergarten smock,youchien uniform,kindergartener outfit",
        "outfit_tags": "(kindergarten_uniform:1.1), school_hat, smock, name_tag, kindergarten_bag",
        "outfit_natlang": "a yellow school hat, a colored smock over a long-sleeved blouse, a name tag pinned to the chest, and a yellow kindergarten bag",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "school_hat"},
            {"slot": "tops", "item": "smock", "color": "", "source_phrase": "smock"},
            {"slot": "accessories", "item": "name_tag", "color": "", "source_phrase": "name_tag"},
            {"slot": "accessories", "item": "bag", "color": "", "source_phrase": "kindergarten_bag"},
        ],
    },
    {
        "name": "Magical Girl",
        "aliases": "magical girl,magical girl outfit,magical girl costume,mahou shoujo,mahou shoujo outfit,magical girl cosplay,magical girl uniform",
        "outfit_tags": "(magical_girl:1.1), tiara, frilled_dress, puffy_sleeves, detached_collar, brooch, elbow_gloves, white_thighhighs, knee_boots, cape, choker, hair_ribbon, wand",
        "outfit_natlang": "a tiara, a frilled dress with puffy sleeves, a detached collar at the neck with a transformation brooch, elbow-length white gloves, white thighhighs, knee-high boots, a small cape draped behind, a choker, hair ribbons, and a magic wand held in hand",
        "slots": [
            {"slot": "headwear", "item": "tiara", "color": "", "source_phrase": "tiara"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "frilled_dress"},
            {"slot": "modifiers", "item": "puffy_sleeves", "color": "", "source_phrase": "puffy_sleeves"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "detached_collar"},
            {"slot": "accessories", "item": "brooch", "color": "", "source_phrase": "brooch"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "elbow_gloves"},
            {"slot": "legwear", "item": "thighhighs", "color": "white", "source_phrase": "white_thighhighs"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "knee_boots"},
            {"slot": "accessories", "item": "cape", "color": "", "source_phrase": "cape"},
            {"slot": "neckwear", "item": "choker", "color": "", "source_phrase": "choker"},
            {"slot": "accessories", "item": "ribbon", "color": "", "source_phrase": "hair_ribbon"},
            {"slot": "accessories", "item": "wand", "color": "", "source_phrase": "wand"},
        ],
    },
    {
        "name": "Latex Bodysuit",
        "aliases": "latex bodysuit,latex bodysuit outfit,latex suit,shiny latex bodysuit,black latex bodysuit,latex catsuit outfit,rubber bodysuit,latex fetish suit",
        "outfit_tags": "(latex_bodysuit:1.1), latex_gloves, shiny_clothes, skin_tight",
        "outfit_natlang": "a shiny black latex bodysuit clinging to the body like a second skin, latex gloves, with an overall glossy skin-tight look",
        "slots": [
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "latex_bodysuit"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "latex_gloves"},
            {"slot": "modifiers", "item": "shiny", "color": "", "source_phrase": "shiny_clothes"},
            {"slot": "modifiers", "item": "skin_tight", "color": "", "source_phrase": "skin_tight"},
        ],
    },
    {
        "name": "Military Combat Uniform",
        "aliases": "military combat uniform,combat uniform,combat fatigues,battle dress uniform,bdu,military combat outfit,combat military outfit,soldier outfit",
        "outfit_tags": "combat_helmet, camouflage_jacket, bulletproof_vest, camouflage_pants, combat_boots, ammunition_pouch, military_fatigues, (military_combat_uniform:1.1)",
        "outfit_natlang": "a combat helmet, a camouflage jacket under a bulletproof vest with ammunition pouches, camouflage pants, and combat boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "combat_helmet"},
            {"slot": "tops", "item": "jacket", "color": "camouflage", "source_phrase": "camouflage_jacket"},
            {"slot": "tops", "item": "vest", "color": "", "source_phrase": "bulletproof_vest"},
            {"slot": "bottoms", "item": "pants", "color": "camouflage", "source_phrase": "camouflage_pants"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "combat_boots"},
            {"slot": "accessories", "item": "pouch", "color": "", "source_phrase": "ammunition_pouch"},
            {"slot": "modifiers", "item": "fatigues", "color": "", "source_phrase": "military_fatigues"},
        ],
    },
    {
        "name": "Kita High School Uniform",
        "aliases": "kita high school uniform, kita high uniform, shuka high school uniform, shuka high uniform, bocchi the rock school uniform, kita ikuyo uniform",
        "outfit_tags": "sailor_collar, brown_shirt, red_bow, grey_skirt, pleated_skirt, black_pantyhose, loafers, shuka_high_school_uniform",
        "outfit_natlang": "a sailor collar with a red bow at the chest, a long-sleeved brown shirt, a short grey pleated skirt, black pantyhose, and brown loafers",
        "slots": [
            {"slot": "modifiers", "item": "collar", "color": "", "source_phrase": "sailor_collar"},
            {"slot": "tops", "item": "shirt", "color": "brown", "source_phrase": "brown_shirt"},
            {"slot": "neckwear", "item": "bow", "color": "red", "source_phrase": "red_bow"},
            {"slot": "bottoms", "item": "skirt", "color": "grey", "source_phrase": "grey_skirt"},
            {"slot": "modifiers", "item": "skirt", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "legwear", "item": "pantyhose", "color": "black", "source_phrase": "black_pantyhose"},
            {"slot": "footwear", "item": "loafers", "color": "", "source_phrase": "loafers"},
        ],
    },
    {
        "name": "Onesie",
        "aliases": "onesie,onesie outfit,onesie pajamas,jumpsuit pajamas,hooded onesie,animal onesie,adult onesie",
        "outfit_tags": "animal_hood, hood_up, (onesie:1.1), pajamas, slippers",
        "outfit_natlang": "an animal-print hood pulled up over the head, a loose one-piece onesie pajama jumpsuit zipped up the front, and soft slippers on the feet",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "animal_hood"},
            {"slot": "modifiers", "item": "hood_up", "color": "", "source_phrase": "hood_up"},
            {"slot": "dresses", "item": "onesie", "color": "", "source_phrase": "onesie"},
            {"slot": "modifiers", "item": "pajamas", "color": "", "source_phrase": "pajamas"},
            {"slot": "footwear", "item": "slippers", "color": "", "source_phrase": "slippers"},
        ],
    },
    {
        "name": "Maid Bikini",
        "aliases": "maid bikini,maid swimsuit,bikini maid,swimwear maid,beach maid,maid bikini outfit",
        "outfit_tags": "maid_headdress, detached_collar, (maid_bikini:1.1), maid_apron, white_apron, frilled_apron, wrist_cuffs",
        "outfit_natlang": "a maid headdress, a detached frilled collar, a maid bikini, a frilly white apron over the bikini, and wrist cuffs",
        "slots": [
            {"slot": "headwear", "item": "headdress", "color": "", "source_phrase": "maid_headdress"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "detached_collar"},
            {"slot": "tops", "item": "bikini", "color": "", "source_phrase": "maid_bikini"},
            {"slot": "tops", "item": "apron", "color": "", "source_phrase": "maid_apron"},
            {"slot": "tops", "item": "apron", "color": "white", "source_phrase": "white_apron"},
            {"slot": "modifiers", "item": "frilled_apron", "color": "", "source_phrase": "frilled_apron"},
            {"slot": "accessories", "item": "wrist_cuffs", "color": "", "source_phrase": "wrist_cuffs"},
        ],
    },
    {
        "name": "Naked Tabard",
        "aliases": "naked tabard,nude tabard,tabard only,only a tabard,bare tabard",
        "outfit_tags": "(naked_tabard:1.1), (tabard:1.1), thighhighs, gloves, sideboob",
        "outfit_natlang": "a tabard worn over an otherwise bare body with the sides open exposing sideboob and hips, paired with thighhighs and gloves",
        "slots": [
            {"slot": "tops", "item": "tabard", "color": "", "source_phrase": "tabard"},
            {"slot": "legwear", "item": "thighhighs", "color": "", "source_phrase": "thighhighs"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "modifiers", "item": "sideboob", "color": "", "source_phrase": "sideboob"},
        ],
    },
    {
        "name": "Pilot Suit",
        "aliases": "pilot suit, pilot outfit, fighter pilot suit, fighter pilot outfit, aviator suit, jet pilot suit, jet pilot outfit, top gun outfit",
        "outfit_tags": "pilot_helmet, oxygen_mask, (pilot_suit:1.1), bodysuit, harness, gloves, boots",
        "outfit_natlang": "a pilot helmet with an oxygen mask, a form-fitting pilot suit over a bodysuit, a torso harness, gloves, and boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "pilot_helmet"},
            {"slot": "headwear", "item": "mask", "color": "", "source_phrase": "oxygen_mask"},
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "pilot_suit"},
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "bodysuit"},
            {"slot": "accessories", "item": "harness", "color": "", "source_phrase": "harness"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
        ],
    },
    {
        "name": "Naval Uniform",
        "aliases": "naval uniform,naval officer uniform,navy uniform,navy officer outfit,naval dress uniform,naval officer outfit,naval cosplay",
        "outfit_tags": "peaked_cap, white_jacket, epaulettes, aiguillette, white_gloves, white_pants, (naval_uniform:1.1)",
        "outfit_natlang": "a white peaked cap with a naval insignia, a double-breasted white officer jacket with gold epaulettes and an aiguillette over the shoulder, white gloves, and white dress trousers",
        "slots": [
            {"slot": "headwear", "item": "cap", "color": "", "source_phrase": "peaked_cap"},
            {"slot": "tops", "item": "jacket", "color": "white", "source_phrase": "white_jacket"},
            {"slot": "accessories", "item": "epaulettes", "color": "", "source_phrase": "epaulettes"},
            {"slot": "accessories", "item": "aiguillette", "color": "", "source_phrase": "aiguillette"},
            {"slot": "handwear", "item": "gloves", "color": "white", "source_phrase": "white_gloves"},
            {"slot": "bottoms", "item": "pants", "color": "white", "source_phrase": "white_pants"},
        ],
    },
    {
        "name": "Police Uniform",
        "aliases": "police uniform,police outfit,policewoman outfit,policeman outfit,cop uniform,cop outfit,officer uniform,police cosplay",
        "outfit_tags": "police_hat, white_shirt, black_necktie, blue_jacket, pencil_skirt, sam_browne_belt, police_badge, handcuffs",
        "outfit_natlang": "a blue police peaked cap, a white collared shirt with a black necktie, a dark blue police jacket, a pencil skirt, a sam browne belt across the torso, a police badge, and handcuffs at the hip",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "police_hat"},
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "tops", "item": "jacket", "color": "blue", "source_phrase": "blue_jacket"},
            {"slot": "neckwear", "item": "necktie", "color": "black", "source_phrase": "black_necktie"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pencil_skirt"},
            {"slot": "accessories", "item": "belt", "color": "", "source_phrase": "sam_browne_belt"},
            {"slot": "accessories", "item": "badge", "color": "", "source_phrase": "police_badge"},
            {"slot": "accessories", "item": "handcuffs", "color": "", "source_phrase": "handcuffs"},
        ],
    },
    {
        "name": "Race Queen",
        "aliases": "race queen,race queen outfit,racequeen,racequeen outfit,race girl,grid girl,booth babe outfit,promotional model outfit",
        "outfit_tags": "(race_queen:1.1), highleg_leotard, elbow_gloves, thighhighs, thigh_boots",
        "outfit_natlang": "a high-leg leotard cut to expose the hips, elbow-length gloves, sheer thighhighs, and tall thigh-high boots",
        "slots": [
            {"slot": "tops", "item": "leotard", "color": "", "source_phrase": "highleg_leotard"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "elbow_gloves"},
            {"slot": "legwear", "item": "thighhighs", "color": "", "source_phrase": "thighhighs"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "thigh_boots"},
        ],
    },
    {
        "name": "Prison Clothes",
        "aliases": "prison,prison clothes,prison uniform,prisoner,prisoner outfit,inmate,inmate uniform,jail uniform",
        "outfit_tags": "striped_headwear, striped_shirt, striped_pants, orange_jumpsuit, (prison_clothes:1.1), handcuffs, shackles, ball_and_chain_restraint",
        "outfit_natlang": "a black-and-white striped shirt and matching striped pants (or alternately an orange jumpsuit), with handcuffs at the wrists and shackles around the ankles",
        "slots": [
            {"slot": "headwear", "item": "cap", "color": "striped", "source_phrase": "striped_headwear"},
            {"slot": "tops", "item": "shirt", "color": "striped", "source_phrase": "striped_shirt"},
            {"slot": "bottoms", "item": "pants", "color": "striped", "source_phrase": "striped_pants"},
            {"slot": "tops", "item": "jumpsuit", "color": "orange", "source_phrase": "orange_jumpsuit"},
            {"slot": "accessories", "item": "handcuffs", "color": "", "source_phrase": "handcuffs"},
            {"slot": "accessories", "item": "shackles", "color": "", "source_phrase": "shackles"},
            {"slot": "accessories", "item": "ball_and_chain", "color": "", "source_phrase": "ball_and_chain_restraint"},
        ],
    },
    {
        "name": "Mummy",
        "aliases": "mummy,mummy costume,mummy outfit,mummy cosplay,mummy wrap,bandage mummy,halloween mummy,bandaged mummy",
        "outfit_tags": "bandaged_head, naked_bandage, bandages, bandaged_arm, bandaged_leg, torn_bandages, (mummy_costume:1.1), halloween_costume",
        "outfit_natlang": "bandages wrapped around the head, naked bandages wound across the entire body, bandaged arms, bandaged legs, and torn trailing bandage strips",
        "slots": [
            {"slot": "headwear", "item": "bandages", "color": "", "source_phrase": "bandaged_head"},
            {"slot": "tops", "item": "bandages", "color": "", "source_phrase": "naked_bandage"},
            {"slot": "handwear", "item": "bandages", "color": "", "source_phrase": "bandaged_arm"},
            {"slot": "legwear", "item": "bandages", "color": "", "source_phrase": "bandaged_leg"},
            {"slot": "accessories", "item": "bandages", "color": "torn", "source_phrase": "torn_bandages"},
            {"slot": "accessories", "item": "costume", "color": "", "source_phrase": "halloween_costume"},
        ],
    },
    {
        "name": "Otonokizaka School Uniform",
        "aliases": "otonokizaka,otonokizaka uniform,otonokizaka school uniform,love live school uniform,otonokizaka cosplay,muse uniform",
        "outfit_tags": "(otonokizaka_school_uniform:1.1), blue_jacket, sweater_vest, white_shirt, dress_shirt, blue_skirt, pleated_skirt, plaid_skirt, diagonal-striped_bowtie, loafers",
        "outfit_natlang": "dark blue blazer over pale yellow sweater vest, white collared shirt, pleated blue striped skirt with colored ribbon (blue/maroon/green by year)",
        "slots": [
            {"slot": "tops", "item": "blazer", "color": "blue", "source_phrase": "blue_jacket"},
            {"slot": "tops", "item": "sweater_vest", "color": "", "source_phrase": "sweater_vest"},
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "dress_shirt"},
            {"slot": "bottoms", "item": "skirt", "color": "blue", "source_phrase": "blue_skirt"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "bottoms", "item": "skirt", "color": "plaid", "source_phrase": "plaid_skirt"},
            {"slot": "neckwear", "item": "bowtie", "color": "diagonal-striped", "source_phrase": "diagonal-striped_bowtie"},
            {"slot": "footwear", "item": "loafers", "color": "", "source_phrase": "loafers"},
        ],
    },
    {
        "name": "Roswaal Mansion Maid Uniform",
        "aliases": "roswaal mansion maid uniform,roswaal maid uniform,roswaal mansion maid,re:zero maid uniform,rezero maid uniform,rem maid uniform,ram maid uniform",
        "outfit_tags": "maid_headdress, detached_collar, white_apron, black_dress, detached_sleeves, purple_ribbon, white_thighhighs",
        "outfit_natlang": "a maid headdress, a detached white collar, a white apron over a black dress with detached sleeves, a purple ribbon, and white thighhighs",
        "slots": [
            {"slot": "headwear", "item": "headdress", "color": "", "source_phrase": "maid_headdress"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "detached_collar"},
            {"slot": "dresses", "item": "dress", "color": "black", "source_phrase": "black_dress"},
            {"slot": "tops", "item": "apron", "color": "white", "source_phrase": "white_apron"},
            {"slot": "handwear", "item": "sleeves", "color": "", "source_phrase": "detached_sleeves"},
            {"slot": "accessories", "item": "ribbon", "color": "purple", "source_phrase": "purple_ribbon"},
            {"slot": "legwear", "item": "thighhighs", "color": "white", "source_phrase": "white_thighhighs"},
        ],
    },
    {
        "name": "Sailor Senshi Uniform",
        "aliases": "sailor senshi uniform,sailor senshi outfit,sailor moon uniform,sailor moon outfit,sailor scout uniform,sailor scout outfit,senshi uniform,bishoujo senshi outfit",
        "outfit_tags": "(sailor_senshi_uniform:1.1), circlet, sailor_collar, white_leotard, pleated_skirt, elbow_gloves, knee_boots, choker, brooch, crescent_earrings, back_bow",
        "outfit_natlang": "a circlet on the forehead, a sailor collar over a white leotard with a pleated skirt over the waist, a chest bow with a transformation brooch, white elbow-length gloves, knee-high boots, a choker, crescent earrings, and a back bow at the waist",
        "slots": [
            {"slot": "headwear", "item": "circlet", "color": "", "source_phrase": "circlet"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "sailor_collar"},
            {"slot": "tops", "item": "leotard", "color": "white", "source_phrase": "white_leotard"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "elbow_gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "knee_boots"},
            {"slot": "neckwear", "item": "choker", "color": "", "source_phrase": "choker"},
            {"slot": "accessories", "item": "brooch", "color": "", "source_phrase": "brooch"},
            {"slot": "accessories", "item": "earrings", "color": "", "source_phrase": "crescent_earrings"},
            {"slot": "accessories", "item": "bow", "color": "", "source_phrase": "back_bow"},
        ],
    },
    {
        "name": "Ouji Fashion",
        "aliases": "ouji,ouji fashion,ouji outfit,kodona,kodona fashion,boy lolita,prince fashion",
        "outfit_tags": "(ouji_fashion:1.1), top_hat, tailcoat, frilled_shirt, ascot, epaulettes, gloves, shorts, kneehighs, knee_boots",
        "outfit_natlang": "a top hat, a tailcoat with epaulettes over a frilled shirt, an ascot at the collar, gloves, short pants, kneehighs, and knee-high boots",
        "slots": [
            {"slot": "headwear", "item": "top hat", "color": "", "source_phrase": "top_hat"},
            {"slot": "tops", "item": "tailcoat", "color": "", "source_phrase": "tailcoat"},
            {"slot": "tops", "item": "frilled shirt", "color": "", "source_phrase": "frilled_shirt"},
            {"slot": "neckwear", "item": "ascot", "color": "", "source_phrase": "ascot"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "bottoms", "item": "shorts", "color": "", "source_phrase": "shorts"},
            {"slot": "legwear", "item": "kneehighs", "color": "", "source_phrase": "kneehighs"},
            {"slot": "footwear", "item": "knee boots", "color": "", "source_phrase": "knee_boots"},
            {"slot": "accessories", "item": "epaulettes", "color": "", "source_phrase": "epaulettes"},
        ],
    },
    {
        "name": "Santa Dress",
        "aliases": "santa dress, santa dress outfit, christmas dress, mrs claus dress, santa girl dress, santa cosplay dress",
        "outfit_tags": "santa_hat, fur-trimmed_capelet, fur-trimmed_dress, red_dress, fur-trimmed_gloves, fur-trimmed_boots, (santa_costume:1.1)",
        "outfit_natlang": "a santa hat, a fur-trimmed red capelet over a fur-trimmed red dress, fur-trimmed gloves, and fur-trimmed boots",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "santa", "source_phrase": "santa_hat"},
            {"slot": "dresses", "item": "dress", "color": "fur-trimmed", "source_phrase": "fur-trimmed_dress"},
            {"slot": "dresses", "item": "dress", "color": "red", "source_phrase": "red_dress"},
            {"slot": "handwear", "item": "gloves", "color": "fur-trimmed", "source_phrase": "fur-trimmed_gloves"},
            {"slot": "footwear", "item": "boots", "color": "fur-trimmed", "source_phrase": "fur-trimmed_boots"},
            {"slot": "accessories", "item": "capelet", "color": "fur-trimmed", "source_phrase": "fur-trimmed_capelet"},
        ],
    },
    {
        "name": "Reindeer Costume",
        "aliases": "reindeer costume,reindeer cosplay,reindeer kigurumi,reindeer outfit,christmas reindeer costume,rudolph costume,reindeer suit",
        "outfit_tags": "reindeer_antlers, fur-trimmed_dress, brown_gloves, brown_thighhighs, jingle_bell, (reindeer_costume:1.1)",
        "outfit_natlang": "reindeer antlers on the head, a fur-trimmed brown dress, brown gloves, brown thighhighs, and a jingle bell at the neck, all part of a full reindeer costume",
        "slots": [
            {"slot": "headwear", "item": "antlers", "color": "", "source_phrase": "reindeer_antlers"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "fur-trimmed_dress"},
            {"slot": "handwear", "item": "gloves", "color": "brown", "source_phrase": "brown_gloves"},
            {"slot": "legwear", "item": "thighhighs", "color": "brown", "source_phrase": "brown_thighhighs"},
            {"slot": "neckwear", "item": "bell", "color": "", "source_phrase": "jingle_bell"},
        ],
    },
    {
        "name": "Power Armor",
        "aliases": "power armor,power armor outfit,power armor cosplay,powered armor,power armour,powered exoskeleton,exoskeleton armor,space marine armor",
        "outfit_tags": "helmet, faceplate, (power_armor:1.1), pauldrons, breastplate, gauntlets, greaves, armored_boots",
        "outfit_natlang": "an enclosed helmet with a faceplate, a bulky power armor exoskeleton with heavy pauldrons over a reinforced breastplate, articulated gauntlets, segmented greaves on the legs, and armored boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "helmet"},
            {"slot": "headwear", "item": "faceplate", "color": "", "source_phrase": "faceplate"},
            {"slot": "tops", "item": "armor", "color": "", "source_phrase": "power_armor"},
            {"slot": "tops", "item": "breastplate", "color": "", "source_phrase": "breastplate"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "legwear", "item": "greaves", "color": "", "source_phrase": "greaves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "armored_boots"},
        ],
    },
    {
        "name": "Spacesuit",
        "aliases": "spacesuit, space suit, astronaut suit, astronaut outfit, astronaut costume, space exploration suit, eva suit",
        "outfit_tags": "space_helmet, (spacesuit:1.1), gloves, oxygen_tank, boots",
        "outfit_natlang": "a rounded space helmet, a pressurized full-body spacesuit, gloves, an oxygen tank on the back, and boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "space_helmet"},
            {"slot": "tops", "item": "spacesuit", "color": "", "source_phrase": "spacesuit"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "accessories", "item": "oxygen_tank", "color": "", "source_phrase": "oxygen_tank"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
        ],
    },
    {
        "name": "Superhero Costume",
        "aliases": "superhero,superhero costume,superhero outfit,supervillain,supervillain costume,superhero cosplay,super hero costume",
        "outfit_tags": "(superhero_costume:1.1), domino_mask, cape, bodysuit, gloves, boots",
        "outfit_natlang": "a domino mask, a flowing cape, a skin-tight bodysuit, gloves, and boots",
        "slots": [
            {"slot": "headwear", "item": "mask", "color": "", "source_phrase": "domino_mask"},
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "bodysuit"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "accessories", "item": "cape", "color": "", "source_phrase": "cape"},
        ],
    },
    {
        "name": "Skirt Suit",
        "aliases": "skirt suit,skirtsuit,office lady suit,women's business suit,ladies suit,office skirt suit,formal skirt suit",
        "outfit_tags": "suit_jacket, dress_shirt, necktie, pencil_skirt, pantyhose, high_heels, (skirt_suit:1.1)",
        "outfit_natlang": "a tailored suit jacket over a dress shirt, a necktie, a pencil skirt, sheer pantyhose, and high heels",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "suit_jacket"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "dress_shirt"},
            {"slot": "neckwear", "item": "necktie", "color": "", "source_phrase": "necktie"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pencil_skirt"},
            {"slot": "legwear", "item": "pantyhose", "color": "", "source_phrase": "pantyhose"},
            {"slot": "footwear", "item": "heels", "color": "", "source_phrase": "high_heels"},
        ],
    },
    {
        "name": "Straitjacket",
        "aliases": "straitjacket,straitjacket outfit,straight jacket,straightjacket,asylum outfit,asylum patient,mental hospital patient,bound arms outfit",
        "outfit_tags": "(straitjacket:1.1), long_sleeves, buckle, bound_arms",
        "outfit_natlang": "a white straitjacket with long oversized sleeves wrapped around the body and buckled at the back, binding both arms",
        "slots": [
            {"slot": "tops", "item": "straitjacket", "color": "", "source_phrase": "straitjacket"},
            {"slot": "modifiers", "item": "long_sleeves", "color": "", "source_phrase": "long_sleeves"},
            {"slot": "accessories", "item": "buckle", "color": "", "source_phrase": "buckle"},
            {"slot": "modifiers", "item": "bound_arms", "color": "", "source_phrase": "bound_arms"},
        ],
    },
    {
        "name": "Soccer Uniform",
        "aliases": "soccer uniform,soccer outfit,soccer kit,football kit,football uniform,football outfit,soccer player outfit,soccer cosplay",
        "outfit_tags": "(soccer_uniform:1.1), shirt, shorts, kneehighs, cleats, soccer_ball",
        "outfit_natlang": "an athletic short-sleeved soccer jersey, athletic shorts, knee-high socks pulled up over shin guards, cleats on the feet, and a soccer ball as a prop",
        "slots": [
            {"slot": "tops", "item": "jersey", "color": "", "source_phrase": "shirt"},
            {"slot": "bottoms", "item": "shorts", "color": "", "source_phrase": "shorts"},
            {"slot": "legwear", "item": "kneehighs", "color": "", "source_phrase": "kneehighs"},
            {"slot": "footwear", "item": "cleats", "color": "", "source_phrase": "cleats"},
            {"slot": "accessories", "item": "soccer_ball", "color": "", "source_phrase": "soccer_ball"},
        ],
    },
    {
        "name": "Power Suit",
        "aliases": "power suit,power suit metroid,samus power suit,samus armor,samus suit,metroid power suit,varia suit",
        "outfit_tags": "power_suit_(metroid), helmet, assault_visor, (power_armor:1.1), pauldrons, gauntlets, arm_cannon, armored_boots",
        "outfit_natlang": "a Metroid-style power suit helmet with an assault visor, full-body orange power armor plating, large spherical pauldrons, an arm cannon mounted on one arm with armored gauntlets, and armored boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "helmet"},
            {"slot": "modifiers", "item": "assault_visor", "color": "", "source_phrase": "assault_visor"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "accessories", "item": "arm_cannon", "color": "", "source_phrase": "arm_cannon"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "armored_boots"},
        ],
    },
    {
        "name": "Tokiwadai School Uniform",
        "aliases": "tokiwadai uniform,tokiwadai school uniform,tokiwadai middle school uniform,railgun uniform,toaru school uniform,tokiwadai summer uniform,misaka mikoto uniform",
        "outfit_tags": "(tokiwadai_school_uniform:1.1), school_uniform, white_shirt, collared_shirt, short_sleeves, brown_sweater_vest, grey_skirt, pleated_skirt, kneehighs, loafers",
        "outfit_natlang": "Tokiwadai Middle School summer uniform with a white short-sleeved collared blouse, a brown v-neck sweater vest with the school emblem, a grey pleated miniskirt, white kneehighs, and brown loafers",
        "slots": [
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "tops", "item": "sweater_vest", "color": "brown", "source_phrase": "brown_sweater_vest"},
            {"slot": "bottoms", "item": "skirt", "color": "grey", "source_phrase": "grey_skirt"},
            {"slot": "legwear", "item": "kneehighs", "color": "white", "source_phrase": "kneehighs"},
            {"slot": "footwear", "item": "loafers", "color": "", "source_phrase": "loafers"},
            {"slot": "modifiers", "item": "short_sleeves", "color": "", "source_phrase": "short_sleeves"},
            {"slot": "modifiers", "item": "pleated_skirt", "color": "", "source_phrase": "pleated_skirt"},
        ],
    },
    {
        "name": "Tactical Clothes",
        "aliases": "tactical clothes,tactical gear,tactical outfit,tactical loadout,operator gear,swat gear,tactical uniform,military operator outfit",
        "outfit_tags": "fast_helmet, balaclava, combat_shirt, bulletproof_vest, chest_rig, cargo_pants, combat_boots, tactical_gloves, thigh_holster, (tactical_clothes:1.1)",
        "outfit_natlang": "a fast helmet over a balaclava, a combat shirt under a bulletproof vest with a chest rig of pouches, cargo pants, combat boots, tactical gloves, and a thigh holster",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "fast_helmet"},
            {"slot": "headwear", "item": "balaclava", "color": "", "source_phrase": "balaclava"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "combat_shirt"},
            {"slot": "tops", "item": "vest", "color": "", "source_phrase": "bulletproof_vest"},
            {"slot": "accessories", "item": "chest_rig", "color": "", "source_phrase": "chest_rig"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "cargo_pants"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "combat_boots"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "tactical_gloves"},
            {"slot": "accessories", "item": "holster", "color": "", "source_phrase": "thigh_holster"},
        ],
    },
    {
        "name": "Sweet Lolita",
        "aliases": "sweet lolita,sweet lolita fashion,sweet lolita outfit,sweet lolita dress,sweet loli,amaloli,ama loli,sweet lolita coord",
        "outfit_tags": "(sweet_lolita:1.1), lolita_hairband, frilled_dress, pink_dress, puffy_sleeves, lace_trim, petticoat, kneehighs, mary_janes, pink_bow, pastel_colors",
        "outfit_natlang": "a lolita hairband with a pink bow, a pastel pink frilled dress with puffy sleeves and lace trim, a petticoat underneath, white kneehighs, and mary jane shoes",
        "slots": [
            {"slot": "headwear", "item": "hairband", "color": "", "source_phrase": "lolita_hairband"},
            {"slot": "dresses", "item": "dress", "color": "pink", "source_phrase": "pink_dress"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "frilled_dress"},
            {"slot": "dresses", "item": "petticoat", "color": "", "source_phrase": "petticoat"},
            {"slot": "legwear", "item": "kneehighs", "color": "", "source_phrase": "kneehighs"},
            {"slot": "footwear", "item": "mary janes", "color": "", "source_phrase": "mary_janes"},
            {"slot": "accessories", "item": "bow", "color": "pink", "source_phrase": "pink_bow"},
            {"slot": "modifiers", "item": "puffy sleeves", "color": "", "source_phrase": "puffy_sleeves"},
            {"slot": "modifiers", "item": "lace trim", "color": "", "source_phrase": "lace_trim"},
            {"slot": "modifiers", "item": "pastel", "color": "", "source_phrase": "pastel_colors"},
        ],
    },
    {
        "name": "Tennis Uniform",
        "aliases": "tennis uniform,tennis outfit,tennis wear,tennis attire,tennis player outfit,tennis cosplay,tennis kit",
        "outfit_tags": "visor_cap, (tennis_uniform:1.1), polo_shirt, tennis_skirt, wristband, sneakers",
        "outfit_natlang": "a visor cap, a short-sleeved polo-style athletic top, a pleated tennis skirt or short shorts, wristbands, and white athletic sneakers",
        "slots": [
            {"slot": "headwear", "item": "visor", "color": "", "source_phrase": "visor_cap"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "polo_shirt"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "tennis_skirt"},
            {"slot": "footwear", "item": "sneakers", "color": "", "source_phrase": "sneakers"},
            {"slot": "accessories", "item": "wristband", "color": "", "source_phrase": "wristband"},
        ],
    },
    {
        "name": "Tracen Swimsuit",
        "aliases": "tracen swimsuit,tracen academy swimsuit,uma musume swimsuit,umamusume swimsuit,horse girl swimsuit,tracen school swimsuit,tracen competition swimsuit",
        "outfit_tags": "(tracen_swimsuit:1.1), blue_one-piece_swimsuit, competition_school_swimsuit, single_vertical_stripe, covered_navel",
        "outfit_natlang": "a Tracen Academy blue one-piece competition school swimsuit with thin white shoulder straps, a single white vertical stripe down each side, and a covered navel",
        "slots": [
            {"slot": "tops", "item": "swimsuit", "color": "", "source_phrase": "tracen_swimsuit"},
            {"slot": "tops", "item": "one-piece", "color": "blue", "source_phrase": "blue_one-piece_swimsuit"},
            {"slot": "modifiers", "item": "competition_school_swimsuit", "color": "", "source_phrase": "competition_school_swimsuit"},
            {"slot": "modifiers", "item": "stripe", "color": "", "source_phrase": "single_vertical_stripe"},
            {"slot": "modifiers", "item": "covered_navel", "color": "", "source_phrase": "covered_navel"},
        ],
    },
    {
        "name": "Shark Costume",
        "aliases": "shark costume,shark cosplay,shark hoodie,shark hoodie outfit,shark onesie,shark kigurumi,shark outfit,gura hoodie",
        "outfit_tags": "shark_hood, blue_hoodie, (shark_costume:1.1)",
        "outfit_natlang": "a shark hood with sharp teeth and fins on top, worn over a blue hoodie, as part of a shark costume",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "shark_hood"},
            {"slot": "tops", "item": "hoodie", "color": "blue", "source_phrase": "blue_hoodie"},
        ],
    },
    {
        "name": "Taimanin Suit",
        "aliases": "taimanin suit, taimanin outfit, taimanin bodysuit, taimanin uniform, taimanin ninja suit, taimanin cosplay",
        "outfit_tags": "(taimanin_suit:1.1), black_bodysuit, cleavage_cutout, elbow_gloves, fishnets, thigh_boots",
        "outfit_natlang": "a skintight black bodysuit with a cleavage cutout, black elbow gloves, fishnet pantyhose, and black thigh-high boots",
        "slots": [
            {"slot": "tops", "item": "bodysuit", "color": "black", "source_phrase": "black_bodysuit"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "elbow_gloves"},
            {"slot": "legwear", "item": "fishnets", "color": "", "source_phrase": "fishnets"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "thigh_boots"},
            {"slot": "modifiers", "item": "cutout", "color": "", "source_phrase": "cleavage_cutout"},
            {"slot": "accessories", "item": "suit", "color": "", "source_phrase": "taimanin_suit"},
        ],
    },
    {
        "name": "Track Uniform",
        "aliases": "track uniform,track and field uniform,track outfit,track suit,running uniform,athletics uniform,track team uniform",
        "outfit_tags": "(track_uniform:1.1), sports_bra, buruma, sneakers, race_bib",
        "outfit_natlang": "an athletic track and field uniform with a sports bra, buruma shorts, sneakers, and a race bib pinned to the chest",
        "slots": [
            {"slot": "tops", "item": "sports_bra", "color": "", "source_phrase": "sports_bra"},
            {"slot": "bottoms", "item": "buruma", "color": "", "source_phrase": "buruma"},
            {"slot": "footwear", "item": "sneakers", "color": "", "source_phrase": "sneakers"},
            {"slot": "accessories", "item": "race_bib", "color": "", "source_phrase": "race_bib"},
        ],
    },
    {
        "name": "Tracen Training Uniform",
        "aliases": "tracen training uniform, tracen uniform, tracen training outfit, uma musume training uniform, umamusume training outfit, tracen academy gym uniform",
        "outfit_tags": "(tracen_training_uniform:1.1), track_jacket, gym_shirt, red_shorts, red_buruma, white_shoes",
        "outfit_natlang": "a red and white track jacket over a white gym shirt, red shorts or red buruma, and white shoes",
        "slots": [
            {"slot": "tops", "item": "track jacket", "color": "", "source_phrase": "track_jacket"},
            {"slot": "tops", "item": "gym shirt", "color": "", "source_phrase": "gym_shirt"},
            {"slot": "bottoms", "item": "shorts", "color": "red", "source_phrase": "red_shorts"},
            {"slot": "bottoms", "item": "buruma", "color": "red", "source_phrase": "red_buruma"},
            {"slot": "footwear", "item": "shoes", "color": "white", "source_phrase": "white_shoes"},
        ],
    },
    {
        "name": "Turtleneck Leotard",
        "aliases": "turtleneck leotard,turtleneck leotard outfit,high collar leotard,turtleneck bodysuit,turtle neck leotard,leotard with turtleneck",
        "outfit_tags": "(turtleneck_leotard:1.1), (leotard:1.1)",
        "outfit_natlang": "a form-fitting one-piece leotard with a high turtleneck collar covering the neck",
        "slots": [
            {"slot": "tops", "item": "leotard", "color": "", "source_phrase": "turtleneck_leotard"},
        ],
    },
    {
        "name": "Uchikake",
        "aliases": "uchikake,uchikake outfit,wedding kimono,wedding kimono outfit,japanese wedding outfit,japanese wedding dress,bridal kimono,shiromuku",
        "outfit_tags": "wataboushi, (uchikake:1.1), white_kimono, obi, wide_sleeves, floral_print, tabi",
        "outfit_natlang": "a white wataboushi hood, a long trailing uchikake over-kimono with elaborate floral embroidery and wide sleeves, a white kimono underneath, an obi sash at the waist, and white tabi socks",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "wataboushi"},
            {"slot": "dresses", "item": "uchikake", "color": "", "source_phrase": "uchikake"},
            {"slot": "tops", "item": "kimono", "color": "white", "source_phrase": "white_kimono"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "obi"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
            {"slot": "modifiers", "item": "floral_print", "color": "", "source_phrase": "floral_print"},
            {"slot": "legwear", "item": "tabi", "color": "", "source_phrase": "tabi"},
        ],
    },
    {
        "name": "Unitard",
        "aliases": "unitard,full body unitard,long sleeve unitard,full coverage unitard,dance unitard,unitard outfit",
        "outfit_tags": "(unitard:1.1), gloves",
        "outfit_natlang": "a skin-tight unitard covering the torso, arms, and legs like a second skin, paired with gloves",
        "slots": [
            {"slot": "tops", "item": "unitard", "color": "", "source_phrase": "unitard"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
        ],
    },
    {
        "name": "Traditional Nun",
        "aliases": "traditional nun,traditional nun habit,traditional nun outfit,catholic nun,modest nun outfit,classic nun habit,convent habit",
        "outfit_tags": "(traditional_nun:1.1), nun_headdress, wimple, black_veil, guimpe, black_robe, long_sleeves, rosary",
        "outfit_natlang": "a nun headdress with a white wimple and black veil, a white guimpe covering the chest, a full-length black robe with long sleeves, and a rosary",
        "slots": [
            {"slot": "headwear", "item": "headdress", "color": "", "source_phrase": "nun_headdress"},
            {"slot": "headwear", "item": "wimple", "color": "", "source_phrase": "wimple"},
            {"slot": "headwear", "item": "veil", "color": "black", "source_phrase": "black_veil"},
            {"slot": "neckwear", "item": "guimpe", "color": "", "source_phrase": "guimpe"},
            {"slot": "dresses", "item": "robe", "color": "black", "source_phrase": "black_robe"},
            {"slot": "modifiers", "item": "long_sleeves", "color": "", "source_phrase": "long_sleeves"},
            {"slot": "accessories", "item": "rosary", "color": "", "source_phrase": "rosary"},
        ],
    },
    {
        "name": "Uranohoshi School Uniform",
        "aliases": "uranohoshi uniform, uranohoshi school uniform, love live sunshine uniform, love live sunshine school uniform, aqours school uniform, aqours uniform, uranohoshi girls high school uniform",
        "outfit_tags": "(uranohoshi_school_uniform:1.1), school_uniform, serafuku, white_shirt, short_sleeves, grey_sailor_collar, yellow_neckerchief, grey_skirt, pleated_skirt, miniskirt",
        "outfit_natlang": "a white short-sleeved sailor blouse with a grey sailor collar, a yellow neckerchief, and a grey pleated miniskirt",
        "slots": [
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "modifiers", "item": "short_sleeves", "color": "", "source_phrase": "short_sleeves"},
            {"slot": "modifiers", "item": "sailor_collar", "color": "grey", "source_phrase": "grey_sailor_collar"},
            {"slot": "neckwear", "item": "neckerchief", "color": "yellow", "source_phrase": "yellow_neckerchief"},
            {"slot": "bottoms", "item": "skirt", "color": "grey", "source_phrase": "grey_skirt"},
            {"slot": "modifiers", "item": "skirt_style", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "modifiers", "item": "skirt_length", "color": "", "source_phrase": "miniskirt"},
        ],
    },
    {
        "name": "Vampire Costume",
        "aliases": "vampire costume,vampire outfit,vampire cosplay,halloween vampire,dracula costume,vampire halloween costume",
        "outfit_tags": "bat_hair_ornament, fangs, high_collar, ascot, black_cape, fake_blood",
        "outfit_natlang": "a bat hair ornament, fangs, a high collar with an ascot, a long black cape, and smears of fake blood",
        "slots": [
            {"slot": "headwear", "item": "hair_ornament", "color": "bat", "source_phrase": "bat_hair_ornament"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "high_collar"},
            {"slot": "neckwear", "item": "ascot", "color": "", "source_phrase": "ascot"},
            {"slot": "accessories", "item": "cape", "color": "black", "source_phrase": "black_cape"},
            {"slot": "modifiers", "item": "fangs", "color": "", "source_phrase": "fangs"},
            {"slot": "modifiers", "item": "fake_blood", "color": "", "source_phrase": "fake_blood"},
        ],
    },
    {
        "name": "Waitress",
        "aliases": "waitress,waitress outfit,waitress uniform,waitress cosplay,server outfit,cafe waitress,cafe uniform,restaurant uniform",
        "outfit_tags": "frilled_hairband, dress_shirt, black_vest, waist_apron, frilled_apron, pleated_skirt, white_thighhighs, employee_uniform",
        "outfit_natlang": "a frilled hairband, a white dress shirt under a black vest, a frilled white waist apron tied over a pleated skirt, white thighhighs, and an employee uniform look",
        "slots": [
            {"slot": "headwear", "item": "hairband", "color": "", "source_phrase": "frilled_hairband"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "dress_shirt"},
            {"slot": "tops", "item": "vest", "color": "black", "source_phrase": "black_vest"},
            {"slot": "tops", "item": "apron", "color": "", "source_phrase": "waist_apron"},
            {"slot": "modifiers", "item": "frilled_apron", "color": "", "source_phrase": "frilled_apron"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "legwear", "item": "thighhighs", "color": "white", "source_phrase": "white_thighhighs"},
        ],
    },
    {
        "name": "Gym Uniform",
        "aliases": "gym uniform,gym clothes,pe uniform,physical education uniform,school gym uniform,buruma outfit,japanese gym uniform",
        "outfit_tags": "(gym_uniform:1.1), gym_shirt, buruma, name_tag",
        "outfit_natlang": "a white short-sleeved gym shirt with a name tag, and dark buruma gym shorts",
        "slots": [
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "gym_shirt"},
            {"slot": "bottoms", "item": "buruma", "color": "", "source_phrase": "buruma"},
            {"slot": "accessories", "item": "name_tag", "color": "", "source_phrase": "name_tag"},
        ],
    },
    {
        "name": "Wetsuit",
        "aliases": "wetsuit,wetsuit outfit,neoprene suit,surfing wetsuit,diving wetsuit,surf suit,surfer outfit",
        "outfit_tags": "(wetsuit:1.1), black_wetsuit",
        "outfit_natlang": "a form-fitting black neoprene wetsuit covering the torso, arms, and legs, with a high collar at the neck",
        "slots": [
            {"slot": "tops", "item": "wetsuit", "color": "", "source_phrase": "wetsuit"},
            {"slot": "modifiers", "item": "wetsuit", "color": "black", "source_phrase": "black_wetsuit"},
        ],
    },
    {
        "name": "Zero Suit",
        "aliases": "zero suit, zero suit samus, samus zero suit, metroid zero suit, zero suit cosplay, zero suit outfit",
        "outfit_tags": "blue_bodysuit, skin_tight, paralyzer",
        "outfit_natlang": "a skin-tight blue bodysuit covering the whole body, paired with a paralyzer handgun",
        "slots": [
            {"slot": "tops", "item": "bodysuit", "color": "blue", "source_phrase": "blue_bodysuit"},
            {"slot": "modifiers", "item": "skin_tight", "color": "", "source_phrase": "skin_tight"},
            {"slot": "accessories", "item": "paralyzer", "color": "", "source_phrase": "paralyzer"},
        ],
    },
    {
        "name": "Wa Maid",
        "aliases": "wa maid,wa maid outfit,japanese maid,japanese maid outfit,japanese style maid,kimono maid,traditional japanese maid,wamaid",
        "outfit_tags": "maid_headdress, kimono, maid_apron, white_apron, frilled_apron, obi, tabi, zouri",
        "outfit_natlang": "a maid headdress, a kimono with traditional Japanese styling, a frilly white maid apron tied over the kimono, an obi sash at the waist, white tabi socks, and zouri sandals",
        "slots": [
            {"slot": "headwear", "item": "headdress", "color": "", "source_phrase": "maid_headdress"},
            {"slot": "dresses", "item": "kimono", "color": "", "source_phrase": "kimono"},
            {"slot": "tops", "item": "apron", "color": "", "source_phrase": "maid_apron"},
            {"slot": "tops", "item": "apron", "color": "white", "source_phrase": "white_apron"},
            {"slot": "modifiers", "item": "frilled_apron", "color": "", "source_phrase": "frilled_apron"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "obi"},
            {"slot": "legwear", "item": "tabi", "color": "", "source_phrase": "tabi"},
            {"slot": "footwear", "item": "zouri", "color": "", "source_phrase": "zouri"},
        ],
    },
    {
        "name": "Pant Suit",
        "aliases": "pant suit,pantsuit,pants suit,trouser suit,pant suit outfit,women's pant suit,formal pant suit",
        "outfit_tags": "(pant_suit:1.1), suit_jacket, dress_shirt, necktie, suit_pants, high_heels",
        "outfit_natlang": "a tailored suit jacket over a dress shirt, a necktie, matching suit pants, and high heels",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "suit_jacket"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "dress_shirt"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "suit_pants"},
            {"slot": "footwear", "item": "heels", "color": "", "source_phrase": "high_heels"},
            {"slot": "neckwear", "item": "necktie", "color": "", "source_phrase": "necktie"},
            {"slot": "accessories", "item": "pant_suit", "color": "", "source_phrase": "pant_suit"},
        ],
    },
    {
        "name": "Cheerleader",
        "aliases": "cheerleader,cheerleader outfit,cheerleader uniform,cheergirl,cheergirl outfit,cheer outfit,cheer uniform,cheerleading uniform",
        "outfit_tags": "(cheerleader:1.1), crop_top, miniskirt, kneehighs, sneakers, pom_pom_(cheerleading)",
        "outfit_natlang": "a sleeveless cheerleader crop top, a pleated miniskirt, kneehighs, sneakers, and pom poms held in each hand",
        "slots": [
            {"slot": "tops", "item": "crop_top", "color": "", "source_phrase": "crop_top"},
            {"slot": "bottoms", "item": "miniskirt", "color": "", "source_phrase": "miniskirt"},
            {"slot": "legwear", "item": "kneehighs", "color": "", "source_phrase": "kneehighs"},
            {"slot": "footwear", "item": "sneakers", "color": "", "source_phrase": "sneakers"},
            {"slot": "accessories", "item": "pom_poms", "color": "", "source_phrase": "pom_pom_(cheerleading)"},
        ],
    },
    {
        "name": "Naked Apron",
        "aliases": "naked apron,nude apron,apron only,only an apron,bare apron,hadaka apron",
        "outfit_tags": "(naked_apron:1.1), (apron:1.1), frilled_apron, thighhighs, sideboob",
        "outfit_natlang": "an apron worn over an otherwise bare body covering the front while leaving the back and sides exposed, paired with thighhighs",
        "slots": [
            {"slot": "tops", "item": "apron", "color": "", "source_phrase": "apron"},
            {"slot": "legwear", "item": "thighhighs", "color": "", "source_phrase": "thighhighs"},
            {"slot": "modifiers", "item": "frilled_apron", "color": "", "source_phrase": "frilled_apron"},
            {"slot": "modifiers", "item": "sideboob", "color": "", "source_phrase": "sideboob"},
        ],
    },
    {
        "name": "Plate Armor",
        "aliases": "plate armor, plate armor outfit, full plate armor, plate mail, plate mail armor, knight plate armor, medieval plate armor, suit of plate",
        "outfit_tags": "(plate_armor:1.1), helmet, pauldrons, breastplate, gauntlets, faulds, greaves, armored_boots",
        "outfit_natlang": "a steel helmet, pauldrons over the shoulders, a polished metal breastplate, articulated gauntlets on the hands, faulds at the hips, greaves on the shins, and armored boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "helmet"},
            {"slot": "tops", "item": "breastplate", "color": "", "source_phrase": "breastplate"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "armored_boots"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "accessories", "item": "faulds", "color": "", "source_phrase": "faulds"},
            {"slot": "accessories", "item": "greaves", "color": "", "source_phrase": "greaves"},
            {"slot": "accessories", "item": "plate_armor", "color": "", "source_phrase": "plate_armor"},
        ],
    },
    {
        "name": "Miko",
        "aliases": "miko,shrine maiden,miko outfit,shrine maiden outfit,miko cosplay,traditional miko,japanese shrine maiden",
        "outfit_tags": "(miko:1.1), white_kimono, wide_sleeves, ribbon-trimmed_sleeves, red_hakama, hakama_skirt, tabi, zouri",
        "outfit_natlang": "a white kimono top with wide sleeves and ribbon-trimmed cuffs, a red hakama skirt tied at the waist, white tabi socks, and zouri sandals",
        "slots": [
            {"slot": "tops", "item": "kimono", "color": "white", "source_phrase": "white_kimono"},
            {"slot": "bottoms", "item": "hakama", "color": "red", "source_phrase": "red_hakama"},
            {"slot": "legwear", "item": "tabi", "color": "", "source_phrase": "tabi"},
            {"slot": "footwear", "item": "zouri", "color": "", "source_phrase": "zouri"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
            {"slot": "modifiers", "item": "ribbon_trimmed_sleeves", "color": "", "source_phrase": "ribbon-trimmed_sleeves"},
        ],
    },
    {
        "name": "Nun",
        "aliases": "nun,nun outfit,nun cosplay,anime nun,sister outfit,religious sister outfit,nun dress",
        "outfit_tags": "nun_headdress, black_veil, black_dress, cross_necklace",
        "outfit_natlang": "a nun headdress with a black veil, a long black dress, and a cross necklace",
        "slots": [
            {"slot": "headwear", "item": "headdress", "color": "", "source_phrase": "nun_headdress"},
            {"slot": "headwear", "item": "veil", "color": "black", "source_phrase": "black_veil"},
            {"slot": "dresses", "item": "dress", "color": "black", "source_phrase": "black_dress"},
            {"slot": "neckwear", "item": "necklace", "color": "", "source_phrase": "cross_necklace"},
        ],
    },
    {
        "name": "Nurse",
        "aliases": "nurse,nurse outfit,nurse uniform,nurse cosplay,nurse costume,nurse dress,nursing outfit",
        "outfit_tags": "nurse_cap, (nurse:1.1), white_dress, white_apron, white_thighhighs, mary_janes, stethoscope, syringe",
        "outfit_natlang": "a white nurse cap with a red cross, a short white nurse dress, a white apron, white thighhighs, mary jane shoes, a stethoscope around the neck, and a syringe in hand",
        "slots": [
            {"slot": "headwear", "item": "cap", "color": "", "source_phrase": "nurse_cap"},
            {"slot": "tops", "item": "dress", "color": "white", "source_phrase": "white_dress"},
            {"slot": "tops", "item": "apron", "color": "white", "source_phrase": "white_apron"},
            {"slot": "legwear", "item": "thighhighs", "color": "white", "source_phrase": "white_thighhighs"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "mary_janes"},
            {"slot": "accessories", "item": "stethoscope", "color": "", "source_phrase": "stethoscope"},
            {"slot": "accessories", "item": "syringe", "color": "", "source_phrase": "syringe"},
        ],
    },
    {
        "name": "Fast Food Uniform",
        "aliases": "fast food uniform,fast food outfit,fast food worker outfit,fast food employee uniform,burger joint uniform,mcdonald's uniform,kfc uniform",
        "outfit_tags": "visor_cap, polo_shirt, name_tag, waist_apron, skirt",
        "outfit_natlang": "a visor cap, a polo shirt with a name tag, a waist apron, and a skirt",
        "slots": [
            {"slot": "headwear", "item": "cap", "color": "", "source_phrase": "visor_cap"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "polo_shirt"},
            {"slot": "accessories", "item": "name_tag", "color": "", "source_phrase": "name_tag"},
            {"slot": "accessories", "item": "apron", "color": "", "source_phrase": "waist_apron"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "skirt"},
        ],
    },
    {
        "name": "Qi Lolita",
        "aliases": "qi lolita,qi lolita outfit,chinese lolita,chinese lolita fashion,qi loli,qi lolita dress,qi lolita coord",
        "outfit_tags": "(qi_lolita:1.1), lolita_hairband, tassel_hair_ornament, mandarin_collar, frilled_dress, detached_sleeves, pankou, petticoat, white_thighhighs, mary_janes, tassel",
        "outfit_natlang": "a lolita hairband with tassel hair ornaments, a frilled dress with a mandarin collar and pankou frog closures, detached sleeves, a petticoat underneath, white thighhighs, and mary jane shoes",
        "slots": [
            {"slot": "headwear", "item": "hairband", "color": "", "source_phrase": "lolita_hairband"},
            {"slot": "headwear", "item": "hair ornament", "color": "", "source_phrase": "tassel_hair_ornament"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "frilled_dress"},
            {"slot": "dresses", "item": "petticoat", "color": "", "source_phrase": "petticoat"},
            {"slot": "legwear", "item": "thighhighs", "color": "white", "source_phrase": "white_thighhighs"},
            {"slot": "footwear", "item": "mary janes", "color": "", "source_phrase": "mary_janes"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "mandarin_collar"},
            {"slot": "accessories", "item": "detached sleeves", "color": "", "source_phrase": "detached_sleeves"},
            {"slot": "accessories", "item": "pankou", "color": "", "source_phrase": "pankou"},
            {"slot": "accessories", "item": "tassel", "color": "", "source_phrase": "tassel"},
        ],
    },
    {
        "name": "Chinese Dress",
        "aliases": "chinese dress,china dress,qipao,cheongsam,chinese dress outfit,qipao outfit,cheongsam dress,traditional chinese dress",
        "outfit_tags": "china_dress, mandarin_collar, side_slit, pelvic_curtain, pankou, double_bun, bun_cover, high_heels",
        "outfit_natlang": "a form-fitting china dress with a mandarin collar fastened by pankou frog-button toggles, high side slits forming a pelvic curtain over the hips, hair styled in double buns with decorative bun covers, and high heels",
        "slots": [
            {"slot": "headwear", "item": "bun_cover", "color": "", "source_phrase": "bun_cover"},
            {"slot": "dresses", "item": "china_dress", "color": "", "source_phrase": "china_dress"},
            {"slot": "footwear", "item": "high_heels", "color": "", "source_phrase": "high_heels"},
            {"slot": "accessories", "item": "pankou", "color": "", "source_phrase": "pankou"},
            {"slot": "modifiers", "item": "mandarin_collar", "color": "", "source_phrase": "mandarin_collar"},
            {"slot": "modifiers", "item": "side_slit", "color": "", "source_phrase": "side_slit"},
            {"slot": "modifiers", "item": "pelvic_curtain", "color": "", "source_phrase": "pelvic_curtain"},
            {"slot": "modifiers", "item": "double_bun", "color": "", "source_phrase": "double_bun"},
        ],
    },
    {
        "name": "Santa Costume",
        "aliases": "santa,santa costume,santa outfit,santa suit,santa claus outfit,santa cosplay,santa girl outfit,christmas costume",
        "outfit_tags": "santa_hat, fur-trimmed_capelet, fur-trimmed_jacket, black_belt, red_gloves, fur-trimmed_boots, (santa_costume:1.1)",
        "outfit_natlang": "a santa hat, a fur-trimmed red capelet over a fur-trimmed red jacket, a wide black belt at the waist, red gloves, and fur-trimmed boots",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "santa_hat"},
            {"slot": "tops", "item": "capelet", "color": "", "source_phrase": "fur-trimmed_capelet"},
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "fur-trimmed_jacket"},
            {"slot": "accessories", "item": "belt", "color": "black", "source_phrase": "black_belt"},
            {"slot": "handwear", "item": "gloves", "color": "red", "source_phrase": "red_gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "fur-trimmed_boots"},
        ],
    },
    {
        "name": "Serafuku",
        "aliases": "serafuku,japanese sailor uniform,japanese school uniform,sailor school uniform,schoolgirl sailor uniform,seraa fuku",
        "outfit_tags": "(school_uniform:1.1), sailor_collar, white_shirt, pleated_skirt, neckerchief, kneehighs, loafers",
        "outfit_natlang": "a Japanese sailor-style school uniform with a white blouse, a sailor collar, a neckerchief tied at the front, a pleated skirt, knee-high socks, and brown loafers",
        "slots": [
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "legwear", "item": "kneehighs", "color": "", "source_phrase": "kneehighs"},
            {"slot": "footwear", "item": "loafers", "color": "", "source_phrase": "loafers"},
            {"slot": "neckwear", "item": "neckerchief", "color": "", "source_phrase": "neckerchief"},
            {"slot": "modifiers", "item": "collar", "color": "", "source_phrase": "sailor_collar"},
        ],
    },
    {
        "name": "Witch",
        "aliases": "witch,witch outfit,witch costume,witch cosplay,sorceress,sorceress outfit,classic witch,storybook witch",
        "outfit_tags": "witch_hat, black_dress, black_cape, black_thighhighs, black_boots, broom, (witch:1.1)",
        "outfit_natlang": "a pointed witch hat, a long black dress, a black cape over the shoulders, black thighhighs, black boots, and a broom in hand",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "witch_hat"},
            {"slot": "tops", "item": "dress", "color": "black", "source_phrase": "black_dress"},
            {"slot": "tops", "item": "cape", "color": "black", "source_phrase": "black_cape"},
            {"slot": "legwear", "item": "thighhighs", "color": "black", "source_phrase": "black_thighhighs"},
            {"slot": "footwear", "item": "boots", "color": "black", "source_phrase": "black_boots"},
            {"slot": "accessories", "item": "broom", "color": "", "source_phrase": "broom"},
        ],
    },
    {
        "name": "Fortified Suit",
        "aliases": "fortified suit, fortified bodysuit, muv-luv pilot suit, mecha pilot armor, fortified armor suit, mechanized pilot suit",
        "outfit_tags": "(fortified_suit:1.1), mecha_pilot_suit, armored_bodysuit, skin_tight, pauldrons, headgear",
        "outfit_natlang": "a head-mounted pilot interface with chin guard, armored shoulder pauldrons over a skin-tight mecha pilot bodysuit with reinforced plating on the upper arms and lower legs",
        "slots": [
            {"slot": "headwear", "item": "headgear", "color": "", "source_phrase": "headgear"},
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "armored_bodysuit"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "modifiers", "item": "skin_tight", "color": "", "source_phrase": "skin_tight"},
            {"slot": "modifiers", "item": "fortified_suit", "color": "", "source_phrase": "fortified_suit"},
            {"slot": "modifiers", "item": "mecha_pilot_suit", "color": "", "source_phrase": "mecha_pilot_suit"},
        ],
    },
    {
        "name": "Cat Costume",
        "aliases": "cat costume,cat cosplay,cat kigurumi,cat onesie,cat suit costume,kitty costume,kitty cosplay,cat outfit",
        "outfit_tags": "cat_hood, paw_gloves, cat_tail, (cat_costume:1.1)",
        "outfit_natlang": "a cat hood with cat ears, paw mitten gloves, and a long cat tail, all part of a full cat kigurumi costume",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "cat_hood"},
            {"slot": "handwear", "item": "paws", "color": "", "source_phrase": "paw_gloves"},
            {"slot": "accessories", "item": "tail", "color": "", "source_phrase": "cat_tail"},
        ],
    },
    {
        "name": "Kimono",
        "aliases": "kimono,kimono outfit,traditional kimono,japanese kimono,kimono dress,kimono robe",
        "outfit_tags": "(kimono:1.1), japanese_clothes, wide_sleeves, obi, sash, tabi, zouri",
        "outfit_natlang": "a long-sleeved traditional Japanese kimono robe with a Y-shaped wrap-front closure, secured at the waist by a wide obi sash, paired with white tabi split-toe socks and zouri sandals",
        "slots": [
            {"slot": "dresses", "item": "kimono", "color": "", "source_phrase": "kimono"},
            {"slot": "legwear", "item": "tabi", "color": "", "source_phrase": "tabi"},
            {"slot": "footwear", "item": "zouri", "color": "", "source_phrase": "zouri"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "obi"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
        ],
    },
    {
        "name": "Collared Leotard",
        "aliases": "collared leotard,collared leotard outfit,leotard with collar,leotard with folded collar,collar leotard,leotard with a collar",
        "outfit_tags": "(collared_leotard:1.1)",
        "outfit_natlang": "a form-fitting one-piece leotard with a folded collar around the neckline",
        "slots": [
            {"slot": "tops", "item": "leotard", "color": "", "source_phrase": "collared_leotard"},
        ],
    },
    {
        "name": "Armored Bodysuit",
        "aliases": "armored bodysuit, armored bodysuit outfit, armor bodysuit, plated bodysuit, battle bodysuit, combat bodysuit, sci-fi armored suit",
        "outfit_tags": "helmet, pauldrons, breastplate, (armored_bodysuit:1.1), gauntlets, leg_armor, armored_boots",
        "outfit_natlang": "a sci-fi helmet, metal pauldrons over a form-fitting armored bodysuit reinforced with a breastplate, articulated gauntlets, plated leg armor, and armored boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "helmet"},
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "armored_bodysuit"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "accessories", "item": "breastplate", "color": "", "source_phrase": "breastplate"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "accessories", "item": "leg_armor", "color": "", "source_phrase": "leg_armor"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "armored_boots"},
        ],
    },
    {
        "name": "Virgin Killer Outfit",
        "aliases": "virgin killer outfit,virgin killer,vko,vko outfit,virgin killer cosplay,suspender skirt outfit,underbust skirt outfit",
        "outfit_tags": "(virgin_killer_outfit:1.1), frilled_shirt, frilled_shirt_collar, white_shirt, red_bowtie, high-waist_skirt, suspender_skirt, black_skirt, underbust, black_pantyhose",
        "outfit_natlang": "a frilled white blouse with a frilled shirt collar, a red bowtie at the throat, a black high-waist suspender skirt that emphasizes the underbust, and black pantyhose",
        "slots": [
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "frilled_shirt"},
            {"slot": "modifiers", "item": "collar", "color": "", "source_phrase": "frilled_shirt_collar"},
            {"slot": "neckwear", "item": "bowtie", "color": "red", "source_phrase": "red_bowtie"},
            {"slot": "bottoms", "item": "skirt", "color": "black", "source_phrase": "black_skirt"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "high-waist_skirt"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "suspender_skirt"},
            {"slot": "modifiers", "item": "underbust", "color": "", "source_phrase": "underbust"},
            {"slot": "legwear", "item": "pantyhose", "color": "black", "source_phrase": "black_pantyhose"},
        ],
    },
    {
        "name": "Sleeveless Leotard",
        "aliases": "sleeveless leotard,sleeveless leotard outfit,basic leotard,classic leotard,plain leotard,practice leotard,no-sleeve leotard",
        "outfit_tags": "(sleeveless_leotard:1.1), (leotard:1.1)",
        "outfit_natlang": "a tight-fitting sleeveless one-piece leotard with high-cut leg openings, worn for dance or gymnastics practice",
        "slots": [
            {"slot": "tops", "item": "leotard", "color": "", "source_phrase": "sleeveless_leotard"},
        ],
    },
    {
        "name": "Band Uniform",
        "aliases": "band uniform,marching band uniform,marching band outfit,drum major uniform,drum major outfit,marching band cosplay,band uniform cosplay",
        "outfit_tags": "shako_cap, (band_uniform:1.1), epaulettes, aiguillette, frogging, white_gloves, white_pants, boots, marching_band_baton",
        "outfit_natlang": "a tall shako cap with plume, a decorated military-style band uniform jacket with epaulettes, aiguillette cord, and gold frogging across the chest, white gloves, white pants, and boots, holding a marching band baton",
        "slots": [
            {"slot": "headwear", "item": "cap", "color": "", "source_phrase": "shako_cap"},
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "band_uniform"},
            {"slot": "accessories", "item": "epaulettes", "color": "", "source_phrase": "epaulettes"},
            {"slot": "accessories", "item": "aiguillette", "color": "", "source_phrase": "aiguillette"},
            {"slot": "modifiers", "item": "frogging", "color": "", "source_phrase": "frogging"},
            {"slot": "handwear", "item": "gloves", "color": "white", "source_phrase": "white_gloves"},
            {"slot": "bottoms", "item": "pants", "color": "white", "source_phrase": "white_pants"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
            {"slot": "accessories", "item": "baton", "color": "", "source_phrase": "marching_band_baton"},
        ],
    },
    {
        "name": "Catsuit",
        "aliases": "catsuit, cat suit, full body catsuit, latex catsuit, zip-up catsuit, skintight catsuit",
        "outfit_tags": "(catsuit:1.1), bodysuit, zipper, skin_tight",
        "outfit_natlang": "a skin-tight one-piece bodysuit covering the torso, arms, and legs from neck to ankles, often made of latex or leather with a prominent zipper running down the front",
        "slots": [
            {"slot": "dresses", "item": "catsuit", "color": "", "source_phrase": "catsuit"},
            {"slot": "dresses", "item": "bodysuit", "color": "", "source_phrase": "bodysuit"},
            {"slot": "modifiers", "item": "zipper", "color": "", "source_phrase": "zipper"},
            {"slot": "modifiers", "item": "fit", "color": "", "source_phrase": "skin_tight"},
        ],
    },
    {
        "name": "Bunny Suit",
        "aliases": "bunny suit,bunnysuit,bunny girl,bunny girl outfit,playboy bunny,playboy bunny outfit,playboy bunny costume,playboy outfit,bunny leotard,bunny outfit",
        "outfit_tags": "rabbit_ears, strapless_leotard, detached_collar, bowtie, wrist_cuffs, black_pantyhose, high_heels, rabbit_tail, playboy_bunny",
        "outfit_natlang": "fake rabbit ears on the head, a strapless black leotard, a white detached collar with a black bowtie at the neck, white wrist cuffs, black pantyhose, high heels, and a fluffy rabbit tail at the back",
        "slots": [
            {"slot": "headwear", "item": "ears", "color": "", "source_phrase": "rabbit_ears"},
            {"slot": "tops", "item": "leotard", "color": "", "source_phrase": "strapless_leotard"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "detached_collar"},
            {"slot": "neckwear", "item": "bowtie", "color": "", "source_phrase": "bowtie"},
            {"slot": "handwear", "item": "cuffs", "color": "", "source_phrase": "wrist_cuffs"},
            {"slot": "legwear", "item": "pantyhose", "color": "black", "source_phrase": "black_pantyhose"},
            {"slot": "footwear", "item": "heels", "color": "", "source_phrase": "high_heels"},
            {"slot": "accessories", "item": "tail", "color": "", "source_phrase": "rabbit_tail"},
        ],
    },
    {
        "name": "Indian Clothes",
        "aliases": "indian clothes,indian outfit,sari,sari outfit,traditional indian dress,desi outfit,south asian outfit,asian indian clothes",
        "outfit_tags": "sari, bindi, bangle, belly_chain, anklet",
        "outfit_natlang": "a draped sari wrapped around the body and over one shoulder, a bindi on the forehead, gold bangles on the wrists, a belly chain, and anklets",
        "slots": [
            {"slot": "dresses", "item": "sari", "color": "", "source_phrase": "sari"},
            {"slot": "accessories", "item": "bindi", "color": "", "source_phrase": "bindi"},
            {"slot": "accessories", "item": "bangle", "color": "", "source_phrase": "bangle"},
            {"slot": "accessories", "item": "belly chain", "color": "", "source_phrase": "belly_chain"},
            {"slot": "accessories", "item": "anklet", "color": "", "source_phrase": "anklet"},
        ],
    },
    {
        "name": "Pinstripe Suit",
        "aliases": "pinstripe suit,pinstripe outfit,pinstripe gangster suit,gangster suit,mobster suit,striped suit,pinstriped suit,1920s suit",
        "outfit_tags": "fedora, pinstripe_jacket, dress_shirt, necktie, pinstripe_vest, pinstripe_pants, dress_shoes, (pinstripe_suit:1.1)",
        "outfit_natlang": "a fedora, a pinstripe jacket over a white dress shirt with a necktie, a matching pinstripe vest, pinstripe pants, and dress shoes",
        "slots": [
            {"slot": "headwear", "item": "fedora", "color": "", "source_phrase": "fedora"},
            {"slot": "tops", "item": "jacket", "color": "pinstripe", "source_phrase": "pinstripe_jacket"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "dress_shirt"},
            {"slot": "tops", "item": "vest", "color": "pinstripe", "source_phrase": "pinstripe_vest"},
            {"slot": "neckwear", "item": "necktie", "color": "", "source_phrase": "necktie"},
            {"slot": "bottoms", "item": "pants", "color": "pinstripe", "source_phrase": "pinstripe_pants"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "dress_shoes"},
            {"slot": "modifiers", "item": "pattern", "color": "", "source_phrase": "pinstripe_pattern"},
        ],
    },
    {
        "name": "Hospital Gown",
        "aliases": "hospital gown,patient gown,medical gown,hospital robe,hospital pajamas,patient outfit",
        "outfit_tags": "(hospital_gown:1.1)",
        "outfit_natlang": "a loose hospital gown that ties at the back, typical of hospital patients during examinations or recovery",
        "slots": [
            {"slot": "dresses", "item": "gown", "color": "", "source_phrase": "hospital_gown"},
        ],
    },
    {
        "name": "Rabbit Costume",
        "aliases": "rabbit costume,rabbit cosplay,rabbit kigurumi,rabbit onesie,rabbit suit,rabbit pajamas,rabbit outfit,bunny kigurumi",
        "outfit_tags": "rabbit_hood, rabbit_paws, rabbit_tail, (rabbit_costume:1.1)",
        "outfit_natlang": "a rabbit hood with long rabbit ears, paw mitten gloves, and a fluffy rabbit tail, all part of a full rabbit kigurumi costume",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "rabbit_hood"},
            {"slot": "handwear", "item": "paws", "color": "", "source_phrase": "rabbit_paws"},
            {"slot": "accessories", "item": "tail", "color": "", "source_phrase": "rabbit_tail"},
        ],
    },
    {
        "name": "Kittysuit",
        "aliases": "kittysuit,kitty suit,nekomimi bunny,cat bunny suit,cat playboy bunny,kitty playboy bunny,cat bunnysuit,nontraditional bunny cat",
        "outfit_tags": "fake_animal_ears, cat_ears, detached_collar, black_leotard, highleg_leotard, wrist_cuffs, fake_tail, cat_tail, pantyhose, high_heels, (kittysuit:1.1)",
        "outfit_natlang": "fake cat ears on the head, a detached collar at the neck, a black highleg strapless leotard, wrist cuffs on each arm, a fake cat tail at the back, sheer pantyhose, and high heels",
        "slots": [
            {"slot": "headwear", "item": "ears", "color": "", "source_phrase": "fake_animal_ears"},
            {"slot": "headwear", "item": "cat_ears", "color": "", "source_phrase": "cat_ears"},
            {"slot": "tops", "item": "leotard", "color": "black", "source_phrase": "black_leotard"},
            {"slot": "modifiers", "item": "highleg", "color": "", "source_phrase": "highleg_leotard"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "detached_collar"},
            {"slot": "handwear", "item": "cuffs", "color": "", "source_phrase": "wrist_cuffs"},
            {"slot": "accessories", "item": "tail", "color": "", "source_phrase": "fake_tail"},
            {"slot": "accessories", "item": "cat_tail", "color": "", "source_phrase": "cat_tail"},
            {"slot": "legwear", "item": "pantyhose", "color": "", "source_phrase": "pantyhose"},
            {"slot": "footwear", "item": "heels", "color": "", "source_phrase": "high_heels"},
        ],
    },
    {
        "name": "Romper",
        "aliases": "romper,romper outfit,playsuit,playsuit outfit,one-piece shorts,one-piece shorts outfit,romper dress",
        "outfit_tags": "white_romper, frills, ribbon, sandals",
        "outfit_natlang": "a sleeveless white romper with frilly trim and a ribbon accent, paired with simple sandals",
        "slots": [
            {"slot": "tops", "item": "romper", "color": "white", "source_phrase": "white_romper"},
            {"slot": "modifiers", "item": "frills", "color": "", "source_phrase": "frills"},
            {"slot": "accessories", "item": "ribbon", "color": "", "source_phrase": "ribbon"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "sandals"},
        ],
    },
    {
        "name": "Bodysuit",
        "aliases": "bodysuit,bodysuit outfit,plain bodysuit,one-piece bodysuit,full body suit,skin tight bodysuit,zentai-style bodysuit",
        "outfit_tags": "(bodysuit:1.1), skin_tight, gloves, boots",
        "outfit_natlang": "a form-fitting one-piece bodysuit covering the torso, arms, and legs from neck to ankles, gloves, and boots",
        "slots": [
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "bodysuit"},
            {"slot": "modifiers", "item": "skin_tight", "color": "", "source_phrase": "skin_tight"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
        ],
    },
    {
        "name": "Penguin Costume",
        "aliases": "penguin costume,penguin cosplay,penguin kigurumi,penguin onesie,penguin suit,penguin outfit,penguin pajamas",
        "outfit_tags": "penguin_hood, (penguin_costume:1.1), penguin_tail",
        "outfit_natlang": "a penguin hood, a full-body black-and-white penguin costume, and a small penguin tail at the back",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "penguin_hood"},
            {"slot": "accessories", "item": "tail", "color": "", "source_phrase": "penguin_tail"},
        ],
    },
    {
        "name": "Tangzhuang",
        "aliases": "tangzhuang,tang suit,tangzhuang jacket,chinese jacket,mandarin jacket,manchu jacket,tang outfit,qing dynasty jacket",
        "outfit_tags": "(tangzhuang:1.1), mandarin_collar, pankou, long_sleeves, chinese_clothes, black_pants",
        "outfit_natlang": "a tangzhuang jacket with a mandarin collar and pankou frog-button closures running down the front, long sleeves, traditional Chinese clothing, and black pants",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "tangzhuang"},
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "mandarin_collar"},
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "pankou"},
            {"slot": "tops", "item": "sleeves", "color": "", "source_phrase": "long_sleeves"},
            {"slot": "tops", "item": "clothing", "color": "", "source_phrase": "chinese_clothes"},
            {"slot": "bottoms", "item": "pants", "color": "black", "source_phrase": "black_pants"},
        ],
    },
    {
        "name": "Striped Pajamas",
        "aliases": "striped pajamas,striped pyjamas,striped sleepwear,striped pjs,prison pajamas,prisoner pajamas,jailbird pajamas",
        "outfit_tags": "(striped_pajamas:1.1), collared_pajamas, long_sleeves, buttons, striped_pants",
        "outfit_natlang": "a matching set of striped pajamas with a long-sleeved buttoned collared top and striped pajama pants",
        "slots": [
            {"slot": "tops", "item": "pajamas", "color": "striped", "source_phrase": "collared_pajamas"},
            {"slot": "bottoms", "item": "pants", "color": "striped", "source_phrase": "striped_pants"},
            {"slot": "modifiers", "item": "long_sleeves", "color": "", "source_phrase": "long_sleeves"},
            {"slot": "modifiers", "item": "buttons", "color": "", "source_phrase": "buttons"},
        ],
    },
    {
        "name": "Wa Lolita",
        "aliases": "wa lolita,wa lolita outfit,japanese lolita,kimono lolita,wa-lolita,wa loli",
        "outfit_tags": "kanzashi, frilled_kimono, kimono_skirt, wide_sleeves, obi, white_thighhighs, zouri",
        "outfit_natlang": "a kanzashi hair ornament, a frilled kimono with wide sleeves, a kimono skirt flaring out at the waist, an obi sash tied around the waist, white thighhighs, and zouri sandals",
        "slots": [
            {"slot": "headwear", "item": "ornament", "color": "", "source_phrase": "kanzashi"},
            {"slot": "tops", "item": "kimono", "color": "", "source_phrase": "frilled_kimono"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "kimono_skirt"},
            {"slot": "modifiers", "item": "sleeves", "color": "", "source_phrase": "wide_sleeves"},
            {"slot": "accessories", "item": "sash", "color": "", "source_phrase": "obi"},
            {"slot": "legwear", "item": "thighhighs", "color": "white", "source_phrase": "white_thighhighs"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "zouri"},
        ],
    },
    {
        "name": "Racing Suit",
        "aliases": "racing suit,racing outfit,race suit,motorsport suit,racecar driver outfit,formula racer outfit,driver suit,driving suit",
        "outfit_tags": "helmet, (racing_suit:1.1), gloves, boots, sponsor, skin_tight",
        "outfit_natlang": "a racing helmet, a skintight one-piece racing suit covered in sponsor logos, gloves, and boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "helmet"},
            {"slot": "dresses", "item": "jumpsuit", "color": "", "source_phrase": "racing_suit"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
            {"slot": "modifiers", "item": "sponsor", "color": "", "source_phrase": "sponsor"},
            {"slot": "modifiers", "item": "skin_tight", "color": "", "source_phrase": "skin_tight"},
        ],
    },
    {
        "name": "Scale Armor",
        "aliases": "scale armor, scale armor outfit, scaled armor, dragon scale armor, dragon-scale armor, scalemail, scale mail, scaled mail armor",
        "outfit_tags": "winged_helmet, (scale_armor:1.1), pauldrons, gauntlets, surcoat, armored_boots, cape, sword",
        "outfit_natlang": "a winged helmet, a scale armor cuirass of overlapping metal scales, pauldrons over the shoulders, articulated gauntlets, a surcoat draped over the armor, armored boots, a cape, and a sword at the hip",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "winged_helmet"},
            {"slot": "tops", "item": "armor", "color": "", "source_phrase": "scale_armor"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "tops", "item": "surcoat", "color": "", "source_phrase": "surcoat"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "armored_boots"},
            {"slot": "accessories", "item": "cape", "color": "", "source_phrase": "cape"},
            {"slot": "accessories", "item": "sword", "color": "", "source_phrase": "sword"},
        ],
    },
    {
        "name": "Military Dress Uniform",
        "aliases": "military dress uniform,dress uniform,parade uniform,ceremonial uniform,formal military uniform,officer dress uniform,military formal wear,military parade outfit",
        "outfit_tags": "(military_dress_uniform:1.1), peaked_cap, military_jacket, epaulettes, shoulder_boards, aiguillette, ribbon_bar, medal, sash, white_gloves, black_pants, dress_shoes",
        "outfit_natlang": "a peaked cap with insignia, a tailored military jacket with epaulettes, shoulder boards, an aiguillette across the chest, a ribbon bar and medals on the breast, a ceremonial sash, white parade gloves, dark dress trousers, and polished dress shoes",
        "slots": [
            {"slot": "headwear", "item": "cap", "color": "", "source_phrase": "peaked_cap"},
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "military_jacket"},
            {"slot": "accessories", "item": "epaulettes", "color": "", "source_phrase": "epaulettes"},
            {"slot": "accessories", "item": "shoulder_boards", "color": "", "source_phrase": "shoulder_boards"},
            {"slot": "accessories", "item": "aiguillette", "color": "", "source_phrase": "aiguillette"},
            {"slot": "accessories", "item": "ribbon_bar", "color": "", "source_phrase": "ribbon_bar"},
            {"slot": "accessories", "item": "medal", "color": "", "source_phrase": "medal"},
            {"slot": "accessories", "item": "sash", "color": "", "source_phrase": "sash"},
            {"slot": "handwear", "item": "gloves", "color": "white", "source_phrase": "white_gloves"},
            {"slot": "bottoms", "item": "pants", "color": "black", "source_phrase": "black_pants"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "dress_shoes"},
        ],
    },
    {
        "name": "Karate Gi",
        "aliases": "karate gi,karate uniform,karate outfit,karate dogi,karategi,judo gi,martial arts uniform,martial arts gi",
        "outfit_tags": "hachimaki, dougi, white_dougi, uwagi, martial_arts_belt, black_belt, barefoot",
        "outfit_natlang": "a white dougi jacket and matching loose trousers tied with a black martial arts belt, optionally a hachimaki headband, and bare feet",
        "slots": [
            {"slot": "headwear", "item": "hachimaki", "color": "", "source_phrase": "hachimaki"},
            {"slot": "tops", "item": "uwagi", "color": "white", "source_phrase": "white_dougi"},
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "uwagi"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "dougi"},
            {"slot": "accessories", "item": "belt", "color": "", "source_phrase": "martial_arts_belt"},
            {"slot": "accessories", "item": "belt", "color": "black", "source_phrase": "black_belt"},
            {"slot": "modifiers", "item": "barefoot", "color": "", "source_phrase": "barefoot"},
        ],
    },
    {
        "name": "Pajamas",
        "aliases": "pajamas,pjs,pyjamas,pajama outfit,sleepwear outfit,bedtime outfit,sleep outfit,nightwear",
        "outfit_tags": "nightcap, (pajamas:1.1), slippers",
        "outfit_natlang": "a nightcap on the head, comfortable two-piece pajamas with a long-sleeved top and matching pants, and soft slippers on the feet",
        "slots": [
            {"slot": "headwear", "item": "nightcap", "color": "", "source_phrase": "nightcap"},
            {"slot": "tops", "item": "pajamas", "color": "", "source_phrase": "pajamas"},
            {"slot": "footwear", "item": "slippers", "color": "", "source_phrase": "slippers"},
        ],
    },
    {
        "name": "Jumpsuit",
        "aliases": "jumpsuit,jumpsuit outfit,coverall,coveralls,coverall outfit,boilersuit,flight suit,mechanic outfit,prison jumpsuit",
        "outfit_tags": "(jumpsuit:1.1), front_zipper, collared_jumpsuit, gloves, belt, boots",
        "outfit_natlang": "a loose one-piece jumpsuit zipped up the front with a fold-down collar, gloves on the hands, a belt at the waist, and boots",
        "slots": [
            {"slot": "dresses", "item": "jumpsuit", "color": "", "source_phrase": "jumpsuit"},
            {"slot": "modifiers", "item": "collar", "color": "", "source_phrase": "collared_jumpsuit"},
            {"slot": "modifiers", "item": "zipper", "color": "", "source_phrase": "front_zipper"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "accessories", "item": "belt", "color": "", "source_phrase": "belt"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
        ],
    },
    {
        "name": "Robe",
        "aliases": "robe, wizard robe, mage robe, sorcerer robe, ceremonial robe, cleric robe, ritual robe, long robe",
        "outfit_tags": "(robe:1.1), long_sleeves, wide_sleeves, sash",
        "outfit_natlang": "a long flowing robe reaching the ankles, with long wide sleeves and a sash tied at the waist",
        "slots": [
            {"slot": "dresses", "item": "robe", "color": "", "source_phrase": "robe"},
            {"slot": "modifiers", "item": "long_sleeves", "color": "", "source_phrase": "long_sleeves"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
            {"slot": "accessories", "item": "sash", "color": "", "source_phrase": "sash"},
        ],
    },
    {
        "name": "Cyber Fashion",
        "aliases": "cyber fashion,cyber kei,cyberkei,harajuku cyber,cyber outfit,90s cyber fashion,cybergoth fashion,cyber rave outfit",
        "outfit_tags": "(cyber_fashion:1.1), visor_cap, goggles, see-through_clothes, ufo_skirt, arm_warmers, leg_warmers, platform_boots, choker, headphones, cyberlox, glowing_clothes, shiny",
        "outfit_natlang": "a chunky visor cap with goggles perched up top, a see-through shiny vinyl top, a flared UFO skirt, striped arm warmers and leg warmers, towering platform boots, a black choker, oversized headphones, neon cyberlox hair extensions, and glowing accents on the clothes",
        "slots": [
            {"slot": "headwear", "item": "visor cap", "color": "", "source_phrase": "visor_cap"},
            {"slot": "tops", "item": "see-through top", "color": "", "source_phrase": "see-through_clothes"},
            {"slot": "bottoms", "item": "ufo skirt", "color": "", "source_phrase": "ufo_skirt"},
            {"slot": "legwear", "item": "leg warmers", "color": "", "source_phrase": "leg_warmers"},
            {"slot": "footwear", "item": "platform boots", "color": "", "source_phrase": "platform_boots"},
            {"slot": "handwear", "item": "arm warmers", "color": "", "source_phrase": "arm_warmers"},
            {"slot": "neckwear", "item": "choker", "color": "", "source_phrase": "choker"},
            {"slot": "accessories", "item": "goggles", "color": "", "source_phrase": "goggles"},
            {"slot": "accessories", "item": "headphones", "color": "", "source_phrase": "headphones"},
            {"slot": "accessories", "item": "cyberlox", "color": "", "source_phrase": "cyberlox"},
            {"slot": "modifiers", "item": "glowing clothes", "color": "", "source_phrase": "glowing_clothes"},
            {"slot": "modifiers", "item": "shiny", "color": "", "source_phrase": "shiny"},
        ],
    },
    {
        "name": "Overalls",
        "aliases": "overalls,overalls outfit,denim overalls,bib overalls,dungarees,overalls and t-shirt,blue overalls outfit",
        "outfit_tags": "straw_hat, t-shirt, denim_overalls, suspenders, sneakers",
        "outfit_natlang": "a straw hat, a plain t-shirt under denim overalls with shoulder suspender straps and a bib front, and sneakers",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "straw_hat"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "t-shirt"},
            {"slot": "dresses", "item": "overalls", "color": "", "source_phrase": "denim_overalls"},
            {"slot": "accessories", "item": "suspenders", "color": "", "source_phrase": "suspenders"},
            {"slot": "footwear", "item": "sneakers", "color": "", "source_phrase": "sneakers"},
        ],
    },
    {
        "name": "Suit",
        "aliases": "suit,formal suit,three-piece suit,classic suit,mens suit,gentlemans suit,formal wear,formal attire",
        "outfit_tags": "(suit:1.1), suit_jacket, dress_shirt, necktie, vest, suit_pants, dress_shoes",
        "outfit_natlang": "a tailored suit jacket over a dress shirt with a necktie, a matching vest, suit pants, and dress shoes",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "suit_jacket"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "dress_shirt"},
            {"slot": "tops", "item": "vest", "color": "", "source_phrase": "vest"},
            {"slot": "neckwear", "item": "necktie", "color": "", "source_phrase": "necktie"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "suit_pants"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "dress_shoes"},
            {"slot": "modifiers", "item": "suit", "color": "", "source_phrase": "suit"},
        ],
    },
    {
        "name": "High-Visibility Clothing",
        "aliases": "high-visibility clothing,high-visibility outfit,hi-vis,hi-vis outfit,hi-vis vest outfit,safety vest outfit,reflective vest outfit,construction worker outfit,road worker outfit",
        "outfit_tags": "hard_hat, high-visibility_vest, gloves, pants, boots, reflective_clothing",
        "outfit_natlang": "a yellow hard hat, a bright neon high-visibility vest with reflective stripes, work gloves, sturdy pants, and rugged boots",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "hard_hat"},
            {"slot": "tops", "item": "vest", "color": "", "source_phrase": "high-visibility_vest"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "pants"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "modifiers", "item": "reflective", "color": "", "source_phrase": "reflective_clothing"},
        ],
    },
    {
        "name": "Undersuit",
        "aliases": "undersuit,under suit,inner suit,armor liner,armor underlayer,pilot suit underlayer,bodysuit under armor,under-armor bodysuit",
        "outfit_tags": "(undersuit:1.1), bodysuit, skin_tight, no_armor, no_jacket",
        "outfit_natlang": "a tight-fitting full-body undersuit worn beneath the armor, skin-tight from neck to wrists and ankles, with the outer armor or jacket removed to expose it",
        "slots": [
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "bodysuit"},
            {"slot": "tops", "item": "undersuit", "color": "", "source_phrase": "undersuit"},
            {"slot": "modifiers", "item": "skin_tight", "color": "", "source_phrase": "skin_tight"},
            {"slot": "modifiers", "item": "no_armor", "color": "", "source_phrase": "no_armor"},
            {"slot": "modifiers", "item": "no_jacket", "color": "", "source_phrase": "no_jacket"},
        ],
    },
    {
        "name": "Victorian Maid",
        "aliases": "victorian maid,victorian maid outfit,victorian maid uniform,victorian era maid,edwardian maid,emma maid,classic maid,old fashioned maid",
        "outfit_tags": "mob_cap, puritan_collar, maid_apron, long_dress, white_gloves, white_pantyhose, mary_janes, pocket_watch",
        "outfit_natlang": "a frilled mob cap, a puritan collar at the neck, a long black Victorian dress under a long white frilled maid apron, white gloves, white pantyhose, mary jane shoes, and a pocket watch",
        "slots": [
            {"slot": "headwear", "item": "cap", "color": "", "source_phrase": "mob_cap"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "puritan_collar"},
            {"slot": "tops", "item": "apron", "color": "", "source_phrase": "maid_apron"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "long_dress"},
            {"slot": "handwear", "item": "gloves", "color": "white", "source_phrase": "white_gloves"},
            {"slot": "legwear", "item": "pantyhose", "color": "white", "source_phrase": "white_pantyhose"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "mary_janes"},
            {"slot": "accessories", "item": "pocket_watch", "color": "", "source_phrase": "pocket_watch"},
        ],
    },
    {
        "name": "Toga",
        "aliases": "toga,roman toga,toga outfit,toga costume,roman toga outfit,ancient roman toga,senator toga",
        "outfit_tags": "laurel_crown, (toga:1.1), gold_choker, armlet, sandals, roman_clothes",
        "outfit_natlang": "a laurel crown, a white draped toga covering the body and leaving the right arm bare, a gold choker, gold armlets, and sandals",
        "slots": [
            {"slot": "headwear", "item": "crown", "color": "", "source_phrase": "laurel_crown"},
            {"slot": "dresses", "item": "toga", "color": "", "source_phrase": "toga"},
            {"slot": "neckwear", "item": "choker", "color": "gold", "source_phrase": "gold_choker"},
            {"slot": "accessories", "item": "armlet", "color": "", "source_phrase": "armlet"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "sandals"},
            {"slot": "modifiers", "item": "roman_clothes", "color": "", "source_phrase": "roman_clothes"},
        ],
    },
    {
        "name": "Mecha Pilot Suit",
        "aliases": "mecha pilot suit, mecha pilot outfit, plugsuit, eva pilot suit, evangelion plugsuit, mecha bodysuit, sci-fi pilot suit, mecha cockpit suit",
        "outfit_tags": "(mecha_pilot_suit:1.1), bodysuit, skin_tight, gloves, boots",
        "outfit_natlang": "a skintight full-body mecha pilot bodysuit with technical paneling and color-block adornments, gloves, and boots",
        "slots": [
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "mecha_pilot_suit"},
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "bodysuit"},
            {"slot": "modifiers", "item": "skin_tight", "color": "", "source_phrase": "skin_tight"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
        ],
    },
    {
        "name": "Y2K Fashion",
        "aliases": "y2k,y2k fashion,y2k outfit,y2k style,2000s fashion,early 2000s fashion,early 2000s style,millennium fashion,y2k cosplay",
        "outfit_tags": "butterfly_hair_ornament, sunglasses, tube_top, midriff, arm_warmers, lowleg_pants, denim_skirt, leg_warmers, platform_boots, butterfly_print, (y2k_fashion:1.1)",
        "outfit_natlang": "butterfly hair clips, tinted sunglasses, a cropped tube top exposing the midriff, arm warmers, low-rise pants paired with a denim mini skirt, leg warmers, platform boots, and butterfly print accents",
        "slots": [
            {"slot": "headwear", "item": "hair_ornament", "color": "", "source_phrase": "butterfly_hair_ornament"},
            {"slot": "accessories", "item": "sunglasses", "color": "", "source_phrase": "sunglasses"},
            {"slot": "tops", "item": "tube_top", "color": "", "source_phrase": "tube_top"},
            {"slot": "modifiers", "item": "midriff", "color": "", "source_phrase": "midriff"},
            {"slot": "handwear", "item": "arm_warmers", "color": "", "source_phrase": "arm_warmers"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "lowleg_pants"},
            {"slot": "bottoms", "item": "skirt", "color": "denim", "source_phrase": "denim_skirt"},
            {"slot": "legwear", "item": "leg_warmers", "color": "", "source_phrase": "leg_warmers"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "platform_boots"},
            {"slot": "modifiers", "item": "butterfly_print", "color": "", "source_phrase": "butterfly_print"},
        ],
    },
    {
        "name": "Winter Uniform",
        "aliases": "winter uniform,winter school uniform,winter school outfit,winter seifuku,winter sailor uniform,winter blazer uniform,cold weather school uniform,long-sleeved school uniform",
        "outfit_tags": "(winter_uniform:1.1), school_uniform, long_sleeves, sailor_collar, blazer, cardigan, neckerchief, pleated_skirt, black_pantyhose, loafers",
        "outfit_natlang": "a long-sleeved winter school uniform with a sailor collar and neckerchief, a blazer worn over a knitted cardigan, a pleated skirt, black pantyhose, and brown loafers",
        "slots": [
            {"slot": "tops", "item": "blazer", "color": "", "source_phrase": "blazer"},
            {"slot": "tops", "item": "cardigan", "color": "", "source_phrase": "cardigan"},
            {"slot": "modifiers", "item": "collar", "color": "", "source_phrase": "sailor_collar"},
            {"slot": "modifiers", "item": "long_sleeves", "color": "", "source_phrase": "long_sleeves"},
            {"slot": "neckwear", "item": "neckerchief", "color": "", "source_phrase": "neckerchief"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "legwear", "item": "pantyhose", "color": "black", "source_phrase": "black_pantyhose"},
            {"slot": "footwear", "item": "loafers", "color": "", "source_phrase": "loafers"},
        ],
    },
    {
        "name": "Summer Uniform",
        "aliases": "summer uniform,summer school uniform,summer seifuku,summer serafuku,short sleeve school uniform,school summer uniform,natsufuku",
        "outfit_tags": "(summer_uniform:1.1), school_uniform, serafuku, short_sleeves, sailor_collar, white_shirt, neckerchief, pleated_skirt, kneehighs, loafers",
        "outfit_natlang": "a short-sleeved white sailor-collar serafuku top with a neckerchief, a pleated skirt, white kneehighs, and brown loafers",
        "slots": [
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "modifiers", "item": "sleeves", "color": "", "source_phrase": "short_sleeves"},
            {"slot": "modifiers", "item": "collar", "color": "", "source_phrase": "sailor_collar"},
            {"slot": "neckwear", "item": "neckerchief", "color": "", "source_phrase": "neckerchief"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pleated_skirt"},
            {"slot": "legwear", "item": "kneehighs", "color": "", "source_phrase": "kneehighs"},
            {"slot": "footwear", "item": "loafers", "color": "", "source_phrase": "loafers"},
        ],
    },
    {
        "name": "Yukata",
        "aliases": "yukata,yukata outfit,summer yukata,festival yukata,matsuri yukata,summer kimono,casual kimono,fireworks yukata",
        "outfit_tags": "(yukata:1.1), floral_print, obi, hair_flower, geta, paper_fan",
        "outfit_natlang": "a brightly colored floral-print yukata wrapped left-over-right and tied with a wide obi sash, a hair flower as ornament, wooden geta sandals, and a paper fan in hand",
        "slots": [
            {"slot": "dresses", "item": "yukata", "color": "", "source_phrase": "yukata"},
            {"slot": "modifiers", "item": "print", "color": "floral", "source_phrase": "floral_print"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "obi"},
            {"slot": "accessories", "item": "flower", "color": "", "source_phrase": "hair_flower"},
            {"slot": "footwear", "item": "geta", "color": "", "source_phrase": "geta"},
            {"slot": "accessories", "item": "fan", "color": "", "source_phrase": "paper_fan"},
        ],
    },
    {
        "name": "Normal Suit",
        "aliases": "normal suit, normalsuit, gundam normal suit, gundam pilot suit, gundam spacesuit, gundam pilot spacesuit, mobile suit pilot suit",
        "outfit_tags": "normal_suit_(gundam), space_helmet, mecha_pilot_suit, white_bodysuit, gloves, boots",
        "outfit_natlang": "a space helmet often held in hand, a form-fitting white bodysuit pilot suit anchored to the Gundam normal-suit silhouette, gloves, and boots",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "space_helmet"},
            {"slot": "tops", "item": "bodysuit", "color": "white", "source_phrase": "white_bodysuit"},
            {"slot": "tops", "item": "pilot_suit", "color": "", "source_phrase": "normal_suit_(gundam)"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "gloves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
            {"slot": "modifiers", "item": "mecha_pilot_suit", "color": "", "source_phrase": "mecha_pilot_suit"},
        ],
    },
    {
        "name": "Habit (Nun)",
        "aliases": "habit,nun habit,religious habit,monastic habit,sister habit,convent habit,christian habit",
        "outfit_tags": "nun_headdress, wimple, guimpe, black_veil, scapular, black_robe",
        "outfit_natlang": "a nun headdress with a white wimple and black veil, a white guimpe covering the neck and chest, a dark scapular draped over the shoulders, and a long black robe",
        "slots": [
            {"slot": "headwear", "item": "headdress", "color": "", "source_phrase": "nun_headdress"},
            {"slot": "headwear", "item": "wimple", "color": "", "source_phrase": "wimple"},
            {"slot": "headwear", "item": "veil", "color": "black", "source_phrase": "black_veil"},
            {"slot": "neckwear", "item": "guimpe", "color": "", "source_phrase": "guimpe"},
            {"slot": "accessories", "item": "scapular", "color": "", "source_phrase": "scapular"},
            {"slot": "dresses", "item": "robe", "color": "black", "source_phrase": "black_robe"},
        ],
    },
    {
        "name": "Sailor Uniform",
        "aliases": "sailor uniform,naval uniform,navy uniform,sailor outfit,naval sailor,navy sailor outfit,marine uniform",
        "outfit_tags": "dixie_cup_hat, sailor_collar, sailor_shirt, white_skirt, neckerchief, anchor_symbol",
        "outfit_natlang": "a white dixie cup sailor hat, a sailor-collar white shirt with stripe trim, a white pleated miniskirt, a neckerchief tied at the front, and an anchor emblem on the chest",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "dixie_cup_hat"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "sailor_shirt"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "sailor_collar"},
            {"slot": "bottoms", "item": "skirt", "color": "white", "source_phrase": "white_skirt"},
            {"slot": "accessories", "item": "neckerchief", "color": "", "source_phrase": "neckerchief"},
            {"slot": "accessories", "item": "anchor", "color": "", "source_phrase": "anchor_symbol"},
        ],
    },
    {
        "name": "Decora Fashion",
        "aliases": "decora,decora fashion,decora outfit,decora kei,harajuku decora,decora style,decora kei outfit",
        "outfit_tags": "x_hair_ornament, heart_hair_ornament, star_hair_ornament, too_many_hair_ornaments, hair_bobbles, hoodie, frilled_skirt, layered_skirt, leg_warmers, mary_janes, multiple_bracelets, sticker, bandaid, colorful, decora",
        "outfit_natlang": "many colorful hair clips with x, heart, and star hair ornaments and hair bobbles, a bright printed hoodie or t-shirt, a layered frilled skirt, leg warmers, mary jane shoes, stacks of plastic bracelets on both wrists, stickers and bandaids on the face, and an overall riot of colorful clutter",
        "slots": [
            {"slot": "headwear", "item": "hair_ornament", "color": "", "source_phrase": "x_hair_ornament"},
            {"slot": "headwear", "item": "hair_ornament", "color": "", "source_phrase": "heart_hair_ornament"},
            {"slot": "headwear", "item": "hair_ornament", "color": "", "source_phrase": "star_hair_ornament"},
            {"slot": "headwear", "item": "hair_bobbles", "color": "", "source_phrase": "hair_bobbles"},
            {"slot": "tops", "item": "hoodie", "color": "", "source_phrase": "hoodie"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "frilled_skirt"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "layered_skirt"},
            {"slot": "legwear", "item": "leg_warmers", "color": "", "source_phrase": "leg_warmers"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "mary_janes"},
            {"slot": "accessories", "item": "bracelets", "color": "", "source_phrase": "multiple_bracelets"},
            {"slot": "modifiers", "item": "ornaments", "color": "", "source_phrase": "too_many_hair_ornaments"},
            {"slot": "modifiers", "item": "sticker", "color": "", "source_phrase": "sticker"},
            {"slot": "modifiers", "item": "bandaid", "color": "", "source_phrase": "bandaid"},
            {"slot": "modifiers", "item": "colorful", "color": "", "source_phrase": "colorful"},
        ],
    },
    {
        "name": "Tuxedo",
        "aliases": "tuxedo,tux,tuxedo outfit,formal evening wear,black tie,black-tie outfit,evening tuxedo,formal tuxedo",
        "outfit_tags": "(tuxedo:1.1), suit_jacket, dress_shirt, black_bowtie, cummerbund, suit_pants, dress_shoes, formal_clothes",
        "outfit_natlang": "a black tuxedo jacket with satin lapels over a white dress shirt, a black bowtie at the neck, a cummerbund at the waist, matching black tuxedo trousers, and black formal dress shoes",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "suit_jacket"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "dress_shirt"},
            {"slot": "neckwear", "item": "bowtie", "color": "black", "source_phrase": "black_bowtie"},
            {"slot": "accessories", "item": "cummerbund", "color": "", "source_phrase": "cummerbund"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "suit_pants"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "dress_shoes"},
            {"slot": "modifiers", "item": "", "color": "", "source_phrase": "tuxedo"},
            {"slot": "modifiers", "item": "", "color": "", "source_phrase": "formal_clothes"},
        ],
    },
    {
        "name": "Gakuran",
        "aliases": "gakuran,gakuran uniform,japanese boys school uniform,japanese male school uniform,boys school uniform,male school uniform,tsume-eri uniform",
        "outfit_tags": "(gakuran:1.1), school_uniform, high_collar, black_jacket, gold_buttons, white_shirt, black_pants, loafers",
        "outfit_natlang": "a black gakuran jacket with a stand collar buttoned to the throat, gold buttons down the front, a white dress shirt underneath, straight-leg black trousers, and black loafers",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "black", "source_phrase": "black_jacket"},
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "bottoms", "item": "pants", "color": "black", "source_phrase": "black_pants"},
            {"slot": "footwear", "item": "loafers", "color": "", "source_phrase": "loafers"},
            {"slot": "modifiers", "item": "collar", "color": "", "source_phrase": "high_collar"},
            {"slot": "modifiers", "item": "buttons", "color": "gold", "source_phrase": "gold_buttons"},
        ],
    },
    {
        "name": "Sundress",
        "aliases": "sundress,sundress outfit,summer dress,summer dress outfit,sun dress,floral sundress,casual summer dress",
        "outfit_tags": "sun_hat, (sundress:1.1), floral_print, sandals",
        "outfit_natlang": "a wide-brimmed sun hat, a light floral-print sundress with thin straps and bare shoulders, and flat sandals",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "sun_hat"},
            {"slot": "dresses", "item": "sundress", "color": "", "source_phrase": "sundress"},
            {"slot": "modifiers", "item": "print", "color": "floral", "source_phrase": "floral_print"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "sandals"},
        ],
    },
    {
        "name": "Tracksuit",
        "aliases": "tracksuit,track suit,track suit outfit,athletic tracksuit,jogging suit,warm-up suit,sweatsuit",
        "outfit_tags": "track_suit, track_jacket, track_pants, sneakers",
        "outfit_natlang": "a zip-up track jacket with stripes down the sleeves, matching track pants with stripes down the legs, and sneakers",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "track_jacket"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "track_pants"},
            {"slot": "footwear", "item": "sneakers", "color": "", "source_phrase": "sneakers"},
        ],
    },
    {
        "name": "Evening Gown",
        "aliases": "evening gown,evening dress,formal gown,formal dress,gala dress,gala gown,ballgown,ball gown",
        "outfit_tags": "(evening_gown:1.1), bare_shoulders, cleavage, elbow_gloves, pearl_necklace, earrings, high_heels",
        "outfit_natlang": "a long floor-length evening gown with bare shoulders and cleavage, white elbow-length opera gloves, a pearl necklace, earrings, and high heels",
        "slots": [
            {"slot": "dresses", "item": "gown", "color": "", "source_phrase": "evening_gown"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "elbow_gloves"},
            {"slot": "neckwear", "item": "necklace", "color": "", "source_phrase": "pearl_necklace"},
            {"slot": "accessories", "item": "earrings", "color": "", "source_phrase": "earrings"},
            {"slot": "footwear", "item": "heels", "color": "", "source_phrase": "high_heels"},
            {"slot": "modifiers", "item": "bare_shoulders", "color": "", "source_phrase": "bare_shoulders"},
            {"slot": "modifiers", "item": "cleavage", "color": "", "source_phrase": "cleavage"},
        ],
    },
    {
        "name": "Cocktail Dress",
        "aliases": "cocktail dress,cocktail dress outfit,little black dress,party dress,semi-formal dress,short evening dress,club dress,lbd",
        "outfit_tags": "black_dress, (cocktail_dress:1.1), short_dress, sleeveless_dress, plunging_neckline, jewelry, stiletto_heels",
        "outfit_natlang": "a sleeveless short black cocktail dress with a plunging neckline, fitted to mid-thigh, accented by simple jewelry and stiletto heels",
        "slots": [
            {"slot": "dresses", "item": "dress", "color": "black", "source_phrase": "black_dress"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "cocktail_dress"},
            {"slot": "modifiers", "item": "length", "color": "", "source_phrase": "short_dress"},
            {"slot": "modifiers", "item": "sleeves", "color": "", "source_phrase": "sleeveless_dress"},
            {"slot": "modifiers", "item": "neckline", "color": "", "source_phrase": "plunging_neckline"},
            {"slot": "accessories", "item": "jewelry", "color": "", "source_phrase": "jewelry"},
            {"slot": "footwear", "item": "heels", "color": "", "source_phrase": "stiletto_heels"},
        ],
    },
    {
        "name": "Flight Attendant Uniform",
        "aliases": "flight attendant,flight attendant uniform,flight attendant outfit,stewardess,stewardess outfit,cabin crew,cabin crew uniform,air hostess,air hostess outfit",
        "outfit_tags": "flight_attendant_hat, black_jacket, white_shirt, neckerchief, pencil_skirt, black_pantyhose, high_heels, skirt_suit",
        "outfit_natlang": "a flight attendant hat, a tailored black jacket over a white shirt, a neckerchief at the throat, a pencil skirt, black pantyhose, and high heels",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "flight_attendant_hat"},
            {"slot": "tops", "item": "jacket", "color": "black", "source_phrase": "black_jacket"},
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "neckwear", "item": "neckerchief", "color": "", "source_phrase": "neckerchief"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pencil_skirt"},
            {"slot": "legwear", "item": "pantyhose", "color": "black", "source_phrase": "black_pantyhose"},
            {"slot": "footwear", "item": "heels", "color": "", "source_phrase": "high_heels"},
            {"slot": "accessories", "item": "skirt_suit", "color": "", "source_phrase": "skirt_suit"},
        ],
    },
    {
        "name": "Geisha",
        "aliases": "geisha,geisha outfit,geisha cosplay,geiko,maiko,apprentice geisha,traditional geisha",
        "outfit_tags": "(geisha:1.1), kanzashi, hair_flower, nihongami, red_lips, makeup, kimono, susohiki, wide_sleeves, floral_print, obi, tabi, okobo",
        "outfit_natlang": "an elaborate nihongami updo decorated with kanzashi hairpins and a hair flower, painted red lips, a long-sleeved floral-print kimono with a trailing susohiki hem, a wide obi sash tied at the waist, white tabi split-toe socks, and black-lacquered okobo platform sandals",
        "slots": [
            {"slot": "headwear", "item": "kanzashi", "color": "", "source_phrase": "kanzashi"},
            {"slot": "headwear", "item": "hair_flower", "color": "", "source_phrase": "hair_flower"},
            {"slot": "dresses", "item": "kimono", "color": "", "source_phrase": "kimono"},
            {"slot": "dresses", "item": "susohiki", "color": "", "source_phrase": "susohiki"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "obi"},
            {"slot": "legwear", "item": "tabi", "color": "", "source_phrase": "tabi"},
            {"slot": "footwear", "item": "okobo", "color": "", "source_phrase": "okobo"},
            {"slot": "modifiers", "item": "nihongami", "color": "", "source_phrase": "nihongami"},
            {"slot": "modifiers", "item": "red_lips", "color": "", "source_phrase": "red_lips"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
            {"slot": "modifiers", "item": "floral_print", "color": "", "source_phrase": "floral_print"},
            {"slot": "modifiers", "item": "makeup", "color": "", "source_phrase": "makeup"},
        ],
    },
    {
        "name": "Ball Gown",
        "aliases": "ball gown,ball gown outfit,princess dress,princess gown,fairy tale dress,fairytale gown,formal ball dress,princess ball gown",
        "outfit_tags": "tiara, (gown:1.1), strapless_dress, puffy_sleeves, petticoat, elbow_gloves, high_heels",
        "outfit_natlang": "a tiara perched on the head, a strapless gown with a fitted bodice and puffy sleeves, a full skirt supported by a petticoat underneath, white elbow-length gloves, and high heels",
        "slots": [
            {"slot": "headwear", "item": "tiara", "color": "", "source_phrase": "tiara"},
            {"slot": "dresses", "item": "gown", "color": "", "source_phrase": "gown"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "strapless_dress"},
            {"slot": "modifiers", "item": "sleeves", "color": "", "source_phrase": "puffy_sleeves"},
            {"slot": "modifiers", "item": "petticoat", "color": "", "source_phrase": "petticoat"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "elbow_gloves"},
            {"slot": "footwear", "item": "heels", "color": "", "source_phrase": "high_heels"},
        ],
    },
    {
        "name": "Lederhosen",
        "aliases": "lederhosen,lederhosen outfit,bavarian outfit,bavarian costume,oktoberfest outfit,german traditional outfit,bavarian leather shorts,alpine outfit",
        "outfit_tags": "bowler_hat, hat_feather, white_shirt, (lederhosen:1.1), suspenders, white_socks, boots",
        "outfit_natlang": "a bowler hat with a feather, a white shirt, leather lederhosen shorts with H-shaped suspenders, white knee socks, and boots",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "bowler_hat"},
            {"slot": "tops", "item": "shirt", "color": "white", "source_phrase": "white_shirt"},
            {"slot": "bottoms", "item": "lederhosen", "color": "", "source_phrase": "lederhosen"},
            {"slot": "legwear", "item": "socks", "color": "white", "source_phrase": "white_socks"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
            {"slot": "accessories", "item": "suspenders", "color": "", "source_phrase": "suspenders"},
            {"slot": "accessories", "item": "feather", "color": "", "source_phrase": "hat_feather"},
        ],
    },
    {
        "name": "Wedding Dress",
        "aliases": "wedding dress,bridal gown,wedding gown,bride outfit,western wedding dress,white wedding dress,bridal dress",
        "outfit_tags": "bridal_veil, tiara, (wedding_dress:1.1), bridal_gauntlets, bouquet",
        "outfit_natlang": "a bridal veil draped over the head, a tiara, a long white wedding dress with lace and a flowing train, elbow-length bridal gauntlets, and a bouquet of white roses held in both hands",
        "slots": [
            {"slot": "headwear", "item": "veil", "color": "", "source_phrase": "bridal_veil"},
            {"slot": "headwear", "item": "tiara", "color": "", "source_phrase": "tiara"},
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "wedding_dress"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "bridal_gauntlets"},
            {"slot": "accessories", "item": "bouquet", "color": "", "source_phrase": "bouquet"},
        ],
    },
    {
        "name": "Dirndl",
        "aliases": "dirndl,dirndl outfit,dirndl dress,oktoberfest dress,oktoberfest outfit,bavarian dress,german barmaid outfit,traditional bavarian dress",
        "outfit_tags": "puffy_short_sleeves, blouse, bodice, (dirndl:1.1), waist_apron, thighhighs, cleavage",
        "outfit_natlang": "a low-cut white blouse with puffy short sleeves under a fitted dark bodice with corseted lacing, a full-skirted dirndl dress, a waist apron tied with a bow at the front, and thighhighs",
        "slots": [
            {"slot": "tops", "item": "blouse", "color": "", "source_phrase": "blouse"},
            {"slot": "tops", "item": "bodice", "color": "", "source_phrase": "bodice"},
            {"slot": "dresses", "item": "dirndl", "color": "", "source_phrase": "dirndl"},
            {"slot": "accessories", "item": "apron", "color": "", "source_phrase": "waist_apron"},
            {"slot": "legwear", "item": "thighhighs", "color": "", "source_phrase": "thighhighs"},
            {"slot": "modifiers", "item": "puffy_short_sleeves", "color": "", "source_phrase": "puffy_short_sleeves"},
            {"slot": "modifiers", "item": "cleavage", "color": "", "source_phrase": "cleavage"},
        ],
    },
    {
        "name": "Bikini",
        "aliases": "bikini,two-piece swimsuit,two piece swimsuit,bikini swimsuit,bikini outfit,basic bikini,swim bikini",
        "outfit_tags": "(bikini:1.1)",
        "outfit_natlang": "a basic two-piece bikini with a bra-like top and a panty-like bottom, exposing the midriff",
        "slots": [
            {"slot": "tops", "item": "bikini", "color": "", "source_phrase": "bikini"},
        ],
    },
    {
        "name": "Hazmat Suit",
        "aliases": "hazmat suit,hazmat,biohazard suit,hazard suit,chemical suit,protective suit,hazmat outfit,hazmat cosplay",
        "outfit_tags": "hazmat suit, gas mask, rubber gloves, rubber boots",
        "outfit_natlang": "a full-body sealed hazmat suit with hood, a gas mask covering the face, rubber gloves, and rubber boots",
        "slots": [
            {"slot": "headwear", "item": "gas mask", "color": "", "source_phrase": "gas mask"},
            {"slot": "dresses", "item": "hazmat suit", "color": "", "source_phrase": "hazmat suit"},
            {"slot": "handwear", "item": "gloves", "color": "rubber", "source_phrase": "rubber gloves"},
            {"slot": "footwear", "item": "boots", "color": "rubber", "source_phrase": "rubber boots"},
        ],
    },
    {
        "name": "Hoodie Outfit",
        "aliases": "hoodie outfit,casual hoodie outfit,streetwear hoodie,hoodie and jeans,everyday hoodie outfit,hoodie outfit cosplay,casual streetwear",
        "outfit_tags": "hoodie, drawstring, hood_down, jeans, sneakers",
        "outfit_natlang": "a casual pullover hoodie with drawstrings and the hood down, blue jeans, and sneakers",
        "slots": [
            {"slot": "tops", "item": "hoodie", "color": "", "source_phrase": "hoodie"},
            {"slot": "bottoms", "item": "jeans", "color": "", "source_phrase": "jeans"},
            {"slot": "footwear", "item": "sneakers", "color": "", "source_phrase": "sneakers"},
            {"slot": "accessories", "item": "drawstring", "color": "", "source_phrase": "drawstring"},
            {"slot": "modifiers", "item": "hood_down", "color": "", "source_phrase": "hood_down"},
        ],
    },
    {
        "name": "Volleyball Uniform",
        "aliases": "volleyball uniform,volleyball outfit,volleyball jersey,volleyball kit,volleyball player outfit,volleyball cosplay,volleyball player uniform",
        "outfit_tags": "(volleyball_uniform:1.1), jersey, sleeveless, buruma, knee_pads, elbow_pads, uwabaki, volleyball_(object)",
        "outfit_natlang": "a sleeveless volleyball jersey, buruma gym shorts, knee pads on the legs, elbow pads on the arms, white indoor shoes, and a volleyball held as a prop",
        "slots": [
            {"slot": "tops", "item": "jersey", "color": "", "source_phrase": "jersey"},
            {"slot": "modifiers", "item": "sleeveless", "color": "", "source_phrase": "sleeveless"},
            {"slot": "bottoms", "item": "buruma", "color": "", "source_phrase": "buruma"},
            {"slot": "legwear", "item": "knee_pads", "color": "", "source_phrase": "knee_pads"},
            {"slot": "handwear", "item": "elbow_pads", "color": "", "source_phrase": "elbow_pads"},
            {"slot": "footwear", "item": "uwabaki", "color": "", "source_phrase": "uwabaki"},
            {"slot": "accessories", "item": "volleyball", "color": "", "source_phrase": "volleyball_(object)"},
        ],
    },
    {
        "name": "Hawaiian Outfit",
        "aliases": "hawaiian,hawaiian outfit,luau outfit,luau,aloha outfit,hawaiian costume,tropical outfit,hawaiian cosplay",
        "outfit_tags": "hair_flower, hawaiian_shirt, floral_print, hibiscus_print, grass_skirt, lei, sandals",
        "outfit_natlang": "a flower tucked behind the ear, a loose short-sleeve hawaiian shirt with vibrant floral and hibiscus prints, a grass skirt, a flower lei around the neck, and sandals",
        "slots": [
            {"slot": "headwear", "item": "flower", "color": "", "source_phrase": "hair_flower"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "hawaiian_shirt"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "grass_skirt"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "sandals"},
            {"slot": "neckwear", "item": "lei", "color": "", "source_phrase": "lei"},
            {"slot": "modifiers", "item": "floral_print", "color": "", "source_phrase": "floral_print"},
            {"slot": "modifiers", "item": "hibiscus_print", "color": "", "source_phrase": "hibiscus_print"},
        ],
    },
    {
        "name": "Chef Uniform",
        "aliases": "chef uniform,chef outfit,chef,chef cosplay,cook uniform,cook outfit,chef whites,chef attire",
        "outfit_tags": "chef_hat, toque_blanche, white_jacket, double-breasted, white_apron, black_pants",
        "outfit_natlang": "a tall white toque blanche chef hat, a white double-breasted jacket, a white apron tied at the waist, and black pants",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "white", "source_phrase": "toque_blanche"},
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "chef_hat"},
            {"slot": "tops", "item": "jacket", "color": "white", "source_phrase": "white_jacket"},
            {"slot": "tops", "item": "apron", "color": "white", "source_phrase": "white_apron"},
            {"slot": "bottoms", "item": "pants", "color": "black", "source_phrase": "black_pants"},
            {"slot": "modifiers", "item": "", "color": "", "source_phrase": "double-breasted"},
        ],
    },
    {
        "name": "Lab Coat",
        "aliases": "lab coat,lab coat outfit,scientist outfit,scientist cosplay,doctor outfit,doctor cosplay,researcher outfit,white coat outfit",
        "outfit_tags": "(lab_coat:1.1), dress_shirt, pencil_skirt, black_pantyhose, pumps, glasses, stethoscope, clipboard",
        "outfit_natlang": "an open white lab coat over a buttoned dress shirt, a pencil skirt, black pantyhose, pumps, glasses, and a stethoscope draped around the neck with a clipboard in hand",
        "slots": [
            {"slot": "tops", "item": "coat", "color": "", "source_phrase": "lab_coat"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "dress_shirt"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "pencil_skirt"},
            {"slot": "legwear", "item": "pantyhose", "color": "black", "source_phrase": "black_pantyhose"},
            {"slot": "footwear", "item": "pumps", "color": "", "source_phrase": "pumps"},
            {"slot": "accessories", "item": "glasses", "color": "", "source_phrase": "glasses"},
            {"slot": "accessories", "item": "stethoscope", "color": "", "source_phrase": "stethoscope"},
            {"slot": "accessories", "item": "clipboard", "color": "", "source_phrase": "clipboard"},
        ],
    },
    {
        "name": "Detective Outfit",
        "aliases": "detective,detective outfit,detective coat,noir detective,private eye,private eye outfit,hardboiled detective,film noir detective,trench coat and fedora",
        "outfit_tags": "fedora, trench_coat, suit_jacket, dress_shirt, necktie, dress_pants, dress_shoes",
        "outfit_natlang": "a fedora, a long beige trench coat over a dark suit jacket with a white dress shirt and a necktie, dark dress pants, and dress shoes",
        "slots": [
            {"slot": "headwear", "item": "fedora", "color": "", "source_phrase": "fedora"},
            {"slot": "tops", "item": "coat", "color": "", "source_phrase": "trench_coat"},
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "suit_jacket"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "dress_shirt"},
            {"slot": "neckwear", "item": "necktie", "color": "", "source_phrase": "necktie"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "dress_pants"},
            {"slot": "footwear", "item": "shoes", "color": "", "source_phrase": "dress_shoes"},
        ],
    },
    {
        "name": "Punk Fashion",
        "aliases": "punk,punk fashion,punk outfit,punk rock outfit,punk rocker,street punk,punk style,77 punk",
        "outfit_tags": "punk, leather_jacket, band_shirt, torn_jeans, studded_belt, fishnets, combat_boots, spiked_collar, spiked_bracelet, safety_pin, mohawk",
        "outfit_natlang": "a black leather jacket over a band shirt, torn jeans held up with a studded belt, fishnet legwear, scuffed combat boots, a spiked collar with a spiked bracelet, safety pins fastened through torn fabric, and a mohawk hairstyle",
        "slots": [
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "leather_jacket"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "band_shirt"},
            {"slot": "bottoms", "item": "jeans", "color": "", "source_phrase": "torn_jeans"},
            {"slot": "legwear", "item": "fishnets", "color": "", "source_phrase": "fishnets"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "combat_boots"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "spiked_collar"},
            {"slot": "accessories", "item": "belt", "color": "", "source_phrase": "studded_belt"},
            {"slot": "accessories", "item": "bracelet", "color": "", "source_phrase": "spiked_bracelet"},
            {"slot": "accessories", "item": "safety_pin", "color": "", "source_phrase": "safety_pin"},
            {"slot": "modifiers", "item": "hairstyle", "color": "", "source_phrase": "mohawk"},
        ],
    },
    {
        "name": "Yoga Outfit",
        "aliases": "yoga outfit,yoga clothes,yoga wear,yoga attire,yogawear,athleisure outfit,yoga pants outfit,yoga session outfit",
        "outfit_tags": "sports_bra, yoga_pants, yoga_mat",
        "outfit_natlang": "a fitted sports bra, stretchy yoga pants, and a rolled yoga mat carried under one arm",
        "slots": [
            {"slot": "tops", "item": "sports_bra", "color": "", "source_phrase": "sports_bra"},
            {"slot": "bottoms", "item": "yoga_pants", "color": "", "source_phrase": "yoga_pants"},
            {"slot": "accessories", "item": "yoga_mat", "color": "", "source_phrase": "yoga_mat"},
        ],
    },
    {
        "name": "Hiking Outfit",
        "aliases": "hiking,hiking outfit,hiker outfit,mountain climbing outfit,trekking outfit,trail outfit,hiking clothes,outdoor adventure outfit",
        "outfit_tags": "bucket_hat, windbreaker, cargo_pants, work_boots, backpack, hiking_pole",
        "outfit_natlang": "a bucket hat, a windbreaker over a long-sleeved shirt, cargo pants, sturdy work boots, a large backpack on the back, and a hiking pole in hand",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "bucket_hat"},
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "windbreaker"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "cargo_pants"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "work_boots"},
            {"slot": "accessories", "item": "backpack", "color": "", "source_phrase": "backpack"},
            {"slot": "accessories", "item": "hiking pole", "color": "", "source_phrase": "hiking_pole"},
        ],
    },
    {
        "name": "Spy Outfit",
        "aliases": "spy,spy outfit,spy suit,covert agent outfit,secret agent outfit,black widow outfit,bond girl outfit,female spy gear,espionage outfit",
        "outfit_tags": "earpiece, sunglasses, black_bodysuit, skin_tight, chest_harness, utility_belt, black_gloves, thigh_holster, handgun",
        "outfit_natlang": "a small earpiece and sunglasses, a sleek skin-tight black bodysuit with a chest harness over it, a utility belt, black gloves, a thigh holster strapped to one leg holding a handgun",
        "slots": [
            {"slot": "accessories", "item": "earpiece", "color": "", "source_phrase": "earpiece"},
            {"slot": "accessories", "item": "sunglasses", "color": "", "source_phrase": "sunglasses"},
            {"slot": "dresses", "item": "bodysuit", "color": "black", "source_phrase": "black_bodysuit"},
            {"slot": "modifiers", "item": "fit", "color": "", "source_phrase": "skin_tight"},
            {"slot": "accessories", "item": "harness", "color": "", "source_phrase": "chest_harness"},
            {"slot": "accessories", "item": "belt", "color": "", "source_phrase": "utility_belt"},
            {"slot": "handwear", "item": "gloves", "color": "black", "source_phrase": "black_gloves"},
            {"slot": "accessories", "item": "holster", "color": "", "source_phrase": "thigh_holster"},
            {"slot": "accessories", "item": "handgun", "color": "", "source_phrase": "handgun"},
        ],
    },
    {
        "name": "1950s Housewife",
        "aliases": "1950s housewife,1950s housewife outfit,fifties housewife,vintage housewife,retro housewife,pin-up housewife,1950s pin-up,vintage pinup outfit",
        "outfit_tags": "pinup_(style), 1950s_(style), headscarf, polka_dot_dress, white_apron, petticoat, red_lips, pumps",
        "outfit_natlang": "a cloth headscarf knotted at the top of the head, a fitted polka-dot dress with a full skirt, a frilled white apron tied at the waist, a ruffled petticoat under the skirt, red lipstick, and patent pumps",
        "slots": [
            {"slot": "headwear", "item": "headscarf", "color": "", "source_phrase": "headscarf"},
            {"slot": "dresses", "item": "dress", "color": "polka_dot", "source_phrase": "polka_dot_dress"},
            {"slot": "tops", "item": "apron", "color": "white", "source_phrase": "white_apron"},
            {"slot": "dresses", "item": "petticoat", "color": "", "source_phrase": "petticoat"},
            {"slot": "footwear", "item": "pumps", "color": "", "source_phrase": "pumps"},
            {"slot": "modifiers", "item": "lips", "color": "red", "source_phrase": "red_lips"},
            {"slot": "modifiers", "item": "style", "color": "", "source_phrase": "pinup_(style)"},
            {"slot": "modifiers", "item": "style", "color": "", "source_phrase": "1950s_(style)"},
        ],
    },
    {
        "name": "School Swimsuit",
        "aliases": "school swimsuit, sukumizu, school issued swimsuit, japanese school swimsuit, navy school swimsuit, schoolgirl swimsuit, school one-piece swimsuit",
        "outfit_tags": "(school_swimsuit:1.1), blue_one-piece_swimsuit, name_tag, covered_navel",
        "outfit_natlang": "a navy blue one-piece school swimsuit with a white name tag stitched across the chest and a covered navel",
        "slots": [
            {"slot": "tops", "item": "swimsuit", "color": "", "source_phrase": "school_swimsuit"},
            {"slot": "tops", "item": "one-piece", "color": "blue", "source_phrase": "blue_one-piece_swimsuit"},
            {"slot": "accessories", "item": "name_tag", "color": "", "source_phrase": "name_tag"},
            {"slot": "modifiers", "item": "covered_navel", "color": "", "source_phrase": "covered_navel"},
        ],
    },
    {
        "name": "Jersey Maid",
        "aliases": "jersey maid,jersey maid outfit,tracksuit maid,track suit maid,athletic maid,sporty maid,sportswear maid",
        "outfit_tags": "maid_headdress, track_jacket, maid_apron, white_apron, frilled_apron, loose_socks",
        "outfit_natlang": "a maid headdress, a track jacket worn as the base garment, a frilly white maid apron tied over the jacket, and loose white socks",
        "slots": [
            {"slot": "headwear", "item": "headdress", "color": "", "source_phrase": "maid_headdress"},
            {"slot": "tops", "item": "jacket", "color": "", "source_phrase": "track_jacket"},
            {"slot": "tops", "item": "apron", "color": "", "source_phrase": "maid_apron"},
            {"slot": "tops", "item": "apron", "color": "white", "source_phrase": "white_apron"},
            {"slot": "legwear", "item": "socks", "color": "", "source_phrase": "loose_socks"},
            {"slot": "modifiers", "item": "frilled_apron", "color": "", "source_phrase": "frilled_apron"},
        ],
    },
    {
        "name": "Longpao",
        "aliases": "longpao,dragon robe,chinese dragon robe,imperial dragon robe,emperor robe,emperors robe,longpao outfit,chinese imperial robe",
        "outfit_tags": "(longpao:1.1), mian_guan, mandarin_collar, dragon_print, wide_sleeves, sash, embroidery",
        "outfit_natlang": "a mian guan crown with jade-bead strands, a long imperial robe with a mandarin collar and wide sleeves embroidered with dragon-print motifs, and a sash at the waist",
        "slots": [
            {"slot": "headwear", "item": "crown", "color": "", "source_phrase": "mian_guan"},
            {"slot": "dresses", "item": "robe", "color": "", "source_phrase": "longpao"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "mandarin_collar"},
            {"slot": "modifiers", "item": "dragon_print", "color": "", "source_phrase": "dragon_print"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
            {"slot": "accessories", "item": "sash", "color": "", "source_phrase": "sash"},
            {"slot": "modifiers", "item": "embroidery", "color": "", "source_phrase": "embroidery"},
        ],
    },
    {
        "name": "Rash Guard",
        "aliases": "rash guard,rash guard outfit,rashguard,swim shirt,long sleeve swim top,athletic swim top,rash vest,rashie",
        "outfit_tags": "(rash_guard:1.1), long_sleeves, raglan_sleeves, bikini_bottom, sandals, goggles_on_head",
        "outfit_natlang": "a long-sleeved rash guard with raglan sleeves, a bikini bottom, swim goggles resting on the head, and sandals",
        "slots": [
            {"slot": "tops", "item": "rash_guard", "color": "", "source_phrase": "rash_guard"},
            {"slot": "bottoms", "item": "bikini_bottom", "color": "", "source_phrase": "bikini_bottom"},
            {"slot": "footwear", "item": "sandals", "color": "", "source_phrase": "sandals"},
            {"slot": "accessories", "item": "goggles", "color": "", "source_phrase": "goggles_on_head"},
            {"slot": "modifiers", "item": "long_sleeves", "color": "", "source_phrase": "long_sleeves"},
            {"slot": "modifiers", "item": "raglan_sleeves", "color": "", "source_phrase": "raglan_sleeves"},
        ],
    },
    {
        "name": "Fundoshi",
        "aliases": "fundoshi,fundoshi outfit,loincloth,japanese loincloth,festival fundoshi,sumo fundoshi,traditional japanese loincloth",
        "outfit_tags": "hachimaki, sarashi, (fundoshi:1.1), geta",
        "outfit_natlang": "a twisted hachimaki headband, a sarashi cloth wrapped around the chest and midriff, a fundoshi loincloth around the hips and between the legs, and wooden geta sandals",
        "slots": [
            {"slot": "headwear", "item": "hachimaki", "color": "", "source_phrase": "hachimaki"},
            {"slot": "tops", "item": "sarashi", "color": "", "source_phrase": "sarashi"},
            {"slot": "bottoms", "item": "fundoshi", "color": "", "source_phrase": "fundoshi"},
            {"slot": "footwear", "item": "geta", "color": "", "source_phrase": "geta"},
        ],
    },
    {
        "name": "Valkyrie Outfit",
        "aliases": "valkyrie, valkyrie outfit, valkyrie armor, valkyrie cosplay, norse valkyrie, winged helmet armor, shieldmaiden outfit, valkyrja",
        "outfit_tags": "valkyrie, winged_helmet, armored_dress, breastplate, pauldrons, gauntlets, armored_boots, cape, spear, shield",
        "outfit_natlang": "a winged helmet, an armored dress with a polished metal breastplate, pauldrons over the shoulders, a flowing cape at the back, gauntlets on the hands, armored boots on the feet, a spear gripped in one hand, and a round shield held at the side",
        "slots": [
            {"slot": "headwear", "item": "helmet", "color": "", "source_phrase": "winged_helmet"},
            {"slot": "dresses", "item": "dress", "color": "armored", "source_phrase": "armored_dress"},
            {"slot": "tops", "item": "breastplate", "color": "", "source_phrase": "breastplate"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "footwear", "item": "boots", "color": "armored", "source_phrase": "armored_boots"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "accessories", "item": "cape", "color": "", "source_phrase": "cape"},
            {"slot": "accessories", "item": "spear", "color": "", "source_phrase": "spear"},
            {"slot": "accessories", "item": "shield", "color": "", "source_phrase": "shield"},
        ],
    },
    {
        "name": "Priest",
        "aliases": "priest,priest outfit,priest cosplay,catholic priest,christian priest outfit,priestly outfit,clergyman outfit,father outfit",
        "outfit_tags": "biretta, clerical_collar, cassock, stole, black_robe, rosary",
        "outfit_natlang": "a black biretta, a white clerical collar, a long black cassock with a stole draped around the neck, a black robe over it, and a rosary in hand",
        "slots": [
            {"slot": "headwear", "item": "biretta", "color": "", "source_phrase": "biretta"},
            {"slot": "neckwear", "item": "clerical collar", "color": "", "source_phrase": "clerical_collar"},
            {"slot": "dresses", "item": "cassock", "color": "", "source_phrase": "cassock"},
            {"slot": "tops", "item": "robe", "color": "black", "source_phrase": "black_robe"},
            {"slot": "accessories", "item": "stole", "color": "", "source_phrase": "stole"},
            {"slot": "accessories", "item": "rosary", "color": "", "source_phrase": "rosary"},
        ],
    },
    {
        "name": "Meiji Schoolgirl Uniform",
        "aliases": "meiji schoolgirl uniform,meiji schoolgirl outfit,haikara-san,haikara san outfit,taisho schoolgirl,taisho schoolgirl uniform,hakama schoolgirl,kimono and hakama school uniform",
        "outfit_tags": "(meiji_schoolgirl_uniform:1.1), kimono, yagasuri, hakama_skirt, red_hakama, lace-up_boots, hair_bow",
        "outfit_natlang": "a kimono with a yagasuri arrow-feather pattern, a maroon hakama skirt tied at the waist over the kimono, high lace-up brown boots, and a large hair bow",
        "slots": [
            {"slot": "tops", "item": "kimono", "color": "", "source_phrase": "kimono"},
            {"slot": "bottoms", "item": "hakama", "color": "red", "source_phrase": "red_hakama"},
            {"slot": "bottoms", "item": "hakama", "color": "", "source_phrase": "hakama_skirt"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "lace-up_boots"},
            {"slot": "accessories", "item": "bow", "color": "", "source_phrase": "hair_bow"},
            {"slot": "modifiers", "item": "pattern", "color": "", "source_phrase": "yagasuri"},
        ],
    },
    {
        "name": "Oiran",
        "aliases": "oiran,oiran outfit,oiran cosplay,courtesan,japanese courtesan,edo courtesan,yoshiwara courtesan,tayuu",
        "outfit_tags": "(oiran:1.1), kanzashi, datehyogo, nihongami, layered_kimono, floral_print, wide_sleeves, manaita_obi, koma-geta",
        "outfit_natlang": "elaborate kanzashi hairpins arranged in a tall datehyogo nihongami hairstyle, an opulent layered floral-print kimono with wide sleeves, a thickly padded manaita obi tied at the front, and tall platform koma-geta sandals",
        "slots": [
            {"slot": "headwear", "item": "kanzashi", "color": "", "source_phrase": "kanzashi"},
            {"slot": "headwear", "item": "hairstyle", "color": "", "source_phrase": "datehyogo"},
            {"slot": "headwear", "item": "hairstyle", "color": "", "source_phrase": "nihongami"},
            {"slot": "dresses", "item": "kimono", "color": "", "source_phrase": "layered_kimono"},
            {"slot": "accessories", "item": "obi", "color": "", "source_phrase": "manaita_obi"},
            {"slot": "footwear", "item": "geta", "color": "", "source_phrase": "koma-geta"},
            {"slot": "modifiers", "item": "floral_print", "color": "", "source_phrase": "floral_print"},
            {"slot": "modifiers", "item": "wide_sleeves", "color": "", "source_phrase": "wide_sleeves"},
        ],
    },
    {
        "name": "Competition Swimsuit",
        "aliases": "competition swimsuit,competitive swimsuit,racing swimsuit,swimmer outfit,competitive swimwear,swim team outfit,competition one-piece,competition swimwear",
        "outfit_tags": "swim_cap, (competition_swimsuit:1.1), racerback, highleg, swim_goggles",
        "outfit_natlang": "a swim cap, a sleek competition one-piece swimsuit with a racerback and high-cut leg openings, and swim goggles",
        "slots": [
            {"slot": "headwear", "item": "cap", "color": "", "source_phrase": "swim_cap"},
            {"slot": "tops", "item": "swimsuit", "color": "", "source_phrase": "competition_swimsuit"},
            {"slot": "modifiers", "item": "racerback", "color": "", "source_phrase": "racerback"},
            {"slot": "modifiers", "item": "highleg", "color": "", "source_phrase": "highleg"},
            {"slot": "accessories", "item": "goggles", "color": "", "source_phrase": "swim_goggles"},
        ],
    },
    {
        "name": "Cassock",
        "aliases": "cassock,catholic priest robe,clerical robe,priest cassock,priest outfit,clergy robe",
        "outfit_tags": "(cassock:1.1), clerical_collar, cross_necklace, black_robe",
        "outfit_natlang": "a long black ankle-length cassock with a white clerical collar and a cross necklace",
        "slots": [
            {"slot": "tops", "item": "cassock", "color": "", "source_phrase": "cassock"},
            {"slot": "neckwear", "item": "collar", "color": "", "source_phrase": "clerical_collar"},
            {"slot": "accessories", "item": "necklace", "color": "", "source_phrase": "cross_necklace"},
            {"slot": "modifiers", "item": "robe", "color": "black", "source_phrase": "black_robe"},
        ],
    },
    {
        "name": "Changpao",
        "aliases": "changpao,changpao robe,chinese long robe,chinese mens robe,mandarin robe,manchu robe,long chinese gown",
        "outfit_tags": "(changpao:1.1), mandarin collar, pankou, side slit, long sleeves, sash, boots",
        "outfit_natlang": "a long Chinese changpao robe with a mandarin collar and pankou frog-button closures, side slits, long sleeves, a sash at the waist, and boots",
        "slots": [
            {"slot": "dresses", "item": "changpao", "color": "", "source_phrase": "changpao"},
            {"slot": "neckwear", "item": "mandarin_collar", "color": "", "source_phrase": "mandarin_collar"},
            {"slot": "accessories", "item": "pankou", "color": "", "source_phrase": "pankou"},
            {"slot": "accessories", "item": "sash", "color": "", "source_phrase": "sash"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "boots"},
            {"slot": "modifiers", "item": "side_slit", "color": "", "source_phrase": "side_slit"},
            {"slot": "modifiers", "item": "long_sleeves", "color": "", "source_phrase": "long_sleeves"},
        ],
    },
    {
        "name": "Kunoichi",
        "aliases": "kunoichi,female ninja,kunoichi outfit,kunoichi cosplay,female ninja outfit,shinobi outfit,ninja girl outfit",
        "outfit_tags": "ninja_mask, scarf, fishnet_bodystocking, black_bodysuit, arm_guards, fingerless_gloves, tabi, kunai, shuriken",
        "outfit_natlang": "a ninja mask covering the lower face, a scarf around the neck, a fishnet bodystocking under a black bodysuit, arm guards, fingerless gloves, tabi socks with sandals, and a kunai or shuriken in hand",
        "slots": [
            {"slot": "headwear", "item": "mask", "color": "", "source_phrase": "ninja_mask"},
            {"slot": "neckwear", "item": "scarf", "color": "", "source_phrase": "scarf"},
            {"slot": "tops", "item": "bodystocking", "color": "fishnet", "source_phrase": "fishnet_bodystocking"},
            {"slot": "tops", "item": "bodysuit", "color": "black", "source_phrase": "black_bodysuit"},
            {"slot": "handwear", "item": "arm_guards", "color": "", "source_phrase": "arm_guards"},
            {"slot": "handwear", "item": "gloves", "color": "", "source_phrase": "fingerless_gloves"},
            {"slot": "footwear", "item": "tabi", "color": "", "source_phrase": "tabi"},
            {"slot": "accessories", "item": "kunai", "color": "", "source_phrase": "kunai"},
            {"slot": "accessories", "item": "shuriken", "color": "", "source_phrase": "shuriken"},
        ],
    },
    {
        "name": "Armored Dress",
        "aliases": "armored dress,armored dress outfit,female knight outfit,female knight armor,knight dress,valkyrie dress,paladin dress,armored gown",
        "outfit_tags": "(armored_dress:1.1), breastplate, pauldrons, gauntlets, faulds, greaves, armored_boots, cape",
        "outfit_natlang": "an armored dress with a metal breastplate over the bodice, pauldrons over the shoulders, articulated gauntlets, faulds at the hips forming a plated skirt, greaves on the shins, armored boots, and a cape draped behind",
        "slots": [
            {"slot": "dresses", "item": "dress", "color": "", "source_phrase": "armored_dress"},
            {"slot": "tops", "item": "breastplate", "color": "", "source_phrase": "breastplate"},
            {"slot": "accessories", "item": "pauldrons", "color": "", "source_phrase": "pauldrons"},
            {"slot": "handwear", "item": "gauntlets", "color": "", "source_phrase": "gauntlets"},
            {"slot": "accessories", "item": "faulds", "color": "", "source_phrase": "faulds"},
            {"slot": "legwear", "item": "greaves", "color": "", "source_phrase": "greaves"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "armored_boots"},
            {"slot": "accessories", "item": "cape", "color": "", "source_phrase": "cape"},
        ],
    },
    {
        "name": "Gyaru Fashion",
        "aliases": "gyaru,gyaru fashion,gyaru outfit,gyaru style,kogal,kogal outfit,kogyaru,gal fashion,shibuya gal",
        "outfit_tags": "gyaru, gyaru_makeup, fake_eyelashes, blonde_hair, scrunchie, loose_bowtie, crop_top, midriff, miniskirt, cardigan_around_waist, loose_socks, platform_footwear, leopard_print, jewelry, wrist_scrunchie, pink_nails, dark_skin, tan",
        "outfit_natlang": "heavy gyaru-style eye makeup with fake eyelashes, bleached blonde hair tied with a scrunchie, a loosely knotted school-style bowtie, a fitted crop top exposing the midriff, a pleated miniskirt, a cardigan tied around the waist, slouchy loose socks bunched below the knee, platform footwear, leopard print accents, layered jewelry, a wrist scrunchie, pink-painted nails, and a deeply tanned complexion",
        "slots": [
            {"slot": "tops", "item": "crop_top", "color": "", "source_phrase": "crop_top"},
            {"slot": "bottoms", "item": "miniskirt", "color": "", "source_phrase": "miniskirt"},
            {"slot": "legwear", "item": "socks", "color": "", "source_phrase": "loose_socks"},
            {"slot": "footwear", "item": "platforms", "color": "", "source_phrase": "platform_footwear"},
            {"slot": "neckwear", "item": "bowtie", "color": "", "source_phrase": "loose_bowtie"},
            {"slot": "accessories", "item": "scrunchie", "color": "", "source_phrase": "scrunchie"},
            {"slot": "accessories", "item": "scrunchie", "color": "", "source_phrase": "wrist_scrunchie"},
            {"slot": "accessories", "item": "cardigan", "color": "", "source_phrase": "cardigan_around_waist"},
            {"slot": "accessories", "item": "jewelry", "color": "", "source_phrase": "jewelry"},
            {"slot": "modifiers", "item": "skin", "color": "", "source_phrase": "dark_skin"},
            {"slot": "modifiers", "item": "skin", "color": "", "source_phrase": "tan"},
            {"slot": "modifiers", "item": "hair", "color": "blonde", "source_phrase": "blonde_hair"},
            {"slot": "modifiers", "item": "makeup", "color": "", "source_phrase": "gyaru_makeup"},
            {"slot": "modifiers", "item": "eyelashes", "color": "", "source_phrase": "fake_eyelashes"},
            {"slot": "modifiers", "item": "midriff", "color": "", "source_phrase": "midriff"},
            {"slot": "modifiers", "item": "nails", "color": "pink", "source_phrase": "pink_nails"},
            {"slot": "modifiers", "item": "print", "color": "leopard", "source_phrase": "leopard_print"},
        ],
    },
    {
        "name": "Flapper Dress",
        "aliases": "flapper,flapper dress,flapper girl,flapper outfit,flapper costume,1920s flapper,roaring twenties,roaring 20s outfit",
        "outfit_tags": "1920s_(style), cloche_hat, feather_hair_ornament, black_dress, fringe_trim, elbow_gloves, pearl_necklace, feather_boa, high_heels, flapper_girl",
        "outfit_natlang": "a bell-shaped cloche hat with a feather hair ornament tucked at the side, a sleeveless drop-waist black dress trimmed with rows of dangling fringe, long elbow gloves, a long strand of pearls hanging past the chest, a fluffy feather boa draped across the shoulders, and strap-across heeled shoes",
        "slots": [
            {"slot": "headwear", "item": "cloche_hat", "color": "", "source_phrase": "cloche_hat"},
            {"slot": "headwear", "item": "feather_hair_ornament", "color": "", "source_phrase": "feather_hair_ornament"},
            {"slot": "dresses", "item": "dress", "color": "black", "source_phrase": "black_dress"},
            {"slot": "handwear", "item": "elbow_gloves", "color": "", "source_phrase": "elbow_gloves"},
            {"slot": "neckwear", "item": "pearl_necklace", "color": "", "source_phrase": "pearl_necklace"},
            {"slot": "accessories", "item": "feather_boa", "color": "", "source_phrase": "feather_boa"},
            {"slot": "footwear", "item": "high_heels", "color": "", "source_phrase": "high_heels"},
            {"slot": "modifiers", "item": "fringe_trim", "color": "", "source_phrase": "fringe_trim"},
            {"slot": "modifiers", "item": "1920s_style", "color": "", "source_phrase": "1920s_(style)"},
        ],
    },
    {
        "name": "Tiger Costume",
        "aliases": "tiger costume,tiger cosplay,tiger kigurumi,tiger outfit,tiger onesie,tiger suit,tiger print outfit",
        "outfit_tags": "tiger_hood, tiger_ears, tiger_paws, tiger_print_bikini, tiger_tail, tiger_print, (tiger_costume:1.1)",
        "outfit_natlang": "a tiger hood with tiger ears, a tiger-print bikini, paw mitten gloves, and a long striped tiger tail, all part of a full tiger kigurumi costume",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "tiger_hood"},
            {"slot": "headwear", "item": "ears", "color": "", "source_phrase": "tiger_ears"},
            {"slot": "tops", "item": "bikini", "color": "tiger_print", "source_phrase": "tiger_print_bikini"},
            {"slot": "handwear", "item": "paws", "color": "", "source_phrase": "tiger_paws"},
            {"slot": "accessories", "item": "tail", "color": "", "source_phrase": "tiger_tail"},
            {"slot": "modifiers", "item": "print", "color": "", "source_phrase": "tiger_print"},
        ],
    },
    {
        "name": "Plugsuit",
        "aliases": "plugsuit,plug suit,evangelion plugsuit,eva plugsuit,nge plugsuit,evangelion pilot suit,eva pilot suit,asuka plugsuit,rei plugsuit,shinji plugsuit",
        "outfit_tags": "plugsuit_(evangelion), bodysuit, skin_tight, interface_headset_(evangelion)",
        "outfit_natlang": "an Evangelion-style plugsuit, a skin-tight color-coded pilot bodysuit with technical paneling and shoulder pads, worn with an interface headset around the back of the head",
        "slots": [
            {"slot": "headwear", "item": "headset", "color": "", "source_phrase": "interface_headset_(evangelion)"},
            {"slot": "tops", "item": "bodysuit", "color": "", "source_phrase": "plugsuit_(evangelion)"},
            {"slot": "modifiers", "item": "bodysuit", "color": "", "source_phrase": "bodysuit"},
            {"slot": "modifiers", "item": "fit", "color": "", "source_phrase": "skin_tight"},
        ],
    },
    {
        "name": "Fairy Kei",
        "aliases": "fairy kei, fairy kei fashion, fairy kei outfit, pastel fairy kei, 80s fairy kei, yume kawaii fairy kei",
        "outfit_tags": "hair_bow, star_hair_ornament, oversized_shirt, tutu, leg_warmers, mary_janes, stuffed_toy, star_print, pastel_colors",
        "outfit_natlang": "a hair bow with a star hair ornament, an oversized pastel sweatshirt with star prints, a fluffy tulle tutu, soft leg warmers, mary jane shoes, and a stuffed toy held in hand, all in soft 80s pastel colors",
        "slots": [
            {"slot": "headwear", "item": "bow", "color": "", "source_phrase": "hair_bow"},
            {"slot": "headwear", "item": "ornament", "color": "star", "source_phrase": "star_hair_ornament"},
            {"slot": "tops", "item": "shirt", "color": "", "source_phrase": "oversized_shirt"},
            {"slot": "bottoms", "item": "tutu", "color": "", "source_phrase": "tutu"},
            {"slot": "legwear", "item": "leg_warmers", "color": "", "source_phrase": "leg_warmers"},
            {"slot": "footwear", "item": "mary_janes", "color": "", "source_phrase": "mary_janes"},
            {"slot": "accessories", "item": "stuffed_toy", "color": "", "source_phrase": "stuffed_toy"},
            {"slot": "accessories", "item": "print", "color": "star", "source_phrase": "star_print"},
            {"slot": "modifiers", "item": "pastel_colors", "color": "", "source_phrase": "pastel_colors"},
        ],
    },
    {
        "name": "Belly Dancer",
        "aliases": "belly dancing,belly dance performer,raqs sharqi,oriental dancer,egyptian dancer,middle eastern dance outfit,zills outfit,dance performance outfit",
        "outfit_tags": "circlet, see-through_veil, mouth_veil, bandeau, midriff, harem_pants, see-through_skirt, armlet, anklet, thighlet, jingle_bell, gold_sandals, finger_cymbals, (dancer:1.1)",
        "outfit_natlang": "a gold circlet across the brow with a flowing see-through veil, a sheer mouth veil, a jeweled bandeau top baring the midriff, sheer harem pants under a see-through skirt, gold armlets, thighlets, anklets with jingle bells, gold sandals, and finger cymbals on the hands as a dance performer",
        "slots": [
            {"slot": "headwear", "item": "circlet", "color": "", "source_phrase": "circlet"},
            {"slot": "headwear", "item": "veil", "color": "", "source_phrase": "see-through_veil"},
            {"slot": "neckwear", "item": "veil", "color": "", "source_phrase": "mouth_veil"},
            {"slot": "tops", "item": "bandeau", "color": "", "source_phrase": "bandeau"},
            {"slot": "bottoms", "item": "pants", "color": "", "source_phrase": "harem_pants"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "see-through_skirt"},
            {"slot": "footwear", "item": "sandals", "color": "gold", "source_phrase": "gold_sandals"},
            {"slot": "accessories", "item": "armlet", "color": "", "source_phrase": "armlet"},
            {"slot": "accessories", "item": "thighlet", "color": "", "source_phrase": "thighlet"},
            {"slot": "accessories", "item": "anklet", "color": "", "source_phrase": "anklet"},
            {"slot": "accessories", "item": "bell", "color": "", "source_phrase": "jingle_bell"},
            {"slot": "accessories", "item": "finger_cymbals", "color": "", "source_phrase": "finger_cymbals"},
            {"slot": "accessories", "item": "dancer", "color": "", "source_phrase": "dancer"},
            {"slot": "modifiers", "item": "midriff", "color": "", "source_phrase": "midriff"},
        ],
    },
    {
        "name": "Dog Costume",
        "aliases": "dog costume,dog cosplay,dog kigurumi,dog onesie,dog suit,dog outfit,puppy outfit,puppy costume",
        "outfit_tags": "dog_hood, dog_paws, dog_tail, (dog_costume:1.1)",
        "outfit_natlang": "a dog hood with floppy dog ears, paw mitten gloves, and a dog tail, all part of a full dog kigurumi costume",
        "slots": [
            {"slot": "headwear", "item": "hood", "color": "", "source_phrase": "dog_hood"},
            {"slot": "handwear", "item": "paws", "color": "", "source_phrase": "dog_paws"},
            {"slot": "accessories", "item": "tail", "color": "", "source_phrase": "dog_tail"},
        ],
    },
    {
        "name": "Mori Girl",
        "aliases": "mori girl,mori girl outfit,mori kei,mori kei fashion,mori fashion,forest girl,forest girl fashion,natural kei",
        "outfit_tags": "(mori_kei:1.1), knit_hat, brown_cardigan, white_dress, long_skirt, lace_trim, white_pantyhose, ankle_boots, scarf, hair_flower, pendant, shoulder_bag, loose_clothes",
        "outfit_natlang": "a knit hat over braided hair with a small flower tucked in, a loose brown cardigan layered over a white lace-trimmed dress and a long earth-toned skirt, a soft scarf draped around the neck, a vintage pendant, white pantyhose, ankle boots, and a worn leather shoulder bag",
        "slots": [
            {"slot": "headwear", "item": "hat", "color": "", "source_phrase": "knit_hat"},
            {"slot": "tops", "item": "cardigan", "color": "brown", "source_phrase": "brown_cardigan"},
            {"slot": "dresses", "item": "dress", "color": "white", "source_phrase": "white_dress"},
            {"slot": "bottoms", "item": "skirt", "color": "", "source_phrase": "long_skirt"},
            {"slot": "legwear", "item": "pantyhose", "color": "white", "source_phrase": "white_pantyhose"},
            {"slot": "footwear", "item": "boots", "color": "", "source_phrase": "ankle_boots"},
            {"slot": "neckwear", "item": "scarf", "color": "", "source_phrase": "scarf"},
            {"slot": "accessories", "item": "flower", "color": "", "source_phrase": "hair_flower"},
            {"slot": "accessories", "item": "pendant", "color": "", "source_phrase": "pendant"},
            {"slot": "accessories", "item": "bag", "color": "", "source_phrase": "shoulder_bag"},
            {"slot": "modifiers", "item": "loose_clothes", "color": "", "source_phrase": "loose_clothes"},
            {"slot": "modifiers", "item": "lace_trim", "color": "", "source_phrase": "lace_trim"},
        ],
    },
]


# ── route handle ──────────────────────────────────────────────────

routes = server.PromptServer.instance.routes


# =====================================================================
#  1. TAG BUILDER (buckets + characters)  — was autotagger_api.py
# =====================================================================

BUCKETS = [
    "cast",
    "appearance",
    "clothing",
    "pose",
    "scene",
    "expression",
    "action",
    "nsfw_action",
]

BUCKET_UI = {
    "cast": "single-select",
    "appearance": "mixer",
    "clothing": "mixer",
    "pose": "mixer",
    "scene": "mixer",
    "expression": "mixer",
    "action": "mixer",
    "nsfw_action": "mixer",
}

# Hardcoded table names keyed by bucket.  The f-string queries below
# are only safe because every bucket value is validated against BUCKETS
# before lookup — never trust a caller-provided string here.
_BUCKET_TABLES = {
    b: (f"{b}_groups", f"{b}_items") for b in BUCKETS
}
_ALLOWED_TABLES = frozenset(t for pair in _BUCKET_TABLES.values() for t in pair)


def _assert_allowed_table(name: str) -> str:
    # Last line of defense before an f-string SQL identifier — if any future
    # call site routes a user-controlled string here we want it to crash, not
    # silently template into the query.
    if name not in _ALLOWED_TABLES:
        raise ValueError(f"disallowed table name: {name!r}")
    return name


def _run_data_health(db: sqlite3.Connection) -> dict:
    """Idempotent maintenance: drop orphaned preset rows (FK enforcement
    was historically off) and de-duplicate tag_aliases. Returns per-step
    removal counts. Each step is independent and guarded so a missing
    table or schema drift skips that step instead of failing the run."""
    cleaned: dict[str, int] = {}

    def _exists(table: str) -> bool:
        return db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone() is not None

    # (child, fk_col, parent, parent_key) — parents first so a parent
    # delete's now-stranded children are caught in the same pass.
    orphan_rules = [
        ("outfits", "character_tag", "characters", "tag"),
        ("poses", "character_tag", "characters", "tag"),
        ("character_chip_overrides", "character_tag", "characters", "tag"),
        ("outfit_tag_slots", "outfit_id", "outfits", "id"),
        ("outfit_chip_overrides", "outfit_id", "outfits", "id"),
        ("pose_chip_overrides", "pose_id", "poses", "id"),
    ]
    for child, fk, parent, key in orphan_rules:
        if not (_exists(child) and _exists(parent)):
            continue
        try:
            cur = db.execute(
                f"DELETE FROM {child} WHERE {fk} IS NOT NULL "
                f"AND {fk} NOT IN (SELECT {key} FROM {parent})"
            )
            cleaned[f"orphan_{child}"] = cur.rowcount
        except sqlite3.OperationalError:
            pass

    # tag_aliases has a (tag, alias) primary key so exact dupes can't exist,
    # but keep the dedup as a cheap self-heal in case the PK was ever absent.
    if _exists("tag_aliases"):
        try:
            cur = db.execute(
                "DELETE FROM tag_aliases WHERE rowid NOT IN "
                "(SELECT MIN(rowid) FROM tag_aliases GROUP BY tag, alias)"
            )
            cleaned["tag_alias_duplicates"] = cur.rowcount
        except sqlite3.OperationalError:
            pass

    db.commit()
    return cleaned


@routes.post("/promptchain/tag-builder/maintenance")
async def _api_tag_builder_maintenance(request):
    """Run idempotent data-health maintenance and report what was removed."""
    return web.json_response({"cleaned": _run_data_health(get_db())})


@routes.get("/promptchain/tag-builder/buckets")
async def _api_buckets(request):
    db = get_db()
    result = []
    for bucket in BUCKETS:
        groups_table, items_table = _BUCKET_TABLES[bucket]
        try:
            group_count = db.execute(f"SELECT COUNT(*) FROM {groups_table}").fetchone()[0]
            item_count = db.execute(f"SELECT COUNT(*) FROM {items_table}").fetchone()[0]
        except Exception:
            group_count = 0
            item_count = 0
        result.append({
            "bucket": bucket,
            "ui_mode": BUCKET_UI.get(bucket, "mixer"),
            "group_count": group_count,
            "item_count": item_count,
        })
    return web.json_response(result)


@routes.get("/promptchain/tag-builder/buckets/{bucket}/groups")
async def _api_bucket_groups(request):
    bucket = request.match_info["bucket"]
    if bucket not in BUCKETS:
        return web.json_response({"error": f"Invalid bucket: {bucket}"}, status=400)

    db = get_db()
    groups_table, _ = _BUCKET_TABLES[bucket]
    rows = db.execute(
        f"SELECT * FROM {groups_table} ORDER BY sort_order, group_name"
    ).fetchall()
    return web.json_response({
        "bucket": bucket,
        "ui_type": BUCKET_UI.get(bucket, "mixer"),
        "groups": [dict(r) for r in rows],
    })


@routes.get("/promptchain/tag-builder/buckets/{bucket}/items")
async def _api_bucket_items(request):
    bucket = request.match_info["bucket"]
    if bucket not in BUCKETS:
        return web.json_response({"error": f"Invalid bucket: {bucket}"}, status=400)

    db = get_db()
    _, items_table = _BUCKET_TABLES[bucket]
    group = request.query.get("group")

    if group:
        rows = db.execute(
            f"SELECT * FROM {items_table} WHERE item_group = ? ORDER BY sort_order, item_tag",
            (group,),
        ).fetchall()
    else:
        rows = db.execute(
            f"SELECT * FROM {items_table} ORDER BY sort_order, item_tag"
        ).fetchall()
    return web.json_response({
        "bucket": bucket,
        "ui_type": BUCKET_UI.get(bucket, "mixer"),
        "items": [dict(r) for r in rows],
    })


# QA gate for v2's red-outline visibility pass. Any chip whose
# natlang_status != 'normalized' renders with a red outline in v2 so the user
# can see at a glance what's been hand-verified against Z-Image. Only three
# values are accepted; anything else 400s so a typo doesn't silently corrupt
# the column.
_ALLOWED_NATLANG_STATUSES = frozenset(("normalized", "unprocessed", "broken"))


@routes.post("/promptchain/tag-builder/buckets/{bucket}/items/{item_tag}/natlang-status")
async def _api_set_chip_natlang_status(request):
    bucket = request.match_info["bucket"]
    if bucket not in BUCKETS:
        return web.json_response({"error": f"Invalid bucket: {bucket}"}, status=400)
    item_tag = request.match_info["item_tag"]
    body, err = await parse_json(request)
    if err is not None:
        return err
    status = body.get("status")
    if status not in _ALLOWED_NATLANG_STATUSES:
        return web.json_response({"error": "invalid status"}, status=400)
    db = get_db()
    _, items_table = _BUCKET_TABLES[bucket]
    cur = db.execute(
        f"UPDATE {_assert_allowed_table(items_table)} "
        f"SET natlang_status = ? WHERE item_tag = ?",
        (status, item_tag),
    )
    db.commit()
    return web.json_response({"updated": cur.rowcount, "status": status})


# Thumbnail filesystem layout:
#   data/tag-builder/thumbs/<scope>/<bucket>/<item_tag>.<png|webp|jpg>
# <scope> is "default" today; future per-model overrides use the model
# fingerprint as the scope folder. Category hero thumbs use the convention
# <bucket>/_group_<group_name>.<ext>. Lookup walks model → default → 404;
# the frontend renders an inline fallback when 404.
THUMBS_ROOT = Path(__file__).parent.parent / "data" / "tag-builder" / "thumbs"
_THUMB_EXTS = (".png", ".webp", ".jpg")


def _safe_thumb_segment(value: str) -> bool:
    if not value:
        return False
    if "/" in value or "\\" in value:
        return False
    # ":" is intentionally allowed: character tags legitimately contain it
    # (e.g. "2b_(nier:automata)") and the on-disk lookup goes through
    # _sanitize_thumb_stem (":" -> "_", drive tokens neutralised) before any
    # filesystem join, so a raw ":" segment never reaches THUMBS_ROOT.
    if ".." in value or value.startswith("."):
        return False
    return True


@routes.get("/promptchain/tag-builder/thumbs/manifest")
async def _api_tag_builder_thumbs_manifest(request):
    # Returns the set of item_tags (and category heroes) that have a thumbnail
    # file on disk for the given bucket. Frontend uses this to decide pill vs
    # card rendering up front so cards don't flicker through 404s.
    bucket = (request.query.get("bucket") or "").strip()
    model = (request.query.get("model") or "").strip()

    if not _safe_thumb_segment(bucket):
        return web.json_response({"error": "invalid bucket"}, status=400)
    if model and not _safe_thumb_segment(model):
        return web.json_response({"error": "invalid model"}, status=400)

    tags: set[str] = set()
    for scope in ([model, "default"] if model else ["default"]):
        folder = THUMBS_ROOT / scope / bucket
        if not folder.is_dir():
            continue
        for entry in folder.iterdir():
            if not entry.is_file():
                continue
            if entry.suffix.lower() not in _THUMB_EXTS:
                continue
            tags.add(entry.stem)

    # Tags with NTFS-illegal characters live on disk under a sanitized stem
    # (":" -> "_", others percent-encoded). The frontend matches against the
    # canonical item_tag, so map every sanitized stem back to its canonical
    # tag and surface that too. Characters use their own table; the mixer
    # buckets use "<bucket>_items".
    if tags:
        db = get_db()
        if bucket == "characters":
            rows = db.execute(
                "SELECT tag FROM characters WHERE instr(tag, ':') > 0"
            ).fetchall()
            canonical_tags = (r["tag"] for r in rows)
        elif bucket in _BUCKET_TABLES:
            _, items_table = _BUCKET_TABLES[bucket]
            rows = db.execute(f"SELECT item_tag FROM {items_table}").fetchall()
            canonical_tags = (r["item_tag"] for r in rows)
        else:
            canonical_tags = ()
        for canonical in canonical_tags:
            stem = _sanitize_thumb_stem(canonical)
            if stem != canonical and stem in tags:
                tags.add(canonical)

    return web.json_response({"bucket": bucket, "thumbs": sorted(tags)})


# NTFS rejects these in filenames. ":" keeps its legacy "_" mapping (so
# existing character thumbs like "2b_(nier_automata)" stay valid); the rest
# are percent-encoded, which is collision-free where a shared "_" was not
# (":/", ":<", ":>" would otherwise all collapse to "__").
_THUMB_PERCENT_CHARS = '<>"/\\|?*'


def _sanitize_thumb_stem(item_tag: str) -> str:
    s = item_tag.replace(":", "_")
    return "".join(
        f"%{ord(c):02X}" if c in _THUMB_PERCENT_CHARS else c for c in s
    )


def _thumb_filename_variants(item_tag: str) -> list[str]:
    # Emoticon expression tags (":D", ">_<", ">:(") and ":"-bearing character
    # tags can't be filenames verbatim; on disk they use the sanitized stem.
    # When sanitization changes the tag we use ONLY the sanitized stem as the
    # path segment — feeding the raw tag to the filesystem join would let a
    # Windows drive token (e.g. "C:") escape THUMBS_ROOT. The on-disk file is
    # always the sanitized name, so the raw variant would never match anyway.
    sanitized = _sanitize_thumb_stem(item_tag)
    if sanitized == item_tag:
        return [item_tag]
    return [sanitized]


@routes.get("/promptchain/tag-builder/thumb/{bucket}/{item_tag}")
async def _api_tag_builder_thumb(request):
    bucket = request.match_info["bucket"]
    item_tag = request.match_info["item_tag"]
    model = (request.query.get("model") or "").strip()

    if not _safe_thumb_segment(bucket) or not _safe_thumb_segment(item_tag):
        return web.Response(status=400)
    if model and not _safe_thumb_segment(model):
        return web.Response(status=400)

    candidates = []
    for stem in _thumb_filename_variants(item_tag):
        if model:
            for ext in _THUMB_EXTS:
                candidates.append(THUMBS_ROOT / model / bucket / f"{stem}{ext}")
        for ext in _THUMB_EXTS:
            candidates.append(THUMBS_ROOT / "default" / bucket / f"{stem}{ext}")

    for path in candidates:
        if path.is_file():
            return web.FileResponse(path)

    return web.Response(status=404)


@routes.get("/promptchain/tag-builder/characters")
async def _api_characters(request):
    db = get_db()

    try:
        page = int(request.query.get("page", 1))
        per_page = int(request.query.get("per_page", 50))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid page/per_page"}, status=400)
    # Clamp so per_page=0 can't ZeroDivisionError the page-count math and a huge
    # value can't dump the whole 11.5k-row table.
    per_page = max(1, min(per_page, 200))
    search = request.query.get("search", "").strip()
    sort = request.query.get("sort", "display")
    status = request.query.get("status", "")
    category = request.query.get("category", "").strip()
    natlang_status = request.query.get("natlang_status", "").strip()

    offset = (page - 1) * per_page

    where_clauses = []
    params = []

    if status:
        where_clauses.append("c.status = ?")
        params.append(status)

    # natlang_status: TagBuilder2 sends `normalized` so only fully-curated
    # characters surface in its Subjects rail / All view. Other consumers
    # (legacy tag builder) omit this and get every row.
    if natlang_status:
        where_clauses.append("c.natlang_status = ?")
        params.append(natlang_status)

    # Subjects rail filters by category — joins character_series via
    # series_tag and filters on the category field (anime|video_game|
    # vtuber|original|adult).
    join_sql = ""
    if category:
        join_sql = " JOIN character_series cs ON cs.series_tag = c.series_tag"
        where_clauses.append("cs.category = ?")
        params.append(category)

    if search:
        # Normalize spaces/underscores for matching
        normalized = search.replace("_", " ").lower()
        words = normalized.split()
        for word in words:
            # Escape LIKE metacharacters in the user's query so a search
            # for literal "_" or "%" doesn't wildcard-match everything.
            esc = word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            # Match against tag, display, AND series — searching "street
            # fighter" should surface every Street Fighter character, not
            # just ones with "street" or "fighter" in their own name.
            where_clauses.append(
                "(LOWER(REPLACE(c.tag, '_', ' ')) LIKE ? ESCAPE '\\' "
                "OR LOWER(REPLACE(c.display, '_', ' ')) LIKE ? ESCAPE '\\' "
                "OR LOWER(REPLACE(COALESCE(c.series, ''), '_', ' ')) LIKE ? ESCAPE '\\' "
                "OR LOWER(REPLACE(COALESCE(c.series_tag, ''), '_', ' ')) LIKE ? ESCAPE '\\')"
            )
            params.append(f"%{esc}%")
            params.append(f"%{esc}%")
            params.append(f"%{esc}%")
            params.append(f"%{esc}%")

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    # Sort mapping
    sort_map = {
        "display": "c.display ASC",
        "tag": "c.tag ASC",
        "post_count": "c.post_count DESC",
        "updated_at": "c.updated_at DESC",
        "series": "c.series ASC, c.display ASC",
    }
    order_sql = sort_map.get(sort, "c.display ASC")

    count_row = db.execute(
        f"SELECT COUNT(*) FROM characters c{join_sql}{where_sql}", params
    ).fetchone()
    total = count_row[0]

    rows = db.execute(
        f"SELECT c.* FROM characters c{join_sql}{where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
        params + [per_page, offset],
    ).fetchall()

    return web.json_response({
        "characters": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


@routes.get("/promptchain/tag-builder/character-counts")
async def _api_character_counts(request):
    # Per-category character counts for the Subjects rail badges.
    # `natlang_status` filter respects the same gating TagBuilder2 uses.
    natlang_status = (request.query.get("natlang_status") or "").strip()
    db = get_db()
    where = ""
    params = []
    if natlang_status:
        where = " WHERE c.natlang_status = ?"
        params.append(natlang_status)
    rows = db.execute(
        "SELECT cs.category, COUNT(*) FROM characters c "
        "JOIN character_series cs ON cs.series_tag = c.series_tag"
        f"{where} GROUP BY cs.category",
        params,
    ).fetchall()
    counts = {}
    for r in rows:
        counts[r[0]] = r[1]
    return web.json_response({"counts": counts})


@routes.get("/promptchain/tag-builder/nsfw-manifest")
async def _api_nsfw_manifest(request):
    # NSFW browse-filter manifest for TagBuilder2's hide-NSFW toggle: which
    # groups to hide wholesale + which leaked item tags to hide elsewhere.
    # Maintainer-edited JSON, served from disk (not the DB).
    path = DB_PATH.parent / "nsfw-manifest.json"
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response({"groups": data.get("groups", []), "items": data.get("items", [])})
    except (OSError, ValueError):
        return web.json_response({"groups": [], "items": []})


@routes.get("/promptchain/tag-builder/characters/identity-index")
async def _api_character_identity_index(request):
    # Full normalized-character identity set for TagBuilder2's round-trip
    # parser, which must recognize EVERY normalized character in existing
    # prompt text. The public /characters route caps per_page at 200, so an
    # onMount preload of `per_page=1000` silently saw only the first 200 of
    # the ~1,486 normalized rows. Project just the five fields the rebind path
    # reads (parseNatlangPrompt: tag/display/series/base_tags/base_natlang) so
    # the payload stays small — no wiki_text or unused columns. Unpaginated by
    # design. Registered above /characters/{tag} so it isn't matched as a tag.
    db = get_db()
    rows = db.execute(
        "SELECT tag, display, series, base_tags, base_natlang "
        "FROM characters WHERE natlang_status = 'normalized'"
    ).fetchall()
    return web.json_response({"characters": [dict(r) for r in rows]})


@routes.get("/promptchain/tag-builder/characters/{tag}")
async def _api_character_detail(request):
    tag = request.match_info["tag"]
    db = get_db()

    char = db.execute("SELECT * FROM characters WHERE tag = ?", (tag,)).fetchone()
    if not char:
        return web.json_response({"error": "Character not found"}, status=404)

    outfits = db.execute(
        "SELECT * FROM outfits WHERE character_tag = ? ORDER BY sort_order, outfit_name",
        (tag,),
    ).fetchall()

    poses = db.execute(
        "SELECT * FROM poses WHERE character_tag = ? ORDER BY sort_order, pose_name",
        (tag,),
    ).fetchall()

    outfit_slots = db.execute(
        "SELECT outfit_id, slot, item, color, source_phrase, sort_order "
        "FROM outfit_tag_slots WHERE outfit_id IN "
        "(SELECT id FROM outfits WHERE character_tag = ?) "
        "ORDER BY outfit_id, sort_order",
        (tag,),
    ).fetchall()
    slots_by_outfit = {}
    for s in outfit_slots:
        slots_by_outfit.setdefault(s["outfit_id"], []).append({
            "slot": s["slot"],
            "item": s["item"],
            "color": s["color"],
            "source_phrase": s["source_phrase"],
            "sort_order": s["sort_order"],
        })

    result = dict(char)
    result["outfits"] = [{**dict(o), "slots": slots_by_outfit.get(o["id"], [])} for o in outfits]
    result["poses"] = [dict(p) for p in poses]

    return web.json_response(result)


# ── character base-appearance chip references ─────────────────────
#
# Migration goal: replace the flat `characters.base_tags` string with
# a JSON array of `appearance_items.item_tag` references plus a
# `base_extras` string for any non-chip identity tokens (e.g. `1girl`).
# Until a character is migrated, both columns are NULL and consumers
# fall back to the legacy `base_tags` string. Once migrated, the
# resolver returns a list of full chip rows so the UI can render
# them as pills (and toggle individual descriptors per render).

_IDENTITY_WEIGHT_RE = re.compile(r"^\(([^:)]+):[^)]+\)$")
_IDENTITY_BARE_RE = re.compile(r"^\(([^)]+)\)$")


def _strip_weight(token: str) -> str:
    """`(cammy_white:1.1)` → `cammy_white`; `(foo)` → `foo`; else unchanged."""
    m = _IDENTITY_WEIGHT_RE.match(token)
    if m:
        return m.group(1)
    m = _IDENTITY_BARE_RE.match(token)
    if m:
        return m.group(1)
    return token


def _resolve_character_appearance_chips(db, char_row):
    """Returns (chips, base_extras, identity_token, migrated).

    chips: list of dicts {item_tag, item_group, display_name, base_tags,
                          base_natlang, natlang_status}
    base_extras: string of non-chip tokens to emit alongside (e.g. "1girl")
    identity_token: weighted character token (e.g. "(cammy_white:1.1)")
    migrated: True if appearance_chip_tags column was populated, False
              if we fell back to parsing base_tags.

    Fallback parses the legacy `base_tags` string the same way the
    frontend `parseTagsToSlots` does: drop the (name:weight) prefix,
    match each remaining token against appearance_items by item_tag,
    push unmatched tokens into base_extras.
    """
    tag = char_row["tag"]
    identity_token = f"({tag}:1.1)"

    chip_tags_json = char_row["appearance_chip_tags"] if "appearance_chip_tags" in char_row.keys() else None
    base_extras_col = char_row["base_extras"] if "base_extras" in char_row.keys() else None

    if chip_tags_json:
        try:
            chip_tags = json.loads(chip_tags_json) or []
        except json.JSONDecodeError:
            chip_tags = []
        if chip_tags:
            placeholders = ",".join(["?"] * len(chip_tags))
            rows = db.execute(
                f"SELECT item_tag, item_group, display_name, base_tags, "
                f"base_natlang, natlang_status FROM appearance_items "
                f"WHERE item_tag IN ({placeholders})",
                chip_tags,
            ).fetchall()
            # Preserve the order the user picked (chip_tags is authoritative).
            by_tag = {r["item_tag"]: dict(r) for r in rows}
            chips = [by_tag[t] for t in chip_tags if t in by_tag]
            return chips, base_extras_col or "", identity_token, True

    # Legacy fallback: parse `base_tags` against appearance_items.
    legacy = (char_row["base_tags"] or "").strip()
    if not legacy:
        return [], "", identity_token, False
    tokens = [t.strip() for t in legacy.split(",") if t.strip()]
    chips = []
    extras = []
    seen_tags = set()
    for tok in tokens:
        stripped = _strip_weight(tok)
        if stripped == tag:
            continue  # identity prefix handled separately
        row = db.execute(
            "SELECT item_tag, item_group, display_name, base_tags, "
            "base_natlang, natlang_status FROM appearance_items "
            "WHERE item_tag = ?",
            (stripped,),
        ).fetchone()
        if row and row["item_tag"] not in seen_tags:
            chips.append(dict(row))
            seen_tags.add(row["item_tag"])
        elif not row:
            extras.append(tok)
    return chips, ", ".join(extras), identity_token, False


@routes.get("/promptchain/tag-builder/characters/{tag}/appearance-chips")
async def _api_character_appearance_chips_get(request):
    tag = request.match_info["tag"]
    db = get_db()
    char = db.execute("SELECT * FROM characters WHERE tag = ?", (tag,)).fetchone()
    if not char:
        return web.json_response({"error": "Character not found"}, status=404)
    chips, base_extras, identity_token, migrated = _resolve_character_appearance_chips(db, char)
    return web.json_response({
        "tag": tag,
        "display": char["display"] or tag,
        "identity_token": identity_token,
        "base_extras": base_extras,
        "chips": chips,
        "migrated": migrated,
        "legacy_base_tags": char["base_tags"] or "",
    })


@routes.put("/promptchain/tag-builder/characters/{tag}/appearance-chips")
async def _api_character_appearance_chips_put(request):
    tag = request.match_info["tag"]
    body, err = await parse_json(request)
    if err is not None:
        return err
    chip_tags = body.get("chip_tags")
    base_extras = body.get("base_extras", "")
    if not isinstance(chip_tags, list) or not all(isinstance(t, str) for t in chip_tags):
        return web.json_response({"error": "chip_tags must be a list of strings"}, status=400)
    if not isinstance(base_extras, str):
        return web.json_response({"error": "base_extras must be a string"}, status=400)

    db = get_db()
    char = db.execute("SELECT tag FROM characters WHERE tag = ?", (tag,)).fetchone()
    if not char:
        return web.json_response({"error": "Character not found"}, status=404)

    # Validate every chip_tag exists in appearance_items so we don't
    # store dangling references that would silently disappear on read.
    if chip_tags:
        placeholders = ",".join(["?"] * len(chip_tags))
        found = db.execute(
            f"SELECT item_tag FROM appearance_items WHERE item_tag IN ({placeholders})",
            chip_tags,
        ).fetchall()
        found_set = {r["item_tag"] for r in found}
        missing = [t for t in chip_tags if t not in found_set]
        if missing:
            return web.json_response(
                {"error": f"unknown appearance chips: {missing}"}, status=400,
            )

    db.execute(
        "UPDATE characters SET appearance_chip_tags = ?, base_extras = ? WHERE tag = ?",
        (json.dumps(chip_tags), base_extras.strip(), tag),
    )
    db.commit()

    # Recompose legacy `base_tags` from chip refs + extras + identity so
    # every existing consumer (search, AI agent, compile path) gets the
    # same flat string we used to store. The chip refs are the source of
    # truth; base_tags is just a cached projection.
    char_row = db.execute("SELECT * FROM characters WHERE tag = ?", (tag,)).fetchone()
    chips, extras, identity_token, migrated = _resolve_character_appearance_chips(db, char_row)
    recomposed = _compose_character_base_tags(identity_token, extras, chips)
    db.execute(
        "UPDATE characters SET base_tags = ? WHERE tag = ?",
        (recomposed, tag),
    )
    db.commit()

    return web.json_response({
        "tag": tag,
        "identity_token": identity_token,
        "base_extras": extras,
        "chips": chips,
        "migrated": migrated,
        "base_tags": recomposed,
    })


def _compose_character_base_tags(identity_token, base_extras, chips):
    """Build the flat `(name:1.1), 1girl, blonde_hair, ...` string from
    the resolver outputs. Empty parts are skipped so we don't emit
    leading/trailing commas."""
    parts = [identity_token]
    if base_extras:
        parts.append(base_extras)
    for c in chips:
        bt = (c.get("base_tags") or "").strip()
        if bt:
            parts.append(bt)
    return ", ".join(p for p in parts if p)


def _load_overrides_for(db, table, parent_col, parent_ids):
    """Fetch (parent_id -> {chip_tag: natlang}) for the given override table."""
    if not parent_ids:
        return {}
    placeholders = ",".join(["?"] * len(parent_ids))
    rows = db.execute(
        f"SELECT {parent_col}, chip_tag, natlang FROM {table} WHERE {parent_col} IN ({placeholders})",
        list(parent_ids),
    ).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r[0], {})[r[1]] = r[2]
    return out


def _api_presets_query(request, table, name_col, tags_col, natlang_col, extra_cols=()):
    # Shared paginator + sorter for /outfits and /poses. Joins through
    # characters so each row carries source identity + popularity, and
    # pins `scope_character`'s rows to the top when provided.
    db = get_db()
    try:
        page = int(request.query.get("page", 1))
        per_page = int(request.query.get("per_page", 60))
    except (ValueError, TypeError):
        return web.json_response({"error": "invalid page/per_page"}, status=400)
    per_page = max(1, min(per_page, 200))

    search = request.query.get("search", "").strip()
    scope = request.query.get("scope_character", "").strip()
    offset = (page - 1) * per_page

    where_clauses = []
    params = []
    if search:
        normalized = search.replace("_", " ").lower()
        for word in normalized.split():
            esc = word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            # Match preset name + source character display + character tag
            where_clauses.append(
                f"(LOWER(REPLACE(p.{name_col}, '_', ' ')) LIKE ? ESCAPE '\\' "
                f"OR LOWER(REPLACE(c.display, '_', ' ')) LIKE ? ESCAPE '\\' "
                f"OR LOWER(REPLACE(c.tag, '_', ' ')) LIKE ? ESCAPE '\\' "
                f"OR LOWER(REPLACE(COALESCE(c.series, ''), '_', ' ')) LIKE ? ESCAPE '\\')"
            )
            params.append(f"%{esc}%")
            params.append(f"%{esc}%")
            params.append(f"%{esc}%")
            params.append(f"%{esc}%")
    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    # Pin the scope character's rows first, then by source-character popularity.
    if scope:
        order_sql = (
            "(p.character_tag = ?) DESC, "
            "c.post_count DESC, p.sort_order, "
            f"p.{name_col}"
        )
        order_params = [scope]
    else:
        order_sql = f"c.post_count DESC, p.sort_order, p.{name_col}"
        order_params = []

    base_cols = (
        f"p.id, p.character_tag, p.{name_col}, p.{tags_col}, p.{natlang_col}, p.sort_order"
    )
    if extra_cols:
        base_cols += ", " + ", ".join(f"p.{c}" for c in extra_cols)
    base_cols += ", c.display AS character_display, c.series AS character_series, c.post_count"

    count_row = db.execute(
        f"SELECT COUNT(*) FROM {table} p JOIN characters c ON c.tag = p.character_tag{where_sql}",
        params,
    ).fetchone()
    total = count_row[0]

    rows = db.execute(
        f"SELECT {base_cols} FROM {table} p JOIN characters c ON c.tag = p.character_tag"
        f"{where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
        params + order_params + [per_page, offset],
    ).fetchall()

    # Attach per-row chip overrides so the picker can pre-load them onto
    # the marker without a second round-trip on apply.
    override_table = "outfit_chip_overrides" if table == "outfits" else "pose_chip_overrides"
    parent_col = "outfit_id" if table == "outfits" else "pose_id"
    overrides_by_id = _load_overrides_for(db, override_table, parent_col, [r["id"] for r in rows])

    out = []
    for r in rows:
        d = dict(r)
        d["overrides"] = overrides_by_id.get(d["id"], {})
        out.append(d)

    return web.json_response({
        "results": out,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


@routes.get("/promptchain/tag-builder/outfits")
async def _api_outfits(request):
    return _api_presets_query(
        request,
        table="outfits",
        name_col="outfit_name",
        tags_col="outfit_tags",
        natlang_col="outfit_natlang",
        extra_cols=("is_default", "appearance_adds", "appearance_removes"),
    )


@routes.get("/promptchain/tag-builder/poses")
async def _api_poses(request):
    return _api_presets_query(
        request,
        table="poses",
        name_col="pose_name",
        tags_col="pose_tags",
        natlang_col="pose_natlang",
        extra_cols=("is_signature", "appearance_adds", "appearance_removes"),
    )


@routes.get("/promptchain/tag-builder/characters/{tag}/overrides")
async def _api_character_overrides(request):
    # Per-character chip overrides, used to enrich appearance chips when
    # this character is the active subject identity. Returns the shape
    # the v2 chipText consumer has always expected — {chip_tag: natlang
    # string} — so existing emission paths keep working. Picker/QA code
    # that needs status info reads from /character-overrides (bulk) and
    # filters client-side.
    tag = request.match_info["tag"]
    db = get_db()
    rows = db.execute(
        "SELECT chip_tag, natlang FROM character_chip_overrides "
        "WHERE character_tag = ?",
        (tag,),
    ).fetchall()
    overrides = {r["chip_tag"]: r["natlang"] for r in rows}
    return web.json_response({"character_tag": tag, "overrides": overrides})


@routes.get("/promptchain/tag-builder/character-overrides")
async def _api_all_character_overrides(request):
    # Bulk fetch of every character_chip_overrides row, used by the
    # editor's chip-recognizer so it can light up enhancer phrasings
    # alongside generic chip natlangs. Cheap today (one row total).
    db = get_db()
    rows = db.execute(
        "SELECT cco.character_tag, cco.chip_tag, cco.natlang, cco.status, "
        "c.display AS character_display "
        "FROM character_chip_overrides cco "
        "LEFT JOIN characters c ON c.tag = cco.character_tag"
    ).fetchall()
    return web.json_response({
        "overrides": [
            {
                "character_tag": r["character_tag"],
                "character_display": r["character_display"] or r["character_tag"],
                "chip_tag": r["chip_tag"],
                "natlang": r["natlang"],
                "status": r["status"] or "unprocessed",
            }
            for r in rows
        ],
    })


@routes.get("/promptchain/tag-builder/outfit-overrides")
async def _api_all_outfit_overrides(request):
    # Bulk fetch of outfit-level chip enhancers, joined with outfits +
    # characters so each row carries the human-readable outfit name and
    # owning character for the tooltip scope label.
    db = get_db()
    rows = db.execute(
        "SELECT oco.outfit_id, oco.chip_tag, oco.natlang, oco.status, "
        "o.outfit_name, o.character_tag, c.display AS character_display "
        "FROM outfit_chip_overrides oco "
        "JOIN outfits o ON o.id = oco.outfit_id "
        "LEFT JOIN characters c ON c.tag = o.character_tag"
    ).fetchall()
    return web.json_response({
        "overrides": [
            {
                "outfit_id": r["outfit_id"],
                "outfit_name": r["outfit_name"],
                "character_tag": r["character_tag"],
                "character_display": r["character_display"] or r["character_tag"],
                "chip_tag": r["chip_tag"],
                "natlang": r["natlang"],
                "status": r["status"] or "unprocessed",
            }
            for r in rows
        ],
    })


@routes.get("/promptchain/tag-builder/pose-overrides")
async def _api_all_pose_overrides(request):
    db = get_db()
    rows = db.execute(
        "SELECT pco.pose_id, pco.chip_tag, pco.natlang, pco.status, "
        "p.pose_name, p.character_tag, c.display AS character_display "
        "FROM pose_chip_overrides pco "
        "JOIN poses p ON p.id = pco.pose_id "
        "LEFT JOIN characters c ON c.tag = p.character_tag"
    ).fetchall()
    return web.json_response({
        "overrides": [
            {
                "pose_id": r["pose_id"],
                "pose_name": r["pose_name"],
                "character_tag": r["character_tag"],
                "character_display": r["character_display"] or r["character_tag"],
                "chip_tag": r["chip_tag"],
                "natlang": r["natlang"],
                "status": r["status"] or "unprocessed",
            }
            for r in rows
        ],
    })


@routes.put("/promptchain/tag-builder/characters/{character_tag}/overrides/{chip_tag}")
async def _api_set_character_override(request):
    # Upsert an enhancer phrasing for (character, chip). natlang="" deletes
    # the row so generic chip natlang takes over again. status defaults to
    # 'unprocessed' on create; an explicit status field updates QA state.
    character_tag = request.match_info["character_tag"]
    chip_tag = request.match_info["chip_tag"]
    body, err = await parse_json(request)
    if err is not None:
        return err
    natlang = (body.get("natlang") or "").strip()
    status = body.get("status", "unprocessed")
    if status not in _ALLOWED_NATLANG_STATUSES:
        return web.json_response({"error": "invalid status"}, status=400)

    db = get_db()
    if not natlang:
        cur = db.execute(
            "DELETE FROM character_chip_overrides "
            "WHERE character_tag = ? AND chip_tag = ?",
            (character_tag, chip_tag),
        )
        db.commit()
        return web.json_response({"deleted": cur.rowcount})

    db.execute(
        "INSERT INTO character_chip_overrides (character_tag, chip_tag, natlang, status) "
        "VALUES (?, ?, ?, ?) "
        "ON CONFLICT (character_tag, chip_tag) DO UPDATE SET "
        "natlang = excluded.natlang, status = excluded.status",
        (character_tag, chip_tag, natlang, status),
    )
    db.commit()
    return web.json_response({"character_tag": character_tag, "chip_tag": chip_tag, "natlang": natlang, "status": status})


@routes.post("/promptchain/tag-builder/detect-outfit")
async def _api_detect_outfit(request):
    try:
        body = await request.json()
    except Exception:
        return error_response("invalid JSON")
    raw_chips = body.get("chips") or []
    if not isinstance(raw_chips, list):
        return error_response("chips must be a list")
    input_set = {str(c).strip() for c in raw_chips if str(c).strip()}
    if not input_set:
        return web.json_response({"matches": []})
    character_tag = (body.get("character_tag") or "").strip() or None
    try:
        threshold = float(body.get("threshold", 0.8))
    except (TypeError, ValueError):
        return error_response("threshold must be a number")

    db = get_db()
    where = ""
    params = []
    if character_tag:
        where = " WHERE character_tag = ?"
        params.append(character_tag)
    rows = db.execute(
        f"SELECT id, character_tag, outfit_name, outfit_tags FROM outfits{where}",
        params,
    ).fetchall()

    matches = []
    for r in rows:
        preset_set = {t.strip() for t in (r["outfit_tags"] or "").split(",") if t.strip()}
        if not preset_set:
            continue
        intersection = preset_set & input_set
        if not intersection:
            continue
        score = len(intersection) / len(preset_set)
        if score < threshold:
            continue
        matches.append({
            "outfit_id": r["id"],
            "character_tag": r["character_tag"],
            "outfit_name": r["outfit_name"],
            "score": score,
            "matched": sorted(intersection),
            "missing": sorted(preset_set - input_set),
            "extra": sorted(input_set - preset_set),
        })

    matches.sort(key=lambda m: (-m["score"], -len(m["matched"])))
    return web.json_response({"matches": matches})


@routes.post("/promptchain/tag-builder/detect-pose")
async def _api_detect_pose(request):
    try:
        body = await request.json()
    except Exception:
        return error_response("invalid JSON")
    raw_chips = body.get("chips") or []
    if not isinstance(raw_chips, list):
        return error_response("chips must be a list")
    input_set = {str(c).strip() for c in raw_chips if str(c).strip()}
    if not input_set:
        return web.json_response({"matches": []})
    character_tag = (body.get("character_tag") or "").strip() or None
    try:
        threshold = float(body.get("threshold", 0.8))
    except (TypeError, ValueError):
        return error_response("threshold must be a number")

    db = get_db()
    where = ""
    params = []
    if character_tag:
        where = " WHERE character_tag = ?"
        params.append(character_tag)
    rows = db.execute(
        f"SELECT id, character_tag, pose_name, pose_tags FROM poses{where}",
        params,
    ).fetchall()

    matches = []
    for r in rows:
        preset_set = {t.strip() for t in (r["pose_tags"] or "").split(",") if t.strip()}
        if not preset_set:
            continue
        intersection = preset_set & input_set
        if not intersection:
            continue
        score = len(intersection) / len(preset_set)
        if score < threshold:
            continue
        matches.append({
            "pose_id": r["id"],
            "character_tag": r["character_tag"],
            "pose_name": r["pose_name"],
            "score": score,
            "matched": sorted(intersection),
            "missing": sorted(preset_set - input_set),
            "extra": sorted(input_set - preset_set),
        })

    matches.sort(key=lambda m: (-m["score"], -len(m["matched"])))
    return web.json_response({"matches": matches})


@routes.get("/promptchain/tag-builder/cast")
async def _api_cast_items(request):
    # Generic identity templates from cast_items, scoped to one item_group
    # (archetype | creatures | fantasy_beings | occupation | relationship |
    # count | role). Used by the Subjects rail's non-character subitems —
    # each row carries base_tags + base_natlang for the template parser.
    group = (request.query.get("group") or "").strip()
    if not group:
        return web.json_response({"error": "group required"}, status=400)
    db = get_db()
    rows = db.execute(
        "SELECT item_tag, item_group, display_name, base_tags, base_natlang, sort_order "
        "FROM cast_items WHERE item_group = ? ORDER BY sort_order, display_name",
        (group,),
    ).fetchall()
    return web.json_response({
        "group": group,
        "items": [dict(r) for r in rows],
    })


_OUTFIT_PARENS_RE = re.compile(r"\s*\([^)]*\)\s*")


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[-1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


# Stoplist for the name-prefix character matcher. Words below are common
# adjectives, body terms, generic nouns, etc. that happen to also be the
# leading segment of some character tag in the DB. Suppressing them keeps
# 'blonde fighter in white outfit' from injecting unrelated bios.
_NAME_PREFIX_STOPLIST = frozenset({
    # Colors
    "red", "blue", "green", "black", "white", "yellow", "pink", "purple",
    "gray", "grey", "brown", "orange", "gold", "silver", "violet", "tan",
    "blonde", "blond",
    # Body / face / hair
    "hair", "eyes", "eye", "face", "body", "head", "lips", "mouth",
    "nose", "skin", "chest", "back",
    # Generic subject nouns
    "girl", "boy", "man", "woman", "person", "people", "guy", "lady",
    "child", "kid", "adult", "human", "character",
    # Combat / fantasy archetypes (verbs included — `fighting_master_alleyne`)
    "fighter", "fighting", "fight", "fights", "soldier", "warrior",
    "knight", "wizard", "mage", "ninja", "samurai", "pirate", "thief",
    "rogue", "monk", "priest", "king", "queen", "prince", "princess",
    "lord", "duke",
    # Body type / build
    "tall", "short", "small", "large", "huge", "tiny",
    "slim", "thin", "thick", "muscular", "toned", "athletic",
    # Adjectives
    "cute", "sexy", "pretty", "beautiful", "hot", "cool", "nice",
    "good", "bad", "ugly", "young", "old", "new", "tough",
    # Shapes / textures (could collide with character tags)
    "fancy", "simple", "plain", "casual", "formal",
    # Time / lighting / atmosphere — appear constantly in scene
    # descriptions; would false-match scene-named characters
    # (`night_angel_(last_origin)`, etc.)
    "night", "day", "evening", "morning", "noon", "dusk", "dawn",
    "midnight", "midday", "afternoon", "twilight",
    "dark", "light", "bright", "dim", "shadow", "shadows",
    "moon", "sun", "star", "stars", "sky", "cloud", "clouds",
    "rain", "snow", "fog", "mist", "storm", "wind", "breeze",
    "fire", "ice", "water", "earth", "metal",
    "summer", "winter", "spring", "autumn", "season",
    "candle", "lamp", "torch", "lit",
    # Setting nouns (already partially covered by clothing-suffix scan
    # but adding here closes the prefix-match path)
    "bedroom", "bathroom", "kitchen", "office", "library", "garden",
    "forest", "beach", "desert", "city", "alley", "rooftop",
    "studio", "room", "space", "world", "place", "scene",
    # Mood / aesthetic adjectives
    "romantic", "dramatic", "moody", "vibrant", "cinematic",
    "realistic", "anime", "cartoon", "stylized",
    # Misc generic
    "default", "custom", "main", "test", "sample", "example",
})


def _fuzzy_in_text(needle: str, haystack: str, max_distance: int = 2) -> bool:
    """True if any substring of haystack is within max_distance edits of needle.

    Catches common typos (missing/extra char, transposed letters,
    dropped space). Skips too-short needles where edit distance would
    be too permissive.
    """
    if not needle or not haystack:
        return False
    if needle in haystack:
        return True
    n_len = len(needle)
    if n_len < 5:
        return False
    h_len = len(haystack)
    for window_len in range(max(1, n_len - max_distance), n_len + max_distance + 1):
        if window_len > h_len:
            continue
        for i in range(h_len - window_len + 1):
            if _levenshtein(needle, haystack[i:i + window_len]) <= max_distance:
                return True
    return False


def _pick_named(items: list[dict], name_key: str, user_text_lower: str,
                exclude_default: bool = False) -> dict | None:
    """Find the item whose `name_key` field appears (fuzzy) in user_text.

    Strips parenthesized suffixes from names so 'cat hood' matches
    'Cat Hood (SFxT King)'. Edit-distance budget 2 catches typos like
    'killer be' / 'killerbee'. Longest match wins so 'school uniform'
    beats a bare 'uniform'. Returns None on no match.
    """
    if not items or not user_text_lower:
        return None
    best = None
    best_match_len = 0
    for it in items:
        if exclude_default and it.get("is_default"):
            continue
        name = (it.get(name_key) or "").lower()
        stripped = _OUTFIT_PARENS_RE.sub(" ", name).strip()
        if not stripped or len(stripped) < 3:
            continue
        if _fuzzy_in_text(stripped, user_text_lower) and len(stripped) > best_match_len:
            best = it
            best_match_len = len(stripped)
    return best


_NODE_PROMPT_OUTFIT_HEADER_RE = re.compile(
    r"^//\s*Outfit:\s*([^\n]+?)(?:\s+from\s+Character:.*)?\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def _extract_outfit_names_from_node_prompt(node_prompt: str) -> list[str]:
    """Extract `// Outfit: <Name>` outfit names from node_prompt prose.
    Used in patch mode to prefer the existing outfit over the default
    when the user_request doesn't name a different outfit."""
    if not node_prompt:
        return []
    names: list[str] = []
    for m in _NODE_PROMPT_OUTFIT_HEADER_RE.finditer(node_prompt):
        name = (m.group(1) or "").strip()
        if name:
            names.append(name)
    return names


def _pick_franchise_preferred(
    rows: list, latest_user_text: str,
):
    """Pick a row from the SQL-ordered candidate list, preferring one
    whose `series` appears in `latest_user_text`. Falls back to the
    first row (canonical-ness ordering) when no franchise hint
    matches. Empty-list safe.
    Used by name-prefix (stage 3) and paren-suffix (stage 4) matchers
    to disambiguate when multiple `<name>_(<franchise>)` rows exist —
    the user's franchise context wins over alphabetical/length
    canonical-ness ordering. When `latest_user_text` is empty, behaves
    identically to the prior `LIMIT 1` query."""
    if not rows:
        return None
    if latest_user_text:
        text_lc = latest_user_text.lower()
        for r in rows:
            series_lc = (r["series"] or "").lower().strip()
            if series_lc and series_lc in text_lc:
                return r
    return rows[0]


def _mask_series_from_user_text(user_text_lower: str, series: str) -> str:
    """Mask the character's series (franchise) from user_text wherever it
    appears as a character-identity marker, so series-named outfits like
    'Street Fighter 6' don't get fuzzy-matched on a generic franchise
    mention. Patterns stripped (length-preserved with spaces so other
    offsets aren't shifted):

      `_(series)`     — underscored canonical tag form: cammy_(street_fighter)
      `(series)`      — spaced canonical tag form:      cammy (street fighter)
      `from series`   — natural-language identity:      cammy from street fighter

    Generic mentions (`in series`, `with series`, etc.) are NOT stripped —
    they could legitimately be naming an outfit's scope (`in her sf6 outfit`).
    Series under 4 chars are skipped to avoid stripping accidental matches."""
    if not user_text_lower or not series:
        return user_text_lower
    s = series.lower().strip()
    if len(s) < 4:
        return user_text_lower
    s_re = re.escape(s)
    patterns = [
        re.compile(r"_?\(\s*" + s_re + r"\s*\)", re.IGNORECASE),
        re.compile(r"\bfrom\s+" + s_re + r"\b", re.IGNORECASE),
    ]
    out = user_text_lower
    for p in patterns:
        out = p.sub(lambda m: " " * len(m.group(0)), out)
    return out


def _pick_outfit_for(char_outfits: list[dict],
                    user_text_lower: str,
                    existing_outfit_names: list[str] | None = None
                    ) -> tuple[dict | None, bool]:
    """Match a non-default outfit by name from user_text, else fall back
    to the existing outfit named in node_prompt (patch-mode preserve),
    else return the is_default=1 fallback. Second tuple element flags
    override vs default — `existing_outfit_names` matches are NOT
    overrides (the user didn't ask to swap; we're just preserving)."""
    if not char_outfits:
        return None, False
    override = _pick_named(char_outfits, "outfit_name", user_text_lower, exclude_default=True)
    if override:
        return override, True
    if existing_outfit_names:
        existing_lc = {n.lower() for n in existing_outfit_names}
        for o in char_outfits:
            if (o.get("outfit_name") or "").lower() in existing_lc:
                return o, False
    for o in char_outfits:
        if o["is_default"]:
            return o, False
    return None, False


def _pick_pose_for(char_poses: list[dict], user_text_lower: str) -> dict | None:
    """Strictly opt-in — no default pose fallback."""
    return _pick_named(char_poses, "pose_name", user_text_lower)


# ── V2 chip composer ──────────────────────────────────────────────────
#
# V2 stores character appearance + outfit composition as per-chip rows
# across 8 bucket tables (appearance_items, clothing_items, ...). Each
# chip has a global natlang. Per-scope enrichers in *_chip_overrides
# beat the global when present. The legacy V1 `characters.base_natlang`
# / `outfits.outfit_natlang` paragraphs are stale post-rebuild and do
# not reflect chip-level edits made in TagBuilder2.
#
# These composers walk V2 data and produce fresh natlang for bio
# assembly. Empty result on legacy rows without chip data so callers
# can fall back to V1 strings.

_CHIP_NATLANG_BUCKETS = (
    "appearance", "clothing", "scene", "pose", "expression",
    "action", "nsfw_action", "cast",
)


def _lookup_chip_natlang(conn: sqlite3.Connection, chip_tag: str,
                          buckets: tuple = _CHIP_NATLANG_BUCKETS) -> str:
    """First-hit lookup across bucket tables. Returns the chip's
    base_natlang or '' when not found / empty."""
    for b in buckets:
        try:
            row = conn.execute(
                f"SELECT base_natlang FROM {b}_items WHERE item_tag = ?",
                (chip_tag,),
            ).fetchone()
        except sqlite3.OperationalError:
            continue
        if row:
            nl = (row[0] or "").strip()
            if nl:
                return nl
    return ""


def _finalize_chip_natlang(parts: list[str]) -> str:
    """Join chip phrases into a sentence: comma-join, capitalize first,
    trailing period. Strips trailing periods on individual phrases so
    overrides that include their own period don't double-up."""
    clean = [p.rstrip(".").strip() for p in parts if p and p.strip()]
    if not clean:
        return ""
    body = ", ".join(clean)
    return body[0].upper() + body[1:] + "."


def _chip_item_groups(conn: sqlite3.Connection,
                       chip_tags: list[str]) -> dict[str, str]:
    """Map each chip to its appearance_items.item_group. Chips absent from
    appearance_items (clothing/scene/etc.) simply won't appear in the map."""
    if not chip_tags:
        return {}
    placeholders = ",".join("?" * len(chip_tags))
    rows = conn.execute(
        f"SELECT item_tag, item_group FROM appearance_items "
        f"WHERE item_tag IN ({placeholders})",
        chip_tags,
    ).fetchall()
    return {r["item_tag"]: r["item_group"] for r in rows}


def _hair_length_adjective(length_phrase: str) -> str:
    """Bare length adjective from a hair_length phrase ('long hair' ->
    'long'). hair_length base_natlang is canonically '<adj> hair'; phrases
    that don't end in hair/hairs (e.g. 'extremely long hair past the feet')
    return '' so the caller leaves the length chip standalone rather than
    welding a malformed fragment onto the style noun."""
    words = length_phrase.strip().split()
    if len(words) >= 2 and words[-1].lower() in ("hair", "hairs"):
        return " ".join(words[:-1])
    return ""


def compose_character_natlang_v2(conn: sqlite3.Connection,
                                  char_tag: str) -> str:
    """Compose character body from V2 chips. Walks
    characters.appearance_chip_tags JSON, applies character_chip_overrides
    first, falls through to bucket globals. Returns '' for legacy chars
    without appearance_chip_tags so callers can fall back to V1.

    The hair_length chip is bound onto the primary hair_style chip
    ("long" + "twin braids" -> "long twin braids") so a render reads them
    as one feature instead of layering loose long hair beside the braids.
    hair_color and any secondary hair_style chips (e.g. sidelocks) stay
    independent -- color applies regardless of style, so welding it on
    only dilutes the token."""
    char = conn.execute(
        "SELECT appearance_chip_tags FROM characters WHERE tag = ?",
        (char_tag,),
    ).fetchone()
    if not char:
        return ""
    raw = char[0] or ""
    if not raw:
        return ""
    try:
        chip_tags = [t for t in json.loads(raw) if isinstance(t, str) and t]
    except Exception:
        return ""
    if not chip_tags:
        return ""

    override_rows = conn.execute(
        "SELECT chip_tag, natlang FROM character_chip_overrides "
        "WHERE character_tag = ?",
        (char_tag,),
    ).fetchall()
    overrides = {r["chip_tag"]: (r["natlang"] or "").strip()
                 for r in override_rows}

    groups = _chip_item_groups(conn, chip_tags)
    length_chip = next(
        (t for t in chip_tags
         if groups.get(t) == "hair_length" and t not in overrides), None)
    primary_style_chip = next(
        (t for t in chip_tags
         if groups.get(t) == "hair_style" and t not in overrides), None)
    length_adj = ""
    if length_chip and primary_style_chip:
        length_adj = _hair_length_adjective(_lookup_chip_natlang(conn, length_chip))
    bind_length = bool(length_adj)

    parts: list[str] = []
    for chip_tag in chip_tags:
        if bind_length and chip_tag == length_chip:
            continue  # absorbed into the primary style phrase below
        text = overrides.get(chip_tag) or _lookup_chip_natlang(conn, chip_tag)
        if not text:
            continue
        if bind_length and chip_tag == primary_style_chip:
            text = f"{length_adj} {text}"
        parts.append(text)
    return _finalize_chip_natlang(parts)


def compose_outfit_natlang_v2(conn: sqlite3.Connection,
                               outfit_id: int) -> str:
    """Compose outfit body from V2 chips. Walks outfits.outfit_tags
    (comma string), applies outfit_chip_overrides first, falls through
    to bucket globals. Returns '' when the outfit has no chips so
    callers can fall back to V1 outfit_natlang."""
    outfit = conn.execute(
        "SELECT outfit_tags FROM outfits WHERE id = ?",
        (outfit_id,),
    ).fetchone()
    if not outfit:
        return ""
    raw = (outfit[0] or "").strip()
    if not raw:
        return ""
    chip_tags = [t.strip() for t in raw.split(",") if t.strip()]
    if not chip_tags:
        return ""

    override_rows = conn.execute(
        "SELECT chip_tag, natlang FROM outfit_chip_overrides "
        "WHERE outfit_id = ?",
        (outfit_id,),
    ).fetchall()
    overrides = {r["chip_tag"]: (r["natlang"] or "").strip()
                 for r in override_rows}

    parts: list[str] = []
    for chip_tag in chip_tags:
        text = overrides.get(chip_tag) or _lookup_chip_natlang(conn, chip_tag)
        if text:
            parts.append(text)
    body = ", ".join(p.rstrip(".") for p in parts if p)
    return f"Wearing {body}." if body else ""


def compose_pose_natlang_v2(conn: sqlite3.Connection, pose_id: int) -> str:
    """Compose pose body from V2 chips. Walks poses.pose_tags, applies
    pose_chip_overrides first, falls through to bucket globals (pose_items
    primarily). Returns '' when the pose has no chips so callers can
    fall back to V1 pose_natlang."""
    pose = conn.execute(
        "SELECT pose_tags FROM poses WHERE id = ?",
        (pose_id,),
    ).fetchone()
    if not pose:
        return ""
    raw = (pose[0] or "").strip()
    if not raw:
        return ""
    # Pose tags may have weights like `(sideways_glance:1.1)` — strip
    # them for chip lookup; the rich phrasing comes from chip natlang,
    # not the tag weight.
    chip_tags: list[str] = []
    for t in raw.split(","):
        t = t.strip()
        if not t:
            continue
        m = re.match(r"\(\s*([^():]+?)\s*:\s*[\d.]+\s*\)", t)
        if m:
            t = m.group(1).strip()
        if t:
            chip_tags.append(t)
    if not chip_tags:
        return ""

    override_rows = conn.execute(
        "SELECT chip_tag, natlang FROM pose_chip_overrides "
        "WHERE pose_id = ?",
        (pose_id,),
    ).fetchall()
    overrides = {r["chip_tag"]: (r["natlang"] or "").strip()
                 for r in override_rows}

    parts: list[str] = []
    for chip_tag in chip_tags:
        text = overrides.get(chip_tag) or _lookup_chip_natlang(conn, chip_tag)
        if text:
            parts.append(text)
    return _finalize_chip_natlang(parts)


_GENERIC_OUTFIT_NAME_NORMALIZE_RE = re.compile(r"\s+(outfit|uniform|costume|attire|wear)$", re.IGNORECASE)


def find_generic_outfit(name: str) -> dict | None:
    """Look up a character-independent outfit archetype by name or alias.
    Same shape as character outfits (tags, natlang, slots) so callers can
    plug it into `bio.user_requested_outfit` and the existing patch-flow
    rendering applies unchanged.

    Matching is permissive: exact name, exact alias, or normalized form
    (`cowboy outfit` -> `cowboy`, `school uniform` -> `school`). Returns
    None on miss; caller falls back to canonical_resolver / LLM vibe."""
    name = (name or "").strip()
    if not name:
        return None
    candidates = [name.lower()]
    stripped = _GENERIC_OUTFIT_NAME_NORMALIZE_RE.sub("", name).strip().lower()
    if stripped and stripped != name.lower():
        candidates.append(stripped)
    db = get_db()
    row = None
    for cand in candidates:
        row = db.execute(
            "SELECT * FROM generic_outfits WHERE LOWER(name) = ?",
            (cand,),
        ).fetchone()
        if row:
            break
    if not row:
        # Alias lookup: aliases column is comma-separated. SQLite has no
        # split, so we fetch all and scan in Python — table size is small.
        for r in db.execute("SELECT * FROM generic_outfits").fetchall():
            aliases = {a.strip().lower() for a in (r["aliases"] or "").split(",")}
            if any(c in aliases for c in candidates):
                row = r
                break
    if not row:
        return None
    slots = db.execute(
        "SELECT slot, item, color, source_phrase, sort_order "
        "FROM generic_outfit_slots WHERE outfit_id = ? "
        "ORDER BY sort_order, id",
        (row["id"],),
    ).fetchall()
    return {
        "name": row["name"],
        "tags": row["outfit_tags"] or "",
        "natlang": row["outfit_natlang"] or "",
        "slots": [dict(s) for s in slots],
    }


_GENERIC_OUTFIT_ALIAS_CACHE: list[tuple[str, int]] | None = None


def _load_generic_outfit_aliases() -> list[tuple[str, int]]:
    """Returns [(alias_lower, outfit_id), ...] sorted longest-first.
    Cached after first call; rebuild via _invalidate_generic_outfit_cache
    if you mutate the table at runtime."""
    global _GENERIC_OUTFIT_ALIAS_CACHE
    if _GENERIC_OUTFIT_ALIAS_CACHE is not None:
        return _GENERIC_OUTFIT_ALIAS_CACHE
    db = get_db()
    pairs: list[tuple[str, int]] = []
    for r in db.execute("SELECT id, name, aliases FROM generic_outfits").fetchall():
        forms = [r["name"]] + (r["aliases"] or "").split(",")
        seen: set[str] = set()
        for n in forms:
            key = (n or "").strip().lower()
            if key and key not in seen:
                seen.add(key)
                pairs.append((key, r["id"]))
    pairs.sort(key=lambda p: len(p[0]), reverse=True)
    _GENERIC_OUTFIT_ALIAS_CACHE = pairs
    return pairs


def _invalidate_generic_outfit_cache() -> None:
    global _GENERIC_OUTFIT_ALIAS_CACHE
    _GENERIC_OUTFIT_ALIAS_CACHE = None


_GENERIC_OUTFIT_DOMAIN_WORDS = ("outfit", "uniform", "attire", "costume")

# Words that, when they immediately follow a bare archetype alias, mean
# the alias is an outfit-scope reference. `cowboy clothing` ✓,
# `cowboy outfit` ✓, `cowboy hat` ✗ (component-scope, skip).
_OUTFIT_FOLLOW_WORDS = frozenset({
    "outfit", "uniform", "costume", "attire", "look", "style",
    "clothing", "clothes", "dress", "wear",
})


def scan_for_generic_outfit(text: str) -> dict | None:
    """Find the first generic-outfit archetype whose name or alias appears
    as a word in `text`. Longest-alias-first so 'french maid outfit'
    wins over 'maid' in the same text. Returns the full outfit dict
    (name, tags, natlang, slots) on hit; None on miss.

    Match policy:
      - Multi-word aliases ('cowboy outfit', 'school uniform', 'french
        maid') match unconditionally — the alias itself disambiguates.
      - Bare-word archetype aliases ('cowboy', 'maid', 'goth') match
        only when the alias is at end-of-text OR followed by an
        outfit-domain word (outfit/uniform/clothing/clothes/look/...).
        Guards against 'cowboy hat' / 'cowboy boots' falsely
        triggering full Cowboy Outfit when only a component was named."""
    if not text:
        return None
    text_lc = text.lower()
    for alias, outfit_id in _load_generic_outfit_aliases():
        m = re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", text_lc)
        if not m:
            continue
        is_bare = (
            " " not in alias
            and not any(w in alias for w in _GENERIC_OUTFIT_DOMAIN_WORDS)
        )
        if is_bare:
            tail = text_lc[m.end():].lstrip(" ,")
            if tail:
                next_word_match = re.match(r"\w+", tail)
                next_word = next_word_match.group() if next_word_match else ""
                if next_word and next_word not in _OUTFIT_FOLLOW_WORDS:
                    continue
        return find_generic_outfit(alias)
    return None


def match_characters_inner(
    tokens: list,
    user_text: str = "",
    latest_user_text: str = "",
    node_prompt: str = "",
) -> dict:
    """Pure character-matcher: takes raw token list + context strings,
    returns `{"matched": [...], "normalized": [...]}`. Same logic as the
    `/promptchain/tag-builder/match-characters` route, extracted so
    tests can call it without an aiohttp Request.

    Match prompt tokens against characters DB. Prompts use
    `yuuki \\(sao\\)`, DB stores `yuuki_(sao)` — normalize before lookup,
    echo caller's original token shape on match for verbatim splicing.

    `user_text`: agent's distilled request (drives outfit/pose pickers).
    `latest_user_text`: original full user message (drives franchise-
    preference tiebreaker on stages 3 & 4).
    `node_prompt`: existing prompt body (extracts outfit names for
    patch-mode preserve)."""
    if not isinstance(tokens, list):
        return {"matched": []}

    # Generate space / underscore / hyphen variants for every user
    # token. Danbooru canonical separator varies by character: most use
    # underscores ('cammy_white'), some use hyphens ('chun-li'), and
    # user input often arrives with plain spaces. We try all three so
    # 'chun li' from the user maps to the DB's 'chun-li'. Keys in
    # norm_to_original are DB-shaped tags; values are the original
    # user token for echo-back.
    norm_to_original: dict[str, str] = {}
    for raw in tokens:
        if not isinstance(raw, str):
            continue
        token = raw.strip()
        if not token:
            continue
        base = (
            token.lower()
                 .replace("\\(", "(")
                 .replace("\\)", ")")
        )
        # Collapse whitespace/underscore/hyphen into single spaces, then
        # re-emit each separator form. Strips redundant runs too —
        # 'chun  li' or 'chun--li' both flatten correctly.
        bare = re.sub(r"[\s_\-]+", " ", base).strip()
        if not bare:
            continue
        for variant in (bare, bare.replace(" ", "_"), bare.replace(" ", "-")):
            norm_to_original.setdefault(variant, token)

    if not norm_to_original:
        return {"matched": [], "normalized": []}

    user_text = (user_text or "").lower()
    # Original user text (vs `user_text` which is the agent's
    # distilled request). Used by stages 3 & 4 to prefer the
    # franchise variant whose `series` appears in the user's full
    # message — disambiguates bare-name lookups when multiple
    # `name_(franchise)` rows exist (e.g. `ryu` -> ryu_(street_fighter)
    # over ryu_(monster_girl_encyclopedia) when user said
    # "from street fighter").
    latest_user_text = (latest_user_text or "").lower()
    existing_outfit_names = _extract_outfit_names_from_node_prompt(
        node_prompt or ""
    )

    db = get_db()
    placeholders = ",".join(["?"] * len(norm_to_original))
    char_rows: list = list(db.execute(
        f"SELECT tag, display, series, base_tags, base_natlang FROM characters WHERE tag IN ({placeholders})",
        list(norm_to_original.keys()),
    ).fetchall())

    matched_tags = [r["tag"] for r in char_rows if r["tag"] in norm_to_original]
    # Stage 3 iterates a frozen snapshot of the user's input tokens —
    # stages 2/3/4 push DB-matched tags back into norm_to_original, and
    # iterating the live dict would treat those as fresh user input.
    user_token_keys = list(norm_to_original.keys())

    # Fallback: bare-alphanumeric match. Some Danbooru character tags
    # contain literals the separator-variant generator can't produce —
    # `m._bison` (period + underscore), `m.o.m.o.` (dotted), `c.c.`,
    # `t.m._opera_o_(umamusume)` (mixed). Strip all of [_\-\. ()] from
    # both sides and compare; matches only when bare form is >=3 chars
    # to avoid 1-2 letter false positives ("j" matching every J-named
    # character). Skipped for tokens already matched by the primary
    # variant lookup so we don't double-count.
    already_matched = {r["tag"] for r in char_rows}
    bare_to_tokens: dict[str, str] = {}
    for token, original in norm_to_original.items():
        bare = re.sub(r"[\s_\-\.()]+", "", token).lower()
        if len(bare) >= 3:
            bare_to_tokens.setdefault(bare, original)
    if bare_to_tokens:
        bare_placeholders = ",".join(["?"] * len(bare_to_tokens))
        bare_rows = db.execute(
            f"SELECT tag, display, series, base_tags, base_natlang FROM characters "
            f"WHERE tag NOT IN ({placeholders}) "
            f"  AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("
            f"      tag, '_', ''), '-', ''), '.', ''), ' ', ''), '(', ''), ')', '')) "
            f"      IN ({bare_placeholders})",
            list(norm_to_original.keys()) + list(bare_to_tokens.keys()),
        ).fetchall()
        for r in bare_rows:
            if r["tag"] in already_matched:
                continue
            bare_db = re.sub(r"[\s_\-\.()]+", "", r["tag"]).lower()
            original = bare_to_tokens.get(bare_db)
            if original is not None:
                norm_to_original.setdefault(r["tag"], original)
                char_rows.append(r)
                matched_tags.append(r["tag"])
                already_matched.add(r["tag"])

    # Name-prefix fallback: catches the user typing just a character's
    # first name (`mythra`, `cammy`, `ryu`) without the rest of the
    # canonical tag (`mythra_(xenoblade)`, `cammy_white`,
    # `ryu_(street_fighter)`). Looks for tags shaped `<name>_<anything>`
    # where <name> equals the user's token. When multiple matches
    # exist (e.g. `ryu_(monster_girl_encyclopedia)` AND
    # `ryu_(street_fighter)`), prefers the candidate whose series
    # appears in `latest_user_text` over the canonical-ness ordering
    # — so franchise context the user typed actually disambiguates.
    #
    # Length floor 3 chars: catches short canonical names (`ryu`,
    # `ada`, `ken`, `ash`). Stoplist filters generic 3-letter words
    # (`red`, `boy`, etc.) so we don't over-match on adjectives.
    #
    # Stoplist: dictionary words that happen to be the leading segment
    # of a character tag (`fighter_(7th_dragon)`, `blonde_girl_(...)`,
    # `white_rock_shooter`, `black_star`). When the user mentions
    # 'blonde fighter in white outfit', we don't want to inject those
    # characters' bios. Bias toward false-negatives — user will
    # disambiguate by typing more specifically if it misses.
    #
    # SQL: LIKE '<token>_%' with ESCAPE since SQLite treats bare `_` as
    # a single-char wildcard.
    name_prefix_candidates: dict[str, str] = {}
    for token in user_token_keys:
        original = norm_to_original.get(token)
        if original is None:
            continue
        # Only single-name tokens — no spaces, underscores, hyphens, or
        # parens. That's the case the user typed just a first name.
        if re.search(r"[\s_\-()]", token):
            continue
        if len(token) >= 3 and token.lower() not in _NAME_PREFIX_STOPLIST:
            name_prefix_candidates.setdefault(token.lower(), original)
    if name_prefix_candidates:
        for prefix, original in name_prefix_candidates.items():
            # Escape LIKE metacharacters so a name with % or _ doesn't wildcard-match.
            esc = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like_pattern = esc + r"\_%"
            prefix_rows = db.execute(
                "SELECT tag, display, series, base_tags, base_natlang FROM characters "
                "WHERE LOWER(tag) LIKE ? ESCAPE '\\' "
                # Canonical-ness order: fewer `_(` disambiguators first,
                # then shorter total length, then alphabetical.
                "ORDER BY (LENGTH(tag) - LENGTH(REPLACE(tag, '_(', ''))) ASC, "
                "         LENGTH(tag) ASC, tag ASC "
                "LIMIT 5",
                (like_pattern,),
            ).fetchall()
            chosen = _pick_franchise_preferred(prefix_rows, latest_user_text)
            if chosen is None:
                continue
            if chosen["tag"] in already_matched:
                continue
            norm_to_original.setdefault(chosen["tag"], original)
            char_rows.append(chosen)
            matched_tags.append(chosen["tag"])
            already_matched.add(chosen["tag"])

    # Stage 4 — wrong-franchise-suffix fallback. When the agent (or
    # client) constructs a canonical-shaped token like
    # `mythra_(xenoblade_chronicles_2)` but the DB has
    # `mythra_(xenoblade)`, stages 1-3 all miss: stage 1 wants exact
    # match, stage 2's bare-alphanumeric form is too dissimilar
    # (`mythraxenobladechronicles2` vs `mythraxenoblade`), and stage 3
    # is gated to single-name tokens (`re.search(r"[\s_\-()]", token)`
    # skips anything with `_(`). Strip the parenthetical and try
    # both an exact match on the bare prefix (for chars whose
    # canonical IS bare-named, like `sagat`, `cammy_white`, `cirno`)
    # AND a name-prefix LIKE query (for chars whose canonical is
    # franchise-suffixed, like `mythra_(xenoblade)`). Same canonical-
    # ness ordering as stage 3 — bare matches win over suffixed via
    # the `_(` count tiebreaker, then shortest tag length.
    paren_suffix_candidates: dict[str, str] = {}
    for token in user_token_keys:
        original = norm_to_original.get(token)
        if original is None:
            continue
        if "_(" not in token:
            continue
        bare_name = token.split("_(", 1)[0].strip()
        if not bare_name:
            continue
        if len(bare_name) < 4 or bare_name.lower() in _NAME_PREFIX_STOPLIST:
            continue
        paren_suffix_candidates.setdefault(bare_name.lower(), original)
    if paren_suffix_candidates:
        for prefix, original in paren_suffix_candidates.items():
            # Escape LIKE metacharacters so a name with % or _ doesn't wildcard-match.
            esc = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like_pattern = esc + r"\_%"
            prefix_rows = db.execute(
                "SELECT tag, display, series, base_tags, base_natlang FROM characters "
                "WHERE LOWER(tag) = ? OR LOWER(tag) LIKE ? ESCAPE '\\' "
                "ORDER BY (LENGTH(tag) - LENGTH(REPLACE(tag, '_(', ''))) ASC, "
                "         LENGTH(tag) ASC, tag ASC "
                "LIMIT 5",
                (prefix, like_pattern),
            ).fetchall()
            chosen = _pick_franchise_preferred(prefix_rows, latest_user_text)
            if chosen is None:
                continue
            if chosen["tag"] in already_matched:
                continue
            norm_to_original.setdefault(chosen["tag"], original)
            char_rows.append(chosen)
            matched_tags.append(chosen["tag"])
            already_matched.add(chosen["tag"])

    # Stage 5 — first-segment fallback for underscored typo tokens.
    # When the chat agent paraphrases a user typo into a malformed
    # canonical (`ryu_streets_fighter`, `mythra_xenoblade_chronicles_2`),
    # stage 1 misses (no exact DB hit), stage 2's bare-alphanumeric form
    # doesn't match any character (`ryustreetsfighter` etc), stage 3 skips
    # underscored tokens, and stage 4 requires `_(`. Recover by treating
    # the first underscore-segment as a name-prefix lookup. Stage 4's
    # length floor and stoplist apply so generic words don't false-match.
    first_segment_candidates: dict[str, str] = {}
    for token in user_token_keys:
        original = norm_to_original.get(token)
        if original is None:
            continue
        if "_" not in token or "_(" in token:
            continue
        bare_name = token.split("_", 1)[0].strip()
        if not bare_name:
            continue
        # Length floor 3 (matches stage 3) — short canonical names like
        # `ryu`, `ada`, `ken` are exactly the case this recovers.
        if len(bare_name) < 3 or bare_name.lower() in _NAME_PREFIX_STOPLIST:
            continue
        first_segment_candidates.setdefault(bare_name.lower(), original)
    if first_segment_candidates:
        for prefix, original in first_segment_candidates.items():
            # Escape LIKE metacharacters so a name with % or _ doesn't wildcard-match.
            esc = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like_pattern = esc + r"\_%"
            prefix_rows = db.execute(
                "SELECT tag, display, series, base_tags, base_natlang FROM characters "
                "WHERE LOWER(tag) = ? OR LOWER(tag) LIKE ? ESCAPE '\\' "
                "ORDER BY (LENGTH(tag) - LENGTH(REPLACE(tag, '_(', ''))) ASC, "
                "         LENGTH(tag) ASC, tag ASC "
                "LIMIT 5",
                (prefix, like_pattern),
            ).fetchall()
            chosen = _pick_franchise_preferred(prefix_rows, latest_user_text)
            if chosen is None or chosen["tag"] in already_matched:
                continue
            norm_to_original.setdefault(chosen["tag"], original)
            char_rows.append(chosen)
            matched_tags.append(chosen["tag"])
            already_matched.add(chosen["tag"])

    outfits_by_char: dict[str, list[dict]] = {}
    poses_by_char: dict[str, list[dict]] = {}
    if matched_tags:
        char_placeholders = ",".join(["?"] * len(matched_tags))
        # Empty user_text → can only ever pick default outfit and no pose,
        # so narrow the outfits query and skip poses entirely.
        if user_text:
            outfit_sql = f"""SELECT id, character_tag, outfit_name, outfit_tags, outfit_natlang, is_default, sort_order
                FROM outfits
                WHERE character_tag IN ({char_placeholders})
                  AND (outfit_tags IS NOT NULL OR outfit_natlang IS NOT NULL)
                ORDER BY sort_order"""
        else:
            outfit_sql = f"""SELECT id, character_tag, outfit_name, outfit_tags, outfit_natlang, is_default, sort_order
                FROM outfits
                WHERE character_tag IN ({char_placeholders})
                  AND is_default = 1
                  AND (outfit_tags IS NOT NULL OR outfit_natlang IS NOT NULL)"""
        for r in db.execute(outfit_sql, matched_tags).fetchall():
            outfits_by_char.setdefault(r["character_tag"], []).append(dict(r))
        if user_text:
            pose_rows = db.execute(
                f"""SELECT id, character_tag, pose_name, pose_tags, pose_natlang, is_signature, sort_order
                    FROM poses
                    WHERE character_tag IN ({char_placeholders})
                      AND (pose_tags IS NOT NULL OR pose_natlang IS NOT NULL)
                    ORDER BY sort_order""",
                matched_tags,
            ).fetchall()
            for r in pose_rows:
                poses_by_char.setdefault(r["character_tag"], []).append(dict(r))

    matched = []
    for r in char_rows:
        if r["tag"] not in norm_to_original:
            continue
        # V2 chip-composed character body. V1 base_natlang is the
        # pre-rebuild paragraph; falls back when the character has no
        # appearance_chip_tags (legacy / unmigrated row).
        v2_base_natlang = compose_character_natlang_v2(db, r["tag"])
        # V2 returns just the chip-composed traits ("Female, blonde
        # hair, ..."), without the `<Display> from <Series>,` identity
        # intro the legacy renderer expects. Prepend it here when
        # absent so downstream sections start with the character's
        # name.
        if v2_base_natlang and (r["display"] or "").strip():
            display = (r["display"] or "").strip()
            series = (r["series"] or "").strip()
            identity = (f"{display} from {series}"
                        if series else display)
            if not v2_base_natlang.lower().startswith(identity.lower()):
                v2_base_natlang = f"{identity}, {v2_base_natlang}"
        entry = {
            "token": norm_to_original[r["tag"]],
            "tag": r["tag"],
            "display": r["display"] or "",
            "series": r["series"] or "",
            "base_tags": r["base_tags"] or "",
            "base_natlang": v2_base_natlang or (r["base_natlang"] or ""),
        }
        # Mask the character's series so "Street Fighter 6" outfit doesn't
        # fuzzy-match a generic franchise mention like "cammy from street
        # fighter" or "cammy_(street_fighter)". The canonical tag /
        # natural-language identity references are character-scope
        # markers, not outfit-scope.
        user_text_for_pickers = _mask_series_from_user_text(user_text, r["series"] or "")
        chosen, override = _pick_outfit_for(
            outfits_by_char.get(r["tag"], []),
            user_text_for_pickers,
            existing_outfit_names=existing_outfit_names,
        )
        if chosen:
            slot_rows = db.execute(
                "SELECT slot, item, color, source_phrase FROM outfit_tag_slots "
                "WHERE outfit_id = ? ORDER BY sort_order",
                (chosen["id"],),
            ).fetchall()
            # V2 chip-composed outfit body. V1 outfit_natlang is the
            # pre-rebuild paragraph; falls back when the outfit has no
            # outfit_tags chip list.
            v2_outfit_natlang = compose_outfit_natlang_v2(db, chosen["id"])
            outfit_data = {
                "id": chosen["id"],
                "name": chosen["outfit_name"] or "",
                "natlang": v2_outfit_natlang or (chosen["outfit_natlang"] or ""),
                "tags": chosen["outfit_tags"] or "",
                "slots": [dict(s) for s in slot_rows],
            }
            # Branch by override so downstream consumers can scope behavior
            # (e.g. negate dropped phrases only for the trained-canonical
            # default; non-default outfits don't have the latent-space mass
            # to fight removal).
            if override:
                entry["user_requested_outfit"] = outfit_data
            else:
                entry["default_outfit"] = outfit_data
            entry["outfit_overridden"] = override
        # Always ship the trained-canonical default's slot source_phrases,
        # regardless of which outfit was chosen. Used by
        # `_enforce_default_outfit_negation` to push the model away from the
        # latent-space-heavy trained default whenever the active outfit is
        # different (override OR a preserved override re-anchored via
        # existing_outfit_names). Without this, picking Killer Bee leaves
        # Delta Red unfought and the model leaks `green_leotard` etc. into
        # the image.
        canonical_default_phrases: list[str] = []
        for o in outfits_by_char.get(r["tag"], []):
            if o.get("is_default"):
                default_slot_rows = db.execute(
                    "SELECT source_phrase FROM outfit_tag_slots "
                    "WHERE outfit_id = ? ORDER BY sort_order",
                    (o["id"],),
                ).fetchall()
                for s in default_slot_rows:
                    phrase = (s["source_phrase"] or "").strip()
                    if phrase:
                        canonical_default_phrases.append(phrase)
                break
        if canonical_default_phrases:
            entry["canonical_default_slot_phrases"] = canonical_default_phrases
        all_poses_for_char = poses_by_char.get(r["tag"], [])
        entry["all_poses"] = [
            {
                "id": p["id"],
                "name": p["pose_name"] or "",
                "natlang": compose_pose_natlang_v2(db, p["id"]) or (p["pose_natlang"] or ""),
                "tags": p.get("pose_tags") or "",
                "is_signature": bool(p["is_signature"]),
            }
            for p in all_poses_for_char
        ]
        chosen_pose = _pick_pose_for(all_poses_for_char, user_text_for_pickers)
        if chosen_pose:
            entry["matched_pose"] = {
                "id": chosen_pose["id"],
                "name": chosen_pose["pose_name"] or "",
                "natlang": compose_pose_natlang_v2(db, chosen_pose["id"]) or (chosen_pose["pose_natlang"] or ""),
                "tags": chosen_pose["pose_tags"] or "",
                "is_signature": bool(chosen_pose["is_signature"]),
            }
        matched.append(entry)

    _dbg.info(
        "match-characters: tokens_in=%d normalized=%d matched=%d user_text_chars=%d",
        len(tokens), len(norm_to_original), len(matched), len(user_text),
    )
    if _dbg.isEnabledFor(logging.INFO):
        for entry in matched:
            outfit = entry.get("default_outfit") or {}
            pose = entry.get("matched_pose") or {}
            _dbg.info(
                "  matched %r -> tag=%s outfit=%r (overridden=%s) pose=%r",
                entry["token"], entry["tag"],
                outfit.get("name"), entry.get("outfit_overridden"),
                pose.get("name"),
            )
    # Echo the normalized forms so the client can diagnose why a known
    # character failed to match — lets us see exact-string vs DB contents.
    return {
        "matched": matched,
        "normalized": list(norm_to_original.keys()),
    }


@routes.post("/promptchain/tag-builder/match-characters")
async def _api_match_characters(request):
    """Thin JSON wrapper around `match_characters_inner`. Tests call the
    inner directly to bypass aiohttp."""
    data, err = await parse_json(request)
    if err: return err
    result = match_characters_inner(
        tokens=data.get("tokens") or [],
        user_text=data.get("user_text") or "",
        latest_user_text=data.get("latest_user_text") or "",
        node_prompt=data.get("node_prompt") or "",
    )
    return web.json_response(result)


@routes.post("/promptchain/tag-builder/match-buckets")
async def _api_match_buckets(request):
    """Semantic search over curated bucket items (pose, nsfw_action,
    action, expression, scene). Returns top-k rows by embedding cosine
    similarity to user_text — handles synonym / paraphrase that literal
    matching misses ("showing the bottoms of her foot at the viewer" →
    Presenting Feet)."""
    data, err = await parse_json(request)
    if err: return err
    user_text = (data.get("user_text") or "").strip()
    try:
        top_k = int(data.get("top_k") or 30)
    except (TypeError, ValueError):
        top_k = 30
    top_k = max(1, min(top_k, 100))
    if not user_text:
        return web.json_response({"matched": [], "user_text": ""})

    # Lazy import — bucket_search loads transformers/torch on first use,
    # so importing it at module scope would trigger that during ComfyUI
    # boot regardless of whether the user opens the Prompt Generator.
    from . import bucket_search
    matched = bucket_search.search(user_text, top_k=top_k)
    _dbg.info(
        "match-buckets: user_text_chars=%d top_k=%d returned=%d",
        len(user_text), top_k, len(matched),
    )
    if _dbg.isEnabledFor(logging.INFO):
        for m in matched[:10]:
            _dbg.info(
                "  %.3f [%s/%s] %s -> %s",
                m["score"], m["bucket"], m["item_group"],
                m["display_name"], (m["base_tags"] or "")[:80],
            )
    return web.json_response({"matched": matched, "user_text": user_text})


@routes.get("/promptchain/tag-builder/character-categories")
async def _api_character_categories(request):
    # Response shape is load-bearing for the picker — JS expects:
    # { categories: [{ tag, name, series: [{ tag, name, characters: [{ tag, display, post_count }] }] }] }
    db = get_db()
    search = request.query.get("search", "").strip()

    # Build search filter
    search_sql = ""
    params: list = []
    if search:
        normalized = search.lower().replace(" ", "_").strip("_")
        def _esc(s):
            return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        words = [w for w in normalized.replace("_", " ").split() if w]
        if len(words) > 1:
            word_clauses = []
            for word in words:
                pattern = f"%{_esc(word)}%"
                word_clauses.append(
                    "(LOWER(c.tag) LIKE ? ESCAPE '\\' OR LOWER(c.display) LIKE ? ESCAPE '\\' OR LOWER(cs.display_name) LIKE ? ESCAPE '\\')"
                )
                params.extend([pattern, pattern, pattern])
            search_sql = "AND (" + " AND ".join(word_clauses) + ")"
        else:
            pattern = f"%{_esc(normalized)}%"
            search_sql = "AND (LOWER(c.tag) LIKE ? ESCAPE '\\' OR LOWER(c.display) LIKE ? ESCAPE '\\' OR LOWER(cs.display_name) LIKE ? ESCAPE '\\')"
            params.extend([pattern, pattern, pattern])

    rows = db.execute(
        f"""
        SELECT
            cc.category_tag, cc.display_name AS category_name, cc.sort_order AS cat_order,
            cs.series_tag, cs.display_name AS series_name,
            c.tag, c.display, c.post_count
        FROM characters c
        JOIN character_series cs ON c.series_tag = cs.series_tag
        JOIN character_categories cc ON cs.category = cc.category_tag
        WHERE c.status IN ('processed', 'partial') {search_sql}
        ORDER BY cc.sort_order, cs.display_name COLLATE NOCASE, c.display COLLATE NOCASE
        """,
        params,
    ).fetchall()

    # Build nested structure matching legacy shape
    categories: dict = {}
    for row in rows:
        cat_tag = row["category_tag"]
        series_tag = row["series_tag"]

        if cat_tag not in categories:
            categories[cat_tag] = {
                "tag": cat_tag,
                "name": row["category_name"],
                "sort_order": row["cat_order"],
                "series": {},
            }

        if series_tag not in categories[cat_tag]["series"]:
            categories[cat_tag]["series"][series_tag] = {
                "tag": series_tag,
                "name": row["series_name"],
                "characters": [],
            }

        categories[cat_tag]["series"][series_tag]["characters"].append({
            "tag": row["tag"],
            "display": row["display"],
            "post_count": row["post_count"],
        })

    # Convert to sorted list
    result = []
    for cat in sorted(categories.values(), key=lambda x: x["sort_order"]):
        result.append({
            "tag": cat["tag"],
            "name": cat["name"],
            "series": sorted(cat["series"].values(), key=lambda x: x["name"].lower()),
        })

    return web.json_response({"categories": result})


# =====================================================================
#  2. PROPS  — was props_api.py
# =====================================================================


@routes.get("/promptchain/props/categories")
async def _api_props_categories(request):
    """List prop categories."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM prop_category_meta ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/props/items")
async def _api_props_items(request):
    """List props, optionally filtered by category."""
    db = get_db()
    category = request.query.get("category")
    if category:
        rows = db.execute(
            "SELECT * FROM props WHERE category = ? ORDER BY sort_order, display_name",
            (category,),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM props ORDER BY category, sort_order, display_name"
        ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/props/actions")
async def _api_props_actions(request):
    """List prop actions with parsed compatible_categories."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM prop_actions ORDER BY sort_order"
    ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["compatible_categories"] = json.loads(d["compatible_categories"])
        except (json.JSONDecodeError, TypeError):
            pass
        result.append(d)
    return web.json_response(result)


@routes.get("/promptchain/props/all")
async def _api_props_all(request):
    """Return categories, props, actions, materials, patterns, colors, action_overrides."""
    db = get_db()

    categories = [
        dict(r) for r in db.execute(
            "SELECT * FROM prop_category_meta ORDER BY sort_order"
        ).fetchall()
    ]

    props = [
        dict(r) for r in db.execute(
            "SELECT * FROM props ORDER BY category, sort_order, display_name"
        ).fetchall()
    ]

    actions_raw = db.execute(
        "SELECT * FROM prop_actions ORDER BY sort_order"
    ).fetchall()
    actions = []
    for r in actions_raw:
        d = dict(r)
        try:
            d["compatible_categories"] = json.loads(d["compatible_categories"])
        except (json.JSONDecodeError, TypeError):
            pass
        actions.append(d)

    materials = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture_materials ORDER BY sort_order"
        ).fetchall()
    ]

    patterns = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture_patterns ORDER BY sort_order"
        ).fetchall()
    ]

    colors = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture_colors ORDER BY sort_order"
        ).fetchall()
    ]

    # Group action overrides by prop_tag for client-side lookup
    action_overrides = {}
    for r in db.execute(
        "SELECT prop_tag, action_tag FROM prop_action_overrides ORDER BY prop_tag, sort_order"
    ).fetchall():
        action_overrides.setdefault(r["prop_tag"], []).append(r["action_tag"])

    return web.json_response({
        "categories": categories,
        "props": props,
        "actions": actions,
        "materials": materials,
        "patterns": patterns,
        "colors": colors,
        "action_overrides": action_overrides,
    })


@routes.post("/promptchain/props/assemble")
async def _api_props_assemble(request):
    """Assemble prop selection into output phrase with optional action.

    Request: { prop, material?, pattern?, color?, action? }
    Response: { tags, natlang, parts: { prop, material, pattern, color, action } }
    """
    data, err = await parse_json(request)
    if err: return err

    prop_tag = data.get("prop")
    action_tag = data.get("action")
    material_tag = data.get("material")
    pattern_tag = data.get("pattern")
    color_tag = data.get("color")

    if not prop_tag:
        return web.json_response({"error": "prop is required"}, status=400)

    db = get_db()

    prop = db.execute("SELECT * FROM props WHERE prop_tag = ?", (prop_tag,)).fetchone()
    if not prop:
        return web.json_response({"error": f"Unknown prop: {prop_tag}"}, status=404)
    prop = dict(prop)

    action = None
    if action_tag:
        row = db.execute("SELECT * FROM prop_actions WHERE action_tag = ?", (action_tag,)).fetchone()
        if row:
            action = dict(row)

    material = None
    pattern = None
    color = None

    if prop.get("is_customizable"):
        if material_tag:
            row = db.execute("SELECT * FROM furniture_materials WHERE tag = ?", (material_tag,)).fetchone()
            if row:
                material = dict(row)
        if pattern_tag and pattern_tag != "solid":
            row = db.execute("SELECT * FROM furniture_patterns WHERE tag = ?", (pattern_tag,)).fetchone()
            if row:
                pattern = dict(row)
        if color_tag:
            row = db.execute("SELECT * FROM furniture_colors WHERE tag = ?", (color_tag,)).fetchone()
            if row:
                color = dict(row)

    # Build prop phrase (without action)
    tags_parts = []
    natlang_parts = []

    if color and color.get("tag"):
        tags_parts.append(color["tag"])
        if color.get("prefix"):
            natlang_parts.append(color["prefix"])
    if pattern and pattern.get("tag") and pattern["tag"] != "solid":
        tags_parts.append(pattern["tag"])
        if pattern.get("prefix"):
            natlang_parts.append(pattern["prefix"])
    if material and material.get("tag"):
        tags_parts.append(material["tag"])
        if material.get("prefix"):
            natlang_parts.append(material["prefix"])

    if prop.get("prop_tag"):
        tags_parts.append(prop["prop_tag"])
    _display = prop.get("display_name")
    _phrase = prop.get("base_natlang") or (_display.lower() if isinstance(_display, str) else None)
    if _phrase:
        natlang_parts.append(_phrase)

    prop_tags = " ".join(str(p) for p in tags_parts if p)
    prop_natlang = " ".join(str(p) for p in natlang_parts if p)

    if action:
        prefix_tags = action.get("action_prefix_tags") or ""
        prefix_natlang = action.get("action_prefix_natlang") or ""
        final_tags = f"{prefix_tags} {prop_tags}".strip()
        final_natlang = f"{prefix_natlang} {prop_natlang}".strip()
    else:
        final_tags = prop_tags
        final_natlang = prop_natlang

    return web.json_response({
        "tags": final_tags,
        "natlang": final_natlang,
        "parts": {
            "prop": prop,
            "material": material,
            "pattern": pattern,
            "color": color,
            "action": action,
        },
    })


@routes.get("/promptchain/props/customizer")
async def _api_props_customizer(request):
    """Return materials, patterns, colors for the prop customizer UI."""
    db = get_db()

    materials = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture_materials ORDER BY sort_order"
        ).fetchall()
    ]

    patterns = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture_patterns ORDER BY sort_order"
        ).fetchall()
    ]

    colors = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture_colors ORDER BY sort_order"
        ).fetchall()
    ]

    return web.json_response({
        "materials": materials,
        "patterns": patterns,
        "colors": colors,
    })


# =====================================================================
#  3. CLOTHING  — was clothing_api.py
# =====================================================================

CUSTOMIZABLE_GROUPS = [
    "legwear",
    "footwear",
    "lingerie",
    "underwear",
    "swimwear",
    "dresses",
    "handwear",
    "tops",
    "bottoms",
]


@routes.get("/promptchain/clothing/colors")
async def _api_clothing_colors(request):
    """List clothing colors."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM clothing_colors ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/clothing/materials")
async def _api_clothing_materials(request):
    """List clothing materials."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM clothing_materials ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/clothing/conditions")
async def _api_clothing_conditions(request):
    """List clothing conditions."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM clothing_conditions ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/clothing/patterns")
async def _api_clothing_patterns(request):
    """List clothing patterns."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM clothing_patterns ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/clothing/customizer-data")
async def _api_clothing_customizer_data(request):
    """Return colors, materials, conditions, patterns for clothing customizer."""
    db = get_db()

    colors = [
        dict(r) for r in db.execute(
            "SELECT * FROM clothing_colors ORDER BY sort_order"
        ).fetchall()
    ]
    materials = [
        dict(r) for r in db.execute(
            "SELECT * FROM clothing_materials ORDER BY sort_order"
        ).fetchall()
    ]
    conditions = [
        dict(r) for r in db.execute(
            "SELECT * FROM clothing_conditions ORDER BY sort_order"
        ).fetchall()
    ]
    patterns = [
        dict(r) for r in db.execute(
            "SELECT * FROM clothing_patterns ORDER BY sort_order"
        ).fetchall()
    ]

    return web.json_response({
        "colors": colors,
        "materials": materials,
        "conditions": conditions,
        "patterns": patterns,
    })


@routes.get("/promptchain/clothing/customizable-groups")
async def _api_clothing_customizable_groups(request):
    """Return clothing groups and items for customizable groups only."""
    db = get_db()

    groups = []
    for group_name in CUSTOMIZABLE_GROUPS:
        group = db.execute(
            "SELECT * FROM clothing_groups WHERE group_name = ?", (group_name,)
        ).fetchone()
        if not group:
            continue

        items = db.execute(
            "SELECT * FROM clothing_items WHERE item_group = ? ORDER BY sort_order, display_name",
            (group_name,),
        ).fetchall()

        groups.append({
            "group_name": group["group_name"],
            "display_name": group["display_name"],
            "description": group["description"],
            "items": [dict(i) for i in items],
        })

    return web.json_response(groups)


# =====================================================================
#  4. FANTASY  — was fantasy_api.py
# =====================================================================

CUSTOMIZABLE_FANTASY_FEATURES = ["horns", "wings", "tail", "ears", "scales", "fur"]


@routes.get("/promptchain/fantasy/features")
async def _api_fantasy_features(request):
    """List fantasy features."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM fantasy_features ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/fantasy/colors")
async def _api_fantasy_colors(request):
    """List fantasy colors."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM fantasy_colors ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/fantasy/types")
async def _api_fantasy_types(request):
    """List fantasy types."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM fantasy_types ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/fantasy/shapes")
async def _api_fantasy_shapes(request):
    """List fantasy shapes."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM fantasy_shapes ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/fantasy/customizer-data")
async def _api_fantasy_customizer_data(request):
    """Return features, colors, types, shapes for the fantasy customizer."""
    db = get_db()

    features = [
        dict(r) for r in db.execute(
            "SELECT * FROM fantasy_features ORDER BY sort_order"
        ).fetchall()
    ]
    colors = [
        dict(r) for r in db.execute(
            "SELECT * FROM fantasy_colors ORDER BY sort_order"
        ).fetchall()
    ]
    types = [
        dict(r) for r in db.execute(
            "SELECT * FROM fantasy_types ORDER BY sort_order"
        ).fetchall()
    ]
    shapes = [
        dict(r) for r in db.execute(
            "SELECT * FROM fantasy_shapes ORDER BY sort_order"
        ).fetchall()
    ]

    return web.json_response({
        "features": features,
        "colors": colors,
        "types": types,
        "shapes": shapes,
    })


@routes.get("/promptchain/fantasy/customizable-features")
async def _api_fantasy_customizable_features(request):
    """Return only the customizable fantasy features."""
    db = get_db()

    result = []
    for feature_tag in CUSTOMIZABLE_FANTASY_FEATURES:
        feature = db.execute(
            "SELECT * FROM fantasy_features WHERE tag = ?", (feature_tag,)
        ).fetchone()
        if feature:
            result.append(dict(feature))

    return web.json_response(result)


# =====================================================================
#  5. FURNITURE  — was furniture_api.py
# =====================================================================


@routes.get("/promptchain/furniture")
async def _api_furniture_list(request):
    """List furniture items, optionally filtered by category."""
    db = get_db()
    category = request.query.get("category")
    if category:
        rows = db.execute(
            "SELECT * FROM furniture WHERE category = ? ORDER BY sort_order, display",
            (category,),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM furniture ORDER BY category, sort_order, display"
        ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/furniture/materials")
async def _api_furniture_materials(request):
    """List furniture materials."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM furniture_materials ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/furniture/patterns")
async def _api_furniture_patterns(request):
    """List furniture patterns."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM furniture_patterns ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/furniture/colors")
async def _api_furniture_colors(request):
    """List furniture colors."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM furniture_colors ORDER BY sort_order"
    ).fetchall()
    return web.json_response([dict(r) for r in rows])


@routes.get("/promptchain/furniture/color-groups")
async def _api_furniture_color_groups(request):
    """List distinct furniture color groups."""
    db = get_db()
    rows = db.execute(
        "SELECT DISTINCT color_group FROM furniture_colors ORDER BY color_group"
    ).fetchall()
    return web.json_response([r["color_group"] for r in rows])


@routes.get("/promptchain/furniture/all")
async def _api_furniture_all(request):
    """Return all furniture data: items, materials, patterns, colors."""
    db = get_db()

    furniture = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture ORDER BY category, sort_order, display"
        ).fetchall()
    ]
    materials = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture_materials ORDER BY sort_order"
        ).fetchall()
    ]
    patterns = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture_patterns ORDER BY sort_order"
        ).fetchall()
    ]
    colors = [
        dict(r) for r in db.execute(
            "SELECT * FROM furniture_colors ORDER BY sort_order"
        ).fetchall()
    ]

    return web.json_response({
        "furniture": furniture,
        "materials": materials,
        "patterns": patterns,
        "colors": colors,
    })
