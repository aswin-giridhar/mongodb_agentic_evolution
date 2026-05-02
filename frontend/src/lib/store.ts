"use client";

import { create } from "zustand";
import type {
  AgentRole,
  Artifact,
  EntityId,
  Person,
  Service,
  SubstrateEvent,
  ViewMode,
  WorkingContextEntry,
} from "@/types";

export type ActiveRetrieval = {
  id: string;
  agent: AgentRole;
  query: string;
  scope?: EntityId;
  status: "pending" | "completed" | "fading";
  resolvedEntity?: EntityId;
  traversedEntities: EntityId[];
  returnedEntryIds: string[];
  returnedArtifactIds: string[];
  startedAt: number;
};

export type RecentEvent = {
  id: string;
  event: SubstrateEvent;
  timestamp: number;
};

export type ConflictBadge = {
  id: string;
  scope: EntityId;
  attemptedBy: AgentRole;
  intent: string;
  expiresAt: number;
};

const MAX_RECENT_EVENTS = 50;

export type SubstrateState = {
  services: Record<EntityId, Service>;
  people: Record<EntityId, Person>;
  artifacts: Record<string, Artifact>;
  workingContext: Record<string, WorkingContextEntry>;
  activeRetrievals: ActiveRetrieval[];
  recentEvents: RecentEvent[];
  conflictBadges: ConflictBadge[];
  recentlyCreatedWcIds: Set<string>;
  highlightedEntityIds: Set<string>;
  viewMode: ViewMode;
  userOverrodeView: boolean;
  seeded: boolean;

  applyEvent: (event: SubstrateEvent) => void;
  setViewMode: (mode: ViewMode, isUserAction: boolean) => void;
  highlightEntities: (ids: string[]) => void;
  clearHighlights: () => void;
  resetForReplay: () => void;
};

let retrievalCounter = 0;

