export type CharacterInput = {
  name: string;
  description: string;
  style?: string;
};

export type PortraitResult = { pose: string; url?: string; error?: string };

export type PortraitMap = Record<string, PortraitResult[]>;

export async function generatePortraitsForCharacters(
  characters: CharacterInput[] = [],
  poses: string[] = ["front", "profile", "3-quarter"],
): Promise<PortraitMap> {
  const out: PortraitMap = {};
  for (const char of characters) {
    if (!char?.name || !char?.description) continue;
    try {
      out[char.name] = await requestPortraits(char, poses);
    } catch (err: any) {
      out[char.name] = [{ pose: poses[0] ?? "front", error: String(err?.message || err) }];
    }
  }
  return out;
}

async function requestPortraits(
  character: CharacterInput,
  poses: string[],
): Promise<PortraitResult[]> {
  const res = await fetch("/api/comfy/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      character: character.name,
      description: character.description,
      style: character.style,
      poses,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Portrait request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let final: PortraitResult[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (!chunk) continue;
      const line = chunk.startsWith("data:") ? chunk.slice(5).trim() : chunk;
      if (!line) continue;

      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      if (msg?.type === "status" && msg.state === "done" && Array.isArray(msg.results)) {
        final = msg.results as PortraitResult[];
      }
      if (msg?.type === "error") {
        throw new Error(msg.message || "Portrait generation error");
      }
    }
  }

  if (!final.length) {
    throw new Error("Portrait worker returned no images");
  }

  return final;
}
