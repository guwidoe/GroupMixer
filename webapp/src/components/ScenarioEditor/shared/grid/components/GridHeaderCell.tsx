import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Header } from '@tanstack/react-table';
import type { ScenarioDataGridColumn } from '../types';
import { isPrimitiveColumn } from '../model/columnMaterialization';
import { getColumnFilterCount } from '../model/filterUtils';
import { resolvePrimitiveFilter } from '../model/primitiveBehavior';
import { ColumnFilterControl } from './filters/ColumnFilterControl';

interface GridHeaderCellProps<T> {
  activeRows: T[];
  header: Header<T, unknown>;
  isFilterOpen: boolean;
  onCloseFilter: () => void;
  onToggleFilter: () => void;
  onStartResize: (columnId: string, startX: number, startWidth: number) => void;
  sourceColumn?: ScenarioDataGridColumn<T>;
}

function HeaderSortButton({ title, canSort, sorted, onSort }: { title: string; canSort: boolean; sorted: false | 'asc' | 'desc'; onSort: React.MouseEventHandler<HTMLButtonElement> }) {
  if (!canSort) {
    return <span className="block truncate" title={title}>{title}</span>;
  }

  return (
    <button type="button" onClick={onSort} className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[inherit] transition-colors hover:text-[var(--text-primary)]" title={title}>
      <span className="truncate">{title}</span>
      {sorted === 'asc' ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : null}
      {sorted === 'desc' ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : null}
      {sorted === false ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-25" /> : null}
    </button>
  );
}

export function GridHeaderCell<T>({ activeRows, header, isFilterOpen, onCloseFilter, onToggleFilter, onStartResize, sourceColumn }: GridHeaderCellProps<T>) {
  return (
    <th
      key={header.id}
      scope="col"
      className="group sticky top-0 z-10 border-b border-r px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] last:border-r-0"
      style={{ width: header.getSize(), borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
    >
      {header.isPlaceholder ? null : (
        <div className="space-y-2">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <HeaderSortButton title={String(header.column.columnDef.header)} canSort={header.column.getCanSort()} sorted={header.column.getIsSorted()} onSort={header.column.getToggleSortingHandler()} />
            </div>
            {sourceColumn && (isPrimitiveColumn(sourceColumn) ? resolvePrimitiveFilter(sourceColumn) : sourceColumn.filter) ? (
              <ColumnFilterControl
                column={header.column}
                sourceColumn={sourceColumn}
                rows={activeRows}
                isOpen={isFilterOpen}
                activeCount={getColumnFilterCount(sourceColumn, header.column.getFilterValue())}
                onToggle={onToggleFilter}
                onClose={onCloseFilter}
              />
            ) : null}
          </div>
        </div>
      )}
      {sourceColumn ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${sourceColumn.header} column`}
          className="absolute right-0 top-0 h-full w-3 cursor-col-resize"
          onPointerDown={(event) => onStartResize(sourceColumn.id, event.clientX, header.getSize())}
        >
          <div className="mx-auto h-full w-px transition-colors group-hover:bg-[var(--color-accent)]" style={{ backgroundColor: header.column.getIsResizing() ? 'var(--color-accent)' : 'var(--border-primary)' }} />
        </div>
      ) : null}
    </th>
  );
}
