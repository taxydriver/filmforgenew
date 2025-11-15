download model : bash download_models.sh 


first change caddy file to the Caddyfile in tools
pkill caddy
caddy start --config /etc/Caddyfile


ln -s /workspace/trailer_output/trailer_final.mp4 /workspace/ComfyUI/output/video/trailer_final.mp4



and the comfy url --> http://<vastip>:<public port>/comfy

public port will be found in the portal page

copy tools/filmforge_stitch folder to /comfyui/custom-nodes/

restart comfyui on 8188 if you wanna see interace from portal

pkill -f "python main.py"
cd /workspace/ComfyUI
python main.py --listen 0.0.0.0 --port 8188







# 🎬 Filmmaker → ComfyUI on Vast.ai (Stills + Video) — Setup & Runbook

## 0) What you have now (working)
- Vast pod running ComfyUI (`python3 main.py --port 18188`)
- Caddy proxy exposes Comfy at: `http://<VAST-IP>:<PUBLIC-PORT>/comfy/*`
- Filmmaker `.env.local`:
  ```
  COMFY_URL=http://<VAST-IP>:<PUBLIC-PORT>/comfy
  COMFY_API_KEY=
  ```
- Stills route posts graphs to `/comfy/prompt`, polls `/comfy/queue` + `/comfy/history/<id>`, fetches via `/comfy/view?filename=...&type=output`.

---

## 1) Start / Restart ComfyUI (inside Vast)
```bash
cd /workspace/ComfyUI
nohup python3 main.py --listen 0.0.0.0 --port 18188 > /workspace/logs/comfyui_latest.log 2>&1 &
tail -n 50 /workspace/logs/comfyui_latest.log
```

---

## 2) Caddy proxy (inside Vast) — keep this at top of `:1111` block
```caddy
# /etc/Caddyfile
:1111 {
    # ComfyUI at /comfy
    handle_path /comfy/* {
        reverse_proxy 127.0.0.1:18188
    }

    # Everything else -> Vast portal (fastapi on 11111)
    reverse_proxy 127.0.0.1:11111
}
```

Restart:
```bash
pkill caddy
nohup caddy start --config /etc/Caddyfile # (or wherever caddy lives)
tail -n 50 /workspace/logs/caddy.log
```

**Public check (from your laptop):**
```bash
curl -s "http://<VAST-IP>:<PUBLIC-PORT>/comfy/queue" | head
curl -s -X POST "http://<VAST-IP>:<PUBLIC-PORT>/comfy/prompt" -H "Content-Type: application/json" -d '{"prompt":{"1":{"class_type":"EmptyLatentImage","inputs":{"width":64,"height":64,"batch_size":1}}}}'
```

---

## 3) Models you should have
```bash
ls /workspace/models/checkpoints
# expect:
# JuggernautXL_v9_RunDiffusionPhoto_v2.safetensors
# ltx-video-2b-v0.9.5.safetensors      (optional, for LTX-Video)
# v1-5-pruned-emaonly-fp16.safetensors (fallback)
ls /workspace/models/svd
# if using SVD: svd.safetensors, svd_image_decoder.safetensors (or xt variants)
```
If missing:
```bash
# example
wget -P /workspace/models/checkpoints https://huggingface.co/RunDiffusion/Juggernaut-XL/resolve/main/JuggernautXL_v9_RunDiffusionPhoto_v2.safetensors
```

---

## 4) Stills — API pattern (already working)
**Minimal test (inside Vast):**
```bash
curl -s -X POST http://127.0.0.1:18188/prompt -H "Content-Type: application/json" -d '{
  "prompt":{
    "1":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"JuggernautXL_v9_RunDiffusionPhoto_v2.safetensors"}},
    "2":{"class_type":"CLIPTextEncode","inputs":{"text":"a cinematic portrait, dramatic lighting","clip":["1",1]}},
    "3":{"class_type":"CLIPTextEncode","inputs":{"text":"lowres, cartoon, artifacts","clip":["1",1]}},
    "4":{"class_type":"EmptyLatentImage","inputs":{"width":512,"height":512,"batch_size":1}},
    "5":{"class_type":"KSampler","inputs":{"seed":123,"steps":20,"cfg":7,"sampler_name":"dpmpp_2m","scheduler":"karras","denoise":1,"model":["1",0],"positive":["2",0],"negative":["3",0],"latent_image":["4",0]}},
    "6":{"class_type":"VAEDecode","inputs":{"samples":["5",0],"vae":["1",2]}},
    "7":{"class_type":"SaveImage","inputs":{"images":["6",0],"filename_prefix":"filmmaker_ui"}}
  }
}'
```
Image goes to: `/workspace/ComfyUI/output/filmmaker_ui_00001_.png`  
Fetch via:  
`GET /comfy/view?filename=filmmaker_ui_00001_.png&type=output`

