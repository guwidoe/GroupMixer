import React, { useState } from 'react';
import type { Constraint } from '../../types';
import PersonCard from '../PersonCard';
import { useAppStore } from '../../store';
import { ModalWrapper, ModalHeader, ModalFooter, FormValidationError } from '../ui';
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

export function MustStayTogetherModal({ sessionsCount, initial, onCancel, onSave }: Props) {
  const { resolveScenario, ui } = useAppStore();

  const getInitialState = () => {
    if (ui.isLoading) {
      return {
        selectedPeople: [] as string[],
        sessionScope: createAllSessionScopeDraft() as SessionScopeDraft,
        validationError: '',
      };
    }

    const editing = !!initial;
    const initPeople: string[] = editing && initial?.type === 'MustStayTogether' ? initial.people : [];

    return {
      selectedPeople: initPeople,
      sessionScope: editing && initial?.type === 'MustStayTogether'
        ? optionalSessionsToDraft(initial.sessions, sessionsCount)
        : createAllSessionScopeDraft(),
      validationError: '',
    };
  };

  const initialState = getInitialState();
  const [selectedPeople, setSelectedPeople] = useState<string[]>(initialState.selectedPeople);
  const [sessionScope, setSessionScope] = useState<SessionScopeDraft>(initialState.sessionScope);
  const [validationError, setValidationError] = useState<string>(initialState.validationError);
  const [personSearch, setPersonSearch] = useState<string>('');

  // Don't render until loading is complete to avoid creating new scenarios
  if (ui.isLoading) {
    return null;
  }

  const scenario = resolveScenario();
  const editing = !!initial;

  const togglePerson = (pid: string) => {
    setSelectedPeople(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]);
    if (validationError) setValidationError('');
  };

  const handleSave = () => {
    setValidationError('');

    if (!scenario.people || scenario.people.length === 0) {
      setValidationError('No people available. Please add people to the scenario first.');
      return;
    }

    if (selectedPeople.length < 2) {
      setValidationError('Please select at least two people to form a clique.');
      return;
    }

    const newConstraint: Constraint = {
      type: 'MustStayTogether',
      people: selectedPeople,
      sessions: sessionScopeDraftToOptionalSessions(sessionScope, sessionsCount),
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
              const per = scenario.people?.find(p => p.id === pid);
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
            {scenario.people && scenario.people.length > 0 ? (
              scenario.people
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
                  <span className="text-sm">{p.attributes.name}</span>
                </label>
              ))
            ) : (
              <div className="text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
                <p className="text-sm">No people available</p>
                <p className="text-xs">Add people to the scenario first</p>
              </div>
            )}
          </div>
        </div>

        {/* Sessions select */}
        <SessionScopeField
          label="Sessions"
          totalSessions={sessionsCount}
          value={sessionScope}
          onChange={(nextScope) => {
            setSessionScope(nextScope);
            if (validationError) setValidationError('');
          }}
        />
      </div>

      <ModalFooter onCancel={onCancel} onSave={handleSave} />
    </ModalWrapper>
  );
}
