import { useState } from "react";
import { planTrailer } from "@/lib/trailer";
import type { ModelProvider } from "@/types/model";

export default function TrailerPlanner({
  concept,
  screenplay = "",
  provider = "openai",
}: {
  concept: string;
  screenplay?: string;
  provider?: ModelProvider;
}) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const onPlan = async () => {
    setLoading(true); setError(null);
    try {
      const data = await planTrailer({ concept, screenplay, shots: 10, provider });
      setPlan(data);
    } catch (e: any) {
      setError(e?.message || "Failed to plan trailer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onPlan} disabled={loading} className="px-4 py-2 rounded bg-purple-600 text-white">
        {loading ? "Planning…" : `Plan Trailer (${provider === "openai" ? "OpenAI" : "Claude"})`}
      </button>

      {error && <pre className="text-red-400 text-sm">{error}</pre>}

      {plan && (
        <pre className="text-xs bg-slate-900/50 text-slate-200 p-3 rounded border border-slate-700 overflow-auto">
{JSON.stringify(plan, null, 2)}
        </pre>
      )}
    </div>
  );
}
