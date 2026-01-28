import React from 'react';

interface DeleteConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ open, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-60 p-4">
      <div className="rounded-lg shadow-xl p-6 w-full max-w-md mx-auto modal-content">
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Confirm Delete
        </h3>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Are you sure you want to delete this problem? This action cannot be undone.
        </p>
        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 sm:flex-none px-6 py-3 text-base font-medium">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-error flex-1 sm:flex-none px-6 py-3 text-base font-medium">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
