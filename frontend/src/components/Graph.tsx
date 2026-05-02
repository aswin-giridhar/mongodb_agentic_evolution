"use client";

import { useMemo, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";

import { ServiceNode } from "./nodes/ServiceNode";
import { PersonNode } from "./nodes/PersonNode";
import { ArtifactNode } from "./nodes/ArtifactNode";
import { WorkingContextPill } from "./nodes/WorkingContextPill";

import { useStore } from "@/lib/store";
import { SERVICE_POSITIONS } from "@/mock/services";
import { PERSON_POSITIONS } from "@/mock/people";
import { ARTIFACT_POSITIONS } from "@/mock/artifacts";
import type { ViewMode } from "@/types";

const nodeTypes = {
  service: ServiceNode,
  person: PersonNode,
  artifact: ArtifactNode,
  workingContext: WorkingContextPill,
};

const PILL_OFFSET_X = 20; // relative to service node top-left
const PILL_OFFSET_Y = 92;
const PILL_SPACING_Y = 38;

export const Graph = () => {
  const services = useStore((s) => s.services);
  const people = useStore((s) => s.people);
  const artifacts = useStore((s) => s.artifacts);
  const workingContext = useStore((s) => s.workingContext);
  const activeRetrievals = useStore((s) => s.activeRetrievals);
  const viewMode = useStore((s) => s.viewMode);
  const highlightEntities = useStore((s) => s.highlightEntities);

  const { nodes, edges } = useMemo(
    () =>
      buildGraph({
        services,
        people,
        artifacts,
        workingContext,
        activeRetrievals,
        viewMode,
      }),
    [services, people, artifacts, workingContext, activeRetrievals, viewMode],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      highlightEntities([node.id]);
    },
    [highlightEntities],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.5}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.15, includeHiddenNodes: false }}
      >
        <Background color="#1e293b" gap={24} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-slate-900/80 !border-slate-700"
        />
      </ReactFlow>
    </div>
  );
};

type BuildArgs = {
  services: ReturnType<typeof useStore.getState>["services"];
  people: ReturnType<typeof useStore.getState>["people"];
  artifacts: ReturnType<typeof useStore.getState>["artifacts"];
  workingContext: ReturnType<typeof useStore.getState>["workingContext"];
  activeRetrievals: ReturnType<typeof useStore.getState>["activeRetrievals"];
  viewMode: ViewMode;
};

