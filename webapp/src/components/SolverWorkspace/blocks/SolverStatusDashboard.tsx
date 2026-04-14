import React from 'react';
import { Activity, ArrowRight, Clock, Info, TrendingUp } from 'lucide-react';
import type { SolverSettings, SolverState } from '../../../types';
import { Tooltip } from '../../Tooltip';
import ProgressBars from '../../SolverPanel/ProgressBars';

interface SolverStatusDashboardProps {
  solverState: SolverState;
  displaySettings: SolverSettings;
  canOpenCurrentResult?: boolean;
  onOpenCurrentResult?: () => void;
}

export function SolverStatusDashboard({
  solverState,
  displaySettings,
  canOpenCurrentResult = false,
  onOpenCurrentResult,
}: SolverStatusDashboardProps) {
  return (
    <section
      className="rounded-2xl border p-4 md:p-5"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Solver Status
        </h3>
        <div className="flex items-center space-x-2">
          <div
            className={`h-3 w-3 rounded-full ${solverState.isRunning ? 'bg-success-500 animate-pulse-slow' : 'bg-gray-300'}`}
          />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {solverState.isRunning ? 'Running' : 'Idle'}
          </span>
        </div>
      </div>

      <ProgressBars solverState={solverState} displaySettings={displaySettings} />

      {canOpenCurrentResult && onOpenCurrentResult ? (
        <div
          className="mt-4 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, var(--bg-primary))',
            borderColor: 'color-mix(in srgb, var(--color-accent) 24%, var(--border-primary))',
          }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Solve complete
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Review the active result directly to inspect assignments, exports, and visualizations.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCurrentResult}
            className="btn-primary inline-flex items-center justify-center gap-2 self-start sm:self-auto"
          >
            <span>Open Current Result</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="mt-6 flex flex-row gap-2 overflow-x-auto sm:gap-4">
        <div className="min-w-0 flex-1 flex-shrink-0 rounded-lg bg-primary-50 p-3 text-center sm:p-4">
          <Activity className="mx-auto mb-2 h-6 w-6 text-primary-600 sm:h-8 sm:w-8" />
          <div className="text-lg font-bold text-primary-600 sm:text-2xl">{solverState.currentIteration.toLocaleString()}</div>
          <div className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            Iterations
          </div>
        </div>
        <div className="min-w-0 flex-1 flex-shrink-0 rounded-lg bg-success-50 p-3 text-center sm:p-4">
          <TrendingUp className="mx-auto mb-2 h-6 w-6 text-success-600 sm:h-8 sm:w-8" />
          <div className="text-lg font-bold text-success-600 sm:text-2xl">{solverState.bestScore.toFixed(2)}</div>
          <div className="flex items-center justify-center gap-1 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span className="truncate">Best Cost Score</span>
            <Tooltip
              content={
                <span>
                  Cost Score = (Weighted max possible contacts − weighted current contacts) + weighted constraint penalties. The solver is trying to minimize this score. <b>Lower is better.</b>
                </span>
              }
            >
              <Info className="h-3 w-3 flex-shrink-0" />
            </Tooltip>
          </div>
        </div>
        <div
          className="min-w-0 flex-1 flex-shrink-0 rounded-lg p-3 text-center sm:p-4"
          style={{ backgroundColor: 'var(--background-secondary)' }}
        >
          <TrendingUp className="mx-auto mb-2 h-6 w-6 sm:h-8 sm:w-8" style={{ color: 'var(--text-accent-blue)' }} />
          <div className="text-lg font-bold sm:text-2xl" style={{ color: 'var(--text-accent-blue)' }}>
            {(solverState.currentScore ?? 0).toFixed(2)}
          </div>
          <div className="flex items-center justify-center gap-1 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span className="truncate">Current Cost Score</span>
            <Tooltip content={<span>The current overall cost score of the working solution at this iteration. <b>Lower is better.</b></span>}>
              <Info className="h-3 w-3 flex-shrink-0" />
            </Tooltip>
          </div>
        </div>
        <div className="min-w-0 flex-1 flex-shrink-0 rounded-lg bg-warning-50 p-3 text-center sm:p-4">
          <Clock className="mx-auto mb-2 h-6 w-6 text-warning-600 sm:h-8 sm:w-8" />
          <div className="text-lg font-bold text-warning-600 sm:text-2xl">{(solverState.elapsedTime / 1000).toFixed(1)}s</div>
          <div className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            Elapsed Time
          </div>
        </div>
      </div>
    </section>
  );
}
