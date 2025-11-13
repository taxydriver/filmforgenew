// src/app/api/comfy/video/route.ts
import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const COMFY_URL = process.env.COMFY_URL!;
const MAX_WAIT_MS = 15 * 60 * 1000; // 15 min — WAN can be slow

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      image,
      type = "output",           // accept/forward type + subfolder
      subfolder = "video",        // default to /output/video for WAN
      positive = "",
      negative = "",
      width = 768,
      height = 512,
      fps = 24,
      frames = 48,
      strength = 0.25,
      prefix = "shot",
      template,
      templateJson
    } = body || {};

    if (!image) {
      return Response.json({ ok: false, code: "BAD_REQUEST", error: "image filename required" }, { status: 400 });
    }

    // 1) Load API-prompt template (WAN i2v)
    const graph: Record<string, any> = await loadTemplate(template, templateJson);

    // 2) Patch by class_type
    const findId = (match: string) =>
      Object.keys(graph).find(k => String(graph[k]?.class_type || "").toLowerCase().includes(match));

    const posId   = findId("cliptextencode");
    const negId   = Object.keys(graph).find(k =>
      String(graph[k]?.class_type || "").toLowerCase().includes("cliptextencode") && k !== posId);
    const loadId  = findId("loadimage");
    const i2vId   = findId("imgtovideo");
    const saveId  = Object.keys(graph).find(k => {
      const ct = String(graph[k]?.class_type || "").toLowerCase();
      return ct.includes("savevideo");
    });

    if (posId) graph[posId].inputs.text = positive;
    if (negId) graph[negId].inputs.text = negative;

    if (loadId) {
      // Comfy LoadImage expects path relative to /output when type='output'
      graph[loadId].inputs.image = (type === "output" && subfolder)
        ? `${subfolder}/${image}`
        : image;
    }

    if (i2vId) {
      graph[i2vId].inputs.width    = width;
      graph[i2vId].inputs.height   = height;
      // WAN nodes usually use "length" for frames; set both to be safe
      graph[i2vId].inputs.length   = frames;
      graph[i2vId].inputs.frames   = frames;
      if ("strength" in graph[i2vId].inputs) graph[i2vId].inputs.strength = strength;
    }

    if (saveId) {
      graph[saveId].inputs.filename_prefix = `video/${prefix}`;
    }

    // 3) Submit to Comfy
    const sub = await fetch(`${COMFY_URL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: "filmmaker-ui" }),
    });
    const subText = await sub.text();
    const subJson = safeJson(subText);

    if (!sub.ok) {
      return Response.json(
        { ok: false, code: "COMFY_SUBMIT_FAILED", error: subText, debug: { found: { posId, negId, loadId, i2vId, saveId } } },
        { status: 500 }
      );
    }

    const { prompt_id } = subJson;

    // 4) Poll for output video
    const t0 = Date.now();
    let fileUrl: string | null = null;
    let fileName: string | null = null;

    while (Date.now() - t0 < MAX_WAIT_MS) {
      await sleep(2000);
      const histRes = await fetch(`${COMFY_URL}/history/${prompt_id}`);
      if (!histRes.ok) continue;
      const hist = await histRes.json();
      const outs = hist?.[prompt_id]?.outputs || {};

      for (const node of Object.values<any>(outs)) {
        const v = node.videos?.[0];
        if (v?.filename) {
          const fname = encodeURIComponent(v.filename);
          const ssub  = v.subfolder ? `&subfolder=${encodeURIComponent(v.subfolder)}` : `&subfolder=${encodeURIComponent(subfolder)}`;
          const ttype = v.type || type || "output";
          fileName = v.filename;
          fileUrl  = `${COMFY_URL}/view?filename=${fname}${ssub}&type=${ttype}`;
          break;
        }
      }
      if (fileUrl) break;
    }

    if (!fileUrl) {
      // As a last resort construct expected path (many WAN saves land under /output/video/)
      const guess = `${COMFY_URL}/view?filename=${encodeURIComponent(`${prefix}_00001_.mp4`)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}`;
      return Response.json({ ok: false, code: "TIMEOUT", guess }, { status: 504 });
    }

    return Response.json({ ok: true, url: fileUrl, filename: fileName, prompt_id });
  } catch (err: any) {
    return Response.json({ ok: false, code: "SERVER_ERROR", error: String(err?.message || err) }, { status: 500 });
  }
}

// helpers
function safeJson(t: string) { try { return JSON.parse(t); } catch { return {}; } }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }