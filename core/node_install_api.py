"""
Custom-node-pack self-installer for PromptChain injectables
(FaceDetailer / PuLID / Upscaler).

When the user clicks an injectable whose underlying custom-node pack isn't
installed, the frontend opens an install modal that drives these endpoints:
clone the pack from a hardcoded allowlist, install its requirements, run its
install.py, then restart and re-check. We borrow ComfyUI-Manager's *logic*
(allowlist of repos + protect torch/critical deps from being clobbered) without
bundling or depending on Manager itself.

Security: installs are restricted to the hardcoded allowlist below — a client
can only name an injectable, never a URL.
"""
from __future__ import annotations

import asyncio
import importlib.metadata
import json
import logging
import re
import shutil
import sys
from pathlib import Path

import aiohttp
from aiohttp import web
import server

from .api_utils import error_response, parse_json

routes = server.PromptServer.instance.routes
logger = logging.getLogger("promptchain.nodepacks")


# ── allowlist ──────────────────────────────────────────────────────
# injectable -> {
#   repos: clone URLs,
#   proof_nodes: node types whose registration proves the pack loaded,
#   models: weight files the pack does NOT fetch itself, downloaded into
#           <models>/<dest> so the inject's loaders have something to select.
# }
# PuLID and UltimateSDUpscale ship NO model downloader, so we fetch the weights
# our inject defaults expect — the same files the reference deployment runs with.
# (Impact-Pack FaceDetailer was removed — PromptChain_RegionalDetailer, our
# self-contained detailer, replaced it everywhere: the [add] menu injects it and
# the only face-detail template now uses it.)

