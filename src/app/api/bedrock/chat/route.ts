// src/app/api/bedrock/chat/route.ts
import { NextRequest } from "next/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";

export const runtime = "nodejs";

const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";
const modelId = process.env.BEDROCK_SONNET_MODEL || "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region });

export async function POST(req: NextRequest) {
  const rid = Math.random().toString(36).slice(2,8);
  try {
    const { prompt, system = "", temperature = 0.7 } = await req.json();

    // quick input guard
    if (!prompt || typeof prompt !== "string") {
      return Response.json({ ok: false, error: "Missing prompt" }, { status: 400 });
    }

    const body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      temperature,
      system,
      messages: [{ role: "user", content: prompt }],
    };

    console.log(`[bedrock ${rid}] invoking`, { region, modelId, t: temperature, plen: prompt.length, slen: system?.length || 0 });

    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 400;
    let lastError: any;
    let res: InvokeModelCommandOutput | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        res = await client.send(new InvokeModelCommand({
          modelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify(body),
        }));
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        const name = err?.name || err?.__type || "";
        const message = err?.message ? String(err.message) : "";
        const isThrottle = /Throttling/i.test(name) || /Too many requests/i.test(message);
        if (isThrottle && attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }

    if (!res) {
      throw lastError ?? new Error("Failed to invoke Bedrock model");
    }

    const decoded = new TextDecoder().decode(res.body);
    const parsed = JSON.parse(decoded);
    const text =
      parsed?.content?.[0]?.text ??
      parsed?.output_text ??
      "";

    return Response.json({ ok: true, modelId, text });
  } catch (err: any) {
    // Make sure client never sees HTML; log useful internals
    const msg = err?.message || String(err);
    const meta = err?.$metadata ? { ...err.$metadata } : undefined;
    console.error(`[bedrock ${rid}] ERROR`, { msg, name: err?.name, code: err?.__type || err?.Code, meta, stack: err?.stack });

    // Throttling: surface a friendly message
    if ((err?.name || "").includes("Throttling") || /Too many requests/i.test(msg)) {
      return Response.json({ ok: false, error: "Bedrock throttling. Retry shortly." }, { status: 429 });
    }

    // Region/model mismatch often shows up as 4xx but Next wraps as 500
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
