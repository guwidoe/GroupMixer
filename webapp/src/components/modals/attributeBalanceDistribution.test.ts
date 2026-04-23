import { describe, expect, it } from 'vitest';
import { createAttributeDefinition } from '../../services/scenarioAttributes';
import { DISTRIBUTION_UNALLOCATED_KEY } from '../ui';
import {
  apportionCountsByLargestRemainder,
  buildSuggestedAttributeDistribution,
  resolveGroupCapacityForSessions,
} from './attributeBalanceDistribution';

describe('attributeBalanceDistribution helpers', () => {
  it('uses the smallest selected-session capacity and reports variance', () => {
    expect(
      resolveGroupCapacityForSessions(
        { id: 'g1', size: 6, session_sizes: [5, 3, 4] },
        [0, 2],
      ),
    ).toEqual({
      capacity: 4,
      capacities: [5, 4],
      hasVariance: true,
    });
  });

  it('apportions counts deterministically with largest remainder', () => {
    expect(
      apportionCountsByLargestRemainder(
        { female: 3, male: 1, [DISTRIBUTION_UNALLOCATED_KEY]: 1 },
        ['female', 'male', DISTRIBUTION_UNALLOCATED_KEY],
        2,
      ),
    ).toEqual({
      female: 1,
      male: 1,
      [DISTRIBUTION_UNALLOCATED_KEY]: 0,
    });
  });

  it('includes missing attribute assignments in the not-allocated source mix', () => {
    const attributeDefinition = createAttributeDefinition('gender', ['female', 'male'], 'attr-gender');

    expect(
      buildSuggestedAttributeDistribution({
        people: [
          { id: 'p1', attributes: { name: 'Alex', gender: 'female' }, sessions: [0] },
          { id: 'p2', attributes: { name: 'Blair', gender: 'female' }, sessions: [0] },
          { id: 'p3', attributes: { name: 'Casey', gender: 'male' }, sessions: [0] },
          { id: 'p4', attributes: { name: 'Drew' }, sessions: [0] },
          { id: 'p5', attributes: { name: 'Elliot' }, sessions: [0] },
          { id: 'p6', attributes: { name: 'Finley', gender: 'female' }, sessions: [1] },
        ],
        attributeDefinition,
        attributeDefinitions: [attributeDefinition],
        sessions: [0],
        capacity: 3,
      }),
    ).toEqual({
      female: 1,
      male: 1,
    });
  });
});
