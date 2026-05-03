import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "@/lib/utils";

export interface ServiceNodeData {
  label: string;
  team?: string;
  glow?: boolean;
  pulse?: boolean;
}

export function ServiceNode({ data }: NodeProps<ServiceNodeData>) {
  return (
    <div
      className={cn(
        "relative min-w-[180px] border bg-surface px-4 py-3 transition-all",
        data.glow ? "border-2 border-ink" : "border-ink",
        data.pulse && "animate-pulse-glow",
      )}
      style={{ borderRadius: 2 }}
    >
      <Handle type="target" position={Position.Left} className="!bg-ink !border-0 !h-1.5 !w-1.5" />
      <div className="smallcaps text-ink-dim">Service</div>
      <div className="font-body text-[15px] font-bold leading-tight text-ink">{data.label}</div>
      {data.team && (
        <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink-dim">
          {data.team}
        </div>
      )}
      {data.glow && (
        <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-primary" />
      )}
      <Handle type="source" position={Position.Right} className="!bg-ink !border-0 !h-1.5 !w-1.5" />
    </div>
  );
}
