"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { RecentEvent } from "@/lib/store";
import type { SubstrateEvent } from "@/types";

const AGENT_COLOR = {
  producer: { dot: "bg-indigo-400", text: "text-indigo-300" },
  consumer: { dot: "bg-emerald-400", text: "text-emerald-300" },
} as const;

export const ActivityStream = () => {
  const events = useStore((s) => s.recentEvents);
  const highlightEntities = useStore((s) => s.highlightEntities);

  return (
    <div className="flex h-full flex-col border-t border-slate-800/80 bg-slate-950/95">
      <div className="flex items-center justify-between border-b border-slate-800/60 px-5 py-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Activity stream
        </span>
        <span className="font-mono text-[10px] text-slate-600">
          {events.length} events
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ul className="divide-y divide-slate-900/80">
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
      className={`group cursor-pointer px-5 py-2 transition hover:bg-slate-900/40 ${
        isThought ? "pl-12" : ""
      }`}
    >
      <div className="flex items-baseline gap-3">
        {palette && (
          <span
            className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${palette.dot}`}
          />
        )}
        {!palette && <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-slate-600" />}
        <div className="flex-1 min-w-0">
          {isThought ? (
            <span className="font-mono text-[12px] italic text-slate-400">
              {detail.summary}
            </span>
          ) : (
            <>
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={`font-mono text-[10px] font-bold uppercase tracking-wider ${palette?.text ?? "text-slate-400"}`}
                >
                  {detail.action}
                </span>
                {detail.scope && (
                  <span className="rounded-sm bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                    {detail.scope}
                  </span>
                )}
                <RelTime ts={entry.timestamp} />
              </span>
              <span className="block truncate font-mono text-[12px] text-slate-200">
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
    <span className="font-mono text-[10px] text-slate-500">{label}</span>
  );
};

type EventDetail = {
  action: string;
  summary: string;
  agent?: "producer" | "consumer";
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
    default:
      return { action: "event", summary: "" };
  }
};

const shortScope = (id: string) => {
  const i = id.indexOf(".");
  return i === -1 ? id : id.slice(i + 1);
};
