import type { Person } from '../../types';
import type { QuickSetupDraft } from '../../components/EmbeddableTool/types';
import { normalizeParticipantColumns, splitParticipantColumnValues } from './participantColumns';

export interface ParsedParticipantInput {
  people: Person[];
  attributeKeys: string[];
  nameColumn: string | null;
}

function dedupeName(raw: string, seen: Map<string, number>): string {
  const base = raw.trim() || 'Person';
  const normalizedBase = base.toLowerCase();
  const count = (seen.get(normalizedBase) ?? 0) + 1;
  seen.set(normalizedBase, count);
  return count === 1 ? base : `${base} (${count})`;
}

function createPersonId(rowIndex: number): string {
  return `person_${rowIndex + 1}`;
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { headers: [] as string[], rows: [] as Record<string, string>[] };
  }

  const headers = lines[0].split(',').map((entry) => entry.trim()).filter(Boolean);
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',').map((entry) => entry.trim());
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index] ?? '';
      return acc;
    }, {});
  });

  return { headers, rows };
}

export function parseParticipantInput(draft: Pick<QuickSetupDraft, 'participantInput' | 'inputMode' | 'participantColumns'>): ParsedParticipantInput {
  const seenNames = new Map<string, number>();

  if (draft.participantColumns && draft.participantColumns.length > 0) {
    const columns = normalizeParticipantColumns(draft);
    const [nameColumn, ...attributeColumns] = columns;
    const nameValues = splitParticipantColumnValues(nameColumn.values);
    const attributeKeys = attributeColumns
      .map((column) => column.name.trim())
      .filter(Boolean);
    const attributeValueRows = attributeColumns.map((column) => splitParticipantColumnValues(column.values));
    const rowCount = Math.max(nameValues.length, ...attributeValueRows.map((values) => values.length), 0);

    const people = Array.from({ length: rowCount }, (_, rowIndex) => {
      const name = nameValues[rowIndex]?.trim();
      if (!name) {
        return null;
      }

      const displayName = dedupeName(name, seenNames);
      const attributes = attributeKeys.reduce<Record<string, string>>((acc, key, keyIndex) => {
        const value = attributeValueRows[keyIndex][rowIndex]?.trim();
        if (value) {
          acc[key] = value;
        }
        return acc;
      }, {});

      return { id: createPersonId(rowIndex), name: displayName, attributes } satisfies Person;
    }).filter((person): person is Person => Boolean(person));

    return { people, attributeKeys, nameColumn: nameColumn.name };
  }

  if (draft.inputMode === 'csv') {
    const { headers, rows } = parseCsv(draft.participantInput);
    if (headers.length === 0) {
      return { people: [], attributeKeys: [], nameColumn: null };
    }

    const nameColumn = headers.find((header) => header.trim().toLowerCase() === 'name') ?? headers[0];
    const attributeKeys = headers.filter((header) => header !== nameColumn);
    const people = rows
      .map((row, rowIndex) => {
        const name = row[nameColumn]?.trim();
        if (!name) {
          return null;
        }
        const displayName = dedupeName(name, seenNames);
        const attributes = attributeKeys.reduce<Record<string, string>>((acc, key) => {
          const value = row[key]?.trim();
          if (value) {
            acc[key] = value;
          }
          return acc;
        }, {});
        return { id: createPersonId(rowIndex), name: displayName, attributes } satisfies Person;
      })
      .filter((person): person is Person => Boolean(person));

    return { people, attributeKeys, nameColumn };
  }

  const people = draft.participantInput
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((name, index) => ({
      id: createPersonId(index),
      name: dedupeName(name, seenNames),
      attributes: {},
    }) satisfies Person);

  return { people, attributeKeys: [], nameColumn: null };
}
