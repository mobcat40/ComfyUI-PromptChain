"""Decompose probe — step 1 of the railed-thinking pipeline.

ONE LLM call that takes the user's natural-language edit request and
emits a structured list of `(concept, text)` intents. Each intent will
later flow to locate-then-infill on the current prompt span that holds
that concept.

This is the "is this edit or new prompt? + how many edits? + which
concept does each touch?" portion of the chain — done in a single
narrow call because at 9B scale, decoupling the rails into separate
roundtrips gives more reliability than asking the model to think
step-by-step internally.

The output schema is intentionally tiny:

  EDIT_OR_NEW: edit | new
  INTENT: concept=<name>, text=<short imperative>
  INTENT: concept=<name>, text=<short imperative>
  ...

Run:
  cd <ComfyUI>/custom_nodes/ComfyUI-PromptChain
  python scripts/natlang_decompose_probe.py
  python scripts/natlang_decompose_probe.py <filter>
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import types


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)


class _StubRoutes:
    def _passthrough(self, _p):
        def w(f): return f
        return w
    post = get = put = delete = patch = head = options = _passthrough


sys.modules.setdefault(
    "folder_paths",
    types.SimpleNamespace(
        folder_names_and_paths={},
        get_folder_paths=lambda x: [],
        get_full_path=lambda *a, **k: None,
        models_dir="/tmp",
        get_user_directory=lambda: os.path.join(ROOT, "..", "..", "user"),
        base_path=os.path.join(ROOT, "..", ".."),
    ),
)
sys.modules.setdefault(
    "server",
    types.SimpleNamespace(PromptServer=types.SimpleNamespace(
        instance=types.SimpleNamespace(routes=_StubRoutes(),
                                       send_sync=lambda *a, **k: None),
    )),
)

from core import ai_api  # noqa: E402


PROVIDER = "local"
CONFIG = {"local": {"base_url": "http://localhost:11434/v1",
                    "model": "qwen3-vl:8b-instruct"}}


CONCEPTS = (
    "subject", "hair", "eyes", "body", "face", "expression",
    "outfit",  # whole-outfit meta-concept for wholesale swaps
    "tops", "bottoms", "footwear", "legwear", "handwear", "armwear",
    "headwear", "neckwear", "accessories",
    "pose", "scene", "style", "quality",
)


# ── System prompt ────────────────────────────────────────────────
# Examples are deliberately drawn from medieval/fantasy content so
# they pass the litmus test: if test fixtures used entirely different
# characters, these examples would still teach the SHAPE of the task
# (multi-intent split, anatomy-routes-to-slot, remove verb in text).


DECOMPOSE_SYSTEM = """You break a user's image-prompt edit request into a structured list of atomic edit intents.

Each thing the user wants to change becomes one INTENT line with:
  concept: which slot of the prompt this edit touches
  op:      the kind of change (see Op vocabulary below)
  text:    the new content, the item to remove, or the modifier to apply

