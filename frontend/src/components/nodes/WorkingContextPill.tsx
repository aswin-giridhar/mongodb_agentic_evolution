"use client";

import { Handle, Position } from "reactflow";
import type { WorkingContextEntry } from "@/types";
import { useStore } from "@/lib/store";

// Each type still carries its accent in the bg tint + label text color.
// Perimeter is uniform white per the dashboard's monochrome chrome rule.
const TYPE_STYLES: Record<
  WorkingContextEntry["type"],
  { bg: string; text: string; label: string; ring: string }
> = {
  draft_schema: {
    bg: "bg-blue-500/15",
    text: "text-blue-200",
    label: "schema",
    ring: "border-white/70",
  },
  decision: {
    bg: "bg-purple-500/15",
    text: "text-purple-200",
    label: "decision",
    ring: "border-white/70",
  },
  claim: {
    bg: "bg-amber-500/15",
    text: "text-amber-200",
    label: "claim",
    ring: "border-white/70",
  },
  investigation: {
    bg: "bg-teal-500/15",
    text: "text-teal-200",
    label: "investigation",
    ring: "border-white/70",
  },
  open_question: {
    bg: "bg-slate-500/15",
    text: "text-slate-300",
    label: "question",
    ring: "border-white/70",
  },
};

const AGENT_DOT: Record<"producer" | "consumer", string> = {
  producer: "bg-purple-400",
  consumer: "bg-emerald-400",
};

type Props = {
  data: { entry: WorkingContextEntry };
};

export const WorkingContextPill = ({ data }: Props) => {
  const { entry } = data;
  const style = TYPE_STYLES[entry.type];
  const isPulsing = useStore((s) => s.recentlyCreatedWcIds.has(entry._id));
  const isHighlighted = useStore((s) =>
    s.highlightedEntityIds.has(entry._id),
  );
  const isSuperseded = !!entry.superseded_by;

  return (
    <div
      className={`group relative flex items-center gap-2 rounded-full border ${style.ring} ${style.bg} px-3 py-1.5 backdrop-blur-md transition-all ${isPulsing ? "animate-pulse-pill" : ""}`}
      style={{
        width: 200,
        height: 32,
        opacity: isSuperseded ? 0.4 : 1,
        boxShadow: isHighlighted
          ? "0 0 0 3px rgba(251, 191, 36, 0.35)"
          : "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />

      <span
        className={`h-2 w-2 shrink-0 rounded-full ${AGENT_DOT[entry.author]}`}
        title={`author: ${entry.author}`}
      />
      <span
        className={`shrink-0 text-[9px] font-bold uppercase tracking-wider ${style.text}`}
      >
        {style.label}
      </span>
      <span className="truncate font-sans text-[11px] text-white/90">
        {entry.content}
      </span>
    </div>
  );
};
