import React from 'react';
import type { Scenario, Solution } from '../../types';
import { VisualizationPanel } from '../../visualizations/VisualizationPanel';

interface ResultsScheduleVisualizationProps {
  vizExportRef: React.RefObject<HTMLDivElement>;
  vizPluginId: string;
  onPluginChange: (id: string) => void;
  effectiveScenario: Scenario;
  solution: Solution;
}

export function ResultsScheduleVisualization({
  vizExportRef,
  vizPluginId,
  onPluginChange,
  effectiveScenario,
  solution,
}: ResultsScheduleVisualizationProps) {
  return (
    <div ref={vizExportRef}>
      <VisualizationPanel
        pluginId={vizPluginId}
        onPluginChange={onPluginChange}
        data={{ kind: 'final', scenario: effectiveScenario, solution }}
      />
    </div>
  );
}
