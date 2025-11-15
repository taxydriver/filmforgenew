// src/app/api/comfy/stills/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMFY_URL = process.env.COMFY_URL!;
const AVG_SEC_PER_STEP = 0.15; // rough ETA per pct step

type RefImage = { image: string; subfolder?: string; type?: string };

type StillsPromptInput =
  | string
  | {
      prompt: string;
      negative?: string;
      refImages?: RefImage[];
    };

type StillsResult = {
  prompt: string;
  url?: string;
  rawUrl?: string;
  filename?: string;
  error?: string;
};

export async function POST(req: Request) {
  const body = await req.json();
  const prompts = body.prompts as StillsPromptInput[];

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return new Response("prompts[] required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        console.log("[/api/comfy/stills] start", { count: prompts.length });
        send({ type: "status", state: "starting", total: prompts.length });

        const results: StillsResult[] = [];
        let completed = 0;

        for (const rawPrompt of prompts) {
          const p =
            typeof rawPrompt === "string"
              ? {
                  prompt: rawPrompt,
                  negative: "cartoon, painting, sketch",
                  refImages: [] as RefImage[],
                }
              : {
                  prompt: rawPrompt.prompt,
                  negative: rawPrompt.negative ?? "cartoon, painting, sketch",
                  refImages: rawPrompt.refImages ?? [],
                };

          const positiveText = p.prompt;
          const negativeText = p.negative;
          const primaryRef = p.refImages[0];
          console.log("[/api/comfy/stills] prompt", {
            prompt: positiveText,
            hasRef: Boolean(primaryRef?.image),
            refMeta: primaryRef ? { subfolder: primaryRef.subfolder, type: primaryRef.type } : null,
          });

          // ---- Build ComfyUI graph ----
          const graph: any = {
            "1": {
              class_type: "CheckpointLoaderSimple",
              inputs: { ckpt_name: "JuggernautXL_v9_RunDiffusionPhoto_v2.safetensors" },
            },
            "2": {
              class_type: "CLIPTextEncode",
              inputs: { text: positiveText, clip: ["1", 1] },
            },
            "3": {
              class_type: "CLIPTextEncode",
              inputs: { text: negativeText, clip: ["1", 1] },
            },
            "4": {
              class_type: "EmptyLatentImage",
              inputs: { width: 768, height: 512, batch_size: 1 },
            },
          };

          // If we have a reference portrait, wire up IP-Adapter nodes.
          if (primaryRef) {
            graph["10"] = {
              class_type: "LoadImage",
              inputs: {
                image: primaryRef.image,
                ...(primaryRef.subfolder ? { subfolder: primaryRef.subfolder } : {}),
                ...(primaryRef.type ? { type: primaryRef.type } : {}),
              },
            };

            graph["11"] = {
              // NOTE: Adjust class_type and ipadapter_file to match your ComfyUI IP-Adapter extension.
              class_type: "IPAdapterModelLoader",
              inputs: {
                ipadapter_file: "ip-adapter-faceid-plus_sd15.bin",
              },
            };

            graph["12"] = {
              // NOTE: Adjust this node type/inputs to your installed IP-Adapter apply node.
              class_type: "IPAdapterApply",
              inputs: {
                model: ["1", 0],
                ipadapter: ["11", 0],
                image: ["10", 0],
                clip_vision: ["1", 1],
                strength: 0.85,
                start_at: 0.0,
                end_at: 1.0,
              },
            };
          }

          graph["5"] = {
            class_type: "KSampler",
            inputs: {
              seed: Date.now() % 2 ** 48,
              steps: 30,
              cfg: 6.5,
              sampler_name: "dpmpp_2m",
              scheduler: "karras",
              denoise: 1,
              model: ["1", 0],
              positive: primaryRef ? ["12", 0] : ["2", 0],
              negative: ["3", 0],
              latent_image: ["4", 0],
            },
          };

          graph["6"] = {
            class_type: "VAEDecode",
            inputs: { samples: ["5", 0], vae: ["1", 2] },
          };

          graph["7"] = {
            class_type: "SaveImage",
            inputs: {
              images: ["6", 0],
              filename_prefix: "filmmaker_ui",
            },
          };

          const sub = await fetch(`${COMFY_URL}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: graph, client_id: "filmmaker-ui" }),
          });

          if (!sub.ok) {
            const t = await sub.text().catch(() => "");
            console.error("[/api/comfy/stills] submit failed", sub.status, t.slice(0, 200));
            results.push({
              prompt: positiveText,
              error: `submit failed: ${sub.status} ${t.slice(0, 200)}`,
            });
            continue;
          }

          const { prompt_id } = await sub.json();
          console.log("[/api/comfy/stills] submitted", { prompt: positiveText, prompt_id });

          let progressPct = 0;
          const t0 = Date.now();
          let doneForThisPrompt = false;
          let dataUrl: string | undefined;
          let directUrl: string | undefined;
          let filenameRaw: string | undefined;

          while (!doneForThisPrompt) {
            try {
              const q = await fetch(`${COMFY_URL}/queue`).then((r) =>
                r.ok ? r.json() : null
              );
              const running = q?.queue_running || [];
              const pending = q?.queue_pending?.length || 0;
              const isRunning = running.some((x: any) => x[0] === prompt_id);

              if (isRunning) {
                progressPct = Math.min(progressPct + 3, 100);
                const eta = ((100 - progressPct) * AVG_SEC_PER_STEP).toFixed(1);
                send({ type: "progress", prompt: positiveText, pct: progressPct, eta });
              } else if (pending > 0) {
                send({ type: "queue", prompt: positiveText, pending });
              }
            } catch {
              // ignore queue errors; keep polling
            }

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
                  console.error("[/api/comfy/stills] view fetch failed", err);
                  results.push({
                    prompt: positiveText,
                    error: `view fetch failed: ${err?.message || err}`,
                  });
                }
                break;
              }
            } catch {
              // ignore history fetch errors; keep polling
            }

            if (dataUrl) {
              if (!results.some((r) => r.filename === filenameRaw)) {
                results.push({
                  prompt: positiveText,
                  url: dataUrl,
                  rawUrl: directUrl,
                  filename: filenameRaw,
                });
              }
              completed++;
              send({ type: "progress", prompt: positiveText, pct: 100, eta: 0 });
              send({
                type: "status",
                state: "completed",
                completed,
                total: prompts.length,
              });
              doneForThisPrompt = true;
              break;
            }

            if (Date.now() - t0 > 120_000) {
              results.push({ prompt: positiveText, error: "timeout waiting for image" });
              doneForThisPrompt = true;
              break;
            }

            await new Promise((r) => setTimeout(r, 1000));
          }
        }

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
