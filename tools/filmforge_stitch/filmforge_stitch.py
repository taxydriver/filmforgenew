import os, tempfile
import re
import json
import glob
import subprocess
from typing import List, Tuple

# -------- CONFIG DEFAULTS (overridable via node inputs) --------
DEFAULT_VIDEO_DIR = os.environ.get("COMFY_VIDEO_DIR", "/workspace/ComfyUI/output/video")
DEFAULT_AUDIO_DIR = os.environ.get("COMFY_AUDIO_DIR", "/workspace/ComfyUI/output/audio")
DEFAULT_DEST_DIR  = os.environ.get("TRAILER_DEST_DIR", "/workspace/trailer_output")
DEFAULT_DEST_NAME = os.environ.get("TRAILER_DEST_NAME", "trailer_final.mp4")
DEFAULT_FFMPEG    = os.environ.get("FFMPEG_PATH", "ffmpeg")
DEFAULT_SCRIPT    = os.environ.get("STITCH_SCRIPT_PATH", "/workspace/stitch_trailer.sh")  # optional

# NEW: search in both Comfy video dir and trailer_output by default
DEFAULT_VIDEO_DIRS = [
    DEFAULT_VIDEO_DIR,
    DEFAULT_DEST_DIR,  # contains wan_* clips in your setup
]

def _natural_key(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

def _list_sorted(dirpath: str, exts: List[str]) -> List[str]:
    if not os.path.isdir(dirpath):
        return []
    names = [n for n in os.listdir(dirpath) if any(n.lower().endswith(f".{e.lower()}") for e in exts)]
    names.sort(key=_natural_key)
    return names

def _latest_by_prefix(dirpath: str, prefix: str, exts: List[str]) -> str | None:
    names = _list_sorted(dirpath, exts)
    rx = re.compile(rf"^{re.escape(prefix)}.*\.({'|'.join([re.escape(e) for e in exts])})$", re.IGNORECASE)
    matches = [n for n in names if rx.match(n)]
    if not matches:
        return None
    return os.path.join(dirpath, matches[-1])

def _latest_by_prefix_any(prefix: str, exts: List[str], video_dirs: List[str]) -> str | None:
    # first try exact "{prefix}_00001_.mp4" (most common pattern)
    candidates = []
    for d in video_dirs:
        candidates.append(os.path.join(d, f"{prefix}_00001_.mp4"))
    for c in candidates:
        if os.path.isfile(c):
            return c
    # then try "latest by prefix" in each dir
    for d in video_dirs:
        f = _latest_by_prefix(d, prefix, exts)
        if f:
            return f
    return None

def _latest_any(dirpath: str, exts: List[str]) -> str | None:
    names = _list_sorted(dirpath, exts)
    if not names:
        return None
    return os.path.join(dirpath, names[-1])

def _run(cmd: List[str]) -> None:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or f"Command failed: {' '.join(cmd)}")

def _ffmpeg_concat_copy(ffmpeg: str, list_file: str, out_path: str) -> bool:
    try:
        _run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", out_path])
        return True
    except Exception:
        return False

def _ffmpeg_concat_reencode(ffmpeg: str, list_file: str, out_path: str, fps: int, scale: str) -> None:
    if scale.lower() == "keep":
        vf = f"fps={fps},format=yuv420p"
    else:
        vf = f"fps={fps},scale={scale}:force_original_aspect_ratio=decrease,pad={scale}:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
    _run([
        ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_file,
        "-vf", vf, "-r", str(fps),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-an", out_path
    ])

def _ffmpeg_mux_audio(ffmpeg: str, video_path: str, audio_path: str, out_path: str, music_gain_db: float) -> None:
    _run([
        ffmpeg, "-y",
        "-i", video_path,  # 0
        "-i", audio_path,  # 1
        "-filter:a:1", f"volume={music_gain_db}dB",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        out_path
    ])

