export type ModelProviderName = "openai" | "anthropic";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCallArgs = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

const env = {
  provider: (process.env.FILMFORGE_MODEL_PROVIDER || "openai") as ModelProviderName,
  model: process.env.FILMFORGE_MODEL || "gpt-4o-mini",
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  apiBase: process.env.FILMFORGE_API_BASE,
};

export const DEFAULT_MODEL = env.model;

export async function callLLM({
  model,
  messages,
  temperature = 0.7,
  maxTokens = 1024,
}: ChatCallArgs) {
  if (env.provider === "anthropic") {
    if (!env.anthropicKey) throw new Error("ANTHROPIC_API_KEY missing");
    const system = messages.find((m) => m.role === "system")?.content || "";
    const body = {
      model,
      system: system || undefined,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] })),
      temperature,
      max_tokens: maxTokens,
    };

    const res = await fetch((env.apiBase || "https://api.anthropic.com") + "/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.content?.[0]?.text ?? "";
  }

  // OpenAI
  if (!env.openaiKey) throw new Error("OPENAI_API_KEY missing");
  const res = await fetch((env.apiBase || "https://api.openai.com/v1") + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openaiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}