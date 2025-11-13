import { useState } from "react";
import { renderTrailer } from "@/lib/trailer";

export default function TrailerRenderer({ plan }: { plan: { shots: any[] } }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const onRender = async () => {
    setLoading(true);
    setError(null);
    try {
      // MVP: use server fallback graph; pass a graphTemplate to control your own Comfy workflow
      const data = await renderTrailer({ shots: plan.shots });
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Failed to render");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onRender} disabled={loading} className="px-4 py-2 rounded bg-green-600 text-white">
        {loading ? "Rendering…" : "Render Shots (Vast.ai)"}
      </button>

      {error && <pre className="text-red-400 text-sm">{error}</pre>}

      {result && (
        <div className="space-y-2">
          <h4 className="font-semibold">Results</h4>
          <pre className="text-xs bg-slate-900/50 text-slate-200 p-3 rounded border border-slate-700 overflow-auto">
{JSON.stringify(result, null, 2)}
          </pre>
          <div className="grid grid-cols-2 gap-3">
            {result.results?.flatMap((r: any) => r.files || []).map((url: string, i: number) => (
              <video key={i} src={url} controls className="w-full rounded border border-slate-700" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

