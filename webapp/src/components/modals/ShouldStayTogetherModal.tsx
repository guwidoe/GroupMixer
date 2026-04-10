import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import type { Constraint } from '../../types';
import { getConstraintAddLabel, getConstraintEditLabel } from '../../utils/constraintDisplay';
import PersonCard from '../PersonCard';
import { useAppStore } from '../../store';
import { SessionScopeField } from '../ScenarioEditor/shared/SessionScopeField';
import {
  createAllSessionScopeDraft,
  optionalSessionsToDraft,
  sessionScopeDraftToOptionalSessions,
  type SessionScopeDraft,
} from '../ScenarioEditor/shared/sessionScope';

interface Props {
  sessionsCount: number;
  initial?: Constraint | null; // if editing existing
  onCancel: () => void;
  onSave: (constraint: Constraint) => void;
}

export function ShouldStayTogetherModal({ sessionsCount, initial, onCancel, onSave }: Props) {
  const { resolveScenario, ui } = useAppStore();

  const getInitialState = () => {
    if (ui.isLoading) {
      return {
        selectedPeople: [] as string[],
        sessionScope: createAllSessionScopeDraft() as SessionScopeDraft,
        penaltyWeight: 10 as number | null,
        personSearch: '',
        validationError: '',
      };
    }

    const editing = !!initial;
    const initPeople: string[] = editing && initial?.type === 'ShouldStayTogether' ? initial.people : [];
    const initWeight: number = editing && initial?.type === 'ShouldStayTogether' ? initial.penalty_weight : 10;

    return {
      selectedPeople: initPeople,
      sessionScope: editing && initial?.type === 'ShouldStayTogether'
        ? optionalSessionsToDraft(initial.sessions, sessionsCount)
        : createAllSessionScopeDraft(),
      penaltyWeight: initWeight,
      personSearch: '',
      validationError: '',
    };
  };

  const initialState = getInitialState();
  const [selectedPeople, setSelectedPeople] = useState<string[]>(initialState.selectedPeople);
  const [sessionScope, setSessionScope] = useState<SessionScopeDraft>(initialState.sessionScope);
  const [penaltyWeight, setPenaltyWeight] = useState<number | null>(initialState.penaltyWeight);
  const [personSearch, setPersonSearch] = useState(initialState.personSearch);
  const [validationError, setValidationError] = useState<string>(initialState.validationError);

  if (ui.isLoading) return null;

  const scenario = resolveScenario();
  const editing = !!initial;

  const filteredPeople = scenario.people.filter(p => {
    const q = personSearch.toLowerCase();
    const id = p.id.toLowerCase();
    const name = (p.attributes?.name || '').toString().toLowerCase();
    return id.includes(q) || name.includes(q);
  });

  const isPenaltyWeightValid = (value: number | null) => value !== null && value > 0;

  const handleSave = () => {
    setValidationError('');
    if (selectedPeople.length < 2) {
      setValidationError('You must select at least two people.');
      return;
    }
    if (!isPenaltyWeightValid(penaltyWeight)) {
      setValidationError('Penalty weight must be a positive number.');
      return;
    }

    const newConstraint: Constraint = {
      type: 'ShouldStayTogether',
      people: selectedPeople,
      penalty_weight: penaltyWeight!,
      sessions: sessionScopeDraftToOptionalSessions(sessionScope, sessionsCount),
    };

    onSave(newConstraint);
  };

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-4 sm:p-6 w-full max-w-2xl mx-auto modal-content max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{editing ? getConstraintEditLabel('ShouldStayTogether') : getConstraintAddLabel('ShouldStayTogether')}</h3>
          <button onClick={onCancel} className="transition-colors p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {validationError && (
          <div className="mb-4 p-3 rounded-md border" style={{ backgroundColor: 'var(--color-error-50)', borderColor: 'var(--color-error-200)', color: 'var(--color-error-700)' }}>{validationError}</div>
        )}

        <div className="space-y-6">
          {/* People Selection */}
          <div>
            <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--text-secondary)' }}>
              <Check className="inline-block w-4 h-4 mr-1" /> People *
            </label>
            <input
              type="text"
              placeholder="Search people..."
              value={personSearch}
              onChange={(e) => setPersonSearch(e.target.value)}
              className="input w-full text-base py-3 mb-3"
            />
            <div className="border rounded p-3 max-h-48 overflow-y-auto" style={{ borderColor: 'var(--border-secondary)' }}>
              {filteredPeople.map((person) => (
                <label key={person.id} className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                  <input
                    type="checkbox"
                    checked={selectedPeople.includes(person.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPeople([...selectedPeople, person.id]);
                      } else {
                        setSelectedPeople(selectedPeople.filter(id => id !== person.id));
                      }
                    }}
                    className="w-4 h-4"
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <PersonCard person={person} />
                </label>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Select two or more people who should be placed in the same group.</p>
          </div>

          <SessionScopeField
            compact
            label={<><Check className="mr-1 inline-block h-4 w-4" /> Sessions</>}
            totalSessions={sessionsCount}
            value={sessionScope}
            onChange={setSessionScope}
          />

          {/* Penalty Weight */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Penalty Weight</label>
            <input
              type="number"
              value={penaltyWeight ?? ''}
              onChange={(e) => {
                const numValue = e.target.value === '' ? null : parseFloat(e.target.value);
                setPenaltyWeight(numValue);
              }}
              className={`input w-full text-base py-3 ${!isPenaltyWeightValid(penaltyWeight) ? 'border-red-500 focus:border-red-500' : ''}`}
              min="0"
              step="0.1"
            />
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Higher values make the solver prioritize this constraint more.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-8 pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
          <button onClick={onCancel} className="btn-secondary flex-1 sm:flex-none px-6 py-3 text-base font-medium">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1 sm:flex-none px-6 py-3 text-base font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}
