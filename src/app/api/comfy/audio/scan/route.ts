// src/app/api/comfy/audio/scan/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMFY_URL = process.env.COMFY_URL!; // e.g. http://HOST:PORT/comfy

/**
 * POST body:
 * {
 *   prefixes: string[],        // e.g. ["filmforge_test", "audio_173..."]
 *   maxIndex?: number,         // default 50 (audio is usually short runs)
 *   earlyStopMisses?: number   // default 3 (stop after N misses once n>3)
 * }
 * returns: { ok:true, results: Array<{ i:number, filename:string, url:string }> }
 */
export async function POST(req: Request) {
  try {
    const { prefixes, maxIndex = 50, earlyStopMisses = 3 } = await req.json();

    if (!Array.isArray(prefixes) || prefixes.length === 0) {
      return Response.json({ ok: false, error: "prefixes[] required" }, { status: 400 });
    }
    if (!COMFY_URL) {
      return Response.json({ ok: false, error: "COMFY_URL missing" }, { status: 500 });
    }

    const results: Array<{ i: number; filename: string; url: string }> = [];

    for (let i = 0; i < prefixes.length; i++) {
      const prefix = prefixes[i];
      let consecutiveMisses = 0;

      for (let n = 1; n <= maxIndex; n++) {
        // Mirror video naming: <prefix>_00001_.mp3 in subfolder=audio, type=output
        const fname = `${prefix}_${String(n).padStart(5, "0")}_.mp3`;
        const view = `${COMFY_URL}/view?filename=${encodeURIComponent(fname)}&subfolder=audio&type=output`;

        try {
          const res = await fetch(view, { method: "HEAD", cache: "no-store" });
          if (res.ok) {
            results.push({ i, filename: fname, url: view });
            consecutiveMisses = 0;
          } else {
            consecutiveMisses++;
            if (consecutiveMisses >= earlyStopMisses && n > 3) break;
          }
        } catch {
          consecutiveMisses++;
          if (consecutiveMisses >= earlyStopMisses && n > 3) break;
        }
      }
    }

    // Sort by prefix order then numeric suffix
    results.sort((a, b) => {
      if (a.i !== b.i) return a.i - b.i;
      const na = a.filename.match(/_(\d{5})_\.mp3$/);
      const nb = b.filename.match(/_(\d{5})_\.mp3$/);
      const ia = na ? parseInt(na[1], 10) : 0;
      const ib = nb ? parseInt(nb[1], 10) : 0;
      return ia - ib || a.filename.localeCompare(b.filename);
    });

    // Dedup
    const seen = new Set<string>();
    const unique = results.filter(r => (seen.has(r.filename) ? false : (seen.add(r.filename), true)));

    return Response.json({ ok: true, results: unique });
  } catch (err: any) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}