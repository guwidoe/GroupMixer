import React from 'react';
import type { Problem, Solution } from '../../types';
import { VisualizationPanel } from '../../visualizations/VisualizationPanel';

interface ResultsScheduleVisualizationProps {
  vizExportRef: React.RefObject<HTMLDivElement>;
  vizPluginId: string;
  onPluginChange: (id: string) => void;
  effectiveProblem: Problem;
  solution: Solution;
}

export function ResultsScheduleVisualization({
  vizExportRef,
  vizPluginId,
  onPluginChange,
  effectiveProblem,
  solution,
}: ResultsScheduleVisualizationProps) {
  return (
    <div ref={vizExportRef}>
      <VisualizationPanel
        pluginId={vizPluginId}
        onPluginChange={onPluginChange}
        data={{ kind: 'final', problem: effectiveProblem, solution }}
      />
    </div>
  );
}
