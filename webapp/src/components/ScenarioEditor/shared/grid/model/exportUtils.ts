import type { ScenarioDataGridColumn } from '../types';
import { isPrimitiveColumn } from './columnMaterialization';
import { resolveFilterValue } from './filterUtils';
import { resolvePrimitiveExportValue } from './primitiveBehavior';

export function normalizeExportValue(value: string | number | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join('; ');
  }
  return value == null ? '' : String(value);
}

export function resolveExportValue<T>(row: T, column: ScenarioDataGridColumn<T>) {
  if (isPrimitiveColumn(column)) {
    return normalizeExportValue(resolvePrimitiveExportValue(column, row));
  }

  return normalizeExportValue(
    column.exportValue?.(row)
      ?? resolveFilterValue(row, column)
      ?? column.searchValue?.(row),
  );
}
