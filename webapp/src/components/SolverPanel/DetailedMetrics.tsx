/**
 * DetailedMetrics - Displays detailed algorithm metrics including temperature,
 * move statistics, and penalty breakdowns.
 */

import React from 'react';
import { BarChart3, ChevronDown, ChevronRight, Info } from 'lucide-react';
import type { SolverState } from '../../types';
import { Tooltip } from '../Tooltip';

interface DetailedMetricsProps {
  solverState: SolverState;
  showMetrics: boolean;
  onToggleMetrics: () => void;
  formatIterationTime: (ms: number) => string;
}

const DetailedMetrics: React.FC<DetailedMetricsProps> = ({
  solverState,
  showMetrics,
  onToggleMetrics,
  formatIterationTime,
}) => {
  const finiteNumber = (value: number | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

  return (
    <div className="mb-2">
      <button className="flex items-center gap-3 cursor-pointer mb-3 text-left" onClick={onToggleMetrics}>
        {showMetrics ? (
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        )}
        <BarChart3 className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
        <h4 className="font-medium" style={{ color: 'var(--text-primary)' }}>
          Detailed Algorithm Metrics
        </h4>
      </button>

      {showMetrics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Temperature</span>
                <Tooltip content="Current temperature of the simulated annealing algorithm.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-blue)' }}>
                {finiteNumber(solverState.temperature).toFixed(4)}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Cooling Progress</span>
                <Tooltip content="Percentage of the way through the cooling schedule.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-purple)' }}>
                {(finiteNumber(solverState.coolingProgress) * 100).toFixed(1)}%
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Acceptance Rate</span>
                <Tooltip content="Overall percentage of proposed moves that have been accepted.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-green)' }}>
                {(finiteNumber(solverState.overallAcceptanceRate) * 100).toFixed(1)}%
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Recent Acceptance</span>
                <Tooltip content="Percentage of proposed moves accepted over the last 1000 iterations.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-orange)' }}>
                {(finiteNumber(solverState.recentAcceptanceRate) * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <h5 className="font-medium mb-2 flex items-center space-x-2" style={{ color: 'var(--text-accent-indigo)' }}>
                <span>Clique Swaps</span>
                <Tooltip content="Swapping two entire groups of people who are incompatible with their current groups but compatible with each other's.">
                  <Info className="h-4 w-4" />
                </Tooltip>
              </h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Tried:</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {solverState.cliqueSwapsTried?.toLocaleString() || '0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Accepted:</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {solverState.cliqueSwapsAccepted?.toLocaleString() || '0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Success Rate:</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {(finiteNumber(solverState.cliqueSwapSuccessRate) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <h5 className="font-medium mb-2 flex items-center space-x-2" style={{ color: 'var(--text-accent-teal)' }}>
                <span>Transfers</span>
                <Tooltip content="Moving a single person from one group to another.">
                  <Info className="h-4 w-4" />
                </Tooltip>
              </h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Tried:</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {solverState.transfersTried?.toLocaleString() || '0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Accepted:</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {solverState.transfersAccepted?.toLocaleString() || '0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Success Rate:</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {(finiteNumber(solverState.transferSuccessRate) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <h5 className="font-medium mb-2 flex items-center space-x-2" style={{ color: 'var(--text-accent-cyan)' }}>
                <span>Regular Swaps</span>
                <Tooltip content="Swapping two people from different groups.">
                  <Info className="h-4 w-4" />
                </Tooltip>
              </h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Tried:</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {solverState.swapsTried?.toLocaleString() || '0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Accepted:</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {solverState.swapsAccepted?.toLocaleString() || '0'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Success Rate:</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {(finiteNumber(solverState.swapSuccessRate) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Local Optima Escapes</span>
                <Tooltip content="Number of times the algorithm accepted a move that resulted in a worse score to escape a local optimum.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-red)' }}>
                {solverState.localOptimaEscapes?.toLocaleString() || '0'}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Reheats Performed</span>
                <Tooltip content="Number of times the temperature was reset to its initial value.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-yellow)' }}>
                {solverState.reheatsPerformed || '0'}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Avg Time/Iteration</span>
                <Tooltip content="Average time taken to complete one iteration in milliseconds.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-pink)' }}>
                {formatIterationTime(finiteNumber(solverState.avgTimePerIterationMs))}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Search Efficiency</span>
                <Tooltip content="A measure of how effectively the search is exploring the solution space.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-emerald)' }}>
                {finiteNumber(solverState.searchEfficiency).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Avg Attempted Delta</span>
                <Tooltip content="Average change in score for all proposed moves.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-lime)' }}>
                {finiteNumber(solverState.avgAttemptedMoveDelta).toFixed(3)}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Avg Accepted Delta</span>
                <Tooltip content="Average change in score for all accepted moves.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-amber)' }}>
                {finiteNumber(solverState.avgAcceptedMoveDelta).toFixed(3)}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Max Attempted Delta</span>
                <Tooltip content="Largest score increase from an attempted move.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-red)' }}>
                {finiteNumber(solverState.biggestAttemptedIncrease).toFixed(3)}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Max Accepted Delta</span>
                <Tooltip content="Largest score increase from an accepted move (local optima escape).">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-orange)' }}>
                {finiteNumber(solverState.biggestAcceptedIncrease).toFixed(3)}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Score Variance</span>
                <Tooltip content="Statistical variance of the score over time.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-accent-rose)' }}>
                {finiteNumber(solverState.scoreVariance).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Current Repetition Penalty</span>
                <Tooltip content="Penalty applied for people who have been in groups together previously.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {finiteNumber(solverState.currentRepetitionPenalty).toFixed(2)}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Current Balance Penalty</span>
                <Tooltip content="Penalty applied for imbalance in group sizes or attribute distribution.">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {finiteNumber(solverState.currentBalancePenalty).toFixed(2)}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="flex items-center space-x-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span>Current Constraint Penalty</span>
                <Tooltip content="Penalty applied for violating hard constraints (e.g., people who must or must not be together).">
                  <Info className="h-3 w-3" />
                </Tooltip>
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {finiteNumber(solverState.currentConstraintPenalty).toFixed(2)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DetailedMetrics;
