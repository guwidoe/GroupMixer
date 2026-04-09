import React, { useMemo, useState } from 'react';
import { Table, Upload, Users } from 'lucide-react';
import type { AttributeDefinition, Person, Scenario } from '../../../../types';
import { Button } from '../../../ui';
import { SetupActionsMenu } from '../../shared/SetupActionsMenu';
import { SetupCollectionPage } from '../../shared/SetupCollectionPage';
import { SetupSearchField } from '../../shared/SetupSearchField';
import { SetupItemActions } from '../../shared/cards';
import { ScenarioDataGrid } from '../../shared/grid/ScenarioDataGrid';
import { SetupPersonName, resolvePersonDisplay } from '../../shared/personDisplay';
import { PeopleGrid } from './PeopleGrid';
import { sortPeople } from './peopleUtils';
import type { SetupCollectionViewMode } from '../../shared/useSetupCollectionViewMode';

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
  onInlineUpdatePerson: (personId: string, updates: { attributes?: Record<string, string>; sessions?: number[] | undefined }) => void;
  onOpenBulkAddForm: () => void;
  onOpenBulkUpdateForm: () => void;
  onTriggerCsvUpload: () => void;
  onTriggerExcelImport: () => void;
}

function PeopleBulkActions({
  onTriggerCsvUpload,
  onTriggerExcelImport,
  onOpenBulkAddForm,
  onOpenBulkUpdateForm,
}: {
  onTriggerCsvUpload: () => void;
  onTriggerExcelImport: () => void;
  onOpenBulkAddForm: () => void;
  onOpenBulkUpdateForm: () => void;
}) {
  return (
    <SetupActionsMenu
      label="Import & Bulk"
      icon={<Upload className="h-4 w-4" />}
      items={[
        {
          label: 'Upload CSV',
          icon: <Upload className="h-4 w-4" />,
          onSelect: onTriggerCsvUpload,
        },
        {
          label: 'Upload Excel',
          icon: <Upload className="h-4 w-4" />,
          onSelect: onTriggerExcelImport,
        },
        {
          label: 'Open bulk add form',
          icon: <Table className="h-4 w-4" />,
          onSelect: onOpenBulkAddForm,
        },
        {
          label: 'Bulk update people',
          icon: <Table className="h-4 w-4" />,
          onSelect: onOpenBulkUpdateForm,
        },
      ]}
    />
  );
}

