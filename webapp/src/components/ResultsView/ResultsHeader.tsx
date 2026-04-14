import React from 'react';
import { Activity, Grid2x2, Info, Users } from 'lucide-react';
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
  const summaryItems = summary ? [
    {
      key: 'sessions',
      label: 'Sessions',
      value: summary.totalSessions,
      icon: Activity,
    },
    {
      key: 'groups',
      label: 'Groups / session',
      value: summary.totalGroups,
      icon: Grid2x2,
    },
    {
      key: 'people',
      label: 'People',
      value: summary.totalPeople,
      icon: Users,
    },
    {
      key: 'fill',
      label: 'Seat fill',
      value: `${summary.averageFillPercent.toFixed(0)}%`,
      icon: null,
    },
  ] : [];

  return (
    <section
      className="results-print-section overflow-hidden rounded-[1.75rem] border px-4 py-5 sm:px-6 lg:px-8 lg:py-7"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-primary) 94%, var(--color-accent) 6%)',
        borderColor: 'color-mix(in srgb, var(--border-primary) 82%, var(--color-accent) 18%)',
      }}
    >
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
            Current Result
          </div>

          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <h2 className="min-w-0 text-2xl font-semibold tracking-tight sm:text-3xl lg:text-[2.15rem]" style={{ color: 'var(--text-primary)' }}>
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
                <div>{solution.iteration_count.toLocaleString()} iterations</div>
                <div>{(solution.elapsed_time_ms / 1000).toFixed(2)}s runtime</div>
                {summary ? <div>{summary.totalAssignments.toLocaleString()} assignments</div> : null}
              </div>
            </div>

            <div className="min-w-0 lg:text-right">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
                <span>Cost Score</span>
                <Tooltip content={<span>Cost Score = Unique contacts minus penalties. <b>Lower is better.</b></span>}>
                  <Info className="h-3.5 w-3.5" />
                </Tooltip>
              </div>
              <div className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl" style={{ color: 'var(--text-primary)' }}>
                {solution.final_score.toFixed(2)}
              </div>
            </div>
          </div>

          {summary ? (
            <div className="mt-6 border-t pt-4 sm:pt-5" style={{ borderColor: 'color-mix(in srgb, var(--border-primary) 78%, transparent)' }}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {summaryItems.map((item) => (
                  <div key={item.key} className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
                      {item.icon ? <item.icon className="h-3.5 w-3.5" /> : null}
                      <span>{item.label}</span>
                    </div>
                    <div className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="results-print-hide flex shrink-0 flex-col gap-2 xl:min-w-[220px]">
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
          <p className="text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
            Share the active result as a printable handout, copied table, or structured export.
          </p>
        </div>
      </div>
    </section>
  );
}
