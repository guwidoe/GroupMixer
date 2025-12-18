import type React from "react";
import type { Problem, Solution } from "../types";
import type { ProgressUpdate } from "../services/wasm";

export type ScheduleSnapshot = Record<string, Record<string, string[]>>;

export type VisualizationData =
  | {
      kind: "final";
      problem: Problem;
      solution: Solution;
    }
  | {
      kind: "live";
      problem: Problem;
      progress: ProgressUpdate | null;
      schedule: ScheduleSnapshot;
    };

export interface VisualizationCapabilities {
  needsProblem: boolean;
  supportsLive: boolean;
  supportsExportPng: boolean;
}

export interface VisualizationComponentProps {
  data: VisualizationData;
}

export interface VisualizationPlugin {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  capabilities: VisualizationCapabilities;
  Component: React.ComponentType<VisualizationComponentProps>;
  SettingsComponent?: React.ComponentType<{
    value: unknown;
    onChange: (next: unknown) => void;
  }>;
}
