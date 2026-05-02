# Substrate — Integration Contract

> Single source of truth for cross-cutting interfaces between Persons A, B, C, D.
> If you change anything in this doc, ping the team. Implementation details live in each role's spec.

---

## 1. Roles & boundaries

| Person | Owns | Consumes |
|--------|------|----------|
| A — Data | MongoDB collections, vector indexes, synthetic dataset, ingestion | — |
| B — Backend | MCP HTTP server, retrieval pipeline, SSE bridge, demo endpoints | A's collections + indexes |
| C — Agents | Two Claude Code instances configured + prompt cheatsheets + rehearsal | B's HTTP MCP endpoints |
| D — Frontend | Dashboard (visualization-only), activity stream, video | B's HTTP + SSE endpoints |

**No scripted scenes.** The demo is driven by typing prompts into two real Claude Code instances. Agents are live LLM clients; backend is reactive.

---

## 2. Naming conventions (locked at 10:30 AM, never change)

### EntityId / FileId format

```
services.{name}                     e.g., services.payments-api
people.{handle}                     e.g., people.marcus
services.{name}/{file_path}         e.g., services.payments-api/checkout.ts
```

### Collection names

```
artifacts          working_context          services
people             claims
```

### Vector index names

```
artifact_vector      → on artifacts.embedding
wc_vector            → on working_context.embedding
```

### Embedding model + dimension

```
Model:     voyage-3
Dim:       1024
Similarity: cosine
```

### Channel names (slack)

```
#platform   #payments   #mobile   #incidents   #random
```

### Agent identifiers

```
producer   consumer
```

These are stamped onto every write and every emitted event.

---

## 3. Shared TypeScript types

Define once in `shared/types.ts`. Referenced by all three TS codebases.

```ts
export type EntityId = string                // "services.payments-api"
export type FileId   = string                // "services.payments-api/checkout.ts"
export type Agent    = "producer" | "consumer"

export type WorkingContextType =
  | "draft_schema"
  | "decision"
  | "claim"
  | "investigation"
  | "open_question"

export type Service = {
  _id: EntityId
  name: string
  owner_team: string
  depends_on: EntityId[]
  consumed_by: EntityId[]
  hot_files: string[]
}

export type File = {
  id: FileId
  service: EntityId
  path: string                       // "src/routes/checkout.ts"
}

export type Person = {
  _id: EntityId
  name: string
  team: string
  expertise: string[]
  handle: string
}

export type Artifact = {
  _id: string                        // "slack:abc123"
  source: "slack" | "github_pr" | "jira_ticket" | "docs" | "code_chunk"
  channel?: string
  author?: string
  content: string
  preview?: string                   // short label for the FE node
  embedding: number[]                // 1024 floats
  refs: EntityId[]
  metadata?: Record<string, unknown>
  created_at: number
}

export type WorkingContextEntry = {
  _id: string                        // "wc_001"
  type: WorkingContextType
  author: Agent
  scope: { entity_id: EntityId | FileId }
  content: string
  embedding: number[]
  supersedes: string | null
  superseded_by: string | null
  refs: string[]                     // artifact ids
  active: boolean
  created_at: number
}

export type ClaimEntry = {
  _id: string                        // "cl_001"
  scope: { entity_id: EntityId | FileId }
  intent: string
  agent: Agent
  active: boolean
  outcome: string | null
  created_at: number
}

export type ActivityEvent = {
  id: string
  ts: number
  agent?: Agent                      // omit for ingest/reset
  action: "read_context" | "write_context" | "claim" | "release"
        | "list_open_questions" | "ingest" | "reset"
  scope?: EntityId | FileId
  resolved_entities?: (EntityId | FileId)[]   // for read-path highlighting
  returned_ids?: string[]                     // wc ids returned by reads
  summary: string
  refs: string[]                              // for click-to-focus
}
```

---

## 4. HTTP endpoints

Backend runs locally. Base URL: `http://localhost:3000`.

### `GET /api/seed`

Returns static graph data for FE bootstrap.

```ts
Response: {
  services: Service[]
  files: File[]
  people: Person[]
  graph_layout: { id: string; x: number; y: number }[]
}
```

### `GET /api/stream`

SSE feed. See §5.

### `POST /api/demo/reset`

Wipes `working_context` and `claims`. Drops the dashboard view back to Structure.

```ts
Response: { ok: true }
```

### `GET /healthz`

```ts
Response: { ok: true }
```

