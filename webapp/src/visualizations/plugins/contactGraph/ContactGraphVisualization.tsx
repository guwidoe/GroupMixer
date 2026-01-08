import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { VisualizationComponentProps } from "../../types";
import { computeContactsFromSnapshot, computeContactsFromSolution } from "./buildContactGraph";
import type { ContactEdgeStats } from "./buildContactGraph";

import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from "@react-sigma/core";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

function clampByte(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x)));
}

function hslToRgb(h: number, sPct: number, lPct: number): { r: number; g: number; b: number } {
  const s = sPct / 100;
  const l = lPct / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = ((h % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: clampByte((rp + m) * 255),
    g: clampByte((gp + m) * 255),
    b: clampByte((bp + m) * 255),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hashToHex(input: string, s = 55, l = 55): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return rgbToHex(hslToRgb(h % 360, s, l));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sessionHue(sessionIndex: number, sessionCount: number): number {
  if (sessionCount <= 1) return 210;
  return (sessionIndex / (sessionCount - 1)) * 300; // 0..300
}

function countToColor(count: number, max: number): string {
  const t = max > 0 ? Math.min(1, count / max) : 0;
  // blue -> red
  const hue = lerp(210, 10, t);
  const sat = lerp(35, 70, t);
  const light = lerp(70, 50, t);
  return rgbToHex(hslToRgb(hue, sat, light));
}

type EdgeColorMode = "byCount" | "byDominantSession";
type LayoutMode = "force" | "circle";
type CircleOrder = "degree" | "id" | "attribute";

interface EdgeInfo {
  edgeId: string;
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  total: number;
  perSession: number[];
}

function buildGraphData(args: {
  people: Array<{ id: string; attributes: Record<string, string> }>;
  edges: ContactEdgeStats[];
  sessionCount: number;
  sessionFilter: number | null;
  edgeColorMode: EdgeColorMode;
  nodeColorAttributeKey: string | null;
  layoutMode: LayoutMode;
  circleOrder: CircleOrder;
  circleOrderAttributeKey: string | null;
  minMeetingCount: number;
}) {
  const {
    people,
    edges,
    sessionCount,
    sessionFilter,
    edgeColorMode,
    nodeColorAttributeKey,
    layoutMode,
    circleOrder,
    circleOrderAttributeKey,
    minMeetingCount,
  } = args;

  const g = new Graph({ multi: false, type: "undirected" });

  // node colors
  const attrKey = nodeColorAttributeKey;
  for (const p of people) {
    const label = p.attributes.name || p.id;
    const color =
      attrKey && p.attributes[attrKey]
        ? hashToHex(`${attrKey}:${p.attributes[attrKey]}`, 55, 55)
        : hashToHex(p.id, 35, 55);

    g.addNode(p.id, {
      label,
      color,
      size: 4,
      x: Math.random(),
      y: Math.random(),
    });
  }

  const maxCountAll = edges.reduce((m, e) => Math.max(m, e.total), 0);
  const maxCountFiltered =
    sessionFilter === null
      ? maxCountAll
      : edges.reduce((m, e) => Math.max(m, e.perSession[sessionFilter] || 0), 0);

  const filteredEdges: Array<{ e: ContactEdgeStats; count: number }> = [];
  for (const e of edges) {
    const count = sessionFilter === null ? e.total : (e.perSession[sessionFilter] || 0);
    if (count < minMeetingCount) continue;
    if (count <= 0) continue;
    filteredEdges.push({ e, count });
  }

  for (const { e, count } of filteredEdges) {
    let color = "rgba(148,163,184,0.65)";
    if (edgeColorMode === "byCount") {
      color = countToColor(count, Math.max(1, maxCountFiltered));
    } else {
      let bestS = 0;
      let bestC = -1;
      for (let s = 0; s < sessionCount; s++) {
        const c = e.perSession[s] || 0;
        if (c > bestC) {
          bestC = c;
          bestS = s;
        }
      }
      const hue = sessionHue(bestS, sessionCount);
      const t = Math.min(1, count / Math.max(1, maxCountFiltered));
      color = rgbToHex(hslToRgb(hue, 65, lerp(72, 50, t)));
    }

    const size = lerp(0.5, 4.5, Math.min(1, count / Math.max(1, maxCountFiltered)));

    g.addEdge(e.a, e.b, {
      color,
      size,
      total: e.total,
      perSession: e.perSession,
    });
  }

  // layout
  if (layoutMode === "force") {
    forceAtlas2.assign(g, {
      iterations: 200,
      settings: {
        slowDown: 10,
        gravity: 1,
        scalingRatio: 10,
      },
    });
  } else {
    const nodes = g.nodes();
    const withDegree = nodes.map((id) => ({ id, degree: g.degree(id) }));
    const circleAttrKey = circleOrderAttributeKey;
    const attrById = new Map<string, string>();
    if (circleOrder === "attribute" && circleAttrKey) {
      for (const p of people) {
        attrById.set(p.id, (p.attributes[circleAttrKey] || "").toString());
      }
    }

    withDegree.sort((x, y) => {
      if (circleOrder === "degree") {
        if (y.degree !== x.degree) return y.degree - x.degree;
        return x.id.localeCompare(y.id);
      }
      if (circleOrder === "attribute" && circleAttrKey) {
        const ax = (g.getNodeAttribute(x.id, "label") as string) || x.id;
        const ay = (g.getNodeAttribute(y.id, "label") as string) || y.id;
        return ax.localeCompare(ay) || x.id.localeCompare(y.id);
      }
      return x.id.localeCompare(y.id);
    });

    if (circleOrder === "attribute" && circleAttrKey) {
      withDegree.sort((x, y) => {
        const vx = attrById.get(x.id) || "";
        const vy = attrById.get(y.id) || "";
        if (vx !== vy) return vx.localeCompare(vy);
        return x.id.localeCompare(y.id);
      });
    }

    const n = withDegree.length || 1;
    const radius = 10;
    for (let i = 0; i < withDegree.length; i++) {
      const angle = (2 * Math.PI * i) / n;
      g.setNodeAttribute(withDegree[i].id, "x", Math.cos(angle) * radius);
      g.setNodeAttribute(withDegree[i].id, "y", Math.sin(angle) * radius);
    }
  }

  // scale node sizes by degree
  const degrees = g.nodes().map((n) => g.degree(n));
  const maxDeg = degrees.reduce((m, d) => Math.max(m, d), 0);
  for (const n of g.nodes()) {
    const d = g.degree(n);
    g.setNodeAttribute(n, "size", lerp(3, 10, maxDeg > 0 ? d / maxDeg : 0));
  }

  return g;
}

function GraphLoader({ graph }: { graph: Graph }) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();
  useEffect(() => {
    loadGraph(graph);
    try {
      sigma.getCamera().animatedReset();
    } catch {
      // ignore camera errors
    }
  }, [graph, loadGraph, sigma]);
  return null;
}

function Legend({
  nodeColorAttr,
  edgeColorMode,
  minMeetingCount,
  maxEdgeCountForUi,
  sessionCount,
}: {
  nodeColorAttr: string | null;
  edgeColorMode: EdgeColorMode;
  minMeetingCount: number;
  maxEdgeCountForUi: number;
  sessionCount: number;
}) {
  const edgeSwatches: Array<{ key: string; label: string; color: string }> =
    edgeColorMode === "byCount"
      ? [
          {
            key: "count-low",
            label: `${minMeetingCount}`,
            color: countToColor(minMeetingCount, maxEdgeCountForUi),
          },
          {
            key: "count-mid",
            label: `${Math.ceil((minMeetingCount + maxEdgeCountForUi) / 2)}`,
            color: countToColor(
              Math.ceil((minMeetingCount + maxEdgeCountForUi) / 2),
              maxEdgeCountForUi
            ),
          },
          {
            key: "count-high",
            label: `${maxEdgeCountForUi}`,
            color: countToColor(maxEdgeCountForUi, maxEdgeCountForUi),
          },
        ]
      : Array.from({ length: Math.min(sessionCount, 6) }, (_, i) => {
          const hue = sessionHue(i, sessionCount);
          return {
            key: `session-${i}`,
            label: `S${i + 1}`,
            color: rgbToHex(hslToRgb(hue, 65, 60)),
          };
        });

  return (
    <div
      className="absolute left-3 top-3 rounded border p-3 text-xs shadow"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border-primary)",
        color: "var(--text-primary)",
        width: 240,
        pointerEvents: "none",
      }}
    >
      <div className="text-xs font-medium mb-2">Legend</div>

      <div className="mb-2">
        <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          Edge color: {edgeColorMode === "byCount" ? "meeting count" : "dominant session"}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {edgeSwatches.map((s) => (
            <div key={s.key} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded"
                style={{ backgroundColor: s.color, border: "1px solid rgba(0,0,0,0.15)" }}
              />
              <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
        {edgeColorMode === "byDominantSession" && (
          <div className="mt-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Lightness still reflects count.
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          Node color: {nodeColorAttr ? `attribute (${nodeColorAttr})` : "by person id"}
        </div>
      </div>
    </div>
  );
}

type HoveredItem =
  | null
  | { type: "node"; id: string; label: string }
  | { type: "edge"; edgeId: string; a: string; b: string; aLabel: string; bLabel: string; total: number; perSession: number[] };

function HighlightReducers({
  hoveredItem,
  selectedNodeId,
}: {
  hoveredItem: HoveredItem;
  selectedNodeId: string | null;
}) {
  const sigma = useSigma();

  useEffect(() => {
    const activeEdgeId = hoveredItem?.type === "edge" ? hoveredItem.edgeId : null;
    const activeNodeId = hoveredItem?.type === "node" ? hoveredItem.id : null;
    const activeEndpoints =
      hoveredItem?.type === "edge" ? new Set([hoveredItem.a, hoveredItem.b]) : new Set<string>();

    const graph = sigma.getGraph();
    const selectedEdges = new Set<string>();
    const selectedNodes = new Set<string>();
    if (selectedNodeId && graph.hasNode(selectedNodeId)) {
      selectedNodes.add(selectedNodeId);
      for (const n of graph.neighbors(selectedNodeId)) selectedNodes.add(n);
      for (const e of graph.edges(selectedNodeId)) selectedEdges.add(e);
    }

    sigma.setSetting("nodeReducer", (node, data) => {
      if (selectedNodeId) {
        // Selected node: highlight in amber
        if (node === selectedNodeId) {
          return {
            ...data,
            zIndex: 2,
            size: (data.size || 1) * 1.5,
            color: "#f59e0b",
          };
        }
        // Connected nodes: keep visible
        if (selectedNodes.has(node)) {
          return data;
        }
        // Non-connected nodes: fade out but keep visible (interesting to see who has no connection)
        // Use a solid muted color that contrasts with most backgrounds
        return {
          ...data,
          color: "#9ca3af", // gray-400 - visible on both light and dark backgrounds
          size: Math.max(3, (data.size || 1) * 0.7),
          zIndex: -1,
        };
      }

      if (activeNodeId && node === activeNodeId) {
        return {
          ...data,
          zIndex: 1,
          size: (data.size || 1) * 1.6,
          color: "#f59e0b",
        };
      }
      if (activeEndpoints.size > 0 && activeEndpoints.has(node)) {
        return {
          ...data,
          zIndex: 1,
          size: (data.size || 1) * 1.4,
          color: "#f59e0b",
        };
      }
      if (activeEdgeId || activeNodeId) {
        return {
          ...data,
          color: "rgba(100, 116, 139, 0.55)",
        };
      }
      return data;
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      if (selectedNodeId) {
        if (!selectedEdges.has(edge)) return { ...data, hidden: true };
      }

      if (activeEdgeId && edge === activeEdgeId) {
        return {
          ...data,
          zIndex: 1,
          size: (data.size || 1) * 2.5,
          color: "rgba(245, 158, 11, 0.95)",
        };
      }
      if (activeEdgeId || activeNodeId) {
        return {
          ...data,
          color: "rgba(100, 116, 139, 0.12)",
          size: 0.6,
        };
      }
      return data;
    });

    return () => {
      sigma.setSetting("nodeReducer", null);
      sigma.setSetting("edgeReducer", null);
    };
  }, [sigma, hoveredItem, selectedNodeId]);

  return null;
}

// Edge list panel - shows clickable edges when a node is selected
function EdgeListPanel({
  selectedNodeId,
  selectedNodeLabel,
  edges,
  sessionCount,
  hoveredEdgeId,
  onHoverEdge,
  onClear,
}: {
  selectedNodeId: string;
  selectedNodeLabel: string;
  edges: EdgeInfo[];
  sessionCount: number;
  hoveredEdgeId: string | null;
  onHoverEdge: (edge: EdgeInfo | null) => void;
  onClear: () => void;
}) {
  const [expandedEdgeId, setExpandedEdgeId] = useState<string | null>(null);

  // Sort edges by total meetings descending
  const sortedEdges = useMemo(
    () => [...edges].sort((a, b) => b.total - a.total),
    [edges]
  );

  return (
    <div
      className="absolute right-3 top-3 rounded border shadow text-xs overflow-hidden"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border-primary)",
        color: "var(--text-primary)",
        width: 280,
        maxHeight: 400,
      }}
    >
      <div
        className="px-3 py-2 font-medium flex items-center justify-between border-b"
        style={{ borderColor: "var(--border-primary)", backgroundColor: "var(--bg-secondary)" }}
      >
        <span>Connections for {selectedNodeLabel}</span>
        <button
          onClick={onClear}
          className="text-[11px] px-1.5 py-0.5 rounded hover:bg-opacity-80"
          style={{ color: "var(--text-tertiary)" }}
        >
          ✕ Clear
        </button>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 350 }}>
        {sortedEdges.length === 0 ? (
          <div className="px-3 py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
            No connections (try lowering "Min meetings")
          </div>
        ) : (
          sortedEdges.map((edge) => {
            const otherLabel = edge.a === selectedNodeId ? edge.bLabel : edge.aLabel;
            const isExpanded = expandedEdgeId === edge.edgeId;
            const isHovered = hoveredEdgeId === edge.edgeId;

            return (
              <div
                key={edge.edgeId}
                className="border-b last:border-b-0 cursor-pointer transition-colors"
                style={{
                  borderColor: "var(--border-primary)",
                  backgroundColor: isHovered ? "rgba(245, 158, 11, 0.15)" : undefined,
                }}
                onMouseEnter={() => onHoverEdge(edge)}
                onMouseLeave={() => onHoverEdge(null)}
                onClick={() => setExpandedEdgeId(isExpanded ? null : edge.edgeId)}
              >
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="font-medium truncate" style={{ maxWidth: 180 }}>
                    {otherLabel}
                  </span>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: countToColor(edge.total, Math.max(...sortedEdges.map((e) => e.total))),
                      color: "#fff",
                    }}
                  >
                    {edge.total} meeting{edge.total !== 1 ? "s" : ""}
                  </span>
                </div>
                {isExpanded && (
                  <div
                    className="px-3 pb-2 pt-1 text-[11px]"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  >
                    <div className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                      Per session breakdown:
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      {Array.from({ length: sessionCount }, (_, s) => (
                        <div key={s} className="flex justify-between">
                          <span style={{ color: "var(--text-tertiary)" }}>Session {s + 1}:</span>
                          <span>{edge.perSession[s] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Tooltip for node hover (when no node is selected)
function NodeTooltip({ hoveredItem }: { hoveredItem: HoveredItem }) {
  if (!hoveredItem || hoveredItem.type !== "node") return null;
  return (
    <div
      className="absolute right-3 top-3 rounded border p-3 text-xs shadow"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border-primary)",
        color: "var(--text-primary)",
        width: 220,
        pointerEvents: "none",
      }}
    >
      <div className="text-sm font-medium">{hoveredItem.label}</div>
      <div className="mt-1" style={{ color: "var(--text-secondary)" }}>
        id: {hoveredItem.id}
      </div>
      <div className="mt-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        Click to view connections
      </div>
    </div>
  );
}

function SigmaEvents({
  onHoverNode,
  onSelectNode,
  onClear,
}: {
  onHoverNode: (item: { type: "node"; id: string; label: string } | null) => void;
  onSelectNode: (nodeId: string | null) => void;
  onClear: () => void;
}) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      enterNode: (e) => {
        const node = e.node;
        const graph = sigma.getGraph();
        const label = (graph.getNodeAttribute(node, "label") as string) || node;
        onHoverNode({ type: "node", id: node, label });
      },
      leaveNode: () => {
        onHoverNode(null);
      },
      clickNode: (e) => {
        const node = e.node;
        onSelectNode(node);
      },
      clickStage: () => {
        onClear();
      },
    });
  }, [registerEvents, sigma, onHoverNode, onSelectNode, onClear]);

  return null;
}

function getAttributeKeys(problemPeople: Array<{ attributes?: Record<string, string> }>): string[] {
  const keys = new Set<string>();
  for (const p of problemPeople) {
    const attrs = p.attributes || {};
    for (const k of Object.keys(attrs)) {
      if (k === "name") continue;
      keys.add(k);
    }
  }
  return Array.from(keys).sort();
}

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

  // Build a label lookup
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

  useEffect(() => {
    setMinMeetingCount((prev) => Math.min(Math.max(1, prev), maxEdgeCountForUi));
  }, [maxEdgeCountForUi]);

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
      minMeetingCount,
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
    minMeetingCount,
  ]);

  // Build edge info list for selected node
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

  // Stable callbacks
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

  // Get selected node label for UI
  const selectedNodeLabel = useMemo(() => {
    if (!selectedNodeId) return null;
    return labelById.get(selectedNodeId) || selectedNodeId;
  }, [selectedNodeId, labelById]);

  // Combined hovered item for reducers
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
          value={minMeetingCount}
          onChange={(e) => setMinMeetingCount(Number(e.target.value))}
        />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          ≥ {minMeetingCount}
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
          <SigmaEvents
            onHoverNode={handleHoverNode}
            onSelectNode={handleSelectNode}
            onClear={handleClear}
          />
          <HighlightReducers hoveredItem={hoveredItem} selectedNodeId={selectedNodeId} />
        </SigmaContainer>

        <Legend
          nodeColorAttr={nodeColorAttr}
          edgeColorMode={edgeColorMode}
          minMeetingCount={minMeetingCount}
          maxEdgeCountForUi={maxEdgeCountForUi}
          sessionCount={sessionCount}
        />

        {/* Show edge list panel when node selected, otherwise show node tooltip on hover */}
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
          Iteration {data.progress.iteration.toLocaleString()} • best score{" "}
          {data.progress.best_score.toFixed(2)}
        </div>
      )}
    </div>
  );
}
