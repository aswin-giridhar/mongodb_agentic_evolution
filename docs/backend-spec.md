# Substrate — Backend, MCP & Agent Integration Spec

> Hackathon: MongoDB Agentic Evolution Hackathon · Saturday May 2, 2026
> Owners: Person B (MCP server, retrieval, SSE) + Person C (Claude Code instance setup, prompt templates, demo rehearsal)
> Build window: 10:30 AM – 5:00 PM
>
> **The demo is driven by typing prompts into two real Claude Code instances.** There are no scripted scenes. Every MCP tool invocation is a real call from a live agent.

---

## 1. Purpose

The backend hosts the MCP server, retrieval pipeline, and SSE feed. It does five things:

1. Hosts the MCP server (5 tools), exposed over HTTP at two endpoints (one per agent identity)
2. Runs the Resolver (Bedrock Haiku) to tag writes with entity IDs
3. Executes the retrieval pipeline (`$graphLookup` + Vector Search in one aggregation)
4. Bridges MongoDB Change Streams + tool-call events → SSE for the dashboard
5. Provides a reset endpoint for between-rehearsal cleanup

**Single Node process. Runs locally on the demo laptop.** No Dockerfile, no App Runner.

AWS-as-core is satisfied via **Bedrock** (Resolver, on every write) + **S3** (synthetic dataset hosted there during ingest).

---

## 2. Tech stack

| Layer | Choice |
|------|--------|
| Runtime | Node 20, TypeScript |
| Web framework | Express |
| MCP | `@modelcontextprotocol/sdk` (TS) — **HTTP transport** |
| MongoDB | `mongodb` driver v6+ |
| LLM (resolver) | `@aws-sdk/client-bedrock-runtime` → `claude-haiku-4-5` |
| Embeddings | `voyageai` SDK → `voyage-3` (1024 dim) |
| Tracing | LangSmith on Resolver path (optional, sponsor credit) |
| Host | **Local** — `npm run dev` on the demo laptop |

If Claude Code's HTTP MCP transport proves unreliable on the day, fall back to **stdio MCP** with two `.mcp.json` files using an `AGENT_NAME` env var. See §8.6.

---

## 3. Project structure

```
substrate-backend/
├── src/
│   ├── index.ts                 # express app + MCP HTTP transport mount
│   ├── mcp/
│   │   ├── server.ts            # MCP server (HTTP), two endpoints
│   │   ├── tools.ts             # 5 tools, agent stamped from URL path / env
│   │   └── resolver.ts          # Bedrock Haiku call
│   ├── db/
│   │   ├── client.ts
│   │   ├── retrieval.ts         # $graphLookup + $vectorSearch pipeline
│   │   └── changeStream.ts      # Mongo change stream → event bus
│   ├── api/
│   │   ├── stream.ts            # GET /api/stream (SSE)
│   │   ├── seed.ts              # GET /api/seed
│   │   └── demo.ts              # POST /api/demo/reset
│   ├── embed/voyage.ts
│   └── lib/
│       ├── env.ts               # zod-validated env vars
│       └── eventBus.ts          # in-memory bus (Change Stream + tool calls → SSE)
├── prompts/                     # PERSON C territory
│   ├── producer-cheatsheet.md   # exact prompts that drive each hero moment
│   └── consumer-cheatsheet.md
├── mcp-configs/                 # PERSON C — .mcp.json per Claude Code instance
│   ├── producer.mcp.json
│   └── consumer.mcp.json
└── package.json
```

No Dockerfile, no apprunner.yaml, no `agents/scenes/`. The demo is not scripted.

---

## 4. MCP Tools

All 5 tools registered in `src/mcp/tools.ts`. Use Zod for schemas.

**Agent identity** is read on every tool call from the request context (URL path or env var, depending on transport). The identity (`producer` or `consumer`) is stamped onto every write and every emitted event.

### 4.1 `read_context`

```ts
input:  { query: string, scope?: EntityId }
output: { entries: WorkingContextEntry[], grounding: Artifact[] }
```