NODE_PACKS: dict[str, dict] = {
    "PuLID": {
        "label": "PuLID",
        "bundle": ["PuLID_ComfyUI"],
        "proof_nodes": ["ApplyPulidAdvanced"],
        "models": [
            # SDXL PuLID weights (the cubiq node's documented source).
            {"url": "https://huggingface.co/huchenlei/ipadapter_pulid/resolve/main/ip-adapter_pulid_sdxl_fp16.safetensors",
             "dest": "pulid/ip-adapter_pulid_sdxl_fp16.safetensors"},
            # InsightFace antelopev2 face-analysis bundle (5 onnx files).
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/1k3d68.onnx",
             "dest": "insightface/models/antelopev2/1k3d68.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/2d106det.onnx",
             "dest": "insightface/models/antelopev2/2d106det.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/genderage.onnx",
             "dest": "insightface/models/antelopev2/genderage.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/glintr100.onnx",
             "dest": "insightface/models/antelopev2/glintr100.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/scrfd_10g_bnkps.onnx",
             "dest": "insightface/models/antelopev2/scrfd_10g_bnkps.onnx"},
        ],
    },
    "PuLIDFlux": {
        "label": "PuLID (Flux)",
        # lldacing's maintained fork (NOT balazik — that monkeypatches Flux
        # forward_orig with a stale signature and breaks on current ComfyUI:
        # "forward_orig() got an unexpected keyword argument 'timestep_zero_index'").
        # The fork needs its companion Patches_ll: its FluxForwardOverrider node
        # carries the **kwargs forward override that absorbs the new arg, and the
        # inject wires it onto the model line after ApplyPulidFlux. Same model
        # assets (pulid weights + antelopev2; EVA-CLIP auto-downloads).
        "bundle": ["ComfyUI_PuLID_Flux_ll", "ComfyUI_Patches_ll"],
        "proof_nodes": ["ApplyPulidFlux", "FluxForwardOverrider"],
        # The fork hard-imports facenet_pytorch at module top (for its optional
        # FaceNet loader) but omits it from requirements — without it the whole
        # pack fails to import. --no-deps so it can't drag torch backward.
        "extra_pip": ["facenet-pytorch"],
        "models": [
            {"url": "https://huggingface.co/guozinan/PuLID/resolve/main/pulid_flux_v0.9.1.safetensors",
             "dest": "pulid/pulid_flux_v0.9.1.safetensors"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/1k3d68.onnx",
             "dest": "insightface/models/antelopev2/1k3d68.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/2d106det.onnx",
             "dest": "insightface/models/antelopev2/2d106det.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/genderage.onnx",
             "dest": "insightface/models/antelopev2/genderage.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/glintr100.onnx",
             "dest": "insightface/models/antelopev2/glintr100.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/scrfd_10g_bnkps.onnx",
             "dest": "insightface/models/antelopev2/scrfd_10g_bnkps.onnx"},
        ],
    },
    "PuLIDFlux2": {
        "label": "PuLID (Flux 2)",
        # iFayens' PuLID port for the Flux.2 family. Standalone model patch —
        # no FluxForwardOverrider companion (unlike the Flux.1 fork). Its
        # requirements.txt pins numpy<2 + ml_dtypes==0.3.2; the standard
        # filtered-install + _restore_critical flow protects the venv. The
        # native weights are Klein-trained (Dev variant unpublished); the
        # frontend gates the injectable to the flux2_klein family. EVA-CLIP
        # auto-downloads via open_clip on first run (~800 MB to the HF cache);
        # antelopev2 must be pre-fetched (insightface's own fetcher is broken
        # upstream). NOTE: the loader only reads ComfyUI/models/pulid — it
        # does not honor extra_model_paths, and Flux.1 pulid_flux_v0.9.1
        # crashes it (no id_former keys), so the inject pins the flux2 file.
        "bundle": ["ComfyUI-PuLID-Flux2"],
        "proof_nodes": ["ApplyPuLIDFlux2"],
        "models": [
            {"url": "https://huggingface.co/Fayens/Pulid-Flux2/resolve/main/pulid_flux2_klein_v2.safetensors",
             "dest": "pulid/pulid_flux2_klein_v2.safetensors"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/1k3d68.onnx",
             "dest": "insightface/models/antelopev2/1k3d68.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/2d106det.onnx",
             "dest": "insightface/models/antelopev2/2d106det.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/genderage.onnx",
             "dest": "insightface/models/antelopev2/genderage.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/glintr100.onnx",
             "dest": "insightface/models/antelopev2/glintr100.onnx"},
            {"url": "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/scrfd_10g_bnkps.onnx",
             "dest": "insightface/models/antelopev2/scrfd_10g_bnkps.onnx"},
        ],
    },
    "RegionalDetailer": {
        "label": "Face Detailer",
        # Our RegionalDetailer node is built-in (no repo to clone) — it just needs
        # the YOLO runtime + face model that Impact's Subpack would otherwise
        # provide. `pip` installs ultralytics WITH its deps (torch/numpy/opencv
        # restored afterward by _restore_critical). proof_nodes is our own node,
        # so `present` hinges on the face model existing on disk.
        # pi-heif: ultralytics monkey-patches PIL.Image.open and lazily pip-
        # installs pi-heif on the FIRST open of any unidentifiable file — which
        # targets the wrong interpreter and then retries forever, spamming the
        # log. Shipping it here puts it in the right venv so that never fires.
        "repos": [],
        "proof_nodes": ["PromptChain_RegionalDetailer"],
        "pip": ["ultralytics", "pi-heif"],
        "models": [
            {"url": "https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8n.pt",
             "dest": "ultralytics/bbox/face_yolov8n.pt"},
        ],
    },
    "Krea2HighDetail": {
        "label": "Krea 2 High Detail",
        # The High-Detail krea2 templates (t2i + i2i) need two packs: nova452's
        # ConditioningKrea2Rebalance (a cond amplifier) and spacepxl's VAE-Utils
        # (its VAEUtils_VAEDecodeTiled + CustomVAELoader run the clean 2x decode).
        # Neither has pip deps. VAE-Utils ships no model downloader, so we fetch
        # the spacepxl decoder weight into models/vae for CustomVAELoader to pick.
        "bundle": ["ComfyUI-ConditioningKrea2Rebalance", "ComfyUI-VAE-Utils"],
        "proof_nodes": ["ConditioningKrea2Rebalance", "VAEUtils_VAEDecodeTiled"],
        "models": [
            {"url": "https://huggingface.co/spacepxl/Wan2.1-VAE-upscale2x/resolve/main/Wan2.1_VAE_upscale2x_imageonly_real_v1.safetensors",
             "dest": "vae/Wan2.1_VAE_upscale2x_imageonly_real_v1.safetensors"},
        ],
    },
    "StyleReference": {
        "label": "Style Reference",
        # cubiq's IPAdapter pack is BUNDLED (bundled_packs/ComfyUI_IPAdapter_plus),
        # copied into custom_nodes/ on install only when absent — no clone. It ships
        # no model downloader; the UnifiedLoader finds weights by these EXACT
        # documented filenames. PLUS (high strength) SDXL preset = the vit-h adapter
        # + the ViT-H CLIP-Vision encoder (h94/IP-Adapter's image_encoder, renamed
        # per cubiq's README). Only the weights are fetched here.
        "bundle": ["ComfyUI_IPAdapter_plus"],
        "proof_nodes": ["IPAdapterUnifiedLoader", "IPAdapterAdvanced"],
        "models": [
            {"url": "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors",
             "dest": "ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors"},
            {"url": "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors",
             "dest": "clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"},
        ],
    },
    "Upscaler": {
        "label": "Upscaler",
        # UltimateSDUpscale is BUNDLED (bundled_packs/ComfyUI_UltimateSDUpscale —
        # our patched copy: gradio stubbed, the master.zip submodule fetch removed),
        # copied into custom_nodes/ on install only when absent. Only the UltraSharp
        # weight is fetched here.
        "bundle": ["ComfyUI_UltimateSDUpscale"],
        "proof_nodes": ["UltimateSDUpscale"],
        "models": [
            {"url": "https://huggingface.co/lokCX/4x-Ultrasharp/resolve/main/4x-UltraSharp.pth",
             "dest": "upscale_models/4x-UltraSharp.pth"},
        ],
    },
    "SeedVR2": {
        "label": "SeedVR2 Upscaler",
        # Dedicated restoration upscaler (ByteDance) — conservative single-pass
        # finish, no tiles/prompts. Only the small VAE is fetched here: the DiT
        # weights (6.8–16.5 GB depending on variant) auto-download from the
        # pack's own registry on first run, sha256-checked, into models/SEEDVR2.
        # Its requirements are all unpinned or floor-pinned; torch/numpy/opencv
        # lines fall to _PROTECTED.
        "bundle": ["ComfyUI-SeedVR2_VideoUpscaler"],
        "proof_nodes": ["SeedVR2VideoUpscaler"],
        "models": [
            {"url": "https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/ema_vae_fp16.safetensors",
             "dest": "SEEDVR2/ema_vae_fp16.safetensors"},
        ],
    },
    "FrameInterpolation": {
        "label": "Frame Interpolation (RIFE)",
        # RIFE neural frame interpolation for the viewer "Smooth" action (2x/3x
        # fps). Bundled (Fannovel16 ComfyUI-Frame-Interpolation, stripped to the
        # RIFE model only — the other interpolation models were unused and carried
        # unclear/non-commercial licenses). The rife49 weights auto-download from
        # the pack's own HF-mirrored registry on first run, so no model is fetched
        # here. pip adds einops (torch/numpy/opencv/torchvision fall to _PROTECTED).
        "bundle": ["ComfyUI-Frame-Interpolation"],
        "proof_nodes": ["RIFE VFI"],
        "pip": ["einops"],
        "models": [],
    },
    "ControlNet": {
        "label": "ControlNet",
        # Preprocessors are now NATIVE (vendor/pcr_cnaux + pcr_rtmpose, always
        # registered) — no comfyui_controlnet_aux clone. proof_nodes are our own,
        # so `present` hinges on the 3 SDXL ControlNet checkpoints on disk. pip
        # pulls onnxruntime (native pose) + scikit-image (native line-art cleanup);
        # the torch/numpy stack is restored afterward by _restore_critical.
        "repos": [],
        "proof_nodes": ["PromptChain_DepthAnything", "PromptChain_OpenPose"],
        "pip": ["onnxruntime", "scikit-image", "opencv-python-headless"],
        "models": [
            {"url": "https://huggingface.co/xinsir/controlnet-union-sdxl-1.0/resolve/main/diffusion_pytorch_model_promax.safetensors",
             "dest": "controlnet/xinsir-union-promax-sdxl.safetensors"},
            {"url": "https://huggingface.co/xinsir/controlnet-tile-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors",
             "dest": "controlnet/xinsir-tile-sdxl.safetensors"},
            {"url": "https://huggingface.co/TheMistoAI/MistoLine/resolve/main/mistoLine_rank256.safetensors",
             "dest": "controlnet/mistoLine_rank256.safetensors"},
        ],
    },
    "FluxControlNet": {
        "label": "Flux ControlNet",
        # Native preprocessors (no clone); only the checkpoint differs from SDXL.
        # Kept a separate entry so a Flux user fetches the one 4.28 GB Flux union
        # model instead of the SDXL checkpoints they can't use. Union-Pro-2.0
        # dropped the mode embedding, so it loads as a plain ControlNet (no
        # SetUnion). pip = onnxruntime for the native pose preprocessor.
        "repos": [],
        "proof_nodes": ["PromptChain_DepthAnything", "PromptChain_OpenPose"],
        "pip": ["onnxruntime", "opencv-python-headless"],
        "models": [
            {"url": "https://huggingface.co/Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0/resolve/main/diffusion_pytorch_model.safetensors",
             "dest": "controlnet/flux-union-pro2.safetensors"},
        ],
    },
    "ZImageControlNet": {
        "label": "Z-Image ControlNet",
        # Z-Image uses the DiffSynth model-patch path: ModelPatchLoader +
        # ZImageFunControlnet are CORE ComfyUI nodes (the inject checks they're
        # registered and tells the user to update ComfyUI if not). Preprocessors
        # are NATIVE (no clone). Only the model patch file is fetched here, into
        # models/model_patches/. This is the TURBO control model (step-distilled,
        # -8steps) — paired with the Z-Image Turbo DiT. Base needs the non-distilled
        # one (ZImageControlNetBase). pip = onnxruntime for the native pose preproc.
        "repos": [],
        "proof_nodes": ["PromptChain_DepthAnything", "PromptChain_OpenPose"],
        "pip": ["onnxruntime", "opencv-python-headless"],
        "models": [
            {"url": "https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors",
             "dest": "model_patches/z-image-turbo-fun-union-2.1.safetensors"},
        ],
    },
    "ZImageControlNetBase": {
        "label": "Z-Image ControlNet",
        # Non-distilled control model for the Z-Image BASE DiT (no -8steps). The
        # control models are NOT cross-compatible with Turbo's — match the patch's
        # distillation to the model family. Base runs ~30-50 steps / cfg 3-5.
        # Native preprocessors (no clone); pip = onnxruntime for native pose.
        "repos": [],
        "proof_nodes": ["PromptChain_DepthAnything", "PromptChain_OpenPose"],
        "pip": ["onnxruntime", "opencv-python-headless"],
        "models": [
            {"url": "https://huggingface.co/alibaba-pai/Z-Image-Fun-Controlnet-Union-2.1/resolve/main/Z-Image-Fun-Controlnet-Union-2.1.safetensors",
             "dest": "model_patches/z-image-base-fun-union-2.1.safetensors"},
        ],
    },
}


