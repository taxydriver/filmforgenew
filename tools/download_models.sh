#!/usr/bin/env bash
set -euo pipefail

# ======================================
# Filmforge / ComfyUI model downloader
# Fresh install (no resume/partials)
# Writes to /workspace/ComfyUI/models
# ======================================

ROOT_DIR="${1:-/workspace/ComfyUI/models}"
mkdir -p "$ROOT_DIR"/{text_encoders,vae,diffusion_models,checkpoints,audio}

# Optional HF token (for gated/rate-limited repos)
HDR_AUTH=()
if [ -n "${HUGGING_FACE_HUB_TOKEN:-}" ]; then
  HDR_AUTH=(--header "Authorization: Bearer $HUGGING_FACE_HUB_TOKEN")
fi

download () {
  local url="$1" out="$2"
  echo "GET: $url"
  mkdir -p "$(dirname "$out")"
  # fresh box: overwrite if exists, no resume
  wget -S --progress=bar:force "${HDR_AUTH[@]}" \
       --tries=3 --waitretry=2 --retry-connrefused --timeout=180 \
       -O "$out" "$url"
  [ -s "$out" ] || { echo "ERROR: empty or failed download: $out"; exit 1; }
}

echo "→ Download root: $ROOT_DIR"
echo ">>> Starting downloads …"

# Text encoder
download \
  "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors" \
  "$ROOT_DIR/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"

# VAE
download \
  "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors" \
  "$ROOT_DIR/vae/wan_2.1_vae.safetensors"

# Diffusion models (WAN 2.2 I2V 14B)
download \
  "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors" \
  "$ROOT_DIR/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"

download \
  "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors" \
  "$ROOT_DIR/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"

download \
  https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors \
  "$ROOT_DIR/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"

download \
  https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors \
  "$ROOT_DIR/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors"


# Juggernaut XL v9
download \
  "https://huggingface.co/RunDiffusion/Juggernaut-XL-v9/resolve/a7634331b40541c153687f8b8e80bdbf2c63a0f5/JuggernautXL_v9_RunDiffusionPhoto_v2.safetensors" \
  "$ROOT_DIR/checkpoints/JuggernautXL_v9_RunDiffusionPhoto_v2.safetensors"

# Stable Audio Open 1.0

download \
"https://huggingface.co/Comfy-Org/stable-audio-open-1.0_repackaged/resolve/main/stable-audio-open-1.0.safetensors" \
"$ROOT_DIR/checkpoints/stable-audio-open-1.0.safetensors"

download \
  "https://huggingface.co/ComfyUI-Wiki/t5-base/resolve/main/t5-base.safetensors" \
  "$ROOT_DIR/text_encoders/t5-base.safetensors"
      
   



echo "✅ Done."
echo "Files:"
find "$ROOT_DIR" -type f -name "*.safetensors" -print | sed 's/^/  /'
