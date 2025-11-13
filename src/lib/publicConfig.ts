// src/lib/publicConfig.ts
export function getVastApiBase(): string {
  if (typeof window !== "undefined") {
    return (window as any).__FILMFORGE__?.VAST_API_BASE || "";
  }
  // SSR fallback (Next)
  return process.env.NEXT_PUBLIC_VAST_API_BASE || "";
}