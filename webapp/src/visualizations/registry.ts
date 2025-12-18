import { LayoutGrid } from "lucide-react";
import type { VisualizationPlugin } from "./types";
import { ScheduleMatrixVisualization } from "./plugins/scheduleMatrix/ScheduleMatrixVisualization";

export const visualizationPlugins: VisualizationPlugin[] = [
  {
    id: "scheduleMatrix",
    label: "Schedule matrix",
    icon: LayoutGrid,
    capabilities: {
      needsProblem: true,
      supportsLive: true,
      supportsExportPng: true,
    },
    Component: ScheduleMatrixVisualization,
  },
];

export function getVisualizationPlugin(id: string): VisualizationPlugin {
  const p = visualizationPlugins.find((x) => x.id === id);
  if (!p) {
    return visualizationPlugins[0];
  }
  return p;
}
