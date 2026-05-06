import type { SeedPayload, SubstrateEvent } from "./types";

// Mock data aligned with the live MongoDB Atlas dataset:
// 6 services + 6 people, matching backend id format (`services.foo`, `people.foo`)
// so the mock layout matches the live layout exactly. Identical entity counts
// to the sibling `frontend/` (Mohammed's) mock.

export const MOCK_SEED: SeedPayload = {
  org: "acme-robotics",
  services: [
    {
      _id: "services.auth-service",
      name: "auth-service",
      team: "platform",
      depends_on: [],
      consumed_by: ["services.payments-api", "services.mobile-app"],
    },
    {
      _id: "services.payments-api",
      name: "payments-api",
      team: "platform",
      depends_on: ["services.auth-service"],
      consumed_by: ["services.mobile-app", "services.admin-dashboard"],
    },
    {
      _id: "services.notification-service",
      name: "notification-service",
      team: "platform",
      depends_on: [],
      consumed_by: ["services.payments-api", "services.mobile-app"],
    },
    {
      _id: "services.mobile-app",
      name: "mobile-app",
      team: "mobile",
      depends_on: [
        "services.payments-api",
        "services.auth-service",
        "services.search-api",
        "services.notification-service",
      ],
      consumed_by: [],
    },
    {
      _id: "services.admin-dashboard",
      name: "admin-dashboard",
      team: "growth",
      depends_on: ["services.payments-api"],
      consumed_by: [],
    },
    {
      _id: "services.search-api",
      name: "search-api",
      team: "platform",
      depends_on: [],
      consumed_by: ["services.mobile-app"],
    },
  ],
  files: [
    {
      _id: "services.payments-api/checkout.ts",
      service_id: "services.payments-api",
      name: "checkout.ts",
    },
    {
      _id: "services.payments-api/refund.ts",
      service_id: "services.payments-api",
      name: "refund.ts",
    },
    {
      _id: "services.mobile-app/CheckoutForm.tsx",
      service_id: "services.mobile-app",
      name: "CheckoutForm.tsx",
    },
    {
      _id: "services.notification-service/dispatcher.ts",
      service_id: "services.notification-service",
      name: "dispatcher.ts",
    },
  ],
  people: [
    {
      _id: "people.marcus",
      name: "Marcus",
      team: "platform",
      expertise: ["redis", "rate-limiting", "caching"],
    },
    {
      _id: "people.elena",
      name: "Elena",
      team: "platform",
      expertise: ["postgres", "transactions", "auth", "security"],
    },
    {
      _id: "people.priya",
      name: "Priya",
      team: "mobile",
      expertise: ["react-native", "checkout-flow", "hooks"],
    },
    {
      _id: "people.raj",
      name: "Raj",
      team: "mobile",
      expertise: ["graphql", "api-clients"],
    },
    {
      _id: "people.sara",
      name: "Sara",
      team: "growth",
      expertise: ["analytics", "experimentation"],
    },
    {
      _id: "people.james",
      name: "James",
      team: "growth",
      expertise: ["dashboards", "reporting"],
    },
  ],
  artifacts: [
    { _id: "pr:1247", kind: "github_pr", title: "PR #1247 — replace express-rate-limit with redis-backed limiter" },
    {
      _id: "slack:marcus-rate-limit-warning",
      kind: "slack",
      title: "#platform — Marcus on rate-limit memory leak",
    },
    { _id: "jira:GROWTH-204", kind: "jira", title: "GROWTH-204 — cohort-based pricing experiment" },
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
        scope_entity_id: "services.payments-api",
        returned_ids: ["services.auth-service", "people.elena"],
        query: "who owns transaction integrity?",
      },
    },
  },
  // 2) Producer drafts a transaction schema on payments-api
  {
    delay: 1400,
    event: {
      type: "working_context.write",
      data: {
        _id: "wc:draft-transaction-1",
        type: "draft_schema",
        scope: { entity_id: "services.payments-api", entity_kind: "service" },
        author: "producer",
        summary: "Transaction payload v1: { tx_id, amount, currency, status }",
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
        file_id: "services.payments-api/checkout.ts",
        wc_id: "wc:draft-transaction-1",
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
        scope_entity_id: "services.payments-api",
        returned_ids: ["wc:draft-transaction-1", "people.elena"],
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
        file_id: "services.payments-api/checkout.ts",
        held_by: "producer",
      },
    },
  },
  // 6) Consumer logs an investigation on notification-service
  {
    delay: 1300,
    event: {
      type: "working_context.write",
      data: {
        _id: "wc:invest-notif-deprecation",
        type: "investigation",
        scope: { entity_id: "services.notification-service", entity_kind: "service" },
        author: "consumer",
        summary: "v1 deprecation impact reproduces under sustained payment load",
        refs: ["jira:GROWTH-204"],
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
        _id: "wc:q-elena",
        type: "open_question",
        scope: { entity_id: "people.elena", entity_kind: "person" },
        author: "consumer",
        summary: "Is the idempotency key per-attempt or per-transaction?",
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
        _id: "wc:decision-transaction",
        type: "decision",
        scope: { entity_id: "services.payments-api", entity_kind: "service" },
        author: "producer",
        summary: "Transaction payload finalised: idempotency_key required, tx_id immutable",
        refs: ["pr:1247", "slack:marcus-rate-limit-warning"],
        supersedes: "wc:draft-transaction-1",
        created_at: Date.now(),
      },
    },
  },
  {
    delay: 200,
    event: {
      type: "working_context.supersede",
      data: { old_id: "wc:draft-transaction-1", new_id: "wc:decision-transaction" },
    },
  },
  // 9) Producer releases the file
  {
    delay: 800,
    event: {
      type: "claim.release",
      data: { agent: "producer", file_id: "services.payments-api/checkout.ts" },
    },
  },
  // 10) Consumer makes a claim entry on a different file
  {
    delay: 1200,
    event: {
      type: "claim.acquire",
      data: {
        agent: "consumer",
        file_id: "services.notification-service/dispatcher.ts",
      },
    },
  },
  // 11) A grounded claim on notification-service
  {
    delay: 1100,
    event: {
      type: "working_context.write",
      data: {
        _id: "wc:claim-dispatcher",
        type: "claim",
        scope: { entity_id: "services.notification-service/dispatcher.ts", entity_kind: "file" },
        author: "consumer",
        summary: "dispatch() must batch across keep-alive connections",
        refs: ["pr:1247"],
        created_at: Date.now(),
      },
    },
  },
  // 12) Final retrieval pulse — Producer reads decisions from notification-service
  {
    delay: 1400,
    event: {
      type: "read_context",
      data: {
        agent: "producer",
        scope_entity_id: "services.notification-service",
        returned_ids: ["wc:invest-notif-deprecation", "wc:claim-dispatcher"],
        query: "open work on notification-service",
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
