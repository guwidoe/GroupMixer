import { describe, expect, it } from 'vitest';
import { stagePersonMove, findAssignedGroup } from './dropPipeline';
import { createSampleSolution } from '../../test/fixtures';
import { groupBySessionAndGroup } from './utils';

describe('dropPipeline', () => {
  it('finds the currently assigned group for a person in a session', () => {
    const schedule = groupBySessionAndGroup(createSampleSolution().assignments);

    expect(findAssignedGroup(schedule, 0, 'p1')).toBe('g1');
    expect(findAssignedGroup(schedule, 1, 'p2')).toBe('g2');
  });

  it('stages a move by replacing the session assignment for the moved person only', () => {
    const assignments = createSampleSolution().assignments;

    const staged = stagePersonMove(assignments, 'p1', 'g2', 0);

    expect(staged.filter((assignment) => assignment.person_id === 'p1' && assignment.session_id === 0)).toEqual([
      { person_id: 'p1', group_id: 'g2', session_id: 0 },
    ]);
    expect(staged.filter((assignment) => assignment.person_id === 'p1' && assignment.session_id === 1)).toEqual([
      { person_id: 'p1', group_id: 'g1', session_id: 1 },
    ]);
    expect(staged).toHaveLength(assignments.length);
  });
});
