import React from "react";
import type { HoveredItem } from "../types";

export function NodeTooltip({ hoveredItem }: { hoveredItem: HoveredItem }) {
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
