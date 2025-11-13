"use client";
import React from "react";
import clsx from "clsx";

export function ChatBubble({
  role,
  text,
  meta,
}: {
  role: "user" | "assistant";
  text: string;
  meta?: string;
}) {
  return (
    <div className={clsx("w-full flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap",
          role === "user" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-100"
        )}
      >
        {meta && <div className="text-[10px] opacity-70 mb-1">{meta}</div>}
        {text}
      </div>
    </div>
  );
}