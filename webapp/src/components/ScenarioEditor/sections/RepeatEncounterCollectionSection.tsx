import React from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import type { Constraint, Scenario } from '../../../types';
import { Button } from '../../ui';
import { SetupCollectionPage } from '../shared/SetupCollectionPage';
import { SetupSearchField } from '../shared/SetupSearchField';
import { SetupCardGrid, SetupItemActions, SetupItemCard, SetupKeyValueList, SetupTypeBadge, SetupWeightBadge } from '../shared/cards';
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
        searchPlaceholder="Search by limit, weight, or penalty function…"
        workspace={{
          mode: gridWorkspaceMode,
          onModeChange: setGridWorkspaceMode,
          draft: {
            onApply: onApplyGridRows,
            createRow: createGridRow,
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
              { value: 'quadratic', label: 'quadratic' },
              { value: 'exponential', label: 'exponential' },
            ],
            getValue: (item: RepeatEncounterRow) => item.constraint.penalty_function,
            setValue: (item: RepeatEncounterRow, value) => ({
              ...item,
              constraint: {
                ...item.constraint,
                penalty_function: value ?? 'linear',
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
          {
            kind: 'display' as const,
            id: 'actions',
            header: 'Actions',
            cell: (item: RepeatEncounterRow) => (
              <div className="flex justify-end">
                <SetupItemActions
                  onEdit={() => onEdit(item.constraint, item.index)}
                  onDelete={() => onDelete(item.index)}
                  editLabel="Edit repeat encounter preference"
                  deleteLabel="Delete repeat encounter preference"
                />
              </div>
            ),
            align: 'right',
            hideable: false,
            width: 180,
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
  const [gridWorkspaceMode, setGridWorkspaceMode] = React.useState<'browse' | 'edit' | 'csv'>('browse');

  const items = React.useMemo(
    () =>
      (scenario?.constraints ?? [])
        .map((constraint, index) => ({ constraint, index }))
        .filter((item): item is RepeatEncounterRow => item.constraint.type === 'RepeatEncounter'),
    [scenario?.constraints],
  );

  const filteredItems = React.useMemo(() => {
    if (viewMode !== 'cards') {
      return items;
    }

    const searchValue = search.trim().toLowerCase();
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
      title="Repeat Encounter"
      count={items.length}
      description={
        <p>
          Limit how often people should meet again. This is a preference, so violations remain possible but become
          more expensive according to the configured penalty function and weight.
        </p>
      }
      actions={
        <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => onAdd('RepeatEncounter')}>
          Add Repeat Limit
        </Button>
      }
      onViewModeChange={(nextMode) => {
        setViewMode(nextMode);
        if (nextMode !== 'list') {
          setGridWorkspaceMode('browse');
        }
      }}
      toolbarLeading={(activeViewMode) =>
        activeViewMode === 'cards' ? (
          <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
            <SetupSearchField
              label="Search repeat encounter preferences"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by limit, weight, or penalty function"
            />
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {filteredItems.length} of {items.length} preference{items.length === 1 ? '' : 's'} shown
            </div>
          </div>
        ) : (
          null
        )
      }
      defaultViewMode="list"
      summary={
        <div className="flex items-start gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
          <p>
            Repeat encounter preferences are typically the first preference families users tune because they have an
            immediate effect on novelty across the whole schedule.
          </p>
        </div>
      }
      hasItems={filteredItems.length > 0}
      emptyState={{
        icon: <RotateCcw className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
        title: search.trim() ? 'No repeat limits match the current filter' : 'No repeat encounter limits yet',
        message: search.trim()
          ? 'Try a broader filter or clear the search to see all repeat encounter preferences.'
          : 'Add a repeat encounter preference to limit how often the same people should meet again.',
      }}
      renderContent={(activeViewMode) => renderRepeatEncounterContent(filteredItems, activeViewMode, gridWorkspaceMode, setGridWorkspaceMode, onEdit, onDelete, onApplyGridRows, createGridRow)}
    />
  );
}
