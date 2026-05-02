# Substrate Dataset Generator

Synthetic dataset generator for the MongoDB Agentic Evolution Hackathon.

## Overview

This generates realistic engineering data for the fictional company "Acme Robotics" including:
- 150 Slack messages across 5 channels
- 25 Pull Requests
- 15 Jira tickets
- 5 Documentation specs
- 30 Code chunks

## Tribal Rules Encoded

The data encodes 4 tribal rules that the demo's retrieval pipeline surfaces:

1. **R1**: Use `lib/limiter.ts` (redis-backed), not `express-rate-limit` (memory leak)
2. **R2**: Payments API uses `tx_id` field, not `transactionId`
3. **R3**: Mobile checkout uses `useCheckout` hook, not raw fetch
4. **R4**: Auth middleware runs before logging middleware (security)

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `MONGODB_URI` - Your MongoDB Atlas connection string
   - `MONGODB_DB` - Database name (default: `substrate`)
   - `VOYAGE_API_KEY` - Get from [voyageai.com](https://voyageai.com)

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Build
```bash
npm run build
```

### Generate all data
```bash
npm run generate:all
```

This creates:
- `seed-data/slack.json` - 150 Slack messages
- `seed-data/prs.json` - 25 Pull Requests
- `seed-data/jira.json` - 15 Jira tickets
- `seed-data/docs.json` - 5 Documentation specs
- `seed-data/code.json` - 30 Code chunks

### Ingest into MongoDB
```bash
# Dry run (no database writes)
npm run ingest:dry

# Full ingestion
npm run ingest
```

This will:
1. Load all generated data files
2. Generate Voyage embeddings (voyage-3, 1024 dim)
3. Create MongoDB collections:
   - `services` (4 docs)
   - `people` (4 docs)
   - `artifacts` (~225 docs with embeddings)
4. Create vector indexes on `artifacts.embedding` and `working_context.embedding`

### Reset demo data
```bash
npm run reset
```

Clears `working_context` and `claims` collections while keeping artifacts intact.

## Verification

After ingestion, verify in MongoDB Atlas:

```javascript
// Count artifacts
db.artifacts.countDocuments()  // should be ~225

// Test tribal rule R1 retrieval
// (Search for "rate limit memory leak" should return Marcus's message)
db.artifacts.aggregate([
  { $vectorSearch: {
      index: "artifact_vector",
      queryVector: <embed("rate limit memory leak")>,
      path: "embedding",
      numCandidates: 50,
      limit: 5
  }}
])
```

## Project Structure

```
dataset/
├── src/
│   └── lib/
│       ├── types.ts          # TypeScript type definitions
│       └── utils.ts          # Utility functions
├── scripts/
│   ├── gen-slack.ts          # Generate Slack messages
│   ├── gen-prs.ts            # Generate Pull Requests
│   ├── gen-jira.ts           # Generate Jira tickets
│   ├── gen-docs.ts           # Generate documentation
│   ├── gen-code.ts           # Generate code chunks
│   ├── ingest.ts             # Ingestion pipeline
│   └── reset-demo.ts         # Reset script
├── seed-data/
│   ├── seed-spec.json        # Hand-written spec (ONLY edit this)
│   ├── slack.json            # Generated: 150 messages
│   ├── prs.json              # Generated: 25 PRs
│   ├── jira.json             # Generated: 15 tickets
│   ├── docs.json             # Generated: 5 specs
│   └── code.json             # Generated: 30 chunks
├── package.json
├── tsconfig.json
└── README.md
```

## Customization

To modify the generated data, edit `seed-data/seed-spec.json`:

- **services**: Add/remove services and their dependencies
- **people**: Add/remove team members
- **tribal_rules**: Modify or add tribal knowledge rules
- **story_arcs**: Add narrative beats for the LLM to weave through data

Then regenerate:
```bash
npm run generate:all
npm run ingest
```

## Requirements

- Node 20+
- MongoDB Atlas cluster with vector search enabled
- Voyage AI API key
- Bedrock access (for resolver in backend, not used here)

## Troubleshooting

**MongoDB Authentication Failed**
- Go to Atlas → Database Access
- Verify user exists and password is correct
- Check IP whitelist (add 0.0.0.0/0 for hackathon)

**Voyage Rate Limit**
- Batch size is already limited to 32 (Voyage max)
- If hitting limits, the script automatically throttles

**Vector Index Not Ready**
- Indexes take 5-10 minutes to build
- Run ingestion after indexes are ready
- Check Atlas → Collections → Indexes
