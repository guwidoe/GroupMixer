import { describe, expect, it } from 'vitest';
import { createSampleScenario } from '../test/fixtures';
import type { Scenario } from '../types';
import { buildSessionReductionInvalidations, planSessionCountReduction } from './sessionCountMigration';

function createScenario(overrides: Partial<Scenario> = {}): Scenario {
  return createSampleScenario({
    num_sessions: 4,
    groups: [
      { id: 'g1', size: 2, session_sizes: [2, 1, 3, 4] },
      { id: 'g2', size: 2 },
    ],
    people: [
      { id: 'p1', attributes: { name: 'Alice' } },
      { id: 'p2', attributes: { name: 'Bob' }, sessions: [1, 2, 3] },
      { id: 'p3', attributes: { name: 'Cara' }, sessions: [3] },
      { id: 'p4', attributes: { name: 'Dan' } },
    ],
    constraints: [],
    settings: {
      ...createSampleScenario().settings,
      allowed_sessions: [1, 2, 3],
    },
    ...overrides,
  });
}

describe('planSessionCountReduction', () => {
  it('truncates group session sizes and scoped session subsets when reduction is safe', () => {
    const scenario = createScenario({
      constraints: [
        { type: 'MustStayApart', people: ['p1', 'p2'], sessions: [1, 2, 3] },
        { type: 'ShouldStayTogether', people: ['p2', 'p4'], sessions: [0, 2, 3], penalty_weight: 10 },
      ],
      people: [
        { id: 'p1', attributes: { name: 'Alice' } },
        { id: 'p2', attributes: { name: 'Bob' }, sessions: [0, 1, 2] },
        { id: 'p3', attributes: { name: 'Cara' } },
        { id: 'p4', attributes: { name: 'Dan' } },
      ],
    });

    const plan = planSessionCountReduction({ scenario, nextSessionCount: 3 });

    expect(plan.canApply).toBe(true);
    expect(plan.blockers).toEqual([]);
    expect(plan.nextScenario).not.toBeNull();
    expect(plan.nextScenario?.num_sessions).toBe(3);
    expect(plan.nextScenario?.groups[0].session_sizes).toEqual([2, 1, 3]);
    expect(plan.nextScenario?.people[1].sessions).toEqual([0, 1, 2]);
    expect(plan.nextScenario?.constraints).toEqual([
      { type: 'MustStayApart', people: ['p1', 'p2'], sessions: [1, 2] },
      { type: 'ShouldStayTogether', people: ['p2', 'p4'], sessions: [0, 2], penalty_weight: 10 },
    ]);
    expect(plan.nextScenario?.settings.allowed_sessions).toEqual([1, 2]);
    expect(plan.summary.groupsTrimmed).toBe(1);
    expect(plan.summary.constraintsTrimmed).toBe(2);
    expect(plan.summary.allowedSessionsTrimmed).toBe(true);
  });

  it('removes scoped constraints that only apply to deleted sessions instead of broadening them', () => {
    const scenario = createScenario({
      constraints: [
        { type: 'MustStayApart', people: ['p1', 'p2'], sessions: [3] },
      ],
      settings: createScenario().settings,
      people: [
        { id: 'p1', attributes: { name: 'Alice' } },
        { id: 'p2', attributes: { name: 'Bob' }, sessions: [0, 1, 2] },
        { id: 'p3', attributes: { name: 'Cara' } },
        { id: 'p4', attributes: { name: 'Dan' } },
      ],
    });

    const plan = planSessionCountReduction({ scenario, nextSessionCount: 3 });

    expect(plan.canApply).toBe(true);
    expect(plan.nextScenario?.constraints).toEqual([]);
    expect(plan.summary.constraintsRemoved).toBe(1);
    expect(plan.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'constraint-removed',
          title: 'Must stay apart (p1, p2)',
        }),
      ]),
    );
  });

  it('blocks reduction when a person would lose all remaining sessions', () => {
    const scenario = createScenario({
      constraints: [],
      settings: createSampleScenario().settings,
    });

    const plan = planSessionCountReduction({ scenario, nextSessionCount: 3 });

    expect(plan.canApply).toBe(false);
    expect(plan.nextScenario).toBeNull();
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'person-loses-all-sessions',
          title: 'Person p3',
        }),
      ]),
    );
  });

  it('blocks reduction when PairMeetingCount target exceeds the remaining scoped sessions', () => {
    const scenario = createScenario({
      constraints: [
        {
          type: 'PairMeetingCount',
          people: ['p1', 'p2'],
          sessions: [2, 3],
          target_meetings: 2,
          penalty_weight: 5,
          mode: 'exact',
        },
      ],
      settings: createSampleScenario().settings,
      people: [
        { id: 'p1', attributes: { name: 'Alice' } },
        { id: 'p2', attributes: { name: 'Bob' }, sessions: [0, 1, 2] },
        { id: 'p3', attributes: { name: 'Cara' } },
        { id: 'p4', attributes: { name: 'Dan' } },
      ],
    });

    const plan = planSessionCountReduction({ scenario, nextSessionCount: 3 });

    expect(plan.canApply).toBe(false);
    expect(plan.summary.pairMeetingConstraintsNeedingReview).toBe(1);
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'pair-meeting-target-invalid',
          title: 'Pair meeting count (p1, p2)',
        }),
      ]),
    );
  });

  it('blocks reduction when solver allowed sessions would become empty', () => {
    const scenario = createScenario({
      constraints: [],
      settings: {
        ...createSampleScenario().settings,
        allowed_sessions: [3],
      },
      people: [
        { id: 'p1', attributes: { name: 'Alice' } },
        { id: 'p2', attributes: { name: 'Bob' }, sessions: [0, 1, 2] },
        { id: 'p3', attributes: { name: 'Cara' } },
        { id: 'p4', attributes: { name: 'Dan' } },
      ],
    });

    const plan = planSessionCountReduction({ scenario, nextSessionCount: 3 });

    expect(plan.canApply).toBe(false);
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'allowed-sessions-empty',
          title: 'Allowed solver sessions',
        }),
      ]),
    );
  });

  it('describes runtime/editor state that must be invalidated after confirmation', () => {
    expect(buildSessionReductionInvalidations({
      hasActiveSolution: true,
      hasWarmStartSelection: true,
      hasManualEditorState: true,
    })).toEqual([
      expect.objectContaining({ kind: 'active-solution' }),
      expect.objectContaining({ kind: 'warm-start-selection' }),
      expect.objectContaining({ kind: 'manual-editor-state' }),
    ]);
  });
});
