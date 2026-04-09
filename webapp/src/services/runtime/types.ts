import type { Assignment, Scenario, Solution, SolverSettings } from '../../types';
import type {
  WasmSolverCatalogResponse,
  WasmSolverDescriptor,
  WasmValidateResponse,
} from '../wasm/module';
import type { ProgressUpdate, RustResult } from '../wasm/types';
import type { RuntimeProgressMailboxSupport } from './progressMailbox';

export type RuntimeWarmStartSchedule = Record<string, Record<string, string[]>>;

/**
 * Near-alias of the current Rust-defined local progress shape.
 * The runtime layer owns the app-facing import path even though the
 * underlying telemetry is still local-runtime specific.
 */
export type RuntimeProgressUpdate = ProgressUpdate;
export type RuntimeProgressCallback = (progress: RuntimeProgressUpdate) => void;

/**
 * Local browser runtimes still expose Rust-native result payloads internally.
 * Keep the type app-internal to the runtime layer rather than letting callers
 * import it directly from the WASM/worker implementation modules.
 */
export type RuntimeRawResult = RustResult;

export type RuntimeValidationResult = WasmValidateResponse;
export type RuntimeEvaluationResult = Solution;
export type RuntimeSolverDescriptor = WasmSolverDescriptor;
export type RuntimeSolverCatalog = WasmSolverCatalogResponse;

export interface RuntimeCapabilities {
  runtimeId: string;
  executionModel: 'local-browser' | 'remote';
  lifecycle: 'local-active-solve' | 'run-oriented';
  supportsStreamingProgress: boolean;
  supportsWarmStart: boolean;
  supportsCancellation: boolean;
  supportsEvaluation: boolean;
  supportsRecommendedSettings: boolean;
  supportsActiveSolveInspection: boolean;
  progressTransport: 'shared-mailbox';
  progressMailbox: RuntimeProgressMailboxSupport;
}

export interface RuntimeRecommendedSettingsRequest {
  scenario: Scenario;
  desiredRuntimeSeconds: number;
}

export interface RuntimeSolveRequest {
  scenario: Scenario;
  progressCallback?: RuntimeProgressCallback;
}

export interface RuntimeWarmStartRequest extends RuntimeSolveRequest {
  initialSchedule: RuntimeWarmStartSchedule;
}

export interface RuntimeSolveResult {
  selectedSettings: SolverSettings;
  runScenario: Scenario;
  solution: Solution;
  lastProgress: RuntimeProgressUpdate | null;
}

export interface RuntimeActiveSolveSnapshot {
  runScenario: Scenario;
  selectedSettings: SolverSettings;
  startedAtMs: number;
  latestProgress: RuntimeProgressUpdate | null;
  bestSchedule: RuntimeWarmStartSchedule | null;
  latestSolution: Solution | null;
}

export interface RuntimeEvaluationRequest {
  scenario: Scenario;
  assignments: Assignment[];
}
