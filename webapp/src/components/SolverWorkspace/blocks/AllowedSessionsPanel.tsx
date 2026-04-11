import React from 'react';
import type { Scenario, SolverSettings } from '../../../types';

interface AllowedSessionsPanelProps {
  scenario: Scenario | null;
  solverSettings: SolverSettings;
  allowedSessionsLocal: number[] | null;
  setAllowedSessionsLocal: React.Dispatch<React.SetStateAction<number[] | null>>;
  handleSettingsChange: (newSettings: Partial<SolverSettings>) => void;
  isRunning: boolean;
}

export function AllowedSessionsPanel({
  scenario,
  solverSettings,
  allowedSessionsLocal,
  setAllowedSessionsLocal,
  handleSettingsChange,
  isRunning,
}: AllowedSessionsPanelProps) {
  const availableSessions = Array.from({ length: scenario?.num_sessions || 0 }, (_, index) => index);

  return (
    <section
      className="rounded-2xl border p-4"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Session Scope
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Limit the solver to specific sessions. Leave it empty to iterate across all sessions.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {availableSessions.map((session) => {
          const selected = (allowedSessionsLocal ?? solverSettings.allowed_sessions ?? []).includes(session);
          return (
            <button
              key={session}
              className={`rounded border px-2 py-1 text-xs ${selected ? 'bg-[var(--bg-tertiary)] text-[var(--color-accent)]' : ''}`}
              style={{
                borderColor: 'var(--border-primary)',
                color: selected ? 'var(--color-accent)' : 'var(--text-secondary)',
              }}
              onClick={() => {
                const current = new Set(allowedSessionsLocal ?? solverSettings.allowed_sessions ?? []);
                if (current.has(session)) {
                  current.delete(session);
                } else {
                  current.add(session);
                }
                const next = Array.from(current).sort((left, right) => left - right);
                setAllowedSessionsLocal(next);
                handleSettingsChange({ allowed_sessions: next.length ? next : undefined });
              }}
              disabled={isRunning}
            >
              Session {session + 1}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn-secondary text-xs"
            onClick={() => {
              setAllowedSessionsLocal(availableSessions);
              handleSettingsChange({ allowed_sessions: availableSessions });
            }}
            disabled={isRunning}
          >
            All
          </button>
          <button
            className="btn-secondary text-xs"
            onClick={() => {
              setAllowedSessionsLocal([]);
              handleSettingsChange({ allowed_sessions: undefined });
            }}
            disabled={isRunning}
          >
            None
          </button>
        </div>
      </div>
    </section>
  );
}
