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
import { adjudicate, resolveEntity } from "./resolver.js"
import { getNeighborhood, retrieve, searchCandidates } from "../db/retrieval.js"

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
  /**
   * @deprecated since BP1 — supersedes is now decided by the Resolver Agent
   * (resolver.adjudicate) at write time. Field is accepted for MCP
   * back-compat but ignored. Agents should not set this.
   */
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
  supersedes?: string[]
  /** Pre-computed embedding (Resolver Agent pipeline reuses the embedding it computed
   *  for candidate search; avoids a second Voyage round-trip). */
  embedding?: number[]
  /** Pre-resolved entity (Resolver Agent pipeline resolves once for both neighborhood
   *  walk and the final write). */
  entityIdOverride?: EntityId | FileId
  refs?: string[]
  /** Skip Bedrock entity resolution (used by claim() which always knows scope). */
  skipResolve?: boolean
}

async function writeWcEntry(
  args: WriteWcArgs
): Promise<WorkingContextEntry> {
  const { workingContext } = collections()
  const entityId =
    args.entityIdOverride ??
    args.scopeOverride ??
    (args.skipResolve ? "services.unknown" : await resolveEntity(args.content))
  const embedding = args.embedding ?? (await embedOne(args.content))
  const now = Date.now()
  const id = `wc_${randomUUID().slice(0, 8)}`

  const doc: WorkingContextEntry = {
    _id: id,
    type: args.type,
    author: args.agent,
    scope: { entity_id: entityId },
    content: args.content,
    embedding,
    supersedes: args.supersedes ?? [],
    superseded_by: null,
    refs: args.refs ?? [],
    active: true,
    created_at: now,
  }
  await workingContext.insertOne(doc)
  return doc
}

/**
 * Write a working-context entry through the BP1 Resolver Agent pipeline.
 *
 *   resolveEntity → embed → getNeighborhood → searchCandidates →
 *   adjudicate → applyDecision (DROP | WRITE±supersede)
 *
 * Returns:
 *   { id }                     — for plain WRITE (no supersede)
 *   { id, supersede_ids }      — for WRITE with supersedes
 *   { dropped: true, ... }     — when Resolver Agent decided redundant
 */
export interface WriteContextResult {
  /** ID of the new entry, or null if the write was dropped as redundant. */
  id: string | null
  /** True when the Resolver Agent decided the new note added no information. */
  dropped?: boolean
  /** Old entries retired by this write, if any. */
  supersede_ids?: string[]
  /** Human-readable Resolver Agent rationale, exposed for audit / demo visibility. */
  rationale?: string
}

export async function writeContext(
  input: z.infer<typeof WriteContextInput>,
  agent: Agent
): Promise<WriteContextResult> {
  const { workingContext } = collections()

  // Note: input.supersedes is deprecated and ignored — the Resolver Agent decides.
  // Logged once if a caller still passes it, then ignored.
  if (input.supersedes) {
    console.warn(
      "[writeContext] caller-provided 'supersedes' is ignored under BP1; the Resolver Agent decides at write time."
    )
  }

  // 1. Resolve seed entity (single resolution shared with the Resolver Agent pipeline).
  const entityId = await resolveEntity(input.content)

  // 2. Embed the new content (single embed shared with candidate search & write).
  const embedding = await embedOne(input.content)

  // 3. Walk the 1-hop neighborhood of the seed.
  //    Compaction scope = retrieval scope (see retrieval.ts: getNeighborhood).
  const neighborhood = await getNeighborhood(entityId)

  // 4. Vector-search the neighborhood for top-k active candidates.
  const candidates = await searchCandidates(neighborhood, embedding, { limit: 5 })

  // 5. Resolver Agent adjudicates the write. Fail-open: any error → plain WRITE.
  const decision = await adjudicate(input.content, candidates)

  // 6. Apply the decision.
  if (decision.action === "DROP") {
    // No DB writes. Surface the rationale for demo visibility.
    console.info(
      `[writeContext] Resolver Agent DROP — ${decision.rationale} (no candidates retired)`
    )
    eventBus.emitEvent({
      type: "resolver.decided",
      payload: {
        action: "DROP",
        scope: entityId,
        rationale: decision.rationale,
        supersede_ids: [],
        new_id: null,
      },
    })
    return {
      id: null,
      dropped: true,
      rationale: decision.rationale,
    }
  }

  // action === "WRITE". Insert first, then flip supersede_ids inactive.
  // Insert-before-flip is intentional: a flip-then-insert failure would lose
  // context, while an insert-then-flip failure leaves a transient duplicate
  // that the next neighborhood-touching write will compact.
  const newDoc = await writeWcEntry({
    type: input.type as WorkingContextType,
    content: decision.content,
    agent,
    entityIdOverride: entityId,
    embedding,
    supersedes: decision.supersede_ids,
    refs: input.refs,
  })

  if (decision.supersede_ids.length > 0) {
    await workingContext.updateMany(
      { _id: { $in: decision.supersede_ids } },
      { $set: { active: false, superseded_by: newDoc._id } }
    )
    // Emit one superseded event per retired note — preserves the existing
    // per-old_id event shape; the FE doesn't need to know it was a batch.
    for (const oldId of decision.supersede_ids) {
      eventBus.emitEvent({
        type: "working_context.superseded",
        payload: {
          old_id: oldId,
          new_entry: toFEWorkingContext(newDoc),
        },
      })
    }
    eventBus.emitEvent({
      type: "resolver.decided",
      payload: {
        action: "WRITE",
        scope: entityId,
        rationale: decision.rationale,
        supersede_ids: decision.supersede_ids,
        new_id: newDoc._id,
      },
    })
    return {
      id: newDoc._id,
      supersede_ids: decision.supersede_ids,
      rationale: decision.rationale,
    }
  }

  // Plain create — no supersedes.
  eventBus.emitEvent({
    type:
      newDoc.type === "claim" ? "claim.activated" : "working_context.created",
    payload: { entry: toFEWorkingContext(newDoc) },
  })
  eventBus.emitEvent({
    type: "resolver.decided",
    payload: {
      action: "WRITE",
      scope: entityId,
      rationale: decision.rationale,
      supersede_ids: [],
      new_id: newDoc._id,
    },
  })
  return { id: newDoc._id, rationale: decision.rationale }
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
