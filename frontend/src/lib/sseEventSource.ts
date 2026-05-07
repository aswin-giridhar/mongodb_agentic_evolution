import type { SubstrateEvent } from "@/types";
import type { EventSourceAdapter } from "./eventSource";

const DEFAULT_BACKEND_URL = "http://localhost:3000";

/**
 * Wires the dashboard to the live backend at /api/stream.
 *
 * Backend emits typed SSE messages (event: <kind>, data: <payload>).
 * Each kind's payload exactly matches the fields on the FE's SubstrateEvent
 * union (minus the `kind` discriminator, which we derive from the event name).
 */
export class SseEventSource implements EventSourceAdapter {
  private es: EventSource | null = null;

  subscribe(handler: (event: SubstrateEvent) => void): () => void {
    const baseUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ?? DEFAULT_BACKEND_URL;
    const es = new EventSource(`${baseUrl}/api/stream`);
    this.es = es;

    const bind = (
      kind: SubstrateEvent["kind"],
    ): ((e: MessageEvent) => void) => {
      return (e) => {
        try {
          const payload = JSON.parse(e.data);
          handler({ kind, ...payload } as SubstrateEvent);
        } catch (err) {
          console.error(`[sse] failed to parse '${kind}' event:`, err);
        }
      };
    };

    const kinds: SubstrateEvent["kind"][] = [
      "seed",
      "working_context.created",
      "working_context.superseded",
      "claim.activated",
      "claim.conflict",
      "claim.released",
      "read_context.started",
      "read_context.completed",
      "agent.thought",
      "resolver.decided",
    ];
    kinds.forEach((kind) => es.addEventListener(kind, bind(kind)));

    es.addEventListener("error", (e) => {
      console.warn("[sse] connection error:", e);
    });

    return () => {
      this.es?.close();
      this.es = null;
    };
  }

  async reset(): Promise<void> {
    const baseUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ?? DEFAULT_BACKEND_URL;
    try {
      await fetch(`${baseUrl}/api/demo/reset`, { method: "POST" });
    } catch (err) {
      console.error("[sse] reset failed:", err);
    }
  }
}
