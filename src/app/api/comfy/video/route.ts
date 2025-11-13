// src/app/api/comfy/video/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMFY_URL = process.env.COMFY_URL!; // e.g. http://<ip>:<port>/comfy
const COMFY_KEY = process.env.COMFY_API_KEY || "";

type PromptGraph = Record<string, any>;

function patch(obj: any, path: (string | number)[], value: any) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur == null || !(k in cur)) return;
    cur = cur[k];
  }
  const last = path[path.length - 1];
  if (cur && last in cur) cur[last] = value;
}

function deepReplacePlaceholders(obj: any, map: Record<string, string>) {
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) return obj.map((v) => deepReplacePlaceholders(v, map));
    const out: any = {};
    for (const k of Object.keys(obj)) out[k] = deepReplacePlaceholders(obj[k], map);
    return out;
  }
  if (typeof obj === "string" && obj in map) return map[obj];
  return obj;
}

async function loadTemplateJson(templatePath?: string, templateJson?: PromptGraph) {
  if (templateJson && typeof templateJson === "object") return templateJson;
  const rel = (templatePath || "/workflows/video_wan2_2_14B_i2v.json").replace(/^\/+/, "");
  const full = `${process.cwd()}/public/${rel}`;
  const fs = await import("fs/promises");
  try {
    const raw = await fs.readFile(full, "utf8");
    return JSON.parse(raw);
  } catch {
    throw new Error(
      [
        "Template not found.",
        `Tried: ${full}`,
        `cwd: ${process.cwd()}`,
        `Pass templateJson in body or put a file under public/${rel}`,
      ].join("\n")
    );
  }
}

/** Ensure still exists in Comfy /input by uploading it; returns plain filename for LoadImage.image */
async function ensureInInput(filename: string): Promise<string> {
  const viewUrl = `${COMFY_URL}/view?filename=${encodeURIComponent(filename)}&type=output`;
  const head = await fetch(viewUrl, { method: "HEAD", cache: "no-store" });
  if (!head.ok) {
    const headIn = await fetch(
      `${COMFY_URL}/view?filename=${encodeURIComponent(filename)}&type=input`,
      { method: "HEAD", cache: "no-store" }
    );
    if (headIn.ok) return filename;
    throw new Error(
      JSON.stringify({
        code: "NOT_FOUND_ON_COMFY",
        message: "Comfy cannot see the still in output/ or input/",
        debug: { viewUrl },
      })
    );
  }

  const imgRes = await fetch(viewUrl, { cache: "no-store" });
  if (!imgRes.ok) throw new Error(`Failed downloading output/${filename} (${imgRes.status})`);
  const buf = await imgRes.arrayBuffer();

  const form = new FormData();
  form.append("image", new Blob([buf]), filename);
  const up = await fetch(`${COMFY_URL}/upload/image`, { method: "POST", body: form });
  if (!up.ok) {
    const t = await up.text().catch(() => "");
    throw new Error(
      JSON.stringify({
        code: "UPLOAD_FAILED",
        message: "Failed to upload still into Comfy /input",
        details: t.slice(0, 400),
      })
    );
  }
  return filename;
}

/** Aggressively overwrite any string text-like input across all nodes */
function patchAllTextLike(graph: PromptGraph, positive: string, negative: string) {
  const touched: Array<{ id: string; field: string; old: any; new: any }> = [];
  const TEXT_KEYS_POS = ["text", "prompt", "positive", "pos", "caption", "condition", "cond"];
  const TEXT_KEYS_NEG = ["negative", "negative_prompt"];

  for (const [id, node] of Object.entries<any>(graph)) {
    const inputs = node?.inputs;
    if (!inputs || typeof inputs !== "object") continue;

    for (const key of Object.keys(inputs)) {
      const val = inputs[key];
      if (typeof val !== "string") continue; // skip linked/array/non-literal

      if (TEXT_KEYS_POS.includes(key)) {
        touched.push({ id, field: key, old: val, new: positive });
        inputs[key] = positive;
      }
      if (TEXT_KEYS_NEG.includes(key)) {
        touched.push({ id, field: key, old: val, new: negative });
        inputs[key] = negative;
      }
    }
  }
  return touched;
}

