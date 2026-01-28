import React from 'react';
import { ArrowUpDown, Clock, Edit, Trash2, Users } from 'lucide-react';
import type { AttributeDefinition, Person } from '../../../../types';
import type { PeopleSortBy, PeopleSortOrder } from './peopleUtils';
import { PeopleEmptyState } from './PeopleEmptyState';
import { PeopleSearchSummary } from './PeopleSearchSummary';

interface PeopleListProps {
  people: Person[];
  totalCount: number;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  sortBy: PeopleSortBy;
  sortOrder: PeopleSortOrder;
  peopleSearch: string;
  searchValue: string;
  onClearSearch: () => void;
  onSortToggle: (sortBy: PeopleSortBy) => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
}

export function PeopleList({
  people,
  totalCount,
  attributeDefinitions,
  sessionsCount,
  sortBy,
  sortOrder,
  peopleSearch,
  searchValue,
  onClearSearch,
  onSortToggle,
  onEditPerson,
  onDeletePerson,
}: PeopleListProps) {
  if (totalCount === 0) {
    return <PeopleEmptyState hasAttributes={attributeDefinitions.length > 0} />;
  }

  return (
    <div
      className="rounded-lg border overflow-hidden transition-colors"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <PeopleSearchSummary
        filteredCount={people.length}
        totalCount={totalCount}
        searchValue={searchValue}
        peopleSearch={peopleSearch}
        onClear={onClearSearch}
        variant="list"
      />
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
          <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                <button
                  onClick={() => onSortToggle('name')}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                >
                  Name
                  <ArrowUpDown className="w-3 h-3" />
                  {sortBy === 'name' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                <button
                  onClick={() => onSortToggle('sessions')}
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                >
                  Sessions
                  <ArrowUpDown className="w-3 h-3" />
                  {sortBy === 'sessions' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              {attributeDefinitions.map((attr) => (
                <th
                  key={attr.key}
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {attr.key}
                </th>
              ))}
              <th
                className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody
            className="divide-y"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}
          >
            {people.length === 0 ? (
              <tr>
                <td
                  className="px-6 py-6 text-center"
                  colSpan={2 + attributeDefinitions.length + 1}
                  style={{ color: 'var(--text-secondary)' }}
                >
                  No matching people{searchValue ? ' for your search' : ''}.
                </td>
              </tr>
            ) : (
              people.map((person) => {
                const displayName = person.attributes.name || person.id;
                const sessionText = person.sessions
                  ? `${person.sessions.length}/${sessionsCount} (${person.sessions.map((s) => s + 1).join(', ')})`
                  : `All (${sessionsCount})`;

                return (
                  <tr
                    key={person.id}
                    className="transition-colors"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-2" style={{ color: 'var(--text-tertiary)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {displayName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-2" style={{ color: 'var(--text-tertiary)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {sessionText}
                        </span>
                      </div>
                    </td>
                    {attributeDefinitions.map((attr) => (
                      <td key={attr.key} className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {person.attributes[attr.key] || '-'}
                        </span>
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => onEditPerson(person)}
                        className="text-gray-400 hover:text-blue-600 transition-colors mr-2"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeletePerson(person.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
