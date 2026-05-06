import type { Request, Response } from "express"
import { eventBus } from "../lib/eventBus.js"
import type { SSEEvent } from "../lib/types.js"
import { buildSeedPayload } from "./seed.js"

/**
 * GET /api/stream
 *
 * Server-sent events feed for the dashboard. On connect:
 *   1. Sends the `seed` event immediately (services + people + artifacts)
 *   2. Subscribes to the in-memory event bus and relays every event
 *   3. Heartbeats every 15s
 */
export async function streamHandler(
  _req: Request,
  res: Response
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })
  res.write(": connected\n\n")

  const send = (event: SSEEvent): void => {
    // Named event — clients (e.g., Mohammed's FE) subscribe per-name
    // via es.addEventListener("working_context.created", ...)
    res.write(`event: ${event.type}\n`)
    res.write(`data: ${JSON.stringify(event.payload)}\n\n`)
    // Unnamed copy with `kind` in the data — clients (e.g., Nicole's FE)
    // that use the default es.onmessage handler still receive it.
    // Default-handler clients only fire on unnamed messages, so emitting
    // both lets either subscription style work without FE changes.
    res.write(`data: ${JSON.stringify({ kind: event.type, ...event.payload })}\n\n`)
  }

  // Send seed snapshot first so the dashboard can render the structural skeleton.
  try {
    const seed = await buildSeedPayload()
    send({ type: "seed", payload: seed })
  } catch (err) {
    console.error("[stream] seed-on-connect failed:", err)
  }

  const unsubscribe = eventBus.onEvent(send)

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`)
  }, 15_000)

  const close = (): void => {
    clearInterval(heartbeat)
    unsubscribe()
    try {
      res.end()
    } catch {
      // already closed
    }
  }

  res.on("close", close)
  res.on("error", close)
}
