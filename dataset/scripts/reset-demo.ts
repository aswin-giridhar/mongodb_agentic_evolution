/**
 * Reset demo - Clear working_context and claims collections
 *
 * Called by POST /api/demo/reset endpoint
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

    // Clear working context
    const wcResult = await db.collection('working_context').deleteMany({});
    console.log(`  ✓ Cleared ${wcResult.deletedCount} working_context entries`);

    // Clear claims
    const claimsResult = await db.collection('claims').deleteMany({});
    console.log(`  ✓ Cleared ${claimsResult.deletedCount} claims`);

    console.log('\n✅ Demo reset complete - artifacts intact');
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
