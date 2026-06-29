from __future__ import annotations

import json
import logging
import re

from comfy_api.latest import io

logger = logging.getLogger("promptchain.ideogram_caption")


# Non-photographic media. If the prompt names one, the style_description must use
# the art_style path (aesthetics,lighting,medium,art_style) instead of the photo
# path (aesthetics,lighting,photo,medium) — Ideogram's caption verifier requires
# exactly one of photo|art_style.
# Most specific first so e.g. "watercolor illustration" resolves to "watercolor",
# not the generic "illustration"/"render" which sit last as catch-alls.
_ART_MEDIA = ("watercolor", "oil painting", "3d render", "concept art", "pixel art",
              "line art", "cel shaded", "digital art", "gouache", "acrylic",
              "woodcut", "lithograph", "manga", "anime", "comic", "cartoon",
              "painting", "drawing", "sketch", "vector", "illustration", "render")


def _medium_word(text: str) -> str:
    """The rendering medium named in the prompt, or 'photograph' by default."""
    t = (text or "").lower()
    return next((m for m in _ART_MEDIA if m in t), "photograph")


def _clean(text: str) -> str:
    """Tidy the lazily-joined global prompt: a region/line join can leave 'focus., x'
    or doubled commas/spaces. Cosmetic, but it lands verbatim in background/aesthetics."""
    t = re.sub(r"\s*\.\s*,", ", ", text or "")
    t = re.sub(r"\s*,\s*,", ", ", t)
    return re.sub(r"\s+", " ", t).strip(" ,")


def _first_clause(text: str, max_words: int) -> str:
    """First sentence/line of `text`, word-capped — for a terse style/summary line."""
    t = (text or "").strip()
    for sep in (". ", ".\n", "\n"):
        if sep in t:
            t = t.split(sep, 1)[0]
            break
    words = t.strip().rstrip(".").split()
    return " ".join(words[:max_words])


def _short_subject(desc: str) -> str:
    """A subject's first comma-clause, word-capped — its brief mention in the HLD
    (the full description still lives in the element's `desc`)."""
    first = (desc or "").strip().split(",")[0].strip()
    return " ".join(first.split()[:8])


def _human_join(items: list[str]) -> str:
    items = [i for i in items if i]
    if len(items) <= 1:
        return items[0] if items else ""
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + f", and {items[-1]}"


def _style_block(text: str) -> dict:
    """An Ideogram `style_description` object in the verifier's strict key order.

    Photographic by default; switches to the art_style path when the prompt names
    a non-photo medium. Omitting style_description samples outside the model's
    training distribution and (per Ideogram) raises the safety false-positive
    rate, so we always emit a conforming one; its shared aesthetics/lighting also
    bind multiple regions into a single coherent scene instead of a collage."""
    medium = _medium_word(text)
    aesthetics = _first_clause(text, 16) or "natural and true to life"
    if medium != "photograph":
        return {"aesthetics": aesthetics, "lighting": "soft, even lighting",
                "medium": "digital art", "art_style": medium}
    return {"aesthetics": aesthetics, "lighting": "natural light",
            "photo": "sharp focus, realistic detail", "medium": "photograph"}


def _caption(text: str) -> str:
    """Wrap a plain (region-less) PromptChain prompt in a COMPLETE Ideogram caption.

    Ideogram 4 was trained on structured JSON captions and its built-in safety
    *false-positive* rate is higher for non-conforming prompts (official:
    "false positive rates ... higher for non-json like prompts"). The single
    documented lever to reduce refusals is a conforming caption, so we emit all
    three top-level keys (high_level_description, style_description,
    compositional_deconstruction) with one bbox'd element — a boxless element
    re-trips the safety gray screen (ideogram4 issue #13)."""
    t = _clean(text)
    hld = (_first_clause(t, 40) or "A high-quality, detailed image.").rstrip(".") + "."
    return json.dumps({
        "high_level_description": hld,
        "style_description": _style_block(t),
        "compositional_deconstruction": {
            "background": "a setting that suits the subject",
            "elements": [{"type": "obj", "bbox": list(_FULL_FRAME_INSET),
                          "desc": t or "the subject"}],
        },
    }, separators=(",", ":"), ensure_ascii=False)


# Ideogram bbox is [y_min, x_min, y_max, x_max] on a 0-1000 grid, top-left origin
# (verified against ideogram4's shipped caption_verifier.py). Used as the fallback
# box for a region the user gave no Region Box — an element with NO bbox re-trips
# the safety gray screen (ideogram4 issue #13), so every element gets one.
_FULL_FRAME_INSET = [60, 250, 990, 770]


