import React from 'react';
import { Play } from 'lucide-react';

interface StartSolverButtonProps {
  onStartSolver: (useRecommended: boolean) => Promise<void>;
  isRunning: boolean;
  solverCatalogStatus: 'loading' | 'ready' | 'error';
  supportsRecommendedSettings: boolean;
}

export function StartSolverButton({ onStartSolver, isRunning, solverCatalogStatus, supportsRecommendedSettings }: StartSolverButtonProps) {
  const catalogReady = solverCatalogStatus === 'ready';

  return (
    <div className="mt-6">
      <button
        onClick={() => onStartSolver(false)}
        disabled={isRunning || !catalogReady}
        className="btn-success w-full flex items-center justify-center space-x-2"
      >
        <Play className="h-4 w-4" />
        <span>
          {catalogReady
            ? supportsRecommendedSettings
              ? 'Start Solver with Custom Settings'
              : 'Start Solver with Current Settings'
            : solverCatalogStatus === 'loading'
              ? 'Loading Solver Catalog...'
              : 'Solver Catalog Unavailable'}
        </span>
      </button>
    </div>
  );
}
