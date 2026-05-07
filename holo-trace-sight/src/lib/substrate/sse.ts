// SSE adapter — translates the Substrate backend's wire format into the
// internal SubstrateEvent shape this dashboard's store expects.
//
// The backend was built against Mohammed's frontend contract:
//   event: working_context.created
//   data: { entry: { _id, type, author, scope: {entity_id}, content, ..., created_at: ISO } }
//
// This frontend's store expects:
//   { type: "working_context.write",
//     data: { _id, type, author, scope: {entity_id, entity_kind},
//             summary, ..., created_at: number } }
//
// Translation happens here so the rest of the codebase (store / mock / UI)
// stays pristine.

import type {
  Artifact,
  FileEntity,
  Person,
  SeedPayload,
  Service,
  SubstrateEvent,
  WorkingContext,
} from "./types";

export interface SSEClientOptions {
  baseUrl: string;
  onEvent: (e: SubstrateEvent) => void;
  onState: (s: "connecting" | "open" | "error") => void;
}

// ---------------- Field-shape translators ----------------

function entityKindFor(id: string): "service" | "file" | "person" {
  if (id.includes("/")) return "file";
  if (id.startsWith("people.")) return "person";
  return "service";
}

function tsOf(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isNaN(n) ? Date.now() : n;
  }
  return Date.now();
}

interface BackendWCEntry {
  _id: string;
  type: WorkingContext["type"];
  author: string;
  scope: { entity_id: string };
  content: string;
  refs?: string[];
  supersedes: string | null;
  superseded_by: string | null;
  active: boolean;
  created_at: string | number;
}

function translateWC(entry: BackendWCEntry): WorkingContext {
  return {
    _id: entry._id,
    type: entry.type,
    author: entry.author,
    scope: {
      entity_id: entry.scope.entity_id,
      entity_kind: entityKindFor(entry.scope.entity_id),
    },
    summary: entry.content,
    refs: entry.refs ?? [],
    supersedes: entry.supersedes ?? undefined,
    superseded_by: entry.superseded_by ?? undefined,
    created_at: tsOf(entry.created_at),
  };
}

// ---------------- SSE wire adapter ----------------

