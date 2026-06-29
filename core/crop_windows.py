"""Pure crop-window remap for regional / tiled re-sampling.

Extracted from regional_detailer so the most-revised, most-regressed geometry in
the codebase (the moved-content inpaint and per-tile cond + ControlNet-hint
remap) is importable and unit-testable WITHOUT the ComfyUI runtime. torch-only,
no comfy deps — see scripts/test_crop_windows.py.
"""

from __future__ import annotations

import torch
import torch.nn.functional as F


def crop_hint_to_window(t, win, img_h, img_w, sh, sw, mode="bilinear"):
    """Resize a (...,H,W) hint to canvas, crop the detail window, resize to the
    sampled crop dims — the per-crop remap the tiled upscaler does. Depth/control
    hints use bilinear; region masks pass mode='nearest-exact' so a hard region
    edge doesn't soften into a bleed band against the neighbouring region.

    win is (cx1, cy1, cx2, cy2) in canvas pixels. Output last two dims == (sh, sw).
    """
    cx1, cy1, cx2, cy2 = win
    t = t.float()
    align = None if mode.startswith("nearest") else False
    if t.shape[-2:] != (img_h, img_w):
        t = F.interpolate(t, size=(img_h, img_w), mode=mode, align_corners=align)
    t = t[..., cy1:cy2, cx1:cx2]
    return F.interpolate(t, size=(sh, sw), mode=mode, align_corners=align)
