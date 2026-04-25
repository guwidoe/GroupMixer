import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../types';
import { canDrop } from './moveUtils';

const scenario: Scenario = {
  people: [
    { id: 'p1', name: 'Alex' , attributes: {} },
    { id: 'p2', name: 'Blair' , attributes: {} },
    { id: 'p3', name: 'Casey' , attributes: {} },
  ],
  groups: [{ id: 'g1', size: 3 }, { id: 'g2', size: 3 }],
  num_sessions: 2,
  constraints: [],
  settings: {
    solver_type: 'simulated_annealing',
    stop_conditions: {},
    solver_params: {},
  },
};

describe('canDrop', () => {
  it('blocks strict drops that would violate MustStayApart in the active session', () => {
    const result = canDrop({
      effectiveScenario: {
        ...scenario,
        constraints: [{ type: 'MustStayApart', people: ['p1', 'p2'], sessions: [0] }],
      },
      draftSchedule: {
        0: { g1: ['p2'] },
      },
      lockedPeople: new Set(),
      lockedGroups: new Set(),
      mode: 'strict',
      personId: 'p1',
      targetGroupId: 'g1',
      sessionId: 0,
    });

    expect(result).toEqual({ ok: false, reason: 'Must-stay-apart constraint' });
  });

  it('allows the same drop when the MustStayApart scope does not include the session', () => {
    const result = canDrop({
      effectiveScenario: {
        ...scenario,
        constraints: [{ type: 'MustStayApart', people: ['p1', 'p2'], sessions: [1] }],
      },
      draftSchedule: {
        0: { g1: ['p2'] },
      },
      lockedPeople: new Set(),
      lockedGroups: new Set(),
      mode: 'strict',
      personId: 'p1',
      targetGroupId: 'g1',
      sessionId: 0,
    });

    expect(result).toEqual({ ok: true });
  });
});
