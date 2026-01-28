import React from 'react';

interface SolverCancelModalProps {
  open: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function SolverCancelModal({ open, onClose, onDiscard, onSave }: SolverCancelModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose}></div>
      <div
        className="relative bg-white dark:bg-gray-900 rounded-lg shadow-lg p-5 w-full max-w-md"
        style={{ border: '1px solid var(--border-secondary)' }}
      >
        <h4 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Cancel Solver?
        </h4>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Do you want to save the current progress as a solution or discard it?
        </p>
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Back
          </button>
          <button className="btn-warning" onClick={onDiscard}>
            Discard Progress
          </button>
          <button className="btn-success" onClick={onSave}>
            Save Progress
          </button>
        </div>
      </div>
    </div>
  );
}
