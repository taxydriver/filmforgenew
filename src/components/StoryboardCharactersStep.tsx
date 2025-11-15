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
    <div className="space-y-6">
      {/* ... existing UI for shots, characters, mapping, portrait controls ... */}

      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Screenplay
        </Button>
        <Button
          onClick={handleNextClick}       // ✅ was onNext()
          disabled={primaryDisabled}
          className="bg-purple-600 hover:bg-purple-500 text-white"
        >
          {primaryLabel}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}