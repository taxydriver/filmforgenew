import { useCallback, useRef, useState } from "react";
import { collectPrefixes, filenameFromAny, MediaLike } from "./helpers";

type ClipLike = MediaLike;
type TrailerInfo = { videoUrl: string; description: string } | null;

export function useTrailerStitching({
  clips,
  audioPrefixes,
  startedPrefixes,
  localTrailer,
  initialStitchedUrl = "",
  setLocalTrailer,
  onUpdate,
  onArtifactsChange,
}: {
  clips: ClipLike[];
  audioPrefixes: string[];
  startedPrefixes: string[];
  localTrailer: TrailerInfo;
  initialStitchedUrl?: string;
  setLocalTrailer: (value: TrailerInfo) => void;
  onUpdate: (value: { videoUrl: string; description: string }) => void;
  onArtifactsChange?: (patch: Record<string, any>) => void;
}) {
  const [isStitching, setIsStitching] = useState(false);
  const [stitchedUrl, setStitchedUrl] = useState(initialStitchedUrl);
  const [stitchLog, setStitchLog] = useState("");
  const [autoStitchDisabled, setAutoStitchDisabled] = useState(false);
  const hasAutoStitchedRef = useRef(false);

  const stitch = useCallback(async () => {
    if (isStitching) return;

    const clipNames = collectClipNames(clips);
    const prefixes = collectPrefixes(startedPrefixes, clips);

    if (!clipNames.length && !prefixes.length) {
      setStitchLog("Nothing to stitch — no clips or prefixes found.");
      return;
    }

    setIsStitching(true);
    setStitchLog("");

    try {
      const payload: Record<string, unknown> = { audioPrefixes };
      if (clipNames.length) payload.clips = clipNames;
      else payload.prefixes = prefixes;

      const res = await fetch("/api/trailer/stitch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Stitch failed");

      const url = `/api/trailer/file?name=${encodeURIComponent("trailer_final.mp4")}&t=${Date.now()}`;
      setStitchedUrl(url);
      setStitchLog(json.log || "");
      onArtifactsChange?.({ stitchedUrl: url });

      const updated = {
        videoUrl: url,
        description: (localTrailer?.description ?? "") + "\n\n[Stitched trailer ready]",
      };
      setLocalTrailer(updated);
      onUpdate(updated);
    } catch (err: any) {
      setStitchLog(String(err?.message || err));
      setAutoStitchDisabled(true);
    } finally {
      setIsStitching(false);
    }
  }, [isStitching, clips, audioPrefixes, startedPrefixes, localTrailer, onUpdate, setLocalTrailer]);

  return {
    stitch,
    isStitching,
    stitchedUrl,
    stitchLog,
    autoStitchDisabled,
    setAutoStitchDisabled,
    hasAutoStitchedRef,
  };
}

function collectClipNames(clips: ClipLike[]) {
  const names: string[] = [];
  for (const clip of clips) {
    const name = filenameFromAny(clip, undefined);
    if (name) names.push(name);
  }
  return names;
}
