import { describe, expect, it } from 'vitest';
import {
  deriveBalancedTargetValues,
  setBalanceAttributeTargets,
} from './attributeBalanceTargets';

describe('attributeBalanceTargets', () => {
  it('replaces targets for one attribute without disturbing others', () => {
    const nextTargets = setBalanceAttributeTargets(
      {
        gender: {
          'Group 1': { Female: 2, Male: 1 },
        },
        role: {
          'Group 1': { Engineer: 1, Designer: 2 },
        },
      },
      'gender',
      {
        'Group 1': { Female: 1.8, Male: 1.2 },
        'Group 2': { Female: 1, Male: 2 },
      },
    );

    expect(nextTargets).toEqual({
      gender: {
        'Group 1': { Female: 2, Male: 1 },
        'Group 2': { Female: 1, Male: 2 },
      },
      role: {
        'Group 1': { Engineer: 1, Designer: 2 },
      },
    });
  });

  it('derives fair group targets for a single attribute', () => {
    const targets = deriveBalancedTargetValues(
      [
        { id: 'Ada', attributes: { gender: 'Female' } },
        { id: 'Grace', attributes: { gender: 'Female' } },
        { id: 'Linus', attributes: { gender: 'Male' } },
        { id: 'Margaret', attributes: { gender: 'Male' } },
        { id: 'Ken', attributes: { gender: 'Male' } },
        { id: 'Leslie', attributes: { gender: 'Male' } },
      ],
      [
        { id: 'Group 1', size: 2 },
        { id: 'Group 2', size: 2 },
        { id: 'Group 3', size: 2 },
      ],
      'gender',
    );

    expect(targets).toEqual({
      'Group 1': { Female: 1, Male: 2 },
      'Group 2': { Female: 1, Male: 1 },
      'Group 3': { Female: 0, Male: 1 },
    });
  });
});
