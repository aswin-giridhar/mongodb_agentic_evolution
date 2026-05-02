/**
 * Generate synthetic Jira tickets for Acme Robotics
 */

import { loadSeedSpec, saveData, relativeTime, generateId, randomItem, jiraKey } from '../src/lib/utils.js';
import type { SeedSpec, JiraTicket } from '../src/types.js';

const TICKET_TEMPLATES = [
  {
    title: "Add idempotency keys to refund endpoint",
    description: "To handle duplicate requests safely, especially on mobile network issues.",
    priority: "high" as const,
    service: "payments-api"
  },
  {
    title: "Optimize checkout flow latency",
    description: "Currently averaging 400ms, target is < 200ms.",
    priority: "medium" as const,
    service: "payments-api"
  },
  {
    title: "Add circuit breaker for inventory service",
    description: "Cascaded failures during last Redis outage.",
    priority: "critical" as const,
    service: "inventory"
  },
  {
    title: "Improve mobile checkout UX",
    description: "Users report confusion on payment failures.",
    priority: "medium" as const,
    service: "mobile-app"
  },
  {
    title: "Upgrade Redis client library",
    description: "Current version has known issues.",
    priority: "low" as const,
    service: "inventory"
  },
  {
    title: "Add metrics to checkout flow",
    description: "Need better observability for debugging.",
    priority: "medium" as const,
    service: "payments-api"
  },
  {
    title: "Fix race condition in auth token refresh",
    description: "Sometimes causes 401 storms.",
    priority: "high" as const,
    service: "auth"
  },
  {
    title: "Document API rate limits",
    description: "For external API consumers.",
    priority: "low" as const,
    service: "payments-api"
  },
  {
    title: "Add webhook support for payment status",
    description: "Requested by integration partners.",
    priority: "medium" as const,
    service: "payments-api"
  },
  {
    title: "Refactor inventory reservation logic",
    description: "Current implementation is complex and error-prone.",
    priority: "high" as const,
    service: "inventory"
  }
];

const ADDITIONAL_TITLES = [
  "Add support for multiple payment methods",
  "Implement retry logic for failed transactions",
  "Add email notifications for failed payments",
  "Improve error handling in checkout",
  "Add A/B testing framework",
  "Optimize database queries for dashboard",
  "Add dark mode support",
  "Implement request tracing",
  "Add feature flags",
  "Improve test coverage"
];

async function generateJiraTickets(spec: SeedSpec): Promise<JiraTicket[]> {
  console.log('🔨 Generating Jira tickets...');

  const tickets: JiraTicket[] = [];
  const services = spec.services.map(s => s.name);
  const people = spec.people;
  let ticketNumber = 1000;

  // Generate from templates
  for (const template of TICKET_TEMPLATES) {
    const weeksAgo = Math.random() * 15;
    const status = Math.random() > 0.6 ? 'resolved' : Math.random() > 0.3 ? 'in_progress' : 'open';
    const assignee = Math.random() > 0.3 ? randomItem(people).id : undefined;

    tickets.push({
      id: generateId(`jira-${ticketNumber}`, 'jira'),
      key: jiraKey('ACME', ticketNumber++),
      title: template.title,
      description: template.description,
      status,
      priority: template.priority,
      assignee,
      service: template.service,
      pr_link: status === 'resolved' ? `PR #${Math.floor(Math.random() * 500) + 1000}` : undefined,
      created_at: relativeTime(weeksAgo)
    });
  }

  // Fill remaining
  while (tickets.length < spec.generation_config.total_jira_tickets) {
    const service = randomItem(services);
    const weeksAgo = Math.random() * 15;
    const title = randomItem(ADDITIONAL_TITLES);
    const status = Math.random() > 0.5 ? 'open' : Math.random() > 0.3 ? 'in_progress' : 'resolved';
    const assignee = Math.random() > 0.4 ? randomItem(people).id : undefined;

    tickets.push({
      id: generateId(`jira-${ticketNumber}`, 'jira'),
      key: jiraKey('ACME', ticketNumber++),
      title: `${title} (${service})`,
      description: `Need to implement ${title.toLowerCase()}.`,
      status,
      priority: randomItem(['low', 'medium', 'high'] as const),
      assignee,
      service,
      pr_link: status === 'resolved' && Math.random() > 0.5 ? `PR #${Math.floor(Math.random() * 500) + 1000}` : undefined,
      created_at: relativeTime(weeksAgo)
    });
  }

  console.log(`✅ Generated ${tickets.length} Jira tickets`);
  return tickets;
}

async function main() {
  try {
    console.log('📥 Loading seed-spec.json...');
    const spec = await loadSeedSpec() as SeedSpec;

    const tickets = await generateJiraTickets(spec);
    await saveData(tickets, 'jira.json');

    console.log(`   Open: ${tickets.filter(t => t.status === 'open').length}`);
    console.log(`   In Progress: ${tickets.filter(t => t.status === 'in_progress').length}`);
    console.log(`   Resolved: ${tickets.filter(t => t.status === 'resolved').length}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
