import type { ProgressUpdate } from "../wasm/types";

export type SolverRpcMethod =
  | "get_default_settings"
  | "get_recommended_settings";

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
