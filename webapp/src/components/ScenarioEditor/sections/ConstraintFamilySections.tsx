import React from 'react';
import { Filter, Link2, Plus, Search, UserLock, UserMinus, Users } from 'lucide-react';
import type { Constraint, Scenario } from '../../../types';
import { useAppStore } from '../../../store';
import { Button } from '../../ui';
import AttributeBalanceDashboard from '../../AttributeBalanceDashboard';
import ConstraintPersonChip from '../../ConstraintPersonChip';
import PairMeetingCountBulkConvertModal from '../../modals/PairMeetingCountBulkConvertModal';
import { removePersonFromPeopleConstraint, replaceConstraintsAtIndices } from '../../constraints/constraintMutations';
import { SetupCollectionPage } from '../shared/SetupCollectionPage';
import {
  SetupItemActions,
  SetupItemCard,
  SetupKeyValueList,
  SetupPeopleNodeList,
  SetupSessionsBadgeList,
  SetupTagList,
  SetupTypeBadge,
  SetupWeightBadge,
} from '../shared/cards';
import { ScenarioDataGrid } from '../shared/grid/ScenarioDataGrid';
import { SetupPersonListText, formatPersonDisplayList, formatPersonSearchList } from '../shared/personDisplay';
import type { SetupCollectionViewMode } from '../shared/useSetupCollectionViewMode';

type HardConstraintFamily = 'ImmovablePeople' | 'MustStayTogether';
type SoftConstraintFamily =
  | 'ShouldNotBeTogether'
  | 'ShouldStayTogether'
  | 'AttributeBalance'
  | 'PairMeetingCount';

type IndexedConstraint<T extends Constraint> = { constraint: T; index: number };

type PeopleConstraint = Extract<Constraint, { type: 'ImmovablePeople' | 'MustStayTogether' | 'ShouldNotBeTogether' | 'ShouldStayTogether' }>;
type AttributeBalanceConstraint = Extract<Constraint, { type: 'AttributeBalance' }>;
type PairMeetingCountConstraint = Extract<Constraint, { type: 'PairMeetingCount' }>;

interface HardConstraintFamilySectionProps {
  family: HardConstraintFamily;
  onAdd: (type: HardConstraintFamily) => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
}

interface SoftConstraintFamilySectionProps {
  family: SoftConstraintFamily;
  onAdd: (type: SoftConstraintFamily) => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
}

const HARD_SECTION_COPY: Record<HardConstraintFamily, { title: string; description: React.ReactNode; icon: React.ReactNode; addLabel: string }> = {
  ImmovablePeople: {
    title: 'Immovable People',
    description: (
      <p>
        Fix selected people to a specific group in selected sessions. Use this for presenters, hosts, or any other
        participants whose placement is predetermined.
      </p>
    ),
    icon: <UserLock className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Immovable People',
  },
  MustStayTogether: {
    title: 'Must Stay Together',
    description: (
      <p>
        Require selected people to stay in the same group. This is a requirement, so breaking the set would make the
        solution invalid.
      </p>
    ),
    icon: <Users className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Clique',
  },
};

const SOFT_SECTION_COPY: Record<SoftConstraintFamily, { title: string; description: React.ReactNode; icon: React.ReactNode; addLabel: string }> = {
  ShouldNotBeTogether: {
    title: 'Should Not Be Together',
    description: (
      <p>
        Discourage selected people from landing in the same group. Violations remain possible, but they add weighted
        cost to the schedule.
      </p>
    ),
    icon: <UserMinus className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Should Not Be Together',
  },
  ShouldStayTogether: {
    title: 'Should Stay Together',
    description: (
      <p>
        Prefer selected people to remain together without making it mandatory. Use this when feasibility matters more
        than enforcing a hard grouping rule.
      </p>
    ),
    icon: <Link2 className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Should Stay Together',
  },
  AttributeBalance: {
    title: 'Attribute Balance',
    description: (
      <p>
        Guide group composition toward a target attribute distribution. This is useful for balancing roles, tracks, or
        other categorical attributes.
      </p>
    ),
    icon: <Filter className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Attribute Balance',
  },
  PairMeetingCount: {
    title: 'Pair Meeting Count',
    description: (
      <p>
        Target how often important pairs should meet. Use this to capture at-least, at-most, or exact pair-contact
        goals.
      </p>
    ),
    icon: <Users className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Pair Meeting Count',
  },
};

