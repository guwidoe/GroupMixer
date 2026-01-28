import { useRef, useState } from 'react';
import type { Problem, SavedProblem, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import type { ProgressUpdate } from '../../../services/wasm';
import type { ScheduleSnapshot } from '../../../visualizations/types';
import { solverWorkerService } from '../../../services/solverWorker';
import { runSolver } from '../utils/runSolver';
import { saveBestSoFar } from '../utils/saveBestSoFar';

type AddNotification = (notification: Omit<Notification, 'id'>) => void;

interface UseSolverActionsArgs {
  problem: Problem | null;
  currentProblemId: string | null;
  savedProblems: Record<string, SavedProblem>;
  warmStartResultId: string | null;
  setWarmStartFromResult: (id: string | null) => void;
  solverSettings: SolverSettings;
  solverState: SolverState;
  desiredRuntimeMain: number | null;
  desiredRuntimeSettings: number;
  showLiveVizRef: React.MutableRefObject<boolean>;
  startSolver: () => void;
  stopSolver: () => void;
  resetSolver: () => void;
  setSolverState: (partial: Partial<SolverState>) => void;
  setSolution: (solution: Solution) => void;
  addNotification: AddNotification;
  addResult: (solution: Solution, solverSettings: SolverSettings, customName?: string, snapshotProblemOverride?: Problem) => void;
  ensureProblemExists: () => Problem;
  handleSettingsChange: (settings: Partial<SolverSettings>) => void;
  setShowCancelConfirm: (value: boolean) => void;
}

interface LiveVizState {
  schedule: ScheduleSnapshot;
  progress: ProgressUpdate | null;
}

export function useSolverActions({
  problem,
  currentProblemId,
  savedProblems,
  warmStartResultId,
  setWarmStartFromResult,
  solverSettings,
  solverState,
  desiredRuntimeMain,
  desiredRuntimeSettings,
  showLiveVizRef,
  startSolver,
  stopSolver,
  resetSolver,
  setSolverState,
  setSolution,
  addNotification,
  addResult,
  ensureProblemExists,
  handleSettingsChange,
  setShowCancelConfirm,
}: UseSolverActionsArgs) {
  const [runSettings, setRunSettings] = useState<SolverSettings | null>(null);
  const [liveVizState, setLiveVizState] = useState<LiveVizState | null>(null);
  const liveVizLastUiUpdateRef = useRef<number>(0);
  const cancelledRef = useRef(false);
  const solverCompletedRef = useRef(false);
  const restartAfterSaveRef = useRef(false);
  const saveInProgressRef = useRef(false);
  const runProblemSnapshotRef = useRef<Problem | null>(null);

  const handleStartSolver = async (useRecommended: boolean = true) => {
    await runSolver({
      useRecommended,
      problem,
      currentProblemId,
      savedProblems,
      warmStartResultId,
      setWarmStartFromResult,
      solverSettings,
      solverState,
      desiredRuntimeMain,
      showLiveVizRef,
      startSolver,
      setSolverState,
      setSolution,
      addNotification,
      addResult,
      ensureProblemExists,
      setRunSettings,
      setLiveVizState,
      liveVizLastUiUpdateRef,
      runProblemSnapshotRef,
      cancelledRef,
      solverCompletedRef,
      restartAfterSaveRef,
      saveInProgressRef,
    });
  };

  const handleCancelDiscard = async () => {
    setShowCancelConfirm(false);
    if (!solverState.isRunning) return;
    cancelledRef.current = true;
    stopSolver();

    addNotification({
      type: 'warning',
      title: 'Solver Cancelled',
      message: 'Progress discarded.',
    });

    try {
      await solverWorkerService.cancel();
    } catch (error) {
      console.error('Cancellation error:', error);
    }
  };

  const handleCancelSave = () => {
    setShowCancelConfirm(false);
    if (!solverState.isRunning) return;
    cancelledRef.current = true;
    addNotification({
      type: 'info',
      title: 'Stopping Solver',
      message: 'Saving best-so-far solution...',
    });
  };

  const handleSaveBestSoFar = async () => {
    await saveBestSoFar({
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
    });
  };

  const handleResetSolver = () => {
    cancelledRef.current = false;
    solverCompletedRef.current = false;
    resetSolver();
    addNotification({
      type: 'info',
      title: 'Reset',
      message: 'Solver state reset',
    });
  };

  const handleAutoSetSettings = async () => {
    const currentProblem = ensureProblemExists();

    try {
      const recommendedSettings = await solverWorkerService.get_recommended_settings(
        currentProblem,
        desiredRuntimeSettings,
      );

      let uiSettings: SolverSettings = recommendedSettings as SolverSettings;
      const sp = (recommendedSettings as SolverSettings & { solver_params: Record<string, unknown> }).solver_params;
      if (sp && !('SimulatedAnnealing' in sp) && sp.solver_type === 'SimulatedAnnealing') {
        const {
          initial_temperature,
          final_temperature,
          cooling_schedule,
          reheat_cycles,
          reheat_after_no_improvement,
        } = sp as {
          initial_temperature: number;
          final_temperature: number;
          cooling_schedule: string;
          reheat_cycles?: number;
          reheat_after_no_improvement: number;
        };

        uiSettings = {
          ...recommendedSettings,
          solver_params: {
            SimulatedAnnealing: {
              initial_temperature,
              final_temperature,
              cooling_schedule,
              reheat_cycles,
              reheat_after_no_improvement,
            },
          },
        } as SolverSettings;
      }

      handleSettingsChange(uiSettings);
      addNotification({
        type: 'success',
        title: 'Settings Updated',
        message: 'Algorithm settings have been automatically configured.',
        duration: 5000,
      });
    } catch (error) {
      console.error('Error getting recommended settings:', error);
      addNotification({
        type: 'error',
        title: 'Auto-set Failed',
        message: `Could not determine recommended settings. ${error instanceof Error ? error.message : ''}`,
        duration: 5000,
      });
    }
  };

  return {
    runSettings,
    liveVizState,
    runProblemSnapshotRef,
    handleStartSolver,
    handleCancelDiscard,
    handleCancelSave,
    handleSaveBestSoFar,
    handleResetSolver,
    handleAutoSetSettings,
  };
}
