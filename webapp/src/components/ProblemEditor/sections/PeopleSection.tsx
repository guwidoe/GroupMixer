import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit,
  Hash,
  Plus,
  Table,
  Tag,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import type { AttributeDefinition, Person, Problem } from '../../../types';
import { useOutsideClick } from '../../../hooks';

interface PeopleSectionProps {
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  onAddAttribute: () => void;
  onEditAttribute: (definition: AttributeDefinition) => void;
  onRemoveAttribute: (key: string) => void;
  onAddPerson: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  onOpenBulkAddForm: () => void;
  onOpenBulkUpdateForm: () => void;
  onTriggerCsvUpload: () => void;
  onTriggerExcelImport: () => void;
}

export function PeopleSection({
  problem,
  attributeDefinitions,
  sessionsCount,
  onAddAttribute,
  onEditAttribute,
  onRemoveAttribute,
  onAddPerson,
  onEditPerson,
  onDeletePerson,
  onOpenBulkAddForm,
  onOpenBulkUpdateForm,
  onTriggerCsvUpload,
  onTriggerExcelImport,
}: PeopleSectionProps) {
  const [showAttributesSection, setShowAttributesSection] = useState(false);
  const [peopleViewMode, setPeopleViewMode] = useState<'grid' | 'list'>('grid');
  const [peopleSortBy, setPeopleSortBy] = useState<'name' | 'sessions'>('name');
  const [peopleSortOrder, setPeopleSortOrder] = useState<'asc' | 'desc'>('asc');
  const [peopleSearch, setPeopleSearch] = useState('');
  const bulkDropdownRef = useRef<HTMLDivElement>(null);
  const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);

  useOutsideClick({
    refs: [bulkDropdownRef],
    onOutsideClick: () => setBulkDropdownOpen(false),
    enabled: bulkDropdownOpen,
  });

  useEffect(() => {
    if (attributeDefinitions.length === 0) {
      setShowAttributesSection(true);
    }
  }, [attributeDefinitions.length]);

  const sortPeople = (people: Person[]) => {
    const sortedPeople = [...people];
    sortedPeople.sort((a, b) => {
      if (peopleSortBy === 'name') {
        const nameA = (a.attributes?.name || a.id).toLowerCase();
        const nameB = (b.attributes?.name || b.id).toLowerCase();
        return peopleSortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      const sessionsA = a.sessions?.length || sessionsCount || 0;
      const sessionsB = b.sessions?.length || sessionsCount || 0;
      return peopleSortOrder === 'asc' ? sessionsA - sessionsB : sessionsB - sessionsA;
    });
    return sortedPeople;
  };

  const handleSortToggle = (sortBy: 'name' | 'sessions') => {
    if (peopleSortBy === sortBy) {
      setPeopleSortOrder(peopleSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setPeopleSortBy(sortBy);
      setPeopleSortOrder('asc');
    }
  };

  const renderPersonCard = (person: Person) => {
    const displayName = person.attributes.name || person.id;
    const sessionText = person.sessions
      ? `Sessions: ${person.sessions.map(s => s + 1).join(', ')}`
      : 'All sessions';

    return (
      <div key={person.id} className="rounded-lg border p-4 hover:shadow-md transition-all" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{displayName}</h4>
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
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{value}</span>
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
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-accent)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDeletePerson(person.id)}
              className="p-1 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-error-600)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPeopleGrid = () => {
    if (!problem?.people.length) {
      return (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p>No people added yet</p>
          <p className="text-sm">
            {attributeDefinitions.length === 0
              ? 'Consider defining attributes first, then add people to get started'
              : 'Add people to get started with your optimization problem'
            }
          </p>
        </div>
      );
    }

    const searchValue = peopleSearch.trim().toLowerCase();
    const basePeople = problem.people;
    const filteredPeople = searchValue
      ? basePeople.filter(p => {
          const name = (p.attributes?.name || '').toString().toLowerCase();
          const id = p.id.toLowerCase();
          return name.includes(searchValue) || id.includes(searchValue);
        })
      : basePeople;

    const sortedPeople = sortPeople(filteredPeople);

    return (
      <>
        {searchValue && (
          <div className="mb-3 text-xs px-3 py-2 rounded border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-secondary)', color: 'var(--text-secondary)' }}>
            Showing {sortedPeople.length} of {basePeople.length} people for "{peopleSearch}".
            <button onClick={() => setPeopleSearch('')} className="ml-2 underline">Clear filter</button>
          </div>
        )}
        {sortedPeople.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
            <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
            <p>No matching people</p>
            {searchValue && (
              <p className="text-sm">Try a different search or <button onClick={() => setPeopleSearch('')} className="underline">clear the filter</button>.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedPeople.map(renderPersonCard)}
          </div>
        )}
      </>
    );
  };

  const renderPeopleList = () => {
    if (!problem?.people.length) {
      return (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p>No people added yet</p>
          <p className="text-sm">
            {attributeDefinitions.length === 0
              ? 'Consider defining attributes first, then add people to get started'
              : 'Add people to get started with your optimization problem'
            }
          </p>
        </div>
      );
    }

    const searchValue = peopleSearch.trim().toLowerCase();
    const basePeople = problem.people;
    const filteredPeople = searchValue
      ? basePeople.filter(p => {
          const name = (p.attributes?.name || '').toString().toLowerCase();
          const id = p.id.toLowerCase();
          return name.includes(searchValue) || id.includes(searchValue);
        })
      : basePeople;

    const sortedPeople = sortPeople(filteredPeople);

    return (
      <div className="rounded-lg border overflow-hidden transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        {searchValue && (
          <div className="px-6 pt-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Showing {sortedPeople.length} of {basePeople.length} people for "{peopleSearch}". <button onClick={() => setPeopleSearch('')} className="underline">Clear filter</button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  <button
                    onClick={() => handleSortToggle('name')}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                  >
                    Name
                    <ArrowUpDown className="w-3 h-3" />
                    {peopleSortBy === 'name' && (
                      <span className="text-xs">{peopleSortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  <button
                    onClick={() => handleSortToggle('sessions')}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                  >
                    Sessions
                    <ArrowUpDown className="w-3 h-3" />
                    {peopleSortBy === 'sessions' && (
                      <span className="text-xs">{peopleSortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
                {attributeDefinitions.map(attr => (
                  <th key={attr.key} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    {attr.key}
                  </th>
                ))}
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}>
              {sortedPeople.length === 0 ? (
                <tr>
                  <td className="px-6 py-6 text-center" colSpan={2 + attributeDefinitions.length + 1} style={{ color: 'var(--text-secondary)' }}>
                    No matching people{searchValue ? ' for your search' : ''}.
                  </td>
                </tr>
              ) : (
                sortedPeople.map(person => {
                  const displayName = person.attributes.name || person.id;
                  const sessionText = person.sessions
                    ? `${person.sessions.length}/${sessionsCount} (${person.sessions.map(s => s + 1).join(', ')})`
                    : `All (${sessionsCount})`;

                  return (
                    <tr key={person.id} className="transition-colors" style={{ backgroundColor: 'var(--bg-primary)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Users className="w-4 h-4 mr-2" style={{ color: 'var(--text-tertiary)' }} />
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{displayName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-2" style={{ color: 'var(--text-tertiary)' }} />
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{sessionText}</span>
                        </div>
                      </td>
                      {attributeDefinitions.map(attr => (
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
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setShowAttributesSection(!showAttributesSection)}
          className="flex items-center gap-2 text-left transition-colors min-w-0"
          style={{ flex: '1 1 0%' }}
        >
          {showAttributesSection ? (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <Tag className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          <h3 className="text-base font-medium truncate" style={{ color: 'var(--text-primary)', maxWidth: '100%', fontSize: 'clamp(0.9rem, 4vw, 1.1rem)' }}>
            Attribute Definitions ({attributeDefinitions.length})
          </h3>
        </button>
        <button
          onClick={onAddAttribute}
          className="btn-primary flex items-center gap-2 px-3 py-1.5 text-sm"
        >
          <Plus className="w-3 h-3" />
          Add Attribute
        </button>
      </div>

      {showAttributesSection && (
        <div className="rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          <div className="p-4 space-y-3">
            <div className="rounded-md p-3 border text-sm" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>
                Attributes are key-value pairs that describe people (e.g., gender, department, seniority).
                Define them here before adding people to use them in constraints like attribute balance.
              </p>
            </div>

            {attributeDefinitions.length ? (
              <div className="space-y-2">
                {attributeDefinitions.map(def => (
                  <div key={def.key} className="rounded-lg border p-3 transition-colors" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium capitalize text-sm" style={{ color: 'var(--text-primary)' }}>{def.key}</h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {def.values.map(value => (
                            <span key={value} style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }} className="px-2 py-0.5 rounded-full text-xs font-medium">
                              {value}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => onEditAttribute(def)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onRemoveAttribute(def.key)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                <Tag className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-sm">No attributes defined yet</p>
                <p className="text-xs">Click "Add Attribute" to get started</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="border-b px-6 py-4" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
            <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              People ({problem?.people.length || 0})
            </h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-full sm:w-64">
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Search people by name or ID..."
                  value={peopleSearch}
                  onChange={(e) => setPeopleSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPeopleViewMode('grid')}
                  className="px-3 py-1 rounded text-sm transition-colors"
                  style={{
                    backgroundColor: peopleViewMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent',
                    color: peopleViewMode === 'grid' ? 'var(--color-accent)' : 'var(--text-secondary)',
                    border: peopleViewMode === 'grid' ? '1px solid var(--color-accent)' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (peopleViewMode !== 'grid') {
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (peopleViewMode !== 'grid') {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <Hash className="w-4 h-4 inline mr-1" />
                  Grid
                </button>
                <button
                  onClick={() => setPeopleViewMode('list')}
                  className="px-3 py-1 rounded text-sm transition-colors"
                  style={{
                    backgroundColor: peopleViewMode === 'list' ? 'var(--bg-tertiary)' : 'transparent',
                    color: peopleViewMode === 'list' ? 'var(--color-accent)' : 'var(--text-secondary)',
                    border: peopleViewMode === 'list' ? '1px solid var(--color-accent)' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (peopleViewMode !== 'list') {
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (peopleViewMode !== 'list') {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <BarChart3 className="w-4 h-4 inline mr-1" />
                  List
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative" ref={bulkDropdownRef}>
                  <button
                    onClick={() => setBulkDropdownOpen(!bulkDropdownOpen)}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Bulk Add
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {bulkDropdownOpen && (
                    <div className="absolute right-0 mt-1 w-56 rounded-md shadow-lg z-10 border overflow-hidden"
                         style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                      <button
                        onClick={() => {
                          setBulkDropdownOpen(false);
                          onTriggerCsvUpload();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Upload className="w-4 h-4" />
                        Upload CSV
                      </button>
                      <button
                        onClick={() => {
                          setBulkDropdownOpen(false);
                          onTriggerExcelImport();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Upload className="w-4 h-4" />
                        Upload Excel
                      </button>
                      <button
                        onClick={() => {
                          setBulkDropdownOpen(false);
                          onOpenBulkAddForm();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                        style={{ color: 'var(--text-primary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Table className="w-4 h-4" />
                        Open Bulk Form
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={onAddPerson}
                  className="btn-primary flex items-center gap-2 px-4 py-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Person
                </button>
                <button
                  onClick={onOpenBulkUpdateForm}
                  className="btn-secondary flex items-center gap-2 px-4 py-2"
                >
                  <Edit className="w-4 h-4" />
                  Bulk Update
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {peopleViewMode === 'grid' ? renderPeopleGrid() : renderPeopleList()}
        </div>
      </div>
    </div>
  );
}
