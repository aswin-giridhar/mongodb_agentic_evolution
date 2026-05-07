/**
 * Diagnostic: confirm wc_vector index existence and propagation.
 *
 *   1. Count active working_context docs scoped to payments-api
 *   2. Run a vector search with one of their embeddings as the query and
 *      see what comes back
 *   3. Insert a fresh doc, then probe at +500ms, +2s, +5s to measure
 *      propagation lag
 */
import { connect, disconnect, collections } from "../src/db/client.js"
import { embedOne } from "../src/embed/voyage.js"
import { getNeighborhood, searchCandidates } from "../src/db/retrieval.js"
import type { WorkingContextEntry } from "../src/lib/types.js"
import { randomUUID } from "crypto"

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  await connect()
  const { workingContext, services } = collections()

  console.log("\n=== 1. existing data ===")
  const total = await workingContext.countDocuments({})
  const activeForPayments = await workingContext.countDocuments({
    "scope.entity_id": "services.payments-api",
    active: true,
  })
  console.log(`  total working_context docs: ${total}`)
  console.log(`  active for services.payments-api: ${activeForPayments}`)

  const paymentsService = await services.findOne({ _id: "services.payments-api" })
  console.log(`  services.payments-api row exists: ${!!paymentsService}`)
  if (paymentsService) {
    console.log(`  depends_on: ${JSON.stringify(paymentsService.depends_on)}`)
    console.log(`  consumed_by: ${JSON.stringify(paymentsService.consumed_by)}`)
  }

  console.log("\n=== 2. neighborhood walk ===")
  const neighborhood = await getNeighborhood("services.payments-api")
  console.log(`  neighborhood: ${JSON.stringify(neighborhood)}`)

  console.log("\n=== 3. vector search on existing data ===")
  // Pull an existing doc with an embedding, then search with that exact embedding.
  // We expect at least 1 candidate (itself), proving the index is live.
  const seed = await workingContext.findOne({
    "scope.entity_id": { $in: neighborhood },
    active: true,
  })
  if (!seed) {
    console.log("  no existing active docs in neighborhood — skipping")
  } else {
    console.log(`  seed _id: ${seed._id}, content: ${seed.content.slice(0, 80)}...`)
    const emb = (seed as WorkingContextEntry).embedding
    if (!Array.isArray(emb) || emb.length === 0) {
      console.log("  ⚠️  seed has no embedding field — index can't be doing its job")
    } else {
      const hits = await searchCandidates(neighborhood, emb, { limit: 5 })
      console.log(`  $vectorSearch returned ${hits.length} hits with seed's own embedding`)
      hits.slice(0, 3).forEach((h, i) => {
        console.log(`    [${i}] ${h._id} — ${h.content.slice(0, 80)}...`)
      })
      if (hits.length === 0) {
        console.log("  ⚠️  zero hits — wc_vector index is missing, building, or filter-broken")
      }
    }
  }

  console.log("\n=== 4. propagation timing test ===")
  const probeContent = `diag probe ${randomUUID().slice(0, 8)} payments-api lib/limiter test`
  const probeEmbedding = await embedOne(probeContent)
  const probeId = `wc_diag_${randomUUID().slice(0, 8)}`
  const probeDoc: WorkingContextEntry = {
    _id: probeId,
    type: "investigation",
    author: "producer",
    scope: { entity_id: "services.payments-api" },
    content: probeContent,
    embedding: probeEmbedding,
    supersedes: [],
    superseded_by: null,
    refs: [],
    active: true,
    created_at: Date.now(),
  }
  await workingContext.insertOne(probeDoc)
  console.log(`  inserted ${probeId}`)

  for (const delay of [200, 1000, 3000, 8000]) {
    await sleep(delay)
    const hits = await searchCandidates(neighborhood, probeEmbedding, { limit: 5 })
    const found = hits.find((h) => h._id === probeId)
    console.log(`  +${delay}ms: ${hits.length} total hits, probe found=${!!found}`)
  }

  // cleanup
  await workingContext.deleteOne({ _id: probeId })

  await disconnect()
}

main().catch((err) => {
  console.error("crash:", err)
  process.exit(1)
})
