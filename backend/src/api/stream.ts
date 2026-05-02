import type { Request, Response } from "express"
import { eventBus } from "../lib/eventBus.js"
import type { SSEEvent } from "../lib/types.js"

/**
 * GET /api/stream
 * Server-sent events feed for the dashboard.
 *
 * Sends every event from the in-memory bus (Change Streams + tool calls + ingest)
 * plus a heartbeat every 15s to keep connections alive through proxies.
 */
export function streamHandler(_req: Request, res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering, just in case
  })

  // Initial comment to flush headers immediately
  res.write(": connected\n\n")

  const send = (event: SSEEvent): void => {
    res.write(`event: ${event.type}\n`)
    res.write(`data: ${JSON.stringify(event.payload)}\n\n`)
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
