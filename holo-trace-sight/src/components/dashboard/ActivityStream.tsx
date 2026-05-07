import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubstrate } from "@/lib/substrate/store";
import { agentLabel } from "@/lib/substrate/palette";

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

export function ActivityStream() {
  const activity = useSubstrate((s) => s.activity);
  const focusNodes = useSubstrate((s) => s.focusNodes);
  const [collapsed, setCollapsed] = useState(false);
  const [paused, setPaused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused && listRef.current) listRef.current.scrollTop = 0;
  }, [activity, paused]);

  // Side panel layout: tall + narrow, on the right of the canvas. The list
  // becomes a vertical stack of compact "cards" (one per row) instead of the
  // horizontal columns of the bottom-strip layout.
  return (
    <section
      className={cn(
        "flex h-full shrink-0 flex-col border-l border-ink bg-paper transition-all",
        collapsed ? "w-12" : "w-[380px]",
      )}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "flex h-10 shrink-0 items-center border-b border-ink/40 text-left",
          collapsed ? "justify-center" : "justify-between px-5",
        )}
        title={collapsed ? "Expand activity stream" : "Collapse activity stream"}
      >
        {collapsed ? (
          <ChevronLeft className="h-4 w-4 text-ink" />
        ) : (
          <>
            <div className="flex items-baseline gap-3 truncate">
              <span className="font-display text-[14px] italic font-bold text-ink">
                Activity stream
              </span>
              <span className="font-mono text-[11px] text-ink-dim">
                {activity.length}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-ink" />
          </>
        )}
      </button>
      {!collapsed && (
        <div
          ref={listRef}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="flex-1 overflow-y-auto"
        >
          {activity.length === 0 ? (
            <div className="px-5 py-4 font-body text-[13px] italic text-ink-dim">
              Waiting for memory layer events…
            </div>
          ) : (
            <ul>
              {activity.map((a, i) => {
                const agentColor = a.agent
                  ? a.agent === "producer"
                    ? "hsl(var(--agent-producer))"
                    : a.agent === "consumer"
                      ? "hsl(var(--agent-consumer))"
                      : a.agent === "resolver"
                        ? "hsl(var(--agent-resolver, 45 90% 50%))" // yellow fallback
                        : "hsl(var(--ink-dim))"
                  : "hsl(var(--ink-dim))";
                return (
                  <li
                    key={a.id}
                    onClick={() => focusNodes(a.nodeIds)}
                    className={cn(
                      "cursor-pointer border-b border-ink/10 px-5 py-2 font-mono text-[11px] leading-snug hover:bg-paper-2",
                      i % 2 === 1 && "bg-paper-2/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide" style={{ color: agentColor }}>
                        <span className="h-1.5 w-1.5" style={{ background: "currentColor" }} />
                        {a.agent ? (agentLabel[a.agent] ?? a.agent) : "—"}
                      </span>
                      <span className="text-ink-dim">{fmtTime(a.ts)}</span>
                    </div>
                    <div className="mt-1 font-semibold uppercase tracking-wide text-primary text-[10px]">
                      {a.action.replace(/_/g, " ")}
                    </div>
                    {a.scope && (
                      <div className="mt-0.5 truncate text-ink-dim text-[10px]">
                        {a.scope}
                      </div>
                    )}
                    <div className="mt-1 text-ink line-clamp-3" title={a.summary}>
                      {a.summary}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
