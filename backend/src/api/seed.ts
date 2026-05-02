import type { Request, Response } from "express"
import { collections } from "../db/client.js"
import type { FileNode } from "../lib/types.js"

/**
 * GET /api/seed
 * Returns the static structural graph (services, files, people)
 * that the dashboard renders before any agent activity.
 */
export async function getSeed(_req: Request, res: Response): Promise<void> {
  const { services, people } = collections()
  const [servicesList, peopleList] = await Promise.all([
    services.find({}).toArray(),
    people.find({}).toArray(),
  ])

  // Derive file nodes from each service's hot_files
  const files: FileNode[] = servicesList.flatMap((s) =>
    (s.hot_files ?? []).map((path) => ({
      id: `${s._id}/${path.split("/").pop()}`,
      service: String(s._id),
      path,
    }))
  )

  // Pre-curated layout — judges need stable node positions.
  // Top row: services. Right column: people. Files inherit parent.
  const graph_layout = buildGraphLayout(
    servicesList.map((s) => String(s._id)),
    peopleList.map((p) => String(p._id))
  )

  res.json({
    services: servicesList,
    files,
    people: peopleList,
    graph_layout,
  })
}

function buildGraphLayout(
  serviceIds: string[],
  personIds: string[]
): { id: string; x: number; y: number }[] {
  const layout: { id: string; x: number; y: number }[] = []
  const SERVICE_Y = 120
  const SERVICE_X_GAP = 320
  serviceIds.forEach((id, i) => {
    layout.push({ id, x: 80 + i * SERVICE_X_GAP, y: SERVICE_Y })
  })
  const PERSON_X = 80 + serviceIds.length * SERVICE_X_GAP + 60
  personIds.forEach((id, i) => {
    layout.push({ id, x: PERSON_X, y: 80 + i * 120 })
  })
  return layout
}
