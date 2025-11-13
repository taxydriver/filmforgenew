// src/app/api/openai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini"; // or "gpt-4o-mini"

const client = apiKey ? new OpenAI({ apiKey }) : null;

export async function POST(req: NextRequest) {
  const rid = Math.random().toString(36).slice(2, 8);
  console.log(`[openai ${rid}] API KEY?`, apiKey ? "LOADED" : "EMPTY");

  if (!client) {
    console.error(`[openai ${rid}] Missing OPENAI_API_KEY`);
    return NextResponse.json(
      { ok: false, error: "Missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const { prompt, system = "", temperature = 0.7 } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      console.error(`[openai ${rid}] Missing prompt`);
      return NextResponse.json(
        { ok: false, error: "Missing prompt" },
        { status: 400 }
      );
    }

    console.log(`[openai ${rid}] invoking`, {
      model,
      temperature,
      plen: prompt.length,
      slen: system?.length || 0,
    });

    const messages: { role: "system" | "user"; content: string }[] = [];
    if (system) {
      messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: prompt });

    const completion = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: 1024,
      messages,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";

    console.log(`[openai ${rid}] success, text length=${text.length}`);

    // This matches what generateWithModel() expects: { text: "..." }
    return NextResponse.json({ ok: true, modelId: model, text });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = err?.status || 500;
    console.error(`[openai ${rid}] ERROR`, {
      msg,
      status,
      stack: err?.stack,
    });

    if (status === 429 || /rate limit/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "OpenAI throttling. Retry shortly." },
        { status: 429 }
      );
    }

    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// Optional: keep a simple GET for quick health checks
export async function GET() {
  return NextResponse.json({ ok: true, route: "openai/chat" });
}