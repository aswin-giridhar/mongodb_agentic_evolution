"use client";

import { useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import type { ViewMode } from "@/types";

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "structure", label: "Structure" },
  { value: "activity", label: "Activity" },
  { value: "grounded", label: "Grounded" },
];

type Props = {
  onReset: () => void;
};

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export const Header = ({ onReset }: Props) => {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const userOverrodeView = useStore((s) => s.userOverrodeView);
  const [running, setRunning] = useState(false);

  const runDemo = async () => {
    if (running) return;
    setRunning(true);
    try {
      await fetch(`${BACKEND_URL}/api/demo/run-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
    } catch (err) {
      console.error("[run-scenario] failed:", err);
    } finally {
      // Keep button disabled for the duration of the scripted scenario
      // (~10s based on the backend's sleep budget) so a double-click
      // doesn't fire two overlapping runs.
      setTimeout(() => setRunning(false), 11_000);
    }
  };

  return (
    <header className="flex h-[8vh] min-h-[64px] items-center justify-between border-b border-slate-800/80 bg-slate-950/95 px-6 backdrop-blur">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-lg font-semibold tracking-tight text-slate-100">
          Substrate
        </span>
        <span className="text-slate-500">·</span>
        <span className="font-mono text-sm text-slate-400">acme-robotics</span>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/80 p-1">
        {VIEW_OPTIONS.map((opt) => {
          const isActive = viewMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setViewMode(opt.value, true)}
              className={`relative rounded-full px-4 py-1.5 text-xs font-medium uppercase tracking-wider transition-all ${
                isActive
                  ? "bg-slate-100 text-slate-900 shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        {!userOverrodeView && (
          <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-[9px] uppercase tracking-wider text-slate-400">
            auto
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={runDemo}
          disabled={running}
          className="flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-950/60 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-emerald-200 transition hover:border-emerald-500 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={12} />
          {running ? "Running…" : "Run Scenario"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>
    </header>
  );
};
