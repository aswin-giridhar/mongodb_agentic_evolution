"use client";

import { Handle, Position } from "reactflow";
import type { Artifact } from "@/types";
import { useStore } from "@/lib/store";

const SOURCE_ICON: Record<string, string> = {
  slack: "💬",
  github: "⌥",
  jira: "✦",
};

const SOURCE_TINT: Record<string, string> = {
  slack: "text-emerald-300",
  github: "text-slate-200",
  jira: "text-sky-300",
};

type Props = {
  data: { artifact: Artifact; isReferenced: boolean };
};

export const ArtifactNode = ({ data }: Props) => {
  const { artifact, isReferenced } = data;
  const highlighted = useStore((s) =>
    s.highlightedEntityIds.has(artifact._id),
  );
  const tint = SOURCE_TINT[artifact.source] ?? "text-slate-200";

  const showFull = isReferenced || highlighted;

  return (
    <div
      className="relative flex items-center justify-center transition-all"
      style={{
        width: 80,
        height: 80,
        opacity: showFull ? 1 : 0.45,
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div
        className="absolute inset-0 rotate-45 rounded-md border border-slate-500/60 bg-slate-800/80 transition-all"
        style={{
          boxShadow: showFull
            ? "0 0 0 3px rgba(56, 189, 248, 0.35), 0 4px 20px rgba(0,0,0,0.4)"
            : "0 2px 12px rgba(0,0,0,0.3)",
          borderColor: showFull
            ? "rgba(125, 211, 252, 0.7)"
            : "rgba(100, 116, 139, 0.4)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-0.5">
        <span className={`text-lg leading-none ${tint}`}>
          {SOURCE_ICON[artifact.source] ?? "·"}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-slate-300">
          {artifact.source}
        </span>
      </div>
    </div>
  );
};
