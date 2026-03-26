import { describe, expect, it } from 'vitest';
import { createSampleScenario, createSampleSolution } from '../../test/fixtures';
import { buildResultsSessionData } from './buildResultsViewModel';

describe('buildResultsSessionData', () => {
  it('builds reusable session/group view data from Scenario + Solution', () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();

    const sessionData = buildResultsSessionData(scenario, solution);

    expect(sessionData).toHaveLength(scenario.num_sessions);
    expect(sessionData[0].groups[0].id).toBe('g1');
    expect(sessionData[0].groups[0].people.map((person) => person.id)).toEqual(['p1', 'p2']);
    expect(sessionData[1].groups[1].people.map((person) => person.id)).toEqual(['p2', 'p4']);
  });
});
