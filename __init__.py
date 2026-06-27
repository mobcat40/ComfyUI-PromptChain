from __future__ import annotations
import asyncio as _asyncio
import logging as _logging
import sys as _sys
import threading as _threading

from typing_extensions import override
from comfy_api.latest import ComfyExtension, io

from .nodes.promptchain import PromptChainNode
from .nodes.pose_studio import PoseStudioNode
from .nodes.attention_couple import AttentionCoupleNode
from .nodes.attention_couple_zimage import ZImageRegionalCoupleNode
from .nodes.regional_detailer import RegionalDetailerNode, MaskedDetailNode
from .nodes.regional_conditioning import RegionalConditioningNode
from .nodes.region_box import RegionBoxNode
from .nodes.defocus_mask import DefocusMaskNode
from .nodes.ideogram_sampler import IdeogramSamplerNode
from .nodes.ideogram_caption import IdeogramCaptionNode


# Timestamps on every PromptChain log line. ComfyUI's default formatter
# emits bare messages with no clock — fine for crash-style logs but
# useless for measuring patch latency or correlating events. We attach
# our own StreamHandler to the `promptchain` namespace with HH:MM:SS.mmm
# timestamps and disable propagation so messages don't double-log.
_pc_logger = _logging.getLogger("promptchain")
if not any(getattr(h, "_pc_timestamped", False) for h in _pc_logger.handlers):
    _pc_handler = _logging.StreamHandler(_sys.stdout)
    _pc_handler.setFormatter(_logging.Formatter(
        "%(asctime)s.%(msecs)03d %(levelname).1s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    ))
    _pc_handler._pc_timestamped = True  # marker so re-import doesn't dup
    _pc_logger.addHandler(_pc_handler)
    _pc_logger.setLevel(_logging.INFO)
    _pc_logger.propagate = False
from .core.fingerprint import scan_models, list_models
from .core.tags import get_store as get_tag_store
from .core import model_settings
from .core.shared import send_ws
from .core.model_api import detect_model, recognition_state

# Route modules — register their endpoints on import
from .core import tag_builder  # noqa: F401
from .core import browse_api  # noqa: F401
from .core import template_api  # noqa: F401
from .core import tag_api  # noqa: F401
from .core import wildcard_api  # noqa: F401
from .core import history_api  # noqa: F401
from .core import model_api  # noqa: F401
from .core import lora_catalog  # noqa: F401
from .core import civitai_api  # noqa: F401
from .core import system_api  # noqa: F401
from .core import node_install_api  # noqa: F401
from .core import pose_api  # noqa: F401
from .core import inpaint_files  # noqa: F401  (age-sweeps input/promptchain_inpaint at startup)
from .core import upscale_api  # noqa: F401
from .core import edit_api  # noqa: F401
from .core import extend_api  # noqa: F401
from .core import modal_setup_api  # noqa: F401
from .core import subject_api  # noqa: F401
from .core import install_sections  # noqa: F401
from .core import ai_api  # noqa: F401
from .core import ai_agent  # noqa: F401


# ── native preprocessor nodes ────────────────────────────────────
# pcr_cnaux (DepthAnything/TEED-based) and pcr_rtmpose (rtmlib) are OUR OWN
# preprocessor nodes — the license-clean replacements for comfyui_controlnet_aux.
# They're written against the V1 `NODE_CLASS_MAPPINGS` convention, but PromptChain
# registers via the V3 `comfy_entrypoint` below and ComfyUI's loader is
# `if NODE_CLASS_MAPPINGS … elif comfy_entrypoint` (mutually exclusive, see
# comfyui/nodes.py), so a module-level NODE_CLASS_MAPPINGS here would shadow our
# own nodes. Instead we inject these maps into ComfyUI's global registry at import
# time (during exec_module, before the loader reaches our entrypoint). Their ids
# are unique (PromptChain_*), so there is no collision to guard against.
# Third-party packs are NOT registered here — they live in bundled_packs/ and are
# copied into the user's custom_nodes/ at install time. Wrapped so an import error
# in one can never take down PromptChain's own nodes.

def _register_vendored_nodes():
    import nodes as _comfy
    native = []
    try:
        from .vendor.pcr_cnaux import NODE_CLASS_MAPPINGS as m, NODE_DISPLAY_NAME_MAPPINGS as d
        native.append(("pcr_cnaux", m, d))
    except Exception:
        _pc_logger.warning("native pcr_cnaux failed to load", exc_info=True)
    try:
        from .vendor.pcr_rtmpose import NODE_CLASS_MAPPINGS as m, NODE_DISPLAY_NAME_MAPPINGS as d
        native.append(("pcr_rtmpose", m, d))
    except Exception:
        _pc_logger.warning("native pcr_rtmpose failed to load", exc_info=True)
    for name, class_map, display_map in native:
        _comfy.NODE_CLASS_MAPPINGS.update(class_map)
        _comfy.NODE_DISPLAY_NAME_MAPPINGS.update(display_map or {})
        _pc_logger.info("registered native preprocessors '%s' (%d nodes)", name, len(class_map))


_register_vendored_nodes()


WEB_DIRECTORY = "./js"


# ── boot-time preloading ─────────────────────────────────────────
# Load heavy data in background threads so the first API request
# doesn't block the aiohttp event loop (which freezes all nodes).

def _preload():
    scan_models()
    get_tag_store().load_all()
    # Heal any CivitAI-model-id groups whose versions ended up with
    # different model_name strings (creator renamed the CivitAI page
    # between recognitions).  Runs every boot; idempotent when data
    # is already consistent.
    try:
        model_settings.normalize_civitai_model_names()
    except Exception as e:
        print(f"[PromptChain] normalize_civitai_model_names failed: {e}")
    # Warm up bucket-search embeddings so the first Prompt Generator
    # request doesn't pay the model-download + index-build cost (~5-15s).
    # Best-effort; if transformers isn't installed the search endpoint
    # degrades to empty results and the rest of the pipeline still works.
    try:
        from .core import bucket_search
        bucket_search.warmup()
    except Exception as e:
        print(f"[PromptChain] bucket_search warmup failed: {e}")
    # Same model as bucket_search; this just builds the small modifier
    # index (~7 rows) using the cached weights. First /ai/patch request
    # then doesn't pay the embed-the-modifiers cost.
    try:
        from .core import modifier_search
        modifier_search.warmup()
    except Exception as e:
        print(f"[PromptChain] modifier_search warmup failed: {e}")
    # Danbooru tag-wiki retrieval. Disk-cached index — typically < 1s
    # to load. Cold first-build is ~5-10 min on CPU and only happens
    # after a wiki ingest run; we do that out-of-band, not at boot.
    try:
        from .core import tag_search
        tag_search.warmup()
    except Exception as e:
        print(f"[PromptChain] tag_search warmup failed: {e}")
    try:
        from .core import style_search
        style_search.warmup()
    except Exception as e:
        print(f"[PromptChain] style_search warmup failed: {e}")
    _recognize_unknown_models()


def _recognize_unknown_models():
    """Process unrecognized models: full SHA256 -> CivitAI -> save settings."""
    models = list_models()
    unrecognized = [
        m for m in models
        if not model_settings.load(m["hash"])
        and not model_settings.is_catalog_filename(m["filename"])
    ]
    if not unrecognized:
        print(f"[PromptChain] All {len(models)} model(s) already recognized")
        return

    print(f"[PromptChain] {len(unrecognized)} unrecognized model(s), starting CivitAI detection...")

    recognition_state["running"] = True
    recognition_state["total"] = len(unrecognized)
    recognition_state["done"] = 0

    send_ws("promptchain_recognition_start", {
        "total": len(unrecognized),
    })

    loop = _asyncio.new_event_loop()
    try:
        for model in unrecognized:
            recognition_state["current"] = model["filename"]
            print(f"[PromptChain] Detecting: {model['filename']}...")
            try:
                # Timeout per model: if CivitAI or DNS hangs, don't stall
                # the whole boot preload.  30s is generous for a single
                # hash lookup + metadata fetch.
                result = loop.run_until_complete(
                    _asyncio.wait_for(
                        detect_model(model["hash"], model["filepath"], model.get("architecture", "")),
                        timeout=30,
                    )
                )
            except _asyncio.TimeoutError:
                print(f"[PromptChain] Timeout detecting {model['filename']}, skipping")
                result = {"status": "timeout"}
            status = result.get("status", "not_found")
            display = result.get("settings", {}).get("display_name", "")
            if status == "found":
                print(f"[PromptChain] Found: {display} (arch={result['settings'].get('architecture')}, family={result['settings'].get('family', '')})")
            else:
                print(f"[PromptChain] {status}")
            recognition_state["done"] += 1
            send_ws("promptchain_model_recognized", {
                "hash": model["hash"],
                "filename": model["filename"],
                "status": status,
                "settings": result.get("settings"),
                "done": recognition_state["done"],
                "total": recognition_state["total"],
            })
    finally:
        loop.close()
        recognition_state["running"] = False
        recognition_state["current"] = None
        print(f"[PromptChain] Recognition complete: {recognition_state['done']}/{recognition_state['total']}")
        send_ws("promptchain_recognition_done", {
            "total": recognition_state["total"],
            "done": recognition_state["done"],
        })


_threading.Thread(target=_preload, daemon=True).start()


# ── extension ────────────────────────────────────────────────────

class PromptChainExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [PromptChainNode, PoseStudioNode, AttentionCoupleNode, ZImageRegionalCoupleNode, RegionalDetailerNode, MaskedDetailNode, RegionalConditioningNode, RegionBoxNode, DefocusMaskNode, IdeogramSamplerNode, IdeogramCaptionNode]


async def comfy_entrypoint() -> PromptChainExtension:
    return PromptChainExtension()
