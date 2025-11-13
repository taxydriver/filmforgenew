"use client";
import React, { createContext, useContext, useMemo, useState } from "react";
import type { AgentName } from "./agents/types";
import type { AgentOpsPayload } from "./agentOps";
import { applyOps } from "./agentOps";
import { useScreenplayStore } from "./screenplayStore";

type ChatMessage = { role: "user" | "assistant"; agent?: AgentName; text: string; ts: number };
type ChatCtx = { agent: AgentName; setAgent: (a: AgentName) => void; messages: ChatMessage[]; send: (t: string) => Promise<void>; busy: boolean; };

const ChatContext = createContext<ChatCtx | null>(null);

function tryParseOps(s: string): AgentOpsPayload | null {
  if (!s || s.trim()[0] !== "{") return null;
  try {
    const obj = JSON.parse(s);
    if (obj?.target === "screenplay" && Array.isArray(obj.ops)) return obj;
  } catch {}
  return null;
}

export function FilmforgeChatProvider({ children }: { children: React.ReactNode }) {
  const [agent, setAgent] = useState<AgentName>("writer");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const sp = useScreenplayStore();

  const send = async (text: string) => {
    setMessages((m) => [...m, { role: "user", text, ts: Date.now() }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent,                      // "writer" by default
          userMessage: text,          // tone/dialogue request
          context: { screenplay: sp.text }, // give model current script
        }),
      });
      const data = await res.json();
      let reply = data?.text ?? "";

      // If the model returned JSON ops, apply them immediately.
      const ops = tryParseOps(reply);
      if (ops) {
        const next = applyOps(sp.text, ops);
        sp.set(next);
        reply = "✅ Applied tone/dialogue edits to screenplay.";
      }

      setMessages((m) => [...m, { role: "assistant", agent, text: reply, ts: Date.now() }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", agent, text: `⚠️ ${e.message}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  };

  const value = useMemo(() => ({ agent, setAgent, messages, send, busy }), [agent, messages, busy]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useFilmforgeChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useFilmforgeChat must be used inside <FilmforgeChatProvider>");
  return ctx;
}