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
  ScenarioDataGridEnumColumn,
  ScenarioDataGridPrimitiveColumn,
  ScenarioDataGridStructuredColumn,
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
  workspace?: ScenarioDataGridWorkspaceConfig<T>;
  searchSummary?: (args: { filteredCount: number; totalCount: number; query: string }) => React.ReactNode;
  toolbarActions?: React.ReactNode;
  maxHeight?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
}

function cloneRow<T>(row: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(row);
  }
  return JSON.parse(JSON.stringify(row)) as T;
}

function cloneRows<T>(rows: T[]): T[] {
  return rows.map((row) => cloneRow(row));
}

function isPrimitiveColumn<T>(column: ScenarioDataGridColumn<T>): column is ScenarioDataGridPrimitiveColumn<T> {
  return column.kind === 'primitive';
}

function isStructuredColumn<T>(column: ScenarioDataGridColumn<T>): column is ScenarioDataGridStructuredColumn<T> {
  return column.kind === 'structured';
}

type MaterializedScenarioDataGridColumn<T> = Exclude<ScenarioDataGridColumn<T>, ScenarioDataGridStructuredColumn<T>>;

function getStructuredColumnKeys<T>(column: ScenarioDataGridStructuredColumn<T>, rows: T[]): ScenarioDataGridOption[] {
  const resolved = typeof column.keys === 'function' ? column.keys(rows) : column.keys;
  const seen = new Set<string>();
  return resolved.filter((option) => {
    const key = option.value.trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function materializeStructuredColumn<T>(
  column: ScenarioDataGridStructuredColumn<T>,
  rows: T[],
): MaterializedScenarioDataGridColumn<T>[] {
  return getStructuredColumnKeys(column, rows).map((keyOption) => {
    const childBase = {
      kind: 'primitive' as const,
      id: `${column.id}:${keyOption.value}`,
      header: keyOption.label,
      width: column.childWidth ?? column.width,
      minWidth: column.childMinWidth ?? column.minWidth,
      align: column.align,
      hideable: column.hideable,
      disabled: column.isKeyAvailable
        ? (row: T) => !column.isKeyAvailable?.(row, keyOption.value)
        : undefined,
      getValue: (row: T) => {
        if (column.isKeyAvailable && !column.isKeyAvailable(row, keyOption.value)) {
          return undefined;
        }
        return column.getValue(row, keyOption.value);
      },
      setValue: column.setValue
        ? (row: T, value: string | number | undefined) => column.setValue?.(row, keyOption.value, value)
        : undefined,
      renderValue: column.renderValue
        ? (value: string | number | undefined, row: T) => column.renderValue?.(value, row, keyOption.value)
        : undefined,
      searchText: column.searchText
        ? (value: string | number | undefined, row: T) => column.searchText?.(value, row, keyOption.value)
        : undefined,
      exportValue: column.exportValue
        ? (value: string | number | undefined, row: T) => column.exportValue?.(value, row, keyOption.value)
        : undefined,
      parseValue: column.parseValue
        ? (value: string, row: T) => column.parseValue?.(value, row, keyOption.value)
        : undefined,
      placeholder: typeof column.childPlaceholder === 'function'
        ? column.childPlaceholder(keyOption)
        : column.childPlaceholder,
    };

    if (column.childPrimitive === 'enum') {
      const enumColumn: ScenarioDataGridEnumColumn<T> = {
        ...childBase,
        primitive: 'enum',
        options: typeof column.childOptions === 'function'
          ? (row: T) => column.childOptions({ row, key: keyOption.value })
          : column.childOptions,
      };

      return enumColumn;
    }

    return {
      ...childBase,
      primitive: column.childPrimitive,
    } as MaterializedScenarioDataGridColumn<T>;
  });
}

function materializeColumns<T>(columns: Array<ScenarioDataGridColumn<T>>, rows: T[]): Array<MaterializedScenarioDataGridColumn<T>> {
  return columns.flatMap((column) => (isStructuredColumn(column) ? materializeStructuredColumn(column, rows) : [column]));
}

function getPrimitiveOptions<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T): ScenarioDataGridOption[] {
  if (column.primitive !== 'enum' && column.primitive !== 'array') {
    return [];
  }

  const options = column.options;
  if (!options) {
    return [];
  }

  return typeof options === 'function' ? options(row) : options;
}

function getArrayCsvSeparators<T>(column: ScenarioDataGridPrimitiveColumn<T>) {
  const stableSeparator = column.csv?.separator ?? '|';
  const accepted = column.csv?.acceptedSeparators ?? ['|', ';', ','];
  return {
    stableSeparator,
    acceptedSeparators: Array.from(new Set([stableSeparator, ...accepted])),
  };
}

function normalizePrimitiveText(value: string | number | Array<string | number> | undefined) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(' ');
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

function resolvePrimitiveSortValue<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T) {
  const value = column.getValue(row);
  if (column.sortValue) {
    return column.sortValue(value, row);
  }

  if (column.primitive === 'number') {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  if (column.primitive === 'array') {
    return Array.isArray(value) ? value.length : 0;
  }

  return normalizePrimitiveText(value).toLowerCase();
}

function resolvePrimitiveSearchText<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T) {
  const value = column.getValue(row);
  if (column.searchText) {
    return column.searchText(value, row);
  }

  if (column.primitive === 'array') {
    return Array.isArray(value) ? value.map((entry) => String(entry)).join(' ') : '';
  }

  return normalizePrimitiveText(value);
}

function resolvePrimitiveExportValue<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T) {
  const value = column.getValue(row);
  if (column.exportValue) {
    return column.exportValue(value, row);
  }

  if (column.primitive === 'array') {
    const { stableSeparator } = getArrayCsvSeparators(column);
    return Array.isArray(value) ? value.map((entry) => String(entry)).join(` ${stableSeparator} `) : '';
  }

  return value == null ? '' : value;
}

