import { randomUUID } from "crypto"
import { z } from "zod"
import { collections } from "../db/client.js"
import { embedOne } from "../embed/voyage.js"
import { eventBus } from "../lib/eventBus.js"
import type {
  Agent,
  ActivityEvent,
  ClaimEntry,
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

// ---------- Helpers ----------

function activityRow(partial: Omit<ActivityEvent, "id" | "ts" | "refs"> & { refs?: string[] }): ActivityEvent {
  return {
    id: `act_${randomUUID().slice(0, 8)}`,
    ts: Date.now(),
    refs: partial.refs ?? [],
    ...partial,
  }
}

function emitActivity(ev: ActivityEvent): void {
  eventBus.emitEvent({ type: "agent.activity", payload: ev })
}

// ---------- Tool implementations ----------

export async function readContext(
  input: z.infer<typeof ReadContextInput>,
  agent: Agent
): Promise<{ entries: WorkingContextEntry[]; grounding: import("../lib/types.js").Artifact[] }> {
  const { query, scope } = input
  const seedEntity: EntityId | FileId = scope ?? (await resolveEntity(query))
  const queryEmbedding = await embedOne(query)
  const result = await retrieve(seedEntity, queryEmbedding)

  // Activity row for the dashboard
  emitActivity(
    activityRow({
      agent,
      action: "read_context",
      scope: seedEntity,
      resolved_entities: result.resolved_entities,
      returned_ids: result.entries.map((e) => e._id),
      summary: `${agent} · read_context · ${seedEntity} · ${result.entries.length} hits${
        result.grounding.length ? ` (+${result.grounding.length} grounding)` : ""
      }`,
      refs: [
        seedEntity,
        ...result.resolved_entities,
        ...result.entries.map((e) => e._id),
      ],
    })
  )

  // Trigger Activity → Grounded transition for each grounding artifact
  for (const a of result.grounding) {
    eventBus.emitEvent({
      type: "artifact.referenced",
      payload: {
        artifact_id: a._id,
        by_agent: agent,
        scope: seedEntity,
      },
    })
  }

  return { entries: result.entries, grounding: result.grounding }
}

export async function writeContext(
  input: z.infer<typeof WriteContextInput>,
  agent: Agent
): Promise<{ id: string }> {
  const { workingContext } = collections()
  const entityId = await resolveEntity(input.content)
  const embedding = await embedOne(input.content)
  const now = Date.now()
  const id = `wc_${randomUUID().slice(0, 8)}`

  // Supersede prior entry if requested
  if (input.supersedes) {
    await workingContext.updateOne(
      { _id: input.supersedes },
      { $set: { active: false, superseded_by: id } }
    )
  }

  const doc: WorkingContextEntry = {
    _id: id,
    type: input.type as WorkingContextType,
    author: agent,
    scope: { entity_id: entityId },
    content: input.content,
    embedding,
    supersedes: input.supersedes ?? null,
    superseded_by: null,
    refs: input.refs ?? [],
    active: true,
    created_at: now,
  }
  await workingContext.insertOne(doc)
  // Note: working_context.created event flows from Change Stream; no manual emit here.

  emitActivity(
    activityRow({
      agent,
      action: "write_context",
      scope: entityId,
      summary: `${agent} · write_context · ${entityId} · ${input.type}${
        input.supersedes ? ` (supersedes ${input.supersedes})` : ""
      }`,
      refs: [entityId, id, ...(input.refs ?? [])],
    })
  )

  return { id }
}

export async function claim(
  input: z.infer<typeof ClaimInput>,
  agent: Agent
): Promise<{ claim_id: string; conflicts?: ClaimEntry[] }> {
  const { claims } = collections()

  // Existing claim on the same scope?
  const existing = await claims.findOne({
    "scope.entity_id": input.scope,
    active: true,
  })

  if (existing) {
    eventBus.emitEvent({
      type: "working_context.claim_conflict",
      payload: {
        scope: input.scope,
        attempting_agent: agent,
        holding_agent: existing.agent,
        intent: input.intent,
        existing_claim_id: String(existing._id),
      },
    })
    emitActivity(
      activityRow({
        agent,
        action: "claim",
        scope: input.scope,
        summary: `${agent} · claim conflict on ${input.scope} (held by ${existing.agent})`,
        refs: [input.scope, String(existing._id)],
      })
    )
    return {
      claim_id: String(existing._id),
      conflicts: [existing as ClaimEntry],
    }
  }

  const id = `cl_${randomUUID().slice(0, 8)}`
  const doc: ClaimEntry = {
    _id: id,
    scope: { entity_id: input.scope },
    intent: input.intent,
    agent,
    active: true,
    outcome: null,
    created_at: Date.now(),
  }
  await claims.insertOne(doc)
  // claim_activated flows from Change Stream

  emitActivity(
    activityRow({
      agent,
      action: "claim",
      scope: input.scope,
      summary: `${agent} · claim · ${input.scope} — ${input.intent}`,
      refs: [input.scope, id],
    })
  )

  return { claim_id: id }
}

export async function release(
  input: z.infer<typeof ReleaseInput>,
  agent: Agent
): Promise<{ ok: true }> {
  const { claims } = collections()
  await claims.updateOne(
    { _id: input.claim_id },
    { $set: { active: false, outcome: input.outcome } }
  )
  // claim_released flows from Change Stream

  emitActivity(
    activityRow({
      agent,
      action: "release",
      summary: `${agent} · release · ${input.claim_id} — ${input.outcome}`,
      refs: [input.claim_id],
    })
  )
  return { ok: true }
}

export async function listOpenQuestions(
  input: z.infer<typeof ListOpenQuestionsInput>,
  agent: Agent
): Promise<{ questions: WorkingContextEntry[] }> {
  const { workingContext } = collections()
  const filter: Record<string, unknown> = {
    type: "open_question",
    active: true,
  }
  if (input.scope) filter["scope.entity_id"] = input.scope

  const questions = await workingContext.find(filter).limit(20).toArray()
  emitActivity(
    activityRow({
      agent,
      action: "list_open_questions",
      scope: input.scope,
      summary: `${agent} · list_open_questions · ${
        input.scope ?? "(all)"
      } · ${questions.length} hits`,
      refs: [
        ...(input.scope ? [input.scope] : []),
        ...questions.map((q) => q._id),
      ],
    })
  )
  return { questions }
}
