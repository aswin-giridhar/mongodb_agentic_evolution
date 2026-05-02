import type { SubstrateEvent } from "@/types";
import { MockEventSource } from "./mockEventSource";
import { SseEventSource } from "./sseEventSource";

export interface EventSourceAdapter {
  subscribe(handler: (event: SubstrateEvent) => void): () => void;
  reset(): Promise<void>;
}

export const createEventSource = (): EventSourceAdapter => {
  const mode = process.env.NEXT_PUBLIC_EVENT_SOURCE ?? "mock";
  if (mode === "sse") {
    return new SseEventSource();
  }
  return new MockEventSource();
};
