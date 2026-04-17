import React from 'react';
import { Plus } from 'lucide-react';
import type { Constraint } from '../../../../types';
import { Button } from '../../../ui';
import { replaceConstraintsAtIndices } from '../../../constraints/constraintMutations';
import { SetupActionsMenu } from '../../shared/SetupActionsMenu';
import { SetupCardSearchToolbar } from '../../shared/SetupCardSearchToolbar';
import { SetupCollectionPage } from '../../shared/SetupCollectionPage';
import { normalizeSessionSelection } from '../../shared/sessionScope';
import {
  SetupItemActions,
  SetupItemCard,
  SetupSelectionToggle,
  SetupTypeBadge,
} from '../../shared/cards';
import { ScenarioDataGrid } from '../../shared/grid/ScenarioDataGrid';
import { createOptionalSessionScopeColumn } from '../../shared/grid/sessionScopeColumn';
import { SetupPersonListText, formatPersonSearchList } from '../../shared/personDisplay';
import type { SetupCollectionViewMode } from '../../shared/useSetupCollectionViewMode';
import { getConstraintDisplayName } from '../../../../utils/constraintDisplay';
import { HARD_SECTION_COPY } from './copy';
import {
  ConstraintCards,
  getIndexedConstraints,
  renderPeopleConstraintContent,
  useConstraintScenario,
} from './shared';
import type {
  HardConstraintFamily,
  HardConstraintFamilySectionProps,
  IndexedConstraint,
  PeopleConstraint,
} from './types';

