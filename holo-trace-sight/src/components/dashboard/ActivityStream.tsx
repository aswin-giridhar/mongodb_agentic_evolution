import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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

  return (
    <section
      className={cn(
        "flex flex-col border-t border-ink bg-paper transition-all",
        collapsed ? "h-10" : "h-[28vh]",
      )}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-10 shrink-0 items-center justify-between border-b border-ink/40 px-8 text-left"
      >
        <div className="flex items-baseline gap-4">
          <span className="font-display text-[14px] italic font-bold text-ink">
            The Activity Stream
          </span>
          <span className="font-mono text-[11px] text-ink-dim">
            {activity.length} entries
          </span>
        </div>
        {collapsed ? (
          <ChevronUp className="h-4 w-4 text-ink" />
        ) : (
          <ChevronDown className="h-4 w-4 text-ink" />
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
            <div className="px-8 py-4 font-body text-[13px] italic text-ink-dim">
              Waiting for memory layer events…
            </div>
          ) : (
            <ul>
              {activity.map((a, i) => (
                <li
                  key={a.id}
                  onClick={() => focusNodes(a.nodeIds)}
                  className={cn(
                    "flex cursor-pointer items-center gap-4 border-b border-ink/10 px-8 py-1.5 font-mono text-[12px] hover:bg-paper-2",
                    i % 2 === 1 && "bg-paper-2/60",
                  )}
                >
                  <span className="w-20 text-ink-dim">{fmtTime(a.ts)}</span>
                  {a.agent ? (
                    <span
                      className="flex w-24 items-center gap-1.5 font-semibold uppercase"
                      style={{
                        color:
                          a.agent === "producer"
                            ? "hsl(var(--agent-producer))"
                            : "hsl(var(--agent-consumer))",
                      }}
                    >
                      <span className="h-1.5 w-1.5" style={{ background: "currentColor" }} />
                      {agentLabel[a.agent] ?? a.agent}
                    </span>
                  ) : (
                    <span className="w-24 text-ink-dim">—</span>
                  )}
                  <span className="w-44 font-semibold uppercase tracking-wide text-primary">
                    {a.action.replace(/_/g, " ")}
                  </span>
                  <span className="w-52 truncate text-ink-dim">{a.scope ?? ""}</span>
                  <span className="flex-1 truncate text-ink">{a.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
