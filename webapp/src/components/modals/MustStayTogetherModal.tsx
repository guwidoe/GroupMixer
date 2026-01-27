import React, { useState } from 'react';
import type { Constraint } from '../../types';
import PersonCard from '../PersonCard';
import { useAppStore } from '../../store';
import { ModalWrapper, ModalHeader, ModalFooter, FormValidationError } from '../ui';

interface Props {
  sessionsCount: number;
  initial?: Constraint | null; // if editing existing
  onCancel: () => void;
  onSave: (constraint: Constraint) => void;
}

const MustStayTogetherModal: React.FC<Props> = ({ sessionsCount, initial, onCancel, onSave }) => {
  const { GetProblem, ui } = useAppStore();

  const getInitialState = () => {
    if (ui.isLoading) {
      return {
        selectedPeople: [] as string[],
        selectedSessions: [] as number[],
        validationError: '',
      };
    }

    const editing = !!initial;
    const initPeople: string[] = editing && initial?.type === 'MustStayTogether' ? initial.people : [];
    const initSessions: number[] = (editing && initial?.type === 'MustStayTogether' && initial.sessions) ? initial.sessions : [];

    return {
      selectedPeople: initPeople,
      selectedSessions: initSessions,
      validationError: '',
    };
  };

  const initialState = getInitialState();
  const [selectedPeople, setSelectedPeople] = useState<string[]>(initialState.selectedPeople);
  const [selectedSessions, setSelectedSessions] = useState<number[]>(initialState.selectedSessions);
  const [validationError, setValidationError] = useState<string>(initialState.validationError);
  const [personSearch, setPersonSearch] = useState<string>('');

  // Don't render until loading is complete to avoid creating new problems
  if (ui.isLoading) {
    return null;
  }

  const problem = GetProblem();
  const editing = !!initial;

  const togglePerson = (pid: string) => {
    setSelectedPeople(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]);
    if (validationError) setValidationError('');
  };

  const toggleSession = (idx: number) => {
    setSelectedSessions(prev => prev.includes(idx) ? prev.filter(s => s !== idx) : [...prev, idx]);
    if (validationError) setValidationError('');
  };

  const handleSave = () => {
    setValidationError('');

    if (!problem.people || problem.people.length === 0) {
      setValidationError('No people available. Please add people to the problem first.');
      return;
    }

    if (selectedPeople.length < 2) {
      setValidationError('Please select at least two people to form a clique.');
      return;
    }

    const sessions = selectedSessions.length > 0 ? selectedSessions : undefined;

    const newConstraint: Constraint = {
      type: 'MustStayTogether',
      people: selectedPeople,
      sessions,
    };

    onSave(newConstraint);
  };

  return (
    <ModalWrapper maxWidth="lg">
      <ModalHeader
        title={editing ? 'Edit Must Stay Together' : 'Add Must Stay Together'}
        onClose={onCancel}
      />

      <FormValidationError error={validationError} />

      <div className="space-y-6">
        {/* People select */}
        <div>
          <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>People (select 2 or more) *</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedPeople.map(pid => {
              const per = problem.people?.find(p => p.id === pid);
              return per ? <PersonCard key={pid} person={per} /> : <span key={pid} className="text-xs px-2 py-0.5 rounded-full" style={{backgroundColor:'var(--bg-tertiary)', color:'var(--color-accent)'}}>{pid}</span>;
            })}
          </div>
          <input
            type="text"
            placeholder="Search people..."
            value={personSearch}
            onChange={(e) => setPersonSearch(e.target.value)}
            className="input w-full text-base py-3 mb-3"
          />
          <div className="border rounded p-3 max-h-48 overflow-y-auto" style={{ borderColor:'var(--border-secondary)' }}>
            {problem.people && problem.people.length > 0 ? (
              problem.people
                .filter(p => {
                  const q = personSearch.trim().toLowerCase();
                  if (!q) return true;
                  const name = (p.attributes?.name || '').toString().toLowerCase();
                  const id = p.id.toLowerCase();
                  return name.includes(q) || id.includes(q);
                })
                .map(p => (
                <label key={p.id} className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 mb-1" style={{ color:'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                    checked={selectedPeople.includes(p.id)}
                    onChange={() => togglePerson(p.id)}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <span className="text-sm">{p.attributes.name || p.id}</span>
                </label>
              ))
            ) : (
              <div className="text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
                <p className="text-sm">No people available</p>
                <p className="text-xs">Add people to the problem first</p>
              </div>
            )}
          </div>
        </div>

        {/* Sessions select */}
        <div>
          <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Sessions</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {Array.from({length: sessionsCount},(_,i)=>i).map(i=> (
              <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800" style={{color:'var(--text-secondary)'}}>
                <input
                  type="checkbox"
                  checked={selectedSessions.includes(i)}
                  onChange={()=>toggleSession(i)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Session {i+1}</span>
              </label>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
            {selectedSessions.length === 0 ? 'No sessions selected - will apply to all sessions' : `Selected ${selectedSessions.length} session(s)`}
          </p>
        </div>
      </div>

      <ModalFooter onCancel={onCancel} onSave={handleSave} />
    </ModalWrapper>
  );
};

export default MustStayTogetherModal;
