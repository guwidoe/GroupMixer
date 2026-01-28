import React, { useMemo, useState } from "react";
import type { EdgeInfo } from "../types";
import { countToColor } from "../utils/colorUtils";

interface EdgeListPanelProps {
  selectedNodeId: string;
  selectedNodeLabel: string;
  edges: EdgeInfo[];
  sessionCount: number;
  hoveredEdgeId: string | null;
  onHoverEdge: (edge: EdgeInfo | null) => void;
  onClear: () => void;
}

export function EdgeListPanel({
  selectedNodeId,
  selectedNodeLabel,
  edges,
  sessionCount,
  hoveredEdgeId,
  onHoverEdge,
  onClear,
}: EdgeListPanelProps) {
  const [expandedEdgeId, setExpandedEdgeId] = useState<string | null>(null);

  const sortedEdges = useMemo(() => [...edges].sort((a, b) => b.total - a.total), [edges]);

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
                  <div className="px-3 pb-2 pt-1 text-[11px]" style={{ backgroundColor: "var(--bg-secondary)" }}>
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
