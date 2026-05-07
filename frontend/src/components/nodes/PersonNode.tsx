"use client";

import { Handle, Position } from "reactflow";
import type { Person } from "@/types";
import { useStore } from "@/lib/store";

type Props = {
  data: { person: Person };
};

export const PersonNode = ({ data }: Props) => {
  const { person } = data;
  const highlighted = useStore((s) => s.highlightedEntityIds.has(person._id));

  return (
    <div
      className="flex items-center justify-center rounded-full bg-white/[0.04] ring-2 ring-white backdrop-blur-xl transition-all"
      style={{
        width: 60,
        height: 60,
        boxShadow: highlighted
          ? "0 0 0 3px rgba(251, 191, 36, 0.25), 0 4px 16px rgba(0,0,0,0.6)"
          : "0 4px 16px rgba(0,0,0,0.5)",
        outline: highlighted ? "2px solid #fbbf24" : "none",
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div className="text-center">
        <div className="text-base font-semibold text-white">
          {person.name[0]}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-white/55">
          {person.name}
        </div>
      </div>
    </div>
  );
};
