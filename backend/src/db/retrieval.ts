import { collections } from "./client.js"
import type {
  Artifact,
  EntityId,
  FileId,
  WorkingContextEntry,
} from "../lib/types.js"

export interface RetrievalResult {
  entries: WorkingContextEntry[]
  grounding: Artifact[]
  resolved_entities: EntityId[]
}

/**
 * The MongoDB story for the pitch.
 *
 * 1. Walk dependency graph 1 hop from the seed entity (`$graphLookup` both ways)
 * 2. Vector-search `working_context` filtered to the entity set
 * 3. In parallel, vector-search `artifacts` for grounding (same scope)
 * 4. Rerank in JS: working_context > artifacts; recent supersedes win
 */
export async function retrieve(
  seedEntity: EntityId | FileId,
  queryEmbedding: number[],
  opts: { limit?: number; numCandidates?: number } = {}
): Promise<RetrievalResult> {
  const limit = opts.limit ?? 5
  const numCandidates = opts.numCandidates ?? 100
  const { services, workingContext, artifacts } = collections()

  // Files inherit their service for graph traversal
  const seedService = seedEntity.includes("/")
    ? seedEntity.split("/")[0]
    : seedEntity

  // 1. Resolve neighbour set via $graphLookup
  const [neighbourDoc] = await services
    .aggregate([
      { $match: { _id: seedService } },
      {
        $graphLookup: {
          from: "services",
          startWith: "$_id",
          connectFromField: "depends_on",
          connectToField: "_id",
          as: "downstream",
          maxDepth: 1,
        },
      },
      {
        $graphLookup: {
          from: "services",
          startWith: "$_id",
          connectFromField: "consumed_by",
          connectToField: "_id",
          as: "upstream",
          maxDepth: 1,
        },
      },
      {
        $project: {
          entitySet: {
            $concatArrays: [
              ["$_id"],
              { $map: { input: "$downstream", as: "d", in: "$$d._id" } },
              { $map: { input: "$upstream", as: "u", in: "$$u._id" } },
            ],
          },
        },
      },
    ])
    .toArray()

  const resolved_entities: EntityId[] = neighbourDoc?.entitySet ?? [seedService]

  // 2. + 3. Parallel vector searches.
  // $project drops the 1024-dim embedding array — agents don't need it
  // and including it blows up the MCP response size (>100KB per read).
  const [wcResults, artifactResults] = await Promise.all([
    workingContext
      .aggregate<WorkingContextEntry>([
        {
          $vectorSearch: {
            index: "wc_vector",
            queryVector: queryEmbedding,
            path: "embedding",
            numCandidates,
            limit: limit * 2,
            filter: {
              "scope.entity_id": { $in: resolved_entities },
              active: true,
            },
          },
        },
        { $project: { embedding: 0 } },
      ])
      .toArray(),
    artifacts
      .aggregate<Artifact>([
        {
          $vectorSearch: {
            index: "artifact_vector",
            queryVector: queryEmbedding,
            path: "embedding",
            numCandidates,
            limit: limit * 2,
            filter: { refs: { $in: resolved_entities } },
          },
        },
        { $project: { embedding: 0 } },
      ])
      .toArray(),
  ])

  // 4. Rerank — recency mixed with vector position
  const now = Date.now()
  const scoreEntry = (e: WorkingContextEntry, idx: number): number => {
    const recencyDays = (now - e.created_at) / (1000 * 60 * 60 * 24)
    const recencyScore = Math.max(0, 1 - recencyDays / 30) // decays over 30 days
    const vectorScore = 1 - idx / (wcResults.length || 1)
    return vectorScore * 0.7 + recencyScore * 0.3
  }
  const rerankedEntries = [...wcResults]
    .map((e, i) => ({ entry: e, score: scoreEntry(e, i) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry)

  // Rerank artifacts — vector position + a small boost for curated artifacts
  // (the FE-aligned ones in dataset/seed-data/curated-artifacts.json) so they
  // win ties against auto-generated noise during the demo.
  const scoreArtifact = (a: Artifact, idx: number): number => {
    const vectorScore = 1 - idx / (artifactResults.length || 1)
    const curatedBoost = a.metadata?.curated === true ? 0.15 : 0
    return vectorScore + curatedBoost
  }
  const rerankedArtifacts = [...artifactResults]
    .map((a, i) => ({ artifact: a, score: scoreArtifact(a, i) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.artifact)

  return {
    entries: rerankedEntries,
    grounding: rerankedArtifacts,
    resolved_entities,
  }
}
