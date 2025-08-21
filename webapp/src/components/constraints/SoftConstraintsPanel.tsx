import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Edit, Trash2, Clock } from 'lucide-react';
import type { Constraint } from '../../types';
import { useAppStore } from '../../store';
import AttributeBalanceDashboard from '../AttributeBalanceDashboard';
// PersonCard removed in favor of ConstraintPersonChip
import ConstraintPersonChip from '../ConstraintPersonChip';

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
  onAddConstraint: (type: 'RepeatEncounter' | 'ShouldNotBeTogether' | 'ShouldStayTogether' | 'AttributeBalance' | 'PairMeetingCount') => void;
  onEditConstraint: (constraint: Constraint, index: number) => void;
  onDeleteConstraint: (index: number) => void;
}

const SOFT_TABS = ['RepeatEncounter', 'ShouldNotBeTogether', 'ShouldStayTogether', 'AttributeBalance', 'PairMeetingCount'] as const;

const constraintTypeLabels: Record<typeof SOFT_TABS[number], string> = {
  RepeatEncounter: 'Repeat Encounter',
  ShouldNotBeTogether: 'Should Not Be Together',
  ShouldStayTogether: 'Should Stay Together',
  AttributeBalance: 'Attribute Balance',
  PairMeetingCount: 'Pair Meeting Count',
};

