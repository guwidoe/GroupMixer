import React, { useState } from 'react';
import { SetupSectionHeader } from '../shared/SetupSectionHeader';

interface SessionsSectionProps {
  sessionsCount: number;
  onChangeSessionsCount: (count: number) => void;
}

export function SessionsSection({ sessionsCount, onChangeSessionsCount }: SessionsSectionProps) {
  const [inputValue, setInputValue] = useState<string | undefined>(undefined);

  const isInvalid = (() => {
    if (inputValue !== undefined) {
      return inputValue === '' || isNaN(parseInt(inputValue)) || parseInt(inputValue) < 1;
    }
    return sessionsCount < 1;
  })();

  return (
    <div className="space-y-5">
      <SetupSectionHeader
        title="Sessions"
        count={sessionsCount}
        description={
          <p>
            Sessions define the top-level schedule horizon. Every other setup page depends on this structure, so keep
            the session count accurate before refining groups, people, and constraints.
          </p>
        }
      />

      <div className="rounded-2xl border px-6 py-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Number of Sessions
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={inputValue ?? sessionsCount.toString()}
              onChange={(event) => setInputValue(event.target.value)}
              onBlur={() => {
                const countValue = inputValue ?? sessionsCount.toString();
                const count = parseInt(countValue);
                if (!isNaN(count) && count >= 1) {
                  onChangeSessionsCount(count);
                  setInputValue(undefined);
                }
              }}
              className={`input w-32 ${isInvalid ? 'border-red-500 focus:border-red-500' : ''}`}
            />
            <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              The solver will distribute people into groups across {sessionsCount} session{sessionsCount === 1 ? '' : 's'}.
              Each person can be assigned to one group per session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
