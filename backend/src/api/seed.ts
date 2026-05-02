import type { Request, Response } from "express"
import { collections } from "../db/client.js"
import {
  toFEArtifact,
  type ArtifactFE,
  type PersonFE,
  type ServiceFE,
} from "../lib/types.js"

/**
 * Build the seed payload sent to the FE on SSE connect.
 *
 * Shape matches the FE's `kind: "seed"` event:
 *   { services, people, artifacts }
 *
 * Stamps `type: "service" | "person"` discriminators so the FE
 * union narrowing works directly.
 */
export async function buildSeedPayload(): Promise<{
  services: ServiceFE[]
  people: PersonFE[]
  artifacts: ArtifactFE[]
}> {
  const { services, people, artifacts } = collections()
  const [s, p, a] = await Promise.all([
    services.find({}).toArray(),
    people.find({}).toArray(),
    // Strip embeddings (heavy) before serializing to FE
    artifacts.find({}, { projection: { embedding: 0 } }).toArray(),
  ])

  return {
    services: s.map((svc) => ({ ...svc, type: "service" as const })),
    people: p.map((per) => ({
      ...per,
      type: "person" as const,
      expertise_evidence: per.expertise_evidence ?? [],
    })),
    artifacts: a
      .map((art) => toFEArtifact(art as never))
      .filter((x): x is ArtifactFE => x !== null),
  }
}

/**
 * GET /api/seed — fallback HTTP endpoint mirroring the SSE seed.
 * Useful for one-off curl sanity checks; FE doesn't normally call this.
 */
export async function getSeed(_req: Request, res: Response): Promise<void> {
  const payload = await buildSeedPayload()
  res.json(payload)
}
