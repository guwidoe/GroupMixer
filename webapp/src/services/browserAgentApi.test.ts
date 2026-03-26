import { describe, expect, it, vi } from 'vitest';
import {
  BROWSER_AGENT_GLOBAL,
  BROWSER_AGENT_READY_EVENT,
  createBrowserAgentApi,
  installBrowserAgentApi,
  type BrowserAgentApi,
} from './browserAgentApi';

function createApi(): BrowserAgentApi {
  const wasm = {
    initialize: vi.fn(async () => undefined),
    capabilities: vi.fn(async () => ({ bootstrap: { title: 'GroupMixer solver contracts' } })),
    getOperationHelp: vi.fn(async (operationId: string) => ({ operation: { id: operationId } })),
    listSchemas: vi.fn(async () => [{ id: 'solve-request', version: '1.0.0' }]),
    getSchema: vi.fn(async (schemaId: string) => ({ id: schemaId, version: '1.0.0', schema: {} })),
    listPublicErrors: vi.fn(async () => [{ error: { code: 'invalid-input', message: 'bad input' } }]),
    getPublicError: vi.fn(async (errorCode: string) => ({ error: { code: errorCode, message: 'bad input' } })),
    solve: vi.fn(async () => ({ schedule: {}, final_score: 1 })),
    solveWithProgress: vi.fn(async () => ({ result: { schedule: {}, final_score: 1 }, lastProgress: { iteration: 1 } })),
    validateProblem: vi.fn(async () => ({ valid: true, issues: [] })),
    getDefaultSolverConfiguration: vi.fn(async () => ({ solver_type: 'SimulatedAnnealing' })),
    recommendSettings: vi.fn(async () => ({ solver_type: 'SimulatedAnnealing' })),
    evaluateInput: vi.fn(async () => ({ schedule: {}, final_score: 1 })),
    inspectResult: vi.fn(async () => ({ final_score: 1, unique_contacts: 1, repetition_penalty: 0, attribute_balance_penalty: 0, constraint_penalty: 0 })),
  };

  const worker = {
    initialize: vi.fn(async () => undefined),
    capabilities: vi.fn(async () => ({ bootstrap: { title: 'GroupMixer solver contracts' } })),
    getOperationHelp: vi.fn(async (operationId: string) => ({ operation: { id: operationId } })),
    listSchemas: vi.fn(async () => [{ id: 'solve-request', version: '1.0.0' }]),
    getSchema: vi.fn(async (schemaId: string) => ({ id: schemaId, version: '1.0.0', schema: {} })),
    listPublicErrors: vi.fn(async () => [{ error: { code: 'invalid-input', message: 'bad input' } }]),
    getPublicError: vi.fn(async (errorCode: string) => ({ error: { code: errorCode, message: 'bad input' } })),
    solve: vi.fn(async () => ({ schedule: {}, final_score: 1 })),
    solveWithProgress: vi.fn(async () => ({ result: { schedule: {}, final_score: 1 }, lastProgress: { iteration: 1 } })),
    validateProblem: vi.fn(async () => ({ valid: true, issues: [] })),
    getDefaultSolverConfiguration: vi.fn(async () => ({ solver_type: 'SimulatedAnnealing' })),
    recommendSettings: vi.fn(async () => ({ solver_type: 'SimulatedAnnealing' })),
    evaluateInput: vi.fn(async () => ({ schedule: {}, final_score: 1 })),
    inspectResult: vi.fn(async () => ({ final_score: 1, unique_contacts: 1, repetition_penalty: 0, attribute_balance_penalty: 0, constraint_penalty: 0 })),
  };

  return createBrowserAgentApi({ wasm, worker });
}

describe('browserAgentApi', () => {
  it('creates a browser-facing API that exposes direct wasm and worker namespaces', async () => {
    const api = createApi();

    await api.wasm.initialize();
    await api.worker.initialize();

    expect(await api.wasm.capabilities()).toEqual({ bootstrap: { title: 'GroupMixer solver contracts' } });
    expect(await api.worker.capabilities()).toEqual({ bootstrap: { title: 'GroupMixer solver contracts' } });
    expect(await api.worker.getOperationHelp('solve')).toEqual({ operation: { id: 'solve' } });
    expect(await api.worker.solve({ problem: { people: [] } })).toEqual({ schedule: {}, final_score: 1 });
  });

  it('installs the browser agent API on window and emits a ready event', async () => {
    const api = createApi();
    const readyListener = vi.fn();
    window.addEventListener(BROWSER_AGENT_READY_EVENT, readyListener);

    const installed = installBrowserAgentApi(window, api);

    expect(installed).toBe(api);
    expect(window[BROWSER_AGENT_GLOBAL as keyof Window]).toBe(api);

    await vi.waitFor(() => {
      expect(readyListener).toHaveBeenCalledTimes(1);
    });

    expect(readyListener.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        detail: { api },
      }),
    );
  });
});
