# Prompt compiler — strip comments, split pos/neg, deduplicate, normalize.
# Also handles wildcard resolution ({a|b|c}, __name__) and <SCRIPT> templates.
#
# Pipeline:
#   1. strip_comments()
#   2. expand_wildcard_files()   — __name__ → {opt1|opt2|...}
#   3. resolve_wildcards()       — {a|b|c} → random pick / switch select
#   4. normalize whitespace
#   5. split on "Negative Prompt:" marker  (after resolution so per-option negs work)
#   6. deduplicate() each part

import json
import logging
import os
import random
import re
from pathlib import Path

import yaml

logger = logging.getLogger("promptchain.compiler")


# =============================================================================
# Comment Stripping
# =============================================================================

def strip_comments(text: str) -> str:
    if not text:
        return ""

    result = []
    cursor = 0
    in_block = False

    while cursor < len(text):
        if not in_block and text[cursor:cursor+2] == "/*":
            in_block = True
            cursor += 2
            continue
        if in_block and text[cursor:cursor+2] == "*/":
            in_block = False
            cursor += 2
            continue
        if in_block:
            cursor += 1
            continue
        if text[cursor:cursor+2] == "//":
            while cursor < len(text) and text[cursor] != "\n":
                cursor += 1
            continue
        if text[cursor] == "#":
            is_line_start = cursor == 0 or text[cursor-1] == "\n"
            if not is_line_start:
                scan = cursor - 1
                while scan >= 0 and text[scan] in " \t":
                    scan -= 1
                is_line_start = scan < 0 or text[scan] == "\n"
            if is_line_start:
                while cursor < len(text) and text[cursor] != "\n":
                    cursor += 1
                continue
            result.append(text[cursor])
            cursor += 1
            continue
        result.append(text[cursor])
        cursor += 1

    return "".join(result)


# =============================================================================
# Regional groups  —  $name { ... }
# =============================================================================
# A `$name { body }` group pins `body` to the mannequin identified by `name`
# (e.g. $mannequin1). Anything OUTSIDE every group is the shared/global prompt.
# The close brace is matched by DEPTH (not the first `}`) so a wildcard or
# <SCRIPT> brace inside a body ({a|b}) doesn't truncate the region and leak the
# rest into the global prompt.
_REGION_OPEN_RE = re.compile(r"\$(\w+)\s*\{")


def _iter_region_spans(text: str):
    """Yield (name, body, start, end) for each `$name{ ... }` group, matching the
    close brace by depth so nested braces survive. start..end spans the whole
    `$name{...}` (braces included) for removing it from the global remainder."""
    if not text or "$" not in text:
        return
    pos = 0
    while True:
        m = _REGION_OPEN_RE.search(text, pos)
        if not m:
            return
        depth, i = 1, m.end()
        while i < len(text) and depth > 0:
            c = text[i]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            i += 1
        if depth != 0:
            # Unbalanced (no matching close): take the rest as the body rather
            # than loop forever, matching the old regex's graceful give-up.
            yield m.group(1), text[m.end():], m.start(), len(text)
            return
        yield m.group(1), text[m.end():i - 1], m.start(), i
        pos = i


def _remove_region_spans(text: str, spans) -> str:
    """`text` with each (.., start, end) span removed (for the global remainder)."""
    parts, cursor = [], 0
    for *_meta, start, end in spans:
        parts.append(text[cursor:start])
        cursor = end
    parts.append(text[cursor:])
    return "".join(parts)


def strip_region_markers(text: str) -> str:
    """Drop the `$name{ }` wrappers but keep their bodies inline.

    This is what keeps NON-regional output identical to today: if a user writes
    `$mannequin1 { cammy }` but doesn't route through the regional node, the
    flat prompt is just `cammy` like the braces were never there.
    """
    if not text or "$" not in text:
        return text
    spans = list(_iter_region_spans(text))
    if not spans:
        return text
    parts, cursor = [], 0
    for _name, body, start, end in spans:
        parts.append(text[cursor:start])
        parts.append(body)
        cursor = end
    parts.append(text[cursor:])
    return "".join(parts)


