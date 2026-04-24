import React, { useMemo, useState } from 'react';
import { Hash, Plus } from 'lucide-react';
import type { Group, Scenario } from '../../../types';
import { getGroupCapacityProfile, hasSessionSpecificGroupCapacities } from '../../../utils/groupCapacities';
import { Button } from '../../ui';
import { SetupCardSearchToolbar } from '../shared/SetupCardSearchToolbar';
import { SetupCollectionPage } from '../shared/SetupCollectionPage';
import { SetupCardGrid, SetupItemActions, SetupItemCard, SetupKeyValueList, SetupTagList } from '../shared/cards';
import { ScenarioDataGrid } from '../shared/grid/ScenarioDataGrid';
import type { SetupCollectionViewMode } from '../shared/useSetupCollectionViewMode';

interface GroupsSectionProps {
  scenario: Scenario | null;
  onAddGroup: () => void;
  onEditGroup: (group: Group) => void;
  onDeleteGroup: (groupId: string) => void;
  onApplyGridGroups: (groups: Group[]) => void;
  createGridGroupRow: () => Group;
}

function renderGroupContent(
  groups: Group[],
  scenario: Scenario | null,
  viewMode: SetupCollectionViewMode,
  gridWorkspaceMode: 'browse' | 'edit' | 'csv',
  setGridWorkspaceMode: React.Dispatch<React.SetStateAction<'browse' | 'edit' | 'csv'>>,
  onEditGroup: (group: Group) => void,
  onDeleteGroup: (groupId: string) => void,
  onApplyGridGroups: (groups: Group[]) => void,
  createGridGroupRow: () => Group,
) {
  if (viewMode === 'list') {
    return (
      <ScenarioDataGrid
        rows={groups}
        rowKey={(group) => group.id}
        onRowOpen={onEditGroup}
        rowOpenLabel={(group) => `Edit ${group.id}`}
        searchPlaceholder="Search groups or capacities…"
        workspace={{
          mode: gridWorkspaceMode,
          onModeChange: setGridWorkspaceMode,
          browseModeEnabled: false,
          draft: {
            onApply: onApplyGridGroups,
            createRow: createGridGroupRow,
            canDeleteRows: true,
            deleteRowLabel: (group) => `Delete ${group.id || 'group'}`,
            csv: {
              ariaLabel: 'Groups grid CSV',
              helperText: (
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <strong>Session capacities</strong> uses JSON arrays in CSV mode, e.g. <code>[2,2,2]</code>.
                </div>
              ),
            },
          },
        }}
        columns={[
          {
            kind: 'primitive' as const,
            id: 'group',
            header: 'Group',
            primitive: 'string' as const,
            getValue: (group: Group) => group.id,
            setValue: (group: Group, value) => ({ ...group, id: value ?? '' }),
            renderValue: (value) => <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>,
            width: 180,
          },
          {
            kind: 'primitive' as const,
            id: 'capacity',
            header: 'Default capacity',
            primitive: 'number' as const,
            getValue: (group: Group) => group.size,
            setValue: (group: Group, value) => ({ ...group, size: value ?? 1 }),
            renderValue: (value) => `${value ?? 0} people`,
            width: 180,
          },
          {
            kind: 'primitive' as const,
            id: 'session-capacities',
            header: 'Session capacities',
            primitive: 'array' as const,
            itemType: 'number' as const,
            getValue: (group: Group) =>
              scenario
                ? getGroupCapacityProfile(group, scenario.num_sessions)
                : [],
            setValue: (group: Group, value) => {
              const parsed = Array.isArray(value)
                ? value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry))
                : [];

              return {
                ...group,
                session_sizes:
                  parsed.length === 0 || parsed.every((entry) => entry === group.size)
                    ? undefined
                    : parsed,
              };
            },
            renderValue: (value) =>
              scenario && Array.isArray(value) && value.some((entry) => entry !== value[0])
                ? value.map((capacity, index) => `S${index + 1} ${capacity}`).join(' · ')
                : 'Uses default capacity in every session',
            searchText: (value) => Array.isArray(value) ? value.join(' ') : 'default capacity',
            width: 320,
          },
        ]}
      />
    );
  }

  return (
    <SetupCardGrid minColumnWidth="17rem">
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
    </SetupCardGrid>
  );
}

export function GroupsSection({
  scenario,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
  onApplyGridGroups,
  createGridGroupRow,
}: GroupsSectionProps) {
  const groups = useMemo(() => scenario?.groups ?? [], [scenario?.groups]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<SetupCollectionViewMode>('list');
  const [gridWorkspaceMode, setGridWorkspaceMode] = useState<'browse' | 'edit' | 'csv'>('edit');
  const searchValue = search.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (viewMode !== 'cards' || !searchValue) {
      return groups;
    }

    return groups.filter((group) => {
      const capacityProfile = scenario ? getGroupCapacityProfile(group, scenario.num_sessions) : [];
      const haystack = [
        group.id.toLowerCase(),
        String(group.size),
        capacityProfile.join(' '),
      ];

      return haystack.some((value) => value.includes(searchValue));
    });
  }, [groups, scenario, searchValue, viewMode]);

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
        <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={onAddGroup}>
          Add Group
        </Button>
      }
      defaultViewMode="list"
      onViewModeChange={(nextMode) => {
        setViewMode(nextMode);
        if (nextMode !== 'list') {
          setGridWorkspaceMode('edit');
        }
      }}
      toolbarLeading={(activeViewMode) =>
        activeViewMode === 'cards' ? (
          <SetupCardSearchToolbar
            label="Search groups"
            placeholder="Search groups or capacities..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch('')}
            status={searchValue ? `Showing ${filteredGroups.length} of ${groups.length} groups` : undefined}
          />
        ) : null
      }
      hasItems={filteredGroups.length > 0}
      emptyState={{
        icon: <Hash className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
        title: searchValue ? 'No groups match this search' : 'No groups added yet',
        message: searchValue
          ? 'Try a broader search or clear it to see every group.'
          : 'Add the groups people can be assigned to before tuning constraints and preferences.',
      }}
      renderContent={(activeViewMode) => renderGroupContent(filteredGroups, scenario, activeViewMode, gridWorkspaceMode, setGridWorkspaceMode, onEditGroup, onDeleteGroup, onApplyGridGroups, createGridGroupRow)}
    />
  );
}