Concept taxonomy (pick the one that most directly describes the change):
  subject       named character or identity
  hair          hair color, length, style
  eyes          eye color, eye shape
  body          build, height, weight, bust size, muscle tone, skin tone
  face          facial features, scars, makeup, lips, nose (not expression)
  expression    facial affect (smile, frown, sultry, neutral)
  outfit        WHOLE outfit swap — when the user names another character's outfit, says "swap her outfit to X", "give her Y's outfit", "she's wearing the schoolgirl uniform now", or otherwise replaces the entire ensemble at once. Use this INSTEAD of fanning out into per-slot concepts. If the user only specifies one or two items, use the specific slot concepts below.
  tops          torso clothing (shirts, vests, jackets, leotard torso part)
  bottoms       waist-down clothing (pants, skirts, shorts, leotard pelvis part)
  footwear      anything on or about the feet — shoes, boots, socks, barefoot
  legwear       socks/stockings/leggings worn ABOVE shoes
  handwear      gloves, gauntlets, hand wraps
  armwear       sleeves, armbands, bracers (above the wrist)
  headwear      hats, caps, headbands, helmets
  neckwear      ties, scarves, collars, necklaces, chokers
  accessories   jewelry, body paint, tattoos, miscellaneous WORN items only
                — NEVER pets, animals, held objects, props, furniture, or
                anything the character is INTERACTING WITH but not wearing.
                A cat on the lap, a sword in hand, a coffee cup, leaning
                against a wall — those are POSE details, not accessories.
                If the user describes the character with/holding/petting/
                touching/leaning on/sitting beside something, fold that
                description into the POSE intent's text, do NOT split it
                into an accessories intent.
  pose          body position, action, gesture, gaze direction, AND any
                objects/animals/people the character is holding, touching,
                sitting on/beside, or otherwise interacting with. Keep
                interaction details with the pose verb so the prompt
                reads naturally ("sitting on a bed with an orange cat on
                her lap" stays as ONE pose intent).
  scene         environment, location, background, lighting, time of day
  style         rendering style or art aesthetic
  quality       quality tokens (sharp focus, masterpiece, depth of field)

Op vocabulary (pick exactly one per intent):
  add         introduce a new clothing item / accessory / piece to a slot
              ("wearing red socks", "put on a helmet", "she has a sword")
  remove      strip an item ("remove the boots", "no necktie", "drop the cape")
  modify      change a property (color, length, size, material) of an
              existing item or feature ("longer hair", "leotard pink",
              "make the gloves blue")
  anatomy_mod append a body-part size/shape modifier (refers to anatomy of
              feet/hands/arms/hair/etc., NOT to a garment property)
              ("bigger feet", "longer pointed ears", "thicker thighs")
  replace     swap the entire slot's content for something new (body-state
              modifiers like "barefoot"/"topless", whole-pose swaps, scene
              swaps, style swaps)

EMBEDDED BODY-STATE — body-state words inside a longer pose/scene/action phrase are SEPARATE intents from the surrounding action. Split them out: the body-state becomes its own intent on the appropriate clothing slot, and the surrounding action becomes the pose intent with the body-state token removed.

