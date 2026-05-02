# Substrate — Synthetic Dataset & MongoDB Atlas Spec

> Hackathon: MongoDB Agentic Evolution Hackathon · Saturday May 2, 2026
> Owner: Person A (Data + MongoDB)
> Build window: 10:30 AM – 5:00 PM
>
> **Hackathon rule**: all data must be generated **on the day**, after 10:30 AM. Tonight is for reading docs and verifying Atlas access only — no code, no JSON.

---

## 1. Purpose

Pre-baked context for the fictional company "Acme Robotics" so:

1. The retrieval pipeline has artifacts to surface (the tribal knowledge demo)
2. The entity graph has services + people pre-populated
3. The agent scenes have realistic content to query against

The data set is the **grounding** — agents write `working_context` live during demo; `artifacts` are the historical bedrock the brain reasons over.

---

## 2. The fictional company: Acme Robotics

A robotics company building delivery bots. Engineering org has 4 services and 4 named engineers.

### 2.1 Services

| Service | Owner team | Depends on | Consumed by | Hot files |
|---------|-----------|------------|-------------|-----------|
| `auth` | platform | — | payments-api, mobile-app | `src/jwt.ts`, `src/middleware.ts` |
| `payments-api` | payments | auth, redis | mobile-app, admin | `src/routes/checkout.ts`, `src/routes/refund.ts` |
| `mobile-app` | mobile | payments-api, auth | (end users) | `src/checkout/CheckoutForm.tsx`, `src/api/payments.ts` |
| `inventory` | platform | redis | payments-api, admin | `src/stock.ts`, `src/reservations.ts` |

### 2.2 People

| Name | Team | Expertise | Slack handle |
|------|------|-----------|--------------|
| Sarah | platform (lead) | infrastructure, deployments, code review | @sarah |
| Marcus | platform | redis, rate-limiting, lib/limiter author | @marcus |
| Alex | payments | API design, payment flows | @alex |
| Jin | mobile | React, mobile checkout | @jin |

### 2.3 Repo structure (conceptual)

```
acme-monorepo/
├── services/
│   ├── auth/
│   ├── payments-api/
│   ├── mobile-app/
│   └── inventory/
└── lib/
    └── limiter.ts           # Marcus's redis-backed rate-limiter
```

The actual code is decoration — files contain ~30 lines of plausible-looking TypeScript with realistic imports.

---

## 3. The 4 tribal rules to encode

These are the rules the brain surfaces during retrieval. Each rule has at least one Slack thread and one PR establishing it. **Hero 2 of the demo specifically surfaces R1.**

