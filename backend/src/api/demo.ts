import type { Request, Response } from "express"
import { collections } from "../db/client.js"
import { writeContext, readContext, claim } from "../mcp/tools.js"

/**
 * POST /api/demo/reset
 *
 * Wipes working_context (which now also holds claims, since claims
 * live as WorkingContextEntry with type=claim).
 */
export async function resetHandler(
  _req: Request,
  res: Response
): Promise<void> {
  const { workingContext } = collections()
  const result = await workingContext.deleteMany({})
  res.json({
    ok: true,
    cleared: { workingContext: result.deletedCount },
  })
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * POST /api/demo/run-scenario
 *
 * Runs a scripted Producer + Consumer demo end-to-end against the same MCP
 * tool handlers a real Claude Code agent would call. Events flow through the
 * same eventBus → SSE pipeline as live agent traffic, so any subscribed
 * dashboard reacts identically.
 *
 * Optional body: { reset?: boolean }  (default true — clears working_context first)
 *
 * The endpoint returns 202 immediately and runs the scenario in the background
 * with small delays between steps so animations have breathing room. Subscribed
 * dashboards see chip → read-path → supersede → claim conflict in sequence.
 */
export async function runScenarioHandler(
  req: Request,
  res: Response
): Promise<void> {
  const reset = req.body?.reset !== false

  // Reply immediately; run the scenario asynchronously
  res.status(202).json({ ok: true, started: true })

  void runScenario(reset).catch((err) => {
    console.error("[demo/run-scenario] error:", err)
  })
}

async function runScenario(reset: boolean): Promise<void> {
  if (reset) {
    const { workingContext } = collections()
    await workingContext.deleteMany({})
    await sleep(300)
  }

  // 1. Producer drafts the transaction schema
  const draft = await writeContext(
    {
      type: "draft_schema",
      content:
        "draft schema for payments-api transaction object: tx_id (string), amount (number), currency (string), status (pending|complete|failed)",
    },
    "producer"
  )
  await sleep(1500)

  // 2. Consumer reads context to discover the draft + grounding
  await readContext(
    {
      query: "transaction schema for payments-api",
      scope: "services.payments-api",
    },
    "consumer"
  )
  await sleep(1500)

  // 3. Producer writes a naive rate-limit decision
  const initialDecision = await writeContext(
    {
      type: "decision",
      content:
        "use express-rate-limit middleware on payments-api /checkout endpoint",
    },
    "producer"
  )
  await sleep(1500)

  // 4. Producer queries grounding — Marcus's slack should surface
  await readContext(
    {
      query: "rate limit memory leak express-rate-limit payments-api",
      scope: "services.payments-api",
    },
    "producer"
  )
  await sleep(1500)

  // 5. Producer writes the lib/limiter decision (Hero 2).
  //    No explicit `supersedes` — the Resolver Agent (BP1) detects the contradiction
  //    with step 3's express-rate-limit decision and retires it automatically.
  //    If Bedrock is unreachable, this falls back to a plain create.
  await writeContext(
    {
      type: "decision",
      content:
        "use lib/limiter (redis-backed) on payments-api /checkout — per Marcus's #platform thread",
      refs: ["slack:marcus-rate-limit-warning", "pr:1247"],
    },
    "producer"
  )
  await sleep(1500)

  // 6. Producer claims checkout.ts
  await claim(
    {
      scope: "services.payments-api/checkout.ts",
      intent: "refactor transaction handling for new schema",
    },
    "producer"
  )
  await sleep(1500)

  // 7. Consumer attempts overlapping claim — should surface as conflict
  await claim(
    {
      scope: "services.payments-api/checkout.ts",
      intent: "add error handling to checkout flow",
    },
    "consumer"
  )

  // Use unused vars so warnings don't fire
  void draft
  void initialDecision
}
