import React from 'react';
import { Play } from 'lucide-react';

interface StartSolverButtonProps {
  onStartSolver: (useRecommended: boolean) => Promise<void>;
  isRunning: boolean;
}

export function StartSolverButton({ onStartSolver, isRunning }: StartSolverButtonProps) {
  return (
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
  );
}