| ID | Rule | Slack source | PR source |
|----|------|-------------|-----------|
| **R1** | Use `lib/limiter.ts` (redis-backed), not `express-rate-limit` (memory leak in production) | #platform, 6 weeks ago, Marcus | PR #1247 |
| **R2** | Payments API responses use `tx_id` field, not `transactionId` | #payments, 3 weeks ago, Alex | PR #1289 |
| **R3** | Mobile checkout uses `useCheckout` hook, not raw fetch | #mobile, 2 months ago, Jin | PR #1102 |
| **R4** | Auth middleware runs before logging middleware (security: don't log unauthenticated requests) | #platform, 4 months ago, Sarah | PR #998 |

Each rule must be retrievable by a relevant query. Verification queries in §10.

---

## 4. Data volumes

| Source | Count | Notes |
|--------|-------|-------|
| `artifacts` (slack) | 150 messages | 30 per channel × 5 channels |
| `artifacts` (github_pr) | 25 PRs | with title, description, file paths, author |
| `artifacts` (jira_ticket) | 15 tickets | 5 resolved-with-PR-link, rest open |
| `artifacts` (docs) | 5 short specs | each 200–400 words |
| `artifacts` (code_chunk) | ~30 file chunks | path + content + imports |
| `services` (derived) | 4 | as in §2.1 |
| `people` (derived) | 4 | as in §2.2 |

**Total artifacts**: ~225 documents. **Total embeddings**: ~225 (one per artifact). Voyage `voyage-3` at 1024 dim.

---

## 5. Generation strategy

Don't write 150 Slack messages by hand. Generate via Claude with structured prompts.

### 5.1 Phase A — Hand-written seed spec (10:30–11:00, ~30 min)

Single JSON file `seed-spec.json`. This is the only thing written by hand. Defines:

- The 4 services + their files
- The 4 people + their roles
- The 4 tribal rules (R1–R4) with channel/author/timing
- 5 channel definitions (#platform, #payments, #mobile, #incidents, #random)
- "Story arcs" — narrative beats the LLM will weave through the data

Example structure:

```json
{
  "services": [
    { "id": "payments-api", "owner_team": "payments", "depends_on": ["auth"], "consumed_by": ["mobile-app"], "hot_files": ["src/routes/checkout.ts", "src/routes/refund.ts"] },
    ...
  ],
  "people": [
    { "id": "marcus", "team": "platform", "expertise": ["redis", "rate-limiting"], "handle": "@marcus" },
    ...
  ],
  "channels": ["platform", "payments", "mobile", "incidents", "random"],
  "tribal_rules": [
    {
      "id": "R1",
      "rule": "use lib/limiter.ts not express-rate-limit",
      "reason": "memory leak in production",
      "slack_channel": "platform",
      "slack_author": "marcus",
      "slack_age_weeks": 6,
      "pr_id": "1247",
      "pr_files": ["src/lib/limiter.ts", "services/payments-api/src/routes/checkout.ts"]
    },
    ...
  ],
  "story_arcs": [
    "Six weeks ago: rate-limit incident took down checkout for 20 minutes. Marcus wrote lib/limiter.ts in response. (Establishes R1.)",
    "Three weeks ago: cross-team alignment meeting where Alex pushed for tx_id naming convention. (R2.)",
    "Two months ago: mobile team consolidated checkout fetch logic into useCheckout hook. (R3.)",
    "Four months ago: security review caught logging middleware running before auth. (R4.)",
    "Last week: open question about whether to add idempotency keys to refund endpoint. (Active investigation.)"
  ]
}
```

### 5.2 Phase B — LLM expansion (11:00–12:00, ~60 min)

Four scripts, each takes `seed-spec.json` and produces a JSON file. Run them in parallel.

```
scripts/gen-slack.ts    → seed-data/slack.json    (150 messages)
scripts/gen-prs.ts      → seed-data/prs.json      (25 PRs)
scripts/gen-jira.ts     → seed-data/jira.json     (15 tickets)
scripts/gen-docs.ts     → seed-data/docs.json     (5 specs)
```

Each script: Claude Sonnet 4.6 + structured output mode + system prompt that injects the seed-spec.

#### `gen-slack.ts` system prompt skeleton

```
You are generating a synthetic Slack history for the fictional company Acme Robotics.

Engineering team: <people from seed-spec>
Channels: <channels from seed-spec>
Story arcs that MUST appear: <story_arcs from seed-spec>
Tribal rules that MUST be encoded: <tribal_rules from seed-spec>

Generate exactly 150 Slack messages distributed across the 5 channels (~30 each).

Requirements:
- Each tribal rule (R1-R4) must appear in at least 2 messages with the
  specified author in the specified channel, dated to the specified age.
- Use realistic engineering tone (terse, casual, technical jargon).
- Mix in mundane content (lunch plans, deploy announcements, jokes) for realism.
- 20% of messages should be in threads (parent_ts links).
- Output strict JSON: array of {id, channel, author, ts, content, parent_ts?}

Time anchor: today is 2026-05-02. Generate timestamps relative to this.
```

Repeat similar shape for `gen-prs.ts`, `gen-jira.ts`, `gen-docs.ts`.

### 5.3 Phase C — Code chunk generation (12:00–12:15, ~15 min)

The synthetic repo files. ~30 files total. Generate via Claude.

```
scripts/gen-code.ts → seed-data/code.json (30 chunks)
```

Each chunk:
```json
{
  "path": "services/payments-api/src/routes/checkout.ts",
  "content": "/* ~30 lines of TypeScript */",
  "imports": ["@/lib/limiter", "@/middleware/auth"],
  "service": "payments-api"
}
```

Files don't need to compile. They need realistic imports and to look like the conventions encoded in tribal rules. (E.g., `checkout.ts` should import from `@/lib/limiter`, demonstrating R1 was followed.)

### 5.4 Verification (12:15–12:30)

Eyeball 5 random samples per file. Specifically check:

- Marcus's name appears in messages establishing R1
- A message in #platform from ~6 weeks ago mentions `express-rate-limit` and memory issues
- PR #1247 exists with files matching the rule
- `tx_id` appears in payments-related Slack/PRs (R2)

If R1–R4 don't show up cleanly, fix prompts and regenerate.

---

## 6. MongoDB Atlas setup

### 6.1 Cluster

Use the **MongoDB Atlas Sandbox** cluster from the email link. Do NOT create your own personal cluster — finalist eligibility requires the sandbox.

Region: closest to AWS App Runner region (likely `eu-west-2` London or `us-east-1`).

### 6.2 Database

Name: `substrate`

### 6.3 Collections

| Collection | Purpose | Approximate doc count |
|-----------|---------|----------------------|
| `artifacts` | Ingested historical content (slack/prs/jira/docs/code) | ~225 |
| `working_context` | Agent-writable. Empty at demo start, fills up live. | 0 → ~10 by demo end |
| `services` | Derived entities | 4 |
| `people` | Derived entities | 4 |
| `claims` | Active and released claims (separate from working_context for clarity) | 0 → 1–2 |

### 6.4 Indexes

#### Vector index `artifact_vector` on `artifacts`

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "refs" },
    { "type": "filter", "path": "source" }
  ]
}
```

#### Vector index `wc_vector` on `working_context`

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "scope.entity_id" },
    { "type": "filter", "path": "type" },
    { "type": "filter", "path": "active" }
  ]
}
```

