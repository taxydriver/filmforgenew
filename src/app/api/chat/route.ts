import { NextResponse } from "next/server";
import { orchestrateAgents } from "@/lib/orchestrator";
import type { AgentInput } from "@/lib/agents/types";

export async function POST(req: Request) {
  try {   
    const body = (await req.json()) as AgentInput;
    if (!body?.agent || !body?.userMessage) {
      return NextResponse.json({ error: "agent and userMessage required" }, { status: 400 });
    }
    const reply = await orchestrateAgents(body);
    return NextResponse.json({ text: reply.text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "error" }, { status: 500 });
  }
}