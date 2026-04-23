import type { Scenario } from '../../types';
import type { Mode } from './types';
import { getEffectiveGroupCapacity } from '../../utils/groupCapacities';

interface CanDropArgs {
  effectiveScenario: Scenario | null;
  draftSchedule: Record<number, Record<string, string[]>>;
  lockedPeople: Set<string>;
  lockedGroups: Set<string>;
  mode: Mode;
  personId: string;
  targetGroupId: string;
  sessionId: number;
}

export function canDrop({
  effectiveScenario,
  draftSchedule,
  lockedPeople,
  lockedGroups,
  mode,
  personId,
  targetGroupId,
  sessionId,
}: CanDropArgs): { ok: boolean; reason?: string } {
  if (!effectiveScenario) return { ok: false, reason: 'No scenario loaded' };
  if (lockedPeople.has(personId)) return { ok: false, reason: 'Person is locked' };
  if (lockedGroups.has(targetGroupId)) return { ok: false, reason: 'Group is locked' };

  const groups = draftSchedule[sessionId] || {};
  const targetPeople = groups[targetGroupId] || [];
  const groupDef = effectiveScenario.groups.find((g) => g.id === targetGroupId);
  if (groupDef) {
    const cap = getEffectiveGroupCapacity(groupDef, sessionId);
    const currentCount = targetPeople.includes(personId) ? targetPeople.length : targetPeople.length + 1;
    if (currentCount > cap) {
      if (mode === 'strict') return { ok: false, reason: 'Capacity exceeded' };
    }
  }

  const personConstraints = effectiveScenario.constraints.filter((c) => {
    const allSessions = Array.from({ length: effectiveScenario.num_sessions }, (_, i) => i);
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

  const activeMustStayApartConstraints = effectiveScenario.constraints.filter((constraint) => {
    if (constraint.type !== 'MustStayApart') {
      return false;
    }

    const appliesToAllSessions = !constraint.sessions || constraint.sessions.length === 0;
    const appliesToSession = appliesToAllSessions || constraint.sessions.includes(sessionId);

    return appliesToSession && constraint.people.includes(personId);
  });

  const targetOtherPeople = targetPeople.filter((candidateId) => candidateId !== personId);
  for (const constraint of activeMustStayApartConstraints) {
    const conflictingPersonId = targetOtherPeople.find((candidateId) => constraint.people.includes(candidateId));
    if (conflictingPersonId && mode === 'strict') {
      return { ok: false, reason: 'Must-stay-apart constraint' };
    }
  }

  return { ok: true };
}
