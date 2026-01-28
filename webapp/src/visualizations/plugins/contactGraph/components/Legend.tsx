import React from "react";
import type { EdgeColorMode } from "../types";
import { countToColor, hslToRgb, rgbToHex, sessionHue } from "../utils/colorUtils";

interface LegendProps {
  nodeColorAttr: string | null;
  edgeColorMode: EdgeColorMode;
  minMeetingCount: number;
  maxEdgeCountForUi: number;
  sessionCount: number;
}

export function Legend({
  nodeColorAttr,
  edgeColorMode,
  minMeetingCount,
  maxEdgeCountForUi,
  sessionCount,
}: LegendProps) {
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
