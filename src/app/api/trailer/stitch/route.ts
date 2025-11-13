// src/app/api/comfy/stitch/route.ts
import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

const COMFY_URL = process.env.COMFY_URL!;
const COMFY_API_KEY = process.env.COMFY_API_KEY || "";
const WORKFLOW_PATH = join(process.cwd(), "public", "workflows", "stitch_workflow.json");

// tiny helper
const str = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

export async function POST(req: NextRequest) {
  try {
    console.log("[stitch route] posting to", COMFY_URL);
    const body = await req.json().catch(() => ({}));
    const {
      // from UI — prefer filenames if you have them, else prefixes
      clips,               // e.g. ["wan_..._shot_01_00001_.mp4", "wan_..._shot_02_00001_.mp4"]
      prefixes,            // e.g. ["wan_..._shot_01", "wan_..._shot_02"]
      audioPrefixes = [],  // e.g. ["trailer_music"]
      fps = 24,
      scale = "1920:1080", // or "keep"
      musicGainDb = -8,
    } = body || {};

    if ((!Array.isArray(clips) || clips.length === 0) &&
        (!Array.isArray(prefixes) || prefixes.length === 0)) {
      return new Response(JSON.stringify({ ok:false, error:"Provide clips[] or prefixes[]" }), { status: 400 });
    }

    // 1) load base workflow
    const raw = await readFile(WORKFLOW_PATH, "utf8");
    const wf = JSON.parse(raw);

    // 2) inject values into FilmforgeStitch node (id "1" in your file)
    const n = wf["1"]?.inputs ?? (wf["1"] = { inputs: {} }, wf["1"].inputs);

    // IMPORTANT: the node expects JSON **strings** for these fields
    n.prefixes_json       = clips?.length ? str(clips) : str(prefixes);
    n.audio_prefixes_json = str(audioPrefixes);

    // optional overrides
    n.fps            = fps;
    n.scale          = scale;
    n.music_gain_db  = musicGainDb;

    // hard paths (match your layout)
    n.video_dir      = "/workspace/ComfyUI/output/video";
    n.audio_dir      = "/workspace/ComfyUI/output/audio";
    n.dest_dir       = "/workspace/trailer_output";
    n.dest_name      = "trailer_final.mp4";
    n.use_shell_script = false;

    // 3) send to Comfy
  const r = await fetch(`${COMFY_URL}/prompt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: wf }), // ← wrap it!
});



    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return new Response(JSON.stringify({ ok:false, error:`Comfy ${r.status}`, detail:data }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok:true, data }), { status: 200 });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok:false, error:String(err?.message || err) }), { status: 500 });
  }
}