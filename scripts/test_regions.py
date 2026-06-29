#!/usr/bin/env python3
"""Regression tests for regional prompt extraction + figure binding (core/compiler.py).

Locks the two confirmed correctness fixes:
  - $block bodies are extracted by brace DEPTH, so a wildcard ({a|b}) inside a
    region no longer truncates it or leaks the remainder into the global prompt.
  - a non-object pose JSON (scalar/array/null) degrades gracefully instead of
    crashing the single-source-of-truth entity resolver.
Plus sanity coverage of the name -> id -> order binding ladder and orphan drop.
torch-free; run anywhere.
"""

from __future__ import annotations

import importlib.util
import os
import sys

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location(
    "pc_compiler", os.path.join(_HERE, "core", "compiler.py"))
_c = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_c)

_failures = []


def check(name, cond):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        _failures.append(name)


def main() -> int:
    # ── brace-depth extraction (the HIGH fix) ────────────────────────────────
    spans = list(_c._iter_region_spans("$mannequin1 { {red|blue} dress }"))
    check("wildcard brace kept inside region body",
          len(spans) == 1 and "{red|blue}" in spans[0][1] and "dress" in spans[0][1])

    # global must NOT receive the truncated remainder
    glob = _c._remove_region_spans("$m1{ {a|b} dress } and a tree",
                                   list(_c._iter_region_spans("$m1{ {a|b} dress } and a tree")))
    check("global free of region body leak", "dress" not in glob and "and a tree" in glob)

    # nested parens + wildcard
    sp2 = list(_c._iter_region_spans("$hero { (a|{red|blue}) } tail"))
    check("nested braces fully captured",
          len(sp2) == 1 and sp2[0][1].strip() == "(a|{red|blue})")

    # adjacent regions still split correctly
    sp3 = list(_c._iter_region_spans("$a{ x } $b{ y }"))
    check("adjacent regions both extracted",
          [s[0] for s in sp3] == ["a", "b"])

    # strip_region_markers keeps nested body inline (flat/non-regional path)
    flat = _c.strip_region_markers("$m1{ hair {a|b} } scene")
    check("strip keeps nested body inline",
          "{a|b}" in flat and "$m1" not in flat and "scene" in flat)

    # unbalanced brace degrades without hanging
    sp4 = list(_c._iter_region_spans("$x{ no close here"))
    check("unbalanced region handled", len(sp4) == 1 and "no close" in sp4[0][1])

    # compile_regions end-to-end: region text non-empty, global clean
    obj = _c.compile_regions("a cat $m1{ red {hat|cap} } in a park")
    body_ok = obj["regions"] and obj["regions"][0]["text"]
    check("compile_regions: region body compiled non-empty", bool(body_ok))
    check("compile_regions: global has outside text, not region body",
          "cat" in obj["global"] and "park" in obj["global"] and "red" not in obj["global"])

    # ── brace-internal newlines don't comma-pollute a wildcard ───────────────
    # A wildcard split across lines is layout, not tag separators.
    p, _, _ = _c.compile_prompt("a woman in a {\n  red|blue\n  } sundress")
    check("multi-line wildcard: no mid-phrase comma before the option",
          p in ("a woman in a red sundress", "a woman in a blue sundress"))
    # nested wildcard across lines stays clean
    p, _, _ = _c.compile_prompt("a {\n big | {tiny|small}\n} cat")
    check("nested multi-line wildcard resolves clean", "," not in p and "cat" in p)
    # but a top-level newline (lazy tag list) STILL comma-joins
    p, _, _ = _c.compile_prompt("masterpiece\n{detailed|intricate}\nforest")
    check("lazy multi-line tag list still comma-joins", p.count(",") == 2)
    # a multi-line wildcard OPTION keeps internal commas (newline→comma), but no
    # leading/trailing junk comma from the option edges
    picks = {_c.compile_prompt("{\na\nb\n|\nc\nd\n}")[0] for _ in range(60)}
    check("multi-line wildcard options -> 'a, b' / 'c, d'", picks == {"a, b", "c, d"})
    picks = {_c.compile_prompt("{\nred\n|\nblue\n}")[0] for _ in range(60)}
    check("split single-tag wildcard -> clean (no edge comma)", picks == {"red", "blue"})

    # ── example $blocks inside // comments are NOT extracted as regions ───────
    scaffolded = ("// help: $background{ a forest } and $alice{ red dress }, $bob{ blue suit }\n"
                  "$region1 {\na cat\n}\n\n$region2 {\na dog\n}\n\na grassy field")
    obj = _c.compile_regions(scaffolded)
    check("comment-scaffold $blocks ignored (only real regions)",
          [r["name"] for r in obj["regions"]] == ["region1", "region2"])
    check("comment-scaffold global is the real global",
          obj["global"] == "a grassy field")

    # ── non-object pose JSON guard (the LOW fix) ─────────────────────────────
    for payload in ("42", "[]", "null", '"x"', "3.14"):
        try:
            names, nfig = _c._pose_entity_index(payload)
            ok = names == [] and nfig is None
        except Exception:
            ok = False
        check(f"non-object pose {payload!r} degrades to ([],None)", ok)

    # ── binding ladder sanity ────────────────────────────────────────────────
    pose = '{"regionEntities":[{"kind":"figure","name":"alice"},{"kind":"figure","name":"bob"}]}'
    regions = [{"id": 1, "name": "bob", "text": "x"}, {"id": 2, "name": "alice", "text": "y"}]
    idx = _c.region_figure_indices(regions, pose)
    check("name-match binds across order (bob->1, alice->0)", idx == [1, 0])

    # orphan: a $block whose figure was deleted (name unknown, id past figures)
    orphan_regions = [{"id": 1, "name": "alice", "text": "x"},
                      {"id": 9, "name": "ghost", "text": "y"}]
    orphans = _c.region_orphans(orphan_regions, pose)
    check("deleted-figure block flagged orphan", orphans == [False, True])

    print(f"\n{'ALL PASS' if not _failures else str(len(_failures)) + ' FAILURE(S)'}")
    return 1 if _failures else 0


if __name__ == "__main__":
    sys.exit(main())
