import { describe, expect, it } from 'vitest';
import { createSampleProblem } from '../../../test/fixtures';
import type { AttributeDefinition } from '../../../types';
import { buildPeopleCsvFromCurrent, buildProblemWithGroups, buildProblemWithPeople } from './problemEditorBulkUtils';

describe('problemEditorBulkUtils', () => {
  it('builds a people CSV snapshot with ids, names, and known attributes', () => {
    const problem = createSampleProblem({
      people: [
        {
          id: 'p1',
          attributes: { name: 'Ada', team: 'Blue' },
        },
      ],
    });
    const attributeDefinitions: AttributeDefinition[] = [
      { key: 'team', values: ['Blue'] },
      { key: 'role', values: ['Speaker'] },
    ];

    const snapshot = buildPeopleCsvFromCurrent(problem, attributeDefinitions);

    expect(snapshot.headers).toEqual(['id', 'name', 'team', 'role']);
    expect(snapshot.rows).toEqual([
      { id: 'p1', name: 'Ada', team: 'Blue', role: '' },
    ]);
  });

  it('rebuilds problem shells with updated people or groups while preserving solver settings', () => {
    const problem = createSampleProblem();
    const nextPeopleProblem = buildProblemWithPeople(problem, []);
    const nextGroupsProblem = buildProblemWithGroups(problem, [{ id: 'g-new', size: 5 }]);

    expect(nextPeopleProblem.people).toEqual([]);
    expect(nextPeopleProblem.settings).toEqual(problem.settings);
    expect(nextGroupsProblem.groups).toEqual([{ id: 'g-new', size: 5 }]);
    expect(nextGroupsProblem.settings).toEqual(problem.settings);
  });
});
