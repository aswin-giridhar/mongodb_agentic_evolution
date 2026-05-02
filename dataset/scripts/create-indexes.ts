/**
 * Create the Atlas Vector Search indexes the backend retrieval pipeline uses.
 *
 * Run before / alongside ingest. Idempotent — re-running with the same
 * definitions is safe.
 *
 *   npm run build
 *   node dist/scripts/create-indexes.js
 *
 * Atlas index builds take 5–10 minutes on first creation; the script
 * exits as soon as the create-index commands are accepted, so kick this
 * off as early as possible (per dataset-spec.md §11, ~10:45 AM on the day).
 */

import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "substrate";

interface IndexSpec {
  collection: string;
  name: string;
  type: "vectorSearch";
  definition: {
    fields: Array<
      | {
          type: "vector";
          path: string;
          numDimensions: number;
          similarity: "cosine" | "dotProduct" | "euclidean";
        }
      | { type: "filter"; path: string }
    >;
  };
}

const INDEXES: IndexSpec[] = [
  {
    collection: "artifacts",
    name: "artifact_vector",
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "embedding", numDimensions: 1024, similarity: "cosine" },
        { type: "filter", path: "refs" },
        { type: "filter", path: "source" },
      ],
    },
  },
  {
    collection: "working_context",
    name: "wc_vector",
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "embedding", numDimensions: 1024, similarity: "cosine" },
        { type: "filter", path: "scope.entity_id" },
        { type: "filter", path: "type" },
        { type: "filter", path: "active" },
      ],
    },
  },
];

async function ensureIndex(db: Db, spec: IndexSpec): Promise<void> {
  const coll = db.collection(spec.collection);

  // Make sure the collection exists — createSearchIndex requires the namespace.
  const collections = await db.listCollections({ name: spec.collection }).toArray();
  if (collections.length === 0) {
    console.log(`  ↳ creating empty collection ${spec.collection}`);
    await db.createCollection(spec.collection);
  }

  // List existing search indexes; skip if name already present.
  try {
    const existing = await coll.listSearchIndexes().toArray();
    if (existing.some((idx) => idx.name === spec.name)) {
      console.log(`  ↳ ${spec.collection}.${spec.name} already exists — skipping`);
      return;
    }
  } catch {
    // listSearchIndexes can fail on a fresh collection; fall through to create.
  }

  // Create. The driver returns once the request is accepted; index build
  // continues in the background on Atlas (5–10 min on first creation).
  await coll.createSearchIndex({
    name: spec.name,
    type: spec.type,
    definition: spec.definition,
  });
  console.log(`  ✓ requested ${spec.collection}.${spec.name}`);
}

async function main(): Promise<void> {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  console.log("🔌 Connecting to Atlas...");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  console.log(`✅ Connected to ${MONGODB_DB}\n`);

  try {
    console.log("🔍 Ensuring vector indexes...");
    for (const spec of INDEXES) {
      await ensureIndex(db, spec);
    }
    console.log("\n✅ Index creation requests submitted.");
    console.log(
      "   Atlas builds them in the background. Check the Atlas UI " +
        '("Search" tab) for status — they show as READY when usable.'
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("\n❌ create-indexes failed:", err);
  process.exit(1);
});
