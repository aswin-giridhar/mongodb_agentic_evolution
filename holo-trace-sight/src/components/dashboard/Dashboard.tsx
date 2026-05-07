import { useEffect, useRef, useState } from "react";
import { Header } from "./Header";
import { GraphCanvas } from "./GraphCanvas";
import { ActivityStream } from "./ActivityStream";
import { PromptPanel } from "./PromptPanel";
import { useSubstrate } from "@/lib/substrate/store";
import { API_BASE_URL, fetchSeed, startSSE } from "@/lib/substrate/sse";
import { MOCK_SEED, startMock } from "@/lib/substrate/mock";

const HAS_BACKEND = !!import.meta.env.VITE_API_BASE_URL;

export function Dashboard() {
  const loadSeed = useSubstrate((s) => s.loadSeed);
  const applyEvent = useSubstrate((s) => s.applyEvent);
  const setConn = useSubstrate((s) => s.setConn);
  const services = useSubstrate((s) => s.services);
  const [mode, setMode] = useState<"live" | "mock">(HAS_BACKEND ? "live" : "mock");
  const mockRef = useRef<{ stop: () => void } | null>(null);

  // Live: fetch real seed. Falls back to mock if it fails.
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    fetchSeed(API_BASE_URL)
      .then((data) => {
        if (!cancelled) loadSeed(data);
      })
      .catch(() => {
        if (!cancelled) setMode("mock");
      });
    return () => {
      cancelled = true;
    };
  }, [loadSeed, mode]);

  // Live: open SSE.
  useEffect(() => {
    if (mode !== "live") return;
    const stop = startSSE({
      baseUrl: API_BASE_URL,
      onEvent: applyEvent,
      onState: setConn,
    });
    return stop;
  }, [applyEvent, setConn, mode]);

  // Mock: load seed + run scripted scenario in a loop.
  useEffect(() => {
    if (mode !== "mock") return;
    loadSeed(MOCK_SEED);
    // Use a distinct "mock" state so the connection dot doesn't lie about
    // being live when we're actually replaying a scripted scenario.
    setConn("mock");
    mockRef.current = startMock(applyEvent, { loop: true });
    return () => {
      mockRef.current?.stop();
      mockRef.current = null;
    };
  }, [mode, loadSeed, applyEvent, setConn]);

  const hasAnyData = Object.keys(services).length > 0;

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <Header mode={mode} onToggleMode={() => setMode(mode === "mock" ? "live" : "mock")} />
      {/* Activity stream becomes a right-side panel — matches Mohammed's layout */}
      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex-1">
          {hasAnyData && <GraphCanvas />}
          {mode === "mock" && (
            <div className="pointer-events-none absolute right-6 top-4 z-10 font-display text-[12px] italic font-semibold tracking-wide text-ink-dim">
              <span className="mr-2 inline-block h-1.5 w-1.5 bg-primary align-middle" />
              scripted demo
            </div>
          )}
          {/* Prompt panel only useful when there's a real backend to send to */}
          <PromptPanel disabled={mode === "mock"} />
        </main>
        <ActivityStream />
      </div>
    </div>
  );
}