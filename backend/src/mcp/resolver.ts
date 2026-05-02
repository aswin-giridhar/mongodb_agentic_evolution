import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime"
import { createHash } from "crypto"
import { env } from "../lib/env.js"
import { collections } from "../db/client.js"
import type { EntityId } from "../lib/types.js"

const cache = new Map<string, EntityId>()
let bedrock: BedrockRuntimeClient | null = null
let entityCatalogue: Catalogue | null = null

function client(): BedrockRuntimeClient {
  if (!bedrock) {
    bedrock = new BedrockRuntimeClient({
      region: env.AWS_REGION,
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined, // fall back to AWS default credential chain
    })
  }
  return bedrock
}

interface Catalogue {
  services: string[]
  people: string[]
  // Map from a lowercase keyword → entity_id, for the keyword fallback
  // when Bedrock isn't available. Includes service short names, file
  // basenames (without extension) declared as hot_files, and person handles.
  keywordIndex: Array<{ keyword: string; id: EntityId }>
}

async function loadCatalogue(): Promise<Catalogue> {
  if (entityCatalogue) return entityCatalogue
  const { services, people } = collections()
  const [s, p] = await Promise.all([
    services.find({}, { projection: { _id: 1, hot_files: 1 } }).toArray(),
    people.find({}, { projection: { _id: 1, name: 1, handle: 1 } }).toArray(),
  ])

  const keywordIndex: Array<{ keyword: string; id: EntityId }> = []
  for (const svc of s) {
    const id = String(svc._id)
    const shortName = id.replace(/^services\./, "").toLowerCase()
    keywordIndex.push({ keyword: shortName, id })
    // Also index file basenames (e.g., "checkout" from "src/routes/checkout.ts")
    for (const f of (svc.hot_files ?? [])) {
      const base = f.split("/").pop()?.replace(/\.\w+$/, "").toLowerCase()
      if (base && base.length >= 4) keywordIndex.push({ keyword: base, id })
    }
  }
  for (const per of p) {
    const id = String(per._id)
    const shortName = id.replace(/^people\./, "").toLowerCase()
    keywordIndex.push({ keyword: shortName, id })
    if (per.name) keywordIndex.push({ keyword: per.name.toLowerCase(), id })
    if (per.handle) keywordIndex.push({ keyword: per.handle.replace(/^@/, "").toLowerCase(), id })
  }
  // Longest keyword wins (more specific match). Sort once.
  keywordIndex.sort((a, b) => b.keyword.length - a.keyword.length)

  entityCatalogue = {
    services: s.map((x) => String(x._id)),
    people: p.map((x) => String(x._id)),
    keywordIndex,
  }
  return entityCatalogue
}

function keywordResolve(content: string, cat: Catalogue): EntityId | null {
  const lower = content.toLowerCase()
  for (const { keyword, id } of cat.keywordIndex) {
    if (lower.includes(keyword)) return id
  }
  return null
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16)
}

const SYSTEM_PROMPT = (svc: string[], ppl: string[]) => `You are Substrate's entity resolver. Given free-text content from an engineering agent, return strict JSON with the most likely entity_id from the provided list.

Available services: ${svc.join(", ")}
Available people:   ${ppl.join(", ")}

Rules:
- Choose the most specific entity. Prefer service over person if both apply.
- If genuinely ambiguous, pick the service most often mentioned.
- Never invent an entity_id. It MUST be from the lists above.

Output strictly: {"entity_id": "<id>", "confidence": 0.0-1.0}`

/**
 * Resolve a free-text snippet to its most likely entity_id.
 * Cached by content hash for the day. ~$0.001 per cache miss.
 */
export async function resolveEntity(content: string): Promise<EntityId> {
  const key = hash(content)
  const cached = cache.get(key)
  if (cached) return cached

  const cat = await loadCatalogue()

  // First pass: keyword match. Cheap, deterministic, works without AWS.
  const keywordHit = keywordResolve(content, cat)
  if (keywordHit) {
    cache.set(key, keywordHit)
    return keywordHit
  }

  const fallback: EntityId = cat.services[0] ?? "services.unknown"

  const cmd = new InvokeModelCommand({
    modelId: env.BEDROCK_MODEL_RESOLVER,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 100,
      system: SYSTEM_PROMPT(cat.services, cat.people),
      messages: [{ role: "user", content }],
    }),
  })

  try {
    const res = await client().send(cmd)
    const decoded = new TextDecoder().decode(res.body)
    const parsed = JSON.parse(decoded) as { content: { text: string }[] }
    const text = parsed.content?.[0]?.text ?? "{}"
    // Sometimes the model wraps the JSON; extract first {...}
    const match = text.match(/\{[\s\S]*\}/)
    const obj = match ? (JSON.parse(match[0]) as { entity_id?: string }) : {}
    const id = obj.entity_id

    const valid =
      id && (cat.services.includes(id) || cat.people.includes(id))
    const resolved = valid ? id : fallback
    cache.set(key, resolved)
    return resolved
  } catch (err) {
    console.warn("[resolver] Bedrock call failed, returning fallback:", err)
    return fallback
  }
}

export function preWarmCatalogue(): Promise<unknown> {
  return loadCatalogue()
}
