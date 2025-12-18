import React, { useMemo } from "react";
import type { VisualizationData } from "./types";
import { getVisualizationPlugin, visualizationPlugins } from "./registry";

export function VisualizationPanel({
  pluginId,
  onPluginChange,
  data,
  title,
}: {
  pluginId: string;
  onPluginChange: (id: string) => void;
  data: VisualizationData;
  title?: string;
}) {
  const plugin = useMemo(() => getVisualizationPlugin(pluginId), [pluginId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          {plugin.icon ? <plugin.icon className="w-4 h-4" /> : null}
          <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {title || plugin.label}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Visualization
          </label>
          <select
            value={plugin.id}
            onChange={(e) => {
              onPluginChange(e.target.value);
            }}
            className="px-2 py-1 rounded border text-sm"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            {visualizationPlugins.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <plugin.Component data={data} />
    </div>
  );
}
