import { SolverWorkerService } from '../solverWorker';
import { WasmContractClient } from '../wasm/contracts';
import type {
  WasmBootstrapResponse,
  WasmContractSolveInput,
  WasmErrorLookupResponse,
  WasmOperationHelpResponse,
  WasmRecommendSettingsRequest,
  WasmResultSummary,
  WasmSchemaLookupResponse,
  WasmSchemaSummary,
  WasmSolverCatalogResponse,
  WasmSolverDescriptor,
  WasmValidateResponse,
} from '../wasm/module';
import type { ProgressCallback, ProgressUpdate, RustResult } from '../wasm/types';
import type { SolverSettings } from '../../types';

export interface SolverContractTransport {
  initialize(): Promise<void>;
  isReady(): boolean;
  capabilities(): Promise<WasmBootstrapResponse>;
  getOperationHelp(operationId: string): Promise<WasmOperationHelpResponse>;
  listSchemas(): Promise<WasmSchemaSummary[]>;
  getSchema(schemaId: string): Promise<WasmSchemaLookupResponse>;
  listPublicErrors(): Promise<WasmErrorLookupResponse[]>;
  getPublicError(errorCode: string): Promise<WasmErrorLookupResponse>;
  listSolvers(): Promise<WasmSolverCatalogResponse>;
  getSolverDescriptor(solverId: string): Promise<WasmSolverDescriptor>;
  solve(input: WasmContractSolveInput): Promise<RustResult>;
  solveWithProgress(
    input: WasmContractSolveInput,
    progressCallback?: ProgressCallback,
  ): Promise<{ result: RustResult; lastProgress: ProgressUpdate | null }>;
  validateScenario(input: WasmContractSolveInput): Promise<WasmValidateResponse>;
  getDefaultSolverConfiguration(): Promise<SolverSettings>;
  recommendSettings(input: WasmRecommendSettingsRequest): Promise<SolverSettings>;
  evaluateInput(input: WasmContractSolveInput): Promise<RustResult>;
  inspectResult(result: RustResult): Promise<WasmResultSummary>;
  cancel?(): Promise<void>;
  getLastProgressUpdate?(): ProgressUpdate | null;
  terminate?(): void;
}

export class WasmContractTransport implements SolverContractTransport {
  constructor(private readonly client = new WasmContractClient()) {}

  async initialize(): Promise<void> {
    await this.client.initialize();
  }

  isReady(): boolean {
    return this.client.isReady();
  }

  capabilities(): Promise<WasmBootstrapResponse> {
    return this.client.capabilities();
  }

  getOperationHelp(operationId: string): Promise<WasmOperationHelpResponse> {
    return this.client.getOperationHelp(operationId);
  }

  listSchemas(): Promise<WasmSchemaSummary[]> {
    return this.client.listSchemas();
  }

  getSchema(schemaId: string): Promise<WasmSchemaLookupResponse> {
    return this.client.getSchema(schemaId);
  }

  listPublicErrors(): Promise<WasmErrorLookupResponse[]> {
    return this.client.listPublicErrors();
  }

  getPublicError(errorCode: string): Promise<WasmErrorLookupResponse> {
    return this.client.getPublicError(errorCode);
  }

  listSolvers(): Promise<WasmSolverCatalogResponse> {
    return this.client.listSolvers();
  }

  getSolverDescriptor(solverId: string): Promise<WasmSolverDescriptor> {
    return this.client.getSolverDescriptor(solverId);
  }

  solve(input: WasmContractSolveInput): Promise<RustResult> {
    return this.client.solveContract(input);
  }

  solveWithProgress(
    input: WasmContractSolveInput,
    progressCallback?: ProgressCallback,
  ): Promise<{ result: RustResult; lastProgress: ProgressUpdate | null }> {
    return this.client.solveContractWithProgress(input, progressCallback);
  }

  validateScenario(input: WasmContractSolveInput): Promise<WasmValidateResponse> {
    return this.client.validateScenarioContract(input);
  }

  getDefaultSolverConfiguration(): Promise<SolverSettings> {
    return this.client.getDefaultSolverConfiguration();
  }

  recommendSettings(input: WasmRecommendSettingsRequest): Promise<SolverSettings> {
    return this.client.recommendSettingsContract(input);
  }

  evaluateInput(input: WasmContractSolveInput): Promise<RustResult> {
    return this.client.evaluateInputContract(input);
  }

  inspectResult(result: RustResult): Promise<WasmResultSummary> {
    return this.client.inspectResult(result);
  }
}

export class WorkerContractTransport implements SolverContractTransport {
  constructor(private readonly worker = new SolverWorkerService()) {}

  initialize(): Promise<void> {
    return this.worker.initialize();
  }

  isReady(): boolean {
    return this.worker.isReady();
  }

  capabilities(): Promise<WasmBootstrapResponse> {
    return this.worker.capabilities();
  }

  getOperationHelp(operationId: string): Promise<WasmOperationHelpResponse> {
    return this.worker.getOperationHelp(operationId);
  }

  listSchemas(): Promise<WasmSchemaSummary[]> {
    return this.worker.listSchemas();
  }

  getSchema(schemaId: string): Promise<WasmSchemaLookupResponse> {
    return this.worker.getSchema(schemaId);
  }

  listPublicErrors(): Promise<WasmErrorLookupResponse[]> {
    return this.worker.listPublicErrors();
  }

  getPublicError(errorCode: string): Promise<WasmErrorLookupResponse> {
    return this.worker.getPublicError(errorCode);
  }

  listSolvers(): Promise<WasmSolverCatalogResponse> {
    return this.worker.listSolvers();
  }

  getSolverDescriptor(solverId: string): Promise<WasmSolverDescriptor> {
    return this.worker.getSolverDescriptor(solverId);
  }

  solve(input: WasmContractSolveInput): Promise<RustResult> {
    return this.worker.solveContract(input);
  }

  solveWithProgress(
    input: WasmContractSolveInput,
    progressCallback?: ProgressCallback,
  ): Promise<{ result: RustResult; lastProgress: ProgressUpdate | null }> {
    return this.worker.solveContractWithProgress(input, progressCallback);
  }

  validateScenario(input: WasmContractSolveInput): Promise<WasmValidateResponse> {
    return this.worker.validateScenarioContract(input);
  }

  getDefaultSolverConfiguration(): Promise<SolverSettings> {
    return this.worker.getDefaultSolverConfiguration();
  }

  recommendSettings(input: WasmRecommendSettingsRequest): Promise<SolverSettings> {
    return this.worker.recommendSettingsContract(input);
  }

  evaluateInput(input: WasmContractSolveInput): Promise<RustResult> {
    return this.worker.evaluateInputContract(input);
  }

  inspectResult(result: RustResult): Promise<WasmResultSummary> {
    return this.worker.inspectResult(result);
  }

  cancel(): Promise<void> {
    return this.worker.cancel();
  }

  getLastProgressUpdate(): ProgressUpdate | null {
    return this.worker.getLastProgressUpdate();
  }

  terminate(): void {
    this.worker.terminate();
  }
}

export function createWasmContractTransport(client?: WasmContractClient): SolverContractTransport {
  return new WasmContractTransport(client);
}

export function createWorkerContractTransport(worker?: SolverWorkerService): SolverContractTransport {
  return new WorkerContractTransport(worker);
}
