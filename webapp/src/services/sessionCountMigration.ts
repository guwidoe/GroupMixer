import type { Constraint, Person, Scenario } from '../types';

export type SessionReductionChangeKind =
  | 'group-session-sizes-trimmed'
  | 'person-sessions-trimmed'
  | 'constraint-sessions-trimmed'
  | 'constraint-removed'
  | 'allowed-sessions-trimmed';

export type SessionReductionBlockerKind =
  | 'person-loses-all-sessions'
  | 'pair-meeting-target-invalid'
  | 'allowed-sessions-empty';

export interface SessionReductionChange {
  kind: SessionReductionChangeKind;
  title: string;
  detail: string;
}

export interface SessionReductionBlocker {
  kind: SessionReductionBlockerKind;
  title: string;
  detail: string;
}

export interface SessionCountReductionSummary {
  peopleTrimmed: number;
  groupsTrimmed: number;
  constraintsTrimmed: number;
  constraintsRemoved: number;
  pairMeetingConstraintsNeedingReview: number;
  allowedSessionsTrimmed: boolean;
}

export interface SessionCountReductionPlan {
  previousSessionCount: number;
  nextSessionCount: number;
  canApply: boolean;
  nextScenario: Scenario | null;
  summary: SessionCountReductionSummary;
  changes: SessionReductionChange[];
  blockers: SessionReductionBlocker[];
}

export type SessionReductionInvalidationKind =
  | 'active-solution'
  | 'warm-start-selection'
  | 'manual-editor-state';

export interface SessionReductionInvalidation {
  kind: SessionReductionInvalidationKind;
  title: string;
  detail: string;
}

interface BuildSessionReductionInvalidationsArgs {
  hasActiveSolution: boolean;
  hasWarmStartSelection: boolean;
  hasManualEditorState: boolean;
}

interface PlanSessionCountReductionArgs {
  scenario: Scenario;
  nextSessionCount: number;
}

type ScopedConstraint = Extract<Constraint, {
  type:
    | 'AttributeBalance'
    | 'ImmovablePerson'
    | 'ImmovablePeople'
    | 'MustStayTogether'
    | 'MustStayApart'
    | 'ShouldStayTogether'
    | 'ShouldNotBeTogether'
    | 'PairMeetingCount';
}>;

function normalizeExplicitSessions(sessions: number[] | undefined, totalSessions: number): number[] | undefined {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return undefined;
  }

  const seen = new Set<number>();
  const normalized = sessions
    .map((session) => Number(session))
    .filter((session) => Number.isInteger(session))
    .filter((session) => session >= 0)
    .filter((session) => session < totalSessions)
    .filter((session) => {
      if (seen.has(session)) {
        return false;
      }
      seen.add(session);
      return true;
    })
    .sort((left, right) => left - right);

  return normalized.length > 0 ? normalized : undefined;
}

function formatSessionList(sessions: number[]): string {
  return sessions.map((session) => String(session + 1)).join(', ');
}

function formatConstraintTitle(constraint: ScopedConstraint): string {
  switch (constraint.type) {
    case 'AttributeBalance':
      return `Attribute balance for ${constraint.group_id || 'unknown group'}`;
    case 'ImmovablePerson':
      return `Immovable person ${constraint.person_id}`;
    case 'ImmovablePeople':
      return `Immovable people (${constraint.people.join(', ')})`;
    case 'MustStayTogether':
      return `Must stay together (${constraint.people.join(', ')})`;
    case 'MustStayApart':
      return `Must stay apart (${constraint.people.join(', ')})`;
    case 'ShouldStayTogether':
      return `Should stay together (${constraint.people.join(', ')})`;
    case 'ShouldNotBeTogether':
      return `Should not be together (${constraint.people.join(', ')})`;
    case 'PairMeetingCount':
      return `Pair meeting count (${constraint.people.join(', ')})`;
  }
}

function participatesInSession(person: Person | undefined, sessionIndex: number, totalSessions: number): boolean {
  if (!person) {
    return false;
  }

  const normalized = normalizeExplicitSessions(person.sessions, totalSessions);
  if (!normalized) {
    return sessionIndex >= 0 && sessionIndex < totalSessions;
  }

  return normalized.includes(sessionIndex);
}

