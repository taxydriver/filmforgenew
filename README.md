
# FilmForge AI — Filmmaker App Development

Turn simple film ideas into polished concepts, screenplays, and AI-generated trailer assets. This app provides an end-to-end workflow powered by AWS Bedrock (Claude), optional Stability AI for stills, ComfyUI for image-to-video, and FFmpeg for stitching.

Figma reference: https://www.figma.com/design/lm7adbtNwiZH9fBNw6nvCh/Filmmaker-App-Development

## What It Does

- Idea → Concept → Screenplay → Trailer workflow in one UI
- Claude (via AWS Bedrock) for ideation, concepting, shot planning, and JSON cleanup
- Optional storyboard stills via Stability AI
- Trailer shots rendered via ComfyUI (image-to-video), with a provided template
- Clip stitching and optional music mix via FFmpeg

## Project Structure (high level)

- `src/app` — Next.js App Router UI and API routes
  - `src/app/api/bedrock/chat/route.ts` — Claude chat (Bedrock)
  - `src/app/api/trailer/plan/route.ts` — JSON shot planning (Claude)
  - `src/app/api/trailer/render/route.ts` — ComfyUI graph submit + polling
  - `src/app/api/trailer/stitch/route.ts` — FFmpeg stitching + music mix
  - `src/app/api/trailer/renderImages/route.ts` — Stability AI stills
  - `src/app/api/storyboard/plan/route.ts` — Shot prompts from screenplay
- `src/components` — React UI components for each step
- `src/lib` — Client helpers that call the API routes
- `src/workflows/ltx_i2v_template.json` — ComfyUI workflow template used by render route
- `vite.config.ts` — Vite dev server for the UI (proxies `/api` to Next)

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm, pnpm, or yarn
- For trailer stitching: FFmpeg available on PATH (or set `FFMPEG_PATH`)
- For ComfyUI rendering: a reachable ComfyUI REST server
- For Stability stills: a valid Stability API key
- For Bedrock/Claude: AWS credentials with Bedrock access

## Environment Variables

Create a `.env.local` in the project root. Do not commit secrets. Common vars:

- AWS/Bedrock
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (or `BEDROCK_REGION`)
  - `BEDROCK_SONNET_MODEL` (optional, e.g. `anthropic.claude-3-5-sonnet-20240620-v1:0`)
- ComfyUI
  - `VAST_COMFY_URL` — base URL of your ComfyUI server (e.g. `http://<host>:<port>`)
- Stability AI (optional)
  - `STABILITY_API_KEY`
- FFmpeg (optional)
  - `FFMPEG_PATH` — if ffmpeg isn’t on PATH
- Vite proxy (when using Vite UI + Next API)
  - `VITE_PROXY_API_TARGET` — defaults to `http://localhost:3001`

Note: Only set what you need. Without ComfyUI/Stability/FFmpeg, the corresponding features won’t run.

## How To Run

You can run either just the Next app (simplest) or Vite UI + Next API together.

### Option A — Next only (recommended to start)

1) Install deps
```
npm install
```
2) Start Next on port 3001
```
npm run next:dev
```
3) Open the app: http://localhost:3001

This runs the UI from `src/app` and serves API routes under `/api/*` from the same origin.

### Option B — Vite UI + Next API (two terminals)

1) Terminal A — start Next API (default 3001)
```
npm run next:dev
```
2) Terminal B — start Vite UI (proxies `/api` → 3001)
```
npm run dev
```
3) Open the app: http://localhost:3000

If you change the Next port, update `VITE_PROXY_API_TARGET` accordingly.

### Production

- Next production
```
npm run next:build
npm run next:start -p 3001
```
- Vite static build (UI only)
```
npm run build
```
Note: The Vite build in `build/` is static and still needs a running API server for `/api/*`.

## Troubleshooting

- 401/403 or model errors from Bedrock
  - Check AWS credentials and Bedrock region/model availability
- ComfyUI timeouts or empty outputs
  - Verify `VAST_COMFY_URL` and that the server exposes `/prompt`, `/history`, `/view`, `/output`
- FFmpeg errors when stitching
  - Ensure `ffmpeg` is installed and on PATH, or set `FFMPEG_PATH`
- Images not generating
  - Set `STABILITY_API_KEY` or disable the stills step

## Notes

- Next supports `src/` layout out-of-the-box; API routes live under `src/app/api/*`.
- The default dev experience is to run both servers: Vite for fast HMR and Next for APIs.

  
