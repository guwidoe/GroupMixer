import React from 'react';
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { InlineEditorCell } from '../components/editors/InlineEditorCell';
import type { MaterializedScenarioDataGridColumn } from '../model/columnMaterialization';
import { isPrimitiveColumn } from '../model/columnMaterialization';
import { resolveFilterOptionLabel, resolveFilterValue, matchesQuery, normalizeFilterListValue, normalizeFilterText, removeFilterListEntry } from '../model/filterUtils';
import { estimateHeaderMinWidth } from '../model/layoutUtils';
import { getArrayCsvSeparators, getPrimitiveOptions, parsePrimitiveCsvValue, renderPrimitiveValue, resolvePrimitiveFilter, resolvePrimitiveSortValue } from '../model/primitiveBehavior';
import type { ScenarioDataGridColumn, ScenarioDataGridColumnEditor, ScenarioDataGridNumberRangeValue, ScenarioDataGridPrimitiveColumn } from '../types';

interface UseScenarioDataTableArgs<T> {
  activeRows: T[];
  columnFilters: any;
  columnSizing: any;
  columnVisibility: any;
  effectiveEditMode: boolean;
  globalFilter: string;
  materializedColumns: Array<MaterializedScenarioDataGridColumn<T>>;
  pageSize: number;
  rowKey: (row: T, index: number) => string;
  setColumnFilters: (updater: any) => void;
  setColumnSizing: (updater: any) => void;
  setColumnVisibility: (updater: any) => void;
  setDraftRows: React.Dispatch<React.SetStateAction<T[]>>;
  sorting: SortingState;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
}

export function useScenarioDataTable<T>({
  activeRows,
  columnFilters,
  columnSizing,
  columnVisibility,
  effectiveEditMode,
  globalFilter,
  materializedColumns,
  pageSize,
  rowKey,
  setColumnFilters,
  setColumnSizing,
  setColumnVisibility,
  setDraftRows,
  sorting,
  setSorting,
}: UseScenarioDataTableArgs<T>) {
  const tableColumns = React.useMemo<ColumnDef<T>[]>(() =>
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
      meta: { align: column.align ?? 'left', sourceColumn: column },
      filterFn: (row, _columnId, filterValue) => {
        const filter = isPrimitiveColumn(column) ? resolvePrimitiveFilter(column) : column.filter;
        if (!filter) return true;
        const rowValue = resolveFilterValue(row.original, column);
        if (filter.type === 'text') {
          const queries = normalizeFilterListValue(filterValue).map((value) => value.trim().toLowerCase());
          return queries.length === 0 || queries.some((query) => normalizeFilterText(rowValue).includes(query));
        }
        if (filter.type === 'select') {
          const selectedValues = normalizeFilterListValue(filterValue);
          if (selectedValues.length === 0) return true;
          if (Array.isArray(rowValue)) {
            const normalizedRowValues = rowValue.map((value) => String(value));
            return selectedValues.some((value) => normalizedRowValues.includes(value));
          }
          return selectedValues.includes(String(rowValue ?? ''));
        }
        const range = (filterValue ?? {}) as ScenarioDataGridNumberRangeValue;
        const numericValue = typeof rowValue === 'number' ? rowValue : Number(rowValue);
        if (!Number.isFinite(numericValue)) return false;
        const min = range.min == null || range.min === '' ? undefined : Number(range.min);
        const max = range.max == null || range.max === '' ? undefined : Number(range.max);
        if (Number.isFinite(min) && numericValue < (min as number)) return false;
        if (Number.isFinite(max) && numericValue > (max as number)) return false;
        return true;
      },
      cell: ({ row }) => {
        if (effectiveEditMode && isPrimitiveColumn(column) && column.setValue) {
          const editor: ScenarioDataGridColumnEditor<T> = {
            type: column.primitive === 'number' ? 'number' : column.primitive === 'enum' ? 'select' : column.primitive === 'array' && column.options ? 'multiselect' : 'text',
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
              if ('error' in parsed) return;
              setDraftRows((current) => current.map((candidate) => (
                candidate === targetRow && column.setValue ? column.setValue(candidate, parsed.value) : candidate
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
    })), [effectiveEditMode, materializedColumns, rowKey, setDraftRows]);

  const globalFilterFn = React.useCallback<FilterFn<T>>(
    (row: Row<T>, _columnId: string, filterValue: string) => matchesQuery(row.original, materializedColumns, String(filterValue ?? '')),
    [materializedColumns],
  );

  const table = useReactTable({
    data: activeRows,
    columns: tableColumns,
    state: { sorting, columnVisibility, columnSizing, columnFilters, globalFilter },
    meta: { columns: materializedColumns },
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
    initialState: { pagination: { pageSize } },
  });

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

  const activeColumnFilters = table.getState().columnFilters.flatMap((filterState) => {
    const sourceColumn = materializedColumns.find((candidate) => candidate.id === filterState.id);
    const sourceFilter = sourceColumn ? (isPrimitiveColumn(sourceColumn) ? resolvePrimitiveFilter(sourceColumn) : sourceColumn.filter) : undefined;
    if (!sourceColumn || !sourceFilter) return [];
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

  return { activeColumnFilters, csvColumns, exportRows, filteredCount, paginatedRows, table, totalCount };
}
