import React from 'react';
import { BarChart3, ChevronDown, ChevronRight, Info } from 'lucide-react';
import type { SolverSettings, SolverState } from '../../types';
import { getSolverUiSpecForSettings } from '../../services/solverUi';
import { Tooltip } from '../Tooltip';

interface DetailedMetricsProps {
  solverState: SolverState;
  displaySettings: SolverSettings;
  showMetrics: boolean;
  onToggleMetrics: () => void;
}

const DetailedMetrics: React.FC<DetailedMetricsProps> = ({
  solverState,
  displaySettings,
  showMetrics,
  onToggleMetrics,
}) => {
  const solverUiSpec = getSolverUiSpecForSettings(displaySettings.solver_type);
  const latestProgress = solverState.latestProgress ?? null;

  return (
    <div className="mb-2">
      <button className="flex items-center gap-3 cursor-pointer mb-3 text-left" onClick={onToggleMetrics}>
        {showMetrics ? (
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        )}
        <BarChart3 className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
        <h4 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Detailed Solver Metrics
        </h4>
      </button>

      {showMetrics && (
        <div className="space-y-5">
          {solverUiSpec ? (
            solverUiSpec.liveMetricSections.map((section) => (
              <div key={section.id}>
                <div className="mb-3">
                  <h5 className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {section.title}
                  </h5>
                  {section.description && (
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {section.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {section.metrics
                    .filter((metric) => metric.isVisible?.({ progress: latestProgress, settings: displaySettings }) ?? true)
                    .map((metric) => (
                      <div
                        key={metric.id}
                        className="p-3 rounded-lg"
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
                          {metric.render({ progress: latestProgress, settings: displaySettings })}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No solver-specific metric specification is available for <code>{displaySettings.solver_type}</code>.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DetailedMetrics;