def compile_regions(text: str, **compile_kwargs) -> dict:
    """Split `$name{}` groups into {global, regions:[{id,name,text}], negative}.

    The global remainder and each group body are run through the normal
    compile pipeline (wildcards, smart-join, dedup), so regions inherit every
    existing feature. `id` is the trailing integer of the name ($mannequin1 -> 1)
    for positional figure binding; falls back to 1-based order if name has none.
    """
    # Strip comments FIRST so example $name{} blocks in the // help scaffold
    # (e.g. "//   $alice{ red dress }") aren't extracted as real regions — that
    # turned a 2-region prompt into a 5-region mess and broke binding.
    text = strip_comments(text or "")
    spans = list(_iter_region_spans(text))
    groups = [(name, body) for name, body, _s, _e in spans]
    global_text = _remove_region_spans(text, spans) if spans else text
    g_pos, g_neg, _ = compile_prompt(global_text, **compile_kwargs)

    regions = []
    for name, body in groups:
        # A region is ONE figure's description — a continuous phrase, not a lazy
        # tag-stack. So its line breaks collapse to spaces (a wildcard or phrase
        # spread across lines reads naturally) instead of the global's
        # newline→comma. Commas the user types still separate.
        body = re.sub(r"\s*\n\s*", " ", body)
        r_pos, _, _ = compile_prompt(body, **compile_kwargs)
        num = re.search(r"(\d+)$", name)
        rid = int(num.group(1)) if num else len(regions) + 1
        regions.append({"id": rid, "name": name, "text": r_pos})

    return {"global": g_pos, "regions": regions, "negative": g_neg}


def _pose_entity_index(pose_json: str = "") -> tuple[list[str], int | None]:
    """Parse a pose JSON into (lowercased entity names in mask-row order,
    figure count). Figure count is None when there's NO v3 entity list — the
    signal that a $block's figure can't be known, so positional fallbacks stay
    unclamped and nothing is treated as orphaned (legacy pre-v3 behavior).

    Single source of truth for `region_figure_indices` / `figure_entity_names`
    / `region_orphans` so they can never drift on how a pose is read.
    """
    if not (pose_json and pose_json.strip()):
        return [], None
    try:
        pose = json.loads(pose_json)
    except (json.JSONDecodeError, TypeError, AttributeError):
        return [], None
    if not isinstance(pose, dict):
        return [], None  # json.loads accepts scalars/arrays/null — .get would crash
    ents = pose.get("regionEntities")
    if isinstance(ents, list) and ents:
        names = [str((e.get("name") if isinstance(e, dict) else None) or "").lower()
                 for e in ents]
        num_figures = sum(1 for e in ents
                          if isinstance(e, dict) and e.get("kind") == "figure")
        return names, num_figures
    figs = pose.get("figures")
    if isinstance(figs, list):
        names = [str((f.get("name") if isinstance(f, dict) else None)
                     or f"mannequin{i + 1}").lower()
                 for i, f in enumerate(figs)]
        return names, None  # figures-only (pre-v3) -> unclamped, never orphaned
    return [], None


def _region_fallback_index(region: dict, order: int) -> int:
    """Positional fallback for a region with no entity name match: the name's
    trailing integer ($mannequin2 -> 2 -> index 1), else 1-based block order."""
    try:
        return int(region.get("id", order + 1)) - 1
    except (TypeError, ValueError):
        return order


