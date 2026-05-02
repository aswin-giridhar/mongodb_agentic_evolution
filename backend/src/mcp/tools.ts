import { randomUUID } from "crypto"
import { z } from "zod"
import { collections } from "../db/client.js"
import { embedOne } from "../embed/voyage.js"
import { eventBus } from "../lib/eventBus.js"
import { toFEWorkingContext } from "../lib/types.js"
import type {
  Agent,
  Artifact,
  EntityId,
  FileId,
  WorkingContextEntry,
  WorkingContextType,
} from "../lib/types.js"
import { resolveEntity } from "./resolver.js"
import { retrieve } from "../db/retrieval.js"

// ---------- Tool input schemas ----------

const WorkingContextTypeSchema = z.enum([
  "draft_schema",
  "decision",
  "claim",
  "investigation",
  "open_question",
])

export const ReadContextInput = z.object({
  query: z.string().min(1),
  scope: z.string().optional(),
})

export const WriteContextInput = z.object({
  type: WorkingContextTypeSchema,
  content: z.string().min(1),
  supersedes: z.string().optional(),
  refs: z.array(z.string()).optional(),
})

export const ClaimInput = z.object({
  scope: z.string().min(1),
  intent: z.string().min(1),
})

export const ReleaseInput = z.object({
  claim_id: z.string().min(1),
  outcome: z.string().min(1),
})

export const ListOpenQuestionsInput = z.object({
  scope: z.string().optional(),
})

// ---------- Tool implementations ----------

export async function readContext(
  input: z.infer<typeof ReadContextInput>,
  agent: Agent
): Promise<{ entries: WorkingContextEntry[]; grounding: Artifact[] }> {
  const { query, scope } = input

  // Phase 1: signal pending retrieval — drives the FE read-path animation
  eventBus.emitEvent({
    type: "read_context.started",
    payload: { agent, query, scope },
  })

  const seedEntity: EntityId | FileId = scope ?? (await resolveEntity(query))
  const queryEmbedding = await embedOne(query)
  const result = await retrieve(seedEntity, queryEmbedding)

  // Phase 2: signal completion with full retrieval shape
  eventBus.emitEvent({
    type: "read_context.completed",
    payload: {
      agent,
      query,
      resolved_entity: seedEntity,
      traversed_entities: result.resolved_entities,
      returned_entry_ids: result.entries.map((e) => e._id),
      returned_artifact_ids: result.grounding.map((a) => a._id),
    },
  })

  return { entries: result.entries, grounding: result.grounding }
}

interface WriteWcArgs {
  type: WorkingContextType
  content: string
  agent: Agent
  scopeOverride?: EntityId | FileId
  supersedes?: string
  refs?: string[]
  /** Skip Bedrock entity resolution (used by claim() which always knows scope). */
  skipResolve?: boolean
}

async function writeWcEntry(
  args: WriteWcArgs
): Promise<WorkingContextEntry> {
  const { workingContext } = collections()
  const entityId =
    args.scopeOverride ??
    (args.skipResolve ? "services.unknown" : await resolveEntity(args.content))
  const embedding = await embedOne(args.content)
  const now = Date.now()
  const id = `wc_${randomUUID().slice(0, 8)}`

  const doc: WorkingContextEntry = {
    _id: id,
    type: args.type,
    author: args.agent,
    scope: { entity_id: entityId },
    content: args.content,
    embedding,
    supersedes: args.supersedes ?? null,
    superseded_by: null,
    refs: args.refs ?? [],
    active: true,
    created_at: now,
  }
  await workingContext.insertOne(doc)
  return doc
}

export async function writeContext(
  input: z.infer<typeof WriteContextInput>,
  agent: Agent
): Promise<{ id: string }> {
  const { workingContext } = collections()

  // Supersede flow: mark the old entry inactive and emit the merged event.
  if (input.supersedes) {
    const newDoc = await writeWcEntry({
      type: input.type as WorkingContextType,
      content: input.content,
      agent,
      supersedes: input.supersedes,
      refs: input.refs,
    })
    await workingContext.updateOne(
      { _id: input.supersedes },
      { $set: { active: false, superseded_by: newDoc._id } }
    )
    eventBus.emitEvent({
      type: "working_context.superseded",
      payload: {
        old_id: input.supersedes,
        new_entry: toFEWorkingContext(newDoc),
      },
    })
    return { id: newDoc._id }
  }

  // Plain create.
  const newDoc = await writeWcEntry({
    type: input.type as WorkingContextType,
    content: input.content,
    agent,
    refs: input.refs,
  })
  eventBus.emitEvent({
    type:
      newDoc.type === "claim" ? "claim.activated" : "working_context.created",
    payload: { entry: toFEWorkingContext(newDoc) },
  })
  return { id: newDoc._id }
}

export async function claim(
  input: z.infer<typeof ClaimInput>,
  agent: Agent
): Promise<{ claim_id: string; conflict?: true }> {
  const { workingContext } = collections()

  // Active claim already on this scope?
  const existing = await workingContext.findOne({
    type: "claim",
    "scope.entity_id": input.scope,
    active: true,
  })

  if (existing) {
    eventBus.emitEvent({
      type: "claim.conflict",
      payload: {
        attempted_by: agent,
        existing_claim_id: String(existing._id),
        intent: input.intent,
      },
    })
    return { claim_id: String(existing._id), conflict: true }
  }

  const newDoc = await writeWcEntry({
    type: "claim",
    content: input.intent,
    agent,
    scopeOverride: input.scope,
  })
  eventBus.emitEvent({
    type: "claim.activated",
    payload: { entry: toFEWorkingContext(newDoc) },
  })
  return { claim_id: newDoc._id }
}

export async function release(
  input: z.infer<typeof ReleaseInput>,
  _agent: Agent
): Promise<{ ok: true }> {
  const { workingContext } = collections()
  await workingContext.updateOne(
    { _id: input.claim_id },
    { $set: { active: false } }
  )
  eventBus.emitEvent({
    type: "claim.released",
    payload: { claim_id: input.claim_id, outcome: input.outcome },
  })
  return { ok: true }
}

export async function listOpenQuestions(
  input: z.infer<typeof ListOpenQuestionsInput>,
  _agent: Agent
): Promise<{ questions: WorkingContextEntry[] }> {
  const { workingContext } = collections()
  const filter: Record<string, unknown> = {
    type: "open_question",
    active: true,
  }
  if (input.scope) filter["scope.entity_id"] = input.scope

  const questions = await workingContext.find(filter).limit(20).toArray()
  return { questions }
}
