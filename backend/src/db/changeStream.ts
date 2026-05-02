import type { ChangeStream, ChangeStreamDocument } from "mongodb"
import { collections } from "./client.js"
import { eventBus } from "../lib/eventBus.js"
import type { ClaimEntry, WorkingContextEntry } from "../lib/types.js"

let wcStream: ChangeStream<WorkingContextEntry> | null = null
let claimStream: ChangeStream<ClaimEntry> | null = null

export function startChangeStreams(): void {
  const { workingContext, claims } = collections()

  wcStream = workingContext.watch([], { fullDocument: "updateLookup" })
  wcStream.on("change", (change: ChangeStreamDocument<WorkingContextEntry>) => {
    if (change.operationType === "insert") {
      eventBus.emitEvent({
        type: "working_context.created",
        payload: change.fullDocument as WorkingContextEntry,
      })
    } else if (change.operationType === "update") {
      const fields = change.updateDescription?.updatedFields ?? {}
      if (fields.active === false && fields.superseded_by) {
        eventBus.emitEvent({
          type: "working_context.superseded",
          payload: {
            id: String(change.documentKey._id),
            superseded_by: String(fields.superseded_by),
          },
        })
      }
    }
  })
  wcStream.on("error", (err) => console.error("[change-stream wc] error:", err))

  claimStream = claims.watch([], { fullDocument: "updateLookup" })
  claimStream.on("change", (change: ChangeStreamDocument<ClaimEntry>) => {
    if (change.operationType === "insert") {
      eventBus.emitEvent({
        type: "working_context.claim_activated",
        payload: change.fullDocument as ClaimEntry,
      })
    } else if (change.operationType === "update") {
      const fields = change.updateDescription?.updatedFields ?? {}
      if (fields.active === false && typeof fields.outcome === "string") {
        eventBus.emitEvent({
          type: "working_context.claim_released",
          payload: {
            claim_id: String(change.documentKey._id),
            outcome: fields.outcome as string,
          },
        })
      }
    }
  })
  claimStream.on("error", (err) => console.error("[change-stream claims] error:", err))

  console.log("[change-stream] watching working_context + claims")
}

export async function stopChangeStreams(): Promise<void> {
  await wcStream?.close()
  await claimStream?.close()
}
