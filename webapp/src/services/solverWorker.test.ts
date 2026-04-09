import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scenario } from "../types";
import { createSampleScenario, createSampleSolution, createSampleSolverSettings } from "../test/fixtures";
import { SolverWorkerService } from "./solverWorker";
import type { ProgressUpdate } from "./wasm/types";
import {
  buildRustScenarioPayload,
  buildWarmStartScenarioPayload,
  parseRustSolutionResult,
} from "./rustBoundary";

vi.mock("./rustBoundary", () => ({
  buildRustScenarioPayload: vi.fn(() => ({
    scenario: {
      people: [],
      groups: [],
      num_sessions: 2,
      objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
      constraints: [],
      settings: { solver_type: "SimulatedAnnealing" },
    },
  })),
  buildWarmStartScenarioPayload: vi.fn(() => ({
    scenario: {
      people: [],
      groups: [],
      num_sessions: 2,
      objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
      constraints: [],
      settings: { solver_type: "SimulatedAnnealing" },
    },
    initial_schedule: { session_0: { g1: ["p1"] } },
  })),
  parseRustSolutionResult: vi.fn(() => createSampleSolution()),
}));

type PostedMessage = { type: string; id?: string; data?: Record<string, unknown> };

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postedMessages: PostedMessage[] = [];
  terminated = false;

  constructor(public readonly url: URL, public readonly options: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: PostedMessage): void {
    this.postedMessages.push(message);
  }

  emit(message: object): void {
    this.onmessage?.({ data: message } as MessageEvent);
  }

  emitError(message = "Worker error"): void {
    this.onerror?.({ message } as ErrorEvent);
  }

  terminate(): void {
    this.terminated = true;
  }

  static reset(): void {
    FakeWorker.instances = [];
  }

  static latest(): FakeWorker {
    const worker = FakeWorker.instances.at(-1);
    if (!worker) {
      throw new Error("Expected a fake worker instance");
    }
    return worker;
  }
}

const progress: ProgressUpdate = {
  iteration: 7,
  max_iterations: 100,
  temperature: 0.5,
  current_score: 10,
  best_score: 9,
  current_contacts: 4,
  best_contacts: 5,
  repetition_penalty: 1,
  elapsed_seconds: 2,
  no_improvement_count: 0,
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
  cooling_progress: 0,
  clique_swap_success_rate: 0,
  transfer_success_rate: 0,
  swap_success_rate: 0,
  score_variance: 0,
  search_efficiency: 0,
};

function createService(): SolverWorkerService {
  return new SolverWorkerService();
}

function initializeService(service: SolverWorkerService): Promise<void> {
  const initPromise = service.initialize();
  const worker = FakeWorker.latest();
  expect(worker.postedMessages[0]).toEqual({ type: "INIT", id: "1" });
  worker.emit({ type: "INIT_SUCCESS", id: "1" });
  return initPromise;
}

function createScenario(): Scenario {
  return createSampleScenario({ settings: createSampleSolverSettings() });
}

