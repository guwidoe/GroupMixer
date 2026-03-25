import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SolverState } from '../../types';
import DetailedMetrics from './DetailedMetrics';

function createSolverState(overrides: Partial<SolverState> = {}): SolverState {
  return {
    isRunning: true,
    isComplete: false,
    currentIteration: 0,
    bestScore: 0,
    elapsedTime: 0,
    noImprovementCount: 0,
    ...overrides,
  };
}

describe('DetailedMetrics', () => {
  it('does not render NaN or Infinity when solver metrics contain non-finite values', () => {
    const { container } = render(
      <DetailedMetrics
        solverState={createSolverState({
          temperature: Number.NaN,
          avgAttemptedMoveDelta: Number.POSITIVE_INFINITY,
          biggestAttemptedIncrease: Number.POSITIVE_INFINITY,
        })}
        showMetrics={true}
        onToggleMetrics={() => {}}
        formatIterationTime={() => '0.00 ns'}
      />,
    );

    expect(container).not.toHaveTextContent('NaN');
    expect(container).not.toHaveTextContent('Infinity');
  });
});
