import { getPersonDisplayName as getCanonicalPersonDisplayName } from '../services/scenarioAttributes';
import type { Person } from '../types';

export function getPersonDisplayName(person: Person): string {
  return getCanonicalPersonDisplayName(person);
}