#### Standard indexes

```js
db.services.createIndex({ depends_on: 1 })
db.services.createIndex({ consumed_by: 1 })
db.artifacts.createIndex({ refs: 1 })            // multikey
db.artifacts.createIndex({ source: 1 })
db.working_context.createIndex({ "scope.entity_id": 1, active: 1 })
db.working_context.createIndex({ supersedes: 1 })
db.working_context.createIndex({ created_at: -1 })
db.claims.createIndex({ "scope.entity_id": 1, active: 1 })
```

---

## 7. Document shapes

### 7.1 `artifacts`

```ts
{
  _id: "slack:abc123",                  // source-prefixed unique id
  source: "slack" | "github_pr" | "jira_ticket" | "docs" | "code_chunk",
  channel?: "#platform",                // slack only
  author?: "marcus",                    // for slack/prs
  content: "don't use express-rate-limit, use lib/limiter — see incident",
  embedding: [/* 1024 floats */],
  refs: ["services.payments-api", "people.marcus"],   // entities mentioned
  metadata: { ... },                    // source-specific extras
  created_at: 1700000000000             // unix ms
}
```

### 7.2 `working_context`

```ts
{
  _id: "wc_001",
  type: "draft_schema" | "decision" | "claim" | "investigation" | "open_question",
  author: "producer-agent",
  scope: { entity_id: "services.payments-api" },
  content: "Use lib/limiter.ts for rate limiting on /checkout",
  embedding: [/* 1024 floats */],
  supersedes: null,                     // or wc_id of prior version
  superseded_by: null,
  refs: ["slack:abc123"],
  active: true,
  created_at: 1714666800000
}
```

### 7.3 `services`

```ts
{
  _id: "services.payments-api",
  name: "payments-api",
  owner_team: "payments",
  depends_on: ["services.auth"],
  consumed_by: ["services.mobile-app"],
  hot_files: ["src/routes/checkout.ts", "src/routes/refund.ts"]
}
```

### 7.4 `people`

```ts
{
  _id: "people.marcus",
  name: "Marcus",
  team: "platform",
  expertise: ["redis", "rate-limiting"],
  handle: "@marcus"
}
```

### 7.5 `claims`

```ts
{
  _id: "cl_001",
  scope: { entity_id: "services.payments-api/checkout.ts" },
  intent: "refactor transaction handling for new schema",
  agent: "producer",
  active: true,
  outcome: null,
  created_at: 1714666800000
}
```

---

## 8. Ingestion pipeline

Single script: `scripts/ingest.ts`. Runs once at ~13:00 after generation.

