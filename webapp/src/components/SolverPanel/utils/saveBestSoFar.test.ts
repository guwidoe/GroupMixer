import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleProblem, createSampleSolution, createSampleSolverSettings } from '../../../test/fixtures';
import { saveBestSoFar } from './saveBestSoFar';
import { wasmService } from '../../../services/wasm';
import { solverWorkerService } from '../../../services/solverWorker';

vi.mock('../../../services/wasm', () => ({
  wasmService: {
    evaluateSolution: vi.fn(),
  },
}));

vi.mock('../../../services/solverWorker', () => ({
  solverWorkerService: {
    getLastProgressUpdate: vi.fn(),
  },
}));

describe('saveBestSoFar', () => {
  const problem = createSampleProblem();
  const solverSettings = createSampleSolverSettings();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('warns when the solver is not currently running', async () => {
    const addNotification = vi.fn();

    await saveBestSoFar({
      solverState: { ...createSampleSolution(), isRunning: false, isComplete: false, currentIteration: 0, bestScore: 0, elapsedTime: 0, noImprovementCount: 0 } as never,
      problem,
      runSettings: null,
      solverSettings,
      runProblemSnapshotRef: { current: problem },
      addResult: vi.fn(),
      addNotification,
      cancelledRef: { current: false },
      restartAfterSaveRef: { current: false },
      saveInProgressRef: { current: false },
    });

    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Solver Not Running',
      }),
    );
  });

  it('evaluates the best schedule snapshot and saves it with run metadata', async () => {
    const addResult = vi.fn();
    const addNotification = vi.fn();
    vi.mocked(solverWorkerService.getLastProgressUpdate).mockReturnValue({
      iteration: 17,
      elapsed_seconds: 3,
      best_score: 8,
      best_schedule: {
        session_0: { g1: ['p1', 'p2'] },
        session_1: { g2: ['p3', 'p4'] },
      },
    } as never);
    vi.mocked(wasmService.evaluateSolution).mockResolvedValue(
      createSampleSolution({ final_score: 8, unique_contacts: 6, iteration_count: 0, elapsed_time_ms: 0 }),
    );

    await saveBestSoFar({
      solverState: {
        isRunning: true,
        isComplete: false,
        currentIteration: 10,
        bestScore: 8,
        elapsedTime: 0,
        noImprovementCount: 0,
      } as never,
      problem,
      runSettings: solverSettings,
      solverSettings,
      runProblemSnapshotRef: { current: problem },
      addResult,
      addNotification,
      cancelledRef: { current: false },
      restartAfterSaveRef: { current: false },
      saveInProgressRef: { current: false },
    });

    expect(wasmService.evaluateSolution).toHaveBeenCalledWith(problem, [
      { person_id: 'p1', group_id: 'g1', session_id: 0 },
      { person_id: 'p2', group_id: 'g1', session_id: 0 },
      { person_id: 'p3', group_id: 'g2', session_id: 1 },
      { person_id: 'p4', group_id: 'g2', session_id: 1 },
    ]);
    expect(addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        final_score: 8,
        iteration_count: 17,
        elapsed_time_ms: 3000,
      }),
      solverSettings,
      undefined,
      problem,
    );
    expect(addNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Saved Snapshot (Partial Metrics)' }),
    );
  });

  it('falls back to partial metrics when evaluation of the best schedule fails', async () => {
    const addResult = vi.fn(() => ({ id: 'saved-result' }));
    const addNotification = vi.fn();
    vi.mocked(solverWorkerService.getLastProgressUpdate).mockReturnValue({
      iteration: 12,
      elapsed_seconds: 2,
      best_score: 7,
      best_schedule: {
        session_0: { g1: ['p1'] },
      },
    } as never);
    vi.mocked(wasmService.evaluateSolution).mockRejectedValue(new Error('eval failed'));

    await saveBestSoFar({
      solverState: {
        isRunning: true,
        isComplete: false,
        currentIteration: 10,
        bestScore: 7,
        elapsedTime: 0,
        noImprovementCount: 0,
      } as never,
      problem,
      runSettings: null,
      solverSettings,
      runProblemSnapshotRef: { current: problem },
      addResult,
      addNotification,
      cancelledRef: { current: false },
      restartAfterSaveRef: { current: false },
      saveInProgressRef: { current: false },
    });

    expect(addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        assignments: [{ person_id: 'p1', group_id: 'g1', session_id: 0 }],
        final_score: 7,
        iteration_count: 12,
        elapsed_time_ms: 2000,
      }),
      solverSettings,
      undefined,
      problem,
    );
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: 'Saved Snapshot (Partial Metrics)',
      }),
    );
  });

  it('requests a save-and-resume flow when no best-schedule snapshot is available yet', async () => {
    const addNotification = vi.fn();
    const cancelledRef = { current: false };
    const restartAfterSaveRef = { current: false };
    const saveInProgressRef = { current: false };
    vi.mocked(solverWorkerService.getLastProgressUpdate).mockReturnValue(null);

    await saveBestSoFar({
      solverState: {
        isRunning: true,
        isComplete: false,
        currentIteration: 10,
        bestScore: 7,
        elapsedTime: 0,
        noImprovementCount: 0,
      } as never,
      problem,
      runSettings: null,
      solverSettings,
      runProblemSnapshotRef: { current: problem },
      addResult: vi.fn(),
      addNotification,
      cancelledRef,
      restartAfterSaveRef,
      saveInProgressRef,
    });

    expect(cancelledRef.current).toBe(true);
    expect(restartAfterSaveRef.current).toBe(true);
    expect(saveInProgressRef.current).toBe(true);
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        title: 'Saving Best-So-Far',
      }),
    );
  });
});