# ── deps protection (PIPFixer-lite) ────────────────────────────────
# A pack's requirements.txt can downgrade torch and break CUDA, or repin
# numpy/opencv and break everything else. We snapshot these before install
# and restore any that changed afterward — the high-value slice of Manager's
# PIPFixer.fix_broken(). torch/torchvision/torchaudio are restored together
# from the pytorch wheel index so the CUDA build stays matched.

_TORCH_TRIO = ("torch", "torchvision", "torchaudio")
_CRITICAL = (*_TORCH_TRIO, "numpy", "opencv-python")

# Known-bad requirement lines we rewrite before install (Manager's
# pip_overrides equivalent). Keyed by canonical package name. Seeded small;
# torch-pinning lines are dropped wholesale via _PROTECTED below instead.
_PIP_OVERRIDES: dict[str, str] = {
    # opencv GUI build conflicts with the headless one ComfyUI ships;
    # prefer headless so a pack can't pull in the GUI variant.
    "opencv-python": "opencv-python-headless",
}

# Requirement lines for these are dropped entirely — never let a pack repin
# the torch stack; we already protect/restore it. numpy is here too: a pack's
# `numpy<2` pin makes pip downgrade-cascade through opencv/onnx, and replacing
# a loaded cv2.pyd on Windows dies with WinError 5 mid-install (PuLID-Flux2
# burned the dev venv this way). ml_dtypes rides along — its old pins exist
# only to match numpy<2, which we refuse. opencv too: cv2 is already present
# (headless), and a pack's `opencv-python` line installs the GUI flavor on top
# of it — two packages owning one cv2 import, last-write-wins breakage.
_PROTECTED = _TORCH_TRIO + ("nvidia-", "numpy", "ml_dtypes", "opencv")

