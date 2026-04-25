import type { Person, Scenario, Solution } from '../../types';
import { getPersonDisplayName } from '../scenarioAttributes';
import { getEffectiveGroupCapacity } from '../../utils/groupCapacities';
import { buildPairObjectiveCostCandidateKeys, buildPairObjectiveCostItems } from './pairObjectiveCost';

export interface ResultsSessionGroupData {
  id: string;
  size: number;
  people: Person[];
  assignedCount: number;
  openSeats: number;
  fillRatio: number;
}

export interface ResultsSessionData {
  sessionIndex: number;
  label: string;
  groups: ResultsSessionGroupData[];
  totalPeople: number;
  totalCapacity: number;
  openSeats: number;
}

export interface ResultsParticipantSessionAssignment {
  sessionIndex: number;
  sessionLabel: string;
  groupId: string | null;
  groupSize: number | null;
  isAssigned: boolean;
}

export interface ResultsParticipantData {
  personId: string;
  displayName: string;
  person: Person;
  sessions: ResultsParticipantSessionAssignment[];
  assignedSessions: number;
  unassignedSessions: number;
}

export interface ResultsSummaryData {
  totalPeople: number;
  totalGroups: number;
  totalSessions: number;
  totalAssignments: number;
  totalCapacity: number;
  openSeats: number;
  averageFillPercent: number;
}

export interface ResultsPairMeetingParticipant {
  personId: string;
  displayName: string;
  person: Person;
}

export interface ResultsPairMeetingCell {
  rowPersonId: string;
  rowDisplayName: string;
  columnPersonId: string;
  columnDisplayName: string;
  count: number;
  sessionIndexes: number[];
  annotations: ResultsPairMeetingAnnotation[];
  objectiveCost: number;
  objectiveCostItems: ResultsPairMeetingCostItem[];
}

export interface ResultsPairMeetingCostItem {
  label: string;
  amount: number;
  detail: string;
}

export interface ResultsPairMeetingAnnotation {
  kind: 'must-together' | 'must-apart' | 'prefer-together' | 'prefer-apart';
  label: string;
  intent: 'together' | 'apart';
  strength: 'required' | 'preferred';
  sessions: number[];
  penaltyWeight?: number;
}

export interface ResultsPairMeetingRow {
  personId: string;
  displayName: string;
  person: Person;
  cells: Array<ResultsPairMeetingCell | null>;
}

export interface ResultsPairMeetingMatrix {
  participants: ResultsPairMeetingParticipant[];
  cellsByPair: Map<string, ResultsPairMeetingCell>;
  maxCount: number;
  totalPairMeetings: number;
  annotatedPairCount: number;
  repeatedPairCount: number;
  attentionPairCount: number;
}

export interface ResultsViewModel {
  summary: ResultsSummaryData;
  sessions: ResultsSessionData[];
  participants: ResultsParticipantData[];
  pairMeetingMatrix: ResultsPairMeetingMatrix;
}

