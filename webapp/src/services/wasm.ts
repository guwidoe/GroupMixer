import type { Assignment, Problem, Solution, SolverSettings } from "../types";
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

  async solve(problem: Problem): Promise<Solution> {
    return this.contractClient.solve(problem);
  }

  async solveWithProgress(
    problem: Problem,
    progressCallback?: ProgressCallback,
  ): Promise<{ solution: Solution; lastProgress: ProgressUpdate | null }> {
    return this.contractClient.solveWithProgress(problem, progressCallback);
  }

  async validateProblem(
    problem: Problem,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const response = await this.contractClient.validateProblem(problem);
    return {
      valid: response.valid,
      errors: response.issues.map((issue) => issue.message),
    };
  }

  async getDefaultSettings(): Promise<SolverSettings> {
    return this.contractClient.getDefaultSolverConfiguration();
  }

  async getRecommendedSettings(
    problem: Problem,
    desiredRuntimeSeconds: number,
  ): Promise<SolverSettings> {
    return this.contractClient.recommendSettings(problem, desiredRuntimeSeconds);
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
    problem: Problem,
    assignments: Assignment[],
  ): Promise<Solution> {
    return this.contractClient.evaluateInput(problem, assignments);
  }
}

export const wasmService = new WasmService();
