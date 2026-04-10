import type {
  ScenarioDataGridColumn,
  ScenarioDataGridOption,
  ScenarioDataGridPrimitiveColumn,
} from '../types';

export function getPrimitiveOptions<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T): ScenarioDataGridOption[] {
  if (column.primitive !== 'enum' && column.primitive !== 'array') {
    return [];
  }

  const options = column.options;
  if (!options) {
    return [];
  }

  return typeof options === 'function' ? options(row) : options;
}

export function getArrayCsvSeparators<T>(column: ScenarioDataGridPrimitiveColumn<T>) {
  const stableSeparator = column.csv?.separator ?? '|';
  const accepted = column.csv?.acceptedSeparators ?? ['|', ';', ','];
  return {
    stableSeparator,
    acceptedSeparators: Array.from(new Set([stableSeparator, ...accepted])),
  };
}

export function normalizePrimitiveText(value: string | number | Array<string | number> | undefined) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(' ');
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

export function resolvePrimitiveSortValue<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T) {
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

export function resolvePrimitiveSearchText<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T) {
  const value = column.getValue(row);
  if (column.searchText) {
    return column.searchText(value, row);
  }

  if (column.primitive === 'array') {
    return Array.isArray(value) ? value.map((entry) => String(entry)).join(' ') : '';
  }

  return normalizePrimitiveText(value);
}

export function resolvePrimitiveExportValue<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T) {
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

export function renderPrimitiveValue<T>(column: ScenarioDataGridPrimitiveColumn<T>, row: T) {
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

export function resolvePrimitiveFilter<T>(column: ScenarioDataGridPrimitiveColumn<T>): ScenarioDataGridColumn<T>['filter'] {
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

export function parsePrimitiveCsvValue<T>(column: ScenarioDataGridPrimitiveColumn<T>, rawValue: string, row: T) {
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
  const tokens = normalized.split('|').map((token) => token.trim()).filter((token) => token.length > 0);

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
