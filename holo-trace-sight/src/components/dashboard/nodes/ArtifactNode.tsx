import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "@/lib/utils";

export interface ArtifactNodeData {
  label: string;
  kind: string;
  referenced?: boolean;
  glow?: boolean;
  pulse?: boolean;
}

const kindLabel: Record<string, string> = {
  pr: "Pull Request",
  slack: "Slack",
  jira: "Jira",
};

export function ArtifactNode({ data }: NodeProps<ArtifactNodeData>) {
  return (
    <div
      className={cn(
        "relative flex w-[160px] flex-col bg-surface px-3 py-2 transition-all animate-fade-in",
        !data.referenced && "substrate-dim",
        data.glow ? "border-2 border-ink" : "border border-ink",
        data.pulse && "animate-pulse-glow",
      )}
      style={{ borderRadius: 2 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-ink !border-0 !h-1 !w-1" />
      <div className="smallcaps text-primary">{kindLabel[data.kind] ?? data.kind}</div>
      <div className="font-body text-[12px] font-medium leading-snug text-ink">{data.label}</div>
      {data.glow && <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-primary" />}
      <Handle type="source" position={Position.Bottom} className="!bg-ink !border-0 !h-1 !w-1" />
    </div>
  );
}
