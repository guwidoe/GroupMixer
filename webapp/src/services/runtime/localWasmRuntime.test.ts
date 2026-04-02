import { describe, expect, it, vi } from 'vitest';
import { createSampleScenario, createSampleSolution, createSampleSolverSettings } from '../../test/fixtures';
import type { SolverContractTransport } from '../runtimeAdapters/contractTransport';
import { defineSolverRuntimeContractTests } from './contractTests';
import type { RuntimeProgressUpdate } from './types';
import { LocalWasmRuntime } from './localWasmRuntime';
import { RuntimeCancelledError } from './runtime';

function createBaseTransport(overrides: Partial<SolverContractTransport> = {}): SolverContractTransport {
  return {
    initialize: vi.fn(async () => undefined),
    isReady: vi.fn(() => true),
    capabilities: vi.fn(async () => ({ bootstrap: { title: 'caps' } })),
    getOperationHelp: vi.fn(async () => ({ operation: { id: 'solve' } })),
    listSchemas: vi.fn(async () => []),
    getSchema: vi.fn(async () => ({ id: 'solve-request', version: '1.0.0', schema: {} })),
    listPublicErrors: vi.fn(async () => []),
    getPublicError: vi.fn(async () => ({ error: { code: 'x', message: 'y' } })),
    solve: vi.fn(async () => ({ schedule: {}, final_score: 0, unique_contacts: 0, repetition_penalty: 0, attribute_balance_penalty: 0, constraint_penalty: 0, weighted_repetition_penalty: 0, weighted_constraint_penalty: 0 })),
    solveWithProgress: vi.fn(async () => ({ result: { schedule: {}, final_score: 0, unique_contacts: 0, repetition_penalty: 0, attribute_balance_penalty: 0, constraint_penalty: 0, weighted_repetition_penalty: 0, weighted_constraint_penalty: 0 }, lastProgress: null })),
    validateScenario: vi.fn(async () => ({ valid: true, issues: [] })),
    getDefaultSolverConfiguration: vi.fn(async () => createSampleSolverSettings()),
    recommendSettings: vi.fn(async () => createSampleSolverSettings()),
    evaluateInput: vi.fn(async () => ({ schedule: {}, final_score: 0, unique_contacts: 0, repetition_penalty: 0, attribute_balance_penalty: 0, constraint_penalty: 0, weighted_repetition_penalty: 0, weighted_constraint_penalty: 0 })),
    inspectResult: vi.fn(async () => ({ final_score: 0, unique_contacts: 0, repetition_penalty: 0, attribute_balance_penalty: 0, constraint_penalty: 0 })),
    cancel: vi.fn(async () => undefined),
    getLastProgressUpdate: vi.fn(() => null),
    terminate: vi.fn(() => undefined),
    ...overrides,
  };
}

function createRustResultFromSolution() {
  const solution = createSampleSolution();
  const schedule: Record<string, Record<string, string[]>> = {};

  for (const assignment of solution.assignments) {
    const sessionKey = `session_${assignment.session_id}`;
    schedule[sessionKey] = schedule[sessionKey] ?? {};
    schedule[sessionKey][assignment.group_id] = schedule[sessionKey][assignment.group_id] ?? [];
    schedule[sessionKey][assignment.group_id].push(assignment.person_id);
  }

  return {
    schedule,
    final_score: solution.final_score,
    unique_contacts: solution.unique_contacts,
    repetition_penalty: solution.repetition_penalty,
    attribute_balance_penalty: solution.attribute_balance_penalty,
    constraint_penalty: solution.constraint_penalty,
    weighted_repetition_penalty: solution.weighted_repetition_penalty,
    weighted_constraint_penalty: solution.weighted_constraint_penalty,
  };
}

function createRuntimeHarness(overrides: {
  workerTransport?: Partial<SolverContractTransport>;
  wasmTransport?: Partial<SolverContractTransport>;
} = {}) {
  const scenario = createSampleScenario();
  const solution = createSampleSolution();
  const workerTransport = createBaseTransport(overrides.workerTransport);
  const wasmTransport = createBaseTransport(overrides.wasmTransport);
  const runtime = new LocalWasmRuntime({ workerTransport, wasmTransport });

  return {
    runtime,
    workerTransport,
    wasmTransport,
    scenario,
    solution,
  };
}

