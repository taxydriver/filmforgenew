import { NextRequest } from "next/server";
import { chatOnce } from "@/lib/bedrock";
import { trailerPlanPrompts } from "@/prompts";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const BEDROCK_TARGET =
  process.env.BEDROCK_SONNET_INFERENCE_PROFILE_ARN ||
  process.env.BEDROCK_INFERENCE_PROFILE_ARN ||
  process.env.BEDROCK_SONNET_MODEL ||
  process.env.NEXT_PUBLIC_BEDROCK_MODEL ||
  "anthropic.claude-3-5-sonnet-20240620-v1:0";

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
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY for OpenAI provider");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
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

export async function POST(req: NextRequest) {
  const {
    concept = "",
    screenplay = "",
    shots = 8,
    provider = "openai",
  } = await req.json();

  const system = trailerPlanPrompts.system;
  const schema = trailerPlanPrompts.schema;
  const user = trailerPlanPrompts.buildUserPrompt({
    concept,
    screenplay,
    shots,
    schema,
  });

  try {
    const temperature = 0.5;
    const text =
      provider === "openai"
        ? await callOpenAI({ system, prompt: user, temperature })
        : await chatOnce({ modelId: BEDROCK_TARGET, system, user, temperature });

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const fixSystem = "Fix the following into valid JSON only, no prose.";
      const fixed =
        provider === "openai"
          ? await callOpenAI({ system: fixSystem, prompt: text, temperature: 0.2 })
          : await chatOnce({
              modelId: BEDROCK_TARGET,
              system: fixSystem,
              user: text,
              temperature: 0.2,
            });
      json = JSON.parse(fixed);
    }

    return Response.json(json);
  } catch (e: any) {
    console.error("Trailer plan error:", e);
    return new Response(`Plan failed: ${e.message}`, { status: 500 });
  }
}
