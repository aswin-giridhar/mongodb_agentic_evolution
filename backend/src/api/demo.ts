import type { Request, Response } from "express"
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime"
import { collections } from "../db/client.js"
import { env } from "../lib/env.js"
import { eventBus } from "../lib/eventBus.js"
import {
  claim,
  listOpenQuestions,
  readContext,
  release,
  writeContext,
} from "../mcp/tools.js"
import type { Agent } from "../lib/types.js"

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

// ============================================================================
// POST /api/demo/agent-prompt
// ============================================================================
//
// Free-form agent prompt: the dashboard sends a natural-language prompt + an
// agent identity, and the backend runs a Bedrock tool-use loop with the 5 MCP
// tools as available functions. Whatever tools the model picks fire as that
// agent — same code path as a real Claude Code MCP client. Lets you drive the
// demo from the dashboard without an external Claude Code instance running.

interface AgentPromptBody {
  agent?: Agent
  prompt?: string
  /** Optional cap on the tool-use loop depth (default 4). */
  maxTurns?: number
}

const TOOL_DEFS = [
  {
    name: "read_context",
    description:
      "Retrieve relevant working context entries (drafts, decisions, claims, investigations, open_questions) and grounding artifacts (slack/PRs/jira) about a specific service or file. Use this before writing if you need to know what others have already said.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural-language description of what you're looking for (e.g., 'rate limiting decisions on payments-api').",
        },
        scope: {
          type: "string",
          description:
            "Optional EntityId (e.g., 'services.payments-api') to scope retrieval. If omitted, the resolver picks one from the query text.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "write_context",
    description:
      "Write a new working-context entry: a draft schema, decision, claim, investigation, or open question. The Resolver Agent will adjudicate — it may DROP redundant writes or merge yours into a synthesis that supersedes older notes. Use this whenever you've concluded something about a service or file.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "draft_schema",
            "decision",
            "claim",
            "investigation",
            "open_question",
          ],
        },
        content: {
          type: "string",
          description:
            "The note's text. Be concrete — mention the service / file / API / decision so the Resolver can scope it correctly.",
        },
        refs: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional artifact ids that ground this note (e.g., 'slack:marcus-rate-limit-warning', 'pr:1247').",
        },
      },
      required: ["type", "content"],
    },
  },
  {
    name: "claim",
    description:
      "Take exclusive ownership of a service or file scope while you work on it. Surfaces a conflict event (no DB write) if another agent already holds the same scope.",
    input_schema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description:
            "EntityId or FileId (e.g., 'services.payments-api/checkout.ts').",
        },
        intent: {
          type: "string",
          description: "Short description of the work being claimed.",
        },
      },
      required: ["scope", "intent"],
    },
  },
  {
    name: "release",
    description:
      "Release a previously held claim with an outcome note. Use after finishing the work the claim was taken for.",
    input_schema: {
      type: "object",
      properties: {
        claim_id: { type: "string" },
        outcome: { type: "string" },
      },
      required: ["claim_id", "outcome"],
    },
  },
  {
    name: "list_open_questions",
    description:
      "List unresolved open_question entries, optionally scoped to a single service or person.",
    input_schema: {
      type: "object",
      properties: {
        scope: { type: "string" },
      },
    },
  },
] as const

const SYSTEM_PROMPT = (agent: Agent) =>
  `You are the ${agent} agent in Substrate, a shared context layer for engineering AI agents at Acme Robotics. The user (a teammate driving the demo) gives you a task to perform; you respond by calling the substrate tools to read or write working context.

You have access to:
- 6 services: services.auth-service, services.payments-api, services.notification-service, services.mobile-app, services.admin-dashboard, services.search-api
- 6 people: people.marcus, people.elena, people.priya, people.raj, people.sara, people.james
- artifacts (slack threads, PRs, jira tickets) reachable via read_context grounding

GUIDELINES
- Prefer read_context before write_context if you might be writing something already known.
- For schemas, decisions, investigations, claims, and open questions, use write_context with the appropriate type. The Resolver Agent will decide whether to merge with existing notes.
- When writing, be specific: name the service/file/API in the content so the resolver can scope correctly.
- Don't fabricate artifact ids; only use ids you've seen in retrieval results.
- After your tools have done what was asked, give a brief one-sentence summary as final assistant text. Don't repeat the tool inputs verbatim.`

