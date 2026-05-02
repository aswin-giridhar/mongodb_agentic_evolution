import type { Artifact } from "@/types";

export type ArtifactPosition = { x: number; y: number };

// Positions are used when artifact becomes visible in Grounded view.
// Cluster near the entity they reference.
export const ARTIFACT_POSITIONS: Record<string, ArtifactPosition> = {
  "slack:marcus-rate-limit-warning": { x: 740, y: 240 },
  "pr:1247": { x: 380, y: 540 },
  "pr:1192": { x: 760, y: 540 },
  "pr:1233": { x: 580, y: 660 },
  "pr:1188": { x: 1020, y: 660 },
  "jira:GROWTH-204": { x: 820, y: 660 },
  "slack:checkout-bug-thread": { x: 460, y: 200 },
  "slack:orders-schema-question": { x: 720, y: 540 },
  "pr:1301-orders-v2": { x: 380, y: 220 },
  "jira:PLAT-87": { x: 100, y: 240 },
  "github:incident-2024-q1": { x: 1180, y: 240 },
  "slack:notif-deprecation": { x: 1180, y: 100 },
};

export const artifacts: Artifact[] = [
  {
    _id: "slack:marcus-rate-limit-warning",
    source: "slack",
    channel: "#platform",
    content:
      "Heads up — do NOT use express-rate-limit on checkout. We hit a memory leak in prod last quarter (kept LRU references alive across requests). Use lib/limiter (the redis-backed wrapper). It's already wired in payments-api.",
    refs: ["services.payments-api", "people.marcus"],
    created_at: "2026-02-14T10:22:00Z",
  },
  {
    _id: "pr:1247",
    source: "github",
    content:
      "feat(mobile): wire checkout screen to /api/v1/orders. Adds optimistic UI and retry on 429.",
    refs: ["services.mobile-app", "services.payments-api", "people.priya"],
    created_at: "2026-04-08T14:11:00Z",
  },
  {
    _id: "pr:1192",
    source: "github",
    content:
      "fix(payments): use SERIALIZABLE isolation on transaction inserts. Prevents double-charge under retry.",
    refs: ["services.payments-api", "people.elena"],
    created_at: "2026-03-22T09:40:00Z",
  },
  {
    _id: "pr:1233",
    source: "github",
    content:
      "feat(mobile): codegen typed clients from /api/v1 OpenAPI spec.",
    refs: ["services.mobile-app", "people.raj"],
    created_at: "2026-04-01T17:02:00Z",
  },
  {
    _id: "pr:1188",
    source: "github",
    content:
      "feat(admin): orders dashboard - status breakdown by hour.",
    refs: ["services.admin-dashboard", "people.james"],
    created_at: "2026-03-19T11:55:00Z",
  },
  {
    _id: "jira:GROWTH-204",
    source: "jira",
    content:
      "Experiment: cohort-based pricing on checkout. Owner: Sara. Status: design.",
    refs: ["services.admin-dashboard", "people.sara"],
    created_at: "2026-04-02T13:00:00Z",
  },
  {
    _id: "slack:checkout-bug-thread",
    source: "slack",
    channel: "#payments",
    content:
      "Anyone seeing 502s on /checkout in the last hour? Started around 14:20 UTC.",
    refs: ["services.payments-api"],
    created_at: "2026-04-12T14:25:00Z",
  },
  {
    _id: "slack:orders-schema-question",
    source: "slack",
    channel: "#mobile",
    content:
      "Is the new orders endpoint going to keep `transaction_id` or rename it to `txn_id`? Asking before I wire the client.",
    refs: ["services.mobile-app", "services.payments-api"],
    created_at: "2026-04-15T09:11:00Z",
  },
  {
    _id: "pr:1301-orders-v2",
    source: "github",
    content:
      "draft(payments): /api/v2/orders - extract from /checkout. Adds idempotency keys.",
    refs: ["services.payments-api"],
    created_at: "2026-04-20T16:30:00Z",
  },
  {
    _id: "jira:PLAT-87",
    source: "jira",
    content:
      "Auth-service: rotate JWT signing keys quarterly. Next rotation due May.",
    refs: ["services.auth-service"],
    created_at: "2026-03-30T08:00:00Z",
  },
  {
    _id: "github:incident-2024-q1",
    source: "github",
    content:
      "Postmortem: rate-limit memory leak Q1. Root cause: in-process LRU not bounded across keep-alive connections.",
    refs: ["services.payments-api", "people.marcus"],
    created_at: "2026-01-30T18:00:00Z",
  },
  {
    _id: "slack:notif-deprecation",
    source: "slack",
    channel: "#platform",
    content:
      "Reminder: notification-service v1 deprecated June 1. Migrate to v2 batch dispatcher.",
    refs: ["services.notification-service"],
    created_at: "2026-04-18T10:00:00Z",
  },
];
