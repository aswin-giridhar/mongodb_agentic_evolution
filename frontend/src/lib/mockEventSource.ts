import type { SubstrateEvent } from "@/types";
import type { EventSourceAdapter } from "./eventSource";
import { services } from "@/mock/services";
import { people } from "@/mock/people";
import { artifacts } from "@/mock/artifacts";
import {
  SCRIPTED_TIMELINE,
  TIMING,
  resetIdCounter,
  type ScriptContext,
} from "@/mock/timeline";

type Handler = (event: SubstrateEvent) => void;

export class MockEventSource implements EventSourceAdapter {
  private handlers = new Set<Handler>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    if (!this.running) {
      this.running = true;
      // Defer slightly so all subscribers register before seed fires.
      this.queue(0, () => this.emitSeed());
      this.scheduleScript();
    }
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) {
        this.stop();
      }
    };
  }

  async reset(): Promise<void> {
    this.stop();
    resetIdCounter();
    // Re-emit seed and replay from Phase 1.
    this.running = true;
    this.queue(0, () => this.emitSeed());
    this.scheduleScript();
  }

  private emit(event: SubstrateEvent): void {
    this.handlers.forEach((h) => h(event));
  }

  private emitSeed(): void {
    this.emit({
      kind: "seed",
      services,
      people,
      artifacts,
    });
  }

  private scheduleScript(): void {
    const ctx: ScriptContext = { refs: {} };
    let cumulative = 0;
    SCRIPTED_TIMELINE.forEach((step) => {
      cumulative += step.delayMs;
      this.queue(cumulative, () => {
        this.emit(step.build(ctx));
      });
    });
    // Loop: after script + loopGap, replay from Phase 1 (no re-seed).
    this.queue(cumulative + TIMING.loopGap, () => {
      resetIdCounter();
      this.scheduleScript();
    });
  }

  private queue(delay: number, fn: () => void): void {
    const t = setTimeout(fn, delay);
    this.timers.push(t);
  }

  private stop(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.running = false;
  }
}