class FilmforgeStitchNode:
    """
    Stitch WAN video clips (by prefixes OR full filenames) and attach audio into one trailer file.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prefixes_json": ("STRING", {
                    "default": "[]",
                    "multiline": True,
                    "placeholder": '["wan_2025-11-05_shot_01","wan_2025-11-05_shot_02"] or ["wan_..._shot_01_00001_.mp4"]'
                }),
            },
            "optional": {
                "video_dir": ("STRING", {"default": DEFAULT_VIDEO_DIR}),  # kept for backward compat
                "video_dirs_json": ("STRING", {"default": json.dumps(DEFAULT_VIDEO_DIRS)}),  # NEW
                "audio_dir": ("STRING", {"default": DEFAULT_AUDIO_DIR}),
                "dest_dir":  ("STRING", {"default": DEFAULT_DEST_DIR}),
                "dest_name": ("STRING", {"default": DEFAULT_DEST_NAME}),
                "audio_prefixes_json": ("STRING", {"default": "[]"}),
                "fallback_latest_audio": ("BOOLEAN", {"default": True}),
                "music_gain_db": ("FLOAT", {"default": -8.0, "min": -24, "max": 6, "step": 0.5}),
                "fps": ("INT", {"default": 24, "min": 1, "max": 120}),
                "scale": ("STRING", {"default": "1920:1080"}),  # or "keep"
                "use_shell_script": ("BOOLEAN", {"default": False}),
                "shell_script_path": ("STRING", {"default": DEFAULT_SCRIPT}),
                "glob_override": ("STRING", {"default": ""}),
                "audio_override": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")  # (final_path, debug_info)
    RETURN_NAMES = ("final_path", "debug")
    FUNCTION = "stitch"
    CATEGORY = "Filmforge/IO"
    OUTPUT_NODE = True

    def stitch(self,
               prefixes_json: str,
               video_dir: str = DEFAULT_VIDEO_DIR,
               video_dirs_json: str = json.dumps(DEFAULT_VIDEO_DIRS),
               audio_dir: str = DEFAULT_AUDIO_DIR,
               dest_dir: str = DEFAULT_DEST_DIR,
               dest_name: str = DEFAULT_DEST_NAME,
               audio_prefixes_json: str = "[]",
               fallback_latest_audio: bool = True,
               music_gain_db: float = -8.0,
               fps: int = 24,
               scale: str = "1920:1080",
               use_shell_script: bool = False,
               shell_script_path: str = DEFAULT_SCRIPT,
               glob_override: str = "",
               audio_override: str = ""
               ) -> Tuple[str, str]:

        # Parse multi-dirs (NEW)
        try:
            video_dirs = json.loads(video_dirs_json) if video_dirs_json.strip() else []
            if not isinstance(video_dirs, list):
                video_dirs = [video_dir]
        except Exception:
            video_dirs = [video_dir]

        # Parse prefixes / filenames
        try:
            items = json.loads(prefixes_json) if prefixes_json.strip() else []
            items = [p for p in items if isinstance(p, str) and p.strip()]
        except Exception:
            items = []

        try:
            audio_prefixes = json.loads(audio_prefixes_json) if audio_prefixes_json.strip() else []
            audio_prefixes = [p for p in audio_prefixes if isinstance(p, str) and p.strip()]
        except Exception:
            audio_prefixes = []

        os.makedirs(dest_dir, exist_ok=True)
        final_path = os.path.join(dest_dir, dest_name)

        debug = {
            "video_dirs": video_dirs,
            "audio_dir": audio_dir,
            "dest_dir": dest_dir,
            "dest_name": dest_name,
            "items": items,
            "audio_prefixes": audio_prefixes,
            "ffmpeg": DEFAULT_FFMPEG,
            "use_shell_script": use_shell_script,
        }

        # Shell script path (unchanged)
        if use_shell_script:
            if not glob_override:
                glob_override = os.path.join(dest_dir, "shot_*.mp4")
            if not audio_override:
                audio_override = os.path.join(dest_dir, "trailer_audio.wav")
            cmd = [shell_script_path, dest_dir, glob_override, audio_override, final_path]
            debug["shell_cmd"] = " ".join(cmd)
            _run(cmd if shell_script_path.endswith(".sh") else ["bash", "-lc", " ".join(cmd)])
            return (final_path, json.dumps(debug, indent=2))

        # Resolve videos: support **full filenames** OR **prefixes**
        video_exts = ["mp4", "mov", "mkv"]
        resolved: List[str] = []
        for it in items:
            is_file_like = it.lower().endswith(tuple(f".{e}" for e in video_exts))
            if is_file_like:
                # absolute or relative: try as-is, then within each video_dir
                if os.path.isfile(it):
                    resolved.append(os.path.abspath(it))
                    continue
                found = None
                for d in video_dirs:
                    cand = os.path.join(d, it)
                    if os.path.isfile(cand):
                        found = cand
                        break
                if not found:
                    raise RuntimeError(f'Video file "{it}" not found in any: {video_dirs}')
                resolved.append(found)
            else:
                # treat as prefix
                f = _latest_by_prefix_any(it, video_exts, video_dirs)
                if not f:
                    raise RuntimeError(f'No video found for prefix "{it}" in any: {video_dirs}')
                resolved.append(f)
        debug["resolved_clips"] = resolved

        # Resolve audio
        audio_exts = ["wav", "mp3", "m4a", "ogg"]
        audio_file = None
        for ap in audio_prefixes:
            f = _latest_by_prefix(audio_dir, ap, audio_exts)
            if f:
                audio_file = f
                break
        if not audio_file and fallback_latest_audio:
            audio_file = _latest_any(audio_dir, audio_exts)
        debug["audio_file"] = audio_file

        # Concat + attach audio
        with tempfile.TemporaryDirectory() as td:
            list_path = os.path.join(td, "concat.txt")
            with open(list_path, "w", encoding="utf-8", newline="\n") as f:
                for pth in resolved:
                    abs_p = os.path.abspath(pth)
                    esc = abs_p.replace("'", "'\\''")
                    f.write("file '" + esc + "'\n")

            fast_out = os.path.join(td, "concat_fast.mp4")
            reenc_out = os.path.join(td, "concat_reenc.mp4")
            mux_out   = os.path.join(td, "mux.mp4")

            merged = fast_out
            if not _ffmpeg_concat_copy(DEFAULT_FFMPEG, list_path, fast_out):
                _ffmpeg_concat_reencode(DEFAULT_FFMPEG, list_path, reenc_out, fps=fps, scale=scale)
                merged = reenc_out

            out_src = merged
            if audio_file:
                _ffmpeg_mux_audio(DEFAULT_FFMPEG, merged, audio_file, mux_out, music_gain_db)
                out_src = mux_out

            _run([DEFAULT_FFMPEG, "-y", "-i", out_src, "-c", "copy", final_path])

        return (final_path, json.dumps(debug, indent=2))


NODE_CLASS_MAPPINGS = {
    "FilmforgeStitch": FilmforgeStitchNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FilmforgeStitch": "Filmforge: Stitch Trailer"
}