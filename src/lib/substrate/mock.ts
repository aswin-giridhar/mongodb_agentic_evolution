import type { SeedPayload, SubstrateEvent } from "./types";

export const MOCK_SEED: SeedPayload = {
  org: "acme-robotics",
  services: [
    { _id: "service:identity", name: "identity", team: "platform", depends_on: [] },
    {
      _id: "service:checkout-web",
      name: "checkout-web",
      team: "growth",
      depends_on: ["service:payments-api", "service:identity"],
    },
    {
      _id: "service:payments-api",
      name: "payments-api",
      team: "payments",
      depends_on: ["service:ledger", "service:identity"],
    },
    {
      _id: "service:ledger",
      name: "ledger",
      team: "payments",
      depends_on: [],
    },
    {
      _id: "service:notifications",
      name: "notifications",
      team: "platform",
      depends_on: ["service:ledger"],
    },
  ],
  files: [
    {
      _id: "payments-api/src/checkout.ts",
      service_id: "service:payments-api",
      name: "checkout.ts",
    },
    {
      _id: "payments-api/src/refund.ts",
      service_id: "service:payments-api",
      name: "refund.ts",
    },
    {
      _id: "ledger/src/posting.ts",
      service_id: "service:ledger",
      name: "posting.ts",
    },
    {
      _id: "checkout-web/src/cart.tsx",
      service_id: "service:checkout-web",
      name: "cart.tsx",
    },
  ],
  people: [
    { _id: "person:alex", name: "Alex", team: "payments", expertise: ["ledger"] },
    { _id: "person:bea", name: "Bea", team: "payments", expertise: ["checkout"] },
    { _id: "person:cris", name: "Cris", team: "growth", expertise: ["web"] },
    { _id: "person:dani", name: "Dani", team: "platform", expertise: ["identity"] },
  ],
  artifacts: [
    { _id: "pr:payments-1421", kind: "pr", title: "PR #1421 — idempotent refunds" },
    { _id: "slack:checkout-incident", kind: "slack", title: "#checkout-incident 04-29" },
    { _id: "jira:LED-204", kind: "jira", title: "LED-204 double-posting bug" },
  ],
  working_context: [],
};

/** A scripted scenario that exercises every event type. */
export const MOCK_SCRIPT: { delay: number; event: SubstrateEvent }[] = [
  // 1) Producer reads context on payments-api before drafting
  {
    delay: 600,
    event: {
      type: "read_context",
      data: {
        agent: "producer",
        scope_entity_id: "service:payments-api",
        returned_ids: ["service:ledger", "person:alex"],
        query: "who owns refund posting?",
      },
    },
  },
  // 2) Producer drafts a schema on payments-api
  {
    delay: 1400,
    event: {
      type: "working_context.write",
      data: {
        _id: "wc:draft-refund-1",
        type: "draft_schema",
        scope: { entity_id: "service:payments-api", entity_kind: "service" },
        author: "producer",
        summary: "Refund payload v1: { id, amount, reason }",
        created_at: Date.now(),
      },
    },
  },
  // 3) Producer claims checkout.ts
  {
    delay: 900,
    event: {
      type: "claim.acquire",
      data: {
        agent: "producer",
        file_id: "payments-api/src/checkout.ts",
        wc_id: "wc:draft-refund-1",
      },
    },
  },
  // 4) Consumer reads context on the same service — sequential glow demo
  {
    delay: 1200,
    event: {
      type: "read_context",
      data: {
        agent: "consumer",
        scope_entity_id: "service:payments-api",
        returned_ids: ["wc:draft-refund-1", "person:alex"],
        query: "open drafts on payments-api",
      },
    },
  },
  // 5) Consumer would-have-collided on checkout.ts
  {
    delay: 1100,
    event: {
      type: "claim.collision",
      data: {
        agent: "consumer",
        file_id: "payments-api/src/checkout.ts",
        held_by: "producer",
      },
    },
  },
  // 6) Consumer logs an investigation on ledger
  {
    delay: 1300,
    event: {
      type: "working_context.write",
      data: {
        _id: "wc:invest-double-post",
        type: "investigation",
        scope: { entity_id: "service:ledger", entity_kind: "service" },
        author: "consumer",
        summary: "Double-posting reproduces under retry storm",
        refs: ["jira:LED-204"],
        created_at: Date.now(),
      },
    },
  },
  // 7) Consumer opens an open question on a person
  {
    delay: 900,
    event: {
      type: "working_context.write",
      data: {
        _id: "wc:q-alex",
        type: "open_question",
        scope: { entity_id: "person:alex", entity_kind: "person" },
        author: "consumer",
        summary: "Is idempotency key per-attempt or per-intent?",
        created_at: Date.now(),
      },
    },
  },
  // 8) Producer supersedes the draft with a decision
  {
    delay: 1500,
    event: {
      type: "working_context.write",
      data: {
        _id: "wc:decision-refund",
        type: "decision",
        scope: { entity_id: "service:payments-api", entity_kind: "service" },
        author: "producer",
        summary: "Refund payload finalised: idempotency_key required",
        refs: ["pr:payments-1421", "slack:checkout-incident"],
        supersedes: "wc:draft-refund-1",
        created_at: Date.now(),
      },
    },
  },
  {
    delay: 200,
    event: {
      type: "working_context.supersede",
      data: { old_id: "wc:draft-refund-1", new_id: "wc:decision-refund" },
    },
  },
  // 9) Producer releases the file
  {
    delay: 800,
    event: {
      type: "claim.release",
      data: { agent: "producer", file_id: "payments-api/src/checkout.ts" },
    },
  },
  // 10) Consumer makes a claim entry on a different file
  {
    delay: 1200,
    event: {
      type: "claim.acquire",
      data: {
        agent: "consumer",
        file_id: "ledger/src/posting.ts",
      },
    },
  },
  // 11) A grounded claim on ledger
  {
    delay: 1100,
    event: {
      type: "working_context.write",
      data: {
        _id: "wc:claim-posting",
        type: "claim",
        scope: { entity_id: "ledger/src/posting.ts", entity_kind: "file" },
        author: "consumer",
        summary: "post() must be wrapped in tx with SERIALIZABLE",
        refs: ["pr:payments-1421"],
        created_at: Date.now(),
      },
    },
  },
  // 12) Final retrieval pulse — Producer reads decisions from ledger
  {
    delay: 1400,
    event: {
      type: "read_context",
      data: {
        agent: "producer",
        scope_entity_id: "service:ledger",
        returned_ids: ["wc:invest-double-post", "wc:claim-posting"],
        query: "open work on ledger",
      },
    },
  },
];

export interface MockRunner {
  stop: () => void;
}

export function startMock(
  onEvent: (e: SubstrateEvent) => void,
  opts: { loop?: boolean } = {}
): MockRunner {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = async () => {
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      if (i >= MOCK_SCRIPT.length) {
        if (opts.loop) {
          i = 0;
          timer = setTimeout(tick, 2500);
        }
        return;
      }
      const step = MOCK_SCRIPT[i++];
      timer = setTimeout(() => {
        if (cancelled) return;
        onEvent(step.event);
        tick();
      }, step.delay);
    };
    tick();
  };

  run();

  return {
    stop: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}