// src/app/api/storyboard-characters/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Shot = { id: number; prompt: string; negative?: string; seed?: number; width?: number; height?: number; };
type Character = { name: string; description: string; role?: string; style?: string; };

function norm(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function appearsIn(prompt: string, name: string) {
  const p = ` ${norm(prompt)} `;
  const n = ` ${norm(name)} `;
  return p.includes(n);
}

export async function POST(req: NextRequest) {
  const {
    screenplay,
    look = "color",
    aspect = "landscape",
    provider = "openai",
    temperature = 0.4,
    options, // ✅ define it here
  } = (await req.json()) || {};

  if (!screenplay?.trim()) return new Response("Missing screenplay", { status: 400 });

  const origin =
    process.env.INTERNAL_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(req.url).origin;

  // 1️⃣ Storyboard (forward options properly)
  const sbRes = await fetch(`${origin}/api/storyboard/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screenplay, look, aspect, provider, temperature, options }), // ✅ now defined
  });

  const storyboardText = await sbRes.text();
  let storyboard: any = null;
  if (storyboardText) {
    try {
      storyboard = JSON.parse(storyboardText);
    } catch {
      /* ignore */
    }
  }

  if (!sbRes.ok || !storyboard?.ok) {
    const msg =
      storyboard?.error ||
      (storyboardText?.trim()
        ? storyboardText
        : `Storyboard failed (${sbRes.status})`);
    return Response.json({ ok: false, error: msg }, { status: sbRes.status || 500 });
  }

  const shots: Shot[] = storyboard.shots || [];

  // 2️⃣ Characters
  const chRes = await fetch(`${origin}/api/characters/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screenplay, provider }),
  });

  const charactersText = await chRes.text();
  let chJson: any = null;
  if (charactersText) {
    try {
      chJson = JSON.parse(charactersText);
    } catch {
      /* ignore */
    }
  }

  if (!chRes.ok || !chJson?.ok) {
    const msg =
      chJson?.error ||
      (charactersText?.trim()
        ? charactersText
        : `Character extraction failed (${chRes.status})`);
    return Response.json({ ok: false, error: msg }, { status: chRes.status || 500 });
  }

  const characters: Character[] = Array.isArray(chJson.characters)
    ? chJson.characters
    : [];

  // 3️⃣ Shot–Character mapping
  const map: Record<number, string[]> = {};
  for (const shot of shots) {
    const names: string[] = [];
    for (const c of characters) {
      if (appearsIn(shot.prompt, c.name)) names.push(c.name);
    }
    map[shot.id] = names;
  }

  return Response.json({
    ok: true,
    look,
    aspect,
    provider,
    options: options ?? null,
    shots,
    characters,
    mapping: map,
  });
}