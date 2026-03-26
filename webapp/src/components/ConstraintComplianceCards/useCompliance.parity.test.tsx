import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCompliance } from './useCompliance';
import { evaluateCompliance } from '../../services/evaluator';
import { createSampleScenario, createSampleSolution } from '../../test/fixtures';
import type { Constraint, Scenario, Solution } from '../../types';

function normalizeCards(scenario: Scenario, solution: Solution) {
  const { result } = renderHook(() => useCompliance(scenario, solution));
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

function normalizeEvaluator(scenario: Scenario, solution: Solution) {
  return evaluateCompliance(scenario, solution).map(({ id, title, subtitle, adheres, violationsCount, details, type }) => ({
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
  const scenario = createSampleScenario({ constraints: [constraint] });
  const solution = createSampleSolution(solutionOverrides);
  return { scenario, solution };
}

describe('useCompliance parity with evaluateCompliance', () => {
  it('matches evaluator output for PairMeetingCount constraints', () => {
    const { scenario, solution } = createCase(
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

    expect(normalizeCards(scenario, solution)).toEqual(normalizeEvaluator(scenario, solution));
  });

  it('matches evaluator output for AttributeBalance constraints', () => {
    const { scenario, solution } = createCase(
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

    expect(normalizeCards(scenario, solution)).toEqual(normalizeEvaluator(scenario, solution));
  });

  it('matches evaluator output for MustStayTogether constraints', () => {
    const { scenario, solution } = createCase(
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

    expect(normalizeCards(scenario, solution)).toEqual(normalizeEvaluator(scenario, solution));
  });
});
