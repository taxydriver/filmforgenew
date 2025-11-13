// src/components/ReferenceRAGBar.tsx
import React from 'react';

type Pacing = 'slow' | 'balanced' | 'kinetic';

export function ReferenceRAGBar({
  enabled, onToggle,
  influence, onInfluence,
  runtime, onRuntime,
  pacing, onPacing,
}: {
  enabled: boolean; onToggle: (v:boolean)=>void;
  influence: number; onInfluence: (v:number)=>void;
  runtime: number; onRuntime: (n:number)=>void;
  pacing: Pacing; onPacing: (p:Pacing)=>void;
}) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div>
        <label className="flex items-center justify-between text-sm text-white/90">
          <span>Use Reference Screenplay</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-white"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
        </label>
        <p className="text-xs text-white/60 mt-1">
          When enabled, we’ll use structure-level RAG cues (no verbatim text).
        </p>
      </div>

      <div>
        <label className="text-sm text-white/90">
          Reference Influence: {Math.round(influence * 100)}%
        </label>
        {/* NOTE the extra class names for specificity */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={influence}
          onChange={(e) => onInfluence(parseFloat(e.target.value))}
          className="w-full appearance-none rag-slider rag-slider--dark"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-white/90">Runtime (min)</label>
          <input
            type="number"
            min={5}
            max={180}
            value={runtime}
            onChange={(e) => onRuntime(parseInt(e.target.value || '90', 10))}
            className="w-full rounded-md border border-white/20 bg-white/5 px-2 py-1 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
        </div>
        <div>
          <label className="text-sm text-white/90">Pacing</label>
          <select
            value={pacing}
            onChange={(e) => onPacing(e.target.value as Pacing)}
            className="w-full rounded-md border border-white/20 bg-white/5 px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <option className="bg-slate-900" value="slow">Slow burn</option>
            <option className="bg-slate-900" value="balanced">Balanced</option>
            <option className="bg-slate-900" value="kinetic">Kinetic</option>
          </select>
        </div>
      </div>
    </div>
  );
}