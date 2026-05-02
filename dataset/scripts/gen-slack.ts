/**
 * Generate synthetic Slack messages for Acme Robotics
 *
 * This script generates 150 realistic Slack messages across 5 channels,
 * encoding tribal rules R1-R4 as specified in seed-spec.json.
 */

import { loadSeedSpec, saveData, slackTimestamp, relativeTime, generateId, randomItem, chunk } from '../src/lib/utils.js';
import type { SeedSpec, SlackMessage } from '../src/types.js';

// System prompt for Claude
const SYSTEM_PROMPT = `You are generating a synthetic Slack history for the fictional company Acme Robotics.

Your output must be valid JSON only - no markdown, no explanation, no code blocks.

Generate exactly {count} Slack messages distributed across the specified channels.

CRITICAL REQUIREMENTS:
1. Each tribal rule MUST appear in at least 2 messages with the specified author in the specified channel
2. Messages should use realistic engineering tone (terse, casual, technical jargon)
3. Mix in mundane content (lunch plans, deploy announcements, jokes, gifs) for realism
4. About 20% of messages should be in threads (use parent_ts to reply to earlier messages)
5. Time anchor is {time_anchor} - generate timestamps relative to this date
6. Each message must have a unique id

Message format:
{
  "id": "unique_string",
  "channel": "channel_name",
  "author": "person_id",
  "ts": "timestamp_string",
  "content": "message_text",
  "parent_ts": "optional_parent_timestamp_for_threads",
  "reactions": ["optional", "emoji_reactions"]
}

Available channels: {channels}
Available people: {people}
Tribal rules to encode: {tribal_rules}
Story arcs to weave through: {story_arcs}

Remember: Output ONLY the JSON array, nothing else.`;

interface SlackGenerationRequest {
  messages: SlackMessage[];
}

async function generateSlackMessages(spec: SeedSpec): Promise<SlackMessage[]> {
  console.log('🔨 Generating Slack messages...');

  const channels = spec.channels;
  const people = spec.people;
  const tribalRules = spec.tribal_rules;
  const storyArcs = spec.story_arcs;

  // Calculate messages per channel
  const totalMessages = spec.generation_config.slack_messages_per_channel * channels.length;
  const messagesPerChannel = Math.floor(totalMessages / channels.length);

  // Build context for the LLM
  const channelList = channels.map(c => `#${c}`).join(', ');
  const peopleList = people.map(p => `${p.handle} (${p.name}, ${p.team})`).join(', ');
  const rulesList = tribalRules.map(r => `**${r.id}**: ${r.rule} (#${r.slack_channel}, by ${r.slack_author}, ${r.slack_age_weeks} weeks ago)`).join('\n');
  const arcsList = storyArcs.map((arc, i) => `${i + 1}. ${arc}`).join('\n');

  // Prepare prompt
  const prompt = SYSTEM_PROMPT
    .replace('{count}', totalMessages.toString())
    .replace('{time_anchor}', spec.time_anchor)
    .replace('{channels}', channelList)
    .replace('{people}', peopleList)
    .replace('{tribal_rules}', rulesList)
    .replace('{story_arcs}', arcsList);

  // For now, generate messages procedurally since we don't have LLM access
  // This will be replaced with actual LLM generation during the hackathon
  const messages = generateProceduralMessages(spec, totalMessages);

  console.log(`✅ Generated ${messages.length} Slack messages`);
  return messages;
}

/**
 * Procedural generation of Slack messages (fallback during development)
 * During hackathon, this will call Claude API instead
 */