function useConstraintScenario() {
  const { resolveScenario, setScenario, ui } = useAppStore();

  if (ui.isLoading) {
    return { scenario: null, setScenario, isLoading: true } as const;
  }

  return {
    scenario: resolveScenario(),
    setScenario,
    isLoading: false,
  } as const;
}

function getIndexedConstraints<T extends Constraint['type']>(scenario: Scenario, type: T) {
  return scenario.constraints
    .map((constraint, index) => ({ constraint, index }))
    .filter((item): item is IndexedConstraint<Extract<Constraint, { type: T }>> => item.constraint.type === type);
}

function createPeopleNodes(
  scenario: Scenario,
  people: string[],
  index: number,
  minimumRemainingPeople: number,
  setScenario: (scenario: Scenario) => void,
  invalidRemovalMessage: string,
) {
  return people.map((personId) => (
    <ConstraintPersonChip
      key={personId}
      personId={personId}
      people={scenario.people}
      onRemove={(removeId) => {
        const remainingPeople = people.filter((id) => id !== removeId);
        const willBeInvalid = remainingPeople.length < minimumRemainingPeople;
        if (willBeInvalid) {
          if (!window.confirm(invalidRemovalMessage)) return;
        }
        setScenario(removePersonFromPeopleConstraint(scenario, index, removeId, minimumRemainingPeople));
      }}
    />
  ));
}

function renderPeopleConstraintContent(
  scenario: Scenario,
  constraint: PeopleConstraint,
  index: number,
  setScenario: (scenario: Scenario) => void,
) {
  const minimumRemainingPeople = constraint.type === 'ImmovablePeople' ? 1 : 2;
  const invalidRemovalMessage =
    constraint.type === 'ImmovablePeople'
      ? 'Removing this person will leave the constraint empty. Remove the entire constraint?'
      : 'Removing this person will leave the constraint invalid. Remove the entire constraint?';

  return (
    <>
      <SetupPeopleNodeList
        label={constraint.type === 'PairMeetingCount' ? 'Pair' : 'People'}
        people={createPeopleNodes(scenario, constraint.people, index, minimumRemainingPeople, setScenario, invalidRemovalMessage)}
      />
      {'group_id' in constraint ? <SetupKeyValueList items={[{ label: 'Group', value: constraint.group_id }]} /> : null}
      <SetupSessionsBadgeList sessions={constraint.sessions} />
    </>
  );
}

function renderAttributeBalanceContent(constraint: AttributeBalanceConstraint) {
  return (
    <>
      <SetupKeyValueList
        items={[
          { label: 'Group', value: constraint.group_id },
          { label: 'Attribute', value: constraint.attribute_key },
        ]}
      />
      <SetupTagList
        items={Object.entries(constraint.desired_values || {}).map(([key, value]) => (
          <span
            key={key}
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
          >
            {key}: {value}
          </span>
        ))}
      />
      <SetupSessionsBadgeList sessions={constraint.sessions} />
    </>
  );
}

function renderPairMeetingCountContent(scenario: Scenario, constraint: PairMeetingCountConstraint) {
  return (
    <>
      <SetupPeopleNodeList
        label="Pair"
        people={constraint.people.map((personId) => (
          <ConstraintPersonChip key={personId} personId={personId} people={scenario.people} />
        ))}
      />
      <SetupKeyValueList
        items={[
          { label: 'Target meetings', value: constraint.target_meetings },
          { label: 'Mode', value: constraint.mode || 'at_least' },
        ]}
      />
      <SetupSessionsBadgeList sessions={constraint.sessions} />
    </>
  );
}

function ConstraintCards<T extends Constraint>({
  items,
  renderCard,
}: {
  items: Array<IndexedConstraint<T>>;
  renderCard: (item: IndexedConstraint<T>) => React.ReactNode;
}) {
  return <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{items.map(renderCard)}</div>;
}