export function buildResultsViewModel(scenario: Scenario, solution: Solution): ResultsViewModel {
  const sessionCount = scenario.num_sessions || 0;
  const assignmentsBySession = new Map<number, typeof solution.assignments>();
  const peopleById = new Map(scenario.people.map((person) => [person.id, person]));

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    assignmentsBySession.set(
      sessionIndex,
      solution.assignments.filter((assignment) => assignment.session_id === sessionIndex),
    );
  }

  const sessions: ResultsSessionData[] = Array.from({ length: sessionCount }, (_, sessionIndex) => {
    const sessionAssignments = assignmentsBySession.get(sessionIndex) ?? [];

    const groups = scenario.groups.map((group) => {
      const groupAssignments = sessionAssignments.filter((assignment) => assignment.group_id === group.id);
      const people = groupAssignments
        .map((assignment) => peopleById.get(assignment.person_id))
        .filter((person): person is Person => Boolean(person));
      const size = getEffectiveGroupCapacity(group, sessionIndex);
      const assignedCount = people.length;
      const openSeats = Math.max(size - assignedCount, 0);

      return {
        id: group.id,
        size,
        people,
        assignedCount,
        openSeats,
        fillRatio: size === 0 ? 0 : assignedCount / size,
      };
    });

    const totalCapacity = groups.reduce((sum, group) => sum + group.size, 0);

    return {
      sessionIndex,
      label: `Session ${sessionIndex + 1}`,
      groups,
      totalPeople: sessionAssignments.length,
      totalCapacity,
      openSeats: Math.max(totalCapacity - sessionAssignments.length, 0),
    };
  });

  const participants: ResultsParticipantData[] = scenario.people.map((person) => {
    const sessionsForPerson: ResultsParticipantSessionAssignment[] = sessions.map((session) => {
      const assignedGroup = session.groups.find((group) => group.people.some((candidate) => candidate.id === person.id));

      return {
        sessionIndex: session.sessionIndex,
        sessionLabel: session.label,
        groupId: assignedGroup?.id ?? null,
        groupSize: assignedGroup?.size ?? null,
        isAssigned: Boolean(assignedGroup),
      };
    });

    const assignedSessions = sessionsForPerson.filter((entry) => entry.isAssigned).length;

    return {
      personId: person.id,
      displayName: getPersonDisplayName(person),
      person,
      sessions: sessionsForPerson,
      assignedSessions,
      unassignedSessions: Math.max(sessionCount - assignedSessions, 0),
    };
  });

  const totalCapacity = sessions.reduce((sum, session) => sum + session.totalCapacity, 0);
  const totalAssignments = solution.assignments.length;
  const pairMeetingMatrix = buildPairMeetingMatrix(scenario, sessions);

  return {
    summary: {
      totalPeople: scenario.people.length,
      totalGroups: scenario.groups.length,
      totalSessions: sessionCount,
      totalAssignments,
      totalCapacity,
      openSeats: Math.max(totalCapacity - totalAssignments, 0),
      averageFillPercent: totalCapacity === 0 ? 0 : (totalAssignments / totalCapacity) * 100,
    },
    sessions,
    participants,
    pairMeetingMatrix,
  };
}

export function getResultsPairMeetingPairKey(leftPersonId: string, rightPersonId: string): string {
  return leftPersonId < rightPersonId
    ? `${leftPersonId}\u0000${rightPersonId}`
    : `${rightPersonId}\u0000${leftPersonId}`;
}