def region_figure_indices(region_list: list, pose_json: str = "") -> list[int]:
    """Resolve each region to its 0-based mask-row index.

    Mask rows are REGION ENTITIES: every figure (figure order) followed by every
    NAMED prop — pose_state v3 stamps that exact order in `regionEntities`, so
    a region named $alice or $sword follows its entity no matter where its block
    sits in the prompt. Unmatched regions keep the legacy fallbacks (the name's
    trailing integer, $mannequin2 -> 2, else 1-based block order), but those are
    positional conventions defined over FIGURES only, so under an entity list
    they're clamped into figure space — a stray block must never silently paint
    a prop's mask (prop regions are name-bound only).

    Pre-v3 pose_state (no regionEntities) derives figures-only names with the
    original unclamped fallbacks — byte-identical to the old behavior.
    No mask-count clamping here — callers clamp to whatever they index.

    A clamped fallback means the block had no real figure (see `region_orphans`);
    render consumers should drop those rather than paint a present figure.
    """
    names, num_figures = _pose_entity_index(pose_json)
    indices = []
    for n, r in enumerate(region_list):
        rname = str(r.get("name", "")).lower()
        if rname and rname in names:
            indices.append(names.index(rname))
            continue
        idx = _region_fallback_index(r, n)
        if num_figures is not None:
            idx = min(max(idx, 0), max(num_figures, 1) - 1)
        indices.append(idx)
    return indices


def region_orphans(region_list: list, pose_json: str = "") -> list[bool]:
    """Per-region: True when a $block has NO figure to bind to.

    An orphan's name matches no Poser entity AND its positional fallback points
    past every figure — the exact case `region_figure_indices` has to CLAMP onto
    a real figure. That happens when a mannequin is deleted but its $block stays
    in the prompt: the block would otherwise hijack figure 0's conditioning (its
    own prompt painted onto a different, present character). Render consumers
    (couple / regional conditioning / detailer) drop orphans so a deleted
    character's tags vanish instead of leaking — no manual block editing needed.

    Only decidable with a v3 entity list; pre-v3 pose state (or none) can't tell
    a stray block from a positional one, so nothing is orphaned (legacy).
    """
    names, num_figures = _pose_entity_index(pose_json)
    if num_figures is None:
        return [False] * len(region_list)
    flags = []
    for n, r in enumerate(region_list):
        rname = str(r.get("name", "")).lower()
        if rname and rname in names:  # bound to a real entity (figure or prop)
            flags.append(False)
            continue
        idx = _region_fallback_index(r, n)
        flags.append(not (0 <= idx < num_figures))
    return flags


def figure_entity_names(pose_json: str = "") -> list[str]:
    """Lowercased region-entity names (figures, then named props) in mask-row
    order — the exact list `region_figure_indices` matches `$block` names
    against. Lets a caller tell a NAME-matched region from one that merely fell
    back onto a figure index. Empty when there's no pose/entity/figure data.
    """
    return _pose_entity_index(pose_json)[0]


def region_figure_count(pose_json: str = ""):
    """How many leading mask rows are FIGURES (the rest are named props).

    Figure-only consumers (head boxes / face detailing) must ignore prop-bound
    regions; entity rows are figures-first so `index < count` is the test.
    None = unknown (no pose data) — callers should then skip the filter.
    """
    if not (pose_json and pose_json.strip()):
        return None
    try:
        pose = json.loads(pose_json)
        ents = pose.get("regionEntities")
        if isinstance(ents, list) and ents:
            return sum(1 for e in ents if isinstance(e, dict) and e.get("kind") == "figure")
        figs = pose.get("figures")
        return len(figs) if isinstance(figs, list) else None
    except (json.JSONDecodeError, TypeError, AttributeError):
        return None


# =============================================================================
# Smart Join
# =============================================================================

def _smart_join(parts: list[str]) -> str:
    if not parts:
        return ""
    result = []
    for i, part in enumerate(parts):
        if i == 0:
            result.append(part)
        elif part.upper() == "BREAK":
            result.append(" " + part)
        elif result and result[-1].upper().endswith("BREAK"):
            result.append(" " + part)
        else:
            result.append(", " + part)
    return "".join(result)


# =============================================================================
# Deduplication
# =============================================================================

def deduplicate(text: str) -> str:
    if not text:
        return ""
    parts = [p.strip() for p in text.split(",") if p.strip()]
    seen: set[str] = set()
    result = []
    for part in parts:
        lower = part.lower()
        if lower == "break" or (lower.startswith("[") and lower.endswith("]")):
            result.append(part)
        elif lower not in seen:
            seen.add(lower)
            result.append(part)
    return _smart_join(result)


