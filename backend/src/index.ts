import { randomUUID } from "crypto"
import cors from "cors"
import express from "express"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { connect, disconnect } from "./db/client.js"
import { env } from "./lib/env.js"
import { getSeed } from "./api/seed.js"
import { streamHandler } from "./api/stream.js"
import { resetHandler } from "./api/demo.js"
import { buildMcpServer } from "./mcp/server.js"
import { preWarmCatalogue } from "./mcp/resolver.js"
import type { Agent } from "./lib/types.js"

async function main(): Promise<void> {
  await connect()

  // Pre-warm the resolver's entity catalogue so the first call is fast
  await preWarmCatalogue().catch((err) =>
    console.warn("[startup] catalogue pre-warm failed (continuing):", err)
  )

  const app = express()

  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS,
      credentials: false,
    })
  )

  // Health
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true })
  })

  // Dashboard endpoints
  app.get("/api/seed", async (req, res) => {
    try {
      await getSeed(req, res)
    } catch (err) {
      console.error("/api/seed failed:", err)
      res.status(500).json({ error: String(err) })
    }
  })
  app.get("/api/stream", streamHandler)
  app.post("/api/demo/reset", express.json(), async (req, res) => {
    try {
      await resetHandler(req, res)
    } catch (err) {
      console.error("/api/demo/reset failed:", err)
      res.status(500).json({ error: String(err) })
    }
  })

  // MCP HTTP transports — one per agent identity
  const transports = new Map<Agent, StreamableHTTPServerTransport>()

  for (const agent of ["producer", "consumer"] as Agent[]) {
    const server = buildMcpServer(agent)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    })
    await server.connect(transport)
    transports.set(agent, transport)
  }

  const mcpJson = express.json({ limit: "4mb" })
  for (const agent of ["producer", "consumer"] as Agent[]) {
    const transport = transports.get(agent)!
    app.all(`/mcp/${agent}`, mcpJson, async (req, res) => {
      try {
        await transport.handleRequest(req, res, req.body)
      } catch (err) {
        console.error(`MCP ${agent} request failed:`, err)
        if (!res.headersSent) {
          res.status(500).json({ error: String(err) })
        }
      }
    })
  }

  app.listen(env.PORT, () => {
    console.log(
      `[substrate] listening on http://localhost:${env.PORT}\n` +
        `  GET  /healthz\n` +
        `  GET  /api/seed\n` +
        `  GET  /api/stream  (sends seed on connect)\n` +
        `  POST /api/demo/reset\n` +
        `  ALL  /mcp/producer\n` +
        `  ALL  /mcp/consumer`
    )
  })

  const shutdown = async (): Promise<void> => {
    console.log("[substrate] shutting down…")
    await disconnect()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((err) => {
  console.error("[substrate] fatal startup error:", err)
  process.exit(1)
})
