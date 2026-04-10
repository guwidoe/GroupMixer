import React from 'react';
import type { ScenarioDataGridCustomColumn } from './types';
import { SessionScopeField } from '../SessionScopeField';
import {
  createAllSessionScopeDraft,
  formatSessionScopeDraft,
  optionalSessionsToDraft,
  sessionScopeDraftToOptionalSessions,
  validateSessionScopeDraft,
  type SessionScopeDraft,
} from '../sessionScope';
import { createJsonRawCodec } from './model/rawCodec';

interface CreateOptionalSessionScopeColumnArgs<T> {
  id?: string;
  header?: string;
  totalSessions: number;
  getSessions: (row: T) => number[] | undefined;
  setSessions: (row: T, sessions: number[] | undefined) => T;
  width?: number;
  minWidth?: number;
  disabled?: (row: T) => boolean;
}

function getSessionScopeSearchText(draft: SessionScopeDraft, totalSessions: number) {
  if (draft.mode === 'all') {
    return 'all sessions implicit all future sessions';
  }

  const label = formatSessionScopeDraft(draft, totalSessions).toLowerCase();
  return `${label} explicit selected sessions fixed current selection`;
}

export function createOptionalSessionScopeColumn<T>({
  id = 'sessions',
  header = 'Sessions',
  totalSessions,
  getSessions,
  setSessions,
  width = 240,
  minWidth = 220,
  disabled,
}: CreateOptionalSessionScopeColumnArgs<T>): ScenarioDataGridCustomColumn<T, SessionScopeDraft> {
  return {
    kind: 'custom',
    id,
    header,
    width,
    minWidth,
    disabled,
    getValue: (row) => optionalSessionsToDraft(getSessions(row), totalSessions),
    setValue: (row, value) => setSessions(
      row,
      sessionScopeDraftToOptionalSessions(value ?? createAllSessionScopeDraft(), totalSessions),
    ),
    renderValue: (value) => formatSessionScopeDraft((value as SessionScopeDraft | undefined) ?? createAllSessionScopeDraft(), totalSessions),
    searchText: (value) => getSessionScopeSearchText(
      (value as SessionScopeDraft | undefined) ?? createAllSessionScopeDraft(),
      totalSessions,
    ),
    filter: {
      type: 'text',
      ariaLabel: `Filter ${header}`,
      getValue: (row) => formatSessionScopeDraft(optionalSessionsToDraft(getSessions(row), totalSessions), totalSessions),
    },
    rawCodec: createJsonRawCodec<SessionScopeDraft, T>({
      header,
      validate: (rawValue) => validateSessionScopeDraft(rawValue, totalSessions),
    }),
    renderEditor: ({ value, onCommit, disabled: isDisabled }) => (
      <SessionScopeField
        compact
        totalSessions={totalSessions}
        value={(value as SessionScopeDraft | undefined) ?? createAllSessionScopeDraft()}
        onChange={onCommit}
        disabled={isDisabled}
      />
    ),
  };
}
