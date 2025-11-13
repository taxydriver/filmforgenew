"use client";
import React, { useState } from "react";
import { useFilmforgeChat } from "@/lib/chatContext";
import { ChatBubble } from "@/components/ChatBubble";
import { MessageSquare, Send } from "lucide-react";

export default function GlobalChatDock() {
  const { messages, send, busy, agent, setAgent } = useFilmforgeChat();
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!open ? (
        <button onClick={() => setOpen(true)} className="rounded-full p-3 bg-indigo-600 text-white shadow-lg">
          <MessageSquare className="w-5 h-5" />
        </button>
      ) : (
        <div className="w-[360px] h-[480px] bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
            <div className="text-slate-100 font-medium">Filmforge • Global Chat</div>
            <div className="flex items-center gap-2">
              <select
                value={agent}
                onChange={(e) => setAgent(e.target.value as any)}
                className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1 border border-slate-700"
              >
                <option value="writer">Writer</option>
                <option value="director">Director</option>
              </select>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
          </div>

          <div className="flex-1 p-3 space-y-2 overflow-auto">
            {messages.length === 0 && (
              <div className="text-xs text-slate-400">
                Ask the <b>Writer</b> to refine ideas or the <b>Director</b> to plan trailer shots.
              </div>
            )}
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} text={m.text} meta={m.agent?.toUpperCase()} />
            ))}
          </div>

          <form
            className="p-2 border-t border-slate-700 flex gap-2"
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
              className="rounded-lg px-3 py-2 bg-indigo-600 text-white disabled:opacity-50 flex items-center gap-1"
            >
              <Send className="w-4 h-4" /> Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}