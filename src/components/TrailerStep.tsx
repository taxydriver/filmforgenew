"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ModelProvider } from "@/types/model";
import { planShotsFromScreenplay, generateStills } from "@/lib/trailer";
import { filenameFromAny, toText } from "@/utils/trailer/helpers";
import { useTrailerStitching } from "@/utils/trailer/useStitching";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";
import { Video as VideoIcon, ArrowLeft, Play, Download } from "lucide-react";
import { generateTrailerStep } from "@/lib/autoforge";
import type { StoryboardCharactersPayload } from "./StoryboardCharactersStep";

type StoryboardShot = { id?: number; prompt: string; negative?: string };
type Still = { url: string; prompt?: string; rawUrl?: string; filename?: string };
type Clip = { url: string; filename?: string; i: number };

interface TrailerStepProps {
  screenplay: string;
  trailer: { videoUrl: string; description: string } | null;
  modelProvider: ModelProvider;
  storychars?: StoryboardCharactersPayload | null;

  onUpdate: (value: { videoUrl: string; description: string }) => void;
  onBack: () => void;

  initialShots?: StoryboardShot[];
  initialStills?: Still[];
  initialClips?: Clip[];
  initialStartedPrefixes?: string[];
  initialAudioUrls?: string[];
  initialAudioPrefixes?: string[];
  initialStitchedUrl?: string;
  onArtifactsChange?: (patch: Partial<{
    storyboardShots: StoryboardShot[];
    stills: Still[];
    clips: Clip[];
    startedPrefixes: string[];
    audioUrls: string[];
    audioPrefixes: string[];
    stitchedUrl: string;
  }>) => void;

  // NOTE: was in your code but not in the original TrailerStepProps – adding it here
  autoRun?: boolean;
}

