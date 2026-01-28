import React from 'react';
import { X } from 'lucide-react';
import type { AttributeDefinition, Constraint, Problem } from '../../types';

export interface ConstraintFormState {
  type: Constraint['type'];
  max_allowed_encounters?: number;
  penalty_function?: 'linear' | 'squared';
  penalty_weight?: number;
  group_id?: string;
  attribute_key?: string;
  desired_values?: Record<string, number>;
  person_id?: string;
  people?: string[];
  sessions?: number[];
}

interface ConstraintFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  constraintForm: ConstraintFormState;
  setConstraintForm: React.Dispatch<React.SetStateAction<ConstraintFormState>>;
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  onAdd: () => void;
  onUpdate: () => void;
  onClose: () => void;
}

export function ConstraintFormModal({
  isOpen,
  isEditing,
  constraintForm,
  setConstraintForm,
  problem,
  attributeDefinitions,
  sessionsCount,
  onAdd,
  onUpdate,
  onClose,
}: ConstraintFormModalProps) {
  if (!isOpen) return null;

  const sessions = Array.from({ length: sessionsCount }, (_, i) => i);

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
      <div className="rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto modal-content">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {isEditing ? 'Edit Constraint' : 'Add Constraint'}
          </h3>
          <button
            onClick={onClose}
            className="transition-colors p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Constraint Type *
            </label>
            <select
              value={constraintForm.type}
              onChange={(e) => setConstraintForm(prev => ({
                type: e.target.value as Constraint['type'],
                penalty_weight: prev.penalty_weight,
              }))}
              className="select"
              disabled={isEditing}
            >
              <option value="RepeatEncounter">Repeat Encounter Limit</option>
              <option value="AttributeBalance">Attribute Balance</option>
              <option value="MustStayTogether">Must Stay Together</option>
              <option value="ShouldNotBeTogether">Should Not Be Together</option>
              <option value="ImmovablePeople">Immovable People</option>
            </select>
            {isEditing && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Constraint type cannot be changed when editing
              </p>
            )}
          </div>

          {constraintForm.type === 'RepeatEncounter' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Maximum Allowed Encounters *
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={constraintForm.max_allowed_encounters ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*$/.test(value)) {
                      setConstraintForm(prev => ({
                        ...prev,
                        max_allowed_encounters: value === '' ? undefined : parseInt(value),
                      }));
                    }
                  }}
                  className={`input ${(constraintForm.max_allowed_encounters === undefined || constraintForm.max_allowed_encounters < 0) ? 'border-red-500 focus:border-red-500' : ''}`}
                  placeholder="e.g., 1"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Maximum number of times any two people can be in the same group across all sessions
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Penalty Function
                </label>
                <select
                  value={constraintForm.penalty_function || 'squared'}
                  onChange={(e) => setConstraintForm(prev => ({
                    ...prev,
                    penalty_function: e.target.value as 'linear' | 'squared',
                  }))}
                  className="select"
                >
                  <option value="linear">Linear</option>
                  <option value="squared">Squared (recommended)</option>
                </select>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Squared penalties increase more rapidly for multiple violations
                </p>
              </div>
            </>
          )}

          {constraintForm.type === 'AttributeBalance' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Target Group *
                </label>
                <select
                  value={constraintForm.group_id || ''}
                  onChange={(e) => setConstraintForm(prev => ({ ...prev, group_id: e.target.value }))}
                  className="select"
                >
                  <option value="">Select a group</option>
                  {problem?.groups.map(group => (
                    <option key={group.id} value={group.id}>{group.id}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Attribute to Balance *
                </label>
                <select
                  value={constraintForm.attribute_key || ''}
                  onChange={(e) => setConstraintForm(prev => ({
                    ...prev,
                    attribute_key: e.target.value,
                    desired_values: {},
                  }))}
                  className="select"
                >
                  <option value="">Select an attribute</option>
                  {attributeDefinitions.map(def => (
                    <option key={def.key} value={def.key}>{def.key}</option>
                  ))}
                </select>
              </div>

              {constraintForm.attribute_key && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Desired Distribution *
                  </label>
                  <div className="space-y-2">
                    {attributeDefinitions
                      .find(def => def.key === constraintForm.attribute_key)
                      ?.values.map(value => (
                        <div key={value} className="flex items-center gap-2">
                          <span className="w-20 text-sm capitalize" style={{ color: 'var(--text-secondary)' }}>{value}:</span>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={constraintForm.desired_values?.[value] ?? ''}
                            onChange={(e) => {
                              const inputValue = e.target.value;
                              if (inputValue === '' || /^\d*$/.test(inputValue)) {
                                setConstraintForm(prev => {
                                  const newDesiredValues = { ...prev.desired_values };
                                  if (inputValue === '') {
                                    delete newDesiredValues[value];
                                  } else {
                                    newDesiredValues[value] = parseInt(inputValue);
                                  }
                                  return {
                                    ...prev,
                                    desired_values: newDesiredValues,
                                  };
                                });
                              }
                            }}
                            className="input flex-1"
                            placeholder="0"
                          />
                        </div>
                      ))}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Desired number of people with each attribute value in this group
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Apply to Sessions (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {sessions.map(sessionIdx => (
                    <label key={sessionIdx} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={constraintForm.sessions?.includes(sessionIdx) || false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConstraintForm(prev => ({
                              ...prev,
                              sessions: [...(prev.sessions || []), sessionIdx].sort(),
                            }));
                          } else {
                            setConstraintForm(prev => ({
                              ...prev,
                              sessions: (prev.sessions || []).filter(s => s !== sessionIdx),
                            }));
                          }
                        }}
                        className="rounded border-gray-300 focus:ring-2"
                        style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                      />
                      Session {sessionIdx + 1}
                    </label>
                  ))}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Leave empty to apply to all sessions
                </p>
              </div>
            </>
          )}

          {constraintForm.type === 'ImmovablePeople' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  People * (select at least 1)
                </label>
                <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2" style={{ borderColor: 'var(--border-secondary)' }}>
                  {problem?.people.map(person => (
                    <label key={person.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={constraintForm.people?.includes(person.id) || false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConstraintForm(prev => ({
                              ...prev,
                              people: [...(prev.people || []), person.id],
                            }));
                          } else {
                            setConstraintForm(prev => ({
                              ...prev,
                              people: (prev.people || []).filter(id => id !== person.id),
                            }));
                          }
                        }}
                        className="rounded border-gray-300 focus:ring-2"
                        style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                      />
                      {person.attributes.name || person.id}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Fixed Group *
                </label>
                <select
                  value={constraintForm.group_id || ''}
                  onChange={(e) => setConstraintForm(prev => ({ ...prev, group_id: e.target.value }))}
                  className="select"
                >
                  <option value="">Select a group</option>
                  {problem?.groups.map(group => (
                    <option key={group.id} value={group.id}>{group.id}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Apply to Sessions (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {sessions.map(sessionIdx => (
                    <label key={sessionIdx} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={constraintForm.sessions?.includes(sessionIdx) || false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConstraintForm(prev => ({
                              ...prev,
                              sessions: [...(prev.sessions || []), sessionIdx].sort(),
                            }));
                          } else {
                            setConstraintForm(prev => ({
                              ...prev,
                              sessions: (prev.sessions || []).filter(s => s !== sessionIdx),
                            }));
                          }
                        }}
                        className="rounded border-gray-300 focus:ring-2"
                        style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                      />
                      Session {sessionIdx + 1}
                    </label>
                  ))}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Leave empty to apply to all sessions
                </p>
              </div>
            </>
          )}

          {(constraintForm.type === 'MustStayTogether' || constraintForm.type === 'ShouldNotBeTogether') && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  People * (select at least 2)
                </label>
                <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2" style={{ borderColor: 'var(--border-secondary)' }}>
                  {problem?.people.map(person => (
                    <label key={person.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={constraintForm.people?.includes(person.id) || false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConstraintForm(prev => ({
                              ...prev,
                              people: [...(prev.people || []), person.id],
                            }));
                          } else {
                            setConstraintForm(prev => ({
                              ...prev,
                              people: (prev.people || []).filter(id => id !== person.id),
                            }));
                          }
                        }}
                        className="rounded border-gray-300 focus:ring-2"
                        style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                      />
                      {person.attributes.name || person.id}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Apply to Sessions (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {sessions.map(sessionIdx => (
                    <label key={sessionIdx} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={constraintForm.sessions?.includes(sessionIdx) || false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConstraintForm(prev => ({
                              ...prev,
                              sessions: [...(prev.sessions || []), sessionIdx].sort(),
                            }));
                          } else {
                            setConstraintForm(prev => ({
                              ...prev,
                              sessions: (prev.sessions || []).filter(s => s !== sessionIdx),
                            }));
                          }
                        }}
                        className="rounded border-gray-300 focus:ring-2"
                        style={{ color: 'var(--color-accent)', accentColor: 'var(--color-accent)' }}
                      />
                      Session {sessionIdx + 1}
                    </label>
                  ))}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Leave empty to apply to all sessions
                </p>
              </div>
            </>
          )}

          {constraintForm.type !== 'ImmovablePeople' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Penalty Weight
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={constraintForm.penalty_weight ?? ''}
                onChange={(e) => {
                  const numValue = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  setConstraintForm(prev => ({
                    ...prev,
                    penalty_weight: numValue,
                  }));
                }}
                className={`input ${(constraintForm.penalty_weight === undefined || constraintForm.penalty_weight <= 0) ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Higher values make this constraint more important (1-10000).
                Use 1000+ for hard constraints, 10-100 for preferences.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={isEditing ? onUpdate : onAdd}
            className="btn-primary flex-1 px-4 py-2"
          >
            {isEditing ? 'Update' : 'Add'} Constraint
          </button>
          <button onClick={onClose} className="btn-secondary px-4 py-2 rounded-md">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