Flow:
1. If `scope` provided, use as seed entity. Else: Resolver(query) → seed entity.
2. `$graphLookup`: 1 hop on `services.depends_on` ∪ `services.consumed_by` → expand entity set
3. Voyage embed query
4. `$vectorSearch` on `working_context` filtered by `scope.entity_id ∈ entitySet`, `active: true`
5. Parallel `$vectorSearch` on `artifacts` (grounding) — same scope filter
6. Rerank: `working_context` > `artifacts`; recent supersedes > older
7. **Emit SSE event** `agent.activity` with `{ agent, action: "read_context", query, scope, resolved_entities, returned_ids }` — drives the FE read-path highlighting
8. **For each artifact returned**, emit `artifact.referenced` so the FE can transition to Grounded view
9. Return top 5 of each

### 4.2 `write_context`

```ts
input:  { type: WorkingContextType, content: string, supersedes?: string, refs?: string[] }
output: { id: string }
```

Flow:
1. `Resolver(content)` → `entity_id`
2. `voyage.embed(content)`
3. If `supersedes`: update old entry `{ active: false, superseded_by: newId }`
4. Insert new entry `{ ..., active: true, scope: { entity_id }, embedding, author: agent, created_at }`
5. **Mongo Change Stream** emits → SSE `working_context.created` (and `working_context.superseded` if applicable)
6. **Also emit** `agent.activity` for the activity stream row

### 4.3 `claim`

```ts
input:  { scope: EntityId | FileId, intent: string }
output: { claim_id: string, conflicts?: ClaimEntry[] }
```

Flow:
1. Find existing active claims on same scope
2. **If conflict**: return existing claim + conflicts; **emit `working_context.claim_conflict`** with `{ scope, attempting_agent, holding_agent, intent }` — drives the red-flash demo moment
3. **If no conflict**: insert claim doc, emit `working_context.claim_activated`
4. Emit `agent.activity` row

### 4.4 `release`

```ts
input:  { claim_id: string, outcome: string }
output: { ok: true }
```

Flow: mark claim `active: false`, append outcome. Emit `working_context.claim_released` + `agent.activity`.

### 4.5 `list_open_questions`

```ts
input:  { scope?: EntityId }
output: { questions: WorkingContextEntry[] }
```

Flow: query `find({ type: "open_question", active: true, ...(scope ? {"scope.entity_id": scope} : {}) })` + emit `agent.activity`.

---

## 5. Resolver

Single Bedrock call. Claude Haiku 4.5. Cache by content hash.

System prompt:

```
You are Substrate's entity resolver. Given free-text content from an
engineering agent, return strict JSON with the most likely entity_id.

Available services: <list of service ids>
Available people:   <list of person ids>

Rules:
- Choose the most specific entity. Prefer service over person if both apply.
- If genuinely ambiguous, pick the service most often mentioned.
- Never invent an entity_id.

Output: {"entity_id": "services.payments-api", "confidence": 0.0-1.0}
```

```ts
async function resolve(content: string): Promise<EntityId> {
  const cached = cache.get(hash(content))
  if (cached) return cached
  const result = await bedrock.invoke({
    modelId: "anthropic.claude-haiku-4-5",
    system: SYSTEM,
    messages: [{ role: "user", content }],
    maxTokens: 100,
    responseFormat: "json"
  })
  const parsed = JSON.parse(result.content)
  cache.set(hash(content), parsed.entity_id)
  return parsed.entity_id
}
```

~$0.001 per call. Cache aggressively. Pre-warm with the 4 service IDs and 4 person IDs at startup.

---

## 6. Retrieval pipeline

**This is the MongoDB story for the pitch.** Single aggregation. Mention it on stage.

