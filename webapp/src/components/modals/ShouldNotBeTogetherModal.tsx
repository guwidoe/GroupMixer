import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import type { Constraint } from '../../types';
import PersonCard from '../PersonCard';
import { useAppStore } from '../../store';

interface Props {
  sessionsCount: number;
  initial?: Constraint | null; // if editing existing
  onCancel: () => void;
  onSave: (constraint: Constraint) => void;
}

const ShouldNotBeTogetherModal: React.FC<Props> = ({ sessionsCount, initial, onCancel, onSave }) => {
  const { GetProblem, ui } = useAppStore();
  
  const getInitialState = () => {
    if (ui.isLoading) {
      return {
        selectedPeople: [] as string[],
        selectedSessions: [] as number[],
        penaltyWeight: 10 as number | null,
        personSearch: '',
        validationError: '',
      };
    }
    
    const editing = !!initial;
    const initPeople: string[] = editing && initial?.type === 'ShouldNotBeTogether' ? initial.people : [];
    const initSessions: number[] = (editing && initial?.type === 'ShouldNotBeTogether' && initial.sessions) ? initial.sessions : [];
    const initWeight: number = editing && initial?.type === 'ShouldNotBeTogether' ? initial.penalty_weight : 10;

    return {
      selectedPeople: initPeople,
      selectedSessions: initSessions,
      penaltyWeight: initWeight,
      personSearch: '',
      validationError: '',
    };
  };

  const initialState = getInitialState();
  const [selectedPeople, setSelectedPeople] = useState<string[]>(initialState.selectedPeople);
  const [selectedSessions, setSelectedSessions] = useState<number[]>(initialState.selectedSessions);
  const [penaltyWeight, setPenaltyWeight] = useState<number | null>(initialState.penaltyWeight);
  const [personSearch, setPersonSearch] = useState(initialState.personSearch);
  const [validationError, setValidationError] = useState<string>(initialState.validationError);
  
  // Don't render until loading is complete to avoid creating new problems
  if (ui.isLoading) {
    return null;
  }
  
  const problem = GetProblem();
  const editing = !!initial;
  
  const filteredPeople = problem.people.filter(p => {
    const q = personSearch.toLowerCase();
    const id = p.id.toLowerCase();
    const name = (p.attributes?.name || '').toString().toLowerCase();
    return id.includes(q) || name.includes(q);
  });

  // Validation function
  const isPenaltyWeightValid = (value: number | null) => {
    return value !== null && value > 0;
  };

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
      type: 'ShouldNotBeTogether',
      people: selectedPeople,
      penalty_weight: penaltyWeight!,
      sessions: selectedSessions.length > 0 && selectedSessions.length < sessionsCount ? selectedSessions : undefined,
    };
    
    onSave(newConstraint);
  };

  const toggleSession = (sessionIndex: number) => {
    setSelectedSessions(prev => prev.includes(sessionIndex) ? prev.filter(s => s !== sessionIndex) : [...prev, sessionIndex]);
  };
  
  const allSessionsSelected = selectedSessions.length === 0 || selectedSessions.length === sessionsCount;

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-4 sm:p-6 w-full max-w-2xl mx-auto modal-content max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{editing ? 'Edit Should Not Be Together' : 'Add Should Not Be Together'}</h3>
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
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Select two or more people who should not be placed in the same group.</p>
          </div>

          {/* Sessions Selection */}
          <div>
            <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--text-secondary)' }}>
              <Check className="inline-block w-4 h-4 mr-1" /> Sessions
            </label>
            <div className="border rounded p-3" style={{ borderColor: 'var(--border-secondary)' }}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {Array.from({ length: sessionsCount }, (_, i) => (
                  <label key={i} className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input
                      type="checkbox"
                      id={`session-${i}`}
                      checked={selectedSessions.includes(i)}
                      onChange={() => toggleSession(i)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Session {i + 1}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                {allSessionsSelected ? "Applies to all sessions." : `Applies to ${selectedSessions.length} selected session(s).`} Leave all unchecked to apply to all.
              </p>
            </div>
          </div>

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

export default ShouldNotBeTogetherModal; 