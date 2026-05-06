import { randomUUID } from "crypto"
import cors from "cors"
import express, { type Request, type Response } from "express"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { connect, disconnect } from "./db/client.js"
import { env } from "./lib/env.js"
import { getSeed } from "./api/seed.js"
import { streamHandler } from "./api/stream.js"
import { resetHandler, runScenarioHandler } from "./api/demo.js"
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
  app.post("/api/demo/run-scenario", express.json(), async (req, res) => {
    try {
      await runScenarioHandler(req, res)
    } catch (err) {
      console.error("/api/demo/run-scenario failed:", err)
      if (!res.headersSent) {
        res.status(500).json({ error: String(err) })
      }
    }
  })

  // MCP HTTP transports — keyed by session id, per-agent.
  // Each MCP client (one per Claude Code instance) gets its own
  // Server + Transport pair on first initialize. Session id flows
  // back to the client via the Mcp-Session-Id response header and
  // is sent on every subsequent request.
  const transports: Record<string, StreamableHTTPServerTransport> = {}
  const mcpJson = express.json({ limit: "4mb" })

  async function handleMcp(agent: Agent, req: Request, res: Response): Promise<void> {
    const sessionId = (req.headers["mcp-session-id"] as string | undefined) ?? undefined
    let transport: StreamableHTTPServerTransport

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId]
    } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
      // Spin up a fresh Server + Transport for this client
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport
          console.log(`[mcp:${agent}] session ${id} opened`)
        },
      })
      transport.onclose = () => {
        const id = transport.sessionId
        if (id && transports[id]) {
          delete transports[id]
          console.log(`[mcp:${agent}] session ${id} closed`)
        }
      }
      const server = buildMcpServer(agent)
      await server.connect(transport)
    } else {
      // Reject without OAuth-shaped error so the client doesn't try to register.
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Bad Request: No valid session ID" },
        id: null,
      })
      return
    }

    await transport.handleRequest(req, res, req.body)
  }

  for (const agent of ["producer", "consumer"] as Agent[]) {
    app.all(`/mcp/${agent}`, mcpJson, async (req, res) => {
      try {
        await handleMcp(agent, req, res)
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