```ts
const pipeline = [
  // 1. Start at seed entity
  { $match: { _id: seedEntityId } },

  // 2. Walk dependency graph 1 hop (both directions)
  { $graphLookup: {
      from: "services",
      startWith: "$_id",
      connectFromField: "depends_on",
      connectToField: "_id",
      as: "downstream",
      maxDepth: 1
  }},
  { $graphLookup: {
      from: "services",
      startWith: "$_id",
      connectFromField: "consumed_by",
      connectToField: "_id",
      as: "upstream",
      maxDepth: 1
  }},

  // 3. Build full entity set
  { $project: {
      entitySet: {
        $concatArrays: [
          ["$_id"],
          { $map: { input: "$downstream", as: "d", in: "$$d._id" } },
          { $map: { input: "$upstream", as: "u", in: "$$u._id" } }
        ]
      }
  }},

  // 4. Vector search filtered to entity set
  { $lookup: {
      from: "working_context",
      let: { es: "$entitySet" },
      pipeline: [
        { $vectorSearch: {
            index: "wc_vector",
            queryVector: queryEmbedding,
            path: "embedding",
            numCandidates: 100,
            limit: 10,
            filter: {
              "scope.entity_id": { $in: "$$es" },
              active: true
            }
        }}
      ],
      as: "results"
  }}
]
```

Run a parallel pipeline against `artifacts` for grounding.

Merge + rerank in JS:
- working_context > artifacts (priority class)
- within class: vector score × 0.7 + recency × 0.3

**The set of entities walked by `$graphLookup` is included in the `agent.activity` event** so the FE can highlight the retrieval path.

---

## 7. SSE event surface (backend → dashboard)

`GET /api/stream` → `text/event-stream`. Heartbeat every 15s.

| Event | Source | Payload (high level) |
|------|--------|----------------------|
| `working_context.created` | Mongo Change Stream | full document |
| `working_context.superseded` | Mongo Change Stream (active=false update) | `{ id, superseded_by }` |
| `working_context.claim_activated` | claim handler | `ClaimEntry` |
| `working_context.claim_released` | release handler | `{ claim_id, outcome }` |
| `working_context.claim_conflict` | claim handler (when conflict returned) | `{ scope, attempting_agent, holding_agent, intent }` |
| `agent.activity` | every tool handler | `{ agent, action, scope, resolved_entities?, returned_ids?, summary, ts }` |
| `artifact.referenced` | read_context handler | `{ artifact_id, by_agent, scope }` |
| `ingest.event` | ingest script | `{ summary, ts }` (used for empty state) |
| `mcp.connected` / `mcp.disconnected` | MCP transport | `{ agent, connected }` |
| `ping` | server timer | `{}` (heartbeat) |

```ts
// inside src/api/stream.ts
const changeStream = db.collection("working_context").watch([], {
  fullDocument: "updateLookup"
})

changeStream.on("change", (change) => {
  switch (change.operationType) {
    case "insert":
      send("working_context.created", change.fullDocument)
      break
    case "update":
      const fields = change.updateDescription.updatedFields
      if (fields.active === false) {
        send("working_context.superseded", {
          id: change.documentKey._id,
          superseded_by: fields.superseded_by
        })
      }
      break
  }
})

eventBus.on("event", (e) => send(e.type, e.payload))
```

---

## 8. Agent integration (replaces "scene choreography")

### 8.1 Two real Claude Code instances

The demo runs **two Claude Code instances side-by-side on the demo laptop**. Each is one MCP client connected to the local backend. The operator types prompts into them; their LLM reasoning decides which MCP tools to call.

**There is no scripted choreography.** The agents are live.

