"use client";

import { Handle, Position } from "reactflow";
import type { Service } from "@/types";
import { useStore } from "@/lib/store";

const TEAM_COLORS: Record<string, { bg: string; tag: string }> = {
  platform: { bg: "bg-slate-900", tag: "text-cyan-400" },
  mobile: { bg: "bg-slate-900", tag: "text-amber-400" },
  growth: { bg: "bg-slate-900", tag: "text-fuchsia-400" },
};

type Props = {
  data: { service: Service };
};

export const ServiceNode = ({ data }: Props) => {
  const { service } = data;
  const palette = TEAM_COLORS[service.owner_team] ?? TEAM_COLORS.platform;
  const highlighted = useStore((s) => s.highlightedEntityIds.has(service._id));
  const allConflicts = useStore((s) => s.conflictBadges);
  const hasConflict = allConflicts.some((b) => b.scope === service._id);

  return (
    <div
      className={`relative rounded-2xl border ${palette.bg} backdrop-blur-sm transition-all duration-300`}
      style={{
        width: 180,
        height: 80,
        borderColor: highlighted ? "#fbbf24" : "rgba(148, 163, 184, 0.4)",
        borderWidth: highlighted ? 2 : 1.5,
        boxShadow: highlighted
          ? "0 0 0 4px rgba(251, 191, 36, 0.18), 0 8px 32px rgba(0,0,0,0.4)"
          : "0 4px 24px rgba(0,0,0,0.35)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <Handle type="target" position={Position.Left} className="!opacity-0" id="left-target" />
      <Handle type="source" position={Position.Right} className="!opacity-0" id="right-source" />

      <div className="flex h-full flex-col justify-center px-4">
        <div className="font-mono text-[15px] font-semibold tracking-tight text-slate-100">
          {service.name}
        </div>
        <div className={`text-[11px] uppercase tracking-wider ${palette.tag}`}>
          {service.owner_team}
        </div>
      </div>

      {hasConflict && (
        <div className="absolute -right-2 -top-2 flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg animate-shake">
          ⚠ conflict
        </div>
      )}
    </div>
  );
};