export function HardConstraintFamilySection({ family, onAdd, onEdit, onDelete }: HardConstraintFamilySectionProps) {
  const { scenario, setScenario, isLoading } = useConstraintScenario();
  const [search, setSearch] = React.useState('');
  const [minMembers, setMinMembers] = React.useState<number | ''>('');
  const [selectedMustIndices, setSelectedMustIndices] = React.useState<number[]>([]);
  const [showBulkConvert, setShowBulkConvert] = React.useState(false);
  const [bulkWeight, setBulkWeight] = React.useState<number | ''>(10);

  if (isLoading || !scenario) {
    return <div className="space-y-4 pt-1 pl-0">Loading...</div>;
  }

  const copy = HARD_SECTION_COPY[family];
  const items = getIndexedConstraints(scenario, family);
  const searchValue = search.trim().toLowerCase();

  const filteredItems = family === 'MustStayTogether'
    ? items.filter(({ constraint }) => {
        if (minMembers !== '' && constraint.people.length < minMembers) {
          return false;
        }
        if (!searchValue) {
          return true;
        }
        const textPool: string[] = [];
        for (const personId of constraint.people) {
          textPool.push(personId.toLowerCase());
          const person = scenario.people.find((candidate) => candidate.id === personId);
          if (person?.attributes?.name) {
            textPool.push(String(person.attributes.name).toLowerCase());
          }
        }
        if (Array.isArray(constraint.sessions)) {
          textPool.push(...constraint.sessions.map((session) => String(session + 1)));
        }
        return textPool.some((value) => value.includes(searchValue));
      })
    : items;

  return (
    <>
      <SetupCollectionPage
        sectionKey={family === 'ImmovablePeople' ? 'immovable-people' : 'must-stay-together'}
        title={copy.title}
        count={items.length}
        description={copy.description}
        actions={
          <>
            {family === 'MustStayTogether' && selectedMustIndices.length > 0 ? (
              <Button variant="secondary" onClick={() => setShowBulkConvert(true)}>
                Convert Selected to Should Stay Together
              </Button>
            ) : null}
            <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => onAdd(family)}>
              {copy.addLabel}
            </Button>
          </>
        }
        toolbarLeading={
          family === 'MustStayTogether' ? (
            <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
              <label className="relative block min-w-0 flex-1 md:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter by person or session"
                  className="input w-full pl-9"
                />
              </label>
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
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Showing {filteredItems.length} of {items.length}. Selected {selectedMustIndices.length}.
              </div>
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Review fixed placements as cards or switch to list view for sorting and column control.
            </div>
          )
        }
        hasItems={filteredItems.length > 0}
        emptyState={{
          icon: copy.icon,
          title: searchValue ? `No ${copy.title.toLowerCase()} match the current filter` : `No ${copy.title.toLowerCase()} yet`,
          message: searchValue
            ? 'Try a broader filter or clear the search to see all matching constraints.'
            : 'Add the first constraint in this family to guide the setup rules more precisely.',
        }}
        renderContent={(viewMode: SetupCollectionViewMode) =>
          viewMode === 'cards' ? (
            <ConstraintCards
              items={filteredItems}
              renderCard={({ constraint, index }) => (
                <SetupItemCard
                  key={index}
                  badges={
                    <>
                      <SetupTypeBadge label={copy.title} />
                      {family === 'MustStayTogether' ? (
                        <label className="text-xs inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                          <input
                            type="checkbox"
                            checked={selectedMustIndices.includes(index)}
                            onChange={() => setSelectedMustIndices((previous) => previous.includes(index) ? previous.filter((value) => value !== index) : [...previous, index])}
                          />
                          <span>Select</span>
                        </label>
                      ) : null}
                    </>
                  }
                  actions={<SetupItemActions onEdit={() => onEdit(constraint, index)} onDelete={() => onDelete(index)} />}
                >
                  {renderPeopleConstraintContent(scenario, constraint as PeopleConstraint, index, setScenario)}
                </SetupItemCard>
              )}
            />
          ) : (
            <ScenarioDataGrid
              rows={filteredItems}
              rowKey={(item) => `${item.constraint.type}-${item.index}`}
              columns={[
                {
                  id: 'people',
                  header: 'People',
                  cell: (item) => <SetupPersonListText people={scenario.people} personIds={item.constraint.people} />,
                  sortValue: (item) => item.constraint.people.length,
                  searchValue: (item) => formatPersonSearchList(scenario.people, item.constraint.people),
                  width: 280,
                },
                ...(family === 'ImmovablePeople'
                  ? [{
                      id: 'group',
                      header: 'Group',
                      cell: (item: IndexedConstraint<Extract<Constraint, { type: 'ImmovablePeople' }>>) => item.constraint.group_id,
                      sortValue: (item: IndexedConstraint<Extract<Constraint, { type: 'ImmovablePeople' }>>) => item.constraint.group_id,
                      searchValue: (item: IndexedConstraint<Extract<Constraint, { type: 'ImmovablePeople' }>>) => item.constraint.group_id,
                      width: 180,
                    }]
                  : []),
                {
                  id: 'sessions',
                  header: 'Sessions',
                  cell: (item) => item.constraint.sessions?.length ? item.constraint.sessions.map((session) => session + 1).join(', ') : 'All sessions',
                  searchValue: (item) => item.constraint.sessions?.join(' ') || 'all sessions',
                  width: 220,
                },
                {
                  id: 'actions',
                  header: 'Actions',
                  cell: (item) => (
                    <div className="flex justify-end">
                      <SetupItemActions onEdit={() => onEdit(item.constraint, item.index)} onDelete={() => onDelete(item.index)} />
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
              Convert to Should Stay Together
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {selectedMustIndices.length} selected clique{selectedMustIndices.length === 1 ? '' : 's'} will be converted to Should Stay Together with the chosen penalty weight.
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
                  setScenario(replaceConstraintsAtIndices(scenario, selectedMustIndices, (currentConstraint) => {
                    if (currentConstraint.type !== 'MustStayTogether') {
                      return [currentConstraint];
                    }
                    return [{
                      type: 'ShouldStayTogether',
                      people: currentConstraint.people,
                      sessions: currentConstraint.sessions,
                      penalty_weight: bulkWeight,
                    } satisfies Constraint];
                  }));
                  setSelectedMustIndices([]);
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

export function SoftConstraintFamilySection({ family, onAdd, onEdit, onDelete }: SoftConstraintFamilySectionProps) {
  const { scenario, setScenario, isLoading } = useConstraintScenario();
  const [search, setSearch] = React.useState('');
  const [selectedShouldIndices, setSelectedShouldIndices] = React.useState<number[]>([]);
  const [showPairConvert, setShowPairConvert] = React.useState(false);

  if (isLoading || !scenario) {
    return <div className="space-y-4 pt-1 pl-0">Loading...</div>;
  }

  const copy = SOFT_SECTION_COPY[family];
  const items = getIndexedConstraints(scenario, family);
  const searchValue = search.trim().toLowerCase();

  const filteredItems = family === 'ShouldStayTogether'
    ? items.filter(({ constraint }) => {
        if (!searchValue) return true;
        const textPool: string[] = [];
        for (const personId of constraint.people) {
          textPool.push(personId.toLowerCase());
          const person = scenario.people.find((candidate) => candidate.id === personId);
          if (person?.attributes?.name) {
            textPool.push(String(person.attributes.name).toLowerCase());
          }
        }
        if (constraint.sessions) {
          textPool.push(...constraint.sessions.map((session) => String(session + 1)));
        }
        return textPool.some((value) => value.includes(searchValue));
      })
    : items;

  const summary = family === 'AttributeBalance' && items.length > 0 ? (
    <AttributeBalanceDashboard constraints={items.map((item) => item.constraint as AttributeBalanceConstraint)} scenario={scenario} />
  ) : null;

  return (
    <>
      <SetupCollectionPage
        sectionKey={family}
        title={copy.title}
        count={items.length}
        description={copy.description}
        actions={
          <>
            {family === 'ShouldStayTogether' && selectedShouldIndices.length > 0 ? (
              <Button variant="secondary" onClick={() => setShowPairConvert(true)}>
                Convert Selected to Pair Meeting Count
              </Button>
            ) : null}
            <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => onAdd(family)}>
              {copy.addLabel}
            </Button>
          </>
        }
        toolbarLeading={
          family === 'ShouldStayTogether' ? (
            <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
              <label className="relative block min-w-0 flex-1 md:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
                <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by person or session" className="input w-full pl-9" />
              </label>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Showing {filteredItems.length} of {items.length}. Selected {selectedShouldIndices.length}.
              </div>
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Each family gets the same cards/list structure while preserving its family-specific metadata and summaries.
            </div>
          )
        }
        summary={summary}
        hasItems={filteredItems.length > 0}
        emptyState={{
          icon: copy.icon,
          title: searchValue ? `No ${copy.title.toLowerCase()} match the current filter` : `No ${copy.title.toLowerCase()} yet`,
          message: searchValue
            ? 'Try a broader filter or clear the search to see all matching constraints.'
            : 'Add the first preference in this family to guide the solver more precisely.',
        }}
        renderContent={(viewMode: SetupCollectionViewMode) =>
          viewMode === 'cards' ? (
            <ConstraintCards
              items={filteredItems}
              renderCard={({ constraint, index }) => (
                <SetupItemCard
                  key={index}
                  badges={
                    <>
                      <SetupTypeBadge label={copy.title} />
                      {'penalty_weight' in constraint ? <SetupWeightBadge weight={constraint.penalty_weight} /> : null}
                      {family === 'ShouldStayTogether' ? (
                        <label className="text-xs inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                          <input
                            type="checkbox"
                            checked={selectedShouldIndices.includes(index)}
                            onChange={() => setSelectedShouldIndices((previous) => previous.includes(index) ? previous.filter((value) => value !== index) : [...previous, index])}
                          />
                          <span>Select</span>
                        </label>
                      ) : null}
                    </>
                  }
                  actions={<SetupItemActions onEdit={() => onEdit(constraint, index)} onDelete={() => onDelete(index)} />}
                >
                  {constraint.type === 'ShouldNotBeTogether' || constraint.type === 'ShouldStayTogether'
                    ? renderPeopleConstraintContent(scenario, constraint as PeopleConstraint, index, setScenario)
                    : null}
                  {constraint.type === 'AttributeBalance' ? renderAttributeBalanceContent(constraint) : null}
                  {constraint.type === 'PairMeetingCount' ? renderPairMeetingCountContent(scenario, constraint) : null}
                </SetupItemCard>
              )}
            />
          ) : (
            <ScenarioDataGrid
              rows={filteredItems}
              rowKey={(item) => `${item.constraint.type}-${item.index}`}
              columns={[
                ...(family === 'AttributeBalance'
                  ? [
                      {
                        id: 'group',
                        header: 'Group',
                        cell: (item: IndexedConstraint<AttributeBalanceConstraint>) => item.constraint.group_id,
                        sortValue: (item: IndexedConstraint<AttributeBalanceConstraint>) => item.constraint.group_id,
                        searchValue: (item: IndexedConstraint<AttributeBalanceConstraint>) => `${item.constraint.group_id} ${item.constraint.attribute_key}`,
                        width: 180,
                      },
                      {
                        id: 'attribute',
                        header: 'Attribute',
                        cell: (item: IndexedConstraint<AttributeBalanceConstraint>) => item.constraint.attribute_key,
                        sortValue: (item: IndexedConstraint<AttributeBalanceConstraint>) => item.constraint.attribute_key,
                        searchValue: (item: IndexedConstraint<AttributeBalanceConstraint>) => item.constraint.attribute_key,
                        width: 180,
                      },
                    ]
                  : family === 'PairMeetingCount'
                    ? [
                        {
                          id: 'pair',
                          header: 'Pair',
                          cell: (item: IndexedConstraint<PairMeetingCountConstraint>) => (
                            <SetupPersonListText people={scenario.people} personIds={item.constraint.people} separator=" & " />
                          ),
                          sortValue: (item: IndexedConstraint<PairMeetingCountConstraint>) => formatPersonDisplayList(scenario.people, item.constraint.people, ' & '),
                          searchValue: (item: IndexedConstraint<PairMeetingCountConstraint>) => formatPersonSearchList(scenario.people, item.constraint.people),
                          width: 280,
                        },
                      ]
                    : [
                        {
                          id: 'people',
                          header: 'People',
                          cell: (item: IndexedConstraint<Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>>) => (
                            <SetupPersonListText people={scenario.people} personIds={item.constraint.people} />
                          ),
                          sortValue: (item: IndexedConstraint<Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>>) => item.constraint.people.length,
                          searchValue: (item: IndexedConstraint<Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>>) => formatPersonSearchList(scenario.people, item.constraint.people),
                          width: 280,
                        },
                      ]),
                ...('penalty_weight' in (filteredItems[0]?.constraint ?? {})
                  ? [{
                      id: 'weight',
                      header: 'Weight',
                      cell: (item: IndexedConstraint<Constraint & { penalty_weight: number }>) => item.constraint.penalty_weight,
                      sortValue: (item: IndexedConstraint<Constraint & { penalty_weight: number }>) => item.constraint.penalty_weight,
                      searchValue: (item: IndexedConstraint<Constraint & { penalty_weight: number }>) => String(item.constraint.penalty_weight),
                      width: 140,
                    }]
                  : []),
                {
                  id: 'sessions',
                  header: 'Sessions',
                  cell: (item) => 'sessions' in item.constraint && item.constraint.sessions?.length ? item.constraint.sessions.map((session) => session + 1).join(', ') : 'All sessions',
                  searchValue: (item) => ('sessions' in item.constraint && item.constraint.sessions ? item.constraint.sessions.join(' ') : 'all sessions'),
                  width: 220,
                },
                {
                  id: 'actions',
                  header: 'Actions',
                  cell: (item) => (
                    <div className="flex justify-end">
                      <SetupItemActions onEdit={() => onEdit(item.constraint, item.index)} onDelete={() => onDelete(item.index)} />
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
