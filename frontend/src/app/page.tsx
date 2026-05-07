"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Graph } from "@/components/Graph";
import { ActivityStream } from "@/components/ActivityStream";
import { useStore } from "@/lib/store";
import { createEventSource } from "@/lib/eventSource";
import type { EventSourceAdapter } from "@/lib/eventSource";

export default function Home() {
  const applyEvent = useStore((s) => s.applyEvent);
  const seeded = useStore((s) => s.seeded);
  const adapterRef = useRef<EventSourceAdapter | null>(null);
  const [streamCollapsed, setStreamCollapsed] = useState(false);

  useEffect(() => {
    const adapter = createEventSource();
    adapterRef.current = adapter;
    const unsub = adapter.subscribe(applyEvent);
    return () => {
      unsub();
      adapterRef.current = null;
    };
  }, [applyEvent]);

  const handleReset = () => {
    void adapterRef.current?.reset();
    useStore.getState().resetForReplay();
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-black text-white ring-1 ring-inset ring-white/15">
      <Header onReset={handleReset} />
      <div className="flex flex-1 overflow-hidden">
        {/* Left: graph fills the remaining horizontal space.
            Slightly lighter grey vs. the pure-black header + side panel
            so the workspace reads as a distinct surface. */}
        <div className="relative flex-1 overflow-hidden bg-neutral-900">
          {!seeded && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <span className="font-mono text-xs uppercase tracking-widest text-white/30">
                Connecting to substrate…
              </span>
            </div>
          )}
          <Graph />
        </div>

        {/* Right: vertical activity stream side panel */}
        <div
          className={`shrink-0 transition-all duration-300 ${
            streamCollapsed ? "w-10" : "w-[28rem] min-w-[320px]"
          }`}
        >
          <div className="relative h-full">
            <button
              type="button"
              onClick={() => setStreamCollapsed((v) => !v)}
              className="absolute right-2 top-2 z-10 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[12px] leading-none text-white/60 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              title={streamCollapsed ? "Expand activity stream" : "Collapse activity stream"}
            >
              {streamCollapsed ? "‹" : "›"}
            </button>
            {!streamCollapsed && <ActivityStream />}
            {streamCollapsed && (
              <div className="flex h-full flex-col items-center justify-center border-l border-white/15 bg-black/60 pt-12 backdrop-blur-xl">
                <span
                  className="font-mono text-[11px] font-semibold uppercase tracking-widest text-white/40"
                  style={{ writingMode: "vertical-rl" }}
                >
                  Activity stream
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
