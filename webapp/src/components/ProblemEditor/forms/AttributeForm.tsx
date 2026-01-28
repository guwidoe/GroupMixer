/**
 * AttributeForm - Modal form for adding or editing an attribute definition.
 */

import React from 'react';
import { X, Plus } from 'lucide-react';

interface AttributeFormProps {
  isEditing: boolean;
  newAttribute: { key: string; values: string[] };
  setNewAttribute: React.Dispatch<React.SetStateAction<{ key: string; values: string[] }>>;
  onSave: () => void;
  onUpdate: () => void;
  onCancel: () => void;
}

const AttributeForm: React.FC<AttributeFormProps> = ({
  isEditing,
  newAttribute,
  setNewAttribute,
  onSave,
  onUpdate,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
      <div className="rounded-lg p-6 w-full max-w-md mx-4 modal-content max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isEditing ? 'Edit Attribute Definition' : 'Add Attribute Definition'}
          </h3>
          <button
            onClick={onCancel}
            className="transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Attribute Name *
            </label>
            <input
              type="text"
              value={newAttribute.key}
              onChange={(e) => setNewAttribute(prev => ({ ...prev, key: e.target.value }))}
              className="input"
              placeholder="e.g., department, experience, location"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Possible Values *
            </label>
            <div className="max-h-48 overflow-y-auto space-y-2 border rounded p-3" style={{ borderColor: 'var(--border-secondary)' }}>
              {newAttribute.values.map((value, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                      const newValues = [...newAttribute.values];
                      newValues[index] = e.target.value;
                      setNewAttribute(prev => ({ ...prev, values: newValues }));
                    }}
                    className="input flex-1"
                    placeholder={`Value ${index + 1}`}
                  />
                  {newAttribute.values.length > 1 && (
                    <button
                      onClick={() => {
                        const newValues = newAttribute.values.filter((_, i) => i !== index);
                        setNewAttribute(prev => ({ ...prev, values: newValues }));
                      }}
                      className="px-3 py-2 rounded-md transition-colors"
                      style={{
                        backgroundColor: 'var(--color-error-100)',
                        color: 'var(--color-error-700)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-error-200)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-error-100)'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setNewAttribute(prev => ({ ...prev, values: [...prev.values, ''] }))}
              className="btn-secondary text-sm mt-2"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Value
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={isEditing ? onUpdate : onSave}
            className="btn-primary flex-1 px-4 py-2"
          >
            {isEditing ? 'Update Attribute' : 'Add Attribute'}
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

export default AttributeForm;
