# AI selection for the layered editor.
#
# "Select Subject": BiRefNet (the current salient-object/DIS SOTA,
# MIT-licensed — the same model class behind Photoshop's one-click Select
# Subject) segments the posted composite and returns the raw sigmoid output
# as a grayscale PNG. The matte is SOFT on purpose: hair/fabric edges carry
# partial alpha, so the editor applies it directly as selection-mask alpha
# without thresholding. Weights (~0.9GB) download into the HuggingFace cache
# on the first request; the model then stays resident (~0.5GB FP16).
#
# "Select Object" (click-to-select): SAM2 point prompt via ultralytics
# (already installed for RegionalDetailer; sam2.1_b.pt ~154MB auto-download).
# The encoder result is cached per image hash, so successive clicks on the
# same composite only run the prompt decoder (~25ms).

import asyncio
import hashlib
import io as _io
import logging
import threading

import server
from aiohttp import web
from PIL import Image

from .api_utils import error_response

routes = server.PromptServer.instance.routes
log = logging.getLogger("promptchain")

BIREFNET_ID = "ZhengPeng7/BiRefNet"
INFER_SIZE = 1024  # BiRefNet's native training resolution

_model = None
_device = None
# One segmentation at a time: the lock serializes both the lazy first-load
# (two concurrent loads would download/initialize twice) and GPU inference.
_lock = threading.Lock()


def _get_model():
    global _model, _device
    if _model is None:
        import torch
        from transformers import AutoModelForImageSegmentation

        log.info("[SelectSubject] loading %s (first call downloads ~0.9GB)", BIREFNET_ID)
        try:
            model = AutoModelForImageSegmentation.from_pretrained(
                BIREFNET_ID, trust_remote_code=True)
        except Exception as exc:
            raise RuntimeError(
                f"Couldn't load the BiRefNet selection model. On first use it "
                f"downloads ~0.9GB — check your internet connection, or pre-install "
                f"it from Settings → PromptChain → Features (AI Selection). "
                f"[{type(exc).__name__}: {exc}]"
            ) from exc
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        model = model.to(_device).eval()
        if _device == "cuda":
            model = model.half()
        _model = model
        log.info("[SelectSubject] model ready on %s", _device)
    return _model