def combine_tags(node_text: str, inputs: list[str]) -> str:
    parts = []
    if node_text:
        parts.append(node_text.strip())
    for input_text in inputs:
        if input_text:
            parts.append(input_text.strip())
    if not parts:
        return ""
    return _smart_join(parts)


# =============================================================================
# Wildcard File Expansion
# =============================================================================

WILDCARDS_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), "wildcards")

# ComfyUI shared wildcards folder (ComfyUI/wildcards/).
# Read-only fallback — we don't create it, just use it if it exists.
try:
    import folder_paths
    _COMFYUI_WILDCARDS = os.path.join(folder_paths.base_path, "wildcards")
except (ImportError, AttributeError):
    _COMFYUI_WILDCARDS = None

_EXTRA_WILDCARD_PATHS: list[str] = []

WILDCARD_EXTENSIONS = (".txt", ".yaml", ".yml", ".json")
STRUCTURED_EXTENSIONS = (".yaml", ".yml", ".json")

WILDCARD_PATTERN = re.compile(r"__([a-zA-Z0-9_/.-]+)__")
_MAX_RECURSION = 10
_LABEL_PREFIX_RE = re.compile(r"^::([^:]+)::\s*")


# -- Path management -----------------------------------------------------------

def get_wildcard_paths() -> list[Path]:
    paths = [Path(WILDCARDS_FOLDER).resolve()]
    if _COMFYUI_WILDCARDS:
        shared = Path(_COMFYUI_WILDCARDS).resolve()
        if shared.is_dir() and shared not in paths:
            paths.append(shared)
    for p in _EXTRA_WILDCARD_PATHS:
        resolved = Path(p).resolve()
        if resolved.is_dir() and resolved not in paths:
            paths.append(resolved)
    return paths


def add_wildcard_path(path: str):
    if path not in _EXTRA_WILDCARD_PATHS:
        _EXTRA_WILDCARD_PATHS.append(path)


def remove_wildcard_path(path: str):
    if path in _EXTRA_WILDCARD_PATHS:
        _EXTRA_WILDCARD_PATHS.remove(path)


# -- Internal helpers ----------------------------------------------------------

def _unwrap_single_root(data: dict) -> dict:
    if isinstance(data, dict) and len(data) == 1:
        value = next(iter(data.values()))
        if isinstance(value, dict):
            return value
    return data


def _flatten_dict_values(data) -> list[str]:
    if isinstance(data, list):
        return [str(item) for item in data]
    if isinstance(data, dict):
        result = []
        for v in data.values():
            result.extend(_flatten_dict_values(v))
        return result
    return [str(data)] if data is not None else []


def _load_structured_data(path: Path):
    ext = path.suffix.lower()
    raw = path.read_text(encoding="utf-8")
    if ext in (".yaml", ".yml"):
        data = yaml.safe_load(raw)
    elif ext == ".json":
        data = json.loads(raw)
    else:
        return None
    if isinstance(data, dict):
        return _unwrap_single_root(data)
    return data


def _dash_underscore_variants(name: str) -> list[str]:
    variants = [name]
    dashed = name.replace("_", "-")
    if dashed != name:
        variants.append(dashed)
    underscored = name.replace("-", "_")
    if underscored != name and underscored not in variants:
        variants.append(underscored)
    return variants


# -- Parsing -------------------------------------------------------------------

def parse_wildcard_file(path: Path, key_path: str | None = None) -> list[str]:
    """Parse a wildcard file and return a list of options.

    For YAML/JSON, key_path navigates nested keys (e.g. "race" or "character/hair").
    If key_path is None, all leaf values are flattened into a single list.
    """
    ext = path.suffix.lower()
    try:
        if ext == ".txt":
            return _parse_txt_wildcard(path)
        if ext in STRUCTURED_EXTENSIONS:
            return _parse_structured_wildcard(path, key_path)
    except Exception:
        logger.debug("failed to parse wildcard %s", path, exc_info=True)
    return []


