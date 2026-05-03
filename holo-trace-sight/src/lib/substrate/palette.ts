import type { AgentId, WCType } from "./types";

export function agentColorVar(agent: AgentId | undefined): string {
  if (agent === "producer") return "var(--agent-producer)";
  if (agent === "consumer") return "var(--agent-consumer)";
  // Fallback for unknown agents — desaturated ring color.
  return "var(--ring)";
}

export function agentHsl(agent: AgentId | undefined): string {
  return `hsl(${agentColorVar(agent)})`;
}

export function wcStateVar(t: WCType): string {
  switch (t) {
    case "draft_schema":
      return "var(--state-draft)";
    case "decision":
      return "var(--state-decision)";
    case "claim":
      return "var(--state-claim)";
    case "investigation":
      return "var(--state-investigation)";
    case "open_question":
      return "var(--state-question)";
  }
}

export const wcLabel: Record<WCType, string> = {
  draft_schema: "Draft",
  decision: "Decision",
  claim: "Claim",
  investigation: "Investigation",
  open_question: "Open Question",
};

export const agentLabel: Record<string, string> = {
  producer: "Producer",
  consumer: "Consumer",
};