import React from 'react';
import { Plus, RotateCcw, Search } from 'lucide-react';
import type { Constraint, Scenario } from '../../../types';
import { Button } from '../../ui';
import { SetupCollectionPage } from '../shared/SetupCollectionPage';
import { SetupItemActions, SetupItemCard, SetupKeyValueList, SetupTypeBadge, SetupWeightBadge } from '../shared/cards';
import { ScenarioDataGrid } from '../shared/grid/ScenarioDataGrid';
import type { SetupCollectionViewMode } from '../shared/useSetupCollectionViewMode';

type RepeatEncounterConstraint = Extract<Constraint, { type: 'RepeatEncounter' }>;

interface RepeatEncounterCollectionSectionProps {
  scenario: Scenario | null;
  onAdd: (type: 'RepeatEncounter') => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
}

function RepeatEncounterCard({
  item,
  onEdit,
  onDelete,
}: {
  item: { constraint: RepeatEncounterConstraint; index: number };
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
      titleMeta={
        <>
          Allow pairs to meet up to <strong>{item.constraint.max_allowed_encounters}</strong> time
          {item.constraint.max_allowed_encounters === 1 ? '' : 's'} before penalties apply.
        </>
      }
      actions={
        <SetupItemActions
          onEdit={() => onEdit(item.constraint, item.index)}
          onDelete={() => onDelete(item.index)}
          editLabel="Edit repeat encounter preference"
          deleteLabel="Delete repeat encounter preference"
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
  items: Array<{ constraint: RepeatEncounterConstraint; index: number }>,
  viewMode: SetupCollectionViewMode,
  onEdit: (constraint: Constraint, index: number) => void,
  onDelete: (index: number) => void,
) {
  if (viewMode === 'list') {
    return (
      <ScenarioDataGrid
        rows={items}
        rowKey={(item) => String(item.index)}
        searchPlaceholder="Search by limit, weight, or penalty function…"
        columns={[
          {
            id: 'limit',
            header: 'Limit',
            cell: (item) => (
              <span>
                Max {item.constraint.max_allowed_encounters} encounter{item.constraint.max_allowed_encounters === 1 ? '' : 's'}
              </span>
            ),
            sortValue: (item) => item.constraint.max_allowed_encounters,
            searchValue: (item) => String(item.constraint.max_allowed_encounters),
            width: 240,
          },
          {
            id: 'penalty-function',
            header: 'Penalty function',
            cell: (item) => item.constraint.penalty_function,
            sortValue: (item) => item.constraint.penalty_function,
            searchValue: (item) => item.constraint.penalty_function,
            width: 220,
          },
          {
            id: 'weight',
            header: 'Weight',
            cell: (item) => item.constraint.penalty_weight,
            sortValue: (item) => item.constraint.penalty_weight,
            searchValue: (item) => String(item.constraint.penalty_weight),
            width: 140,
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
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
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {items.map((item) => (
        <RepeatEncounterCard key={item.index} item={item} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}

export function RepeatEncounterCollectionSection({
  scenario,
  onAdd,
  onEdit,
  onDelete,
}: RepeatEncounterCollectionSectionProps) {
  const [search, setSearch] = React.useState('');
  const [viewMode, setViewMode] = React.useState<SetupCollectionViewMode>('cards');

  const items = React.useMemo(
    () =>
      (scenario?.constraints ?? [])
        .map((constraint, index) => ({ constraint, index }))
        .filter((item): item is { constraint: RepeatEncounterConstraint; index: number } => item.constraint.type === 'RepeatEncounter'),
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
      onViewModeChange={setViewMode}
      toolbarLeading={(viewMode) =>
        viewMode === 'cards' ? (
          <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
            <label className="relative block min-w-0 flex-1 md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by limit, weight, or penalty function"
                className="input w-full pl-9"
              />
            </label>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {filteredItems.length} of {items.length} preference{items.length === 1 ? '' : 's'} shown
            </div>
          </div>
        ) : (
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Use the shared grid search and column controls to review repeat-limit preferences quickly.
          </div>
        )
      }
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
      renderContent={(viewMode) => renderRepeatEncounterContent(filteredItems, viewMode, onEdit, onDelete)}
    />
  );
}
