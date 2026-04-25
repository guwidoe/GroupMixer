import { useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, Link2, Split, XCircle } from 'lucide-react';
import type {
  ResultsPairMeetingAnnotation,
  ResultsPairMeetingCell,
  ResultsPairMeetingCellTone,
  ResultsPairMeetingMatrix as ResultsPairMeetingMatrixData,
  ResultsPairMeetingRow,
} from '../../services/results/buildResultsModel';
import {
  buildResultsPairMeetingRows,
  getResultsPairMeetingCellTone,
} from '../../services/results/buildResultsModel';
import { Tooltip } from '../Tooltip';
import { ResultsPairMeetingDetailModal } from './ResultsPairMeetingDetailModal';

interface ResultsPairMeetingMatrixProps {
  matrix: ResultsPairMeetingMatrixData;
  sessionCount: number;
}

type PairMeetingMatrixDensity = 'detailed' | 'compact';

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

function getToneLabel(tone: ResultsPairMeetingCellTone): string {
  switch (tone) {
    case 'good':
      return 'Good';
    case 'warn':
      return 'Review';
    case 'bad':
      return 'Attention';
    case 'neutral':
      return 'No meeting';
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

function getPrimaryAnnotationIcon(cell: ResultsPairMeetingCell) {
  const annotation = cell.annotations.find((candidate) => candidate.strength === 'required') ?? cell.annotations[0];
  if (!annotation) {
    return null;
  }

  return annotation.intent === 'together' ? Link2 : Split;
}

function renderCellTooltipContent(cell: ResultsPairMeetingCell, tone: ResultsPairMeetingCellTone) {
  const toneStyles = getToneStyles(tone);

  return (
    <div className="w-72 space-y-3">
      <div>
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
          Pair
        </div>
        <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--tooltip-text)' }}>
          {cell.rowDisplayName} + {cell.columnDisplayName}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'var(--tooltip-border)' }}>
          <div className="text-[0.65rem] uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>Meetings</div>
          <div className="text-base font-semibold">{cell.count}</div>
        </div>
        <div className="rounded-md border px-2 py-1.5" style={{ borderColor: toneStyles.borderColor, color: cell.objectiveCost > 0 ? toneStyles.color : 'var(--color-success-600)' }}>
          <div className="text-[0.65rem] uppercase tracking-[0.08em]">Objective cost</div>
          <div className="text-base font-semibold">{formatObjectiveCost(cell.objectiveCost)}</div>
        </div>
      </div>

      <div className="text-xs leading-5" style={{ color: 'var(--tooltip-text)' }}>
        {formatSessions(cell.sessionIndexes)}
      </div>

      {cell.objectiveCostItems.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
            Cost sources
          </div>
          {cell.objectiveCostItems.map((item) => (
            <div key={`${item.label}-${item.detail}`} className="rounded-md border px-2 py-1.5" style={{ borderColor: 'var(--tooltip-border)' }}>
              <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                <span>{item.label}</span>
                <span style={{ color: toneStyles.color }}>{formatObjectiveCost(item.amount)}</span>
              </div>
              <div className="mt-0.5 text-[0.68rem] leading-4" style={{ color: 'var(--text-tertiary)' }}>
                {item.detail}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {cell.annotations.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
            Constraint context
          </div>
          {cell.annotations.map((annotation) => {
            const { label, title: badgeTitle, Icon } = getAnnotationBadge(annotation);

            return (
              <div key={`${annotation.kind}-${annotation.sessions.join('-')}`} className="flex gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: 'var(--tooltip-border)' }}>
                <span className="mt-0.5 inline-flex h-5 min-w-7 items-center justify-center gap-0.5 rounded text-[0.62rem] font-bold" style={{ backgroundColor: 'var(--bg-primary)', color: toneStyles.color }}>
                  <Icon className="h-3 w-3" />
                  {label}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{badgeTitle}</div>
                  <div className="text-[0.68rem] leading-4" style={{ color: 'var(--text-tertiary)' }}>
                    {formatAnnotation(annotation)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function renderCompactCellTooltip(cell: ResultsPairMeetingCell, tone: ResultsPairMeetingCellTone) {
  const annotationSummary = cell.annotations.length > 0
    ? ` · ${cell.annotations.map((annotation) => getAnnotationBadge(annotation).label).join(', ')}`
    : '';

  return (
    <div className="max-w-56">
      <div className="font-semibold">{cell.rowDisplayName} + {cell.columnDisplayName}</div>
      <div className="mt-1" style={{ color: 'var(--text-tertiary)' }}>
        {cell.count} meeting{cell.count === 1 ? '' : 's'} · cost {formatObjectiveCost(cell.objectiveCost)} · {getToneLabel(tone)}{annotationSummary}
      </div>
    </div>
  );
}

export function ResultsPairMeetingMatrix({ matrix, sessionCount }: ResultsPairMeetingMatrixProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [density, setDensity] = useState<PairMeetingMatrixDensity>('detailed');
  const [selectedCell, setSelectedCell] = useState<ResultsPairMeetingCell | null>(null);
  const rows = useMemo<ResultsPairMeetingRow[]>(
    () => (collapsed ? [] : buildResultsPairMeetingRows(matrix)),
    [collapsed, matrix],
  );

  if (matrix.participants.length < 2) {
    return null;
  }

  return (
    <section
      className="results-print-section overflow-hidden rounded-lg border p-6 transition-colors"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
            Pair Meeting Matrix
          </h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Pair-by-pair meeting counts with together/apart constraint context.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!collapsed ? (
            <div className="inline-flex rounded-full border p-1" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
              {(['detailed', 'compact'] as const).map((nextDensity) => {
                const active = density === nextDensity;

                return (
                  <button
                    key={nextDensity}
                    type="button"
                    onClick={() => setDensity(nextDensity)}
                    className="rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--bg-tertiary)' : 'transparent',
                      color: active ? 'var(--color-accent)' : 'var(--text-secondary)',
                    }}
                    aria-pressed={active}
                  >
                    {nextDensity}
                  </button>
                );
              })}
            </div>
          ) : null}
          <button
            onClick={() => setCollapsed((current) => !current)}
            className="rounded border px-3 py-1 text-sm"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <span className="inline-flex items-center gap-1">
                <ChevronDown className="h-4 w-4" /> Expand
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <ChevronUp className="h-4 w-4" /> Collapse
              </span>
            )}
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-green-600">
              <CheckCircle className="h-4 w-4" /> Max pair count
            </div>
            <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{matrix.maxCount}</div>
          </div>
          <div className="rounded-lg border p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
            <div className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
              <Link2 className="h-4 w-4" /> Annotated pairs
            </div>
            <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{matrix.annotatedPairCount}</div>
          </div>
          <div className="rounded-lg border p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-red-600">
              <XCircle className="h-4 w-4" /> Attention pairs
            </div>
            <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{matrix.attentionPairCount}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {matrix.repeatedPairCount} pair{matrix.repeatedPairCount === 1 ? '' : 's'} met more than once
            </div>
          </div>
        </div>
      ) : density === 'compact' ? (
        <div className="theme-scrollbar overflow-auto rounded-xl border p-3" style={{ borderColor: 'var(--border-primary)' }}>
          <table className="w-max border-separate border-spacing-[2px] text-[10px]">
            <caption className="sr-only">
              Compact pair meeting matrix. The lower triangle contains tiny color-coded cells; activate a cell for pair details.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-20 min-w-[8rem] text-left text-[0.65rem] font-semibold uppercase tracking-[0.08em]"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}
                >
                  Person
                </th>
                {matrix.participants.map((participant) => (
                  <th
                    key={participant.personId}
                    scope="col"
                    className="h-4 w-3 min-w-3 max-w-3 overflow-hidden p-0 text-center text-[0.5rem] font-semibold"
                    style={{ color: 'var(--text-tertiary)' }}
                    title={participant.displayName}
                  >
                    <span className="sr-only">{participant.displayName}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.personId}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[8rem] pr-2 text-left text-[0.68rem] font-medium"
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                    title={row.displayName}
                  >
                    <span className="block truncate">{row.displayName}</span>
                  </th>
                  {row.cells.map((cell, columnIndex) => {
                    const participant = matrix.participants[columnIndex];
                    const tone = cell ? getResultsPairMeetingCellTone(cell, matrix.maxCount, sessionCount) : 'neutral';
                    const toneStyles = getToneStyles(tone);

                    return (
                      <td
                        key={`${row.personId}-${participant?.personId ?? columnIndex}`}
                        className="h-3 w-3 min-w-3 max-w-3 p-0 text-center leading-none"
                      >
                        {cell ? (
                          <Tooltip
                            content={() => renderCompactCellTooltip(cell, tone)}
                            placement="top"
                            offset={6}
                            maxWidth={260}
                            includeScreenReaderContent={false}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedCell(cell)}
                              className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-[2px] border p-0 text-[0.42rem] font-bold leading-none tabular-nums focus:outline-none focus:ring-2 focus:ring-offset-1"
                              style={{
                                ...toneStyles,
                                borderColor: cell.annotations.length > 0 ? toneStyles.color : toneStyles.borderColor,
                                '--tw-ring-color': toneStyles.borderColor,
                                '--tw-ring-offset-color': 'var(--bg-primary)',
                              } as CSSProperties}
                              aria-label={`${cell.rowDisplayName} and ${cell.columnDisplayName}: ${cell.count} shared session${cell.count === 1 ? '' : 's'}. Open pair detail.`}
                            >
                              {cell.count > 0 && cell.count < 10 ? cell.count : ''}
                            </button>
                          </Tooltip>
                        ) : (
                          <span className="inline-flex h-2.5 w-2.5" aria-hidden="true" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="theme-scrollbar overflow-auto rounded-2xl border" style={{ borderColor: 'var(--border-primary)' }}>
          <table className="w-max border-separate border-spacing-0 text-sm">
            <caption className="sr-only">
              Pair meeting counts for each participant pair. The lower triangle contains counts; the diagonal and upper triangle are empty.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-20 min-w-[10rem] border-b px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]"
                  style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}
                >
                  Person
                </th>
                {matrix.participants.map((participant) => (
                  <th
                    key={participant.personId}
                    scope="col"
                    className="top-0 w-12 min-w-12 border-b px-1 py-3 text-center text-xs font-semibold"
                    style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                    title={participant.displayName}
                  >
                    <span className="block max-w-12 truncate">{participant.displayName}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.personId}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b px-3 py-2 text-left font-medium"
                    style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                    title={row.displayName}
                  >
                    <span className="block max-w-[12rem] truncate">{row.displayName}</span>
                  </th>
                  {row.cells.map((cell, columnIndex) => {
                    const participant = matrix.participants[columnIndex];
                    const tone = cell ? getResultsPairMeetingCellTone(cell, matrix.maxCount, sessionCount) : 'neutral';
                    const toneStyles = getToneStyles(tone);

                    return (
                      <td
                        key={`${row.personId}-${participant?.personId ?? columnIndex}`}
                        className="w-12 min-w-12 border-b px-1 py-1 text-center tabular-nums"
                        style={{ borderColor: 'var(--border-primary)' }}
                      >
                        {cell ? (
                          <Tooltip
                            content={() => renderCellTooltipContent(cell, tone)}
                            placement="top"
                            offset={6}
                            maxWidth={360}
                            includeScreenReaderContent={false}
                          >
                            <button
                              type="button"
                              className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-offset-2"
                              style={{
                                ...toneStyles,
                                '--tw-ring-color': toneStyles.borderColor,
                                '--tw-ring-offset-color': 'var(--bg-primary)',
                              } as CSSProperties}
                              aria-label={`${cell.rowDisplayName} and ${cell.columnDisplayName}: ${cell.count} shared session${cell.count === 1 ? '' : 's'}`}
                            >
                              <span>{cell.count}</span>
                              {(() => {
                                const Icon = getPrimaryAnnotationIcon(cell);
                                if (!Icon) {
                                  return null;
                                }

                                return (
                                  <span
                                    className="absolute right-0.5 top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                                    style={{ backgroundColor: 'var(--bg-primary)', color: toneStyles.color }}
                                    aria-hidden="true"
                                  >
                                    <Icon className="h-2.5 w-2.5" />
                                  </span>
                                );
                              })()}
                              {cell.annotations.length > 1 ? (
                                <span
                                  className="absolute bottom-0.5 right-0.5 text-[0.55rem] font-bold leading-none"
                                  style={{ color: toneStyles.color }}
                                  aria-hidden="true"
                                >
                                  +{cell.annotations.length - 1}
                                </span>
                              ) : null}
                            </button>
                          </Tooltip>
                        ) : (
                          <span className="inline-flex h-10 w-10 items-center justify-center" aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedCell ? (
        <ResultsPairMeetingDetailModal
          cell={selectedCell}
          sessionCount={sessionCount}
          maxCount={matrix.maxCount}
          onClose={() => setSelectedCell(null)}
        />
      ) : null}
    </section>
  );
}
