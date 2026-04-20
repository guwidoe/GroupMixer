import { AlertTriangle, ArrowRight, Clock3, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { SessionCountReductionPlan } from '../../services/sessionCountMigration';
import { Button } from '../ui';

interface ReduceSessionsReviewModalProps {
  isOpen: boolean;
  plan: SessionCountReductionPlan | null;
  onClose: () => void;
  onConfirm: () => void;
}

function DetailSection({
  title,
  items,
  tone = 'neutral',
}: {
  title: string;
  items: Array<{ title: string; detail: string }>;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  if (items.length === 0) {
    return null;
  }

  const accentColor = tone === 'danger'
    ? 'var(--color-error-600)'
    : tone === 'warning'
      ? 'var(--color-warning-600)'
      : 'var(--color-accent)';

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h4>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={`${title}-${item.title}-${item.detail}`}
            className="rounded-lg border p-3"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)',
            }}
          >
            <div className="text-sm font-medium" style={{ color: accentColor }}>
              {item.title}
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReduceSessionsReviewModal({
  isOpen,
  plan,
  onClose,
  onConfirm,
}: ReduceSessionsReviewModalProps) {
  if (!isOpen || !plan || typeof document === 'undefined') {
    return null;
  }

  const trimmedItems = plan.changes.filter((change) => change.kind !== 'constraint-removed');
  const removedItems = plan.changes.filter((change) => change.kind === 'constraint-removed');

  return createPortal(
    <div className="fixed inset-0 modal-backdrop z-[70] overflow-y-auto p-4">
      <div className="flex min-h-full items-center justify-center py-6">
        <div className="modal-content mx-auto w-full max-w-3xl rounded-xl p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex-shrink-0 pt-0.5">
              <AlertTriangle className="h-6 w-6" style={{ color: 'var(--color-warning-600)' }} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Review Session Reduction
              </h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Reducing sessions can trim or remove session-scoped setup. Review the affected items before applying the change.
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 rounded-md p-1 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="Close session reduction review"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-4"
            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
          >
            <div className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              <Clock3 className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
              Sessions
            </div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              {plan.previousSessionCount}
              <ArrowRight className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
              {plan.nextSessionCount}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {plan.summary.peopleTrimmed} people trimmed · {plan.summary.groupsTrimmed} groups truncated · {plan.summary.constraintsTrimmed} constraints trimmed · {plan.summary.constraintsRemoved} constraints removed
            </div>
          </div>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <DetailSection title="Blockers" items={plan.blockers} tone="danger" />
            <DetailSection title="Changes" items={trimmedItems} tone="neutral" />
            <DetailSection title="Removals" items={removedItems} tone="warning" />
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onConfirm} disabled={!plan.canApply}>
              Apply reduction
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
