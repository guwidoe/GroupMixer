import type { Problem, Solution } from "../../../types";
import type { ScheduleSnapshot } from "../../types";

export type ContactEdgeKey = string; // "p1|p2" with p1<p2

export interface ContactEdgeStats {
  a: string;
  b: string;
  total: number;
  perSession: number[];
}

function edgeKey(a: string, b: string): ContactEdgeKey {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function addMeeting(
  map: Map<ContactEdgeKey, ContactEdgeStats>,
  a: string,
  b: string,
  sessionIndex: number,
  sessionCount: number
) {
  if (a === b) return;
  const key = edgeKey(a, b);
  const existing = map.get(key);
  if (existing) {
    existing.total += 1;
    existing.perSession[sessionIndex] =
      (existing.perSession[sessionIndex] || 0) + 1;
    return;
  }
  const perSession = Array.from({ length: sessionCount }, () => 0);
  perSession[sessionIndex] = 1;
  map.set(key, { a: a < b ? a : b, b: a < b ? b : a, total: 1, perSession });
}

export function computeContactsFromSolution(
  problem: Problem,
  solution: Solution
): Map<ContactEdgeKey, ContactEdgeStats> {
  const sessionCount = problem.num_sessions || 0;
  // session -> group -> people
  const bySessionGroup = new Map<number, Map<string, string[]>>();
  for (const a of solution.assignments) {
    const s = a.session_id;
    if (!bySessionGroup.has(s)) bySessionGroup.set(s, new Map());
    const m = bySessionGroup.get(s)!;
    if (!m.has(a.group_id)) m.set(a.group_id, []);
    m.get(a.group_id)!.push(a.person_id);
  }

  const edges = new Map<ContactEdgeKey, ContactEdgeStats>();
  for (let s = 0; s < sessionCount; s++) {
    const groups = bySessionGroup.get(s);
    if (!groups) continue;
    for (const [, people] of groups) {
      // all pairs within group meet once in this session
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          addMeeting(edges, people[i], people[j], s, sessionCount);
        }
      }
    }
  }
  return edges;
}

export function computeContactsFromSnapshot(
  problem: Problem,
  snapshot: ScheduleSnapshot
): Map<ContactEdgeKey, ContactEdgeStats> {
  const sessionCount = problem.num_sessions || 0;
  const edges = new Map<ContactEdgeKey, ContactEdgeStats>();

  for (let s = 0; s < sessionCount; s++) {
    const sessionKey = `session_${s}`;
    const groups = snapshot[sessionKey] || {};
    for (const groupId of Object.keys(groups)) {
      const people = groups[groupId] || [];
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          addMeeting(edges, people[i], people[j], s, sessionCount);
        }
      }
    }
  }

  return edges;
}
