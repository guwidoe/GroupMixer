import { describe, expect, it } from 'vitest';
import { namifyPersonIdsInText } from './personReferenceText';
import type { Person } from '../types';

const people: Person[] = [
  { id: 'person_000', attributes: { name: 'Alice' } },
  { id: 'person_134', attributes: { name: 'Bob' } },
  { id: 'p1', attributes: { name: 'Cara' } },
];

describe('namifyPersonIdsInText', () => {
  it('replaces standalone person ids with display names', () => {
    expect(namifyPersonIdsInText(
      "Constraint violation: warm start places must-stay-apart pair ['person_000', 'person_134'] together",
      people,
    )).toBe(
      "Constraint violation: warm start places must-stay-apart pair ['Alice', 'Bob'] together",
    );
  });

  it('does not replace ids embedded inside larger tokens', () => {
    expect(namifyPersonIdsInText('person_000_extra is not the same token as person_000', people)).toBe(
      'person_000_extra is not the same token as Alice',
    );
  });

  it('leaves text untouched when ids already match display names', () => {
    expect(namifyPersonIdsInText('Unknown error', people)).toBe('Unknown error');
  });
});
