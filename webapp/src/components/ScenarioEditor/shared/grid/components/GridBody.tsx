import React from 'react';
import { flexRender, type Table } from '@tanstack/react-table';
import type { ScenarioDataGridColumn } from '../types';

interface GridBodyProps<T> {
  emptyState?: React.ReactNode;
  table: Table<T>;
}

export function GridBody<T>({ emptyState, table }: GridBodyProps<T>) {
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
        paginatedRows.map((row, rowIndex) => (
          <tr key={row.id} className="transition-colors hover:bg-[color:var(--bg-secondary)]" style={{ backgroundColor: rowIndex % 2 === 0 ? 'var(--bg-primary)' : 'color-mix(in srgb, var(--bg-secondary) 55%, var(--bg-primary) 45%)' }}>
            {row.getVisibleCells().map((cell) => {
              const columnMeta = cell.column.columnDef.meta as { align?: ScenarioDataGridColumn<T>['align'] } | undefined;
              const align = columnMeta?.align ?? 'left';
              return (
                <td key={cell.id} className="border-b border-r px-4 py-3 align-top last:border-r-0" style={{ width: cell.column.getSize(), borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', textAlign: align }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              );
            })}
          </tr>
        ))
      )}
    </tbody>
  );
}
