"""Scene composer — final natlang build-mode polish.

Converts a structured `// Section:` build-mode output into ONE flowing
cinematic paragraph. Models with prose-tuned text encoders (Z-Image's
Qwen3-4B, Flux's T5, SDXL via natural language) all respond better to
a single narrative than to SD/A1111-style section markup.

This is a SHAPE step — teaches the LLM the canonical cinematic-prompt
recipe (shot → subjects+outfits → setting → lighting → style) without
any character/outfit/scene tokens baked in. Same prompt works for any
named characters, any outfits, any scene.

Run:
  cd <ComfyUI>/custom_nodes/ComfyUI-PromptChain
  python scripts/natlang_scene_composer.py
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import types


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)


class _S:
    def _p(self, _):
        def w(f): return f
        return w
    post = get = put = delete = patch = head = options = _p


sys.modules.setdefault(
    "folder_paths",
    types.SimpleNamespace(folder_names_and_paths={}, get_folder_paths=lambda x: [],
                          get_full_path=lambda *a, **k: None,
                          models_dir="/tmp", get_user_directory=lambda: "/tmp",
                          base_path="/tmp"),
)
sys.modules.setdefault(
    "server",
    types.SimpleNamespace(PromptServer=types.SimpleNamespace(
        instance=types.SimpleNamespace(routes=_S(), send_sync=lambda *a, **k: None))),
)

from core import ai_api  # noqa: E402


PROVIDER = "local"
CONFIG = {"local": {"base_url": "http://localhost:11434/v1",
                    "model": "qwen3-vl:8b-instruct"}}


SCENE_COMPOSER_SYSTEM = """You compose ONE flowing cinematic paragraph for a text-to-image model that prefers natural narrative captions over structured markup.

You receive a structured prompt with `// Section:` headers (Character, Outfit, Pose, Expression, Setting/Scene, Style, Quality, Negative). You compose it into a single connected paragraph following the canonical caption recipe image-generation models train on.

THE RECIPE — fixed shape, fill in what the input provides:
1. OPEN WITH A SHOT FRAMING phrase that fits the content: e.g. "A dynamic action shot of ...", "A cinematic close-up of ...", "A wide environmental portrait of ...", "A serene atmospheric scene of ...". Pick one matching the input's pose / mood.
2. INTRODUCE EACH SUBJECT BY NAME, then their permanent body traits (hair color/length/style, eye color, scars, build), then their outfit, all woven into one connected sentence per subject. Use the connectives "wears", "wearing", "dressed in". When two or more subjects appear, use spatial connectors like "across from her", "next to him", "behind them" to position them in the scene.
3. PLACE THE SCENE in one sentence after the subjects ("on a rooftop with a city skyline at dusk", "in a moonlit forest clearing"). Include any pose/action context here.
4. ADD LIGHTING + MOOD in a short phrase ("warm cinematic rim lighting", "soft diffused daylight", "dramatic chiaroscuro").
5. END WITH STYLE/MEDIUM ("hyperrealistic anime style", "cinematic photography", "watercolor illustration").

