import React from 'react';
import {
  createAllSessionIndices,
  createAllSessionScopeDraft,
  describeSessionScopeDraft,
  getDraftSessionSelection,
  normalizeSessionSelection,
  type SessionScopeDraft,
} from './sessionScope';

interface SessionScopeFieldProps {
  totalSessions: number;
  value: SessionScopeDraft;
  onChange: (value: SessionScopeDraft) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  compact?: boolean;
}

export function SessionScopeField({
  totalSessions,
  value,
  onChange,
  label,
  disabled = false,
  compact = false,
}: SessionScopeFieldProps) {
  const inputName = React.useId();
  const selectedSessions = value.mode === 'selected'
    ? normalizeSessionSelection(value.sessions, totalSessions)
    : getDraftSessionSelection(value, totalSessions);

  const switchToAll = React.useCallback(() => {
    onChange(createAllSessionScopeDraft());
  }, [onChange]);

  const switchToSelected = React.useCallback(() => {
    onChange({
      mode: 'selected',
      sessions: value.mode === 'selected' ? selectedSessions : createAllSessionIndices(totalSessions),
    });
  }, [onChange, selectedSessions, totalSessions, value.mode]);

  const toggleSession = React.useCallback((sessionIndex: number) => {
    if (value.mode !== 'selected') {
      onChange({ mode: 'selected', sessions: [sessionIndex] });
      return;
    }

    const nextSessions = selectedSessions.includes(sessionIndex)
      ? selectedSessions.filter((session) => session !== sessionIndex)
      : [...selectedSessions, sessionIndex];

    onChange({
      mode: 'selected',
      sessions: normalizeSessionSelection(nextSessions, totalSessions),
    });
  }, [onChange, selectedSessions, totalSessions, value.mode]);

  const toneClass = compact ? 'space-y-2 rounded-lg p-2.5' : 'space-y-3 rounded-xl p-3';
  const optionClass = compact
    ? 'rounded-md border px-3 py-2'
    : 'rounded-lg border px-3 py-2.5';
  const sessionGridClass = compact
    ? 'grid grid-cols-2 gap-2 sm:grid-cols-3'
    : 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4';

  return (
    <div>
      {label ? (
        <div className="mb-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </div>
      ) : null}
      <div className={toneClass} style={{ border: '1px solid var(--border-secondary)' }}>
        <div className="space-y-2">
          <label className={optionClass} style={{ borderColor: 'var(--border-secondary)' }}>
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name={inputName}
                checked={value.mode === 'all'}
                onChange={switchToAll}
                disabled={disabled}
                className="mt-0.5 h-4 w-4"
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  All sessions
                </div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Applies to all current sessions and automatically includes future sessions.
                </div>
              </div>
            </div>
          </label>

          <label className={optionClass} style={{ borderColor: 'var(--border-secondary)' }}>
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name={inputName}
                checked={value.mode === 'selected'}
                onChange={switchToSelected}
                disabled={disabled}
                className="mt-0.5 h-4 w-4"
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Only selected sessions
                </div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Freezes the current selection even if more sessions are added later.
                </div>
              </div>
            </div>
          </label>
        </div>

        {value.mode === 'selected' ? (
          totalSessions > 0 ? (
            <div className={sessionGridClass}>
              {Array.from({ length: totalSessions }, (_, index) => (
                <label
                  key={index}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <input
                    type="checkbox"
                    checked={selectedSessions.includes(index)}
                    onChange={() => toggleSession(index)}
                    disabled={disabled}
                    className="h-4 w-4"
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <span>Session {index + 1}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              No sessions are defined yet.
            </div>
          )
        ) : null}

        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {describeSessionScopeDraft(value, totalSessions)}
        </p>
      </div>
    </div>
  );
}
