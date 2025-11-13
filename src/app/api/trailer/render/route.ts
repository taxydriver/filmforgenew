// src/app/api/trailer/render/route.ts
import { NextRequest } from "next/server";
import TEMPLATE from "@/workflows/ltx_i2v_template.json"; // note: path without /src prefix

export const runtime = "nodejs";

const BASE = process.env.VAST_COMFY_URL || "";

function applyTemplate(tpl: any, vars: Record<string, string | number>) {
  const s = JSON.stringify(tpl);
  return JSON.parse(
    s.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, k) => {
      const val = String(vars[k] ?? "");
      // Properly escape backslashes and quotes for JSON validity
      return val
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    })
  );
}
async function comfyPost(path: string, body: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`ComfyUI ${path} ${res.status}: ${msg}`);
  }
  return res.json();
}

async function comfyGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ComfyUI ${path} ${res.status}`);
  return res.json();
}

async function pollHistory(promptId: string, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  let lastLog = 0;

  while (Date.now() - start < timeoutMs) {
    // Poll less aggressively to give Comfy time to write files
    await new Promise((r) => setTimeout(r, 3000));

    // history can be either an object keyed by id, or an object of objects
    const hist = await comfyGet(`/history/${promptId}`);
    const item = hist?.[promptId] || Object.values(hist || {})[0];
    if (!item) continue;

    // bubble up Comfy errors early
    if (item?.status?.error) {
      throw new Error(`ComfyUI error: ${item.status.error}`);
    }

    const outputs = item?.outputs || {};
    const urls: string[] = [];

    for (const nodeOut of Object.values(outputs)) {
      const n = nodeOut as any;

      // Prefer videos (VHS_VideoCombine etc.)
      if (Array.isArray(n.videos)) {
        for (const v of n.videos) {
          // /view? preserves subfolder/type and works behind Caddy/proxies
          urls.push(
            `${BASE}/view?filename=${encodeURIComponent(v.filename)}&subfolder=${encodeURIComponent(v.subfolder || "")}&type=${encodeURIComponent(v.type || "output")}`
          );
        }
      }

      // Some graphs output images (webp/png); include them too
      if (Array.isArray(n.images)) {
        for (const im of n.images) {
          urls.push(
            `${BASE}/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder || "")}&type=${encodeURIComponent(im.type || "output")}`
          );
        }
      }
    }

    if (urls.length > 0) {
      return urls;
    }

    // Grace period: Comfy can set completed=true before VHS writes
    if (item?.status?.completed) {
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }

    if (Date.now() - lastLog > 6000) {
      console.log("⏳ Waiting for ComfyUI outputs...");
      lastLog = Date.now();
    }
  }

  console.warn("⚠️ Timeout waiting for ComfyUI outputs");
  return [];
}

export async function POST(req: NextRequest) {
  try {
    if (!BASE) {
      return Response.json(
        { ok: false, error: "VAST_COMFY_URL env is missing on server" },
        { status: 500 }
      );
    }

    const { shots, graphTemplate } = await req.json();
    if (!Array.isArray(shots) || shots.length === 0) {
      return new Response("No shots", { status: 400 });
    }

    // Use provided template or fallback to imported JSON
    const tpl =
      graphTemplate || { prompt: (TEMPLATE as any).prompt ?? TEMPLATE, client_id: "filmmaker-app" };

    const results: any[] = [];

    // (Optional) sanity check that Comfy is reachable
    await comfyGet("/system_stats");

    for (const shot of shots) {
      const vars = {
        PROMPT: shot.prompt || "cinematic, neon rain, hero silhouette",
        NEGATIVE: shot.negative || "low quality, worst quality, artifacts",
        WIDTH: shot.width ?? 576,
        HEIGHT: shot.height ?? 1024,
        FPS: shot.fps ?? 12,
        LENGTH_FRAMES: shot.length_frames ?? 72,
        STEPS: shot.steps ?? 20,
        STRENGTH: shot.strength ?? 0.15,
        SEED: shot.seed ?? Math.floor(Math.random() * 1e9),
      };

      const filled = {
        prompt: applyTemplate(tpl.prompt, vars),
        client_id: tpl.client_id || "filmmaker-app",
      };

      const { prompt_id } = await comfyPost("/prompt", filled);
      const files = await pollHistory(prompt_id);

      if (!files.length) {
          console.log("⚠️ No history outputs, checking /output folder directly...");
          const list = await comfyGet("/output"); // this returns a directory listing
          const recent = (list?.output || [])
            .filter((f: any) => f.filename?.endsWith(".mp4"))
            .map((f: any) =>
              `${BASE}/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder || "")}&type=${encodeURIComponent(f.type || "output")}`
            );
          if (recent.length) {
            console.log("✅ Found fallback outputs:", recent);
            results.push({ shot_id: shot.id, status: "done", files: recent, vars });
            continue; // skip rest of the loop
          }
        }
      results.push({ shot_id: shot.id, status: files.length ? "done" : "empty", files, vars });
    }

    return Response.json({ ok: true, count: results.length, results });
  } catch (err: any) {
    console.error("TRAILER_RENDER_ERROR:", err);
    return Response.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}