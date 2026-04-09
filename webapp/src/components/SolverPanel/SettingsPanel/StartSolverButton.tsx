import React from 'react';
import { Play } from 'lucide-react';

interface StartSolverButtonProps {
  onStartSolver: (useRecommended: boolean) => Promise<void>;
  isRunning: boolean;
  supportsRecommendedSettings: boolean;
}

export function StartSolverButton({ onStartSolver, isRunning, supportsRecommendedSettings }: StartSolverButtonProps) {
  return (
    <div className="mt-6">
      <button
        onClick={() => onStartSolver(false)}
        disabled={isRunning}
        className="btn-success w-full flex items-center justify-center space-x-2"
      >
        <Play className="h-4 w-4" />
        <span>
          {supportsRecommendedSettings ? 'Start Solver with Custom Settings' : 'Start Solver with Current Settings'}
        </span>
      </button>
    </div>
  );
}
