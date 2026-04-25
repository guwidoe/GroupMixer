/**
 * ProgressBars - Displays solver progress bars for iteration, time, and no-improvement.
 */

import React from 'react';
import type { ProgressUpdate, SolverSettings } from '../../types';
import { normalizeSolverFamilyId } from '../../services/solverUi';

interface SolverState {
  currentIteration: number;
  elapsedTime: number;
  noImprovementCount: number;
  latestProgress?: ProgressUpdate | null;
  latestSolution?: {
    benchmark_telemetry?: {
      auto?: {
        total_budget_seconds: number;
      } | null;
    } | null;
  } | null;
}

interface ProgressBarsProps {
  solverState: SolverState;
  displaySettings: SolverSettings;
}

const ProgressBars: React.FC<ProgressBarsProps> = ({ solverState, displaySettings }) => {
  const solverFamilyId = normalizeSolverFamilyId(displaySettings.solver_type);
  const autoBudgetSeconds = solverState.latestSolution?.benchmark_telemetry?.auto?.total_budget_seconds;
  const effectiveMaxIterations = solverFamilyId === 'auto' && !displaySettings.stop_conditions.max_iterations
    ? 0
    : solverState.latestProgress?.max_iterations
      ?? displaySettings.stop_conditions.max_iterations
      ?? 0;
  const effectiveTimeLimitSeconds = displaySettings.stop_conditions.time_limit_seconds
    ?? autoBudgetSeconds
    ?? 0;
  const effectiveNoImprovementIterations = displaySettings.stop_conditions.no_improvement_iterations ?? 0;

  const getProgressPercentage = () => {
    if (!effectiveMaxIterations) return 0;
    return Math.min(
      (solverState.currentIteration / effectiveMaxIterations) * 100,
      100
    );
  };

  const getTimeProgressPercentage = () => {
    if (!effectiveTimeLimitSeconds) return 0;
    return Math.min((solverState.elapsedTime / 1000 / effectiveTimeLimitSeconds) * 100, 100);
  };

  const getNoImprovementProgressPercentage = () => {
    if (!effectiveNoImprovementIterations) return 0;
    return Math.min(
      (solverState.noImprovementCount / effectiveNoImprovementIterations) * 100,
      100
    );
  };

  const maxIterationsLabel = effectiveMaxIterations
    ? effectiveMaxIterations.toLocaleString()
    : solverFamilyId === 'auto'
      ? 'auto-managed'
      : '0';
  const timeLimitLabel = effectiveTimeLimitSeconds
    ? `${Number.isInteger(effectiveTimeLimitSeconds) ? effectiveTimeLimitSeconds.toString() : effectiveTimeLimitSeconds.toFixed(1)}s`
    : solverFamilyId === 'auto'
      ? 'complexity-derived'
      : '0s';
  const noImprovementLabel = effectiveNoImprovementIterations
    ? effectiveNoImprovementIterations.toLocaleString()
    : solverFamilyId === 'auto'
      ? 'runtime-scaled'
      : '0';

  return (
    <div className="space-y-4 mb-6">
      <div>
        <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>Iteration Progress</span>
          <span>{solverState.currentIteration.toLocaleString()} / {maxIterationsLabel}</span>
        </div>
        <div className="w-full" style={{ backgroundColor: 'var(--border-secondary)' }}>
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${getProgressPercentage()}%`,
              backgroundColor: '#2563eb' // Blue for iteration progress
            }}
            data-percentage={getProgressPercentage()}
            data-debug="iteration-progress"
          ></div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>Time Progress</span>
          <span>{(solverState.elapsedTime / 1000).toFixed(1)}s / {timeLimitLabel}</span>
        </div>
        <div className="w-full" style={{ backgroundColor: 'var(--border-secondary)' }}>
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${getTimeProgressPercentage()}%`,
              backgroundColor: '#d97706' // Orange for time progress
            }}
            data-percentage={getTimeProgressPercentage()}
            data-debug="time-progress"
          ></div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>No Improvement Progress</span>
          <span>{solverState.noImprovementCount.toLocaleString()} / {noImprovementLabel}</span>
        </div>
        <div className="w-full" style={{ backgroundColor: 'var(--border-secondary)' }}>
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${getNoImprovementProgressPercentage()}%`,
              backgroundColor: '#dc2626' // Red for no improvement progress
            }}
            data-percentage={getNoImprovementProgressPercentage()}
            data-debug="no-improvement-progress"
          ></div>
        </div>
      </div>
    </div>
  );
};

export default ProgressBars;
