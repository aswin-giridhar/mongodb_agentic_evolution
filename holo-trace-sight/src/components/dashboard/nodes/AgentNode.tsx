import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "@/lib/utils";

export interface AgentNodeData {
  label: string;
  agent: "producer" | "consumer" | string;
  glow?: boolean;
  pulse?: boolean;
}

export function AgentNode({ data }: NodeProps<AgentNodeData>) {
  const isProducer = data.agent === "producer";
  const color = isProducer ? "hsl(var(--agent-producer))" : "hsl(var(--agent-consumer))";
  return (
    <div className={cn("flex flex-col items-center gap-1", data.pulse && "animate-pulse-glow")}>
      <Handle type="target" position={Position.Bottom} className="!opacity-0" />
      <div
        className="font-display text-[28px] italic leading-none"
        style={{ color, fontWeight: 700 }}
      >
        {isProducer ? "Producer ▸" : "◂ Consumer"}
      </div>
      <div
        className={cn(
          "h-1 w-full max-w-[140px] transition-all",
          data.glow ? "opacity-100" : "opacity-0",
        )}
        style={{ background: color }}
      />
      <div className="smallcaps mt-0.5 text-ink-dim">Agent</div>
      <Handle type="source" position={Position.Top} className="!opacity-0" />
    </div>
  );
}
