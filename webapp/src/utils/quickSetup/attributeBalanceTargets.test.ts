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
      'Group 1': { Female: 1, Male: 1 },
      'Group 2': { Female: 1, Male: 1 },
      'Group 3': { Female: 0, Male: 2 },
    });
  });

  it('never allocates more attribute values to a group than its size', () => {
    const targets = deriveBalancedTargetValues(
      [
        { id: 'P1', attributes: { department: 'Design' } },
        { id: 'P2', attributes: { department: 'Engineering' } },
        { id: 'P3', attributes: { department: 'Finance' } },
        { id: 'P4', attributes: { department: 'HR' } },
        { id: 'P5', attributes: { department: 'Marketing' } },
        { id: 'P6', attributes: { department: 'Operations' } },
        { id: 'P7', attributes: { department: 'Sales' } },
        { id: 'P8', attributes: { department: 'Design' } },
        { id: 'P9', attributes: { department: 'Engineering' } },
        { id: 'P10', attributes: { department: 'Finance' } },
        { id: 'P11', attributes: { department: 'HR' } },
        { id: 'P12', attributes: { department: 'Marketing' } },
      ],
      [
        { id: 'Group 1', size: 3 },
        { id: 'Group 2', size: 3 },
        { id: 'Group 3', size: 3 },
        { id: 'Group 4', size: 3 },
      ],
      'department',
    );

    expect(Object.values(targets).map((groupTargets) => Object.values(groupTargets).reduce((sum, count) => sum + count, 0))).toEqual([3, 3, 3, 3]);
  });

  it('balances remainder distribution without over- or under-allocating groups', () => {
    const targets = deriveBalancedTargetValues(
      [
        { id: 'Ada', attributes: { gender: 'Female' } },
        { id: 'Grace', attributes: { gender: 'Female' } },
        { id: 'Marie', attributes: { gender: 'Female' } },
        { id: 'Linus', attributes: { gender: 'Male' } },
        { id: 'Margaret', attributes: { gender: 'Male' } },
        { id: 'Ken', attributes: { gender: 'Male' } },
        { id: 'Leslie', attributes: { gender: 'Male' } },
        { id: 'Donald', attributes: { gender: 'Male' } },
      ],
      [
        { id: 'Group 1', size: 4 },
        { id: 'Group 2', size: 4 },
      ],
      'gender',
    );

    expect(targets).toEqual({
      'Group 1': { Female: 2, Male: 2 },
      'Group 2': { Female: 1, Male: 3 },
    });
  });
});
