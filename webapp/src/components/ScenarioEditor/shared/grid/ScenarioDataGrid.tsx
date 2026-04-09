import React from 'react';
import { ChevronDown, ChevronUp, Columns3 } from 'lucide-react';
import { useOutsideClick } from '../../../../hooks';
import { Button } from '../../../ui';
import type { ScenarioDataGridColumn } from './types';

interface ScenarioDataGridProps<T> {
  rows: T[];
  columns: Array<ScenarioDataGridColumn<T>>;
  rowKey: (row: T, index: number) => string;
  filterQuery?: string;
  emptyState?: React.ReactNode;
}

type SortDirection = 'asc' | 'desc';

export function ScenarioDataGrid<T>({ rows, columns, rowKey, filterQuery = '', emptyState }: ScenarioDataGridProps<T>) {
  const [sortState, setSortState] = React.useState<{ columnId: string; direction: SortDirection } | null>(null);
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(columns.map((column) => [column.id, true])),
  );
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((column) => [column.id, column.width ?? 180])),
  );
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = React.useState(false);
  const columnMenuRef = React.useRef<HTMLDivElement>(null);
  const resizeStateRef = React.useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);

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

  const visibleColumns = React.useMemo(
    () => columns.filter((column) => columnVisibility[column.id] !== false),
    [columnVisibility, columns],
  );

  const filteredRows = React.useMemo(() => {
    const searchValue = filterQuery.trim().toLowerCase();
    if (!searchValue) {
      return rows;
    }

    return rows.filter((row) =>
      columns.some((column) => {
        const haystack = column.searchValue?.(row);
        return haystack ? haystack.toLowerCase().includes(searchValue) : false;
      }),
    );
  }, [columns, filterQuery, rows]);

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

  if (!sortedRows.length) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end" ref={columnMenuRef}>
        <div className="relative">
          <Button variant="secondary" size="sm" leadingIcon={<Columns3 className="h-4 w-4" />} onClick={() => setIsColumnsMenuOpen((open) => !open)}>
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

      <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border-primary)' }}>
        <table className="min-w-full table-fixed border-collapse">
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.id} style={{ width: `${columnWidths[column.id] ?? column.width ?? 180}px` }} />
            ))}
          </colgroup>
          <thead style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <tr>
              {visibleColumns.map((column) => {
                const isSorted = sortState?.columnId === column.id;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    className="relative border-b px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]"
                    style={{ borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}
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
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
                      onPointerDown={(event) => {
                        resizeStateRef.current = {
                          columnId: column.id,
                          startX: event.clientX,
                          startWidth: columnWidths[column.id] ?? column.width ?? 180,
                        };
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <tr key={rowKey(row, rowIndex)} style={{ backgroundColor: 'var(--bg-primary)' }}>
                {visibleColumns.map((column) => (
                  <td
                    key={column.id}
                    className="border-b px-4 py-3 align-top text-sm"
                    style={{
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-secondary)',
                      textAlign: column.align ?? 'left',
                    }}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
