import os
import sys
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from .other_nodes import Gradually_More_Denoise_KSampler

# Trimmed to RIFE only: PromptChain's Smooth/Extend use "RIFE VFI" exclusively.
# The other interpolation models were never wired up and carried unclear/
# non-commercial upstream licenses, so they can't ride along in a redistributed pack.
from vfi_models.rife import RIFE_VFI
from vfi_utils import MakeInterpolationStateList, FloatToInt

NODE_CLASS_MAPPINGS = {
    "KSampler Gradually Adding More Denoise (efficient)": Gradually_More_Denoise_KSampler,
    "RIFE VFI": RIFE_VFI,
    "Make Interpolation State List": MakeInterpolationStateList,
    "VFI FloatToInt": FloatToInt
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RIFE VFI": "RIFE VFI (recommend rife4.25+)"
}
