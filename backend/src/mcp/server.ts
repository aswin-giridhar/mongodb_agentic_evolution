import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import {
  ClaimInput,
  ListOpenQuestionsInput,
  ReadContextInput,
  ReleaseInput,
  WriteContextInput,
  claim,
  listOpenQuestions,
  readContext,
  release,
  writeContext,
} from "./tools.js"
import type { Agent } from "../lib/types.js"

/**
 * Build a stateless MCP server bound to a specific agent identity.
 *
 * One server instance per (agent, request) — this lets us stamp
 * every tool call with the calling agent without needing AsyncLocalStorage.
 */
export function buildMcpServer(agent: Agent): Server {
  const server = new Server(
    { name: "substrate", version: "0.1.0" },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "read_context",
        description:
          "Retrieve relevant working context (drafts, decisions, claims, investigations) and grounding artifacts for a query, scoped to an entity.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Natural-language query" },
            scope: {
              type: "string",
              description:
                "Optional EntityId or FileId scope (e.g., services.payments-api). If omitted, resolved from query.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "write_context",
        description:
          "Write a piece of in-flight working context: a draft schema, decision, claim, investigation note, or open question.",
        inputSchema: {
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
              description: "Free-text content; entity scope is auto-resolved.",
            },
            supersedes: {
              type: "string",
              description: "Optional id of a prior entry this supersedes.",
            },
            refs: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of artifact ids that ground this entry.",
            },
          },
          required: ["type", "content"],
        },
      },
      {
        name: "claim",
        description:
          "Claim ownership of a scope (a service or a specific file) for in-flight work. Surfaces conflicts if already held.",
        inputSchema: {
          type: "object",
          properties: {
            scope: { type: "string", description: "EntityId or FileId" },
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
        description: "Release a previously held claim with an outcome note.",
        inputSchema: {
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
          "List active open questions, optionally scoped to a single entity.",
        inputSchema: {
          type: "object",
          properties: {
            scope: { type: "string" },
          },
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params
    const args = rawArgs ?? {}

    try {
      let result: unknown
      switch (name) {
        case "read_context":
          result = await readContext(ReadContextInput.parse(args), agent)
          break
        case "write_context":
          result = await writeContext(WriteContextInput.parse(args), agent)
          break
        case "claim":
          result = await claim(ClaimInput.parse(args), agent)
          break
        case "release":
          result = await release(ReleaseInput.parse(args), agent)
          break
        case "list_open_questions":
          result = await listOpenQuestions(
            ListOpenQuestionsInput.parse(args),
            agent
          )
          break
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      }
    }
  })

  return server
}
