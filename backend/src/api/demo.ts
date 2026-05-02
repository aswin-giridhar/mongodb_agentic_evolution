import type { Request, Response } from "express"
import { collections } from "../db/client.js"

/**
 * POST /api/demo/reset
 *
 * Wipes working_context (which now also holds claims, since claims
 * live as WorkingContextEntry with type=claim).
 *
 * Frontend re-syncs by re-opening the SSE stream OR by calling
 * `resetForReplay` locally. We don't emit an SSE event here — the FE
 * handles its own state reset.
 */
export async function resetHandler(
  _req: Request,
  res: Response
): Promise<void> {
  const { workingContext } = collections()
  const result = await workingContext.deleteMany({})
  res.json({
    ok: true,
    cleared: { workingContext: result.deletedCount },
  })
}