const SoftConstraintsPanel: React.FC<Props> = ({ onAddConstraint, onEditConstraint, onDeleteConstraint }) => {
  const [activeTab, setActiveTab] = useState<typeof SOFT_TABS[number]>('RepeatEncounter');
  const [showInfo, setShowInfo] = useState(false);
  const { GetProblem, ui } = useAppStore();

  // Don't render until loading is complete to avoid creating new problems
  if (ui.isLoading) {
    return <div className="space-y-4 pt-1 pl-0">Loading...</div>;
  }

  const problem = GetProblem();

  const constraintsByType = (problem.constraints || []).reduce((acc: Record<string, { constraint: Constraint; index: number }[]>, c, i) => {
    if (!acc[c.type]) acc[c.type] = [];
    acc[c.type].push({ constraint: c, index: i });
    return acc;
  }, {});

  const selectedItems = constraintsByType[activeTab] || [];

  return (
    <div className="space-y-4 pt-0 pl-0">
      {/* Title */}
      <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Soft Constraints</h3>
      {/* Info Box */}
      <div className="rounded-md border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowInfo(!showInfo)}
        >
          {showInfo ? <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />}
          <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>How do Soft Constraints work?</h4>
        </button>
        {showInfo && (
          <div className="p-4 pt-0 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <p className="mb-2">Soft constraints can be violated. Each violation increases the schedule cost by its penalty weight.</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><strong>Repeat Encounter</strong>: Limit how often pairs meet.</li>
              <li><strong>Attribute Balance</strong>: Keep group attribute distributions balanced.</li>
              <li><strong>Should Not Be Together</strong>: Discourage specified people from sharing a group.</li>
            </ul>
          </div>
        )}
      </div>
      {/* Sub-tabs and constraint lists remain unchanged */}
      <div className="flex gap-0 border-b mb-4" style={{ borderColor: 'var(--border-primary)' }}>
        {SOFT_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={
              `px-4 py-2 -mb-px text-sm font-medium transition-colors rounded-t-md focus:outline-none ` +
              (activeTab === t
                ? 'border-x border-t border-b-0 border-[var(--color-accent)] text-[var(--color-accent)] shadow-sm z-10'
                : 'bg-transparent text-[var(--text-secondary)] border-0 hover:text-[var(--color-accent)]')
            }
            style={activeTab === t
              ? { 
                  borderColor: 'var(--color-accent)', 
                  borderBottom: 'none',
                  backgroundColor: 'var(--bg-primary)'
                }
              : {}}
          >
            {constraintTypeLabels[t]}
            <span className="ml-1 text-xs">({constraintsByType[t]?.length || 0})</span>
          </button>
        ))}
      </div>
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
            : 'Add Should Stay Together'}
        </button>
      </div>
      {activeTab === 'AttributeBalance' && selectedItems.length > 0 && (
        <div>
          <AttributeBalanceDashboard 
            constraints={selectedItems.map(i => i.constraint as AttributeBalanceConstraint)} 
            problem={problem} 
          />
        </div>
      )}
      {selectedItems.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No {constraintTypeLabels[activeTab]} constraints defined.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {selectedItems.map(({ constraint, index }) => (
            <div key={index} className="rounded-lg border p-4 transition-colors hover:shadow-md flex items-start justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{constraint.type}</span>
                  {(constraint as Constraint & { penalty_weight?: number }).penalty_weight !== undefined && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}>Weight: {(constraint as Constraint & { penalty_weight: number }).penalty_weight}</span>
                  )}
                </div>
                <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  {constraint.type === 'RepeatEncounter' && (
                    <>
                      <div>Max encounters: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{(constraint as Extract<Constraint, { type: 'RepeatEncounter' }>).max_allowed_encounters}</span></div>
                      <div>Penalty function: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{(constraint as Extract<Constraint, { type: 'RepeatEncounter' }>).penalty_function}</span></div>
                    </>
                  )}

                  {constraint.type === 'AttributeBalance' && (
                    <>
                      <div>Group: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{(constraint as Extract<Constraint, { type: 'AttributeBalance' }>).group_id}</span></div>
                      <div>Attribute: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{(constraint as Extract<Constraint, { type: 'AttributeBalance' }>).attribute_key}</span></div>
                      <div className="flex flex-wrap gap-1 items-center text-xs">
                        <span style={{color:'var(--text-secondary)'}}>Distribution:</span>
                        {Object.entries((constraint as Extract<Constraint, { type: 'AttributeBalance' }>).desired_values || {}).map(([k, v]) => (
                          <span key={k} className="inline-flex px-2 py-0.5 rounded-full font-medium" style={{backgroundColor:'var(--bg-tertiary)',color:'var(--color-accent)',border:`1px solid var(--color-accent)`}}>{k}: {v}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-xs" style={{color:'var(--color-accent)'}}>
                        <Clock className="w-3 h-3" />
                        <span>Sessions:</span>
                        {(constraint as Extract<Constraint, { type: 'AttributeBalance' }>).sessions && (constraint as Extract<Constraint, { type: 'AttributeBalance' }>).sessions!.length > 0 ? (constraint as Extract<Constraint, { type: 'AttributeBalance' }>).sessions!.map((s:number)=>s+1).join(', ') : 'All Sessions'}
                      </div>
                    </>
                  )}

                  {(constraint.type === 'ShouldNotBeTogether' || constraint.type === 'ShouldStayTogether') && (
                    <>
                      <div className="flex flex-wrap items-center gap-1">
                        <span>People:</span>
                        {(constraint as Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>).people.map((pid: string, idx: number) => (
                          <React.Fragment key={pid}>
                            <ConstraintPersonChip
                              personId={pid}
                              people={problem.people}
                              onRemove={(removeId) => {
                                const c = constraint as Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>;
                                const newPeople = c.people.filter(p => p !== removeId);
                                const willBeInvalid = newPeople.length < 2;
                                if (willBeInvalid) {
                                  if (!window.confirm('Removing this person will leave the constraint invalid. Remove the entire constraint?')) return;
                                  const nextConstraints = GetProblem().constraints.filter((_, i2) => i2 !== index);
                                  useAppStore.getState().setProblem({ ...GetProblem(), constraints: nextConstraints });
                                  return;
                                }
                                const updated = GetProblem().constraints.map((cst, i2) =>
                                  i2 === index ? { ...cst, people: newPeople } as Constraint : cst
                                );
                                useAppStore.getState().setProblem({ ...GetProblem(), constraints: updated });
                              }}
                            />
                            {idx < (constraint as Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>).people.length - 1 && <span></span>}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-xs" style={{color:'var(--color-accent)'}}>
                        <Clock className="w-3 h-3" />
                        <span>Sessions:</span>
                        {(constraint as Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>).sessions && (constraint as Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>).sessions!.length > 0 ? (constraint as Extract<Constraint, { type: 'ShouldNotBeTogether' | 'ShouldStayTogether' }>).sessions!.map((s:number)=>s+1).join(', ') : 'All Sessions'}
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
    </div>
  );
};

export default SoftConstraintsPanel; 