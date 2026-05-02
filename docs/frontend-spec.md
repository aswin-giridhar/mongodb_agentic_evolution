# Substrate — Frontend & Demo Surface Spec

> Hackathon: MongoDB Agentic Evolution Hackathon · Saturday May 2, 2026
> Owner: Frontend / Demo team (Person D, lead: Mohammed)
> Build window: 10:30 AM – 5:00 PM
>
> **This is a visualization surface only.** The demo is driven by typing prompts into two real Claude Code instances. The dashboard makes the otherwise-invisible MCP traffic visible to the room.

---

## 1. Purpose

A single-page dashboard, projected on the big screen during the demo, that visualizes Substrate's memory layer as a live unified graph. Its job is to make MCP traffic legible to judges standing at the back of the room.

What it is NOT:
- Not a control surface (no scene buttons, no play/pause/step)
- Not an agent terminal (Claude Code IDE windows handle that, off-screen)
- Not a setup or config UI (synthetic Acme dataset is pre-loaded)

---

## 2. Demo setup (the laptop layout)

One laptop, projected to the room, runs:

- **Dashboard** (this app) — front and center on the projector
- **Two Claude Code instances** — open side-by-side on the laptop's screen, off-projector, where the operator types prompts
- **Backend service** — local Node process serving MCP + SSE
- **MongoDB Atlas** — hosted (cloud), accessed by backend

Each Claude Code instance is one MCP client connected to the local backend. We type prompts; agents call MCP tools; backend writes to Mongo + emits SSE; dashboard reflects in real time.

---

## 3. Tech stack

| Layer | Choice | Why |
|------|--------|------|
| Framework | **Next.js 15 (App Router)** | Familiar, fast to scaffold |
| Styling | **Tailwind + shadcn/ui** | Fast composition, no design overhead |
| Graph | **`reactflow`** (v12) | Custom nodes, custom edges, animation-friendly |
| Realtime | **EventSource (SSE)** | One-way stream from backend, dead-simple |
| Icons | **lucide-react** | Already shipped with shadcn |
| Animation | **framer-motion** for transitions | View transitions + node/edge enter/exit |
| Deploy | **Local (`npm run dev` or `next start`)** | Runs on the demo laptop; no Vercel needed |

---

## 4. Layout

Single page, single route `/`. One laptop, projected at 1920×1080. **Do not make it responsive.**

