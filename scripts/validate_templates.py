#!/usr/bin/env python3
"""Structural validator for PromptChain workflow templates.

Templates are the contract surface between every model architecture and the
regional/depth/pose nodes — a dangling link or bad slot index silently breaks a
template in the picker. This catches those before they ship; run it on /deploy.

It validates STRUCTURE, not render semantics (it can't tell a depth ControlNet
is wired to the wrong stream — only a render does). Checks:
  - valid JSON, required top-level fields
  - scope.type is one of the known kinds, with the fields that kind needs
  - every node has a string `type`
  - every connection references existing node indices and non-negative slots
  - anchorConnections reference existing nodes/slots
  - template `id` is unique across the directory
  - duplicate (name + scope) pairs are reported (two indistinguishable entries)

Exit code 0 = clean, 1 = at least one error. Warnings never fail the build.
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "data", "templates")

SCOPE_TYPES = {"architecture", "family", "version", "model"}
SCOPE_REQUIRED = {
    "architecture": ["architecture"],
    "family": ["architecture", "family"],
    "version": ["model_hash"],
    "model": ["model_name"],  # display_name is accepted as an alias below
}


def _validate(path: str, errors: list, warnings: list, ids: dict, signatures: dict) -> None:
    name = os.path.basename(path)
    try:
        with open(path, "r", encoding="utf-8") as f:
            tpl = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        errors.append(f"{name}: not valid JSON — {e}")
        return
    if not isinstance(tpl, dict):
        errors.append(f"{name}: top level must be an object")
        return

    if not tpl.get("name"):
        errors.append(f"{name}: missing 'name'")
    tid = tpl.get("id")
    if not tid:
        errors.append(f"{name}: missing 'id'")
    elif tid in ids:
        errors.append(f"{name}: duplicate id '{tid}' (also in {ids[tid]})")
    else:
        ids[tid] = name

    scope = tpl.get("scope")
    if not isinstance(scope, dict):
        errors.append(f"{name}: missing/invalid 'scope'")
    else:
        st = scope.get("type", "architecture")
        if st not in SCOPE_TYPES:
            errors.append(f"{name}: scope.type '{st}' not one of {sorted(SCOPE_TYPES)}")
        else:
            req = SCOPE_REQUIRED.get(st, [])
            for key in req:
                if key == "model_name" and (scope.get("model_name") or scope.get("display_name")):
                    continue
                if not scope.get(key):
                    errors.append(f"{name}: scope.type '{st}' requires '{key}'")

    nodes = tpl.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        errors.append(f"{name}: 'nodes' must be a non-empty array")
        nodes = []
    for i, node in enumerate(nodes):
        if not isinstance(node, dict) or not isinstance(node.get("type"), str) or not node.get("type"):
            errors.append(f"{name}: node[{i}] missing a string 'type'")

    n = len(nodes)

    def _check_link(label: str, link: dict, has_from: bool) -> None:
        if not isinstance(link, dict):
            errors.append(f"{name}: {label} is not an object")
            return
        if has_from:
            fi = link.get("from_node_idx")
            if not isinstance(fi, int) or not (0 <= fi < n):
                errors.append(f"{name}: {label} from_node_idx {fi} out of range (0..{n - 1})")
        for slot_key in ("from_slot", "to_slot"):
            sv = link.get(slot_key)
            if not isinstance(sv, int) or sv < 0:
                errors.append(f"{name}: {label} {slot_key} {sv!r} must be a non-negative int")
        ti = link.get("to_node_idx")
        if not isinstance(ti, int) or not (0 <= ti < n):
            errors.append(f"{name}: {label} to_node_idx {ti} out of range (0..{n - 1})")

    conns = tpl.get("connections", [])
    if not isinstance(conns, list):
        errors.append(f"{name}: 'connections' must be an array")
    else:
        for j, link in enumerate(conns):
            _check_link(f"connections[{j}]", link, has_from=True)

    anchors = tpl.get("anchorConnections", [])
    if isinstance(anchors, list):
        for j, link in enumerate(anchors):
            _check_link(f"anchorConnections[{j}]", link, has_from=False)

    # Two templates the matcher can't tell apart (same name + identical scope)
    # both surface for the same model — usually an authoring mistake.
    if isinstance(scope, dict) and tpl.get("name"):
        sig = (tpl.get("name"), json.dumps(scope, sort_keys=True))
        signatures[sig].append(name)


def main() -> int:
    if not os.path.isdir(TEMPLATES_DIR):
        print(f"templates dir not found: {TEMPLATES_DIR}")
        return 1
    errors: list = []
    warnings: list = []
    ids: dict = {}
    signatures: dict = defaultdict(list)

    files = sorted(f for f in os.listdir(TEMPLATES_DIR)
                   if f.endswith(".json") and not f.startswith("_"))
    for f in files:
        _validate(os.path.join(TEMPLATES_DIR, f), errors, warnings, ids, signatures)

    for sig, names in signatures.items():
        if len(names) > 1:
            warnings.append(f"same name+scope on {len(names)} templates: {', '.join(names)} "
                            f"(name={sig[0]!r})")

    print(f"validated {len(files)} templates")
    for w in warnings:
        print(f"  WARN  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    if errors:
        print(f"\n{len(errors)} error(s)")
        return 1
    print("OK — no structural errors" + (f" ({len(warnings)} warning(s))" if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
