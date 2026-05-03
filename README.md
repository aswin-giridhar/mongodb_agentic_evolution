# Substrate

> A shared context layer for AI agents working on engineering projects — the missing substrate for work-in-flight knowledge that doesn't yet live in GitHub, Jira, or Slack.

Built for the **MongoDB Agentic Evolution Hackathon** · Saturday May 2, 2026.

## What it is

Agents working on a shared codebase have no way to share in-flight context with each other. Drafted API specs, active design decisions, ongoing investigations, and provisional contracts between services all live in someone's head or an unsaved buffer. Static rules files (`CLAUDE.md` and similar) can't capture this — it changes too fast and exists on agent timescales, not human ones. The result: agents working in parallel diverge, duplicate work, and rediscover rejected approaches.

Substrate is a **writeable shared memory layer** that two (or more) AI agents read from and write to as they work. Agents draft specs, log decisions, claim ownership of in-progress work, and surface open questions — all in a shared substrate that any other agent can query.

## How it works

- **MongoDB Atlas** as the substrate: 5 collections (`artifacts`, `working_context`, `services`, `people`, `claims`)
- **MCP server** exposes 5 tools (`read_context`, `write_context`, `claim`, `release`, `list_open_questions`) so any MCP client (Claude Code, Cursor) connects natively
- **`$graphLookup` + Vector Search** in a single MongoDB aggregation pipeline routes retrieval through the org/code dependency graph
- **Voyage AI** embeddings; **AWS Bedrock** (Claude Haiku) for entity resolution
- **Live dashboard** projects the memory layer as a unified graph; auto-progressive disclosure (Structure → Activity → Grounded views)

The demo runs **two real Claude Code instances** side-by-side; the dashboard makes their otherwise-invisible MCP traffic visible to the room.

## Hackathon themes hit

- **Multi-agent collaboration** *(primary)* — agents writing/reading shared state via MCP, claim/release for coordination, supersedes-chain
- **Prolonged coordination** — supersedes-chain across hours; MongoDB persists through restarts; TTL + outcome logging
- **Adaptive retrieval** — `$graphLookup` + vector hybrid; scope-routed retrieval differs per query type

## Project structure

```
substrate/
├── backend/          # Node/Express MCP server + retrieval pipeline
├── frontend/         # Next.js dashboard with live graph visualization
├── dataset/          # Synthetic data generator for Acme Robotics
└── docs/             # Planning specs
```

### Quick start

1. **Generate synthetic data** (optional - for demo):
   ```bash
   cd dataset
   npm install
   cp .env.example .env  # add MONGODB_URI, VOYAGE_API_KEY
   npm run build
   npm run generate:all
   npm run ingest
   ```

2. **Start backend**:
   ```bash
   cd backend
   npm install
   cp .env.example .env  # add credentials
   npm run dev  # http://localhost:3000
   ```

3. **Start frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev  # http://localhost:3001
   ```

4. **Connect Claude Code instances**:
   - Create `.mcp.json` in two separate directories
   - Point one to `http://localhost:3000/mcp/producer`
   - Point the other to `http://localhost:3000/mcp/consumer`

## Project docs

Planning specs in [`docs/`](./docs):

- [`docs/integration-contract.md`](./docs/integration-contract.md) — single source of truth for cross-cutting interfaces
- [`docs/frontend-spec.md`](./docs/frontend-spec.md) — visualization dashboard (Next.js + react-flow)
- [`docs/backend-spec.md`](./docs/backend-spec.md) — MCP server, retrieval pipeline, agent integration
- [`docs/dataset-spec.md`](./docs/dataset-spec.md) — synthetic dataset and MongoDB Atlas setup
- [`docs/pre-event-checklist.md`](./docs/pre-event-checklist.md) — environment setup checklist

Implementation READMEs:
- [`backend/README.md`](./backend/README.md) — backend setup and MCP configuration
- [`frontend/README.md`](./frontend/README.md) — dashboard setup
- [`dataset/README.md`](./dataset/README.md) — data generation pipeline

## Lovable design (`holo-trace-sight/`, on `nicole_frontend` branch)

The `nicole_frontend` branch contains an alternative frontend design generated in [Lovable](https://lovable.dev), imported as a git subtree from https://github.com/NicoleJiang133/holo-trace-sight.

To pull the latest Lovable iteration into this repo:

```bash
git remote add lovable https://github.com/NicoleJiang133/holo-trace-sight.git  # one-time
git fetch lovable
git checkout nicole_frontend
git subtree pull --prefix=holo-trace-sight lovable main --squash
git push origin nicole_frontend
```

Edit the design in Lovable, not directly in `holo-trace-sight/`, to avoid merge conflicts.

## Team

- Aswin (data + MongoDB)
- Mohammed (frontend + dashboard)
- *(plus 2 teammates per hackathon team-of-4 cap)*

## Status

🛠️ Build day. This README will get richer as we ship.
