/**
 * ScenarioEditor helper functions for CSV parsing and ID generation.
 */

import type { SolverSettings } from '../../types';
import { createDefaultSolverSettings } from '../../services/solverUi';
import { useAppStore } from '../../store';

/**
 * Parse CSV text into headers and rows.
 */
export const parseCsv = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] || '').trim();
    });
    return row;
  });
  return { headers, rows };
};

/**
 * Convert headers and rows back to CSV text.
 */
export const rowsToCsv = (headers: string[], rows: Record<string, string>[]): string => {
  const headerLine = headers.join(',');
  const dataLines = rows.map(r => headers.map(h => r[h] ?? '').join(','));
  return [headerLine, ...dataLines].join('\n');
};

/**
 * Generate a unique person ID across all existing scenarios.
 */
export const generateUniquePersonId = (currentPeople?: { id: string }[]): string => {
  const allScenarios = useAppStore.getState().savedScenarios;
  const allPersonIds = new Set<string>();
  Object.values(allScenarios).forEach(p => p.scenario.people.forEach(person => allPersonIds.add(person.id)));
  // Also include people in the current unsaved scenario
  if (currentPeople) {
    currentPeople.forEach(person => allPersonIds.add(person.id));
  }
  let newId: string;
  do {
    newId = `person_${Math.random().toString(36).slice(2, 10)}`;
  } while (allPersonIds.has(newId));
  return newId;
};

/**
 * Get default solver settings.
 */
export const getDefaultSolverSettings = (): SolverSettings => createDefaultSolverSettings();
