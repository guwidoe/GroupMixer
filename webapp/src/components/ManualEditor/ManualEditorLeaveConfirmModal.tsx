import React from 'react';

interface ManualEditorLeaveConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function ManualEditorLeaveConfirmModal({ open, onCancel, onDiscard, onSave }: ManualEditorLeaveConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div
        className="rounded-lg border w-full max-w-md"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Unsaved changes
          </div>
          <div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            You have unsaved changes. Save as a new result before leaving?
          </div>
        </div>
        <div className="p-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded border text-sm"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 rounded border text-sm"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            onClick={onDiscard}
          >
            Discard and continue
          </button>
          <button
            className="px-3 py-1.5 rounded text-sm"
            style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
            onClick={onSave}
          >
            Save as new result
          </button>
        </div>
      </div>
    </div>
  );
}
