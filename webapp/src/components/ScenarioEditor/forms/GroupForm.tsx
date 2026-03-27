/**
 * GroupForm - Modal form for adding or editing a group.
 */

import React from 'react';
import { X } from 'lucide-react';
import type { Group, GroupFormData } from '../../../types';

type GroupFormInputs = {
  size?: string;
  sessionSizes?: string[];
};

interface GroupFormProps {
  isEditing: boolean;
  editingGroup: Group | null;
  groupForm: GroupFormData;
  setGroupForm: React.Dispatch<React.SetStateAction<GroupFormData>>;
  groupFormInputs: GroupFormInputs;
  setGroupFormInputs: React.Dispatch<React.SetStateAction<GroupFormInputs>>;
  sessionsCount: number;
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
  sessionsCount,
  onSave,
  onUpdate,
  onCancel,
}) => {
  const baseSizeValue = groupFormInputs.size ?? groupForm.size?.toString() ?? '';
  const hasSessionOverrides = Array.isArray(groupFormInputs.sessionSizes) && groupFormInputs.sessionSizes.length > 0;

  const isSizeInvalid = (() => {
    if (baseSizeValue !== undefined) {
      return baseSizeValue === '' || Number.isNaN(parseInt(baseSizeValue, 10)) || parseInt(baseSizeValue, 10) < 1;
    }
    return groupForm.size < 1;
  })();

  const sessionSizeInputs = hasSessionOverrides
    ? groupFormInputs.sessionSizes!
    : Array.from({ length: sessionsCount }, () => baseSizeValue || groupForm.size.toString());

  const hasInvalidSessionSize = sessionSizeInputs.some(
    (value) => value === '' || Number.isNaN(parseInt(value, 10)) || parseInt(value, 10) < 0,
  );

  const toggleSessionOverrides = (enabled: boolean) => {
    if (!enabled) {
      setGroupForm((prev) => ({ ...prev, session_sizes: undefined }));
      setGroupFormInputs((prev) => ({ ...prev, sessionSizes: undefined }));
      return;
    }

    const fallback = baseSizeValue || groupForm.size.toString();
    const nextSessionSizes = Array.from({ length: sessionsCount }, (_, index) => {
      return groupFormInputs.sessionSizes?.[index] ?? groupForm.session_sizes?.[index]?.toString() ?? fallback;
    });

    setGroupForm((prev) => ({
      ...prev,
      session_sizes: nextSessionSizes.map((value) => Number.parseInt(value, 10) || 0),
    }));
    setGroupFormInputs((prev) => ({ ...prev, sessionSizes: nextSessionSizes }));
  };

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-4 sm:p-6 w-full max-w-xl mx-auto modal-content max-h-[90vh] overflow-y-auto">
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
              Default capacity *
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={baseSizeValue}
              onChange={(e) => {
                const value = e.target.value;
                setGroupFormInputs((prev) => ({
                  ...prev,
                  size: value,
                  sessionSizes:
                    Array.isArray(prev.sessionSizes) && prev.sessionSizes.length > 0
                      ? prev.sessionSizes.map((sessionValue) => {
                          const previousBase = prev.size ?? groupForm.size.toString();
                          return sessionValue === '' || sessionValue === previousBase ? value : sessionValue;
                        })
                      : prev.sessionSizes,
                }));
              }}
              className={`input ${isSizeInvalid ? 'border-red-500 focus:border-red-500' : ''}`}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Used for every session unless you set custom session capacities below
            </p>
          </div>

          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={hasSessionOverrides}
                onChange={(e) => toggleSessionOverrides(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Customize capacities per session
                </span>
                <span className="block text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Set session-specific capacities for this group. Use 0 to close the group in a session.
                </span>
              </span>
            </label>

            {hasSessionOverrides && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: sessionsCount }, (_, sessionIndex) => {
                  const value = sessionSizeInputs[sessionIndex] ?? baseSizeValue;
                  return (
                    <div key={sessionIndex}>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                        Session {sessionIndex + 1}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={value}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setGroupFormInputs((prev) => {
                            const nextSessionSizes = prev.sessionSizes
                              ? [...prev.sessionSizes]
                              : Array.from({ length: sessionsCount }, () => baseSizeValue || groupForm.size.toString());
                            nextSessionSizes[sessionIndex] = nextValue;
                            return {
                              ...prev,
                              sessionSizes: nextSessionSizes,
                            };
                          });
                        }}
                        className={`input ${hasInvalidSessionSize ? 'border-red-500 focus:border-red-500' : ''}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
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