describe("SolverWorkerService", () => {
  beforeEach(() => {
    FakeWorker.reset();
    vi.clearAllMocks();
    vi.stubGlobal("Worker", FakeWorker);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("initializes successfully and marks the worker as ready", async () => {
    const service = createService();

    await initializeService(service);

    expect(service.isReady()).toBe(true);
    expect(FakeWorker.latest().options).toEqual({ type: "module" });
  });

  it("surfaces initialization failures and resets readiness", async () => {
    const service = createService();
    const initPromise = service.initialize();
    const worker = FakeWorker.latest();

    worker.emit({
      type: "ERROR",
      id: "1",
      data: { error: "boom" },
    });

    await expect(initPromise).rejects.toThrow("Failed to initialize solver worker: boom");
    expect(service.isReady()).toBe(false);
  });

  it("waits for in-flight initialization before sending RPC discovery calls", async () => {
    const service = createService();

    const initPromise = service.initialize();
    const worker = FakeWorker.latest();
    const listSolversPromise = service.listSolvers();

    expect(worker.postedMessages).toEqual([{ type: 'INIT', id: '1' }]);

    worker.emit({ type: 'INIT_SUCCESS', id: '1' });

    await vi.waitFor(() => {
      expect(worker.postedMessages.at(-1)).toEqual({
        type: 'list_solvers',
        id: '2',
        data: {},
      });
    });

    worker.emit({
      type: 'RPC_SUCCESS',
      id: '2',
      data: { result: { solvers: [{ canonical_id: 'solver1' }] } },
    });

    await expect(listSolversPromise).resolves.toEqual({ solvers: [{ canonical_id: 'solver1' }] });
    await initPromise;
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("handles solve-with-progress, captures last progress, and forwards callbacks", async () => {
    const service = createService();
    await initializeService(service);
    const callback = vi.fn();

    const solvePromise = service.solveWithProgress(createScenario(), callback);
    const worker = FakeWorker.latest();

    expect(buildRustScenarioPayload).toHaveBeenCalledWith(expect.objectContaining({ people: expect.any(Array) }));
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "SOLVE",
      id: "2",
      data: {
        scenarioPayload: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 2,
            objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing" },
          },
        },
        useProgress: true,
      },
    });

    worker.emit({ type: "PROGRESS", id: "2", data: { progress } });
    worker.emit({
      type: "SOLVE_SUCCESS",
      id: "2",
      data: { result: { schedule: {}, final_score: 9 }, lastProgress: progress },
    });

    const result = await solvePromise;

    expect(callback).toHaveBeenCalledWith(progress);
    expect(result.lastProgress).toEqual(progress);
    expect(parseRustSolutionResult).toHaveBeenCalledWith({ schedule: {}, final_score: 9 }, progress, progress);
    expect(service.getLastProgressUpdate()).toEqual(progress);
  });

  it("uses the warm-start payload builder for warm-start solves", async () => {
    const service = createService();
    await initializeService(service);
    const initialSchedule = { session_0: { g1: ["p1"] } };

    const solvePromise = service.solveWithProgressWarmStart(createScenario(), initialSchedule);
    const worker = FakeWorker.latest();

    expect(buildWarmStartScenarioPayload).toHaveBeenCalledWith(
      expect.objectContaining({ people: expect.any(Array) }),
      initialSchedule,
    );
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "SOLVE",
      id: "2",
      data: {
        scenarioPayload: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 2,
            objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing" },
          },
          initial_schedule: { session_0: { g1: ["p1"] } },
        },
        useProgress: true,
      },
    });

    worker.emit({ type: "SOLVE_SUCCESS", id: "2", data: { result: { schedule: {}, final_score: 9 } } });
    await solvePromise;
  });

  it("fetches default and recommended settings through canonical RPC messages", async () => {
    const service = createService();
    await initializeService(service);
    const settings = createSampleSolverSettings();

    const defaultsPromise = service.getDefaultSettings();
    const worker = FakeWorker.latest();
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "get_default_solver_configuration",
      id: "2",
      data: {},
    });
    worker.emit({ type: "RPC_SUCCESS", id: "2", data: { result: settings } });
    await expect(defaultsPromise).resolves.toEqual(settings);

    const recommendedPromise = service.getRecommendedSettings(createScenario(), 9);
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "recommend_settings",
      id: "3",
      data: {
        recommendRequest: {
          scenario: expect.objectContaining({
            people: expect.any(Array),
            groups: expect.any(Array),
            num_sessions: 2,
          }),
          desired_runtime_seconds: 9,
        },
      },
    });
    worker.emit({ type: "RPC_SUCCESS", id: "3", data: { result: settings } });
    await expect(recommendedPromise).resolves.toEqual(settings);
  });

  it("exposes raw discovery and contract RPC helpers for browser agents", async () => {
    const service = createService();
    await initializeService(service);
    const worker = FakeWorker.latest();

    const capabilitiesPromise = service.capabilities();
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "capabilities",
      id: "2",
      data: {},
    });
    worker.emit({
      type: "RPC_SUCCESS",
      id: "2",
      data: { result: { bootstrap: { title: "GroupMixer solver contracts" } } },
    });
    await expect(capabilitiesPromise).resolves.toEqual({
      bootstrap: { title: "GroupMixer solver contracts" },
    });

    const helpPromise = service.getOperationHelp("solve");
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "get_operation_help",
      id: "3",
      data: { args: ["solve"] },
    });
    worker.emit({
      type: "RPC_SUCCESS",
      id: "3",
      data: { result: { operation: { id: "solve" } } },
    });
    await expect(helpPromise).resolves.toEqual({ operation: { id: "solve" } });

    const listSolversPromise = service.listSolvers();
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "list_solvers",
      id: "4",
      data: {},
    });
    worker.emit({
      type: "RPC_SUCCESS",
      id: "4",
      data: { result: { solvers: [{ canonical_id: "solver1" }] } },
    });
    await expect(listSolversPromise).resolves.toEqual({ solvers: [{ canonical_id: "solver1" }] });

    const descriptorPromise = service.getSolverDescriptor("solver3");
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "get_solver_descriptor",
      id: "5",
      data: { args: ["solver3"] },
    });
    worker.emit({
      type: "RPC_SUCCESS",
      id: "5",
      data: { result: { canonical_id: "solver3", display_name: "Solver 3" } },
    });
    await expect(descriptorPromise).resolves.toEqual({ canonical_id: "solver3", display_name: "Solver 3" });

    const validatePromise = service.validateScenarioContract({ scenario: createScenario() });
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "validate_scenario",
      id: "6",
      data: { scenarioPayload: { scenario: createScenario() } },
    });
    worker.emit({
      type: "RPC_SUCCESS",
      id: "6",
      data: { result: { valid: true, issues: [] } },
    });
    await expect(validatePromise).resolves.toEqual({ valid: true, issues: [] });

    const solvePromise = service.solveContract({ scenario: createScenario() });
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "SOLVE",
      id: "7",
      data: { scenarioPayload: { scenario: createScenario() }, useProgress: false },
    });
    worker.emit({
      type: "SOLVE_SUCCESS",
      id: "7",
      data: { result: { schedule: {}, final_score: 4 } },
    });
    await expect(solvePromise).resolves.toEqual({ schedule: {}, final_score: 4 });
  });

  it("rejects pending calls on fatal worker errors", async () => {
    const service = createService();
    await initializeService(service);

    const settingsPromise = service.getDefaultSettings();
    const worker = FakeWorker.latest();
    worker.emit({ type: "FATAL_ERROR", data: { error: "fatal boom" } });

    await expect(settingsPromise).rejects.toThrow("fatal boom");
  });

  it("cancels pending work, terminates the worker, and reinitializes", async () => {
    const service = createService();
    await initializeService(service);

    const solvePromise = service.solve(createScenario());
    const firstWorker = FakeWorker.latest();
    expect(firstWorker.postedMessages.at(-1)).toEqual({
      type: "SOLVE",
      id: "2",
      data: {
        scenarioPayload: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 2,
            objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing" },
          },
        },
        useProgress: false,
      },
    });

    const cancelPromise = service.cancel();
    expect(firstWorker.terminated).toBe(true);

    const replacementWorker = FakeWorker.latest();
    expect(replacementWorker).not.toBe(firstWorker);
    expect(replacementWorker.postedMessages[0]).toEqual({ type: "INIT", id: "3" });
    replacementWorker.emit({ type: "INIT_SUCCESS", id: "3" });

    await expect(solvePromise).rejects.toThrow("Solver cancelled by user");
    await cancelPromise;
    expect(service.isReady()).toBe(true);
  });

  it("rejects pending work when the underlying worker errors", async () => {
    const service = createService();
    await initializeService(service);

    const settingsPromise = service.getDefaultSettings();
    FakeWorker.latest().emitError("underlying worker broke");

    await expect(settingsPromise).rejects.toThrow("Worker error");
  });
});
