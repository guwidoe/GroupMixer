import { useEffect } from "react";
import { useSigma } from "@react-sigma/core";
import type { HoveredItem } from "../types";

interface HighlightReducersProps {
  hoveredItem: HoveredItem;
  selectedNodeId: string | null;
}

export function HighlightReducers({ hoveredItem, selectedNodeId }: HighlightReducersProps) {
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
        if (node === selectedNodeId) {
          return {
            ...data,
            zIndex: 2,
            size: (data.size || 1) * 1.5,
            color: "#f59e0b",
          };
        }
        if (selectedNodes.has(node)) {
          return data;
        }
        return {
          ...data,
          color: "#9ca3af",
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
