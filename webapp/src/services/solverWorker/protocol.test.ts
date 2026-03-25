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
      "get_default_settings",
      "get_recommended_settings",
    ]);
    expect(isSolverRpcMethod("get_default_settings")).toBe(true);
    expect(isSolverRpcMethod("get_recommended_settings")).toBe(true);
    expect(isSolverRpcMethod("not-a-method")).toBe(false);
  });

  it("builds request messages with the expected boundary shape", () => {
    expect(createInitRequestMessage("1")).toEqual({ type: "INIT", id: "1" });
    expect(createCancelRequestMessage("2")).toEqual({ type: "CANCEL", id: "2" });
    expect(createSolveRequestMessage("3", "problem-json", true)).toEqual({
      type: "SOLVE",
      id: "3",
      data: { problemJson: "problem-json", useProgress: true },
    });
    expect(
      createRpcRequestMessage("get_recommended_settings", "4", {
        problemJson: "problem-json",
        desired_runtime_seconds: 9,
      }),
    ).toEqual({
      type: "get_recommended_settings",
      id: "4",
      data: { problemJson: "problem-json", desired_runtime_seconds: 9 },
    });
  });

  it("builds response messages with the expected boundary shape", () => {
    expect(createProgressMessage("5", "progress-json")).toEqual({
      type: "PROGRESS",
      id: "5",
      data: { progressJson: "progress-json" },
    });
    expect(createSolveSuccessMessage("6", "result-json", "last-progress")).toEqual({
      type: "SOLVE_SUCCESS",
      id: "6",
      data: { result: "result-json", lastProgressJson: "last-progress" },
    });
    expect(createRpcSuccessMessage("7", "settings-json")).toEqual({
      type: "RPC_SUCCESS",
      id: "7",
      data: { result: "settings-json" },
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
