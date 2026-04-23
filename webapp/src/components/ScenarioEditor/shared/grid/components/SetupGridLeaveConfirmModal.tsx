import React from 'react';

interface SetupGridLeaveConfirmModalProps {
  open: boolean;
  onStay: () => void;
  onDiscardAndLeave: () => void;
  onApplyAndLeave: () => void;
}

export function SetupGridLeaveConfirmModal({
  open,
  onStay,
  onDiscardAndLeave,
  onApplyAndLeave,
}: SetupGridLeaveConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div
        className="w-full max-w-md rounded-lg border"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-grid-leave-modal-title"
      >
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-primary)' }}>
          <div id="setup-grid-leave-modal-title" className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Unapplied grid changes
          </div>
          <div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            You have changes in this table that have not been applied yet. What would you like to do before leaving?
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-4">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            onClick={onStay}
          >
            Stay
          </button>
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            onClick={onDiscardAndLeave}
          >
            Discard and leave
          </button>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm"
            style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
            onClick={onApplyAndLeave}
          >
            Apply and leave
          </button>
        </div>
      </div>
    </div>
  );
}
