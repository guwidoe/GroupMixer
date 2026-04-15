import type { Scenario, Solution, SolverSettings } from "../types";
import type { ProgressUpdate, ProgressCallback } from "./wasm/types";
import type { WarmStartSchedule } from "./wasm/scenarioContract";
import {
  createProgressMailboxBuffer,
  createProgressMailboxReader,
  getRuntimeProgressMailboxSupport,
  mailboxSnapshotToProgressUpdate,
  type ProgressMailboxReader,
} from "./runtime/progressMailbox";
import {
  createInitRequestMessage,
  createRpcRequestMessage,
  createSolveRequestMessage,
  type SolverMessageData,
  type SolverRpcMethod,
  type SolverRunResult,
  type WorkerErrorData,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from "./solverWorker/protocol";
import {
  buildRustScenarioPayload,
  buildWarmStartScenarioPayload,
  parseRustSolutionResult,
} from "./rustBoundary";
import { buildWasmRecommendSettingsRequest } from "./wasm/scenarioContract";
import type {
  WasmBootstrapResponse,
  WasmContractSolveInput,
  WasmErrorLookupResponse,
  WasmOperationHelpResponse,
  WasmRecommendSettingsRequest,
  WasmResultSummary,
  WasmSchemaLookupResponse,
  WasmSchemaSummary,
  WasmSolverCatalogResponse,
  WasmSolverDescriptor,
  WasmValidateResponse,
} from "./wasm/module";
import type { RustResult } from "./wasm/types";

class SolverWorkerMessageError extends Error {
  readonly code?: string;
  readonly publicError?: WorkerErrorData["publicError"];

  constructor(message: string, options?: { code?: string; publicError?: WorkerErrorData["publicError"] }) {
    super(message);
    this.name = "SolverWorkerMessageError";
    this.code = options?.code;
    this.publicError = options?.publicError;
  }
}

function formatWorkerPublicError(publicError: NonNullable<WorkerErrorData["publicError"]>): string {
  const parts = [publicError.message];

  if (publicError.recovery) {
    parts.push(`Hint: ${publicError.recovery}`);
  }

  return parts.join(" ");
}

type PendingMessage =
  | {
      kind: "init";
      resolve: () => void;
      reject: (error: Error) => void;
    }
  | {
      kind: "rpc";
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  | {
      kind: "solve";
      resolve: (value: SolverRunResult) => void;
      reject: (error: Error) => void;
      progressCallback?: ProgressCallback;
      progressReader?: ProgressMailboxReader;
      progressPollTimer?: ReturnType<typeof setInterval> | null;
      lastProgress?: ProgressUpdate | null;
      lastSequence?: number;
      latestBestSchedule?: WarmStartSchedule | null;
    };

interface SolverWorkerServiceDeps {
  createWorker?: () => Worker;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export class SolverWorkerService {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingMessages = new Map<string, PendingMessage>();
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private lastProgressUpdate: ProgressUpdate | null = null;

  constructor(private readonly deps: SolverWorkerServiceDeps = {}) {}

  private nextMessageId(): string {
    this.messageId += 1;
    return this.messageId.toString();
  }

  private rejectAllPending(error: Error): void {
    this.pendingMessages.forEach((pending) => {
      if (pending.kind === "solve") {
        this.stopProgressPolling(pending);
      }
    });
    this.pendingMessages.forEach(({ reject }) => reject(error));
    this.pendingMessages.clear();
  }

  private setInterval(callback: () => void, ms: number): ReturnType<typeof setInterval> {
    return this.deps.setIntervalFn ? this.deps.setIntervalFn(callback, ms) : setInterval(callback, ms);
  }

  private clearInterval(timer: ReturnType<typeof setInterval> | null | undefined): void {
    if (!timer) {
      return;
    }

    if (this.deps.clearIntervalFn) {
      this.deps.clearIntervalFn(timer);
      return;
    }

    clearInterval(timer);
  }

  private stopProgressPolling(pending: Extract<PendingMessage, { kind: "solve" }>): void {
    this.clearInterval(pending.progressPollTimer);
    pending.progressPollTimer = null;
  }

  private pollMailboxProgress(pending: Extract<PendingMessage, { kind: "solve" }>): void {
    if (!pending.progressReader) {
      return;
    }

    const readResult = pending.progressReader.read();
    if (!readResult || readResult.sequence === pending.lastSequence) {
      return;
    }

    pending.lastSequence = readResult.sequence;
    const progress = mailboxSnapshotToProgressUpdate(readResult.snapshot);
    if (pending.latestBestSchedule) {
      progress.best_schedule = pending.latestBestSchedule;
    }
    pending.lastProgress = progress;
    this.lastProgressUpdate = progress;

    if (pending.progressCallback) {
      try {
        pending.progressCallback(progress);
      } catch (error) {
        console.error("Failed to handle mailbox progress update:", error);
      }
    }
  }

  private startProgressPolling(pending: Extract<PendingMessage, { kind: "solve" }>): void {
    if (!pending.progressReader) {
      return;
    }

    this.stopProgressPolling(pending);
    this.pollMailboxProgress(pending);
    pending.progressPollTimer = this.setInterval(() => {
      this.pollMailboxProgress(pending);
    }, 50);
  }

  private createWorker(): Worker {
    if (this.deps.createWorker) {
      return this.deps.createWorker();
    }

    return new Worker(new URL("../workers/solverWorker.ts", import.meta.url), {
      type: "module",
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = (async () => {
      try {
        this.worker = this.createWorker();
        this.setupMessageHandler();
        await this.sendInit();
        this.isInitialized = true;
      } catch (error) {
        console.error("Failed to initialize solver worker:", error);
        this.worker = null;
        this.isInitialized = false;
        throw new Error(
          `Failed to initialize solver worker: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        this.initializationPromise = null;
      }
    })();

    await this.initializationPromise;
  }

  private buildWorkerError(messageData?: WorkerErrorData): Error {
    if (messageData?.publicError) {
      return new SolverWorkerMessageError(formatWorkerPublicError(messageData.publicError), {
        code: messageData.publicError.code,
        publicError: messageData.publicError,
      });
    }

    return new Error(messageData?.error || "Unknown worker error");
  }

  private handleFatalWorkerError(messageData?: WorkerErrorData): void {
    const error = this.buildWorkerError(messageData);
    this.rejectAllPending(error);
    if (messageData?.scenarioJson) {
      console.error("Worker error included solver input context.");
    }
  }

  private setupMessageHandler(): void {
    if (!this.worker) return;

    const attachedWorker = this.worker;

    attachedWorker.onmessage = (e: MessageEvent<WorkerResponseMessage>) => {
      if (this.worker !== attachedWorker) {
        return;
      }

      const message = e.data;
      const pending = "id" in message && message.id
        ? this.pendingMessages.get(message.id)
        : undefined;

      switch (message.type) {
        case "INIT_SUCCESS":
          if (pending?.kind === "init") {
            pending.resolve();
            this.pendingMessages.delete(message.id);
          }
          break;

        case "PROGRESS":
          if (pending?.kind === "solve" && pending.progressCallback) {
            try {
              const progress = message.data.progress;
              if (pending.latestBestSchedule) {
                progress.best_schedule = pending.latestBestSchedule;
              }
              pending.progressCallback(progress);
              pending.lastProgress = progress;
              this.lastProgressUpdate = progress;
            } catch (error) {
              console.error("Failed to handle progress update:", error);
            }
          }
          break;

        case "BEST_SCHEDULE":
          if (pending?.kind === "solve") {
            pending.latestBestSchedule = message.data.schedule;
            if (pending.lastProgress && pending.progressCallback) {
              try {
                const progress = {
                  ...pending.lastProgress,
                  best_schedule: message.data.schedule,
                };
                pending.lastProgress = progress;
                this.lastProgressUpdate = progress;
                pending.progressCallback(progress);
              } catch (error) {
                console.error("Failed to handle best schedule update:", error);
              }
            }
          }
          break;

        case "SOLVE_SUCCESS":
          if (pending?.kind === "solve") {
            this.pollMailboxProgress(pending);
            this.stopProgressPolling(pending);
            const lastProgress = pending.lastProgress ?? message.data.lastProgress ?? null;
            if (lastProgress) {
              this.lastProgressUpdate = lastProgress;
            }
            pending.resolve({ result: message.data.result, lastProgress });
            this.pendingMessages.delete(message.id);
          }
          break;

        case "CANCELLED":
          if (pending) {
            if (pending.kind === "solve") {
              this.stopProgressPolling(pending);
            }
            pending.reject(new Error("Solver cancelled"));
            this.pendingMessages.delete(message.id);
          }
          break;

        case "ERROR":
        case "RPC_ERROR": {
          if (pending) {
            if (pending.kind === "solve") {
              this.stopProgressPolling(pending);
            }
            pending.reject(this.buildWorkerError(message.data));
            this.pendingMessages.delete(message.id);
          } else {
            this.handleFatalWorkerError(message.data);
          }
          break;
        }

        case "FATAL_ERROR":
          this.handleFatalWorkerError(message.data);
          break;

        case "LOG":
          if (Array.isArray(message.data.args)) {
            switch (message.data.level) {
              case "warn":
                console.warn("[Worker]", ...message.data.args);
                break;
              case "error":
                console.error("[Worker]", ...message.data.args);
                break;
              case "debug":
              default:
                break;
            }
          }
          break;

        case "RPC_SUCCESS":
          if (pending?.kind === "rpc") {
            pending.resolve(message.data.result);
            this.pendingMessages.delete(message.id);
          }
          break;

        case "PROBLEM_JSON":
          try {
            (window as unknown as Record<string, unknown>).lastSolverScenarioJson =
              message.data.scenarioJson;
            window.dispatchEvent(
              new CustomEvent("solver-scenario-json", {
                detail: message.data.scenarioJson,
              }),
            );
          } catch {
            /* no-op */
          }
          break;

        default:
          console.warn("Unknown worker message type:", message);
      }
    };

    attachedWorker.onerror = () => {
      if (this.worker !== attachedWorker) {
        return;
      }

      console.error("Worker error occurred");
      this.rejectAllPending(new Error("Worker error"));
    };
  }

  private postMessage(message: WorkerRequestMessage): void {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }
    this.worker.postMessage(message);
  }

  private sendInit(): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.nextMessageId();
      this.pendingMessages.set(id, { kind: "init", resolve, reject });
      this.postMessage(createInitRequestMessage(id));
    });
  }

  private sendRpc<T>(
    method: SolverRpcMethod,
    data: SolverMessageData,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextMessageId();
      this.pendingMessages.set(id, { kind: "rpc", resolve: resolve as (value: unknown) => void, reject });
      this.postMessage(createRpcRequestMessage(method, id, data));
    });
  }

  private sendSolve(
    scenarioPayload: WasmContractSolveInput,
    useProgress: boolean,
    progressCallback?: ProgressCallback,
  ): Promise<SolverRunResult> {
    return new Promise((resolve, reject) => {
      const id = this.nextMessageId();
      const pending: Extract<PendingMessage, { kind: "solve" }> = {
        kind: "solve",
        resolve,
        reject,
        progressCallback,
        progressPollTimer: null,
        lastProgress: null,
        latestBestSchedule: null,
      };

      let progressMailbox: SharedArrayBuffer | undefined;

      if (useProgress) {
        const support = getRuntimeProgressMailboxSupport();
        if (!support.supported) {
          reject(new Error(support.unavailableReason ?? "Shared progress mailbox is unavailable."));
          return;
        }

        progressMailbox = createProgressMailboxBuffer();
        pending.progressReader = createProgressMailboxReader(progressMailbox);
      }

      this.pendingMessages.set(id, pending);
      this.postMessage(createSolveRequestMessage(id, scenarioPayload, useProgress, progressMailbox));

      if (useProgress) {
        this.startProgressPolling(pending);
      }
    });
  }

  async solve(scenario: Scenario): Promise<Solution> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const scenarioPayload = buildRustScenarioPayload(scenario);

    const { result } = await this.sendSolve(scenarioPayload, false);
    return parseRustSolutionResult(result, null, this.lastProgressUpdate);
  }

  async solveContract(scenarioPayload: WasmContractSolveInput): Promise<RustResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const { result } = await this.sendSolve(scenarioPayload, false);
    return result;
  }

  async solveWithProgress(
    scenario: Scenario,
    progressCallback?: ProgressCallback,
  ): Promise<{ solution: Solution; lastProgress: ProgressUpdate | null }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const scenarioPayload = buildRustScenarioPayload(scenario);

    const { result, lastProgress } = await this.sendSolve(
      scenarioPayload,
      true,
      progressCallback,
    );

    const solution = parseRustSolutionResult(result, lastProgress, this.lastProgressUpdate);

    return { solution, lastProgress };
  }

  async solveContractWithProgress(
    scenarioPayload: WasmContractSolveInput,
    progressCallback?: ProgressCallback,
  ): Promise<{ result: RustResult; lastProgress: ProgressUpdate | null }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.sendSolve(scenarioPayload, true, progressCallback);
  }

  async solveWithProgressWarmStart(
    scenario: Scenario,
    initialSchedule: Record<string, Record<string, string[]>>,
    progressCallback?: ProgressCallback,
  ): Promise<{ solution: Solution; lastProgress: ProgressUpdate | null }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const scenarioPayload = buildWarmStartScenarioPayload(scenario, initialSchedule);

    const { result, lastProgress } = await this.sendSolve(
      scenarioPayload,
      true,
      progressCallback,
    );

    const solution = parseRustSolutionResult(result, lastProgress, this.lastProgressUpdate);
    return { solution, lastProgress };
  }

  async cancel(): Promise<void> {
    if (!this.worker) return;

    this.rejectAllPending(new Error("Solver cancelled by user"));

    this.worker.terminate();
    this.worker = null;
    this.isInitialized = false;

    try {
      await this.initialize();
    } catch (error) {
      console.error("Failed to reinitialize worker after cancellation:", error);
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getLastProgressUpdate(): ProgressUpdate | null {
    return this.lastProgressUpdate;
  }

  terminate(): void {
    this.pendingMessages.forEach((pending) => {
      if (pending.kind === "solve") {
        this.stopProgressPolling(pending);
      }
    });
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
    this.initializationPromise = null;
    this.pendingMessages.clear();
  }

  private async callSolver<T>(
    method: SolverRpcMethod,
    data: SolverMessageData,
  ): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.sendRpc<T>(method, data);
  }

  public async getDefaultSolverConfiguration(): Promise<SolverSettings> {
    return this.callSolver<SolverSettings>("get_default_solver_configuration", {});
  }

  public async capabilities(): Promise<WasmBootstrapResponse> {
    return this.callSolver<WasmBootstrapResponse>("capabilities", {});
  }

  public async getOperationHelp(operationId: string): Promise<WasmOperationHelpResponse> {
    return this.callSolver<WasmOperationHelpResponse>("get_operation_help", {
      args: [operationId],
    });
  }

  public async listSchemas(): Promise<WasmSchemaSummary[]> {
    return this.callSolver<WasmSchemaSummary[]>("list_schemas", {});
  }

  public async getSchema(schemaId: string): Promise<WasmSchemaLookupResponse> {
    return this.callSolver<WasmSchemaLookupResponse>("get_schema", {
      args: [schemaId],
    });
  }

  public async listPublicErrors(): Promise<WasmErrorLookupResponse[]> {
    return this.callSolver<WasmErrorLookupResponse[]>("list_public_errors", {});
  }

  public async getPublicError(errorCode: string): Promise<WasmErrorLookupResponse> {
    return this.callSolver<WasmErrorLookupResponse>("get_public_error", {
      args: [errorCode],
    });
  }

  public async listSolvers(): Promise<WasmSolverCatalogResponse> {
    return this.callSolver<WasmSolverCatalogResponse>("list_solvers", {});
  }

  public async getSolverDescriptor(solverId: string): Promise<WasmSolverDescriptor> {
    return this.callSolver<WasmSolverDescriptor>("get_solver_descriptor", {
      args: [solverId],
    });
  }

  public async validateScenarioContract(
    scenarioPayload: WasmContractSolveInput,
  ): Promise<WasmValidateResponse> {
    return this.callSolver<WasmValidateResponse>("validate_scenario", {
      scenarioPayload,
    });
  }

  public async getDefaultSettings(): Promise<SolverSettings> {
    return this.getDefaultSolverConfiguration();
  }

  public async getRecommendedSettings(
    scenario: Scenario,
    desiredRuntimeSeconds: number,
  ): Promise<SolverSettings> {
    return this.callSolver<SolverSettings>("recommend_settings", {
      recommendRequest: buildWasmRecommendSettingsRequest(scenario, desiredRuntimeSeconds),
    });
  }

  public async recommendSettingsContract(
    recommendRequest: WasmRecommendSettingsRequest,
  ): Promise<SolverSettings> {
    return this.callSolver<SolverSettings>("recommend_settings", {
      recommendRequest,
    });
  }

  public async evaluateInputContract(
    scenarioPayload: WasmContractSolveInput,
  ): Promise<RustResult> {
    return this.callSolver<RustResult>("evaluate_input", {
      scenarioPayload,
    });
  }

  public async inspectResult(resultPayload: RustResult): Promise<WasmResultSummary> {
    return this.callSolver<WasmResultSummary>("inspect_result", {
      resultPayload,
    });
  }
}

export const solverWorkerService = new SolverWorkerService();