```ts
async function ingest() {
  const spec = JSON.parse(fs.readFileSync("seed-spec.json"))
  const slack = JSON.parse(fs.readFileSync("seed-data/slack.json"))
  const prs   = JSON.parse(fs.readFileSync("seed-data/prs.json"))
  const jira  = JSON.parse(fs.readFileSync("seed-data/jira.json"))
  const docs  = JSON.parse(fs.readFileSync("seed-data/docs.json"))
  const code  = JSON.parse(fs.readFileSync("seed-data/code.json"))

  // 1. Write services and people directly from spec
  await db.services.insertMany(spec.services.map(toServiceDoc))
  await db.people.insertMany(spec.people.map(toPersonDoc))

  // 2. Build all artifacts
  const allArtifacts = [
    ...slack.map(toArtifact("slack")),
    ...prs.map(toArtifact("github_pr")),
    ...jira.map(toArtifact("jira_ticket")),
    ...docs.map(toArtifact("docs")),
    ...code.map(toArtifact("code_chunk"))
  ]

  // 3. Tag refs (which entities each artifact mentions) — keyword match
  for (const a of allArtifacts) {
    a.refs = extractRefs(a.content, spec.services, spec.people)
  }

  // 4. Embed in batches of 32 (Voyage limit)
  for (const batch of chunks(allArtifacts, 32)) {
    const vectors = await voyage.embed(batch.map(b => b.content))
    batch.forEach((a, i) => a.embedding = vectors[i])
  }

  // 5. Bulk insert with progress events for the dashboard's empty state
  for (const [source, batch] of [
    ["slack",       slack],
    ["github_pr",   prs],
    ["jira_ticket", jira],
    ["docs",        docs],
    ["code_chunk",  code],
  ] as const) {
    const docs = allArtifacts.filter(a => a.source === source)
    await db.artifacts.insertMany(docs)
    await emitIngestEvent(`ingested ${docs.length} ${source} artifacts`)
  }

  // 6. Verify
  const count = await db.artifacts.countDocuments()
  console.log(`ingested ${count} artifacts`)
  await emitIngestEvent("graph ready")
}

// emitIngestEvent posts to the backend's /internal/event endpoint or
// writes to a transient ingest_events collection that the backend
// Change-Stream-watches and forwards as `ingest.event` SSE messages.
// This populates the dashboard's empty-state activity stream.

---

## 9. Demo reset script

```ts
// scripts/reset-demo.ts
async function resetDemo() {
  await db.working_context.deleteMany({})
  await db.claims.deleteMany({})
  console.log("demo reset — artifacts intact")
}
```

`POST /api/demo/reset` calls this internally.

---

## 10. Verification queries (run after ingest)

After ingest completes, verify the demo will work by running these queries against MongoDB Compass (or the shell):

### 10.1 Counts

```js
db.artifacts.countDocuments()                    // ~225
db.artifacts.countDocuments({source: "slack"})   // ~150
db.services.countDocuments()                     // 4
db.people.countDocuments()                       // 4
```

### 10.2 R1 (rate-limit rule) is retrievable

```js
// Vector search for "rate limit memory leak" should return Marcus's message
const queryVector = await voyage.embed("rate limit memory leak")
db.artifacts.aggregate([
  { $vectorSearch: {
      index: "artifact_vector",
      queryVector,
      path: "embedding",
      numCandidates: 50,
      limit: 5
  }}
])
// → top hit should be Marcus's #platform message about lib/limiter
```

### 10.3 Scope filter works

```js
db.artifacts.aggregate([
  { $vectorSearch: {
      index: "artifact_vector",
      queryVector: <embed("rate limit")>,
      path: "embedding",
      numCandidates: 50,
      limit: 5,
      filter: { refs: "services.payments-api" }
  }}
])
// → returns only payments-api related artifacts
```

### 10.4 Graph traversal

```js
db.services.aggregate([
  { $match: { _id: "services.payments-api" } },
  { $graphLookup: {
      from: "services",
      startWith: "$_id",
      connectFromField: "depends_on",
      connectToField: "_id",
      as: "deps",
      maxDepth: 1
  }}
])
// → should expand to include auth (downstream)
```

If any of these fail, the demo will fail. Fix before 14:00.

---

## 11. Build phases (hour by hour)

| Time | Task |
|------|------|
| 10:30–10:45 | Atlas Sandbox cluster connection verified; create `substrate` DB + 5 collections |
| 10:45–11:00 | **Start vector index builds NOW** (they take 5–10 min); also build standard indexes |
| 11:00–11:30 | Hand-write `seed-spec.json` |
| 11:30–12:30 | Run all 4 generation scripts in parallel; eyeball outputs |
| 12:30–12:45 | Generate code chunks |
| 12:45–13:00 | Quick prompt fixes if any tribal rules are missing |
| 13:00–13:30 | Run `ingest.ts`; verify counts |
| 13:30–14:00 | Run all 4 verification queries (§10); fix any retrieval issues |
| 14:00–15:00 | Help backend team test retrieval against real data; tune any data shape mismatches |
| 15:00–15:30 | Write/test reset script; tune ref-tagging if FE chips appear in wrong places |
| 15:30–17:00 | Standby; rebuild specific artifacts on demand |

**Critical**: vector indexes take time to build on first creation. **Start them at 10:45**, not later.

---

## 12. Things explicitly NOT to build

- ❌ Real Slack/GitHub/Jira API integrations
- ❌ Multi-language support (English only)
- ❌ Time-series of message activity / heatmaps
- ❌ Realistic Slack threading depth (flat with optional `parent_ts` is fine)
- ❌ A working compiled repo (the code is decoration)
- ❌ User auth or RBAC on the data
- ❌ Pagination
- ❌ Test fixtures (the data IS the fixtures)

---

## 13. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Vector index build slow on Atlas | Start FIRST; use simpler index initially if needed |
| Voyage rate limit hit | Batch in groups of 32 (their max); throttle to 1 batch/sec |
| Claude rate limits during generation | Run scripts sequentially if hitting limits; reduce parallelism |
| LLM-generated data drifts from seed spec | Use Claude's structured output mode; verify with grep for tribal rule keywords |
| Atlas Sandbox storage cap | Stay under M0/M2 limits (512MB / 2GB); 225 artifacts × 1024-dim float64 = ~2MB |
| Refs tagged incorrectly | Improve keyword matcher; for demo, hardcode refs on the 5–10 critical artifacts that scenes depend on |
| Ingestion script fails halfway | Idempotent: use `_id: hash(content)` so re-runs upsert |

---

## 14. Hand-off contract to backend (Person B)

Tell B these names so they can match in queries:

| What | Value |
|------|-------|
| DB name | `substrate` |
| Collections | `artifacts`, `working_context`, `services`, `people`, `claims` |
| Vector index on artifacts | `artifact_vector` on path `embedding` |
| Vector index on working_context | `wc_vector` on path `embedding` |
| Embedding dim | 1024 |
| Embedding model | `voyage-3` |
| Service ID format | `services.payments-api` |
| Person ID format | `people.marcus` |
| File ID format | `services.payments-api/checkout.ts` |
| Reference tagging field | `artifacts.refs` (multikey, array of EntityId) |

### Files exposed to the dashboard

The frontend renders **files as nodes nested inside their parent service**. A serves files via `GET /api/seed`'s response, derived from each service's `hot_files`:

```ts
// in /api/seed response
files: [
  { id: "services.payments-api/checkout.ts",  service: "services.payments-api",  path: "src/routes/checkout.ts" },
  { id: "services.payments-api/refund.ts",    service: "services.payments-api",  path: "src/routes/refund.ts" },
  { id: "services.mobile-app/CheckoutForm.tsx", service: "services.mobile-app", path: "src/checkout/CheckoutForm.tsx" },
  // ... derived from spec.services[].hot_files
]
```

### Ingest events for activity stream

The ingestion pipeline emits `ingest.event` SSE messages (one per source batch) so the dashboard's empty-state activity stream is populated on first load. These events do not represent agent activity; they're derived from the ingest progress (see §8 step 5).

---

## 15. Things to confirm tonight (no code, accounts only)

- [ ] Atlas Sandbox cluster link from email is valid; can log in
- [ ] Voyage AI API key obtained; test endpoint works
- [ ] Read MongoDB Atlas Vector Search docs (the `$vectorSearch` aggregation stage)
- [ ] Read MongoDB `$graphLookup` docs
- [ ] Confirm Voyage `voyage-3` is the recommended model (1024 dim)
- [ ] Local: Node 20, MongoDB Compass installed, can connect to Atlas

That's all. **No data, no spec, no scripts written tonight.**
