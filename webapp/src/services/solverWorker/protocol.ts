import type { ProgressUpdate } from "../wasm/types";

export type SolverRpcMethod =
  | "get_default_settings"
  | "get_recommended_settings";

export const SOLVER_RPC_METHODS = [
  "get_default_settings",
  "get_recommended_settings",
] as const satisfies readonly SolverRpcMethod[];

export function isSolverRpcMethod(value: string): value is SolverRpcMethod {
  return (SOLVER_RPC_METHODS as readonly string[]).includes(value);
}

export interface SolverMessageData {
  problemJson?: string;
  useProgress?: boolean;
  args?: unknown[];
  desired_runtime_seconds?: number;
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
    problemJson: string;
    useProgress?: boolean;
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
  problemJson?: string;
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
    progressJson: string;
  };
}

export interface SolveSuccessMessage {
  type: "SOLVE_SUCCESS";
  id: string;
  data: {
    result: string;
    lastProgressJson?: string | null;
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
    result: string;
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

export interface ProblemJsonMessage {
  type: "PROBLEM_JSON";
  id?: string;
  data: {
    problemJson?: string;
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
  problemJson: string,
  useProgress = false,
): SolveRequestMessage {
  return {
    type: "SOLVE",
    id,
    data: { problemJson, useProgress },
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
  progressJson: string,
): ProgressMessage {
  return {
    type: "PROGRESS",
    id,
    data: { progressJson },
  };
}

export function createSolveSuccessMessage(
  id: string,
  result: string,
  lastProgressJson?: string | null,
): SolveSuccessMessage {
  return {
    type: "SOLVE_SUCCESS",
    id,
    data: { result, lastProgressJson },
  };
}

export function createRpcSuccessMessage(
  id: string,
  result: string,
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
  | SolveSuccessMessage
  | CancelledMessage
  | RequestErrorMessage
  | RpcSuccessMessage
  | LogMessage
  | ProblemJsonMessage
  | FatalErrorMessage;

export interface SolverRunResult {
  result: string;
  lastProgress: ProgressUpdate | null;
}

export interface SolverRunOutcome {
  solutionJson: string;
  lastProgress: ProgressUpdate | null;
}
