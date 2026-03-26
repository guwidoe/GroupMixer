import { useRef, useState } from 'react';
import type { Scenario, ScenarioResult, SavedScenario, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import type { ProgressUpdate } from '../../../services/wasm/types';
import type { ScheduleSnapshot } from '../../../visualizations/types';
import { solverWorkerService } from '../../../services/solverWorker';
import { runSolver } from '../utils/runSolver';
import { saveBestSoFar } from '../utils/saveBestSoFar';
import { normalizeRecommendedSolverSettings } from '../utils/recommendedSettings';

type AddNotification = (notification: Omit<Notification, 'id'>) => void;

interface UseSolverActionsArgs {
  scenario: Scenario | null;
  currentScenarioId: string | null;
  savedScenarios: Record<string, SavedScenario>;
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
  addResult: (
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string,
    snapshotScenarioOverride?: Scenario,
  ) => ScenarioResult | null;
  ensureScenarioExists: () => Scenario;
  handleSettingsChange: (settings: Partial<SolverSettings>) => void;
  setShowCancelConfirm: (value: boolean) => void;
}

interface LiveVizState {
  schedule: ScheduleSnapshot;
  progress: ProgressUpdate | null;
}

export function useSolverActions({
  scenario,
  currentScenarioId,
  savedScenarios,
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
  ensureScenarioExists,
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
  const runScenarioSnapshotRef = useRef<Scenario | null>(null);

  const handleStartSolver = async (useRecommended: boolean = true) => {
    await runSolver({
      useRecommended,
      scenario,
      currentScenarioId,
      savedScenarios,
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
      ensureScenarioExists,
      setRunSettings,
      setLiveVizState,
      liveVizLastUiUpdateRef,
      runScenarioSnapshotRef,
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
      scenario,
      runSettings,
      solverSettings,
      runScenarioSnapshotRef,
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
    const currentScenario = ensureScenarioExists();

    try {
      const recommendedSettings = await solverWorkerService.getRecommendedSettings(
        currentScenario,
        desiredRuntimeSettings,
      );

      const uiSettings = normalizeRecommendedSolverSettings(recommendedSettings as SolverSettings);

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
    runScenarioSnapshotRef,
    handleStartSolver,
    handleCancelDiscard,
    handleCancelSave,
    handleSaveBestSoFar,
    handleResetSolver,
    handleAutoSetSettings,
  };
}
