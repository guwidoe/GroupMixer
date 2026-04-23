import React, { useEffect, useState } from 'react';
import { NumberField, NUMBER_FIELD_PRESETS } from '../../ui';
import { SetupSectionHeader } from '../shared/SetupSectionHeader';

interface SessionsSectionProps {
  sessionsCount: number;
  onChangeSessionsCount: (count: number) => void;
}

export function SessionsSection({ sessionsCount, onChangeSessionsCount }: SessionsSectionProps) {
  const [draftSessions, setDraftSessions] = useState<number | null>(sessionsCount);

  useEffect(() => {
    setDraftSessions(sessionsCount);
  }, [sessionsCount]);

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
            <NumberField
              label="Number of Sessions"
              value={draftSessions}
              onChange={(value) => setDraftSessions(value ?? sessionsCount)}
              onCommit={(value) => onChangeSessionsCount(Math.max(1, value ?? sessionsCount))}
              {...NUMBER_FIELD_PRESETS.sessionCount}
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
