// src/app/api/storyboard/plan/route.ts
import { NextRequest } from "next/server";
import { chatOnce } from "@/lib/bedrock";
import {
  juggernautPromptEnhancers,
  trailerPlanV2Prompts,
} from "@/prompts";
import {
  buildPromptForShot,
  composeNegative,
  type PromptOptions,
} from "@/lib/promptStyles";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const BEDROCK_MODEL =
  process.env.BEDROCK_SONNET_MODEL ||
  process.env.NEXT_PUBLIC_BEDROCK_MODEL ||
  "anthropic.claude-3-5-sonnet-20240620-v1:0";

type ShotDraft = {
  prompt: string;
  negative?: string;
  seed?: number;
  width?: number;
  height?: number;
  fps?: number;
  length_frames?: number;
  strength?: number;
  dialogue?: string;
  subtitle?: string;
  music_cue?: string;
  sfx?: string[];
  id?: number;
};

type IncomingShot = Omit<ShotDraft, "sfx"> & {
  sfx?: string[] | string;
};

// ---------- helpers ----------
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return Number(h & 0xffffffff);
}

function parseShotsFromPlainText(text: string): ShotDraft[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const shots: ShotDraft[] = [];
  const re = /^SHOT\s+(\d+)\s*:\s*(.+)$/i;

  for (const ln of lines) {
    const m = ln.match(re);
    if (m) {
      const prompt = m[2].trim();
      if (prompt) shots.push({ prompt });
    }
  }
  if (shots.length === 0) {
    // looser fallback: any line beginning with SHOT
    for (const ln of lines) {
      if (/^SHOT\s+/i.test(ln)) {
        const p = ln.replace(/^SHOT\s+\d+\s*:\s*/i, "").trim();
        if (p) shots.push({ prompt: p });
      }
    }
  }
  return shots;
}

async function callOpenAI({ system, prompt, temperature }: { system: string; prompt: string; temperature: number }) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature,
      max_tokens: 1200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    const err = json?.error?.message || `OpenAI error (${res.status})`;
    const e = new Error(err);
    (e as any).status = res.status;
    throw e;
  }
  return json?.choices?.[0]?.message?.content || "";
}

// Extract JSON from ```json ... ```, ``` ... ```, or raw {...}
function extractJson(text: string): string | null {
  const fenceJson = text.match(/```json([\s\S]*?)```/i)?.[1];
  if (fenceJson) return fenceJson.trim();
  const fenceAny = text.match(/```([\s\S]*?)```/i)?.[1];
  if (fenceAny && fenceAny.trim().startsWith("{")) return fenceAny.trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const maybe = text.slice(firstBrace, lastBrace + 1).trim();
    if (maybe.startsWith("{") && maybe.endsWith("}")) return maybe;
  }
  return null;
}

