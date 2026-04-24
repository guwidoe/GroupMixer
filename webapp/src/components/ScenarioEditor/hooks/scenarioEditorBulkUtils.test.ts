import { describe, expect, it } from 'vitest';
import { createAttributeDefinition } from '../../../services/scenarioAttributes';
import { createSampleScenario } from '../../../test/fixtures';
import type { AttributeDefinition } from '../../../types';
import { buildPeopleCsvFromCurrent, buildScenarioWithGroups, buildScenarioWithPeople } from './scenarioEditorBulkUtils';

describe('scenarioEditorBulkUtils', () => {
  it('builds a people CSV snapshot with ids, names, and known attributes', () => {
    const scenario = createSampleScenario({
      people: [
        {
          id: 'p1',
          name: 'Ada',
          attributes: { team: 'Blue' },
        },
      ],
    });
    const attributeDefinitions: AttributeDefinition[] = [
      createAttributeDefinition('team', ['Blue'], 'attr-team'),
      createAttributeDefinition('role', ['Speaker'], 'attr-role'),
    ];

    const snapshot = buildPeopleCsvFromCurrent(scenario, attributeDefinitions);

    expect(snapshot.headers).toEqual(['id', 'name', 'team', 'role']);
    expect(snapshot.rows).toEqual([
      { id: 'p1', name: 'Ada', team: 'Blue', role: '' },
    ]);
  });

  it('rebuilds scenario shells with updated people or groups while preserving solver settings', () => {
    const scenario = createSampleScenario();
    const nextPeopleScenario = buildScenarioWithPeople(scenario, []);
    const nextGroupsScenario = buildScenarioWithGroups(scenario, [{ id: 'g-new', size: 5 }]);

    expect(nextPeopleScenario.people).toEqual([]);
    expect(nextPeopleScenario.settings).toEqual(scenario.settings);
    expect(nextGroupsScenario.groups).toEqual([{ id: 'g-new', size: 5 }]);
    expect(nextGroupsScenario.settings).toEqual(scenario.settings);
  });
});
