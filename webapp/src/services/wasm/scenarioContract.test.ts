import { describe, expect, it } from 'vitest';
import { createSampleScenario } from '../../test/fixtures';
import { normalizeScenarioForWasm } from './scenarioContract';

describe('scenarioContract', () => {
  it('normalizes scenario inputs without mutating the original scenario', () => {
    const scenario = createSampleScenario({
      objectives: [],
      constraints: [
        {
          type: 'ShouldStayTogether',
          people: ['p1', 'p2'],
          penalty_weight: undefined as unknown as number,
          sessions: [1],
        },
        {
          type: 'ImmovablePerson',
          person_id: 'p1',
          group_id: 'g1',
          sessions: [],
        },
        {
          type: 'AttributeBalance',
          group_id: 'g1',
          attribute_key: 'team',
          desired_values: { A: 1 },
          penalty_weight: undefined as unknown as number,
        },
      ],
      settings: {
        ...createSampleScenario().settings,
        allowed_sessions: [0],
        solver_params: {
          SimulatedAnnealing: {
            initial_temperature: Number.NaN,
            final_temperature: Number.NaN,
            cooling_schedule: 'geometric',
            reheat_cycles: Number.NaN,
            reheat_after_no_improvement: Number.NaN,
          },
        },
      },
    });

    const originalSettings = scenario.settings;
    const originalSolverParams = scenario.settings.solver_params;
    const originalConstraint = scenario.constraints[0];
    const originalPeople = scenario.people;
    const originalGroups = scenario.groups;

    const normalized = normalizeScenarioForWasm(scenario) as {
      settings: { solver_params: Record<string, number | string> };
    };

    expect(normalized).not.toBe(scenario);
    expect(normalized.people).not.toBe(originalPeople);
    expect(normalized.groups).not.toBe(originalGroups);
    expect(normalized.constraints).not.toBe(scenario.constraints);
    expect(normalized.constraints[0]).not.toBe(originalConstraint);
    expect(normalized.settings).not.toBe(originalSettings);
    expect(normalized.settings.solver_params).not.toBe(originalSolverParams);

    expect(normalized.objectives).toEqual([{ type: 'maximize_unique_contacts', weight: 1 }]);
    expect(normalized.constraints[0]).toMatchObject({
      type: 'ShouldStayTogether',
      penalty_weight: 1000,
      sessions: [1],
    });
    expect(normalized.constraints[1]).toMatchObject({
      type: 'ImmovablePerson',
      sessions: [0, 1],
    });
    expect(normalized.constraints[2]).toMatchObject({
      type: 'AttributeBalance',
      penalty_weight: 50,
      desired_values: { A: 1 },
    });
    expect(normalized.settings.solver_params.initial_temperature).toBe(1);
    expect(normalized.settings.solver_params.final_temperature).toBe(0.01);
    expect(normalized.settings.solver_params.reheat_cycles).toBe(0);
    expect(normalized.settings.solver_params.reheat_after_no_improvement).toBe(0);

    expect(scenario.objectives).toEqual([]);
    expect(scenario.constraints[0]).toMatchObject({
      type: 'ShouldStayTogether',
      penalty_weight: undefined,
      sessions: [1],
    });
    expect(scenario.constraints[1]).toMatchObject({
      type: 'ImmovablePerson',
      sessions: [],
    });
    expect(scenario.constraints[2]).toMatchObject({
      type: 'AttributeBalance',
      penalty_weight: undefined,
      desired_values: { A: 1 },
    });

    const originalNestedParams =
      scenario.settings.solver_params.SimulatedAnnealing as Record<string, unknown>;
    expect(Number.isNaN(originalNestedParams.initial_temperature)).toBe(true);
    expect(Number.isNaN(originalNestedParams.final_temperature)).toBe(true);
    expect(Number.isNaN(originalNestedParams.reheat_cycles)).toBe(true);
    expect(Number.isNaN(originalNestedParams.reheat_after_no_improvement)).toBe(true);
    expect(scenario.settings.allowed_sessions).toEqual([0]);
  });
});
