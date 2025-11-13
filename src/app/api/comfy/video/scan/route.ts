// src/app/api/comfy/video/scan/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMFY_URL = process.env.COMFY_URL!; // e.g. https://host/comfy

/**
 * POST body:
 * {
 *   prefixes: string[],        // e.g. ["wan_shot_01", "wan_shot_02"]
 *   maxIndex?: number,         // optional upper bound per prefix (default 200)
 *   earlyStopMisses?: number   // stop after N consecutive misses (default 3) once n>5
 * }
 * returns: { ok:true, results: Array<{ i:number, filename:string, url:string }> }
 */
export async function POST(req: Request) {
  try {
    const {
      prefixes,
      maxIndex = 200,
      earlyStopMisses = 3,
    } = await req.json();

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
        const fname = `${prefix}_${String(n).padStart(5, "0")}_.mp4`;
        const view = `${COMFY_URL}/view?filename=${encodeURIComponent(fname)}&subfolder=video&type=output`;

        try {
          const res = await fetch(view, { method: "HEAD", cache: "no-store" });
          if (res.ok) {
            results.push({ i, filename: fname, url: view });
            consecutiveMisses = 0; // reset on hit
          } else {
            consecutiveMisses++;
            if (consecutiveMisses >= earlyStopMisses && n > 5) break; // likely end of sequence
          }
        } catch {
          consecutiveMisses++;
          if (consecutiveMisses >= earlyStopMisses && n > 5) break;
        }
      }
    }

    // Sort by prefix order then numeric suffix
    results.sort((a, b) => {
      if (a.i !== b.i) return a.i - b.i;
      const na = a.filename.match(/_(\d{5})_\.mp4$/);
      const nb = b.filename.match(/_(\d{5})_\.mp4$/);
      const ia = na ? parseInt(na[1], 10) : 0;
      const ib = nb ? parseInt(nb[1], 10) : 0;
      return ia - ib || a.filename.localeCompare(b.filename);
    });

    // Dedup by filename (just in case)
    const seen = new Set<string>();
    const unique = results.filter(r => {
      if (seen.has(r.filename)) return false;
      seen.add(r.filename);
      return true;
    });

    return Response.json({ ok: true, results: unique });
  } catch (err: any) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}