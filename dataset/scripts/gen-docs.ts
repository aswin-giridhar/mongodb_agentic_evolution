/**
 * Generate synthetic documentation for Acme Robotics
 */

import { loadSeedSpec, saveData, relativeTime, generateId, randomItem } from '../src/lib/utils.js';
import type { SeedSpec, Doc } from '../src/types.js';

const DOC_TEMPLATES = [
  {
    title: "Checkout API Specification",
    type: "spec" as const,
    service: "payments-api",
    content: `# Checkout API Specification

## Overview
The checkout endpoint processes payment transactions for delivery bot orders.

## Endpoint
\`\`\`
POST /api/v1/checkout
\`\`\`

## Request Body
\`\`\`json
{
  "amount": number,
  "currency": "USD",
  "items": Array<Item>,
  "customer_id": string,
  "metadata"?: object
}
\`\`\`

## Response
\`\`\`json
{
  "tx_id": string,
  "status": "pending" | "complete" | "failed",
  "amount": number,
  "created_at": timestamp
}
\`\`\`

## Rate Limiting
Uses \`lib/limiter.ts\` for redis-backed rate limiting.
- 100 requests per minute per customer
- Burst allowance: 20

## Error Handling
All errors return consistent format:
\`\`\`json
{
  "error": {
    "code": string,
    "message": string,
    "tx_id"?: string
  }
}
\`\`\``
  },
  {
    title: "Rate Limiter Architecture",
    type: "design" as const,
    service: "inventory",
    content: `# Redis-Backed Rate Limiter

## Why Not express-rate-limit?
The standard express-rate-limit package uses in-memory storage, which causes:
1. Memory leaks under high load
2. Inconsistent limits across multiple server instances
3. Lost state on restart

## Architecture
\`\`\`
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   Client    │────▶│  API Server  │────▶│  Redis  │
└─────────────┘     └──────────────┘     └─────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │ lib/limiter  │
                   └──────────────┘
\`\`\`

## Configuration
\`\`\`typescript
{
  windowMs: 60000,      // 1 minute
  maxRequests: 100,
  keyPrefix: "rate_limit:",
  redis: {
    host: process.env.REDIS_HOST,
    port: 6379
  }
}
\`\`\`

## Usage
\`\`\`typescript
import { limiter } from '@/lib/limiter';

app.use('/api/checkout', limiter({ max: 100 }));
\`\`\``
  },
  {
    title: "Authentication Middleware Order",
    type: "decision" as const,
    service: "auth",
    content: `# Middleware Ordering: Security Decision

## Context
Security review identified that logging middleware was running before authentication middleware.

## Issue
Logging unauthenticated requests is a security concern because:
1. Request bodies may contain sensitive data (passwords, tokens)
2. IP addresses of unauthenticated requests are logged unnecessarily
3. Potential for log injection attacks

## Decision
**Authentication middleware MUST run before logging middleware.**

## Middleware Order
\`\`\`typescript
1. cors()
2. helmet()
3. auth()           // ← AUTH FIRST
4. logging()        // ← THEN LOG
5. rateLimit()
6. requestHandler()
\`\`\`

## Implementation
See \`services/auth/src/middleware.ts\` for the correct ordering.

## Date
2026-01-15

## Participants
- Sarah (Platform Lead)
- Marcus (Platform Engineer)
- Security Reviewer
`
  },
  {
    title: "Mobile Checkout State Management",
    type: "design" as const,
    service: "mobile-app",
    content: `# useCheckout Hook Design

## Problem
Multiple components were duplicating checkout logic:
- CheckoutForm.tsx
- PaymentStatus.tsx
- OrderSummary.tsx

Each component had its own fetch calls, loading states, error handling.

## Solution
Consolidate into a custom hook: \`useCheckout\`

## API
\`\`\`typescript
const {
  data,           // CheckoutData | null
  loading,        // boolean
  error,          // Error | null
  startCheckout,  // (items: Item[]) => Promise<void>
  reset,          // () => void
  pollStatus      // (txId: string) => void
} = useCheckout();
\`\`\`

## Features
1. Centralized API calls to /api/checkout
2. Automatic retry on transient failures
3. Polling for async transaction status
4. Cache busting on cart changes

## Usage Example
\`\`\`tsx
function CheckoutForm() {
  const { data, loading, startCheckout } = useCheckout();

  return (
    <button onClick={() => startCheckout(items)}>
      {loading ? 'Processing...' : 'Checkout'}
    </button>
  );
}
\`\`\``
  },
  {
    title: "Incident Response: Checkout Outage",
    type: "runbook" as const,
    service: "payments-api",
    content: `# Incident Report: Checkout Outage

## Date
2026-03-15 14:30-14:50 UTC (20 minutes)

## Severity
High - Checkout endpoint unavailable

## Summary
The checkout endpoint became unavailable due to memory exhaustion caused by express-rate-limit.

## Timeline
- 14:30 - PagerDuty alert: 503 errors on /checkout
- 14:32 - Investigation started
- 14:35 - Identified memory spike in checkout service
- 14:38 - Determined cause: express-rate-limit memory leak
- 14:42 - Emergency hot-patch: increased memory limit
- 14:50 - Service restored

## Root Cause
express-rate-limit stores rate limit data in process memory. Under high load:
1. Memory usage grows unbounded
2. Node.js garbage collector can't keep up
3. Process crashes under memory pressure

## Resolution
Replaced with \`lib/limiter.ts\` (Redis-backed):
- Rate limit data stored in Redis
- Constant memory usage
- Survives process restarts

## Follow-up Actions
- [x] Deploy lib/limiter to production
- [x] Deprecate express-rate-limit across all services
- [x] Add memory usage alerts
- [ ] Load testing for new rate limiter

## Participants
- Marcus (On-call)
- Sarah (Support)
- Alex (Payments team)

## Review
Post-incident review scheduled for 2026-03-22.`
  }
];

async function generateDocs(spec: SeedSpec): Promise<Doc[]> {
  console.log('🔨 Generating documentation...');

  const docs: Doc[] = [];
  const people = spec.people;

  for (const template of DOC_TEMPLATES) {
    const weeksAgo = Math.random() * 20;
    const author = people.find(p =>
      p.team === (template.service ? spec.services.find(s => s.name === template.service)?.owner_team : 'platform')
    ) || people[0];

    docs.push({
      id: generateId(template.title, 'doc'),
      title: template.title,
      content: template.content,
      author: author.id,
      type: template.type,
      service: template.service,
      created_at: relativeTime(weeksAgo)
    });
  }

  console.log(`✅ Generated ${docs.length} documents`);
  return docs;
}

async function main() {
  try {
    console.log('📥 Loading seed-spec.json...');
    const spec = await loadSeedSpec() as SeedSpec;

    const docs = await generateDocs(spec);
    await saveData(docs, 'docs.json');

    console.log(`   Types: ${docs.map(d => d.type).join(', ')}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
