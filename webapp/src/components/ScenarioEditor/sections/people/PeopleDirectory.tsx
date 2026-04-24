import React, { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import type { AttributeDefinition, Person, Scenario } from '../../../../types';
import { applyNamedAttributeValuesToPerson, createAttributeDefinition, findAttributeDefinitionByName } from '../../../../services/scenarioAttributes';
import { Button } from '../../../ui';
import { SetupCollectionPage } from '../../shared/SetupCollectionPage';
import { SetupCardSearchToolbar } from '../../shared/SetupCardSearchToolbar';
import { SetupItemActions } from '../../shared/cards';
import { ScenarioDataGrid } from '../../shared/grid/ScenarioDataGrid';
import { createOptionalSessionScopeColumn } from '../../shared/grid/sessionScopeColumn';
import { PeopleGrid } from './PeopleGrid';
import { sortPeople } from './peopleUtils';
import type { SetupCollectionViewMode } from '../../shared/useSetupCollectionViewMode';

const PROGRESSIVE_PEOPLE_RENDER_THRESHOLD = 150;
const INITIAL_VISIBLE_PEOPLE = 120;
const PEOPLE_RENDER_CHUNK_SIZE = 120;

function normalizeAttributeKey(key: string) {
  return key.trim().toLowerCase();
}

function getPersonAttributeValue(person: Person, attributeKey: string) {
  const exactValue = person.attributes?.[attributeKey];
  if (exactValue !== undefined) {
    return exactValue;
  }

  const normalizedTarget = normalizeAttributeKey(attributeKey);
  for (const [key, value] of Object.entries(person.attributes ?? {})) {
    if (normalizeAttributeKey(key) === normalizedTarget) {
      return value;
    }
  }

  return undefined;
}

interface PeopleDirectoryProps {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  onAddPerson: () => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  onApplyGridPeople: (people: Person[]) => void;
  createGridPersonRow: () => Person;
}

export function PeopleDirectory({
  scenario,
  attributeDefinitions,
  sessionsCount,
  onAddPerson,
  onEditPerson,
  onDeletePerson,
  onApplyGridPeople,
  createGridPersonRow,
}: PeopleDirectoryProps) {
  const [peopleSearch, setPeopleSearch] = useState('');
  const [viewMode, setViewMode] = useState<SetupCollectionViewMode>('list');
  const [gridWorkspaceMode, setGridWorkspaceMode] = useState<'browse' | 'edit' | 'csv'>('edit');

  const searchValue = peopleSearch.trim().toLowerCase();
  const basePeople = useMemo(() => scenario?.people ?? [], [scenario?.people]);

  const sortedPeople = useMemo(() => {
    const filteredPeople = viewMode === 'cards' && searchValue
      ? basePeople.filter((person) => {
          const name = person.name.toLowerCase();
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
      setVisiblePeopleCount((current) => (current === sortedPeople.length ? current : sortedPeople.length));
      return;
    }

    const initialVisibleCount = Math.min(INITIAL_VISIBLE_PEOPLE, sortedPeople.length);
    setVisiblePeopleCount((current) => (current === initialVisibleCount ? current : initialVisibleCount));

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
  }, [shouldProgressivelyRender, sortedPeople.length]);

  const visiblePeople = shouldProgressivelyRender ? sortedPeople.slice(0, visiblePeopleCount) : sortedPeople;
  const peopleAttributeColumns = useMemo(() => {
    const orderedKeys = new Map<string, string>();

    for (const definition of attributeDefinitions) {
      const name = definition.name || definition.key;
      if (name !== 'name') {
        orderedKeys.set(normalizeAttributeKey(name), name);
      }
    }

    for (const person of basePeople) {
      for (const key of Object.keys(person.attributes ?? {})) {
        if (key !== 'name') {
          orderedKeys.set(normalizeAttributeKey(key), orderedKeys.get(normalizeAttributeKey(key)) ?? key);
        }
      }
    }

    return Array.from(orderedKeys.entries()).map(([normalizedKey, displayKey]) => {
      const definition = attributeDefinitions.find((attribute) => normalizeAttributeKey(attribute.name || attribute.key) === normalizedKey)
        ?? createAttributeDefinition(displayKey);

      return {
        key: displayKey,
        definition,
        validatedOptions: definition.values ?? [],
      };
    });
  }, [attributeDefinitions, basePeople]);

  return (
    <SetupCollectionPage
      sectionKey="people"
      title="People"
      count={basePeople.length}
      description={<p>Manage participants, their availability, and their attribute values.</p>}
      actions={
        <Button variant="primary" leadingIcon={<Users className="h-4 w-4" />} onClick={onAddPerson}>
          Add Person
        </Button>
      }
      toolbarLeading={(activeViewMode) =>
        activeViewMode === 'cards' ? (
          <SetupCardSearchToolbar
            label="Search people"
            placeholder="Search people by name or ID..."
            value={peopleSearch}
            onChange={(event) => setPeopleSearch(event.target.value)}
            onClear={() => setPeopleSearch('')}
            status={searchValue ? `Showing ${sortedPeople.length} of ${basePeople.length} people` : undefined}
          />
        ) : null
      }
      onViewModeChange={(nextMode) => {
        setViewMode(nextMode);
        if (nextMode !== 'list' && gridWorkspaceMode !== 'edit') {
          setGridWorkspaceMode('edit');
        }
      }}
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
      renderContent={(activeViewMode) =>
        activeViewMode === 'cards' ? (
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
            onRowOpen={onEditPerson}
            rowOpenLabel={(person) => `Edit ${person.name}`}
            showCsvExport={false}
            searchSummary={({ filteredCount, totalCount }) => (
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Showing {filteredCount}/{totalCount} people.
              </div>
            )}
            workspace={{
              mode: gridWorkspaceMode,
              onModeChange: setGridWorkspaceMode,
              browseModeEnabled: false,
              draft: {
                onApply: onApplyGridPeople,
                createRow: createGridPersonRow,
                canDeleteRows: true,
                deleteRowLabel: (person) => `Delete ${person.name || person.id || 'row'}`,
                csv: {
                  ariaLabel: 'People grid CSV',
                  placeholder: 'Name,Weight,Sessions,...',
                  helperText: (
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <strong>Sessions</strong> use JSON session-scope objects such as <code>{'{"mode":"all"}'}</code> or <code>{'{"mode":"selected","sessions":[0,1]}'}</code>. Blank attribute cells clear that value; blank names normalize to the person ID on apply.
                    </div>
                  ),
                },
              },
            }}
            columns={[
              {
                kind: 'primitive' as const,
                id: 'name',
                header: 'Name',
                primitive: 'string' as const,
                getValue: (person: Person) => person.name,
                setValue: (person: Person, value) => ({
                  ...person,
                  name: value ?? '',
                }),
                renderValue: (value) => (
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {String(value ?? '').trim()}
                  </span>
                ),
                searchText: (value, person) => `${String(value ?? '')} ${person.id}`.trim(),
                width: 240,
              },
              createOptionalSessionScopeColumn<Person>({
                totalSessions: sessionsCount,
                getSessions: (person) => person.sessions,
                setSessions: (person, sessions) => ({
                  ...person,
                  sessions,
                }),
                width: 180,
              }),
              ...peopleAttributeColumns.map((attribute) => {
                const definition = findAttributeDefinitionByName(attributeDefinitions, attribute.key) ?? attribute.definition;
                const validatedOptions = definition?.values ?? [];
                const isEnum = validatedOptions.length > 0;

                return {
                  kind: 'primitive' as const,
                  id: `attribute-${attribute.key}`,
                  header: attribute.key,
                  primitive: isEnum ? ('enum' as const) : ('string' as const),
                  options: isEnum ? validatedOptions.map((value) => ({ value, label: value })) : undefined,
                  getValue: (person: Person) => {
                    const value = getPersonAttributeValue(person, attribute.key);
                    return typeof value === 'string' ? value : '';
                  },
                  setValue: (person: Person, value: string | undefined) => {
                    const existingDefinition = findAttributeDefinitionByName(attributeDefinitions, attribute.key);
                    if (existingDefinition) {
                      return applyNamedAttributeValuesToPerson(person, { [attribute.key]: value ?? '' }, attributeDefinitions);
                    }

                    const nextAttributes = { ...(person.attributes ?? {}) };
                    if (value == null || value === '') {
                      delete nextAttributes[attribute.key];
                    } else {
                      nextAttributes[attribute.key] = value;
                    }

                    return {
                      ...person,
                      attributes: nextAttributes,
                    };
                  },
                  renderValue: (value: string | undefined) => value && value.length > 0 ? value : '—',
                  width: 180,
                };
              }),
              ...(gridWorkspaceMode === 'edit' ? [] : [{
                kind: 'display' as const,
                id: 'actions',
                header: 'Actions',
                cell: (person: Person) => (
                  <div className="flex justify-end">
                    <SetupItemActions
                      deleteLabel={`Delete ${person.name}`}
                      onDelete={() => onDeletePerson(person.id)}
                    />
                  </div>
                ),
                align: 'right' as const,
                hideable: false,
                width: 180,
              }]),
            ]}
          />
        )
      }
    />
  );
}