function computePairMeetingFeasibleSessions(
  peopleById: Map<string, Person>,
  people: [string, string],
  sessions: number[],
  totalSessions: number,
): number {
  const [leftId, rightId] = people;
  const left = peopleById.get(leftId);
  const right = peopleById.get(rightId);

  return sessions.filter((session) => participatesInSession(left, session, totalSessions)
    && participatesInSession(right, session, totalSessions)).length;
}

function buildAllSessions(totalSessions: number): number[] {
  return Array.from({ length: Math.max(0, totalSessions) }, (_, index) => index);
}

function cloneConstraintWithSessions<TConstraint extends ScopedConstraint>(
  constraint: TConstraint,
  sessions: number[] | undefined,
): TConstraint {
  if (!sessions || sessions.length === 0) {
    const { sessions: _removed, ...rest } = constraint as TConstraint & { sessions?: number[] };
    return rest as TConstraint;
  }

  return {
    ...constraint,
    sessions,
  } as TConstraint;
}

export function planSessionCountReduction({ scenario, nextSessionCount }: PlanSessionCountReductionArgs): SessionCountReductionPlan {
  const previousSessionCount = Math.max(0, scenario.num_sessions);
  const normalizedNextCount = Math.max(1, Math.floor(Number(nextSessionCount) || 0));

  if (normalizedNextCount >= previousSessionCount) {
    const nextScenario = normalizedNextCount === previousSessionCount
      ? scenario
      : {
          ...scenario,
          num_sessions: normalizedNextCount,
        };

    return {
      previousSessionCount,
      nextSessionCount: normalizedNextCount,
      canApply: true,
      nextScenario,
      summary: {
        peopleTrimmed: 0,
        groupsTrimmed: 0,
        constraintsTrimmed: 0,
        constraintsRemoved: 0,
        pairMeetingConstraintsNeedingReview: 0,
        allowedSessionsTrimmed: false,
      },
      changes: [],
      blockers: [],
    };
  }

  const changes: SessionReductionChange[] = [];
  const blockers: SessionReductionBlocker[] = [];
  const peopleById = new Map(scenario.people.map((person) => [person.id, person]));

  const nextGroups = scenario.groups.map((group) => {
    const truncatedSessionSizes = Array.isArray(group.session_sizes)
      ? group.session_sizes.slice(0, normalizedNextCount)
      : undefined;

    if (Array.isArray(group.session_sizes) && group.session_sizes.length > normalizedNextCount) {
      changes.push({
        kind: 'group-session-sizes-trimmed',
        title: `Group ${group.id}`,
        detail: `Per-session capacities will be truncated from ${group.session_sizes.length} entries to ${normalizedNextCount}.`,
      });
    }

    return {
      ...group,
      session_sizes: truncatedSessionSizes && truncatedSessionSizes.length > 0 ? truncatedSessionSizes : undefined,
    };
  });

  let peopleTrimmed = 0;
  let groupsTrimmed = changes.filter((change) => change.kind === 'group-session-sizes-trimmed').length;
  const nextPeople = scenario.people.map((person) => {
    const normalizedSessions = normalizeExplicitSessions(person.sessions, previousSessionCount);
    if (!normalizedSessions) {
      return person;
    }

    const trimmedSessions = normalizedSessions.filter((session) => session < normalizedNextCount);
    if (trimmedSessions.length === normalizedSessions.length) {
      return person;
    }

    if (trimmedSessions.length === 0) {
      blockers.push({
        kind: 'person-loses-all-sessions',
        title: `Person ${person.id}`,
        detail: `This person would lose all remaining participation because they are currently limited to deleted sessions (${formatSessionList(normalizedSessions)}).`,
      });
      return person;
    }

    peopleTrimmed += 1;
    changes.push({
      kind: 'person-sessions-trimmed',
      title: `Person ${person.id}`,
      detail: `Participation will change from sessions ${formatSessionList(normalizedSessions)} to ${formatSessionList(trimmedSessions)}.`,
    });

    return {
      ...person,
      sessions: trimmedSessions,
    };
  });

  let constraintsTrimmed = 0;
  let constraintsRemoved = 0;
  let pairMeetingConstraintsNeedingReview = 0;
  const nextConstraints: Constraint[] = [];

  for (const constraint of scenario.constraints) {
    if (constraint.type === 'RepeatEncounter') {
      nextConstraints.push(constraint);
      continue;
    }

    if (constraint.type === 'PairMeetingCount') {
      const normalizedSessions = normalizeExplicitSessions(constraint.sessions, previousSessionCount);
      const effectiveSessions = normalizedSessions ?? buildAllSessions(normalizedNextCount);
      const trimmedSessions = normalizedSessions?.filter((session) => session < normalizedNextCount);

      if (normalizedSessions && (!trimmedSessions || trimmedSessions.length === 0)) {
        constraintsRemoved += 1;
        changes.push({
          kind: 'constraint-removed',
          title: formatConstraintTitle(constraint),
          detail: `This constraint will be removed because it only applied to deleted sessions (${formatSessionList(normalizedSessions)}).`,
        });
        continue;
      }

      const nextConstraint = normalizedSessions && trimmedSessions && trimmedSessions.length !== normalizedSessions.length
        ? cloneConstraintWithSessions(constraint, trimmedSessions)
        : constraint;
      const nextEffectiveSessions = (trimmedSessions && trimmedSessions.length > 0)
        ? trimmedSessions
        : buildAllSessions(normalizedNextCount);
      const maxMeetings = nextEffectiveSessions.length;
      const feasibleMeetings = computePairMeetingFeasibleSessions(
        peopleById,
        constraint.people,
        nextEffectiveSessions,
        normalizedNextCount,
      );
      const mode = constraint.mode ?? 'at_least';
      const violatesSubsetBound = constraint.target_meetings > maxMeetings;
      const violatesFeasibility = (mode === 'at_least' || mode === 'exact')
        && constraint.target_meetings > feasibleMeetings;

      if (violatesSubsetBound || violatesFeasibility) {
        pairMeetingConstraintsNeedingReview += 1;
        blockers.push({
          kind: 'pair-meeting-target-invalid',
          title: formatConstraintTitle(constraint),
          detail: violatesSubsetBound
            ? `Target meetings (${constraint.target_meetings}) exceed the remaining session scope (${maxMeetings}).`
            : `Target meetings (${constraint.target_meetings}) are no longer achievable after reduction; the pair can co-participate in only ${feasibleMeetings} remaining session${feasibleMeetings === 1 ? '' : 's'}.`,
        });
        continue;
      }

      if (normalizedSessions && trimmedSessions && trimmedSessions.length !== normalizedSessions.length) {
        constraintsTrimmed += 1;
        changes.push({
          kind: 'constraint-sessions-trimmed',
          title: formatConstraintTitle(constraint),
          detail: `Scoped sessions will change from ${formatSessionList(normalizedSessions)} to ${formatSessionList(trimmedSessions)}.`,
        });
        nextConstraints.push(nextConstraint);
        continue;
      }

      nextConstraints.push(nextConstraint);
      continue;
    }

    if (
      constraint.type === 'AttributeBalance'
      || constraint.type === 'ImmovablePerson'
      || constraint.type === 'ImmovablePeople'
      || constraint.type === 'MustStayTogether'
      || constraint.type === 'MustStayApart'
      || constraint.type === 'ShouldStayTogether'
      || constraint.type === 'ShouldNotBeTogether'
    ) {
      const normalizedSessions = normalizeExplicitSessions(constraint.sessions, previousSessionCount);
      if (!normalizedSessions) {
        nextConstraints.push(constraint);
        continue;
      }

      const trimmedSessions = normalizedSessions.filter((session) => session < normalizedNextCount);
      if (trimmedSessions.length === normalizedSessions.length) {
        nextConstraints.push(constraint);
        continue;
      }

      if (trimmedSessions.length === 0) {
        constraintsRemoved += 1;
        changes.push({
          kind: 'constraint-removed',
          title: formatConstraintTitle(constraint),
          detail: `This constraint will be removed because it only applied to deleted sessions (${formatSessionList(normalizedSessions)}).`,
        });
        continue;
      }

      constraintsTrimmed += 1;
      changes.push({
        kind: 'constraint-sessions-trimmed',
        title: formatConstraintTitle(constraint),
        detail: `Scoped sessions will change from ${formatSessionList(normalizedSessions)} to ${formatSessionList(trimmedSessions)}.`,
      });
      nextConstraints.push(cloneConstraintWithSessions(constraint, trimmedSessions));
      continue;
    }

    nextConstraints.push(constraint);
  }

  const normalizedAllowedSessions = normalizeExplicitSessions(scenario.settings.allowed_sessions, previousSessionCount);
  const trimmedAllowedSessions = normalizedAllowedSessions?.filter((session) => session < normalizedNextCount);
  const allowedSessionsTrimmed = Boolean(normalizedAllowedSessions && trimmedAllowedSessions && trimmedAllowedSessions.length !== normalizedAllowedSessions.length);

  if (normalizedAllowedSessions && trimmedAllowedSessions && trimmedAllowedSessions.length === 0) {
    blockers.push({
      kind: 'allowed-sessions-empty',
      title: 'Allowed solver sessions',
      detail: `The solver is currently limited to sessions ${formatSessionList(normalizedAllowedSessions)}, which would leave no allowed sessions after the reduction.`,
    });
  } else if (allowedSessionsTrimmed && trimmedAllowedSessions) {
    changes.push({
      kind: 'allowed-sessions-trimmed',
      title: 'Allowed solver sessions',
      detail: `Allowed solver sessions will change from ${formatSessionList(normalizedAllowedSessions!)} to ${formatSessionList(trimmedAllowedSessions)}.`,
    });
  }

  const nextScenario = blockers.length === 0
    ? {
        ...scenario,
        groups: nextGroups,
        people: nextPeople,
        num_sessions: normalizedNextCount,
        constraints: nextConstraints,
        settings: {
          ...scenario.settings,
          ...(normalizedAllowedSessions
            ? {
                allowed_sessions: trimmedAllowedSessions,
              }
            : {}),
        },
      }
    : null;

  if (nextScenario && !normalizedAllowedSessions && Object.hasOwn(nextScenario.settings, 'allowed_sessions') && nextScenario.settings.allowed_sessions === undefined) {
    delete nextScenario.settings.allowed_sessions;
  }

  groupsTrimmed = changes.filter((change) => change.kind === 'group-session-sizes-trimmed').length;

  return {
    previousSessionCount,
    nextSessionCount: normalizedNextCount,
    canApply: blockers.length === 0,
    nextScenario,
    summary: {
      peopleTrimmed,
      groupsTrimmed,
      constraintsTrimmed,
      constraintsRemoved,
      pairMeetingConstraintsNeedingReview,
      allowedSessionsTrimmed,
    },
    changes,
    blockers,
  };
}

export function buildSessionReductionInvalidations({
  hasActiveSolution,
  hasWarmStartSelection,
  hasManualEditorState,
}: BuildSessionReductionInvalidationsArgs): SessionReductionInvalidation[] {
  const invalidations: SessionReductionInvalidation[] = [];

  if (hasActiveSolution) {
    invalidations.push({
      kind: 'active-solution',
      title: 'Current result will be cleared',
      detail: 'The active solver result no longer matches the reduced session horizon and will be removed from the workspace view.',
    });
  }

  if (hasWarmStartSelection) {
    invalidations.push({
      kind: 'warm-start-selection',
      title: 'Warm start selection will be cleared',
      detail: 'Any selected warm-start result will be deselected because its schedule may reference deleted sessions.',
    });
  }

  if (hasManualEditorState) {
    invalidations.push({
      kind: 'manual-editor-state',
      title: 'Manual editor state will be reset',
      detail: 'Unsaved manual-editor changes are tied to the old session shape and will be discarded.',
    });
  }

  return invalidations;
}
