import React, { useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { useAppStore } from '../store';
import type { Scenario, SolverSettings } from '../types';
import { SettingsPanel } from './SolverPanel/index';
import { SolverStatusCard } from './SolverPanel/SolverStatusCard';
import { SolverCancelModal } from './SolverPanel/SolverCancelModal';
import { SolverAlgorithmInfo } from './SolverPanel/SolverAlgorithmInfo';
import type { SolverFormInputs } from './SolverPanel/types';
import { useSolverActions } from './SolverPanel/hooks/useSolverActions';

export function SolverPanel() {
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
  const currentScenarioId = useAppStore((state) => state.currentScenarioId);
  const savedScenarios = useAppStore((state) => state.savedScenarios);
  const warmStartResultId = useAppStore((state) => state.ui.warmStartResultId);
  const setWarmStartFromResult = useAppStore((state) => state.setWarmStartFromResult);

  const [warmStartSelection, setWarmStartSelection] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMetrics, setShowMetrics] = useState<boolean>(() => {
    try {
      return localStorage.getItem('solverMetricsExpanded') === 'true';
    } catch {
      return false;
    }
  });

  const toggleMetrics = () => {
    setShowMetrics((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('solverMetricsExpanded', String(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  };

  const [showLiveViz, setShowLiveViz] = useState<boolean>(() => {
    try {
      return localStorage.getItem('solverLiveVizEnabled') === 'true';
    } catch {
      return false;
    }
  });
  const showLiveVizRef = useRef(showLiveViz);
  React.useEffect(() => {
    showLiveVizRef.current = showLiveViz;
  }, [showLiveViz]);

  const toggleLiveViz = () => {
    setShowLiveViz((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('solverLiveVizEnabled', String(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  };

  const [liveVizPluginId, setLiveVizPluginId] = useState<string>(() => {
    try {
      return localStorage.getItem('solverLiveVizPlugin') || 'scheduleMatrix';
    } catch {
      return 'scheduleMatrix';
    }
  });

  const handleLiveVizPluginChange = (id: string) => {
    setLiveVizPluginId(id);
    try {
      localStorage.setItem('solverLiveVizPlugin', id);
    } catch {
      // Ignore localStorage errors
    }
  };

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [desiredRuntimeMain, setDesiredRuntimeMain] = useState<number | null>(3);
  const [desiredRuntimeSettings, setDesiredRuntimeSettings] = useState<number>(3);

  const [solverFormInputs, setSolverFormInputs] = useState<SolverFormInputs>({});

  const getDefaultSolverSettings = (): SolverSettings => ({
    solver_type: 'SimulatedAnnealing',
    stop_conditions: {
      max_iterations: 10000,
      time_limit_seconds: 30,
      no_improvement_iterations: 5000,
    },
    solver_params: {
      SimulatedAnnealing: {
        initial_temperature: 1.0,
        final_temperature: 0.01,
        cooling_schedule: 'geometric',
        reheat_cycles: 0,
        reheat_after_no_improvement: 0,
      },
    },
    logging: {
      log_frequency: 1000,
      log_initial_state: true,
      log_duration_and_score: true,
      display_final_schedule: true,
      log_initial_score_breakdown: true,
      log_final_score_breakdown: true,
      log_stop_condition: true,
      debug_validate_invariants: false,
      debug_dump_invariant_context: false,
    },
  });

  const solverSettings = scenario?.settings || getDefaultSolverSettings();
  const [allowedSessionsLocal, setAllowedSessionsLocal] = useState<number[] | null>(null);

  const handleSettingsChange = (newSettings: Partial<SolverSettings>) => {
    if (scenario && currentScenarioId) {
      const updatedScenario = {
        ...scenario,
        settings: {
          ...solverSettings,
          ...newSettings,
          ...(newSettings.solver_params && {
            solver_params: {
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
    }
  };

  const formatIterationTime = (ms: number): string => {
    if (ms >= 1) {
      return `${ms.toFixed(2)} ms`;
    }
    const us = ms * 1000;
    if (us >= 1) {
      return `${us.toFixed(2)} µs`;
    }
    const ns = us * 1000;
    return `${ns.toFixed(2)} ns`;
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
    if (!base) return null;
    return {
      ...base,
      settings: runSettings || solverSettings,
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Solver
          </h2>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
            Run the optimization algorithm to find the best solution
          </p>
        </div>
      </div>

      <SolverStatusCard
        solverState={solverState}
        scenario={scenario}
        runtime={{
          solverFormInputs,
          setSolverFormInputs,
          desiredRuntimeMain,
          setDesiredRuntimeMain,
        }}
        actions={{
          onStartSolver: handleStartSolver,
          onCancelSolver: () => setShowCancelConfirm(true),
          onSaveBestSoFar: handleSaveBestSoFar,
          onResetSolver: handleResetSolver,
        }}
        liveViz={{
          displaySettings,
          showLiveViz,
          onToggleLiveViz: toggleLiveViz,
          liveVizState,
          liveVizPluginId,
          onLiveVizPluginChange: handleLiveVizPluginChange,
          getLiveVizScenario,
        }}
        metrics={{
          showMetrics,
          onToggleMetrics: toggleMetrics,
          formatIterationTime,
        }}
      />

      <button
        onClick={() => setShowSettings(!showSettings)}
        className="btn-secondary flex items-center space-x-2 min-w-fit"
      >
        <Settings className="h-5 w-5 flex-shrink-0" />
        <span>Solve with Custom Settings</span>
      </button>

      {showSettings && (
        <SettingsPanel
          solverSettings={solverSettings}
          solverFormInputs={solverFormInputs}
          setSolverFormInputs={setSolverFormInputs}
          handleSettingsChange={handleSettingsChange}
          isRunning={solverState.isRunning}
          desiredRuntimeSettings={desiredRuntimeSettings}
          setDesiredRuntimeSettings={setDesiredRuntimeSettings}
          onAutoSetSettings={handleAutoSetSettings}
          onStartSolver={handleStartSolver}
          scenario={scenario}
          savedScenarios={savedScenarios}
          currentScenarioId={currentScenarioId}
          warmStartSelection={warmStartSelection}
          setWarmStartSelection={setWarmStartSelection}
          setWarmStartFromResult={setWarmStartFromResult}
          allowedSessionsLocal={allowedSessionsLocal}
          setAllowedSessionsLocal={setAllowedSessionsLocal}
        />
      )}

      <SolverCancelModal
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onDiscard={handleCancelDiscard}
        onSave={handleCancelSave}
      />

      <SolverAlgorithmInfo displaySettings={displaySettings} />
    </div>
  );
}