export function TrailerStep({
  screenplay,
  trailer,
  modelProvider,
  autoRun = false,
  storychars = null,
  onUpdate,
  onBack,
  initialShots = [],
  initialStills = [],
  initialClips = [],
  initialStartedPrefixes = [],
  initialAudioUrls = [],
  initialAudioPrefixes = [],
  initialStitchedUrl = "",
  onArtifactsChange = () => {},
}: TrailerStepProps) {
  const [localTrailer, setLocalTrailer] = useState(trailer);
  const [storyboardShots, setStoryboardShots] = useState<StoryboardShot[]>(initialShots);
  const [stills, setStills] = useState<Still[]>(initialStills);
  const [clips, setClips] = useState<Clip[]>(initialClips);
  const [startedPrefixes, setStartedPrefixes] = useState<string[]>(initialStartedPrefixes ?? []);

  const [isStoryboardLoading, setIsStoryboardLoading] = useState(false);
  const [isStillsLoading, setIsStillsLoading] = useState(false);
  const [isVideoStarting, setIsVideoStarting] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [isTrailerApiLoading, setIsTrailerApiLoading] = useState(false);
  const [trailerApiError, setTrailerApiError] = useState<string | null>(null);

  /* ====================== AUDIO STATE ====================== */
  const sanitizeAudioList = useCallback((urls: string[] = []) => {
    return urls.filter((u) => typeof u === "string" && u.length > 0);
  }, []);

  const [audioUrls, setAudioUrls] = useState<string[]>(() =>
    sanitizeAudioList(initialAudioUrls)
  );
  const [audioPrefixes, setAudioPrefixes] = useState<string[]>(
    initialAudioPrefixes ?? []
  );
  const [isAudioGenerating, setIsAudioGenerating] = useState(false);
  const [isAudioScanning, setIsAudioScanning] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioPromptText, setAudioPromptText] = useState("");

  /* ---------- stitching hook ---------- */
  const {
    stitch,
    isStitching,
    stitchedUrl,
    stitchLog,
    autoStitchDisabled,
    hasAutoStitchedRef,
  } = useTrailerStitching({
    clips,
    audioPrefixes,
    startedPrefixes,
    localTrailer,
    initialStitchedUrl,
    setLocalTrailer,
    onUpdate,
    onArtifactsChange,
  });

  const targetClips =
    (stills?.length || 0) > 0 ? stills.length : storyboardShots.length;
  const hasAllClips = targetClips > 0 && clips.length >= targetClips;
  const hasAudio = audioUrls.length > 0;
  const readyToStitch =
    hasAllClips &&
    hasAudio &&
    !isStitching &&
    !stitchedUrl &&
    !autoStitchDisabled;

  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState(0);

  const scanTimerRef = useRef<number | null>(null);
  const scanBusyRef = useRef(false);
  const hasStitchedRef = useRef(false);

  const audioScanTimerRef = useRef<number | null>(null);
  const audioScanBusyRef = useRef(false);

  const audioPrefixesRef = useRef<string[]>(initialAudioPrefixes ?? []);
  const audioUrlsRef = useRef<string[]>(sanitizeAudioList(initialAudioUrls ?? []));
  const audioPromptRef = useRef("");

  const stillsRef = useRef(stills);
  const storyboardShotsRef = useRef(storyboardShots);

  /* ---------- Initialize trailer workspace text ---------- */
  useEffect(() => {
    setLocalTrailer(trailer);
    if (!trailer && screenplay?.trim()) {
      const desc = `Trailer workspace ready.

This step only runs when you click:
- Plan Shots
- Generate Stills
- Generate Trailer
- Rescan Output/Video`;
      const t = { videoUrl: "about:blank", description: desc };
      setLocalTrailer(t);
      onUpdate(t);
    }
  }, [trailer, screenplay, onUpdate]);

  /* ---------- sync refs ---------- */
  useEffect(() => {
    stillsRef.current = stills;
  }, [stills]);

  useEffect(() => {
    storyboardShotsRef.current = storyboardShots;
  }, [storyboardShots]);

  useEffect(() => {
    audioUrlsRef.current = audioUrls;
  }, [audioUrls]);

  useEffect(() => {
    audioPromptRef.current = audioPromptText;
  }, [audioPromptText]);

  useEffect(() => {
    console.log("[Audio] audioPrefixes changed:", audioPrefixes);
    audioPrefixesRef.current = audioPrefixes;
    if (audioPrefixes.length && audioScanTimerRef.current === null) {
      startAudioScanTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioPrefixes]);

  /* ---------- Sync parent artifacts (initial load) ---------- */
  useEffect(() => {
    if (storyboardShots.length === 0 && initialShots.length > 0) {
      setStoryboardShots(initialShots);
      onArtifactsChange({ storyboardShots: initialShots });
    }
  }, [initialShots, storyboardShots.length, onArtifactsChange]);

  useEffect(() => {
    if (stills.length === 0 && initialStills.length > 0) {
      setStills(initialStills);
    }
  }, [initialStills, stills.length]);

  useEffect(() => {
    if (clips.length === 0 && initialClips.length > 0) {
      setClips(initialClips);
    }
  }, [initialClips, clips.length]);

  useEffect(() => {
    if ((initialStartedPrefixes?.length ?? 0) > 0) {
      setStartedPrefixes(initialStartedPrefixes);
      startScanTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------- Handlers ----------------------- */

  const handlePlanShots = useCallback(async () => {
    if (!screenplay.trim()) return;
    setIsStoryboardLoading(true);
    try {
      const shotPlan = await planShotsFromScreenplay(screenplay, 4, modelProvider);
      const shots = (shotPlan?.shots ?? []) as StoryboardShot[];
      if (!shots.length) return;

      setStoryboardShots(shots);
      onArtifactsChange({ storyboardShots: shots });

      const planSummary = shots
        .map((shot, i) => {
          const prompt = shot.prompt?.trim() || "Prompt missing";
          const neg = shot.negative?.trim();
          return neg
            ? `SHOT ${i + 1}\nPrompt: ${prompt}\nNegative: ${neg}`
            : `SHOT ${i + 1}\nPrompt: ${prompt}`;
        })
        .join("\n\n");

      const updated = {
        videoUrl: localTrailer?.videoUrl || "about:blank",
        description: `Storyboard planned.\n\n${planSummary}`,
      };
      setLocalTrailer(updated);
      onUpdate(updated);
    } finally {
      setIsStoryboardLoading(false);
    }
  }, [screenplay, modelProvider, onArtifactsChange, localTrailer, onUpdate]);

  const handleGenerateStills = useCallback(async (): Promise<Still[] | undefined> => {
    if (!screenplay.trim() || !storyboardShotsRef.current.length) return;
    setIsStillsLoading(true);
    setProgress(0);
    setEta(0);

    try {
      const prompts = storyboardShotsRef.current.map((s) => s.prompt);
      const gen = await generateStills(prompts, (p: any) => {
        if (p?.type === "progress") {
          setProgress(Math.round(Number(p.pct) || 0));
          setEta(Number(p.eta) || 0);
        }
      });

      const resultsArray =
        Array.isArray((gen as any)?.results)
          ? (gen as any).results
          : Array.isArray((gen as any)?.images)
          ? (gen as any).images
          : [];

      const stillsArr: Still[] = resultsArray
        .filter((r: any) => typeof r?.url === "string")
        .map((r: any, i: number) => {
          const forcedPrompt =
            storyboardShotsRef.current[i]?.prompt || r.prompt || "";
          const raw = r.rawUrl ?? r.url;
          const filename = filenameFromAny(
            { rawUrl: raw, url: r.url, filename: r.filename },
            undefined
          );
          return { url: r.url, rawUrl: raw, filename, prompt: forcedPrompt };
        });

      setStills(stillsArr);
      stillsRef.current = stillsArr;
      onArtifactsChange({ stills: stillsArr });
      return stillsArr;
    } finally {
      setIsStillsLoading(false);
    }
  }, [screenplay, onArtifactsChange]);

  const handleShotPromptChange = useCallback(
    (index: number, field: "prompt" | "negative", value: string) => {
      setStoryboardShots((prev) => {
        const next = [...prev];
        const current: StoryboardShot =
        next[index] ?? { prompt: "", negative: "" };

        next[index] = { ...current, [field]: value };
        storyboardShotsRef.current = next;
        onArtifactsChange?.({ storyboardShots: next });
        return next;
      });
    },
    [onArtifactsChange]
  );

  /* ====================== VIDEO PIPELINE ====================== */

  useEffect(() => {
    if (readyToStitch && !hasAutoStitchedRef.current) {
      hasAutoStitchedRef.current = true;
      stitch();
    }
  }, [readyToStitch, stitch, hasAutoStitchedRef]);

  const startScanTimer = useCallback(() => {
    if (scanTimerRef.current !== null) return;
    const id = window.setInterval(async () => {
      if (!startedPrefixes.length) return;
      if (scanBusyRef.current) return;
      scanBusyRef.current = true;
      setScanBusy(true);
      try {
        const res = await fetch("/api/comfy/video/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: startedPrefixes }),
        });
        const json = await res.json();
        if (json?.ok && Array.isArray(json.results)) {
          let lengthAfterUpdate = 0;
          setClips((prev) => {
            const have = new Set(prev.map((c) => c.filename));
            const add = json.results
              .filter((r: any) => !have.has(r.filename))
              .map((r: any, i: number) => ({
                url: r.url,
                filename: r.filename,
                i: r.i ?? prev.length + i,
              }));
            if (!add.length) {
              lengthAfterUpdate = prev.length;
              return prev;
            }
            const next = [...prev, ...add].sort((a, b) => a.i - b.i);
            lengthAfterUpdate = next.length;
            onArtifactsChange({ clips: next });
            return next;
          });
          if (
            lengthAfterUpdate >= targetClips &&
            targetClips > 0 &&
            scanTimerRef.current !== null
          ) {
            clearInterval(scanTimerRef.current);
            scanTimerRef.current = null;
          }
        }
      } catch (e) {
        console.error("scan error", e);
      } finally {
        setScanBusy(false);
        scanBusyRef.current = false;
      }
    }, 12_000) as unknown as number;
    scanTimerRef.current = id;
  }, [startedPrefixes, onArtifactsChange, targetClips]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current !== null) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      if (audioScanTimerRef.current !== null) {
        clearInterval(audioScanTimerRef.current);
        audioScanTimerRef.current = null;
      }
    };
  }, []);

  const handleManualScan = useCallback(async () => {
    if (!startedPrefixes.length || scanBusyRef.current) return;
    scanBusyRef.current = true;
    setScanBusy(true);
    try {
      const res = await fetch("/api/comfy/video/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: startedPrefixes }),
      });
      const json = await res.json();
      if (json?.ok && Array.isArray(json.results)) {
        setClips((prev) => {
          const have = new Set(prev.map((c) => c.filename));
          const add = json.results
            .filter((r: any) => !have.has(r.filename))
            .map((r: any, i: number) => ({
              url: r.url,
              filename: r.filename,
              i: r.i ?? prev.length + i,
            }));
          const next = add.length ? [...prev, ...add].sort((a, b) => a.i - b.i) : prev;
          if (add.length) onArtifactsChange({ clips: next });
          return next;
        });
      }
    } catch (e) {
      console.error("manual scan error", e);
    } finally {
      setScanBusy(false);
      scanBusyRef.current = false;
    }
  }, [startedPrefixes, onArtifactsChange]);

  const handleGenerateVideos = useCallback(async () => {
    const currentStills = stillsRef.current;
    if (!currentStills.length || isVideoStarting) return;

    setIsVideoStarting(true);
    try {
      const batchId = new Date().toISOString().replace(/[:.]/g, "-");
      const prefixes: string[] = [];

      for (let i = 0; i < currentStills.length; i++) {
        const s = currentStills[i];
        const filename = filenameFromAny(s);
        if (!filename) continue;

        const prefix = `wan_${batchId}_shot_${String(i + 1).padStart(2, "0")}`;
        prefixes.push(prefix);

        const promptForShot = (
          currentStills[i]?.prompt ?? storyboardShotsRef.current[i]?.prompt ?? ""
        ).trim();

        const payload = {
          image: filename,
          type: "output",
          positive: promptForShot,
          negative:
            "low quality, motion smear, artifacts, warped face, extra limbs",
          width: 768,
          height: 512,
          fps: 24,
          frames: 48,
          strength: 0.3,
          prefix,
          template: "/workflows/video_wan2_2_14B_i2v.json",
          seed: Math.floor(Math.random() * 2_147_483_647),
        };

        fetch("/api/comfy/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch((e) => console.error("submit video failed", e));
      }

      setStartedPrefixes((prev) => {
        const next = Array.from(new Set([...prev, ...prefixes]));
        onArtifactsChange?.({ startedPrefixes: next });
        return next;
      });
      startScanTimer();
    } finally {
      setIsVideoStarting(false);
    }
  }, [isVideoStarting, onArtifactsChange, startScanTimer]);

  /* ====================== AUDIO PIPELINE ====================== */
  const handleScanAudio = useCallback(async () => {
    const prefixes = audioPrefixesRef.current;
    console.log("[audio-scan] prefixes:", prefixes);
    if (!prefixes.length || isAudioScanning) return;
    setIsAudioScanning(true);
    setAudioError(null);
    try {
      const res = await fetch("/api/comfy/audio/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Audio scan failed (${res.status})`);
      }
      const urls = (json.results || [])
        .map((r: any) => r?.url)
        .filter((u: any) => typeof u === "string" && u.length > 0);
      if (urls.length) {
        setAudioUrls((prev) => {
          const next = sanitizeAudioList(
            Array.from(new Set([...prev, ...urls]))
          );
          onArtifactsChange?.({ audioUrls: next });
          return next;
        });
      }
    } catch (err: any) {
      console.error("audio scan error", err);
      setAudioError(toText(err?.message || err));
    } finally {
      setIsAudioScanning(false);
    }
  }, [isAudioScanning, onArtifactsChange, sanitizeAudioList]);

  const startAudioScanTimer = useCallback(() => {
    if (audioScanTimerRef.current !== null) return;
    const id = window.setInterval(async () => {
      if (!audioPrefixesRef.current.length) {
        if (audioScanTimerRef.current !== null) {
          clearInterval(audioScanTimerRef.current);
          audioScanTimerRef.current = null;
        }
        return;
      }
      if (audioScanBusyRef.current) return;
      audioScanBusyRef.current = true;
      try {
        await handleScanAudio();
      } finally {
        audioScanBusyRef.current = false;
        const finished =
          audioPrefixesRef.current.length > 0 &&
          audioUrlsRef.current.length >= audioPrefixesRef.current.length;
        if (finished && audioScanTimerRef.current !== null) {
          clearInterval(audioScanTimerRef.current);
          audioScanTimerRef.current = null;
        }
      }
    }, 10_000);
    audioScanTimerRef.current = id;
  }, [handleScanAudio]);

  const handleGenerateAudio = useCallback(async () => {
    console.log("[Audio] generating music via Comfy ONLY");
    if (isAudioGenerating) return;
    setIsAudioGenerating(true);
    setAudioError(null);

    try {
      const prefix = `audio_${new Date().toISOString().replace(/[:.]/g, "-")}`;
      console.log("[Audio] new prefix:", prefix);

      setAudioPrefixes((prev) => {
        const next = Array.from(new Set([...prev, prefix]));
        console.log("[Audio] setAudioPrefixes ->", next);
        onArtifactsChange?.({ audioPrefixes: next });
        return next;
      });

      startAudioScanTimer();

      const basePrompt = audioPromptText.trim();
      console.log("audio prompt-->", audioPromptText);
      console.log("[Audio] final prompt:", basePrompt);

      const payload = {
        prompt: basePrompt,
        seconds: 30,
        prefix,
      };

      console.log("[Audio] calling /api/comfy/audio with:", payload);

      const res = await fetch("/api/comfy/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Comfy audio failed (${res.status})`);
      }

      const immediateUrl =
        typeof json.url === "string" ? json.url : json.result;

      if (immediateUrl) {
        setAudioUrls((prev) => {
          const sanitized = sanitizeAudioList(
            Array.from(new Set([...prev, immediateUrl]))
          );
          onArtifactsChange?.({ audioUrls: sanitized });
          return sanitized;
        });
      } else {
        setTimeout(() => {
          void handleScanAudio();
        }, 12_000);
        startAudioScanTimer();
      }
    } catch (err: any) {
      console.error("[Audio] Comfy generation error", err);
      setAudioError(toText(err?.message || err));
    } finally {
      setIsAudioGenerating(false);
    }
  }, [
    isAudioGenerating,
    onArtifactsChange,
    sanitizeAudioList,
    startAudioScanTimer,
    handleScanAudio,
    audioPromptText,
  ]);

  const handleGenerateTrailerFlow = useCallback(async () => {
    if (isVideoStarting || isStillsLoading || isAudioGenerating) return;
    if (!screenplay.trim() || !storyboardShotsRef.current.length) return;

    let workingStills = stillsRef.current;
    if (!workingStills.length) {
      workingStills = (await handleGenerateStills()) ?? [];
    }
    if (!workingStills.length) return;

    if (!audioUrlsRef.current.length) {
      await handleGenerateAudio();
    }

    await handleGenerateVideos();
  }, [
    isVideoStarting,
    isStillsLoading,
    isAudioGenerating,
    screenplay,
    handleGenerateStills,
    handleGenerateAudio,
    handleGenerateVideos,
  ]);

  useEffect(() => {
    if (autoRun) {
      void handleGenerateTrailerFlow();
    }
  }, [autoRun, handleGenerateTrailerFlow]);

  const handleApiGenerateTrailer = useCallback(async () => {
    if (isTrailerApiLoading || !screenplay.trim()) return;
    setIsTrailerApiLoading(true);
    setTrailerApiError(null);
    try {
      const result = await generateTrailerStep({
        screenplay,
        provider: modelProvider,
        storychars: storychars ?? null,
      });
      setLocalTrailer(result);
      onUpdate(result);
    } catch (err: any) {
      console.error("[Trailer API] generate failed", err);
      setTrailerApiError(toText(err?.message || err));
    } finally {
      setIsTrailerApiLoading(false);
    }
  }, [isTrailerApiLoading, screenplay, modelProvider, storychars, onUpdate]);

  /* ------------------------------ UI ----------------------------- */
  return (
    <Card className="bg-slate-800/50 border-slate-700 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <VideoIcon className="w-6 h-6 text-red-400" />
          Trailer
        </CardTitle>
        <CardDescription className="text-slate-300">
          This step only displays artifacts and runs by explicit actions you trigger.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Trailer hero / workspace */}
        <div className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
          {stitchedUrl ? (
            <video
              key={stitchedUrl}
              src={stitchedUrl}
              controls
              playsInline
              muted
              autoPlay
              preload="metadata"
              className="absolute inset-0 h-full w-full object-contain bg-black"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-20 h-20 mx-auto bg-purple-600/20 rounded-full flex items-center justify-center border-2 border-purple-500">
                  <Play className="w-10 h-10 text-purple-400" />
                </div>
                <div className="text-white">Trailer Workspace</div>
                <div className="text-xs text-slate-400">
                  {!hasAllClips && `Waiting for clips (${clips.length}/${Math.max(targetClips, 1)})…`}
                  {hasAllClips && !hasAudio && "Waiting for audio…"}
                  {hasAllClips && hasAudio && !stitchedUrl && "Ready to stitch…"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Breakdown text */}
        {localTrailer && (
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Trailer Notes</label>
            <div className="bg-slate-900/50 border border-slate-600 rounded-lg p-4 max-h-96 overflow-y-auto">
              <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">
                {toText(localTrailer.description)}
              </pre>
            </div>
          </div>
        )}

        {/* Actions toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <Button
            variant="outline"
            onClick={handlePlanShots}
            disabled={isStoryboardLoading || !screenplay.trim()}
            className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
            title="Plan 4 minimal shots from screenplay"
          >
            {isStoryboardLoading ? "Planning…" : "Plan Shots"}
          </Button>

          <Button
            onClick={handleGenerateStills}
            disabled={isStillsLoading || !screenplay.trim() || storyboardShots.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isStillsLoading ? "Generating Stills…" : (stills.length ? "Regenerate Stills" : "Generate Stills")}
          </Button>

          <Button
            onClick={handleGenerateTrailerFlow}
            disabled={
              isVideoStarting ||
              isStillsLoading ||
              isAudioGenerating ||
              (!stills.length && !storyboardShots.length)
            }
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isVideoStarting
              ? "Starting Renders…"
              : stills.length
                ? "Regenerate Trailer"
                : "Generate Trailer"}
          </Button>

          <Button
            onClick={handleApiGenerateTrailer}
            disabled={isTrailerApiLoading || !screenplay.trim()}
            className="bg-fuchsia-600 hover:bg-fuchsia-700"
          >
            {isTrailerApiLoading ? "Generating via API…" : "Generate Trailer (API)"}
          </Button>

          <Button
            variant="outline"
            onClick={handleManualScan}
            disabled={!startedPrefixes.length || scanBusy}
            className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
          >
            {scanBusy ? "Scanning…" : "Rescan Output/Video"}
          </Button>

          {isStillsLoading && (
            <div className="flex-1 min-w-[200px] h-2 bg-white/10 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {trailerApiError && (
          <div className="text-xs text-red-400">{toText(trailerApiError)}</div>
        )}

        {/* Storyboard shots list */}
        <div className="space-y-2">
          <h4 className="text-slate-200 font-medium">Storyboard + Prompt Controls</h4>
          {storyboardShots.length === 0 ? (
            <p className="text-sm text-slate-400">No shots yet. Plan shots or return to Storyboard step.</p>
          ) : (
            <ul className="space-y-2">
              {storyboardShots.map((s, i) => (
                <li key={`${s.id ?? i}-${s.prompt.slice(0, 12)}`} className="rounded-xl border border-slate-700 p-3 space-y-3">
                  <div className="text-xs text-slate-400">
                    Shot #{s.id ?? i + 1} &middot; Used for still + video prompts
                  </div>
                  <div className="space-y-2">
                    <Textarea
                      value={s.prompt}
                      onChange={(e) => handleShotPromptChange(i, "prompt", e.target.value)}
                      className="bg-slate-900/60 border-slate-700 text-slate-100 text-sm"
                      rows={3}
                    />
                    <Textarea
                      value={s.negative || ""}
                      onChange={(e) => handleShotPromptChange(i, "negative", e.target.value)}
                      className="bg-slate-900/60 border-slate-700 text-slate-100 text-sm"
                      rows={2}
                      placeholder="Negative prompt (optional)"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stills grid */}
        {stills.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-slate-200 font-medium">Stills</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2">
              {stills.map((s, i) => (
                <figure key={`${s.filename ?? s.url}-${i}`} className="rounded-md overflow-hidden border border-slate-700">
                  <img src={s.url} alt={`Shot ${i + 1}`} className="w-full h-auto" />
                  {toText((s as any).prompt) && (
                    <figcaption className="p-2 text-xs text-slate-300 bg-slate-900/60">
                      {toText((s as any).prompt)}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        )}

        {/* Video grid */}
        {clips.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-slate-200 font-medium">Rendered Clips</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clips.map((c) => (
                <div key={`${c.filename}-${c.i}`} className="rounded-md overflow-hidden border border-slate-700 bg-slate-900/40">
                  <video src={c.url} controls playsInline className="w-full h-auto block" />
                  <div className="p-2 text-xs text-slate-400 flex justify-between">
                    <span>{toText(c.filename ?? `Shot ${c.i + 1}`)}</span>
                    {c.filename && <code className="opacity-70">{toText(c.filename)}</code>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🎧 Audio Section */}
        <div className="space-y-2">
          <h4 className="text-slate-200 font-medium">Audio Tracks</h4>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Audio Prompt (edit before generating)
            </label>
            <Textarea
              value={audioPromptText}
              onChange={(e) => setAudioPromptText(e.target.value)}
              placeholder="Audio prompt will appear here after planning. You can tweak it before generating."
              rows={4}
              className="bg-slate-900/60 border-slate-700 text-slate-100 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <Button
              onClick={handleGenerateAudio}
              disabled={isAudioGenerating}
              className="bg-pink-600 hover:bg-pink-700"
            >
              {isAudioGenerating ? "Generating Audio…" : "Generate Audio"}
            </Button>

            <Button
              variant="outline"
              onClick={handleScanAudio}  
              disabled={isAudioScanning}
              className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
            >
              {isAudioScanning ? "Scanning…" : "Rescan Audio"}
            </Button>
          </div>

          {audioError && (
            <div className="text-xs text-red-400">{audioError}</div>
          )}

          {audioUrls.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              {audioUrls.map((u) => (
                <div key={u} className="rounded-md overflow-hidden border border-slate-700 bg-slate-900/40 p-3">
                  <audio src={u} controls className="w-full" />
                  <div className="text-xs text-slate-400 break-all mt-1">{toText(u)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual stitch button */}
        <div className="flex flex-wrap gap-3 items-center">
          <Button
            onClick={stitch}
            disabled={isStitching || (!clips.length && !startedPrefixes.length)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isStitching ? "Stitching…" : "Manual Stitch"}
          </Button>
        </div>

        {/* Export + footer */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
            onClick={() => alert("TODO: add zip export for stills & clips")}
          >
            <Download className="w-4 h-4 mr-2" />
            Download Assets
          </Button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onBack}
              className="bg-slate-900/50 border-slate-600 text-slate-300 hover:bg-slate-900 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Storyboard
            </Button>
            <Button className="bg-purple-600 hover:bg-purple-700">Save Project</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default TrailerStep;