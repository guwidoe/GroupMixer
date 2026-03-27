import type { Scenario, Solution } from "../../types";
import { getEffectiveGroupCapacity } from '../../utils/groupCapacities';
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
  scenario: Scenario,
  solution: Solution
): NormalizedSchedule {
  const sessionCount = scenario.num_sessions || 0;
  const groupOrder = (scenario.groups || []).map((g) => g.id);
  const groupsById = new Map((scenario.groups || []).map((group) => [group.id, group] as const));

  const bySessionGroup: Record<number, Record<string, string[]>> = {};
  for (const a of solution.assignments) {
    if (!bySessionGroup[a.session_id]) bySessionGroup[a.session_id] = {};
    if (!bySessionGroup[a.session_id][a.group_id])
      bySessionGroup[a.session_id][a.group_id] = [];
    bySessionGroup[a.session_id][a.group_id].push(a.person_id);
  }

  const sessions = Array.from({ length: sessionCount }, (_, sessionIndex) => {
    const cellsByGroupId: Record<string, NormalizedCell> = {};
    for (const groupId of groupOrder) {
      const peopleIds =
        bySessionGroup[sessionIndex]?.[groupId]?.slice().sort() ?? [];
      const group = groupsById.get(groupId);
      cellsByGroupId[groupId] = {
        sessionIndex,
        groupId,
        peopleIds,
        capacity: group ? getEffectiveGroupCapacity(group, sessionIndex) : 0,
      };
    }
    return { sessionIndex, cellsByGroupId };
  });

  return { sessionCount, groupOrder, sessions };
}

export function normalizeFromSnapshot(
  scenario: Scenario,
  snapshot: ScheduleSnapshot
): NormalizedSchedule {
  const sessionCount = scenario.num_sessions || 0;
  const groupOrder = (scenario.groups || []).map((g) => g.id);
  const groupsById = new Map((scenario.groups || []).map((group) => [group.id, group] as const));
  const sessions = Array.from({ length: sessionCount }, (_, sessionIndex) => {
    const sessionKey = `session_${sessionIndex}`;
    const sessionMap = snapshot[sessionKey] || {};

    const cellsByGroupId: Record<string, NormalizedCell> = {};
    for (const groupId of groupOrder) {
      const peopleIds = (sessionMap[groupId] || []).slice().sort();
      const group = groupsById.get(groupId);
      cellsByGroupId[groupId] = {
        sessionIndex,
        groupId,
        peopleIds,
        capacity: group ? getEffectiveGroupCapacity(group, sessionIndex) : 0,
      };
    }
    return { sessionIndex, cellsByGroupId };
  });

  return { sessionCount, groupOrder, sessions };
}
