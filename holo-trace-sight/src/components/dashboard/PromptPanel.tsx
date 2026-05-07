import { useState } from "react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/substrate/sse";

type AgentRole = "producer" | "consumer";

interface PromptPanelProps {
  /** When `true` (default), the panel is hidden — used in mock mode where
   *  there's no backend to send the prompt to. */
  disabled?: boolean;
}

/**
 * Free-form agent prompt input. Sends a natural-language prompt to the
 * backend's POST /api/demo/agent-prompt, which runs a Bedrock tool-use
 * loop with the 5 MCP tools as available functions. Whatever tools the
 * model picks fire as the selected agent — same code path as a real
 * Claude Code MCP client, but without the external CLI.
 *
 * The model's text reasoning surfaces in the activity stream as
 * `agent.thought` events; tool calls fire their usual SSE events.
 */
export function PromptPanel({ disabled = false }: PromptPanelProps) {
  const [agent, setAgent] = useState<AgentRole>("producer");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const send = async () => {
    if (running || !prompt.trim()) return;
    setRunning(true);
    setLastError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/demo/agent-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
      }
      // Loop runs server-side; events flow back via SSE. We don't wait.
      setPrompt("");
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      // Disable button briefly to debounce — actual loop runs ~5–15s
      // depending on how many tool turns the model takes.
      setTimeout(() => setRunning(false), 1500);
    }
  };

  if (disabled) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute bottom-6 left-6 z-20 rounded-full border border-ink/15 bg-paper/95 px-4 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim shadow-[0_4px_12px_rgba(0,0,0,0.08)] backdrop-blur transition hover:border-primary hover:text-primary"
        title="Open the prompt input"
      >
        ▸ prompt
      </button>
    );
  }

  return (
    <div className="absolute bottom-6 left-6 z-20 w-[360px] rounded-md border border-ink/15 bg-paper/95 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-[14px] font-black italic tracking-tight text-ink">
          Agent prompt
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-dim hover:text-ink"
          title="Collapse"
        >
          ✕
        </button>
      </div>

      {/* Agent role toggle */}
      <div className="mb-2 flex items-center gap-1 rounded-sm border border-ink/10 bg-ink/[0.02] p-1">
        {(["producer", "consumer"] as AgentRole[]).map((role) => {
          const active = role === agent;
          return (
            <button
              key={role}
              onClick={() => setAgent(role)}
              className={cn(
                "flex-1 rounded-sm px-3 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors",
                active
                  ? role === "producer"
                    ? "bg-state-decision/10 text-state-decision"
                    : "bg-state-investigation/10 text-state-investigation"
                  : "text-ink-dim hover:text-ink"
              )}
            >
              {role}
            </button>
          );
        })}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            void send();
          }
        }}
        placeholder={
          agent === "producer"
            ? "e.g. Write a draft schema for the payments-api transaction object — fields: tx_id, amount, currency, status."
            : "e.g. Read context for the payments-api transaction schema and summarise what the producer has drafted."
        }
        rows={4}
        className="w-full resize-none rounded-sm border border-ink/15 bg-paper px-3 py-2 font-mono text-[12px] leading-snug text-ink outline-none transition placeholder:text-ink-dim/60 focus:border-primary"
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[10px] text-ink-dim">
          ⌘/Ctrl-Enter to send
        </span>
        <button
          onClick={send}
          disabled={running || !prompt.trim()}
          className={cn(
            "rounded-sm px-3 py-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.18em] transition",
            running || !prompt.trim()
              ? "cursor-not-allowed bg-ink/[0.05] text-ink-dim"
              : "bg-primary text-paper hover:bg-primary/90"
          )}
        >
          {running ? "sending…" : `send as ${agent}`}
        </button>
      </div>

      {lastError && (
        <div className="mt-2 rounded-sm border border-state-claim/40 bg-state-claim/5 px-2 py-1 font-mono text-[10px] text-state-claim">
          {lastError}
        </div>
      )}
    </div>
  );
}
