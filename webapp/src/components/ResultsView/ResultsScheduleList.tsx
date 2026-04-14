import React from 'react';
import { Users } from 'lucide-react';
import type { ResultsParticipantData } from '../../services/results/buildResultsModel';

interface ResultsScheduleListProps {
  participants: ResultsParticipantData[];
  sessionCount: number;
}

export function ResultsScheduleList({ participants, sessionCount }: ResultsScheduleListProps) {
  return (
    <div
      className="rounded-lg border overflow-hidden transition-colors"
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Users className="w-4 h-4 mr-2" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{participant.displayName}</span>
                    </div>
                  </td>
                  {participant.sessions.map((assignment) => {
                    return (
                      <td key={assignment.sessionIndex} className="px-6 py-4 whitespace-nowrap">
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
  );
}
