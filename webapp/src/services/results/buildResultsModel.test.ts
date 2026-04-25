import { describe, expect, it } from 'vitest';
import { createSampleScenario, createSampleSolution } from '../../test/fixtures';
import { buildResultsPairMeetingRows, buildResultsViewModel } from './buildResultsModel';

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

    expect(model.pairMeetingMatrix.maxCount).toBe(1);
    expect(model.pairMeetingMatrix.totalPairMeetings).toBe(4);
    expect(model.pairMeetingMatrix.cellsByPair.size).toBe(4);

    const rows = buildResultsPairMeetingRows(model.pairMeetingMatrix);
    expect(rows[1].cells[0]).toMatchObject({
      rowPersonId: 'p2',
      columnPersonId: 'p1',
      count: 1,
      sessionIndexes: [0],
    });
    expect(rows[2].cells[0]).toMatchObject({
      rowPersonId: 'p3',
      columnPersonId: 'p1',
      count: 1,
      sessionIndexes: [1],
    });
    expect(rows[2].cells[1]).toMatchObject({
      rowPersonId: 'p3',
      columnPersonId: 'p2',
      count: 0,
      sessionIndexes: [],
    });
    expect(rows[0].cells[0]).toBeNull();
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

  it('annotates pair meeting cells with together and apart constraints', () => {
    const scenario = createSampleScenario({
      constraints: [
        { type: 'MustStayTogether', people: ['p1', 'p2'], sessions: [0] },
        { type: 'MustStayApart', people: ['p2', 'p3'] },
        { type: 'ShouldStayTogether', people: ['p1', 'p3'], sessions: [1], penalty_weight: 4 },
        { type: 'ShouldNotBeTogether', people: ['p3', 'p4'], penalty_weight: 7 },
      ],
    });

    const model = buildResultsViewModel(scenario, createSampleSolution());
    const rows = buildResultsPairMeetingRows(model.pairMeetingMatrix);

    expect(model.pairMeetingMatrix.annotatedPairCount).toBe(4);
    expect(rows[1].cells[0]?.annotations).toEqual([
      {
        kind: 'must-together',
        label: 'Keep together',
        intent: 'together',
        strength: 'required',
        sessions: [0],
      },
    ]);
    expect(rows[2].cells[1]?.annotations[0]).toMatchObject({
      kind: 'must-apart',
      label: 'Keep apart',
      intent: 'apart',
      strength: 'required',
      sessions: [0, 1],
    });
    expect(rows[2].cells[0]?.annotations[0]).toMatchObject({
      kind: 'prefer-together',
      penaltyWeight: 4,
    });
    expect(rows[3].cells[2]?.annotations[0]).toMatchObject({
      kind: 'prefer-apart',
      penaltyWeight: 7,
    });
  });

  it('derives pair-local objective cost from repeat and soft pair constraints', () => {
    const scenario = createSampleScenario({
      constraints: [
        { type: 'RepeatEncounter', max_allowed_encounters: 1, penalty_function: 'squared', penalty_weight: 10 },
        { type: 'ShouldNotBeTogether', people: ['p1', 'p2'], penalty_weight: 4 },
        { type: 'ShouldStayTogether', people: ['p1', 'p3'], penalty_weight: 5 },
        { type: 'PairMeetingCount', people: ['p2', 'p3'], target_meetings: 1, mode: 'at_least', penalty_weight: 7 },
      ],
    });
    const solution = createSampleSolution({
      assignments: [
        { person_id: 'p1', group_id: 'g1', session_id: 0 },
        { person_id: 'p2', group_id: 'g1', session_id: 0 },
        { person_id: 'p3', group_id: 'g2', session_id: 0 },
        { person_id: 'p4', group_id: 'g2', session_id: 0 },
        { person_id: 'p1', group_id: 'g1', session_id: 1 },
        { person_id: 'p2', group_id: 'g1', session_id: 1 },
        { person_id: 'p3', group_id: 'g2', session_id: 1 },
        { person_id: 'p4', group_id: 'g2', session_id: 1 },
      ],
    });

    const model = buildResultsViewModel(scenario, solution);
    const rows = buildResultsPairMeetingRows(model.pairMeetingMatrix);

    expect(rows[1].cells[0]?.objectiveCost).toBe(18);
    expect(rows[1].cells[0]?.objectiveCostItems.map((item) => item.label)).toEqual([
      'Repeat encounter',
      'Prefer apart',
    ]);
    expect(rows[2].cells[0]?.objectiveCost).toBe(10);
    expect(rows[2].cells[0]?.objectiveCostItems[0]).toMatchObject({
      label: 'Prefer together',
      amount: 10,
    });
    expect(rows[2].cells[1]?.objectiveCost).toBe(7);
    expect(rows[2].cells[1]?.objectiveCostItems[0]).toMatchObject({
      label: 'Meeting target',
      amount: 7,
    });
  });
});
