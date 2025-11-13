#!/usr/bin/env bash
set -euo pipefail

# --- Usage ---
# ./stitch_trailer.sh /workspace/trailer_output "/workspace/trailer_output/shot_*.mp4" /workspace/trailer_output/trailer_audio.wav /workspace/trailer_output/trailer_final.mp4
#
# Options via env vars:
#   FPS=24            # target fps
#   SCALE=1920:1080   # target resolution (use "keep" to skip scaling)
#   CROSSFADE=0       # seconds of crossfade between clips (0 = hard cuts)
#   NORMALIZE=1       # 1=EBU R128 normalize audio, 0=skip
#   AUDIO_GAIN=0      # optional dB gain after normalize (e.g., -3 or 2)
#
# Example:
#   FPS=24 SCALE=1920:1080 CROSSFADE=0.8 NORMALIZE=1 ./stitch_trailer.sh /workspace/trailer_output "/workspace/trailer_output/shot_*.mp4" /workspace/trailer_output/trailer_audio.wav /workspace/trailer_output/trailer_final.mp4

OUTDIR="${1:-}"
VIDEO_GLOB="${2:-}"
AUDIO_FILE="${3:-}"
OUTPUT_MP4="${4:-}"

if [[ -z "$OUTDIR" || -z "$VIDEO_GLOB" || -z "$AUDIO_FILE" || -z "$OUTPUT_MP4" ]]; then
  echo "Usage: $0 <outdir> <video_glob> <audio_file> <output_mp4>"
  exit 1
fi

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found. Install it first (e.g., apt-get update && apt-get install -y ffmpeg)"; exit 1; }

