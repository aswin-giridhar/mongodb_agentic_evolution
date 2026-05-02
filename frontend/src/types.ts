export type EntityId = string;

export type Service = {
  _id: EntityId;
  type: "service";
  name: string;
  owner_team: string;
  depends_on: EntityId[];
  consumed_by: EntityId[];
  hot_files: string[];
};

export type Person = {
  _id: EntityId;
  type: "person";
  name: string;
  team: string;
  expertise: string[];
  expertise_evidence: string[];
};

export type ArtifactSource = "slack" | "github" | "jira";

export type Artifact = {
  _id: string;
  source: ArtifactSource;
  channel?: string;
  content: string;
  refs: EntityId[];
  created_at: string;
};

export type WorkingContextType =
  | "draft_schema"
  | "decision"
  | "claim"
  | "investigation"
  | "open_question";

export type AgentRole = "producer" | "consumer";

export type WorkingContextEntry = {
  _id: string;
  type: WorkingContextType;
  author: AgentRole;
  scope: { entity_id: EntityId };
  content: string;
  supersedes: string | null;
  superseded_by: string | null;
  refs: string[];
  active: boolean;
  created_at: string;
  ttl_at?: string;
};

export type SubstrateEvent =
  | {
      kind: "seed";
      services: Service[];
      people: Person[];
      artifacts: Artifact[];
    }
  | { kind: "working_context.created"; entry: WorkingContextEntry }
  | {
      kind: "working_context.superseded";
      old_id: string;
      new_entry: WorkingContextEntry;
    }
  | { kind: "claim.activated"; entry: WorkingContextEntry }
  | {
      kind: "claim.conflict";
      attempted_by: AgentRole;
      existing_claim_id: string;
      intent: string;
    }
  | { kind: "claim.released"; claim_id: string; outcome: string }
  | {
      kind: "read_context.started";
      agent: AgentRole;
      query: string;
      scope?: EntityId;
    }
  | {
      kind: "read_context.completed";
      agent: AgentRole;
      query: string;
      resolved_entity: EntityId;
      traversed_entities: EntityId[];
      returned_entry_ids: string[];
      returned_artifact_ids: string[];
    }
  | { kind: "agent.thought"; agent: AgentRole; text: string };

export type ViewMode = "structure" | "activity" | "grounded";
