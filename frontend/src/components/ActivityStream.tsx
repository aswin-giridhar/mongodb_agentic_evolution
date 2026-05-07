"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { RecentEvent } from "@/lib/store";
import type { SubstrateEvent } from "@/types";

// Three actors now share the activity stream: producer (purple), consumer
// (green), and the Resolver Agent (yellow, BP1). The Resolver is not an
// AgentRole in the typed event union — it appears only via `resolver.decided`
// events — so we widen the palette key from AgentRole to a string-union type.
const AGENT_COLOR = {
  producer: { dot: "bg-purple-400", text: "text-purple-300" },
  consumer: { dot: "bg-emerald-400", text: "text-emerald-300" },
  resolver: { dot: "bg-yellow-400", text: "text-yellow-300" },
} as const;
type ActorKey = keyof typeof AGENT_COLOR;

export const ActivityStream = () => {
  const events = useStore((s) => s.recentEvents);
  const highlightEntities = useStore((s) => s.highlightEntities);
  const clearActivityStream = useStore((s) => s.clearActivityStream);

  return (
    <div className="flex h-full flex-col border-l border-white/15 bg-black/60 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-2">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
          Activity stream
        </span>
        <div className="flex items-center gap-3 pr-8">
          <span className="font-mono text-[10px] text-white/30">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
          <button
            type="button"
            onClick={clearActivityStream}
            disabled={events.length === 0}
            title="Clear the activity stream (does not reset the demo state)"
            className="font-mono text-[10px] uppercase tracking-wider text-white/40 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-white/40"
          >
            clear
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ul className="divide-y divide-white/[0.04]">
          {events.map((entry) => (
            <ActivityRow
              key={entry.id}
              entry={entry}
              onHighlight={highlightEntities}
            />
          ))}
        </ul>
      </div>
    </div>
  );
};

type RowProps = {
  entry: RecentEvent;
  onHighlight: (ids: string[]) => void;
};

const ActivityRow = ({ entry, onHighlight }: RowProps) => {
  const detail = describeEvent(entry.event);
  const isThought = entry.event.kind === "agent.thought";
  const agent = detail.agent;
  const palette = agent ? AGENT_COLOR[agent] : null;
  const ids = detail.highlightIds ?? [];

  return (
    <li
      onClick={() => ids.length > 0 && onHighlight(ids)}
      className={`group cursor-pointer px-5 py-2.5 transition hover:bg-white/[0.03] ${
        isThought ? "pl-12" : ""
      }`}
    >
      <div className="flex items-baseline gap-3">
        {palette && (
          <span
            className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${palette.dot}`}
          />
        )}
        {!palette && <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-white/30" />}
        <div className="flex-1 min-w-0">
          {isThought ? (
            <span className="font-sans text-[12px] italic text-white/50">
              {detail.summary}
            </span>
          ) : (
            <>
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${palette?.text ?? "text-white/55"}`}
                >
                  {detail.action}
                </span>
                {detail.scope && (
                  <span className="rounded-sm border border-white/[0.06] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                    {detail.scope}
                  </span>
                )}
                <RelTime ts={entry.timestamp} />
              </span>
              <span
                title={detail.summary}
                className="block font-sans text-[13px] leading-snug text-white/85 line-clamp-3"
              >
                {detail.summary}
              </span>
            </>
          )}
        </div>
      </div>
    </li>
  );
};

const RelTime = ({ ts }: { ts: number }) => {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  let label;
  if (diff < 5) label = "just now";
  else if (diff < 60) label = `${diff}s ago`;
  else if (diff < 3600) label = `${Math.floor(diff / 60)}m ago`;
  else label = `${Math.floor(diff / 3600)}h ago`;
  return (
    <span className="font-mono text-[10px] text-white/40">{label}</span>
  );
};

type EventDetail = {
  action: string;
  summary: string;
  agent?: ActorKey;
  scope?: string;
  highlightIds?: string[];
};

const describeEvent = (event: SubstrateEvent): EventDetail => {
  switch (event.kind) {
    case "agent.thought":
      return {
        action: "thought",
        summary: event.text,
        agent: event.agent,
      };
    case "working_context.created":
      return {
        action: `wrote ${event.entry.type.replace("_", " ")}`,
        summary: event.entry.content,
        agent: event.entry.author,
        scope: shortScope(event.entry.scope.entity_id),
        highlightIds: [event.entry.scope.entity_id, event.entry._id],
      };
    case "working_context.superseded":
      return {
        action: `superseded ${event.new_entry.type.replace("_", " ")}`,
        summary: event.new_entry.content,
        agent: event.new_entry.author,
        scope: shortScope(event.new_entry.scope.entity_id),
        highlightIds: [
          event.new_entry.scope.entity_id,
          event.new_entry._id,
          event.old_id,
        ],
      };
    case "claim.activated":
      return {
        action: "claimed scope",
        summary: event.entry.content,
        agent: event.entry.author,
        scope: shortScope(event.entry.scope.entity_id),
        highlightIds: [event.entry.scope.entity_id, event.entry._id],
      };
    case "claim.conflict":
      return {
        action: "claim conflict",
        summary: `attempted: ${event.intent}`,
        agent: event.attempted_by,
        highlightIds: [event.existing_claim_id],
      };
    case "claim.released":
      return {
        action: "released claim",
        summary: event.outcome,
      };
    case "read_context.started":
      return {
        action: "read context",
        summary: `query: "${event.query}"`,
        agent: event.agent,
        scope: event.scope ? shortScope(event.scope) : undefined,
        highlightIds: event.scope ? [event.scope] : undefined,
      };
    case "read_context.completed":
      return {
        action: "read context · resolved",
        summary: `→ ${shortScope(event.resolved_entity)} · ${event.returned_entry_ids.length + event.returned_artifact_ids.length} hits`,
        agent: event.agent,
        scope: shortScope(event.resolved_entity),
        highlightIds: [
          event.resolved_entity,
          ...event.traversed_entities,
          ...event.returned_entry_ids,
          ...event.returned_artifact_ids,
        ],
      };
    case "resolver.decided": {
      // Three labels by Resolver Agent action shape:
      //   DROP                                  → "dropped redundant note"
      //   WRITE with empty supersede_ids        → "wrote note"
      //   WRITE with non-empty supersede_ids    → "merged & retired N notes"
      let action: string;
      if (event.action === "DROP") {
        action = "dropped redundant note";
      } else if (event.supersede_ids.length > 0) {
        const n = event.supersede_ids.length;
        action = `merged · retired ${n} note${n === 1 ? "" : "s"}`;
      } else {
        action = "wrote note";
      }
      return {
        action,
        summary: event.rationale,
        agent: "resolver",
        scope: shortScope(event.scope),
        highlightIds: [
          event.scope,
          ...(event.new_id ? [event.new_id] : []),
          ...event.supersede_ids,
        ],
      };
    }
    default:
      return { action: "event", summary: "" };
  }
};

const shortScope = (id: string) => {
  const i = id.indexOf(".");
  return i === -1 ? id : id.slice(i + 1);
};
