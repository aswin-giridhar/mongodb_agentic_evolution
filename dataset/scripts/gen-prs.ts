/**
 * Generate synthetic GitHub pull requests for Acme Robotics
 */

import { loadSeedSpec, saveData, relativeTime, generateId, randomItem, jiraKey } from '../src/lib/utils.js';
import type { SeedSpec, PullRequest } from '../src/types.js';

interface PRTemplate {
  title: string;
  description: string;
  service: string;
  files: string[];
}

const PR_TEMPLATES: PRTemplate[] = [
  {
    title: "Replace express-rate-limit with redis-backed limiter",
    description: "Fixes memory leak under load. Using lib/limiter.ts instead.",
    service: "payments-api",
    files: ["services/payments-api/src/routes/checkout.ts", "lib/limiter.ts"]
  },
  {
    title: "Standardize transaction ID field to tx_id",
    description: "Aligns with API naming convention across services.",
    service: "payments-api",
    files: ["services/payments-api/src/routes/checkout.ts"]
  },
  {
    title: "Extract checkout logic into useCheckout hook",
    description: "Consolidates state management and reduces duplication.",
    service: "mobile-app",
    files: ["services/mobile-app/src/hooks/useCheckout.ts", "services/mobile-app/src/checkout/CheckoutForm.tsx"]
  },
  {
    title: "Reorder middleware: auth before logging",
    description: "Security fix - don't log unauthenticated requests.",
    service: "auth",
    files: ["services/auth/src/middleware.ts", "lib/middleware.ts"]
  },
  {
    title: "Add circuit breaker pattern to inventory service",
    description: "Prevents cascading failures when Redis is unavailable.",
    service: "inventory",
    files: ["services/inventory/src/stock.ts"]
  },
  {
    title: "Optimize Redis connection pooling",
    description: "Reduces latency by 15%.",
    service: "inventory",
    files: ["lib/redis.ts"]
  },
  {
    title: "Add idempotency keys to checkout endpoint",
    description: "Prevents duplicate transactions.",
    service: "payments-api",
    files: ["services/payments-api/src/routes/checkout.ts"]
  },
  {
    title: "Improve error handling in mobile checkout",
    description: "Better UX for failed transactions.",
    service: "mobile-app",
    files: ["services/mobile-app/src/checkout/CheckoutForm.tsx"]
  },
  {
    title: "Add health check endpoints",
    description: "For monitoring and load balancer checks.",
    service: "auth",
    files: ["services/auth/src/health.ts"]
  },
  {
    title: "Refactor JWT token validation",
    description: "Centralize token logic in auth service.",
    service: "auth",
    files: ["services/auth/src/jwt.ts"]
  }
];

const ADDITIONAL_TITLES = [
  "Fix type errors in checkout flow",
  "Update dependencies to latest versions",
  "Add unit tests for payment processing",
  "Improve logging for debugging",
  "Optimize bundle size for mobile app",
  "Add pagination to inventory list",
  "Fix race condition in refund processing",
  "Update API documentation",
  "Add feature flag for new checkout flow",
  "Improve error messages for users",
  "Add retry logic for failed API calls",
  "Fix memory leak in connection pooling",
  "Add metrics collection",
  "Improve TypeScript strict mode compliance",
  "Add E2E tests for critical paths"
];

async function generatePRs(spec: SeedSpec): Promise<PullRequest[]> {
  console.log('🔨 Generating Pull Requests...');

  const prs: PullRequest[] = [];
  const services = spec.services.map(s => s.name);
  const people = spec.people;
  const tribalRules = spec.tribal_rules;

  let prNumber = 980; // Starting PR number

  // Add tribal rule PRs first
  for (const rule of tribalRules) {
    prs.push({
      id: generateId(`pr-${rule.pr_id}`, 'pr'),
      number: parseInt(rule.pr_id),
      title: rule.pr_title,
      description: `Implements ${rule.rule}\n\nReason: ${rule.reason}`,
      author: people.find(p => p.id === rule.slack_author)?.handle || rule.slack_author,
      state: 'merged',
      files: rule.pr_files,
      service: rule.pr_files[0]?.split('/')[1] || 'unknown',
      created_at: relativeTime(rule.slack_age_weeks),
      merged_at: relativeTime(rule.slack_age_weeks - 0.1)
    });
    prNumber = parseInt(rule.pr_id) + 1;
  }

  // Add template PRs
  for (const template of PR_TEMPLATES) {
    const weeksAgo = Math.random() * 20;
    prs.push({
      id: generateId(`pr-${prNumber}`, 'pr'),
      number: prNumber++,
      title: template.title,
      description: template.description,
      author: randomItem(people).handle,
      state: Math.random() > 0.2 ? 'merged' : 'closed',
      files: template.files,
      service: template.service,
      created_at: relativeTime(weeksAgo),
      merged_at: Math.random() > 0.3 ? relativeTime(weeksAgo - 0.1) : undefined
    });
  }

  // Fill remaining with generated PRs
  while (prs.length < spec.generation_config.total_prs) {
    const service = randomItem(services);
    const weeksAgo = Math.random() * 20;
    const title = randomItem(ADDITIONAL_TITLES);
    const author = randomItem(people);

    prs.push({
      id: generateId(`pr-${prNumber}`, 'pr'),
      number: prNumber++,
      title: `${title} (${service})`,
      description: `Implementation of ${title.toLowerCase()}.`,
      author: author.handle,
      state: Math.random() > 0.15 ? 'merged' : Math.random() > 0.5 ? 'closed' : 'open',
      files: [`services/${service}/src/${randomItem(['routes', 'lib', 'middleware'])}/${randomItem(['index', 'handlers', 'utils'])}.ts`],
      service,
      created_at: relativeTime(weeksAgo),
      merged_at: Math.random() > 0.4 ? relativeTime(weeksAgo - 0.1) : undefined
    });
  }

  // Sort by created_at descending
  prs.sort((a, b) => b.created_at - a.created_at);

  console.log(`✅ Generated ${prs.length} Pull Requests`);
  return prs;
}

async function main() {
  try {
    console.log('📥 Loading seed-spec.json...');
    const spec = await loadSeedSpec() as SeedSpec;

    const prs = await generatePRs(spec);
    await saveData(prs, 'prs.json');

    console.log(`   Services: ${spec.services.map(s => s.name).join(', ')}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