_REQ_NAME_RE = re.compile(r"^([A-Za-z0-9._-]+)")


def _pkg_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None
    except Exception:
        return None


def _req_pkg_name(line: str) -> str:
    """Pull the bare package name from a requirements line, lowercased."""
    m = _REQ_NAME_RE.match(line.strip())
    return (m.group(1) if m else "").lower()


def _custom_nodes_dir() -> Path:
    # core/ -> ComfyUI-PromptChain/ -> custom_nodes/
    return Path(__file__).resolve().parent.parent.parent


def _bundled_packs_dir() -> Path:
    # core/ -> ComfyUI-PromptChain/bundled_packs/ — node packs we ship and copy
    # into custom_nodes/ at install time (only when not already present).
    return Path(__file__).resolve().parent.parent / "bundled_packs"


def _models_dir() -> Path:
    import folder_paths
    return Path(folder_paths.models_dir)


def _resolve_model_dest(rel: str) -> Path | None:
    """Resolve an allowlist `dest` under the models dir, refusing any path
    that escapes it (defense in depth — dest is hardcoded, but a stray `..`
    must never write outside models/)."""
    root = _models_dir().resolve()
    final = (root / rel).resolve()
    try:
        final.relative_to(root)
    except ValueError:
        return None
    return final


def _repo_dir_name(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1].removesuffix(".git")


