import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  PencilLine,
  Search,
  X,
} from 'lucide-react';
import {
  type Column,
  flexRender,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type FilterFn,
  type Row,
  type SortingState,
  type Table,
  type VisibilityState,
} from '@tanstack/react-table';
import { useOutsideClick } from '../../../../hooks';
import { Button } from '../../../ui';
import type {
  ScenarioDataGridColumn,
  ScenarioDataGridColumnEditor,
  ScenarioDataGridNumberRangeValue,
  ScenarioDataGridOption,
} from './types';

interface ScenarioDataGridProps<T> {
  rows: T[];
  columns: Array<ScenarioDataGridColumn<T>>;
  rowKey: (row: T, index: number) => string;
  filterQuery?: string;
  emptyState?: React.ReactNode;
  searchPlaceholder?: string;
  searchSummary?: (args: { filteredCount: number; totalCount: number; query: string }) => React.ReactNode;
  toolbarActions?: React.ReactNode;
  maxHeight?: string;
}

function normalizeSearchValue(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function matchesQuery<T>(row: T, columns: Array<ScenarioDataGridColumn<T>>, query: string) {
  const searchValue = normalizeSearchValue(query);
  if (!searchValue) {
    return true;
  }

  return columns.some((column) => {
    const haystack = column.searchValue?.(row);
    return haystack ? haystack.toLowerCase().includes(searchValue) : false;
  });
}

function normalizeFilterText(value: string | number | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(' ').toLowerCase();
  }
  return value == null ? '' : String(value).toLowerCase();
}

function resolveFilterValue<T>(row: T, column: ScenarioDataGridColumn<T>) {
  if (column.filter?.getValue) {
    return column.filter.getValue(row);
  }
  if (column.sortValue) {
    return column.sortValue(row);
  }
  if (column.searchValue) {
    return column.searchValue(row);
  }
  return undefined;
}

function resolveFilterOptions<T>(column: ScenarioDataGridColumn<T>, rows: T[]): ScenarioDataGridOption[] {
  if (!column.filter?.options) {
    return [];
  }
  return typeof column.filter.options === 'function' ? column.filter.options(rows) : column.filter.options;
}

function getEditorOptions<T>(editor: ScenarioDataGridColumnEditor<T>, row: T): ScenarioDataGridOption[] {
  if (!editor.options) {
    return [];
  }
  return typeof editor.options === 'function' ? editor.options(row) : editor.options;
}

