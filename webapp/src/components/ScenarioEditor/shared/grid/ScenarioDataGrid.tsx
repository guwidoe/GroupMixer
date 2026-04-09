import React from 'react';
import { ChevronDown, ChevronUp, Columns3, PencilLine, Search, X } from 'lucide-react';
import { useOutsideClick } from '../../../../hooks';
import { Button } from '../../../ui';
import type { ScenarioDataGridColumn, ScenarioDataGridColumnEditor, ScenarioDataGridOption } from './types';

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

type SortDirection = 'asc' | 'desc';

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
  const [sortState, setSortState] = React.useState<{ columnId: string; direction: SortDirection } | null>(null);
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(columns.map((column) => [column.id, true])),
  );
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((column) => [column.id, column.width ?? 180])),
  );
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = React.useState(false);
  const [localQuery, setLocalQuery] = React.useState('');
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [scrollMetrics, setScrollMetrics] = React.useState({ scrollWidth: 0, clientWidth: 0 });
  const columnMenuRef = React.useRef<HTMLDivElement>(null);
  const resizeStateRef = React.useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const syncingScrollRef = React.useRef<'top' | 'body' | null>(null);

  const hasEditableColumns = React.useMemo(() => columns.some((column) => column.editor), [columns]);

  useOutsideClick({
    refs: [columnMenuRef],
    enabled: isColumnsMenuOpen,
    onOutsideClick: () => setIsColumnsMenuOpen(false),
  });

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

    setColumnWidths((current) => {
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

      const column = columns.find((candidate) => candidate.id === resizeState.columnId);
      const minWidth = column?.minWidth ?? 120;
      const nextWidth = Math.max(minWidth, resizeState.startWidth + (event.clientX - resizeState.startX));
      setColumnWidths((current) => ({
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
  }, [columnWidths, columns, rows]);

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

  const visibleColumns = React.useMemo(
    () => columns.filter((column) => columnVisibility[column.id] !== false),
    [columnVisibility, columns],
  );

  const filteredRows = React.useMemo(() => {
    const externalQuery = normalizeSearchValue(filterQuery);
    const internalQuery = normalizeSearchValue(localQuery);

    return rows.filter((row) => matchesQuery(row, columns, externalQuery) && matchesQuery(row, columns, internalQuery));
  }, [columns, filterQuery, localQuery, rows]);

  const sortedRows = React.useMemo(() => {
    if (!sortState) {
      return filteredRows;
    }

    const sortColumn = columns.find((column) => column.id === sortState.columnId);
    if (!sortColumn?.sortValue) {
      return filteredRows;
    }

    return [...filteredRows].sort((left, right) => {
      const leftValue = sortColumn.sortValue?.(left);
      const rightValue = sortColumn.sortValue?.(right);
      if (leftValue === rightValue) {
        return 0;
      }
      const comparison = leftValue > rightValue ? 1 : -1;
      return sortState.direction === 'asc' ? comparison : -comparison;
    });
  }, [columns, filteredRows, sortState]);

  const gridSummary = searchSummary
    ? searchSummary({ filteredCount: sortedRows.length, totalCount: rows.length, query: localQuery })
    : (
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Showing {sortedRows.length} of {rows.length} rows.
      </div>
    );

  return (
    <div className="space-y-3">
      <div
        className="flex flex-col gap-3 rounded-2xl border px-4 py-3"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <label className="relative block min-w-0 flex-1 md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                value={localQuery}
                onChange={(event) => setLocalQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="input w-full pl-9 pr-10"
                aria-label="Search table"
              />
              {localQuery ? (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5"
                  style={{ color: 'var(--text-tertiary)' }}
                  onClick={() => setLocalQuery('')}
                  aria-label="Clear table search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </label>
            {gridSummary}
          </div>
          <div className="flex flex-wrap items-center gap-2" ref={columnMenuRef}>
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
              {isColumnsMenuOpen ? (
                <div
                  className="absolute right-0 z-20 mt-2 min-w-56 rounded-xl border px-3 py-3 shadow-lg"
                  style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
                >
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                    Visible columns
                  </div>
                  <div className="space-y-2">
                    {columns
                      .filter((column) => column.hideable !== false)
                      .map((column) => (
                        <label key={column.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                          <input
                            type="checkbox"
                            checked={columnVisibility[column.id] !== false}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setColumnVisibility((current) => ({
                                ...current,
                                [column.id]: checked,
                              }));
                            }}
                          />
                          <span>{column.header}</span>
                        </label>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {scrollMetrics.scrollWidth > scrollMetrics.clientWidth ? (
          <div
            ref={topScrollRef}
            className="overflow-x-auto overflow-y-hidden rounded-lg border"
            style={{ borderColor: 'var(--border-primary)' }}
            onScroll={() => syncScroll('top')}
            aria-label="Top horizontal scrollbar"
          >
            <div style={{ width: `${scrollMetrics.scrollWidth}px`, height: '1px' }} />
          </div>
        ) : null}
      </div>

      <div
        ref={bodyScrollRef}
        className="overflow-auto rounded-2xl border"
        style={{ borderColor: 'var(--border-primary)', maxHeight }}
        onScroll={() => syncScroll('body')}
      >
        <table ref={tableRef} className="min-w-full table-fixed border-collapse">
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.id} style={{ width: `${columnWidths[column.id] ?? column.width ?? 180}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleColumns.map((column) => {
                const isSorted = sortState?.columnId === column.id;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    className="group sticky top-0 z-10 border-b border-r px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] last:border-r-0"
                    style={{
                      borderColor: 'var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-2"
                      onClick={() => {
                        if (!column.sortValue) {
                          return;
                        }
                        setSortState((current) => {
                          if (!current || current.columnId !== column.id) {
                            return { columnId: column.id, direction: 'asc' };
                          }
                          return {
                            columnId: column.id,
                            direction: current.direction === 'asc' ? 'desc' : 'asc',
                          };
                        });
                      }}
                    >
                      <span>{column.header}</span>
                      {column.sortValue && isSorted ? (
                        sortState?.direction === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${column.header} column`}
                      className="absolute right-0 top-0 h-full w-3 cursor-col-resize"
                      onPointerDown={(event) => {
                        resizeStateRef.current = {
                          columnId: column.id,
                          startX: event.clientX,
                          startWidth: columnWidths[column.id] ?? column.width ?? 180,
                        };
                      }}
                    >
                      <div
                        className="mx-auto h-full w-px transition-colors group-hover:bg-[var(--color-accent)]"
                        style={{ backgroundColor: 'var(--border-primary)' }}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="px-4 py-6 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {emptyState ?? 'No matching rows.'}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, rowIndex) => {
                const resolvedRowKey = rowKey(row, rowIndex);
                return (
                  <tr
                    key={resolvedRowKey}
                    className="transition-colors hover:bg-[color:var(--bg-secondary)]"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                  >
                    {visibleColumns.map((column) => (
                      <td
                        key={column.id}
                        className="border-b border-r px-4 py-3 align-top text-sm last:border-r-0"
                        style={{
                          borderColor: 'var(--border-primary)',
                          color: 'var(--text-secondary)',
                          textAlign: column.align ?? 'left',
                        }}
                      >
                        {isEditMode && column.editor ? <InlineEditorCell row={row} editor={column.editor} /> : column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
