import React from 'react';
import type { Problem, SolverSettings } from '../../../types';

interface AllowedSessionsSelectorProps {
  problem: Problem | null;
  solverSettings: SolverSettings;
  allowedSessionsLocal: number[] | null;
  setAllowedSessionsLocal: React.Dispatch<React.SetStateAction<number[] | null>>;
  handleSettingsChange: (newSettings: Partial<SolverSettings>) => void;
  isRunning: boolean;
}

export function AllowedSessionsSelector({
  problem,
  solverSettings,
  allowedSessionsLocal,
  setAllowedSessionsLocal,
  handleSettingsChange,
  isRunning,
}: AllowedSessionsSelectorProps) {
  const availableSessions = Array.from({ length: problem?.num_sessions || 0 }, (_, i) => i);

  return (
    <div className="mb-4">
      <div
        className="p-3 rounded-lg"
        style={{ border: '1px solid var(--border-secondary)', backgroundColor: 'var(--background-secondary)' }}
      >
        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
          Sessions to iterate (leave empty = all sessions)
        </label>
        <div className="flex flex-wrap gap-2 items-center">
          {availableSessions.map((session) => {
            const selected = (allowedSessionsLocal ?? solverSettings.allowed_sessions ?? []).includes(session);
            return (
              <button
                key={session}
                className={`px-2 py-1 rounded text-xs border ${selected ? 'bg-[var(--bg-tertiary)] text-[var(--color-accent)]' : ''}`}
                style={{
                  borderColor: 'var(--border-primary)',
                  color: selected ? 'var(--color-accent)' : 'var(--text-secondary)',
                }}
                onClick={() => {
                  const current = new Set(allowedSessionsLocal ?? solverSettings.allowed_sessions ?? []);
                  if (current.has(session)) current.delete(session);
                  else current.add(session);
                  const next = Array.from(current).sort((a, b) => a - b);
                  setAllowedSessionsLocal(next);
                  handleSettingsChange({ allowed_sessions: next.length ? next : undefined });
                }}
                disabled={isRunning}
              >
                Session {session + 1}
              </button>
            );
          })}
          <div className="flex items-center gap-2 ml-auto">
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
      </div>
    </div>
  );
}