def _parse_txt_wildcard(path: Path) -> list[str]:
    raw = path.read_text(encoding="utf-8")
    cleaned = strip_comments(raw)
    lines = [line.strip() for line in cleaned.split("\n") if line.strip()]
    # A1111 global negative section: a line starting with "Negative Prompt:"
    # ends option parsing. Per-option inline negatives (mid-line) are preserved.
    result = []
    for line in lines:
        if re.match(r"negative\s+prompt\s*:", line, re.IGNORECASE):
            break
        result.append(_LABEL_PREFIX_RE.sub("", line))
    return result


def _parse_structured_wildcard(path: Path, key_path: str | None) -> list[str]:
    data = _load_structured_data(path)
    if data is None:
        return []

    if key_path:
        for key in key_path.split("/"):
            if isinstance(data, dict):
                data = data.get(key)
            else:
                return []
            if data is None:
                return []

    return _flatten_dict_values(data)


def get_wildcard_sections(path: Path) -> list[str]:
    if path.suffix.lower() not in STRUCTURED_EXTENSIONS:
        return []
    try:
        data = _load_structured_data(path)
        return list(data.keys()) if isinstance(data, dict) else []
    except Exception:
        return []


def get_wildcard_info(path: Path) -> tuple[int, list[str]]:
    ext = path.suffix.lower()
    try:
        options = parse_wildcard_file(path)
        sections = []
        if ext in STRUCTURED_EXTENSIONS:
            data = _load_structured_data(path)
            if isinstance(data, dict):
                sections = list(data.keys())
        return len(options), sections
    except Exception:
        logger.debug("failed to read wildcard info %s", path, exc_info=True)
        return 0, []


# -- File resolution -----------------------------------------------------------

def resolve_wildcard_name(name: str) -> tuple[Path | None, str | None]:
    """Resolve a wildcard name (e.g. "anime/gkr-anime/race") to a file path and key.

    Tries progressively deeper splits:
      "anime/gkr-anime/race" → stem="anime/gkr-anime" key="race"
    Returns (path, key_path) or (None, None).
    """
    if ".." in name:
        return None, None

    parts = name.split("/")
    for split_at in range(len(parts), 0, -1):
        file_stem = "/".join(parts[:split_at])
        key_path = "/".join(parts[split_at:]) or None
        result = _find_wildcard_file(file_stem, key_path)
        if result[0] is not None:
            return result
    return None, None


def _find_wildcard_file(file_stem: str, key_path: str | None) -> tuple[Path | None, str | None]:
    for search_base in get_wildcard_paths():
        result = _find_wildcard_file_in_base(search_base, file_stem, key_path)
        if result[0] is not None:
            return result
    return None, None


def _find_wildcard_file_in_base(base: Path, file_stem: str, key_path: str | None) -> tuple[Path | None, str | None]:
    segments = file_stem.split("/")
    parent_path = "/".join(segments[:-1])

    for variant in _dash_underscore_variants(segments[-1]):
        relative_stem = f"{parent_path}/{variant}" if parent_path else variant
        for ext in WILDCARD_EXTENSIONS:
            if ext == ".txt" and key_path:
                continue
            candidate = (base / f"{relative_stem}{ext}").resolve()
            try:
                candidate.relative_to(base)
            except ValueError:
                continue
            if candidate.is_file():
                return candidate, (None if ext == ".txt" else key_path)

    return None, None


# -- Expansion -----------------------------------------------------------------

def expand_wildcard_files(text: str, wildcard_modes: dict | None = None,
                          wildcard_results: dict | None = None) -> str:
    if not text or "__" not in text:
        return text

    def replace(match):
        name = match.group(1)
        found_path, resolved_key = resolve_wildcard_name(name)
        if found_path is None:
            return match.group(0)
        options = parse_wildcard_file(found_path, resolved_key)
        if not options:
            return match.group(0)

        # check per-wildcard mode override
        if wildcard_modes:
            wc_mode = wildcard_modes.get(name)
            if wc_mode:
                mode = wc_mode.get("mode", "randomize")
                index = wc_mode.get("index", 0)
                if mode == "switch" and 1 <= index <= len(options):
                    return options[index - 1]
                if mode == "combine":
                    return ", ".join(options)
                if mode == "none":
                    return ""
                # "randomize" falls through to random pick below

        # randomize: pick now and track the result
        selected_idx = random.randint(0, len(options) - 1)
        selected = options[selected_idx]
        if wildcard_results is not None:
            # clean label: strip weight syntax for display
            label = re.sub(r":\d+\.?\d*\)", ")", selected).strip()
            label = re.sub(r"\s+", " ", label)
            if len(label) > 60:
                label = label[:57] + "..."
            wildcard_results[name] = {
                "index": selected_idx + 1,
                "label": label,
            }
        return selected

    for _ in range(_MAX_RECURSION):
        expanded = WILDCARD_PATTERN.sub(replace, text)
        if expanded == text:
            break
        text = expanded

    return text


