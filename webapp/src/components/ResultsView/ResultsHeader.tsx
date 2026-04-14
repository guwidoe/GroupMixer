import React from 'react';
import { Activity, Grid2x2, Info, Users } from 'lucide-react';
import type { Solution } from '../../types';
import type { ScenarioConfigDifference } from '../../services/scenarioStorage';
import type { ResultsSummaryData } from '../../services/results/buildResultsModel';
import { Tooltip } from '../Tooltip';
import { ConfigDiffBadge } from './ConfigDiffBadge';
import { ResultsExportDropdown } from './ResultsExportDropdown';

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
  onExportResult: (format: 'json' | 'csv' | 'excel') => void;
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
  onExportResult,
  onExportVisualizationPng,
  viewMode,
  exportDropdownRef,
  configDetailsRef,
}: ResultsHeaderProps) {
  return (
    <section
      className="rounded-2xl border p-4 sm:p-5 lg:p-6"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-primary) 92%, var(--color-accent) 8%)',
        borderColor: 'color-mix(in srgb, var(--border-primary) 78%, var(--color-accent) 22%)',
      }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
            Current Result
          </div>

          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center">
            <h2 className="min-w-0 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: 'var(--text-primary)' }}>
              <span className="block truncate">Optimization Results{resultName ? ` - ${resultName}` : ''}</span>
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

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div className="inline-flex items-center gap-2">
              <span className="font-medium">Cost Score</span>
              <span style={{ color: 'var(--text-primary)' }}>{solution.final_score.toFixed(2)}</span>
              <Tooltip content={<span>Cost Score = Unique contacts minus penalties. <b>Lower is better.</b></span>}>
                <Info className="h-4 w-4" />
              </Tooltip>
            </div>
            <div>{solution.iteration_count.toLocaleString()} iterations</div>
            <div>{(solution.elapsed_time_ms / 1000).toFixed(2)}s runtime</div>
            {summary ? <div>{summary.totalAssignments.toLocaleString()} assignments</div> : null}
          </div>

          {summary ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border px-3 py-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                  <Activity className="h-3.5 w-3.5" />
                  Sessions
                </div>
                <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.totalSessions}</div>
              </div>
              <div className="rounded-xl border px-3 py-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                  <Grid2x2 className="h-3.5 w-3.5" />
                  Groups / session
                </div>
                <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.totalGroups}</div>
              </div>
              <div className="rounded-xl border px-3 py-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                  <Users className="h-3.5 w-3.5" />
                  People
                </div>
                <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.totalPeople}</div>
              </div>
              <div className="rounded-xl border px-3 py-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                <div className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                  Seat fill
                </div>
                <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {summary.averageFillPercent.toFixed(0)}%
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 lg:min-w-[180px]">
          <ResultsExportDropdown
            isOpen={exportDropdownOpen}
            onToggle={onToggleExportDropdown}
            onExportResult={onExportResult}
            onExportVisualizationPng={onExportVisualizationPng}
            viewMode={viewMode}
            dropdownRef={exportDropdownRef}
          />
          <p className="text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
            Export the active result for reporting, spreadsheets, or follow-up review.
          </p>
        </div>
      </div>
    </section>
  );
}
