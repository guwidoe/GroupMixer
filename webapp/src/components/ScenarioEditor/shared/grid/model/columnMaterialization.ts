import type {
  ScenarioDataGridColumn,
  ScenarioDataGridCustomColumn,
  ScenarioDataGridEnumColumn,
  ScenarioDataGridOption,
  ScenarioDataGridPrimitiveColumn,
  ScenarioDataGridStructuredColumn,
} from '../types';

export function isPrimitiveColumn<T>(column: ScenarioDataGridColumn<T>): column is ScenarioDataGridPrimitiveColumn<T> {
  return column.kind === 'primitive';
}

export function isStructuredColumn<T>(column: ScenarioDataGridColumn<T>): column is ScenarioDataGridStructuredColumn<T> {
  return column.kind === 'structured';
}

export function isCustomColumn<T>(column: ScenarioDataGridColumn<T>): column is ScenarioDataGridCustomColumn<T, unknown> {
  return column.kind === 'custom';
}

export type MaterializedScenarioDataGridColumn<T> = Exclude<ScenarioDataGridColumn<T>, ScenarioDataGridStructuredColumn<T>>;

export function getStructuredColumnKeys<T>(column: ScenarioDataGridStructuredColumn<T>, rows: T[]): ScenarioDataGridOption[] {
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

export function materializeStructuredColumn<T>(
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

export function materializeColumns<T>(columns: Array<ScenarioDataGridColumn<T>>, rows: T[]): Array<MaterializedScenarioDataGridColumn<T>> {
  return columns.flatMap((column) => (isStructuredColumn(column) ? materializeStructuredColumn(column, rows) : [column]));
}
