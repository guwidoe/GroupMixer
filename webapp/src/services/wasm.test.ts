import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scenario } from "../types";
import { createSampleScenario, createSampleSolution } from "../test/fixtures";
import { WasmService } from "./wasm";

const contractClientMock = vi.hoisted(() => ({
  evaluateInput: vi.fn(),
}));

vi.mock("./wasm/contracts", () => ({
  WasmContractClient: vi.fn(function WasmContractClient() {
    return contractClientMock;
  }),
}));

function createScenario(): Scenario {
  return createSampleScenario();
}

describe("WasmService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates structured evaluation to the contract client", async () => {
    const service = new WasmService(async () => ({}));
    const solution = createSampleSolution();
    const scenario = createScenario();
    const assignments = solution.assignments.slice(0, 2);
    contractClientMock.evaluateInput.mockResolvedValue(solution);

    await expect(service.evaluateSolution(scenario, assignments)).resolves.toEqual(solution);
    expect(contractClientMock.evaluateInput).toHaveBeenCalledWith(scenario, assignments);
  });
});
