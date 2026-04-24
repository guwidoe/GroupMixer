import React from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import type { Constraint, Scenario } from '../../../types';
import { Button } from '../../ui';
import { SetupCardSearchToolbar } from '../shared/SetupCardSearchToolbar';
import { SetupCollectionPage } from '../shared/SetupCollectionPage';
import { SetupCardGrid, SetupItemActions, SetupItemCard, SetupKeyValueList, SetupTypeBadge, SetupWeightBadge } from '../shared/cards';
import { getConstraintAddLabel, getConstraintDisplayName } from '../../../utils/constraintDisplay';
import { ScenarioDataGrid } from '../shared/grid/ScenarioDataGrid';
import type { SetupCollectionViewMode } from '../shared/useSetupCollectionViewMode';

type RepeatEncounterConstraint = Extract<Constraint, { type: 'RepeatEncounter' }>;
type RepeatEncounterRow = { constraint: RepeatEncounterConstraint; index: number };

interface RepeatEncounterCollectionSectionProps {
  scenario: Scenario | null;
  onAdd: (type: 'RepeatEncounter') => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
  onApplyGridRows: (items: RepeatEncounterRow[]) => void;
  createGridRow: () => RepeatEncounterRow;
}

function RepeatEncounterCard({
  item,
  onEdit,
  onDelete,
}: {
  item: RepeatEncounterRow;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
}) {
  return (
    <SetupItemCard
      badges={
        <>
          <SetupTypeBadge label="Repeat encounter" />
          <SetupWeightBadge weight={item.constraint.penalty_weight} />
        </>
      }
      onOpen={() => onEdit(item.constraint, item.index)}
      openLabel="Edit repeat encounter preference"
      titleMeta={
        <>
          Allow pairs to meet up to <strong>{item.constraint.max_allowed_encounters}</strong> time
          {item.constraint.max_allowed_encounters === 1 ? '' : 's'} before penalties apply.
        </>
      }
      actions={
        <SetupItemActions
          onDelete={() => onDelete(item.index)}
          deleteLabel="Delete repeat encounter preference"
          variant="card"
        />
      }
    >
      <SetupKeyValueList
        items={[
          { label: 'Penalty function', value: item.constraint.penalty_function },
          { label: 'Max encounters', value: item.constraint.max_allowed_encounters },
        ]}
      />
    </SetupItemCard>
  );
}