```
┌─────────────────────────────────────────────────────────────┐
│ Header (h-14)                                               │
│ [Substrate · acme-robotics]                                 │
│                       [ Structure | Activity | Grounded ]   │
│                                              [↻ Reset]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                LIVE ENTITY GRAPH                            │
│                  (react-flow)                               │
│                                                             │
│                  ~70% of viewport                           │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Activity Stream (collapsible, ~25% of viewport)             │
│  • 14:32 Producer · write_context · payments-api ·          │
│           draft_schema "transaction"                        │
│  • 14:31 Consumer · read_context · payments-api · 3 hits    │
│  • 14:30 ingest · 25 PRs, 150 slack messages                │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Components

### 5.1 `<Header />`

- Left: project label "**Substrate · acme-robotics**"
- Center: **three-view toggle** — `[ Structure | Activity | Grounded ]`. Highlights the current view; clicking one forces it (overrides auto-progressive disclosure).
- Right: `Reset` button → POSTs `/api/demo/reset`, clears `working_context`, drops view back to Structure.

### 5.2 `<EntityGraph />`

The hero visual. Drives 80% of the demo's perceived value.

**Layout strategy: pre-curated.** Compute node positions once on mount. Do NOT use force-directed — judges need to track changes and the graph has only ~10–15 visible nodes. Position them deliberately for legibility.

Place positions in `lib/graph-layout.ts` as a hardcoded array.

#### Node types

| Type | Visual | Position |
|------|--------|----------|
| `service` | Large rounded rectangle, heavy outline, name + owner team chip | Top row, evenly spaced |
| `file` | Smaller rectangle, lighter outline, **nested inside its service node** | As children, react-flow `parentNode` |
| `person` | Circle, 60×60, initials | Right column |
| `working_context` chip | Pill, 180px wide, color-coded by type, attached to scope entity | Floats above its scoped service/file |
| `artifact` | Diamond / document icon, muted (low opacity) by default; lights up when referenced | Bottom row (Grounded view only) |

#### Edge types

| Type | Treatment | Visible in |
|------|-----------|-----------|
| **Structural** (`depends_on`, `consumed_by`, ownership) | Solid grey, persistent | All views |
| **Authorship** (working_context → agent) | Dashed, colored by agent | Activity, Grounded |
| **Supersedes** (working_context → working_context) | Solid arrow with label, older end dimmed | Activity, Grounded |
| **Reference** (working_context → artifact) | Dotted, colored | Grounded only |

#### Working-context chip color by type

```ts
const TYPE_COLORS = {
  draft_schema:    { bg: "bg-blue-100",   text: "text-blue-900",   border: "border-blue-400",  label: "Draft"          },
  decision:        { bg: "bg-purple-100", text: "text-purple-900", border: "border-purple-400", label: "Decision"       },
  claim:           { bg: "bg-orange-100", text: "text-orange-900", border: "border-orange-500", label: "Claim"          },
  investigation:   { bg: "bg-green-100",  text: "text-green-900",  border: "border-green-400",  label: "Investigation"  },
  open_question:   { bg: "bg-yellow-100", text: "text-yellow-900", border: "border-yellow-500", label: "Open Question"  },
} as const;
```

#### Agent color palette

Two agents need distinct colors that flow through node authorship halos, authorship edges, and activity stream entries.

```ts
const AGENT_COLORS = {
  producer: { primary: "#3b82f6", soft: "#dbeafe", label: "Producer"  },  // blue
  consumer: { primary: "#f97316", soft: "#fed7aa", label: "Consumer"  },  // orange
} as const;
```

(Open decision: confirm with team. These are sensible defaults that pair well with the chip type colors.)

#### Chip states

- `active: true` → full opacity
- `active: false` (superseded) → opacity 40% + line-through on text
- Newly created → framer-motion `initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}` (250ms)
- Newly superseded → fade to 40% over 300ms; supersedes-edge animates in
- Newly referenced (Grounded view triggered) → linked artifact fades in from 30% → 100% (400ms)

#### Read-path highlighting

When `read_context` fires:
1. Pulse the resolved scope entity (single CSS pulse, ~600ms)
2. Briefly draw glow lines from scope → returned `working_context` chips (fade in 200ms, hold 800ms, fade out 400ms)
3. Returned chips themselves pulse at the end of the path

This is critical — without it, half the demo's causality is invisible to the audience. Implementation: framer-motion `<motion.div>` wrappers with controlled animation triggered by SSE event.

#### Claim visualization

When a `claim` chip is active and scoped to a file, draw a pulsing **orange dashed border** around the parent file/service node. CSS keyframe animation.

When a claim is *attempted* on a held scope (returned conflict), draw a brief red flash on the file node + animate a "would have collided" badge in the activity stream entry.

#### Pre-positioned graph (Acme Robotics)

```
Top row (services + their files nested):
  [auth]   [payments-api → checkout.ts, refund.ts]   [mobile-app → CheckoutForm.tsx]   [inventory]

Edges:
  payments-api ─ depends_on ─→ auth
  mobile-app   ─ depends_on ─→ payments-api
  payments-api ─ depends_on ─→ inventory  (or consumed_by, depending on direction)

Right column (people):
  ●Sarah  ●Marcus  ●Alex  ●Jin

Bottom row (artifacts, hidden until Grounded view):
  ◇slack:rate-limit  ◇pr:1247  ◇slack:tx_id  ◇doc:checkout-spec
