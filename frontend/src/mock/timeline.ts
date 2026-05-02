import type { SubstrateEvent, WorkingContextEntry } from "@/types";

// All timing in ms. Tune from here.
export const TIMING = {
  preIdle: 5_000,
  short: 1_000,
  medium: 2_000,
  long: 3_000,
  loopGap: 8_000,
};

let idCounter = 0;
const nextId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}:${idCounter}`;
};
export const resetIdCounter = (): void => {
  idCounter = 0;
};

const now = (): string => new Date().toISOString();

const wc = (
  partial: Omit<WorkingContextEntry, "_id" | "created_at" | "active" | "supersedes" | "superseded_by"> &
    Partial<Pick<WorkingContextEntry, "supersedes" | "superseded_by">>,
): WorkingContextEntry => ({
  _id: nextId("wc"),
  created_at: now(),
  active: true,
  supersedes: partial.supersedes ?? null,
  superseded_by: partial.superseded_by ?? null,
  ...partial,
});

export type ScriptedStep = {
  delayMs: number;
  build: (ctx: ScriptContext) => SubstrateEvent;
};

export type ScriptContext = {
  // Mutable bag for cross-step references (ids of created entries).
  refs: Record<string, string>;
};

// Phase 1 starts at index 0 in this array. Seed is emitted separately.
export const SCRIPTED_TIMELINE: ScriptedStep[] = [
  // ---------- Phase 1: idle ----------
  {
    delayMs: TIMING.preIdle,
    build: () => ({
      kind: "agent.thought",
      agent: "producer",
      text: "Drafting the schema for /api/v2/orders. Need to settle on field names before mobile starts the client.",
    }),
  },

  // ---------- Phase 2: Hero 1 - Schema convergence ----------
  {
    delayMs: TIMING.short,
    build: (ctx) => {
      const entry = wc({
        type: "draft_schema",
        author: "producer",
        scope: { entity_id: "services.payments-api" },
        content:
          "POST /api/v2/orders { transaction_id: string, items: OrderItem[], idempotency_key: string }. Response: { order_id, status }. transaction_id chosen over txn_id for grep-ability.",
        refs: [],
      });
      ctx.refs.draftSchemaId = entry._id;
      return { kind: "working_context.created", entry };
    },
  },
  {
    delayMs: TIMING.medium,
    build: () => ({
      kind: "agent.thought",
      agent: "consumer",
      text: "Building the orders client. Let me check if there's a draft schema before I guess at field names.",
    }),
  },
  {
    delayMs: TIMING.short,
    build: () => ({
      kind: "read_context.started",
      agent: "consumer",
      query: "orders schema",
      scope: "services.payments-api",
    }),
  },
  {
    delayMs: TIMING.short,
    build: (ctx) => ({
      kind: "read_context.completed",
      agent: "consumer",
      query: "orders schema",
      resolved_entity: "services.payments-api",
      traversed_entities: ["services.payments-api", "services.mobile-app", "services.auth-service"],
      returned_entry_ids: [ctx.refs.draftSchemaId],
      returned_artifact_ids: [],
    }),
  },
  {
    delayMs: TIMING.short,
    build: () => ({
      kind: "agent.thought",
      agent: "consumer",
      text: "Got it. Using `transaction_id` per the producer's draft.",
    }),
  },

  // ---------- Phase 3: Hero 2 - Supersede + grounding ----------
  {
    delayMs: TIMING.long,
    build: () => ({
      kind: "agent.thought",
      agent: "producer",
      text: "Need rate limiting on /checkout. I'll use express-rate-limit, it's the obvious one.",
    }),
  },
  {
    delayMs: TIMING.short,
    build: (ctx) => {
      const entry = wc({
        type: "decision",
        author: "producer",
        scope: { entity_id: "services.payments-api" },
        content: "Use express-rate-limit middleware on /checkout. Per-IP, 60 rpm.",
        refs: [],
      });
      ctx.refs.oldDecisionId = entry._id;
      return { kind: "working_context.created", entry };
    },
  },
  {
    delayMs: TIMING.medium,
    build: () => ({
      kind: "agent.thought",
      agent: "producer",
      text: "Wait — let me check if anyone has prior art on rate-limiting here.",
    }),
  },
  {
    delayMs: TIMING.short,
    build: () => ({
      kind: "read_context.started",
      agent: "producer",
      query: "rate limiting",
      scope: "services.payments-api",
    }),
  },
  {
    delayMs: TIMING.short,
    build: (ctx) => ({
      kind: "read_context.completed",
      agent: "producer",
      query: "rate limiting",
      resolved_entity: "services.payments-api",
      traversed_entities: ["services.payments-api", "people.marcus"],
      returned_entry_ids: [ctx.refs.oldDecisionId],
      returned_artifact_ids: ["slack:marcus-rate-limit-warning", "github:incident-2024-q1"],
    }),
  },
  {
    delayMs: TIMING.short,
    build: () => ({
      kind: "agent.thought",
      agent: "producer",
      text: "Marcus warned about express-rate-limit — memory leak in prod last quarter. Switching to lib/limiter.",
    }),
  },
  {
    delayMs: TIMING.short,
    build: (ctx) => {
      const entry = wc({
        type: "decision",
        author: "producer",
        scope: { entity_id: "services.payments-api" },
        content:
          "Use lib/limiter (redis-backed) on /checkout. Per Marcus's #platform thread — express-rate-limit has a memory leak under keep-alive. Reusing the wrapper that's already wired in payments-api.",
        refs: ["slack:marcus-rate-limit-warning", "github:incident-2024-q1"],
        supersedes: ctx.refs.oldDecisionId,
      });
      ctx.refs.newDecisionId = entry._id;
      return {
        kind: "working_context.superseded",
        old_id: ctx.refs.oldDecisionId,
        new_entry: entry,
      };
    },
  },

  // ---------- Phase 4: Hero 3 - Claim collision ----------
  {
    delayMs: TIMING.long,
    build: () => ({
      kind: "agent.thought",
      agent: "producer",
      text: "Locking checkout.ts while I refactor transaction handling for the v2 schema.",
    }),
  },
  {
    delayMs: TIMING.short,
    build: (ctx) => {
      const entry = wc({
        type: "claim",
        author: "producer",
        scope: { entity_id: "services.payments-api" },
        content: "refactor transaction handling for new orders v2 schema",
        refs: [],
      });
      ctx.refs.claimId = entry._id;
      return { kind: "claim.activated", entry };
    },
  },
  {
    delayMs: TIMING.medium,
    build: () => ({
      kind: "agent.thought",
      agent: "consumer",
      text: "Need to add error handling on the payments side for the mobile retry flow.",
    }),
  },
  {
    delayMs: TIMING.short,
    build: (ctx) => ({
      kind: "claim.conflict",
      attempted_by: "consumer",
      existing_claim_id: ctx.refs.claimId,
      intent: "add server-side error handling for mobile retry flow",
    }),
  },
  {
    delayMs: TIMING.short,
    build: () => ({
      kind: "agent.thought",
      agent: "consumer",
      text: "Claim held by producer. Routing to client-side error handling instead — I'll add retry/backoff in the mobile app.",
    }),
  },
];
