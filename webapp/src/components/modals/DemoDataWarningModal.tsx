import { AlertTriangle, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface DemoDataWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOverwrite: () => void;
  onLoadNew: () => void;
  demoCaseName: string;
}

export function DemoDataWarningModal({
  isOpen,
  onClose,
  onOverwrite,
  onLoadNew,
  demoCaseName,
}: DemoDataWarningModalProps) {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 modal-backdrop z-[70] overflow-y-auto p-4">
      <div className="flex min-h-full items-center justify-center py-6">
        <div className="modal-content mx-auto w-full max-w-md rounded-xl p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex-shrink-0 pt-0.5">
              <AlertTriangle className="h-6 w-6" style={{ color: 'var(--color-error-600)' }} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Overwrite Current Scenario?
              </h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Loading &quot;{demoCaseName}&quot; will overwrite your current scenario settings, including all people,
                groups, and constraints.
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 rounded-md p-1 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-tertiary)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              aria-label="Close demo data warning"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3">
            <div
              className="rounded-lg border p-3"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                <strong>Current scenario:</strong> {demoCaseName}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                This action cannot be undone. Your current settings will be lost.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onOverwrite}
                className="flex-1 rounded-md px-4 py-2 font-medium text-white transition-colors"
                style={{ backgroundColor: 'var(--color-error-600)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-error-700)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-error-600)';
                }}
              >
                Overwrite
              </button>
              <button
                onClick={onLoadNew}
                className="flex-1 rounded-md px-4 py-2 font-medium text-white transition-opacity"
                style={{ backgroundColor: 'var(--color-accent)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Load in New Scenario
              </button>
            </div>
            <button onClick={onClose} className="btn-secondary w-full rounded-md px-4 py-2 font-medium transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
