// src/app/api/comfy/characters/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMFY_URL = process.env.COMFY_URL!;
const AVG_SEC_PER_STEP = 0.15; // for ETA feedback

/**
 * Body example:
 * {
 *   "character": "Aigiri",
 *   "description": "tribal woman, fierce eyes, dark brown skin, long wavy black hair, red cotton saree, silver nose ring",
 *   "style": "cinematic portrait, 35mm film look, soft light",
 *   "poses": ["front", "profile", "3-quarter"]
 * }
 */
export async function POST(req: NextRequest) {
  const { character, description, style, poses = ["front"] } = await req.json();

  if (!character || !description) {
    return new Response("character and description required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        send({ type: "status", state: "starting", character, poses });

        const results: { pose: string; url?: string; error?: string }[] = [];
        let completed = 0;

        for (const pose of poses) {
          const prompt = `${description}, ${pose} portrait, ${style || "studio lighting, cinematic color grading"}`;

          const graph = {
            "1": {
              class_type: "CheckpointLoaderSimple",
              inputs: { ckpt_name: "JuggernautXL_v9_RunDiffusionPhoto_v2.safetensors" },
            },
            "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
            "3": { class_type: "CLIPTextEncode", inputs: { text: "low quality, cartoon, sketch", clip: ["1", 1] } },
            "4": { class_type: "EmptyLatentImage", inputs: { width: 768, height: 1024, batch_size: 1 } },
            "5": {
              class_type: "KSampler",
              inputs: {
                seed: Math.floor(Math.random() * 1e9),
                steps: 28,
                cfg: 6.0,
                sampler_name: "dpmpp_2m",
                scheduler: "karras",
                denoise: 1,
                model: ["1", 0],
                positive: ["2", 0],
                negative: ["3", 0],
                latent_image: ["4", 0],
              },
            },
            "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
            "7": {
              class_type: "SaveImage",
              inputs: { images: ["6", 0], filename_prefix: `char_${character}_${pose}` },
            },
          };

          // ---- Submit to ComfyUI
          const sub = await fetch(`${COMFY_URL}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: graph, client_id: "filmmaker-ui" }),
          });
          const { prompt_id } = await sub.json();

          // ---- Poll until image ready
          let progress = 0;
          while (true) {
            const hist = await fetch(`${COMFY_URL}/history/${prompt_id}`).then(r => r.ok ? r.json() : null);
            const outs = hist?.[prompt_id]?.outputs || {};
            let imageUrl: string | null = null;

            for (const node of Object.values<any>(outs)) {
              const im = node.images?.[0];
              if (im?.filename) {
                const fname = encodeURIComponent(im.filename);
                const safeType = im.type || "output";
                imageUrl = `${COMFY_URL}/view?filename=${fname}&type=${safeType}`;
                break;
              }
            }

            if (imageUrl) {
              results.push({ pose, url: imageUrl });
              completed++;
              send({ type: "progress", pose, pct: 100 });
              send({ type: "status", state: "completed", completed, total: poses.length });
              break;
            }

            progress = Math.min(progress + 3, 100);
            const eta = ((100 - progress) * AVG_SEC_PER_STEP).toFixed(1);
            send({ type: "progress", pose, pct: progress, eta });
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        send({ type: "status", state: "done", results });
        controller.close();
      } catch (err: any) {
        send({ type: "error", message: err.message || String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}