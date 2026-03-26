import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
    <div className="space-y-4">
      <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Sessions</h3>
      <div className="rounded-md border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowInfo(!showInfo)}
        >
          {showInfo ? (
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>How do Sessions work?</h4>
        </button>
        {showInfo && (
          <div className="p-4 pt-0">
            <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>• Each session represents a time period (e.g., morning, afternoon, day 1, day 2)</li>
              <li>• People are assigned to groups within each session</li>
              <li>• The algorithm maximizes unique contacts across all sessions</li>
              <li>• People can participate in all sessions or only specific ones</li>
            </ul>
          </div>
        )}
      </div>
      <div className="rounded-lg border p-6 transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Number of Sessions
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={inputValue ?? sessionsCount.toString()}
              onChange={(e) => setInputValue(e.target.value)}
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
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              The algorithm will distribute people into groups across {sessionsCount} sessions. Each person can be assigned to one group per session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
