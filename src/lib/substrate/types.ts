// Substrate domain types — shaped from the spec, kept loose where the backend
// schema is still pending so the reducer can adapt on first integration.

export type AgentId = "producer" | "consumer" | string;

export type ViewMode = "structure" | "activity" | "grounded";

export type WCType =
  | "draft_schema"
  | "decision"
  | "claim"
  | "investigation"
  | "open_question";

export interface Service {
  _id: string;
  name: string;
  depends_on?: string[];
  consumed_by?: string[];
  hot_files?: string[];
  team?: string;
}

export interface FileEntity {
  _id: string; // path-like id, e.g. "payments-api/src/checkout.ts"
  service_id: string;
  name: string;
}

export interface Person {
  _id: string;
  name: string;
  team?: string;
  expertise?: string[];
}

export interface Artifact {
  _id: string;
  kind: "pr" | "slack" | "jira" | string;
  title: string;
  url?: string;
}

export interface WorkingContext {
  _id: string;
  type: WCType;
  scope: { entity_id: string; entity_kind: "service" | "file" | "person" };
  author: AgentId;
  summary: string;
  refs?: string[]; // artifact ids
  supersedes?: string;
  superseded_by?: string;
  created_at: number;
}

export interface SeedPayload {
  org?: string;
  services: Service[];
  files?: FileEntity[];
  people: Person[];
  artifacts?: Artifact[];
  working_context?: WorkingContext[];
}

export type SubstrateEvent =
  | { type: "service.upsert"; data: Service }
  | { type: "person.upsert"; data: Person }
  | { type: "artifact.upsert"; data: Artifact }
  | { type: "file.upsert"; data: FileEntity }
  | { type: "working_context.write"; data: WorkingContext }
  | { type: "working_context.supersede"; data: { old_id: string; new_id: string } }
  | {
      type: "read_context";
      data: {
        agent: AgentId;
        scope_entity_id: string;
        returned_ids: string[];
        query?: string;
      };
    }
  | {
      type: "claim.acquire";
      data: { agent: AgentId; file_id: string; wc_id?: string };
    }
  | { type: "claim.release"; data: { agent: AgentId; file_id: string } }
  | {
      type: "claim.collision";
      data: { agent: AgentId; file_id: string; held_by: AgentId };
    }
  | { type: "artifact.reference"; data: { wc_id: string; artifact_id: string } }
  | { type: string; data: unknown };

export interface ActivityEntry {
  id: string;
  ts: number;
  agent?: AgentId;
  action: string;
  scope?: string;
  summary: string;
  nodeIds: string[]; // for click-to-focus
}