/**
 * Verify retrieval — runs a few representative $vectorSearch queries against
 * the artifacts collection and prints the top 5 hits per query.
 *
 * Run after ingest + after the vector indexes report READY in Atlas.
 *
 *   npm run build
 *   node dist/scripts/verify-retrieval.js
 *
 * The Hero 2 demo expects `slack:marcus-rate-limit-warning` to be the top
 * (or near-top) hit for "rate limit memory leak" scoped to payments-api.
 * If it isn't, retune the curated artifact's content (more direct
 * keywords) before the demo.
 */

import { MongoClient } from "mongodb";
import { VoyageAIClient } from "voyageai";

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "substrate";
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY || "";

interface Probe {
  label: string;
  query: string;
  scopeRef?: string;
  expectedTop?: string; // _id we expect in the top 3
}

const PROBES: Probe[] = [
  {
    label: "Hero 2: rate-limit grounding",
    query: "rate limit memory leak",
    scopeRef: "services.payments-api",
    expectedTop: "slack:marcus-rate-limit-warning",
  },
  {
    label: "Hero 2 alt phrasing",
    query: "should I use express-rate-limit on checkout",
    scopeRef: "services.payments-api",
    expectedTop: "slack:marcus-rate-limit-warning",
  },
  {
    label: "Transaction id naming",
    query: "tx_id versus transactionId",
    scopeRef: "services.payments-api",
  },
  {
    label: "Mobile checkout hook",
    query: "useCheckout hook fetch consolidation",
    scopeRef: "services.mobile-app",
  },
  {
    label: "Notification deprecation",
    query: "notification-service v1 deprecation migration",
    scopeRef: "services.notification-service",
  },
];

async function main(): Promise<void> {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }
  if (!VOYAGE_API_KEY) {
    console.error("VOYAGE_API_KEY not set");
    process.exit(1);
  }

  console.log("🔌 Connecting to Atlas...");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  const artifacts = db.collection("artifacts");
  const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

  console.log(`✅ Connected to ${MONGODB_DB}\n`);

  let allPassed = true;

  try {
    for (const probe of PROBES) {
      console.log(`▶ ${probe.label}`);
      console.log(`  query: "${probe.query}"`);
      if (probe.scopeRef) console.log(`  scope: ${probe.scopeRef}`);

      const embeddingResult = await voyage.embed({
        input: [probe.query],
        model: "voyage-3",
      });
      const queryVector = embeddingResult.data?.[0]?.embedding;
      if (!queryVector) {
        console.error("  ❌ no embedding returned");
        allPassed = false;
        continue;
      }

      const filter: Record<string, unknown> = {};
      if (probe.scopeRef) filter.refs = probe.scopeRef;

      const results = await artifacts
        .aggregate([
          {
            $vectorSearch: {
              index: "artifact_vector",
              queryVector,
              path: "embedding",
              numCandidates: 100,
              limit: 5,
              filter,
            },
          },
          {
            $project: {
              _id: 1,
              source: 1,
              content: 1,
              "metadata.curated": 1,
              score: { $meta: "vectorSearchScore" },
            },
          },
        ])
        .toArray();

      if (results.length === 0) {
        console.log("  ⚠️  no hits (vector index may still be building)");
        allPassed = false;
        console.log();
        continue;
      }

      results.forEach((r, i) => {
        const curatedFlag = r.metadata?.curated ? " 📌" : "";
        const snippet = String(r.content).slice(0, 80).replace(/\s+/g, " ");
        console.log(
          `  ${i + 1}. [${r.score.toFixed(3)}] ${r._id}${curatedFlag}\n     ${snippet}…`
        );
      });

      if (probe.expectedTop) {
        const top3 = results.slice(0, 3).map((r) => r._id);
        if (top3.includes(probe.expectedTop)) {
          console.log(`  ✅ expected ${probe.expectedTop} in top 3`);
        } else {
          console.log(
            `  ❌ expected ${probe.expectedTop} in top 3 — got ${top3.join(", ")}`
          );
          allPassed = false;
        }
      }
      console.log();
    }
  } finally {
    await client.close();
  }

  if (!allPassed) {
    console.log(
      "⚠️  Some probes failed. Tune curated content (dataset/seed-data/curated-artifacts.json) or wait for vector indexes to finish building."
    );
    process.exit(1);
  }
  console.log("✅ All probes passed.");
}

main().catch((err) => {
  console.error("\n❌ verify-retrieval failed:", err);
  process.exit(1);
});