function renderPrimitiveValue<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T) {
  const value = column.getValue(row);
  if (column.renderValue) {
    return column.renderValue(value, row);
  }

  if (column.primitive === 'array') {
    if (!Array.isArray(value) || value.length === 0) {
      return '—';
    }
    return value.map((entry) => String(entry)).join(', ');
  }

  if (value == null || value === '') {
    return '—';
  }

  return String(value);
}

function resolvePrimitiveFilter<T>(column: ScenarioDataGridPrimitiveColumn<T>): ScenarioDataGridColumn<T>['filter'] {
  if (column.filter) {
    return column.filter;
  }

  if (column.primitive === 'number') {
    return {
      type: 'numberRange',
      ariaLabel: `Filter ${column.header}`,
      getValue: (row) => column.getValue(row) as number | undefined,
    };
  }

  if (column.primitive === 'enum') {
    return {
      type: 'select',
      ariaLabel: `Filter ${column.header}`,
      getValue: (row) => {
        const value = column.getValue(row);
        return value == null ? '' : String(value);
      },
      options: (rows) => {
        const uniqueOptions = new Map<string, ScenarioDataGridOption>();
        rows.forEach((row) => {
          getPrimitiveOptions(column, row).forEach((option) => uniqueOptions.set(option.value, option));
        });
        return Array.from(uniqueOptions.values());
      },
    };
  }

  if (column.primitive === 'array') {
    return {
      type: column.options ? 'select' : 'text',
      ariaLabel: `Filter ${column.header}`,
      getValue: (row) => {
        const value = column.getValue(row);
        if (!Array.isArray(value)) {
          return column.options ? [] : '';
        }
        return column.options ? value.map((entry) => String(entry)) : value.map((entry) => String(entry)).join(' ');
      },
      options: column.options
        ? (rows) => {
            const uniqueOptions = new Map<string, ScenarioDataGridOption>();
            rows.forEach((row) => {
              getPrimitiveOptions(column, row).forEach((option) => uniqueOptions.set(option.value, option));
            });
            return Array.from(uniqueOptions.values());
          }
        : undefined,
    };
  }

  return {
    type: 'text',
    ariaLabel: `Filter ${column.header}`,
  };
}

