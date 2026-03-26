import type { Scenario, Solution } from '../types';
import { convertScenarioToRustFormat, convertRustResultToSolution } from './wasm/conversions';
import type { ProgressUpdate, RustResult } from './wasm/types';

export type WarmStartSchedule = Record<string, Record<string, string[]>>;

export function buildRustScenarioPayload(scenario: Scenario): Record<string, unknown> {
  return convertScenarioToRustFormat(scenario);
}

export function buildRustScenarioJson(scenario: Scenario): string {
  return JSON.stringify(buildRustScenarioPayload(scenario));
}

export function buildWarmStartScenarioPayload(
  scenario: Scenario,
  initialSchedule: WarmStartSchedule,
): Record<string, unknown> & { initial_schedule: WarmStartSchedule } {
  const payload = buildRustScenarioPayload(scenario) as Record<string, unknown> & {
    initial_schedule?: WarmStartSchedule;
  };
  payload.initial_schedule = initialSchedule;
  return payload as Record<string, unknown> & { initial_schedule: WarmStartSchedule };
}

export function buildWarmStartScenarioJson(
  scenario: Scenario,
  initialSchedule: WarmStartSchedule,
): string {
  return JSON.stringify(buildWarmStartScenarioPayload(scenario, initialSchedule));
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
