import type { Person } from '../../../../types';

export type PeopleSortBy = 'name' | 'sessions';
export type PeopleSortOrder = 'asc' | 'desc';

export function sortPeople(
  people: Person[],
  sortBy: PeopleSortBy,
  sortOrder: PeopleSortOrder,
  sessionsCount: number,
): Person[] {
  const sortedPeople = [...people];
  sortedPeople.sort((a, b) => {
    if (sortBy === 'name') {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    const sessionsA = a.sessions?.length || sessionsCount || 0;
    const sessionsB = b.sessions?.length || sessionsCount || 0;
    return sortOrder === 'asc' ? sessionsA - sessionsB : sessionsB - sessionsA;
  });
  return sortedPeople;
}
