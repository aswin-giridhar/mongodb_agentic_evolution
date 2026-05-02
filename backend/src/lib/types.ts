// Shared types — kept in sync with docs/integration-contract.md §3

export type EntityId = string  // e.g., "services.payments-api"
export type FileId = string    // e.g., "services.payments-api/checkout.ts"
export type Agent = "producer" | "consumer"

export type WorkingContextType =
  | "draft_schema"
  | "decision"
  | "claim"
  | "investigation"
  | "open_question"

export interface Service {
  _id: EntityId
  name: string
  owner_team: string
  depends_on: EntityId[]
  consumed_by: EntityId[]
  hot_files: string[]
}

export interface FileNode {
  id: FileId
  service: EntityId
  path: string
}

export interface Person {
  _id: EntityId
  name: string
  team: string
  expertise: string[]
  handle: string
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
  supersedes: string | null
  superseded_by: string | null
  refs: string[]
  active: boolean
  created_at: number
}

export interface ClaimEntry {
  _id: string
  scope: { entity_id: EntityId | FileId }
  intent: string
  agent: Agent
  active: boolean
  outcome: string | null
  created_at: number
}

export interface ActivityEvent {
  id: string
  ts: number
  agent?: Agent
  action:
    | "read_context"
    | "write_context"
    | "claim"
    | "release"
    | "list_open_questions"
    | "ingest"
    | "reset"
  scope?: EntityId | FileId
  resolved_entities?: (EntityId | FileId)[]
  returned_ids?: string[]
  summary: string
  refs: string[]
}

// SSE event payload union — every event the FE consumes
export type SSEEvent =
  | { type: "working_context.created"; payload: WorkingContextEntry }
  | { type: "working_context.superseded"; payload: { id: string; superseded_by: string } }
  | { type: "working_context.claim_activated"; payload: ClaimEntry }
  | { type: "working_context.claim_released"; payload: { claim_id: string; outcome: string } }
  | {
      type: "working_context.claim_conflict"
      payload: {
        scope: EntityId | FileId
        attempting_agent: Agent
        holding_agent: Agent
        intent: string
        existing_claim_id: string
      }
    }
  | { type: "agent.activity"; payload: ActivityEvent }
  | {
      type: "artifact.referenced"
      payload: { artifact_id: string; by_agent: Agent; scope: EntityId | FileId }
    }
  | { type: "ingest.event"; payload: { summary: string; ts: number } }
  | { type: "mcp.connected"; payload: { agent: Agent; connected: true } }
  | { type: "mcp.disconnected"; payload: { agent: Agent; connected: false } }
  | { type: "ping"; payload: Record<string, never> }
