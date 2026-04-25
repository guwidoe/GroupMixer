import { useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, Link2, XCircle } from 'lucide-react';
import type {
  ResultsPairMeetingCell,
  ResultsPairMeetingMatrix as ResultsPairMeetingMatrixData,
  ResultsPairMeetingRow,
} from '../../services/results/buildResultsModel';
import {
  buildResultsPairMeetingRows,
  getResultsPairMeetingCellTone,
} from '../../services/results/buildResultsModel';
import { Tooltip } from '../Tooltip';
import {
  ResultsPairMeetingDetailContent,
} from './ResultsPairMeetingDetailContent';
import {
  getPairMeetingToneStyles,
  getPrimaryPairMeetingAnnotationIcon,
} from './pairMeetingDetailUtils';
import {
  ResultsPairMeetingDetailModal,
} from './ResultsPairMeetingDetailModal';

interface ResultsPairMeetingMatrixProps {
  matrix: ResultsPairMeetingMatrixData;
  sessionCount: number;
}

type PairMeetingMatrixDensity = 'auto' | 'detailed' | 'compact' | 'super';

const MATRIX_DENSITY_OPTIONS: Array<{ value: PairMeetingMatrixDensity; label: string }> = [
  { value: 'auto', label: 'Auto fit' },
  { value: 'super', label: 'Super compact' },
  { value: 'compact', label: 'Compact' },
  { value: 'detailed', label: 'Detailed' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getInitialAutoCellSize(participantCount: number): number {
  if (typeof window === 'undefined') {
    return 5;
  }

  const visibleCellCount = Math.max(1, participantCount - 1);
  const rowHeaderWidth = 96;
  const sectionChrome = 160;
  const availableWidth = Math.max(40, window.innerWidth - rowHeaderWidth - sectionChrome);
  const cellSize = Math.floor(availableWidth / visibleCellCount) - 1;

  return clamp(cellSize, 3, 18);
}

export function ResultsPairMeetingMatrix({ matrix, sessionCount }: ResultsPairMeetingMatrixProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [density, setDensity] = useState<PairMeetingMatrixDensity>('auto');
  const [autoCellSize] = useState(() => getInitialAutoCellSize(matrix.participants.length));
  const [selectedCell, setSelectedCell] = useState<ResultsPairMeetingCell | null>(null);
  const compactCellSize = density === 'auto' ? autoCellSize : density === 'super' ? 5 : 10;
  const compactCellStyle = {
    height: compactCellSize,
    width: compactCellSize,
    minWidth: compactCellSize,
    maxWidth: compactCellSize,
  };
  const rows = useMemo<ResultsPairMeetingRow[]>(
    () => (collapsed ? [] : buildResultsPairMeetingRows(matrix)),
    [collapsed, matrix],
  );
  const visibleRows = useMemo(
    () => rows
      .map((row) => ({
        ...row,
        cells: row.cells.filter((cell): cell is ResultsPairMeetingCell => Boolean(cell)),
      }))
      .filter((row) => row.cells.length > 0),
    [rows],
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
              {MATRIX_DENSITY_OPTIONS.map((option) => {
                const active = density === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDensity(option.value)}
                    className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--bg-tertiary)' : 'transparent',
                      color: active ? 'var(--color-accent)' : 'var(--text-secondary)',
                    }}
                    aria-pressed={active}
                  >
                    {option.label}
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
      ) : density !== 'detailed' ? (
        <div className="theme-scrollbar overflow-auto rounded-xl border p-3" style={{ borderColor: 'var(--border-primary)' }}>
          <table className={`w-max border-separate ${density === 'compact' ? 'border-spacing-[2px] text-[10px]' : 'border-spacing-[1px] text-[8px]'}`}>
            <caption className="sr-only">
              {density === 'auto' ? 'Auto fit' : density === 'super' ? 'Super compact' : 'Compact'} pair meeting matrix. Pair cells are rendered as a left-aligned upper triangle; activate a cell for pair details.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={`sticky left-0 top-0 z-20 h-24 align-bottom text-left font-semibold uppercase tracking-[0.08em] ${density === 'compact' ? 'min-w-[8rem] text-[0.65rem]' : 'min-w-[6rem] text-[0.55rem]'}`}
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}
                >
                  Person
                </th>
                {matrix.participants.slice(1).map((participant) => (
                  <th
                    key={participant.personId}
                    scope="col"
                    className="relative h-24 overflow-visible p-0 align-bottom"
                    style={{ ...compactCellStyle, color: 'var(--text-tertiary)' }}
                    title={participant.displayName}
                  >
                    <span className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
                      <span className="origin-bottom rotate-[-90deg] whitespace-nowrap text-[0.55rem] font-semibold">
                        {participant.displayName}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.personId}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 pr-2 text-left font-medium ${density === 'compact' ? 'max-w-[8rem] text-[0.68rem]' : 'max-w-[6rem] text-[0.55rem] leading-[7px]'}`}
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                    title={row.displayName}
                  >
                    <span className="block truncate">{row.displayName}</span>
                  </th>
                  {row.cells.map((cell) => {
                    const tone = getResultsPairMeetingCellTone(cell, matrix.maxCount, sessionCount);
                    const toneStyles = getPairMeetingToneStyles(tone);

                    return (
                      <td
                        key={`${row.personId}-${cell.columnPersonId}`}
                        className="p-0 text-center leading-none"
                        style={compactCellStyle}
                      >
                        <Tooltip
                          content={() => <ResultsPairMeetingDetailContent cell={cell} tone={tone} variant="tooltip" />}
                          placement="top"
                          offset={6}
                          maxWidth={380}
                          includeScreenReaderContent={false}
                        >
                            <button
                              type="button"
                              onClick={() => setSelectedCell(cell)}
                              className={`inline-flex items-center justify-center border p-0 font-bold leading-none tabular-nums focus:outline-none focus:ring-2 focus:ring-offset-1 ${density === 'compact' ? 'rounded-[2px] text-[0.42rem]' : 'rounded-[1px] text-[0]'}`}
                              style={{
                                ...compactCellStyle,
                                ...toneStyles,
                                borderColor: cell.annotations.length > 0 ? toneStyles.color : toneStyles.borderColor,
                                '--tw-ring-color': toneStyles.borderColor,
                              '--tw-ring-offset-color': 'var(--bg-primary)',
                            } as CSSProperties}
                              aria-label={`${cell.rowDisplayName} and ${cell.columnDisplayName}: ${cell.count} shared session${cell.count === 1 ? '' : 's'}. Open pair detail.`}
                            >
                              {density === 'compact' ? cell.count > 0 && cell.count < 10 ? cell.count : '' : ''}
                            </button>
                          </Tooltip>
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
              Pair meeting counts for each participant pair. Pair cells are rendered as a left-aligned upper triangle.
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
                {matrix.participants.slice(1).map((participant) => (
                  <th
                    key={participant.personId}
                    scope="col"
                    className="relative h-32 w-12 min-w-12 border-b px-1 py-2 align-bottom"
                    style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                    title={participant.displayName}
                  >
                    <span className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                      <span className="origin-bottom rotate-[-90deg] whitespace-nowrap text-xs font-semibold">
                        {participant.displayName}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.personId}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b px-3 py-2 text-left font-medium"
                    style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                    title={row.displayName}
                  >
                    <span className="block max-w-[12rem] truncate">{row.displayName}</span>
                  </th>
                  {row.cells.map((cell) => {
                    const tone = getResultsPairMeetingCellTone(cell, matrix.maxCount, sessionCount);
                    const toneStyles = getPairMeetingToneStyles(tone);

                    return (
                      <td
                        key={`${row.personId}-${cell.columnPersonId}`}
                        className="w-12 min-w-12 border-b px-1 py-1 text-center tabular-nums"
                        style={{ borderColor: 'var(--border-primary)' }}
                      >
                        <Tooltip
                          content={() => <ResultsPairMeetingDetailContent cell={cell} tone={tone} variant="tooltip" />}
                          placement="top"
                          offset={6}
                          maxWidth={380}
                          includeScreenReaderContent={false}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedCell(cell)}
                            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-offset-2"
                            style={{
                              ...toneStyles,
                              '--tw-ring-color': toneStyles.borderColor,
                              '--tw-ring-offset-color': 'var(--bg-primary)',
                            } as CSSProperties}
                            aria-label={`${cell.rowDisplayName} and ${cell.columnDisplayName}: ${cell.count} shared session${cell.count === 1 ? '' : 's'}. Open pair detail.`}
                          >
                            <span>{cell.count}</span>
                            {(() => {
                              const Icon = getPrimaryPairMeetingAnnotationIcon(cell);
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
