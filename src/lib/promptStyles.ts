// src/lib/promptStyles.ts
export type VisualStyle =
  | "cinematic_realistic"
  | "film_noir"
  | "golden_hour_epic"
  | "cyberpunk_neon"
  | "painterly_classic"
  | "surreal_dream"
  | "sci_fi_realistic";

export type Mood =
  | "somber" | "uplifting" | "mysterious" | "romantic" | "grim" | "epic" | "intimate";

export type Lighting =
  | "rembrandt" | "backlit" | "softbox" | "hard" | "volumetric"
  | "tungsten_practicals" | "neon" | "overcast";

export type Lens = "24mm" | "35mm" | "50mm" | "85mm" | "135mm";
export type FilmStock = "vision3_500t" | "ektachrome" | "tri_x";
export type ColorMode = "color" | "bw" | "warm" | "cool";

export type PromptOptions = {
  style?: VisualStyle;
  mood?: Mood;
  lighting?: Lighting[];
  lens?: Lens;
  stock?: FilmStock;
  color?: ColorMode;
  // legacy shim for your existing "looks"
  legacyLook?: "color" | "classic" | "warm";
  extras?: string[];
  negativeExtras?: string[];
};

const STYLE_PREFIX: Record<VisualStyle, string> = {
  cinematic_realistic:
    "ultra realistic cinematic film still, shot on 35mm film, shallow depth of field, professional lighting, photorealistic, skin texture, dynamic contrast, volumetric light, award-winning cinematography,",
  film_noir:
    "black and white, high-contrast film noir, deep shadows, cigarette smoke, venetian blind lighting, moody atmosphere,",
  golden_hour_epic:
    "cinematic golden hour sunlight, warm tones, long shadows, subtle lens flare, sweeping vistas,",
  cyberpunk_neon:
    "neon-drenched futuristic city, reflective rain streets, magenta and cyan bokeh, nocturnal ambience,",
  painterly_classic:
    "oil painting aesthetic, textured brush strokes, chiaroscuro, baroque lighting, museum-grade composition,",
  surreal_dream:
    "dreamlike surreal imagery, soft haze, glowing fog, warped perspective, fantastical palette,",
  sci_fi_realistic:
    "futuristic cinematic realism, fine surface detail, depth fog, blue/orange contrast, dramatic scale,",
};

const STOCK_WORDS: Record<FilmStock, string> = {
  vision3_500t: "Kodak Vision3 500T film stock, natural cinematic color",
  ektachrome: "Kodak Ektachrome color reversal film, crisp saturation",
  tri_x: "Kodak TRI-X black-and-white film, pronounced grain, classic tonality",
};

const LENS_WORDS: Record<Lens, string> = {
  "24mm": "24mm wide angle perspective, environmental context",
  "35mm": "35mm lens look, classic cinema perspective",
  "50mm": "50mm standard lens, natural perspective, shallow depth",
  "85mm": "85mm portrait lens, shallow depth, creamy bokeh",
  "135mm": "135mm telephoto compression, subject isolation",
};

const LIGHTING_WORDS: Record<Lighting, string> = {
  rembrandt: "Rembrandt lighting, triangle cheek light, controlled contrast",
  backlit: "strong backlight rim, atmospheric silhouette",
  softbox: "soft wrap light, low contrast, flattering falloff",
  hard: "hard key light, crisp shadows, dramatic edges",
  volumetric: "volumetric god rays, visible air particles",
  tungsten_practicals: "tungsten practicals, warm pools of light",
  neon: "neon edge lighting, saturated reflections",
  overcast: "soft overcast skylight, diffuse ambient fill",
};

const MOOD_WORDS: Record<Mood, string> = {
  somber: "solemn, restrained, quiet tension",
  uplifting: "hopeful, gentle warmth, open composition",
  mysterious: "enigmatic, concealed details, shadow play",
  romantic: "tender warmth, close framing, soft texture",
  grim: "harsh, desaturated, bleak atmosphere",
  epic: "grand scale, heroic framing, soaring mood",
  intimate: "close, private, delicate nuance",
};

const COLOR_WORDS: Record<ColorMode, string> = {
  color: "cinematic color grading, balanced saturation",
  bw: "black and white, rich tonal range",
  warm: "warm cinematic palette, golden undertones",
  cool: "cool cinematic palette, teal highlights",
};

export const DEFAULT_NEGATIVE =
  "cartoon, anime, painting, illustration, sketch, 3d render, cgi, fake, text watermark, signature, low quality, artifacts";

export function composePositivePrefix(opts?: PromptOptions): string {
  const style = opts?.style ?? "cinematic_realistic";
  const bits: string[] = [STYLE_PREFIX[style]];
  if (opts?.stock) bits.push(STOCK_WORDS[opts.stock]);
  if (opts?.lens) bits.push(LENS_WORDS[opts.lens]);
  if (opts?.mood) bits.push(MOOD_WORDS[opts.mood]);
  if (opts?.color) bits.push(COLOR_WORDS[opts.color]);
  if (opts?.lighting?.length) bits.push(opts.lighting.map(l => LIGHTING_WORDS[l]).join(", "));
  if (opts?.legacyLook) {
    if (opts.legacyLook === "color")
      bits.push("cinematic color grading, Kodak Vision3 500T film stock, natural tones, vibrant but realistic colors");
    if (opts.legacyLook === "classic")
      bits.push("black and white film still, high contrast, film grain");
    if (opts.legacyLook === "warm")
      bits.push("golden hour sunlight, warm cinematic tones, shallow depth of field, soft lens flares");
  }
  if (opts?.extras?.length) bits.push(opts.extras.join(", "));
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

export function composeNegative(opts?: PromptOptions): string {
  const extras = (opts?.negativeExtras ?? []).join(", ");
  return `${DEFAULT_NEGATIVE}${extras ? ", " + extras : ""}`.trim();
}

export function buildPromptForShot(core: string, opts?: PromptOptions) {
  const prefix = composePositivePrefix(opts);
  return `${prefix}, ${core}`.replace(/\s+/g, " ").trim();
}