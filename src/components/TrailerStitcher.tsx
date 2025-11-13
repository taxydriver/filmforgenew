import { useState } from "react";
import { stitchTrailer } from "@/lib/trailer";

export default function TrailerStitcher({ files }: { files: string[] }) {
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onStitch = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await stitchTrailer({ clips: files, outputName: "my_trailer" });
      setOut(data);
    } catch (e: any) {
      setErr(e?.message || "Stitch failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button onClick={onStitch} disabled={loading} className="px-4 py-2 rounded bg-indigo-600 text-white">
        {loading ? "Stitching…" : "Stitch Trailer"}
      </button>
      {err && <pre className="text-red-400 text-xs">{err}</pre>}
      {out && (
        <pre className="text-xs bg-slate-900/50 text-slate-200 p-2 rounded border border-slate-700 overflow-auto">
{JSON.stringify(out, null, 2)}
        </pre>
      )}
    </div>
  );
}

