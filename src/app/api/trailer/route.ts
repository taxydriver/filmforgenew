import { NextRequest } from "next/server";
import { generateAudioPlan, musicPromptFromPlan, type AudioPlan } from "@/lib/audio";
import { chatOnce } from "@/lib/bedrock";
import { trailerPlanPrompts } from "@/prompts";
import type { ModelProvider } from "@/types/model";

export const runtime = "nodejs";

async function callOpenAI({
  system,
  prompt,
  temperature,
}: {
  system: string;
  prompt: string;
  temperature: number;
}) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
  if (!key) throw new Error("OPENAI_API_KEY missing for /api/trailer");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    const err = json?.error?.message || `OpenAI error (${res.status})`;
    throw new Error(err);
  }
  return json?.choices?.[0]?.message?.content || "";
}

async function planTrailerShots({
  concept,
  screenplay,
  shots,
  provider,
}: {
  concept: string;
  screenplay: string;
  shots: number;
  provider: ModelProvider;
}) {
  const system = trailerPlanPrompts.system;
  const schema = trailerPlanPrompts.schema;
  const user = trailerPlanPrompts.buildUserPrompt({
    concept,
    screenplay,
    shots,
    schema,
  });
  const temperature = 0.4;

  const text =
    provider === "openai"
      ? await callOpenAI({ system, prompt: user, temperature })
      : await chatOnce({
          modelId:
            process.env.BEDROCK_SONNET_INFERENCE_PROFILE_ARN ||
            process.env.BEDROCK_INFERENCE_PROFILE_ARN ||
            process.env.BEDROCK_SONNET_MODEL ||
            process.env.NEXT_PUBLIC_BEDROCK_MODEL ||
            "anthropic.claude-3-5-sonnet-20240620-v1:0",
          system,
          user,
          temperature,
        });

  try {
    return JSON.parse(text);
  } catch {
    const fixSystem = "Fix the following into valid JSON only, no prose.";
    const fixed =
      provider === "openai"
        ? await callOpenAI({ system: fixSystem, prompt: text, temperature: 0.1 })
        : await chatOnce({
            modelId:
              process.env.BEDROCK_SONNET_INFERENCE_PROFILE_ARN ||
              process.env.BEDROCK_INFERENCE_PROFILE_ARN ||
              process.env.BEDROCK_SONNET_MODEL ||
              process.env.NEXT_PUBLIC_BEDROCK_MODEL ||
              "anthropic.claude-3-5-sonnet-20240620-v1:0",
            system: fixSystem,
            user: text,
            temperature: 0.1,
          });
    return JSON.parse(fixed);
  }
}

function firstShotPrompt(shots: Array<{ prompt?: string }>): string {
  const prompt = shots?.[0]?.prompt;
  if (typeof prompt === "string" && prompt.trim()) return prompt.trim();
  return "Cinematic trailer hero shot, dramatic lighting, film grain";
}

export async function POST(req: NextRequest) {
  try {
    const {
      screenplay = "",
      concept = "",
      storychars = null,
      provider = "openai",
    } = await req.json();

    if (!screenplay.trim()) {
      return Response.json(
        { ok: false, error: "screenplay required" },
        { status: 400 }
      );
    }

    // Step 1: plan minimal trailer shots
    const shotsPayload =
      storychars?.shots && storychars.shots.length
        ? storychars
        : await planTrailerShots({
            concept,
            screenplay,
            shots: 4,
            provider,
          });

    const shotsList =
      shotsPayload?.shots && Array.isArray(shotsPayload.shots)
        ? shotsPayload.shots
        : [];

    if (shotsList.length === 0) {
      throw new Error("Shot plan failed; no shots returned");
    }

    // Step 2: audio plan prompt
    let audioPlan: AudioPlan;
    let audioPrompt: string;
    try {
      audioPlan = await generateAudioPlan({
        screenplay,
        trailerShotsJson: JSON.stringify({ shots: shotsList }),
        duration: 45,
        provider,
      });
      audioPrompt = musicPromptFromPlan(audioPlan);
    } catch (err) {
      console.warn("[/api/trailer] audio plan fallback", err);
      audioPlan = {
        bpm: 90,
        key: "Am",
        timeline: [],
        mix_notes: "Fallback audio plan",
      };
      audioPrompt =
        "45-second cinematic trailer score, slow build → impacts → tail, dramatic.";
    }

    // Step 3: synthetic trailer payload (placeholder)
    const trailer = {
      videoUrl: "about:blank",
      description: [
        "Auto-run placeholder trailer.",
        "",
        "Stills prompt:",
        firstShotPrompt(shotsList),
        "",
        "Audio prompt:",
        audioPrompt,
      ].join("\n"),
    };

    return Response.json({
      ok: true,
      trailer,
      shots: shotsList,
      audioPrompt,
      audioPlan,
    });
  } catch (err: any) {
    console.error("/api/trailer error:", err);
    return Response.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}

