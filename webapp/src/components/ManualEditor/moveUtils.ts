import type { Problem } from '../../types';
import type { Mode } from './types';

interface CanDropArgs {
  effectiveProblem: Problem | null;
  draftSchedule: Record<number, Record<string, string[]>>;
  lockedPeople: Set<string>;
  lockedGroups: Set<string>;
  mode: Mode;
  personId: string;
  targetGroupId: string;
  sessionId: number;
}

export function canDrop({
  effectiveProblem,
  draftSchedule,
  lockedPeople,
  lockedGroups,
  mode,
  personId,
  targetGroupId,
  sessionId,
}: CanDropArgs): { ok: boolean; reason?: string } {
  if (!effectiveProblem) return { ok: false, reason: 'No problem loaded' };
  if (lockedPeople.has(personId)) return { ok: false, reason: 'Person is locked' };
  if (lockedGroups.has(targetGroupId)) return { ok: false, reason: 'Group is locked' };

  const groups = draftSchedule[sessionId] || {};
  const targetPeople = groups[targetGroupId] || [];
  const groupDef = effectiveProblem.groups.find((g) => g.id === targetGroupId);
  if (groupDef) {
    const cap = groupDef.size;
    const currentCount = targetPeople.includes(personId) ? targetPeople.length : targetPeople.length + 1;
    if (currentCount > cap) {
      if (mode === 'strict') return { ok: false, reason: 'Capacity exceeded' };
    }
  }

  const personConstraints = effectiveProblem.constraints.filter((c) => {
    const allSessions = Array.from({ length: effectiveProblem.num_sessions }, (_, i) => i);
    if (c.type === 'ImmovablePerson') {
      const sessions = c.sessions ?? allSessions;
      return c.person_id === personId && sessions.includes(sessionId);
    }
    if (c.type === 'ImmovablePeople') {
      const sessions = c.sessions ?? allSessions;
      const people = c.people || [];
      return sessions.includes(sessionId) && people.includes(personId);
    }
    return false;
  });
  for (const c of personConstraints) {
    if ((c.type === 'ImmovablePerson' || c.type === 'ImmovablePeople') && c.group_id !== targetGroupId) {
      if (mode === 'strict') return { ok: false, reason: 'Immovable constraint' };
    }
  }
  return { ok: true };
}
