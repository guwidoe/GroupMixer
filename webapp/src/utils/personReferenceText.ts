import type { Person } from '../types';
import { getPersonDisplayName } from '../services/scenarioAttributes';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function namifyPersonIdsInText(text: string, people: Person[]): string {
  if (!text || people.length === 0) {
    return text;
  }

  const replacements = people
    .map((person) => ({ id: person.id, displayName: getPersonDisplayName(person) }))
    .filter(({ id, displayName }) => id && displayName && id !== displayName)
    .sort((left, right) => right.id.length - left.id.length);

  let output = text;
  for (const { id, displayName } of replacements) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_-])(${escapeRegExp(id)})(?=$|[^A-Za-z0-9_-])`, 'g');
    output = output.replace(pattern, (_match, prefix: string) => `${prefix}${displayName}`);
  }

  return output;
}
