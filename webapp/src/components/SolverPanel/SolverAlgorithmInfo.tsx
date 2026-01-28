import React from 'react';
import type { SolverSettings } from '../../types';

interface SolverAlgorithmInfoProps {
  displaySettings: SolverSettings;
}

export function SolverAlgorithmInfo({ displaySettings }: SolverAlgorithmInfoProps) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Algorithm Information
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Simulated Annealing
          </h4>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            A probabilistic optimization algorithm that mimics the annealing process in metallurgy.
          </p>
          <ul className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <li>• Starts with high temperature for exploration</li>
            <li>• Gradually cools to focus on local improvements</li>
            <li>• Can escape local optima</li>
            <li>• Optional reheat feature restarts exploration when stuck</li>
            <li>• Well-suited for combinatorial problems</li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Current Parameters
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Initial Temperature:</span>
              <span className="font-medium">
                {displaySettings.solver_params.SimulatedAnnealing?.initial_temperature || 1.0}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Final Temperature:</span>
              <span className="font-medium">
                {displaySettings.solver_params.SimulatedAnnealing?.final_temperature || 0.01}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Max Iterations:</span>
              <span className="font-medium">{(displaySettings.stop_conditions.max_iterations || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Time Limit:</span>
              <span className="font-medium">{displaySettings.stop_conditions.time_limit_seconds || 0}s</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>No Improvement Limit:</span>
              <span className="font-medium">
                {(displaySettings.stop_conditions.no_improvement_iterations || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Reheat After:</span>
              <span className="font-medium">
                {(displaySettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0) === 0
                  ? 'Disabled'
                  : (displaySettings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Reheat Cycles:</span>
              <span className="font-medium">
                {(displaySettings.solver_params.SimulatedAnnealing?.reheat_cycles || 0) === 0
                  ? 'Disabled'
                  : (displaySettings.solver_params.SimulatedAnnealing?.reheat_cycles || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