export function PeopleDirectory({
  scenario,
  attributeDefinitions,
  sessionsCount,
  onAddPerson,
  onEditPerson,
  onDeletePerson,
  onInlineUpdatePerson,
  onOpenBulkAddForm,
  onOpenBulkUpdateForm,
  onTriggerCsvUpload,
  onTriggerExcelImport,
}: PeopleDirectoryProps) {
  const [peopleSearch, setPeopleSearch] = useState('');
  const [viewMode, setViewMode] = useState<SetupCollectionViewMode>('cards');

  const searchValue = peopleSearch.trim().toLowerCase();
  const basePeople = useMemo(() => scenario?.people ?? [], [scenario?.people]);

  const sortedPeople = useMemo(() => {
    const filteredPeople = viewMode === 'cards' && searchValue
      ? basePeople.filter((person) => {
          const name = (person.attributes?.name || '').toString().toLowerCase();
          const id = person.id.toLowerCase();
          return name.includes(searchValue) || id.includes(searchValue);
        })
      : basePeople;

    return sortPeople(filteredPeople, 'name', 'asc', sessionsCount);
  }, [basePeople, searchValue, sessionsCount, viewMode]);

  const shouldProgressivelyRender = viewMode === 'cards' && sortedPeople.length >= PROGRESSIVE_PEOPLE_RENDER_THRESHOLD;
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

  const visiblePeople = shouldProgressivelyRender ? sortedPeople.slice(0, visiblePeopleCount) : sortedPeople;
  const sessionOptions = useMemo(
    () => Array.from({ length: sessionsCount }, (_, index) => ({ value: String(index), label: `Session ${index + 1}` })),
    [sessionsCount],
  );
  const peopleAttributeColumns = useMemo(() => {
    const orderedKeys = new Set<string>();

    for (const definition of attributeDefinitions) {
      if (definition.key !== 'name') {
        orderedKeys.add(definition.key);
      }
    }

    for (const person of basePeople) {
      for (const key of Object.keys(person.attributes ?? {})) {
        if (key !== 'name') {
          orderedKeys.add(key);
        }
      }
    }

    return Array.from(orderedKeys).map((key) => {
      const definition = attributeDefinitions.find((attribute) => attribute.key === key);
      const observedValues = basePeople
        .map((person) => person.attributes?.[key])
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      const optionValues = Array.from(new Set([...(definition?.values ?? []), ...observedValues]));

      return {
        key,
        optionValues,
      };
    });
  }, [attributeDefinitions, basePeople]);
  const searchSummary = searchValue ? (
    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
      Showing {sortedPeople.length} of {basePeople.length} people for “{peopleSearch}”.
      <button type="button" className="ml-2 underline" onClick={() => setPeopleSearch('')}>
        Clear filter
      </button>
    </div>
  ) : (
    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
      Browse the people directory as cards or switch to the data grid for sorting, column control, and scanning.
    </div>
  );

  return (
    <SetupCollectionPage
      sectionKey="people"
      title="People"
      count={basePeople.length}
      description={
        <p>
          Manage participants, their availability, and their attribute values. This directory now uses the same shared
          setup shell as other collection-style pages while preserving progressive rendering for large scenarios.
        </p>
      }
      actions={
        <>
          <PeopleBulkActions
            onTriggerCsvUpload={onTriggerCsvUpload}
            onTriggerExcelImport={onTriggerExcelImport}
            onOpenBulkAddForm={onOpenBulkAddForm}
            onOpenBulkUpdateForm={onOpenBulkUpdateForm}
          />
          <Button variant="primary" leadingIcon={<Users className="h-4 w-4" />} onClick={onAddPerson}>
            Add Person
          </Button>
        </>
      }
      toolbarLeading={(viewMode) =>
        viewMode === 'cards' ? (
          <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
            <SetupSearchField
              label="Search people"
              placeholder="Search people by name or ID..."
              value={peopleSearch}
              onChange={(event) => setPeopleSearch(event.target.value)}
            />
            {searchSummary}
          </div>
        ) : (
          null
        )
      }
      onViewModeChange={setViewMode}
      defaultViewMode="list"
      summary={
        shouldProgressivelyRender && visiblePeopleCount < sortedPeople.length ? (
          <div role="status" aria-live="polite" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading people asynchronously to keep the setup page responsive — showing {visiblePeopleCount.toLocaleString()} of{' '}
            {sortedPeople.length.toLocaleString()}.
          </div>
        ) : null
      }
      hasItems={basePeople.length > 0}
      emptyState={{
        icon: <Users className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
        title: 'No people added yet',
        message: attributeDefinitions.length > 0
          ? 'Add people to get started with your optimization scenario.'
          : 'Consider defining attributes first, then add people to get started.',
      }}
      renderContent={(viewMode) =>
        viewMode === 'cards' ? (
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
          <ScenarioDataGrid
            rows={visiblePeople}
            rowKey={(person) => person.id}
            emptyState={<div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No matching people.</div>}
            searchPlaceholder="Search people by name, ID, or attribute…"
            searchSummary={({ filteredCount, totalCount, query }) => (
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {query.trim() ? `Showing ${filteredCount} of ${totalCount} matching people.` : `Showing ${filteredCount} people.`}
              </div>
            )}
            columns={[
              {
                id: 'name',
                header: 'Name',
                cell: (person) => (
                  <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    <SetupPersonName people={basePeople} personId={person.id} className="font-semibold" />
                  </div>
                ),
                sortValue: (person) => resolvePersonDisplay(basePeople, person.id).displayName.toLowerCase(),
                searchValue: (person) => resolvePersonDisplay(basePeople, person.id).searchText,
                exportValue: (person) => resolvePersonDisplay(basePeople, person.id).displayName,
                filter: {
                  type: 'text',
                  placeholder: 'Filter names…',
                  ariaLabel: 'Filter people by name',
                },
                width: 240,
                editor: {
                  type: 'text',
                  getValue: (person) => String(person.attributes.name || ''),
                  onCommit: (person, value) => onInlineUpdatePerson(person.id, { attributes: { name: String(value).trim() || person.id } }),
                  ariaLabel: (person) => `Edit name for ${person.attributes.name || person.id}`,
                  placeholder: 'Person name',
                },
              },
              {
                id: 'sessions',
                header: 'Sessions',
                cell: (person) =>
                  person.sessions ? `${person.sessions.map((session) => session + 1).join(', ')}` : `All (${sessionsCount})`,
                sortValue: (person) => person.sessions?.length ?? sessionsCount,
                searchValue: (person) => (person.sessions ? person.sessions.join(' ') : `all ${sessionsCount}`),
                exportValue: (person) =>
                  person.sessions && person.sessions.length > 0
                    ? person.sessions.map((session) => String(session + 1)).join(', ')
                    : 'All sessions',
                filter: {
                  type: 'text',
                  ariaLabel: 'Filter people by session availability',
                  placeholder: 'Filter sessions…',
                  getValue: (person) =>
                    person.sessions && person.sessions.length > 0
                      ? person.sessions.map((session) => String(session + 1)).join(' ')
                      : 'all sessions',
                },
                width: 180,
                editor: {
                  type: 'multiselect',
                  getValue: (person) => (person.sessions ?? Array.from({ length: sessionsCount }, (_, index) => index)).map(String),
                  options: sessionOptions,
                  parseValue: (value) => {
                    const selectedSessions = (Array.isArray(value) ? value : [value])
                      .map((entry) => Number.parseInt(entry, 10))
                      .filter((entry) => Number.isFinite(entry))
                      .sort((left, right) => left - right);
                    return selectedSessions.length === 0 || selectedSessions.length === sessionsCount ? [] : selectedSessions;
                  },
                  onCommit: (person, value) => {
                    const parsed = Array.isArray(value)
                      ? value.map((entry) => Number.parseInt(String(entry), 10)).filter((entry) => Number.isFinite(entry))
                      : [];
                    onInlineUpdatePerson(person.id, {
                      sessions: parsed.length === 0 || parsed.length === sessionsCount ? undefined : parsed,
                    });
                  },
                  ariaLabel: (person) => `Edit sessions for ${person.attributes.name || person.id}`,
                },
              },
              ...peopleAttributeColumns.map((attribute) => ({
                id: `attribute-${attribute.key}`,
                header: attribute.key,
                cell: (person: Person) => person.attributes[attribute.key] ?? '—',
                searchValue: (person: Person) => String(person.attributes[attribute.key] ?? ''),
                exportValue: (person: Person) => String(person.attributes[attribute.key] ?? ''),
                filter: {
                  type: 'select' as const,
                  ariaLabel: `Filter people by ${attribute.key}`,
                  getValue: (person: Person) => String(person.attributes[attribute.key] ?? ''),
                  options: attribute.optionValues.map((value) => ({ value, label: value })),
                },
                width: 180,
                editor: {
                  type: attribute.optionValues.length > 0 ? 'select' as const : 'text' as const,
                  getValue: (person: Person) => String(person.attributes[attribute.key] ?? attribute.optionValues[0] ?? ''),
                  options: attribute.optionValues.map((value) => ({ value, label: value })),
                  onCommit: (person: Person, value: string | number | string[]) =>
                    onInlineUpdatePerson(person.id, { attributes: { [attribute.key]: String(value) } }),
                  ariaLabel: (person: Person) => `Edit ${attribute.key} for ${person.attributes.name || person.id}`,
                  placeholder: `Enter ${attribute.key}`,
                },
              })),
              {
                id: 'actions',
                header: 'Actions',
                cell: (person) => (
                  <div className="flex justify-end">
                    <SetupItemActions
                      editLabel={`Edit ${person.attributes.name || person.id}`}
                      deleteLabel={`Delete ${person.attributes.name || person.id}`}
                      onEdit={() => onEditPerson(person)}
                      onDelete={() => onDeletePerson(person.id)}
                    />
                  </div>
                ),
                align: 'right',
                hideable: false,
                width: 180,
              },
            ]}
          />
        )
      }
    />
  );
}