def _registered_node_types() -> set[str]:
    try:
        import nodes  # ComfyUI core
        return set(nodes.NODE_CLASS_MAPPINGS.keys())
    except Exception:
        return set()


def _pack_status(injectable: str) -> dict:
    spec = NODE_PACKS[injectable]
    registered = _registered_node_types()
    cn = _custom_nodes_dir()
    missing_nodes = [n for n in spec["proof_nodes"] if n not in registered]
    repos = []
    for url in spec.get("repos", []):
        name = _repo_dir_name(url)
        repos.append({"url": url, "dir": name, "cloned": (cn / name).is_dir()})
    for name in spec.get("bundle", []):
        repos.append({"url": "bundled with PromptChain", "dir": name, "cloned": (cn / name).is_dir()})
    md = _models_dir()
    missing_models = [m["dest"] for m in spec.get("models", []) if not (md / m["dest"]).exists()]
    return {
        "injectable": injectable,
        "label": spec["label"],
        "present": not missing_nodes and not missing_models,
        "missing_nodes": missing_nodes,
        "missing_models": missing_models,
        "repos": repos,
    }


@routes.get("/promptchain/nodepacks/status")
async def _api_nodepacks_status(request):
    injectable = (request.query.get("injectable") or "").strip()
    if injectable not in NODE_PACKS:
        return error_response(f"unknown injectable: {injectable}")
    status = _pack_status(injectable)
    # The in-app install modal installs through the unified section installer;
    # tell it which section this pack belongs to so it can scope the install to
    # this one member. Lazy import keeps the node_install_api <- install_sections
    # dependency one-directional (install_sections imports us at module load).
    try:
        from .install_sections import section_for_injectable
        status["section"] = section_for_injectable(injectable)
    except Exception:
        status["section"] = None
    return web.json_response(status)


