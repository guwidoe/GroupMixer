import type { QuickSetupDraft, QuickSetupParticipantColumn } from '../../components/LandingTool/types';
import { normalizeBalanceTargets } from './attributeBalanceTargets';

function splitCsvLine(line: string) {
  return line.split(',').map((entry) => entry.trim());
}

function parseLegacyCsv(text: string): QuickSetupParticipantColumn[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [{ id: 'name', name: 'Name', values: '' }];
  }

  const headers = splitCsvLine(lines[0]).filter(Boolean);
  if (headers.length === 0) {
    return [{ id: 'name', name: 'Name', values: '' }];
  }

  const rows = lines.slice(1).map((line) => splitCsvLine(line));
  const columns = headers.map((header, columnIndex) => ({
    id: columnIndex === 0 ? 'name' : `attribute-${columnIndex}`,
    name: columnIndex === 0 ? 'Name' : header,
    values: rows.map((row) => row[columnIndex] ?? '').join('\n'),
  }));

  return columns.length > 0 ? columns : [{ id: 'name', name: 'Name', values: '' }];
}

function parseLegacyNames(text: string): QuickSetupParticipantColumn[] {
  return [{
    id: 'name',
    name: 'Name',
    values: text,
  }];
}

export function normalizeParticipantColumns(
  draft: Pick<QuickSetupDraft, 'participantColumns' | 'participantInput' | 'inputMode'>,
): QuickSetupParticipantColumn[] {
  if (draft.participantColumns && draft.participantColumns.length > 0) {
    const [firstColumn, ...restColumns] = draft.participantColumns;
    return [
      {
        id: firstColumn.id || 'name',
        name: 'Name',
        values: firstColumn.values ?? '',
      },
      ...restColumns.map((column, index) => ({
        id: column.id || `attribute-${index + 1}`,
        name: column.name ?? `Attribute ${index + 1}`,
        values: column.values ?? '',
      })),
    ];
  }

  return draft.inputMode === 'csv'
    ? parseLegacyCsv(draft.participantInput)
    : parseLegacyNames(draft.participantInput);
}

export function splitParticipantColumnValues(value: string): string[] {
  if (value.length === 0) {
    return [];
  }

  return value.split(/\r?\n/);
}

export function serializeParticipantColumns(columns: QuickSetupParticipantColumn[]): string {
  const normalized = normalizeParticipantColumns({
    participantColumns: columns,
    participantInput: '',
    inputMode: columns.length > 1 ? 'csv' : 'names',
  });

  if (normalized.length <= 1) {
    return normalized[0]?.values ?? '';
  }

  const rows = normalized.map((column) => splitParticipantColumnValues(column.values));
  const rowCount = rows.reduce((max, values) => Math.max(max, values.length), 0);
  const headerLine = normalized.map((column, index) => (index === 0 ? 'name' : column.name.trim() || `attribute_${index}`)).join(',');
  const valueLines = Array.from({ length: rowCount }, (_, rowIndex) => (
    normalized.map((_, columnIndex) => {
      const value = rows[columnIndex][rowIndex] ?? '';
      return value.replace(/,/g, ' ');
    }).join(',')
  ));

  return [headerLine, ...valueLines].join('\n').trimEnd();
}

export function nextAttributeColumnName(columns: QuickSetupParticipantColumn[], defaultLabel: string): string {
  return `${defaultLabel} ${Math.max(1, columns.length)}`;
}

export function nextAttributeColumnId(columns: QuickSetupParticipantColumn[]): string {
  const usedIds = new Set(columns.map((column) => column.id));
  let index = 1;

  while (usedIds.has(`attribute-${index}`)) {
    index += 1;
  }

  return `attribute-${index}`;
}

export function withParticipantColumns(draft: QuickSetupDraft, columns: QuickSetupParticipantColumn[]): QuickSetupDraft {
  const previousColumns = normalizeParticipantColumns({
    participantColumns: draft.participantColumns,
    participantInput: draft.participantInput,
    inputMode: draft.inputMode,
  });
  const normalizedColumns = normalizeParticipantColumns({
    participantColumns: columns,
    participantInput: draft.participantInput,
    inputMode: draft.inputMode,
  });
  const availableKeys = normalizedColumns.slice(1).map((column) => column.name.trim()).filter(Boolean);
  const nextBalanceAttributeKey = draft.balanceAttributeKey && availableKeys.includes(draft.balanceAttributeKey)
    ? draft.balanceAttributeKey
    : null;
  const previousNameById = new Map(previousColumns.slice(1).map((column) => [column.id, column.name.trim()] as const));
  const nextBalanceTargets = normalizeBalanceTargets(Object.fromEntries(
    Object.entries(draft.balanceTargets ?? {}).flatMap(([attributeKey, groupTargets]) => {
      const matchingColumn = normalizedColumns.slice(1).find((column) => previousNameById.get(column.id) === attributeKey || column.name.trim() === attributeKey);
      const nextAttributeKey = matchingColumn?.name.trim();
      return nextAttributeKey ? [[nextAttributeKey, groupTargets] as const] : [];
    }),
  ));

  return {
    ...draft,
    participantColumns: normalizedColumns,
    participantInput: serializeParticipantColumns(normalizedColumns),
    inputMode: normalizedColumns.length > 1 ? 'csv' : 'names',
    balanceAttributeKey: nextBalanceAttributeKey,
    balanceTargets: nextBalanceTargets,
  };
}
