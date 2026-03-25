import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Problem } from "../types";
import { createSampleProblem, createSampleSolution, createSampleSolverSettings } from "../test/fixtures";
import { SolverWorkerService } from "./solverWorker";
import type { ProgressUpdate } from "./wasm/types";
import {
  buildRustProblemJson,
  buildWarmStartProblemJson,
  parseProgressUpdate,
  parseRustSolution,
} from "./rustBoundary";

vi.mock("./rustBoundary", () => ({
  buildRustProblemJson: vi.fn(() => "problem-json"),
  buildWarmStartProblemJson: vi.fn(() => "warm-start-json"),
  parseProgressUpdate: vi.fn((payload: string) => JSON.parse(payload)),
  parseRustSolution: vi.fn(() => createSampleSolution()),
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

function createProblem(): Problem {
  return createSampleProblem({ settings: createSampleSolverSettings() });
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

  it("handles solve-with-progress, captures last progress, and forwards callbacks", async () => {
    const service = createService();
    await initializeService(service);
    const callback = vi.fn();

    const solvePromise = service.solveWithProgress(createProblem(), callback);
    const worker = FakeWorker.latest();

    expect(buildRustProblemJson).toHaveBeenCalledWith(expect.objectContaining({ people: expect.any(Array) }));
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "SOLVE",
      id: "2",
      data: { problemJson: "problem-json", useProgress: true },
    });

    worker.emit({ type: "PROGRESS", id: "2", data: { progressJson: JSON.stringify(progress) } });
    worker.emit({
      type: "SOLVE_SUCCESS",
      id: "2",
      data: { result: "result-json", lastProgressJson: JSON.stringify(progress) },
    });

    const result = await solvePromise;

    expect(parseProgressUpdate).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(progress);
    expect(result.lastProgress).toEqual(progress);
    expect(parseRustSolution).toHaveBeenCalledWith("result-json", progress, progress);
    expect(service.getLastProgressUpdate()).toEqual(progress);
  });

  it("uses the warm-start payload builder for warm-start solves", async () => {
    const service = createService();
    await initializeService(service);
    const initialSchedule = { session_0: { g1: ["p1"] } };

    const solvePromise = service.solveWithProgressWarmStart(createProblem(), initialSchedule);
    const worker = FakeWorker.latest();

    expect(buildWarmStartProblemJson).toHaveBeenCalledWith(
      expect.objectContaining({ people: expect.any(Array) }),
      initialSchedule,
    );
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "SOLVE",
      id: "2",
      data: { problemJson: "warm-start-json", useProgress: true },
    });

    worker.emit({ type: "SOLVE_SUCCESS", id: "2", data: { result: "result-json" } });
    await solvePromise;
  });

  it("fetches default and recommended settings through RPC messages", async () => {
    const service = createService();
    await initializeService(service);
    const settingsJson = JSON.stringify(createSampleSolverSettings());

    const defaultsPromise = service.getDefaultSettings();
    const worker = FakeWorker.latest();
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "get_default_settings",
      id: "2",
      data: {},
    });
    worker.emit({ type: "RPC_SUCCESS", id: "2", data: { result: settingsJson } });
    await expect(defaultsPromise).resolves.toEqual(JSON.parse(settingsJson));

    const recommendedPromise = service.getRecommendedSettings(createProblem(), 9);
    expect(worker.postedMessages.at(-1)).toEqual({
      type: "get_recommended_settings",
      id: "3",
      data: { problemJson: JSON.stringify(createProblem()), desired_runtime_seconds: 9 },
    });
    worker.emit({ type: "RPC_SUCCESS", id: "3", data: { result: settingsJson } });
    await expect(recommendedPromise).resolves.toEqual(JSON.parse(settingsJson));
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

    const solvePromise = service.solve(createProblem());
    const firstWorker = FakeWorker.latest();
    expect(firstWorker.postedMessages.at(-1)).toEqual({
      type: "SOLVE",
      id: "2",
      data: { problemJson: "problem-json", useProgress: false },
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
