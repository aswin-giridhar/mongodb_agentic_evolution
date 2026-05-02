"use client";

import { Handle, Position } from "reactflow";
import type { Person } from "@/types";
import { useStore } from "@/lib/store";

const TEAM_RING: Record<string, string> = {
  platform: "ring-cyan-400/60",
  mobile: "ring-amber-400/60",
  growth: "ring-fuchsia-400/60",
};

type Props = {
  data: { person: Person };
};

export const PersonNode = ({ data }: Props) => {
  const { person } = data;
  const ring = TEAM_RING[person.team] ?? TEAM_RING.platform;
  const highlighted = useStore((s) => s.highlightedEntityIds.has(person._id));

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-slate-800 ring-2 transition-all ${ring}`}
      style={{
        width: 60,
        height: 60,
        boxShadow: highlighted
          ? "0 0 0 4px rgba(251, 191, 36, 0.25), 0 4px 16px rgba(0,0,0,0.4)"
          : "0 4px 16px rgba(0,0,0,0.3)",
        outline: highlighted ? "2px solid #fbbf24" : "none",
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div className="text-center">
        <div className="text-base font-semibold text-slate-100">
          {person.name[0]}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-slate-400">
          {person.name}
        </div>
      </div>
    </div>
  );
};