# ── SSE install ────────────────────────────────────────────────────

async def _open_sse(request) -> web.StreamResponse:
    resp = web.StreamResponse(headers={
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })
    await resp.prepare(request)
    return resp


async def _send(resp: web.StreamResponse, obj: dict) -> None:
    await resp.write(b"data: " + json.dumps(obj).encode("utf-8") + b"\n\n")


async def _log(resp: web.StreamResponse, text: str) -> None:
    await _send(resp, {"line": text})


async def _run(resp: web.StreamResponse, args: list[str], cwd: str | None = None) -> int:
    """Run a subprocess, streaming stdout+stderr line by line as SSE log
    lines. Returns the exit code (or 1 on spawn failure)."""
    await _log(resp, f"$ {' '.join(args)}")
    try:
        proc = await asyncio.create_subprocess_exec(
            *args, cwd=cwd,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            stdin=asyncio.subprocess.DEVNULL,
        )
    except Exception as e:
        await _log(resp, f"  failed to launch: {e}")
        return 1
    assert proc.stdout is not None
    async for raw in proc.stdout:
        text = raw.decode("utf-8", "replace").rstrip()
        if text:
            await _log(resp, text)
    return await proc.wait()


# Single-file download cap — guards against a server reporting a bogus
# Content-Length that would otherwise fill the disk. 8 GiB covers the
# largest weight we fetch (the ~1.6 GB SDXL PuLID file) with headroom.
_MAX_MODEL_BYTES = 8 * 1024 ** 3
_DL_TIMEOUT = aiohttp.ClientTimeout(total=None, sock_connect=30, sock_read=120)


_DL_RETRIES = 5
# Transient network failures that a Range-resume retry can recover from. Large
# LFS files (multi-GB) routinely get cut mid-stream by the HF CDN.
_DL_TRANSIENT = (aiohttp.ClientError, asyncio.TimeoutError, ConnectionError)

# Cooperative cancel for the install flow: POST /promptchain/install/cancel sets
# this; _download checks it per chunk and the section loop checks it between
# members. Cleared at the start of each section install.
INSTALL_CANCEL = asyncio.Event()


