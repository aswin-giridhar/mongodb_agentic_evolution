import { cn } from "@/lib/utils";
import type { ConnState } from "@/lib/substrate/store";

export function ConnectionDot({ state }: { state: ConnState }) {
  const map: Record<ConnState, { cls: string; label: string }> = {
    idle:       { cls: "bg-ink-dim", label: "idle" },
    connecting: { cls: "bg-state-draft animate-pulse", label: "connecting" },
    open:       { cls: "bg-state-decision", label: "live" },
    error:      { cls: "bg-state-claim animate-pulse", label: "offline" },
  };
  const { cls, label } = map[state];
  return (
    <span className="inline-flex items-center gap-2 font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">
      <span className={cn("h-1.5 w-1.5", cls)} style={{ borderRadius: 2 }} aria-hidden />
      {label}
    </span>
  );
}