function buildPairMeetingMatrix(scenario: Scenario, sessions: ResultsSessionData[]): ResultsPairMeetingMatrix {
  const participants = scenario.people.map((person) => ({
    personId: person.id,
    displayName: getPersonDisplayName(person),
    person,
  })).sort((left, right) => (
    left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
    || left.personId.localeCompare(right.personId)
  ));
  const participantsById = new Map(participants.map((participant) => [participant.personId, participant]));
  const pairSessions = new Map<string, number[]>();
  const pairAnnotations = buildPairMeetingAnnotations(scenario);
  const pairObjectiveCostCandidateKeys = buildPairObjectiveCostCandidateKeys(scenario);

  for (const session of sessions) {
    for (const group of session.groups) {
      const personIds = Array.from(new Set(group.people.map((person) => person.id)));

      for (let leftIndex = 0; leftIndex < personIds.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < personIds.length; rightIndex += 1) {
          const leftPersonId = personIds[leftIndex];
          const rightPersonId = personIds[rightIndex];
          const key = getResultsPairMeetingPairKey(leftPersonId, rightPersonId);
          const sessionIndexes = pairSessions.get(key) ?? [];

          sessionIndexes.push(session.sessionIndex);
          pairSessions.set(key, sessionIndexes);
        }
      }
    }
  }

  let maxCount = 0;
  let totalPairMeetings = 0;
  let annotatedPairCount = 0;
  let repeatedPairCount = 0;
  let attentionPairCount = 0;
  const cellsByPair = new Map<string, ResultsPairMeetingCell>();
  const pairKeys = new Set([
    ...pairSessions.keys(),
    ...pairAnnotations.keys(),
    ...pairObjectiveCostCandidateKeys,
  ]);

  for (const key of pairKeys) {
    const [leftPersonId, rightPersonId] = key.split('\u0000');
    const leftParticipant = participantsById.get(leftPersonId);
    const rightParticipant = participantsById.get(rightPersonId);

    if (!leftParticipant || !rightParticipant) {
      continue;
    }

    const sessionIndexes = pairSessions.get(key) ?? [];
    const annotations = pairAnnotations.get(key) ?? [];
    const count = sessionIndexes.length;
    const objectiveCostItems = buildPairObjectiveCostItems(
      scenario,
      leftParticipant.person,
      rightParticipant.person,
      sessionIndexes,
    );
    const cell: ResultsPairMeetingCell = {
      rowPersonId: rightParticipant.personId,
      rowDisplayName: rightParticipant.displayName,
      columnPersonId: leftParticipant.personId,
      columnDisplayName: leftParticipant.displayName,
      count,
      sessionIndexes,
      annotations,
      objectiveCost: objectiveCostItems.reduce((sum, item) => sum + item.amount, 0),
      objectiveCostItems,
    };

    maxCount = Math.max(maxCount, count);
    totalPairMeetings += count;
    if (annotations.length > 0) {
      annotatedPairCount += 1;
    }
    if (count > 1) {
      repeatedPairCount += 1;
    }
    cellsByPair.set(key, cell);
  }

  for (const cell of cellsByPair.values()) {
    if (getResultsPairMeetingCellTone(cell, maxCount, scenario.num_sessions) === 'bad') {
      attentionPairCount += 1;
    }
  }

  return {
    participants,
    cellsByPair,
    maxCount,
    totalPairMeetings,
    annotatedPairCount,
    repeatedPairCount,
    attentionPairCount,
  };
}

export type ResultsPairMeetingCellTone = 'good' | 'warn' | 'bad' | 'neutral';

function getAppliedSessionCount(annotation: ResultsPairMeetingAnnotation, sessionCount: number): number {
  return annotation.sessions.length > 0 ? annotation.sessions.length : sessionCount;
}

export function getResultsPairMeetingCellTone(
  cell: ResultsPairMeetingCell,
  maxCount: number,
  sessionCount: number,
): ResultsPairMeetingCellTone {
  const apartAnnotations = cell.annotations.filter((annotation) => annotation.intent === 'apart');
  const togetherAnnotations = cell.annotations.filter((annotation) => annotation.intent === 'together');
  const hasRequiredApart = apartAnnotations.some((annotation) => annotation.strength === 'required');
  const hasRequiredTogether = togetherAnnotations.some((annotation) => annotation.strength === 'required');

  if (apartAnnotations.length > 0) {
    if (cell.count === 0) {
      return 'good';
    }
    return hasRequiredApart ? 'bad' : 'warn';
  }

  if (togetherAnnotations.length > 0) {
    const expectedCount = Math.max(...togetherAnnotations.map((annotation) => getAppliedSessionCount(annotation, sessionCount)));
    if (cell.count >= expectedCount) {
      return 'good';
    }
    if (cell.count === 0 || hasRequiredTogether) {
      return 'bad';
    }
    return 'warn';
  }

  if (cell.count === 0) {
    return 'neutral';
  }
  if (cell.count <= 1) {
    return 'good';
  }
  if (cell.count === 2 || (maxCount > 0 && cell.count < maxCount)) {
    return 'warn';
  }
  return 'bad';
}

