import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Constraint } from '../../types';
import { useAppStore } from '../../store';

interface Props {
  initial?: Constraint | null;
  onCancel: () => void;
  onSave: (constraint: Constraint) => void;
}

interface FormState {
  group_id: string;
  attribute_key: string;
  desired_values: Record<string, number | null>;
  penalty_weight: number | null;
  sessions: number[];
  mode: "exact" | "at_least";
}

const AttributeBalanceModal: React.FC<Props> = ({ initial, onCancel, onSave }) => {
  const { GetProblem, attributeDefinitions, ui } = useAppStore();
  
  const getInitialState = (): FormState => {
    if (ui.isLoading) {
      return {
        group_id: '',
        attribute_key: '',
        desired_values: {},
        penalty_weight: 10,
        sessions: [],
        mode: 'exact',
      };
    }
    
    const problem = GetProblem();
    const editing = !!initial;

    if (editing && initial?.type === 'AttributeBalance') {
      return {
        group_id: initial.group_id || '',
        attribute_key: initial.attribute_key || '',
        desired_values: initial.desired_values || {},
        penalty_weight: initial.penalty_weight || 10,
        sessions: initial.sessions || [],
        mode: (initial as any).mode ?? 'exact',
      };
    }
    return {
      group_id: problem.groups?.[0]?.id || '',
      attribute_key: attributeDefinitions?.[0]?.key || '',
      desired_values: {},
      penalty_weight: 10,
      sessions: [],
      mode: 'exact',
    };
  };

  const [formState, setFormState] = useState<FormState>(getInitialState);
  const [validationError, setValidationError] = useState<string>('');
  
  // Don't render until loading is complete to avoid creating new problems
  if (ui.isLoading) {
    return null;
  }
  
  const problem = GetProblem();
  const editing = !!initial;
  const sessionsCount = problem.num_sessions || 0;

  // Validation function
  const isPenaltyWeightValid = (value: number | null) => {
    return value !== null && value > 0;
  };

  const handleDesiredValueChange = (key: string, value: string) => {
    const numValue = value === '' ? null : parseInt(value, 10);
    setFormState(prev => ({
      ...prev,
      desired_values: { ...prev.desired_values, [key]: numValue },
    }));
  };

  const handleSave = () => {
    setValidationError('');

    if (!formState.group_id) {
      setValidationError('Please select a group.');
      return;
    }
    if (!formState.attribute_key) {
      setValidationError('Please select an attribute.');
      return;
    }
    if (Object.keys(formState.desired_values).length === 0) {
      setValidationError('Please define at least one desired value for the distribution.');
      return;
    }
    if (!isPenaltyWeightValid(formState.penalty_weight)) {
      setValidationError('Penalty weight must be a positive number.');
      return;
    }

    // Filter out null values from desired_values
    const validDesiredValues: Record<string, number> = {};
    Object.entries(formState.desired_values).forEach(([key, value]) => {
      if (value !== null) {
        validDesiredValues[key] = value;
      }
    });

    const newConstraint: Constraint = {
      type: 'AttributeBalance',
      group_id: formState.group_id,
      attribute_key: formState.attribute_key,
      desired_values: validDesiredValues,
      penalty_weight: formState.penalty_weight!,
      mode: formState.mode,
      sessions: formState.sessions.length > 0 ? formState.sessions : undefined,
    };

    onSave(newConstraint);
  };

  const selectedAttribute = attributeDefinitions.find(a => a.key === formState.attribute_key);

  const toggleSession = (sessionIndex: number) => {
    setFormState(prev => ({
      ...prev,
      sessions: prev.sessions.includes(sessionIndex)
        ? prev.sessions.filter(s => s !== sessionIndex)
        : [...prev.sessions, sessionIndex],
    }));
  };

  const allSessionsSelected = formState.sessions.length === 0 || formState.sessions.length === sessionsCount;

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-4 sm:p-6 w-full max-w-lg mx-auto modal-content max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{editing ? 'Edit Attribute Balance' : 'Add Attribute Balance'}</h3>
          <button 
            onClick={onCancel} 
            className="transition-colors p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" 
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {validationError && (
          <div className="mb-4 p-3 rounded-md border" style={{ backgroundColor: 'var(--color-error-50)', borderColor: 'var(--color-error-200)', color: 'var(--color-error-700)' }}>{validationError}</div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Group *</label>
            <select 
              name="group_id" 
              value={formState.group_id} 
              onChange={e => setFormState(p => ({...p, group_id: e.target.value}))} 
              className="select w-full text-base py-3"
            >
              {problem.groups?.map(g => (<option key={g.id} value={g.id}>{g.id}</option>))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Attribute *</label>
            <select 
              name="attribute_key" 
              value={formState.attribute_key} 
              onChange={e => setFormState(p => ({...p, attribute_key: e.target.value, desired_values: {}}))} 
              className="select w-full text-base py-3"
            >
              {attributeDefinitions.map(a => (<option key={a.key} value={a.key}>{a.key}</option>))}
            </select>
          </div>

          {selectedAttribute && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Desired Distribution *</label>
              <div className="border rounded p-4 space-y-3" style={{ borderColor: 'var(--border-secondary)' }}>
                {selectedAttribute.values.map(val => (
                  <div key={val} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{val}</span>
                    <input
                      type="number"
                      min="0"
                      value={formState.desired_values[val] ?? ''}
                      onChange={e => handleDesiredValueChange(val, e.target.value)}
                      className="input w-full sm:w-32 text-center text-base py-2"
                      placeholder="Count"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Mode</label>
                <select
                  value={formState.mode}
                  onChange={e => setFormState(p => ({ ...p, mode: e.target.value as 'exact' | 'at_least' }))}
                  className="select w-full text-base py-3"
                >
                  <option value="exact">Exact (penalize deviation both ways)</option>
                  <option value="at_least">At least (penalize only shortfalls)</option>
                </select>
                <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                  Choose "At least" to enforce minimum counts without penalizing overshoot.
                </p>
              </div>
            </div>
          )}
          
          {/* Sessions Selection */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Sessions</label>
            <div className="border rounded p-3" style={{ borderColor: 'var(--border-secondary)' }}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {Array.from({ length: sessionsCount }, (_, i) => (
                  <label key={i} className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input
                      type="checkbox"
                      id={`ab-session-${i}`}
                      checked={formState.sessions.includes(i)}
                      onChange={() => toggleSession(i)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Session {i + 1}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                {allSessionsSelected ? "Applies to all sessions." : `Applies to ${formState.sessions.length} selected session(s).`} Leave all unchecked to apply to all.
              </p>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Penalty Weight</label>
            <input 
              type="number" 
              name="penalty_weight" 
              value={formState.penalty_weight ?? ''} 
              onChange={e => {
                const numValue = e.target.value === '' ? null : parseFloat(e.target.value);
                setFormState(p => ({...p, penalty_weight: numValue}));
              }} 
              className={`input w-full text-base py-3 ${!isPenaltyWeightValid(formState.penalty_weight) ? 'border-red-500 focus:border-red-500' : ''}`} 
              min="0"
              step="0.1"
            />
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Higher values make the solver prioritize this constraint more.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-8 pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
          <button 
            onClick={onCancel} 
            className="btn-secondary flex-1 sm:flex-none px-6 py-3 text-base font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            className="btn-primary flex-1 sm:flex-none px-6 py-3 text-base font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttributeBalanceModal; 