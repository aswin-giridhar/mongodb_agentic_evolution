import type { Request, Response } from "express"
import { collections } from "../db/client.js"
import { eventBus } from "../lib/eventBus.js"

/**
 * POST /api/demo/reset
 * Wipes working_context and claims; emits an `ingest.event` so the
 * dashboard's activity stream shows the reset moment.
 */
export async function resetHandler(_req: Request, res: Response): Promise<void> {
  const { workingContext, claims } = collections()
  const [wcResult, claimsResult] = await Promise.all([
    workingContext.deleteMany({}),
    claims.deleteMany({}),
  ])
  eventBus.emitEvent({
    type: "ingest.event",
    payload: {
      summary: `demo reset · cleared ${wcResult.deletedCount} working_context, ${claimsResult.deletedCount} claims`,
      ts: Date.now(),
    },
  })
  res.json({ ok: true, cleared: { workingContext: wcResult.deletedCount, claims: claimsResult.deletedCount } })
}
