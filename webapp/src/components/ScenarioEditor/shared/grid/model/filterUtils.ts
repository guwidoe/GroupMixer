import type { ScenarioDataGridColumn, ScenarioDataGridNumberRangeValue, ScenarioDataGridOption } from '../types';
import { isCustomColumn, isPrimitiveColumn, type MaterializedScenarioDataGridColumn } from './columnMaterialization';
import { resolvePrimitiveFilter, resolvePrimitiveSearchText } from './primitiveBehavior';

export function normalizeSearchValue(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function matchesQuery<T>(row: T, columns: Array<MaterializedScenarioDataGridColumn<T>>, query: string) {
  const searchValue = normalizeSearchValue(query);
  if (!searchValue) {
    return true;
  }

  return columns.some((column) => {
    const haystack = isPrimitiveColumn(column)
      ? resolvePrimitiveSearchText(column, row)
      : isCustomColumn(column)
        ? column.searchText?.(column.getValue(row), row)
        : column.searchValue?.(row);
    return haystack ? haystack.toLowerCase().includes(searchValue) : false;
  });
}

export function normalizeFilterText(value: string | number | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(' ').toLowerCase();
  }
  return value == null ? '' : String(value).toLowerCase();
}

export function normalizeFilterListValue(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

export function isFilterListValueActive(value: unknown) {
  return normalizeFilterListValue(value).length > 0;
}

export function isNumberRangeFilterActive(value: unknown) {
  const range = (value ?? {}) as ScenarioDataGridNumberRangeValue;
  return Boolean(range.min || range.max);
}

export function getColumnFilterCount<T>(sourceColumn: ScenarioDataGridColumn<T>, value: unknown) {
  const filter = isPrimitiveColumn(sourceColumn) ? resolvePrimitiveFilter(sourceColumn) : sourceColumn.filter;
  if (!filter) {
    return 0;
  }

  if (filter.type === 'numberRange') {
    return isNumberRangeFilterActive(value) ? 1 : 0;
  }

  return normalizeFilterListValue(value).length;
}

export function removeFilterListEntry(value: unknown, entryToRemove: string) {
  const nextValue = normalizeFilterListValue(value).filter((entry) => entry !== entryToRemove);
  return nextValue.length > 0 ? nextValue : undefined;
}

export function resolveFilterValue<T>(row: T, column: ScenarioDataGridColumn<T>) {
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
  if (isCustomColumn(column)) {
    return column.getValue(row);
  }
  if (column.sortValue) {
    return column.sortValue(row);
  }
  if (column.searchValue) {
    return column.searchValue(row);
  }
  return undefined;
}

export function resolveFilterOptions<T>(column: ScenarioDataGridColumn<T>, rows: T[]): ScenarioDataGridOption[] {
  const filter = isPrimitiveColumn(column) ? resolvePrimitiveFilter(column) : column.filter;
  if (!filter?.options) {
    return [];
  }
  return typeof filter.options === 'function' ? filter.options(rows) : filter.options;
}

export function resolveFilterOptionLabel<T>(column: ScenarioDataGridColumn<T>, rows: T[], value: string) {
  return resolveFilterOptions(column, rows).find((option) => option.value === value)?.label ?? value;
}
