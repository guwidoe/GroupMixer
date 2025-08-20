// React import is not required in React 17+ with JSX runtime
import { AlertTriangle, X } from 'lucide-react';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg p-6 w-full max-w-md mx-auto modal-content">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-6 h-6" style={{ color: 'var(--color-error-600)' }} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Overwrite Current Problem?
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Loading "{demoCaseName}" will overwrite your current problem settings, including all people, groups, and constraints.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-md p-3 border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <strong>Current problem:</strong> {demoCaseName}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              This action cannot be undone. Your current settings will be lost.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onOverwrite}
              className="flex-1 px-4 py-2 rounded-md font-medium text-white transition-colors"
              style={{ backgroundColor: 'var(--color-error-600)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-error-700)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-error-600)'}
            >
              Overwrite
            </button>
            <button
              onClick={onLoadNew}
              className="flex-1 px-4 py-2 rounded-md font-medium transition-colors"
              style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              Load in New Problem
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-md font-medium transition-colors btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
} 