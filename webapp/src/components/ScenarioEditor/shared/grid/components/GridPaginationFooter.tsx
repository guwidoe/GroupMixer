import React from 'react';
import type { Table } from '@tanstack/react-table';
import { Button } from '../../../../ui';

interface GridPaginationFooterProps<T> {
  filteredCount: number;
  pageSizeOptions: number[];
  table: Table<T>;
}

export function GridPaginationFooter<T>({ filteredCount, pageSizeOptions, table }: GridPaginationFooterProps<T>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const smallestPageSizeOption = pageSizeOptions.length > 0 ? Math.min(...pageSizeOptions) : pageSize;
  const showPageSizeSelector = filteredCount > smallestPageSizeOption;
  const showPager = table.getPageCount() > 1;

  if (!showPageSizeSelector && !showPager) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Showing {pageIndex * pageSize + 1} to {Math.min((pageIndex + 1) * pageSize, filteredCount)} of {filteredCount} matching rows.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {showPageSizeSelector ? (
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span>Rows</span>
            <select className="input h-9 w-24" value={pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))} aria-label="Rows per page">
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        ) : null}
        {showPager ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</Button>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Page {pageIndex + 1} of {table.getPageCount()}
            </div>
            <Button variant="secondary" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