export function HardConstraintFamilySection({ family, onAdd, onEdit, onDelete }: HardConstraintFamilySectionProps) {
  const { scenario, setScenario, addNotification, isLoading } = useConstraintScenario();
  const isImmovableFamily = family === 'ImmovablePeople';
  const hardPeopleFamily: Extract<Constraint, { type: 'MustStayTogether' | 'MustStayApart' }>['type'] = family === 'MustStayTogether'
    ? 'MustStayTogether'
    : 'MustStayApart';
  const conversionTargetType = family === 'MustStayTogether'
    ? 'ShouldStayTogether'
    : family === 'MustStayApart'
      ? 'ShouldNotBeTogether'
      : null;
  const supportsBulkConvert = conversionTargetType !== null;
  const [search, setSearch] = React.useState('');
  const [minMembers, setMinMembers] = React.useState<number | ''>('');
  const [viewMode, setViewMode] = React.useState<SetupCollectionViewMode>('list');
  const [gridWorkspaceMode, setGridWorkspaceMode] = React.useState<'browse' | 'edit' | 'csv'>('edit');
  const [selectedHardIndices, setSelectedHardIndices] = React.useState<number[]>([]);
  const [isSelectingHard, setIsSelectingHard] = React.useState(false);
  const [showBulkConvert, setShowBulkConvert] = React.useState(false);
  const [bulkWeight, setBulkWeight] = React.useState<number | ''>(10);
  const handleViewModeChange = React.useCallback((nextMode: SetupCollectionViewMode) => {
    setViewMode(nextMode);
    if (nextMode !== 'cards') {
      setIsSelectingHard(false);
      setSelectedHardIndices((current) => (current.length === 0 ? current : []));
    }
    if (nextMode !== 'list') {
      setGridWorkspaceMode('edit');
    }
  }, []);

  if (isLoading || !scenario) {
    return <div className="space-y-4 pt-1 pl-0">Loading...</div>;
  }

  const copy = HARD_SECTION_COPY[family];
  const items = getIndexedConstraints(scenario, family);
  const searchValue = search.trim().toLowerCase();

  const filteredItems = viewMode === 'cards'
    ? items.filter(({ constraint }) => {
        if (supportsBulkConvert && minMembers !== '' && constraint.people.length < minMembers) {
          return false;
        }

        if (!searchValue) {
          return true;
        }

        const textPool = [formatPersonSearchList(scenario.people, constraint.people)];

        if (constraint.type === 'ImmovablePeople') {
          textPool.push(constraint.group_id.toLowerCase());
          textPool.push(...(constraint.sessions ?? []).map((session) => String(session + 1)));
          if (!constraint.sessions || constraint.sessions.length === 0) {
            textPool.push('all sessions');
          }
        } else if (Array.isArray(constraint.sessions)) {
          textPool.push(...constraint.sessions.map((session) => String(session + 1)));
        }

        return textPool.some((value) => value.includes(searchValue));
      })
    : items;

  const createGridRow = (): IndexedConstraint<Extract<Constraint, { type: HardConstraintFamily }>> => {
    if (isImmovableFamily) {
      return {
        constraint: {
          type: 'ImmovablePeople',
          people: [],
          group_id: scenario.groups[0]?.id ?? '',
          sessions: undefined,
        },
        index: -1,
      } as IndexedConstraint<Extract<Constraint, { type: HardConstraintFamily }>>;
    }

    return {
      constraint: {
        type: hardPeopleFamily,
        people: [],
        sessions: undefined,
      },
      index: -1,
    } as IndexedConstraint<Extract<Constraint, { type: HardConstraintFamily }>>;
  };

  const applyGridRows = (nextItems: Array<IndexedConstraint<Extract<Constraint, { type: HardConstraintFamily }>>>) => {
    const otherConstraints = scenario.constraints.filter((constraint) => constraint.type !== family);
    let skippedRows = 0;

    const nextConstraints = nextItems.flatMap(({ constraint }) => {
      const people = Array.from(new Set(constraint.people.filter(Boolean)));
      const normalizedSessions = normalizeSessionSelection(constraint.sessions ?? [], scenario.num_sessions);

      if (isImmovableFamily) {
        if (people.length < 1 || !constraint.group_id) {
          skippedRows += 1;
          return [];
        }

        return [{
          type: 'ImmovablePeople',
          people,
          group_id: constraint.group_id,
          sessions: normalizedSessions.length === 0 ? undefined : normalizedSessions,
        } satisfies Constraint];
      }

      if (people.length < 2) {
        skippedRows += 1;
        return [];
      }

      return [{
        type: hardPeopleFamily,
        people,
        sessions: normalizedSessions.length === 0 ? undefined : normalizedSessions,
      } satisfies Constraint];
    });

    setScenario({
      ...scenario,
      constraints: [...otherConstraints, ...nextConstraints],
    });

    addNotification({
      type: skippedRows > 0 ? 'info' : 'success',
      title: skippedRows > 0 ? 'Some Rows Skipped' : 'Constraints Updated',
      message: skippedRows > 0
        ? `Applied ${nextConstraints.length} ${isImmovableFamily ? 'immovable' : copy.title.toLowerCase()} row${nextConstraints.length === 1 ? '' : 's'} and skipped ${skippedRows} incomplete row${skippedRows === 1 ? '' : 's'}.`
        : `Applied ${nextConstraints.length} ${isImmovableFamily ? 'immovable' : copy.title.toLowerCase()} row${nextConstraints.length === 1 ? '' : 's'}.`,
    });
  };

  return (
    <>
      <SetupCollectionPage
        sectionKey={family === 'ImmovablePeople' ? 'immovable-people' : family === 'MustStayTogether' ? 'must-stay-together' : 'must-stay-apart'}
        title={copy.title}
        count={items.length}
        description={copy.description}
        actions={
          <>
            {supportsBulkConvert ? (
              <>
                <Button
                  variant={isSelectingHard ? 'primary' : 'secondary'}
                  onClick={() => {
                    setIsSelectingHard((current) => {
                      if (current) {
                        setSelectedHardIndices([]);
                      }
                      return !current;
                    });
                  }}
                >
                  {isSelectingHard ? 'Done selecting' : 'Select cards'}
                </Button>
                <SetupActionsMenu
                  label="Actions"
                  summary={selectedHardIndices.length > 0 ? `Advanced actions · ${selectedHardIndices.length} selected` : 'Advanced actions'}
                  items={[
                    {
                      label: `Convert selected to ${getConstraintDisplayName(conversionTargetType)}`,
                      disabled: selectedHardIndices.length === 0,
                      description:
                        selectedHardIndices.length === 0
                          ? 'Turn on card selection and choose one or more constraints first.'
                          : 'Turn the selected hard constraints into weighted preferences.',
                      onSelect: () => setShowBulkConvert(true),
                    },
                  ]}
                />
              </>
            ) : null}
            <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => onAdd(family)}>
              {copy.addLabel}
            </Button>
          </>
        }
        toolbarLeading={(activeViewMode) =>
          activeViewMode === 'cards' ? (
            <SetupCardSearchToolbar
              label={`Search ${copy.title.toLowerCase()} items`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
              placeholder={family === 'ImmovablePeople' ? 'Filter by person, group, or session' : 'Filter by person or session'}
              status={searchValue || minMembers !== '' ? `Showing ${filteredItems.length} of ${items.length}` : undefined}
              extra={supportsBulkConvert ? (
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span>Min members</span>
                  <input
                    type="number"
                    min={0}
                    value={minMembers}
                    onChange={(event) => setMinMembers(event.target.value === '' ? '' : Math.max(0, parseInt(event.target.value, 10) || 0))}
                    className="input w-24"
                  />
                </label>
              ) : null}
            />
          ) : null
        }
        onViewModeChange={handleViewModeChange}
        defaultViewMode="list"
        hasItems={filteredItems.length > 0}
        emptyState={{
          icon: copy.icon,
          title: searchValue ? `No ${copy.title.toLowerCase()} match the current filter` : `No ${copy.title.toLowerCase()} yet`,
          message: searchValue
            ? 'Try a broader filter or clear the search to see all matching constraints.'
            : 'Add the first constraint in this family to guide the setup rules more precisely.',
        }}
        renderContent={(nextViewMode: SetupCollectionViewMode) =>
          nextViewMode === 'cards' ? (
            <ConstraintCards
              items={filteredItems}
              renderCard={({ constraint, index }) => (
                <SetupItemCard
                  key={index}
                  selected={selectedHardIndices.includes(index)}
                  badges={<SetupTypeBadge label={copy.title} />}
                  onOpen={() => onEdit(constraint, index)}
                  openLabel={`Edit ${copy.title.toLowerCase()} constraint`}
                  actions={
                    <>
                      {supportsBulkConvert && isSelectingHard ? (
                        <SetupSelectionToggle
                          selected={selectedHardIndices.includes(index)}
                          onToggle={() => setSelectedHardIndices((previous) => previous.includes(index) ? previous.filter((value) => value !== index) : [...previous, index])}
                          label={`${selectedHardIndices.includes(index) ? 'Deselect' : 'Select'} ${copy.title.toLowerCase()} item`}
                        />
                      ) : null}
                      <SetupItemActions onDelete={() => onDelete(index)} variant="card" />
                    </>
                  }
                >
                  {renderPeopleConstraintContent(scenario, constraint as PeopleConstraint, index, setScenario)}
                </SetupItemCard>
              )}
            />
          ) : (
            <ScenarioDataGrid
              rows={filteredItems}
              rowKey={(item) => `${item.constraint.type}-${item.index}`}
              onRowOpen={(item) => onEdit(item.constraint, item.index)}
              rowOpenLabel={() => `Edit ${copy.title.toLowerCase()} constraint`}
              workspace={{
                mode: gridWorkspaceMode,
                onModeChange: setGridWorkspaceMode,
                browseModeEnabled: false,
                draft: {
                  onApply: applyGridRows,
                  createRow: createGridRow,
                  csv: {
                    ariaLabel: `${copy.title} CSV`,
                  },
                },
              }}
              columns={[
                {
                  kind: 'primitive' as const,
                  id: 'people',
                  header: 'People',
                  primitive: 'array' as const,
                  itemType: 'string' as const,
                  options: scenario.people.map((person) => ({
                    value: person.id,
                    label: person.attributes.name,
                  })),
                  getValue: (item) => item.constraint.people,
                  setValue: (item, value) => ({
                    ...item,
                    constraint: {
                      ...item.constraint,
                      people: Array.isArray(value) ? Array.from(new Set(value.map(String))) : [],
                    },
                  }),
                  renderValue: (value) => <SetupPersonListText people={scenario.people} personIds={(value as string[]) ?? []} />,
                  sortValue: (value) => Array.isArray(value) ? value.length : 0,
                  searchText: (_value, item) => formatPersonSearchList(scenario.people, item.constraint.people),
                  width: 280,
                },
                ...(isImmovableFamily
                  ? [{
                      kind: 'primitive' as const,
                      id: 'group',
                      header: 'Group',
                      primitive: 'enum' as const,
                      options: scenario.groups.map((group) => ({ value: group.id, label: group.id })),
                      getValue: (item: IndexedConstraint<Extract<Constraint, { type: 'ImmovablePeople' }>>) => item.constraint.group_id,
                      setValue: (item: IndexedConstraint<Extract<Constraint, { type: 'ImmovablePeople' }>>, value) => ({
                        ...item,
                        constraint: {
                          ...item.constraint,
                          group_id: value ?? '',
                        },
                      }),
                      width: 180,
                    }]
                  : []),
                ...(isImmovableFamily
                  ? [createOptionalSessionScopeColumn<IndexedConstraint<Extract<Constraint, { type: 'ImmovablePeople' }>>>({
                      totalSessions: scenario.num_sessions,
                      getSessions: (item) => item.constraint.sessions,
                      setSessions: (item, sessions) => ({
                        ...item,
                        constraint: {
                          ...item.constraint,
                          sessions,
                        },
                      }),
                    })]
                  : [createOptionalSessionScopeColumn<IndexedConstraint<Extract<Constraint, { type: 'MustStayTogether' | 'MustStayApart' }>>>({
                      totalSessions: scenario.num_sessions,
                      getSessions: (item) => item.constraint.sessions,
                      setSessions: (item, sessions) => ({
                        ...item,
                        constraint: {
                          ...item.constraint,
                          sessions,
                        },
                      }),
                    })]),
                {
                  kind: 'display' as const,
                  id: 'actions',
                  header: 'Actions',
                  cell: (item) => (
                    <div className="flex justify-end">
                      <SetupItemActions onDelete={() => onDelete(item.index)} />
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

      {showBulkConvert ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border px-6 py-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Convert to {getConstraintDisplayName(conversionTargetType)}
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {selectedHardIndices.length} selected {copy.title.toLowerCase()} constraint{selectedHardIndices.length === 1 ? '' : 's'} will be converted to {getConstraintDisplayName(conversionTargetType)} with the chosen penalty weight.
            </p>
            <label className="mt-4 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Penalty weight
            </label>
            <input type="number" value={bulkWeight} onChange={(event) => setBulkWeight(event.target.value === '' ? '' : parseFloat(event.target.value))} className="input mt-2 w-full" />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowBulkConvert(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (bulkWeight === '' || bulkWeight <= 0) return;
                  setScenario(replaceConstraintsAtIndices(scenario, selectedHardIndices, (currentConstraint) => {
                    if (currentConstraint.type !== 'MustStayTogether' && currentConstraint.type !== 'MustStayApart') {
                      return [currentConstraint];
                    }
                    return [currentConstraint.type === 'MustStayTogether'
                      ? {
                          type: 'ShouldStayTogether',
                          people: currentConstraint.people,
                          sessions: currentConstraint.sessions,
                          penalty_weight: bulkWeight,
                        } satisfies Constraint
                      : {
                          type: 'ShouldNotBeTogether',
                          people: currentConstraint.people,
                          sessions: currentConstraint.sessions,
                          penalty_weight: bulkWeight,
                        } satisfies Constraint];
                  }));
                  setSelectedHardIndices([]);
                  setShowBulkConvert(false);
                }}
              >
                Convert Selected
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
