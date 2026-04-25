import React from 'react';
import { Tooltip } from '../../Tooltip';
import type { SolverFormInputs } from '../../SolverPanel/SettingsPanel/types';
import { NumberField, NUMBER_FIELD_PRESETS } from '../../ui';

interface RecommendedSettingsPanelProps {
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  desiredRuntimeSettings: number;
  setDesiredRuntimeSettings: React.Dispatch<React.SetStateAction<number>>;
  onAutoSetSettings: () => Promise<void>;
  isRunning: boolean;
  solverCatalogStatus: 'loading' | 'ready' | 'error';
  solverCatalogErrorMessage: string | null;
  supportsRecommendedSettings: boolean;
  solverDisplayName: string;
  usesAutoRuntimePolicy?: boolean;
}

export function RecommendedSettingsPanel({
  solverFormInputs,
  setSolverFormInputs,
  desiredRuntimeSettings,
  setDesiredRuntimeSettings,
  onAutoSetSettings,
  isRunning,
  solverCatalogStatus,
  solverCatalogErrorMessage,
  supportsRecommendedSettings,
  solverDisplayName,
  usesAutoRuntimePolicy = false,
}: RecommendedSettingsPanelProps) {
  void solverFormInputs;
  if (solverCatalogStatus !== 'ready') {
    return (
      <div
        className="rounded-lg p-3 text-sm"
        style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}
      >
        <div className="mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>
          {solverCatalogStatus === 'loading' ? 'Loading Available Solvers' : 'Available Solvers Unavailable'}
        </div>
        <p>
          {solverCatalogStatus === 'loading'
            ? 'Loading the available solvers for this app.'
            : `Automatic settings are unavailable because the solver list could not be loaded: ${solverCatalogErrorMessage ?? 'unknown error'}`}
        </p>
      </div>
    );
  }

  if (!supportsRecommendedSettings) {
    return (
      <div
        className="rounded-lg p-3 text-sm"
        style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}
      >
        <div className="mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>
          Automatic Settings Unavailable
        </div>
        <p>
          Recommended settings are not available for {solverDisplayName} yet. Use the manual controls below.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-3"
      style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)' }}
    >
      <div className="mb-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Recommended Settings
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {usesAutoRuntimePolicy
            ? 'Auto is already the product-default policy. It derives runtime from scenario complexity and exposes route/budget telemetry after each run.'
            : 'Estimate a good configuration for the chosen runtime budget.'}
        </p>
      </div>
      {usesAutoRuntimePolicy ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border-secondary)', color: 'var(--text-secondary)' }}>
            Runtime: complexity-derived · Search reserve: ≥70% · Construction fallback: telemetry-visible
          </div>
          <Tooltip content={<span>Reset the scenario to the default Auto solver configuration.</span>}>
            <button onClick={onAutoSetSettings} disabled={isRunning} className="btn-primary whitespace-nowrap">
              Reset Auto Defaults
            </button>
          </Tooltip>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-grow">
            <NumberField
              label="Desired Runtime (s)"
              value={desiredRuntimeSettings}
              onChange={() => {}}
              onCommit={(value) => {
                if (value != null && value >= 1) {
                  setDesiredRuntimeSettings(Math.round(value));
                  setSolverFormInputs((prev) => ({ ...prev, desiredRuntimeSettings: undefined }));
                }
              }}
              disabled={isRunning}
              {...NUMBER_FIELD_PRESETS.runtimeSeconds}
              className="w-full md:w-[20rem]"
            />
          </div>
          <Tooltip content={<span>Run a short trial to estimate solver parameters for the specified runtime.</span>}>
            <button onClick={onAutoSetSettings} disabled={isRunning} className="btn-primary whitespace-nowrap">
              Auto-set
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
