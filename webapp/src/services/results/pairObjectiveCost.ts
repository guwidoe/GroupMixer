import type { Person, Scenario } from '../../types';
import type { ResultsPairMeetingCostItem } from './buildResultsModel';

export function buildPairObjectiveCostCandidateKeys(scenario: Scenario): string[] {
  return scenario.constraints
    .filter((constraint) => constraint.type === 'PairMeetingCount')
    .map((constraint) => getPairKey(constraint.people[0], constraint.people[1]));
}

export function buildPairObjectiveCostItems(
  scenario: Scenario,
  leftPerson: Person,
  rightPerson: Person,
  sessionIndexes: number[],
): ResultsPairMeetingCostItem[] {
  const items: ResultsPairMeetingCostItem[] = [];

  for (const constraint of scenario.constraints) {
    switch (constraint.type) {
      case 'RepeatEncounter': {
        const excess = Math.max(0, sessionIndexes.length - constraint.max_allowed_encounters);
        if (excess > 0) {
          const rawPenalty = constraint.penalty_function === 'linear' ? excess : excess ** 2;
          const amount = rawPenalty * constraint.penalty_weight;
          items.push({
            label: 'Repeat encounter',
            amount,
            detail: `${sessionIndexes.length} meetings, allowed ${constraint.max_allowed_encounters}, ${constraint.penalty_function} penalty x ${formatCostAmount(constraint.penalty_weight)}`,
          });
        }
        break;
      }
      case 'ShouldStayTogether': {
        if (!constraint.people.includes(leftPerson.id) || !constraint.people.includes(rightPerson.id)) {
          break;
        }
        const activeSessions = getPairActiveSessions(scenario, leftPerson, rightPerson, constraint.sessions);
        const meetings = countMeetingsInSessions(sessionIndexes, activeSessions);
        const violations = Math.max(0, activeSessions.length - meetings);
        if (violations > 0) {
          const amount = violations * constraint.penalty_weight;
          items.push({
            label: 'Prefer together',
            amount,
            detail: `${violations} missed session${violations === 1 ? '' : 's'} x ${formatCostAmount(constraint.penalty_weight)}`,
          });
        }
        break;
      }
      case 'ShouldNotBeTogether': {
        if (!constraint.people.includes(leftPerson.id) || !constraint.people.includes(rightPerson.id)) {
          break;
        }
        const activeSessions = getPairActiveSessions(scenario, leftPerson, rightPerson, constraint.sessions);
        const violations = countMeetingsInSessions(sessionIndexes, activeSessions);
        if (violations > 0) {
          const amount = violations * constraint.penalty_weight;
          items.push({
            label: 'Prefer apart',
            amount,
            detail: `${violations} shared session${violations === 1 ? '' : 's'} x ${formatCostAmount(constraint.penalty_weight)}`,
          });
        }
        break;
      }
      case 'PairMeetingCount': {
        const matchesPair = getPairKey(leftPerson.id, rightPerson.id)
          === getPairKey(constraint.people[0], constraint.people[1]);
        if (!matchesPair) {
          break;
        }
        const activeSessions = getPairActiveSessions(scenario, leftPerson, rightPerson, constraint.sessions);
        const meetings = countMeetingsInSessions(sessionIndexes, activeSessions);
        const mode = constraint.mode ?? 'at_least';
        const deviation = mode === 'at_least'
          ? Math.max(0, constraint.target_meetings - meetings)
          : mode === 'exact'
            ? Math.abs(meetings - constraint.target_meetings)
            : Math.max(0, meetings - constraint.target_meetings);

        if (deviation > 0) {
          const amount = deviation * constraint.penalty_weight;
          items.push({
            label: 'Meeting target',
            amount,
            detail: `${meetings} meetings vs ${mode.replace('_', ' ')} ${constraint.target_meetings}; ${deviation} deviation x ${formatCostAmount(constraint.penalty_weight)}`,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return items;
}

function getConstraintSessions(scenario: Scenario, sessions: number[] | undefined): number[] {
  return sessions && sessions.length > 0
    ? sessions
    : Array.from({ length: scenario.num_sessions }, (_, sessionIndex) => sessionIndex);
}

function getPairKey(leftPersonId: string, rightPersonId: string): string {
  return leftPersonId < rightPersonId
    ? `${leftPersonId}\u0000${rightPersonId}`
    : `${rightPersonId}\u0000${leftPersonId}`;
}

function getPairActiveSessions(
  scenario: Scenario,
  leftPerson: Person,
  rightPerson: Person,
  sessions: number[] | undefined,
): number[] {
  return getConstraintSessions(scenario, sessions)
    .filter((sessionIndex) => (
      participatesInSession(leftPerson, sessionIndex)
      && participatesInSession(rightPerson, sessionIndex)
    ));
}

function participatesInSession(person: Person, sessionIndex: number): boolean {
  return !person.sessions || person.sessions.includes(sessionIndex);
}

function countMeetingsInSessions(sessionIndexes: number[], sessions: number[]): number {
  const sessionSet = new Set(sessions);
  return sessionIndexes.filter((sessionIndex) => sessionSet.has(sessionIndex)).length;
}

function formatCostAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
