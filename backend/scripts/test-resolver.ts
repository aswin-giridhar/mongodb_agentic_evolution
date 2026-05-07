/**
 * Resolver Agent smoke test (BP1).
 *
 * Runs three crafted writes against the live writeContext pipeline and
 * asserts the Resolver Agent's decisions:
 *
 *   1. INDEPENDENT  → first write of a novel topic        → WRITE, no supersedes
 *   2. EXACT_DUP    → re-write the same content verbatim  → DROP
 *   3. CONTRADICT   → write a contradicting refinement    → WRITE + supersedes
 *
 * Run from the backend/ directory once .env has live AWS credentials
 * (AWS_BEARER_TOKEN_BEDROCK, or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY):
 *
 *   npx tsx scripts/test-resolver.ts
 *
 * Hits real Bedrock + real Atlas. Each case takes ~2s (Haiku + vector search).
 * Wipes and re-seeds the working_context for the seed entity it touches —
 * does NOT clear claims or other entries.
 */

import { connect, disconnect, collections } from "../src/db/client.js"
import { writeContext } from "../src/mcp/tools.js"

type Case = {
  label: string
  expect: "WRITE_PLAIN" | "DROP" | "WRITE_SUPERSEDE"
  expectSupersedeOf?: () => string | null
  call: () => Promise<{
    id: string | null
    dropped?: boolean
    supersede_ids?: string[]
    rationale?: string
  }>
}

let firstId: string | null = null

const cases: Case[] = [
  {
    label: "1. INDEPENDENT — novel content, no candidates",
    expect: "WRITE_PLAIN",
    call: () =>
      writeContext(
        {
          type: "decision",
          content:
            "use redis-backed lib/limiter on payments-api /checkout (resolver smoke test — independent case)",
        },
        "producer"
      ),
  },
  {
    label: "2. EXACT_DUP — same content as case 1",
    expect: "DROP",
    call: () =>
      writeContext(
        {
          type: "decision",
          content:
            "use redis-backed lib/limiter on payments-api /checkout (resolver smoke test — independent case)",
        },
        "producer"
      ),
  },
  {
    label: "3. CONTRADICT — refinement that should retire case 1",
    expect: "WRITE_SUPERSEDE",
    expectSupersedeOf: () => firstId,
    call: () =>
      writeContext(
        {
          type: "decision",
          content:
            "switch payments-api /checkout from lib/limiter back to express-rate-limit pending the redis upgrade (resolver smoke test — contradiction case)",
        },
        "producer"
      ),
  },
]

/**
 * Atlas vector index propagation lag — newly-inserted docs become searchable
 * roughly 1s after insertOne returns. Diagnostic measured 200ms=miss, 1000ms=hit
 * on this cluster. Pad to 1500ms between writes that depend on the previous
 * write being visible. The same lag affects live demo behavior; runScenario()
 * already sleeps 1500ms between steps, which is the same threshold.
 */
const PROPAGATION_WAIT_MS = 1500
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function describeResult(r: Awaited<ReturnType<Case["call"]>>): string {
  if (r.dropped) return `DROP (rationale: ${r.rationale ?? "-"})`
  if (r.supersede_ids && r.supersede_ids.length > 0) {
    return `WRITE+SUPERSEDE id=${r.id} retired=${JSON.stringify(r.supersede_ids)} (rationale: ${r.rationale ?? "-"})`
  }
  return `WRITE id=${r.id} (rationale: ${r.rationale ?? "-"})`
}

function check(label: string, pass: boolean, detail: string): void {
  const tag = pass ? "✅ PASS" : "❌ FAIL"
  console.log(`${tag}  ${label}`)
  console.log(`        ${detail}\n`)
}

async function main(): Promise<void> {
  console.log("[smoke] connecting to Atlas…")
  await connect()

  // Wipe only the smoke-test scope so we don't trash unrelated demo data.
  // The smoke writes resolve to services.payments-api via the keyword "payments-api".
  const { workingContext } = collections()
  const wipe = await workingContext.deleteMany({
    "scope.entity_id": "services.payments-api",
    content: { $regex: /resolver smoke test/ },
  })
  console.log(`[smoke] cleaned ${wipe.deletedCount} prior smoke-test entries\n`)

  let allPassed = true

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    if (i > 0) {
      console.log(
        `[smoke] waiting ${PROPAGATION_WAIT_MS}ms for vector index propagation…`
      )
      await sleep(PROPAGATION_WAIT_MS)
    }
    console.log(`[smoke] ${c.label}`)
    const t0 = Date.now()
    const r = await c.call()
    const ms = Date.now() - t0
    console.log(`        result: ${describeResult(r)} (${ms}ms)`)

    let pass = false
    let detail = ""
    switch (c.expect) {
      case "WRITE_PLAIN":
        pass =
          !r.dropped &&
          r.id !== null &&
          (!r.supersede_ids || r.supersede_ids.length === 0)
        detail = `expected WRITE with no supersedes; got ${describeResult(r)}`
        if (pass && c === cases[0]) firstId = r.id
        break
      case "DROP":
        pass = r.dropped === true && r.id === null
        detail = `expected DROP; got ${describeResult(r)}`
        break
      case "WRITE_SUPERSEDE": {
        const expectedTarget = c.expectSupersedeOf?.()
        pass =
          !r.dropped &&
          r.id !== null &&
          Array.isArray(r.supersede_ids) &&
          r.supersede_ids.length > 0 &&
          (!expectedTarget || r.supersede_ids.includes(expectedTarget))
        detail = expectedTarget
          ? `expected WRITE retiring ${expectedTarget}; got ${describeResult(r)}`
          : `expected WRITE with non-empty supersede_ids; got ${describeResult(r)}`
        break
      }
    }
    check(c.label, pass, detail)
    if (!pass) allPassed = false
  }

  await disconnect()

  if (!allPassed) {
    console.error("[smoke] one or more cases FAILED")
    process.exit(1)
  }
  console.log("[smoke] all cases PASSED")
}

main().catch((err) => {
  console.error("[smoke] crashed:", err)
  process.exit(1)
})
