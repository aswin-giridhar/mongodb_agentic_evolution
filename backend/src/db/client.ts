import { MongoClient, type Collection, type Db } from "mongodb"
import { env } from "../lib/env.js"
import type { Artifact, ClaimEntry, Person, Service, WorkingContextEntry } from "../lib/types.js"

let client: MongoClient | null = null
let db: Db | null = null

export async function connect(): Promise<Db> {
  if (db) return db
  client = new MongoClient(env.MONGODB_URI, {
    appName: "substrate-backend",
  })
  await client.connect()
  db = client.db(env.MONGODB_DB)
  // sanity ping
  await db.command({ ping: 1 })
  console.log(`[mongo] connected to ${env.MONGODB_DB}`)
  return db
}

export async function disconnect(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}

export function collections() {
  if (!db) throw new Error("Mongo not connected — call connect() first")
  return {
    services: db.collection<Service>("services"),
    people: db.collection<Person>("people"),
    artifacts: db.collection<Artifact>("artifacts"),
    workingContext: db.collection<WorkingContextEntry>("working_context"),
    claims: db.collection<ClaimEntry>("claims"),
  }
}

export type Collections = ReturnType<typeof collections>
