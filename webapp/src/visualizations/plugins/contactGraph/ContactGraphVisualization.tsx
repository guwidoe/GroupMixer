import React, { useCallback, useMemo, useState } from "react";
import type { VisualizationComponentProps } from "../../types";
import { computeContactsFromSnapshot, computeContactsFromSolution } from "./buildContactGraph";

import { SigmaContainer } from "@react-sigma/core";

import { GraphLoader } from "./components/GraphLoader";
import { Legend } from "./components/Legend";
import { HighlightReducers } from "./components/HighlightReducers";
import { EdgeListPanel } from "./components/EdgeListPanel";
import { NodeTooltip } from "./components/NodeTooltip";
import { SigmaEvents } from "./components/SigmaEvents";
import { buildGraphData } from "./utils/graphBuilder";
import { getAttributeKeys } from "./utils/attributeUtils";
import type { CircleOrder, EdgeColorMode, EdgeInfo, HoveredItem, LayoutMode } from "./types";

export function ContactGraphVisualization({ data }: VisualizationComponentProps) {
  const problem = data.problem;
  const sessionCount = problem.num_sessions || 0;

  const attributeKeys = useMemo(() => getAttributeKeys(problem.people), [problem.people]);
  const [nodeColorAttr, setNodeColorAttr] = useState<string | null>(() => {
    return attributeKeys.length > 0 ? attributeKeys[0] : null;
  });

  const [edgeColorMode, setEdgeColorMode] = useState<EdgeColorMode>("byCount");
  const [sessionFilter, setSessionFilter] = useState<number | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [circleOrder, setCircleOrder] = useState<CircleOrder>("degree");
  const [circleOrderAttr, setCircleOrderAttr] = useState<string | null>(() => {
    return attributeKeys.length > 0 ? attributeKeys[0] : null;
  });

  const [minMeetingCount, setMinMeetingCount] = useState<number>(1);
  const [hoveredNode, setHoveredNode] = useState<{ type: "node"; id: string; label: string } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeInfo | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of problem.people) {
      m.set(p.id, p.attributes?.name || p.id);
    }
    return m;
  }, [problem.people]);

  const people = useMemo(
    () =>
      problem.people.map((p) => ({
        id: p.id,
        attributes: p.attributes || {},
      })),
    [problem.people]
  );

  const edgeStats = useMemo(() => {
    const m =
      data.kind === "final"
        ? computeContactsFromSolution(problem, data.solution)
        : computeContactsFromSnapshot(problem, data.schedule);
    return Array.from(m.values());
  }, [data, problem]);

  const maxEdgeCountForUi = useMemo(() => {
    let max = 0;
    for (const e of edgeStats) {
      const c = sessionFilter === null ? e.total : (e.perSession[sessionFilter] || 0);
      if (c > max) max = c;
    }
    return Math.max(1, max);
  }, [edgeStats, sessionFilter]);

  const clampedMinMeetingCount = useMemo(() => {
    return Math.min(Math.max(1, minMeetingCount), maxEdgeCountForUi);
  }, [minMeetingCount, maxEdgeCountForUi]);

  const graph = useMemo(() => {
    return buildGraphData({
      people,
      edges: edgeStats,
      sessionCount,
      sessionFilter,
      edgeColorMode,
      nodeColorAttributeKey: nodeColorAttr,
      layoutMode,
      circleOrder,
      circleOrderAttributeKey: circleOrderAttr,
      minMeetingCount: clampedMinMeetingCount,
    });
  }, [
    people,
    edgeStats,
    sessionCount,
    sessionFilter,
    edgeColorMode,
    nodeColorAttr,
    layoutMode,
    circleOrder,
    circleOrderAttr,
    clampedMinMeetingCount,
  ]);

  const selectedNodeEdges = useMemo((): EdgeInfo[] => {
    if (!selectedNodeId) return [];
    const result: EdgeInfo[] = [];
    for (const edge of graph.edges(selectedNodeId)) {
      const [a, b] = graph.extremities(edge) as [string, string];
      const total = (graph.getEdgeAttribute(edge, "total") as number) || 0;
      const perSession = (graph.getEdgeAttribute(edge, "perSession") as number[]) || [];
      result.push({
        edgeId: edge,
        a,
        b,
        aLabel: labelById.get(a) || a,
        bLabel: labelById.get(b) || b,
        total,
        perSession,
      });
    }
    return result;
  }, [selectedNodeId, graph, labelById]);

  const handleHoverNode = useCallback(
    (item: { type: "node"; id: string; label: string } | null) => {
      setHoveredNode(item);
    },
    []
  );

  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
    setHoveredEdge(null);
  }, []);

  const handleClear = useCallback(() => {
    setHoveredNode(null);
    setHoveredEdge(null);
    setSelectedNodeId(null);
  }, []);

  const handleHoverEdge = useCallback((edge: EdgeInfo | null) => {
    setHoveredEdge(edge);
  }, []);

  const selectedNodeLabel = useMemo(() => {
    if (!selectedNodeId) return null;
    return labelById.get(selectedNodeId) || selectedNodeId;
  }, [selectedNodeId, labelById]);

  const hoveredItem: HoveredItem = useMemo(() => {
    if (hoveredEdge) {
      return { type: "edge", ...hoveredEdge };
    }
    return hoveredNode;
  }, [hoveredEdge, hoveredNode]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Nodes = people • Edges = met in same group • Click node to see connections
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Session
          </label>
          <select
            value={sessionFilter === null ? "all" : String(sessionFilter)}
            onChange={(e) => {
              const v = e.target.value;
              setSessionFilter(v === "all" ? null : Number(v));
            }}
            className="px-2 py-1 rounded border text-sm"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            <option value="all">All sessions</option>
            {Array.from({ length: sessionCount }, (_, s) => (
              <option key={s} value={String(s)}>
                Session {s + 1}
              </option>
            ))}
          </select>

          <label className="text-xs ml-2" style={{ color: "var(--text-secondary)" }}>
            Edge color
          </label>
          <select
            value={edgeColorMode}
            onChange={(e) => setEdgeColorMode(e.target.value as EdgeColorMode)}
            className="px-2 py-1 rounded border text-sm"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            <option value="byCount">By meeting count</option>
            <option value="byDominantSession">By dominant session (hue)</option>
          </select>

          <label className="text-xs ml-2" style={{ color: "var(--text-secondary)" }}>
            Node color
          </label>
          <select
            value={nodeColorAttr || "none"}
            onChange={(e) => {
              const v = e.target.value;
              setNodeColorAttr(v === "none" ? null : v);
            }}
            className="px-2 py-1 rounded border text-sm"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            <option value="none">None</option>
            {attributeKeys.map((k) => (
              <option key={k} value={k}>
                Attribute: {k}
              </option>
            ))}
          </select>

          <label className="text-xs ml-2" style={{ color: "var(--text-secondary)" }}>
            Layout
          </label>
          <select
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
            className="px-2 py-1 rounded border text-sm"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            <option value="force">Force</option>
            <option value="circle">Circle</option>
          </select>

          {layoutMode === "circle" && (
            <>
              <label className="text-xs ml-2" style={{ color: "var(--text-secondary)" }}>
                Order
              </label>
              <select
                value={circleOrder}
                onChange={(e) => setCircleOrder(e.target.value as CircleOrder)}
                className="px-2 py-1 rounded border text-sm"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="degree">By degree</option>
                <option value="id">By id</option>
                <option value="attribute">By attribute</option>
              </select>

              {circleOrder === "attribute" && (
                <select
                  value={circleOrderAttr || "none"}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCircleOrderAttr(v === "none" ? null : v);
                  }}
                  className="px-2 py-1 rounded border text-sm"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    borderColor: "var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="none">Attribute…</option>
                  {attributeKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Min meetings
        </label>
        <input
          type="range"
          min={1}
          max={maxEdgeCountForUi}
          value={clampedMinMeetingCount}
          onChange={(e) => setMinMeetingCount(Number(e.target.value))}
        />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          ≥ {clampedMinMeetingCount}
        </span>

        {selectedNodeId && (
          <button
            onClick={() => setSelectedNodeId(null)}
            className="ml-4 px-2 py-1 rounded border text-xs flex items-center gap-1"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            <span>Showing: {selectedNodeLabel}</span>
            <span style={{ color: "var(--text-tertiary)" }}>✕</span>
          </button>
        )}
      </div>

      <div
        className="relative rounded border"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-primary)",
          height: 520,
        }}
      >
        <SigmaContainer
          style={{ height: "100%", width: "100%" }}
          settings={{
            renderEdgeLabels: false,
            defaultEdgeType: "line",
            labelRenderedSizeThreshold: 12,
            zIndex: true,
          }}
        >
          <GraphLoader graph={graph} />
          <SigmaEvents onHoverNode={handleHoverNode} onSelectNode={handleSelectNode} onClear={handleClear} />
          <HighlightReducers hoveredItem={hoveredItem} selectedNodeId={selectedNodeId} />
        </SigmaContainer>

        <Legend
          nodeColorAttr={nodeColorAttr}
          edgeColorMode={edgeColorMode}
          minMeetingCount={clampedMinMeetingCount}
          maxEdgeCountForUi={maxEdgeCountForUi}
          sessionCount={sessionCount}
        />

        {selectedNodeId && selectedNodeLabel ? (
          <EdgeListPanel
            selectedNodeId={selectedNodeId}
            selectedNodeLabel={selectedNodeLabel}
            edges={selectedNodeEdges}
            sessionCount={sessionCount}
            hoveredEdgeId={hoveredEdge?.edgeId || null}
            onHoverEdge={handleHoverEdge}
            onClear={handleClear}
          />
        ) : (
          <NodeTooltip hoveredItem={hoveredNode} />
        )}
      </div>

      {data.kind === "live" && data.progress && (
        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Iteration {data.progress.iteration.toLocaleString()} • best score {data.progress.best_score.toFixed(2)}
        </div>
      )}
    </div>
  );
}
