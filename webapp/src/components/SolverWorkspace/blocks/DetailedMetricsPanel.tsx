import React from 'react';
import { BarChart3, ChevronDown, ChevronRight, Info } from 'lucide-react';
import type { SolverSettings, SolverState } from '../../../types';
import { getSolverUiSpecForSettings } from '../../../services/solverUi';
import { Tooltip } from '../../Tooltip';

interface DetailedMetricsPanelProps {
  solverState: SolverState;
  displaySettings: SolverSettings;
  showMetrics: boolean;
  onToggleMetrics: () => void;
}

export function DetailedMetricsPanel({
  solverState,
  displaySettings,
  showMetrics,
  onToggleMetrics,
}: DetailedMetricsPanelProps) {
  const solverUiSpec = getSolverUiSpecForSettings(displaySettings.solver_type);
  const latestProgress = solverState.latestProgress ?? null;
  const latestSolution = solverState.latestSolution ?? null;
  const benchmarkTelemetry = latestSolution?.benchmark_telemetry ?? null;

  return (
    <section
      className="rounded-2xl border p-4 md:p-5"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <button className="mb-3 flex cursor-pointer items-center gap-3 text-left" onClick={onToggleMetrics}>
        {showMetrics ? (
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        )}
        <BarChart3 className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
        <div>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
            Detailed Solver Metrics
          </h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Expand this section to inspect solver-family-specific live telemetry.
          </p>
        </div>
      </button>

      {showMetrics ? (
        <div className="space-y-5">
          {solverUiSpec ? (
            solverUiSpec.liveMetricSections.map((section) => {
              const metricContext = {
                progress: latestProgress,
                settings: displaySettings,
                solution: latestSolution,
                benchmarkTelemetry,
              };
              const visibleMetrics = section.metrics.filter((metric) => metric.isVisible?.(metricContext) ?? true);

              if (visibleMetrics.length === 0) {
                return null;
              }

              return (
                <div key={section.id}>
                  <div className="mb-3">
                    <h4 className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {section.title}
                    </h4>
                    {section.description ? (
                      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {section.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {visibleMetrics.map((metric) => (
                      <div
                        key={metric.id}
                        className="rounded-lg p-3"
                        style={{
                          backgroundColor: 'var(--background-secondary)',
                          border: '1px solid var(--border-secondary)',
                        }}
                      >
                        <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          <span>{metric.label}</span>
                          <Tooltip content={metric.description}>
                            <Info className="h-3 w-3" />
                          </Tooltip>
                        </div>
                        <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {metric.render(metricContext)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No solver-specific metric specification is available for <code>{displaySettings.solver_type}</code>.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
