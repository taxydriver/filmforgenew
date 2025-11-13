export type AgentName = "writer" | "director";

export type AgentInput = {
  agent: AgentName;
  userMessage: string;
  context?: Record<string, any>;
};

export type AgentReply = {
  role: "assistant";
  agent: AgentName;
  text: string;
};