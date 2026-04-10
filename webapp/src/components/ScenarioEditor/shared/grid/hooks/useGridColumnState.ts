import React from 'react';
import type { ColumnFiltersState, ColumnSizingState, VisibilityState } from '@tanstack/react-table';
import { estimateHeaderMinWidth } from '../model/layoutUtils';
import type { MaterializedScenarioDataGridColumn } from '../model/columnMaterialization';

interface UseGridColumnStateArgs<T> {
  columns: Array<MaterializedScenarioDataGridColumn<T>>;
}

export function useGridColumnState<T>({ columns }: UseGridColumnStateArgs<T>) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() =>
    Object.fromEntries(columns.map((column) => [column.id, true])),
  );
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(() =>
    Object.fromEntries(columns.map((column) => [column.id, Math.max(column.width ?? 180, estimateHeaderMinWidth(column))])),
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

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

  return {
    columnFilters,
    columnSizing,
    columnVisibility,
    setColumnFilters,
    setColumnSizing,
    setColumnVisibility,
  };
}
