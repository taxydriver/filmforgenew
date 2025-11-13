// src/app/api/comfy/stills/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMFY_URL = process.env.COMFY_URL!;
const AVG_SEC_PER_STEP = 0.15; // rough ETA per pct step

type StillsResult = {
  prompt: string;
  url?: string;
  rawUrl?: string;
  filename?: string;
  error?: string;
};

export async function POST(req: Request) {
  const { prompts } = await req.json();
  if (!Array.isArray(prompts) || prompts.length === 0) {
    return new Response("prompts[] required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        send({ type: "status", state: "starting", total: prompts.length });

        const results: StillsResult[] = [];
        let completed = 0;

        for (const prompt of prompts) {
          // 1) Build workflow
          const graph = {
            "1": {
              class_type: "CheckpointLoaderSimple",
              inputs: { ckpt_name: "JuggernautXL_v9_RunDiffusionPhoto_v2.safetensors" },
            },
            "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
            "3": {
              class_type: "CLIPTextEncode",
              inputs: { text: "cartoon, painting, sketch", clip: ["1", 1] },
            },
            "4": { class_type: "EmptyLatentImage", inputs: { width: 768, height: 512, batch_size: 1 } },
            "5": {
              class_type: "KSampler",
              inputs: {
                seed: Date.now() % 2 ** 48,
                steps: 30,
                cfg: 6.5,
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
            "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "filmmaker_ui" } },
          };

          // 2) Submit prompt
          const sub = await fetch(`${COMFY_URL}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: graph, client_id: "filmmaker-ui" }),
          });

          if (!sub.ok) {
            const t = await sub.text().catch(() => "");
            results.push({ prompt, error: `submit failed: ${sub.status} ${t.slice(0, 200)}` });
            // move on to next prompt
            continue;
          }

          const { prompt_id } = await sub.json();

          // 3) Poll until output exists (with timeout)
          let progressPct = 0;
          const t0 = Date.now();
          let doneForThisPrompt = false;
          let dataUrl: string | undefined; // <-- single, outer variable
          let directUrl: string | undefined;
          let filenameRaw: string | undefined;

          while (!doneForThisPrompt) {
            // progress / queue
            try {
              const q = await fetch(`${COMFY_URL}/queue`).then((r) => (r.ok ? r.json() : null));
              const running = q?.queue_running || [];
              const pending = q?.queue_pending?.length || 0;
              const isRunning = running.some((x: any) => x[0] === prompt_id);

              if (isRunning) {
                progressPct = Math.min(progressPct + 3, 100);
                const eta = ((100 - progressPct) * AVG_SEC_PER_STEP).toFixed(1);
                send({ type: "progress", prompt, pct: progressPct, eta });
              } else if (pending > 0) {
                send({ type: "queue", prompt, pending });
              }
            } catch {
              // ignore queue errors; keep polling
            }

            // history
            try {
              const hist = await fetch(`${COMFY_URL}/history/${prompt_id}`).then((r) =>
                r.ok ? r.json() : null
              );
              const outs = hist?.[prompt_id]?.outputs || {};

              for (const node of Object.values<any>(outs)) {
                const im = node.images?.[0];
                if (!im?.filename) continue;

                filenameRaw = im.filename;
                const safeType = im.type || "output";
                const safeSub = im.subfolder ? encodeURIComponent(im.subfolder) : "";
                const filenameEnc = encodeURIComponent(filenameRaw);

                directUrl = `${COMFY_URL}/view?filename=${filenameEnc}${
                  safeSub ? `&subfolder=${safeSub}` : ""
                }&type=${safeType}`;

                try {
                  const imgRes = await fetch(directUrl, { cache: "no-store" });
                  if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
                  const mime = imgRes.headers.get("content-type") || "image/png";
                  const buf = Buffer.from(await imgRes.arrayBuffer());
                  dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
                } catch (err: any) {
                  results.push({ prompt, error: `view fetch failed: ${err?.message || err}` });
                  // we’ll continue polling; don’t mark done yet
                }

                // we looked at the first image in this node; break node loop
                break;
              }
            } catch {
              // ignore history fetch errors; keep polling
            }

            // if we have an image, finalize this prompt
            if (dataUrl) {
              // push only once per prompt/filename
              if (!results.some((r) => r.filename === filenameRaw)) {
                results.push({
                  prompt,
                  url: dataUrl,
                  rawUrl: directUrl,
                  filename: filenameRaw,
                });
              }
              completed++;
              send({ type: "progress", prompt, pct: 100, eta: 0 });
              send({ type: "status", state: "completed", completed, total: prompts.length });
              doneForThisPrompt = true;
              break;
            }

            // hard timeout (2 min)
            if (Date.now() - t0 > 120_000) {
              results.push({ prompt, error: "timeout waiting for image" });
              doneForThisPrompt = true;
              break;
            }

            await new Promise((r) => setTimeout(r, 1000));
          } // while
        } // for prompts

        // 4) wrap up
        await new Promise((r) => setTimeout(r, 300));
        send({ type: "status", state: "done", results });
        controller.close();
      } catch (err: any) {
        send({ type: "error", message: String(err?.message || err) });
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