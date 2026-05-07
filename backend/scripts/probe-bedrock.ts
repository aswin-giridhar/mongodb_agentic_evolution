/**
 * Probe Bedrock with multiple candidate model IDs to find one that auth lets us
 * invoke. Useful when "AccessDeniedException: Authentication failed" is
 * ambiguous between bad key vs bad model id.
 */
import "dotenv/config"
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime"

const candidates = [
  "anthropic.claude-haiku-4-5",
  "us.anthropic.claude-haiku-4-5-v1:0",
  "anthropic.claude-haiku-4-5-v1:0",
  "anthropic.claude-3-5-haiku-20241022-v1:0",
  "us.anthropic.claude-3-5-haiku-20241022-v1:0",
  "anthropic.claude-3-haiku-20240307-v1:0",
]

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
})

async function probe(modelId: string): Promise<string> {
  try {
    const cmd = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      }),
    })
    const res = await client.send(cmd)
    const text = new TextDecoder().decode(res.body)
    return `OK — ${text.slice(0, 100)}`
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
    return `${e.name ?? "Error"} ${e.$metadata?.httpStatusCode ?? "?"}: ${(e.message ?? String(err)).slice(0, 180)}`
  }
}

async function main() {
  console.log(`region: ${process.env.AWS_REGION}`)
  console.log(`bearer token present: ${!!process.env.AWS_BEARER_TOKEN_BEDROCK}`)
  console.log(`access key present: ${!!process.env.AWS_ACCESS_KEY_ID}`)
  console.log("")
  for (const id of candidates) {
    const result = await probe(id)
    console.log(`  ${id}\n    → ${result}\n`)
  }
}

main().catch((e) => {
  console.error("crash:", e)
  process.exit(1)
})
