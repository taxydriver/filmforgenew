import { NextRequest } from "next/server";
import { generateAudioPlan, musicPromptFromPlan, type AudioPlan } from "@/lib/audio";
import type { ModelProvider } from "@/types/model";

export const runtime = "nodejs";

function buildFallbackAudioPlan(params: {
  screenplay: string;
  shots: Array<{ id?: number; prompt?: string }>;
  duration: number;
}): AudioPlan {
  const { screenplay, shots, duration } = params;
  const safeShots =
    Array.isArray(shots) && shots.length
      ? shots
      : [{ id: 1, prompt: "Cinematic moment with rising tension" }];

  const perShot = Math.max(4, duration / safeShots.length);
  const timeline = safeShots.map((shot, idx) => {
    const start = Number((idx * perShot).toFixed(2));
    const end = Number(Math.min(duration, (idx + 1) * perShot).toFixed(2));
    const prompt = (shot.prompt || "story beat").trim();
    return {
      start_s: start,
      end_s: end,
      music_prompt: `underscore for ${prompt}`,
      sfx_prompt: "",
      vo: "",
      subtitle: null,
      shot_id: shot.id ?? idx + 1,
    };
  });

  const excerpt = (screenplay || "").replace(/\s+/g, " ").trim().slice(0, 280);
  const stableAudioPrompt =
    excerpt.length > 0
      ? `${duration}s cinematic trailer score inspired by: ${excerpt}`
      : `${duration}s cinematic trailer score with gradual build and dramatic hits`;

  return {
    bpm: 90,
    key: "Am",
    stems: ["music", "sfx"],
    timeline,
    stable_audio_prompt: stableAudioPrompt,
    mix_notes: "Fallback audio plan; keep VO clear and end with gentle tail.",
  };
}

export async function POST(req: NextRequest) {
  try {
    const {
      screenplay = "",
      shots = [],
      trailerShotsJson,
      duration = 45,
      provider = "openai",
    } = await req.json();

    if (!screenplay?.trim()) {
      return Response.json({ ok: false, error: "screenplay required" }, { status: 400 });
    }

    const shotsPayload =
      typeof trailerShotsJson === "string" && trailerShotsJson.trim().length > 0
        ? trailerShotsJson
        : JSON.stringify({ shots });

    try {
      const plan = await generateAudioPlan({
        screenplay,
        trailerShotsJson: shotsPayload,
        duration,
        provider: provider as ModelProvider,
      });
      const prompt = musicPromptFromPlan(plan);
      return Response.json({ ok: true, plan, prompt, fallback: false });
    } catch (err: any) {
      console.warn("[audio-plan] LLM parse fallback", err);
      const fallbackPlan = buildFallbackAudioPlan({ screenplay, shots, duration });
      const prompt =
        fallbackPlan.stable_audio_prompt || musicPromptFromPlan(fallbackPlan);
      return Response.json({
        ok: true,
        plan: fallbackPlan,
        prompt,
        fallback: true,
        warning: err?.message || String(err),
      });
    }
  } catch (err: any) {
    console.error("[audio-plan] error", err);
    return Response.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 },
    );
  }
}