interface BedrockToolUse {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

interface BedrockTextBlock {
  type: "text"
  text: string
}

type BedrockContentBlock = BedrockTextBlock | BedrockToolUse

interface BedrockMessageResponse {
  content: BedrockContentBlock[]
  stop_reason: string
}

let bedrockForLoop: BedrockRuntimeClient | null = null
function bedrockClient(): BedrockRuntimeClient {
  if (!bedrockForLoop) {
    bedrockForLoop = new BedrockRuntimeClient({
      region: env.AWS_REGION,
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined, // bearer token / default chain
    })
  }
  return bedrockForLoop
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  agent: Agent
): Promise<unknown> {
  switch (name) {
    case "read_context":
      return readContext(input as { query: string; scope?: string }, agent)
    case "write_context":
      return writeContext(
        input as {
          type:
            | "draft_schema"
            | "decision"
            | "claim"
            | "investigation"
            | "open_question"
          content: string
          refs?: string[]
        },
        agent
      )
    case "claim":
      return claim(input as { scope: string; intent: string }, agent)
    case "release":
      return release(input as { claim_id: string; outcome: string }, agent)
    case "list_open_questions":
      return listOpenQuestions(input as { scope?: string }, agent)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export async function agentPromptHandler(
  req: Request,
  res: Response
): Promise<void> {
  const body = (req.body ?? {}) as AgentPromptBody
  const { agent, prompt } = body
  const maxTurns = Math.max(1, Math.min(8, body.maxTurns ?? 4))

  if (agent !== "producer" && agent !== "consumer") {
    res.status(400).json({ error: "agent must be 'producer' or 'consumer'" })
    return
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt must be a non-empty string" })
    return
  }

  // Reply immediately; loop runs in the background. Events stream via SSE.
  res.status(202).json({ ok: true, started: true })

  void runAgentLoop(agent, prompt, maxTurns).catch((err) => {
    console.error(`[agent-prompt:${agent}] loop failed:`, err)
    eventBus.emitEvent({
      type: "agent.thought",
      payload: {
        agent,
        text: `agent loop failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    })
  })
}

async function runAgentLoop(
  agent: Agent,
  userPrompt: string,
  maxTurns: number
): Promise<void> {
  console.log(`[agent-prompt:${agent}] prompt: ${userPrompt.slice(0, 120)}…`)

  // Anthropic Messages API on Bedrock — uses content-block message shape.
  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: userPrompt },
  ]

  for (let turn = 0; turn < maxTurns; turn++) {
    const cmd = new InvokeModelCommand({
      modelId: env.BEDROCK_MODEL_RESOLVER,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        system: SYSTEM_PROMPT(agent),
        tools: TOOL_DEFS,
        messages,
      }),
    })

    const result = await bedrockClient().send(cmd)
    const decoded = new TextDecoder().decode(result.body)
    const parsed = JSON.parse(decoded) as BedrockMessageResponse

    // Surface the model's text reasoning (if any) as agent.thought for
    // dashboard visibility — matches the SSE event shape the FE expects.
    for (const block of parsed.content) {
      if (block.type === "text" && block.text.trim()) {
        eventBus.emitEvent({
          type: "agent.thought",
          payload: { agent, text: block.text.trim() },
        })
      }
    }

    if (parsed.stop_reason !== "tool_use") {
      // Model finished — no more tool calls requested.
      console.log(
        `[agent-prompt:${agent}] loop ended after ${turn + 1} turn(s); stop_reason=${parsed.stop_reason}`
      )
      return
    }

    // Execute every tool_use block, gather tool_results.
    const toolUses = parsed.content.filter(
      (b): b is BedrockToolUse => b.type === "tool_use"
    )
    const toolResults: Array<{
      type: "tool_result"
      tool_use_id: string
      content: string
      is_error?: boolean
    }> = []

    for (const tu of toolUses) {
      console.log(
        `[agent-prompt:${agent}] tool_use ${tu.name} args=${JSON.stringify(tu.input).slice(0, 160)}`
      )
      try {
        const out = await executeTool(tu.name, tu.input, agent)
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          // Trim huge tool results so the next round-trip stays small.
          content: JSON.stringify(out).slice(0, 4000),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[agent-prompt:${agent}] tool error: ${msg}`)
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `error: ${msg}`,
          is_error: true,
        })
      }
    }

    // Push the model's full response and the tool_results back into messages.
    messages.push({ role: "assistant", content: parsed.content })
    messages.push({ role: "user", content: toolResults })
  }

  console.log(
    `[agent-prompt:${agent}] loop hit max_turns=${maxTurns} without stop`
  )
  eventBus.emitEvent({
    type: "agent.thought",
    payload: {
      agent,
      text: `(loop reached max ${maxTurns} turns and was cut off)`,
    },
  })
}
