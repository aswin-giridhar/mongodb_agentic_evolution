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
    <header className="flex h-[8vh] min-h-[64px] items-center justify-between border-b border-white/15 bg-black/60 px-6 backdrop-blur-xl">
      <div className="flex items-baseline gap-3">
        <span className="font-sans text-lg font-semibold tracking-tight text-white">
          Substrate
        </span>
        <span className="text-white/30">·</span>
        <span className="font-mono text-sm text-white/50">acme-robotics</span>
      </div>

      {/*
        Liquid-glass view-mode toggle.
        Container: translucent blurred surface with a subtle inset top
        highlight (the "lit edge" of glass) and a soft drop shadow for
        depth. Active segment: brighter translucent nub with its own
        inset top highlight + bottom inset shadow (so it reads as a
        raised glass element on top of the glass container).
      */}
      <div
        className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] p-1 backdrop-blur-2xl"
        style={{
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.10), 0 8px 24px -6px rgba(0,0,0,0.5)",
        }}
      >
        {VIEW_OPTIONS.map((opt) => {
          const isActive = viewMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setViewMode(opt.value, true)}
              className={`relative rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-wider transition-all ${
                isActive
                  ? "border-white/25 bg-white/[0.14] text-white"
                  : "border-transparent text-white/55 hover:bg-white/[0.05] hover:text-white"
              }`}
              style={
                isActive
                  ? {
                      boxShadow:
                        "inset 0 1px 0 0 rgba(255,255,255,0.35), inset 0 -1px 0 0 rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.3)",
                    }
                  : undefined
              }
            >
              {opt.label}
            </button>
          );
        })}
        {!userOverrodeView && (
          <span className="ml-2 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-wider text-white/45">
            auto
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Liquid-glass primary button — kept neutral so it doesn't fight the agent palette */}
        <button
          type="button"
          onClick={runDemo}
          disabled={running}
          className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-white/85 backdrop-blur-xl transition hover:border-white/25 hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play size={12} />
          {running ? "Running…" : "Run Scenario"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-white/65 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>
    </header>
  );
};

