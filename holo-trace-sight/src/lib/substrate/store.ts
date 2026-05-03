import { create } from "zustand";
import type {
  ActivityEntry,
  Artifact,
  FileEntity,
  Person,
  SeedPayload,
  Service,
  SubstrateEvent,
  ViewMode,
  WorkingContext,
} from "./types";

const ACTIVITY_CAP = 500;

export type ConnState = "idle" | "connecting" | "open" | "error";

export interface HighlightStep {
  id: string;
  nodeId: string;
  at: number; // timestamp ms when this step should glow
}

export interface RetrievalHighlight {
  id: string;
  agent: string;
  steps: HighlightStep[];
  expiresAt: number;
}

interface State {
  org: string;
  services: Record<string, Service>;
  files: Record<string, FileEntity>;
  people: Record<string, Person>;
  artifacts: Record<string, Artifact>;
  workingContext: Record<string, WorkingContext>;
  referencedArtifacts: Set<string>;
  claims: Record<string, { agent: string; wc_id?: string }>; // file_id -> holder
  collisions: Record<string, { at: number; by: string }>; // file_id -> last collision
  activity: ActivityEntry[];
  view: ViewMode;
  manualView: boolean;
  conn: ConnState;
  highlights: RetrievalHighlight[];
  pulses: Record<string, number>; // nodeId -> expiresAt
  focus: string[] | null; // node ids to focus
}

interface Actions {
  loadSeed: (s: SeedPayload) => void;
  applyEvent: (e: SubstrateEvent) => void;
  setView: (v: ViewMode, manual?: boolean) => void;
  setConn: (c: ConnState) => void;
  reset: () => void;
  focusNodes: (ids: string[]) => void;
  clearFocus: () => void;
  pulseNodes: (ids: string[], ms?: number) => void;
  expireTransient: () => void;
}

export type SubstrateStore = State & Actions;

const initial: State = {
  org: "acme-robotics",
  services: {},
  files: {},
  people: {},
  artifacts: {},
  workingContext: {},
  referencedArtifacts: new Set(),
  claims: {},
  collisions: {},
  activity: [],
  view: "structure",
  manualView: false,
  conn: "idle",
  highlights: [],
  pulses: {},
  focus: null,
};

function pushActivity(arr: ActivityEntry[], entry: ActivityEntry): ActivityEntry[] {
  const next = [entry, ...arr];
  if (next.length > ACTIVITY_CAP) next.length = ACTIVITY_CAP;
  return next;
}

function ensureView(current: ViewMode, manual: boolean, want: ViewMode): ViewMode {
  if (manual) return current;
  const order: ViewMode[] = ["structure", "activity", "grounded"];
  return order.indexOf(want) > order.indexOf(current) ? want : current;
}

