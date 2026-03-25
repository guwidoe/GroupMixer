import type { Person } from '../../types';
import type { QuickSetupDraft } from '../../components/LandingTool/types';

export interface ParsedParticipantInput {
  people: Person[];
  attributeKeys: string[];
  nameColumn: string | null;
}

function dedupeId(raw: string, seen: Map<string, number>): string {
  const base = raw.trim() || 'Person';
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base} (${count})`;
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

export function parseParticipantInput(draft: Pick<QuickSetupDraft, 'participantInput' | 'inputMode'>): ParsedParticipantInput {
  const seenIds = new Map<string, number>();

  if (draft.inputMode === 'csv') {
    const { headers, rows } = parseCsv(draft.participantInput);
    if (headers.length === 0) {
      return { people: [], attributeKeys: [], nameColumn: null };
    }

    const nameColumn = headers.find((header) => header.trim().toLowerCase() === 'name') ?? headers[0];
    const attributeKeys = headers.filter((header) => header !== nameColumn);
    const people = rows
      .map((row) => {
        const name = row[nameColumn]?.trim();
        if (!name) {
          return null;
        }
        const id = dedupeId(name, seenIds);
        const attributes = attributeKeys.reduce<Record<string, string>>((acc, key) => {
          const value = row[key]?.trim();
          if (value) {
            acc[key] = value;
          }
          return acc;
        }, {});
        return { id, attributes } satisfies Person;
      })
      .filter((person): person is Person => Boolean(person));

    return { people, attributeKeys, nameColumn };
  }

  const people = draft.participantInput
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((name) => ({
      id: dedupeId(name, seenIds),
      attributes: {},
    }) satisfies Person);

  return { people, attributeKeys: [], nameColumn: null };
}
