import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";

import { useSubstrate, activeGlowIds } from "@/lib/substrate/store";
import { ServiceNode } from "./nodes/ServiceNode";
import { FileNode } from "./nodes/FileNode";
import { PersonNode } from "./nodes/PersonNode";
import { WorkingContextNode } from "./nodes/WorkingContextNode";
import { ArtifactNode } from "./nodes/ArtifactNode";
import { AgentNode } from "./nodes/AgentNode";
import { CURATED_ANCHORS, anchorFor, dagreLayout, radialPlace } from "@/lib/substrate/layout";

const nodeTypes = {
  service: ServiceNode,
  file: FileNode,
  person: PersonNode,
  wc: WorkingContextNode,
  artifact: ArtifactNode,
  agent: AgentNode,
};

const AGENT_POSITIONS: Record<string, { x: number; y: number }> = {
  "agent:producer": { x: -900, y: 260 },
  "agent:consumer": { x: 900, y: 260 },
};

function GraphInner() {
  const view = useSubstrate((s) => s.view);
  const services = useSubstrate((s) => s.services);
  const files = useSubstrate((s) => s.files);
  const people = useSubstrate((s) => s.people);
  const artifacts = useSubstrate((s) => s.artifacts);
  const wc = useSubstrate((s) => s.workingContext);
  const referenced = useSubstrate((s) => s.referencedArtifacts);
  const claims = useSubstrate((s) => s.claims);
  const collisions = useSubstrate((s) => s.collisions);
  const pulses = useSubstrate((s) => s.pulses);
  const highlights = useSubstrate((s) => s.highlights);
  const focus = useSubstrate((s) => s.focus);
  const clearFocus = useSubstrate((s) => s.clearFocus);
  const expireTransient = useSubstrate((s) => s.expireTransient);

  const rf = useReactFlow();
  const [tick, setTick] = useState(0);

  // Drive transient (pulse / highlight) expiry + re-render at ~60fps while active.
  useEffect(() => {
    if (!Object.keys(pulses).length && !highlights.length) return;
    let raf = 0;
    const loop = () => {
      expireTransient();
      setTick((t) => (t + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pulses, highlights, expireTransient]);

  const { nodes, edges } = useMemo(() => {
    const now = Date.now();
    const glow = activeGlowIds(highlights, now);
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // --- Agents (always shown so retrieval source has a node)
    (["producer", "consumer"] as const).forEach((a) => {
      const id = `agent:${a}`;
      nodes.push({
        id,
        type: "agent",
        position: AGENT_POSITIONS[id],
        data: {
          label: a,
          agent: a,
          glow: glow.has(id),
          pulse: !!pulses[id],
        },
      });
    });

    // --- Services
    Object.values(services).forEach((s) => {
      const id = s._id;
      const pos = anchorFor(id) ?? { x: 0, y: 0 };
      nodes.push({
        id,
        type: "service",
        position: pos,
        data: {
          label: s.name,
          team: s.team,
          glow: glow.has(id),
          pulse: !!pulses[id],
        },
      });
      s.depends_on?.forEach((dep) => {
        edges.push({
          id: `${id}->${dep}`,
          source: id,
          target: dep,
          style: { stroke: "hsl(var(--edge-structural))", strokeWidth: 1.5 },
          animated: false,
        });
      });
    });

    // --- Files (positioned just below their service)
    const filesByService: Record<string, string[]> = {};
    Object.values(files).forEach((f) => {
      (filesByService[f.service_id] ??= []).push(f._id);
    });
    Object.entries(filesByService).forEach(([svcId, fids]) => {
      const parent = anchorFor(svcId) ?? { x: 0, y: 0 };
      fids.forEach((fid, i) => {
        const offset = (i - (fids.length - 1) / 2) * 160;
        const f = files[fid];
        nodes.push({
          id: fid,
          type: "file",
          position: { x: parent.x + offset, y: parent.y + 130 },
          data: {
            label: f.name,
            claimedBy: claims[fid]?.agent,
            collision: !!collisions[fid] && Date.now() - collisions[fid].at < 2000,
            glow: glow.has(fid),
            pulse: !!pulses[fid],
          },
        });
        edges.push({
          id: `${svcId}->${fid}`,
          source: svcId,
          target: fid,
          style: { stroke: "hsl(var(--edge-structural))", strokeWidth: 1, strokeDasharray: "2 4" },
        });
      });
    });

    // --- People
    Object.values(people).forEach((p) => {
      const id = p._id;
      const pos = anchorFor(id) ?? { x: 0, y: -260 };
      nodes.push({
        id,
        type: "person",
        position: pos,
        data: {
          label: p.name,
          initial: p.name.slice(0, 1).toUpperCase(),
          glow: glow.has(id),
          pulse: !!pulses[id],
        },
      });
    });

    // --- Working context (only Activity / Grounded)
    if (view !== "structure") {
      const wcByScope: Record<string, string[]> = {};
      Object.values(wc).forEach((w) => {
        (wcByScope[w.scope.entity_id] ??= []).push(w._id);
      });
      Object.entries(wcByScope).forEach(([scopeId, wids]) => {
        const parent =
          anchorFor(scopeId) ??
          // file? compute from its service anchor
          (() => {
            const f = files[scopeId];
            return f ? anchorFor(f.service_id) ?? { x: 0, y: 0 } : { x: 0, y: 0 };
          })();
        const placed = radialPlace(
          { x: parent.x, y: parent.y - 40 },
          wids,
          { radius: 200, startAngle: -Math.PI * 0.9, sweep: Math.PI * 0.8 }
        );
        wids.forEach((wid) => {
          const w = wc[wid];
          nodes.push({
            id: wid,
            type: "wc",
            position: placed[wid],
            data: {
              type: w.type,
              summary: w.summary,
              superseded: !!w.superseded_by,
              agent: w.author,
              glow: glow.has(wid),
              pulse: !!pulses[wid],
            },
          });
          // Authorship edge
          edges.push({
            id: `auth:${wid}`,
            source: `agent:${w.author}`,
            target: wid,
            style: {
              stroke:
                w.author === "producer"
                  ? "hsl(var(--agent-producer))"
                  : "hsl(var(--agent-consumer))",
              strokeWidth: 1.5,
              strokeDasharray: "5 4",
              opacity: 0.8,
            },
          });
          // Scope edge (wc -> scope entity)
          edges.push({
            id: `scope:${wid}`,
            source: wid,
            target: scopeId,
            style: {
              stroke: "hsl(var(--edge-structural))",
              strokeWidth: 1,
              opacity: 0.7,
            },
          });
          // Supersedes
          if (w.supersedes) {
            edges.push({
              id: `sup:${w.supersedes}->${wid}`,
              source: w.supersedes,
              target: wid,
              label: "supersedes",
              labelStyle: { fill: "hsl(var(--ink-dim))", fontSize: 10 },
              style: { stroke: "hsl(var(--ink-dim))", strokeWidth: 1.5 },
            });
          }
        });
      });
    }

    // --- Artifacts (Grounded only)
    if (view === "grounded") {
      const visibleArtifactIds = new Set<string>();
      Object.values(wc).forEach((w) => w.refs?.forEach((r) => visibleArtifactIds.add(r)));
      Array.from(visibleArtifactIds).forEach((aid, i) => {
        const a = artifacts[aid];
        if (!a) return;
        nodes.push({
          id: aid,
          type: "artifact",
          position: { x: -200 + i * 220, y: 380 },
          data: {
            label: a.title,
            kind: a.kind,
            referenced: referenced.has(aid),
            glow: glow.has(aid),
            pulse: !!pulses[aid],
          },
        });
        // ref edges from each wc that references this artifact
        Object.values(wc).forEach((w) => {
          if (w.refs?.includes(aid)) {
            edges.push({
              id: `ref:${w._id}->${aid}`,
              source: w._id,
              target: aid,
              style: {
                stroke: "hsl(var(--primary))",
                strokeWidth: 1,
                strokeDasharray: "2 6",
                opacity: 0.7,
              },
            });
          }
        });
      });
    }

    // Dagre fallback for any service/person without a curated anchor
    const missing = nodes.filter(
      (n) =>
        (n.type === "service" || n.type === "person") &&
        !CURATED_ANCHORS[n.id]
    );
    if (missing.length) {
      const positions = dagreLayout(missing, edges.filter((e) =>
        missing.some((m) => m.id === e.source || m.id === e.target)
      ));
      missing.forEach((n) => {
        if (positions[n.id]) n.position = positions[n.id];
      });
    }

    return { nodes, edges };
    // tick triggers re-eval for transient glow/pulse animation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    view,
    services,
    files,
    people,
    artifacts,
    wc,
    referenced,
    claims,
    collisions,
    pulses,
    highlights,
    tick,
  ]);

  // Initial fit + on big structural changes
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!fittedRef.current && nodes.length > 0) {
      requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 400 }));
      fittedRef.current = true;
    }
  }, [nodes.length, rf]);

  // React to focus requests from the activity stream
  useEffect(() => {
    if (focus && focus.length) {
      const ids = new Set(focus);
      const targetNodes = nodes.filter((n) => ids.has(n.id));
      if (targetNodes.length) {
        rf.fitView({ nodes: targetNodes, padding: 0.5, duration: 600 });
      }
      const t = setTimeout(clearFocus, 1500);
      return () => clearTimeout(t);
    }
  }, [focus, nodes, rf, clearFocus]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.3}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
    >
      <Background gap={56} size={1.2} color="hsl(var(--ink) / 0.18)" />
      <Controls
        className="!bg-surface !border !border-ink [&>button]:!bg-surface [&>button]:!border-ink [&>button]:!text-ink"
        showInteractive={false}
      />
    </ReactFlow>
  );
}

export function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <div className="h-full w-full">
        <GraphInner />
      </div>
    </ReactFlowProvider>
  );
}