function renderRepeatEncounterContent(
  items: RepeatEncounterRow[],
  viewMode: SetupCollectionViewMode,
  gridWorkspaceMode: 'browse' | 'edit' | 'csv',
  setGridWorkspaceMode: React.Dispatch<React.SetStateAction<'browse' | 'edit' | 'csv'>>,
  onEdit: (constraint: Constraint, index: number) => void,
  onDelete: (index: number) => void,
  onApplyGridRows: (items: RepeatEncounterRow[]) => void,
  createGridRow: () => RepeatEncounterRow,
) {
  if (viewMode === 'list') {
    return (
      <ScenarioDataGrid
        rows={items}
        rowKey={(item, index) => `${item.index}-${index}`}
        onRowOpen={(item) => onEdit(item.constraint, item.index)}
        rowOpenLabel={() => 'Edit repeat encounter preference'}
        searchPlaceholder="Search by limit, weight, or penalty function…"
        workspace={{
          mode: gridWorkspaceMode,
          onModeChange: setGridWorkspaceMode,
          browseModeEnabled: false,
          draft: {
            onApply: onApplyGridRows,
            createRow: createGridRow,
            canDeleteRows: true,
            deleteRowLabel: () => 'Delete repeat encounter preference',
            csv: {
              ariaLabel: 'Repeat encounter CSV',
            },
          },
        }}
        columns={[
          {
            kind: 'primitive' as const,
            id: 'limit',
            header: 'Limit',
            primitive: 'number' as const,
            getValue: (item: RepeatEncounterRow) => item.constraint.max_allowed_encounters,
            setValue: (item: RepeatEncounterRow, value) => ({
              ...item,
              constraint: {
                ...item.constraint,
                max_allowed_encounters: value ?? 1,
              },
            }),
            renderValue: (value) => `Max ${value ?? 0} encounter${value === 1 ? '' : 's'}`,
            width: 240,
          },
          {
            kind: 'primitive' as const,
            id: 'penalty-function',
            header: 'Penalty function',
            primitive: 'enum' as const,
            options: [
              { value: 'linear', label: 'linear' },
              { value: 'squared', label: 'squared' },
            ],
            getValue: (item: RepeatEncounterRow) => item.constraint.penalty_function,
            setValue: (item: RepeatEncounterRow, value) => ({
              ...item,
              constraint: {
                ...item.constraint,
                penalty_function: value ?? 'squared',
              },
            }),
            width: 220,
          },
          {
            kind: 'primitive' as const,
            id: 'weight',
            header: 'Weight',
            primitive: 'number' as const,
            getValue: (item: RepeatEncounterRow) => item.constraint.penalty_weight,
            setValue: (item: RepeatEncounterRow, value) => ({
              ...item,
              constraint: {
                ...item.constraint,
                penalty_weight: value ?? 0,
              },
            }),
            width: 140,
          },
        ]}
      />
    );
  }

  return (
    <SetupCardGrid minColumnWidth="19rem">
      {items.map((item) => (
        <RepeatEncounterCard key={item.index} item={item} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </SetupCardGrid>
  );
}

export function RepeatEncounterCollectionSection({
  scenario,
  onAdd,
  onEdit,
  onDelete,
  onApplyGridRows,
  createGridRow,
}: RepeatEncounterCollectionSectionProps) {
  const [search, setSearch] = React.useState('');
  const [viewMode, setViewMode] = React.useState<SetupCollectionViewMode>('cards');
  const [gridWorkspaceMode, setGridWorkspaceMode] = React.useState<'browse' | 'edit' | 'csv'>('edit');

  const items = React.useMemo(
    () =>
      (scenario?.constraints ?? [])
        .map((constraint, index) => ({ constraint, index }))
        .filter((item): item is RepeatEncounterRow => item.constraint.type === 'RepeatEncounter'),
    [scenario?.constraints],
  );

  const searchValue = search.trim().toLowerCase();

  const filteredItems = React.useMemo(() => {
    if (viewMode !== 'cards') {
      return items;
    }

    if (!searchValue) {
      return items;
    }

    return items.filter((item) => {
      const haystack = [
        String(item.constraint.max_allowed_encounters),
        item.constraint.penalty_function.toLowerCase(),
        String(item.constraint.penalty_weight),
      ];
      return haystack.some((value) => value.includes(searchValue));
    });
  }, [items, search, viewMode]);

  return (
    <SetupCollectionPage
      sectionKey="repeat-encounter"
      title={getConstraintDisplayName('RepeatEncounter')}
      count={items.length}
      description={
        <p>
          Limit how often people should meet again. This is a preference, so violations remain possible but become
          more expensive according to the configured penalty function and weight.
        </p>
      }
      actions={
        <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => onAdd('RepeatEncounter')}>
          {getConstraintAddLabel('RepeatEncounter')}
        </Button>
      }
      onViewModeChange={(nextMode) => {
        setViewMode(nextMode);
        if (nextMode !== 'list') {
          setGridWorkspaceMode('edit');
        }
      }}
      toolbarLeading={(activeViewMode) =>
        activeViewMode === 'cards' ? (
          <SetupCardSearchToolbar
            label="Search repeat encounter preferences"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch('')}
            placeholder="Filter by limit, weight, or penalty function"
            status={searchValue ? `Showing ${filteredItems.length} of ${items.length} preferences` : undefined}
          />
        ) : (
          null
        )
      }
      defaultViewMode="list"
      hasItems={filteredItems.length > 0}
      emptyState={{
        icon: <RotateCcw className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
        title: searchValue ? 'No repeat limits match this search' : 'No repeat encounter limits yet',
        message: searchValue
          ? 'Try a broader search or clear it to see every repeat limit.'
          : 'Add a repeat encounter preference to limit how often the same people should meet again.',
      }}
      renderContent={(activeViewMode) => renderRepeatEncounterContent(filteredItems, activeViewMode, gridWorkspaceMode, setGridWorkspaceMode, onEdit, onDelete, onApplyGridRows, createGridRow)}
    />
  );
}
