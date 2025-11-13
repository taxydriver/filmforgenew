import { callLLM, DEFAULT_MODEL } from "@/lib/model/modelProvider";
import type { AgentInput, AgentReply } from "./types";

const SYSTEM = `You are Filmforge's Director Agent.
Transform beats into a tight trailer plan.
Output sections with: SHOT TYPE, CAMERA MOVE, LENS, MOOD, VFX/NOTES.
Be specific and actionable for image/video generation.`;

export async function directorAgent(input: AgentInput): Promise<AgentReply> {
  const { userMessage, context } = input;
  const beats = context?.beats ? `\n\nBeats:\n${context.beats}` : "";
  const text = await callLLM({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `User request:\n${userMessage}${beats}` },
    ],
    temperature: 0.5,
    maxTokens: 1100,
  });
  return { role: "assistant", agent: "director", text };
}