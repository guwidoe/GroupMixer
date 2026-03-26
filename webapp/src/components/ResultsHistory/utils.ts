import type { ScenarioResult } from '../../types';
import { compareScenarioConfigurations } from '../../services/scenarioStorage';
import { snapshotToScenario } from '../../utils/scenarioSnapshot';

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

export function isSameConfig(resultA: ScenarioResult | null, resultB: ScenarioResult | null): boolean {
  if (!resultA || !resultB) return false;
  if (!resultA.scenarioSnapshot || !resultB.scenarioSnapshot) return false;
  const a = snapshotToScenario(resultA.scenarioSnapshot, resultA.solverSettings);
  const b = snapshotToScenario(resultB.scenarioSnapshot, resultB.solverSettings);
  const diff = compareScenarioConfigurations(a, b);
  return !diff.isDifferent;
}

export function getBestResult(results: ScenarioResult[], mostRecentResult: ScenarioResult | null) {
  if (!results.length || !mostRecentResult) return null;
  const comparableResults = results.filter(r => isSameConfig(r, mostRecentResult));
  if (!comparableResults.length) return null;
  return comparableResults.reduce((best, current) =>
    current.solution.final_score < best.solution.final_score ? current : best
  );
}

export function getScoreColor(
  score: number,
  result: ScenarioResult,
  results: ScenarioResult[],
  mostRecentResult: ScenarioResult | null
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
