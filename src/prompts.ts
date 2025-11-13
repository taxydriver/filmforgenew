export const conceptPrompts = {
  system:
    "You are a professional film development assistant. Return ONLY plain text (no markdown). Structure the response with clear section headings.",
  buildUserPrompt: (idea: string) => `Develop a cohesive FILM CONCEPT based on this idea.

IDEA:
${idea}

Please include these sections, in this order:
- TITLE
- LOGLINE (2–3 sentences)
- GENRE
- SETTING (1 paragraph)
- MAIN CHARACTERS (3–4 bullets with short descriptions)
- THEME (2–3 sentences)
- THREE-ACT STRUCTURE (Act 1, Act 2, Act 3 — 3–5 lines each)
- VISUAL STYLE (1 paragraph)
- TARGET AUDIENCE (1–2 lines)

Keep it cinematic, specific, and production-minded.`,
};

export const screenplayPrompts = {
  system:
    "You are a helpful screenwriting assistant. Return only screenplay text (no markdown). Use standard screenplay formatting (INT./EXT., character names, dialogue). Keep it concise (1–2 pages). End with a compelling hook.",
  buildUserPrompt: (concept: string) => `Write an opening scene for a screenplay based on this concept:

${concept || "(no concept provided)"}

Requirements:
- Use proper screenplay formatting.
- Focus on a vivid, cinematic scene that sets tone and stakes.
- Keep it tight; avoid excessive exposition.
`,
};

export const storyboardPrompts = {
  system:
    `You are a film trailer shot designer.
Return STRICT JSON only. Do NOT include markdown fences.
CRITICAL CONSTRAINTS:
- Use ONLY events, characters, props, locations, time-of-day, and moods that appear in the screenplay text. DO NOT invent anything.
- If something is ambiguous in the screenplay, keep it generic rather than inventing details.
- 1 line per "prompt". Avoid newlines.
- Keep shots cinematic but faithful to the text.

If any required details are missing, omit them rather than inventing them.`,
  buildUserPrompt: (screenplay: string, shots: number) => `
Screenplay (authoritative source — do not invent beyond this):
"""
${screenplay}
"""

Task:
- Extract a natural storyboard for a trailer: choose enough shots to tell a story.(max 10)
- Each shot "prompt" must be a single line: subject, action, location (from screenplay), lighting, lens/angle, time of day, mood, style hints.
- Optional "negative" to avoid artifacts.
- Use ONLY details present or implied in the screenplay.

Return JSON ONLY in this exact shape:
{
  "shots":[
    {"prompt":"...", "negative":"low quality, artifacts"},
    ...
  ]
}
`,
};

export const juggernautPromptEnhancers = {
  prefix:
    "ultra realistic cinematic film still, shot on 35mm film, shallow depth of field, professional lighting, " +
    "photorealistic, skin texture, dynamic contrast, volumetric light, award-winning cinematography, ",
  negative:
    "cartoon, anime, painting, illustration, sketch, 3d render, cgi, fake, text watermark, signature",
  looks: {
    color:
      "cinematic color grading, Kodak Vision3 500T film stock, natural tones, vibrant but realistic colors",
    classic:
      "black and white film still, Kurosawa style lighting, high contrast, film grain",
    warm:
      "golden hour sunlight, warm cinematic tones, shallow depth of field, soft lens flares",
  },
} as const;

export const trailerPlanPrompts = {
  system: "You are a trailer planner. Only output valid JSON. Only one shot is needed",
  schema: `
Respond ONLY in JSON:
{
  "shots": [
    { "id": 1, "prompt": "text", "seed": 12345, "width": 576, "height": 1024, "fps": 12, "length_frames": 72, "strength": 0.15 }
  ],
  "notes": "optional"
}`,
  buildUserPrompt: ({
    concept,
    screenplay,
    shots,
    schema,
  }: {
    concept: string;
    screenplay: string;
    shots: number;
    schema: string;
  }) => `Create ${shots} cinematic image-to-video trailer shots (LTX Video).
Keep them visually coherent but varied. Create only one shot.

CONCEPT:
${concept}

SCREENPLAY:
${screenplay}

${schema}`,
};



