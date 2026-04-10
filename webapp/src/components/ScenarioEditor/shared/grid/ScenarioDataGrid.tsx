import React from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Columns3,
  Download,
  FileSpreadsheet,
  Funnel,
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
  getPaginationRowModel,
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
  ScenarioDataGridWorkspaceConfig,
  ScenarioDataGridNumberRangeValue,
  ScenarioDataGridOption,
  ScenarioDataGridSelectFilterValue,
  ScenarioDataGridTextFilterValue,
} from './types';

interface ScenarioDataGridProps<T> {
  rows: T[];
  columns: Array<ScenarioDataGridColumn<T>>;
  rowKey: (row: T, index: number) => string;
  filterQuery?: string;
  emptyState?: React.ReactNode;
  searchPlaceholder?: string;
  showGlobalSearch?: boolean;
  showCsvExport?: boolean;
  showEditToggle?: boolean;
  defaultEditMode?: boolean;
  workspace?: ScenarioDataGridWorkspaceConfig;
  searchSummary?: (args: { filteredCount: number; totalCount: number; query: string }) => React.ReactNode;
  toolbarActions?: React.ReactNode;
  maxHeight?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
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

function normalizeFilterListValue(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function isFilterListValueActive(value: unknown) {
  return normalizeFilterListValue(value).length > 0;
}

function isNumberRangeFilterActive(value: unknown) {
  const range = (value ?? {}) as ScenarioDataGridNumberRangeValue;
  return Boolean(range.min || range.max);
}

function getColumnFilterCount<T>(sourceColumn: ScenarioDataGridColumn<T>, value: unknown) {
  if (!sourceColumn.filter) {
    return 0;
  }

  if (sourceColumn.filter.type === 'numberRange') {
    return isNumberRangeFilterActive(value) ? 1 : 0;
  }

  return normalizeFilterListValue(value).length;
}

function removeFilterListEntry(value: unknown, entryToRemove: string) {
  const nextValue = normalizeFilterListValue(value).filter((entry) => entry !== entryToRemove);
  return nextValue.length > 0 ? nextValue : undefined;
}

function estimateHeaderMinWidth<T>(column: ScenarioDataGridColumn<T>) {
  const textWidth = Math.min(220, Math.max(96, column.header.length * 8 + 32));
  const sortAllowance = column.sortValue ? 24 : 0;
  const filterAllowance = column.filter ? 52 : 0;
  return Math.max(column.minWidth ?? 120, textWidth + sortAllowance + filterAllowance);
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

function resolveFilterOptionLabel<T>(column: ScenarioDataGridColumn<T>, rows: T[], value: string) {
  return resolveFilterOptions(column, rows).find((option) => option.value === value)?.label ?? value;
}

function normalizeExportValue(value: string | number | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join('; ');
  }
  return value == null ? '' : String(value);
}

function escapeCsvValue(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function resolveExportValue<T>(row: T, column: ScenarioDataGridColumn<T>) {
  return normalizeExportValue(
    column.exportValue?.(row)
      ?? resolveFilterValue(row, column)
      ?? column.searchValue?.(row),
  );
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
    return (
      <span className="block truncate" title={title}>
        {title}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onSort}
      className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[inherit] transition-colors hover:text-[var(--text-primary)]"
      title={title}
    >
      <span className="truncate">{title}</span>
      {sorted === 'asc' ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : null}
      {sorted === 'desc' ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : null}
      {sorted === false ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-25" /> : null}
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
  isOpen,
  onToggle,
  onClose,
}: {
  column: Column<T, unknown>;
  sourceColumn: ScenarioDataGridColumn<T>;
  rows: T[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const filter = sourceColumn.filter;
  if (!filter) {
    return null;
  }

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [draftText, setDraftText] = React.useState('');
  const [optionQuery, setOptionQuery] = React.useState('');
  const [popoverStyle, setPopoverStyle] = React.useState<React.CSSProperties | null>(null);

  useOutsideClick({
    refs: [wrapperRef, popoverRef, triggerRef],
    enabled: isOpen,
    onOutsideClick: () => onClose(),
  });

  React.useEffect(() => {
    if (!isOpen) {
      setDraftText('');
      setOptionQuery('');
      setPopoverStyle(null);
    }
  }, [isOpen]);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePopoverPosition = () => {
      const triggerNode = triggerRef.current;
      if (!triggerNode || typeof window === 'undefined') {
        return;
      }

      const triggerRect = triggerNode.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(320, Math.max(220, viewportWidth - 16));
      const maxLeft = Math.max(8, viewportWidth - width - 8);
      const left = Math.min(Math.max(triggerRect.right - width, 8), maxLeft);
      const measuredHeight = popoverRef.current?.offsetHeight ?? 0;
      const preferredTop = triggerRect.bottom + 8;
      const availableBelow = viewportHeight - preferredTop - 8;
      const shouldPlaceAbove = measuredHeight > 0 && availableBelow < Math.min(measuredHeight, 220) && triggerRect.top - measuredHeight - 8 >= 8;
      const top = shouldPlaceAbove
        ? Math.max(8, triggerRect.top - measuredHeight - 8)
        : Math.min(preferredTop, Math.max(8, viewportHeight - Math.max(measuredHeight, 160) - 8));

      setPopoverStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: `${Math.max(180, viewportHeight - top - 8)}px`,
        zIndex: 80,
      });
    };

    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);

    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [isOpen]);

  const commonInputClassName = 'input h-8 w-full rounded-lg px-2 text-xs';
  const activeCount = getColumnFilterCount(sourceColumn, column.getFilterValue());

  const addTextToken = () => {
    const token = draftText.trim();
    if (!token) {
      return;
    }

    const currentTokens = normalizeFilterListValue(column.getFilterValue());
    const alreadyExists = currentTokens.some((entry) => entry.toLowerCase() === token.toLowerCase());
    if (!alreadyExists) {
      column.setFilterValue([...currentTokens, token] satisfies ScenarioDataGridTextFilterValue);
    }
    setDraftText('');
  };

  const removeTextToken = (token: string) => {
    column.setFilterValue(removeFilterListEntry(column.getFilterValue(), token));
  };

  const toggleSelectedValue = (value: string) => {
    const currentValues = normalizeFilterListValue(column.getFilterValue());
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((entry) => entry !== value)
      : [...currentValues, value];
    column.setFilterValue(nextValues.length > 0 ? (nextValues satisfies ScenarioDataGridSelectFilterValue) : undefined);
  };

  const renderPopoverContent = () => {
    if (filter.type === 'text') {
      const tokens = normalizeFilterListValue(column.getFilterValue());
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
              Contains
            </label>
            <input
              type="text"
              className={commonInputClassName}
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              placeholder={filter.placeholder ?? `Type and press Enter`}
              aria-label={filter.ariaLabel ?? `Filter ${sourceColumn.header}`}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTextToken();
                }
                if (event.key === 'Escape') {
                  onClose();
                }
              }}
            />
          </div>
          {tokens.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                  style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  onClick={() => removeTextToken(token)}
                >
                  <span>{token}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Press Enter to add one or more filter tokens for this column.
            </p>
          )}
        </div>
      );
    }

    if (filter.type === 'select') {
      const selectedValues = normalizeFilterListValue(column.getFilterValue());
      const options = resolveFilterOptions(sourceColumn, rows).filter((option) => {
        const query = normalizeSearchValue(optionQuery);
        if (!query) {
          return true;
        }
        return normalizeSearchValue(option.label).includes(query);
      });

      return (
        <div className="space-y-3">
          <input
            type="text"
            className={commonInputClassName}
            value={optionQuery}
            onChange={(event) => setOptionQuery(event.target.value)}
            placeholder={filter.placeholder ?? 'Search options…'}
            aria-label={filter.ariaLabel ?? `Filter ${sourceColumn.header}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onClose();
              }
            }}
          />
          <div className="max-h-56 space-y-1 overflow-auto rounded-lg border p-1" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
            {options.length > 0 ? options.map((option) => {
              const checked = selectedValues.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-[color:var(--bg-primary)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleSelectedValue(option.value)}
                    aria-label={`${checked ? 'Remove' : 'Add'} ${option.label} filter`}
                  />
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded border"
                    style={{
                      borderColor: checked ? 'var(--color-accent)' : 'var(--border-primary)',
                      backgroundColor: checked ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'transparent',
                      color: checked ? 'var(--color-accent)' : 'transparent',
                    }}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </label>
              );
            }) : (
              <div className="px-2 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                No options match.
              </div>
            )}
          </div>
        </div>
      );
    }

    const rangeValue = (column.getFilterValue() as ScenarioDataGridNumberRangeValue | undefined) ?? {};
    return (
      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="number"
          className={commonInputClassName}
          value={rangeValue.min ?? ''}
          onChange={(event) => column.setFilterValue({ ...rangeValue, min: event.target.value || undefined })}
          placeholder="Min"
          aria-label={`${filter.ariaLabel ?? sourceColumn.header} minimum`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onClose();
            }
          }}
        />
        <input
          type="number"
          className={commonInputClassName}
          value={rangeValue.max ?? ''}
          onChange={(event) => column.setFilterValue({ ...rangeValue, max: event.target.value || undefined })}
          placeholder="Max"
          aria-label={`${filter.ariaLabel ?? sourceColumn.header} maximum`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onClose();
            }
          }}
        />
      </div>
    );
  };

  return (
    <div ref={wrapperRef} className="relative flex items-center justify-end">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors hover:border-[var(--color-accent)] hover:text-[var(--text-primary)]"
        style={{
          borderColor: activeCount > 0 ? 'var(--color-accent)' : 'var(--border-primary)',
          backgroundColor: isOpen ? 'var(--bg-primary)' : 'transparent',
          color: activeCount > 0 ? 'var(--color-accent)' : 'var(--text-tertiary)',
        }}
        aria-label={`${isOpen ? 'Close' : 'Open'} filter for ${sourceColumn.header}`}
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <Funnel className="h-3.5 w-3.5" />
        {activeCount > 0 ? <span>{activeCount}</span> : null}
      </button>

      {isOpen && typeof document !== 'undefined' ? createPortal(
        <div
          ref={popoverRef}
          className="overflow-auto rounded-2xl border p-3 shadow-xl"
          style={{
            ...popoverStyle,
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
                {sourceColumn.header} filter
              </div>
            </div>
            {activeCount > 0 ? (
              <button
                type="button"
                className="text-xs font-medium underline"
                style={{ color: 'var(--color-accent)' }}
                onClick={() => column.setFilterValue(undefined)}
              >
                Clear
              </button>
            ) : null}
          </div>
          {renderPopoverContent()}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function CsvPreviewDialog({
  csvText,
  rowCount,
  onClose,
}: {
  csvText: string;
  rowCount: number;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDownload = () => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scenario-grid.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(csvText);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-4xl rounded-2xl border p-5 shadow-xl" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>CSV preview</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Previewing {rowCount} filtered row{rowCount === 1 ? '' : 's'} using the currently visible columns.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close CSV preview">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <textarea
          readOnly
          value={csvText}
          className="mt-4 min-h-[22rem] w-full rounded-xl border p-3 font-mono text-xs"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          aria-label="CSV preview content"
        />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => void handleCopy()} leadingIcon={<Copy className="h-4 w-4" />}>
            Copy CSV
          </Button>
          <Button variant="secondary" onClick={handleDownload} leadingIcon={<Download className="h-4 w-4" />}>
            Download CSV
          </Button>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
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
  showGlobalSearch = true,
  showCsvExport = true,
  showEditToggle = true,
  defaultEditMode = false,
  workspace,
  searchSummary,
  toolbarActions,
  maxHeight = 'min(70vh, calc(100vh - 18rem))',
  pageSize = 100,
  pageSizeOptions = [50, 100, 250, 500],
}: ScenarioDataGridProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() =>
    Object.fromEntries(columns.map((column) => [column.id, true])),
  );
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(() =>
    Object.fromEntries(columns.map((column) => [column.id, Math.max(column.width ?? 180, estimateHeaderMinWidth(column))])),
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [openFilterId, setOpenFilterId] = React.useState<string | null>(null);
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = React.useState(false);
  const [isEditMode, setIsEditMode] = React.useState(defaultEditMode);
  const [isCsvPreviewOpen, setIsCsvPreviewOpen] = React.useState(false);
  const [scrollMetrics, setScrollMetrics] = React.useState({ scrollWidth: 0, clientWidth: 0 });
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  const syncingScrollRef = React.useRef<'top' | 'body' | null>(null);
  const resizeStateRef = React.useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);

  const hasEditableColumns = React.useMemo(() => columns.some((column) => column.editor), [columns]);
  const workspaceMode = workspace?.mode ?? 'browse';
  const inlineCsvConfig = workspace?.csv;
  const isInlineCsvMode = workspaceMode === 'csv' && Boolean(inlineCsvConfig);
  const effectiveEditMode = workspace ? workspaceMode === 'edit' : isEditMode;
  const resolvedWorkspaceActions = React.useMemo(() => {
    if (!workspace?.toolbarActions) {
      return null;
    }

    return typeof workspace.toolbarActions === 'function'
      ? workspace.toolbarActions(workspaceMode)
      : workspace.toolbarActions;
  }, [workspace, workspaceMode]);
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
          next[column.id] = Math.max(column.width ?? 180, estimateHeaderMinWidth(column));
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
        sourceColumn ? estimateHeaderMinWidth(sourceColumn) : 120,
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
        size: Math.max(column.width ?? 180, estimateHeaderMinWidth(column)),
        minSize: estimateHeaderMinWidth(column),
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
            const queries = normalizeFilterListValue(filterValue).map((value) => normalizeSearchValue(value));
            return queries.length === 0 || queries.some((query) => normalizeFilterText(rowValue).includes(query));
          }

          if (column.filter.type === 'select') {
            const selectedValues = normalizeFilterListValue(filterValue);
            if (selectedValues.length === 0) {
              return true;
            }

            if (Array.isArray(rowValue)) {
              const normalizedRowValues = rowValue.map((value) => String(value));
              return selectedValues.some((value) => normalizedRowValues.includes(value));
            }

            return selectedValues.includes(String(rowValue ?? ''));
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
          effectiveEditMode && column.editor ? <InlineEditorCell row={row.original} editor={column.editor} /> : column.cell(row.original),
      })),
    [columns, effectiveEditMode],
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
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize,
      },
    },
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
  const paginatedRows = table.getRowModel().rows;
  const exportRows = table.getPrePaginationRowModel().rows;
  const csvColumns = table.getVisibleLeafColumns()
    .map((column) => {
      const sourceColumn = (column.columnDef.meta as { sourceColumn?: ScenarioDataGridColumn<T> } | undefined)?.sourceColumn;
      return sourceColumn ? { id: column.id, header: sourceColumn.header, sourceColumn } : null;
    })
    .filter(Boolean) as Array<{ id: string; header: string; sourceColumn: ScenarioDataGridColumn<T> }>;
  const csvText = React.useMemo(() => {
    const headerLine = csvColumns.map((column) => escapeCsvValue(column.header)).join(',');
    const rowLines = exportRows.map((row) =>
      csvColumns
        .map((column) => escapeCsvValue(resolveExportValue(row.original, column.sourceColumn)))
        .join(','),
    );
    return [headerLine, ...rowLines].join('\n');
  }, [csvColumns, exportRows]);
  const activeColumnFilters = table.getState().columnFilters.flatMap((filterState) => {
    const sourceColumn = columns.find((candidate) => candidate.id === filterState.id);
    const sourceFilter = sourceColumn?.filter;
    if (!sourceColumn || !sourceFilter) {
      return [];
    }

    if (sourceFilter.type === 'numberRange') {
      const range = filterState.value as ScenarioDataGridNumberRangeValue;
      return [{
        id: filterState.id,
        filterId: filterState.id,
        label: sourceColumn.header,
        valueLabel: `${range.min ? `≥ ${range.min}` : ''}${range.min && range.max ? ' · ' : ''}${range.max ? `≤ ${range.max}` : ''}`,
        onRemove: () => table.getColumn(filterState.id)?.setFilterValue(undefined),
      }];
    }

    return normalizeFilterListValue(filterState.value).map((entry) => ({
      id: `${filterState.id}:${entry}`,
      filterId: filterState.id,
      label: sourceColumn.header,
      valueLabel: sourceFilter.type === 'select' ? resolveFilterOptionLabel(sourceColumn, rows, entry) : entry,
      onRemove: () => table.getColumn(filterState.id)?.setFilterValue(removeFilterListEntry(filterState.value, entry)),
    }));
  });
  const summary = searchSummary
    ? searchSummary({ filteredCount, totalCount, query: globalFilter })
    : (
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Showing {filteredCount} of {totalCount} rows.
      </div>
    );
  const toolbarSummary = isInlineCsvMode && inlineCsvConfig?.helperText ? inlineCsvConfig.helperText : summary;
  const showToolbarSearch = showGlobalSearch && !isInlineCsvMode;
  const handleToggleCsv = React.useCallback(() => {
    if (inlineCsvConfig && workspace?.onModeChange) {
      workspace.onModeChange(isInlineCsvMode ? 'browse' : 'csv');
      return;
    }

    setIsCsvPreviewOpen(true);
  }, [inlineCsvConfig, isInlineCsvMode, workspace]);
  const handleToggleEdit = React.useCallback(() => {
    if (workspace?.onModeChange) {
      workspace.onModeChange(effectiveEditMode ? 'browse' : 'edit');
      return;
    }

    setIsEditMode((current) => !current);
  }, [effectiveEditMode, workspace]);

  return (
    <div
      className="overflow-hidden rounded-[1.25rem] border shadow-sm"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div
        className={`flex border-b px-4 ${showGlobalSearch ? 'py-3' : 'py-2.5'} flex-col gap-3 lg:flex-row lg:items-center lg:justify-between`}
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
      >
        <div className={`flex min-w-0 flex-1 ${showToolbarSearch ? 'flex-col gap-3 lg:flex-row lg:items-center lg:gap-4' : 'items-center'}`}>
          {showToolbarSearch ? (
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
          ) : null}
          <div className="min-w-0">{toolbarSummary}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {toolbarActions}
          {resolvedWorkspaceActions}
          {(showCsvExport && csvColumns.length > 0 && table.getRowModel().rows.length > 0) || inlineCsvConfig ? (
            <Button
              variant={isInlineCsvMode ? 'primary' : 'secondary'}
              size="sm"
              leadingIcon={<FileSpreadsheet className="h-4 w-4" />}
              onClick={handleToggleCsv}
            >
              {workspace?.csvLabel ?? 'CSV'}
            </Button>
          ) : null}
          {showEditToggle && hasEditableColumns ? (
            <Button
              variant={effectiveEditMode ? 'primary' : 'secondary'}
              size="sm"
              leadingIcon={<PencilLine className="h-4 w-4" />}
              onClick={handleToggleEdit}
            >
              {effectiveEditMode ? (workspace?.doneEditingLabel ?? 'Done editing') : (workspace?.editLabel ?? 'Edit table')}
            </Button>
          ) : null}
          {!isInlineCsvMode ? (
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
          ) : null}
        </div>
      </div>

      {!isInlineCsvMode && activeColumnFilters.length > 0 ? (
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
              onClick={filter.onRemove}
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

      {!isInlineCsvMode && scrollMetrics.scrollWidth > scrollMetrics.clientWidth ? (
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

      {isCsvPreviewOpen ? (
        <CsvPreviewDialog csvText={csvText} rowCount={exportRows.length} onClose={() => setIsCsvPreviewOpen(false)} />
      ) : null}

      {isInlineCsvMode && inlineCsvConfig ? (
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
          <textarea
            value={inlineCsvConfig.value}
            onChange={(event) => inlineCsvConfig.onChange(event.target.value)}
            className="min-h-[24rem] w-full rounded-2xl border p-3 font-mono text-sm"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
            aria-label={inlineCsvConfig.ariaLabel ?? 'Inline CSV editor'}
            placeholder={inlineCsvConfig.placeholder}
          />
        </div>
      ) : (
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
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <ScenarioDataGridHeader
                                title={String(header.column.columnDef.header)}
                                canSort={header.column.getCanSort()}
                                sorted={header.column.getIsSorted()}
                                onSort={header.column.getToggleSortingHandler()}
                              />
                            </div>
                            {sourceColumn?.filter ? (
                              <ColumnFilterControl
                                column={header.column}
                                sourceColumn={sourceColumn}
                                rows={rows}
                                isOpen={openFilterId === sourceColumn.id}
                                onToggle={() => setOpenFilterId((current) => current === sourceColumn.id ? null : sourceColumn.id)}
                                onClose={() => setOpenFilterId((current) => current === sourceColumn.id ? null : current)}
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
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-10 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {emptyState ?? 'No matching rows.'}
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, rowIndex) => (
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
      )}

      {!isInlineCsvMode && filteredCount > pageSize ? (
        <div className="flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            {' '}to{' '}
            {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filteredCount)} of {filteredCount} matching rows.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>Rows</span>
              <select
                className="input h-9 w-24"
                value={table.getState().pagination.pageSize}
                onChange={(event) => table.setPageSize(Number(event.target.value))}
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                Previous
              </Button>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </div>
              <Button variant="secondary" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
