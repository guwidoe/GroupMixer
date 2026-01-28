import React, { useMemo, useState } from 'react';
import type { AttributeDefinition, Person, Problem } from '../../../../types';
import { PeopleGrid } from './PeopleGrid';
import { PeopleList } from './PeopleList';
import { PeopleToolbar } from './PeopleToolbar';
import { sortPeople } from './peopleUtils';
import type { PeopleSortBy, PeopleSortOrder } from './peopleUtils';

interface PeopleDirectoryProps {
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  onAddPerson: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  onOpenBulkAddForm: () => void;
  onOpenBulkUpdateForm: () => void;
  onTriggerCsvUpload: () => void;
  onTriggerExcelImport: () => void;
}

export function PeopleDirectory({
  problem,
  attributeDefinitions,
  sessionsCount,
  onAddPerson,
  onEditPerson,
  onDeletePerson,
  onOpenBulkAddForm,
  onOpenBulkUpdateForm,
  onTriggerCsvUpload,
  onTriggerExcelImport,
}: PeopleDirectoryProps) {
  const [peopleViewMode, setPeopleViewMode] = useState<'grid' | 'list'>('grid');
  const [peopleSortBy, setPeopleSortBy] = useState<PeopleSortBy>('name');
  const [peopleSortOrder, setPeopleSortOrder] = useState<PeopleSortOrder>('asc');
  const [peopleSearch, setPeopleSearch] = useState('');

  const searchValue = peopleSearch.trim().toLowerCase();
  const basePeople = useMemo(() => problem?.people ?? [], [problem?.people]);

  const sortedPeople = useMemo(() => {
    const filteredPeople = searchValue
      ? basePeople.filter((person) => {
          const name = (person.attributes?.name || '').toString().toLowerCase();
          const id = person.id.toLowerCase();
          return name.includes(searchValue) || id.includes(searchValue);
        })
      : basePeople;

    return sortPeople(filteredPeople, peopleSortBy, peopleSortOrder, sessionsCount);
  }, [basePeople, peopleSortBy, peopleSortOrder, searchValue, sessionsCount]);

  const handleSortToggle = (sortBy: PeopleSortBy) => {
    if (peopleSortBy === sortBy) {
      setPeopleSortOrder(peopleSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setPeopleSortBy(sortBy);
      setPeopleSortOrder('asc');
    }
  };

  return (
    <div className="rounded-lg border transition-colors" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <PeopleToolbar
        peopleCount={basePeople.length}
        peopleSearch={peopleSearch}
        onPeopleSearchChange={setPeopleSearch}
        viewMode={peopleViewMode}
        onViewModeChange={setPeopleViewMode}
        onTriggerCsvUpload={onTriggerCsvUpload}
        onTriggerExcelImport={onTriggerExcelImport}
        onOpenBulkAddForm={onOpenBulkAddForm}
        onOpenBulkUpdateForm={onOpenBulkUpdateForm}
        onAddPerson={onAddPerson}
      />

      <div className="p-6">
        {peopleViewMode === 'grid' ? (
          <PeopleGrid
            people={sortedPeople}
            totalCount={basePeople.length}
            hasAttributes={attributeDefinitions.length > 0}
            peopleSearch={peopleSearch}
            searchValue={searchValue}
            onClearSearch={() => setPeopleSearch('')}
            onEditPerson={onEditPerson}
            onDeletePerson={onDeletePerson}
          />
        ) : (
          <PeopleList
            people={sortedPeople}
            totalCount={basePeople.length}
            attributeDefinitions={attributeDefinitions}
            sessionsCount={sessionsCount}
            sortBy={peopleSortBy}
            sortOrder={peopleSortOrder}
            peopleSearch={peopleSearch}
            searchValue={searchValue}
            onClearSearch={() => setPeopleSearch('')}
            onSortToggle={handleSortToggle}
            onEditPerson={onEditPerson}
            onDeletePerson={onDeletePerson}
          />
        )}
      </div>
    </div>
  );
}