export function getResultsPairMeetingCell(
  matrix: ResultsPairMeetingMatrix,
  rowIndex: number,
  columnIndex: number,
): ResultsPairMeetingCell | null {
  if (columnIndex <= rowIndex) {
    return null;
  }

  const rowParticipant = matrix.participants[rowIndex];
  const columnParticipant = matrix.participants[columnIndex];
  if (!rowParticipant || !columnParticipant) {
    return null;
  }

  const storedCell = matrix.cellsByPair.get(getResultsPairMeetingPairKey(rowParticipant.personId, columnParticipant.personId));

  return {
    rowPersonId: rowParticipant.personId,
    rowDisplayName: rowParticipant.displayName,
    columnPersonId: columnParticipant.personId,
    columnDisplayName: columnParticipant.displayName,
    count: storedCell?.count ?? 0,
    sessionIndexes: storedCell?.sessionIndexes ?? [],
    annotations: storedCell?.annotations ?? [],
    objectiveCost: storedCell?.objectiveCost ?? 0,
    objectiveCostItems: storedCell?.objectiveCostItems ?? [],
  };
}

export function buildResultsPairMeetingRows(matrix: ResultsPairMeetingMatrix): ResultsPairMeetingRow[] {
  return matrix.participants.map((rowParticipant, rowIndex) => ({
    ...rowParticipant,
    cells: matrix.participants.map((_columnParticipant, columnIndex) => (
      getResultsPairMeetingCell(matrix, rowIndex, columnIndex)
    )),
  }));
}

function getConstraintSessions(scenario: Scenario, sessions: number[] | undefined): number[] {
  return sessions && sessions.length > 0
    ? sessions
    : Array.from({ length: scenario.num_sessions }, (_, sessionIndex) => sessionIndex);
}

function addPairAnnotations(
  annotationsByPair: Map<string, ResultsPairMeetingAnnotation[]>,
  people: string[],
  annotation: ResultsPairMeetingAnnotation,
) {
  for (let leftIndex = 0; leftIndex < people.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < people.length; rightIndex += 1) {
      const key = getResultsPairMeetingPairKey(people[leftIndex], people[rightIndex]);
      const annotations = annotationsByPair.get(key) ?? [];

      annotations.push(annotation);
      annotationsByPair.set(key, annotations);
    }
  }
}

function buildPairMeetingAnnotations(scenario: Scenario): Map<string, ResultsPairMeetingAnnotation[]> {
  const annotationsByPair = new Map<string, ResultsPairMeetingAnnotation[]>();

  for (const constraint of scenario.constraints) {
    switch (constraint.type) {
      case 'MustStayTogether':
        addPairAnnotations(annotationsByPair, constraint.people, {
          kind: 'must-together',
          label: 'Keep together',
          intent: 'together',
          strength: 'required',
          sessions: getConstraintSessions(scenario, constraint.sessions),
        });
        break;
      case 'MustStayApart':
        addPairAnnotations(annotationsByPair, constraint.people, {
          kind: 'must-apart',
          label: 'Keep apart',
          intent: 'apart',
          strength: 'required',
          sessions: getConstraintSessions(scenario, constraint.sessions),
        });
        break;
      case 'ShouldStayTogether':
        addPairAnnotations(annotationsByPair, constraint.people, {
          kind: 'prefer-together',
          label: 'Prefer together',
          intent: 'together',
          strength: 'preferred',
          sessions: getConstraintSessions(scenario, constraint.sessions),
          penaltyWeight: constraint.penalty_weight,
        });
        break;
      case 'ShouldNotBeTogether':
        addPairAnnotations(annotationsByPair, constraint.people, {
          kind: 'prefer-apart',
          label: 'Prefer apart',
          intent: 'apart',
          strength: 'preferred',
          sessions: getConstraintSessions(scenario, constraint.sessions),
          penaltyWeight: constraint.penalty_weight,
        });
        break;
      default:
        break;
    }
  }

  return annotationsByPair;
}
