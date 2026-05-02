/**
 * Ingestion pipeline - Load generated data into MongoDB Atlas
 *
 * This script:
 * 1. Reads all generated data files
 * 2. Generates Voyage embeddings
 * 3. Inserts into MongoDB Atlas
 */

import { MongoClient, Db } from 'mongodb';
import { VoyageAIClient } from 'voyageai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadSeedSpec, chunk, extractRefs } from '../src/lib/utils.js';
import type {
  SeedSpec,
  SlackMessage,
  PullRequest,
  JiraTicket,
  Doc,
  CodeChunk,
  Artifact,
  Service,
  Person
} from '../src/types.js';

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'substrate';
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY || '';

interface IngestOptions {
  dryRun?: boolean;
  skipEmbeddings?: boolean;
}

async function ingest(options: IngestOptions = {}) {
  console.log('🚀 Starting ingestion pipeline...\n');

  // Validate environment
  if (!options.dryRun && !MONGODB_URI) {
    throw new Error('MONGODB_URI not set');
  }
  if (!options.skipEmbeddings && !VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY not set');
  }

  // Load data
  console.log('📥 Loading generated data...');
  const spec = JSON.parse(readFileSync('./seed-data/seed-spec.json', 'utf-8')) as SeedSpec;
  const slack = JSON.parse(readFileSync('./seed-data/slack.json', 'utf-8')) as SlackMessage[];
  const prs = JSON.parse(readFileSync('./seed-data/prs.json', 'utf-8')) as PullRequest[];
  const jira = JSON.parse(readFileSync('./seed-data/jira.json', 'utf-8')) as JiraTicket[];
  const docs = JSON.parse(readFileSync('./seed-data/docs.json', 'utf-8')) as Doc[];
  const code = JSON.parse(readFileSync('./seed-data/code.json', 'utf-8')) as CodeChunk[];

  console.log(`  ✓ ${slack.length} Slack messages`);
  console.log(`  ✓ ${prs.length} Pull Requests`);
  console.log(`  ✓ ${jira.length} Jira tickets`);
  console.log(`  ✓ ${docs.length} Documents`);
  console.log(`  ✓ ${code.length} Code chunks\n`);

  // Connect to MongoDB
  let client: MongoClient | null = null;
  let db: Db | null = null;

  if (!options.dryRun) {
    console.log('🔌 Connecting to MongoDB Atlas...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(MONGODB_DB);
    console.log('✅ Connected\n');
  }

  try {
    // Step 1: Insert services and people
    console.log('📋 Inserting services and people...');
    const services: Service[] = spec.services.map(s => ({
      _id: `services.${s.id}`,
      name: s.name,
      owner_team: s.owner_team,
      depends_on: s.depends_on.map(d => `services.${d}`),
      consumed_by: s.consumed_by.map(c => `services.${c}`),
      hot_files: s.hot_files
    }));

    const people: Person[] = spec.people.map(p => ({
      _id: `people.${p.id}`,
      name: p.name,
      team: p.team,
      role: p.role,
      expertise: p.expertise,
      handle: p.handle
    }));

    if (!options.dryRun && db) {
      await db.collection('services').deleteMany({});
      await db.collection('people').deleteMany({});
      await db.collection('services').insertMany(services as any[]);
      await db.collection('people').insertMany(people as any[]);
    }
    console.log(`  ✓ ${services.length} services`);
    console.log(`  ✓ ${people.length} people\n`);

    // Step 2: Build artifacts
    console.log('🏗️  Building artifacts...');

    const artifacts: Artifact[] = [];

    // Convert Slack messages
    for (const msg of slack) {
      artifacts.push({
        _id: `slack:${msg.id}`,
        source: 'slack',
        channel: `#${msg.channel}`,
        author: msg.author,
        content: msg.content,
        refs: [],
        metadata: { ts: msg.ts, parent_ts: msg.parent_ts, reactions: msg.reactions },
        created_at: parseFloat(msg.ts) * 1000
      });
    }

    // Convert PRs
    for (const pr of prs) {
      artifacts.push({
        _id: `pr:${pr.id}`,
        source: 'github_pr',
        author: pr.author,
        content: `${pr.title}\n\n${pr.description}`,
        preview: pr.title,
        refs: [],
        metadata: { number: pr.number, state: pr.state, files: pr.files, merged_at: pr.merged_at },
        created_at: pr.created_at
      });
    }

    // Convert Jira tickets
    for (const ticket of jira) {
      artifacts.push({
        _id: `jira:${ticket.id}`,
        source: 'jira_ticket',
        content: `${ticket.key}: ${ticket.title}\n\n${ticket.description}`,
        preview: `${ticket.key}: ${ticket.title}`,
        refs: [],
        metadata: { key: ticket.key, status: ticket.status, priority: ticket.priority, assignee: ticket.assignee, pr_link: ticket.pr_link },
        created_at: ticket.created_at
      });
    }

    // Convert docs
    for (const doc of docs) {
      artifacts.push({
        _id: `doc:${doc.id}`,
        source: 'docs',
        author: doc.author,
        content: doc.content,
        preview: doc.title,
        refs: [],
        metadata: { title: doc.title, type: doc.type, service: doc.service },
        created_at: doc.created_at
      });
    }

    // Convert code chunks
    for (const chunk of code) {
      artifacts.push({
        _id: `code:${chunk.id}`,
        source: 'code_chunk',
        content: chunk.content,
        preview: chunk.path,
        refs: [],
        metadata: { path: chunk.path, service: chunk.service, language: chunk.language },
        created_at: Date.now()
      });
    }

    console.log(`  ✓ ${artifacts.length} artifacts created\n`);

    // Step 3: Tag refs
    console.log('🏷️  Tagging entity references...');
    for (const artifact of artifacts) {
      artifact.refs = extractRefs(artifact.content, spec.services, spec.people);
    }
    console.log(`  ✓ References tagged\n`);

    // Step 4: Generate embeddings
    if (!options.skipEmbeddings) {
      console.log('🧠 Generating Voyage embeddings...');
      const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

      let processed = 0;
      const batches = chunk(artifacts, 32); // Voyage limit

      for (const [i, batch] of batches.entries()) {
        const texts = batch.map(a => a.content);
        const result = await voyage.embed({ input: texts, model: 'voyage-3' });

        for (let j = 0; j < batch.length; j++) {
          if (result.data && result.data[j]) {
            batch[j].embedding = result.data[j].embedding;
          }
        }

        processed += batch.length;
        process.stdout.write(`\r  Processed ${processed}/${artifacts.length} embeddings`);
      }

      console.log('\n  ✓ Embeddings generated\n');
    }

    // Step 5: Insert artifacts
    if (!options.dryRun && db) {
      console.log('💾 Inserting artifacts into MongoDB...');
      await db.collection('artifacts').deleteMany({});

      // Insert in batches by source for progress tracking
      const sources: Array<'slack' | 'github_pr' | 'jira_ticket' | 'docs' | 'code_chunk'> =
        ['slack', 'github_pr', 'jira_ticket', 'docs', 'code_chunk'];

      for (const source of sources) {
        const sourceArtifacts = artifacts.filter(a => a.source === source);
        if (sourceArtifacts.length > 0) {
          await db.collection('artifacts').insertMany(sourceArtifacts as any[]);
          console.log(`  ✓ ${sourceArtifacts.length} ${source} artifacts`);
        }
      }
      console.log();
    }

    // Step 6: Verify
    if (!options.dryRun && db) {
      console.log('🔍 Verifying data...');
      const artifactCount = await db.collection('artifacts').countDocuments();
      const serviceCount = await db.collection('services').countDocuments();
      const peopleCount = await db.collection('people').countDocuments();

      console.log(`  ✓ artifacts: ${artifactCount}`);
      console.log(`  ✓ services: ${serviceCount}`);
      console.log(`  ✓ people: ${peopleCount}\n`);
    }

    console.log('✅ Ingestion complete!');

  } finally {
    if (client) {
      await client.close();
      console.log('🔌 MongoDB connection closed');
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: IngestOptions = {
    dryRun: args.includes('--dry-run'),
    skipEmbeddings: args.includes('--skip-embeddings')
  };

  if (options.dryRun) console.log('⚠️  DRY RUN MODE - No data will be written\n');

  try {
    await ingest(options);
  } catch (error) {
    console.error('\n❌ Ingestion failed:', error);
    process.exit(1);
  }
}

main();
