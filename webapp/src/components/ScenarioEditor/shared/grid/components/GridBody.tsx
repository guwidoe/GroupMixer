import React from 'react';
import { flexRender, type Table } from '@tanstack/react-table';
import type { ScenarioDataGridColumn } from '../types';

interface GridBodyProps<T> {
  emptyState?: React.ReactNode;
  onRowOpen?: (row: T) => void;
  rowOpenLabel?: (row: T, rowIndex: number) => string;
  table: Table<T>;
}

function shouldIgnoreRowOpen(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest('button, a, input, select, textarea, summary, [role="button"], [data-grid-row-click-ignore="true"]'));
}

export function GridBody<T>({ emptyState, onRowOpen, rowOpenLabel, table }: GridBodyProps<T>) {
  const paginatedRows = table.getRowModel().rows;

  return (
    <tbody>
      {paginatedRows.length === 0 ? (
        <tr>
          <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-10 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {emptyState ?? 'No matching rows.'}
          </td>
        </tr>
      ) : (
        paginatedRows.map((row, rowIndex) => {
          const baseRowBackground = rowIndex % 2 === 0
            ? 'var(--bg-primary)'
            : 'color-mix(in srgb, var(--bg-secondary) 55%, var(--bg-primary) 45%)';

          return (
          <tr
            key={row.id}
            aria-label={onRowOpen ? rowOpenLabel?.(row.original, rowIndex) : undefined}
            className={[
              'transition-colors',
              onRowOpen
                ? 'cursor-pointer hover:[--grid-row-bg:var(--bg-tertiary)] focus-visible:[--grid-row-bg:var(--bg-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] focus-visible:ring-offset-[-2px]'
                : 'hover:[--grid-row-bg:var(--bg-secondary)]',
            ].join(' ')}
            style={{ '--grid-row-bg': baseRowBackground, backgroundColor: 'var(--grid-row-bg)' } as React.CSSProperties}
            tabIndex={onRowOpen ? 0 : undefined}
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
                    backgroundColor: 'var(--grid-row-bg)',
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
        })
      )}
    </tbody>
  );
}