async def _download(resp: web.StreamResponse, url: str, dest: Path) -> bool:
    """Stream a model file to dest, emitting download progress as SSE.
    Skips if already present; atomic via a .part temp. Resumes via HTTP Range
    and retries on transient drops so large (multi-GB) files survive a cut
    connection instead of restarting. Returns success."""
    if dest.exists():
        await _log(resp, f"{dest.name}: already present, skipping")
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    await _send(resp, {"stage": "download", "file": dest.name, "pct": 0})
    await _log(resp, f"downloading {dest.name}")

    last_err = None
    for attempt in range(_DL_RETRIES):
        existing = tmp.stat().st_size if tmp.exists() else 0
        headers = {"Range": f"bytes={existing}-"} if existing else {}
        try:
            async with aiohttp.ClientSession(timeout=_DL_TIMEOUT) as session:
                async with session.get(url, headers=headers) as r:
                    # 206 = server honoured our resume; 200 = full body (fresh,
                    # or server ignored Range — then we must restart from zero).
                    if existing and r.status == 206:
                        total = existing + int(r.headers.get("content-length", 0))
                        mode, done = "ab", existing
                    elif r.status == 200:
                        existing, done, mode = 0, 0, "wb"
                        total = int(r.headers.get("content-length", 0))
                    else:
                        await _send(resp, {"error": f"download failed for {dest.name}: HTTP {r.status}"})
                        return False
                    if total > _MAX_MODEL_BYTES:
                        await _send(resp, {"error": f"refusing {dest.name}: {total} bytes exceeds cap"})
                        return False
                    last_pct = -1
                    last_emit = 0.0
                    _loop = asyncio.get_running_loop()
                    t0 = _loop.time()
                    start_bytes = done
                    with open(tmp, mode) as f:
                        async for chunk in r.content.iter_chunked(1 << 20):
                            if INSTALL_CANCEL.is_set():
                                await _log(resp, f"{dest.name}: cancelled")
                                return False
                            f.write(chunk)
                            done += len(chunk)
                            if done > _MAX_MODEL_BYTES:
                                raise RuntimeError("exceeded size cap (server lied about Content-Length)")
                            now = _loop.time()
                            pct = int(done / total * 100) if total else 0
                            # emit per integer-percent OR every 0.3s, so the bar and
                            # the byte/sec rate stay live even on a slow large file
                            if pct != last_pct or now - last_emit >= 0.3:
                                last_pct = pct
                                last_emit = now
                                elapsed = now - t0
                                bps = int((done - start_bytes) / elapsed) if elapsed > 0 else 0
                                await _send(resp, {"stage": "download", "file": dest.name,
                                                   "pct": pct, "done": done, "total": total, "bps": bps})
            if total and tmp.stat().st_size != total:
                raise RuntimeError(f"incomplete ({tmp.stat().st_size}/{total} bytes)")
            tmp.replace(dest)
            await _log(resp, f"{dest.name}: done")
            return True
        except _DL_TRANSIENT as e:
            last_err = e
            if attempt < _DL_RETRIES - 1:
                got = tmp.stat().st_size if tmp.exists() else 0
                await _log(resp, f"{dest.name}: connection dropped ({type(e).__name__}), resuming from {got} bytes (attempt {attempt + 2}/{_DL_RETRIES})")
                continue
        except Exception as e:
            # Non-transient (cap, bad replace): drop the partial, it's unusable.
            last_err = e
            if tmp.exists():
                try:
                    tmp.unlink()
                except Exception:
                    pass
            await _send(resp, {"error": f"download failed for {dest.name}: {e}"})
            return False

    # Retries exhausted on transient errors — keep the .part so a re-run resumes.
    await _send(resp, {"error": f"download failed for {dest.name} after {_DL_RETRIES} attempts: {last_err}. Re-run install to resume."})
    return False


def _filtered_requirements(req_path: Path) -> tuple[list[str], list[str]]:
    """Read a requirements.txt, drop torch-stack lines, apply pip_overrides.
    Returns (kept_lines, notes)."""
    kept: list[str] = []
    notes: list[str] = []
    for raw in req_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        name = _req_pkg_name(line)
        if any(name.startswith(p) for p in _PROTECTED):
            notes.append(f"skipping protected dep: {line}")
            continue
        if name in _PIP_OVERRIDES:
            repl = _PIP_OVERRIDES[name]
            notes.append(f"override: {line} -> {repl}")
            kept.append(repl)
            continue
        kept.append(line)
    return kept, notes


