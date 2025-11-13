import { callLLM, DEFAULT_MODEL } from "@/lib/model/modelProvider";
import type { AgentInput, AgentReply } from "./types";

const SYSTEM = `You are Filmforge's Writer Agent.

Task: when the user asks for TONE or DIALOGUE changes, RETURN ONLY JSON matching:
{
  "target": "screenplay",
  "ops": [
    // Examples (choose the smallest safe set that performs the edit):
    // {"action":"replace_regex","pattern":"(?s)SCENE 3[\\s\\S]*?(?=\\nSCENE \\d+|$)","flags":"i","text":"<new scene 3 text>"},
    // {"action":"replace_first","find":"OLD LINE","text":"NEW LINE"},
    // {"action":"insert_after","anchor":"FADE IN:","text":"<new opening lines>"},
    // {"action":"append","text":"<stinger or extra beat>"},
    // {"action":"replace_all","text":"<full revised screenplay>"} // last resort
  ]
}
Rules:
- No prose, no Markdown, no backticks — ONLY the JSON object when editing.
- Prefer minimally-scoped changes (regex or targeted replace) over full replace.
- Preserve screenplay formatting (INT./EXT., caps names, scene headers).

If the user asks general questions (not an edit), reply in short prose.`;

export async function writerAgent(input: AgentInput): Promise<AgentReply> {
  const { userMessage, context } = input;
  const screenplay = context?.screenplay || "";

  const text = await callLLM({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
`Current screenplay (trim if needed):
${screenplay.slice(0, 18000)}

User edit request (tone/dialogue focus):
${userMessage}

Return JSON per spec if this is an edit.`,
      },
    ],
    temperature: 0.5,
    maxTokens: 1400,
  });

  return { role: "assistant", agent: "writer", text };
}