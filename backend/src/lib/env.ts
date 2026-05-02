import "dotenv/config"
import { z } from "zod"

const schema = z.object({
  // MongoDB
  MONGODB_URI: z.string().url(),
  MONGODB_DB: z.string().default("substrate"),

  // AWS / Bedrock (optional at startup; required at first Resolver call)
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  BEDROCK_MODEL_RESOLVER: z.string().default("anthropic.claude-haiku-4-5"),

  // Voyage
  VOYAGE_API_KEY: z.string().optional(),
  VOYAGE_MODEL: z.string().default("voyage-3"),

  // Server
  PORT: z.coerce.number().default(3000),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3001,http://localhost:3000")
    .transform((s) => s.split(",").map((x) => x.trim())),
})

export const env = schema.parse(process.env)
export type Env = typeof env
