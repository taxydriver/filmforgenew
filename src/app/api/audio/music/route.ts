import { NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const MUSIC_URL =
  process.env.ELEVENLABS_MUSIC_URL || "https://api.elevenlabs.io/v1/music/generate";
const OUT_DIR = join(process.cwd(), "public", "audio", "music");

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!ELEVEN_KEY) {
      return Response.json(
        { ok: false, error: "ELEVENLABS_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const {
      prompt = "",
      duration = 45,
      seed,
      style,
      mode = "track",
      outputFormat = "mp3_44100_128",
      prefix,
    } = await req.json();

    if (!prompt?.trim()) {
      return Response.json({ ok: false, error: "prompt is required" }, { status: 400 });
    }

    const durationSeconds = Math.max(5, Math.min(180, Math.round(Number(duration) || 45)));

    const body: Record<string, any> = {
      prompt,
      duration_seconds: durationSeconds,
      mode,
      output_format: outputFormat,
    };

    if (typeof seed === "number") body.seed = seed;
    if (style) body.style = style;

    const response = await fetch(MUSIC_URL, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return Response.json(
        { ok: false, error: `ElevenLabs ${response.status}`, detail },
        { status: response.status }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await ensureDir(OUT_DIR);
    const filename = `${prefix || `music_${Date.now()}`}.mp3`;
    await writeFile(join(OUT_DIR, filename), buffer);

    return Response.json({
      ok: true,
      url: `/audio/music/${filename}`,
      filename,
    });
  } catch (err: any) {
    console.error("[api/audio/music] error", err);
    return Response.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
