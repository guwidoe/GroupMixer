import { LayoutGrid, Share2, Box } from "lucide-react";
import type { VisualizationPlugin } from "./types";
import { ScheduleMatrixVisualization } from "./plugins/scheduleMatrix/ScheduleMatrixVisualization";
import { ContactGraphVisualization } from "./plugins/contactGraph/ContactGraphVisualization";
import { Animated3DVisualization } from "./plugins/animated3D/Animated3DVisualization";

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
  {
    id: "animated3D",
    label: "3D Animation",
    icon: Box,
    capabilities: {
      needsProblem: true,
      supportsLive: false, // 3D animation works best with final results
      supportsExportPng: false,
    },
    Component: Animated3DVisualization,
  },
];

export function getVisualizationPlugin(id: string): VisualizationPlugin {
  const p = visualizationPlugins.find((x) => x.id === id);
  if (!p) {
    return visualizationPlugins[0];
  }
  return p;
}
