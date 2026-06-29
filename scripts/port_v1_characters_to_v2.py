#!/usr/bin/env python
"""
Port v1 characters into v2 tag-builder chip format.

Restructures each character's OWN base_tags + base_natlang paragraph into:
  - appearance_chip_tags  (JSON array of appearance_items.item_tag that slot)
  - base_extras           (tokens with no matching chip, ride alongside)
  - character_chip_overrides  (per-chip rich natlang carved from the paragraph)
  - natlang_status = 'normalized'  (so the v2 picker shows them)
  - base_tags recomposed from the above (the cached flat projection)

The LLM call is RESTRUCTURING provided text — it needs no knowledge of the
character, so accuracy does not depend on how obscure the character is.

Runs on the Anthropic API (your usage credits), independent of any Claude Code
session limit. Safe by default: --dry-run prints intended writes and changes
nothing. Resumable: only touches characters still natlang_status='unprocessed'.

  export ANTHROPIC_API_KEY=sk-ant-...
  python port_v1_to_v2.py --dry-run --limit 5      # preview
  python port_v1_to_v2.py --limit 50               # port 50 for real
  python port_v1_to_v2.py                           # port all remaining
"""
import argparse, json, os, re, sys, sqlite3, time

DB_PATH = r"C:/comfyui/comfyui/custom_nodes/ComfyUI-PromptChain/data/tag-builder/tag-builder.db"
MODEL = "claude-sonnet-4-5"
PALETTE_GROUPS = ["modifiers", "hair_color", "hair_length", "hair_style", "hair_accessories",
                  "eye_color", "eyes", "skin", "body_type", "breast_size", "ass_size",
                  "body_marks", "fantasy"]

# Near-synonym tokens that should map onto an existing palette chip instead of
# falling to base_extras. Keeps common danbooru variants slottable.
VOCAB_ALIASES = {
    "silver_hair": "white_hair",
    "platinum_blonde_hair": "blonde_hair",
    "dark_green_eyes": "green_eyes",
    "light_brown_hair": "brown_hair",
}

PORT_TOOL = {
    "name": "emit_port",
    "description": "Return the v2 port for each character.",
    "input_schema": {
        "type": "object",
        "properties": {
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "tag": {"type": "string"},
                        "chip_tags": {"type": "array", "items": {"type": "string"},
                                      "description": "base_tags tokens that are verbatim palette keys"},
                        "base_extras": {"type": "string", "description": "comma-joined non-palette tokens"},
                        "overrides": {"type": "array", "items": {"type": "object", "properties": {
                            "chip_tag": {"type": "string"}, "natlang": {"type": "string"}},
                            "required": ["chip_tag", "natlang"]},
                            "description": "per-chip rich natlang carved ONLY from the paragraph"},
                        "terse_natlang": {"type": "string"},
                    },
                    "required": ["tag", "chip_tags", "base_extras", "overrides", "terse_natlang"],
                },
            }
        },
        "required": ["results"],
    },
}

SYSTEM_RULES = (
    "You PORT v1 characters into the v2 tag-builder chip format. This is pure RESTRUCTURING "
    "of each character's OWN provided data. NEVER add an appearance fact not present in that "
    "character's base_tags or base_natlang. You need no outside knowledge of who they are.\n"
    "For each character:\n"
    "1. chip_tags: every base_tags token (weights stripped, identity lead and the character's own "
    "tag excluded) that is a VERBATIM key in the palette below.\n"
    "2. base_extras: comma-joined base_tags tokens that are NOT palette keys.\n"
    "3. overrides: for each chip the paragraph describes more specifically than its generic phrase, "
    "a short natlang using ONLY paragraph wording. Never invent; never restate the generic; omit "
    "chips the paragraph does not elaborate.\n"
    "4. terse_natlang: one line, display name + series only.\n"
    "Call emit_port with one result per character."
)


def strip_weight(tok):
    # Greedy inner capture so a character tag that itself contains parens
    # (e.g. "(artoria_pendragon_(fate):1.1)") strips to its bare form, not a
    # truncated fragment that would leak into base_extras.
    tok = tok.strip()
    m = re.match(r"^\((.+):[0-9.]+\)$", tok)
    if m:
        return m.group(1)
    return tok


def load_palette(conn):
    palette = {}
    for g in PALETTE_GROUPS:
        palette[g] = {r["item_tag"]: (r["base_natlang"] or "")
                      for r in conn.execute(
                          "SELECT item_tag, base_natlang FROM appearance_items "
                          "WHERE item_group=? ORDER BY sort_order, item_tag", (g,))}
    return palette


def palette_keys(palette):
    keys = set()
    for g in palette.values():
        keys.update(g.keys())
    return keys


def select_pending(conn, limit):
    q = ("SELECT tag, display, series, base_tags, base_natlang FROM characters "
         "WHERE natlang_status='unprocessed' AND base_tags IS NOT NULL AND base_tags!=''")
    if limit:
        q += f" ORDER BY post_count DESC LIMIT {int(limit)}"
    return conn.execute(q).fetchall()


def compose_base_tags(tag, base_extras, chip_tags):
    parts = [f"({tag}:1.1)"]
    if base_extras.strip():
        parts.append(base_extras.strip())
    parts.extend(chip_tags)
    return ", ".join(p for p in parts if p)


