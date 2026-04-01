import type { Scenario, Solution } from '../types';
import { convertRustResultToSolution } from './wasm/conversions';
import {
  buildWasmScenarioInput,
  buildWasmWarmStartInput,
  type WarmStartSchedule,
} from './wasm/scenarioContract';
import type { WasmContractSolveInput } from './wasm/module';
import type { ProgressUpdate, RustResult } from './wasm/types';

export function buildRustScenarioPayload(scenario: Scenario): WasmContractSolveInput {
  return buildWasmScenarioInput(scenario);
}

export function buildRustScenarioJson(scenario: Scenario): string {
  return JSON.stringify(buildRustScenarioPayload(scenario));
}

export function buildWarmStartScenarioPayload(
  scenario: Scenario,
  initialSchedule: WarmStartSchedule,
): WasmContractSolveInput & { initial_schedule: WarmStartSchedule } {
  return buildWasmWarmStartInput(scenario, initialSchedule);
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
