import React from 'react';
import type { Table } from '@tanstack/react-table';
import type { ScenarioDataGridColumn } from '../types';
import { GridBody } from './GridBody';
import { GridHeaderCell } from './GridHeaderCell';

interface GridTableProps<T> {
  activeRows: T[];
  bodyScrollRef: React.RefObject<HTMLDivElement | null>;
  emptyState?: React.ReactNode;
  maxHeight: string;
  viewportHeight?: number | null;
  onBodyScroll: () => void;
  onCloseFilter: (columnId: string) => void;
  onRowOpen?: (row: T) => void;
  onStartResize: (columnId: string, startX: number, startWidth: number) => void;
  onToggleFilter: (columnId: string) => void;
  openFilterId: string | null;
  rowOpenLabel?: (row: T, rowIndex: number) => string;
  table: Table<T>;
  tableRef: React.RefObject<HTMLTableElement | null>;
}

export function GridTable<T>({
  activeRows,
  bodyScrollRef,
  emptyState,
  maxHeight,
  viewportHeight,
  onBodyScroll,
  onCloseFilter,
  onRowOpen,
  onStartResize,
  onToggleFilter,
  openFilterId,
  rowOpenLabel,
  table,
  tableRef,
}: GridTableProps<T>) {
  return (
    <div
      ref={bodyScrollRef}
      role="region"
      aria-label="Data grid rows"
      className="overflow-auto"
      style={{
        height: viewportHeight == null ? undefined : `${viewportHeight}px`,
        maxHeight: viewportHeight == null ? maxHeight : 'none',
      }}
      onScroll={onBodyScroll}
    >
      <table ref={tableRef} className="w-full border-separate border-spacing-0 text-sm" style={{ width: `${table.getTotalSize()}px`, minWidth: '100%' }}>
        <colgroup>
          {table.getVisibleLeafColumns().map((column) => (
            <col key={column.id} style={{ width: `${column.getSize()}px` }} />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sourceColumn = (header.column.columnDef.meta as { sourceColumn?: ScenarioDataGridColumn<T> } | undefined)?.sourceColumn;
                return (
                  <GridHeaderCell
                    key={header.id}
                    activeRows={activeRows}
                    header={header}
                    isFilterOpen={Boolean(sourceColumn && openFilterId === sourceColumn.id)}
                    onCloseFilter={() => sourceColumn && onCloseFilter(sourceColumn.id)}
                    onToggleFilter={() => sourceColumn && onToggleFilter(sourceColumn.id)}
                    onStartResize={onStartResize}
                    sourceColumn={sourceColumn}
                  />
                );
              })}
            </tr>
          ))}
        </thead>
        <GridBody table={table} emptyState={emptyState} onRowOpen={onRowOpen} rowOpenLabel={rowOpenLabel} />
      </table>
    </div>
  );
}