export async function POST(req: NextRequest) {
  try {
    if (!COMFY_URL) {
      return Response.json({ ok: false, code: "ENV", error: "COMFY_URL missing" }, { status: 500 });
    }

    const body = await req.json();
    const {
      image,                   // e.g. "filmmaker_ui_00001_.png"
      positive = "",
      negative = "",
      width = 768,
      height = 512,
      fps = 24,
      frames = 48,
      strength = 0.25,
      prefix = "shot_01",
      template,                // e.g. "/workflows/video_wan2_2_14B_i2v.json"
      templateJson,
      seed,
    } = body || {};

    if (!image || typeof image !== "string") {
      return Response.json({ ok: false, code: "BAD_IMAGE", error: "image filename required" }, { status: 400 });
    }

    // Stage still into /input
    const inputFilename = await ensureInInput(image);

    // Load template
    let graph: PromptGraph = await loadTemplateJson(template, templateJson);

    // 1) Placeholder pass
    const placeholderMap: Record<string, string> = {
      "__POS__": String(positive || ""),
      "__NEG__": String(negative || ""),
      "__IMAGE__": String(inputFilename),
      "__WIDTH__": String(width),
      "__HEIGHT__": String(height),
      "__FPS__": String(fps),
      "__FRAMES__": String(frames),
      "__STRENGTH__": String(strength),
      "__PREFIX__": `video/${String(prefix)}`,
    };
    if (typeof seed === "number") placeholderMap["__SEED__"] = String(seed);
    graph = deepReplacePlaceholders(graph, placeholderMap);

    const nodes = Object.entries(graph); // [id, node]
    const patched = {
      loadImage: [] as string[],
      clipTextEncode: [] as string[],
      wanConditioning: [] as string[],
      img2video: [] as string[],
      saveVideo: [] as string[],
    };

    // 2) Targeted patches (covers linked/varied templates)
    // LoadImage
    for (const [id, n] of nodes) {
      const t = String(n?.class_type || "").toLowerCase();
      if (t === "loadimage" || t === "load image") {
        patch(graph[id], ["inputs", "image"], inputFilename);
        patched.loadImage.push(id);
      }
    }

    // CLIPTextEncode: first -> positive, second -> negative (fallback)
    const clipIds = nodes
      .filter(([_, n]) => String(n?.class_type || "").toLowerCase() === "cliptextencode")
      .map(([id]) => id);
    if (clipIds.length > 0) {
      patch(graph[clipIds[0]], ["inputs", "text"], positive);
      patched.clipTextEncode.push(`${clipIds[0]}:pos`);
      if (clipIds[1]) {
        patch(graph[clipIds[1]], ["inputs", "text"], negative);
        patched.clipTextEncode.push(`${clipIds[1]}:neg`);
      } else if (negative) {
        const cur = graph[clipIds[0]]?.inputs?.text;
        patch(graph[clipIds[0]], ["inputs", "text"], cur ? `${negative}\n\n${cur}` : negative);
        patched.clipTextEncode.push(`${clipIds[0]}:+neg_in_pos`);
      }
    }

    // WAN/LTXV conditioning-like nodes
    // WAN/LTXV conditioning-like nodes (SAFE PATCHING)
for (const [id, n] of nodes) {
  const t = String(n?.class_type || "").toLowerCase();
  const looksLikeCond = t.includes("wan") || t.includes("conditioning") || t.includes("ltxv");
  if (!looksLikeCond) continue;

  const inputs = n?.inputs || {};
  let touched = false;

  // Only overwrite if the existing value is a STRING (i.e., not linked)
  const posFields = ["prompt", "text", "positive", "pos", "caption", "condition", "cond"];
  const negFields = ["negative", "negative_prompt"];

  for (const f of posFields) {
    if (f in inputs && typeof inputs[f] === "string") {
      patch(graph[id], ["inputs", f], positive);
      touched = true;
    }
  }
  for (const f of negFields) {
    if (f in inputs && typeof inputs[f] === "string") {
      patch(graph[id], ["inputs", f], negative);
      touched = true;
    }
  }

  if ("frame_rate" in inputs && typeof inputs.frame_rate !== "object") {
    patch(graph[id], ["inputs", "frame_rate"], fps);
    touched = true;
  }

  if (touched) patched.wanConditioning.push(id);
}

    // Img2Video node(s)
    for (const [id, n] of nodes) {
      const t = String(n?.class_type || "").toLowerCase();
      if (t.includes("imgtovideo") || t.includes("video")) {
        const inputs = n?.inputs || {};
        patch(graph[id], ["inputs", "width"], width);
        patch(graph[id], ["inputs", "height"], height);
        if ("length" in inputs) patch(graph[id], ["inputs", "length"], frames);
        if ("num_frames" in inputs) patch(graph[id], ["inputs", "num_frames"], frames);
        if ("frames" in inputs) patch(graph[id], ["inputs", "frames"], frames);
        if ("strength" in inputs) patch(graph[id], ["inputs", "strength"], strength);
        patched.img2video.push(id);
      }
    }

    // SaveVideo prefix
    for (const [id, n] of nodes) {
      const t = String(n?.class_type || "").toLowerCase();
      if (t.includes("savevideo") || t.includes("save video")) {
        patch(graph[id], ["inputs", "filename_prefix"], `video/${prefix}`);
        patched.saveVideo.push(id);
      }
    }

    // 3) Aggressive sweep across ALL nodes for any string text fields
    const sweepTouched = patchAllTextLike(graph, positive, negative);

    // Submit to Comfy
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (COMFY_KEY) headers["X-API-Key"] = COMFY_KEY;

    const sub = await fetch(`${COMFY_URL}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: graph, client_id: "filmmaker-ui" }),
      cache: "no-store",
    });

    const rawText = await sub.text();
    let subJson: any;
    try { subJson = JSON.parse(rawText); } catch { subJson = rawText; }

    if (!sub.ok) {
      return Response.json(
        { ok: false, code: "COMFY_SUBMIT_FAILED", error: subJson },
        { status: 500 }
      );
    }

    const { prompt_id } = (subJson || {});
    // Return immediately; your UI scans /output/video in the background
    return Response.json({ ok: true, prompt_id, patched, sweepTouched });
  } catch (err: any) {
    return Response.json(
      { ok: false, code: "SERVER_ERROR", error: String(err?.message || err) },
      { status: 500 }
    );
  }
}