const buildGraph = ({
  services,
  people,
  artifacts,
  workingContext,
  activeRetrievals,
  viewMode,
}: BuildArgs) => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // ---- Service nodes ----
  Object.values(services).forEach((service) => {
    const pos = SERVICE_POSITIONS[service._id] ?? { x: 0, y: 0 };
    nodes.push({
      id: service._id,
      type: "service",
      position: pos,
      data: { service },
      draggable: false,
    });
  });

  // ---- Person nodes ----
  Object.values(people).forEach((person) => {
    const pos = PERSON_POSITIONS[person._id] ?? { x: 0, y: 0 };
    nodes.push({
      id: person._id,
      type: "person",
      position: pos,
      data: { person },
      draggable: false,
    });
  });

  // ---- Structural edges (depends_on) ----
  Object.values(services).forEach((service) => {
    service.depends_on.forEach((depId) => {
      edges.push({
        id: `dep-${service._id}-${depId}`,
        source: service._id,
        target: depId,
        type: "smoothstep",
        animated: false,
        style: { stroke: "#475569", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#475569" },
      });
    });
  });

  // ---- Working context pills (Activity + Grounded) ----
  if (viewMode === "activity" || viewMode === "grounded") {
    // Group by scope so we can stack them.
    const byScope = new Map<string, typeof workingContext[string][]>();
    Object.values(workingContext).forEach((entry) => {
      const arr = byScope.get(entry.scope.entity_id) ?? [];
      arr.push(entry);
      byScope.set(entry.scope.entity_id, arr);
    });

    byScope.forEach((entries, scopeId) => {
      const servicePos = SERVICE_POSITIONS[scopeId];
      if (!servicePos) return;
      // Sort: active first, superseded last
      const sorted = [...entries].sort((a, b) => {
        if (a.active === b.active) return a.created_at.localeCompare(b.created_at);
        return a.active ? -1 : 1;
      });

      sorted.forEach((entry, idx) => {
        const x = servicePos.x + PILL_OFFSET_X;
        const y = servicePos.y + PILL_OFFSET_Y + idx * PILL_SPACING_Y;
        nodes.push({
          id: entry._id,
          type: "workingContext",
          position: { x, y },
          data: { entry },
          draggable: false,
        });

        // Supersedes edge
        if (entry.supersedes && workingContext[entry.supersedes]) {
          edges.push({
            id: `supersedes-${entry._id}`,
            source: entry.supersedes,
            target: entry._id,
            type: "smoothstep",
            label: "supersedes",
            labelStyle: {
              fill: "#cbd5e1",
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "ui-monospace, monospace",
            },
            labelBgStyle: { fill: "#0f172a" },
            labelBgPadding: [4, 4],
            style: { stroke: "#a78bfa", strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#a78bfa" },
          });
        }
      });
    });
  }

  // ---- Artifact nodes (Grounded view) ----
  if (viewMode === "grounded") {
    // Determine which artifacts are referenced by visible WC entries
    // (or by active retrievals).
    const referenced = new Set<string>();
    Object.values(workingContext).forEach((entry) => {
      entry.refs.forEach((ref) => referenced.add(ref));
    });
    activeRetrievals.forEach((r) => {
      r.returnedArtifactIds.forEach((id) => referenced.add(id));
    });

    referenced.forEach((artifactId) => {
      const artifact = artifacts[artifactId];
      if (!artifact) return;
      const pos = ARTIFACT_POSITIONS[artifactId] ?? { x: 0, y: 0 };
      nodes.push({
        id: artifact._id,
        type: "artifact",
        position: pos,
        data: { artifact, isReferenced: true },
        draggable: false,
      });
    });

    // Reference edges (dotted) from WC entries → artifacts
    Object.values(workingContext).forEach((entry) => {
      entry.refs.forEach((ref) => {
        if (!artifacts[ref]) return;
        edges.push({
          id: `ref-${entry._id}-${ref}`,
          source: entry._id,
          target: ref,
          type: "straight",
          style: {
            stroke: "#64748b",
            strokeWidth: 1,
            strokeDasharray: "3 4",
          },
        });
      });
    });
  }

  // ---- Active retrieval path (animated) ----
  activeRetrievals.forEach((retrieval) => {
    const opacity = retrieval.status === "fading" ? 0.3 : 1;
    const stroke = retrieval.agent === "producer" ? "#818cf8" : "#34d399";

    // Path: scope → resolved → traversed nodes → returned entries/artifacts.
    const path: string[] = [];
    if (retrieval.scope) path.push(retrieval.scope);
    if (
      retrieval.resolvedEntity &&
      retrieval.resolvedEntity !== retrieval.scope
    ) {
      path.push(retrieval.resolvedEntity);
    }
    retrieval.traversedEntities.forEach((id) => {
      if (!path.includes(id)) path.push(id);
    });

    for (let i = 0; i < path.length - 1; i++) {
      edges.push({
        id: `retr-${retrieval.id}-${i}`,
        source: path[i],
        target: path[i + 1],
        type: "smoothstep",
        animated: true,
        style: {
          stroke,
          strokeWidth: 2.5,
          opacity,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      });
    }

    // Edges from resolved entity into returned entries / artifacts
    const anchor =
      retrieval.resolvedEntity ?? retrieval.scope ?? path[path.length - 1];
    if (anchor) {
      retrieval.returnedEntryIds.forEach((entryId, i) => {
        edges.push({
          id: `retr-${retrieval.id}-entry-${i}`,
          source: anchor,
          target: entryId,
          type: "smoothstep",
          animated: true,
          style: { stroke, strokeWidth: 2, opacity, strokeDasharray: "4 4" },
        });
      });
      retrieval.returnedArtifactIds.forEach((artId, i) => {
        edges.push({
          id: `retr-${retrieval.id}-art-${i}`,
          source: anchor,
          target: artId,
          type: "smoothstep",
          animated: true,
          style: { stroke, strokeWidth: 2, opacity, strokeDasharray: "4 4" },
        });
      });
    }
  });

  return { nodes, edges };
};
