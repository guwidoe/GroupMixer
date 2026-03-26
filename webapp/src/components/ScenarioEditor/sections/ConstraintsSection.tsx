import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Edit, Plus, Settings, Trash2 } from 'lucide-react';
import type { Constraint, Scenario } from '../../../types';
import type { AttributeBalanceConstraint } from '../types';
import AttributeBalanceDashboard from '../../AttributeBalanceDashboard';
import PersonCard from '../../PersonCard';

type ConstraintItem = { constraint: Constraint; index: number };
type SupportedConstraintType =
  | 'RepeatEncounter'
  | 'AttributeBalance'
  | 'ImmovablePeople'
  | 'MustStayTogether'
  | 'ShouldNotBeTogether'
  | 'ShouldStayTogether'
  | 'PairMeetingCount';
type SoftConstraintType = Extract<SupportedConstraintType, 'RepeatEncounter' | 'AttributeBalance' | 'ShouldNotBeTogether' | 'ShouldStayTogether' | 'PairMeetingCount'>;
type HardConstraintType = Extract<SupportedConstraintType, 'ImmovablePeople' | 'MustStayTogether'>;

interface ConstraintsSectionProps {
  scenario: Scenario | null;
  activeConstraintTab: SupportedConstraintType;
  constraintCategoryTab: 'soft' | 'hard';
  hardTypes: readonly HardConstraintType[];
  softTypes: readonly SoftConstraintType[];
  onChangeCategory: (category: 'soft' | 'hard') => void;
  onChangeTab: (tab: SupportedConstraintType) => void;
  onAddConstraint: () => void;
  onEditConstraint: (constraint: Constraint, index: number) => void;
  onDeleteConstraint: (index: number) => void;
}

const constraintTypeLabels: Record<SupportedConstraintType, string> = {
  RepeatEncounter: 'Repeat Encounter Limits',
  AttributeBalance: 'Attribute Balance',
  ImmovablePeople: 'Immovable People',
  MustStayTogether: 'Must Stay Together',
  ShouldNotBeTogether: 'Should Not Be Together',
  ShouldStayTogether: 'Should Stay Together',
  PairMeetingCount: 'Pair Meeting Count',
};

function getConstraintWeight(constraint: Constraint): number | null {
  switch (constraint.type) {
    case 'RepeatEncounter':
    case 'AttributeBalance':
    case 'ShouldNotBeTogether':
    case 'ShouldStayTogether':
    case 'PairMeetingCount':
      return constraint.penalty_weight;
    default:
      return null;
  }
}

function renderSessions(sessions?: number[]): string {
  return sessions && sessions.length > 0 ? sessions.map((session) => session + 1).join(', ') : 'All sessions';
}

function isAttributeBalanceItem(item: ConstraintItem): item is { constraint: AttributeBalanceConstraint & Constraint; index: number } {
  return item.constraint.type === 'AttributeBalance';
}