def reconcile(conn, char, result, valid_keys):
    """Trust the source base_tags, not the model, for which tokens exist.
    Re-derive chips/extras mechanically from base_tags so a model slip cannot
    invent or drop a token; keep only the model's overrides (the real value-add)
    after confirming each targets a real chip."""
    tag = char["tag"]
    tokens = [strip_weight(t) for t in (char["base_tags"] or "").split(",") if t.strip()]
    chips, extras = [], []
    for tok in tokens:
        if tok == tag:
            continue
        key = VOCAB_ALIASES.get(tok, tok)
        if key in valid_keys and key not in chips:
            chips.append(key)
        elif key not in valid_keys:
            extras.append(tok)
    chip_set = set(chips)
    overrides = [o for o in result.get("overrides", [])
                 if o.get("chip_tag") in chip_set and (o.get("natlang") or "").strip()]
    return {
        "tag": tag,
        "chip_tags": chips,
        "base_extras": ", ".join(extras),
        "overrides": overrides,
        "terse_natlang": (result.get("terse_natlang") or f"{char['display']}.").strip(),
    }


def ensure_backup_column(conn):
    # base_natlang is reduced to a terse identity line on port; preserve the
    # original rich paragraph so the change is reversible and the dropped
    # details (skin/height/build) stay available for later enrichment.
    try:
        conn.execute("ALTER TABLE characters ADD COLUMN base_natlang_orig TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # already exists


def write_port(conn, port):
    tag = port["tag"]
    conn.execute(
        "UPDATE characters SET base_natlang_orig = COALESCE(base_natlang_orig, base_natlang) WHERE tag=?",
        (tag,))
    conn.execute(
        "UPDATE characters SET appearance_chip_tags=?, base_extras=?, base_natlang=?, "
        "base_tags=?, natlang_status='normalized' WHERE tag=?",
        (json.dumps(port["chip_tags"]), port["base_extras"], port["terse_natlang"],
         compose_base_tags(tag, port["base_extras"], port["chip_tags"]), tag),
    )
    conn.execute("DELETE FROM character_chip_overrides WHERE character_tag=?", (tag,))
    for o in port["overrides"]:
        conn.execute(
            "INSERT INTO character_chip_overrides (character_tag, chip_tag, natlang, status) "
            "VALUES (?,?,?, 'normalized')", (tag, o["chip_tag"], o["natlang"]))


def call_api(client, palette, batch):
    palette_text = json.dumps(palette, ensure_ascii=False)
    chars = [{"tag": r["tag"], "display": r["display"], "series": r["series"],
              "base_tags": r["base_tags"], "base_natlang": r["base_natlang"]} for r in batch]
    msg = client.messages.create(
        model=MODEL, max_tokens=4096,
        system=[
            {"type": "text", "text": SYSTEM_RULES},
            # cache_control keeps the (large, identical) palette cheap across calls
            {"type": "text", "text": "PALETTE (group -> {item_tag: generic_natlang}):\n" + palette_text,
             "cache_control": {"type": "ephemeral"}},
        ],
        tools=[PORT_TOOL], tool_choice={"type": "tool", "name": "emit_port"},
        messages=[{"role": "user", "content":
                   "Port these characters:\n" + json.dumps(chars, ensure_ascii=False)}],
    )
    for block in msg.content:
        if block.type == "tool_use":
            return block.input.get("results", [])
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print intended writes, change nothing")
    ap.add_argument("--limit", type=int, default=0, help="only the N most popular pending chars")
    ap.add_argument("--batch", type=int, default=8, help="characters per API call")
    ap.add_argument("--db", default=DB_PATH)
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    conn.text_factory = lambda x: x.decode("utf-8", "replace")  # some rows have bad bytes
    if not args.dry_run:
        ensure_backup_column(conn)
    palette = load_palette(conn)
    valid_keys = palette_keys(palette)
    pending = select_pending(conn, args.limit)
    print(f"{len(pending)} characters to port (dry_run={args.dry_run}, batch={args.batch})")
    if not pending:
        return

    client = None
    if not args.dry_run:
        from anthropic import Anthropic  # pip install anthropic
        client = Anthropic()  # reads ANTHROPIC_API_KEY

    done = 0
    for i in range(0, len(pending), args.batch):
        batch = pending[i:i + args.batch]
        by_tag = {r["tag"]: r for r in batch}
        if args.dry_run:
            # No API spend: derive chips/extras mechanically, skip override text.
            results = [{"tag": r["tag"], "overrides": [], "terse_natlang": f"{r['display']}."} for r in batch]
        else:
            for attempt in range(3):
                try:
                    results = call_api(client, palette, batch)
                    break
                except Exception as e:
                    print(f"  API error ({e}); retry {attempt+1}/3", file=sys.stderr)
                    time.sleep(2 * (attempt + 1))
            else:
                print("  batch failed after retries; skipping", file=sys.stderr)
                continue

        for res in results:
            char = by_tag.get(res.get("tag"))
            if not char:
                continue
            port = reconcile(conn, char, res, valid_keys)
            if args.dry_run:
                print(f"  {port['tag']:40} chips={len(port['chip_tags'])} "
                      f"extras=[{port['base_extras']}] overrides={len(port['overrides'])}")
            else:
                write_port(conn, port)
                done += 1
        if not args.dry_run:
            conn.commit()
            print(f"  committed {done}/{len(pending)}")

    print("done." if not args.dry_run else "dry-run complete (no changes written).")


if __name__ == "__main__":
    main()
