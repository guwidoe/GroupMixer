import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Problem } from "../types";
import { createSampleProblem, createSampleSolution, createSampleSolverSettings } from "../test/fixtures";
import { WasmService } from "./wasm";

const contractClientMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  solve: vi.fn(),
  solveWithProgress: vi.fn(),
  validateProblem: vi.fn(),
  getDefaultSolverConfiguration: vi.fn(),
  recommendSettings: vi.fn(),
  evaluateInput: vi.fn(),
  isReady: vi.fn(() => false),
  isLoading: vi.fn(() => false),
  hasInitializationFailed: vi.fn(() => false),
}));

vi.mock("./wasm/contracts", () => ({
  WasmContractClient: vi.fn(function WasmContractClient() {
    return contractClientMock;
  }),
}));

function createProblem(): Problem {
  return createSampleProblem();
}

describe("WasmService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates initialization and readiness helpers to the contract client", async () => {
    const service = new WasmService(async () => ({}));

    await service.initialize();

    expect(contractClientMock.initialize).toHaveBeenCalledTimes(1);
    expect(service.isReady()).toBe(false);
    expect(service.isLoading()).toBe(false);
    expect(service.hasInitializationFailed()).toBe(false);
  });

  it("delegates solve and solveWithProgress to the contract client", async () => {
    const service = new WasmService(async () => ({}));
    const solution = createSampleSolution();
    contractClientMock.solve.mockResolvedValue(solution);
    contractClientMock.solveWithProgress.mockResolvedValue({
      solution,
      lastProgress: { iteration: 7 },
    });

    await expect(service.solve(createProblem())).resolves.toEqual(solution);
    await expect(service.solveWithProgress(createProblem(), vi.fn())).resolves.toEqual({
      solution,
      lastProgress: { iteration: 7 },
    });
  });

  it("maps shared validation issues into the legacy errors array shape", async () => {
    const service = new WasmService(async () => ({}));
    contractClientMock.validateProblem.mockResolvedValue({
      valid: false,
      issues: [
        { message: "No people defined" },
        { message: "No groups defined" },
      ],
    });

    await expect(service.validateProblem(createProblem())).resolves.toEqual({
      valid: false,
      errors: ["No people defined", "No groups defined"],
    });
  });

  it("delegates default and recommended settings requests to the contract client", async () => {
    const service = new WasmService(async () => ({}));
    const settings = createSampleSolverSettings();
    const problem = createProblem();
    contractClientMock.getDefaultSolverConfiguration.mockResolvedValue(settings);
    contractClientMock.recommendSettings.mockResolvedValue(settings);

    await expect(service.getDefaultSettings()).resolves.toEqual(settings);
    await expect(service.getRecommendedSettings(problem, 11)).resolves.toEqual(settings);
    expect(contractClientMock.recommendSettings).toHaveBeenCalledWith(problem, 11);
  });

  it("delegates structured evaluation to the contract client", async () => {
    const service = new WasmService(async () => ({}));
    const solution = createSampleSolution();
    const problem = createProblem();
    const assignments = solution.assignments.slice(0, 2);
    contractClientMock.evaluateInput.mockResolvedValue(solution);

    await expect(service.evaluateSolution(problem, assignments)).resolves.toEqual(solution);
    expect(contractClientMock.evaluateInput).toHaveBeenCalledWith(problem, assignments);
  });
});