export function ConstraintsSection({
  scenario,
  activeConstraintTab,
  constraintCategoryTab,
  hardTypes,
  softTypes,
  onChangeCategory,
  onChangeTab,
  onAddConstraint,
  onEditConstraint,
  onDeleteConstraint,
}: ConstraintsSectionProps) {
  const [showInfo, setShowInfo] = useState(false);
  const constraints = scenario?.constraints || [];

  const constraintsByType = constraints.reduce(
    (acc: Partial<Record<SupportedConstraintType, ConstraintItem[]>>, constraint, index) => {
      if (!acc[constraint.type]) {
        acc[constraint.type] = [];
      }
      acc[constraint.type]?.push({ constraint, index });
      return acc;
    },
    {}
  );

  const tabOrder = constraintCategoryTab === 'soft' ? softTypes : hardTypes;
  const selectedItems = constraintsByType[activeConstraintTab] || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Constraints ({constraints.length})</h3>
        <button
          onClick={onAddConstraint}
          className="btn-primary flex items-center gap-2 px-4 py-2"
        >
          <Plus className="w-4 h-4" />
          Add Constraint
        </button>
      </div>

      <div className="rounded-md border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowInfo(!showInfo)}
        >
          {showInfo ? (
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>About Constraints</h4>
        </button>
        {showInfo && (
          <div className="p-4 pt-0">
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Constraints guide the optimization process by defining rules and preferences:
            </p>
            <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>• <strong>RepeatEncounter:</strong> Limit how often people meet across sessions</li>
              <li>• <strong>AttributeBalance:</strong> Maintain desired distributions (e.g., gender balance)</li>
              <li>• <strong>MustStayTogether:</strong> Keep certain people in the same group</li>
              <li>• <strong>ShouldNotBeTogether:</strong> Prevent certain people from being grouped</li>
              <li>• <strong>ImmovablePeople:</strong> Fix someone to a specific group in specific sessions</li>
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {(['soft', 'hard'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => {
              onChangeCategory(cat);
              const firstType = cat === 'soft' ? softTypes[0] : hardTypes[0];
              onChangeTab(firstType);
            }}
            className={
              'px-3 py-1 rounded-md text-sm font-medium transition-colors ' +
              (constraintCategoryTab === cat ? 'btn-primary' : 'btn-secondary')
            }
          >
            {cat === 'soft' ? 'Soft Constraints' : 'Hard Constraints'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {tabOrder.map((type) => (
          <button
            key={type}
            onClick={() => onChangeTab(type)}
            className={
              'px-3 py-1 rounded-md text-sm font-medium transition-colors ' +
              (activeConstraintTab === type ? 'btn-primary' : 'btn-secondary')
            }
          >
            {constraintTypeLabels[type]}
            <span className="ml-1 text-xs">({constraintsByType[type]?.length || 0})</span>
          </button>
        ))}
      </div>

      {constraints.length ? (
        selectedItems.length ? (
          <div className="space-y-3">
            <h4 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }}></div>
              {constraintTypeLabels[activeConstraintTab]}
              <span className="text-sm font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                {selectedItems.length}
              </span>
            </h4>

            {activeConstraintTab === 'AttributeBalance' && scenario && (
              <AttributeBalanceDashboard
                constraints={selectedItems.filter(isAttributeBalanceItem).map((item) => item.constraint)}
                scenario={scenario}
              />
            )}

            <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
              {selectedItems.map(({ constraint, index }) => (
                <div key={index} className="rounded-lg border p-4 transition-colors hover:shadow-md" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                          {constraint.type}
                        </span>
                        {getConstraintWeight(constraint) !== null && (
                          <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}>
                            Weight: {getConstraintWeight(constraint)}
                          </span>
                        )}
                      </div>

                      <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                        {constraint.type === 'RepeatEncounter' && (
                          <>
                            <div>Max encounters: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.max_allowed_encounters}</span></div>
                            <div>Penalty function: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.penalty_function}</span></div>
                          </>
                        )}

                        {constraint.type === 'AttributeBalance' && (
                          <>
                            <div>Group: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.group_id}</span></div>
                            <div>Attribute: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.attribute_key}</span></div>
                            <div className="break-words">Distribution: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{Object.entries(constraint.desired_values || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}</span></div>
                            <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{renderSessions(constraint.sessions)}</span></div>
                          </>
                        )}

                        {constraint.type === 'ImmovablePeople' && (
                          <>
                            <div className="break-words flex flex-wrap items-center gap-1">
                              <span>People:</span>
                              {constraint.people.map((pid, idx) => {
                                const per = scenario?.people.find(p => p.id === pid);
                                return (
                                  <React.Fragment key={pid}>
                                    {per ? <PersonCard person={per} /> : <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{pid}</span>}
                                    {idx < constraint.people.length - 1 && <span></span>}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                            <div>Fixed to: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.group_id}</span></div>
                            <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{renderSessions(constraint.sessions)}</span></div>
                          </>
                        )}

                        {(constraint.type === 'MustStayTogether' || constraint.type === 'ShouldNotBeTogether' || constraint.type === 'ShouldStayTogether') && (
                          <>
                            <div className="break-words flex flex-wrap items-center gap-1">
                              <span>People:</span>
                              {constraint.people.map((pid, idx) => {
                                const per = scenario?.people.find(p => p.id === pid);
                                return (
                                  <React.Fragment key={pid}>
                                    {per ? <PersonCard person={per} /> : <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{pid}</span>}
                                    {idx < constraint.people.length - 1 && <span></span>}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                            <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{renderSessions(constraint.sessions)}</span></div>
                          </>
                        )}

                        {constraint.type === 'PairMeetingCount' && (
                          <>
                            <div className="break-words flex flex-wrap items-center gap-1">
                              <span>People:</span>
                              {constraint.people.map((pid, idx) => {
                                const per = scenario?.people.find((person) => person.id === pid);
                                return (
                                  <React.Fragment key={pid}>
                                    {per ? <PersonCard person={per} /> : <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{pid}</span>}
                                    {idx < constraint.people.length - 1 && <span>&amp;</span>}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                            <div>Target meetings: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.target_meetings}</span></div>
                            <div>Mode: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{constraint.mode || 'at_least'}</span></div>
                            <div>Sessions: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{renderSessions(constraint.sessions)}</span></div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => onEditConstraint(constraint, index)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: 'var(--text-tertiary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--color-accent)';
                          e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--text-tertiary)';
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteConstraint(index)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: 'var(--text-tertiary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--color-error-600)';
                          e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--text-tertiary)';
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
            <p>No {constraintTypeLabels[activeConstraintTab]} constraints defined yet.</p>
          </div>
        )
      ) : (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <Settings className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p>No constraints added yet</p>
          <p className="text-sm">Add constraints to guide the optimization process</p>
        </div>
      )}
    </div>
  );
}
