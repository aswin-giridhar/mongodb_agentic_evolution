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
let entityCatalogue: { services: string[]; people: string[] } | null = null

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

async function loadCatalogue(): Promise<{ services: string[]; people: string[] }> {
  if (entityCatalogue) return entityCatalogue
  const { services, people } = collections()
  const [s, p] = await Promise.all([
    services.find({}, { projection: { _id: 1 } }).toArray(),
    people.find({}, { projection: { _id: 1 } }).toArray(),
  ])
  entityCatalogue = {
    services: s.map((x) => String(x._id)),
    people: p.map((x) => String(x._id)),
  }
  return entityCatalogue
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
