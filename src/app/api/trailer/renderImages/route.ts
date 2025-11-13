import { NextRequest } from "next/server";

export const runtime = "nodejs";

const STABILITY_KEY = process.env.STABILITY_API_KEY || process.env.NEXT_PUBLIC_STABILITY_API_KEY;
const ENGINE_ID = "stable-diffusion-xl-1024-v1-0"; // cheaper SDXL engine
const BASE = process.env.STABILITY_BASE_URL || "https://api.stability.ai";

export async function POST(req: NextRequest) {
  try {
    if (!STABILITY_KEY) {
      return Response.json({ ok: false, error: "Missing STABILITY_API_KEY" }, { status: 500 });
    }

    const { prompts } = await req.json();
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return new Response("prompts must be an array of strings", { status: 400 });
    }

    const results: { prompt: string; url?: string; error?: string }[] = [];

    for (const prompt of prompts) {
      const res = await fetch(
        `${BASE}/v1/generation/${ENGINE_ID}/text-to-image`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${STABILITY_KEY}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            text_prompts: [{ text: prompt, weight: 1 }],
            // sensible defaults; tweak as needed
            width: 1024,
            height: 1024,
            cfg_scale: 7,
            steps: 30,
            samples: 1,
          }),
          cache: "no-store",
        }
      );

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        const errText = await res.text();
        results.push({ prompt, error: errText || `HTTP ${res.status}` });
        continue;
        }

      // Stability v1 returns JSON with base64 artifacts by default
      if (contentType.includes("application/json")) {
        const data: any = await res.json();
        const art = data?.artifacts?.[0];
        if (!art?.base64) {
          results.push({ prompt, error: "No artifact base64 returned" });
          continue;
        }
        // Create a data URL for quick preview in the client
        const url = `data:image/png;base64,${art.base64}`;
        results.push({ prompt, url });
      } else {
        // If your plan/endpoint returns image/*, handle as blob:
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const b64 = Buffer.from(arrayBuffer).toString("base64");
        const url = `data:image/png;base64,${b64}`;
        results.push({ prompt, url });
      }
    }

    return Response.json({ ok: true, results });
  } catch (err: any) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}