function parsePrimitiveCsvValue<T>(column: ScenarioDataGridPrimitiveColumn<T>, rawValue: string, row: T) {
  if (column.parseValue) {
    return { value: column.parseValue(rawValue, row) } as const;
  }

  const trimmed = rawValue.trim();

  if (column.primitive === 'string') {
    return { value: trimmed || undefined } as const;
  }

  if (column.primitive === 'number') {
    if (!trimmed) {
      return { value: undefined } as const;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return { error: `Expected a number for ${column.header}, received "${rawValue}".` } as const;
    }
    return { value: parsed } as const;
  }

  if (column.primitive === 'enum') {
    if (!trimmed) {
      return { value: undefined } as const;
    }

    const options = getPrimitiveOptions(column, row);
    const matchingOption = options.find((option) => option.value === trimmed || option.label === trimmed);
    if (!matchingOption) {
      return { error: `Expected one of ${options.map((option) => option.label).join(', ')} for ${column.header}, received "${rawValue}".` } as const;
    }
    return { value: matchingOption.value } as const;
  }

  const { acceptedSeparators } = getArrayCsvSeparators(column);
  const normalized = acceptedSeparators.reduce((current, separator) => current.split(separator).join('|'), rawValue);
  const tokens = normalized
    .split('|')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return { value: [] } as const;
  }

  const options = getPrimitiveOptions(column, row);
    const values = tokens.map((token) => {
    if (options.length > 0) {
      const match = options.find((option) => option.value === token || option.label === token);
      if (!match) {
        return { error: `Expected valid ${column.header} values (${options.map((option) => option.label).join(', ')}), received "${token}".` } as const;
      }
      if (column.itemType === 'number') {
        const parsedOptionValue = Number(match.value);
        if (!Number.isFinite(parsedOptionValue)) {
          return { error: `Expected numeric ${column.header} option values, received "${match.value}".` } as const;
        }
        return { value: parsedOptionValue } as const;
      }
      return { value: match.value } as const;
    }

    if (column.itemType === 'number') {
      const parsed = Number(token);
      if (!Number.isFinite(parsed)) {
        return { error: `Expected numeric ${column.header} entries, received "${token}".` } as const;
      }
      return { value: parsed } as const;
    }

    return { value: token } as const;
  });

  const firstError = values.find((entry) => 'error' in entry);
  if (firstError && 'error' in firstError) {
    return { error: firstError.error } as const;
  }

  return { value: values.map((entry) => ('value' in entry ? entry.value : entry)) as Array<string | number> } as const;
}

