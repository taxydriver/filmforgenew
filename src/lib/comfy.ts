// src/lib/comfy.ts
// Unified, URL-agnostic ComfyUI client used across Filmforge (videos, audio, stitching).
// Pass the Comfy base URL from the caller (e.g., TrailerStep) to avoid env/process issues.

/** Resolve and normalize a base URL and join with a path */
function joinUrl(baseUrl: string, path: string) {
  const base = (baseUrl || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * Generic helper to submit a ComfyUI prompt.
 * @param baseUrl Comfy base URL (e.g., https://<ip>:<port>)
 * @param body    Comfy prompt body
 */
export async function comfyPrompt(baseUrl: string, body: any) {
  if (!baseUrl) throw new Error("comfyPrompt: baseUrl is required");
  const res = await fetch(joinUrl(baseUrl, "/prompt"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Comfy prompt failed: ${res.status}`);
  return await res.json();
}

/**
 * Waits until a FilmforgeStitch node finishes execution.
 * @param promptId The prompt id returned by /prompt
 * @param baseUrl  Comfy base URL
 */
export async function waitForFilmforgeStitch(promptId: string, baseUrl: string) {
  if (!baseUrl) throw new Error("waitForFilmforgeStitch: baseUrl is required");
  if (!promptId) throw new Error("waitForFilmforgeStitch: promptId is required");

  const pollUrl = joinUrl(baseUrl, `/history/${promptId}`);
  console.log(`[comfy.ts] Waiting for stitch job ${promptId} at ${baseUrl} ...`);

  // Poll up to ~6 minutes (90 * 4s)
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 4000));

    const res = await fetch(pollUrl, { cache: "no-store" });
    if (!res.ok) continue;

    const json = await res.json();
    const outs = json?.[promptId]?.outputs;
    if (!outs) continue;

    // Look for our FilmforgeStitch node output (text JSON with final_path/debug)
    for (const nodeId in outs) {
      const node = outs[nodeId];
      // Some Comfy nodes emit .text, others .text_output, handle both defensively.
      const textPayload: string | undefined = node?.text ?? node?.text_output;
      if (typeof textPayload === "string" && textPayload.trim().length > 0) {
        try {
          const parsed = JSON.parse(textPayload);
          const finalPath = parsed.final_path || parsed.finalPath;
          if (finalPath) {
            console.log("[comfy.ts] Stitch complete:", parsed);
            return {
              finalPath,
              debug: textPayload,
            };
          }
        } catch {
          // Not JSON? Ignore and continue polling.
        }
      }
    }
  }

  throw new Error("Stitch job timeout or missing output");
}

/**
 * Optional tiny client wrapper if you prefer an OO style in callers.
 */
export function comfyClient(baseUrl: string) {
  if (!baseUrl) throw new Error("comfyClient: baseUrl is required");
  return {
    prompt: (body: any) => comfyPrompt(baseUrl, body),
    historyRaw: async (promptId: string) => {
      const res = await fetch(joinUrl(baseUrl, `/history/${promptId}`), { cache: "no-store" });
      if (!res.ok) throw new Error(`History fetch failed: ${promptId}`);
      return res.json();
    },
    waitForStitch: (promptId: string) => waitForFilmforgeStitch(promptId, baseUrl),
    joinUrl: (path: string) => joinUrl(baseUrl, path),
    baseUrl,
  };
}