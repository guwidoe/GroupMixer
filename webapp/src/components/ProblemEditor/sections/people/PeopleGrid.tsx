import React from 'react';
import { Clock, Edit, Tag, Trash2, Users } from 'lucide-react';
import type { Person } from '../../../../types';
import { PeopleEmptyState } from './PeopleEmptyState';
import { PeopleSearchSummary } from './PeopleSearchSummary';

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
              <div
                key={person.id}
                className="rounded-lg border p-4 hover:shadow-md transition-all"
                style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                      {displayName}
                    </h4>
                    <div className="space-y-1">
                      <p className="text-sm flex items-center gap-1" style={{ color: 'var(--color-accent)' }}>
                        <Clock className="w-3 h-3" />
                        {sessionText}
                      </p>
                      {Object.entries(person.attributes).map(([key, value]) => {
                        if (key === 'name') return null;
                        return (
                          <div key={key} className="flex items-center gap-1 text-xs">
                            <Tag className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                            <span style={{ color: 'var(--text-secondary)' }}>{key}:</span>
                            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onEditPerson(person)}
                      className="p-1 transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeletePerson(person.id)}
                      className="p-1 transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error-600)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
