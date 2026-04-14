import React from 'react';
import { Users } from 'lucide-react';
import type { ResultsParticipantData } from '../../services/results/buildResultsModel';

interface ResultsScheduleListProps {
  participants: ResultsParticipantData[];
  sessionCount: number;
}

export function ResultsScheduleList({ participants, sessionCount }: ResultsScheduleListProps) {
  return (
    <div className="space-y-4">
      <div className="divide-y md:hidden" style={{ borderColor: 'var(--border-primary)' }}>
        {participants.map((participant) => (
          <section
            key={participant.personId}
            className="results-print-avoid-break py-4 first:pt-0 last:pb-0"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="truncate text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {participant.displayName}
                </h4>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {participant.personId}
                </p>
              </div>
              <span
                className="text-xs font-medium uppercase tracking-[0.08em]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {participant.assignedSessions}/{sessionCount} assigned
              </span>
            </div>

            <div className="mt-4 divide-y" style={{ borderColor: 'var(--border-primary)' }}>
              {participant.sessions.map((assignment) => (
                <div
                  key={assignment.sessionIndex}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                      {assignment.sessionLabel}
                    </div>
                  </div>
                  {assignment.isAssigned && assignment.groupId ? (
                    <span
                      className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}
                    >
                      {assignment.groupId}
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Not assigned</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div
        className="results-print-avoid-break hidden overflow-hidden rounded-[1.25rem] border transition-colors md:block"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Person
                </th>
                {Array.from({ length: sessionCount }, (_, i) => (
                  <th key={i} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Session {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}>
              {participants.map((participant) => {
                return (
                  <tr
                    key={participant.personId}
                    className="transition-colors"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                  >
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-2" style={{ color: 'var(--text-tertiary)' }} />
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{participant.displayName}</div>
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{participant.personId}</div>
                        </div>
                      </div>
                    </td>
                    {participant.sessions.map((assignment) => {
                      return (
                        <td key={assignment.sessionIndex} className="px-6 py-4 whitespace-nowrap align-top">
                          {assignment.isAssigned && assignment.groupId ? (
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}
                            >
                              {assignment.groupId}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Not assigned</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
