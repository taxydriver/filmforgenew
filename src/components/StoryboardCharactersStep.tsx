// src/components/StoryboardCharactersStep.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, Wand2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import type { PortraitResult } from "@/lib/generatePortraits"; // PortraitResult now can carry filename/subfolder/type
import type {
  PromptOptions,
  VisualStyle,
  Lens,
  ColorMode,
  Mood,
  Lighting,
  FilmStock,
} from "@/lib/promptStyles";

type Shot = {
  id: number;
  prompt: string;
  negative?: string;
  seed?: number;
  width?: number;
  height?: number;
  // NEW: trailer fields (optional; safe for old payloads)
  fps?: number;            // default 12
  length_frames?: number;  // default 48–72
  strength?: number;       // img2vid strength (0.1–0.25)
  dialogue?: string;       // spoken line / VO
  subtitle?: string;       // short on-screen text
  music_cue?: string;      // e.g., "low drone", "taiko rise", "silence"
  sfx?: string[];          // ["thunder","whoosh"]
};

type Character = { name: string; description: string; role?: string; style?: string };

export type StoryboardCharactersPayload = {
  shots: Shot[];
  characters: Character[];
  mapping: Record<number, string[]>;
  portraits?: Record<string, PortraitResult[]>; // characterName -> portraits
};

type StoryboardCharactersStepProps = {
  data?: StoryboardCharactersPayload | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onBack: () => void;
  // ✅ CHANGED: onNext now receives full payload (including portraits)
  onNext: (payload: StoryboardCharactersPayload) => void;
  // optional: pass screenplay so this component can "Regenerate with Options" and annotate trailer
  screenplay?: string;
  hasTrailer?: boolean;
};

const DEFAULT_OPTS: PromptOptions = {
  style: "cinematic_realistic",
  lens: "50mm",
  color: "color",
  mood: "somber",
  lighting: ["volumetric", "tungsten_practicals"],
  stock: "vision3_500t",
};

