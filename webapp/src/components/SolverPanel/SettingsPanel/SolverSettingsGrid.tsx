import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from '../../Tooltip';
import type { SolverSettings } from '../../../types';
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
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <label htmlFor="initialTemperature" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Initial Temperature
          </label>
          <Tooltip content="The starting temperature for the simulated annealing algorithm. Higher values allow more exploration.">
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <input
          type="number"
          className="input"
          value={
            solverFormInputs.initialTemp ??
            (solverSettings.solver_params.SimulatedAnnealing?.initial_temperature || 1.0).toString()
          }
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, initialTemp: e.target.value }))
          }
          onBlur={() => {
            const inputValue =
              solverFormInputs.initialTemp ||
              (solverSettings.solver_params.SimulatedAnnealing?.initial_temperature || 1.0).toString();
            const numValue = parseFloat(inputValue);
            if (!isNaN(numValue) && numValue >= 0.1) {
              handleSettingsChange({
                ...solverSettings,
                solver_params: {
                  ...solverSettings.solver_params,
                  SimulatedAnnealing: {
                    ...solverSettings.solver_params.SimulatedAnnealing!,
                    initial_temperature: numValue,
                  },
                },
              });
              setSolverFormInputs((prev) => ({ ...prev, initialTemp: undefined }));
            }
          }}
          step="0.1"
          min="0.1"
          max="10.0"
        />
      </div>
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <label htmlFor="finalTemperature" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Final Temperature
          </label>
          <Tooltip content="The temperature at which the algorithm will stop.">
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <input
          type="number"
          className="input"
          value={
            solverFormInputs.finalTemp ??
            (solverSettings.solver_params.SimulatedAnnealing?.final_temperature || 0.01).toString()
          }
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, finalTemp: e.target.value }))
          }
          onBlur={() => {
            const inputValue =
              solverFormInputs.finalTemp ||
              (solverSettings.solver_params.SimulatedAnnealing?.final_temperature || 0.01).toString();
            const numValue = parseFloat(inputValue);
            if (!isNaN(numValue) && numValue >= 0.001) {
              handleSettingsChange({
                ...solverSettings,
                solver_params: {
                  ...solverSettings.solver_params,
                  SimulatedAnnealing: {
                    ...solverSettings.solver_params.SimulatedAnnealing!,
                    final_temperature: numValue,
                  },
                },
              });
              setSolverFormInputs((prev) => ({ ...prev, finalTemp: undefined }));
            }
          }}
          step="0.001"
          min="0.001"
          max="1.0"
        />
      </div>
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <label htmlFor="reheatCycles" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Reheat Cycles
          </label>
          <Tooltip content="Number of cycles to cool from initial to final temperature, then reheat and repeat. 0 = disabled.">
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <input
          id="reheatCycles"
          type="number"
          className="input"
          value={solverFormInputs.reheatCycles ?? (solverSettings.solver_params.SimulatedAnnealing?.reheat_cycles || 0).toString()}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, reheatCycles: e.target.value }))
          }
          onBlur={() => {
            const inputValue =
              solverFormInputs.reheatCycles || (solverSettings.solver_params.SimulatedAnnealing?.reheat_cycles || 0).toString();
            const numValue = parseInt(inputValue);
            if (!isNaN(numValue) && numValue >= 0) {
              handleSettingsChange({
                ...solverSettings,
                solver_params: {
                  ...solverSettings.solver_params,
                  SimulatedAnnealing: {
                    ...solverSettings.solver_params.SimulatedAnnealing!,
                    reheat_cycles: numValue,
                  },
                },
              });
              setSolverFormInputs((prev) => ({ ...prev, reheatCycles: undefined }));
            }
          }}
          min="0"
          max="100000"
          placeholder="0 = disabled"
        />
      </div>
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <label
            htmlFor="reheatAfterNoImprovement"
            className="block text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Reheat After No Improvement
          </label>
          <Tooltip content="Reset temperature to initial value after this many iterations without improvement (0 = disabled).">
            <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          </Tooltip>
        </div>
        <input
          type="number"
          className="input"
          value={
            solverFormInputs.reheat ??
            (solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0).toString()
          }
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSolverFormInputs((prev) => ({ ...prev, reheat: e.target.value }))
          }
          onBlur={() => {
            const inputValue =
              solverFormInputs.reheat ||
              (solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0).toString();
            const numValue = parseInt(inputValue);
            if (!isNaN(numValue) && numValue >= 0) {
              handleSettingsChange({
                ...solverSettings,
                solver_params: {
                  ...solverSettings.solver_params,
                  SimulatedAnnealing: {
                    ...solverSettings.solver_params.SimulatedAnnealing!,
                    reheat_after_no_improvement: numValue,
                  },
                },
              });
              setSolverFormInputs((prev) => ({ ...prev, reheat: undefined }));
            }
          }}
          min="0"
          max="50000"
          placeholder="0 = disabled"
        />
      </div>
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
