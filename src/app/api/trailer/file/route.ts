// src/app/api/trailer/file/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMFY_URL = process.env.COMFY_URL!; // e.g. http://50.173.192.54:40986/comfy
const DEFAULT_NAME = "trailer_final.mp4";

// If you symlinked /workspace/trailer_output -> /workspace/ComfyUI/output/trailer_output,
// keep this in the candidates. Otherwise, comment it out.
const SUBFOLDER_CANDIDATES = ["trailer_output", "video"]; // try these in order

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") || DEFAULT_NAME;
  const safeName = name.split("/").pop()!; // no nested paths
  const range = req.headers.get("range") || undefined;

  // Try each candidate subfolder until one works
  for (const sub of SUBFOLDER_CANDIDATES) {
    const url = `${COMFY_URL}/view?filename=${encodeURIComponent(
      safeName
    )}&subfolder=${encodeURIComponent(sub)}&type=output`;

    const res = await fetch(url, {
      cache: "no-store",
      // Pass through Range for seeking in <video>
      headers: range ? { Range: range } : undefined,
    });

    if (res.ok && res.body) {
      // Pass through important headers for video playback
      const headers = new Headers();
      const copy = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
        "cache-control",
      ];
      for (const k of copy) {
        const v = res.headers.get(k);
        if (v) headers.set(k, v);
      }
      headers.set("access-control-allow-origin", "*");

      return new Response(res.body, { status: res.status, headers });
    }

    // If 404, try next subfolder; for other errors, bubble up.
    if (res.status !== 404) {
      const text = await res.text().catch(() => "");
      return new Response(text || "Upstream error", { status: res.status });
    }
  }

  return new Response("Not found in any subfolder", { status: 404 });
}