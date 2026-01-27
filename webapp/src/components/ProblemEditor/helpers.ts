/**
 * ProblemEditor helper functions for CSV parsing and ID generation.
 */

import type { SolverSettings } from '../../types';
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
 * Generate a unique person ID across all existing problems.
 */
export const generateUniquePersonId = (currentPeople?: { id: string }[]): string => {
  const allProblems = useAppStore.getState().savedProblems;
  const allPersonIds = new Set<string>();
  Object.values(allProblems).forEach(p => p.problem.people.forEach(person => allPersonIds.add(person.id)));
  // Also include people in the current unsaved problem
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
export const getDefaultSolverSettings = (): SolverSettings => ({
  solver_type: "SimulatedAnnealing",
  stop_conditions: {
    max_iterations: 10000,
    time_limit_seconds: 30,
    no_improvement_iterations: 5000,
  },
  solver_params: {
    SimulatedAnnealing: {
      initial_temperature: 1.0,
      final_temperature: 0.01,
      cooling_schedule: "geometric",
      reheat_cycles: 0,
      reheat_after_no_improvement: 0,
    },
  },
  logging: {
    log_frequency: 1000,
    log_initial_state: true,
    log_duration_and_score: true,
    display_final_schedule: true,
    log_initial_score_breakdown: true,
    log_final_score_breakdown: true,
    log_stop_condition: true,
  },
});
