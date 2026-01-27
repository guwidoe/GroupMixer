import React from 'react';
import { Calendar, Layers, Target, Users } from 'lucide-react';
import type { ProblemResult, SavedProblem } from '../../types';
import { formatDuration } from './utils';

interface ResultsHistorySummaryProps {
  currentProblem: SavedProblem;
  bestResult: ProblemResult | null;
}

export function ResultsHistorySummary({ currentProblem, bestResult }: ResultsHistorySummaryProps) {
  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 mb-4">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Problem Overview</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex items-center space-x-1">
            <Users className="h-4 w-4" />
            <span>{currentProblem.problem.people.length} people</span>
          </div>
          <div className="flex items-center space-x-1">
            <Layers className="h-4 w-4" />
            <span>{currentProblem.problem.groups.length} groups</span>
          </div>
          <div className="flex items-center space-x-1">
            <Calendar className="h-4 w-4" />
            <span>{currentProblem.problem.num_sessions} sessions</span>
          </div>
        </div>
      </div>

      {bestResult && (
        <div className="rounded-lg p-4 border badge-best">
          <div className="flex items-center space-x-2 mb-2">
            <Target className="h-5 w-5" style={{ color: 'var(--badge-best-text)' }} />
            <span className="font-medium" style={{ color: 'var(--badge-best-text)' }}>Best Result</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span style={{ color: 'var(--badge-best-text)' }}>Score:</span>
              <span className="ml-2 font-medium" style={{ color: 'var(--badge-best-text)' }}>
                {bestResult.solution.final_score.toFixed(2)}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--badge-best-text)' }}>Duration:</span>
              <span className="ml-2 font-medium" style={{ color: 'var(--badge-best-text)' }}>
                {formatDuration(bestResult.duration)}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--badge-best-text)' }}>Iterations:</span>
              <span className="ml-2 font-medium" style={{ color: 'var(--badge-best-text)' }}>
                {bestResult.solution.iteration_count.toLocaleString()}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--badge-best-text)' }}>Name:</span>
              <span className="ml-2 font-medium" style={{ color: 'var(--badge-best-text)' }}>
                {bestResult.name}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