# =============================================================================
# Brace Wildcard Resolution
# =============================================================================

def _resolve_braces(text: str) -> str:
    for _ in range(100):
        match = re.search(r"\{([^{}]+)\}", text)
        if not match:
            break
        # Strip whitespace AND leading/trailing commas off each option. Lines are
        # comma-joined before braces resolve, so a multi-line wildcard can hand us
        # ", red" or "blue,"; internal commas (a multi-tag option like "a, b") are
        # kept so {a⏎b|c⏎d} resolves to "a, b" / "c, d".
        options = [o for o in (opt.strip(" \t\r\n,") for opt in match.group(1).split("|")) if o]
        replacement = random.choice(options) if options else ""
        text = text[:match.start()] + replacement + text[match.end():]
    return text.strip()


def resolve_wildcards(text: str, mode: str = "combine", switch_index: int = 1):
    """Returns string, or (string, selected_index) tuple in roll mode."""
    if not text or not text.strip():
        return ""

    # handle <SCRIPT> template blocks
    template, prompt_text = _process_script_template(text)
    if template is not None:
        resolved = resolve_wildcards(prompt_text, mode, switch_index) if prompt_text else ""
        roll_idx = None
        if isinstance(resolved, tuple):
            resolved, roll_idx = resolved
        result = re.sub(r"\{PROMPT\}", resolved, template, flags=re.IGNORECASE)
        return (result, roll_idx) if roll_idx is not None else result

    # filter comment lines
    lines = [line.strip() for line in text.split("\n")
             if line.strip() and not line.strip().startswith("//") and not line.strip().startswith("#")]

    # check for ::Label:: syntax
    has_labels = any(re.match(r"^::([^:]+)::", line) for line in lines)

    # group multi-line labeled options: continuation lines (no label)
    # are joined onto the preceding labeled line with a space
    if has_labels:
        grouped = []
        for line in lines:
            if re.match(r"^::([^:]+)::", line):
                grouped.append(line)
            elif grouped:
                grouped[-1] += " " + line
            else:
                grouped.append(line)
        lines = grouped

    # labeled lines with roll/switch mode
    if mode in ("roll", "switch") and has_labels:
        # Index against label-bearing entries only. Non-label lines that
        # slipped in (e.g. a stray "● ::x::" bullet on the first line) would
        # otherwise shift positions and desync from the JS label counter.
        label_lines = [l for l in lines if re.match(r"^::([^:]+)::", l)]
        if mode == "switch":
            if switch_index == 0:
                return ""
            if 1 <= switch_index <= len(label_lines):
                selected_line = label_lines[switch_index - 1]
            else:
                return ""
        else:
            selected_idx = random.randint(0, len(label_lines) - 1)
            selected_line = label_lines[selected_idx]

        selected_line = re.sub(r"^::([^:]+)::\s*", "", selected_line)
        resolved = _resolve_braces(selected_line)
        if mode == "roll":
            return (resolved, selected_idx + 1)
        return resolved

    # preserve ::Label:: content for parent nodes to switch on
    if has_labels:
        return "\n".join(lines)

    # combine mode: join all lines, resolve braces
    all_text = ", ".join(lines)
    resolved = _resolve_braces(all_text)

    parts = [part.strip() for part in resolved.split(",") if part.strip()]
    processed = []
    for part in parts:
        if "|" in part and "{" not in part:
            options = [opt.strip() for opt in part.split("|") if opt.strip()]
            if options:
                part = random.choice(options)
        processed.append(part)

    return _smart_join(processed)


