import { describe, expect, it } from 'vitest';
import { createSampleScenario, createSampleSolution } from '../../test/fixtures';
import { buildResultsViewModel } from './buildResultsModel';

describe('buildResultsViewModel', () => {
  it('builds shared session, participant, and summary data from Scenario + Solution', () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();

    const model = buildResultsViewModel(scenario, solution);

    expect(model.summary).toMatchObject({
      totalPeople: 4,
      totalGroups: 2,
      totalSessions: 2,
      totalAssignments: 8,
      totalCapacity: 8,
      openSeats: 0,
    });
    expect(model.sessions).toHaveLength(scenario.num_sessions);
    expect(model.sessions[0].groups[0].id).toBe('g1');
    expect(model.sessions[0].groups[0].people.map((person) => person.id)).toEqual(['p1', 'p2']);
    expect(model.sessions[1].groups[1].people.map((person) => person.id)).toEqual(['p2', 'p4']);

    expect(model.participants).toHaveLength(4);
    expect(model.participants[0]).toMatchObject({
      personId: 'p1',
      displayName: 'Alice',
      assignedSessions: 2,
      unassignedSessions: 0,
    });
    expect(model.participants[0].sessions).toEqual([
      {
        sessionIndex: 0,
        sessionLabel: 'Session 1',
        groupId: 'g1',
        groupSize: 2,
        isAssigned: true,
      },
      {
        sessionIndex: 1,
        sessionLabel: 'Session 2',
        groupId: 'g1',
        groupSize: 2,
        isAssigned: true,
      },
    ]);
  });

  it('tracks open seats and unassigned participant sessions when assignments are partial', () => {
    const scenario = createSampleScenario({
      groups: [{ id: 'g1', size: 3 }],
      num_sessions: 1,
      people: [
        { id: 'p1', name: 'Alice' , attributes: {} },
        { id: 'p2', name: 'Bob' , attributes: {} },
      ],
    });
    const solution = createSampleSolution({
      assignments: [{ person_id: 'p1', group_id: 'g1', session_id: 0 }],
    });

    const model = buildResultsViewModel(scenario, solution);

    expect(model.summary.openSeats).toBe(2);
    expect(model.sessions[0]).toMatchObject({
      totalPeople: 1,
      totalCapacity: 3,
      openSeats: 2,
    });
    expect(model.participants[1]).toMatchObject({
      personId: 'p2',
      assignedSessions: 0,
      unassignedSessions: 1,
    });
    expect(model.participants[1].sessions[0]).toEqual({
      sessionIndex: 0,
      sessionLabel: 'Session 1',
      groupId: null,
      groupSize: null,
      isAssigned: false,
    });
  });
});
