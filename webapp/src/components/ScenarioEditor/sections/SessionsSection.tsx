import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SetupSectionHeader } from '../shared/SetupSectionHeader';

interface SessionsSectionProps {
  sessionsCount: number;
  onChangeSessionsCount: (count: number) => void;
}

export function SessionsSection({ sessionsCount, onChangeSessionsCount }: SessionsSectionProps) {
  const [showInfo, setShowInfo] = useState(false);
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

      <div className="rounded-2xl border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <button className="flex w-full items-center gap-2 px-4 py-4 text-left" onClick={() => setShowInfo(!showInfo)}>
          {showInfo ? (
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            How do sessions work?
          </h4>
        </button>
        {showInfo ? (
          <div className="px-4 pb-4 pt-0">
            <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>• Each session represents a time period such as morning, afternoon, day 1, or day 2.</li>
              <li>• People are assigned to one group per session.</li>
              <li>• The solver maximizes unique contacts across all sessions.</li>
              <li>• People can participate in every session or only selected ones.</li>
            </ul>
          </div>
        ) : null}
      </div>

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
