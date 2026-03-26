import { describe, expect, it } from 'vitest';
import { createSampleScenario, createSampleSolution } from '../test/fixtures';
import { buildScheduleMap, computeUniqueContacts, evaluateCompliance } from './evaluator';

describe('evaluator', () => {
  it('builds a schedule map grouped by session and group', () => {
    const solution = createSampleSolution();

    expect(buildScheduleMap(solution.assignments)).toEqual({
      0: { g1: ['p1', 'p2'], g2: ['p3', 'p4'] },
      1: { g1: ['p1', 'p3'], g2: ['p2', 'p4'] },
    });
  });

  it('computes deduplicated unique contacts and average contacts per person', () => {
    const solution = createSampleSolution();

    expect(computeUniqueContacts(solution.assignments, 4)).toEqual({
      uniqueContacts: 4,
      avgUniqueContacts: 2,
    });
  });

  it('reports direct repeat-encounter and separation violations', () => {
    const solution = createSampleSolution();
    const scenario = createSampleScenario({
      constraints: [
        {
          type: 'RepeatEncounter',
          max_allowed_encounters: 0,
          penalty_function: 'squared',
          penalty_weight: 1,
        },
        {
          type: 'ShouldNotBeTogether',
          people: ['p1', 'p2'],
          penalty_weight: 5,
          sessions: [0],
        },
      ],
    });

    const cards = evaluateCompliance(scenario, solution);

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      type: 'RepeatEncounter',
      adheres: false,
      violationsCount: 4,
    });
    expect(cards[0].details).toContainEqual(
      expect.objectContaining({
        kind: 'RepeatEncounter',
        pair: ['p1', 'p2'],
        count: 1,
      }),
    );

    expect(cards[1]).toMatchObject({
      type: 'ShouldNotBeTogether',
      adheres: false,
      violationsCount: 1,
    });
    expect(cards[1].details).toContainEqual(
      expect.objectContaining({
        kind: 'NotTogether',
        session: 0,
        groupId: 'g1',
        people: ['p1', 'p2'],
      }),
    );
  });
});
