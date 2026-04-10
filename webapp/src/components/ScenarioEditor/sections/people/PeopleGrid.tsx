import React from 'react';
import { Users } from 'lucide-react';
import type { Person } from '../../../../types';
import { PeopleEmptyState } from './PeopleEmptyState';
import { PeopleSearchSummary } from './PeopleSearchSummary';
import { SetupCardGrid, SetupItemActions, SetupItemCard, SetupKeyValueList, SetupSessionsBadgeList } from '../../shared/cards';
import { SetupPersonName } from '../../shared/personDisplay';

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
        <SetupCardGrid minColumnWidth="18rem">
          {people.map((person) => {
            const displayName = person.attributes.name;
            const detailItems = Object.entries(person.attributes)
              .filter(([key]) => key !== 'name')
              .map(([key, value]) => ({
                label: key,
                value,
              }));

            return (
              <SetupItemCard
                key={person.id}
                title={<SetupPersonName people={people} personId={person.id} className="font-semibold" />}
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
                <SetupSessionsBadgeList sessions={person.sessions} />
                {detailItems.length > 0 ? <SetupKeyValueList items={detailItems} /> : null}
              </SetupItemCard>
            );
          })}
        </SetupCardGrid>
      )}
    </>
  );
}
