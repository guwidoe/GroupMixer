/**
 * ProgressBars - Displays solver progress bars for iteration, time, and no-improvement.
 */

import React from 'react';
import type { SolverSettings } from '../../types';

interface SolverState {
  currentIteration: number;
  elapsedTime: number;
  noImprovementCount: number;
}

interface ProgressBarsProps {
  solverState: SolverState;
  displaySettings: SolverSettings;
}

const ProgressBars: React.FC<ProgressBarsProps> = ({ solverState, displaySettings }) => {
  const getProgressPercentage = () => {
    if (!displaySettings.stop_conditions.max_iterations) return 0;
    return Math.min(
      (solverState.currentIteration / displaySettings.stop_conditions.max_iterations) * 100,
      100
    );
  };

  const getTimeProgressPercentage = () => {
    if (!displaySettings.stop_conditions.time_limit_seconds) return 0;
    const timeLimit = displaySettings.stop_conditions.time_limit_seconds;
    return Math.min((solverState.elapsedTime / 1000 / timeLimit) * 100, 100);
  };

  const getNoImprovementProgressPercentage = () => {
    if (!displaySettings.stop_conditions.no_improvement_iterations) return 0;
    return Math.min(
      (solverState.noImprovementCount / displaySettings.stop_conditions.no_improvement_iterations) * 100,
      100
    );
  };

  return (
    <div className="space-y-4 mb-6">
      <div>
        <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>Iteration Progress</span>
          <span>{solverState.currentIteration.toLocaleString()} / {(displaySettings.stop_conditions.max_iterations || 0).toLocaleString()}</span>
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
          <span>{(solverState.elapsedTime / 1000).toFixed(1)}s / {displaySettings.stop_conditions.time_limit_seconds || 0}s</span>
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
          <span>{solverState.noImprovementCount.toLocaleString()} / {(displaySettings.stop_conditions.no_improvement_iterations || 0).toLocaleString()}</span>
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
