import type { Assignment, Scenario, Solution, SolverSettings } from "../types";
import { WasmContractClient } from "./wasm/contracts";
import type { WasmModuleLoader } from "./wasm/module";
import type { ProgressCallback, ProgressUpdate } from "./wasm/types";

export class WasmService {
  private readonly contractClient: WasmContractClient;

  constructor(loadModule?: WasmModuleLoader) {
    this.contractClient = new WasmContractClient(loadModule);
  }

  async initialize(): Promise<void> {
    await this.contractClient.initialize();
  }

  async solve(scenario: Scenario): Promise<Solution> {
    return this.contractClient.solve(scenario);
  }

  async solveWithProgress(
    scenario: Scenario,
    progressCallback?: ProgressCallback,
  ): Promise<{ solution: Solution; lastProgress: ProgressUpdate | null }> {
    return this.contractClient.solveWithProgress(scenario, progressCallback);
  }

  async validateScenario(
    scenario: Scenario,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const response = await this.contractClient.validateScenario(scenario);
    return {
      valid: response.valid,
      errors: response.issues.map((issue) => issue.message),
    };
  }

  async getDefaultSettings(): Promise<SolverSettings> {
    return this.contractClient.getDefaultSolverConfiguration();
  }

  async getRecommendedSettings(
    scenario: Scenario,
    desiredRuntimeSeconds: number,
  ): Promise<SolverSettings> {
    return this.contractClient.recommendSettings(scenario, desiredRuntimeSeconds);
  }

  isReady(): boolean {
    return this.contractClient.isReady();
  }

  isLoading(): boolean {
    return this.contractClient.isLoading();
  }

  hasInitializationFailed(): boolean {
    return this.contractClient.hasInitializationFailed();
  }

  async evaluateSolution(
    scenario: Scenario,
    assignments: Assignment[],
  ): Promise<Solution> {
    return this.contractClient.evaluateInput(scenario, assignments);
  }
}

export const wasmService = new WasmService();
