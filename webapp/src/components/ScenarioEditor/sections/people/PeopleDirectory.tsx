import React, { useMemo, useState } from 'react';
import type { AttributeDefinition, Person, Scenario } from '../../../../types';
import { PeopleGrid } from './PeopleGrid';
import { PeopleList } from './PeopleList';
import { PeopleToolbar } from './PeopleToolbar';
import { sortPeople } from './peopleUtils';
import type { PeopleSortBy, PeopleSortOrder } from './peopleUtils';

const PROGRESSIVE_PEOPLE_RENDER_THRESHOLD = 150;
const INITIAL_VISIBLE_PEOPLE = 120;
const PEOPLE_RENDER_CHUNK_SIZE = 120;

interface PeopleDirectoryProps {
  scenario: Scenario | null;
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
  scenario,
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
  const basePeople = useMemo(() => scenario?.people ?? [], [scenario?.people]);

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

  const shouldProgressivelyRender = sortedPeople.length >= PROGRESSIVE_PEOPLE_RENDER_THRESHOLD;
  const [visiblePeopleCount, setVisiblePeopleCount] = useState(() =>
    shouldProgressivelyRender ? Math.min(INITIAL_VISIBLE_PEOPLE, sortedPeople.length) : sortedPeople.length,
  );

  React.useEffect(() => {
    if (!shouldProgressivelyRender) {
      setVisiblePeopleCount(sortedPeople.length);
      return;
    }

    setVisiblePeopleCount(Math.min(INITIAL_VISIBLE_PEOPLE, sortedPeople.length));

    let cancelled = false;
    let timeoutId: number | null = null;

    const revealMore = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setVisiblePeopleCount((current) => {
          if (current >= sortedPeople.length) {
            return current;
          }

          const next = Math.min(current + PEOPLE_RENDER_CHUNK_SIZE, sortedPeople.length);
          if (next < sortedPeople.length) {
            revealMore();
          }
          return next;
        });
      }, 16);
    };

    if (sortedPeople.length > INITIAL_VISIBLE_PEOPLE) {
      revealMore();
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [shouldProgressivelyRender, sortedPeople]);

  const visiblePeople = shouldProgressivelyRender
    ? sortedPeople.slice(0, visiblePeopleCount)
    : sortedPeople;

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
        {shouldProgressivelyRender && visiblePeopleCount < sortedPeople.length ? (
          <div
            className="mb-4 rounded-lg border px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-secondary)',
              color: 'var(--text-secondary)',
            }}
            role="status"
            aria-live="polite"
          >
            Loading people asynchronously to keep the setup page responsive — showing {visiblePeopleCount.toLocaleString()} of{' '}
            {sortedPeople.length.toLocaleString()}.
          </div>
        ) : null}

        {peopleViewMode === 'grid' ? (
          <PeopleGrid
            people={visiblePeople}
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
            people={visiblePeople}
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
