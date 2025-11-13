"use client";
import React, { useEffect, useRef, useState } from "react";
import { useFilmforgeChat } from "@/lib/chatContext";
import { ChatBubble } from "@/components/ChatBubble";

const LS_KEY = "filmforge.chat.width";
const MIN_W = 260;
const MAX_W = 640;
const DEFAULT_W = 320;

export default function GlobalChatSidebar() {
  const { messages, send, busy, agent, setAgent } = useFilmforgeChat();
  const [input, setInput] = React.useState("");
  const [width, setWidth] = useState<number>(DEFAULT_W);
  const [resizing, setResizing] = useState(false);
  const startX = useRef(0);
  const startW = useRef(width);

  // Load persisted width & set CSS var on mount
  useEffect(() => {
    const w = Number(localStorage.getItem(LS_KEY)) || DEFAULT_W;
    const clamped = Math.min(Math.max(w, MIN_W), MAX_W);
    setWidth(clamped);
    document.documentElement.style.setProperty("--chat-w", `${clamped}px`);
  }, []);

  // Keep CSS var and localStorage in sync when width changes
  useEffect(() => {
    document.documentElement.style.setProperty("--chat-w", `${width}px`);
    localStorage.setItem(LS_KEY, String(width));
  }, [width]);

  // Drag handlers
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizing) return;
      const dx = e.clientX - startX.current;
      const next = Math.min(Math.max(startW.current + dx, MIN_W), MAX_W);
      setWidth(next);
    }
    function onUp() {
      if (!resizing) return;
      setResizing(false);
    }
    if (resizing) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);

  return (
    <aside
      className="hidden lg:flex fixed left-0 top-0 h-screen bg-slate-900/95 border-r border-slate-800 flex-col z-40"
      style={{ width }}
    >
      {/* Resize handle (right edge) */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        className={`absolute top-0 right-0 h-full w-1 cursor-ew-resize ${
          resizing ? "bg-purple-400/40" : "hover:bg-purple-400/30"
        }`}
        onMouseDown={(e) => {
          startX.current = e.clientX;
          startW.current = width;
          setResizing(true);
        }}
      />

      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-800 text-slate-100 flex items-center justify-between">
        <div className="font-medium">Filmforge • Chat</div>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value as any)}
          className="bg-slate-800 text-slate-100 text-xs rounded px-2 py-1 border border-slate-700"
        >
          <option value="writer">Writer</option>
          <option value="director">Director</option>
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-2 text-slate-100">
        {messages.length === 0 && (
          <div className="text-xs text-slate-400">
            Ask the <b>Writer</b> to refine tone/dialogue or the <b>Director</b> to plan shots.
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} text={m.text} meta={m.agent?.toUpperCase()} />
        ))}
      </div>

      {/* Composer */}
      <form
        className="p-2 border-t border-slate-800 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          const t = input.trim();
          setInput("");
          await send(t);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "Thinking..." : "Type a message"}
          className="flex-1 bg-slate-800 text-slate-100 text-sm rounded px-3 py-2 border border-slate-700 outline-none"
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-lg px-3 py-2 bg-indigo-600 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
}