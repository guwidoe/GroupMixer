import React from 'react';
import type { Person } from '../../../types';
import { getPersonDisplayName } from '../../../services/scenarioAttributes';
import type { ScenarioDataGridRawCodec } from './grid/types';

export function resolvePersonDisplay(people: Person[], personId: string) {
  const person = people.find((candidate) => candidate.id === personId);
  const displayName = person ? getPersonDisplayName(person) : personId;
  const stableId = person?.id || personId;

  return {
    person,
    displayName,
    stableId,
    searchText: `${displayName} ${stableId}`.trim(),
    hasDistinctId: stableId !== displayName,
  };
}

export function formatPersonDisplayList(people: Person[], personIds: string[], separator = ', ') {
  return personIds.map((personId) => resolvePersonDisplay(people, personId).displayName).join(separator);
}

export function formatPersonSearchList(people: Person[], personIds: string[]) {
  return personIds.map((personId) => resolvePersonDisplay(people, personId).searchText).join(' ');
}

export function createPersonListRawCodec<TRow>({
  people,
  header,
  maxItems,
}: {
  people: Person[];
  header: string;
  maxItems?: number;
}): ScenarioDataGridRawCodec<string[], TRow> {
  return {
    format: (personIds) => JSON.stringify((personIds ?? []).map((personId) => resolvePersonDisplay(people, personId).displayName)),
    parse: (text) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return { ok: true, value: undefined };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return { ok: false, error: `Expected ${header} to be a JSON array of person names.` };
      }

      if (!Array.isArray(parsed)) {
        return { ok: false, error: `Expected ${header} to be a JSON array of person names.` };
      }

      const byId = new Map(people.map((person) => [person.id, person.id]));
      const byName = new Map<string, string[]>();
      const byLowerName = new Map<string, string[]>();
      for (const person of people) {
        const name = getPersonDisplayName(person);
        byName.set(name, [...(byName.get(name) ?? []), person.id]);
        byLowerName.set(name.toLowerCase(), [...(byLowerName.get(name.toLowerCase()) ?? []), person.id]);
      }

      const resolvedIds: string[] = [];
      for (const entry of parsed) {
        if (typeof entry !== 'string') {
          return { ok: false, error: `Expected ${header} entries to be person names.` };
        }

        const value = entry.trim();
        if (!value) {
          continue;
        }

        const idMatch = byId.get(value);
        if (idMatch) {
          if (!resolvedIds.includes(idMatch)) {
            resolvedIds.push(idMatch);
          }
          continue;
        }

        const exactNameMatches = byName.get(value) ?? [];
        const nameMatches = exactNameMatches.length > 0 ? exactNameMatches : (byLowerName.get(value.toLowerCase()) ?? []);
        if (nameMatches.length === 1) {
          const [personId] = nameMatches;
          if (personId && !resolvedIds.includes(personId)) {
            resolvedIds.push(personId);
          }
          continue;
        }

        if (nameMatches.length > 1) {
          return { ok: false, error: `Person name ${JSON.stringify(value)} is ambiguous in ${header}.` };
        }

        return { ok: false, error: `Unknown person ${JSON.stringify(value)} in ${header}.` };
      }

      if (maxItems != null && resolvedIds.length > maxItems) {
        return { ok: false, error: `Expected ${header} to contain at most ${maxItems} people.` };
      }

      return { ok: true, value: resolvedIds };
    },
  };
}

export function SetupPersonName({
  people,
  personId,
  className,
}: {
  people: Person[];
  personId: string;
  className?: string;
}) {
  const person = resolvePersonDisplay(people, personId);
  const content = (
    <span className={className} title={person.displayName}>
      {person.displayName}
    </span>
  );

  return content;
}

export function SetupPersonListText({
  people,
  personIds,
  separator = ', ',
}: {
  people: Person[];
  personIds: string[];
  separator?: string;
}) {
  return (
    <span>
      {personIds.map((personId, index) => (
        <React.Fragment key={personId}>
          {index > 0 ? separator : null}
          <SetupPersonName people={people} personId={personId} className="font-medium" />
        </React.Fragment>
      ))}
    </span>
  );
}
