import React from 'react';

export type FilmMode = 'storyboard' | 'trailer' | 'short' | 'feature';

export function ModeSelector({
  mode,
  onChange,
}: {
  mode: FilmMode;
  onChange: (m: FilmMode) => void;
}) {
  const modes: { key: FilmMode; label: string; enabled: boolean }[] = [
    { key: 'storyboard', label: 'Storyboard', enabled: true },
    { key: 'trailer', label: 'Trailer', enabled: false },
    { key: 'short', label: 'Short Film', enabled: false },
    { key: 'feature', label: 'Feature', enabled: false },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {modes.map(m => {
        const active = mode === m.key;
        const base =
          'h-11 rounded-lg border px-3 text-sm text-left transition';
        const activeCls = 'bg-white text-slate-900 hover:bg-white/90 border-white';
        const enabledInactive = 'bg-white/10 border-white/20 text-white hover:bg-white/15';
        const disabledCls = 'bg-white/5 border-white/10 text-white/50 cursor-not-allowed';
        return (
          <button
            key={m.key}
            className={[base, m.enabled ? (active ? activeCls : enabledInactive) : disabledCls].join(' ')}
            onClick={() => m.enabled && onChange(m.key)}
            disabled={!m.enabled}
            title={!m.enabled ? 'Coming soon' : undefined}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}