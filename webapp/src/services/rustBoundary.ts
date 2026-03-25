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

export function buildWarmStartProblemPayload(
  problem: Problem,
  initialSchedule: WarmStartSchedule,
): Record<string, unknown> & { initial_schedule: WarmStartSchedule } {
  const payload = buildRustProblemPayload(problem) as Record<string, unknown> & {
    initial_schedule?: WarmStartSchedule;
  };
  payload.initial_schedule = initialSchedule;
  return payload as Record<string, unknown> & { initial_schedule: WarmStartSchedule };
}

export function buildWarmStartProblemJson(
  problem: Problem,
  initialSchedule: WarmStartSchedule,
): string {
  return JSON.stringify(buildWarmStartProblemPayload(problem, initialSchedule));
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

export function parseRustSolutionResult(
  result: RustResult,
  lastProgress?: ProgressUpdate | null,
  fallbackProgress?: ProgressUpdate | null,
): Solution {
  return convertRustResultToSolution(result, lastProgress, fallbackProgress);
}