// ---------- route ----------

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    screenplay,
    concept = "",
    look = "color",                         // legacy look key
    provider = "openai",                    // "openai" | "bedrock"
    temperature = 0.4,
    aspect = "landscape",                   // "portrait" | "landscape" | "square"
    options,                                // PromptOptions (rich visual controls)
    shots: requestedShots,
  }: {
    screenplay: string;
    concept?: string;
    look?: "color" | "classic" | "warm";
    provider?: "openai" | "bedrock";
    temperature?: number;
    aspect?: "portrait" | "landscape" | "square";
    options?: PromptOptions;
    shots?: number;
  } = body || {};

  if (!screenplay?.trim()) {
    return new Response("Missing screenplay", { status: 400 });
  }

  const trimmedScreenplay = String(screenplay).slice(0, 8000);

  const shotTarget = (() => {
    const num = Number(requestedShots);
    if (!Number.isFinite(num) || num <= 0) return 8;
    return Math.max(1, Math.min(12, Math.floor(num)));
  })();

  const system = trailerPlanV2Prompts.system;
  const user = trailerPlanV2Prompts.buildUserPrompt({
    concept: concept || "(none)",
    screenplay: trimmedScreenplay,
    shots: shotTarget,
    schema: trailerPlanV2Prompts.schema,
  });

  // Call LLM
  let rawText: string;
  try {
    rawText =
      provider === "openai"
        ? await callOpenAI({ system, prompt: user, temperature })
        : await chatOnce({ modelId: BEDROCK_MODEL, system, user, temperature });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = err?.status || 500;
    return Response.json({ ok: false, error: msg }, { status });
  }

  // Prefer JSON, fallback to SHOT lines
  let shotsArr: ShotDraft[] = [];
  const jsonText = extractJson(rawText);
  if (jsonText) {
    try {
      const data = JSON.parse(jsonText);
      if (Array.isArray(data?.shots)) {
        shotsArr = data.shots.map((s: any) => ({
          prompt: String(s?.prompt || "").trim(),
          negative: s?.negative ? String(s.negative).trim() : undefined,
        }));
      }
    } catch {
      // ignore, try SHOT parsing below
    }
  }
  if (shotsArr.length === 0) {
    shotsArr = parseShotsFromPlainText(rawText);
  }

  const parsedJson = (() => {
    if (!jsonText) return null;
    try {
      const parsed = JSON.parse(jsonText) as {
        shots?: IncomingShot[];
        structure?: string;
        notes?: string;
      };
      return parsed;
    } catch {
      return null;
    }
  })();

  if (parsedJson?.shots?.length) {
    shotsArr = parsedJson.shots
      .filter((s): s is IncomingShot => Boolean(s?.prompt))
      .map((s) => {
        let sfxArray: string[] | undefined;
        if (Array.isArray(s.sfx)) {
          sfxArray = s.sfx.map((item) => String(item).trim()).filter(Boolean);
        } else if (typeof s.sfx === "string") {
          sfxArray = s.sfx
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }
        return {
          prompt: String(s.prompt),
          negative: s.negative,
          seed: typeof s.seed === "number" ? s.seed : undefined,
          width: typeof s.width === "number" ? s.width : undefined,
          height: typeof s.height === "number" ? s.height : undefined,
          fps: typeof s.fps === "number" ? s.fps : undefined,
          length_frames:
            typeof s.length_frames === "number" ? s.length_frames : undefined,
          strength:
            typeof s.strength === "number" ? s.strength : undefined,
          dialogue:
            typeof s.dialogue === "string" ? s.dialogue.trim() : undefined,
          subtitle:
            typeof s.subtitle === "string" ? s.subtitle.trim() : undefined,
          music_cue:
            typeof s.music_cue === "string" ? s.music_cue.trim() : undefined,
          sfx: sfxArray,
          id: typeof s.id === "number" ? s.id : undefined,
        };
      });
  }

  shotsArr = shotsArr.filter((s) => s.prompt);
  const MAX_SHOTS = 12;
  if (MAX_SHOTS && shotsArr.length > MAX_SHOTS) shotsArr = shotsArr.slice(0, MAX_SHOTS);

  if (shotsArr.length === 0) {
    return Response.json(
      { ok: false, error: "Could not parse any shots from model output" },
      { status: 500 }
    );
  }

  // aspect → dims
  const dims =
    aspect === "portrait" ? { width: 576, height: 1024 } :
    aspect === "square"   ? { width: 768, height: 768 } :
                            { width: 1024, height: 576 };

  // legacy look
  const looks = juggernautPromptEnhancers.looks;
  const lookPrompt = looks[look as keyof typeof looks] ?? looks.classic;

  // If options provided, add legacy prefix as an extra so old “feel” remains
  const withLegacyPrefix: PromptOptions | undefined = options
    ? { ...options, extras: [juggernautPromptEnhancers.prefix, ...(options.extras ?? [])] }
    : undefined;

  // Enrich + seed
  const out = shotsArr.map((s, i) => {
    const core = String(s.prompt || "").replace(/\s+/g, " ").trim();

    const prompt = withLegacyPrefix
      ? buildPromptForShot(core, withLegacyPrefix)
      : `${juggernautPromptEnhancers.prefix}${lookPrompt}, ${core}`;

    const negative = withLegacyPrefix
      ? `${composeNegative(withLegacyPrefix)}${s.negative ? `, ${s.negative}` : ""}`.trim()
      : `${juggernautPromptEnhancers.negative}, ${s.negative ? s.negative : "low quality, artifacts"}`.trim();

    const seed = typeof s.seed === "number" ? s.seed : hashSeed(core + ":" + i);
    const width = typeof s.width === "number" ? s.width : dims.width;
    const height = typeof s.height === "number" ? s.height : dims.height;

    return {
      id: s.id ?? i + 1,
      prompt,
      negative,
      seed,
      width,
      height,
      fps: typeof s.fps === "number" ? s.fps : undefined,
      length_frames: typeof s.length_frames === "number" ? s.length_frames : undefined,
      strength: typeof s.strength === "number" ? s.strength : undefined,
      dialogue: s.dialogue,
      subtitle: s.subtitle,
      music_cue: s.music_cue,
      sfx: Array.isArray(s.sfx) ? s.sfx : undefined,
    };
  });

  return Response.json({
    ok: true,
    shots: out,
    meta: {
      aspect,
      look,
      provider,
      options: options ?? null,
      structure: parsedJson?.structure ?? null,
      notes: parsedJson?.notes ?? null,
    },
  });
}
