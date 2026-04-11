import React, { useRef, useState } from 'react';
import {
  buildSolverCatalog,
  createDefaultSolverSettings,
  findSolverCatalogEntry,
  getSolverUiSpec,
  normalizeSolverFamilyId,
  switchSolverFamily,
  type SolverCatalogEntry,
  type SolverFamilyId,
} from '../../services/solverUi';
import { useAppStore } from '../../store';
import type { Scenario, SolverSettings } from '../../types';
import type { SolverFormInputs } from '../SolverPanel/types';
import { useSolverActions } from '../SolverPanel/hooks/useSolverActions';

function readStoredBoolean(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeStoredBoolean(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore localStorage errors.
  }
}

function readStoredString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStoredString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage errors.
  }
}

export interface SolverWorkspaceRunController {
  scenario: Scenario | null;
  solverState: ReturnType<typeof useAppStore.getState>['solverState'];
  solverCatalog: readonly SolverCatalogEntry[];
  solverCatalogStatus: 'loading' | 'ready' | 'error';
  solverCatalogErrorMessage: string | null;
  solverSettings: SolverSettings;
  displaySettings: SolverSettings;
  selectedSolverFamilyId: SolverFamilyId;
  selectedSolverCatalogEntry: SolverCatalogEntry | null;
  selectedSolverUiSpec: ReturnType<typeof getSolverUiSpec>;
  solverFormInputs: SolverFormInputs;
  setSolverFormInputs: React.Dispatch<React.SetStateAction<SolverFormInputs>>;
  desiredRuntimeMain: number | null;
  setDesiredRuntimeMain: React.Dispatch<React.SetStateAction<number | null>>;
  desiredRuntimeSettings: number;
  setDesiredRuntimeSettings: React.Dispatch<React.SetStateAction<number>>;
  currentScenarioId: string | null;
  savedScenarios: ReturnType<typeof useAppStore.getState>['savedScenarios'];
  setWarmStartFromResult: (id: string | null) => void;
  warmStartSelection: string | null;
  setWarmStartSelection: React.Dispatch<React.SetStateAction<string | null>>;
  allowedSessionsLocal: number[] | null;
  setAllowedSessionsLocal: React.Dispatch<React.SetStateAction<number[] | null>>;
  showMetrics: boolean;
  toggleMetrics: () => void;
  showLiveViz: boolean;
  toggleLiveViz: () => void;
  liveVizPluginId: string;
  handleLiveVizPluginChange: (id: string) => void;
  showCancelConfirm: boolean;
  setShowCancelConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  liveVizState: Awaited<ReturnType<typeof useSolverActions>>['liveVizState'];
  runScenarioSnapshotRef: Awaited<ReturnType<typeof useSolverActions>>['runScenarioSnapshotRef'];
  handleSettingsChange: (newSettings: Partial<SolverSettings>) => void;
  handleSelectSolverFamily: (familyId: SolverFamilyId) => void;
  handleStartSolver: (useRecommended?: boolean) => Promise<void>;
  handleCancelDiscard: () => Promise<void>;
  handleCancelSave: () => void;
  handleSaveBestSoFar: () => Promise<void>;
  handleResetSolver: () => void;
  handleAutoSetSettings: () => Promise<void>;
  getLiveVizScenario: () => Scenario | null;
}

