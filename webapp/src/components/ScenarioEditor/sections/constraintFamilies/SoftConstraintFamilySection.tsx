import React from 'react';
import { Plus } from 'lucide-react';
import type { Constraint } from '../../../../types';
import { findAttributeDefinition, getAttributeDefinitionName } from '../../../../services/scenarioAttributes';
import { createJsonRawCodec, validateStringNumberRecordValue } from '../../shared/grid/model/rawCodec';
import AttributeBalanceDashboard from '../../../AttributeBalanceDashboard';
import PairMeetingCountBulkConvertModal from '../../../modals/PairMeetingCountBulkConvertModal';
import { replaceConstraintsAtIndices } from '../../../constraints/constraintMutations';
import { Button } from '../../../ui';
import { SetupActionsMenu } from '../../shared/SetupActionsMenu';
import { SetupCardSearchToolbar } from '../../shared/SetupCardSearchToolbar';
import { SetupCollectionPage } from '../../shared/SetupCollectionPage';
import { normalizeSessionSelection } from '../../shared/sessionScope';
import {
  SetupItemActions,
  SetupItemCard,
  SetupSelectionToggle,
  SetupTypeBadge,
  SetupWeightBadge,
} from '../../shared/cards';
import { getConstraintDisplayName } from '../../../../utils/constraintDisplay';
import { ScenarioDataGrid } from '../../shared/grid/ScenarioDataGrid';
import { createOptionalSessionScopeColumn } from '../../shared/grid/sessionScopeColumn';
import { SetupPersonListText, formatPersonDisplayList, formatPersonSearchList } from '../../shared/personDisplay';
import type { SetupCollectionViewMode } from '../../shared/useSetupCollectionViewMode';
import { AttributeBalanceTargetsEditor } from './AttributeBalanceTargetsEditor';
import { SOFT_SECTION_COPY } from './copy';
import {
  ConstraintCards,
  formatAttributeBalanceTargets,
  getAttributeBalanceAttributeName,
  getAttributeBalanceTargetOptions,
  getIndexedConstraints,
  renderAttributeBalanceContent,
  renderPairMeetingCountContent,
  renderPeopleConstraintContent,
  useConstraintScenario,
} from './shared';
import type {
  AttributeBalanceConstraint,
  IndexedConstraint,
  PairMeetingCountConstraint,
  SoftConstraintFamily,
  SoftConstraintFamilySectionProps,
} from './types';

