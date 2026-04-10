import type { ScenarioDataGridColumn, ScenarioDataGridRawParseResult } from '../types';
import { isCustomColumn, isPrimitiveColumn } from './columnMaterialization';
import { getPrimitiveOptions, parsePrimitiveCsvValue, resolvePrimitiveExportValue } from './primitiveBehavior';

function normalizeRawText(value: string | number | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join('; ');
  }
  return value == null ? '' : String(value);
}

export function formatColumnRawValue<T>(row: T, column: ScenarioDataGridColumn<T>) {
  if (isPrimitiveColumn(column)) {
    if (column.rawCodec) {
      return column.rawCodec.format(column.getValue(row), row);
    }

    if (column.primitive === 'array') {
      const value = column.getValue(row);
      return JSON.stringify(Array.isArray(value) ? value : []);
    }

    return normalizeRawText(resolvePrimitiveExportValue(column, row));
  }

  if (isCustomColumn(column)) {
    if (column.rawCodec) {
      return column.rawCodec.format(column.getValue(row), row);
    }

    if (column.exportValue) {
      return normalizeRawText(column.exportValue(column.getValue(row), row));
    }
  }

  return normalizeRawText(
    column.exportValue?.(row)
      ?? ('searchValue' in column ? column.searchValue?.(row) : undefined),
  );
}

export function parseColumnRawValue<T>(column: ScenarioDataGridColumn<T>, rawValue: string, row: T): ScenarioDataGridRawParseResult<unknown> {
  if (isPrimitiveColumn(column)) {
    if (column.rawCodec) {
      return column.rawCodec.parse(rawValue, row) as ScenarioDataGridRawParseResult<unknown>;
    }

    if (column.primitive === 'array') {
      const allowedValues = new Set(
        getPrimitiveOptions(column, row).map((option) => (
          column.itemType === 'number' ? String(Number(option.value)) : option.value
        )),
      );

      return createJsonRawCodec<Array<string | number>, T>({
        header: column.header,
        validate: (value) => validateJsonArrayValue({
          header: column.header,
          itemType: column.itemType,
          allowedValues: allowedValues.size > 0 ? allowedValues : undefined,
        })(value),
      }).parse(rawValue, row) as ScenarioDataGridRawParseResult<unknown>;
    }

    const parsed = parsePrimitiveCsvValue(column, rawValue, row);
    if ('error' in parsed) {
      return { ok: false, error: parsed.error };
    }
    return { ok: true, value: parsed.value };
  }

  if (isCustomColumn(column) && column.rawCodec) {
    return column.rawCodec.parse(rawValue, row) as ScenarioDataGridRawParseResult<unknown>;
  }

  return { ok: false, error: `${column.header} does not support raw CSV editing.` };
}

export function createJsonRawCodec<TValue, TRow = unknown>({
  header,
  validate,
}: {
  header: string;
  validate: (value: unknown, row: TRow) => ScenarioDataGridRawParseResult<TValue | undefined>;
}) {
  return {
    format: (value: TValue | undefined) => value == null ? '' : JSON.stringify(value),
    parse: (text: string, row: TRow) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return { ok: true, value: undefined } as const;
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return validate(parsed, row);
      } catch (error) {
        return {
          ok: false,
          error: `Expected valid JSON for ${header}, received ${JSON.stringify(text)}.`,
        } as const;
      }
    },
  };
}

export function validateJsonArrayValue({
  header,
  itemType = 'string',
  allowedValues,
}: {
  header: string;
  itemType?: 'string' | 'number';
  allowedValues?: Set<string>;
}): (value: unknown) => ScenarioDataGridRawParseResult<Array<string | number> | undefined> {
  return (value: unknown) => {
    if (!Array.isArray(value)) {
      return { ok: false, error: `Expected ${header} to be a JSON array.` };
    }

    const parsedValues: Array<string | number> = [];
    for (const entry of value) {
      if (itemType === 'number') {
        if (typeof entry !== 'number' || !Number.isFinite(entry)) {
          return { ok: false, error: `Expected ${header} entries to be finite numbers.` };
        }
        if (allowedValues && !allowedValues.has(String(entry))) {
          return { ok: false, error: `Expected ${header} entries to be one of ${Array.from(allowedValues).join(', ')}.` };
        }
        parsedValues.push(entry);
        continue;
      }

      if (typeof entry !== 'string') {
        return { ok: false, error: `Expected ${header} entries to be strings.` };
      }
      if (allowedValues && !allowedValues.has(entry)) {
        return { ok: false, error: `Expected ${header} entries to be one of ${Array.from(allowedValues).join(', ')}.` };
      }
      parsedValues.push(entry);
    }

    return { ok: true, value: parsedValues };
  };
}

export function validateStringNumberRecordValue({
  header,
  allowedKeys,
}: {
  header: string;
  allowedKeys?: Set<string>;
}): (value: unknown) => ScenarioDataGridRawParseResult<Record<string, number> | undefined> {
  return (value: unknown) => {
    if (value == null) {
      return { ok: true, value: undefined };
    }

    if (Array.isArray(value) || typeof value !== 'object') {
      return { ok: false, error: `Expected ${header} to be a JSON object.` };
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const parsedRecord: Record<string, number> = {};

    for (const [key, entry] of entries) {
      if (allowedKeys && !allowedKeys.has(key)) {
        return { ok: false, error: `Expected ${header} keys to be one of ${Array.from(allowedKeys).join(', ')}.` };
      }
      if (typeof entry !== 'number' || !Number.isFinite(entry)) {
        return { ok: false, error: `Expected ${header}.${key} to be a finite number.` };
      }
      parsedRecord[key] = entry;
    }

    return { ok: true, value: parsedRecord };
  };
}
