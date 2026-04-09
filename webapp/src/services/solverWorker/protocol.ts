import type { WasmContractSolveInput, WasmRecommendSettingsRequest } from "../wasm/module";
import type { ProgressUpdate, RustResult } from "../wasm/types";
import type { WarmStartSchedule } from "../wasm/scenarioContract";

export type SolverRpcMethod =
  | "capabilities"
  | "get_operation_help"
  | "list_schemas"
  | "get_schema"
  | "list_public_errors"
  | "get_public_error"
  | "list_solvers"
  | "get_solver_descriptor"
  | "validate_scenario"
  | "get_default_solver_configuration"
  | "recommend_settings"
  | "evaluate_input"
  | "inspect_result";

export const SOLVER_RPC_METHODS = [
  "capabilities",
  "get_operation_help",
  "list_schemas",
  "get_schema",
  "list_public_errors",
  "get_public_error",
  "list_solvers",
  "get_solver_descriptor",
  "validate_scenario",
  "get_default_solver_configuration",
  "recommend_settings",
  "evaluate_input",
  "inspect_result",
] as const satisfies readonly SolverRpcMethod[];

export function isSolverRpcMethod(value: string): value is SolverRpcMethod {
  return (SOLVER_RPC_METHODS as readonly string[]).includes(value);
}

export interface SolverMessageData {
  scenarioPayload?: WasmContractSolveInput;
  resultPayload?: RustResult;
  useProgress?: boolean;
  recommendRequest?: WasmRecommendSettingsRequest;
  args?: unknown[];
}

export interface InitRequestMessage {
  type: "INIT";
  id: string;
}

export interface CancelRequestMessage {
  type: "CANCEL";
  id: string;
}

export interface SolveRequestMessage {
  type: "SOLVE";
  id: string;
  data: {
    scenarioPayload: WasmContractSolveInput;
    useProgress?: boolean;
    progressMailbox?: SharedArrayBuffer;
  };
}

export interface RpcRequestMessage {
  type: SolverRpcMethod;
  id: string;
  data: SolverMessageData;
}

export type WorkerRequestMessage =
  | InitRequestMessage
  | CancelRequestMessage
  | SolveRequestMessage
  | RpcRequestMessage;

export interface WorkerErrorData {
  error: string;
  scenarioJson?: string;
  filename?: string;
  lineno?: number;
  stack?: string;
}

export interface InitSuccessMessage {
  type: "INIT_SUCCESS";
  id: string;
}

export interface ProgressMessage {
  type: "PROGRESS";
  id: string;
  data: {
    progress: ProgressUpdate;
  };
}

export interface BestScheduleMessage {
  type: "BEST_SCHEDULE";
  id: string;
  data: {
    schedule: WarmStartSchedule;
  };
}

export interface SolveSuccessMessage {
  type: "SOLVE_SUCCESS";
  id: string;
  data: {
    result: RustResult;
    lastProgress?: ProgressUpdate | null;
  };
}

export interface CancelledMessage {
  type: "CANCELLED";
  id: string;
}

export interface RequestErrorMessage {
  type: "ERROR" | "RPC_ERROR";
  id: string;
  data: WorkerErrorData;
}

export interface RpcSuccessMessage {
  type: "RPC_SUCCESS";
  id: string;
  data: {
    result: unknown;
  };
}

export interface LogMessage {
  type: "LOG";
  id?: string;
  data: {
    level?: string;
    args?: unknown[];
  };
}

export interface ScenarioJsonMessage {
  type: "PROBLEM_JSON";
  id?: string;
  data: {
    scenarioJson?: string;
  };
}

export interface FatalErrorMessage {
  type: "FATAL_ERROR";
  data: WorkerErrorData;
}

export function createInitRequestMessage(id: string): InitRequestMessage {
  return { type: "INIT", id };
}

export function createCancelRequestMessage(id: string): CancelRequestMessage {
  return { type: "CANCEL", id };
}

export function createSolveRequestMessage(
  id: string,
  scenarioPayload: WasmContractSolveInput,
  useProgress = false,
  progressMailbox?: SharedArrayBuffer,
): SolveRequestMessage {
  return {
    type: "SOLVE",
    id,
    data: { scenarioPayload, useProgress, progressMailbox },
  };
}

export function createRpcRequestMessage(
  method: SolverRpcMethod,
  id: string,
  data: SolverMessageData,
): RpcRequestMessage {
  return {
    type: method,
    id,
    data,
  };
}

export function createProgressMessage(
  id: string,
  progress: ProgressUpdate,
): ProgressMessage {
  return {
    type: "PROGRESS",
    id,
    data: { progress },
  };
}

export function createBestScheduleMessage(
  id: string,
  schedule: WarmStartSchedule,
): BestScheduleMessage {
  return {
    type: "BEST_SCHEDULE",
    id,
    data: { schedule },
  };
}

export function createSolveSuccessMessage(
  id: string,
  result: RustResult,
  lastProgress?: ProgressUpdate | null,
): SolveSuccessMessage {
  return {
    type: "SOLVE_SUCCESS",
    id,
    data: { result, lastProgress },
  };
}

export function createRpcSuccessMessage<T>(
  id: string,
  result: T,
): RpcSuccessMessage {
  return {
    type: "RPC_SUCCESS",
    id,
    data: { result },
  };
}

export function createRequestErrorMessage(
  id: string,
  data: WorkerErrorData,
  type: RequestErrorMessage["type"] = "ERROR",
): RequestErrorMessage {
  return {
    type,
    id,
    data,
  };
}

export function createFatalErrorMessage(data: WorkerErrorData): FatalErrorMessage {
  return {
    type: "FATAL_ERROR",
    data,
  };
}

export type WorkerResponseMessage =
  | InitSuccessMessage
  | ProgressMessage
  | BestScheduleMessage
  | SolveSuccessMessage
  | CancelledMessage
  | RequestErrorMessage
  | RpcSuccessMessage
  | LogMessage
  | ScenarioJsonMessage
  | FatalErrorMessage;

export interface SolverRunResult {
  result: RustResult;
  lastProgress: ProgressUpdate | null;
}

export interface SolverRunOutcome {
  solution: RustResult;
  lastProgress: ProgressUpdate | null;
}
