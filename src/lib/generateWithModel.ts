import type { ModelProvider } from "@/types/model";

type GenerateOptions = {
  provider: ModelProvider;
  prompt: string;
  system?: string;
  temperature?: number;
};

const ENDPOINTS: Record<ModelProvider, string> = {
  claude: "/api/bedrock/chat",
  openai: "/api/openai/chat",
};

function resolveApiBase() {
  if (typeof window !== "undefined") return "";
  const envBase =
    process.env.INTERNAL_API_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL;
  if (!envBase) return process.env.VITE_PROXY_API_TARGET || "http://127.0.0.1:3000";
  if (envBase.startsWith("http://") || envBase.startsWith("https://")) return envBase;
  return `https://${envBase}`;
}

export async function generateWithModel({
  provider,
  prompt,
  system = "",
  temperature = 0.7,
}: GenerateOptions): Promise<string> {
  try {
    const endpoint = ENDPOINTS[provider] ?? ENDPOINTS.claude;
    const base = resolveApiBase();
    const url =
      typeof window === "undefined" && base
        ? `${base.replace(/\/$/, "")}${endpoint}`
        : endpoint;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, system, temperature }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = data?.error || `HTTP ${res.status}`;
      throw new Error(message);
    }

    const text =
      (typeof data?.text === "string" && data.text) ||
      (typeof data?.output === "string" && data.output) ||
      "";

    return text || "";
  } catch (err) {
    console.error("LLM generation error:", err);
    return "Error: " + String(err);
  }
}
