// Shared types — kept in sync with frontend's `src/types.ts` event shape.
//
// Internal documents (Mongo) use numeric `created_at` (unix ms).
// External events (SSE → FE) use ISO-string `created_at`.
// Convert at the serialization boundary in api/seed.ts and mcp/tools.ts.

export type EntityId = string  // e.g., "services.payments-api"
export type FileId = string    // e.g., "services.payments-api/checkout.ts"
export type Agent = "producer" | "consumer"

export type WorkingContextType =
  | "draft_schema"
  | "decision"
  | "claim"
  | "investigation"
  | "open_question"

// ---------- Internal Mongo documents ----------

export interface Service {
  _id: EntityId
  name: string
  owner_team: string
  depends_on: EntityId[]
  consumed_by: EntityId[]
  hot_files: string[]
}

export interface Person {
  _id: EntityId
  name: string
  team: string
  expertise: string[]
  expertise_evidence?: string[]
  handle?: string
}

export interface Artifact {
  _id: string
  source: "slack" | "github_pr" | "jira_ticket" | "docs" | "code_chunk"
  channel?: string
  author?: string
  content: string
  preview?: string
  embedding: number[]
  refs: EntityId[]
  metadata?: Record<string, unknown>
  created_at: number
}

export interface WorkingContextEntry {
  _id: string
  type: WorkingContextType
  author: Agent
  scope: { entity_id: EntityId | FileId }
  content: string
  embedding: number[]
  /**
   * IDs of older entries that this one replaces. n→1 supersedes are supported:
   * a single new note can retire multiple older ones (e.g., a finalized decision
   * superseding three "exploring options" notes). Empty array = independent note.
   * Set by the Curator (resolver.adjudicate); never by callers.
   */
  supersedes: string[]
  /** ID of the newer entry that retired this one, if any. Each old note is
   *  replaced by exactly one new note, so this stays scalar. */
  superseded_by: string | null
  refs: string[]
  active: boolean
  created_at: number
}

// ---------- Resolver Agent (resolver.adjudicate) ----------

/**
 * Decision returned by the Resolver Agent when adjudicating a write.
 *
 * - `DROP`  → new note is fully redundant; do not write.
 * - `WRITE` → insert `content` (Resolver-authored, may be raw passthrough or a
 *             merged synthesis). If `supersede_ids` is non-empty, those entries
 *             are flipped `active: false` and gain `superseded_by` pointing to
 *             the new note.
 *
 * `rationale` is non-optional; it's how supersede decisions get audited.
 */
export interface ResolverDecision {
  action: "DROP" | "WRITE"
  supersede_ids: string[]
  content: string
  rationale: string
}

// ---------- External (FE-shaped) types ----------

export type ArtifactSourceFE = "slack" | "github" | "jira"

export interface ServiceFE extends Service {
  type: "service"
}

export interface PersonFE extends Person {
  type: "person"
  expertise_evidence: string[] // never undefined to FE
}

export interface ArtifactFE {
  _id: string
  source: ArtifactSourceFE
  channel?: string
  content: string
  refs: EntityId[]
  created_at: string // ISO
}

export interface WorkingContextEntryFE {
  _id: string
  type: WorkingContextType
  author: Agent
  scope: { entity_id: EntityId | FileId }
  content: string
  supersedes: string[]
  superseded_by: string | null
  refs: string[]
  active: boolean
  created_at: string // ISO
  ttl_at?: string
}

// ---------- SSE event union (matches FE's SubstrateEvent.kind discriminator) ----------

export type SSEEvent =
  | {
      type: "seed"
      payload: {
        services: ServiceFE[]
        people: PersonFE[]
        artifacts: ArtifactFE[]
      }
    }
  | {
      type: "working_context.created"
      payload: { entry: WorkingContextEntryFE }
    }
  | {
      type: "working_context.superseded"
      payload: { old_id: string; new_entry: WorkingContextEntryFE }
    }
  | {
      type: "claim.activated"
      payload: { entry: WorkingContextEntryFE }
    }
  | {
      type: "claim.conflict"
      payload: { attempted_by: Agent; existing_claim_id: string; intent: string }
    }
  | {
      type: "claim.released"
      payload: { claim_id: string; outcome: string }
    }
  | {
      type: "read_context.started"
      payload: { agent: Agent; query: string; scope?: EntityId | FileId }
    }
  | {
      type: "read_context.completed"
      payload: {
        agent: Agent
        query: string
        resolved_entity: EntityId | FileId
        traversed_entities: (EntityId | FileId)[]
        returned_entry_ids: string[]
        returned_artifact_ids: string[]
      }
    }
  | { type: "agent.thought"; payload: { agent: Agent; text: string } }
  | {
      type: "resolver.decided"
      payload: {
        action: "DROP" | "WRITE"
        scope: EntityId | FileId
        rationale: string
        /** Old entries retired by this decision; empty for DROP and plain INSERT. */
        supersede_ids: string[]
        /** ID of the new entry written; null for DROP. */
        new_id: string | null
      }
    }
  | { type: "ping"; payload: Record<string, never> }

// ---------- Helpers ----------

export function toFEArtifact(a: Artifact): ArtifactFE | null {
  // FE only knows three sources; drop docs / code_chunk
  let source: ArtifactSourceFE
  switch (a.source) {
    case "slack":
      source = "slack"
      break
    case "github_pr":
      source = "github"
      break
    case "jira_ticket":
      source = "jira"
      break
    default:
      return null
  }
  return {
    _id: a._id,
    source,
    channel: a.channel,
    content: a.content,
    refs: a.refs,
    created_at: new Date(a.created_at).toISOString(),
  }
}

export function toFEWorkingContext(e: WorkingContextEntry): WorkingContextEntryFE {
  // Defensively normalize supersedes for back-compat with any pre-BP1 docs that
  // may still hold a scalar string or null in the DB.
  const raw = e.supersedes as unknown
  const supersedes: string[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? [raw]
      : []
  return {
    _id: e._id,
    type: e.type,
    author: e.author,
    scope: e.scope,
    content: e.content,
    supersedes,
    superseded_by: e.superseded_by,
    refs: e.refs,
    active: e.active,
    created_at: new Date(e.created_at).toISOString(),
  }
}