def _torch_index_url() -> str | None:
    """Derive the pytorch wheel index from the installed torch local tag
    (e.g. '2.7.0+cu128' -> .../whl/cu128) so a restore keeps the CUDA build."""
    ver = _pkg_version("torch")
    if not ver or "+" not in ver:
        return None
    platform = ver.split("+", 1)[1]
    return f"https://download.pytorch.org/whl/{platform}"


async def _restore_critical(resp: web.StreamResponse, snapshot: dict[str, str | None]) -> None:
    """No-op. PromptChain no longer runs pip at runtime (the ComfyUI Registry
    forbids it), so the critical torch/numpy stack is never disturbed by an
    install and has nothing to restore. Kept for call-site/import compatibility."""
    return None


async def install_pack(resp: web.StreamResponse, injectable: str,
                       snapshot: dict[str, str | None]) -> bool:
    """Copy one injectable's bundled packs into custom_nodes/ and download its
    models, streaming progress on the already-open SSE `resp`. The caller owns
    the SSE lifecycle. Returns True on success; on failure it emits an
    {"error": …} event and returns False.

    Registry-compliant: PromptChain never runs pip or git at runtime — bundled
    packs are copied and their Python deps are declared in requirements.txt
    (installed with the pack). Every step skips work already done, so re-running
    or installing an overlapping section is cheap. `snapshot` is now unused."""
    spec = NODE_PACKS[injectable]
    bundles = spec.get("bundle", [])

    cn = _custom_nodes_dir()
    await _log(resp, f"Installing {spec['label']} ({len(bundles)} pack(s))")

    # Copy bundled packs straight out of PromptChain (no git, no network, no
    # pip). Only when absent — a copy the user already runs is never touched, so
    # a bundled pack can never collide with their own install.
    for name in bundles:
        src = _bundled_packs_dir() / name
        dest = cn / name
        await _send(resp, {"stage": "copy", "repo": name})
        if dest.is_dir():
            await _log(resp, f"{name}: already present, skipping copy")
        elif not src.is_dir():
            await _send(resp, {"error": f"bundled pack not found: {name}"})
            return False
        else:
            shutil.copytree(src, dest)
            await _log(resp, f"{name}: copied into custom_nodes")

    # Python deps are NOT pip-installed here — the ComfyUI Registry forbids a
    # node running pip at runtime. Every bundled pack's deps are declared in
    # PromptChain's own requirements.txt, installed WITH the pack by Manager/pip.

    models = spec.get("models") or []
    if models:
        await _send(resp, {"stage": "models", "count": len(models)})
        for m in models:
            dest = _resolve_model_dest(m["dest"])
            if dest is None:
                await _send(resp, {"error": f"refusing unsafe model path: {m['dest']}"})
                return False
            if not await _download(resp, m["url"], dest):
                return False

    return True


@routes.post("/promptchain/nodepacks/install")
async def _api_nodepacks_install(request):
    """SSE: install one injectable's packs (torch-protected) + models, then
    report status. A restart is required afterward for the nodes to register —
    the client drives that via /promptchain/system/restart."""
    body, err = await parse_json(request)
    if err:
        return err
    injectable = (body.get("injectable") or "").strip()
    if injectable not in NODE_PACKS:
        return error_response(f"unknown injectable: {injectable}")

    resp = await _open_sse(request)
    try:
        snapshot = {p: _pkg_version(p) for p in _CRITICAL}
        if await install_pack(resp, injectable, snapshot):
            await _log(resp, "Done. Restart ComfyUI to load the new nodes.")
            await _send(resp, {"done": True, "ok": True, "needs_restart": True})
    except ConnectionResetError:
        pass  # client navigated away; pip/git keep running
    except Exception as e:
        logger.warning("nodepack install failed", exc_info=True)
        try:
            await _send(resp, {"error": str(e)})
        except Exception:
            pass
    return resp
