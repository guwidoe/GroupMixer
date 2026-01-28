import { useMemo } from 'react';
import type { Person, Problem, Solution } from '../../types';
import type { CardData, ViolationDetail } from './types';

type ScheduleMap = Record<number, Record<string, string[]>>;

export function formatSessions(sessions: number[] | undefined, total: number): string {
  if (!sessions || sessions.length === 0) return 'All sessions';
  if (sessions.length === total) return 'All sessions';
  return `Sessions ${sessions.map((s) => s + 1).join(', ')}`;
}

function useSchedule(solution: Solution): ScheduleMap {
  return useMemo(() => {
    const schedule: ScheduleMap = {};
    solution.assignments.forEach((assignment) => {
      if (!schedule[assignment.session_id]) schedule[assignment.session_id] = {};
      if (!schedule[assignment.session_id][assignment.group_id]) schedule[assignment.session_id][assignment.group_id] = [];
      schedule[assignment.session_id][assignment.group_id].push(assignment.person_id);
    });
    return schedule;
  }, [solution]);
}

export function useCompliance(problem: Problem, solution: Solution): CardData[] {
  const schedule = useSchedule(solution);
  const personMap = useMemo(() => new Map<string, Person>(problem.people.map((person) => [person.id, person])), [problem.people]);

  return useMemo(() => {
    const cards: CardData[] = [];

    problem.constraints.forEach((constraint, index) => {
      switch (constraint.type) {
        case 'PairMeetingCount': {
          const sessions = constraint.sessions;
          const [idA, idB] = constraint.people;
          const subset = sessions && sessions.length > 0 ? sessions : Array.from({ length: problem.num_sessions }, (_, i) => i);

          let count = 0;
          const perSession: Array<{ session: number; together: boolean; groupId?: string }> = [];
          subset.forEach((session) => {
            const groups = schedule[session] || {};
            let inSame = false;
            let groupId: string | undefined = undefined;
            for (const [gid, ids] of Object.entries(groups)) {
              const arr = ids as string[];
              if (arr.includes(idA) && arr.includes(idB)) {
                inSame = true;
                groupId = gid;
                break;
              }
            }
            if (inSame) count += 1;
            perSession.push({ session, together: inSame, groupId });
          });

          const target = constraint.target_meetings;
          const mode = constraint.mode || 'at_least';
          let deviations = 0;
          if (mode === 'at_least') deviations = Math.max(0, target - count);
          else if (mode === 'exact') deviations = Math.abs(target - count);
          else deviations = Math.max(0, count - target);

          const details: ViolationDetail[] = [];
          details.push({
            kind: 'PairMeetingCountSummary',
            people: [idA, idB],
            target,
            actual: count,
            mode,
            sessions: subset,
          });
          perSession.forEach((ps) => {
            details.push({
              kind: ps.together ? 'PairMeetingTogether' : 'PairMeetingApart',
              session: ps.session,
              groupId: ps.groupId,
              people: [idA, idB],
            });
          });

          cards.push({
            id: index,
            constraint,
            type: constraint.type,
            title: `Pair Meeting Count (${mode.replace('_', ' ')})`,
            subtitle: `${formatSessions(sessions, problem.num_sessions)} • Target: ${target}`,
            adheres: deviations === 0,
            violationsCount: deviations,
            details,
          });
          break;
        }
        case 'RepeatEncounter': {
          const pairCounts = new Map<string, { count: number; sessions: Set<number> }>();
          Object.entries(schedule).forEach(([sessionStr, groups]) => {
            const session = Number(sessionStr);
            Object.values(groups).forEach((peopleIds) => {
              for (let i = 0; i < peopleIds.length; i++) {
                for (let j = i + 1; j < peopleIds.length; j++) {
                  const a = peopleIds[i];
                  const b = peopleIds[j];
                  const key = [a, b].sort().join('|');
                  const entry = pairCounts.get(key) || { count: 0, sessions: new Set<number>() };
                  entry.count += 1;
                  entry.sessions.add(session);
                  pairCounts.set(key, entry);
                }
              }
            });
          });

          const details: ViolationDetail[] = [];
          let violations = 0;
          pairCounts.forEach((entry, key) => {
            if (entry.count > constraint.max_allowed_encounters) {
              const [p1, p2] = key.split('|');
              const over = entry.count - constraint.max_allowed_encounters;
              violations += over;
              details.push({
                kind: 'RepeatEncounter',
                pair: [p1, p2],
                count: entry.count,
                maxAllowed: constraint.max_allowed_encounters,
                sessions: Array.from(entry.sessions.values()).sort((a, b) => a - b),
              });
            }
          });

          cards.push({
            id: index,
            constraint,
            type: constraint.type,
            title: `Repeat Encounter (max ${constraint.max_allowed_encounters})`,
            subtitle: `Penalty: ${constraint.penalty_function}, Weight: ${constraint.penalty_weight}`,
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        case 'AttributeBalance': {
          const sessions = constraint.sessions ?? Array.from({ length: problem.num_sessions }, (_, i) => i);
          const details: ViolationDetail[] = [];
          let violations = 0;
          const mode = constraint.mode;
          sessions.forEach((session) => {
            const peopleIds = schedule[session]?.[constraint.group_id] || [];
            const counts: Record<string, number> = {};
            peopleIds.forEach((pid) => {
              const person = personMap.get(pid);
              const val = person?.attributes?.[constraint.attribute_key] ?? '__UNKNOWN__';
              counts[val] = (counts[val] || 0) + 1;
            });
            Object.entries(constraint.desired_values).forEach(([val, desired]) => {
              const actual = counts[val] || 0;
              if (mode === 'at_least') {
                if (actual < desired) {
                  violations += desired - actual;
                  details.push({ kind: 'AttributeBalance', session, groupId: constraint.group_id, attribute: val, desired, actual });
                }
              } else if (actual !== desired) {
                violations += Math.abs(actual - desired);
                details.push({ kind: 'AttributeBalance', session, groupId: constraint.group_id, attribute: val, desired, actual });
              }
            });
          });
          cards.push({
            id: index,
            constraint,
            type: constraint.type,
            title: `Attribute Balance – ${constraint.group_id} (${constraint.attribute_key})`,
            subtitle:
              `${formatSessions(constraint.sessions, problem.num_sessions)} • Weight: ${constraint.penalty_weight}` +
              (mode === 'at_least' ? ' • Mode: At least' : ''),
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        case 'ImmovablePerson': {
          const details: ViolationDetail[] = [];
          let violations = 0;
          constraint.sessions.forEach((session) => {
            const groups = schedule[session] || {};
            let assignedGroup: string | undefined;
            Object.entries(groups).forEach(([gid, ids]) => {
              if (ids.includes(constraint.person_id)) assignedGroup = gid;
            });
            if (assignedGroup !== constraint.group_id) {
              violations += 1;
              details.push({
                kind: 'Immovable',
                session,
                personId: constraint.person_id,
                requiredGroup: constraint.group_id,
                assignedGroup,
              });
            }
          });
          cards.push({
            id: index,
            constraint,
            type: constraint.type,
            title: 'Immovable Person',
            subtitle: `${formatSessions(constraint.sessions, problem.num_sessions)} • Group: ${constraint.group_id}`,
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        case 'ImmovablePeople': {
          const sessions = constraint.sessions ?? Array.from({ length: problem.num_sessions }, (_, i) => i);
          const details: ViolationDetail[] = [];
          let violations = 0;
          sessions.forEach((session) => {
            const peopleIds = schedule[session]?.[constraint.group_id] || [];
            constraint.people.forEach((pid) => {
              if (!peopleIds.includes(pid)) {
                violations += 1;
                details.push({ kind: 'Immovable', session, personId: pid, requiredGroup: constraint.group_id });
              }
            });
          });
          cards.push({
            id: index,
            constraint,
            type: constraint.type,
            title: 'Immovable People',
            subtitle: `${formatSessions(constraint.sessions, problem.num_sessions)} • Group: ${constraint.group_id}`,
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        case 'MustStayTogether':
        case 'ShouldStayTogether': {
          const sessions = constraint.sessions ?? Array.from({ length: problem.num_sessions }, (_, i) => i);
          const details: ViolationDetail[] = [];
          let violations = 0;
          sessions.forEach((session) => {
            const groups = schedule[session] || {};
            const found: { personId: string; groupId?: string }[] = [];
            constraint.people.forEach((pid) => {
              let groupId: string | undefined = undefined;
              Object.entries(groups).forEach(([gid, ids]) => {
                if (ids.includes(pid)) groupId = gid;
              });
              found.push({ personId: pid, groupId });
            });
            const groupIds = new Set(found.map((f) => f.groupId || ''));
            if (groupIds.size > 1) {
              violations += groupIds.size - 1;
              details.push({ kind: 'TogetherSplit', session, people: found });
            }
          });
          cards.push({
            id: index,
            constraint,
            type: constraint.type,
            title: constraint.type === 'MustStayTogether' ? 'Must Stay Together' : 'Should Stay Together',
            subtitle: `${formatSessions(constraint.sessions, problem.num_sessions)} • Weight: ${constraint.penalty_weight}`,
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        case 'ShouldNotBeTogether': {
          const sessions = constraint.sessions ?? Array.from({ length: problem.num_sessions }, (_, i) => i);
          const details: ViolationDetail[] = [];
          let violations = 0;
          sessions.forEach((session) => {
            const groups = schedule[session] || {};
            Object.entries(groups).forEach(([gid, ids]) => {
              const involved = ids.filter((pid) => constraint.people.includes(pid));
              if (involved.length > 1) {
                violations += involved.length - 1;
                details.push({ kind: 'NotTogether', session, groupId: gid, people: involved });
              }
            });
          });
          cards.push({
            id: index,
            constraint,
            type: constraint.type,
            title: 'Should Not Be Together',
            subtitle: `${formatSessions(constraint.sessions, problem.num_sessions)} • Weight: ${constraint.penalty_weight}`,
            adheres: violations === 0,
            violationsCount: violations,
            details,
          });
          break;
        }
        default: {
          cards.push({
            id: index,
            constraint,
            type: constraint.type,
            title: constraint.type,
            adheres: true,
            violationsCount: 0,
            details: [],
          });
        }
      }
    });

    return cards;
  }, [personMap, problem.constraints, problem.num_sessions, schedule]);
}
