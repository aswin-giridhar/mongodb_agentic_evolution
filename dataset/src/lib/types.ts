/**
 * Shared TypeScript types for Substrate project
 * Based on integration-contract.md §3
 */

export type EntityId = string; // "services.payments-api"
export type FileId = string; // "services.payments-api/checkout.ts"
export type Agent = "producer" | "consumer";

export type WorkingContextType =
  | "draft_schema"
  | "decision"
  | "claim"
  | "investigation"
  | "open_question";

export type ArtifactSource =
  | "slack"
  | "github_pr"
  | "jira_ticket"
  | "docs"
  | "code_chunk";

export interface Service {
  _id: EntityId;
  name: string;
  owner_team: string;
  depends_on: EntityId[];
  consumed_by: EntityId[];
  hot_files: string[];
}

export interface Person {
  _id: EntityId;
  name: string;
  team: string;
  role: string;
  expertise: string[];
  handle: string;
}

export interface File {
  id: FileId;
  service: EntityId;
  path: string;
}

export interface Artifact {
  _id: string; // "slack:abc123"
  source: ArtifactSource;
  channel?: string;
  author?: string;
  content: string;
  preview?: string;
  embedding?: number[]; // 1024 floats
  refs: EntityId[];
  metadata?: Record<string, unknown>;
  created_at: number;
}

export interface WorkingContextEntry {
  _id: string; // "wc_001"
  type: WorkingContextType;
  author: Agent;
  scope: { entity_id: EntityId | FileId };
  content: string;
  embedding?: number[];
  supersedes: string | null;
  superseded_by: string | null;
  refs: string[]; // artifact ids
  active: boolean;
  created_at: number;
}

export interface ClaimEntry {
  _id: string; // "cl_001"
  scope: { entity_id: EntityId | FileId };
  intent: string;
  agent: Agent;
  active: boolean;
  outcome: string | null;
  created_at: number;
}

// Generation types
export interface SeedSpec {
  services: ServiceSpec[];
  people: PersonSpec[];
  channels: string[];
  tribal_rules: TribalRule[];
  story_arcs: string[];
  company: CompanyInfo;
  time_anchor: string;
  generation_config: GenerationConfig;
}

export interface ServiceSpec {
  id: string;
  name: string;
  owner_team: string;
  depends_on: string[];
  consumed_by: string[];
  hot_files: string[];
}

export interface PersonSpec {
  id: string;
  name: string;
  team: string;
  role: string;
  expertise: string[];
  handle: string;
}

export interface TribalRule {
  id: string;
  rule: string;
  reason: string;
  slack_channel: string;
  slack_author: string;
  slack_age_weeks: number;
  pr_id: string;
  pr_title: string;
  pr_files: string[];
  keywords: string[];
}

export interface CompanyInfo {
  name: string;
  description: string;
  products: string[];
}

export interface GenerationConfig {
  slack_messages_per_channel: number;
  total_prs: number;
  total_jira_tickets: number;
  total_docs: number;
  total_code_chunks: number;
  thread_percentage: number;
}

// Generated data types
export interface SlackMessage {
  id: string;
  channel: string;
  author: string;
  ts: string;
  content: string;
  parent_ts?: string;
  reactions?: string[];
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  description: string;
  author: string;
  state: "open" | "closed" | "merged";
  files: string[];
  service: string;
  created_at: number;
  merged_at?: number;
}

export interface JiraTicket {
  id: string;
  key: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  assignee?: string;
  service?: string;
  pr_link?: string;
  created_at: number;
}

export interface Doc {
  id: string;
  title: string;
  content: string;
  author: string;
  type: "spec" | "design" | "runbook" | "decision";
  service?: string;
  created_at: number;
}

export interface CodeChunk {
  id: string;
  path: string;
  content: string;
  imports: string[];
  service: string;
  language: string;
}

// Database document types (with _id)
export type ServiceDoc = Service & { _id: EntityId };
export type PersonDoc = Person & { _id: EntityId };
export type ArtifactDoc = Artifact & { _id: string };
export type WorkingContextDoc = WorkingContextEntry & { _id: string };
export type ClaimDoc = ClaimEntry & { _id: string };