---

## 5) Video (img2vid) — two safe paths

### Option A — **SVD img2vid (Stable Video Diffusion)**
Use the built-in SVD nodes if present.

**Comfy graph (generic template, class types may vary slightly by extension):**
- `LoadImage` → outputs `IMAGE`
- `SVD_img2vid_Conditioning` inputs: `image`, `motion_scale`, `fps`, `augmentation_level`, `cond_frames`
- `StableVideoDiffusionSampler` (or similarly named) inputs: `image`, `conditioning`, `model`, `steps`, `seed`
- `SaveVideo` → writes mp4/webm into `/output/video/`

**Example API payload:**
```bash
curl -s -X POST http://127.0.0.1:18188/prompt -H "Content-Type: application/json" -d '{
  "prompt": {
    "1": {"class_type":"LoadImage", "inputs":{"image":"/workspace/ComfyUI/output/filmmaker_ui_00001_.png"}},
    "2": {"class_type":"SVD_img2vid_Conditioning", "inputs":{"image":["1",0], "fps":12, "cond_frames":48, "motion_scale":1.0, "augmentation_level":0.1}},
    "3": {"class_type":"CheckpointLoaderSimple", "inputs":{"ckpt_name":"svd.safetensors"}},
    "4": {"class_type":"StableVideoDiffusionSampler", "inputs":{"image":["1",0],"model":["3",0],"conditioning":["2",0],"steps":25,"seed":123456,"cfg":1.0}},
    "5": {"class_type":"SaveVideo", "inputs":{"images":["4",0], "fps":12, "format":"mp4", "filename_prefix":"filmmaker_vid"}}
  }
}'
```
Output → `/workspace/ComfyUI/output/video/filmmaker_vid_00001_.mp4`  
Fetch via: `GET /comfy/view?filename=video/filmmaker_vid_00001_.mp4&type=output`

---

### Option B — **LTX-Video (text/image to video)**
Requires `ltx-video-2b-v0.9.5.safetensors` and LTX custom nodes.

**Example:**
```bash
curl -s -X POST http://127.0.0.1:18188/prompt -H "Content-Type: application/json" -d '{
  "prompt": {
    "1": {"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"ltx-video-2b-v0.9.5.safetensors"}},
    "2": {"class_type":"LoadImage","inputs":{"image":"/workspace/ComfyUI/output/filmmaker_ui_00001_.png"}},
    "3": {"class_type":"CLIPTextEncode","inputs":{"text":"cinematic slow push-in, moody lighting, realistic motion","clip":["1",1]}},
    "4": {"class_type":"LTXVideoSampler","inputs":{"model":["1",0],"image":["2",0],"positive":["3",0],"frames":72,"fps":12,"seed":123456,"width":576,"height":1024}},
    "5": {"class_type":"SaveVideo","inputs":{"images":["4",0],"fps":12,"format":"mp4","filename_prefix":"filmmaker_ltx"}}
  }
}'
```

---

## 6) Consistency Tips
- Fix seed per character for consistent looks.
- Use `576×1024` or `1024×576` resolution; upscale later.
- Keep motion subtle (`motion_scale` ~1.0).
- Moderate frames (48–96) and fps (12–16) for speed.

---

## 7) Troubleshooting
| Issue | Fix |
|-------|-----|
| 401 or 404 | Check Caddy `/comfy/*` proxy and remove auth |
| prompt_outputs_failed_validation | Check node inputs and class names |
| timeout | GPU busy or node crashed |
| No /view output | Confirm filename and type from `/history/<id>` |

---

## 8) Clean Stop
```bash
pkill -f "python3 main.py"  # stop ComfyUI
pkill caddy                 # stop Caddy (optional)
```
