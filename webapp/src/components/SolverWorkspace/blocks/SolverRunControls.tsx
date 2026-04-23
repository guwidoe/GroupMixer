import React from 'react';
import { Info, Pause, Play, RotateCcw, TrendingUp } from 'lucide-react';
import type { Scenario, SolverState } from '../../../types';
import type { SolverCatalogEntry } from '../../../services/solverUi';
import { NumberField, NUMBER_FIELD_PRESETS } from '../../ui';
import { Tooltip } from '../../Tooltip';
import type { SolverFormInputs } from '../../SolverPanel/types';

interface SolverRunControlsProps {
  solverState: SolverState;
  scenario: Scenario | null;
  selectedSolverCatalogEntry: SolverCatalogEntry | null;
  solverCatalogStatus: 'loading' | 'ready' | 'error';
  solverCatalogErrorMessage: string | null;
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  desiredRuntimeMain: number | null;
  setDesiredRuntimeMain: React.Dispatch<React.SetStateAction<number | null>>;
  startMode: 'recommended' | 'manual';
  runtimeHelpText?: string;
  onStartSolver: (useRecommended: boolean) => void;
  onCancelSolver: () => void;
  onSaveBestSoFar: () => void;
  onResetSolver: () => void;
}

export function SolverRunControls({
  solverState,
  scenario,
  selectedSolverCatalogEntry,
  solverCatalogStatus,
  solverCatalogErrorMessage,
  solverFormInputs: _solverFormInputs,
  setSolverFormInputs,
  desiredRuntimeMain,
  setDesiredRuntimeMain,
  startMode,
  runtimeHelpText,
  onStartSolver,
  onCancelSolver,
  onSaveBestSoFar,
  onResetSolver,
}: SolverRunControlsProps) {
  void _solverFormInputs;
  const catalogReady = solverCatalogStatus === 'ready';
  const supportsRecommendedSettings = catalogReady
    ? selectedSolverCatalogEntry?.capabilities.supportsRecommendedSettings ?? false
    : false;
  const shouldUseRecommended = startMode === 'recommended' && supportsRecommendedSettings;
  const idleButtonLabel = catalogReady
    ? startMode === 'manual'
      ? 'Run with Manual Settings'
      : 'Run Solver'
    : solverCatalogStatus === 'loading'
      ? 'Loading Available Solvers...'
      : 'Available Solvers Unavailable';

  return (
    <section
      className="rounded-2xl border p-4 md:p-5"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      {!catalogReady ? (
        <div
          className="mb-4 rounded-lg border p-3 text-sm"
          style={{
            borderColor: solverCatalogStatus === 'error' ? 'var(--color-danger)' : 'var(--border-secondary)',
            backgroundColor: 'var(--background-secondary)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>
            {solverCatalogStatus === 'loading' ? 'Loading Available Solvers' : 'Available Solvers Unavailable'}
          </div>
          <p>
            {solverCatalogStatus === 'loading'
              ? 'Loading the available solvers before enabling solve controls.'
              : `Could not load the available solvers: ${solverCatalogErrorMessage ?? 'unknown error'}`}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col items-start">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Desired Runtime (s)
            </span>
            {runtimeHelpText ? (
              <Tooltip content={runtimeHelpText} placement="top">
                <button
                  type="button"
                  className="inline-flex items-center justify-center"
                  aria-label="Runtime target help"
                >
                  <Info className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </Tooltip>
            ) : null}
          </div>
          <NumberField
            label={undefined}
            value={desiredRuntimeMain}
            onChange={setDesiredRuntimeMain}
            onCommit={(value) => {
              setDesiredRuntimeMain(value);
              setSolverFormInputs((prev) => ({ ...prev, desiredRuntimeMain: undefined }));
            }}
            disabled={solverState.isRunning}
            {...NUMBER_FIELD_PRESETS.runtimeSeconds}
            className="w-full sm:w-[20rem]"
          />
        </div>

        {!solverState.isRunning ? (
          <button
            onClick={() => onStartSolver(shouldUseRecommended)}
            className="btn-success flex flex-1 items-center justify-center space-x-2"
            disabled={!scenario || !catalogReady}
            title={startMode === 'recommended' && shouldUseRecommended ? 'Runs with the recommended solver configuration automatically.' : undefined}
          >
            <Play className="h-4 w-4" />
            <span>{idleButtonLabel}</span>
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
    </section>
  );
}
