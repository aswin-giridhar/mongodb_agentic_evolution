import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useSubstrate } from "@/lib/substrate/store";
import { postReset, API_BASE_URL } from "@/lib/substrate/sse";
import { ConnectionDot } from "./ConnectionDot";
import type { ViewMode } from "@/lib/substrate/types";

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "structure", label: "Structure" },
  { id: "activity", label: "Activity" },
  { id: "grounded", label: "Grounded" },
];

interface HeaderProps {
  mode?: "live" | "mock";
  onToggleMode?: () => void;
}

export function Header({ mode, onToggleMode }: HeaderProps = {}) {
  const org = useSubstrate((s) => s.org);
  const view = useSubstrate((s) => s.view);
  const conn = useSubstrate((s) => s.conn);
  const setView = useSubstrate((s) => s.setView);
  const reset = useSubstrate((s) => s.reset);
  const activityLen = useSubstrate((s) => s.activity.length);

  // Throb the signal dot briefly each time a new event lands.
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    setPulseKey((k) => k + 1);
  }, [activityLen]);

  const onReset = async () => {
    reset();
    try {
      await postReset(API_BASE_URL);
    } catch {
      /* ignore — backend will reconfirm via stream when available */
    }
  };

  return (
    <header className="relative flex h-16 items-end justify-between border-b border-ink bg-paper px-8 pb-2">
      <div className="flex items-baseline gap-4">
        <h1 className="font-display text-[34px] font-black italic leading-none tracking-tight text-ink">
          Substrate
        </h1>
        <div className="flex items-baseline gap-2">
          <span key={pulseKey} className="signal-dot live" aria-hidden />
          <span className="font-body text-[13px] font-semibold tracking-wide text-ink">{org}</span>
        </div>
      </div>

      <nav className="flex items-end gap-6">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id, true)}
            className={cn(
              "relative pb-1 font-body text-[12px] font-semibold uppercase tracking-[0.18em] transition-colors",
              view === v.id ? "text-ink" : "text-ink-dim hover:text-ink",
            )}
          >
            {v.label}
            {view === v.id && (
              <span className="absolute -bottom-[9px] left-0 right-0 h-[3px] bg-primary" />
            )}
          </button>
        ))}
      </nav>

      <div className="flex items-end gap-5">
        <ConnectionDot state={conn} />
        {onToggleMode && (
          <button
            onClick={onToggleMode}
            className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim underline decoration-ink/30 underline-offset-4 hover:text-ink hover:decoration-primary"
            title="Toggle scripted demo / live backend"
          >
            {mode === "mock" ? "Demo Mode" : "Live"}
          </button>
        )}
        <button
          onClick={onReset}
          className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-ink underline decoration-primary decoration-2 underline-offset-4 hover:text-primary"
        >
          Reset
        </button>
      </div>
    </header>
  );
}
