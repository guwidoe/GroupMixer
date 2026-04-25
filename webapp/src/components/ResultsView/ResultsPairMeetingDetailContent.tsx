import type {
  ResultsPairMeetingCell,
  ResultsPairMeetingCellTone,
} from '../../services/results/buildResultsModel';
import {
  formatPairMeetingAnnotation,
  formatPairMeetingObjectiveCost,
  formatPairMeetingSessions,
  getPairMeetingAnnotationBadge,
  getPairMeetingToneLabel,
  getPairMeetingToneStyles,
} from './pairMeetingDetailUtils';

interface ResultsPairMeetingDetailContentProps {
  cell: ResultsPairMeetingCell;
  tone: ResultsPairMeetingCellTone;
  variant?: 'tooltip' | 'modal';
}

export function ResultsPairMeetingDetailContent({
  cell,
  tone,
  variant = 'modal',
}: ResultsPairMeetingDetailContentProps) {
  const toneStyles = getPairMeetingToneStyles(tone);
  const compact = variant === 'tooltip';
  const cardClassName = compact ? 'rounded-md border px-2 py-1.5' : 'rounded-lg border p-3';
  const sectionSpacing = compact ? 'space-y-1.5' : 'space-y-2';

  return (
    <div className={compact ? 'w-80 space-y-3' : 'space-y-4'}>
      {compact ? (
        <div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
            Pair
          </div>
          <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--tooltip-text)' }}>
            {cell.rowDisplayName} + {cell.columnDisplayName}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <div className={cardClassName} style={{ borderColor: compact ? 'var(--tooltip-border)' : 'var(--border-primary)', backgroundColor: compact ? undefined : 'var(--bg-secondary)' }}>
          <div className="text-[0.65rem] uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>Meetings</div>
          <div className={compact ? 'text-base font-semibold' : 'mt-1 text-2xl font-semibold'}>{cell.count}</div>
        </div>
        <div
          className={cardClassName}
          style={{
            borderColor: toneStyles.borderColor,
            color: cell.objectiveCost > 0 ? toneStyles.color : 'var(--color-success-600)',
            backgroundColor: compact ? undefined : toneStyles.backgroundColor,
          }}
        >
          <div className="text-[0.65rem] uppercase tracking-[0.08em]">Objective cost</div>
          <div className={compact ? 'text-base font-semibold' : 'mt-1 text-2xl font-semibold'}>{formatPairMeetingObjectiveCost(cell.objectiveCost)}</div>
        </div>
      </div>

      <div
        className={compact ? 'text-xs leading-5' : 'rounded-lg border p-3 text-sm leading-6'}
        style={{
          borderColor: 'var(--border-primary)',
          backgroundColor: compact ? undefined : 'var(--bg-secondary)',
          color: compact ? 'var(--tooltip-text)' : 'var(--text-secondary)',
        }}
      >
        {formatPairMeetingSessions(cell.sessionIndexes)}
      </div>

      {cell.objectiveCostItems.length > 0 ? (
        <div className={sectionSpacing}>
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
            Cost sources
          </div>
          {cell.objectiveCostItems.map((item) => (
            <div key={`${item.label}-${item.detail}`} className={compact ? 'rounded-md border px-2 py-1.5' : 'rounded-lg border p-2.5'} style={{ borderColor: compact ? 'var(--tooltip-border)' : 'var(--border-primary)' }}>
              <div className={compact ? 'flex items-center justify-between gap-3 text-xs font-semibold' : 'flex items-center justify-between gap-3 text-sm font-semibold'}>
                <span>{item.label}</span>
                <span style={{ color: toneStyles.color }}>{formatPairMeetingObjectiveCost(item.amount)}</span>
              </div>
              <div className={compact ? 'mt-0.5 text-[0.68rem] leading-4' : 'mt-1 text-xs leading-5'} style={{ color: 'var(--text-tertiary)' }}>
                {item.detail}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={compact ? 'rounded-md border px-2 py-1.5 text-xs' : 'rounded-lg border p-2.5 text-sm'} style={{ borderColor: compact ? 'var(--tooltip-border)' : 'var(--border-primary)', color: 'var(--text-secondary)' }}>
          No pair-local objective cost was incurred.
        </div>
      )}

      {cell.annotations.length > 0 ? (
        <div className={sectionSpacing}>
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
            Constraint context
          </div>
          {cell.annotations.map((annotation) => {
            const { label, title, Icon } = getPairMeetingAnnotationBadge(annotation);

            return (
              <div key={`${annotation.kind}-${annotation.sessions.join('-')}`} className={compact ? 'flex gap-2 rounded-md border px-2 py-1.5' : 'flex gap-2 rounded-lg border p-2.5'} style={{ borderColor: compact ? 'var(--tooltip-border)' : 'var(--border-primary)' }}>
                <span className={compact ? 'mt-0.5 inline-flex h-5 min-w-7 items-center justify-center gap-0.5 rounded text-[0.62rem] font-bold' : 'inline-flex h-6 min-w-9 items-center justify-center gap-1 rounded text-[0.65rem] font-bold'} style={{ backgroundColor: compact ? 'var(--bg-primary)' : toneStyles.backgroundColor, color: toneStyles.color }}>
                  <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                  {label}
                </span>
                <div className="min-w-0">
                  <div className={compact ? 'text-xs font-semibold' : 'text-sm font-semibold'}>{title}</div>
                  <div className={compact ? 'text-[0.68rem] leading-4' : 'text-xs leading-5'} style={{ color: 'var(--text-tertiary)' }}>
                    {formatPairMeetingAnnotation(annotation)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className={compact ? 'text-[0.68rem] leading-4' : 'text-xs leading-5'} style={{ color: 'var(--text-tertiary)' }}>
        Assessment: {getPairMeetingToneLabel(tone)}
      </div>
    </div>
  );
}