# =============================================================================
# Script Templates
# =============================================================================

SCRIPT_PATTERN = re.compile(r"<SCRIPT>\n?(.*?)\n?</SCRIPT>", re.DOTALL | re.IGNORECASE)


def _process_script_template(text: str):
    """Returns (template, remaining_text) or (None, text)."""
    if not text:
        return None, text
    match = SCRIPT_PATTERN.search(text)
    if not match:
        return None, text
    template = match.group(1)
    before = text[:match.start()].strip()
    after = text[match.end():].strip()
    prompt_parts = [p for p in [before, after] if p]
    return template, "\n".join(prompt_parts) if prompt_parts else ""


# =============================================================================
# Full Compilation Pipeline
# =============================================================================

def compile_prompt(text: str, mode: str = "combine", switch_index: int = 1,
                   load_image_prompts: dict | None = None,
                   wildcard_modes: dict | None = None):
    """Returns (positive, negative, metadata).

    load_image_prompts: optional dict mapping keywords like
        "__LoadImagePositive__" / "__LoadImageNegative__" to replacement text.
    wildcard_modes: optional dict mapping wildcard names to mode overrides,
        e.g. {"creatures": {"mode": "switch", "index": 2}}.
    metadata includes wildcard_results: dict mapping wildcard names to
        {"index": N, "label": "..."} for randomly picked options.
    """
    if not text:
        return "", "", {}

    # Process the full text — label selection and wildcard resolution happen
    # BEFORE splitting on "Negative Prompt:" so per-option negatives stay
    # paired with their positive text.
    wc_results = {}
    result = _process_part(text, mode=mode, switch_index=switch_index,
                           load_image_prompts=load_image_prompts,
                           wildcard_modes=wildcard_modes,
                           wildcard_results=wc_results)

    metadata = {}
    if wc_results:
        metadata["wildcard_results"] = wc_results
    if isinstance(result, tuple):
        resolved, roll_selected = result
        metadata["roll_selected"] = roll_selected
    else:
        resolved = result

    # Labels still present (combine mode preserves them for parent nodes
    # to switch on) — don't split; negatives are per-label.
    if re.search(r"^::([^:]+)::", resolved, re.MULTILINE):
        return resolved, "", metadata

    parts = re.split(r"negative\s+prompt\s*:", resolved, maxsplit=1, flags=re.IGNORECASE)
    positive = deduplicate(parts[0].strip())
    negative = deduplicate(parts[1].strip()) if len(parts) > 1 else ""

    return positive, negative, metadata


def _process_part(text: str, mode: str = "combine", switch_index: int = 1,
                   load_image_prompts: dict | None = None,
                   wildcard_modes: dict | None = None,
                   wildcard_results: dict | None = None):
    if not text:
        return ""

    has_script = SCRIPT_PATTERN.search(text) is not None
    text = strip_comments(text)
    # Flat output keeps region bodies inline (braces removed) so non-regional
    # use is unchanged; the regional path calls compile_regions instead.
    text = strip_region_markers(text)

    # resolve __LoadImagePositive__ / __LoadImageNegative__ before wildcard
    # expansion so they don't get misidentified as wildcard file references
    if load_image_prompts and "__LoadImage" in text:
        for keyword, replacement in load_image_prompts.items():
            if keyword in text:
                text = text.replace(keyword, replacement)

    text = expand_wildcard_files(text, wildcard_modes=wildcard_modes,
                                 wildcard_results=wildcard_results)

    result = resolve_wildcards(text, mode=mode, switch_index=switch_index)

    roll_idx = None
    if isinstance(result, tuple):
        text, roll_idx = result
    else:
        text = result

    has_labels = bool(re.search(r"^::([^:]+)::", text, re.MULTILINE))

    if not has_script and not has_labels:
        text = re.sub(r"\s+", " ", text).strip()
        text = deduplicate(text)

    if roll_idx is not None:
        return (text, roll_idx)
    return text
