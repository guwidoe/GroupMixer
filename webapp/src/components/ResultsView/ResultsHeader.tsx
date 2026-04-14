import React from 'react';
import { Info } from 'lucide-react';
import type { Solution } from '../../types';
import type { ScenarioConfigDifference } from '../../services/scenarioStorage';
import type { ResultsSummaryData } from '../../services/results/buildResultsModel';
import { Tooltip } from '../Tooltip';
import { ConfigDiffBadge } from './ConfigDiffBadge';
import { ResultsExportDropdown } from './ResultsExportDropdown';
import type { ResultClipboardAction, ResultExportAction } from '../../utils/csvExport';

interface ResultsHeaderProps {
  resultName?: string;
  solution: Solution;
  summary: ResultsSummaryData | null;
  configDiff: ScenarioConfigDifference | null;
  configDetailsOpen: boolean;
  onToggleConfigDetails: () => void;
  onRestoreConfig: () => void;
  exportDropdownOpen: boolean;
  onToggleExportDropdown: () => void;
  onExportAction: (action: ResultExportAction) => void;
  onCopyAction: (action: ResultClipboardAction) => void;
  onPrintResult: () => void;
  onExportVisualizationPng: () => void;
  viewMode: 'grid' | 'list' | 'visualize';
  exportDropdownRef: React.RefObject<HTMLDivElement>;
  configDetailsRef: React.RefObject<HTMLDivElement>;
}

export function ResultsHeader({
  resultName,
  solution,
  summary,
  configDiff,
  configDetailsOpen,
  onToggleConfigDetails,
  onRestoreConfig,
  exportDropdownOpen,
  onToggleExportDropdown,
  onExportAction,
  onCopyAction,
  onPrintResult,
  onExportVisualizationPng,
  viewMode,
  exportDropdownRef,
  configDetailsRef,
}: ResultsHeaderProps) {
  return (
    <section className="results-print-section">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-0">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <h2 className="flex min-w-0 items-center gap-2 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
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

          <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2" style={{ color: 'var(--text-secondary)' }}>
            <div className="inline-flex items-center gap-2">
              <span className="hidden sm:inline">Cost Score:</span>
              <span className="sm:hidden">Score:</span>
              {solution.final_score.toFixed(2)}
              <Tooltip content={<span>Cost Score = Unique contacts minus penalties. <b>Lower is better.</b></span>}>
                <Info className="h-4 w-4" />
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              {solution.iteration_count.toLocaleString()} iterations •
              {(solution.elapsed_time_ms / 1000).toFixed(2)}s <span className="ml-1 hidden italic sm:inline">(lower cost is better)</span>
            </div>
            {summary ? <div>{summary.totalAssignments.toLocaleString()} assignments</div> : null}
          </div>
        </div>

        <div className="results-print-hide flex flex-col gap-2 sm:flex-row sm:gap-2 sm:self-start">
          <ResultsExportDropdown
            isOpen={exportDropdownOpen}
            onToggle={onToggleExportDropdown}
            onExportAction={onExportAction}
            onCopyAction={onCopyAction}
            onPrintResult={onPrintResult}
            onExportVisualizationPng={onExportVisualizationPng}
            viewMode={viewMode}
            dropdownRef={exportDropdownRef}
          />
        </div>
      </div>
    </section>
  );
}
