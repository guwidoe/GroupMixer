import type { MutableRefObject } from 'react';
import type { Scenario, ScenarioResult, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import { getRuntime } from '../../../services/runtime';

export type AddNotification = (notification: Omit<Notification, 'id'>) => void;

interface SaveBestSoFarArgs {
  solverState: SolverState;
  scenario: Scenario | null;
  runSettings: SolverSettings | null;
  solverSettings: SolverSettings;
  runScenarioSnapshotRef: MutableRefObject<Scenario | null>;
  addResult: (
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string,
    snapshotScenarioOverride?: Scenario,
  ) => ScenarioResult | null;
  addNotification: AddNotification;
  cancelledRef: MutableRefObject<boolean>;
  restartAfterSaveRef: MutableRefObject<boolean>;
  saveInProgressRef: MutableRefObject<boolean>;
}

export async function saveBestSoFar({
  solverState,
  scenario,
  runSettings,
  solverSettings,
  runScenarioSnapshotRef,
  addResult,
  addNotification,
  cancelledRef,
  restartAfterSaveRef,
  saveInProgressRef,
}: SaveBestSoFarArgs) {
  const runtime = getRuntime();

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

  const activeSolve = runtime.getActiveSolveSnapshot?.() ?? null;
  const bestSchedule = activeSolve?.bestSchedule ?? activeSolve?.latestProgress?.best_schedule ?? null;
  const lastProgress = activeSolve?.latestProgress ?? null;
  const settingsForSave = activeSolve?.selectedSettings ?? runSettings ?? solverSettings;

  if (bestSchedule && lastProgress) {
    saveInProgressRef.current = true;
    const assignments: { person_id: string; group_id: string; session_id: number }[] = [];
    Object.entries(bestSchedule).forEach(([sessionKey, groups]) => {
      const sId = parseInt(sessionKey.replace('session_', ''));
      Object.entries(groups).forEach(([groupId, people]) => {
        people.forEach((pid) => assignments.push({ person_id: pid, group_id: groupId, session_id: sId }));
      });
    });

    try {
      const scenarioForEval = activeSolve?.runScenario ?? (scenario ? { ...scenario, settings: settingsForSave } : undefined);
      if (!scenarioForEval) throw new Error('No scenario available for evaluation');

      const evaluated = await runtime.evaluateSolution({ scenario: scenarioForEval, assignments });
      const evaluatedWithRunMeta = {
        ...evaluated,
        iteration_count: lastProgress.iteration,
        elapsed_time_ms: lastProgress.elapsed_seconds * 1000,
      } as typeof evaluated;
      addResult(evaluatedWithRunMeta, settingsForSave, undefined, runScenarioSnapshotRef.current || undefined);
    } catch (e) {
      console.error('[SolverPanel] Failed to evaluate snapshot metrics:', e);
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
      if (addResult(fallbackSolution, settingsForSave, undefined, runScenarioSnapshotRef.current || undefined)) {
        addNotification({
          type: 'warning',
          title: 'Saved Snapshot (Partial Metrics)',
          message: 'Saved assignments, but metric evaluation failed so some metrics may be incomplete.',
        });
      }
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
