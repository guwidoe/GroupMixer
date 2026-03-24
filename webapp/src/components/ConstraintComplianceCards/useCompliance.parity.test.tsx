import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCompliance } from './useCompliance';
import { evaluateCompliance } from '../../services/evaluator';
import { createSampleProblem, createSampleSolution } from '../../test/fixtures';
import type { Constraint, Problem, Solution } from '../../types';

function normalizeCards(problem: Problem, solution: Solution) {
  const { result } = renderHook(() => useCompliance(problem, solution));
  return result.current.map(({ id, title, subtitle, adheres, violationsCount, details, type }) => ({
    id,
    type,
    title,
    subtitle,
    adheres,
    violationsCount,
    details,
  }));
}

function normalizeEvaluator(problem: Problem, solution: Solution) {
  return evaluateCompliance(problem, solution).map(({ id, title, subtitle, adheres, violationsCount, details, type }) => ({
    id,
    type,
    title,
    subtitle,
    adheres,
    violationsCount,
    details,
  }));
}

function createCase(constraint: Constraint, solutionOverrides?: Partial<Solution>) {
  const problem = createSampleProblem({ constraints: [constraint] });
  const solution = createSampleSolution(solutionOverrides);
  return { problem, solution };
}

describe('useCompliance parity with evaluateCompliance', () => {
  it('matches evaluator output for PairMeetingCount constraints', () => {
    const { problem, solution } = createCase(
      {
        type: 'PairMeetingCount',
        people: ['p1', 'p2'],
        sessions: [0, 1],
        target_meetings: 1,
        mode: 'exact',
        penalty_weight: 7,
      },
      {
        assignments: [
          { person_id: 'p1', group_id: 'g1', session_id: 0 },
          { person_id: 'p2', group_id: 'g1', session_id: 0 },
          { person_id: 'p3', group_id: 'g2', session_id: 0 },
          { person_id: 'p4', group_id: 'g2', session_id: 0 },
          { person_id: 'p1', group_id: 'g1', session_id: 1 },
          { person_id: 'p2', group_id: 'g2', session_id: 1 },
          { person_id: 'p3', group_id: 'g1', session_id: 1 },
          { person_id: 'p4', group_id: 'g2', session_id: 1 },
        ],
      },
    );

    expect(normalizeCards(problem, solution)).toEqual(normalizeEvaluator(problem, solution));
  });

  it('matches evaluator output for AttributeBalance constraints', () => {
    const { problem, solution } = createCase(
      {
        type: 'AttributeBalance',
        group_id: 'g1',
        attribute_key: 'team',
        desired_values: { A: 2, B: 0 },
        penalty_weight: 5,
        sessions: [0],
      },
      {
        assignments: [
          { person_id: 'p1', group_id: 'g1', session_id: 0 },
          { person_id: 'p3', group_id: 'g1', session_id: 0 },
          { person_id: 'p2', group_id: 'g2', session_id: 0 },
          { person_id: 'p4', group_id: 'g2', session_id: 0 },
        ],
      },
    );

    expect(normalizeCards(problem, solution)).toEqual(normalizeEvaluator(problem, solution));
  });

  it('matches evaluator output for MustStayTogether constraints', () => {
    const { problem, solution } = createCase(
      {
        type: 'MustStayTogether',
        people: ['p1', 'p2', 'p3'],
        sessions: [0, 1],
      },
      {
        assignments: [
          { person_id: 'p1', group_id: 'g1', session_id: 0 },
          { person_id: 'p2', group_id: 'g2', session_id: 0 },
          { person_id: 'p3', group_id: 'g1', session_id: 0 },
          { person_id: 'p4', group_id: 'g2', session_id: 0 },
          { person_id: 'p1', group_id: 'g1', session_id: 1 },
          { person_id: 'p2', group_id: 'g1', session_id: 1 },
          { person_id: 'p3', group_id: 'g1', session_id: 1 },
          { person_id: 'p4', group_id: 'g2', session_id: 1 },
        ],
      },
    );

    expect(normalizeCards(problem, solution)).toEqual(normalizeEvaluator(problem, solution));
  });
});