/* ---------- helpers to split out a global style prefix ---------- */
function splitPrompt(promptText: string): { prefix: string; body: string } {
  const text = (promptText || "").trim();
  const m =
    text.match(/(.*?)(?=\b(INT\.|EXT\.|[A-Z][A-Z]+(?:\s+[A-Z][A-Z]+)*)\b)/) ||
    text.match(/(.*?)(?=\b([A-Z]{2,}[A-Z\s\-']*)\b)/);
  if (m && m[1]) {
    const prefix = m[1].trim().replace(/\s+/g, " ").replace(/\s*,\s*,/g, ",");
    const body = text.slice(m[1].length).trim();
    return { prefix, body };
  }
  const parts = text.split(",").map((s) => s.trim());
  if (parts.length > 1) {
    const bodyGuess = parts.slice(-1)[0];
    const prefixGuess = parts.slice(0, -1).join(", ");
    return { prefix: prefixGuess, body: bodyGuess };
  }
  return { prefix: "", body: text };
}
function normPrefix(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();
}
/** Find a common (modal) prefix across shots; also return per-shot bodies */
function computeGlobalPrefix(shots: Shot[]): { prefix: string | null; parts: { body: string }[] } {
  const splits = shots.map((s) => splitPrompt(s.prompt || ""));
  const counts = new Map<string, { raw: string; count: number }>();
  for (const sp of splits) {
    const np = normPrefix(sp.prefix);
    if (!np) continue;
    const curr = counts.get(np);
    if (curr) curr.count += 1;
    else counts.set(np, { raw: sp.prefix.trim(), count: 1 });
  }
  let modal: { raw: string; count: number } | null = null;
  for (const v of counts.values()) if (!modal || v.count > modal.count) modal = v;
  const threshold = Math.ceil(shots.length * 0.6);
  const prefix =
    modal && modal.count >= threshold && modal.raw.replace(/\s+/g, " ").length >= 24
      ? modal.raw
      : null;
  const parts = splits.map((sp) => ({ body: sp.body || sp.prefix || "" }));
  return { prefix, parts };
}
/* ---------------------------------------------------------------- */

export default function StoryboardCharactersStep({
  data,
  loading,
  error,
  onRetry,
  onBack,
  onNext,
  screenplay,
  hasTrailer = false,
}: StoryboardCharactersStepProps) {
  const [shots, setShots] = useState<Shot[]>(data?.shots ?? []);
  const [characters, setCharacters] = useState<Character[]>(data?.characters ?? []);
  const [mapping, setMapping] = useState<Record<number, string[]>>(data?.mapping ?? {});
  const [portraitState, setPortraitState] = useState<Record<
    string,
    {
      loading: boolean;
      progress: Record<string, { pct: number; eta?: string }>;
      results: PortraitResult[]; // ✅ ensure results are PortraitResult[]
      status?: string;
      error?: string;
    }
  >>({});
  const [opts, setOpts] = useState<PromptOptions>(DEFAULT_OPTS);
  const [aspect, setAspect] = useState<"portrait" | "landscape" | "square">("landscape");
  const [regenBusy, setRegenBusy] = useState(false);
  const [annotateBusy, setAnnotateBusy] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  useEffect(() => {
    if (data) {
      setShots((data.shots ?? []).map((s) => ({ ...s, sfx: s.sfx ?? [] })));
      setCharacters(data.characters ?? []);
      setMapping(data.mapping ?? {});
      if (data.portraits) {
        // ✅ hydrate portraitState from persisted portraits
        setPortraitState((prev) => {
          const next = { ...prev };
          Object.entries(data.portraits as Record<string, PortraitResult[]>).forEach(
            ([name, results]) => {
              next[name] = {
                loading: false,
                progress: {},
                results,
                status: "done",
              };
            },
          );
          return next;
        });
      }
    } else {
      setShots([]);
      setCharacters([]);
      setMapping({});
      setPortraitState({});
    }
  }, [data]);

  // ✅ NEW: derive a clean, serializable portraits map from local portraitState
  const portraitsForPayload: Record<string, PortraitResult[]> = useMemo(() => {
    const out: Record<string, PortraitResult[]> = {};
    for (const [name, state] of Object.entries(portraitState)) {
      if (state?.results && state.results.length > 0) {
        out[name] = state.results;
      }
    }
    return out;
  }, [portraitState]);

  const { prefix: globalPrefix, parts } = useMemo(() => computeGlobalPrefix(shots), [shots]);

  function updateShot(id: number, patch: Partial<Shot>) {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function genPortraits(c: Character) {
    const poses = ["front", "profile", "3-quarter"];
    setPortraitState((prev) => ({
      ...prev,
      [c.name]: {
        loading: true,
        progress: poses.reduce((acc, pose) => ({ ...acc, [pose]: { pct: 0 } }), {}),
        results: [],
        status: "starting",
        error: undefined,
      },
    }));
    try {
      const res = await fetch("/api/comfy/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: c.name,
          description: c.description,
          style: c.style || "cinematic portrait, 35mm film look, soft light",
          poses,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Portrait generation failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (!chunk) continue;
          const line = chunk.startsWith("data:") ? chunk.slice(5).trim() : chunk;
          if (!line) continue;
          let msg: any;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          setPortraitState((prev) => {
            const current = prev[c.name] || { loading: true, progress: {}, results: [] as PortraitResult[] };
            if (msg.type === "progress" && msg.pose) {
              return {
                ...prev,
                [c.name]: {
                  ...current,
                  progress: {
                    ...current.progress,
                    [msg.pose]: { pct: Number(msg.pct) || 0, eta: msg.eta },
                  },
                },
              };
            }
            if (msg.type === "status") {
              if (msg.state === "done" && Array.isArray(msg.results)) {
                return {
                  ...prev,
                  [c.name]: {
                    ...current,
                    loading: false,
                    status: "done",
                    results: msg.results as PortraitResult[], // ✅ includes filename/subfolder/type now
                  },
                };
              }
              if (msg.state === "completed") {
                return {
                  ...prev,
                  [c.name]: { ...current, status: `Completed ${msg.completed}/${msg.total}` },
                };
              }
              return { ...prev, [c.name]: { ...current, status: msg.state } };
            }
            if (msg.type === "error") {
              return {
                ...prev,
                [c.name]: { ...current, loading: false, error: msg.message || "Unknown error" },
              };
            }
            return prev;
          });
        }
      }
      setPortraitState((prev) => {
        const current = prev[c.name];
        if (!current) return prev;
        return {
          ...prev,
          [c.name]: {
            ...current,
            loading: false,
            status: current.status === "starting" ? "done" : current.status,
          },
        };
      });
    } catch (err: any) {
      setPortraitState((prev) => ({
        ...prev,
        [c.name]: {
          ...(prev[c.name] || { progress: {}, results: [] as PortraitResult[] }),
          loading: false,
          error: err?.message || String(err),
        },
      }));
    }
  }

  // Regenerate storyboard with current opts/aspect
  async function regenerateWithOptions() {
    if (!screenplay?.trim()) {
      alert("Parent must pass screenplay to StoryboardCharactersStep to regenerate here.");
      return;
    }
    setRegenBusy(true);
    try {
      const res = await fetch("/api/storyboard-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screenplay,
          look: "color",
          aspect,
          provider: "openai",
          options: opts,
        }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Failed to regenerate");
      setShots((j.shots || []).map((s: Shot) => ({ ...s, sfx: s.sfx ?? [] })));
      setCharacters(j.characters || []);
      setMapping(j.mapping || {});
      // portraits stay as-is; user can regenerate them separately
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to regenerate");
    } finally {
      setRegenBusy(false);
    }
  }

  // NEW: Annotate shots with dialogue/music/fps/length from screenplay (TrailerPlan V2)
  async function annotateTrailer() {
    if (!screenplay?.trim()) {
      alert("Pass screenplay prop to enable annotation.");
      return;
    }
    setAnnotateBusy(true);
    try {
      const res = await fetch("/api/trailer/annotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenplay, shots }),
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j?.error || "Failed to annotate trailer");
      // Expect { shots: Shot[] } merged with dialogue/music/etc.
      setShots((prev) =>
        (j.shots as Shot[]).map((ns) => ({
          ...prev.find((p) => p.id === ns.id),
          ...ns,
          sfx: ns.sfx ?? [],
        })),
      );
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to annotate trailer");
    } finally {
      setAnnotateBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Sparkles className="w-12 h-12 text-purple-400 animate-pulse" />
              <p className="text-slate-300">Generating your storyboard...</p>
              <p className="text-sm text-slate-500">This may take a moment...</p>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={onBack}
            className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Screenplay
          </Button>
          <Button disabled className="bg-purple-600/60 cursor-not-allowed">
            Generate Trailer
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  const primaryLabel = hasTrailer ? "Go to Trailer" : "Generate Trailer";
  const primaryDisabled = !hasTrailer && shots.length === 0;

  // ✅ NEW: when user continues, send full payload (including portraits) upstream
  function handleNextClick() {
    const payload: StoryboardCharactersPayload = {
      shots,
      characters,
      mapping,
      portraits: Object.keys(portraitsForPayload).length ? portraitsForPayload : undefined,
    };
    onNext(payload);
  }

  // ... your JSX UI for characters, portraits, mapping, etc. goes here ...
  // At the bottom, just update the Next button:

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Storyboard & Characters</h2>
          <span className="text-sm text-slate-400">Generated from screenplay</span>
        </div>
        <Button
          onClick={handleNextClick}
          disabled={primaryDisabled}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60"
          title={hasTrailer ? "Go to trailer" : "Proceed to trailer render (img2vid + audio mux)"}
        >
          {primaryLabel}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>Failed to generate storyboard: {error}</span>
          {onRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="bg-transparent border-red-400/60 text-red-200 hover:bg-red-500/20"
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {/* Visual Settings */}
      <div className="rounded-xl border border-slate-700 p-3 bg-slate-800/40">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-sm text-slate-300">Style</label>
          <select
            value={opts.style}
            onChange={(e) => setOpts((o) => ({ ...o, style: e.target.value as VisualStyle }))}
            className="bg-slate-900 text-slate-100 text-sm border border-slate-600 rounded px-2 py-1"
          >
            <option value="cinematic_realistic">Cinematic Realism</option>
            <option value="film_noir">Film Noir</option>
            <option value="golden_hour_epic">Golden Hour Epic</option>
            <option value="cyberpunk_neon">Cyberpunk Neon</option>
            <option value="painterly_classic">Painterly Classic</option>
            <option value="surreal_dream">Surreal Dream</option>
            <option value="sci_fi_realistic">Sci-Fi Realism</option>
          </select>

          <label className="text-sm text-slate-300 ml-2">Lens</label>
          <select
            value={opts.lens}
            onChange={(e) => setOpts((o) => ({ ...o, lens: e.target.value as Lens }))}
            className="bg-slate-900 text-slate-100 text-sm border border-slate-600 rounded px-2 py-1"
          >
            <option value="35mm">35mm</option>
            <option value="50mm">50mm</option>
            <option value="85mm">85mm</option>
            <option value="24mm">24mm</option>
            <option value="135mm">135mm</option>
          </select>

          <label className="text-sm text-slate-300 ml-2">Color</label>
          <select
            value={opts.color}
            onChange={(e) => setOpts((o) => ({ ...o, color: e.target.value as ColorMode }))}
            className="bg-slate-900 text-slate-100 text-sm border border-slate-600 rounded px-2 py-1"
          >
            <option value="color">Color</option>
            <option value="bw">B&amp;W</option>
            <option value="warm">Warm</option>
            <option value="cool">Cool</option>
          </select>

          <label className="text-sm text-slate-300 ml-2">Mood</label>
          <select
            value={opts.mood}
            onChange={(e) => setOpts((o) => ({ ...o, mood: e.target.value as Mood }))}
            className="bg-slate-900 text-slate-100 text-sm border border-slate-600 rounded px-2 py-1"
          >
            <option value="somber">Somber</option>
            <option value="mysterious">Mysterious</option>
            <option value="epic">Epic</option>
            <option value="intimate">Intimate</option>
            <option value="romantic">Romantic</option>
            <option value="grim">Grim</option>
            <option value="uplifting">Uplifting</option>
          </select>

          <label className="text-sm text-slate-300 ml-2">Lighting</label>
          <select
            multiple
            value={opts.lighting || []}
            onChange={(e) => {
              const vals = Array.from(e.target.selectedOptions).map((o) => o.value as Lighting);
              setOpts((o) => ({ ...o, lighting: vals }));
            }}
            className="bg-slate-900 text-slate-100 text-sm border border-slate-600 rounded px-2 py-1 min-w-[180px]"
          >
            <option value="volumetric">Volumetric</option>
            <option value="tungsten_practicals">Tungsten Practicals</option>
            <option value="rembrandt">Rembrandt</option>
            <option value="backlit">Backlit</option>
            <option value="softbox">Softbox</option>
            <option value="hard">Hard</option>
            <option value="neon">Neon</option>
            <option value="overcast">Overcast</option>
          </select>

          <label className="text-sm text-slate-300 ml-2">Stock</label>
          <select
            value={opts.stock}
            onChange={(e) => setOpts((o) => ({ ...o, stock: e.target.value as FilmStock }))}
            className="bg-slate-900 text-slate-100 text-sm border border-slate-600 rounded px-2 py-1"
          >
            <option value="vision3_500t">Vision3 500T</option>
            <option value="ektachrome">Ektachrome</option>
            <option value="tri_x">TRI-X (B&amp;W)</option>
          </select>

          <label className="text-sm text-slate-300 ml-2">Aspect</label>
          <select
            value={aspect}
            onChange={(e) => setAspect(e.target.value as any)}
            className="bg-slate-900 text-slate-100 text-sm border-slate-600 rounded px-2 py-1"
          >
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
            <option value="square">Square</option>
          </select>

          <div className="ml-auto flex gap-2">
            {onRetry && (
              <Button
                variant="outline"
                onClick={onRetry}
                className="bg-transparent border-slate-500 text-slate-200 hover:bg-slate-700/50"
                title="Regenerate using your current defaults"
              >
                Quick Retry
              </Button>
            )}
            <Button
              onClick={regenerateWithOptions}
              disabled={regenBusy}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
              title={screenplay ? "" : "Pass screenplay prop to enable here"}
            >
              {regenBusy ? "Regenerating…" : "Regenerate with Options"}
            </Button>
            <Button
              onClick={annotateTrailer}
              disabled={annotateBusy || shots.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
              title="Auto-fill dialogue, music cues, SFX, fps/length from screenplay"
            >
              {annotateBusy ? "Annotating…" : (<span className="flex items-center gap-1"><Wand2 className="w-4 h-4" /> Auto-fill Dialogue & Music</span>)}
            </Button>
          </div>
        </div>
      </div>

      {/* Show one global style prefix if detected */}
      {globalPrefix && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Style Prompt</div>
          <div className="text-[13px] text-slate-200 leading-relaxed">{globalPrefix}</div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Shots */}
        <div className="col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Shots</h3>
            <label className="flex items-center text-xs text-slate-400 gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showFullPrompt}
                onChange={(e) => setShowFullPrompt(e.target.checked)}
                className="accent-purple-500"
              />
              Show full prompt
            </label>
          </div>

          {shots.length === 0 ? (
            <p className="text-sm text-slate-400">No shots yet.</p>
          ) : (
            <ul className="space-y-2">
              {shots.map((s, idx) => {
                const body = parts[idx]?.body ?? s.prompt;
                return (
                  <li key={s.id} className="rounded-xl border border-slate-700 p-3 space-y-2">
                    <div className="text-xs text-slate-400 mb-1">
                      Shot #{s.id} • {mapping[s.id]?.join(", ") || "No characters detected"}
                    </div>
                    <div className="text-slate-100 whitespace-pre-wrap">
                      {showFullPrompt ? s.prompt : body}
                    </div>

                    {/* NEW: Trailer fields */}
                    <div className="grid grid-cols-12 gap-2 text-sm">
                      <div className="col-span-12 md:col-span-6">
                        <label className="block text-[11px] text-slate-400">Dialogue / VO</label>
                        <input
                          value={s.dialogue || ""}
                          onChange={(e) => updateShot(s.id, { dialogue: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                          placeholder="KANE (V.O.): In a city that remembers everything…"
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <label className="block text-[11px] text-slate-400">Subtitle</label>
                        <input
                          value={s.subtitle || ""}
                          onChange={(e) => updateShot(s.id, { subtitle: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                          placeholder="In a city that remembers everything…"
                        />
                      </div>

                      <div className="col-span-6 md:col-span-3">
                        <label className="block text-[11px] text-slate-400">Music Cue</label>
                        <input
                          value={s.music_cue || ""}
                          onChange={(e) => updateShot(s.id, { music_cue: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                          placeholder="low drone / taiko rise / silence"
                        />
                      </div>

                      <div className="col-span-6 md:col-span-3">
                        <label className="block text-[11px] text-slate-400">SFX (comma list)</label>
                        <input
                          value={(s.sfx || []).join(", ")}
                          onChange={(e) =>
                            updateShot(s.id, {
                              sfx: e.target.value
                                .split(",")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                          placeholder="thunder, whoosh"
                        />
                      </div>

                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-[11px] text-slate-400">FPS</label>
                        <input
                          type="number"
                          min={8}
                          max={30}
                          value={s.fps ?? 12}
                          onChange={(e) => updateShot(s.id, { fps: Number(e.target.value) || 12 })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-[11px] text-slate-400">Frames</label>
                        <input
                          type="number"
                          min={16}
                          max={180}
                          value={s.length_frames ?? 60}
                          onChange={(e) =>
                            updateShot(s.id, { length_frames: Number(e.target.value) || 60 })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-[11px] text-slate-400">Strength</label>
                        <input
                          type="number"
                          step="0.01"
                          min={0.05}
                          max={0.35}
                          value={s.strength ?? 0.15}
                          onChange={(e) =>
                            updateShot(s.id, { strength: Number(e.target.value) || 0.15 })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Characters */}
        <div className="col-span-5 space-y-3">
          <h3 className="text-lg font-medium">Characters</h3>
          {characters.length === 0 ? (
            <p className="text-sm text-slate-400">No characters yet.</p>
          ) : (
            <ul className="space-y-3">
              {characters.map((c) => (
                <li key={c.name} className="rounded-xl border border-slate-700 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.role}</div>
                    </div>
                    <button
                      onClick={() => genPortraits(c)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm"
                      disabled={portraitState[c.name]?.loading}
                    >
                      {portraitState[c.name]?.loading ? "Generating…" : "Generate Portraits"}
                    </button>
                  </div>
                  <p className="text-sm mt-2 text-slate-200">{c.description}</p>
                  {portraitState[c.name]?.status && (
                    <p className="text-xs text-slate-400 mt-2">{portraitState[c.name]?.status}</p>
                  )}
                  {portraitState[c.name]?.progress && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(portraitState[c.name]!.progress).map(([pose, info]) => (
                        <div key={`${c.name}-${pose}`} className="text-[10px] text-slate-400">
                          {pose.toUpperCase()}: {Math.round(info.pct)}%
                          {info.eta ? ` · ETA ${info.eta}s` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  {portraitState[c.name]?.error && (
                    <p className="text-xs text-red-400 mt-2">{portraitState[c.name]?.error}</p>
                  )}
                  {portraitState[c.name]?.results?.length ? (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {portraitState[c.name]!.results.map((r, idx) => (
                        <div key={`${c.name}-${r.pose}-${idx}`} className="text-center">
                          {r.url ? (
                            <img
                              src={r.url}
                              alt={`${c.name} ${r.pose}`}
                              className="w-full h-auto rounded border border-slate-600"
                            />
                          ) : (
                            <div className="text-xs text-slate-400">No image</div>
                          )}
                          <p className="text-[10px] text-slate-400 mt-1 uppercase">{r.pose}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex justify-start pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Screenplay
        </Button>
      </div>
    </div>
  );
}
