import { describe, expect, it } from "vitest";
import {
  SOLVER_RPC_METHODS,
  createCancelRequestMessage,
  createFatalErrorMessage,
  createInitRequestMessage,
  createProgressMessage,
  createRequestErrorMessage,
  createRpcRequestMessage,
  createRpcSuccessMessage,
  createSolveRequestMessage,
  createSolveSuccessMessage,
  isSolverRpcMethod,
} from "./protocol";

describe("solver worker protocol", () => {
  it("exposes the supported RPC methods as a runtime-checked catalog", () => {
    expect(SOLVER_RPC_METHODS).toEqual([
      "capabilities",
      "get_operation_help",
      "list_schemas",
      "get_schema",
      "list_public_errors",
      "get_public_error",
      "validate_problem",
      "get_default_solver_configuration",
      "recommend_settings",
      "evaluate_input",
      "inspect_result",
    ]);
    expect(isSolverRpcMethod("capabilities")).toBe(true);
    expect(isSolverRpcMethod("get_operation_help")).toBe(true);
    expect(isSolverRpcMethod("list_schemas")).toBe(true);
    expect(isSolverRpcMethod("get_schema")).toBe(true);
    expect(isSolverRpcMethod("list_public_errors")).toBe(true);
    expect(isSolverRpcMethod("get_public_error")).toBe(true);
    expect(isSolverRpcMethod("validate_problem")).toBe(true);
    expect(isSolverRpcMethod("get_default_solver_configuration")).toBe(true);
    expect(isSolverRpcMethod("recommend_settings")).toBe(true);
    expect(isSolverRpcMethod("evaluate_input")).toBe(true);
    expect(isSolverRpcMethod("inspect_result")).toBe(true);
    expect(isSolverRpcMethod("not-a-method")).toBe(false);
  });

  it("builds request messages with the expected boundary shape", () => {
    expect(createInitRequestMessage("1")).toEqual({ type: "INIT", id: "1" });
    expect(createCancelRequestMessage("2")).toEqual({ type: "CANCEL", id: "2" });
    expect(createSolveRequestMessage("3", { problem: { people: [] } }, true)).toEqual({
      type: "SOLVE",
      id: "3",
      data: { problemPayload: { problem: { people: [] } }, useProgress: true },
    });
    expect(
      createRpcRequestMessage("recommend_settings", "4", {
        recommendRequest: {
          problem_definition: { people: [] },
          objectives: [],
          constraints: [],
          desired_runtime_seconds: 9,
        },
      }),
    ).toEqual({
      type: "recommend_settings",
      id: "4",
      data: {
        recommendRequest: {
          problem_definition: { people: [] },
          objectives: [],
          constraints: [],
          desired_runtime_seconds: 9,
        },
      },
    });
  });

  it("builds response messages with the expected boundary shape", () => {
    expect(createProgressMessage("5", { iteration: 1 } as never)).toEqual({
      type: "PROGRESS",
      id: "5",
      data: { progress: { iteration: 1 } },
    });
    expect(createSolveSuccessMessage("6", { final_score: 1 } as never, { iteration: 2 } as never)).toEqual({
      type: "SOLVE_SUCCESS",
      id: "6",
      data: { result: { final_score: 1 }, lastProgress: { iteration: 2 } },
    });
    expect(createRpcSuccessMessage("7", { solver_type: "SimulatedAnnealing" })).toEqual({
      type: "RPC_SUCCESS",
      id: "7",
      data: { result: { solver_type: "SimulatedAnnealing" } },
    });
    expect(createRequestErrorMessage("8", { error: "boom" }, "RPC_ERROR")).toEqual({
      type: "RPC_ERROR",
      id: "8",
      data: { error: "boom" },
    });
    expect(createFatalErrorMessage({ error: "fatal" })).toEqual({
      type: "FATAL_ERROR",
      data: { error: "fatal" },
    });
  });
});
