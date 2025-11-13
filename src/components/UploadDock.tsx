// src/components/UploadDock.tsx
import React from 'react';

export function UploadDock({
  assets,
  onClickChoose,
  onClear,
}: {
  assets: File[];
  onClickChoose: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-white/90 font-medium">Reference & Assets</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClickChoose}
            className="h-9 rounded-md px-3 text-sm bg-white text-slate-900 hover:bg-white/90"
          >
            Choose files
          </button>
          {assets.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="h-9 rounded-md px-3 text-sm bg-white/10 text-white hover:bg-white/15 border border-white/20"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="text-xs text-white/60">No files chosen</div>
      ) : (
        <ul className="text-xs text-white/80 list-disc ml-5 mt-2 space-y-1">
          {assets.map((a, i) => (
            <li key={`${a.name}-${i}`}>
              {a.name} <span className="opacity-60">({Math.round(a.size / 1024)} KB)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}