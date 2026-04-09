import React from 'react';
import { Button } from '../ui';

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
          Are you sure you want to delete this scenario? This action cannot be undone.
        </p>
        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <Button onClick={onCancel} variant="secondary" size="lg" className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button onClick={onConfirm} variant="danger" size="lg" className="flex-1 sm:flex-none">
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
