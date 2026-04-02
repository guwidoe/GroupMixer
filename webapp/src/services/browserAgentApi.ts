import type { SolverSettings } from '../types';
import {
  createWasmContractTransport,
  createWorkerContractTransport,
  type SolverContractTransport,
} from './runtimeAdapters/contractTransport';

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

export type BrowserAgentTransportApi = SolverContractTransport;
export type { SolverSettings };

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

export function createBrowserAgentApi(deps: BrowserAgentApiDeps = {}): BrowserAgentApi {
  return {
    version: BROWSER_AGENT_BOOTSTRAP_SPEC.version,
    runtime: 'browser',
    wasm: deps.wasm ?? createWasmContractTransport(),
    worker: deps.worker ?? createWorkerContractTransport(),
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
