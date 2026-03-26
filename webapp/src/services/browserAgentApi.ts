import { SolverWorkerService } from './solverWorker';
import { WasmContractClient } from './wasm/contracts';
import type {
  WasmBootstrapResponse,
  WasmErrorLookupResponse,
  WasmOperationHelpResponse,
  WasmRecommendSettingsRequest,
  WasmResultSummary,
  WasmSchemaLookupResponse,
  WasmSchemaSummary,
  WasmValidateResponse,
} from './wasm/module';
import type { ProgressCallback, ProgressUpdate, RustResult } from './wasm/types';
import type { SolverSettings } from '../types';

declare global {
  interface Window {
    GroupMixerAgent?: BrowserAgentApi;
  }
}

export const BROWSER_AGENT_GLOBAL = 'GroupMixerAgent';
export const BROWSER_AGENT_READY_EVENT = 'groupmixer:agent-ready';
export const BROWSER_AGENT_BOOTSTRAP_ID = 'groupmixer-agent-bootstrap';
export const BROWSER_AGENT_BOOTSTRAP_SPEC = {
  version: '1',
  kind: 'browser-agent-api',
  global: BROWSER_AGENT_GLOBAL,
  readyEvent: BROWSER_AGENT_READY_EVENT,
  preferredTransport: 'worker',
  transports: ['worker', 'wasm'],
  bootstrapMethod: 'capabilities',
} as const;

export interface BrowserAgentTransportApi {
  initialize(): Promise<void>;
  capabilities(): Promise<WasmBootstrapResponse>;
  getOperationHelp(operationId: string): Promise<WasmOperationHelpResponse>;
  listSchemas(): Promise<WasmSchemaSummary[]>;
  getSchema(schemaId: string): Promise<WasmSchemaLookupResponse>;
  listPublicErrors(): Promise<WasmErrorLookupResponse[]>;
  getPublicError(errorCode: string): Promise<WasmErrorLookupResponse>;
  solve(input: Record<string, unknown>): Promise<RustResult>;
  solveWithProgress(
    input: Record<string, unknown>,
    progressCallback?: ProgressCallback,
  ): Promise<{ result: RustResult; lastProgress: ProgressUpdate | null }>;
  validateScenario(input: Record<string, unknown>): Promise<WasmValidateResponse>;
  getDefaultSolverConfiguration(): Promise<SolverSettings>;
  recommendSettings(input: WasmRecommendSettingsRequest): Promise<SolverSettings>;
  evaluateInput(input: Record<string, unknown>): Promise<RustResult>;
  inspectResult(result: RustResult): Promise<WasmResultSummary>;
}

export interface BrowserAgentApi {
  version: '1';
  runtime: 'browser';
  wasm: BrowserAgentTransportApi;
  worker: BrowserAgentTransportApi;
}

export interface BrowserAgentApiDeps {
  wasm?: BrowserAgentTransportApi;
  worker?: BrowserAgentTransportApi;
}

class WasmBrowserAgentTransport implements BrowserAgentTransportApi {
  constructor(private readonly client = new WasmContractClient()) {}

  async initialize(): Promise<void> {
    await this.client.initialize();
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

  solve(input: Record<string, unknown>): Promise<RustResult> {
    return this.client.solveContract(input);
  }

  solveWithProgress(
    input: Record<string, unknown>,
    progressCallback?: ProgressCallback,
  ): Promise<{ result: RustResult; lastProgress: ProgressUpdate | null }> {
    return this.client.solveContractWithProgress(input, progressCallback);
  }

  validateScenario(input: Record<string, unknown>): Promise<WasmValidateResponse> {
    return this.client.validateScenarioContract(input);
  }

  getDefaultSolverConfiguration(): Promise<SolverSettings> {
    return this.client.getDefaultSolverConfiguration();
  }

  recommendSettings(input: WasmRecommendSettingsRequest): Promise<SolverSettings> {
    return this.client.recommendSettingsContract(input);
  }

  evaluateInput(input: Record<string, unknown>): Promise<RustResult> {
    return this.client.evaluateInputContract(input);
  }

  inspectResult(result: RustResult): Promise<WasmResultSummary> {
    return this.client.inspectResult(result);
  }
}

class WorkerBrowserAgentTransport implements BrowserAgentTransportApi {
  constructor(private readonly worker = new SolverWorkerService()) {}

  initialize(): Promise<void> {
    return this.worker.initialize();
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

  solve(input: Record<string, unknown>): Promise<RustResult> {
    return this.worker.solveContract(input);
  }

  solveWithProgress(
    input: Record<string, unknown>,
    progressCallback?: ProgressCallback,
  ): Promise<{ result: RustResult; lastProgress: ProgressUpdate | null }> {
    return this.worker.solveContractWithProgress(input, progressCallback);
  }

  validateScenario(input: Record<string, unknown>): Promise<WasmValidateResponse> {
    return this.worker.validateScenarioContract(input);
  }

  getDefaultSolverConfiguration(): Promise<SolverSettings> {
    return this.worker.getDefaultSolverConfiguration();
  }

  recommendSettings(input: WasmRecommendSettingsRequest): Promise<SolverSettings> {
    return this.worker.recommendSettingsContract(input);
  }

  evaluateInput(input: Record<string, unknown>): Promise<RustResult> {
    return this.worker.evaluateInputContract(input);
  }

  inspectResult(result: RustResult): Promise<WasmResultSummary> {
    return this.worker.inspectResult(result);
  }
}

export function createBrowserAgentApi(deps: BrowserAgentApiDeps = {}): BrowserAgentApi {
  return {
    version: BROWSER_AGENT_BOOTSTRAP_SPEC.version,
    runtime: 'browser',
    wasm: deps.wasm ?? new WasmBrowserAgentTransport(),
    worker: deps.worker ?? new WorkerBrowserAgentTransport(),
  };
}

export function installBrowserAgentApi(
  targetWindow: Window,
  api: BrowserAgentApi = createBrowserAgentApi(),
): BrowserAgentApi {
  targetWindow[BROWSER_AGENT_GLOBAL as 'GroupMixerAgent'] = api;
  targetWindow.dispatchEvent(
    new CustomEvent(BROWSER_AGENT_READY_EVENT, {
      detail: { api },
    }),
  );
  return api;
}
