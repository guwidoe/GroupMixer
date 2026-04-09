import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Constraint } from '../../types';
import { useAppStore } from '../../store';
import { ConstraintFamilyPanel } from '../ScenarioEditor/sections/constraints/ConstraintFamilyPanel';
import {
  SetupItemActions,
  SetupItemCard,
  SetupKeyValueList,
  SetupPeopleNodeList,
  SetupSessionsBadgeList,
  SetupTagList,
  SetupTypeBadge,
  SetupWeightBadge,
} from '../ScenarioEditor/shared/cards';
import AttributeBalanceDashboard from '../AttributeBalanceDashboard';
// PersonCard removed in favor of ConstraintPersonChip
import ConstraintPersonChip from '../ConstraintPersonChip';
import PairMeetingCountBulkConvertModal from '../modals/PairMeetingCountBulkConvertModal';
import {
  removePersonFromPeopleConstraint,
  replaceConstraintsAtIndices,
} from './constraintMutations';

// Import the specific constraint type for the dashboard
interface AttributeBalanceConstraint {
  type: 'AttributeBalance';
  group_id: string;
  attribute_key: string;
  desired_values: Record<string, number>;
  penalty_weight: number;
  sessions?: number[];
}

interface Props {
  onAddConstraint: (type: SoftConstraintFamily) => void;
  onEditConstraint: (constraint: Constraint, index: number) => void;
  onDeleteConstraint: (index: number) => void;
  forcedTab?: SoftConstraintFamily;
  showFamilyNav?: boolean;
  title?: string;
  infoTitle?: string;
  infoContent?: React.ReactNode;
}

type PairMeetingCountConstraint = Extract<Constraint, { type: 'PairMeetingCount' }>;
type ShouldStayTogetherConstraint = Extract<Constraint, { type: 'ShouldStayTogether' }>;

type SoftConstraintFamily =
  | 'RepeatEncounter'
  | 'ShouldNotBeTogether'
  | 'ShouldStayTogether'
  | 'AttributeBalance'
  | 'PairMeetingCount';

const SOFT_TABS = ['RepeatEncounter', 'ShouldNotBeTogether', 'ShouldStayTogether', 'AttributeBalance', 'PairMeetingCount'] as const satisfies readonly SoftConstraintFamily[];

const constraintTypeLabels: Record<typeof SOFT_TABS[number], string> = {
  RepeatEncounter: 'Repeat Encounter',
  ShouldNotBeTogether: 'Should Not Be Together',
  ShouldStayTogether: 'Should Stay Together',
  AttributeBalance: 'Attribute Balance',
  PairMeetingCount: 'Pair Meeting Count',
};

