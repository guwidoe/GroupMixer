/**
 * GroupForm - Modal form for adding or editing a group.
 */

import React from 'react';
import { X } from 'lucide-react';
import type { Group, GroupFormData } from '../../../types';

interface GroupFormProps {
  isEditing: boolean;
  editingGroup: Group | null;
  groupForm: GroupFormData;
  setGroupForm: React.Dispatch<React.SetStateAction<GroupFormData>>;
  groupFormInputs: { size?: string };
  setGroupFormInputs: React.Dispatch<React.SetStateAction<{ size?: string }>>;
  onSave: () => void;
  onUpdate: () => void;
  onCancel: () => void;
}

const GroupForm: React.FC<GroupFormProps> = ({
  isEditing,
  groupForm,
  setGroupForm,
  groupFormInputs,
  setGroupFormInputs,
  onSave,
  onUpdate,
  onCancel,
}) => {
  const isSizeInvalid = (() => {
    const inputValue = groupFormInputs.size;
    if (inputValue !== undefined) {
      return inputValue === '' || isNaN(parseInt(inputValue)) || parseInt(inputValue) < 1;
    }
    return groupForm.size < 1;
  })();

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto modal-content max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {isEditing ? 'Edit Group' : 'Add Group'}
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Group ID *
            </label>
            <input
              type="text"
              value={groupForm.id || ''}
              onChange={(e) => setGroupForm(prev => ({ ...prev, id: e.target.value }))}
              className="input"
              placeholder="e.g., team-alpha, group-1"
              disabled={isEditing}
            />
            {isEditing && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Group ID cannot be changed when editing</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Capacity (people per session) *
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={groupFormInputs.size ?? groupForm.size?.toString() ?? ''}
              onChange={(e) => {
                setGroupFormInputs(prev => ({ ...prev, size: e.target.value }));
              }}
              className={`input ${isSizeInvalid ? 'border-red-500 focus:border-red-500' : ''}`}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Maximum number of people that can be assigned to this group in any single session
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={isEditing ? onUpdate : onSave}
            className="btn-primary flex-1 px-4 py-2"
          >
            {isEditing ? 'Update' : 'Add'} Group
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

export default GroupForm;
