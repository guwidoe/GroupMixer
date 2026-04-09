import type { Assignment, Scenario, SolverSettings, Solution } from '../../types';
import { buildRustScenarioPayload, buildWarmStartScenarioPayload, parseRustSolutionResult } from '../rustBoundary';
import { createWasmContractTransport, createWorkerContractTransport, type SolverContractTransport } from '../runtimeAdapters/contractTransport';
import { normalizeRecommendedSolverSettings } from '../runtimeAdapters/recommendedSettings';
import { buildWasmRecommendSettingsRequest } from '../wasm/scenarioContract';
import { RuntimeCancelledError, RuntimeError, type SolverRuntime } from './runtime';
import type {
  RuntimeActiveSolveSnapshot,
  RuntimeCapabilities,
  RuntimeEvaluationRequest,
  RuntimeEvaluationResult,
  RuntimeProgressCallback,
  RuntimeProgressUpdate,
  RuntimeRecommendedSettingsRequest,
  RuntimeSolverCatalog,
  RuntimeSolverDescriptor,
  RuntimeSolveRequest,
  RuntimeSolveResult,
  RuntimeValidationResult,
  RuntimeWarmStartRequest,
  RuntimeWarmStartSchedule,
} from './types';

const LOCAL_WASM_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  runtimeId: 'local-wasm',
  executionModel: 'local-browser',
  lifecycle: 'local-active-solve',
  supportsStreamingProgress: true,
  supportsWarmStart: true,
  supportsCancellation: true,
  supportsEvaluation: true,
  supportsRecommendedSettings: true,
  supportsActiveSolveInspection: true,
};

interface ActiveSolveState {
  runScenario: Scenario;
  selectedSettings: SolverSettings;
  startedAtMs: number;
  latestProgress: RuntimeProgressUpdate | null;
  bestSchedule: RuntimeWarmStartSchedule | null;
  latestSolution: Solution | null;
  cancelRequested: boolean;
}

export interface LocalWasmRuntimeDeps {
  workerTransport?: SolverContractTransport;
  wasmTransport?: SolverContractTransport;
  now?: () => number;
}