export const trailerPlanV2Prompts = {
  system: "You are a senior trailer editor. Output ONLY valid JSON. No markdown",
  schema: `
Respond ONLY in JSON:
{
  "shots": [
    {
      "id": 1,
      "prompt": "visual prompt for still generation (single line, cinematic, no newlines)",
      "negative": "low quality, artifacts, text watermark, logo",
      "seed": 12345,
      "width": 576,
      "height": 1024,
      "fps": 12,
      "length_frames": 72,
      "strength": 0.15,

      "dialogue": "optional spoken line or voiceover for this shot",
      "subtitle": "on-screen subtitle text (keep short; <= 60 chars)",
      "music_cue": "short cue e.g. 'low drone', 'taiko rise', 'silence beat'",
      "sfx": ["list", "of", "spot", "effects", "e.g.", "thunder", "whoosh"]
    }
  ],
  "structure": "slow open → rising tension → montage → button → title card",
  "notes": "editorial guidance, pacing beats, transition hints"
}
`,
  buildUserPrompt: ({
    concept,
    screenplay,
    shots = 8,
    schema,
  }: {
    concept: string;
    screenplay: string;
    shots?: number;
    schema: string;
  }) => `Create a ${shots}-shot cinematic TRAILER PLAN (V2) for image-to-video (LTX/SVD).
Vibes: theatrical trailer. Keep characters/props/locations strictly from screenplay.

CONCEPT:
${concept || "(none)"}

SCREENPLAY (authoritative; do not invent new lore):
${screenplay}

Constraints:
- Each "prompt" must be a single line (no line breaks).
- Dialogue is optional; if present, keep <= 12 words.
- Subtitle should mirror dialogue but shorter (<= 60 chars).
- music_cue uses simple tags: "silence", "low drone", "taiko rise", "string swell", "flute solo", "impacts", "heartbeat".
- sfx are discrete spot effects (e.g., "thunder", "whoosh", "door slam").
- Maintain visual variety across shots (angles, lenses, motion).
- Use width=576, height=1024 (portrait) by default; vary only if justified.

${schema}`
};



export const audioVoPlanPrompts = {
  system: "You are a trailer sound designer. Output ONLY valid JSON. No markdown.",

  schema: `
Respond ONLY in JSON:
{
  "bpm": 90,
  "key": "Am",
  "style": "Indian folk cinematic",
  "duration_s": 45,
  "stems": ["music","sfx","vo"],
  "timeline": [
    {
      "start_s": 0.0,
      "end_s": 5.0,
      "music_prompt": "soft Indian folk intro with tabla and tanpura",
      "sfx_prompt": "forest ambience, distant thunder",
      "vo": "In the silence, something awakens.",
      "shot_id": 1
    }
  ],
  "stable_audio_prompt": "45-second cinematic trailer with Indian folk elements — tabla, tanpura drone, emotional pads, and subtle percussion, in A minor, 90 BPM.",
  "mix_notes": "VO clear and forward; gentle ambient tail at end."
}
`,

  buildUserPrompt: ({
    screenplay,
    trailerShotsJson,
    duration = 45,
    schema,
  }: {
    screenplay: string;
    trailerShotsJson: string;
    duration?: number;
    schema: string;
  }) => `
Design an AUDIO + VO PLAN for a ${duration}s trailer.

SCREENPLAY:
${screenplay}

VISUAL TRAILER SHOTS:
${trailerShotsJson}

---

🎧 For Stable Audio generation:
Pick a **simple musical style phrase** (e.g. "Indian folk cinematic", "dark techno", "epic orchestral", "ambient drone", "melancholic piano").
Output one field called "stable_audio_prompt" that describes the track in one or two sentences, for example:
"45-second cinematic trailer with Indian folk elements — tabla, tanpura drone, emotional pads, subtle percussion, in A minor, 90 BPM."

---

Rules:
- Keep prompts short and style-driven (no structure or mix commands).
- Derive mood and style from the screenplay tone.
- Each timeline item may include small per-shot notes for SFX or VO.
- End with 1–2 s reverb or ambience decay.
- End with 1–2 s reverb or ambience decay.
${schema}`
};
