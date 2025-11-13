// src/lib/audio.ts
import { audioVoPlanPrompts } from "@/prompts";
import { generateWithModel } from "@/lib/generateWithModel";
import type { ModelProvider } from "@/types/model";

/* ----------------------------- Types ----------------------------- */

export type AudioStem = "pad" | "perc" | "hits" | "rise" | "downer" | "vox" | string;

export interface AudioTimelineSeg {
  start_s: number;
  end_s: number;
  music?: AudioStem[];       // e.g. ["pad","perc"]
  sfx?: string[];            // e.g. ["rain","whoosh"]
  vo?: string | null;        // voiceover line
  subtitle?: string | null;  // optional on-screen text
  shot_id?: number | null;
}

export interface AudioPlan {
  bpm?: number;
  key?: string;
  stems?: AudioStem[];
  timeline: AudioTimelineSeg[];
  mix_notes?: string;
}

/* ------------------------ JSON Utilities ------------------------- */

function safeJsonParse<T = any>(raw: string): T {
  const s = (raw || "").trim();
  try {
    // Strip any leading/trailing junk if model slipped markdown
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    const body = start >= 0 && end >= 0 ? s.slice(start, end + 1) : s;
    return JSON.parse(body) as T;
  } catch (e) {
    throw new Error("Failed to parse audio plan JSON: " + (e as Error).message);
  }
}

function secondsClamp(n: number, min = 2, max = 300) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/* -------------------- Plan Generation (LLM) ---------------------- */

export async function generateAudioPlan(opts: {
  screenplay: string;
  trailerShotsJson: string;   // pass your storyboard/trailer JSON string
  duration?: number;          // total target seconds, default 45
  provider: ModelProvider;
}): Promise<AudioPlan> {
  const { screenplay, trailerShotsJson, duration = 45, provider } = opts;

  const system = audioVoPlanPrompts.system;
  const schema = audioVoPlanPrompts.schema;

  const prompt = audioVoPlanPrompts.buildUserPrompt({
    screenplay,
    trailerShotsJson,
    duration,
    schema,
  });

  const raw = await generateWithModel({ provider, system, prompt });

  const fixJson = async (bad: string) => {
    const fixSystem =
      "You repair malformed JSON. Return ONLY valid JSON matching the provided schema. No prose.";
    const fixPrompt = `Schema:\n${schema}\n\nMalformed JSON:\n${bad}\n\nReturn valid JSON only.`;
    const fixed = await generateWithModel({
      provider,
      system: fixSystem,
      prompt: fixPrompt,
    });
    return fixed;
  };

  let plan: AudioPlan;
  try {
    plan = safeJsonParse<AudioPlan>(raw);
  } catch (err) {
    const repaired = await fixJson(raw);
    plan = safeJsonParse<AudioPlan>(repaired);
  }

  // Basic sanity: ensure timeline exists & sorted
  if (!Array.isArray(plan.timeline)) plan.timeline = [];
  plan.timeline = plan.timeline
    .map(seg => ({
      ...seg,
      start_s: Number(seg.start_s ?? 0),
      end_s: Number(seg.end_s ?? 0),
      music: Array.isArray(seg.music) ? seg.music : [],
      sfx: Array.isArray(seg.sfx) ? seg.sfx : [],
      vo: seg.vo ?? null,
      subtitle: seg.subtitle ?? null,
      shot_id: typeof seg.shot_id === "number" ? seg.shot_id : null,
    }))
    .sort((a, b) => a.start_s - b.start_s);

  return plan;
}

/* ------------- Convert Plan → Single Music Prompt ---------------- */

export function musicPromptFromPlan(plan: AudioPlan): string {
  const bpm = plan.bpm ? `, ${plan.bpm} BPM` : "";
  const key = plan.key ? `, key ${plan.key}` : "";
  const stems = plan.stems?.length ? `; stems: ${plan.stems.join(", ")}` : "";

  // Summarize musical arc from timeline
  const cues: string[] = [];
  for (const seg of plan.timeline) {
    const t = `[${seg.start_s}-${seg.end_s}s]`;
    const mus = seg.music?.length ? `music=${seg.music.join("+")}` : "music=silence";
    const sfx = seg.sfx?.length ? ` sfx=${seg.sfx.join(",")}` : "";
    const vo = seg.vo ? " (duck for VO)" : "";
    cues.push(`${t} ${mus}${sfx}${vo}`);
  }

  // A single compact prompt for Stable Audio (style-oriented)
  return [
    `cinematic trailer score${bpm}${key}${stems}`,
    `dark atmospheric pad; tension rise; percussive impacts; subtle braams;`,
    `clear edit points; dynamics that follow VO moments;`,
    `structure: slow open → rising tension → big hits → resolve tail`,
    `cues: ${cues.join(" | ")}`,
  ].join(" ");
}

/* ---------------- Comfy: Submit & Scan Helpers ------------------- */

export async function generateAudioTrack(opts: {
  prompt: string;
  seconds?: number;                  // default 45
  seed?: number;
  template?: string;                 // default "/workflows/audio_trailer_v1.json"
  prefix?: string;                   // optional output prefix
}): Promise<{ ok?: boolean; url?: string; filename?: string; job_id?: string; [k: string]: any }> {
  const {
    prompt,
    seconds = 45,
    seed = Math.floor(Math.random() * 2_147_483_647),
    template = "/workflows/audio_trailer_v1.json",
    prefix,
  } = opts;

  const body = {
    prompt,
    seconds: secondsClamp(seconds, 3, 300),
    seed,
    template,
    ...(prefix ? { prefix } : {}),
  };

  const res = await fetch("/api/comfy/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Audio generation failed (${res.status}): ${txt || res.statusText}`);
  }
  return await res.json();
}

export async function scanAudioOutputs(prefixes: string[]): Promise<Array<{ url: string; filename: string }>> {
  if (!prefixes?.length) return [];
  const res = await fetch("/api/comfy/audio/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Audio scan failed (${res.status}): ${txt || res.statusText}`);
  }
  const j = await res.json();
  return Array.isArray(j?.results) ? j.results : [];
}

/* ---------------------- Duration Utilities ----------------------- */

export function pickBestDurationFromClips(clips: Array<{ url: string; i: number }>, fallback = 45): number {
  if (!Array.isArray(clips) || clips.length === 0) return fallback;
  // naive: assume each clip ~2s unless you store metadata; scale up
  const approx = Math.max(fallback, clips.length * 2 + 3);
  return secondsClamp(approx, 10, 180);
}

/* ------------------- High-level Convenience ---------------------- */

/**
 * One-shot: build plan → make a Stable Audio prompt → render track.
 * Returns both plan and comfy response.
 */
export async function planAndRenderMusic(opts: {
  screenplay: string;
  trailerShotsJson: string;
  targetSeconds?: number;
  provider: ModelProvider;
  prefix?: string;
}) {
  const { screenplay, trailerShotsJson, targetSeconds = 45, provider, prefix } = opts;

  // 1) Plan (VO/SFX/Music timeline)
  const plan = await generateAudioPlan({
    screenplay,
    trailerShotsJson,
    duration: targetSeconds,
    provider,
  });

  // 2) Turn plan into a concise music prompt
  const prompt = musicPromptFromPlan(plan);

  // 3) Render via Comfy audio workflow
  const render = await generateAudioTrack({
    prompt,
    seconds: targetSeconds,
    prefix,
  });

  return { plan, prompt, render };
}
