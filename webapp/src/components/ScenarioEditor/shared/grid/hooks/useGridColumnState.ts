import React from 'react';
import type { ColumnFiltersState, ColumnSizingState, VisibilityState } from '@tanstack/react-table';
import { estimateHeaderMinWidth } from '../model/layoutUtils';
import type { MaterializedScenarioDataGridColumn } from '../model/columnMaterialization';

interface UseGridColumnStateArgs<T> {
  columns: Array<MaterializedScenarioDataGridColumn<T>>;
}

export function useGridColumnState<T>({ columns }: UseGridColumnStateArgs<T>) {
  const [columnVisibilityOverrides, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnSizingOverrides, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const columnVisibility = React.useMemo<VisibilityState>(() =>
    Object.fromEntries(
      columns.map((column) => [column.id, columnVisibilityOverrides[column.id] ?? true]),
    ),
  [columns, columnVisibilityOverrides]);

  const columnSizing = React.useMemo<ColumnSizingState>(() =>
    Object.fromEntries(
      columns.map((column) => [
        column.id,
        columnSizingOverrides[column.id] ?? Math.max(column.width ?? 180, estimateHeaderMinWidth(column)),
      ]),
    ),
  [columns, columnSizingOverrides]);

  return {
    columnFilters,
    columnSizing,
    columnVisibility,
    setColumnFilters,
    setColumnSizing,
    setColumnVisibility,
  };
}
