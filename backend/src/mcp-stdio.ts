import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { connect } from "./db/client.js"
import { buildMcpServer } from "./mcp/server.js"
import { preWarmCatalogue } from "./mcp/resolver.js"
import type { Agent } from "./lib/types.js"

/**
 * Stdio fallback entry — used when Claude Code's HTTP MCP transport flakes.
 *
 * Each Claude Code instance spawns its own copy of this binary with
 * AGENT_NAME=producer or consumer in the .mcp.json env block.
 *
 * Note: Change Streams + SSE are NOT served from here. Run the main
 * `npm run dev` process alongside this for the dashboard pipeline.
 */
async function main(): Promise<void> {
  const agent = (process.env.AGENT_NAME as Agent) ?? null
  if (agent !== "producer" && agent !== "consumer") {
    console.error(
      "AGENT_NAME env var must be 'producer' or 'consumer'. Got:",
      agent
    )
    process.exit(1)
  }

  await connect()
  await preWarmCatalogue().catch(() => {
    /* non-fatal */
  })

  const server = buildMcpServer(agent)
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // stdio MCP runs until parent disconnects
  console.error(`[substrate-stdio:${agent}] ready`)
}

main().catch((err) => {
  console.error("[substrate-stdio] fatal:", err)
  process.exit(1)
})
