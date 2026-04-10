import React from 'react';
import type { Table } from '@tanstack/react-table';
import { Button } from '../../../../ui';

interface GridPaginationFooterProps<T> {
  filteredCount: number;
  pageSizeOptions: number[];
  table: Table<T>;
}

export function GridPaginationFooter<T>({ filteredCount, pageSizeOptions, table }: GridPaginationFooterProps<T>) {
  if (filteredCount <= table.getState().pagination.pageSize) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filteredCount)} of {filteredCount} matching rows.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>Rows</span>
          <select className="input h-9 w-24" value={table.getState().pagination.pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))} aria-label="Rows per page">
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</Button>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <Button variant="secondary" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</Button>
        </div>
      </div>
    </div>
  );
}
