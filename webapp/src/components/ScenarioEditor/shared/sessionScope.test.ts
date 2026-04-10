import { describe, expect, it } from 'vitest';
import {
  createAllSessionScopeDraft,
  describeSessionScopeDraft,
  formatSessionScopeDraft,
  normalizeSessionSelection,
  optionalSessionsToDraft,
  sessionScopeDraftToOptionalSessions,
  validateSessionScopeDraft,
} from './sessionScope';

describe('sessionScope', () => {
  it('maps undefined optional sessions to the all-sessions draft mode', () => {
    expect(optionalSessionsToDraft(undefined, 3)).toEqual(createAllSessionScopeDraft());
  });

  it('normalizes selected sessions without collapsing an explicit full selection', () => {
    expect(optionalSessionsToDraft([2, 1, 1, 0], 3)).toEqual({
      mode: 'selected',
      sessions: [0, 1, 2],
    });

    expect(sessionScopeDraftToOptionalSessions({ mode: 'selected', sessions: [2, 1, 0] }, 3)).toEqual([0, 1, 2]);
  });

  it('formats implicit all differently from explicit selected sessions', () => {
    expect(formatSessionScopeDraft({ mode: 'all' }, 3)).toBe('All sessions');
    expect(formatSessionScopeDraft({ mode: 'selected', sessions: [0, 1, 2] }, 3)).toBe('Selected: 1, 2, 3');
  });

  it('describes implicit all as future-proof and explicit full selection as fixed', () => {
    expect(describeSessionScopeDraft({ mode: 'all' }, 3)).toContain('future');
    expect(describeSessionScopeDraft({ mode: 'selected', sessions: [0, 1, 2] }, 3)).toContain('Future sessions will not be included automatically');
  });

  it('validates raw JSON session-scope objects', () => {
    expect(validateSessionScopeDraft({ mode: 'all' }, 3)).toEqual({
      ok: true,
      value: { mode: 'all' },
    });

    expect(validateSessionScopeDraft({ mode: 'selected', sessions: [0, 2] }, 3)).toEqual({
      ok: true,
      value: { mode: 'selected', sessions: [0, 2] },
    });

    expect(validateSessionScopeDraft({ mode: 'selected', sessions: [0, 3] }, 3)).toEqual({
      ok: false,
      error: 'Expected Sessions.sessions to contain unique integers between 0 and 2.',
    });
  });

  it('normalizes session selections to unique sorted integers', () => {
    expect(normalizeSessionSelection([2, 2, 1, -1, 0.2, 4], 4)).toEqual([1, 2]);
  });
});