HARD RULES — fail if broken:
- ONE paragraph. No line breaks. No `// Section:` markers. No bullet points. No `Negative Prompt:` block.
- Preserve EVERY identifying detail from the input — character names, every outfit piece, every scar/mark, the scene location. Reword for flow but don't drop anything.
- CHARACTER COUNT IS LOAD-BEARING. Every `// Character:` section in the input MUST produce a corresponding named subject in your output paragraph. If the input has two `// Character:` sections, your paragraph MUST name BOTH characters. Dropping a character is the worst possible failure.
- The named characters must appear with their FULL display name (e.g. "Cammy White", "Tifa Lockhart", "Chun-Li") — not paraphrased, not pronouns only. Each character's first reference is by name; subsequent references can use pronouns or "the other".
- ACTIVE INTERACTION OVER STATIC POSE. When the pose section names an interaction verb between multiple subjects (combat, dancing, embracing, racing, conversing, dueling, sparring, chasing, etc.), describe SPECIFIC ACTIVE MOTION in present continuous — one subject doing something to/with the other (throwing a punch, mid-kick, leaning in close, hand on shoulder, sprinting past). Do NOT collapse it to "both in <verb> stances" or "posed in a <verb> position" — that renders as static mannequins. The pose KB body is a starting hint; expand it into directed motion between the named subjects.
- Single subject? Render the pose as written; no need to invent interaction.
- Do NOT invent details not in the input. No "graceful" or "fierce" unless the input said so. (Specific motion verbs implied by the input's interaction verb DO count as faithful — "fighting" naturally implies "throwing a punch" / "blocking" as concrete examples.)
- Lead with the primary subject (first character that appears in the input).
- If the input lacks lighting or style, pick a single tasteful default from category — cinematic rim lighting for action, soft natural daylight for portraits. One short phrase, nothing more.
- Output ONLY the paragraph. No quotes, no commentary, no markdown fences."""


def _clean(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return s
    if s.startswith("```"):
        lines = s.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1].strip()
    return s


_STYLE_OFF_RULE = (
    "\n\nADDITIONAL RULE FOR THIS CALL:\n"
    "- DO NOT include any rendering style or medium descriptor in your "
    "paragraph. Stop after the lighting/mood phrase. No 'hyperrealistic', "
    "'cinematic photography', 'anime style', or any other medium tag "
    "anywhere in the output. The caller will append the style section "
    "separately — your job is the multi-subject scene paragraph only."
)


async def compose_scene_paragraph(
    structured_prompt: str,
    *,
    include_style_in_prose: bool = True,
) -> tuple[str, str]:
    """Return (paragraph, raw_llm_response). Empty paragraph on parse
    failure — caller should fall back to the structured input.

    `include_style_in_prose=False` tells the composer to skip the
    style/medium step entirely. Used by the multi-char edit compose
    path so style remains a separate `// Style: <Name>` section
    (preserving the style-template swap pipeline that operates on
    section headers)."""
    if not (structured_prompt or "").strip():
        return "", ""
    system = SCENE_COMPOSER_SYSTEM
    if not include_style_in_prose:
        system = SCENE_COMPOSER_SYSTEM + _STYLE_OFF_RULE
    user_msg = f"Structured input:\n{structured_prompt}\n\nOutput the cinematic paragraph:"
    raw = await ai_api._run_generation(
        f"scene-compose-{abs(hash(structured_prompt)) % 10000}",
        PROVIDER, CONFIG,
        system, user_msg, [],
    )
    return _clean(raw), (raw or "")


# ── Probes ────────────────────────────────────────────────────────


FIXTURES = [
    {
        "name": "two_chars_action_scene",
        "input": (
            "// Character: Cammy White (Street Fighter)\n"
            "Cammy White from Street Fighter, Female, blonde hair, long hair, "
            "twin braids, sidelocks, blue eyes, a single extremely faint "
            "vertical old wound on lower jaw with no blood, toned athletic "
            "female body, moderate average bust size.\n\n"
            "// Character: Tifa Lockhart (Final Fantasy VII)\n"
            "Tifa Lockhart from Final Fantasy VII. Young woman, 167cm tall. "
            "Long straight black hair worn loose with a distinctive low "
            "ponytail tied at the end that flares out like a dolphin tail. "
            "Deep wine-red burgundy eyes. Fair skin. Athletic toned muscular "
            "physique with well-defined abdominal muscles. Very large breasts.\n\n"
            "// Outfit: Delta Red from Character: Cammy White\n"
            "Wearing green sleeveless thong leotard, small red military beret, "
            "red fingerless gauntlets, black tactical chest harness, "
            "black thigh holster, red socks, black calf-high combat boots.\n\n"
            "// Outfit: FF7 Original from Character: Tifa Lockhart\n"
            "Wearing white tank top, black miniskirt with suspenders, "
            "fingerless gloves, brown boots.\n\n"
            "// Pose: Fighting Stance (signature)\n"
            "In a fighting stance, martial arts pose.\n\n"
            "// Scene:\n"
            "On top of a roof.\n\n"
            "Negative Prompt:\n"
            "blurry, low quality, jpeg artifacts."
        ),
        "must_include": [
            "Cammy White", "Tifa Lockhart",
        ],
        "must_not_include": [
            "// Character:", "// Outfit:", "// Pose:", "// Scene:",
            "Negative Prompt:",
        ],
        "want_single_paragraph": True,
    },
]


def _block(label, body):
    print(f"\n--- {label} ---")
    for line in (body or "").splitlines():
        print(f"  {line}")


async def main() -> int:
    pass_count = 0
    for fx in FIXTURES:
        print(f"\n{'='*78}\n{fx['name']}\n{'='*78}")
        _block("INPUT", fx["input"])
        paragraph, raw = await compose_scene_paragraph(fx["input"])
        _block("OUTPUT", paragraph)
        failures = []
        for s in fx.get("must_include", []):
            if s not in paragraph:
                failures.append(f"missing: {s!r}")
        for s in fx.get("must_not_include", []):
            if s in paragraph:
                failures.append(f"unexpected: {s!r}")
        if fx.get("want_single_paragraph"):
            # Loose check: shouldn't have more than 1 blank line
            if paragraph.count("\n\n") > 0:
                failures.append("contains blank line (not a single paragraph)")
        if failures:
            print(f"\n[FAIL]")
            for f in failures:
                print(f"  ! {f}")
        else:
            print(f"\n[PASS]")
            pass_count += 1
    print(f"\n=== {pass_count}/{len(FIXTURES)} ===")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
