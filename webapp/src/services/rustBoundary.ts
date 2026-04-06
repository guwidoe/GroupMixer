import type { Scenario, Solution } from '../types';
import { convertRustResultToSolution } from './wasm/conversions';
import {
  buildWasmConstructionSeedInput,
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

export function buildConstructionSeedScenarioPayload(
  scenario: Scenario,
  constructionSeedSchedule: WarmStartSchedule,
): WasmContractSolveInput & { construction_seed_schedule: WarmStartSchedule } {
  return buildWasmConstructionSeedInput(scenario, constructionSeedSchedule) as WasmContractSolveInput & {
    construction_seed_schedule: WarmStartSchedule;
  };
}

export function buildConstructionSeedScenarioJson(
  scenario: Scenario,
  constructionSeedSchedule: WarmStartSchedule,
): string {
  return JSON.stringify(
    buildConstructionSeedScenarioPayload(scenario, constructionSeedSchedule),
  );
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
