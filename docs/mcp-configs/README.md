# Claude Code MCP configs for Substrate

The Substrate demo runs **two Claude Code instances side-by-side** — one as the *Producer* agent, one as the *Consumer* agent. Each connects to the local backend via HTTP MCP, with the agent identity baked into the URL path.

## Setup (each teammate, on the demo laptop)

Create two empty working directories and drop the matching `.mcp.json` into each:

```bash
mkdir -p ~/substrate-producer ~/substrate-consumer

# Copy the configs from this directory
cp <repo>/docs/mcp-configs/producer.mcp.json ~/substrate-producer/.mcp.json
cp <repo>/docs/mcp-configs/consumer.mcp.json ~/substrate-consumer/.mcp.json
```

## Run

In two separate terminals (the backend must already be running on `:3000`):

```bash
# Terminal 1 — Producer
cd ~/substrate-producer
claude

# Terminal 2 — Consumer
cd ~/substrate-consumer
claude
```

Inside each Claude Code session, type `/mcp` — `substrate` should show as connected.

## Why the URL path encodes identity

The backend's MCP HTTP transport mounts at `/mcp/producer` and `/mcp/consumer`. On every tool call, the path segment is read out and stamped onto:

- `working_context.author` (so chips render in the correct agent color)
- `claims.agent` (claim ownership tracking)
- `agent.activity` SSE events (so the dashboard's activity stream knows who did what)

This means **two MCP clients hitting two different paths share one backend process** — no separate processes per agent, no env-var juggling.

## Stdio fallback (if HTTP transport flakes)

If you see `[Failed to parse]` or connection drops, swap to stdio:

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

Backend must have `npm run build` been run first so `dist/mcp-stdio.js` exists.

## Verify the wiring works

Once both Claude Code sessions report `substrate` connected, paste this prompt into the **Producer** session:

```
Use the substrate MCP tools. Write a draft schema entry for the payments-api transaction object — fields: tx_id (string), amount (number), currency (string), status (pending|complete|failed). Use type=draft_schema.
```

A blue **Draft** chip should appear on the **payments-api** node in the dashboard within ~2 seconds.