```

### 5.3 Three-view toggle (Structure | Activity | Grounded)

**The key design idea.** Don't toggle by collection — that hides the cross-collection edges the demo depends on. Toggle by **layer of disclosure** on the same unified graph.

| View | Shows | When it's used |
|---|---|---|
| **Structure** | Services + files + people, structural edges only | Empty state; audience orientation; reset |
| **Activity** | + `working_context` entries with authorship + supersedes chains | Default once first `write_context` fires |
| **Grounded** | + referenced `artifacts` and reference edges | When grounding retrieval surfaces evidence (Hero 2) |

**Auto-progressive disclosure**:
- Boot: view = Structure
- First `working_context.created` SSE event → animate to Activity
- First `artifact.referenced` (or first reference edge added) → animate to Grounded
- `Reset` returns to Structure

The manual toggle remains as override for Q&A / debug. Highlight whichever view is current.

Transitions between views are animated via framer-motion `AnimatePresence`. Nodes and edges fade in alongside their connections.

### 5.4 `<ActivityStream />`

Bottom strip, collapsible. Chronological log of every memory-layer event.

#### Props

```ts
type ActivityStreamProps = {
  events: ActivityEvent[]
  collapsed: boolean
  onFocus: (entityIds: EntityId[]) => void   // click event → focus graph
}

type ActivityEvent = {
  id: string
  ts: number
  agent?: "producer" | "consumer"  // omit for non-agent events (ingest, reset)
  action: "read_context" | "write_context" | "claim" | "release"
         | "list_open_questions" | "ingest" | "reset"
  scope?: EntityId
  summary: string                  // one-line, ~80ch
  refs: EntityId[]                 // for click-to-focus
}
```

#### Visual

- Most recent at top, ~12 visible events with auto-scroll
- Each row: `[hh:mm:ss] [agent badge, color-matched] [action] [scope] [summary]`
- Click row → graph focuses (zooms + pans) on `refs` and pulses them once
- Empty state: shows recent **ingest events** so it's never blank ("ingested 25 PRs", "ingested 150 slack messages", "graph ready")

#### Collapse

A toggle button at the right edge. Collapsed = strip becomes 32px high, shows only the latest event. Click to expand back to ~25vh.

---

## 6. The three things this dashboard MUST do well

These are non-negotiable. If any of them isn't working at 14:00 integration checkpoint, cut other features to fix these first.

### 6.1 Make reads visible, not just writes
When an agent calls `read_context`, briefly highlight the retrieval path: query → resolved entity → returned entries. See §5.2 *Read-path highlighting*.

### 6.2 Attribute every action to its agent
Every node, edge, and activity stream entry tied to an agent uses that agent's color. Audience tracks "who did what" at a glance.

### 6.3 Update instantly
Sub-second latency from MCP call to visual reaction. Any lag breaks the cause-and-effect the demo depends on. Heartbeat the SSE; use `AnimatePresence` not full re-renders; keep the graph layout static.

---

## 7. Backend contract (what FE consumes)

Defined in detail in `integration-contract.md` §4 and §5. Quick reference:

```
GET  /api/seed              → bootstrap (services, files, people, graph_layout)
GET  /api/stream            → SSE feed
POST /api/demo/reset        → wipe working_context + claims; reset view
GET  /api/demo/state        → for refresh resilience (current view auto-state)
GET  /healthz               → backend health
```

**No `/api/demo/scene/:n` endpoint.** The demo is driven by typing prompts into Claude Code; the backend is reactive only.

### Critical SSE events the FE consumes

```
working_context.created            → may trigger Structure → Activity transition
working_context.superseded         → animate strike-through + supersedes edge
working_context.claim_activated    → claim badge + pulsing border
working_context.claim_released     → release claim badge
working_context.claim_conflict     → red flash on scope file + activity stream "would have collided"
agent.activity                     → activity stream row + read-path animation if action=read_context
artifact.referenced                → may trigger Activity → Grounded transition; fade in artifact node
ingest.event                       → activity stream row in empty state
mcp.connected | mcp.disconnected   → status indicator (no separate UI element; reflected in agent rows)
ping                               → heartbeat, ignore
```

`agent.activity` payload includes the resolved entity IDs (for read-path highlighting) and the returned working_context IDs (for terminal pulse).

---

## 8. State shape (frontend)

```ts
type AppState = {
  // Static, loaded on boot
  services: Service[]
  files: File[]                         // nested under services
  people: Person[]
  graphLayout: Record<string, { x: number; y: number }>

  // Live, driven by SSE
  workingContext: Record<string, WorkingContextEntry>
  claims: Record<string, ClaimEntry>
  artifactsReferenced: Set<string>      // tracks which artifacts are visible (Grounded)
  activity: ActivityEvent[]             // appended on every event

  // View
  currentView: "structure" | "activity" | "grounded"
  manualOverride: boolean               // if true, suppress auto-progressive transitions
  collapsedActivity: boolean

  // Connection
  sseConnected: boolean
}
```

One React Context (`SubstrateContext`) holds this. Reducer pattern with named actions per SSE event type.

---

## 9. TypeScript types (paste into `types/index.ts`)

```ts
export type EntityId = string                // "services.payments-api"
export type FileId = string                  // "services.payments-api/checkout.ts"

