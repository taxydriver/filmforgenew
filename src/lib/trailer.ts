// src/lib/trailer.ts
import type { ModelProvider } from "@/types/model";

// 🧠 LLM-based shot & trailer planning
export async function planTrailer({
  concept,
  screenplay = "",
  shots = 10,
  provider = "openai",
}: {
  concept: string;
  screenplay?: string;
  shots?: number;
  provider?: ModelProvider;
}) {
  const res = await fetch("/api/trailer/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept, screenplay, shots, provider }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// 🧩 Render shots using a graph template
export async function renderTrailer({
  shots,
  graphTemplate,
}: {
  shots: Array<{
    id: number;
    prompt: string;
    seed?: number;
    duration?: number;
    fps?: number;
    width?: number;
    height?: number;
  }>;
  graphTemplate?: any;
}) {
  const res = await fetch("/api/trailer/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shots, graphTemplate }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { ok: true, results: [{ shot_id, files, history }] }
}

// 🎬 Combine clips into one trailer
export async function stitchTrailer({
  clips,
  outputName,
  musicUrl,
  musicGainDb,
  crf,
  preset,
}: {
  clips: string[];
  outputName?: string;
  musicUrl?: string;
  musicGainDb?: number;
  crf?: number;
  preset?: string;
}) {
  const res = await fetch("/api/trailer/stitch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clips,
      outputName,
      musicUrl,
      musicGainDb,
      crf,
      preset,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { ok: true, path: "/tmp/..." }
}

// 📝 Plan storyboard shots from screenplay
export async function planShotsFromScreenplay(
  screenplay: string,
  count = 4,
  provider: ModelProvider = "openai"
): Promise<{ shots: Array<{ id: number; prompt: string; negative: string }> }> {
  const res = await fetch("/api/storyboard/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screenplay, shots: count, provider }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// 🖼️ Generate stills via Comfy SSE or JSON fallback
export async function generateStills(
  prompts: string[],
  onProgress?: (msg: { type: string; [key: string]: any }) => void
): Promise<{ ok: true; results: Array<{ prompt: string; url: string }> }> {
  const res = await fetch("/api/comfy/stills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompts }),
  });

  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("text/event-stream")) {
    // fallback to JSON if server didn't stream
    const data = await res.json();
    if (data?.ok && (data.images || data.results)) {
      const imgs = (data.images || data.results) as any[];
      return { ok: true, results: imgs };
    }
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }

  // --- streaming SSE reader ---
  const reader = res.body!.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalImages: Array<{ prompt: string; url: string }> = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);

      const line = chunk.startsWith("data:") ? chunk.slice(5).trim() : "";
      if (!line) continue;

      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      if (onProgress) onProgress(msg);

      if (msg?.type === "status" && msg.state === "done" && Array.isArray(msg.results)) {
        finalImages = msg.results as Array<{ prompt: string; url: string }>;
      }
    }
  }

  if (finalImages.length === 0) {
    throw new Error("No images received from stream");
  }

  // ✅ changed from `images` → `results` to match TrailerStep
  return { ok: true, results: finalImages };
}