const SoftConstraintsPanel: React.FC<Props> = ({
  onAddConstraint,
  onEditConstraint,
  onDeleteConstraint,
  forcedTab,
  showFamilyNav = true,
  title,
  infoTitle,
  infoContent,
}) => {
  const [localActiveTab, setLocalActiveTab] = useState<SoftConstraintFamily>('RepeatEncounter');
  const activeTab = forcedTab ?? localActiveTab;
  const [showInfo, setShowInfo] = useState(false);
  const { resolveScenario, setScenario, ui } = useAppStore();
  const [filterText, setFilterText] = useState('');
  const [selectedShouldIndices, setSelectedShouldIndices] = useState<number[]>([]);
  const [showPairConvert, setShowPairConvert] = useState(false);

  // Don't render until loading is complete to avoid creating new scenarios
  if (ui.isLoading) {
    return <div className="space-y-4 pt-1 pl-0">Loading...</div>;
  }

  const scenario = resolveScenario();

  const constraintsByType = (scenario.constraints || []).reduce((acc: Record<string, { constraint: Constraint; index: number }[]>, c, i) => {
    if (!acc[c.type]) acc[c.type] = [];
    acc[c.type].push({ constraint: c, index: i });
    return acc;
  }, {});

  const selectedItems = constraintsByType[activeTab] || [];
  const familyItems = SOFT_TABS.map((tab) => ({
    id: tab,
    label: constraintTypeLabels[tab],
    count: constraintsByType[tab]?.length || 0,
  }));

  const shouldItems = (constraintsByType['ShouldStayTogether'] || []) as Array<{ constraint: Constraint; index: number }>;
  const filteredShouldItems = shouldItems.filter(
    (item): item is { constraint: ShouldStayTogetherConstraint; index: number } => {
      if (item.constraint.type !== 'ShouldStayTogether') return false;
      const ft = filterText.trim().toLowerCase();
      if (!ft) return true;
      const textPool: string[] = [];
      for (const pid of item.constraint.people) {
        textPool.push(pid.toLowerCase());
      }
      if (Array.isArray(item.constraint.sessions)) {
        textPool.push(...item.constraint.sessions.map((s) => String(s + 1)));
      }
      return textPool.some((t) => t.includes(ft));
    }
  );

  return (
    <ConstraintFamilyPanel
      title={title ?? (showFamilyNav ? 'Soft Constraints' : constraintTypeLabels[activeTab])}
      infoTitle={infoTitle ?? 'How does this preference work?'}
      infoContent={infoContent ?? (
        <>
          <p className="mb-2">Soft constraints can be violated. Each violation increases the schedule cost by its penalty weight.</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><strong>Repeat Encounter</strong>: Limit how often pairs meet.</li>
            <li><strong>Attribute Balance</strong>: Keep group attribute distributions balanced.</li>
            <li><strong>Should Not Be Together</strong>: Discourage specified people from sharing a group.</li>
          </ul>
        </>
      )}
      showInfo={showInfo}
      onToggleInfo={() => setShowInfo(!showInfo)}
      families={showFamilyNav ? familyItems : undefined}
      activeFamilyId={showFamilyNav ? activeTab : undefined}
      onChangeFamily={showFamilyNav ? (familyId) => setLocalActiveTab(familyId as SoftConstraintFamily) : undefined}
    >
      <div>
        <button
          onClick={() => onAddConstraint(activeTab)}
          className="btn-primary flex items-center gap-2 px-3 py-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          {activeTab === 'RepeatEncounter'
            ? 'Add Repeat Limit'
            : activeTab === 'AttributeBalance'
            ? 'Add Attribute Balance'
            : activeTab === 'ShouldNotBeTogether'
            ? 'Add Should Not Be Together'
            : activeTab === 'ShouldStayTogether'
            ? 'Add Should Stay Together'
            : activeTab === 'PairMeetingCount'
            ? 'Add Pair Meeting Count'
            : 'Add Constraint'}
        </button>
        {activeTab === 'ShouldStayTogether' && selectedShouldIndices.length > 0 && (
          <button className="btn-secondary ml-2 px-3 py-2 text-sm" onClick={() => setShowPairConvert(true)}>
            Convert Selected to Pair Meeting Count
          </button>
        )}
      </div>
      {activeTab === 'ShouldStayTogether' && (
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Filter by person or session</label>
            <input type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="Type person id/name or session number" className="input w-full text-sm py-2" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn-secondary px-3 py-2 text-sm" onClick={() => setSelectedShouldIndices(filteredShouldItems.map(i => i.index))}>Select All Filtered</button>
            <button className="btn-secondary px-3 py-2 text-sm" onClick={() => setSelectedShouldIndices(prev => prev.filter(i => !filteredShouldItems.some(fi => fi.index === i)))}>Deselect Filtered</button>
            <button className="btn-secondary px-3 py-2 text-sm" onClick={() => {
              const filteredIndices = filteredShouldItems.map(i => i.index);
              setSelectedShouldIndices(prev => {
                const setPrev = new Set(prev);
                const result = new Set(prev);
                for (const idx of filteredIndices) {
                  if (setPrev.has(idx)) result.delete(idx); else result.add(idx);
                }
                return Array.from(result);
              });
            }}>Invert Filtered</button>
          </div>
          <div className="w-full text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Showing {filteredShouldItems.length} of {(constraintsByType['ShouldStayTogether'] || []).length}. Selected {selectedShouldIndices.length}.
          </div>
        </div>
      )}
      {activeTab === 'AttributeBalance' && selectedItems.length > 0 && (
        <div>
          <AttributeBalanceDashboard 
            constraints={selectedItems.map(i => i.constraint as AttributeBalanceConstraint)} 
            scenario={scenario} 
          />
        </div>
      )}
      {selectedItems.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No {constraintTypeLabels[activeTab]} constraints defined.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(activeTab === 'ShouldStayTogether' ? filteredShouldItems : selectedItems).map(({ constraint, index }) => (
            <SetupItemCard
              key={index}
              badges={
                <>
                  <SetupTypeBadge label={constraintTypeLabels[constraint.type as SoftConstraintFamily]} />
                  {(constraint as Constraint & { penalty_weight?: number }).penalty_weight !== undefined ? (
                    <SetupWeightBadge weight={(constraint as Constraint & { penalty_weight: number }).penalty_weight} />
                  ) : null}
                  {activeTab === 'ShouldStayTogether' ? (
                    <label className="text-xs inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={selectedShouldIndices.includes(index)}
                        onChange={() => setSelectedShouldIndices((prev) => (prev.includes(index) ? prev.filter((value) => value !== index) : [...prev, index]))}
                      />
                      <span>Select</span>
                    </label>
                  ) : null}
                </>
              }
              actions={
                <SetupItemActions
                  onEdit={() => onEditConstraint(constraint, index)}
                  onDelete={() => onDeleteConstraint(index)}
                  editLabel={`Edit ${constraintTypeLabels[constraint.type as SoftConstraintFamily]}`}
                  deleteLabel={`Delete ${constraintTypeLabels[constraint.type as SoftConstraintFamily]}`}
                />
              }
            >
              {constraint.type === 'RepeatEncounter' ? (
                <SetupKeyValueList
                  items={[
                    { label: 'Max encounters', value: constraint.max_allowed_encounters },
                    { label: 'Penalty function', value: constraint.penalty_function },
                  ]}
                />
              ) : null}

              {constraint.type === 'AttributeBalance' ? (
                <>
                  <SetupKeyValueList
                    items={[
                      { label: 'Group', value: constraint.group_id },
                      { label: 'Attribute', value: constraint.attribute_key },
                    ]}
                  />
                  <SetupTagList
                    items={Object.entries(constraint.desired_values || {}).map(([key, value]) => (
                      <span key={key} className="inline-flex px-2 py-0.5 rounded-full font-medium text-xs" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
                        {key}: {value}
                      </span>
                    ))}
                  />
                  <SetupSessionsBadgeList sessions={constraint.sessions} />
                </>
              ) : null}

              {(constraint.type === 'ShouldNotBeTogether' || constraint.type === 'ShouldStayTogether') ? (
                <>
                  <SetupPeopleNodeList
                    label="People"
                    people={constraint.people.map((pid) => (
                      <ConstraintPersonChip
                        key={pid}
                        personId={pid}
                        people={scenario.people}
                        onRemove={(removeId) => {
                          const currentConstraint = constraint as Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>;
                          const newPeople = currentConstraint.people.filter((personId) => personId !== removeId);
                          const willBeInvalid = newPeople.length < 2;
                          if (willBeInvalid) {
                            if (!window.confirm('Removing this person will leave the constraint invalid. Remove the entire constraint?')) return;
                            setScenario(removePersonFromPeopleConstraint(scenario, index, removeId, 2));
                            return;
                          }
                          setScenario(removePersonFromPeopleConstraint(scenario, index, removeId, 2));
                        }}
                      />
                    ))}
                  />
                  <SetupSessionsBadgeList sessions={constraint.sessions} />
                </>
              ) : null}

              {constraint.type === 'PairMeetingCount' ? (
                <>
                  <SetupPeopleNodeList
                    label="Pair"
                    people={[
                      <ConstraintPersonChip key={constraint.people[0]} personId={constraint.people[0]} people={scenario.people} />,
                      <ConstraintPersonChip key={constraint.people[1]} personId={constraint.people[1]} people={scenario.people} />,
                    ]}
                  />
                  <SetupKeyValueList
                    items={[
                      { label: 'Target meetings', value: constraint.target_meetings },
                      { label: 'Mode', value: constraint.mode || 'at_least' },
                    ]}
                  />
                  <SetupSessionsBadgeList sessions={constraint.sessions} />
                </>
              ) : null}
            </SetupItemCard>
          ))}
        </div>
      )}

      {showPairConvert && (
        <PairMeetingCountBulkConvertModal
          selectedCount={selectedShouldIndices.length}
          totalSessions={scenario.num_sessions}
          people={scenario.people}
          selectedConstraints={filteredShouldItems
            .filter(({ index }) => selectedShouldIndices.includes(index))
            .map(({ index, constraint }) => ({ index, people: constraint.people }))}
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
      )}
    </ConstraintFamilyPanel>
  );
};

export default SoftConstraintsPanel; 
