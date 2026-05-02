import type { SubstrateEvent } from "@/types";
import type { EventSourceAdapter } from "./eventSource";

// Stub. Wire up to /api/stream and /api/demo/reset when backend exists.
export class SseEventSource implements EventSourceAdapter {
  subscribe(_handler: (event: SubstrateEvent) => void): () => void {
    // TODO: open EventSource("/api/stream"), JSON.parse each message,
    // call _handler with the parsed SubstrateEvent.
    return () => {
      // TODO: close EventSource.
    };
  }

  async reset(): Promise<void> {
    // TODO: POST /api/demo/reset.
  }
}
