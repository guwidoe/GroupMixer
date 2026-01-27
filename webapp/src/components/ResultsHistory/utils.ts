import type { ProblemResult } from '../../types';
import { compareProblemConfigurations } from '../../services/problemStorage';
import { snapshotToProblem } from '../../utils/problemSnapshot';

export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function formatNumber(num: number | undefined) {
  if (num === undefined) return 'N/A';
  if (num < 0.001 && num !== 0) {
    return num.toExponential(2);
  }
  return num.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  });
}

export function formatLargeNumber(num: number | undefined) {
  if (num === undefined) return 'N/A';
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

export function isSameConfig(resultA: ProblemResult | null, resultB: ProblemResult | null): boolean {
  if (!resultA || !resultB) return false;
  if (!resultA.problemSnapshot || !resultB.problemSnapshot) return false;
  const a = snapshotToProblem(resultA.problemSnapshot, resultA.solverSettings);
  const b = snapshotToProblem(resultB.problemSnapshot, resultB.solverSettings);
  const diff = compareProblemConfigurations(a, b);
  return !diff.isDifferent;
}

export function getBestResult(results: ProblemResult[], mostRecentResult: ProblemResult | null) {
  if (!results.length || !mostRecentResult) return null;
  const comparableResults = results.filter(r => isSameConfig(r, mostRecentResult));
  if (!comparableResults.length) return null;
  return comparableResults.reduce((best, current) =>
    current.solution.final_score < best.solution.final_score ? current : best
  );
}

export function getScoreColor(
  score: number,
  result: ProblemResult,
  results: ProblemResult[],
  mostRecentResult: ProblemResult | null
) {
  if (!results.length) return 'text-gray-600';
  const comparableResults = results.filter(r => isSameConfig(r, result));
  if (comparableResults.length <= 1) return 'text-gray-600';
  if (!isSameConfig(result, mostRecentResult)) return 'text-gray-600';
  const scores = comparableResults.map(r => r.solution.final_score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (min === max) return 'text-green-600';
  const ratio = (score - min) / (max - min);
  if (ratio <= 0.15) return 'text-green-600';
  if (ratio <= 0.35) return 'text-lime-600';
  if (ratio <= 0.6) return 'text-yellow-600';
  if (ratio <= 0.85) return 'text-orange-600';
  return 'text-red-600';
}
