import { describe, expect, it, vi } from 'vitest';
import { createSampleScenario, createSampleSolution } from '../../test/fixtures';
import type { Scenario, Solution } from '../../types';
import type { SolverContractTransport } from '../runtimeAdapters/contractTransport';
import { RuntimeError, type SolverRuntime } from './runtime';
import type { RuntimeProgressUpdate } from './types';

export interface RuntimeContractHarness {
  runtime: SolverRuntime;
  workerTransport: SolverContractTransport;
  wasmTransport: SolverContractTransport;
  scenario: Scenario;
  solution: Solution;
}

export type RuntimeContractHarnessFactory = (overrides?: {
  workerTransport?: Partial<SolverContractTransport>;
  wasmTransport?: Partial<SolverContractTransport>;
}) => RuntimeContractHarness;

function createProgress(): RuntimeProgressUpdate {
  return {
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
}

export function defineSolverRuntimeContractTests(
  name: string,
  createHarness: RuntimeContractHarnessFactory,
): void {
  describe(`${name} contract`, () => {
    it('initializes and reports capabilities', async () => {
      const { runtime, workerTransport } = createHarness();

      await runtime.initialize();
      const capabilities = await runtime.getCapabilities();

      expect(workerTransport.initialize).toHaveBeenCalledTimes(1);
      expect(capabilities).toEqual(
        expect.objectContaining({
          runtimeId: expect.any(String),
          supportsStreamingProgress: true,
          supportsWarmStart: true,
          supportsCancellation: true,
          supportsEvaluation: true,
          supportsRecommendedSettings: true,
          supportsActiveSolveInspection: true,
          progressTransport: 'shared-mailbox',
          progressMailbox: expect.objectContaining({
            transport: 'shared-mailbox',
            supported: true,
            crossOriginIsolated: true,
            sharedArrayBufferAvailable: true,
          }),
        }),
      );
    });

    it('validates scenarios via the runtime boundary', async () => {
      const { runtime, workerTransport, scenario } = createHarness();

      const result = await runtime.validateScenario(scenario);

      expect(workerTransport.validateScenario).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ valid: true, issues: [] });
    });

    it('normalizes recommended settings returned by the worker transport', async () => {
      const scenario = createSampleScenario();
      const { runtime } = createHarness({
        workerTransport: {
          recommendSettings: vi.fn(async () => ({
            ...scenario.settings,
            solver_params: {
              solver_type: 'SimulatedAnnealing',
              initial_temperature: 10,
              final_temperature: 0.1,
              cooling_schedule: 'exponential',
              reheat_cycles: 2,
              reheat_after_no_improvement: 100,
            },
          })),
        },
      });

      const result = await runtime.recommendSettings({ scenario, desiredRuntimeSeconds: 3 });

      expect(result.solver_params).toEqual({
        SimulatedAnnealing: {
          initial_temperature: 10,
          final_temperature: 0.1,
          cooling_schedule: 'exponential',
          reheat_cycles: 2,
          reheat_after_no_improvement: 100,
        },
      });
    });

    it('solves successfully with streaming progress', async () => {
      const progress = createProgress();
      const solution = createSampleSolution({
        final_score: 10,
        unique_contacts: 4,
        repetition_penalty: 1,
        attribute_balance_penalty: 0,
        constraint_penalty: 0,
        weighted_repetition_penalty: 1,
        weighted_constraint_penalty: 0,
      });
      const schedule = solution.assignments.reduce<Record<string, Record<string, string[]>>>(
        (acc, assignment) => {
          const sessionKey = `session_${assignment.session_id}`;
          acc[sessionKey] = acc[sessionKey] ?? {};
          acc[sessionKey][assignment.group_id] = acc[sessionKey][assignment.group_id] ?? [];
          acc[sessionKey][assignment.group_id].push(assignment.person_id);
          return acc;
        },
        {},
      );
      const { runtime, scenario } = createHarness({
        workerTransport: {
          solveWithProgress: vi.fn(async (_input, callback) => {
            callback?.(progress);
            return {
              result: {
                schedule,
                final_score: solution.final_score,
                unique_contacts: solution.unique_contacts,
                repetition_penalty: solution.repetition_penalty,
                attribute_balance_penalty: solution.attribute_balance_penalty,
                constraint_penalty: solution.constraint_penalty,
                weighted_repetition_penalty: solution.weighted_repetition_penalty,
                weighted_constraint_penalty: solution.weighted_constraint_penalty,
              },
              lastProgress: progress,
            };
          }),
        },
      });
      const progressCallback = vi.fn();

      const result = await runtime.solveWithProgress({ scenario, progressCallback });

      expect(progressCallback).toHaveBeenCalledWith(progress);
      expect(result.selectedSettings).toEqual(scenario.settings);
      expect(result.lastProgress).toEqual(progress);
      expect(result.solution.final_score).toBe(10);
    });

    it('normalizes worker failures into RuntimeError', async () => {
      const { runtime, scenario } = createHarness({
        workerTransport: {
          solveWithProgress: vi.fn(async () => {
            throw new Error('worker boom');
          }),
        },
      });

      await expect(runtime.solveWithProgress({ scenario })).rejects.toEqual(
        expect.objectContaining<Partial<RuntimeError>>({
          name: 'RuntimeError',
          code: 'runtime_error',
          message: 'worker boom',
        }),
      );
    });
  });
}
