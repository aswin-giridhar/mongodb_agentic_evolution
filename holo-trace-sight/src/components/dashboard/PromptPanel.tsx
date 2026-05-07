import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/substrate/sse";

type AgentRole = "producer" | "consumer";

interface PromptPanelProps {
  /** When `true`, the panel is hidden — used in mock mode where
   *  there's no backend to send the prompt to. */
  disabled?: boolean;
}

interface Position {
  x: number;
  y: number;
}

const PANEL_WIDTH = 360;
const PANEL_DEFAULT_HEIGHT = 230; // approx — used only for initial bottom-left placement
const VIEWPORT_PADDING = 16;
const STORAGE_KEY = "substrate.promptPanel.position";

/**
 * Free-form agent prompt input — the dashboard's substitute for an external
 * Claude Code instance. Sends a natural-language prompt to the backend's
 * /api/demo/agent-prompt, which runs a Bedrock tool-use loop and fires the
 * resulting MCP tool calls as the chosen agent.
 *
 * Draggable by the title bar. Position persists in localStorage across
 * reloads so the user's preferred placement sticks during a demo.
 */
export function PromptPanel({ disabled = false }: PromptPanelProps) {
  const [agent, setAgent] = useState<AgentRole>("producer");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const [pos, setPos] = useState<Position | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    panelX: number;
    panelY: number;
  } | null>(null);

  // Initialize position: restore saved value, or default to bottom-left.
  useEffect(() => {
    if (pos !== null) return;
    let initial: Position | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Position;
        if (
          typeof parsed.x === "number" &&
          typeof parsed.y === "number" &&
          Number.isFinite(parsed.x) &&
          Number.isFinite(parsed.y)
        ) {
          initial = parsed;
        }
      }
    } catch {
      // ignore
    }
    if (!initial) {
      initial = {
        x: VIEWPORT_PADDING,
        y: window.innerHeight - PANEL_DEFAULT_HEIGHT - VIEWPORT_PADDING,
      };
    }
    setPos(clampToViewport(initial));
  }, [pos]);

  // Persist position changes
  useEffect(() => {
    if (!pos) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch {
      // ignore
    }
  }, [pos]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Skip drag if click target is interactive (close button etc.)
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: rect.left,
      panelY: rect.top,
    };
    // capture pointer so move/up keep firing if cursor leaves the handle
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const start = dragStartRef.current;
    setPos(
      clampToViewport({
        x: start.panelX + (e.clientX - start.mouseX),
        y: start.panelY + (e.clientY - start.mouseY),
      })
    );
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

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
      // Brief debounce — actual loop runs ~5–15s depending on tool turns.
      setTimeout(() => setRunning(false), 1500);
    }
  };

  if (disabled) return null;
  // Hold render until we've computed initial position (avoids a flash at 0,0)
  if (!pos) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute z-20 rounded-full border border-ink/15 bg-paper/95 px-4 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim shadow-[0_4px_12px_rgba(0,0,0,0.08)] backdrop-blur transition hover:border-primary hover:text-primary"
        style={{ left: pos.x, top: pos.y }}
        title="Open the prompt input"
      >
        ▸ prompt
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-20 rounded-md border border-ink/15 bg-paper/95 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur"
      style={{ left: pos.x, top: pos.y, width: PANEL_WIDTH }}
    >
      <div
        className="-mx-4 -mt-4 mb-3 flex cursor-grab items-center justify-between border-b border-ink/10 px-4 py-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to move"
      >
        <span className="flex items-center gap-2 select-none">
          <span
            className="text-ink-dim"
            aria-hidden
            style={{ letterSpacing: "1px", lineHeight: 1 }}
          >
            ⠿
          </span>
          <span className="font-display text-[14px] font-black italic tracking-tight text-ink">
            Agent prompt
          </span>
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
          ⌘/Ctrl-Enter to send · drag header to move
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

function clampToViewport({ x, y }: Position): Position {
  const maxX = window.innerWidth - PANEL_WIDTH - VIEWPORT_PADDING;
  const maxY = window.innerHeight - PANEL_DEFAULT_HEIGHT - VIEWPORT_PADDING;
  return {
    x: Math.max(VIEWPORT_PADDING, Math.min(x, Math.max(VIEWPORT_PADDING, maxX))),
    y: Math.max(VIEWPORT_PADDING, Math.min(y, Math.max(VIEWPORT_PADDING, maxY))),
  };
}
