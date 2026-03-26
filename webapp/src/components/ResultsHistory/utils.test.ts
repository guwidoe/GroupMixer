import { describe, expect, it } from 'vitest';
import type { ProblemResult } from '../../types';
import { createSampleProblem, createSampleSolution } from '../../test/fixtures';
import { formatDuration, formatLargeNumber, getBestResult, getScoreColor, isSameConfig } from './utils';

function createResult(overrides: Partial<ProblemResult> = {}): ProblemResult {
  const problem = createSampleProblem();

  return {
    id: overrides.id ?? 'result',
    name: overrides.name ?? 'Result',
    solution: overrides.solution ?? createSampleSolution(),
    solverSettings: overrides.solverSettings ?? problem.settings,
    problemSnapshot:
      overrides.problemSnapshot ?? {
        people: problem.people,
        groups: problem.groups,
        num_sessions: problem.num_sessions,
        objectives: problem.objectives,
        constraints: problem.constraints,
      },
    timestamp: overrides.timestamp ?? 1000,
    duration: overrides.duration ?? 1200,
  };
}

describe('ResultsHistory utils', () => {
  it('treats matching snapshots as the same configuration', () => {
    const a = createResult({ id: 'a' });
    const b = createResult({ id: 'b', timestamp: 2000 });

    expect(isSameConfig(a, b)).toBe(true);
  });

  it('finds the best comparable result relative to the most recent result', () => {
    const comparableBest = createResult({
      id: 'best',
      solution: createSampleSolution({ final_score: 4 }),
      timestamp: 1000,
    });
    const comparableRecent = createResult({
      id: 'recent',
      solution: createSampleSolution({ final_score: 10 }),
      timestamp: 3000,
    });
    const incomparable = createResult({
      id: 'other-config',
      problemSnapshot: {
        ...createResult().problemSnapshot!,
        groups: [{ id: 'g1', size: 4 }],
      },
      solution: createSampleSolution({ final_score: 1 }),
      timestamp: 2000,
    });

    const results = [comparableBest, incomparable, comparableRecent];

    expect(getBestResult(results, comparableRecent)?.id).toBe('best');
  });

  it('returns a neutral score color for incomparable results', () => {
    const recent = createResult({ id: 'recent', timestamp: 3000 });
    const incomparable = createResult({
      id: 'other-config',
      problemSnapshot: {
        ...recent.problemSnapshot!,
        num_sessions: 3,
      },
      solution: createSampleSolution({ final_score: 2 }),
    });

    expect(getScoreColor(incomparable.solution.final_score, incomparable, [recent, incomparable], recent)).toBe('text-gray-600');
  });

  it('colors the best comparable result green and the worst red', () => {
    const best = createResult({ id: 'best', solution: createSampleSolution({ final_score: 2 }), timestamp: 1000 });
    const middle = createResult({ id: 'middle', solution: createSampleSolution({ final_score: 6 }), timestamp: 2000 });
    const worst = createResult({ id: 'worst', solution: createSampleSolution({ final_score: 10 }), timestamp: 3000 });
    const results = [best, middle, worst];

    expect(getScoreColor(best.solution.final_score, best, results, worst)).toBe('text-green-600');
    expect(getScoreColor(worst.solution.final_score, worst, results, worst)).toBe('text-red-600');
  });

  it('formats durations and large numbers for result summaries', () => {
    expect(formatDuration(950)).toBe('950ms');
    expect(formatDuration(2300)).toBe('2.3s');
    expect(formatLargeNumber(1250)).toBe('1.3K');
    expect(formatLargeNumber(2_500_000)).toBe('2.5M');
  });
});
