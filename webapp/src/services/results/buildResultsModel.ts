import type { Person, Scenario, Solution } from '../../types';
import { getPersonDisplayName } from '../scenarioAttributes';
import { getEffectiveGroupCapacity } from '../../utils/groupCapacities';

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

export interface ResultsViewModel {
  summary: ResultsSummaryData;
  sessions: ResultsSessionData[];
  participants: ResultsParticipantData[];
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
  };
}
