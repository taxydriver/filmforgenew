import { NextRequest } from "next/server";
import { chatOnce } from "@/lib/bedrock";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `
You are a film development assistant that reads screenplays and extracts
character profiles for AI visualization. For each named character, return:
- "name"
- "description" (physical features, clothing, ethnicity, gender, vibe)
- "role" (their narrative purpose)
- "style" (optional camera/lighting cues)
Respond only in strict JSON:
{ "characters": [ { "name": "...", "description": "...", "role": "...", "style": "..." }, ... ] }
`;

async function callOpenAI(prompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "OpenAI error");
  return json.choices?.[0]?.message?.content || "";
}

export async function POST(req: NextRequest) {
  const { screenplay, provider = "openai" } = await req.json();
  if (!screenplay?.trim()) {
    return new Response("Missing screenplay text", { status: 400 });
  }

  let text: string;
  try {
    if (provider === "claude") {
      text = await chatOnce({
        modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        system: SYSTEM_PROMPT,
        user: screenplay.slice(0, 8000),
        temperature: 0.6,
      });
    } else {
      text = await callOpenAI(screenplay.slice(0, 8000));
    }
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }

  // extract JSON safely
  const jsonMatch = text.match(/```json([\s\S]*?)```/i)?.[1] || text.match(/```([\s\S]*?)```/i)?.[1] || text;
  let data: any;
  try {
    data = JSON.parse(jsonMatch);
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON from model" }, { status: 500 });
  }

  return Response.json({ ok: true, characters: data.characters || [] });
}