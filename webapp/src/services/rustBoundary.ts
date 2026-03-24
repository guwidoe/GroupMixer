import type { Problem, Solution } from '../types';
import { convertProblemToRustFormat, convertRustResultToSolution } from './wasm/conversions';
import type { ProgressUpdate, RustResult } from './wasm/types';

export type WarmStartSchedule = Record<string, Record<string, string[]>>;

export function buildRustProblemPayload(problem: Problem): Record<string, unknown> {
  return convertProblemToRustFormat(problem);
}

export function buildRustProblemJson(problem: Problem): string {
  return JSON.stringify(buildRustProblemPayload(problem));
}

export function buildWarmStartProblemJson(
  problem: Problem,
  initialSchedule: WarmStartSchedule,
): string {
  const payload = buildRustProblemPayload(problem) as Record<string, unknown> & {
    initial_schedule?: WarmStartSchedule;
  };
  payload.initial_schedule = initialSchedule;
  return JSON.stringify(payload);
}

export function parseProgressUpdate(progressJson: string): ProgressUpdate {
  return JSON.parse(progressJson) as ProgressUpdate;
}

export function parseRustSolution(
  resultJson: string,
  lastProgress?: ProgressUpdate | null,
  fallbackProgress?: ProgressUpdate | null,
): Solution {
  return convertRustResultToSolution(
    JSON.parse(resultJson) as RustResult,
    lastProgress,
    fallbackProgress,
  );
}
