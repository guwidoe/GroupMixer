/**
 * PersonForm - Modal form for adding or editing a person.
 */

import React from 'react';
import { X, Plus } from 'lucide-react';
import type { Person, PersonFormData, AttributeDefinition } from '../../../types';

interface PersonFormProps {
  isEditing: boolean;
  editingPerson: Person | null;
  personForm: PersonFormData;
  setPersonForm: React.Dispatch<React.SetStateAction<PersonFormData>>;
  attributeDefinitions: AttributeDefinition[];
  sessionsCount: number;
  onSave: () => void;
  onUpdate: () => void;
  onCancel: () => void;
  onShowAttributeForm: () => void;
}

const PersonForm: React.FC<PersonFormProps> = ({
  isEditing,
  personForm,
  setPersonForm,
  attributeDefinitions,
  sessionsCount,
  onSave,
  onUpdate,
  onCancel,
  onShowAttributeForm,
}) => {
  const sessions = Array.from({ length: sessionsCount }, (_, i) => i);

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto modal-content">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {isEditing ? 'Edit Person' : 'Add Person'}
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name (required) */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Name *
            </label>
            <input
              type="text"
              value={personForm.attributes.name || ''}
              onChange={(e) => setPersonForm(prev => ({
                ...prev,
                attributes: { ...prev.attributes, name: e.target.value }
              }))}
              className="input"
              placeholder="Enter person's name"
            />
          </div>

          {/* Attributes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Attributes
              </label>
              <button
                type="button"
                onClick={onShowAttributeForm}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--color-accent)' }}
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
            <div className="space-y-2">
              {attributeDefinitions.map(def => (
                <div key={def.key}>
                  <label className="block text-xs mb-1 capitalize" style={{ color: 'var(--text-tertiary)' }}>
                    {def.key}
                  </label>
                  <select
                    value={personForm.attributes[def.key] || ''}
                    onChange={(e) => setPersonForm(prev => ({
                      ...prev,
                      attributes: { ...prev.attributes, [def.key]: e.target.value }
                    }))}
                    className="select text-sm"
                  >
                    <option value="">Select {def.key}</option>
                    {def.values.map(value => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Sessions */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Session Participation
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
              Leave empty for all sessions. Select specific sessions for late arrivals/early departures.
            </p>
            <div className="flex flex-wrap gap-2">
              {sessions.map(sessionIdx => (
                <label key={sessionIdx} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={personForm.sessions.includes(sessionIdx)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPersonForm(prev => ({
                          ...prev,
                          sessions: [...prev.sessions, sessionIdx].sort()
                        }));
                      } else {
                        setPersonForm(prev => ({
                          ...prev,
                          sessions: prev.sessions.filter(s => s !== sessionIdx)
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
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={isEditing ? onUpdate : onSave}
            className="btn-primary flex-1 px-4 py-2"
          >
            {isEditing ? 'Update' : 'Add'} Person
          </button>
          <button
            onClick={onCancel}
            className="btn-secondary px-4 py-2 rounded-md"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonForm;
