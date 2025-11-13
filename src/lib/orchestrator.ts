import type { AgentInput, AgentReply } from "@/lib/agents/types";
import { writerAgent } from "@/lib/agents/writerAgent";
import { directorAgent } from "@/lib/agents/directorAgent";

export async function orchestrateAgents(payload: AgentInput): Promise<AgentReply> {
  switch (payload.agent) {
    case "writer":
      return writerAgent(payload);
    case "director":
      return directorAgent(payload);
    default:
      throw new Error(`Unknown agent: ${(payload as any)?.agent}`);
  }
}