mkdir -p "$OUTDIR/.stitch_tmp"
TMP="$OUTDIR/.stitch_tmp"
rm -f "$TMP"/*

# Defaults
FPS="${FPS:-24}"
SCALE="${SCALE:-1920:1080}"
CROSSFADE="${CROSSFADE:-0}"
NORMALIZE="${NORMALIZE:-1}"
AUDIO_GAIN="${AUDIO_GAIN:-0}"

# --- Auto-detect all shot_*.mp4 files if none explicitly given ---
shopt -s nullglob
mapfile -t CLIPS < <(ls -1 /workspace/trailer_output/*shot_*.mp4 2>/dev/null | sort -V)
shopt -u nullglob


if [[ ${#CLIPS[@]} -eq 0 ]]; then
  echo "No clips found for glob: $VIDEO_GLOB"
  exit 1
fi

if [[ ! -f "$AUDIO_FILE" ]]; then
  echo "Audio file not found: $AUDIO_FILE"
  exit 1
fi

echo "Found ${#CLIPS[@]} clips:"
printf '  - %s\n' "${CLIPS[@]}"

# 1) Try FAST concat first (no re-encode)
printf "" > "$TMP/files.txt"
for f in "${CLIPS[@]}"; do
  printf "file '%s'\n" "$f" >> "$TMP/files.txt"
done

FAST_MERGED="$TMP/merged_fast.mp4"
set +e
ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$TMP/files.txt" -c copy "$FAST_MERGED"
FAST_STATUS=$?
set -e

if [[ $FAST_STATUS -eq 0 ]]; then
  echo "Fast concat OK."
  MERGED="$FAST_MERGED"
else
  echo "Fast concat failed. Re-encoding clips to uniform settings…"
  # 2) Re-encode each clip to uniform H.264 + yuv420p, target FPS/res
  IDX=0
  UNIFORM_LIST="$TMP/uniform_files.txt"
  : > "$UNIFORM_LIST"

  for f in "${CLIPS[@]}"; do
    U="$TMP/u_$(printf "%03d" $IDX).mp4"
    if [[ "$SCALE" == "keep" ]]; then
      ffmpeg -y -hide_banner -loglevel error -i "$f" -r "$FPS" -pix_fmt yuv420p -c:v libx264 -preset veryfast -crf 18 -an "$U"
    else
      ffmpeg -y -hide_banner -loglevel error -i "$f" -r "$FPS" -vf "scale=$SCALE:force_original_aspect_ratio=decrease,pad=$SCALE:(ow-iw)/2:(oh-ih)/2" -pix_fmt yuv420p -c:v libx264 -preset veryfast -crf 18 -an "$U"
    fi
    printf "file '%s'\n" "$U" >> "$UNIFORM_LIST"
    IDX=$((IDX+1))
  done

  UNIFORM_MERGED="$TMP/merged_uniform.mp4"

  if (( $(echo "$CROSSFADE > 0" | bc -l) )); then
    echo "Applying ${CROSSFADE}s crossfades…"
    # Build filter_complex with xfade for N clips
    # Load inputs
    IN_ARGS=()
    for f in "${CLIPS[@]}"; do
      IN_ARGS+=(-i "$f")
    done

    # Create scaling/fps chains into labeled streams [v0][a0]…
    VCHAINS=""
    ACHAINS=""
    N=${#CLIPS[@]}
    for i in $(seq 0 $((N-1))); do
      if [[ "$SCALE" == "keep" ]]; then
        VCHAINS+="[$i:v]fps=$FPS,format=yuv420p[v$i];"
      else
        VCHAINS+="[$i:v]fps=$FPS,scale=$SCALE:force_original_aspect_ratio=decrease,pad=$SCALE:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v$i];"
      fi
      ACHAINS+="[$i:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a$i];"
    done

    # Chain xfades pairwise
    VF="[v0]"
    AF="[a0]"
    for i in $(seq 1 $((N-1))); do
      VF="${VF}[v$i]xfade=transition=fade:duration=${CROSSFADE}:offset=PTS-STARTPTS[vx$i];"
      AF="${AF}[a$i]acrossfade=d=${CROSSFADE}:c1=tri:c2=tri[ax$i];"
    done

    VLAST="[vx$((N-1))]"
    ALAST="[ax$((N-1))]"
    if [[ $N -eq 1 ]]; then
      VLAST="[v0]"
      ALAST="[a0]"
    fi

    ffmpeg -hide_banner -loglevel error "${IN_ARGS[@]}" \
      -filter_complex "${VCHAINS}${ACHAINS}${VF}${AF}" \
      -map "${VLAST}" -map "${ALAST}" -c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 192k "$UNIFORM_MERGED"
  else
    ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$UNIFORM_LIST" -c copy "$UNIFORM_MERGED"
  fi

  MERGED="$UNIFORM_MERGED"
fi

# 3) Prepare / normalize audio
PROC_AUDIO="$TMP/audio_proc.wav"
if [[ "$NORMALIZE" == "1" ]]; then
  # EBU R128 normalize, then optional gain
  ffmpeg -y -hide_banner -loglevel error -i "$AUDIO_FILE" -ar 48000 -ac 2 -filter:a "loudnorm=I=-16:TP=-1.5:LRA=11" "$TMP/audio_norm.wav"
  if [[ "$AUDIO_GAIN" != "0" ]]; then
    ffmpeg -y -hide_banner -loglevel error -i "$TMP/audio_norm.wav" -filter:a "volume=${AUDIO_GAIN}dB" "$PROC_AUDIO"
  else
    mv "$TMP/audio_norm.wav" "$PROC_AUDIO"
  fi
else
  ffmpeg -y -hide_banner -loglevel error -i "$AUDIO_FILE" -ar 48000 -ac 2 "$PROC_AUDIO"
fi

# 4) Mux audio + video (stop at shorter)
ffmpeg -y -hide_banner -loglevel error -i "$MERGED" -i "$PROC_AUDIO" -c:v copy -c:a aac -shortest "$OUTPUT_MP4"

echo "✅ Done: $OUTPUT_MP4"
