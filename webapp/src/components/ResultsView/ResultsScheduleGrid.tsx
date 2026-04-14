import React from 'react';
import { interpolate } from '../../i18n/interpolate';
import { getPersonDisplayName } from '../../services/scenarioAttributes';
import type { ResultsSessionData } from '../../services/results/buildResultsModel';

interface ResultsScheduleGridProps {
  sessionData: ResultsSessionData[];
  selectedSessionIndex?: number | null;
  labels?: {
    sessionHeadingTemplate?: string;
    peopleAssignedTemplate?: string;
    groupPeopleCountTemplate?: string;
    noAssignmentsLabel?: string;
  };
}

const DEFAULT_LABELS = {
  sessionHeadingTemplate: 'Session {number}',
  peopleAssignedTemplate: '{count} people assigned',
  groupPeopleCountTemplate: '{count}/{size} people',
  noAssignmentsLabel: 'No assignments',
};

export function ResultsScheduleGrid({ sessionData, selectedSessionIndex = null, labels }: ResultsScheduleGridProps) {
  const localized = { ...DEFAULT_LABELS, ...labels };
  const visibleSessions = selectedSessionIndex === null
    ? sessionData
    : sessionData.filter((session) => session.sessionIndex === selectedSessionIndex);

  return (
    <div className="space-y-5">
      {visibleSessions.map(({ sessionIndex, label, groups, totalPeople, totalCapacity, openSeats }) => (
        <div
          key={sessionIndex}
          className="results-print-avoid-break rounded-2xl border p-4 transition-colors sm:p-5"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: 'var(--border-primary)' }}>
            <div>
              <h4 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {label || interpolate(localized.sessionHeadingTemplate, { number: sessionIndex + 1 })}
              </h4>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {interpolate(localized.peopleAssignedTemplate, { count: totalPeople })} • {totalCapacity} total seats
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                {groups.length} groups
              </span>
              <span className="rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                {openSeats} open seat{openSeats === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {groups.map((group) => (
              <div key={group.id} className="results-print-avoid-break rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h5 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{group.id}</h5>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {group.assignedCount === 0
                        ? localized.noAssignmentsLabel
                        : `${group.assignedCount} assigned`}
                    </p>
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    {interpolate(localized.groupPeopleCountTemplate, {
                      count: group.people.length,
                      size: group.size,
                    })}
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(group.fillRatio, 1)) * 100}%`,
                      backgroundColor: 'var(--color-accent)',
                    }}
                  />
                </div>

                <div className="mt-4 space-y-2">
                  {group.people.length > 0 ? (
                    <ul className="space-y-2">
                      {group.people.map((person) => (
                        <li
                          key={person.id}
                          className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {getPersonDisplayName(person)}
                            </div>
                            <div className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {person.id}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>{localized.noAssignmentsLabel}</p>
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
