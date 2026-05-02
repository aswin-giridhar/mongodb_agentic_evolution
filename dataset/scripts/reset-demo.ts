/**
 * Reset demo - Clear working_context (which now also holds claims).
 *
 * Mirrors what POST /api/demo/reset on the backend does. Use either —
 * they wipe the same collections.
 *
 * Note: claims used to live in a separate collection. Since the SSE
 * shape alignment (commit a9e5ed7) they live as WorkingContextEntry
 * with type=claim, so wiping working_context drops them too.
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'substrate';

async function resetDemo() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI not set');
  }

  console.log('🔄 Resetting demo data...');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(MONGODB_DB);

    // Clear working_context (claims live here too as type=claim entries)
    const wcResult = await db.collection('working_context').deleteMany({});
    console.log(`  ✓ Cleared ${wcResult.deletedCount} working_context entries`);

    console.log('\n✅ Demo reset complete — artifacts intact');
  } finally {
    await client.close();
  }
}

async function main() {
  try {
    await resetDemo();
  } catch (error) {
    console.error('\n❌ Reset failed:', error);
    process.exit(1);
  }
}

main();
