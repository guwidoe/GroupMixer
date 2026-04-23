import React, { useState } from 'react';
import type { Constraint } from '../../types';
import { getConstraintAddLabel, getConstraintEditLabel } from '../../utils/constraintDisplay';
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

type HardPeopleConstraintType = 'MustStayTogether' | 'MustStayApart';

type HardPeopleConstraint = Extract<Constraint, { type: HardPeopleConstraintType }>;

interface HardPeopleConstraintModalProps {
  type: HardPeopleConstraintType;
  sessionsCount: number;
  initial?: HardPeopleConstraint | null;
  onCancel: () => void;
  onSave: (constraint: HardPeopleConstraint) => void;
}

export function HardPeopleConstraintModal({
  type,
  sessionsCount,
  initial,
  onCancel,
  onSave,
}: HardPeopleConstraintModalProps) {
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
    const initPeople: string[] = editing && initial?.type === type ? initial.people : [];

    return {
      selectedPeople: initPeople,
      sessionScope: editing && initial?.type === type
        ? optionalSessionsToDraft(initial.sessions, sessionsCount)
        : createAllSessionScopeDraft(),
      validationError: '',
    };
  };

  const initialState = getInitialState();
  const [selectedPeople, setSelectedPeople] = useState<string[]>(initialState.selectedPeople);
  const [sessionScope, setSessionScope] = useState<SessionScopeDraft>(initialState.sessionScope);
  const [validationError, setValidationError] = useState<string>(initialState.validationError);
  const [personSearch, setPersonSearch] = useState('');

  if (ui.isLoading) {
    return null;
  }

  const scenario = resolveScenario();
  const editing = !!initial;

  const togglePerson = (personId: string) => {
    setSelectedPeople((previous) => (
      previous.includes(personId)
        ? previous.filter((value) => value !== personId)
        : [...previous, personId]
    ));
    if (validationError) {
      setValidationError('');
    }
  };

  const handleSave = () => {
    setValidationError('');

    if (!scenario.people || scenario.people.length === 0) {
      setValidationError('No people available. Please add people to the scenario first.');
      return;
    }

    if (selectedPeople.length < 2) {
      setValidationError('Please select at least two people.');
      return;
    }

    onSave({
      type,
      people: selectedPeople,
      sessions: sessionScopeDraftToOptionalSessions(sessionScope, sessionsCount),
    });
  };

  return (
    <ModalWrapper maxWidth="lg">
      <ModalHeader
        title={editing ? getConstraintEditLabel(type) : getConstraintAddLabel(type)}
        onClose={onCancel}
      />

      <FormValidationError error={validationError} />

      <div className="space-y-6">
        <div>
          <label className="mb-3 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            People (select 2 or more) *
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedPeople.map((personId) => {
              const person = scenario.people?.find((candidate) => candidate.id === personId);
              return person
                ? <PersonCard key={personId} person={person} />
                : (
                  <span
                    key={personId}
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)' }}
                  >
                    {personId}
                  </span>
                );
            })}
          </div>
          <input
            type="text"
            placeholder="Search people..."
            value={personSearch}
            onChange={(event) => setPersonSearch(event.target.value)}
            className="input mb-3 w-full py-3 text-base"
          />
          <div className="max-h-48 overflow-y-auto rounded border p-3" style={{ borderColor: 'var(--border-secondary)' }}>
            {scenario.people && scenario.people.length > 0 ? (
              scenario.people
                .filter((person) => {
                  const query = personSearch.trim().toLowerCase();
                  if (!query) return true;
                  const name = (person.attributes?.name || '').toString().toLowerCase();
                  const id = person.id.toLowerCase();
                  return name.includes(query) || id.includes(query);
                })
                .map((person) => (
                  <label
                    key={person.id}
                    className="mb-1 flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPeople.includes(person.id)}
                      onChange={() => togglePerson(person.id)}
                      className="h-4 w-4"
                      style={{ accentColor: 'var(--color-accent)' }}
                    />
                    <span className="text-sm">{person.attributes.name}</span>
                  </label>
                ))
            ) : (
              <div className="py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
                <p className="text-sm">No people available</p>
                <p className="text-xs">Add people to the scenario first</p>
              </div>
            )}
          </div>
        </div>

        <SessionScopeField
          compact
          label="Sessions"
          totalSessions={sessionsCount}
          value={sessionScope}
          onChange={(nextScope) => {
            setSessionScope(nextScope);
            if (validationError) {
              setValidationError('');
            }
          }}
        />
      </div>

      <ModalFooter onCancel={onCancel} onSave={handleSave} />
    </ModalWrapper>
  );
}
