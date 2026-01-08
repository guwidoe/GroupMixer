import type { Problem, Solution } from "../../types";
import type { ScheduleSnapshot } from "../types";

export interface NormalizedCell {
  sessionIndex: number;
  groupId: string;
  peopleIds: string[];
  capacity: number;
}

export interface NormalizedSchedule {
  sessionCount: number;
  groupOrder: string[];
  sessions: Array<{
    sessionIndex: number;
    cellsByGroupId: Record<string, NormalizedCell>;
  }>;
}

export function normalizeFromSolution(
  problem: Problem,
  solution: Solution
): NormalizedSchedule {
  const sessionCount = problem.num_sessions || 0;
  const groupOrder = (problem.groups || []).map((g) => g.id);

  const bySessionGroup: Record<number, Record<string, string[]>> = {};
  for (const a of solution.assignments) {
    if (!bySessionGroup[a.session_id]) bySessionGroup[a.session_id] = {};
    if (!bySessionGroup[a.session_id][a.group_id])
      bySessionGroup[a.session_id][a.group_id] = [];
    bySessionGroup[a.session_id][a.group_id].push(a.person_id);
  }

  const groupCap: Record<string, number> = {};
  for (const g of problem.groups) groupCap[g.id] = g.size;

  const sessions = Array.from({ length: sessionCount }, (_, sessionIndex) => {
    const cellsByGroupId: Record<string, NormalizedCell> = {};
    for (const groupId of groupOrder) {
      const peopleIds =
        bySessionGroup[sessionIndex]?.[groupId]?.slice().sort() ?? [];
      cellsByGroupId[groupId] = {
        sessionIndex,
        groupId,
        peopleIds,
        capacity: groupCap[groupId] ?? 0,
      };
    }
    return { sessionIndex, cellsByGroupId };
  });

  return { sessionCount, groupOrder, sessions };
}

export function normalizeFromSnapshot(
  problem: Problem,
  snapshot: ScheduleSnapshot
): NormalizedSchedule {
  const sessionCount = problem.num_sessions || 0;
  const groupOrder = (problem.groups || []).map((g) => g.id);
  const groupCap: Record<string, number> = {};
  for (const g of problem.groups) groupCap[g.id] = g.size;

  const sessions = Array.from({ length: sessionCount }, (_, sessionIndex) => {
    const sessionKey = `session_${sessionIndex}`;
    const sessionMap = snapshot[sessionKey] || {};

    const cellsByGroupId: Record<string, NormalizedCell> = {};
    for (const groupId of groupOrder) {
      const peopleIds = (sessionMap[groupId] || []).slice().sort();
      cellsByGroupId[groupId] = {
        sessionIndex,
        groupId,
        peopleIds,
        capacity: groupCap[groupId] ?? 0,
      };
    }
    return { sessionIndex, cellsByGroupId };
  });

  return { sessionCount, groupOrder, sessions };
}
