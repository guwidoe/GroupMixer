import type { ScenarioDataGridColumn } from '../types';
import { isPrimitiveColumn } from './columnMaterialization';
import { resolvePrimitiveFilter } from './primitiveBehavior';

export function estimateHeaderMinWidth<T>(column: ScenarioDataGridColumn<T>) {
  const textWidth = Math.min(220, Math.max(96, column.header.length * 8 + 32));
  const sortAllowance = (isPrimitiveColumn(column) || column.sortValue) ? 24 : 0;
  const filterAllowance = (isPrimitiveColumn(column) ? resolvePrimitiveFilter(column) : column.filter) ? 52 : 0;
  return Math.max(column.minWidth ?? 120, textWidth + sortAllowance + filterAllowance);
}
