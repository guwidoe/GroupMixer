import React, { useState } from 'react';
import { Plus, Edit, Trash2, Clock } from 'lucide-react';
import type { Constraint, Person } from '../../types';
// PersonCard removed in favor of ConstraintPersonChip
import ConstraintPersonChip from '../ConstraintPersonChip';
import { useAppStore } from '../../store';
import { ConstraintFamilyPanel } from '../ProblemEditor/sections/constraints/ConstraintFamilyPanel';
import {
  removePersonFromPeopleConstraint,
  replaceConstraintsAtIndices,
} from './constraintMutations';

interface Props {
  onAddConstraint: (type: 'ImmovablePeople' | 'MustStayTogether') => void;
  onEditConstraint: (constraint: Constraint, index: number) => void;
  onDeleteConstraint: (index: number) => void;
}

const HARD_TABS = ['ImmovablePeople', 'MustStayTogether'] as const;

const constraintTypeLabels: Record<typeof HARD_TABS[number], string> = {
  ImmovablePeople: 'Immovable People',
  MustStayTogether: 'Must Stay Together',
};

function HardConstraintsPanel({ onAddConstraint, onEditConstraint, onDeleteConstraint }: Props) {
  const [activeTab, setActiveTab] = useState<typeof HARD_TABS[number]>('ImmovablePeople');
  const [selectedMustIndices, setSelectedMustIndices] = useState<number[]>([]);
  const [showBulkConvert, setShowBulkConvert] = useState(false);
  const [bulkWeight, setBulkWeight] = useState<number | ''>(10);
  const [showInfo, setShowInfo] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [minMembers, setMinMembers] = useState<number | ''>('');
  const { resolveProblem, setProblem, ui } = useAppStore();

  // Don't render until loading is complete to avoid creating new problems
  if (ui.isLoading) {
    return <div className="space-y-4 pt-1 pl-0">Loading...</div>;
  }

  const problem = resolveProblem();

  const constraintsByType = (problem.constraints || []).reduce((acc: Record<string, { constraint: Constraint; index: number }[]>, c, i) => {
    if (!acc[c.type]) acc[c.type] = [];
    acc[c.type].push({ constraint: c, index: i });
    return acc;
  }, {});

  const selectedItems = constraintsByType[activeTab] || [];
  const familyItems = HARD_TABS.map((tab) => ({
    id: tab,
    label: constraintTypeLabels[tab],
    count: constraintsByType[tab]?.length || 0,
  }));

  // Build filtered view for MustStayTogether only
  const filteredMustItems = activeTab === 'MustStayTogether'
    ? (selectedItems as Array<{ constraint: Constraint; index: number }>).filter(({ constraint }) => {
        // Constraint is MustStayTogether here
        const must = constraint as Extract<Constraint, { type: 'MustStayTogether' }>;
        // Min members filter
        if (minMembers !== '' && must.people.length < (minMembers as number)) {
          return false;
        }
        // Text filter on person id/name or session number
        const ft = filterText.trim().toLowerCase();
        if (!ft) return true;
        const textPool: string[] = [];
        // Gather ids and names
        for (const pid of must.people) {
          textPool.push(pid.toLowerCase());
          const per = problem.people.find((p: Person) => p.id === pid);
          if (per && per.attributes && typeof per.attributes.name === 'string') {
            textPool.push(per.attributes.name.toLowerCase());
          }
        }
        // Sessions (1-based for user input)
        if (Array.isArray(must.sessions)) {
          textPool.push(...must.sessions.map((s) => String(s + 1)));
        }
        return textPool.some((t) => t.includes(ft));
      })
    : selectedItems;

  const toggleSelectMust = (index: number) => {
    setSelectedMustIndices(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
  };

  const clearSelection = () => setSelectedMustIndices([]);

  return (
    <ConstraintFamilyPanel
      title="Hard Constraints"
      infoTitle="How do these constraints work?"
      infoContent={(
        <>
          <p className="mb-2">Hard constraints <strong>must</strong> be satisfied. The solver throws an error if they cannot all be met.</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><strong>Immovable People</strong>: Fix selected people to a group in chosen sessions.</li>
            <li><strong>Must Stay Together</strong>: Keep selected people in the same group.</li>
          </ul>
        </>
      )}
      showInfo={showInfo}
      onToggleInfo={() => setShowInfo(!showInfo)}
      families={familyItems}
      activeFamilyId={activeTab}
      onChangeFamily={(familyId) => setActiveTab(familyId as typeof HARD_TABS[number])}
    >
      <div>
        <button
          onClick={() => onAddConstraint(activeTab)}
          className="btn-primary flex items-center gap-2 px-3 py-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          {activeTab === 'ImmovablePeople' ? 'Add Immovable People' : 'Add Clique'}
        </button>
        {activeTab === 'MustStayTogether' && selectedMustIndices.length > 0 && (
          <button
            onClick={() => setShowBulkConvert(true)}
            className="btn-secondary ml-2 px-3 py-2 text-sm"
          >
            Convert Selected to Should Stay Together
          </button>
        )}
      </div>

      {activeTab === 'MustStayTogether' && (
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Filter by person or session</label>
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Type person id/name or session number"
              className="input w-full text-sm py-2"
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Min members</label>
            <input
              type="number"
              min={0}
              value={minMembers}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
                setMinMembers(v);
              }}
              className="input w-28 text-sm py-2"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="btn-secondary px-3 py-2 text-sm"
              onClick={() => setSelectedMustIndices(filteredMustItems.map(i => i.index))}
            >
              Select All Filtered
            </button>
            <button
              className="btn-secondary px-3 py-2 text-sm"
              onClick={() => setSelectedMustIndices(prev => prev.filter(i => !filteredMustItems.some(fi => fi.index === i)))}
            >
              Deselect Filtered
            </button>
            <button
              className="btn-secondary px-3 py-2 text-sm"
              onClick={() => {
                const filteredIndices = filteredMustItems.map(i => i.index);
                setSelectedMustIndices(prev => {
                  const setPrev = new Set(prev);
                  const result = new Set(prev);
                  for (const idx of filteredIndices) {
                    if (setPrev.has(idx)) result.delete(idx); else result.add(idx);
                  }
                  return Array.from(result);
                });
              }}
            >
              Invert Filtered
            </button>
          </div>
          <div className="w-full text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Showing {filteredMustItems.length} of {(constraintsByType['MustStayTogether'] || []).length}. Selected {selectedMustIndices.length}.
          </div>
        </div>
      )}
      {selectedItems.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No {constraintTypeLabels[activeTab]} constraints defined.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(activeTab === 'MustStayTogether' ? filteredMustItems : selectedItems).map(({ constraint, index }) => (
            <div key={index} className="rounded-lg border p-4 transition-colors hover:shadow-md flex items-start justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{constraint.type}</span>
                  {activeTab === 'MustStayTogether' && (
                    <label className="ml-2 text-xs inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedMustIndices.includes(index)}
                        onChange={() => toggleSelectMust(index)}
                      />
                      <span>Select</span>
                    </label>
                  )}
                </div>
                <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  {constraint.type === 'ImmovablePeople' && (
                    <>
                      <div className="flex flex-wrap items-center gap-1">
                        <span>People:</span>
                        {constraint.people.map((pid: string, idx: number) => {
                          return (
                            <React.Fragment key={pid}>
                              <ConstraintPersonChip
                                personId={pid}
                                people={problem.people}
                                onRemove={(removeId) => {
                                  const newPeople = constraint.people.filter(p => p !== removeId);
                                  // ImmovablePeople requires at least 1 person to remain; if none, remove entire constraint
                                  const willBeInvalid = newPeople.length === 0;
                                  if (willBeInvalid) {
                                    if (!window.confirm('Removing this person will leave the constraint empty. Remove the entire constraint?')) return;
                                    setProblem(removePersonFromPeopleConstraint(problem, index, removeId, 1));
                                    return;
                                  }
                                  setProblem(removePersonFromPeopleConstraint(problem, index, removeId, 1));
                                }}
                              />
                              {idx < constraint.people.length - 1 && <span></span>}
                            </React.Fragment>
                          );
                        })}
                      </div>
                      <div>Group: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.group_id}</span></div>
                      <div className="flex items-center gap-1 text-xs" style={{color:'var(--color-accent)'}}>
                        <Clock className="w-3 h-3" />
                        <span>Sessions:</span>
                        {constraint.sessions && constraint.sessions.length > 0 ? constraint.sessions.map((s:number)=>s+1).join(', ') : 'All Sessions'}
                      </div>
                    </>
                  )}

                  {constraint.type === 'MustStayTogether' && (
                    <>
                      <div className="flex flex-wrap items-center gap-1">
                        <span>People:</span>
                        {constraint.people.map((pid: string, idx: number) => {
                          return (
                            <React.Fragment key={pid}>
                              <ConstraintPersonChip
                                personId={pid}
                                people={problem.people}
                                onRemove={(removeId) => {
                                  const newPeople = constraint.people.filter(p => p !== removeId);
                                  // MustStayTogether requires at least 2 people; if <2, confirm deletion of entire constraint
                                  const willBeInvalid = newPeople.length < 2;
                                  if (willBeInvalid) {
                                    if (!window.confirm('Removing this person will leave the clique invalid (needs at least two people). Remove the entire constraint?')) return;
                                    setProblem(removePersonFromPeopleConstraint(problem, index, removeId, 2));
                                    return;
                                  }
                                  setProblem(removePersonFromPeopleConstraint(problem, index, removeId, 2));
                                }}
                              />
                              {idx < constraint.people.length - 1 && <span></span>}
                            </React.Fragment>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1 text-xs" style={{color:'var(--color-accent)'}}>
                        <Clock className="w-3 h-3" />
                        <span>Sessions:</span>
                        {constraint.sessions && constraint.sessions.length > 0 ? constraint.sessions.map((s:number)=>s+1).join(', ') : 'All Sessions'}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-1 ml-2">
                <button
                  onClick={() => onEditConstraint(constraint, index)}
                  className="p-1 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDeleteConstraint(index)}
                  className="p-1 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error-600)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBulkConvert && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
          <div className="rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto modal-content">
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Convert to Should Stay Together</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              {selectedMustIndices.length} selected Must Stay Together constraint(s) will be converted to Should Stay Together with the specified penalty weight.
            </p>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Penalty Weight</label>
            <input
              type="number"
              value={bulkWeight}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : parseFloat(e.target.value);
                setBulkWeight(v);
              }}
              className="input w-full text-base py-3 mb-4"
              min="0"
              step="0.1"
            />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary px-4 py-2" onClick={() => { setShowBulkConvert(false); }}>
                Cancel
              </button>
              <button
                className="btn-primary px-4 py-2"
                onClick={() => {
                  if (bulkWeight === '' || (typeof bulkWeight === 'number' && bulkWeight <= 0)) {
                    return; // simple guard; could show validation
                  }
                  const weight = bulkWeight as number;
                  setProblem(replaceConstraintsAtIndices(problem, selectedMustIndices, (constraint) => {
                    if (constraint.type !== 'MustStayTogether') {
                      return [constraint];
                    }

                    return [{ type: 'ShouldStayTogether', people: constraint.people, sessions: constraint.sessions, penalty_weight: weight } satisfies Constraint];
                  }));
                  clearSelection();
                  setShowBulkConvert(false);
                }}
              >
                Convert
              </button>
            </div>
          </div>
        </div>
      )}
    </ConstraintFamilyPanel>
  );
};

export default HardConstraintsPanel;
