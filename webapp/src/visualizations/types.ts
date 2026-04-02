import type React from "react";
import type { Scenario, Solution } from "../types";
import type { RuntimeProgressUpdate } from "../services/runtime";

export type ScheduleSnapshot = Record<string, Record<string, string[]>>;

export type VisualizationData =
  | {
      kind: "final";
      scenario: Scenario;
      solution: Solution;
    }
  | {
      kind: "live";
      scenario: Scenario;
      progress: RuntimeProgressUpdate | null;
      schedule: ScheduleSnapshot;
    };

export interface VisualizationCapabilities {
  needsScenario: boolean;
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
