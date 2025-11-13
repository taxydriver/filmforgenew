import React, { useRef } from 'react';

export type Scope =
  | 'storyboard'
  | 'trailer'
  | 'short_film'
  | 'feature_film';

export type WriterMode = 'single_writer' | 'multiple_writers';

export function ClassicOptionsBar({
  idea,
  onIdeaImport,
  ragEnabled,
  onToggleRag,
  scope,
  onScopeChange,
  writerMode,
  onWriterModeChange,
  disabledScopes = { trailer: true, short_film: true, feature_film: true },
}: {
  idea: string;
  onIdeaImport: (text: string) => void;
  ragEnabled: boolean;
  onToggleRag: (v: boolean) => void;
  scope: Scope;
  onScopeChange: (s: Scope) => void;
  writerMode: WriterMode;
  onWriterModeChange: (w: WriterMode) => void;
  disabledScopes?: Partial<Record<Scope, boolean>>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function pickTxt() {
    fileRef.current?.click();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      onIdeaImport(text);
    } catch {
      // swallow
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 text-white/90">
      <p className="text-sm text-white/70 mb-4">
        Feed the studio an idea, toggle RAG Style Mode for reference tone, and roll camera to produce
        structure, screenplay, synopsis, and concept frames.
      </p>

      {/* Concept Brief header (visual only; your actual IdeaStep handles input) */}
      <div className="tracking-[0.35em] text-xs font-semibold text-white/60 mb-2 select-none">
        C O N C E P T&nbsp;&nbsp;B R I E F
      </div>

      {/* Helper tip (visual parity with MVP) */}
      <div className="text-[11px] text-white/50 mb-3">Tip: ⌘/Ctrl + Enter to roll</div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        {/* Import .txt Concept */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={pickTxt}
            className="h-9 rounded-md px-3 text-sm bg-white text-slate-900 hover:bg-white/90"
          >
            Import .txt Concept
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md"
            className="hidden"
            onChange={onPickFile}
          />

          {/* RAG Style Mode */}
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-white"
              checked={ragEnabled}
              onChange={(e) => onToggleRag(e.target.checked)}
            />
            <span className="text-white/90">RAG Style Mode</span>
          </label>
        </div>

        {/* Scope (Storyboard / Trailer / Short / Feature) */}
        <div className="md:ml-auto flex items-center gap-2">
          <select
            value={scope}
            onChange={(e) => onScopeChange(e.target.value as Scope)}
            className="h-10 rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <option value="storyboard">Storyboard Only</option>
            <option value="trailer" disabled={!!disabledScopes.trailer}>
              Trailer (Disabled)
            </option>
            <option value="short_film" disabled={!!disabledScopes.short_film}>
              Short Film (Disabled)
            </option>
            <option value="feature_film" disabled={!!disabledScopes.feature_film}>
              Full Feature Film (Disabled)
            </option>
          </select>
        </div>
      </div>

      {/* Writer mode (single vs many) */}
      <div className="mt-3">
        <select
          value={writerMode}
          onChange={(e) => onWriterModeChange(e.target.value as WriterMode)}
          className="h-10 rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <option value="single_writer">Single Writer</option>
          <option value="multiple_writers">Multiple Writers</option>
        </select>

        <div className="mt-2 text-[11px] text-white/55">
          ⚙︎ Single writer is fastest. Multiple writers enables collaborative refinement (coming soon).
        </div>
      </div>
    </div>
  );
}
