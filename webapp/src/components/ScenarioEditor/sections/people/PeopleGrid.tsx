import React from 'react';
import { Tag, Users } from 'lucide-react';
import type { Person } from '../../../../types';
import { PeopleEmptyState } from './PeopleEmptyState';
import { PeopleSearchSummary } from './PeopleSearchSummary';
import { SetupItemActions, SetupItemCard, SetupKeyValueList, SetupSessionsBadgeList, SetupTagList } from '../../shared/cards';

interface PeopleGridProps {
  people: Person[];
  totalCount: number;
  hasAttributes: boolean;
  peopleSearch: string;
  searchValue: string;
  onClearSearch: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
}

export function PeopleGrid({
  people,
  totalCount,
  hasAttributes,
  peopleSearch,
  searchValue,
  onClearSearch,
  onEditPerson,
  onDeletePerson,
}: PeopleGridProps) {
  if (totalCount === 0) {
    return <PeopleEmptyState hasAttributes={hasAttributes} />;
  }

  return (
    <>
      <PeopleSearchSummary
        filteredCount={people.length}
        totalCount={totalCount}
        searchValue={searchValue}
        peopleSearch={peopleSearch}
        onClear={onClearSearch}
        variant="grid"
      />
      {people.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p>No matching people</p>
          {searchValue && (
            <p className="text-sm">
              Try a different search or{' '}
              <button onClick={onClearSearch} className="underline">
                clear the filter
              </button>
              .
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {people.map((person) => {
            const displayName = person.attributes.name || person.id;
            const sessionText = person.sessions
              ? `Sessions: ${person.sessions.map((s) => s + 1).join(', ')}`
              : 'All sessions';

            return (
              <SetupItemCard
                key={person.id}
                title={displayName}
                titleMeta={person.id !== displayName ? person.id : undefined}
                onOpen={() => onEditPerson(person)}
                openLabel={`Edit ${displayName}`}
                actions={
                  <SetupItemActions
                    deleteLabel={`Delete ${displayName}`}
                    onDelete={() => onDeletePerson(person.id)}
                    variant="card"
                  />
                }
              >
                <SetupKeyValueList items={[{ label: 'Availability', value: sessionText }]} />
                <SetupSessionsBadgeList sessions={person.sessions} />
                {Object.entries(person.attributes).some(([key]) => key !== 'name') ? (
                  <SetupTagList
                    items={Object.entries(person.attributes)
                      .filter(([key]) => key !== 'name')
                      .map(([key, value]) => (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                        >
                          <Tag className="h-3 w-3" />
                          <span>{key}: {value}</span>
                        </span>
                      ))}
                  />
                ) : null}
              </SetupItemCard>
            );
          })}
        </div>
      )}
    </>
  );
}