function cloneValue<T>(value: T): T {
  if (value == null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function assignmentsToSchedule(assignments: Assignment[]): RuntimeWarmStartSchedule {
  return assignments.reduce<RuntimeWarmStartSchedule>((schedule, assignment) => {
    const sessionKey = `session_${assignment.session_id}`;
    schedule[sessionKey] = schedule[sessionKey] ?? {};
    schedule[sessionKey][assignment.group_id] = schedule[sessionKey][assignment.group_id] ?? [];
    schedule[sessionKey][assignment.group_id].push(assignment.person_id);
    return schedule;
  }, {});
}

function toRuntimeError(error: unknown, fallbackMessage: string): RuntimeError {
  if (error instanceof RuntimeCancelledError || error instanceof RuntimeError) {
    return error;
  }

  if (error instanceof Error) {
    if (/cancelled|canceled/i.test(error.message)) {
      return new RuntimeCancelledError(error.message, { cause: error });
    }
    return new RuntimeError(error.message || fallbackMessage, { cause: error });
  }

  return new RuntimeError(fallbackMessage, { cause: error });
}

export class LocalWasmRuntime implements SolverRuntime {
  private activeSolve: ActiveSolveState | null = null;
  private readonly workerTransportInstance: SolverContractTransport;
  private readonly wasmTransportInstance: SolverContractTransport;

  constructor(private readonly deps: LocalWasmRuntimeDeps = {}) {
    this.workerTransportInstance = deps.workerTransport ?? createWorkerContractTransport();
    this.wasmTransportInstance = deps.wasmTransport ?? createWasmContractTransport();
  }

  private get workerTransport(): SolverContractTransport {
    return this.workerTransportInstance;
  }

  private get wasmTransport(): SolverContractTransport {
    return this.wasmTransportInstance;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  async initialize(): Promise<void> {
    await this.workerTransport.initialize();
  }

  async getCapabilities(): Promise<RuntimeCapabilities> {
    return LOCAL_WASM_RUNTIME_CAPABILITIES;
  }

  async listSolvers(): Promise<RuntimeSolverCatalog> {
    try {
      return await this.workerTransport.listSolvers();
    } catch (error) {
      throw toRuntimeError(error, 'Failed to list solvers');
    }
  }

  async getSolverDescriptor(solverId: string): Promise<RuntimeSolverDescriptor> {
    try {
      return await this.workerTransport.getSolverDescriptor(solverId);
    } catch (error) {
      throw toRuntimeError(error, `Failed to get solver descriptor ${solverId}`);
    }
  }

  async getDefaultSolverSettings(): Promise<SolverSettings> {
    try {
      return await this.workerTransport.getDefaultSolverConfiguration();
    } catch (error) {
      throw toRuntimeError(error, 'Failed to get default solver settings');
    }
  }

  async validateScenario(scenario: Scenario): Promise<RuntimeValidationResult> {
    try {
      return await this.workerTransport.validateScenario(buildRustScenarioPayload(scenario));
    } catch (error) {
      throw toRuntimeError(error, 'Failed to validate scenario');
    }
  }

  async recommendSettings({
    scenario,
    desiredRuntimeSeconds,
  }: RuntimeRecommendedSettingsRequest): Promise<SolverSettings> {
    try {
      const raw = await this.workerTransport.recommendSettings(
        buildWasmRecommendSettingsRequest(scenario, desiredRuntimeSeconds),
      );
      return normalizeRecommendedSolverSettings(raw);
    } catch (error) {
      throw toRuntimeError(error, 'Failed to recommend solver settings');
    }
  }

  async solveWithProgress(request: RuntimeSolveRequest): Promise<RuntimeSolveResult> {
    return this.runSolve({
      scenario: request.scenario,
      progressCallback: request.progressCallback,
    });
  }

  async solveWarmStart(request: RuntimeWarmStartRequest): Promise<RuntimeSolveResult> {
    return this.runSolve({
      scenario: request.scenario,
      progressCallback: request.progressCallback,
      initialSchedule: request.initialSchedule,
    });
  }

  async evaluateSolution({ scenario, assignments }: RuntimeEvaluationRequest): Promise<RuntimeEvaluationResult> {
    try {
      const result = await this.wasmTransport.evaluateInput(
        buildWarmStartScenarioPayload(scenario, assignmentsToSchedule(assignments)),
      );
      return parseRustSolutionResult(result);
    } catch (error) {
      throw toRuntimeError(error, 'Failed to evaluate solution');
    }
  }

  async cancel(): Promise<void> {
    if (this.activeSolve) {
      this.activeSolve.cancelRequested = true;
    }

    try {
      await this.workerTransport.cancel?.();
    } catch (error) {
      throw toRuntimeError(error, 'Failed to cancel active solve');
    } finally {
      this.activeSolve = null;
    }
  }

  getActiveSolveSnapshot(): RuntimeActiveSolveSnapshot | null {
    if (!this.activeSolve) {
      return null;
    }

    return {
      runScenario: cloneValue(this.activeSolve.runScenario),
      selectedSettings: cloneValue(this.activeSolve.selectedSettings),
      startedAtMs: this.activeSolve.startedAtMs,
      latestProgress: cloneValue(this.activeSolve.latestProgress),
      bestSchedule: cloneValue(this.activeSolve.bestSchedule),
      latestSolution: cloneValue(this.activeSolve.latestSolution),
    };
  }

  hasActiveSolveSnapshot(): boolean {
    return this.activeSolve !== null;
  }

  private beginActiveSolve(runScenario: Scenario, selectedSettings: SolverSettings, bestSchedule: RuntimeWarmStartSchedule | null): void {
    if (this.activeSolve) {
      throw new RuntimeError('A local solve is already active', { code: 'runtime_solve_in_progress' });
    }

    this.activeSolve = {
      runScenario: cloneValue(runScenario),
      selectedSettings: cloneValue(selectedSettings),
      startedAtMs: this.now(),
      latestProgress: null,
      bestSchedule: cloneValue(bestSchedule),
      latestSolution: null,
      cancelRequested: false,
    };
  }

  private updateActiveSolve(progress: RuntimeProgressUpdate): void {
    if (!this.activeSolve) {
      return;
    }

    this.activeSolve.latestProgress = cloneValue(progress);
    if (progress.best_schedule) {
      this.activeSolve.bestSchedule = cloneValue(progress.best_schedule as RuntimeWarmStartSchedule);
    }
  }

  private finishActiveSolve(solution: Solution | null): void {
    if (this.activeSolve) {
      this.activeSolve.latestSolution = cloneValue(solution);
    }
    this.activeSolve = null;
  }

  private async runSolve({
    scenario,
    progressCallback,
    initialSchedule,
  }: {
    scenario: Scenario;
    progressCallback?: RuntimeProgressCallback;
    initialSchedule?: RuntimeWarmStartSchedule;
  }): Promise<RuntimeSolveResult> {
    const runScenario = cloneValue(scenario);
    const selectedSettings = cloneValue(scenario.settings);
    this.beginActiveSolve(runScenario, selectedSettings, initialSchedule ?? null);

    const trackedCallback = (progress: RuntimeProgressUpdate): void => {
      this.updateActiveSolve(progress);
      progressCallback?.(progress);
    };

    try {
      await this.workerTransport.initialize();
      const payload = initialSchedule
        ? buildWarmStartScenarioPayload(runScenario, initialSchedule)
        : buildRustScenarioPayload(runScenario);
      const { result, lastProgress } = await this.workerTransport.solveWithProgress(payload, trackedCallback);
      if (lastProgress) {
        this.updateActiveSolve(lastProgress);
      }

      const solution = parseRustSolutionResult(result, lastProgress, this.activeSolve?.latestProgress ?? null);
      const runtimeResult: RuntimeSolveResult = {
        selectedSettings,
        runScenario,
        solution,
        lastProgress: lastProgress ?? this.activeSolve?.latestProgress ?? null,
      };

      this.finishActiveSolve(solution);
      return runtimeResult;
    } catch (error) {
      const runtimeError = this.activeSolve?.cancelRequested
        ? new RuntimeCancelledError(undefined, { cause: error })
        : toRuntimeError(error, 'Failed to solve scenario');
      this.finishActiveSolve(null);
      throw runtimeError;
    }
  }
}

export { LOCAL_WASM_RUNTIME_CAPABILITIES };