export function startSSE(opts: SSEClientOptions): () => void {
  let es: EventSource | null = null;
  let stopped = false;
  let backoff = 1000;

  // Local cache for events whose backend payload doesn't carry enough info
  // to populate this frontend's denser internal shape.
  const wcByClaimId = new Map<string, { scope: string; author: string }>();

  const dispatch = (e: SubstrateEvent) => opts.onEvent(e);

  const safeJson = <T>(raw: string): T | null => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  const open = () => {
    if (stopped) return;
    opts.onState("connecting");
    try {
      es = new EventSource(`${opts.baseUrl}/api/stream`);
    } catch {
      opts.onState("error");
      schedule();
      return;
    }

    es.onopen = () => {
      backoff = 1000;
      opts.onState("open");
    };
    es.onerror = () => {
      opts.onState("error");
      es?.close();
      es = null;
      schedule();
    };

    // working_context.created  →  internal "working_context.write"
    es.addEventListener("working_context.created", (ev: MessageEvent) => {
      const payload = safeJson<{ entry: BackendWCEntry }>(ev.data);
      if (!payload?.entry) return;
      const wc = translateWC(payload.entry);
      wcByClaimId.set(wc._id, { scope: wc.scope.entity_id, author: wc.author });
      dispatch({ type: "working_context.write", data: wc });
    });

    // working_context.superseded  →  internal "working_context.supersede"
    // Backend emits { old_id, superseded_by } OR { id, superseded_by }
    // Be defensive about which key carries the old id.
    es.addEventListener("working_context.superseded", (ev: MessageEvent) => {
      const p = safeJson<{
        old_id?: string;
        id?: string;
        superseded_by?: string;
        new_entry?: BackendWCEntry;
      }>(ev.data);
      if (!p) return;
      const old_id = p.old_id ?? p.id;
      const new_id = p.superseded_by ?? p.new_entry?._id;
      if (!old_id || !new_id) return;
      // If the new entry was inlined, dispatch a write first so the chip exists
      if (p.new_entry) {
        const wc = translateWC(p.new_entry);
        wcByClaimId.set(wc._id, { scope: wc.scope.entity_id, author: wc.author });
        dispatch({ type: "working_context.write", data: wc });
      }
      dispatch({ type: "working_context.supersede", data: { old_id, new_id } });
    });

    // claim.activated  →  internal "working_context.write" (so chip renders)
    //                  +  internal "claim.acquire"  (so claims state updates)
    es.addEventListener("claim.activated", (ev: MessageEvent) => {
      const p = safeJson<{ entry: BackendWCEntry }>(ev.data);
      if (!p?.entry) return;
      const wc = translateWC(p.entry);
      wcByClaimId.set(wc._id, { scope: wc.scope.entity_id, author: wc.author });
      dispatch({ type: "working_context.write", data: wc });
      dispatch({
        type: "claim.acquire",
        data: { agent: wc.author, file_id: wc.scope.entity_id, wc_id: wc._id },
      });
    });

    // claim.released  →  internal "claim.release"
    // Backend sends only { claim_id, outcome }; resolve agent + file_id from cache.
    es.addEventListener("claim.released", (ev: MessageEvent) => {
      const p = safeJson<{ claim_id: string; outcome: string }>(ev.data);
      if (!p?.claim_id) return;
      const cached = wcByClaimId.get(p.claim_id);
      if (!cached) return;
      dispatch({
        type: "claim.release",
        data: { agent: cached.author, file_id: cached.scope },
      });
    });

    // claim.conflict  →  internal "claim.collision"
    es.addEventListener("claim.conflict", (ev: MessageEvent) => {
      const p = safeJson<{
        attempted_by: string;
        existing_claim_id: string;
        intent: string;
        scope?: string;
        holding_agent?: string;
      }>(ev.data);
      if (!p) return;
      const cached = wcByClaimId.get(p.existing_claim_id);
      const file_id = p.scope ?? cached?.scope;
      const held_by = p.holding_agent ?? cached?.author ?? "unknown";
      if (!file_id) return;
      dispatch({
        type: "claim.collision",
        data: { agent: p.attempted_by, file_id, held_by },
      });
    });

    // read_context.started → ignored. Internal store has a single read event.
    // read_context.completed → internal "read_context" with collapsed node ids.
    es.addEventListener("read_context.completed", (ev: MessageEvent) => {
      const p = safeJson<{
        agent: string;
        query?: string;
        resolved_entity: string;
        traversed_entities?: string[];
        returned_entry_ids?: string[];
        returned_artifact_ids?: string[];
      }>(ev.data);
      if (!p) return;
      const seen = new Set<string>([p.resolved_entity]);
      const returned_ids = [
        ...(p.traversed_entities ?? []),
        ...(p.returned_entry_ids ?? []),
        ...(p.returned_artifact_ids ?? []),
      ].filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      dispatch({
        type: "read_context",
        data: {
          agent: p.agent,
          scope_entity_id: p.resolved_entity,
          returned_ids,
          query: p.query,
        },
      });
    });

    // artifact.referenced → backend doesn't carry wc_id on this event, and the
    // store's working_context.write handler already populates referencedArtifacts
    // from each WC's refs array, so we can safely ignore this event.

    // resolver.decided → the BP1 Resolver Agent's adjudication output. Already
    // in a shape that matches the FE's internal SubstrateEvent (`type` + `data`
    // wrapper), so this is a near-passthrough.
    es.addEventListener("resolver.decided", (ev: MessageEvent) => {
      const p = safeJson<{
        action: "DROP" | "WRITE"
        scope: string
        rationale: string
        new_id?: string
        supersede_ids?: string[]
      }>(ev.data)
      if (!p) return
      dispatch({ type: "resolver.decided", data: p })
    })

    // The seed SSE event is also ignored here; the Dashboard already calls
    // fetchSeed() over HTTP at boot.
  };

  const schedule = () => {
    if (stopped) return;
    setTimeout(open, backoff);
    backoff = Math.min(backoff * 1.6, 8000);
  };

  open();

  return () => {
    stopped = true;
    es?.close();
    es = null;
  };
}

// ---------------- Seed translator ----------------

interface BackendService {
  _id: string;
  name: string;
  owner_team?: string;
  depends_on?: string[];
  consumed_by?: string[];
  hot_files?: string[];
}
interface BackendPerson {
  _id: string;
  name: string;
  team?: string;
  expertise?: string[];
}
interface BackendArtifact {
  _id: string;
  source: string;
  preview?: string;
  content?: string;
  channel?: string;
}
interface BackendFile {
  id: string;
  service: string;
  path: string;
}
interface BackendSeed {
  services: BackendService[];
  people: BackendPerson[];
  files?: BackendFile[];
  artifacts?: BackendArtifact[];
}

export async function fetchSeed(baseUrl: string): Promise<SeedPayload> {
  const res = await fetch(`${baseUrl}/api/seed`);
  if (!res.ok) throw new Error(`seed ${res.status}`);
  const raw = (await res.json()) as BackendSeed;

  const services: Service[] = (raw.services ?? []).map((s) => ({
    _id: s._id,
    name: s.name,
    depends_on: s.depends_on,
    consumed_by: s.consumed_by,
    hot_files: s.hot_files,
    team: s.owner_team,
  }));

  const people: Person[] = (raw.people ?? []).map((p) => ({
    _id: p._id,
    name: p.name,
    team: p.team,
    expertise: p.expertise,
  }));

  const files: FileEntity[] = (raw.files ?? []).map((f) => ({
    _id: f.id,
    service_id: f.service,
    name: f.path.split("/").pop() ?? f.path,
  }));

  const artifacts: Artifact[] = (raw.artifacts ?? []).map((a) => ({
    _id: a._id,
    kind: a.source,
    title: a.preview ?? (a.content ? a.content.slice(0, 80) : a._id),
  }));

  return {
    org: "acme-robotics",
    services,
    files,
    people,
    artifacts,
  };
}

export async function postReset(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/demo/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`reset ${res.status}`);
}

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:3000";