def _clamp_bbox(bbox) -> list[int]:
    """Clamp a user-drawn box to the 0-1000 grid (y-first, y0<y1 / x0<x1).

    A drawn box is kept AS DRAWN — Ideogram bboxes are soft placement hints that
    are meant to overlap and nest (the canonical multi-subject examples do), so
    forcing a large box to a fixed inset only mis-places the subject. Only a
    degenerate (zero-area) box falls back to the centred box, purely to keep the
    safety-required bbox presence."""
    try:
        y0, x0, y1, x1 = (int(round(v)) for v in bbox)
    except (TypeError, ValueError):
        return list(_FULL_FRAME_INSET)
    y0, y1 = sorted((max(0, min(1000, y0)), max(0, min(1000, y1))))
    x0, x1 = sorted((max(0, min(1000, x0)), max(0, min(1000, x1))))
    if x1 - x0 < 10 or y1 - y0 < 10:
        return list(_FULL_FRAME_INSET)
    return [y0, x0, y1, x1]


def _load(obj):
    if isinstance(obj, dict):
        return obj
    if not (obj and isinstance(obj, str) and obj.strip()):
        return {}
    try:
        return json.loads(obj)
    except (json.JSONDecodeError, TypeError):
        return {}


# A leading quoted literal ('...' or "...") in a `$name{}` region's BODY marks a
# TEXT element — Ideogram renders that exact string (its headline feature). This
# is a property of a real scope (the region body), never of a comment.
# The closing quote must be the SAME character that opened (\1 backreference),
# so a double-quoted literal containing an apostrophe ("Mom's Diner") isn't
# truncated at the apostrophe.
_LITERAL_RE = re.compile(r"""^\s*(['"])(.+?)\1\s*(.*)$""", re.DOTALL)


def _split_literal(s: str):
    """('LITERAL', rest-as-desc) if s starts with a quoted literal, else (None, s)."""
    m = _LITERAL_RE.match(s or "")
    if m:
        return m.group(2).strip(), m.group(3).strip()
    return None, (s or "").strip()


def _mk_obj(e: dict) -> dict:
    """obj element in spec key order: type, bbox?, desc."""
    o: dict = {"type": "obj"}
    if e.get("bbox") is not None:
        o["bbox"] = e["bbox"]
    o["desc"] = e.get("desc", "")
    return o


def _mk_text(e: dict) -> dict:
    """text element in spec key order: type, bbox?, text, desc."""
    o: dict = {"type": "text"}
    if e.get("bbox") is not None:
        o["bbox"] = e["bbox"]
    o["text"] = e.get("text", "")
    o["desc"] = e.get("desc") or f'the text "{e.get("text", "")}"'
    return o


def _build_caption(prompt_text: str, region_list: list, box_by_name: dict,
                   background_text: str = "") -> str | None:
    """Build a conforming Ideogram caption from the prompt text + `$name{}` regions.

    Comments are NOT parsed — `prompt_text` is the already comment-stripped prompt
    (minus the regions). Structure maps onto Ideogram's real schema (three keys in
    order: high_level_description, style_description, compositional_deconstruction):

      - each non-reserved `$name{}` region -> ONE element placed at its drawn box
        (kept as drawn; bbox optional, matched by name). A region body that starts
        with a quoted literal `"..."` -> a `type:"text"` element.
      - the SCENE goes in `background`: the reserved `$background{ ... }` region if
        present, else the leftover global prompt. Ideogram composes the subjects
        INTO the background — without a real one it stages them as separate framed
        photos (the collage failure), so we never emit a vague placeholder.
      - `high_level_description` is a TERSE summary that names the subjects in prose
        (the per-subject detail stays in each element's `desc`, not duplicated into
        the HLD — over-stuffing the HLD over-weights the dominant subject and
        invites a duplicate in the other box).
      - `style_description` is always emitted; its shared style binds the regions
        into one image and lowers the safety false-positive rate.

    Returns None when there's nothing to build.
    """
    raw_obj: list[dict] = []
    raw_text: list[dict] = []
    subjects: list[str] = []
    for r in region_list:
        name = str(r.get("name", "")).lower()
        box = box_by_name.get(name)
        d = (r.get("text") or "").strip()
        if not d:
            if box is None:
                continue                        # nothing to place; the HLD covers it
            d = name or "subject"               # box drawn but no text: keep the placement
        bbox = _clamp_bbox(box) if box is not None else None
        lit, rest = _split_literal(d)
        if lit is not None:
            e = {"text": lit, "desc": rest}
            subjects.append(f'a sign reading "{lit}"')
            target = raw_text
        else:
            e = {"desc": d}
            subjects.append(_short_subject(d))
            target = raw_obj
        if bbox is not None:
            e["bbox"] = bbox
        target.append(e)

    prompt_text = _clean(prompt_text)
    if not (raw_obj or raw_text):
        if not prompt_text:
            return None
        raw_obj = [{"desc": prompt_text}]      # no regions: the prompt is the subject
        subjects = []

    # >=1 element must carry a bbox — a boxless caption re-trips the safety gray
    # screen (ideogram4 issue #13). Anchor a subject with the centred fallback.
    if not any("bbox" in e for e in raw_obj + raw_text):
        (raw_obj[0] if raw_obj else raw_text[0])["bbox"] = list(_FULL_FRAME_INSET)

    if subjects:
        medium = _medium_word(prompt_text)
        lead = "An" if medium[:1].lower() in "aeiou" else "A"
        hld = f"{lead} {medium} of {_human_join(subjects)}."
    else:
        hld = (prompt_text or "A high-quality, detailed image.").rstrip(".") + "."

    background = (background_text or "").strip() or prompt_text or "a fitting scene"
    cap = {
        "high_level_description": hld,
        "style_description": _style_block(prompt_text),
        "compositional_deconstruction": {
            "background": background,
            "elements": [_mk_obj(o) for o in raw_obj] + [_mk_text(t) for t in raw_text],
        },
    }
    return json.dumps(cap, separators=(",", ":"), ensure_ascii=False)


