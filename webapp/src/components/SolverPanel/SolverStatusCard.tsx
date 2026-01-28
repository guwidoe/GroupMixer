import React from 'react';
import {
  Activity,
  Clock,
  Info,
  LayoutGrid,
  Pause,
  Play,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import type { Problem, SolverSettings, SolverState } from '../../types';
import type { ProgressUpdate } from '../../services/wasm';
import type { ScheduleSnapshot } from '../../visualizations/types';
import { VisualizationPanel } from '../../visualizations/VisualizationPanel';
import { Tooltip } from '../Tooltip';
import { DetailedMetrics, ProgressBars } from './index';
import type { SolverFormInputs } from './types';

interface LiveVizState {
  schedule: ScheduleSnapshot;
  progress: ProgressUpdate | null;
}

interface SolverStatusCardProps {
  solverState: SolverState;
  problem: Problem | null;
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  desiredRuntimeMain: number | null;
  setDesiredRuntimeMain: (value: number | null) => void;
  onStartSolver: (useRecommended: boolean) => void;
  onCancelSolver: () => void;
  onSaveBestSoFar: () => void;
  onResetSolver: () => void;
  displaySettings: SolverSettings;
  showLiveViz: boolean;
  onToggleLiveViz: () => void;
  liveVizState: LiveVizState | null;
  liveVizPluginId: string;
  onLiveVizPluginChange: (id: string) => void;
  getLiveVizProblem: () => Problem | null;
  showMetrics: boolean;
  onToggleMetrics: () => void;
  formatIterationTime: (ms: number) => string;
}

export function SolverStatusCard({
  solverState,
  problem,
  solverFormInputs,
  setSolverFormInputs,
  desiredRuntimeMain,
  setDesiredRuntimeMain,
  onStartSolver,
  onCancelSolver,
  onSaveBestSoFar,
  onResetSolver,
  displaySettings,
  showLiveViz,
  onToggleLiveViz,
  liveVizState,
  liveVizPluginId,
  onLiveVizPluginChange,
  getLiveVizProblem,
  showMetrics,
  onToggleMetrics,
  formatIterationTime,
}: SolverStatusCardProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Solver Status
        </h3>
        <div className="flex items-center space-x-2">
          <div
            className={`w-3 h-3 rounded-full ${
              solverState.isRunning ? 'bg-success-500 animate-pulse-slow' : 'bg-gray-300'
            }`}
          ></div>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {solverState.isRunning ? 'Running' : 'Idle'}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <div className="flex flex-col items-start">
          <label className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Desired Runtime (s)
          </label>
          <input
            type="number"
            value={solverFormInputs.desiredRuntimeMain ?? (desiredRuntimeMain?.toString() || '')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSolverFormInputs((prev) => ({ ...prev, desiredRuntimeMain: e.target.value }))
            }
            onBlur={() => {
              const inputValue = solverFormInputs.desiredRuntimeMain || (desiredRuntimeMain?.toString() || '');
              const numValue = inputValue === '' ? null : Number(inputValue);
              if (numValue === null || (!isNaN(numValue) && numValue >= 1)) {
                setDesiredRuntimeMain(numValue);
                setSolverFormInputs((prev) => ({ ...prev, desiredRuntimeMain: undefined }));
              }
            }}
            disabled={solverState.isRunning}
            className="input w-full sm:w-28"
            min="1"
          />
        </div>
        {!solverState.isRunning ? (
          <button
            onClick={() => {
              console.log('[SolverPanel] Start Solver button clicked');
              onStartSolver(true);
            }}
            className="btn-success flex-1 flex items-center justify-center space-x-2"
            disabled={!problem}
          >
            <Play className="h-4 w-4" />
            <span>Start Solver with Automatic Settings</span>
          </button>
        ) : (
          <div className="flex flex-1 gap-2">
            <button onClick={onCancelSolver} className="btn-warning flex-1 flex items-center justify-center space-x-2">
              <Pause className="h-4 w-4" />
              <span>Cancel Solver</span>
            </button>
            <button
              onClick={onSaveBestSoFar}
              className="btn-secondary flex-1 flex items-center justify-center space-x-2"
              title="Save best-so-far and continue solving"
            >
              <TrendingUp className="h-4 w-4" />
              <span>Save Best So Far</span>
            </button>
          </div>
        )}

        <button
          onClick={onResetSolver}
          className="btn-secondary flex items-center justify-center space-x-2"
          disabled={solverState.isRunning}
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset</span>
        </button>
      </div>

      <ProgressBars solverState={solverState} displaySettings={displaySettings} />

      <div className="flex flex-row gap-2 sm:gap-4 mb-6 overflow-x-auto">
        <div className="text-center p-3 sm:p-4 bg-primary-50 rounded-lg flex-shrink-0 min-w-0 flex-1">
          <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-primary-600 mx-auto mb-2" />
          <div className="text-lg sm:text-2xl font-bold text-primary-600">
            {solverState.currentIteration.toLocaleString()}
          </div>
          <div className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            Iterations
          </div>
        </div>
        <div className="text-center p-3 sm:p-4 bg-success-50 rounded-lg flex-shrink-0 min-w-0 flex-1">
          <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-success-600 mx-auto mb-2" />
          <div className="text-lg sm:text-2xl font-bold text-success-600">{solverState.bestScore.toFixed(2)}</div>
          <div className="text-xs sm:text-sm flex items-center justify-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <span className="truncate">Best Cost Score</span>
            <Tooltip
              content={
                <span>
                  Cost Score = (Weighted max possible contacts − weighted current contacts) + weighted constraint
                  penalties. The solver is trying to minimize this score. <b>Lower is better.</b>
                </span>
              }
            >
              <Info className="h-3 w-3 flex-shrink-0" />
            </Tooltip>
          </div>
        </div>
        <div
          className="text-center p-3 sm:p-4 rounded-lg flex-shrink-0 min-w-0 flex-1"
          style={{ backgroundColor: 'var(--background-secondary)' }}
        >
          <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2" style={{ color: 'var(--text-accent-blue)' }} />
          <div className="text-lg sm:text-2xl font-bold" style={{ color: 'var(--text-accent-blue)' }}>
            {(solverState.currentScore ?? 0).toFixed(2)}
          </div>
          <div className="text-xs sm:text-sm flex items-center justify-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <span className="truncate">Current Cost Score</span>
            <Tooltip content={<span>The current overall cost score of the working solution at this iteration. <b>Lower is better.</b></span>}>
              <Info className="h-3 w-3 flex-shrink-0" />
            </Tooltip>
          </div>
        </div>
        <div className="text-center p-3 sm:p-4 bg-warning-50 rounded-lg flex-shrink-0 min-w-0 flex-1">
          <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-warning-600 mx-auto mb-2" />
          <div className="text-lg sm:text-2xl font-bold text-warning-600">
            {(solverState.elapsedTime / 1000).toFixed(1)}s
          </div>
          <div className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            Elapsed Time
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
            <h4 className="font-medium" style={{ color: 'var(--text-primary)' }}>
              Live visualization
            </h4>
          </div>

          <button
            type="button"
            className="px-3 py-1 rounded text-sm transition-colors border"
            style={{
              backgroundColor: showLiveViz ? 'var(--bg-tertiary)' : 'transparent',
              color: showLiveViz ? 'var(--color-accent)' : 'var(--text-secondary)',
              borderColor: showLiveViz ? 'var(--color-accent)' : 'var(--border-primary)',
            }}
            onClick={onToggleLiveViz}
          >
            {showLiveViz ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {showLiveViz ? (
          solverState.isRunning ? (
            liveVizState ? (
              (() => {
                const liveProblem = getLiveVizProblem();
                if (!liveProblem) return null;
                return (
                  <div
                    className="rounded-lg border p-4"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderColor: 'var(--border-primary)',
                    }}
                  >
                    <VisualizationPanel
                      pluginId={liveVizPluginId}
                      onPluginChange={onLiveVizPluginChange}
                      data={{
                        kind: 'live',
                        problem: liveProblem,
                        progress: liveVizState.progress,
                        schedule: liveVizState.schedule,
                      }}
                    />
                  </div>
                );
              })()
            ) : (
              <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Waiting for best-schedule snapshots…
              </div>
            )
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Start the solver to see the schedule evolve over time.
            </div>
          )
        ) : null}
      </div>

      <DetailedMetrics
        solverState={solverState}
        showMetrics={showMetrics}
        onToggleMetrics={onToggleMetrics}
        formatIterationTime={formatIterationTime}
      />
    </div>
  );
}
