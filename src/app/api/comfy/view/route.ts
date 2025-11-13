// src/app/api/comfy/view/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const COMFY_BASE =
  process.env.COMFY_BASE || "http://127.0.0.1:8188/comfy";

/**
 * Simple proxy to ComfyUI /view endpoint.
 *
 * Example:
 *   /api/comfy/view?filename=foo.mp4&subfolder=video&type=output
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const filename = url.searchParams.get("filename");
  const type = url.searchParams.get("type") ?? "output";
  const subfolder = url.searchParams.get("subfolder") ?? "";

  if (!filename) {
    return new Response("Missing filename", { status: 400 });
  }

  const target = `${COMFY_BASE}/view?filename=${encodeURIComponent(
    filename
  )}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(
    type
  )}`;

  try {
    const upstream = await fetch(target);

    if (!upstream.ok) {
      return new Response(
        `Comfy /view failed (${upstream.status})`,
        { status: upstream.status }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const buf = await upstream.arrayBuffer();

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    console.error("[/api/comfy/view] error", err);
    return new Response("Proxy error", { status: 500 });
  }
}