function splitCsvRecord(record: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < record.length; index += 1) {
    const char = record[index];
    const next = record[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsvText(text: string) {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      current += char;
      if (inQuotes && next === '"') {
        current += next;
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      if (current.length > 0) {
        rows.push(splitCsvRecord(current));
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    rows.push(splitCsvRecord(current));
  }

  return rows;
}

function normalizeSearchValue(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function matchesQuery<T>(row: T, columns: Array<MaterializedScenarioDataGridColumn<T>>, query: string) {
  const searchValue = normalizeSearchValue(query);
  if (!searchValue) {
    return true;
  }

  return columns.some((column) => {
    const haystack = isPrimitiveColumn(column)
      ? resolvePrimitiveSearchText(column, row)
      : column.searchValue?.(row);
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
  const filter = isPrimitiveColumn(sourceColumn) ? resolvePrimitiveFilter(sourceColumn) : sourceColumn.filter;
  if (!filter) {
    return 0;
  }

  if (filter.type === 'numberRange') {
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
  const sortAllowance = (isPrimitiveColumn(column) || column.sortValue) ? 24 : 0;
  const filterAllowance = (isPrimitiveColumn(column) ? resolvePrimitiveFilter(column) : column.filter) ? 52 : 0;
  return Math.max(column.minWidth ?? 120, textWidth + sortAllowance + filterAllowance);
}

function resolveFilterValue<T>(row: T, column: ScenarioDataGridColumn<T>) {
  if (isPrimitiveColumn(column)) {
    const resolvedFilter = resolvePrimitiveFilter(column);
    if (resolvedFilter?.getValue) {
      return resolvedFilter.getValue(row);
    }
    return column.getValue(row);
  }

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
  const filter = isPrimitiveColumn(column) ? resolvePrimitiveFilter(column) : column.filter;
  if (!filter?.options) {
    return [];
  }
  return typeof filter.options === 'function' ? filter.options(rows) : filter.options;
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
  if (isPrimitiveColumn(column)) {
    return normalizeExportValue(resolvePrimitiveExportValue(column, row));
  }

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
  const filter = isPrimitiveColumn(sourceColumn) ? resolvePrimitiveFilter(sourceColumn) : sourceColumn.filter;
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
  const [draftRows, setDraftRows] = React.useState<T[]>(() => cloneRows(rows));
  const [csvDraftText, setCsvDraftText] = React.useState('');
  const [csvErrors, setCsvErrors] = React.useState<string[]>([]);
  const workspaceMode = workspace?.mode ?? 'browse';
  const rowsForMaterializedColumns = workspace?.draft && workspaceMode !== 'browse' ? draftRows : rows;
  const materializedColumns = React.useMemo(
    () => materializeColumns(columns, rowsForMaterializedColumns),
    [columns, rowsForMaterializedColumns],
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() =>
    Object.fromEntries(materializedColumns.map((column) => [column.id, true])),
  );
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(() =>
    Object.fromEntries(materializedColumns.map((column) => [column.id, Math.max(column.width ?? 180, estimateHeaderMinWidth(column))])),
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

  const hasEditableColumns = React.useMemo(
    () => materializedColumns.some((column) => (isPrimitiveColumn(column) && Boolean(column.setValue)) || ('editor' in column && Boolean(column.editor))),
    [materializedColumns],
  );
  const draftConfig = workspace?.draft;
  const inlineCsvConfig = workspace?.csv;
  const draftEditableColumns = React.useMemo(
    () => materializedColumns.filter((column): column is ScenarioDataGridPrimitiveColumn<T> => isPrimitiveColumn(column) && Boolean(column.setValue)),
    [materializedColumns],
  );
  const hasDraftEditing = Boolean(draftConfig) && draftEditableColumns.length > 0;
  const isInlineCsvMode = workspaceMode === 'csv' && (hasDraftEditing || Boolean(inlineCsvConfig));
  const effectiveEditMode = workspace ? workspaceMode === 'edit' : isEditMode;
  const activeRows = hasDraftEditing && workspaceMode !== 'browse' ? draftRows : rows;
  const resolvedWorkspaceActions = React.useMemo(() => {
    if (!workspace?.toolbarActions) {
      return null;
    }

    return typeof workspace.toolbarActions === 'function'
      ? workspace.toolbarActions(workspaceMode)
      : workspace.toolbarActions;
  }, [workspace, workspaceMode]);
  const buildDraftCsvText = React.useCallback((sourceRows: T[]) => {
    const headerLine = draftEditableColumns.map((column) => escapeCsvValue(column.header)).join(',');
    const rowLines = sourceRows.map((row) =>
      draftEditableColumns
        .map((column) => escapeCsvValue(normalizeExportValue(resolvePrimitiveExportValue(column, row))))
        .join(','),
    );

    return [headerLine, ...rowLines].join('\n');
  }, [draftEditableColumns]);
  const parseDraftCsvText = React.useCallback((text: string, sourceRows: T[]) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return { rows: [] as T[], errors: [] as string[] };
    }

    const records = parseCsvText(trimmed);
    if (records.length === 0) {
      return { rows: [] as T[], errors: [] as string[] };
    }

    const [headerRecord, ...dataRecords] = records;
    const expectedHeaders = draftEditableColumns.map((column) => column.header);
    const actualHeaders = headerRecord.map((cell) => cell.trim());
    if (expectedHeaders.length !== actualHeaders.length || expectedHeaders.some((header, index) => header !== actualHeaders[index])) {
      return {
        rows: sourceRows,
        errors: [`CSV headers must exactly match: ${expectedHeaders.join(', ')}.`],
      };
    }

    const nextRows: T[] = [];
    const errors: string[] = [];

    dataRecords.forEach((record, rowIndex) => {
      let nextRow = rowIndex < sourceRows.length
        ? cloneRow(sourceRows[rowIndex] as T)
        : draftConfig?.createRow
          ? cloneRow(draftConfig.createRow())
          : null;

      if (!nextRow) {
        errors.push(`CSV row ${rowIndex + 2} adds a new row, but this grid has no createRow handler.`);
        return;
      }

      draftEditableColumns.forEach((column, columnIndex) => {
        const rawValue = record[columnIndex] ?? '';
        const parsed = parsePrimitiveCsvValue(column, rawValue, nextRow as T);
        if ('error' in parsed) {
          errors.push(`Row ${rowIndex + 2}, ${column.header}: ${parsed.error}`);
          return;
        }

        nextRow = column.setValue ? column.setValue(nextRow as T, parsed.value) : nextRow;
      });

      if (nextRow) {
        nextRows.push(nextRow as T);
      }
    });

    return {
      rows: errors.length > 0 ? sourceRows : nextRows,
      errors,
    };
  }, [draftConfig, draftEditableColumns]);
  const requestWorkspaceMode = React.useCallback((nextMode: 'browse' | 'edit' | 'csv') => {
    if (!workspace?.onModeChange) {
      return;
    }

    if (!hasDraftEditing) {
      workspace.onModeChange(nextMode);
      return;
    }

    if (nextMode === 'browse') {
      setDraftRows(cloneRows(rows));
      setCsvDraftText('');
      setCsvErrors([]);
      workspace.onModeChange('browse');
      return;
    }

    if (workspaceMode === 'csv') {
      const parsed = parseDraftCsvText(csvDraftText, draftRows);
      if (parsed.errors.length > 0) {
        setCsvErrors(parsed.errors);
        return;
      }
      setDraftRows(parsed.rows);
      setCsvErrors([]);
      if (nextMode === 'edit') {
        workspace.onModeChange('edit');
        return;
      }
      setCsvDraftText(buildDraftCsvText(parsed.rows));
      workspace.onModeChange('csv');
      return;
    }

    if (nextMode === 'edit') {
      setDraftRows(cloneRows(rows));
      setCsvErrors([]);
      workspace.onModeChange('edit');
      return;
    }

    const nextDraftRows = cloneRows(rows);
    setDraftRows(nextDraftRows);
    setCsvDraftText(buildDraftCsvText(nextDraftRows));
    setCsvErrors([]);
    workspace.onModeChange('csv');
  }, [buildDraftCsvText, csvDraftText, draftRows, hasDraftEditing, parseDraftCsvText, rows, workspace, workspaceMode]);
  const handleApplyDraftChanges = React.useCallback(() => {
    if (!draftConfig) {
      return;
    }

    if (workspaceMode === 'csv') {
      const parsed = parseDraftCsvText(csvDraftText, draftRows);
      if (parsed.errors.length > 0) {
        setCsvErrors(parsed.errors);
        return;
      }
      draftConfig.onApply(parsed.rows);
      setDraftRows(cloneRows(parsed.rows));
      setCsvErrors([]);
      workspace?.onModeChange('browse');
      return;
    }

    draftConfig.onApply(draftRows);
    setCsvErrors([]);
    workspace?.onModeChange('browse');
  }, [csvDraftText, draftConfig, draftRows, parseDraftCsvText, workspace, workspaceMode]);
  const handleAddDraftRow = React.useCallback(() => {
    if (!draftConfig?.createRow) {
      return;
    }

    setDraftRows((current) => [...current, cloneRow(draftConfig.createRow!())]);
  }, [draftConfig]);
  const mergedQuery = React.useMemo(
    () => [filterQuery, globalFilter].filter((value) => value.trim().length > 0).join(' ').trim(),
    [filterQuery, globalFilter],
  );

  React.useEffect(() => {
    setColumnVisibility((current) => {
      const next = { ...current };
      let changed = false;
      for (const column of materializedColumns) {
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
      for (const column of materializedColumns) {
        if (!(column.id in next)) {
          next[column.id] = Math.max(column.width ?? 180, estimateHeaderMinWidth(column));
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [materializedColumns]);

  React.useEffect(() => {
    if (!hasDraftEditing || workspaceMode !== 'browse') {
      return;
    }

    setDraftRows(cloneRows(rows));
    setCsvDraftText('');
    setCsvErrors([]);
  }, [hasDraftEditing, rows, workspaceMode]);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const sourceColumn = materializedColumns.find((column) => column.id === resizeState.columnId);
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
  }, [materializedColumns]);

  const tableColumns = React.useMemo<ColumnDef<T>[]>(
    () =>
      materializedColumns.map((column) => ({
        id: column.id,
        header: column.header,
        accessorFn: (row) => {
          if (isPrimitiveColumn(column)) {
            return resolvePrimitiveSortValue(column, row);
          }
          if (column.sortValue) {
            return column.sortValue(row);
          }
          if (column.searchValue) {
            return column.searchValue(row);
          }
          return '';
        },
        enableSorting: isPrimitiveColumn(column) || Boolean(column.sortValue),
        enableColumnFilter: Boolean(isPrimitiveColumn(column) ? resolvePrimitiveFilter(column) : column.filter),
        enableHiding: column.hideable !== false,
        size: Math.max(column.width ?? 180, estimateHeaderMinWidth(column)),
        minSize: estimateHeaderMinWidth(column),
        meta: {
          align: column.align ?? 'left',
          sourceColumn: column,
        },
        filterFn: (row, _columnId, filterValue) => {
          const filter = isPrimitiveColumn(column) ? resolvePrimitiveFilter(column) : column.filter;
          if (!filter) {
            return true;
          }

          const rowValue = resolveFilterValue(row.original, column);

          if (filter.type === 'text') {
            const queries = normalizeFilterListValue(filterValue).map((value) => normalizeSearchValue(value));
            return queries.length === 0 || queries.some((query) => normalizeFilterText(rowValue).includes(query));
          }

          if (filter.type === 'select') {
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
        cell: ({ row }) => {
          if (effectiveEditMode && isPrimitiveColumn(column) && column.setValue) {
            const editor: ScenarioDataGridColumnEditor<T> = {
              type: column.primitive === 'number'
                ? 'number'
                : column.primitive === 'enum'
                  ? 'select'
                  : column.primitive === 'array' && column.options
                    ? 'multiselect'
                    : 'text',
              getValue: (targetRow) => {
                const value = column.getValue(targetRow);
                if (column.primitive === 'array') {
                  if (column.options) {
                    return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
                  }
                  const { stableSeparator } = getArrayCsvSeparators(column);
                  return Array.isArray(value) ? value.map((entry) => String(entry)).join(` ${stableSeparator} `) : '';
                }
                return value == null ? '' : String(value);
              },
              onCommit: (targetRow, nextValue) => {
                const parsed = Array.isArray(nextValue)
                  ? parsePrimitiveCsvValue(column, nextValue.join('|'), targetRow)
                  : parsePrimitiveCsvValue(column, String(nextValue), targetRow);
                if ('error' in parsed) {
                  return;
                }

                setDraftRows((current) => current.map((candidate) => (
                  candidate === targetRow && column.setValue
                    ? column.setValue(candidate, parsed.value)
                    : candidate
                )));
              },
              options: column.primitive === 'enum' || (column.primitive === 'array' && column.options)
                ? (targetRow) => getPrimitiveOptions(column, targetRow)
                : undefined,
              ariaLabel: (targetRow) => `Edit ${column.header} for row ${rowKey(targetRow, row.index)}`,
              placeholder: 'placeholder' in column ? column.placeholder : undefined,
              disabled: column.disabled,
            };

            return <InlineEditorCell row={row.original} editor={editor} />;
          }

          if (effectiveEditMode && 'editor' in column && column.editor) {
            return <InlineEditorCell row={row.original} editor={column.editor} />;
          }

          if (isPrimitiveColumn(column)) {
            return renderPrimitiveValue(column, row.original);
          }

          return column.cell(row.original);
        },
      })),
    [effectiveEditMode, materializedColumns, rowKey],
  );

  const globalFilterFn = React.useCallback<FilterFn<T>>(
    (row: Row<T>, _columnId: string, filterValue: string) => matchesQuery(row.original, materializedColumns, String(filterValue ?? '')),
    [materializedColumns],
  );

  const table = useReactTable({
    data: activeRows,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility,
      columnSizing,
      columnFilters,
      globalFilter: mergedQuery,
    },
    meta: {
      columns: materializedColumns,
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
  }, [activeRows, columnSizing, columnVisibility, sorting, mergedQuery]);

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
  const totalCount = activeRows.length;
  const paginatedRows = table.getRowModel().rows;
  const exportRows = table.getPrePaginationRowModel().rows;
  const csvColumns = table.getVisibleLeafColumns()
    .map((column) => {
      const sourceColumn = (column.columnDef.meta as { sourceColumn?: ScenarioDataGridColumn<T> } | undefined)?.sourceColumn;
      return sourceColumn ? { id: column.id, header: sourceColumn.header, sourceColumn } : null;
    })
    .filter(Boolean) as Array<{ id: string; header: string; sourceColumn: ScenarioDataGridColumn<T> }>;
  const hasDraftCsvColumns = draftEditableColumns.length > 0;
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
    const sourceColumn = materializedColumns.find((candidate) => candidate.id === filterState.id);
    const sourceFilter = sourceColumn ? (isPrimitiveColumn(sourceColumn) ? resolvePrimitiveFilter(sourceColumn) : sourceColumn.filter) : undefined;
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
      valueLabel: sourceFilter.type === 'select' ? resolveFilterOptionLabel(sourceColumn, activeRows, entry) : entry,
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
  const toolbarSummary = isInlineCsvMode
    ? (hasDraftEditing ? (draftConfig?.csv?.helperText ?? summary) : (inlineCsvConfig?.helperText ?? summary))
    : summary;
  const showToolbarSearch = showGlobalSearch && !isInlineCsvMode;
  const handleToggleCsv = React.useCallback(() => {
    if (workspace?.onModeChange && (hasDraftEditing || inlineCsvConfig)) {
      requestWorkspaceMode(isInlineCsvMode ? 'browse' : 'csv');
      return;
    }

    setIsCsvPreviewOpen(true);
  }, [hasDraftEditing, inlineCsvConfig, isInlineCsvMode, requestWorkspaceMode, workspace]);
  const handleToggleEdit = React.useCallback(() => {
    if (workspace?.onModeChange) {
      requestWorkspaceMode(effectiveEditMode ? 'browse' : 'edit');
      return;
    }

    setIsEditMode((current) => !current);
  }, [effectiveEditMode, requestWorkspaceMode, workspace]);

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
          {hasDraftEditing && workspaceMode === 'edit' && draftConfig?.createRow ? (
            <Button variant="secondary" size="sm" leadingIcon={<PencilLine className="h-4 w-4" />} onClick={handleAddDraftRow}>
              Add row
            </Button>
          ) : null}
          {hasDraftEditing && workspaceMode !== 'browse' ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => requestWorkspaceMode('browse')}>
                Discard changes
              </Button>
              <Button variant="primary" size="sm" onClick={handleApplyDraftChanges}>
                Apply changes
              </Button>
            </>
          ) : null}
          {resolvedWorkspaceActions}
          {(showCsvExport && csvColumns.length > 0 && table.getRowModel().rows.length > 0) || inlineCsvConfig || hasDraftCsvColumns ? (
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

      {isInlineCsvMode ? (
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
          <textarea
            value={hasDraftEditing ? csvDraftText : (inlineCsvConfig?.value ?? '')}
            onChange={(event) => {
              if (hasDraftEditing) {
                setCsvDraftText(event.target.value);
                if (csvErrors.length > 0) {
                  setCsvErrors([]);
                }
                return;
              }

              inlineCsvConfig?.onChange(event.target.value);
            }}
            className="min-h-[24rem] w-full rounded-2xl border p-3 font-mono text-sm"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
            aria-label={hasDraftEditing ? (draftConfig?.csv?.ariaLabel ?? 'Inline CSV editor') : (inlineCsvConfig?.ariaLabel ?? 'Inline CSV editor')}
            placeholder={hasDraftEditing ? draftConfig?.csv?.placeholder : inlineCsvConfig?.placeholder}
          />
          {hasDraftEditing && csvErrors.length > 0 ? (
            <div className="mt-3 space-y-2 rounded-2xl border px-3 py-3 text-sm" style={{ borderColor: 'var(--color-danger)', backgroundColor: 'color-mix(in srgb, var(--color-danger) 8%, var(--bg-primary) 92%)', color: 'var(--text-primary)' }}>
              <div className="font-semibold">CSV validation errors</div>
              <ul className="list-disc space-y-1 pl-5">
                {csvErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
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
                            {(isPrimitiveColumn(sourceColumn) ? resolvePrimitiveFilter(sourceColumn) : sourceColumn?.filter) ? (
                              <ColumnFilterControl
                                column={header.column}
                                sourceColumn={sourceColumn}
                                rows={activeRows}
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