export function SoftConstraintFamilySection({
  family,
  onAdd,
  onEdit,
  onDelete,
  onApplyAttributeBalanceRows,
  createAttributeBalanceRow,
}: SoftConstraintFamilySectionProps) {
  const { scenario, setScenario, attributeDefinitions, addNotification, isLoading } = useConstraintScenario();
  const [search, setSearch] = React.useState('');
  const [viewMode, setViewMode] = React.useState<SetupCollectionViewMode>('list');
  const [gridWorkspaceMode, setGridWorkspaceMode] = React.useState<'browse' | 'edit' | 'csv'>('edit');
  const [selectedShouldIndices, setSelectedShouldIndices] = React.useState<number[]>([]);
  const [isSelectingShould, setIsSelectingShould] = React.useState(false);
  const [showPairConvert, setShowPairConvert] = React.useState(false);
  const handleViewModeChange = React.useCallback((nextMode: SetupCollectionViewMode) => {
    setViewMode(nextMode);
    if (nextMode !== 'cards') {
      setIsSelectingShould(false);
      setSelectedShouldIndices((current) => (current.length === 0 ? current : []));
    }
    if (nextMode !== 'list') {
      setGridWorkspaceMode('edit');
    }
  }, []);

  if (isLoading || !scenario) {
    return <div className="space-y-4 pt-1 pl-0">Loading...</div>;
  }

  const copy = SOFT_SECTION_COPY[family];
  const items = getIndexedConstraints(scenario, family);
  const searchValue = search.trim().toLowerCase();
  const getGroupMaxCapacity = (groupId?: string) => {
    const group = scenario.groups.find((entry) => entry.id === groupId);
    return group ? Math.max(group.size, ...(group.session_sizes ?? [])) : undefined;
  };

  const filteredItems = viewMode === 'cards'
    ? items.filter(({ constraint }) => {
        if (!searchValue) {
          return true;
        }

        if (constraint.type === 'ShouldNotBeTogether' || constraint.type === 'ShouldStayTogether') {
          const textPool = [formatPersonSearchList(scenario.people, constraint.people)];
          if (constraint.sessions) {
            textPool.push(...constraint.sessions.map((session) => String(session + 1)));
          }
          return textPool.some((value) => value.includes(searchValue));
        }

        if (constraint.type === 'AttributeBalance') {
          const attributeName = getAttributeBalanceAttributeName(constraint, attributeDefinitions).toLowerCase();
          const targets = formatAttributeBalanceTargets(constraint.desired_values ?? {}).toLowerCase();
          const sessionText = (constraint.sessions ?? []).map((session) => String(session + 1)).join(' ');
          return [constraint.group_id.toLowerCase(), attributeName, targets, constraint.mode.toLowerCase(), String(constraint.penalty_weight), sessionText]
            .some((value) => value.includes(searchValue));
        }

        if (constraint.type === 'PairMeetingCount') {
          const sessionText = constraint.sessions?.length
            ? constraint.sessions.map((session) => String(session + 1)).join(' ')
            : 'all sessions';
          return [
            formatPersonSearchList(scenario.people, constraint.people),
            String(constraint.target_meetings),
            constraint.mode.toLowerCase(),
            String(constraint.penalty_weight),
            sessionText,
          ].some((value) => value.includes(searchValue));
        }

        return true;
      })
    : items;

  const summary = family === 'AttributeBalance' && items.length > 0 ? (
    <AttributeBalanceDashboard constraints={items.map((item) => item.constraint as AttributeBalanceConstraint)} scenario={scenario} />
  ) : null;

  const createLocalGridRow = (): IndexedConstraint<Extract<Constraint, { type: SoftConstraintFamily }>> => {
    if (family === 'ShouldNotBeTogether' || family === 'ShouldStayTogether') {
      return {
        constraint: {
          type: family,
          people: [],
          penalty_weight: family === 'ShouldStayTogether' ? 10 : 1000,
          sessions: undefined,
        },
        index: -1,
      } as IndexedConstraint<Extract<Constraint, { type: SoftConstraintFamily }>>;
    }

    if (family === 'PairMeetingCount') {
      return {
        constraint: {
          type: 'PairMeetingCount',
          people: ['', ''],
          sessions: undefined,
          target_meetings: 1,
          mode: 'at_least',
          penalty_weight: 10,
        },
        index: -1,
      } as IndexedConstraint<Extract<Constraint, { type: SoftConstraintFamily }>>;
    }

    return createAttributeBalanceRow?.() as IndexedConstraint<Extract<Constraint, { type: SoftConstraintFamily }>>;
  };

  const applyLocalGridRows = (nextItems: Array<IndexedConstraint<Extract<Constraint, { type: SoftConstraintFamily }>>>) => {
    if (family === 'AttributeBalance') {
      onApplyAttributeBalanceRows?.(nextItems as Array<IndexedConstraint<AttributeBalanceConstraint>>);
      return;
    }

    const otherConstraints = scenario.constraints.filter((constraint) => constraint.type !== family);
    let skippedRows = 0;

    const nextConstraints = nextItems.flatMap(({ constraint }) => {
      if (constraint.type === 'ShouldNotBeTogether' || constraint.type === 'ShouldStayTogether') {
        const people = Array.from(new Set(constraint.people.filter(Boolean)));
        if (people.length < 2) {
          skippedRows += 1;
          return [];
        }

        const normalizedSessions = constraint.sessions?.length
          ? normalizeSessionSelection(constraint.sessions, scenario.num_sessions)
          : undefined;

        return [{
          ...constraint,
          people,
          penalty_weight: Math.max(0, Number(constraint.penalty_weight) || 0),
          sessions: normalizedSessions,
        } satisfies Constraint];
      }

      if (constraint.type === 'PairMeetingCount') {
        const people = Array.from(new Set(constraint.people.filter(Boolean))).slice(0, 2);
        if (people.length < 2) {
          skippedRows += 1;
          return [];
        }

        const normalizedSessions = constraint.sessions?.length
          ? normalizeSessionSelection(constraint.sessions, scenario.num_sessions)
          : undefined;
        const effectiveSessions = normalizedSessions ?? Array.from({ length: scenario.num_sessions }, (_, index) => index);
        const maxMeetings = effectiveSessions.length;

        return [{
          ...constraint,
          people: [people[0], people[1]] as [string, string],
          sessions: normalizedSessions,
          target_meetings: Math.min(Math.max(0, Math.round(Number(constraint.target_meetings) || 0)), maxMeetings),
          mode: constraint.mode === 'exact' || constraint.mode === 'at_most' ? constraint.mode : 'at_least',
          penalty_weight: Math.max(0, Number(constraint.penalty_weight) || 0),
        } satisfies Constraint];
      }

      return [];
    });

    setScenario({
      ...scenario,
      constraints: [...otherConstraints, ...nextConstraints],
    });

    addNotification({
      type: skippedRows > 0 ? 'info' : 'success',
      title: skippedRows > 0 ? 'Some Rows Skipped' : 'Constraints Updated',
      message: skippedRows > 0
        ? `Applied ${nextConstraints.length} ${copy.title.toLowerCase()} row${nextConstraints.length === 1 ? '' : 's'} and skipped ${skippedRows} incomplete row${skippedRows === 1 ? '' : 's'}.`
        : `Applied ${nextConstraints.length} ${copy.title.toLowerCase()} row${nextConstraints.length === 1 ? '' : 's'}.`,
    });
  };

  return (
    <>
      <SetupCollectionPage
        sectionKey={family}
        title={copy.title}
        count={items.length}
        description={copy.description}
        actions={
          <>
            {family === 'ShouldStayTogether' ? (
              <>
                <Button
                  variant={isSelectingShould ? 'primary' : 'secondary'}
                  onClick={() => {
                    setIsSelectingShould((current) => {
                      if (current) {
                        setSelectedShouldIndices([]);
                      }
                      return !current;
                    });
                  }}
                >
                  {isSelectingShould ? 'Done selecting' : 'Select cards'}
                </Button>
                <SetupActionsMenu
                  label="Actions"
                  summary={selectedShouldIndices.length > 0 ? `Advanced actions · ${selectedShouldIndices.length} selected` : 'Advanced actions'}
                  items={[
                    {
                      label: `Convert selected to ${getConstraintDisplayName('PairMeetingCount')}`,
                      disabled: selectedShouldIndices.length === 0,
                      description:
                        selectedShouldIndices.length === 0
                          ? 'Turn on card selection and choose one or more preferences first.'
                          : 'Break selected cliques into pair-based contact targets.',
                      onSelect: () => setShowPairConvert(true),
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
              placeholder={family === 'AttributeBalance' ? 'Filter by group, attribute, target, or session' : 'Filter by person or session'}
              status={searchValue ? `Showing ${filteredItems.length} of ${items.length}` : undefined}
            />
          ) : null
        }
        summary={summary}
        onViewModeChange={handleViewModeChange}
        defaultViewMode="list"
        hasItems={filteredItems.length > 0}
        emptyState={{
          icon: copy.icon,
          title: searchValue ? `No ${copy.title.toLowerCase()} match the current filter` : `No ${copy.title.toLowerCase()} yet`,
          message: searchValue
            ? 'Try a broader filter or clear the search to see all matching constraints.'
            : 'Add the first preference in this family to guide the solver more precisely.',
        }}
        renderContent={(nextViewMode: SetupCollectionViewMode) =>
          nextViewMode === 'cards' ? (
            <ConstraintCards
              items={filteredItems}
              renderCard={({ constraint, index }) => (
                <SetupItemCard
                  key={index}
                  selected={selectedShouldIndices.includes(index)}
                  badges={
                    <>
                      <SetupTypeBadge label={copy.title} />
                      {'penalty_weight' in constraint ? <SetupWeightBadge weight={constraint.penalty_weight} /> : null}
                    </>
                  }
                  onOpen={() => onEdit(constraint, index)}
                  openLabel={`Edit ${copy.title.toLowerCase()} constraint`}
                  allowInteractiveChildren={constraint.type === 'AttributeBalance'}
                  actions={
                    <>
                      {family === 'ShouldStayTogether' && isSelectingShould ? (
                        <SetupSelectionToggle
                          selected={selectedShouldIndices.includes(index)}
                          onToggle={() => setSelectedShouldIndices((previous) => previous.includes(index) ? previous.filter((value) => value !== index) : [...previous, index])}
                          label={`${selectedShouldIndices.includes(index) ? 'Deselect' : 'Select'} ${copy.title.toLowerCase()} item`}
                        />
                      ) : null}
                      <SetupItemActions onDelete={() => onDelete(index)} variant="card" />
                    </>
                  }
                >
                  {constraint.type === 'ShouldNotBeTogether' || constraint.type === 'ShouldStayTogether'
                    ? renderPeopleConstraintContent(scenario, constraint, index, setScenario)
                    : null}
                  {constraint.type === 'AttributeBalance'
                    ? renderAttributeBalanceContent(scenario, constraint, index, setScenario, attributeDefinitions)
                    : null}
                  {constraint.type === 'PairMeetingCount' ? renderPairMeetingCountContent(scenario, constraint) : null}
                </SetupItemCard>
              )}
            />
          ) : (
            <ScenarioDataGrid
              rows={filteredItems}
              rowKey={(item) => `${item.constraint.type}-${item.index}`}
              onRowOpen={(item) => onEdit(item.constraint, item.index)}
              rowOpenLabel={() => `Edit ${copy.title.toLowerCase()} constraint`}
              workspace={((family === 'AttributeBalance' && onApplyAttributeBalanceRows && createAttributeBalanceRow)
                || family === 'ShouldNotBeTogether'
                || family === 'ShouldStayTogether'
                || family === 'PairMeetingCount')
                ? {
                    mode: gridWorkspaceMode,
                    onModeChange: setGridWorkspaceMode,
                    browseModeEnabled: false,
                    draft: {
                      onApply: applyLocalGridRows,
                      createRow: createLocalGridRow,
                      csv: {
                        ariaLabel: `${copy.title} CSV`,
                        helperText: (
                          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {family === 'AttributeBalance'
                              ? <><strong>Targets</strong> use JSON objects and <strong>Sessions</strong> use JSON session-scope objects such as <code>{'{"mode":"all"}'}</code> or <code>{'{"mode":"selected","sessions":[0,1]}'}</code>.</>
                              : family === 'ShouldNotBeTogether' || family === 'ShouldStayTogether'
                                ? <><strong>Sessions</strong> use JSON session-scope objects such as <code>{'{"mode":"all"}'}</code> or <code>{'{"mode":"selected","sessions":[0,1]}'}</code>.</>
                                : 'Use Edit table or CSV to update these constraints in bulk.'}
                          </div>
                        ),
                      },
                    },
                  }
                : undefined}
              columns={[
                ...(family === 'AttributeBalance'
                  ? [
                      {
                        kind: 'primitive' as const,
                        id: 'group',
                        header: 'Group',
                        primitive: 'enum' as const,
                        options: scenario.groups.map((group) => ({ value: group.id, label: group.id })),
                        getValue: (item: IndexedConstraint<AttributeBalanceConstraint>) => item.constraint.group_id,
                        setValue: (item: IndexedConstraint<AttributeBalanceConstraint>, value) => ({
                          ...item,
                          constraint: {
                            ...item.constraint,
                            group_id: value ?? '',
                          },
                        }),
                        searchText: (value, item) => `${value ?? ''} ${item.constraint.attribute_key}`.trim(),
                        width: 180,
                      },
                      {
                        kind: 'primitive' as const,
                        id: 'attribute',
                        header: 'Attribute',
                        primitive: 'enum' as const,
                        options: attributeDefinitions.map((definition) => ({
                          value: definition.id,
                          label: getAttributeDefinitionName(definition),
                        })),
                        getValue: (item: IndexedConstraint<AttributeBalanceConstraint>) => findAttributeDefinition(attributeDefinitions, {
                          id: item.constraint.attribute_id,
                          name: item.constraint.attribute_key,
                        })?.id ?? item.constraint.attribute_id ?? '',
                        renderValue: (_value, item: IndexedConstraint<AttributeBalanceConstraint>) => getAttributeBalanceAttributeName(item.constraint, attributeDefinitions) || '—',
                        searchText: (_value, item: IndexedConstraint<AttributeBalanceConstraint>) => getAttributeBalanceAttributeName(item.constraint, attributeDefinitions) || '',
                        exportValue: (_value, item: IndexedConstraint<AttributeBalanceConstraint>) => getAttributeBalanceAttributeName(item.constraint, attributeDefinitions) || '',
                        setValue: (item: IndexedConstraint<AttributeBalanceConstraint>, value) => {
                          const definition = findAttributeDefinition(attributeDefinitions, { id: value, name: value });
                          const allowedValues = new Set(definition?.values ?? []);
                          const desiredValues = Object.fromEntries(
                            Object.entries(item.constraint.desired_values ?? {}).filter(([key]) => allowedValues.size === 0 || allowedValues.has(key)),
                          );

                          return {
                            ...item,
                            constraint: {
                              ...item.constraint,
                              attribute_id: definition?.id,
                              attribute_key: definition ? getAttributeDefinitionName(definition) : (value ?? ''),
                              desired_values: desiredValues,
                            },
                          };
                        },
                        width: 180,
                      },
                      {
                        kind: 'custom' as const,
                        id: 'targets',
                        header: 'Targets',
                        getValue: (item: IndexedConstraint<AttributeBalanceConstraint>) => item.constraint.desired_values ?? {},
                        setValue: (item: IndexedConstraint<AttributeBalanceConstraint>, value) => ({
                          ...item,
                          constraint: {
                            ...item.constraint,
                            desired_values: Object.fromEntries(
                              Object.entries((value as Record<string, number> | undefined) ?? {}).filter(([, targetValue]) => Number.isFinite(Number(targetValue))),
                            ),
                          },
                        }),
                        renderValue: (value) => formatAttributeBalanceTargets((value as Record<string, number> | undefined) ?? {}),
                        searchText: (value, item: IndexedConstraint<AttributeBalanceConstraint>) => {
                          const attributeName = getAttributeBalanceAttributeName(item.constraint, attributeDefinitions) || '';
                          return `${attributeName} ${formatAttributeBalanceTargets((value as Record<string, number> | undefined) ?? {})}`.trim();
                        },
                        rawCodec: createJsonRawCodec<Record<string, number>, IndexedConstraint<AttributeBalanceConstraint>>({
                          header: 'Targets',
                          validate: (rawValue, item) => validateStringNumberRecordValue({
                            header: 'Targets',
                            allowedKeys: new Set(getAttributeBalanceTargetOptions(item.constraint, attributeDefinitions)),
                          })(rawValue),
                        }),
                        renderEditor: ({ row, value, onCommit, disabled }) => (
                          <AttributeBalanceTargetsEditor
                            disabled={disabled}
                            options={getAttributeBalanceTargetOptions(row.constraint, attributeDefinitions)}
                            value={(value as Record<string, number> | undefined) ?? {}}
                            maxValue={getGroupMaxCapacity(row.constraint.group_id)}
                            onCommit={onCommit}
                          />
                        ),
                        width: 360,
                      },
                      {
                        kind: 'primitive' as const,
                        id: 'mode',
                        header: 'Mode',
                        primitive: 'enum' as const,
                        options: [
                          { value: 'exact', label: 'exact' },
                          { value: 'at_least', label: 'at least' },
                        ],
                        getValue: (item: IndexedConstraint<AttributeBalanceConstraint>) => item.constraint.mode ?? 'exact',
                        setValue: (item: IndexedConstraint<AttributeBalanceConstraint>, value) => ({
                          ...item,
                          constraint: {
                            ...item.constraint,
                            mode: value === 'at_least' ? 'at_least' : 'exact',
                          },
                        }),
                        width: 160,
                      },
                    ]
                  : family === 'PairMeetingCount'
                    ? [
                        {
                          kind: 'primitive' as const,
                          id: 'pair',
                          header: 'Pair',
                          primitive: 'array' as const,
                          itemType: 'string' as const,
                          options: scenario.people.map((person) => ({
                            value: person.id,
                            label: person.attributes.name,
                          })),
                          getValue: (item: IndexedConstraint<PairMeetingCountConstraint>) => item.constraint.people,
                          setValue: (item: IndexedConstraint<PairMeetingCountConstraint>, value) => ({
                            ...item,
                            constraint: {
                              ...item.constraint,
                              people: Array.from(new Set((Array.isArray(value) ? value : []).map(String))).slice(0, 2) as [string, string],
                            },
                          }),
                          renderValue: (value) => (
                            <SetupPersonListText people={scenario.people} personIds={(value as string[]) ?? []} separator=" & " />
                          ),
                          sortValue: (_value, item: IndexedConstraint<PairMeetingCountConstraint>) => formatPersonDisplayList(scenario.people, item.constraint.people, ' & '),
                          searchText: (_value, item: IndexedConstraint<PairMeetingCountConstraint>) => formatPersonSearchList(scenario.people, item.constraint.people),
                          exportValue: (_value, item: IndexedConstraint<PairMeetingCountConstraint>) => formatPersonDisplayList(scenario.people, item.constraint.people, ' & '),
                          width: 280,
                        },
                        {
                          kind: 'primitive' as const,
                          id: 'target-meetings',
                          header: 'Target meetings',
                          primitive: 'number' as const,
                          getValue: (item: IndexedConstraint<PairMeetingCountConstraint>) => item.constraint.target_meetings,
                          setValue: (item: IndexedConstraint<PairMeetingCountConstraint>, value) => ({
                            ...item,
                            constraint: {
                              ...item.constraint,
                              target_meetings: value ?? 0,
                            },
                          }),
                          width: 170,
                        },
                        {
                          kind: 'primitive' as const,
                          id: 'mode',
                          header: 'Mode',
                          primitive: 'enum' as const,
                          options: [
                            { value: 'at_least', label: 'at least' },
                            { value: 'exact', label: 'exact' },
                            { value: 'at_most', label: 'at most' },
                          ],
                          getValue: (item: IndexedConstraint<PairMeetingCountConstraint>) => item.constraint.mode ?? 'at_least',
                          setValue: (item: IndexedConstraint<PairMeetingCountConstraint>, value) => ({
                            ...item,
                            constraint: {
                              ...item.constraint,
                              mode: value === 'exact' || value === 'at_most' ? value : 'at_least',
                            },
                          }),
                          width: 160,
                        },
                      ]
                    : [
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
                          getValue: (item: IndexedConstraint<Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>>) => item.constraint.people,
                          setValue: (item: IndexedConstraint<Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>>, value) => ({
                            ...item,
                            constraint: {
                              ...item.constraint,
                              people: Array.from(new Set((Array.isArray(value) ? value : []).map(String))),
                            },
                          }),
                          renderValue: (value) => <SetupPersonListText people={scenario.people} personIds={(value as string[]) ?? []} />,
                          sortValue: (value) => Array.isArray(value) ? value.length : 0,
                          searchText: (_value, item: IndexedConstraint<Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>>) => formatPersonSearchList(scenario.people, item.constraint.people),
                          exportValue: (_value, item: IndexedConstraint<Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>>) => formatPersonDisplayList(scenario.people, item.constraint.people),
                          width: 280,
                        },
                      ]),
                ...('penalty_weight' in (filteredItems[0]?.constraint ?? {})
                  ? [{
                      kind: 'primitive' as const,
                      id: 'weight',
                      header: 'Weight',
                      primitive: 'number' as const,
                      getValue: (item: IndexedConstraint<Constraint & { penalty_weight: number }>) => item.constraint.penalty_weight,
                      setValue:
                        family === 'AttributeBalance'
                          ? (item: IndexedConstraint<AttributeBalanceConstraint>, value) => ({
                              ...item,
                              constraint: {
                                ...item.constraint,
                                penalty_weight: value ?? 0,
                              },
                            })
                          : family === 'PairMeetingCount'
                            ? (item: IndexedConstraint<PairMeetingCountConstraint>, value) => ({
                                ...item,
                                constraint: {
                                  ...item.constraint,
                                  penalty_weight: value ?? 0,
                                },
                              })
                            : family === 'ShouldNotBeTogether' || family === 'ShouldStayTogether'
                              ? (item: IndexedConstraint<Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>>, value) => ({
                                  ...item,
                                  constraint: {
                                    ...item.constraint,
                                    penalty_weight: value ?? 0,
                                  },
                                })
                              : undefined,
                      width: 140,
                    }]
                  : []),
                ...(family === 'AttributeBalance'
                  ? [createOptionalSessionScopeColumn<IndexedConstraint<AttributeBalanceConstraint>>({
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
                  : family === 'PairMeetingCount'
                    ? [createOptionalSessionScopeColumn<IndexedConstraint<PairMeetingCountConstraint>>({
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
                    : [createOptionalSessionScopeColumn<IndexedConstraint<Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>>>({
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

      {showPairConvert ? (
        <PairMeetingCountBulkConvertModal
          selectedCount={selectedShouldIndices.length}
          totalSessions={scenario.num_sessions}
          people={scenario.people}
          selectedConstraints={filteredItems
            .filter(({ index }) => selectedShouldIndices.includes(index))
            .map(({ index, constraint }) => ({ index, people: (constraint as Extract<Constraint, { type: 'ShouldStayTogether' }>).people }))}
          onCancel={() => setShowPairConvert(false)}
          onConvert={({ retainOriginal, sessions, target, mode, useSourceWeight, overrideWeight, anchorsByIndex }) => {
            setScenario(replaceConstraintsAtIndices(scenario, selectedShouldIndices, (currentConstraint, index) => {
              if (currentConstraint.type !== 'ShouldStayTogether') {
                return [currentConstraint];
              }

              const baseWeight = currentConstraint.penalty_weight;
              const weight = useSourceWeight && typeof baseWeight === 'number' ? baseWeight : (overrideWeight as number);
              const people = currentConstraint.people;
              const perConstraintAnchor = anchorsByIndex && anchorsByIndex[index];
              const anchor = perConstraintAnchor && people.includes(perConstraintAnchor) ? perConstraintAnchor : people[0];
              const pairConstraints = people.flatMap((personId) => {
                if (personId === anchor) {
                  return [];
                }

                return [{
                  type: 'PairMeetingCount',
                  people: [anchor, personId],
                  sessions,
                  target_meetings: target,
                  mode,
                  penalty_weight: weight,
                } satisfies Constraint];
              });

              return retainOriginal ? [...pairConstraints, currentConstraint] : pairConstraints;
            }));
            setSelectedShouldIndices([]);
            setShowPairConvert(false);
          }}
        />
      ) : null}
    </>
  );
}
