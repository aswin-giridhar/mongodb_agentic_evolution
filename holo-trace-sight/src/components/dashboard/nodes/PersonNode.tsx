import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "@/lib/utils";

export interface PersonNodeData {
  label: string;
  initial: string;
  agent?: "producer" | "consumer" | string;
  glow?: boolean;
  pulse?: boolean;
}

export function PersonNode({ data }: NodeProps<PersonNodeData>) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5", data.pulse && "animate-pulse-glow")}>
      <Handle type="target" position={Position.Bottom} className="!bg-ink !border-0 !h-1 !w-1" />
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center bg-surface text-ink transition-all",
          data.glow ? "border-2" : "border",
          "border-ink",
        )}
        style={{ borderRadius: 2 }}
      >
        <span className="font-display text-[22px] font-semibold leading-none">{data.initial}</span>
      </div>
      <div className="font-body text-[11px] font-semibold uppercase tracking-wider text-ink">
        {data.label}
      </div>
      {data.glow && <div className="h-0.5 w-8 bg-primary" />}
      <Handle type="source" position={Position.Top} className="!bg-ink !border-0 !h-1 !w-1" />
    </div>
  );
}