This is riskier than scripts but more impressive — judges see actual emergent agent behavior. Mitigated by tight prompt cheatsheets and rehearsal (Person C's deliverables).

### 8.2 Producer `.mcp.json`

```json
{
  "mcpServers": {
    "substrate": {
      "url": "http://localhost:3000/mcp/producer"
    }
  }
}
```

### 8.3 Consumer `.mcp.json`

```json
{
  "mcpServers": {
    "substrate": {
      "url": "http://localhost:3000/mcp/consumer"
    }
  }
}
```

### 8.4 Identity stamping

Backend reads agent name from URL path on every MCP request:

```
POST /mcp/:agent/...   →   ctx.agent = req.params.agent  // "producer" or "consumer"
```

This gets stamped onto:
- `author` field on `working_context` writes
- `agent` field on `claims`
- `agent` field on every emitted SSE event

### 8.5 Person C deliverables

- **Two `.mcp.json` files** configured and tested with two Claude Code instances pointing at `localhost:3000/mcp/producer` and `/mcp/consumer`
- **Prompt cheatsheets** (`prompts/producer-cheatsheet.md` and `consumer-cheatsheet.md`) — the exact prompts to type to drive each hero moment, with notes on what tool calls should result
- **Verification runs**: real Claude Code → MCP → expected tool sequence, tested ≥3× per hero moment
- **Rehearsal lead**: coordinate FE/BE timing during run-throughs; tune prompts if agent goes off-script

### 8.6 Stdio fallback (if HTTP MCP doesn't work)

If Claude Code's HTTP MCP transport is flaky, fall back to stdio:

```json
{
  "mcpServers": {
    "substrate": {
      "command": "node",
      "args": ["/path/to/substrate-backend/dist/mcp-stdio.js"],
      "env": {
        "AGENT_NAME": "producer"
      }
    }
  }
}
```

Backend exports a separate `mcp-stdio.js` entrypoint for this case, reading `AGENT_NAME` from env. Document this in Person B's morning checklist as Plan B.

### 8.7 Why agents are real, not scripted

The pitch wants to show "agents working through shared state." Scripted scenes can simulate this but a live judge can tell the difference. With real Claude Code instances:
- Tool call timing reflects actual LLM reasoning (visible thinking pauses)
- The agent's natural language responses appear on the laptop screen alongside the dashboard's reactions
- One careful prompt produces correct behavior; if it doesn't, the rehearsal catches it
- Closer to the YC RFS framing of "shared substrate for AI agents"

---

## 9. Endpoints summary

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/seed` | Static services + files + people + graph layout for FE |
| GET | `/api/stream` | SSE feed |
| POST | `/api/demo/reset` | Wipe `working_context` + `claims`; emit `reset` event |
| GET | `/healthz` | Health check |
| ALL | `/mcp/producer/*` | MCP HTTP transport for Producer Claude Code |
| ALL | `/mcp/consumer/*` | MCP HTTP transport for Consumer Claude Code |

CORS: `Access-Control-Allow-Origin: http://localhost:3001` (dashboard's port). Locally only — no public exposure.

---

## 10. Local run

```bash
cp .env.example .env       # fill in Atlas URI, AWS creds, Voyage key
npm install
npm run dev                # starts on :3000
```

That's it. No Dockerfile. No App Runner. No deploy step.

---

## 11. Environment variables

```env
# MongoDB
MONGODB_URI=mongodb+srv://...
MONGODB_DB=substrate

# AWS / Bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_MODEL_RESOLVER=anthropic.claude-haiku-4-5

# Voyage embeddings
VOYAGE_API_KEY=...
VOYAGE_MODEL=voyage-3

# Optional: dataset loading from S3
DATASET_S3_URI=s3://substrate-demo/acme-robotics/

# LangSmith tracing (optional)
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=substrate-hackathon

# Server
PORT=3000
ALLOWED_ORIGINS=http://localhost:3001
```

Use `zod` to validate at boot. Fail fast if missing.

---

## 12. Build phases (hour by hour)

### Person B — Backend / MCP

| Time | Task |
|------|------|
| 10:30–11:00 | Scaffold Express + MCP HTTP server skeleton; connect to Atlas |
| 11:00–11:30 | Stub `/api/seed`, `/api/stream` heartbeat — unblock FE |
| 11:30–12:30 | `write_context` + `read_context` with agent stamping; basic SSE event emission |
| 12:30–13:30 | Voyage embed; Resolver via Bedrock; full retrieval pipeline |
| 13:30–14:00 | Mongo Change Streams → SSE bridge; FE receives `working_context.created` |
| 14:00–14:30 | `claim`, `release`, `list_open_questions` + claim_conflict event |
| 14:30–15:00 | `artifact.referenced` emission inside read_context; tune `agent.activity` payload for FE read-path |
| 15:00–15:30 | Stdio fallback entrypoint (`dist/mcp-stdio.js`) prepared as Plan B |
| 15:30–17:00 | Standby for rehearsal fires |

### Person C — Claude Code instances + prompts

| Time | Task |
|------|------|
| 10:30–11:30 | Read MCP HTTP transport + Claude Code MCP config docs; spec out the two `.mcp.json` files |
| 11:30–12:30 | Set up two Claude Code instances on the demo laptop, each in its own working dir, each with own `.mcp.json` pointing at backend (use stub backend) |
| 12:30–13:30 | Once backend has `write_context` + `read_context`, draft `producer-cheatsheet.md` for Hero 1 (schema convergence) |
| 13:30–14:30 | Test Hero 1 end-to-end with real Claude Code instances; tune prompts until the right tool sequence fires reliably |
| 14:30–15:00 | Hero 2 prompts (supersede + grounding); test |
| 15:00–15:30 | Hero 3 prompts (claim collision); test |
| 15:30–17:00 | Rehearsal lead — run through full demo with FE + BE; tune timing |

**Critical sync**: B and C must agree on agent identity mechanism (URL path vs env var) by 11:00.

---

## 13. Things explicitly NOT to build

- ❌ Authentication (it's local on demo laptop)
- ❌ AWS App Runner deploy
- ❌ Dockerfile
- ❌ Scripted scenes / scene endpoints
- ❌ LangGraph agent definitions (Claude Code IS the agent)
- ❌ MCP "in-process" wrapper (Claude Code talks over the network)
- ❌ Multi-tenancy / user accounts
- ❌ Friendly error pages
- ❌ Rate limiting

---

## 14. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Bedrock model access not approved | Anthropic API direct as fallback (set `BEDROCK_MODEL_RESOLVER=fallback` flag); weakens AWS-as-core story but preserves demo |
| Live Claude Code agent goes off-script during demo | Tight prompt cheatsheets; rehearse 5+ times; backup prompts; have the operator (Person C) ready to type recovery prompts |
| Claude Code HTTP MCP transport flaky | Stdio fallback (§8.6) tested before 16:00 |
| Vector index still building when demo starts | Build indexes EARLIEST (10:45); Person A starts that immediately |
| Mongo Change Stream not firing | Verify on Atlas tier (most tiers support it); fallback: poll on read paths |
| Backend crashes during demo | Run via `npm run dev` (auto-restart); if that fails, `node dist/index.js` in a `while true` loop |
| Two Claude Code sessions auth-collide | Run each in its own working directory; verify before rehearsal |
| Resolver returns wrong entity_id during live run | Cache + hardcoded entity hints in system prompt; pre-warm cache with the 4 services + 4 people |
| Demo laptop loses Wi-Fi (Atlas unreachable) | Phone hotspot ready; pre-warm hot data so Atlas hit count is minimal during demo |

---

## 15. Pitch ammunition

- "The agents are real Claude Code instances — we're not scripting tool calls. The substrate is the only thing in the room making the convergence happen."
- "Single MongoDB aggregation: `$graphLookup` walks the dependency graph, then `$vectorSearch` finds relevant context filtered by the resolved entities."
- "Change Streams power the live UI — every agent write surfaces in the dashboard within 100ms."
- "MCP-first means any agent — Claude Code, Cursor, Copilot — connects natively. We're not the agent; we're the substrate."
- "AWS Bedrock with Haiku runs the entity resolver on every write. High-volume AWS dependency, not a checkbox."

---

## 16. Verification before integration handoff

- [ ] `curl -N http://localhost:3000/api/stream` shows heartbeats every 15s
- [ ] `curl -X POST http://localhost:3000/api/demo/reset` → FE state clears
- [ ] Producer Claude Code, prompted "draft the transaction schema for payments-api", makes a `write_context` call within 10s
- [ ] Consumer Claude Code, prompted "what does the payments-api transaction look like", makes a `read_context` call and surfaces the producer's draft
- [ ] FE receives `working_context.created`, `agent.activity`, `artifact.referenced` events at the right moments
- [ ] Stdio fallback entrypoint works end-to-end (rehearsed at 15:00)
