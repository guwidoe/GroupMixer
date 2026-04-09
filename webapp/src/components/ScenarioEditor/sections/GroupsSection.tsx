import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, Hash, Plus, Table, Upload } from 'lucide-react';
import type { Group, Scenario } from '../../../types';
import { useOutsideClick } from '../../../hooks';
import { getGroupCapacityProfile, hasSessionSpecificGroupCapacities } from '../../../utils/groupCapacities';
import { Button } from '../../ui';
import { SetupCollectionPage } from '../shared/SetupCollectionPage';
import { SetupItemActions, SetupItemCard, SetupKeyValueList, SetupTagList } from '../shared/cards';
import { ScenarioDataGrid } from '../shared/grid/ScenarioDataGrid';
import type { SetupCollectionViewMode } from '../shared/useSetupCollectionViewMode';

interface GroupsSectionProps {
  scenario: Scenario | null;
  onAddGroup: () => void;
  onEditGroup: (group: Group) => void;
  onDeleteGroup: (groupId: string) => void;
  onOpenBulkAddForm: () => void;
  onTriggerCsvUpload: () => void;
}

function GroupsBulkActions({ onOpenBulkAddForm, onTriggerCsvUpload }: { onOpenBulkAddForm: () => void; onTriggerCsvUpload: () => void }) {
  const bulkDropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useOutsideClick({
    refs: [bulkDropdownRef],
    enabled: isOpen,
    onOutsideClick: () => setIsOpen(false),
  });

  return (
    <div className="relative" ref={bulkDropdownRef}>
      <Button
        variant="secondary"
        leadingIcon={<Upload className="h-4 w-4" />}
        trailingIcon={<ChevronDown className="h-3 w-3" />}
        onClick={() => setIsOpen((open) => !open)}
      >
        Bulk Add
      </Button>
      {isOpen ? (
        <div
          className="absolute right-0 z-20 mt-2 w-56 rounded-xl border p-1 shadow-lg"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => {
              setIsOpen(false);
              onTriggerCsvUpload();
            }}
          >
            <Upload className="h-4 w-4" />
            Upload CSV
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => {
              setIsOpen(false);
              onOpenBulkAddForm();
            }}
          >
            <Table className="h-4 w-4" />
            Open Bulk Form
          </button>
        </div>
      ) : null}
    </div>
  );
}

function renderGroupContent(
  groups: Group[],
  scenario: Scenario | null,
  viewMode: SetupCollectionViewMode,
  onEditGroup: (group: Group) => void,
  onDeleteGroup: (groupId: string) => void,
) {
  if (viewMode === 'list') {
    return (
      <ScenarioDataGrid
        rows={groups}
        rowKey={(group) => group.id}
        searchPlaceholder="Search groups or capacities…"
        columns={[
          {
            id: 'group',
            header: 'Group',
            cell: (group) => <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{group.id}</span>,
            sortValue: (group) => group.id,
            searchValue: (group) => group.id,
            width: 180,
          },
          {
            id: 'capacity',
            header: 'Default capacity',
            cell: (group) => `${group.size} people`,
            sortValue: (group) => group.size,
            searchValue: (group) => String(group.size),
            width: 180,
          },
          {
            id: 'session-capacities',
            header: 'Session capacities',
            cell: (group) =>
              scenario && hasSessionSpecificGroupCapacities(group, scenario.num_sessions)
                ? getGroupCapacityProfile(group, scenario.num_sessions)
                    .map((capacity, index) => `S${index + 1} ${capacity}`)
                    .join(' · ')
                : 'Uses default capacity in every session',
            searchValue: (group) =>
              scenario && hasSessionSpecificGroupCapacities(group, scenario.num_sessions)
                ? getGroupCapacityProfile(group, scenario.num_sessions).join(' ')
                : 'default capacity',
            width: 320,
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (group) => (
              <div className="flex justify-end">
                <SetupItemActions
                  editLabel={`Edit ${group.id}`}
                  deleteLabel={`Delete ${group.id}`}
                  onEdit={() => onEditGroup(group)}
                  onDelete={() => onDeleteGroup(group.id)}
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <SetupItemCard
          key={group.id}
          title={group.id}
          onOpen={() => onEditGroup(group)}
          openLabel={`Edit ${group.id}`}
          actions={
            <SetupItemActions
              deleteLabel={`Delete ${group.id}`}
              onDelete={() => onDeleteGroup(group.id)}
              variant="card"
            />
          }
        >
          <SetupKeyValueList items={[{ label: 'Default capacity', value: `${group.size} people per session` }]} />
          {scenario && hasSessionSpecificGroupCapacities(group, scenario.num_sessions) ? (
            <SetupTagList
              items={getGroupCapacityProfile(group, scenario.num_sessions).map((capacity, index) => (
                <span
                  key={`${group.id}-${index}`}
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  S{index + 1} {capacity}
                </span>
              ))}
            />
          ) : null}
        </SetupItemCard>
      ))}
    </div>
  );
}

export function GroupsSection({
  scenario,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
  onOpenBulkAddForm,
  onTriggerCsvUpload,
}: GroupsSectionProps) {
  const groups = useMemo(() => scenario?.groups ?? [], [scenario?.groups]);

  return (
    <SetupCollectionPage
      sectionKey="groups"
      title="Groups"
      count={groups.length}
      description={
        <p>
          Define the groups people can be assigned to. Groups can keep one default capacity or override capacities by
          session when the scenario needs different room sizes over time.
        </p>
      }
      actions={
        <>
          <GroupsBulkActions onOpenBulkAddForm={onOpenBulkAddForm} onTriggerCsvUpload={onTriggerCsvUpload} />
          <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={onAddGroup}>
            Add Group
          </Button>
        </>
      }
      toolbarLeading={
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Use cards to scan capacities visually or switch to list view for sorting and column control.
        </div>
      }
      hasItems={groups.length > 0}
      emptyState={{
        icon: <Hash className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
        title: 'No groups added yet',
        message: 'Add the groups people can be assigned to before tuning constraints and preferences.',
      }}
      renderContent={(viewMode) => renderGroupContent(groups, scenario, viewMode, onEditGroup, onDeleteGroup)}
    />
  );
}