function generateProceduralMessages(spec: SeedSpec, count: number): SlackMessage[] {
  const messages: SlackMessage[] = [];
  const channels = spec.channels;
  const people = spec.people;
  const tribalRules = spec.tribal_rules;
  const now = new Date(spec.time_anchor);

  // Helper to create a message
  const createMessage = (
    channel: string,
    author: string,
    content: string,
    weeksAgo: number,
    parentId?: string
  ): SlackMessage => ({
    id: generateId(content, 'slack'),
    channel,
    author: people.find(p => p.id === author)?.id || author,
    ts: slackTimestamp(relativeTime(weeksAgo, now) + Math.random() * 86400000),
    content,
    parent_ts: parentId,
    reactions: []
  });

  // Generate tribal rule messages first (ensure they exist)
  const ruleMessages: Array<{ channel: string; author: string; content: string; weeksAgo: number }> = [
    // R1: Rate limit rule (Marcus, #platform, 6 weeks ago)
    {
      channel: 'platform',
      author: 'marcus',
      content: "Just tracked down the checkout outage - express-rate-limit is leaking memory under load. We need to deprecate it ASAP.",
      weeksAgo: 6
    },
    {
      channel: 'platform',
      author: 'marcus',
      content: "I've got a redis-backed rate limiter in lib/limiter.ts that doesn't have this issue. Want me to PR it?",
      weeksAgo: 6
    },
    // R2: tx_id convention (Alex, #payments, 3 weeks ago)
    {
      channel: 'payments',
      author: 'alex',
      content: "Can we settle on tx_id vs transactionId? Mobile app is using one thing, payments-api another. It's confusing.",
      weeksAgo: 3
    },
    {
      channel: 'payments',
      author: 'alex',
      content: "I'm pushing for tx_id as the standard across all services. It's shorter and consistent with our other _id conventions.",
      weeksAgo: 3
    },
    // R3: useCheckout hook (Jin, #mobile, 8 weeks ago)
    {
      channel: 'mobile',
      author: 'jin',
      content: "The checkout state management is getting messy. Multiple components duplicating fetch logic. I'm thinking useCheckout hook.",
      weeksAgo: 8
    },
    {
      channel: 'mobile',
      author: 'jin',
      content: "useCheckout hook is ready. Consolidates all checkout API calls and handles loading/error states centrally.",
      weeksAgo: 8
    },
    // R4: Auth before logging (Sarah, #platform, 16 weeks ago)
    {
      channel: 'platform',
      author: 'sarah',
      content: "Security review flagged something - we're logging unauthenticated requests because logging middleware runs before auth.",
      weeksAgo: 16
    },
    {
      channel: 'platform',
      author: 'sarah',
      content: "This is actually a security issue. We shouldn't log requests that haven't been authenticated. Reordering middleware now.",
      weeksAgo: 16
    }
  ];

  // Add tribal rule messages
  for (const rm of ruleMessages) {
    messages.push(createMessage(rm.channel, rm.author, rm.content, rm.weeksAgo));
  }

  // Generate additional messages to reach count
  const messageTemplates = [
    "Just deployed {service} to prod. Looking good so far.",
    "Anyone else seeing increased latency on {service}?",
    "Lunch in 15? Thinking {place}.",
    "PR #{pr_number} is ready for review.",
    "The {feature} feature is finally done!",
    "Having issues with {service}, investigating...",
    "Nice work on {feature} yesterday!",
    "Can someone review my PR when you get a chance?",
    "Production incident: {service} is throwing errors.",
    "Code freeze starting tomorrow for the {release} release.",
    "Documentation updated for {service}.",
    "Meeting in 5 in {room} to discuss {topic}.",
    "The {service} refactor is complete. 30% performance improvement.",
    "Has anyone seen {name}?",
    "Coffee break ☕",
    "🚀 Deploying to staging now.",
    "Tests are failing on {service}. Looking into it.",
    "Great sync with {team} team just now.",
    "Who's on call this week?",
    "Friday vibe check: how's everyone doing?"
  ];

  const services = spec.services.map(s => s.name);
  const places = ['the Thai place', 'Chipotle', 'the cafeteria', 'that new salad bar'];
  const features = ['checkout flow', 'auth rewrite', 'inventory sync', 'rate limiting'];
  const rooms = ['Room A', 'huddle room', 'main conference room'];
  const topics = ['Q2 roadmap', 'architecture decisions', 'incident postmortem', 'API design'];

  let messageId = 0;
  while (messages.length < count) {
    const channel = randomItem(channels);
    const author = randomItem(people);
    const template = randomItem(messageTemplates);
    const weeksAgo = Math.random() * 20; // Messages from past 20 weeks

    const content = template
      .replace('{service}', randomItem(services))
      .replace('{place}', randomItem(places))
      .replace('{pr_number}', String(Math.floor(Math.random() * 2000)))
      .replace('{feature}', randomItem(features))
      .replace('{release}', ['v2.1', 'v2.2', 'v3.0'][Math.floor(Math.random() * 3)])
      .replace('{room}', randomItem(rooms))
      .replace('{topic}', randomItem(topics))
      .replace('{team}', ['platform', 'payments', 'mobile'][Math.floor(Math.random() * 3)])
      .replace('{name}', randomItem(people).name);

    messages.push(createMessage(channel, author.id, content, weeksAgo));

    // Sometimes add thread replies
    if (Math.random() < 0.2 && messages.length > 0) {
      const parent = messages[messages.length - 1];
      const replyAuthor = randomItem(people.filter(p => p.id !== parent.author));
      const replies = [
        ":+1:",
        "Got it, thanks!",
        "I'll take a look.",
        "Nice!",
        "👀",
        "This looks good to me.",
        "Can you add more details?",
        "lgtm"
      ];
      messages.push(createMessage(channel, replyAuthor.id, randomItem(replies), weeksAgo - 0.01, parent.ts));
    }
  }

  return messages;
}

// Main execution
async function main() {
  try {
    console.log('📥 Loading seed-spec.json...');
    const spec = await loadSeedSpec() as SeedSpec;

    console.log('🔨 Generating Slack messages...');
    const messages = await generateSlackMessages(spec);

    console.log('💾 Saving to seed-data/slack.json...');
    await saveData(messages, 'slack.json');

    console.log(`\n✅ Generated ${messages.length} Slack messages`);
    console.log(`   Channels: ${spec.channels.join(', ')}`);
    console.log(`   People: ${spec.people.map(p => p.handle).join(', ')}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
