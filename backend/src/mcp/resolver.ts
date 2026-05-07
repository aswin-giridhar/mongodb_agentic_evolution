import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime"
import { createHash } from "crypto"
import { env } from "../lib/env.js"
import { collections } from "../db/client.js"
import type {
  EntityId,
  ResolverDecision,
  WorkingContextEntry,
} from "../lib/types.js"

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

// ============================================================================
// Resolver Agent: adjudicate (BP1 — supersedes / compaction)
// ============================================================================
//
// The Resolver Agent's second job. Given a new note about to be written and
// the top-k existing candidates from the same retrieval-scope neighborhood,
// decide:
//
//   DROP  → the new note is fully redundant; do not write
//   WRITE → insert content (raw passthrough OR a Resolver-authored merge that
//           preserves still-valid parts of superseded candidates)
//
// Failure mode is fail-open: any Bedrock error, malformed JSON, unknown
// supersede id, or low confidence falls through to a plain WRITE of the raw
// agent input. Substrate can tolerate a slightly noisy active set; it cannot
// tolerate silently dropping correct context.

const ADJUDICATE_SYSTEM_PROMPT = `You are Substrate's Resolver Agent. You decide whether a new working-context note about to be written should:
  (a) be DROPPED as fully redundant with an existing note, or
  (b) be WRITTEN as-is (independent of existing notes), or
  (c) be WRITTEN as a synthesized merge that supersedes one or more existing notes
      (because the new note refines, updates, or contradicts them).

You will receive the new note's content and up to 5 candidate existing notes
(retrieved by vector similarity in the same 1-hop service neighborhood). Each
candidate has an _id, type, content, and created_at timestamp.

DECISION RULES
- DROP only when the new note adds NO information beyond what an existing
  candidate already says. Near-duplicates with even a small new fact are NOT drops.
- WRITE with empty supersede_ids when the new note is independent — different
  topic, different facts, no overlap to merge.
- WRITE with non-empty supersede_ids when the new note refines, updates, or
  contradicts one or more candidates. In this case, the "content" you return
  MUST be a synthesized merge: include the new information from the agent's
  input AND any still-valid information from the superseded candidates that is
  not contradicted. Do not lose context from the old notes.
- supersede_ids MUST be a subset of the candidate _ids you were given. Never
  invent ids.
- Prefer fewer supersedes. Only retire a candidate if the new note actually
  replaces or refines it.

OUTPUT: strict JSON, no prose:
{"action":"DROP"|"WRITE","supersede_ids":["..."],"content":"...","rationale":"<one sentence>"}

For DROP, "content" should be empty string and supersede_ids should be empty.
For WRITE with empty supersede_ids, "content" should equal the agent's input verbatim.
For WRITE with non-empty supersede_ids, "content" is your synthesized merge.

The rationale field is required and is logged for audit. One sentence, plain English.`

interface CandidateForPrompt {
  _id: string
  type: string
  content: string
  created_at: number
}

function buildAdjudicatePrompt(
  newContent: string,
  candidates: CandidateForPrompt[]
): string {
  const candidateBlock = candidates.length === 0
    ? "(no existing candidates in this neighborhood)"
    : candidates
        .map(
          (c, i) =>
            `Candidate ${i + 1}:\n  _id: ${c._id}\n  type: ${c.type}\n  created_at: ${new Date(c.created_at).toISOString()}\n  content: ${c.content}`
        )
        .join("\n\n")

  return `NEW NOTE (to be written):
${newContent}

EXISTING CANDIDATES (top-${candidates.length} by vector similarity, active=true):
${candidateBlock}

Return your decision as strict JSON.`
}

/**
 * Adjudicate a write. Returns the Resolver Agent's decision; never throws —
 * failure modes degrade to a plain WRITE of the raw input.
 */
export async function adjudicate(
  newContent: string,
  candidates: WorkingContextEntry[]
): Promise<ResolverDecision> {
  const failOpen: ResolverDecision = {
    action: "WRITE",
    supersede_ids: [],
    content: newContent,
    rationale: "resolver_failed_open",
  }

  // Trivial short-circuit: no candidates means nothing to merge or supersede.
  // Save the Bedrock round-trip; just write.
  if (candidates.length === 0) {
    return {
      action: "WRITE",
      supersede_ids: [],
      content: newContent,
      rationale: "no_candidates_in_neighborhood",
    }
  }

  const candidateIds = new Set(candidates.map((c) => c._id))
  const promptBody = buildAdjudicatePrompt(
    newContent,
    candidates.map((c) => ({
      _id: c._id,
      type: c.type,
      content: c.content,
      created_at: c.created_at,
    }))
  )

  const cmd = new InvokeModelCommand({
    modelId: env.BEDROCK_MODEL_RESOLVER,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      system: ADJUDICATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: promptBody }],
    }),
  })

  try {
    const res = await client().send(cmd)
    const decoded = new TextDecoder().decode(res.body)
    const parsed = JSON.parse(decoded) as { content: { text: string }[] }
    const text = parsed.content?.[0]?.text ?? "{}"
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return failOpen
    const obj = JSON.parse(match[0]) as Partial<ResolverDecision>

    // Validate shape and contents — degrade to fail-open on any inconsistency.
    if (obj.action !== "DROP" && obj.action !== "WRITE") return failOpen
    const supersede_ids = Array.isArray(obj.supersede_ids)
      ? obj.supersede_ids.filter(
          (id): id is string => typeof id === "string" && candidateIds.has(id)
        )
      : []
    const rationale =
      typeof obj.rationale === "string" && obj.rationale.length > 0
        ? obj.rationale
        : "resolver_no_rationale"

    if (obj.action === "DROP") {
      // DROP must not carry supersede_ids; if it does, the model contradicted
      // itself — fail open to avoid a silent retire.
      if (supersede_ids.length > 0) return failOpen
      return {
        action: "DROP",
        supersede_ids: [],
        content: "",
        rationale,
      }
    }

    // action === "WRITE"
    const content =
      typeof obj.content === "string" && obj.content.length > 0
        ? obj.content
        : newContent // fall back to raw input if Resolver Agent returned empty
    return {
      action: "WRITE",
      supersede_ids,
      content,
      rationale,
    }
  } catch (err) {
    console.warn("[resolver] adjudicate Bedrock call failed:", err)
    return failOpen
  }
}
