import type { Scenario, SolverSettings } from '../../types';
import type {
  RuntimeActiveSolveSnapshot,
  RuntimeCapabilities,
  RuntimeEvaluationRequest,
  RuntimeEvaluationResult,
  RuntimeRecommendedSettingsRequest,
  RuntimeSolveRequest,
  RuntimeSolveResult,
  RuntimeValidationResult,
  RuntimeWarmStartRequest,
} from './types';

export class RuntimeError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(message: string, options?: { code?: string; cause?: unknown }) {
    super(message);
    this.name = 'RuntimeError';
    this.code = options?.code ?? 'runtime_error';
    this.cause = options?.cause;
  }
}

export class RuntimeCancelledError extends RuntimeError {
  constructor(message = 'Solver runtime operation cancelled', options?: { cause?: unknown }) {
    super(message, { code: 'runtime_cancelled', cause: options?.cause });
    this.name = 'RuntimeCancelledError';
  }
}

export function isRuntimeCancelledError(error: unknown): error is RuntimeCancelledError {
  return error instanceof RuntimeCancelledError
    || (error instanceof RuntimeError && error.code === 'runtime_cancelled');
}

export interface SolverRuntime {
  initialize(): Promise<void>;
  getCapabilities(): Promise<RuntimeCapabilities>;
  getDefaultSolverSettings(): Promise<SolverSettings>;
  validateScenario(scenario: Scenario): Promise<RuntimeValidationResult>;
  recommendSettings(request: RuntimeRecommendedSettingsRequest): Promise<SolverSettings>;
  solveWithProgress(request: RuntimeSolveRequest): Promise<RuntimeSolveResult>;
  solveWarmStart(request: RuntimeWarmStartRequest): Promise<RuntimeSolveResult>;
  evaluateSolution(request: RuntimeEvaluationRequest): Promise<RuntimeEvaluationResult>;
  cancel(): Promise<void>;
  getActiveSolveSnapshot?(): RuntimeActiveSolveSnapshot | null;
  hasActiveSolveSnapshot?(): boolean;
}
