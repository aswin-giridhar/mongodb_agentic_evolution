# Substrate Backend

> MongoDB Agentic Evolution Hackathon · Saturday May 2, 2026

The backend hosts the Substrate MCP server (5 tools), the retrieval pipeline (`$graphLookup` + Vector Search), and the SSE bridge that powers the live dashboard. Designed to run **locally** on the demo laptop alongside the frontend and two Claude Code instances.

See [`../docs/backend-spec.md`](../docs/backend-spec.md) for the full design.

## Quick start

```bash
cp .env.example .env
# fill in MONGODB_URI, AWS creds, VOYAGE_API_KEY

npm install
npm run dev      # starts on http://localhost:3000
```

Endpoints:

```
GET  /healthz
GET  /api/seed              # services + files + people + graph layout
GET  /api/stream            # SSE feed for the dashboard
POST /api/demo/reset        # wipe working_context + claims
ALL  /mcp/producer          # MCP HTTP transport for Producer Claude Code
ALL  /mcp/consumer          # MCP HTTP transport for Consumer Claude Code
```

## Connect a Claude Code instance

In a fresh working directory, drop a `.mcp.json`:

```json
{
  "mcpServers": {
    "substrate": {
      "url": "http://localhost:3000/mcp/producer"
    }
  }
}
```

Use `/mcp/consumer` for the consumer instance.

### Stdio fallback

If HTTP transport flakes, switch the `.mcp.json`:

```json
{
  "mcpServers": {
    "substrate": {
      "command": "node",
      "args": ["/absolute/path/to/backend/dist/mcp-stdio.js"],
      "env": { "AGENT_NAME": "producer" }
    }
  }
}
```

You'll need to keep the main `npm run dev` running in parallel — the dashboard's SSE pipeline still flows through it.

## Verify

After `npm run dev`:

```bash
curl http://localhost:3000/healthz
curl http://localhost:3000/api/seed | jq .services
curl -N http://localhost:3000/api/stream  # heartbeats every 15s
curl -X POST http://localhost:3000/api/demo/reset
```

## Project layout

```
src/
├── index.ts                 # express app + MCP HTTP mount
├── mcp-stdio.ts             # stdio fallback entrypoint
├── lib/
│   ├── env.ts               # zod-validated env
│   ├── eventBus.ts          # in-memory event bus
│   └── types.ts             # shared types (mirrors integration-contract.md)
├── db/
│   ├── client.ts            # mongo client + collection refs
│   ├── retrieval.ts         # $graphLookup + $vectorSearch pipeline
│   └── changeStream.ts      # change stream → event bus
├── api/
│   ├── seed.ts              # GET /api/seed
│   ├── stream.ts            # GET /api/stream (SSE)
│   └── demo.ts              # POST /api/demo/reset
├── embed/
│   └── voyage.ts            # Voyage AI embedding client
└── mcp/
    ├── server.ts            # MCP server factory (one per agent)
    ├── tools.ts             # 5 tool implementations
    └── resolver.ts          # Bedrock Haiku entity resolver
```
