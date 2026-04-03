import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from '../../Tooltip';
import type { SolverSettings } from '../../../types';
import { getSolverParameterFieldMetadata } from '../../../services/solverCatalog';
import type { SolverFormInputs } from './types';

interface SolverSettingsGridProps {
  solverSettings: SolverSettings;
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  handleSettingsChange: (newSettings: Partial<SolverSettings>) => void;
  isRunning: boolean;
}

export function SolverSettingsGrid({
  solverSettings,
  solverFormInputs,
  setSolverFormInputs,
  handleSettingsChange,
  isRunning,
}: SolverSettingsGridProps) {
  const solverParameterFields = getSolverParameterFieldMetadata(solverSettings);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <label htmlFor="maxIterations" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Max Iterations
          </label>
          <Tooltip content="The maximum number of iterations the solver will run.">
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <input
          type="number"
          className="input"
          value={solverFormInputs.maxIterations ?? (solverSettings.stop_conditions.max_iterations || 10000).toString()}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, maxIterations: e.target.value }))
          }
          onBlur={() => {
            const inputValue =
              solverFormInputs.maxIterations || (solverSettings.stop_conditions.max_iterations || 10000).toString();
            const numValue = parseInt(inputValue);
            if (!isNaN(numValue) && numValue >= 1) {
              handleSettingsChange({
                ...solverSettings,
                stop_conditions: {
                  ...solverSettings.stop_conditions,
                  max_iterations: numValue,
                },
              });
              setSolverFormInputs((prev) => ({ ...prev, maxIterations: undefined }));
            }
          }}
          min="1"
          max="100000"
        />
      </div>
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <label htmlFor="timeLimit" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Time Limit (seconds)
          </label>
          <Tooltip content="The maximum time the solver will run in seconds.">
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <input
          type="number"
          className="input"
          value={solverFormInputs.timeLimit ?? (solverSettings.stop_conditions.time_limit_seconds || 30).toString()}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, timeLimit: e.target.value }))
          }
          onBlur={() => {
            const inputValue =
              solverFormInputs.timeLimit || (solverSettings.stop_conditions.time_limit_seconds || 30).toString();
            const numValue = parseInt(inputValue);
            if (!isNaN(numValue) && numValue >= 1) {
              handleSettingsChange({
                ...solverSettings,
                stop_conditions: {
                  ...solverSettings.stop_conditions,
                  time_limit_seconds: numValue,
                },
              });
              setSolverFormInputs((prev) => ({ ...prev, timeLimit: undefined }));
            }
          }}
          min="1"
          max="300"
        />
      </div>
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <label htmlFor="noImprovementLimit" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            No Improvement Limit
          </label>
          <Tooltip content="Stop after this many iterations without improvement.">
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <input
          type="number"
          className="input"
          value={solverFormInputs.noImprovement ?? (solverSettings.stop_conditions.no_improvement_iterations || 5000).toString()}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, noImprovement: e.target.value }))
          }
          onBlur={() => {
            const inputValue =
              solverFormInputs.noImprovement || (solverSettings.stop_conditions.no_improvement_iterations || 5000).toString();
            const numValue = parseInt(inputValue);
            if (!isNaN(numValue) && numValue >= 1) {
              handleSettingsChange({
                ...solverSettings,
                stop_conditions: {
                  ...solverSettings.stop_conditions,
                  no_improvement_iterations: numValue,
                },
              });
              setSolverFormInputs((prev) => ({ ...prev, noImprovement: undefined }));
            }
          }}
          min="1"
          max="50000"
          placeholder="Iterations without improvement before stopping"
        />
      </div>
      {solverParameterFields.map((field) => {
        const fallbackValue = field.getValue(solverSettings).toString() || field.defaultValue;
        const inputValue = solverFormInputs[field.formInputKey] ?? fallbackValue;

        return (
          <div key={field.formInputKey}>
            <div className="flex items-center space-x-2 mb-1">
              <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {field.label}
              </label>
              <Tooltip content={field.tooltip}>
                <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              </Tooltip>
            </div>
            <input
              type="number"
              className="input"
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSolverFormInputs((prev) => ({ ...prev, [field.formInputKey]: e.target.value }))
              }
              onBlur={() => {
                const rawValue = solverFormInputs[field.formInputKey] ?? fallbackValue;
                const parsedValue = field.parse(rawValue);
                if (field.isValid(parsedValue)) {
                  handleSettingsChange(field.applyValue(solverSettings, parsedValue));
                  setSolverFormInputs((prev) => ({ ...prev, [field.formInputKey]: undefined }));
                }
              }}
              step={field.step}
              min={field.min}
              max={field.max}
              placeholder={field.placeholder}
            />
          </div>
        );
      })}
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Debug: Validate Invariants
          </label>
          <Tooltip content="Check for duplicate assignments after each accepted move. Expensive – for debugging only.">
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={!!solverSettings.logging?.debug_validate_invariants}
            onChange={(e) =>
              handleSettingsChange({
                logging: {
                  ...solverSettings.logging,
                  debug_validate_invariants: e.target.checked,
                },
              })
            }
            disabled={isRunning}
          />
          Enable invariant validation
        </label>
      </div>
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Debug: Dump Invariant Context
          </label>
          <Tooltip content="If an invariant fails, include move details and partial schedule in error output.">
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={!!solverSettings.logging?.debug_dump_invariant_context}
            onChange={(e) =>
              handleSettingsChange({
                logging: {
                  ...solverSettings.logging,
                  debug_dump_invariant_context: e.target.checked,
                },
              })
            }
            disabled={isRunning}
          />
          Include detailed context on violation
        </label>
      </div>
    </div>
  );
}