export function useSolverWorkspaceRunController(): SolverWorkspaceRunController {
  const {
    solverState,
    startSolver,
    stopSolver,
    resetSolver,
    setSolverState,
    setSolution,
    addNotification,
    addResult,
    updateScenario,
    ensureScenarioExists,
  } = useAppStore();

  const scenario = useAppStore((state) => state.scenario);
  const runtimeSolverCatalog = useAppStore((state) => state.runtimeSolverCatalog);
  const runtimeSolverCatalogStatus = useAppStore((state) => state.runtimeSolverCatalogStatus);
  const runtimeSolverCatalogError = useAppStore((state) => state.runtimeSolverCatalogError);
  const currentScenarioId = useAppStore((state) => state.currentScenarioId);
  const savedScenarios = useAppStore((state) => state.savedScenarios);
  const warmStartResultId = useAppStore((state) => state.ui.warmStartResultId);
  const setWarmStartFromResult = useAppStore((state) => state.setWarmStartFromResult);

  const [warmStartSelection, setWarmStartSelection] = useState<string | null>(null);
  const [showMetrics, setShowMetrics] = useState<boolean>(() => readStoredBoolean('solverMetricsExpanded'));
  const [showLiveViz, setShowLiveViz] = useState<boolean>(() => readStoredBoolean('solverLiveVizEnabled'));
  const showLiveVizRef = useRef(showLiveViz);
  React.useEffect(() => {
    showLiveVizRef.current = showLiveViz;
  }, [showLiveViz]);

  const [liveVizPluginId, setLiveVizPluginId] = useState<string>(() => readStoredString('solverLiveVizPlugin', 'scheduleMatrix'));
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [desiredRuntimeMain, setDesiredRuntimeMain] = useState<number | null>(3);
  const [desiredRuntimeSettings, setDesiredRuntimeSettings] = useState<number>(3);
  const [solverFormInputs, setSolverFormInputs] = useState<SolverFormInputs>({});
  const [allowedSessionsLocal, setAllowedSessionsLocal] = useState<number[] | null>(null);

  const solverCatalog = React.useMemo<readonly SolverCatalogEntry[]>(
    () => buildSolverCatalog(runtimeSolverCatalog),
    [runtimeSolverCatalog],
  );

  const solverSettings = scenario?.settings || createDefaultSolverSettings();
  const selectedSolverFamilyId = normalizeSolverFamilyId(solverSettings.solver_type) ?? 'solver1';
  const selectedSolverCatalogEntry = findSolverCatalogEntry(solverCatalog, selectedSolverFamilyId);
  const selectedSolverUiSpec = getSolverUiSpec(selectedSolverFamilyId);

  const handleSettingsChange = (newSettings: Partial<SolverSettings>) => {
    if (!scenario) {
      return;
    }

    const replacingSolverFamily = typeof newSettings.solver_type === 'string'
      && newSettings.solver_type !== solverSettings.solver_type;

    const updatedScenario = {
      ...scenario,
      settings: {
        ...solverSettings,
        ...newSettings,
        ...(newSettings.solver_params && {
          solver_params: replacingSolverFamily
            ? newSettings.solver_params
            : {
                ...solverSettings.solver_params,
                ...newSettings.solver_params,
              },
        }),
        ...(newSettings.stop_conditions && {
          stop_conditions: {
            ...solverSettings.stop_conditions,
            ...newSettings.stop_conditions,
          },
        }),
      },
    };

    updateScenario({ settings: updatedScenario.settings });
  };

  const handleSelectSolverFamily = (familyId: SolverFamilyId) => {
    if (familyId === selectedSolverFamilyId) {
      return;
    }

    const nextSettings = switchSolverFamily(solverSettings, familyId);
    setSolverFormInputs({});
    handleSettingsChange(nextSettings);
  };

  const {
    runSettings,
    liveVizState,
    runScenarioSnapshotRef,
    handleStartSolver,
    handleCancelDiscard,
    handleCancelSave,
    handleSaveBestSoFar,
    handleResetSolver,
    handleAutoSetSettings,
  } = useSolverActions({
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
  });

  const displaySettings = runSettings || solverSettings;

  const getLiveVizScenario = (): Scenario | null => {
    const base = runScenarioSnapshotRef.current || scenario;
    if (!base) {
      return null;
    }

    return {
      ...base,
      settings: runSettings || solverSettings,
    };
  };

  return {
    scenario,
    solverState,
    solverCatalog,
    solverCatalogStatus: runtimeSolverCatalogStatus === 'idle' ? 'loading' : runtimeSolverCatalogStatus,
    solverCatalogErrorMessage: runtimeSolverCatalogError,
    solverSettings,
    displaySettings,
    selectedSolverFamilyId,
    selectedSolverCatalogEntry,
    selectedSolverUiSpec,
    solverFormInputs,
    setSolverFormInputs,
    desiredRuntimeMain,
    setDesiredRuntimeMain,
    desiredRuntimeSettings,
    setDesiredRuntimeSettings,
    currentScenarioId,
    savedScenarios,
    setWarmStartFromResult,
    warmStartSelection,
    setWarmStartSelection,
    allowedSessionsLocal,
    setAllowedSessionsLocal,
    showMetrics,
    toggleMetrics: () => {
      setShowMetrics((previous) => {
        const next = !previous;
        writeStoredBoolean('solverMetricsExpanded', next);
        return next;
      });
    },
    showLiveViz,
    toggleLiveViz: () => {
      setShowLiveViz((previous) => {
        const next = !previous;
        writeStoredBoolean('solverLiveVizEnabled', next);
        return next;
      });
    },
    liveVizPluginId,
    handleLiveVizPluginChange: (id: string) => {
      setLiveVizPluginId(id);
      writeStoredString('solverLiveVizPlugin', id);
    },
    showCancelConfirm,
    setShowCancelConfirm,
    liveVizState,
    runScenarioSnapshotRef,
    handleSettingsChange,
    handleSelectSolverFamily,
    handleStartSolver,
    handleCancelDiscard,
    handleCancelSave,
    handleSaveBestSoFar,
    handleResetSolver,
    handleAutoSetSettings,
    getLiveVizScenario,
  };
}
