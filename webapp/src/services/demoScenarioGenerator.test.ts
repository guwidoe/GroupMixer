import { describe, expect, it } from 'vitest';
import { createGeneratedDemoScenario, formatGeneratedDemoScenarioName } from './demoScenarioGenerator';

describe('demoScenarioGenerator', () => {
  it('builds a random scenario with the requested workshop shape and only the repeat encounter constraint', () => {
    const scenario = createGeneratedDemoScenario({
      groupCount: 5,
      peoplePerGroup: 3,
      sessionCount: 4,
    });

    expect(scenario.groups).toHaveLength(5);
    expect(scenario.groups.every((group) => group.size === 3)).toBe(true);
    expect(scenario.people).toHaveLength(15);
    expect(scenario.num_sessions).toBe(4);
    expect(scenario.constraints).toEqual([
      {
        type: 'RepeatEncounter',
        max_allowed_encounters: 1,
        penalty_function: 'squared',
        penalty_weight: 10,
      },
    ]);

    const personNames = scenario.people.map((person) => person.name);
    expect(new Set(personNames).size).toBe(personNames.length);

    const groupNames = scenario.groups.map((group) => group.id);
    expect(new Set(groupNames).size).toBe(groupNames.length);
  });

  it('keeps generated names unique for larger workshop sizes', () => {
    const scenario = createGeneratedDemoScenario({
      groupCount: 60,
      peoplePerGroup: 8,
      sessionCount: 6,
    });

    const personNames = scenario.people.map((person) => person.name);
    const groupNames = scenario.groups.map((group) => group.id);

    expect(personNames).toHaveLength(480);
    expect(new Set(personNames).size).toBe(480);
    expect(new Set(groupNames).size).toBe(60);
  });

  it('formats a readable generated scenario label', () => {
    expect(formatGeneratedDemoScenarioName({ groupCount: 7, peoplePerGroup: 4, sessionCount: 5 })).toBe(
      'Random Demo (7 groups × 4 people, 5 sessions)',
    );
  });
});
