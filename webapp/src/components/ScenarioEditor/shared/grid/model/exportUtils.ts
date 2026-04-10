import type { ScenarioDataGridColumn } from '../types';
import { isCustomColumn, isPrimitiveColumn } from './columnMaterialization';
import { resolveFilterValue } from './filterUtils';
import { resolvePrimitiveExportValue } from './primitiveBehavior';
import { formatColumnRawValue } from './rawCodec';

export function normalizeExportValue(value: string | number | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join('; ');
  }
  return value == null ? '' : String(value);
}

export function resolveExportValue<T>(row: T, column: ScenarioDataGridColumn<T>) {
  if ((isPrimitiveColumn(column) && column.rawCodec) || (isCustomColumn(column) && column.rawCodec)) {
    return formatColumnRawValue(row, column);
  }

  if (isPrimitiveColumn(column)) {
    return normalizeExportValue(resolvePrimitiveExportValue(column, row));
  }

  return normalizeExportValue(
    column.exportValue?.(row)
      ?? resolveFilterValue(row, column)
      ?? column.searchValue?.(row),
  );
}