defineSolverRuntimeContractTests('LocalWasmRuntime', createRuntimeHarness);

describe('LocalWasmRuntime', () => {
  it('tracks active solve snapshots during worker progress and clears them after completion', async () => {
    const scenario = createSampleScenario();
    const progress: RuntimeProgressUpdate = {
      iteration: 5,
      max_iterations: 100,
      temperature: 0.5,
      current_score: 12,
      best_score: 10,
      current_contacts: 0,
      best_contacts: 0,
      repetition_penalty: 0,
      elapsed_seconds: 1,
      no_improvement_count: 2,
      clique_swaps_tried: 0,
      clique_swaps_accepted: 0,
      clique_swaps_rejected: 0,
      transfers_tried: 0,
      transfers_accepted: 0,
      transfers_rejected: 0,
      swaps_tried: 0,
      swaps_accepted: 0,
      swaps_rejected: 0,
      overall_acceptance_rate: 0,
      recent_acceptance_rate: 0,
      avg_attempted_move_delta: 0,
      avg_accepted_move_delta: 0,
      biggest_accepted_increase: 0,
      biggest_attempted_increase: 0,
      current_repetition_penalty: 0,
      current_balance_penalty: 0,
      current_constraint_penalty: 0,
      best_repetition_penalty: 0,
      best_balance_penalty: 0,
      best_constraint_penalty: 0,
      reheats_performed: 0,
      iterations_since_last_reheat: 0,
      local_optima_escapes: 0,
      avg_time_per_iteration_ms: 0,
      cooling_progress: 0.1,
      clique_swap_success_rate: 0,
      transfer_success_rate: 0,
      swap_success_rate: 0,
      score_variance: 0,
      search_efficiency: 0,
      best_schedule: { session_0: { g1: ['p1', 'p2'] } },
    };
    const workerTransport = createBaseTransport({
      solveWithProgress: vi.fn(async (_input, callback) => {
        callback?.(progress);
        return { result: createRustResultFromSolution(), lastProgress: progress };
      }),
    });
    const runtime = new LocalWasmRuntime({ workerTransport, wasmTransport: createBaseTransport(), now: () => 1234 });

    let snapshotDuringCallback = null;
    const result = await runtime.solveWithProgress({
      scenario,
      progressCallback: () => {
        snapshotDuringCallback = runtime.getActiveSolveSnapshot();
      },
    });

    expect(snapshotDuringCallback).toEqual(
      expect.objectContaining({
        startedAtMs: 1234,
        latestProgress: expect.objectContaining({ iteration: 5 }),
        bestSchedule: { session_0: { g1: ['p1', 'p2'] } },
      }),
    );
    expect(result.lastProgress).toEqual(progress);
    expect(runtime.hasActiveSolveSnapshot()).toBe(false);
  });

  it('maps worker cancellation onto RuntimeCancelledError and clears active solve state', async () => {
    const scenario = createSampleScenario();
    let rejectSolve: ((error: unknown) => void) | null = null;
    const workerTransport = createBaseTransport({
      solveWithProgress: vi.fn(
        async () => await new Promise((_resolve, reject) => {
          rejectSolve = reject;
        }),
      ),
      cancel: vi.fn(async () => {
        rejectSolve?.(new Error('Solver cancelled by user'));
      }),
    });
    const runtime = new LocalWasmRuntime({ workerTransport, wasmTransport: createBaseTransport() });

    const promise = runtime.solveWithProgress({ scenario });
    await vi.waitFor(() => {
      expect(runtime.hasActiveSolveSnapshot()).toBe(true);
    });
    await runtime.cancel();

    await expect(promise).rejects.toBeInstanceOf(RuntimeCancelledError);
    expect(runtime.hasActiveSolveSnapshot()).toBe(false);
    expect(workerTransport.cancel).toHaveBeenCalledTimes(1);
  });

  it('routes evaluation through the direct wasm transport', async () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();
    const wasmTransport = createBaseTransport({
      evaluateInput: vi.fn(async () => createRustResultFromSolution()),
    });
    const runtime = new LocalWasmRuntime({ workerTransport: createBaseTransport(), wasmTransport });

    const result = await runtime.evaluateSolution({ scenario, assignments: solution.assignments });

    expect(wasmTransport.evaluateInput).toHaveBeenCalledTimes(1);
    expect(result.final_score).toBe(solution.final_score);
  });
});