def _needs_wrapping(s: str) -> bool:
    """A hand-written caption is left alone ONLY if it's valid JSON with a
    non-empty elements array — an empty-elements caption is the exact thing that
    trips the safety false-positive, so we re-wrap it."""
    if not (s.startswith("{") and s.endswith("}")):
        return True
    try:
        obj = json.loads(s)
    except json.JSONDecodeError:
        return True
    els = (obj.get("compositional_deconstruction") or {}).get("elements")
    return not (isinstance(els, list) and len(els) > 0)


class IdeogramCaptionNode(io.ComfyNode):
    """Turn a PromptChain prompt into a conforming Ideogram JSON caption.

    Sits between PromptChain's `positive` output and CLIPTextEncode in the
    Ideogram template. A complete structured caption trips Ideogram's stochastic
    safety refusal far less than plain text (the model treats non-conforming
    prompts as the high-false-positive path). A hand-written caption that already
    has elements is passed through untouched.

    Optional regional inputs: wire PromptChain's `regions` output and a
    PromptChain_RegionBox `POSE_JSON` to turn each drawn, named box into a caption
    element with its own bbox — visual region guidance for Ideogram.
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="PromptChain_IdeogramCaption",
            display_name="Prompt Chain Ideogram Caption",
            category="promptchain",
            inputs=[
                io.String.Input("text", default="", force_input=True,
                                tooltip="Wire to Prompt Chain's 'positive' output."),
                io.Combo.Input("mode", options=["caption", "off"], default="caption",
                               tooltip="caption = wrap the prompt in a complete Ideogram JSON "
                                       "caption (avoids the model's false safety blocks); "
                                       "off = passthrough."),
                # Optional regional pair. When both are wired, each $name{} region
                # becomes a caption element placed at its drawn box.
                io.String.Input("regions", default="", optional=True, force_input=True,
                                tooltip="Optional: wire Prompt Chain's 'regions' output (4th) "
                                        "to place each $name{} block at its Region Box."),
                io.String.Input("pose", default="", optional=True, force_input=True,
                                tooltip="Optional: wire a Region Box POSE_JSON — carries each "
                                        "region's box (bbox) so the caption places it."),
            ],
            outputs=[
                io.String.Output("text"),
            ],
        )

    @classmethod
    def execute(cls, text: str = "", mode: str = "caption",
                regions: str = "", pose: str = "") -> io.NodeOutput:
        if mode == "off":
            return io.NodeOutput(text)
        s = (text or "").strip()
        if s and not _needs_wrapping(s):
            return io.NodeOutput(text)  # already a complete caption
        rdata = _load(regions)
        region_list = rdata.get("regions") or []
        # `global` is the prompt with comments stripped and the $name{} regions
        # removed; fall back to the plain positive text when regions aren't wired.
        prompt_text = rdata.get("global")
        if prompt_text is None:
            prompt_text = text
        # Reserved `$background{ ... }` scope -> the Ideogram background field;
        # every other $name{} region is a subject element.
        background_text = ""
        subjects = []
        for r in region_list:
            if str(r.get("name", "")).lower() == "background":
                background_text = (r.get("text") or "").strip() or background_text
            else:
                subjects.append(r)
        box_by_name = {}
        for e in (_load(pose).get("regionEntities") or []):
            if isinstance(e, dict) and e.get("name") and isinstance(e.get("bbox"), (list, tuple)):
                box_by_name[str(e["name"]).lower()] = e["bbox"]
        # Caption from the prompt text + $name{} region scopes only. Comments are
        # never parsed for structure — they are stripped by the compiler.
        caption = _build_caption(prompt_text, subjects, box_by_name, background_text)
        if not caption:
            caption = _caption(text) if s else text
        # Ground truth for diagnosing renders: the exact JSON the model receives.
        logger.info("[IdeogramCaption] %s", caption)
        return io.NodeOutput(caption)
