import React from 'react';
import { Info } from 'lucide-react';
import type { Solution } from '../../types';
import type { ProblemConfigDifference } from '../../services/problemStorage';
import { Tooltip } from '../Tooltip';
import { ConfigDiffBadge } from './ConfigDiffBadge';
import { ResultsExportDropdown } from './ResultsExportDropdown';

interface ResultsHeaderProps {
  resultName?: string;
  solution: Solution;
  configDiff: ProblemConfigDifference | null;
  configDetailsOpen: boolean;
  onToggleConfigDetails: () => void;
  onRestoreConfig: () => void;
  exportDropdownOpen: boolean;
  onToggleExportDropdown: () => void;
  onExportResult: (format: 'json' | 'csv' | 'excel') => void;
  onExportVisualizationPng: () => void;
  viewMode: 'grid' | 'list' | 'visualize';
  exportDropdownRef: React.RefObject<HTMLDivElement>;
  configDetailsRef: React.RefObject<HTMLDivElement>;
}

export function ResultsHeader({
  resultName,
  solution,
  configDiff,
  configDetailsOpen,
  onToggleConfigDetails,
  onRestoreConfig,
  exportDropdownOpen,
  onToggleExportDropdown,
  onExportResult,
  onExportVisualizationPng,
  viewMode,
  exportDropdownRef,
  configDetailsRef,
}: ResultsHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-0">
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
          <h2 className="text-2xl font-bold flex items-center gap-2 min-w-0" style={{ color: 'var(--text-primary)' }}>
            <span className="truncate">Optimization Results{resultName ? ` - ${resultName}` : ''}</span>
          </h2>
          {configDiff && (
            <ConfigDiffBadge
              configDiff={configDiff}
              isOpen={configDetailsOpen}
              onToggle={onToggleConfigDetails}
              onRestoreConfig={onRestoreConfig}
              containerRef={configDetailsRef}
            />
          )}
        </div>
        <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Cost Score:</span>
            <span className="sm:hidden">Score:</span>
            {solution.final_score.toFixed(2)}
            <Tooltip content={<span>Cost Score = Unique contacts minus penalties. <b>Lower is better.</b></span>}>
              <Info className="w-4 h-4" />
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            {solution.iteration_count.toLocaleString()} iterations •
            {(solution.elapsed_time_ms / 1000).toFixed(2)}s <span className="ml-1 italic hidden sm:inline">(lower cost is better)</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
        <ResultsExportDropdown
          isOpen={exportDropdownOpen}
          onToggle={onToggleExportDropdown}
          onExportResult={onExportResult}
          onExportVisualizationPng={onExportVisualizationPng}
          viewMode={viewMode}
          dropdownRef={exportDropdownRef}
        />
      </div>
    </div>
  );
}