def _subject_mask(img: Image.Image) -> Image.Image:
    import torch
    from torchvision import transforms

    with _lock:
        model = _get_model()
        prep = transforms.Compose([
            transforms.Resize((INFER_SIZE, INFER_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        inp = prep(img.convert("RGB")).unsqueeze(0).to(_device)
        if _device == "cuda":
            inp = inp.half()
        with torch.no_grad():
            pred = model(inp)[-1].sigmoid().cpu()
    mask = transforms.ToPILImage()(pred[0].squeeze().float())
    return mask.resize(img.size, Image.BILINEAR)


@routes.post("/promptchain/select-subject")
async def select_subject(request):
    form = await request.post()
    upload = form.get("image")
    if upload is None or not getattr(upload, "file", None):
        return error_response("missing image upload")
    raw = upload.file.read()
    if not raw:
        return error_response("empty image upload")
    try:
        img = Image.open(_io.BytesIO(raw))
        img.load()
    except OSError:
        return error_response("could not decode image")

    try:
        mask = await asyncio.to_thread(_subject_mask, img)
    except Exception as e:  # model load/download/inference — surface the cause
        log.exception("[SelectSubject] segmentation failed")
        return error_response(f"subject segmentation failed: {e}", 500)

    buf = _io.BytesIO()
    mask.save(buf, format="PNG")
    return web.Response(body=buf.getvalue(), content_type="image/png")


# ── click-to-select (SAM2 point prompt) ──

SAM_MODEL = "sam2.1_b.pt"
_sam = None            # SAM2Predictor, loaded once
_sam_image_key = None  # sha1 of the image the cached encoder features belong to
_sam_lock = threading.Lock()


def _sam_weights_path() -> str:
    """models/sam/<weights> — ultralytics otherwise drops the download into the
    process cwd (the ComfyUI root)."""
    import os
    import shutil

    import folder_paths

    sam_dir = os.path.join(folder_paths.models_dir, "sam")
    os.makedirs(sam_dir, exist_ok=True)
    path = os.path.join(sam_dir, SAM_MODEL)
    if not os.path.isfile(path):
        from ultralytics.utils.downloads import attempt_download_asset

        log.info("[SelectObject] downloading %s (~154MB)", SAM_MODEL)
        try:
            downloaded = attempt_download_asset(SAM_MODEL)  # lands relative to cwd
            shutil.move(str(downloaded), path)
        except Exception as exc:
            # Clean a partial drop in cwd so a retry starts fresh, then surface a
            # clear message instead of a raw ultralytics/network traceback.
            stray = os.path.join(os.getcwd(), SAM_MODEL)
            if os.path.isfile(stray):
                try:
                    os.remove(stray)
                except OSError:
                    pass
            raise RuntimeError(
                f"Couldn't download the SAM2 selection model ({SAM_MODEL}, ~154MB). "
                f"Check your internet connection and try again. "
                f"[{type(exc).__name__}: {exc}]"
            ) from exc
    return path


def _get_sam():
    global _sam
    if _sam is None:
        from ultralytics.models.sam import SAM2Predictor

        _sam = SAM2Predictor(overrides=dict(
            conf=0.25, task="segment", mode="predict", model=_sam_weights_path(),
            imgsz=1024, save=False, verbose=False))
        log.info("[SelectObject] predictor ready")
    return _sam


def _object_mask(img: Image.Image, x: int, y: int) -> Image.Image:
    """One positive point → the WHOLE object under it.

    SAM2's three multimask granularities (sub-part / part / whole) come with an
    unreliable score head (the whole-figure mask measured 0.012 vs 0.766 for a
    foot), so the pick is by AREA — Photoshop's Object Selection bias — then
    cleaned to the connected component containing the click.
    """
    import cv2
    import numpy as np
    import torch
    from ultralytics.utils import ops

    rgb = np.asarray(img.convert("RGB"))
    h, w = rgb.shape[:2]
    x = max(0, min(w - 1, int(x)))
    y = max(0, min(h - 1, int(y)))

    with _sam_lock:
        global _sam_image_key
        sam = _get_sam()
        key = hashlib.sha1(rgb.tobytes()).hexdigest()
        if key != _sam_image_key:
            sam.set_image(rgb)
            _sam_image_key = key
        with torch.no_grad():
            points, labels, _ = sam._prepare_prompts((1024, 1024), (h, w), None, [[x, y]], [1], None)
            pred_masks, _scores = sam._inference_features(
                sam.features, points, labels, None, multimask_output=True)
        full = ops.scale_masks(pred_masks[None].float(), (h, w), padding=False)[0]
        binaries = (full > 0).cpu().numpy().astype(np.uint8)

    best = max(range(len(binaries)), key=lambda i: int(binaries[i].sum()))
    mask = binaries[best]
    # Drop disconnected speckle: keep the component under the click (fall back
    # to the largest one when the click sits in a hole of the winning mask).
    n, lab = cv2.connectedComponents(mask, connectivity=8)
    if n > 2:
        target = lab[y, x]
        if target == 0:
            counts = np.bincount(lab.ravel())
            counts[0] = 0
            target = int(counts.argmax())
        mask = (lab == target).astype(np.uint8)
    elif mask[y, x] == 0 and n == 2:
        mask = (lab == 1).astype(np.uint8)
    return Image.fromarray(mask * 255, "L")


@routes.post("/promptchain/select-object")
async def select_object(request):
    form = await request.post()
    upload = form.get("image")
    if upload is None or not getattr(upload, "file", None):
        return error_response("missing image upload")
    raw = upload.file.read()
    if not raw:
        return error_response("empty image upload")
    try:
        x = int(float(form.get("x", "")))
        y = int(float(form.get("y", "")))
    except ValueError:
        return error_response("missing click coordinates")
    try:
        img = Image.open(_io.BytesIO(raw))
        img.load()
    except OSError:
        return error_response("could not decode image")

    try:
        mask = await asyncio.to_thread(_object_mask, img, x, y)
    except Exception as e:
        log.exception("[SelectObject] segmentation failed")
        return error_response(f"object segmentation failed: {e}", 500)

    buf = _io.BytesIO()
    mask.save(buf, format="PNG")
    return web.Response(body=buf.getvalue(), content_type="image/png")


# ── install / status ──────────────────────────────────────────────
# BiRefNet/SAM2 aren't ComfyUI nodes, so they can't use node_install_api's
# proof_nodes gate — they're our own routes backed by pip libs (transformers /
# ultralytics) + model files. These routes give selection the same first-use
# installer (with progress) and Full-Install coverage every other 3rd-party
# feature has, instead of a silent multi-GB download or a raw import error.
import importlib.util as _ilu
import sys as _sys

from .node_install_api import (
    _CRITICAL, _log, _open_sse, _pkg_version, _restore_critical, _run, _send,
)


def _have(mod: str) -> bool:
    try:
        return _ilu.find_spec(mod) is not None
    except (ImportError, ValueError):
        return False


def _birefnet_cached() -> bool:
    """BiRefNet downloads into the HuggingFace hub cache (not models/), so probe
    the cache dir rather than a single file path."""
    try:
        import os
        from huggingface_hub.constants import HF_HUB_CACHE
        snaps = os.path.join(HF_HUB_CACHE, "models--" + BIREFNET_ID.replace("/", "--"), "snapshots")
        return os.path.isdir(snaps) and any(os.scandir(snaps))
    except Exception:
        return False


def _sam_cached() -> bool:
    try:
        import os
        import folder_paths
        return os.path.isfile(os.path.join(folder_paths.models_dir, "sam", SAM_MODEL))
    except Exception:
        return False


def _subject_status() -> dict:
    deps, model = _have("transformers") and _have("torchvision"), _birefnet_cached()
    return {"ready": deps and model, "deps_ok": deps, "model_ok": model,
            "label": "Select Subject (BiRefNet)", "size": "~0.9 GB"}


def _object_status() -> dict:
    deps, model = _have("ultralytics"), _sam_cached()
    return {"ready": deps and model, "deps_ok": deps, "model_ok": model,
            "label": "Object Select (SAM2)", "size": "~154 MB"}


@routes.get("/promptchain/subject/status")
async def subject_status(request):
    which = (request.query.get("which") or "").strip()
    out = {"subject": _subject_status(), "object": _object_status()}
    if which in out:
        return web.json_response(out[which])
    out["ready"] = out["subject"]["ready"] and out["object"]["ready"]
    return web.json_response(out)


# (_pip_install removed — PromptChain declares its deps in requirements.txt and
# never runs pip at runtime; missing packages are surfaced to the user instead.)


def _download_birefnet():
    # snapshot_download fetches the repo (weights + remote code) WITHOUT loading
    # the model onto the GPU — first real use does the load.
    from huggingface_hub import snapshot_download
    try:
        snapshot_download(BIREFNET_ID)
    except Exception as exc:
        raise RuntimeError(
            f"Couldn't download the BiRefNet selection model (~0.9GB) from Hugging "
            f"Face. Check your internet connection and try again. "
            f"[{type(exc).__name__}: {exc}]"
        ) from exc


async def install_subject_target(resp, target: str, snapshot: dict) -> bool:
    """Install one AI-selection target (pip deps + model) on the open SSE `resp`,
    skipping anything already present. Returns True on success / already-ready.
    Shared by the /subject/install route and the section installer; the caller
    owns the SSE lifecycle, the snapshot, and the final _restore_critical."""
    if target == "subject":
        miss = [m for m in ("transformers",) if not _have(m)]
        if miss:
            await _send(resp, {"error": f"missing package(s): {', '.join(miss)}. Run `pip install -r requirements.txt` for PromptChain (or reinstall it via Manager) and restart."})
            return False
        if not _birefnet_cached():
            await _send(resp, {"stage": "download", "file": "BiRefNet (~0.9GB)", "pct": 0})
            await _log(resp, "Downloading BiRefNet weights (~0.9GB)…")
            await asyncio.to_thread(_download_birefnet)
        return True
    if target == "object":
        miss = [m for m in ("ultralytics",) if not _have(m)]
        if miss:
            await _send(resp, {"error": f"missing package(s): {', '.join(miss)}. Run `pip install -r requirements.txt` for PromptChain (or reinstall it via Manager) and restart."})
            return False
        if not _sam_cached():
            await _send(resp, {"stage": "download", "file": "SAM2 (~154MB)", "pct": 0})
            await _log(resp, "Downloading SAM2 weights (~154MB)…")
            await asyncio.to_thread(_sam_weights_path)
        return True
    await _send(resp, {"error": f"unknown selection target: {target}"})
    return False


@routes.post("/promptchain/subject/install")
async def subject_install(request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    which = (body.get("which") or "both").strip()
    targets = ["subject", "object"] if which == "both" else [which]
    resp = await _open_sse(request)
    snapshot = {p: _pkg_version(p) for p in _CRITICAL}
    try:
        for t in targets:
            if not await install_subject_target(resp, t, snapshot):
                return resp
        await _restore_critical(resp, snapshot)
        # pip libs import at call time, so the next select request picks them up
        # without a restart.
        await _send(resp, {"done": True, "ok": True, "needs_restart": False})
    except ConnectionResetError:
        pass  # client navigated away; pip/download keep running
    except Exception as e:
        log.exception("[subject/install] failed")
        await _restore_critical(resp, snapshot)
        try:
            await _send(resp, {"error": str(e)})
        except Exception:
            pass
    return resp
