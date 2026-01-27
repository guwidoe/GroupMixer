import React, { useState } from 'react';
import type { Constraint } from '../../types';
import { ModalWrapper, ModalHeader, ModalFooter, FormValidationError } from '../ui';

interface Props {
  initial?: Constraint | null; // if editing existing
  onCancel: () => void;
  onSave: (constraint: Constraint) => void;
}

const RepeatEncounterModal: React.FC<Props> = ({ initial, onCancel, onSave }) => {
  const editing = !!initial;

  const getInitialState = () => {
    if (editing && initial?.type === 'RepeatEncounter') {
      return {
        max_allowed_encounters: initial.max_allowed_encounters ?? 1,
        penalty_function: initial.penalty_function ?? 'squared',
        penalty_weight: initial.penalty_weight ?? 1,
      };
    }
    return {
      max_allowed_encounters: 1,
      penalty_function: 'squared',
      penalty_weight: 1,
    };
  };

  const [formState, setFormState] = useState(getInitialState);
  const [validationError, setValidationError] = useState<string>('');

  const isMaxEncountersValid = (value: number | null) => {
    return value !== null && value >= 0;
  };

  const isPenaltyWeightValid = (value: number | null) => {
    return value !== null && value > 0;
  };

  const handleSave = () => {
    setValidationError('');

    if (!isMaxEncountersValid(formState.max_allowed_encounters)) {
      setValidationError('Max allowed encounters must be a non-negative number.');
      return;
    }
    if (!isPenaltyWeightValid(formState.penalty_weight)) {
      setValidationError('Penalty weight must be a positive number.');
      return;
    }

    const newConstraint: Constraint = {
      type: 'RepeatEncounter',
      max_allowed_encounters: formState.max_allowed_encounters!,
      penalty_function: formState.penalty_function as 'linear' | 'squared',
      penalty_weight: formState.penalty_weight!,
    };

    onSave(newConstraint);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'max_allowed_encounters' || name === 'penalty_weight') {
      const numValue = value === '' ? null : parseFloat(value);
      setFormState(prev => ({
        ...prev,
        [name]: numValue,
      }));
    } else {
      setFormState(prev => ({
        ...prev,
        [name]: value,
      }));
    }

    if (validationError) setValidationError('');
  };

  return (
    <ModalWrapper maxWidth="md">
      <ModalHeader
        title={editing ? 'Edit Repeat Encounter' : 'Add Repeat Encounter'}
        onClose={onCancel}
      />

      <FormValidationError error={validationError} />

      <div className="space-y-6">
        <div>
          <label htmlFor="max_allowed_encounters" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Max Allowed Encounters</label>
          <input
            id="max_allowed_encounters"
            name="max_allowed_encounters"
            type="number"
            value={formState.max_allowed_encounters ?? ''}
            onChange={handleChange}
            className={`input w-full text-base py-3 ${!isMaxEncountersValid(formState.max_allowed_encounters) ? 'border-red-500 focus:border-red-500' : ''}`}
            min="0"
          />
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>The number of times any two people can be in the same group before penalties apply.</p>
        </div>

        <div>
          <label htmlFor="penalty_function" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Penalty Function</label>
          <select
            id="penalty_function"
            name="penalty_function"
            value={formState.penalty_function}
            onChange={handleChange}
            className="select w-full text-base py-3"
          >
            <option value="squared">Squared</option>
            <option value="linear">Linear</option>
          </select>
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>The penalty for each additional encounter beyond the maximum. `(n-max)^2` or `(n-max)`.</p>
        </div>

        <div>
          <label htmlFor="penalty_weight" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Penalty Weight</label>
          <input
            id="penalty_weight"
            name="penalty_weight"
            type="number"
            value={formState.penalty_weight ?? ''}
            onChange={handleChange}
            className={`input w-full text-base py-3 ${!isPenaltyWeightValid(formState.penalty_weight) ? 'border-red-500 focus:border-red-500' : ''}`}
            min="0"
            step="0.1"
          />
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Multiplier for the penalty score. Higher values make the solver prioritize this constraint more.</p>
        </div>
      </div>

      <ModalFooter onCancel={onCancel} onSave={handleSave} />
    </ModalWrapper>
  );
};

export default RepeatEncounterModal;
