import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "@/lib/utils";
import { wcLabel, wcStateVar } from "@/lib/substrate/palette";
import type { WCType } from "@/lib/substrate/types";

export interface WCNodeData {
  type: WCType;
  summary: string;
  superseded?: boolean;
  glow?: boolean;
  pulse?: boolean;
  agent?: string;
}

export function WorkingContextNode({ data }: NodeProps<WCNodeData>) {
  const color = `hsl(${wcStateVar(data.type)})`;
  const isQuestion = data.type === "open_question";
  return (
    <div
      className={cn(
        "relative max-w-[220px] bg-surface px-3 py-1.5 transition-all animate-scale-in",
        data.superseded && "substrate-dim",
        data.pulse && !data.superseded && "underline-sweep",
      )}
      style={{
        borderRadius: 999,
        border: `1.5px ${isQuestion ? "dashed" : "solid"} ${color}`,
        boxShadow: data.glow ? `0 0 0 2px hsl(var(--ink))` : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
        <span className="smallcaps" style={{ color }}>
          {wcLabel[data.type]}
        </span>
      </div>
      <div className="wc-summary mt-0.5 truncate font-body text-[12px] leading-tight text-ink">
        {data.summary}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}