export const useSubstrate = create<SubstrateStore>((set, get) => ({
  ...initial,

  loadSeed(s) {
    const services: Record<string, Service> = {};
    s.services?.forEach((x) => (services[x._id] = x));
    const files: Record<string, FileEntity> = {};
    s.files?.forEach((x) => (files[x._id] = x));
    const people: Record<string, Person> = {};
    s.people?.forEach((x) => (people[x._id] = x));
    const artifacts: Record<string, Artifact> = {};
    s.artifacts?.forEach((x) => (artifacts[x._id] = x));
    const workingContext: Record<string, WorkingContext> = {};
    s.working_context?.forEach((x) => (workingContext[x._id] = x));
    set({
      org: s.org ?? "acme-robotics",
      services,
      files,
      people,
      artifacts,
      workingContext,
    });
  },

  applyEvent(e) {
    const now = Date.now();
    const state = get();
    const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;

    switch (e.type) {
      case "service.upsert": {
        const s = e.data as Service;
        set({ services: { ...state.services, [s._id]: s } });
        return;
      }
      case "file.upsert": {
        const f = e.data as FileEntity;
        set({ files: { ...state.files, [f._id]: f } });
        return;
      }
      case "person.upsert": {
        const p = e.data as Person;
        set({ people: { ...state.people, [p._id]: p } });
        return;
      }
      case "artifact.upsert": {
        const a = e.data as Artifact;
        set({ artifacts: { ...state.artifacts, [a._id]: a } });
        return;
      }
      case "working_context.write": {
        const wc = e.data as WorkingContext;
        const referenced = new Set(state.referencedArtifacts);
        wc.refs?.forEach((r) => referenced.add(r));
        const view = ensureView(state.view, state.manualView, "activity");
        set({
          workingContext: { ...state.workingContext, [wc._id]: wc },
          referencedArtifacts: referenced,
          view: wc.refs?.length
            ? ensureView(view, state.manualView, "grounded")
            : view,
          pulses: { ...state.pulses, [wc._id]: now + 1200 },
          activity: pushActivity(state.activity, {
            id,
            ts: now,
            agent: wc.author,
            action: "write_context",
            scope: wc.scope.entity_id,
            summary: `${wc.type.replace("_", " ")} — ${wc.summary}`,
            nodeIds: [wc._id, wc.scope.entity_id],
          }),
        });
        return;
      }
      case "working_context.supersede": {
        const { old_id, new_id } = e.data as { old_id: string; new_id: string };
        const wcs = { ...state.workingContext };
        if (wcs[old_id]) wcs[old_id] = { ...wcs[old_id], superseded_by: new_id };
        if (wcs[new_id]) wcs[new_id] = { ...wcs[new_id], supersedes: old_id };
        set({
          workingContext: wcs,
          pulses: { ...state.pulses, [new_id]: now + 1200 },
          activity: pushActivity(state.activity, {
            id,
            ts: now,
            agent: wcs[new_id]?.author,
            action: "supersedes",
            scope: wcs[new_id]?.scope.entity_id,
            summary: `supersedes ${old_id}`,
            nodeIds: [old_id, new_id],
          }),
        });
        return;
      }
      case "read_context": {
        const d = e.data as {
          agent: string;
          scope_entity_id: string;
          returned_ids: string[];
          query?: string;
        };
        const steps: HighlightStep[] = [
          { id: `${id}-q`, nodeId: `agent:${d.agent}`, at: now },
          { id: `${id}-s`, nodeId: d.scope_entity_id, at: now + 220 },
          ...d.returned_ids.map((rid, i) => ({
            id: `${id}-r-${i}`,
            nodeId: rid,
            at: now + 440 + i * 120,
          })),
        ];
        const expiresAt = now + 440 + d.returned_ids.length * 120 + 700;
        set({
          highlights: [...state.highlights, { id, agent: d.agent, steps, expiresAt }],
          activity: pushActivity(state.activity, {
            id,
            ts: now,
            agent: d.agent,
            action: "read_context",
            scope: d.scope_entity_id,
            summary: d.query ?? `returned ${d.returned_ids.length} entries`,
            nodeIds: [d.scope_entity_id, ...d.returned_ids],
          }),
        });
        return;
      }
      case "claim.acquire": {
        const d = e.data as { agent: string; file_id: string; wc_id?: string };
        set({
          claims: { ...state.claims, [d.file_id]: { agent: d.agent, wc_id: d.wc_id } },
          pulses: { ...state.pulses, [d.file_id]: now + 1200 },
          activity: pushActivity(state.activity, {
            id,
            ts: now,
            agent: d.agent,
            action: "claim",
            scope: d.file_id,
            summary: `acquired claim on ${d.file_id}`,
            nodeIds: [d.file_id],
          }),
        });
        return;
      }
      case "claim.release": {
        const d = e.data as { agent: string; file_id: string };
        const claims = { ...state.claims };
        delete claims[d.file_id];
        set({
          claims,
          activity: pushActivity(state.activity, {
            id,
            ts: now,
            agent: d.agent,
            action: "release",
            scope: d.file_id,
            summary: `released ${d.file_id}`,
            nodeIds: [d.file_id],
          }),
        });
        return;
      }
      case "claim.collision": {
        const d = e.data as { agent: string; file_id: string; held_by: string };
        set({
          collisions: { ...state.collisions, [d.file_id]: { at: now, by: d.held_by } },
          pulses: { ...state.pulses, [d.file_id]: now + 1500 },
          activity: pushActivity(state.activity, {
            id,
            ts: now,
            agent: d.agent,
            action: "would-have-collided",
            scope: d.file_id,
            summary: `would have collided with ${d.held_by}`,
            nodeIds: [d.file_id],
          }),
        });
        return;
      }
      case "artifact.reference": {
        const d = e.data as { wc_id: string; artifact_id: string };
        const refs = new Set(state.referencedArtifacts);
        refs.add(d.artifact_id);
        const wcs = { ...state.workingContext };
        const wc = wcs[d.wc_id];
        if (wc) {
          wcs[d.wc_id] = {
            ...wc,
            refs: Array.from(new Set([...(wc.refs ?? []), d.artifact_id])),
          };
        }
        set({
          referencedArtifacts: refs,
          workingContext: wcs,
          view: ensureView(state.view, state.manualView, "grounded"),
          pulses: { ...state.pulses, [d.artifact_id]: now + 1200 },
          activity: pushActivity(state.activity, {
            id,
            ts: now,
            agent: wc?.author,
            action: "reference",
            scope: wc?.scope.entity_id,
            summary: `referenced ${d.artifact_id}`,
            nodeIds: [d.wc_id, d.artifact_id],
          }),
        });
        return;
      }
      default:
        return;
    }
  },

  setView(v, manual = true) {
    set({ view: v, manualView: manual });
  },

  setConn(c) {
    set({ conn: c });
  },

  reset() {
    set({
      workingContext: {},
      referencedArtifacts: new Set(),
      claims: {},
      collisions: {},
      activity: [],
      view: "structure",
      manualView: false,
      highlights: [],
      pulses: {},
      focus: null,
    });
  },

  focusNodes(ids) {
    set({ focus: ids, pulses: ids.reduce(
      (acc, id) => ({ ...acc, [id]: Date.now() + 800 }),
      { ...get().pulses }
    ) });
  },

  clearFocus() {
    set({ focus: null });
  },

  expireTransient() {
    const now = Date.now();
    const state = get();
    const pulses: Record<string, number> = {};
    let pulsesChanged = false;
    for (const [k, v] of Object.entries(state.pulses)) {
      if (v > now) pulses[k] = v;
      else pulsesChanged = true;
    }
    const highlights = state.highlights.filter((h) => h.expiresAt > now);
    const next: Partial<State> = {};
    if (pulsesChanged) next.pulses = pulses;
    if (highlights.length !== state.highlights.length) next.highlights = highlights;
    if (Object.keys(next).length) set(next);
  },

  pulseNodes(ids, ms = 1000) {
    const now = Date.now();
    const pulses = { ...get().pulses };
    ids.forEach((i) => (pulses[i] = now + ms));
    set({ pulses });
  },
}));

/** Returns active glow node ids based on retrieval highlights at time `now`. */
export function activeGlowIds(
  highlights: RetrievalHighlight[],
  now: number
): Set<string> {
  const set = new Set<string>();
  for (const h of highlights) {
    for (const s of h.steps) {
      if (now >= s.at && now <= s.at + 700) set.add(s.nodeId);
    }
  }
  return set;
}