// app/api/comfy/audio/route.ts
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

const COMFY_BASE = process.env.COMFY_BASE || "http://127.0.0.1:8188/comfy";
const AUDIO_WORKFLOWS_DIR = process.env.AUDIO_WORKFLOWS_DIR || "public/workflows";
const AUDIO_WORKFLOW_PATH = process.env.AUDIO_WORKFLOW_PATH || "audio_trailer_v1.json";

type JsonMap = Record<string, any>;

/**
 * Patch the workflow:
 * - randomize seeds
 * - inject the positive prompt into CLIPTextEncode
 * - optionally override seconds on EmptyLatentAudio
 * - set filename_prefix for audio saver nodes
 */
function patchWorkflow(
  wf: JsonMap,
  { prompt, seconds, prefix }: { prompt: string; seconds: number; prefix?: string }
): JsonMap {
  // Work on a clone so we don't mutate the cached JSON object
  const cloned: JsonMap = JSON.parse(JSON.stringify(wf));
  const patchedInfo: string[] = [];

  for (const [id, node] of Object.entries<any>(cloned)) {
    const ip = node?.inputs || {};
    const t = String(node?.class_type || "");

    // 1) Randomize any seed fields
    if ("seed" in ip && typeof ip.seed === "number") {
      ip.seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      patchedInfo.push(`#${id} ${t}: seed randomized`);
    }

    // 2) Inject positive prompt into CLIPTextEncode
    if (t === "CLIPTextEncode") {
      // Heuristic: non-empty text node assumed to be positive prompt (node 6)
      if (typeof ip.text === "string" && ip.text.length > 0) {
        ip.text = prompt;
        patchedInfo.push(
          `#${id} ${t}: text="${String(ip.text).slice(0, 60)}..."`
        );
      }
      // If you ever want to inject negative prompt too,
      // you can add another branch here for empty text.
    }

    // 3) Override duration if requested
    if (t === "EmptyLatentAudio" && typeof ip.seconds === "number" && seconds > 0) {
      ip.seconds = seconds;
      patchedInfo.push(`#${id} ${t}: seconds=${ip.seconds}`);
    }

    // 4) Audio saver nodes → adjust filename prefix
    const isAudioSaver =
      /^SaveAudio/i.test(t) ||
      /AudioSave/i.test(t) ||
      /SaveAudio(MP3|WAV)/i.test(t) ||
      (("filename_prefix" in ip) && /audio|ComfyUI/i.test(ip.filename_prefix ?? ""));

    if (isAudioSaver && prefix) {
      // Preserve "audio/" folder and replace base name
      ip.filename_prefix = `audio/${prefix}`;
      patchedInfo.push(`#${id} ${t}: filename_prefix="${ip.filename_prefix}"`);
    }
  }

  console.log("🎧 patched fields:", patchedInfo.join(" | "));
  return cloned;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string = body?.prompt;
    const seconds: number = Number(body?.seconds) || 0; // 0 = keep workflow default
    const prefix: string | undefined = body?.prefix;     // e.g. "audio_2025-11-13T16-04-03-905Z"
    const template: string = body?.template || AUDIO_WORKFLOW_PATH;

    if (!prompt) {
      return NextResponse.json(
        { ok: false, error: "Missing 'prompt'" },
        { status: 400 }
      );
    }

    // Resolve workflow path
    const wfPath = path.join(process.cwd(), AUDIO_WORKFLOWS_DIR, template);
    const raw = await fs.readFile(wfPath, "utf8");
    const wf = JSON.parse(raw);

    // Patch seeds, prompt, duration, and saver prefix
    const patched = patchWorkflow(wf, { prompt, seconds, prefix });

    console.log("🎧 comfy audio request");
    console.log("  prompt =", prompt.slice(0, 120));
    if (seconds > 0) console.log("  seconds override =", seconds);
    if (prefix) {
      console.log("  prefix =", prefix);
    }

    // Comfy expects { client_id, prompt }
    const payload = { client_id: "filmforge-audio", prompt: patched };

    const r = await fetch(`${COMFY_BASE}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) {
      console.error("🎧 comfy /prompt error:", r.status, text);
      return NextResponse.json(
        { ok: false, error: `Comfy /prompt failed (${r.status})`, detail: text },
        { status: 400 }
      );
    }

    const json = JSON.parse(text);
    return NextResponse.json({ ok: true, base: COMFY_BASE, result: json });
  } catch (e: any) {
    console.error("🎧 comfy audio route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}