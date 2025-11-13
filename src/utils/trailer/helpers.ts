export type MediaLike = {
  rawUrl?: string;
  url?: string;
  filename?: string;
};

export function extractFilename(u?: string) {
  if (!u) return undefined;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(u, base);
    const fromQuery = url.searchParams.get("filename") ?? url.searchParams.get("name");
    if (fromQuery) return fromQuery;
    const segs = url.pathname.split("/").filter(Boolean);
    const last = segs.at(-1);
    return last && last.includes(".") ? last : undefined;
  } catch {
    const parts = u.split("/").filter(Boolean);
    const last = parts.at(-1);
    return last && last.includes(".") ? last : undefined;
  }
}

export function filenameFromAny(obj: MediaLike, fallback?: string) {
  if (obj.filename) return obj.filename;
  const fromRaw = extractFilename(obj.rawUrl);
  if (fromRaw) return fromRaw;
  const fromUrl = extractFilename(obj.url);
  if (fromUrl) return fromUrl;
  return fallback;
}

export function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function prefixFromFilename(name?: string): string | null {
  if (!name) return null;
  const match = name.match(/^(.*?_shot_\d+)(?:_\d+_)?\.[a-z0-9]+$/i);
  return match ? match[1] : null;
}

export function collectPrefixes(
  startedPrefixes: string[],
  clips: Array<{ filename?: string }> = [],
) {
  if (startedPrefixes?.length) return Array.from(new Set(startedPrefixes));
  const derived = clips
    .map((c) => prefixFromFilename(c.filename || ""))
    .filter((p): p is string => Boolean(p));
  return Array.from(new Set(derived));
}
