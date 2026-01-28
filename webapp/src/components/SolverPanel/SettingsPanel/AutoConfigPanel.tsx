import React from 'react';
import { Tooltip } from '../../Tooltip';
import type { SolverFormInputs } from './types';

interface AutoConfigPanelProps {
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  desiredRuntimeSettings: number;
  setDesiredRuntimeSettings: React.Dispatch<React.SetStateAction<number>>;
  onAutoSetSettings: () => Promise<void>;
  isRunning: boolean;
}

export function AutoConfigPanel({
  solverFormInputs,
  setSolverFormInputs,
  desiredRuntimeSettings,
  setDesiredRuntimeSettings,
  onAutoSetSettings,
  isRunning,
}: AutoConfigPanelProps) {
  return (
    <div
      className="flex items-end gap-2 p-3 rounded-lg"
      style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)' }}
    >
      <div className="flex-grow">
        <label htmlFor="desiredRuntime" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Desired Runtime (s)
        </label>
        <input
          id="desiredRuntime"
          type="number"
          value={solverFormInputs.desiredRuntimeSettings ?? desiredRuntimeSettings.toString()}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, desiredRuntimeSettings: e.target.value }))
          }
          onBlur={() => {
            const inputValue = solverFormInputs.desiredRuntimeSettings || desiredRuntimeSettings.toString();
            const numValue = parseInt(inputValue);
            if (!isNaN(numValue) && numValue >= 1) {
              setDesiredRuntimeSettings(numValue);
              setSolverFormInputs((prev) => ({ ...prev, desiredRuntimeSettings: undefined }));
            }
          }}
          disabled={isRunning}
          className="input w-24 md:w-32"
        />
      </div>
      <Tooltip content={<span>Run a short trial to estimate optimal solver parameters for the specified runtime.</span>}>
        <button onClick={onAutoSetSettings} disabled={isRunning} className="btn-primary whitespace-nowrap">
          Auto-set
        </button>
      </Tooltip>
    </div>
  );
}