### `ALL /mcp/producer/*` and `ALL /mcp/consumer/*`

MCP HTTP transport endpoints. Each Claude Code instance points its `.mcp.json` at one of these. Backend reads the `producer`/`consumer` segment from the URL and stamps it as the calling agent's identity on every tool invocation.

### CORS

```
Access-Control-Allow-Origin: http://localhost:3001
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Local-only — no public exposure.

---

## 5. SSE event contract (B → D)

`GET /api/stream`. `Content-Type: text/event-stream`. Heartbeat every 15s.

### `working_context.created`

Emitted on every new entry insert (Mongo Change Stream).

```ts
data: WorkingContextEntry
```

### `working_context.superseded`

```ts
data: { id: string; superseded_by: string }
```

### `working_context.claim_activated`

```ts
data: ClaimEntry
```

### `working_context.claim_released`

```ts
data: { claim_id: string; outcome: string }
```

### `working_context.claim_conflict` *(NEW)*

Emitted when an agent tries to claim a scope already held. Drives the FE red-flash + activity stream "would have collided" badge.

```ts
data: {
  scope: EntityId | FileId
  attempting_agent: Agent
  holding_agent: Agent
  intent: string
  existing_claim_id: string
}
```

### `agent.activity` *(SHAPE CHANGED)*

Emitted from inside every MCP tool handler.

```ts
data: ActivityEvent   // see §3
```

For `read_context`, includes `resolved_entities` and `returned_ids` so the FE can highlight the retrieval path. For `write_context`, includes scope and the new entry id. For `claim` events, includes the resulting claim id.

### `artifact.referenced` *(NEW)*

Emitted when `read_context` returns artifacts as grounding. Triggers the FE Activity → Grounded view transition.

```ts
data: {
  artifact_id: string
  by_agent: Agent
  scope: EntityId | FileId
}
```

### `ingest.event` *(NEW)*

Emitted by the ingest script as artifacts land. Populates the dashboard's empty-state activity stream.

```ts
data: { summary: string; ts: number }
```

### `mcp.connected` / `mcp.disconnected`

```ts
data: { agent: Agent; connected: boolean }
```

### `ping`

Heartbeat, every 15s.

```ts
data: {}
```

### REMOVED events (no longer emitted)

- ❌ `agent.thinking` (Claude Code IDE shows thinking, not the dashboard)
- ❌ `scene.changed` (no scenes)

---

## 6. MCP tool contract

Quick reference. Detail in `backend-spec.md` §4.

```ts
read_context(query: string, scope?: EntityId | FileId)
  → { entries: WorkingContextEntry[], grounding: Artifact[] }

write_context(type: WorkingContextType, content: string,
              supersedes?: string, refs?: string[])
  → { id: string }

claim(scope: EntityId | FileId, intent: string)
  → { claim_id: string, conflicts?: ClaimEntry[] }

release(claim_id: string, outcome: string)
  → { ok: true }

list_open_questions(scope?: EntityId | FileId)
  → { questions: WorkingContextEntry[] }
