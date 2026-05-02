import { EventEmitter } from "events"
import type { SSEEvent } from "./types.js"

// In-memory event bus. Tool handlers + ingest emit; SSE relays.
class TypedEventBus extends EventEmitter {
  emitEvent(event: SSEEvent): void {
    this.emit("event", event)
  }
  onEvent(listener: (event: SSEEvent) => void): () => void {
    this.on("event", listener)
    return () => this.off("event", listener)
  }
}

export const eventBus = new TypedEventBus()
// Lift the default 10-listener cap — long-lived SSE clients add up
eventBus.setMaxListeners(50)
