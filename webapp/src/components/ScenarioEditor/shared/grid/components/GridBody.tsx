import React from 'react';
import { flexRender, type Row, type Table } from '@tanstack/react-table';
import type { ScenarioDataGridColumn } from '../types';

interface GridBodyProps<T> {
  bottomSpacerHeight?: number;
  emptyState?: React.ReactNode;
  measureRow?: (node: HTMLTableRowElement | null) => void;
  onRowOpen?: (row: T) => void;
  rowOpenLabel?: (row: T, rowIndex: number) => string;
  rows: Row<T>[];
  rowOffset?: number;
  table: Table<T>;
  topSpacerHeight?: number;
}

function shouldIgnoreRowOpen(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest('button, a, input, select, textarea, summary, [role="button"], [data-grid-row-click-ignore="true"]'));
}

export function GridBody<T>({
  bottomSpacerHeight = 0,
  emptyState,
  measureRow,
  onRowOpen,
  rowOpenLabel,
  rows,
  rowOffset = 0,
  table,
  topSpacerHeight = 0,
}: GridBodyProps<T>) {
  const [highlightedRowId, setHighlightedRowId] = React.useState<string | null>(null);
  const visibleColumnCount = table.getVisibleLeafColumns().length;

  return (
    <tbody>
      {rows.length === 0 ? (
        <tr>
          <td colSpan={visibleColumnCount} className="px-4 py-10 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {emptyState ?? 'No matching rows.'}
          </td>
        </tr>
      ) : (
        <>
          {topSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={visibleColumnCount} style={{ border: 'none', height: `${topSpacerHeight}px`, padding: 0 }} />
            </tr>
          ) : null}
          {rows.map((row, rowIndex) => {
            const actualRowIndex = rowOffset + rowIndex;
            const baseRowBackground = actualRowIndex % 2 === 0
            ? 'var(--bg-primary)'
            : 'color-mix(in srgb, var(--bg-secondary) 55%, var(--bg-primary) 45%)';
            const hoverBackground = onRowOpen ? 'var(--bg-tertiary)' : 'var(--bg-secondary)';
            const rowBackground = highlightedRowId === row.id ? hoverBackground : baseRowBackground;

            return (
              <tr
                key={row.id}
                ref={rowIndex === 0 ? measureRow : undefined}
                aria-label={onRowOpen ? rowOpenLabel?.(row.original, actualRowIndex) : undefined}
                className={[
                  'transition-colors',
                  onRowOpen ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] focus-visible:ring-offset-[-2px]' : '',
                ].join(' ')}
                tabIndex={onRowOpen ? 0 : undefined}
                onMouseEnter={() => setHighlightedRowId(row.id)}
                onMouseLeave={() => setHighlightedRowId((current) => (current === row.id ? null : current))}
                onFocus={() => setHighlightedRowId(row.id)}
                onBlur={() => setHighlightedRowId((current) => (current === row.id ? null : current))}
                onClick={onRowOpen ? (event) => {
                  if (shouldIgnoreRowOpen(event.target)) {
                    return;
                  }
                  onRowOpen(row.original);
                } : undefined}
                onKeyDown={onRowOpen ? (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                  }
                  if (shouldIgnoreRowOpen(event.target)) {
                    return;
                  }
                  event.preventDefault();
                  onRowOpen(row.original);
                } : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const columnMeta = cell.column.columnDef.meta as { align?: ScenarioDataGridColumn<T>['align'] } | undefined;
                  const align = columnMeta?.align ?? 'left';
                  return (
                    <td
                      key={cell.id}
                      className="border-b border-r px-4 py-3 align-top transition-colors last:border-r-0"
                      style={{
                        width: cell.column.getSize(),
                        borderColor: 'var(--border-primary)',
                        backgroundColor: rowBackground,
                        color: 'var(--text-secondary)',
                        textAlign: align,
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {bottomSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={visibleColumnCount} style={{ border: 'none', height: `${bottomSpacerHeight}px`, padding: 0 }} />
            </tr>
          ) : null}
        </>
      )}
    </tbody>
  );
}
