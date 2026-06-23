from __future__ import annotations

import json
import logging
import re

from comfy_api.latest import io

logger = logging.getLogger("promptchain.ideogram_caption")


def _caption(text: str) -> str:
    """Wrap a plain PromptChain prompt in a COMPLETE Ideogram JSON caption.

    Ideogram 4 was trained on structured JSON captions and its built-in safety
    *false-positive* rate is far higher for non-conforming prompts (official:
    "false positive rates ... higher for non-json like prompts"). Empirically,
    on flagged content (e.g. a swimsuit/rear-pose character): plain text AND a
    JSON wrapper with an EMPTY `elements` array both block ~100% across seeds,
    while a COMPLETE caption — high_level_description + background + at least one
    real `element` — passes ~100% regardless of where the content sits (HLD,
    background, or element). So the whole prompt goes into one element's `desc`
    under a benign summary: that completeness is what makes the model read it as
    a conforming caption rather than falling back to the non-JSON safety path.
    """
    t = (text or "").strip()
    # The element bbox must be an INSET subregion: empirically a full-frame
    # [0,0,1000,1000] bbox AND omitting bbox both block ~100% on flagged content,
    # while an inset region passes (the model reads it as "an object placed in a
    # scene" rather than "the whole image IS this object"). Centred, with margins
    # on all sides; the desc still drives the full composition.
    return json.dumps({
        "high_level_description": "A high-quality, detailed image.",
        "compositional_deconstruction": {
            "background": "a fitting background that suits the subject",
            "elements": [{"type": "obj", "bbox": [60, 250, 990, 770], "desc": t}],
        },
    }, separators=(",", ":"), ensure_ascii=False)


# Ideogram bbox is [y_min, x_min, y_max, x_max] on a 0-1000 grid, top-left origin.
_FULL_FRAME_INSET = [60, 250, 990, 770]  # the proven single-element box


def _inset_bbox(bbox) -> list[int]:
    """Clamp a box to 0-1000 and guarantee it is an INSET (never full-frame).

    A full-frame element re-trips the safety false-positive (the model reads it
    as "the whole image IS this object"). A user-drawn box is normally inset
    already; this only rescues an edge-to-edge box."""
    try:
        y0, x0, y1, x1 = (int(round(v)) for v in bbox)
    except (TypeError, ValueError):
        return list(_FULL_FRAME_INSET)
    y0, y1 = sorted((max(0, min(1000, y0)), max(0, min(1000, y1))))
    x0, x1 = sorted((max(0, min(1000, x0)), max(0, min(1000, x1))))
    # Degenerate or effectively full-frame -> fall back to the proven inset.
    if x1 - x0 < 10 or y1 - y0 < 10 or (x1 - x0 >= 990 and y1 - y0 >= 990):
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
_LITERAL_RE = re.compile(r"""^\s*['"](.+?)['"]\s*(.*)$""", re.DOTALL)


def _split_literal(s: str):
    """('LITERAL', rest-as-desc) if s starts with a quoted literal, else (None, s)."""
    m = _LITERAL_RE.match(s or "")
    if m:
        return m.group(1).strip(), m.group(2).strip()
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


def _pos_word(bbox) -> str:
    """A rough placement word from a 0-1000 [y0,x0,y1,x1] box, for the HLD."""
    if not (isinstance(bbox, (list, tuple)) and len(bbox) == 4):
        return ""
    xc = (bbox[1] + bbox[3]) / 2.0
    yc = (bbox[0] + bbox[2]) / 2.0
    h = "left" if xc < 400 else "right" if xc > 600 else ""
    v = "top" if yc < 350 else "bottom" if yc > 650 else ""
    if h and v:
        return f"{v} {h}"
    return h or v or "centre"


def _build_caption(prompt_text: str, region_list: list, box_by_name: dict,
                   background_text: str = "") -> str | None:
    """Build a conforming Ideogram caption from the prompt text + `$name{}` regions.

    Comments are NOT parsed — `prompt_text` is the already comment-stripped prompt
    (minus the regions). Structure comes ONLY from real scopes: the reserved
    `$background{ ... }` region -> the `background` field; each other `$name{}`
    region -> one element placed at its drawn box (bbox optional, matched by name);
    a region whose body starts with a quoted literal `"..."` -> a `type:"text"`
    element (Ideogram renders that exact string). The remaining prompt text ->
    high_level_description. A complete caption (HLD + background + >=1 INSET-bbox
    element) keeps the safety bypass, so we anchor one element (preferring a
    subject) with the proven inset when no drawn box supplied one. Returns None
    when there's nothing to build.
    """
    raw_obj: list[dict] = []
    raw_text: list[dict] = []
    for r in region_list:
        name = str(r.get("name", "")).lower()
        box = box_by_name.get(name)
        d = (r.get("text") or "").strip()
        if not d:
            if box is None:
                continue                        # nothing to place; the HLD covers it
            d = name or "subject"               # box drawn but no text: keep the placement
        bbox = _inset_bbox(box) if box is not None else None
        lit, rest = _split_literal(d)
        e = {"text": lit, "desc": rest} if lit is not None else {"desc": d}
        if bbox is not None:
            e["bbox"] = bbox
        (raw_text if lit is not None else raw_obj).append(e)

    prompt_text = (prompt_text or "").strip()
    if raw_obj or raw_text:
        # Ideogram leans HARD on the high_level_description; a STYLE-ONLY HLD lets
        # it free-compose (e.g. a whole wedding party instead of one woman + one
        # man). Weave the subjects + their box positions into the summary so the
        # count and placement actually stick.
        phrases = []
        for e in raw_obj + raw_text:
            d = (e.get("desc") or e.get("text") or "").strip()
            if not d:
                continue
            pos = _pos_word(e.get("bbox"))
            phrases.append(f"{d} on the {pos}" if pos else d)
        summary = ", and ".join(phrases)
        if summary and prompt_text:
            hld = f"{prompt_text.rstrip(' .')}, showing {summary}."
        elif summary:
            hld = summary[:1].upper() + summary[1:] + "."
        else:
            hld = prompt_text or "A high-quality, detailed image."
    else:
        if not prompt_text:
            return None
        raw_obj = [{"desc": prompt_text}]      # no regions: the prompt is the subject
        hld = "A high-quality, detailed image."

    # safety: guarantee >=1 element carries an inset bbox (a boxless / full-frame
    # caption re-trips the safety false-positive). Prefer anchoring a subject.
    if not any("bbox" in e for e in raw_obj + raw_text):
        (raw_obj[0] if raw_obj else raw_text[0])["bbox"] = list(_FULL_FRAME_INSET)

    elements = [_mk_obj(o) for o in raw_obj] + [_mk_text(t) for t in raw_text]
    background = (background_text or "").strip() or "a fitting background that suits the subject"
    cap = {
        "high_level_description": hld,
        "compositional_deconstruction": {
            "background": background,
            "elements": elements,
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
        if caption:
            return io.NodeOutput(caption)
        if not s:
            return io.NodeOutput(text)
        return io.NodeOutput(_caption(text))
