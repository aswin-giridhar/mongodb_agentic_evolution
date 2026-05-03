import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "@/lib/utils";

export interface FileNodeData {
  label: string;
  claimedBy?: "producer" | "consumer" | string;
  collision?: boolean;
  glow?: boolean;
  pulse?: boolean;
}

export function FileNode({ data }: NodeProps<FileNodeData>) {
  const claimColor =
    data.claimedBy === "producer"
      ? "hsl(var(--agent-producer))"
      : data.claimedBy === "consumer"
      ? "hsl(var(--agent-consumer))"
      : undefined;
  return (
    <div
      className={cn(
        "relative flex items-center gap-2 px-1 py-0.5 transition-all",
        data.collision && "shake",
        data.pulse && "animate-pulse-glow",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-ink !border-0 !h-1 !w-1" />
      {data.claimedBy && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0"
          style={{ background: claimColor }}
        />
      )}
      <span
        className={cn(
          "font-mono text-[11px] text-ink underline decoration-ink/40 underline-offset-4",
          data.collision && "decoration-state-claim decoration-2",
          data.glow && "decoration-primary decoration-2",
        )}
      >
        {data.label}
      </span>
      <Handle type="source" position={Position.Bottom} className="!bg-ink !border-0 !h-1 !w-1" />
    </div>
  );
}
