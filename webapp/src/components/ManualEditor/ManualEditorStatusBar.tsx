import React from 'react';
import { AlertTriangle, Target, Users } from 'lucide-react';

interface ManualEditorStatusBarProps {
  evalLoading: boolean;
  evalError: string | null;
  draftScore: number;
  deltaScore: number;
  draftUnique: number;
  deltaUnique: number;
  draftConstraint: number;
  deltaViolations: number;
}

export function ManualEditorStatusBar({
  evalLoading,
  evalError,
  draftScore,
  deltaScore,
  draftUnique,
  deltaUnique,
  draftConstraint,
  deltaViolations,
}: ManualEditorStatusBarProps) {
  const deltaScoreSign = deltaScore === 0 ? '' : deltaScore > 0 ? '+' : '';
  const deltaUniqueSign = deltaUnique === 0 ? '' : deltaUnique > 0 ? '+' : '';
  const deltaViolationsSign = deltaViolations === 0 ? '' : deltaViolations > 0 ? '+' : '';

  return (
    <div
      className="rounded-lg border p-3"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex flex-wrap gap-4 text-sm items-center">
        {evalLoading && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Evaluating…</span>}
        {evalError && <span className="text-xs text-red-600">{evalError}</span>}
        <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Target className="w-4 h-4" />
          <span>
            Cost score: <span style={{ color: 'var(--text-primary)' }}>{draftScore.toFixed(2)}</span> (
            <span className={deltaScore <= 0 ? 'text-green-600' : 'text-red-600'}>
              {deltaScoreSign}{deltaScore.toFixed(2)}
            </span>
            )
          </span>
        </div>
        <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Users className="w-4 h-4" />
          <span>
            Unique contacts: <span style={{ color: 'var(--text-primary)' }}>{draftUnique}</span> (
            <span className={deltaUnique >= 0 ? 'text-green-600' : 'text-red-600'}>
              {deltaUniqueSign}{deltaUnique}
            </span>
            )
          </span>
        </div>
        <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <AlertTriangle className="w-4 h-4" />
          <span>
            Violations: <span style={{ color: 'var(--text-primary)' }}>{draftConstraint}</span> (
            <span className={deltaViolations <= 0 ? 'text-green-600' : 'text-red-600'}>
              {deltaViolationsSign}{deltaViolations}
            </span>
            )
          </span>
        </div>
      </div>
    </div>
  );
}
