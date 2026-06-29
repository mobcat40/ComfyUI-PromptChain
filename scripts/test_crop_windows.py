#!/usr/bin/env python3
"""Unit tests for the crop-window remap (core/crop_windows.py).

Locks the invariants of the most-regressed geometry in the codebase: output
dims, the nearest-vs-bilinear mask choice (the confirmed region-edge bleed fix),
full-canvas identity, and that distinct windows select distinct source regions
(the mask_win != ctrl_win moved-content mechanism). torch-only; run anywhere.
"""

from __future__ import annotations

import importlib.util
import os
import sys

import torch

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location(
    "crop_windows", os.path.join(_HERE, "core", "crop_windows.py"))
_cw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cw)
crop = _cw.crop_hint_to_window

_failures = []


def check(name, cond):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        _failures.append(name)


def main() -> int:
    H, W = 120, 80  # non-square canvas (portrait), the case aspect bugs hide in

    # 1. Output dims are always (sh, sw) regardless of input size or window.
    src = torch.rand(1, 1, 64, 48)
    out = crop(src, (10, 20, 70, 100), H, W, 32, 24)
    check("output dims == (sh, sw)", tuple(out.shape[-2:]) == (32, 24))

    # 2. nearest-exact keeps a binary mask binary (no soft bleed band).
    mask = torch.zeros(1, 1, H, W)
    mask[..., 40:80, 20:60] = 1.0
    out_n = crop(mask, (0, 0, W, H), H, W, 60, 40, mode="nearest-exact")
    uniq = set(torch.unique(out_n).tolist())
    check("nearest mask stays binary {0,1}", uniq.issubset({0.0, 1.0}))

    # 3. bilinear DOES introduce an intermediate edge value — proves the mode
    #    actually changes behaviour (so the mask fix is meaningful, not a no-op).
    #    Upscale a hard edge so it must ramp (an exact-2x downsample with the edge
    #    on an even boundary would sample exactly 0/1 and hide the difference).
    small = torch.zeros(1, 1, 8, 8)
    small[..., 4:, :] = 1.0
    up_b = crop(small, (0, 0, 8, 8), 8, 8, 32, 32, mode="bilinear")
    up_n = crop(small, (0, 0, 8, 8), 8, 8, 32, 32, mode="nearest-exact")
    check("bilinear softens the edge (mode matters)",
          bool(((up_b > 0.01) & (up_b < 0.99)).any()))
    check("nearest stays hard on the same upscale",
          set(torch.unique(up_n).tolist()).issubset({0.0, 1.0}))

    # 4. Full-canvas window is identity-ish: a uniform field stays uniform.
    flat = torch.full((1, 1, H, W), 0.5)
    out_f = crop(flat, (0, 0, W, H), H, W, H, W)
    check("full-canvas uniform field preserved", torch.allclose(out_f, flat, atol=1e-5))

    # 5. A window over an all-ones sub-region returns ~all-ones; a disjoint
    #    window returns ~all-zeros. This is what makes a tile sample the right
    #    region — and the basis of mask_win != ctrl_win moved-content selection.
    field = torch.zeros(1, 1, H, W)
    field[..., 0:40, 0:40] = 1.0  # top-left block is the "content"
    inside = crop(field, (0, 0, 40, 40), H, W, 16, 16, mode="nearest-exact")
    outside = crop(field, (40, 60, 80, 120), H, W, 16, 16, mode="nearest-exact")
    check("window over content -> all ones", bool((inside > 0.5).all()))
    check("disjoint window -> all zeros", bool((outside < 0.5).all()))

    # 6. Distinct windows select DISTINCT regions of the same source (the
    #    mask_win vs ctrl_win divergence relies on this).
    grad = torch.linspace(0, 1, W).view(1, 1, 1, W).expand(1, 1, H, W).contiguous()
    left = crop(grad, (0, 0, 20, H), H, W, 8, 8)
    right = crop(grad, (60, 0, 80, H), H, W, 8, 8)
    check("distinct windows -> distinct content", float(left.mean()) < float(right.mean()))

    # 7. Input already at canvas size skips the upscale but still crops+resizes.
    at_canvas = torch.rand(1, 1, H, W)
    out_ac = crop(at_canvas, (10, 10, 50, 50), H, W, 20, 20)
    check("pre-sized input crops to (sh,sw)", tuple(out_ac.shape[-2:]) == (20, 20))

    print(f"\n{'ALL PASS' if not _failures else str(len(_failures)) + ' FAILURE(S)'}")
    return 1 if _failures else 0


if __name__ == "__main__":
    sys.exit(main())