```

**Agent identity is stamped automatically by the backend** based on the `/mcp/{agent}/*` URL path. C does not pass agent name; it's derived from the connection.

---

## 7. Agent integration (C → B)

Two real Claude Code instances connect via HTTP MCP.

### Producer config (`mcp-configs/producer.mcp.json`)

```json
{
  "mcpServers": {
    "substrate": {
      "url": "http://localhost:3000/mcp/producer"
    }
  }
}
```

### Consumer config (`mcp-configs/consumer.mcp.json`)

```json
{
  "mcpServers": {
    "substrate": {
      "url": "http://localhost:3000/mcp/consumer"
    }
  }
}
```

### Stdio fallback (Plan B)

If HTTP MCP transport is flaky, fall back to stdio:

```json
{
  "mcpServers": {
    "substrate": {
      "command": "node",
      "args": ["/path/to/substrate-backend/dist/mcp-stdio.js"],
      "env": { "AGENT_NAME": "producer" }
    }
  }
}
```

Backend exports `dist/mcp-stdio.js` for this case. Decide HTTP vs stdio by 11:00.

---

## 8. MongoDB collection contract (A → B)

A guarantees by 13:30:

- `services` populated with 4 docs (per `seed-spec.json`)
- `people` populated with 4 docs
- `artifacts` populated with ~225 docs
- All `artifacts` have `embedding` (1024 floats) and `refs` (EntityId array)
- Vector indexes `artifact_vector` and `wc_vector` are **READY**
- Tribal rules R1–R4 retrievable via vector search (per `dataset-spec.md` §10)
- `ingest.event` SSE messages have been emitted to populate the dashboard's empty state activity stream

B can mock against a stub seed before A finishes. At 13:30, B switches to real data.

A also provides a `files` array (derived from `services.hot_files`) in the response to `GET /api/seed`, so the FE can render file nodes nested inside their parent service.

A guarantees these queries return non-empty:

```js
// R1 retrievable via vector search
db.artifacts.aggregate([{ $vectorSearch: {
  index: "artifact_vector",
  queryVector: <embed("rate limit memory leak")>,
  path: "embedding", numCandidates: 50, limit: 5
}}])
// → top hit is Marcus's #platform Slack about lib/limiter

// Scope filter works
db.artifacts.aggregate([{ $vectorSearch: {
  index: "artifact_vector",
  queryVector: <embed("rate limit")>,
  path: "embedding", numCandidates: 50, limit: 5,
  filter: { refs: "services.payments-api" }
}}])

// Graph traversal works
db.services.aggregate([
  { $match: { _id: "services.payments-api" } },
  { $graphLookup: { from: "services", startWith: "$_id",
      connectFromField: "depends_on", connectToField: "_id",
      as: "deps", maxDepth: 1 }}
])
```

---

## 9. Critical sync points (timeline)

| Time | Event | Who | What |
|------|-------|-----|------|
| 10:30 | Naming lock | All | Confirm §2 naming conventions out loud |
| 11:00 | Agent identity mechanism | B + C | HTTP path (`/mcp/{agent}`) vs stdio + env var. Recommend HTTP. |
| 11:30 | FE/BE skeleton integrated | B + D | FE hits `/api/seed` and `/api/stream` heartbeat |
| 12:30 | First real MCP call | B + C | Producer Claude Code calls `write_context` against backend; lands in Mongo |
| 13:00 | Real data ready | A | Hand-off to B; B switches from stub seed to real Mongo queries |
| 13:30 | Verification queries pass | A | All queries in §8 return expected results |
| 14:00 | Hero 1 end-to-end | B + C + D | Real Producer write → real Consumer read → FE chip animates + read-path highlight |
| 15:00 | Heroes 2 + 3 end-to-end | All | All three hero moments reproducible via prompt cheatsheets |
| 15:30 | Feature freeze | All | Polish only |
| 16:00 | Video recording | D | 1-min cut of heroes |
| 16:30 | Submission | All | Repo public, video uploaded, all 4 members on form |

---

## 10. Change log

If anything in this doc changes during the build:

1. Announce in team Discord channel
2. Edit this file directly (it's the source of truth)
3. Tag affected role(s)
4. Fix any stale reference in your own spec

Changes that require this doc:
- Adding/removing an SSE event type
- Changing an EntityId / FileId format
- Renaming a collection
- Changing the embedding dimension
- Changing the agent identity mechanism

---

## 11. One-screen quick reference

```
┌────────────────────────────────────────────────────────────────────┐
│ EntityId:  services.{name}  |  people.{handle}                     │
│ FileId:    services.{name}/{path}                                  │
│ Collections: artifacts, working_context, services, people, claims  │
│ Vector idx: artifact_vector, wc_vector  (1024 dim, cosine)         │
│ Embed:     voyage-3                                                │
│                                                                    │
│ HTTP (localhost:3000):                                             │
│   GET  /api/seed              → bootstrap                          │
│   GET  /api/stream            → SSE                                │
│   POST /api/demo/reset        → wipe                               │
│   ALL  /mcp/producer/*        → MCP for Producer Claude Code       │
│   ALL  /mcp/consumer/*        → MCP for Consumer Claude Code       │
│                                                                    │
│ MCP tools:                                                         │
│   read_context(query, scope?)                                      │
│   write_context(type, content, supersedes?, refs?)                 │
│   claim(scope, intent)                                             │
│   release(claim_id, outcome)                                       │
│   list_open_questions(scope?)                                      │
│                                                                    │
│ SSE events:                                                        │
│   working_context.{created, superseded,                            │
│                    claim_activated, claim_released, claim_conflict}│
│   agent.activity                                                   │
│   artifact.referenced                                              │
│   ingest.event                                                     │
│   mcp.{connected, disconnected}                                    │
└────────────────────────────────────────────────────────────────────┘
```