Body-state words and their canonical forms (use the canonical form in the body-state intent's text):
  barefoot ← barefeet / bare feet / bare-feet / bare foot
  topless ← bare chest / bare-chested / bareback
  bareheaded ← bare-headed / no hat / hatless
  nude ← naked / unclothed
  bare-handed ← bare hands / no gloves
  bare-armed ← bare arms / no sleeves

Pattern recognizer: any phrase shaped `<pose verb> ... <body-state word>` or `<pose verb> ... presenting <body-state word>` is TWO intents — split.

When splitting, the pose intent's text MUST have the body-state token STRIPPED OUT or replaced with the neutral body-part word: `barefeet` / `bare feet` becomes `feet`, `topless` is removed entirely, `bareheaded` is removed, `bare hands` becomes `hands`. The body-state intent carries the canonical body-state word in its text field.

ANATOMY ROUTING — when the request describes a body part's size/shape, route it to the slot covering that body part:
  feet/toes               -> footwear
  hands/fingers           -> handwear
  head shape / skull      -> headwear
  hair length/color       -> hair
  arms/biceps             -> armwear
  legs/thighs             -> bottoms (or legwear if leg-only)
  chest/bust/torso        -> body
  nose/mouth/scars        -> face

If the user request bundles several changes, output one INTENT line per atomic change. BUT if several phrases describe the SAME concept (e.g. multiple words about a single pose), merge them into ONE intent with combined text.

If the user request is dictating a NEW prompt from scratch (no obvious reference to an existing prompt's content), set EDIT_OR_NEW: new. Otherwise EDIT_OR_NEW: edit.

Output format — no commentary, no markdown fences, exactly this shape:

  EDIT_OR_NEW: edit
  INTENT: concept=<name>, op=<verb>, text=<content>
  INTENT: concept=<name>, op=<verb>, text=<content>

The text field should contain just the new content / item / modifier — NOT verbs like "add" / "remove" / "put on" (those go in op).

Generic examples (different content from any specific test case — they teach the SHAPE, not the answer):

  request: paint her gauntlets green
  EDIT_OR_NEW: edit
  INTENT: concept=handwear, op=modify, text=green

  request: she's wearing chainmail and a steel helm now
  EDIT_OR_NEW: edit
  INTENT: concept=tops, op=add, text=chainmail
  INTENT: concept=headwear, op=add, text=steel helm

  request: scrap the cape
  EDIT_OR_NEW: edit
  INTENT: concept=accessories, op=remove, text=cape

  request: longer pointed ears
  EDIT_OR_NEW: edit
  INTENT: concept=face, op=anatomy_mod, text=longer pointed ears

  request: bigger hands
  EDIT_OR_NEW: edit
  INTENT: concept=handwear, op=anatomy_mod, text=bigger hands

  request: change to a snowy mountain peak at dusk
  EDIT_OR_NEW: edit
  INTENT: concept=scene, op=replace, text=snowy mountain peak at dusk

  request: switch to kneeling, hands clasped in prayer
  EDIT_OR_NEW: edit
  INTENT: concept=pose, op=replace, text=kneeling, hands clasped in prayer

  request: barefoot
  EDIT_OR_NEW: edit
  INTENT: concept=footwear, op=replace, text=barefoot

  request: put the iron helm back on
  EDIT_OR_NEW: edit
  INTENT: concept=headwear, op=add, text=iron helm

  request: knight in plate armor wielding a longsword on a battlefield
  EDIT_OR_NEW: new
  INTENT: concept=subject, op=replace, text=knight
  INTENT: concept=tops, op=add, text=plate armor
  INTENT: concept=pose, op=replace, text=wielding a longsword
  INTENT: concept=scene, op=replace, text=battlefield

  request: swap her outfit to the temple priestess robes
  EDIT_OR_NEW: edit
  INTENT: concept=outfit, op=replace, text=temple priestess robes

  request: give her the wizard's whole getup
  EDIT_OR_NEW: edit
  INTENT: concept=outfit, op=replace, text=the wizard's outfit

  request: standing in a fighting stance with bare feet
  EDIT_OR_NEW: edit
  INTENT: concept=pose, op=replace, text=standing in a fighting stance
  INTENT: concept=footwear, op=replace, text=barefoot

  request: lying on a couch, topless
  EDIT_OR_NEW: edit
  INTENT: concept=pose, op=replace, text=lying on a couch
  INTENT: concept=tops, op=replace, text=topless

  request: kneeling on the floor presenting bare feet to the camera
  EDIT_OR_NEW: edit
  INTENT: concept=pose, op=replace, text=kneeling on the floor presenting feet to the camera
  INTENT: concept=footwear, op=replace, text=barefoot

  request: lying back showing barefeet
  EDIT_OR_NEW: edit
  INTENT: concept=pose, op=replace, text=lying back showing feet
  INTENT: concept=footwear, op=replace, text=barefoot

  request: standing with bare hands raised in surrender
  EDIT_OR_NEW: edit
  INTENT: concept=pose, op=replace, text=standing with hands raised in surrender
  INTENT: concept=handwear, op=replace, text=bare-handed
"""


# ── Parser ────────────────────────────────────────────────────────


VALID_OPS = ("add", "remove", "modify", "anatomy_mod", "replace")


def _parse_decompose_output(raw: str) -> dict:
    """Parse the LLM's structured output into:
      {edit_or_new: 'edit'|'new'|'unknown',
       intents: [{concept, op, text}, ...],
       parse_errors: [str, ...]}
    Same-concept intents are merged: if two intents share concept and
    have compatible ops, the second's text is appended to the first.
    """
    text = (raw or "").strip()
    out = {"edit_or_new": "unknown", "intents": [], "parse_errors": []}
    if not text:
        out["parse_errors"].append("empty response")
        return out
    if text.startswith("```"):
        ls = text.splitlines()
        if ls and ls[0].startswith("```"):
            ls = ls[1:]
        if ls and ls[-1].startswith("```"):
            ls = ls[:-1]
        text = "\n".join(ls).strip()
    valid_concepts = set(CONCEPTS)
    raw_intents: list[dict] = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        m = re.match(r"^EDIT_OR_NEW\s*:\s*(\w+)", s, re.IGNORECASE)
        if m:
            v = m.group(1).strip().lower()
            if v in ("edit", "new"):
                out["edit_or_new"] = v
            else:
                out["parse_errors"].append(f"bad edit_or_new: {v!r}")
            continue
        m = re.match(r"^INTENT\s*:\s*(.+)$", s, re.IGNORECASE)
        if m:
            body = m.group(1).strip()
            cm = re.search(r"concept\s*=\s*([A-Za-z_]+)", body, re.IGNORECASE)
            om = re.search(r"op\s*=\s*([A-Za-z_]+)", body, re.IGNORECASE)
            tm = re.search(r"text\s*=\s*(.+)$", body, re.IGNORECASE)
            if not cm:
                out["parse_errors"].append(f"missing concept in: {s!r}")
                continue
            if not tm:
                out["parse_errors"].append(f"missing text in: {s!r}")
                continue
            concept = cm.group(1).strip().lower()
            if concept not in valid_concepts:
                out["parse_errors"].append(
                    f"unknown concept {concept!r} in: {s!r}"
                )
                continue
            op = (om.group(1).strip().lower() if om else "")
            if op and op not in VALID_OPS:
                out["parse_errors"].append(f"unknown op {op!r} in: {s!r}")
                op = ""
            # Strip the op= portion off the text capture if it was
            # picked up by the trailing tm regex.
            txt = tm.group(1).strip().rstrip(",").strip()
            # If the model emitted op= AFTER text=, tm could have
            # swallowed it. Defensively split on ', op=' if present.
            txt = re.sub(r",\s*op\s*=.*$", "", txt, flags=re.IGNORECASE).strip()
            raw_intents.append({"concept": concept, "op": op, "text": txt})
            continue
        if re.search(r"\b(concept|text|op)\b\s*=", s, re.IGNORECASE):
            out["parse_errors"].append(f"orphan intent-shaped line: {s!r}")

    # Merge same-concept intents when ops are compatible.
    # Mergeable: replace+replace -> one replace with combined text.
    # add+add -> one add with combined text. modify+modify -> one modify.
    # Anything else (mixed ops on same concept) stays separate.
    merged: list[dict] = []
    for it in raw_intents:
        if merged and merged[-1]["concept"] == it["concept"] \
                and merged[-1]["op"] == it["op"]:
            merged[-1]["text"] = f"{merged[-1]['text']}, {it['text']}"
        else:
            merged.append(dict(it))
    out["intents"] = merged
    return out


# ── Probe API ─────────────────────────────────────────────────────


async def decompose(user_request: str) -> tuple[dict, str]:
    raw = await ai_api._run_generation(
        f"decompose-{abs(hash(user_request)) % 10000}", PROVIDER, CONFIG,
        DECOMPOSE_SYSTEM,
        f"User edit request: {user_request}\n\nStructured intents:",
        [],
    )
    return _parse_decompose_output(raw), (raw or "")


# ── Test fixtures ─────────────────────────────────────────────────


FIXTURES = [
    {
        "name": "barefoot_modifier",
        "request": "barefoot",
        "expect_edit_or_new": "edit",
        "expect_n_intents": 1,
        "expect_concepts_any": [{"footwear"}],
    },
    {
        "name": "make_feet_bigger_anatomy",
        "request": "make feet bigger",
        "expect_edit_or_new": "edit",
        "expect_n_intents": 1,
        # Anatomy on feet should route to footwear (slot covering feet)
        "expect_concepts_any": [{"footwear"}],
        # Body would be acceptable but less correct for z-image adjacency
    },
    {
        "name": "wearing_red_socks",
        "request": "wearing red socks",
        "expect_edit_or_new": "edit",
        "expect_n_intents": 1,
        # socks could land on footwear or legwear — accept either
        "expect_concepts_any": [{"footwear", "legwear"}],
    },
    {
        "name": "leotard_pink",
        "request": "make her leotard pink",
        "expect_edit_or_new": "edit",
        # Could be 1 intent (one of tops/bottoms) or 2 (both)
        # Acceptable: any subset of {tops, bottoms}
        "expect_concepts_any": [{"tops"}, {"bottoms"}, {"tops", "bottoms"}],
    },
    {
        "name": "switch_to_standing",
        "request": "switch to standing",
        "expect_edit_or_new": "edit",
        "expect_n_intents": 1,
        "expect_concepts_any": [{"pose"}],
    },
    {
        "name": "longer_hair",
        "request": "longer hair",
        "expect_edit_or_new": "edit",
        "expect_n_intents": 1,
        "expect_concepts_any": [{"hair"}],
    },
    {
        "name": "smile",
        "request": "smile",
        "expect_edit_or_new": "edit",
        "expect_n_intents": 1,
        "expect_concepts_any": [{"expression"}],
    },
    {
        "name": "multi_remove_and_add",
        "request": "remove the boots and add red socks",
        "expect_edit_or_new": "edit",
        "expect_n_intents_min": 2,
        # Both intents should be footwear (or socks could be legwear)
        "expect_concepts_subset_of": {"footwear", "legwear"},
    },
    {
        "name": "multi_color",
        "request": "make her gloves blue and necktie red",
        "expect_edit_or_new": "edit",
        "expect_n_intents_min": 2,
        "expect_concepts_subset_of": {"handwear", "neckwear"},
    },
    {
        "name": "put_boots_back_on",
        "request": "put the brown boots back on",
        "expect_edit_or_new": "edit",
        "expect_n_intents": 1,
        "expect_concepts_any": [{"footwear"}],
    },
    {
        "name": "strip_only_blue_socks",
        "request": "wearing only blue socks",
        "expect_edit_or_new": "edit",
        # This is hard — model might output 1 intent (footwear=only blue
        # socks) or several (every other slot=remove). Just inspect.
    },
    {
        "name": "no_scene",
        "request": "no scene",
        "expect_edit_or_new": "edit",
        "expect_concepts_any": [{"scene"}],
    },
    {
        "name": "new_prompt",
        "request": "anime girl with blue hair standing on a rooftop at night, cinematic",
        # This one is ambiguous — could be edit (replace everything) or
        # new. Inspect output.
    },
]


def _print_block(label: str, body: str) -> None:
    print(f"--- {label} ---")
    for line in body.splitlines():
        print(f"  {line}")
    print()


def _check(fx: dict, parsed: dict) -> list[str]:
    failures: list[str] = []
    if "expect_edit_or_new" in fx:
        if parsed["edit_or_new"] != fx["expect_edit_or_new"]:
            failures.append(
                f"edit_or_new={parsed['edit_or_new']!r} expected {fx['expect_edit_or_new']!r}"
            )
    if "expect_n_intents" in fx:
        if len(parsed["intents"]) != fx["expect_n_intents"]:
            failures.append(
                f"n_intents={len(parsed['intents'])} expected {fx['expect_n_intents']}"
            )
    if "expect_n_intents_min" in fx:
        if len(parsed["intents"]) < fx["expect_n_intents_min"]:
            failures.append(
                f"n_intents={len(parsed['intents'])} < min {fx['expect_n_intents_min']}"
            )
    if "expect_concepts_any" in fx:
        emitted = {i["concept"] for i in parsed["intents"]}
        accept = False
        for option in fx["expect_concepts_any"]:
            if option.issubset(emitted):
                accept = True
                break
        if not accept:
            failures.append(
                f"concepts={emitted} matched none of expected sets {fx['expect_concepts_any']}"
            )
    if "expect_concepts_subset_of" in fx:
        emitted = {i["concept"] for i in parsed["intents"]}
        extras = emitted - fx["expect_concepts_subset_of"]
        if extras:
            failures.append(
                f"concepts={emitted} has extras outside allowed {fx['expect_concepts_subset_of']}: {extras}"
            )
    if parsed["parse_errors"]:
        failures.append(
            f"parse errors: {parsed['parse_errors']}"
        )
    return failures


async def main() -> int:
    name_filter = sys.argv[1] if len(sys.argv) > 1 else None
    selected = [f for f in FIXTURES if not name_filter or name_filter in f["name"]]
    print(f"decompose probe — {len(selected)} fixtures\n")
    pass_count = 0
    for fx in selected:
        print(f"========== {fx['name']} ==========")
        print(f"  request: {fx['request']!r}")
        try:
            parsed, raw = await decompose(fx["request"])
        except Exception as e:
            print(f"  EXCEPTION: {e}")
            import traceback
            traceback.print_exc()
            continue
        _print_block("RAW", raw)
        print(f"  edit_or_new: {parsed['edit_or_new']}")
        print(f"  intents:")
        for it in parsed["intents"]:
            print(f"    {it}")
        if parsed["parse_errors"]:
            print(f"  parse_errors:")
            for e in parsed["parse_errors"]:
                print(f"    ! {e}")
        failures = _check(fx, parsed)
        if failures:
            print(f"  [FAIL] {len(failures)}")
            for f in failures:
                print(f"    ! {f}")
        else:
            print(f"  [PASS]")
            pass_count += 1
        print()
    print(f"=== {pass_count}/{len(selected)} fixtures passed ===")
    return 0 if pass_count == len(selected) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
