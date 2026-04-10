export type SessionScopeDraft =
  | { mode: 'all' }
  | { mode: 'selected'; sessions: number[] };

export type SessionScopeDraftParseResult =
  | { ok: true; value: SessionScopeDraft }
  | { ok: false; error: string };

export function createAllSessionScopeDraft(): SessionScopeDraft {
  return { mode: 'all' };
}

export function createAllSessionIndices(totalSessions: number): number[] {
  return Array.from({ length: Math.max(0, totalSessions) }, (_, index) => index);
}

export function normalizeSessionSelection(
  sessions: number[] | undefined,
  totalSessions?: number,
): number[] {
  const maxSessions = typeof totalSessions === 'number' ? Math.max(0, totalSessions) : undefined;
  const seen = new Set<number>();

  return (sessions ?? [])
    .map((session) => Number(session))
    .filter((session) => Number.isInteger(session))
    .filter((session) => session >= 0)
    .filter((session) => maxSessions === undefined || session < maxSessions)
    .filter((session) => {
      if (seen.has(session)) {
        return false;
      }
      seen.add(session);
      return true;
    })
    .sort((left, right) => left - right);
}

export function optionalSessionsToDraft(
  sessions: number[] | undefined,
  totalSessions?: number,
): SessionScopeDraft {
  const normalized = normalizeSessionSelection(sessions, totalSessions);
  if (normalized.length === 0) {
    return createAllSessionScopeDraft();
  }
  return {
    mode: 'selected',
    sessions: normalized,
  };
}

export function sessionScopeDraftToOptionalSessions(
  draft: SessionScopeDraft,
  totalSessions?: number,
): number[] | undefined {
  if (draft.mode === 'all') {
    return undefined;
  }
  return normalizeSessionSelection(draft.sessions, totalSessions);
}

export function getDraftSessionSelection(
  draft: SessionScopeDraft,
  totalSessions: number,
): number[] {
  if (draft.mode === 'all') {
    return createAllSessionIndices(totalSessions);
  }
  return normalizeSessionSelection(draft.sessions, totalSessions);
}

export function formatSessionScopeDraft(
  draft: SessionScopeDraft,
  totalSessions?: number,
): string {
  if (draft.mode === 'all') {
    return 'All sessions';
  }

  const selected = normalizeSessionSelection(draft.sessions, totalSessions).map((session) => String(session + 1));
  if (selected.length === 0) {
    return 'Selected: none';
  }

  return `Selected: ${selected.join(', ')}`;
}

export function describeSessionScopeDraft(
  draft: SessionScopeDraft,
  totalSessions: number,
): string {
  if (draft.mode === 'all') {
    return 'Applies to all current and future sessions.';
  }

  const selected = normalizeSessionSelection(draft.sessions, totalSessions).map((session) => String(session + 1));
  if (selected.length === 0) {
    return 'Choose at least one session.';
  }

  if (selected.length === totalSessions) {
    return `Applies only to the explicitly selected current sessions (${selected.join(', ')}). Future sessions will not be included automatically.`;
  }

  return `Applies only to ${selected.length} selected session${selected.length === 1 ? '' : 's'}: ${selected.join(', ')}.`;
}

export function validateSessionScopeDraft(
  value: unknown,
  totalSessions?: number,
): SessionScopeDraftParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Expected Sessions to be a JSON object.' };
  }

  const mode = (value as { mode?: unknown }).mode;
  if (mode === 'all') {
    return { ok: true, value: { mode: 'all' } };
  }

  if (mode !== 'selected') {
    return { ok: false, error: 'Expected Sessions.mode to be "all" or "selected".' };
  }

  const sessions = (value as { sessions?: unknown }).sessions;
  if (!Array.isArray(sessions)) {
    return { ok: false, error: 'Expected Sessions.sessions to be a JSON array when mode is "selected".' };
  }

  const normalized = normalizeSessionSelection(sessions as number[], totalSessions);
  if (normalized.length !== sessions.length) {
    return {
      ok: false,
      error: totalSessions === undefined
        ? 'Expected Sessions.sessions to contain unique non-negative integers.'
        : `Expected Sessions.sessions to contain unique integers between 0 and ${Math.max(0, totalSessions - 1)}.`,
    };
  }

  return {
    ok: true,
    value: {
      mode: 'selected',
      sessions: normalized,
    },
  };
}
