import type { Assignment, Scenario, Solution } from "../types";
import { WasmContractClient } from "./wasm/contracts";
import type { WasmModuleLoader } from "./wasm/module";

export class WasmService {
  private readonly contractClient: WasmContractClient;

  constructor(loadModule?: WasmModuleLoader) {
    this.contractClient = new WasmContractClient(loadModule);
  }

  async evaluateSolution(
    scenario: Scenario,
    assignments: Assignment[],
  ): Promise<Solution> {
    return this.contractClient.evaluateInput(scenario, assignments);
  }
}

export const wasmService = new WasmService();