export type Service = {
  id: EntityId
  name: string
  owner_team: string
  depends_on: EntityId[]
  consumed_by: EntityId[]
}

export type File = {
  id: FileId
  service: EntityId            // parent
  path: string                 // "src/routes/checkout.ts"
}

export type Person = {
  id: EntityId
  name: string
  team: string
  expertise: string[]
}

export type WorkingContextType =
  | "draft_schema" | "decision" | "claim"
  | "investigation" | "open_question"

export type WorkingContextEntry = {
  id: string
  type: WorkingContextType
  author: "producer" | "consumer" | string
  scope: { entity_id: EntityId | FileId }
  content: string
  contentFull?: string
  supersedes: string | null
  superseded_by: string | null
  refs: string[]              // artifact ids
  active: boolean
  created_at: number
}

export type ClaimEntry = {
  id: string
  scope: { entity_id: EntityId | FileId }
  intent: string
  agent: "producer" | "consumer"
  active: boolean
  created_at: number
}

export type Artifact = {
  id: string
  source: "slack" | "github_pr" | "jira_ticket" | "docs" | "code_chunk"
  preview: string             // short label for the node
  refs: EntityId[]
}

export type ActivityEvent = {
  id: string
  ts: number
  agent?: "producer" | "consumer"
  action: "read_context" | "write_context" | "claim" | "release"
        | "list_open_questions" | "ingest" | "reset"
  scope?: EntityId | FileId
  summary: string
  refs: (EntityId | FileId | string)[]
}
```

---

## 10. Visual design

### Type
- Headings: Inter or system sans, 600 weight
- Body: Inter, 400
- Numbers in activity stream: tabular-nums

### Color palette (light mode only — no theme toggle)
- Bg: `slate-50`
- Header bg: `white`
- Service node bg: `white`, border `slate-300`, heavy (2px)
- File node bg: `slate-50`, border `slate-200`, light (1px)
- Person node border: `slate-400`
- Activity stream bg: `slate-900`, text `slate-200`
- Type colors: §5.2
- Agent colors: §5.2

### Iconography (lucide)
- `MessageSquareCode` for `write_context`
- `Search` for `read_context`
- `Lock` for `claim`, `Unlock` for `release`
- `AlertCircle` for supersede
- `FileText` for artifact
- `Activity` for ingest
- `RotateCcw` for reset

---

## 11. Build phases

Hard order — don't skip ahead, the surface depends on lower phases.

### Phase 0 — 10:30–11:30 (1h): scaffolding
- `npx create-next-app@latest substrate-demo` (TS, Tailwind, App Router)
- Install: `reactflow framer-motion lucide-react`
- shadcn init: `Button`, `Card`, `Badge`
- Layout shell with empty regions, no logic
- `npm run dev` confirmed locally; no Vercel deploy

### Phase 1 — 11:30–12:30 (1h): static structure view
- Header with the three-view toggle (visual only, no behavior)
- EntityGraph with services/files/people from a stub `/api/seed`
- Files as nested nodes inside services using react-flow `parentNode`
- Empty `ActivityStream` with seeded ingest events
- **Goal: judges seeing the projector at this point see a polished structural diagram**

### Phase 2 — 12:30–14:00 (1.5h): live wiring
- SSE client (`EventSource('/api/stream')`)
- Reducer for state updates, named actions per event type
- Render `working_context` chips on `working_context.created`
- Auto-progressive disclosure: Structure → Activity on first chip
- Activity stream populates from SSE events
- Test with curl-driven mock events

### Phase 3 — 14:00–15:30 (1.5h): hero animations
- Read-path highlighting (the most important animation)
- Supersede strike-through + edge
- Claim pulsing border
- Activity → Grounded transition on first artifact reference
- Reference edges (dotted) drawn to artifact nodes
- Click activity entry → focus graph

### Phase 4 — 15:30–16:00 (30min): polish only
- Empty state copy and layout
- SSE disconnect → reconnect handling
- Activity stream collapse toggle
- Minor easing tweaks

### Phase 5 — 16:00–17:00 (1h): rehearsal + recording
- Walk through all three hero moments end-to-end via real Claude Code prompts
- Two team members judge from outside the laptop
- Record 1-min video at 16:00 (see §13)

---

## 12. Things explicitly NOT to build

- ❌ Authentication / login
- ❌ Settings / preferences / theme toggle
- ❌ Mobile responsive
- ❌ Agent terminal panes (Claude Code IDE handles that, off-projector)
- ❌ Demo controls / scene buttons / play-pause / step
- ❌ User-editable nodes (graph is read-only)
- ❌ Search / filter
- ❌ Tooltips with full content (skip on hover; chip preview is enough)
- ❌ Pagination, history view, multi-page

If you're tempted by any of these, the answer is no.

---

## 13. Demo recording (16:00 slot)

Use **OBS** or **QuickTime** screen capture, 1080p. Record only the dashboard region (not the Claude Code panes — those go on the actual laptop screen during live demo, not on tape).

For the 1-minute video: type the prompts in Claude Code beforehand, screen-capture only the dashboard's reaction. Voiceover or text overlays explain what each beat shows.

### 1-minute video flow

Cut from the live demo. The hero moments are the only beats that matter.

- 0:00–0:05 title card "Substrate · live agent memory layer"
- 0:05–0:25 Hero 1 — schema convergence (Producer writes draft → Consumer reads, path highlights, view auto-progresses Structure → Activity)
- 0:25–0:45 Hero 2 — supersede + grounding (initial decision → grounding pulls Slack artifact, view auto-progresses to Grounded → superseding decision links the artifact)
- 0:45–0:55 Hero 3 — claim collision (claim appears with pulsing border → consumer's overlap returns conflict, red flash, "would have collided")
- 0:55–1:00 close card "MongoDB Atlas · MCP · live in your terminal"

---

## 14. Submission checklist (16:30)

- [ ] Dashboard runs cleanly on the demo laptop via `npm run dev` (no Vercel)
- [ ] GitHub repo (frontend code) is public
- [ ] All 4 team members added to the submission form
- [ ] 1-min demo video uploaded
- [ ] Live demo rehearsed end-to-end via real Claude Code prompts ≥3×
- [ ] Phone hotspot ready as Wi-Fi backup (for MongoDB Atlas reachability)

---

## 15. Open design decisions

- **Microcopy**: confirmed labels per type are `Draft / Decision / Claim / Investigation / Open Question` (per §5.2). Override if Mohammed prefers different.
- **Agent colors**: Producer = blue, Consumer = orange (§5.2). Override if needed.
- **Retrieval path animation style**: glow-line + endpoint pulse (§5.2). Alternative considered: particle trail (heavier, skip unless Phase 4 has spare time).
- **Activity stream max height**: ~25vh expanded, 32px collapsed. Tune during rehearsal.
- **Should Reset show a confirmation?** Recommend no — too easy to misclick during demo, but a 3-sec undo toast would be safer. Decide during Phase 4.
