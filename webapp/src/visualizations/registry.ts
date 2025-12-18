import { LayoutGrid, Share2 } from "lucide-react";
import type { VisualizationPlugin } from "./types";
import { ScheduleMatrixVisualization } from "./plugins/scheduleMatrix/ScheduleMatrixVisualization";
import { ContactGraphVisualization } from "./plugins/contactGraph/ContactGraphVisualization";

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
  {
    id: "contactGraph",
    label: "Contact network",
    icon: Share2,
    capabilities: {
      needsProblem: true,
      supportsLive: true,
      supportsExportPng: false,
    },
    Component: ContactGraphVisualization,
  },
];

export function getVisualizationPlugin(id: string): VisualizationPlugin {
  const p = visualizationPlugins.find((x) => x.id === id);
  if (!p) {
    return visualizationPlugins[0];
  }
  return p;
}
