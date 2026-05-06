import dagre from "dagre";
import type { Node, Edge, XYPosition } from "reactflow";

// Curated anchors for the Acme dataset. Unknown ids fall back to dagre.
// Coordinates are in the react-flow coordinate space (px); the canvas auto-fits.
//
// Both the original mock id format (`service:foo`, `person:foo`) and the
// live backend id format (`services.foo`, `people.foo`) are mapped here so
// either data source produces the same horizontal-spine layout. anchorFor()
// also normalizes between the two formats.
export const CURATED_ANCHORS: Record<string, XYPosition> = {
  // ---- Mock data (Lovable's original fixtures) ----
  // Services along a horizontal spine
  "service:payments-api": { x: 0, y: 0 },
  "service:checkout-web": { x: -360, y: 0 },
  "service:ledger": { x: 360, y: 0 },
  "service:notifications": { x: 720, y: 0 },
  "service:identity": { x: -720, y: 0 },
  // People above
  "person:alex": { x: -540, y: -260 },
  "person:bea": { x: -180, y: -260 },
  "person:cris": { x: 180, y: -260 },
  "person:dani": { x: 540, y: -260 },

  // ---- Live data (Acme dataset on MongoDB Atlas) ----
  // Services along a horizontal spine
  "services.auth-service":         { x: -720, y: 0 },
  "services.payments-api":         { x: -360, y: 0 },
  "services.notification-service": { x:    0, y: 0 },
  "services.mobile-app":           { x:  360, y: 0 },
  "services.admin-dashboard":      { x:  720, y: 0 },
  "services.search-api":           { x: 1080, y: 0 },
  // People above
  "people.marcus": { x: -780, y: -260 },
  "people.elena":  { x: -420, y: -260 },
  "people.priya":  { x:  -60, y: -260 },
  "people.raj":    { x:  300, y: -260 },
  "people.sara":   { x:  660, y: -260 },
  "people.james":  { x: 1020, y: -260 },
};

export function anchorFor(id: string): XYPosition | undefined {
  // Direct hit (covers both mock and live formats once they're registered above)
  const direct = CURATED_ANCHORS[id];
  if (direct) return direct;
  // Cross-format fallback: try translating between `services.foo` ↔ `service:foo`
  const dotMatch = id.match(/^(services|people)\.(.+)$/);
  if (dotMatch) {
    const alt = `${dotMatch[1].replace(/s$/, "")}:${dotMatch[2]}`;
    if (CURATED_ANCHORS[alt]) return CURATED_ANCHORS[alt];
  }
  const colonMatch = id.match(/^(service|person):(.+)$/);
  if (colonMatch) {
    const alt = `${colonMatch[1]}s.${colonMatch[2]}`;
    if (CURATED_ANCHORS[alt]) return CURATED_ANCHORS[alt];
  }
  return undefined;
}

/**
 * Place children (working_context pills, artifacts) radially around a parent
 * anchor, in a stable angular order keyed by child id. Returns absolute
 * positions in react-flow space.
 */
export function radialPlace(
  parent: XYPosition,
  children: string[],
  opts: { radius?: number; startAngle?: number; sweep?: number } = {}
): Record<string, XYPosition> {
  const radius = opts.radius ?? 150;
  const startAngle = opts.startAngle ?? Math.PI * 0.15; // skew below
  const sweep = opts.sweep ?? Math.PI * 1.4;
  const out: Record<string, XYPosition> = {};
  const n = Math.max(children.length, 1);
  children.forEach((id, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = startAngle + t * sweep;
    out[id] = {
      x: parent.x + Math.cos(a) * radius,
      y: parent.y + Math.sin(a) * radius,
    };
  });
  return out;
}

/** Dagre fallback for nodes without curated anchors. */
export function dagreLayout(
  nodes: Node[],
  edges: Edge[],
  opts: { rankdir?: "LR" | "TB" } = {}
): Record<string, XYPosition> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: opts.rankdir ?? "LR", nodesep: 80, ranksep: 140 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: 180, height: 80 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  const out: Record<string, XYPosition> = {};
  nodes.forEach((n) => {
    const p = g.node(n.id);
    if (p) out[n.id] = { x: p.x, y: p.y };
  });
  return out;
}