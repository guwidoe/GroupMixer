import React from 'react';
import type { Person } from '../../types';
import PersonCard from '../PersonCard';

interface SessionGroup {
  id: string;
  size: number;
  people: Person[];
}

interface SessionData {
  sessionIndex: number;
  groups: SessionGroup[];
  totalPeople: number;
}

interface ResultsScheduleGridProps {
  sessionData: SessionData[];
}

export function ResultsScheduleGrid({ sessionData }: ResultsScheduleGridProps) {
  return (
    <div className="space-y-6">
      {sessionData.map(({ sessionIndex, groups, totalPeople }) => (
        <div
          key={sessionIndex}
          className="rounded-lg border p-6 transition-colors"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              Session {sessionIndex + 1}
            </h4>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {totalPeople} people assigned
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((group) => (
              <div key={group.id} className="border rounded-lg p-4" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-medium" style={{ color: 'var(--text-primary)' }}>{group.id}</h5>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {group.people.length}/{group.size}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.people.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {group.people.map((person) => (
                        <PersonCard key={person.id} person={person} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>No assignments</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
