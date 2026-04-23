import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../types';
import type { ComplianceCardData } from '../../services/evaluator';
import { countManualEditorHardViolations } from './hardViolationSummary';

const scenario: Scenario = {
  people: [
    { id: 'p1', attributes: { name: 'Alex' } },
    { id: 'p2', attributes: { name: 'Blair' } },
    { id: 'p3', attributes: { name: 'Casey' } },
  ],
  groups: [{ id: 'g1', size: 2 }, { id: 'g2', size: 2 }],
  num_sessions: 2,
  constraints: [],
  settings: {
    solver_type: 'simulated_annealing',
    stop_conditions: {},
    solver_params: {},
  },
};

describe('countManualEditorHardViolations', () => {
  it('counts MustStayApart alongside other hard-constraint violations', () => {
    const compliance = [
      { type: 'MustStayApart', violationsCount: 2 },
      { type: 'ShouldNotBeTogether', violationsCount: 5 },
      { type: 'ImmovablePeople', violationsCount: 1 },
    ] as ComplianceCardData[];

    expect(countManualEditorHardViolations(compliance, {}, scenario)).toBe(3);
  });

  it('adds group-capacity overflow on top of hard constraint counts', () => {
    const compliance = [
      { type: 'MustStayApart', violationsCount: 1 },
    ] as ComplianceCardData[];

    const draftSchedule = {
      0: {
        g1: ['p1', 'p2', 'p3'],
      },
    };

    expect(countManualEditorHardViolations(compliance, draftSchedule, scenario)).toBe(2);
  });
});
