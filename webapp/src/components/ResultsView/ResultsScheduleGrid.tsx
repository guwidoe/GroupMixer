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
    <div className="space-y-8">
      {visibleSessions.map(({ sessionIndex, label, groups, totalPeople, totalCapacity, openSeats }) => (
        <section
          key={sessionIndex}
          className="results-print-avoid-break border-t pt-6 first:border-t-0 first:pt-0"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {label || interpolate(localized.sessionHeadingTemplate, { number: sessionIndex + 1 })}
              </h4>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                {interpolate(localized.peopleAssignedTemplate, { count: totalPeople })} with {totalCapacity} total seats across this session.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>{groups.length} groups</span>
              <span>{openSeats} open seat{openSeats === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-x-8 gap-y-6">
            {groups.map((group) => (
              <section
                key={group.id}
                className="results-print-avoid-break border-l pl-4"
                style={{ borderColor: 'color-mix(in srgb, var(--color-accent) 35%, var(--border-primary))' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h5 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{group.id}</h5>
                  </div>
                  <span className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                    {interpolate(localized.groupPeopleCountTemplate, {
                      count: group.people.length,
                      size: group.size,
                    })}
                  </span>
                </div>

                <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border-primary)' }}>
                  {group.people.length > 0 ? (
                    <ul className="space-y-3">
                      {group.people.map((person) => (
                        <li
                          key={person.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {getPersonDisplayName(person)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>{localized.noAssignmentsLabel}</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