function InlineEditorCell<T>({ row, editor }: { row: T; editor: ScenarioDataGridColumnEditor<T> }) {
  const resolvedValue = editor.getValue(row);
  const normalizedValue = React.useMemo(() => {
    if (editor.type === 'multiselect') {
      return Array.isArray(resolvedValue) ? resolvedValue.map(String) : [];
    }
    return resolvedValue == null ? '' : String(resolvedValue);
  }, [editor.type, resolvedValue]);

  const [draftValue, setDraftValue] = React.useState<string | string[]>(normalizedValue);

  React.useEffect(() => {
    setDraftValue(normalizedValue);
  }, [normalizedValue]);

  const options = React.useMemo(() => getEditorOptions(editor, row), [editor, row]);
  const ariaLabel = typeof editor.ariaLabel === 'function' ? editor.ariaLabel(row) : editor.ariaLabel;
  const disabled = editor.disabled?.(row) ?? false;

  const commit = React.useCallback(
    (nextValue: string | string[]) => {
      const parsedValue = editor.parseValue ? editor.parseValue(nextValue, row) : nextValue;

      if (Array.isArray(normalizedValue)) {
        const nextList = Array.isArray(nextValue) ? nextValue : [nextValue];
        if (JSON.stringify(normalizedValue) === JSON.stringify(nextList)) {
          return;
        }
      } else if (!Array.isArray(nextValue) && normalizedValue === String(nextValue)) {
        return;
      }

      editor.onCommit(row, parsedValue);
    },
    [editor, normalizedValue, row],
  );

  if (editor.type === 'select') {
    return (
      <select
        aria-label={ariaLabel}
        className="input h-9 min-w-[10rem]"
        disabled={disabled}
        value={typeof draftValue === 'string' ? draftValue : ''}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);
          commit(nextValue);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (editor.type === 'multiselect') {
    return (
      <select
        aria-label={ariaLabel}
        multiple
        size={Math.min(Math.max(options.length, 2), 5)}
        className="input min-w-[12rem] py-2"
        disabled={disabled}
        value={Array.isArray(draftValue) ? draftValue : []}
        onChange={(event) => {
          const nextValues = Array.from(event.target.selectedOptions, (option) => option.value);
          setDraftValue(nextValues);
          commit(nextValues);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      aria-label={ariaLabel}
      className="input h-9 min-w-[10rem]"
      disabled={disabled}
      type={editor.type === 'number' ? 'number' : 'text'}
      placeholder={editor.placeholder}
      value={typeof draftValue === 'string' ? draftValue : ''}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={() => {
        if (typeof draftValue === 'string') {
          commit(draftValue);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && typeof draftValue === 'string') {
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraftValue(normalizedValue);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ScenarioDataGridHeader<T>({
  title,
  canSort,
  sorted,
  onSort,
}: {
  title: string;
  canSort: boolean;
  sorted: false | 'asc' | 'desc';
  onSort: React.MouseEventHandler<HTMLButtonElement>;
}) {
  if (!canSort) {
    return <span>{title}</span>;
  }

  return (
    <button
      type="button"
      onClick={onSort}
      className="inline-flex items-center gap-1.5 font-semibold text-[inherit] transition-colors hover:text-[var(--text-primary)]"
    >
      <span>{title}</span>
      {sorted === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : null}
      {sorted === 'desc' ? <ChevronDown className="h-3.5 w-3.5" /> : null}
      {sorted === false ? <ChevronDown className="h-3.5 w-3.5 opacity-25" /> : null}
    </button>
  );
}

function ColumnVisibilityMenu<T>({
  table,
  onClose,
}: {
  table: Table<T>;
  onClose: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  useOutsideClick({
    refs: [menuRef],
    enabled: true,
    onOutsideClick: onClose,
  });

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full z-30 mt-2 min-w-56 rounded-2xl border p-3 shadow-lg"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
        Visible columns
      </div>
      <div className="space-y-2">
        {table
          .getAllLeafColumns()
          .filter((column) => column.getCanHide())
          .map((column) => {
            const title = String(column.columnDef.header ?? column.id);
            return (
              <label key={column.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={(event) => column.toggleVisibility(event.target.checked)}
                />
                <span>{title}</span>
              </label>
            );
          })}
      </div>
    </div>
  );
}

function ColumnFilterControl<T>({
  column,
  sourceColumn,
  rows,
}: {
  column: Column<T, unknown>;
  sourceColumn: ScenarioDataGridColumn<T>;
  rows: T[];
}) {
  const filter = sourceColumn.filter;
  if (!filter) {
    return null;
  }

  const commonInputClassName = 'input h-8 w-full rounded-lg px-2 text-xs';

  if (filter.type === 'text') {
    return (
      <input
        type="text"
        className={commonInputClassName}
        value={String(column.getFilterValue() ?? '')}
        onChange={(event) => column.setFilterValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        placeholder={filter.placeholder ?? `Filter ${sourceColumn.header.toLowerCase()}…`}
        aria-label={filter.ariaLabel ?? `Filter ${sourceColumn.header}`}
      />
    );
  }

  if (filter.type === 'select') {
    const options = resolveFilterOptions(sourceColumn, rows);
    return (
      <select
        className={commonInputClassName}
        value={String(column.getFilterValue() ?? '')}
        onChange={(event) => column.setFilterValue(event.target.value || undefined)}
        onClick={(event) => event.stopPropagation()}
        aria-label={filter.ariaLabel ?? `Filter ${sourceColumn.header}`}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const rangeValue = (column.getFilterValue() as ScenarioDataGridNumberRangeValue | undefined) ?? {};

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <input
        type="number"
        className={commonInputClassName}
        value={rangeValue.min ?? ''}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => column.setFilterValue({ ...rangeValue, min: event.target.value || undefined })}
        placeholder="Min"
        aria-label={`${filter.ariaLabel ?? sourceColumn.header} minimum`}
      />
      <input
        type="number"
        className={commonInputClassName}
        value={rangeValue.max ?? ''}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => column.setFilterValue({ ...rangeValue, max: event.target.value || undefined })}
        placeholder="Max"
        aria-label={`${filter.ariaLabel ?? sourceColumn.header} maximum`}
      />
    </div>
  );
}

export function ScenarioDataGrid<T>({
  rows,
  columns,
  rowKey,
  filterQuery = '',
  emptyState,
  searchPlaceholder = 'Search table…',
  searchSummary,
  toolbarActions,
  maxHeight = 'min(70vh, calc(100vh - 18rem))',
}: ScenarioDataGridProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() =>
    Object.fromEntries(columns.map((column) => [column.id, true])),
  );
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(() =>
    Object.fromEntries(columns.map((column) => [column.id, column.width ?? 180])),
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = React.useState(false);
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [scrollMetrics, setScrollMetrics] = React.useState({ scrollWidth: 0, clientWidth: 0 });
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const syncingScrollRef = React.useRef<'top' | 'body' | null>(null);
  const resizeStateRef = React.useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);

  const hasEditableColumns = React.useMemo(() => columns.some((column) => column.editor), [columns]);
  const mergedQuery = React.useMemo(
    () => [filterQuery, globalFilter].filter((value) => value.trim().length > 0).join(' ').trim(),
    [filterQuery, globalFilter],
  );

  React.useEffect(() => {
    setColumnVisibility((current) => {
      const next = { ...current };
      let changed = false;
      for (const column of columns) {
        if (!(column.id in next)) {
          next[column.id] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });

    setColumnSizing((current) => {
      const next = { ...current };
      let changed = false;
      for (const column of columns) {
        if (!(column.id in next)) {
          next[column.id] = column.width ?? 180;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [columns]);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const sourceColumn = columns.find((column) => column.id === resizeState.columnId);
      const nextWidth = Math.max(
        sourceColumn?.minWidth ?? 120,
        resizeState.startWidth + (event.clientX - resizeState.startX),
      );

      setColumnSizing((current) => ({
        ...current,
        [resizeState.columnId]: nextWidth,
      }));
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [columns]);

  const tableColumns = React.useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: column.header,
        accessorFn: (row) => {
          if (column.sortValue) {
            return column.sortValue(row);
          }
          if (column.searchValue) {
            return column.searchValue(row);
          }
          return '';
        },
        enableSorting: Boolean(column.sortValue),
        enableColumnFilter: Boolean(column.filter),
        enableHiding: column.hideable !== false,
        size: column.width ?? 180,
        minSize: column.minWidth ?? 120,
        meta: {
          align: column.align ?? 'left',
          sourceColumn: column,
        },
        filterFn: (row, _columnId, filterValue) => {
          if (!column.filter) {
            return true;
          }

          const rowValue = resolveFilterValue(row.original, column);

          if (column.filter.type === 'text') {
            const query = normalizeSearchValue(String(filterValue ?? ''));
            return !query || normalizeFilterText(rowValue).includes(query);
          }

          if (column.filter.type === 'select') {
            return !filterValue || String(rowValue ?? '') === String(filterValue);
          }

          const range = (filterValue ?? {}) as ScenarioDataGridNumberRangeValue;
          const numericValue = typeof rowValue === 'number' ? rowValue : Number(rowValue);
          if (!Number.isFinite(numericValue)) {
            return false;
          }

          const min = range.min == null || range.min === '' ? undefined : Number(range.min);
          const max = range.max == null || range.max === '' ? undefined : Number(range.max);
          if (Number.isFinite(min) && numericValue < (min as number)) {
            return false;
          }
          if (Number.isFinite(max) && numericValue > (max as number)) {
            return false;
          }
          return true;
        },
        cell: ({ row }) =>
          isEditMode && column.editor ? <InlineEditorCell row={row.original} editor={column.editor} /> : column.cell(row.original),
      })),
    [columns, isEditMode],
  );

  const globalFilterFn = React.useCallback<FilterFn<T>>(
    (row: Row<T>, _columnId: string, filterValue: string) => matchesQuery(row.original, columns, String(filterValue ?? '')),
    [columns],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility,
      columnSizing,
      columnFilters,
      globalFilter: mergedQuery,
    },
    meta: {
      columns,
    },
    getRowId: (row, index) => rowKey(row, index),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  React.useEffect(() => {
    const updateScrollMetrics = () => {
      const bodyNode = bodyScrollRef.current;
      const tableNode = tableRef.current;
      if (!bodyNode || !tableNode) {
        return;
      }

      setScrollMetrics({
        scrollWidth: tableNode.scrollWidth,
        clientWidth: bodyNode.clientWidth,
      });
    };

    updateScrollMetrics();

    const tableNode = tableRef.current;
    const bodyNode = bodyScrollRef.current;
    if (typeof ResizeObserver === 'undefined' || !tableNode || !bodyNode) {
      return;
    }

    const observer = new ResizeObserver(updateScrollMetrics);
    observer.observe(tableNode);
    observer.observe(bodyNode);

    return () => observer.disconnect();
  }, [rows, columnSizing, columnVisibility, sorting, mergedQuery]);

  const syncScroll = React.useCallback((source: 'top' | 'body') => {
    const topNode = topScrollRef.current;
    const bodyNode = bodyScrollRef.current;
    if (!topNode || !bodyNode || syncingScrollRef.current === source) {
      return;
    }

    syncingScrollRef.current = source;
    if (source === 'top') {
      bodyNode.scrollLeft = topNode.scrollLeft;
    } else {
      topNode.scrollLeft = bodyNode.scrollLeft;
    }

    window.requestAnimationFrame(() => {
      syncingScrollRef.current = null;
    });
  }, []);

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = rows.length;
  const activeColumnFilters = table.getState().columnFilters.map((filterState) => {
    const sourceColumn = columns.find((candidate) => candidate.id === filterState.id);
    const sourceFilter = sourceColumn?.filter;
    if (!sourceColumn || !sourceFilter) {
      return null;
    }

    let valueLabel = '';
    if (sourceFilter.type === 'numberRange') {
      const range = filterState.value as ScenarioDataGridNumberRangeValue;
      valueLabel = `${range.min ? `≥ ${range.min}` : ''}${range.min && range.max ? ' · ' : ''}${range.max ? `≤ ${range.max}` : ''}`;
    } else {
      valueLabel = String(filterState.value ?? '');
    }

    return {
      id: filterState.id,
      label: sourceColumn.header,
      valueLabel,
    };
  }).filter(Boolean) as Array<{ id: string; label: string; valueLabel: string }>;
  const summary = searchSummary
    ? searchSummary({ filteredCount, totalCount, query: globalFilter })
    : (
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Showing {filteredCount} of {totalCount} rows.
      </div>
    );

  return (
    <div
      className="overflow-hidden rounded-[1.25rem] border shadow-sm"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div
        className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <label className="relative block min-w-0 flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder={searchPlaceholder}
              className="input h-10 w-full rounded-xl pl-9 pr-10"
              aria-label="Search table"
            />
            {globalFilter ? (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5"
                style={{ color: 'var(--text-tertiary)' }}
                onClick={() => setGlobalFilter('')}
                aria-label="Clear table search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
          <div className="min-w-0">{summary}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {toolbarActions}
          {hasEditableColumns ? (
            <Button
              variant={isEditMode ? 'primary' : 'secondary'}
              size="sm"
              leadingIcon={<PencilLine className="h-4 w-4" />}
              onClick={() => setIsEditMode((current) => !current)}
            >
              {isEditMode ? 'Done editing' : 'Edit table'}
            </Button>
          ) : null}
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Columns3 className="h-4 w-4" />}
              onClick={() => setIsColumnsMenuOpen((open) => !open)}
            >
              Columns
            </Button>
            {isColumnsMenuOpen ? <ColumnVisibilityMenu table={table} onClose={() => setIsColumnsMenuOpen(false)} /> : null}
          </div>
        </div>
      </div>

      {activeColumnFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
          <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
            Filters
          </span>
          {activeColumnFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
              onClick={() => table.getColumn(filter.id)?.setFilterValue(undefined)}
            >
              <span>{filter.label}: {filter.valueLabel}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            className="text-xs font-medium underline"
            style={{ color: 'var(--color-accent)' }}
            onClick={() => table.resetColumnFilters()}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {scrollMetrics.scrollWidth > scrollMetrics.clientWidth ? (
        <div
          ref={topScrollRef}
          className="overflow-x-auto overflow-y-hidden border-b"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
          onScroll={() => syncScroll('top')}
          aria-label="Top horizontal scrollbar"
        >
          <div style={{ width: `${scrollMetrics.scrollWidth}px`, height: '10px' }} />
        </div>
      ) : null}

      <div
        ref={bodyScrollRef}
        className="overflow-auto"
        style={{ maxHeight }}
        onScroll={() => syncScroll('body')}
      >
        <table
          ref={tableRef}
          className="w-full border-separate border-spacing-0 text-sm"
          style={{ width: `${table.getTotalSize()}px`, minWidth: '100%' }}
        >
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} style={{ width: `${column.getSize()}px` }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const columnMeta = header.column.columnDef.meta as
                    | { sourceColumn?: ScenarioDataGridColumn<T> }
                    | undefined;
                  const sourceColumn = columnMeta?.sourceColumn;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className="group sticky top-0 z-10 border-b border-r px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] last:border-r-0"
                      style={{
                        width: header.getSize(),
                        borderColor: 'var(--border-primary)',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="space-y-2">
                          <ScenarioDataGridHeader
                            title={String(header.column.columnDef.header)}
                            canSort={header.column.getCanSort()}
                            sorted={header.column.getIsSorted()}
                            onSort={header.column.getToggleSortingHandler()}
                          />
                          {sourceColumn?.filter ? (
                            <div onClick={(event) => event.stopPropagation()}>
                              <ColumnFilterControl column={header.column} sourceColumn={sourceColumn} rows={rows} />
                            </div>
                          ) : null}
                        </div>
                      )}
                      {sourceColumn ? (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${sourceColumn.header} column`}
                          className="absolute right-0 top-0 h-full w-3 cursor-col-resize"
                          onPointerDown={(event) => {
                            resizeStateRef.current = {
                              columnId: sourceColumn.id,
                              startX: event.clientX,
                              startWidth: header.getSize(),
                            };
                          }}
                        >
                          <div
                            className="mx-auto h-full w-px transition-colors group-hover:bg-[var(--color-accent)]"
                            style={{ backgroundColor: header.column.getIsResizing() ? 'var(--color-accent)' : 'var(--border-primary)' }}
                          />
                        </div>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-10 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {emptyState ?? 'No matching rows.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className="transition-colors hover:bg-[color:var(--bg-secondary)]"
                  style={{ backgroundColor: rowIndex % 2 === 0 ? 'var(--bg-primary)' : 'color-mix(in srgb, var(--bg-secondary) 55%, var(--bg-primary) 45%)' }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnMeta = cell.column.columnDef.meta as
                      | { align?: ScenarioDataGridColumn<T>['align'] }
                      | undefined;
                    const align = columnMeta?.align ?? 'left';
                    return (
                      <td
                        key={cell.id}
                        className="border-b border-r px-4 py-3 align-top last:border-r-0"
                        style={{
                          width: cell.column.getSize(),
                          borderColor: 'var(--border-primary)',
                          color: 'var(--text-secondary)',
                          textAlign: align,
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
