import React, { useMemo, useState } from "react";
import type { VisualizationComponentProps } from "../../types";
import { normalizeFromSnapshot, normalizeFromSolution } from "../../models/normalize";
import { hashToHsl, readableTextOn, utilizationToBg } from "../../models/colors";

type ColorMode =
  | { type: "none" }
  | { type: "utilization" }
  | { type: "attribute"; attributeKey: string };

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

export function ScheduleMatrixVisualization({ data }: VisualizationComponentProps) {
  const problem = data.problem;

  const normalized = useMemo(() => {
    if (data.kind === "final") {
      return normalizeFromSolution(problem, data.solution);
    }
    return normalizeFromSnapshot(problem, data.schedule);
  }, [data, problem]);

  const attributeKeys = useMemo(() => getAttributeKeys(problem.people), [problem.people]);

  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    if (attributeKeys.length > 0) {
      return { type: "attribute", attributeKey: attributeKeys[0] };
    }
    return { type: "utilization" };
  });

  const peopleById = useMemo(() => {
    const m = new Map<string, { id: string; attributes: Record<string, string> }>();
    for (const p of problem.people) {
      m.set(p.id, { id: p.id, attributes: p.attributes || {} });
    }
    return m;
  }, [problem.people]);

  const groupById = useMemo(() => {
    const m = new Map<string, { id: string; size: number }>();
    for (const g of problem.groups) m.set(g.id, { id: g.id, size: g.size });
    return m;
  }, [problem.groups]);

  const resolveCellStyle = (groupId: string, peopleIds: string[], capacity: number) => {
    if (colorMode.type === "none") {
      return { background: "var(--bg-secondary)", color: "var(--text-primary)" };
    }

    if (colorMode.type === "utilization") {
      const ratio = capacity > 0 ? peopleIds.length / capacity : 0;
      const bg = utilizationToBg(ratio);
      return { background: bg, color: readableTextOn(bg) };
    }

    // attribute mode: choose the dominant attribute value in the cell
    const k = colorMode.attributeKey;
    const counts = new Map<string, number>();
    for (const pid of peopleIds) {
      const p = peopleById.get(pid);
      const v = p?.attributes?.[k];
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }

    let best: string | null = null;
    let bestCount = -1;
    for (const [v, c] of counts) {
      if (c > bestCount) {
        best = v;
        bestCount = c;
      }
    }

    const bg = best ? hashToHsl(`${k}:${best}`, 55, 84) : "var(--bg-secondary)";
    return { background: bg, color: readableTextOn(bg) };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Columns = sessions, rows = groups
          {data.kind === "live" ? (
            <span className="ml-2" style={{ color: "var(--text-tertiary)" }}>
              (live)
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Color
          </label>
          <select
            value={
              colorMode.type === "attribute"
                ? `attribute:${colorMode.attributeKey}`
                : colorMode.type
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "none") setColorMode({ type: "none" });
              else if (v === "utilization") setColorMode({ type: "utilization" });
              else if (v.startsWith("attribute:")) {
                setColorMode({
                  type: "attribute",
                  attributeKey: v.slice("attribute:".length),
                });
              }
            }}
            className="px-2 py-1 rounded border text-sm"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            <option value="none">None</option>
            <option value="utilization">Utilization</option>
            {attributeKeys.map((k) => (
              <option key={k} value={`attribute:${k}`}>
                Attribute: {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-2"
          style={{
            gridTemplateColumns: `minmax(140px, 180px) repeat(${normalized.sessionCount}, minmax(220px, 1fr))`,
          }}
        >
          {/* top-left */}
          <div />

          {/* column headers */}
          {Array.from({ length: normalized.sessionCount }, (_, s) => (
            <div
              key={`header-${s}`}
              className="text-xs font-medium px-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Session {s + 1}
            </div>
          ))}

          {/* rows */}
          {normalized.groupOrder.map((groupId) => {
            const g = groupById.get(groupId);
            return (
              <React.Fragment key={`row-${groupId}`}>
                <div
                  className="text-sm font-medium px-2 py-2 rounded border"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    borderColor: "var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{groupId}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {g?.size ?? 0}
                    </span>
                  </div>
                </div>

                {normalized.sessions.map(({ sessionIndex, cellsByGroupId }) => {
                  const cell = cellsByGroupId[groupId];
                  const style = resolveCellStyle(groupId, cell.peopleIds, cell.capacity);
                  const capacityText = `${cell.peopleIds.length}/${cell.capacity}`;

                  return (
                    <div
                      key={`cell-${groupId}-${sessionIndex}`}
                      className="rounded border p-2"
                      style={{
                        borderColor: "var(--border-primary)",
                        backgroundColor: style.background,
                        color: style.color,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-xs font-medium">{capacityText}</div>
                        {colorMode.type === "attribute" ? (
                          <div className="text-[11px] opacity-80">
                            {colorMode.attributeKey}
                          </div>
                        ) : null}
                      </div>
                      {cell.peopleIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {cell.peopleIds.map((pid) => {
                            const p = peopleById.get(pid);
                            const label = p?.attributes?.name || pid;
                            return (
                              <span
                                key={pid}
                                className="px-1.5 py-0.5 rounded text-[11px] border"
                                title={pid}
                                style={{
                                  borderColor: "rgba(0,0,0,0.15)",
                                  backgroundColor: "rgba(255,255,255,0.35)",
                                  color: style.color,
                                }}
                              >
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs opacity-70 italic">No assignments</div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {data.kind === "live" && data.progress ? (
        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Iteration {data.progress.iteration.toLocaleString()} • best score{" "}
          {data.progress.best_score.toFixed(2)} • temperature{" "}
          {data.progress.temperature.toFixed(4)}
        </div>
      ) : null}
    </div>
  );
}
