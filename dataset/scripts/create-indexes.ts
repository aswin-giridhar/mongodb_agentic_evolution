/**
 * Create the Atlas Vector Search indexes the backend retrieval pipeline uses.
 *
 * Run before / alongside ingest. Idempotent — re-running with the same
 * definitions is safe.
 *
 *   npm run build
 *   node dist/scripts/create-indexes.js          # fire-and-forget
 *   node dist/scripts/create-indexes.js --wait   # block until READY
 *
 * Atlas index builds take 5–10 minutes on first creation. The default
 * mode submits the create commands and exits. Pass --wait to poll Atlas
 * until both indexes report status: READY (max 15 min).
 */

import { MongoClient, type Db } from "mongodb";

const WAIT = process.argv.includes("--wait");
const MAX_WAIT_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 10_000;

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

    if (!WAIT) {
      console.log(
        "   Atlas builds them in the background. Check the Atlas UI " +
          '("Search" tab) for status, or re-run with --wait to block.'
      );
      return;
    }

    console.log("\n⏳ Polling for READY status (max 15 min)...");
    const start = Date.now();
    while (Date.now() - start < MAX_WAIT_MS) {
      type SearchIndexStatus = {
        name: string;
        status?: string;
        queryable?: boolean;
      };

      const statuses = await Promise.all(
        INDEXES.map(async (spec) => {
          const idxs = (await db
            .collection(spec.collection)
            .listSearchIndexes()
            .toArray()) as SearchIndexStatus[];
          const found = idxs.find((i) => i.name === spec.name);
          return {
            name: `${spec.collection}.${spec.name}`,
            status: found?.status ?? "MISSING",
            queryable: found?.queryable === true,
          };
        })
      );

      const ts = new Date().toISOString().slice(11, 19);
      const summary = statuses
        .map((s) => `${s.name}=${s.status}${s.queryable ? "/queryable" : ""}`)
        .join("  ");
      console.log(`  [${ts}] ${summary}`);

      if (statuses.every((s) => s.queryable)) {
        console.log("\n✅ All indexes are READY and queryable.");
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    console.error("\n⏱️  Timed out waiting for indexes after 15 min.");
    console.error("    They may still finish — check the Atlas UI.");
    process.exit(1);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("\n❌ create-indexes failed:", err);
  process.exit(1);
});
