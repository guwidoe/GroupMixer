import type { MutableRefObject } from 'react';
import type { Problem, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import type { ProgressUpdate } from '../../../services/wasm';
import { wasmService } from '../../../services/wasm';
import { solverWorkerService } from '../../../services/solverWorker';

export type AddNotification = (notification: Omit<Notification, 'id'>) => void;

interface SaveBestSoFarArgs {
  solverState: SolverState;
  problem: Problem | null;
  runSettings: SolverSettings | null;
  solverSettings: SolverSettings;
  runProblemSnapshotRef: MutableRefObject<Problem | null>;
  addResult: (solution: Solution, solverSettings: SolverSettings, customName?: string, snapshotProblemOverride?: Problem) => void;
  addNotification: AddNotification;
  cancelledRef: MutableRefObject<boolean>;
  restartAfterSaveRef: MutableRefObject<boolean>;
  saveInProgressRef: MutableRefObject<boolean>;
}

export async function saveBestSoFar({
  solverState,
  problem,
  runSettings,
  solverSettings,
  runProblemSnapshotRef,
  addResult,
  addNotification,
  cancelledRef,
  restartAfterSaveRef,
  saveInProgressRef,
}: SaveBestSoFarArgs) {
  if (!solverState.isRunning) {
    addNotification({
      type: 'warning',
      title: 'Solver Not Running',
      message: 'Start the solver to save a best-so-far snapshot.',
    });
    return;
  }
  if (saveInProgressRef.current) {
    return;
  }

  const lastProgress = (solverWorkerService as unknown as { lastProgressUpdate?: ProgressUpdate }).lastProgressUpdate as
    | ProgressUpdate
    | undefined;
  if (lastProgress && lastProgress.best_schedule) {
    saveInProgressRef.current = true;
    const bestSchedule = lastProgress.best_schedule;
    const assignments: { person_id: string; group_id: string; session_id: number }[] = [];
    Object.entries(bestSchedule).forEach(([sessionKey, groups]) => {
      const sId = parseInt(sessionKey.replace('session_', ''));
      Object.entries(groups).forEach(([groupId, people]) => {
        people.forEach((pid) => assignments.push({ person_id: pid, group_id: groupId, session_id: sId }));
      });
    });

    try {
      const problemForEval = problem ? { ...problem, settings: runSettings || solverSettings } : undefined;
      if (!problemForEval) throw new Error('No problem available for evaluation');

      const evaluated = await wasmService.evaluateSolution(problemForEval, assignments);
      const evaluatedWithRunMeta = {
        ...evaluated,
        iteration_count: lastProgress.iteration,
        elapsed_time_ms: lastProgress.elapsed_seconds * 1000,
      } as typeof evaluated;
      const settingsForSave = runSettings || solverSettings;
      addResult(evaluatedWithRunMeta, settingsForSave, undefined, runProblemSnapshotRef.current || undefined);
      addNotification({
        type: 'success',
        title: 'Saved Best-So-Far',
        message: 'Snapshot saved without interrupting the solver.',
      });
    } catch (e) {
      console.error('[SolverPanel] Failed to evaluate snapshot metrics:', e);
      addNotification({
        type: 'warning',
        title: 'Saved Snapshot (Partial Metrics)',
        message: 'Saved assignments; metrics could not be evaluated.',
      });
      const fallbackSolution = {
        assignments,
        final_score: lastProgress.best_score,
        unique_contacts: 0,
        repetition_penalty: 0,
        attribute_balance_penalty: 0,
        constraint_penalty: 0,
        iteration_count: lastProgress.iteration,
        elapsed_time_ms: lastProgress.elapsed_seconds * 1000,
        weighted_repetition_penalty: 0,
        weighted_constraint_penalty: 0,
      } as unknown as Solution;
      const settingsForSave = runSettings || solverSettings;
      addResult(fallbackSolution, settingsForSave, undefined, runProblemSnapshotRef.current || undefined);
    } finally {
      saveInProgressRef.current = false;
    }
    return;
  }

  saveInProgressRef.current = true;
  restartAfterSaveRef.current = true;
  cancelledRef.current = true;
  addNotification({
    type: 'info',
    title: 'Saving Best-So-Far',
    message: 'Snapshotting best result and resuming...',
  });
}
