import { Link2, Split, X } from 'lucide-react';
import type {
  ResultsPairMeetingAnnotation,
  ResultsPairMeetingCell,
  ResultsPairMeetingCellTone,
} from '../../services/results/buildResultsModel';
import { getResultsPairMeetingCellTone } from '../../services/results/buildResultsModel';

interface ResultsPairMeetingDetailModalProps {
  cell: ResultsPairMeetingCell;
  sessionCount: number;
  maxCount: number;
  onClose: () => void;
}

function getToneStyles(tone: ResultsPairMeetingCellTone): { backgroundColor: string; color: string; borderColor: string } {
  switch (tone) {
    case 'good':
      return {
        backgroundColor: 'color-mix(in srgb, var(--color-success-500) 18%, var(--bg-secondary))',
        color: 'var(--color-success-600)',
        borderColor: 'color-mix(in srgb, var(--color-success-500) 42%, var(--border-primary))',
      };
    case 'warn':
      return {
        backgroundColor: 'color-mix(in srgb, var(--color-warning-500) 20%, var(--bg-secondary))',
        color: 'var(--color-warning-700)',
        borderColor: 'color-mix(in srgb, var(--color-warning-500) 44%, var(--border-primary))',
      };
    case 'bad':
      return {
        backgroundColor: 'color-mix(in srgb, var(--color-error-500) 18%, var(--bg-secondary))',
        color: 'var(--color-error-600)',
        borderColor: 'color-mix(in srgb, var(--color-error-500) 46%, var(--border-primary))',
      };
    case 'neutral':
      return {
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-tertiary)',
        borderColor: 'var(--border-primary)',
      };
  }
}

function formatSessions(sessionIndexes: number[]): string {
  if (sessionIndexes.length === 0) {
    return 'No shared sessions';
  }

  return `Shared in ${sessionIndexes.map((sessionIndex) => `Session ${sessionIndex + 1}`).join(', ')}`;
}

function formatAnnotation(annotation: ResultsPairMeetingAnnotation): string {
  const sessions = annotation.sessions.length > 0
    ? annotation.sessions.map((sessionIndex) => sessionIndex + 1).join(', ')
    : 'all';
  const weight = annotation.penaltyWeight == null ? '' : `, weight ${annotation.penaltyWeight}`;

  return `${annotation.label} (${annotation.strength}, sessions ${sessions}${weight})`;
}

function formatObjectiveCost(cost: number): string {
  return Number.isInteger(cost) ? String(cost) : cost.toFixed(2);
}

function getAnnotationBadge(annotation: ResultsPairMeetingAnnotation) {
  const isTogether = annotation.intent === 'together';
  const isRequired = annotation.strength === 'required';
  const label = isTogether ? (isRequired ? 'KT' : 'PT') : (isRequired ? 'KA' : 'PA');
  const title = isTogether ? (isRequired ? 'Keep together' : 'Prefer together') : (isRequired ? 'Keep apart' : 'Prefer apart');

  return { label, title, Icon: isTogether ? Link2 : Split };
}

export function ResultsPairMeetingDetailModal({
  cell,
  sessionCount,
  maxCount,
  onClose,
}: ResultsPairMeetingDetailModalProps) {
  const tone = getResultsPairMeetingCellTone(cell, maxCount, sessionCount);
  const toneStyles = getToneStyles(tone);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="pair-meeting-detail-title">
      <div
        className="w-full max-w-md rounded-xl border p-4 shadow-2xl"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
              Pair detail
            </div>
            <h4 id="pair-meeting-detail-title" className="mt-1 text-lg font-semibold">
              {cell.rowDisplayName} + {cell.columnDisplayName}
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Close pair detail"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="text-[0.65rem] uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>Meetings</div>
            <div className="mt-1 text-2xl font-semibold">{cell.count}</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: toneStyles.borderColor, color: cell.objectiveCost > 0 ? toneStyles.color : 'var(--color-success-600)', backgroundColor: toneStyles.backgroundColor }}>
            <div className="text-[0.65rem] uppercase tracking-[0.08em]">Objective cost</div>
            <div className="mt-1 text-2xl font-semibold">{formatObjectiveCost(cell.objectiveCost)}</div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border p-3 text-sm leading-6" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {formatSessions(cell.sessionIndexes)}
        </div>

        {cell.objectiveCostItems.length > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
              Cost sources
            </div>
            {cell.objectiveCostItems.map((item) => (
              <div key={`${item.label}-${item.detail}`} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                  <span>{item.label}</span>
                  <span style={{ color: toneStyles.color }}>{formatObjectiveCost(item.amount)}</span>
                </div>
                <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {cell.annotations.length > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
              Constraint context
            </div>
            {cell.annotations.map((annotation) => {
              const { label, title, Icon } = getAnnotationBadge(annotation);

              return (
                <div key={`${annotation.kind}-${annotation.sessions.join('-')}`} className="flex gap-2 rounded-lg border p-2.5" style={{ borderColor: 'var(--border-primary)' }}>
                  <span className="inline-flex h-6 min-w-9 items-center justify-center gap-1 rounded text-[0.65rem] font-bold" style={{ backgroundColor: toneStyles.backgroundColor, color: toneStyles.color }}>
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
                      {formatAnnotation(annotation)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
