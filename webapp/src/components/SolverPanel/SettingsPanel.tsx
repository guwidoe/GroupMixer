/**
 * SettingsPanel - Manual solver configuration panel.
 */

import React, { useState, useRef } from 'react';
import { Play, ChevronDown, Zap, Info } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import type { SolverSettings, Problem } from '../../types';
import type { SavedProblem } from '../../store/slices/problemManagerSlice';

interface SolverFormInputs {
  maxIterations?: string;
  timeLimit?: string;
  noImprovement?: string;
  initialTemp?: string;
  finalTemp?: string;
  reheatCycles?: string;
  reheat?: string;
  desiredRuntimeSettings?: string;
  desiredRuntimeMain?: string;
}

interface SettingsPanelProps {
  solverSettings: SolverSettings;
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  handleSettingsChange: (newSettings: Partial<SolverSettings>) => void;
  isRunning: boolean;
  desiredRuntimeSettings: number;
  setDesiredRuntimeSettings: React.Dispatch<React.SetStateAction<number>>;
  onAutoSetSettings: () => Promise<void>;
  onStartSolver: (useRecommended: boolean) => Promise<void>;
  problem: Problem | null;
  savedProblems: Record<string, SavedProblem>;
  currentProblemId: string | null;
  warmStartSelection: string | null;
  setWarmStartSelection: React.Dispatch<React.SetStateAction<string | null>>;
  setWarmStartFromResult: (id: string | null) => void;
  allowedSessionsLocal: number[] | null;
  setAllowedSessionsLocal: React.Dispatch<React.SetStateAction<number[] | null>>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  solverSettings,
  solverFormInputs,
  setSolverFormInputs,
  handleSettingsChange,
  isRunning,
  desiredRuntimeSettings,
  setDesiredRuntimeSettings,
  onAutoSetSettings,
  onStartSolver,
  problem,
  savedProblems,
  currentProblemId,
  warmStartSelection,
  setWarmStartSelection,
  setWarmStartFromResult,
  allowedSessionsLocal,
  setAllowedSessionsLocal,
}) => {
  const [warmDropdownOpen, setWarmDropdownOpen] = useState(false);
  const warmDropdownRef = useRef<HTMLDivElement>(null);

  // Close warm-start dropdown on outside click
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        warmDropdownOpen &&
        target &&
        warmDropdownRef.current &&
        !warmDropdownRef.current.contains(target)
      ) {
        setWarmDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [warmDropdownOpen]);

  return (
    <div className="card">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-4 gap-4">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Manual Solver Configuration</h3>

        {/* Automatic Configuration (header right) */}
        <div className="flex items-end gap-2 p-3 rounded-lg" style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)' }}>
          <div className="flex-grow">
            <label htmlFor="desiredRuntime" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Desired Runtime (s)
            </label>
            <input
              id="desiredRuntime"
              type="number"
              value={solverFormInputs.desiredRuntimeSettings ?? desiredRuntimeSettings.toString()}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, desiredRuntimeSettings: e.target.value }))}
              onBlur={() => {
                const inputValue = solverFormInputs.desiredRuntimeSettings || desiredRuntimeSettings.toString();
                const numValue = parseInt(inputValue);
                if (!isNaN(numValue) && numValue >= 1) {
                  setDesiredRuntimeSettings(numValue);
                  setSolverFormInputs(prev => ({ ...prev, desiredRuntimeSettings: undefined }));
                }
              }}
              disabled={isRunning}
              className="input w-24 md:w-32"
            />
          </div>
          <Tooltip content={<span>Run a short trial to estimate optimal solver parameters for the specified runtime.</span>}>
            <button
              onClick={onAutoSetSettings}
              disabled={isRunning}
              className="btn-primary whitespace-nowrap"
            >
              Auto-set
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Warm start selector */}
      <div className="mb-4">
        <div className="p-3 rounded-lg" style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)' }}>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Start from existing result (optional)
          </label>
          <div className="relative" ref={warmDropdownRef}>
            <button
              onClick={() => setWarmDropdownOpen(!warmDropdownOpen)}
              className="btn-secondary flex items-center justify-between gap-2 w-full px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Zap className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">
                  {(() => {
                    if (!warmStartSelection) return 'Start from random (default)';
                    const r = currentProblemId ? savedProblems[currentProblemId]?.results.find(x => x.id === warmStartSelection) : undefined;
                    return r ? `${r.name || 'Result'} • score ${r.solution.final_score.toFixed(2)}` : 'Start from random (default)';
                  })()}
                </span>
              </div>
              <ChevronDown className="w-3 h-3" />
            </button>

            {warmDropdownOpen && (
              <div
                className="absolute left-0 mt-1 w-full rounded-md shadow-lg z-10 border overflow-hidden max-h-72 overflow-y-auto"
                style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
              >
                <button
                  onClick={() => {
                    setWarmStartSelection(null);
                    setWarmStartFromResult(null);
                    setWarmDropdownOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-left transition-colors border-b"
                  style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span>Start from random (default)</span>
                </button>

                {(() => {
                  const list = currentProblemId ? (savedProblems[currentProblemId]?.results || []) : [];
                  if (!list.length) return (
                    <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>No results available</div>
                  );

                  const scores = list.map(r => r.solution.final_score);
                  const min = Math.min(...scores);
                  const max = Math.max(...scores);
                  const colorFor = (score: number) => {
                    if (min === max) return 'text-green-600';
                    const ratio = (score - min) / (max - min);
                    if (ratio <= 0.15) return 'text-green-600';
                    if (ratio <= 0.35) return 'text-lime-600';
                    if (ratio <= 0.6) return 'text-yellow-600';
                    if (ratio <= 0.85) return 'text-orange-600';
                    return 'text-red-600';
                  };

                  return list
                    .slice()
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setWarmStartSelection(r.id);
                          setWarmStartFromResult(r.id);
                          setWarmDropdownOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)', backgroundColor: 'transparent' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{r.name || 'Result'}</span>
                            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{new Date(r.timestamp).toLocaleString()}</span>
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            iter {r.solution.iteration_count.toLocaleString()} • duration {(r.duration / 1000).toFixed(1)}s
                          </div>
                        </div>
                        <div className={`ml-3 font-semibold ${colorFor(r.solution.final_score)}`}>
                          {r.solution.final_score.toFixed(2)}
                        </div>
                      </button>
                    ));
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Allowed sessions selector */}
      <div className="mb-4">
        <div className="p-3 rounded-lg" style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)' }}>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Sessions to iterate (leave empty = all sessions)
          </label>
          <div className="flex flex-wrap gap-2 items-center">
            {Array.from({ length: problem?.num_sessions || 0 }, (_, i) => i).map((s) => {
              const selected = (allowedSessionsLocal ?? solverSettings.allowed_sessions ?? []).includes(s);
              return (
                <button
                  key={s}
                  className={`px-2 py-1 rounded text-xs border ${selected ? 'bg-[var(--bg-tertiary)] text-[var(--color-accent)]' : ''}`}
                  style={{ borderColor: 'var(--border-primary)', color: selected ? 'var(--color-accent)' : 'var(--text-secondary)' }}
                  onClick={() => {
                    const current = new Set(allowedSessionsLocal ?? solverSettings.allowed_sessions ?? []);
                    if (current.has(s)) current.delete(s); else current.add(s);
                    const next = Array.from(current).sort((a, b) => a - b);
                    setAllowedSessionsLocal(next);
                    handleSettingsChange({ allowed_sessions: next.length ? next : undefined });
                  }}
                  disabled={isRunning}
                >
                  Session {s + 1}
                </button>
              );
            })}
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="btn-secondary text-xs"
                onClick={() => {
                  const all = Array.from({ length: problem?.num_sessions || 0 }, (_, i) => i);
                  setAllowedSessionsLocal(all);
                  handleSettingsChange({ allowed_sessions: all });
                }}
                disabled={isRunning}
              >
                All
              </button>
              <button
                className="btn-secondary text-xs"
                onClick={() => {
                  setAllowedSessionsLocal([]);
                  handleSettingsChange({ allowed_sessions: undefined });
                }}
                disabled={isRunning}
              >
                None
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Grid */}
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, maxIterations: e.target.value }))}
            onBlur={() => {
              const inputValue = solverFormInputs.maxIterations || (solverSettings.stop_conditions.max_iterations || 10000).toString();
              const numValue = parseInt(inputValue);
              if (!isNaN(numValue) && numValue >= 1) {
                handleSettingsChange({
                  ...solverSettings,
                  stop_conditions: {
                    ...solverSettings.stop_conditions,
                    max_iterations: numValue
                  }
                });
                setSolverFormInputs(prev => ({ ...prev, maxIterations: undefined }));
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, timeLimit: e.target.value }))}
            onBlur={() => {
              const inputValue = solverFormInputs.timeLimit || (solverSettings.stop_conditions.time_limit_seconds || 30).toString();
              const numValue = parseInt(inputValue);
              if (!isNaN(numValue) && numValue >= 1) {
                handleSettingsChange({
                  ...solverSettings,
                  stop_conditions: {
                    ...solverSettings.stop_conditions,
                    time_limit_seconds: numValue
                  }
                });
                setSolverFormInputs(prev => ({ ...prev, timeLimit: undefined }));
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, noImprovement: e.target.value }))}
            onBlur={() => {
              const inputValue = solverFormInputs.noImprovement || (solverSettings.stop_conditions.no_improvement_iterations || 5000).toString();
              const numValue = parseInt(inputValue);
              if (!isNaN(numValue) && numValue >= 1) {
                handleSettingsChange({
                  ...solverSettings,
                  stop_conditions: {
                    ...solverSettings.stop_conditions,
                    no_improvement_iterations: numValue
                  }
                });
                setSolverFormInputs(prev => ({ ...prev, noImprovement: undefined }));
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
            value={solverFormInputs.initialTemp ?? (solverSettings.solver_params.SimulatedAnnealing?.initial_temperature || 1.0).toString()}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, initialTemp: e.target.value }))}
            onBlur={() => {
              const inputValue = solverFormInputs.initialTemp || (solverSettings.solver_params.SimulatedAnnealing?.initial_temperature || 1.0).toString();
              const numValue = parseFloat(inputValue);
              if (!isNaN(numValue) && numValue >= 0.1) {
                handleSettingsChange({
                  ...solverSettings,
                  solver_params: {
                    ...solverSettings.solver_params,
                    SimulatedAnnealing: {
                      ...solverSettings.solver_params.SimulatedAnnealing!,
                      initial_temperature: numValue
                    }
                  }
                });
                setSolverFormInputs(prev => ({ ...prev, initialTemp: undefined }));
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
            value={solverFormInputs.finalTemp ?? (solverSettings.solver_params.SimulatedAnnealing?.final_temperature || 0.01).toString()}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, finalTemp: e.target.value }))}
            onBlur={() => {
              const inputValue = solverFormInputs.finalTemp || (solverSettings.solver_params.SimulatedAnnealing?.final_temperature || 0.01).toString();
              const numValue = parseFloat(inputValue);
              if (!isNaN(numValue) && numValue >= 0.001) {
                handleSettingsChange({
                  ...solverSettings,
                  solver_params: {
                    ...solverSettings.solver_params,
                    SimulatedAnnealing: {
                      ...solverSettings.solver_params.SimulatedAnnealing!,
                      final_temperature: numValue
                    }
                  }
                });
                setSolverFormInputs(prev => ({ ...prev, finalTemp: undefined }));
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, reheatCycles: e.target.value }))}
            onBlur={() => {
              const inputValue = solverFormInputs.reheatCycles || (solverSettings.solver_params.SimulatedAnnealing?.reheat_cycles || 0).toString();
              const numValue = parseInt(inputValue);
              if (!isNaN(numValue) && numValue >= 0) {
                handleSettingsChange({
                  ...solverSettings,
                  solver_params: {
                    ...solverSettings.solver_params,
                    SimulatedAnnealing: {
                      ...solverSettings.solver_params.SimulatedAnnealing!,
                      reheat_cycles: numValue,
                    }
                  }
                });
                setSolverFormInputs(prev => ({ ...prev, reheatCycles: undefined }));
              }
            }}
            min="0"
            max="100000"
            placeholder="0 = disabled"
          />
        </div>
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <label htmlFor="reheatAfterNoImprovement" className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Reheat After No Improvement
            </label>
            <Tooltip content="Reset temperature to initial value after this many iterations without improvement (0 = disabled).">
              <Info className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            </Tooltip>
          </div>
          <input
            type="number"
            className="input"
            value={solverFormInputs.reheat ?? (solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0).toString()}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSolverFormInputs(prev => ({ ...prev, reheat: e.target.value }))}
            onBlur={() => {
              const inputValue = solverFormInputs.reheat || (solverSettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0).toString();
              const numValue = parseInt(inputValue);
              if (!isNaN(numValue) && numValue >= 0) {
                handleSettingsChange({
                  ...solverSettings,
                  solver_params: {
                    ...solverSettings.solver_params,
                    SimulatedAnnealing: {
                      ...solverSettings.solver_params.SimulatedAnnealing!,
                      reheat_after_no_improvement: numValue
                    }
                  }
                });
                setSolverFormInputs(prev => ({ ...prev, reheat: undefined }));
              }
            }}
            min="0"
            max="50000"
            placeholder="0 = disabled"
          />
        </div>
        {/* Debug options */}
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
              onChange={(e) => handleSettingsChange({
                logging: {
                  ...solverSettings.logging,
                  debug_validate_invariants: e.target.checked,
                },
              })}
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
              onChange={(e) => handleSettingsChange({
                logging: {
                  ...solverSettings.logging,
                  debug_dump_invariant_context: e.target.checked,
                },
              })}
              disabled={isRunning}
            />
            Include detailed context on violation
          </label>
        </div>
      </div>

      {/* Custom Settings Start Button */}
      <div className="mt-6">
        <button
          onClick={() => onStartSolver(false)}
          disabled={isRunning}
          className="btn-success w-full flex items-center justify-center space-x-2"
        >
          <Play className="h-4 w-4" />
          <span>Start Solver with Custom Settings</span>
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
