import logging
import os
import tempfile
import threading
from pathlib import Path

from PIL import Image

from .history_db import resolve_image_path, get_data_dir

MAX_WIDTH = 600
QUALITY = 85

# Single-writer per hash within this process. The /generation POST generates a
# thumb on its own to_thread worker AFTER committing the DB row, and any
# concurrent GET /thumb (the sidebar workflow-cover especially) resolves that
# committed row and generates the SAME thumb on another worker — both miss the
# is_file() guard in the post-commit/pre-thumb window. The atomic publish below
# is the correctness guarantee against torn reads; this lock just collapses the
# redundant decode+resize. threading.Lock (not asyncio) — runs in worker threads.
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(image_hash: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(image_hash, threading.Lock())

# Video outputs (Wan/AnimateDiff/…) get recorded like images. PIL can't open
# them, so thumbnail the first decoded frame instead — and never hand a video
# to Image.open (ultralytics' global PIL patch turns that miss into a noisy,
# offline-failing pi_heif auto-install attempt).
VIDEO_SUFFIXES = {".mp4", ".webm", ".mkv", ".mov", ".m4v"}


def _get_thumbs_dir() -> Path:
    return get_data_dir() / "thumbs"


def _first_video_frame(source: Path) -> "Image.Image | None":
    """Decode a video's first frame as a poster image, or None if it can't."""
    try:
        import av
    except ImportError:
        return None
    try:
        with av.open(str(source)) as container:
            stream = next((s for s in container.streams if s.type == "video"), None)
            if stream is None:
                return None
            for frame in container.decode(stream):
                return frame.to_image()
    except Exception:
        logging.debug("[PromptChain] could not decode video poster for %s",
                      source, exc_info=True)
    return None


def _load_poster(source: Path) -> "Image.Image | None":
    """A still PIL image to thumbnail from: the first frame for video, the file
    itself for images. Fully loaded and detached so the source handle closes."""
    if source.suffix.lower() in VIDEO_SUFFIXES:
        return _first_video_frame(source)
    with Image.open(source) as im:
        im.load()
        return im.copy()


def get_or_create_thumbnail(image_hash: str) -> Path | None:
    thumbs_dir = _get_thumbs_dir()
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumbs_dir / f"{image_hash}.webp"

    if thumb_path.is_file():
        return thumb_path

    with _lock_for(image_hash):
        # another worker may have published while we waited on the lock
        if thumb_path.is_file():
            return thumb_path

        source = resolve_image_path(image_hash)
        if not source or not source.is_file():
            return None

        try:
            img = _load_poster(source)
            if img is None:
                return None

            if img.mode in ("RGBA", "LA", "P", "PA"):
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            if img.width > MAX_WIDTH:
                ratio = MAX_WIDTH / img.width
                img = img.resize((MAX_WIDTH, round(img.height * ratio)), Image.LANCZOS)

            # Atomic publish: a concurrent GET /thumb must never FileResponse a
            # half-written webp (PIL opens the path 'wb' = truncate-then-stream).
            # Encode into a sibling temp file (same dir → same volume → os.replace
            # is atomic) and swap it onto the final path in one indivisible step.
            fd, tmp_name = tempfile.mkstemp(
                dir=str(thumbs_dir), prefix=f".{image_hash}.", suffix=".webp.tmp"
            )
            try:
                with os.fdopen(fd, "wb") as f:
                    img.save(f, format="WEBP", quality=QUALITY)
                os.replace(tmp_name, thumb_path)
            except PermissionError:
                # Windows can refuse os.replace if the destination is open by a
                # reader. The thumb is content-addressed, so if it now exists a
                # peer already published identical bytes — accept that and drop
                # our temp; otherwise report a clean miss.
                try:
                    os.unlink(tmp_name)
                except OSError:
                    pass
                return thumb_path if thumb_path.is_file() else None
            except BaseException:
                try:
                    os.unlink(tmp_name)
                except OSError:
                    pass
                raise
            return thumb_path
        except Exception:
            logging.exception("[PromptChain] thumbnail generation failed for %s", image_hash)
            return None