export const useStore = create<SubstrateState>((set, get) => ({
  services: {},
  people: {},
  artifacts: {},
  workingContext: {},
  activeRetrievals: [],
  recentEvents: [],
  conflictBadges: [],
  recentlyCreatedWcIds: new Set(),
  highlightedEntityIds: new Set(),
  viewMode: "structure",
  userOverrodeView: false,
  seeded: false,

  applyEvent: (event) => {
    const state = get();
    const now = Date.now();

    switch (event.kind) {
      case "seed": {
        const services: Record<EntityId, Service> = {};
        event.services.forEach((s) => {
          services[s._id] = s;
        });
        const people: Record<EntityId, Person> = {};
        event.people.forEach((p) => {
          people[p._id] = p;
        });
        const artifacts: Record<string, Artifact> = {};
        event.artifacts.forEach((a) => {
          artifacts[a._id] = a;
        });
        // Synthetic seeded events for the activity stream's empty state.
        const seededEvents: RecentEvent[] = [
          {
            id: `seed-pr-${now}`,
            timestamp: now - 60_000,
            event: {
              kind: "agent.thought",
              agent: "producer",
              text: `Indexed ${event.artifacts.filter((a) => a.source === "github").length} PRs from acme/payments.`,
            },
          },
          {
            id: `seed-slack-${now}`,
            timestamp: now - 45_000,
            event: {
              kind: "agent.thought",
              agent: "producer",
              text: `Loaded ${event.artifacts.filter((a) => a.source === "slack").length} Slack threads from #platform and #mobile.`,
            },
          },
          {
            id: `seed-jira-${now}`,
            timestamp: now - 30_000,
            event: {
              kind: "agent.thought",
              agent: "producer",
              text: `Indexed ${event.artifacts.filter((a) => a.source === "jira").length} Jira tickets across platform and growth.`,
            },
          },
        ];
        set({
          services,
          people,
          artifacts,
          workingContext: {},
          activeRetrievals: [],
          recentEvents: seededEvents,
          conflictBadges: [],
          recentlyCreatedWcIds: new Set(),
          highlightedEntityIds: new Set(),
          seeded: true,
          viewMode: state.userOverrodeView ? state.viewMode : "structure",
        });
        return;
      }

      case "working_context.created":
      case "claim.activated": {
        const entry = event.entry;
        const recentlyCreated = new Set(state.recentlyCreatedWcIds);
        recentlyCreated.add(entry._id);
        set({
          workingContext: { ...state.workingContext, [entry._id]: entry },
          recentlyCreatedWcIds: recentlyCreated,
          recentEvents: appendEvent(state.recentEvents, event, now),
          viewMode:
            state.userOverrodeView || state.viewMode !== "structure"
              ? state.viewMode
              : "activity",
        });
        // Clear pulse flag after 1.5s.
        setTimeout(() => {
          const s = get();
          if (!s.recentlyCreatedWcIds.has(entry._id)) return;
          const next = new Set(s.recentlyCreatedWcIds);
          next.delete(entry._id);
          set({ recentlyCreatedWcIds: next });
        }, 1500);
        return;
      }

      case "working_context.superseded": {
        const oldEntry = state.workingContext[event.old_id];
        const updatedWc = { ...state.workingContext };
        if (oldEntry) {
          updatedWc[event.old_id] = {
            ...oldEntry,
            active: false,
            superseded_by: event.new_entry._id,
          };
        }
        updatedWc[event.new_entry._id] = event.new_entry;
        const recentlyCreated = new Set(state.recentlyCreatedWcIds);
        recentlyCreated.add(event.new_entry._id);
        set({
          workingContext: updatedWc,
          recentlyCreatedWcIds: recentlyCreated,
          recentEvents: appendEvent(state.recentEvents, event, now),
        });
        setTimeout(() => {
          const s = get();
          if (!s.recentlyCreatedWcIds.has(event.new_entry._id)) return;
          const next = new Set(s.recentlyCreatedWcIds);
          next.delete(event.new_entry._id);
          set({ recentlyCreatedWcIds: next });
        }, 1500);
        return;
      }

      case "claim.released": {
        const old = state.workingContext[event.claim_id];
        if (!old) return;
        set({
          workingContext: {
            ...state.workingContext,
            [event.claim_id]: { ...old, active: false },
          },
          recentEvents: appendEvent(state.recentEvents, event, now),
        });
        return;
      }

      case "claim.conflict": {
        const existing = state.workingContext[event.existing_claim_id];
        const scope = existing?.scope.entity_id ?? "services.payments-api";
        const badge: ConflictBadge = {
          id: `conflict-${now}`,
          scope,
          attemptedBy: event.attempted_by,
          intent: event.intent,
          expiresAt: now + 4_000,
        };
        set({
          conflictBadges: [...state.conflictBadges, badge],
          recentEvents: appendEvent(state.recentEvents, event, now),
        });
        setTimeout(() => {
          const s = get();
          set({
            conflictBadges: s.conflictBadges.filter((b) => b.id !== badge.id),
          });
        }, 4_000);
        return;
      }

      case "read_context.started": {
        retrievalCounter += 1;
        const retrieval: ActiveRetrieval = {
          id: `retrieval-${retrievalCounter}`,
          agent: event.agent,
          query: event.query,
          scope: event.scope,
          status: "pending",
          traversedEntities: [],
          returnedEntryIds: [],
          returnedArtifactIds: [],
          startedAt: now,
        };
        set({
          activeRetrievals: [...state.activeRetrievals, retrieval],
          recentEvents: appendEvent(state.recentEvents, event, now),
        });
        return;
      }

      case "read_context.completed": {
        // Find the most-recent pending retrieval matching agent+query.
        const idx = [...state.activeRetrievals]
          .reverse()
          .findIndex(
            (r) =>
              r.agent === event.agent &&
              r.query === event.query &&
              r.status === "pending",
          );
        const retrievals = [...state.activeRetrievals];
        if (idx !== -1) {
          const realIdx = retrievals.length - 1 - idx;
          retrievals[realIdx] = {
            ...retrievals[realIdx],
            status: "completed",
            resolvedEntity: event.resolved_entity,
            traversedEntities: event.traversed_entities,
            returnedEntryIds: event.returned_entry_ids,
            returnedArtifactIds: event.returned_artifact_ids,
          };
          // Schedule fade then removal.
          const completedId = retrievals[realIdx].id;
          setTimeout(() => {
            const s = get();
            set({
              activeRetrievals: s.activeRetrievals.map((r) =>
                r.id === completedId ? { ...r, status: "fading" } : r,
              ),
            });
            setTimeout(() => {
              const s2 = get();
              set({
                activeRetrievals: s2.activeRetrievals.filter(
                  (r) => r.id !== completedId,
                ),
              });
            }, 600);
          }, 1500);
        }

        const shouldAutoPromote =
          !state.userOverrodeView &&
          event.returned_artifact_ids.length > 0 &&
          state.viewMode !== "grounded";

        set({
          activeRetrievals: retrievals,
          recentEvents: appendEvent(state.recentEvents, event, now),
          viewMode: shouldAutoPromote ? "grounded" : state.viewMode,
        });
        return;
      }

      case "agent.thought": {
        set({
          recentEvents: appendEvent(state.recentEvents, event, now),
        });
        return;
      }
    }
  },

  setViewMode: (mode, isUserAction) => {
    set({
      viewMode: mode,
      userOverrodeView: isUserAction || get().userOverrodeView,
    });
  },

  highlightEntities: (ids) => {
    set({ highlightedEntityIds: new Set(ids) });
    setTimeout(() => {
      const s = get();
      // Only clear if these are still the highlighted ones.
      const currentIds = [...s.highlightedEntityIds];
      const same =
        currentIds.length === ids.length &&
        currentIds.every((id) => ids.includes(id));
      if (same) {
        set({ highlightedEntityIds: new Set() });
      }
    }, 2_000);
  },

  clearHighlights: () => {
    set({ highlightedEntityIds: new Set() });
  },

  resetForReplay: () => {
    set({
      workingContext: {},
      activeRetrievals: [],
      conflictBadges: [],
      recentlyCreatedWcIds: new Set(),
      highlightedEntityIds: new Set(),
      viewMode: get().userOverrodeView ? get().viewMode : "structure",
    });
  },
}));

const appendEvent = (
  existing: RecentEvent[],
  event: SubstrateEvent,
  timestamp: number,
): RecentEvent[] => {
  const next: RecentEvent[] = [
    {
      id: `${event.kind}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      event,
      timestamp,
    },
    ...existing,
  ];
  return next.slice(0, MAX_RECENT_EVENTS);
};
