# Viewer "Extend" support: from a finished VIDEO, pull its LAST frame (staged in
# the input dir for a LoadImage to consume) plus its dimensions/fps, and stage a
# content-addressed copy of the source video so the re-render can be recorded as
# a lineage CHILD (parent_filename). The frontend then rebuilds an I2V
# continuation graph (last frame -> next clip) the same way Re-pose rebuilds from
# a recipe template — see js/lib/extend-from-image.js.

import hashlib
import io as _io
import os

import folder_paths
import server
from aiohttp import web

from .api_utils import error_response
from .history_db import resolve_image_path

routes = server.PromptServer.instance.routes

# Same prefix Upscale uses: LoadImage's combo only lists top-level input files,
# so the namespace lives in the filename and the copy sits in the input ROOT.
_SRC_PREFIX = "promptchain_source_"
_VIDEO_EXTS = {".mp4", ".webm", ".mkv", ".mov", ".m4v", ".avi"}


def _staged_copy(raw: bytes, ext: str) -> str:
    """Content-addressed copy in the input root; same bytes -> same name, written
    once. Returns the bare filename for LoadImage / parent_filename."""
    digest = hashlib.sha256(raw).hexdigest()[:12]
    name = f"{_SRC_PREFIX}{digest}{ext}"
    dest = os.path.join(folder_paths.get_input_directory(), name)
    if not os.path.exists(dest):
        with open(dest, "wb") as f:
            f.write(raw)
    return name


def _last_frame_and_meta(video_bytes: bytes):
    """(PIL.Image last_frame, width, height, fps, frame_count). Decodes the whole
    stream — Wan clips are short (~81-121 frames) so a full pass is cheap and far
    more reliable than seeking to EOF."""
    import av  # PyAV (av) ships in the ComfyUI venv; powers the poster-frame path too

    last = None
    fps = 16.0
    count = 0
    container = av.open(_io.BytesIO(video_bytes))
    try:
        stream = container.streams.video[0]
        try:
            if stream.average_rate:
                fps = float(stream.average_rate)
        except Exception:
            fps = 16.0
        for frame in container.decode(stream):
            last = frame
            count += 1
    finally:
        container.close()
    if last is None:
        return None, 0, 0, fps, 0
    img = last.to_image().convert("RGB")
    w, h = img.size
    return img, w, h, fps, count


@routes.get("/promptchain/extend/prepare")
async def _api_extend_prepare(request):
    """Stage the source video's last frame + a lineage copy. ?hash=<image hash>."""
    image_hash = request.query.get("hash", "").strip()
    if not image_hash:
        return error_response("need hash")
    path = resolve_image_path(image_hash)
    if not path or not os.path.isfile(str(path)):
        return error_response("video not found for hash", 404)
    path = str(path)
    if os.path.splitext(path)[1].lower() not in _VIDEO_EXTS:
        return error_response("not a video file")

    try:
        with open(path, "rb") as f:
            video_bytes = f.read()
    except OSError as e:
        return error_response(f"could not read video: {e}", 500)

    try:
        import av  # noqa: F401
    except Exception:
        return error_response("PyAV (av) not available — cannot read video frames", 500)

    try:
        source_ref = _staged_copy(video_bytes, os.path.splitext(path)[1].lower())
        img, width, height, fps, count = _last_frame_and_meta(video_bytes)
        if img is None:
            return error_response("could not decode any video frame", 500)
        buf = _io.BytesIO()
        img.save(buf, format="PNG")
        last_frame = _staged_copy(buf.getvalue(), ".png")
    except Exception as e:
        return error_response(f"extend prepare failed: {e}", 500)

    return web.json_response({
        "last_frame": last_frame,
        "source_ref": source_ref,
        "width": width,
        "height": height,
        "fps": round(fps, 3),
        "frame_count": count,
    })
