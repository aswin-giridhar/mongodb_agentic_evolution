import { env } from "../lib/env.js"

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"

interface VoyageResponse {
  data: { embedding: number[]; index: number }[]
}

/**
 * Embed one or more texts with Voyage AI.
 * Returns a 1024-dim vector per input (for `voyage-3`).
 *
 * Voyage's batch limit is 32 inputs per request. Caller is responsible for chunking.
 */
export async function embed(input: string | string[]): Promise<number[][]> {
  if (!env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY not set")
  }
  const inputs = Array.isArray(input) ? input : [input]
  if (inputs.length > 32) {
    throw new Error(`Voyage batch size capped at 32; got ${inputs.length}`)
  }

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: inputs,
      model: env.VOYAGE_MODEL,
      input_type: "document",
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Voyage embed failed (${res.status}): ${body}`)
  }

  const json = (await res.json()) as VoyageResponse
  // Sort by index to preserve input order (Voyage usually returns sorted but be defensive)
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embed(text)
  if (!vec) throw new Error("Voyage returned no embedding")
  return vec
}
